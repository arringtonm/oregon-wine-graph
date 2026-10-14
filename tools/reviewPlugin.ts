import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Plugin } from 'vite'

export type RecordKind = 'node' | 'edge'

// Data files are kept in exactly this form so a review only changes the lines it means to
export function formatRecords(records: unknown): string {
  return JSON.stringify(records, null, 2) + '\n'
}

// Sets `verified` on one record in the JSON data files. Returns the file changed, or null if the id is unknown.
export function setVerified(dataDir: string, kind: RecordKind, id: string, verified: boolean): string | null {
  const nodesDir = join(dataDir, 'nodes')
  const files =
    kind === 'edge'
      ? [join(dataDir, 'edges.json')]
      : readdirSync(nodesDir)
          .filter((name) => name.endsWith('.json'))
          .map((name) => join(nodesDir, name))

  for (const file of files) {
    const records = JSON.parse(readFileSync(file, 'utf8')) as { id: string; verified: boolean }[]
    const record = records.find((candidate) => candidate.id === id)
    if (!record) continue
    record.verified = verified
    writeFileSync(file, formatRecords(records))
    return file
  }
  return null
}

// Dev-server only: lets the app's review mode write approvals back to the data files
export function reviewPlugin(dataDir = resolve('src/data')): Plugin {
  const ownWrites = new Set<string>()
  return {
    name: 'oregon-wine-graph:review',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__review/verify', (req, res) => {
        // Requiring a JSON content type keeps other sites from posting here without a preflight
        if (req.method !== 'POST' || !req.headers['content-type']?.startsWith('application/json')) {
          res.statusCode = 405
          res.end()
          return
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', () => {
          try {
            const { kind, id, verified } = JSON.parse(body)
            if ((kind !== 'node' && kind !== 'edge') || typeof id !== 'string' || typeof verified !== 'boolean') {
              throw new Error('Malformed request')
            }
            const file = setVerified(dataDir, kind, id, verified)
            if (!file) {
              res.statusCode = 404
              res.end(`No ${kind} with id "${id}"`)
              return
            }
            ownWrites.add(file)
            res.setHeader('content-type', 'application/json')
            res.end('{"ok":true}')
          } catch (error) {
            res.statusCode = 400
            res.end(error instanceof Error ? error.message : 'Bad request')
          }
        })
      })
    },
    // The app already shows the change, so skip the reload its own write would trigger
    handleHotUpdate({ file }) {
      if (ownWrites.delete(file)) return []
    },
  }
}
