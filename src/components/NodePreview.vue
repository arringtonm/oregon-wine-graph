<script setup lang="ts">
import { HoverCardContent, HoverCardPortal, HoverCardRoot, HoverCardTrigger } from 'reka-ui'
import { computed } from 'vue'
import { nodeYears, SINGULAR_TYPE, useGraph } from '../composables/useGraph'
import type { GraphNode } from '../data/schema'
import NodeGlyph from './NodeGlyph.vue'

// A small card previewing a linked record, shown while the mouse rests on its link in the
// detail panel. Taps go straight to the record, as before. The card repeats what the record
// itself says, so it's hidden from screen readers, which reach the record through the link.
const props = defineProps<{ node: GraphNode }>()
const { degree } = useGraph()

const type = computed(() => {
  const name = SINGULAR_TYPE[props.node.type]
  return name.charAt(0).toUpperCase() + name.slice(1) + (props.node.outsideOregon ? ' · outside Oregon' : '')
})
const facts = computed(() => [nodeYears(props.node), props.node.place].filter(Boolean).join(' · '))
const connections = computed(() => {
  const count = degree.value.get(props.node.id) ?? 0
  return `${count} connection${count === 1 ? '' : 's'}`
})
</script>

<template>
  <HoverCardRoot :open-delay="400" :close-delay="120">
    <HoverCardTrigger as-child>
      <slot />
    </HoverCardTrigger>
    <HoverCardPortal>
      <HoverCardContent class="node-preview" side="left" align="start" :side-offset="10" :collision-padding="12" aria-hidden="true">
        <p class="node-preview__type"><NodeGlyph :type="node.type" />{{ type }}</p>
        <p class="node-preview__name">{{ node.name }}</p>
        <p v-if="facts" class="node-preview__facts">{{ facts }}</p>
        <p class="node-preview__summary">{{ node.summary }}</p>
        <p class="node-preview__facts">{{ connections }}</p>
      </HoverCardContent>
    </HoverCardPortal>
  </HoverCardRoot>
</template>

<style>
/* Teleported to the page body */
.node-preview {
  z-index: 45;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  width: min(16rem, calc(100vw - 2rem));
  padding: 0.65rem 0.8rem;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface-raised);
  box-shadow: var(--shadow);
  font-size: 0.8125rem;
}

.node-preview p {
  margin: 0;
}

.node-preview__type {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  color: var(--text-secondary);
}

.node-preview__name {
  font-size: 0.9375rem;
  font-weight: 700;
}

.node-preview__facts {
  color: var(--text-secondary);
}

.node-preview__summary {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  line-clamp: 3;
}
</style>
