<script setup lang="ts">
import {
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
  PopoverTrigger,
  RadioGroupIndicator,
  RadioGroupItem,
  RadioGroupRoot,
} from 'reka-ui'
import { nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useGraph } from '../composables/useGraph'
import { FLAG_REASONS, NOTE_LIMIT, submitFlag, validateFlag, type FlagInput } from '../services/flags'
import { renderTurnstile, turnstileSiteKey } from '../services/turnstile'

// A small flag beside a fact. It opens a short form to report it for review; the report goes
// to the site's flag store (see services/flags.ts). Nothing personal is asked for.
const props = defineProps<{ kind: 'node' | 'edge'; id: string; label: string }>()

const { loadFlags } = useGraph()
const open = ref(false)
const sent = ref(false)
const busy = ref(false)
const error = ref('')
const form = reactive({ reason: '' as FlagInput['reason'], note: '', sourceUrl: '', website: '' })

// Where the site uses Turnstile, its check sits at the foot of the form; usually invisible
const human = ref<HTMLElement>()
const token = ref('')
let removeTurnstile = () => {}

// A fresh form each time it opens
watch(open, async (isOpen) => {
  removeTurnstile()
  if (!isOpen) return
  Object.assign(form, { reason: '', note: '', sourceUrl: '', website: '' })
  sent.value = false
  error.value = ''
  token.value = ''
  if (!turnstileSiteKey) return
  await nextTick()
  if (human.value) removeTurnstile = await renderTurnstile(human.value, (value) => (token.value = value))
})
onBeforeUnmount(() => removeTurnstile())

async function send() {
  const input: FlagInput = { recordKind: props.kind, recordId: props.id, recordLabel: props.label, ...form }
  error.value = validateFlag(input) ?? ''
  if (error.value) return
  busy.value = true
  try {
    if (turnstileSiteKey && !token.value) {
      error.value = 'One moment: confirming you’re a person.'
      return
    }
    await submitFlag(input, token.value || undefined)
    sent.value = true
    // On the dev server, admin mode lists the new flag straight away
    void loadFlags()
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : 'Something went wrong; please try again.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <PopoverRoot v-model:open="open">
    <PopoverTrigger class="flag" :aria-label="`Flag for review: ${label}`">
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M3.5 14.5v-12" />
        <path d="M3.5 3c2.5-1.6 4.5 1 7 0l1.8-.6v6.8l-1.8.6c-2.5 1-4.5-1.6-7 0" />
      </svg>
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent class="flag-form" side="left" align="start" :side-offset="8" :collision-padding="12">
        <div aria-live="polite">
          <template v-if="sent">
            <p class="flag-form__title">Thanks, flagged for review</p>
            <p class="flag-form__hint">We'll check it against the sources.</p>
          </template>
        </div>
        <form v-if="!sent" novalidate @submit.prevent="send">
          <p class="flag-form__title">Flag for review</p>
          <p class="flag-form__fact">{{ label }}</p>

          <fieldset>
            <legend>What's wrong?</legend>
            <RadioGroupRoot v-model="form.reason" class="flag-form__reasons" aria-label="What's wrong?">
              <label v-for="(text, value) in FLAG_REASONS" :key="value" class="flag-form__reason">
                <RadioGroupItem :value="value" class="flag-form__radio">
                  <RadioGroupIndicator class="flag-form__dot" />
                </RadioGroupItem>
                {{ text }}
              </label>
            </RadioGroupRoot>
          </fieldset>

          <label class="flag-form__field">
            <span>Note <span class="flag-form__optional">{{ form.reason === 'other' ? '(required)' : '(optional)' }}</span></span>
            <textarea v-model="form.note" rows="3" :maxlength="NOTE_LIMIT" />
            <span class="flag-form__hint">{{ form.note.length }} / {{ NOTE_LIMIT }}</span>
          </label>

          <label class="flag-form__field">
            <span>Source link <span class="flag-form__optional">(optional)</span></span>
            <input v-model="form.sourceUrl" type="url" inputmode="url" placeholder="https://" autocomplete="off" />
          </label>

          <!-- Hidden from people and screen readers; bots fill it in -->
          <input v-model="form.website" class="flag-form__trap" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" />

          <div v-if="turnstileSiteKey" ref="human" class="flag-form__human"></div>
          <p v-if="error" class="flag-form__error" role="alert">{{ error }}</p>
          <button type="submit" class="flag-form__send" :disabled="busy">{{ busy ? 'Sending…' : 'Send flag' }}</button>
        </form>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<style scoped>
.flag {
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
  color: var(--text-secondary);
  vertical-align: middle;
  cursor: pointer;
  opacity: 0.7;
}

.flag:hover,
.flag:focus-visible,
.flag[data-state='open'] {
  background: var(--wash);
  color: var(--text-primary);
  opacity: 1;
}

.flag svg {
  width: 0.95rem;
  height: 0.95rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>

<style>
/* Teleported to the page body, outside the scoped styles above */
.flag-form {
  z-index: 45;
  width: min(20rem, calc(100vw - 2rem));
  padding: 0.85rem 1rem 1rem;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface-raised);
  box-shadow: var(--shadow);
  font-size: 0.875rem;
}

.flag-form form {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}

.flag-form p {
  margin: 0;
}

.flag-form__title {
  font-weight: 700;
}

.flag-form__fact,
.flag-form__hint,
.flag-form__optional {
  color: var(--text-secondary);
  font-size: 0.8125rem;
}

.flag-form fieldset {
  margin: 0;
  padding: 0;
  border: 0;
}

.flag-form legend {
  margin-bottom: 0.3rem;
  font-weight: 600;
}

.flag-form__reasons {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.flag-form__reason {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 1.6rem;
  cursor: pointer;
}

.flag-form__radio {
  display: inline-grid;
  flex: none;
  place-items: center;
  width: 1rem;
  height: 1rem;
  min-height: 0;
  padding: 0;
  border: 1.5px solid var(--border-strong);
  border-radius: 50%;
  background: var(--surface);
  cursor: pointer;
}

.flag-form__radio[data-state='checked'] {
  border-color: var(--fill);
}

.flag-form__dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--fill);
}

.flag-form__field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-weight: 600;
}

.flag-form__field textarea,
.flag-form__field input {
  padding: 0.4rem 0.5rem;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: inherit;
  font: inherit;
  font-weight: 400;
}

.flag-form__field textarea {
  resize: vertical;
}

.flag-form__trap {
  position: absolute;
  left: -9999px;
  width: 1px;
  height: 1px;
  opacity: 0;
}

.flag-form__error {
  color: var(--danger);
}

.flag-form__send {
  align-self: flex-start;
  min-height: 2.25rem;
  padding: 0 0.9rem;
  border: 0;
  border-radius: var(--radius-sm);
  background: var(--fill);
  color: var(--on-fill);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.flag-form__send:disabled {
  opacity: 0.6;
  cursor: default;
}
</style>
