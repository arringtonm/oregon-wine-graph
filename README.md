# Oregon Wine Graph

An explorable graph of the people, wineries and vineyards of Oregon wine history, and how they connect.

## Running it

```sh
npm install
npm run dev     # local dev server
npm test        # validate the data files
npm run build   # type-check and build
```

## Data

All content lives in JSON files under `src/data/`:

- `nodes/people.json`, `wineries.json`, `vineyards.json`, `avas.json`, `organizations.json`, `events.json`
- `edges.json`, one record per relationship

`src/data/schema.ts` defines the shape of every record and the `EDGE_RULES` table, which says what each edge type means, which way it points, and which node types it may join. `npm test` checks the real files against it: schema, unique IDs, edge endpoints, allowed endpoint types, year order, and at least one source per record.

Conventions:

- IDs are kebab-case slugs (`david-lett`). Edge IDs are `source--edge-type--target`, with a `-2` suffix for a second edge of the same type between the same pair.
- A winery and a vineyard are separate nodes, joined by `owns` (estate) or `sources_from`.
- Several edges may join the same pair: one person can be founder, owner and winemaker of the same winery, or hold two separate stints.
- `ongoing: true` means the relationship still holds. A missing `endYear` on its own means the end date is unknown.
- Entities based outside Oregon carry `outsideOregon: true`.
- Every record needs a source. `verified` stays `false` until someone has checked the record against its sources.

`src/data/index.ts` is the only module that reads the JSON, so moving to a hosted database later means reimplementing `loadGraph()` there.

## App

- `src/composables/useGraph.ts`: shared state, filters and derived views
- `src/components/GraphCanvas.vue`: the Cytoscape.js graph
- `src/components/GraphControls.vue`: search, legend and filters
- `src/components/DetailPanel.vue`: the selected node, its connections and sources

AVA nodes appear only when the Geography layer is on, since they would otherwise connect to almost everything. The AVA filter works either way. The selected node is kept in the URL hash, so `/#david-lett` links straight to a node.

## Ideas for future work

Visualization:

- Size nodes by importance, not just connection count. Today a node's size is its number of connections; an explicit `importance` field or a centrality measure would let pioneering figures stand out even when few of their ties are recorded.
- Offer more than one view of the same data: a timeline or year slider showing the network as it stood in a given year, a map by AVA, and a lineage view for mentorship and family ("who trained whom").
- Tint or group nodes by AVA, and consider a color per connection category once there is a palette that stays readable.
- Show at a glance which records are verified.
- Photos or logos on nodes and in the detail panel.

Data:

- Review the seed data. Every record is an unverified draft; check each against its sources and set `verified: true`.
- Record source disagreements (founding years, AVA dates) on the record itself, so the choice made is visible.
- More relationship types that came up in research but have no home yet: AVA petitioners, donors, "sold vines to", and regulators such as the OLCC for the 1970s labeling rules.
- Widen coverage beyond the northern Willamette Valley: Columbia Gorge, Rogue and Applegate valleys, Walla Walla.

Platform:

- Move the data to Firebase or similar, with an in-app editor so others can contribute.
- Split the JavaScript bundle; the graph library makes the single chunk large.
- Check and polish the light theme and small-screen layout.
