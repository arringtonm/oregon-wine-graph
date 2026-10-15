import { computed, ref } from 'vue'

// Light or dark. The site follows the system setting until the reader picks one with the
// header's glass, which this browser then remembers. The choice is marked on the page as
// <html data-theme="light|dark">, which style.css reads; index.html applies a saved choice
// before the first paint, so there's no flash of the other theme.

export type Theme = 'light' | 'dark'

const KEY = 'oregon-wine-graph:theme'
const systemQuery = window.matchMedia?.('(prefers-color-scheme: dark)')

function storedTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(KEY)
    return stored === 'light' || stored === 'dark' ? stored : null
  } catch {
    return null
  }
}

const chosen = ref<Theme | null>(storedTheme())
const systemDark = ref(systemQuery?.matches ?? false)
systemQuery?.addEventListener('change', () => (systemDark.value = systemQuery.matches))

export const isDark = computed(() => (chosen.value ?? (systemDark.value ? 'dark' : 'light')) === 'dark')

function mark(theme: Theme | null) {
  if (theme) document.documentElement.dataset.theme = theme
  else delete document.documentElement.dataset.theme
}

export function toggleTheme() {
  setTheme(isDark.value ? 'light' : 'dark')
}

// The reader's choice, remembered in this browser
export function setTheme(next: Theme) {
  chosen.value = next
  mark(next)
  try {
    localStorage.setItem(KEY, next)
  } catch {
    // Kept for this visit only where storage is unavailable
  }
}

// On load, in case index.html's early script didn't run
mark(chosen.value)
