import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { formatRecords, setVerified } from './reviewPlugin'

const realDataDir = resolve('src/data')
let dataDir: string

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'wine-graph-'))
  cpSync(realDataDir, dataDir, { recursive: true })
})

afterEach(() => rmSync(dataDir, { recursive: true, force: true }))

function read(file: string) {
  return JSON.parse(readFileSync(file, 'utf8')) as { id: string; verified: boolean }[]
}

describe('setVerified', () => {
  it('flips one node and leaves every other line untouched', () => {
    const file = join(dataDir, 'nodes', 'people.json')
    const before = readFileSync(file, 'utf8').split('\n')

    expect(setVerified(dataDir, 'node', 'david-lett', true)).toBe(file)

    const after = readFileSync(file, 'utf8').split('\n')
    expect(read(file).find((node) => node.id === 'david-lett')?.verified).toBe(true)
    expect(after.length).toBe(before.length)
    expect(after.filter((line, index) => line !== before[index]).length).toBe(1)
  })

  it('flips an edge and can flip it back', () => {
    const file = join(dataDir, 'edges.json')
    const id = 'david-lett--founded--the-eyrie-vineyards'
    const original = readFileSync(file, 'utf8')

    expect(setVerified(dataDir, 'edge', id, true)).toBe(file)
    expect(read(file).find((edge) => edge.id === id)?.verified).toBe(true)

    setVerified(dataDir, 'edge', id, false)
    expect(readFileSync(file, 'utf8')).toBe(original)
  })

  it('returns null for an unknown id and does not look for nodes among edges', () => {
    expect(setVerified(dataDir, 'node', 'nobody', true)).toBeNull()
    expect(setVerified(dataDir, 'edge', 'david-lett', true)).toBeNull()
  })
})

describe('data files', () => {
  it('are stored in the format the review tool writes', () => {
    const files = [
      join(realDataDir, 'edges.json'),
      ...readdirSync(join(realDataDir, 'nodes')).map((name) => join(realDataDir, 'nodes', name)),
    ]
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      expect(formatRecords(JSON.parse(text)), file).toBe(text)
    }
  })
})
