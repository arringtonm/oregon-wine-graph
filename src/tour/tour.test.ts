// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest'
import { TOUR_STEPS } from './steps'

window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  addEventListener() {},
  removeEventListener() {},
})) as unknown as typeof window.matchMedia

const { useGraph } = await import('../composables/useGraph')
const { state, init, startTour, tourStep, closeTour, finishTour } = useGraph()
const stored = () => JSON.parse(localStorage.getItem('oregon-wine-graph:tour') ?? 'null')

beforeAll(async () => {
  await init()
})

describe('the tour', () => {
  it('has steps with words, a place to point and a known control', () => {
    expect(TOUR_STEPS.length).toBeGreaterThanOrEqual(5)
    for (const step of TOUR_STEPS) {
      expect(step.title).not.toBe('')
      expect(step.body.length).toBeGreaterThan(0)
      expect(step.target.length).toBeGreaterThan(0)
    }
  })

  it('opens at the first step, ringing its control, and steps within its ends', () => {
    startTour(0)
    expect(state.tour).toBe(0)
    expect(state.hint).toBe(TOUR_STEPS[0].hint)
    tourStep(-1)
    expect(state.tour).toBe(0)
    tourStep(1)
    tourStep(1)
    expect(state.tour).toBe(2)
    expect(state.hint).toBe(TOUR_STEPS[2].hint)
  })

  it('remembers the step when closed, and resumes there', () => {
    closeTour()
    expect(state.tour).toBeNull()
    expect(state.hint).toBeNull()
    expect(stored()).toEqual({ step: 2, done: false })
    startTour()
    expect(state.tour).toBe(2)
  })

  it('marks itself done at the end, and starts over next time', () => {
    while (state.tour !== null) tourStep(1)
    expect(state.tourProgress.done).toBe(true)
    expect(stored().done).toBe(true)
    startTour()
    expect(state.tour).toBe(0)
    finishTour()
  })

  it('still works where storage is unavailable', () => {
    const setItem = Storage.prototype.setItem
    Storage.prototype.setItem = () => {
      throw new Error('blocked')
    }
    try {
      startTour(1)
      expect(state.tour).toBe(1)
      closeTour()
    } finally {
      Storage.prototype.setItem = setItem
    }
  })
})
