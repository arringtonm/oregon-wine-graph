// After `vite build`: a page for each record (dist/<id>.html, served at /<id>), one for each
// guide (dist/guides/<id>.html, served at /guides/<id>), the home
// page's description and share tags, and the sitemap, so search engines can find and read
// every record, and shared links preview properly. See src/seo/recordPage.ts.
// Run as part of `npm run build`.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, parse, resolve } from 'node:path'
import { loadGraph } from '../../src/data'
import { VIEWS } from '../../src/graph/views'
import { fillTemplate, GUIDES_PATH, guidePage, homeHead, recordPage, shownRecords, SITE_NAME, sitemap } from '../../src/seo/recordPage'

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
    // The guides' folder is the site's too
    [...readdirSync(dist), GUIDES_PATH],
  )
  if (problems.length > 0) throw new Error(`Record ids clash with the site's own files: ${problems.join(', ')}`)

  for (const node of records) writeFileSync(join(dist, `${node.id}.html`), fillTemplate(template, recordPage(graph, node)))
  mkdirSync(join(dist, GUIDES_PATH), { recursive: true })
  for (const view of VIEWS) writeFileSync(join(dist, GUIDES_PATH, `${view.id}.html`), fillTemplate(template, guidePage(graph, view)))
  writeFileSync(indexFile, fillTemplate(template, { title: SITE_NAME, head: homeHead() }))
  writeFileSync(join(dist, 'sitemap.xml'), sitemap(graph, new Date().toISOString().slice(0, 10)))
  console.log(
    `Wrote ${records.length} record pages, ${VIEWS.length} guide pages and a sitemap of ${records.length + VIEWS.length + 1} addresses`,
  )
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
