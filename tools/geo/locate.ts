// Finds each Oregon winery's visitor address on its own website, has Jev confirm which
// address is the winery's, and geocodes it with the US Census geocoder. Writes `address`
// and `coordinates` onto the node, citing the page. These are for visiting and proximity
// only; a tasting room says nothing about where the grapes grow. Run with: npm run geo:locate
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'
import type { GraphNode } from '../../src/data/schema'
import { htmlToText } from '../check/fetchSources'
import { pool } from '../check/pool'
import { jevModel, type DecisionModel } from '../jev/model'
import { formatRecords, readGraph } from '../reviewPlugin'

const SITE_CACHE = resolve('.cache/sites')
const PAGES = ['/', '/contact', '/contact-us', '/visit', '/visit-us']
const GENERIC = /\b(the|winery|wines?|vineyards?|cellars?|estate|family|company|co|and|of)\b/gi

const STREET = String.raw`(?:Road|Rd|Street|St|Highway|Hwy|Avenue|Ave|Lane|Ln|Drive|Dr|Way|Boulevard|Blvd|Loop|Court|Ct|Place|Pl|Parkway|Pkwy|Circle|Terrace|Trail)`
const ADDRESS = new RegExp(
  // Street names are capitalised words or ordinals ("10th"); a bare number such as a year
  // cannot be part of one, and a number after a colon is a time, not an address
  String.raw`(?<![\d:])\b\d{2,6}\s+(?:[NSEW]{1,2}\.?\s+|North\s+|South\s+|East\s+|West\s+)?(?:[A-Z][\w.'-]*|\d+(?:st|nd|rd|th))(?:\s+(?:[A-Z][\w.'-]*|\d+(?:st|nd|rd|th))){0,4}\s+${STREET}\.?(?:\s+[NSEW]{1,2}\b\.?)?,?\s*(?:(?:Suite|Ste\.?|#|Unit)\s*[\w-]+,?\s*)?[A-Z][a-zA-Z.]+(?:\s+[A-Z][a-zA-Z.]+){0,2},?\s*(?:OR|Oregon)\.?,?\s*97\d{3}`,
  'g',
)

export interface AddressCandidate {
  address: string
  context: string
  url: string
}

export function findAddresses(text: string, url: string): AddressCandidate[] {
  const flat = text.replace(/\s+/g, ' ')
  const found = new Map<string, AddressCandidate>()
  for (const match of flat.matchAll(ADDRESS)) {
    // A street number repeated by the page's markup ("18748 18748 NE ...") is dropped
    const address = match[0].replace(/^(\d+)\s+\1\b/, '$1').trim()
    const key = address.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (!found.has(key)) {
      found.set(key, { address, url, context: flat.slice(Math.max(0, match.index - 160), match.index + match[0].length + 80) })
    }
  }
  return [...found.values()]
}

// A cited site whose host name contains the business's distinctive name: sokolblosser.com
// for Sokol Blosser Winery
export function ownSites(node: GraphNode): string[] {
  const core = node.name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(GENERIC, ' ')
  const words = core.split(/[^a-z0-9]+/).filter((word) => word.length >= 4)
  if (words.length === 0) return []
  const joined = words.join('')
  const hosts = new Set<string>()
  for (const source of node.sources) {
    if (!source.url) continue
    const host = new URL(source.url).hostname.replace(/^www\./, '')
    const label = host.split('.')[0]
    if (label.includes(joined) || words.every((word) => label.includes(word))) hosts.add(new URL(source.url).origin)
  }
  return [...hosts]
}

// For a business with no cited website, the usual domain patterns: abacela.com,
// abacelawines.com, abacelawinery.com, abacelavineyards.com ...
export function guessSites(node: GraphNode): string[] {
  const core = node.name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/['’.]/g, '').replace(GENERIC, ' ')
  const joined = core.split(/[^a-z0-9]+/).filter(Boolean).join('')
  if (joined.length < 4) return []
  return ['', 'wines', 'winery', 'vineyards', 'vineyard', 'cellars', 'estate', 'wine'].map(
    (suffix) => `https://www.${joined}${suffix}.com`,
  )
}

// A guessed site counts only if its home page names the business
async function confirmSite(node: GraphNode, origin: string): Promise<boolean> {
  const core = node.name.replace(GENERIC, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
  const text = (await fetchPage(`${origin}/`)).toLowerCase()
  return core.length >= 4 && text.includes(core)
}

async function fetchPage(url: string): Promise<string> {
  mkdirSync(SITE_CACHE, { recursive: true })
  const file = join(SITE_CACHE, `${createHash('sha1').update(url).digest('hex')}.txt`)
  if (existsSync(file)) return readFileSync(file, 'utf8')
  let text = ''
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; oregon-wine-graph research)' },
      signal: AbortSignal.timeout(20_000),
    })
    if (response.ok && (response.headers.get('content-type') ?? '').includes('html')) text = htmlToText(await response.text())
  } catch {
    // an unreachable page simply contributes no addresses
  }
  writeFileSync(file, text)
  return text
}

async function chooseAddress(model: DecisionModel, node: GraphNode, candidates: AddressCandidate[]) {
  const criteria: Record<string, string> = Object.fromEntries(
    candidates.map((candidate, index) => [`a${index}`, `${candidate.address} — seen as: “…${candidate.context}…”`]),
  )
  criteria.none = 'None of these is the address of this winery or its tasting room.'
  const answers = await model.ask(`${node.name}: ${node.summary}`, {
    address: {
      type: 'choice',
      instructions: `Which of these is the address where ${node.name} makes its wine or receives visitors?`,
      criteria,
    },
  })
  const answer = answers.address
  if (answer?.type !== 'choice' || answer.choice === 'none') return null
  return { candidate: candidates[Number(answer.choice.slice(1))], confidence: answer.confidence }
}

export async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  const url = new URL('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress')
  url.search = new URLSearchParams({ address, benchmark: 'Public_AR_Current', format: 'json' }).toString()
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) return null
  const body = (await response.json()) as {
    result: { addressMatches: { coordinates: { x: number; y: number } }[] }
  }
  const match = body.result.addressMatches[0]
  return match ? { lat: Math.round(match.coordinates.y * 1e5) / 1e5, lng: Math.round(match.coordinates.x * 1e5) / 1e5 } : null
}

async function main() {
  const apiKey = loadEnv('development', process.cwd(), '').JEV_API_KEY
  if (!apiKey) throw new Error('Set JEV_API_KEY in .env.local')
  const model = jevModel(apiKey)
  const dataDir = resolve('src/data')
  const graph = readGraph(dataDir)
  // Wineries only: a vineyard's website is usually its winery's, and the address there is the
  // winery or tasting room, not where the vines grow
  const targets = graph.nodes.filter(
    (node) => node.type === 'winery' && !node.outsideOregon && !node.coordinates,
  )

  const results = new Map<string, { address: string; coordinates: { lat: number; lng: number }; url: string }>()
  const tally = { noSite: 0, noAddress: 0, rejected: 0, notGeocoded: 0, located: 0 }
  await pool(targets, 6, async (node) => {
    let sites = ownSites(node)
    if (sites.length === 0) {
      for (const origin of guessSites(node)) {
        if (await confirmSite(node, origin)) {
          sites = [origin]
          break
        }
      }
    }
    if (sites.length === 0) return void tally.noSite++
    const candidates: AddressCandidate[] = []
    for (const origin of sites) {
      for (const path of PAGES) {
        const url = origin + path
        candidates.push(...findAddresses(await fetchPage(url), url))
        await new Promise((done) => setTimeout(done, 500))
      }
    }
    const unique = [...new Map(candidates.map((candidate) => [candidate.address.toLowerCase(), candidate])).values()].slice(0, 6)
    if (unique.length === 0) return void tally.noAddress++
    const chosen = await chooseAddress(model, node, unique)
    if (!chosen || chosen.confidence < 0.6) return void tally.rejected++
    const coordinates = await geocode(chosen.candidate.address)
    if (!coordinates) return void tally.notGeocoded++
    results.set(node.id, { address: chosen.candidate.address, coordinates, url: chosen.candidate.url })
    tally.located++
  })

  // Write onto the nodes as stored, adding the page the address came from as a source
  for (const file of ['wineries.json']) {
    const path = join(dataDir, 'nodes', file)
    const records = JSON.parse(readFileSync(path, 'utf8')) as (Record<string, unknown> & { id: string; sources: { title: string; url?: string }[] })[]
    for (const record of records) {
      const found = results.get(record.id)
      if (!found) continue
      record.address = found.address
      record.coordinates = found.coordinates
      if (!record.sources.some((source) => source.url === found.url)) {
        record.sources.push({ title: `${record.name as string}: address (${new URL(found.url).hostname})`, url: found.url })
      }
    }
    writeFileSync(path, formatRecords(records))
  }
  console.log(`${targets.length} Oregon wineries without coordinates:`, tally)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
