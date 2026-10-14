// Official AVA boundaries (UC Davis Library, public domain) and point-in-polygon tests
// against them. The boundary file is downloaded once into .cache/geo.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const BOUNDARY_URL = 'https://raw.githubusercontent.com/UCDavisLibrary/ava/master/avas_by_state/OR_avas.geojson'
export const BOUNDARY_SOURCE = {
  title: 'American Viticultural Area boundaries (UC Davis Library)',
  url: 'https://github.com/UCDavisLibrary/ava',
}
const BOUNDARY_FILE = resolve('.cache/geo/OR_avas.geojson')

type Ring = [number, number][]
interface Boundary {
  // Graph id, e.g. "dundee-hills"
  id: string
  name: string
  // Number of AVAs this one sits inside; more means more specific
  depth: number
  polygons: Ring[][]
}

export function avaIdFor(name: string): string {
  return name
    // "Red Hill Douglas County, Oregon" -> red-hill-douglas-county; "Southern Oregon" stays whole
    .replace(/, Oregon$/, '')
    .replace(/^The /, '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export async function loadBoundaries(): Promise<Boundary[]> {
  if (!existsSync(BOUNDARY_FILE)) {
    mkdirSync(dirname(BOUNDARY_FILE), { recursive: true })
    writeFileSync(BOUNDARY_FILE, await (await fetch(BOUNDARY_URL)).text())
  }
  const geojson = JSON.parse(readFileSync(BOUNDARY_FILE, 'utf8')) as {
    features: { properties: { name: string; within: string | null }; geometry: { type: string; coordinates: unknown } }[]
  }
  return geojson.features.map(({ properties, geometry }) => ({
    id: avaIdFor(properties.name),
    name: properties.name,
    depth: properties.within ? properties.within.split('|').length : 0,
    polygons: (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates) as Ring[][],
  }))
}

// Ray casting; the first ring of a polygon is its outline, the rest are holes
function inRing([x, y]: [number, number], ring: Ring): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export function contains(boundary: Boundary, lat: number, lng: number): boolean {
  return boundary.polygons.some(
    ([outline, ...holes]) => inRing([lng, lat], outline) && !holes.some((hole) => inRing([lng, lat], hole)),
  )
}

// The AVAs containing a point, most specific first
export function avasAt(boundaries: Boundary[], lat: number, lng: number): Boundary[] {
  return boundaries.filter((boundary) => contains(boundary, lat, lng)).sort((a, b) => b.depth - a.depth)
}
