import { describe, expect, it } from 'vitest'
import { loadGraph } from '../data'
import { focusRecords, LIBRARY_BEFORE, startYears, VIEWS, YOUNG_FROM } from './views'

const graph = await loadGraph()
const ids = new Set(graph.nodes.map((node) => node.id))

describe('guided views', () => {
  it('have distinct ids and name only AVAs and organizations that exist', () => {
    expect(new Set(VIEWS.map((view) => view.id)).size).toBe(VIEWS.length)
    for (const view of VIEWS) {
      for (const ava of view.avas ?? []) expect(graph.nodes.find((node) => node.id === ava)?.type).toBe('ava')
      if (view.focus?.kind === 'members') expect(ids.has(view.focus.org)).toBe(true)
    }
  })

  it('keep the members of an organization, and the people at them', () => {
    const { core, shown } = focusRecords(graph, { kind: 'members', org: 'method-oregon', label: '' })
    expect(core.size).toBeGreaterThanOrEqual(50)
    expect(shown.has('method-oregon')).toBe(true)
    for (const id of core) expect(shown.has(id)).toBe(true)
  })

  it('pick records by the year they start', () => {
    const years = startYears(graph)
    const young = focusRecords(graph, { kind: 'era', from: YOUNG_FROM, label: '' }).core
    const library = focusRecords(graph, { kind: 'era', before: LIBRARY_BEFORE, label: '' }).core
    expect(young.size).toBeGreaterThanOrEqual(20)
    expect(library.size).toBeGreaterThanOrEqual(20)
    for (const id of young) expect(years.get(id)).toBeGreaterThanOrEqual(YOUNG_FROM)
    for (const id of library) expect(years.get(id)).toBeLessThan(LIBRARY_BEFORE)
    // David Lett planted the Willamette Valley's first Pinot noir in 1965
    expect(library.has('the-eyrie-vineyards')).toBe(true)
  })

  it('keep only records with a connection of the given kinds', () => {
    const { core } = focusRecords(graph, { kind: 'linked', categories: ['fruit'], label: '' })
    const linked = new Set(graph.edges.filter((edge) => edge.type === 'sources_from').flatMap((edge) => [edge.source, edge.target]))
    expect(core.size).toBeGreaterThanOrEqual(20)
    expect(core).toEqual(linked)
  })
})
