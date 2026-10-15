<script setup lang="ts">
import { CheckboxIndicator, CheckboxRoot } from 'reka-ui'

// A checkbox in the palette: the box, its label, and an optional icon or sample pushed to
// the far side so it doesn't crowd the box. The whole row toggles it.
const checked = defineModel<boolean>({ required: true })
defineProps<{ describedby?: string }>()
</script>

<template>
  <label class="check">
    <CheckboxRoot v-model="checked" class="check__box" :aria-describedby="describedby">
      <CheckboxIndicator class="check__tick">
        <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.6 6.3 5 8.6l4.4-5" /></svg>
      </CheckboxIndicator>
    </CheckboxRoot>
    <span class="check__label"><slot /></span>
    <span v-if="$slots.icon" class="check__icon"><slot name="icon" /></span>
  </label>
</template>

<style scoped>
.check {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  min-height: 1.75rem;
  cursor: pointer;
}

.check__label {
  flex: 1;
  min-width: 0;
}

.check__icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: flex-end;
  min-width: 1.25rem;
}

.check__box {
  display: inline-grid;
  flex: none;
  place-items: center;
  width: 1.125rem;
  height: 1.125rem;
  /* The row, not the box, is the target, so the box is exempt from the 24px minimum */
  min-height: 0;
  padding: 0;
  border: 1.5px solid var(--border-strong);
  border-radius: 5px;
  background: var(--surface);
  cursor: pointer;
  transition:
    background-color 0.12s ease,
    border-color 0.12s ease;
}

.check:hover .check__box {
  border-color: var(--accent);
}

.check__box[data-state='checked'] {
  border-color: var(--fill);
  background: var(--fill);
}

.check__tick {
  display: grid;
  place-items: center;
}

.check__tick svg {
  width: 0.75rem;
  height: 0.75rem;
  fill: none;
  stroke: var(--on-fill);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

@media (prefers-reduced-motion: reduce) {
  .check__box {
    transition: none;
  }
}
</style>
