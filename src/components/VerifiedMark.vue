<script setup lang="ts">
import { PopoverArrow, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { computed } from 'vue'
import verifiedSources from '../data/verified-sources.json'
import type { GraphEdge, GraphNode } from '../data/schema'

// A small check beside a verified record. It opens a note saying how the record was
// verified and, for the automated check, the source that supported it. A popover rather
// than a tooltip, since it holds a link and must work by tap and keyboard.
const props = defineProps<{ kind: 'node' | 'edge'; record: GraphNode | GraphEdge; label: string }>()

const supporting = computed(() => {
  const index = (verifiedSources as Record<string, number>)[`${props.kind}:${props.record.id}`]
  return index === undefined ? undefined : props.record.sources[index]
})
</script>

<template>
  <PopoverRoot v-if="record.verified">
    <PopoverTrigger class="verified" :aria-label="`Verified: ${label}`">
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="7" />
        <path d="m4.8 8.2 2.1 2.1 4.3-4.6" />
      </svg>
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent class="verified-note" side="top" :side-offset="6" :collision-padding="12">
        <template v-if="record.verifiedBy === 'jev'">
          <p><strong>Verified</strong> by Oregon Wine Graph Bot</p>
          <p v-if="supporting">
            against
            <a v-if="supporting.url" :href="supporting.url" target="_blank" rel="noopener">
              {{ supporting.title }}<span class="visually-hidden"> (opens in a new tab)</span>
            </a>
            <template v-else>{{ supporting.title }}</template>
          </p>
          <p v-else>against its cited sources</p>
        </template>
        <p v-else-if="record.verifiedBy === 'boundary'"><strong>Verified</strong> against official AVA boundary maps</p>
        <p v-else><strong>Reviewed</strong> by Oregon Wine Graph against its cited sources</p>
        <PopoverArrow class="verified-note__arrow" :width="10" :height="5" />
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<style scoped>
.verified {
  display: inline-grid;
  place-items: center;
  width: 1.5rem;
  height: 1.5rem;
  min-height: 0;
  margin: -0.2rem 0;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: none;
  color: var(--accent);
  vertical-align: middle;
  cursor: pointer;
}

.verified:hover {
  background: var(--wash);
}

.verified svg {
  width: 1rem;
  height: 1rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>

<style>
/* Teleported to the page body, outside the scoped styles above */
.verified-note {
  z-index: 45;
  max-width: 18rem;
  padding: 0.6rem 0.8rem;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface-raised);
  box-shadow: var(--shadow);
  font-size: 0.875rem;
}

.verified-note p {
  margin: 0;
}

.verified-note p + p {
  margin-top: 0.2rem;
  color: var(--text-secondary);
}

.verified-note a {
  color: var(--accent);
}

.verified-note__arrow {
  fill: var(--surface-raised);
}
</style>
