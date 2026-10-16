import { EDGE_RULES, type EdgeCategory, type Graph, type NodeType } from '../data/schema'

// Guided views: curated ways into the graph, each setting several filters at once, offered
// in the toolbar's Guides menu, each at its own address, /guides/<id>. A view is data only; useGraph
// applies it (applyView) and knows when one is showing (activeView).
//
// Most views are plain filters. A few also set a focus, which keeps only the records its
// rule picks, joined by the connections among them:
// - members: an organization's members, and the people and places tied to them
// - era: records by year (wineries founded, vineyards planted, people's first recorded role)
// - linked: records with at least one connection of the given kinds, so none sits alone

export type FocusRule =
  | { kind: 'members'; org: string; label: string }
  | { kind: 'era'; from?: number; before?: number; label: string }
  | { kind: 'linked'; categories: EdgeCategory[]; label: string }

export interface GuideView {
  id: string
  title: string
  blurb: string
  // Types and connection kinds shown; any left out stay at their defaults (on)
  nodeTypes?: Partial<Record<Exclude<NodeType, 'ava' | 'event'>, boolean>>
  categories?: Partial<Record<EdgeCategory, boolean>>
  avas?: string[]
  focus?: FocusRule
}

// Which ways a view's list of types or kinds reads: only these on
const only = <K extends string>(all: readonly K[], on: readonly K[]) =>
  Object.fromEntries(all.map((key) => [key, on.includes(key)])) as Record<K, boolean>
const TYPES = ['person', 'winery', 'vineyard', 'organization'] as const
const KINDS = ['ownership', 'work', 'people', 'fruit', 'affiliation'] as const

// The era cut-offs: tune here
export const YOUNG_FROM = 2015
export const LIBRARY_BEFORE = 1985

export const VIEWS: GuideView[] = [
  {
    id: 'beyond-the-willamette',
    title: 'Beyond the Willamette Valley',
    blurb: 'Southern Oregon, the Columbia Gorge and the Columbia Valley.',
    avas: ['southern-oregon', 'columbia-gorge', 'columbia-valley'],
  },
  {
    id: 'southern-oregon',
    title: 'Southern Oregon',
    blurb: 'The Rogue, Applegate and Umpqua valleys, Elkton and Red Hill.',
    avas: ['southern-oregon'],
  },
  {
    id: 'sparkling',
    title: 'Sparkling',
    blurb: 'Method Oregon’s members, who make traditional-method sparkling wine, and their people.',
    focus: { kind: 'members', org: 'method-oregon', label: 'Members of Method Oregon' },
  },
  {
    id: 'young-vintages',
    title: 'Young Vintages',
    blurb: `Wineries founded since ${YOUNG_FROM}, and people whose first recorded role began then. Records with a known year only.`,
    focus: { kind: 'era', from: YOUNG_FROM, label: `Since ${YOUNG_FROM}` },
  },
  {
    id: 'library-wines',
    title: 'Library Wines',
    blurb: `The originals: wineries founded and vineyards planted before ${LIBRARY_BEFORE}, and the people there from the start. Records with a known year only.`,
    focus: { kind: 'era', before: LIBRARY_BEFORE, label: `Before ${LIBRARY_BEFORE}` },
  },
  {
    id: 'who-started-what',
    title: 'Who started what',
    blurb: 'Founders, owners and buyers: ownership connections only.',
    categories: only(KINDS, ['ownership']),
  },
  {
    id: 'family-and-mentors',
    title: 'Family trees and mentors',
    blurb: 'People only, joined by family and by who taught whom.',
    nodeTypes: only(TYPES, ['person']),
    categories: only(KINDS, ['people']),
  },
  {
    id: 'following-the-fruit',
    title: 'Following the fruit',
    blurb: 'Which wineries buy grapes from which vineyards.',
    nodeTypes: only(TYPES, ['winery', 'vineyard']),
    categories: only(KINDS, ['fruit']),
    focus: { kind: 'linked', categories: ['fruit'], label: 'Wineries and vineyards with fruit links' },
  },
]

export const viewById = (id: string | null | undefined) => VIEWS.find((view) => view.id === id)

// The year a record starts: a winery's founding, a vineyard's planting, and a person's first
// recorded role (the earliest start year among their connections, family aside)
export function startYears(graph: Graph): Map<string, number> {
  const years = new Map<string, number>()
  for (const node of graph.nodes) {
    const year = 'founded' in node ? node.founded : 'planted' in node ? node.planted : undefined
    if ((node.type === 'winery' || node.type === 'vineyard') && year) years.set(node.id, year)
  }
  const people = new Set(graph.nodes.filter((node) => node.type === 'person').map((node) => node.id))
  for (const edge of graph.edges) {
    if (!edge.startYear || edge.type === 'family' || !people.has(edge.source)) continue
    const earliest = years.get(edge.source)
    if (earliest === undefined || edge.startYear < earliest) years.set(edge.source, edge.startYear)
  }
  return years
}

// The records a focus keeps (its core, which Random rolls among), and what it shows: the
// core plus, for members, the people and places tied to them
export function focusRecords(graph: Graph, rule: FocusRule): { core: Set<string>; shown: Set<string> } {
  if (rule.kind === 'linked') {
    const core = new Set<string>()
    for (const edge of graph.edges) {
      if (!rule.categories.includes(EDGE_RULES[edge.type].category)) continue
      core.add(edge.source)
      core.add(edge.target)
    }
    return { core, shown: core }
  }
  if (rule.kind === 'era') {
    const core = new Set<string>()
    for (const [id, year] of startYears(graph)) {
      if ((rule.from === undefined || year >= rule.from) && (rule.before === undefined || year < rule.before)) core.add(id)
    }
    return { core, shown: core }
  }
  const members = new Set(
    graph.edges.filter((edge) => edge.type === 'member_of' && edge.target === rule.org).map((edge) => edge.source),
  )
  const shown = new Set([rule.org, ...members])
  const core = new Set(members)
  const types = new Map(graph.nodes.map((node) => [node.id, node.type]))
  for (const edge of graph.edges) {
    if (edge.type === 'member_of' || edge.type === 'located_in' || edge.type === 'within' || edge.type === 'draws_from') continue
    for (const [member, other] of [
      [edge.source, edge.target],
      [edge.target, edge.source],
    ]) {
      if (!members.has(member)) continue
      shown.add(other)
      // The people at a member house are the view's own; other places are context
      if (types.get(other) === 'person') core.add(other)
    }
  }
  return { core, shown }
}
