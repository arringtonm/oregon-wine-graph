// Adds each matched Oregon Wine History Archive page to its node: as an oral history
// interview the detail panel links to, and as a source the record check can read.
// Appends to the records as stored, so nothing else in the files changes.
// Run with: npm run owha:link  (after owha:fetch and owha:match)
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatRecords } from '../reviewPlugin'
import { OWHA_DIR, readPages, type OwhaPage } from './owha'
import type { OwhaMatch } from './owhaMatch'

const dataDir = resolve('src/data')
const FILES = ['people.json', 'wineries.json', 'vineyards.json']

// "KEN WRIGHT" -> "Ken Wright"; "00 WINES COLLECTION" -> "00 Wines collection"
export function displayTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\b([a-z])/g, (letter) => letter.toUpperCase())
    .replace(/\b(And|Of|The|At|In)\b/g, (word, _w, offset) => (offset === 0 ? word : word.toLowerCase()))
    .replace(/\bCollection$/, 'collection')
}

export function sourceTitle(page: OwhaPage): string {
  const year = page.date ? `, ${page.date.slice(0, 4)}` : ''
  return page.kind === 'interview'
    ? `Oral history interview with ${displayTitle(page.title)}${year} (Oregon Wine History Archive)`
    : `${displayTitle(page.title)}${year} (Oregon Wine History Archive)`
}

function main() {
  const pages = new Map(readPages().map((page) => [page.url, page]))
  const matches = JSON.parse(readFileSync(join(OWHA_DIR, 'matches.json'), 'utf8')) as OwhaMatch[]
  const pagesFor = new Map<string, OwhaPage[]>()
  for (const match of matches) {
    const page = pages.get(match.url)
    if (!page) continue
    for (const id of match.nodeIds) pagesFor.set(id, [...(pagesFor.get(id) ?? []), page])
  }

  let interviewsAdded = 0
  let sourcesAdded = 0
  for (const file of FILES) {
    const path = join(dataDir, 'nodes', file)
    type Stored = { id: string; sources: { title: string; url?: string }[]; interviews?: { url: string; title: string; date?: string; minutes?: number }[] }
    const records = JSON.parse(readFileSync(path, 'utf8')) as Stored[]
    for (const record of records) {
      for (const page of pagesFor.get(record.id) ?? []) {
        record.interviews ??= []
        if (!record.interviews.some((interview) => interview.url === page.url)) {
          record.interviews.push({
            url: page.url,
            title: displayTitle(page.title),
            ...(page.date ? { date: page.date } : {}),
            ...(page.minutes ? { minutes: page.minutes } : {}),
          })
          interviewsAdded++
        }
        if (!record.sources.some((source) => source.url === page.url)) {
          record.sources.push({ title: sourceTitle(page), url: page.url })
          sourcesAdded++
        }
      }
    }
    writeFileSync(path, formatRecords(records))
  }
  console.log(`interviews added: ${interviewsAdded}; archive sources added: ${sourcesAdded}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
