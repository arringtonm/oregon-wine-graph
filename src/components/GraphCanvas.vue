<script setup lang="ts">
import cytoscape, { type Core, type ElementDefinition, type StylesheetJson } from 'cytoscape'
import fcose from 'cytoscape-fcose'
import { nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { edgeLabel, formatYears, nodeYears, useGraph } from '../composables/useGraph'
import { EDGE_RULES } from '../data/schema'

cytoscape.use(fcose)

const { state, degree, nodeById, visibleNodes, visibleEdges, select, resetFilters } = useGraph()

const container = ref<HTMLDivElement>()
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
        'background-color': neutral,
        'border-width': 2,
        'border-color': surface,
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
    { selector: 'node[type = "person"]', style: { shape: 'ellipse', 'background-color': token('--node-person') } },
    {
      selector: 'node[type = "winery"]',
      style: { shape: 'round-rectangle', 'background-color': token('--node-winery') },
    },
    { selector: 'node[type = "vineyard"]', style: { shape: 'diamond', 'background-color': token('--node-vineyard') } },
    { selector: 'node[type = "ava"]', style: { shape: 'hexagon' } },
    { selector: 'node[type = "organization"]', style: { shape: 'round-triangle' } },
    { selector: 'node[type = "event"]', style: { shape: 'star' } },
    { selector: 'node[?outside]', style: { 'border-style': 'dashed', 'border-color': ink, 'border-width': 1.5 } },
    {
      selector: 'edge',
      style: {
        width: 1.5,
        'line-color': token('--edge'),
        'target-arrow-color': token('--edge'),
        'target-arrow-shape': 'triangle',
        'arrow-scale': 0.8,
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
    { selector: '.dimmed', style: { opacity: 0.15 } },
    { selector: 'node.selected', style: { 'border-color': ink, 'border-width': 3, 'border-style': 'solid' } },
    {
      selector: 'edge.highlighted, edge.hovered',
      style: { label: 'data(label)', width: 2.5, 'line-color': ink, 'target-arrow-color': ink },
    },
  ]
}

function buildElements(): ElementDefinition[] {
  const maxDegree = Math.max(1, ...degree.value.values())
  // Square root keeps the few biggest hubs from dwarfing everything else
  const weight = (id: string) => Math.sqrt((degree.value.get(id) ?? 0) / maxDegree)
  return [
    ...visibleNodes.value.map((node) => ({
      group: 'nodes' as const,
      data: {
        id: node.id,
        label: node.name,
        type: node.type,
        outside: node.outsideOregon === true,
        size: 14 + 40 * weight(node.id),
        // Well-connected nodes get larger labels, so they stay readable when zoomed out
        fontSize: 8 + 28 * weight(node.id),
      },
    })),
    ...visibleEdges.value.map((edge) => ({
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
    quality: randomize ? 'default' : 'proof',
    randomize,
    animate: !randomize,
    animationDuration: 400,
    nodeRepulsion: 30000,
    gravity: 0.12,
    idealEdgeLength: 150,
    nodeSeparation: 120,
    padding: 40,
  } as cytoscape.LayoutOptions)
  layout.one('layoutstop', () => {
    fit()
    centerOnSelection()
  })
  layout.run()
}

// Add and remove only what changed so existing nodes keep their positions
function syncElements() {
  if (!cy) return
  const wanted = buildElements()
  const wantedIds = new Set(wanted.map((element) => element.data.id))
  const firstRender = cy.elements().empty()
  let changed = false
  cy.batch(() => {
    const stale = cy!.elements().filter((element) => !wantedIds.has(element.id()))
    changed = stale.nonempty()
    stale.remove()
    for (const element of wanted) {
      if (cy!.getElementById(element.data.id!).empty()) {
        cy!.add(element)
        changed = true
      }
    }
  })
  if (changed) runLayout(firstRender)
  applySelection()
}

function applySelection() {
  if (!cy) return
  cy.elements().removeClass('dimmed selected highlighted')
  const selected = state.selectedId ? cy.getElementById(state.selectedId) : cy.collection()
  if (selected.empty()) return
  selected.addClass('selected')
  selected.connectedEdges().addClass('highlighted')
  cy.elements().difference(selected.closedNeighborhood()).addClass('dimmed')
}

function centerOnSelection() {
  if (!cy || !state.selectedId) return
  const selected = cy.getElementById(state.selectedId)
  if (selected.empty()) return
  if (compactQuery.matches) {
    // The detail sheet covers the lower part of the graph, so aim above it
    const rendered = selected.renderedPosition()
    cy.animate(
      { panBy: { x: cy.width() / 2 - rendered.x, y: cy.height() * 0.28 - rendered.y } },
      { duration: 300 },
    )
    return
  }
  const { x1, y1, x2, y2 } = cy.extent()
  const { x, y } = selected.position()
  if (x < x1 || x > x2 || y < y1 || y > y2) {
    cy.animate({ center: { eles: selected } }, { duration: 300 })
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

  cy.on('tap', (event) => {
    state.filtersOpen = false
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

  darkQuery.addEventListener('change', applyTheme)
  syncElements()
})

onBeforeUnmount(() => {
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
    <div ref="container" class="graph-canvas__stage" role="img" aria-label="Network of Oregon wine people, wineries and vineyards"></div>
    <div
      v-show="tooltip.show"
      class="graph-canvas__tooltip"
      :style="{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }"
    >
      <strong>{{ tooltip.title }}</strong>
      <span v-if="tooltip.detail">{{ tooltip.detail }}</span>
    </div>
    <div class="graph-canvas__toolbar" role="toolbar" aria-label="Graph navigation">
      <button
        type="button"
        class="graph-canvas__filters"
        :aria-expanded="state.filtersOpen"
        @click="state.filtersOpen = !state.filtersOpen"
      >
        Search &amp; filters
      </button>
      <div class="graph-canvas__group">
        <button type="button" aria-label="Zoom in" title="Zoom in" @click="zoomBy(1.3)">+</button>
        <button type="button" aria-label="Zoom out" title="Zoom out" @click="zoomBy(1 / 1.3)">−</button>
        <button type="button" title="Fit the whole graph in view" @click="fit">Fit</button>
        <button type="button" title="Clear filters and selection, and lay the graph out again" @click="reset">
          Reset
        </button>
      </div>
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
  right: 12px;
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

.graph-canvas__toolbar button:hover {
  background: var(--surface);
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
