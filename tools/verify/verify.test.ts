import { describe, expect, it } from 'vitest'
import { loadGraph } from '../../src/data'
import type { CachedSource } from '../check/fetchSources'
import type { Answer, DecisionModel } from '../jev/model'
import { correctionsFor, judge, revised } from './apply'
import { buildQueue } from './queue'

const graph = await loadGraph()
const edgeId = 'david-lett--founded--the-eyrie-vineyards'
const edge = graph.edges.find((candidate) => candidate.id === edgeId)!
const newSource = { title: 'History (Example)', url: 'https://example.com/history' }

// A model that supports whatever it is asked, or nothing
const model = (support: number): DecisionModel => ({
  name: 'jev',
  async ask(_state, questions) {
    const answers: Record<string, Answer> = {}
    for (const [id, question] of Object.entries(questions)) {
      answers[id] =
        question.type === 'score'
          ? { type: 'score', score: 3, confidence: 0.9, probabilities: { '3': support, '1': 1 - support } }
          : { type: 'noul', noul: support }
    }
    return answers
  },
})
const pages = (url: string): CachedSource => ({ url, status: 'ok', fetchedAt: '', text: 'David Lett founded The Eyrie Vineyards in 1965.' })

describe('verify:queue', () => {
  it('ranks draft nodes by the verified connections they hide, and skips dead ends', () => {
    const queue = buildQueue(graph, {})
    expect(queue.length).toBeGreaterThan(0)
    expect(queue.every((entry, index) => index === 0 || queue[index - 1].score >= entry.score)).toBe(true)
    const top = queue.find((entry) => entry.key.startsWith('node:'))!
    expect(top.reveals).toBeGreaterThan(0)
    expect(buildQueue(graph, {}, new Set([top.key])).some((entry) => entry.key === top.key)).toBe(false)
  })
})

describe('verify:apply', () => {
  it('adds sources once and refuses fields research may not change', () => {
    const result = { key: `edge:${edgeId}`, addSources: [newSource, newSource], finding: '' }
    expect(revised(edge, 'edge', result, false).sources).toHaveLength(edge.sources.length + 1)
    expect(() => revised(edge, 'edge', { ...result, changes: { target: 'elsewhere' } }, true)).toThrow('may not change "target"')
  })

  it('writes a correction only when the check supports the corrected record', async () => {
    const result = { key: `edge:${edgeId}`, addSources: [newSource], changes: { alsoDated: { startYear: [1965, 1967] } }, finding: 'f' }
    const accepted = await judge(graph, result, model(0.98), pages)
    expect(accepted.outcome.changes).toBe('applied')
    expect(accepted.record).toMatchObject({ alsoDated: { startYear: [1965, 1967] } })
    const refused = await judge(graph, result, model(0.4), pages)
    expect(refused.outcome.changes).toBe('rejected')
    expect(refused.record.sources.at(-1)).toEqual(newSource)
    expect((refused.record as typeof edge).alsoDated).toEqual(edge.alsoDated)
  })

  it('judges a correction by the claims it changes, not the rest of a draft record', async () => {
    // Supports only the start year; the role, which the correction leaves alone, still fails
    const picky: DecisionModel = {
      name: 'jev',
      async ask(_state, questions) {
        const answers: Record<string, Answer> = {}
        for (const [id, question] of Object.entries(questions)) {
          if (question.type === 'score') answers[id] = { type: 'score', score: 3, confidence: 1, probabilities: { '3': 1 } }
          else if (question.type === 'choice') answers[id] = { type: 'choice', choice: 'own', confidence: 1, probabilities: { own: 1 } }
          else answers[id] = { type: 'noul', noul: id === 'detail_startYear' ? 0.97 : 0.2 }
        }
        return answers
      },
    }
    const withRole = { ...graph, edges: graph.edges.map((e) => (e.id === edgeId ? { ...e, role: 'founder and first winemaker' } : e)) }
    const result = { key: `edge:${edgeId}`, addSources: [newSource], changes: { startYear: 1965, alsoDated: null }, finding: 'f' }
    const { outcome, record } = await judge(withRole, result, picky, pages)
    expect(outcome.changes).toBe('applied')
    expect(record).toMatchObject({ startYear: 1965 })
  })

  it('logs each field it changed, with the old and new value and the sources', () => {
    const after = { ...edge, startYear: 1965 }
    const log = correctionsFor(edge, after, { key: `edge:${edgeId}`, addSources: [newSource], changes: { startYear: 1965 }, finding: 'f' })
    expect(log).toEqual([
      expect.objectContaining({ key: `edge:${edgeId}`, field: 'startYear', from: edge.startYear, to: 1965, sources: [newSource.url] }),
    ])
  })
})
