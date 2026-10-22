// Writes the AVA outlines the map view draws (public/geo/avas.json): the official boundaries
// (UC Davis Library, public domain) of the AVAs in the graph, simplified to about 60 m so the
// file stays small (large AVAs more coarsely), with a point inside each for its name. Run with: npm run geo:map
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readGraph } from '../reviewPlugin'
import { contains, loadBoundaries } from './boundaries'

type Point = [number, number]
type Ring = Point[]

// About 60 m of latitude for a small AVA; a large one, seen whole from further out, is
// simplified more coarsely (Willamette Valley to about 180 m)
const tolerance = (polygons: Ring[][]) =>
  Math.max(0.00055, Math.sqrt(polygons.reduce((sum, [outline]) => sum + ringArea(outline), 0)) * 0.0015)

function distanceToSegment([x, y]: Point, [x1, y1]: Point, [x2, y2]: Point): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const length = dx * dx + dy * dy
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / length))
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))
}

// Douglas–Peucker on a closed ring, keeping its first point (which is also its last)
export function simplifyRing(ring: Ring, tolerance: number): Ring {
  if (ring.length <= 4) return ring
  const keep = new Uint8Array(ring.length)
  keep[0] = keep[ring.length - 1] = 1
  const stack: [number, number][] = [[0, ring.length - 1]]
  while (stack.length > 0) {
    const [first, last] = stack.pop()!
    let farthest = -1
    let distance = tolerance
    for (let i = first + 1; i < last; i++) {
      const d = distanceToSegment(ring[i], ring[first], ring[last])
      if (d > distance) {
        farthest = i
        distance = d
      }
    }
    if (farthest < 0) continue
    keep[farthest] = 1
    stack.push([first, farthest], [farthest, last])
  }
  const simplified = ring.filter((_, i) => keep[i])
  // A ring the tolerance would flatten keeps its first, middle and last points
  return simplified.length >= 4 ? simplified : [ring[0], ring[Math.floor(ring.length / 3)], ring[Math.floor((2 * ring.length) / 3)], ring[0]]
}

const round = ([x, y]: Point): Point => [Math.round(x * 1e4) / 1e4, Math.round(y * 1e4) / 1e4]

function ringArea(ring: Ring): number {
  let area = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) area += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1])
  return Math.abs(area / 2)
}

// A point well inside the largest polygon, for the AVA's name: the centre of the widest run
// of the polygon along the horizontal line through its middle, tried at a few heights
export function labelPoint(boundary: Parameters<typeof contains>[0]): Point {
  const outline = boundary.polygons.map((polygon) => polygon[0]).sort((a, b) => ringArea(b) - ringArea(a))[0]
  const ys = outline.map(([, y]) => y)
  const xs = outline.map(([x]) => x)
  const [minY, maxY, minX, maxX] = [Math.min(...ys), Math.max(...ys), Math.min(...xs), Math.max(...xs)]
  let best: { point: Point; width: number } = { point: [(minX + maxX) / 2, (minY + maxY) / 2], width: -1 }
  for (const share of [0.5, 0.4, 0.6, 0.3, 0.7]) {
    const y = minY + (maxY - minY) * share
    const crossings: number[] = []
    for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
      const [xi, yi] = outline[i]
      const [xj, yj] = outline[j]
      if (yi > y !== yj > y) crossings.push(xi + ((y - yi) * (xj - xi)) / (yj - yi))
    }
    crossings.sort((a, b) => a - b)
    for (let k = 0; k + 1 < crossings.length; k += 2) {
      const width = crossings[k + 1] - crossings[k]
      const point: Point = [(crossings[k] + crossings[k + 1]) / 2, y]
      // Weighted to the middle height, so a name sits centrally unless that run is narrow
      const score = width * (1 - Math.abs(share - 0.5))
      if (score > best.width && contains(boundary, y, point[0])) best = { point, width: score }
    }
  }
  return round(best.point)
}

async function main() {
  const graph = readGraph(resolve('src/data'))
  const avaIds = new Set(graph.nodes.filter((node) => node.type === 'ava').map((node) => node.id))
  const boundaries = (await loadBoundaries()).filter((boundary) => avaIds.has(boundary.id))
  const features = boundaries.flatMap((boundary) => [
    {
      type: 'Feature',
      properties: { id: boundary.id, depth: boundary.depth },
      geometry: {
        type: 'MultiPolygon',
        coordinates: boundary.polygons
          .map((polygon) => polygon.map((ring) => simplifyRing(ring as Ring, tolerance(boundary.polygons as Ring[][])).map(round)))
          // Specks smaller than about 200 m across are dropped
          .filter(([outline]) => ringArea(outline) > 4e-6),
      },
    },
    {
      type: 'Feature',
      properties: { id: boundary.id, depth: boundary.depth, label: true },
      geometry: { type: 'Point', coordinates: labelPoint(boundary) },
    },
  ])
  const missing = [...avaIds].filter((id) => !boundaries.some((boundary) => boundary.id === id))
  const file = resolve('public/geo/avas.json')
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify({ type: 'FeatureCollection', features }) + '\n')
  console.log(`${boundaries.length} AVA outlines written to public/geo/avas.json`)
  if (missing.length > 0) console.log(`No official boundary for: ${missing.join(', ')}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
