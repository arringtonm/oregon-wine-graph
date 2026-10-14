// Matches Oregon Wine History Archive pages to the nodes they are about: an interview to
// the people in its title, a collection to its winery or vineyard. Where more than one
// node fits, Jev decides from the page's summary. Run with: npm run owha:match
import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'
import type { GraphNode } from '../../src/data/schema'
import { pool } from '../check/pool'
import { jevModel, type DecisionModel } from '../jev/model'
import { readGraph } from '../reviewPlugin'
import { OWHA_DIR, readPages, type OwhaPage } from './owha'

export interface OwhaMatch {
  url: string
  nodeIds: string[]
  via: 'name' | 'jev'
}

const GENERIC = new Set(['the', 'winery', 'wines', 'wine', 'vineyards', 'vineyard', 'cellars', 'cellar', 'estate', 'family', 'company', 'co', 'and', 'of', 'collection'])

export function normalise(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const core = (text: string) => normalise(text).split(' ').filter((word) => !GENERIC.has(word)).join(' ')

// "SARA & DAVE SPECTER" -> ["sara specter", "dave specter"]; "JOE AND SUZI GINET" likewise
export function peopleInTitle(title: string): string[] {
  const parts = normalise(title.replace(/\s+\d+$/, ''))
    .split(/\s*(?:\band\b|,)\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
  const surname = parts[parts.length - 1]?.split(' ').slice(-1)[0]
  return parts.map((part) => (part.split(' ').length === 1 && surname ? `${part} ${surname}` : part))
}

// Candidate nodes for a page, by name alone
export function candidatesFor(page: OwhaPage, nodes: GraphNode[]): GraphNode[] {
  if (page.kind === 'interview') {
    const people = new Set(peopleInTitle(page.title.replace(/&/g, ' and ')))
    return nodes.filter(
      (node) => node.type === 'person' && [node.name, ...(node.aka ?? [])].some((name) => people.has(normalise(name))),
    )
  }
  if (page.kind === 'collection') {
    const name = core(page.title)
    if (!name) return []
    const places = nodes.filter(
      (node) => (node.type === 'winery' || node.type === 'vineyard') && [node.name, ...(node.aka ?? [])].some((other) => core(other) === name),
    )
    // A collection is about the business; a vineyard of the same name is its estate
    const wineries = places.filter((node) => node.type === 'winery')
    return wineries.length > 0 ? wineries : places
  }
  return []
}

async function confirm(model: DecisionModel, page: OwhaPage, candidates: GraphNode[]): Promise<string[]> {
  const questions = Object.fromEntries(
    candidates.map((node, index) => [
      `about_${index}`,
      { type: 'noul' as const, instructions: `This page is an interview with, or about, ${node.name}: ${node.summary}` },
    ]),
  )
  const answers = await model.ask(`${page.title}\n\n${page.summary}`, questions)
  return candidates.filter((_, index) => {
    const answer = answers[`about_${index}`]
    return answer?.type === 'noul' && answer.noul >= 0.8
  }).map((node) => node.id)
}

async function main() {
  const apiKey = loadEnv('development', process.cwd(), '').JEV_API_KEY
  const model = apiKey ? jevModel(apiKey) : null
  const graph = readGraph(resolve('src/data'))
  const pages = readPages().filter((page) => page.kind !== 'other')

  const matches: OwhaMatch[] = []
  const unmatched: OwhaPage[] = []
  let ambiguous = 0
  await pool(pages, 8, async (page) => {
    const candidates = candidatesFor(page, graph.nodes)
    // Several people sharing an interview are all its subjects; several places with one
    // name are rivals, so Jev chooses among them
    const rivals = page.kind === 'collection' && candidates.length > 1
    if (candidates.length === 0) {
      unmatched.push(page)
    } else if (rivals && model) {
      ambiguous++
      const chosen = await confirm(model, page, candidates)
      if (chosen.length > 0) matches.push({ url: page.url, nodeIds: chosen, via: 'jev' })
      else unmatched.push(page)
    } else {
      matches.push({ url: page.url, nodeIds: candidates.map((node) => node.id), via: 'name' })
    }
  })

  matches.sort((a, b) => a.url.localeCompare(b.url))
  writeFileSync(join(OWHA_DIR, 'matches.json'), JSON.stringify(matches, null, 1))
  writeFileSync(join(OWHA_DIR, 'unmatched.json'), JSON.stringify(unmatched.map((page) => page.url), null, 1))

  const byKind = (kind: string) => pages.filter((page) => page.kind === kind).length
  const matchedKind = (kind: string) =>
    matches.filter((match) => pages.find((page) => page.url === match.url)?.kind === kind).length
  const nodesLinked = new Set(matches.flatMap((match) => match.nodeIds))
  console.log(`interviews matched to people: ${matchedKind('interview')} of ${byKind('interview')}`)
  console.log(`collections matched to wineries or vineyards: ${matchedKind('collection')} of ${byKind('collection')}`)
  console.log(`decided by Jev among same-named places: ${ambiguous}`)
  console.log(`distinct nodes that would gain an interview: ${nodesLinked.size}`)
  console.log(`pages about people or places not in the graph: ${unmatched.length}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
