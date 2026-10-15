<script setup lang="ts">
import { PopoverAnchor, PopoverArrow, PopoverContent, PopoverPortal, PopoverRoot } from 'reka-ui'
import { computed, onBeforeUnmount, ref } from 'vue'
import verifiedSources from '../data/verified-sources.json'
import type { GraphEdge, GraphNode } from '../data/schema'

// A small check beside a verified record. Its note says how the record was verified and,
// for the automated check, the source that supported it. The note shows on mouse hover, like
// a tooltip, and stays put on click, tap or Enter; a popover rather than a tooltip because
// it holds a link, which the pointer can move onto.
const props = defineProps<{ kind: 'node' | 'edge'; record: GraphNode | GraphEdge; label: string }>()

const supporting = computed(() => {
  const index = (verifiedSources as Record<string, number>)[`${props.kind}:${props.record.id}`]
  return index === undefined ? undefined : props.record.sources[index]
})

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

function dismiss(value: boolean) {
  if (value) return
  open.value = false
  pinned.value = false
}

// Clicks on the check itself are handled by click(), not treated as clicking outside
function insideButton(event: Event) {
  if (button.value?.contains(event.target as Node)) event.preventDefault()
}

onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <PopoverRoot v-if="record.verified" :open="open" @update:open="dismiss">
    <PopoverAnchor as-child>
      <button
        ref="button"
        type="button"
        class="verified"
        :aria-label="`Verified: ${label}`"
        :aria-expanded="open"
        aria-haspopup="dialog"
        :data-state="open ? 'open' : 'closed'"
        @click="click"
        @pointerenter="hover(true, $event)"
        @pointerleave="hover(false, $event)"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="7" />
          <path d="m4.8 8.2 2.1 2.1 4.3-4.6" />
        </svg>
      </button>
    </PopoverAnchor>
    <PopoverPortal>
      <PopoverContent
        class="verified-note"
        side="top"
        :side-offset="6"
        :collision-padding="12"
        @open-auto-focus="!pinned && $event.preventDefault()"
        @close-auto-focus="!pinned && $event.preventDefault()"
        @interact-outside="insideButton"
        @pointerenter="hover(true, $event)"
        @pointerleave="hover(false, $event)"
      >
        <template v-if="record.verifiedBy === 'jev'">
          <p><strong>Verified</strong> by Oregon Wine Graph Bot</p>
          <p v-if="supporting">
            against
            <a v-if="supporting.url" :href="supporting.url" target="_blank" rel="noopener">
              {{ supporting.title }}<span class="visually-hidden"> (opens in a new tab)</span>
            </a>
            <template v-else>{{ supporting.title }}</template>
          </p>
          <p v-else>against its cited sources</p>
        </template>
        <p v-else-if="record.verifiedBy === 'boundary'"><strong>Verified</strong> against official AVA boundary maps</p>
        <p v-else><strong>Reviewed</strong> by Oregon Wine Graph against its cited sources</p>
        <PopoverArrow class="verified-note__arrow" :width="10" :height="5" />
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<style scoped>
.verified {
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
  color: var(--accent);
  vertical-align: middle;
  cursor: pointer;
}

.verified:hover,
.verified[data-state='open'] {
  background: var(--wash);
}

.verified svg {
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
.verified-note {
  z-index: 45;
  max-width: 18rem;
  padding: 0.6rem 0.8rem;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface-raised);
  box-shadow: var(--shadow);
  font-size: 0.875rem;
}

.verified-note p {
  margin: 0;
}

.verified-note p + p {
  margin-top: 0.2rem;
  color: var(--text-secondary);
}

.verified-note a {
  color: var(--accent);
}

.verified-note__arrow {
  fill: var(--surface-raised);
}
</style>
