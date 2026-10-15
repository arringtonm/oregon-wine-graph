import { describe, expect, it } from 'vitest'
import { siteVersion } from './siteVersion'

describe('the public version', () => {
  it('shows the major and a two-digit minor number', () => {
    expect(siteVersion('1.0.0')).toBe('v1.00')
    expect(siteVersion('1.7.0')).toBe('v1.07')
    expect(siteVersion('1.42.0')).toBe('v1.42')
    expect(siteVersion('2.0.0')).toBe('v2.00')
  })

  it('keeps counting past 99 rather than rolling over', () => {
    expect(siteVersion('1.100.0')).toBe('v1.100')
  })

  it('refuses something that is not a version', () => {
    expect(() => siteVersion('next')).toThrow()
  })
})
