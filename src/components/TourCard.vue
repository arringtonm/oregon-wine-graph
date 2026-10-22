<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { SINGULAR_TYPE, useGraph } from '../composables/useGraph'
import { pickPhrase } from '../graph/busyPhrases'
import { TOUR_STEPS, wording } from '../tour/steps'

// The tour's card: centred on the screen, where it stays from step to step, while the
// spotlight shows the control each step names (the ringed node is picked clear of it,
// GraphCanvas.vue). Non-modal, so the reader can try things with it open; Esc or × closes
// it, remembering the step for later
const props = defineProps<{
  // Where a node sits on screen, for the step that rings one; with `connected`, the node and
  // everything it connects to
  nodeRect: (id: string, connected?: boolean) => DOMRect | null
}>()
const { state, tourStep, closeTour, finishTour, nodeById, degree, showView } = useGraph()

const step = computed(() => (state.tour === null ? null : TOUR_STEPS[state.tour]))

// A line split into text, [keys], _italics_ and the {flag} icon
type Part = { text: string } | { key: string } | { em: string } | { icon: 'flag' }
const parts = (line: string): Part[] =>
  line
    .split(/(\[[^\]]+\]|\{flag\}|_[^_]+_)/)
    .filter(Boolean)
    .map((text) =>
      text === '{flag}'
        ? { icon: 'flag' }
        : text.startsWith('[')
          ? { key: text.slice(1, -1) }
          : text.startsWith('_') && text.endsWith('_') && text.length > 2
            ? { em: text.slice(1, -1) }
            : { text },
    )
const last = computed(() => state.tour === TOUR_STEPS.length - 1)

// The step's elements: every one of its selectors that's showing (laid out, and on screen:
// the collapsed filters sit just off its left edge), so a button and the panel it opens
// are lit together
// Showing means laid out, on screen, and not covered by something else (a phone's record
// sheet over the zoom buttons): what's at its middle is it, or the tour's own card
function showing(element: HTMLElement): boolean {
  if (element.offsetParent === null) return false
  const rect = element.getBoundingClientRect()
  if (!(rect.width > 0 && rect.right > 0 && rect.left < window.innerWidth)) return false
  const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
  return !top || element.contains(top) || top.contains(element) || top.closest('.tour') !== null
}
function targetElements(selectors = step.value?.target ?? []): HTMLElement[] {
  return selectors.map((selector) => [...document.querySelectorAll<HTMLElement>(selector)].find(showing)).filter((element) => element !== undefined)
}

// The spotlight: while a step shows, the page is dimmed around the controls it names, so
// the eye goes there. Only a picture: clicks still reach everything, as the tour is
// non-modal. Followed every frame, as panels slide, the graph pans and menus open
// A soft spot fades out gradually instead of ending in a hard edge
// A view spot (a step's alsoLit) is lit, but the card may sit over it
type Spot = { x: number; y: number; width: number; height: number; radius: number; soft?: boolean; view?: boolean }
const spots = ref<Spot[]>([])
let frame = 0

function spotTargets(): Spot[] {
  const current = step.value
  if (!current) return []
  // The step that picks out a node: a soft glow around it, clear at the middle and fading
  // into the dimming, as the graph fills the screen. Once a record's open, the glow widens
  // to take in everything it connects to
  const opened = current.hint === 'node' && state.selectedId ? props.nodeRect(state.selectedId, true) : null
  const node = opened ?? (current.hint === 'node' && state.hintNodeId ? props.nodeRect(state.hintNodeId) : null)
  if (node && node.width > 0) {
    // Wide enough that the farthest corner of the area stays in the clear middle
    const size = opened ? Math.hypot(node.width, node.height) * 1.7 + 160 : Math.max(node.width, node.height) * 2 + 140
    const x = node.left + node.width / 2 - size / 2
    const y = node.top + node.height / 2 - size / 2
    return [{ x, y, width: size, height: size, radius: size / 2, soft: true }]
  }
  const controls = targetElements().map((element) => {
    const rect = element.getBoundingClientRect()
    // A little room around a control; none around a whole panel or the graph
    const pad = rect.width * rect.height > (window.innerWidth * window.innerHeight) / 8 ? 0 : 6
    return { x: rect.left - pad, y: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, radius: 10 }
  })
  // A view, lit only where it's in the open: the graph runs on under the header and
  // toolbar, the panels beside it and, on smaller screens, the record sheet at its foot
  const toolbar = document.querySelector('.graph-canvas__toolbar')?.getBoundingClientRect()
  const sheet = document.getElementById('details')?.getBoundingClientRect()
  const views = targetElements(current.alsoLit ?? []).map((element) => {
    const rect = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    const left = Math.max(rect.left, length(style.getPropertyValue('--inset-left')))
    const right = Math.min(rect.right, document.documentElement.clientWidth - length(style.getPropertyValue('--inset-right')))
    const top = Math.max(rect.top, toolbar ? toolbar.bottom + 6 : rect.top)
    const across = sheet && sheet.height > 0 && sheet.left <= left + 1 && sheet.right >= right - 1
    const bottom = across ? Math.min(rect.bottom, sheet.top) : rect.bottom
    return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top), radius: 0, view: true }
  })
  return [...controls, ...views]
}

// "23rem" or "0px" in pixels (App.vue's insets are one or the other)
function length(value: string): number {
  const number = parseFloat(value) || 0
  return value.trim().endsWith('rem') ? number * parseFloat(getComputedStyle(document.documentElement).fontSize) : number
}

// Phones: the card goes to whichever half of the screen the spotlight isn't in, so it
// doesn't cover what it's describing (an open filters drawer, the zoom buttons). Wider
// screens keep it centred
const phoneQuery = window.matchMedia?.('(max-width: 600px)')
const phone = ref(phoneQuery?.matches ?? false)
const onPhone = () => (phone.value = phoneQuery?.matches ?? false)
phoneQuery?.addEventListener('change', onPhone)
onBeforeUnmount(() => phoneQuery?.removeEventListener('change', onPhone))
// Of the foot, the middle and the top, the place that covers least of the spotlight
// (ties go in that order: the foot is easiest to reach, and covers least of the graph)
const edge = computed<'top' | 'bottom' | null>(() => {
  const kept = spots.value.filter((spot) => !spot.view)
  if (!phone.value || kept.length === 0) return phone.value ? 'bottom' : null
  const height = document.querySelector<HTMLElement>('.tour')?.offsetHeight ?? 260
  const screen = window.innerHeight
  const places = [
    { edge: 'bottom' as const, top: screen - 12 - height },
    { edge: null, top: (screen - height) / 2 },
    { edge: 'top' as const, top: 12 },
  ]
  const covered = (top: number) =>
    kept.reduce((sum, spot) => sum + Math.max(0, Math.min(top + height, spot.y + spot.height) - Math.max(top, spot.y)) * spot.width, 0)
  return places.reduce((best, place) => (covered(place.top) < covered(best.top) ? place : best)).edge
})

let spotKey = ''
function followSpot() {
  const next = spotTargets()
  const key = JSON.stringify(next)
  if (key !== spotKey) {
    spotKey = key
    spots.value = next
  }
  // Its menu opened (the tooltip steps aside for it, as in style.css), or it's gone
  if (raised && (raised.getAttribute('aria-expanded') === 'true' || !raised.isConnected)) raiseTip(null)
  frame = state.tour === null ? 0 : requestAnimationFrame(followSpot)
}

// A spotlit button's own tooltip (data-tip, style.css) is drawn within the toolbar, which
// sits under the dimming; while it shows, the tour draws it again over the dimming, in
// the same place. Tip.vue's tooltips are on the page body, over the dimming already
const raisedTip = ref<{ text: string; style: Record<string, string> } | null>(null)
let raised: HTMLElement | null = null
const canHover = window.matchMedia('(hover: hover)')
function raiseTip(element: HTMLElement | null) {
  if (element === raised) return
  raised?.removeAttribute('data-tip-raised')
  raised = element
  raisedTip.value = null
  if (!element) return
  element.setAttribute('data-tip-raised', '')
  const rect = element.getBoundingClientRect()
  const page = document.documentElement
  const style: Record<string, string> =
    element.dataset.tipSide === 'top' ? { bottom: `${page.clientHeight - rect.top + 6}px` } : { top: `${rect.bottom + 6}px` }
  if (element.dataset.tipAlign === 'end') style.right = `${page.clientWidth - rect.right}px`
  else Object.assign(style, { left: `${rect.left + rect.width / 2}px`, transform: 'translateX(-50%)' })
  raisedTip.value = { text: element.dataset.tip ?? '', style }
}
// The tooltip's button, if it's one the step lights
function tipOf(target: EventTarget | null): HTMLElement | null {
  const element = target instanceof Element ? target.closest<HTMLElement>('[data-tip]') : null
  return element && targetElements().some((lit) => lit.contains(element)) ? element : null
}
function onPointerOver(event: PointerEvent) {
  if (state.tour !== null && canHover.matches) raiseTip(tipOf(event.target))
}
function onPointerOut(event: PointerEvent) {
  if (!event.relatedTarget) raiseTip(null)
}
function onFocusIn(event: FocusEvent) {
  const element = state.tour === null ? null : tipOf(event.target)
  raiseTip(element?.matches(':focus-visible') ? element : null)
}
watch(
  () => state.tour,
  () => raiseTip(null),
)

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
  // The toast takes the card's height, so it sits in the card's place
  const card = document.querySelector<HTMLElement>('.tour')
  if (card) document.documentElement.style.setProperty('--tour-card-height', `${card.offsetHeight}px`)
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
// What the card says once they have: a new word of praise each time, never the same twice
// in a row
const PRAISE = ['Well done!', 'You found it!', 'Good job!', 'Nicely done!', 'Spot on!', "That's the one!"]
const praise = ref(PRAISE[0])
watch(tried, (done) => done && (praise.value = pickPhrase(PRAISE, praise.value)))
// The record step: the record the reader has open (from step 1, or opened now), what it is
// and how many connections it has, and where they went from it
const picked = ref<string | null>(null)
const movedTo = ref<string | null>(null)
const another = computed(() => step.value?.tryIt?.another === true)
const pickedRecord = computed(() => {
  const node = picked.value ? nodeById.value.get(picked.value) : undefined
  return node ? { node, connections: degree.value.get(node.id) ?? 0 } : null
})
// A record with nothing to click through to: there's no other record to try
const alone = computed(() => another.value && pickedRecord.value?.connections === 0)
const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a')
const pickedNote = computed(() => {
  const record = pickedRecord.value
  if (!another.value || !record) return ''
  if (record.connections === 0) return "You found a record without any connections. That's pretty rare!"
  const type = SINGULAR_TYPE[record.node.type]
  const count = `${record.connections} connection${record.connections === 1 ? '' : 's'}`
  return `You picked ${record.node.name}, ${article(type)} ${type} with ${count}.`
})
const tryText = computed(() => {
  if (another.value && !pickedRecord.value) return wording('Try it: {click} an icon on the graph to open a record.')
  return step.value?.tryIt ? wording(step.value.tryIt.text) : ''
})
const movedName = computed(() => (movedTo.value ? nodeById.value.get(movedTo.value)?.name : undefined))

watch(
  () => state.tour,
  (_index, previous) => {
    tried.value = false
    picked.value = state.selectedId
    movedTo.value = null
    // Leaving the views step: back to the graph, where the rest of the controls are
    if (previous !== null && previous !== undefined && TOUR_STEPS[previous].hint === 'views') showView('graph')
  },
)
function onPointer(event: PointerEvent) {
  const current = step.value
  if (!current?.tryIt || current.tryIt.select || current.tryIt.another) return
  const target = event.target as Element | null
  if (target?.closest('.tour')) return
  if (current.target.some((selector) => target?.closest(selector))) tried.value = true
}
function onKey(event: KeyboardEvent) {
  // Esc closes the tour, and only the tour: an open record stays open (App.vue's Esc skips a
  // handled key)
  if (event.key === 'Escape' && state.tour !== null) {
    event.preventDefault()
    closeTour()
    return
  }
  const keys = step.value?.tryIt?.keys
  const typing = (event.target as Element | null)?.closest('input, textarea, select, [contenteditable="true"]')
  if (keys?.includes(event.key) && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) tried.value = true
}
watch(
  () => state.selectedId,
  (id) => {
    if (id && step.value?.tryIt?.select) tried.value = true
    if (another.value && id) {
      // The first record opened here is the one picked; moving on from it is the try
      if (!picked.value) picked.value = id
      else if (id !== picked.value && !alone.value) {
        movedTo.value = id
        tried.value = true
      }
    }
  },
)
document.addEventListener('pointerdown', onPointer, true)
document.addEventListener('keydown', onKey, true)
document.addEventListener('pointerover', onPointerOver, true)
document.addEventListener('pointerout', onPointerOut, true)
document.addEventListener('focusin', onFocusIn, true)
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onPointer, true)
  document.removeEventListener('keydown', onKey, true)
  document.removeEventListener('pointerover', onPointerOver, true)
  document.removeEventListener('pointerout', onPointerOut, true)
  document.removeEventListener('focusin', onFocusIn, true)
  raiseTip(null)
})
</script>

<template>
  <Teleport to="body">
    <!-- The dimming: the whole screen, with a clear hole over each spotlit control -->
    <Transition name="tour-spot">
      <!-- Dimmed even when nothing of the step is on screen (a phone's record panel, before a
           record is open), so the tour looks the same from step to step -->
      <svg v-if="step" class="tour-spot" aria-hidden="true">
        <defs>
          <!-- Clear at the middle, fading out to the full dimming at the edge -->
          <radialGradient id="tour-spot-soft">
            <stop offset="0" stop-color="black" />
            <stop offset="0.45" stop-color="black" />
            <stop offset="1" stop-color="white" />
          </radialGradient>
        </defs>
        <mask id="tour-spot-holes">
          <rect width="100%" height="100%" fill="white" />
          <rect
            v-for="(hole, index) in spots"
            :key="index"
            class="tour-spot__hole"
            :rx="hole.radius"
            :fill="hole.soft ? 'url(#tour-spot-soft)' : 'black'"
            :style="`x: ${hole.x}px; y: ${hole.y}px; width: ${hole.width}px; height: ${hole.height}px`"
          />
        </mask>
        <rect class="tour-spot__dim" width="100%" height="100%" mask="url(#tour-spot-holes)" />
      </svg>
    </Transition>
    <!-- A spotlit button's tooltip, over the dimming -->
    <div v-if="raisedTip" class="tip tour-tip" :style="raisedTip.style" aria-hidden="true">{{ raisedTip.text }}</div>
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
  <Teleport to="body">
      <div v-if="step" class="tour" :class="edge && `tour--${edge}`" role="dialog" aria-labelledby="tour-title">
        <div class="tour__top">
          <span class="tour__count">{{ (state.tour ?? 0) + 1 }} of {{ TOUR_STEPS.length }}</span>
          <button type="button" class="tour__close" aria-label="Close the tour" @click="closeTour">
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <h2 id="tour-title" ref="title" class="tour__title" tabindex="-1">{{ step.title }}</h2>
        <p v-for="(line, lineIndex) in step.body" :key="lineIndex" class="tour__body">
          <template v-for="(part, index) in parts(wording(line))" :key="index">
            <kbd v-if="'key' in part">{{ part.key }}</kbd>
            <em v-else-if="'em' in part">{{ part.em }}</em>
            <!-- "Flag" and the Flag button's own icon (FlagButton.vue), never split across lines -->
            <span v-else-if="'icon' in part" class="tour__nowrap">
              Flag<svg class="tour__icon" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3.5 14.5v-12" />
                <path d="M3.5 3c2.5-1.6 4.5 1 7 0l1.8-.6v6.8l-1.8.6c-2.5 1-4.5-1.6-7 0" />
              </svg>
            </span>
            <template v-else>{{ part.text }}</template>
          </template>
        </p>
        <!-- What to try, with the real control; ticked once they have -->
        <!-- The record step: what the reader picked -->
        <p v-if="pickedNote" class="tour__body tour__picked" aria-live="polite">{{ pickedNote }}</p>
        <p v-if="step.tryIt && !alone" class="tour__try" :class="{ 'tour__try--done': tried }" aria-live="polite">
          <template v-if="tried">
            <span aria-hidden="true">✓</span> {{ praise }}<template v-if="movedName"> Now you're on {{ movedName }}.</template>
          </template>
          <template v-else>
            <template v-for="(part, index) in parts(tryText)" :key="index">
              <kbd v-if="'key' in part">{{ part.key }}</kbd>
              <template v-else-if="'text' in part">{{ part.text }}</template>
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
      </div>
  </Teleport>
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
  align-content: center;
  justify-items: center;
  gap: 0.4rem;
  box-sizing: border-box;
  /* The tour card's box (.tour: the same width, centred the same way), so the toast takes
     the card's place exactly as it closes */
  width: min(28rem, calc(100vw - 2rem));
  min-height: var(--tour-card-height, 12rem);
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
/* Looks like the button's own tooltip (style.css), shown after the same pause */
.tour-tip {
  position: fixed;
  z-index: 48;
  line-height: 1.45;
  white-space: nowrap;
  pointer-events: none;
  animation: tour-tip-in 0.12s ease 0.4s both;
}

@keyframes tour-tip-in {
  from {
    opacity: 0;
  }
}

/* Centred on the screen, over the dimming */
.tour {
  position: fixed;
  z-index: 46;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(28rem, calc(100vw - 2rem));
  max-height: calc(100vh - 2rem);
  overflow-y: auto;
  padding: 0.75rem 1rem 0.9rem;
  border: 1px solid var(--accent);
  border-radius: var(--radius);
  background: var(--surface-raised);
  box-shadow: var(--shadow);
  font-size: 0.9375rem;
}

/* Phones: at the top or foot of the screen, away from the spotlight */
.tour--top,
.tour--bottom {
  transform: translateX(-50%);
  max-height: calc(50vh - 1rem);
}

.tour--top {
  top: calc(env(safe-area-inset-top, 0px) + 0.75rem);
}

.tour--bottom {
  top: auto;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 0.75rem);
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

.tour__picked {
  font-weight: 600;
}

.tour__nowrap {
  white-space: nowrap;
}

.tour__icon {
  margin-left: 0.25em;
  width: 0.95em;
  height: 0.95em;
  vertical-align: -0.12em;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
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
  /* Clear room between the words and Back and Next */
  margin-top: 1.4rem;
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
/* Once tried, Next gives a single soft pulse to say it's the thing to press, then rests */
.tour__step--ready {
  animation: tour-ready 1.2s ease-out 1;
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
