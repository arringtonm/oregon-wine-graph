import { describe, expect, it } from 'vitest'
import { describeFilters, joinWords } from './filterSummary'

const opening = {
  nodeTypes: { person: true, winery: true, vineyard: true, organization: true, event: false },
  categories: { ownership: true, work: true, people: true, fruit: true, affiliation: true, geography: false },
  oregonOnly: false,
  verifiedOnly: false,
  avas: [] as string[],
  focus: null as string | null,
}
const names = { ava: (id: string) => ({ 'dundee-hills': 'Dundee Hills', 'eola-amity-hills': 'Eola-Amity Hills' })[id] ?? id, focus: () => 'Since 2015' }

describe('describeFilters', () => {
  it('lists nothing for the opening filters, nor for layers that add records', () => {
    expect(describeFilters(opening, names)).toEqual([])
    expect(describeFilters({ ...opening, categories: { ...opening.categories, geography: true } }, names)).toEqual([])
  })

  it('names each filter that hides records, in readers’ words', () => {
    const filters = {
      ...opening,
      nodeTypes: { ...opening.nodeTypes, person: false, organization: false },
      categories: { ...opening.categories, fruit: false },
      avas: ['dundee-hills', 'eola-amity-hills'],
      focus: 'young-vintages',
      oregonOnly: true,
      verifiedOnly: true,
    }
    expect(describeFilters(filters, names)).toEqual([
      'People and organizations hidden',
      'Fruit sourcing connections hidden',
      'In Dundee Hills and Eola-Amity Hills',
      'Since 2015',
      'Oregon only',
      'Verified records only',
    ])
  })

  it('joins words as a sentence does', () => {
    expect(joinWords(['A'])).toBe('A')
    expect(joinWords(['A', 'B', 'C'])).toBe('A, B and C')
  })
})
