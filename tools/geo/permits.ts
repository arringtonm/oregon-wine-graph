// Leads for wineries with no visitor address yet: their licensed winery premises, from TTB's
// list of federal wine permits (public under FOIA, published as a CSV). A winery is matched to
// a permit by its distinctive name; where it holds several, the one in its own town is taken.
// The premises is where the wine is made under bond: often the estate and tasting room, but
// for a small label it can be a shared custom-crush winery. So it's never written as a
// visitor address; it's a lead for research, and evidence of where a wine is made.
// Run with: npm run geo:permits
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { GraphNode } from '../../src/data/schema'
import { readGraph } from '../reviewPlugin'

// TTB moves the file when it updates it; the list page links the current one
const PERMITS_URL = 'https://www.ttb.gov/system/files/2025-04/FRL_Wine_Producer_and_Blender_Permit_List.csv'
export const PERMITS_SOURCE = {
  title: 'Wine producer and blender permits (TTB list of permittees)',
  url: 'https://www.ttb.gov/public-information/foia/list-of-permittees',
}
const PERMITS_FILE = resolve('.cache/geo/ttb-wine-permits.csv')

export interface Permit {
  permit: string
  owner: string
  operating: string
  street: string
  city: string
  zip: string
}

// One CSV line, with quoted fields that may hold commas
function splitCsv(line: string): string[] {
  const fields: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') field += line[++i]
      else if (char === '"') quoted = false
      else field += char
    } else if (char === '"') quoted = true
    else if (char === ',') {
      fields.push(field)
      field = ''
    } else field += char
  }
  fields.push(field)
  return fields
}

export function parsePermits(csv: string): Permit[] {
  const [header, ...lines] = csv.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean)
  const columns = splitCsv(header)
  const at = (name: string) => columns.indexOf(name)
  return lines
    .map(splitCsv)
    .filter((row) => row[at('State')] === 'OR')
    .map((row) => ({
      permit: row[at('Permit_Number')],
      owner: row[at('Owner_Name')],
      operating: row[at('Operating_Name')],
      street: row[at('Street')],
      city: row[at('City')],
      zip: row[at('Prem_Zip')],
    }))
}

// Words that say what kind of business it is rather than which one
const GENERIC = new Set(
  'the a of and llc inc incorporated corp corporation co company ltd lp llp pllc winery wineries wines wine vineyards vineyard cellars cellar estate estates family oregon wineworks group partners partnership dba'.split(' '),
)

// "Domaine Drouhin Oregon, Inc." and "DOMAINE DROUHIN OREGON" both become "domaine drouhin"
export function nameCore(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’.]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((word) => word && !GENERIC.has(word))
    .join(' ')
}

const town = (place: string | undefined) => place?.split(',')[0].trim().toLowerCase().replace(/-/g, ' ')

// Title case for the address as shown: "6750 NE BREYMAN ORCHARDS RD" -> "6750 NE Breyman Orchards Rd"
export function formatStreet(street: string): string {
  return street
    .toLowerCase()
    .replace(/\b([a-z])/g, (letter) => letter.toUpperCase())
    .replace(/\b(Ne|Nw|Se|Sw)\b/g, (direction) => direction.toUpperCase())
    .replace(/\b(\d+)(St|Nd|Rd|Th)\b/g, (_, number: string, suffix: string) => number + suffix.toLowerCase())
}

export type Match = { node: GraphNode; permit: Permit } | { node: GraphNode; ambiguous: Permit[] }

// Each winery's permit, by its name or another name it goes by, against the permit's
// operating or owner name. A name shared by two wineries in the graph matches neither.
export function matchPermits(wineries: GraphNode[], permits: Permit[]): Match[] {
  const owners = new Map<string, string[]>()
  for (const node of wineries) {
    for (const core of new Set([node.name, ...(node.aka ?? [])].map(nameCore))) {
      if (core.length >= 3) owners.set(core, [...(owners.get(core) ?? []), node.id])
    }
  }
  const byCore = new Map<string, Permit[]>()
  for (const permit of permits) {
    for (const core of new Set([permit.operating, permit.owner].filter(Boolean).map(nameCore))) {
      byCore.set(core, [...(byCore.get(core) ?? []), permit])
    }
  }
  const matches: Match[] = []
  for (const node of wineries) {
    const found = new Map<string, Permit>()
    for (const core of new Set([node.name, ...(node.aka ?? [])].map(nameCore))) {
      if ((owners.get(core) ?? []).length !== 1) continue
      for (const permit of byCore.get(core) ?? []) found.set(permit.permit, permit)
    }
    const candidates = [...found.values()]
    if (candidates.length === 0) continue
    if (candidates.length === 1) {
      matches.push({ node, permit: candidates[0] })
      continue
    }
    // Several permits (a second winery, a warehouse): the one in the winery's own town
    const local = candidates.filter((permit) => permit.city.toLowerCase() === town(node.place))
    if (local.length === 1) matches.push({ node, permit: local[0] })
    else matches.push({ node, ambiguous: candidates })
  }
  return matches
}

async function loadPermits(): Promise<Permit[]> {
  if (!existsSync(PERMITS_FILE)) {
    mkdirSync(dirname(PERMITS_FILE), { recursive: true })
    const response = await fetch(PERMITS_URL, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; oregon-wine-graph research)' } })
    if (!response.ok) throw new Error(`TTB permit list: HTTP ${response.status}; check ${PERMITS_SOURCE.url} for its current address`)
    writeFileSync(PERMITS_FILE, await response.text())
  }
  return parsePermits(readFileSync(PERMITS_FILE, 'utf8'))
}

async function main() {
  const graph = readGraph(resolve('src/data'))
  const wineries = graph.nodes.filter((node) => node.type === 'winery' && !node.outsideOregon && !node.closed)
  const unplaced = new Set(wineries.filter((node) => node.type === 'winery' && !node.coordinates).map((node) => node.id))
  const matches = matchPermits(wineries, await loadPermits()).filter((match) => unplaced.has(match.node.id))
  console.log(`${unplaced.size} open Oregon wineries without a visitor address; ${matches.length} hold a federal wine permit:\n`)
  for (const match of matches) {
    const permits = 'ambiguous' in match ? match.ambiguous : [match.permit]
    const where = permits.map(({ permit, street, city, zip }) => `${formatStreet(street)}, ${formatStreet(city)}, OR ${zip} (${permit})`)
    console.log(`  ${match.node.name} (${match.node.place ?? '?'}): ${where.join(' | ')}`)
  }
  console.log(`\nSource: ${PERMITS_SOURCE.url}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
