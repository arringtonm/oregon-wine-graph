// What a flag is, shared by the app and the dev server's tools; no browser APIs here

export const FLAG_REASONS = {
  incorrect: 'Incorrect',
  outdated: 'Out of date',
  unsupported: "Source doesn't support it",
  duplicate: 'Duplicate',
  other: 'Something else',
} as const

export type FlagReason = keyof typeof FLAG_REASONS

export interface Flag {
  recordKind: 'node' | 'edge'
  recordId: string
  recordLabel: string
  reason: FlagReason
  note?: string
  sourceUrl?: string
  pageUrl: string
  createdAt: string
  appVersion: string
}
