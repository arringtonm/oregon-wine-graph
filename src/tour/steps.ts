import type { Hint } from '../composables/useGraph'

// The tour: an optional walk through the site, a step at a time, launched from the start
// panel or the Controls guide (never on its own, per Nielsen Norman Group: help readers
// pull up when they want it works better than a tutorial pushed at them). Each step names
// one control, rings it (state.hint) and offers to try it. Data only: TourCard.vue shows
// it and runs the actions.

// What a step's "Try it" does; TourCard.vue maps each to the app
export type TourAction = 'open-node' | 'open-record' | 'search' | 'guides' | 'filters' | 'fit' | 'random'

export interface TourStep {
  title: string
  // A key in [brackets], like [Esc], is drawn as a key
  body: string[]
  hint: Hint | null
  // The element the card sits beside: CSS selectors, the first one showing wins
  target: string[]
  // Which side of it the card prefers
  side: 'top' | 'right' | 'bottom' | 'left'
  action?: { label: string; run: TourAction }
}

export const TOUR_STEPS: TourStep[] = [
  {
    title: 'The graph',
    body: [
      'Each icon is a person, winery, vineyard or organization; each line is how two of them connect.',
      'The bigger the icon, the more connections it has.',
    ],
    hint: 'node',
    target: ['.graph-canvas__stage'],
    side: 'top',
    action: { label: 'Open the ringed one', run: 'open-node' },
  },
  {
    title: 'A record',
    body: [
      'Opening one shows who and what it connects to, grouped by kind, with roles and years in brackets.',
      'Every fact cites its sources. Unchecked drafts are marked, and Flag reports a mistake.',
    ],
    hint: null,
    target: ['#details'],
    side: 'left',
    action: { label: 'Open a record', run: 'open-record' },
  },
  {
    title: 'Search or ask',
    body: ['Type a name, like Eyrie or David Lett, or ask a question, like “Who founded Adelsheim?”'],
    hint: 'search',
    target: ['#search'],
    side: 'bottom',
    action: { label: 'Try a search', run: 'search' },
  },
  {
    title: 'Guides',
    body: ['Curated views of the graph, such as Southern Oregon or Sparkling. Each has its own address to share.'],
    hint: 'guides',
    target: ['.guides-toggle'],
    side: 'bottom',
    action: { label: 'Open Guides', run: 'guides' },
  },
  {
    title: 'Filters',
    body: ['Show only some kinds of record or connection, narrow to AVAs, Oregon, or records checked against their sources.'],
    hint: 'filters',
    target: ['#sidebar-toggle', '#filters-toggle'],
    side: 'bottom',
    action: { label: 'Show the filters', run: 'filters' },
  },
  {
    title: 'Getting around',
    body: [
      'Drag to move, pinch or [⌘] + scroll to zoom, and Fit to see everything.',
      'Back, Forward and History retrace your steps; [Esc] closes a record, and Reset starts over.',
    ],
    hint: 'zoom',
    target: ['.graph-canvas__zoom', '.graph-canvas__zoom-float'],
    side: 'bottom',
    action: { label: 'Fit the graph', run: 'fit' },
  },
  {
    title: 'Random, lists and help',
    body: [
      'Roll the dice, or press [R], for someone or somewhere new. List view reads everything by name.',
      'The [?] button lists every control, and brings back this tour.',
    ],
    hint: 'random',
    target: ['.graph-canvas__random'],
    side: 'bottom',
    action: { label: 'Roll the dice', run: 'random' },
  },
]
