// Communities for the clustered layout. The graph is drawn as islands, one per community
// (Louvain, which groups records more tightly linked to each other than to the rest), each
// with its own best-connected records at its centre, rather than as one mass with every hub
// piled in the middle. Tiny communities fold into the neighbour they share most links with,
// and small groups with no link to anything else share one island, so the map isn't
// scattered with dozens of specks.
import Graph from 'graphology'
import louvain from 'graphology-communities-louvain'
import type { Link } from './core'

// Smaller communities fold into a neighbour
export const MIN_COMMUNITY = 5

// A seeded random source, so the same data gives the same communities
function seeded(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// The island of small groups linked to nothing else
export const LOOSE = -1

// Each id's community, numbered from 0 by size, largest first; detached groups get LOOSE
export function communities(ids: string[], links: Link[], seed = 1): Map<string, number> {
  const graph = new Graph({ type: 'undirected', multi: false })
  for (const id of ids) graph.addNode(id)
  for (const { source, target } of links) {
    if (source === target || !graph.hasNode(source) || !graph.hasNode(target)) continue
    if (graph.hasEdge(source, target)) graph.updateEdgeAttribute(source, target, 'weight', (weight = 1) => weight + 1)
    else graph.addEdge(source, target, { weight: 1 })
  }
  const found = louvain(graph, { rng: seeded(seed), getEdgeWeight: 'weight' }) as Record<string, number>
  const members = new Map<number, string[]>()
  for (const id of ids) members.set(found[id], [...(members.get(found[id]) ?? []), id])

  // Fold tiny communities into the neighbouring one they share most links with, smallest
  // first; those with no neighbours at all (detached groups) go together in one island
  const of = new Map(ids.map((id) => [id, found[id]]))
  const small = [...members].filter(([, list]) => list.length < MIN_COMMUNITY).sort((a, b) => a[1].length - b[1].length)
  for (const [community, list] of small) {
    const shared = new Map<number, number>()
    for (const id of list) {
      graph.forEachNeighbor(id, (other) => {
        const theirs = of.get(other)!
        if (theirs !== community) shared.set(theirs, (shared.get(theirs) ?? 0) + 1)
      })
    }
    const best = [...shared].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]
    const into = best ? best[0] : LOOSE
    for (const id of list) of.set(id, into)
    if (best) members.set(into, [...(members.get(into) ?? []), ...list])
    members.delete(community)
  }

  // Number by size, largest first
  const sizes = new Map<number, number>()
  for (const community of of.values()) if (community !== LOOSE) sizes.set(community, (sizes.get(community) ?? 0) + 1)
  const order = [...sizes].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([community]) => community)
  const index = new Map<number, number>(order.map((community, position) => [community, position]))
  index.set(LOOSE, LOOSE)
  return new Map(ids.map((id) => [id, index.get(of.get(id)!)!]))
}

export interface Island {
  id: number
  radius: number
}

// Centres for the islands: circles that never overlap (with `gap` between them), drawn
// towards the islands their communities share links with, the most-linked closest. Biggest
// islands start nearest the middle, on a sunflower spiral, then a few hundred rounds of
// pull along links and push apart settle them.
export function arrangeIslands(islands: Island[], links: Map<string, number>, gap = 160): Map<number, { x: number; y: number }> {
  const order = [...islands].sort((a, b) => b.radius - a.radius || a.id - b.id)
  const mean = order.reduce((sum, island) => sum + island.radius, 0) / Math.max(1, order.length)
  const at = new Map<number, { x: number; y: number }>()
  order.forEach((island, index) => {
    const distance = (mean + gap) * 1.6 * Math.sqrt(index)
    const angle = index * Math.PI * (3 - Math.sqrt(5))
    at.set(island.id, { x: distance * Math.cos(angle), y: distance * Math.sin(angle) })
  })
  const radius = new Map(order.map((island) => [island.id, island.radius]))
  const pairs = [...links].map(([key, weight]) => {
    const [a, b] = key.split('-').map(Number)
    return { a, b, weight }
  })
  const separate = () => {
    for (let i = 0; i < order.length; i++) {
      for (let j = i + 1; j < order.length; j++) {
        const p = at.get(order[i].id)!
        const q = at.get(order[j].id)!
        const want = order[i].radius + order[j].radius + gap
        let dx = q.x - p.x
        let dy = q.y - p.y
        let distance = Math.hypot(dx, dy)
        if (distance >= want) continue
        if (distance < 1e-6) [dx, dy, distance] = [1, 0, 1]
        // The bigger island moves less
        const push = want - distance
        const share = order[j].radius / (order[i].radius + order[j].radius)
        p.x -= (dx / distance) * push * share
        p.y -= (dy / distance) * push * share
        q.x += (dx / distance) * push * (1 - share)
        q.y += (dy / distance) * push * (1 - share)
      }
    }
  }
  for (let round = 0; round < 300; round++) {
    const cool = 1 - round / 300
    // Linked islands drift together, more strongly the more they share
    for (const { a, b, weight } of pairs) {
      const p = at.get(a)
      const q = at.get(b)
      if (!p || !q) continue
      const want = radius.get(a)! + radius.get(b)! + gap
      const dx = q.x - p.x
      const dy = q.y - p.y
      const distance = Math.hypot(dx, dy) || 1
      const pull = ((distance - want) / distance) * Math.min(0.2, 0.02 * weight) * cool
      p.x += dx * pull
      p.y += dy * pull
      q.x -= dx * pull
      q.y -= dy * pull
    }
    // Everything drifts gently towards the middle, so no island strays
    for (const point of at.values()) {
      point.x *= 1 - 0.01 * cool
      point.y *= 1 - 0.01 * cool
    }
    separate()
  }
  for (let round = 0; round < 50; round++) separate()
  return at
}
