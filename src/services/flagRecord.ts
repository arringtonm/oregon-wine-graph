// Checks a flag received by a server (the dev server's local store, or the Cloudflare
// function) and builds the record to keep. Trusts nothing from the request: only known
// fields, of the right types and sizes, with the time set here. No browser or Node APIs.
import { FLAG_REASONS, type Flag, type FlagReason } from './flagTypes'

export interface FlagRecord extends Flag {
  id: string
}

export function parseFlagRecord(input: Record<string, unknown>, id: string, now = new Date()): FlagRecord {
  const text = (key: string, limit: number, required = false) => {
    const value = input[key]
    if ((value === undefined || value === '') && !required) return undefined
    if (typeof value !== 'string' || value.length > limit || (required && !value.trim())) throw new Error(`Bad ${key}`)
    return value
  }
  if (input.recordKind !== 'node' && input.recordKind !== 'edge') throw new Error('Bad recordKind')
  if (typeof input.reason !== 'string' || !(input.reason in FLAG_REASONS)) throw new Error('Bad reason')
  const sourceUrl = text('sourceUrl', 2000)
  if (sourceUrl && !/^https?:\/\/\S+$/.test(sourceUrl)) throw new Error('Bad sourceUrl')
  const note = text('note', 1000)
  return {
    id,
    recordKind: input.recordKind,
    recordId: text('recordId', 200, true)!,
    recordLabel: text('recordLabel', 300, true)!,
    reason: input.reason as FlagReason,
    ...(note ? { note } : {}),
    ...(sourceUrl ? { sourceUrl } : {}),
    pageUrl: text('pageUrl', 2000, true)!,
    createdAt: now.toISOString(),
    appVersion: text('appVersion', 40) ?? 'unknown',
  }
}
