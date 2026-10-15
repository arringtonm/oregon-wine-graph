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
const { state, init, select, applyView, activeView, resetFilters } = useGraph()

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

describe('guide addresses', () => {
  const go = (path: string) => {
    window.history.replaceState(null, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }
  const canonical = () => document.querySelector('link[rel="canonical"]')?.getAttribute('href')

  it('opens a guide at /guides/<guide>, with the guide as its canonical address', () => {
    document.head.insertAdjacentHTML('beforeend', '<link rel="canonical" href="https://oregonwine.app/" />')
    go('/guides/sparkling')
    expect(activeView.value?.id).toBe('sparkling')
    expect(state.selectedId).toBeNull()
    expect(canonical()).toBe('https://oregonwine.app/guides/sparkling')
  })

  it('keeps the guide when a record opens, with the record’s own page as canonical', () => {
    select('argyle-winery')
    expect(window.location.pathname).toBe('/guides/sparkling/argyle-winery')
    expect(canonical()).toBe('https://oregonwine.app/argyle-winery')
    select(null)
    expect(window.location.pathname).toBe('/guides/sparkling')
  })

  it('opens a guide with a record from its full address', () => {
    resetFilters()
    go('/guides/sparkling/argyle-winery')
    expect(activeView.value?.id).toBe('sparkling')
    expect(state.selectedId).toBe('argyle-winery')
  })

  it('drops the guide from the address when a filter ends it', async () => {
    state.nodeTypes.vineyard = false
    await Promise.resolve()
    expect(window.location.pathname).toBe('/argyle-winery')
    resetFilters()
  })

  it('moves an old ?view= link to the guide’s address', () => {
    select(null)
    go('/?view=library-wines')
    expect(activeView.value?.id).toBe('library-wines')
    expect(window.location.pathname).toBe('/guides/library-wines')
    expect(window.location.search).toBe('')
    resetFilters()
  })

  it('opens home for a guide that doesn’t exist', () => {
    go('/guides/nonsense')
    expect(activeView.value).toBeUndefined()
    expect(state.selectedId).toBeNull()
    expect(window.location.pathname).toBe('/')
  })

  it('writes the guide’s address when one is chosen from the menu', async () => {
    applyView('southern-oregon')
    await Promise.resolve()
    expect(window.location.pathname).toBe('/guides/southern-oregon')
    resetFilters()
  })
})
