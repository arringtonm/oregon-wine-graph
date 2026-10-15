import { describe, expect, it } from 'vitest'
import { parseFlagRecord } from './flagRecord'

const body = {
  recordKind: 'edge',
  recordId: 'david-lett--founded--the-eyrie-vineyards',
  recordLabel: 'David Lett founded The Eyrie Vineyards',
  reason: 'outdated',
  note: 'Founded 1965',
  pageUrl: 'https://oregonwine.app/#david-lett',
  appVersion: 'abc1234',
}

describe('parseFlagRecord', () => {
  it('keeps the known fields and sets the time on the server', () => {
    const flag = parseFlagRecord({ ...body, createdAt: '1999-01-01', extra: 'ignored' }, 'id-1', new Date('2026-10-15T00:00:00Z'))
    expect(flag).toEqual({ ...body, id: 'id-1', createdAt: '2026-10-15T00:00:00.000Z' })
  })

  it('rejects unknown reasons, bad links and oversized text', () => {
    expect(() => parseFlagRecord({ ...body, reason: 'spam' }, 'x')).toThrow(/reason/)
    expect(() => parseFlagRecord({ ...body, recordKind: 'thing' }, 'x')).toThrow(/recordKind/)
    expect(() => parseFlagRecord({ ...body, sourceUrl: 'javascript:alert(1)' }, 'x')).toThrow(/sourceUrl/)
    expect(() => parseFlagRecord({ ...body, note: 'x'.repeat(1001) }, 'x')).toThrow(/note/)
    expect(() => parseFlagRecord({ ...body, recordId: '' }, 'x')).toThrow(/recordId/)
  })
})
