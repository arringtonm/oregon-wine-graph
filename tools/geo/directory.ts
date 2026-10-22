// Visitor addresses from the Oregon Wine Board's Tasting Room Directory (oregonwine.org),
// for Oregon wineries the graph has no address for yet. Each listing names the winery, its
// website and its tasting room's street address. A winery is matched to a listing by its
// distinctive name, or by its own website where a listing shares it; ambiguous matches are
// listed for a person. The address is cited to the listing and geocoded with the US Census
// geocoder (public domain), or OpenStreetMap's where that has no match; the directory's own map pin (from Google) is used only to catch a
// geocode that lands far from it.
// Run with: npm run geo:directory            (writes)
//           npm run geo:directory -- --dry   (lists the matches only)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { GraphNode } from '../../src/data/schema'
import { formatRecords, readGraph } from '../reviewPlugin'
import { geocode, geocodeOsm } from './locate'
import { nameCore } from './permits'

const API = 'https://www.oregonwine.org/wp-json/wp/v2/listing'
const LISTINGS_FILE = resolve('.cache/geo/owb-listings.json')
const USER_AGENT = 'Mozilla/5.0 (compatible; oregon-wine-graph research)'
// A Census geocode further than this from the directory's pin is held back for a person
const AGREE_KM = 3

export interface Listing {
  name: string
  url: string
  website: string
  address: string
  pin: { lat: number; lng: number } | null
  visits: string
}

interface RawListing {
  title: { rendered: string }
  link: string
  listing_data: {
    website?: string
    tastingRoomAddress?: {
      address?: string
      lat?: number
      lng?: number
      name?: string
      street_number?: string
      street_name_short?: string
      city?: string
      state_short?: string
      post_code?: string
    } | null
    tastingRoomVisitationAvailable?: { label?: string } | null
  }
}

const decode = (text: string) =>
  text
    .replace(/&#0?38;|&amp;/g, '&')
    .replace(/&#8217;|&#039;/g, '’')
    .replace(/&#8211;/g, '–')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))

// "17940 NE Kings Grade, Newberg, OR 97132": from the listing's address parts, or else its
// one-line address. A listing placed only by town or by a plus code ("27FW+9R") has no street
// address to cite, and is left out
export function listingAddress(place: NonNullable<RawListing['listing_data']['tastingRoomAddress']>): string | null {
  if (place.street_number && place.street_name_short && place.city && place.state_short === 'OR' && place.post_code) {
    return `${place.street_number} ${place.street_name_short}, ${place.city}, OR ${place.post_code}`
  }
  const line = place.address?.match(/^(\d+[A-Z]?\s+[^,]+(?:,\s*(?:Suite|Ste|Unit|#)[^,]*)?),\s*([^,]+),\s*(?:OR|Oregon)\s*(\d{5})?(?:,\s*USA)?$/i)
  const zip = line?.[3] ?? place.post_code
  return line && zip ? `${line[1].trim()}, ${line[2].trim()}, OR ${zip}` : null
}

export function parseListings(raw: RawListing[]): Listing[] {
  return raw.flatMap((item) => {
    const place = item.listing_data?.tastingRoomAddress
    const address = place ? listingAddress(place) : null
    if (!place || !address) return []
    return [
      {
        name: decode(item.title.rendered),
        url: item.link,
        website: (item.listing_data.website ?? '').trim(),
        address,
        pin: typeof place.lat === 'number' && typeof place.lng === 'number' ? { lat: place.lat, lng: place.lng } : null,
        visits: item.listing_data.tastingRoomVisitationAvailable?.label ?? '',
      },
    ]
  })
}

// "https://www.Tresorivineyards.com/visit " -> "tresorivineyards.com"
export function siteHost(url: string): string | null {
  const trimmed = url.trim()
  if (!trimmed) return null
  try {
    return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
}

export type DirectoryMatch = { node: GraphNode; listing: Listing } | { node: GraphNode; ambiguous: Listing[] }

// A winery's listing: one whose name has the same distinctive core as the winery's name or
// another name it goes by, or whose website is one the winery's record cites as its own
// (a host containing the name, as ownSites in locate.ts). A core two wineries share matches neither.
export function matchListings(wineries: GraphNode[], listings: Listing[]): DirectoryMatch[] {
  const coresOf = (node: GraphNode) => new Set([node.name, ...(node.aka ?? [])].map(nameCore).filter((core) => core.length >= 3))
  const holders = new Map<string, number>()
  for (const node of wineries) for (const core of coresOf(node)) holders.set(core, (holders.get(core) ?? 0) + 1)
  const byCore = new Map<string, Listing[]>()
  const byHost = new Map<string, Listing[]>()
  for (const listing of listings) {
    const core = nameCore(listing.name)
    byCore.set(core, [...(byCore.get(core) ?? []), listing])
    const host = siteHost(listing.website)
    if (host) byHost.set(host, [...(byHost.get(host) ?? []), listing])
  }
  const matches: DirectoryMatch[] = []
  for (const node of wineries) {
    const found = new Map<string, Listing>()
    for (const core of coresOf(node)) {
      if (holders.get(core) !== 1) continue
      for (const listing of byCore.get(core) ?? []) found.set(listing.url, listing)
    }
    // Its own website, by a cited source whose host carries its name
    const words = [...coresOf(node)].flatMap((core) => core.split(' ')).filter((word) => word.length >= 4)
    for (const source of node.sources) {
      const host = source.url ? siteHost(source.url) : null
      if (!host || words.length === 0 || !words.every((word) => host.split('.')[0].includes(word))) continue
      for (const listing of byHost.get(host) ?? []) found.set(listing.url, listing)
    }
    const candidates = [...found.values()]
    // The same address listed twice (a winery and its second label) is one match
    const addresses = new Set(candidates.map((listing) => listing.address.toLowerCase()))
    if (candidates.length === 0) continue
    if (addresses.size === 1) {
      matches.push({ node, listing: candidates[0] })
      continue
    }
    // Two tasting rooms (an estate and one in town): the one in the winery's own town
    const town = node.place?.split(',')[0].trim().toLowerCase()
    const local = candidates.filter((listing) => listing.address.split(',')[1]?.trim().toLowerCase() === town)
    if (local.length === 1) matches.push({ node, listing: local[0] })
    else matches.push({ node, ambiguous: candidates })
  }
  return matches
}

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

async function loadListings(): Promise<Listing[]> {
  if (!existsSync(LISTINGS_FILE)) {
    const raw: RawListing[] = []
    for (let page = 1; ; page++) {
      const response = await fetch(`${API}?per_page=100&page=${page}&_fields=title,link,listing_data`, {
        headers: { 'user-agent': USER_AGENT },
      })
      if (response.status === 400) break
      if (!response.ok) throw new Error(`Oregon Wine Board directory: HTTP ${response.status}`)
      const batch = (await response.json()) as RawListing[]
      raw.push(...batch)
      if (batch.length < 100) break
      await new Promise((done) => setTimeout(done, 1500))
    }
    mkdirSync(dirname(LISTINGS_FILE), { recursive: true })
    writeFileSync(LISTINGS_FILE, JSON.stringify(raw))
  }
  return parseListings(JSON.parse(readFileSync(LISTINGS_FILE, 'utf8')) as RawListing[])
}

async function main() {
  const dry = process.argv.includes('--dry')
  const dataDir = resolve('src/data')
  const graph = readGraph(dataDir)
  const wineries = graph.nodes.filter((node) => node.type === 'winery' && !node.outsideOregon && !node.closed)
  const listings = await loadListings()
  const matches = matchListings(wineries, listings)

  // Wineries already placed: does the directory agree? Reported, never changed
  const disagree: string[] = []
  for (const match of matches) {
    if ('ambiguous' in match || match.node.type !== 'winery' || !match.node.coordinates || !match.listing.pin) continue
    const km = distanceKm(match.node.coordinates, match.listing.pin)
    if (km > AGREE_KM) disagree.push(`${match.node.name}: ours ${match.node.address}; directory ${match.listing.address} (${km.toFixed(1)} km apart)`)
  }

  const results = new Map<string, { address: string; coordinates: { lat: number; lng: number }; listing: Listing }>()
  const held: string[] = []
  const todo = matches.filter((match) => match.node.type === 'winery' && !match.node.coordinates && !('ambiguous' in match))
  for (const match of todo) {
    if ('ambiguous' in match) continue
    const { listing } = match
    if (dry) {
      console.log(`${match.node.name} (${match.node.place ?? '?'}) <- ${listing.name}: ${listing.address} [${listing.visits}]`)
      continue
    }
    const coordinates = (await geocode(listing.address)) ?? (await geocodeOsm(listing.address))
    if (!coordinates) {
      held.push(`${match.node.name}: ${listing.address} (not found by the Census or OpenStreetMap geocoders)`)
      continue
    }
    if (listing.pin && distanceKm(coordinates, listing.pin) > AGREE_KM) {
      held.push(`${match.node.name}: ${listing.address} (geocoded ${distanceKm(coordinates, listing.pin).toFixed(1)} km from the directory's pin)`)
      continue
    }
    results.set(match.node.id, { address: listing.address, coordinates, listing })
  }

  if (!dry && results.size > 0) {
    const path = join(dataDir, 'nodes', 'wineries.json')
    const records = JSON.parse(readFileSync(path, 'utf8')) as (Record<string, unknown> & { id: string; name: string; sources: { title: string; url?: string }[] })[]
    for (const record of records) {
      const found = results.get(record.id)
      if (!found) continue
      record.address = found.address
      record.coordinates = found.coordinates
      if (!record.sources.some((source) => source.url === found.listing.url)) {
        record.sources.push({ title: `${record.name}: tasting room (Oregon Wine Board directory)`, url: found.listing.url })
      }
    }
    writeFileSync(path, formatRecords(records))
  }

  const ambiguous = matches.filter((match): match is Extract<DirectoryMatch, { ambiguous: Listing[] }> => 'ambiguous' in match)
  const unplaced = wineries.filter((node) => node.type === 'winery' && !node.coordinates).length
  console.log(`\n${listings.length} directory listings; ${unplaced} open Oregon wineries without an address; ${todo.length} of them matched${dry ? '' : `, ${results.size} placed`}`)
  if (held.length) console.log(`\nHeld back for a person:\n  ${held.join('\n  ')}`)
  if (ambiguous.length) {
    console.log('\nSeveral listings with different addresses (choose by hand):')
    for (const { node, ambiguous: options } of ambiguous) console.log(`  ${node.name}: ${options.map((o) => `${o.name}, ${o.address}`).join(' | ')}`)
  }
  if (disagree.length) console.log(`\nAlready placed, but the directory lists somewhere else:\n  ${disagree.join('\n  ')}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
