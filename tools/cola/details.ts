// Stage 2 of the COLA harvest: fetches the printable form of every approval cola:search
// found (brand, fanciful name, varietals, appellation, permit holder, label image names).
// Approvals filed electronically only: paper filings and older records have no printable form.
// Cached under .cache/cola/forms/, so a stopped run resumes.
// Run with: npm run cola:details [-- --only audeant,the-eyrie-vineyards]
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readGraph } from '../reviewPlugin'
import { CACHE_DIR, hasForm, Registry } from './registry'
import { readWineries } from './search'

async function main() {
  const index = process.argv.indexOf('--only')
  const only = index === -1 ? undefined : process.argv[index + 1].split(',')
  // Wineries outside Oregon are left out: their approvals are mostly import labels for wines
  // made elsewhere, which say nothing about Oregon vineyards
  const outside = new Set(readGraph(resolve('src/data')).nodes.filter((node) => node.outsideOregon).map((node) => node.id))
  const wineries = Object.entries(readWineries()).filter(([id]) => (!only || only.includes(id)) && !outside.has(id))
  // Only electronic filings have a form to fetch (see hasForm)
  // Wineries take turns, newest approvals first, so a run stopped at any point has covered
  // every winery's recent labels. Ids begin with a two-digit year ("99" is 1999, "25" is 2025)
  const filed = (id: string) => `${Number(id.slice(0, 2)) < 50 ? '20' : '19'}${id}`
  const queues = wineries.map(([, found]) =>
    found.ttbIds.filter(hasForm).sort((a, b) => filed(b).localeCompare(filed(a))),
  )
  const ids: string[] = []
  const seen = new Set<string>()
  for (let round = 0; queues.some((queue) => round < queue.length); round++) {
    for (const queue of queues) {
      const id = queue[round]
      if (id && !seen.has(id)) {
        seen.add(id)
        ids.push(id)
      }
    }
  }
  const pending = ids.filter((id) => !existsSync(join(CACHE_DIR, 'forms', `${id}.json`)))
  console.log(`${ids.length} approvals, ${pending.length} forms to fetch (about ${Math.ceil((pending.length * 2) / 60)} minutes)`)

  const registry = new Registry()
  let done = 0
  for (const id of pending) {
    try {
      await registry.form(id)
    } catch (error) {
      // A form the registry won't show is skipped; repeated network failures still stop the run
      if (!String(error).includes('did not load')) throw error
      console.log(`  ${error instanceof Error ? error.message : error}`)
    }
    if (++done % 100 === 0) console.log(`  ${done}/${pending.length}`)
  }
  console.log(`${registry.requests} requests`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
