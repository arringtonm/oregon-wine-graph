<script setup lang="ts">
import { PopoverAnchor, PopoverContent, PopoverPortal, PopoverRoot } from 'reka-ui'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useGraph } from '../composables/useGraph'
import { TOUR_STEPS } from '../tour/steps'

// The tour's card: docked at the foot of the screen, where it stays from step to step, while
// the spotlight shows the control each step names. Non-modal, so the reader can try things
// with it open; Esc or × closes it, remembering the step for later
const props = defineProps<{
  // Where a node sits on screen, for the step that rings one
  nodeRect: (id: string) => DOMRect | null
}>()
const { state, tourStep, closeTour, finishTour } = useGraph()

const step = computed(() => (state.tour === null ? null : TOUR_STEPS[state.tour]))

// A line split into text and [keys]
const parts = (line: string) =>
  line.split(/(\[[^\]]+\])/).filter(Boolean).map((text) => (text.startsWith('[') ? { key: text.slice(1, -1) } : { text }))
const last = computed(() => state.tour === TOUR_STEPS.length - 1)

// Where the card sits: centred at the foot of the screen
const foot = {
  getBoundingClientRect: () => new DOMRect(window.innerWidth / 2, window.innerHeight - 12, 0, 0),
}

// The step's elements: every one of its selectors that's showing (laid out, and on screen:
// the collapsed filters sit just off its left edge), so a button and the panel it opens
// are lit together
function showing(element: HTMLElement): boolean {
  if (element.offsetParent === null) return false
  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.right > 0 && rect.left < window.innerWidth
}
function targetElements(): HTMLElement[] {
  return (step.value?.target ?? []).map((selector) => [...document.querySelectorAll<HTMLElement>(selector)].find(showing)).filter((element) => element !== undefined)
}

// The spotlight: while a step shows, the page is dimmed around the controls it names, so
// the eye goes there. Only a picture: clicks still reach everything, as the tour is
// non-modal. Followed every frame, as panels slide, the graph pans and menus open
type Spot = { x: number; y: number; width: number; height: number; radius: number }
const spots = ref<Spot[]>([])
let frame = 0

function spotTargets(): Spot[] {
  const current = step.value
  if (!current) return []
  // The step that rings a node: a circle around it, as the graph fills the screen
  const node = current.hint === 'node' && state.hintNodeId ? props.nodeRect(state.hintNodeId) : null
  if (node && node.width > 0) {
    const size = Math.max(node.width, node.height) + 36
    const x = node.left + node.width / 2 - size / 2
    const y = node.top + node.height / 2 - size / 2
    return [{ x, y, width: size, height: size, radius: size / 2 }]
  }
  return targetElements().map((element) => {
    const rect = element.getBoundingClientRect()
    // A little room around a control; none around a whole panel or the graph
    const pad = rect.width * rect.height > (window.innerWidth * window.innerHeight) / 8 ? 0 : 6
    return { x: rect.left - pad, y: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, radius: 10 }
  })
}

let spotKey = ''
function followSpot() {
  const next = spotTargets()
  const key = JSON.stringify(next)
  if (key !== spotKey) {
    spotKey = key
    spots.value = next
  }
  frame = state.tour === null ? 0 : requestAnimationFrame(followSpot)
}

watch(
  () => state.tour !== null,
  (open) => {
    cancelAnimationFrame(frame)
    frame = open ? requestAnimationFrame(followSpot) : 0
    if (!open) {
      spots.value = []
      spotKey = ''
    }
  },
  { immediate: true },
)

// Each step: move focus to its title, so the step is read out
const title = ref<HTMLElement>()
watch(
  () => state.tour,
  async () => {
    if (state.tour !== null) {
      await nextTick()
      title.value?.focus()
    }
  },
)
onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  clearTimeout(cheersTimer)
})

// Done: the tour's finished, with a toast of two clinking flutes that clears itself
const cheers = ref(false)
let cheersTimer = 0
function finish() {
  finishTour()
  cheers.value = true
  clearTimeout(cheersTimer)
  cheersTimer = window.setTimeout(() => (cheers.value = false), 2600)
}

// "Try it": the reader using the step's real control. Noticed on a click in its spotlit
// element (or any of its selectors, like a toggle and the panel it opens), on one of its
// keys, or on a record opening; then the card says so and Next is the thing to press.
// Never required: Next works either way
const tried = ref(false)
watch(
  () => state.tour,
  (_index, previous) => {
    tried.value = false
    // Leaving the List view step: back to the graph, where the rest of the controls are
    if (previous !== null && previous !== undefined && TOUR_STEPS[previous].hint === 'list') state.listView = false
  },
)
function onPointer(event: PointerEvent) {
  const current = step.value
  if (!current?.tryIt || current.tryIt.select) return
  const target = event.target as Element | null
  if (target?.closest('.tour')) return
  if (current.target.some((selector) => target?.closest(selector))) tried.value = true
}
function onKey(event: KeyboardEvent) {
  const keys = step.value?.tryIt?.keys
  const typing = (event.target as Element | null)?.closest('input, textarea, select, [contenteditable="true"]')
  if (keys?.includes(event.key) && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) tried.value = true
}
watch(
  () => state.selectedId,
  (id) => {
    if (id && step.value?.tryIt?.select) tried.value = true
  },
)
document.addEventListener('pointerdown', onPointer, true)
document.addEventListener('keydown', onKey, true)
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onPointer, true)
  document.removeEventListener('keydown', onKey, true)
})
</script>

<template>
  <Teleport to="body">
    <!-- The dimming: the whole screen, with a clear hole over each spotlit control -->
    <Transition name="tour-spot">
      <svg v-if="step && spots.length" class="tour-spot" aria-hidden="true">
        <mask id="tour-spot-holes">
          <rect width="100%" height="100%" fill="white" />
          <rect
            v-for="(hole, index) in spots"
            :key="index"
            class="tour-spot__hole"
            :rx="hole.radius"
            fill="black"
            :style="`x: ${hole.x}px; y: ${hole.y}px; width: ${hole.width}px; height: ${hole.height}px`"
          />
        </mask>
        <rect class="tour-spot__dim" width="100%" height="100%" mask="url(#tour-spot-holes)" />
      </svg>
    </Transition>
    <!-- The end of the tour: two flutes clink -->
    <Transition name="cheers">
      <div v-if="cheers" class="cheers" role="status">
        <svg class="cheers__glasses" viewBox="0 0 120 110" aria-hidden="true">
          <g class="cheers__glass cheers__glass--left" transform="translate(10 6)">
            <path class="cheers__wine" d="M10.5 20h19l-2.6 27.5Q20 55 13.1 47.5z" />
            <path class="cheers__flute" d="M8 4h24l-3 44Q20 57 11 48zM20 54v32M10 89q10-4 20 0" />
          </g>
          <g class="cheers__glass cheers__glass--right" transform="translate(70 6)">
            <path class="cheers__wine" d="M10.5 20h19l-2.6 27.5Q20 55 13.1 47.5z" />
            <path class="cheers__flute" d="M8 4h24l-3 44Q20 57 11 48zM20 54v32M10 89q10-4 20 0" />
          </g>
          <g class="cheers__sparks">
            <path d="M60 2v-8M52 5l-6-6M68 5l6-6M48 13h-8M72 13h8" />
          </g>
        </svg>
        <p>Cheers! You're ready to explore.</p>
      </div>
    </Transition>
  </Teleport>
  <PopoverRoot :open="step !== null" @update:open="(open) => !open && closeTour()">
    <PopoverAnchor :reference="foot" />
    <PopoverPortal>
      <PopoverContent
        v-if="step"
        class="tour"
        side="top"
        align="center"
        :side-offset="0"
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
        <!-- What to try, with the real control; ticked once they have -->
        <p v-if="step.tryIt" class="tour__try" :class="{ 'tour__try--done': tried }" aria-live="polite">
          <template v-if="tried"><span aria-hidden="true">✓</span> That's it.</template>
          <template v-else>
            <template v-for="(part, index) in parts(step.tryIt.text)" :key="index">
              <kbd v-if="'key' in part">{{ part.key }}</kbd>
              <template v-else>{{ part.text }}</template>
            </template>
          </template>
        </p>
        <div class="tour__actions">
          <span class="tour__steps">
            <button v-if="(state.tour ?? 0) > 0" type="button" class="tour__step" @click="tourStep(-1)">‹ Back</button>
            <button
              v-if="!last"
              type="button"
              class="tour__step tour__step--next"
              :class="{ 'tour__step--ready': tried }"
              @click="tourStep(1)"
            >
              Next ›
            </button>
            <button v-else type="button" class="tour__step tour__step--next" @click="finish">Done</button>
          </span>
        </div>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<style>
/* The spotlight: the screen dimmed but for a hole over each of the step's controls.
   Under the menus and popovers a step opens (z-index 40 and up), over the rest */
.tour-spot {
  position: fixed;
  z-index: 39;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.tour-spot__dim {
  fill: var(--tour-dim);
}

.tour-spot__hole {
  transition:
    x 0.25s ease,
    y 0.25s ease,
    width 0.25s ease,
    height 0.25s ease;
}

.tour-spot-enter-active,
.tour-spot-leave-active {
  transition: opacity 0.2s ease;
}

.tour-spot-enter-from,
.tour-spot-leave-to {
  opacity: 0;
}

/* Cheers: a toast in the middle of the screen as the tour ends */
.cheers {
  position: fixed;
  z-index: 47;
  top: 50%;
  left: 50%;
  display: grid;
  justify-items: center;
  gap: 0.4rem;
  padding: 1.25rem 1.75rem 1rem;
  border: 1px solid var(--accent);
  border-radius: var(--radius);
  background: var(--surface-raised);
  box-shadow: var(--shadow);
  text-align: center;
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.cheers p {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 650;
}

.cheers__glasses {
  width: 9rem;
  overflow: visible;
}

.cheers__flute {
  fill: none;
  stroke: var(--text-primary);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.cheers__wine {
  fill: #e9c46a;
  opacity: 0.85;
}

/* Each flute tips in from its foot, meets the other at the rim, and settles */
.cheers__glass {
  transform-box: fill-box;
  transform-origin: 50% 100%;
}

.cheers__glass--left {
  animation: cheers-left 1.1s cubic-bezier(0.3, 0.7, 0.4, 1) both;
}

.cheers__glass--right {
  animation: cheers-right 1.1s cubic-bezier(0.3, 0.7, 0.4, 1) both;
}

@keyframes cheers-left {
  0% {
    transform: translate(10px, 6px) rotate(-14deg);
  }
  45% {
    transform: translate(10px, 6px) rotate(12deg);
  }
  60%,
  100% {
    transform: translate(10px, 6px) rotate(9deg);
  }
}

@keyframes cheers-right {
  0% {
    transform: translate(70px, 6px) rotate(14deg);
  }
  45% {
    transform: translate(70px, 6px) rotate(-12deg);
  }
  60%,
  100% {
    transform: translate(70px, 6px) rotate(-9deg);
  }
}

/* The clink: a burst of lines where the rims meet */
.cheers__sparks {
  fill: none;
  stroke: #e9c46a;
  stroke-width: 2.5;
  stroke-linecap: round;
  opacity: 0;
  transform-box: fill-box;
  transform-origin: 50% 100%;
  animation: cheers-sparks 0.9s ease-out 0.45s both;
}

@keyframes cheers-sparks {
  0% {
    opacity: 0;
    transform: scale(0.4);
  }
  30% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: scale(1.3);
  }
}

.cheers-enter-active,
.cheers-leave-active {
  transition: opacity 0.3s ease;
}

.cheers-enter-from,
.cheers-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .tour-spot__hole,
  .tour-spot-enter-active,
  .tour-spot-leave-active {
    transition: none;
  }

  /* The flutes shown already touching, without the motion */
  .cheers__glass--left,
  .cheers__glass--right,
  .cheers__sparks {
    animation-duration: 0s;
  }
}

/* Teleported to the page body */
.tour {
  z-index: 46;
  width: min(28rem, calc(100vw - 2rem));
  padding: 0.75rem 1rem 0.9rem;
  border: 1px solid var(--accent);
  border-radius: var(--radius);
  background: var(--surface-raised);
  box-shadow: var(--shadow);
  font-size: 0.9375rem;
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
  margin-top: 1rem;
}

.tour__steps {
  display: flex;
  gap: 0.375rem;
  margin-left: auto;
}

/* "Try it": a line in the accent under the step's words; green and ticked once done */
.tour__try {
  margin: 0.15rem 0 0;
  color: var(--accent);
  font-weight: 600;
  line-height: 1.45;
}

.tour__try kbd {
  padding: 0 0.3em;
  border: 1px solid currentColor;
  border-radius: 4px;
  font: inherit;
  font-size: 0.875em;
}

.tour__try--done {
  color: var(--text-primary);
}

.tour__try--done span {
  color: var(--node-vineyard);
}

/* Next, once the step's been tried: a ring that pulses, as the way on */
.tour__step--ready {
  animation: tour-ready 1.6s ease-out infinite;
}

@keyframes tour-ready {
  0% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--fill) 55%, transparent);
  }
  100% {
    box-shadow: 0 0 0 9px transparent;
  }
}

@media (prefers-reduced-motion: reduce) {
  .tour__step--ready {
    animation: none;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--fill) 40%, transparent);
  }
}

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
