import { describe, expect, it } from 'vitest'
import { coreWithSelection, twoCore } from './core'

// A triangle with a tail (hub - leaf - twig) and a loner
const ids = ['a', 'b', 'hub', 'leaf', 'twig', 'loner']
const links = [
  { source: 'a', target: 'b' },
  { source: 'b', target: 'hub' },
  { source: 'hub', target: 'a' },
  { source: 'hub', target: 'leaf' },
  { source: 'leaf', target: 'twig' },
]

describe('the connected core', () => {
  it('drops unconnected records and chains of leaves, keeping cycles', () => {
    expect([...twoCore(ids, links)].sort()).toEqual(['a', 'b', 'hub'])
    expect(twoCore(['x', 'y'], [{ source: 'x', target: 'y' }]).size).toBe(0)
    // Links to records that aren't showing don't count
    expect(twoCore(['a', 'b'], links).size).toBe(0)
  })

  it('adds a selected record and its neighbours back', () => {
    const core = twoCore(ids, links)
    expect([...coreWithSelection(core, links, 'leaf')].sort()).toEqual(['a', 'b', 'hub', 'leaf', 'twig'])
    expect([...coreWithSelection(core, links, 'hub')].sort()).toEqual(['a', 'b', 'hub', 'leaf'])
    expect(coreWithSelection(core, links, null)).toBe(core)
  })
})
