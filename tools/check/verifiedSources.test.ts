import { describe, expect, it } from 'vitest'
import type { Graph, GraphEdge, GraphNode } from '../../src/data/schema'
import { claimsFingerprint, claimsFor } from './claims'
import type { CheckStore } from './store'
import { verifiedSourceIndexes } from './verifiedSources'

const node = (id: string, name: string) =>
  ({ id, type: 'person', name, summary: `${name}.`, sources: [{ title: 'x' }], verified: false }) as unknown as GraphNode
const winery = { ...node('eyrie', 'The Eyrie Vineyards'), type: 'winery' } as unknown as GraphNode
const edge = (verifiedBy: string, extra: object = {}) =>
  ({
    id: 'david--founded--eyrie',
    source: 'david',
    target: 'eyrie',
    type: 'founded',
    sources: [
      { title: 'Weak', url: 'https://weak.example' },
      { title: 'Strong', url: 'https://strong.example' },
    ],
    verified: true,
    verifiedBy,
    ...extra,
  }) as unknown as GraphEdge

function graphWith(record: GraphEdge): { graph: Graph; store: CheckStore } {
  const graph: Graph = { nodes: [node('david', 'David Lett'), winery], edges: [record] }
  const fingerprint = claimsFingerprint(claimsFor({ kind: 'edge', record }, graph))
  const store = {
    'edge:david--founded--eyrie': {
      fingerprint,
      checkedAt: '2026-10-14',
      sources: [
        { url: 'https://weak.example', status: 'read', levels: [0, 0.4, 0.4, 0.2] },
        { url: 'https://strong.example', status: 'read', levels: [0, 0, 0.05, 0.95] },
      ],
    },
  } as unknown as CheckStore
  return { graph, store }
}

describe('verifiedSourceIndexes', () => {
  it('records the source that supports a checked record best', () => {
    const { graph, store } = graphWith(edge('jev'))
    expect(verifiedSourceIndexes(graph, store)).toEqual({ 'edge:david--founded--eyrie': 1 })
  })

  it('skips records verified by a person', () => {
    const { graph, store } = graphWith(edge('person'))
    expect(verifiedSourceIndexes(graph, store)).toEqual({})
  })

  it('skips a record edited since it was checked', () => {
    const { graph, store } = graphWith(edge('jev'))
    graph.edges[0] = edge('jev', { startYear: 1966 })
    expect(verifiedSourceIndexes(graph, store)).toEqual({})
  })
})
