// Which names to show, worked out on screen each time the view moves, as maps place town
// names: in order of importance, each name goes below its record, or failing that above, to
// the right or to the left, wherever it fits without touching a name already placed; if it
// fits nowhere it isn't shown. Zoomed out, the best-connected records are named across the
// whole graph; zoomed in, more names find room, and none lands on another. A name marked
// `always` (the selection's) is placed first and shown, below its record if nowhere is clear.

export interface LabelBox {
  id: string
  // The record's centre and radius, and the name's size, in rendered pixels
  x: number
  y: number
  radius: number
  width: number
  height: number
  // Higher is placed first
  priority: number
  // Shown whether or not it fits
  always?: boolean
}

export type Side = 'below' | 'above' | 'right' | 'left'
export const SIDES: Side[] = ['below', 'above', 'right', 'left']

// The part of the screen names may go in, in rendered pixels: not behind the sidebars or
// the toolbar
export interface Viewport {
  left: number
  top: number
  width: number
  height: number
}

// Room kept around each name, and between a name and its record
export const LABEL_GAP = 5
const CELL = 80

interface Rect {
  x1: number
  y1: number
  x2: number
  y2: number
}

function rectFor(label: LabelBox, side: Side, gap: number): Rect {
  const { x, y, radius, width, height } = label
  const [left, top] =
    side === 'below'
      ? [x - width / 2, y + radius + gap]
      : side === 'above'
        ? [x - width / 2, y - radius - gap - height]
        : side === 'right'
          ? [x + radius + gap, y - height / 2]
          : [x - radius - gap - width, y - height / 2]
  return { x1: left - gap, y1: top - gap, x2: left + width + gap, y2: top + height + gap }
}

// `icons` are the records' own shapes (centre and radius, rendered pixels): names never cover
// them, except the record a name belongs to
export function chooseLabels(
  boxes: LabelBox[],
  view: Viewport,
  icons: { x: number; y: number; radius: number }[] = [],
  gap = LABEL_GAP,
): Map<string, Side> {
  const chosen = new Map<string, Side>()
  const cells = new Map<string, Rect[]>()
  const keysOf = (rect: Rect) => {
    const keys: string[] = []
    for (let cx = Math.floor(rect.x1 / CELL); cx <= Math.floor(rect.x2 / CELL); cx++)
      for (let cy = Math.floor(rect.y1 / CELL); cy <= Math.floor(rect.y2 / CELL); cy++) keys.push(`${cx},${cy}`)
    return keys
  }
  const inView = (rect: Rect) =>
    rect.x1 >= view.left && rect.y1 >= view.top && rect.x2 <= view.left + view.width && rect.y2 <= view.top + view.height
  const clear = (rect: Rect) =>
    !keysOf(rect).some((key) =>
      (cells.get(key) ?? []).some((other) => rect.x1 < other.x2 && other.x1 < rect.x2 && rect.y1 < other.y2 && other.y1 < rect.y2),
    )
  for (const icon of icons) {
    const rect = { x1: icon.x - icon.radius, y1: icon.y - icon.radius, x2: icon.x + icon.radius, y2: icon.y + icon.radius }
    for (const key of keysOf(rect)) cells.set(key, [...(cells.get(key) ?? []), rect])
  }
  const ordered = [...boxes].sort((a, b) => Number(!!b.always) - Number(!!a.always) || b.priority - a.priority || (a.id < b.id ? -1 : 1))
  for (const label of ordered) {
    let side = SIDES.find((candidate) => {
      const rect = rectFor(label, candidate, gap)
      return (label.always || inView(rect)) && clear(rect)
    })
    if (!side && label.always) side = 'below'
    if (!side) continue
    chosen.set(label.id, side)
    const rect = rectFor(label, side, gap)
    for (const key of keysOf(rect)) cells.set(key, [...(cells.get(key) ?? []), rect])
  }
  return chosen
}
