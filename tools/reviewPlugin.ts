import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join, resolve } from 'node:path'
import { loadEnv, type Plugin } from 'vite'
import {
  checkGraph,
  edgeSchema,
  graphSchema,
  nodeSchema,
  type Graph,
  type GraphEdge,
  type GraphNode,
  type NodeType,
  type VerifiedBy,
} from '../src/data/schema'
import { checkRecord } from './check/checkRecord'
import { claimsFingerprint, claimsFor, recordKey } from './check/claims'
import { evidenceFor, findRecord, removeEdge, updateEdge } from './check/edit'
import { readCached } from './check/fetchSources'
import { compact, CHECKS_FILE, readChecks, writeChecks } from './check/store'
import { addLocalFlag, readLocalFlags, resolveLocalFlag } from './flags/localStore'
import { readRemoteFlags, resolveRemoteFlag } from './flags/remoteStore'
import { askGraph, type AskOverride } from './jev/askGraph'
import { jevModel, stubModel } from './jev/model'
import { parseConnection, slugify, type ProposedEdge } from './jev/parseConnection'

export type RecordKind = 'node' | 'edge'

// Data files are kept in exactly this form so a review only changes the lines it means to
export function formatRecords(records: unknown): string {
  return JSON.stringify(records, null, 2) + '\n'
}

type StoredRecord = { id: string; verified: boolean; verifiedBy?: VerifiedBy }

function mark(record: StoredRecord, verified: boolean, by: VerifiedBy) {
  record.verified = verified
  if (verified) record.verifiedBy = by
  else delete record.verifiedBy
}

// Sets `verified` on one record in the JSON data files, noting who verified it.
// Returns the file changed, or null if the id is unknown.
export function setVerified(
  dataDir: string,
  kind: RecordKind,
  id: string,
  verified: boolean,
  by: VerifiedBy = 'person',
): string | null {
  const files = kind === 'edge' ? [join(dataDir, 'edges.json')] : nodeFiles(dataDir)

  for (const file of files) {
    const records = JSON.parse(readFileSync(file, 'utf8')) as StoredRecord[]
    const record = records.find((candidate) => candidate.id === id)
    if (!record) continue
    mark(record, verified, by)
    writeFileSync(file, formatRecords(records))
    return file
  }
  return null
}

// The same for many records at once, writing each file once. `matches` picks the records
// to change. Returns how many were changed.
export function setVerifiedWhere(
  dataDir: string,
  matches: (kind: RecordKind, record: StoredRecord) => boolean,
  verified: boolean,
  by: VerifiedBy,
): number {
  let changed = 0
  const files: [RecordKind, string][] = [
    ...nodeFiles(dataDir).map((file): [RecordKind, string] => ['node', file]),
    ['edge', join(dataDir, 'edges.json')],
  ]
  for (const [kind, file] of files) {
    const records = JSON.parse(readFileSync(file, 'utf8')) as StoredRecord[]
    const hits = records.filter((record) => record.verified !== verified && matches(kind, record))
    if (hits.length === 0) continue
    for (const record of hits) mark(record, verified, by)
    writeFileSync(file, formatRecords(records))
    changed += hits.length
  }
  return changed
}

function nodeFiles(dataDir: string): string[] {
  const nodesDir = join(dataDir, 'nodes')
  return readdirSync(nodesDir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => join(nodesDir, name))
}

export function readGraph(dataDir: string): Graph {
  return graphSchema.parse({
    nodes: nodeFiles(dataDir).flatMap((file) => JSON.parse(readFileSync(file, 'utf8'))),
    edges: JSON.parse(readFileSync(join(dataDir, 'edges.json'), 'utf8')),
  })
}

export const NODE_FILES: Record<NodeType, string> = {
  person: 'people.json',
  winery: 'wineries.json',
  vineyard: 'vineyards.json',
  ava: 'avas.json',
  organization: 'organizations.json',
  event: 'events.json',
}

export interface NewConnection {
  edge: ProposedEdge
  // A party the graph does not have yet. `id` is the placeholder the edge uses for it;
  // the stored id is derived from the name.
  newNode?: { id: string; name: string; type: NodeType }
  // The sentence the connection was parsed from
  text: string
  sourceUrl?: string
  contributor: string
  date: Date
}

// Appends a typed-in connection to edges.json as an unverified record, first adding the
// other party as a new node if the graph lacks it. Throws, writing nothing, if a record
// breaks the schema or the graph rules.
export function addConnection(
  dataDir: string,
  { edge, newNode, text, sourceUrl, contributor, date }: NewConnection,
): { edge: GraphEdge; node?: GraphNode } {
  const graph = readGraph(dataDir)
  const day = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const sentence = text.replace(/\s+/g, ' ').trim()
  const sources = [
    sourceUrl
      ? { title: `${sentence} (added by ${contributor}, ${day})`, url: sourceUrl }
      : { title: `Added by ${contributor}, ${day}: "${sentence}"` },
  ]

  let node: GraphNode | undefined
  if (newNode) {
    const name = newNode.name.replace(/\s+/g, ' ').trim()
    const id = slugify(name)
    if (!id) throw new Error('The new node needs a name')
    if (graph.nodes.some((existing) => existing.id === id)) throw new Error(`A node with id "${id}" already exists`)
    node = nodeSchema.parse({
      id,
      type: newNode.type,
      name,
      summary: `Added from the statement: "${sentence}".`,
      ...(newNode.type === 'organization' ? { kind: 'other' } : {}),
      sources,
      verified: false,
    })
    edge = {
      ...edge,
      source: edge.source === newNode.id ? id : edge.source,
      target: edge.target === newNode.id ? id : edge.target,
    }
  }
  const base = `${edge.source}--${edge.type.replace(/_/g, '-')}--${edge.target}`
  const taken = new Set(graph.edges.map((existing) => existing.id))
  let id = base
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`

  const record = edgeSchema.parse({ id, ...edge, sources, verified: false })
  const problems = checkGraph({ nodes: node ? [...graph.nodes, node] : graph.nodes, edges: [...graph.edges, record] })
  if (problems.length > 0) throw new Error(problems.join('; '))

  // Append to the records as stored, not as parsed, so existing lines are left untouched
  const append = (file: string, added: unknown) =>
    writeFileSync(file, formatRecords([...JSON.parse(readFileSync(file, 'utf8')), added]))
  if (node) append(join(dataDir, 'nodes', NODE_FILES[node.type]), node)
  append(join(dataDir, 'edges.json'), record)
  return { edge: record, node }
}

function contributorName(): string {
  try {
    return execFileSync('git', ['config', 'user.name'], { encoding: 'utf8' }).trim() || 'a contributor'
  } catch {
    return 'a contributor'
  }
}

// Dev-server only: lets the app write approvals and typed-in connections back to the data files
export function reviewPlugin(dataDir = resolve('src/data')): Plugin {
  const ownWrites = new Set<string>()

  // A POST route taking and returning JSON. Requiring a JSON content type keeps other
  // sites from posting here without a preflight.
  type Handler = (body: Record<string, unknown>) => unknown | Promise<unknown>
  const route = (handler: Handler) => (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== 'POST' || !req.headers['content-type']?.startsWith('application/json')) {
      res.statusCode = 405
      res.end()
      return
    }
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', async () => {
      try {
        const result = await handler(JSON.parse(body))
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify(result))
      } catch (error) {
        res.statusCode = 400
        res.end(error instanceof Error ? error.message : 'Bad request')
      }
    })
  }

  return {
    name: 'oregon-wine-graph:review',
    apply: 'serve',
    configureServer(server) {
      // Jev decides when a key is configured; until then keyword rules stand in for it
      const apiKey = loadEnv(server.config.mode, server.config.root, '').JEV_API_KEY
      const model = apiKey ? jevModel(apiKey) : stubModel()

      server.middlewares.use(
        '/__review/verify',
        route(({ kind, id, verified }) => {
          if ((kind !== 'node' && kind !== 'edge') || typeof id !== 'string' || typeof verified !== 'boolean') {
            throw new Error('Malformed request')
          }
          const file = setVerified(dataDir, kind, id, verified)
          if (!file) throw new Error(`No ${kind} with id "${id}"`)
          ownWrites.add(file)
          return { ok: true }
        }),
      )

      // Checks one record against its sources again, after it has been edited
      const recheck = async (kind: RecordKind, id: string) => {
        const item = findRecord(dataDir, kind, id)
        if (!item || model.name !== 'jev') return null
        const graph = readGraph(dataDir)
        const stored = {
          fingerprint: claimsFingerprint(claimsFor(item, graph)),
          checkedAt: new Date().toISOString().slice(0, 10),
          sources: compact(await checkRecord(item, graph, model, readCached)),
        }
        const store = readChecks()
        store[recordKey(item)] = stored
        writeChecks(store)
        ownWrites.add(CHECKS_FILE)
        return stored
      }
      const recordRef = ({ kind, id }: Record<string, unknown>) => {
        if ((kind !== 'node' && kind !== 'edge') || typeof id !== 'string') throw new Error('Malformed request')
        return { kind: kind as RecordKind, id }
      }

      server.middlewares.use(
        '/__review/evidence',
        route((body) => {
          const { kind, id } = recordRef(body)
          const item = findRecord(dataDir, kind, id)
          if (!item) throw new Error(`No ${kind} with id "${id}"`)
          return evidenceFor(dataDir, item, readCached)
        }),
      )

      server.middlewares.use(
        '/__review/remove-edge',
        route(({ id }) => {
          if (typeof id !== 'string' || !removeEdge(dataDir, id)) throw new Error('No such connection')
          ownWrites.add(join(dataDir, 'edges.json'))
          return { ok: true }
        }),
      )

      server.middlewares.use(
        '/__review/update-edge',
        route(async ({ id, changes }) => {
          if (typeof id !== 'string' || typeof changes !== 'object' || changes === null) throw new Error('Malformed request')
          const edge = updateEdge(dataDir, id, changes)
          ownWrites.add(join(dataDir, 'edges.json'))
          return { edge, check: await recheck('edge', id) }
        }),
      )

      // Flags from readers: sent here (kept locally) or on the published site (in D1).
      // Add one locally, list both, resolve one wherever it is kept
      server.middlewares.use('/__flags/add', route((body) => addLocalFlag(body)))
      server.middlewares.use(
        '/__flags/list',
        route(async () => [...readLocalFlags(), ...(await readRemoteFlags())]),
      )
      server.middlewares.use(
        '/__flags/resolve',
        route(async ({ id }) => {
          if (typeof id !== 'string') throw new Error('Unknown flag')
          if (!resolveLocalFlag(id)) await resolveRemoteFlag(id)
          return { resolved: id }
        }),
      )

      // The layout of the default view, saved so the app and the published site can show it
      // without laying the graph out again. Only positions, rounded; nothing else changes.
      server.middlewares.use(
        '/__layout',
        route(({ version, positions }) => {
          if (typeof positions !== 'object' || positions === null) throw new Error('Malformed request')
          const entries = Object.entries(positions as Record<string, unknown>)
          if (!entries.every(([, point]) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite))) {
            throw new Error('Malformed positions')
          }
          const file = join(dataDir, 'layout.json')
          // One node per line, so a changed layout reads as a short diff
          const lines = entries.map(([id, point]) => `  ${JSON.stringify(id)}: ${JSON.stringify(point)}`)
          writeFileSync(file, `{\n "version": ${JSON.stringify(version)},\n "positions": {\n${lines.join(',\n')}\n }\n}\n`)
          ownWrites.add(file)
          return { saved: entries.length }
        }),
      )

      // A question about the graph, read by Jev and answered from the records
      server.middlewares.use(
        '/__ask',
        route(({ question, override }) => {
          if (typeof question !== 'string' || !question.trim()) throw new Error('Malformed request')
          return askGraph(question.trim(), readGraph(dataDir), model, (override ?? undefined) as AskOverride | undefined)
        }),
      )

      server.middlewares.use(
        '/__contribute/parse',
        route(({ text, contextId }) => {
          if (typeof text !== 'string' || !text.trim() || typeof contextId !== 'string') {
            throw new Error('Malformed request')
          }
          return parseConnection(text, contextId, readGraph(dataDir), model)
        }),
      )

      server.middlewares.use(
        '/__contribute/add',
        route(({ edge, newNode, text, sourceUrl }) => {
          if (typeof edge !== 'object' || edge === null || typeof text !== 'string') throw new Error('Malformed request')
          const added = addConnection(dataDir, {
            edge: edge as ProposedEdge,
            newNode: (newNode ?? undefined) as NewConnection['newNode'],
            text,
            sourceUrl: typeof sourceUrl === 'string' && sourceUrl.trim() ? sourceUrl.trim() : undefined,
            contributor: contributorName(),
            date: new Date(),
          })
          ownWrites.add(join(dataDir, 'edges.json'))
          if (added.node) ownWrites.add(join(dataDir, 'nodes', NODE_FILES[added.node.type]))
          return added
        }),
      )
    },
    // The app already shows the change, so skip the reload its own write would trigger
    handleHotUpdate({ file }) {
      if (ownWrites.delete(file)) return []
    },
  }
}
