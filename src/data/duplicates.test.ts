import { describe, expect, it } from 'vitest'
import { loadGraph } from '.'

const graph = await loadGraph()

// Family roles that run both ways: "sibling of" from either end is the same connection
const ONE_WAY_FAMILY = new Set(['parent', 'child'])

describe('the data has no connection stored twice', () => {
  it('stores each connection once, whichever way round', () => {
    const seen = new Map<string, string>()
    const twice: string[] = []
    for (const edge of graph.edges) {
      const role = (edge.role ?? '').toLowerCase()
      const twoWay = edge.type === 'family' && !ONE_WAY_FAMILY.has(role)
      const ends = twoWay ? [edge.source, edge.target].sort().join('+') : `${edge.source}>${edge.target}`
      // The same kind of link between the same records with the same role; separate stints
      // or different wines carry different roles, and pass
      const key = `${edge.type}|${ends}|${role}`
      if (seen.has(key)) twice.push(`${seen.get(key)} and ${edge.id}`)
      else seen.set(key, edge.id)
    }
    expect(twice).toEqual([])
  })
})

describe('the duplicate-records report (tools/check/duplicates.ts)', async () => {
  const { nameKey, personKey } = await import('../../tools/check/duplicates')

  it('matches names however they’re written', () => {
    expect(nameKey('Résonance')).toBe(nameKey('resonance'))
    expect(nameKey('The Eyrie Vineyards')).toBe(nameKey('Eyrie'))
  })

  it('matches people across nicknames and suffixes', () => {
    expect(personKey('Mikey Etzel')).toBe('michael etzel')
    expect(personKey('Michael G. Etzel')).toBe('michael etzel')
    expect(personKey('Ed King Jr.')).toBe(personKey('Ed King III'))
    expect(personKey('Cher')).toBeNull()
  })
})
