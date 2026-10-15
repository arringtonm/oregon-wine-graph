import { afterEach, describe, expect, it, vi } from 'vitest'
import { submitFlag, toFlag, validateFlag, type FlagInput } from './flags'

const input = (overrides: Partial<FlagInput> = {}): FlagInput => ({
  recordKind: 'edge',
  recordId: 'david-lett--founded--the-eyrie-vineyards',
  recordLabel: 'David Lett founded The Eyrie Vineyards',
  reason: 'incorrect',
  note: '',
  sourceUrl: '',
  website: '',
  ...overrides,
})

afterEach(() => vi.unstubAllGlobals())

describe('validating a flag', () => {
  it('needs a reason, and a note when the reason is "something else"', () => {
    expect(validateFlag(input({ reason: '' }))).toMatch(/what is wrong/)
    expect(validateFlag(input({ reason: 'other' }))).toMatch(/briefly/)
    expect(validateFlag(input({ reason: 'other', note: 'Wrong year' }))).toBeNull()
    expect(validateFlag(input())).toBeNull()
  })

  it('limits the note and checks the source link', () => {
    expect(validateFlag(input({ note: 'x'.repeat(1001) }))).toMatch(/1000/)
    expect(validateFlag(input({ sourceUrl: 'not a link' }))).toMatch(/web address/)
    expect(validateFlag(input({ sourceUrl: 'javascript:alert(1)' }))).toMatch(/https/)
    expect(validateFlag(input({ sourceUrl: 'https://www.oregonwinepress.com/eyrie' }))).toBeNull()
  })
})

describe('the flag record', () => {
  it('keeps only what was given, with the page and time', () => {
    const flag = toFlag(input({ note: '  Founded 1965  ' }), 'https://example.com/#x', new Date('2026-10-15T12:00:00Z'))
    expect(flag).toMatchObject({ reason: 'incorrect', note: 'Founded 1965', pageUrl: 'https://example.com/#x', createdAt: '2026-10-15T12:00:00.000Z' })
    expect(flag).not.toHaveProperty('sourceUrl')
    expect(flag).not.toHaveProperty('website')
  })

  it('shortens a long label to what the stores accept', () => {
    const flag = toFlag(input({ recordLabel: 'x'.repeat(500) }), 'https://example.com/')
    expect(flag.recordLabel.length).toBe(300)
  })
})

describe('sending a flag', () => {
  it('quietly drops a flag whose hidden field was filled, sending nothing', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await expect(submitFlag(input({ website: 'http://spam.example' }))).resolves.toBeUndefined()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('refuses an invalid flag before sending', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await expect(submitFlag(input({ reason: '' }))).rejects.toThrow(/what is wrong/)
    expect(fetch).not.toHaveBeenCalled()
  })

})
