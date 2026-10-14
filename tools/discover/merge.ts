// Merges research files ({ nodes, edges, notes }) into the data files, earliest file first.
// A node id already present is kept as is, gaining the new file's sources and names; a
// relationship already recorded (same source, target and type) gains only its sources.
// Connections to unknown nodes and nodes left without any connection are dropped and
// reported. Existing records keep their position and content; new ones are appended.
// Run with: npm run discover:merge -- <file.json> [<file.json> ...]
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { checkGraph, edgeSchema, nodeSchema, type GraphEdge, type GraphNode, type Source } from '../../src/data/schema'
import { formatRecords, readGraph } from '../reviewPlugin'

const dataDir = resolve('src/data')
const FILES: Record<GraphNode['type'], string> = {
  person: 'people.json',
  winery: 'wineries.json',
  vineyard: 'vineyards.json',
  ava: 'avas.json',
  organization: 'organizations.json',
  event: 'events.json',
}
type Stored = Record<string, unknown> & { id: string; sources: Source[]; name?: string; aka?: string[] }

function addSources(record: Stored, sources: Source[]) {
  for (const source of sources) {
    if (!record.sources.some((existing) => (source.url ? existing.url === source.url : existing.title === source.title))) {
      record.sources.push(source)
    }
  }
}

const files = process.argv.slice(2)
if (files.length === 0) throw new Error('Usage: discover:merge <file.json> ...')

const stored = Object.fromEntries(
  Object.entries(FILES).map(([type, file]) => [type, JSON.parse(readFileSync(join(dataDir, 'nodes', file), 'utf8')) as Stored[]]),
) as Record<GraphNode['type'], Stored[]>
const storedEdges = JSON.parse(readFileSync(join(dataDir, 'edges.json'), 'utf8')) as (Stored & GraphEdge)[]
const nodeById = new Map(Object.values(stored).flat().map((record) => [record.id, record]))
const edgeByKey = new Map(storedEdges.map((edge) => [`${edge.source}|${edge.target}|${edge.type}`, edge]))
const existingIds = new Set(nodeById.keys())
const tally = { nodesAdded: 0, nodesFolded: 0, edgesAdded: 0, edgesFolded: 0, invalid: 0 }
const newNodes: Stored[] = []
const newEdges: (Stored & GraphEdge)[] = []

for (const file of files) {
  const seed = JSON.parse(readFileSync(file, 'utf8')) as { nodes: unknown[]; edges: unknown[] }
  for (const raw of seed.nodes) {
    const parsed = nodeSchema.safeParse({ ...(raw as object), verified: false })
    if (!parsed.success) {
      tally.invalid++
      console.log(`  invalid node in ${file}: ${JSON.stringify(raw).slice(0, 120)}`)
      continue
    }
    const node = parsed.data
    const have = nodeById.get(node.id)
    if (have) {
      addSources(have, node.sources)
      const names = [node.name, ...(node.aka ?? [])].filter((name) => name !== have.name && !(have.aka ?? []).includes(name))
      if (names.length > 0 && !existingIds.has(node.id)) have.aka = [...(have.aka ?? []), ...names]
      tally.nodesFolded++
      continue
    }
    const record = node as unknown as Stored
    nodeById.set(node.id, record)
    newNodes.push(record)
    tally.nodesAdded++
  }
  for (const raw of seed.edges) {
    const parsed = edgeSchema.safeParse({ ...(raw as object), verified: false })
    if (!parsed.success) {
      tally.invalid++
      console.log(`  invalid edge in ${file}: ${JSON.stringify(raw).slice(0, 120)}`)
      continue
    }
    const edge = parsed.data
    const key = `${edge.source}|${edge.target}|${edge.type}`
    const have = edgeByKey.get(key)
    if (have) {
      addSources(have, edge.sources)
      tally.edgesFolded++
      continue
    }
    const record = edge as Stored & GraphEdge
    edgeByKey.set(key, record)
    newEdges.push(record)
    tally.edgesAdded++
  }
}

// Drop new connections to unknown nodes, then new nodes left without a connection
const keptEdges = newEdges.filter((edge) => {
  const ok = nodeById.has(edge.source) && nodeById.has(edge.target)
  if (!ok) console.log(`  dropped connection to an unknown node: ${edge.source} -${edge.type}-> ${edge.target}`)
  return ok
})
const connected = new Set([...storedEdges, ...keptEdges].flatMap((edge) => [edge.source, edge.target]))
const keptNodes = newNodes.filter((node) => {
  if (!connected.has(node.id)) console.log(`  dropped node with no connection: ${node.id}`)
  return connected.has(node.id)
})

// New connection ids follow the convention, numbered after any existing ones
const taken = new Set(storedEdges.map((edge) => edge.id))
for (const edge of keptEdges) {
  const base = `${edge.source}--${edge.type.replace(/_/g, '-')}--${edge.target}`
  let id = base
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`
  edge.id = id
  taken.add(id)
}

// Validate the whole graph before writing anything
const allNodes = [...Object.values(stored).flat(), ...keptNodes] as unknown as GraphNode[]
const allEdges = [...storedEdges, ...keptEdges] as GraphEdge[]
const problems = checkGraph({ nodes: allNodes, edges: allEdges })
if (problems.length > 0) {
  console.log(problems.slice(0, 30).join('\n'))
  throw new Error(`${problems.length} problems; nothing written`)
}

for (const node of keptNodes) stored[node.type as GraphNode['type']].push(node)
for (const [type, file] of Object.entries(FILES)) {
  writeFileSync(join(dataDir, 'nodes', file), formatRecords(stored[type as GraphNode['type']]))
}
writeFileSync(join(dataDir, 'edges.json'), formatRecords(allEdges))
readGraph(dataDir)
console.log({ ...tally, nodesKept: keptNodes.length, edgesKept: keptEdges.length })
