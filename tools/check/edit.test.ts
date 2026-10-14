import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readGraph } from '../reviewPlugin'
import { evidenceFor, findRecord, removeEdge, updateEdge } from './edit'

let dataDir: string
const id = 'jason-lett--winemaker--the-eyrie-vineyards'
const edgesFile = () => join(dataDir, 'edges.json')

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'wine-graph-'))
  cpSync(resolve('src/data'), dataDir, { recursive: true })
})
afterEach(() => rmSync(dataDir, { recursive: true, force: true }))

describe('updateEdge', () => {
  it('sets and clears fields, touching only that record', () => {
    const before = readGraph(dataDir).edges
    const updated = updateEdge(dataDir, id, { startYear: 2006, role: null, ongoing: null, endYear: 2020 })
    expect(updated).toMatchObject({ startYear: 2006, endYear: 2020 })
    expect(updated.role).toBeUndefined()
    expect(updated.ongoing).toBeUndefined()

    const after = readGraph(dataDir).edges
    expect(after.filter((edge, index) => JSON.stringify(edge) !== JSON.stringify(before[index])).map((edge) => edge.id)).toEqual([id])
  })

  it('writes nothing when the change is invalid', () => {
    const original = readFileSync(edgesFile(), 'utf8')
    expect(() => updateEdge(dataDir, id, { startYear: 2010, endYear: 2001 })).toThrow(/startYear is after endYear/)
    expect(() => updateEdge(dataDir, id, { endYear: 2030, ongoing: true })).toThrow(/ongoing/)
    expect(() => updateEdge(dataDir, 'no-such-edge', { role: 'x' })).toThrow(/No connection/)
    expect(readFileSync(edgesFile(), 'utf8')).toBe(original)
  })
})

describe('removeEdge', () => {
  it('removes exactly one connection and reports an unknown id', () => {
    const before = readGraph(dataDir).edges.length
    expect(removeEdge(dataDir, id)).toBe(true)
    const after = readGraph(dataDir).edges
    expect(after.length).toBe(before - 1)
    expect(after.some((edge) => edge.id === id)).toBe(false)
    expect(removeEdge(dataDir, id)).toBe(false)
  })
})

describe('evidenceFor', () => {
  const item = () => findRecord(dataDir, 'edge', id)!

  it('returns the claims and the passage naming the parties from each readable source', () => {
    const text = 'In 2005 Jason Lett took over as winemaker at Eyrie from his father.'
    const evidence = evidenceFor(dataDir, item(), (url) => ({ url, status: 'ok', fetchedAt: '', text }))
    expect(evidence.claims.main).toBe('Jason Lett winemaker at The Eyrie Vineyards.')
    expect(evidence.sources[0]).toMatchObject({ status: 'read', passage: text })
  })

  it('says why a source gave no passage', () => {
    expect(evidenceFor(dataDir, item(), () => null).sources[0]).toMatchObject({ status: 'not fetched', passage: '' })
    const blocked = evidenceFor(dataDir, item(), (url) => ({ url, status: 'blocked', fetchedAt: '', text: '' }))
    expect(blocked.sources[0].status).toBe('blocked')
    const silent = evidenceFor(dataDir, item(), (url) => ({ url, status: 'ok', fetchedAt: '', text: 'Unrelated page.' }))
    expect(silent.sources[0].status).toBe('names not found')
  })
})
