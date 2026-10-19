<script setup lang="ts">
import { PopoverArrow, PopoverClose, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { computed } from 'vue'
import { useGraph } from '../composables/useGraph'

// An "i" beside "Verified records only": how a record comes to be verified, with today's
// counts read from the data (the README's "Verification" section says the same at length)
const { state } = useGraph()

const counts = computed(() => {
  const records = state.graph ? [...state.graph.nodes, ...state.graph.edges] : []
  const verified = records.filter((record) => record.verified)
  return {
    checked: verified.filter((record) => record.verifiedBy === 'jev').length,
    person: verified.filter((record) => record.verifiedBy !== 'jev' && record.verifiedBy !== 'boundary').length,
    drafts: records.length - verified.length,
  }
})
const number = (count: number) => count.toLocaleString('en-US')

const README = 'https://github.com/arringtonm/oregon-wine-graph#how-we-know-the-evidence-behind-each-record'
</script>

<template>
  <PopoverRoot>
    <PopoverTrigger class="verified-info" aria-label="How records are verified">
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="7.5" />
        <path d="M10 9v4.6" />
        <circle class="verified-info__dot" cx="10" cy="6.4" r="0.95" />
      </svg>
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent
        class="methodology"
        side="right"
        align="start"
        :side-offset="10"
        :collision-padding="12"
        aria-labelledby="methodology-heading"
      >
        <!-- First, so opening the panel puts focus on closing it rather than on a link -->
        <PopoverClose class="methodology__close" aria-label="Close">
          <span aria-hidden="true">×</span>
        </PopoverClose>
        <h2 id="methodology-heading">How records are verified</h2>
        <p>
          Every person, place and connection cites at least one source. Records not yet checked against
          their sources are shown as drafts; this filter hides them.
        </p>
        <p>A record is verified in one of two ways:</p>
        <ul>
          <li><strong>Reviewed by a person</strong>, who has read its sources and confirmed it.</li>
          <li>
            <strong>Checked automatically.</strong> A model reads each cited page and judges whether it supports
            the connection, each year and the role, approving only when everything is supported with at least 90%
            confidence. When we planted a wrong fact in 400 verified records, 1.0% still passed.
            Unreadable pages never count for or against a record. For federal label approvals it also reads the
            label images, an early-stage method noted on each record it verifies.
          </li>
        </ul>
        <p class="methodology__counts">
          Today {{ number(counts.checked) }} records are verified by the automated check and
          {{ number(counts.person) }} by a person; {{ number(counts.drafts) }} are drafts.
        </p>
        <p>
          <a :href="README" target="_blank" rel="noopener">
            More on our sources and rules<span class="visually-hidden"> (opens in a new tab)</span>
          </a>
        </p>
        <PopoverArrow class="methodology__arrow" :width="10" :height="5" />
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<style scoped>
.verified-info {
  display: inline-grid;
  flex: none;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: none;
  color: var(--text-secondary);
  cursor: pointer;
}

/* On touch screens the tap area grows to 44px (WCAG's enhanced size) without moving
   anything: the negative margin gives back the extra space */
@media (pointer: coarse) {
  .verified-info {
    width: 44px;
    height: 44px;
    margin: -10px;
  }
}

.verified-info:hover,
.verified-info[data-state='open'] {
  background: var(--wash);
  color: var(--text-primary);
}

.verified-info svg {
  width: 1.1rem;
  height: 1.1rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
}

.verified-info__dot {
  fill: currentColor;
  stroke: none;
}
</style>

<style>
/* Teleported to the page body */
.methodology {
  position: relative;
  z-index: 45;
  width: min(22rem, calc(100vw - 2rem));
  max-height: min(var(--reka-popover-content-available-height, 80vh), 34rem);
  padding: 0.85rem 1rem 1rem;
  overflow-y: auto;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface-raised);
  box-shadow: var(--shadow);
  font-size: 0.875rem;
}

.methodology h2 {
  margin: 0 2rem 0.5rem 0;
  font-size: 1rem;
}

.methodology p {
  margin: 0 0 0.5rem;
}

.methodology ul {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin: 0 0 0.6rem;
  padding-left: 1.1rem;
}

.methodology strong {
  font-weight: 600;
}

.methodology__counts {
  color: var(--text-secondary);
}

.methodology a {
  color: var(--link);
}

.methodology__close {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--text-secondary);
  font: inherit;
  font-size: 1.3rem;
  line-height: 1;
  cursor: pointer;
}

.methodology__close:hover {
  background: var(--wash);
  color: var(--text-primary);
}

.methodology__arrow {
  fill: var(--surface-raised);
}
</style>
