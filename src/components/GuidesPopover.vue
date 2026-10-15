<script setup lang="ts">
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { defineAsyncComponent, ref } from 'vue'
import { useGraph } from '../composables/useGraph'
import { VIEWS } from '../graph/views'
import Chevron from './Chevron.vue'

// The toolbar's Guides menu: curated views of the graph (graph/views.ts), each setting
// several filters at once, and, where the question service is set up, a question box.
// Choosing a view or a record in an answer closes the menu.
const { pickNode, applyView, activeView } = useGraph()
const open = ref(false)

// The question box needs the question service: the dev server, or a build that names it
const AskQuestion =
  import.meta.env.DEV || import.meta.env.VITE_ASK_URL ? defineAsyncComponent(() => import('./AskQuestion.vue')) : null

function pick(id: string) {
  pickNode(id)
  open.value = false
}

function choose(id: string) {
  applyView(id)
  open.value = false
}
</script>

<template>
  <PopoverRoot v-model:open="open">
    <PopoverTrigger class="guides-toggle">
      <!-- A signpost -->
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M10 2.5v15M6.5 17.5h7" />
        <path d="M10 4.5h5.5l2 2-2 2H10zM10 10h-5.5l-2 2 2 2H10z" />
      </svg>
      <span>Guides<span v-if="activeView" class="guides-toggle__active">: {{ activeView.title }}</span></span><Chevron />
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent class="guides-panel" align="start" :side-offset="6" :collision-padding="12">
        <section aria-labelledby="guides-views-heading">
          <h2 id="guides-views-heading" class="guides-panel__heading">Guided views</h2>
          <ul class="guides-panel__views">
            <li v-for="view in VIEWS" :key="view.id">
              <button
                type="button"
                class="guides-panel__view"
                :aria-pressed="activeView?.id === view.id"
                @click="choose(view.id)"
              >
                <span class="guides-panel__title">{{ view.title }}</span>
                <span class="guides-panel__blurb">{{ view.blurb }}</span>
              </button>
            </li>
          </ul>
        </section>
        <component :is="AskQuestion" v-if="AskQuestion" class="guides-panel__ask" @pick="pick" />
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<style scoped>
.guides-toggle {
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

.guides-toggle:hover {
  background: var(--wash);
}

/* The signpost; the chevron keeps its own size (Chevron.vue), as elsewhere */
.guides-toggle svg:not(.chevron) {
  width: 1.1rem;
  height: 1.1rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

@media (max-width: 1024px) {
  .guides-toggle {
    height: 40px;
  }
}

/* The view showing, after "Guides: ", trimmed to keep the bar on one row */
.guides-toggle__active {
  display: inline-block;
  max-width: 12rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}

/* Phones: no chevron or view name, leaving the search box more of the row */
@media (max-width: 600px) {
  .guides-toggle :deep(.chevron),
  .guides-toggle__active {
    display: none;
  }
}
</style>

<style>
/* Teleported to the page body, outside the scoped styles above */
.guides-panel {
  z-index: 40;
  width: min(24rem, calc(100vw - 2rem));
  max-height: min(var(--reka-popover-content-available-height, 75vh), 36rem);
  padding: 0.875rem 1rem 1rem;
  overflow-y: auto;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface-raised);
  box-shadow: var(--shadow);
}

.guides-panel__heading {
  margin: 0 0 0.5rem;
  color: var(--text-secondary);
  font-size: 0.875rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.guides-panel__views {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0 -0.5rem;
  padding: 0;
  list-style: none;
}

.guides-panel__view {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  width: 100%;
  padding: 0.45rem 0.5rem;
  border: 0;
  border-radius: var(--radius-sm);
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.guides-panel__view:hover {
  background: var(--wash);
}

/* The view showing: a bar in the accent at its left */
.guides-panel__view[aria-pressed='true'] {
  background: var(--wash);
  box-shadow: inset 3px 0 0 var(--fill);
}

.guides-panel__title {
  font-weight: 600;
}

.guides-panel__blurb {
  color: var(--text-secondary);
  font-size: 0.875rem;
  line-height: 1.35;
}

.guides-panel__ask {
  margin-top: 1rem;
  padding-top: 0.875rem;
  border-top: 1px solid var(--border);
}
</style>
