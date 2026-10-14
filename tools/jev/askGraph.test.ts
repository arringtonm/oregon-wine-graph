import { describe, expect, it } from 'vitest'
import type { Graph, GraphEdge, GraphNode } from '../../src/data/schema'
import { COMMON_QUESTIONS, askGraph, shortestPath } from './askGraph'
import { stubModel, type Answer, type DecisionModel, type Question } from './model'

const node = (id: string, type: GraphNode['type'], name: string, extra: object = {}) =>
  ({ id, type, name, summary: `${name}.`, sources: [{ title: 'test' }], verified: false, ...extra }) as unknown as GraphNode
const edge = (source: string, type: GraphEdge['type'], target: string, extra: object = {}) =>
  ({ id: `${source}--${type}--${target}`, source, target, type, sources: [{ title: 'test' }], verified: false, ...extra }) as unknown as GraphEdge

const graph: Graph = {
  nodes: [
    node('david-lett', 'person', 'David Lett'),
    node('diana-lett', 'person', 'Diana Lett'),
    node('jason-lett', 'person', 'Jason Lett'),
    node('eyrie', 'winery', 'The Eyrie Vineyards', { founded: 1966 }),
    node('papillon', 'vineyard', 'Papillon Vineyard', { planted: 1990 }),
    node('dundee-hills', 'ava', 'Dundee Hills'),
    node('uc-davis', 'organization', 'UC Davis'),
    node('loner', 'person', 'Lone Person'),
  ],
  edges: [
    edge('david-lett', 'founded', 'eyrie', { startYear: 1966 }),
    edge('diana-lett', 'founded', 'eyrie', { startYear: 1966 }),
    edge('david-lett', 'winemaker', 'eyrie', { startYear: 1966, endYear: 2005 }),
    edge('jason-lett', 'winemaker', 'eyrie', { startYear: 2005, ongoing: true }),
    edge('david-lett', 'mentored', 'jason-lett'),
    edge('david-lett', 'family', 'jason-lett', { role: 'parent' }),
    edge('david-lett', 'studied_at', 'uc-davis'),
    edge('eyrie', 'sources_from', 'papillon'),
    edge('papillon', 'located_in', 'dundee-hills'),
  ],
}

// Answers with fixed choices, as Jev would with full confidence
function scripted(choices: Record<string, string>, confidence = 0.95): DecisionModel {
  return {
    name: 'jev',
    async ask(_state, questions: Record<string, Question>) {
      const answers: Record<string, Answer> = {}
      for (const [id, question] of Object.entries(questions)) {
        if (question.type === 'choice') {
          const choice = choices[id] ?? Object.keys(question.criteria).at(-1)!
          answers[id] = { type: 'choice', choice, confidence, probabilities: { [choice]: confidence } }
        } else if (question.type === 'noul') {
          answers[id] = { type: 'noul', noul: choices[id] ? Number(choices[id]) : 0.1 }
        }
      }
      return answers
    },
  }
}

const names = (answer: Awaited<ReturnType<typeof askGraph>>) => answer.results.map((result) => result.node.name)

describe('common questions answered from the graph', () => {
  const ask = (questionId: string, subjectId: string, secondId?: string) =>
    askGraph('', graph, scripted({}), { questionId, subjectId, secondId })

  it('finds founders, winemakers with their years, and mentors', async () => {
    expect(names(await ask('founders', 'eyrie'))).toEqual(['David Lett', 'Diana Lett'])
    const winemakers = await ask('winemakers', 'eyrie')
    expect(winemakers.results.map((r) => r.detail)).toEqual(['1966–2005', 'since 2005'])
    expect(names(await ask('mentors', 'jason-lett'))).toEqual(['David Lett'])
    expect(names(await ask('mentees', 'david-lett'))).toEqual(['Jason Lett'])
  })

  it('walks fruit sources, AVAs, schools and family in the right direction', async () => {
    expect(names(await ask('fruit_sources', 'eyrie'))).toEqual(['Papillon Vineyard'])
    expect(names(await ask('fruit_buyers', 'papillon'))).toEqual(['The Eyrie Vineyards'])
    expect(names(await ask('ava_members', 'dundee-hills'))).toEqual(['Papillon Vineyard'])
    expect(names(await ask('avas_of', 'papillon'))).toEqual(['Dundee Hills'])
    expect(names(await ask('education', 'david-lett'))).toEqual(['UC Davis'])
    expect(names(await ask('family', 'jason-lett'))).toEqual(['David Lett'])
  })

  it('reads years from the record, and says when one is missing', async () => {
    expect((await ask('when_founded', 'eyrie')).sentence).toBe('The Eyrie Vineyards was founded in 1966.')
    expect((await ask('when_founded', 'papillon')).sentence).toBe('Papillon Vineyard was planted in 1990.')
    expect((await ask('when_founded', 'dundee-hills')).sentence).toMatch(/does not record/)
  })

  it('says plainly when the graph has nothing', async () => {
    expect((await ask('owners', 'eyrie')).sentence).toBe('The graph has no owners of The Eyrie Vineyards yet.')
  })

  it('connects two nodes by the shortest path', async () => {
    const answer = await ask('path', 'jason-lett', 'dundee-hills')
    expect(names(answer)).toEqual(['Jason Lett', 'The Eyrie Vineyards', 'Papillon Vineyard', 'Dundee Hills'])
    expect(shortestPath(graph, 'loner', 'eyrie')).toBeNull()
  })

  it('gives every common question a starter for the suggestion chips', () => {
    expect(COMMON_QUESTIONS.every((question) => question.starter.length > 0)).toBe(true)
  })
})

describe('reading a question', () => {
  it("uses Jev's reading of the question and its subject", async () => {
    const answer = await askGraph('Who made the wine at Eyrie?', graph, scripted({ question_kind: 'winemakers', subject: 'eyrie' }))
    expect(answer).toMatchObject({ kind: 'common', readAs: 'Who made the wine at The Eyrie Vineyards?', bestGuess: false })
    expect(names(answer)).toEqual(['David Lett', 'Jason Lett'])
  })

  it('marks an uncertain reading as a best guess', async () => {
    const answer = await askGraph('Who made the wine at Eyrie?', graph, scripted({ question_kind: 'winemakers', subject: 'eyrie' }, 0.55))
    expect(answer.bestGuess).toBe(true)
  })

  it('reads with keywords when there is no key', async () => {
    const answer = await askGraph('Who founded Eyrie?', graph, stubModel())
    expect(answer).toMatchObject({ model: 'stub', questionId: 'founders', subjectId: 'eyrie' })
  })

  it('falls back to ranking records when the question fits no common shape', async () => {
    const answer = await askGraph('Tell me about Papillon', graph, scripted({ question_kind: 'other', record_0: '0.9' }))
    expect(answer.kind).toBe('ranked')
    expect(answer.bestGuess).toBe(true)
    expect(names(answer)).toEqual(['Papillon Vineyard'])
  })

  it('ignores a reading that does not fit the subject, such as founders of a person', async () => {
    const answer = await askGraph('Who founded David Lett?', graph, scripted({ question_kind: 'founders', subject: 'david-lett' }))
    expect(answer.kind).not.toBe('common')
  })
})
