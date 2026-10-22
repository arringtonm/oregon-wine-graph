<script setup lang="ts">
import { TooltipProvider } from 'reka-ui'
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue'
import DetailPanel from './components/DetailPanel.vue'
import GraphCanvas from './components/GraphCanvas.vue'
import GraphControls from './components/GraphControls.vue'
import SiteMark from './components/SiteMark.vue'
import ThemeToggle from './components/ThemeToggle.vue'
import { useGraph } from './composables/useGraph'

const { state, init, select } = useGraph()

// The admin/viewer switch exists only on the dev server; the published site is viewer only
const ModeSwitch = import.meta.env.DEV ? defineAsyncComponent(() => import('./components/ModeSwitch.vue')) : null

// Matches the breakpoint where the filters become a drawer over the graph
const compactQuery = window.matchMedia('(max-width: 1024px)')
const compact = ref(compactQuery.matches)
const onCompactChange = () => (compact.value = compactQuery.matches)

// While the drawer is open on a small screen it behaves as a dialog: the rest is inert
const drawerModal = computed(() => compact.value && state.filtersOpen)

// Search lives in the graph toolbar, visible in every layout
function skipToSearch() {
  document.getElementById('search')?.focus()
}

function skipToDetails() {
  document.getElementById('details')?.focus()
}

// Escape closes the selected node, unless something nearer the focus uses Escape itself:
// a text field (it clears the search), the filter drawer as a dialog, or an open menu
function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.defaultPrevented || !state.selectedId) return
  const target = event.target as HTMLElement | null
  if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
  // An open menu, popover or dialog closes first; Reka marks each such layer
  if (document.querySelector('[data-dismissable-layer]')) return
  if (drawerModal.value) return
  // Focus that was in the panel moves on with it (DetailPanel)
  select(null)
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  compactQuery.addEventListener('change', onCompactChange)
  // The width may have changed since setup read it, before this listened
  onCompactChange()
  init()
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  compactQuery.removeEventListener('change', onCompactChange)
})
</script>

<template>
  <TooltipProvider :delay-duration="400">
    <div class="app">
      <nav class="app__skip" aria-label="Skip links">
        <a href="#search" @click.prevent="skipToSearch">Skip to search</a>
        <a href="#details" @click.prevent="skipToDetails">Skip to details</a>
      </nav>
      <header class="app__header">
        <h1>
          <SiteMark />
          Oregon Wine Graph
          <!-- Still taking shape: records are being added and checked -->
          <span class="app__beta">Beta</span>
        </h1>
        <p>The people, wineries and vineyards of Oregon wine, and how they connect</p>
        <div class="app__header-end">
          <ModeSwitch v-if="ModeSwitch" />
          <ThemeToggle />
        </div>
      </header>
      <pre v-if="state.error" class="app__error" role="alert">{{ state.error }}</pre>
      <main
        v-else-if="state.graph"
        class="app__main"
        :class="{ 'app__main--collapsed': state.filtersCollapsed, 'app__main--details-hidden': state.detailsHidden }"
      >
        <GraphControls />
        <!-- Dims the graph beside the open drawer; a tap on it closes the drawer -->
        <div v-if="drawerModal" class="app__scrim" aria-hidden="true" @click="state.filtersOpen = false"></div>
        <GraphCanvas :inert="drawerModal" />
        <!-- Also inert while hidden on desktop, out of the tab order (its toolbar button) -->
        <DetailPanel :inert="drawerModal || (!compact && state.detailsHidden)" />
      </main>
      <div class="visually-hidden" aria-live="polite" aria-atomic="true">{{ state.announcement }}</div>
    </div>
  </TooltipProvider>
</template>

<style scoped>
.app {
  position: relative;
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  /* The screen with the browser's bars showing (svh), not the full screen (dvh): Safari on
     iOS 26 floats its address bar over the page, and dvh counted the space behind it, so the
     foot of the panel scrolled under the bar. The page never scrolls, so the bars never
     hide and svh is always the room there is. vh for browsers without svh */
  height: 100vh;
  height: 100svh;
}

/* Out of the grid, so the header and graph keep its two rows */
.app__skip {
  position: absolute;
}

.app__skip a {
  position: absolute;
  z-index: 10;
  top: 0.5rem;
  left: 0.5rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--surface-raised);
  color: var(--text-primary);
  font-weight: 600;
  white-space: nowrap;
  transform: translateY(-200%);
}

.app__skip a:focus {
  transform: none;
}

/* The header floats over the top of the graph, frosted like the sidebars, on one line */
.app__header {
  position: absolute;
  z-index: 5;
  top: 0;
  right: 0;
  left: 0;
  display: flex;
  align-items: center;
  gap: 1rem;
  height: var(--header-h);
  padding: 0 1rem;
  overflow: hidden;
  border-bottom: 1px solid var(--border);
  background: var(--frost);
  -webkit-backdrop-filter: var(--frost-blur);
  backdrop-filter: var(--frost-blur);
  white-space: nowrap;
}

/* Right of the header: the theme glass, after the dev server's admin/viewer switch */
.app__header-end {
  display: flex;
  flex: none;
  align-items: center;
  gap: 0.75rem;
  margin-left: auto;
}

.app__header h1 {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  margin: 0;
  /* Fraunces: a soft serif whose rounded forms pair with Nunito's (main.ts loads it) */
  font-family: 'Fraunces Variable', Georgia, serif;
  font-size: 1.3125rem;
  font-weight: 650;
  font-optical-sizing: auto;
  letter-spacing: -0.005em;
}

/* "Beta" after the title: a small pill in the interface's sans, not the title's serif */
.app__beta {
  padding: 0.1rem 0.45rem;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  color: var(--text-secondary);
  font-family: 'Nunito Variable', system-ui, sans-serif;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  line-height: 1.4;
  text-transform: uppercase;
}

.app__header p {
  /* Fraunces sits lower in its line than Nunito, so with both centred the tagline would
     ride about 2px above the title's baseline; this lowers it to share it */
  position: relative;
  top: 0.15em;
  overflow: hidden;
  margin: 0;
  color: var(--text-secondary);
  text-overflow: ellipsis;
}

.app__error {
  margin-top: calc(var(--header-h) + 1rem);
}

.app__main {
  --inset-top: var(--header-h);
  --sidebar-width: 17rem;
  --inset-left: var(--sidebar-width);
  --details-width: 23rem;
  --inset-right: var(--details-width);
  position: relative;
  display: grid;
  grid-template-columns: var(--sidebar-width) minmax(0, 1fr) var(--details-width);
  min-height: 0;
}

/* Wide screens: the graph runs under both sidebars, which float over it, translucent */
@media (min-width: 1025px) {
  .app__main > * {
    grid-row: 1;
  }

  .app__main > .graph-canvas {
    grid-column: 1 / -1;
  }

  .app__main > .controls,
  .app__main > .detail {
    z-index: 2;
    /* Below the header, which floats over the graph's top edge */
    margin-top: var(--inset-top);
  }

  .app__main > .controls {
    grid-column: 1;
  }

  /* With the sidebar hidden, the toolbar and the visible area reach the left edge */
  .app__main--collapsed {
    --inset-left: 0px;
  }

  /* And with the details panel hidden, the right edge */
  .app__main--details-hidden {
    --inset-right: 0px;
  }

  .app__main > .detail {
    grid-column: 3;
  }
}

.app__error {
  margin: 1rem;
  white-space: pre-wrap;
}

@media (max-width: 1024px) {
  .app__main {
    /* The sidebars are a drawer and a sheet here, already over the graph */
    --inset-left: 0px;
    --inset-right: 0px;
    grid-template-columns: minmax(0, 1fr);
  }
}

.app__scrim {
  position: absolute;
  z-index: 6;
  inset: var(--inset-top) 0 0;
  background: rgba(10, 4, 6, 0.4);
}

@media (max-width: 600px) {
  .app__header p {
    display: none;
  }
}

/* Narrow phones: the title, Beta and the theme glasses overflowed 360px by 8px, cutting off
   the dark glass, and 320px (WCAG reflow) by 48px. Tighter spacing and a slightly smaller
   title keep everything on one line */
@media (max-width: 400px) {
  .app__header {
    gap: 0.5rem;
    padding: 0 0.75rem;
  }

  .app__header h1 {
    gap: 0.4rem;
    font-size: 1.125rem;
  }
}
</style>
