// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  addEventListener() {},
  removeEventListener() {},
})) as unknown as typeof window.matchMedia

// An old shared link, from before records had their own addresses
window.history.replaceState(null, '', '/#david-lett')
const { useGraph } = await import('./useGraph')
const { state, init, select } = useGraph()

describe('record addresses', () => {
  it('opens an old #record link and moves it to the record’s own address', async () => {
    await init()
    expect(state.selectedId).toBe('david-lett')
    expect(window.location.pathname).toBe('/david-lett')
    expect(window.location.hash).toBe('')
  })

  it('follows the selection, and goes home when it’s cleared', () => {
    select('the-eyrie-vineyards')
    expect(window.location.pathname).toBe('/the-eyrie-vineyards')
    select(null)
    expect(window.location.pathname).toBe('/')
  })

  it('opens the record at an address, as Back and Forward do', () => {
    window.history.replaceState(null, '', '/temperance-hill-vineyard')
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(state.selectedId).toBe('temperance-hill-vineyard')
  })

  it('opens nothing at an address that isn’t a record', () => {
    window.history.replaceState(null, '', '/not-a-record')
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(state.selectedId).toBeNull()
    expect(window.location.pathname).toBe('/')
  })
})
