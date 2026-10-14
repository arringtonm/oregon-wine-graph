<script setup lang="ts">
import { computed } from 'vue'
import { nodeYears, useGraph } from '../composables/useGraph'
import { EDGE_CATEGORY_LABELS, NODE_TYPE_LABELS } from '../data/schema'
import NodeGlyph from './NodeGlyph.vue'

const { selectedNode, connectionsOf, select } = useGraph()

const groups = computed(() => (selectedNode.value ? connectionsOf(selectedNode.value.id) : []))
const facts = computed(() =>
  selectedNode.value
    ? [nodeYears(selectedNode.value), selectedNode.value.place].filter(Boolean).join(' · ')
    : '',
)
</script>

<template>
  <aside class="detail">
    <template v-if="selectedNode">
      <header>
        <p class="detail__type">
          <NodeGlyph :type="selectedNode.type" />
          {{ NODE_TYPE_LABELS[selectedNode.type] }}
          <template v-if="selectedNode.outsideOregon"> · outside Oregon</template>
        </p>
        <button type="button" class="detail__close" aria-label="Close" @click="select(null)">×</button>
        <h2>{{ selectedNode.name }}</h2>
        <p v-if="selectedNode.aka" class="detail__aka">Also known as {{ selectedNode.aka.join(', ') }}</p>
        <p v-if="facts" class="detail__facts">{{ facts }}</p>
      </header>

      <p>{{ selectedNode.summary }}</p>
      <p v-if="!selectedNode.verified" class="detail__badge">Unverified draft</p>

      <section v-for="group in groups" :key="group.category">
        <h3>{{ EDGE_CATEGORY_LABELS[group.category] }}</h3>
        <ul>
          <li v-for="{ edge, other, label, years } in group.connections" :key="edge.id">
            <span class="detail__verb">{{ label }}</span>
            <button type="button" class="detail__link" @click="select(other.id)">
              <NodeGlyph :type="other.type" />
              {{ other.name }}
            </button>
            <span v-if="years" class="detail__years">{{ years }}</span>
            <span v-if="edge.note" class="detail__note">{{ edge.note }}</span>
          </li>
        </ul>
      </section>
      <p v-if="groups.length === 0" class="detail__facts">No connections recorded yet.</p>

      <section>
        <h3>Sources</h3>
        <ul>
          <li v-for="source in selectedNode.sources" :key="source.url">
            <a :href="source.url" target="_blank" rel="noopener">{{ source.title }}</a>
          </li>
        </ul>
      </section>
    </template>

    <template v-else>
      <h2>Oregon wine, connected</h2>
      <p>
        Select a person, winery or vineyard to see who founded it, who made the wine, where the fruit
        came from and how its people are related.
      </p>
      <p class="detail__facts">
        Drag to pan, scroll to zoom. Hover a line to read the connection.
      </p>
    </template>
  </aside>
</template>

<style scoped>
.detail {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  overflow-y: auto;
  border-left: 1px solid var(--border);
  background: var(--surface-raised);
}

header {
  position: relative;
}

h2 {
  margin: 4px 32px 0 0;
  font-size: 20px;
  line-height: 1.25;
}

h3 {
  margin: 4px 0 6px;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

p {
  margin: 0;
}

ul {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 6px;
}

.detail__type {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-secondary);
  font-size: 12px;
}

.detail__close {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 4px;
  background: none;
  color: var(--text-secondary);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

.detail__close:hover {
  background: var(--wash);
}

.detail__aka,
.detail__facts,
.detail__verb,
.detail__years {
  color: var(--text-secondary);
}

.detail__aka,
.detail__facts {
  margin-top: 2px;
  font-size: 13px;
}

.detail__years {
  font-variant-numeric: tabular-nums;
}

.detail__note {
  flex-basis: 100%;
  color: var(--text-secondary);
  font-size: 12px;
}

.detail__badge {
  align-self: flex-start;
  padding: 2px 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-secondary);
  font-size: 12px;
}

.detail__link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0;
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

.detail__link:hover {
  text-decoration-color: currentColor;
}

a {
  color: var(--link);
}
</style>
