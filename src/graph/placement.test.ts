import { describe, expect, it } from 'vitest'
import { coverage, placeNear, toSaved, type Point } from './placement'

const links: Record<string, string[]> = {
  a: ['hub'],
  b: ['hub'],
  c: ['a'],
  loner: [],
  pair1: ['pair2'],
  pair2: ['pair1'],
}
const neighbours = (id: string) => links[id] ?? []
const placed = new Map<string, Point>([['hub', { x: 1000, y: 500 }]])
const distance = (p: Point, q: Point) => Math.hypot(p.x - q.x, p.y - q.y)

describe('placeNear', () => {
  it('puts a new node beside its placed neighbour, and siblings apart', () => {
    const result = placeNear(['a', 'b'], neighbours, placed, { x: 0, y: 0 })
    expect(distance(result.get('a')!, placed.get('hub')!)).toBeLessThan(150)
    expect(distance(result.get('b')!, placed.get('hub')!)).toBeLessThan(150)
    expect(distance(result.get('a')!, result.get('b')!)).toBeGreaterThan(20)
  })

  it('places a chain of new nodes outward from the placed one', () => {
    const result = placeNear(['c', 'a'], neighbours, placed, { x: 0, y: 0 })
    expect(distance(result.get('c')!, result.get('a')!)).toBeLessThan(150)
  })

  it('spirals nodes with no placed neighbour out from the centre', () => {
    const result = placeNear(['loner', 'pair1', 'pair2'], neighbours, placed, { x: 0, y: 0 })
    expect(distance(result.get('loner')!, { x: 0, y: 0 })).toBeLessThan(200)
    expect(result.size).toBe(3)
  })
})

describe('saved layouts', () => {
  it('measures coverage and rounds positions in a stable order', () => {
    const saved = toSaved(new Map([['b', { x: 1.6, y: -2.4 }], ['a', { x: 10, y: 20 }]]))
    expect(Object.keys(saved.positions)).toEqual(['a', 'b'])
    expect(saved.positions.b).toEqual([2, -2])
    expect(coverage(saved, ['a', 'b', 'c', 'd'])).toBe(0.5)
  })
})
