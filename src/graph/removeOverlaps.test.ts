import { describe, expect, it } from 'vitest'
import { removeOverlaps, type Box } from './removeOverlaps'

const box = (id: string, x: number, y: number, size = 20, weight = 1): Box => ({ id, x, y, width: size, height: size, weight })

function overlapping(boxes: Box[], moves: ReturnType<typeof removeOverlaps>['moves']) {
  const moved = boxes.map((b) => ({ ...b, x: b.x + (moves.get(b.id)?.dx ?? 0), y: b.y + (moves.get(b.id)?.dy ?? 0) }))
  let count = 0
  for (let i = 0; i < moved.length; i++)
    for (let j = i + 1; j < moved.length; j++) {
      const a = moved[i], b = moved[j]
      if (Math.abs(a.x - b.x) < (a.width + b.width) / 2 && Math.abs(a.y - b.y) < (a.height + b.height) / 2) count++
    }
  return count
}

describe('removeOverlaps', () => {
  it('leaves boxes that already clear each other alone', () => {
    const result = removeOverlaps([box('a', 0, 0), box('b', 100, 0)])
    expect(result.moves.size).toBe(0)
    expect(result.passes).toBe(0)
  })

  it('separates two overlapping boxes along the axis they overlap least', () => {
    const result = removeOverlaps([box('a', 0, 0), box('b', 10, 2)], { gap: 0, slack: 0.5 })
    expect(result.remaining).toBe(0)
    expect(result.moves.get('a')).toEqual({ dx: -5.25, dy: 0 })
    expect(result.moves.get('b')).toEqual({ dx: 5.25, dy: 0 })
  })

  it('moves the lighter box further, so hubs keep their place', () => {
    const result = removeOverlaps([box('hub', 0, 0, 20, 9), box('leaf', 10, 0, 20, 1)], { gap: 0, slack: 0.5 })
    expect(Math.abs(result.moves.get('hub')!.dx)).toBeCloseTo(1.05)
    expect(Math.abs(result.moves.get('leaf')!.dx)).toBeCloseTo(9.45)
  })

  it('separates boxes stacked on exactly the same spot', () => {
    const result = removeOverlaps([box('a', 0, 0), box('b', 0, 0)])
    expect(result.remaining).toBe(0)
  })

  it('clears a dense cluster', () => {
    const boxes = Array.from({ length: 200 }, (_, i) => box(`n${i}`, (i * 37) % 150, (i * 53) % 130, 20 + (i % 5) * 8, 1 + (i % 7)))
    const result = removeOverlaps(boxes)
    expect(overlapping(boxes, result.moves)).toBe(0)
  })
})
