// Proposes short titles for long connection roles. Jev picks the closest title from each
// connection type's vocabulary (src/data/roleTitles.ts), with its confidence, for every
// role of four words or more that has no title yet. The picks go to
// tools/roles/proposals.json for review; agreed titles go in src/data/role-titles.json.
// Run: npm run roles:titles
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadEnv } from 'vite'
import { SHORT_ROLE_WORDS, TITLE_TYPES, TITLE_VOCABULARY, titleKey } from '../../src/data/roleTitles'
import type { EdgeType } from '../../src/data/schema'
import { pool } from '../check/pool'
import { jevModel } from '../jev/model'
import { readGraph } from '../reviewPlugin'

export interface Proposal {
  type: EdgeType
  role: string
  title: string
  confidence: number
  // An example connection, for reading the role in context
  example: string
  uses: number
}

const PROPOSALS = resolve('tools/roles/proposals.json')
const TITLES = resolve('src/data/role-titles.json')

async function main() {
  const apiKey = loadEnv('development', process.cwd(), '').JEV_API_KEY
  if (!apiKey) throw new Error('Set JEV_API_KEY in .env.local')
  const model = jevModel(apiKey)
  const graph = readGraph(resolve('src/data'))
  const names = new Map(graph.nodes.map((node) => [node.id, node.name]))
  const titled = existsSync(TITLES) ? (JSON.parse(readFileSync(TITLES, 'utf8')) as Record<string, string>) : {}

  // Each distinct long role once, with how often it's used and one connection it's on
  const roles = new Map<string, Omit<Proposal, 'title' | 'confidence'>>()
  for (const edge of graph.edges) {
    if (!edge.role || !TITLE_TYPES.has(edge.type) || edge.role.split(/\s+/).length <= SHORT_ROLE_WORDS) continue
    const key = titleKey(edge.type, edge.role)
    if (titled[key]) continue
    const seen = roles.get(key)
    if (seen) seen.uses++
    else
      roles.set(key, {
        type: edge.type,
        role: edge.role,
        example: `${names.get(edge.source)} → ${edge.type} → ${names.get(edge.target)}`,
        uses: 1,
      })
  }
  console.log(`${roles.size} roles to title`)

  const proposals: Proposal[] = []
  await pool([...roles.values()], 8, async (role) => {
    const vocabulary = TITLE_VOCABULARY[role.type]
    if (!vocabulary) return
    const answers = await model.ask(
      [
        'A connection in a graph of the Oregon wine industry, with a free-text role.',
        `Connection type: ${role.type}`,
        `Example: ${role.example}`,
        `Role: ${role.role}`,
      ].join('\n'),
      {
        title: {
          type: 'choice',
          instructions: 'Which short title best sums up this role, as a label shown beside the name?',
          criteria: vocabulary,
        },
      },
    )
    const answer = answers.title
    if (answer?.type !== 'choice') return
    proposals.push({ ...role, title: answer.choice, confidence: Math.round(answer.confidence * 100) / 100 })
  })

  proposals.sort((a, b) => a.confidence - b.confidence || a.type.localeCompare(b.type))
  writeFileSync(PROPOSALS, `${JSON.stringify(proposals, null, 1)}\n`)
  console.log(`Wrote ${proposals.length} proposals to ${PROPOSALS}, least sure first`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
