import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { loadGraph } from '../../src/data'
import type { Answer, DecisionModel } from '../jev/model'
import { checkRecord } from './checkRecord'
import { claimsFingerprint, claimsFor, splitSentences } from './claims'
import { decide, type SourceCheck } from './decide'
import { htmlToText, methodTrailHtml, type CachedSource } from './fetchSources'
import { catalogueLines, extractPassages, nameVariants } from './passages'

const graph = await loadGraph()
const edge = (id: string) => ({ kind: 'edge' as const, record: graph.edges.find((candidate) => candidate.id === id)! })
const node = (id: string) => ({ kind: 'node' as const, record: graph.nodes.find((candidate) => candidate.id === id)! })

describe('claimsFor', () => {
  it('offers every relationship the two ends could have', () => {
    const claims = claimsFor(edge('david-lett--founded--the-eyrie-vineyards'), graph)
    expect(claims.relationships?.own).toBe('founded')
    expect(claims.relationships?.options.founded).toBe('David Lett founded The Eyrie Vineyards.')
    expect(claims.relationships?.options.worked_at).toBe('David Lett worked at The Eyrie Vineyards.')
  })

  it('states a connection and each dated detail separately', () => {
    const claims = claimsFor(edge('jason-lett--winemaker--the-eyrie-vineyards'), graph)
    expect(claims.main).toBe('Jason Lett winemaker at The Eyrie Vineyards.')
    expect(claims.details.startYear).toContain('starting in 2005')
    expect(claims.details.role).toContain('also vineyard manager')
    expect(claims.parties[0]).toContain('Jason Lett')
    expect(claims.parties[1]).toContain('Eyrie')
  })

  it('phrases family ties by role', () => {
    expect(claimsFor(edge('david-lett--family--jason-lett'), graph).main).toBe('David Lett is a parent of Jason Lett.')
    expect(claimsFor(edge('david-lett--family--diana-lett'), graph).main).toBe('David Lett is the spouse of Diana Lett.')
  })

  it('checks a node on each sentence of its summary and its dates', () => {
    const record = { ...node('david-lett').record, summary: 'Founded The Eyrie Vineyards. Planted Pinot noir in 1965.' }
    const claims = claimsFor({ kind: 'node', record }, graph)
    expect(claims.main).toBe('About David Lett: Founded The Eyrie Vineyards.')
    expect(claims.details).toEqual({
      born: 'David Lett was born in 1939.',
      died: 'David Lett died in 2008.',
      sentence2: 'About David Lett: Planted Pinot noir in 1965.',
    })
  })

  it('makes each year the sources give its own claim, any of which satisfies the detail', () => {
    const record = { ...edge('david-lett--founded--the-eyrie-vineyards').record, startYear: 1966, alsoDated: { startYear: [1965] } }
    const claims = claimsFor({ kind: 'edge', record }, graph)
    expect(claims.details).toMatchObject({
      startYear: 'David Lett founded The Eyrie Vineyards, starting in 1966.',
      'startYear@1965': 'David Lett founded The Eyrie Vineyards, starting in 1965.',
    })
    const only1965 = { url: 'https://example.com', status: 'read' as const, levels: [0, 0, 0, 1] as SourceCheck['levels'], details: { startYear: 0.1, 'startYear@1965': 0.95 } }
    expect(decide([only1965], Object.keys(claims.details), 0.9)).toMatchObject({ verdict: 'supported', failing: [] })
    expect(decide([{ ...only1965, details: { startYear: 0.1, 'startYear@1965': 0.2 } }], Object.keys(claims.details), 0.9).failing).toEqual(['startYear'])
  })

  it('splits sentences without breaking at abbreviations or initials', () => {
    expect(splitSentences('Bought by Ste. Michelle in 2006.')).toEqual(['Bought by Ste. Michelle in 2006.'])
    expect(splitSentences('Made by J. Christopher near Mt. Hood. Sold in 2006.')).toEqual([
      'Made by J. Christopher near Mt. Hood.',
      'Sold in 2006.',
    ])
  })

  it('changes fingerprint when what the record asserts changes', () => {
    const item = edge('david-lett--founded--the-eyrie-vineyards')
    const changed = { ...item, record: { ...item.record, startYear: 1971 } }
    expect(claimsFingerprint(claimsFor(changed, graph))).not.toBe(claimsFingerprint(claimsFor(item, graph)))
  })
})

describe('extractPassages', () => {
  const filler = 'Nothing relevant here. '.repeat(400)
  const page = `${filler}In 1966 David Lett and his wife Diana founded Eyrie in the Dundee Hills.${filler}Later, Lett handed over to his son.${filler}`

  it('keeps the parts of a long page that name the parties', () => {
    const passages = extractPassages(page, [['David Lett'], ['The Eyrie Vineyards', 'Eyrie']])
    expect(passages.mentioned).toEqual([true, true])
    expect(passages.text).toContain('founded Eyrie')
    expect(passages.text).toContain('handed over')
    expect(passages.text.length).toBeLessThan(page.length / 3)
  })

  it('reports a party the page never names', () => {
    expect(extractPassages(page, [['David Lett'], ['Ponzi Vineyards']]).mentioned).toEqual([true, false])
  })

  it('matches a business without its generic words and a person by surname, on word boundaries', () => {
    expect(nameVariants(['The Eyrie Vineyards'])).toContain('Eyrie')
    expect(nameVariants(['David Lett'])).toContain('Lett')
    expect(extractPassages('A letter arrived.', [['David Lett']]).mentioned).toEqual([false])
    expect(nameVariants(['Stoller Family Estate'])).not.toContain('Estate')
  })
})

describe('decide', () => {
  const read = (levels: SourceCheck['levels'], details: Record<string, number> = {}): SourceCheck => ({
    url: 'https://example.com',
    status: 'read',
    levels,
    details,
  })

  it('supports a record whose claim is stated and whose details all hold', () => {
    const decision = decide([read([0, 0, 0.1, 0.9], { startYear: 0.95 })], ['startYear'], 0.8)
    expect(decision).toMatchObject({ verdict: 'supported', support: 1, failing: [] })
  })

  it('lets different sources support different details', () => {
    const checks = [read([0, 0, 0, 1], { startYear: 0.9, endYear: 0.1 }), read([0, 0.9, 0.1, 0], { startYear: 0, endYear: 0.9 })]
    expect(decide(checks, ['startYear', 'endYear'], 0.8).verdict).toBe('supported')
  })

  it('is partial when the relationship holds but a detail does not', () => {
    const decision = decide([read([0, 0, 0, 1], { startYear: 0.2 })], ['startYear'], 0.8)
    expect(decision).toMatchObject({ verdict: 'partial', failing: ['startYear'] })
  })

  it('is a conflict when any source contradicts, even if another supports', () => {
    expect(decide([read([0, 0, 0, 1]), read([0.9, 0.1, 0, 0])], [], 0.8).verdict).toBe('conflict')
  })

  it('is unsupported when sources were read and none supports', () => {
    expect(decide([read([0, 0.9, 0.1, 0])], [], 0.8).verdict).toBe('unsupported')
    expect(decide([{ url: 'https://example.com', status: 'absent' }], [], 0.8).verdict).toBe('unsupported')
  })

  it('is unchecked, not unsupported, when no source could be read', () => {
    expect(decide([{ url: 'https://example.com', status: 'unreadable' }], [], 0.8).verdict).toBe('unchecked')
    expect(decide([], [], 0.8).verdict).toBe('unchecked')
  })

  it('does not count a source that describes a different relationship between the two', () => {
    const founded = (relationship: [number, number]): SourceCheck => ({ ...read([0, 0, 0, 1]), relationship })
    expect(decide([founded([0.8, 0.2])], [], 0.9).verdict).toBe('supported')
    // "worked at" read as "founded": the page describes a different relationship
    expect(decide([founded([0.1, 0.9])], [], 0.9).verdict).toBe('unsupported')
    // Two that both hold (founder and owner) split the answer; close enough still counts
    expect(decide([founded([0.45, 0.55])], [], 0.9).verdict).toBe('supported')
  })

  it('lets a combined reading support details but never the main claim or the shown source', () => {
    const combined: SourceCheck = { url: 'combined', status: 'read', medium: 'combined', details: { startYear: 0.95 } }
    expect(decide([read([0, 0, 0, 1], { startYear: 0.2 }), combined], ['startYear'], 0.9)).toMatchObject({
      verdict: 'supported',
      bestSource: 'https://example.com',
    })
    expect(decide([combined], ['startYear'], 0.9).verdict).toBe('unchecked')
  })

  it('holds a record supported only by label images to the image bar, and says so', () => {
    const image = (support: number): SourceCheck => ({ ...read([0, 1 - support, 0, support]), url: 'https://ttbonline.gov/a', medium: 'image' })
    expect(decide([image(0.92)], [], 0.9, 0.95).verdict).toBe('unsupported')
    expect(decide([image(0.97)], [], 0.9, 0.95)).toMatchObject({ verdict: 'supported', byImage: true })
    // A text source that clears its own bar is preferred, and the record isn't marked as image-only
    const decision = decide([image(0.97), read([0, 0.05, 0, 0.95])], [], 0.9, 0.95)
    expect(decision).toMatchObject({ verdict: 'supported', bestSource: 'https://example.com' })
    expect(decision.byImage).toBeUndefined()
  })
})

describe('checkRecord', () => {
  const item = edge('david-lett--founded--the-eyrie-vineyards')
  const urls = item.record.sources.map((source) => source.url!)
  const source = (status: CachedSource['status'], text = ''): CachedSource => ({ url: urls[0], status, fetchedAt: '', text })
  let asked: { state: string | Record<string, string>; ids: string[]; assets: string[] }[] = []
  const model: DecisionModel = {
    name: 'jev',
    async ask(state, questions, assets) {
      asked.push({ state, ids: Object.keys(questions), assets: Object.keys(assets ?? {}) })
      const answers: Record<string, Answer> = {}
      for (const [id, question] of Object.entries(questions)) {
        answers[id] =
          question.type === 'score'
            ? { type: 'score', score: 2.9, confidence: 0.9, probabilities: { '2': 0.1, '3': 0.9 } }
            : { type: 'noul', noul: 0.85 }
      }
      return answers
    },
  }

  it('asks about the main claim and each detail, and records the scores', async () => {
    asked = []
    const checks = await checkRecord(item, graph, model, () => source('ok', 'David Lett founded The Eyrie Vineyards in 1966.'))
    expect(asked[0].ids).toEqual(['main', 'detail_startYear', 'detail_startYear@1965', 'relationship'])
    expect(checks[0]).toMatchObject({ status: 'read', levels: [0, 0, 0.1, 0.9], details: { startYear: 0.85 } })
  })

  it('records whether each source states this relationship or only another', async () => {
    const chooser: DecisionModel = {
      name: 'jev',
      async ask(_state, questions) {
        const answers: Record<string, Answer> = {}
        for (const [id, question] of Object.entries(questions)) {
          if (question.type === 'choice') {
            expect(question.criteria.other).toContain('David Lett worked at The Eyrie Vineyards')
            answers[id] = { type: 'choice', choice: 'other', confidence: 0.8, probabilities: { own: 0.15, other: 0.8, none: 0.05 } }
          } else if (question.type === 'score') {
            answers[id] = { type: 'score', score: 3, confidence: 1, probabilities: { '3': 1 } }
          } else answers[id] = { type: 'noul', noul: 0.95 }
        }
        return answers
      },
    }
    const checks = await checkRecord(item, graph, chooser, () => source('ok', 'David Lett worked at The Eyrie Vineyards.'))
    expect(checks[0].relationship).toEqual([0.15, 0.8])
  })

  it('sends a label approval’s images with its text, even though the text names only one party', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'labels-'))
    const label = join(dir, 'label.png')
    await sharp({ create: { width: 300, height: 300, channels: 3, background: '#ffffff' } }).png().toFile(label)
    asked = []
    const approval = { ...source('ok', 'Brand name: THE EYRIE VINEYARDS.'), images: [label] }
    const checks = await checkRecord(item, graph, model, () => approval)
    expect(asked[0].assets).toEqual(['label-image-1'])
    expect(asked[0].state).toMatchObject({ text: 'Brand name: THE EYRIE VINEYARDS.', labels: 'label-image-1' })
    expect(checks[0]).toMatchObject({ status: 'read', medium: 'image' })
  })

  it('reads all the sources together for a detail no single source supports', async () => {
    asked = []
    const second = 'https://example.com/eyrie-history'
    const twoSources = { ...item, record: { ...item.record, sources: [...item.record.sources, { title: 'History', url: second }] } }
    const pages: Record<string, CachedSource> = {
      [urls[0]]: { url: urls[0], status: 'ok', fetchedAt: '', text: 'David Lett founded The Eyrie Vineyards.' },
      [second]: { url: second, status: 'ok', fetchedAt: '', text: 'The Eyrie Vineyards began in 1966, David Lett recalled.' },
    }
    const weak: DecisionModel = {
      name: 'jev',
      async ask(state, questions) {
        asked.push({ state, ids: Object.keys(questions), assets: [] })
        const answers: Record<string, Answer> = {}
        for (const [id, question] of Object.entries(questions)) {
          answers[id] =
            question.type === 'score'
              ? { type: 'score', score: 3, confidence: 0.9, probabilities: { '3': 1 } }
              : { type: 'noul', noul: typeof state === 'string' && state.includes('[Source 2]') ? 0.95 : 0.3 }
        }
        return answers
      },
    }
    const checks = await checkRecord(twoSources, graph, weak, (url) => pages[url] ?? null)
    expect(checks.at(-1)).toMatchObject({ url: 'combined', medium: 'combined', details: { startYear: 0.95 } })
    expect(asked.at(-1)!.ids).toEqual(['detail_startYear', 'detail_startYear@1965'])
  })

  it('does not ask the model about a page that names neither party or could not be read', async () => {
    asked = []
    expect((await checkRecord(item, graph, model, () => source('ok', 'A page about something else.')))[0].status).toBe('absent')
    expect((await checkRecord(item, graph, model, () => source('blocked')))[0].status).toBe('unreadable')
    expect((await checkRecord(item, graph, model, () => null))[0].status).toBe('unreadable')
    expect(asked).toEqual([])
  })
})

describe('htmlToText', () => {
  it('drops markup, scripts and styles and decodes entities', () => {
    const html = '<html><head><title>x</title><style>p{}</style></head><body><script>var a=1</script><p>Tom &amp; Jerry&#39;s</p><div>next&nbsp;line</div></body></html>'
    expect(htmlToText(html)).toBe("Tom & Jerry's\nnext line")
  })

  it('decodes accented letters and typographic punctuation', () => {
    expect(htmlToText('<p>Jes&uacute;s Guill&eacute;n &mdash; R&eacute;sonance, Bergstr&ouml;m, Nu&ntilde;ez, J&oslash;rgensen&rsquo;s</p>')).toBe(
      'Jesús Guillén — Résonance, Bergström, Nuñez, Jørgensen’s',
    )
  })
})

describe('methodTrailHtml', () => {
  it('reads the wineries from the trail map’s embedded data', () => {
    const winery = { slug: 'kramer', name: 'Kramer Vineyards', region: 'Willamette Valley', address: '26830 NW Olson Rd, Gaston, OR 97119', website: 'https://www.kramervineyards.com', description: 'Sparkling.', events: [] }
    const chunk = JSON.stringify([1, `5:["$","div",null,{"wineries":[${JSON.stringify(winery)},${JSON.stringify(winery)}]}]`])
    const page = `<title>Method Oregon Trail</title><div>Loading trail...</div><script>self.__next_f.push(${chunk})</script>`
    expect(htmlToText(methodTrailHtml(page)!)).toBe(
      'Method Oregon Trail\nKramer Vineyards (Willamette Valley). 26830 NW Olson Rd, Gaston, OR 97119. https://www.kramervineyards.com. Sparkling.',
    )
    expect(methodTrailHtml('<p>no map here</p>')).toBeNull()
  })
})

describe('list-style sources', () => {
  it("reads only the record's own entries, not a neighbour naming the same AVA", () => {
    const text = [
      'WineEnthusiast reviews of Oregon wines, by winery.',
      'Hood Crest: regions Columbia Gorge (OR). Its varieties Pinot Noir.',
      'Springhouse Cellar: regions Columbia Valley (OR); Columbia Gorge (OR). Its varieties Viognier.',
      'Phelps Creek: regions Columbia Gorge (OR). Its varieties Chardonnay.',
    ].join('\n')
    const both = catalogueLines(text, [['Springhouse Cellar'], ['Columbia Gorge AVA']])
    expect(both.text.split('\n')).toEqual([expect.stringContaining('by winery'), expect.stringContaining('Springhouse Cellar')])
    expect(both.mentioned).toEqual([true, true])
    const first = catalogueLines(text, [['Springhouse Cellar'], ['Ribbon Ridge AVA']])
    expect(first.text).toContain('Springhouse Cellar:')
    expect(first.text).not.toContain('Phelps')
    expect(first.mentioned).toEqual([true, false])
  })
})
