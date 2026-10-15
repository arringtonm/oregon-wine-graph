// Flags sent on the dev server when Firebase isn't configured, kept in .cache/flags.json
// (git-ignored). The same shape as the Firestore documents, plus an id.
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { Flag } from '../../src/services/flagTypes'

export interface StoredFlag extends Flag {
  id: string
  source: 'local' | 'firestore'
  resolvedAt?: string
}

const FILE = resolve('.cache/flags.json')

export function readLocalFlags(): StoredFlag[] {
  return existsSync(FILE) ? (JSON.parse(readFileSync(FILE, 'utf8')) as StoredFlag[]) : []
}

function write(flags: StoredFlag[]) {
  mkdirSync(dirname(FILE), { recursive: true })
  writeFileSync(FILE, `${JSON.stringify(flags, null, 1)}\n`)
}

const REASONS = new Set(['incorrect', 'outdated', 'unsupported', 'duplicate', 'other'])

// Accepts only the fields a flag has, of the right types and sizes
export function addLocalFlag(input: Record<string, unknown>): StoredFlag {
  const text = (key: string, limit: number, required = false) => {
    const value = input[key]
    if (value === undefined && !required) return undefined
    if (typeof value !== 'string' || value.length > limit || (required && !value.trim())) throw new Error(`Bad ${key}`)
    return value
  }
  if (input.recordKind !== 'node' && input.recordKind !== 'edge') throw new Error('Bad recordKind')
  if (typeof input.reason !== 'string' || !REASONS.has(input.reason)) throw new Error('Bad reason')
  const flag: StoredFlag = {
    id: randomUUID(),
    source: 'local',
    recordKind: input.recordKind,
    recordId: text('recordId', 200, true)!,
    recordLabel: text('recordLabel', 300, true)!,
    reason: input.reason as StoredFlag['reason'],
    ...(text('note', 1000) ? { note: text('note', 1000) } : {}),
    ...(text('sourceUrl', 2000) ? { sourceUrl: text('sourceUrl', 2000) } : {}),
    pageUrl: text('pageUrl', 2000, true)!,
    createdAt: new Date().toISOString(),
    appVersion: text('appVersion', 40) ?? 'unknown',
  }
  write([...readLocalFlags(), flag])
  return flag
}

export function resolveLocalFlag(id: string): boolean {
  const flags = readLocalFlags()
  const flag = flags.find((entry) => entry.id === id)
  if (!flag) return false
  flag.resolvedAt = new Date().toISOString()
  write(flags)
  return true
}
