import { computed, reactive, watch } from 'vue'
import { loadGraph } from '../data'
import { coreWithSelection, twoCore } from '../graph/core'
import { cardParts, connectionLabel, formatYears, HIDDEN_TYPES, SINGULAR_TYPE } from '../graph/format'
import { regionMembers, regions } from '../graph/regions'
import { foldText } from '../graph/textMatch'
import { focusRecords, viewById, VIEWS, type GuideView } from '../graph/views'
import { TOUR_STEPS } from '../tour/steps'
import { describe, GUIDES_PATH, guidePath, guideUrl, recordUrl, SITE, SITE_DESCRIPTION } from '../seo/recordPage'
// Re-exported for the components that have always imported them from here
export { edgeLabel, formatYears, HIDDEN_TYPES, nodeYears, SINGULAR_TYPE } from '../graph/format'
import type { Flag } from '../services/flagTypes'
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
// The review tools exist only on the dev server, which writes the data files; there they
// show in admin mode, and viewer mode previews the published site. See \`reviewing\` below.
const ADMIN_KEY = 'oregon-wine-graph:admin-mode'

function readAdminMode(): boolean {
  if (!import.meta.env.DEV) return false
  try {
    return localStorage.getItem(ADMIN_KEY) !== 'false'
  } catch {
    return true
  }
}

export function rememberAdminMode(admin: boolean) {
  try {
    localStorage.setItem(ADMIN_KEY, String(admin))
  } catch {
    // Not remembered; the mode still applies for this visit
  }
}

export interface Connection {
  edge: GraphEdge
  other: GraphNode
  // The whole phrase, "supplies fruit to (2019 Pinot noir)", for sentences and labels
  label: string
  // How the card shows it: the verb ("supplies fruit to"), or the role's short title in its
  // place ("co-owner"), and the edge's own detail ("2019 Pinot noir"), if any
  verb: string
  detail?: string
  years: string
}


function defaultFilters() {
  return {
    nodeTypes: {
      person: true,
      winery: true,
      vineyard: true,
      organization: true,
      event: !HIDDEN_TYPES.has('event'),
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
    // Off: the graph shows its connected core (graph/core.ts), not every record
    showAll: false,
    // AVA node ids to narrow the graph to; empty for all
    avas: [] as string[],
    // A guided view's focus (graph/views.ts), by the view's id: only the records its rule
    // picks. Set by views only; the drawer shows it as a removable chip
    focus: null as string | null,
  }
}

// A flag as the admin sees it: what was sent, plus where it is stored and whether handled
export interface AdminFlag extends Flag {
  id: string
  source: 'local' | 'remote'
  resolvedAt?: string
  // What the daily flag job found, and the pull request that acted on it
  finding?: string
  prUrl?: string
}

const COLLAPSED_KEY = 'oregon-wine-graph:filters-collapsed'
// Graph or list, remembered in this browser, so a reload comes back to the same view
const LIST_VIEW_KEY = 'oregon-wine-graph:list-view'

function readListView(): boolean {
  try {
    return localStorage.getItem(LIST_VIEW_KEY) === 'true'
  } catch {
    return false
  }
}

const TOUR_KEY = 'oregon-wine-graph:tour'

interface TourProgress {
  step: number
  done: boolean
}

function readTourProgress(): TourProgress {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(TOUR_KEY) ?? 'null')
    if (stored && typeof stored === 'object' && 'step' in stored && typeof stored.step === 'number') {
      return { step: Math.max(0, Math.min(stored.step, TOUR_STEPS.length - 1)), done: 'done' in stored && stored.done === true }
    }
  } catch {
    // Nothing remembered
  }
  return { step: 0, done: false }
}

// Never opened on this browser: the start panel's tour button stands out until it is
function tourIsFresh(): boolean {
  try {
    return localStorage.getItem(TOUR_KEY) === null
  } catch {
    return true
  }
}

function rememberTour() {
  try {
    localStorage.setItem(TOUR_KEY, JSON.stringify(state.tourProgress))
  } catch {
    // Kept for this visit only where storage is unavailable
  }
}

// The tour: open at a step (by default where the reader left it, or the start once done),
// step through, close (remembering the step) or finish (remembering it's done). While it's
// open, its step's control is the one ringed
function startTour(from?: number) {
  const step = from ?? (state.tourProgress.done ? 0 : state.tourProgress.step)
  showTourStep(step)
}

function showTourStep(step: number) {
  const index = Math.max(0, Math.min(step, TOUR_STEPS.length - 1))
  state.tour = index
  state.tourFresh = false
  state.tourProgress = { ...state.tourProgress, step: index }
  state.hint = TOUR_STEPS[index].hint
  rememberTour()
}

function tourStep(delta: number) {
  if (state.tour === null) return
  const next = state.tour + delta
  if (next >= TOUR_STEPS.length) finishTour()
  else showTourStep(next)
}

function closeTour() {
  state.tour = null
  state.hint = null
}

// Shows or hides the filters, as the toolbar's button does: the sidebar on wide screens,
// the drawer on smaller ones. With `open`, only shows them
function showFilters(open?: boolean) {
  state.hint = state.tour === null ? null : state.hint
  const compact = window.matchMedia('(max-width: 1024px)').matches
  if (compact) state.filtersOpen = open ?? !state.filtersOpen
  else if (!open || state.filtersCollapsed) document.getElementById('sidebar-toggle')?.click()
}

// Phones and tablets: the first-visit nudge towards the tour, set aside with its ×. Opening
// the tour does the same. Either way it's remembered, so it shows once
function dismissTourNudge() {
  state.tourFresh = false
  rememberTour()
}

function finishTour() {
  state.tourProgress = { step: 0, done: true }
  rememberTour()
  closeTour()
}

const RECENT_KEY = 'oregon-wine-graph:recent'
// Records viewed in this browser, newest first; the empty panel lists a few of them
const RECENT_LIMIT = 8

function readRecent(): string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string').slice(0, RECENT_LIMIT) : []
  } catch {
    return []
  }
}

function rememberRecent(id: string) {
  state.recent = [id, ...state.recent.filter((other) => other !== id)].slice(0, RECENT_LIMIT)
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(state.recent))
  } catch {
    // Kept for this visit only where storage is unavailable
  }
}

// A convenience remembered in this browser only; storage may be unavailable (private mode)
// Screens this wide or narrower open with the sidebar hidden, leaving the graph the room
const COLLAPSED_BY_DEFAULT = '(max-width: 1512px)'

function storedCollapsed(): boolean | undefined {
  try {
    const stored = localStorage.getItem(COLLAPSED_KEY)
    return stored === 'true' ? true : stored === 'false' ? false : undefined
  } catch {
    return undefined
  }
}

// The reader's own choice, once they've made one; until then, the default for the screen
function readCollapsed(): boolean {
  return storedCollapsed() ?? window.matchMedia?.(COLLAPSED_BY_DEFAULT).matches ?? false
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
  // Admin shows the review tools (dev server only); viewer is how the published site looks
  adminMode: readAdminMode(),
  // Flags readers have sent, loaded on the dev server for admin mode
  flags: [] as AdminFlag[],
  reviewError: null as string | null,
  // Jev's scores for each record against its sources; loaded on the dev server only
  checks: null as CheckStore | null,
  // Nodes selected this session, oldest first. Kept in the app only, not in browser history.
  history: [] as string[],
  historyIndex: -1,
  // Records viewed in this browser, newest first, kept across visits (localStorage)
  recent: readRecent(),
  // Show the visible nodes as an accessible list in place of the canvas
  listView: readListView(),
  // Show the records with a place on a map, in place of the canvas (GeoMap.vue). Not
  // remembered: each visit's first map is a billed Mapbox load, so it opens when asked for
  mapView: false,
  // Text for the page's polite live region: selection changes, search result counts
  announcement: '',
  // Bumped to ask the detail panel to move keyboard focus to its heading
  focusDetailsRequest: 0,
  // Bumped to ask the graph to reset: default filters, nothing selected, fresh layout
  resetRequest: 0,
  // Bumped when a guided view is applied, asking the graph for a fresh layout
  viewRequest: 0,
  // Bumped to ask the graph to roll the dice, as the start panel's "Roll the dice" does
  randomRequest: 0,
  // Bumped to open the Guides menu or the Controls guide, from the start panel
  guidesRequest: 0,
  controlsRequest: 0,
  // The control a line of the start panel's "Ways to explore" points to, while that line is
  // hovered or focused: the control is highlighted, showing where it lives
  hint: null as Hint | null,
  // For "Click a person or place": the well-connected winery or person ringed on the graph
  // while it's hovered, which pressing it opens
  hintNodeId: null as string | null,
  // The tour (src/tour/steps.ts): the step showing, or null when it's closed
  tour: null as number | null,
  // Where the reader left it, remembered in this browser: a step to resume, or done
  tourProgress: readTourProgress(),
  tourFresh: tourIsFresh(),
  // Bumped to ask the graph to fit everything in view, as its Fit button does
  fitRequest: 0,
})

// 'zoom' is the tour's "Getting around": zoom and Fit, with Back, Forward, History and Reset
export type Hint = 'node' | 'search' | 'guides' | 'filters' | 'graph' | 'map' | 'list' | 'random' | 'reset' | 'controls' | 'zoom'

const APP_TITLE = 'Oregon Wine Graph'

// Graph, map or list: what fills the space between the sidebars
export type View = 'graph' | 'map' | 'list'
function showView(view: View) {
  state.listView = view === 'list'
  state.mapView = view === 'map'
}

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
// Whether review tools show: on the dev server, in admin mode
export const reviewing = computed(() => import.meta.env.DEV && state.adminMode)

const avas = computed(() => nodes.value.filter((node) => node.type === 'ava'))

// Whether the filters are those of the arrangement saved and shipped (layout.json), which
// places every record the default filters let through, whether or not "Show all" is on
const isDefaultArrangement = computed(() => {
  const defaults = defaultFilters()
  return (
    Object.entries(defaults.nodeTypes).every(([type, on]) => state.nodeTypes[type as ToggleableNodeType] === on) &&
    Object.entries(defaults.categories).every(([category, on]) => state.categories[category as EdgeCategory] === on) &&
    state.oregonOnly === defaults.oregonOnly &&
    state.verifiedOnly === defaults.verifiedOnly &&
    state.avas.length === 0 &&
    state.focus === null
  )
})

// Whether the filters are as the app starts
const isDefaultView = computed(() => isDefaultArrangement.value && !state.showAll)

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

// Where wineries and vineyards are, by AVA (graph/regions.ts)
const regionIndex = computed(() => regions(state.graph ?? { nodes: [], edges: [] }))
const avasOf = (id: string) => regionIndex.value.avasOf(id)
const membersOf = (scope: Set<string>) => regionMembers(state.graph ?? { nodes: [], edges: [] }, scope, regionIndex.value)

// Nodes kept by the AVA filter: the chosen AVAs and their sub-AVAs, the wineries and
// vineyards in them (graph/regions.ts), and the people and organizations directly connected
// to those. Wineries and vineyards elsewhere stay out, even those buying the region's fruit:
// they crowded out the region itself, and its vineyards' panels still list them
const avaScope = computed(() => {
  if (state.avas.length === 0) return null
  const scope = withSubAvas(state.avas)
  const members = membersOf(scope)
  const context = (id: string) => {
    const type = nodeById.value.get(id)?.type
    if (type !== 'winery' && type !== 'vineyard') scope.add(id)
  }
  for (const edge of edges.value) {
    if (EDGE_RULES[edge.type].category === 'geography') continue
    if (members.has(edge.source)) context(edge.target)
    if (members.has(edge.target)) context(edge.source)
  }
  for (const id of members) scope.add(id)
  return scope
})

// The focus's records: its core (Random rolls among these) and what it shows
const focus = computed(() => {
  const rule = viewById(state.focus)?.focus
  return rule && state.graph ? { rule, ...focusRecords(state.graph, rule) } : null
})

// What the filters let through, before the connected core is taken
const filteredNodes = computed(() =>
  nodes.value.filter((node) => {
    if (HIDDEN_TYPES.has(node.type)) return false
    if (node.type === 'ava' ? !state.categories.geography : !state.nodeTypes[node.type]) return false
    if (state.oregonOnly && node.outsideOregon) return false
    if (state.verifiedOnly && !node.verified) return false
    if (avaScope.value && !avaScope.value.has(node.id)) return false
    if (focus.value && !focus.value.shown.has(node.id)) return false
    return true
  }),
)

const filteredEdges = computed(() => {
  const shown = new Set(filteredNodes.value.map((node) => node.id))
  return edges.value.filter(
    (edge) =>
      state.categories[EDGE_RULES[edge.type].category] &&
      (!state.verifiedOnly || edge.verified) &&
      shown.has(edge.source) &&
      shown.has(edge.target),
  )
})

// Every record and connection the default filters let through: the graph the connected
// core is worked out on
const defaultGraph = computed(() => {
  const defaults = defaultFilters()
  const ids = nodes.value
    .filter((node) => !HIDDEN_TYPES.has(node.type) && node.type !== 'ava' && defaults.nodeTypes[node.type as ToggleableNodeType])
    .map((node) => node.id)
  const shown = new Set(ids)
  const links = edges.value.filter(
    (edge) => defaults.categories[EDGE_RULES[edge.type].category] && shown.has(edge.source) && shown.has(edge.target),
  )
  return { ids, links }
})

// The connected core of the default graph: a fixed set, so that narrowing the filters (to
// organizations only, say) hides records by the filters' own rules rather than shrinking
// the core to nothing
const defaultCore = computed(() => twoCore(defaultGraph.value.ids, defaultGraph.value.links))

// Taken unless "Show all records" is on. Guides and AVA filters narrow the graph themselves,
// and the core would hide the very pairs they pick; AVA regions show vineyards by where they
// are, which their connections don't count. So it isn't taken for any of them
const coreApplies = computed(() => !state.showAll && !state.focus && state.avas.length === 0 && !state.categories.geography)
const core = computed(() => (coreApplies.value ? defaultCore.value : null))

const visibleNodes = computed(() => {
  if (!core.value) return filteredNodes.value
  const shown = coreWithSelection(core.value, filteredEdges.value, state.selectedId)
  return filteredNodes.value.filter((node) => shown.has(node.id))
})

const visibleEdges = computed(() => {
  if (!core.value) return filteredEdges.value
  const shown = new Set(visibleNodes.value.map((node) => node.id))
  return filteredEdges.value.filter((edge) => shown.has(edge.source) && shown.has(edge.target))
})

// How many records the filters let through, for "840 of 1,417" and the Show all switch
const filteredCount = computed(() => filteredNodes.value.length)

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

// All connections of a node, grouped by category, regardless of active filters
function connectionsOf(id: string): { category: EdgeCategory; connections: Connection[] }[] {
  const groups = new Map<EdgeCategory, Connection[]>()
  for (const edge of edges.value) {
    const outgoing = edge.source === id
    if (!outgoing && edge.target !== id) continue
    const other = nodeById.value.get(outgoing ? edge.target : edge.source)
    if (!other || HIDDEN_TYPES.has(other.type)) continue
    const rule = EDGE_RULES[edge.type]
    const connection: Connection = {
      edge,
      other,
      label: connectionLabel(edge, outgoing),
      ...cardParts(edge, outgoing),
      years: formatYears(edge),
    }
    groups.set(rule.category, [...(groups.get(rule.category) ?? []), connection])
  }
  return EDGE_CATEGORIES.filter((category) => groups.has(category)).map((category) => ({
    category,
    connections: groups.get(category)!,
  }))
}

// Matches what the filters let through, including records outside the connected core
// (selecting one brings it in), and AVAs even when the AVA layer is off
function search(query: string): GraphNode[] {
  const needle = foldText(query.trim())
  if (!needle) return []
  const shown = new Set(filteredNodes.value.map((node) => node.id))
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
  if (changed && node) rememberRecent(node.id)
  if (changed) {
    if (node) {
      const count = edges.value.filter((edge) => edge.source === node.id || edge.target === node.id).length
      announce(`${node.name}, ${SINGULAR_TYPE[node.type]}, ${count} connection${count === 1 ? '' : 's'}`)
    } else if (id === null) {
      announce('Selection cleared')
    }
  }
  showAddress(node)
}

// Each record has its own address, /<id>, which the build also writes a page for, so search
// engines and shared links reach it (seo/recordPage.ts). The address, canonical link and
// description follow the selection
// With a guide showing, the address keeps it: /guides/<guide>, or /guides/<guide>/<id> with a
// record open. The canonical link stays the record's own page
function showAddress(node: GraphNode | undefined) {
  const view = activeView.value
  const path = view ? guidePath(view.id, node?.id) : node ? `/${node.id}` : '/'
  if (window.location.pathname !== path || window.location.hash || window.location.search) {
    window.history.replaceState(null, '', path)
  }
  const canonical = node ? recordUrl(node.id) : view ? guideUrl(view.id) : `${SITE}/`
  document.querySelector('link[rel="canonical"]')?.setAttribute('href', canonical)
  document
    .querySelector('meta[name="description"]')
    ?.setAttribute('content', node ? describe(node.summary) : view ? describe(view.blurb) : SITE_DESCRIPTION)
}

// Selecting a node adds it to the history, dropping anything "forward" of the current position.
// With `focusDetails`, keyboard focus moves to the detail panel's heading, for selections
// made from a list or a link rather than on the canvas.
// A random node among those showing, skipping anything already visited this session; once
// everything showing has been visited, any but the current one. Null when nothing qualifies
// The records that belong to the chosen AVAs, for Random. The AVA filter also shows the
// people and organizations one connection from the region's wineries and vineyards; Random
// keeps to the region itself: its wineries and vineyards, and the people and organizations
// tied to one wholly inside it, or to two or more of them. Someone linked only through a
// company with vineyards in several regions stays context
const regionCore = computed(() => {
  if (state.avas.length === 0) return null
  const scope = withSubAvas(state.avas)
  const members = membersOf(scope)
  const local = new Set([...members].filter((id) => avasOf(id).every((ava) => scope.has(ava))))
  const core = new Set(members)
  const ties = new Map<string, number>()
  for (const edge of edges.value) {
    if (EDGE_RULES[edge.type].category === 'geography') continue
    for (const [member, other] of [
      [edge.source, edge.target],
      [edge.target, edge.source],
    ]) {
      if (!members.has(member) || members.has(other)) continue
      // A winery or vineyard belongs only by where it is, however many members it deals with
      const type = nodeById.value.get(other)?.type
      if (type === 'winery' || type === 'vineyard') continue
      if (local.has(member)) core.add(other)
      ties.set(other, (ties.get(other) ?? 0) + 1)
    }
  }
  // Someone tied to two members (a winemaker at two of its wineries) belongs to the region
  for (const [id, count] of ties) if (count >= 2) core.add(id)
  return core
})

function randomNodeId(): string | null {
  const visited = new Set(state.history)
  const own = (id: string) => (!regionCore.value || regionCore.value.has(id)) && (!focus.value || focus.value.core.has(id))
  const shown = visibleNodes.value.filter((node) => node.id !== state.selectedId)
  // The region's or view's own records, unless none of them is showing
  const belonging = shown.filter((node) => own(node.id))
  const showing = belonging.length > 0 ? belonging : shown
  const fresh = showing.filter((node) => !visited.has(node.id))
  const pool = fresh.length > 0 ? fresh : showing
  return pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)].id : null
}

// Choosing a node from search or an answer: an AVA is only drawn with the AVA regions
// layer, so that turns on; focus moves to the node's details; the tablet drawer closes
function pickNode(id: string) {
  if (avas.value.some((ava) => ava.id === id)) state.categories.geography = true
  // A record a guided view hides: the view ends, so the record shows
  if (state.focus && !visibleNodes.value.some((node) => node.id === id)) resetFilters()
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
// Flags, for admin mode on the dev server: loaded from /__flags/list, stepped through, resolved
async function loadFlags() {
  if (!import.meta.env.DEV) return
  try {
    state.flags = await postJson<AdminFlag[]>('/__flags/list', {})
  } catch {
    // The review box simply shows no flags
  }
}

const openFlags = computed(() => state.flags.filter((flag) => !flag.resolvedAt))

// The open flags on one node or connection
function flagsFor(kind: 'node' | 'edge', id: string): AdminFlag[] {
  return openFlags.value.filter((flag) => flag.recordKind === kind && flag.recordId === id)
}

// The node whose card shows a flag: the node itself, or a connection's source
function flagNodeId(flag: AdminFlag): string | undefined {
  if (flag.recordKind === 'node') return flag.recordId
  return edges.value.find((edge) => edge.id === flag.recordId)?.source
}

function selectNextFlagged() {
  const ids = [...new Set(openFlags.value.map(flagNodeId).filter((id): id is string => !!id))]
  if (ids.length === 0) return
  const next = ids[(ids.indexOf(state.selectedId ?? '') + 1) % ids.length]
  select(next, { focusDetails: true })
}

async function resolveFlag(id: string) {
  await postJson('/__flags/resolve', { id })
  const flag = state.flags.find((entry) => entry.id === id)
  if (flag) flag.resolvedAt = new Date().toISOString()
}

// Questions go to a server holding the decision model's key: the dev server's /__ask, or a
// deployed endpoint (VITE_ASK_URL, e.g. a Cloud Function). The key never reaches the browser
export const askUrl = import.meta.env.VITE_ASK_URL || (import.meta.env.DEV ? '/__ask' : '')

function askJev(question: string, override?: AskOverride): Promise<AskAnswer> {
  return postJson(askUrl, { question, override })
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

// The record in the address: /<id>, or an older #<id> link, which becomes /<id>
// Guided views (graph/views.ts). Applying one starts from the default filters, sets the
// view's, clears the selection and asks the graph for a fresh layout
function applyView(id: string) {
  const view = viewById(id)
  if (!view) return
  Object.assign(state, viewFilters(view))
  select(null)
  state.filtersOpen = false
  state.viewRequest++
  announce(`${view.title}: ${visibleNodes.value.length} people and places`)
}

function viewFilters(view: GuideView) {
  const filters = defaultFilters()
  // A guide shows everything its rule picks
  filters.showAll = true
  Object.assign(filters.nodeTypes, view.nodeTypes)
  Object.assign(filters.categories, view.categories)
  filters.avas = [...(view.avas ?? [])]
  filters.focus = view.focus ? view.id : null
  return filters
}

// The view showing: one whose filters match the current ones exactly. Changing any filter
// ends it
const activeView = computed(() =>
  VIEWS.find((view) => {
    const filters = viewFilters(view)
    return (
      Object.entries(filters.nodeTypes).every(([type, on]) => state.nodeTypes[type as ToggleableNodeType] === on) &&
      Object.entries(filters.categories).every(([category, on]) => state.categories[category as EdgeCategory] === on) &&
      state.oregonOnly === filters.oregonOnly &&
      state.verifiedOnly === filters.verifiedOnly &&
      state.showAll === filters.showAll &&
      state.focus === filters.focus &&
      [...state.avas].sort().join() === [...filters.avas].sort().join()
    )
  }),
)

watch(
  () => state.listView,
  (list) => {
    try {
      localStorage.setItem(LIST_VIEW_KEY, String(list))
    } catch {
      // Kept for this visit only where storage is unavailable
    }
  },
)

// The address follows the guide too: it joins when a guide starts and goes when it ends
watch(activeView, () => {
  if (state.graph) showAddress(selectedNode.value ?? undefined)
})

// Opens what the address names: /<id>, an old #<id> link, /guides/<guide>[/<id>], or an
// old /?view=<guide> link. A guide not already showing is applied and laid out afresh
function selectFromLocation() {
  const segments = window.location.pathname.split('/').filter(Boolean).map(decodeURIComponent)
  const guided = segments[0] === GUIDES_PATH
  const view = viewById(guided ? segments[1] : new URLSearchParams(window.location.search).get('view'))
  if (view && activeView.value?.id !== view.id) {
    Object.assign(state, viewFilters(view))
    state.viewRequest++
  }
  const fromHash = decodeURIComponent(window.location.hash.slice(1))
  const id = fromHash || (guided ? (segments[2] ?? '') : segments.join('/'))
  const node = nodeById.value.get(id)
  // A link to a hidden type opens nothing, rather than a node the app doesn't show
  select(node && !HIDDEN_TYPES.has(node.type) ? id : null)
}

let started = false
async function init() {
  if (started) return
  started = true
  // Read again now the page is laid out: a page loading in a frame can report its width
  // before it has one
  state.filtersCollapsed = readCollapsed()
  try {
    state.graph = await loadGraph()
    if (import.meta.env.DEV) state.checks = (await import('../data/checks.json')).default as unknown as CheckStore
    void loadFlags()
    selectFromLocation()
    window.addEventListener('popstate', selectFromLocation)
    window.addEventListener('hashchange', selectFromLocation)
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
    filteredNodes,
    filteredCount,
    coreApplies,
    selectedNode,
    connectionsOf,
    search,
    select,
    pickNode,
    randomNodeId,
    startTour,
    dismissTourNudge,
    showFilters,
    tourStep,
    closeTour,
    finishTour,
    applyView,
    activeView,
    loadFlags,
    openFlags,
    flagsFor,
    selectNextFlagged,
    resolveFlag,
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
    isDefaultArrangement,
    nearby,
    loadEvidence,
    removeEdge,
    updateEdge,
    selectNextUnverified,
    showView,
    init,
  }
}
