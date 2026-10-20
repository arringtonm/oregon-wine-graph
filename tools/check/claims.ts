import { allowedEdgeTypes, EDGE_RULES, type Graph, type GraphEdge, type GraphNode, type YearField } from '../../src/data/schema'

export type CheckedRecord = { kind: 'node'; record: GraphNode } | { kind: 'edge'; record: GraphEdge }

export interface Claims {
  // The record's central statement, judged on a four-level scale
  main: string
  // Further facts the record asserts, each judged true or false on its own. A year the sources
  // disagree on is one claim per year ("founded", "founded@1965"): any one of them will do
  details: Record<string, string>
  // Names to look for in a source; each inner list is one party and its aliases
  parties: string[][]
  // For a connection: every relationship its two ends could have, as statements, so a source
  // can be asked which one it describes. A source that describes a different relationship
  // between the same two doesn't support this one, however closely it's worded.
  relationships?: { own: GraphEdge['type']; options: Partial<Record<GraphEdge['type'], string>> }
}

export function recordKey({ kind, record }: CheckedRecord): string {
  return `${kind}:${record.id}`
}

function namesOf(node: GraphNode): string[] {
  return [node.name, ...(node.aka ?? [])]
}

// "Founded in 1971 by David Lett. Sold in 2006." -> two sentences. Abbreviations such as
// "St.", "Ste." and "Mt." and initials such as "J. Christopher" don't end a sentence.
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9“"])/)
    .reduce<string[]>((sentences, part) => {
      const last = sentences[sentences.length - 1]
      if (last && /(\b(St|Ste|Mt|Dr|Mr|Mrs|Ms|Jr|Sr|Inc|Co|Ltd|No|vs|ca)|\b[A-Z])\.$/.test(last)) sentences[sentences.length - 1] = `${last} ${part}`
      else sentences.push(part)
      return sentences
    }, [])
    .map((sentence) => sentence.trim())
    .filter(Boolean)
}

// One claim for the year a record gives, and one for each other year a source gives for it
function yearClaims(record: GraphNode | GraphEdge, field: YearField, say: (year: number) => string): Record<string, string> {
  const claims: Record<string, string> = { [field]: say((record as Partial<Record<YearField, number>>)[field]!) }
  for (const year of record.alsoDated?.[field] ?? []) claims[`${field}@${year}`] = say(year)
  return claims
}

// The detail a claim id belongs to: "founded@1965" is one way of supporting "founded"
export const detailGroup = (id: string) => id.split('@')[0]

const NODE_DATES: [YearField, string][] = [
  ['born', 'was born in'],
  ['died', 'died in'],
  ['founded', 'was founded in'],
  ['closed', 'closed in'],
  ['planted', 'was first planted in'],
  ['established', 'was established as an appellation in'],
  ['firstHeld', 'was first held in'],
  ['lastHeld', 'was last held in'],
]

// Breaks a record into statements a source can be checked against one at a time
export function claimsFor(item: CheckedRecord, graph: Graph): Claims {
  if (item.kind === 'node') {
    const node = item.record
    const details: Record<string, string> = {}
    for (const [field, phrase] of NODE_DATES) {
      const year = (node as Record<string, unknown>)[field]
      if (typeof year === 'number') Object.assign(details, yearClaims(node, field, (y) => `${node.name} ${phrase} ${y}.`))
    }
    // Summaries often draw on several sources, so each sentence after the first is its own
    // detail, which any one source may support
    const [first, ...rest] = splitSentences(node.summary)
    rest.forEach((sentence, index) => (details[`sentence${index + 2}`] = `About ${node.name}: ${sentence}`))
    return { main: `About ${node.name}: ${first ?? node.summary}`, details, parties: [namesOf(node)] }
  }

  const edge = item.record
  const source = graph.nodes.find((node) => node.id === edge.source)!
  const target = graph.nodes.find((node) => node.id === edge.target)!
  let main = `${source.name} ${EDGE_RULES[edge.type].label} ${target.name}.`
  if (edge.type === 'family' && edge.role) {
    main =
      edge.role === 'parent'
        ? `${source.name} is a parent of ${target.name}.`
        : `${source.name} is the ${edge.role} of ${target.name}.`
  }
  const subject = main.slice(0, -1)
  const details: Record<string, string> = {}
  if (edge.role && edge.type !== 'family') details.role = `${subject}, specifically as: ${edge.role}.`
  if (edge.startYear !== undefined) Object.assign(details, yearClaims(edge, 'startYear', (y) => `${subject}, starting in ${y}.`))
  if (edge.endYear !== undefined) Object.assign(details, yearClaims(edge, 'endYear', (y) => `${subject}, and this ended in ${y}.`))
  // Each vintage is its own claim, which the approval for that wine supports
  for (const y of edge.vintages ?? []) details[`vintage${y}`] = `${subject}, for a wine of the ${y} vintage.`
  const types = allowedEdgeTypes(source.type, target.type)
  const relationships =
    types.length > 1
      ? {
          own: edge.type,
          options: Object.fromEntries(
            types.map((type) => [type, `${source.name} ${type === 'family' ? 'is family of' : EDGE_RULES[type].label} ${target.name}.`]),
          ),
        }
      : undefined
  return { main, details, parties: [namesOf(source), namesOf(target)], ...(relationships ? { relationships } : {}) }
}

// Changes whenever what a record asserts changes, so stale results can be detected
export function claimsFingerprint(claims: Claims): string {
  return JSON.stringify([claims.main, claims.details])
}
