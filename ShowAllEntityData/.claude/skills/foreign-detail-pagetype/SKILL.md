---
name: foreign-detail-pagetype
description: Build a release-tracks-style DETAIL pageType on a non-MusicBrainz site in ShowAllEntityData — one entity's own page (an archive.org item, a Discogs release or master, a setlist.fm setlist, …) laid out like MusicBrainz's release page — a sub-table per disc/record/set, credits or notes as columns, and above the tables the shared head (byline, a text section, Details cards, pictures). Use whenever the user asks to "model it after release-tracks", "add a Tracks/Setlist view to the X page", "make the <site> detail page look like a MB release", "upgrade dg-<x> like dg-release", hands over snapshots of a foreign site's single-entity page, or asks for cards such as Community/Credits/Set times above such tables. For a LIST page or a link reader use add-foreign-page-or-reader; for previews missing on a foreign page use foreign-preview-scope.
---

# A foreign detail page, laid out as release-tracks

Distilled from four builds, each tested live by vzell: `ia-details`
(archive.org item, 2026-11-03), `dg-release` Tracks (2026-11-04),
`dg-master` Tracks (2026-11-04), `sfm-setlist` (setlist.fm, 2026-11-04).
Plans and their answers: `org/foreign-detail-PTs.org`, `org/discogs.org`
("the discogs master release PT"). Read `docs/claude/<site>.md` and the
add-foreign-page-or-reader skill first: everything there (gates, `host:`,
`@include`, placement, fixtures, the coverage registry) applies here too.

## 1. Plan, mockup, questions — before code

- Ask for snapshots saved from the user's browser into `debug/`, several
  SHAPES, not one page: for setlist.fm they were a named set, an unnamed
  break, an encore, a tape, a festival, guests, a page with no songs yet
  (`.emptySetlist`). List the shapes no snapshot shows (segue, two encores)
  in the plan and in the report — never guess their markup.
- Mockup with real fixture data, published as an Artifact
  (`org/<topic>-mockups.html`; images inlined by
  `scripts/build-mockup-artifact.py` from a
  `<script type="application/json" id="mockup-images">` block, the source
  carrying `SKELETON-END` and `<!--EMBED-->`). One tab per view, a notes
  column beside each, a last tab "Plan and questions" with a recommendation
  per question. Record the link, the questions and the answers (dated, the
  user's words) in the org plan.
- Typical questions: replace the view or add one (dg-release: the Tracks
  view first, today's view as the second button); which columns; what goes
  in the right-hand Details column; an extra request for a nice-to-have
  (answer may be "configurable": a setting of its own, `default: true` per
  the non-MB rule); where videos go.
- The user's list may contain a slip (the same TODO named twice): say which
  item you took and why, in one line, and go on.

## 2. Where the rows come from

| Source | When | How |
|---|---|---|
| The site's API, one record | Discogs, archive.org | `features.pageRequest` → `{url, fetchText: () => _dgFetchText(url), toHtml}`; `pageCountAsync` keeps the answer in `_dgTexts` so the loop does not ask twice |
| The live page itself | setlist.fm (server-rendered, the whole list in the page) | `fetchText: async () => document.documentElement.outerHTML` — the engine's "never the live document" rule is about a site's PAGER; a page without one may hand over its own HTML: no request |
| Numbers only the page shows | Discogs' Statistics/For Sale boxes (`#release-stats`, `#master-statistics`, `#shopping-box-host`) | a reader of the live DOM by LABEL (`_dgLiveStats(box)`, `_dgLiveMasterSale()`), read when the head is built; on a disk load they are missing — say so in the docs |

- Probe before building, across the whole catalogue: a
  `scripts/probe-<site>-<what>-shapes.py OUT [N]` that SAVES every answer
  (`<kind>-<id>.json`) and prints one line per entity (positions' shapes,
  headings, credits, which fields the kind lacks). Sorting trap: a list
  sorted by year fills the first pages with early singles — read every page
  and sample a spread, with the named shapes (box sets, double albums)
  first. Anonymous, at the site's rate.
- Then run the SHIPPED code on the saved answers, not a reimplementation:
  `scripts/check-dg-release-media.js DIR` pulls `_dgReleaseMedia()` and its
  helpers out of the userscript (`grab()` + `vm`) and prints each entity's
  media. It found "Stars On 45" in 147 tables (medley parts "1a", "1b" each a
  new disc) — a fix for releases too.
- Wrap chosen answers as fixtures (`scripts/wrap-dg-release-fixtures.py
  PROBE ID|master-ID|master-ID-versions-p1`); pages through the site's
  builder (`scripts/build-setlistfm-fixtures.py` `SETLIST_TARGETS`: keep
  only the blocks the code reads, in the site's own container chain).

## 3. The pageType

- Buttons: the new view first (`features: { dgView: 'tracks' }`), the old
  one second with its own `dgView`; `description` getter naming the request
  cost (and the setting that changes it); `showIf` on the LIVE page to hide
  a button with nothing to show (`_sfmSetlistHasSongs()`).
- `tableMode` is per PAGE, not per button: a page whose new view has
  sub-tables becomes `multi` + `groupByH3`, and the old single-table view
  then needs an `<h3>` — the SAME heading on every fetched page ("Versions"),
  or each page becomes a sub-table of its own.
- Rows: `<h3>name</h3><table class="tbl" data-mb-col-headers='[…]'>`
  (`_dgTableHtml()`). Several names in a cell: `<ul><li>` +
  `collapsableColumns`. A number column: `integerColumns`. Play: the
  YouTube-search tile `_ytTileHtml({ src: 'yts', kind: 'video', id: '',
  list: '', q }, { bare: true, title })`, only when `_ytOn()`.
- Naming media/sets: as the site names them, else a word + number ("Disc
  1", "Record 1", "Set 3" — N counting EVERY set, named or not); a vinyl
  record's two sides are ONE table (MusicBrainz's medium); a duplicate name
  gets " (2)". Numbering continues across sub-tables when the site numbers
  that way; a tape is not numbered.
- A toHtml that finds nothing throws (`{ status: 0 }`): the run records a
  failed page, never "no rows".
- An extra request for the head (Discogs master's number of versions) goes
  in `pageCountAsync`, wrapped so a failure costs the fact, not the view,
  behind its setting: schema entry, then `scripts/dump-config-defaults.py`,
  `scripts/audit-config-defaults.py`, `scripts/dump-default-history.py`.

## 4. The head: `_fdHeadInsertSections()` and a spec function

Add `if (t === '<type>') return _<site>HeadSpec();` to `_fdHeadSpec()`.
The engine calls `_fdHeadInsertSections()` before `makeH2sCollapsible()` in
both tails (fetch, disk load); nothing else to wire. The spec:

```js
{ root, h2,                                 // our section, its data <h2>
  sub: { what, by, byHref, when },          // "~ Setlist by X (date: venue)"
  text: { title, body, html },              // starts closed; html = escaped converter output
  facts: [ … ],                             // left column ('rail')
  others: [ … ],                            // right column ('main')
  pictures: [{ full, thumb, caption, types, front }], picturesTitle,  // or pictureGroups: [{ title, pictures }]
  title, source }                           // viewer bar; the cards' hover text
```

- A facts/others entry is `[key, name, [[label, value]]]` (empty values
  dropped; a value may be a Node: `_fdLink(href, text)` opens a new tab),
  `[key, name, [left, right], { twoCol: true }]` (two lists side by side,
  one under the other on a narrow card; one list when a half is empty), or
  a built card `[key, name, count, body, wide]` (`_fdPills()`, `_fdChips()`,
  a `dl`). Falsy entries are skipped, so `cond && [...]` works.
- Link values as the SITE links them (a label to its page, a year to the
  search) — vzell's live tests asked for that every time. Numbers as the
  site writes them (`toLocaleString('en-US')`).
- Long cards (identifiers, credits by person) go right; the entity's facts,
  links, genres, community left, community last.
- Return null on another view or before the record: the head belongs to the
  new view only.
- Pictures become an ART SECTION on their own (`_fdArtSection()`, since
  2026-11-06, org/image-handling.org P1): the Cover art section's chips,
  Grid / By type and viewer. Give every picture `types` — the site's own
  kind (Discogs' Primary/Secondary) or one guessed from what the page names
  it (`_iaPictureTypes()`), else the chip says "(no type)" — and `front:
  true` on the one the site calls its main image (★). `caption` is the
  comment under the type; one that only repeats the type is not printed.
  `pictureGroups` makes one section per group. Nothing else to wire: card,
  click, Space and the viewer come with the section.

## 5. Tests and mutations

- One spec per pageType (`tests/fixtures/<site>-<kind>-tracks.spec.js`),
  helpers copied from `discogs-master-tracks.spec.js`/`sfm-setlist.spec.js`:
  `apiLog` (`__gmXhrLog`) or `page.on('request')` for same-origin; `h3s`
  (text nodes only); `heads`; `items(table, pos, col)`; page-only boxes
  injected with `page.evaluate` before the press.
- Pin: the request count; the sub-table names; columns; a cell per column
  kind; the head's column order and card rows; a link's href; the empty
  case; each shape from the probe (one fixture each).
- Data traps met: a credit shows the name VARIATION ("Charles Calello",
  not "Charlie"); an h2's text starts with its fold glyph ("▲Note": match
  `/Note$/`); a master with videos adds a "Videos" sub-table.
- Mutations `scripts/mutations/<site>-<kind>.json`, one per guard. A
  survivor is a spec gap: add an assertion where the data can show it
  (guest order needs a page with several guests). If no snapshot can show
  it, record `"expect": "pass"` with a why — never invent markup.
- After touching shared code, check EVERY mutation list's `find`s against
  the file (a script counting occurrences; compare with `git stash` to see
  only your breakage) and repoint the broken ones, then run them.
- Run the site's specs and the specs of every page that shares the code
  (`tests/fixtures/discogs- …`, `sfm- …`, `ia-details`, `sl-include-regex`)
  through `scripts/run-test-full.py --script test -- <paths>`.

## 6. Bookkeeping, branch, hand-over

- HELP (the site's `<details>`), `docs/claude/<site>.md` (pageType table
  row + a section with the shapes, the probe, the fixtures, the tests),
  `PAGETYPES-TESTING-REFERENCE.org` (roster row + entry), the coverage
  registry row (`mode` too), CLAUDE.md's doc-map row, `WIP.N` entries (a
  fix found on the way gets its own), the org plan's "built" section with
  the Env stamp. Checks: `build-coverage-report.py --check`,
  `lint-summary.py --check`, `audit-docs.py`, `verify-doc-crossrefs.sh`,
  `node --check`, no trailing whitespace.
- Work that touches the shared head or the WIP file goes on a branch
  STACKED on the open one (no conflicts at merge); say so.
- Report: what it shows, where it differs from the mockup and why, what is
  left out, how it was checked, URLs to try. Commit and push only on the
  user's word after their live test; the merge only on their word (one
  `test:full` at the end of a stack; a failure is rerun alone with
  `--repeat-each 3` and, if it persists, run on `main` in a scratch
  worktree before blaming the branch).
