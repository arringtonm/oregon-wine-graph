<script setup lang="ts">
import { PopoverAnchor, PopoverContent, PopoverPortal, PopoverRoot } from 'reka-ui'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useGraph } from '../composables/useGraph'
import { TOUR_STEPS, type TourAction } from '../tour/steps'

// The tour's card: beside the control its step names (which is ringed), or docked at the
// foot of the screen on phones and when the control isn't showing. Non-modal, so the reader
// can try things with it open; Esc or × closes it, remembering the step for later
const props = defineProps<{
  // Where a node sits on screen, for the step that rings one
  nodeRect: (id: string) => DOMRect | null
}>()
const { state, tourStep, closeTour, finishTour, select, showFilters } = useGraph()

const step = computed(() => (state.tour === null ? null : TOUR_STEPS[state.tour]))

// A line split into text and [keys]
const parts = (line: string) =>
  line.split(/(\[[^\]]+\])/).filter(Boolean).map((text) => (text.startsWith('[') ? { key: text.slice(1, -1) } : { text }))
const last = computed(() => state.tour === TOUR_STEPS.length - 1)

// Phones: always docked
const phoneQuery = window.matchMedia('(max-width: 600px)')
const phone = ref(phoneQuery.matches)
const onPhone = () => (phone.value = phoneQuery.matches)

// What the card is placed against: an element, a node's spot on the graph, or the foot of
// the screen. Worked out again after each step, and after anything that moves things
type Reference = { getBoundingClientRect: () => DOMRect }
const reference = shallowRef<Reference>()
const docked = ref(false)
const foot: Reference = {
  getBoundingClientRect: () => new DOMRect(window.innerWidth / 2, window.innerHeight - 12, 0, 0),
}

function place() {
  const current = step.value
  if (!current) return
  let target: Reference | undefined
  if (!phone.value) {
    if (current.hint === 'node' && state.hintNodeId) {
      const id = state.hintNodeId
      target = { getBoundingClientRect: () => props.nodeRect(id) ?? new DOMRect() }
    } else {
      const element = current.target
        .map((selector) => document.querySelector<HTMLElement>(selector))
        .find((candidate) => candidate && candidate.offsetParent !== null && candidate.getBoundingClientRect().width > 0)
      if (element) target = element
    }
  }
  docked.value = !target
  reference.value = target ?? foot
}

const side = computed(() => (docked.value ? 'top' : step.value?.hint === 'node' ? 'right' : (step.value?.side ?? 'bottom')))

// Each step: place the card, and move focus to its title, so the step is read out
const title = ref<HTMLElement>()
watch(
  () => [state.tour, state.hintNodeId, state.selectedId, state.listView, state.filtersCollapsed],
  async () => {
    await nextTick()
    place()
    if (state.tour !== null) {
      await nextTick()
      title.value?.focus()
    }
  },
)
onMounted(() => {
  phoneQuery.addEventListener('change', onPhone)
  window.addEventListener('resize', place)
})
onBeforeUnmount(() => {
  phoneQuery.removeEventListener('change', onPhone)
  window.removeEventListener('resize', place)
})

// "Try it": what the step's control does
function run(action: TourAction) {
  switch (action) {
    case 'open-node':
      if (state.hintNodeId) select(state.hintNodeId)
      else state.randomRequest++
      break
    case 'open-record':
      if (!state.selectedId) state.randomRequest++
      break
    case 'search':
      document.getElementById('search')?.focus()
      break
    case 'guides':
      state.guidesRequest++
      break
    case 'filters':
      showFilters(true)
      break
    case 'fit':
      state.fitRequest++
      break
    case 'random':
      state.randomRequest++
      break
  }
}
</script>

<template>
  <PopoverRoot :open="step !== null" @update:open="(open) => !open && closeTour()">
    <PopoverAnchor :reference="reference" />
    <PopoverPortal>
      <PopoverContent
        v-if="step"
        class="tour"
        :class="{ 'tour--docked': docked }"
        :side="side"
        align="center"
        :side-offset="docked ? 0 : 12"
        :collision-padding="12"
        role="dialog"
        aria-labelledby="tour-title"
        @interact-outside.prevent
        @open-auto-focus.prevent
      >
        <div class="tour__top">
          <span class="tour__count">{{ (state.tour ?? 0) + 1 }} of {{ TOUR_STEPS.length }}</span>
          <button type="button" class="tour__close" aria-label="Close the tour" @click="closeTour">
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <h2 id="tour-title" ref="title" class="tour__title" tabindex="-1">{{ step.title }}</h2>
        <p v-for="line in step.body" :key="line" class="tour__body">
          <template v-for="(part, index) in parts(line)" :key="index">
            <kbd v-if="'key' in part">{{ part.key }}</kbd>
            <template v-else>{{ part.text }}</template>
          </template>
        </p>
        <div class="tour__actions">
          <button v-if="step.action" type="button" class="tour__try" @click="run(step.action.run)">
            {{ step.action.label }}
          </button>
          <span class="tour__steps">
            <button v-if="(state.tour ?? 0) > 0" type="button" class="tour__step" @click="tourStep(-1)">‹ Back</button>
            <button v-if="!last" type="button" class="tour__step tour__step--next" @click="tourStep(1)">Next ›</button>
            <button v-else type="button" class="tour__step tour__step--next" @click="finishTour">Done</button>
          </span>
        </div>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<style>
/* Teleported to the page body */
.tour {
  z-index: 46;
  width: min(20rem, calc(100vw - 2rem));
  padding: 0.75rem 1rem 0.9rem;
  border: 1px solid var(--accent);
  border-radius: var(--radius);
  background: var(--surface-raised);
  box-shadow: var(--shadow);
  font-size: 0.9375rem;
}

/* At the foot of the screen: full width on a phone */
.tour--docked {
  width: min(28rem, calc(100vw - 2rem));
}

.tour__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.15rem;
}

.tour__count {
  color: var(--text-secondary);
  font-size: 0.8125rem;
}

.tour__close {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  margin-right: -0.4rem;
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

.tour__close:hover {
  background: var(--wash);
  color: var(--text-primary);
}

.tour__title {
  margin: 0 0 0.35rem;
  font-size: 1rem;
  font-weight: 650;
}

.tour__title:focus {
  outline: none;
}

.tour__body {
  margin: 0 0 0.45rem;
  line-height: 1.45;
}

.tour__body kbd {
  padding: 0 0.3em;
  border: 1px solid var(--border-strong);
  border-radius: 4px;
  font: inherit;
  font-size: 0.875em;
}

.tour__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-top: 0.7rem;
}

.tour__steps {
  display: flex;
  gap: 0.375rem;
  margin-left: auto;
}

.tour__try,
.tour__step {
  min-height: 32px;
  padding: 0 0.7rem;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: inherit;
  font: inherit;
  font-size: 0.875rem;
  cursor: pointer;
}

.tour__try:hover,
.tour__step:hover {
  background: var(--wash);
}

.tour__step--next {
  border-color: var(--fill);
  background: var(--fill);
  color: var(--on-fill, #fff);
}

.tour__step--next:hover {
  background: var(--fill);
  filter: brightness(1.08);
}
</style>
