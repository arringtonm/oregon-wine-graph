import { describe, expect, it } from 'vitest'
import { guideAsset } from './guides'

describe('guide addresses', () => {
  it('serve a guide its own page, and a record in a guide the record’s page', () => {
    expect(guideAsset('/guides/sparkling')).toBe('/guides/sparkling')
    expect(guideAsset('/guides/sparkling/argyle-winery')).toBe('/argyle-winery')
    expect(guideAsset('/guides/sparkling/argyle-winery/')).toBe('/argyle-winery')
    expect(guideAsset('/guides/a/b/c')).toBe('/guides/a/b/c')
  })
})
