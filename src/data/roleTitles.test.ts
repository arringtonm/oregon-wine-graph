import { describe, expect, it } from 'vitest'
import edges from './edges.json'
import { roleTitle, SHORT_ROLE_WORDS, TITLE_TYPES, titleKey } from './roleTitles'
import titles from './role-titles.json'
import type { GraphEdge } from './schema'

describe('role titles', () => {
  it('shows a short role as it is, in place of the verb', () => {
    expect(roleTitle({ type: 'owns', role: 'co-owner' })).toBe('co-owner')
    expect(roleTitle({ type: 'winemaker', role: 'head winemaker' })).toBe('head winemaker')
  })

  it('condenses a long role to its agreed title', () => {
    expect(roleTitle({ type: 'worked_at', role: 'operates the winery with family' })).toBe('operator')
  })

  it('tidies a short role that is not a title', () => {
    expect(roleTitle({ type: 'worked_at', role: 'winemaking' })).toBe('winemaker')
    expect(roleTitle({ type: 'founded', role: 'with William Meek' })).toBe('co-founder')
  })

  it('keeps the verb where the role is detail rather than a title', () => {
    expect(roleTitle({ type: 'sources_from', role: 'Pinot noir' })).toBeUndefined()
    expect(roleTitle({ type: 'founded' })).toBeUndefined()
  })

  // New data with a long role needs a title: run `npm run roles:titles` and review
  it('has a title for every long role in the data', () => {
    const missing = (edges as GraphEdge[])
      .filter((edge) => edge.role && TITLE_TYPES.has(edge.type) && edge.role.split(/\s+/).length > SHORT_ROLE_WORDS)
      .map((edge) => titleKey(edge.type, edge.role!))
      .filter((key) => !(key in titles))
    expect(missing).toEqual([])
  })

  it('keeps titles short', () => {
    for (const title of Object.values(titles)) expect(title.split(/\s+/).length).toBeLessThanOrEqual(3)
  })
})
