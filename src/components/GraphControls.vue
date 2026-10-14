<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGraph, type ToggleableNodeType } from '../composables/useGraph'
import { EDGE_CATEGORIES, EDGE_CATEGORY_LABELS, NODE_TYPE_LABELS } from '../data/schema'
import NodeGlyph from './NodeGlyph.vue'

const { state, avas, visibleNodes, visibleEdges, search, select } = useGraph()

const query = ref('')
const results = computed(() => search(query.value))
const toggleableTypes = Object.keys(state.nodeTypes) as ToggleableNodeType[]

function pick(id: string) {
  select(id)
  query.value = ''
}
</script>

<template>
  <aside class="controls">
    <div class="controls__search">
      <input
        v-model="query"
        type="search"
        placeholder="Search people and places"
        aria-label="Search people and places"
        @keydown.enter="results[0] && pick(results[0].id)"
      />
      <ul v-if="query.trim()" class="controls__results">
        <li v-for="node in results" :key="node.id">
          <button type="button" @click="pick(node.id)">
            <NodeGlyph :type="node.type" />
            {{ node.name }}
          </button>
        </li>
        <li v-if="results.length === 0" class="controls__empty">No matches</li>
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
        <span class="controls__line" :class="`controls__line--${category}`"></span>
        {{ EDGE_CATEGORY_LABELS[category] }}
        <template v-if="category === 'geography'">
          <NodeGlyph type="ava" />
        </template>
      </label>
    </fieldset>

    <fieldset>
      <legend>Narrow</legend>
      <label class="controls__select">
        AVA
        <select v-model="state.ava">
          <option value="">All regions</option>
          <option v-for="ava in avas" :key="ava.id" :value="ava.id">{{ ava.name }}</option>
        </select>
      </label>
      <label>
        <input v-model="state.oregonOnly" type="checkbox" />
        Oregon only
        <span class="controls__outside" title="Dashed outline marks entities outside Oregon"></span>
      </label>
      <label>
        <input v-model="state.verifiedOnly" type="checkbox" />
        Verified records only
      </label>
    </fieldset>

    <p class="controls__count">
      {{ visibleNodes.length }} nodes, {{ visibleEdges.length }} connections shown
    </p>
  </aside>
</template>

<style scoped>
.controls {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  overflow-y: auto;
  border-right: 1px solid var(--border);
  background: var(--surface-raised);
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

.controls__results button {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  border: 0;
  border-radius: 4px;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.controls__results button:hover,
.controls__results button:focus-visible {
  background: var(--wash);
}

.controls__empty {
  padding: 6px 8px;
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
  font-size: 11px;
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

.controls__select select {
  flex: 1;
  min-width: 0;
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

.controls__outside {
  width: 12px;
  height: 12px;
  border: 1.5px dashed var(--text-primary);
  border-radius: 50%;
}

.controls__count {
  margin: auto 0 0;
  color: var(--text-secondary);
  font-size: 12px;
}
</style>
