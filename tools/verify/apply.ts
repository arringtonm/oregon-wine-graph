// Folds research results into the data. Each result may add sources to a draft record and
// propose corrections (a year, a role, a summary, years the sources disagree on, a note).
// New sources are always kept. A correction is written only when Jev, reading the record's
// sources including the new ones, supports the corrected record at the usual threshold with
// no source contradicting it; every correction written is logged in corrections.json. A
// result that adds nothing usable is logged in dead-ends.json, and the queue skips it.
// Run with: npm run verify:apply -- .cache/verify/round-1/*.json
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'
import { checkGraph, edgeSchema, nodeSchema, type Graph, type GraphEdge, type GraphNode, type Source } from '../../src/data/schema'
import { checkRecord } from '../check/checkRecord'
import { claimsFor, detailGroup, type CheckedRecord } from '../check/claims'
import { APPLY_THRESHOLD, CONTRADICTION_THRESHOLD, decide, IMAGE_THRESHOLD, type Decision, type SourceCheck } from '../check/decide'
import { fetchAndCache, readCached } from '../check/fetchSources'
import { jevModel, type DecisionModel } from '../jev/model'
import { formatRecords, NODE_FILES, readGraph } from '../reviewPlugin'

export const CORRECTIONS_FILE = resolve('tools/verify/corrections.json')
export const DEAD_ENDS_FILE = resolve('tools/verify/dead-ends.json')

// Fields research may change. Ids, types and endpoints never change here: that is a new record
const EDGE_FIELDS = ['role', 'startYear', 'endYear', 'ongoing', 'note', 'alsoDated'] as const
const NODE_FIELDS = ['summary', 'born', 'died', 'founded', 'closed', 'planted', 'established', 'firstHeld', 'lastHeld', 'alsoDated'] as const

export interface ResearchResult {
  key: string
  addSources?: Source[]
  // Field -> new value; null clears the field
  changes?: Record<string, unknown>
  finding: string
}

export interface Correction {
  date: string
  key: string
  field: string
  from: unknown
  to: unknown
  sources: string[]
  finding: string
}

export interface Outcome {
  key: string
  sourcesAdded: number
  changes: 'none' | 'applied' | 'rejected'
  decision?: Decision
  reason?: string
}

const readJson = <T,>(path: string, fallback: T): T => (existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : fallback)

export function readDeadEnds(): Record<string, { date: string; finding: string }> {
  return readJson(DEAD_ENDS_FILE, {})
}

// The record with the result's sources added and, optionally, its changes made
export function revised(record: GraphNode | GraphEdge, kind: 'node' | 'edge', result: ResearchResult, withChanges: boolean) {
  const next = structuredClone(record) as Record<string, unknown> & { sources: Source[] }
  for (const source of result.addSources ?? []) {
    if (!next.sources.some((have) => (source.url ? have.url === source.url : have.title === source.title))) next.sources.push(source)
  }
  if (withChanges) {
    const allowed: readonly string[] = kind === 'edge' ? EDGE_FIELDS : NODE_FIELDS
    for (const [field, value] of Object.entries(result.changes ?? {})) {
      if (!allowed.includes(field)) throw new Error(`${result.key}: research may not change "${field}"`)
      if (value === null) delete next[field]
      else next[field] = value
    }
  }
  return kind === 'edge' ? (edgeSchema.parse(next) as GraphEdge) : (nodeSchema.parse(next) as GraphNode)
}

function withRecord(graph: Graph, item: CheckedRecord): Graph {
  return item.kind === 'node'
    ? { ...graph, nodes: graph.nodes.map((node) => (node.id === item.record.id ? (item.record as GraphNode) : node)) }
    : { ...graph, edges: graph.edges.map((edge) => (edge.id === item.record.id ? (item.record as GraphEdge) : edge)) }
}

// Decides what to keep from one result: the corrected record if the check supports it,
// otherwise the record with only its new sources
export async function judge(
  graph: Graph,
  result: ResearchResult,
  model: DecisionModel,
  readSource = readCached,
): Promise<{ record: GraphNode | GraphEdge; outcome: Outcome }> {
  const [kind, id] = result.key.split(/:(.*)/s) as ['node' | 'edge', string]
  const original = kind === 'node' ? graph.nodes.find((node) => node.id === id) : graph.edges.find((edge) => edge.id === id)
  if (!original) throw new Error(`${result.key}: no such record`)
  const sourcesOnly = revised(original, kind, result, false)
  const sourcesAdded = sourcesOnly.sources.length - original.sources.length
  if (!result.changes || Object.keys(result.changes).length === 0) {
    return { record: sourcesOnly, outcome: { key: result.key, sourcesAdded, changes: 'none' } }
  }
  const corrected = revised(original, kind, result, true)
  const item = { kind, record: corrected } as CheckedRecord
  const nextGraph = withRecord(graph, item)
  const problems = checkGraph(nextGraph)
  if (problems.length > 0) {
    return { record: sourcesOnly, outcome: { key: result.key, sourcesAdded, changes: 'rejected', reason: problems.join('; ') } }
  }
  const checks = await checkRecord(item, nextGraph, model, readSource)
  const decision = decide(checks, Object.keys(claimsFor(item, nextGraph).details), APPLY_THRESHOLD)
  // The record was a draft, so judge the correction, not the whole record: every claim it
  // changes or adds must be supported, and nothing may contradict the record's main claim
  const changed = changedClaims(claimsFor({ kind, record: original } as CheckedRecord, graph), claimsFor(item, nextGraph))
  // A disputed year's alternatives count as one claim, supported if any of them is
  const groups = [...new Set(changed.map(detailGroup))]
  const alternatives = (group: string) => Object.keys(claimsFor(item, nextGraph).details).filter((id) => detailGroup(id) === group)
  const unsupported = groups.filter((group) =>
    group === 'main' ? !claimSupported(checks, 'main') : !alternatives(group).some((id) => claimSupported(checks, id)),
  )
  if (decision.contradiction < CONTRADICTION_THRESHOLD && unsupported.length === 0) {
    return { record: corrected, outcome: { key: result.key, sourcesAdded, changes: 'applied', decision } }
  }
  const reason = decision.contradiction >= CONTRADICTION_THRESHOLD ? 'a source contradicts it' : `unsupported: ${unsupported.join(', ')}`
  return { record: sourcesOnly, outcome: { key: result.key, sourcesAdded, changes: 'rejected', decision, reason } }
}

// Claim ids whose statement a correction changed or added ("main" for the central claim)
export function changedClaims(before: ReturnType<typeof claimsFor>, after: ReturnType<typeof claimsFor>): string[] {
  const ids = Object.entries(after.details)
    .filter(([id, statement]) => before.details[id] !== statement)
    .map(([id]) => id)
  return after.main === before.main ? ids : ['main', ...ids]
}

function claimSupported(checks: SourceCheck[], id: string): boolean {
  const bar = (check: SourceCheck) => (check.medium === 'image' ? IMAGE_THRESHOLD : APPLY_THRESHOLD)
  if (id === 'main') {
    return checks.some((check) => check.levels && check.medium !== 'combined' && check.levels[2] + check.levels[3] >= bar(check))
  }
  return checks.some((check) => check.status === 'read' && (check.details?.[id] ?? 0) >= bar(check))
}

// Writes one record back to its data file, keeping the order of fields and records
function writeRecord(dataDir: string, kind: 'node' | 'edge', record: GraphNode | GraphEdge) {
  const file = kind === 'edge' ? join(dataDir, 'edges.json') : join(dataDir, 'nodes', NODE_FILES[(record as GraphNode).type])
  const records = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>[]
  const index = records.findIndex((candidate) => candidate.id === record.id)
  const before = records[index]
  const after: Record<string, unknown> = {}
  // Existing fields keep their place; new ones go before the sources
  for (const key of Object.keys(before)) {
    if (key === 'sources') for (const added of Object.keys(record)) if (!(added in before)) after[added] = (record as Record<string, unknown>)[added]
    if (key in record) after[key] = (record as Record<string, unknown>)[key]
  }
  records[index] = after
  writeFileSync(file, formatRecords(records))
}

export function correctionsFor(before: GraphNode | GraphEdge, after: GraphNode | GraphEdge, result: ResearchResult): Correction[] {
  const date = new Date().toISOString().slice(0, 10)
  const sources = (result.addSources ?? []).map((source) => source.url ?? source.title)
  return Object.keys(result.changes ?? {})
    .filter((field) => JSON.stringify((before as Record<string, unknown>)[field]) !== JSON.stringify((after as Record<string, unknown>)[field]))
    .map((field) => ({
      date,
      key: result.key,
      field,
      from: (before as Record<string, unknown>)[field] ?? null,
      to: (after as Record<string, unknown>)[field] ?? null,
      sources,
      finding: result.finding,
    }))
}

async function main() {
  const files = process.argv.slice(2)
  if (files.length === 0) throw new Error('Usage: verify:apply <result.json> ...')
  const apiKey = loadEnv('development', process.cwd(), '').JEV_API_KEY
  if (!apiKey) throw new Error('Set JEV_API_KEY in .env.local')
  const model = jevModel(apiKey)
  const dataDir = resolve('src/data')
  const results = files.flatMap((file) => JSON.parse(readFileSync(file, 'utf8')) as ResearchResult[])
  const corrections = readJson<Correction[]>(CORRECTIONS_FILE, [])
  const deadEnds = readDeadEnds()

  // New pages first, so the check can read them
  const urls = [...new Set(results.flatMap((result) => (result.addSources ?? []).map((source) => source.url).filter(Boolean)))] as string[]
  for (const url of urls.filter((url) => !readCached(url))) {
    const fetched = await fetchAndCache(url)
    if (fetched.status !== 'ok') console.log(`  ${fetched.status.padEnd(9)} ${url}`)
  }

  const tally = { sourcesAdded: 0, applied: 0, rejected: 0, deadEnds: 0 }
  for (const result of results) {
    const graph = readGraph(dataDir)
    const [kind] = result.key.split(':') as ['node' | 'edge']
    try {
      const before = kind === 'node' ? graph.nodes.find((node) => `node:${node.id}` === result.key) : graph.edges.find((edge) => `edge:${edge.id}` === result.key)
      const { record, outcome } = await judge(graph, result, model)
      writeRecord(dataDir, kind, record)
      tally.sourcesAdded += outcome.sourcesAdded
      if (outcome.changes === 'applied') {
        tally.applied++
        corrections.push(...correctionsFor(before!, record, result))
        delete deadEnds[result.key]
      }
      if (outcome.changes === 'rejected') {
        tally.rejected++
        console.log(`  kept sources only for ${result.key}: ${outcome.reason}`)
      }
      // Research that offered nothing at all; a rerun of the same round adds no new sources
      // but isn't a dead end
      if ((result.addSources ?? []).length === 0 && outcome.changes !== 'applied') {
        deadEnds[result.key] = { date: new Date().toISOString().slice(0, 10), finding: result.finding }
        tally.deadEnds++
      }
    } catch (error) {
      console.log(`  skipped ${result.key}: ${error instanceof Error ? error.message : error}`)
    }
  }
  readGraph(dataDir)
  writeFileSync(CORRECTIONS_FILE, `${JSON.stringify(corrections, null, 1)}\n`)
  writeFileSync(DEAD_ENDS_FILE, `${JSON.stringify(deadEnds, null, 1)}\n`)
  console.log(tally, '\nNext: npm run check && npm run check:apply && npm run cola:caveats && npm run verify:queue')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
