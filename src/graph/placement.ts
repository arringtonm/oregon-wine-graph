// Placing nodes without running a layout. When a filter brings nodes back, or the data has
// nodes the saved layout doesn't know yet, each is put where it was last seen or beside the
// nodes it connects to, and the overlap pass then tidies up. A full force layout of the
// whole graph freezes the page for one to two seconds; this takes milliseconds.

export interface Point {
  x: number
  y: number
}

// The golden angle spreads successive offsets evenly around a circle
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

function offset(index: number, spacing: number): Point {
  const radius = spacing * Math.sqrt(index + 1)
  const angle = index * GOLDEN_ANGLE
  return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) }
}

// Positions for `ids`, which have none yet. A node goes at the centre of its neighbours
// that already have a position, nudged so siblings don't stack; nodes whose only
// neighbours are also new are placed in later rounds, beside those. Anything left
// unconnected to a placed node spirals out from `centre`.
export function placeNear(
  ids: string[],
  neighbours: (id: string) => string[],
  placed: Map<string, Point>,
  centre: Point,
  spacing = 60,
): Map<string, Point> {
  const result = new Map<string, Point>()
  const known = (id: string) => result.get(id) ?? placed.get(id)
  // How many new nodes have been put beside each anchor, so the next one goes elsewhere
  const crowding = new Map<string, number>()
  let pending = [...ids]

  while (pending.length > 0) {
    const next: string[] = []
    const round = new Map<string, Point>()
    for (const id of pending) {
      const anchors = neighbours(id).filter((other) => known(other))
      if (anchors.length === 0) {
        next.push(id)
        continue
      }
      const sum = anchors.reduce((total, other) => {
        const point = known(other)!
        return { x: total.x + point.x, y: total.y + point.y }
      }, { x: 0, y: 0 })
      const key = anchors.slice().sort().join('|')
      const count = crowding.get(key) ?? 0
      crowding.set(key, count + 1)
      const nudge = offset(count, spacing)
      round.set(id, { x: sum.x / anchors.length + nudge.x, y: sum.y / anchors.length + nudge.y })
    }
    // Nothing could be placed this round: the rest have no placed neighbour at all
    if (round.size === 0) {
      next.forEach((id, index) => {
        const nudge = offset(index, spacing)
        result.set(id, { x: centre.x + nudge.x, y: centre.y + nudge.y })
      })
      break
    }
    for (const [id, point] of round) result.set(id, point)
    pending = next
  }
  return result
}

export interface SavedLayout {
  version: number
  positions: Record<string, [number, number]>
}

// How much of the showing graph a saved layout covers, from 0 to 1
export function coverage(layout: SavedLayout, ids: string[]): number {
  if (ids.length === 0) return 0
  return ids.filter((id) => id in layout.positions).length / ids.length
}

export function toSaved(positions: Map<string, Point>): SavedLayout {
  const entries = [...positions].sort(([a], [b]) => a.localeCompare(b))
  return { version: 1, positions: Object.fromEntries(entries.map(([id, point]) => [id, [Math.round(point.x), Math.round(point.y)]])) }
}
