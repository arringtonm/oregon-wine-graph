// Keeps two notes on connections true to their evidence. A federal label approval shows a
// wine was planned, not that it was sold, so a connection cited only by approvals says so;
// and a connection verified only by Jev reading label images says that method is early and
// trusted less. Both notes are added, updated and removed by this script alone, after each
// merge and each check:apply. Run with: npm run cola:caveats
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Graph, GraphEdge, Source } from '../../src/data/schema'
import { claimsFor } from '../check/claims'
import { APPLY_THRESHOLD, decide } from '../check/decide'
import { readChecks, type CheckStore } from '../check/store'
import { formatRecords, readGraph } from '../reviewPlugin'

export const isColaSource = (source: Source) => !!source.url && /^https:\/\/(www\.)?ttbonline\.gov\//.test(source.url)

const LABEL_ONLY = /\s*Evidence goes only as far as (?:a )?federal label approvals? \(TTB, [\d–]+\); no other source confirms the wine was released\./
const IMAGE_ONLY = /\s*Checked automatically against the label images?, an early-stage method with lower confidence\./

// The years of the approvals a connection cites, from their titles ("label approved 22 Aug 2025")
function approvalYears(sources: Source[]): string {
  const years = sources
    .map((source) => source.title.match(/label approved \d{1,2} \w{3} (\d{4})/)?.[1])
    .filter((year): year is string => !!year)
    .sort()
  if (years.length === 0) return ''
  return years[0] === years[years.length - 1] ? years[0] : `${years[0]}–${years[years.length - 1]}`
}

export function labelOnlyNote(sources: Source[]): string | null {
  if (sources.length === 0 || !sources.every(isColaSource)) return null
  const years = approvalYears(sources)
  const plural = sources.length > 1
  return `Evidence goes only as far as ${plural ? '' : 'a '}federal label approval${plural ? 's' : ''} (TTB, ${years || 'date unknown'}); no other source confirms the wine was released.`
}

export const IMAGE_NOTE = 'Checked automatically against the label images, an early-stage method with lower confidence.'

// The connection's note with both caveats brought up to date; undefined when nothing is left
export function withCaveats(edge: GraphEdge, byImage: boolean): string | undefined {
  const base = (edge.note ?? '').replace(LABEL_ONLY, '').replace(IMAGE_ONLY, '').trim()
  const label = labelOnlyNote(edge.sources)
  const image = byImage && edge.verified && edge.verifiedBy === 'jev' ? IMAGE_NOTE : null
  const note = [base, label, image].filter(Boolean).join(' ')
  return note || undefined
}

// Whether the record check verified this connection on label images alone
export function verifiedByImage(graph: Graph, edge: GraphEdge, store: CheckStore): boolean {
  const stored = store[`edge:${edge.id}`]
  if (!stored) return false
  const claims = claimsFor({ kind: 'edge', record: edge }, graph)
  return decide(stored.sources, Object.keys(claims.details), APPLY_THRESHOLD).byImage === true
}

function main() {
  const dataDir = resolve('src/data')
  const graph = readGraph(dataDir)
  const store = readChecks()
  const edgesFile = join(dataDir, 'edges.json')
  const stored = JSON.parse(readFileSync(edgesFile, 'utf8')) as (GraphEdge & Record<string, unknown>)[]
  let changed = 0
  for (const record of stored) {
    const edge = graph.edges.find((candidate) => candidate.id === record.id)!
    const note = withCaveats(edge, verifiedByImage(graph, edge, store))
    if (note === record.note) continue
    changed++
    if (!note) delete record.note
    else if (record.note !== undefined) record.note = note
    else {
      // A new note goes where notes usually sit, just before the sources
      const entries = Object.entries(record)
      const at = entries.findIndex(([key]) => key === 'sources')
      entries.splice(at, 0, ['note', note])
      stored[stored.indexOf(record)] = Object.fromEntries(entries) as typeof record
    }
  }
  writeFileSync(edgesFile, formatRecords(stored))
  readGraph(dataDir)
  console.log(`Updated the caveats on ${changed} connections`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
