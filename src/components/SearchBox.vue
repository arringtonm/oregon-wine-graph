<script setup lang="ts">
import {
  ComboboxAnchor,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxPortal,
  ComboboxRoot,
  ComboboxViewport,
} from 'reka-ui'
import { computed, ref, watch } from 'vue'
import { useGraph } from '../composables/useGraph'
import type { NodeType } from '../data/schema'
import NodeGlyph from './NodeGlyph.vue'

// Search is a combobox: typing lists matches, the arrow keys move through them and Enter
// picks one. Reka handles the keys and the ARIA; matching is ours (ignore-filter)
const { search, announce, pickNode } = useGraph()

// Read after each result, so "Eyrie" is heard as a winery or a vineyard
const TYPE_NAMES: Record<NodeType, string> = {
  person: 'person',
  winery: 'winery',
  vineyard: 'vineyard',
  ava: 'AVA',
  organization: 'organization',
  event: 'event',
}

const query = ref('')
const results = computed(() => search(query.value))
const open = ref(false)

watch(query, () => {
  open.value = query.value.trim() !== ''
  if (!open.value) return
  const count = results.value.length
  announce(count === 0 ? 'No matches' : `${count} result${count === 1 ? '' : 's'}, use the up and down arrows to choose`)
})

function onPicked(id: unknown) {
  if (typeof id !== 'string') return
  pickNode(id)
  query.value = ''
}

// Escape clears the search first, and stops there
function onEscape(event: KeyboardEvent) {
  if (!query.value) return
  event.stopPropagation()
  query.value = ''
}
</script>

<template>
  <!-- A plain wrapper: the toolbar ignores pointer events so the graph stays draggable, and
       a scoped style can't reliably reach Reka's root to turn them back on -->
  <div class="search">
    <ComboboxRoot
      v-model:open="open"
      :model-value="null"
      ignore-filter
      :reset-search-term-on-blur="false"
      @update:model-value="onPicked"
    >
      <ComboboxAnchor class="search__anchor">
        <svg class="search__icon" viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="8.5" cy="8.5" r="5.5" />
          <path d="m12.6 12.6 4.4 4.4" />
        </svg>
        <ComboboxInput
          id="search"
          v-model="query"
          class="search__input"
          placeholder="Search"
          aria-label="Search people and places"
          autocomplete="off"
          @keydown.escape="onEscape"
        />
      </ComboboxAnchor>
      <ComboboxPortal>
        <ComboboxContent class="search-results" position="popper" :side-offset="4" align="start">
          <ComboboxViewport>
            <ComboboxItem v-for="node in results" :key="node.id" :value="node.id" :text-value="node.name" class="search-results__option">
              <NodeGlyph :type="node.type" />
              {{ node.name }}
              <span class="visually-hidden">, {{ TYPE_NAMES[node.type] }}</span>
            </ComboboxItem>
            <ComboboxEmpty class="search-results__empty">No matches</ComboboxEmpty>
          </ComboboxViewport>
        </ComboboxContent>
      </ComboboxPortal>
    </ComboboxRoot>
  </div>
</template>

<style scoped>
.search {
  pointer-events: auto;
}

.search__anchor {
  position: relative;
  display: flex;
  align-items: center;
}

.search__icon {
  position: absolute;
  /* Above the input, whose frosted backdrop makes it its own layer */
  z-index: 1;
  left: 0.6rem;
  width: 1rem;
  height: 1rem;
  fill: none;
  stroke: var(--text-secondary);
  stroke-width: 1.6;
  stroke-linecap: round;
  pointer-events: none;
}

.search__input {
  width: 12rem;
  height: 36px;
  padding: 0 0.6rem 0 2rem;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--frost);
  -webkit-backdrop-filter: var(--frost-blur);
  backdrop-filter: var(--frost-blur);
  color: inherit;
  font: inherit;
}

@media (max-width: 1024px) {
  .search__input {
    width: 12rem;
    height: 40px;
  }
}
</style>

<style>
/* The results list is teleported to the page body, outside the scoped styles above */
.search-results {
  z-index: 40;
  width: max(var(--reka-popper-anchor-width, 16rem), 16rem);
  max-height: min(60vh, 24rem);
  padding: 4px;
  overflow-y: auto;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface-raised);
  box-shadow: var(--shadow);
}

.search-results__option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 32px;
  padding: 0.375rem 0.5rem;
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.search-results__option[data-highlighted] {
  background: var(--wash);
  /* An outline as well as the wash, since focus stays in the input */
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.search-results__empty {
  padding: 0.375rem 0.5rem;
  color: var(--text-secondary);
}
</style>
