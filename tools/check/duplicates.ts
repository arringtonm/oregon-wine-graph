// Records that may be the same one entered twice, for a person to look over after adding
// records: names (and also-known-as names) that match once case, accents, punctuation and
// common words are set aside, and people whose names match once nicknames are expanded
// (Mike and Mikey as Michael). A winery and its estate vineyard often share a name, so those
// pairs aren't listed. Many matches are genuinely different records (a father and son), so
// this is a report, not a test; connections stored twice are a test (src/data/duplicates.test.ts).
// Run: npm run audit:duplicates
import { loadGraph } from '../../src/data'
import type { GraphNode } from '../../src/data/schema'

const COMMON_WORDS = /\b(the|winery|wines?|vineyards?|cellars?|estate|wine co(mpany)?|co|llc|inc|family|jr|sr|ava)\b/g
const NICKNAMES: Record<string, string> = {
  mike: 'michael', mikey: 'michael', bob: 'robert', rob: 'robert', bill: 'william', will: 'william',
  jim: 'james', jimmy: 'james', dave: 'david', dan: 'daniel', danny: 'daniel', tom: 'thomas',
  tony: 'anthony', steve: 'steven', stephen: 'steven', chris: 'christopher', kate: 'katherine',
  katie: 'katherine', kathy: 'katherine', liz: 'elizabeth', beth: 'elizabeth', sue: 'susan',
  joe: 'joseph', dick: 'richard', rick: 'richard', rich: 'richard', ken: 'kenneth', ron: 'ronald',
  don: 'donald', doug: 'douglas', greg: 'gregory', jeff: 'jeffrey', pat: 'patrick', ted: 'edward',
  ed: 'edward', andy: 'andrew', alex: 'alexander', matt: 'matthew', nick: 'nicholas', sam: 'samuel',
  ben: 'benjamin', jon: 'jonathan', larry: 'lawrence', meg: 'margaret', ann: 'anne', annie: 'anne',
}

const plain = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

export function nameKey(name: string): string {
  return plain(name).replace(COMMON_WORDS, '').replace(/[^a-z0-9]/g, '')
}

// "Mikey Etzel" and "Michael G. Etzel" both become "michael etzel"
export function personKey(name: string): string | null {
  const parts = plain(name)
    .replace(/[^a-z ]/g, '')
    .split(/\s+/)
    .filter((part) => part.length > 1 && !['jr', 'sr', 'ii', 'iii'].includes(part))
  if (parts.length < 2) return null
  return `${NICKNAMES[parts[0]] ?? parts[0]} ${parts[parts.length - 1]}`
}

export function possibleDuplicates(nodes: GraphNode[]): GraphNode[][] {
  const groups = new Map<string, Set<GraphNode>>()
  const add = (key: string, node: GraphNode) => groups.set(key, (groups.get(key) ?? new Set()).add(node))
  for (const node of nodes) {
    for (const name of [node.name, ...(node.aka ?? [])]) {
      const key = nameKey(name)
      if (key.length >= 4) add(`${node.type}:${key}`, node)
      const person = node.type === 'person' ? personKey(name) : null
      if (person) add(`person:${person}`, node)
    }
  }
  const seen = new Set<string>()
  return [...groups.values()]
    .filter((group) => group.size > 1)
    .map((group) => [...group].sort((a, b) => a.id.localeCompare(b.id)))
    .filter((group) => {
      const key = group.map((node) => node.id).join('|')
      return !seen.has(key) && seen.add(key)
    })
}

async function main() {
  const graph = await loadGraph()
  const groups = possibleDuplicates(graph.nodes)
  if (groups.length === 0) return console.log('No records look like duplicates.')
  console.log(`${groups.length} groups of records that may be the same; look each over:\n`)
  for (const group of groups) console.log(`  ${group.map((node) => `${node.name} (${node.type}, ${node.id})`).join('  |  ')}`)
}

if (import.meta.url === `file://${process.argv[1]}`) void main()
