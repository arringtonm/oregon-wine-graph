import type { Hint } from '../composables/useGraph'
import { Click, click, modifier, touchOnly } from '../services/device'

// The map view is offered only where the build has a Mapbox token (GraphCanvas.vue)
const mapAvailable = !!import.meta.env.VITE_MAPBOX_TOKEN

// Words for the device in hand: a line can differ for touch screens and for a mouse and
// keyboard, and {click} / {Click} read "tap" / "Tap" on a touch screen, {mod} ⌘ or Ctrl
export type Line = string | { touch: string; mouse: string }
export function wording(line: Line): string {
  const text = typeof line === 'string' ? line : touchOnly ? line.touch : line.mouse
  return text.replace(/\{click\}/g, click).replace(/\{Click\}/g, Click).replace(/\{mod\}/g, modifier)
}

// The tour: an optional walk through the site, a step at a time, launched from the start
// panel or the Controls guide (never on its own, per Nielsen Norman Group: help readers
// pull up when they want it works better than a tutorial pushed at them). Each step names
// one control, rings it (state.hint) and asks the reader to try the control itself, not a
// stand-in button. Data only: TourCard.vue shows it and notices when they do.

export interface TourStep {
  title: string
  // A key in [brackets], like [Esc], is drawn as a key; _underscores_ set words in italics;
  // {flag} is the word Flag with the Flag button's icon, kept together on one line
  body: Line[]
  hint: Hint | null
  // What the spotlight shows: CSS selectors, each lit where it's showing
  target: string[]
  // Lit as well, but using it isn't the step's "Try it"
  alsoLit?: string[]
  // What to try, with the real control: done on a click in any of the target's selectors,
  // on one of `keys`, or, with `select`, on opening a record
  // on opening a record, or, with `another`, on moving from the record open to another (the
  // card names the first one and counts its connections)
  tryIt?: { text: Line; keys?: string[]; select?: boolean; another?: boolean }
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
    tryIt: { text: 'Try it: {click} an icon on the graph.', select: true },
  },
  {
    title: 'A record',
    body: [
      'Opening one shows who and what it connects to, grouped by kind, with roles and years in brackets. {Click} any name there to move on to that record, and keep exploring from one connection to the next.',
      "Every fact cites its sources, or notes it's unverified. The {flag} lets you report a mistake.",
      'Links under Oral history and Sources, and in the verification note, lead to other sites, like the Oregon Wine History Archive. They open in a new tab, so your place here stays put.',
    ],
    hint: null,
    target: ['#details'],
    tryIt: { text: 'Try it: {click} a name in its connections to open that record.', another: true },
  },
  {
    title: 'Search or ask',
    body: [
      'Type a name, like Eyrie or David Lett, or ask a question, like “Who founded Adelsheim?”',
      "The search is _kind of_ smart. It uses a low-level AI to guess whether you're asking a question or looking for a record, and does its best to answer for you.",
    ],
    hint: 'search',
    target: ['#search'],
    tryIt: { text: 'Try it: {click} the search box.' },
  },
  {
    title: 'Filters',
    body: [
      'Show or hide different kinds of record, like people, wineries and vineyards, and categories of connection. The graph starts with the best-connected people and places; Show all records adds the rest.',
      'You can also narrow to AVAs, to Oregon only (some important contributors from outside Oregon are included in the data), or to records checked against their sources.',
    ],
    hint: 'filters',
    // And the filters themselves once they're showing
    target: ['#filters', '#sidebar-toggle', '#filters-toggle'],
    tryIt: { text: 'Try it: {click} the filters button to show or hide them.' },
  },
  {
    title: 'Guides',
    body: [
      'Custom sets of filters that are designed to help visualize the data in ways that tell specific stories, such as the sparkling wine community, or how fruit is sourced between vineyards and wineries.',
      'Filters and Guides cut down the visual noise, but they can also hide connections and entries you might expect to see. If someone seems to be missing, Reset brings everything back.',
    ],
    hint: 'guides',
    // And the menu itself once it's open
    target: ['.guides-panel', '.guides-toggle'],
    tryIt: { text: 'Try it: {click} Guides.' },
  },
  {
    title: 'Getting around',
    body: [
      {
        touch: 'Drag to move, pinch or use + and − to zoom, and Fit to see everything.',
        mouse: 'Drag or scroll to move, pinch or [{mod}] + scroll to zoom, and Fit to see everything.',
      },
      {
        touch: 'Back, Forward and History retrace your steps; × closes a record, and Reset puts all filters and settings back to default.',
        mouse: 'Back, Forward and History retrace your steps; [Esc] closes a record, and Reset puts all filters and settings back to default.',
      },
    ],
    hint: 'zoom',
    // Zoom and Fit, and Back, Forward, History and Reset beside the dice
    target: [
      '.graph-canvas__zoom',
      '.graph-canvas__zoom-float',
      '.graph-canvas__toolbar button[aria-label="Back"]',
      '.graph-canvas__toolbar button[aria-label="Forward"]',
      '#history-toggle',
      '.graph-canvas__reset',
    ],
    tryIt: {
      text: { touch: 'Try it: tap + or −, Fit, or Back.', mouse: 'Try it: zoom in or out, press Fit, or step Back.' },
      keys: ['+', '=', '-'],
    },
  },
  {
    title: 'Roll the dice',
    body: [
      {
        touch: 'Roll the dice to jump to someone or somewhere new.',
        mouse: 'Roll the dice, or press [R], to jump to someone or somewhere new.',
      },
    ],
    hint: 'random',
    target: ['.graph-canvas__random'],
    tryIt: { text: { touch: 'Try it: tap the dice.', mouse: 'Try it: click the dice, or press [R].' }, keys: ['r', 'R'] },
  },
  {
    title: 'Graph, map or list',
    body: [
      mapAvailable
        ? 'This switch changes how you see it all: the graph of connections, a map that places wineries on the hills with the AVAs outlined, or a list of everything by name, where you can jump between people, wineries and vineyards, or sort by most connected.'
        : 'Rather read than roam? This switch flips between the graph and a list of everything by name, where you can jump between people, wineries and vineyards, or sort by most connected.',
      'You may have noticed that the controls change slightly between views.',
    ],
    hint: 'views',
    target: ['.graph-canvas__view'],
    // And the view itself, whichever is showing, so the switch's effect is plain to see
    alsoLit: ['.graph-canvas__stage', '.geo-map', '.graph-canvas__list'],
    tryIt: { text: mapAvailable ? 'Try it: switch to the map or the list, then back to the graph.' : 'Try it: switch to the list, then back to the graph.' },
  },
  {
    title: 'Help',
    body: [
      {
        touch: 'The [?] button lists every gesture and control, and brings back this tour any time.',
        mouse: 'The [?] button lists every control and shortcut, and brings back this tour any time.',
      },
    ],
    hint: 'controls',
    target: ['.guide__toggle'],
    tryIt: { text: { touch: 'Try it: tap [?].', mouse: 'Try it: click [?], or press it.' }, keys: ['?'] },
  },
]
