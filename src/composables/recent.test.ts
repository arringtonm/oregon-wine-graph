// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest'
import { useGraph } from './useGraph'

window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  addEventListener() {},
  removeEventListener() {},
})) as unknown as typeof window.matchMedia

const { state, init, select } = useGraph()
const stored = () => JSON.parse(localStorage.getItem('oregon-wine-graph:recent') ?? '[]') as string[]

beforeAll(async () => {
  await init()
})

describe('recently viewed', () => {
  it('remembers records viewed, newest first and each once, across visits', () => {
    select('david-lett')
    select('the-eyrie-vineyards')
    select('david-lett')
    expect(state.recent.slice(0, 2)).toEqual(['david-lett', 'the-eyrie-vineyards'])
    expect(stored().slice(0, 2)).toEqual(['david-lett', 'the-eyrie-vineyards'])
  })

  it('keeps no more than eight', () => {
    const ids = ['adelsheim-vineyard', 'valley-view-winery', 'temperance-hill-vineyard', 'jason-lett', 'diana-lett']
    for (const id of [...ids, ...ids]) select(id)
    expect(stored().length).toBeLessThanOrEqual(8)
  })

  it('leaves the list alone when the selection is cleared', () => {
    const before = [...state.recent]
    select(null)
    expect(state.recent).toEqual(before)
  })
})
