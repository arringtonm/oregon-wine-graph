import {
  EDGE_RULES,
  NODE_TYPES,
  allowedEdgeTypes,
  type EdgeType,
  type Graph,
  type GraphEdge,
  type GraphNode,
  type NodeType,
} from '../../src/data/schema'
import type { Answer, DecisionModel, Question } from './model'

// Fields below this confidence are flagged for the person confirming the proposal
export const REVIEW_THRESHOLD = 0.8
const MAX_CANDIDATES = 8
const NONE = 'none'
const NEW = 'new:'

type NodeRef = Pick<GraphNode, 'id' | 'name' | 'type'>

export type ProposedEdge = Pick<GraphEdge, 'source' | 'target' | 'type' | 'role' | 'startYear' | 'endYear' | 'ongoing'>
export type ProposalField = 'other' | 'type' | 'direction' | 'role' | 'startYear' | 'endYear'

export interface Proposal {
  model: DecisionModel['name']
  // Null when the sentence could not be turned into a connection; see problems
  edge: ProposedEdge | null
  // The nodes the sentence might refer to, best match first
  candidates: NodeRef[]
  // Set when the other party is not in the graph yet and would be created on saving
  newNode: NodeRef | null
  confidence: Partial<Record<ProposalField, number>>
  // Reasons no edge could be proposed
  problems: string[]
  // Things to look at before saving
  warnings: string[]
}

const GENERIC_WORDS = /\b(the|winery|wines?|vineyards?|cellars?|estate|family|company|co|ava)\b/g

const PLACE_WORDS = new Set(['hill', 'hills', 'ridge', 'valley', 'creek', 'mountain', 'mountains', 'river', 'rock', 'ranch', 'farm'])

function words(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9à-ÿ'&-]+/g) ?? []
}

function containsPhrase(haystack: string[], phrase: string[]): boolean {
  if (phrase.length === 0) return false
  return haystack.some((_, start) => phrase.every((word, offset) => haystack[start + offset] === word))
}

// Nodes the sentence could be naming, other than the page it was typed on (if any). Full
// names and aliases beat a lone first or last name; nodes already connected to the context
// node win ties, which is what makes "Jeanne" on Dan Diephouse's page unambiguous.
export function findCandidates(text: string, context: GraphNode | null, graph: Graph, limit = MAX_CANDIDATES): GraphNode[] {
  const textWords = words(text)
  const capitalised = new Set((text.match(/\b[A-ZÀ-Ý][\wà-ÿ'-]+/g) ?? []).map((word) => word.toLowerCase()))
  const contextWords = new Set(context ? words([context.name, ...(context.aka ?? [])].join(' ')) : [])
  const neighbours = new Set<string>()
  const degree = new Map<string, number>()
  for (const edge of graph.edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1)
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1)
    if (edge.source === context?.id) neighbours.add(edge.target)
    if (edge.target === context?.id) neighbours.add(edge.source)
  }

  const scored: { node: GraphNode; score: number }[] = []
  for (const node of graph.nodes) {
    if (node.id === context?.id) continue
    let score = 0
    for (const name of [node.name, ...(node.aka ?? [])]) {
      if (containsPhrase(textWords, words(name))) score = Math.max(score, 3)
      // A name with its generic words removed ("Eyrie" for "The Eyrie Vineyards"), unless
      // all that is left is a landscape word shared by many names ("Wine Hill" -> "hill")
      const core = words(name.toLowerCase().replace(GENERIC_WORDS, ' '))
      const distinctive = core.length > 1 || (core.length === 1 && !PLACE_WORDS.has(core[0]))
      if (distinctive && containsPhrase(textWords, core)) score = Math.max(score, 2)
    }
    if (score === 0 && node.type === 'person') {
      const parts = words(node.name)
      const matches = [parts[0], parts[parts.length - 1]].some(
        (part) => capitalised.has(part) && !contextWords.has(part),
      )
      if (matches) score = 1
    }
    if (score > 0) scored.push({ node, score: score + (neighbours.has(node.id) ? 0.5 : 0) })
  }

  return scored
    .sort((a, b) => b.score - a.score || (degree.get(b.node.id) ?? 0) - (degree.get(a.node.id) ?? 0))
    .slice(0, limit)
    .map(({ node }) => node)
}

export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f'’.]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Capitalised phrases in the sentence that name neither the page's own node nor a matched
// candidate: likely people, businesses or places the graph does not have yet.
export function findUnknownNames(text: string, context: GraphNode, candidates: GraphNode[]): string[] {
  const contextWords = new Set(words([context.name, ...(context.aka ?? [])].join(' ')))
  const known = candidates.flatMap((candidate) => [candidate.name, ...(candidate.aka ?? [])]).map((name) => words(name))
  const runs = text.match(/[A-ZÀ-Ý][\wà-ÿ'’&.-]*(?:\s+(?:(?:of|de|du|la|le)\s+)?[A-ZÀ-Ý][\wà-ÿ'’&.-]*)*/g) ?? []
  const names: string[] = []
  for (const run of runs) {
    const kept = run.split(/\s+/).filter((word) => !contextWords.has(words(word)[0] ?? ''))
    const phrase = kept.join(' ').replace(/[.,;:]+$/, '')
    const phraseWords = words(phrase)
    if (phraseWords.length === 0) continue
    // A lone capitalised verb opening the sentence ("Founded by ...") is not a name
    if (phraseWords.length === 1 && text.trimStart().startsWith(run) && /(ed|s|ing)$/.test(phraseWords[0])) continue
    if (known.some((name) => containsPhrase(name, phraseWords) || containsPhrase(phraseWords, name))) continue
    if (!names.includes(phrase)) names.push(phrase)
  }
  return names.slice(0, 3)
}

const NODE_TYPE_DESCRIPTIONS: Record<NodeType, string> = {
  person: 'A person.',
  winery: 'A winery, wine label or wine-producing business.',
  vineyard: 'A specific named vineyard site where grapes are grown.',
  ava: 'An appellation or wine region.',
  organization: 'A school, trade body, nonprofit or other company.',
  event: 'An event, festival or conference.',
}

function describe(node: GraphNode): string {
  return `${node.name} (${node.type}): ${node.summary}`
}

function buildQuestions(
  context: GraphNode,
  candidates: GraphNode[],
  unknownNames: string[],
  years: string[],
): Record<string, Question> {
  const types = new Set<EdgeType>()
  // A name not in the graph could be any type of node, so any relationship is possible
  const otherTypes = unknownNames.length > 0 ? NODE_TYPES : candidates.map((candidate) => candidate.type)
  for (const otherType of otherTypes) {
    for (const type of allowedEdgeTypes(context.type, otherType)) types.add(type)
    for (const type of allowedEdgeTypes(otherType, context.type)) types.add(type)
  }
  const yearOptions = (which: string) => ({
    ...Object.fromEntries(years.map((year) => [year, `The relationship ${which} in ${year}.`])),
    [NONE]: `The sentence does not say when the relationship ${which}.`,
  })

  const questions: Record<string, Question> = {
    states_relationship: {
      type: 'noul',
      instructions: 'The sentence states a relationship between the subject and another person, business or place.',
    },
    other_party: {
      type: 'choice',
      instructions: `Besides ${context.name}, which of these does the sentence refer to?`,
      criteria: {
        ...Object.fromEntries(candidates.map((candidate) => [candidate.id, describe(candidate)])),
        ...Object.fromEntries(
          unknownNames.map((name, index) => [`${NEW}${index}`, `"${name}", which is not one of the listed candidates.`]),
        ),
        [NONE]: 'None of these.',
      },
    },
    type: {
      type: 'choice',
      instructions: 'Which kind of relationship does the sentence state?',
      criteria: {
        ...Object.fromEntries([...types].map((type) => [type, `One party ${EDGE_RULES[type].label} the other.`])),
        [NONE]: 'None of these relationships.',
      },
    },
    direction: {
      type: 'choice',
      instructions: `Reading the relationship as "A <relationship> B", is ${context.name} A or B?`,
      criteria: {
        context_is_source: `${context.name} is A, the one who acts (the founder, owner, employee, mentor, buyer).`,
        context_is_target: `${context.name} is B, the one acted upon.`,
      },
    },
    family_role: {
      type: 'choice',
      instructions: `If this is a family relationship, what is ${context.name} to the other person?`,
      criteria: {
        spouse: 'Their husband, wife or spouse.',
        parent: 'Their father, mother or parent.',
        child: 'Their son, daughter or child.',
        sibling: 'Their brother, sister or sibling.',
        [NONE]: 'Another family tie, or not a family relationship.',
      },
    },
    ongoing: { type: 'noul', instructions: 'The relationship still holds today.' },
  }
  if (unknownNames.length > 0) {
    questions.new_node_type = {
      type: 'choice',
      instructions: `What kind of thing is the other party named in the sentence (not ${context.name})?`,
      criteria: NODE_TYPE_DESCRIPTIONS,
    }
  }
  if (years.length > 0) {
    questions.start_year = {
      type: 'choice',
      instructions: 'In which year did the relationship begin?',
      criteria: yearOptions('began'),
    }
    questions.end_year = {
      type: 'choice',
      instructions: 'In which year did the relationship end?',
      criteria: yearOptions('ended'),
    }
  }
  return questions
}

function chosen(answer: Answer | undefined): { value: string | null; confidence: number } {
  if (answer?.type !== 'choice' || answer.choice === NONE) return { value: null, confidence: answer?.type === 'choice' ? answer.confidence : 0 }
  return { value: answer.choice, confidence: answer.confidence }
}

// Turns one sentence typed on a node's page into a proposed connection. Our code finds the
// candidates and enforces the rules; the model only chooses among options it is given.
export async function parseConnection(
  text: string,
  contextId: string,
  graph: Graph,
  model: DecisionModel,
): Promise<Proposal> {
  const proposal: Proposal = {
    model: model.name,
    edge: null,
    candidates: [],
    newNode: null,
    confidence: {},
    problems: [],
    warnings: [],
  }
  const context = graph.nodes.find((node) => node.id === contextId)
  if (!context) {
    proposal.problems.push(`No node with id "${contextId}".`)
    return proposal
  }
  const candidates = findCandidates(text, context, graph)
  proposal.candidates = candidates.map(({ id, name, type }) => ({ id, name, type }))
  const unknownNames = findUnknownNames(text, context, candidates)
  if (candidates.length === 0 && unknownNames.length === 0) {
    proposal.problems.push(`Could not find a name in that sentence other than ${context.name}.`)
    return proposal
  }

  const years = [...new Set(text.match(/\b(1[789]\d\d|20\d\d)\b/g) ?? [])]
  const state = [
    `Sentence: ${text.replace(/\s+/g, ' ').trim()}`,
    `The sentence was written about: ${describe(context)}`,
    'Candidates for the other party:',
    ...candidates.map((candidate) => `- ${describe(candidate)}`),
    ...unknownNames.map((name) => `- "${name}" (not in the graph yet)`),
  ].join('\n')
  const answers = await model.ask(state, buildQuestions(context, candidates, unknownNames, years))

  const relationship = answers.states_relationship
  const other = chosen(answers.other_party)
  const type = chosen(answers.type)
  if ((relationship?.type === 'noul' && relationship.noul < 0.5) || !type.value) {
    proposal.problems.push('Could not find one of the known relationship types in that sentence.')
    return proposal
  }
  const edgeType = type.value as EdgeType
  const fitsType = (type: NodeType) =>
    allowedEdgeTypes(context.type, type).includes(edgeType) || allowedEdgeTypes(type, context.type).includes(edgeType)
  const fits = (candidate: NodeRef) => fitsType(candidate.type)
  let otherNode: NodeRef | undefined = candidates.find((candidate) => candidate.id === other.value)

  // The other party is a name the graph does not have: propose creating it. Its type is
  // whatever the relationship allows, with the model's opinion breaking ties.
  if (other.value?.startsWith(NEW)) {
    const name = unknownNames[Number(other.value.slice(NEW.length))]
    const possible = NODE_TYPES.filter(fitsType)
    const opinion = chosen(answers.new_node_type)
    const id = slugify(name)
    const existing = graph.nodes.find((node) => node.id === id)
    if (existing) {
      otherNode = existing
    } else if (possible.length === 0) {
      proposal.problems.push(`Nothing can be joined to a ${context.type} by "${EDGE_RULES[edgeType].label}".`)
      return proposal
    } else {
      const type = possible.find((candidate) => candidate === opinion.value) ?? possible[0]
      otherNode = proposal.newNode = { id, name, type }
      proposal.candidates.push(proposal.newNode)
      proposal.warnings.push(`"${name}" is not in the graph yet. Saving will add it as a new ${type}.`)
      if (type !== opinion.value) other.confidence = Math.min(other.confidence, opinion.confidence, 0.5)
    }
  }
  if (!otherNode) {
    proposal.problems.push('Could not tell which person, business or place the sentence refers to.')
    return proposal
  }
  // "Dan and Jeanne own Corollary" names two parties. When the one the model picked cannot
  // take this relationship, fall back to the likeliest candidate that can.
  if (!fits(otherNode)) {
    const likelihood = answers.other_party?.type === 'choice' ? answers.other_party.probabilities : {}
    const fallback = candidates
      .filter(fits)
      .sort((a, b) => (likelihood[b.id] ?? 0) - (likelihood[a.id] ?? 0))[0]
    if (fallback) {
      proposal.warnings.push(
        `The sentence seems to name more than one party. This covers ${fallback.name} only; add the others separately.`,
      )
      other.confidence = Math.min(other.confidence, likelihood[fallback.id] ?? 0)
      otherNode = fallback
    }
  }
  const direction = chosen(answers.direction)
  let contextIsSource = direction.value !== 'context_is_target'
  let role: string | undefined
  proposal.confidence = { other: other.confidence, type: type.confidence, direction: direction.confidence }

  if (edgeType === 'family') {
    const familyRole = chosen(answers.family_role)
    proposal.confidence.role = familyRole.confidence
    // The schema's convention: a parent/child tie is stored with the parent as the source
    if (familyRole.value === 'child') {
      role = 'parent'
      contextIsSource = false
    } else if (familyRole.value) {
      role = familyRole.value
      contextIsSource = true
    }
    proposal.confidence.direction = familyRole.confidence
  }

  // Where the rules allow only one direction, the rules decide
  const forward = allowedEdgeTypes(context.type, otherNode.type).includes(edgeType)
  const backward = allowedEdgeTypes(otherNode.type, context.type).includes(edgeType)
  if (!forward && !backward) {
    proposal.problems.push(
      `A ${context.type} and a ${otherNode.type} cannot be joined by "${EDGE_RULES[edgeType].label}".`,
    )
    return proposal
  }
  if (contextIsSource && !forward) contextIsSource = false
  if (!contextIsSource && !backward) contextIsSource = true

  const edge: ProposedEdge = {
    source: contextIsSource ? context.id : otherNode.id,
    target: contextIsSource ? otherNode.id : context.id,
    type: edgeType,
  }
  if (role) edge.role = role
  const start = chosen(answers.start_year)
  const end = chosen(answers.end_year)
  if (start.value) edge.startYear = Number(start.value)
  if (end.value) edge.endYear = Number(end.value)
  if (years.length > 0) Object.assign(proposal.confidence, { startYear: start.confidence, endYear: end.confidence })
  if (edge.startYear !== undefined && edge.endYear !== undefined && edge.startYear > edge.endYear) {
    delete edge.endYear
    proposal.warnings.push('The years in the sentence could not be ordered; check them.')
  }
  const ongoing = answers.ongoing
  if (ongoing?.type === 'noul' && ongoing.noul >= REVIEW_THRESHOLD && edge.endYear === undefined) edge.ongoing = true

  const duplicate = graph.edges.find(
    (existing) =>
      existing.type === edge.type &&
      ((existing.source === edge.source && existing.target === edge.target) ||
        (edge.type === 'family' && existing.source === edge.target && existing.target === edge.source)),
  )
  if (duplicate) proposal.warnings.push(`A similar connection already exists (${duplicate.id}).`)
  if (candidates.length > 1 && other.confidence < REVIEW_THRESHOLD) {
    proposal.warnings.push('More than one node matches a name in the sentence; check the other party.')
  }

  proposal.edge = edge
  return proposal
}
