<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import Chevron from './Chevron.vue'

// How to move around the graph, for the device in hand: touch gestures on a phone or
// tablet, mouse and trackpad on a computer, with ⌘ or Ctrl to match the system. The ? key
// opens and closes it from anywhere outside a text field.

interface Section {
  title: string
  rows: { action: string; ways: string[] }[]
}

const open = ref(false)
const panel = ref<HTMLElement>()
const toggle = ref<HTMLButtonElement>()

const touchOnly = window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(any-pointer: fine)').matches
const platform =
  (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? ''
const mac = /mac|iphone|ipad/i.test(platform)
const modifier = mac ? '⌘' : 'Ctrl'

const sections = computed<Section[]>(() =>
  touchOnly
    ? [
        {
          title: 'Move around',
          rows: [
            { action: 'Pan', ways: ['Drag'] },
            { action: 'Zoom', ways: ['Pinch', '+ / − buttons'] },
          ],
        },
        {
          title: 'Select',
          rows: [
            { action: 'Select a person or place', ways: ['Tap node'] },
            { action: 'Close the selection', ways: ['Tap empty area', '× in panel'] },
          ],
        },
        { title: 'History', rows: [{ action: 'Back and forward', ways: ['‹ / › buttons'] }] },
      ]
    : [
        {
          title: 'Move around',
          rows: [
            { action: 'Pan', ways: ['Two-finger scroll', 'Scroll wheel', 'Drag empty area'] },
            { action: 'Zoom', ways: ['Pinch', `${modifier} + Scroll`, '+ / − buttons'] },
            { action: 'Fit the whole graph', ways: ['Fit button'] },
          ],
        },
        {
          title: 'Select',
          rows: [
            { action: 'Select a person or place', ways: ['Click node'] },
            { action: 'Read a connection', ways: ['Hover line'] },
            { action: 'Close the selection', ways: ['Esc', 'Click empty area'] },
            { action: 'Move a node', ways: ['Drag node'] },
          ],
        },
        {
          title: 'History',
          rows: [
            { action: 'Back and forward', ways: ['‹ / › buttons'] },
            { action: 'Earlier selections', ways: ['History menu'] },
          ],
        },
        { title: 'Help', rows: [{ action: 'Show or hide this guide', ways: ['?'] }] },
      ],
)

async function setOpen(value: boolean, { focusPanel = false } = {}) {
  open.value = value
  if (value && focusPanel) {
    await nextTick()
    panel.value?.focus()
  }
}

function isTyping(target: EventTarget | null) {
  return !!(target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]')
}

// Listens in the capture phase, ahead of the app's own Escape handler (which mounts
// first, since the graph waits for its data), so Escape closes the guide before it would
// close the selection
function onKeydown(event: KeyboardEvent) {
  if (event.key === '?' && !isTyping(event.target) && !event.metaKey && !event.ctrlKey && !event.altKey) {
    event.preventDefault()
    setOpen(!open.value, { focusPanel: true })
  } else if (event.key === 'Escape' && open.value) {
    event.preventDefault()
    const hadFocus = panel.value?.contains(document.activeElement)
    setOpen(false)
    if (hadFocus) toggle.value?.focus()
  }
}

onMounted(() => document.addEventListener('keydown', onKeydown, { capture: true }))
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown, { capture: true }))
</script>

<template>
  <div class="guide">
    <button
      ref="toggle"
      type="button"
      class="guide__toggle"
      aria-controls="controls-guide"
      :aria-expanded="open"
      aria-keyshortcuts="?"
      @click="setOpen(!open)"
    >
      <kbd aria-hidden="true">?</kbd> Controls<Chevron />
    </button>
    <section
      v-show="open"
      id="controls-guide"
      ref="panel"
      class="guide__panel"
      tabindex="-1"
      aria-labelledby="controls-guide-heading"
    >
      <header class="guide__header">
        <h2 id="controls-guide-heading">{{ touchOnly ? 'Touch controls' : 'Controls' }}</h2>
        <span class="guide__platform">{{ touchOnly ? 'Phone or tablet' : mac ? 'Mac' : 'Windows or Linux' }}</span>
      </header>
      <div class="guide__body">
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
    </section>
  </div>
</template>

<style scoped>
.guide {
  position: absolute;
  z-index: 4;
  top: 12px;
  right: 12px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  max-width: calc(100% - 24px);
}

.guide__toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--surface-raised);
  color: inherit;
  font: inherit;
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

.guide__panel {
  display: flex;
  flex-direction: column;
  width: 30rem;
  max-width: 100%;
  max-height: min(75vh, 40rem);
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: var(--surface-raised);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
}

.guide__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.875rem 1.125rem;
  border-bottom: 1px solid var(--border);
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
  padding: 0.25rem 1.125rem 1rem;
}

h3 {
  margin: 1rem 0 0.375rem;
  color: var(--text-secondary);
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

dl {
  margin: 0;
}

.guide__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.3125rem 0;
}

dt {
  min-width: 0;
}

dd {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.375rem;
  margin: 0;
}

@media (max-width: 1024px) {
  .guide__toggle {
    height: 40px;
  }
}
</style>
