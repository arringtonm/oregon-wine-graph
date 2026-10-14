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
- Every record needs a source. A source normally has a URL; one without (an emailed newsletter issue, say) is cited by title and date. `verified` stays `false` until someone has checked the record against its sources.

`src/data/index.ts` is the only module that reads the JSON, so moving to a hosted database later means reimplementing `loadGraph()` there.

## Reviewing records

Run `npm run dev` and the detail panel gains a review box. Each node and each connection has an Approve button (and Undo), its sources are linked beside it, and "Next unverified" walks through whatever is left. Approving writes `verified: true` straight into the JSON file, so a review session ends as an ordinary git diff to read and commit.

### Checking records against their sources

Most of the backlog is cleared by machine. Three commands, run in order:

```sh
npm run check:fetch      # download every cited page once into .cache/ (not committed)
npm run check            # ask Jev whether each record's own sources support it
npm run check:apply      # mark the supported ones verified, as verified by Jev
```

`npm run check` breaks each record into claims (the relationship, each year, the role), cuts each cited page down to the passages naming the parties, and has Jev score every claim. Raw scores go to `src/data/checks.json`, so the threshold can change without asking again. A record is supported when some source states or implies it and every detail holds; otherwise it is partly supported, unsupported, contradicted, or unreadable.

`npm run check:calibrate` measures the risk: it breaks one fact in each of about 400 passing records and counts how many still pass. At the threshold in use (0.9) that was 1.2%, all from swapping in a neighbouring relationship such as "founded" for "helped organize".

Verified records carry `verifiedBy`: `person`, `jev` or `boundary`. `npm run check:apply -- --undo` unverifies everything Jev verified.

In review mode, each record shows Jev's verdict and an Evidence button with the passages it read. The review box has a button per verdict that jumps to the next node needing attention. A connection can be edited (role, years), which re-checks it, or removed.

Review mode exists only on the dev server (`tools/reviewPlugin.ts`); the built site is read-only and shows unverified records with an "Unverified draft" badge.

## Adding a connection in plain language

Also on the dev server, each node's panel has an "Add new connection" box. Type a sentence about that node, such as "Dan and Jeanne are married" on Dan Diephouse's page, optionally with a source URL. The app shows what it understood as an editable preview; nothing is saved until you confirm. A saved connection is appended to `edges.json` as an unverified record. Without a URL it cites you and the date.

The reading is done by [Jev](https://typesafe.ai), a decision model: our code finds the candidate nodes and years, Jev chooses among them and among the allowed connection types, and the edge rules have the last word. Put a key in `.env.local` to use it:

```
JEV_API_KEY=...
```

Without a key, keyword rules stand in for Jev so the feature still works; the preview says which one read the sentence. If the sentence names someone or something the graph does not have, the preview offers to create it as a new unverified node, with a name and type you can correct before saving. One sentence adds one connection. The code is in `tools/jev/`.

## Geography

- `npm run geo:locate` finds each Oregon winery's visitor address on its own website (trying the usual domain patterns when none is cited), has Jev confirm which address is the winery's, and geocodes it with the US Census geocoder. Addresses are visitor information: often a tasting room, which can move and can sit far from the vines. They feed the "Nearby tasting rooms" list and nothing else.
- `npm run geo:avas` tests located vineyards against the official AVA boundaries (UC Davis Library, public domain), verifying "located in" connections that match and adding missing ones. Wineries are not tested, for the reason above.
- With "AVA regions" on, vineyards are drawn inside a region for their AVA, nested inside parent AVAs. Wineries stay outside the regions, since a winery can source from vineyards in several AVAs; they are joined to the vineyards they own or buy from, and any "located in" they have is drawn as a line to the region.

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
- Show at a glance on the graph itself which records are verified.
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
