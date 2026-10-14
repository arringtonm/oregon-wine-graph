<script setup lang="ts">
import type { NodeType } from '../data/schema'
import { ICONS } from '../graph/icons'

defineProps<{ type: NodeType }>()
</script>

<template>
  <!-- The same silhouettes the graph draws; the markup is the project's own constant -->
  <!-- eslint-disable-next-line vue/no-v-html -->
  <svg class="node-glyph" :class="`node-glyph--${type}`" viewBox="0 0 24 24" aria-hidden="true" v-html="ICONS[type]" />
</template>

<style scoped>
.node-glyph {
  flex: none;
  width: 16px;
  height: 16px;
  fill: var(--node-neutral);
  color: var(--node-neutral);
}

.node-glyph--person {
  fill: var(--node-person);
  color: var(--node-person);
}

.node-glyph--winery {
  fill: var(--node-winery);
  color: var(--node-winery);
}

.node-glyph--vineyard {
  fill: var(--node-vineyard);
  color: var(--node-vineyard);
}
</style>
