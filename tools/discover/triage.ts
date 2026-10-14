// Ranks crawled articles by how much they could add to the graph. Jev says what kind of
// article each is and whether it states who founded, owns or makes wine somewhere; our
// code counts which existing nodes it names. Run with: npm run discover:triage -- <name>
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadEnv } from 'vite'
import { nameVariants } from '../check/passages'
import { pool } from '../check/pool'
import { jevModel, type Question } from '../jev/model'
import { readGraph } from '../reviewPlugin'
import { readArticles, type Article } from './crawl'

const KINDS: Record<string, string> = {
  profile: 'A profile or history of a specific person, family, winery or vineyard.',
  obituary: 'An obituary or remembrance of a person.',
  interview: 'An interview or question-and-answer piece with a named person.',
  business: 'News of a sale, acquisition, opening, closing, new hire or change of winemaker.',
  region: 'A piece about a wine region, appellation or its history.',
  event: 'An event listing, festival preview or recap.',
  review: 'Tasting notes, wine reviews or recommendations.',
  other: 'A column, recipe, travel piece, industry statistics or anything else.',
}

const QUESTIONS: Record<string, Question> = {
  kind: { type: 'choice', instructions: 'What kind of article is this?', criteria: KINDS },
  lineage: {
    type: 'noul',
    instructions:
      'The article states, for a named Oregon winery or vineyard, who founded it, who owns it, who makes the wine, or where its fruit comes from.',
  },
  careers: {
    type: 'noul',
    instructions:
      'The article describes a named person’s career in wine: where they trained or worked before, who mentored them, or their family ties in the industry.',
  },
}

export interface Triage {
  url: string
  title: string
  kind: string
  lineage: number
  careers: number
  // Existing nodes named in the article
  known: string[]
  words: number
  // Whether the graph already cites this article
  cited: boolean
}

// Full names only: surname-only matching is too loose across a whole publication
function knownNodes(text: string, names: { id: string; variants: string[] }[]): string[] {
  const lower = text.toLowerCase()
  return names.filter(({ variants }) => variants.some((variant) => lower.includes(variant))).map(({ id }) => id)
}

async function main() {
  const name = process.argv[2]
  if (!name) throw new Error('Usage: discover:triage <name>')
  const apiKey = loadEnv('development', process.cwd(), '').JEV_API_KEY
  if (!apiKey) throw new Error('Set JEV_API_KEY in .env.local')
  const model = jevModel(apiKey)

  const graph = readGraph(resolve('src/data'))
  const names = graph.nodes
    .filter((node) => node.type !== 'ava')
    .map((node) => ({
      id: node.id,
      variants: [node.name, ...(node.aka ?? [])]
        .flatMap((full) => (node.type === 'person' ? [full] : nameVariants([full]).filter((variant) => variant.includes(' '))))
        .map((variant) => variant.toLowerCase())
        .filter((variant) => variant.length >= 8),
    }))
  const cited = new Set([...graph.nodes, ...graph.edges].flatMap((record) => record.sources.map((source) => source.url)))

  const articles = readArticles(name).filter((article): article is Article => article.status === 'ok')
  console.log(`${articles.length} readable articles`)
  const results: Triage[] = []
  await pool(articles, 8, async (article) => {
    // The opening of an article is enough to tell what it is
    const answers = await model.ask(`${article.title}\n\n${article.text.slice(0, 6000)}`, QUESTIONS)
    results.push({
      url: article.url,
      title: article.title,
      kind: answers.kind?.type === 'choice' ? answers.kind.choice : 'other',
      lineage: answers.lineage?.type === 'noul' ? answers.lineage.noul : 0,
      careers: answers.careers?.type === 'noul' ? answers.careers.noul : 0,
      known: knownNodes(article.text, names),
      words: article.text.split(/\s+/).length,
      cited: cited.has(article.url),
    })
  })

  // Names printed on every page (advertisers, site furniture) say nothing about an article
  const frequency = new Map<string, number>()
  for (const item of results) for (const id of item.known) frequency.set(id, (frequency.get(id) ?? 0) + 1)
  const boilerplate = new Set([...frequency].filter(([, count]) => count > results.length / 2).map(([id]) => id))
  for (const item of results) item.known = item.known.filter((id) => !boilerplate.has(id))
  if (boilerplate.size > 0) console.log(`ignored as site boilerplate: ${[...boilerplate].join(', ')}`)

  // Worth reading: says something the graph records, most promising first
  const score = (item: Triage) => Math.max(item.lineage, item.careers) + Math.min(item.known.length, 5) * 0.05
  results.sort((a, b) => score(b) - score(a))
  writeFileSync(resolve('.cache', `${name}-triage.json`), JSON.stringify(results, null, 1))

  const count = (items: Triage[]) => items.length
  const strong = results.filter((item) => Math.max(item.lineage, item.careers) >= 0.8)
  const byKind: Record<string, [number, number]> = {}
  for (const item of results) {
    byKind[item.kind] ??= [0, 0]
    byKind[item.kind][0]++
    if (strong.includes(item)) byKind[item.kind][1]++
  }
  console.log('\nkind'.padEnd(13) + 'articles'.padStart(9) + 'worth reading'.padStart(15))
  for (const [kind, [total, good]] of Object.entries(byKind).sort((a, b) => b[1][1] - a[1][1])) {
    console.log(kind.padEnd(12) + String(total).padStart(9) + String(good).padStart(15))
  }
  console.log(`\nworth reading (lineage or careers >= 0.8): ${count(strong)}`)
  console.log(`  already cited by the graph: ${count(strong.filter((item) => item.cited))}`)
  console.log(`  naming at least one existing node: ${count(strong.filter((item) => item.known.length > 0))}`)
  console.log(`  naming none (wholly new territory): ${count(strong.filter((item) => item.known.length === 0))}`)
  console.log('\nTop 25:')
  for (const item of results.slice(0, 25)) {
    console.log(`  ${item.kind.padEnd(9)} ${item.lineage.toFixed(2)} ${item.careers.toFixed(2)} known=${String(item.known.length).padStart(2)}  ${item.title.slice(0, 70)}`)
  }
  console.log(`\nFull ranking written to .cache/${name}-triage.json`)
}

await main()
