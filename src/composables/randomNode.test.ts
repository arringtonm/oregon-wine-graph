// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest'
import { useGraph } from './useGraph'

window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  addEventListener() {},
  removeEventListener() {},
})) as unknown as typeof window.matchMedia

const { state, init, select, visibleNodes, randomNodeId, resetFilters, applyView, activeView, avasOf } = useGraph()

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
    for (const type of Object.keys(state.nodeTypes) as (keyof typeof state.nodeTypes)[]) state.nodeTypes[type] = type === 'organization'
    const showing = new Set(visibleNodes.value.map((node) => node.id))
    for (let i = 0; i < 50; i++) expect(showing.has(randomNodeId()!)).toBe(true)
    resetFilters()
  })

  it('once everything showing has been visited, picks anything but the current node', () => {
    resetFilters()
    for (const type of Object.keys(state.nodeTypes) as (keyof typeof state.nodeTypes)[]) state.nodeTypes[type] = type === 'organization'
    for (const node of visibleNodes.value) select(node.id)
    for (let i = 0; i < 50; i++) {
      const id = randomNodeId()
      expect(id).not.toBeNull()
      expect(id).not.toBe(state.selectedId)
    }
    resetFilters()
  })

  it('within chosen AVAs, rolls among the region’s own records, not its one-step context', () => {
    resetFilters()
    state.avas = ['rogue-valley']
    const rogue = new Set(['rogue-valley', 'applegate-valley'])
    for (let i = 0; i < 200; i++) {
      const id = randomNodeId()!
      const node = visibleNodes.value.find((shown) => shown.id === id)!
      if (node.type === 'winery' || node.type === 'vineyard') {
        expect(avasOf(id).some((ava) => rogue.has(ava)), id).toBe(true)
      }
      // Tualatin Vineyards is shown only through Willamette Valley Vineyards' Rogue holdings
      expect(id).not.toBe('tualatin-vineyards')
    }
    resetFilters()
  })
})

describe('guided views', () => {
  it('set their filters, and end when a filter changes', () => {
    applyView('sparkling')
    expect(activeView.value?.id).toBe('sparkling')
    expect(visibleNodes.value.some((node) => node.id === 'method-oregon')).toBe(true)
    state.nodeTypes.person = false
    expect(activeView.value).toBeUndefined()
    resetFilters()
  })

  it('show at least 20 records each', () => {
    for (const id of ['beyond-the-willamette', 'southern-oregon', 'sparkling', 'young-vintages', 'library-wines', 'who-started-what', 'family-and-mentors', 'following-the-fruit']) {
      applyView(id)
      expect(activeView.value?.id).toBe(id)
      expect(visibleNodes.value.length).toBeGreaterThanOrEqual(20)
    }
    resetFilters()
  })
})

describe('the connected core', () => {
  it('opens on the core, shows everything with Show all, and brings a selected leaf in', () => {
    resetFilters()
    select(null)
    const core = visibleNodes.value.length
    state.showAll = true
    const all = visibleNodes.value.length
    expect(core).toBeLessThan(all * 0.75)
    state.showAll = false
    const leaf = useGraph().search('Brella')[0]
    expect(leaf).toBeDefined()
    expect(visibleNodes.value.some((node) => node.id === leaf.id)).toBe(false)
    select(leaf.id)
    expect(visibleNodes.value.some((node) => node.id === leaf.id)).toBe(true)
    select(null)
    resetFilters()
  })

  it('is not taken in a guide', () => {
    applyView('family-and-mentors')
    expect(state.showAll).toBe(true)
    expect(activeView.value?.id).toBe('family-and-mentors')
    resetFilters()
  })
})
