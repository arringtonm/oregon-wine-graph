// Tests located vineyards against the official AVA boundaries. A "located in" connection
// the boundaries confirm is marked verified by boundary; one they contradict is reported;
// a located vineyard with no AVA connection gets one to the most specific AVA containing it.
// Wineries are deliberately left out: their address is usually a tasting room or office,
// which can move and can sit outside the AVA its grapes come from.
// Run with: npm run geo:avas
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatRecords, readGraph, setVerifiedWhere } from '../reviewPlugin'
import { avasAt, BOUNDARY_SOURCE, loadBoundaries } from './boundaries'

async function main() {
  const dataDir = resolve('src/data')
  const graph = readGraph(dataDir)
  const boundaries = await loadBoundaries()
  const avaIds = new Set(graph.nodes.filter((node) => node.type === 'ava').map((node) => node.id))
  const located = graph.nodes.filter(
    (node): node is Extract<typeof node, { type: 'winery' | 'vineyard' }> & { coordinates: { lat: number; lng: number } } =>
      node.type === 'vineyard' && !!node.coordinates,
  )

  const confirmed = new Set<string>()
  const contradicted: string[] = []
  const added: Record<string, unknown>[] = []
  const outside: string[] = []
  for (const node of located) {
    const containing = avasAt(boundaries, node.coordinates.lat, node.coordinates.lng).filter((ava) => avaIds.has(ava.id))
    const inside = new Set(containing.map((ava) => ava.id))
    const claimed = graph.edges.filter((edge) => edge.source === node.id && edge.type === 'located_in')
    for (const edge of claimed) {
      if (inside.has(edge.target)) confirmed.add(edge.id)
      else contradicted.push(`${node.name}: recorded in ${edge.target}, but its address is in ${[...inside].join(', ') || 'no AVA'}`)
    }
    if (claimed.length === 0) {
      if (containing.length === 0) {
        outside.push(node.name)
        continue
      }
      const ava = containing[0]
      const addressSource = node.sources.find((source) => source.title.includes(': address ('))
      added.push({
        id: `${node.id}--located-in--${ava.id}`,
        source: node.id,
        target: ava.id,
        type: 'located_in',
        note: `From its address, ${node.address}.`,
        sources: [BOUNDARY_SOURCE, ...(addressSource ? [addressSource] : [])],
        verified: true,
        verifiedBy: 'boundary',
      })
    }
  }

  const verified = setVerifiedWhere(dataDir, (kind, record) => kind === 'edge' && confirmed.has(record.id), true, 'boundary')
  if (added.length > 0) {
    const file = join(dataDir, 'edges.json')
    writeFileSync(file, formatRecords([...JSON.parse(readFileSync(file, 'utf8')), ...added]))
  }
  console.log(`${located.length} located vineyards`)
  console.log(`  existing "located in" confirmed by boundary: ${confirmed.size} (${verified} newly verified)`)
  console.log(`  new "located in" added from the address: ${added.length}`)
  console.log(`  address outside every AVA in the graph: ${outside.length}${outside.length ? ` (${outside.join(', ')})` : ''}`)
  console.log(`  contradicted by boundary: ${contradicted.length}`)
  for (const line of contradicted) console.log(`    ${line}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
