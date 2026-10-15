<script setup lang="ts">
import { TooltipArrow, TooltipContent, TooltipPortal, TooltipRoot, TooltipTrigger } from 'reka-ui'

// A short label shown on hover or keyboard focus, for buttons that show only a symbol.
// The button keeps its own aria-label; this is the visible counterpart.
defineProps<{ label: string }>()
</script>

<template>
  <TooltipRoot>
    <TooltipTrigger as-child>
      <slot />
    </TooltipTrigger>
    <TooltipPortal>
      <TooltipContent class="tip" side="bottom" :side-offset="6">
        {{ label }}
        <TooltipArrow class="tip__arrow" :width="10" :height="5" />
      </TooltipContent>
    </TooltipPortal>
  </TooltipRoot>
</template>

<style>
.tip {
  z-index: 50;
  padding: 0.3rem 0.55rem;
  border-radius: var(--radius-sm);
  background: var(--text-primary);
  color: var(--page);
  font-size: 0.8125rem;
  font-weight: 600;
  box-shadow: var(--shadow);
}

.tip__arrow {
  fill: var(--text-primary);
}
</style>
