import { describe, expect, it } from 'vitest'
import { loadGraph } from '../../src/data'
import type { CachedSource } from '../check/fetchSources'
import type { Answer, DecisionModel } from '../jev/model'
import { investigate, recap, type Proposer } from './daily'
import type { StoredFlag } from './localStore'

const graph = await loadGraph()
const edgeId = 'david-lett--founded--the-eyrie-vineyards'
const edge = graph.edges.find((candidate) => candidate.id === edgeId)!
const READER_URL = 'https://example.com/eyrie'

const flag = (extra: Partial<StoredFlag> = {}): StoredFlag => ({
  id: 'f1',
  source: 'remote',
  recordKind: 'edge',
  recordId: edgeId,
  recordLabel: 'David Lett founded The Eyrie Vineyards',
  reason: 'incorrect',
  pageUrl: 'https://oregonwine.app/#the-eyrie-vineyards',
  appVersion: 'v1.27 (abc1234)',
  createdAt: '2026-10-20T08:00:00Z',
  ...extra,
})

// Supports everything on the pages it's given, except that a page in `against` contradicts
// the main claim
const model = (against: string[] = []): DecisionModel => ({
  name: 'jev',
  async ask(state, questions) {
    const text = typeof state === 'string' ? state : state.text
    const contra = against.some((marker) => text.includes(marker))
    const answers: Record<string, Answer> = {}
    for (const [id, question] of Object.entries(questions)) {
      if (question.type === 'score') {
        answers[id] = { type: 'score', score: contra ? 0 : 3, confidence: 0.9, probabilities: contra ? { '0': 0.95, '1': 0.05 } : { '3': 0.97, '1': 0.03 } }
      } else if (question.type === 'choice') {
        answers[id] = { type: 'choice', choice: 'own', confidence: 0.9, probabilities: { own: 0.95, other: 0.05 } }
      } else {
        answers[id] = { type: 'noul', noul: contra ? 0.02 : 0.97 }
      }
    }
    return answers
  },
})
const pages =
  (reader = 'David Lett founded The Eyrie Vineyards in 1965.') =>
  (url: string): CachedSource => ({
    url,
    status: 'ok',
    fetchedAt: '',
    text: url === READER_URL ? reader : 'David Lett founded The Eyrie Vineyards in 1965 or 1966.',
  })

describe('flags:daily', () => {
  it("adds a reader's source that supports the record, and says the flag doesn't hold", async () => {
    const result = await investigate(flag({ reason: 'unsupported', sourceUrl: READER_URL }), graph, model(), pages())
    expect(result.action).toBe('source-added')
    expect(result.holds).toBe('no')
    expect(result.record!.sources.at(-1)).toEqual({ title: 'Page on example.com, suggested by a reader', url: READER_URL })
    expect(result.record!.sources).toHaveLength(edge.sources.length + 1)
  })

  it("never adds a reader's source that contradicts the record, and leaves it to a person without a proposer", async () => {
    const result = await investigate(flag({ sourceUrl: READER_URL }), graph, model(['1970']), pages('David Lett did not found The Eyrie Vineyards; it began in 1970.'))
    expect(result).toMatchObject({ holds: 'yes', action: 'none' })
    expect(result.record).toBeUndefined()
    expect(result.finding).toContain("The reader's source contradicts it.")
  })

  it('writes a proposed correction only when the check supports it, and logs it', async () => {
    const propose: Proposer = async () => ({ changes: { role: 'founder and winemaker' }, finding: 'The page calls him its founder and winemaker.' })
    const applied = await investigate(flag({ note: 'He was also the winemaker.' }), graph, model(), pages(), propose)
    expect(applied.action).toBe('corrected')
    expect(applied.corrections).toEqual([expect.objectContaining({ key: `edge:${edgeId}`, field: 'role', to: 'founder and winemaker' })])

    const refused = await investigate(flag({ note: 'Wrong.' }), graph, model(['1965']), pages(), propose)
    expect(refused.action).toBe('none')
    expect(refused.record).toBeUndefined()
  })

  it('leaves a year the sources disagree on to a person', async () => {
    expect(edge.alsoDated?.startYear).toBeDefined()
    const propose: Proposer = async () => ({ changes: { startYear: 1965 }, finding: 'The page gives 1965.' })
    const result = await investigate(flag(), graph, model(), pages(), propose)
    expect(result.action).toBe('none')
    expect(result.record).toBeUndefined()
  })

  it('resolves a flag on a record no longer in the graph', async () => {
    const result = await investigate(flag({ recordId: 'gone--founded--nowhere' }), graph, model(), pages())
    expect(result.action).toBe('gone')
  })

  it("recaps what changed and what's left, without the reader's note", async () => {
    const changed = await investigate(flag({ reason: 'unsupported', sourceUrl: READER_URL, note: 'private words' }), graph, model(), pages())
    const left = await investigate(flag({ id: 'f2' }), graph, model(), pages())
    const text = recap('2026-10-20', [changed, left], [], [])
    expect(text).toContain('2 new flags; 1 acted on in this pull request; 1 left for a person in admin mode.')
    expect(text).toContain('## Changed')
    expect(text).toContain('with a note and a suggested source on example.com')
    expect(text).not.toContain('private words')
    expect(recap('2026-10-20', [], [], [])).toBe('')
  })
})
