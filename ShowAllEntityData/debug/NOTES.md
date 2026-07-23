## 2026-07-01 — report pages

- `reports_index.html` (/reports): has `div#content`. `<h1>Reports</h1>` then
  14x `<h2>Category</h2><ul>...</ul>` (117 report links total, categories:
  Artists, Artist credits, Events, Labels, Release groups, Releases,
  Recordings, Places, Series, Works, URLs, ISRCs, ISWCs, Disc IDs). No table,
  no pagination — complete single-page list.
- `report_filter0.html` (/report/ArtistsThatMayBeGroups?filter=0): NO
  `div#content`. `<h1>{title}</h1>`, a `<ul>` description block (explanation,
  "Total X found: N", "Generated on ... UTC", link to `?filter=1`), then
  `<nav><ul class="pagination">` (standard MB pagination: numbered
  `page=N` links + `Next`), then native `<table class="tbl"><thead>` with 2
  columns (Artist, Type). 62 pages, ~6118 rows total.
- `report_dup.html` (/report/DuplicateArtists?filter=0): table class
  `"tbl mergeable-table"`, wrapped in `<form action="/artist/merge_queue"
  method="post">`. Extra leading blank `<th class="check">` with a per-row
  `<input type="checkbox" name="add-to-merge">`. Then Artist / Sort name /
  Type columns. 2941 pages.
- `report_collab.html` (/report/CollaborationRelationships?filter=0): 2
  columns (Collaboration, Collaborator), one `<th>` has `width="150px"`. 15
  pages.
- `report_deprecated.html` (/report/DeprecatedRelationshipArtists?filter=0):
  3 columns (Relationship type, Artist, Type). 121 pages.
- Column sets vary per report (117 distinct reports, 14 categories) with no
  observed integer/score columns — the `report-detail` page definition is
  column-agnostic (no `columnExtractors`/`stickyColumn`/`extractMainColumn`).
- The `mergeable-table` checkbox column (DuplicateArtists and similar
  "possibly duplicate ..." reports) renders but is inert once consolidated —
  the native `<form>` is not carried over into the rendered table.

## 2026-07-20 — report-detail CAA/EAA + Annotation h2 corruption (branch fix/report-detail-annotation-h2)

Investigated `report-detail.org`'s three symptom groups plus a
user-supplied pair of `search`-page snapshots. Snapshots used:
`release-CAA-stripe-1.html`, `release-group-CAA-stripe-1.html`,
`release-no-big-picture-stripe-1.html`, `release-no-big-picture-stripe-2.html`,
`release-group-no-big-picture-stripe-1.html`, `event-no-big-picture-stripe-1.html`,
`place-no-H2-1.html`, `release-no-H2-1.html`,
`event-no-big-picture-stripe-CAA-indicator-1.html`,
`release-group-CAA-EAA-stripe-1.html`, `search-annotation-original.html`,
`search-annotation-rendered.html`.

- **Groups 1+2 (fixed)**: `_artCountLinks`/`_artInitBigPics` scanned the
  whole row for entity links, excluding `.mb-sticky-col` cells under a false
  assumption that the sticky column is a cloned duplicate
  (`applyStickyColumn` never clones — it applies sticky CSS to the existing
  `<td>` at the resolved index, default 0). On report-detail pages the
  primary entity column is often column 0 → becomes sticky → its links were
  invisible to the scan → no button/stripe. The scan also was never
  restricted to the column actually named by `addCAA`/`addEAA`, so stray
  entity-shaped links inside free-text `Annotation` cells produced
  wrong/spurious CAA-vs-EAA indicators. Fixed via new
  `_artEntityAnchorSelector()` helper, scoped strictly to
  `activeDefinition.type === 'report-detail'` — no other page definition's
  behavior changes.
- **Group 3 (root cause confirmed and fixed)**: `AnnotationsPlaces` and
  `AnnotationsReleases` render with no discoverable "Report" `<h2>`. Live
  debug logs supplied by the user (`no-h2-places.debug`, `no-h2-releases.debug`,
  captured with `sa_enable_debug_logging` on) show the actual mechanism:
  `applyInsertH2: inserted <h2>"Report"</h2> before first <h3> in content
  area.` — i.e. `applyInsertH2`'s **second preference** branch fired, meaning
  `_contentRoot.querySelector('h3')` found *some* `<h3>` at page-load time
  (before any DOM pre-processing), unlike the working
  `AnnotationsEvents`/`AnnotationsReleaseGroups` pages where the log showed
  the h2 landing via the third preference ("after first `<h1>`", no h3
  found). Later, `updateH2Count`'s target search failed even though the
  self-heal (WIP.1) confirmed the h2 still exists
  (`applyInsertH2: <h2>"Report"</h2> already present — skipping
  (idempotency).`): `Stopping H2 search at index 0: table no longer follows
  this header. / Failed to identify a target H2 header for count update.`
  — the table does *not* come after this h2 in document order. Conclusion:
  the `<h3>` `applyInsertH2` anchored to is a **wiki-rendered heading nested
  inside a table.tbl cell** (`=== Heading ===` markup in an Annotation cell
  on the report's native first page — the h3-level sibling of the h2-in-cell
  pattern already confirmed for `search-annotation-original.html`, see
  below). Inserting `beforebegin` that h3 placed the new "Report" h2 as a
  sibling *inside that same `<td>`*, after the table — not at the page
  level. Fixed by excluding `h.closest('table.tbl')` matches from
  `applyInsertH2`'s h3 search (same pattern as the
  `_relocateTrailingH2Sections` fix below); applied universally, not
  report-detail-scoped, for the same "no page type legitimately relies on a
  table-nested h3" reasoning. The report-detail-scoped self-heal from WIP.1
  (re-invoking `applyInsertH2` at the top of `updateH2Count`) stays in place
  as a defensive backstop.
- **`_relocateTrailingH2Sections` corruption bug (fixed, generic)**: MB
  renders user-submitted Annotation wiki text with literal `<h2>` headings
  when the source uses `== Heading ==` markup (confirmed in
  `search-annotation-original.html`, pre-script). `_relocateTrailingH2Sections()`
  scans `#content` for `h2` at any depth, including ones nested inside
  `table.tbl` cells, and — since it treats every h2 "after" the real data
  h2 as a page-level trailing section to relocate — physically ripped each
  matching row's in-cell h2 (and its following sibling paragraph) out of
  the `<td>` and dumped it before the page header. Verified in
  `search-annotation-rendered.html`: all 148 in-cell h2s ended up
  clustered before the main header, zero remained inside the table
  afterward. Same bug corrupts report-detail's `AnnotationsEvents`/
  `AnnotationsReleaseGroups` Annotation columns (ruled out as the Group-3
  cause since that failure is already observable earlier, before
  `finalCleanup()`/`_relocateTrailingH2Sections()` ever run). Fixed by
  excluding `h.closest('table.tbl')` matches from the candidate set — not
  scoped to report-detail, since no page type intentionally has a
  legitimate page-level h2 living inside `table.tbl`.
## 2026-07-22 — account-applications page type

- `applications.html` (`/account/applications`): NO `div#content`. Flat
  structure directly under `div#page.fullwidth`: `<h1>Applications</h1>`,
  `<h2>Authorized applications</h2>`, intro `<p>`, native
  `<table class="tbl"><thead>` (columns: Application / Access / Last granted
  token / Actions, one row per authorized third-party app, "Actions" holding
  a "Revoke access" link), then `<h2>Developer applications</h2>`, two intro
  `<p>`s (one is "You do not have any registered applications." when the
  editor has none — no table rendered in that case). Both `table.tbl` and
  their labelling `<h2>` are direct siblings under `div#page` (no
  intermediate sub-wrapper like `user-tags`' `div#all-tags`), so
  `renderGroupedTable`'s generic re-root fix is a no-op for this page. Single
  static page, no pagination markup observed. Snapshot captured with zero
  registered developer applications — the "Developer applications" table's
  column set (when the editor has registered apps) is unconfirmed; the
  `account-applications` page definition intentionally carries no
  `columnExtractors` so it stays column-agnostic like `user-collections`.

- **RESOLVED (false alarm): `AnnotationsEvents` apparent CAA/EAA regression**
  — `debug/AnnotationsEvents.html` was captured against a stale, not-yet-reloaded
  copy of the userscript (tested without reloading after the WIP.1 fix
  landed), not a real regression. Confirmed by the user on retest. The
  diagnostic `Lib.debug(ctx.key, ...)` logging temporarily added to
  `_artEntityAnchorSelector()` was removed again once this was confirmed.

## 2026-07-23 — five new page types (branch feature/new-page-types-elections-genres-cdstub-edittypes-instruments)

- `auto-editor-elections.html` (`/elections`): NO `div#content` — `div#page`
  directly. `<h1>Auto-editor elections</h1>` immediately followed by a single
  native `<table class="tbl">` (Candidate / Status / Start date / End date /
  Proposer / 1st seconder / 2nd seconder / Votes for / Votes against / blank
  "View details" column). No native h2, no pagination markup — 303 rows, the
  complete election history on one page. `pageType: 'auto-elections'`,
  `tableMode: 'single'`, `non_paginated: true`, synthetic `insertH2`.
- `genre-list.html` (`/genres`): HAS `div#content`. `<h1>Genre list</h1>`, two
  intro `<p>`s, then one bare `<ul>` (no id, no class) of 2176
  `<li><a href="/genre/UUID"><bdi>name</bdi></a></li>` genre links. No h2
  sections, no pagination. `pageType: 'genres-list'` reuses Structure G
  (previously scoped only to `artist-credit-entity`'s "plain ul, no id/class"
  detection) with a fixed literal column name `"Genre"` instead of a
  URL-derived one. `tableMode: 'single'`, `non_paginated: true`.
- `cd-stub.html` (`/cdstub/browse`): NO `div#content` — `div#page` directly.
  `<h1>Top CD stubs</h1>`, native `<nav><ul class="pagination">` (2710 pages,
  "Found 270,951 results"), then native `<table class="tbl">` (Title / Artist
  / Lookup count / Modify count). Every real data row is immediately followed
  by a second `<tr><td class="lastupdate" colspan="4">Added N years ago, last
  modified M years ago</td></tr>` row — single cell, `colSpan=4`. Confirmed
  this needs **no new code**: the generic single-table row-extraction in
  `startFetchingProcess` (~line 28208) already guards with `(cells.length > 1
  || (cells.length === 1 && cells[0].colSpan <= 1))`, so any single-cell row
  with `colSpan > 1` is skipped automatically. `pageType: 'cd-stub'`,
  `tableMode: 'single'`, paginated (native pagination present, no
  `non_paginated` flag), synthetic `insertH2`.
- `edit-types.html` (`/doc/Edit_Types`): HAS `div#content` (class
  `"wikicontent"`). `<h1>Edit types</h1>` immediately followed by 17 native
  `<h2>Category</h2><ul>…</ul>` sections (Area, Artist, Event, Genre,
  Instrument, Label, Medium, Place, Recording, Relationship, Release, Release
  group, Series, URL, Wiki documentation, Work, Historic) — every `<ul>` is
  the immediate next sibling of its `<h2>`, no pagination. Structurally
  identical to `reports-index`'s existing Structure J (repeated h2+ul
  category sections after `renameH2ToH3`) except the column name should be
  the h3 text itself (e.g. "Area") rather than `reports-index`'s fixed
  literal `"Report"` — the category IS the entity type of every row in it.
  Extended Structure J's `if (pageType === 'reports-index')` guard to also
  accept `'edit-types'` and `'instrument-list'`, parameterizing the column
  name instead of duplicating the loop. `pageType: 'edit-types'`,
  `tableMode: 'multi'`, `non_paginated: true`.
- `instruments.html` (`/instruments`): HAS `div#content`. `<h1>Instrument
  list</h1>` immediately followed by 8 native `<h2>Family</h2><ul>…</ul>`
  sections (Wind instrument, String instrument, Percussion instrument,
  Electronic instrument, Other instrument, Ensemble, Family, Unclassified
  instrument; 1081 `<li>` total), no pagination. Each `<li>` holds a name
  link, an optional `<span class="comment">(short desc)</span>`, and a longer
  free-text description after an em dash — e.g. `<a><bdi>accordina</bdi></a>
  <span class="comment">(<bdi>harmonica/accordion hybrid</bdi>)</span> —
  Harmonica/accordion hybrid where…`. MVP keeps all three glommed into one
  cell via the same generic `li` → `td` child-node copy every Structure J/G
  section already uses; splitting into separate Name/Comment/Description
  columns would need a new extractor plus per-family `entityFeatures` (8
  families) and was explicitly deferred by the user. Shares the same
  Structure J extension as `edit-types` above. `pageType: 'instrument-list'`,
  `tableMode: 'multi'`, `non_paginated: true`.
