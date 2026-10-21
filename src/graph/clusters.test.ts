import { describe, expect, it } from 'vitest'
import { arrangeIslands, communities, LOOSE, MIN_COMMUNITY } from './clusters'

// Two dense groups of six joined by one link, a three-record tail on the first, and two
// detached pairs
const group = (prefix: string) => Array.from({ length: 6 }, (_, index) => `${prefix}${index}`)
const clique = (ids: string[]) => ids.flatMap((a, i) => ids.slice(i + 1).map((b) => ({ source: a, target: b })))
const left = group('l')
const right = group('r')
const ids = [...left, ...right, 't1', 't2', 't3', 'p1', 'p2', 'q1', 'q2']
const links = [
  ...clique(left),
  ...clique(right),
  { source: 'l0', target: 'r0' },
  { source: 'l1', target: 't1' },
  { source: 't1', target: 't2' },
  { source: 't2', target: 't3' },
  { source: 'p1', target: 'p2' },
  { source: 'q1', target: 'q2' },
]

describe('communities for the clustered layout', () => {
  it('finds the dense groups, folds a small tail into its neighbour and gathers detached groups', () => {
    const found = communities(ids, links)
    expect(new Set(left.map((id) => found.get(id))).size).toBe(1)
    expect(new Set(right.map((id) => found.get(id))).size).toBe(1)
    expect(found.get('l0')).not.toBe(found.get('r0'))
    expect(found.get('t3')).toBe(found.get('l0'))
    // The detached pairs share one island
    expect(found.get('p1')).toBe(LOOSE)
    expect(found.get('q2')).toBe(LOOSE)
    const sizes = new Map<number, number>()
    for (const community of found.values()) sizes.set(community, (sizes.get(community) ?? 0) + 1)
    for (const [community, size] of sizes) if (community !== found.get('p1')) expect(size).toBeGreaterThanOrEqual(MIN_COMMUNITY)
  })

  it('gives the same communities for the same data', () => {
    expect([...communities(ids, links)]).toEqual([...communities(ids, links)])
  })
})

describe('arranging the islands', () => {
  const islands = Array.from({ length: 12 }, (_, id) => ({ id, radius: 100 + 40 * (id % 4) }))
  const links = new Map([
    ['0-1', 10],
    ['0-2', 1],
    ['3-4', 6],
  ])
  const at = arrangeIslands(islands, links, 50)
  const gapBetween = (a: number, b: number) =>
    Math.hypot(at.get(a)!.x - at.get(b)!.x, at.get(a)!.y - at.get(b)!.y) - islands[a].radius - islands[b].radius

  it('never overlaps two islands', () => {
    for (let a = 0; a < islands.length; a++) for (let b = a + 1; b < islands.length; b++) expect(gapBetween(a, b)).toBeGreaterThan(49)
  })

  it('puts strongly linked islands closer than unlinked ones', () => {
    const unlinked = islands.slice(5).map((island) => gapBetween(0, island.id))
    expect(gapBetween(0, 1)).toBeLessThan(Math.min(...unlinked))
  })
})
