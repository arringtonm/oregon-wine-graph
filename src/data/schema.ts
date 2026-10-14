import { z } from 'zod'

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'must be a kebab-case slug')
const year = z.number().int().min(1700).max(2100)

const sourceSchema = z.strictObject({
  title: z.string().min(1),
  // Absent for sources with no public address, such as an emailed newsletter issue
  url: z.url().optional(),
})

// Who confirmed a verified record: a person in review mode, Jev checking it against its
// cited sources, or a test against official AVA boundaries. Absent on older records, which
// were all verified by a person.
const verifiedBy = z.enum(['person', 'jev', 'boundary']).optional()
export type VerifiedBy = NonNullable<z.infer<typeof verifiedBy>>

const baseNode = {
  id: slug,
  name: z.string().min(1),
  aka: z.array(z.string().min(1)).optional(),
  summary: z.string().min(1),
  // True for entities based outside Oregon (Burgundy houses, UC Davis, ...)
  outsideOregon: z.boolean().optional(),
  place: z.string().min(1).optional(),
  sources: z.array(sourceSchema).min(1),
  verified: z.boolean(),
  verifiedBy,
}

// Where to find a winery or vineyard today. `address` is the address the business gives
// visitors, often a tasting room that can move and can sit far from the vines, so it says
// nothing about AVA membership. Coordinates come from geocoding it.
const location = {
  address: z.string().min(1).optional(),
  coordinates: z.strictObject({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).optional(),
}

export const nodeSchema = z.discriminatedUnion('type', [
  z.strictObject({
    ...baseNode,
    type: z.literal('person'),
    born: year.optional(),
    died: year.optional(),
  }),
  z.strictObject({
    ...baseNode,
    type: z.literal('winery'),
    founded: year.optional(),
    closed: year.optional(),
    ...location,
  }),
  z.strictObject({
    ...baseNode,
    type: z.literal('vineyard'),
    planted: year.optional(),
    ...location,
  }),
  z.strictObject({
    ...baseNode,
    type: z.literal('ava'),
    established: year.optional(),
  }),
  z.strictObject({
    ...baseNode,
    type: z.literal('organization'),
    kind: z.enum(['trade-body', 'school', 'nonprofit', 'company', 'other']),
    founded: year.optional(),
  }),
  z.strictObject({
    ...baseNode,
    type: z.literal('event'),
    firstHeld: year.optional(),
    lastHeld: year.optional(),
  }),
])

export const NODE_TYPES = ['person', 'winery', 'vineyard', 'ava', 'organization', 'event'] as const
export type NodeType = (typeof NODE_TYPES)[number]

export const NODE_TYPE_LABELS: Record<NodeType, string> = {
  person: 'People',
  winery: 'Wineries',
  vineyard: 'Vineyards',
  ava: 'AVAs',
  organization: 'Organizations',
  event: 'Events',
}

export const EDGE_CATEGORIES = [
  'ownership',
  'work',
  'people',
  'fruit',
  'affiliation',
  'geography',
] as const
export type EdgeCategory = (typeof EDGE_CATEGORIES)[number]

export const EDGE_CATEGORY_LABELS: Record<EdgeCategory, string> = {
  ownership: 'Ownership',
  work: 'Work',
  people: 'Family & mentorship',
  fruit: 'Fruit sourcing',
  affiliation: 'Affiliation',
  geography: 'Geography',
}

interface EdgeRule {
  category: EdgeCategory
  // Reads source -> target, e.g. "David Lett founded The Eyrie Vineyards"
  label: string
  // Reads target -> source, e.g. "The Eyrie Vineyards founded by David Lett"
  inverseLabel: string
  from: readonly NodeType[]
  to: readonly NodeType[]
}

export const EDGE_RULES = {
  founded: {
    category: 'ownership',
    label: 'founded',
    inverseLabel: 'founded by',
    from: ['person'],
    to: ['winery', 'vineyard', 'organization', 'event'],
  },
  owns: {
    category: 'ownership',
    label: 'owns',
    inverseLabel: 'owned by',
    from: ['person', 'winery', 'organization'],
    to: ['winery', 'vineyard'],
  },
  acquired: {
    category: 'ownership',
    label: 'acquired',
    inverseLabel: 'acquired by',
    from: ['winery', 'organization'],
    to: ['winery', 'vineyard'],
  },
  successor_of: {
    category: 'ownership',
    label: 'successor of',
    inverseLabel: 'succeeded by',
    from: ['winery'],
    to: ['winery'],
  },
  winemaker: {
    category: 'work',
    label: 'winemaker at',
    inverseLabel: 'winemaker',
    from: ['person'],
    to: ['winery'],
  },
  worked_at: {
    category: 'work',
    label: 'worked at',
    inverseLabel: 'employed',
    from: ['person'],
    to: ['winery', 'vineyard', 'organization'],
  },
  consulted: {
    category: 'work',
    label: 'consulted for',
    inverseLabel: 'consultant',
    from: ['person'],
    to: ['winery', 'vineyard'],
  },
  // When role is "parent", the parent is the source
  family: {
    category: 'people',
    label: 'family of',
    inverseLabel: 'family of',
    from: ['person'],
    to: ['person'],
  },
  mentored: {
    category: 'people',
    label: 'mentored',
    inverseLabel: 'mentored by',
    from: ['person'],
    to: ['person'],
  },
  sources_from: {
    category: 'fruit',
    label: 'sources fruit from',
    inverseLabel: 'supplies fruit to',
    from: ['winery'],
    to: ['vineyard'],
  },
  studied_at: {
    category: 'affiliation',
    label: 'studied at',
    inverseLabel: 'alumni',
    from: ['person'],
    to: ['organization'],
  },
  member_of: {
    category: 'affiliation',
    label: 'member of',
    inverseLabel: 'member',
    from: ['person', 'winery'],
    to: ['organization'],
  },
  participated_in: {
    category: 'affiliation',
    label: 'took part in',
    inverseLabel: 'participant',
    from: ['person', 'winery'],
    to: ['event'],
  },
  hosts: {
    category: 'affiliation',
    label: 'hosts',
    inverseLabel: 'hosted by',
    from: ['organization'],
    to: ['event'],
  },
  // A vineyard's physical place. Only vineyards are "in" an AVA: a winery's tasting room
  // or office can be anywhere, and its grapes can come from several AVAs.
  located_in: {
    category: 'geography',
    label: 'located in',
    inverseLabel: 'contains',
    from: ['vineyard'],
    to: ['ava'],
  },
  // An AVA a winery makes wine from. A winery's full list of AVAs also includes those of
  // the vineyards it owns or buys from; this records the ones known without a vineyard.
  draws_from: {
    category: 'geography',
    label: 'draws fruit from',
    inverseLabel: 'supplies fruit to',
    from: ['winery'],
    to: ['ava'],
  },
  within: {
    category: 'geography',
    label: 'within',
    inverseLabel: 'contains',
    from: ['ava'],
    to: ['ava'],
  },
} as const satisfies Record<string, EdgeRule>

export type EdgeType = keyof typeof EDGE_RULES
const EDGE_TYPES = Object.keys(EDGE_RULES) as [EdgeType, ...EdgeType[]]

// The edge types that may run from a node of one type to a node of another
export function allowedEdgeTypes(from: NodeType, to: NodeType): EdgeType[] {
  return EDGE_TYPES.filter((type) => {
    const rule: EdgeRule = EDGE_RULES[type]
    return rule.from.includes(from) && rule.to.includes(to)
  })
}

export const edgeSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9]+(-+[a-z0-9]+)*$/, 'must be a slug'),
  source: slug,
  target: slug,
  type: z.enum(EDGE_TYPES),
  // Free-text detail, e.g. "assistant winemaker", "spouse", "vineyard manager"
  role: z.string().min(1).optional(),
  startYear: year.optional(),
  endYear: year.optional(),
  // True when the relationship still holds; absent endYear alone means "unknown"
  ongoing: z.boolean().optional(),
  note: z.string().min(1).optional(),
  sources: z.array(sourceSchema).min(1),
  verified: z.boolean(),
  verifiedBy,
})

export const graphSchema = z.strictObject({
  nodes: z.array(nodeSchema),
  edges: z.array(edgeSchema),
})

export type Source = z.infer<typeof sourceSchema>
export type GraphNode = z.infer<typeof nodeSchema>
export type GraphEdge = z.infer<typeof edgeSchema>
export type Graph = z.infer<typeof graphSchema>

// Cross-record checks the schema alone cannot express. Returns one message per problem.
export function checkGraph({ nodes, edges }: Graph): string[] {
  const problems: string[] = []
  const byId = new Map<string, GraphNode>()

  for (const node of nodes) {
    if (byId.has(node.id)) problems.push(`duplicate node id "${node.id}"`)
    byId.set(node.id, node)
  }

  const edgeIds = new Set<string>()
  for (const edge of edges) {
    if (edgeIds.has(edge.id)) problems.push(`duplicate edge id "${edge.id}"`)
    edgeIds.add(edge.id)

    const source = byId.get(edge.source)
    const target = byId.get(edge.target)
    if (!source) problems.push(`edge "${edge.id}": unknown source "${edge.source}"`)
    if (!target) problems.push(`edge "${edge.id}": unknown target "${edge.target}"`)
    if (edge.source === edge.target) problems.push(`edge "${edge.id}": source equals target`)

    const rule: EdgeRule = EDGE_RULES[edge.type]
    if (source && !rule.from.includes(source.type)) {
      problems.push(`edge "${edge.id}": "${edge.type}" cannot start from a ${source.type}`)
    }
    if (target && !rule.to.includes(target.type)) {
      problems.push(`edge "${edge.id}": "${edge.type}" cannot point to a ${target.type}`)
    }
    if (edge.startYear !== undefined && edge.endYear !== undefined && edge.startYear > edge.endYear) {
      problems.push(`edge "${edge.id}": startYear is after endYear`)
    }
    if (edge.ongoing && edge.endYear !== undefined) {
      problems.push(`edge "${edge.id}": ongoing edges cannot have an endYear`)
    }
  }

  return problems
}
