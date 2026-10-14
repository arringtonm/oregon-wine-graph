<script setup lang="ts">
import type { NodeType } from '../data/schema'

defineProps<{ type: NodeType }>()
</script>

<template>
  <svg class="node-glyph" :class="`node-glyph--${type}`" viewBox="0 0 16 16" aria-hidden="true">
    <circle v-if="type === 'person'" cx="8" cy="8" r="6.5" />
    <rect v-else-if="type === 'winery'" x="2" y="2" width="12" height="12" rx="3" />
    <polygon v-else-if="type === 'vineyard'" points="8,1 15,8 8,15 1,8" />
    <polygon v-else-if="type === 'ava'" points="4.5,2 11.5,2 15,8 11.5,14 4.5,14 1,8" />
    <polygon v-else-if="type === 'organization'" points="8,2 15,14 1,14" stroke-linejoin="round" />
    <polygon
      v-else
      points="8,1 9.9,5.6 14.8,5.9 11,9.1 12.2,13.9 8,11.3 3.8,13.9 5,9.1 1.2,5.9 6.1,5.6"
    />
  </svg>
</template>

<style scoped>
.node-glyph {
  flex: none;
  width: 14px;
  height: 14px;
  fill: var(--node-neutral);
}

.node-glyph--person {
  fill: var(--node-person);
}

.node-glyph--winery {
  fill: var(--node-winery);
}

.node-glyph--vineyard {
  fill: var(--node-vineyard);
}
</style>
