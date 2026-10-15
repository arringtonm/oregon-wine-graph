<script setup lang="ts">
import { ToggleGroupItem, ToggleGroupRoot } from 'reka-ui'
import { rememberAdminMode, useGraph } from '../composables/useGraph'

// Dev server only: admin shows the review tools; viewer previews the published site
const { state, announce } = useGraph()

function setMode(mode: unknown) {
  if (mode !== 'admin' && mode !== 'viewer') return
  state.adminMode = mode === 'admin'
  rememberAdminMode(state.adminMode)
  announce(state.adminMode ? 'Admin mode: review tools shown' : 'Viewer mode: review tools hidden')
}
</script>

<template>
  <div class="mode">
    <span id="mode-label" class="mode__label">Viewing as</span>
    <ToggleGroupRoot
      type="single"
      class="mode__switch"
      aria-labelledby="mode-label"
      :data-mode="state.adminMode ? 'admin' : 'viewer'"
      :model-value="state.adminMode ? 'admin' : 'viewer'"
      @update:model-value="setMode"
    >
      <ToggleGroupItem value="admin">Admin</ToggleGroupItem>
      <ToggleGroupItem value="viewer">Viewer</ToggleGroupItem>
    </ToggleGroupRoot>
  </div>
</template>

<style scoped>
.mode {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 0.5rem;
  margin-left: auto;
}

.mode__label {
  color: var(--text-secondary);
  font-size: 0.8125rem;
}

/* The same switch as Graph | List: a track with a burgundy thumb sliding behind the choice */
.mode__switch {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1fr;
  padding: 3px;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: var(--frost);
}

.mode__switch::before {
  content: '';
  position: absolute;
  top: 3px;
  bottom: 3px;
  left: 3px;
  width: calc(50% - 3px);
  border-radius: 999px;
  background: var(--fill);
  transition: transform 0.2s ease;
}

.mode__switch[data-mode='viewer']::before {
  transform: translateX(100%);
}

.mode__switch button {
  position: relative;
  min-width: 4.25rem;
  height: 26px;
  padding: 0 0.75rem;
  border: 0;
  border-radius: 999px;
  background: none;
  color: var(--text-secondary);
  font: inherit;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: color 0.2s ease;
}

.mode__switch button[data-state='on'] {
  color: var(--on-fill);
}

.mode__switch button:focus-visible {
  z-index: 1;
}

@media (prefers-reduced-motion: reduce) {
  .mode__switch::before,
  .mode__switch button {
    transition: none;
  }
}

@media (max-width: 600px) {
  .mode__label {
    display: none;
  }
}
</style>
