<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { nodeYears, useGraph } from '../composables/useGraph'
import { NODE_TYPES, NODE_TYPE_LABELS, type GraphNode, type NodeType } from '../data/schema'
import { matchesQuery } from '../graph/textMatch'
import NodeGlyph from './NodeGlyph.vue'

// The nodes the filters let through, as a list a keyboard or screen reader can work
// through. Choosing one selects it and moves focus to its details. Unlike the graph, the
// list isn't crowded by records with one connection or none, so it keeps them all
const { state, filteredNodes, degree, select, announce } = useGraph()


// Narrows the list as you type: every word must appear in the name, other names, place
// or summary, ignoring case and accents
const filter = ref('')
const matching = computed(() =>
  filteredNodes.value.filter((node) => matchesQuery(filter.value, [node.name, ...(node.aka ?? []), node.place, node.summary])),
)

// The order within each group: by name, or the best connected first (ties by name).
// Remembered in this browser
type Sort = 'name' | 'connections'
const SORT_KEY = 'oregon-wine-graph:list-sort'
function readSort(): Sort {
  try {
    return localStorage.getItem(SORT_KEY) === 'connections' ? 'connections' : 'name'
  } catch {
    return 'name'
  }
}
const sort = ref<Sort>(readSort())
watch(sort, (value) => {
  try {
    localStorage.setItem(SORT_KEY, value)
  } catch {
    // Kept for this visit only where storage is unavailable
  }
})
const byName = (a: GraphNode, b: GraphNode) => a.name.localeCompare(b.name)
const byConnections = (a: GraphNode, b: GraphNode) =>
  (degree.value.get(b.id) ?? 0) - (degree.value.get(a.id) ?? 0) || byName(a, b)

const groups = computed(() =>
  NODE_TYPES.map((type) => ({
    type,
    nodes: matching.value.filter((node) => node.type === type).sort(sort.value === 'connections' ? byConnections : byName),
  })).filter((group) => group.nodes.length > 0),
)

// Jump to: each group's heading, scrolled to and focused, so keyboard and screen-reader
// users land there too. Buttons, not #links: the app reads a #hash as a record's address
const root = ref<HTMLElement>()
const heading = (type: NodeType) => root.value?.querySelector<HTMLElement>(`#graph-list-${type}`)
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')
function jump(type: NodeType) {
  const target = heading(type)
  if (!target) return
  // The group's section, not its heading: a heading that's stuck reports where it's stuck,
  // so scrolling to it overshoots (to the foot of the People, from inside them)
  const section = target.closest('section') ?? target
  section.scrollIntoView({ behavior: reducedMotion?.matches ? 'auto' : 'smooth', block: 'start' })
  target.focus({ preventScroll: true })
  current.value = type
  // The smooth scroll passes the groups in between; the jump's own group holds meanwhile
  jumping = window.setTimeout(() => (jumping = 0), 900)
}
let jumping = 0

// The group being read: the last heading that has reached the sticky bar
const current = ref<NodeType | null>(null)
const bar = ref<HTMLElement>()
let scroller: HTMLElement | null = null
function trackCurrent() {
  if (!scroller || !bar.value || jumping) return
  // A group counts once its heading is within reach of the bar's foot (the gap between
  // groups included)
  const line = bar.value.getBoundingClientRect().bottom + 40
  let reading: NodeType | null = groups.value[0]?.type ?? null
  for (const group of groups.value) {
    const top = heading(group.type)?.getBoundingClientRect().top
    if (top !== undefined && top <= line) reading = group.type
  }
  current.value = reading
}

// Phones: Jump to and Sort as two compact menus in one row, so the bar (under the two-row
// toolbar) doesn't take half the screen
const phoneQuery = window.matchMedia?.('(max-width: 600px)')
const phone = ref(phoneQuery?.matches ?? false)
const onPhone = () => (phone.value = phoneQuery?.matches ?? false)
onMounted(() => phoneQuery?.addEventListener('change', onPhone))
onBeforeUnmount(() => phoneQuery?.removeEventListener('change', onPhone))

// The marker behind the group being read: one pill that slides from group to group
const jumpRow = ref<HTMLElement>()
const marker = ref<{ x: number; y: number; width: number; height: number } | null>(null)
function placeMarker() {
  const button = jumpRow.value?.querySelector<HTMLElement>('.graph-list__jump-to[aria-current]')
  marker.value = button ? { x: button.offsetLeft, y: button.offsetTop, width: button.offsetWidth, height: button.offsetHeight } : null
}
watch([current, groups], () => nextTick(placeMarker))

// The bar's height, for where the headings stick
let resize: ResizeObserver | undefined
onMounted(() => {
  scroller = root.value?.closest<HTMLElement>('.graph-canvas__list') ?? null
  scroller?.addEventListener('scroll', trackCurrent, { passive: true })
  if (typeof ResizeObserver !== 'undefined' && bar.value) {
    resize = new ResizeObserver(() => {
      root.value?.style.setProperty('--list-bar-height', `${bar.value?.offsetHeight ?? 0}px`)
      placeMarker()
    })
    resize.observe(bar.value)
  }
  trackCurrent()
})
onBeforeUnmount(() => {
  clearTimeout(jumping)
  scroller?.removeEventListener('scroll', trackCurrent)
  resize?.disconnect()
})
watch(groups, () => nextTick(trackCurrent))

// The count is announced once typing pauses, not on every keystroke
let announceTimer: ReturnType<typeof setTimeout> | undefined
watch(filter, (text) => {
  clearTimeout(announceTimer)
  announceTimer = setTimeout(() => {
    const count = matching.value.length
    announce(text.trim() ? `${count} match${count === 1 ? '' : 'es'}` : `Showing all ${count}`)
  }, 500)
})
onBeforeUnmount(() => clearTimeout(announceTimer))

function detail(node: GraphNode): string {
  const connections = degree.value.get(node.id) ?? 0
  return [nodeYears(node), node.place, `${connections} connection${connections === 1 ? '' : 's'}`]
    .filter(Boolean)
    .join(' · ')
}
</script>

<template>
  <section ref="root" class="graph-list" aria-labelledby="graph-list-heading">
    <h2 id="graph-list-heading" class="visually-hidden">Graph as a list</h2>
    <!-- Sticks under the toolbar: the filter, a jump to each group, and the order -->
    <div ref="bar" class="graph-list__bar">
      <div class="graph-list__filter">
      <label for="graph-list-filter">Filter this list</label>
      <input
        id="graph-list-filter"
        v-model="filter"
        type="search"
        autocomplete="off"
        placeholder="Name, place or anything in a summary"
        aria-describedby="graph-list-count"
      />
      <span id="graph-list-count" class="graph-list__total">{{ matching.length }} of {{ filteredNodes.length }}</span>
      </div>
      <!-- Phones: two menus in one row; the jump menu also shows the group being read -->
      <div v-if="groups.length && phone" class="graph-list__menus">
        <label class="graph-list__menu">
          <span class="visually-hidden">Jump to a group</span>
          <select :value="current ?? groups[0].type" @change="jump(($event.target as HTMLSelectElement).value as NodeType)">
            <option v-for="group in groups" :key="group.type" :value="group.type">
              {{ NODE_TYPE_LABELS[group.type] }} ({{ group.nodes.length }})
            </option>
          </select>
        </label>
        <label class="graph-list__menu">
          <span class="visually-hidden">Sort</span>
          <select v-model="sort">
            <option value="name">A–Z</option>
            <option value="connections">Most connected</option>
          </select>
        </label>
      </div>
      <div v-else-if="groups.length" class="graph-list__nav">
        <nav ref="jumpRow" class="graph-list__jump" aria-label="Jump to a group">
          <span
            v-if="marker"
            class="graph-list__marker"
            aria-hidden="true"
            :style="`width: ${marker.width}px; height: ${marker.height}px; transform: translate(${marker.x}px, ${marker.y}px)`"
          ></span>
          <span class="graph-list__label" aria-hidden="true">Jump to</span>
          <button
            v-for="group in groups"
            :key="group.type"
            type="button"
            class="graph-list__jump-to"
            :aria-current="current === group.type ? 'true' : undefined"
            @click="jump(group.type)"
          >
            <NodeGlyph :type="group.type" />
            <span>{{ NODE_TYPE_LABELS[group.type] }} <span class="graph-list__jump-count">({{ group.nodes.length }})</span></span>
          </button>
        </nav>
        <fieldset class="graph-list__sort">
          <legend class="graph-list__label">Sort</legend>
          <label><input v-model="sort" type="radio" name="graph-list-sort" value="name" /> A–Z</label>
          <label><input v-model="sort" type="radio" name="graph-list-sort" value="connections" /> Most connected</label>
        </fieldset>
      </div>
    </div>
    <section v-for="group in groups" :key="group.type" :aria-labelledby="`graph-list-${group.type}`">
      <h3 :id="`graph-list-${group.type}`" tabindex="-1">
        <NodeGlyph :type="group.type" />
        {{ NODE_TYPE_LABELS[group.type] }}
        <span class="graph-list__count">{{ group.nodes.length }}</span>
      </h3>
      <ul>
        <li v-for="node in group.nodes" :key="node.id">
          <button
            type="button"
            :aria-current="node.id === state.selectedId ? 'true' : undefined"
            :aria-describedby="`graph-list-detail-${node.id}`"
            @click="select(node.id, { focusDetails: true })"
          >
            {{ node.name }}
          </button>
          <span :id="`graph-list-detail-${node.id}`" class="graph-list__detail">{{ detail(node) }}</span>
        </li>
      </ul>
    </section>
    <p v-if="groups.length === 0 && filter.trim()">Nothing matches “{{ filter.trim() }}”.</p>
    <p v-else-if="groups.length === 0">Nothing matches the current filters.</p>
  </section>
</template>

<style scoped>
.graph-list {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  padding-inline: 1rem;
  padding-bottom: 1rem;
}

/* Sticks at the top, padded down past the toolbar that floats over the list, so its
   background also covers the strip behind the toolbar and names don't show through there */
.graph-list__bar {
  position: sticky;
  z-index: 2;
  top: 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin-inline: -1rem;
  padding: calc(var(--toolbar-bottom, calc(var(--inset-top, 0px) + 3.75rem)) + 0.6rem) 1rem 0.7rem;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}

.graph-list__filter {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.75rem;
}

.graph-list__filter label {
  font-weight: 600;
}

.graph-list__filter input {
  flex: 1 1 16rem;
  max-width: 28rem;
  min-height: 2.25rem;
  padding: 0 0.625rem;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--surface-raised);
  color: inherit;
  font: inherit;
}

.graph-list__total {
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.graph-list__nav {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 1.25rem;
}

.graph-list__label {
  color: var(--text-secondary);
  font-size: 0.875rem;
}

/* The groups. On a narrow screen they wrap to a second line rather than scroll sideways,
   which readers often miss (NN/g), so every group stays in view */
.graph-list__jump {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.15rem 0.25rem;
}

.graph-list__jump .graph-list__label {
  flex: none;
}

/* Each group as a pill: no underline; the group being read gets a soft tint of the accent,
   as a chosen item in a menu does */
.graph-list__jump-to {
  position: relative;
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 0.35rem;
  min-height: 30px;
  padding: 0 0.65rem 0 0.5rem;
  border-radius: 999px;
  font-size: 0.9375rem;
  font-weight: 500;
  text-decoration: none;
  white-space: nowrap;
}

.graph-list__jump-to:hover {
  background: var(--wash);
}

/* The group being read: a soft tint of the accent, sliding from group to group */
.graph-list__marker {
  position: absolute;
  top: 0;
  left: 0;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  transition:
    transform 0.25s ease,
    width 0.25s ease;
  pointer-events: none;
}

@media (prefers-reduced-motion: reduce) {
  .graph-list__marker {
    transition: none;
  }
}

.graph-list__jump-to[aria-current]:hover {
  background: none;
}

.graph-list__jump-count {
  color: var(--text-secondary);
}

.graph-list__sort {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem 0.75rem;
  margin: 0;
  padding: 0;
  border: 0;
}

.graph-list__sort legend {
  float: left;
  margin-right: 0.25rem;
}

.graph-list__sort label {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.9375rem;
  cursor: pointer;
}

.graph-list__sort input {
  accent-color: var(--fill);
}

/* Each group's heading sticks below the bar while you're in the group */
h3 {
  position: sticky;
  z-index: 1;
  top: calc(var(--list-bar-height, 10rem) - 1px);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0 -1rem 0.5rem;
  padding: 0.45rem 1rem;
  background: var(--surface);
  font-size: 1rem;
}

/* Phones: the bar kept short. The filter's label is for screen readers only, the count
   sits beside the box, and Jump to and Sort are two menus in one row */
.graph-list__menus {
  display: flex;
  gap: 0.5rem;
}

.graph-list__menu {
  flex: 1 1 0;
  min-width: 0;
}

.graph-list__menu:last-child {
  flex: 0 1 auto;
}

.graph-list__menu select {
  width: 100%;
  min-height: 2.25rem;
  padding: 0 0.5rem;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--surface-raised);
  color: inherit;
  font: inherit;
  font-size: 0.9375rem;
}

@media (max-width: 600px) {
  .graph-list__bar {
    gap: 0.5rem;
    padding-bottom: 0.6rem;
  }

  .graph-list__filter {
    flex-wrap: nowrap;
  }

  .graph-list__filter label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .graph-list__filter input {
    flex: 1 1 auto;
    min-width: 0;
  }

  .graph-list__total {
    flex: none;
  }

  /* The jump menu already says which group this is */
  h3 {
    position: static;
  }
}

/* Where Jump to lands: a group's section, just below the bar */
section[aria-labelledby^='graph-list-'] {
  scroll-margin-top: var(--list-bar-height, 10rem);
}

/* A landing place for Jump to, not a control: focus is announced, not outlined */
h3:focus {
  outline: none;
}

.graph-list__count {
  color: var(--text-secondary);
  font-weight: 400;
}

ul {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
  gap: 0.25rem 1rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

li {
  display: flex;
  flex-direction: column;
}

button {
  align-self: flex-start;
  padding: 0.125rem 0;
  border: 0;
  background: none;
  color: var(--text-primary);
  font: inherit;
  font-weight: 600;
  text-align: left;
  text-decoration: underline;
  text-decoration-color: var(--border-strong);
  text-underline-offset: 3px;
  cursor: pointer;
}

button:hover,
button[aria-current] {
  text-decoration-color: currentColor;
}

.graph-list__detail {
  color: var(--text-secondary);
  font-size: 0.875rem;
}
</style>
