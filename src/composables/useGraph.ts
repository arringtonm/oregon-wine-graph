import { computed, reactive } from 'vue'
import { loadGraph } from '../data'
import {
  EDGE_CATEGORIES,
  EDGE_RULES,
  type EdgeCategory,
  type Graph,
  type GraphEdge,
  type GraphNode,
  type NodeType,
} from '../data/schema'

// AVA nodes are not toggled by type: they appear with the geography layer.
export type ToggleableNodeType = Exclude<NodeType, 'ava'>

// Review mode writes approvals to the data files through the dev server, so it only exists in `npm run dev`
export const reviewEnabled = import.meta.env.DEV

export interface Connection {
  edge: GraphEdge
  other: GraphNode
  label: string
  years: string
}

function defaultFilters() {
  return {
    nodeTypes: {
      person: true,
      winery: true,
      vineyard: true,
      organization: true,
      event: true,
    } as Record<ToggleableNodeType, boolean>,
    categories: {
      ownership: true,
      work: true,
      people: true,
      fruit: true,
      affiliation: true,
      geography: false,
    } as Record<EdgeCategory, boolean>,
    oregonOnly: false,
    verifiedOnly: false,
    // AVA node id to narrow the graph to, or '' for all
    ava: '',
  }
}

const state = reactive({
  graph: null as Graph | null,
  error: null as string | null,
  selectedId: null as string | null,
  ...defaultFilters(),
  // Whether the filter drawer is open; only matters on tablet and smaller
  filtersOpen: false,
  reviewError: null as string | null,
})

const nodes = computed(() => state.graph?.nodes ?? [])
const edges = computed(() => state.graph?.edges ?? [])
const nodeById = computed(() => new Map(nodes.value.map((node) => [node.id, node])))
const avas = computed(() => nodes.value.filter((node) => node.type === 'ava'))

// Connection count per node, ignoring geography so AVA membership does not inflate it
const degree = computed(() => {
  const counts = new Map<string, number>()
  for (const edge of edges.value) {
    if (EDGE_RULES[edge.type].category === 'geography') continue
    counts.set(edge.source, (counts.get(edge.source) ?? 0) + 1)
    counts.set(edge.target, (counts.get(edge.target) ?? 0) + 1)
  }
  return counts
})

// Nodes kept by the AVA filter: the AVA and its sub-AVAs, the wineries and
// vineyards located in them, and anything directly connected to those.
const avaScope = computed(() => {
  if (!state.ava) return null
  const scope = new Set([state.ava])
  let grew = true
  while (grew) {
    grew = false
    for (const edge of edges.value) {
      if (edge.type === 'within' && scope.has(edge.target) && !scope.has(edge.source)) {
        scope.add(edge.source)
        grew = true
      }
    }
  }
  const members = new Set<string>()
  for (const edge of edges.value) {
    if (edge.type === 'located_in' && scope.has(edge.target)) members.add(edge.source)
  }
  for (const edge of edges.value) {
    if (EDGE_RULES[edge.type].category === 'geography') continue
    if (members.has(edge.source)) scope.add(edge.target)
    if (members.has(edge.target)) scope.add(edge.source)
  }
  for (const id of members) scope.add(id)
  return scope
})

const visibleNodes = computed(() =>
  nodes.value.filter((node) => {
    if (node.type === 'ava' ? !state.categories.geography : !state.nodeTypes[node.type]) return false
    if (state.oregonOnly && node.outsideOregon) return false
    if (state.verifiedOnly && !node.verified) return false
    if (avaScope.value && !avaScope.value.has(node.id)) return false
    return true
  }),
)

const visibleEdges = computed(() => {
  const shown = new Set(visibleNodes.value.map((node) => node.id))
  return edges.value.filter(
    (edge) =>
      state.categories[EDGE_RULES[edge.type].category] &&
      (!state.verifiedOnly || edge.verified) &&
      shown.has(edge.source) &&
      shown.has(edge.target),
  )
})

const selectedNode = computed(() =>
  state.selectedId ? (nodeById.value.get(state.selectedId) ?? null) : null,
)

export function formatYears(edge: GraphEdge): string {
  const { startYear, endYear, ongoing } = edge
  if (startYear !== undefined && endYear !== undefined) {
    return startYear === endYear ? `${startYear}` : `${startYear}–${endYear}`
  }
  if (startYear !== undefined) return ongoing ? `${startYear}–present` : `from ${startYear}`
  if (endYear !== undefined) return `until ${endYear}`
  return ongoing ? 'present' : ''
}

export function nodeYears(node: GraphNode): string {
  switch (node.type) {
    case 'person':
      if (node.born !== undefined && node.died !== undefined) return `${node.born}–${node.died}`
      if (node.born !== undefined) return `Born ${node.born}`
      return node.died !== undefined ? `Died ${node.died}` : ''
    case 'winery':
      return [
        node.founded !== undefined ? `Founded ${node.founded}` : '',
        node.closed !== undefined ? `closed ${node.closed}` : '',
      ]
        .filter(Boolean)
        .join(', ')
    case 'vineyard':
      return node.planted !== undefined ? `Planted ${node.planted}` : ''
    case 'ava':
      return node.established !== undefined ? `Established ${node.established}` : ''
    case 'organization':
      return node.founded !== undefined ? `Founded ${node.founded}` : ''
    case 'event':
      return [
        node.firstHeld !== undefined ? `First held ${node.firstHeld}` : '',
        node.lastHeld !== undefined ? `last held ${node.lastHeld}` : '',
      ]
        .filter(Boolean)
        .join(', ')
  }
}

export function edgeLabel(edge: GraphEdge): string {
  return edge.role ?? EDGE_RULES[edge.type].label
}

// How an edge reads from one end, e.g. "founded", "founded by", "child of"
function connectionLabel(edge: GraphEdge, outgoing: boolean): string {
  const rule = EDGE_RULES[edge.type]
  if (edge.type === 'family' && edge.role) {
    if (edge.role === 'parent') return outgoing ? 'parent of' : 'child of'
    return edge.role
  }
  const verb = outgoing ? rule.label : rule.inverseLabel
  return edge.role ? `${verb} (${edge.role})` : verb
}

// All connections of a node, grouped by category, regardless of active filters
function connectionsOf(id: string): { category: EdgeCategory; connections: Connection[] }[] {
  const groups = new Map<EdgeCategory, Connection[]>()
  for (const edge of edges.value) {
    const outgoing = edge.source === id
    if (!outgoing && edge.target !== id) continue
    const other = nodeById.value.get(outgoing ? edge.target : edge.source)
    if (!other) continue
    const rule = EDGE_RULES[edge.type]
    const connection: Connection = {
      edge,
      other,
      label: connectionLabel(edge, outgoing),
      years: formatYears(edge),
    }
    groups.set(rule.category, [...(groups.get(rule.category) ?? []), connection])
  }
  return EDGE_CATEGORIES.filter((category) => groups.has(category)).map((category) => ({
    category,
    connections: groups.get(category)!,
  }))
}

function search(query: string): GraphNode[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return []
  return visibleNodes.value
    .filter((node) =>
      [node.name, ...(node.aka ?? [])].some((name) => name.toLowerCase().includes(needle)),
    )
    .slice(0, 8)
}

function select(id: string | null) {
  state.selectedId = id
  const hash = id ? `#${id}` : ''
  if (window.location.hash !== hash) {
    history.replaceState(null, '', hash || window.location.pathname + window.location.search)
  }
}

const unverified = computed(() => ({
  nodes: nodes.value.filter((node) => !node.verified).length,
  edges: edges.value.filter((edge) => !edge.verified).length,
}))

async function setVerified(kind: 'node' | 'edge', record: GraphNode | GraphEdge, verified: boolean) {
  state.reviewError = null
  try {
    const response = await fetch('/__review/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind, id: record.id, verified }),
    })
    if (!response.ok) throw new Error((await response.text()) || `HTTP ${response.status}`)
    record.verified = verified
  } catch (error) {
    state.reviewError = `Could not save "${record.id}": ${error instanceof Error ? error.message : error}`
  }
}

// Approves a node together with every connection listed on its card
async function approveCard(node: GraphNode) {
  if (!node.verified) await setVerified('node', node, true)
  for (const edge of edges.value) {
    if (!edge.verified && (edge.source === node.id || edge.target === node.id)) {
      await setVerified('edge', edge, true)
    }
  }
}

function needsReview(node: GraphNode): boolean {
  return (
    !node.verified ||
    edges.value.some((edge) => !edge.verified && (edge.source === node.id || edge.target === node.id))
  )
}

// Selects the next node, after the current one, that still has something to review
function selectNextUnverified() {
  const list = nodes.value
  const start = list.findIndex((node) => node.id === state.selectedId)
  for (let offset = 1; offset <= list.length; offset++) {
    const node = list[(start + offset) % list.length]
    if (needsReview(node)) {
      select(node.id)
      return
    }
  }
}

function resetFilters() {
  Object.assign(state, defaultFilters())
}

function selectFromHash() {
  const id = decodeURIComponent(window.location.hash.slice(1))
  state.selectedId = nodeById.value.has(id) ? id : null
}

let started = false
async function init() {
  if (started) return
  started = true
  try {
    state.graph = await loadGraph()
    selectFromHash()
    window.addEventListener('hashchange', selectFromHash)
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error)
  }
}

export function useGraph() {
  return {
    state,
    avas,
    degree,
    nodeById,
    visibleNodes,
    visibleEdges,
    selectedNode,
    connectionsOf,
    search,
    select,
    resetFilters,
    unverified,
    setVerified,
    approveCard,
    selectNextUnverified,
    init,
  }
}
