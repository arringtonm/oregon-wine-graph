// Facts from OpenML dataset 42074: WineEnthusiast reviews scraped in June 2017 (CC BY-NC-SA
// 4.0). Only four fields of each Oregon review are used: winery, designation (the wine's
// name, often a vineyard), region and variety. The reviewers' prose, scores and prices are
// never read, so none of their writing reaches the graph. From those fields: the AVAs a
// winery draws from, and the vineyards (already in the graph) its wines are named for.
// Wineries with no record are listed as candidates for new ones.
// Run with: npm run openml:reviews   (writes .cache/openml/research.json)
import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Graph, GraphEdge, GraphNode } from '../../src/data/schema'
import { nameKey } from '../check/duplicates'
import { avaFor } from '../cola/build'
import { vineyardKey } from '../cola/hints'
import { normalise } from '../discover/owhaMatch'
import { readGraph } from '../reviewPlugin'
import { CACHE_DIR, OPENML_SOURCE, readOregonFacts, type ReviewFacts } from './dataset'

export { arffFields, OPENML_SOURCE, oregonFacts } from './dataset'

type Edge = Omit<GraphEdge, 'verified'> & { verified: false }

export function buildFromReviews(graph: Graph, facts: ReviewFacts[]) {
  const wineries = graph.nodes.filter((node) => node.type === 'winery')
  const vineyards = graph.nodes.filter((node) => node.type === 'vineyard')
  const byKey = new Map<string, GraphNode>()
  for (const winery of wineries) {
    for (const name of [winery.name, ...(winery.aka ?? [])]) if (nameKey(name).length >= 3) byKey.set(nameKey(name), winery)
  }
  const edges = new Map<string, Edge>()
  const unmatched = new Map<string, { winery: string; reviews: number; regions: string[] }>()
  const leads = new Set<string>()
  const add = (source: string, target: string, type: GraphEdge['type'], role?: string) => {
    const existing = graph.edges.find(
      (edge) => edge.source === source && edge.target === target && (edge.type === type || (type === 'sources_from' && edge.type === 'owns')),
    )
    const key = `${source}|${target}`
    if (edges.has(key)) return
    edges.set(key, {
      id: existing?.id ?? `${source}--${type.replace(/_/g, '-')}--${target}`,
      source,
      target,
      type: existing?.type ?? type,
      ...(!existing && role ? { role } : {}),
      sources: [OPENML_SOURCE],
      verified: false,
    })
  }

  for (const row of facts) {
    const winery = byKey.get(nameKey(row.winery))
    if (!winery) {
      const entry = unmatched.get(row.winery) ?? { winery: row.winery, reviews: 0, regions: [] }
      entry.reviews++
      if (row.region && !entry.regions.includes(row.region)) entry.regions.push(row.region)
      unmatched.set(row.winery, entry)
      continue
    }
    const ava = avaFor(graph, row.region)
    if (ava) add(winery.id, ava.id, 'draws_from')
    const designation = ` ${normalise(row.designation)} `
    const vineyard = vineyards.find((candidate) => {
      const key = vineyardKey(candidate.name)
      return key.length >= 4 && designation.includes(` ${key} `)
    })
    if (vineyard) add(winery.id, vineyard.id, 'sources_from', row.designation)
    else if (/\bvineyards?\b|\bvyd\b/i.test(row.designation)) leads.add(`${winery.name}: ${row.designation}`)
  }
  return {
    research: {
      nodes: [],
      edges: [...edges.values()],
      notes: [...leads].sort().map((lead) => `Vineyard named in a review with no record yet: ${lead}`),
    },
    unmatched: [...unmatched.values()].sort((a, b) => b.reviews - a.reviews),
  }
}

async function main() {
  const graph = readGraph(resolve('src/data'))
  const facts = await readOregonFacts()
  const { research, unmatched } = buildFromReviews(graph, facts)
  writeFileSync(join(CACHE_DIR, 'research.json'), `${JSON.stringify(research, null, 1)}\n`)
  writeFileSync(join(CACHE_DIR, 'unmatched-wineries.json'), `${JSON.stringify(unmatched, null, 1)}\n`)
  const existing = new Set(graph.edges.map((edge) => edge.id))
  const folded = research.edges.filter((edge) => existing.has(edge.id)).length
  console.log(
    `${facts.length} Oregon wines; ${research.edges.length - folded} new connections, ${folded} existing gaining the source; ` +
      `${research.notes.length} vineyard leads; ${unmatched.length} wineries with no record (.cache/openml/unmatched-wineries.json)`,
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
