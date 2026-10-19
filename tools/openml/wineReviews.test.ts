import { describe, expect, it } from 'vitest'
import { loadGraph } from '../../src/data'
import { arffFields, buildFromReviews, OPENML_SOURCE, oregonFacts } from './wineReviews'

const graph = await loadGraph()

describe('the OpenML wine reviews', () => {
  it('reads ARFF rows with quoted, escaped and missing values', () => {
    expect(arffFields("US,'A 100\\% varietal, aged.','Martha\\'s Vineyard',96,?,California")).toEqual([
      'US',
      'A 100% varietal, aged.',
      "Martha's Vineyard",
      '96',
      null,
      'California',
    ])
  })

  it('keeps only the four fields used from Oregon rows, once each', () => {
    const arff = [
      '@RELATION wine_reviews',
      '@DATA',
      "US,'Review prose.','Shea Vineyard',93,48.0,Oregon,'Willamette Valley',?,'Pinot Noir','Bergström'",
      "US,'Other prose.','Shea Vineyard',91,48.0,Oregon,'Willamette Valley',?,'Pinot Noir','Bergström'",
      "US,'Prose.',?,90,20.0,California,Napa,?,Merlot,'Somewhere'",
    ].join('\n')
    expect(oregonFacts(arff)).toEqual([
      { winery: 'Bergström', designation: 'Shea Vineyard', region: 'Willamette Valley', variety: 'Pinot Noir' },
    ])
  })

  it('links wineries to AVAs and to vineyards already in the graph, and lists the rest', () => {
    const { research, unmatched } = buildFromReviews(graph, [
      { winery: 'Patricia Green Cellars', designation: 'Weber Vineyard', region: 'Yamhill-Carlton District', variety: 'Pinot Noir' },
      { winery: 'Patricia Green Cellars', designation: 'Nowhere In Particular Vineyard', region: '', variety: 'Pinot Noir' },
      { winery: 'Not A Winery We Have', designation: '', region: 'Rogue Valley', variety: 'Syrah' },
    ])
    const edge = (target: string) => research.edges.find((candidate) => candidate.target === target)
    expect(edge('yamhill-carlton')).toMatchObject({ source: 'patricia-green-cellars', type: 'draws_from', sources: [OPENML_SOURCE] })
    expect(edge('weber-vineyard')).toMatchObject({ type: 'sources_from' })
    expect(research.notes).toEqual(['Vineyard named in a review with no record yet: Patricia Green Cellars: Nowhere In Particular Vineyard'])
    expect(unmatched).toEqual([{ winery: 'Not A Winery We Have', reviews: 1, regions: ['Rogue Valley'] }])
  })
})
