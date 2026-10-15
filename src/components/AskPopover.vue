<script setup lang="ts">
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { ref } from 'vue'
import { useGraph } from '../composables/useGraph'
import AskQuestion from './AskQuestion.vue'
import Chevron from './Chevron.vue'

// The question box, opened from the graph toolbar. Choosing a record in an answer selects
// it like a search result and closes the box.
const { pickNode } = useGraph()
const open = ref(false)

function pick(id: string) {
  pickNode(id)
  open.value = false
}
</script>

<template>
  <PopoverRoot v-model:open="open">
    <PopoverTrigger class="ask-toggle">
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M4 4.5h12a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5H9l-3.5 3v-3H4A1.5 1.5 0 0 1 2.5 13V6A1.5 1.5 0 0 1 4 4.5z" />
        <path d="M8.3 8.2a1.8 1.8 0 1 1 2.5 1.6c-.5.2-.8.6-.8 1.1M10 12.4v.1" />
      </svg>
      Ask<Chevron />
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent class="ask-panel" align="start" :side-offset="6">
        <AskQuestion @pick="pick" />
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<style scoped>
.ask-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--frost);
  -webkit-backdrop-filter: var(--frost-blur);
  backdrop-filter: var(--frost-blur);
  color: inherit;
  font: inherit;
  cursor: pointer;
  pointer-events: auto;
}

.ask-toggle:hover {
  background: var(--wash);
}

.ask-toggle svg {
  width: 1.1rem;
  height: 1.1rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

@media (max-width: 1024px) {
  .ask-toggle {
    height: 40px;
  }
}

/* Phones: no chevron, leaving the search box more of the row */
@media (max-width: 600px) {
  .ask-toggle :deep(.chevron) {
    display: none;
  }
}
</style>

<style>
/* Teleported to the page body, outside the scoped styles above */
.ask-panel {
  z-index: 40;
  width: min(24rem, calc(100vw - 2rem));
  max-height: min(75vh, 36rem);
  padding: 0.875rem 1rem 1rem;
  overflow-y: auto;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface-raised);
  box-shadow: var(--shadow);
}
</style>
