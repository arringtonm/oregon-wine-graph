// Flags: readers marking a fact for review. On the dev server a flag goes to a local file
// (.cache/flags.json), which review mode reads; the published site posts to its flags
// endpoint (VITE_FLAGS_URL, the Cloudflare Worker, worker/api/flags.ts). No personal
// data is collected: what was flagged, why, an optional note and source, the page and time.

import { type Flag, type FlagReason } from './flagTypes'

export { FLAG_REASONS, type Flag, type FlagReason } from './flagTypes'

export interface FlagInput {
  recordKind: 'node' | 'edge'
  recordId: string
  // How the fact reads, e.g. "David Lett founded The Eyrie Vineyards"
  recordLabel: string
  reason: FlagReason | ''
  note: string
  sourceUrl: string
  // Left empty by people; a bot filling every field fills this too
  website: string
}

export const NOTE_LIMIT = 1000
export const LABEL_LIMIT = 300

const FLAGS_URL = import.meta.env.VITE_FLAGS_URL

// Whether a flag can be sent from here: the dev server's local file, or a flags endpoint
export function flagsAvailable(): boolean {
  return import.meta.env.DEV || Boolean(FLAGS_URL)
}

// The first problem with the form, or null when it can be sent
export function validateFlag(input: FlagInput): string | null {
  if (!input.reason) return 'Choose what is wrong.'
  if (input.reason === 'other' && !input.note.trim()) return 'Say briefly what is wrong.'
  if (input.note.length > NOTE_LIMIT) return `Keep the note under ${NOTE_LIMIT} characters.`
  if (input.sourceUrl.trim()) {
    try {
      const url = new URL(input.sourceUrl.trim())
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return 'The source link should start with https://'
    } catch {
      return 'The source link should be a web address, like https://example.com/article'
    }
  }
  return null
}

export function toFlag(input: FlagInput, page = window.location.href, now = new Date()): Flag {
  return {
    recordKind: input.recordKind,
    recordId: input.recordId,
    // Labels can include a long summary; the store accepts 300 characters
    recordLabel: input.recordLabel.length > LABEL_LIMIT ? `${input.recordLabel.slice(0, LABEL_LIMIT - 1)}…` : input.recordLabel,
    reason: input.reason as FlagReason,
    ...(input.note.trim() ? { note: input.note.trim() } : {}),
    ...(input.sourceUrl.trim() ? { sourceUrl: input.sourceUrl.trim() } : {}),
    pageUrl: page,
    createdAt: now.toISOString(),
    // The version and the exact build, "v1.00 (4fa3696)"
    appVersion: `${__SITE_VERSION__} (${__BUILD_COMMIT__})`,
  }
}

// `turnstileToken`: from the Turnstile widget, where the site uses one
export async function submitFlag(input: FlagInput, turnstileToken?: string): Promise<void> {
  const problem = validateFlag(input)
  if (problem) throw new Error(problem)
  // Looks sent to whoever filled the hidden field, so a bot learns nothing
  if (input.website.trim()) return
  const flag = toFlag(input)
  if (import.meta.env.DEV) {
    const response = await fetch('/__flags/add', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(flag),
    })
    if (!response.ok) throw new Error(`Couldn't save the flag (${response.status})`)
    return
  }
  if (FLAGS_URL) {
    const response = await fetch(FLAGS_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...flag, turnstileToken }),
    })
    if (!response.ok) {
      const message = ((await response.json().catch(() => null)) as { error?: string } | null)?.error
      throw new Error(message ?? `Couldn't send the flag (${response.status}); please try again.`)
    }
    return
  }
  throw new Error('Flagging is not available on this site yet.')
}
