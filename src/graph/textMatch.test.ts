import { describe, expect, it } from 'vitest'
import { foldText, matchesQuery } from './textMatch'

describe('text matching', () => {
  it('ignores case and accents', () => {
    expect(foldText('Véronique Drouhin-Boss')).toBe('veronique drouhin-boss')
    expect(matchesQuery('veronique', ['Véronique Drouhin-Boss'])).toBe(true)
    expect(matchesQuery('SALUD', ['¡Salud!'])).toBe(true)
  })

  it('needs every word, in any of the texts', () => {
    expect(matchesQuery('eyrie mcminnville', ['The Eyrie Vineyards', 'McMinnville, OR'])).toBe(true)
    expect(matchesQuery('eyrie dundee', ['The Eyrie Vineyards', 'McMinnville, OR'])).toBe(false)
  })

  it('matches everything for an empty query', () => {
    expect(matchesQuery('  ', ['anything'])).toBe(true)
  })
})
