// Stage 1 of the record check: download every page the data cites, once, as plain text.
// Pages are cached under .cache/sources (git-ignored); only scores derived from them
// are ever committed. Run with: npm run check:fetch
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readGraph } from '../reviewPlugin'

export type FetchStatus = 'ok' | 'blocked' | 'not-found' | 'empty' | 'not-text' | 'error'

export interface CachedSource {
  url: string
  status: FetchStatus
  fetchedAt: string
  detail?: string
  text: string
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

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…',
  szlig: 'ß', aelig: 'æ', AElig: 'Æ', oslash: 'ø', Oslash: 'Ø', ccedil: 'ç', Ccedil: 'Ç',
}
// Accented letters arrive as a base letter plus a mark name: &eacute; &ntilde; &ouml; ...
const MARKS: Record<string, string> = { acute: '\u0301', grave: '\u0300', circ: '\u0302', uml: '\u0308', tilde: '\u0303', ring: '\u030a' }

export function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name: string) => {
      if (ENTITIES[name] ?? ENTITIES[name.toLowerCase()]) return ENTITIES[name] ?? ENTITIES[name.toLowerCase()]
      const accent = name.match(/^([a-z])(acute|grave|circ|uml|tilde|ring)$/i)
      return accent ? (accent[1] + MARKS[accent[2].toLowerCase()]).normalize('NFC') : match
    })
}

function stripMarkup(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|head)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/?(p|div|br|li|tr|h[1-6]|section|article|blockquote|td)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t ​‌]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
}

export function htmlToText(html: string): string {
  return decodeEntities(stripMarkup(html))
    .replace(/[ \t\u00a0]+/g, ' ')
    .trim()
}

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
  const result = (status: FetchStatus, text = '', detail?: string): CachedSource => ({
    url,
    status,
    fetchedAt: new Date().toISOString(),
    ...(detail ? { detail } : {}),
    text,
  })
  if (NOT_TEXT_HOSTS.test(new URL(url).hostname)) return result('not-text')
  try {
    const response = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; oregon-wine-graph source check)',
        accept: 'text/html,application/xhtml+xml,text/plain',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(30_000),
    })
    if (response.status === 404 || response.status === 410) return result('not-found', '', `HTTP ${response.status}`)
    if (!response.ok) return result('blocked', '', `HTTP ${response.status}`)
    const type = response.headers.get('content-type') ?? ''
    if (!/text|html|xml|json/.test(type)) return result('not-text', '', type)
    const page = await response.text()
    const { hostname, pathname } = new URL(url)
    const html = hostname.endsWith('kit.com')
      ? (kitPostHtml(page) ?? page)
      : hostname.endsWith('methodoregon.com') && pathname.startsWith('/trail')
        ? (methodTrailHtml(page) ?? page)
        : page
    const text = htmlToText(html)
    return text.length < MIN_TEXT_LENGTH ? result('empty', text) : result('ok', text)
  } catch (error) {
    return result('error', '', error instanceof Error ? error.message : String(error))
  }
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
  const pending = citedUrls().filter((url) => refetch || !readCached(url))
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
        await new Promise((done) => setTimeout(done, 1000))
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
