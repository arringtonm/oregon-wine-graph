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
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useGraph } from '../composables/useGraph'
import { FLAG_REASONS, NOTE_LIMIT, submitFlag, validateFlag, type FlagInput } from '../services/flags'
import type { Fact } from '../services/facts'
import { renderTurnstile, turnstileSiteKey } from '../services/turnstile'

// The flag at the foot of a record's card. It opens a short form: which of the card's facts
// is wrong, and how; the report goes to the site's flag store (see services/flags.ts).
// Nothing personal is asked for.
const props = defineProps<{ facts: Fact[] }>()

const factKey = (fact: Fact) => `${fact.kind}:${fact.record.id}`

const { loadFlags } = useGraph()
const open = ref(false)
const sent = ref(false)
const busy = ref(false)
const error = ref('')
const form = reactive({ fact: '', reason: '' as FlagInput['reason'], note: '', sourceUrl: '', website: '' })
const chosen = computed(() => props.facts.find((fact) => factKey(fact) === form.fact))

// Where the site uses Turnstile, its check sits at the foot of the form; usually invisible
const human = ref<HTMLElement>()
const token = ref('')
let removeTurnstile = () => {}

// A fresh check: each token is good for one send
async function startCheck() {
  removeTurnstile()
  token.value = ''
  if (!turnstileSiteKey) return
  await nextTick()
  try {
    if (human.value) removeTurnstile = await renderTurnstile(human.value, (value) => (token.value = value))
  } catch {
    error.value = 'The check that you’re a person didn’t load; please try again later.'
  }
}

// The check usually finishes in a second or two, unseen; a send waits for it (or for the
// reader to tick the box, if Cloudflare asks) rather than failing
function checkedToken(limit = 30_000): Promise<string> {
  if (token.value) return Promise.resolve(token.value)
  return new Promise((done) => {
    const timeout = setTimeout(() => finish(''), limit)
    const stop = watch(token, (value) => value && finish(value))
    function finish(value: string) {
      clearTimeout(timeout)
      stop()
      done(value)
    }
  })
}

// The thanks closes itself after a while; it has already been announced (aria-live)
const THANKS_MS = 10_000
let thanksTimer: ReturnType<typeof setTimeout> | undefined
const stopThanksTimer = () => clearTimeout(thanksTimer)
watch(sent, (isSent) => {
  stopThanksTimer()
  if (isSent) thanksTimer = setTimeout(() => (open.value = false), THANKS_MS)
})

// A fresh form each time it opens
watch(open, async (isOpen) => {
  stopThanksTimer()
  if (!isOpen) return removeTurnstile()
  // A card with one fact needs no choosing
  const only = props.facts.length === 1 ? factKey(props.facts[0]) : ''
  Object.assign(form, { fact: only, reason: '', note: '', sourceUrl: '', website: '' })
  sent.value = false
  error.value = ''
  await startCheck()
})
onBeforeUnmount(() => {
  removeTurnstile()
  stopThanksTimer()
})

async function send() {
  const fact = chosen.value
  if (!fact) {
    error.value = 'Choose the fact to flag.'
    return
  }
  const { reason, note, sourceUrl, website } = form
  const input: FlagInput = {
    recordKind: fact.kind,
    recordId: fact.record.id,
    recordLabel: fact.flagLabel,
    reason,
    note,
    sourceUrl,
    website,
  }
  error.value = validateFlag(input) ?? ''
  if (error.value) return
  busy.value = true
  try {
    let checked: string | undefined
    if (turnstileSiteKey) {
      checked = await checkedToken()
      if (!checked) {
        error.value = 'Couldn’t confirm you’re a person; if a box appears below, tick it and send again.'
        return
      }
    }
    await submitFlag(input, checked)
    sent.value = true
    // On the dev server, admin mode lists the new flag straight away
    void loadFlags()
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : 'Something went wrong; please try again.'
    // Each token is good for one send, so start a fresh check for the retry
    if (turnstileSiteKey) void startCheck()
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <PopoverRoot v-model:open="open">
    <PopoverTrigger class="flag" aria-label="Flag a fact for review">
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M3.5 14.5v-12" />
        <path d="M3.5 3c2.5-1.6 4.5 1 7 0l1.8-.6v6.8l-1.8.6c-2.5 1-4.5-1.6-7 0" />
      </svg>
      Flag
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent class="flag-form" side="top" align="end" :side-offset="8" :collision-padding="12">
        <div aria-live="polite">
          <template v-if="sent">
            <p class="flag-form__title">Thanks, flagged for review</p>
            <p class="flag-form__hint">We'll check it against the sources.</p>
          </template>
        </div>
        <form v-if="!sent" novalidate @submit.prevent="send">
          <p class="flag-form__title">Flag for review</p>

          <fieldset>
            <legend>Which fact?</legend>
            <RadioGroupRoot v-model="form.fact" class="flag-form__reasons flag-form__facts" aria-label="Which fact?">
              <label v-for="fact in facts" :key="factKey(fact)" class="flag-form__reason">
                <RadioGroupItem :value="factKey(fact)" class="flag-form__radio">
                  <RadioGroupIndicator class="flag-form__dot" />
                </RadioGroupItem>
                <span class="flag-form__fact" :class="{ 'flag-form__fact--summary': fact.kind === 'node' }">{{ fact.label }}</span>
              </label>
            </RadioGroupRoot>
          </fieldset>

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
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 2rem;
  padding: 0 0.6rem 0 0.45rem;
  border: 0;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--text-secondary);
  font: inherit;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
}

.flag:hover,
.flag:focus-visible,
.flag[data-state='open'] {
  background: var(--wash);
  color: var(--text-primary);
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
  width: min(22rem, calc(100vw - 2rem));
  /* No taller than the room Reka finds beside the Flag button, so it never runs off screen */
  max-height: min(var(--reka-popover-content-available-height, 80vh), 40rem);
  overflow-y: auto;
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

/* A long card's facts scroll inside the form */
.flag-form__facts {
  max-height: 12rem;
  margin: 0 -0.25rem;
  padding: 0.15rem 0.25rem;
  overflow-y: auto;
}

.flag-form__facts .flag-form__reason {
  /* Rows keep their height and the list scrolls, rather than squeezing them together */
  flex: none;
  align-items: flex-start;
  padding: 0.15rem 0;
}

.flag-form__facts .flag-form__radio {
  margin-top: 0.15rem;
}

.flag-form__fact--summary {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
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
