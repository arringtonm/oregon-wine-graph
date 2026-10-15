// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

// The system prefers dark here
window.matchMedia = ((query: string) => ({
  matches: query.includes('dark'),
  media: query,
  addEventListener() {},
  removeEventListener() {},
})) as unknown as typeof window.matchMedia

const { isDark, toggleTheme } = await import('./theme')

describe('the light and dark switch', () => {
  it('follows the system until the reader chooses', () => {
    expect(isDark.value).toBe(true)
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })

  it('switches, marks the page and remembers the choice', () => {
    toggleTheme()
    expect(isDark.value).toBe(false)
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem('oregon-wine-graph:theme')).toBe('light')

    toggleTheme()
    expect(isDark.value).toBe(true)
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem('oregon-wine-graph:theme')).toBe('dark')
  })
})
