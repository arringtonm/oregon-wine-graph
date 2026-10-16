<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

// Behind a big panel on a phone or tablet: the page dimmed but for the button that opened
// it, which stays lit and ringed, so it's clear what's open and that tapping anywhere else
// closes it (as the tour's spotlight does). The panel sits above it
const props = defineProps<{ trigger?: HTMLElement | null }>()
const emit = defineEmits<{ close: [] }>()

const hole = ref<{ x: number; y: number; width: number; height: number } | null>(null)
let frame = 0
function follow() {
  const rect = props.trigger?.getBoundingClientRect()
  hole.value = rect && rect.width > 0 ? { x: rect.left - 4, y: rect.top - 4, width: rect.width + 8, height: rect.height + 8 } : null
  frame = requestAnimationFrame(follow)
}
onMounted(() => (frame = requestAnimationFrame(follow)))
onBeforeUnmount(() => cancelAnimationFrame(frame))
</script>

<template>
  <Teleport to="body">
    <svg class="panel-backdrop" aria-hidden="true" @click="emit('close')">
      <mask id="panel-backdrop-hole">
        <rect width="100%" height="100%" fill="white" />
        <rect v-if="hole" :x="hole.x" :y="hole.y" :width="hole.width" :height="hole.height" rx="10" fill="black" />
      </mask>
      <rect class="panel-backdrop__dim" width="100%" height="100%" mask="url(#panel-backdrop-hole)" />
      <rect
        v-if="hole"
        class="panel-backdrop__ring"
        :x="hole.x"
        :y="hole.y"
        :width="hole.width"
        :height="hole.height"
        rx="10"
      />
    </svg>
  </Teleport>
</template>

<style>
/* Under the panels (z-index 40 and up), over the page */
.panel-backdrop {
  position: fixed;
  z-index: 38;
  inset: 0;
  width: 100%;
  height: 100%;
}

.panel-backdrop__dim {
  fill: var(--tour-dim);
}

.panel-backdrop__ring {
  fill: none;
  stroke: var(--accent);
  stroke-width: 2;
  pointer-events: none;
}
</style>
