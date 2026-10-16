// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

// A Mac with a trackpad
window.matchMedia = ((query: string) => ({
  matches: query === '(any-pointer: fine)' || query === '(pointer: fine)',
  media: query,
  addEventListener() {},
  removeEventListener() {},
})) as unknown as typeof window.matchMedia
Object.defineProperty(navigator, 'platform', { value: 'MacIntel', configurable: true })

const { TOUR_STEPS, wording } = await import('./steps')

describe('the tour on a computer', () => {
  it('says click, names the Mac key, and leaves no placeholder behind', () => {
    const all = TOUR_STEPS.flatMap((step) => [...step.body, ...(step.tryIt ? [step.tryIt.text] : [])]).map(wording)
    for (const text of all) expect(text).not.toMatch(/\{(?!flag\})|\btap\b/)
    expect(all.join(' ')).toContain('[⌘] + scroll')
    expect(wording('Try it: {click} it.')).toBe('Try it: click it.')
  })
})
