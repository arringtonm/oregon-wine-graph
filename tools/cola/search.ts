// Stage 1 of the COLA harvest: finds each Oregon winery's federal label approvals. Searches
// the registry for brand names containing the winery's name (and each also-known-as name),
// keeps approvals filed under an Oregon permit whose brand is the winery's own name, and
// records which permits those came from. Wineries outside Oregon are skipped: their approvals
// are import labels for wines made elsewhere. Brands that
// only contain the name, such as a collaboration bottled by another winery, are listed for
// a person to look over rather than used.
// Run with: npm run cola:search [-- --only audeant,the-eyrie-vineyards] [--limit 20]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { GraphNode } from '../../src/data/schema'
import { nameKey } from '../check/duplicates'
import { normalise } from '../discover/owhaMatch'
import { readGraph } from '../reviewPlugin'
import { CACHE_DIR, Registry, type ColaRow } from './registry'

export const WINERIES_FILE = resolve('tools/cola/wineries.json')
const SEARCH_DIR = join(CACHE_DIR, 'search')
// The registry allows at most 15 years per search; its oldest records are from the 1980s
const WINDOW_YEARS = 15
const EARLIEST = '1981-01-01'

// What the harvest found for one winery, kept in the repository so reruns agree
export interface WineryApprovals {
  // Permits whose approvals carry the winery's own brand
  permits: string[]
  // Approvals with the winery's own brand under those permits
  ttbIds: string[]
  // Oregon brands that contain the winery's name but are not it, for a person to look over
  related: { brand: string; permit: string; count: number }[]
}

const GENERIC = /\b(the|winery|wines?|vineyards?|cellars?|estates?|wine co(mpany)?|family|of|and|oregon)\b/g

// "The Eyrie Vineyards" -> "%EYRIE%"; "Domaine Drouhin Oregon" -> "%DOMAINE%DROUHIN%". A short
// distinctive part would match thousands of brands ("%KING%"), so then the whole name is used
// ("%KING%ESTATE%").
export function searchTerm(name: string): string | null {
  const all = normalise(name).replace(/^the /, '').split(/\s+/).filter(Boolean)
  const distinctive = normalise(name).replace(GENERIC, ' ').split(/\s+/).filter(Boolean)
  const words = distinctive.join('').length >= 5 ? distinctive : all
  if (words.join('').length < 4) return null
  return `%${words.join('%').toUpperCase()}%`
}

const isOregonPermit = (permit: string) => /-OR-/i.test(permit)

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

// Consecutive windows of at most 15 years, newest first, back to the registry's start
function windows(): [string, string][] {
  const spans: [string, string][] = []
  let to = new Date(`${today()}T00:00:00Z`)
  while (to.toISOString().slice(0, 10) > EARLIEST) {
    const from = new Date(to)
    from.setUTCFullYear(from.getUTCFullYear() - WINDOW_YEARS)
    from.setUTCDate(from.getUTCDate() + 1)
    spans.push([from.toISOString().slice(0, 10), to.toISOString().slice(0, 10)])
    to = new Date(from)
    to.setUTCDate(to.getUTCDate() - 1)
  }
  return spans
}

function midpoint(from: string, to: string): string {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  return new Date(a + Math.floor((b - a) / 2 / 86_400_000) * 86_400_000).toISOString().slice(0, 10)
}

// Every approval for a term within the dates, splitting the dates whenever a search runs
// into the registry's cap on results. Each search is cached.
async function searchAll(registry: Registry, term: string, from: string, to: string): Promise<ColaRow[]> {
  const path = join(SEARCH_DIR, `${term.replace(/\W+/g, '_')}__${from}__${to}.json`)
  let result: { total: number; rows: ColaRow[] }
  if (existsSync(path)) result = JSON.parse(readFileSync(path, 'utf8'))
  else {
    result = await registry.search(term, from, to)
    mkdirSync(SEARCH_DIR, { recursive: true })
    writeFileSync(path, JSON.stringify(result))
  }
  if (result.rows.length >= result.total || from === to) return result.rows
  const middle = midpoint(from, to)
  const next = new Date(`${middle}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  return [
    ...(await searchAll(registry, term, from, middle)),
    ...(await searchAll(registry, term, next.toISOString().slice(0, 10), to)),
  ]
}

// Every approval whose brand contains any of the names
export async function searchNames(registry: Registry, names: string[]): Promise<ColaRow[]> {
  const terms = [...new Set(names.map(searchTerm).filter((term) => term !== null))]
  const rows = new Map<string, ColaRow>()
  for (const term of terms) {
    for (const [from, to] of windows()) {
      for (const row of await searchAll(registry, term, from, to)) rows.set(row.ttbId, row)
    }
  }
  return [...rows.values()]
}

export function approvalsFor(winery: Pick<GraphNode, 'name' | 'aka'>, rows: ColaRow[]): WineryApprovals {
  const keys = new Set([winery.name, ...(winery.aka ?? [])].map(nameKey).filter((key) => key.length >= 3))
  const allowed = (row: ColaRow) => isOregonPermit(row.permit)
  const own = rows.filter((row) => allowed(row) && keys.has(nameKey(row.brand)))
  const permits = [...new Set(own.map((row) => row.permit))].sort()
  const related = new Map<string, { brand: string; permit: string; count: number }>()
  for (const row of rows) {
    if (!allowed(row) || keys.has(nameKey(row.brand))) continue
    const key = `${row.brand}|${row.permit}`
    const entry = related.get(key) ?? { brand: row.brand, permit: row.permit, count: 0 }
    entry.count++
    related.set(key, entry)
  }
  return {
    permits,
    ttbIds: [...new Set(own.map((row) => row.ttbId))].sort(),
    related: [...related.values()].sort((a, b) => b.count - a.count),
  }
}

export function writeWineries(results: Record<string, WineryApprovals>) {
  writeFileSync(WINERIES_FILE, `${JSON.stringify(results, null, 1)}\n`)
}

export function readWineries(): Record<string, WineryApprovals> {
  return existsSync(WINERIES_FILE) ? JSON.parse(readFileSync(WINERIES_FILE, 'utf8')) : {}
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? undefined : process.argv[index + 1]
}

async function main() {
  const graph = readGraph(resolve('src/data'))
  const only = option('only')?.split(',')
  const limit = Number(option('limit') ?? Infinity)
  const results = readWineries()
  const wineries = graph.nodes
    .filter((node) => node.type === 'winery' && !node.outsideOregon)
    .filter((node) => (only ? only.includes(node.id) : !results[node.id]))
    .slice(0, limit)
  const registry = new Registry()
  console.log(`${wineries.length} wineries to search`)

  for (const winery of wineries) {
    const rows = await searchNames(registry, [winery.name, ...(winery.aka ?? [])])
    results[winery.id] = approvalsFor(winery, rows)
    const found = results[winery.id]
    console.log(
      `  ${winery.id}: ${found.ttbIds.length} approvals under ${found.permits.join(', ') || 'no permit'}` +
        (found.related.length ? `; ${found.related.length} related brands` : ''),
    )
    // Saved after each winery, so a stopped run resumes where it left off
    writeWineries(results)
  }
  console.log(`${registry.requests} requests`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
