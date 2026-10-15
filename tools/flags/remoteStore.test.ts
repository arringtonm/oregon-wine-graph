import { describe, expect, it } from 'vitest'
import { toStoredFlag } from './remoteStore'

describe('flags from the published site', () => {
  it('maps a D1 row to the shape admin mode uses, leaving out empty fields', () => {
    const flag = toStoredFlag({
      id: '4701cb16-02b7-491a-8cc9-0fcc95f54fbf',
      record_kind: 'edge',
      record_id: 'david-lett--founded--the-eyrie-vineyards',
      record_label: 'David Lett founded The Eyrie Vineyards',
      reason: 'outdated',
      note: 'Founded 1965',
      source_url: null,
      page_url: 'https://oregonwine.app/#david-lett',
      app_version: 'bc7a208',
      created_at: '2026-10-15T12:00:00.000Z',
      resolved_at: null,
    })
    expect(flag).toEqual({
      id: '4701cb16-02b7-491a-8cc9-0fcc95f54fbf',
      source: 'remote',
      recordKind: 'edge',
      recordId: 'david-lett--founded--the-eyrie-vineyards',
      recordLabel: 'David Lett founded The Eyrie Vineyards',
      reason: 'outdated',
      note: 'Founded 1965',
      pageUrl: 'https://oregonwine.app/#david-lett',
      appVersion: 'bc7a208',
      createdAt: '2026-10-15T12:00:00.000Z',
    })
  })
})
