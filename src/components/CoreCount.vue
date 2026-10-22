<script setup lang="ts">
import { PopoverArrow, PopoverClose, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { computed } from 'vue'
import { useGraph } from '../composables/useGraph'
import { click } from '../services/device'

// "841 of 1,417" in the graph's corner, while the connected core leaves records out: a button
// (so it works on touch screens too) that says why only some show, and shows the rest.
// The popover shares the look of the verification note (VerifiedInfo's .methodology)
const props = defineProps<{ shown: number; of: number }>()
const { state } = useGraph()

const format = (count: number) => count.toLocaleString('en-US')
const hidden = computed(() => props.of - props.shown)
</script>

<template>
  <PopoverRoot>
    <PopoverTrigger class="core-count">
      {{ format(shown) }} of {{ format(of) }}<span class="visually-hidden">: why only some show</span>
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent class="methodology" side="top" align="start" :side-offset="8" :collision-padding="12" aria-labelledby="core-count-heading">
        <PopoverClose class="methodology__close" aria-label="Close">
          <span aria-hidden="true">×</span>
        </PopoverClose>
        <h2 id="core-count-heading">Why only some show</h2>
        <p>
          To keep the graph readable, it opens on its closely connected core: people and places with at least two
          connections among themselves. The other {{ format(hidden) }} sit at its edges: one connection, none in this view, or a short branch off the core.
        </p>
        <p>
          They’re still a {{ click }} away: selecting a record shows all of its connections, and search and the list view
          find everyone.
        </p>
        <PopoverClose class="core-count__all" @click="state.showAll = true">Show all {{ format(of) }}</PopoverClose>
        <PopoverArrow class="methodology__arrow" :width="10" :height="5" />
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<style scoped>
/* Reads as part of the count, underlined to show it opens something */
.core-count {
  position: relative;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-decoration: underline dotted;
  text-underline-offset: 0.2em;
  cursor: pointer;
  pointer-events: auto;
}

.core-count:hover,
.core-count[data-state='open'] {
  color: var(--text-primary);
  text-decoration-style: solid;
}

/* On touch screens the tap area grows to 44px tall without moving the text */
@media (pointer: coarse) {
  .core-count::after {
    position: absolute;
    inset: 50% 0 auto;
    height: 44px;
    transform: translateY(-50%);
    content: '';
  }
}
</style>

<style>
.core-count__all {
  min-height: 32px;
  margin-top: 0.25rem;
  padding: 0.3rem 0.8rem;
  border: 0;
  border-radius: var(--radius-sm);
  background: var(--fill);
  color: var(--on-fill);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
</style>
