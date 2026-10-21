import { describe, expect, it } from 'vitest'
import { loadGraph } from '../../src/data'
import type { GraphEdge } from '../../src/data/schema'
import { buildResearch, colaSource, noVariety } from './build'
import { IMAGE_NOTE, labelOnlyNote, withCaveats } from './caveats'
import { hintsFor, priority, vineyardKey } from './hints'
import { newWineryRecords, placeFromApplicant, summaryFor } from './newWineries'
import { candidatesFor, type LabelReading } from './read'
import { colaUrl, formPage, parseForm, parseResultsCsv, ttbIdOf, type ColaForm } from './registry'
import { approvalsFor, searchTerm } from './search'

const graph = await loadGraph()
const winery = (id: string) => graph.nodes.find((node) => node.id === id)!
const vineyards = graph.nodes.filter((node) => node.type === 'vineyard')

const form = (fields: Partial<ColaForm>): ColaForm => ({
  ttbId: '25233001000429',
  status: 'APPROVED',
  permit: 'BWN-OR-21256',
  applicant: 'Audeant Wines, Knox W Farm LLC Newberg OR 97132',
  brand: 'AUDEANT',
  fanciful: '',
  varietals: 'Pinot noir',
  appellation: 'WILLAMETTE VALLEY',
  classDesc: 'TABLE RED WINE',
  issued: '2025-08-22',
  images: [],
  ...fields,
})

describe('the registry pages', () => {
  it('reads the CSV export, including quoted fields that span lines', () => {
    const csv =
      'TTB ID,Permit No.,Serial Number,Completed Date,Fanciful Name,Brand Name,Origin,Origin Desc,Class/Type,Class/Type Desc\r\n' +
      "'25233001000429',BWN-OR-21256,25SD23,08/22/2025,,AUDEANT,38,OREGON,80,TABLE RED WINE\r\n" +
      `'11294000000023',BW-OR-122,118108,11/09/2011,"SILVER, \nSERIES",ARGYLE,38,OREGON,88,DESSERT WINE\r\n`
    const rows = parseResultsCsv(csv)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ ttbId: '25233001000429', completed: '2025-08-22', brand: 'AUDEANT' })
    expect(rows[1].fanciful).toBe('SILVER, SERIES')
    expect(() => parseResultsCsv('<html>An error has occurred</html>')).toThrow('not the expected CSV')
  })

  it('reads the 2016 edition of the form', () => {
    const text =
      "TTB ID 25233001000429 1. REP. ID. NO. (If any) 2. PLANT REGISTRY/BASIC PERMIT/BREWER'S NO. (Required) BWN-OR-21256 3. SOURCE OF PRODUCT (Required) " +
      '8. NAME AND ADDRESS OF APPLICANT AS SHOWN ON PLANT REGISTRY, BASIC PERMIT OR BREWER\'S NOTICE. INCLUDE APPROVED DBA OR TRADENAME IF USED ON LABEL (Required) Audeant Wines, Knox W Farm LLC Newberg OR 97132 ' +
      '4. SERIAL NUMBER (Required) 25SD23 6. BRAND NAME (Required) AUDEANT 8a. MAILING ADDRESS, IF DIFFERENT 7. FANCIFUL NAME (If any) 9. FORMULA ' +
      '10. GRAPE VARIETAL(S) (Wine Only) Pinot noir 14. TYPE OF APPLICATION 11. WINE APPELLATION (If on label) WILLAMETTE VALLEY 12. PHONE NUMBER (555) 555-5555 ' +
      '19. DATE ISSUED 08/22/2025 20. AUTHORIZED SIGNATURE THE STATUS IS APPROVED. CLASS/TYPE DESCRIPTION TABLE RED WINE EXPIRATION DATE (If any)'
    const images = [{ kind: 'Brand (front) or keg collar', filename: 'Audeant_Stardance_750ml_3x3_front.jpg' }]
    expect(parseForm({ ttbId: '25233001000429', text, images })).toEqual(
      form({ applicant: 'Audeant Wines, Knox W Farm LLC Newberg OR 97132', images }),
    )
  })

  it('reads the 2009 edition, which numbers its boxes differently and has a vintage', () => {
    const text =
      "2. PLANT REGISTRY/BASIC PERMIT/BREWER'S NO. (Required) BWC-OR-49 3. SOURCE OF PRODUCT 6. BRAND NAME (Required) THE EYRIE VINEYARDS 8a. MAILING ADDRESS " +
      '7. FANCIFUL NAME (If any) 9. EMAIL ADDRESS 14. WINE APPELLATION IF ON LABEL DUNDEE HILLS 15. WINE VINTAGE DATE IF ON LABEL 2005 16. PHONE NUMBER'
    const parsed = parseForm({ ttbId: '06211001000001', text, images: [] })
    expect(parsed).toMatchObject({ permit: 'BWC-OR-49', brand: 'THE EYRIE VINEYARDS', fanciful: '', appellation: 'DUNDEE HILLS', vintage: 2005 })
  })

  it('never keeps the phone, fax, email or name of the person who filed', () => {
    const html =
      '<td>13. WINE APPELLATION IF ON LABEL WILLAMETTE VALLEY 15. PHONE NUMBER (555) 555-0100 16. FAX NUMBER (555) 555-0101 ' +
      '8. EMAIL ADDRESS someone@example.com 9. FORMULA 21. PRINT NAME OF APPLICANT OR AUTHORIZED AGENT JANE Q. FILER PART III - TTB CERTIFICATE</td>'
    const { text } = formPage('03210001000069', html)
    expect(text).not.toMatch(/555|example\.com|JANE|FILER/)
    expect(text).toContain('PHONE NUMBER [not kept] 16. FAX NUMBER [not kept] 8. EMAIL ADDRESS [not kept] 9. FORMULA')
    expect(parseForm({ ttbId: '03210001000069', text, images: [] }).appellation).toBe('WILLAMETTE VALLEY')
  })

  it('cites the detail page, which opens without a session', () => {
    expect(ttbIdOf(colaUrl('25233001000429'))).toBe('25233001000429')
    expect(ttbIdOf('https://example.com/?ttbid=25233001000429')).toBeNull()
  })
})

describe('cola:search', () => {
  it('searches for the distinctive part of a name, or the whole name when that part is short', () => {
    expect(searchTerm('The Eyrie Vineyards')).toBe('%EYRIE%')
    expect(searchTerm('Domaine Drouhin Oregon')).toBe('%DOMAINE%DROUHIN%')
    expect(searchTerm('King Estate')).toBe('%KING%ESTATE%')
    expect(searchTerm('Day Wines')).toBe('%DAY%WINES%')
  })

  it('keeps Oregon approvals of the winery’s own brand and lists brands that only contain it', () => {
    const row = (brand: string, permit: string, ttbId: string) =>
      ({ ttbId, permit, brand, serial: '', completed: '2020-01-01', fanciful: '', origin: '38', originDesc: '', classType: '', classDesc: '' })
    const found = approvalsFor(winery('the-eyrie-vineyards'), [
      row('THE EYRIE VINEYARDS', 'BWC-OR-49', '1'),
      row('EYRIE', 'BW-OR-49', '2'),
      row('LES PEYRIERES', 'MN-I-353', '3'),
      row('GRAN MORAINE & THE EYRIE VINEYARDS', 'BWN-OR-21079', '4'),
    ])
    expect(found.ttbIds).toEqual(['1', '2'])
    expect(found.permits).toEqual(['BW-OR-49', 'BWC-OR-49'])
    expect(found.related).toEqual([{ brand: 'GRAN MORAINE & THE EYRIE VINEYARDS', permit: 'BWN-OR-21079', count: 1 }])
  })
})

describe('label hints', () => {
  const audeant = ['Audeant', 'AUDEANT']

  it('finds known vineyards and distinctive words in file names', () => {
    const nysa = hintsFor(form({ images: [{ kind: 'Back', filename: 'Audeant_NYSA_750ml_3x3_FINAL.jpg' }] }), audeant, vineyards)
    expect(nysa.vineyards).toEqual(['nysa-vineyard'])
    expect(priority(nysa)).toBe(1)
    const stardance = hintsFor(form({ images: [{ kind: 'Back', filename: 'Audeant_Stardance_750ml_35x3_BACK.jpg' }] }), audeant, vineyards)
    expect(stardance).toMatchObject({ words: ['stardance'], vineyards: [] })
    expect(priority(stardance)).toBe(3)
  })

  it('treats a label with only sizes, places and varieties as plain', () => {
    const plain = hintsFor(form({ images: [{ kind: 'Back', filename: 'Audeant-WillametteValley 750ml 3x3 BACK.jpg' }] }), audeant, vineyards)
    expect(plain.words).toEqual([])
    expect(priority(plain)).toBe(4)
  })

  it('offers Jev the winery’s vineyards, a suggested new one, another or none', () => {
    const hints = { words: ['stardance'], vineyardWord: false, vineyards: [] }
    const candidates = candidatesFor(graph, 'audeant', hints)
    expect(Object.values(candidates.vineyards)).toContain('nysa-vineyard')
    expect(candidates.suggestions).toEqual({ suggested: 'Stardance' })
    expect(Object.keys(candidates.criteria)).toEqual(expect.arrayContaining(['suggested', 'other', 'none']))
    expect(vineyardKey('Luminous Hills Vineyard')).toBe('luminous hills')
  })
})

describe('cola:build', () => {
  const forms: Record<string, ColaForm> = {
    '25233001000429': form({}),
    '20022001000055': form({ ttbId: '20022001000055', varietals: 'Chardonnay', appellation: 'EOLA-AMITY HILLS', issued: '2020-01-27' }),
    '18284001000759': form({ ttbId: '18284001000759', issued: '2018-11-03' }),
  }
  const labels: Record<string, LabelReading> = {
    '25233001000429': { winery: 'audeant', priority: 3, newVineyard: 'Stardance Vineyard', confidence: 1, vintage: 2023, readBy: 'person' },
    '20022001000055': { winery: 'audeant', priority: 1, vineyard: 'seven-springs-vineyard', confidence: 0.99, readBy: 'jev' },
    '18284001000759': { winery: 'audeant', priority: 1, vineyard: 'nysa-vineyard', confidence: 0.6, readBy: 'jev' },
  }
  const research = buildResearch(graph, { audeant: { ttbIds: Object.keys(forms) } }, labels, (id) => forms[id] ?? null)
  const edge = (source: string, target: string) => research.edges.find((e) => e.source === source && e.target === target)

  it('adds approvals to connections the data already has, without changing them', () => {
    const springs = edge('audeant', 'seven-springs-vineyard')!
    expect(springs.id).toBe('audeant--sources-from--seven-springs-vineyard')
    expect(springs.role).toBeUndefined()
    expect(springs.sources[0].title).toBe(
      'Audeant Seven Springs Vineyard Chardonnay, label approved 27 Jan 2020 (TTB COLA 20022001000055)',
    )
  })

  it('creates a vineyard a label names, and the connection to it', () => {
    expect(research.nodes.map((node) => node.id)).toEqual(['stardance-vineyard'])
    const connection = edge('audeant', 'stardance-vineyard')
    expect(connection).toMatchObject({ type: 'sources_from', vintages: [2023] })
    // The wine's name is in the source title, not repeated as a role
    expect(connection?.role).toBeUndefined()
    expect(connection?.sources[0].title).toContain('Stardance Vineyard Pinot noir 2023')
  })

  it('ignores readings below the threshold', () => {
    expect(edge('audeant', 'nysa-vineyard')).toBeUndefined()
  })

  it('draws AVAs from each form’s appellation, and places only smaller AVAs’ vineyards', () => {
    expect(edge('audeant', 'willamette-valley')?.type).toBe('draws_from')
    expect(edge('audeant', 'eola-amity-hills')?.type).toBe('draws_from')
    expect(edge('stardance-vineyard', 'willamette-valley')).toBeUndefined()
  })
})

describe('cola:caveats', () => {
  const cola = (ttbId: string, date: string) => colaSource(form({ ttbId, issued: date }), 'Audeant', 'Stardance Vineyard Pinot noir')
  const base = {
    id: 'audeant--sources-from--stardance-vineyard',
    source: 'audeant',
    target: 'stardance-vineyard',
    type: 'sources_from',
    verified: false,
  } as const

  it('says how far label-only evidence goes, with the approval years', () => {
    expect(labelOnlyNote([cola('25233001000429', '2025-08-22')])).toBe(
      'Evidence goes only as far as a federal label approval (TTB, 2025); no other source confirms the wine was released.',
    )
    expect(labelOnlyNote([cola('1', '2025-08-22'), cola('2', '2018-11-03')])).toContain('approvals (TTB, 2018–2025)')
    expect(labelOnlyNote([cola('1', '2025-08-22'), { title: 'A review', url: 'https://example.com' }])).toBeNull()
  })

  it('keeps the note’s own text, replaces old caveats and drops them when another source arrives', () => {
    const edge: GraphEdge = { ...base, note: 'Vintage on approved labels: 2023.', sources: [cola('25233001000429', '2025-08-22')] }
    const once = withCaveats(edge, false)!
    expect(once).toMatch(/^Vintage on approved labels: 2023\. Evidence goes only as far as a federal label approval \(TTB, 2025\)/)
    expect(withCaveats({ ...edge, note: once }, false)).toBe(once)
    const confirmed = { ...edge, note: once, sources: [...edge.sources, { title: 'Winery site', url: 'https://example.com' }] }
    expect(withCaveats(confirmed, false)).toBe('Vintage on approved labels: 2023.')
  })

  it('notes a verification that rested on label images alone', () => {
    const edge: GraphEdge = { ...base, verified: true, verifiedBy: 'jev', sources: [cola('25233001000429', '2025-08-22')] }
    expect(withCaveats(edge, true)).toContain(IMAGE_NOTE)
    expect(withCaveats({ ...edge, verified: false, verifiedBy: undefined }, true)).not.toContain(IMAGE_NOTE)
  })
})

describe('cola:new-wineries', () => {
  it('reads the city from a permit holder’s address', () => {
    expect(placeFromApplicant('Audeant Wines, Knox W Farm LLC 32230 NE OLD PARRETT MOUNTAIN RD Newberg OR 97132 AUDEANT WINES (Used on label)')).toBe('Newberg, OR')
    expect(placeFromApplicant('EYRIE VINEYARDS, D & D VINEYARDS, INC. 935 NE 10TH AVE MCMINNVILLE OR 97128')).toBe('Mcminnville, OR')
    expect(placeFromApplicant('Some Cellars LLC 100 HWY 99W FOREST GROVE OR 97116')).toBe('Forest Grove, OR')
    expect(placeFromApplicant('Some Cellars LLC 12 Main St Walla Walla WA 99362')).toBeUndefined()
  })

  it('summarises where the winery is and what it makes', () => {
    expect(summaryFor('Roseburg, OR', ['Pinot Noir', 'TEMPRANILLO'])).toBe('Roseburg winery making Pinot noir and Tempranillo.')
    expect(summaryFor(undefined, [])).toBe('Oregon winery.')
    expect(['N/A', 'NONE', ' ', ''].every(noVariety)).toBe(true)
    expect(noVariety('PINOT NOIR')).toBe(false)
  })

  it('creates a winery only with an AVA to cite, and never one already recorded', () => {
    // As before Melrose was added from these approvals
    const before = { ...graph, nodes: graph.nodes.filter((node) => node.id !== 'melrose') }
    const reviews = [{ winery: 'Melrose', designation: '', region: 'Umpqua Valley', variety: 'Pinot Noir' }]
    const forms = [form({ ttbId: '21001001000001', brand: 'MELROSE', applicant: 'Melrose LLC 885 MELROSE RD Roseburg OR 97471', appellation: 'UMPQUA VALLEY' })]
    const records = newWineryRecords(before, 'Melrose', reviews, forms)!
    expect(records.node).toMatchObject({ id: 'melrose', type: 'winery', place: 'Roseburg, OR', summary: 'Roseburg winery making Pinot noir.' })
    expect(records.edges).toHaveLength(1)
    expect(records.edges[0]).toMatchObject({ target: 'umpqua-valley', type: 'draws_from' })
    expect(records.edges[0].sources).toHaveLength(2)
    expect(newWineryRecords(before, 'Melrose', [], [form({ appellation: 'OREGON' })])).toBeNull()
    const mcminnville = form({ applicant: 'X LLC 1 MAIN ST MCMINNVILLE OR 97128', appellation: 'UMPQUA VALLEY' })
    expect(newWineryRecords(before, 'Melrose', [], [mcminnville])!.node.place).toBe('McMinnville, OR')
    expect(newWineryRecords(graph, 'Audeant', reviews, forms)).toBeNull()
  })
})
