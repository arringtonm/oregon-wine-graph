// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

// A phone: a coarse pointer and no fine one. Set before the device module reads it
window.matchMedia = ((query: string) => ({
  matches: query === '(pointer: coarse)',
  media: query,
  addEventListener() {},
  removeEventListener() {},
})) as unknown as typeof window.matchMedia

const { TOUR_STEPS, wording } = await import('./steps')

describe('the tour on a touch screen', () => {
  it('says tap, and names no keys, ⌘ or Ctrl', () => {
    for (const step of TOUR_STEPS) {
      for (const line of [...step.body, ...(step.tryIt ? [step.tryIt.text] : [])]) {
        const text = wording(line)
        expect(text).not.toMatch(/\bclick\b|\[Esc\]|\[R\]|⌘|Ctrl|\bpress\b|\{(?!flag\})/i)
      }
    }
    expect(wording('Try it: {click} it.')).toBe('Try it: tap it.')
  })
})
