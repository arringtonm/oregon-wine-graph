// Measures how often the check would approve a wrong record. Records that pass the check
// are copied, one fact in each copy is broken, and the copies are run against the same
// sources. Every broken copy that still comes back "supported" is a false approval.
// Run with: npm run check:calibrate [-- --sample 400]
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadEnv } from 'vite'
import { allowedEdgeTypes, EDGE_RULES, type Graph, type GraphEdge, type GraphNode } from '../../src/data/schema'
import { jevModel } from '../jev/model'
import { readGraph } from '../reviewPlugin'
import { checkRecord } from './checkRecord'
import { claimsFor, recordKey, type CheckedRecord } from './claims'
import { decide, type SourceCheck } from './decide'
import { readCached } from './fetchSources'
import { pool } from './pool'
import { readChecks } from './store'

const THRESHOLDS = [0.5, 0.6, 0.7, 0.8, 0.9, 0.95]
const YEAR_FIELDS = ['born', 'died', 'founded', 'closed', 'planted', 'established', 'firstHeld', 'lastHeld'] as const

// Small seeded generator, so a calibration run can be repeated exactly
function randomSource(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Corruption = { kind: string; item: CheckedRecord }

// Every way this record can be broken while staying a well-formed record
function corruptions(item: CheckedRecord, graph: Graph, random: () => number): Corruption[] {
  const pick = <T,>(items: T[]) => items[Math.floor(random() * items.length)]
  const shift = (year: number) => year + pick([-9, -7, -5, -4, -3, 3, 4, 5, 7, 9])
  const out: Corruption[] = []

  if (item.kind === 'node') {
    const node = item.record as GraphNode & Record<string, unknown>
    const dated = YEAR_FIELDS.filter((field) => typeof node[field] === 'number')
    if (dated.length > 0) {
      const field = pick(dated)
      out.push({ kind: 'node year', item: { kind: 'node', record: { ...node, [field]: shift(node[field] as number) } as GraphNode } })
    }
    const others = graph.nodes.filter((other) => other.type === node.type && other.id !== node.id)
    out.push({ kind: 'node summary', item: { kind: 'node', record: { ...node, summary: pick(others).summary } as GraphNode } })
    return out
  }

  const edge = item.record
  const source = graph.nodes.find((node) => node.id === edge.source)!
  const target = graph.nodes.find((node) => node.id === edge.target)!
  const make = (kind: string, changes: Partial<GraphEdge>) =>
    out.push({ kind, item: { kind: 'edge', record: { ...edge, ...changes } } })

  if (edge.startYear !== undefined) make('edge start year', { startYear: shift(edge.startYear) })
  if (edge.endYear !== undefined) make('edge end year', { endYear: shift(edge.endYear) })

  const linked = new Set(
    graph.edges.flatMap((other) => (other.source === edge.source ? [other.target] : other.target === edge.source ? [other.source] : [])),
  )
  const strangers = graph.nodes.filter((node) => node.type === target.type && node.id !== source.id && !linked.has(node.id))
  if (strangers.length > 0) make('edge other party', { target: pick(strangers).id })

  const otherTypes = allowedEdgeTypes(source.type, target.type).filter(
    (type) => EDGE_RULES[type].category !== EDGE_RULES[edge.type].category,
  )
  if (otherTypes.length > 0) make('edge relationship', { type: pick(otherTypes), role: undefined })

  if (edge.type === 'family' && edge.role) make('edge family role', { role: edge.role === 'spouse' ? 'parent' : 'spouse' })
  return out
}

async function main() {
  const apiKey = loadEnv('development', process.cwd(), '').JEV_API_KEY
  if (!apiKey) throw new Error('Set JEV_API_KEY in .env.local to run the calibration')
  const model = jevModel(apiKey)
  const graph = readGraph(resolve('src/data'))
  const store = readChecks()
  const sampleIndex = process.argv.indexOf('--sample')
  const sampleSize = sampleIndex === -1 ? 400 : Number(process.argv[sampleIndex + 1])
  const random = randomSource(20261013)

  const all: CheckedRecord[] = [
    ...graph.nodes.map((record) => ({ kind: 'node' as const, record })),
    ...graph.edges.map((record) => ({ kind: 'edge' as const, record })),
  ]
  const verdictOf = (item: CheckedRecord, checks: SourceCheck[], threshold: number) =>
    decide(checks, Object.keys(claimsFor(item, graph).details), threshold).verdict

  // Break only records the loosest threshold approves, so each copy differs from a passing record by one fact
  const passing = all.filter((item) => {
    const stored = store[recordKey(item)]
    return stored && verdictOf(item, stored.sources, THRESHOLDS[0]) === 'supported'
  })
  // Spread the sample over the kinds of corruption instead of letting the commonest dominate
  const byKind = new Map<string, Corruption[]>()
  for (const item of passing.sort(() => random() - 0.5)) {
    for (const corruption of corruptions(item, graph, random)) {
      byKind.set(corruption.kind, [...(byKind.get(corruption.kind) ?? []), corruption])
    }
  }
  const perKind = Math.ceil(sampleSize / byKind.size)
  const sample = [...byKind.values()].flatMap((list) => list.slice(0, perKind))
  console.log(`${passing.length} passing records; testing ${sample.length} corrupted copies`)

  const results: { kind: string; key: string; checks: SourceCheck[]; item: CheckedRecord }[] = []
  await pool(sample, 8, async (corruption) => {
    const checks = await checkRecord(corruption.item, graph, model, readCached)
    results.push({ kind: corruption.kind, key: recordKey(corruption.item), checks, item: corruption.item })
  })

  const row = (label: string, cells: string[]) => console.log(label.padEnd(24) + cells.map((cell) => cell.padStart(8)).join(''))
  const percent = (part: number, whole: number) => (whole === 0 ? '-' : `${((100 * part) / whole).toFixed(1)}%`)

  console.log('\nCorrupted copies still approved (false approvals), by threshold:')
  row('', THRESHOLDS.map(String))
  const kinds = [...new Set(results.map((result) => result.kind))].sort()
  for (const kind of [...kinds, 'ALL']) {
    const subset = results.filter((result) => kind === 'ALL' || result.kind === kind)
    row(
      `${kind} (${subset.length})`,
      THRESHOLDS.map((threshold) =>
        percent(subset.filter((result) => verdictOf(result.item, result.checks, threshold) === 'supported').length, subset.length),
      ),
    )
  }

  console.log('\nReal records approved, by threshold:')
  row('', THRESHOLDS.map(String))
  const checked = all.filter((item) => store[recordKey(item)])
  const groups: [string, CheckedRecord[]][] = [
    ['all records', checked],
    ['nodes', checked.filter((item) => item.kind === 'node')],
    ['connections', checked.filter((item) => item.kind === 'edge')],
    ['verified by hand', checked.filter((item) => item.record.verified)],
  ]
  for (const [label, group] of groups) {
    row(
      `${label} (${group.length})`,
      THRESHOLDS.map((threshold) =>
        percent(group.filter((item) => verdictOf(item, store[recordKey(item)].sources, threshold) === 'supported').length, group.length),
      ),
    )
  }

  mkdirSync(resolve('.cache'), { recursive: true })
  writeFileSync(
    resolve('.cache/calibration.json'),
    JSON.stringify(results.map(({ kind, key, checks, item }) => ({ kind, key, record: item.record, checks })), null, 1),
  )
  console.log('\nDetail written to .cache/calibration.json')
}

await main()
