<script setup lang="ts">
import mapboxgl, { type GeoJSONSource, type LngLatBoundsLike, type Map as MapboxMap } from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import type { Feature, FeatureCollection } from 'geojson'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useGraph } from '../composables/useGraph'
import { EDGE_RULES, type GraphNode } from '../data/schema'
import { ICONS } from '../graph/icons'
import { isDark } from '../services/theme'

// The map view: wineries and vineyards placed where they are, over terrain, inside the
// official AVA outlines (public/geo/avas.json, from npm run geo:map). Loaded only when the
// reader opens it, and kept once opened: Mapbox counts each map created as a billed load,
// while changing its style (light to dark) is free.
// Wineries sit at the address they give visitors, often a tasting room, which says nothing
// about where their grapes grow; vineyards will show once their own locations are researched.
const { state, filteredNodes, nodeById, degree, select } = useGraph()

const container = ref<HTMLElement | null>(null)
const terrainButton = ref<HTMLElement | null>(null)
let map: MapboxMap | null = null

const STYLES = { light: 'mapbox://styles/mapbox/light-v11', dark: 'mapbox://styles/mapbox/dark-v11' }
// Oregon's wine country, for a map with nothing on it to fit
const OREGON: LngLatBoundsLike = [
  [-124.3, 41.9],
  [-116.6, 46.3],
]
const FONT = ['DIN Pro Medium', 'Arial Unicode MS Regular']
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

type Located = GraphNode & { type: 'winery' | 'vineyard'; coordinates: { lat: number; lng: number } }
const isLocated = (node: GraphNode | undefined): node is Located =>
  !!node && (node.type === 'winery' || node.type === 'vineyard') && !!node.coordinates

// What the filters let through that has a place on the map
const located = computed(() => filteredNodes.value.filter(isLocated))
const locatedIds = computed(() => new Set(located.value.map((node) => node.id)))

// The selected record's connections that are on the map, which light up with it
const near = computed(() => {
  const id = state.selectedId
  const result = new Set<string>()
  if (!id || !state.graph) return result
  for (const edge of state.graph.edges) {
    if (EDGE_RULES[edge.type].category === 'geography') continue
    const other: string | null = edge.source === id ? edge.target : edge.target === id ? edge.source : null
    if (other && other !== id && locatedIds.value.has(other)) result.add(other)
  }
  return result
})

const selected = computed(() => (state.selectedId ? nodeById.value.get(state.selectedId) : undefined))

// Read out under the map, as the graph's count is
const note = computed(() => {
  const count = located.value.length
  const wineries = located.value.filter((node) => node.type === 'winery').length
  const placed =
    count === 0
      ? 'Nothing the filters show has a place on the map yet'
      : wineries === count
        ? `${count.toLocaleString('en-US')} ${count === 1 ? 'winery' : 'wineries'}, at the address each gives visitors`
        : `${count.toLocaleString('en-US')} wineries and vineyards`
  const record = selected.value
  if (!record || record.type === 'ava' || locatedIds.value.has(record.id)) return placed
  const lit = near.value.size
  const where = isLocated(record)
    ? 'is hidden by the filters'
    : record.type === 'winery' || record.type === 'vineyard'
      ? 'has no address on record'
      : 'isn’t placed on the map'
  const whose = record.type === 'person' ? 'their' : 'its'
  return `${record.name} ${where}${lit > 0 ? `; ${lit} of ${whose} connections ${lit === 1 ? 'is' : 'are'} lit` : ''}`
})

// --- The AVA outlines, fetched once ------------------------------------------------------

interface AvaFeature {
  type: 'Feature'
  properties: { id: string; depth: number; label?: boolean; name?: string }
  geometry: { type: 'MultiPolygon'; coordinates: number[][][][] } | { type: 'Point'; coordinates: number[] }
}
let avaFeatures: AvaFeature[] = []
const avaReady = fetch('/geo/avas.json')
  .then((response) => (response.ok ? response.json() : { features: [] }))
  .then((collection: { features: AvaFeature[] }) => (avaFeatures = collection.features))
  .catch(() => [])

function avaBounds(id: string): LngLatBoundsLike | null {
  const outline = avaFeatures.find((feature) => feature.properties.id === id && feature.geometry.type === 'MultiPolygon')
  if (!outline || outline.geometry.type !== 'MultiPolygon') return null
  const bounds = new mapboxgl.LngLatBounds()
  for (const polygon of outline.geometry.coordinates) for (const [lng, lat] of polygon[0]) bounds.extend([lng, lat])
  return bounds
}

// --- Drawing ---------------------------------------------------------------------------

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

// The graph's own silhouette for each type, on a disc so it reads over any terrain
function markerImage(type: 'winery' | 'vineyard', colour: string, disc: string): Promise<HTMLImageElement> {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="64" height="64">` +
    `<circle cx="16" cy="16" r="14.6" fill="${disc}" stroke="${colour}" stroke-width="1.6"/>` +
    `<g transform="translate(7.6 7.6) scale(0.7)" fill="${colour}" color="${colour}">${ICONS[type]}</g></svg>`
  const image = new Image(64, 64)
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  return image.decode().then(() => image)
}

function recordData(): FeatureCollection {
  const selectedId = state.selectedId
  const lit = near.value
  const anySelected = !!selectedId && (locatedIds.value.has(selectedId) || lit.size > 0)
  return {
    type: 'FeatureCollection',
    features: located.value.map((node) => {
      const role = node.id === selectedId ? 'selected' : lit.has(node.id) ? 'near' : anySelected ? 'dim' : 'plain'
      const rank = Math.min(degree.value.get(node.id) ?? 0, 999)
      return {
        type: 'Feature',
        properties: {
          id: node.id,
          name: node.name,
          type: node.type,
          role,
          // Placed first, so named first: the selection, its connections, then the best connected
          order: (role === 'selected' ? 0 : role === 'near' ? 1000 : 2000) - rank,
        },
        geometry: { type: 'Point', coordinates: [node.coordinates.lng, node.coordinates.lat] },
      }
    }),
  }
}

function linkData(): FeatureCollection {
  const from = selected.value
  const features: Feature[] = []
  if (isLocated(from) && locatedIds.value.has(from.id)) {
    for (const id of near.value) {
      const to = nodeById.value.get(id)
      if (!isLocated(to)) continue
      features.push({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: [
            [from.coordinates.lng, from.coordinates.lat],
            [to.coordinates.lng, to.coordinates.lat],
          ],
        },
      })
    }
  }
  return { type: 'FeatureCollection', features }
}

// AVAs drawn stronger: the selected one and those the AVA filter keeps
function highlightedAvas(): string[] {
  const ids = new Set(state.avas)
  if (selected.value?.type === 'ava') ids.add(selected.value.id)
  return [...ids]
}

function byHighlight<T>(on: T, off: T | unknown[]): unknown {
  const ids = highlightedAvas()
  return ids.length > 0 ? ['match', ['get', 'id'], ids, on, off] : off
}

function paintAvas() {
  if (!map?.getLayer('ava-fill')) return
  // Fainter closer in, where an AVA fills the screen and the terrain matters more
  const fill = (scale: number) => byHighlight(0.14 * scale, ['match', ['get', 'depth'], 0, 0.03 * scale, 0.06 * scale])
  map.setPaintProperty('ava-fill', 'fill-opacity', ['interpolate', ['linear'], ['zoom'], 8, fill(1), 12, fill(0.35)] as never)
  map.setPaintProperty('ava-line', 'line-width', byHighlight(2.6, ['match', ['get', 'depth'], 0, 1.8, 1.2]) as never)
  map.setPaintProperty('ava-line', 'line-opacity', byHighlight(0.95, 0.6) as never)
}

function refresh() {
  if (!map?.getSource('records')) return
  ;(map.getSource('records') as GeoJSONSource | undefined)?.setData(recordData())
  ;(map.getSource('links') as GeoJSONSource | undefined)?.setData(linkData())
  paintAvas()
}

// Everything the site adds to a Mapbox style; run again whenever the style changes
async function addLayers() {
  if (!map) return
  const dark = isDark.value
  const accent = token('--accent')
  const surface = token('--surface')
  const text = token('--text-primary')
  const images = await Promise.all([
    markerImage('winery', token('--node-winery'), surface),
    markerImage('vineyard', token('--node-vineyard'), surface),
  ])
  await avaReady
  if (!map || map.getSource('records')) return
  map.addImage('marker-winery', images[0], { pixelRatio: 2 })
  map.addImage('marker-vineyard', images[1], { pixelRatio: 2 })

  // Terrain: elevation, for 3D and for the shaded relief
  map.addSource('dem', { type: 'raster-dem', url: 'mapbox://mapbox.mapbox-terrain-dem-v1', tileSize: 512, maxzoom: 14 })
  if (terrain3d.value) map.setTerrain({ source: 'dem', exaggeration: 1.6 })
  const firstLabel = map.getStyle().layers?.find((layer) => layer.type === 'symbol')?.id
  // Mapbox's plain light and dark styles, warmed to the site's paper and cellar, with shaded
  // relief and contour lines drawn over them from Mapbox's terrain data
  const ground = token('--page')
  if (map.getLayer('land')) map.setPaintProperty('land', 'background-color', ground)
  if (map.getLayer('water')) map.setPaintProperty('water', 'fill-color', dark ? '#0b0a0d' : '#dfe4e3')
  map.addLayer(
    {
      id: 'relief',
      type: 'hillshade',
      source: 'dem',
      paint: dark
        ? {
            'hillshade-shadow-color': '#000000',
            'hillshade-highlight-color': '#6b5a5f',
            'hillshade-accent-color': '#1a1214',
            'hillshade-exaggeration': 0.55,
          }
        : {
            'hillshade-shadow-color': '#3e2f28',
            'hillshade-highlight-color': '#fffdf8',
            'hillshade-accent-color': '#5e4a3e',
            'hillshade-exaggeration': 0.5,
          },
    },
    firstLabel,
  )
  map.addSource('contours', { type: 'vector', url: 'mapbox://mapbox.mapbox-terrain-v2' })
  map.addLayer(
    {
      id: 'contours',
      type: 'line',
      source: 'contours',
      'source-layer': 'contour',
      minzoom: 9,
      paint: {
        'line-color': dark ? '#c8babd' : '#7a5f4c',
        // Every fifth line (index 5 or 10) a little stronger, as on a survey map
        'line-opacity': ['match', ['get', 'index'], [5, 10], dark ? 0.22 : 0.28, dark ? 0.1 : 0.13],
        'line-width': ['match', ['get', 'index'], [5, 10], 0.8, 0.5],
      },
    },
    firstLabel,
  )

  const outlines = avaFeatures.filter((feature) => !feature.properties.label)
  const labels = avaFeatures
    .filter((feature) => feature.properties.label)
    .map((feature) => ({
      ...feature,
      properties: { ...feature.properties, name: nodeById.value.get(feature.properties.id)?.name ?? feature.properties.id },
    }))
  map.addSource('avas', { type: 'geojson', data: { type: 'FeatureCollection', features: outlines } as never })
  map.addSource('ava-labels', { type: 'geojson', data: { type: 'FeatureCollection', features: labels } as never })
  map.addLayer({ id: 'ava-fill', type: 'fill', source: 'avas', paint: { 'fill-color': accent, 'fill-opacity': 0.05 } }, firstLabel)
  map.addLayer(
    {
      id: 'ava-line',
      type: 'line',
      source: 'avas',
      layout: { 'line-join': 'round' },
      paint: { 'line-color': accent, 'line-width': 1.2, 'line-opacity': 0.6 },
    },
    firstLabel,
  )
  // Names by how far in an AVA sits: the large regions from afar, the smaller ones closer in
  const labelLayer = (depth: number, minzoom: number, maxzoom: number, size: number) =>
    map!.addLayer({
      id: `ava-label-${depth}`,
      type: 'symbol',
      source: 'ava-labels',
      minzoom,
      maxzoom,
      filter: depth === 2 ? ['>=', ['get', 'depth'], 2] : ['==', ['get', 'depth'], depth],
      layout: {
        'text-field': ['upcase', ['get', 'name']],
        'text-font': ['DIN Pro Italic', 'Arial Unicode MS Regular'],
        'text-size': size,
        'text-letter-spacing': 0.12,
        'text-max-width': 8,
        'text-padding': 4,
      },
      paint: { 'text-color': accent, 'text-halo-color': surface, 'text-halo-width': 1.6, 'text-opacity': 0.9 },
    })
  labelLayer(0, 0, 9, 13)
  labelLayer(1, 7.6, 24, 12)
  labelLayer(2, 9.4, 24, 11)

  map.addSource('records', { type: 'geojson', data: recordData() })
  map.addSource('links', { type: 'geojson', data: linkData() })
  map.addLayer({
    id: 'links',
    type: 'line',
    source: 'links',
    layout: { 'line-cap': 'round' },
    paint: { 'line-color': accent, 'line-width': 1.6, 'line-opacity': 0.75, 'line-dasharray': [2, 1.5] },
  })
  map.addLayer({
    id: 'records-halo',
    type: 'circle',
    source: 'records',
    filter: ['==', ['get', 'role'], 'selected'],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 13, 12, 22],
      'circle-color': accent,
      'circle-opacity': 0.28,
      'circle-stroke-color': accent,
      'circle-stroke-width': 2,
      'circle-pitch-alignment': 'map',
    },
  })
  map.addLayer({
    id: 'records',
    type: 'symbol',
    source: 'records',
    layout: {
      'icon-image': ['concat', 'marker-', ['get', 'type']],
      'icon-size': [
        'interpolate',
        ['linear'],
        ['zoom'],
        6,
        ['match', ['get', 'role'], 'selected', 0.85, 0.55],
        12,
        ['match', ['get', 'role'], 'selected', 1.3, 0.95],
      ],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'symbol-sort-key': ['get', 'order'],
      'text-field': ['get', 'name'],
      'text-font': FONT,
      'text-size': ['interpolate', ['linear'], ['zoom'], 7, 11, 12, 13],
      'text-variable-anchor': ['left', 'right', 'top', 'bottom'],
      'text-radial-offset': 1.1,
      'text-justify': 'auto',
      'text-max-width': 9,
      'text-optional': true,
    },
    paint: {
      'icon-opacity': ['match', ['get', 'role'], 'dim', 0.45, 1],
      'text-color': text,
      'text-halo-color': surface,
      'text-halo-width': 1.5,
      'text-opacity': ['match', ['get', 'role'], 'dim', 0.55, 1],
    },
  })
  paintAvas()
  map.getCanvas().setAttribute('aria-label', 'Map of Oregon wineries and AVAs. The list view holds the same records.')
}

// --- The camera ------------------------------------------------------------------------

// Room the floating toolbar (and on smaller screens the record's sheet) takes over the map
const insets = reactive({ top: 0, bottom: 0 })
function measureInsets() {
  const box = container.value?.getBoundingClientRect()
  if (!box) return
  const root = container.value?.closest('.graph-canvas')
  const toolbar = root?.querySelector('.graph-canvas__toolbar')?.getBoundingClientRect()
  insets.top = toolbar ? Math.max(0, toolbar.bottom - box.top) : 0
  insets.bottom = 0
  const sheet = document.querySelector('.detail')?.getBoundingClientRect()
  // A sheet across the bottom of the map (phones and tablets), not the desktop's side panel
  if (sheet && sheet.width > box.width * 0.6 && sheet.top > box.top + box.height * 0.3 && sheet.top < box.bottom) {
    insets.bottom = box.bottom - sheet.top
  }
}

function padding() {
  measureInsets()
  const height = container.value?.clientHeight ?? 0
  const top = insets.top + 24
  const bottom = Math.min(insets.bottom + 40, Math.max(0, height - top - 120))
  return { top, bottom, left: 32, right: 32 }
}

const animate = () => !reducedMotion.matches

function fitTo(bounds: LngLatBoundsLike, maxZoom = 12) {
  // Keeping the tilt and turn: fitBounds would otherwise lay the map flat
  map?.fitBounds(bounds, { padding: padding(), maxZoom, pitch: map.getPitch(), bearing: map.getBearing(), animate: animate(), duration: 700 })
}

function boundsOf(nodes: Located[]): mapboxgl.LngLatBounds | null {
  if (nodes.length === 0) return null
  const bounds = new mapboxgl.LngLatBounds()
  for (const node of nodes) bounds.extend([node.coordinates.lng, node.coordinates.lat])
  return bounds
}

// Fit: the AVAs the filter keeps, or everything on the map
function fit() {
  if (!map) return
  if (state.avas.length > 0) {
    const bounds = new mapboxgl.LngLatBounds()
    for (const id of state.avas) {
      const each = avaBounds(id)
      if (each) bounds.extend(each as mapboxgl.LngLatBounds)
    }
    if (!bounds.isEmpty()) return fitTo(bounds)
  }
  fitTo(boundsOf(located.value) ?? OREGON, 11)
}

function zoomBy(factor: number) {
  if (!map) return
  map.easeTo({ zoom: map.getZoom() + Math.log2(factor), duration: animate() ? 250 : 0 })
}

// Brings the selection into view: a record on the map, an AVA's outline, or for anyone else
// the connections that light up with them
function showSelection() {
  if (!map) return
  const record = selected.value
  if (!record) return
  if (isLocated(record) && locatedIds.value.has(record.id)) {
    const point: [number, number] = [record.coordinates.lng, record.coordinates.lat]
    const inView = map.getBounds()?.contains(point) && map.getZoom() >= 9.5
    if (!inView) {
      map.flyTo({ center: point, zoom: Math.max(map.getZoom(), 10.5), padding: padding(), essential: false, animate: animate(), duration: 900 })
    }
    return
  }
  if (record.type === 'ava') {
    const bounds = avaBounds(record.id)
    if (bounds) fitTo(bounds)
    return
  }
  const lit = [...near.value].map((id) => nodeById.value.get(id)).filter(isLocated)
  const bounds = boundsOf(lit)
  if (bounds) fitTo(bounds, 11)
}

// --- Terrain in 3D ---------------------------------------------------------------------

const terrain3d = ref(false)
function toggleTerrain() {
  if (!map) return
  terrain3d.value = !terrain3d.value
  map.setTerrain(terrain3d.value ? { source: 'dem', exaggeration: 1.6 } : null)
  map.easeTo({ pitch: terrain3d.value ? 62 : 0, bearing: terrain3d.value ? map.getBearing() : 0, duration: animate() ? 800 : 0 })
}

// The 3D switch sits with Mapbox's compass, as a control of the map's own
class TerrainControl implements mapboxgl.IControl {
  onAdd() {
    return terrainButton.value!
  }
  onRemove() {}
}

// --- Pointing at things ----------------------------------------------------------------

const tooltip = reactive({ show: false, x: 0, y: 0, title: '', detail: '' })

// The site's layers are briefly missing while a new style loads (a theme change)
const ready = () => !!map?.getLayer('records')

function onMove(event: mapboxgl.MapMouseEvent) {
  if (!map || !ready()) return
  const feature = map.queryRenderedFeatures(event.point, { layers: ['records'] })[0]
  const label = feature ? undefined : map.queryRenderedFeatures(event.point, { layers: ['ava-label-0', 'ava-label-1', 'ava-label-2'] })[0]
  map.getCanvas().style.cursor = feature || label ? 'pointer' : ''
  if (!feature) {
    tooltip.show = false
    return
  }
  const node = nodeById.value.get(String(feature.properties?.id))
  tooltip.title = node?.name ?? ''
  tooltip.detail = node?.place ?? ''
  tooltip.x = event.point.x
  tooltip.y = event.point.y - 18
  tooltip.show = true
}

// A record opens its details; an AVA's name opens the AVA; anywhere else closes the record
function onClick(event: mapboxgl.MapMouseEvent) {
  if (!map || !ready()) return
  const feature =
    map.queryRenderedFeatures(event.point, { layers: ['records'] })[0] ??
    map.queryRenderedFeatures(event.point, { layers: ['ava-label-0', 'ava-label-1', 'ava-label-2'] })[0]
  select(feature ? String(feature.properties?.id) : null)
}

// --- Lifecycle -------------------------------------------------------------------------

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  if (!container.value) return
  mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN ?? ''
  map = new mapboxgl.Map({
    container: container.value,
    style: isDark.value ? STYLES.dark : STYLES.light,
    bounds: OREGON,
    fitBoundsOptions: { padding: 32 },
    maxPitch: 75,
    attributionControl: false,
    logoPosition: 'bottom-left',
    cooperativeGestures: false,
  })
  map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left')
  map.addControl(new mapboxgl.NavigationControl({ showZoom: false, visualizePitch: true }), 'top-right')
  map.addControl(new TerrainControl(), 'top-right')
  map.on('style.load', () => void addLayers())
  // Opens on the record already chosen, or on everything
  map.once('load', () => (state.selectedId ? showSelection() : fit()))
  map.on('mousemove', onMove)
  map.on('mouseout', () => (tooltip.show = false))
  map.on('movestart', () => (tooltip.show = false))
  map.on('click', onClick)
  measureInsets()
  resizeObserver = new ResizeObserver(() => {
    measureInsets()
    map?.resize()
  })
  resizeObserver.observe(container.value)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  map?.remove()
  map = null
})

// The dark style for the dark theme; the site's layers are added again once it loads
watch(isDark, (dark) => map?.setStyle(dark ? STYLES.dark : STYLES.light))
watch([located, near, () => state.selectedId, () => state.avas.join()], refresh)
// The camera moves only while the map shows; what changed meanwhile is caught up in shown()
let refitWhenShown = false
watch(
  () => state.selectedId,
  () => state.mapView && showSelection(),
)
watch([() => state.avas.join(), () => state.focus], () => {
  if (state.mapView) fit()
  else refitWhenShown = true
})

// The map was hidden and has come back (GraphCanvas keeps it while other views show)
function shown() {
  map?.resize()
  measureInsets()
  if (state.selectedId) showSelection()
  else if (refitWhenShown) fit()
  refitWhenShown = false
}

defineExpose({ fit, zoomBy, shown })
</script>

<template>
  <div class="geo-map" :class="{ 'geo-map--dark': isDark }" :style="{ '--map-top': `${insets.top + 12}px` }">
    <div ref="container" class="geo-map__canvas"></div>
    <!-- Mapbox moves it into the map's own corner controls (TerrainControl) -->
    <div ref="terrainButton" class="mapboxgl-ctrl mapboxgl-ctrl-group">
      <button
        type="button"
        class="geo-map__terrain"
        :aria-pressed="terrain3d"
        :title="terrain3d ? 'Flat map' : 'Tilt the map to show the hills in 3D'"
        @click="toggleTerrain"
      >
        3D
      </button>
    </div>
    <div v-show="tooltip.show" class="geo-map__tooltip" aria-hidden="true" :style="{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }">
      <strong>{{ tooltip.title }}</strong>
      <span v-if="tooltip.detail">{{ tooltip.detail }}</span>
    </div>
    <p class="geo-map__note" role="status">{{ note }}</p>
  </div>
</template>

<style scoped>
.geo-map {
  position: absolute;
  inset: 0 var(--inset-right, 0px) 0 var(--inset-left, 0px);
  background: var(--surface);
}

.geo-map__canvas {
  position: absolute;
  inset: 0;
}

/* Mapbox's compass and the 3D switch, top right below the floating toolbar */
.geo-map :deep(.mapboxgl-ctrl-top-right) {
  top: var(--map-top);
}

.geo-map :deep(.mapboxgl-ctrl-group) {
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--frost);
  -webkit-backdrop-filter: var(--frost-blur);
  backdrop-filter: var(--frost-blur);
  box-shadow: none;
}

.geo-map :deep(.mapboxgl-ctrl-group button) {
  width: 36px;
  height: 36px;
}

.geo-map__terrain {
  color: var(--text-primary);
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 700;
  cursor: pointer;
}

/* Mapbox's own button rules (a grey hover) are more specific than a plain class */
.geo-map .mapboxgl-ctrl-group .geo-map__terrain[aria-pressed='true'],
.geo-map .mapboxgl-ctrl-group .geo-map__terrain[aria-pressed='true']:hover {
  border-radius: calc(var(--radius) - 1px);
  background: var(--fill);
  color: var(--on-fill);
}

/* Bottom left, beside Mapbox's logo (with the attribution above it) */
.geo-map__note {
  position: absolute;
  z-index: 1;
  bottom: 10px;
  left: 104px;
  max-width: calc(100% - 104px - 64px);
  margin: 0;
  padding: 0.2rem 0.55rem;
  border-radius: var(--radius-sm);
  background: var(--frost);
  -webkit-backdrop-filter: var(--frost-blur);
  backdrop-filter: var(--frost-blur);
  color: var(--text-secondary);
  font-size: 0.8125rem;
  pointer-events: none;
}

.geo-map__tooltip {
  position: absolute;
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-width: 16rem;
  padding: 0.35rem 0.6rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
  box-shadow: var(--shadow);
  color: var(--text-primary);
  font-size: 0.8125rem;
  pointer-events: none;
  transform: translate(-50%, -100%);
}

.geo-map__tooltip span {
  color: var(--text-secondary);
}

/* Mapbox draws its compass dark; light on the dark theme */
.geo-map--dark :deep(.mapboxgl-ctrl-icon) {
  filter: invert(1) hue-rotate(180deg);
}

/* Mapbox's attribution in the site's colours, still legible as its terms require */
.geo-map :deep(.mapboxgl-ctrl-attrib) {
  background: var(--frost);
  color: var(--text-secondary);
}

.geo-map :deep(.mapboxgl-ctrl-attrib a) {
  color: var(--text-secondary);
}
</style>
