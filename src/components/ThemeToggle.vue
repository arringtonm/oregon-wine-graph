<script setup lang="ts">
import { computed } from 'vue'
import { isDark, toggleTheme } from '../services/theme'
import Tip from './Tip.vue'

// The header's light/dark switch: a glass of Chardonnay in light mode, of red in dark. It
// shows the current theme and is named for the change it makes
const label = computed(() => (isDark.value ? 'Switch to light mode' : 'Switch to dark mode'))
</script>

<template>
  <Tip :label="label">
    <button type="button" class="theme-toggle" :class="{ 'theme-toggle--red': isDark }" :aria-label="label" @click="toggleTheme">
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <!-- The wine, then the glass over it -->
        <path class="theme-toggle__wine" d="M5.6 7.2h8.8c0 2.7-1.9 4.6-4.4 4.6S5.6 9.9 5.6 7.2z" />
        <path class="theme-toggle__glass" d="M5.5 2.5h9c.6 4.4-.4 9.3-4.5 9.3s-5.1-4.9-4.5-9.3zM10 11.8v4.9M6.8 17.5h6.4" />
      </svg>
    </button>
  </Tip>
</template>

<style scoped>
.theme-toggle {
  display: inline-grid;
  place-items: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid var(--border-strong);
  border-radius: 50%;
  background: none;
  color: var(--text-secondary);
  cursor: pointer;
}

.theme-toggle:hover {
  background: var(--wash);
  color: var(--text-primary);
}

.theme-toggle svg {
  width: 1.3rem;
  height: 1.3rem;
}

/* Chardonnay gold in light mode; claret in dark */
.theme-toggle__wine {
  fill: #e2b53e;
}

.theme-toggle--red .theme-toggle__wine {
  fill: #b8344f;
}

.theme-toggle__glass {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
