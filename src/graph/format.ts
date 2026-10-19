import { roleTitle } from '../data/roleTitles'
import { EDGE_RULES, type GraphEdge, type GraphNode, type NodeType, type YearField } from '../data/schema'

// How records and connections read, as words: shared by the app (composables/useGraph.ts)
// and the pages made at build time for search engines (seo/recordPage.ts). No browser
// globals, so the build script can use it too.

// Node types hidden from the whole site for now: the graph, filters, search, list, Random,
// the detail panel's connections and the search-engine pages. The records stay in the data;
// remove a type to bring it back
export const HIDDEN_TYPES = new Set<NodeType>(['event'])

export const SINGULAR_TYPE: Record<NodeType, string> = {
  person: 'person',
  winery: 'winery',
  vineyard: 'vineyard',
  ava: 'AVA',
  organization: 'organization',
  event: 'event',
}

// A year as the sources give it: "1966", or "1965 or 1966" when they disagree (alsoDated)
export function datedText(record: GraphNode | GraphEdge, field: YearField): string {
  const year = (record as Partial<Record<YearField, number>>)[field]
  if (year === undefined) return ''
  const years = [...new Set([year, ...(record.alsoDated?.[field] ?? [])])].sort((a, b) => a - b)
  return years.length === 1 ? `${year}` : `${years.slice(0, -1).join(', ')} or ${years[years.length - 1]}`
}

// Whether the sources disagree on any of the record's years
export function hasDisputedYears(record: GraphNode | GraphEdge): boolean {
  return Object.values(record.alsoDated ?? {}).some((years) => years.length > 0)
}

export function formatYears(edge: GraphEdge): string {
  const { startYear, endYear, ongoing } = edge
  const start = datedText(edge, 'startYear')
  const end = datedText(edge, 'endYear')
  if (startYear !== undefined && endYear !== undefined) {
    return startYear === endYear && start === end ? start : `${start}–${end}`
  }
  if (startYear !== undefined) return ongoing ? `${start}–present` : `from ${start}`
  if (endYear !== undefined) return `until ${end}`
  return ongoing ? 'present' : ''
}

export function nodeYears(node: GraphNode): string {
  const year = (field: YearField) => datedText(node, field)
  switch (node.type) {
    case 'person':
      if (node.born !== undefined && node.died !== undefined) return `${year('born')}–${year('died')}`
      if (node.born !== undefined) return `Born ${year('born')}`
      return node.died !== undefined ? `Died ${year('died')}` : ''
    case 'winery':
      return [
        node.founded !== undefined ? `Founded ${year('founded')}` : '',
        node.closed !== undefined ? `closed ${year('closed')}` : '',
      ]
        .filter(Boolean)
        .join(', ')
    case 'vineyard':
      return node.planted !== undefined ? `Planted ${year('planted')}` : ''
    case 'ava':
      return node.established !== undefined ? `Established ${year('established')}` : ''
    case 'organization':
      return node.founded !== undefined ? `Founded ${year('founded')}` : ''
    case 'event':
      return [
        node.firstHeld !== undefined ? `First held ${year('firstHeld')}` : '',
        node.lastHeld !== undefined ? `last held ${year('lastHeld')}` : '',
      ]
        .filter(Boolean)
        .join(', ')
  }
}

export function edgeLabel(edge: GraphEdge): string {
  return edge.role ?? EDGE_RULES[edge.type].label
}

// How an edge reads from one end, e.g. "founded", "founded by", "child of"
// A family role is itself the verb ("sibling of"); any other role details the verb
export function connectionParts(edge: GraphEdge, outgoing: boolean): { verb: string; detail?: string } {
  const rule = EDGE_RULES[edge.type]
  if (edge.type === 'family' && edge.role) {
    if (edge.role === 'parent') return { verb: outgoing ? 'parent of' : 'child of' }
    return { verb: edge.role }
  }
  return { verb: outgoing ? rule.label : rule.inverseLabel, detail: edge.role }
}

export function connectionLabel(edge: GraphEdge, outgoing: boolean): string {
  const { verb, detail } = connectionParts(edge, outgoing)
  return detail ? `${verb} (${detail})` : verb
}

// How the card shows it: a role that names a position ("co-owner", "head winemaker") stands
// in for the verb, condensed to a short title if it's long (data/roleTitles.ts). Other roles
// keep the verb, with the role as detail ("supplies fruit to: 2019 Pinot noir")
export function cardParts(edge: GraphEdge, outgoing: boolean): { verb: string; detail?: string } {
  const title = roleTitle(edge)
  return title ? { verb: title } : connectionParts(edge, outgoing)
}

