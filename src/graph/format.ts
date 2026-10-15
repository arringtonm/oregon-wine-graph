import { roleTitle } from '../data/roleTitles'
import { EDGE_RULES, type GraphEdge, type GraphNode, type NodeType } from '../data/schema'

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

