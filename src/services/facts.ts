import type { Connection } from '../composables/useGraph'
import type { GraphEdge, GraphNode } from '../data/schema'

// One fact on a record's card: the record's own summary, or one of its connections. The
// card's verification popup lists them, and a flag names the one being reported.
export interface Fact {
  kind: 'node' | 'edge'
  record: GraphNode | GraphEdge
  // As it reads on the card: the summary, or "David Lett founded The Eyrie Vineyards"
  label: string
  // What a flag about it is filed under; the summary gains the record's name
  flagLabel: string
  years?: string
}

export function factsOf(node: GraphNode, groups: { connections: Connection[] }[]): Fact[] {
  return [
    { kind: 'node', record: node, label: node.summary, flagLabel: `${node.name}: ${node.summary}` },
    ...groups.flatMap((group) =>
      group.connections.map(({ edge, other, label, years }): Fact => {
        const sentence = `${node.name} ${label} ${other.name}`
        return { kind: 'edge', record: edge, label: sentence, flagLabel: sentence, years: years || undefined }
      }),
    ),
  ]
}

