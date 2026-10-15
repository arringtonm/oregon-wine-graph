// After `vite build`: a page for each record (dist/<id>.html, served at /<id>), the home
// page's description and share tags, and the sitemap, so search engines can find and read
// every record, and shared links preview properly. See src/seo/recordPage.ts.
// Run as part of `npm run build`.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, parse, resolve } from 'node:path'
import { loadGraph } from '../../src/data'
import { fillTemplate, homeHead, recordPage, shownRecords, SITE_NAME, sitemap } from '../../src/seo/recordPage'

const dist = resolve('dist')

// A record id that would overwrite one of the site's own files, or be shadowed by one
export function clashes(ids: string[], files: string[]): string[] {
  const taken = new Set(files.map((file) => parse(file).name))
  return ids.filter((id) => taken.has(id))
}

async function main() {
  const indexFile = join(dist, 'index.html')
  if (!existsSync(indexFile)) throw new Error('Run `vite build` first: dist/index.html is missing')
  const template = readFileSync(indexFile, 'utf8')
  const graph = await loadGraph()
  const records = shownRecords(graph)

  const problems = clashes(
    records.map((node) => node.id),
    readdirSync(dist),
  )
  if (problems.length > 0) throw new Error(`Record ids clash with the site's own files: ${problems.join(', ')}`)

  for (const node of records) writeFileSync(join(dist, `${node.id}.html`), fillTemplate(template, recordPage(graph, node)))
  writeFileSync(indexFile, fillTemplate(template, { title: SITE_NAME, head: homeHead() }))
  writeFileSync(join(dist, 'sitemap.xml'), sitemap(graph, new Date().toISOString().slice(0, 10)))
  console.log(`Wrote ${records.length} record pages and a sitemap of ${records.length + 1} addresses`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
