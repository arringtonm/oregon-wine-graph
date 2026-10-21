<script setup lang="ts">
import {
  ComboboxAnchor,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxPortal,
  ComboboxRoot,
  ComboboxViewport,
  PopoverAnchor,
  PopoverClose,
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
} from 'reka-ui'
import { computed, ref, watch } from 'vue'
import type { AskAnswer as Answer, AskOverride } from '../../tools/jev/askGraph'
import { askUrl, useGraph } from '../composables/useGraph'
import type { NodeType } from '../data/schema'
import AskAnswer from './AskAnswer.vue'
import NodeGlyph from './NodeGlyph.vue'

// Search is a combobox: typing lists matches, the arrow keys move through them and Enter
// picks one. Reka handles the keys and the ARIA; matching is ours (ignore-filter).
// Where the question service is set up, the same box asks questions: an "Ask" row joins the
// results (first when the text reads as a question), and its answer opens under the box
const { state, search, announce, pickNode, askJev } = useGraph()
const canAsk = Boolean(askUrl)
const ASK = '\u0000ask'

// Read after each result, so "Eyrie" is heard as a winery or a vineyard
const TYPE_NAMES: Record<NodeType, string> = {
  person: 'person',
  winery: 'winery',
  vineyard: 'vineyard',
  ava: 'AVA',
  organization: 'organization',
  event: 'event',
}

const query = ref('')
const results = computed(() => search(query.value))
const open = ref(false)

// Offered once there's a few letters to go on; first when it reads as a question
const askable = computed(() => canAsk && query.value.trim().length >= 3)
const QUESTION = /^(who|whom|whose|what|where|when|which|why|how|is|are|was|were|did|does|do|has|have|can)\b|\?\s*$/i
const askFirst = computed(() => askable.value && (QUESTION.test(query.value.trim()) || results.value.length === 0))

watch(query, () => {
  open.value = query.value.trim() !== ''
  if (!open.value) return
  const count = results.value.length
  const matches = count === 0 ? 'No matches' : `${count} result${count === 1 ? '' : 's'}`
  announce(`${matches}${askable.value ? ', or ask it as a question' : ''}, use the up and down arrows to choose`)
})

// The question and its answer, shown under the box
const asked = ref('')
const answer = ref<Answer | null>(null)
const askError = ref('')
const asking = ref(false)
const answerOpen = ref(false)

async function ask(question: string, override?: AskOverride) {
  asked.value = question
  answerOpen.value = true
  asking.value = true
  askError.value = ''
  try {
    answer.value = await askJev(question, override)
  } catch (failure) {
    // The service's own failure ("HTTP 404", a server error page) means nothing to readers
    console.warn('Ask failed', failure)
    askError.value = 'Couldn’t answer that just now. Try again in a moment, or search for a name instead.'
    answer.value = null
  } finally {
    asking.value = false
  }
}

function onPicked(id: unknown) {
  if (typeof id !== 'string') return
  if (id === ASK) {
    void ask(query.value.trim())
    query.value = ''
    return
  }
  pickNode(id)
  query.value = ''
}

function pickFromAnswer(id: string) {
  pickNode(id)
  answerOpen.value = false
}

// Escape clears the search first, and stops there
function onEscape(event: KeyboardEvent) {
  if (!query.value) return
  event.stopPropagation()
  query.value = ''
}
</script>

<template>
  <!-- A plain wrapper: the toolbar ignores pointer events so the graph stays draggable, and
       a scoped style can't reliably reach Reka's root to turn them back on -->
  <PopoverRoot v-model:open="answerOpen">
  <PopoverAnchor as-child>
  <div class="search">
    <ComboboxRoot
      v-model:open="open"
      :model-value="null"
      ignore-filter
      :reset-search-term-on-blur="false"
      @update:model-value="onPicked"
    >
      <ComboboxAnchor class="search__anchor">
        <svg class="search__icon" viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="8.5" cy="8.5" r="5.5" />
          <path d="m12.6 12.6 4.4 4.4" />
        </svg>
        <ComboboxInput
          id="search"
          v-model="query"
          class="search__input"
          :class="{ 'is-hinted': state.hint === 'search' }"
          :placeholder="canAsk ? 'Search or ask' : 'Search'"
          :aria-label="canAsk ? 'Search people and places, or ask a question' : 'Search people and places'"
          autocomplete="off"
          @keydown.escape="onEscape"
        />
      </ComboboxAnchor>
      <ComboboxPortal>
        <ComboboxContent class="search-results" position="popper" :side-offset="4" align="start">
          <ComboboxViewport>
            <ComboboxItem v-if="askFirst" :value="ASK" :text-value="query" class="search-results__option search-results__ask">
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M4 4.5h12a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5H9l-3.5 3v-3H4A1.5 1.5 0 0 1 2.5 13V6A1.5 1.5 0 0 1 4 4.5z" />
              </svg>
              <span>Ask: “{{ query.trim() }}”</span>
            </ComboboxItem>
            <ComboboxItem v-for="node in results" :key="node.id" :value="node.id" :text-value="node.name" class="search-results__option">
              <NodeGlyph :type="node.type" />
              {{ node.name }}
              <span class="visually-hidden">, {{ TYPE_NAMES[node.type] }}</span>
            </ComboboxItem>
            <ComboboxItem
              v-if="askable && !askFirst"
              :value="ASK"
              :text-value="query"
              class="search-results__option search-results__ask"
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M4 4.5h12a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5H9l-3.5 3v-3H4A1.5 1.5 0 0 1 2.5 13V6A1.5 1.5 0 0 1 4 4.5z" />
              </svg>
              <span>Ask: “{{ query.trim() }}”</span>
            </ComboboxItem>
            <ComboboxEmpty class="search-results__empty">No matches</ComboboxEmpty>
          </ComboboxViewport>
        </ComboboxContent>
      </ComboboxPortal>
    </ComboboxRoot>
  </div>
  </PopoverAnchor>
  <PopoverPortal>
    <PopoverContent class="ask-panel" align="start" :side-offset="4" :collision-padding="12" aria-labelledby="ask-heading">
      <PopoverClose class="ask-panel__close" aria-label="Close">
        <span aria-hidden="true">×</span>
      </PopoverClose>
      <h2 id="ask-heading" class="ask-panel__question">{{ asked }}</h2>
      <AskAnswer
        :answer="answer"
        :error="askError"
        :busy="asking"
        @pick="pickFromAnswer"
        @retry="(override) => ask(asked, override)"
      />
    </PopoverContent>
  </PopoverPortal>
  </PopoverRoot>
</template>

<style scoped>
.search {
  pointer-events: auto;
}

.search__anchor {
  position: relative;
  display: flex;
  align-items: center;
}

.search__icon {
  position: absolute;
  /* Above the input, whose frosted backdrop makes it its own layer, also when it's
     highlighted from the start panel (style.css's .is-hinted raises it to 2) */
  z-index: 3;
  left: 0.6rem;
  width: 1rem;
  height: 1rem;
  fill: none;
  stroke: var(--text-secondary);
  stroke-width: 1.6;
  stroke-linecap: round;
  pointer-events: none;
}

.search__input {
  /* Narrow enough for the toolbar to stay on one row; results open wider (16rem or more) */
  width: 10rem;
  height: 36px;
  padding: 0 0.6rem 0 2rem;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--frost);
  -webkit-backdrop-filter: var(--frost-blur);
  backdrop-filter: var(--frost-blur);
  color: inherit;
  font: inherit;
}

/* Smaller screens: as wide as the toolbar's first row allows (see GraphCanvas) */
@media (max-width: 1024px) {
  .search__input {
    width: 100%;
    min-width: 0;
    height: 40px;
  }
}
</style>

<style>
/* The results list is teleported to the page body, outside the scoped styles above */
.search-results {
  z-index: 40;
  width: max(var(--reka-popper-anchor-width, 16rem), 16rem);
  max-height: min(60vh, 24rem);
  padding: 4px;
  overflow-y: auto;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface-raised);
  box-shadow: var(--shadow);
}

.search-results__option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 32px;
  padding: 0.375rem 0.5rem;
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.search-results__option[data-highlighted] {
  background: var(--wash);
  /* An outline as well as the wash, since focus stays in the input */
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.search-results__ask svg {
  flex: none;
  width: 1rem;
  height: 1rem;
  fill: none;
  stroke: var(--text-secondary);
  stroke-width: 1.5;
  stroke-linejoin: round;
}

.search-results__ask span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* The answer to a question, under the search box */
.ask-panel {
  position: relative;
  z-index: 40;
  width: min(24rem, calc(100vw - 2rem));
  max-height: min(var(--reka-popover-content-available-height, 75vh), 32rem);
  padding: 0.75rem 1rem 1rem;
  overflow-y: auto;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface-raised);
  box-shadow: var(--shadow);
}

.ask-panel__question {
  margin: 0 2rem 0.5rem 0;
  font-size: 1rem;
  font-weight: 600;
}

.ask-panel__close {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--text-secondary);
  font: inherit;
  font-size: 1.3rem;
  line-height: 1;
  cursor: pointer;
}

.ask-panel__close:hover {
  background: var(--wash);
  color: var(--text-primary);
}

.search-results__empty {
  padding: 0.375rem 0.5rem;
  color: var(--text-secondary);
}
</style>
