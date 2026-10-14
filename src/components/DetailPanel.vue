<script setup lang="ts">
import { computed } from 'vue'
import { nodeYears, reviewEnabled, useGraph } from '../composables/useGraph'
import { EDGE_CATEGORY_LABELS, NODE_TYPE_LABELS } from '../data/schema'
import AddConnection from './AddConnection.vue'
import NodeGlyph from './NodeGlyph.vue'
import ReviewTools from './ReviewTools.vue'

const {
  state,
  selectedNode,
  connectionsOf,
  select,
  unverified,
  setVerified,
  approveCard,
  selectNextUnverified,
  reviewQueue,
  selectNextWithVerdict,
} = useGraph()

const QUEUE_LABELS: Record<string, string> = {
  conflict: 'Source disagrees',
  partial: 'Partly supported',
  unsupported: 'Unsupported',
  unchecked: 'Unreadable source',
  supported: 'Supported',
  'not checked': 'Not checked',
}

const groups = computed(() => (selectedNode.value ? connectionsOf(selectedNode.value.id) : []))
const unverifiedOnCard = computed(
  () =>
    (selectedNode.value && !selectedNode.value.verified ? 1 : 0) +
    groups.value.flatMap((group) => group.connections).filter(({ edge }) => !edge.verified).length,
)
const facts = computed(() =>
  selectedNode.value
    ? [nodeYears(selectedNode.value), selectedNode.value.place].filter(Boolean).join(' · ')
    : '',
)
</script>

<template>
  <aside class="detail" :class="{ 'detail--empty': !selectedNode }">
    <div v-if="reviewEnabled" class="detail__review">
      <p>
        <strong>Review</strong>
        {{ unverified.nodes }} nodes and {{ unverified.edges }} connections unverified
      </p>
      <button
        type="button"
        :disabled="unverified.nodes + unverified.edges === 0"
        @click="selectNextUnverified"
      >
        Next unverified
      </button>
      <button
        v-for="group in reviewQueue"
        :key="group.verdict"
        type="button"
        :title="`Go to the next node with a record in this group`"
        @click="selectNextWithVerdict(group.verdict)"
      >
        {{ QUEUE_LABELS[group.verdict] }} {{ group.nodeIds.length }}
      </button>
      <button v-if="selectedNode && unverifiedOnCard > 0" type="button" @click="approveCard(selectedNode)">
        Approve all {{ unverifiedOnCard }} on this card
      </button>
      <p v-if="state.reviewError" class="detail__error" role="alert">{{ state.reviewError }}</p>
    </div>

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
      <p class="detail__status">
        <span v-if="!selectedNode.verified" class="detail__badge">Unverified draft</span>
        <button
          v-if="reviewEnabled"
          type="button"
          class="detail__approve"
          @click="setVerified('node', selectedNode, !selectedNode.verified)"
        >
          {{ selectedNode.verified ? 'Undo' : 'Approve' }}
        </button>
      </p>
      <ReviewTools v-if="reviewEnabled" :key="selectedNode.id" kind="node" :record="selectedNode" />

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
            <span class="detail__refs">
              <component
                :is="source.url ? 'a' : 'span'"
                v-for="(source, index) in edge.sources"
                :key="source.title"
                :href="source.url"
                :title="source.title"
                target="_blank"
                rel="noopener"
                >[{{ index + 1 }}]</component
              >
            </span>
            <button
              v-if="reviewEnabled"
              type="button"
              class="detail__approve"
              @click="setVerified('edge', edge, !edge.verified)"
            >
              {{ edge.verified ? 'Undo' : 'Approve' }}
            </button>
            <span v-if="edge.note" class="detail__note">{{ edge.note }}</span>
            <ReviewTools v-if="reviewEnabled" :key="edge.id" kind="edge" :record="edge" />
          </li>
        </ul>
      </section>
      <p v-if="groups.length === 0" class="detail__facts">No connections recorded yet.</p>

      <AddConnection v-if="reviewEnabled" :key="selectedNode.id" :node="selectedNode" />

      <section>
        <h3>Sources</h3>
        <ul>
          <li v-for="source in selectedNode.sources" :key="source.title">
            <a v-if="source.url" :href="source.url" target="_blank" rel="noopener">{{ source.title }}</a>
            <span v-else>{{ source.title }}</span>
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
        Scroll with two fingers to move around and pinch to zoom, or use the buttons on the graph.
        Hover a line to read the connection.
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

/* Tablet and smaller: a sheet over the bottom of the graph, only when a node is selected */
@media (max-width: 1024px) {
  .detail {
    position: absolute;
    z-index: 2;
    right: 0;
    bottom: 0;
    left: 0;
    max-height: 45%;
    border-top: 1px solid var(--border);
    border-left: 0;
    box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.2);
  }

  .detail--empty {
    display: none;
  }
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

.detail__review {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 12px;
  border: 1px dashed var(--border-strong);
  border-radius: 6px;
  font-size: 13px;
}

.detail__review p {
  flex-basis: 100%;
}

.detail__review button,
.detail__approve {
  padding: 3px 10px;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--surface);
  color: inherit;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.detail__review button:disabled {
  cursor: default;
  opacity: 0.5;
}

.detail__error {
  color: var(--danger);
}

.detail__status {
  display: flex;
  align-items: center;
  gap: 8px;
}

.detail__refs {
  display: inline-flex;
  gap: 4px;
  font-size: 12px;
}

.detail__badge {
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
