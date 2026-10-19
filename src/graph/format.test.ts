import { describe, expect, it } from 'vitest'
import { checkGraph, graphSchema, type GraphEdge, type GraphNode } from '../data/schema'
import { datedText, formatYears, hasDisputedYears, nodeYears } from './format'

const source = { title: 'Example', url: 'https://example.com' }
const winery = (fields: Partial<GraphNode>) =>
  ({ id: 'a-winery', type: 'winery', name: 'A Winery', summary: 's', sources: [source], verified: false, ...fields }) as GraphNode
const edge = (fields: Partial<GraphEdge>) =>
  ({ id: 'a--founded--b', source: 'a', target: 'b', type: 'founded', sources: [source], verified: false, ...fields }) as GraphEdge

describe('years the sources disagree on', () => {
  it('read as every year a source gives', () => {
    expect(datedText(winery({ founded: 1966, alsoDated: { founded: [1965] } }), 'founded')).toBe('1965 or 1966')
    expect(datedText(edge({ startYear: 2005, alsoDated: { startYear: [2007, 2006] } }), 'startYear')).toBe('2005, 2006 or 2007')
    expect(nodeYears(winery({ founded: 1966, alsoDated: { founded: [1965] } }))).toBe('Founded 1965 or 1966')
    expect(formatYears(edge({ startYear: 1966, ongoing: true, alsoDated: { startYear: [1965] } }))).toBe('1965 or 1966–present')
    expect(hasDisputedYears(winery({ founded: 1966 }))).toBe(false)
  })

  it('must belong to a year the record gives, and differ from it', () => {
    const graph = graphSchema.parse({
      nodes: [winery({ alsoDated: { founded: [1965] } }), winery({ id: 'b-winery', founded: 1966, alsoDated: { founded: [1966] } })],
      edges: [],
    })
    expect(checkGraph(graph)).toEqual([
      'node "a-winery": alsoDated.founded without a founded',
      'node "b-winery": alsoDated.founded repeats 1966',
    ])
  })
})
