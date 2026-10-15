<script setup lang="ts">
import { CollapsibleContent, CollapsibleRoot, CollapsibleTrigger } from 'reka-ui'
import { nextTick, ref } from 'vue'
import type { AskAnswer, AskOverride } from '../../tools/jev/askGraph'
import { useGraph } from '../composables/useGraph'
import Chevron from './Chevron.vue'
import NodeGlyph from './NodeGlyph.vue'

// A question about the data, answered from the graph's own records once the decision
// model has read which common question it is and whom it's about. Dev server only, where
// the model's key lives. Choosing a record in the answer is handled like a search pick.
const emit = defineEmits<{ pick: [id: string] }>()
const { askJev } = useGraph()

const question = ref('')
const input = ref<HTMLInputElement>()
const answer = ref<AskAnswer | null>(null)
const error = ref('')
const busy = ref(false)
const examplesOpen = ref(false)
// Starters for common questions; "…" marks where the name goes
const EXAMPLES = [
  'Who founded …?',
  'Who made the wine at …?',
  'Who mentored …?',
  'Where did … study?',
  'Where does … get its fruit?',
  'Which vineyards are in …?',
  'How are … and … connected?',
]

async function useExample(text: string) {
  question.value = text
  examplesOpen.value = false
  await nextTick()
  if (!input.value) return
  input.value.focus()
  // Select the first "…", so typing a name replaces it
  const gap = text.indexOf('…')
  input.value.setSelectionRange(gap, gap + 1)
}

async function ask(override?: AskOverride) {
  if (!question.value.trim() || busy.value) return
  busy.value = true
  error.value = ''
  try {
    answer.value = await askJev(question.value, override)
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : String(failure)
    answer.value = null
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="ask" aria-labelledby="ask-heading">
    <h2 id="ask-heading">Ask a question</h2>
    <form @submit.prevent="ask()">
      <label for="ask-input" class="visually-hidden">Question about the people and places</label>
      <input
        id="ask-input"
        ref="input"
        v-model="question"
        type="text"
        autocomplete="off"
        placeholder="Who made the wine at Eyrie?"
      />
      <button type="submit" :disabled="busy || !question.trim()">{{ busy ? 'Asking…' : 'Ask' }}</button>
    </form>

    <CollapsibleRoot v-model:open="examplesOpen" class="ask__examples-wrap">
      <CollapsibleTrigger class="ask__examples-toggle">Example questions<Chevron /></CollapsibleTrigger>
      <CollapsibleContent as="ul" class="ask__examples">
        <li v-for="example in EXAMPLES" :key="example">
          <button type="button" @click="useExample(example)">{{ example }}</button>
        </li>
      </CollapsibleContent>
    </CollapsibleRoot>

    <div class="ask__answer" aria-live="polite">
      <p v-if="error" class="ask__error">{{ error }}</p>
      <template v-else-if="answer">
        <p v-if="answer.readAs" class="ask__read-as">Read as: <strong>{{ answer.readAs }}</strong></p>
        <p class="ask__confidence">
          {{ answer.bestGuess ? 'Best guess' : 'Confident' }} · {{ Math.round(answer.confidence * 100) }}%
          <template v-if="answer.model === 'stub'"> · keyword matching (no API key)</template>
        </p>
        <p class="ask__sentence">{{ answer.sentence }}</p>
        <ul v-if="answer.results.length" class="ask__results">
          <li v-for="result in answer.results" :key="result.node.id + (result.detail ?? '')">
            <NodeGlyph :type="result.node.type" />
            <span>
              <button type="button" @click="emit('pick', result.node.id)">{{ result.node.name }}</button>
              <span v-if="result.detail" class="ask__detail">{{ result.detail }}</span>
            </span>
          </li>
        </ul>
        <button v-if="answer.alternative" type="button" class="ask__alternative" @click="ask(answer.alternative)">
          Did you mean: {{ answer.alternative.readAs }}
        </button>
      </template>
    </div>
  </section>
</template>

<style scoped>
.ask {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

h2 {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.875rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

form {
  display: flex;
  gap: 0.375rem;
}

input {
  flex: 1;
  min-width: 0;
  min-height: 2.25rem;
  padding: 0 0.5rem;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--surface-raised);
  color: inherit;
  font: inherit;
}

form button,
.ask__alternative {
  min-height: 2.25rem;
  padding: 0 0.625rem;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--surface-raised);
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.ask__alternative {
  align-self: flex-start;
  height: auto;
  padding: 0.375rem 0.625rem;
  text-align: left;
}

.ask__examples-toggle {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  min-height: 1.5rem;
  padding: 0;
  border: 0;
  background: none;
  color: var(--text-secondary);
  font: inherit;
  font-size: 0.875rem;
  cursor: pointer;
}

.ask__examples-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.ask__examples,
.ask__results {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ask__examples button {
  width: 100%;
  min-height: 1.75rem;
  padding: 0.125rem 0.5rem;
  border: 0;
  border-radius: 4px;
  background: none;
  color: inherit;
  font: inherit;
  font-size: 0.875rem;
  text-align: left;
  cursor: pointer;
}

.ask__examples button:hover {
  background: var(--wash);
}

.ask__answer:empty {
  display: none;
}

.ask__answer {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding-top: 0.25rem;
}

.ask__answer p {
  margin: 0;
}

.ask__read-as,
.ask__confidence,
.ask__detail {
  color: var(--text-secondary);
  font-size: 0.8125rem;
}

.ask__read-as strong {
  color: var(--text-primary);
}

.ask__results li {
  display: flex;
  align-items: flex-start;
  gap: 0.375rem;
}

.ask__results li > :first-child {
  margin-top: 0.25rem;
}

.ask__results button {
  padding: 0.125rem 0;
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

.ask__results button:hover {
  text-decoration-color: currentColor;
}

.ask__detail {
  display: block;
}

.ask__error {
  color: var(--danger, #d33);
}
</style>
