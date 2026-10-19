// OpenML dataset 42074 (WineEnthusiast reviews, June 2017): downloading it and reducing it
// to the four fields this project uses from each Oregon review. Kept free of the graph
// tools so the record check's fetcher can read it without importing them.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Source } from '../../src/data/schema'

export const OPENML_URL = 'https://www.openml.org/d/42074'
export const OPENML_SOURCE: Source = { title: 'WineEnthusiast reviews, scraped June 2017 (OpenML dataset 42074)', url: OPENML_URL }
const DOWNLOAD_URL = 'https://openml.org/data/v1/download/21552912/wine_reviews.arff'
export const CACHE_DIR = resolve('.cache/openml')
const FIELDS = ['country', 'description', 'designation', 'points', 'price', 'province', 'region_1', 'region_2', 'variety', 'winery']

export interface ReviewFacts {
  winery: string
  designation: string
  region: string
  variety: string
}

// One ARFF data line: comma-separated, strings in single quotes with backslash escapes, ? for none
export function arffFields(line: string): (string | null)[] {
  const fields: (string | null)[] = []
  let i = 0
  while (i <= line.length) {
    if (line[i] === "'") {
      let value = ''
      for (i++; i < line.length && line[i] !== "'"; i++) value += line[i] === '\\' ? line[++i] : line[i]
      fields.push(value)
      i += 2
    } else {
      const end = line.indexOf(',', i)
      const value = line.slice(i, end === -1 ? line.length : end)
      fields.push(value === '?' ? null : value)
      i = end === -1 ? line.length + 1 : end + 1
    }
  }
  return fields
}

// The Oregon rows, reduced to the four fields used and with repeats removed
export function oregonFacts(arff: string): ReviewFacts[] {
  const data = arff.slice(arff.search(/^@DATA\s*$/im)).split('\n').slice(1)
  const seen = new Map<string, ReviewFacts>()
  for (const line of data) {
    const values = arffFields(line.trim())
    if (values.length !== FIELDS.length) continue
    const row = Object.fromEntries(FIELDS.map((field, index) => [field, values[index]]))
    if (row.province !== 'Oregon' || !row.winery) continue
    const facts = { winery: row.winery, designation: row.designation ?? '', region: row.region_1 ?? '', variety: row.variety ?? '' }
    seen.set(JSON.stringify(facts), facts)
  }
  return [...seen.values()]
}

export async function readOregonFacts(): Promise<ReviewFacts[]> {
  const path = join(CACHE_DIR, 'oregon.json')
  if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8')) as ReviewFacts[]
  const response = await fetch(DOWNLOAD_URL, { signal: AbortSignal.timeout(300_000) })
  if (!response.ok) throw new Error(`OpenML download failed: HTTP ${response.status}`)
  const facts = oregonFacts(await response.text())
  mkdirSync(CACHE_DIR, { recursive: true })
  writeFileSync(path, JSON.stringify(facts))
  return facts
}

// What the record check reads for this source: one line per winery, listing its wines'
// names, regions and varieties (never review text). Grouped so that everything about a
// winery sits in one short passage, as the check reads only passages around each name.
export function sourceText(facts: ReviewFacts[]): string {
  const byWinery = new Map<string, ReviewFacts[]>()
  for (const row of facts) byWinery.set(row.winery, [...(byWinery.get(row.winery) ?? []), row])
  const list = (values: string[]) => [...new Set(values.filter(Boolean))].join('; ')
  const lines = [...byWinery.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([winery, rows]) => {
      const parts = [
        rows.some((row) => row.designation) && `wines named ${list(rows.map((row) => row.designation))}`,
        `regions ${list(rows.map((row) => row.region)) || 'not given'}`,
        `varieties ${list(rows.map((row) => row.variety))}`,
      ]
      return `${winery}: ${parts.filter(Boolean).join('. Its ')}.`
    })
  return ['WineEnthusiast reviews of Oregon wines, by winery.', ...lines].join('\n')
}

export async function openmlSourceText(): Promise<string> {
  return sourceText(await readOregonFacts())
}
