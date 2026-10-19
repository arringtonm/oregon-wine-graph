# Research brief: adding records to Oregon Wine Graph

Conventions for anyone, person or agent, turning a source into new graph records. Oregon Wine Graph (this repository) maps how the people, wineries and vineyards of Oregon wine are connected.

## Read first

- `src/data/schema.ts`: the record shapes (strict: unknown fields are rejected), the six node types, and `EDGE_RULES`, which fixes each connection type's direction and allowed endpoint types.
- `src/data/nodes/*.json` and `src/data/edges.json`: the existing records. Load every existing node id, name and `aka` before starting, so nothing is created twice. Match their style: summary length and tone, `sources` objects, edge ids of the form `source--edge-type-with-hyphens--target`, with `-2` for a second connection of the same type between the same pair.

## Output

Write one file, `{ "nodes": [...], "edges": [...], "notes": ["..."] }`, to the path your task gives (under `.cache/`). Never edit anything under `src/` or elsewhere in the repository. The lead merges the file with `tools/discover/merge.ts` and runs the checks.

`notes` holds plain strings for the lead: conflicts and which value you chose, things left out and why, likely duplicates you were unsure about. Keep it short.

## Accuracy

- Every node and every connection cites at least one source `{ "title", "url" }` that states that fact. Put the source on the connection it supports, not only on the node.
- State only what the source says. An empty optional year is fine; a guessed year is not. Do not fill gaps from memory or general knowledge.
- Do not turn hedged or second-hand statements ("I think", "reportedly") into records.
- Set `"verified": false` on everything. Never set `verifiedBy`.
- Years are integers. Where sources give different years for the same fact, put the year the better sources give in the field and the others in `alsoDated` (`"alsoDated": { "founded": [1965] }`); don't pick one silently. `ongoing: true` only when the source says the relationship still holds, and never with `endYear`.
- Summaries: one or two factual sentences in your own words. Never copy sentences or distinctive phrasing from a source.
- A federal label approval (ttbonline.gov) shows that a wine was planned, not that it was sold. Cite the approval's detail page (`viewColaDetails.do?action=publicDisplaySearchBasic&ttbid=…`), never the applicant's phone number or the filer's name; the caveat note is added by `npm run cola:caveats`, not by hand.
- From the OpenML WineEnthusiast dataset (42074), use only a review's winery, designation, region and variety: never the review text, score or price.

## Modelling

- A winery and a vineyard are separate nodes even when a business is called "X Vineyards". Create a `vineyard` node only for a specific named planted site; link it with `owns` (role "estate vineyard") or `sources_from`.
- `located_in` (vineyard → AVA) is for a vineyard's physical place only. A winery never gets `located_in`; for the AVAs a winery makes wine from, use `draws_from` (winery → AVA), as many as the source supports.
- Family: `family` with role "spouse", "parent" (parent as source) or "sibling", only when the source states the relationship.
- Use `role` for detail ("assistant winemaker", "vineyard manager", "co-founder") without repeating the connection type.
- Use a connection type only for what it literally means: an informal suggestion is not `consulted`; "learned from" is `mentored` only if the source describes a mentor or training relationship.
- People and businesses based outside Oregon get `"outsideOregon": true`.
- A business that makes wine is a `winery`; a restaurant, shop, distributor, school or trade body is an `organization` with the right `kind`. Include people and organizations outside winemaking only when they connect to wineries, vineyards or winemakers in the graph.
- Every node you create must have at least one connection.
- Ids are kebab-case ASCII slugs of the name as the person or business uses it (`belle-pente`, not `belle-pente-vineyard-winery-llc`).

## Before finishing

Check every connection's endpoint types against `EDGE_RULES`, that every referenced id exists (in the data or in your file), that no new id duplicates an existing entity under another slug, and that the file is valid JSON matching `nodeSchema` and `edgeSchema`. Report node and edge counts and the `notes`.
