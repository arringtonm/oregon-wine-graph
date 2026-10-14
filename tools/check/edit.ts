// Changes a person can make to a record from the review queue, and the evidence shown
// beside it. Each writes the data file once and validates before writing.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { checkGraph, edgeSchema, type GraphEdge } from '../../src/data/schema'
import { formatRecords, readGraph, type RecordKind } from '../reviewPlugin'
import { claimsFor, type CheckedRecord } from './claims'
import type { CachedSource } from './fetchSources'
import { extractPassages } from './passages'

export type EdgeChanges = Partial<Pick<GraphEdge, 'role' | 'startYear' | 'endYear' | 'ongoing'>>

const EDITABLE = ['role', 'startYear', 'endYear', 'ongoing'] as const

export function findRecord(dataDir: string, kind: RecordKind, id: string): CheckedRecord | null {
  const graph = readGraph(dataDir)
  const record = kind === 'node' ? graph.nodes.find((node) => node.id === id) : graph.edges.find((edge) => edge.id === id)
  return record ? ({ kind, record } as CheckedRecord) : null
}

export function removeEdge(dataDir: string, id: string): boolean {
  const file = join(dataDir, 'edges.json')
  const records = JSON.parse(readFileSync(file, 'utf8')) as { id: string }[]
  const kept = records.filter((record) => record.id !== id)
  if (kept.length === records.length) return false
  writeFileSync(file, formatRecords(kept))
  return true
}

// Sets or clears a connection's role, years and "still true". A value of null clears the
// field. Throws, writing nothing, if the result breaks the schema or the graph rules.
export function updateEdge(dataDir: string, id: string, changes: { [K in keyof EdgeChanges]: EdgeChanges[K] | null }): GraphEdge {
  const file = join(dataDir, 'edges.json')
  const records = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>[]
  const record = records.find((candidate) => candidate.id === id)
  if (!record) throw new Error(`No connection with id "${id}"`)
  for (const field of EDITABLE) {
    if (!(field in changes)) continue
    const value = changes[field]
    if (value === null || value === undefined || value === '' || value === false) delete record[field]
    else record[field] = value
  }
  const updated = edgeSchema.parse(record)
  const graph = readGraph(dataDir)
  const problems = checkGraph({ nodes: graph.nodes, edges: graph.edges.map((edge) => (edge.id === id ? updated : edge)) })
  if (problems.length > 0) throw new Error(problems.join('; '))
  writeFileSync(file, formatRecords(records))
  return updated
}

export interface Evidence {
  claims: { main: string; details: Record<string, string> }
  sources: { url: string; title: string; status: string; passage: string }[]
}

// What the check read for a record: its claims, and the passages cut from each cited page
export function evidenceFor(dataDir: string, item: CheckedRecord, readSource: (url: string) => CachedSource | null): Evidence {
  const claims = claimsFor(item, readGraph(dataDir))
  return {
    claims: { main: claims.main, details: claims.details },
    sources: item.record.sources.flatMap((source) => {
      if (!source.url) return []
      const cached = readSource(source.url)
      if (!cached || cached.status !== 'ok') {
        return [{ url: source.url, title: source.title, status: cached?.status ?? 'not fetched', passage: '' }]
      }
      const passages = extractPassages(cached.text, claims.parties)
      const named = passages.mentioned.some(Boolean)
      return [{ url: source.url, title: source.title, status: named ? 'read' : 'names not found', passage: named ? passages.text : '' }]
    }),
  }
}
