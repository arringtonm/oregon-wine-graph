import { describe, expect, it } from 'vitest'
import { loadGraph } from '../../src/data'
import type { Answer, DecisionModel } from '../jev/model'
import { checkRecord } from './checkRecord'
import { claimsFingerprint, claimsFor } from './claims'
import { decide, type SourceCheck } from './decide'
import { htmlToText, methodTrailHtml, type CachedSource } from './fetchSources'
import { extractPassages, nameVariants } from './passages'

const graph = await loadGraph()
const edge = (id: string) => ({ kind: 'edge' as const, record: graph.edges.find((candidate) => candidate.id === id)! })
const node = (id: string) => ({ kind: 'node' as const, record: graph.nodes.find((candidate) => candidate.id === id)! })

describe('claimsFor', () => {
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

  it('checks a node on its summary and its dates', () => {
    const claims = claimsFor(node('david-lett'), graph)
    expect(claims.main).toMatch(/^About David Lett: /)
    expect(claims.details).toEqual({ born: 'David Lett was born in 1939.', died: 'David Lett died in 2008.' })
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
})

describe('checkRecord', () => {
  const item = edge('david-lett--founded--the-eyrie-vineyards')
  const urls = item.record.sources.map((source) => source.url!)
  const source = (status: CachedSource['status'], text = ''): CachedSource => ({ url: urls[0], status, fetchedAt: '', text })
  let asked: { state: string; ids: string[] }[] = []
  const model: DecisionModel = {
    name: 'jev',
    async ask(state, questions) {
      asked.push({ state, ids: Object.keys(questions) })
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
    expect(asked[0].ids).toEqual(['main', 'detail_startYear'])
    expect(checks[0]).toMatchObject({ status: 'read', levels: [0, 0, 0.1, 0.9], details: { startYear: 0.85 } })
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
