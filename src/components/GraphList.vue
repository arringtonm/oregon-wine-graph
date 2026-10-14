<script setup lang="ts">
import { computed } from 'vue'
import { nodeYears, useGraph } from '../composables/useGraph'
import { NODE_TYPES, NODE_TYPE_LABELS, type GraphNode } from '../data/schema'
import NodeGlyph from './NodeGlyph.vue'

// The nodes the graph currently shows, as a list a keyboard or screen reader can work
// through. Choosing one selects it and moves focus to its details.
const { state, visibleNodes, degree, select } = useGraph()

const groups = computed(() =>
  NODE_TYPES.map((type) => ({
    type,
    nodes: visibleNodes.value.filter((node) => node.type === type).sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((group) => group.nodes.length > 0),
)

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
    <p v-if="groups.length === 0">Nothing matches the current filters.</p>
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
