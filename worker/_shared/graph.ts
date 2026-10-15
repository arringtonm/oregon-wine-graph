// The graph as Ask needs it, built straight from the data files at start-up. No validation
// (the build already checks the data) and without fields Ask never reads, such as sources,
// interviews and addresses, to keep start-up and memory small.
import type { Graph, GraphEdge, GraphNode } from '../../src/data/schema'
import avas from '../../src/data/nodes/avas.json'
import events from '../../src/data/nodes/events.json'
import organizations from '../../src/data/nodes/organizations.json'
import people from '../../src/data/nodes/people.json'
import vineyards from '../../src/data/nodes/vineyards.json'
import wineries from '../../src/data/nodes/wineries.json'
import edges from '../../src/data/edges.json'

type Loose = Record<string, unknown>
const DROP = new Set(['sources', 'interviews', 'address', 'coordinates', 'verified', 'verifiedBy'])
const slim = <T>(record: Loose) =>
  Object.fromEntries(Object.entries(record).filter(([key]) => !DROP.has(key))) as T

export const graph: Graph = {
  nodes: [...people, ...wineries, ...vineyards, ...avas, ...organizations, ...events].map((node) =>
    slim<GraphNode>({ ...(node as Loose), sources: [] }),
  ),
  edges: (edges as Loose[]).map((edge) => slim<GraphEdge>({ ...edge, sources: [] })),
}
