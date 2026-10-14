<script setup lang="ts">
import { nextTick, ref } from 'vue'
import type { AskAnswer, AskOverride } from '../../tools/jev/askGraph'
import { useGraph } from '../composables/useGraph'
import NodeGlyph from './NodeGlyph.vue'

const { select, askJev } = useGraph()

// Ask Jev about the data (dev server only, where the key lives). Jev reads the question;
// the answer comes from the graph's own records.
const question = ref('')
const askInput = ref<HTMLInputElement>()
const answer = ref<AskAnswer | null>(null)
const askError = ref('')
const busy = ref(false)
// Starters for common questions; each ends where the name goes
const SUGGESTIONS = [
  'Who founded ',
  'Who made the wine at ',
  'Who mentored ',
  'Where did … study?',
  'Where does … get its fruit?',
  'Which vineyards are in ',
  'How are … and … connected?',
]

async function useSuggestion(text: string) {
  question.value = text
  await nextTick()
  const input = askInput.value
  if (!input) return
  input.focus()
  // Put the cursor where the name goes: at the first "…", or at the end
  const gap = text.indexOf('…')
  if (gap >= 0) input.setSelectionRange(gap, gap + 1)
  else input.setSelectionRange(text.length, text.length)
}

async function ask(override?: AskOverride) {
  if (!question.value.trim() || busy.value) return
  busy.value = true
  askError.value = ''
  try {
    answer.value = await askJev(question.value, override)
  } catch (error) {
    askError.value = error instanceof Error ? error.message : String(error)
    answer.value = null
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="graph-list__ask" aria-labelledby="ask-heading">
    <h3 id="ask-heading">Ask Jev about the data</h3>
    <form @submit.prevent="ask()">
      <label for="ask-input" class="visually-hidden">Question</label>
      <input
        id="ask-input"
        ref="askInput"
        v-model="question"
        type="text"
        autocomplete="off"
        placeholder="Who made the wine at Eyrie?"
      />
      <button type="submit" :disabled="busy || !question.trim()">{{ busy ? 'Asking…' : 'Ask' }}</button>
    </form>
    <ul class="graph-list__suggestions" aria-label="Common questions">
      <li v-for="suggestion in SUGGESTIONS" :key="suggestion">
        <button type="button" @click="useSuggestion(suggestion)">{{ suggestion.trim() }}</button>
      </li>
    </ul>
    <div class="graph-list__answer" aria-live="polite">
      <p v-if="askError" class="graph-list__error">{{ askError }}</p>
      <template v-else-if="answer">
        <p class="graph-list__read-as">
          <template v-if="answer.readAs">Read as: <strong>{{ answer.readAs }}</strong></template>
          <span class="graph-list__confidence">
            {{ answer.bestGuess ? 'Best guess' : 'Confident' }} · {{ Math.round(answer.confidence * 100) }}%
            <template v-if="answer.model === 'stub'"> · keyword fallback, no Jev key</template>
          </span>
        </p>
        <p class="graph-list__sentence">{{ answer.sentence }}</p>
        <ul v-if="answer.results.length" class="graph-list__results">
          <li v-for="result in answer.results" :key="result.node.id + (result.detail ?? '')">
            <NodeGlyph :type="result.node.type" />
            <button type="button" @click="select(result.node.id, { focusDetails: true })">{{ result.node.name }}</button>
            <span v-if="result.detail" class="graph-list__detail">{{ result.detail }}</span>
          </li>
        </ul>
        <p v-if="answer.alternative">
          <button type="button" class="graph-list__alternative" @click="ask(answer.alternative)">
            Did you mean: {{ answer.alternative.readAs }}
          </button>
        </p>
      </template>
    </div>
  </section>
</template>

<style scoped>
.graph-list__ask {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border: 1px dashed var(--border-strong);
  border-radius: 8px;
}

.graph-list__ask h3 {
  margin: 0;
}

.graph-list__ask form {
  display: flex;
  gap: 0.5rem;
  max-width: 40rem;
}

.graph-list__ask input {
  flex: 1;
  min-height: 2.25rem;
  padding: 0 0.625rem;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--surface-raised);
  color: inherit;
  font: inherit;
}

.graph-list__ask form button,
.graph-list__suggestions button,
.graph-list__alternative {
  min-height: 2.25rem;
  padding: 0 0.75rem;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--surface-raised);
  color: inherit;
  font: inherit;
  font-weight: 400;
  text-decoration: none;
}

.graph-list__suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.graph-list__suggestions button {
  min-height: 1.75rem;
  border-radius: 999px;
  font-size: 0.875rem;
}

.graph-list__answer:empty {
  display: none;
}

.graph-list__answer p {
  margin: 0.25rem 0;
}

.graph-list__confidence {
  margin-left: 0.5rem;
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.graph-list__sentence {
  font-size: 1.0625rem;
}

.graph-list__results {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin: 0.5rem 0 0;
  padding: 0;
  list-style: none;
}

.graph-list__results li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

/* Record names read as links, like the list below */
.graph-list__results button {
  padding: 0.125rem 0;
  border: 0;
  background: none;
  color: var(--text-primary);
  font: inherit;
  font-weight: 600;
  text-decoration: underline;
  text-decoration-color: var(--border-strong);
  text-underline-offset: 3px;
  cursor: pointer;
}

.graph-list__results button:hover {
  text-decoration-color: currentColor;
}

.graph-list__error {
  color: var(--danger, #d33);
}

.graph-list__detail {
  color: var(--text-secondary);
  font-size: 0.875rem;
}
</style>
