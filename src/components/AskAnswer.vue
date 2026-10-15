<script setup lang="ts">
import type { AskAnswer, AskOverride } from '../../tools/jev/askGraph'
import NodeGlyph from './NodeGlyph.vue'

// The answer to a question asked from the search box: how it was read, the sentence and the
// records it names. Choosing a record is handled like a search pick
defineProps<{ answer: AskAnswer | null; error: string; busy: boolean }>()
const emit = defineEmits<{ pick: [id: string]; retry: [override: AskOverride] }>()
</script>

<template>
  <div class="ask__answer" aria-live="polite">
    <p v-if="busy" class="ask__busy">Asking…</p>
    <p v-else-if="error" class="ask__error">{{ error }}</p>
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
      <button v-if="answer.alternative" type="button" class="ask__alternative" @click="emit('retry', answer.alternative)">
        Did you mean: {{ answer.alternative.readAs }}
      </button>
    </template>
  </div>
</template>

<style scoped>
.ask__answer {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.ask__answer p {
  margin: 0;
}

.ask__busy,
.ask__read-as,
.ask__confidence,
.ask__detail {
  color: var(--text-secondary);
  font-size: 0.8125rem;
}

.ask__read-as strong {
  color: var(--text-primary);
}

.ask__results {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  margin: 0;
  padding: 0;
  list-style: none;
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

.ask__alternative {
  align-self: flex-start;
  padding: 0.375rem 0.625rem;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--surface-raised);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.ask__error {
  color: var(--danger, #d33);
}
</style>
