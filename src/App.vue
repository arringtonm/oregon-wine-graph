<script setup lang="ts">
import { onMounted } from 'vue'
import DetailPanel from './components/DetailPanel.vue'
import GraphCanvas from './components/GraphCanvas.vue'
import GraphControls from './components/GraphControls.vue'
import { useGraph } from './composables/useGraph'

const { state, init } = useGraph()

onMounted(init)
</script>

<template>
  <div class="app">
    <header class="app__header">
      <h1>Oregon Wine Graph</h1>
      <p>The people, wineries and vineyards of Oregon wine, and how they connect</p>
    </header>
    <pre v-if="state.error" class="app__error">{{ state.error }}</pre>
    <main v-else-if="state.graph" class="app__main">
      <GraphControls />
      <GraphCanvas />
      <DetailPanel />
    </main>
  </div>
</template>

<style scoped>
.app {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  height: 100dvh;
}

.app__header {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 16px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-raised);
}

.app__header h1 {
  margin: 0;
  font-size: 18px;
}

.app__header p {
  margin: 0;
  color: var(--text-secondary);
}

.app__main {
  position: relative;
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr) 320px;
  min-height: 0;
}

.app__error {
  margin: 16px;
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
