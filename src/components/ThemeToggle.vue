<script setup lang="ts">
import { isDark, setTheme, type Theme } from '../services/theme'
import Tip from './Tip.vue'

// The header's light/dark switch: two glasses side by side, Chardonnay for light and red for
// dark, with a slider behind the theme showing, so it reads as a choice between two. Until
// the reader picks, it shows the theme their system is giving them
const choices: { theme: Theme; label: string; wine: string }[] = [
  { theme: 'light', label: 'Light mode', wine: '#e2b53e' },
  { theme: 'dark', label: 'Dark mode', wine: '#b8344f' },
]
</script>

<template>
  <div class="theme-switch" :data-theme-on="isDark ? 'dark' : 'light'" role="group" aria-label="Theme">
    <Tip v-for="choice in choices" :key="choice.theme" :label="choice.label">
      <button
        type="button"
        class="theme-switch__option"
        :aria-label="choice.label"
        :aria-pressed="isDark === (choice.theme === 'dark')"
        @click="setTheme(choice.theme)"
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <!-- The wine, then the glass over it -->
          <path :fill="choice.wine" d="M5.6 7.2h8.8c0 2.7-1.9 4.6-4.4 4.6S5.6 9.9 5.6 7.2z" />
          <path class="theme-switch__glass" d="M5.5 2.5h9c.6 4.4-.4 9.3-4.5 9.3s-5.1-4.9-4.5-9.3zM10 11.8v4.9M6.8 17.5h6.4" />
        </svg>
      </button>
    </Tip>
  </div>
</template>

<style scoped>
.theme-switch {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1fr;
  padding: 3px;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: var(--wash);
}

/* The slider: a raised surface behind the theme showing. Neutral rather than burgundy,
   so the red glass stays readable on it */
.theme-switch::before {
  content: '';
  position: absolute;
  top: 3px;
  bottom: 3px;
  left: 3px;
  width: calc(50% - 3px);
  border-radius: 999px;
  background: var(--surface-raised);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
  transition: transform 0.2s ease;
}

.theme-switch[data-theme-on='dark']::before {
  transform: translateX(100%);
}

.theme-switch__option {
  position: relative;
  display: inline-grid;
  place-items: center;
  width: 34px;
  height: 28px;
  min-height: 0;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: none;
  color: var(--text-secondary);
  cursor: pointer;
  opacity: 0.55;
  transition: opacity 0.2s ease;
}

.theme-switch__option[aria-pressed='true'],
.theme-switch__option:hover {
  color: var(--text-primary);
  opacity: 1;
}

.theme-switch__option svg {
  width: 1.2rem;
  height: 1.2rem;
}

.theme-switch__glass {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* The narrowest phones (320px, WCAG reflow): a little narrower, so the header fits */
@media (max-width: 340px) {
  .theme-switch__option {
    width: 28px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .theme-switch::before,
  .theme-switch__option {
    transition: none;
  }
}
</style>
