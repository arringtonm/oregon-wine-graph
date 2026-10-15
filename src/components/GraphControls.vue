<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { HIDDEN_TYPES, useGraph, type ToggleableNodeType } from '../composables/useGraph'
import { viewById } from '../graph/views'
import { EDGE_CATEGORIES, EDGE_CATEGORY_LABELS, NODE_TYPE_LABELS } from '../data/schema'
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import Check from './Check.vue'
import Chevron from './Chevron.vue'
import VerifiedInfo from './VerifiedInfo.vue'
import NodeGlyph from './NodeGlyph.vue'

const { state, avas, activeView, resetFilters } = useGraph()

// A guided view's focus, while one is set: shown above the filters, removable
const focusLabel = computed(() => viewById(state.focus)?.focus?.label)

const sortedAvas = computed(() => [...avas.value].sort((a, b) => a.name.localeCompare(b.name)))
const avaSummary = computed(() => {
  if (state.avas.length === 0) return 'All regions'
  if (state.avas.length > 1) return `${state.avas.length} chosen`
  return avas.value.find((ava) => ava.id === state.avas[0])?.name.replace(/ AVA$/, '') ?? '1 chosen'
})

// Hidden types (see HIDDEN_TYPES) get no checkbox
const toggleableTypes = (Object.keys(state.nodeTypes) as ToggleableNodeType[]).filter((type) => !HIDDEN_TYPES.has(type))

// Which version this is, for readers reporting a problem: "v1.06 · Oct 15, 2026", then
// "Release notes": the commit the site was built from, whose message describes the release
const releaseNotes = /^[0-9a-f]{7,40}$/.test(__BUILD_COMMIT__)
  ? `https://github.com/arringtonm/oregon-wine-graph/commit/${__BUILD_COMMIT__}`
  : undefined
const build = `${__SITE_VERSION__} · ${new Date(__BUILD_DATE__).toLocaleDateString('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})}`

function setAva(id: string, chosen: boolean) {
  state.avas = chosen ? [...state.avas, id] : state.avas.filter((other) => other !== id)
}

// On small screens the sidebar is a drawer over the graph, behaving as a modal dialog
const compactQuery = window.matchMedia('(max-width: 1024px)')
const compact = ref(compactQuery.matches)
const onCompactChange = () => (compact.value = compactQuery.matches)
onMounted(() => {
  compactQuery.addEventListener('change', onCompactChange)
  // The width may have changed since setup read it, before this listened
  onCompactChange()
})
onBeforeUnmount(() => compactQuery.removeEventListener('change', onCompactChange))
const isDialog = computed(() => compact.value && state.filtersOpen)
// Hidden on desktop by the toolbar's sidebar button; out of the tab order while hidden
const collapsedOnDesktop = computed(() => !compact.value && state.filtersCollapsed)
const aside = ref<HTMLElement>()

watch(
  () => state.filtersOpen,
  async (open) => {
    if (!compact.value) return
    await nextTick()
    if (open) {
      // Opening moves focus into the drawer
      aside.value?.querySelector<HTMLElement>('button, [role="checkbox"]')?.focus()
      return
    }
    // Closing returns focus to the button that opened it, if focus was in the drawer or lost;
    // a pick elsewhere has already moved it to the chosen node's details
    const focus = document.activeElement
    if (!focus || focus === document.body || aside.value?.contains(focus)) document.getElementById('filters-toggle')?.focus()
  },
)

// Smaller screens only: Reset lives here rather than on the crowded toolbar. The drawer
// closes so the fresh layout can be seen
function resetGraph() {
  state.resetRequest++
  state.filtersOpen = false
}

function onDrawerKey(event: KeyboardEvent) {
  if (event.key === 'Escape' && isDialog.value) state.filtersOpen = false
}
</script>

<template>
  <aside
    id="filters"
    ref="aside"
    class="controls"
    :class="{ 'controls--open': state.filtersOpen, 'controls--collapsed': collapsedOnDesktop }"
    :inert="collapsedOnDesktop || undefined"
    aria-label="Filters"
    :role="isDialog ? 'dialog' : undefined"
    :aria-modal="isDialog ? 'true' : undefined"
    @keydown="onDrawerKey"
  >
    <button type="button" class="controls__close" @click="state.filtersOpen = false">Done</button>

    <!-- The guided view showing (the toolbar's Guides menu), or a view's focus kept after
         other filters changed -->
    <p v-if="activeView || focusLabel" class="controls__view">
      <span>
        <template v-if="activeView">Showing: <strong>{{ activeView.title }}</strong></template>
        <template v-else>Only: <strong>{{ focusLabel }}</strong></template>
      </span>
      <button
        type="button"
        class="controls__view-clear"
        @click="activeView ? resetFilters() : (state.focus = null)"
      >
        Clear<span class="visually-hidden"> {{ activeView ? 'the guided view' : focusLabel }}</span>
      </button>
    </p>

    <fieldset>
      <legend>Show</legend>
      <Check v-for="type in toggleableTypes" :key="type" v-model="state.nodeTypes[type]">
        {{ NODE_TYPE_LABELS[type] }}
        <template #icon><NodeGlyph :type="type" /></template>
      </Check>
    </fieldset>

    <fieldset>
      <legend>Connections</legend>
      <Check v-for="category in EDGE_CATEGORIES" :key="category" v-model="state.categories[category]">
        {{ category === 'geography' ? 'AVA regions' : EDGE_CATEGORY_LABELS[category] }}
        <template #icon>
          <NodeGlyph v-if="category === 'geography'" type="ava" />
          <span v-else class="controls__line" :class="`controls__line--${category}`" aria-hidden="true"></span>
        </template>
      </Check>
    </fieldset>

    <fieldset>
      <legend>Narrow</legend>
      <PopoverRoot>
        <PopoverTrigger class="controls__avas-toggle">
          AVA
          <span class="controls__avas-chosen">{{ avaSummary }}<Chevron /></span>
        </PopoverTrigger>
        <PopoverPortal>
          <PopoverContent class="ava-picker" side="bottom" align="start" :side-offset="6" aria-label="AVAs to show">
            <div class="ava-picker__head">
              <span>Show only these AVAs</span>
              <button v-if="state.avas.length" type="button" class="ava-picker__clear" @click="state.avas = []">Clear</button>
            </div>
            <div class="ava-picker__list">
              <Check
                v-for="ava in sortedAvas"
                :key="ava.id"
                :model-value="state.avas.includes(ava.id)"
                @update:model-value="(chosen: boolean) => setAva(ava.id, chosen)"
              >
                {{ ava.name.replace(/ AVA$/, '') }}
              </Check>
            </div>
          </PopoverContent>
        </PopoverPortal>
      </PopoverRoot>
      <Check v-model="state.oregonOnly" describedby="oregon-only-hint">Oregon only</Check>
      <p id="oregon-only-hint" class="controls__hint">
        <span class="controls__outside" aria-hidden="true"></span>
        A dashed outline on the graph marks people and places outside Oregon.
      </p>
      <!-- The "i" explains how records are verified -->
      <div class="controls__with-info">
        <Check v-model="state.verifiedOnly">Verified records only</Check>
        <VerifiedInfo />
      </div>
    </fieldset>

    <div class="controls__foot">
      <button v-if="compact" type="button" class="controls__reset" aria-describedby="reset-description" @click="resetGraph">
        Reset graph
      </button>
      <p class="controls__build">
        {{ build }}<template v-if="releaseNotes">
          ·
          <a :href="releaseNotes" target="_blank" rel="noopener">
            Release notes<span class="visually-hidden"> (opens in a new tab)</span>
          </a>
        </template>
      </p>
    </div>
  </aside>
</template>

<style scoped>
.controls {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
  overflow-y: auto;
  border-right: 1px solid var(--border);
  /* A little of the graph shows through, blurred, so the panel reads as floating over it */
  background: var(--frost);
  -webkit-backdrop-filter: var(--frost-blur);
  backdrop-filter: var(--frost-blur);
}

.controls__close {
  display: none;
  align-self: flex-end;
  min-height: 36px;
  padding: 0 0.75rem;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--surface);
  color: inherit;
  font: inherit;
  cursor: pointer;
}

/* Desktop, hidden: slides out to the left, then leaves the accessibility tree */
@media (min-width: 1025px) {
  .controls {
    transition:
      transform 0.22s ease,
      visibility 0s linear 0s;
  }

  .controls--collapsed {
    transform: translateX(-100%);
    visibility: hidden;
    transition:
      transform 0.22s ease,
      visibility 0s linear 0.22s;
  }
}

@media (min-width: 1025px) and (prefers-reduced-motion: reduce) {
  .controls,
  .controls--collapsed {
    transition: none;
  }
}

/* Tablet and smaller: the filters become a drawer over the graph */
@media (max-width: 1024px) {
  .controls {
    position: absolute;
    /* Above its backdrop and the graph's toolbar (see GraphCanvas for the layers) */
    z-index: 7;
    top: var(--inset-top, 0px);
    bottom: 0;
    left: 0;
    display: none;
    width: min(22rem, 85vw);
    box-shadow: 4px 0 16px rgba(0, 0, 0, 0.2);
  }

  /* A dialog here: solid enough that the toolbar behind doesn't show through */
  .controls--open {
    display: flex;
    background: color-mix(in srgb, var(--surface-raised) 94%, transparent);
  }

  .controls__close {
    display: block;
  }
}

/* Phones: the drawer takes the full width, like the details sheet */
@media (max-width: 600px) {
  .controls {
    right: 0;
    width: auto;
    border-right: 0;
    box-shadow: none;
  }
}







/* Each group stands apart as the detail panel's sections do: 26px above its heading (the
   sidebar's 14px gap and this) */
fieldset + fieldset {
  margin-top: 12px;
}

fieldset {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

legend {
  margin-bottom: 6px;
  padding: 0;
  color: var(--text-secondary);
  font-size: 0.875rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.controls__avas-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 1.75rem;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.controls__avas-chosen {
  display: inline-flex;
  align-items: center;
  color: var(--text-secondary);
}

.controls__line {
  flex: none;
  width: 18px;
  border-top: 2px solid var(--edge);
}

.controls__line--people {
  border-top-style: dashed;
}

.controls__line--geography {
  border-top-style: dotted;
}

.controls__with-info {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.controls__with-info > :first-child {
  flex: 1;
}

.controls__hint {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin: 0 0 0 1.75rem;
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.controls__outside {
  flex: none;
  width: 12px;
  height: 12px;
  margin-top: 0.2em;
  border: 1.5px dashed var(--text-primary);
  border-radius: 50%;
}

.controls__foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 0.75rem;
  margin-top: auto;
}

.controls__build {
  flex-basis: 100%;
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.75rem;
}

.controls__build a {
  color: inherit;
  text-underline-offset: 2px;
}

.controls__build a:hover {
  color: var(--text-primary);
}

.controls__view {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  margin: 0 0 1rem;
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius-sm);
  background: var(--wash);
  box-shadow: inset 3px 0 0 var(--fill);
  font-size: 0.875rem;
}

.controls__view strong {
  font-weight: 600;
}

.controls__view-clear {
  flex: none;
  padding: 0;
  border: 0;
  background: none;
  color: var(--link);
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
}

.controls__reset {
  min-height: 36px;
  padding: 0 0.75rem;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--surface);
  color: inherit;
  font: inherit;
  cursor: pointer;
}
</style>

<style>
/* The AVA picker is teleported to the page body, outside this component's scoped styles */
.ava-picker {
  z-index: 40;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: var(--reka-popover-trigger-width);
  min-width: 15rem;
  max-height: min(60vh, 28rem);
  padding: 0.75rem;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface-raised);
  box-shadow: var(--shadow);
}

.ava-picker__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--text-secondary);
  font-size: 0.875rem;
  font-weight: 600;
}

.ava-picker__clear {
  padding: 0.125rem 0.5rem;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: inherit;
  font: inherit;
  font-size: 0.8125rem;
  cursor: pointer;
}

/* Padded so the boxes' focus rings aren't clipped by the scrolling edge */
.ava-picker__list {
  margin: -3px -4px;
  padding: 3px 4px;
  overflow-y: auto;
}
</style>
