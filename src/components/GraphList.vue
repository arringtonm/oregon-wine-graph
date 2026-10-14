<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { nodeYears, useGraph } from '../composables/useGraph'
import { NODE_TYPES, NODE_TYPE_LABELS, type GraphNode } from '../data/schema'
import { matchesQuery } from '../graph/textMatch'
import NodeGlyph from './NodeGlyph.vue'

// The nodes the graph currently shows, as a list a keyboard or screen reader can work
// through. Choosing one selects it and moves focus to its details.
const { state, visibleNodes, degree, select, announce } = useGraph()


// Narrows the list as you type: every word must appear in the name, other names, place
// or summary, ignoring case and accents
const filter = ref('')
const matching = computed(() =>
  visibleNodes.value.filter((node) => matchesQuery(filter.value, [node.name, ...(node.aka ?? []), node.place, node.summary])),
)

const groups = computed(() =>
  NODE_TYPES.map((type) => ({
    type,
    nodes: matching.value.filter((node) => node.type === type).sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((group) => group.nodes.length > 0),
)

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
  <section class="graph-list" aria-labelledby="graph-list-heading">
    <h2 id="graph-list-heading" class="visually-hidden">Graph as a list</h2>
    <div class="graph-list__bar">
      <label for="graph-list-filter">Filter this list</label>
      <input
        id="graph-list-filter"
        v-model="filter"
        type="search"
        autocomplete="off"
        placeholder="Name, place or anything in a summary"
        aria-describedby="graph-list-count"
      />
      <span id="graph-list-count" class="graph-list__total">{{ matching.length }} of {{ visibleNodes.length }}</span>
    </div>
    <section v-for="group in groups" :key="group.type" :aria-labelledby="`graph-list-${group.type}`">
      <h3 :id="`graph-list-${group.type}`">
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

.graph-list__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.75rem;
}

.graph-list__bar label {
  font-weight: 600;
}

.graph-list__bar input {
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

h3 {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0 0 0.5rem;
  font-size: 1rem;
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
