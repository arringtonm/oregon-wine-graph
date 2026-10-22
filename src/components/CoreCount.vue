<script setup lang="ts">
import { PopoverArrow, PopoverClose, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { computed } from 'vue'
import { useGraph } from '../composables/useGraph'
import { click } from '../services/device'

// "848 of 1,422" in the graph's corner, whenever records are left out: a button (so it works
// on touch screens too) that says why, and how to see the rest. Something leaves them out in
// one of three ways, and the note names each that applies: a guide, the filters, or the
// connected core the graph opens on.
// The popover shares the look of the verification note (VerifiedInfo's .methodology)
const props = defineProps<{ shown: number; of: number; partial: boolean }>()
const { state, activeView, activeFilters, totalRecords, startTour } = useGraph()

const format = (count: number) => count.toLocaleString('en-US')
// Of every record the opening filters let through, or of what the filters leave for the core
const outOf = computed(() => (props.partial ? props.of : totalRecords.value))
const atEdges = computed(() => props.of - props.shown)
const filtered = computed(() => !activeView.value && activeFilters.value.length > 0)
const resettable = computed(() => !!activeView.value || filtered.value)

// Once this note has closed and handed focus back to its button: opened any sooner, the
// Controls guide would take that focus moving as a press outside it, and close again
const afterClosing = (then: () => void) => setTimeout(then, 0)
</script>

<template>
  <PopoverRoot>
    <PopoverTrigger class="core-count">
      {{ shown < outOf ? `${format(shown)} of ${format(outOf)}` : format(shown) }}<span class="visually-hidden">: why only some show</span>
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent class="methodology" side="top" align="start" :side-offset="8" :collision-padding="12" aria-labelledby="core-count-heading">
        <PopoverClose class="methodology__close" aria-label="Close">
          <span aria-hidden="true">×</span>
        </PopoverClose>
        <h2 id="core-count-heading">Why only some show</h2>
        <p v-if="activeView">
          The <strong>{{ activeView.title }}</strong> guide is on: {{ activeView.blurb }}
        </p>
        <template v-else-if="filtered">
          <p>These filters are on:</p>
          <ul class="core-count__filters">
            <li v-for="phrase in activeFilters" :key="phrase">{{ phrase }}</li>
          </ul>
        </template>
        <template v-if="partial">
          <p>
            To keep the graph readable, it {{ filtered ? 'also keeps' : 'opens' }} to its closely connected core: people
            and places with at least two connections among themselves. The other {{ format(atEdges) }} sit at its
            edges: one connection, none in this view, or a short branch off the core.
          </p>
          <p>
            They’re still a {{ click }} away: selecting a record shows all of its connections, and search and the list
            view find everyone.
          </p>
        </template>
        <p v-if="resettable">Reset {{ activeView ? 'ends the guide' : 'clears them' }} and shows the opening graph.</p>
        <div class="core-count__actions">
          <PopoverClose v-if="partial" class="core-count__action" @click="state.showAll = true">Show all {{ format(of) }}</PopoverClose>
          <PopoverClose v-if="resettable" class="core-count__action" @click="state.resetRequest++">Reset</PopoverClose>
        </div>
        <p class="core-count__more">
          More on finding your way:
          <PopoverClose class="core-count__link" @click="afterClosing(() => state.controlsRequest++)">Controls</PopoverClose>
          or
          <PopoverClose class="core-count__link" @click="afterClosing(startTour)">the tour</PopoverClose>.
        </p>
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
/* Teleported to the page body, so not scoped */
.core-count__filters {
  margin: 0;
  padding-left: 1.1rem;
}

.core-count__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.core-count__actions:empty {
  display: none;
}

.core-count__action {
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

.core-count__more {
  color: var(--text-secondary);
}

/* Link-style buttons, like the start panel's ways to explore */
.core-count__link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--link);
  font: inherit;
  text-decoration: underline;
  text-underline-offset: 0.15em;
  cursor: pointer;
}
</style>
