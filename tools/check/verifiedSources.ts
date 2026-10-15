// For each record the record check verified, which of its own sources supported it best,
// as an index into the record's `sources`. Written to src/data/verified-sources.json so the
// published site, which doesn't load checks.json, can name and link that source.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Graph } from '../../src/data/schema'
import { claimsFingerprint, claimsFor, recordKey, type CheckedRecord } from './claims'
import { APPLY_THRESHOLD, decide } from './decide'
import type { CheckStore } from './store'

export function verifiedSourceIndexes(graph: Graph, store: CheckStore): Record<string, number> {
  const all: CheckedRecord[] = [
    ...graph.nodes.map((record) => ({ kind: 'node' as const, record })),
    ...graph.edges.map((record) => ({ kind: 'edge' as const, record })),
  ]
  const indexes: Record<string, number> = {}
  for (const item of all) {
    if (!item.record.verified || item.record.verifiedBy !== 'jev') continue
    const key = recordKey(item)
    const stored = store[key]
    const claims = claimsFor(item, graph)
    // Only a check of the record as it now reads says which source supports it
    if (!stored || stored.fingerprint !== claimsFingerprint(claims)) continue
    const best = decide(stored.sources, Object.keys(claims.details), APPLY_THRESHOLD).bestSource
    const index = item.record.sources.findIndex((source) => source.url === best)
    if (index >= 0) indexes[key] = index
  }
  return Object.fromEntries(Object.entries(indexes).sort(([a], [b]) => a.localeCompare(b)))
}

export function writeVerifiedSources(dataDir: string, graph: Graph, store: CheckStore): number {
  const indexes = verifiedSourceIndexes(graph, store)
  // One record per line, so changes read as short diffs
  const lines = Object.entries(indexes).map(([key, index]) => `  ${JSON.stringify(key)}: ${index}`)
  writeFileSync(join(dataDir, 'verified-sources.json'), `{\n${lines.join(',\n')}\n}\n`)
  return lines.length
}
