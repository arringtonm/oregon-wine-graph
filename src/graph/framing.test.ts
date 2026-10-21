import { describe, expect, it } from 'vitest'
import { frame, FRAME_MAX_ZOOM, FRAME_MIN_ZOOM } from './framing'

const area = { left: 300, top: 60, width: 1000, height: 800 }

describe('framing a selection', () => {
  it('fits a neighbourhood that reads at its fitted zoom, centred in the visible area', () => {
    const result = frame({ x1: 0, y1: 0, w: 1200, h: 600 }, { x: 100, y: 100 }, area)
    expect(result.whole).toBe(true)
    expect(result.zoom).toBeCloseTo(880 / 1200)
    // The box's centre lands in the middle of the area
    expect(600 * result.zoom + result.pan.x).toBeCloseTo(800)
    expect(300 * result.zoom + result.pan.y).toBeCloseTo(460)
  })

  it('never zooms in past the maximum on a small neighbourhood', () => {
    expect(frame({ x1: 0, y1: 0, w: 50, h: 50 }, { x: 25, y: 25 }, area).zoom).toBe(FRAME_MAX_ZOOM)
  })

  it('centres on the record at the minimum zoom when its connections span the map', () => {
    const result = frame({ x1: -50000, y1: -40000, w: 100000, h: 80000 }, { x: 200, y: -100 }, area)
    expect(result.whole).toBe(false)
    expect(result.zoom).toBe(FRAME_MIN_ZOOM)
    expect(200 * result.zoom + result.pan.x).toBeCloseTo(800)
    expect(-100 * result.zoom + result.pan.y).toBeCloseTo(460)
  })
})
