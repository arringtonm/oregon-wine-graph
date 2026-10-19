// Stage 3 of the COLA harvest: reads which vineyard, if any, each label names. Jev looks at
// the label images and chooses among likely vineyards (those the winery is already linked
// to, those the file names mention, and new names the file names suggest), "a vineyard not
// listed" or "no vineyard". Jev cannot write text, so a vineyard it can't match to an
// existing record is queued for a person (or Claude) to read and name. Labels are read in
// priority order, and only the newest and oldest approval of each wine.
// Run with: npm run cola:read [-- --only audeant] [--priority 3]
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'
import type { Graph, GraphNode } from '../../src/data/schema'
import { pool } from '../check/pool'
import { imageAsset } from '../jev/image'
import { jevModel, type DecisionModel, type ImageAsset, type Question } from '../jev/model'
import { readGraph } from '../reviewPlugin'
import { hintsFor, priority, wineSignature, type Hints } from './hints'
import { CACHE_DIR, parseForm, Registry, type ColaForm, type FormPage } from './registry'
import { readWineries } from './search'

export const LABELS_FILE = resolve('tools/cola/labels.json')
// Answers below this are recorded but not used
export const READ_THRESHOLD = 0.9
const MAX_IMAGES = 4
const CONCURRENCY = 6

export interface LabelReading {
  winery: string
  priority: number
  // The vineyard record the label names; null when it names none
  vineyard?: string | null
  // The label names a vineyard with no record yet: words from the file names, if any, until
  // someone reads the label and records its exact name in `newVineyard`
  needsName?: string
  newVineyard?: string
  confidence: number
  vintage?: number | null
  vintageConfidence?: number
  readBy: 'jev' | 'person'
  // Who read newVineyard off the label, since Jev can't write names
  nameReadBy?: 'claude' | 'person'
  // The vineyard named is outside Oregon (Washington's side of the Columbia Valley, say)
  vineyardOutsideOregon?: boolean
}

export function readLabels(): Record<string, LabelReading> {
  return existsSync(LABELS_FILE) ? JSON.parse(readFileSync(LABELS_FILE, 'utf8')) : {}
}

export function writeLabels(labels: Record<string, LabelReading>) {
  const sorted = Object.fromEntries(Object.entries(labels).sort(([a], [b]) => a.localeCompare(b)))
  writeFileSync(LABELS_FILE, `${JSON.stringify(sorted, null, 1)}\n`)
}

export function readForm(ttbId: string): ColaForm | null {
  const path = join(CACHE_DIR, 'forms', `${ttbId}.json`)
  return existsSync(path) ? parseForm(JSON.parse(readFileSync(path, 'utf8')) as FormPage) : null
}

const title = (text: string) => text.replace(/\b\w/g, (letter) => letter.toUpperCase())

// The vineyards a winery is already linked to, by ownership or by buying fruit
function linkedVineyards(graph: Graph, wineryId: string): string[] {
  return graph.edges
    .filter((edge) => edge.source === wineryId && (edge.type === 'sources_from' || edge.type === 'owns'))
    .map((edge) => edge.target)
    .filter((id) => graph.nodes.find((node) => node.id === id)?.type === 'vineyard')
}

export interface Candidates {
  criteria: Record<string, string>
  // Criterion key -> vineyard id, or the suggested name for a new vineyard
  vineyards: Record<string, string>
  suggestions: Record<string, string>
}

export function candidatesFor(graph: Graph, wineryId: string, hints: Hints): Candidates {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  const criteria: Record<string, string> = {}
  const vineyards: Record<string, string> = {}
  const suggestions: Record<string, string> = {}
  const ids = [...new Set([...hints.vineyards, ...linkedVineyards(graph, wineryId)])].slice(0, 14)
  ids.forEach((id, index) => {
    const name = byId.get(id)!.name.replace(/\s*\(.*?\)/g, '')
    criteria[`v${index}`] = `The label names ${name} as the vineyard the wine comes from.`
    vineyards[`v${index}`] = id
  })
  if (hints.words.length > 0 && hints.vineyards.length === 0) {
    const words = title(hints.words.join(' '))
    criteria.suggested = `The label names a vineyard called ${words} (or a close spelling of it) as the source of the wine.`
    suggestions.suggested = words
  }
  criteria.other = 'The label names a specific vineyard that is not one of the other options.'
  criteria.none =
    'The label names no specific vineyard. An appellation or region alone (such as Willamette Valley or Dundee Hills) is not a vineyard, and neither is the winery or brand name by itself.'
  return { criteria, vineyards, suggestions }
}

function vintageQuestion(issued: string): Question {
  const year = Number(issued.slice(0, 4))
  const criteria: Record<string, string> = {}
  for (let vintage = year + 1; vintage >= year - 8; vintage--) criteria[`y${vintage}`] = `The label shows the vintage ${vintage}.`
  criteria.none = 'The label shows no vintage year, or a year outside the other options.'
  return { type: 'choice', instructions: 'Which vintage year does the wine label `label` show?', criteria }
}

export async function readLabel(
  model: DecisionModel,
  graph: Graph,
  wineryId: string,
  form: ColaForm,
  hints: Hints,
  images: ImageAsset[],
): Promise<Omit<LabelReading, 'winery' | 'priority'>> {
  const refs = images.map((_, index) => `label-${form.ttbId}-${index + 1}`)
  const assets = Object.fromEntries(refs.map((ref, index) => [ref, images[index]]))
  const candidates = candidatesFor(graph, wineryId, hints)
  const answers = await model.ask(
    { label: refs.join(' '), brand: form.brand, appellation: form.appellation || 'none given' },
    {
      vineyard: {
        type: 'choice',
        instructions:
          'These images are the labels of one wine submitted for US federal label approval: `label`. Which vineyard, if any, do they name as the source of the wine?',
        criteria: candidates.criteria,
      },
      vintage: vintageQuestion(form.issued),
    },
    assets,
  )
  const vineyard = answers.vineyard
  const vintage = answers.vintage
  const reading: Omit<LabelReading, 'winery' | 'priority'> = { confidence: 0, readBy: 'jev' }
  if (vineyard?.type === 'choice') {
    reading.confidence = vineyard.confidence
    if (candidates.vineyards[vineyard.choice]) reading.vineyard = candidates.vineyards[vineyard.choice]
    else if (vineyard.choice === 'none') reading.vineyard = null
    else reading.needsName = candidates.suggestions[vineyard.choice] ?? ''
  }
  if (vintage?.type === 'choice') {
    reading.vintage = vintage.choice === 'none' ? null : Number(vintage.choice.slice(1))
    reading.vintageConfidence = vintage.confidence
  }
  return reading
}

// The approvals worth reading for a winery: each wine's newest and oldest approval, in
// priority order, skipping anything already read
export function selectApprovals(
  ttbIds: string[],
  winery: GraphNode,
  vineyards: GraphNode[],
  maxPriority: number,
): { form: ColaForm; hints: Hints; priority: number }[] {
  const wines = new Map<string, { form: ColaForm; hints: Hints; priority: number }[]>()
  for (const id of ttbIds) {
    const form = readForm(id)
    if (!form || form.status !== 'APPROVED' || form.images.length === 0) continue
    const hints = hintsFor(form, [winery.name, ...(winery.aka ?? []), form.brand], vineyards)
    const level = priority(hints)
    if (level > maxPriority) continue
    const signature = wineSignature(form, hints)
    wines.set(signature, [...(wines.get(signature) ?? []), { form, hints, priority: level }])
  }
  return [...wines.values()]
    .flatMap((approvals) => {
      const sorted = approvals.sort((a, b) => a.form.issued.localeCompare(b.form.issued))
      return [...new Set([sorted[sorted.length - 1], sorted[0]])]
    })
    .sort((a, b) => a.priority - b.priority)
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? undefined : process.argv[index + 1]
}

async function main() {
  const apiKey = loadEnv('development', process.cwd(), '').JEV_API_KEY
  if (!apiKey) throw new Error('Set JEV_API_KEY in .env.local')
  const model = jevModel(apiKey)
  const graph = readGraph(resolve('src/data'))
  const only = option('only')?.split(',')
  const maxPriority = Number(option('priority') ?? 3)
  const labels = readLabels()
  const vineyards = graph.nodes.filter((node) => node.type === 'vineyard')

  const work: { wineryId: string; form: ColaForm; hints: Hints; priority: number }[] = []
  for (const [wineryId, found] of Object.entries(readWineries())) {
    if (only && !only.includes(wineryId)) continue
    const winery = graph.nodes.find((node) => node.id === wineryId)
    if (!winery) continue
    for (const item of selectApprovals(found.ttbIds, winery, vineyards, maxPriority)) {
      if (!labels[item.form.ttbId]) work.push({ wineryId, ...item })
    }
  }
  console.log(`${work.length} labels to read`)

  // Images come from the registry one at a time; Jev reads several at once
  const registry = new Registry()
  const paths = new Map<string, string[]>()
  for (const item of work) paths.set(item.form.ttbId, (await registry.images(item.form.ttbId)).slice(0, MAX_IMAGES))
  console.log(`images ready (${registry.requests} requests)`)

  let done = 0
  await pool(work, CONCURRENCY, async ({ wineryId, form, hints, priority: level }) => {
    try {
      const images = await Promise.all(paths.get(form.ttbId)!.map(imageAsset))
      const reading = await readLabel(model, graph, wineryId, form, hints, images)
      labels[form.ttbId] = { winery: wineryId, priority: level, ...reading }
    } catch (error) {
      console.log(`  failed ${form.ttbId}: ${error instanceof Error ? error.message : error}`)
    }
    if (++done % 50 === 0) {
      writeLabels(labels)
      console.log(`  ${done}/${work.length}`)
    }
  })
  writeLabels(labels)

  const read = work.map((item) => labels[item.form.ttbId]).filter(Boolean)
  const sure = read.filter((reading) => reading.confidence >= READ_THRESHOLD)
  console.log({
    read: read.length,
    unsure: read.length - sure.length,
    vineyard: sure.filter((reading) => reading.vineyard).length,
    none: sure.filter((reading) => reading.vineyard === null).length,
    needsName: sure.filter((reading) => reading.needsName !== undefined).length,
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
