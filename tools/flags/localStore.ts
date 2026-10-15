// Flags sent on the dev server, kept in .cache/flags.json (git-ignored). The same fields as
// the published site's D1 table (migrations/0001_flags.sql).
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { parseFlagRecord } from '../../src/services/flagRecord'
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

// Accepts only the fields a flag has, of the right types and sizes (see flagRecord.ts)
export function addLocalFlag(input: Record<string, unknown>): StoredFlag {
  const flag: StoredFlag = { ...parseFlagRecord(input, randomUUID()), source: 'local' }
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
