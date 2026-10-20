<script setup lang="ts">
import { PopoverAnchor, PopoverArrow, PopoverContent, PopoverPortal, PopoverRoot } from 'reka-ui'
import { computed, onBeforeUnmount, ref } from 'vue'
import verifiedSources from '../data/verified-sources.json'
import { caveatsOf } from '../graph/caveats'
import type { Fact } from '../services/facts'

// The foot of a record's card: how many of its facts are verified. Its note lists every fact
// with how it was checked and its sources. The note shows on mouse hover, like a tooltip,
// and stays put on click, tap or Enter; a popover rather than a tooltip because it holds
// links, which the pointer can move onto.
const props = defineProps<{ facts: Fact[]; name: string }>()

const verifiedCount = computed(() => props.facts.filter((fact) => fact.record.verified).length)
const summary = computed(() =>
  verifiedCount.value === 0 ? 'Not yet verified' : `${verifiedCount.value} of ${props.facts.length} verified`,
)

// The source the automated check found supporting each fact, by its index in the fact's sources
function supportingIndex(fact: Fact): number | undefined {
  return (verifiedSources as Record<string, number>)[`${fact.kind}:${fact.record.id}`]
}

// A connection resting only on federal label approvals, or verified from label images, says so
// here rather than beside the connection on the card
const caveats = (fact: Fact) => caveatsOf('note' in fact.record ? fact.record.note : undefined)

function howChecked(fact: Fact): string {
  if (!fact.record.verified) return 'Not yet verified'
  if (fact.record.verifiedBy === 'jev' && caveats(fact).byImage) {
    return 'Verified by Oregon Wine Graph Bot from the label images, an early-stage method'
  }
  if (fact.record.verifiedBy === 'jev') return 'Verified by Oregon Wine Graph Bot'
  if (fact.record.verifiedBy === 'boundary') return 'Verified against official AVA boundary maps'
  return 'Reviewed by Oregon Wine Graph'
}

const open = ref(false)
// Opened by click, tap or keyboard (stays until dismissed), rather than by hovering
const pinned = ref(false)
const button = ref<HTMLButtonElement>()
let timer: ReturnType<typeof setTimeout> | undefined

function hover(entering: boolean, event: PointerEvent) {
  if (event.pointerType !== 'mouse' || pinned.value) return
  clearTimeout(timer)
  timer = setTimeout(() => (open.value = entering), entering ? 150 : 200)
}

function click() {
  clearTimeout(timer)
  // A click on a note opened by hovering keeps it open; otherwise it toggles
  if (open.value && !pinned.value) pinned.value = true
  else {
    pinned.value = !open.value
    open.value = !open.value
  }
}

// Whether the note being closed was pinned open, so focus may need to come back
let closingPinned = false

function dismiss(value: boolean) {
  if (value) return
  closingPinned = pinned.value
  open.value = false
  pinned.value = false
}

// The button is an anchor, not a Reka trigger, so Reka can't return focus to it. When a
// pinned note closes with focus inside it or lost (Escape), focus goes back to the button;
// a click elsewhere, or a note shown by hovering, leaves focus where it is
function returnFocus(event: Event) {
  event.preventDefault()
  const active = document.activeElement
  if (closingPinned && (!active || active === document.body || active.closest('.verification-note'))) button.value?.focus()
  closingPinned = false
}

// Clicks on the button itself are handled by click(), not treated as clicking outside
function insideButton(event: Event) {
  if (button.value?.contains(event.target as Node)) event.preventDefault()
}

onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <PopoverRoot :open="open" @update:open="dismiss">
    <PopoverAnchor as-child>
      <button
        ref="button"
        type="button"
        class="verification"
        :class="{ 'verification--none': verifiedCount === 0 }"
        :aria-label="`${summary}: how each fact was checked`"
        :aria-expanded="open"
        aria-haspopup="dialog"
        :data-state="open ? 'open' : 'closed'"
        @click="click"
        @pointerenter="hover(true, $event)"
        @pointerleave="hover(false, $event)"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="7" />
          <path v-if="verifiedCount > 0" d="m4.8 8.2 2.1 2.1 4.3-4.6" />
        </svg>
        {{ summary }}
      </button>
    </PopoverAnchor>
    <PopoverPortal>
      <PopoverContent
        class="verification-note"
        side="top"
        align="start"
        :side-offset="6"
        :collision-padding="12"
        :aria-label="`How we checked ${name}`"
        @open-auto-focus="!pinned && $event.preventDefault()"
        @close-auto-focus="returnFocus"
        @interact-outside="insideButton"
        @pointerenter="hover(true, $event)"
        @pointerleave="hover(false, $event)"
      >
        <p class="verification-note__title">How we checked {{ name }}</p>
        <ul>
          <li v-for="fact in facts" :key="`${fact.kind}:${fact.record.id}`" :class="{ 'is-verified': fact.record.verified }">
            <svg class="verification-note__icon" viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="8" cy="8" r="6.5" />
              <path v-if="fact.record.verified" d="m5 8.2 2 2 4-4.3" />
            </svg>
            <div>
              <p class="verification-note__fact" :class="{ 'verification-note__fact--summary': fact.kind === 'node' }">
                {{ fact.label }}<template v-if="fact.years"> ({{ fact.years }})</template>
              </p>
              <p class="verification-note__how">{{ howChecked(fact) }}</p>
              <p v-if="caveats(fact).labelOnly" class="verification-note__how">
                Label approvals only: no other source confirms the wine was released
              </p>
              <p class="verification-note__sources">
                <span v-for="(source, index) in fact.record.sources" :key="source.title" class="verification-note__source">
                  <a v-if="source.url" :href="source.url" target="_blank" rel="noopener">
                    {{ source.title }}<span class="visually-hidden"> (opens in a new tab)</span>
                  </a>
                  <template v-else>{{ source.title }}</template>
                  <template v-if="fact.record.verified && supportingIndex(fact) === index"> (supported)</template>
                </span>
              </p>
            </div>
          </li>
        </ul>
        <PopoverArrow class="verification-note__arrow" :width="10" :height="5" />
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<style scoped>
.verification {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 2rem;
  padding: 0 0.6rem 0 0.4rem;
  border: 0;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--accent);
  font: inherit;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
}

.verification--none {
  color: var(--text-secondary);
}

.verification:hover,
.verification[data-state='open'] {
  background: var(--wash);
}

.verification svg {
  width: 1rem;
  height: 1rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>

<style>
/* Teleported to the page body, outside the scoped styles above */
.verification-note {
  z-index: 45;
  width: min(22rem, calc(100vw - 2rem));
  /* No taller than the room beside the button (Reka measures it), so it never runs off screen */
  max-height: min(var(--reka-popover-content-available-height, 60vh), 24rem);
  padding: 0.7rem 0.85rem;
  overflow-y: auto;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface-raised);
  box-shadow: var(--shadow);
  font-size: 0.8125rem;
}

.verification-note p {
  margin: 0;
}

.verification-note__title {
  margin-bottom: 0.5rem !important;
  font-size: 0.875rem;
  font-weight: 700;
}

.verification-note ul {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.verification-note li {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}

.verification-note__icon {
  flex: none;
  width: 1rem;
  height: 1rem;
  margin-top: 0.1rem;
  fill: none;
  stroke: var(--text-secondary);
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.verification-note li.is-verified .verification-note__icon {
  stroke: var(--accent);
}

.verification-note__fact {
  color: var(--text-primary);
}

/* The summary can be long; the card shows it in full */
.verification-note__fact--summary {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  line-clamp: 3;
}

.verification-note__how,
.verification-note__sources {
  color: var(--text-secondary);
}

.verification-note__source + .verification-note__source::before {
  content: '; ';
}

.verification-note a {
  color: var(--accent);
}

.verification-note__arrow {
  fill: var(--surface-raised);
}
</style>
