import { EDGE_CATEGORIES, EDGE_CATEGORY_LABELS, EDGE_RULES, type EdgeCategory, type Graph, type GraphNode } from '../data/schema'
import { cardParts, formatYears, HIDDEN_TYPES, nodeYears, SINGULAR_TYPE } from '../graph/format'
import { focusRecords, type GuideView, VIEWS } from '../graph/views'

// What search engines and link previews read for each record: a page at /<id> with its own
// title, description, share tags and structured data, and its facts as plain HTML. The
// build writes one per record (tools/seo/prerender.ts); the app replaces the HTML when it
// starts. Pure functions, with no browser globals, so the build and the tests can use them.

export const SITE = 'https://oregonwine.app'
export const SITE_NAME = 'Oregon Wine Graph'
export const SITE_DESCRIPTION =
  'Explore the people, wineries and vineyards of Oregon wine, and how they connect: who founded what, who made the wine, where the fruit came from, and how its people are related.'
const SHARE_IMAGE = `${SITE}/og.png`
const DESCRIPTION_LIMIT = 155

export const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export const recordUrl = (id: string) => `${SITE}/${id}`
// Guides live under their own folder, so no record id can collide with one, and readers'
// own guides can join them later: /guides/<guide>, and /guides/<guide>/<record> with a
// record open in it
export const GUIDES_PATH = 'guides'
export const guidePath = (view: string, record?: string) => `/${GUIDES_PATH}/${view}${record ? `/${record}` : ''}`
export const guideUrl = (view: string) => `${SITE}${guidePath(view)}`
export const recordTitle = (node: GraphNode) => `${node.name} · ${SITE_NAME}`

// A summary short enough for a search result, cut at a word with an ellipsis
export function describe(summary: string, limit = DESCRIPTION_LIMIT): string {
  const text = summary.replace(/\s+/g, ' ').trim()
  if (text.length <= limit) return text
  const cut = text.slice(0, limit - 1)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), limit / 2)).replace(/[\s,;:.–-]+$/, '')}…`
}

// The record pages: every record the site shows
export const shownRecords = (graph: Graph) => graph.nodes.filter((node) => !HIDDEN_TYPES.has(node.type))

interface HeadTags {
  title: string
  description: string
  url: string
  type: 'website' | 'profile' | 'place' | 'article'
  jsonLd: object
}

// The <head> tags that set a page apart: its description, address and share preview
export function headTags({ description, url, type, title, jsonLd }: HeadTags): string {
  const safe = { description: escapeHtml(description), url: escapeHtml(url), title: escapeHtml(title) }
  return [
    `<meta name="description" content="${safe.description}" />`,
    `<link rel="canonical" href="${safe.url}" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:type" content="${type}" />`,
    `<meta property="og:title" content="${safe.title}" />`,
    `<meta property="og:description" content="${safe.description}" />`,
    `<meta property="og:url" content="${safe.url}" />`,
    `<meta property="og:image" content="${SHARE_IMAGE}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${SITE_NAME}: a glass of claret in front of the state of Oregon" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    // "<" escaped so no text in the data can end the script element
    `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`,
  ].join('\n    ')
}

const website = { '@type': 'WebSite', name: SITE_NAME, url: `${SITE}/` }

export function homeHead(): string {
  return headTags({
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: `${SITE}/`,
    type: 'website',
    jsonLd: { '@context': 'https://schema.org', ...website, description: SITE_DESCRIPTION },
  })
}

// schema.org's nearest type for each kind of record
const SCHEMA_TYPE: Record<GraphNode['type'], string> = {
  person: 'Person',
  winery: 'Winery',
  vineyard: 'Place',
  ava: 'Place',
  organization: 'Organization',
  event: 'Event',
}

function structuredData(node: GraphNode): object {
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': SCHEMA_TYPE[node.type],
    '@id': recordUrl(node.id),
    name: node.name,
    url: recordUrl(node.id),
    description: node.summary,
    isPartOf: website,
  }
  if (node.aka?.length) data.alternateName = node.aka
  if ('address' in node && node.address) data.address = node.address
  if ('coordinates' in node && node.coordinates) {
    data.geo = { '@type': 'GeoCoordinates', latitude: node.coordinates.lat, longitude: node.coordinates.lng }
  }
  if ((node.type === 'winery' || node.type === 'organization') && node.founded) data.foundingDate = String(node.founded)
  if (node.type === 'person') {
    if (node.born) data.birthDate = String(node.born)
    if (node.died) data.deathDate = String(node.died)
  }
  return data
}

// A record's connections, by category, as the card shows them: "Adelsheim Vineyard
// (founded, from 1971)". Connections to hidden records are left out, as on the card
function connectionGroups(graph: Graph, node: GraphNode) {
  const byId = new Map(graph.nodes.map((other) => [other.id, other]))
  const groups = new Map<EdgeCategory, { other: GraphNode; about: string }[]>()
  for (const edge of graph.edges) {
    const outgoing = edge.source === node.id
    if (!outgoing && edge.target !== node.id) continue
    const other = byId.get(outgoing ? edge.target : edge.source)
    if (!other || HIDDEN_TYPES.has(other.type)) continue
    const { verb, detail } = cardParts(edge, outgoing)
    const about = [[verb, detail].filter(Boolean).join(': '), formatYears(edge)].filter(Boolean).join(', ')
    const category = EDGE_RULES[edge.type].category
    groups.set(category, [...(groups.get(category) ?? []), { other, about }])
  }
  return EDGE_CATEGORIES.filter((category) => groups.has(category)).map((category) => ({
    label: EDGE_CATEGORY_LABELS[category],
    connections: groups.get(category)!,
  }))
}

// The record as plain HTML, inside the app's mount point until the app replaces it
function article(graph: Graph, node: GraphNode): string {
  const type = SINGULAR_TYPE[node.type]
  const facts = [type.charAt(0).toUpperCase() + type.slice(1), nodeYears(node), 'place' in node ? node.place : '']
    .filter(Boolean)
    .join(' · ')
  const lines = [
    `<article class="record-page">`,
    `<h1>${escapeHtml(node.name)}</h1>`,
    `<p>${escapeHtml(facts)}</p>`,
  ]
  if (node.aka?.length) lines.push(`<p>Also known as ${escapeHtml(node.aka.join(', '))}</p>`)
  if ('address' in node && node.address) lines.push(`<p>Visit: ${escapeHtml(node.address)}</p>`)
  lines.push(`<p>${escapeHtml(node.summary)}</p>`)
  for (const group of connectionGroups(graph, node)) {
    lines.push(`<h2>${escapeHtml(group.label)}</h2>`, '<ul>')
    for (const { other, about } of group.connections) {
      lines.push(`<li><a href="/${other.id}">${escapeHtml(other.name)}</a>${about ? ` (${escapeHtml(about)})` : ''}</li>`)
    }
    lines.push('</ul>')
  }
  lines.push('<h2>Sources</h2>', '<ul>')
  for (const source of node.sources) {
    const title = escapeHtml(source.title)
    lines.push(`<li>${source.url ? `<a href="${escapeHtml(source.url)}" rel="nofollow noopener">${title}</a>` : title}</li>`)
  }
  lines.push('</ul>', `<p><a href="/">Explore the ${SITE_NAME}</a></p>`, '</article>')
  return lines.join('\n')
}

export interface RecordPage {
  title: string
  head: string
  body: string
}

export function recordPage(graph: Graph, node: GraphNode): RecordPage {
  const title = recordTitle(node)
  return {
    title,
    head: headTags({
      title,
      description: describe(node.summary),
      url: recordUrl(node.id),
      type: node.type === 'person' ? 'profile' : node.type === 'vineyard' || node.type === 'ava' ? 'place' : 'website',
      jsonLd: structuredData(node),
    }),
    body: article(graph, node),
  }
}

// A guide's page, at /guides/<id>: its title and blurb, and for a guide with a focus, the
// records it picks, as links to their own pages. The app replaces it when it starts
export function guidePage(graph: Graph, view: GuideView): RecordPage {
  const title = `${view.title} · ${SITE_NAME}`
  const lines = [`<article class="record-page">`, `<h1>${escapeHtml(view.title)}</h1>`, `<p>${escapeHtml(view.blurb)}</p>`]
  if (view.focus) {
    const { core } = focusRecords(graph, view.focus)
    const picked = shownRecords(graph)
      .filter((node) => core.has(node.id))
      .sort((a, b) => a.name.localeCompare(b.name))
    lines.push('<ul>', ...picked.map((node) => `<li><a href="/${node.id}">${escapeHtml(node.name)}</a></li>`), '</ul>')
  }
  lines.push(`<p><a href="/">Explore the ${SITE_NAME}</a></p>`, '</article>')
  return {
    title,
    head: headTags({
      title,
      description: describe(view.blurb),
      url: guideUrl(view.id),
      type: 'website',
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: view.title,
        description: view.blurb,
        url: guideUrl(view.id),
        isPartOf: website,
      },
    }),
    body: lines.join('\n'),
  }
}

// Every page, for search engines to find: the home page and each record's
export function sitemap(graph: Graph, date: string): string {
  const urls = [`${SITE}/`, ...VIEWS.map((view) => guideUrl(view.id)), ...shownRecords(graph).map((node) => recordUrl(node.id))]
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((url) => `  <url><loc>${escapeHtml(url)}</loc><lastmod>${date}</lastmod></url>`),
    '</urlset>',
    '',
  ].join('\n')
}

// The page in the built site's HTML: its title, its head tags and its article in place
export function fillTemplate(template: string, page: { title: string; head: string; body?: string }): string {
  const title = `<title>${escapeHtml(page.title)}</title>`
  if (!/<title>[^<]*<\/title>/.test(template) || !template.includes('</head>') || !template.includes('<div id="app"></div>')) {
    throw new Error('The built index.html is missing its <title>, </head> or <div id="app"></div>')
  }
  return template
    .replace(/<title>[^<]*<\/title>/, `${title}\n    ${page.head}`)
    .replace('<div id="app"></div>', `<div id="app">${page.body ? `\n${page.body}\n` : ''}</div>`)
}
