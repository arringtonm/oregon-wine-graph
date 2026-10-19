# Research brief: finding evidence for draft records

Oregon Wine Graph (this repository) maps how the people, wineries and vineyards of Oregon wine are connected. Every record cites sources. A record becomes verified when the automated check (the decision model Jev) finds that its sources support it. You are given draft records the check could not verify, ranked by how much verifying them matters to readers. For each one, find published evidence, or say that you found none.

## What you receive

An input file of records. Each has:
- `key` (`node:<id>` or `edge:<id>`) and the record's fields
- `claims`: the statements the check judges. `main` is the record's central claim; `details` are the year, role or summary sentences, each judged on its own.
- `category`: why it failed. One of:
  - `unsupported`: no source supports the main claim.
  - `partial:<details>`: the main claim holds, but the named details don't.
  - `conflict`: a source contradicts it (`contradictedBy` lists which).
  - `unreadable`: its sources can't be read.
- `sources`: what the record cites, with how well each scored (`support`, `contradiction`, from 0 to 1).

## What to do

1. Read the claims and the cited sources first. Often the fact is there and the source just needs a clearer companion.
2. Search for published sources that state the failing claim or detail outright. Good sources: the winery's or vineyard's own site (its history or about page), the Oregon Wine History Archive, Oregon Wine Press, The Prince of Pinot, Wine Spectator, Wikipedia, news stories, the Federal Register (for AVAs), and books with an online page.
3. Open every page you propose and confirm it states the fact. Never cite a page you haven't read. Search-result snippets are not enough.
4. For a `conflict`, find out what the record should say:
   - **The record is wrong** and a source states the right fact: propose the correction in `changes`, citing that source in `addSources`.
   - **Sources genuinely disagree about a year:** keep the year the better sources give, and put the others in `alsoDated` (for example `"changes": { "alsoDated": { "founded": [1965] } }`). The site shows this as "1965 or 1966".
   - **Sources disagree about something else:** propose a short `note` saying so, in the house style ("Sources date the founding to 1965 or 1966.").
5. For a `partial` role, a role that no source states can be reworded to what the sources do say ("single-vineyard Pinot noir" rather than an invented title). A year no source gives can be cleared (`null`), but only if your search found nothing.

## Rules

- State only what a source says. Don't guess, and don't fill gaps from memory or general knowledge. Don't turn hedged statements ("reportedly", "I think") into facts.
- Summaries are in our own words: never copy sentences or distinctive phrasing. A proposed summary keeps the record's existing facts unless a source shows one is wrong.
- Private newsletters (Weinnotes) contribute facts only, never wording.
- You may change only: for connections, `role`, `startYear`, `endYear`, `ongoing`, `note` and `alsoDated`; for nodes, `summary`, the year fields (`founded`, `planted`, `born`, `died`, `established`, `closed`, `firstHeld`, `lastHeld`) and `alsoDated`. Never change ids, types or endpoints. If a connection is the wrong kind of relationship, say so in `finding` and propose nothing.
- Never mark anything verified. The check decides, and it writes a correction only if the corrected record is supported by its sources.
- Source titles follow the data's style: `"Page title (Publisher)"`, for example `"About Us (Nysa Vineyard)"` or `"Dick Erath, Willamette Valley pioneer, passes away (Oregon Wine Press)"`.

## Output

Write a JSON array to the output path you're given, with one entry per input record:

```json
[
  {
    "key": "node:eola-amity-hills",
    "addSources": [{ "title": "Establishment of the Eola-Amity Hills Viticultural Area (Federal Register)", "url": "https://..." }],
    "changes": {},
    "finding": "The Federal Register final rule names the petitioners and the 2006 effective date."
  }
]
```

`finding` is one or two plain sentences: what you found, or why you found nothing ("No published source mentions this role; only the winery's Instagram, which can't be cited."). Leave out `addSources` and `changes` when you have nothing. Report the number of records with new sources, with proposed changes, and with nothing found.
