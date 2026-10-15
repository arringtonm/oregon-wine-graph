---
name: ux-audit
description: Use before every commit that changes what readers of Oregon Wine Graph see (components, styles, icons, wording, layout), and whenever asked to "audit the UX", "/ux-audit", or review hierarchy, iconography or usability. Applies Nielsen Norman Group methods (the 10 heuristics, visual hierarchy, icon usability, severity ratings) against this site's own baseline and recorded design decisions, with a capture script for screenshots.
---

# UX audit (Nielsen Norman Group methods)

Two forms:

- **Before a commit** that changes what readers see: a focused audit of what changed (scope, captures, findings). Report it with the commit, e.g. "UX audit: 2 findings, 1 fixed (severity 3), 1 for Michael (severity 2)".
- **Full audit**, when asked: every surface below, at every width, in both themes.

Fix severity 3–4 findings that don't conflict with a recorded decision. Report everything else, ranked. Never quietly undo one of Michael's decisions: rate the tension and let him choose.

## Procedure

1. **Scope.** List the surfaces the change touches. A full audit covers:
   - the header;
   - the toolbar (desktop row, compact bar);
   - the filters sidebar and drawer;
   - the graph (nodes, count, About);
   - the list view;
   - the detail panel: empty, a record, a long record (`temperance-hill-vineyard`), admin rows;
   - popovers: Controls, History, Guides (views and Ask), verification, Flag, About, the verified "i";
   - hover cards, the busy overlay, the record pages for search engines.
2. **Capture.** Run `.claude/skills/ux-audit/capture.sh [out-dir]` for the static states:
   - widths 1512, 1024, 820, 393 and 360;
   - light and dark;
   - the start view, The Eyrie Vineyards, Temperance Hill;
   - production build, viewer mode, 2×.

   Interactive states (drawer, popovers, hover cards, focus rings, the flag form) need the browser tools: open the state, then screenshot or zoom. Check both themes by setting `document.documentElement.dataset.theme`, then remove it. Don't leave a saved theme in the browser.

   Limits of the captures:
   - Headless Chrome won't lay a page out narrower than 500px, so the script puts phone widths in an exact-width frame.
   - In that frame the graph isn't drawn and the lazily loaded question box may be missing.
   - Check those at phone width in the real browser instead: an exact-width iframe on the preview server (`npx vite preview --port 5191`).
3. **Evaluate** each capture against the checklists below: heuristics, hierarchy, icons, targets.
4. **Rate** each finding 0–4 (NN/g):
   - 0: not a problem;
   - 1: cosmetic;
   - 2: minor, low priority;
   - 3: major, high priority;
   - 4: catastrophe, fix before release.

   Weigh frequency, impact (how hard to get past), persistence (does it keep biting?) and market impact.
5. **Report** in this table, most severe first:

   | Sev | Principle | Where | What's wrong (evidence) | Recommendation | Conflicts with a decision? |
   |---|---|---|---|---|---|

6. **Fix** severity 3–4 findings with no conflict. Recapture to confirm each fix. Run `npm test`, the type checks and `npm run build`.
7. **Hand back** the rest: severity 1–2, and anything that conflicts with a decision, with the NN/g reasoning.

## Checklists

### The 10 usability heuristics, as they apply here

1. **Visibility of system status.**
   - Selection is shown on the graph and in the panel.
   - The busy overlay appears for Reset and Random.
   - Verification counts are visible.
   - Flag sending shows progress and a thank-you.
   - The address follows the selection.
2. **Match with the real world.**
   - Wine words readers use (AVA, estate vineyard, winemaker), not schema words (`sources_from`, `member_of`).
   - Roles read naturally ("co-owner", not "owned by: co-owner").
3. **User control and freedom.**
   - Back and Forward, History, Reset, × on every panel and popover, Escape everywhere.
   - Old links redirect rather than break.
4. **Consistency and standards.**
   - The same thing looks and behaves the same at every width and in both themes.
   - Icons come from one family. Close is always ×. Popovers close the same way.
   - Platform conventions win: magnifier for search, × to close.
5. **Error prevention.** Flag-form validation before sending, and confirmation for destructive admin actions.
6. **Recognition rather than recall.**
   - Icon-only controls carry a tooltip and an `aria-label`.
   - The Controls guide lists every action. Recently viewed is shown.
   - Readers shouldn't need to remember a record's name to get back to it.
7. **Flexibility and efficiency.** Keyboard shortcuts (?, +/−, Escape), search with arrow keys, the list view for reading.
8. **Aesthetic and minimalist design.**
   - Every element earns its place.
   - Michael prefers fewer icons; extra chrome is a finding.
9. **Help users recognise, diagnose and recover from errors.**
   - Plain-language errors (flag form, Ask) that say what to do next.
10. **Help and documentation.** The Controls guide, the "Ways to explore" start panel, the verification "i", About.

### Visual hierarchy

From [Visual Hierarchy in UX](https://www.nngroup.com/articles/visual-hierarchy-ux-definition/) and [5 Principles of Visual Design](https://www.nngroup.com/articles/principles-visual-design/):

- **Tools:**
  - colour and contrast;
  - scale;
  - grouping (proximity, white space, common regions);
  - whitespace (more space around a thing sets it apart; tight space ties a heading to its content).
- **Limits:**
  - about 3 type sizes;
  - at most 3 contrast variations in a complex view;
  - at most 2 big elements;
  - 2 primary and 2 secondary colours;
  - borders and backgrounds only when spacing isn't enough.
- **Squint test:** blur the capture (zoom out, or look at a 0.3-scale screenshot). The intended order should still read: record name, then facts, then connections, then sources.
- **Pitfalls:**
  - "if everything is contrasted, nothing stands out";
  - colour as the only signal (colour-blind readers; the palette rules below);
  - heavy all-caps;
  - uniform sizes with no breathing room.

### Icons

From [Icon Usability](https://www.nngroup.com/articles/icon-usability/):

- **Universal icons are rare.** Only home, print and the search magnifier are near-universal. Everything else (heart, star, hamburger, clock) varies. In NN/g's testing, an obscure clock icon for history was never clicked: "obscure icon = wasted feature".
- **Icons need visible text labels.** Hover-only labels add interaction cost and don't work on touch. A tooltip helps desktop mouse users only. An `aria-label` helps screen readers only.
- **The 5-second rule.** If a fitting icon takes more than 5 seconds to think of, the concept needs words.
- **Test** recognisability ("what do you expect this does?") and memorability.
- **Keep icons simple and schematic.** Detail blurs at small sizes. Check every icon at 16px and at its real size.
- **One family:** same grid, stroke weight, caps and corner style, with filled or outlined used consistently.
- **Salience changes with screen size.** Icons get relatively smaller on wide screens.

### Targets and motion

- **Pointer targets:** at least 24×24px (WCAG 2.2). Touch targets: aim for 44×44px. Primary actions are bigger and nearer where the eye already is (Fitts's law).
- **Reduced motion:** honour `prefers-reduced-motion`. The busy overlay's dots, panel slides and graph animations already do.

## This site's baseline (October 2026)

- **Type:**
  - root 14px (`font-size: 87.5%`);
  - Fraunces Variable for the header title (1.3125rem, 650) and record names in the detail panel (1.4rem, 650);
  - Nunito Variable for everything else.
- **Sizes in use:** 0.75, 0.8125, 0.875, 0.9375, 1, 1.0625, 1.3, 1.3125 and 1.4rem: nine sizes, against NN/g's three levels. Consolidating them is an open item.
- **Section headings:** 0.875rem, 600 weight, uppercase, letter-spaced, secondary colour, with 26px above. Verb subheadings: 0.9375rem, 600, sentence case.
- **Colour** (`src/style.css`):
  - a burgundy accent and fill;
  - node colours: claret wineries, olive vineyards (`#485d19` light, `#689a42` dark), gold people, warm-grey organizations and AVAs.
  - Node colours keep 3:1 contrast and stay apart under simulated protanopia, deuteranopia and tritanopia (CIELAB distance ≥ 21 light, ≥ 17 dark).
  - Light and dark tokens are defined three times (light, the system-dark media query, `[data-theme='dark']`); change all three together.
- **Icons:**
  - UI icons: 20×20 viewBox, round 1.4–1.6 strokes, `currentColor`.
  - Node silhouettes: filled, 24×24 (`src/graph/icons.ts`, `NodeGlyph.vue`).
  - The mark (Oregon and the glass): `SiteMark.vue` in the header, `public/favicon.svg` in the tab.
  - Other grids in use: 12 (chevron, checkbox tick) and 16 (verified, flag).
- **Icon inventory and labelling:**

  | Icon | Where | Visible label | Tooltip | aria-label |
  |---|---|---|---|---|
  | Sidebar | toolbar, desktop | – | Tip | "Filters" |
  | Funnel | toolbar, ≤600px | "Filters" above 600px | – | via text |
  | Magnifier | search | placeholder "Search" | – | "Search people and places" |
  | Signpost | Guides menu (guided views, Ask) | "Guides", "Guides: <view>" on desktop | – | via text |
  | ‹ › | Back, Forward | – | Tip | "Back", "Forward" |
  | Clock + chevron | History | – | data-tip | "History" |
  | Dice | Random (key R) | – | Tip | "Random person or place"; tooltip: a cellar phrase, then "(Select random person or place)" |
  | Network / list | view switch | – | data-tip | "Graph view", "List view" |
  | + − | zoom | – | Tip | "Zoom in/out" |
  | ? | Controls | – | data-tip | "Controls" |
  | Two glasses (Chardonnay, red) | theme switch, header | – | Tip each | "Light mode", "Dark mode", in a group named "Theme" |
  | i | About (graph corner) | – | data-tip | "About the site" |
  | i | beside "Verified records only" | – | – | "How records are verified" |
  | Check circle | verification bar | "15 of 18 verified" | – | full sentence |
  | Flag | foot of a record | "Flag" | – | "Flag a fact for review" |
  | × | closes | – | – | "Close", "Close details" |
  | Node silhouettes | graph, panel, lists | names beside them | – | decorative |

- **Tooltips:** `Tip.vue` (Reka) for plain buttons. CSS `data-tip` (in `style.css`) for buttons that are also a popover or menu trigger, because two Reka triggers on one button break its clicks.
- **Layers (z-index):**

  | Layer | z-index |
  |---|---|
  | graph and list | auto |
  | node count and About | 1 |
  | detail sheet | 2 |
  | busy overlay | 3 |
  | toolbar and guide | 4 |
  | tooltips | 5 |
  | drawer backdrop | 6 |
  | drawer | 7 |
  | popovers | 40–50 |

- **Breakpoints:**

  | Width | What changes |
  |---|---|
  | ≤1512px | sidebar hidden by default |
  | ≤1024px | drawer, bottom sheet, toolbar becomes a bar |
  | ≤600px | phone toolbar (icon-only Filters, two rows) |
  | <430px | Fit hidden |
  | <380px | Random and History's chevron hidden |

  The site must work down to 360px.

## Decisions Michael has made (rate tensions; don't reverse)

Rate a tension with one of these, and leave the call to him:

- **Header:** the Oregon-and-glass mark with no tile (14–15 Oct 2026). Title and record names in Fraunces; the tagline lowered to share the title's baseline.
- **Fewer icons** (15 Oct): Controls is "?" alone with a tooltip; History is a clock icon; Graph/List are icons. NN/g's guidance on unlabelled icons (see the clock finding) is a known tension, so rate it and don't relabel.
- **Phones:** Filters is a funnel; Random and Fit drop out at the narrowest widths.
- **Detail panel:**
  - connections lead with the name and a bracket, "Name (founded, from 1971)";
  - a verb is a subheading only when 3 or more connections share it;
  - roles show as short titles (`src/data/role-titles.json`);
  - no type line under the name.
- **Start panel:** "Ways to explore", then Recently viewed (saved in the browser). The random button there went (15 Oct): it vanished once a record opened. The toolbar's dice is the one random control; its tooltip opens with a cellar phrase (`RANDOM_INVITES`), new after each roll, then "(Select random person or place)".
- **Reset** sits in the history group, between the History menu and the dice, not with zoom and Fit: it changes the filters and selection, not the framing (15 Oct).
- **Guides:** the toolbar's Ask became Guides, holding curated views (graph/views.ts) above the question box; the name is Michael's choice over "Explore" and "Smart" (15 Oct).
- **Theme switch:** two glasses side by side, a Chardonnay for light and a red for dark, with a neutral slider behind the one showing (15 Oct).
- **Graph:** the count ("1,235 people and places · 1,909 connections") in the bottom-left corner; About is an "i" in the bottom-right; the vineyard green is olive.
- **Busy overlay:** cellar phrases (`BUSY_PHRASES`); Random pauses about 0.9s.
- **Sidebar:** hidden by default at 1512px and narrower; the version line links to the release notes.

## Before-commit form

A short version for routine commits:

- **Scope:** the surfaces changed.
- **Captures:** the affected states, at the widths and in the themes that matter.
- **Findings:** the table, often empty or one or two rows.
- **Fixed:** what was fixed before committing.
- **For Michael:** what's left for him.

Put the one-line summary in the report to Michael. The commit message only mentions it if something was fixed.
