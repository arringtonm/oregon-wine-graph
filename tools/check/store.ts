import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { SourceCheck } from './decide'

export interface StoredCheck {
  // What the record asserted when it was checked; a mismatch means the result is stale
  fingerprint: string
  checkedAt: string
  sources: SourceCheck[]
}

export type CheckStore = Record<string, StoredCheck>

export const CHECKS_FILE = resolve('src/data/checks.json')

export function readChecks(file = CHECKS_FILE): CheckStore {
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as CheckStore) : {}
}

// One record per line, sorted, so a re-run produces a small readable diff
export function writeChecks(store: CheckStore, file = CHECKS_FILE) {
  const lines = Object.keys(store)
    .sort()
    .map((key) => `${JSON.stringify(key)}: ${JSON.stringify(store[key])}`)
  writeFileSync(file, `{\n${lines.join(',\n')}\n}\n`)
}

const round = (value: number) => Math.round(value * 100) / 100

export function compact(checks: SourceCheck[]): SourceCheck[] {
  return checks.map((check) => ({
    ...check,
    ...(check.levels ? { levels: check.levels.map(round) as SourceCheck['levels'] } : {}),
    ...(check.details
      ? { details: Object.fromEntries(Object.entries(check.details).map(([id, value]) => [id, round(value)])) }
      : {}),
  }))
}
