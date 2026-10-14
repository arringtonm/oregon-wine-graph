<script setup lang="ts">
import cytoscape, { type Core, type ElementDefinition, type StylesheetJson } from 'cytoscape'
import fcose from 'cytoscape-fcose'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { edgeLabel, formatYears, nodeYears, useGraph } from '../composables/useGraph'
import { EDGE_RULES, NODE_TYPES } from '../data/schema'
import { iconDataUri } from '../graph/icons'
import { sizeTiers } from '../graph/nodeSize'
import { removeOverlaps } from '../graph/removeOverlaps'
import Chevron from './Chevron.vue'
import ControlsGuide from './ControlsGuide.vue'
import GraphList from './GraphList.vue'
import NodeGlyph from './NodeGlyph.vue'

cytoscape.use(fcose)

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
} = useGraph()

const container = ref<HTMLDivElement>()
const historyOpen = ref(false)
const historyList = ref<HTMLOListElement>()
const historyMenu = ref<HTMLDivElement>()
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

// A press anywhere outside the open history list closes it
function onPointerOutsideHistory(event: PointerEvent) {
  if (!historyMenu.value?.contains(event.target as Node)) closeHistory({ returnFocus: false })
}
watch(historyOpen, (open) => {
  if (open) document.addEventListener('pointerdown', onPointerOutsideHistory)
  else document.removeEventListener('pointerdown', onPointerOutsideHistory)
})
onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointerOutsideHistory))

async function toggleHistory() {
  historyOpen.value = !historyOpen.value
  if (!historyOpen.value) return
  await nextTick()
  // Opening moves focus to the current entry, or the most recent one
  const list = historyList.value
  ;(list?.querySelector<HTMLButtonElement>('[aria-current]') ?? list?.querySelector<HTMLButtonElement>('button'))?.focus()
}

function closeHistory({ returnFocus = true } = {}) {
  historyOpen.value = false
  if (returnFocus) document.getElementById('history-toggle')?.focus()
}

function chooseFromHistory(index: number) {
  goToHistory(index)
  closeHistory({ returnFocus: false })
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
        'font-family': 'system-ui, -apple-system, "Segoe UI", sans-serif',
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
        'target-arrow-shape': 'triangle',
        'arrow-scale': 0.6,
        'curve-style': 'bezier',
        'control-point-step-size': 55,
        'font-size': 9,
        'font-family': 'system-ui, -apple-system, "Segoe UI", sans-serif',
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
      style: { 'underlay-color': ink, 'underlay-opacity': 0.3, 'underlay-padding': 8, 'underlay-shape': 'ellipse' },
    },
    {
      selector: 'edge.highlighted, edge.hovered',
      style: { label: 'data(label)', width: 2.5, 'line-opacity': 1, 'line-color': ink, 'target-arrow-color': ink },
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
function fit() {
  if (!cy) return
  cy.fit(undefined, 40)
  if (cy.zoom() > 1.25) {
    cy.zoom(1.25)
    cy.center()
  }
}

function zoomBy(factor: number) {
  if (!cy) return
  cy.zoom({
    level: cy.zoom() * factor,
    renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
  })
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
  resetFilters()
  select(null)
  await nextTick()
  runLayout(true)
}

function runLayout(randomize: boolean) {
  if (!cy) return
  layout?.stop()
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
    fit()
    centerOnSelection()
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
}

// Add and remove only what changed so existing nodes keep their positions
function syncElements() {
  if (!cy) return
  const wanted = buildElements()
  const wantedIds = new Set(wanted.map((element) => element.data.id))
  const firstRender = cy.elements().empty()
  let changed = false
  let regrouped = false
  let churn = 0
  let resized = false
  cy.batch(() => {
    const stale = cy!.elements().filter((element) => !wantedIds.has(element.id()))
    changed = stale.nonempty()
    churn = stale.length
    stale.remove()
    for (const element of wanted) {
      const existing = cy!.getElementById(element.data.id!)
      if (existing.empty()) {
        cy!.add(element)
        changed = true
        churn++
      } else if (element.group === 'nodes' && existing.data('size') !== element.data.size) {
        // Filters re-rank the nodes showing, so a node kept in view can change tier
        existing.data({ size: element.data.size, fontSize: element.data.fontSize })
        resized = true
      }
      if (existing.nonempty() && element.group === 'nodes' && (existing.data('parent') ?? undefined) !== element.data.parent) {
        // Turning AVA regions on or off moves nodes into or out of them
        existing.move({ parent: element.data.parent ?? null })
        changed = true
        regrouped = true
      }
    }
  })
  // Regions turned on or off need a fresh layout; keeping old positions leaves regions sprawling.
  // So does a large change, such as a filter restoring hundreds of connections: nodes kept
  // where the filter left them end up joined by long lines across the whole graph
  const large = churn > wanted.length * 0.1
  if (changed) runLayout(firstRender || regrouped || large)
  // Nodes that grew without a new layout may now overlap their neighbours
  else if (resized) separateNodes()
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
  const { x1, y1, x2, y2 } = cy.extent()
  const { x, y } = selected.position()
  if (x < x1 || x > x2 || y < y1 || y > y2) {
    cy.animate({ center: { eles: selected } }, { duration: motion(300) })
  }
}

function applyTheme() {
  cy?.style(buildStyle())
}

onMounted(() => {
  cy = cytoscape({
    container: container.value,
    style: buildStyle(),
    minZoom: 0.2,
    maxZoom: 3,
  })
  // Exposed on the dev server for measuring layouts from the browser console
  if (import.meta.env.DEV) Object.assign(window, { __cy: cy })

  cy.on('tap', (event) => {
    state.filtersOpen = false
    historyOpen.value = false
    if (event.target === cy) select(null)
  })
  cy.on('tap', 'node', (event) => select(event.target.id()))
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
  syncElements()
})

onBeforeUnmount(() => {
  container.value?.removeEventListener('wheel', onWheel, { capture: true })
  darkQuery.removeEventListener('change', applyTheme)
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
    <div class="graph-canvas__toolbar" role="group" aria-label="Graph navigation">
      <button
        id="filters-toggle"
        type="button"
        class="graph-canvas__filters"
        aria-controls="filters"
        :aria-expanded="state.filtersOpen"
        @click="state.filtersOpen = !state.filtersOpen"
      >
        Search &amp; filters
      </button>
      <div class="graph-canvas__group">
        <button type="button" aria-label="Back" title="Back to the previous selection" :disabled="!canGoBack" @click="goBack">
          <span aria-hidden="true">‹</span>
        </button>
        <button
          type="button"
          aria-label="Forward"
          title="Forward to the next selection"
          :disabled="!canGoForward"
          @click="goForward"
        >
          <span aria-hidden="true">›</span>
        </button>
        <div ref="historyMenu" class="graph-canvas__history-menu">
          <button
            id="history-toggle"
            type="button"
            aria-controls="history-list"
            :aria-expanded="historyOpen"
            :disabled="historyEntries.length === 0"
            @click="toggleHistory"
          >
            History<Chevron />
          </button>
          <ol
            v-if="historyOpen"
            id="history-list"
            ref="historyList"
            class="graph-canvas__history"
            aria-label="Selection history, most recent first"
            @keydown.escape="closeHistory()"
          >
            <li v-for="{ index, node } in historyEntries" :key="index">
              <button
                type="button"
                :aria-current="index === state.historyIndex ? 'true' : undefined"
                @click="chooseFromHistory(index)"
              >
                <NodeGlyph :type="node.type" />
                {{ node.name }}
              </button>
            </li>
          </ol>
        </div>
      </div>
      <div class="graph-canvas__group graph-canvas__view" role="group" aria-label="View">
        <button type="button" :aria-pressed="!state.listView" @click="state.listView = false">Graph</button>
        <button type="button" :aria-pressed="state.listView" @click="state.listView = true">List</button>
      </div>
      <div v-show="!state.listView" class="graph-canvas__group">
        <button type="button" aria-label="Zoom in" title="Zoom in" @click="zoomBy(1.3)"><span aria-hidden="true">+</span></button>
        <button type="button" aria-label="Zoom out" title="Zoom out" @click="zoomBy(1 / 1.3)"><span aria-hidden="true">−</span></button>
        <button type="button" aria-describedby="fit-description" @click="fit">Fit</button>
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
  inset: 0;
  padding-top: 4.5rem;
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
  top: 12px;
  left: 12px;
  /* Room for the controls guide's button in the top-right corner */
  right: 9rem;
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
  background: var(--surface-raised);
  color: inherit;
  font: inherit;
  cursor: pointer;
  pointer-events: auto;
}

.graph-canvas__toolbar button:hover:not(:disabled) {
  background: var(--surface);
}

.graph-canvas__toolbar button:disabled {
  color: var(--text-secondary);
  cursor: default;
  opacity: 0.6;
}

.graph-canvas__history-menu {
  position: relative;
}

/* The history toggle closes the back/forward group, so it takes that group's right corners */
.graph-canvas__group .graph-canvas__history-menu > button {
  display: inline-flex;
  align-items: center;
  border-left: 0;
  border-radius: 0 6px 6px 0;
}

.graph-canvas__history {
  position: absolute;
  z-index: 5;
  top: calc(100% + 4px);
  left: 0;
  min-width: 16rem;
  max-width: 20rem;
  max-height: min(50vh, 26rem);
  margin: 0;
  padding: 4px;
  overflow-y: auto;
  list-style: none;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--surface-raised);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  pointer-events: auto;
}

.graph-canvas__toolbar .graph-canvas__history button {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: auto;
  min-height: 32px;
  padding: 4px 8px;
  border: 0;
  border-radius: 4px;
  background: none;
  text-align: left;
}

.graph-canvas__toolbar .graph-canvas__history button:hover {
  background: var(--wash);
}

.graph-canvas__toolbar .graph-canvas__history button[aria-current] {
  background: var(--wash);
  font-weight: 600;
}

.graph-canvas__view button[aria-pressed='true'] {
  background: var(--text-primary);
  border-color: var(--text-primary);
  color: var(--surface);
  font-weight: 600;
}

.graph-canvas__view button[aria-pressed='true']:hover {
  background: var(--text-primary);
}

.graph-canvas__filters {
  display: none;
  border-radius: 6px;
}

.graph-canvas__group button + button {
  border-left: 0;
}

.graph-canvas__group button:first-child {
  border-radius: 6px 0 0 6px;
}

.graph-canvas__group button:last-child {
  border-radius: 0 6px 6px 0;
}

@media (max-width: 1024px) {
  .graph-canvas__filters {
    display: block;
  }

  .graph-canvas__toolbar button {
    min-width: 40px;
    height: 40px;
  }
}
</style>
