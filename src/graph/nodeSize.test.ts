import { describe, expect, it } from 'vitest'
import { sizeTiers } from './nodeSize'

// n nodes with connection counts n, n-1, ... 1
const ladder = (n: number) => new Map(Array.from({ length: n }, (_, i) => [`n${i}`, n - i]))
const count = (tiers: ReturnType<typeof sizeTiers>, name: string) => [...tiers.values()].filter((t) => t.name === name).length

describe('sizeTiers', () => {
  it('splits a large graph by rank: 1%, 4%, 15%, 30%, 50%', () => {
    const tiers = sizeTiers(ladder(1000))
    expect([count(tiers, 'largest'), count(tiers, 'large'), count(tiers, 'medium'), count(tiers, 'small'), count(tiers, 'smallest')]).toEqual([
      10, 40, 150, 300, 500,
    ])
    expect(tiers.get('n0')!.size).toBe(136)
    expect(tiers.get('n999')!.size).toBe(18)
  })

  it('re-tiers whatever is showing, so a small view still has a largest node', () => {
    const tiers = sizeTiers(new Map([['a', 3], ['b', 2], ['c', 1]]))
    expect(tiers.get('a')!.name).toBe('largest')
    expect(tiers.get('c')!.name).toBe('smallest')
  })

  it('puts nodes with the same connection count in the tier at the middle of their ranks', () => {
    // A hub with 99 one-connection neighbours: the neighbours are smallest, not large
    const tiers = sizeTiers(new Map([['hub', 20], ...Array.from({ length: 99 }, (_, i) => [`leaf${i}`, 1] as [string, number])]))
    expect(tiers.get('hub')!.name).toBe('largest')
    expect(new Set([...tiers].filter(([id]) => id !== 'hub').map(([, t]) => t.name))).toEqual(new Set(['smallest']))
  })

  it('makes the best-connected nodes largest even when they tie', () => {
    const tiers = sizeTiers(new Map([['a', 5], ['b', 5], ['c', 5], ['d', 1]]))
    expect(tiers.get('c')!.name).toBe('largest')
  })

  it('makes nodes without connections smallest', () => {
    const tiers = sizeTiers(new Map([['a', 0], ['b', 0]]))
    expect(tiers.get('a')!.name).toBe('smallest')
  })
})
