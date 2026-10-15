import { computed, reactive } from 'vue'
import { loadGraph } from '../data'
import { foldText } from '../graph/textMatch'
import { claimsFingerprint, claimsFor, type CheckedRecord } from '../../tools/check/claims'
import { APPLY_THRESHOLD, decide, type Decision, type Verdict } from '../../tools/check/decide'
import type { EdgeChanges, Evidence } from '../../tools/check/edit'
import type { CheckStore, StoredCheck } from '../../tools/check/store'
import type { AskAnswer, AskOverride } from '../../tools/jev/askGraph'
import type { Proposal, ProposedEdge } from '../../tools/jev/parseConnection'
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
    // AVA node ids to narrow the graph to; empty for all
    avas: [] as string[],
  }
}

const COLLAPSED_KEY = 'oregon-wine-graph:filters-collapsed'

// A convenience remembered in this browser only; storage may be unavailable (private mode)
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === 'true'
  } catch {
    return false
  }
}

export function rememberCollapsed(collapsed: boolean) {
  try {
    localStorage.setItem(COLLAPSED_KEY, String(collapsed))
  } catch {
    // Nothing to do: the choice just isn't remembered
  }
}

const state = reactive({
  graph: null as Graph | null,
  error: null as string | null,
  selectedId: null as string | null,
  ...defaultFilters(),
  // Whether the filter drawer is open; only matters on tablet and smaller
  filtersOpen: false,
  // Whether the search and filters sidebar is hidden; desktop only, remembered per browser
  filtersCollapsed: readCollapsed(),
  reviewError: null as string | null,
  // Jev's scores for each record against its sources; loaded on the dev server only
  checks: null as CheckStore | null,
  // Nodes selected this session, oldest first. Kept in the app only, not in browser history.
  history: [] as string[],
  historyIndex: -1,
  // Show the visible nodes as an accessible list in place of the canvas
  listView: false,
  // Text for the page's polite live region: selection changes, search result counts
  announcement: '',
  // Bumped to ask the detail panel to move keyboard focus to its heading
  focusDetailsRequest: 0,
})

const SINGULAR_TYPE: Record<NodeType, string> = {
  person: 'person',
  winery: 'winery',
  vineyard: 'vineyard',
  ava: 'AVA',
  organization: 'organization',
  event: 'event',
}
const APP_TITLE = 'Oregon Wine Graph'

// Says something to screen-reader users through the page's live region
function announce(text: string) {
  // Clearing first makes a repeat of the same text be read again
  state.announcement = ''
  queueMicrotask(() => (state.announcement = text))
}

const HISTORY_LIMIT = 100

const nodes = computed(() => state.graph?.nodes ?? [])
const edges = computed(() => state.graph?.edges ?? [])
const nodeById = computed(() => new Map(nodes.value.map((node) => [node.id, node])))
const avas = computed(() => nodes.value.filter((node) => node.type === 'ava'))

// Whether the filters are as the app starts: the view whose layout is saved and shipped
const isDefaultView = computed(() => {
  const defaults = defaultFilters()
  return (
    Object.entries(defaults.nodeTypes).every(([type, on]) => state.nodeTypes[type as ToggleableNodeType] === on) &&
    Object.entries(defaults.categories).every(([category, on]) => state.categories[category as EdgeCategory] === on) &&
    state.oregonOnly === defaults.oregonOnly &&
    state.verifiedOnly === defaults.verifiedOnly &&
    state.avas.length === 0
  )
})

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

// Every AVA inside the given ones, at any depth, plus the given ones
function withSubAvas(ids: Iterable<string>): Set<string> {
  const scope = new Set(ids)
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
  return scope
}

// The AVAs a winery or vineyard belongs to. A vineyard has the AVA it is located in; a
// winery has those it draws fruit from directly, plus those of every vineyard it owns or
// buys from. Most specific AVAs only; their parents follow from "within".
function avasOf(id: string): string[] {
  const node = nodeById.value.get(id)
  if (!node) return []
  const own = (nodeId: string, type: string) =>
    edges.value.filter((edge) => edge.source === nodeId && edge.type === type).map((edge) => edge.target)
  if (node.type === 'vineyard') return own(id, 'located_in')
  if (node.type !== 'winery') return []
  const vineyards = edges.value
    .filter(
      (edge) => edge.source === id && (edge.type === 'owns' || edge.type === 'sources_from') && nodeById.value.get(edge.target)?.type === 'vineyard',
    )
    .map((edge) => edge.target)
  return [...new Set([...own(id, 'draws_from'), ...vineyards.flatMap((vineyard) => own(vineyard, 'located_in'))])]
}

// Nodes kept by the AVA filter: the chosen AVAs and their sub-AVAs, the vineyards in
// them, the wineries drawing fruit from them, and anything directly connected to those
const avaScope = computed(() => {
  if (state.avas.length === 0) return null
  const scope = withSubAvas(state.avas)
  const members = new Set(
    nodes.value
      .filter((node) => (node.type === 'winery' || node.type === 'vineyard') && avasOf(node.id).some((ava) => scope.has(ava)))
      .map((node) => node.id),
  )
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

// The most specific AVA each vineyard or AVA sits in, from "located in" and "within"
// connections. Used to draw AVA regions around their members. Wineries are left out: a
// winery can source from vineyards in several AVAs, and its tasting room can be anywhere,
// so it is shown outside the regions, joined to the vineyards it uses.
const avaParent = computed(() => {
  const parentOf = new Map<string, string>()
  for (const edge of edges.value) if (edge.type === 'within') parentOf.set(edge.source, edge.target)
  const depth = (id: string): number => {
    let count = 0
    for (let current = parentOf.get(id); current && count < 10; current = parentOf.get(current)) count++
    return count
  }
  const result = new Map(parentOf)
  const place = (id: string, ava: string) => {
    const current = result.get(id)
    if (!current || depth(ava) > depth(current)) result.set(id, ava)
  }
  for (const edge of edges.value) {
    if (edge.type === 'located_in' && nodeById.value.get(edge.source)?.type === 'vineyard') place(edge.source, edge.target)
  }
  return result
})

// Straight-line distance in kilometres between two points
function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const radians = Math.PI / 180
  const dLat = (b.lat - a.lat) * radians
  const dLng = (b.lng - a.lng) * radians
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

// The wineries nearest a winery by visitor address, within 10 km, closest first. This is
// about visiting: a tasting room can be in town, far from the winery's vineyards.
function nearby(id: string, limit = 5): { node: GraphNode; km: number }[] {
  const origin = nodeById.value.get(id)
  const from = origin && 'coordinates' in origin ? origin.coordinates : undefined
  if (!from) return []
  return nodes.value
    .flatMap((node) =>
      node.id !== id && node.type === 'winery' && node.coordinates ? [{ node, km: distanceKm(from, node.coordinates) }] : [],
    )
    .filter(({ km }) => km <= 10)
    .sort((a, b) => a.km - b.km)
    .slice(0, limit)
}

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

// Matches visible nodes, and AVAs even when the AVA layer is off
function search(query: string): GraphNode[] {
  const needle = foldText(query.trim())
  if (!needle) return []
  const shown = new Set(visibleNodes.value.map((node) => node.id))
  return nodes.value
    .filter((node) => shown.has(node.id) || node.type === 'ava')
    .filter((node) =>
      [node.name, ...(node.aka ?? [])].some((name) => foldText(name).includes(needle)),
    )
    .slice(0, 8)
}

function showSelection(id: string | null) {
  const changed = state.selectedId !== id
  state.selectedId = id
  const node = id ? nodeById.value.get(id) : undefined
  document.title = node ? `${node.name} · ${APP_TITLE}` : APP_TITLE
  if (changed) {
    if (node) {
      const count = edges.value.filter((edge) => edge.source === node.id || edge.target === node.id).length
      announce(`${node.name}, ${SINGULAR_TYPE[node.type]}, ${count} connection${count === 1 ? '' : 's'}`)
    } else if (id === null) {
      announce('Selection cleared')
    }
  }
  const hash = id ? `#${id}` : ''
  if (window.location.hash !== hash) {
    window.history.replaceState(null, '', hash || window.location.pathname + window.location.search)
  }
}

// Selecting a node adds it to the history, dropping anything "forward" of the current position.
// With `focusDetails`, keyboard focus moves to the detail panel's heading, for selections
// made from a list or a link rather than on the canvas.
// A random node among those showing, skipping anything already visited this session; once
// everything showing has been visited, any but the current one. Null when nothing qualifies
function randomNodeId(): string | null {
  const visited = new Set(state.history)
  const showing = visibleNodes.value.filter((node) => node.id !== state.selectedId)
  const fresh = showing.filter((node) => !visited.has(node.id))
  const pool = fresh.length > 0 ? fresh : showing
  return pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)].id : null
}

// Choosing a node from search or an answer: an AVA is only drawn with the AVA regions
// layer, so that turns on; focus moves to the node's details; the tablet drawer closes
function pickNode(id: string) {
  if (avas.value.some((ava) => ava.id === id)) state.categories.geography = true
  select(id, { focusDetails: true })
  state.filtersOpen = false
}

function select(id: string | null, { focusDetails = false } = {}) {
  if (focusDetails && id) state.focusDetailsRequest++
  if (id && id !== state.history[state.historyIndex]) {
    state.history = [...state.history.slice(0, state.historyIndex + 1), id].slice(-HISTORY_LIMIT)
    state.historyIndex = state.history.length - 1
  }
  showSelection(id)
}

// Moves to a position in the history without rewriting it
function goToHistory(index: number) {
  if (index < 0 || index >= state.history.length) return
  state.historyIndex = index
  showSelection(state.history[index])
}

// With nothing selected, Back returns to the last selected node rather than the one before it
const canGoBack = computed(() => state.historyIndex > 0 || (state.historyIndex === 0 && !state.selectedId))
const canGoForward = computed(() => state.historyIndex < state.history.length - 1)

function goBack() {
  goToHistory(state.selectedId ? state.historyIndex - 1 : state.historyIndex)
}

function goForward() {
  goToHistory(state.historyIndex + 1)
}

const historyEntries = computed(() =>
  state.history
    .map((id, index) => ({ index, node: nodeById.value.get(id) }))
    .filter((entry): entry is { index: number; node: GraphNode } => entry.node !== undefined)
    .reverse(),
)

const unverified = computed(() => ({
  nodes: nodes.value.filter((node) => !node.verified).length,
  edges: edges.value.filter((edge) => !edge.verified).length,
}))

async function setVerified(kind: 'node' | 'edge', record: GraphNode | GraphEdge, verified: boolean) {
  state.reviewError = null
  try {
    await postJson('/__review/verify', { kind, id: record.id, verified })
    record.verified = verified
    if (verified) record.verifiedBy = 'person'
    else delete record.verifiedBy
  } catch (error) {
    state.reviewError = `Could not save "${record.id}": ${error instanceof Error ? error.message : error}`
  }
}

// Jev's verdict on a record, or null if it has not been checked since it last changed
function decisionFor(kind: 'node' | 'edge', record: GraphNode | GraphEdge): Decision | null {
  const stored = state.checks?.[`${kind}:${record.id}`]
  if (!stored || !state.graph) return null
  const claims = claimsFor({ kind, record } as CheckedRecord, state.graph)
  if (stored.fingerprint !== claimsFingerprint(claims)) return null
  return decide(stored.sources, Object.keys(claims.details), APPLY_THRESHOLD)
}

// Most urgent first: a source disagreeing, then a detail not holding, then no support at all
const QUEUE_ORDER: Verdict[] = ['conflict', 'partial', 'unsupported', 'unchecked', 'supported']

// Unverified records by verdict, each with the node whose panel shows it
const reviewQueue = computed(() => {
  const queue = new Map<Verdict | 'not checked', string[]>()
  const add = (kind: 'node' | 'edge', record: GraphNode | GraphEdge, nodeId: string) => {
    if (record.verified) return
    const verdict = decisionFor(kind, record)?.verdict ?? 'not checked'
    queue.set(verdict, [...(queue.get(verdict) ?? []), nodeId])
  }
  for (const node of nodes.value) add('node', node, node.id)
  for (const edge of edges.value) add('edge', edge, edge.source)
  return [...QUEUE_ORDER, 'not checked' as const]
    .filter((verdict) => queue.has(verdict))
    .map((verdict) => ({ verdict, nodeIds: queue.get(verdict)! }))
})

// Selects the next node, after the current one, holding an unverified record with this verdict
function selectNextWithVerdict(verdict: string) {
  const ids = [...new Set(reviewQueue.value.find((group) => group.verdict === verdict)?.nodeIds ?? [])]
  if (ids.length === 0) return
  select(ids[(ids.indexOf(state.selectedId ?? '') + 1) % ids.length])
}

function loadEvidence(kind: 'node' | 'edge', id: string): Promise<Evidence> {
  return postJson('/__review/evidence', { kind, id })
}

async function removeEdge(id: string) {
  await postJson('/__review/remove-edge', { id })
  if (state.graph) state.graph.edges = state.graph.edges.filter((edge) => edge.id !== id)
}

// Saves edited years or role on a connection; the server checks it against its sources again
async function updateEdge(id: string, changes: { [K in keyof EdgeChanges]: EdgeChanges[K] | null }) {
  const result = await postJson<{ edge: GraphEdge; check: StoredCheck | null }>('/__review/update-edge', { id, changes })
  if (state.graph) state.graph.edges = state.graph.edges.map((edge) => (edge.id === id ? result.edge : edge))
  if (result.check && state.checks) state.checks[`edge:${id}`] = result.check
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error((await response.text()) || `HTTP ${response.status}`)
  return response.json()
}

// Asks the dev server to read a sentence typed on a node's page as a connection
// Dev server only: Jev reads the question, the graph supplies the answer
function askJev(question: string, override?: AskOverride): Promise<AskAnswer> {
  return postJson('/__ask', { question, override })
}

function parseConnection(text: string, contextId: string): Promise<Proposal> {
  return postJson('/__contribute/parse', { text, contextId })
}

// Saves a confirmed connection to the data files and shows it in the graph
async function addConnection(
  edge: ProposedEdge,
  newNode: Pick<GraphNode, 'id' | 'name' | 'type'> | null,
  text: string,
  sourceUrl: string,
): Promise<{ edge: GraphEdge; node?: GraphNode }> {
  const added = await postJson<{ edge: GraphEdge; node?: GraphNode }>('/__contribute/add', {
    edge,
    newNode,
    text,
    sourceUrl,
  })
  if (added.node) state.graph?.nodes.push(added.node)
  state.graph?.edges.push(added.edge)
  return added
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
  select(nodeById.value.has(id) ? id : null)
}

let started = false
async function init() {
  if (started) return
  started = true
  try {
    state.graph = await loadGraph()
    if (import.meta.env.DEV) state.checks = (await import('../data/checks.json')).default as unknown as CheckStore
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
    pickNode,
    randomNodeId,
    announce,
    canGoBack,
    canGoForward,
    goBack,
    goForward,
    goToHistory,
    historyEntries,
    resetFilters,
    unverified,
    setVerified,
    approveCard,
    parseConnection,
    askJev,
    addConnection,
    decisionFor,
    reviewQueue,
    selectNextWithVerdict,
    avaParent,
    avasOf,
    isDefaultView,
    nearby,
    loadEvidence,
    removeEdge,
    updateEdge,
    selectNextUnverified,
    init,
  }
}
