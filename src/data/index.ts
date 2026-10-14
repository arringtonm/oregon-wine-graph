import { checkGraph, graphSchema, type Graph } from './schema'
import people from './nodes/people.json'
import wineries from './nodes/wineries.json'
import vineyards from './nodes/vineyards.json'
import avas from './nodes/avas.json'
import organizations from './nodes/organizations.json'
import events from './nodes/events.json'
import edges from './edges.json'

// The only module that knows where the data lives. Swapping the JSON files for
// Firebase or another backend means reimplementing this function.
export async function loadGraph(): Promise<Graph> {
  const graph = graphSchema.parse({
    nodes: [...people, ...wineries, ...vineyards, ...avas, ...organizations, ...events],
    edges,
  })
  const problems = checkGraph(graph)
  if (problems.length > 0) {
    throw new Error(`Graph data is inconsistent:\n${problems.join('\n')}`)
  }
  return graph
}
