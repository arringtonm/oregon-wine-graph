import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { addConnection, formatRecords, readGraph, setVerified, setVerifiedWhere } from './reviewPlugin'

const realDataDir = resolve('src/data')
let dataDir: string

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'wine-graph-'))
  cpSync(realDataDir, dataDir, { recursive: true })
})

afterEach(() => rmSync(dataDir, { recursive: true, force: true }))

function read(file: string) {
  return JSON.parse(readFileSync(file, 'utf8')) as { id: string; verified: boolean; verifiedBy?: string }[]
}

describe('setVerified', () => {
  // Records are picked from whatever is still unverified, so approvals made in the real
  // data do not break these tests
  const unverifiedPeople = () =>
    read(join(dataDir, 'nodes', 'people.json'))
      .filter((node) => !node.verified)
      .map((node) => node.id)
  const unverifiedEdge = () => read(join(dataDir, 'edges.json')).find((edge) => !edge.verified)!.id

  it('flips one node, adding only who verified it', () => {
    const file = join(dataDir, 'nodes', 'people.json')
    const [id] = unverifiedPeople()
    const before = readFileSync(file, 'utf8').split('\n')

    expect(setVerified(dataDir, 'node', id, true)).toBe(file)

    const after = readFileSync(file, 'utf8').split('\n')
    expect(read(file).find((node) => node.id === id)).toMatchObject({ verified: true, verifiedBy: 'person' })
    expect(after.length).toBe(before.length + 1)
    // Only the record's own lines change: `verified` flips and `verifiedBy` is added
    const firstChange = after.findIndex((line, index) => line !== before[index])
    const lastChange = after.length - 1 - [...after].reverse().findIndex((line, index) => line !== before[before.length - 1 - index])
    const changed = after.slice(firstChange, lastChange + 1).map((line) => line.trim())
    expect(changed.some((line) => line.startsWith('"verified": true'))).toBe(true)
    expect(changed.some((line) => line.startsWith('"verifiedBy": "person"'))).toBe(true)
    expect(after.slice(0, firstChange)).toEqual(before.slice(0, firstChange))
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

  it('records who verified a record and clears it again on undo', () => {
    const file = join(dataDir, 'nodes', 'people.json')
    const original = readFileSync(file, 'utf8')
    const [id] = unverifiedPeople()

    setVerified(dataDir, 'node', id, true, 'jev')
    expect(read(file).find((node) => node.id === id)).toMatchObject({ verified: true, verifiedBy: 'jev' })
    setVerified(dataDir, 'node', id, false)
    expect(readFileSync(file, 'utf8')).toBe(original)
  })

  it('verifies many records in one pass and can undo exactly those', () => {
    const before = readGraph(dataDir)
    const people = unverifiedPeople().slice(0, 2)
    const wanted = new Set([...people.map((id) => `node:${id}`), `edge:${unverifiedEdge()}`])
    const isWanted = (kind: string, record: { id: string }) => wanted.has(`${kind}:${record.id}`)

    expect(setVerifiedWhere(dataDir, isWanted, true, 'jev')).toBe(3)
    const after = readGraph(dataDir)
    for (const id of people) {
      expect(after.nodes.find((node) => node.id === id)).toMatchObject({ verified: true, verifiedBy: 'jev' })
    }
    const verifiedCount = (graph: typeof after) => [...graph.nodes, ...graph.edges].filter((record) => record.verified).length
    expect(verifiedCount(after)).toBe(verifiedCount(before) + 3)

    // Already-verified records are left alone, so a second pass changes nothing
    expect(setVerifiedWhere(dataDir, isWanted, true, 'jev')).toBe(0)
    expect(setVerifiedWhere(dataDir, isWanted, false, 'jev')).toBe(3)
    expect(readGraph(dataDir)).toEqual(before)
  })

  it('returns null for an unknown id and does not look for nodes among edges', () => {
    expect(setVerified(dataDir, 'node', 'nobody', true)).toBeNull()
    expect(setVerified(dataDir, 'edge', 'david-lett', true)).toBeNull()
  })
})

describe('addConnection', () => {
  const connection = {
    edge: { source: 'dan-diephouse', target: 'jeanne-feldkamp', type: 'family' as const, role: 'spouse' },
    text: 'Dan and  Jeanne are married',
    contributor: 'Test Person',
    date: new Date(2026, 9, 13),
  }

  // The real data may already hold this relationship, in which case new records are numbered
  const base = 'dan-diephouse--family--jeanne-feldkamp'
  const nextId = () => {
    const taken = readGraph(dataDir).edges.filter((edge) => edge.id.startsWith(base)).length
    return taken === 0 ? base : `${base}-${taken + 1}`
  }

  it('appends one unverified record that cites the contributor and the sentence', () => {
    const before = readGraph(dataDir).edges.length
    const expectedId = nextId()
    const { edge: record, node: created } = addConnection(dataDir, connection)

    expect(created).toBeUndefined()
    expect(record).toMatchObject({
      id: expectedId,
      role: 'spouse',
      verified: false,
      sources: [{ title: 'Added by Test Person, 13 October 2026: "Dan and Jeanne are married"' }],
    })
    const edges = readGraph(dataDir).edges
    expect(edges.length).toBe(before + 1)
    expect(edges[edges.length - 1]).toEqual(record)
  })

  it('leaves every existing line of the file as it was', () => {
    const file = join(dataDir, 'edges.json')
    const before = readFileSync(file, 'utf8')
    addConnection(dataDir, connection)
    // Only the closing of the previous record and the new record differ
    expect(readFileSync(file, 'utf8').startsWith(before.slice(0, before.lastIndexOf('}')))).toBe(true)
  })

  it('cites the URL when one is given, and numbers a repeated relationship', () => {
    addConnection(dataDir, connection)
    const expectedId = nextId()
    const { edge: second } = addConnection(dataDir, { ...connection, sourceUrl: 'https://example.com/wedding' })
    expect(second.id).toBe(expectedId)
    expect(second.id).toMatch(/-\d+$/)
    expect(second.sources[0].url).toBe('https://example.com/wedding')
  })

  it('creates the other party as a new unverified node when the graph lacks it', () => {
    const { edge, node: created } = addConnection(dataDir, {
      edge: { source: 'corollary-wines', target: 'placeholder', type: 'sources_from' },
      newNode: { id: 'placeholder', name: "Winter's  Hill", type: 'vineyard' },
      text: "Corollary Wines sources fruit from Winter's Hill",
      contributor: 'Test Person',
      date: new Date(2026, 9, 13),
    })

    expect(created).toMatchObject({ id: 'winters-hill', type: 'vineyard', name: "Winter's Hill", verified: false })
    expect(edge).toMatchObject({ id: 'corollary-wines--sources-from--winters-hill', target: 'winters-hill' })
    const graph = readGraph(dataDir)
    expect(graph.nodes.find((candidate) => candidate.id === 'winters-hill')).toEqual(created)
    const vineyards = readFileSync(join(dataDir, 'nodes', 'vineyards.json'), 'utf8')
    expect(vineyards.startsWith(readFileSync(join(realDataDir, 'nodes', 'vineyards.json'), 'utf8').slice(0, -4))).toBe(true)
  })

  it('refuses a new node whose type the relationship does not allow, writing nothing', () => {
    const before = readFileSync(join(dataDir, 'nodes', 'people.json'), 'utf8')
    expect(() =>
      addConnection(dataDir, {
        edge: { source: 'corollary-wines', target: 'placeholder', type: 'sources_from' },
        newNode: { id: 'placeholder', name: 'Somebody New', type: 'person' },
        text: 'x',
        contributor: 'Test Person',
        date: new Date(2026, 9, 13),
      }),
    ).toThrow(/cannot point to a person/)
    expect(readFileSync(join(dataDir, 'nodes', 'people.json'), 'utf8')).toBe(before)
  })

  it('writes nothing when the record breaks the graph rules', () => {
    const file = join(dataDir, 'edges.json')
    const original = readFileSync(file, 'utf8')
    const bad = { ...connection, edge: { source: 'dan-diephouse', target: 'jeanne-feldkamp', type: 'sources_from' as const } }
    expect(() => addConnection(dataDir, bad)).toThrow(/cannot start from a person/)
    expect(() => addConnection(dataDir, { ...connection, edge: { ...connection.edge, target: 'nobody' } })).toThrow()
    expect(readFileSync(file, 'utf8')).toBe(original)
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
