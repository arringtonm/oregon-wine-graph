// Flags from the published site, kept in the Cloudflare D1 database oregon-wine-flags. The
// dev server reads and resolves them through wrangler, which uses `npx wrangler login` (or a
// CLOUDFLARE_API_TOKEN in the environment). Without either, admin mode shows local flags only.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { FlagReason } from '../../src/services/flagTypes'
import type { StoredFlag } from './localStore'

const run = promisify(execFile)
const DATABASE = 'oregon-wine-flags'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

interface Row {
  id: string
  record_kind: 'node' | 'edge'
  record_id: string
  record_label: string
  reason: FlagReason
  note: string | null
  source_url: string | null
  page_url: string
  app_version: string
  created_at: string
  resolved_at: string | null
}

async function query(sql: string): Promise<Row[]> {
  const { stdout } = await run('npx', ['wrangler', 'd1', 'execute', DATABASE, '--remote', '--json', '--command', sql], {
    timeout: 30_000,
  })
  const [result] = JSON.parse(stdout) as { results: Row[]; success: boolean }[]
  if (!result?.success) throw new Error('D1 query failed')
  return result.results
}

export function toStoredFlag(row: Row): StoredFlag {
  return {
    id: row.id,
    source: 'remote',
    recordKind: row.record_kind,
    recordId: row.record_id,
    recordLabel: row.record_label,
    reason: row.reason,
    ...(row.note ? { note: row.note } : {}),
    ...(row.source_url ? { sourceUrl: row.source_url } : {}),
    pageUrl: row.page_url,
    appVersion: row.app_version,
    createdAt: row.created_at,
    ...(row.resolved_at ? { resolvedAt: row.resolved_at } : {}),
  }
}

let warned = false

// The published site's open flags, or none if wrangler can't reach Cloudflare
export async function readRemoteFlags(): Promise<StoredFlag[]> {
  try {
    const rows = await query('SELECT * FROM flags WHERE resolved_at IS NULL ORDER BY created_at')
    warned = false
    return rows.map(toStoredFlag)
  } catch (problem) {
    if (!warned) console.warn(`[flags] Couldn't read flags from the published site (run \`npx wrangler login\`): ${problem}`)
    warned = true
    return []
  }
}

export async function resolveRemoteFlag(id: string): Promise<void> {
  if (!UUID.test(id)) throw new Error('Unknown flag')
  await query(`UPDATE flags SET resolved_at = '${new Date().toISOString()}' WHERE id = '${id}'`)
}
