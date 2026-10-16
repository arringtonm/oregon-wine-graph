import type { Hint } from '../composables/useGraph'

// The tour: an optional walk through the site, a step at a time, launched from the start
// panel or the Controls guide (never on its own, per Nielsen Norman Group: help readers
// pull up when they want it works better than a tutorial pushed at them). Each step names
// one control, rings it (state.hint) and asks the reader to try the control itself, not a
// stand-in button. Data only: TourCard.vue shows it and notices when they do.

export interface TourStep {
  title: string
  // A key in [brackets], like [Esc], is drawn as a key
  body: string[]
  hint: Hint | null
  // What the spotlight shows: CSS selectors, each lit where it's showing
  target: string[]
  // What to try, with the real control: done on a click in any of the target's selectors,
  // on one of `keys`, or, with `select`, on opening a record
  tryIt?: { text: string; keys?: string[]; select?: boolean }
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
    tryIt: { text: 'Try it: click the ringed one, or any other.', select: true },
  },
  {
    title: 'A record',
    body: [
      'Opening one shows who and what it connects to, grouped by kind, with roles and years in brackets.',
      'Every fact cites its sources. Unchecked drafts are marked, and Flag reports a mistake.',
    ],
    hint: null,
    target: ['#details'],
  },
  {
    title: 'Search or ask',
    body: ['Type a name, like Eyrie or David Lett, or ask a question, like “Who founded Adelsheim?”'],
    hint: 'search',
    target: ['#search'],
    tryIt: { text: 'Try it: click the search box.' },
  },
  {
    title: 'Filters',
    body: [
      'Show or hide different kinds of record, like people, wineries and vineyards, and categories of connection.',
      'You can also narrow to AVAs, Oregon, or records checked against their sources.',
    ],
    hint: 'filters',
    // And the filters themselves once they're showing
    target: ['#filters', '#sidebar-toggle', '#filters-toggle'],
    tryIt: { text: 'Try it: click the filters button to show or hide them.' },
  },
  {
    title: 'Guides',
    body: [
      'Custom sets of filters that are designed to help visualize the data in ways that tell specific stories, such as the sparkling wine community, or how fruit is sourced between vineyards and wineries.',
    ],
    hint: 'guides',
    // And the menu itself once it's open
    target: ['.guides-panel', '.guides-toggle'],
    tryIt: { text: 'Try it: click Guides.' },
  },
  {
    title: 'Getting around',
    body: [
      'Drag to move, pinch or [⌘] + scroll to zoom, and Fit to see everything.',
      'Back, Forward and History retrace your steps; [Esc] closes a record, and Reset starts over.',
    ],
    hint: 'zoom',
    target: ['.graph-canvas__zoom', '.graph-canvas__zoom-float'],
    tryIt: { text: 'Try it: zoom in or out, or press Fit.', keys: ['+', '=', '-'] },
  },
  {
    title: 'Roll the dice',
    body: ['Roll the dice, or press [R], to jump to someone or somewhere new.'],
    hint: 'random',
    target: ['.graph-canvas__random'],
    tryIt: { text: 'Try it: click the dice, or press [R].', keys: ['r', 'R'] },
  },
  {
    title: 'List view',
    body: [
      'Rather read than roam? This switch flips between the graph and a list of everything by name.',
      'You may have noticed that the controls change slightly between views.',
    ],
    hint: 'list',
    target: ['.graph-canvas__view'],
    tryIt: { text: 'Try it: switch to the list, then back to the graph.' },
  },
  {
    title: 'Help',
    body: ['The [?] button lists every control and shortcut, and brings back this tour any time.'],
    hint: 'controls',
    target: ['.guide__toggle'],
    tryIt: { text: 'Try it: click [?], or press it.', keys: ['?'] },
  },
]
