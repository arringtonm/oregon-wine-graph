<script setup lang="ts">
import { PopoverArrow, PopoverClose, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'

// An "i" beside a year the sources disagree on ("Founded 1965 or 1966"): says that every year
// a source gives is shown rather than one chosen, and links to the rule in the README.
// The popover shares the look of the verification note (VerifiedInfo's .methodology).
defineProps<{
  // The disputed facts as they read on the card, e.g. "Founded 1965 or 1966"
  facts: string[]
}>()

const RULE = 'https://github.com/arringtonm/oregon-wine-graph#rules-we-follow'
</script>

<template>
  <PopoverRoot>
    <PopoverTrigger class="disputed-years" aria-label="Why more than one year">
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="7.5" />
        <path d="M10 9v4.6" />
        <circle class="disputed-years__dot" cx="10" cy="6.4" r="0.95" />
      </svg>
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent class="methodology" side="top" :side-offset="6" :collision-padding="12" aria-labelledby="disputed-heading">
        <PopoverClose class="methodology__close" aria-label="Close">
          <span aria-hidden="true">×</span>
        </PopoverClose>
        <h2 id="disputed-heading">Sources disagree</h2>
        <p>
          The sources give different years for {{ facts.length === 1 ? 'this' : 'these' }}:
          <strong>{{ facts.join('; ') }}</strong>. Rather than choose one, we show every year a source gives.
        </p>
        <p>
          <a :href="RULE" target="_blank" rel="noopener">
            How we handle disagreements<span class="visually-hidden"> (opens in a new tab)</span>
          </a>
        </p>
        <PopoverArrow class="methodology__arrow" :width="10" :height="5" />
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<style scoped>
/* Sits in a line of text, so it is sized to the text and nudged onto its baseline */
.disputed-years {
  display: inline-grid;
  place-items: center;
  width: 1.4em;
  height: 1.4em;
  margin: 0 0 0 0.15em;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: none;
  color: var(--text-secondary);
  vertical-align: -0.3em;
  cursor: pointer;
}

/* On touch screens the tap area grows to 44px without moving the text around it */
@media (pointer: coarse) {
  .disputed-years {
    position: relative;
  }

  .disputed-years::after {
    position: absolute;
    inset: 50% auto auto 50%;
    width: 44px;
    height: 44px;
    transform: translate(-50%, -50%);
    content: '';
  }
}

.disputed-years:hover,
.disputed-years[data-state='open'] {
  background: var(--wash);
  color: var(--text-primary);
}

.disputed-years svg {
  width: 1em;
  height: 1em;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
}

.disputed-years__dot {
  fill: currentColor;
  stroke: none;
}
</style>
