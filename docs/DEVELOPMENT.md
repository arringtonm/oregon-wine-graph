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
- A connection cited only by federal label approvals carries a note that the evidence goes no further than an approved label; `npm run cola:caveats` maintains it (see "Federal label approvals" below).
- Where sources disagree on a year, the field holds one and `alsoDated` the others; never pick one silently or record the disagreement only in a note.
- `verified` stays `false` until a person or the record check confirms the record against its sources. Verified records carry `verifiedBy`: `person`, `jev` or `boundary`.
- People, wineries and vineyards may carry `interviews`: oral history interviews from the Oregon Wine History Archive.
- An edge's `role` is free text and stays as written. On a record's card, the role of a founded, owns, worked at, winemaker, consulted, member of or mentored edge stands in for the verb ("Mark Wisnovsky (co-owner, from 2005)"). Roles of four words or more, and short ones that don't read as titles ("winemaking"), show a short title from `role-titles.json` instead ("operates the winery with family" becomes "operator"). The full role still shows in the verification note, flags and admin mode. New long roles need a title, and `npm test` lists any missing: run `npm run roles:titles`, which has Jev pick from each type's vocabulary (`src/data/roleTitles.ts`) into `tools/roles/proposals.json`, then review the picks and add them to `role-titles.json`.

After adding records, run `npm run audit:duplicates`: it lists records whose names match once case, accents, common words and nicknames are set aside (Mikey and Michael Etzel), for a person to look over. Same-named pairs are often different records (a father and son, a winery and its estate vineyard), so it's a report rather than a test. A connection stored twice, including a two-way family link stored from both ends, does fail `npm test`.

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

`npm run check:calibrate` measures the risk: it breaks one fact in each of about 400 passing records and counts how many still pass. At the threshold in use (0.9) that was 1.0% on 18 October 2026. Relationship swaps are drawn only from relationships that would be false (not one the two already have or one that follows from it, such as a founder working at their winery). For connections the check also asks whether each source states this relationship or only a different one between the two, and discounts a source that describes only another (`RELATIONSHIP_FIT` in `decide.ts`); without that, 12% of false swaps passed. `-- --images` calibrates the bar for records supported only by label images. `npm run check:apply -- --undo` unverifies everything Jev verified.

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

The graph opens with a saved arrangement (`src/data/layout.json`), so it appears without laying the graph out in the browser. Nodes added since the last save are placed beside their connections as the page loads, so new data doesn't need a new layout. The file changes only on purpose: run `npm run layout:reset` and reload the dev server, which lays the graph out afresh and saves it; review the new opening view and commit it. Reset, guides and filters never save. For a gentler refresh that keeps every position, open the dev server at `/?tidy-layout`: it places nodes added since the last save, nudges apart every overlapping node and label, and saves, so readers' browsers only untangle the few nodes around anything newer. Do this whenever several records have been added; Reset returns readers to this saved arrangement. A test in `src/data/data.test.ts` fails once the layout covers less than 95% of the opening view; that is the time to refresh it, before the app's 90% threshold falls back to laying the graph out in every reader's browser.

Filter changes never re-run the force layout: hidden nodes are removed and returning ones go back to their remembered positions. Labels are measured in Nunito, so the layout waits for the font to load. `.claude/skills/graph-layout/SKILL.md` records the visualization practices, the measurements behind them, and a console harness for measuring layout changes.

## Design tokens

Colours, radii and shadows are CSS custom properties in `src/style.css`, defined for light and dark themes. The "cellar" palette pairs a burgundy accent (`--accent` for text and focus, `--fill`/`--on-fill` for filled surfaces) with node colours drawn from wine: claret wineries, vine-green vineyards, Chardonnay-gold people and warm-grey organizations, events and AVAs. Node colours keep at least 3:1 contrast and stay distinguishable under simulated protanopia, deuteranopia and tritanopia. The graph's node silhouettes (`src/graph/icons.ts`) read the same tokens. On wide screens the graph runs under both sidebars, which are translucent with a backdrop blur; `--inset-left` and `--inset-right` (set in `App.vue`) keep the toolbar, controls guide and list view clear of them, and fitting and centring use the visible middle area.

## Versions

The site shows its version and build date under the filters: "v1.00 · Oct 15, 2026". The version comes from `package.json` (major.minor; the patch number is unused) and is formatted by `tools/siteVersion.ts`. Its "Release notes" link opens the commit the site was built from on GitHub, whose message describes the release, and every flag records both, as "v1.00 (4fa3696)", so a report can be matched to exactly what the reader saw.

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

## Search and sharing

Every record has its own address, `oregonwine.app/<id>` (e.g. `/david-lett`), so search engines can index each one and shared links preview the right record. The app keeps the address in step with the selection (`showAddress` in `useGraph.ts`), and old `#<id>` links still open their record and move to the new address.

- **Record pages.** After `vite build`, `tools/seo/prerender.ts` writes `dist/<id>.html` for every shown record (not hidden types), which Cloudflare serves at `/<id>`. Each is the built `index.html` with its own:
  - title and description (the summary, cut to about 155 characters);
  - canonical address;
  - Open Graph and Twitter share tags;
  - schema.org data (`Person`, `Winery`, `Place` or `Organization`);
  - the record as plain HTML inside `#app`, with its connections linking to their pages, for search engines and readers without JavaScript. The app replaces it when it starts.

  The page content comes from `src/seo/recordPage.ts`, which uses the same words as the card (`src/graph/format.ts`). The build stops if a record id would clash with one of the site's files.
- **Guide addresses.** Each guide (`src/graph/views.ts`) lives under `/guides/`, so no record id can collide with one, and readers' own guides can join them later.
  - `/guides/<guide>` shows the guide. The build writes `dist/guides/<guide>.html`, with the guide's title and blurb, its own canonical address, share tags and the records it picks as links.
  - `/guides/<guide>/<id>` shows the guide with a record open; closing the record returns to `/guides/<guide>`. It isn't a page of its own: the Worker serves the record's page (`worker/guides.ts`), so its canonical is `/<id>` and search engines see one page per record.
  - Changing a filter ends the guide, and the address drops it. Old `/?view=<guide>` links move to `/guides/<guide>`.
  - `guides` is reserved: the build stops if a record id takes it.
- **Sitemap.** The build writes `dist/sitemap.xml` (the home page, every guide and every record page, with the build date), and `public/robots.txt` points to it.
- **Share image.** `public/og.png` (1200×630) is used for every page for now.
- **Search Console.** Add `oregonwine.app` to Google Search Console and submit `https://oregonwine.app/sitemap.xml` once; Google rereads it after that.
- **Testing locally.** `vite preview` doesn't serve `/<id>` from `<id>.html`, or guide addresses as Cloudflare does; `npm run build && npx wrangler dev` does both.

## Deploying (Cloudflare Worker, oregonwine.app)

The site is one Cloudflare Worker, `oregon-wine-graph`, configured by `wrangler.toml`. Cloudflare serves the built `dist/` as static assets (free, unlimited); only `/api/*` and `/guides/*` run the code in `worker/`:

- `/guides/*` (`worker/guides.ts`): a guide's page as a file; a guide with a record open is served the record's page.
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

### Verifying drafts by research

Drafts the check can't verify are worked through in order of what verifying them does for readers: a draft node hides every connection it is part of when "Verified records only" is on, so nodes hiding the most verified connections come first.

```sh
npm run verify:queue                       # rank drafts, with why each fails -> .cache/verify/queue.json
# research agents follow tools/verify/BRIEF.md, ten records each, writing .cache/verify/round-N/output-*.json
npm run verify:apply -- .cache/verify/round-N/output-*.json
npm run check && npm run check:apply && npm run cola:caveats
```

`verify:apply` always keeps new sources. A proposed correction (a year, role, summary, note or `alsoDated`) is written only when Jev, reading the record's sources including the new ones, supports the corrected record at 0.9 with no source contradicting it; each one is logged in `tools/verify/corrections.json`. Records research found nothing more for go to `tools/verify/dead-ends.json`, and later queues skip them.

Where sources give different years, the record keeps one in the year field and the others in `alsoDated` (`"alsoDated": { "founded": [1965] }`); cards read "1965 or 1966" with an ⓘ, and the check accepts a source giving any of them. `npm run check:fetch -- --failed` retries unreadable pages, falling back to the Internet Archive's newest copy, and PDFs are read as text.

### Federal label approvals (TTB COLA)

Every US bottler files each label with the Alcohol and Tobacco Tax and Trade Bureau before selling the wine. The [Public COLA Registry](https://ttbonline.gov/colasonline/publicSearchColasBasic.do) is public domain but has no API or bulk download, and publishes no rate limits. `tools/cola/registry.ts` therefore makes one request every two seconds over one connection, backs off on errors, stops after three failures in a row, and caches everything under `.cache/cola/`, so any stage can be stopped and resumed.

```sh
npm run cola:search    # brand searches for each winery; accepted permits and approvals -> tools/cola/wineries.json
npm run cola:details   # each approval's printable form (fields and label file names)
npm run cola:read      # Jev reads which vineyard the labels name -> tools/cola/labels.json
npm run cola:build     # research file: AVAs from the forms, vineyards from the labels
npm run discover:merge -- .cache/cola/research.json
npm run cola:caveats   # after each merge and each check:apply
```

- **Matching.** A winery's approvals are those under an Oregon permit whose brand is the winery's own name (or an also-known-as name). Brands that only contain the name, such as collaborations bottled by another winery or misspellings, are listed under `related` in `wineries.json` for a person to look over. Approvals from before electronic filing (8 or 9 digit ids) have no form or images and are skipped.
- **Reading labels.** The vineyard is usually named only in the label artwork. `cola:read` reads labels in priority order (file names that name a known vineyard, then ones with a vineyard word, then ones with some other distinctive word) and only each wine's newest and oldest approval. Jev chooses among likely vineyards, "a vineyard not listed" and "no vineyard"; it can't write text, so a vineyard with no record is left as `needsName` until a person reads the label and sets `newVineyard` in `labels.json`. Readings under 0.9 are kept but not used.
- **Checking.** `check:fetch` caches a cited approval as its form text plus its label images, and `npm run check` sends the images to Jev with the text. Image reading is an early-stage Jev feature, so records supported only by images are held to `IMAGE_THRESHOLD` in `tools/check/decide.ts`, calibrated with `npm run check:calibrate -- --images` (0.9 on 18 October 2026: no false approvals among 38 corrupted label claims, a small sample), and their note says they were checked this way.
- **Caveats.** An approval shows a wine was planned, not sold. `cola:caveats` notes this on every connection cited only by approvals, notes when a verification rested on label images alone, and removes either note when it stops being true; a data test enforces the first.
- **Citations** link to the approval's detail page, which opens without a session. Never store the applicant's phone number or the filer's name.

### WineEnthusiast reviews (OpenML 42074)

`npm run openml:reviews` downloads the [dataset](https://www.openml.org/d/42074) (about 150,000 reviews scraped in June 2017, CC BY-NC-SA 4.0) and keeps four fields of each Oregon review: winery, designation, region and variety. The reviewers' writing, scores and prices are never read. Its research file links wineries to AVAs and to vineyards already in the graph; vineyards with no record go into its notes as leads, and wineries with no record into `.cache/openml/unmatched-wineries.json`. Records cite the dataset page, and the record check reads the same four fields.

### Adding records from a source

`tools/discover/BRIEF.md` sets out the conventions for turning a source into records: what to cite, how to model wineries and vineyards, and what never to guess. Research output goes to a file under `.cache/`, and `npm run discover:merge -- <file.json> ...` folds it into the data: existing nodes and relationships gain only sources, connections to unknown nodes and orphan nodes are dropped, and the whole graph is validated before anything is written. Run `npm run check:fetch`, `npm run check` and `npm run check:apply` afterwards.

### Geography

- `npm run geo:locate` finds each Oregon winery's visitor address on its own website, has Jev confirm which address is the winery's, and geocodes it with the US Census geocoder. Addresses feed the "Nearby tasting rooms" list and nothing else.
- `npm run geo:avas` tests located vineyards against the official AVA boundaries (UC Davis Library, public domain), verifying "located in" connections that match and adding missing ones. Wineries are not tested, since a tasting room can sit far from the vines.
- With "AVA regions" on, vineyards are drawn inside a region for their AVA, nested inside parent AVAs. Wineries stay outside the regions and are joined to the vineyards they own or buy from.

## App structure

Before committing a change readers will see, run the UX audit in `.claude/skills/ux-audit/` (Nielsen Norman Group heuristics, visual hierarchy, icon usability and severity ratings, against the site's baseline and recorded design decisions). Its `capture.sh` screenshots the production build at every width in light and dark.

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
