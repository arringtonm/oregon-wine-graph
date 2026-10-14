// Stage 3 of the record check: mark as verified the records Jev found supported by their
// own sources, noting that Jev verified them. Run with:
//   npm run check:apply            apply at the agreed threshold
//   npm run check:apply -- --undo  unverify everything Jev verified
import { resolve } from 'node:path'
import { readGraph, setVerifiedWhere } from '../reviewPlugin'
import { claimsFingerprint, claimsFor, recordKey, type CheckedRecord } from './claims'
import { APPLY_THRESHOLD, decide } from './decide'
import { readChecks } from './store'

const dataDir = resolve('src/data')

if (process.argv.includes('--undo')) {
  const undone = setVerifiedWhere(dataDir, (_kind, record) => record.verifiedBy === 'jev', false, 'jev')
  console.log(`Unverified ${undone} records that Jev had verified`)
} else {
  const graph = readGraph(dataDir)
  const store = readChecks()
  const all: CheckedRecord[] = [
    ...graph.nodes.map((record) => ({ kind: 'node' as const, record })),
    ...graph.edges.map((record) => ({ kind: 'edge' as const, record })),
  ]
  const supported = new Set<string>()
  let stale = 0
  for (const item of all) {
    if (item.record.verified) continue
    const claims = claimsFor(item, graph)
    const stored = store[recordKey(item)]
    // A record edited since it was checked must be checked again before it can be verified
    if (!stored || stored.fingerprint !== claimsFingerprint(claims)) {
      stale++
      continue
    }
    if (decide(stored.sources, Object.keys(claims.details), APPLY_THRESHOLD).verdict === 'supported') {
      supported.add(recordKey(item))
    }
  }
  const changed = setVerifiedWhere(dataDir, (kind, record) => supported.has(`${kind}:${record.id}`), true, 'jev')
  console.log(`Verified ${changed} records at threshold ${APPLY_THRESHOLD}; ${stale} not checked or stale`)
}
