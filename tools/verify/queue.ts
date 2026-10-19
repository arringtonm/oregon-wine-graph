// Which draft records to verify first: ranked by what verifying each would do for a reader,
// with the reason each one fails. A draft node hides every connection it is part of when
// "Verified records only" is on, so a node's score is mostly the verified connections it
// would reveal; a draft connection scores most when both its ends are already verified.
// Run with: npm run verify:queue   (writes .cache/verify/queue.json)
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Graph } from '../../src/data/schema'
import { claimsFingerprint, claimsFor, recordKey, type CheckedRecord } from '../check/claims'
import { APPLY_THRESHOLD, CONTRADICTION_THRESHOLD, decide } from '../check/decide'
import { readChecks, type CheckStore } from '../check/store'
import { readGraph } from '../reviewPlugin'
import { readDeadEnds } from './apply'

export interface QueueEntry {
  key: string
  score: number
  // What verifying it would reveal: verified connections a draft node hides
  reveals: number
  category: string
  claims: { main: string; details: Record<string, string> }
  failing: string[]
  sources: { title: string; url?: string; status: string; support?: number; contradiction?: number }[]
  contradictedBy: string[]
}

export function buildQueue(graph: Graph, store: CheckStore, skip = new Set<string>()): QueueEntry[] {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  const degree = new Map<string, number>()
  for (const edge of graph.edges) for (const id of [edge.source, edge.target]) degree.set(id, (degree.get(id) ?? 0) + 1)
  // AVAs join most wineries, so their degree says little about a connection's prominence
  const weight = (id: string) => (byId.get(id)?.type === 'ava' ? 0 : (degree.get(id) ?? 0))

  const items: CheckedRecord[] = [
    ...graph.nodes.map((record) => ({ kind: 'node' as const, record })),
    ...graph.edges.map((record) => ({ kind: 'edge' as const, record })),
  ]
  const entries: QueueEntry[] = []
  for (const item of items) {
    const key = recordKey(item)
    if (item.record.verified || skip.has(key)) continue
    const claims = claimsFor(item, graph)
    const stored = store[key]
    let category = 'unchecked'
    let failing: string[] = []
    if (stored && stored.fingerprint === claimsFingerprint(claims)) {
      const decision = decide(stored.sources, Object.keys(claims.details), APPLY_THRESHOLD)
      failing = decision.failing
      category = decision.verdict === 'partial' ? `partial:${failing.join(',')}` : decision.verdict
      if (decision.verdict === 'unchecked') category = 'unreadable'
    } else if (stored) category = 'stale'

    let reveals = 0
    let score: number
    if (item.kind === 'node') {
      const id = item.record.id
      reveals = graph.edges.filter((edge) => {
        if (!edge.verified || (edge.source !== id && edge.target !== id)) return false
        return byId.get(edge.source === id ? edge.target : edge.source)!.verified
      }).length
      score = reveals * 3 + (degree.get(id) ?? 0)
    } else {
      const edge = item.record
      const visible = byId.get(edge.source)!.verified && byId.get(edge.target)!.verified
      score = (visible ? 2 : 0) + Math.log1p(weight(edge.source) + weight(edge.target)) / 2
    }

    const checks = new Map((stored?.sources ?? []).map((check) => [check.url, check]))
    const sources = item.record.sources.map((source) => {
      const check = source.url ? checks.get(source.url) : undefined
      return {
        title: source.title,
        ...(source.url ? { url: source.url } : {}),
        status: check?.status ?? 'unchecked',
        ...(check?.levels ? { support: check.levels[2] + check.levels[3], contradiction: check.levels[0] } : {}),
      }
    })
    entries.push({
      key,
      score: Math.round(score * 100) / 100,
      reveals,
      category,
      claims: { main: claims.main, details: claims.details },
      failing,
      sources,
      contradictedBy: sources
        .filter((source) => (source.contradiction ?? 0) >= CONTRADICTION_THRESHOLD)
        .map((source) => source.url!),
    })
  }
  return entries.sort((a, b) => b.score - a.score)
}

function main() {
  const graph = readGraph(resolve('src/data'))
  // Records research has already found nothing more for are left out
  const queue = buildQueue(graph, readChecks(), new Set(Object.keys(readDeadEnds())))
  mkdirSync(resolve('.cache/verify'), { recursive: true })
  writeFileSync(resolve('.cache/verify/queue.json'), `${JSON.stringify(queue, null, 1)}\n`)
  const counts: Record<string, number> = {}
  for (const entry of queue) {
    const category = entry.category.split(':')[0]
    counts[category] = (counts[category] ?? 0) + 1
  }
  const hidden = queue.reduce((sum, entry) => sum + entry.reveals, 0)
  console.log(`${queue.length} drafts; ${hidden} verified connections hidden by draft nodes`, counts)
  for (const entry of queue.slice(0, 15)) console.log(`  ${entry.score.toFixed(1).padStart(6)} ${entry.key} (${entry.category})`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
