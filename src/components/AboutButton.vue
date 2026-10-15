<script setup lang="ts">
import { PopoverArrow, PopoverClose, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'

// Who made the site, from an "i" in the graph's bottom-right corner. The email address is
// never in the page as text: the link puts it together only when it's used, which keeps it
// from scrapers
const EMAIL = ['michael', 'maple.casa']

function sendEmail(event: MouseEvent) {
  event.preventDefault()
  window.location.href = `mailto:${EMAIL.join('@')}`
}
</script>

<template>
  <PopoverRoot>
    <!-- A plain CSS tooltip (style.css's data-tip), as a Reka tooltip would fight the
         popover for its trigger; above the button and extending left, clear of the sidebar -->
    <PopoverTrigger class="about-toggle" aria-label="About the site" data-tip="About the site" data-tip-side="top" data-tip-align="end">
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="7.5" />
        <path d="M10 9v4.6" />
        <circle class="about-toggle__dot" cx="10" cy="6.4" r="0.95" />
      </svg>
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent class="about" side="top" align="end" :side-offset="8" :collision-padding="12" aria-labelledby="about-heading">
        <!-- First, so opening the panel puts focus on closing it rather than on a link -->
        <PopoverClose class="about__close" aria-label="Close">
          <span aria-hidden="true">×</span>
        </PopoverClose>
        <h2 id="about-heading">About the site</h2>
        <p>
          Created by Michael Arrington, a wine drinker/collector/explorer, software developer, and
          <a href="https://djsacrilicious.com" target="_blank" rel="noopener">DJ<span class="visually-hidden"> (opens in a new tab)</span></a>
          based in Portland, Oregon, to show off the cool interconnectedness of the Oregon wine scene.
        </p>
        <ul class="about__links">
          <li>
            <a href="https://www.arrington.tech" target="_blank" rel="noopener">
              Website<span class="visually-hidden"> (opens in a new tab)</span>
            </a>
          </li>
          <li><a href="#" @click="sendEmail">Email</a></li>
        </ul>
        <PopoverArrow class="about__arrow" :width="10" :height="5" />
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<style scoped>
.about-toggle {
  display: inline-grid;
  place-items: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid var(--border-strong);
  border-radius: 50%;
  background: var(--frost);
  -webkit-backdrop-filter: var(--frost-blur);
  backdrop-filter: var(--frost-blur);
  color: var(--text-secondary);
  cursor: pointer;
  pointer-events: auto;
}

.about-toggle:hover,
.about-toggle[data-state='open'] {
  background: var(--wash);
  color: var(--text-primary);
}

.about-toggle svg {
  width: 1.25rem;
  height: 1.25rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
}

.about-toggle__dot {
  fill: currentColor;
  stroke: none;
}

@media (max-width: 1024px) {
  .about-toggle {
    width: 40px;
    height: 40px;
  }
}
</style>

<style>
/* Teleported to the page body */
.about {
  z-index: 45;
  width: min(20rem, calc(100vw - 2rem));
  max-height: var(--reka-popover-content-available-height, 80vh);
  padding: 0.85rem 1rem 1rem;
  overflow-y: auto;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface-raised);
  box-shadow: var(--shadow);
  font-size: 0.9375rem;
}

.about {
  position: relative;
}

.about h2 {
  margin: 0 2rem 0.4rem 0;
  font-size: 1rem;
}

/* Top right, clear of the heading */
.about__close {
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

.about__close:hover {
  background: var(--wash);
  color: var(--text-primary);
}

.about p {
  margin: 0;
}

.about a {
  color: var(--link);
}

.about__links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1rem;
  margin: 0.7rem 0 0;
  padding: 0;
  list-style: none;
}

.about__arrow {
  fill: var(--surface-raised);
}
</style>
