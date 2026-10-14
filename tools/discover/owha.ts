// Oregon Wine History Archive (Linfield University, oregonwinehistoryarchive.org).
// The site is WordPress and serves every page, with its content, through its public REST
// API, so no crawling is needed. Pages are parsed into interviews and winery or vineyard
// "collections", and cached both here and as sources for the record check.
// Run with: npm run owha:fetch
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cachePath, CACHE_DIR, decodeEntities, htmlToText, type CachedSource } from '../check/fetchSources'

const API = 'https://oregonwinehistoryarchive.org/wp-json/wp/v2/pages'
export const OWHA_DIR = resolve('.cache/owha')
const PAGES_FILE = join(OWHA_DIR, 'pages.json')

interface RawPage {
  id: number
  link: string
  title: { rendered: string }
  content: { rendered: string }
  modified: string
}

export interface OwhaPage {
  url: string
  kind: 'interview' | 'collection' | 'other'
  // Region slug for collections, e.g. "willamette-valley"
  region?: string
  title: string
  interviewer?: string
  // ISO date of the interview, when stated
  date?: string
  minutes?: number
  summary: string
  videoUrl?: string
  transcriptUrl?: string
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

function isoDate(text: string): string | undefined {
  const match = text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(\d{4})\b/)
  if (!match) return undefined
  const month = String(MONTHS.indexOf(match[1].toLowerCase()) + 1).padStart(2, '0')
  return `${match[3]}-${month}-${match[2].padStart(2, '0')}`
}

// "Miglavs, Janis" -> "Janis Miglavs"
function personName(raw: string): string {
  const parts = raw.split(',').map((part) => part.trim())
  return parts.length === 2 && parts[1] ? `${parts[1]} ${parts[0]}` : raw.trim()
}

export function parsePage(raw: Pick<RawPage, 'link' | 'title' | 'content'>): OwhaPage {
  const url = raw.link
  const path = new URL(url).pathname.split('/').filter(Boolean)
  const html = raw.content.rendered
  const text = htmlToText(html).replace(/\s+/g, ' ').trim()
  const kind = path[0] === 'interviews' ? 'interview' : path[0] === 'regions' && path.length === 3 ? 'collection' : 'other'

  const label = (name: string) =>
    text.match(new RegExp(`${name}\\s+(.+?)\\s+(?:Transcript|Duration|Date|Interview Summary|Interviewer|Comments|Rights)\\b`))?.[1]
  const interviewer = label('Interviewer')
  const duration = text.match(/Duration\s+(?:(\d+)\s*hours?,?\s*)?(?:(\d+)\s*minutes?)?/)
  const minutes = duration && (duration[1] || duration[2]) ? Number(duration[1] ?? 0) * 60 + Number(duration[2] ?? 0) : undefined

  let summary =
    text.match(/Interview Summary\s+(.+?)(?:\s+Comments\s|\s+Rights\s|$)/)?.[1] ??
    text.match(/((?:This|These) interviews? (?:is|are|was|were) .+?)(?:\s+Interview photos\b|\s+Comments\s|\s+Rights\s|$)/)?.[1] ??
    text
  summary = summary.trim()

  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((match) => decodeEntities(match[1]))
  const transcriptUrl = hrefs.find(
    (href) => /\.pdf\b|dropbox\.com|netx\.net|digitalcommons\.linfield\.edu\/(?!terms_of_use)/.test(href) && !/terms_of_use/.test(href),
  )
  const embed = html.match(/youtube\.com\/embed\/([\w-]{6,})/)?.[1]

  return {
    url,
    kind,
    ...(kind === 'collection' ? { region: path[1] } : {}),
    title: decodeEntities(raw.title.rendered).trim(),
    ...(interviewer ? { interviewer: personName(interviewer) } : {}),
    ...(isoDate(label('Date') ?? summary) ? { date: isoDate(label('Date') ?? summary) } : {}),
    ...(minutes ? { minutes } : {}),
    summary,
    ...(embed ? { videoUrl: `https://www.youtube.com/watch?v=${embed}` } : {}),
    ...(transcriptUrl ? { transcriptUrl } : {}),
  }
}

export function readPages(): OwhaPage[] {
  return JSON.parse(readFileSync(PAGES_FILE, 'utf8')) as OwhaPage[]
}

async function main() {
  mkdirSync(OWHA_DIR, { recursive: true })
  mkdirSync(CACHE_DIR, { recursive: true })
  const raw: RawPage[] = []
  for (let page = 1; ; page++) {
    const url = `${API}?per_page=100&page=${page}&_fields=id,link,title,content,modified`
    const response = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; oregon-wine-graph research)' } })
    // WordPress answers 400 for a page number past the end
    if (response.status === 400) break
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`)
    const batch = (await response.json()) as RawPage[]
    raw.push(...batch)
    const total = Number(response.headers.get('x-wp-totalpages') ?? page)
    console.log(`  page ${page}/${total}: ${raw.length} pages`)
    if (page >= total || batch.length === 0) break
    await new Promise((done) => setTimeout(done, 1000))
  }

  const pages = raw.map(parsePage)
  writeFileSync(PAGES_FILE, JSON.stringify(pages, null, 1))

  // Cache each page as a source, so the record check can read it without fetching it again
  const fetchedAt = new Date().toISOString()
  for (const page of pages) {
    const lines = [
      page.title,
      page.interviewer ? `Interviewer: ${page.interviewer}` : '',
      page.date ? `Date: ${page.date}` : '',
      page.summary,
    ].filter(Boolean)
    const source: CachedSource = { url: page.url, status: 'ok', fetchedAt, text: lines.join('\n') }
    writeFileSync(cachePath(page.url), JSON.stringify(source))
  }

  const counts: Record<string, number> = {}
  for (const page of pages) {
    const key = page.kind === 'collection' ? `collection:${page.region}` : page.kind
    counts[key] = (counts[key] ?? 0) + 1
  }
  console.log(`${pages.length} pages`, counts)
  console.log(
    `with summary over 100 characters: ${pages.filter((page) => page.summary.length > 100).length}; with date: ${pages.filter((page) => page.date).length}; with transcript link: ${pages.filter((page) => page.transcriptUrl).length}; with video: ${pages.filter((page) => page.videoUrl).length}`,
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
