// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest'
import { useGraph } from './useGraph'

window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  addEventListener() {},
  removeEventListener() {},
})) as unknown as typeof window.matchMedia

const { state, init, select, visibleNodes, randomNodeId, resetFilters } = useGraph()

beforeAll(async () => {
  await init()
})

describe('random node', () => {
  it('never picks somewhere already visited while somewhere new remains', () => {
    resetFilters()
    for (const id of ['david-lett', 'the-eyrie-vineyards', 'jason-lett']) select(id)
    for (let i = 0; i < 300; i++) {
      const id = randomNodeId()
      expect(id).not.toBeNull()
      expect(state.history).not.toContain(id)
    }
  })

  it('picks only from what the filters show', () => {
    resetFilters()
    for (const type of Object.keys(state.nodeTypes) as (keyof typeof state.nodeTypes)[]) state.nodeTypes[type] = type === 'event'
    const showing = new Set(visibleNodes.value.map((node) => node.id))
    for (let i = 0; i < 50; i++) expect(showing.has(randomNodeId()!)).toBe(true)
    resetFilters()
  })

  it('once everything showing has been visited, picks anything but the current node', () => {
    resetFilters()
    for (const type of Object.keys(state.nodeTypes) as (keyof typeof state.nodeTypes)[]) state.nodeTypes[type] = type === 'event'
    for (const node of visibleNodes.value) select(node.id)
    for (let i = 0; i < 50; i++) {
      const id = randomNodeId()
      expect(id).not.toBeNull()
      expect(id).not.toBe(state.selectedId)
    }
    resetFilters()
  })
})
