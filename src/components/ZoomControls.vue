<script setup lang="ts">
import Tip from './Tip.vue'

// Zoom in, zoom out and Fit, joined as one group in the toolbar
defineEmits<{ zoom: [factor: number]; fit: [] }>()
</script>

<template>
  <div class="zoom" role="group" aria-label="Zoom">
    <Tip label="Zoom in">
      <button type="button" aria-label="Zoom in" @click="$emit('zoom', 1.3)"><span aria-hidden="true">+</span></button>
    </Tip>
    <Tip label="Zoom out">
      <button type="button" class="zoom__out" aria-label="Zoom out" @click="$emit('zoom', 1 / 1.3)"><span aria-hidden="true">−</span></button>
    </Tip>
    <button type="button" class="zoom__fit" aria-describedby="fit-description" @click="$emit('fit')">Fit</button>
    <span id="fit-description" class="visually-hidden">Fit the whole graph in view</span>
  </div>
</template>

<style scoped>
.zoom {
  display: flex;
}

/* Buttons share borders; the focused one rises above its neighbours so its whole ring shows */
.zoom :deep(button) {
  min-width: 36px;
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  background: var(--frost);
  -webkit-backdrop-filter: var(--frost-blur);
  backdrop-filter: var(--frost-blur);
  color: inherit;
  font: inherit;
  cursor: pointer;
  pointer-events: auto;
}

.zoom :deep(button:hover) {
  background: var(--wash);
}

.zoom :deep(button:focus-visible) {
  position: relative;
  z-index: 1;
}

.zoom :deep(button + button) {
  border-left: 0;
}

.zoom :deep(button:first-of-type) {
  border-radius: var(--radius) 0 0 var(--radius);
}

.zoom :deep(button:last-of-type) {
  border-radius: 0 var(--radius) var(--radius) 0;
}

/* Smaller screens: inside the toolbar's frosted bar, so not frosted again */
@media (max-width: 1024px) {
  .zoom :deep(button) {
    min-width: 40px;
    height: 40px;
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }
}

/* Narrow phones: Fit, a nice-to-have, gives way so the toolbar's second row fits (pinching
   zooms too); zoom out becomes the group's last button */
@media (max-width: 429px) {
  .zoom__fit {
    display: none;
  }

  .zoom__out {
    border-radius: 0 var(--radius) var(--radius) 0;
  }
}
</style>
