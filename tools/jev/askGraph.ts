// Answers a question about the graph ("Who made the wine at Eyrie?"). Jev is a decision
// model and writes no text, so it is asked only to interpret: which of the common questions
// below this is, and which person or place it is about. The answer itself is read from the
// graph's own records, so it can be wrong only by misreading the question, never by
// inventing a fact. Questions that fit none of the common shapes fall back to Jev ranking
// the records that look relevant, offered as its best guess.
import {
  EDGE_RULES,
  type EdgeType,
  type Graph,
  type GraphEdge,
  type GraphNode,
  type NodeType,
} from '../../src/data/schema'
import { matchesQuery } from '../../src/graph/textMatch'
import type { Answer, DecisionModel, Question } from './model'
import { REVIEW_THRESHOLD, findCandidates } from './parseConnection'

type NodeRef = Pick<GraphNode, 'id' | 'name' | 'type'>

export interface AskResult {
  node: NodeRef
  // How the record answers, e.g. "winemaker, 1966–2008"
  detail?: string
}

export interface AskAnswer {
  model: DecisionModel['name']
  // 'common': one of the common questions; 'ranked': Jev's ranking of likely records
  kind: 'common' | 'ranked' | 'none'
  // How the question was read, e.g. "Who made the wine at The Eyrie Vineyards?"
  readAs?: string
  questionId?: string
  subjectId?: string
  // Jev's confidence in that reading, 0 to 1
  confidence: number
  bestGuess: boolean
  sentence: string
  results: AskResult[]
  // The runner-up reading, offered when the first is uncertain
  alternative?: { readAs: string; questionId: string; subjectId: string; secondId?: string }
}

// A reading chosen by hand instead of by Jev (the "did you mean" alternative)
export interface AskOverride {
  questionId: string
  subjectId: string
  secondId?: string
}

const ref = (node: GraphNode): NodeRef => ({ id: node.id, name: node.name, type: node.type })

function years(edge: GraphEdge): string {
  if (edge.startYear && edge.endYear) return edge.startYear === edge.endYear ? `${edge.startYear}` : `${edge.startYear}–${edge.endYear}`
  if (edge.startYear) return edge.ongoing ? `since ${edge.startYear}` : `from ${edge.startYear}`
  if (edge.endYear) return `until ${edge.endYear}`
  return ''
}

// The nodes at the other end of a node's connections of the given types
function related(graph: Graph, subject: GraphNode, types: EdgeType[], direction: 'in' | 'out' | 'both'): AskResult[] {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  const results: AskResult[] = []
  for (const edge of graph.edges) {
    if (!types.includes(edge.type)) continue
    const outgoing = edge.source === subject.id && direction !== 'in'
    const incoming = edge.target === subject.id && direction !== 'out'
    if (!outgoing && !incoming) continue
    const other = byId.get(outgoing ? edge.target : edge.source)
    if (!other) continue
    const label = types.length > 1 ? (outgoing ? EDGE_RULES[edge.type].label : EDGE_RULES[edge.type].inverseLabel) : ''
    const detail = [label, edge.role, years(edge)].filter(Boolean).join(', ')
    results.push({ node: ref(other), ...(detail ? { detail } : {}) })
  }
  return results
}

function list(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

interface CommonQuestion {
  id: string
  // What Jev reads when deciding whether this is the question asked
  describes: string
  // The question as shown back to the reader, for a given subject
  readAs: (subject: GraphNode, second?: GraphNode) => string
  // A starter for the suggestion chips, ending where the name goes
  starter: string
  subjects: NodeType[]
  // Used without a key, in place of Jev's reading
  keywords: RegExp
  needsSecond?: boolean
  answer: (graph: Graph, subject: GraphNode, second?: GraphNode) => { sentence: string; results: AskResult[] }
}

// Answers built from related nodes: "<lead> <subject>: a, b and c." or "none recorded"
function relatedAnswer(lead: string, types: EdgeType[], direction: 'in' | 'out' | 'both') {
  return (graph: Graph, subject: GraphNode) => {
    const results = related(graph, subject, types, direction)
    const sentence = results.length
      ? `${lead} ${subject.name}: ${list(results.map((result) => result.node.name))}.`
      : `The graph has no ${lead.toLowerCase()} ${subject.name} yet.`
    return { sentence, results }
  }
}

const PLACES: NodeType[] = ['winery', 'vineyard', 'organization']
const ANY: NodeType[] = ['person', 'winery', 'vineyard', 'ava', 'organization', 'event']

export const COMMON_QUESTIONS: CommonQuestion[] = [
  {
    id: 'founders',
    describes: 'Asks who founded, started or established a winery, vineyard or organization.',
    readAs: (s) => `Who founded ${s.name}?`,
    starter: 'Who founded ',
    subjects: PLACES,
    keywords: /\b(found(ed|er|ers)|start(ed)?|establish(ed)?)\b/,
    answer: relatedAnswer('Founders of', ['founded'], 'in'),
  },
  {
    id: 'owners',
    describes: 'Asks who owns or owned a winery, vineyard or organization, or who bought it.',
    readAs: (s) => `Who owns ${s.name}?`,
    starter: 'Who owns ',
    subjects: PLACES,
    keywords: /\b(own(s|ed|er|ers)?|bought|acquired|purchased)\b/,
    answer: relatedAnswer('Owners of', ['owns', 'acquired'], 'in'),
  },
  {
    id: 'winemakers',
    describes: 'Asks who made the wine, or was winemaker, at a winery or vineyard.',
    readAs: (s) => `Who made the wine at ${s.name}?`,
    starter: 'Who made the wine at ',
    subjects: ['winery', 'vineyard'],
    keywords: /\b(wine ?makers?|made the wine|makes the wine)\b/,
    answer: relatedAnswer('Winemakers at', ['winemaker'], 'in'),
  },
  {
    id: 'staff',
    describes: 'Asks who worked at, or consulted for, a winery, vineyard or organization.',
    readAs: (s) => `Who worked at ${s.name}?`,
    starter: 'Who worked at ',
    subjects: PLACES,
    keywords: /\bwho (has )?(work(s|ed)?|consulted)\b/,
    answer: relatedAnswer('People who worked at', ['winemaker', 'worked_at', 'consulted'], 'in'),
  },
  {
    id: 'career',
    describes: 'Asks where a person worked, made wine, or what they founded or owned: their career.',
    readAs: (s) => `Where did ${s.name} work?`,
    starter: 'Where did ',
    subjects: ['person'],
    keywords: /\bwhere (did|does|has) .+ (work|make wine|worked)\b|\bcareer\b/,
    answer: relatedAnswer('Where', ['winemaker', 'worked_at', 'consulted', 'founded', 'owns'], 'out'),
  },
  {
    id: 'education',
    describes: 'Asks where a person studied or trained at a school.',
    readAs: (s) => `Where did ${s.name} study?`,
    starter: 'Where did … study? ',
    subjects: ['person'],
    keywords: /\b(stud(y|ied)|school|degree|graduat\w+)\b/,
    answer: relatedAnswer('Schools of', ['studied_at'], 'out'),
  },
  {
    id: 'mentors',
    describes: 'Asks who mentored or trained a person, or whom they learned from.',
    readAs: (s) => `Who mentored ${s.name}?`,
    starter: 'Who mentored ',
    subjects: ['person'],
    keywords: /\bwho (mentored|trained|taught)\b|\blearn(ed)? from\b/,
    answer: relatedAnswer('Mentors of', ['mentored'], 'in'),
  },
  {
    id: 'mentees',
    describes: 'Asks whom a person mentored or trained.',
    readAs: (s) => `Whom did ${s.name} mentor?`,
    starter: 'Whom did … mentor? ',
    subjects: ['person'],
    keywords: /\bwhom? did .+ (mentor|train)\b|\b(protégés?|proteges?|mentees?)\b/,
    answer: relatedAnswer('People mentored by', ['mentored'], 'out'),
  },
  {
    id: 'family',
    describes: "Asks about a person's family: spouse, parents, children or siblings.",
    readAs: (s) => `Who is in ${s.name}'s family?`,
    starter: 'Who is related to ',
    subjects: ['person'],
    keywords: /\b(family|married|wife|husband|spouse|son|daughter|father|mother|brother|sister|related)\b/,
    answer: relatedAnswer('Family of', ['family'], 'both'),
  },
  {
    id: 'fruit_sources',
    describes: 'Asks where a winery gets its grapes or fruit: which vineyards it buys from.',
    readAs: (s) => `Where does ${s.name} get its fruit?`,
    starter: 'Where does … get its fruit? ',
    subjects: ['winery'],
    keywords: /\b(fruit|grapes)\b.*\b(from|source)\b|\bsources?\b/,
    answer: relatedAnswer('Fruit sources of', ['sources_from'], 'out'),
  },
  {
    id: 'fruit_buyers',
    describes: "Asks which wineries buy fruit from a vineyard, or make wine from its grapes.",
    readAs: (s) => `Who buys fruit from ${s.name}?`,
    starter: 'Who buys fruit from ',
    subjects: ['vineyard'],
    keywords: /\bwho (buys|bought|uses)\b/,
    answer: relatedAnswer('Wineries buying from', ['sources_from'], 'in'),
  },
  {
    id: 'ava_members',
    describes: 'Asks which vineyards or wineries are in, or draw fruit from, an AVA or wine region.',
    readAs: (s) => `What is in ${s.name}?`,
    starter: 'Which vineyards are in ',
    subjects: ['ava'],
    keywords: /\b(which|what) (vineyards|wineries)\b|\bin the .+ ava\b/,
    answer: relatedAnswer('In', ['located_in', 'draws_from', 'within'], 'in'),
  },
  {
    id: 'avas_of',
    describes: 'Asks which AVA or wine region a vineyard or winery is in, or draws fruit from.',
    readAs: (s) => `Which AVAs is ${s.name} in?`,
    starter: 'Which AVA is ',
    subjects: ['winery', 'vineyard', 'ava'],
    keywords: /\bwhich (ava|appellation|region)\b/,
    answer: relatedAnswer('AVAs of', ['located_in', 'draws_from', 'within'], 'out'),
  },
  {
    id: 'when_founded',
    describes: 'Asks when a winery or organization was founded, a vineyard planted, or a person born.',
    readAs: (s) => `When was ${s.name} ${s.type === 'vineyard' ? 'planted' : s.type === 'person' ? 'born' : 'founded'}?`,
    starter: 'When was … founded? ',
    subjects: ANY,
    keywords: /\bwhen (was|were|did)\b|\bwhat year\b/,
    answer: (_graph, subject) => {
      const record = subject as GraphNode & { founded?: number; planted?: number; born?: number; established?: number; year?: number }
      const year = record.founded ?? record.planted ?? record.established ?? record.born ?? record.year
      const verb = subject.type === 'vineyard' ? 'planted' : subject.type === 'person' ? 'born' : 'founded'
      return {
        sentence: year ? `${subject.name} was ${verb} in ${year}.` : `The graph does not record when ${subject.name} was ${verb}.`,
        results: [{ node: ref(subject), ...(year ? { detail: `${verb} ${year}` } : {}) }],
      }
    },
  },
  {
    id: 'path',
    describes: 'Asks how two people or places are connected or related to each other.',
    readAs: (s, t) => `How are ${s.name} and ${t?.name ?? '…'} connected?`,
    starter: 'How are … and … connected? ',
    subjects: ANY,
    keywords: /\bhow (are|is|were)\b.*\b(connected|related|linked)\b/,
    needsSecond: true,
    answer: (graph, subject, second) => {
      if (!second) return { sentence: 'Name two people or places to connect.', results: [] }
      const path = shortestPath(graph, subject.id, second.id)
      if (!path) return { sentence: `The graph has no connection between ${subject.name} and ${second.name}.`, results: [] }
      const byId = new Map(graph.nodes.map((node) => [node.id, node]))
      const results: AskResult[] = path.nodes.map((id, index) => {
        const edge = path.edges[index - 1]
        const node = byId.get(id)!
        if (!edge) return { node: ref(node) }
        // Each step as a plain statement in the connection's own direction:
        // "David Lett studied at UC Davis", whichever way the path runs
        const role = edge.type === 'family' && edge.role ? ` (${edge.role})` : ''
        return { node: ref(node), detail: `${byId.get(edge.source)!.name} ${EDGE_RULES[edge.type].label} ${byId.get(edge.target)!.name}${role}` }
      })
      const steps = path.edges.length
      return {
        sentence: `${subject.name} and ${second.name} are ${steps === 1 ? 'directly connected' : `${steps} steps apart`}: ${results.map((r) => r.node.name).join(' → ')}.`,
        results,
      }
    },
  },
]

// Fewest connections between two nodes, through any kind of connection
export function shortestPath(graph: Graph, from: string, to: string): { nodes: string[]; edges: GraphEdge[] } | null {
  const adjacent = new Map<string, { next: string; edge: GraphEdge }[]>()
  for (const edge of graph.edges) {
    adjacent.set(edge.source, [...(adjacent.get(edge.source) ?? []), { next: edge.target, edge }])
    adjacent.set(edge.target, [...(adjacent.get(edge.target) ?? []), { next: edge.source, edge }])
  }
  const previous = new Map<string, { from: string; edge: GraphEdge } | null>([[from, null]])
  const queue = [from]
  while (queue.length > 0) {
    const current = queue.shift()!
    if (current === to) break
    for (const { next, edge } of adjacent.get(current) ?? []) {
      if (previous.has(next)) continue
      previous.set(next, { from: current, edge })
      queue.push(next)
    }
  }
  if (!previous.has(to)) return null
  const nodes = [to]
  const edges: GraphEdge[] = []
  for (let step = previous.get(to); step; step = previous.get(step.from)) {
    nodes.unshift(step.from)
    edges.unshift(step.edge)
  }
  return { nodes, edges }
}

const NONE = 'none'
const OTHER = 'other'

function describe(node: GraphNode): string {
  return `${node.name} (${node.type}): ${node.summary}`
}

function chosen(answer: Answer | undefined) {
  if (answer?.type !== 'choice') return { value: null, confidence: 0, probabilities: {} as Record<string, number> }
  return {
    value: answer.choice === NONE || answer.choice === OTHER ? null : answer.choice,
    confidence: answer.confidence,
    probabilities: answer.probabilities,
  }
}

function runnerUp(probabilities: Record<string, number>, exclude: (string | null)[]): string | null {
  const ranked = Object.entries(probabilities)
    .filter(([option]) => option !== NONE && option !== OTHER && !exclude.includes(option))
    .sort((a, b) => b[1] - a[1])
  return ranked[0]?.[0] ?? null
}

function commonAnswer(
  model: DecisionModel['name'],
  question: CommonQuestion,
  graph: Graph,
  subject: GraphNode,
  second: GraphNode | undefined,
  confidence: number,
): AskAnswer {
  const { sentence, results } = question.answer(graph, subject, second)
  return {
    model,
    kind: 'common',
    readAs: question.readAs(subject, second),
    questionId: question.id,
    subjectId: subject.id,
    confidence,
    bestGuess: confidence < REVIEW_THRESHOLD,
    sentence,
    results,
  }
}

// Records whose text shares words with the question, for Jev to rank
function textMatches(question: string, graph: Graph, limit: number): GraphNode[] {
  const words = question
    .toLowerCase()
    .match(/[a-zà-ÿ0-9'-]{4,}/g)
    ?.filter((word) => !/^(what|which|where|when|whom|does|did|were|have|with|from|that|this|about|there|their)$/.test(word))
  if (!words?.length) return []
  return graph.nodes
    .map((node) => ({
      node,
      hits: words.filter((word) => matchesQuery(word, [node.name, ...(node.aka ?? []), node.place, node.summary])).length,
    }))
    .filter((entry) => entry.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, limit)
    .map((entry) => entry.node)
}

async function rankedAnswer(question: string, graph: Graph, model: DecisionModel, candidates: GraphNode[]): Promise<AskAnswer> {
  const pool = [...new Map([...candidates, ...textMatches(question, graph, 20)].map((node) => [node.id, node])).values()].slice(0, 20)
  if (pool.length === 0) {
    return { model: model.name, kind: 'none', confidence: 0, bestGuess: true, sentence: 'Nothing in the graph matches that question.', results: [] }
  }
  const state = [`Question: ${question}`, '', ...pool.map((node, index) => `Record ${index}: ${describe(node)}`)].join('\n')
  const questions: Record<string, Question> = Object.fromEntries(
    pool.map((node, index) => [`record_${index}`, { type: 'noul', instructions: `Record ${index} (${node.name}) answers the question, or is what it asks about.` }]),
  )
  const answers = await model.ask(state, questions)
  const scored = pool
    .map((node, index) => {
      const answer = answers[`record_${index}`]
      return { node, score: answer?.type === 'noul' ? answer.noul : 0 }
    })
    .filter((entry) => entry.score >= 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
  if (scored.length === 0) {
    return { model: model.name, kind: 'none', confidence: 0, bestGuess: true, sentence: 'Jev found no record that answers that question.', results: [] }
  }
  return {
    model: model.name,
    kind: 'ranked',
    confidence: scored[0].score,
    bestGuess: true,
    sentence: `Jev's best guess: ${list(scored.map((entry) => entry.node.name))}.`,
    results: scored.map((entry) => ({ node: ref(entry.node), detail: `${Math.round(entry.score * 100)}% likely relevant` })),
  }
}

// Without a key, keyword rules stand in for Jev's reading
function keywordReading(question: string, candidates: GraphNode[]) {
  const lower = question.toLowerCase()
  const subject = candidates[0]
  const second = candidates[1]
  const fits = COMMON_QUESTIONS.filter((common) => common.keywords.test(lower) && (!subject || common.subjects.includes(subject.type)))
  return { common: fits[0] ?? null, runner: fits[1] ?? null, subject, second, confidence: 0.6 }
}

export async function askGraph(question: string, graph: Graph, model: DecisionModel, override?: AskOverride): Promise<AskAnswer> {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]))

  if (override) {
    const common = COMMON_QUESTIONS.find((entry) => entry.id === override.questionId)
    const subject = byId.get(override.subjectId)
    if (!common || !subject) throw new Error('Unknown question or subject')
    return commonAnswer(model.name, common, graph, subject, override.secondId ? byId.get(override.secondId) : undefined, 1)
  }

  const candidates = findCandidates(question, null, graph, 8)

  let common: CommonQuestion | null
  let runner: CommonQuestion | null
  let subject: GraphNode | undefined
  let second: GraphNode | undefined
  let confidence: number

  if (model.name === 'stub') {
    ;({ common, runner, subject, second, confidence } = keywordReading(question, candidates))
  } else {
    const questions: Record<string, Question> = {
      question_kind: {
        type: 'choice',
        instructions: 'Which kind of question is this?',
        criteria: { ...Object.fromEntries(COMMON_QUESTIONS.map((entry) => [entry.id, entry.describes])), [OTHER]: 'Another kind of question.' },
      },
    }
    if (candidates.length > 0) {
      questions.subject = {
        type: 'choice',
        instructions: 'Which of these people or places is the question about? If it names two, the first one.',
        criteria: { ...Object.fromEntries(candidates.map((node) => [node.id, describe(node)])), [NONE]: 'None of these.' },
      }
    }
    if (candidates.length > 1) {
      questions.second_subject = {
        type: 'choice',
        instructions: 'If the question names a second person or place, which is it?',
        criteria: { ...Object.fromEntries(candidates.map((node) => [node.id, describe(node)])), [NONE]: 'It names only one.' },
      }
    }
    const answers = await model.ask(`Question: ${question}`, questions)
    const kind = chosen(answers.question_kind)
    const subjectAnswer = chosen(answers.subject)
    const secondAnswer = chosen(answers.second_subject)
    common = COMMON_QUESTIONS.find((entry) => entry.id === kind.value) ?? null
    const runnerId = runnerUp(kind.probabilities, [kind.value])
    runner = COMMON_QUESTIONS.find((entry) => entry.id === runnerId) ?? null
    subject = subjectAnswer.value ? byId.get(subjectAnswer.value) : undefined
    second = secondAnswer.value && secondAnswer.value !== subjectAnswer.value ? byId.get(secondAnswer.value) : undefined
    confidence = Math.min(kind.confidence, subjectAnswer.confidence || 0)
  }

  if (!common || !subject || !common.subjects.includes(subject.type) || (common.needsSecond && !second)) {
    return rankedAnswer(question, graph, model, candidates)
  }
  const answer = commonAnswer(model.name, common, graph, subject, second, confidence)
  if (answer.bestGuess && runner && runner.subjects.includes(subject.type) && (!runner.needsSecond || second)) {
    answer.alternative = {
      readAs: runner.readAs(subject, second),
      questionId: runner.id,
      subjectId: subject.id,
      ...(second ? { secondId: second.id } : {}),
    }
  }
  return answer
}
