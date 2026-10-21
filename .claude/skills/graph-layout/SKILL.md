---
name: graph-layout
description: Use when changing how the Oregon Wine Graph network is drawn or laid out — node or label sizing, edge styling, fcose layout options in src/components/GraphCanvas.vue, filters that add or remove many elements, or the AVA regions (compound) view. Gives the visualization practices this graph follows and a harness to measure a change before keeping it.
---

# Graph layout and styling

The graph is a node-link diagram of about 1,450 records and 4,100 connections (October 2026), drawn by Cytoscape. The default filters let through 1,417 people and places and 2,212 connections; it **opens on their connected core**, 841 records and 1,806 connections. Degree is heavily skewed: the median node has 2 connections, the biggest hubs 20–30.

## Practices this graph follows

- **Open on the connected core** (`src/graph/core.ts`, `useGraph.ts`). The core is the default graph's 2-core: records with fewer than two connections are dropped, repeatedly. It keeps 59% of the records and 82% of the connections. It is a fixed set, worked out once on the default graph, so narrowing the filters hides records by the filters' own rules rather than shrinking the core. A selected record and all its neighbours are always added; search finds every record the filters allow. "Show all records" in Filters turns it off, and Guides, AVA filters and AVA regions never take it. The count reads "841 of 1,417 people and places".
- **Names are placed on screen, as on a map** (`src/graph/labelGrid.ts`, `placeLabels()` in `GraphCanvas.vue`). Cytoscape draws no name by itself (`text-opacity: 0`); once the view settles (120ms after it stops moving), the selected record is named first (always), then its neighbours, then every other record by connection count. Each name goes below its record, or above, right or left, wherever it fits in the visible area without touching another name or a record's icon, and is left out if it fits nowhere. Only records drawn at least 10px across on screen are candidates (the selection and its neighbours always are), with 7px kept around each name: zoomed out that is the best-connected tiers, about 20 names at the opening view (12px: 17; 10px: 18), about 45 at twice that zoom, and zooming in further brings in the next tiers. Naming every record that fit (about 170 at the opening view) crowded the graph and flattened its hierarchy; Michael chose a sparser default over a control for it (21 October). A placed name is drawn at least at its tier's size on screen (15px for the best-connected down to 11px), or its own size when zoomed in past that. Placing on every frame of a zoom cost too much (17 against 78 frames a second), hence the settle delay; only names whose side or size changed are restyled.
- **Selection frames the neighbourhood** (`centerOnSelection()`, `src/graph/framing.ts`). Every route (canvas, search, a details-panel link, the address, the list, the dice) animates to fit the record and all its connections in the visible area, zooming out as far as needed (to the graph's minimum zoom). Its neighbours are named ahead of everything else wherever they fit (forced in, they piled up on phones); its lines (at least 2.5px) and the record itself (at least 32px) keep a readable size on screen however far out the framing goes; the rest of the graph fades to 0.08 (lines 0.05).

- **Size in five tiers, ranked among the nodes showing** (`src/graph/nodeSize.ts`). Largest (top 1%, 136px), large (next 4%, 80px), medium (15%, 44px), small (30%, 28px), smallest (50%, 18px), with labels 22 down to 9px. Tiers are recomputed for whatever the filters leave, so each view's best-connected nodes are its largest; ranking uses connection counts from the full data so a node's standing doesn't flicker. Nodes with the same count take the tier at the middle of their ranks, and the best-connected group is always largest. On the full graph that is 10 / 48 / 140 / 301 / 639 nodes. Discrete tiers read more clearly than a continuous scale: the eye compares five sizes, not a thousand. Michael set the largest size by eye: 164px was too far, 136px about right.
- **Visual hierarchy over placement.** Hubs are drawn on top (`z-index` by degree), get larger labels, and keep them when zoomed out, while minor labels drop below `min-zoomed-font-size`. Edges are thin and slightly transparent until a node is selected; with this many lines, full-strength edges bury the nodes. Lines ignore the pointer (`events: 'no'`): they can't be clicked, and lighting one on hover distracted more than it told (removed 21 October). Nodes show a pointer cursor.
- **Leaves sit beside their hub.** `idealEdgeLength` is short for an edge to a one- or two-connection node and longer between hubs, leaving room for each hub's own cluster.
- **Bigger nodes push harder.** `nodeRepulsion` scales with node width, so hubs keep clear room. Compound nodes (AVA regions) must be excluded, or their own width makes them balloon.
- **Overlap removal after every layout.** Force layouts space nodes out on average but leave collisions; `src/graph/removeOverlaps.ts` then nudges apart boxes (labels included) that still overlap, pushing each pair along its smaller overlap and moving hubs least. On the full graph it takes overlapping labels from about 370 to about 15 in about 0.4s. A few remain in the densest core; more passes don't clear them.
- **Modest label range.** Label size runs 9–22px with degree. A wider range (it was 8–36px) let hub labels bury their neighbours when zoomed in.
- **Nodes are bare silhouettes** (`src/graph/icons.ts`): person, wine glass, grape cluster, building, calendar, map pin, drawn as SVG data URIs on a transparent circle (the circle is what lines meet and what takes clicks). The images declare 256px because Cytoscape rasterises an SVG at its declared size; at 24px the 136px tier blurs. Outside-Oregon variants have a dashed ring drawn into the image, and selection is an `underlay` disc, since a bare shape has no border to style. The legend, lists and history use the same paths through `NodeGlyph.vue`.
- **No grid packing.** `tile: false`. fcose otherwise packs unconnected nodes into a square grid, which survives later incremental layouts.
- **Fresh layout after a large change.** A filter change adding or removing over a tenth of the elements re-randomizes; smaller changes keep positions so the view stays stable.

## Performance (October 2026, about 1,150 nodes and 1,770 lines)

- **Never re-run fcose for a filter change.** It froze the page for 1.4–2.2s per toggle. Removed nodes are just removed; returning nodes go back to their remembered positions (kept per arrangement, plain and AVA regions, in `knownPositions` in `GraphCanvas.vue`); never-placed nodes go beside their neighbours (`src/graph/placement.ts`), then the overlap pass runs. Toggles now take 30–160ms. A full layout runs only with no saved layout, on Reset, the first time regions are shown, or when over 10% of the showing nodes have never been placed.
- **Saved layout.** `src/data/layout.json` holds the default arrangement's positions for every record the default filters let through (not only the core, so Show all and a selection's neighbours have places of their own; the dev server shows all records on the load that makes or tidies it), one node per line. The dev server writes it, through `/__layout`, only when the first load finds no usable saved layout; Reset, guides and filters never save. New nodes are placed beside their connections at load. To refresh it on purpose, `npm run layout:reset` and reload (a new arrangement), or open `/?tidy-layout` (same arrangement: new nodes placed, every overlap nudged apart); review and commit it. At load and when filters bring nodes back, `separateNodes(around)` untangles only the neighbourhood of never-placed nodes: a whole-graph pass cost 0.4s (1.6s on a phone) on every load. Reset restores the saved arrangement instead of a fresh fcose run (1.5s, about 6s on a phone). `src/data/data.test.ts` fails when it covers under 95% of the opening view (the app falls back to a full layout below 90%). Load went from about 2s frozen to no layout at all.
- **Removing a region box takes its children with it** in Cytoscape. Move children out (`children().move({ parent: null })`) before removing a parent, or they come back as new elements and lose their places.
- **Labels are measured in Nunito, so wait for the font.** `GraphCanvas.vue` awaits `document.fonts.load` for Nunito before its first sync; measured in a fallback font, labels collide once Nunito arrives. Changing the typeface means `npm run layout:reset` and a reload, so the saved layout matches the new label widths.
- **Fit after mount needs `cy.resize()` first:** without a layout's delay, Cytoscape's cached container size is stale and the view lands far off the graph.
- **Lines at rest are `haystack` with no arrowheads**; highlighted lines switch to `bezier` with arrows and labels. Frame time fell from 9–10ms to 6–7.5ms (2× pixel ratio).
- **Rejected:** `textureOnViewport` (blurs labels while zooming); `hideEdgesOnViewport` (lines vanish while moving).
- **Measuring in a background tab:** `requestAnimationFrame` doesn't run and timers are throttled, so time interactions synchronously with a few awaited microtasks, and frame cost with `cy.renderer().renderTo(ctx, zoom, pan, 2)` into an offscreen canvas. Take a screenshot first, or the renderer may not have computed styles and report 0ms.

## What was tried and rejected (October 2026)

### Clustered layout, measured on the core (841 records), 21 October: built, then set aside

| Variant | Extent (graph units) | Overlapping labels | Layout time |
|---|---|---|---|
| Whole-graph fcose (before) | about 6,700 by 5,400 for all 1,417 | about 15 | 1.5–2.1s |
| Islands, whole-graph options, circles round each island's corners, gap 160 | 17,000 by 16,000 | 0 | 0.6s |
| Islands, tighter island options, area circles, gap 300 (best of these) | about 8,300 by 7,900 | 0–3 before the overlap pass | 0.1–0.6s |

Degree–centre correlation went from −0.34 to −0.15: hubs central in their island, not in the map. Each island was named by its best-connected record, and lines between islands drawn faint. Michael judged it too far a switch from the arrangement readers know (21 October); the single fcose arrangement stayed, and the gain in legibility was taken from placing names instead (above). The code is in v1.30's first commit, 659c5f7, if it is wanted again.

### WebGL renderer, 21 October

Cytoscape 3.34's `renderer: { name: 'canvas', webgl: true }` was slower here (37 frames a second during a zoom against 78 with the canvas renderer, worst frame 34ms against 26ms) and ignored `min-zoomed-font-size`, drawing faint names over the whole map. Rejected.

### Earlier (October 2026)

Measured on the full graph, two runs each:

| Approach | Degree–centre rank correlation | Overlapping labels | Layout time |
|---|---|---|---|
| Baseline (constant repulsion, edge length 220) | −0.35 | ~640 | 1.9s |
| Higher `gravity` and lower `gravityRange` | no better | 640 to 5,800 | up to 13s |
| Draft layout, then shrink radius by degree, then refine | −0.28 | ~800 | 1.8s |
| Two passes, top tenth pinned toward the centre (`fixedNodeConstraint`) | −0.39 | ~810 | 3.2–4s |
| Chosen: degree-based edge length, size-scaled repulsion | −0.34 | ~420 | 1.5s |
| Chosen, plus overlap removal | −0.34 | ~15 | 2.1s |

Forces alone already place hubs fairly centrally (top 5% at about half the median distance from the centre); pushing them further costs doubled, page-blocking layout time and more overlap. fcose applies `gravity` only beyond `gravityRange` times the graph size (default 3.8), so raising gravity alone does nothing.

## Measuring a change

Run the dev server, open the graph, and in the browser console (or through the browser tools) get Cytoscape from its container, then compare variants by running layouts directly with the options under test:

```js
const cy = [...document.querySelectorAll('div')].map((d) => d._cyreg).find(Boolean).cy
const overlaps = (withLabels) => {
  const boxes = cy.nodes().map((n) => n.boundingBox({ includeLabels: withLabels }))
  let count = 0
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j]
      if (a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2) count++
    }
  return count
}
const run = (options) => new Promise((done) => {
  const layout = cy.layout({ name: 'fcose', randomize: true, animate: false, ...options })
  layout.one('layoutstop', done)
  layout.run()
})
```

Judge legibility zoomed in, not only at the default fit: overlap that is invisible at fit is illegible at reading zoom. Report at least: overlapping labels (`overlaps(true)`), overlapping nodes (`overlaps(false)`), layout time, and, for centrality, the Spearman rank correlation between degree and distance from the centroid (more negative is more central). With the AVA regions view on, also check region sizes: `cy.getElementById('dundee-hills').boundingBox()` should stay around 2,000 by 1,500 units. Layouts are random, so run each variant at least twice.

Then look at it: a screenshot at the default fit, and one zoomed into the dense centre.
