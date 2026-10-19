// Stage 4 of the COLA harvest: turns label approvals into a research file for
// discover:merge. From each approval's form, the AVAs a winery draws fruit from (its
// appellation box); from the labels Jev has read, the vineyards it buys from or owns.
// A connection the data already has gains the approvals as sources; a new one cites up to
// three approvals. Everything arrives unverified, for the record check to judge.
// Run with: npm run cola:build [-- --only audeant]   (writes .cache/cola/research.json)
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Graph, GraphEdge, GraphNode, Source } from '../../src/data/schema'
import { nameKey } from '../check/duplicates'
import { normalise } from '../discover/owhaMatch'
import { vineyardKey } from './hints'
import { slugify } from '../jev/parseConnection'
import { readGraph } from '../reviewPlugin'
import { CACHE_DIR, colaUrl, type ColaForm } from './registry'
import { readForm, readLabels, READ_THRESHOLD, type LabelReading } from './read'
import { readWineries } from './search'

const MAX_SOURCES = 3
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

type Edge = Omit<GraphEdge, 'id' | 'verified'> & { id: string; verified: false }
type Node = GraphNode & { verified: false }

const longDate = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`

// "Audeant Stardance Vineyard Pinot noir 2023, label approved 22 Aug 2025 (TTB COLA 25233001000429)"
export function colaSource(form: ColaForm, wineryName: string, wine: string, vintage?: number | null): Source {
  const what = [wineryName, wine, vintage ?? ''].filter(Boolean).join(' ')
  return { title: `${what}, label approved ${longDate(form.issued)} (TTB COLA ${form.ttbId})`, url: colaUrl(form.ttbId) }
}

// The newest, the oldest and one between, newest first
export function pickApprovals<T extends { form: ColaForm }>(approvals: T[]): T[] {
  const sorted = [...approvals].sort((a, b) => b.form.issued.localeCompare(a.form.issued))
  if (sorted.length <= MAX_SOURCES) return sorted
  return [sorted[0], sorted[Math.floor(sorted.length / 2)], sorted[sorted.length - 1]]
}

// "PINOT NOIR, CHARDONNAY" style varietals, as the graph writes them: "Pinot noir"
const variety = (varietals: string) => {
  const first = varietals.split(/[,;/&]| and /i)[0]?.trim() ?? ''
  return first ? first[0].toUpperCase() + first.slice(1).toLowerCase() : ''
}

// Labels and reviews spell AVAs loosely: "Yamhill-Carlton District", "Columbia Valley (OR)"
const avaKey = (name: string) =>
  normalise(name.replace(/ AVA$/i, '').replace(/\(.*?\)/g, ''))
    .replace(/ district$/, '')
    .replace(/^the /, '')

export function avaFor(graph: Graph, appellation: string): GraphNode | undefined {
  const key = avaKey(appellation)
  if (!key) return undefined
  return graph.nodes.find((node) => node.type === 'ava' && avaKey(node.name) === key)
}

// discover:merge renumbers new connections; this only has to be a valid id
const edgeId = (source: string, type: GraphEdge['type'], target: string) => `${source}--${type.replace(/_/g, '-')}--${target}`

const existingEdge = (graph: Graph, source: string, target: string, types: GraphEdge['type'][]) =>
  graph.edges.find((edge) => edge.source === source && edge.target === target && types.includes(edge.type))

const yearsNote = (years: number[]) => {
  const sorted = [...new Set(years)].sort()
  if (sorted.length === 0) return undefined
  return `Vintage${sorted.length > 1 ? 's' : ''} on approved labels: ${sorted.join(', ')}.`
}

interface Approval {
  form: ColaForm
  reading?: LabelReading
}

export function buildResearch(
  graph: Graph,
  wineries: Record<string, { ttbIds: string[] }>,
  labels: Record<string, LabelReading>,
  formOf: (ttbId: string) => ColaForm | null = readForm,
  only?: string[],
): { nodes: Node[]; edges: Edge[]; notes: string[] } {
  const nodes = new Map<string, Node>()
  const edges: Edge[] = []
  const notes: string[] = []
  const byId = new Map(graph.nodes.map((node) => [node.id, node]))

  for (const [wineryId, found] of Object.entries(wineries)) {
    if (only && !only.includes(wineryId)) continue
    const winery = byId.get(wineryId)
    if (!winery) continue
    const approvals: Approval[] = found.ttbIds.flatMap((id) => {
      const form = formOf(id)
      return form?.status === 'APPROVED' ? [{ form, reading: labels[id] }] : []
    })

    // The AVAs its labels name, from each form's appellation box
    const byAva = new Map<string, Approval[]>()
    for (const approval of approvals) {
      const ava = avaFor(graph, approval.form.appellation)
      if (ava) byAva.set(ava.id, [...(byAva.get(ava.id) ?? []), approval])
    }
    for (const [avaId, list] of byAva) {
      const ava = byId.get(avaId)!
      const existing = existingEdge(graph, wineryId, avaId, ['draws_from'])
      const sources = pickApprovals(list).map(({ form }) =>
        colaSource(form, winery.name, `${ava.name.replace(/ AVA$/, '')} ${variety(form.varietals)}`.trim(), form.vintage),
      )
      edges.push({
        id: existing?.id ?? edgeId(wineryId, 'draws_from', avaId),
        source: wineryId,
        target: avaId,
        type: 'draws_from',
        sources,
        verified: false,
      })
    }

    // The vineyards its labels name, as Jev or a person read them
    const byVineyard = new Map<string, Approval[]>()
    for (const approval of approvals) {
      const reading = approval.reading
      if (!reading || reading.confidence < READ_THRESHOLD) continue
      const key = reading.vineyard ?? (reading.newVineyard ? `new:${reading.newVineyard}` : null)
      if (key) byVineyard.set(key, [...(byVineyard.get(key) ?? []), approval])
      else if (reading.needsName !== undefined && !reading.newVineyard) {
        notes.push(`${approval.form.ttbId} (${winery.name}): names a vineyard with no record; read the label and set newVineyard`)
      }
    }
    for (const [key, list] of byVineyard) {
      let vineyard = key.startsWith('new:') ? undefined : byId.get(key)
      if (!vineyard) {
        const name = key.slice(4)
        const id = slugify(name)
        // An existing vineyard of the same name under another id ("Johan Vineyards")
        const sameName = graph.nodes.find((node) => node.type === 'vineyard' && vineyardKey(node.name) === vineyardKey(name))
        vineyard = sameName ?? byId.get(id) ?? nodes.get(id)
        if (!vineyard) {
          vineyard = {
            id,
            type: 'vineyard',
            name,
            summary: `Vineyard named on federally approved labels for ${winery.name} wines.`,
            ...(list.some(({ reading }) => reading?.vineyardOutsideOregon) ? { outsideOregon: true } : {}),
            sources: [],
            verified: false,
          } as Node
          nodes.set(id, vineyard as Node)
        }
      }
      const vineyardName = vineyard.name.replace(/\s*\(.*?\)/g, '')
      const varieties = [...new Set(list.map(({ form }) => variety(form.varietals)).filter(Boolean))]
      const named =
        varieties.length > 1 ? `${varieties.slice(0, -1).join(', ')} and ${varieties[varieties.length - 1]}` : (varieties[0] ?? '')
      const wine = `${vineyardName} ${named}`.trim()
      const vintage = (approval: Approval) => approval.form.vintage ?? approval.reading?.vintage
      const sources = pickApprovals(list).map((approval) => colaSource(approval.form, winery.name, wine, vintage(approval)))
      const created = nodes.get(vineyard.id)
      if (created) {
        for (const source of sources) if (!created.sources.some((have) => have.url === source.url)) created.sources.push(source)
        // A label's appellation places a single-vineyard wine's vineyard within it, for AVAs
        // smaller than the Willamette Valley; recorded as a draft for checking like the rest
        const avas = new Set(list.map(({ form }) => avaFor(graph, form.appellation)?.id).filter(Boolean) as string[])
        for (const avaId of avas) {
          if (avaId === 'willamette-valley' || avaId === 'southern-oregon') continue
          edges.push({
            id: edgeId(vineyard.id, 'located_in', avaId),
            source: vineyard.id,
            target: avaId,
            type: 'located_in',
            sources,
            verified: false,
          })
        }
      }
      const existing = existingEdge(graph, wineryId, vineyard.id, ['owns', 'sources_from'])
      // A vineyard carrying the winery's own name ("King Estate Vineyard") is its estate
      const estate = !existing && nameKey(vineyard.name) === nameKey(winery.name)
      const years = list
        .map((approval) => vintage(approval))
        .filter((year): year is number => typeof year === 'number')
      edges.push({
        id: existing?.id ?? edgeId(wineryId, estate ? 'owns' : 'sources_from', vineyard.id),
        source: wineryId,
        target: vineyard.id,
        type: existing?.type ?? (estate ? 'owns' : 'sources_from'),
        ...(existing ? {} : { role: estate ? 'estate vineyard' : wine, ...(yearsNote(years) ? { note: yearsNote(years) } : {}) }),
        sources,
        verified: false,
      })
    }
  }
  return { nodes: [...nodes.values()], edges, notes }
}

async function main() {
  const index = process.argv.indexOf('--only')
  const only = index === -1 ? undefined : process.argv[index + 1].split(',')
  const graph = readGraph(resolve('src/data'))
  const research = buildResearch(graph, readWineries(), readLabels(), readForm, only)
  mkdirSync(CACHE_DIR, { recursive: true })
  const path = join(CACHE_DIR, 'research.json')
  writeFileSync(path, `${JSON.stringify(research, null, 1)}\n`)
  const existing = new Set(graph.edges.map((edge) => edge.id))
  const folded = research.edges.filter((edge) => existing.has(edge.id)).length
  console.log(
    `${research.nodes.length} new vineyards, ${research.edges.length - folded} new connections, ` +
      `${folded} existing connections gaining sources; ${research.notes.length} notes -> ${path}`,
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
