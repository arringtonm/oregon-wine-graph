<script setup lang="ts">
import { HoverCardContent, HoverCardPortal, HoverCardRoot, HoverCardTrigger } from 'reka-ui'
import { computed } from 'vue'
import { nodeYears, useGraph } from '../composables/useGraph'
import type { GraphNode } from '../data/schema'
import NodeGlyph from './NodeGlyph.vue'

// A small card previewing a linked record, shown while the mouse rests on its link in the
// detail panel. Taps go straight to the record, as before. The card repeats what the record
// itself says, so it's hidden from screen readers, which reach the record through the link.
const props = defineProps<{ node: GraphNode }>()
const { degree } = useGraph()

const facts = computed(() =>
  [nodeYears(props.node), props.node.place, props.node.outsideOregon && 'outside Oregon'].filter(Boolean).join(' · '),
)
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
        <p class="node-preview__name"><NodeGlyph :type="node.type" />{{ node.name }}</p>
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

/* The icon stays on the name's first line if a long name wraps */
.node-preview__name {
  display: flex;
  align-items: flex-start;
  gap: 0.4rem;
  font-size: 0.9375rem;
  font-weight: 700;
}

/* 14px, centred on the name's first line (1.45em tall), a hair high to sit with the capitals */
.node-preview .node-preview__name .node-glyph {
  width: 14px;
  height: 14px;
  margin-top: calc((1.45em - 14px) / 2 - 0.5px);
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
