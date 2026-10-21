// New Oregon wineries: the wineries in the OpenML reviews with no record yet, kept only when
// the federal label registry confirms them. A winery qualifies when approvals of its own brand
// were filed under an Oregon permit (which places the business in Oregon) and at least one
// AVA can be cited for it, from its reviews or its labels, so the new record has a connection.
// Its approvals are added to tools/cola/wineries.json, so cola:read and cola:build cover it
// once merged. Run with: npm run cola:new-wineries [-- --limit 20]
// (writes .cache/cola/new-wineries.json for discover:merge)
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Graph, GraphEdge, GraphNode, Source } from '../../src/data/schema'
import { nameKey } from '../check/duplicates'
import { slugify } from '../jev/parseConnection'
import { OPENML_SOURCE, readOregonFacts, type ReviewFacts } from '../openml/dataset'
import { readGraph } from '../reviewPlugin'
import { avaFor, colaSource, variety } from './build'
import { CACHE_DIR, hasForm, Registry, type ColaForm } from './registry'
import { approvalsFor, readWineries, searchNames, writeWineries } from './search'

// Forms fetched per candidate, newest first, for its appellations and permit address
const FORMS_PER_WINERY = 3

const STREET = /^(rd|road|st|street|ave|avenue|hwy|highway|ln|lane|dr|drive|way|blvd|ct|court|pl|place|loop|pkwy|box|ste|suite|unit|n|s|e|w|ne|nw|se|sw)$/i

// "Audeant Wines, Knox W Farm LLC 32230 NE OLD PARRETT MOUNTAIN RD Newberg OR 97132" -> "Newberg, OR".
// The city is the last few words before the state and ZIP, back to the street or a number.
export function placeFromApplicant(applicant: string): string | undefined {
  const match = applicant.match(/^(.*?)\s+OR\s+97\d{3}\b/)
  if (!match) return undefined
  const city: string[] = []
  for (const word of match[1].split(/\s+/).reverse()) {
    if (STREET.test(word.replace(/[.,]/g, '')) || /\d|#|,/.test(word) || city.length === 3) break
    city.unshift(word)
  }
  if (city.length === 0) return undefined
  const name = city
    .join(' ')
    .toLowerCase()
    .replace(/(^|[\s-])([a-z])/g, (_, before: string, letter: string) => before + letter.toUpperCase())
  return `${name}, OR`
}

// "the Willamette Valley", "the Dundee Hills", but "Ribbon Ridge", "Yamhill-Carlton"
const withArticle = (ava: string) => (/ (Valley|Hills|Mountains|Gorge|District|Corridor|Coast)$/.test(ava) ? `the ${ava}` : ava)

// A summary that says only what one of the cited approvals does: the grape and AVA its label
// names, the pair the winery's approvals name most often. One pair, as a list of every grape
// and AVA reads as contradicted by each approval that names only some of them. The permit
// holder's city is left out, as it is often a custom-crush facility rather than the winery.
// That the summary rests on approvals is said in its verification note instead. `home` is
// where the winery is; empty for one known to be based outside Oregon, whose Oregon label
// permit would read as contradicting any other state named here.
export function labelSummary(forms: ColaForm[], avaName: (appellation: string) => string | undefined, home = 'Oregon'): string {
  const tally = new Map<string, { grape: string; ava?: string; count: number }>()
  for (const form of forms) {
    const grape = variety(form.varietals)
    const ava = avaName(form.appellation)
    if (!grape && !ava) continue
    const key = `${grape}|${ava ?? ''}`
    const entry = tally.get(key) ?? { grape, ava, count: 0 }
    // A pair naming both counts for more than one naming only a grape or an AVA
    entry.count += grape && ava ? 2 : 1
    tally.set(key, entry)
  }
  const best = [...tally.values()].sort((a, b) => b.count - a.count)[0]
  const subject = home ? `${home} winery` : 'Winery'
  if (!best) return `${subject}.`
  // "Red blend" is a style, not a grape: "making a red blend"
  const what = ` making ${!best.grape ? 'wine' : / blend$/i.test(best.grape) ? `a ${best.grape.toLowerCase()}` : best.grape}`
  const where = best.ava ? ` from ${withArticle(best.ava)}` : ''
  return `${subject}${what}${where}.`
}

type Node = GraphNode & { verified: false }
type Edge = Omit<GraphEdge, 'verified'> & { verified: false }

export function newWineryRecords(
  graph: Graph,
  name: string,
  reviews: ReviewFacts[],
  forms: ColaForm[],
): { node: Node; edges: Edge[]; notes: string[] } | null {
  const id = slugify(name)
  const notes: string[] = []
  const sameName = graph.nodes.filter((node) => nameKey(node.name) === nameKey(name) || node.id === id)
  if (sameName.some((node) => node.type === 'winery')) return null
  if (sameName.length > 0) notes.push(`${name}: shares a name with ${sameName.map((node) => node.id).join(', ')}`)
  const place = forms[0] ? placeFromApplicant(forms[0].applicant) : undefined
  if (place) notes.push(`${name}: permit address in ${place}, which may be a custom-crush facility`)
  const colaSources = (list: ColaForm[]): Source[] =>
    list.map((form) => colaSource(form, name, variety(form.varietals), form.vintage))

  const edges = new Map<string, Edge>()
  const cite = (avaId: string, sources: Source[]) => {
    const edge = edges.get(avaId) ?? {
      id: `${id}--draws-from--${avaId}`,
      source: id,
      target: avaId,
      type: 'draws_from' as const,
      sources: [],
      verified: false as const,
    }
    for (const source of sources) if (!edge.sources.some((have) => have.url === source.url)) edge.sources.push(source)
    edges.set(avaId, edge)
  }
  for (const row of reviews) {
    const ava = avaFor(graph, row.region)
    if (ava) cite(ava.id, [OPENML_SOURCE])
  }
  for (const form of forms) {
    const ava = avaFor(graph, form.appellation)
    if (ava) cite(ava.id, colaSources([form]))
  }
  if (edges.size === 0) return null
  const node = {
    id,
    type: 'winery',
    name,
    summary: labelSummary(forms, (appellation) => avaFor(graph, appellation)?.name.replace(/ AVA$/, '')),
    sources: [OPENML_SOURCE, ...colaSources(forms)],
    verified: false,
  } as Node
  return { node, edges: [...edges.values()], notes }
}

async function main() {
  const index = process.argv.indexOf('--limit')
  const limit = index === -1 ? Infinity : Number(process.argv[index + 1])
  const graph = readGraph(resolve('src/data'))
  const facts = await readOregonFacts()
  const unmatched = (JSON.parse(readFileSync(resolve('.cache/openml/unmatched-wineries.json'), 'utf8')) as { winery: string }[])
    .map((entry) => entry.winery)
    .slice(0, limit)
  const registry = new Registry()
  const wineries = readWineries()
  const research = { nodes: [] as Node[], edges: [] as Edge[], notes: [] as string[] }
  const skipped: string[] = []

  for (const name of unmatched) {
    const found = approvalsFor({ name }, await searchNames(registry, [name]))
    if (found.ttbIds.length === 0) {
      skipped.push(`${name}: no approvals of its own brand under an Oregon permit`)
      continue
    }
    const recent = found.ttbIds.filter(hasForm).sort().reverse().slice(0, FORMS_PER_WINERY)
    const forms: ColaForm[] = []
    for (const ttbId of recent) {
      try {
        const form = await registry.form(ttbId)
        if (form.status === 'APPROVED') forms.push(form)
      } catch (error) {
        if (!String(error).includes('did not load')) throw error
      }
    }
    forms.sort((a, b) => b.issued.localeCompare(a.issued))
    const records = newWineryRecords(graph, name, facts.filter((row) => row.winery === name), forms)
    if (!records) {
      skipped.push(`${name}: no AVA to cite, or a winery of that name exists`)
      continue
    }
    research.nodes.push(records.node)
    research.edges.push(...records.edges)
    research.notes.push(...records.notes)
    wineries[records.node.id] = found
    console.log(`  ${records.node.id}: ${found.ttbIds.length} approvals; ${records.edges.length} AVAs`)
  }
  writeWineries(wineries)
  research.notes.push(...skipped)
  writeFileSync(join(CACHE_DIR, 'new-wineries.json'), `${JSON.stringify(research, null, 1)}\n`)
  console.log(`${research.nodes.length} new wineries, ${skipped.length} skipped; ${registry.requests} requests`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
