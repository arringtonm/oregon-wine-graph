// Downloads the article pages listed in a publication's sitemap into .cache/<name>/, as
// plain text, one request a second. Used to look for new sources of nodes.
// Run with: npm run discover:crawl -- <name> <sitemap-url>
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodeEntities, htmlToText } from '../check/fetchSources'

export interface Article {
  url: string
  status: 'ok' | 'empty' | 'failed'
  title: string
  text: string
}

export function articleDir(name: string): string {
  return resolve('.cache', name)
}

export function readArticles(name: string): Article[] {
  const dir = articleDir(name)
  return readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => JSON.parse(readFileSync(join(dir, file), 'utf8')) as Article)
}

const get = (url: string) =>
  fetch(url, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; oregon-wine-graph research)' },
    signal: AbortSignal.timeout(30_000),
  })

// Article pages are single-segment slugs; section pages, query pages and files are not
async function articleUrls(sitemapUrl: string): Promise<string[]> {
  const xml = await (await get(sitemapUrl)).text()
  const locations = [...xml.matchAll(/<loc>(?:<!\[CDATA\[)?([^<\]]+)/g)].map((match) => match[1].trim())
  const nested = locations.filter((location) => location.endsWith('.xml'))
  const urls = locations.filter((location) => /^https?:\/\/[^/]+\/[a-z0-9]+(?:-[a-z0-9]+)+\/?$/.test(location))
  for (const child of nested) urls.push(...(await articleUrls(child)))
  return [...new Set(urls)]
}

async function main() {
  const [name, sitemapUrl] = process.argv.slice(2)
  if (!name || !sitemapUrl) throw new Error('Usage: discover:crawl <name> <sitemap-url>')
  const dir = articleDir(name)
  mkdirSync(dir, { recursive: true })
  const urls = await articleUrls(sitemapUrl)
  const pending = urls.filter((url) => !existsSync(join(dir, `${new URL(url).pathname.replace(/\W+/g, '_')}.json`)))
  console.log(`${urls.length} article pages, ${pending.length} to fetch`)

  let done = 0
  for (const url of pending) {
    let article: Article = { url, status: 'failed', title: '', text: '' }
    try {
      const response = await get(url)
      if (response.ok) {
        const html = await response.text()
        const title = decodeEntities(html.match(/<title[^>]*>([^<]*)/i)?.[1] ?? '').trim()
        const text = htmlToText(html)
        article = { url, status: text.length < 600 ? 'empty' : 'ok', title, text }
      }
    } catch {
      // recorded as failed
    }
    writeFileSync(join(dir, `${new URL(url).pathname.replace(/\W+/g, '_')}.json`), JSON.stringify(article))
    if (++done % 100 === 0) console.log(`  ${done}/${pending.length}`)
    await new Promise((resolveWait) => setTimeout(resolveWait, 1000))
  }
  const counts: Record<string, number> = {}
  for (const article of readArticles(name)) counts[article.status] = (counts[article.status] ?? 0) + 1
  console.log(counts)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
