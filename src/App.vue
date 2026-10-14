<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import DetailPanel from './components/DetailPanel.vue'
import GraphCanvas from './components/GraphCanvas.vue'
import GraphControls from './components/GraphControls.vue'
import { useGraph } from './composables/useGraph'

const { state, init } = useGraph()

// Matches the breakpoint where the filters become a drawer over the graph
const compactQuery = window.matchMedia('(max-width: 1024px)')
const compact = ref(compactQuery.matches)
const onCompactChange = () => (compact.value = compactQuery.matches)

// While the drawer is open on a small screen it behaves as a dialog: the rest is inert
const drawerModal = computed(() => compact.value && state.filtersOpen)

async function skipToSearch() {
  if (compact.value) state.filtersOpen = true
  await nextTick()
  document.getElementById('search')?.focus()
}

function skipToDetails() {
  document.getElementById('details')?.focus()
}

onMounted(() => {
  compactQuery.addEventListener('change', onCompactChange)
  init()
})
onBeforeUnmount(() => compactQuery.removeEventListener('change', onCompactChange))
</script>

<template>
  <div class="app">
    <nav class="app__skip" aria-label="Skip links">
      <a href="#search" @click.prevent="skipToSearch">Skip to search</a>
      <a href="#details" @click.prevent="skipToDetails">Skip to details</a>
    </nav>
    <header class="app__header">
      <h1>Oregon Wine Graph</h1>
      <p>The people, wineries and vineyards of Oregon wine, and how they connect</p>
    </header>
    <pre v-if="state.error" class="app__error" role="alert">{{ state.error }}</pre>
    <main v-else-if="state.graph" class="app__main">
      <GraphControls />
      <GraphCanvas :inert="drawerModal" />
      <DetailPanel :inert="drawerModal" />
    </main>
    <div class="visually-hidden" aria-live="polite" aria-atomic="true">{{ state.announcement }}</div>
  </div>
</template>

<style scoped>
.app {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  height: 100dvh;
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

.app__header {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.25rem 1rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border);
  background: var(--surface-raised);
}

.app__header h1 {
  margin: 0;
  font-size: 1.125rem;
}

.app__header p {
  margin: 0;
  color: var(--text-secondary);
}

.app__main {
  position: relative;
  display: grid;
  grid-template-columns: 17rem minmax(0, 1fr) 23rem;
  min-height: 0;
}

.app__error {
  margin: 1rem;
  white-space: pre-wrap;
}

@media (max-width: 1024px) {
  .app__main {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 600px) {
  .app__header p {
    display: none;
  }
}
</style>
