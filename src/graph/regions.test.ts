import { describe, expect, it } from 'vitest'
import { loadGraph } from '../data'
import type { Graph } from '../data/schema'
import { regionMembers, regionOfPlace, regions } from './regions'

const node = (id: string, type: string, extra = {}) => ({ id, type, name: id, summary: id, sources: [], verified: false, ...extra })
const edge = (source: string, type: string, target: string, sources = 1) => ({
  source,
  type,
  target,
  sources: Array.from({ length: sources }, () => ({ title: 't' })),
  verified: false,
})
const graph = {
  nodes: [
    node('willamette-valley', 'ava'),
    node('southern-oregon', 'ava'),
    node('rogue-valley', 'ava'),
    node('north', 'winery', { place: 'Newberg, OR' }),
    node('south', 'winery', { place: 'Medford, OR' }),
    node('unplaced', 'winery'),
    node('estate', 'winery'),
    node('rogue-vineyard', 'vineyard'),
    node('wv-vineyard', 'vineyard'),
  ],
  edges: [
    edge('rogue-valley', 'within', 'southern-oregon'),
    edge('rogue-vineyard', 'located_in', 'rogue-valley'),
    edge('wv-vineyard', 'located_in', 'willamette-valley'),
    // A Newberg house with a Rogue Valley label
    edge('north', 'draws_from', 'rogue-valley', 5),
    edge('north', 'draws_from', 'willamette-valley'),
    edge('south', 'draws_from', 'rogue-valley'),
    edge('unplaced', 'draws_from', 'rogue-valley', 3),
    edge('unplaced', 'draws_from', 'willamette-valley'),
    // Its estate is in the Willamette, whatever it buys
    edge('estate', 'owns', 'wv-vineyard'),
    edge('estate', 'draws_from', 'rogue-valley', 4),
  ],
} as unknown as Graph

describe('which records belong to a region', () => {
  const index = regions(graph)

  it('reads the region from the town a winery is based in', () => {
    expect(regionOfPlace('Medford, OR')).toBe('southern-oregon')
    expect(regionOfPlace('Willamette Valley, Oregon')).toBe('willamette-valley')
    expect(regionOfPlace('Napa Valley, CA')).toBeUndefined()
  })

  it('places a winery by its town, then its estate, then most of its fruit', () => {
    expect(index.home('north')).toBe('willamette-valley')
    expect(index.home('south')).toBe('southern-oregon')
    expect(index.home('estate')).toBe('willamette-valley')
    expect(index.home('unplaced')).toBe('southern-oregon')
  })

  it('keeps out wineries based elsewhere that bottle some of the region’s fruit', () => {
    const members = regionMembers(graph, new Set(['southern-oregon', 'rogue-valley']), index)
    expect([...members].sort()).toEqual(['rogue-vineyard', 'south', 'unplaced'])
    expect(index.avasOf('north')).toEqual(['willamette-valley'])
  })

  it('on the real data, keeps the Southern Oregon guide to Southern Oregon', async () => {
    const real = await loadGraph()
    const scope = new Set(['southern-oregon', 'rogue-valley', 'applegate-valley', 'umpqua-valley', 'elkton-oregon', 'red-hill-douglas-county'])
    const members = regionMembers(real, scope)
    for (const id of ['abacela', 'cowhorn-vineyard-and-garden', 'quady-north', 'brandborg-vineyard-and-winery']) expect(members.has(id)).toBe(true)
    // Willamette houses whose labels name Rogue or Umpqua fruit
    for (const id of ['king-estate', 'bethel-heights-vineyard', 'argyle-winery', 'erath-winery', 'hayworth-estate-wines']) expect(members.has(id)).toBe(false)
  })
})
