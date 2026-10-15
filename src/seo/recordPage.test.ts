import { beforeAll, describe, expect, it } from 'vitest'
import { loadGraph } from '../data'
import type { Graph, GraphNode } from '../data/schema'
import { clashes } from '../../tools/seo/prerender'
import { describe as summarise, escapeHtml, fillTemplate, recordPage, shownRecords, sitemap } from './recordPage'

let graph: Graph
const node = (id: string) => graph.nodes.find((record) => record.id === id)!
beforeAll(async () => {
  graph = await loadGraph()
})

describe('a record’s page', () => {
  it('has its own title, description, address and share tags', () => {
    const page = recordPage(graph, node('david-lett'))
    expect(page.title).toBe('David Lett · Oregon Wine Graph')
    expect(page.head).toContain('<link rel="canonical" href="https://oregonwine.app/david-lett" />')
    expect(page.head).toContain('<meta property="og:title" content="David Lett · Oregon Wine Graph" />')
    expect(page.head).toContain('<meta property="og:image" content="https://oregonwine.app/og.png" />')
    expect(page.head).toMatch(/<meta name="description" content="Moved to Oregon in 1965[^"]*" \/>/)
  })

  it('marks each kind of record with its schema.org type', () => {
    const type = (id: string) => JSON.parse(recordPage(graph, node(id)).head.match(/ld\+json">(.*)<\/script>/)![1])['@type']
    expect(type('david-lett')).toBe('Person')
    expect(type('the-eyrie-vineyards')).toBe('Winery')
    expect(type('temperance-hill-vineyard')).toBe('Place')
    expect(type('method-oregon')).toBe('Organization')
  })

  it('links each connection to that record’s own page', () => {
    const { body } = recordPage(graph, node('david-lett'))
    expect(body).toContain('<a href="/the-eyrie-vineyards">The Eyrie Vineyards</a> (founded, from 1966)')
    expect(body).toContain('<h2>Family &amp; mentorship</h2>')
  })

  it('escapes text from the data', () => {
    const tricky = { ...node('david-lett'), name: 'Fish & "Chips" <b>', summary: 'A & B' } as GraphNode
    const page = recordPage(graph, tricky)
    expect(page.body).toContain('<h1>Fish &amp; &quot;Chips&quot; &lt;b&gt;</h1>')
    expect(page.head).not.toContain('<b>')
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;')
  })

  it('cuts a long summary at a word, short enough for a search result', () => {
    const text = summarise('word '.repeat(60))
    expect(text.length).toBeLessThanOrEqual(155)
    expect(text.endsWith('word…')).toBe(true)
    expect(summarise('Short and complete.')).toBe('Short and complete.')
  })

  it('goes into the built page in place of the home page’s title and empty mount', () => {
    const page = fillTemplate('<html><head><title>Oregon Wine Graph</title></head><body><div id="app"></div></body></html>', {
      title: 'X · Oregon Wine Graph',
      head: '<meta name="x" />',
      body: '<article>X</article>',
    })
    expect(page).toContain('<title>X · Oregon Wine Graph</title>\n    <meta name="x" />')
    expect(page).toContain('<div id="app">\n<article>X</article>\n</div>')
    expect(() => fillTemplate('<html></html>', { title: 'X', head: '' })).toThrow()
  })
})

describe('the sitemap', () => {
  it('lists the home page and every record the site shows, and no hidden ones', () => {
    const xml = sitemap(graph, '2026-10-15')
    expect(xml.match(/<url>/g)!.length).toBe(shownRecords(graph).length + 1)
    expect(xml).toContain('<loc>https://oregonwine.app/david-lett</loc><lastmod>2026-10-15</lastmod>')
    const event = graph.nodes.find((record) => record.type === 'event')
    if (event) expect(xml).not.toContain(`/${event.id}<`)
  })

  it('stops the build when a record id would clash with one of the site’s files', () => {
    expect(clashes(['david-lett', 'robots', 'og'], ['index.html', 'robots.txt', 'og.png', 'assets'])).toEqual(['robots', 'og'])
    expect(clashes(shownRecords(graph).map((record) => record.id), ['index.html', 'robots.txt', 'og.png', 'sitemap.xml', 'assets', 'favicon.svg', 'favicon-32.png', 'apple-touch-icon.png'])).toEqual([])
  })
})
