import { describe, expect, it } from 'vitest'
import { labelOnlyNote, IMAGE_NOTE } from '../../tools/cola/caveats'
import { shareCaveats } from './caveats'

const label = labelOnlyNote([{ title: 'X, label approved 22 Aug 2025 (TTB COLA 1)', url: 'https://ttbonline.gov/colasonline/x' }])!

describe('caveats on a record card', () => {
  it('says a caveat several connections share once, naming the shorter of those it covers and those it does not', () => {
    const rows = [
      { name: 'McMinnville AVA', notes: [label] },
      { name: 'Dundee Hills AVA', notes: [`Planted 1990. ${label} ${IMAGE_NOTE}`] },
      { name: 'Willamette Valley AVA', notes: ['From the winery site.'] },
    ]
    const { rows: shown, caveats } = shareCaveats(rows)
    // The image caveat is on one connection only, so it stays there
    expect(shown.map((row) => row.notes)).toEqual([[], [`Planted 1990. ${IMAGE_NOTE}`], ['From the winery site.']])
    expect(caveats).toEqual([
      'For all of these but Willamette Valley AVA, the evidence goes only as far as federal label approvals; no other source confirms the wines were released.',
    ])
    expect(shareCaveats(rows.slice(0, 2)).caveats[0]).toMatch(/^For all of these, /)
    const four = [...rows, { name: 'Ribbon Ridge AVA', notes: [] }]
    expect(shareCaveats(four).caveats[0]).toMatch(/^For McMinnville AVA and Dundee Hills AVA, /)
  })

  it('says a second shared caveat of the same connections', () => {
    const rows = [{ name: 'A', notes: [`${label} ${IMAGE_NOTE}`] }, { name: 'B', notes: [`${label} ${IMAGE_NOTE}`] }, { name: 'C', notes: [] }]
    const { rows: shown, caveats } = shareCaveats(rows)
    expect(caveats[1]).toBe('All of these but C were checked automatically against the label images, an early-stage method with lower confidence.')
    expect(shown.every((row) => row.notes.length === 0)).toBe(true)
  })

  it('leaves a caveat on a single connection where it is', () => {
    const rows = [{ name: 'A', notes: [label] }, { name: 'B', notes: [] }]
    expect(shareCaveats(rows)).toEqual({ rows, caveats: [] })
  })
})
