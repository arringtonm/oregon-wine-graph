// Stage 2 of the record check: judge every record against the pages it cites and store
// the raw scores. Run with: npm run check [-- --limit 50] [--host weinnotes] [--force] [--drafts]
// --drafts limits the run to unverified records (with --force, rechecks them all); --kind
// node|edge limits it to one kind.
import { resolve } from 'node:path'
import { loadEnv } from 'vite'
import { jevModel } from '../jev/model'
import { readGraph } from '../reviewPlugin'
import { checkRecord } from './checkRecord'
import { claimsFingerprint, claimsFor, recordKey, type CheckedRecord } from './claims'
import { APPLY_THRESHOLD, decide } from './decide'
import { readCached } from './fetchSources'
import { pool } from './pool'
import { compact, readChecks, writeChecks } from './store'

const CONCURRENCY = 8

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? undefined : process.argv[index + 1]
}

async function main() {
  const apiKey = loadEnv('development', process.cwd(), '').JEV_API_KEY
  if (!apiKey) throw new Error('Set JEV_API_KEY in .env.local to run the check')
  const model = jevModel(apiKey)
  const graph = readGraph(resolve('src/data'))
  const store = readChecks()
  const force = process.argv.includes('--force')
  const host = option('host')
  const limit = Number(option('limit') ?? Infinity)
  const drafts = process.argv.includes('--drafts')
  const kind = option('kind')

  const all: CheckedRecord[] = [
    ...graph.nodes.map((record) => ({ kind: 'node' as const, record })),
    ...graph.edges.map((record) => ({ kind: 'edge' as const, record })),
  ]
  const pending = all
    .filter((item) => !host || item.record.sources.some((source) => source.url?.includes(host)))
    .filter((item) => !drafts || !item.record.verified)
    .filter((item) => !kind || item.kind === kind)
    .filter(
      (item) =>
        force ||
        store[recordKey(item)]?.fingerprint !== claimsFingerprint(claimsFor(item, graph)) ||
        // Checked before a source was fetched: check again now that it can be read
        store[recordKey(item)]!.sources.some(
          (source) => source.status === 'unreadable' && source.url && readCached(source.url)?.status === 'ok',
        ),
    )
    .slice(0, limit)
  // Drop results for records that no longer exist (removed, or renamed by a change of type)
  const keys = new Set(all.map(recordKey))
  for (const key of Object.keys(store)) if (!keys.has(key)) delete store[key]
  console.log(`${all.length} records, ${pending.length} to check`)

  let done = 0
  let failed = 0
  await pool(pending, CONCURRENCY, async (item) => {
    try {
      const checks = await checkRecord(item, graph, model, readCached)
      store[recordKey(item)] = {
        fingerprint: claimsFingerprint(claimsFor(item, graph)),
        checkedAt: new Date().toISOString().slice(0, 10),
        sources: compact(checks),
      }
    } catch (error) {
      failed++
      console.log(`  failed ${recordKey(item)}: ${error instanceof Error ? error.message : error}`)
    }
    if (++done % 200 === 0) {
      writeChecks(store)
      console.log(`  ${done}/${pending.length}`)
    }
  })
  writeChecks(store)

  const verdicts: Record<string, number> = {}
  for (const item of all) {
    const stored = store[recordKey(item)]
    if (!stored) continue
    const { verdict } = decide(stored.sources, Object.keys(claimsFor(item, graph).details), APPLY_THRESHOLD)
    verdicts[verdict] = (verdicts[verdict] ?? 0) + 1
  }
  console.log(`failed: ${failed}; verdicts at threshold ${APPLY_THRESHOLD}:`, verdicts)
}

await main()
