// Nudges apart boxes that still overlap after a force-directed layout. Force layouts space
// nodes out on average but never guarantee that two nodes, or their labels, don't collide;
// this pass fixes the collisions that remain while moving each box as little as possible.
//
// Each overlapping pair is pushed apart along the axis where it overlaps least, the push
// split between the two in inverse proportion to their weight, so hubs hold their place and
// small nodes step aside. A spatial grid keeps each pass close to linear in the box count.

export interface Box {
  id: string
  // Centre of the box, which need not be the node's position (labels hang below the node)
  x: number
  y: number
  width: number
  height: number
  // Heavier boxes move less
  weight: number
}

export interface OverlapResult {
  // How far each box moved; boxes that did not move are absent
  moves: Map<string, { dx: number; dy: number }>
  passes: number
  remaining: number
}

export function removeOverlaps(input: Box[], { gap = 6, maxPasses = 400, slack = 1 } = {}): OverlapResult {
  const boxes = input.map((box) => ({ ...box }))
  const cell = Math.max(1, ...boxes.map((box) => Math.max(box.width, box.height) + gap))
  let passes = 0
  let remaining = 0

  for (; passes < maxPasses; passes++) {
    const grid = new Map<string, number[]>()
    boxes.forEach((box, index) => {
      const key = `${Math.floor(box.x / cell)},${Math.floor(box.y / cell)}`
      const bucket = grid.get(key)
      if (bucket) bucket.push(index)
      else grid.set(key, [index])
    })

    remaining = 0
    boxes.forEach((a, i) => {
      const cx = Math.floor(a.x / cell)
      const cy = Math.floor(a.y / cell)
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        for (let gy = cy - 1; gy <= cy + 1; gy++) {
          for (const j of grid.get(`${gx},${gy}`) ?? []) {
            if (j <= i) continue
            const b = boxes[j]
            const overlapX = (a.width + b.width) / 2 + gap - Math.abs(a.x - b.x)
            const overlapY = (a.height + b.height) / 2 + gap - Math.abs(a.y - b.y)
            // Overlaps under `slack` are ignored and each push goes `slack` past touching;
            // otherwise pairs pushed to exactly touching re-trigger on rounding error
            if (overlapX <= slack || overlapY <= slack) continue
            remaining++
            // Share of the push each takes: the lighter box moves further
            const shareA = b.weight / (a.weight + b.weight)
            const shareB = 1 - shareA
            if (overlapX < overlapY) {
              // Boxes at exactly the same spot separate by index, so the result is stable
              const direction = a.x < b.x || (a.x === b.x && i < j) ? -1 : 1
              a.x += direction * (overlapX + slack) * shareA
              b.x -= direction * (overlapX + slack) * shareB
            } else {
              const direction = a.y < b.y || (a.y === b.y && i < j) ? -1 : 1
              a.y += direction * (overlapY + slack) * shareA
              b.y -= direction * (overlapY + slack) * shareB
            }
          }
        }
      }
    })
    if (remaining === 0) break
  }

  const moves = new Map<string, { dx: number; dy: number }>()
  boxes.forEach((box, index) => {
    const dx = box.x - input[index].x
    const dy = box.y - input[index].y
    if (dx !== 0 || dy !== 0) moves.set(box.id, { dx, dy })
  })
  return { moves, passes, remaining }
}
