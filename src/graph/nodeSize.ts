// Node and label sizes in five tiers, from the nodes currently showing. Nodes are ranked by
// connection count and tiered by rank, so whatever the filters leave, its best-connected
// nodes are the largest: hiding people, say, re-tiers the wineries among themselves.
// Nodes with the same count share the tier at the middle of their ranks.

export const TIERS = [
  // Share of the showing nodes in each tier, from the top
  { name: 'largest', share: 0.01, size: 136, fontSize: 22 },
  { name: 'large', share: 0.04, size: 80, fontSize: 18 },
  { name: 'medium', share: 0.15, size: 44, fontSize: 13 },
  { name: 'small', share: 0.3, size: 28, fontSize: 11 },
  { name: 'smallest', share: 0.5, size: 18, fontSize: 9 },
] as const

export type Tier = (typeof TIERS)[number]

// Tier for each node id, given each showing node's connection count
export function sizeTiers(degrees: Map<string, number>): Map<string, Tier> {
  const ranked = [...degrees].sort((a, b) => b[1] - a[1])
  // Where each connection count's group of nodes sits in the ranking: the middle of its
  // ranks, as a share of all showing nodes
  const middle = new Map<number, number>()
  ranked.forEach(([, degree], index) => {
    if (middle.has(degree)) return
    let last = index
    while (last + 1 < ranked.length && ranked[last + 1][1] === degree) last++
    middle.set(degree, (index + last + 1) / 2 / ranked.length)
  })
  const top = ranked[0]?.[1] ?? 0
  const tiers = new Map<string, Tier>()
  for (const [id, degree] of ranked) {
    let tier: Tier = TIERS[TIERS.length - 1]
    // Nodes without connections are always smallest; the best-connected are always largest
    if (degree > 0 && degree === top) tier = TIERS[0]
    else if (degree > 0) {
      let cumulative = 0
      for (const candidate of TIERS) {
        cumulative += candidate.share
        if (middle.get(degree)! <= cumulative) {
          tier = candidate
          break
        }
      }
    }
    tiers.set(id, tier)
  }
  return tiers
}
