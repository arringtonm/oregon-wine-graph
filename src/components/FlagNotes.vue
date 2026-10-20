<script setup lang="ts">
import { computed } from 'vue'
import { useGraph } from '../composables/useGraph'
import { FLAG_REASONS } from '../services/flags'

// Admin mode: the open flags readers have sent about one node or connection
const props = defineProps<{ kind: 'node' | 'edge'; id: string }>()
const { flagsFor, resolveFlag } = useGraph()
const flags = computed(() => flagsFor(props.kind, props.id))

const date = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
</script>

<template>
  <ul v-if="flags.length" class="flag-notes" aria-label="Flags from readers">
    <li v-for="flag in flags" :key="flag.id">
      <span class="flag-notes__reason">Flagged: {{ FLAG_REASONS[flag.reason] }}</span>
      <span class="flag-notes__date">{{ date(flag.createdAt) }}</span>
      <span v-if="flag.note" class="flag-notes__note">{{ flag.note }}</span>
      <a v-if="flag.sourceUrl" :href="flag.sourceUrl" target="_blank" rel="noopener">
        Suggested source<span class="visually-hidden"> (opens in a new tab)</span>
      </a>
      <span v-if="flag.finding" class="flag-notes__note">Checked: {{ flag.finding }}</span>
      <a v-if="flag.prUrl" :href="flag.prUrl" target="_blank" rel="noopener">
        Pull request<span class="visually-hidden"> (opens in a new tab)</span>
      </a>
      <button type="button" @click="resolveFlag(flag.id)">Resolve</button>
    </li>
  </ul>
</template>

<style scoped>
.flag-notes {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin: 0.35rem 0 0;
  padding: 0;
  list-style: none;
}

.flag-notes li {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.25rem 0.6rem;
  padding: 0.4rem 0.55rem;
  border-left: 3px solid var(--fill);
  border-radius: var(--radius-sm);
  background: var(--wash);
  font-size: 0.8125rem;
}

.flag-notes__reason {
  font-weight: 700;
}

.flag-notes__date {
  color: var(--text-secondary);
}

.flag-notes__note {
  flex-basis: 100%;
}

.flag-notes a {
  color: var(--accent);
}

.flag-notes button {
  margin-left: auto;
  padding: 0.1rem 0.5rem;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: inherit;
  font: inherit;
  cursor: pointer;
}
</style>
