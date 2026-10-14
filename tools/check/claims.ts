import { EDGE_RULES, type Graph, type GraphEdge, type GraphNode } from '../../src/data/schema'

export type CheckedRecord = { kind: 'node'; record: GraphNode } | { kind: 'edge'; record: GraphEdge }

export interface Claims {
  // The record's central statement, judged on a four-level scale
  main: string
  // Further facts the record asserts, each judged true or false on its own
  details: Record<string, string>
  // Names to look for in a source; each inner list is one party and its aliases
  parties: string[][]
}

export function recordKey({ kind, record }: CheckedRecord): string {
  return `${kind}:${record.id}`
}

function namesOf(node: GraphNode): string[] {
  return [node.name, ...(node.aka ?? [])]
}

const NODE_DATES: [string, string][] = [
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
      if (typeof year === 'number') details[field] = `${node.name} ${phrase} ${year}.`
    }
    return { main: `About ${node.name}: ${node.summary}`, details, parties: [namesOf(node)] }
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
  if (edge.startYear !== undefined) details.startYear = `${subject}, starting in ${edge.startYear}.`
  if (edge.endYear !== undefined) details.endYear = `${subject}, and this ended in ${edge.endYear}.`
  return { main, details, parties: [namesOf(source), namesOf(target)] }
}

// Changes whenever what a record asserts changes, so stale results can be detected
export function claimsFingerprint(claims: Claims): string {
  return JSON.stringify([claims.main, claims.details])
}
