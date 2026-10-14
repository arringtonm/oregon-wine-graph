<!-- Open/closed indicator for disclosure buttons. It turns with the button's own
     aria-expanded, so what is seen can't drift from what assistive tech hears. -->
<template>
  <svg class="chevron" viewBox="0 0 12 12" aria-hidden="true">
    <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
</template>

<style>
.chevron {
  flex: none;
  width: 0.75rem;
  height: 0.75rem;
  margin-left: 0.375rem;
  vertical-align: -0.0625rem;
  transition: transform 0.15s ease;
}

[aria-expanded='true'] > .chevron {
  transform: rotate(180deg);
}

@media (prefers-reduced-motion: reduce) {
  .chevron {
    transition: none;
  }
}
</style>
