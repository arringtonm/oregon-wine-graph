import { describe, expect, it } from 'vitest'
import { IMAGE_NOTE, labelOnlyNote } from '../../tools/cola/caveats'
import { caveatsOf, labelOnlySources, withoutCaveats } from './caveats'

const label = labelOnlyNote([{ title: 'X, label approved 22 Aug 2025 (TTB COLA 1)', url: 'https://ttbonline.gov/colasonline/x' }])!

describe('caveats on a record card', () => {
  it('reads the label caveats out of a note, leaving the rest of it for the card', () => {
    const note = `Planted 1990. ${label} ${IMAGE_NOTE}`
    expect(caveatsOf(note)).toEqual({ labelOnly: true, byImage: true })
    expect(withoutCaveats(note)).toBe('Planted 1990.')
    expect(withoutCaveats(label)).toBeUndefined()
    expect(caveatsOf('From the winery site.')).toEqual({ labelOnly: false, byImage: false })
    expect(withoutCaveats('From the winery site.')).toBe('From the winery site.')
  })

  it('knows a place described only from label approvals', () => {
    const cola = { title: 'X, label approved 1 Jan 2020 (TTB COLA 1)', url: 'https://ttbonline.gov/colasonline/x' }
    const openml = { title: 'WineEnthusiast reviews', url: 'https://www.openml.org/d/42074' }
    expect(labelOnlySources([openml, cola])).toBe(true)
    expect(labelOnlySources([openml])).toBe(false)
    expect(labelOnlySources([cola, { title: 'About (X Winery)', url: 'https://x.com/about' }])).toBe(false)
  })
})
