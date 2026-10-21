import type { Graph } from '../data/schema'

// Which records belong to an AVA, for the AVA filter and the regional guides. A vineyard
// belongs to the AVAs it is located in. A winery belongs to a region only if it is based
// there: label approvals show wineries all over the Willamette Valley bottling a Rogue
// Valley Syrah or an Umpqua Tempranillo, and counting those made the Southern Oregon guide
// mostly Willamette houses. Within its home region, a winery belongs to the AVAs it draws
// fruit from directly or through the vineyards it owns or buys from.
//
// Where a winery is based: the town in its `place`, or, with no town known, the region of
// its estate vineyards, or else the region most of its fruit comes from (each AVA weighted
// by the sources naming it, each vineyard counted once).

// Towns by the AVA region around them. Regions are AVAs within no other
export const REGION_TOWNS: Record<string, string[]> = {
  'willamette-valley': [
    'Albany', 'Amity', 'Aurora', 'Beaverton', 'Carlton', 'Chehalem Mountains', 'Cheshire', 'Cornelius', 'Corvallis',
    'Cottage Grove', 'Dallas', 'Dayton', 'Dundee', 'Dundee Hills', 'Elmira', 'Eugene', 'Forest Grove', 'Gaston',
    'Hillsboro', 'Independence', 'Jefferson', 'Junction City', 'Lorane', 'McMinnville', 'Monmouth', 'Monroe', 'Newberg',
    'Parrett Mountain', 'Perrydale', 'Philomath', 'Portland', 'Rickreall', 'Salem', 'Scotts Mills', 'Sheridan',
    'Sherwood', 'Silverton', 'Tualatin', 'Turner', 'Veneta', 'Wilsonville', 'Yamhill', 'Yamhill County',
  ],
  'southern-oregon': [
    'Applegate Valley', 'Ashland', 'Cave Junction', 'Central Point', 'Eagle Point', 'Elkton', 'Gold Hill', 'Grants Pass',
    'Jacksonville', 'Medford', 'Melrose', 'Myrtle Creek', 'Roseburg', 'Selma', 'Talent', 'Tenmile', 'Umpqua', 'Williams',
  ],
  'columbia-gorge': ['Cascade Locks', 'Hood River', 'Mosier'],
  'columbia-valley': ['Benton City', 'Echo', 'Milton-Freewater', 'Walla Walla', 'Walla Walla Valley', 'Yakima Valley'],
}

// A place may name the region itself: "Willamette Valley, Oregon"
const TOWN_REGION = new Map([
  ...Object.entries(REGION_TOWNS).flatMap(([region, towns]) => towns.map((town): [string, string] => [town, region])),
  ['Willamette Valley', 'willamette-valley'],
  ['Southern Oregon', 'southern-oregon'],
  ['Columbia Gorge', 'columbia-gorge'],
  ['Columbia Valley', 'columbia-valley'],
])

// The region a place names, from its town: "Medford, OR" is Southern Oregon
export function regionOfPlace(place: string | undefined): string | undefined {
  return place ? TOWN_REGION.get(place.split(',')[0].trim()) : undefined
}

export interface Regions {
  // The region an AVA lies in (a region is its own)
  regionOf: (ava: string) => string
  // The AVAs a winery or vineyard belongs to, most specific only; their parents follow
  // from "within". For a winery, only those in its home region
  avasOf: (id: string) => string[]
  // Where a winery is based; for a vineyard, the region it is in
  home: (id: string) => string | undefined
}

export function regions(graph: Graph): Regions {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]))
  const parent = new Map<string, string>()
  const out = new Map<string, typeof graph.edges>()
  for (const edge of graph.edges) {
    if (edge.type === 'within') parent.set(edge.source, edge.target)
    out.set(edge.source, [...(out.get(edge.source) ?? []), edge])
  }
  const regionOf = (ava: string) => {
    let at = ava
    while (parent.has(at)) at = parent.get(at)!
    return at
  }
  const targets = (id: string, type: string) => (out.get(id) ?? []).filter((edge) => edge.type === type).map((edge) => edge.target)
  const vineyardsOf = (id: string, type: string) => targets(id, type).filter((target) => nodes.get(target)?.type === 'vineyard')
  const located = (vineyard: string) => targets(vineyard, 'located_in')

  // The region with the most weight; none on a tie, which leaves the next test to decide
  const heaviest = (weights: Map<string, number>) => {
    const ranked = [...weights].sort((a, b) => b[1] - a[1])
    return ranked.length && (ranked.length === 1 || ranked[0][1] > ranked[1][1]) ? ranked[0][0] : undefined
  }
  const weigh = (pairs: [string, number][]) => {
    const weights = new Map<string, number>()
    for (const [ava, weight] of pairs) weights.set(regionOf(ava), (weights.get(regionOf(ava)) ?? 0) + weight)
    return weights
  }

  const homes = new Map<string, string | undefined>()
  const home = (id: string) => {
    if (homes.has(id)) return homes.get(id)
    const node = nodes.get(id)
    let found: string | undefined
    if (node?.type === 'vineyard') found = located(id).map(regionOf)[0]
    else if (node?.type === 'winery') {
      const fruit = weigh([
        ...(out.get(id) ?? []).filter((edge) => edge.type === 'draws_from').map((edge): [string, number] => [edge.target, Math.max(1, edge.sources?.length ?? 0)]),
        ...[...vineyardsOf(id, 'owns'), ...vineyardsOf(id, 'sources_from')].flatMap((vineyard) => located(vineyard).map((ava): [string, number] => [ava, 1])),
      ])
      found =
        regionOfPlace(node.place) ??
        heaviest(weigh(vineyardsOf(id, 'owns').flatMap((vineyard) => located(vineyard).map((ava): [string, number] => [ava, 1])))) ??
        heaviest(fruit)
    }
    homes.set(id, found)
    return found
  }

  const avasOf = (id: string) => {
    const node = nodes.get(id)
    if (node?.type === 'vineyard') return located(id)
    if (node?.type !== 'winery') return []
    const based = home(id)
    const vineyards = [...vineyardsOf(id, 'owns'), ...vineyardsOf(id, 'sources_from')]
    return [...new Set([...targets(id, 'draws_from'), ...vineyards.flatMap(located)])].filter((ava) => regionOf(ava) === based)
  }

  return { regionOf, avasOf, home }
}

// The wineries and vineyards in `scope` (a set of AVAs, sub-AVAs included): those based in a
// region the scope covers whole, and those drawing on an AVA in it from within its region
export function regionMembers(graph: Graph, scope: Set<string>, { avasOf, home }: Regions = regions(graph)): Set<string> {
  const whole = new Set([...scope].filter((ava) => !graph.edges.some((edge) => edge.type === 'within' && edge.source === ava)))
  return new Set(
    graph.nodes
      .filter((node) => node.type === 'winery' || node.type === 'vineyard')
      .filter((node) => whole.has(home(node.id) ?? '') || avasOf(node.id).some((ava) => scope.has(ava)))
      .map((node) => node.id),
  )
}
