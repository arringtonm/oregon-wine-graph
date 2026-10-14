<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useGraph, type ToggleableNodeType } from '../composables/useGraph'
import { EDGE_CATEGORIES, EDGE_CATEGORY_LABELS, NODE_TYPE_LABELS, type NodeType } from '../data/schema'
import NodeGlyph from './NodeGlyph.vue'

const { state, avas, visibleNodes, visibleEdges, search, select, announce } = useGraph()

const sortedAvas = computed(() => [...avas.value].sort((a, b) => a.name.localeCompare(b.name)))
const avaSummary = computed(() => {
  if (state.avas.length === 0) return 'All regions'
  if (state.avas.length > 1) return `${state.avas.length} chosen`
  return avas.value.find((ava) => ava.id === state.avas[0])?.name.replace(/ AVA$/, '') ?? '1 chosen'
})

const toggleableTypes = Object.keys(state.nodeTypes) as ToggleableNodeType[]
// Read after each search result, so "Eyrie" is heard as a winery or a vineyard
const TYPE_NAMES: Record<NodeType, string> = {
  person: 'person',
  winery: 'winery',
  vineyard: 'vineyard',
  ava: 'AVA',
  organization: 'organization',
  event: 'event',
}

// Search follows the ARIA combobox pattern: the input owns a listbox of results and
// points at the highlighted one with aria-activedescendant
const query = ref('')
const results = computed(() => search(query.value))
const expanded = computed(() => query.value.trim() !== '')
const active = ref(-1)
const searchInput = ref<HTMLInputElement>()

watch(query, () => {
  active.value = -1
  if (!expanded.value) return
  const count = results.value.length
  announce(count === 0 ? 'No matches' : `${count} result${count === 1 ? '' : 's'}, use the up and down arrows to choose`)
})

function pick(id: string) {
  // An AVA is only drawn with the AVA regions layer, so turn it on to show the one picked
  if (avas.value.some((ava) => ava.id === id)) state.categories.geography = true
  select(id, { focusDetails: true })
  query.value = ''
  // Focus goes to the chosen node's details, not back to the drawer's button
  keepFocusOnClose = true
  state.filtersOpen = false
}

function onSearchKey(event: KeyboardEvent) {
  const count = results.value.length
  if (event.key === 'ArrowDown' && count) {
    event.preventDefault()
    active.value = (active.value + 1) % count
  } else if (event.key === 'ArrowUp' && count) {
    event.preventDefault()
    active.value = (active.value - 1 + count) % count
  } else if (event.key === 'Enter' && count) {
    event.preventDefault()
    pick(results.value[Math.max(active.value, 0)].id)
  } else if (event.key === 'Escape' && query.value) {
    // Escape clears the search first; a second Escape closes the drawer
    event.stopPropagation()
    query.value = ''
  }
}

// On small screens the sidebar is a drawer over the graph, behaving as a modal dialog
const compactQuery = window.matchMedia('(max-width: 1024px)')
const compact = ref(compactQuery.matches)
const onCompactChange = () => (compact.value = compactQuery.matches)
onMounted(() => compactQuery.addEventListener('change', onCompactChange))
onBeforeUnmount(() => compactQuery.removeEventListener('change', onCompactChange))
const isDialog = computed(() => compact.value && state.filtersOpen)
let keepFocusOnClose = false

watch(
  () => state.filtersOpen,
  async (open) => {
    if (!compact.value) return
    await nextTick()
    // Opening moves focus into the drawer; closing returns it to the button that opened it
    if (open) searchInput.value?.focus()
    else if (!keepFocusOnClose) document.getElementById('filters-toggle')?.focus()
    keepFocusOnClose = false
  },
)

function onDrawerKey(event: KeyboardEvent) {
  if (event.key === 'Escape' && isDialog.value) state.filtersOpen = false
}
</script>

<template>
  <aside
    id="filters"
    class="controls"
    :class="{ 'controls--open': state.filtersOpen }"
    aria-label="Search and filters"
    :role="isDialog ? 'dialog' : undefined"
    :aria-modal="isDialog ? 'true' : undefined"
    @keydown="onDrawerKey"
  >
    <button type="button" class="controls__close" @click="state.filtersOpen = false">Done</button>
    <div class="controls__search">
      <label for="search" class="visually-hidden">Search people and places</label>
      <input
        id="search"
        ref="searchInput"
        v-model="query"
        type="search"
        placeholder="Search people and places"
        role="combobox"
        autocomplete="off"
        aria-autocomplete="list"
        aria-controls="search-results"
        :aria-expanded="expanded"
        :aria-activedescendant="active >= 0 ? `search-option-${active}` : undefined"
        @keydown="onSearchKey"
      />
      <ul v-show="expanded" id="search-results" class="controls__results" role="listbox" aria-label="Search results">
        <li
          v-for="(node, index) in results"
          :id="`search-option-${index}`"
          :key="node.id"
          role="option"
          :aria-selected="index === active"
          :class="{ 'controls__option--active': index === active }"
          @mousedown.prevent
          @click="pick(node.id)"
        >
          <NodeGlyph :type="node.type" />
          {{ node.name }}
          <span class="visually-hidden">, {{ TYPE_NAMES[node.type] }}</span>
        </li>
        <li v-if="results.length === 0" class="controls__empty" role="presentation">No matches</li>
      </ul>
    </div>

    <fieldset>
      <legend>Show</legend>
      <label v-for="type in toggleableTypes" :key="type">
        <input v-model="state.nodeTypes[type]" type="checkbox" />
        <NodeGlyph :type="type" />
        {{ NODE_TYPE_LABELS[type] }}
      </label>
    </fieldset>

    <fieldset>
      <legend>Connections</legend>
      <label v-for="category in EDGE_CATEGORIES" :key="category">
        <input v-model="state.categories[category]" type="checkbox" />
        <span class="controls__line" :class="`controls__line--${category}`" aria-hidden="true"></span>
        {{ category === 'geography' ? 'AVA regions' : EDGE_CATEGORY_LABELS[category] }}
        <NodeGlyph v-if="category === 'geography'" type="ava" />
      </label>
    </fieldset>

    <fieldset>
      <legend>Narrow</legend>
      <details class="controls__avas">
        <summary>
          AVA
          <span class="controls__avas-chosen">{{ avaSummary }}</span>
        </summary>
        <fieldset class="controls__avas-list">
          <legend class="visually-hidden">AVAs to show</legend>
          <button v-if="state.avas.length" type="button" class="controls__clear" @click="state.avas = []">
            Clear AVAs
          </button>
          <label v-for="ava in sortedAvas" :key="ava.id">
            <input v-model="state.avas" type="checkbox" :value="ava.id" />
            {{ ava.name.replace(/ AVA$/, '') }}
          </label>
        </fieldset>
      </details>
      <label>
        <input v-model="state.oregonOnly" type="checkbox" aria-describedby="oregon-only-hint" />
        Oregon only
      </label>
      <p id="oregon-only-hint" class="controls__hint">
        <span class="controls__outside" aria-hidden="true"></span>
        A dashed outline on the graph marks people and places outside Oregon.
      </p>
      <label>
        <input v-model="state.verifiedOnly" type="checkbox" />
        Verified records only
      </label>
    </fieldset>

    <p class="controls__count" role="status">
      {{ visibleNodes.length }} nodes, {{ visibleEdges.length }} connections shown
    </p>
  </aside>
</template>

<style scoped>
.controls {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
  overflow-y: auto;
  border-right: 1px solid var(--border);
  background: var(--surface-raised);
}

.controls__close {
  display: none;
  align-self: flex-end;
  min-height: 36px;
  padding: 0 0.75rem;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--surface);
  color: inherit;
  font: inherit;
  cursor: pointer;
}

/* Tablet and smaller: the filters become a drawer over the graph */
@media (max-width: 1024px) {
  .controls {
    position: absolute;
    z-index: 3;
    top: 0;
    bottom: 0;
    left: 0;
    display: none;
    width: min(22rem, 85vw);
    box-shadow: 4px 0 16px rgba(0, 0, 0, 0.2);
  }

  .controls--open {
    display: flex;
  }

  .controls__close {
    display: block;
  }
}

.controls__search {
  position: relative;
}

.controls__search input {
  width: 100%;
}

.controls__results {
  position: absolute;
  z-index: 2;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  margin: 0;
  padding: 4px;
  list-style: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-raised);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}

.controls__results [role='option'] {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 32px;
  padding: 0.375rem 0.5rem;
  border-radius: 4px;
  cursor: pointer;
}

.controls__results [role='option']:hover,
.controls__option--active {
  background: var(--wash);
}

/* The highlighted option is shown with an outline as well as the wash, since focus stays in the input */
.controls__option--active {
  outline: 2px solid var(--link);
  outline-offset: -2px;
}

.controls__empty {
  padding: 0.375rem 0.5rem;
  color: var(--text-secondary);
}

fieldset {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

legend {
  margin-bottom: 6px;
  padding: 0;
  color: var(--text-secondary);
  font-size: 0.875rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.controls__avas summary {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  cursor: pointer;
}

.controls__avas-chosen {
  color: var(--text-secondary);
}

.controls__avas[open] {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.controls__avas[open] summary {
  margin-bottom: 4px;
}

.controls__clear {
  align-self: flex-start;
  padding: 0.125rem 0.5rem;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--surface);
  color: inherit;
  font: inherit;
  font-size: 0.875rem;
  cursor: pointer;
}

.controls__line {
  flex: none;
  width: 18px;
  border-top: 2px solid var(--edge);
}

.controls__line--people {
  border-top-style: dashed;
}

.controls__line--geography {
  border-top-style: dotted;
}

.controls__avas-list {
  gap: 0.25rem;
}

.controls__hint {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin: 0 0 0 1.5rem;
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.controls__outside {
  flex: none;
  width: 12px;
  height: 12px;
  margin-top: 0.2em;
  border: 1.5px dashed var(--text-primary);
  border-radius: 50%;
}

.controls__count {
  margin: auto 0 0;
  color: var(--text-secondary);
  font-size: 0.875rem;
}
</style>
