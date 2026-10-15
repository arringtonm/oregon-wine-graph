# Developer guide

Everything needed to run, extend and curate Oregon Wine Graph. The [README](../README.md) is the reader-facing overview.

## Running it

```sh
npm install
npm run dev     # local dev server, with review tools and "Ask a question"
npm test        # unit and component tests, and validation of the data files
npm run build   # type-check and build the read-only site into dist/
```

Vue 3, Vite and TypeScript. The graph is drawn with [Cytoscape.js](https://js.cytoscape.org) and laid out with fcose; interactive controls (search, menus, popovers, checkboxes, the view switch, tooltips) are [Reka UI](https://reka-ui.com) primitives, styled with our own CSS. The typeface is Nunito, self-hosted through `@fontsource-variable/nunito`.

## Data

All content lives in JSON files under `src/data/`:

- `nodes/people.json`, `wineries.json`, `vineyards.json`, `avas.json`, `organizations.json`, `events.json`
- `edges.json`, one record per relationship
- `checks.json`, the record check's raw scores (dev server only, not in the built site)
- `layout.json`, the saved arrangement of the default view

`src/data/schema.ts` defines the shape of every record and the `EDGE_RULES` table, which says what each edge type means, which way it points, and which node types it may join. `npm test` checks the real files against it: schema, unique IDs, edge endpoints, allowed endpoint types, year order, and at least one source per record.

Conventions:

- IDs are kebab-case slugs (`david-lett`). Edge IDs are `source--edge-type--target`, with a `-2` suffix for a second edge of the same type between the same pair.
- A winery and a vineyard are separate nodes, joined by `owns` (estate) or `sources_from`.
- `located_in` is for a vineyard's physical place in an AVA. A winery uses `draws_from` for the AVAs it makes wine from; an AVA never "supplies" a winery.
- Several edges may join the same pair: one person can be founder, owner and winemaker of the same winery, or hold two separate stints.
- `ongoing: true` means the relationship still holds. A missing `endYear` on its own means the end date is unknown.
- Entities based outside Oregon carry `outsideOregon: true`.
- Addresses and coordinates are visitor information (often a tasting room), never evidence of where grapes grow.
- Every record needs a source. A source normally has a URL; one without (an emailed newsletter issue, say) is cited by title and date. Private newsletters contribute facts only, never their text.
- `verified` stays `false` until a person or the record check confirms the record against its sources. Verified records carry `verifiedBy`: `person`, `jev` or `boundary`.
- People, wineries and vineyards may carry `interviews`: oral history interviews from the Oregon Wine History Archive.
- An edge's `role` is free text and stays as written. On a record's card, the role of a founded, owns, worked at, winemaker, consulted, member of or mentored edge stands in for the verb ("Mark Wisnovsky (co-owner, from 2005)"). Roles of four words or more, and short ones that don't read as titles ("winemaking"), show a short title from `role-titles.json` instead ("operates the winery with family" becomes "operator"). The full role still shows in the verification note, flags and admin mode. New long roles need a title, and `npm test` lists any missing: run `npm run roles:titles`, which has Jev pick from each type's vocabulary (`src/data/roleTitles.ts`) into `tools/roles/proposals.json`, then review the picks and add them to `role-titles.json`.

`src/data/index.ts` is the only module that reads the JSON, so moving to a hosted database later means reimplementing `loadGraph()` there.

## Reviewing records

On the dev server the detail panel gains a review box. Each node and each connection has an Approve button (and Undo), its sources are linked beside it, and "Next unverified" walks through whatever is left. Approving writes `verified: true` straight into the JSON file, so a review session ends as an ordinary git diff to read and commit. Review mode lives in `tools/reviewPlugin.ts`; the built site is read-only.

### Checking records against their sources

Most of the backlog is cleared by machine:

```sh
npm run check:fetch      # download every cited page once into .cache/ (not committed)
npm run check            # ask Jev whether each record's own sources support it
npm run check:apply      # mark the supported ones verified, as verified by Jev
```

`npm run check` breaks each record into claims (the relationship, each year, the role), cuts each cited page down to the passages naming the parties, and has [Jev](https://typesafe.ai), a decision model, score every claim. Raw scores go to `src/data/checks.json`, so the threshold can change without asking again. A record is supported when some source states or implies it and every detail holds; otherwise it is partly supported, unsupported, contradicted, or unreadable. Records first checked before their source was fetched are re-checked automatically once it is cached.

`npm run check:calibrate` measures the risk: it breaks one fact in each of about 400 passing records and counts how many still pass. At the threshold in use (0.9) that was 1.2%, all from swapping in a neighbouring relationship such as "founded" for "helped organize". `npm run check:apply -- --undo` unverifies everything Jev verified.

In review mode each record shows Jev's verdict and an Evidence disclosure with the passages it read. A connection can be edited (role, years), which re-checks it, or removed.

Put a key in `.env.local` to use Jev:

```
JEV_API_KEY=...
```

## Admin and viewer modes

On the dev server the header has a "Viewing as: Admin | Viewer" switch (remembered per browser). Admin shows the review tools; viewer hides them (approve and undo, unverified badges, Evidence, edit, remove, add connection) and previews the published site, which is always viewer only.

Both modes show a small check beside verified records. It opens a note saying how the record was verified: by the automated check, against the source that supported it best; by a person; or against AVA boundaries. The supporting source comes from `src/data/verified-sources.json`, which `npm run check:apply` rewrites; it maps each record verified by the check to the index of its best source, since the published site doesn't load `checks.json`.

### Flags

Beside each node summary and connection, a flag opens a short form (what's wrong, an optional note and source link) for reporting a fact for review. It collects nothing personal. For now flags are stored only on the dev server, in `.cache/flags.json` (git-ignored); admin mode shows "Flagged N" in the review box, the flags on each record, and Resolve. The code is `src/services/flags.ts`, `src/components/FlagButton.vue` and `FlagNotes.vue`, and `tools/flags/localStore.ts`.

The published site sends flags to `/api/flags` (below), which stores them in Cloudflare D1.



Also on the dev server, each node's panel has an "Add new connection" box. Type a sentence about that node, such as "Dan and Jeanne are married" on Dan Diephouse's page, optionally with a source URL. The app shows what it understood as an editable preview; nothing is saved until you confirm. Our code finds the candidate nodes and years, Jev chooses among them and among the allowed connection types, and the edge rules have the last word. Without a key, keyword rules stand in. The code is in `tools/jev/`.

## Ask a question

The sidebar's "Ask a question" box (dev server only) answers questions about the data. Jev reads which of about fifteen common questions it is (who founded, who made the wine, who mentored, fruit sources, AVAs, how two names are connected…) and which record it is about; the answer itself is read from the graph's records, so it cannot invent facts. Uncertain readings are labelled as best guesses with a "Did you mean" alternative, and other questions fall back to Jev ranking likely records. See `tools/jev/askGraph.ts` and its tests. The component is loaded only in development and is absent from the production build.

## Saved layout and performance

The graph opens with a saved arrangement (`src/data/layout.json`), so it appears without laying the graph out in the browser. The dev server saves it whenever the default view gets a fresh layout: on the first load without one, or on Reset. Commit it alongside data changes. Nodes added since the last save are placed beside their connections. To start over, run `npm run layout:reset` and reload.

Filter changes never re-run the force layout: hidden nodes are removed and returning ones go back to their remembered positions. Labels are measured in Nunito, so the layout waits for the font to load. `.claude/skills/graph-layout/SKILL.md` records the visualization practices, the measurements behind them, and a console harness for measuring layout changes.

## Design tokens

Colours, radii and shadows are CSS custom properties in `src/style.css`, defined for light and dark themes. The "cellar" palette pairs a burgundy accent (`--accent` for text and focus, `--fill`/`--on-fill` for filled surfaces) with node colours drawn from wine: claret wineries, vine-green vineyards, Chardonnay-gold people and warm-grey organizations, events and AVAs. Node colours keep at least 3:1 contrast and stay distinguishable under simulated protanopia, deuteranopia and tritanopia. The graph's node silhouettes (`src/graph/icons.ts`) read the same tokens. On wide screens the graph runs under both sidebars, which are translucent with a backdrop blur; `--inset-left` and `--inset-right` (set in `App.vue`) keep the toolbar, controls guide and list view clear of them, and fitting and centring use the visible middle area.

## Versions

The site shows its version and build date under the filters: "v1.00 · Oct 15, 2026". The version comes from `package.json` (major.minor; the patch number is unused) and is formatted by `tools/siteVersion.ts`. Hovering it shows the exact commit, and every flag records both, as "v1.00 (4fa3696)", so a report can be matched to exactly what the reader saw.

**A minor release (v1.01, v1.02, …)** is any push to `main` that changes what readers see or can do:

- a new or changed feature, control or page;
- a design or layout change;
- a batch of new or corrected records;
- a fix a reader would notice.

Bump once per push, not per commit: run `npm run release` (1.0.0 → 1.1.0, shown as v1.01) and commit it with the change. After v1.99 comes v1.100; it doesn't roll over.

**No bump** for what readers can't see: tests, docs, tooling, refactors with no visible change, and anything only on the dev server (admin mode, review tools). Those still deploy, and the date and commit still update.

**A major release (v2.00)** is rare: the site has become a different thing for its readers. Signs:

- the main way of exploring changes (the graph is no longer at the centre);
- the scope grows beyond Oregon wine;
- readers get accounts, or can add records themselves;
- links people have shared stop working (a new address scheme);
- a redesign throughout.

The test: would a returning reader need to relearn the site? A large feature, a big data import or a visual refresh is still a minor release. Run `npm version major --no-git-tag-version`.

## Deploying (Cloudflare Worker, oregonwine.app)

The site is one Cloudflare Worker, `oregon-wine-graph`, configured by `wrangler.toml`. Cloudflare serves the built `dist/` as static assets (free, unlimited); only `/api/*` runs the code in `worker/`:

- `POST /api/ask` (`worker/api/ask.ts`) runs the same `askGraph()` as the dev server, with the Jev key as a Worker secret. Identical questions are answered from Cloudflare's cache for a day.
- `POST /api/flags` (`worker/api/flags.ts`) checks a flag with the shared rules (`src/services/flagRecord.ts`), confirms the sender is a person with Turnstile when `TURNSTILE_SECRET` is set, and inserts it into the D1 table defined in `migrations/`.
- `.env.production` points production builds at those paths. `npm run build` also type-checks the Worker.

The Worker is connected to the GitHub repo: every push to `main` builds (`npm run build`) and deploys (`npx wrangler deploy`).

### Running it locally

```sh
grep '^JEV_API_KEY=' .env.local > .dev.vars   # wrangler's local secrets (git-ignored)
npm run db:migrate:local                       # create the flags table in a local D1
npm run worker:dev                             # build, then serve site + API on :8788
npx wrangler d1 execute oregon-wine-flags --local --command "SELECT * FROM flags"
```

### Cloudflare settings (once)

- **Flags database:** D1 database `oregon-wine-flags`; its id is in `wrangler.toml`, and its table was created from `migrations/0001_flags.sql`.
- **Secrets** (Worker → Settings → Variables and secrets): `JEV_API_KEY`, and `TURNSTILE_SECRET` once Turnstile is set up.
- **Turnstile:** the widget "Oregon Wine Graph flags" for `oregonwine.app` (Managed mode); its public site key is `VITE_TURNSTILE_SITE_KEY` in `.env.production`, its secret key the Worker secret `TURNSTILE_SECRET`. To test locally, build with Cloudflare's always-pass test keys: `VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA` for the build and `TURNSTILE_SECRET=1x0000000000000000000000000000000AA` in `.dev.vars`.
- **Domain:** `oregonwine.app` under the Worker's Domains.
- **Rate limit:** Security → WAF → Rate limiting rules: paths starting with `/api/`, about 20 requests in 10 seconds per IP.

Admin mode on the dev server lists flags from the published site alongside local ones, and Resolve works on both. It reads D1 through wrangler, so run `npx wrangler login` once; without it, admin mode shows local flags only.

Reading flags by hand: `npx wrangler d1 execute oregon-wine-flags --remote --command "SELECT * FROM flags WHERE resolved_at IS NULL ORDER BY created_at DESC"`, or the D1 console in the dashboard.

## Sources and research tools

### Oregon Wine History Archive

Linfield University's oral-history archive ([oregonwinehistoryarchive.org](https://oregonwinehistoryarchive.org)) serves all its pages through its public WordPress API, so no crawling is needed.

```sh
npm run owha:fetch   # download and parse every page into .cache/owha/, and cache each as a source
npm run owha:match   # match interviews to people and collections to wineries we already have
npm run owha:link    # add those interviews to the nodes, with the archive page as a source
```

Pages about people and places not yet in the graph are ranked with `npm run discover:triage -- owha-unmatched` and extracted by research agents.

### Adding records from a source

`tools/discover/BRIEF.md` sets out the conventions for turning a source into records: what to cite, how to model wineries and vineyards, and what never to guess. Research output goes to a file under `.cache/`, and `npm run discover:merge -- <file.json> ...` folds it into the data: existing nodes and relationships gain only sources, connections to unknown nodes and orphan nodes are dropped, and the whole graph is validated before anything is written. Run `npm run check:fetch`, `npm run check` and `npm run check:apply` afterwards.

### Geography

- `npm run geo:locate` finds each Oregon winery's visitor address on its own website, has Jev confirm which address is the winery's, and geocodes it with the US Census geocoder. Addresses feed the "Nearby tasting rooms" list and nothing else.
- `npm run geo:avas` tests located vineyards against the official AVA boundaries (UC Davis Library, public domain), verifying "located in" connections that match and adding missing ones. Wineries are not tested, since a tasting room can sit far from the vines.
- With "AVA regions" on, vineyards are drawn inside a region for their AVA, nested inside parent AVAs. Wineries stay outside the regions and are joined to the vineyards they own or buy from.

## App structure

- `src/composables/useGraph.ts`: shared state, filters and derived views
- `src/components/GraphCanvas.vue`: the Cytoscape.js graph, toolbar and placement logic
- `src/components/GraphControls.vue`: search, filters and the question box
- `src/components/DetailPanel.vue`: the selected node, its connections, sources and oral histories
- `src/components/GraphList.vue`: the accessible list view
- `src/components/ControlsGuide.vue`: the `?` controls guide
- `src/graph/`: pure helpers (size tiers, overlap removal, placement, icons, text matching), each with tests

The selected node is kept in the URL hash, so `/#david-lett` links straight to a node.

## Ideas for future work

- A timeline or year slider showing the network as it stood in a given year, and a lineage view for mentorship and family.
- Read oral history transcripts for the most important figures; summaries are mined, transcripts are not yet.
- Record source disagreements (founding years, AVA dates) on the record itself, so the choice made is visible.
- More relationship types: AVA petitioners, donors, "sold vines to", regulators.
- Widen coverage beyond the northern Willamette Valley.
- Split the JavaScript bundle; the data and graph library make the single chunk large.
