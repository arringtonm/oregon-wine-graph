// Stage 1 of the record check: download every page the data cites, once, as plain text.
// Pages are cached under .cache/sources (git-ignored); only scores derived from them
// are ever committed. Run with: npm run check:fetch [-- --failed]
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readGraph } from '../reviewPlugin'
import { htmlToText } from './html'

export type FetchStatus = 'ok' | 'blocked' | 'not-found' | 'empty' | 'not-text' | 'error'

export interface CachedSource {
  url: string
  status: FetchStatus
  fetchedAt: string
  detail?: string
  text: string
  // Local image files that are part of the source, such as a label approval's labels
  images?: string[]
}

export const CACHE_DIR = resolve('.cache/sources')
// Below this, a page is a shell (JavaScript-only site, consent wall) rather than an article
const MIN_TEXT_LENGTH = 400
const NOT_TEXT_HOSTS = /(^|\.)(youtu\.be|youtube\.com|podcasts\.apple\.com|open\.spotify\.com)$/

export function cachePath(url: string): string {
  return join(CACHE_DIR, `${createHash('sha1').update(url).digest('hex')}.json`)
}

export function readCached(url: string): CachedSource | null {
  const file = cachePath(url)
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as CachedSource) : null
}

export { decodeEntities, htmlToText } from './html'

// Kit (ConvertKit) newsletter posts render client-side; the article is in embedded JSON
function kitPostHtml(page: string): string | null {
  const match = page.match(/"content":("(?:[^"\\]|\\.)*")/)
  return match ? (JSON.parse(match[1]) as string) : null
}

// The Method Oregon trail map renders client-side; its wineries are in the page's embedded
// Next.js data. Each becomes a paragraph: name, region, address, website and descriptions.
export function methodTrailHtml(page: string): string | null {
  const flight = [...page.matchAll(/self\.__next_f\.push\((\[[\s\S]*?\])\)<\/script>/g)]
    .map((match) => JSON.parse(match[1]) as unknown[])
    .map((chunk) => (typeof chunk[1] === 'string' ? chunk[1] : ''))
    .join('')
  const wineries = new Map<string, Record<string, string>>()
  for (const start of flight.matchAll(/\{"slug":"/g)) {
    let depth = 0
    for (let i = start.index; i < flight.length; i++) {
      if (flight[i] === '{') depth++
      else if (flight[i] === '}' && --depth === 0) {
        try {
          const winery = JSON.parse(flight.slice(start.index, i + 1)) as Record<string, string>
          if (winery.name && winery.address && !wineries.has(winery.slug)) wineries.set(winery.slug, winery)
        } catch {
          // a fragment that only looks like a winery
        }
        break
      }
    }
  }
  if (wineries.size === 0) return null
  const title = page.match(/<title>([^<]*)<\/title>/)?.[1] ?? ''
  const paragraph = (text: string) => `<p>${text.replace(/</g, '&lt;')}</p>`
  return [
    `<h1>${title}</h1>`,
    ...[...wineries.values()].map((winery) =>
      paragraph(
        [`${winery.name} (${winery.region})`, winery.address, winery.website, winery.description, winery.longDescription]
          .filter(Boolean)
          .join('. ')
          .replace(/\.\s*\./g, '.'),
      ),
    ),
  ].join('\n')
}

async function fetchSource(url: string): Promise<CachedSource> {
  // Label approvals: the form's text plus the label images, through the registry's own
  // slower, session-keeping client
  if (/(^|\.)ttbonline\.gov$/.test(new URL(url).hostname)) {
    const { fetchColaSource } = await import('../cola/source')
    return fetchColaSource(url)
  }
  // The OpenML wine reviews dataset: only the four fields used from each Oregon review
  if (url === 'https://www.openml.org/d/42074') {
    const { openmlSourceText } = await import('../openml/dataset')
    return { url, status: 'ok', fetchedAt: new Date().toISOString(), text: await openmlSourceText() }
  }
  const direct = await fetchDirect(url)
  if (!['blocked', 'empty', 'not-found', 'error'].includes(direct.status)) return direct
  // A page that is blocked, gone or empty today may be readable as the Internet Archive kept it
  const archived = await fetchArchived(url)
  return archived ?? direct
}

const cachedSource = (url: string, status: FetchStatus, text = '', detail?: string): CachedSource => ({
  url,
  status,
  fetchedAt: new Date().toISOString(),
  ...(detail ? { detail } : {}),
  text,
})

// Turns a fetched response into text: PDFs through unpdf, pages through the site extractors
async function responseText(url: string, response: Response): Promise<{ text: string } | { notText: string }> {
  const type = response.headers.get('content-type') ?? ''
  if (/pdf/.test(type) || (/octet-stream/.test(type) && /\.pdf($|\?)/i.test(url))) {
    const { extractText, getDocumentProxy } = await import('unpdf')
    const pdf = await getDocumentProxy(new Uint8Array(await response.arrayBuffer()))
    const { text } = await extractText(pdf, { mergePages: true })
    return { text: (Array.isArray(text) ? text.join('\n') : text).replace(/[ \t]+/g, ' ').trim() }
  }
  if (!/text|html|xml|json/.test(type)) return { notText: type }
  const page = await response.text()
  const { hostname, pathname } = new URL(url)
  const html = hostname.endsWith('kit.com')
    ? (kitPostHtml(page) ?? page)
    : hostname.endsWith('methodoregon.com') && pathname.startsWith('/trail')
      ? (methodTrailHtml(page) ?? page)
      : page
  return { text: htmlToText(html) }
}

const request = (url: string) =>
  fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; oregon-wine-graph source check)',
      accept: 'text/html,application/xhtml+xml,text/plain,application/pdf',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
  })

async function fetchDirect(url: string): Promise<CachedSource> {
  if (NOT_TEXT_HOSTS.test(new URL(url).hostname)) return cachedSource(url, 'not-text')
  try {
    const response = await request(url)
    if (response.status === 404 || response.status === 410) return cachedSource(url, 'not-found', '', `HTTP ${response.status}`)
    if (!response.ok) return cachedSource(url, 'blocked', '', `HTTP ${response.status}`)
    const result = await responseText(url, response)
    if ('notText' in result) return cachedSource(url, 'not-text', '', result.notText)
    return result.text.length < MIN_TEXT_LENGTH ? cachedSource(url, 'empty', result.text) : cachedSource(url, 'ok', result.text)
  } catch (error) {
    return cachedSource(url, 'error', '', error instanceof Error ? error.message : String(error))
  }
}

// The Internet Archive is asked one request at a time, a second apart, whichever sites ask
let archiveTurn: Promise<unknown> = Promise.resolve()
function archiveRequest(url: string): Promise<Response> {
  const turn = archiveTurn.then(async () => {
    const response = await request(url)
    await new Promise((done) => setTimeout(done, 1000))
    return response
  })
  archiveTurn = turn.catch(() => undefined)
  return turn
}

// The newest Wayback Machine copy of a page, read the same way as the live page
export async function fetchArchived(url: string): Promise<CachedSource | null> {
  try {
    const lookup = await archiveRequest(`https://archive.org/wayback/available?url=${encodeURIComponent(url)}`)
    if (!lookup.ok) return null
    const closest = ((await lookup.json()) as { archived_snapshots?: { closest?: { available: boolean; timestamp: string } } })
      .archived_snapshots?.closest
    if (!closest?.available) return null
    // id_ asks for the page as archived, without the Wayback Machine's toolbar
    const response = await archiveRequest(`https://web.archive.org/web/${closest.timestamp}id_/${url}`)
    if (!response.ok) return null
    const result = await responseText(url, response)
    if ('notText' in result || result.text.length < MIN_TEXT_LENGTH) return null
    const date = `${closest.timestamp.slice(0, 4)}-${closest.timestamp.slice(4, 6)}-${closest.timestamp.slice(6, 8)}`
    return cachedSource(url, 'ok', result.text, `archived copy, ${date}`)
  } catch {
    return null
  }
}

// Fetches one page into the cache, for tools that add sources outside a full check:fetch run
export async function fetchAndCache(url: string): Promise<CachedSource> {
  mkdirSync(CACHE_DIR, { recursive: true })
  const source = await fetchSource(url)
  writeFileSync(cachePath(url), JSON.stringify(source))
  return source
}

export function citedUrls(): string[] {
  const graph = readGraph(resolve('src/data'))
  const urls = new Set<string>()
  for (const record of [...graph.nodes, ...graph.edges]) {
    for (const source of record.sources) if (source.url) urls.add(source.url)
  }
  return [...urls].sort()
}

async function main() {
  const refetch = process.argv.includes('--refetch')
  mkdirSync(CACHE_DIR, { recursive: true })
  // --failed tries again every page that could not be read last time
  const failed = process.argv.includes('--failed')
  const pending = citedUrls().filter((url) => refetch || !readCached(url) || (failed && readCached(url)!.status !== 'ok'))
  console.log(`${citedUrls().length} cited pages, ${pending.length} to fetch`)

  // One request a second per site; sites in parallel
  const byHost = new Map<string, string[]>()
  for (const url of pending) {
    const host = new URL(url).hostname
    byHost.set(host, [...(byHost.get(host) ?? []), url])
  }
  await Promise.all(
    [...byHost.values()].map(async (urls) => {
      for (const url of urls) {
        const source = await fetchSource(url)
        writeFileSync(cachePath(url), JSON.stringify(source))
        if (source.status !== 'ok' && source.status !== 'not-text') {
          console.log(`  ${source.status.padEnd(9)} ${url} ${source.detail ?? ''}`)
        }
        // The COLA registry client keeps its own, slower pace, and most approvals come from its cache
        if (!url.includes('ttbonline.gov')) await new Promise((done) => setTimeout(done, 1000))
      }
    }),
  )

  const counts: Record<string, number> = {}
  for (const url of citedUrls()) {
    const status = readCached(url)?.status ?? 'missing'
    counts[status] = (counts[status] ?? 0) + 1
  }
  console.log(counts)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
