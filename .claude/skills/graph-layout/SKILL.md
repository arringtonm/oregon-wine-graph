---
name: graph-layout
description: Use when changing how the Oregon Wine Graph network is drawn or laid out — node or label sizing, edge styling, fcose layout options in src/components/GraphCanvas.vue, filters that add or remove many elements, or the AVA regions (compound) view. Gives the visualization practices this graph follows and a harness to measure a change before keeping it.
---

# Graph layout and styling

The graph is a node-link diagram of about 1,150 nodes and 1,950 connections, drawn by Cytoscape with the fcose force-directed layout. Degree is heavily skewed: the median node has 2 connections, the 90th percentile 7, the biggest hubs 20–27. About 900 nodes form one connected cluster; the rest sit in some 75 small detached groups.

## Practices this graph follows

- **Size in five tiers, ranked among the nodes showing** (`src/graph/nodeSize.ts`). Largest (top 1%, 136px), large (next 4%, 80px), medium (15%, 44px), small (30%, 28px), smallest (50%, 18px), with labels 22 down to 9px. Tiers are recomputed for whatever the filters leave, so each view's best-connected nodes are its largest; ranking uses connection counts from the full data so a node's standing doesn't flicker. Nodes with the same count take the tier at the middle of their ranks, and the best-connected group is always largest. On the full graph that is 10 / 48 / 140 / 301 / 639 nodes. Discrete tiers read more clearly than a continuous scale: the eye compares five sizes, not a thousand. Michael set the largest size by eye: 164px was too far, 136px about right.
- **Visual hierarchy over placement.** Hubs are drawn on top (`z-index` by degree), get larger labels, and keep them when zoomed out, while minor labels drop below `min-zoomed-font-size`. Edges are thin and slightly transparent until a node is selected or a line hovered; with this many lines, full-strength edges bury the nodes.
- **Leaves sit beside their hub.** `idealEdgeLength` is short for an edge to a one- or two-connection node and longer between hubs, leaving room for each hub's own cluster.
- **Bigger nodes push harder.** `nodeRepulsion` scales with node width, so hubs keep clear room. Compound nodes (AVA regions) must be excluded, or their own width makes them balloon.
- **Overlap removal after every layout.** Force layouts space nodes out on average but leave collisions; `src/graph/removeOverlaps.ts` then nudges apart boxes (labels included) that still overlap, pushing each pair along its smaller overlap and moving hubs least. On the full graph it takes overlapping labels from about 370 to about 15 in about 0.4s. A few remain in the densest core; more passes don't clear them.
- **Modest label range.** Label size runs 9–22px with degree. A wider range (it was 8–36px) let hub labels bury their neighbours when zoomed in.
- **Nodes are bare silhouettes** (`src/graph/icons.ts`): person, wine glass, grape cluster, building, calendar, map pin, drawn as SVG data URIs on a transparent circle (the circle is what lines meet and what takes clicks). The images declare 256px because Cytoscape rasterises an SVG at its declared size; at 24px the 136px tier blurs. Outside-Oregon variants have a dashed ring drawn into the image, and selection is an `underlay` disc, since a bare shape has no border to style. The legend, lists and history use the same paths through `NodeGlyph.vue`.
- **No grid packing.** `tile: false`. fcose otherwise packs unconnected nodes into a square grid, which survives later incremental layouts.
- **Fresh layout after a large change.** A filter change adding or removing over a tenth of the elements re-randomizes; smaller changes keep positions so the view stays stable.

## Performance (October 2026, about 1,150 nodes and 1,770 lines)

- **Never re-run fcose for a filter change.** It froze the page for 1.4–2.2s per toggle. Removed nodes are just removed; returning nodes go back to their remembered positions (kept per arrangement, plain and AVA regions, in `knownPositions` in `GraphCanvas.vue`); never-placed nodes go beside their neighbours (`src/graph/placement.ts`), then the overlap pass runs. Toggles now take 30–160ms. A full layout runs only with no saved layout, on Reset, the first time regions are shown, or when over 10% of the showing nodes have never been placed.
- **Saved layout.** `src/data/layout.json` holds the default view's positions, one node per line. The dev server rewrites it after any fresh full layout of the default view (first load without it, or Reset), through `/__layout`; commit it with data changes. `npm run layout:reset` empties it so the next load lays out afresh. Load went from about 2s frozen to no layout at all.
- **Removing a region box takes its children with it** in Cytoscape. Move children out (`children().move({ parent: null })`) before removing a parent, or they come back as new elements and lose their places.
- **Fit after mount needs `cy.resize()` first:** without a layout's delay, Cytoscape's cached container size is stale and the view lands far off the graph.
- **Lines at rest are `haystack` with no arrowheads**; highlighted and hovered lines switch to `bezier` with arrows and labels. Frame time fell from 9–10ms to 6–7.5ms (2× pixel ratio). Hover still finds straight lines.
- **Rejected:** `textureOnViewport` (blurs labels while zooming); `hideEdgesOnViewport` (lines vanish while moving).
- **Measuring in a background tab:** `requestAnimationFrame` doesn't run and timers are throttled, so time interactions synchronously with a few awaited microtasks, and frame cost with `cy.renderer().renderTo(ctx, zoom, pan, 2)` into an offscreen canvas. Take a screenshot first, or the renderer may not have computed styles and report 0ms.

## What was tried and rejected (October 2026)

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
