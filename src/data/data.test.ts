import { describe, expect, it } from 'vitest'
import { loadGraph } from './index'
import { checkGraph, graphSchema, type Graph } from './schema'

const source = { title: 'Example', url: 'https://example.com' }

function sample(): Graph {
  return graphSchema.parse({
    nodes: [
      { id: 'a-person', type: 'person', name: 'A Person', summary: 's', sources: [source], verified: false },
      { id: 'a-winery', type: 'winery', name: 'A Winery', summary: 's', sources: [source], verified: false },
    ],
    edges: [
      {
        id: 'a-person--founded--a-winery',
        source: 'a-person',
        target: 'a-winery',
        type: 'founded',
        sources: [source],
        verified: false,
      },
    ],
  })
}

describe('graph data files', () => {
  it('match the schema and are internally consistent', async () => {
    const graph = await loadGraph()
    expect(graph.nodes.length).toBeGreaterThan(0)
    expect(graph.edges.length).toBeGreaterThan(0)
  })
})

describe('checkGraph', () => {
  it('accepts a consistent graph', () => {
    expect(checkGraph(sample())).toEqual([])
  })

  it('reports an edge pointing at a missing node', () => {
    const graph = sample()
    graph.edges[0].target = 'nowhere'
    expect(checkGraph(graph)).toEqual(['edge "a-person--founded--a-winery": unknown target "nowhere"'])
  })

  it('reports an endpoint type the edge type does not allow', () => {
    const graph = sample()
    graph.edges[0].source = 'a-winery'
    graph.edges[0].target = 'a-person'
    expect(checkGraph(graph)).toEqual([
      'edge "a-person--founded--a-winery": "founded" cannot start from a winery',
      'edge "a-person--founded--a-winery": "founded" cannot point to a person',
    ])
  })

  it('reports duplicate ids and reversed years', () => {
    const graph = sample()
    graph.nodes.push({ ...graph.nodes[0] })
    graph.edges[0].startYear = 2000
    graph.edges[0].endYear = 1990
    expect(checkGraph(graph)).toEqual([
      'duplicate node id "a-person"',
      'edge "a-person--founded--a-winery": startYear is after endYear',
    ])
  })
})

describe('schema', () => {
  it('rejects records without a source or with unknown fields', () => {
    const node = { id: 'x', type: 'person', name: 'X', summary: 's', verified: false }
    expect(graphSchema.safeParse({ nodes: [{ ...node, sources: [] }], edges: [] }).success).toBe(false)
    expect(
      graphSchema.safeParse({ nodes: [{ ...node, sources: [source], planted: 1970 }], edges: [] }).success,
    ).toBe(false)
    expect(graphSchema.safeParse({ nodes: [{ ...node, id: 'Not A Slug', sources: [source] }], edges: [] }).success).toBe(
      false,
    )
  })
})
