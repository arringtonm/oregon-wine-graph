<script setup lang="ts">
import cytoscape, { type Core, type ElementDefinition, type StylesheetJson } from 'cytoscape'
import fcose from 'cytoscape-fcose'
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { edgeLabel, formatYears, nodeYears, rememberCollapsed, useGraph } from '../composables/useGraph'
import { EDGE_RULES, NODE_TYPES } from '../data/schema'
import savedLayoutFile from '../data/layout.json'
import { iconDataUri } from '../graph/icons'
import { sizeTiers } from '../graph/nodeSize'
import { coverage, placeNear, toSaved, type Point, type SavedLayout } from '../graph/placement'
import { removeOverlaps } from '../graph/removeOverlaps'
import {
  DropdownMenuContent,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuRoot,
  DropdownMenuTrigger,
  ToggleGroupItem,
  ToggleGroupRoot,
} from 'reka-ui'
import Chevron from './Chevron.vue'
import ControlsGuide from './ControlsGuide.vue'
import GraphList from './GraphList.vue'
import NodeGlyph from './NodeGlyph.vue'
import SearchBox from './SearchBox.vue'
import Tip from './Tip.vue'

cytoscape.use(fcose)

// Questions need the dev server, where the decision model's key lives; the production build
// leaves the whole component out
const AskPopover = import.meta.env.DEV ? defineAsyncComponent(() => import('./AskPopover.vue')) : null

const {
  state,
  avaParent,
  degree,
  nodeById,
  visibleNodes,
  visibleEdges,
  select,
  resetFilters,
  canGoBack,
  canGoForward,
  goBack,
  goForward,
  goToHistory,
  historyEntries,
  isDefaultView,
} = useGraph()

// The default view's layout, saved from the dev server and shipped with the data, so the
// graph appears without laying it out again (a full layout freezes the page for 1–2s)
const savedLayout = savedLayoutFile as unknown as SavedLayout
// Where each node was last placed, kept per arrangement (plain, or grouped into AVA
// regions), so filters and the regions switch can put nodes back instead of re-laying out
const knownPositions = {
  flat: new Map<string, Point>(Object.entries(savedLayout.positions).map(([id, [x, y]]) => [id, { x, y }])),
  regions: new Map<string, Point>(),
}
const positionsNow = () => knownPositions[state.categories.geography ? 'regions' : 'flat']

const container = ref<HTMLDivElement>()
const historyOpen = ref(false)
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
// Animation length, or none for readers who ask for reduced motion
const motion = (ms: number) => (reducedMotion.matches ? 0 : ms)

// The canvas is one image to assistive technology; its label says what it shows and
// points to the list view, where the same nodes can be reached by keyboard
const canvasLabel = computed(() => {
  const selected = state.selectedId ? nodeById.value.get(state.selectedId) : undefined
  return [
    `Network graph of ${visibleNodes.value.length} people and places and ${visibleEdges.value.length} connections`,
    selected ? `${selected.name} is selected` : '',
    'Use List view to browse it by keyboard',
  ]
    .filter(Boolean)
    .join('. ')
})

// The menu closes itself on choosing; focus goes on to the chosen node's details rather
// than back to the History button
let choseFromHistory = false
function onHistoryClosed(event: Event) {
  if (choseFromHistory) event.preventDefault()
  choseFromHistory = false
}

function chooseFromHistory(index: number) {
  choseFromHistory = true
  goToHistory(index)
  state.focusDetailsRequest++
}
const tooltip = reactive({ show: false, x: 0, y: 0, title: '', detail: '' })
let cy: Core | undefined
let layout: cytoscape.Layouts | undefined
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')
// Matches the breakpoint where the detail panel becomes a bottom sheet
const compactQuery = window.matchMedia('(max-width: 1024px)')

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

// Cytoscape draws to a canvas, so theme tokens are resolved to values here
const NODE_COLOUR_TOKENS: Partial<Record<string, string>> = {
  person: '--node-person',
  winery: '--node-winery',
  vineyard: '--node-vineyard',
}
const nodeColour = (type: string) => token(NODE_COLOUR_TOKENS[type] ?? '--node-neutral')

// Labels are drawn on the canvas in the app's typeface; see waitForFonts
const LABEL_FONT = '"Nunito Variable", system-ui, -apple-system, "Segoe UI", sans-serif'

function buildStyle(): StylesheetJson {
  const surface = token('--surface')
  const ink = token('--text-primary')
  const neutral = token('--node-neutral')
  return [
    {
      selector: 'node',
      style: {
        width: 'data(size)',
        height: 'data(size)',
        // Hubs are drawn over the nodes and labels around them
        // Cytoscape's types reject data() mappers for z-index, though it supports them
        'z-index': 'data(z)' as unknown as number,
        // Each node is its type's silhouette, drawn as an image on a transparent circle; the
        // circle is what lines meet and what takes clicks
        shape: 'ellipse',
        'background-opacity': 0,
        'background-fit': 'contain',
        'background-clip': 'none',
        'border-width': 0,
        label: 'data(label)',
        color: ink,
        'font-size': 'data(fontSize)',
        'font-family': LABEL_FONT,
        'text-valign': 'bottom',
        'text-margin-y': 4,
        'text-outline-color': surface,
        'text-outline-width': 2,
        'text-wrap': 'wrap',
        'text-max-width': '120px',
        'min-zoomed-font-size': 12,
      },
    },
    // People and places outside Oregon have a dashed ring drawn into their image
    ...NODE_TYPES.flatMap((type) => [false, true].map((outside) => ({
      selector: `node[type = "${type}"]${outside ? '[?outside]' : '[!outside]'}`,
      style: { 'background-image': iconDataUri(type, nodeColour(type), { outside }) },
    }))),
    {
      selector: 'edge',
      style: {
        // With nearly two thousand lines, full-strength edges bury the nodes; they recede
        // until a node is selected or a line is hovered
        width: 1,
        'line-opacity': 0.8,
        'line-color': token('--edge'),
        'target-arrow-color': token('--edge'),
        // At rest, the cheapest lines Cytoscape draws: straight, no arrowheads. Lines are
        // most of each frame's cost; this cut it by about a quarter. A selected node's lines
        // (and a hovered one) curve apart, point their way and carry labels, below
        'curve-style': 'haystack',
        'haystack-radius': 0,
        'target-arrow-shape': 'none',
        'arrow-scale': 0.6,
        'font-size': 9,
        'font-family': LABEL_FONT,
        color: token('--text-secondary'),
        'text-rotation': 'autorotate',
        'text-background-color': surface,
        'text-background-opacity': 0.9,
        'text-background-padding': '2px',
      },
    },
    { selector: 'edge[category = "people"]', style: { 'line-style': 'dashed' } },
    { selector: 'edge[category = "geography"]', style: { 'line-style': 'dotted' } },
    {
      selector: ':parent',
      style: {
        shape: 'round-rectangle',
        'background-image': 'none',
        'background-color': neutral,
        'background-opacity': 0.07,
        'border-width': 1,
        'border-style': 'dashed',
        'border-color': neutral,
        padding: '24px',
        label: 'data(label)',
        'text-valign': 'top',
        'text-halign': 'center',
        'text-margin-y': -6,
        'font-size': 14,
        color: token('--text-secondary'),
      },
    },
    { selector: '.dimmed', style: { opacity: 0.15 } },
    // A soft disc behind the selected node's silhouette
    {
      selector: 'node.selected',
      style: { 'underlay-color': token('--accent'), 'underlay-opacity': 0.35, 'underlay-padding': 8, 'underlay-shape': 'ellipse' },
    },
    {
      selector: 'edge.highlighted, edge.hovered',
      style: {
        label: 'data(label)',
        width: 2.5,
        'line-opacity': 1,
        'line-color': ink,
        'target-arrow-color': ink,
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier',
        'control-point-step-size': 55,
      },
    },
  ]
}

function buildElements(): ElementDefinition[] {
  // Sizes come in five tiers, ranked among the nodes showing, so each view's best-connected
  // nodes are its largest. Ranking uses connection counts from the full data, not just the
  // lines showing, so a node's standing doesn't flicker as filters change
  const tiers = sizeTiers(new Map(visibleNodes.value.map((node) => [node.id, degree.value.get(node.id) ?? 0])))
  // With the geography layer on, vineyards sit inside a region for their AVA (nested AVAs
  // inside their parents) instead of being joined to AVA nodes by lines. Wineries stay
  // outside; any "located in" they have is still drawn as a line to the region.
  const regions = state.categories.geography
  const shown = new Set(visibleNodes.value.map((node) => node.id))
  const parentFor = (id: string) => {
    const parent = regions ? avaParent.value.get(id) : undefined
    return parent && shown.has(parent) ? parent : undefined
  }
  // Parents must exist before their members are added
  const depth = (id: string): number => {
    const parent = parentFor(id)
    return parent ? 1 + depth(parent) : 0
  }
  const ordered = [...visibleNodes.value].sort(
    (a, b) => Number(b.type === 'ava') - Number(a.type === 'ava') || depth(a.id) - depth(b.id),
  )
  return [
    ...ordered.map((node) => ({
      group: 'nodes' as const,
      data: {
        id: node.id,
        parent: parentFor(node.id),
        label: node.name,
        type: node.type,
        outside: node.outsideOregon === true,
        size: tiers.get(node.id)!.size,
        // Well-connected nodes get larger labels, so they stay readable when zoomed out while
        // the labels of minor nodes drop out below min-zoomed-font-size
        fontSize: tiers.get(node.id)!.fontSize,
        z: degree.value.get(node.id) ?? 0,
      },
    })),
    ...visibleEdges.value
      // Drop only the lines that containment already shows
      .filter((edge) => !(regions && EDGE_RULES[edge.type].category === 'geography' && parentFor(edge.source) === edge.target))
      .map((edge) => ({
        group: 'edges' as const,
        data: {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          category: EDGE_RULES[edge.type].category,
          label: [edgeLabel(edge), formatYears(edge)].filter(Boolean).join(' · '),
        },
      })),
  ]
}

// Fit the whole graph in view. A small graph would otherwise be fitted at a
// zoom that makes nodes enormous, so the zoom is capped.
// The part of the canvas not covered by the sidebars (which float over the graph on wide
// screens) or the toolbar, in rendered pixels
function visibleArea() {
  const canvas = container.value!.getBoundingClientRect()
  const covered = (id: string) => {
    const element = document.getElementById(id)
    if (!element || compactQuery.matches || element.offsetParent === null) return null
    return element.getBoundingClientRect()
  }
  const filters = covered('filters')
  const details = covered('details')
  const left = filters ? Math.max(0, filters.right - canvas.left) : 0
  const right = details ? Math.max(0, canvas.right - details.left) : 0
  // Below the toolbar (itself below the floating header), however many rows it wraps to
  const toolbar = container.value!.parentElement?.querySelector('.graph-canvas__toolbar')?.getBoundingClientRect()
  const top = Math.max(0, (toolbar ? toolbar.bottom : canvas.top) - canvas.top) + 8
  return { left, top, width: Math.max(1, canvas.width - left - right), height: Math.max(1, canvas.height - top) }
}

// The opening view (first load, and Reset) is a little closer than a full fit; Fit shows
// everything. Set until the opening view has been framed once
const OPENING_ZOOM = 1.25
let opening = true

function fitOpening() {
  fit(opening ? OPENING_ZOOM : 1)
  opening = false
}

// The Fit button: the same framing, but gliding there rather than jumping
function fitAnimated() {
  if (!cy) return
  const from = { zoom: cy.zoom(), pan: { ...cy.pan() } }
  fit()
  const to = { zoom: cy.zoom(), pan: { ...cy.pan() } }
  if (reducedMotion.matches) return
  cy.viewport(from)
  cy.animate(to, { duration: 300, easing: 'ease-in-out-cubic' })
}

function fit(closer = 1) {
  if (!cy) return
  // Re-read the container's size: with a saved layout the first fit happens straight after
  // mounting, before Cytoscape's cached size is current
  cy.resize()
  const area = visibleArea()
  const padding = 40
  const box = cy.elements().boundingBox()
  if (box.w === 0 || box.h === 0) return
  const zoom = Math.max(
    cy.minZoom(),
    Math.min(1.25, cy.maxZoom(), (closer * (area.width - 2 * padding)) / box.w, (closer * (area.height - 2 * padding)) / box.h),
  )
  // Centre the graph in the visible area, not the whole canvas
  cy.viewport({
    zoom,
    pan: {
      x: area.left + area.width / 2 - (box.x1 + box.w / 2) * zoom,
      y: area.top + area.height / 2 - (box.y1 + box.h / 2) * zoom,
    },
  })
}

// Zooms about the middle of what is visible between the sidebars
function zoomBy(factor: number) {
  if (!cy) return
  const area = visibleArea()
  cy.zoom({
    level: cy.zoom() * factor,
    renderedPosition: { x: area.left + area.width / 2, y: area.top + area.height / 2 },
  })
}

// + and − on the keyboard do what the zoom buttons do; ignored while typing, and with
// ⌘, Ctrl or Alt held, which the browser uses for zooming the page
function onZoomKey(event: KeyboardEvent) {
  if (state.listView || event.metaKey || event.ctrlKey || event.altKey) return
  if ((event.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]')) return
  const factor = event.key === '+' || event.key === '=' ? 1.3 : event.key === '-' || event.key === '_' ? 1 / 1.3 : 0
  if (!factor) return
  event.preventDefault()
  zoomBy(factor)
}

// Two-finger scrolling moves the graph; pinching (which browsers report as a
// wheel event with ctrlKey) or Ctrl/Cmd + wheel zooms about the pointer.
// Dragging alone is unreliable in a dense graph because it picks up nodes.
function onWheel(event: WheelEvent) {
  if (!cy) return
  event.preventDefault()
  event.stopImmediatePropagation()
  const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1
  if (event.ctrlKey || event.metaKey) {
    const bounds = container.value!.getBoundingClientRect()
    cy.zoom({
      level: cy.zoom() * Math.exp(-event.deltaY * unit * 0.01),
      renderedPosition: { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
    })
  } else {
    cy.panBy({ x: -event.deltaX * unit, y: -event.deltaY * unit })
  }
}

// Back to the starting view: default filters, nothing selected, fresh layout
async function reset() {
  opening = true
  resetFilters()
  select(null)
  await nextTick()
  runLayout(true)
}

// A full layout blocks the page for a second or two. The overlay is painted first (two
// frames, or a short timeout where frames don't run, as in a background tab), so it shows
// while the layout runs; its dots animate on the compositor, unaffected by the busy page
const arranging = ref(false)
const nextPaint = () =>
  Promise.race([
    new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
    new Promise<void>((done) => setTimeout(done, 60)),
  ])

async function runLayout(randomize: boolean) {
  if (!cy) return
  layout?.stop()
  if (randomize) {
    arranging.value = true
    await nextPaint()
  }
  layoutNow(randomize)
}

function layoutNow(randomize: boolean) {
  if (!cy) return
  layout = cy.layout({
    name: 'fcose',
    // 'proof' quality blocked the page for nearly three seconds on the full graph
    quality: 'default',
    randomize,
    animate: !randomize && !reducedMotion.matches,
    animationDuration: 400,
    // Measured on the full graph: counting labels as part of each node's size and pushing
    // nodes harder apart cut overlapping labels from about 1,700 pairs to about 300
    nodeDimensionsIncludeLabels: true,
    // Bigger nodes push harder, so hubs keep clear room around them. With size-scaled
    // repulsion, overlapping labels fell from about 640 to about 400 on the full graph.
    // AVA regions are excluded: scaled by their own width they balloon to twice the size
    nodeRepulsion: (node: cytoscape.NodeSingular) =>
      node.isParent() ? 120000 : 120000 * Math.max(1, node.width() / 22),
    // A minor node's connections are short, so it sits beside its hub; lines between hubs
    // are long, leaving room for each hub's own cluster. Measured against a fixed 220:
    // about 10% fewer overlapping labels and a quarter less layout time
    idealEdgeLength: (edge: cytoscape.EdgeSingular) =>
      90 + 50 * Math.sqrt(Math.max(1, Math.min(edge.source().degree(false), edge.target().degree(false)))),
    gravity: 0.04,
    nodeSeparation: 120,
    // fcose packs nodes without connections into a square grid by default. Filters such as
    // verified-only leave hundreds of nodes unconnected, and the grid then outlived the
    // filter. Let forces place them instead, like every other node.
    tile: false,
    // Pull members of an AVA region together. Without this a region's vineyards drift
    // towards their wineries all over the graph and the region grows to enclose them:
    // Dundee Hills measured about 9,000 by 12,000 units, against 1,900 by 1,500 with it
    gravityCompound: 8,
    gravityRangeCompound: 0.3,
    nestingFactor: 0.05,
    padding: 40,
  } as cytoscape.LayoutOptions)
  layout.one('layoutstop', () => {
    separateNodes()
    if (randomize) saveLayout()
    fitOpening()
    centerOnSelection()
    arranging.value = false
  })
  layout.run()
}

// The force layout spaces nodes out on average but leaves some nodes and labels on top of
// each other; nudge those apart, moving well-connected nodes least
function separateNodes() {
  if (!cy) return
  const nodes = cy.nodes().filter((node) => node.isChildless())
  const boxes = nodes.map((node: cytoscape.NodeSingular) => {
    const box = node.boundingBox({ includeLabels: true })
    return {
      id: node.id(),
      x: (box.x1 + box.x2) / 2,
      y: (box.y1 + box.y2) / 2,
      width: box.w,
      height: box.h,
      weight: 1 + node.degree(false),
    }
  })
  const { moves } = removeOverlaps(boxes)
  cy.batch(() => {
    for (const [id, { dx, dy }] of moves) {
      const node = cy!.getElementById(id)
      const position = node.position()
      node.position({ x: position.x + dx, y: position.y + dy })
    }
  })
  rememberPositions()
}

const plainNodes = () => cy!.nodes().filter((node) => node.isChildless())

// Desktop: hide or show the search and filters sidebar. The graph pans by half the
// sidebar's width, so what was centred in view stays centred
function toggleSidebar() {
  const width = document.getElementById('filters')?.getBoundingClientRect().width ?? 0
  state.filtersCollapsed = !state.filtersCollapsed
  rememberCollapsed(state.filtersCollapsed)
  if (cy && width) cy.animate({ panBy: { x: (state.filtersCollapsed ? -width : width) / 2, y: 0 } }, { duration: motion(220) })
}

function rememberPositions() {
  if (!cy) return
  const known = positionsNow()
  plainNodes().forEach((node: cytoscape.NodeSingular) => void known.set(node.id(), { ...node.position() }))
}

// Dev server only: save the default view's fresh layout so it ships with the data
function saveLayout() {
  if (!cy || !import.meta.env.DEV || !isDefaultView.value || state.categories.geography) return
  const positions = new Map(plainNodes().map((node: cytoscape.NodeSingular) => [node.id(), node.position()] as [string, Point]))
  fetch('/__layout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(toSaved(positions)),
  }).catch(() => {})
}

// Puts the given nodes where they were last placed, or beside the nodes they connect to.
// Returns false, placing nothing, when more than `maxNew` of the showing nodes would be
// new: too many to place sensibly, so a full layout should run instead.
function placeNodes(ids: string[], maxNew = 0.1): boolean {
  const known = positionsNow()
  const unknown = ids.filter((id) => !known.has(id))
  if (unknown.length > plainNodes().length * maxNew) return false
  const moving = new Set(ids)
  // Anchors: nodes already in place, and the returning nodes at their old positions
  const anchors = new Map<string, Point>()
  plainNodes().forEach((node: cytoscape.NodeSingular) => {
    if (!moving.has(node.id())) anchors.set(node.id(), { ...node.position() })
  })
  for (const id of ids) if (known.has(id)) anchors.set(id, known.get(id)!)
  const points = [...anchors.values()]
  const centre = points.length
    ? { x: points.reduce((sum, p) => sum + p.x, 0) / points.length, y: points.reduce((sum, p) => sum + p.y, 0) / points.length }
    : { x: 0, y: 0 }
  const fresh = placeNear(
    unknown,
    (id) => cy!.getElementById(id).neighborhood('node').map((node) => node.id()),
    anchors,
    centre,
  )
  cy!.batch(() => {
    for (const id of ids) cy!.getElementById(id).position(anchors.get(id) ?? fresh.get(id) ?? centre)
  })
  return true
}

// Whether the last sync showed AVA regions, to tell a switch of arrangement from a filter change
let lastRegions: boolean | undefined

// Add and remove only what changed, so nodes keep their places. Only the first view with no
// saved layout, Reset, and changes that bring in many never-placed nodes run a full layout.
function syncElements() {
  if (!cy) return
  const wanted = buildElements()
  const wantedIds = new Set(wanted.map((element) => element.data.id))
  const firstRender = cy.elements().empty()
  const added: string[] = []
  const regrouped = lastRegions !== undefined && lastRegions !== state.categories.geography
  lastRegions = state.categories.geography
  let resized = false
  cy.batch(() => {
    const stale = cy!.elements().filter((element) => !wantedIds.has(element.id()))
    // Removing a region box would take its vineyards with it; move them out first so they
    // stay the same elements, in place
    stale.filter((element) => element.isNode() && element.isParent()).children().move({ parent: null })
    stale.remove()
    for (const element of wanted) {
      const existing = cy!.getElementById(element.data.id!)
      if (existing.empty()) {
        cy!.add(element)
        if (element.group === 'nodes') added.push(element.data.id!)
      } else if (element.group === 'nodes' && existing.data('size') !== element.data.size) {
        // Filters re-rank the nodes showing, so a node kept in view can change tier
        existing.data({ size: element.data.size, fontSize: element.data.fontSize })
        resized = true
      }
      if (existing.nonempty() && element.group === 'nodes' && (existing.data('parent') ?? undefined) !== element.data.parent) {
        // Turning AVA regions on or off moves nodes into or out of them
        existing.move({ parent: element.data.parent ?? null })
      }
    }
  })
  const plain = (ids: string[]) => ids.filter((id) => cy!.getElementById(id).isChildless())

  if (firstRender) {
    const ids = plainNodes().map((node) => node.id())
    const usable = !state.categories.geography && coverage(savedLayout, ids) >= 0.9
    if (usable && placeNodes(ids)) {
      // Nodes added since the layout was saved may collide with their neighbours
      if (ids.some((id) => !(id in savedLayout.positions))) {
        separateNodes()
        saveLayout()
      }
      rememberPositions()
      fitOpening()
      centerOnSelection()
    } else {
      runLayout(true)
    }
  } else if (regrouped) {
    // Each arrangement keeps its own positions; a fresh layout only the first time
    if (placeNodes(plainNodes().map((node) => node.id()), 0)) fit()
    else runLayout(true)
  } else if (added.length > 0) {
    if (placeNodes(plain(added))) separateNodes()
    else runLayout(true)
  } else if (resized) {
    // Nodes that grew may now overlap their neighbours
    separateNodes()
  }
  applySelection()
}

function applySelection() {
  if (!cy) return
  cy.elements().removeClass('dimmed selected highlighted')
  const selected = state.selectedId ? cy.getElementById(state.selectedId) : cy.collection()
  if (selected.empty()) return
  selected.addClass('selected')
  selected.connectedEdges().addClass('highlighted')
  // A selected AVA region keeps its member vineyards, nested regions, and what those
  // connect to in view, as well as its own connections
  const focus = selected.union(selected.descendants())
  const kept = focus.closedNeighborhood().union(focus).union(focus.ancestors())
  cy.elements().difference(kept).addClass('dimmed')
}

function centerOnSelection() {
  if (!cy || !state.selectedId) return
  const selected = cy.getElementById(state.selectedId)
  if (selected.empty()) return
  // An AVA region is shown whole, framed with its members
  if (selected.isParent()) {
    cy.animate({ fit: { eles: selected, padding: 60 } }, { duration: motion(300) })
    return
  }
  if (compactQuery.matches) {
    // The detail sheet covers the lower part of the graph, so aim above it
    const rendered = selected.renderedPosition()
    cy.animate(
      { panBy: { x: cy.width() / 2 - rendered.x, y: cy.height() * 0.28 - rendered.y } },
      { duration: motion(300) },
    )
    return
  }
  // Brought into view only if it is hidden, behind a sidebar or off screen
  const area = visibleArea()
  const rendered = selected.renderedPosition()
  const inside =
    rendered.x >= area.left && rendered.x <= area.left + area.width && rendered.y >= area.top && rendered.y <= area.top + area.height
  if (!inside) {
    cy.animate(
      { panBy: { x: area.left + area.width / 2 - rendered.x, y: area.top + area.height / 2 - rendered.y } },
      { duration: motion(300) },
    )
  }
}

function applyTheme() {
  cy?.style(buildStyle())
}

onMounted(() => {
  cy = cytoscape({
    container: container.value,
    style: buildStyle(),
    // Low enough to fit the whole graph in the space between the sidebars
    minZoom: 0.08,
    maxZoom: 3,
  })
  // Exposed on the dev server for measuring layouts from the browser console
  if (import.meta.env.DEV) Object.assign(window, { __cy: cy, __knownPositions: knownPositions })

  cy.on('tap', (event) => {
    state.filtersOpen = false
    historyOpen.value = false
    if (event.target === cy) select(null)
  })
  cy.on('tap', 'node', (event) => select(event.target.id()))
  // A node dragged somewhere stays there when filters hide and restore it
  cy.on('dragfree', 'node', (event) => void positionsNow().set(event.target.id(), { ...event.target.position() }))
  cy.on('mouseover', 'node', (event) => {
    const node = nodeById.value.get(event.target.id())
    if (!node) return
    const position = event.target.renderedPosition()
    tooltip.title = node.name
    tooltip.detail = [nodeYears(node), node.place].filter(Boolean).join(' · ')
    tooltip.x = position.x
    tooltip.y = position.y - event.target.renderedHeight() / 2 - 8
    tooltip.show = true
  })
  cy.on('mouseout', 'node', () => (tooltip.show = false))
  cy.on('viewport', () => (tooltip.show = false))
  cy.on('mouseover', 'edge', (event) => event.target.addClass('hovered'))
  cy.on('mouseout', 'edge', (event) => event.target.removeClass('hovered'))

  // Capture phase, so this runs instead of Cytoscape's own wheel-to-zoom handler
  container.value!.addEventListener('wheel', onWheel, { capture: true, passive: false })
  darkQuery.addEventListener('change', applyTheme)
  document.addEventListener('keydown', onZoomKey)
  waitForFonts().then(syncElements)
})

// Label sizes feed the layout and the overlap pass, and the saved layout was measured in
// Nunito; measured in a fallback font, labels would collide once Nunito arrived
async function waitForFonts() {
  try {
    await Promise.all([document.fonts.load('400 12px "Nunito Variable"'), document.fonts.load('700 12px "Nunito Variable"')])
  } catch {
    // Without the font, labels are measured in the fallback, as they are drawn
  }
}

onBeforeUnmount(() => {
  container.value?.removeEventListener('wheel', onWheel, { capture: true })
  darkQuery.removeEventListener('change', applyTheme)
  document.removeEventListener('keydown', onZoomKey)
  cy?.destroy()
})

watch([visibleNodes, visibleEdges], syncElements)
watch(
  () => state.selectedId,
  () => {
    applySelection()
    centerOnSelection()
  },
)
</script>

<template>
  <div class="graph-canvas">
    <div
      ref="container"
      class="graph-canvas__stage"
      role="img"
      :aria-label="canvasLabel"
      :aria-hidden="state.listView ? 'true' : undefined"
    ></div>
    <GraphList v-if="state.listView" class="graph-canvas__list" />
    <div v-show="tooltip.show && !state.listView" class="graph-canvas__tooltip" aria-hidden="true" :style="{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }">
      <strong>{{ tooltip.title }}</strong>
      <span v-if="tooltip.detail">{{ tooltip.detail }}</span>
    </div>
    <ControlsGuide v-show="!state.listView" />
    <div v-if="arranging && !state.listView" class="graph-canvas__arranging" role="status">
      <span class="graph-canvas__arranging-card">
        <span class="graph-canvas__dots" aria-hidden="true"><i></i><i></i><i></i></span>
        Arranging the graph…
      </span>
    </div>
    <div class="graph-canvas__toolbar" role="group" aria-label="Graph navigation">
      <Tip :label="state.filtersCollapsed ? 'Show filters' : 'Hide filters'">
        <button
          id="sidebar-toggle"
          type="button"
          class="graph-canvas__sidebar-toggle"
          aria-label="Filters"
          aria-controls="filters"
          :aria-expanded="!state.filtersCollapsed"
          @click="toggleSidebar"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <rect x="2.5" y="3.5" width="15" height="13" rx="2.5" />
            <path d="M7.5 3.5v13" />
            <path v-if="state.filtersCollapsed" d="m11 8 2 2-2 2" />
            <path v-else d="m13 8-2 2 2 2" />
          </svg>
        </button>
      </Tip>
      <button
        id="filters-toggle"
        type="button"
        class="graph-canvas__filters"
        aria-controls="filters"
        :aria-expanded="state.filtersOpen"
        @click="state.filtersOpen = !state.filtersOpen"
      >
        Filters
      </button>
      <SearchBox />
      <AskPopover v-if="AskPopover" />
      <div class="graph-canvas__group">
        <Tip label="Back to the previous selection">
          <button type="button" aria-label="Back" :disabled="!canGoBack" @click="goBack">
            <span aria-hidden="true">‹</span>
          </button>
        </Tip>
        <Tip label="Forward to the next selection">
          <button type="button" aria-label="Forward" :disabled="!canGoForward" @click="goForward">
            <span aria-hidden="true">›</span>
          </button>
        </Tip>
        <DropdownMenuRoot v-model:open="historyOpen" :modal="false">
          <DropdownMenuTrigger as-child>
            <button id="history-toggle" type="button" class="graph-canvas__history-toggle" :disabled="historyEntries.length === 0">
              History<Chevron />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuPortal>
            <DropdownMenuContent
              class="graph-canvas__history"
              align="start"
              :side-offset="4"
              aria-label="Selection history, most recent first"
              @close-auto-focus="onHistoryClosed"
            >
              <!-- The current selection reads as the checked entry -->
              <DropdownMenuRadioGroup :model-value="String(state.historyIndex)">
                <DropdownMenuRadioItem
                  v-for="{ index, node } in historyEntries"
                  :key="index"
                  :value="String(index)"
                  class="graph-canvas__history-item"
                  @select="chooseFromHistory(index)"
                >
                  <NodeGlyph :type="node.type" />
                  {{ node.name }}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenuRoot>
      </div>
      <ToggleGroupRoot
        type="single"
        class="graph-canvas__view"
        :data-view="state.listView ? 'list' : 'graph'"
        aria-label="View"
        :model-value="state.listView ? 'list' : 'graph'"
        @update:model-value="(view) => view && (state.listView = view === 'list')"
      >
        <ToggleGroupItem value="graph">Graph</ToggleGroupItem>
        <ToggleGroupItem value="list">List</ToggleGroupItem>
      </ToggleGroupRoot>
      <div v-show="!state.listView" class="graph-canvas__group">
        <Tip label="Zoom in">
          <button type="button" aria-label="Zoom in" @click="zoomBy(1.3)"><span aria-hidden="true">+</span></button>
        </Tip>
        <Tip label="Zoom out">
          <button type="button" aria-label="Zoom out" @click="zoomBy(1 / 1.3)"><span aria-hidden="true">−</span></button>
        </Tip>
        <button type="button" aria-describedby="fit-description" @click="fitAnimated">Fit</button>
        <button type="button" aria-describedby="reset-description" @click="reset">Reset</button>
      </div>
      <span id="fit-description" class="visually-hidden">Fit the whole graph in view</span>
      <span id="reset-description" class="visually-hidden">Clear filters and selection, and lay the graph out again</span>
    </div>
  </div>
</template>

<style scoped>
.graph-canvas {
  position: relative;
  min-height: 0;
  background: var(--surface);
}

.graph-canvas__stage {
  position: absolute;
  inset: 0;
}

.graph-canvas__list {
  position: absolute;
  inset: 0 var(--inset-right, 0px) 0 var(--inset-left, 0px);
  padding-top: calc(var(--inset-top, 0px) + 4.5rem);
  overflow-y: auto;
  background: var(--surface);
}

.graph-canvas__tooltip {
  position: absolute;
  transform: translate(-50%, -100%);
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-width: 240px;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-raised);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  font-size: 12px;
  pointer-events: none;
  white-space: nowrap;
}

.graph-canvas__tooltip span {
  color: var(--text-secondary);
}

.graph-canvas__toolbar {
  position: absolute;
  top: calc(var(--inset-top, 0px) + 12px);
  left: calc(var(--inset-left, 0px) + 12px);
  /* Room for the controls guide's button in the top-right corner */
  right: calc(var(--inset-right, 0px) + 9rem);
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  pointer-events: none;
}

.graph-canvas__group {
  display: flex;
}

.graph-canvas__toolbar button {
  min-width: 36px;
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  background: var(--frost);
  -webkit-backdrop-filter: var(--frost-blur);
  backdrop-filter: var(--frost-blur);
  color: inherit;
  font: inherit;
  cursor: pointer;
  pointer-events: auto;
}

.graph-canvas__toolbar button:hover:not(:disabled) {
  background: var(--wash);
  color: var(--text-primary);
}

.graph-canvas__toolbar button:disabled {
  color: var(--text-secondary);
  cursor: default;
  opacity: 0.6;
}

.graph-canvas__toolbar .graph-canvas__history-toggle {
  display: inline-flex;
  align-items: center;
}


/* A switch rather than two buttons: a rounded track with a burgundy thumb that slides
   behind whichever view is on */
.graph-canvas__view {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1fr;
  padding: 3px;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: var(--frost);
  -webkit-backdrop-filter: var(--frost-blur);
  backdrop-filter: var(--frost-blur);
  pointer-events: auto;
}

.graph-canvas__view::before {
  content: '';
  position: absolute;
  top: 3px;
  bottom: 3px;
  left: 3px;
  width: calc(50% - 3px);
  border-radius: 999px;
  background: var(--fill);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
  transition: transform 0.2s ease;
}

.graph-canvas__view[data-view='list']::before {
  transform: translateX(100%);
}

.graph-canvas__toolbar .graph-canvas__view button {
  position: relative;
  height: 28px;
  min-width: 4.25rem;
  padding: 0 0.875rem;
  border: 0;
  border-radius: 999px;
  background: none;
  color: var(--text-secondary);
  font-weight: 600;
  transition: color 0.2s ease;
}

.graph-canvas__toolbar .graph-canvas__view button:hover:not([data-state='on']) {
  background: none;
  color: var(--text-primary);
}

.graph-canvas__toolbar .graph-canvas__view button[data-state='on'] {
  color: var(--on-fill);
}

@media (prefers-reduced-motion: reduce) {
  .graph-canvas__view::before,
  .graph-canvas__toolbar .graph-canvas__view button {
    transition: none;
  }
}

.graph-canvas__toolbar .graph-canvas__sidebar-toggle {
  display: inline-grid;
  place-items: center;
  border-radius: var(--radius);
}

.graph-canvas__sidebar-toggle svg {
  width: 1.25rem;
  height: 1.25rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.graph-canvas__filters {
  display: none;
  border-radius: 6px;
}

/* Buttons in a joined group share borders; the focused one rises above its neighbours so
   its whole focus ring shows */
.graph-canvas__group button:focus-visible,
.graph-canvas__view button:focus-visible {
  position: relative;
  z-index: 1;
}

.graph-canvas__arranging {
  position: absolute;
  z-index: 3;
  inset: var(--inset-top, 0px) var(--inset-right, 0px) 0 var(--inset-left, 0px);
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--page) 25%, transparent);
  -webkit-backdrop-filter: blur(5px);
  backdrop-filter: blur(5px);
}

.graph-canvas__arranging-card {
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.7rem 1.1rem;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: var(--surface-raised);
  box-shadow: var(--shadow);
  font-weight: 600;
}

.graph-canvas__dots {
  display: inline-flex;
  gap: 0.3rem;
}

.graph-canvas__dots i {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--fill);
  animation: graph-canvas-dot 1s ease-in-out infinite;
}

.graph-canvas__dots i:nth-child(2) {
  animation-delay: 0.15s;
}

.graph-canvas__dots i:nth-child(3) {
  animation-delay: 0.3s;
}

/* Opacity and transform only, so the animation runs off the main thread */
@keyframes graph-canvas-dot {
  0%,
  80%,
  100% {
    opacity: 0.3;
    transform: scale(0.7);
  }

  40% {
    opacity: 1;
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .graph-canvas__dots i {
    animation: none;
    opacity: 0.8;
  }
}

.graph-canvas__group button + button {
  border-left: 0;
}

.graph-canvas__group button:first-child {
  border-radius: var(--radius) 0 0 var(--radius);
}

.graph-canvas__group button:last-child {
  border-radius: 0 var(--radius) var(--radius) 0;
}

@media (max-width: 1024px) {
  .graph-canvas__filters {
    display: block;
  }

  /* Tablets use the drawer and its "Search & filters" button instead */
  .graph-canvas__toolbar .graph-canvas__sidebar-toggle {
    display: none;
  }

  .graph-canvas__toolbar button {
    min-width: 40px;
    height: 40px;
  }
}
</style>

<style>
/* The history menu is teleported to the page body, outside this component's scoped styles */
.graph-canvas__history {
  z-index: 40;
  min-width: 16rem;
  max-width: 20rem;
  max-height: min(50vh, 26rem);
  padding: 4px;
  overflow-y: auto;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface-raised);
  box-shadow: var(--shadow);
}

.graph-canvas__history-item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  outline: none;
}

.graph-canvas__history-item[data-highlighted] {
  background: var(--wash);
}

.graph-canvas__history-item[data-state='checked'] {
  font-weight: 700;
}
</style>
