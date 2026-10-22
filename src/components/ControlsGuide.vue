<script setup lang="ts">
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useGraph } from '../composables/useGraph'
import PanelBackdrop from './PanelBackdrop.vue'
import { deviceName, modifier, touchOnly } from '../services/device'

// How to move around the graph, for the device in hand: touch gestures on a phone or
// tablet, mouse and trackpad on a computer, with ⌘ or Ctrl to match the system. The ? key
// opens and closes it from anywhere outside a text field.

interface Section {
  title: string
  rows: { action: string; ways: string[] }[]
}

const open = ref(false)
// Phones and tablets: the page dims behind the guide, its ? button lit (PanelBackdrop)
const smallQuery = window.matchMedia('(max-width: 1024px)')
const small = ref(smallQuery.matches)
const onSmall = () => (small.value = smallQuery.matches)
onMounted(() => smallQuery.addEventListener('change', onSmall))
onBeforeUnmount(() => smallQuery.removeEventListener('change', onSmall))
const toggle = ref<HTMLElement | null>(null)
// Opened from the start panel's "Press ?"
const { state, startTour } = useGraph()
// The map view is offered only where the build has a Mapbox token (GraphCanvas.vue)
const mapRows = import.meta.env.VITE_MAPBOX_TOKEN ? [{ action: 'See wineries on a map of the hills and AVAs', ways: ['Map view'] }] : []

function takeTour() {
  open.value = false
  startTour()
}
watch(
  () => state.controlsRequest,
  () => {
    if (state.tour === null) state.hint = null
    open.value = true
  },
)
// The tour moving on (or closing) closes the guide, so it doesn't sit over the next step
watch(
  () => state.tour,
  (_step, previous) => {
    if (previous !== null) open.value = false
  },
)


const sections = computed<Section[]>(() =>
  touchOnly
    ? [
        {
          title: 'Move around',
          rows: [
            { action: 'Pan', ways: ['Drag'] },
            { action: 'Zoom', ways: ['Pinch', '+ / − buttons'] },
            { action: 'Fit the whole graph', ways: ['Fit button'] },
          ],
        },
        {
          title: 'Find',
          rows: [
            { action: 'Find a person or place, or ask a question', ways: ['Search'] },
            { action: 'A curated view of the graph', ways: ['Guides'] },
            { action: 'Somewhere new at random', ways: ['Dice button'] },
            { action: 'Browse everything by name', ways: ['List view'] },
            ...mapRows,
            { action: 'Show only some types or regions', ways: ['Filters button'] },
          ],
        },
        {
          title: 'Read a record',
          rows: [
            { action: 'Open a person or place', ways: ['Tap node', 'Tap a name'] },
            { action: 'Show everyone, not just the best-connected', ways: ['Show all records, in Filters'] },
            { action: 'See how its facts were checked', ways: ['Verified, at its foot'] },
            { action: 'Report a mistake', ways: ['Flag, at its foot'] },
            { action: 'Close it', ways: ['Tap empty area', '× in panel'] },
          ],
        },
        {
          title: 'History',
          rows: [
            { action: 'Back and forward', ways: ['‹ / › buttons'] },
            { action: 'Earlier selections', ways: ['History menu'] },
            { action: 'All filters and settings back to default', ways: ['Reset button'] },
          ],
        },
        {
          title: 'Site',
          rows: [
            { action: 'Light or dark mode', ways: ['Glasses, top right'] },
            { action: 'About the site', ways: ['i button'] },
          ],
        },
      ]
    : [
        {
          title: 'Move around',
          rows: [
            { action: 'Pan', ways: ['Two-finger scroll', 'Scroll wheel', 'Drag empty area'] },
            { action: 'Zoom', ways: ['Pinch', `${modifier} + Scroll`, '+ / − keys', '+ / − buttons'] },
            { action: 'Fit the whole graph', ways: ['Fit button', 'F key'] },
            { action: 'Move a node', ways: ['Drag node'] },
          ],
        },
        {
          title: 'Find',
          rows: [
            { action: 'Find a person or place, or ask a question', ways: ['Search'] },
            { action: 'A curated view of the graph', ways: ['Guides'] },
            { action: 'Somewhere new at random', ways: ['Dice button', 'R key'] },
            { action: 'Browse everything by name', ways: ['List view'] },
            ...mapRows,
            { action: 'Show only some types or regions', ways: ['Filters'] },
          ],
        },
        {
          title: 'Read a record',
          rows: [
            { action: 'Open a person or place', ways: ['Click node', 'Click a name'] },
            { action: 'Show everyone, not just the best-connected', ways: ['Show all records, in Filters'] },
            { action: 'Preview a linked record', ways: ['Hover its name'] },
            { action: 'See how its facts were checked', ways: ['Verified, at its foot'] },
            { action: 'Report a mistake', ways: ['Flag, at its foot'] },
            { action: 'Close it', ways: ['Esc', 'Click empty area'] },
          ],
        },
        {
          title: 'History',
          rows: [
            { action: 'Back and forward', ways: ['‹ / › buttons'] },
            { action: 'Earlier selections', ways: ['History menu'] },
            { action: 'All filters and settings back to default', ways: ['Reset button'] },
          ],
        },
        {
          title: 'Panels',
          rows: [
            { action: 'Show or hide filters', ways: ['Sidebar button'] },
            { action: 'Show or hide this guide', ways: ['?'] },
            { action: 'Light or dark mode', ways: ['Glasses, top right'] },
            { action: 'About the site', ways: ['i button'] },
          ],
        },
      ],
)

function isTyping(target: EventTarget | null) {
  return !!(target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]')
}

// The popover handles Escape, outside clicks and focus itself; ? toggles it from anywhere
function onKeydown(event: KeyboardEvent) {
  if (event.key !== '?' || isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return
  event.preventDefault()
  open.value = !open.value
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="guide">
    <PopoverRoot v-model:open="open">
      <!-- Just "?", its shortcut; named "Controls", which its tooltip shows (style.css's
           data-tip: a Reka tooltip on the popover's own trigger would fight it for the button) -->
      <PopoverTrigger as-child>
        <button
          ref="toggle"
          type="button"
          class="guide__toggle"
          :class="{ 'is-hinted': state.hint === 'controls' }"
          aria-label="Controls" aria-keyshortcuts="?" data-tip="Controls" data-tip-align="end">
          <span aria-hidden="true">?</span>
        </button>
      </PopoverTrigger>
      <!-- At the top of the page, so it sits above the backdrop -->
      <PopoverPortal>
        <!-- With the backdrop (phones and tablets), it closes the guide: a press outside mustn't
             close it first, or the rest of the tap would land on the graph underneath -->
        <PopoverContent
          class="guide__panel"
          @pointer-down-outside="(event: Event) => small && event.preventDefault()"
          align="end"
          :side-offset="4"
          :collision-padding="12"
          aria-labelledby="controls-guide-heading"
        >
          <!-- A div, not <header>: outside a sectioning element a header is the page's banner,
               and the page already has one -->
          <div class="guide__header">
            <h2 id="controls-guide-heading">{{ touchOnly ? 'Touch controls' : 'Controls' }}</h2>
            <span class="guide__platform">{{ deviceName }}</span>
            <button type="button" class="guide__tour" @click="takeTour">Take the tour</button>
            <button type="button" class="guide__close" aria-label="Close the controls" @click="open = false">
              <span aria-hidden="true">×</span>
            </button>
          </div>
          <!-- Focusable so keyboard readers can scroll it (WCAG 2.1.1) -->
          <div class="guide__body" tabindex="0" role="region" aria-label="Controls list">
            <section v-for="section in sections" :key="section.title" :aria-labelledby="`guide-${section.title}`">
              <h3 :id="`guide-${section.title}`">{{ section.title }}</h3>
              <dl>
                <div v-for="row in section.rows" :key="row.action" class="guide__row">
                  <dt>{{ row.action }}</dt>
                  <dd>
                    <template v-for="(way, index) in row.ways" :key="way">
                      <span v-if="index > 0" class="visually-hidden">or</span>
                      <kbd>{{ way }}</kbd>
                    </template>
                  </dd>
                </div>
              </dl>
            </section>
          </div>
        </PopoverContent>
      </PopoverPortal>
    </PopoverRoot>
    <PanelBackdrop v-if="open && small && state.tour === null" :trigger="toggle" @close="open = false" />
  </div>
</template>

<style scoped>
.guide {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  max-width: 100%;
  /* The column it sits in lets taps through to the graph */
  pointer-events: auto;
}

.guide__toggle {
  display: inline-grid;
  place-items: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--frost);
  -webkit-backdrop-filter: var(--frost-blur);
  backdrop-filter: var(--frost-blur);
  color: inherit;
  font: inherit;
  font-size: 1.0625rem;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
}

.guide__toggle:hover {
  background: var(--surface);
}

kbd {
  display: inline-block;
  padding: 0.125rem 0.5rem;
  border: 1px solid var(--border-strong);
  border-radius: 5px;
  background: var(--surface);
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 0.8125rem;
  line-height: 1.5;
  white-space: nowrap;
}

/* As large as the toolbar's other buttons on smaller screens */
@media (max-width: 1024px) {
  .guide__toggle {
    width: 40px;
    height: 40px;
  }
}
</style>

<style>
/* Reka wraps the popover in its own positioning element, beyond this component's scoped styles */
.guide__panel {
  display: flex;
  flex-direction: column;
  /* Never wider or taller than the screen leaves (it ran off phones at a fixed 30rem) */
  width: min(30rem, calc(100vw - 2rem));
  max-height: min(var(--reka-popover-content-available-height, 75vh), 40rem);
  /* Over the tour's dimming (39), for the tour's Help step */
  z-index: 41;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: var(--surface-raised);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
}

.guide__close {
  display: grid;
  flex: none;
  place-items: center;
  width: 32px;
  height: 32px;
  margin: -0.4rem -0.6rem -0.4rem 0;
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

.guide__close:hover {
  background: var(--wash);
  color: var(--text-primary);
}

.guide__header {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.875rem 1.125rem;
  border-bottom: 1px solid var(--border);
}

.guide__tour {
  margin-left: auto;
  padding: 0;
  border: 0;
  background: none;
  color: var(--link);
  font: inherit;
  font-size: 0.875rem;
  cursor: pointer;
}

.guide__tour:hover {
  text-decoration: underline;
}

.guide__header h2 {
  margin: 0;
  font-size: 1.0625rem;
}

.guide__platform {
  color: var(--text-secondary);
  font-size: 0.8125rem;
}

.guide__body {
  overflow-y: auto;
  /* Its focus ring sits inside, where the panel's edge can't clip it */
  outline-offset: -2px;
  padding: 0.25rem 1.125rem 1rem;
}

.guide__panel h3 {
  margin: 1rem 0 0.375rem;
  color: var(--text-secondary);
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.guide__panel dl {
  margin: 0;
}

.guide__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.3125rem 0;
}

.guide__panel dt {
  min-width: 0;
}

.guide__panel dd {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.375rem;
  margin: 0;
}
.guide__panel kbd {
  display: inline-block;
  padding: 0.125rem 0.5rem;
  border: 1px solid var(--border-strong);
  border-radius: 5px;
  background: var(--surface);
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 0.8125rem;
  line-height: 1.5;
  white-space: nowrap;
}
</style>
