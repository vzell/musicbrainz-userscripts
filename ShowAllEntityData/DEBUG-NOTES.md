## 2026-09-25 — iswc pageType

- `debug/ISWC.html` (/iswc/T-070.127.339-3): NO `div#content` — `div#page`
  directly wraps `<h1>ISWC "…"</h1>` then a single native
  `<h2>Associated with N work(s)</h2>` immediately followed by an ALREADY
  `tbl`-shaped `<table class="tbl mergeable-table">`, wrapped in
  `<form action="/work/merge_queue?returnto=…" method="post">` — same
  minimal shape as `debug/ISRC.html`. Columns: checkbox / Title / Authors /
  Recording artists / Other artists / Type / Language. The leading checkbox
  `<th>` carries no `checkbox-cell` class, same defect as `/isrc/` (fixed the
  same way: a `pageType`-scoped stamp in `startFetchingProcess`, now widened
  to cover both `'isrc'` and `'iswc'`).
- Title is a plain `<a href="/work/<mbid>"><bdi>…</bdi></a>` (no `.comment`
  span in this snapshot's one row). Authors uses the same
  `artist-roles-container`/`"relations"` JSON shape as Place-Events'
  "Artists" column; Recording artists/Other artists use the same
  `work-artists-container`/`"artists"` JSON shape as `artist-works`' own
  "Recording artists" column — including a native `(show N more)`
  truncation (4 `<li>` shown, 118 total in this snapshot). Both are already
  handled generically by `expandShowAllCells()`/`_findCellListItems()` —
  no new extractor needed. Type is plain text (`"Song"`). Language is
  `<ul><li data-iso-639-3="…">English</li></ul>` — one `<li>` per lyrics
  language, so it needs the same `collapsableColumns` treatment as the
  artist columns.
- No `class="pagination"` anywhere; nothing after `</table>` but the native
  "Add selected works for merging" button row. `non_paginated: true`, same
  as `isrc`/`cd-stub`/`auto-editor-election`.
- The `@include` header's third regex had `isrc\/.*` but no `iswc\/.*` —
  added it, or the new pageType would compile cleanly and silently never
  run (no error, no button, indistinguishable from "the page has no rows").

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

## 2026-07-23 — follow-up fixes from debug/pt.org (same branch)

- **Header-mangling bug (auto-elections)**: `debug/auto-editor-elections.html`'s
  native "1st seconder" / "2nd seconder" `<th>` text rendered as "st seconder"
  / "nd seconder" (both the visible header and `data-col-name`). Root cause:
  `makeTableSortableUnified`'s `const colName = th.textContent.replace(/[…
  0-9…]/g, '')` blindly strips plain ASCII digits from what is, at that exact
  point in the pipeline, always raw/undecorated header text (native or
  freshly-created synthetic `<th>`, immediately before `th.innerHTML` is
  cleared and rebuilt) — the `0-9` was only ever needed to strip the
  uniq-count badge digits (e.g. "94") that get injected into the SAME `<th>`
  later, on a *subsequent* read of an already-decorated header (e.g.
  `getCleanColName`, used for sort/numeric detection). Fixed by dropping
  `0-9` from the one true "first read of raw text" site (colName derivation)
  and making `getCleanColName` prefer the now-correct, immutable
  `th.dataset.colName` over re-deriving from the live (badge-digit-carrying)
  `textContent`. Left the ~20 other occurrences of the same
  icon-stripping regex elsewhere in the file untouched — they operate in
  different contexts (already-decorated text, or fetched-doc colIdx
  matching) not implicated by this specific bug report.
- **cd-stub lastupdate-row merge**: previously the "Added N years ago, last
  modified M years ago" `<tr><td class="lastupdate" colspan="4">` row (see
  `debug/cd-stub.html`, item 2 in `debug/pt.org`) was silently dropped by the
  generic single-cell/colSpan>1 guard with no visible effect. Now an explicit
  `pageType === 'cd-stub'` branch in `startFetchingProcess` (modeled directly
  on the existing `pageType === 'cdtoc'` tracklist-row interception right
  above it) intercepts it, appends `<span class="comment">(<bdi>…</bdi>)
  </span>` to the preceding row's Title cell, and mirrors the same text into
  that row's synthetic Comment cell (`cd-stub` now sets
  `extractMainColumn: 'Title'`, so MB-Name/Comment columns exist to receive
  it — Title never has a native `.comment` span of its own, so Comment is
  populated exclusively from this merge).
- **Instrument-list Name/Comment/Description split**: implemented the
  extractor deferred in the entry above. New `Name_Comment_Description`
  (`ColumnDataExtractor`) reuses `_tagCountBase` for Name/Comment and walks
  the source cell's remaining child nodes for Description — splitting on the
  first text node containing "—", skipping the `<!-- -->` marker-comment
  artifact MusicBrainz emits right after the dash, and cloning (not
  flattening to text) everything after it so a family entry's nested
  instrument links (e.g. "akete" → "Three-parts drumset (`<a>`baandu`</a>`,
  …)") survive. Wired per-family via `entityFeatures` keyed by the exact
  8 family names (Wind instrument, String instrument, Percussion instrument,
  Electronic instrument, Other instrument, Ensemble, Family, Unclassified
  instrument) — each entry's `columnExtractors[0].sourceColumn` is that same
  literal family name, since Structure J names each group's sole native
  column after its category. This mirrors `tag-value`'s per-group
  columnExtractor pattern exactly, and required extending two existing
  `pageType === 'tag-value' || pageType === 'user-tag-value'`-gated code
  paths to also cover `'instrument-list'`: the row-level extractor colIdx
  re-resolution in `startFetchingProcess`, and the per-group thead rebuild
  in `renderGroupedTable` (without the latter, extracted Name/Comment/
  Description cells would have no corresponding `<th>`s). The original
  per-family column (e.g. "Wind instrument", full glommed text) is left in
  place alongside the three new ones — same convention as every other
  columnExtractor in this script (e.g. "Location" staying next to its
  derived Place/Area/Country).

## 2026-07-23 — privileged-accounts page type (debug/priviledged.org, same branch)

- `priviledged.html` (`/privileged`): HAS `div#content`. `<h1>Privileged user
  accounts</h1>` followed by 7 native `<h2>Category</h2>` sections
  (Auto-editors, Relationship editors, Transclusion editors, Location
  editors, Banner message editors, Account administrators, Bots), no
  pagination. Each section has 2-3 plain `<p>` siblings — NOT a `<ul>`:
  typically an intro/description paragraph, a "The following N users are
  …:" count paragraph, and always-last a paragraph holding the actual
  editor list as inline `<a href="/user/…">` links glued together by ", "
  text-node separators (`Bots` has only the count + list paragraphs, no
  intro). Confirmed via a full per-section dump that the list paragraph is
  reliably identifiable as "the one containing `/user/` links" regardless
  of its position (2nd or 3rd `<p>`), so Structure K detects it that way
  rather than assuming a fixed index. At least one username itself contains
  a literal comma ("ApeKattQuest, MonkeyPython", in Relationship editors) —
  confirmed this is a single `<a>` whose `<bdi>` text contains the comma,
  not two separate entries — so Structure K splits by walking the `<p>`'s
  direct-child `<a>` elements, never by parsing the "," separator text,
  which would have wrongly split that one editor into two rows.
- New Structure K in `applyListToTable`, gated on `pageType ===
  'privileged-accounts'`: walks every `<h2>`/`<h3>` (post-`renameH2ToH3`),
  finds the LAST sibling `<p>` before the next heading that contains an
  `/user/` link, and replaces just that one `<p>` with a one-column
  `<table class="tbl">` (fixed literal header "Editor", one row per
  anchor) — the other paragraphs are left untouched. Since Structure K
  (like `reports-index`) uses a fixed literal header rather than one
  derived from the category name, also extended the `_colName` ternary in
  `startFetchingProcess`'s multi-table grouping (used by
  `renderGroupedTable` to patch each group's first `<th>` at render time)
  to output `'Editor'` for `pageType === 'privileged-accounts'` — otherwise
  the correct "Editor" header built by Structure K would have been
  silently overwritten back to the category name (e.g. "Auto-editors") on
  render, exactly as `reports-index` already guards against for "Report".
  `pageType: 'privileged-accounts'`, `tableMode: 'multi'`,
  `non_paginated: true`, `renameH2ToH3: true`, synthetic `insertH2`.

## 2026-07-23 — privileged-accounts intro paragraphs landing after all sub-tables (follow-up, same branch)

- **Symptom**: on the rendered page, every section's descriptive/count `<p>`
  (e.g. "Auto-editors are trusted users who have been given …") ended up
  bunched together AFTER all 7 h3/table sub-sections, instead of each
  staying right before its own table.
- **Root cause**: Structure K (above) only converts the LAST `<p>` per h2
  section (the editor list) into a `table.tbl`; the other 1-2 intro/count
  `<p>`s are left in the DOM untouched at that point. `renderGroupedTable`'s
  cleanup pass (`container.querySelectorAll('h3, table.tbl, .mb-master-toggle')
  ...remove()`) only ever removes h3 and table.tbl elements — the leftover
  `<p>`s survive it, orphaned in their original position. The rebuilt
  h3/table pairs are then inserted as ONE CONTIGUOUS BLOCK via
  `lastInsertedElement.after(h3); h3.after(table);`, chained starting from
  the single page-level target h2 — which lands them all near the top,
  ahead of where the untouched `<p>`s still sit further down. Same
  mechanism as the `_relocateTrailingH2Sections` / Structure-C h2-in-cell
  bugs documented above in spirit (content silently separated from its
  original structural anchor by a later cleanup/rebuild pass), though a
  different code path.
- **Fix**: Structure K now also collects those non-list `<p>` siblings per
  section (`_introPs`), serializes them (`outerHTML`, preserving any
  `<a href="doc/…">` links) onto the new table's `dataset.mbIntroHtml`, and
  removes them from the DOM immediately — nothing is left orphaned.
  `startFetchingProcess`'s multi-table grouping pass copies
  `table.dataset.mbIntroHtml` onto `group.introHtml` (parallel to how
  `group.colHeaders`/`group.entityFeatures` are already carried over from
  other table dataset attributes). `renderGroupedTable` then wraps
  `group.introHtml` in a `<div class="mb-group-intro">` and inserts it
  between `h3` and `table` (`h3.after(introEl); introEl.after(table);`),
  and the cleanup-pass selector was extended to also remove
  `.mb-group-intro` so it gets cleanly rebuilt (not duplicated) on every
  re-render. The wrapper is plain and NOT wired into the per-section
  collapse/expand toggle (which only ever touches `table.style.display`) —
  intro text stays visible regardless of collapse state, by design, since
  the ask was positioning, not collapsibility.
  `debug/priviledged-final.html` (captured by the user afterwards, 294767
  bytes, mtime 14:01) independently confirms this exact symptom — every
  `<table>` closes with `...yyoung_bot</bdi></a></td></tr></tbody></table>`
  immediately followed by `<p>Auto-editors are trusted users…</p><p>The
  following 257 users…</p><p>Relationship editors are…` — i.e. it's a
  "before" snapshot of the bug described above, not evidence of a
  regression in the fix.

## 2026-07-23 — three follow-ups from debug/priviledged.org (same branch)

1. **Intro paragraphs now collapse with their sub-table.** The fix above
   (`.mb-group-intro` positioning) intentionally left the wrapper always
   visible regardless of collapse state. Now wired into every place that
   toggles a grouped sub-table's `table.style.display` — the per-h3 click
   handler (both the plain-click single-table path and the Ctrl+Click
   toggle-ALL path), the `.mb-master-toggle` "Show/Hide all sub-sections"
   button, and the global Ctrl+3 "toggle all h3 headers" keyboard shortcut —
   via one new shared helper, `_syncGroupIntroVisibility(table)`, plus
   mirroring the table's just-decided initial collapsed/expanded state onto
   `introEl` at creation time in `renderGroupedTable` (for the very first
   render, before any user click has happened). The helper walks back from
   `table` to the enclosing `<h3>` looking for a `.mb-group-intro` sibling
   (rather than assuming strict adjacency) so it keeps working if something
   else — e.g. a CAA/EAA art bigbox, which also targets
   `table.previousElementSibling` — is ever inserted between them on a page
   that also carries an intro wrapper (not the case for any page today).

2. **Renamed pageType `'cd-stub'` → `'top-cd-stub'`** (still matches
   `/cdstub/browse` only) to free up the `'cd-stub'` name for the new
   individual-stub page type below. Renamed throughout: the page
   definition, its `pageType === …` branch in `startFetchingProcess` (the
   lastupdate-row merge), and all referencing comments. Also renamed
   `debug/cd-stub.html` → `debug/top-cd-stub.html` to match.

3. **New pageType `'cd-stub'`** for an individual CD stub's own page
   (`/cdstub/<disc-id>`, e.g.
   `/cdstub/3p1LmJIWtNn4rzXGF4Xk.I7vh90-`). `cd-stub-pagetype.html`: HAS
   `div#content`; `div.blankheader` (h1 title-link-to-self + `p.subheader`
   "CD stub by Artist"); native `<h2>Tracklist</h2>` immediately followed by
   an ALREADY `table.tbl`-shaped table (`#` / Title / Length, 17 rows for
   the captured example) — no `listToTable`/`insertH2` needed, unlike every
   other page type added this session. A second `<h2>Disc ID
   information</h2>` + `<table class="details">` (Disc ID / Total tracks /
   Total length / Full TOC) sits right after — note the class is
   `"details"`, not `"tbl"`, so the generic `table.tbl` scan never touches
   it; left completely alone. A `div#sidebar` (sibling of `div#content`, not
   nested inside it) holds a `dl.properties` (Added/Last modified/Lookup
   count/Modify count/Barcode) and `ul.links` (Import as MusicBrainz
   release / Add disc ID to existing release / Search the database) — also
   untouched, out of scope. No pagination (a stub's tracklist is fixed and
   already fully rendered) → `non_paginated: true`. Match regex uses a
   negative lookahead (`/^\/cdstub\/(?!browse(?:\/|$))[^/]+\/?$/`) to
   explicitly exclude `/cdstub/browse` regardless of `pageDefinitions`
   array order, rather than relying on `top-cd-stub`'s entry happening to
   come first.

## 2026-07-23 — auto-editor-election page type (same branch)

- `auto-editor.html` (`/election/<n>`, e.g. `/election/473`): NO
  `div#content` — `div#page.fullwidth` directly. Native `<h1>Auto-editor
  election #28</h1>`, a `<p><a href="/elections">Back to elections</a></p>`,
  `<h2>Details</h2>` + `<table class="properties">` (Candidate / Proposer /
  1st seconder / 2nd seconder / Total votes / Votes for / Votes against /
  Abstentions / Status — note the class is `"properties"`, not `"tbl"`, so
  the generic `table.tbl` scan never touches it; left completely alone),
  `<h2>Voting</h2>` + a status `<p>` (just "Voting is closed." once the
  election is over — no ballot form observed in this closed-election
  snapshot), then native `<h2>Votes cast</h2>` immediately followed by an
  ALREADY `table.tbl`-shaped table (Voter / Vote / Date, 9 rows in the
  captured example) — no `listToTable`/`insertH2` needed, identical minimal
  shape to `cd-stub` above (a single-entity detail page whose one
  interesting sub-table is already native `table.tbl` with its own `<h2>`).
  Every `Vote` cell reads "(private)" even for this already-`Accepted`
  election — MB keeps individual ballots permanently secret, so no
  vote-value extractor is needed; left as plain filterable text. No
  pagination (a closed election's vote list is fixed and already fully
  rendered) → `non_paginated: true`. `pageType: 'auto-editor-election'`,
  `tableMode: 'single'`.

## 2026-07-24 — AnnotationsPlaces Place column (`place.html`)

- `place.html` (`/report/AnnotationsPlaces?filter=0`, already-rendered
  snapshot): the sticky column 0 is native `data-col-name="Place"`, not
  `"Location"`. Its cell shape is identical to the `Location` column on
  Events pages: `<a href="/place/…">Name</a>` [optional `<span
  class="comment">(disambiguation)</span>`] ` in ` + comma-joined
  `<a href="/area/…">` chain, ending in a `.flag`-wrapped country link
  (300-row sample: 0-6 area links per row, same "depth varies per place, not
  per country" pattern as `debug/location.html`). Added a second
  `columnExtractors` entry to `report-detail` targeting `sourceColumn:
  'Place'` with `extractor: 'splitLocation'`, naming its first synthetic
  column `MB-Place` (not `Place`) to avoid colliding with the native `Place`
  column, which is left untouched and still shows the full combined text.
  `Locality`/`Region`/`Country` synthetic names are shared with the existing
  `Location`-sourced entry — same extractor, same output shape.

## 2026-07-24 — area-artists Locality/Region split + province-flag bug (`area-US.html`, `area-DE.html`, `area.org`)

- `area-US.html`/`area-DE.html` (`/area/<mbid>/artists`, already-rendered
  snapshots, 400/600 rows): native `Area`/`Begin area`/`End area` columns
  have the same area-chain shape as `Location`'s area portion (0-4 `/area/`
  links per row; US samples like `Chicago, Illinois`, `Brooklyn, New York,
  New York`; DE samples like `Köln, Nordrhein-Westfalen`, `Bremen, Bremen`).
  Split `splitArea`'s `MB-Area` output into `MB-Locality`/`MB-Region`
  (and the `Begin`/`End`-prefixed equivalents), same positional rule as
  `splitLocation`'s `Locality`/`Region` (9.99.708).
- `area.org` row 74 (`area-US.html`, Ben .G, a Person artist whose home Area
  is New Brunswick → New Jersey → United States): the "MusicBrainz: Canadian
  Province Flags Everywhere" userscript (@Lotheric) decorates
  `New Brunswick`'s link with a preceding sibling `<span
  class="area-icon"><img class="flag flag-CA-prov"></span>`. `splitArea`'s
  old whole-cell scan (`n.classList.contains('flag') || n.querySelector('.flag')`
  over direct child nodes) picked this sibling icon as "the country" (its
  `<img>` also carries the class `flag`), since it precedes the real
  `<span class="flag flag-US">` in document order — so `Country` showed the
  New Brunswick icon and `MB-Area` ended up with the real "United States"
  text appended to it instead of it landing in `Country`. Fixed by rewriting
  `splitArea` to route each `/area/` anchor individually via
  `a.closest('.flag')` (only the anchor's own ancestor chain, never a
  sibling) — extracted as a shared helper `_routeAreaLink`, also now used by
  `splitLocation`. Confirmed no other row in either 400/600-row sample has
  an `area-icon` span other than this one.

## 2026-07-25 — Locality/Region override for flagged subdivisions (`florida.html`, `flags.org`)

- `flags.org`: notes that the "MusicBrainz: More Flags Everywhere" userscript
  (@Lotheric) now decorates subdivision-level area links (not just Canadian
  provinces) for 19 countries — Australia, Belgium, Brazil, Canada, Czechia,
  Denmark, Estonia, Finland, France, Germany, Italy, Japan, Netherlands,
  Russia, Spain, Sweden, Switzerland, United Kingdom, United States — with
  the same `<span class="area-icon"><img class="flag ..."></span>` sibling
  shape as the Canadian-province decoration fixed in 9.99.710.
- `florida.html` (already-rendered `/area/489ce91b-.../artists` snapshot): a
  US artist row whose only `Area` link is "Florida" (`<span
  class="area-icon"><img class="flag flag-custom-region" ...></span> <a
  href="/area/d2918f1a-...">Florida</a>, <span class="flag
  flag-US">...United States...</span>`) — confirms the "More Flags
  Everywhere" state-flag class is `flag-custom-region` (not `flag-US-FL`),
  but still wrapped in the same `span.area-icon` sibling shape our existing
  icon-carry-along logic already recognizes. Since there's no city entered
  for this artist, the existing positional rule (first link = Locality)
  puts "Florida" in `MB-Locality` — technically correct by position, but
  wrong conceptually, since Florida is a state/region, not a locality.
  Cross-checked `area-US.html`'s "Chicago, Illinois" row: "Illinois" there
  has **no** `area-icon` decoration, confirming that snapshot was captured
  without the flags script active/installed — the icon is not guaranteed to
  be present, so any fix must be a no-op when it's absent.
- Added a country-specific override (see `sa_area_flag_region_countries`
  setting): when the would-be-Locality link carries an `area-icon` AND the
  row's Country is in the user-editable list (default: `United States`
  only), route it to `Region` instead. Implemented by pre-resolving the
  row's country name (`_findRowCountryName`, scans for the flag-wrapped
  country anchor before the routing loop reaches it) and checking it inside
  `_routeAreaLink`.

## 2026-07-25 — Locality/Region override only worked on page 1 (`flags2.org`)

- `flags2.org`: user reported that the WIP.1 country-specific override
  (Florida -> MB-Region) only worked for the current page's rows on a
  paginated area-artists listing; rows from fetched pages 2..Max kept the
  old (Locality-only) classification even with "More Flags Everywhere"
  installed and visibly decorating every row's flag.
- Root cause: `startFetchingProcess`'s fetch loop (see `fetchHtml`,
  `ShowAllEntityData.user.js` ~37680) uses `new DOMParser().parseFromString()`
  to parse every page except the current one (`doc = document` only when
  `p === currentPageNum`) — a fully detached `Document`, never inserted into
  the live page. Third-party userscripts that decorate the live DOM (via
  their own MutationObserver or periodic rescan) never see these detached
  documents, so their flag icons are absent at the exact moment
  `splitLocation`/`splitArea` (via `_routeAreaLink`) run during row
  extraction — only page 1's rows are extracted from the already-live,
  already-decorated document.
- Fix: added a post-render `MutationObserver` (`initAreaFlagRegionObserver`,
  next to `initTreleasesObserver`) that watches every live `table.tbl tbody`
  for the `data-flag-processed` attribute (confirmed present on both the
  Canadian-province and "More Flags Everywhere" decorations — see
  `debug/area.org` and `debug/florida.html`) appearing on an anchor sitting
  in a Locality cell, and reactively moves it to Region at that point,
  regardless of when/whether the decorating userscript gets to it. Applied
  to both the live row and its master row (`allRows`/`groupedRows`, found via
  `data-mb-row-idx`) so the fix persists across later sort/filter re-renders
  without needing a separate per-clone replay step (unlike `expandedCells`).

## 2026-07-25 — observer never found a Locality/Region/Country trio on any page (follow-up, same branch)

- User reported the previous fix "doesn't work, same as before" even though
  the flag icon was confirmed to visually render on page-2+ rows. First
  attempt (childList-mutation watching + bounded 500/1500/3000/6000ms
  re-scans + `sa_enable_debug_logging`-gated diagnostics at every bail-out
  point) still failed, but the diagnostics did their job: console showed
  `initAreaFlagRegionObserver: no Locality/Region/Country trio found on this
  table. Headers: [, Artist, Type, Gender, Area, Begin, Begin area, End, End
  area, Rating]` — i.e. the RAW native headers, not the split
  `MB-Locality`/`MB-Region`/`Country` synthetic ones `splitArea` produces.
- Root cause (real bug, unrelated to the flag userscript's DOM strategy):
  for `tableMode: 'single'` pages, `startFetchingProcess()` calls
  `await renderFinalTable(allRows)` and only calls its own
  `document.querySelectorAll('table.tbl thead').forEach(cleanupHeaders)`
  pass — the step that actually injects the synthetic `<th>`s — *after*
  `renderFinalTable()` returns. But `renderFinalTable()` itself called
  `initAreaFlagRegionObserver()` at its own tail end, i.e. strictly before
  `cleanupHeaders()` ever ran. So the observer's trio-finder always scanned
  a thead that still only had the original page's headers, on every page —
  not a page-2+-specific issue at all, and the earlier
  attributes-vs-childList-mutation theory was a red herring.
- Fix: moved the `initAreaFlagRegionObserver()` call out of
  `renderFinalTable()` (left a comment there explaining why) and into
  `startFetchingProcess()`, immediately after its `cleanupHeaders()` pass.
  `renderGroupedTable()`'s own call (for `tableMode: 'multi'` pages) was
  already correctly ordered after its per-group `cleanupHeaders()` calls and
  needed no change. **Confirmed working by the user** on the paginated
  `/area/489ce91b-.../artists` page — page 2+ rows now correctly move
  flagged Locality values to Region. Kept all the `sa_enable_debug_logging`-
  gated diagnostic logging added during the investigation in place per the
  user's explicit request, even though it's no longer needed to explain this
  specific bug — useful if a similar issue resurfaces.

## 2026-07-25 — new 'edits' pageType: DOM shape and unbounded pagination

- `edits-search.html` (`/search/edits?...`) and `edits-release.html`
  (`/release/<mbid>/edits`) both have `div#content > h1` (search:
  "Search for edits"; release: `.releaseheader h1` "Edits for «title»" —
  already covered by the existing `headerContainer` fallback chain, no init
  changes needed), then a `<form action="/edit/enter_votes">` wrapping
  `<nav><ul class="pagination">` followed directly by a sequence of
  `<div class="edit-list">` blocks (50/page). No native `<table>` anywhere —
  a genuinely new source shape for this script (every prior pageType has
  either a native `<table>` or a `<ul>` convertible via `applyListToTable`).
- `edit-list-item.html` (pretty-printed single block, "Edit #139446083 -
  Remove relationship") shows each `div.edit-list` is fully self-contained:
  `.edit-header` (h2 edit#/action link, `p.subheader` editor link, a small
  vote-count `<table>`), a per-edit hidden vote `<input>`, `.edit-actions`
  (`.edit-status` text present only for cancelled/error edits — absent for
  open/applied), `.entered-from` (relationship edits only; glues the release
  link, an optional "Add Cover Art" button, and the "by «artist(s)»" clause
  into one text run), `.edit-details` (native `<table class="details ...">`;
  merge-type edits embed a full second `<table class="tbl">` compare grid
  inside it), `.edit-notes` (real notes plus a large hidden `.add-edit-note`
  note-composer widget), and a trailing `.seperator` — all as children, not
  siblings between blocks.
- New `applyEditsToTable(def, docContext)` (mirrors `applyListToTable`)
  converts this block sequence into one `<table class="tbl">`, one `<tr>`
  per block, 12 columns per `debug/edit-pages.org`. **Every** edit's
  `.edit-details` — not just merge-type ones — wraps its content in its own
  native `<table class="details ...">`, discovered via a local jsdom
  round-trip test against these two snapshots (`table.querySelectorAll('tbody
  tr')` on the freshly-built outer table returned 232 rows instead of 52,
  because it recurses through nested tables regardless of class). Renaming
  the nested table's class (the first fix attempted) is not sufficient —
  virtually every row-processing call site in this script does
  `tbl.querySelectorAll('tbody tr')` unscoped by depth, so ANY nested
  `<table>/<tbody>/<tr>` inside a cell gets swept up no matter its class.
  Fixed with a new `_detableify(root)` helper that converts nested
  `table/thead/tbody/tfoot/tr/th/td` into `<div>`s with the equivalent CSS
  `display: table*` value (`.mb-dt-*` classes for styling) — same visual
  grid, zero real table elements, so nothing can ever recurse into it.
  Applied to both `.edit-details` (always) and `.edit-notes` (defensively,
  in case a note's wiki formatting ever renders a table).
- **Pagination has no discoverable last page.** Live-checked against
  `/search/edits` (direct HTTP fetches, not through the userscript) before
  MusicBrainz rate-limited further requests: page 1 said "Found at least
  500 edits"; page 10 said "at least 950"; page 1000 *still* returned
  HTTP 200 with 50 real `edit-list` blocks and said "at least 50,450". The
  pagination widget is a sliding ±window around the current page with no
  "last page" state — the `<a>` immediately before "Next" (what
  `fetchMaxPageGeneric`/`determineMaxPageFromDOM` use as `maxPage` for every
  other pageType) is just a nearby milestone, not the true total.
  `edits-release.html` shows the identical "Found at least 500 edits"
  wording and double-ellipsis widget on page 1, so this is likely a general
  edit-listing behavior, not exclusive to `/search/edits` — not
  independently confirmed live (blocked by the rate limit) before this was
  implemented.
- Fix, scoped via a new `features.unboundedPagination` flag (zero behavior
  change for any other pageType, including `'search'`, since
  `determineMaxPageFromDOM`/`fetchMaxPageGeneric` themselves are untouched):
  skip maxPage detection entirely and use the existing `sa_max_page` safety
  cap as the loop bound; inside the fetch loop, a fetched page with zero
  `div.edit-list` blocks `break`s the loop immediately (the real "we're
  done" signal) instead of falling through to the generic
  `tablesToProcess.length === 0 → continue`, which would otherwise burn
  through every remaining page up to the cap. User-approved after being
  presented with three options (fetch-until-empty / probe-then-fetch /
  warn-only); fetch-until-empty was chosen for correctness and simplicity.
- Verified `applyEditsToTable`/`_buildEditRow`/`_detableify` end-to-end with a
  local jsdom harness run directly against `edits-search.html` and
  `edits-release.html` (extracted the functions, `eval`'d them under jsdom,
  ran the real conversion, inspected the resulting table) since no live
  browser/Tampermonkey session is available in this environment. Caught two
  real bugs this way, both fixed before merge:
  1. The `.edit-details` de-tableify fix above (found because the jsdom test
     initially reported 232 `tbody tr` matches instead of 52 for
     `edits-search.html`).
  2. `edits-search.html` (search-results pages only) has a "bulk vote on all
     unvoted edits" banner — Yes/No/Abstain/None buttons plus a "Reset
     votes // Vote on all unvoted edits" line — that reuses the exact same
     `div.edit-list` class as real edit blocks (`52` `div.edit-list`
     matches vs. `50` real edits per page) but has no `<h2>` edit#/action
     link. `applyEditsToTable` now filters blocks on
     `b.querySelector('h2 a[href^="/edit/"]')` before building rows (and the
     `unboundedPagination` empty-page check in the fetch loop was changed to
     count `div.edit-list h2 a[href^="/edit/"]` for the same reason) so this
     banner doesn't produce a garbage all-"N/A" row or get mistaken for "no
     more data" on the rare page where it might otherwise be the only
     `div.edit-list` present.
  Also caught, smaller: edits with zero real notes still have a (now-empty)
  `.edit-notes` element once the hidden note-composer widget is stripped —
  rendered as a blank cell instead of "N/A" until `_buildEditRow` was
  changed to check `clone.textContent.trim()` first.
  Not independently verified: `/artist/<mbid>/edits` (or other non-release
  entities), `/edit/subscribed`, `/edit/subscribed_editors` — no snapshot
  exists for these; worth a quick manual check for the same banner quirk
  and any other surprises before relying on them.
- Initially missed: this script gates on Tampermonkey `@include` regex
  directives in the `==UserScript==` header (not just the internal
  `pageDefinitions` router) — without updating those, the script simply
  never runs on the new URLs regardless of the pageDefinitions match logic.
  Added `edits` to the existing entity-subpage `@include` alternation
  (`.../<entity>/<mbid>/(?:aliases|releases|...|edits)`) and added
  `search\/edits(?:\?.*)?` / `edit\/subscribed(?:_editors)?(?:\?.*)?` as new
  alternatives to the misc-pages `@include` line. All five target URLs
  (`/search/edits?...`, `/release/<mbid>/edits`, `/artist/<mbid>/edits`,
  `/edit/subscribed`, `/edit/subscribed_editors`) verified to match via a
  standalone node regex test.

## 2026-07-25 — edits pageType follow-up fixes (debug/act.org)

Four issues reported after using the branch, addressed in the same jsdom-tested way as before:

1. **Pagination "no max page" assumption was wrong for smaller result sets.**
   `debug/willow.html` (`/release/4e6fbd8f-.../edits`, 6 edits) has **no**
   `ul.pagination` at all — "Found 6 edits" (exact, no "at least").
   `debug/mgv.html` (`/artist/b3c01c39-.../edits`, 54 edits) has a real,
   complete `Previous | 1 | 2 | Next` widget with **no ellipsis** — "Found 54
   edits" (also exact) — and the existing `determineMaxPageFromDOM()`/
   `fetchMaxPageGeneric()` heuristic already computes the correct `maxPage=2`
   for it. Only the double-ellipsis milestone-window shape (`1 … 6 7 8 9 10
   11 … Next`, seen in `edits-search.html`/`edits-release.html`, "Found at
   least N edits") is actually ambiguous. New `_hasAmbiguousEditsPagination(doc)`
   checks `ul.pagination` for an ellipsis placeholder (`<li><span>…</span></li>`);
   the `isAmbiguousEditsPagination` runtime flag (computed once from the live
   document, replacing the old blanket `features.unboundedPagination` check)
   now gates both the maxPage branch and the fetch-loop empty-page break —
   when false, `determineMaxPageFromDOM()` runs normally (accurate maxPage,
   accurate progress bar, no extra confirmation dialog). Verified against
   all 4 snapshots via jsdom: willow→false, mgv→false, edits-search→true,
   edits-release→true (edits-release.html's own `ul.pagination` does contain
   the ellipsis — confirmed by re-checking its raw markup — so `true` here is
   correct, not a regression of the original finding).
2. **Missing `<h2 class="mb-h2-processed mb-toggle-h2">` filterline.**
   `applyEditsToTable` removes every `div.edit-list` block *including its own
   `<h2>Edit #NNN - Action</h2>`*, and no edits page has a `div.tabs` either,
   so zero `<h2>` elements survive for `makeH2sCollapsible()`/the
   collapsible-section infrastructure to anchor to — confirmed via
   `debug/no-h2-filterline.html` (a post-render snapshot: the table exists,
   fully processed, with sort/filter icons in its headers, but no h2 sits
   above it). Fixed with `features.insertH2: 'Edits'` — the exact same
   `tableMode: 'single'` + `insertH2` combination already used by e.g.
   `'taglookup'` (`insertH2: 'Releases'`). Runs before `applyEditsToTable` in
   the pre-processing order, so it inserts a fresh `<h2>Edits</h2>` (after
   `<h1>`, since there's no `.tabs`/`.h3` yet) while the per-block `<h2>`s are
   still untouched — no interference between the two.
3. **"Entered from"/"By" undercounted — hardcoded to `.entered-from` only.**
   `debug/mgv.html` has an "Edit recording" edit
   (`#110120748`) with no `.entered-from` div at all; the same "release-name
   linked to artist-credit" information instead lives inside `.edit-details`'s
   own table: `<th>Recording:</th><td><a href="/recording/...">Al lado de mi
   cabana</a> by <bdi>MGV Drabenderhöhe</bdi></td>`. Per the user's
   suggestion ("scan for them, then hardcode"), `_buildEditRow` now falls
   back to scanning `.edit-details` for the first `<td>` with the same bare
   `"by"` text-node split shape when no `.entered-from` div exists, reusing
   `_splitEnteredFrom` unchanged (its label/cover-art stripping steps are
   harmless no-ops on this shape). This is generic — not gated on edit-type
   name — so it also picked up "Edit medium", "Edit release", "Add disc ID",
   "Add medium", "Add release label", "Add release", "Add cover art", "Edit
   release group" and others in testing, not just "Edit recording"; edit
   types with no clean single-entity-by-artist description (e.g. "Merge
   recordings", "Add ISWCs") still correctly render "N/A" for both columns —
   confirmed via jsdom against all 4 debug snapshots (e.g. mgv.html went from
   0 correctly-populated non-relationship rows to 38/50 rows populated,
   including the "Edit recording" row).
4. **Inline CAA + column renames.** Added `features.addCAA: 'Entered from
   release'` (after the rename below) — reuses the existing generic
   `CAA_CTX`/`addFeature` mechanism unchanged; its `entityGuard`/
   `inlineLinkSel` already only match `/release/` or `/release-group/`
   hrefs, so it's a correct no-op for rows whose entered-from link points to
   a non-release entity (e.g. the "Edit recording" row above, which links to
   `/recording/...`). Renamed columns `"Entered from"` → `"Entered from
   release"`, `"By"` → `"By artist"` in the `headers` array (and the
   `addCAA` value, since it targets by column name).

## 2026-07-25 — edits pageType, second follow-up round (debug/act.org)

Four more issues after using the previous round's fixes:

1. **Still no h2 filterline** — a real, subtler bug in `applyInsertH2`
   itself, not something specific to 'edits'. `debug/no-h2.html` shows an
   `<h2 class="mb-h2-processed mb-toggle-h2">...Edits</h2>` — but it's
   positioned *after* the table, nested inside one specific edit's
   `<div class="edit-note" id="note-149972661-1">`, sitting right before
   that note's own (now `display:none`) owner/date `<h3>`. That editor's
   note literally contains wiki markup that renders a native `== Edits ==`
   sub-heading (the same mechanism documented in this file's CLAUDE.md for
   Annotation-cell nested headings) — which happens to collide, by pure
   coincidence, with the literal string `'Edits'` chosen for
   `features.insertH2`. `applyInsertH2`'s idempotency guard
   (`document.querySelectorAll('h2').find(h => h.textContent.trim() === _text)`)
   found this pre-existing *unrelated* nested heading, concluded a
   page-level "Edits" h2 was already present, and skipped the real
   insertion entirely — leaving zero page-level filterline. Fixed by adding
   `&& !h.closest('table.tbl')` to the guard, mirroring the exact exclusion
   `applyInsertH2`'s own "first h3" fallback already uses two branches
   below for the identical reason. General fix, benefits every pageType
   using `insertH2`, not just 'edits'.
2. **`rowspan` broken** — `debug/relationship-original.html` (a "Dave
   Hewitt" relationship edit) has a `<th rowspan="2">Relationship:</th>`
   spanning two `<tr>`s (old value row, new value row).
   `debug/relationship-final.html` shows old/new rendered on the same
   visual row instead of stacked.
3. **`colspan` broken** — a medium edit's tracklist compare table has
   `<th colspan="4">Old tracklist</th><th colspan="4">New tracklist</th>`
   grouping 4 sub-columns each; rendered output (also visible in
   `debug/no-h2.html`) lost the grouping.
   Both 2 and 3 share one root cause: `_detableify` was converting `<th>`/
   `<td>` into `<div style="display:table-cell">`, but `rowspan`/`colspan`
   are IDL properties (`HTMLTableCellElement.rowSpan`/`.colSpan`) that only
   real `<td>`/`<th>` elements expose — a `<div rowspan="2">` is inert
   regardless of its computed `display`. Fixed by leaving `<th>`/`<td>` as
   real elements in `_detableify` (only `<table>`/`<thead>`/`<tbody>`/
   `<tfoot>`/`<tr>` get converted to divs — those are the tags
   `tbl.querySelectorAll('tbody tr')` actually requires, so the original
   nested-table-corruption fix still holds); `<th>`/`<td>` just get
   `.mb-dt-cell`/`.mb-dt-th` marker classes added for styling, and rely on
   their UA-stylesheet-default `display: table-cell` (true regardless of
   ancestor tag names). Verified structurally via jsdom: `rowSpan`/`colSpan`
   IDL properties intact, zero nested `table`/`tbody`/`tr`/`thead` — actual
   visual span behavior rests on well-established CSS table-layout
   semantics (can't be verified in jsdom, which doesn't implement layout).
4. **"By artist" included trailing description text.**
   `debug/RG-relationship-initial.html`/`-final.html`: a release-group URL
   relationship's `.edit-details` td is one long sentence — `<a>Lonesome
   Day</a> by <bdi><a>Bruce Springsteen</a></bdi> has a discography entry
   at <a>...</a> [<a>info</a>]` — `_splitEnteredFrom` was taking
   *everything* after the "by" split as the "By artist" value, including
   "has a discography entry at ... [info]". Same issue for release-URL
   relationships ("... can be purchased for download at ... [info]").
   Fixed: the artist-credit is always the first substantial element right
   after "by" (a single `<bdi>` wrapping one-or-more `<a>` joined by "&", or
   occasionally a bare `<a>`) — `_splitEnteredFrom` now stops right after
   that first element instead of taking the rest of the sentence. Verified
   via jsdom against the exact `RG-relationship-initial.html` td content,
   the Qobuz-link example from this file, and the original multi-artist
   "Bruce Springsteen & The E Street Band" case (regression check — still
   captures both artists correctly, since they share one `<bdi>`).

## 2026-07-25 — h2 filterline fix was incomplete (debug/still-no.html)

The previous `!h.closest('table.tbl')` guard fix didn't actually work —
`debug/still-no.html` shows the injected-looking `<h2>...Edits</h2>`
(same note, `id="note-149972661-1"`) still landing inside the "Edit notes"
table *cell*, not above the table. Root cause I'd missed: `applyInsertH2`
runs during **pre-processing**, strictly *before* `applyEditsToTable` has
built any `table.tbl` — at guard-check time the colliding wiki `<h2>` is
just sitting inside a bare `div.edit-list`, so `!h.closest('table.tbl')`
never actually excludes it (there's no `table.tbl` yet to be inside of).
Worse, reproducing this in a minimal jsdom test surfaced a **second,
independent instance of the exact same timing bug**: the "second
preference: before first h3" placement search has the identical
`table.tbl`-only exclusion, and every real edit note has its own native
`<h3 class="owner">` — so on any edits page with at least one real note,
`applyInsertH2` was inserting the new `<h2>` as a sibling *inside that
note's own DOM*, which `applyEditsToTable` then dutifully clones into the
"Edit notes" cell of that specific row. This was likely happening on
*most* edits pages already (any page with ≥1 real note), not just the
"Edits"-titled-note coincidence.

Real fix, two parts:
1. **Idempotency guard**: replaced the text-content match entirely with a
   `data-mb-injected-h2="1"` marker stamped on the element `applyInsertH2`
   itself creates. Position/timing-independent — no DOM-structure
   assumption can fool it, unlike a text or ancestor-based check.
2. **Placement search**: added `&& !h.closest('div.edit-list')` to the
   `_firstH3` filter, alongside the existing `table.tbl` exclusion —
   div.edit-list is the raw pre-table wrapper every edit note's owner h3
   sits inside of at this point in the pipeline.

Verified via a minimal jsdom reproduction of the exact bug shape (a
matching-text wiki h2 nested inside `div.edit-list > .edit-note`, with its
own owner `<h3>` right after it): injected h2 now lands correctly as a
direct sibling of `<h1>` inside `#content`, `data-mb-injected-h2="1"`
marker present, not nested inside `.edit-list`; a second `applyInsertH2`
call (disk-load re-run scenario) correctly stays idempotent (no duplicate
inserted). Also re-verified against `mgv.html` (has real notes with owner
h3s) and `willow.html` directly.

## 2026-07-25 — "Approved:" edits + column rename

MusicBrainz uses `<strong>Approved:</strong> <date>` (not `Closed:`) for
auto-editor edits that passed their voting period without ever being
formally closed — same semantics (a final date, no more voting), just a
different label. `_buildEditRow`'s `.edit-expiration` prefix check now
matches `/^(Closed|Approved):/i`. Column renamed `"Closed"` →
`"Closed/Approved"` to reflect this. Verified via jsdom with both prefixes
(and a `Closed:` regression check) against a synthetic `.edit-expiration`
matching the exact markup given.

## 2026-07-25 — preserve MusicBrainz's per-edit background colour

Native edit pages colour the `.edit-header` bar by edit type + status
(khaki for an open merge, light green for an applied addition, beige for
an applied plain edit, light grey for cancelled, ...) — this was being
discarded entirely by `applyEditsToTable`. Requested to preserve it on the
final rendered row, called out specifically for the "Edit action" column.

This isn't a simple "just set a background-color" change — this script
has four interacting row/cell-background subsystems (native MB `.odd`/
`.even` zebra CSS classes on `<tr>`, per-cell hover-restore snapshotting
via `dataset.mbRestBg`, the sticky "Edit#" column's own opaque background
via `dataset.mbStickyBg`, and sort-tint alpha-blending that uses
`mbStickyBg` as its blend base). `applyStickyColumn` (`ShowAllEntityData.user.js`
~line 9759) explicitly clears any inline `<td>` background before reading
`getComputedStyle` specifically so CSS zebra striping wins — so setting a
color directly on individual `<td>` elements would just get silently wiped
on the very next render/sort/filter pass.

Implementation: `_buildEditRow` reads `.edit-header`'s inline
`background-color` and applies it as `tr.style.backgroundColor` (inline
styles beat non-`!important` CSS class rules, so it stays stable across
`applyZebraStriping`'s odd/even class reassignment on sort) plus a
`data-mb-edit-bg` marker. Since MB's own `<td>` cells carry no explicit
background of their own (zebra colour is purely a `<tr>`-level CSS rule
showing through transparent cells), a `<td>`'s `getComputedStyle(...)
.backgroundColor` reads back as `transparent` — which is exactly the case
`applyStickyColumn`'s two "transparent → fallback" branches already
special-case (previously hardcoded to `#ffffff`). Patched both to prefer
`tr.dataset.mbEditBg` over the hardcoded white, so the sticky column's
opaque background, the hover-restore colour, and the sort-tint blend base
all pick up the row's custom colour automatically — zero change for any
row without the marker (every other page type). No cell-specific handling
needed for "Edit action" — it's just one of the row's cells, so the
row-level colour already covers it.

Verified via jsdom against `edits-search.html`/`willow.html`: colours
extracted correctly and distinctly per edit type/status (khaki for "Merge
works", light green for "Add relationship"/"Add disc ID"/etc., beige for
"Edit medium"/"Edit release", light grey for cancelled edits) — actual
visual behaviour under hover/sticky-scroll/sort-tint rests on the existing,
already-battle-tested `applyStickyColumn` machinery this only patches two
fallback branches of, not a from-scratch mechanism.

## 2026-07-25 — row background colour fix didn't actually work (debug/no-change.html)

`debug/no-change.html` shows every cell (sticky and non-sticky) with an
explicit `style="background: rgb(255, 255, 255);"` / `data-mb-rest-bg="#ffffff"`
— i.e. plain white everywhere, `data-mb-edit-bg` not present at all. The
previous "transparent → fallback" patch was based on a wrong assumption I
didn't catch because jsdom (no access to MusicBrainz's real stylesheet)
masked it:

- `applyStickyColumn`'s own comment (`ShowAllEntityData.user.js` ~line
  9843, previously read past too quickly) says MusicBrainz's native zebra
  CSS targets `tr.even > td`/`tr.odd > td` **directly**, not `<tr>`. That
  means every `<td>` gets a real, opaque, non-transparent background
  straight from that class rule — `getComputedStyle(td)` in an actual
  browser is *never* `transparent`/`rgba(0,0,0,0)` for an ordinary cell, so
  the "transparent → prefer data-mb-edit-bg" branch never actually
  triggers there. It only *looked* like it worked under jsdom, which has
  no stylesheet to compute from and always falls through to transparent
  regardless.
- Separately, even where that branch *would* apply: the non-sticky-cell
  loop only ever *stored* the computed "rest" colour into
  `dataset.mbRestBg` for later hover-*restore* use — it explicitly leaves
  `td.style.background = ''` for the *initial* render, deliberately "so
  CSS zebra striping wins" (per its own comment). So even a correct
  fallback value would never have painted the cell by default, only after
  a hover-then-leave cycle.

Real fix, in the same two spots:
1. Both `trueRestBg`/`mbRestBg` computations now check `tr.dataset.mbEditBg`
   **unconditionally first**, before even looking at the cell's computed
   background — not just as a fallback for the (in practice unreachable)
   transparent case.
2. The non-sticky-cell loop now sets `td.style.background = editBg` (an
   inline style, which beats MusicBrainz's class-based zebra rule per
   normal CSS cascade rules) whenever the row carries `data-mb-edit-bg`,
   instead of always clearing to `''`. Rows without the marker are
   completely unaffected (empty string, same as before — verified via a
   regression check).

Verified via jsdom by extracting and actually calling `applyStickyColumn`
(not just `applyEditsToTable` in isolation, which is all the earlier,
insufficient fix was tested against) on a real `mgv.html`-built table:
both the sticky column and non-sticky cells now end up with the correct
matching `style.background` for rows with a preserved edit colour, and a
plain synthetic row without one still gets the original sticky-only/white
+ empty-non-sticky behaviour.

## 2026-07-28 — "preserved colour" replaced with our own class-derived palette

The whole premise of the previous 3 rounds of fixes was wrong. Every debug
snapshot used to build/test this feature (`edits-search.html`, `mgv.html`,
`willow.html`, ...) was captured from a browser with the third-party
**"MusicBrainz: Colourful edits"** userscript installed
(`debug/ColourfulEdits.user.js` — stamps `all[i].style.backgroundColor`
onto every `.edit-header` via `document.getElementsByClassName`). Every
color in every snapshot was that script's *output*, not native
MusicBrainz markup, which is why reading `.style.backgroundColor` only
ever worked in a browser that also happened to have it installed.
Separately, the user confirmed a real MusicBrainz page *without* that
script still visibly colors `.edit-header` — but its raw markup has *no*
inline `style` attribute at all (just
`class="edit-header applied edit-add add-relationship"`), meaning
MusicBrainz colors it via its own class-based site CSS. Neither source
(inline style from a possibly-absent userscript, or a stylesheet rule
only resolvable via `getComputedStyle` on a live, currently-viewed page)
is something the fetched-pages-2+ pipeline (detached `DOMParser`
documents, no stylesheet) could ever reliably read anyway.

Redesigned per two explicit decisions:
1. Stop reading style from the DOM entirely. Derive the color **ourselves**
   purely from `.edit-header`'s class list — always present in raw
   HTML/DOM regardless of browser environment — via new
   `_editActionBgColor(headerClassName)`, replicating Colourful Edits' own
   5-category × open/closed classification, but as **configurable
   `sa_edits_color_*` settings** (new "🎨 EDITS PAGE COLORS" `configSchema`
   section, `sa_enable_edits_type_colors` master toggle) defaulting to its
   palette — not hardcoded, not a dependency on that script being
   installed.
2. Color **only the "Edit action" column**, not the whole row (reverting
   the whole-row approach entirely: `tr.style.backgroundColor`/
   `tr.dataset.mbEditBg` removed from `_buildEditRow`).

**Real bug caught by jsdom testing before landing**: Colourful Edits'
own classification regex (`/edit-(?!header)/`, meant to catch plain "Edit
…" edits while excluding the `edit-header` wrapper class) is only
correct if MusicBrainz's category tokens are just `edit-` prefixed loosely
— but `grep -o 'class="edit-header [^"]*"' debug/*.html | sort -u` across
every snapshot confirms the real tokens are `edit-add`/`edit-edit`/
`edit-remove`/`edit-merge`. Since `.test()` scans the whole string, not
just the first "edit-" occurrence, `/edit-(?!header)/` *also* matches
inside `edit-remove`/`edit-merge` (the "edit-" there isn't followed by
"header" either) — silently recoloring every Remove/Merge edit as "Edit".
This looks like a latent bug in the 2012 script itself that nobody
noticed, not something worth replicating for "fidelity". Fixed with exact
token matching (`/\bedit-add\b/`, `/\bedit-edit\b/`, etc.) instead of the
loose substring/negative-lookahead regexes — verified against every real
`edit-header` class combination found across all `debug/*.html` snapshots
(11 cases: each category × open/closed, cancelled-wins-over-type, a
fabricated unknown category falling through to "other", and the specific
"Add ISWCs" edit that would have been misclassified under the old
substring approach if the bug had gone the other direction).

`applyStickyColumn`'s integration also had to change from row-level to
**per-cell**: the earlier `tr.dataset.mbEditBg` check is gone entirely
(reverted to the original hardcoded `'#ffffff'` sticky-cell fallback —
irrelevant now since the sticky column is "Edit#", never the colored
cell); the non-sticky-cell snapshot loop now checks a generic
`td.dataset.mbCustomCellBg` marker set directly on the one "Edit action"
`<td>` in `_buildEditRow`, deliberately not edits-specific so
`applyStickyColumn` stays page-type-agnostic. Verified via jsdom
(`applyEditsToTable` + real `applyStickyColumn` against `mgv.html`): only
the "Edit action" cell ends up colored, the sticky "Edit#" cell and every
other cell in the row are unaffected (regression check).

## 2026-07-28 — extended to the "Edit#" column too

Same `editActionBg` value now also applied to the "Edit#" cell (the one
`addCell(a)` returns), with the same `data-mb-custom-cell-bg` marker.
Since "Edit#" is the sticky column (index 0, `edits` sets no
`stickyColumn` override), this needed one more change beyond
`_buildEditRow`: `applyStickyColumn`'s sticky-cell branch unconditionally
overwrites its cell's background from a fresh `getComputedStyle` read (to
give it an opaque background for scroll-over-content purposes), which
would otherwise silently discard the color set at build time. Patched the
same way as the non-sticky loop already was: `cell.dataset.mbCustomCellBg`
now takes priority over the computed value. Verified via jsdom
(`applyEditsToTable` + real `applyStickyColumn` against `mgv.html`):
"Edit#" and "Edit action" now always match, every other cell still
unaffected (regression check).

## 2026-07-28 — independently configurable "Edit details"/"Edit notes" collapse

Both columns previously shared the global `sa_enable_annotation_collapse`
setting (default on, via `collapsableColumns: ['Edit details', 'Edit
notes']`), same as the "Annotation" column. Split into two new,
independent settings — `sa_edits_enable_details_collapse` /
`sa_edits_enable_notes_collapse` — **defaulting to off** (uncollapsed
initially), unlike Annotation's default-on. `initCollapsableColumns`'s
`_annotationCollapseEnabled` computation (which gates whether a prose
column's cells get the actual height-clamp + toggle, vs. staying bare —
see the existing `.mb-text-clamp-marker`/`.mb-text-clamp-inner` split
documented in this project's CLAUDE.md) now branches on `colName`: "Edit
details"/"Edit notes" read their own setting, every other prose column
(Annotation, and any future one) is completely unaffected and keeps
reading the shared global setting exactly as before.

Not testable end-to-end via jsdom (the overflow check compares
`scrollHeight`/`clientHeight`, which jsdom never computes — it has no real
layout engine, always returns 0). Verified the decision logic itself in
isolation instead: extracted the exact ternary and ran it against 8 cases
(both new settings unset/true/false, and an unrelated column to confirm
zero effect on the existing global-setting behavior) — all correct.

## 2026-07-28 — collapse handles were missing entirely when uncollapsed by default

The previous fix misread what "uncollapsed by default" should mean. It
gated `_annotationCollapseEnabled` off for "Edit details"/"Edit notes"
when the new setting was false (the default) — but per
`initCollapsableColumns`'s own existing comment, `_annotationCollapseEnabled
= false` means the ENTIRE clamp/toggle mechanism is skipped, not just the
initial visual state: `_proseOverflowing` is unconditionally `[]`, so no
`.mb-cell-collapse-toggle` ever gets built for any cell, and
`collapsibleCount === 0` also suppresses the column-header "collapse
all"/"expand all" button. Net effect: zero way to manually collapse a
cell or the whole column, exactly as reported — not a cosmetic miss, a
complete loss of the interactive feature for these two columns whenever
the (now-default) setting was off.

Real fix: the clamp/toggle machinery must always stay active for these
two columns (`_annotationCollapseEnabled` is now unconditionally `true`
for them, decoupled entirely from the new settings). What the settings
actually control is the *initial* expand state, via a new
`expandedCells` pre-population step: on the first `initCollapsableColumns`
pass after a fetch (only), every overflowing "Edit details"/"Edit notes"
cell gets `expandedCells.set(key, true)` before `startExpanded` is read —
i.e. exactly as if the user had already clicked each one open. From that
point on these cells are indistinguishable from any other manually-toggled
cell: same toggle, same `expandedCells`-backed persistence across
sort/filter re-renders, same manual collapse/expand at any time. A new
`_editsProseDefaultExpandedCols` Set (declared next to `expandedCells` and
`_areaFlagRegionCorrected`, cleared at the same 3 call sites those two
already are — `startFetchingProcess` and both disk-load branches) tracks
which columns have already had this one-time pre-population applied for
the current fetch, so a user's later manual collapse (which deletes the
`expandedCells` entry) isn't silently re-expanded on the next re-render.

The two settings' semantics flipped accordingly: `true` now means "start
this column collapsed" (opt into the classic Annotation-style default),
`false` (still the default) means "start expanded" — labels/descriptions
updated to match ("Start … column collapsed", explicitly noting the
toggle is always available either way). Setting keys themselves
(`sa_edits_enable_details_collapse`/`sa_edits_enable_notes_collapse`)
were kept unchanged to avoid unnecessary churn on already-shipped WIP
settings.

Verified the state machine in isolation (real `scrollHeight`/
`clientHeight` overflow detection can't be tested under jsdom, same
limitation as before): fresh-fetch pass auto-expands all overflowing
cells; a simulated manual collapse (delete from the map) correctly
survives a second "re-render" pass without being re-forced open; a brand
new fetch (both tracking structures cleared) correctly re-defaults from
scratch; `editsStartCollapsed = true` never auto-expands anything
(matches the classic behavior exactly); an unrelated column is completely
unaffected in every scenario.

## 2026-07-28 — collapse-state summary widgets didn't reflect start-expanded

Individual cells correctly started expanded after the previous fix, but
both aggregate UI widgets — the global `#mb-col-collapse-all-btn` and the
per-column `.mb-col-collapse-hdr-btn` header glyph — still showed "▶
Expand all" / `aria-expanded="false"` regardless. Root cause: both were
simply *hardcoded* to the collapsed initial state
(`collapseHdrBtn.setAttribute('aria-expanded', 'false')` unconditionally;
`globalBtn.innerHTML = makeCollapseExpandBtnHTML(true)` with the comment
"Reset to collapsed state on every (re-)init") — reasonable for every
column that always defaulted to collapsed, but never updated to account
for a column whose cells might legitimately start expanded instead.

Fixed by tracking whether any cell actually started expanded and
reflecting that in both widgets' initial glyph/`aria-expanded`/title:
- New per-column `_anyCellStartedExpanded` flag, set from the same
  `startExpanded` value already computed in both the multi-row (list) cell
  loop and the prose cell loop — whichever cell type a given collapsable
  column happens to use. The column-header button's glyph/aria-expanded/
  title now key off this instead of a hardcoded `false`.
- New outer-scoped `anyCellInAnyColumnStartedExpanded`, OR-accumulated
  across every column processed by this `initCollapsableColumns` call,
  drives the global button's initial `makeCollapseExpandBtnHTML(...)` call
  and title the same way.
- Not tri-state by design: on the very first render after a fetch a
  column's cells are always uniformly all-expanded or all-collapsed —
  nothing in the current pre-population design produces a genuine mixed
  state at that point — so "any cell started expanded" is an equally
  correct signal as "all cells started expanded" would be here, and
  simpler to compute.

Scoped only to the single-table-mode global-button wiring inside
`initCollapsableColumns` (the `!isMultiMode` branch) — `edits` is always
`tableMode: 'single'`, and no multi-table column currently has any
pre-expand behavior, so `rewireGlobalCollapseButtonMulti()`'s separate
implementation was intentionally left untouched.

Not verified end-to-end (same jsdom layout-engine limitation as the
previous two entries — `initCollapsableColumns` also has a much larger
helper-function dependency surface than `applyEditsToTable`/
`applyStickyColumn`, making full extraction impractical here); verified
by careful manual trace of the exact variable flow instead — confirmed
`_anyCellStartedExpanded`/`anyCellInAnyColumnStartedExpanded` scoping,
assignment points, and every place each is read.

## 2026-07-28 — old/new diff-cell highlighting in "Edit details"

MusicBrainz's own site CSS (static.metabrainz.org/MB/common-*.css) colors
old/new diff cells inside `.edit-details` compare tables:

```css
table.details td span.new, table.details td.new { background: #e4fbe4 }
table.details td span.old, table.details td.old { background: #fbe3e4 }
```

Both selectors require a real `<table class="details">` ancestor. Since
`_detableify()` converts that outer `<table>` into a `<div class="…
mb-dt-table">` (necessary to avoid corrupting this script's own
table-wide row-processing — see the earlier `rowspan`/`colspan` entry),
the `.old`/`.new` classes still land intact on real `<td>`/`<span>`
elements in the clone, but MusicBrainz's selector no longer matches
anything — no CSS rule, no color, on either a live page (whose stylesheet
is loaded) or a fetched one (which has none anyway).

Fixed the same way as the "Edit#"/"Edit action" background colors:
replicate the effect independently rather than depending on MusicBrainz's
stylesheet. `_ensureDetableifyStyle()` (already the single place that
patches in CSS `_detableify()`'s conversion broke) now also injects
`.mb-dt-table td.new, .mb-dt-table td span.new` /
`.mb-dt-table td.old, .mb-dt-table td span.old` rules — same descendant
shape as MusicBrainz's own selector, just swapping the now-gone
`table.details` ancestor requirement for the `.mb-dt-table` marker class
`_detableify()` already stamps on the converted element. Configurable via
new `sa_enable_edits_diff_colors` (default on) / `sa_edits_color_diff_new`
(`#e4fbe4`) / `sa_edits_color_diff_old` (`#fbe3e4`) — defaults copied
directly from MusicBrainz's CSS file, per the request.

Verified via jsdom against the exact "Edit recording" example from
`debug/mgv.html` (`<td class="old">`/`<td class="new">` diff cells): the
injected `<style>` block (into the live `document`, not whichever
fetched-page `docContext` triggered the call — only the live document's
`<head>` is ever actually rendered) contains the correct default colors
when enabled, contains neither rule at all when
`sa_enable_edits_diff_colors` is off, and the nearest `.details`-derived
ancestor of the diff cells is confirmed to be a `<div>` (not a `<table>`),
matching what the new selector actually targets.

## 2026-07-28 — diff colors lost on zebra-striped "even" (grey) rows only

Reported: `.old`/`.new` diff cells inside "Edit details" colored correctly
on white ("odd") rows but not on grey ("even") ones — same markup,
`.mb-dt-table td.old`/`.mb-dt-table td.new` present either way, only the
grey-row case failed to paint. Not a selector-matching bug (the class and
DOM shape are identical in both quoted examples) — a CSS cascade fight:
the new rule (`.mb-dt-table td.old`, specificity 2 classes + 1 type) has
*higher* specificity than a plausible MusicBrainz zebra rule
(`tr.even td`, 1 class + 1 type) and should still lose only if that rule
carries `!important` — consistent with several existing comments elsewhere
in this file about MusicBrainz's own zebra/tint CSS using `!important`
and reaching cells at any depth (a descendant selector, not just direct
children), and consistent with the observed asymmetry: "odd"/white rows
have no such rule to conflict with (default/unstyled background), so nothing
needed to win against there. Fixed by adding `!important` to both
declarations in `_ensureDetableifyStyle()` — the same "must beat
MusicBrainz's own `!important` zebra/tint rule" pattern this codebase
already uses in `applyStickyColumn`'s sort-tint blending. Verified the
literal `!important` is present in the injected CSS string for both
colors via jsdom (can't verify actual cascade-winning against a live
MusicBrainz stylesheet without a real browser — jsdom has no external
stylesheet to conflict with in the first place, which is exactly why this
particular failure mode was never visible in any of the earlier jsdom
verification passes for this feature).

## 2026-07-28 — zebra striping for nested tracklist tables + configurable row-hover color

Screenshots comparing a native "Edit medium" page against the rendered
version showed two related problems in the nested "Old tracklist"/"New
tracklist" compare grid inside "Edit details": no zebra striping at all
(uniform, unstyled rows), and hovering the row made the thin `#ddd` cell
borders nearly invisible.

1. **Zebra striping** — same class of bug as the old/new diff colors,
   confirmed by re-checking `_detableify()`: it copies *all* attributes
   from the original element when converting `<tr>` → `<div class="…
   mb-dt-tr">`, so the native `odd`/`even` class survives intact (e.g.
   `<div class="edit-medium-track odd mb-dt-tr" style="display: table-row;">`).
   Nothing colors it though — MusicBrainz's own zebra CSS requires a real
   `<tr>` ancestor it no longer has, and `_ensureDetableifyStyle()` didn't
   yet have a replacement rule for it (unlike the old/new diff cells,
   which it already patches). Added `.mb-dt-tr.odd`/`.mb-dt-tr.even`
   background rules, `!important` for the same defensive reason as the
   diff colors. Colors are NOT sourced from MusicBrainz's stylesheet this
   time (user chose reasonable defaults over chasing the exact values):
   new `sa_edits_color_zebra_odd` (`#ffffff`) / `sa_edits_color_zebra_even`
   (`#f2f2f2`) settings.
2. **Row hover swallowing the nested grid's borders** — investigation
   found `applyStickyColumn`'s hover handler already reads
   `Lib.settings.sa_ui_row_hover_bg || '#e2e2e2'`, but `sa_ui_row_hover_bg`
   had **no `configSchema` entry at all** — a setting that looked wired up
   in code but was never actually exposed in the settings menu, so it was
   permanently stuck on `#e2e2e2`. Fixed generally (benefits every table
   this script renders, not just edits) by adding the missing schema
   entry, grouped with the other `*_hover_bg` settings.
   Separately: that JS-driven hover handler only ever touches the *outer*
   row's direct `<td>` children — it can't reach arbitrarily-nested
   `<td>`/`<th>` elements inside a de-tableified grid. Whatever was
   actually darkening those is almost certainly MusicBrainz's own native
   hover CSS reaching arbitrary depth (same descendant-selector pattern
   already established for its zebra rule) — a JS-only fix wouldn't touch
   that. Added a pure-CSS `tr:hover .mb-dt-table td, tr:hover
   .mb-dt-table th { background: ... !important; }` rule instead, reading
   the now-real `sa_ui_row_hover_bg` value — no JS event wiring needed,
   the browser's native `:hover` pseudo-class handles activation/
   deactivation automatically, and it composes cleanly with the existing
   JS handler (different DOM elements — outer cell vs. nested descendants
   — so no conflict). This rule's extra `tr` type selector gives it higher
   specificity than the zebra rule (`.mb-dt-tr.odd`), so hovering
   correctly overrides zebra without relying on source order, and rows
   revert to their zebra color on mouse-leave automatically.

Verified via jsdom: a synthetic "Edit medium" block with a nested nested
`<table class="tbl">` tracklist compare grid (odd/even rows) — confirmed
the injected `<style>` contains all three rules with correct
colors/`!important` for both default and custom settings, the `odd`/`even`
classes correctly survive on real `<div class="mb-dt-tr">` elements, and
zero real `<table>`/`<tbody>`/`<tr>` remain nested inside `.edit-details`
(regression check for the original nested-table-corruption fix — this is
the first test data with a table nested *two* levels deep: the compare
grid inside the "Tracklist:" row inside the outer `.edit-details` table).
As with the earlier `!important`/cascade fix, actual visual
hover/cascade behavior against MusicBrainz's real stylesheet can't be
verified without a live browser (jsdom has no external stylesheet to
begin with).

## 2026-07-28 — zebra striping still not showing on grey ("even") rows

Reported after reloading the branch with the fix above installed: the
nested "Old tracklist"/"New tracklist" compare grid still shows no zebra
striping on grey rows — same symptom the `!important` fix for the old/new
diff colors already solved once for a *different* rule in this same
function, so this needed fresh investigation rather than assuming another
`!important` gap.

Root cause this time was different: the shipped rule
(`.mb-dt-tr.even { background: ... !important; }`) sets the background on
the **row** `<div>` and relies on it painting through to the real
`<td>`/`<th>` children (`.mb-dt-cell`), which this script's own CSS gives
no background of their own — so in principle it *should* show through a
transparent cell. But this is the exact same lesson already documented
above (2026-07-25, "row background colour fix didn't actually work"):

> MusicBrainz's native zebra CSS targets `tr.even > td`/`tr.odd > td`
> **directly**, not `<tr>`. That means every `<td>` gets a real, opaque,
> non-transparent background straight from that class rule.

MusicBrainz's stylesheet colors cells directly rather than relying on
row-to-cell paint-through, and — same as before — that pattern can't be
assumed absent just because the specific selector that broke it last time
(`tr.even > td`, which requires a real `<tr>` ancestor `_detableify()`
already removes) doesn't apply verbatim here. Whatever the actual
conflicting rule is, depending on background paint-through at all is
fragile: the "odd" row's color (`#ffffff`) is visually indistinguishable
from "no background set", so that half of the rule was never actually
confirmed to paint anything — only the "even"/grey case was falsifiable,
and it failed.

Fixed by moving the win condition, not chasing the specific conflicting
rule: `.mb-dt-tr.odd`/`.mb-dt-tr.even` now also set `background` directly
on their `> .mb-dt-cell` children (comma-combined with the existing
row-level selector, not replacing it), using the same `.mb-dt-cell` marker
class `_detableify()` already stamps on every real `<td>`/`<th>` — matching
how MusicBrainz's own equivalent rule always colors the cell itself, so
nothing can sit on top of it. `<td>`/`<th>` are always direct children of
their row's converted `<div class="mb-dt-tr">` (`_detableify()` only
retags `table`/`thead`/`tbody`/`tfoot`/`tr`, never moves cells relative to
their immediate parent), so the child-combinator selector reaches every
cell.

This raised the zebra rule's specificity from 2 classes to 3
(`.mb-dt-tr.even > .mb-dt-cell`), which tied/exceeded the row-hover rule's
previous selector (`tr:hover .mb-dt-table td`, 2 classes + 2 elements) on
the class digit alone — hover would have stopped winning against zebra on
nested cells. Fixed by strengthening the hover rule to
`tr:hover .mb-dt-table .mb-dt-cell` (3 classes + 1 element, still beats the
zebra rule's 3 classes + 0 elements via the element-count tiebreak), which
also simplifies it back to one selector instead of a `td, th` pair since
`.mb-dt-cell` already covers both.

Verified via jsdom (extended `test_zebra_hover.js`): the injected `<style>`
contains both the row and `> .mb-dt-cell` selectors for `.odd`/`.even` with
correct colors/`!important` for default and custom settings, the hover
rule now targets `.mb-dt-cell` instead of `td, th`, and every zebra row's
direct children in the synthetic "Edit medium" tracklist fixture do carry
`.mb-dt-cell` (confirming the new selector actually reaches them). Real
cascade-winning behavior still can't be verified without a live browser —
asked the user to reload and confirm visually.

## 2026-07-29 — "Edit notes" column filter highlighting the wrong column (`filter-bug.org`)

`editNotes-filter-bug.html` (`/edit/subscribed_editors`, snapshot supplied
by the user together with two screenshots): filtering the "Edit notes"
column for `lias` highlighted "alias" inside the *"Edit details"* column
instead (both rows' "(view all aliases)" text lit up), and filtering
`lias,` (trailing comma) correctly narrowed to the single row whose Edit
notes text is "Main alias, at least currently." but produced no highlight
anywhere at all.

Root cause: `highlightText()` targeted a column by indexing a **flat,
recursive** `row.querySelectorAll('td')` NodeList with `targetColIndex`
(originally a `row.cells`-based index, the same one `testRowMatch()` uses
via `f.idx`). Every edit's `.edit-details` block is de-tableified
(`_detableify()`) but — per that function's own JSDoc — deliberately keeps
`<td>`/`<th>` as real elements (needed for `rowspan`/`colspan`), so an
"Edit details" cell that itself lives at `row.cells[2]` still contains
several nested real `<td>` elements (its own "Label:"/value,
"Alias:"/value, … pairs). Those nested cells get counted into the same
flat sequence as top-level columns, so any column after "Edit details" in
DOM order — "Edit notes" here — has its `f.idx` collide with one of those
nested cells instead of its own real `<td>`. Row matching itself (which
correctly uses `row.cells[f.idx]`, unaffected by nested `<td>`s) was never
wrong — only the highlight lookup was.

This is not something the `edits` column-reorder work (`WIP.2`)
introduced — the same flat-vs-direct-child index mismatch already existed
for "Edit notes" in the original column order (where it was the very last
column, after "Edit details"). The reorder only made the symptom visible
in a *different*, more confusing way (highlighting appears to land in
"Edit details" specifically) because "Edit details" now sits immediately
to its left rather than several unaffected columns away.

Fixed in `highlightText()`: for a specific target column
(`targetColIndex !== -1`), resolve `row.cells[targetColIndex]` directly
(matching `testRowMatch()`'s indexing) instead of counting through a flat
`querySelectorAll('td')`; `highlightCrossTag()` still walks that cell's
full subtree, so nested de-tableified content is still searched
correctly. The global-filter case (`targetColIndex === -1`, which
legitimately needs to reach every `<td>` at every depth) is unchanged.

## 2026-07-29 — `user-edits`/`user-open-edits` page types

`edits-by-vzell.html` (`/user/vzell/edits`) and `open-edits-by-vzell.html`
(`/user/vzell/edits/open`, no open edits at capture time — empty `div.edit-list`
set): same native `div.edit-list` block sequence the existing `edits` page
type already converts via `applyEditsToTable()`/`_buildEditRow()` — identical
`.edit-header`/`.edit-description`/`.edit-details`/`.edit-notes` shape, same
`ul.pagination` widget (this account's `/edits` snapshot shows "Found at
least 500 edits" with a double-ellipsis milestone window, i.e. the same
ambiguous-pagination case `_hasAmbiguousEditsPagination()` already handles
generically).

One difference from every page `edits` covers (`/search/edits`,
`/edit/subscribed(_editors)`, `/<entity>/<mbid>/edits`): those pages have no
native `<h2>` left after `applyEditsToTable()` removes every `div.edit-list`
(each carries its own `<h2>Edit #… - …</h2>`, which goes with it), which is
why `edits` needs `insertH2: 'Edits'`. The two user pages already have a
real, page-level `<h2>` ahead of all the `div.edit-list` blocks:
`<h2>Edits by <username></h2>` / `<h2>Open edits by <username></h2>`. Since
`updateH2Count()`'s single-table fallback (no `insertH2`/`rowTargetSelector`
on the page def) just walks `document.querySelectorAll('h2')` and keeps the
last one that still precedes `table.tbl` in document order, this native h2
is picked up automatically — no `insertH2` needed, and adding one would just
inject a redundant second heading.

Added `user-edits` (`/user/<username>/edits`) and `user-open-edits`
(`/user/<username>/edits/open`) page types, both reusing `edits`'s
`editsToTable`/`unboundedPagination`/`collapsableColumns`/`addCAA` feature
set verbatim, minus `insertH2`. Also had to extend the `@include` header's
`/user/<username>/(?:subscriptions|…|tags|tag\/)` regex — it did not
previously include `edits`/`edits/open`, so the userscript would not have
activated on these URLs at all.

### Follow-up: page failed to load at all ("Required elements not found")

Reported live on `/user/vzell/edits` right after the above landed:

```
[VZ-ShowAllEntityData: user-edits] Initializing script for path: /user/vzell/edits
[VZ-ShowAllEntityData: user-edits] ❌ Required elements not found. Terminating. {pageType: 'user-edits', hasHeader: false}
```

`pageType` detection worked fine — the failure is `hasHeader: false`. Root
cause: these two pages render **no `<h1>` at all** (confirmed both live and
in `edits-by-vzell.html`/`open-edits-by-vzell.html` — `grep -c "<h1"` on
both is `0`). The init block's `headerContainer` chain
(`ShowAllEntityData.user.js` ~line 19669) is a pure `||` fallback of
`h1`-scoped selectors (`.artistheader h1`, `h1 a bdi`, `#content h1`, bare
`h1`, …) with nothing that ever falls back to an `<h2>` — so on a page with
zero `<h1>` elements it evaluates to `null` regardless of what else is on
the page, and the very next check (`if (!pageType || !headerContainer)`)
aborts before `startFetchingProcess` is ever wired up. This is a real gap
in the init logic, not something the debug snapshots could have caught
without deliberately checking for an `<h1>` — the page content the
snapshots captured (`div#content` onward) never included one either way.

Fixed by adding a fallback scoped specifically to
`pageType === 'user-edits' || pageType === 'user-open-edits'`: when no
`<h1>`-based selector matched, use `#content h2` (falling back to a bare
`h2`) instead — the native "Edits by …"/"Open edits by …" heading these
pages do have. Deliberately scoped to just these two page types rather than
a blanket "no h1 → grab any h2" rule, since that could mask a genuinely
missing header on some other page type by silently latching onto an
unrelated `<h2>` elsewhere on the page. Verified against both real
snapshots via jsdom: `headerContainer` resolves to `null` before the fix
and to the correct native h2 (`"Edits by vzell (newest first)"` /
`"Open edits by vzell"`) after it.

Checked every other consumer of `headerContainer` further down in the init
block (button-controls insertion, `applyH1CommentSpanRelocation`, the
status-displays wrapper) — all three already do
`headerContainer.tagName === 'H1' ? headerContainer : (headerContainer.closest('h1') || headerContainer)`
or equivalent, i.e. they already degrade to "use headerContainer itself"
whenever no ancestor `<h1>` exists, so none of them needed changes to cope
with headerContainer now sometimes being an `<h2>` with no `<h1>` ancestor
at all.

## 2026-07-29 — `user-edits`/`user-open-edits` cram everything onto one heading (`user-edits-wrong.org`)

`debug/user-edits-wrong.org` dumps the fully-rendered `<h2>` from
`/user/vzell/edits` after clicking "Show all Edits for User": it contains
the "Edits by vzell (newest first)" text, the ENTIRE button toolbar
(`#mb-show-all-controls-container` — Show all Edits, Stop, Save/Load,
Resize/Visible/Density/Stats/Export, Shortcuts/Settings/Help), the row-count
badge (`.mb-row-count-stat`), the CAA toggle button, and the ENTIRE filter
bar (`#mb-filter-container` — global filter, history dropdown, highlight/
collapse/clear buttons, status display) — plus `mb-toggle-h2`/
`mb-h2-processed` classes and a "▼" toggle icon, meaning
`makeH2sCollapsible()` made the whole thing one collapsible section. Every
other page type keeps these on two separate lines (`<h1>` = title +
buttons, `<h2>` = count/CAA/filter), because they have a real `<h1>`
already. These two pages don't (see the previous entry above) — there is
only the one native `<h2>`, so both the page-load button-toolbar injection
and the post-render filter/count/CAA injection resolve to it.

Fix (matches the user's own diagnosis, and the exact pattern
`artist-tags`/etc. already use with `renameH2ToH3`+`insertH2`): added a new
`applyRenameH2ToH1()` DOM pre-processing function (mirrors
`applyRenameH2ToH3()` — same attribute-copy / child-node-move /
`replaceChild` approach, just promoting to `<h1>` instead of demoting to
`<h3>`), gated on a new `features.renameH2ToH1: true`. Gave both page types
`renameH2ToH1: true` plus `insertH2: 'Edits'` / `insertH2: 'Open edits'`.

First jsdom run against the real `debug/edits-by-vzell.html` snapshot
caught a real bug in the naive "rename every `<h2>` in the document"
approach (copied verbatim from `applyRenameH2ToH3`, which never needed to
worry about this): every one of the 50 real edits on that page still
carries its OWN native `<h2>Edit #NNNNNN - Action</h2>` heading at this
point in the pipeline (`applyRenameH2ToH1` runs BEFORE
`applyEditsToTable()` has removed the `div.edit-list` blocks) — the naive
version promoted all 51 `<h2>`s (the page heading + all 50 per-edit
headings) to `<h1>`, instead of just the one intended. Fixed by adding the
exact same `!h.closest('div.edit-list')` exclusion `applyInsertH2()`
already uses for its own `<h3>` search, for the identical underlying
reason.

Re-verified the full pipeline (`applyRenameH2ToH1` → `applyInsertH2` →
`applyEditsToTable`'s block-removal) against both real snapshots: exactly
one `<h1>` (the original heading text) and one `<h2>` ("Edits"/"Open
edits") remain, in the correct `<h1>` → `<h2>` → `table.tbl` document
order, with all 50 per-edit headings gone (removed along with their
`div.edit-list` blocks, as already happens for every other `editsToTable`
page). `open-edits-by-vzell.html` (zero open edits at capture time) behaves
the same way minus the row conversion — `applyEditsToTable` still early-
returns when there are no `div.edit-list` blocks to convert, same as
before this fix, not a new regression.

## 2026-07-29 — `notes-received` page type (`/edit/notes-received`)

`notes-received.html` ("Recent notes left on your edits"): has a native
`<h1>` (unlike `user-edits`/`user-open-edits` above — no `renameH2ToH1`
needed here) but no `<h2>` at all, matching base `edits`'s situation. Only
3 columns worth of data exist: no `.my-vote`/`.vote-count`/
`.edit-expiration`/`.entered-from`/`.edit-details`/`p.subheader` anywhere on
the page — just the edit heading and the note(s) left on it.

First read of the raw (minified, one-line) HTML dump miscounted the closing
`</div>` tags and concluded `div.edit-note` was a separate element
following each `div.edit-list` as a SIBLING, not nested inside it — leading
to an initial implementation that looked up `block.nextElementSibling` for
the note and produced "N/A" in every "Edit notes" cell when tested. Loading
the actual snapshot into jsdom and inspecting `div.edit-list`'s real
`.children` immediately disproved this: `div.edit-note` is nested INSIDE
`div.edit-list`, as its second child (sibling of `.edit-header`, both
direct children of `div.edit-list`) — i.e. `div.edit-list` here is
self-contained, exactly like the regular `edits` page type, just far
sparser (only `.edit-header` + one `.edit-note`, none of the other
sub-elements). Lesson: for a large minified single-line HTML dump, don't
manually count nested closing tags — load it and query the actual DOM.

Fixed by changing the note lookup to `block.querySelector('.edit-note')`
(a normal descendant query) and simplifying the removal step back to
`blocks.forEach(block => block.remove())` (mirrors `applyEditsToTable`
exactly, since each `div.edit-list` is fully self-contained here too).
When an edit received multiple notes, MusicBrainz repeats the WHOLE
`div.edit-list` block (header + that one note) once per note rather than
nesting multiple notes under one heading — confirmed against the real
snapshot: edit #104823906 appears as two separate `div.edit-list` blocks,
each with a different note, and both round-trip correctly into two
separate table rows.

Added `applyNotesReceivedToTable()`/`_buildNotesReceivedRow()` (deliberately
not reusing `applyEditsToTable`/`_buildEditRow`, which assume columns this
page doesn't have) gated on a new `features.notesReceivedToTable: true`,
wired into the same pre-processing slot as `applyEditsToTable` (including
the fetched-page loop and the ambiguous-pagination early-stop check — this
page's pagination widget shows the same double-ellipsis milestone window).
`insertH2: 'Edit Notes'` provides the filter/count anchor, same reasoning
as base `edits`. Also extended the `@include` header's
`edit/subscribed(_editors)?` alternative to
`edit/(?:subscribed(?:_editors)?|notes-received)` — it did not previously
match this URL.

Re-verified the full pipeline (`applyInsertH2` → `applyNotesReceivedToTable`)
against the real snapshot: exactly one `<h1>` (original text) and one `<h2>`
("Edit Notes") remain, in the correct `<h1>` → `<h2>` → `table.tbl` order;
50 rows produced (0 `div.edit-list` remain, including the duplicate-block
case); each row's "Edit notes" cell contains the actual author/date/note
text (including a row with an `.edit-note-modified-text` "Last modified…"
line, confirmed present in the cloned cell).

### Follow-up: added User / Date-Time columns

Added `User`/`Date/Time` columns between `Edit action` and `Edit notes`,
parsed from the note's own `<h3>` (author link + date link) — e.g.
`<h3 class="yes"><a href="/user/tigerman325">…<bdi>tigerman325</bdi></a>
<div class="voting-icon"></div> <a class="date" href="/edit-note/NNN">2025-02-04
17:29 GMT+1</a></h3>`. Queried both anchors directly
(`a[href^="/user/"]` / `a.date`) rather than by sibling position, so the
optional `<div class="voting-icon">` MusicBrainz inserts between them (only
present when the `<h3>` carries a vote-outcome class like `yes`/`no`/
`abstain`/`approve`) doesn't need special-casing. Verified via jsdom against
the real snapshot for both a plain `<h3 class="">` row and the exact
`tigerman325`/`class="yes"` example with the voting-icon present — both
correctly extract the user link (with avatar + username, hyperlink intact)
and the date link (hyperlink to that specific `/edit-note/NNN` intact).

### Follow-up: added Vote column

Added a `Vote` column right before `Edit notes`, extracted from the same
note `<h3>`'s own class — `yes`/`no`/`abstain`/`approve` (`""` = no vote
cast alongside the note). MusicBrainz normally renders this via the
adjacent `<div class="voting-icon"></div>` — always empty in the markup,
its actual glyph comes entirely from the site's own external CSS
(background-image keyed off the `<h3>` class), which a detached/fetched
page has no access to — same class of unreliability already documented for
`_editActionBgColor`'s edit-type colors. Added a small `_NOTE_VOTE_GLYPHS`
lookup (👍 yes, 👎 no, ➖ abstain, ✔️ approve) supplying our own fixed
glyph instead, prefixed onto the class text (e.g. "👍 yes").

Verified via jsdom against the real snapshot: found and correctly extracted
all four non-empty vote classes present on the page (6× `yes`, 1× `no`,
1× `abstain`, 1× `approve`, the rest `""`), and confirmed the no-vote case
falls back to `N/A` like every other empty cell on this page.

## 2026-07-30 — native Annotation section "Show more..." (`showmore.html`, branch feature/annotation-auto-expand-showmore)

- `showmore.html` (live snapshot of a `/work/<mbid>` page's own native
  Annotation section): confirmed the exact DOM shape MusicBrainz renders
  for a truncated annotation —
  ```html
  <div class="annotation">
    <h2 class="annotation">Annotation</h2>
    <div class="annotation-body annotation-collapsed">
      <h2>Official BMI registration</h2>
      <p><bdi>...</bdi></p>
    </div>
    <p><a class="annotation-toggle" href="#">Show more...</a></p>
    <div class="annotation-details">Annotation last modified by ...</div>
  </div>
  ```
  `annotation-collapsed` is the clamp class; `a.annotation-toggle` is MB's
  own native "Show more..." link — not previously referenced anywhere in
  this script (confirmed via grep, zero prior hits).
- This section lives on **bare entity pages** (`/work/<mbid>`,
  `/artist/<mbid>`, etc.), which have **no** `pageDefinitions` match — the
  init block's `if (!pageType || !headerContainer) return;` bailout
  (`ShowAllEntityData.user.js` ~line 20040) means the script currently does
  nothing at all on these URLs, even though the `@include` on line 16
  already covers them. `makeH2sCollapsible()` and the page-level-H2
  machinery never run there either — not the right hook for this feature.
- Implemented `autoExpandNativeAnnotation()`, called unconditionally
  *before* page-type detection (guarded only by the new
  `sa_enable_annotation_auto_expand` setting), which simply calls
  `.click()` on every `a.annotation-toggle` found — deferring to MB's own
  click handler rather than replicating its collapse/expand DOM logic.

## 2026-07-31 — account-applications CSP style-src breakage (branch fix/account-applications-csp-style-src)

- Root cause: MusicBrainz's backend serves `/account/*` pages directly
  (`server: Plack::Handler::Starlet`) with a `style-src 'self'
  staticbrainz.org static.metabrainz.org` CSP (no `unsafe-inline`), unlike
  general content pages (`/artist/...`, `/release-group/...`) which are
  served via an edge layer (`server: openresty`) with **no** CSP header at
  all (verified via `curl -I`). Confirmed via a live browser console error
  pasted by the user: "Applying inline style violates... style-src...".
- Two independent CSS-injection patterns are both CSP-vulnerable and both
  found in use:
  1. `document.createElement('style')` + `document.head.appendChild()` for
     shared stylesheets — 9 sites in `ShowAllEntityData.user.js` (sticky
     headers, main toolbar chrome, dialog hover states, sidebar toggle,
     relationships-icon column, edit-diff table colors, Unicode picker),
     all converted to `GM_addStyle()` (WIP.1). Two more sites in
     `VZ_MBLibrary.user.js` (`resizingStyleEl` cursor-lock helper, used
     twice) converted the same way.
  2. `container.innerHTML = \`...style="..."...\`` — inline `style=`
     attributes embedded in HTML-template strings are *also* covered by
     CSP `style-src` (confirmed by the browser's own violation wording:
     "hashes do not apply to event handlers, style attributes..."). Found
     in `VZ_MBLibrary.user.js`'s settings dialog (`showModal`, ~50
     attributes across the shell + all per-row setting-type widgets:
     checkbox/number/text/color-picker/popup-dialog sub-fields/keyboard-
     shortcut capture/function+table buttons) and its changelog viewer
     (`show`, ~25 attributes) — both fixed by moving styling to
     `GM_addStyle()`-injected stylesheets keyed by id/class (WIP.2). Also
     found and fixed one `onfocus`/`onblur` inline-event-handler pair in
     the changelog search box (replaced with a CSS `:focus` rule — inline
     event-handler attributes are restricted the same way, under
     `script-src`, and we don't have the page's per-load nonce).
  3. `Object.assign(el.style, {...})` and `el.style.property = value` (JS
     CSSOM property mutation, as opposed to parsing an HTML `style=`
     attribute or `<style>` element) is **not** restricted by CSP — this is
     the pattern already used correctly for `showCustomDialog`/
     `showCustomConfirm` (the generic alert/confirm popup) and for the
     settings-row containers' own layout, and is why those already worked
     before this fix.
- **ALL FIXED (2026-07-31, WIP.9 — see below).** The full inventory of
  `innerHTML`-embedded `style="..."` attributes across
  `ShowAllEntityData.user.js` is now 0 (down from the original ~260 found
  at the start of this investigation); every remaining `style="` match in
  the file is inside a JSDoc/line comment describing markup, not live code
  (confirmed by grep). Fix history:
  **Fixed (2026-07-31, WIP.3):** `createFilterHistoryWidget` (11
  attributes — hit on initial /account/applications page load via console
  errors even though nothing was visibly broken yet, since its dropdown
  panel stays `display:none` until the "History ▼" button is clicked;
  fixed via a new shared, id-guarded `_ensureFilterHistoryWidgetStyle()`
  stylesheet with classes `.mb-fhw-badge*`, `.mb-fhw-mark`,
  `.mb-fhw-lru-label`, `.mb-fhw-hist-row`, `.mb-fhw-hist-label`,
  `.mb-fhw-glyphs`, `.mb-fhw-empty`) and one missed leftover in
  `initSaUnicodeCharsFeature` (a separate inline `style="text-align:right"`
  on the picker's Close row, not part of the `<style>` block WIP.1
  converted).
  **Fixed (2026-07-31, WIP.4):** `showLoadFilterDialog` (49 attributes,
  including its `countFilteredRows`/nested-helper markup which the earlier
  grep-by-function pass mis-attributed as a separate top-level function —
  it's actually declared inside `showLoadFilterDialog`) — the "Load from
  Disk" dialog, confirmed via the user's screenshot: fully unstyled/stacked
  layout on the very first dialog open. Its own `_histGlyphs`/
  `_histHighlight`/`_renderHistSection` duplicate of
  `createFilterHistoryWidget`'s history-dropdown code was rewired to reuse
  the exact same `.mb-fhw-*` classes (renamed its local `sa-hist-row` class
  to `mb-fhw-hist-row` throughout); the dialog shell got its own dedicated
  `sa-load-dialog-style` stylesheet (id-guarded, injected once — safe since
  its few interpolated dynamic values only change via a settings save,
  which reloads the page).
  **Fixed (2026-07-31, WIP.5):** `buildMetaBlockHTML` (10 attributes — the
  "File Metadata" table shared by both the Save and Load dialogs; fixed via
  a new shared, id-guarded `_ensureMetaBlockStyle()` stylesheet with
  classes `.sa-meta-*`, including `.sa-meta-mode-badge` +
  `.sa-meta-mode-{multi,single}` modifier classes replacing the old
  `${modeColor}`-interpolated inline style — the mode is one of exactly two
  values so this needed no genuinely-dynamic CSS) and `showSaveDialog` (13
  attributes — the "Save Table Data" dialog shell, confirmed broken via the
  user's screenshot; same `sa-save-shell-style` id-guarded, injected-once
  pattern as `showLoadFilterDialog`'s shell, since its dynamic values are
  also settings-only).
  **Fixed (2026-07-31, WIP.6):** `showStatsPanel` (46 attributes, the
  biggest single-function fix so far — ~1570-line function). Almost every
  occurrence interpolated one of a handful of colors from the panel's own
  fixed, hardcoded palette object `C` (`C.accent`/`C.alert`/`C.muted`/etc,
  defined once near the top of the function, never settings-driven), so
  these collapsed cleanly into ~20 reusable `.sa-stats-*` classes
  (`_ensureStatsPanelStyle()`) instead of needing per-instance dynamic CSS
  — e.g. `.sa-stats-accent-600`/`.sa-stats-accent-700` for the two
  color+weight combos actually used, `.sa-stats-bbb`/`.sa-stats-faint`/
  `.sa-stats-muted-999` for the various "empty/placeholder" greys. One
  genuinely conditional case (`_sc`, picking `C.accent`/`C.alert`/
  `C.muted` based on a column's sort direction ▲/▼/none) was changed from
  computing a *color* to computing a *class name* (`_scClass`) instead —
  same pattern to reach for whenever a small, enumerable set of dynamic
  values feeds into what would otherwise be an inline style.
  **Fixed (2026-07-31, WIP.7):** `showExportDialog` (15 attributes) — the
  generic export dialog (CSV/etc "Save Data" flow, distinct from
  `showSaveDialog`'s full-table-serialization dialog); virtually identical
  shell to `showSaveDialog`/`showLoadFilterDialog`, same
  dedicated-id-guarded-injected-once `sa-export-shell-style` stylesheet
  pattern.
  **Fixed (2026-07-31, WIP.8):** `showEditPersistentListDialog` (49
  attributes — the biggest remaining function) — the "Edit Pinned Filter
  List" table-editor dialog (opened from the ✎ Edit Pinned Filter List
  button inside the filter-history dropdown). Its per-row rendering
  (`_eplRender`) computed a dynamic `rowStyle` string from 3 discrete
  selection states (selected/marked/neither) — same pattern as
  `showStatsPanel`'s sort-direction case — converted to a base
  `.sa-epl-row` class plus `.sa-epl-row-sel`/`.sa-epl-row-mrk` modifier
  classes (`rowClass` computed instead of `rowStyle`). The later
  `tr.style.background =`/`tr.style.outline =` JS property-assignment
  calls in `_eplSelectRow`/`_toggleMark` (already CSP-safe) are unaffected
  since inline styles still override classes — dynamic re-selection after
  initial render behaves identically to before. Also reused the shared
  `.mb-fhw-mark` class for its quick-filter highlight instead of yet
  another one-off `<mark style="...">` duplicate.
  **Fixed (2026-07-31, WIP.9 — final cleanup pass, closes this
  investigation):** all remaining small/scattered functions in one pass,
  since the user confirmed everything tested so far looked correct and
  asked to finish the rest rather than continue waiting for individual
  bug reports: `showRenderDecisionDialog` (7, the "Large Dataset Fetched"
  Save/Render/Cancel decision dialog), `showCtrlMTooltip` (5, the Ctrl+M
  shortcuts tooltip — one genuinely conditional case, `_ccColor`, changed
  to `_ccClass` following the now-established color→class pattern),
  `_saveSettingsConfig` (5, its own hand-built metadata block — reused
  the existing `.sa-meta-*` classes directly instead of duplicating them),
  `_relBuildTooltipHTML` (5, relationship-cell rich tooltips),
  `makeCollapseExpandBtnHTML` (3, the shared ▶/▼ collapse-toggle button
  label used all over the script), plus one-two-attribute sites in
  `showAppHelp`'s error fallback, `toggleAutoResizeColumns`'s and
  `renderRowsChunked`'s progress overlays, `makeButtonHTML` (mnemonic
  underline → `<u>` tag), `_mbttLabel`/`_mbttColName`/`_mbttCount` (rich
  hover-tooltip spans — colors read from `Lib.settings`, safe to
  cache as CSS classes since a settings change always reloads the page),
  and `ergInjectReleaseGroupButton`/`ergInjectReleaseButton` (identical
  "Error loading release(-group)" messages, deduplicated into one shared
  `.sa-erg-error` class). Verified 0 remaining `style="..."` attributes in
  live code file-wide (every remaining match is inside a comment) and that
  every class referenced via `class="..."` has a matching `GM_addStyle()`
  definition (cross-checked by script, not just visual inspection).
  User decided (2026-07-31) to fix these incrementally as each is found
  broken during further pageType testing, rather than blind-editing all
  ~260 in one pass with no way to visually verify each — then, once
  everything tested so far was confirmed working, asked to finish the
  remaining small functions in one final pass (WIP.9 above). Recurring
  pattern used throughout, for future reference: `[id="..."]`/class +
  `GM_addStyle()`-injected, id-guarded stylesheet, called idempotently
  either once per page load (fully static content) or once per dialog
  instance (content depends on values that only change via a settings
  save, which always reloads the page); for genuinely per-instance
  dynamic values (like the changelog viewer's nesting-depth-based
  color/font-size, or a row's selected/marked/sort-direction state), reach
  for a small fixed set of modifier classes and compute a *class name*
  instead of a *style/color value*.

## 2026-07-31 — Ctrl+M shortcuts tooltip never showing on /account/applications (WIP.10, non-CSP)

- Separate, unrelated bug found while verifying the CSP fixes above:
  pressing Ctrl+M on `/account/applications` produced zero visible
  tooltip (no console errors — genuinely never triggered). Root cause:
  `showCtrlMTooltip()` (`ShowAllEntityData.user.js`, ~line 9529) had
  `const contentDiv = document.getElementById('content'); ... if
  (!contentDiv) return;` right after building the tooltip's own
  `GM_addStyle()` stylesheet — this page type has no `div#content` (a
  flat `div#page` layout, same fact noted throughout this file's earlier
  `account-applications` entry), so the function returned before ever
  creating `ctrlMTooltipElement`. `contentDiv`/`sidebarDiv` were only
  actually needed later, for positioning the tooltip in the upper-right
  of `#content` without overlapping the sidebar — not for building the
  tooltip's content at all. Fixed by removing the early bailout and
  adding a `contentDiv`-absent branch in the positioning `setTimeout`
  that anchors the tooltip to the viewport's top-right corner instead.
- Also noted mid-session: the git working directory was switched to an
  unrelated branch (`fix/dropdown-flag-flat`, flag-icon dropdown
  decoration work) partway through this investigation, which is why
  `MB_PageEnhancer.user.js`'s `@grant GM_addStyle` and this file's own
  WIP changelog briefly appeared to have reverted — they hadn't; that
  branch simply never had this branch's commits. No actual regression;
  resolved by switching back to `fix/account-applications-csp-style-src`
  (working tree was clean, so the switch was lossless).
## 2026-07-31 — Country/Locality/Region flag icon in the unique-values dropdown (branch fix/dropdown-flag-flat)

- `with-flag.html` (raw MB markup, Canada example): confirmed the native
  Country flag shape — a bare `<span class="flag flag-XX">` with NO
  `<img>` child (CSS background-sprite only) — versus the third-party
  "More Flags Everywhere"/"Canadian Province Flags Everywhere" subdivision
  icon shape — `<span class="area-icon"><img class="flag flag-XX-prov"
  src="https://...svg"></span>` immediately preceding the place-name
  `<a>`. These are two structurally different techniques; the dropdown
  fix needed a different clone strategy for each (CSS-value baking via
  `getComputedStyle()` for the Country span, since it's pure CSS with zero
  markup of its own in this userscript; plain node cloning for the area
  icon, since it's a self-contained `<img>`).
- `florida.html` (full raw page snapshot) and
  `area-artists-with-flag-symbols.html` (full raw page snapshot, user-
  supplied): confirmed the US-state variant of the same subdivision icon
  uses a different class, `flag-custom-region`, and an inline base64
  data-URI SVG `src` instead of an external URL — same `span.area-icon`
  wrapper shape either way, so detection keys off the wrapper, never the
  `<img>`'s own class.
- `noord-holland.html` (single-cell raw snippet, user-supplied): a Region
  cell where the third-party userscript decorates the SOVEREIGN STATE
  link ("Kingdom of the Netherlands") with its own custom
  `area-icon`/`<img>` flag too, instead of leaving MusicBrainz's native
  `<span class="flag flag-XX">` alone — so the cell reads
  `<icon> Noord-Holland, <icon> Kingdom of the Netherlands` with two
  `area-icon` wrappers in one cell. This exposed a second, independent bug
  in the dropdown code (present for the Country column too, for
  multi-event cells): `countryFlagMap`/`areaIconMap` were keying each flag
  by a label parsed from that single flag's own adjacent text, but the
  dropdown's actual unique value is always the whole cell's combined text
  (`getCleanColumnText(cell)`, matching how `valueCounts` itself is
  built). A multi-flag cell's combined value never matched any single
  flag's own label, so the entry silently got no icon at all. Fixed by
  keying both maps on the cell's full `getCleanColumnText()` value and
  bundling every flag found in that cell into one wrapper `<span>`.

## 2026-07-31 (later) — Location/Place/Country-Date dropdowns (still branch fix/dropdown-flag-flat)

The "Release events" decoration attempt (commit `4286ba9`) was reverted
(`0052f8d`) per explicit instruction after a probe-based width-remeasurement
fix for it regressed the already-working Country column. That native
`<li class="flag flag-XX">` shape (script-rebuilt by `_rePopulateCell`, no
wrapping `<span>`/`<a>` at all) remains out of scope.

`'Location'`, source-column `'Place'` (Place-category reports, e.g.
`AnnotationsPlaces` — `place-no-H2-1.html`), and `'Country/Date'`
(`no-h2.html`/`edits-search.html`, native `.release-event >
.release-country/.release-date`) are a DIFFERENT, much lower-risk case:
their native markup is the exact same two shapes already fixed for
Country/Area — `<span class="flag flag-XX">` (optionally wrapping an `<a>`,
e.g. `release-country` just adds an extra class) and the third-party
`<span class="area-icon"><img></span>`. The only actual gap was that
`hasFlagIcons`' suffix match (`ountry`/`ocality`/`egion`/`rea`) never
matched these three exact column names. Fix: added them as exact-name
matches — no new DOM-shape handling, reusing the already-verified
`flagIconMap` scan/bake code untouched.

One real (not speculative) risk specific to these two: unlike
`'Country'`/`'Area'`, `'Location'` and `'Country/Date'` ARE listed in
`collapsableColumns` on several page definitions, so a flag span can sit
inside a currently-collapsed multi-event `<li>` (`initCollapsableColumns`
hides non-first `<li>`s via inline `style.display = 'none'` on the `<li>`
itself). Pseudo-elements aren't generated at all inside a display:none
subtree, so `resolveFlagVisual`'s `::before`/`::after` fallback would find
nothing for a collapsed-but-not-first event. Re-added the (previously
reasoned-through-but-reverted-along-with-the-probe-fix) li-reveal
safeguard: temporarily set the ancestor `<li>`'s `display` back to `''`
around the `getComputedStyle()` read, restore to `'none'` immediately
after, synchronously (no flicker). This is unrelated to, and much simpler
than, the `hasOwnText`/probe technique that caused the earlier regression
— no content stripping, no DOM mutation beyond the one inline style
round-trip.

**Not yet manually verified in a real browser** (musicbrainz.org is
blocked behind a JS proof-of-work bot-check, `/__meb_verify`, in this
environment) — in particular, whether a *collapsed* `'Location'`/
`'Country/Date'` cell's dropdown entry now renders correctly needs a real
test.

### Follow-up (user-tested): 'Country/Date' text on its own line + excess gap between multiple flags

User confirmed 'Country' itself is unaffected on the same URL — isolates
the bug to something specific to `.release-country`'s CSS, not a general
regression of the shared flag-baking code.

Screenshot evidence (single-event entries "AT -", "AU -" and a two-event
entry "AT 2003-05-05 Mon XE 2003-05-05 Mon"): the flag icon renders, but
the value text always starts on a **new line** below it instead of right
behind it, and multi-flag entries show a large gap between the icons.

Root cause (reasoned, not confirmed against live DevTools data — no
browser access in this environment): `flagIconMap`'s bake step only
normalized a resolved `display: none` to `inline-block`, passing every
other resolved `display` value through verbatim onto the (child-stripped,
empty) clone. `.release-country` carries an extra class beyond the shared
`.flag`/`.flag-XX` sprite rule (`class="flag flag-XX release-country"`)
for aligning the flag+code against the release-date column in MB's native
multi-event list — plausibly a `display` value (block/list-item/
table-cell-ish) that only behaves correctly inside that original
`.release-event` row context. Baked verbatim onto a bare clone dropped
into the dropdown item (a sibling of the plain value text, no such
context), it forces a line break, and — if it's a table-cell-style anonymous
box — could also explain the oversized gap between consecutive flags in a
multi-event cell.

Fix: broadened the normalization from "only 'none' → 'inline-block'" to
"anything other than inline/inline-block/inline-flex/inline-grid →
'inline-block'". This is a no-op for the already-working Country/Area
case (their resolved `display` was presumably already one of the
safe/context-free values, since they render correctly today), so it
carries no regression risk for those.

**Still unverified**: whether this also fully resolves the "too much
empty space between multiple flags" symptom, or whether that also needs a
width fix (e.g. if `.release-country`'s resolved `width` reflects a wide
alignment column rather than the icon's true small size — deliberately
NOT touched here without live confirmation, per the lesson from the
Release-events probe regression: don't guess a second unverified change
in the same pass). Needs user retest.

### Follow-up 2 (user confirmed display fix, gap persists) — real computed-style + cell-markup data provided

User pasted the actual multi-event cell markup AND the dropdown item's
resulting DOM with computed styles baked in as inline styles. This is the
first time in this whole investigation actual live data (not a guess) was
available for one of these fixes. Confirmed:

- Text now sits behind the flag (WIP.6's display-normalization fix
  worked).
- Both flag spans ('flag-AT release-country', 'flag-XE release-country')
  have IDENTICAL baked styles: `width: 48px; height: 14.4px;
  background-position: 0% 84%; background-size: auto;`
  `background-image: url("data:image/png;base64,...")`.
- Decoded that base64 PNG's IHDR directly (python, `struct.unpack('>I',
  raw[16:20]/[20:24])`): the actual image is **16×11px** — the baked box
  is 3x wider and taller than the icon itself.
- Root cause confirmed (not just theorized): `.release-country`'s box is
  sized in the ORIGINAL cell to fit the flag AND the visible "AT"/"XE"
  abbreviation text next to it (that's real, user-visible content there —
  see the raw cell markup: `<span class="flag flag-AT
  release-country"><a...><abbr title="Austria">AT</abbr></a></span>`).
  flagIconMap's clone deliberately strips that child content (to avoid
  showing "AT" twice — once from the icon's own text, once from the
  dropdown's value text which already reads "AT 2003-05-05 Mon..."), but
  kept baking the FULL content-sized box width, leaving ~32px of empty
  space where the stripped text used to be. This happens for every flag
  in a multi-flag cell AND after the last one (explains both "gap between
  flags" and "gap between last flag and text").
- Fix: added `_pngDataUriNaturalSize()` — reads the PNG's real
  width/height straight out of the base64 payload's IHDR chunk
  (synchronous, no `<img>`/decode round-trip) — and use it as the clone's
  box size instead of the source element's box, but ONLY when
  `background-size` resolves to `auto` (meaning the image is meant to
  paint at its own natural size in the first place, so matching the box
  to that size is an exact, not approximate, substitution — no change in
  what's visually painted, just less empty box around it).
  `background-position-x: 0%` is invariant to box width, and matching
  height to the image's own height makes the Y-offset moot too, so this
  cannot alter which part of the image is shown, only remove the
  leftover space.
- Deliberately scoped narrowly (only kicks in for PNG data URIs with
  `background-size: auto`) rather than guessing at some universal "always
  shrink to X px" rule — falls back to the prior (already-working-
  everywhere-else) behavior for anything else, so the Country/Area case
  is untouched.

Needs user retest to confirm the gap is gone.

## 2026-08-03 — overflow button lost after Load from Disk (`overflow.org`)

- `overflow.org`: before/after h3-header HTML dump from an artist
  relationships page (`/artist/70248960-.../relationships`) showing the
  `mb-show-all-subtable-btn` ("Show all 424 rows") present before "Load from
  Disk" and completely absent after.
- Root cause: `group.seeAllUrl`/`group.seeAllCount` (set during live fetch
  when a "See all N relationships" placeholder row is found, read solely to
  build the button in `renderGroupedTable`'s `if (group.seeAllUrl)` branch)
  were never included in `saveTableDataToDisk()`'s per-group serialization —
  only `key`/`category`/`rows` were saved. The Load-from-Disk reconstruction
  therefore always rebuilt the group without them, so the guard never
  fired.
- Fixed by adding `seeAllUrl`/`seeAllCount` to the serialized group object
  and restoring them in the `_grpEntry` reconstruction (same conditional
  pattern already used there for `colName`/`entityFeatures`) — 9.99.747.
  Verified the serialize/reconstruct logic in isolation via
  `debug/verify_seeall_persist.py` (both an overflow group and an ordinary
  group with no `seeAllUrl` round-trip correctly); no live browser session
  available to confirm the actual button renders, so a manual end-to-end
  retest (Save to Disk → Load from Disk on a >100-row relationship
  sub-section) is still recommended.

### Follow-up (same day) — extended to the other two overflow buttons

Same underlying gap ("a button built purely from a transient in-memory
field that's never persisted") also affects two unrelated overflow buttons
that share the `mb-show-all-subtable-btn` class:
- the tag-value/user-tag-value/artist-credit "Show all N rows" button
  (built in `renderGroupedTable` from a trailing `<em><a href="/tag/…">` or
  `<a href="/artist-credit/…">` row),
- the user-ratings "View all ratings" button (built from a trailing
  `<a href="/user/…/ratings/…">` row).

Unlike the artist-relationships case, these two never had a persistent
`group.*` field at all — they derive the button's href/count/label fresh
from `tbody.lastElementChild` every time `renderGroupedTable` runs, then
immediately splice the source row out of `group.rows`/`originalRows`/
`groupedRows[index].rows` (so re-filtering never resurrects it as a fake
data row). That splice means the source row only ever exists in the DOM/
`group.rows` on the very first render after a fetch — on any *later* full
re-render (not just Load-from-Disk; also plain "clear all filters", which
also takes the `!query` fresh-h3/table rebuild branch in `renderGroupedTable`
per `dataArray.forEach`'s `query && existingTables[index]` check), the
source row is already gone and the button silently fails to reappear, same
symptom as `overflow.org`.

Fixed by mirroring the relationships case exactly: the button-build blocks
now stash their derived href/count/label onto `group` (and `groupedRows[index]`
when it's a different reference, same defensive pattern already used for the
splice) the first time they successfully find the source row, then fall back
to that stashed metadata on every later call where the row can't be found —
covering both Load-from-Disk and the "clear filters" full-rebuild case in one
fix. New fields: `tagSeeAllUrl`/`tagSeeAllCount`/`tagSeeAllEntityLabel`
(tag-value/artist-credit) and `ratingsViewAllUrl` (user-ratings) — kept
separate from `seeAllUrl`/`seeAllCount` since the artist-relationships block
checks `if (group.seeAllUrl)` unconditionally; reusing the same field names
would have made that block fire a second, duplicate button for tag-value/
user-ratings groups. Persisted/restored in `saveTableDataToDisk()`/disk-load
the same way. Verified via the extended `debug/verify_seeall_persist.py`
(now covers all three field families); confirmed via reading the h3-creation
code (`dataArray.forEach`, ~line 33029) that the button-build blocks only
ever run when a brand-new `<h3>` is being created (never a reused one), so
there's no risk of the fallback path appending a duplicate button onto a
stale header — no live browser session available to confirm visually.

## 2026-08-05 — unique-value dropdown artificial mid-word blanks (`flag-filter-bug.org`, `flag-filter-bug.html`, `ucd.html`)

- `flag-filter-bug.org`: user report — on `/area/489ce91b-.../artists`,
  filtering the "Area" column for "llino" then opening that column's
  unique-value dropdown (📊) shows entries with spurious blanks inside a
  word, e.g. "Illinois" → "I llino is". Same happens filtering "Country"
  for "it". `ucd.html` is the dropdown's own rendered markup (captured
  live); `flag-filter-bug.html` is the full page snapshot with both column
  filters applied.
- Despite the bug title, flag icons (`<img>`/`<span class="area-icon">`)
  are a red herring — they carry no text content and don't touch this code
  path. `ucd.html` shows the corruption already baked into
  `item.title="Chicago, I llino is, United States"`, i.e. it's in the raw
  value `openUniqDrop()` extracts via `getCleanColumnText(cell)`
  (`:35569`), not in the dropdown's own `<mark>` highlighter
  (`renderItems()`, `:35736+`), which only decorates an already-corrupted
  string.
- Root cause: `getCleanColumnText()` reads live table cells. While a
  column filter is active, `highlightText()`/`highlightCrossTag()` leave a
  real `<span class="mb-column-filter-highlight">` wrapped around the
  matched substring inside the cell (by design — visible highlight, not
  transient). `getCleanColumnText()`'s clone-and-strip pass
  (`_CLEAN_STRIP_SEL`) didn't know about this span class, so `root` stayed
  the live, unstripped element; `root.normalize()` cannot merge text
  across an intervening *element* (only adjacent text-node siblings), so
  the TreeWalker collected "I" / "llino" / "is" as three separate
  fragments and `textParts.join(' ')` inserted a space at each boundary.
  This is the same fragmentation mechanism the function's own existing
  comment already described for the *post-clear* case (the "U nited
  States" example) — it was never extended to the *still-live* case, which
  is exactly what `openUniqDrop()` hits.
- Fix (9.99.754): unwrap (not strip) any element matching the existing
  `_COLLAPSE_MATCH_SEL` selector (`:11437` — already the authoritative
  list of all 4 filter-highlight classes) into a plain text node before
  `normalize()`, in both `getCleanColumnText()` and `getCleanVisibleText()`
  (the latter shares the identical shape and feeds sort keys / the global
  filter, so had the same latent bug). No live browser session available
  to confirm visually; verified via `node --check` and JSON validation of
  the changelog entry.

## 2026-08-05 — "Relationships" column missing after "Show single-table" on artist-relationships (debug/missing-relationships-column.org)

Snapshots used: `relationships-column.html` (the source sub-table on
`/artist/70248960-.../relationships`, "'liner notes for release' relationships" category —
confirmed a native `<th data-col-name="Relationships" class="mb-injected-column">`),
`missing-relationships-column.html` (the resulting "Show single-table" tab — confirmed via
grep that `mb-rel-cell` and `mb-injected-column` occur **zero** times anywhere in the
1MB rendered DOM; the string "Relationships" only survives in unrelated button-label/nav
text, not as a header).

- Root cause: the cross-tab snapshot handoff (`captureSubtableSnapshot` →
  `openSubtableAsSingleTableTab` → `_hydrateAndRenderFromSnapshotData`) deliberately
  excludes async-populated `mb-rel-cell`/`mb-re-cell`/`mb-ice-cell`/`mb-picard-cell` data
  cells from the captured row HTML (line ~19201) — these are meant to be freshly rebuilt
  post-hydration by `cleanupHeaders()` + `initRelationshipsColumn()`/
  `initReleaseEventsColumn()`, gated on the **destination** page definition's
  `features.injectedColumns` (`activeInjectedColumns`, built by `buildActiveInjectedColumns()`
  at line 4219). For `artist-relationships`/`label-relationships`/`place-performances`, the
  snapshot tab's URL carries `?link_type_id=1`, which routes to each type's `-filtered`
  sibling (a `tableMode:'single'` definition) rather than reusing the source multi-table
  definition directly. Checked all three `-filtered` siblings:
  `label-relationships-filtered` and `place-performances-filtered` both already declared
  `injectedColumns: ['Release events', 'Relationships']` (matching their multi-table
  siblings) — but `artist-relationships-filtered` declared no `injectedColumns` at all,
  unlike its own multi-table sibling `artist-relationships` (which has
  `injectedColumns: ['Relationships']`). This asymmetry is why
  `artist-releasegroups`/`releasegroup-releases` sub-tables (which have no `-filtered`
  sibling at all — the snapshot tab reuses their own bare-URL multi-table definition,
  already carrying `injectedColumns`) were unaffected, while only `artist-relationships`
  exhibited the bug.
- Mechanism of the disappearance (not just "never created" — actively deleted): even though
  the captured header HTML for "Relationships" survives the round trip into the hydrated
  `<thead>` (as inert, classless text — cell class/dataset attributes are never part of the
  captured `{html, colSpan, rowSpan, tagName, style}` cell shape), `cleanupHeaders()`'s
  *unconditional* "always remove foreign Relationships/Performance Attributes/Release
  events/Tagger columns" pass (line 28723 `removalMapAlways`, matches on header TEXT alone,
  independent of `activeInjectedColumns`) deletes it regardless. Normally this is harmless
  because the very same `cleanupHeaders()` call re-injects a fresh, properly
  `mb-injected-column`-marked header a few dozen lines later (line 28932, gated on
  `activeInjectedColumns.length`) — but with `activeInjectedColumns` empty for
  `artist-relationships-filtered`, that re-injection step never runs, so the header is
  deleted and never replaced. `initRelationshipsColumn()` (called at line 44397) also bails
  immediately (`if (!activeInjectedColumns.length) return;`), so no `mb-rel-cell` `<td>` is
  ever (re)created either. Net result: complete, silent disappearance of both header and
  data cells — matching the zero-occurrence grep result above exactly.
- Fix: added the missing `injectedColumns: ['Relationships']` to
  `artist-relationships-filtered`'s `features` (mirroring `label-relationships-filtered`/
  `place-performances-filtered`, and its own multi-table sibling `artist-relationships`). No
  other code path needed to change — the existing `cleanupHeaders()`/
  `initRelationshipsColumn()` self-heal machinery already does the right thing once
  `activeInjectedColumns` is populated, for both the normal live-fetch flow (the
  "(complete)" button) and the cross-tab snapshot hydration flow. No live browser session
  available in this environment to confirm visually; verified statically by tracing
  `buildActiveInjectedColumns()`'s resolution for `artist-relationships-filtered` (falls
  into the generic `else` branch — `entityType: 'release'`, `incOptions: ['url-rels']` —
  matching `artist-relationships`'s own resolution) and by grepping both debug HTML
  snapshots for `mb-rel-cell`/`mb-injected-column` to confirm the bug's exact shape (full
  absence, not misalignment or mis-styling).

## 2026-08-07 — release-tracks backfilled Artist column truncated multi-artist credits

`tracklist-live.html` (`/release/e7969bdb-...`, a Bruce Springsteen & The E
Street Band release) is the multi-artist-credit fixture for
`release-tracks` — its `p.subheader` reads:

```html
<p class="subheader">... Release by <bdi>
  <a href="/artist/70248960-..." title="Springsteen, Bruce">Bruce Springsteen</a> &amp;
  <a href="/artist/d6652e7b-..." title="E Street Band, The">The E Street Band</a>
</bdi> ...</p>
```

`applyNormalizeMediumTracklists()`'s Artist-column backfill (used on
non-VA releases with no natively-present Artist column) was scraping only
`document.querySelector('p.subheader bdi a[href^="/artist/"]')` — the
*first* artist `<a>` — and cloning just that single link into each row's
new `<td>`, silently dropping the `" & "` join text and every subsequent
artist. `tracklist-single-medium.html`/`tracklist-multiple-mediums.html`
(both single-artist releases) never exercised this, and the VA fixture
(`tracklist-overflow.html`) has a natively-present Artist column so never
enters the backfill branch at all — hence this went unnoticed until now.

Fixed by capturing the artist link's enclosing `<bdi>` (`.closest('bdi')`)
instead of the link itself, and cloning that whole `<bdi>` per row — same
approach as the native VA per-track Artist `<td>`s already use, so every
joined artist credit (any join phrase: "&", ",", "feat.", ...) survives
verbatim.

## 2026-08-07 — release-tracks Title cell: ARs/AcoustID/ISRC/Disambiguation extraction

`debug/fix.org` requested cleaning the "Title" column down to just the real
track title, since MusicBrainz (and, once it has run, the third-party
jesus2099 "SUPER MIND CONTROL" script) glues several unrelated things into
the same `<td>`. Confirmed exact DOM shape across three fixtures:

- `debug/area-column.html` — an isolated pre-jesus2099 baseline `<td>`
  (plain `<a href="/recording/...">`, no jesus2099 classes at all): just the
  title link plus one bare `<div class="ars">` wrapping five `<dl class="ars">`
  relationship blocks (engineer/producer/vocals/copyright; recorded-at
  place; recording-of-work with a nested `dl.ars` for lyricist/composer;
  publisher). No AcoustID/ISRC content — confirms those are added later by
  jesus2099's lookup, not native MB markup.
- `debug/tracklist-multiple-mediums.html` — the same track post-jesus2099:
  the `<td>` now carries class `jesus2099userjs{N}acoustids-handled` and
  contains, in order: the title `<a class="jesus2099userjs{N}recording">`,
  a hidden `<input class="recording-comment">` (unrelated, ignored),
  `<div class="ars AcoustID{N}">` (one `dl.ars` with `<dt>AcoustIDs:</dt>`
  and a `<dd>` holding 30 UUID links comma-separated in one flat run, each
  immediately followed by a ×/+ link/unlink toggle link to acoustid.org),
  `<div class="ars ISRC{N}">` (same shape, one ISRC link), then the bare
  `<div class="ars">` (identical relationship content to file 1). All three
  `div.ars*` variants are **siblings**, direct children of the `<td>` —
  never nested inside each other or inside the title `<a>`.
- `debug/tracklist-live.html` (Bruce Springsteen & The E Street Band,
  `/release/e7969bdb-...`) — confirms the disambiguation-comment shape for
  a track whose title differs from its recording's name ("Rave On!" the
  track vs. "Rave On" the recording, a live cover): `<span
  class="name-variation"><a ...>Rave On!<br>Rave On</a> <span
  class="jesus2099userjs{N}recdis comment">(live, 1978‐07‐07: The Roxy
  Theatre, West Hollywood, CA, USA)</span></span>` — i.e. the disambiguation
  is a `.comment` span, sibling of the title `<a>`, wrapped together with it
  inside `span.name-variation` only when a name-variation exists. Critically,
  this must be distinguished from the many OTHER `.comment` spans nested
  several levels deep inside the bare `div.ars`'s relationship `dl`s (e.g.
  "(US engineer)", "(conductor)", "(cellist)" in `area-column.html`) —
  solved by only matching `:scope > span.comment` or
  `:scope > span.name-variation > span.comment` (shallow, direct-child-only
  queries), never a deep `td.querySelector('.comment')`.
- `debug/ucd.html` — turned out to be exactly the AcoustID `<dd>`'s raw flat
  content (byte-identical to the one inside `tracklist-multiple-mediums.html`'s
  `div.ars.AcoustID{N}`), not an already-multi-row example as its filename/
  the fix.org wording suggested — i.e. it's the *input* shape that needed
  splitting into one `<li>` per entry, not a reference for the *output*
  shape. The multi-row output convention was instead taken from this
  script's existing list-cell mechanism (`_findCellListItems()`/
  `initCollapsableColumns()`, same as Catalog#/Label): wrap each entry in
  its own `<li>` inside a `<ul>`.

Implementation: new `applyExtractTrackTitleData()` (next to
`applyNormalizeMediumTracklists()`), gated by `features.extractTitleData:
true`, since none of this can go through the existing `columnExtractors`/
`syntheticColumnExtractors` mechanism (`eventParts`, `splitLocation`,
`splitArea`, …) — those are all purely additive (read `sourceCell`, return
new `<td>`s, never mutate the source), confirmed by reading `eventParts`'s
body (only reads `sourceCell.textContent`). Cleaning the Title cell down to
"just the real title" requires actually removing content from the source
column, which no existing extractor does — this mirrors the Artist-column
backfill's in-place DOM-surgery approach instead.

Design decisions confirmed with the user before implementing: AcoustID and
ISRC are two **separate** new columns (not combined into one); the
secondary "recording name" line (the `<br>`-separated second line inside
the title `<a>`, e.g. "Rave On" under "Rave On!") is dropped silently, not
kept anywhere; AcoustID's native ×/+ action links are kept in the new
column; "ARs" gets its own dedicated `sa_enable_ars_collapse`/
`sa_ars_column_max_height_em`/`sa_ars_column_max_width` settings rather
than sharing Annotation's global ones — required extending
`initCollapsableColumns()`'s existing `_isEditsProseCol` per-column
special-case pattern with a parallel `_isArsProseCol` branch, a dedicated
`.mb-text-clamp-inner-ars` CSS class (higher specificity than the generic
`.mb-text-clamp-inner` rule, so no `!important` needed), and extending
`_getProseColumnMaxWidth()` from a no-arg function to
`_getProseColumnMaxWidth(table, colIndex)` (resolving the column's clean
header name via the existing `_cleanColHeaderText()` helper) across its
four call sites.

## 2026-08-07 — ARs/AcoustID/ISRC collapse toggle never appears on multi-medium releases

`debug/problem.html` (`/release/6d19588c-0305-4fb0-b687-d4b75a75c3fd`, 2
mediums) vs `debug/g.html` (a single-medium release) — both captured after
the WIP.4 Title-extraction work, user reported the ARs column not
collapsible in problem.html but working fine in g.html.

Static diff of the two captures (grep/python, no live browser available):
both show the extracted "ARs" `<td>` correctly populated with real,
substantial `dl.ars` content, and both correctly get the
`mb-text-clamp-marker mb-text-clamp-inner mb-text-clamp-inner-ars` wrapper
classes — but problem.html has **zero** real `mb-cell-collapse-toggle` /
`mb-has-collapse-toggle` elements anywhere in the actual table body (every
textual match is inside the injected `<style>` block — CSS rule
definitions only), while g.html has 17 real ones. A second, independent
clue pointed the same direction: `makeColumnsResizable`'s cached
`th.dataset.mbResizeMin` (`ShowAllEntityData.user.js` ~line 19393-19418,
computed once from `_initHdrFlex.scrollWidth + 8`) read `"8"` for
problem.html's ARs `<th>` (i.e. `scrollWidth` measured as exactly 0) vs a
normal `"567"` for g.html's — the classic signature of measuring an
element that isn't actually laid out yet.

Root cause (confirmed via code trace, not the extraction/DOM-surgery code
from WIP.4): `renderGroupedTable()`'s `shouldStayOpen` heuristic (`:34779-
34782`) — `isSingleSubTable || ((catLower === 'album' || catLower ===
'official') && group.rows.length < sa_auto_expand)` — decides whether each
sub-table starts expanded or gets `table.style.display = 'none'`.
release-tracks' medium-title categories ("1 - CD", "2 - DVD-Video", …)
match neither condition once a release has more than one medium, so every
medium's table starts hidden. `initCollapsableColumns(table)` and
`makeColumnsResizable`'s header-flex measurement then run immediately
after, in the very same synchronous per-group iteration (`:35298`,
`~:35289`) — `scrollHeight`/`clientHeight` on a `display:none` element
always read 0/0 in a real browser, so the overflow-detection filter never
finds an overflowing cell, for *any* collapsable column, permanently (the
later manual h3-expand click only flips `display`, it doesn't re-run
`initCollapsableColumns`). Single-medium releases hit `isSingleSubTable ===
true` and never get hidden, so g.html works.

This bug predates this session's work — `shouldStayOpen` was never
release-tracks-aware — but was invisible until now because release-tracks
had zero `collapsableColumns` entries before WIP.4 added `['ARs',
'AcoustID', 'ISRC']`. Not something `applyExtractTrackTitleData()`/
`applyNormalizeMediumTracklists()` caused.

Fix (WIP.5): added `const isReleaseTracks = activeDefinition?.type ===
'release-tracks';` and OR'd it into `shouldStayOpen`, so every
release-tracks medium always starts expanded regardless of count —
sidesteps the hidden-at-measurement-time trap entirely, and is also the
more sensible default anyway (a tracklist-consolidation tool hiding
mediums by default works against its own purpose).

Separately investigated the user's other complaint from the same report,
"AcoustID extraction doesn't work" on problem.html: confirmed via grep that
**neither** problem.html nor g.html contains any native `div.ars.AcoustID*`
/`div.ars.ISRC*` markup at capture time (0 matches in both) — i.e. no
source data was present in the DOM when `applyExtractTrackTitleData` ran
in either capture. jesus2099's AcoustID lookup is async (queries
acoustid.org per recording) and evidently hadn't completed by the time
either page was captured — not an extraction-logic bug. Flagged as a
latent robustness concern for later, not yet fixed: `applyExtractTrackTitleData`
rebuilds the Title cell's anchor via `cloneNode`, so if jesus2099's lookup
completes *after* extraction has already run, its result may attach to a
detached/orphaned reference and never reach the new AcoustID/ISRC columns.
The existing `initAreaFlagRegionObserver()` (2026-07-25 entries above) is
the established precedent in this codebase for exactly this shape of
problem — a third-party userscript decorating the DOM asynchronously,
after this script's own synchronous pass already ran.

## 2026-08-07 — AcoustID/ISRC late-arrival observer (WIP.6)

Implemented the fix flagged above. Two parts:

1. **Move, not clone, throughout `applyExtractTrackTitleData()`.** The
   recording `<a>`, the comment span, and every AcoustID/ISRC anchor were
   all previously extracted via `cloneNode(true)`. Switched all of them to
   plain `appendChild` (which moves a node already in the document,
   detaching it from its old parent) — the bare `div.ars` relationship
   content already worked this way (`while (bareArsDiv.firstChild)
   td.appendChild(...)`), this just makes the whole function consistent.
   This matters for the observer below: whether the decorating userscript
   holds a literal JS reference to the original anchor object, or
   re-queries the live DOM by selector/class match, either way it needs
   the actual SAME node (or one still carrying the same class/attributes)
   to still be present in the rendered table — a clone silently breaks
   both cases, since the clone is a different object the decorating
   script never knew about.
2. **New `initAcoustIdIsrcObserver()`**, modeled directly on
   `initAreaFlagRegionObserver()`'s structure (WeakSet-tracked
   per-`tbody` dedup so repeated calls after a filter/sort re-render don't
   double-attach; a live `MutationObserver` for the common case; an
   immediate sweep at attach-time plus bounded-delay fallback sweeps at
   [500, 1500, 3000, 6000]ms). Called from the same place
   `initAreaFlagRegionObserver()` already is — the tail of
   `renderGroupedTable()` — since release-tracks is `tableMode: 'multi'`.
   No-ops entirely (zero overhead) unless the active page is
   release-tracks, the new `sa_enable_release_tracks_acoustid_isrc_observer`
   setting (default **true**, per explicit request) is on, and at least
   one of the AcoustID/ISRC column-visibility settings is on.

   One difference from the area-flag-region precedent: that one reacts to
   decoration of content our OWN extraction never touches (Locality/Region
   links survive our pipeline untouched), so its "immediate sweep" purely
   covers "decoration already finished before we started observing". For
   AcoustID/ISRC, if the userscript finishes BEFORE
   `applyExtractTrackTitleData()` runs, that pass already finds and
   extracts it directly — no observer needed. The observer's immediate
   sweep instead covers the narrower window between
   `applyExtractTrackTitleData()` (early pre-processing) and
   `initAcoustIdIsrcObserver()` (end of the final render) finishing.

   Verified via the same jsdom harness pattern used elsewhere in this file
   (no live browser available): confirmed the recording anchor surviving
   `applyExtractTrackTitleData()` is literally the same object (not a
   clone, via a custom test-only `data-marker` attribute check), and
   exercised both paths — a `div.ars.AcoustID…` injected into the
   already-cleaned Title `<td>` before `initAcoustIdIsrcObserver()` is
   called (caught by the immediate sweep, synchronously) and a
   `div.ars.ISRC…` injected after the observer is already attached
   (caught reactively by the `MutationObserver` callback, awaited via a
   microtask tick) — both correctly relocated into their column and
   removed from the Title cell.

## 2026-08-07 — "AcoustID"/"ISRC" clarified as working; column rename + Video column (WIP.7)

User confirmed AcoustID/ISRC extraction itself is fine — the earlier
`problem.html`/`g.html` investigation's "sometimes empty" symptom is just
jesus2099's async lookup not having finished yet on either capture (the
WIP.6 observer already addresses the case where it finishes late). No
further extraction-logic changes needed for that.

Two follow-up requests:

1. **Column rename**: "AcoustID" → "AcoustIDs", "ISRC" → "ISRCs" (plural —
   a cell can hold more than one entry). Renamed everywhere the literal
   header text is used for lookup/creation/idempotency-checking:
   `applyExtractTrackTitleData()`'s `_hasAcoustId`/`_hasIsrc` checks and
   `<th>`/text creation, `_relocateLateAcoustIdIsrc()`'s `_relocateOne`
   calls (which resolve the destination `<td>` by header name), and
   `collapsableColumns: ['ARs', 'AcoustIDs', 'ISRCs']` in the pageDef —
   `collapsableColumns` matches by clean header text, so this had to move
   in lockstep with the `<th>` text or the columns would silently lose
   their collapse behavior. Left the setting *keys*
   (`sa_enable_release_tracks_acoustid_column` etc.) singular/unchanged —
   only user-facing labels/descriptions and the actual column header text
   needed to change.

2. **New "Video" column**: `debug/tracklist-multiple-mediums.html`'s
   "2 - DVD-Video" medium (release `6d19588c-...`) confirmed the exact
   native shape: `<span class="video" title="This recording is a
   video"></span>` sits as the **first child** of the Title `<td>` — a
   sibling of (not nested inside) `span.name-variation`/the recording
   `<a>`. This script already has a generic, reusable
   `ColumnDataExtractor.video` extractor (used by several other pageTypes
   via a normal `columnExtractors: [{ sourceColumn: '...', extractor:
   'video', syntheticColumns: ['Video'] }]` entry, e.g.
   `artist-recordings`) — reused it directly rather than reimplementing
   the move-the-span/audio-video-sort-key logic.

   The twist the user asked for — "only create the column when a
   sub-table has at least one track with the video glyph" — isn't
   something the generic `columnExtractors` mechanism supports (it always
   creates its synthetic column unconditionally for every group sharing a
   page's column schema; existing per-category variation is only via
   `entityFeatures`, keyed by a fixed category name, not by scanning
   actual cell content). Implemented instead inside
   `applyExtractTrackTitleData()` itself, which already has exactly the
   per-table context needed: before deciding on any `<th>`, scan every row
   in *this specific* medium's `tbody` for `span.video`; only if at least
   one row has it, create the "Video" `<th>` and, per row, call
   `ColumnDataExtractor.video(titleTd)` to move that row's span (or add
   the "audio" sort key if this particular row has none) into the new
   column. Must run before the recording-anchor `<br>`-truncation step
   later in the same row loop, since `span.video` — being a plain sibling,
   not nested inside the anchor — would otherwise be silently discarded
   when the Title cell is rebuilt down to just the clean anchor.

   Positioned directly after "Title", with "Disambiguation" chained right
   after it (both header and row insertion use the same "cursor" pattern:
   start at the Title cell/`<th>`, advance past Video if created, then
   insert Disambiguation) — so column order is Title → [Video] →
   [Disambiguation] → Artist → ... → ARs → [AcoustIDs] → [ISRCs].

   Verified via the same jsdom harness (extended to also load
   `ColumnDataExtractor.video`, wrapped standalone since only that one
   method was needed): a table with no video row gets no "Video" column at
   all; a table with the icon present gets it created in the right
   position, with the span correctly moved and its `mb-video-sort-key`
   intact.

## 2026-08-07 — "Video" column had no header (debug/no-video-colmn-header.html)

User report: on a multi-medium release, the "Video" column's data was
correctly extracted (`mb-video-sort-key` spans present, 5 of them in the
supplied capture) but the `<th>` was completely missing from the rendered
`<thead>` — confirmed via `data-col-name="Video"`: 0 matches anywhere in
the file, even though the header row between "Title" and "Disambiguation"
was otherwise intact.

Root cause: the per-table conditional Video-column decision added in the
entry above is fundamentally incompatible with how `renderGroupedTable()`
builds headers for multi-table pages. It derives ONE header template from
`document.querySelector('table.tbl')` — literally the FIRST `table.tbl`
in the document — via `rawTemplateHead`/`templateHead`
(`ShowAllEntityData.user.js:34539-34544`), then clones that SAME template
for every group/medium's `<thead>` (`:34815-34934`). If medium 1 ("1 -
CD", first in document order) has no video tracks, its native `<thead>`
(after `applyExtractTrackTitleData()`'s per-table decision) has no "Video"
`<th>` — so the template lacks it too, and EVERY medium's final rendered
table lacks it, even mediums that DO have video rows and clearly still
carry the row-level `<td>`/sort-key data (scraped independently, per
group, unaffected by the header template). This is the exact same
invariant the Artist-column backfill already documents ("every medium's
column schema is identical") — it was never actually optional, my
per-table Video logic just violated it silently.

Fix: moved the video-presence check out of the per-table loop into a new
`_pageHasVideo` computed once up front, scanning every `table.tbl`'s Title
column across the whole document (not just the current table) —
`applyExtractTrackTitleData()`'s existing per-table loop then just reads
that single boolean instead of re-scanning locally. Since the FIRST table
in the document is guaranteed to get the same `_videoTh` decision as every
other table now, `renderGroupedTable()`'s header-template cloning works
correctly regardless of document order. Mediums with no actual video
tracks still get a "Video" `<th>`/`<td>` (empty/"audio", like any other
uniform column), but only once at least one medium on the release has a
video track at all — matches how "AcoustIDs"/"ISRCs" already behave
(their presence is release-wide via a setting, not per-medium either).

Verified via jsdom: built two separate `table.tbl` elements in the same
document (mimicking two mediums) — one with no video row, one with a
video row — called `applyExtractTrackTitleData()` once across both, and
confirmed BOTH tables end up with the "Video" header (the no-video table's
row correctly shows the "audio" sort key, empty cell).

## 2026-08-07 — "Recording artist" column (WIP.8)

Same shape as "Video" (previous entry), applied to a different Title-cell
construct: `<div class="small">Recording artist:<!-- --> <bdi>…</bdi></div>`,
present when a track's recording is credited to someone other than the
release's own artist — confirmed via `tracklist-multiple-mediums.html`'s
"2 - DVD-Video" medium (release `6d19588c-...`, a Bruce Springsteen & The
E Street Band live release), e.g. a live cover credited to "Bruce
Springsteen & The E Street Band" that differs from a compilation/various
mediums' own release-level artist. Structural position confirmed: `div.small`
is a direct child of the Title `<td>`, sitting right after `<input
class="recording-comment">` and before any `div.ars*` — extracted via
`:scope > div.small > bdi`.

Learned from the "Video" investigation immediately above, so implemented
correctly the first time: added a `_pageHasRecArtist` page-wide scan
(refactored the existing `_pageHasVideo` one-off scan into a shared
`_anyTitleCellMatches(predicate)` helper both now call, rather than
duplicating the table/tbody/title-index resolution a third time) — the
"Recording artist" `<th>` is only added once at least one track ANYWHERE
on the release has the credit, never decided per medium.

Also fixed a latent, previously-harmless bug while wiring this in: neither
the header-side nor row-side insertion "cursor" updated itself after
inserting the Disambiguation `<th>`/`<td>` (`_titleHeaderCursor`/
`_rowInsertCursor` stayed pointed at Video-or-Title instead of advancing
to Disambiguation) — never mattered before because Disambiguation was
always the last thing chained via `.after()`; now that Recording artist
chains after it too, the cursor has to actually advance for the ordering
(Title → Video → Disambiguation → Recording artist) to come out right.

Verified via jsdom, same two-table page-wide pattern as the Video test:
one table with no `div.small`, one with the real multi-artist `<bdi>`
content from the actual release-6d19588c markup — confirmed both tables
get the column, the no-credit table's cell is empty, the credited table's
`<bdi>` (both joined artist links, join phrase, wrapper element itself)
survives intact, and the Title cell is still cleaned correctly alongside
it in the same row.

### Follow-up: reordered so "Artist" comes before "Recording artist"

"Recording artist" originally chained off Title/Video/Disambiguation
(same cursor as those three), landing right before "Artist" (which
`applyNormalizeMediumTracklists()` already inserts right after Title,
earlier in the pipeline). User asked to swap so "Artist" reads first.
Changed the insertion anchor for both the header `<th>` and each row's
`<td>` from the Video/Disambiguation cursor to the table's existing
"Artist" `<th>`/`<td>` (resolved once via `_artistIdx`, found in
`_headerCells` since Artist was already inserted before this function
runs) — with a defensive fallback to the old cursor position if "Artist"
somehow isn't found. Final order: Title → Video → Disambiguation → Artist
→ Recording artist → Rating → Length → ARs → AcoustIDs → ISRCs.

## 2026-08-07 — overflow-tracks progress indicator (WIP.9, debug/progress.html)

User supplied `debug/progress.html` — a snapshot of the existing paginated
fetch loop's progress bar (`#mb-fetch-progress-wrap` etc.,
`"Loading page 14 of 745... (1400 rows) - 882.1s left"`) — and asked for
the same treatment on `release-tracks`' overflow-tracklist loading
(`loadAllOverflowMediumTracks()`), which currently runs silently before
the real fetch loop starts.

`fetchProgressWrap`/`fetchProgressFill`/`fetchProgressLabel` are created
once at UI-setup time (near `controlsContainer`, `:21980-22037`) and are
plain top-level `const`s in the same outer IIFE scope as
`loadAllOverflowMediumTracks` (defined much earlier in the file, `:6665`,
but never CALLED until user interaction — long after the whole script,
including those consts, has finished loading) — same reasoning already
established for referencing `ColumnDataExtractor` from
`applyExtractTrackTitleData()` despite similar apparent ordering. Safe to
reference directly, no refactor needed.

Confirmed via `grep` that nothing between `loadAllOverflowMediumTracks()`'s
call site (`startFetchingProcess`, `:30623`) and the main fetch loop's own
progress-bar reset (`:30856`) touches `fetchProgressWrap` — so showing it
here and leaving it visible is safe; the main loop's own reset naturally
takes over once this phase finishes, exactly the same relationship the
pre-existing two-pass (`tag-value`/`user-tag-value`) progress handling
already has with the main loop (`:30463`/`:30531`).

Implementation: added per-medium counters (`_mediumsCompleted`,
`_tracksLoadedSoFar`, `_cumulativeMediumTime`) around the EXISTING
click+wait loop (unchanged) — updated once per medium (not continuously
during a medium's own wait, to match the granularity of the existing
per-page update) via a small `_updateOverflowProgress()` closure mirroring
the main loop's exact `fillPct`/`fillColor`/`estRemainingSeconds` formula.
Verified the arithmetic/label-formatting logic standalone (outside
jsdom, pure JS): fill percentage and remaining-time estimate progress
correctly across a simulated 3-medium run, and the "medium X of Y" label
correctly clamps at Y for a single-medium case (never shows "medium 2 of
1").

## 2026-08-07 — "only render when at least one track has a value" (WIP.10)

User asked for this to apply to all three of "Disambiguation",
"AcoustIDs", "ISRCs". Flagged a real conflict before implementing: unlike
Video/Recording artist (native MB markup, present or not at the moment we
scrape it), AcoustIDs/ISRCs come from a third-party userscript's *async*
lookup that's usually still in progress when `applyExtractTrackTitleData`
runs — confirmed earlier this session (the `problem.html`/`g.html`
investigation) that both captures had zero AcoustID/ISRC source data
present at that exact moment. That's the whole reason the late-arrival
`MutationObserver` (`initAcoustIdIsrcObserver`, WIP.6) exists. Gating
column creation on "is data present right now" would mean the column
usually wouldn't exist at the moment data eventually arrives either —
and `_relocateLateAcoustIdIsrc`'s `arsDiv.remove()` runs unconditionally
even when no matching `<th>` is found, so the data would just be silently
discarded, making the observer non-functional in the common case.

Asked the user via `AskUserQuestion` how to resolve this (three options:
extend the observer to retroactively create the column when data first
arrives with no destination yet; apply the gate to Disambiguation only;
or apply the gate everywhere and accept the observer becoming
non-functional for column creation). User picked the recommended
option — gate only "Disambiguation", leave AcoustIDs/ISRCs as-is
(setting-gated, not presence-gated).

Considered but didn't pursue the "retroactive column creation" option:
even setting aside the added complexity (creating a `<th>` + backfilling
every existing row across every medium's table, reactively, from inside
a `MutationObserver` callback scoped to one row), there's an unverified
risk that a later sort/filter re-render rebuilds `<tr>`s from the
original scraped row-data model rather than the live DOM — in which case
a column added only to the live DOM after the fact could silently vanish
on the next re-sort. Not confirmed either way without a live browser
session; flagged rather than guessed at.

Implementation: added a third page-wide scan,
`_pageHasDisambig = _anyTitleCellMatches(td => td.querySelector(':scope > span.comment, :scope > span.name-variation > span.comment'))`,
and changed the "Disambiguation" `<th>` creation from unconditional
(`if (!_hasDisambig)`) to `if (!_hasDisambig && _pageHasDisambig)` — same
pattern as Video/Recording artist. The row-level `<td>` insertion was
already gated on `_disambigTh` (not `_hasDisambig`), so it needed no
separate change.

Test suite fallout: Test1/Test2 (neither has a comment in its fixture)
previously asserted "Disambiguation" was present unconditionally — now
correctly assert its absence. Also added `document.body.innerHTML = ''`
isolation at the start of every remaining synchronous test (1 through 6)
that didn't already have it, since with a third page-wide-gated column
in play, cross-test DOM contamination (earlier tests' leftover tables
still in the document) becomes more likely to actually change a later
test's outcome rather than being harmlessly ignored.

## 2026-08-07 — overflow-tracks progress bar never actually showed progress (WIP.11)

User reported the WIP.9 progress bar always shows the exact static
initial text — `"Loading overflow tracks: medium 1 of 1..."`, 0% fill —
never the `"(Z tracks) - Ns left"` format that was supposed to appear.

Root cause: `_updateOverflowProgress()` was only ever called (a) once,
before the loop, to set the initial text, and (b) once per medium, AFTER
that medium's whole wait loop finished. For the single-overflowing-medium
case — very likely the MOST common case in practice, and exactly what the
user hit — there is no "in between": the entire wait (which, per this
function's own JSDoc, can itself take up to 30s and is a single AJAX
round trip that has nothing to do with the fast per-page fetch loop
following it) shows nothing but the static initial text, then the
"finished" update fires for a brief instant before `startFetchingProcess`
immediately takes the progress bar over for its own (near-instant, for
`non_paginated: true` pages) next phase — so the user never actually sees
it change at all.

Fix: `_onMutation` (the existing `MutationObserver` callback that already
detects a medium's completion via its live row count vs. the parsed
"...out of N total." expectation) now ALSO calls
`_updateOverflowProgress()` on every firing, passing the current medium's
elapsed time and live fraction (`_dataRowCount()/_expectedTotal`) so the
bar updates continuously as rows actually stream in, not just at
before/after boundaries. `_updateOverflowProgress` itself was rewritten
to take these live-in-progress parameters and blend them into both the
fill percentage (`(_mediumsCompleted + currentFraction) / totalMediums`)
and the remaining-time estimate (this medium's own remaining time,
extrapolated from its progress-so-far, plus average completed-medium time
for any mediums still queued after it — falling back to this medium's own
elapsed time as that average until at least one medium has fully
completed, so the very first estimate isn't just "0s").

Verified via a standalone simulation (no jsdom needed, pure arithmetic —
same approach as the WIP.9 verification): a single-medium 1209-track load
streaming in over 4 chunks now shows fill/track-count/remaining-time
progressing smoothly (0%→25%→50%→74%→100%, "0 tracks"→"1209 tracks",
9.1s→0.0s) instead of staying frozen; a two-medium scenario also
progresses correctly across the medium boundary, with the remaining-time
estimate becoming more accurate once the first medium's actual duration
is known.

### Follow-up: label text clipped on both ends (screenshot: "ing overflow tracks: medium 1 of 1... (201 tracks) - 2.4")

User's screenshot showed the label losing "Load" off the front (and
presumably "s left" off the back — `justify-content:center` clips
symmetrically) once the live-progress fix above actually started
rendering real text.

Root cause: `#mb-fetch-progress-outer` is `width:auto; min-width:420px`,
but its two children (`#mb-fetch-progress-fill`/`#mb-fetch-progress-label`)
are both `position:absolute` — absolutely-positioned elements are removed
from normal flow and contribute nothing to their parent's auto/intrinsic
width. So the container never actually grows to fit the label text; it
always renders at exactly 420px (its explicit min-width), and anything
wider gets clipped by `overflow:hidden`. This was invisible before because
the original paginated-fetch label ("Loading page 999 of 999... (99999
rows) - 9999.9s left", ~55 chars worst case) apparently fit within 420px;
the new overflow-tracks label ("Loading overflow tracks: medium 20 of
20... (99999 tracks) - 9999.9s left", ~73 chars worst case) does not.

Fix: bumped `min-width` from 420px to 600px (still comfortably under the
existing 750px `max-width` cap) — a static, generously-sized value chosen
to fit the new label's estimated worst case, matching the original
design's own approach (a fixed range sized for anticipated content, not a
truly dynamic auto-fit — CSS alone can't make an absolutely-positioned,
`width:100%`-of-parent label drive its own parent's width, that's a
circular dependency).

## 2026-08-07 — Disambiguation parentheses stripped; "#" column alignment (WIP.12)

Two small requests:

1. MusicBrainz's own disambiguation comment text is always wrapped in
   literal `(`/`)` (e.g. `"(version 1)"`, `"(live, 1978‐07‐07: …)"`) —
   made sense inline in the native Title cell, redundant now that it's
   its own "Disambiguation" column. New `_stripSurroundingParens(container)`
   walks `container`'s text nodes via `TreeWalker` (not just
   `container.firstChild`/`.lastChild` — the comment's text can be either
   a bare text node directly inside the moved `span.comment`, e.g.
   `debug/tracklist-live.html`'s `class="jesus2099userjs81127recdis
   comment"` span, or wrapped in a nested `<bdi>`, e.g.
   `debug/area-column.html`'s engineer/producer disambiguations like
   `<span class="comment"><bdi>(US engineer)</bdi></span>` — both shapes
   confirmed present in this codebase's own debug fixtures) and strips a
   leading `(` from the first text node / trailing `)` from the last, in
   place. Called right after moving `_commentSpan` into the Disambiguation
   `<td>`. Verified against both shapes via jsdom (bare text and
   `<bdi>`-wrapped), plus the existing `tracklist-live.html`-derived Test3
   fixture (multi-word comment, confirms only the outermost parens are
   stripped, not anything else).
2. Added `{ sourceColumn: '#', align: 'C' }` as the first `integerColumns`
   entry for `release-tracks`, matching `Rating`'s center alignment.

## 2026-08-07 — "Recording of" + attribute columns (WIP.13)

New request (`debug/rec-of.org`, markup in `debug/recording.html`/
`live-recording.html`/`live-cover-recording.html`, all real fragments
from `/release/6d19588c-...` and `/release/e7969bdb-...`): extract the
"ARs" relationship data's "recording of" `dl.ars` — `<dt>{attrs
}recording of:</dt><dd><a href="/work/...">Work Name</a> (optional date)
<dl class="ars">...writer/lyricist/publisher...</dl></dd>` — into a new
"Recording of" column (work name + link), plus one true/false column per
attribute word actually used on the release, from the fixed 8-word
MusicBrainz set (`acappella`, `cover`, `demo`, `instrumental`, `karaoke`,
`live`, `medley`, `partial`).

Two explicit corrections from the user during planning, both now the
permanent design for this and any future "extract more from ARs" work:

1. **Never touch "ARs"** — first plan draft used the same move-semantics
   every other extraction this session uses (Video, Recording artist,
   Disambiguation, AcoustID, ISRC — see their own entries above), with a
   "partial removal" scheme (strip just the work link out of the `<dd>`,
   leave nested writer/publisher `dl.ars` blocks behind). User rejected
   this: "for the case of the 'Recording of' and later maybe more 'ARs'
   extractions, do not remove the extracted data from the 'ARs' column,
   leave that column as is." Implementation switched to `cloneNode`
   (never mutating `_bareArsDiv`) — the existing
   `if (_arsTh) { ...move _bareArsDiv's children... }` block runs
   completely unchanged, so "ARs" ends up with the exact same content it
   would have without this feature at all, work link included
   (duplicated in both places). Verified via jsdom: "ARs" still contains
   the work link AND the nested lyricist/publisher `dl.ars`, dt label
   unchanged.
2. **Position before "ARs"**, not appended at the table's end like every
   other column added this session — mid-turn correction while still in
   plan mode.
3. **Master setting** `sa_enable_release_tracks_recording_of_columns`
   (default on) for the whole feature — also a mid-turn addition (every
   other column added this session besides AcoustIDs/ISRCs has no
   individual toggle).

Implementation: `_findRecOfDt(titleTd)` (classifies the bare `div.ars`
the same way `_bareArsDiv` already does elsewhere in this function, then
finds its direct-child `dl.ars > dt` matching `/recording of:$/i`) and
`_parseRecOfAttributes(dt)` (strips the trailing "recording of:", splits
the remaining prefix on whitespace, filters to the fixed 8-word
`REC_OF_ATTRIBUTES` set — so an unrecognised word never produces a stray
column) are new standalone helpers, used both by a page-wide scan (mirrors
`_pageHasVideo`/`_pageHasRecArtist`/`_pageHasDisambig`'s
`_anyTitleCellMatches` pattern for the boolean "does any track have a
'recording of' at all", plus a dedicated loop collecting the *union* of
attribute words across every table/row into a `Set`) and the per-row
extraction. Row/header positioning ("before ARs") resolves the "ARs"
header/cell reference (either the pre-existing one from `_headerCells`,
or the freshly-created `_arsTh`/first-row `<td>` this same pass) and
inserts via `.before()` at the header level; at the row level, no
`.before()` is needed at all — `row.appendChild()` always appends at the
current tail, so simply placing this extraction's code *before* the
existing ARs-move block in the function body is sufficient to land the
new `<td>`s in the right order, matching how every prior column addition
this session already relies on code order for row-level positioning.

Verified via jsdom: 3 separate tables built from the actual debug fixture
markup (plain "recording of:", "live recording of:", "live cover
recording of:") in one document — confirms the page-wide *union* of
attributes (not per-table): the plain table has neither attribute itself
but still gets both "Live" and "Cover" columns (correctly `false` for
that row) once ANY other table on the release uses them, matching the
same `renderGroupedTable()` shared-header-template constraint documented
in the Video/Recording-artist/Disambiguation entries above. Also confirms
"ARs" is untouched (work link findable in both "Recording of" and "ARs"
simultaneously, nested dl.ars blocks intact, dt text unchanged), the
setting-off case creates neither column, and idempotency (extended the
existing Test4 double-run fixture to also include a "recording of" block).

### Follow-up: work glyph in the header, attribute-name values instead of true/false

Two more corrections after the initial implementation:

1. **Work glyph in the "Recording of" header.** MusicBrainz always
   renders an empty, CSS-styled `<span class="worklink"></span>` right
   before a work link (confirmed in all three fixtures — e.g.
   `debug/recording.html`'s `<dd><span class="worklink"></span><a
   href="/work/...">`) — purely a visual icon, no text/content of its
   own. Since it's stateless (identical regardless of which row it came
   from) and this userscript only ever runs on musicbrainz.org (so MB's
   own site-wide CSS for `.worklink` is always available, wherever the
   span ends up in the DOM), the `<th>` now gets a **freshly-created**
   `<span class="worklink">` appended after the text "Recording of " —
   no need to clone one from any particular row. Confirmed this doesn't
   disturb any of the existing `th.textContent.trim() === 'Recording of'`
   header-name-matching checks elsewhere in the function (idempotency
   guard, `_arsHeaderRef` lookup) — `textContent` ignores the empty span
   entirely, so it still trims to exactly `"Recording of"`.
2. **Attribute cell values**: `'true'`/`'false'` → the attribute word
   itself (e.g. `'live'`) when present, empty string when absent — user's
   literal wording: "instead of rendering 'true' render the actual
   attribute name 'live'" / "instead of rendering 'false' render an empty
   cell". One-line change in the per-row extraction
   (`_td.textContent = _recOfAttrs.includes(attr) ? attr : ''` — previously
   left the `? 'true' : 'false'` ternary in place). Column header names
   stay capitalized ("Live") — only the cell VALUES changed to the raw
   lowercase attribute word, matching the user's example verbatim.

Both changes verified via the existing Test12 (3-table page-wide union
fixture) — added a `span.worklink` presence check on the "Recording of"
header, and updated every attribute-cell assertion from `'true'`/`'false'`
to the attribute word/empty string.

### Follow-up: work glyph never actually rendered (debug/missing-glyph.html)

User's screenshot showed the "Recording of" header with no icon at all —
just plain text + the standard sort/filter controls. Confirmed via
`debug/missing-glyph.html` (a snapshot of the FINAL rendered
`.mb-col-hdr-flex` for this column): `<div class="mb-col-hdr-flex">Recording
of <span class="sort-icon-btn">⇅</span>...` — no `span.worklink` anywhere.

Root cause: `makeTableSortableUnified()` (`:40317`) rebuilds **every**
`<th>` from scratch, unconditionally — `const colName = th.textContent...`
(reads text only) immediately followed by `th.innerHTML = ''` (wipes
*everything*, including any child element), then rebuilds a fresh
`.mb-col-hdr-flex` from that plain `colName` string
(`hdrFlex.appendChild(document.createTextNode(\`${colName} \`))`). The
glyph `<span class="worklink">` I'd appended directly to `_recOfTh` in
`applyExtractTrackTitleData()` (pre-processing, well before this rebuild
runs) never had a chance — this pipeline stage doesn't preserve or even
look at a `<th>`'s existing child elements, only its flattened text.

The jsdom test suite couldn't have caught this: it only exercises
`applyExtractTrackTitleData()` directly, never simulates
`makeTableSortableUnified()`'s rebuild — a real blind spot for anything
that assumes a `<th>`'s content survives past pre-processing.

Fix: reverted `_recOfTh` to plain `textContent = 'Recording of'` (no
glyph at creation time), and added a new post-render function,
`_recOfInitColHeaderGlyph()`, mirroring the *already-established* pattern
`_artInitCaaColHeaderToggle()` (`:52060`) uses for the CAA/EAA
column-header thumbnail toggle button — inject extra UI into an
already-built `.mb-col-hdr-flex` by locating the target column's `<th>`
by name AFTER the standard render pipeline has finished, not before.
Called from the tail of `renderGroupedTable()`, right alongside
`initAcoustIdIsrcObserver()` (same release-tracks-only, safe-to-re-run,
no-op-when-absent shape). Idempotency uses a `span.worklink` presence
check directly, since — unlike the CAA/EAA button — there's no dedicated
marker attribute already established for this to key off.

Verified with a new, dedicated jsdom test (Test14) that manually builds
the *exact* `.mb-col-hdr-flex` structure confirmed in
`debug/missing-glyph.html` (text node + `span.sort-icon-btn`, no
`makeTableSortableUnified()` simulation needed since the structure itself
is now hand-built to match) — confirms the glyph lands immediately after
the text node and before the sort icons, other columns are untouched, and
a second call doesn't duplicate it.

### Follow-up: glyph in the DOM but still invisible (debug/still-missing-glyph.html)

The `_recOfInitColHeaderGlyph()` fix above got `<span class="worklink">`
correctly positioned in the live DOM (confirmed via
`debug/still-missing-glyph.html`: `<div class="mb-col-hdr-flex">Recording
of <span class="worklink"></span><span class="sort-icon-btn">⇅</span>...`
— exactly where intended) — but the icon still didn't render visually.

Since live CSS isn't inspectable from this environment, asked the user to
compare browser devtools' Computed panel for the (working) `span.worklink`
inside an "ARs" cell's `dl.ars` vs. the (invisible) one just injected into
the header. Both showed **identical** `background-image` (the same
`data:image/svg+xml` icon), `background-size: 14px`, `background-position:
0px 0px`, `background-repeat: no-repeat`, `padding-left: 16px` — i.e. the
`.worklink` CSS rule matches and applies correctly in BOTH places; it is
NOT scoped to `.ars`/`dd` as first suspected. The one real difference:
`display: inline` / `height: auto` (→ ~13px, from line-height) in the
working "ARs" copy, vs. `display: block` / `height: 0px` in the header
copy.

Root cause: per the CSS Flexbox spec, **any direct child of a `display:
flex` container has its outer `display` "blockified"** — forced to a
block-level box — regardless of what `display` value is actually set on
that child (even an explicit `inline-block` gets blockified this way).
`.mb-col-hdr-flex` is `display:flex`, so the injected glyph span, being
one of its direct children, is blockified to `display:block` no matter
what. A plain inline element flowing mid-text gets a non-zero height for
free from the surrounding line box's line-height, even with zero content
of its own (this is what makes the "ARs" copy visible) — but a
blockified flex item is no longer part of any line box, so with no
explicit `height` set, an empty block box is simply 0px tall, collapsing
the (correctly positioned, correctly painted) background-image icon into
an invisible 16px×0px sliver.

Fix: `glyph.style.height = '14px'` (matching the icon's own
`background-size`) on the injected span — the only thing actually needed;
width already works correctly via `padding-left` regardless of block vs.
inline context, confirmed by both computed-style panels showing the same
16px padding-left. Verified via jsdom (can't verify actual pixel
rendering without a layout engine, but confirms the inline style is
correctly set) by extending Test14 with an explicit
`glyph.style.height === '14px'` assertion.

### Follow-up: no gap between the glyph and the sort icons

Glyph now visible, but sitting flush against the `⇅` sort icon (the
glyph has no intrinsic spacing of its own — its `background-image` only
occupies its own `padding-left`, nothing to its right). Added a plain
`document.createTextNode(' ')` right after the glyph in
`_recOfInitColHeaderGlyph()`, so the flex row reads `"Recording of "` +
glyph + `" "` + sort icons. Idempotency guard (checks for an existing
`span.worklink` before inserting anything) already covers the space too
— a second call skips both, no separate fix needed there.

### Follow-up: still no gap, even with the trailing space text node (debug/still-no-blank.html)

`debug/still-no-blank.html`'s snapshot confirmed the trailing
`document.createTextNode(' ')` from the previous fix WAS present in the
live DOM — `<span class="worklink" style="height: 14px;"></span> <span
class="sort-icon-btn">⇅</span>` — yet the glyph and the `⇅` icon still
rendered flush against each other, no visible gap.

Root cause: standard CSS whitespace-collapsing. A whitespace-only text
node sitting directly between two block-level (or, as established in the
previous entry, *blockified*) boxes collapses to zero rendered width —
it only survives as visible space between genuinely inline-flowing
content sharing a line box, which neither the glyph nor the sort-icon
span are anymore once inside `.mb-col-hdr-flex` (`display:flex`
blockifies every direct child, glyph included). A text node has no
`margin`/`padding` of its own to fall back on the way an element does.

Fix: replaced the trailing text node with `glyph.style.marginRight =
'4px'` on the glyph element itself — margin isn't subject to
whitespace-collapsing the way a text node is, so this produces a
guaranteed, real gap regardless of the flex-blockification at play.
Updated Test14 to assert `glyph.style.marginRight === '4px'` instead of
the old text-node-based assertions, and that the sort icon immediately
follows the glyph (no text node in between anymore).

### Follow-up: new "Date" column from the "recording of" `(on YYYY-MM-DD)` suffix

User's next request also asked for the optional `(on YYYY-MM-DD)` date
MusicBrainz appends after the work link inside the same "recording of"
`<dd>` (e.g. `<dd><span class="worklink"></span><a
href="/work/...">Rave On</a> (on 1978-07-07)<dl class="ars">...`) to be
extracted into its own new "Date" column, positioned directly after
"Recording of" and before the attribute columns.

Added `_parseRecOfDate(dd)`: finds the `<dd>`'s direct-child TEXT NODE
matching `/\(on [\d-]+\)/` (the date sits as a bare text node between the
work `<a>` and the nested `dl.ars` writer/publisher blocks, same DOM
shape confirmed in `debug/recording.html`/`debug/live-recording.html`/
`debug/live-cover-recording.html`) and extracts just the `YYYY-MM-DD`
substring — returns `null` when absent (most "recording of" blocks have
no date, e.g. a work with no known original recording date).

Same purely-additive, page-wide-gated, single-master-setting pattern as
"Recording of" and the attribute columns: folded into the existing
page-wide attribute-presence scan loop (adds `_pageHasRecOfDate`,
computed alongside `_presentRecOfAttributes` in the same per-row pass,
zero extra DOM traversal), a new `_recOfDateTh` header inserted right
after `_recOfTh` (before the attribute `<th>`s, still all chained via
`.before()` off the "ARs" header), and a new `<td>` in the per-row
extraction block — which required hoisting `_recOfDd` resolution out of
the `_recOfTh`-only branch so both the work-link `<td>` and the new date
`<td>` share the same lookup. `_recOfDt`/`_recOfDd` are still read-only
here, same as before — "ARs" is untouched by this addition too.

Verified via jsdom: Test12 extended to assert the "Date" column appears
with the correct extracted value across all 3 fixture tables (including
one with no date, confirming the column still renders with an empty cell
rather than being entirely per-row conditional), with position
assertions updated for the extra column before "ARs"; Test13 extended to
confirm no "Date" column is created either when the whole
`sa_enable_release_tracks_recording_of_columns` setting is off.

### Follow-up: reordered "Recording of"/"Recording date" after the attribute columns, renamed "Date"

User's next request: render "Recording of" and "Date" (renamed to
"Recording date") AFTER the recording-of attribute columns, instead of
before. Final column order (still all directly before "ARs"): attribute
columns (`Acappella`/`Cover`/`Demo`/`Instrumental`/`Karaoke`/`Live`/
`Medley`/`Partial`, in `REC_OF_ATTRIBUTES`' fixed canonical order) →
"Recording of" → "Recording date" → "ARs".

Both the header-creation block and the row-level `<td>`-append block in
`applyExtractTrackTitleData()` insert everything via `.before(ref)`
against the same, unchanging `ARs` reference (`_arsHeaderRef` for
headers; plain `row.appendChild()` in append-order for `<td>`s, since
"ARs" is always the last thing appended in the row). Against a fixed
`.before(ref)` target, whichever element is inserted LAST ends up
closest to `ref` — so simply reordering the three code blocks (attribute
`forEach` loop, then "Recording of" `<th>` creation, then "Recording
date" `<th>` creation) was sufficient to reorder the rendered columns;
same reordering applied to the row-level `<td>`-creation blocks so
`row.appendChild()`'s append order matches. No new insertion-point logic
needed.

Renamed the "Date" column to "Recording date" throughout: header
creation/idempotency-check string, the `configSchema` description for
`sa_enable_release_tracks_recording_of_columns`, and the function-level
JSDoc bullet — a bare "Date" read ambiguously sitting among a release
tracklist's other columns.

Verified via jsdom: updated Test12's position assertions for the new
order (discovered, while updating them, that the attribute columns
themselves are NOT emitted in the order their `<dt>` text lists them —
e.g. `"live cover recording of:"` lists "live" before "cover", but the
rendered columns show "Cover" before "Live" — because insertion order
follows `REC_OF_ATTRIBUTES`' fixed canonical array order, not the
per-track `<dt>` word order, which is the whole point of a page-wide
canonical order in the first place); renamed all "Date"-column
assertions (Test12, Test13) to "Recording date".

### Follow-up: still no blank — this time on the OTHER side of the glyph (debug/still-missing-glyph.html, second capture)

User's next report, same filename reused for a fresh capture: no gap
between "Recording of" and the glyph itself (leading edge), rather than
between the glyph and the sort icons (trailing edge, already fixed).
Snapshot markup: `Recording of <span class="worklink"></span><span
class="sort-icon-btn">...` — the leading space IS present in the markup
(it's the trailing space `makeTableSortableUnified()` always bakes into
its `${colName} ` text node, per the existing comment in
`_recOfInitColHeaderGlyph()`), yet still didn't render as a visible gap.

Root cause: identical to the earlier trailing-space bug
(`debug/still-no-blank.html`), just on the other side. CSS collapses
whitespace sitting directly against a block-level box on EITHER side of
that whitespace, not just after it — and the glyph is blockified (a flex
item inside `.mb-col-hdr-flex`, per the height fix's own comment)
regardless of which neighboring text it's compared against. The
`${colName} ` template's trailing space, now sitting immediately before
the blockified glyph, collapses away exactly like the manually-added
trailing space after the glyph did.

Fix: `glyph.style.marginLeft = '4px'` alongside the existing
`marginRight`, for the identical reason — margin is an explicit
box-model property, not rendered text, so it isn't subject to
whitespace-collapsing either way. Extended Test14 with a
`glyph.style.marginLeft === '4px'` assertion right next to the existing
`marginRight` one.

### Follow-up: "Recorded at event"/"Recorded at place" columns

User's next request: extract two more relationship types from the same
bare `div.ars` — "recorded at" against an event, and "recorded at"
(optionally combined with "mixed at") against a place. Both are *sibling*
`dl.ars` blocks to "recording of:" within `div.ars`, not nested inside
it. Three real markup shapes were supplied:

1. **Event, bare "recorded at:"** — `<dd>` starts with `<span
   class="eventlink"></span>`, then the event anchor whose `<bdi>` embeds
   the date+venue+location as one string (`"1978‐07‐07: The Roxy Theatre,
   West Hollywood, CA, USA"`), then an optional trailing date in
   parens — **without** an `"on "` prefix in this example (`" (1978-07-07)"`,
   unlike "recording of"'s `"(on YYYY-MM-DD)"`).
2. **Place, bare "recorded at:"** — `<dd>` starts with `<span
   class="placelink"></span>`, then the place anchor, then `"in <area
   anchor>, <area anchor>, <country anchor>"`, then optionally the same
   `<!-- -->(on YYYY-MM-DD)` comment-separator date pattern
   `_parseRecOfDate` already parses for "recording of".
3. **Place, combined `<dt>` verb, no date** — `<dt>recorded at and mixed
   at:</dt>`, otherwise the same `span.placelink` + place anchor + area
   chain shape as (2), confirming the `<dt>` wording is NOT a fixed
   string (MusicBrainz can combine "recorded at" with "mixed at", and
   possibly other combinations not yet seen).

**Design decisions** (all user-approved before implementation):

- **Classify by the `<dd>`'s glyph span, not the `<dt>` text.** Since the
  `<dt>` wording varies, matching it exactly (like `_findRecOfDt`'s
  `/recording of:$/i`) would miss shape 3 above. Instead
  `_findRecordedAtDt(titleTd, glyphClass)` does a loose, unanchored
  `/recorded at/i` substring test against the `<dt>`, then requires that
  same `dl.ars`'s `<dd>` have a `:scope > span.${glyphClass}` child —
  `glyphClass` is `'eventlink'` or `'placelink'`, passed in by the
  caller. This is the actual classifying signal per the request.
- **Two separate columns are required, not just a style choice.** The
  standard sort/filter header pipeline (`makeTableSortableUnified()`)
  rebuilds every `<th>`'s `dataset.colName` fresh from `th.textContent`
  on every render. Two `<th>`s both showing literal text "Recorded at"
  would collide: the second would never pass its own
  `_headerCells.some(th => th.textContent.trim() === 'Recorded at')`
  creation guard (the first one already satisfies it), and the
  post-render glyph injector's `_cleanColHeaderText(th) === 'Recorded
  at'` lookup would only ever find the first one via `.find()`. Labeling
  them "Recorded at event" and "Recorded at place" sidesteps this
  entirely while still reading as one family.
- **No date extraction this round** — deliberately deferred. Only the
  cloned event/place `<a>` goes into the new columns; the date (in
  either format seen above) stays visible only inside "ARs", same as the
  "in `<area>`, `<country>`" chain for the place variant.
- **`_recordedAtDdAnchor(dt, hrefPrefix)`** extracts the anchor via
  `:scope > a[href^="${hrefPrefix}"]` rather than just the first `:scope
  > a` (unlike "Recording of"'s work-anchor lookup) — a place `<dd>` has
  *several* sibling anchors (the place itself, then each area in the "in
  `<area>`, `<area>`, `<country>`" chain), so the href-prefix filter is
  what actually picks the right one; position alone would happen to work
  today but isn't the real invariant.
- **First match only, per kind, per row** — mirrors `_findRecOfDt`'s own
  simplicity (no multi-row list support exists for "Recording of"
  either). Verified with a fixture with two event-type `dl.ars` siblings
  in the same row.
- **Header-creation gating widened.** The existing `if (_pageHasRecOf) {
  ... }` block correctly gates attribute columns + "Recording of" +
  "Recording date" together, but was too narrow for the new columns — a
  release can have "recorded at" data with zero "recording of" data at
  all. Widened to `if (_pageHasRecOf || _pageHasRecordedAtEvent ||
  _pageHasRecordedAtPlace)`, with the existing recording-of-specific code
  nested behind its own inner `if (_pageHasRecOf)`. The early-return
  guard right after this block was extended the same way — otherwise a
  release with only recorded-at data would create the headers but bail
  before the row loop ever populated them.
- **Reused the existing setting**
  `sa_enable_release_tracks_recording_of_columns` rather than adding a
  new one — same purely-additive family as "Recording of"/"Recording
  date", avoids settings sprawl. Label/description updated to mention
  the new columns.
- **Column order**: since every column in this group is inserted via
  `.before(_arsHeaderRef)` against the same fixed "ARs" reference, and a
  *later* insertion against a fixed reference always lands closer to it
  than an earlier one, simply creating the two new blocks *after* the
  existing attribute/Recording-of/Recording-date code (in the same
  `if` block) was sufficient to produce the desired final order —
  [attribute columns] → Recording of → Recording date → Recorded at
  (event) → Recorded at place → ARs — with no extra positioning logic.
  Same mechanism already used for every prior reordering in this
  function's history.

**Glyph injector generalized.** `_recOfInitColHeaderGlyph()` (hard-coded
to "Recording of"/`worklink`) became `_initColHeaderGlyph(columnName,
glyphClass)`, called three times from `renderGroupedTable()`'s tail. The
`height: 14px` / `marginLeft`/`marginRight: 4px` fixes established for
`worklink` (see the entries above) are reused verbatim for
`eventlink`/`placelink`, since the root cause (any direct child of
`.mb-col-hdr-flex`, a flex container, gets blockified regardless of its
own `display`) is about the flex container, not the specific glyph
class — but this is **unverified in a real browser** for the two new
glyph classes (no CSS rendering available in this environment). If
either icon turns out missing, mis-sized, or misaligned once tested
live, expect the same kind of Computed-panel comparison documented
above for `worklink` to be needed, most likely just adjusting the
`height`/margin constants for that glyph class specifically.

Verified via jsdom: new Test15 (page-wide union across 3 tables built
from the exact event/place/combined-dt shapes above — including a check
that a release with recorded-at data but zero recording-of data still
gets both new columns, a regression check for the widened header-gating
condition) and Test16 (recording-of + both recorded-at kinds together in
one row, for column-order verification; first-match-only with two
event-type siblings; setting-off). Test14 was extended (not replaced) to
also exercise `_initColHeaderGlyph` for `eventlink`/`placelink`,
confirming no cross-contamination between the three glyph columns.

## 2026-08-08 — "Recorded at place" missing area chain + missing entirely for name-variations (WIP.15)

User-supplied snapshots: `with-place.html`, `without-place.html` (both
POST-render `/release/f50fcf09-4339-4e1c-91cd-e1d2a7b3a7bc` full-page
snapshots — the "ARs" column's `dl.ars` content is an exact, unmodified
copy of the original bare `div.ars` source, since that extraction moves
those nodes only after every "recorded at"/"recording of" read, so it
doubles as ground truth for what `_findRecordedAtDt` originally saw), and
`place-complete.html` (isolated single `<dd>` snippet, the "Meadowlands
Arena" case only).

- **Bug 1 (with-place.html, "Meadowlands Arena")**: `_recordedAtPlaceTh`'s
  cell was built from `_recordedAtDdAnchor()` — just the place `<a>`,
  deliberately excluding the "in `<area>`, `<area>`, `<country>`" chain
  per WIP.14's original design comment (mirroring how "Recorded at
  event"'s own anchor text already spells out date/venue/location, so no
  extra context was thought needed for place either). User wants the area
  chain included for place — a bare venue name has no context on its own.
  Fixed with a new `_recordedAtPlaceDetails()` that clones the whole
  `<dd>` (place anchor + " in " + area chain: area links, region flag
  `<img>`, CSS-flag-background country `<span>`) and strips only the
  trailing `" (on YYYY-MM-DD)"` text node (regex `/^\s*\(on\s+.*\)\s*$/`
  against the fragment's last child) — that date stays "ARs"-only, same
  as "Recording of"'s own trailing date. "Recorded at event" is
  unchanged (still `_recordedAtDdAnchor`, anchor-only).
- **Bug 2 (without-place.html, "Nassau Coliseum")**: extracted nothing at
  all. Root cause: the place has a name-variation (alias name differing
  from canonical — MB wraps it as `<dd><span class="placelink"></span>
  <span class="name-variation"><a href="/place/...">…</a></span> in
  …</dd>`, one level deeper than the bare case), and
  `_recordedAtDdAnchor()` queried `:scope > a[href^="..."]` — a
  direct-child-only query that silently found nothing once the anchor
  sat inside the extra `<span>`. `_findRecordedAtDt()`'s own presence
  check (`:scope > span.${glyphClass}`) still passed fine since the
  glyph span itself is always a direct child — so the column got created
  (page-wide gate saw the glyph) but individual name-variation rows
  rendered empty. Fixed by dropping `:scope >` from
  `_recordedAtDdAnchor()`'s query — the href-prefix filter alone (`/place/`
  vs. `/event/`, disjoint from area links' `/area/`) already picks the
  right anchor at any depth. `_recordedAtPlaceDetails()` (bug 1's fix)
  sidesteps this class of bug entirely for place, since it clones the
  whole `<dd>` rather than searching for a specific anchor — but the
  underlying `_recordedAtDdAnchor()` relaxation still matters for
  "Recorded at event", which could hit the identical name-variation
  shape (not confirmed in a snapshot, but the same MusicBrainz template
  convention).

Verified via a real jsdom run (not just read-through) against the actual
`with-place.html`/`without-place.html` ARs-column content, reconstructed
into a bare `div.ars` and fed through the real `_findRecordedAtDt`/
`_recordedAtDdAnchor`/`_recordedAtPlaceDetails` functions extracted
verbatim from the script: place cell text now reads "Meadowlands Arena in
East Rutherford,  New Jersey, United States" (bug 1) and "Nassau Coliseum
in Uniondale,  New York, United States" (bug 2, previously empty) with
both flags preserved and no trailing date in either.

## 2026-08-08 — engineer/mixer/producer credit columns (WIP.16)

Spec: `debug/artist-roles.org`. Snapshot: `debug/full.html` (raw
`/release/f50fcf09-4339-4e1c-91cd-e1d2a7b3a7bc/edit-relationships` source,
NOT rendered — the actual pre-script `<dl class="ars">` markup, unlike
`with-place.html`/`without-place.html` above which were rendered
snapshots).

**Real dt-label inventory found** (grepped the whole 78MB file): only 5
distinct role labels exist — `producer:` (40x, always 3 artists "and"-joined,
no date), `recording engineer:` (40x/21 distinct values, single artist +
`<!-- -->(on YYYY-MM-DD)` — note the HTML comment sitting between the anchor
and the date text), `mixer:` (40x, 39 with no date, 1 with `<!-- -->(in
2015)`), `assistant mixer:` (40x, single artist, no date — the one real
attribute-prefixed example in this snapshot), bare `engineer:` (9x, single
artist, no date, confirmed standalone — immediately followed by
`<dt>producer:</dt>`, not a truncated "recording engineer:"). No `co-`,
`additional`, `associate`, or `executive` combos exist anywhere in this
release — those remain spec-only, unverified against real MB markup.

**Real duplicate-role-credit case, confirmed in one `<dl class="ars">`**:
`<dt>assistant mixer:</dt><dd>...Paul Hamingson...</dd><dt>mixer:</dt>
<dd>...Bob Clearmountain...</dd>` — two separate `<dt>`s for the same base
role on the same track. This directly motivated the merge design (see
below) rather than reusing the rest of this column family's "first match
only" convention, which would have silently dropped one of the two people.

**Design decisions, resolved with the user before implementation** (each
time the recommended option was chosen):
1. **Merge, don't take-first**: `_findCreditDts` returns every matching
   `<dt>` for a role (not just the first), and the row-population code
   merges all their `<dd>`'s artists into one multi-person list cell.
   Attribute columns become row-level "used by any merged entry" flags,
   not tied to a specific person. Deliberate divergence from
   `_findRecOfDt`/`_findRecordedAtDt`'s established "first match only, in
   document order" rule — driven by the real duplicate-credit case above.
2. **Per-role-prefixed attribute headers** (`"Mixer (Assistant)"`, never a
   bare `"Assistant"`) — avoids header-text collisions since two different
   roles could each independently use the same attribute word elsewhere on
   a release; column identity is derived from `th.textContent` on every
   render (same reasoning already established for "Recorded at
   event"/"Recorded at place" needing separate columns).
3. **New dedicated setting** (`sa_enable_release_tracks_credit_role_columns`),
   not reusing `sa_enable_release_tracks_recording_of_columns` — matches
   the AcoustIDs/ISRCs precedent of independent toggles.
4. **Trailing dates dropped entirely**, ARs-only — no "X date" columns for
   these 4 roles, unlike "Recording of"'s "Recording date". Achieved for
   free since `_buildCreditListTd` only ever extracts `:scope > a` anchors.

**Disambiguation bug that had to be designed around**: a naive "`<dt>` ends
with `<role>:`" match would be wrong for bare `engineer:` vs. `recording
engineer:` — the latter also literally ends in the substring "engineer:".
`_findCreditDts` instead requires the `<dt>`'s trailing N words to exactly
equal the target role phrase AND every word before that (if any) to be a
recognized attribute word for that role, or the whole `<dt>` is rejected —
deliberately STRICT, unlike `_parseRecOfAttributes`'s lenient "silently
drop an unrecognized word without invalidating the match" behavior (recOf
never had this compound-role-name collision problem, since there's only
ever one "recording of" role).

**Hyphen-tokenization discovery**: the org file's own examples show "co"
renders hyphen-attached to the following word ("co-recording engineer:",
"co-executive engineer:"), not space-separated like the other attribute
words. `_findCreditDts` splits on `/[\s-]+/` (whitespace OR hyphen), not
plain `/\s+/`, to handle this — safe since no role word or attribute word
itself contains a hyphen. No real example of this exists in
`debug/full.html`; verified only via a synthetic jsdom test (hand-built
`<dt>` nodes), not against real MusicBrainz markup — flagged as such,
matching this codebase's existing "unverified in a live browser" caveat
convention used elsewhere.

**`CREDIT_ROLES` data-driven loop, not copy-paste-per-role**: unlike
`_findRecOfDt` vs. `_findRecordedAtDt` (hand-duplicated because they
differ in *matching strategy* — dt-text-suffix-match vs.
dt-substring+dd-glyph-class-match), all 4 new roles share one identical
extraction shape, differing only in role phrase/column label/attribute
vocabulary — a textbook table-driven case. A single `CREDIT_ROLES` array is
looped over for gating, header insertion, and row population, so the merge
behavior and disambiguation logic are implemented once, not reimplemented
(and potentially inconsistently) 4 times.

**Verified via jsdom** (real function source extracted from the script,
`eval`'d against jsdom's `document`/`Node`, run against the real
`<dl class="ars">` block containing recording engineer/engineer/producer/
assistant mixer/mixer for one track in `debug/full.html`): bare
`engineer:` matches only the `engineer` role (Toby Scott), not
`recEngineer`; `recording engineer:` matches only `recEngineer` (Jimmy
Iovine), not bare `engineer`; `producer:` correctly yields 3 `<li>`s (Jon
Landau, Chuck Plotkin, Bruce Springsteen) regardless of comma-vs-"and"
join text; `mixer` correctly MERGES the bare and `assistant mixer:` `<dt>`s
into one 2-item list (Paul Hamingson, Bob Clearmountain) with a unioned
`{'assistant'}` attribute set; no date text or HTML comment node leaked
into any built `<li>`. A separate 3-table jsdom fixture confirmed the
page-wide gating union correctly detects `mixer`/`producer` roles present
on only SOME tables (mediums) while leaving `recEngineer`/`engineer`
correctly absent. Synthetic hyphen tests (§ above) also passed.

## 2026-08-08 — "Recorded at place" multiple places per relationship (WIP.17)

User-supplied isolated `<dd>` snippets (raw source, not rendered):
`multiple-places.html` (from `/release/6d19588c-0305-4fb0-b687-d4b75a75c3fd`,
2 places) and `multiple-places-2.html` (from
`/release/356e8b33-4504-442a-ac3d-34af95e6ea1d`, 3 places).

**Confirmed shape**: a single "recorded at:" relationship's `<dd>` can hold
MORE THAN ONE place, each with its own full "in `<area>`, `<area>`,
`<country>`" chain, all as siblings inside the one `<dd>` — not multiple
separate `<dt>recorded at:</dt>` entries (unlike the engineer/mixer
duplicate-credit case from WIP.16, this is genuinely one relationship
naming several places). Places are joined by ", " and/or " and " between
them. Each place's content is reliably delimited by its own leading
`<span class="placelink"></span>` marker — the exact same structural
signal `_findRecordedAtDt`'s glyph-presence check already keys off — so
splitting on that marker (rather than trying to parse the "and"/","
wording, which MusicBrainz doesn't apply consistently — 2-place case uses
" and " between the only pair; 3-place case uses ", " then " and "
between successive pairs, i.e. an Oxford-less list) is robust regardless
of how many places or what separator words appear.

**Extra wrinkle found in `multiple-places-2.html`**: place 1 ("Power
Station at BerkleeNYC") has a per-place instrument attribution — `<!--
--> (<a href="/instrument/...">strings</a>)<!-- -->` — sitting between the
end of its area chain and the ", " that joins to place 2 (same `<!--
-->(...)<!-- -->` comment-node-wrapped-parenthetical convention already
seen for dates, e.g. `_parseRecOfDate`'s "(on …)"). Also place 3 ("Thrill
Hill Recording") has BOTH a name-variation wrapper (alias name, same
convention as the WIP.15 fix) AND its own `<span class="comment">`
("Springsteen's home studio in Colts Neck"). Confirms the per-place split
must only strip the EXACT separator text immediately preceding the next
place's marker, not anything else trailing a place's own content — an
overly aggressive "everything after the area chain is separator" rule
would have destroyed the "(strings)" attribution.

**Implementation**: `_recordedAtPlaceDetails` (WIP.15) replaced by
`_buildRecordedAtPlaceTd`, which now always returns a `<td><ul><li>…`
(never a flat fragment) — walks the `<dd>`'s cloned child nodes, starts a
new segment at every direct-child `<span class="placelink">`, and for
every segment except the last, drops its final child IF that child is a
text node matching `/^[\s,]*(?:and[\s,]*)?$/i` (pure separator content) —
this correctly leaves the "(strings)" comment/link/comment sequence
untouched in place 1's segment (since the actual separator text ", " is
its own distinct trailing text node, added to the segment AFTER the
instrument parenthetical), while still stripping the " and "/", " joins
between every other pair of places. The whole-`<dd>` trailing "(on
YYYY-MM-DD)" strip (WIP.15) still runs first, before segmenting. Single-
place rows now produce a 1-item list instead of a flat fragment — same
content, matching this project's established single-item-list-cell
convention (no toggle, rendered untouched); added `'Recorded at place'` to
`release-tracks`'s `collapsableColumns` so the toggle machinery actually
engages for the multi-place case. `'Recorded at event'` was deliberately
NOT touched or added to `collapsableColumns` — the user's request and both
supplied snapshots are place-only; no evidence of a multi-event `<dd>` has
been seen, and an event anchor's own `<bdi>` text already spells out
date/venue/location with no separate area chain to split.

**Verified via jsdom** against both real snippets plus a regression check
against the WIP.15 single-place and name-variation cases (function source
extracted verbatim from the script): `multiple-places.html` → 2 `<li>`s
(Henson Recording Studios / Southern Tracks), each with its full area
chain and no leaked "and"; `multiple-places-2.html` → 3 `<li>`s (Power
Station at BerkleeNYC, with "(strings)" correctly retained / Stone Hill
Studio / Thrill Hill Recording, name-variation and its own comment both
correctly retained), no leaked ", "/" and " separators anywhere; the two
WIP.15 regression cases (Meadowlands Arena, Nassau Coliseum) each still
produce exactly one `<li>` with identical content to before.

## 2026-08-08 — "Additional" attribute column for "recorded at (place)" (WIP.18)

User request, no new debug HTML snapshot supplied this time. Investigated
via the embedded relationship-type JSON already present on the
edit-relationships page (search `"recorded at"` in `debug/full.html` —
this JSON describes every MB relationship type's phrase templates and
attributes, independent of any specific release's actual data).

**Confirmed**: the "recorded at" (place) relationship type (id 693,
`type0: "place"`) declares an `additional` attribute (min 0, max 1) whose
`reverse_link_phrase` template is literally
`"{additional:additionally} recorded at"` — i.e. when set, the `<dt>` a
recording's own tracklist shows reads **"additionally recorded at:"**
(adverb), not "additional recorded at:" (adjective). This is a different
inflection convention than the engineer/mixer/producer credit columns
(WIP.16), which use the adjective "additional" directly as the rendered
prefix word (e.g. "additional recording engineer:") — MusicBrainz's
phrase templates aren't uniform across relationship types, so each new
attribute needs its own real-wording check rather than assuming the
credit-roles convention generalizes.

**The "recorded at" (event) relationship type (id 809, `type0: "event"`)
also declares the same `additional` attribute**, but its own
`reverse_link_phrase` is plain `"recorded at"` with no `{additional:…}`
template at all — MusicBrainz's UI apparently never renders this
attribute in the recording-to-event direction, only recording-to-place.
Per this finding, "Recorded at event" intentionally gets no "Additional"-
equivalent column; only "Recorded at place" does.

**No real-data example of a track using this attribute exists in any
snapshot captured so far** (`full.html`, `with-place.html`,
`without-place.html`, `multiple-places.html`, `multiple-places-2.html`,
`place-complete.html`) — grepped all of them for "additionally recorded
at", zero hits. Implementation and verification are therefore based on
the confirmed relationship-type template only, not observed real markup —
flagged explicitly, matching this codebase's established "unverified
against real markup" caveat convention (see WIP.16's hyphen-tokenization
entry for the same kind of caveat).

**Implementation**: new `_recordedAtPlaceHasAdditional(dt)` — a loose
`/\badditionally\b/i` substring test against the whole `<dt>` text
(mirrors `_findRecordedAtDt`'s own loose `/recorded at/i` matching
philosophy, tolerant of MB's "recorded at and mixed at:"-style phrase
combining). A single boolean-style "Additional" column, not a
word-per-column loop like `REC_OF_ATTRIBUTES`/`CREDIT_ROLES` — this
relationship declares only the one attribute, so a whole extra-columns
mechanism would be overkill. Positioned via the same
`.before(_arsHeaderRef)` ordering trick as every other column in this
family, inserted between the existing "Recorded at event" and "Recorded
at place" blocks so it lands exactly there in the final column order:
… → Recorded at event → **Additional** → Recorded at place → [credit
columns] → ARs.

**Verified via a synthetic jsdom test** (real function source extracted
from the script; hand-built `<dt>` nodes, since no real example exists):
`"additionally recorded at:"` → `hasAdditional = true`; plain `"recorded
at:"` → `false`; `"additionally recorded at and mixed at:"` → `true`
(combined-phrase case still detected); a hypothetical adjective-form
`"additional recorded at:"` (NOT what MB actually renders, tested only as
a word-boundary regex sanity check) → correctly `false`, confirming
`\badditionally\b` doesn't accidentally match the unrelated word
"additional". `_findRecordedAtDt` itself required no changes — its
existing loose substring match already tolerates the "additionally "
prefix.

## 2026-08-08 — credit columns: instrument attribution merged into artist's list item (WIP.20)

**Source**: user report against
https://musicbrainz.org/release/356e8b33-4504-442a-ac3d-34af95e6ea1d (the
same release used for WIP.17's multi-place example). `debug/buggy-list-title.html`
is the raw row markup, `debug/buggy-list.html` is the rendered (buggy) cell
output for "Recording engineer" on the "Only the Strong Survive" track.

**Bug**: `_buildCreditListTd` (WIP.16) built one `<li>` per `:scope > a`
anchor found in the `<dd>`, with no distinction between artist anchors and
any other anchor type. This track's `recording engineer:` `<dd>` credits 3
artists (Ian Kagey, Rob Lebret, Alex Venguer), each immediately followed by
a parenthetical instrument attribution:

```html
<span class="artistlink"></span><a href="/artist/…">Ian Kagey</a>
<!-- -->(<a href="/instrument/…">strings</a>)<!-- -->,
<span class="artistlink"></span><a href="/artist/…">Rob Lebret</a>
<!-- -->(<a href="/instrument/…">strings</a>)<!-- --> and
<span class="artistlink"></span><a href="/artist/…">Alex Venguer</a>
<!-- -->(<a href="/instrument/…">strings</a>)
```

Each `(strings)` is itself an `<a href="/instrument/…">`, a direct child of
the `<dd>` — so the flat anchor count treated it as a 4th "artist", turning
3 credited engineers into 6 list items with "strings" appearing 3 times as
its own unrelated row, completely disconnected from which artist it
belonged to (confirmed by reading `debug/buggy-list.html`'s rendered
`<ul>`: 6 `<li>`s, alternating artist/instrument).

**Fix**: `_buildCreditListTd` now segments each `<dd>` structurally, the
same technique WIP.17 already used for `_buildRecordedAtPlaceTd` — split on
each artist's own leading `<span class="artistlink"></span>` marker (the
credit-role equivalent of `_buildRecordedAtPlaceTd`'s `span.placelink`
marker). Every node up to the next marker (or end of `<dd>`) belongs to
that artist's segment. Within a segment: the artist `<a href="/artist/…">`
becomes the `<li>`'s base content; any `<a href="/instrument/…">` found in
the SAME segment is appended as `" (strings)"`, so it survives the
`<!-- -->` comment-node/`"(...)"` text wrapping but stays correctly paired.
More than one instrument anchor in a segment (e.g. a hypothetical
`(guitar, bass)`) are all kept, comma-joined in one parenthetical — no such
example exists in any captured snapshot, so this path is unverified
against real MusicBrainz markup, only reasoned by analogy to how MB already
comma-joins other same-`<dd>` link lists.

**Verified via jsdom** against the exact `<dd>` markup extracted from
`debug/buggy-list-title.html`: the 3-artist/3-instrument "recording
engineer:" `<dd>` now produces exactly 3 `<li>`s, each
`<a artist>Name</a> (<a instrument>strings</a>)`; the no-instrument
"engineer and mixer:" `<dd>` (Ron Aniello, Rob Lebret) is unaffected,
still 2 plain `<li>`s; a merged-`<dd>` scenario (both dds passed together,
exercising WIP.16's multi-`<dt>` merge path) correctly produces 5 `<li>`s
total with instrument pairing preserved only on the segments that actually
had one.

## 2026-08-08 — credit columns: name-variation-wrapped artist dropped; "Miscellaneous support" column (WIP.21)

**Source**: `debug/missing-engineer.html` (a bare `engineer:` `<dt>`/`<dd>`
pair, provided directly this time instead of a full page snapshot) and the
already-known "miscellaneous support:" `<dt>`/`<dd>` in
`debug/buggy-list-title.html` (same release as WIP.20, "Only the Strong
Survive").

**Bug 1 — name-variation-wrapped artist silently dropped**: the `<dd>` for
`engineer:` on this track credits 3 artists — Andres Bermudez (rendered
with a name variation, "Andres Bermudezat", plus an
"(other vocals [Sam Moore vocal])" annotation), Ron Aniello, and Rob
Lebret:

```html
<dt>engineer:</dt>
<dd><span class="artistlink"></span><span class="name-variation"><a href="/artist/…">Andres Bermudezat</a></span> <!-- -->(other vocals [Sam Moore vocal])<!-- -->, <span class="artistlink"></span><a href="/artist/…">Ron Aniello</a> and <span class="artistlink"></span><a href="/artist/…">Rob Lebret</a></dd>
```

`_findCreditDts` matched the `<dt>` correctly (1 match, as expected — the
matching logic only reads `<dt>` text, unaffected). The bug was entirely
inside `_buildCreditListTd`'s segmentation (added in WIP.20): each
segment's artist anchor was looked up via `seg.find(n => … n.tagName ===
'A' …)`, i.e. a DIRECT-CHILD-ONLY check. Andres Bermudez's segment has no
direct-child `<a>` — its only direct-child element is the wrapping
`<span class="name-variation">`, with the actual `<a>` one level deeper —
so `_artistA` came back `null` and the whole segment was skipped via
`if (!_artistA) return;`. Verified via jsdom against the real markup:
before the fix, only 2 of the 3 credited engineers rendered (Ron Aniello,
Rob Lebret), with Andres Bermudez missing entirely and no indication
anything was dropped. This is the exact same class of bug as WIP.15's
`_recordedAtDdAnchor` fix (`:scope > a[href^=…]` → `a[href^=…]`) for
"Recorded at place" — name-variation wrapping is a recurring MusicBrainz
markup shape that any anchor-lookup in this area needs to anticipate.

**Fix**: new `_findCreditSegmentArtistAnchor`/
`_findCreditSegmentInstrumentAnchors` replace the inline direct-child
`seg.find`/`seg.filter` checks — for each segment node, check the node
itself first, then `n.querySelector('a[href^="/artist/"]')` (or
`querySelectorAll` for instruments) to catch anchors nested one level
deeper. Re-verified with the same jsdom test: all 3 artists now render,
Andres Bermudez included, with no instrument/task annotation lost from the
other two either (regression-tested against WIP.20's own instrument test
cases — unaffected, still passing).

**Feature 2 — "Miscellaneous support" column**: requested together with
bug 1's fix. `<dt>miscellaneous support:</dt>` credits an artist together
with a "task" annotation — plain parenthetical text, NOT a link (unlike
the instrument annotation the 4 existing credit columns already handle):

```html
<dt>miscellaneous support:</dt>
<dd><span class="artistlink"></span><a href="/artist/…">Sandy Park</a> <!-- -->(task: string contractor)</dd>
```

Added as a 5th entry in `CREDIT_ROLES` (`roleWords: ['miscellaneous',
'support']`, `attributeVocab: []` — no attribute-word prefix is
recognized for this role by the spec, so it gets no attribute columns;
verified `_findCreditDts`/the header-insertion loop both no-op cleanly
over an empty `attributeVocab`, needed no code changes there). New
`_findCreditSegmentTaskAnnotation` scans a segment's own text nodes for a
`(task: …)` pattern and returns its inner text (`"task: string
contractor"`); `_buildCreditListTd` tries the instrument-anchor lookup
first, falling back to the task-text lookup only when no instrument anchor
was found (the two are mutually exclusive in every real example seen so
far — no `<dd>` has ever needed both). Result: "Sandy Park (task: string
contractor)" as one list item, verified via jsdom against the real `<dd>`
markup above. Added to `collapsableColumns` for `release-tracks` alongside
the other 4 credit-role columns; no new setting — reuses
`sa_enable_release_tracks_credit_role_columns`.

## 2026-08-08 — credit columns: generalize per-artist annotation to any parenthetical text (WIP.22)

**Source**: user reported WIP.21's fix (name-variation-wrapped artist
dropped entirely) as "still not fixed", pointing at
`debug/soul-days-missing.html` (the rendered `<tr>` for the "Soul Days"
track on the same release as `debug/missing-engineer.html`) and
`debug/soul-days.html` (that row's raw `<td class="title">` source).

**Investigation**: extracted the real `engineer:` `<dt>`/`<dd>` from
`debug/soul-days.html` (identical 3-artist content to
`debug/missing-engineer.html` — same release, same credit) and ran it
through the current (WIP.21) `_findCreditDts`/`_buildCreditListTd` via
jsdom, then cross-checked against `debug/soul-days-missing.html`'s actual
rendered `<td>` for the "Engineer" column. **All 3 artists DO render**
(Andres Bermudezat, Ron Aniello, Rob Lebret) — WIP.21's fix is confirmed
working, not regressed. The actual remaining gap: Andres Bermudez's own
`<li>` renders as a bare artist link with NO annotation — the
"(other vocals [Sam Moore vocal])" note MusicBrainz attaches right after
his anchor is silently dropped, because WIP.21's
`_findCreditSegmentTaskAnnotation` only matched the literal `(task: …)`
wording (built for the "Miscellaneous support" case), and this dt is a
plain `engineer:` credit with a differently-worded free-text note. So "1.)
still not fixed" was accurate, just not about the artist count — about
this specific artist's annotation silently disappearing, the same
class of bug as the instrument-annotation loss WIP.20 fixed, just for a
third annotation shape.

**Fix**: rather than adding a third special-cased regex (which would just
recreate the same gap for the next new wording MusicBrainz happens to use
on some other credit), `_findCreditSegmentTaskAnnotation` is replaced by
`_findCreditSegmentTextAnnotation` — matches ANY `(…)` parenthetical found
across the segment's own text nodes (concatenated in document order, so a
parenthetical split by an intervening `<!-- -->` comment — true of both
the task and other-vocals examples — still matches as one), used as the
fallback whenever no instrument anchor was found in the segment (instrument
still takes priority and is checked first, unchanged from WIP.20/WIP.21).

**Verified via jsdom** against both real examples together in one test:
the `engineer:` `<dd>` (Andres Bermudez + Ron Aniello + Rob Lebret) now
produces `"Andres Bermudezat (other vocals [Sam Moore vocal])"`, `"Ron
Aniello"`, `"Rob Lebret"`; the `miscellaneous support:` `<dd>` (Sandy Park)
still produces `"Sandy Park (task: string contractor)"` unchanged; re-ran
WIP.20's instrument-annotation regression tests (recording-engineer
3-artist/3-instrument case, engineer-and-mixer no-annotation case, merged
multi-`<dt>` case) — all still pass unaffected, confirming the instrument
path still takes priority and the broadened text-fallback doesn't leak
into it.

## 2026-08-08 — credit columns: attribute words inline instead of their own columns (WIP.23)

**Source**: user explicitly reverted the WIP.16 design decision to give
each attribute word its own page-wide-gated column (e.g. "Mixer
(Assistant)"). New request, with `debug/attributes.html` as the driving
example — a real `mixer:`/`assistant mixer:` pair on one track:

```html
<dt>assistant mixer:</dt>
<dd><a href="/artist/…">Paul Hamingson</a></dd>
<dt>mixer:</dt>
<dd><a href="/artist/…">Bob Clearmountain</a></dd>
```

Desired "Mixer" cell: a 2-item collapsible list, `"Paul Hamingson
(assistant)"` / `"Bob Clearmountain"` — the attribute rendered inline next
to the artist it belongs to, not in a sibling column.

**Change 1 — remove attribute columns**: `_creditRoleState`'s
page-wide `attrs: Set` union tracking is gone; the page-wide scan
(`_creditRolesWithRole`, now a plain `Set<roleKey>`) only needs to know
WHICH roles are used anywhere on the release, since there's no longer a
"which attribute words are used anywhere" question to answer. The header-
insertion block no longer loops `role.attributeVocab` to build `<th>`s —
one `<th>` per role only. Row population no longer builds a separate
`<td>` per attribute; `_findCreditDts`'s per-`<dt>` `attributes` array
(unchanged) is now passed straight through to `_buildCreditListTd` as
`{dd, attributes}` entries instead of being reduced to a page-wide merged
Set.

**Change 2 — inline rendering**: new `_buildCreditListItem(seg,
attributes)` builds one artist's `<li>`, appending a single trailing
`" (…)"` combining (comma-separated when both present): the credit's own
attribute words, joined with `"/"` in `attributeVocab` order (e.g.
`"assistant/co"`), then the existing instrument/free-text annotation
(unchanged logic from WIP.20/WIP.22, still instrument-anchor-first). All
artists produced from the same `<dd>` share that `<dt>`'s own attributes —
important for the merge case (`_buildCreditListTd`'s `entries` param):
Paul Hamingson's `<li>` only ever sees `['assistant']` (from the
`assistant mixer:` `<dt>`), never anything from the separately-matched
bare `mixer:` `<dt>` that produced Bob Clearmountain's `<li>`.

**Change 3 — combined example, verified synthetically** (no real `<dd>`
seen yet with both an attribute prefix AND a task/instrument note on the
same credit — hand-built per the user's own worked example): `assistant
co-engineer:` crediting "Karl Egsieker" with a `(task: Second Engineer)`
note produces `"Karl Egsieker (assistant/co, task: Second Engineer)"` —
attributes first, then the task, comma-separated.

**Change 4 — italic task text**: any annotation whose text starts with
`"task:"` (case-insensitive) is now wrapped in `<i>` when appended — the
`_findCreditSegmentTextAnnotation` call site in `_buildCreditListItem`
checks `/^task:/i` on the returned string before deciding whether to wrap
it in a text node or an `<i>` element. Applies uniformly to every credit
column that can carry a task annotation (not just "Miscellaneous
support") — e.g. the same "Karl Egsieker" example italicizes just the
"task: Second Engineer" portion, not the "assistant/co" attribute prefix
before it.

**Verified via jsdom**, three cases in one test file against
`debug/attributes.html`'s real markup plus the synthetic combined example:
`"Mixer"` → `["Paul Hamingson (assistant)", "Bob Clearmountain"]`;
`"Engineer"` → `["Karl Egsieker (assistant/co, task: Second Engineer)"]`
with `<i>task: Second Engineer</i>` confirmed in the built `<li>`'s
`innerHTML`; `"Miscellaneous support"` → `["Sandy Park (task: string
contractor)"]`, task text still italicized, unchanged output from before
this refactor. Re-ran the WIP.20 (instrument, 3-artist recording-engineer
case) and WIP.21 (name-variation-wrapped artist) regression tests — both
still produce identical `<li>` text content, confirming the attribute/
annotation-combination change didn't disturb either path.

## 2026-08-08 — credit columns: one `<dt>` crediting multiple roles at once (WIP.24)

**Source**: `debug/Nightshift.html` — user reported "Engineer" and
"Mixer" both rendering empty for a track whose ARs clearly credit
someone in both roles:

```html
<dt>engineer and mixer:</dt>
<dd><a href="/artist/…">Ron Aniello</a> and <a href="/artist/…">Rob Lebret</a></dd>
```

**Root cause**: `_findCreditDts` matched the WHOLE `<dt>` body against one
role's `roleWords` at a time. For `"engineer and mixer:"` → words
`['engineer','and','mixer']`: role `engineer` (`roleWords: ['engineer']`)
needs the TRAILING word to be `"engineer"` — it's `"mixer"` — rejected.
Role `mixer` (`roleWords: ['mixer']`) needs every word before the trailing
`"mixer"` to be a recognized attribute — `"engineer"` and `"and"` aren't —
rejected too. So a `<dt>` combining two roles with "and" matched NEITHER,
even though this same shape (`"engineer and mixer:"`) had already turned
up multiple times in earlier debug snapshots this session (`debug/
buggy-list-title.html`, `debug/soul-days.html`) without anyone noticing
both columns were silently empty for those tracks too — this bug predates
WIP.16 and was never actually exercised by a targeted test until now.

**Fix**: `_findCreditDts` now splits the `<dt>`'s body (everything before
the trailing `:`) into ROLE COMPONENTS on `/\s*,\s*|\s+and\s+/i` — the
same separator convention MusicBrainz already uses to join multiple
ARTISTS in one `<dd>`, now recognized as also joining multiple ROLES in
one `<dt>`. `"engineer and mixer"` → `["engineer", "mixer"]`, each checked
independently against `roleWords`/`attributeVocab` exactly as before (the
per-component strictness — e.g. `"recording engineer"` still never
matching bare `engineer` — is unchanged, just scoped to one component
instead of the whole `<dt>`). A `<dt>` with no `,`/`and` splits into
exactly one component, so every existing single-role test case (`mixer:`,
`assistant mixer:`, `recording engineer:`, …) is provably unaffected — no
component boundary is introduced where there wasn't already one word
sequence to check. Only the first matching component counts per `<dt>`
(`break` after a match) — a `<dt>` combining the same role twice would be
a MusicBrainz data error, not something to double-count.

**Verified via jsdom** against the real Nightshift `<dt>engineer and
mixer:</dt>`/`<dt>producer:</dt>` pair, plus two synthetic edge cases
(no real example of either exists yet): `"recording engineer and
producer:"` (compound role component + simple role component — confirms
"Recording engineer" gets it, bare "Engineer" correctly does NOT) and
`"assistant engineer and co-producer:"` (attribute-prefixed components on
both sides of "and" — confirms each component keeps its OWN attribute
word: "Engineer" cell shows `"Y Person (assistant)"`, "Producer" cell
shows `"Y Person (co)"`, never mixing the two). Re-ran every prior credit-
column regression test (WIP.16/WIP.20/WIP.21/WIP.22/WIP.23) — all
unchanged, confirming single-role `<dt>`s are unaffected by the
component-splitting change.

## 2026-08-08 — "Recorded at place": drop redundant placelink glyph per row (WIP.25)

**Source**: `debug/place-icon.html` — a rendered "Recorded at place" cell,
captured post-fix (WIP.17/WIP.24), showing `<span class="placelink">
</span>` as the very first child of each `<li>`, right before the place
anchor.

**Root cause**: `_buildRecordedAtPlaceTd`'s per-place segmentation
(WIP.17) uses each place's own `<span class="placelink"></span>` marker
purely to detect where a new place's content starts (mirrors
`_findRecordedAtDt`'s own glyph-presence check). The segment-building loop
pushed the marker node into the SAME segment it was just used to start:

```js
_nodes.forEach(n => {
    const _isPlaceMarker = …;
    if (_isPlaceMarker || _segments.length === 0) _segments.push([]);
    _segments[_segments.length - 1].push(n);   // marker included here too
});
```

so the marker rode along into the final `<li>` as ordinary content. This
is purely a decorative CSS `::before` glyph hook on the live MusicBrainz
page (the `<span>` itself is always empty), and the same glyph is already
shown once in the "Recorded at place" `<th>` — repeating it on every row
is redundant.

**Fix**: the marker is now dropped as soon as it's used to start a new
segment — an early `return` skips pushing it into `_segments[...]` when
`_isPlaceMarker` is true, while still triggering the new-segment push
beforehand. The tail-trimming logic (drops the "and"/"," separator text
before the next marker) is untouched, since it only ever inspects the
LAST node of a segment.

**Verified via jsdom**, reusing the existing WIP.17 test harness
(`test_multiplace.js`, real markup from `debug/multiple-places.html`/
`debug/multiple-places-2.html`, plus the single-place and
name-variation-wrapped regression cases) against the current function
source: every case's `<li>` count and text content is byte-identical to
before this fix, and `td.innerHTML` for every case now starts directly
with the place's own anchor/`span.name-variation` — no leading
`<span class="placelink">` anywhere. Confirms the fix is scoped purely to
dropping the marker, with zero effect on segmentation, area chains, flags,
comments, or instrument attributions.

## 2026-08-08 — "Phonographic copyright"/"Produced for" columns, corrected header glyph, multi-`<dl>` bug (WIP.26 rewritten into WIP.27)

**Source**: `debug/copyright.html` (the original "Phonographic copyright"/
"Produced for" example), then two bugs reported against that same
not-yet-shipped work: `debug/greetings-original.html`/
`debug/greetings-rendered.html` (a real page + its rendered output for
https://musicbrainz.org/release/… "Greetings from Asbury Park, N.J."-era
tracks).

### Design (unchanged from the original WIP.26 attempt)

"Phonographic copyright (℗) by:" doesn't fit `CREDIT_ROLES` (single marker
class per role) — it's a fixed, unvarying dt phrase with no attribute-word
prefix, and a SINGLE `<dd>` can mix marker kinds (`span.artistlink`/
`span.labellink`) across its own list items, landing in two separately
named columns: "Phonographic copyright (℗) by artist" / "…by label".
`_buildPhonographicCopyrightTds` segments each `<dd>` structurally on
EITHER marker class (tagging each segment's kind), drops the marker
itself (per WIP.25), trims the trailing "and"/"," separator, then routes
each segment's remaining content — comment span, `(in YYYY)` year
attribution, everything — into one of two separate `<ul>`s by its tagged
kind. Each column is independently gated — a release with only label
credits gets no "…by artist" column at all.

### Bug 1 (fixed): "by label" never appeared at all

`debug/greetings-rendered.html`'s "Engineer"/"Mixer" columns rendered
fine, but "Phonographic copyright (℗) by label" was missing entirely —
even though `debug/greetings-original.html` clearly has a real label
credit for it. Investigation found the raw page has TWO SIBLING
`<dl class="ars">` blocks inside the SAME bare `div.ars` for one track:

```html
<div class="ars">
  <dl class="ars">…other credits…<dt>phonographic copyright (℗) by:</dt><dd><span class="artistlink"></span>…Bruce Springsteen…</dd></dl>
  <dl class="ars"><dt>phonographic copyright (℗) by:</dt><dd><span class="labellink"></span>…CBS, Inc.…, …Sony…, and …CBS Dischi…</dd></dl>
</div>
```

The original `_findPhonographicCopyrightDt` used `.find()` — first match
only, mirroring `_findRecOfDt`'s convention, on the (wrong) assumption
that a track has at most one such `<dt>`. Since `:scope > dl.ars > dt`
matches dt's from EVERY sibling `<dl>`, `.find()` returned the artist
`<dt>` (textually first) and silently dropped the label `<dt>` entirely —
in both the page-wide "does this column exist" gate and the per-row
builder, so "…by label" never had a chance to appear anywhere on the
release, not just this row.

**Fix**: renamed to `_findPhonographicCopyrightDts` (plural), returning
EVERY matching `<dt>` via `.filter()` instead of `.find()`.
`_phonographicCopyrightHasKind`/`_buildPhonographicCopyrightTds` both
updated to accept and merge across an array of `<dt>`s — mirrors
`_findCreditDts`'s own "collect every match" convention (that function
was never `.find()`-based, so it was already immune to this class of
bug — a useful confirmation that the "collect everything, merge" pattern
established for `CREDIT_ROLES` back in WIP.16 was the right call).

### Bug 2 (fixed): header glyph silently discarded

The original WIP.26 attempt appended a real `<span class="artistlink">`/
`<span class="labellink">` child directly onto each `<th>` at creation
time (`_buildColumnHeaderWithGlyph`). `debug/greetings-rendered.html`
showed zero occurrences of either class inside `<thead>` — the glyph
never rendered anywhere. Root cause: `makeTableSortableUnified()` (called
on every table to wire up the sort-icon/unique-value-count UI) reads each
`<th>`'s plain `textContent` into a local `colName`, then unconditionally
does `th.innerHTML = ''` and rebuilds the header from that string plus its
own icon elements — discarding ANY child element that was there before,
regardless of what it was.

Critically, **this exact problem was already solved in an earlier
session**, for "Recording of"'s `worklink` glyph and "Recorded at
event"/"Recorded at place"'s `eventlink`/`placelink` glyphs — via
`_initColHeaderGlyph(columnName, glyphClass)`, a post-render injector
called from `renderGroupedTable()`'s tail (after `makeTableSortableUnified()`
has already rebuilt every header), which finds the column's `.mb-col-hdr-flex`
and inserts the glyph right after its leading text node — including
specific `height`/`marginLeft`/`marginRight` inline-style fixes derived
from real Computed-panel debugging of a flex-blockification visual bug
(see that function's own JSDoc, `debug/still-missing-glyph.html`,
`debug/still-no-blank.html`). The original WIP.26 attempt reinvented a
different (and broken) mechanism — a `th.dataset.mbGlyphClass` survival
hack through the innerHTML wipe — without knowing this established,
already-battle-tested pattern existed.

**Fix**: reverted the dataset-hack entirely (removed
`_buildColumnHeaderWithGlyph`, reverted `makeTableSortableUnified()` back
to its original form, reverted all "Mixer"/"Phonographic copyright…"
header creation back to plain `document.createElement('th')` +
`textContent`). Added `_initColHeaderGlyph()` calls for every
`CREDIT_ROLES` column (`'artistlink'`), both "Phonographic copyright"
columns, and "Produced for" (`'labellink'`) to the same call site in
`renderGroupedTable()`'s tail as the pre-existing three calls.

### New feature: "Produced for"

Requested alongside the two bug fixes. `<dt>produced for:</dt>` (see
debug/copyright.html's "Laurel Canyon Ltd." example), label-only,
optional `co`/`executive` attribute-word prefixes. Unlike phonographic
copyright, this fits `_findCreditDts` directly —
`_findCreditDts(titleTd, ['produced', 'for'], ['co', 'executive'])` needed
NO changes, since its multi-`<dl>`, multi-`<dt>`-merge, and strict-
attribute-prefix handling already cover this shape exactly (further
confirming bug 1's diagnosis — `_findCreditDts` was never vulnerable to
the multi-`<dl>` bug). New `_buildLabelCreditListTd`/
`_findLabelCreditSegmentAnchor` — the `/label/`-href, `span.labellink`
counterpart of `_buildCreditListTd`/`_findCreditSegmentArtistAnchor` —
clone the WHOLE remaining segment verbatim (same "don't parse sub-pieces"
approach as `_buildPhonographicCopyrightTds`, preserving a label's own
`<span class="comment">` note), appending any attribute words at the very
end (`" (co/executive)"`) since this function never inserts into
already-cloned content.

### Verification

**Verified via jsdom**, one combined test exercising all three fixes/
features together: a synthetic 2-sibling-`<dl>` fixture reconstructing the
real `debug/greetings-original.html` shape (artist dl + label dl, same dt
phrase) → `_findPhonographicCopyrightDts` returns 2 dt's,
`hasArtist`/`hasLabel` both `true`, artist `<td>` has the 1 Springsteen
item, label `<td>` has all 3 real labels (comment spans, year
attributions intact) — confirming bug 1 is fixed. A third sibling `<dl>`
with `produced for:` + a synthetic `executive produced for:` →
`_findCreditDts` returns 2 matches, `_buildLabelCreditListTd` produces
"Laurel Canyon Ltd. (…comment…)" and "Some Exec Label (executive)" —
confirming the new feature and its attribute-word placement. Re-ran every
prior credit-column regression test (WIP.16/20/21/22/23/24) — all
unchanged. Bug 2's fix (post-render glyph injection) could not be
exercised via jsdom (no live render pipeline in this environment) —
verified by code inspection against the already-proven `_initColHeaderGlyph`
mechanism instead; flagged as such.

## 2026-08-08 — credit columns: comment-span disambiguation dropped; column renames (WIP.28)

**Source**: `debug/artist-name-variation-and-primary-alias.html` — a real
`<dd>` for an `engineer:` credit on
https://musicbrainz.org/release/3ce46b79-5e8c-470a-bcdc-45f301d09f60:

```html
<dd><span class="artistlink"></span><span class="name-variation"><a href="/artist/…" title="לואי להב – Louis Lahav"><bdi>Louis Lehav</bdi></a></span> <span class="comment">(<bdi><i title="Primary alias">Louis Lahav</i></bdi>)</span></dd>
```

The credit uses a name-variation ("Louis Lehav", a different Hebrew/English
spelling), and MusicBrainz appends a `<span class="comment">` note
pointing at the artist's primary alias ("Louis Lahav") right after it —
only "Louis Lehav" was rendered in the "Engineer" column, with the
primary-alias note completely gone.

**Root cause**: `_buildCreditListItem`'s only "extra annotation" lookup
was `_findCreditSegmentTextAnnotation`, which scans a segment's own TEXT
nodes for a `(…)` pattern. Here the parenthesis characters are inside the
`<span class="comment">` element itself (`(<bdi>…</bdi>)`), not a sibling
text node — invisible to that lookup entirely, so the whole note was
silently dropped rather than just mis-formatted.

**Investigation found a second real occurrence of the same element for a
different purpose**: earlier in this session's `debug/greetings-original.html`
dump, `<a>Clarence Clemons</a> <span class="comment">(<bdi>American
saxophonist</bdi>)</span>` — a plain artist disambiguation with NO
name-variation wrapping at all. So `span.comment` is a general "note
attached to an artist mention" pattern, not exclusively tied to
name-variation credits — the fix needed to cover both.

**Fix**: new `_findCreditSegmentCommentSpan(seg)` — same nested-search
style as `_findCreditSegmentArtistAnchor` (checks each segment node, then
its descendants, so it works whether the comment sits directly in the
segment or is itself nested somewhere). `_buildCreditListItem` clones it
verbatim and appends it right after the artist anchor, BEFORE the
existing attribute/instrument/task parenthetical group — kept as two
independent additions rather than merged into one, since the comment
already carries its own self-contained `"("`/`")"` characters and inner
markup (e.g. the `<i>` italics on "Louis Lahav") as real content, not
something to re-derive as plain text.

**Verified via jsdom** against the real `debug/artist-name-variation-and-primary-alias.html`
markup: "Engineer" cell now renders `"Louis Lehav (Louis Lahav)"`, with
the cloned `<span class="comment">` (including its `<i title="Primary
alias">` italics) confirmed present in the built `<li>`'s `innerHTML`.
Re-ran every prior credit-column regression test (WIP.16/20/21/22/23/24) —
all unchanged, confirming the new comment-span handling is purely
additive and doesn't interfere with the attribute/instrument/task
parenthetical logic.

### Column renames (same session, unrelated to the bug above)

User asked to rename "Recording of" → "Recording of work" and "Produced
for" → "Produced for label" (glyphs unchanged — `_initColHeaderGlyph`
calls updated to the new strings, since that lookup matches on exact
header text). Updated every functional string-literal site: header
creation/already-present checks (`_recOfTh`/`_producedForTh`), the
`collapsableColumns` entry for "Produced for label", the
`_initColHeaderGlyph()` call site, and the settings description text that
quotes these as column names. Left prose/JSDoc mentions of the general
"recording of"/"produced for" MusicBrainz relationship CONCEPT as-is
(not literal header-string matches) to avoid unnecessary churn.

### Follow-up (same WIP.28): name-variation credit lost its underline

User attached two screenshots comparing the native MusicBrainz page
(engineer "Louis Lehav" rendered underlined) against the "Engineer"
column's rendered output (same text, no underline). Root cause: the
comment-span fix above correctly resolved the artist anchor via
`_findCreditSegmentArtistAnchor`, but `_buildCreditListItem` then cloned
ONLY that bare `<a>` — `li.appendChild(_artistA.cloneNode(true))` —
discarding the wrapping `<span class="name-variation">` entirely. That
span's own CSS class is what MusicBrainz uses to underline a
name-variation credit (visually flagging "this is an alias, not the
artist's primary name"); the text and link both survived, but the visual
cue didn't.

**Fix**: at the clone site, check whether the artist anchor's immediate
parent is `<span class="name-variation">`; if so, clone that span instead
of the bare anchor (`_artistA.parentElement.tagName === 'SPAN' &&
…classList.contains('name-variation') ? _artistA.parentElement :
_artistA`). Applied in two places: `_buildCreditListItem` (all 5 credit-
role columns) and the "Recorded at event" cell builder (`_recordedAtDdAnchor`'s
caller), which had the exact same "clone the bare anchor only" pattern —
found via code inspection while fixing the reported bug, not a separate
user report, but the same root cause so fixed alongside it. Every OTHER
name-variation-adjacent builder in this file (`_buildRecordedAtPlaceTd`,
`_buildPhonographicCopyrightTds`, `_buildLabelCreditListTd`) already
clones the WHOLE segment rather than extracting just the anchor, so the
wrapper (and its styling) was already preserved there — this bug was
specific to the two selective-clone builders.

**Verified via jsdom**: re-ran the Louis Lehav/primary-alias test — the
built `<li>`'s `innerHTML` now starts with `<span class="name-variation">
<a …>Louis Lehav</a></span>` (previously just the bare `<a>`), comment
span still intact after it. Re-ran every prior credit-column regression
test — all unchanged, confirming non-name-variation credits (the common
case) still clone the bare anchor exactly as before.

## 2026-08-08 — AR column header background; flag icons in "Recorded at place" dropdown (WIP.29)

**Request 1 — header background**: user asked for the columns
`applyExtractTrackTitleData` builds from the Title cell's `dl.ars` data
("ARs"/"AcoustIDs"/"ISRCs", "Recording of work"/"Recorded at" family, the
credit-role/copyright columns) to get the same header background color
that generic synthetic columns already get on other page types. Found the
existing mechanism in `cleanupHeaders()` (~line 31464): every `<th>` built
from `activeColumnExtractors`/`activeSyntheticColumnExtractors` gets class
`mb-extracted-column` (or `mb-derived-extracted-column` for second-pass
derived columns) plus an inline `backgroundColor` read from
`sa_ui_thead_th_extracted_bg` (default `#b8c8b8`, a greenish grey) /
`sa_ui_thead_th_derived_bg`. `applyExtractTrackTitleData`'s own `<th>`s
never got this treatment — they're built by hand (in-place DOM surgery),
not through that pipeline, so they'd always rendered visually identical
to the page's own native columns.

**Fix**: a single consolidated pass, right before the master "already
processed" gate (where every one of this function's `<th>` local
variables — `_arsTh`, `_acoustIdTh`, `_isrcTh`, `_recOfTh`,
`_recOfDateTh`, `_newAttrThs`, `_recordedAtEventTh`,
`_recordedAtPlaceAdditionalTh`, `_recordedAtPlaceTh`, `_creditRoleThs`,
`_copyrightByArtistTh`, `_copyrightByLabelTh`, `_producedForTh` — is
already in scope and finalized), stamps every non-null one with
`mb-extracted-column` + the SAME `sa_ui_thead_th_extracted_bg` setting
(reused, not a new setting). "Video"/"Disambiguation"/"Recording artist"
were deliberately left unstamped — they come from the Title/Artist cells
directly, not from `dl.ars`, so they're a different kind of "extracted"
column than what was asked about. Runs once per table per render; since
`<th>` elements persist across re-renders (only their `.innerHTML` is
rebuilt by `makeTableSortableUnified()`, not the element itself) and
`cloneNode(true)` (used when `renderGroupedTable()` clones the shared
`<thead>` template to other mediums) preserves classes/inline styles,
stamping once on first creation is sufficient.

**Request 2 — flag icons in the "Recorded at place" dropdown**: a
SEPARATE, already-existing feature (`sa_enable_dropdown_flag_icons`,
default OFF) decorates the 📊 unique-values dropdown with the same
region/country flag icons shown in the table cell, already covering
Country/Area/Locality/Region/Location/Place/Country-Date columns (see
`openUniqDrop()`'s `hasFlagIcons`/`flagIconMap`/`resolveFlagVisual`, a
substantial existing mechanism that bakes a live cell's *resolved* CSS
(via `getComputedStyle`) onto a clone, since the dropdown panel renders
outside `table.tbl`'s own cascade context). The underlying icon-scanning
code (`cell.querySelectorAll('span[class*="flag-"], span.area-icon')`) is
column-name-agnostic — it was ALREADY capable of finding "Recorded at
place"'s flags (identical `<span class="area-icon"><img></span>`/
`<span class="flag flag-XX">` shapes as the already-supported columns).
The only reason it didn't apply was the `hasFlagIcons` gate's column-name
allow-list, which checks for an exact/suffix name match and had no entry
for "Recorded at place".

**Fix**: added `name === 'Recorded at place'` to that allow-list — no new
scan logic needed, purely a name-recognition addition, matching this
same code's own precedent for 'Location'/'Country/Date' (both previously
added the exact same way, per the comments directly above the check).
Confirmed via a small standalone test of just the name-matching logic
that "Recorded at place" now matches while "Recorded at event"/"Mixer"
correctly still don't (they have no flags to show). The dropdown itself
(`getComputedStyle`-dependent) can't be exercised in jsdom — verified by
code-inspection against the already-proven mechanism instead, matching
this session's established "reuse the existing pattern" lesson from the
`_initColHeaderGlyph()` episode two sessions ago.

### Follow-up (WIP.30): the header-background fix from WIP.29 didn't actually work

User reported (with a screenshot) that "Recording of work"/"Recording
date"/"Recorded at event"/"Recorded at place" headers were still plain
white, not the greenish "extracted column" background WIP.29 claimed to
add.

**Root cause — the SAME mistake as the `_initColHeaderGlyph()` episode,
not recognized as such at the time**: WIP.29's fix stamped
`mb-extracted-column` + inline `backgroundColor` directly onto the `<th>`
elements created inside `applyExtractTrackTitleData()`. That function runs
during PRE-PROCESSING, against the NATIVE MusicBrainz page's own
`<table>` — a completely different, transient set of DOM nodes from the
`table.tbl` this script actually renders. Only the TEXT of those native
headers gets scraped into the header-name list used to build the FINAL
table; the DOM nodes themselves (and anything styled on them) are
discarded and never appear anywhere in the rendered output. So the
WIP.29 stamp was a pure no-op — it styled elements nobody ever sees.

This is functionally identical to what `_initColHeaderGlyph()` (see the
WIP.27 entry above) was already built to solve, and its own JSDoc even
says so directly ("`makeTableSortableUnified()` rebuilds every `<th>`
from a plain `colName` STRING... so anything appended to the `<th>`
before that point is destroyed") — but the connection wasn't made this
time until the user reported the bug again. The memory saved after the
WIP.27 episode (`feedback_search_before_new_header_mechanism.md`)
specifically warns about NOT reinventing a new mechanism for `<th>`
content problems in this file — this fix violated its own stated lesson
by treating "add a background color" as a different problem from "add a
glyph icon" when it's actually the exact same one: *any* styling/content
added to a release-tracks `<th>` before the final `table.tbl` exists is
lost.

**Fix**: new `_stampArColumnHeaderBg(columnName)`, an exact structural
copy of `_initColHeaderGlyph()`'s approach — post-render, `document.
querySelectorAll('table.tbl')` + `_cleanColHeaderText()` name lookup —
called from the same `renderGroupedTable()` tail location, right after
the existing glyph re-injection calls, with the full AR column name list
(`ARs`/`AcoustIDs`/`ISRCs`, `Recording of work`/`Recording date`/
`Recorded at event`/`Additional`/`Recorded at place`, the 8
`REC_OF_ATTRIBUTES` labels capitalized, every `CREDIT_ROLES` label, both
"Phonographic copyright" columns, `Produced for label`). The dead,
ineffective stamping pass inside `applyExtractTrackTitleData()` was
removed entirely and replaced with a comment pointing at the real fix, to
avoid a future reader assuming it's live code that does something.

**Verified via jsdom**: a minimal fixture reconstructing
`makeTableSortableUnified()`'s post-rebuild `<th><div class="mb-col-hdr-
flex">ColumnName <span class="sort-icon-btn">…</span></div></th>` shape
for "Recording of work"/"Mixer"/"Recorded at place" → after calling
`_stampArColumnHeaderBg`, every one has `class="mb-extracted-column"` and
`style.backgroundColor` resolved to the default `#b8c8b8`
(`rgb(184, 200, 184)`) — confirms both the by-name lookup and the
stamping itself work correctly against the actual rendered-table shape,
unlike WIP.29's untested (and, it turned out, non-functional) approach.
Re-ran every prior credit-column regression test — all unchanged.

## 2026-08-09 — two new "Cell structure" synthetic dropdown entries (WIP.31)

**Source**: three debug fragments plus two screenshots.
`debug/title.html`, from https://musicbrainz.org/release/3ce46b79-…:

```html
<a href="/recording/…" title="track name: Rave On!
≠rec. name: Rave On" jesus2099userjs81127recname="Rave On!" class="jesus2099userjs81127recording">Rave On!</a>
```

A THIRD-PARTY userscript (jesus2099's, judging by the class-name prefix —
not part of this project) injects this tooltip on the Title cell's anchor
when the displayed track title differs from the underlying recording's
own name; presumably uses "=" instead when they match, though no real
example of that case was captured. `debug/nassua.html`/
`debug/variant-engineer-2.html` — real `<span class="name-variation">`
wrapped credits (place: "Nassau Coliseum" vs. primary "Nassau Veterans
Memorial Coliseum"; artist: "Andres Bermudezat" vs. primary "Andres
Bermudez"), rendered with a dotted underline on the live page per the
attached screenshots.

**Request**: add BOTH as new synthetic entries in the existing "Cell
structure" block of the unique-values dropdown (`openUniqDrop()`) — (1)
for the "Title" column, a "title ≠ recording name" entry; (2) for ANY
column, a "has name variation" entry — so a user can filter straight to
just those rows without knowing/typing the exact underlying markup.

**Design**: this block already has an established extension pattern from
the existing empty/single/collapsed/expanded/any structural entries
(`emptyCellCount` et al. → `makeSynItem(mode, label, count)` →
`applyMultiRowStateFilter(mode, …)` → `input.dataset.mbMultirowMode` →
`testRowMatch()`'s `f.isMultiRowFilter` branch, matched by `f.multiRowMode`
string). Both new entries plug into that SAME pipeline as two more mode
strings (`'title-mismatch'`, `'name-variation'`), not a parallel
mechanism:

- New `_titleHasRecNameMismatch(cell)` — tests for the literal "≠"
  character in any `a[title]` inside the cell, rather than the exact
  tooltip wording or the third-party script's own (versioned) class
  names — the inequality glyph IS the signal being flagged, so this stays
  correct even if that other script's internal naming changes.
- "Name variation" detection is a one-line `cell.querySelector('span.
  name-variation')` — no new helper needed, reuses the exact class
  MusicBrainz itself renders for every alias credit across this whole
  session's work (`_findCreditSegmentArtistAnchor`'s nested-anchor search,
  `_buildRecordedAtPlaceTd`'s whole-segment clone, etc. all already handle
  this class; this is just the FIRST place that *counts and filters by
  its presence* rather than preserving its content).
- Both counters (`titleMismatchCount`, `nameVariationCount`) are computed
  in the SAME per-row scan that already produces `emptyCellCount` et al.
  — `isTitleCol` (header-name lookup, mirrors `isCaaOrEaaCol`'s existing
  pattern) gates the title-mismatch scan to the Title column only; the
  name-variation scan runs for every column unconditionally (cheap: a
  single `querySelector` per cell, same cost class as the existing
  `_classifyCollapseCell` call already happening there).

**A real design wrinkle**: the ORIGINAL "Cell structure" section was only
ever shown for columns declared in `activeDefinition.features.
collapsableColumns` (`isCollapsableCol`) OR, for any other column, a
BARE headerless "○ empty cells" entry with no section wrapper at all. But
"Title" is NOT a collapsable column (it's plain text/single-value), so
neither existing branch would ever show a "title ≠ recording name" entry.
Rewrote the else-if branch to conditionally show the header only when
MORE THAN ONE synthetic entry will actually render (preserving the
original headerless look for the common "just empty cells" case exactly,
regression-free), and added both new entries to BOTH branches (the
already-collapsable branch, e.g. "Engineer"/"Recorded at place" — real
examples where "has name variation" now sits alongside the existing
collapse-state entries — and the newly-generalized non-collapsable
branch, e.g. "Title").

**Verified via jsdom**: `_titleHasRecNameMismatch` against the real
`debug/title.html` mismatch case → `true`; a synthetic non-mismatch
("=rec. name:") case → `false` (confirms the check keys on the glyph, not
just any "rec. name:" substring). Name-variation detection against the
real `debug/nassua.html` fragment → `true`; a plain no-alias artist
anchor → `false`. `testRowMatch()`'s new `'title-mismatch'`/
`'name-variation'` branches and the `applyMultiRowStateFilter()` label
mapping were code-reviewed against the existing modes' exact shape (no
live-DOM rendering test possible for the full dropdown-open/click/filter
interaction chain in this environment) — structurally identical to the
five already-working modes, reusing the same `dataset.mbMultirowMode`
plumbing end to end.

## 2026-08-09 — per-attribute / per-task synthetic dropdown entries (WIP.32)

**Source**: `debug/unique-attribute-task.html`, a rendered "Engineer"
cell from https://musicbrainz.org/release/6d19588c-0305-4fb0-b687-d4b75a75c3fd:

```html
<ul>
  <li><a …>Billy Bowers</a>&nbsp;<span class="comment"><bdi>(US engineer)</bdi></span> (additional)</li>
  <li><a …>Karl Egsieker</a> (<i>task: Second Engineer</i>)</li>
</ul>
```

Requested: one synthetic filter entry per distinct attribute word
("additional", "assistant", "co", "executive") and one per distinct task
string ("task: Second Engineer") actually present anywhere in a
credit-role column, in the SAME "Cell structure" block WIP.31 already
extended twice. Unlike WIP.31's two additions (fixed booleans per cell),
this is a DYNAMIC list — the actual set of values varies release to
release.

**Root problem before any change**: the attribute word(s) and the task
text both render as bare content inside a `<li>`'s trailing parenthetical
(`_buildCreditListItem`), indistinguishable from each other or from OTHER
free text sharing that same parenthetical (a non-task annotation is ALSO
bare text) by re-parsing the rendered DOM after the fact.

**Fix, in order**:

1. **Mark at build time**: `_buildCreditListItem` now wraps the
   attribute-word text (`attributes.join('/')`) in `<span class=
   "mb-credit-attr">` instead of a bare text node, and stamps the
   existing task `<i>` with class `mb-credit-task` (it was already an
   `<i>`, just needed an unambiguous selector). `_buildLabelCreditListTd`
   ("Produced for label", which can have `co`/`executive` attributes but
   never a task) gets the same `mb-credit-attr` treatment. Both changes
   are purely additive — same visible text, no effect on
   `_findCellListItems`/`_classifyCollapseCell`/`getCleanColumnText`
   (confirmed: `getCleanColumnText` must NOT strip these — real visible
   text, unlike the hidden sentinels `_CLEAN_STRIP_SEL` covers).
2. **Count distinct values**: `openUniqDrop()`'s existing per-row scan
   (same loop that already produces `emptyCellCount`/
   `titleMismatchCount`/`nameVariationCount`) gained two `Map`s,
   `attrValueCounts`/`taskValueCounts`, built by scanning each row's cell
   for `.mb-credit-attr`/`.mb-credit-task` elements, deduping WITHIN each
   row (a row crediting "additional" on two different people still
   counts once — matches how every other count in this dropdown counts
   rows, not occurrences) before incrementing across rows. No column-name
   gating (unlike `isCaaOrEaaCol`) — purely content-based, like WIP.31's
   `nameVariationCount`.
3. **Render**: new `makeValueSynItem(kind, value, count)` sibling to
   `makeSynItem`, for the dynamic (not fixed-5) entry family — click
   handler calls `applyMultiRowStateFilter(\`${kind}:${value}\`, …)`, a
   colon-prefixed COMPOUND mode string (`"attr:additional"`,
   `"task:task: Second Engineer"`) that stays on the exact same
   `dataset.mbMultirowMode` plumbing as every other entry here, rather
   than a second filter mechanism — this session already has a saved
   memory (`feedback_search_before_new_header_mechanism`) about the cost
   of inventing a parallel mechanism instead of reusing an established
   one, and this design follows that lesson directly. Both "Cell
   structure" header-display gates (the `isCollapsableCol` branch and
   WIP.31's generalized non-collapsable branch) were widened to also
   trigger on `attrValueCounts.size > 0 || taskValueCounts.size > 0`.
4. **Wire the match**: `applyMultiRowStateFilter`'s label ternary and
   `testRowMatch()`'s `f.isMultiRowFilter` branch both gained
   `mode.startsWith('attr:')`/`'task:'` arms — `attr:` splits every
   `.mb-credit-attr` span's text on `/` and checks membership (handles a
   merged multi-attribute credit like `"assistant/co"` in one span);
   `task:` checks exact trimmed-text equality against every
   `.mb-credit-task` element.

**Verified via jsdom**: reconstructed the real `debug/unique-attribute-task.html`
row from raw `<dt>additional engineer:</dt>`/`<dt>engineer:</dt>` source
through the real `_findCreditDts`→`_buildCreditListTd` pipeline — built
`<li>` `textContent` matched the captured rendered HTML EXACTLY ("Billy
Bowers (US engineer) (additional)", "Karl Egsieker (task: Second
Engineer)"), confirming the raw-source reconstruction was accurate, with
`<span class="mb-credit-attr">additional</span>` and `<i class=
"mb-credit-task">task: Second Engineer</i>` present as expected. A
separate 4-row synthetic fixture (mixed additional/assistant/co
attributes, one task, one bare credit, one row with the same attribute on
two different people) verified the counting logic produces exactly
`{additional: 2, assistant: 1, co: 1}` / `{"task: Second Engineer": 1}`
(confirming per-row dedup) and that the `attr:`/`task:` match arms select
exactly the expected rows for each value. Re-ran every prior credit-column
regression test (WIP.16/20/21/22/23/24/28/31) — all still pass, `textContent`
unchanged; only `innerHTML` gained the new wrapping span/class, confirming
the change is purely additive.

## 2026-08-09 — highlight the exact matched attr/task value (WIP.33)

**Request**: for the WIP.32 per-attribute/per-task dropdown entries, also
highlight the matched text — same color as any other active column
filter — but ONLY the exact string, not the whole cell/`<li>`.

**Investigation**: found the existing highlight mechanism.
`testRowMatch()` (after computing `finalHit`) loops `colFilters` and calls
`highlightText(row, f.val, …, f.idx, …)` for every NORMAL (non-structural)
filter — which resolves `row.cells[f.idx]`, calls `.normalize()`, and
delegates to `highlightCrossTag(td, regex, 'mb-column-filter-highlight')`,
the shared cross-tag-safe text-wrapping primitive every highlight class in
this file uses (`mb-global-filter-highlight`/`mb-subtable-filter-highlight`
are the same mechanism, different class). The existing code explicitly
SKIPPED highlighting for every `f.isMultiRowFilter` entry (comment: "Multi-
row state filters operate on DOM structure, not on text → skip
highlight") — true for the original 5 structural modes AND WIP.31's
title-mismatch/name-variation (none of them correspond to one exact
string), but no longer true for WIP.32's `attr:`/`task:` compound modes,
which DO name an exact string.

**Fix**: added an `else if` arm alongside the existing "skip" branch,
specifically for `f.multiRowMode.startsWith('attr:')`/`'task:'`, calling
new `_highlightCreditValueMatch(row.cells[f.idx], f.multiRowMode)`. Rather
than calling `highlightCrossTag` on the WHOLE cell (which would highlight
every occurrence of the substring anywhere, including in an unrelated
credit's own different value, or partially matching text elsewhere), it
scopes to each SPECIFIC `.mb-credit-attr`/`.mb-credit-task` sentinel
(added in WIP.32) WHOSE OWN VALUE actually equals the filter target —
important for a merged multi-person credit where different people can
carry different attribute/task values in the same cell. For `attr:`,
since `.mb-credit-attr`'s text can be a `/`-joined multi-word list (e.g.
`"assistant/co"`), the regex uses `\b…\b` word boundaries so only the
matched WORD highlights, not the whole span; for `task:`, the whole
`.mb-credit-task` text is highlighted (a task is never joined with
others).

Reuses the EXACT SAME `mb-column-filter-highlight` class as every normal
column filter (matches the user's "same color" request) and needed no
extra clearing/reset code — `testRowMatch()` already unconditionally
clears every `.mb-column-filter-highlight` span in the row at its own top
before recomputing matches, regardless of which code path created them.

**Verified via jsdom**: a fixture cell with two different credits — one
`.mb-credit-attr` = `"assistant/co"`, another = `"additional"` — confirmed
`_highlightCreditValueMatch(cell, 'attr:co')` wraps ONLY "co" inside
"assistant/co" (`assistant/<span class="mb-column-filter-highlight">co
</span>`), leaving "assistant" and the unrelated "additional" credit
completely untouched; `'attr:additional'` correctly highlights the OTHER
credit instead, leaving "assistant/co" alone. A `.mb-credit-task` fixture
confirmed `'task:task: Second Engineer'` wraps the entire task text.
Re-ran every prior credit-column/dropdown regression test — all still
pass unchanged.

## 2026-08-09 — revert "Recording of work"/"Recorded at place" attribute columns to inline (WIP.34)

**Request**: "Recording of work"'s attribute words (Acappella/Cover/Demo/
Instrumental/Karaoke/Live/Medley/Partial — WIP.13/`REC_OF_ATTRIBUTES`) and
"Recorded at place"'s "additional" attribute (WIP.18/`_recordedAtPlaceHasAdditional`)
each render as their own separate column today (a word-per-column loop
for the former, one standalone "Additional" column for the latter) —
revert BOTH to the SAME inline convention every `CREDIT_ROLES` column
already uses ("Engineer"/"Mixer"/etc., WIP.16/23), specifically so the
per-attribute unique-values dropdown filter (WIP.32) and its match-text
highlight (WIP.33) apply to these two columns "for free" — those features
were built entirely around scanning for `.mb-credit-attr` sentinels with
NO column-name gating, so any column whose cells carry that sentinel
automatically gets them; a separate column never could.

**Change 1 — "Recording of work"**: the row-population block that builds
this `<td>` now appends the SAME `.mb-credit-attr` span
(`attrs.join('/')`, e.g. `"cover/live"`) right after the cloned work
anchor, only when `_parseRecOfAttributes(_recOfDt)` returns non-empty —
e.g. real data (`debug/live-cover-recording.html`, `<dt>live cover
recording of:</dt>`) now renders `"Rave On (cover/live)"` in one cell
instead of a separate blank/"live" "Live" column and blank/"cover"
"Cover" column. The word-per-column header-creation loop (iterating
`REC_OF_ATTRIBUTES`), its page-wide presence scan (`_presentRecOfAttributes`),
and the `_newAttrThs` row-population loop were all removed entirely — no
replacement needed, since the inline append happens as part of building
the ALREADY-EXISTING "Recording of work" `<td>`, not a new mechanism.

**Change 2 — "Recorded at place"**: `_buildRecordedAtPlaceTd` now computes
`_recordedAtPlaceHasAdditional(dt)` ONCE per `<dd>` and, when true,
appends the `.mb-credit-attr` span (`"additional"`) to EVERY place `<li>`
that `<dd>` produces — deliberate design choice, since the "additional"
attribute describes the WHOLE "recorded at:" relationship, not any one
specific place among several (unlike a `CREDIT_ROLES` merge, where each
merged `<dt>`'s attributes apply only to ITS OWN artists). Verified
against a real multi-place `<dd>` (`debug/multiple-places.html`, 2 places)
with a synthetic `additionally` prefix (no real-data example of this
combination exists yet, matching this attribute's existing "unverified
against real markup" caveat from WIP.18) — both places correctly got
`" (additional)"` appended, not just the first. The standalone
"Additional" `<th>`/page-wide gate (`_pageHasRecordedAtPlaceAdditional`)
and its own row-population block were removed.

**Housekeeping**: `_stampArColumnHeaderBg()`'s call-site list (WIP.30) no
longer includes the removed attribute-word/"Additional" column names —
they don't exist anymore, so stamping them would be a harmless but
pointless no-op lookup; removed for clarity. Updated
`applyExtractTrackTitleData`'s and `REC_OF_ATTRIBUTES`'/
`_recordedAtPlaceHasAdditional`'s own JSDoc to describe the new inline
behavior instead of the old column-per-attribute design; updated the
`sa_enable_release_tracks_recording_of_columns` setting description to
match.

**Verified via jsdom**: real `debug/live-cover-recording.html` data →
`_parseRecOfAttributes` returns `['cover', 'live']`, reconstructed
"Recording of work" `<td>` → `<a>Rave On</a> (<span class="mb-credit-attr">
cover/live</span>)`, `textContent` = `"Rave On (cover/live)"`. Real
`debug/multiple-places.html` + synthetic `additionally` prefix →
`_buildRecordedAtPlaceTd` produces 2 `<li>`s, BOTH with
`.mb-credit-attr` = `"additional"` present. Re-ran the full existing
regression suite (every prior credit-column/dropdown test this session,
WIP.16 through WIP.33) — all still pass unchanged, confirming this
change didn't disturb anything downstream of the `.mb-credit-attr`
sentinel (the dropdown counting/highlighting code needed ZERO changes,
exactly as intended).

## 2026-08-09 — ensure inline credits before scraping; remove medium-toolbox (WIP.35)

**Request**: `debug/toolbox.org` (user-authored task notes). Two asks: (1)
before rendering the final page, detect whether a release's per-track
relationship credits are currently rendered INLINE (per-`<tr>` `dl.ars`
blocks, which `applyExtractTrackTitleData()` reads) or consolidated into
one combined block after the tracklist ("at bottom"), and if at bottom,
click the native `#toggle-credits` control and wait for it to switch to
inline before any scraping happens; (2) on the final rendered page, remove
the now-orphaned `<span id="medium-toolbox">` (its buttons re-render inert
once the page has been restructured).

**Detection**: `#toggle-credits`'s own label always names what clicking it
would switch TO, not the current state — `"Display credits at bottom"`
means credits are already inline (button offers to move them away);
`"Display credits inline"` means credits are currently at bottom (button
offers to bring them back). Confirmed via `debug/toolbox.org`'s own two
worked examples (single- and multi-medium `#medium-toolbox` markup).

**Change 1**: new `ensureCreditsInline(def)`, placed beside the existing
`loadAllOverflowMediumTracks()` (same click-native-control-then-
`MutationObserver`-wait shape — the only existing precedent for this kind
of async DOM-wait in the codebase, deliberately reused rather than
inventing a new mechanism). Reads `span#medium-toolbox button#toggle-credits`'s
label; if it already says "at bottom", returns immediately (no click). If
it says "inline", clicks it and awaits a `MutationObserver` on the button
itself (`characterData`/`childList`/`subtree`) that fires once the label
flips away from "inline", then waits a further 500ms idle-settle (for the
accompanying per-track re-render to finish) before resolving; bounded by a
5s hard timeout so a stalled/absent re-render can't hang the fetch
pipeline. Gated by `features.ensureCreditsInline: true`, wired into
`startFetchingProcess()` as the FIRST `release-tracks` pre-processing step
— before `loadOverflowTracks`, so any tracks subsequently loaded via
"Load all tracks…" already come in inline rather than needing a second
toggle — and strictly before `applyNormalizeMediumTracklists()`/
`applyExtractTrackTitleData()`, both of which scan each row's own
`dl.ars`.

**Confirmed live-DOM, not fetched-HTML**: `release-tracks` sets
`non_paginated: true`, which forces `maxPage = 1`; the per-page fetch loop
in `startFetchingProcess()` then takes its `doc = document` branch (current
page === only page), never `GM_xmlhttpRequest`/`DOMParser`. A real
`button.click()` on `#toggle-credits` is therefore fully effective — the
rest of the pipeline reads the same mutated `document`.

**Change 2**: appended `'span#medium-toolbox'` to `release-tracks`'s
existing `removeSelectors` array (already used for two other native
`h2.tracklist` controls — "Edit recording comments" button, settings-icon
span) — no new removal mechanism needed; runs post-render in the existing
`finalCleanup()` pass.

**Verified via jsdom** (`ensure_credits_func.js`/`test_ensure_credits_inline.js`
in scratchpad — synthetic fixtures only, matching `debug/toolbox.org`'s own
markup examples; no live browser available in this environment):
- "at bottom" case (label starts "Display credits inline", flips on click
  via a simulated async handler): clicked, resolved ~540ms after the flip
  (idle-settle), not instantly and not at the 5s timeout.
- already-inline case (label starts "Display credits at bottom"): resolved
  in ~2ms, click handler never invoked.
- no `#medium-toolbox`/`#toggle-credits` present at all: returned cleanly,
  no throw, ~0ms.
- button clicked but never flips (simulated stuck/absent re-render):
  resolved at ~5007ms via the hard-timeout fallback.
- `features.ensureCreditsInline` unset/false: returned immediately, no
  DOM query, click handler never invoked.
`node --check ShowAllEntityData.user.js` passed after every edit.

## 2026-08-09 — h2 "Credits" section losing its Release/Release group h3 headers (WIP.36)

**Request**: on the final rendered `release-tracks` page, the h2 "Credits"
section (native `<div id="bottom-credits">`, below the tracklist —
`debug/credits-original.html`) is missing its `<h3>Release</h3>` and
`<h3>Release group</h3>` sub-headings on the final rendered page
(`debug/credits-final.html`) — everything else inside those two containers
(`table.details`, the release-group cover-art bigbox) survives untouched.

**Root cause 1 — `renderGroupedTable()`'s initial-render cleanup**: its
`if (!query)` cleanup pass (`container.querySelectorAll('h3, table.tbl,
.mb-master-toggle, .mb-group-intro')`) sweeps EVERY `<h3>` on the page
before rebuilding fresh content, not just the script's own generated
`h3.mb-toggle-h3` section headers. Its only existing exception was
`h3:has(span.worklink)` (a separate, unrelated glyph guard). The two native
`<h3>` inside `#bottom-credits` are bare `<h3>` with no `span.worklink`, so
they were deleted outright on every initial render, while their sibling
content (not itself matching the `h3`/`table.tbl` selector) was left alone
— exactly matching the observed damage.

**Fix 1**: added a second, equally targeted exception right next to the
existing `worklink` one — skip removal when `el.closest('#bottom-credits')`
is truthy. Deliberately NOT a broader rescope of the whole selector (e.g.
to `h3.mb-toggle-h3` only) — that would be a much bigger behavior change
across every other page type this cleanup pass also runs on (tags/genres
pages route native `<h2>`-renamed-to-`<h3>` category headers through this
exact same sweep every re-render), so a narrow, additive guard matching the
codebase's own established pattern for this cleanup pass was preferred.

**Root cause 2 — `_relocateTrailingH2Sections()`**: this function (runs in
`finalCleanup()`, after `renderGroupedTable()`) moves any `<h2>` MusicBrainz
rendered after the main data table to sit immediately before it, by walking
the candidate `<h2>`'s own `nextSibling` chain and re-parenting each node
found onto the data h2's parent (`#content`) individually. This assumes the
candidate h2 is already a direct child of `#content` — true for e.g. native
"Relationships"/"Related works" h2 sections, but NOT for the Credits h2,
which is nested one level inside `<div id="bottom-credits">`. Its "siblings"
under that assumption were actually `#bottom-credits`'s own children
(`div#release-relationships`, `div#release-group-relationships`) — each got
individually re-parented onto `#content`, abandoning `#bottom-credits`
empty behind them. This is what produced the "unwrapped" structure in
`debug/credits-final.html` (h2 and its two divs as flat siblings, no
`#bottom-credits` wrapper at all).

**Fix 2**: before falling back to the per-node sibling walk, walk UP from
the candidate h2 to find the ancestor that IS a direct child of `#content`
(`while (_wrapper.parentNode !== _content) _wrapper = _wrapper.parentNode`).
If that ancestor isn't the h2 itself, relocate that WHOLE wrapper as one
unit (`insertBefore(_wrapper, _dataH2)`) instead of touching its internals.
For every pre-existing case (h2 already a direct child of `#content`) this
is a no-op — `_wrapper === h2` — so the original per-node walk still runs
unchanged.

**Verified via jsdom** (`credits_fix_funcs.js`/`test_credits_fix.js` in
scratchpad, against the real `debug/credits-original.html` fixture plus a
synthetic `#content` shell with a data h2/`.mb-row-count-stat` and a
script-generated `h3.mb-toggle-h3`+`table.tbl` pair):
- Before either fix ran: 3 `<h3>` in `#content` (Medium 1, Release, Release
  group), `#bottom-credits` present.
- After the cleanup pass: 2 `<h3>` remain — "Release"/"Release group"
  (correctly kept); the script's own "Medium 1" `h3.mb-toggle-h3` was
  correctly removed (that's the pass's actual job, unaffected by this fix).
- After `_relocateTrailingH2Sections()`: `#bottom-credits` still present,
  with its original 3 children intact (`h2`, `div#release-relationships`,
  `div#release-group-relationships`); both native h3 still present inside
  their respective divs; `#bottom-credits` correctly relocated to sit
  before the data h2 (the feature's actual intent, preserved).
- Simulated `makeH2sCollapsible()`'s `nextSibling` content-gathering walk
  on the (now intact, still-nested) Credits h2 — correctly finds exactly
  `div#release-relationships`/`div#release-group-relationships` as its
  `contentNodes`, confirming the collapsible-section toggle will still work
  correctly with the h2 left nested inside its wrapper.
- Regression check: the pre-existing `span.worklink` h3 exception still
  fires (untouched by the new `#bottom-credits` guard); a non-wrapped
  trailing h2 section (h2 directly under `#content`, with `<p>`/`<h3>`
  siblings, e.g. native "Relationships") still relocates via the original
  per-node walk with unchanged output order — confirming Fix 2's new
  wrapper-detection branch doesn't affect any pre-existing case.
`node --check ShowAllEntityData.user.js` passed after every edit.

## 2026-08-09 — Credits section still not relocated; Release/Release group h3 collapsibility (WIP.37)

**Request 1**: WIP.36 kept the `<h3>` headings intact, but the whole h2
"Credits" section still renders AFTER h2 "Tracklist" instead of before it
— see `debug/credits.html` (a full real page snapshot, 4.7MB; too large
for the `Read` tool's 256KB cap, inspected via ad hoc Python/jsdom scripts
instead of a direct read).

**Root cause**: `debug/credits.html` revealed the real native DOM nests
BOTH the Tracklist section AND `<div id="bottom-credits">` inside the SAME
`<div class="tracklist-and-credits">` wrapper, several levels below
`#content` — not the simpler "`#bottom-credits` is a direct child of
`#content`" shape WIP.36's fix assumed (confirmed via
`inspect_credits_page2.js` in scratchpad: `dataH2 top wrapper` and
`creditsH2 top wrapper` both resolve to the identical `DIV.tracklist-and-
credits` node — `SAME wrapper element (identity)? true`). WIP.36's "walk up
to the first ancestor that's a direct child of `#content`" therefore
produced `div.tracklist-and-credits` itself for the Credits h2 — which is
also an ANCESTOR of the Tracklist h2 (`_dataH2`) it was about to be
inserted before. `_dataH2.parentNode.insertBefore(_wrapper, _dataH2)` with
`_wrapper` an ancestor of `_dataH2` throws a DOM `HierarchyRequestError`
("new child element contains the parent"), which
`_relocateTrailingH2Sections()`'s own try/catch silently swallowed —
aborting the ENTIRE relocation pass (not just Credits) with only a debug
log, so the failure was invisible without instrumentation.

**Fix**: replaced the "walk up to `#content`" assumption with a proper
lowest-common-ancestor (LCA) computation between the candidate trailing h2
and `_dataH2`: build `_dataH2`'s ancestor chain as a `Set` once, then for
each trailing h2 walk up until hitting a parent present in that set (bounded
to 50 steps as a defensive guard, matching this codebase's established
style for bounded DOM walks — see `loadAllOverflowMediumTracks`'s
`_guard < 20`). The resulting `_lca` may now be `#content` (original simple
case, unchanged) OR a deeper shared wrapper like `div.tracklist-and-
credits` (the new case). Relocation then reorders SIBLINGS within `_lca`
(`_lca.insertBefore(_wrapper, _dataWrapper)`, where `_dataWrapper` is
`_dataH2`'s own ancestor-or-self that is a direct child of `_lca`) instead
of always inserting relative to `_dataH2` itself — sibling reordering
within a shared parent can never throw a hierarchy error, unlike inserting
an ancestor before its own descendant.

**Verified via jsdom** (`relocate_fn2.js`/`test_relocate_real.js` against
the REAL `debug/credits.html` DOM — the full 4.7MB page loaded into jsdom
directly, not a hand-built fixture):
- Before: `div.tracklist-and-credits` children = `[h2.tracklist, h3.mb-
  toggle-h3, table.tbl, div, div#bottom-credits]` (Credits last).
- `_relocateTrailingH2Sections()` — **no throw** (previously would have
  thrown and been silently swallowed).
- After: `div.tracklist-and-credits` children = `[div#bottom-credits,
  h2.tracklist, h3.mb-toggle-h3, table.tbl, div]` — Credits now first;
  `#bottom-credits` still has its original 3 children intact; both native
  `<h3>` still present; Credits h2 confirmed
  `DOCUMENT_POSITION_PRECEDING` relative to the Tracklist h2.
- Regression (`test_relocate_regression.js`): re-ran both WIP.36 test
  cases (non-wrapped native "Relationships" h2 with loose `<p>`/`<h3>`
  siblings; `#bottom-credits` as a DIRECT child of `#content`, no
  intermediate wrapper) — both produce identical output to before this
  fix, confirming the LCA generalization is a strict superset, not a
  behavior change, for every previously-working case.

**Request 2**: make h3 "Release" and "Release group" separately
collapsible by clicking their names, with toggle-aware tooltips.

**Design**: new `_makeCreditsH3sCollapsible()`, scoped to
`#bottom-credits`'s two child `<div>`s (`#release-relationships`/
`#release-group-relationships`). For each, finds its own `:scope > h3`,
treats every OTHER direct child of that div as the section's collapsible
content (its own `table.details` row(s), plus — for "Release group" — the
`jesus2099…bigbox` cover-art strip that precedes its tables), and wires a
plain `click` listener that flips `style.display` and updates both the
`▼`/`▲` `.mb-toggle-icon` glyph and the `<h3>`'s `title` attribute between
"Click to collapse this section" / "Click to expand this section".
Idempotent via a `.mb-credits-h3-processed` marker class (checked before
any DOM mutation), safe to call from both `finalCleanup()` and the
disk-load path without double-wiring.

**Deliberately its own class** (`mb-credits-toggle-h3`), never
`mb-toggle-h3` — that class is deeply wired into the script's own
data-group-header machinery (Ctrl+click toggle-all-peers, discography-view
filtering, CAA/EAA bigbox restoration, `findH3ForTable()`, the
initial-render `h3` cleanup sweep in `renderGroupedTable()`, …), none of
which applies to these two static native headers (no owned `table.tbl`, no
discography grouping) — sharing the class would risk them being silently
swept into logic that assumes every `.mb-toggle-h3` is a real data-group
header. A new `.mb-credits-toggle-h3` CSS rule (plus its own `:hover`
rule) mirrors `.mb-toggle-h3`'s visual style (same `sa_ui_h3_bg`/
`sa_ui_h3_hover_bg` settings) purely for visual consistency, with zero
shared JS behavior.

**Wired** in both places `_relocateTrailingH2Sections()` already runs
(`finalCleanup()`, and the disk-load path after `updateH2Count()`) — the
second call is a harmless idempotent no-op in practice, since (unlike
`_relocateTrailingH2Sections()`) this function has no `.mb-row-count-stat`
dependency: `#bottom-credits` is native content present from initial page
load, not gated on the script's own row-render completion.

**Verified via jsdom** (`h3_toggle_fn.js`/`test_h3_toggle.js`, against the
real `debug/credits-original.html` fixture):
- No `#bottom-credits` present: no throw, clean no-op.
- After wiring: both h3 get `mb-credits-h3-processed mb-credits-toggle-h3`
  classes, a `▼` `.mb-toggle-icon`, and title "Click to collapse this
  section"; all 3 "Release" `table.details` visible initially.
- 1st click: icon flips to `▲`, title flips to "Click to expand this
  section", all 3 tables `display:none`.
- 2nd click: icon back to `▼`, title back to "collapse", tables visible
  again.
- Independence: clicking "Release"'s h3 leaves "Release group"'s content
  nodes (its tables + cover-art bigbox) untouched.
- Idempotency: calling `_makeCreditsH3sCollapsible()` a second time adds
  no duplicate icon (still exactly 1 `.mb-toggle-icon` on the h3).
`node --check ShowAllEntityData.user.js` passed after every edit.

## 2026-08-09 — tracklist not rendering with "Batch Add Recording Aliases" userscript present (WIP.38)

**Request**: when the "Batch Add Recording Aliases from another Release"
userscript (by YoGo9) is active, the tracklist (of the last/only medium) is
not rendered. That script injects a widget — see `debug/other-userscript.html`
for its own markup, a plain class-less `<div>` whose child controls carry
ids `#yomo-src`/`#yomo-type`/`#yomo-locale`/`#yomo-primary`/
`#yomo-preview`/`#yomo-submit`/`#yomo-status`/`#yomo-table` — as the FIRST
CHILD of `div#content`, ahead of the native `div.wrap-anywhere.releaseheader`.
`debug/tt2a.html` is a full raw page capture (3.2MB) with the widget present,
for https://musicbrainz.org/release/52c6808b-037d-47d5-b0c7-17331c9d36cd
(single "7\" Vinyl" medium, 2 tracks). Also requested: remove the widget
from the final rendered page.

**Investigation**: extensive jsdom testing against the REAL `tt2a.html`
DOM (not raw-text regex, which over-counted `<h2>` matches by picking up
literal `<h2>` text embedded inside `<script type="application/json">`
JSON string values — the actual parsed DOM has 22 real `h2` elements, not
the 27 a naive text regex found) ruled out every DOM-position-based
hypothesis checked:
- `renderGroupedTable()`'s `targetHeader`/`firstTable` auto-detection
  (`allH2s` walk + `compareDocumentPosition` against `firstTable`) resolves
  correctly to the "Tracklist" h2 regardless of the widget's presence.
- Only one `table.tbl` (the one medium table) exists on the page at all —
  no competing/earlier table the widget could shadow.
- `activeDefinition.targetHeader` (the STRING option consumed by
  `parseDocumentForTables()`) is unset for `release-tracks`, so it takes
  the unscoped `Array.from(doc.querySelectorAll('table.tbl'))` fallback —
  unaffected by anything preceding it in the DOM.
- No unscoped `document.querySelector('input'/'select'/'button'/
  'script[type="application/json"]')` calls exist anywhere in the codebase
  that could accidentally first-match one of the widget's own controls
  instead of an intended native element — every such selector in this file
  is scoped to a specific container variable, never bare `document`.
- Delegated further (forked investigation): ran the REAL, extracted
  `applyNormalizeMediumTracklists()` → `updateH2Count()` pipeline against
  both the real `tt2a.html` DOM and a variant with the widget's wrapper
  surgically removed — row extraction (`"1 - 7\" Vinyl": 2 row(s)`) and the
  `.mb-row-count-stat` stamp on the correct h2 came out IDENTICAL in both
  variants. `applyExtractTrackTitleData()` (the ~550-line title-cell DOM
  surgery function) and the full `renderGroupedTable()` cleanup+rebuild
  pass have too many interdependencies to cleanly extract and run
  standalone within a reasonable session budget, so they weren't ruled out
  with the same certainty — the exact failure mechanism was NOT pinned
  down. It may be a live-runtime effect from that other userscript's own
  JS (a timing race, or a mutation it makes only during actual page
  interaction) that a static HTML snapshot fundamentally can't reproduce in
  jsdom.

**Fix (root-cause-agnostic)**: rather than continue chasing the exact
mechanism, remove the widget outright — before it can interact with
anything downstream at all. New `_removeYomoRecordingAliasesWidget()`
(`ShowAllEntityData.user.js`, next to `applyShowAllTags`/
`ensureCreditsInline`): finds `#yomo-preview` (always present in the
widget's own markup, distinctive enough to never collide with native MB
markup or another userscript), walks up to whichever ancestor is a direct
child of `#content` (the same ancestor-to-direct-child-of-`#content`
pattern `_relocateTrailingH2Sections()` already uses, WIP.37), and removes
that whole wrapper as one unit. A safe no-op when `#yomo-preview` isn't
present (script not installed). Gated by `features.removeYomoWidget: true`,
wired as the FIRST step of the `release-tracks` pre-processing block in
`startFetchingProcess()` — before `ensureCreditsInline`/
`loadOverflowTracks`/`normalizeMediumTracklists`/`extractTitleData` — so
nothing downstream ever sees it. Since it's removed for good this early,
it also never reappears on the final rendered page, satisfying the second
part of the request without a separate `removeSelectors` entry.

**Verified via jsdom** (`yomo_fn.js`/`test_yomo_removal.js` against the
real `debug/other-userscript.html` fixture, plus `test_yomo_real.js`
against the full real `debug/tt2a.html` page):
- No widget present: no throw, `#content`'s children unchanged.
- Real widget markup prepended to `#content`: `#yomo-preview` present
  before, removed after; `.releaseheader` (and everything else) survives
  untouched.
- Second call after removal: no throw, still a no-op (idempotent).
- Against the real `tt2a.html`: before removal, `#content`'s first child
  is the bare widget `<div>`; after removal, it's
  `div.wrap-anywhere.releaseheader` (the native element) — `#yomo-preview`
  gone, `table.tbl.medium` and the "Tracklist" h2 both still present and
  untouched.
`node --check ShowAllEntityData.user.js` passed after every edit.

## 2026-08-09 — real root cause: external script injecting "vzell" into the ISRCs column filter (WIP.39)

**The user reported WIP.38 didn't actually fix anything** — the tracklist
still failed to "render" with the widget-removal fix in place. Two rounds
of live-browser diagnostics with the user (confirmed: happens on a
single-medium release too, confirmed: fully disabling the other userscript
in Tampermonkey resolves it) plus a real browser console capture
(`debug/fail.debug`, requested from the user) revealed the actual
mechanism, completely unrelated to WIP.38's DOM-position theory:

```
🔍 Column filter updated on column 19: "vzell"
```

— the "ISRCs" column filter (the LAST column) gets silently populated with
the user's own MusicBrainz username the moment the other userscript
activates. The table WAS rendering correctly the whole time (WIP.38's
end-to-end harness — see the WIP.38 entry above — had already proven
this); with an active filter matching nothing, `renderGroupedTable()`
correctly shows 0 rows, which is visually indistinguishable from "nothing
rendered" without noticing the filter box itself.

**Ruled out browser password-manager autofill**: the user's own screenshot
of the ISRCs filter box showed plain typed-looking text, no autofill
yellow-tint/highlight and no suggestion dropdown — the visual signature
Chrome shows for a genuine autofill action. Confirms this is a plain
`.value = 'vzell'` write followed by a synthetic `dispatchEvent(new
Event('input'))` — most plausibly the OTHER userscript itself, targeting
the wrong element via some overly-broad/buggy selector logic we have no
visibility into (its source isn't in this repo and we don't control it).

**Fix — defend our own filter inputs regardless of the external cause**:
rather than chase an unknowable third-party bug, hardened all THREE filter
input types this script owns (global filter, per-column filter, per-
sub-table filter) against exactly this class of interference. Their
'input' listeners now require `_isGenuineFilterInputEvent(e)` —
`event.isTrusted` (true only for a REAL keystroke/paste; a JS-constructed
`new Event(...)` always has `isTrusted: false`, and this cannot be spoofed
by any script, including a malicious one — this is a browser-enforced
guarantee, not something our code has to trust blindly) OR
`event.mbInternal` (a custom marker WE set, see below). Any event failing
both checks is rejected: the injected value is discarded (reset to `''`
for column/sub-table filters, or to `getFilterFocusPrefix()` for the
global filter, which must always start with its permanent prefix) and
`debouncedRunFilter()`/`debouncedColumnFilter()`/`debouncedApply()` is
never called, so the bogus value never gets the chance to activate as a
filter.

**New shared helper `_dispatchInternalInputEvent(el, opts)`** (next to
`getFilterFocusPrefix()`): wraps `new Event('input', opts)` and stamps
`evt.mbInternal = true` before dispatching, so our OWN legitimate
programmatic re-triggers still pass the guard. Converted all 6 existing
`el.dispatchEvent(new Event('input', ...))` call sites in the codebase to
use it: the filter-history-widget "apply saved entry" handler (both the
global and per-sub-table history widgets share this one function), the
"Clear ALL filters" button's per-sub-table-input loop,
`reapplyAllSubTableFilters()`, the unique-values dropdown's "apply this
value as a column filter" click handler, and the Unicode character
picker's insert-and-notify step (`_saUnicodeInsert`, which can target
ANY text field wired for Ctrl+U, not just filters). Missing even one of
these would have silently broken that specific feature (its own dispatched
event would now fail the new guard and get discarded).

**Verified via jsdom** (`filter_guard_funcs.js`/`test_filter_guard.js` in
scratchpad — a minimal fixture mirroring the real per-column filter
listener's guard branch, since the full listener is deeply coupled to the
column-filter-creation closure):
- An external script's exact pattern (`input.value = 'vzell'; input.
  dispatchEvent(new Event('input'))`, no marker) — value reset to `""`,
  filter callback never invoked. Reproduces and fixes the exact captured
  scenario.
- `_dispatchInternalInputEvent(input, {...})` — value preserved, filter
  callback DOES fire (confirms internal re-triggers still work).
- `_isGenuineFilterInputEvent({isTrusted: true})` → `true`;
  `_isGenuineFilterInputEvent({isTrusted: false})` (no marker) → `false`
  (a real trusted event can't be constructed via jsdom's `dispatchEvent` at
  all — `isTrusted` is a read-only, non-configurable property on real
  `Event` instances in both jsdom and real browsers, so this specific
  check was made directly against the predicate function rather than
  through a full dispatch — the guarantee itself is a browser-spec
  invariant, not something this codebase needs to independently verify).
`node --check ShowAllEntityData.user.js` passed after every edit.

**Addendum, same day**: none of the three filter inputs previously set
`autocomplete`. Added `autocomplete="off"` to all three as a
belt-and-suspenders measure alongside the `isTrusted` guard above — the
guard alone cannot catch a genuinely browser-trusted insertion (the
browser's own form-field-history/autocomplete remembering a value by field
`name`/`id`, or another script using `document.execCommand('insertText',
...)` specifically to produce a real, trusted 'input' event so
React-based apps recognize it — a known, legitimate technique some
userscripts use to reliably sync with React state, and indistinguishable
from genuine typing purely via `event.isTrusted`).

**Important caveat discovered while investigating the user's follow-up
report that the fix "still didn't work"**: `git log`/`git status` showed
WIP.38 and WIP.39 were still uncommitted and unpushed at that point — the
user had been testing against the pre-fix script the whole time, since
nothing had actually been deployed yet. Always confirm a fix has been
committed+pushed (and reinstalled/updated in Tampermonkey) before treating
a "still broken" report as evidence the fix itself is wrong.

**Second addendum, same day**: the user reported it was STILL happening
after the `autocomplete="off"` addition too (asked to try one more thing
before committing/pushing — so this round wasn't yet a real re-test of
deployed code either; stacking defenses before the first actual
deployment). This is consistent with the "third-party password-manager
extension" theory above: many such extensions (LastPass, 1Password,
Bitwarden, Dashlane, Proton Pass, …) deliberately IGNORE `autocomplete=
"off"` on a target field, treating it as a common site-authoring mistake
rather than a genuine opt-out — but they DO respect their own explicit
per-extension "leave this field alone" `data-*` attributes. Added
`_hardenFilterInputAgainstPasswordManagers(input)` (next to
`_dispatchInternalInputEvent()`), setting `data-lpignore`, `data-1p-
ignore`, `data-bwignore`, `data-form-type="other"`, and `data-protonpass-
ignore` on all three filter inputs. Verified via jsdom
(`test_pm_harden.js` in scratchpad) that all five attributes get set
correctly; there is no way to verify EFFECTIVENESS against a real
extension outside a live browser with that extension installed — this
is a best-effort layer based on documented conventions, not something
this codebase can prove works.

Also asked the user whether they could get the OTHER userscript's own
source (from Tampermonkey's dashboard) — if it turns out to be that
script's own code (not a browser/extension autofill mechanism) directly
writing into our column filter, having its source would let us find the
exact faulty selector/logic instead of continuing to guess at browser-
level explanations.

**Third addendum, same day**: user provided the OTHER script's actual
source, `debug/other-userscript.js` ("Batch Add Recording Aliases from
another Release", by YoGo9, built on `mbz-loujine-common.js`). Read it in
full — it fetches release/recording data from the MB web service, matches
tracks by recording MBID or medium/track position, and posts alias edits.
It never reads or writes anything resembling a username, and every DOM
read/write in the script is scoped to its own `#yomo-*` elements
(`#yomo-src`, `#yomo-locale`, `#yomo-primary`, `#yomo-type`, `#yomo-
status`, `#yomo-table`) — confirming its own JS is NOT directly writing
into our ISRC column filter. `injectUI()` confirms exactly what we already
knew from the markup: `(document.querySelector('#content') ||
document.body).prepend(box)`.

This rules out "buggy selector in yomo's own code" and strengthens the
password-manager-extension theory: the widget introduces a fresh,
unlabeled `<input id="yomo-src">` near the top of the page, a plausible
autofill target. `_removeYomoRecordingAliasesWidget()` (WIP.38) used to
`.remove()` the whole widget outright as our first pre-processing step —
new theory: if an extension has already latched onto `#yomo-src` for an
autofill attempt and that attempt gets interrupted by the element's
removal, some extensions retry by hunting for a new nearby candidate once
their original target vanishes, which could land on our column filter.

**Fix (still speculative, not yet confirmed against a live extension)**:
changed `_removeYomoRecordingAliasesWidget()` to hide the widget
(`_wrapper.style.display = 'none'`) instead of `.remove()`ing it — the DOM
nodes (including `#yomo-src`) stay present and connected, just invisible,
so a pending autofill attempt can complete harmlessly against a field
nobody reads, instead of being forced to look elsewhere.

**Verified via jsdom** (`yomo_fn2.js`/`test_yomo_hide.js` in scratchpad,
against the real `debug/other-userscript.html` fixture): before, `#content`
has 2 children (the widget div, the native releaseheader div); after
calling the function, still 2 children (widget NOT removed) —
`#yomo-src` confirmed still present AND `.isConnected === true`; the
wrapper's `style.display` confirmed `"none"`.
`node --check ShowAllEntityData.user.js` passed after every edit.

Still uncommitted/unpushed at this point — user has not yet had the
chance to test this specific change against a real browser session with
their password manager active.

## 2026-08-09 — root cause confirmed via cross-browser testing; native Chrome/Vivaldi autofill (WIP.40)

**Hiding the widget also didn't help** (per user report), and they
provided the OTHER script's full source (`debug/other-userscript.js`) —
read in full, confirms it never touches anything outside its own
`#yomo-*` elements, no username handling anywhere. Definitively rules out
"another userscript's own JS" as the writer.

**Decisive clue — cross-browser test results from the user**: reproduces
on Chrome and Vivaldi. Does NOT reproduce on Firefox, Opera, or Brave.
Opera and Brave are ALSO Chromium-based, which rules out a generic
Chromium-engine-level bug/quirk — if it were that, Opera/Brave would be
affected too. The distinguishing fact: Vivaldi is documented to license
and use Google's own proprietary autofill/prediction backend (the same
service Chrome itself uses) — one of very few Chromium forks to have
obtained this from Google — while Brave and Opera each implement their
OWN independent autofill logic without access to it. This uniquely
explains the exact Chrome+Vivaldi / not-Opera+not-Brave split.

**Conclusion**: this is Chrome's/Vivaldi's NATIVE, BUILT-IN credential-
autofill feature — not a browser extension, not a userscript. Chrome's
own autofill/security team has a long-standing, publicly documented,
DELIBERATE policy of ignoring `autocomplete="off"` for any field its
heuristics classify as part of a login form (see crbug.com/468153 and
extensive related discussion — the team's stance is that respecting
`autocomplete="off"` for credential fields would be a net negative for
user security/UX, so Chrome will NOT honor it there, full stop). This
explains why NEITHER of WIP.39's two fixes stopped it: the `isTrusted`
guard targets fake/synthetic events from JS (native browser autofill
produces genuinely trusted events — the browser itself is originating
them), and `autocomplete="off"` targets a mechanism (Chrome's SEPARATE,
non-credential form-field-history feature) different from the one
actually responsible here.

**Fix — two techniques specifically documented to work against Chrome's
own native credential-autofill (as opposed to `autocomplete="off"`, which
does not)**:
1. **`type="search"` instead of `type="text"`** — Chrome's credential-
   autofill heuristic specifically targets `text`/`email`-type inputs; a
   `search`-type input isn't treated as a login-field candidate. Also
   semantically more correct for what these fields actually are. New CSS
   (`-webkit-appearance: none` + hiding `::-webkit-search-cancel-button`)
   neutralizes the browser's own search-input decorations (rounded
   corners, native ✕ button) so visual appearance is unchanged — each
   filter already has its own custom ✕ clear button that would otherwise
   visually collide with the native one.
2. **`readonly` until a genuinely trusted interaction** — Chrome generally
   will not attempt to autofill a `readonly` field. Set on creation;
   cleared only inside a `mousedown`/`focus` listener gated on
   `event.isTrusted` (so this can't be defeated the same way a script
   might fake a `dispatchEvent` — a REAL browser-originated interaction is
   required). The global filter's own "auto-focus after render" feature
   (`ShowAllEntityData.user.js`, the `setTimeout(() => { … _gfi.focus(); …
   }, 150)` block) does a PROGRAMMATIC (untrusted) focus, which the guard
   correctly ignores — so that code now explicitly does
   `_gfi.readOnly = false;` itself, right before its own `.focus()` call,
   or the field would silently reject the user's very next keystroke until
   a second, real interaction.

Rewrote `_hardenFilterInputAgainstPasswordManagers()` (WIP.39) into
`_hardenFilterInputAgainstAutofill()` (next to `_dispatchInternalInputEvent()`),
combining both new techniques with the two from WIP.39
(`autocomplete="off"`, the `data-lpignore`/etc. third-party-extension
opt-out attributes) into one call per filter input creation site — now
just `_hardenFilterInputAgainstAutofill(input)` replaces what used to be
3 separate lines (`type`, `autocomplete`, the harden call) at each of the
3 call sites.

**Verified via jsdom** (`harden_autofill_fn.js`/`test_harden_autofill.js`
in scratchpad): `type` → `"search"`; `autocomplete` → `"off"`; `data-
lpignore` set; `readOnly` starts `true`; an untrusted (synthetic)
`focus` event leaves `readOnly` still `true` (correctly ignored); a
trusted interaction clears it to `false`. `node --check
ShowAllEntityData.user.js` passed after every edit.

**Confirmed fixed by the user** on their real Chrome session — the "vzell"
injection into the ISRC column filter no longer happens.

**Follow-up, same day**: fixed reported immediately after, with a
screenshot — every column filter now shows a grey background until
clicked/focused at least once (an active, clicked-into filter shows
white). This is Chrome's/Vivaldi's own default UA styling for `:read-
only` inputs, a direct visible side effect of the `readonly`-until-
genuine-interaction trick above — every filter starts `readonly` and the
browser paints it accordingly until the guard clears it. Added a CSS
override: `#mb-global-filter-input:read-only, .mb-col-filter-input:read-
only, .mb-stf-input-wrap input[type="search"]:read-only { background-
color: #fff; }`, right next to the `type="search"` neutralization rules
already added. Class-based `:read-only` selectors have lower specificity
than the INLINE `background-color` style already applied when a filter
actually has an active value (`sa_col_filter_active_bg`, default
`#fff9c4` yellow, set via `input.style.backgroundColor = ...`) — so this
only affects the idle/empty appearance; a genuinely active filter still
shows its yellow highlight regardless of `readonly` state (a filter CAN
end up with a value while still `readonly` — e.g. clicking a unique-
values dropdown entry programmatically sets `.value` via
`_dispatchInternalInputEvent()` without the user ever having clicked
the input itself first).

Still uncommitted/unpushed per the user's explicit "do not commit yet"
instruction from earlier in this same debugging session — the main fix is
now confirmed working; commit/push is pending the user's go-ahead.

## 2026-08-11 — flag/area icons bunched at the start of unique-values dropdown entries (WIP.76)

**Snapshots**: `place-flags.html` (a "Recorded in area" `<td>` from
`https://musicbrainz.org/release/6d19588c-0305-4fb0-b687-d4b75a75c3fd`,
showing the correct table-cell rendering: "Southern Tracks in
[region-icon]Atlanta, [region-icon]Georgia, [flag]United States" — each
icon immediately in front of the name it decorates); `place-flags-ucv.html`
(the SAME cell value as it was rendering in the unique-values dropdown
before this fix — all three icons prefixed together at the very start,
before "Southern Tracks…"); `uv-dropdown.html` (the complete dropdown
panel for that column, showing every entry with its icons front-loaded
the same wrong way).

**Root cause**: `openUniqDrop()`'s `flagIconMap` (keyed by
`getCleanColumnText()` value) stored a flat array of every flag/area-icon
element found anywhere in the source cell, with no positional link to the
surrounding text. `renderItems()` appended the whole array as one block
right after the count badge, then appended the whole value string as a
second, separate block — so all icons always land before all text,
regardless of where they actually sit in the cell.

**Fix**: `flagIconMap` now maps each value to an ORDERED array of
`{type:'text', text}`/`{type:'icon', node}` segments, built by walking the
live cell with a `TreeWalker` (same acceptance rules as
`getCleanColumnText()` — reject `script`/`style`/`head` and anything
matching `_CLEAN_STRIP_SEL`, skip `isDecorativeIcon()` text) and emitting
an icon segment, pre-order, at each `span[class*="flag-"], span.area-icon`
element — pre-order visitation is what puts the icon before any text
nested inside it (native `<span class="flag flag-US">` wraps its own link
text, e.g. "United States"). The per-element baking logic (verbatim clone
for `.area-icon`; a freshly built, childless, `resolveFlagVisual()`-baked
span for a native `.flag.flag-XX`) was extracted unchanged into
`_bakeFlagIconNode(el)`, now called once per icon element from the walker
instead of once per element in a flat `querySelectorAll` loop.
`renderItems()` renders the segments in order — text as plain text nodes,
icons as cloned/`aria-hidden`/`margin-right`-styled siblings — instead of
the old two-block append, with the existing quickfilter `<mark>` highlight
now scoped per-segment (a match straddling an icon boundary simply
doesn't get highlighted — an accepted, documented degradation, since the
item's inclusion in the filtered list is still driven by the full value
string).

## 2026-08-11 — unique-values dropdown "Cell structure" overload → collapsible sections (WIP.77)

**Snapshot**: `uvd.html` — the complete unique-values dropdown panel for
the "Artist" column on
`https://musicbrainz.org/instrument/63021302-86cd-4aee-80df-2270d54f4978/artists`,
captured BEFORE this change. 597 total `role="option"` rows in one scroll
area: 196 under a single flat "Cell structure" header (99 "» name:" / 93
"» comment:" / 4 "» alias:" entries, all mixed together with no
sub-grouping) followed directly by 401 plain alphabetical whole-cell
values — the highest-volume real case found for this problem. Confirms
the entity-info family (`_findCellEntityCommentParts()`) is scoped to
cells that already carry a MusicBrainz disambiguation comment, so every
one of the 196 rows corresponds to an artist whose name alone isn't
unique enough to need one.

**Change**: user asked (1) whether the panel could drop look-alike
duplicate entries, (2) whether "Cell structure" could be broken into
named, collapsible sections, and (3) whether each section should get its
own quick filter alongside the existing global one. Discussed and agreed:
keep the single existing global quick filter (already covers `listBox`
and most of `synBox`) rather than adding N per-section boxes, but make it
smarter; split "Cell structure" into `SYN_SECTION_META`-driven collapsible
sections (🔠 Structure / 🚩 Flags / 🎚️ Credit details / 👤 Entity info /
🎭 Roles / 🔗 Relationship icons — see `getOrCreateSynSection()`),
collapse state persisted globally by section name via GM storage; and
suppress a "» name:"/"» alias:" entry when that exact text is already
independently selectable elsewhere in the panel (a plain whole-cell value
or an entity-glyph href row) via a `_alreadyOfferedBareNames` Set built
right after `combinedVals`. Also closed a pre-existing gap where the
"Relationship icons" section's entries had no `dataset.mbUniqSynLabel` and
were silently skipped by the quickfilter. Full plan:
`~/.claude/plans/debug-uvd-html-complete-unique-wondrous-lemon.md`.

`node --check ShowAllEntityData.user.js` passed after every edit.

## 2026-08-11 — unique-values dropdown height made configurable (WIP.78)

User follow-up after the WIP.77 sectioning work above: the dropdown's
visible height was a hardcoded `max-height: 320px` on
`#mb-col-uniq-dropdown`, giving a fixed ~8 rows before scrolling
regardless of the user's screen size. Added `sa_uniq_dropdown_visible_rows`
(number setting, default 8 — chosen to reproduce the old fixed behavior
exactly: `8 * 29px/row + 88px overhead (50 syn header/divider + 38 qf bar)
= 320px`). `openUniqDrop()` now sets `drop.style.maxHeight` inline from
this setting on every open (inline always wins over the unchanged 320px
CSS fallback), and the `dropH` flip-upward-positioning estimate uses the
same computed value instead of the old hardcoded `320` so the panel still
flips correctly above the button at any configured row count.

`node --check ShowAllEntityData.user.js` passed after every edit.

## 2026-08-11 — "Roles" section missing on artist-events' plain-text "Role" column (WIP.79)

User report: `https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f/events`'s
"Role" column shows no `» role:` entries in the unique-values dropdown's
"Roles" section, unlike the "Artists" column on
`https://musicbrainz.org/place/6a59a67c-fcc5-491f-949c-bfc45bc97463/events`
(added in WIP.75) which works correctly.

**No HTML snapshot this time** — `musicbrainz.org` is currently behind a
JS proof-of-work bot challenge (`/__meb_verify`) that a plain `curl` can't
pass, and this session had no headless-browser tool available. Root cause
was instead confirmed against MusicBrainz's own public server source
(`metabrainz/musicbrainz-server` on GitHub, fetched via
`raw.githubusercontent.com`, unaffected by the challenge):
`root/components/list/EventList.js`'s `rolesOnlyColumn` (only built when
`artist && artistRoles`, i.e. viewing one artist's OWN events) is a
`defineTextColumn` (`root/utility/tableColumns.js`) whose `Cell` returns a
plain string — `commaOnlyListText()`
(`root/static/scripts/common/i18n/commaOnlyList.js`) joining that artist's
own `localizeArtistRoles()` names with `", "`. So the rendered `<td>` is a
single flat text node, e.g. `"main performer, guest performer"` — no
`<ul class="artist-roles">` wrapper at all, unlike the "Artists" column's
`.artist-roles` list shape `_findCellArtistRoles()` already handled.

**Fix**: `_findCellArtistRoles()` gains a second extraction shape — when
the `.artist-roles` list scan finds nothing, it checks whether the cell's
OWN column header (`_cleanColHeaderText()`, via `cell.closest('table')` +
`cell.cellIndex`) is literally `"Role"`; if so, it comma-splits
`getCleanColumnText(cell)` into individual roles. Gated strictly on that
exact column name (not "any plain-text cell") so an unrelated
comma-containing column (e.g. "Comment") is never misread as a role list.
Its return shape's `li` key is renamed to `container` (a `<td>` for this
new shape, a `<li>` for the original one) — updated at its one other
consumer, `_highlightEventRoleMatch()`.

`node --check ShowAllEntityData.user.js` passed after every edit.

## 2026-08-11 — Location split renders duplicate "New York" as two separate lists (WIP.80)

**Snapshots**: `sirius-initial.html` (native page-1 markup for the artist's
`/events` listing, event `ca9546b5…`, "SiriusXM Studio" venue — confirms the
raw "Location" `<td>` is a single `<ul><li>` chain: place link, then
`span.area-icon`(alt "New York City") + `<a>New York</a>` (area
`74e50e58…`), then `span.area-icon`(alt "New York") + `<a>New York</a>`
(area `75e398a3…`, a DIFFERENT area entity — MusicBrainz has both a city
and a state literally named "New York"), then the flag-wrapped
`<a>United States</a>`); `sirius-final.html` (a `<tr>`-level fragment, no
`<table>` wrapper — for a DIFFERENT event at the same venue, `20b5503f…` —
showing the rendered bug: the split "Locality" column is EMPTY and
"Region" contains `<ul><li>[NYC icon][NYC link]</li></ul>, <ul><li>[NY
icon][NY link]</li></ul>` — two adjacent `<ul>` elements sharing one `<td>`,
joined by a bare comma text node, instead of one merged `<li>`).

**Investigation**: reproduced `ColumnDataExtractor.splitLocation()` +
`_routeAreaLink()` verbatim against the `sirius-initial.html` markup in
jsdom (installed via `npm install jsdom --no-save` in the scratchpad —
`musicbrainz.org` itself is currently behind a JS proof-of-work bot
challenge, same blocker as the WIP.79 investigation) — confirmed
`splitLocation` ALONE produces the CORRECT single merged `<li>` in Region
(both "New York" entries comma-joined, Locality empty) for this exact
input, since `_routeAreaLink`'s `forceRegion` check does trigger for the
first ("New York City") anchor — its text "New York" happens to
case-insensitively match a real US STATE name in
`AREA_FLAG_REGION_SUBDIVISIONS['united states']`, so it's a false-positive
match, but a HARMLESS one at that point since both entries land in the
same container either way.

The actual DOM-splitting bug is downstream: `_maybeCorrectAreaFlagRegion()`
— the deferred correction pass (`initAreaFlagRegionObserver()`'s
`MutationObserver`) that exists specifically because paginated rows
(pages 2..Max) are parsed from a detached `DOMParser` document that the
flag-decorating userscript never touches, so `_routeAreaLink`'s
`forceRegion` check sees NO icon yet at extraction time and correctly
routes the first anchor to Locality. Once the row lands in the live tbody
and that userscript decorates the anchor, `_maybeCorrectAreaFlagRegion()`
re-checks and calls `_forceLocalityToRegion()` to retroactively move it —
but that function moved Locality's ENTIRE `<ul>` wrapper as a sibling of
Region's own `<ul>` (both cells are ALWAYS `<ul><li>`-wrapped, per
`splitLocation`'s "single-item-list-cell convention"), instead of merging
the two `<li>`s' content together. Reproduced the exact bug byte-for-byte
in jsdom with a minimal two-cell test, then verified the fix (merge
same-indexed `<li>` pairs' children when both sides carry an equal `<ul> >
li` count; fall back to the original whole-cell move only when Region has
no `<ul>` of its own — i.e. was genuinely empty) produces the correct
single merged `<li>`.

`node --check ShowAllEntityData.user.js` passed after every edit.

## 2026-08-11 — doubled CAA inline images on user-ratings "Release group ratings" (WIP.81)

**Snapshots**: `cell.html` (a single rendered "Release groups" `<td>` from
`/user/vzell/ratings`, showing BOTH icons side by side: this script's own
`<span class="mb-caa-inline-ph">` with an `<img src="blob:...">` fetched
via IndexedDB, AND the native `<a href=".../cover-art"><span class="caa-icon
jesus2099userjs154481" style="background-image:url(…)">` left over from the
page); `user-rating-initial.html` (native page — confirms the "Release
group ratings" `<ul><li>` already carries that same jesus2099 `<a
href=".../cover-art">…</a>` icon per release-group entry, plus a separate
`<div class="jesus2099userjs154481bigbox">` cover-art strip above the whole
list — both injected by the jesus2099 "mb. SUPER MIND CONTROL" userscript,
unrelated to this script); `user-rating-final.html` (rendered page,
confirms both icons coexist in the final `<td>`, matching `cell.html`).

**Root cause**: `entityFeatures['Release groups']` on both the `user-ratings`
(`/user/<username>/ratings`) and `user-ratings-type`
(`/user/<username>/ratings/<entity>`, the "View all ratings" overflow page)
page definitions set `addCAA: 'Release group'` with NO `columnErasers` entry
— unlike the established pattern elsewhere (e.g. `artist-recordings`'s
`columnErasers: [{ sourceColumn: 'Release groups', erasers: [...,
'jesus2099'] }]`, `series-releases`'s `'Release groups'` block) where the
native jesus2099 cover-art anchor is erased BEFORE `addCAA` adds its own
inline thumbnail. Without that erasure, both icons survive into the
rendered cell.

**Fix**: added `columnErasers: [ { sourceColumn: 'Release group', erasers:
['jesus2099'] } ]` to both page definitions' `'Release groups'` blocks.

**Broader finding, confirmed and fixed too**: the identical gap (a `'Release
groups'`/`'Releases'` `entityFeatures` block with `addCAA` but no matching
`'jesus2099'` eraser) also existed on `artist-credit-entity`, `artist-credit`
(both `'Release groups'`+`'Releases'`, no `columnExtractors` at all — single
`extractMainColumn`-only blocks), `user-tag-value-entity`, `user-tag-value`,
`tag-value-entity`, `tag-value` (all four, both `'Release groups'` AND
`'Releases'`), `collections-releases` (`'Release groups'`/`'Releases'`, the
`'caa'`-columnExtractor shape, sourceColumns `'Title'`/`'Release'`), `search`
(`'Release groups'`/`'Releases'`/`'Recordings'`, sourceColumns `'Release
group'`/`'Name'`/`'Release'`), and `series-releases`'s own `'Releases'`
block (added `'jesus2099'` to its existing `['▶', '➕']` erasers array — its
`'Release groups'` block already had the fix). User confirmed via
AskUserQuestion to fix all of them in this same session; each was verified
with an exact-match assertion (Python script over the file content, one
`str.replace(old, new, 1)` per confirmed-unique block) before writing, and
`node --check` passed after every batch.

`node --check ShowAllEntityData.user.js` passed after every edit.

## 2026-08-11 — WIP.81's eraser fix didn't actually fire on multi-entity pages (WIP.82)

User reported "the error is still present" after WIP.81. No new snapshot —
traced it directly in the source. Root cause: `/user/<username>/ratings`
(and `tag-value`/`user-tag-value`/`instrument-list`/`artist-credit`) render
SEVERAL entity types' tables simultaneously on one page (e.g. "Artist
ratings", "Event ratings", …, "Release group ratings" all at once). The
row-collection loop's per-group table-building pass (around
`ShowAllEntityData.user.js:36985`, the `if (pageType === 'tag-value' ||
…)` block) rebuilds `activeColumnExtractors` /
`activeSyntheticColumnExtractors` / `activeInjectedColumnExtractors` /
`activeIntegerColumns` from each group's OWN `entityFeatures` block (with
per-table colIdx re-resolution against that group's own thead) — but never
rebuilt `activeColumnErasers`. So `applyColumnErasers(newRow,
activeColumnErasers)`, called per row a few lines later, kept using
whatever single entity type's erasers got resolved ONCE at the very top of
`startFetchingProcess()` (from `resolveEntityFeaturesFromH2(baseDef)` —
which can't represent 7 simultaneous entity types at once), for every
group's rows — so the `columnErasers: [{ sourceColumn: 'Release group',
erasers: ['jesus2099'] }]` entries added in WIP.81 were silently never
applied. Confirmed by reading the call site directly:
`applyColumnErasers(newRow, activeColumnErasers)` at (post-fix) line
~37071 runs against whatever `activeColumnErasers` currently holds, and
nothing in the per-group block set it before this fix.

**Fix**: added `activeColumnErasers = buildActiveColumnErasers(_tmpDef);`
alongside the existing extractor rebuild, plus a per-table colIdx
re-resolution pass for erasers mirroring the existing extractor one (reset
every eraser's `colIdx` to `-1`, then match `sourceColumn` against the
CURRENT table's own `<thead>` cells — a stale eraser from a previous
group's table simply never matches a differently-named column, so this is
safe). Also added `'artist-credit'` to the pageType list gating this
whole block — it has the identical simultaneous-multi-entity-table shape
(Release groups / Releases / Recordings all at once) but was missing from
the list entirely, so its WIP.81 erasers were equally dead.

Single-entity-per-page-load pages (`search`, `series-releases`,
`tag-value-entity`, `user-tag-value-entity`, `artist-credit-entity`,
`collections-releases`) are unaffected by this bug — they resolve ONE
entity type once at the top of `startFetchingProcess()` and never need a
per-group rebuild, so their WIP.81 erasers were already working.

`node --check ShowAllEntityData.user.js` passed after every edit.

## 2026-08-11 — EAA "Poster" dropdown selection filters but doesn't highlight (WIP.83)

**Snapshots**: `EAA-filter-color-not-working.html` (selected "Poster" from
the EAA column's unique-values dropdown on
`/series/f4818e95-a515-4821-ad6d-270703f72dcf`) vs.
`EAA-filter-color-works.html` (typed "Poster" directly into the same
column filter box). Both show the SAME row correctly filtered
(`data-mb-uniq-values="[&quot;Poster&quot;]"` / `[1 COLUMN FILTER
['EAA':"Poster"]]` in one, the plain filter value in the other) and the
SAME underlying cell (`<ul class="mb-caa-art-ul" data-mb-art-search="Poster">`
present in both). The only difference: the `<span class="mb-caa-type-badge">`
pill's own text is bare `Poster` in the "not working" snapshot, but wrapped
`<span class="mb-column-filter-highlight"><span class="mb-column-filter-highlight">Poster</span></span>`
in the "works" one.

**Root cause**: `getCleanColumnText()` appends each image's own
type(s)/comment — stored in `ul.dataset.mbArtSearch` by
`_artBuildSearchText()`, never as visible text nodes (keeps sort keys
clean) — to a CAA/EAA cell's "whole cell" text. A cell with exactly one
image, type "Poster", no comment, therefore has "Poster" as its ENTIRE
matchable text, so "Poster" legitimately appears as a plain (non-item,
non-entity-prefixed) value in that column's unique-values dropdown.
Selecting it produces a value-SET filter
(`f.isMultiValueFilter === true`) — but BOTH places that apply
column-filter highlighting explicitly skip ALL value-set filters:
`testRowMatch()`'s highlight pass (`else if (f.isMultiValueFilter &&
(f.hasItemValues || f.hasEntityValues || (f.structureModes &&
f.structureModes.size)))` — a plain-value-only filter satisfies none of
those, so the whole branch was skipped) and `_artHighlightImageLi()` (the
CAA/EAA-specific highlighter used when `_artBuildMultiRowArtCell()`
rebuilds an art cell asynchronously — `if (f.isMultiValueFilter)
continue;`, unconditional). Typing "Poster" instead produces a plain-text
filter, which goes through the ordinary `highlightText()` path in
`testRowMatch()` and works today already (that path was not touched).

**Fix**: new `_highlightUniqArtTypeMatches(cell, f)` — mirrors
`_highlightUniqItemMatches()`'s "per-sub-element, not whole-cell"
pattern: for each `li.mb-caa-art-li-image` in the cell's `ul.mb-caa-art-ul`,
checks whether each `.mb-caa-type-badge > span` (one pill per type,
e.g. "Front" / "Back") or `.mb-caa-art-comment` span's own text is a
member of `f.valueSet`, and highlights just that sub-element via the
existing `highlightCrossTag(…, 'mb-column-filter-highlight')` primitive.
Wired into `testRowMatch()`'s `isMultiValueFilter` branch (now entered
unconditionally, `_highlightUniqArtTypeMatches` itself is a no-op on any
cell without a CAA/EAA `<ul>`) and into `_artHighlightImageLi()` (replacing
its blanket `if (f.isMultiValueFilter) continue;` with a matching
per-pill/comment check).

`node --check ShowAllEntityData.user.js` passed after every edit.

## 2026-08-11 — WIP.83 missed the item-value ("▤") CAA/EAA case (WIP.84)

**Snapshot**: `one-item-doesnt-match.html` — the dropdown ITEM element for
this specific "Poster" entry (not the rendered cell): `title="Poster — ▤
matches one item inside a multi-item cell, not the cell's entire
contents"`, `class="mb-col-uniq-item mb-col-uniq-checked"`, with the
`.mb-uniq-item-marker` "▤" glyph — confirming this is an ITEM-prefixed
value (`MB_UNIQ_ITEM_VALUE_PREFIX`), not the plain whole-cell value WIP.83
fixed.

**Root cause**: `_findCellListItems()` (the generic multi-row detector —
`cell.querySelector('ul, ol')` then `:scope > li` of that list) doesn't
special-case CAA/EAA markup at all — a `ul.mb-caa-art-ul` with even ONE
image already has 2 `<li>` children (`li.mb-caa-art-li-summary` +
`li.mb-caa-art-li-image`), so it's ALWAYS a qualifying "multi-row" cell to
`openUniqDrop()`'s generic item-collection pass, independent of the
image count. The summary li's own clean text is empty (its expand-toggle
glyph and CAA icon span are both filtered by `getCleanColumnText()`), but
each image li's own text ("Poster") IS non-empty, so it gets collected as
an item-value entry ALONGSIDE the same "Poster" string already being
offered as a plain whole-cell value (WIP.83's case) — both exist
independently in the same dropdown, selectable separately, which is
exactly how the user hit two different failures from what looked like
"the same" value.

`testRowMatch()`'s highlight pass already called `_highlightUniqItemMatches()`
correctly for item-value filters (unaffected by WIP.83). But
`_artHighlightImageLi()` — the CAA/EAA-specific highlighter re-run after
`_artBuildMultiRowArtCell()` rebuilds a cell asynchronously (IDB/network
timing) — only got the WIP.83 plain-value check added, never an
item-value one. So a cell that (re)builds AFTER an item-value filter is
already active — the same async race WIP.81/82 already dealt with for a
different function — stayed unhighlighted even though filtering still
worked (matching happens via a separate, already-correct code path in
`testRowMatch()`'s column-filter membership test).

**Fix**: added the same item-value check `_highlightUniqItemMatches()`
uses (`getCleanColumnText(li)`, `f.valueSet.has(MB_UNIQ_ITEM_VALUE_PREFIX
+ probe)`, highlight the WHOLE li via `highlightCrossTag`) to
`_artHighlightImageLi()`, ahead of the existing plain-value check, so both
cases now agree between build-time/async-rebuild highlighting and
post-build filter-change highlighting.

## 2026-08-11 — indistinguishable per-href entity-glyph rows in the standard section (WIP.85)

**Snapshots**:
- `uvd-enhancement.html` — the complete final rendered page for
  `/artist/70248960-cb53-4ea4-943a-edb18f7d336f/relationships?link_type_id=1`.
  The "Vocals release"/"Produced release"-style tables show several rows
  sharing the same "18 Tracks" title but backed by different release
  entities (different hrefs, different-or-absent disambiguation comments).
- `uvd-title.html` — just the 📊 unique-values dropdown for that page's
  "Title" column, BEFORE this fix: the standard/plain section shows a bare
  "A Night Worth Spending In Richmond!!" entry, a `releaselink`-glyph-
  prefixed entry with the SAME visible text, and a third plain entry for
  "A Night Worth Spending In Richmond!! (mjk5510 transfer)".
- `glyph-entity-entry.html` — one of those glyph-prefixed entries in
  isolation: `title="A Night Worth Spending In Richmond!! — marks a
  specific release, identified by its own link — not just matching
  text"`, a `span.releaselink` icon immediately before the text. Clicking
  it filtered to exactly ONE specific release's row — but nothing in the
  entry itself (same text, same tiny unlabeled icon as any other such row)
  let you tell which one without testing.

**Problem**: whenever a title/name was shared by 2+ distinct entities, the
standard section offered one of these glyph rows per distinct href, all
rendering identically apart from the icon. The user could not visually
distinguish them, and had no way to select "every row with this title"
without either checking the bare entry (misses commented variants) or
guessing which glyph row to click.

**Fix (WIP.85)**: removed these per-href glyph rows from the standard
section entirely. The existing "Entity info" section's "» name:" family
(previously only offered for entities WITH a disambiguation comment) now
covers every non-bare entity, offers exactly ONE entry per distinct name
(with the entity-type glyph shown inline, e.g. 🎵/`releaselink`), and
matches EVERY row containing that name — bare or commented — when checked.
See `ShowAllEntityData_CHANGELOG.wip.json`'s WIP.85 entry for the full
implementation breakdown (`_findCellEntityCommentParts()`'s broadened
`!ref.isBare` gate, the split ungated `name:` matching/highlighting, the
new `entityNameAnyValueCounts`/`entityNameGlyphMap` maps, and removal of
the now-dead `entityInfo`/`entityHrefCounts`/`entityEntries` aggregation).

`node --check ShowAllEntityData.user.js` passed after every edit.

---

## 2026-08-14 — /reports: extract chaban's report-change-indicator (v9.99.867)

**Snapshot**: `chaban.html` — the full `/reports` page DOM with the
third-party "MusicBrainz: Reports Statistics" userscript (by chaban)
active. Each `<li>` under a category `<h2>`/`<ul>` shows, after its report
`<a>` link:
```html
<span> <span class="report-change-indicator" style="color: green;">▼ -1 (-0.0%) (1 day ago)</span></span><span> </span>
```
Color is `green`/`red`/`grey` depending on direction. Confirmed variants
across the snapshot: with percent (`▼ -1 (-0.0%) (1 day ago)`), without
percent (`↔ 0 (1 day ago)`, on `style="display:none"` rows like
`DuplicateRelationshipsReleaseGroups`), and a "no prior baseline" shape
with no arrow/when at all (`(New: 260790 items)`, on
`RecordingTrackDifferentName`).

`applyListToTable`'s Structure J (the `reports-index` `<h2>`+`<ul>` → table
converter, `_root.querySelectorAll('h3, h2')` branch) clones every child
node of each `<li>` into the single "Report" `<td>` — so this indicator
span, when chaban's script is active, ends up living inside that same cell
alongside the report link.

**Feature (9.99.867)**: new `ColumnDataExtractor.reportChangeIndicator`
extractor, wired via `reports-index`'s page definition
(`columnExtractors: [{ sourceColumn: 'Report', extractor:
'reportChangeIndicator', syntheticColumns: ['Delta', 'When'] }]`), splits
`.report-change-indicator`'s text on a trailing `(<when> ago)` into "Delta"
(everything before) and "When" (the "ago" phrase, parens stripped) — the
"(New: … items)" shape doesn't match that pattern, so it's left whole in
Delta with When blank. Both synthetic cells get `.style.color` copied from
the source span so they match the original page's coloring. Source
"Report" cell is left untouched (matches every other extractor in this
registry). Columns are always declared for this page (per
`AskUserQuestion` decision during planning) — empty for every row when
chaban's script isn't active, exactly like every other extracted column in
this script (e.g. "Cancelled" on Events). Tooltip text added to
`_synthColTooltip()`'s `'reportChangeIndicator'` case, naming the source
userscript explicitly.

Confirmed via research that the existing `columnExtractors` pipeline
already works unmodified for `tableMode: 'multi'` pages — `reports-index`
already routes through it (Branch B of `startFetchingProcess`'s row loop,
and `renderGroupedTable()`'s single `cleanupHeaders(templateHead)` +
per-group `cloneNode(true)`) with no additional wiring needed.

`node --check ShowAllEntityData.user.js` passed after every edit.

---

## 2026-08-14 — 📊 dropdown: join-phrase entries (v9.99.868)

**Snapshots**: `join.html` (three `<bdi>` cells: " & ", " with ", and the
free-text " w/special guest " variant), `and.html` (" & " vs " and " side
by side, confirming distinct phrases must never merge), `slash.html` (four
artists joined by three " / " separators in one `<bdi>`) —
`https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f`'s
"Artist" column. Shape: `<bdi><a href="/artist/…">Name</a> <phrase>
<a href="/artist/…">Name</a></bdi>`, native MusicBrainz markup, direct
children of `<bdi>`.

**Requirement 2 (individual artist as its own dropdown entry) was already
fully implemented** — confirmed via research, not assumed: `_findCellEntityRefs()`
already enumerates every `<a href>` in a cell (never take-first), and
`isBare` (`getCleanColumnText(container) === name`) already comes out
`false` for both artists once a join-phrase text node is present, since
the whole-cell text then differs from either bare name. So
`_findCellEntityCommentParts()` → `entityNameValueCounts`/
`entityNameAnyValueCounts` → the existing "Entity info" (👤) section's
"» name: …" entries already fire independently per artist. No code change
needed for this half of the request.

**Requirement 1 (join-phrase dropdown entries) was net-new.** No existing
code walked a cell's childNodes to isolate the TEXT_NODE sitting between
two `<a>` siblings. Added:
- `_findCellJoinPhrases(cell)` (new function, next to
  `_findCellEntityCommentParts()`) — for every `<bdi>` in the cell, finds
  `<a href="/{type}/{mbid}">` DIRECT children recognized by
  `_ENTITY_TYPE_GLYPH` (same check `_findCellEntityRefs()` uses), and for
  every adjacent pair, joins+trims+whitespace-collapses the TEXT_NODE(s)
  between them into one phrase string. Deliberately scoped to the
  `<bdi><a>phrase<a></bdi>` shape only (not the reverse `<a><bdi>` nesting
  `_findCellEntityRefs()` also recognizes — no evidenced multi-entity case
  there). Phrases are free text with no fixed enum (MusicBrainz's editor
  offers suggestions, not a closed picklist — `join.html`'s "w/special
  guest" proves it) — grouped by exact literal string, never normalized,
  mirroring `release-tracks`' `_dynamicRolePhraseKey` philosophy ("two
  different phrases NEVER merge").
- New `SYN_SECTION_META.joinPhrase` ("Join phrases", 🔀) — doesn't fit
  "Entity info" (whose entries are strictly 1:1 with one entity ref) or any
  other existing section's actual scope; a join phrase is a property of the
  GAP between two entities, not an entity itself.
- `MB_UNIQ_KIND_TO_SECTION.joinphrase = 'joinPhrase'`, a `'» join phrase: '`
  label prefix in `makeValueSynItem()`, a new `joinPhraseValueCounts` Map +
  per-row Set-dedup aggregation (mirrors `entityNameValueCounts`'s own
  pattern exactly), `_sortedJoinPhraseValues` wired into both
  `openUniqDrop()` render branches and the `_hasValueEntries` gate.
- `_cellMatchesStructureMode()`'s new `joinphrase:` branch — re-derives
  from `_findCellJoinPhrases()` directly (never a fresh ad hoc query),
  mirroring `name:`/`role:`/`rel:`'s established compound-mode pattern.
- New `_highlightJoinPhraseMatch()` — unlike `name:`/`comment:`/`alias:`
  (which highlight via `highlightCrossTag()` scoped to an existing wrapping
  element), a join phrase has no wrapping element of its own: it directly
  wraps the exact already-identified Text node reference in a
  `mb-column-filter-highlight` span, rather than a regex scan over a
  shared container (which could over-match if the phrase text happened to
  also appear inside an entity's own name). Wired into the highlight
  dispatch block alongside the other compound-mode branches.
- `_structureModeLabel()`/`_structureModeTooltip()` also got `joinphrase:`
  branches for consistency with every other compound mode.

Verified by hand against all three snapshots: join.html's three variants
extract to "&", "with", "w/special guest" respectively (never merged);
and.html confirms "&" and "and" stay two distinct entries; slash.html's
four-artist/three-separator cell extracts three "/" occurrences that
Set-dedupe to one per-row count (matching every other multi-occurrence
aggregation in this dropdown), and all three get highlighted independently
when checked.

`node --check ShowAllEntityData.user.js` passed after every edit.

---

## 2026-08-14 — _findCellEntityRefs(): shared-<bdi> name bug (v9.99.869)

User caught this via a live screenshot after 9.99.868 shipped: on the
`slash.html` Artist column ("Albert Hammond / Bruce Springsteen / Loudon
Wainwright III / Taj Mahal"), the new "Join phrases" section correctly
showed "/" and "&" entries, but "Entity info" (👤) was MISSING entirely —
no per-artist "» name: …" entries at all, for any row on that table.

**Root cause**: `_findCellEntityRefs()`'s `<bdi><a>` branch (line
`const bdi = (a.parentElement && a.parentElement.tagName === 'BDI') ?
a.parentElement : ...`) assumed a `<bdi>` found this way always belongs
SOLELY to the one `<a>` being processed — true for a single-artist cell
(`<bdi><a>Name</a></bdi>`), but false when multiple joined artists share
ONE `<bdi>` (`<bdi><a>A</a> / <a>B</a> / <a>C</a></bdi>` — confirmed
exactly this shape in join.html/and.html/slash.html). For every `<a>` in
that shared bdi, `a.parentElement` IS the same bdi, so `name =
getCleanColumnText(bdi)` computed the FULL COMBINED credit string
("Albert Hammond / Bruce Springsteen / …") as every single artist's own
"name". Then `isBare: getCleanColumnText(container) === name` (container
= cell, since no `<li>`) trivially came out `true` for all of them (the
"name" literally equals the whole cell's own text) — and
`_findCellEntityCommentParts()` filters out every bare ref
(`if (ref.isBare) return;`), so `entityNameValueCounts` stayed empty for
every row on the table, and the "Entity info" section (gated on
`_sortedNameValues.length > 0`) never rendered — even though
`_findCellEntityRefs()` itself wasn't returning zero refs (confirmed
indirectly: `entityNameAnyValueCounts`, populated ungated straight off
`_findCellEntityRefs()`, would have had entries too, just never surfaced
visibly since nothing reads it independently of `_sortedNameValues`).

This bug pre-dates the join-phrase feature entirely — it's been silently
breaking "Entity info" for every joined-artist-credit cell since that
section shipped; the join.html/and.html/slash.html snapshots just happened
to be the first cells anyone actually opened the 📊 dropdown on.

**Fix**: added a `bdiShared` check — count qualifying entity-ref `<a
href>` siblings inside the resolved `parentBdi`; if more than one, scope
`name`/`nameNode` to the individual `<a>` itself instead of the whole
`<bdi>`. A `<bdi>` wrapping exactly one entity (the overwhelmingly common
case) is unaffected — `bdiShared` is `false`, so `name`/`nameNode`
resolution is byte-for-byte identical to before. Also fixes
`_highlightUniqEntityMatches()` (the `MB_UNIQ_ENTITY_HREF_PREFIX`
per-entity-glyph highlight path, which reuses `ref.nameNode`) — previously
it would have highlighted the ENTIRE joined credit string when checking
just one artist's href-based entry on such a cell, not just that artist's
own name.

Verified by hand against all three snapshots: join.html's 2-artist "&"/
"with" rows and 2-artist free-text "w/special guest" row, and.html's "&"
vs "and" rows, and slash.html's 4-artist "/" row all now produce one
correctly-isolated, non-bare "» artist name: …" Entity-info entry per
artist. Single-artist bare rows (the 586-count plain "Bruce Springsteen"
rows) remain correctly excluded from Entity info (still `isBare: true`,
unchanged) — matching the section's existing "don't duplicate a
whole-cell entry" design intent.

`node --check ShowAllEntityData.user.js` passed after every edit.

---

## 2026-08-14 — 📊 dropdown: "Name variations" section (v9.99.870)

**Snapshot**: `nv.org` — jesus2099's "MusicBrainz: Nuclear Tags"-family
name-variation marker: `<span class="name-variation"><a href="..."
title="RealName – SortName[, optionally with (disambiguation)]">Displayed
Text</a></span>`, wrapping an artist link whose credited display name
differs from the entity's real/canonical name. Separator confirmed via
hexdump: U+2013 EN DASH surrounded by single spaces (`" – "`), not a plain
hyphen. Examples: `"山崎千裕 – Yamazaki, Chihiro"` (displayed "Chihiro
Yamazaki"), `"ROUTE14band – ROUTE14band"` (both halves identical),
`"Riders Against the Storm – Riders Against the Storm (husband/wife hip
hop duo)"`, `"Farzad Golpayegani – Golpayegani, Farzad"`, `"Bernie Worrell
– Worrell, Bernie (keyboardist, composer and record producer)"`.

**Requirement**: offer each name-variation's title-derived data in its own
dropdown section — the full "Real – Sort" string, AND each dash-split half
on its own — prefixed "» name variation: ".

**Key research finding before implementing**: neither `_findCellEntityRefs()`
nor `_findCellJoinPhrases()` (both recently touched this session) find
ANYTHING for this exact shape. `<span class="name-variation">` sits
directly between `<bdi>` and `<a>` — `_findCellEntityRefs()`'s bdi
resolution requires `a.parentElement` to literally BE a `<bdi>` (it's a
`<span>` here) or `<a>` to contain a nested `<bdi>` (it doesn't) — so it
returns `[]`, and `_findCellJoinPhrases()`'s direct-child-of-`<bdi>` check
also fails for the same reason (the `<bdi>`'s direct children are
`<span>`s, not `<a>`s). **This means "Entity info" and "Join phrases" are
currently BOTH blind to jesus2099 name-variation-wrapped artist credits**
— a related-but-separate gap from what this session implemented, flagged
to the user as a possible follow-up rather than fixed here (would need
its own bdi-resolution extension, out of scope for "add a name-variation
section").

**Implementation**: new `_findCellNameVariations(cell)` (deliberately
independent of the two functions above — walks `span.name-variation
a[href][title]` directly, mirroring `_findNameVariationElements()`'s own
directness), splitting `title` on the confirmed `" – "` separator into
`{full, real, sort}`. New `SYN_SECTION_META.nameVariation` ("Name
variations", 🪪), `MB_UNIQ_KIND_TO_SECTION.namevariation`, full
aggregation/render/matching pipeline mirroring `joinphrase`'s exact
footprint from the previous session (Map, per-row Set-dedup, sorted array,
`_hasValueEntries`, two render branches, `_cellMatchesStructureMode()`
branch, `_structureModeLabel()`/`_structureModeTooltip()` entries).

**Highlighting design note (important, nearly got this wrong)**: the
matched value (full/real/sort) lives ONLY in the `title` attribute — it
never appears as cell TEXT, so there's nothing to substring-match/wrap via
the normal `highlightCrossTag()`-on-visible-text pattern. Considered
directly adding the highlight class to (or wrapping) the existing
`<span class="name-variation">`/`<a>` element — traced this against
`testRowMatch()`'s highlight-reset step (`row.querySelectorAll(
'.mb-column-filter-highlight').forEach(n => n.replaceWith(
document.createTextNode(n.textContent)))`) and confirmed it would
DESTROY the `<a href>` link entirely on the very next filter cycle
(flattens the whole matched element — link and all — to plain text).
Fixed by mirroring `_highlightNameVariationMatch()`'s (the existing binary
flag's) own established technique instead: build a regex from the
element's OWN visible text (e.g. "Chihiro Yamazaki") and run it through
`highlightCrossTag()`, which only ever wraps TEXT NODES, never the `<a>`
itself — safe against the reset step, and semantically reads as "this
credited name is highlighted because its own title matched."

`node --check ShowAllEntityData.user.js` passed after every edit.

---

## 2026-08-14 — Follow-up closed: Entity info/Join phrases now see jesus2099 wraps (v9.99.871)

Closes the follow-up flagged in the previous entry. User asked for a
concrete example before agreeing to fix it — walked through
`debug/nv.org`'s two "+"-joined, both-name-variation-wrapped artists,
showing: (a) "Join phrases" found no "+" entry for that row, (b) "Entity
info" found zero per-artist entries for either artist, and (c) the
*displayed* credited name ("Chihiro Yamazaki") had no extraction path
anywhere — the "Name variations" section only exposes the tooltip-derived
`real`/`sort` strings ("山崎千裕"/"Yamazaki, Chihiro"), never the display
text. User confirmed they wanted it fixed.

**Fix**: both `_findCellEntityRefs()` and `_findCellJoinPhrases()` now
walk through an optional `<span class="name-variation">` sitting directly
between `<bdi>` and `<a>` before doing their existing bdi-resolution
(`_findCellEntityRefs()`) / direct-child-anchor detection
(`_findCellJoinPhrases()`'s `isEntityAnchor()`). Confirmed via trace: for
`_findCellEntityRefs()`, `nameVariationSpan` is resolved once and reused
for both `bdiHost` (walk-through) and `nameNode` (still preferring the
span for highlighting, unchanged from before) — the existing `bdiShared`
sibling-count check needed NO change at all, since
`parentBdi.querySelectorAll('a[href]')` is already a descendant selector
that finds `<a>`s through span wrappers once `parentBdi` itself resolves
correctly. For `_findCellJoinPhrases()`, `isEntityAnchor()` gained a
second branch recognizing `<span class="name-variation">` wrapping
exactly one qualifying `<a>` as a boundary marker equivalent to a bare
`<a>` — the `entityIdx`/`between`-slicing logic downstream needed no
change, since it operates purely on whatever indices `isEntityAnchor`
flags.

No changes needed anywhere else — `_findCellEntityCommentParts()`,
`_highlightJoinPhraseMatch()`, `_highlightEntityCommentPartMatch()`,
`_highlightUniqEntityMatches()`, and all of `openUniqDrop()`'s
aggregation/rendering already re-derive from these two functions' output.

`node --check ShowAllEntityData.user.js` passed after every edit.

---

## 2026-08-14 — Split "Entity info" into per-type sections (v9.99.872)

User request: split the flat "Entity info" (👤) section — one collapsible
list mixing every "» artist name:"/"» event name:"/"» place name:"/"»
area name:"/"comment:"/"alias:" entry together — into one independently-
collapsible sub-section per entity type, plus separate comment/alias
sections. Requested each sub-section header show the same type-specific
glyph already shown per entry (e.g. the artist-icon, not a generic emoji).

**Key research finding**: `getOrCreateSynSection()` (the shared renderer
for every top-level section: Structure, Flags, Credit details, Roles, …)
only supported plain emoji text for section headers
(`iconGlyph.textContent = meta.glyph`) — no existing support for the
native MusicBrainz entity-type icon CSS classes (`artistlink`/`eventlink`/
etc.) `makeValueSynItem()`'s own per-entry glyph marker already uses.
Extended it with an optional `markerClass` field on `SYN_SECTION_META`
entries: when present, applies that CSS class (plus
`_guardGlyphAgainstEmptySelectorHiding()`, the same ad-blocker-hiding
guard the per-entry markers already get) instead of setting `.textContent`
to an emoji. Confirmed via grep that these marker classes (`.artistlink`
etc.) aren't defined anywhere in this userscript's own injected CSS — they
rely entirely on musicbrainz.org's own native page stylesheet, same as
the already-working per-entry markers, so no new CSS needed here either.

**Section keys**: one new `SYN_SECTION_META` entry per
`_ENTITY_TYPE_GLYPH` key (a small, fixed set of 9: artist, label, work,
release-group, release, recording, event, place, area — confirmed the
complete set already exercised by "» name:" entries via
`ENTITY_NAME_TYPE_SORT_ORDER`), named `entity_artist`/`entity_event`/etc.,
plus `entity_other` (fallback for an unrecognized/missing entityType,
mirroring `makeValueSynItem`'s own generic `'» name: '` fallback) and
`entityComment`/`entityAlias`. The old flat `entity` key was removed
entirely (nothing else referenced it).

**Routing**: `makeValueSynItem()`'s `sectionKey` resolution gained a new
`kind === 'name'` branch — computes `` `entity_${entityType}` `` (or falls
back to `entity_other`) — modeled directly on the existing `arttype`/
`artcomment` → `_caaOrEaaColName`-based dynamic-section precedent right
above it. `comment`/`alias` stayed on the static `MB_UNIQ_KIND_TO_SECTION`
map, just pointed at the new `entityComment`/`entityAlias` keys instead of
the removed `entity` key.

**No changes needed** to: `_sortedNameValues`'s existing type-then-alpha
sort (already produces entries in the right per-type groupings/order,
`ENTITY_NAME_TYPE_SORT_ORDER`), the two `_sortedNameValues.forEach(...)`
render call sites (already pass `entityType` as the 5th arg to
`makeValueSynItem`), section-order logic (`getOrCreateSynSection` already
inserts purely "first key requested wins" — new per-type sections
naturally appear in `ENTITY_NAME_TYPE_SORT_ORDER` priority as a side
effect of the pre-sorted array), collapse-state persistence
(`MB_UNIQ_SECTION_COLLAPSE_KEY`, plain string-keyed object, zero
validation against a fixed key enum — new keys "just work"), or
`_applySynBoxQuickFilter()` (iterates `_synSections` generically). Entry
labels/filtering/highlighting inside each new section are byte-for-byte
unchanged from before the split.

`node --check ShowAllEntityData.user.js` passed after every edit.

**Follow-up fix (same v9.99.872, not yet committed when found)**: user
screenshotted the new `entity_*` section headers (e.g. "Entity info -
Release name") and the entity-type glyph rendered visibly cut off/
mis-sized. Root cause: `.mb-uniq-section-hdr` is `display: flex` (confirmed
via grep), and the new marker-class glyph span is a DIRECT CHILD of it —
the EXACT same "flex-item display blockification strips the native glyph's
height" bug `_initColHeaderGlyph()`'s own JSDoc already diagnosed and fixed
for `.mb-col-hdr-flex` (also a flex container) when injecting `worklink`/
`eventlink`/`placelink` icons into release-tracks column headers. Confirmed
`.mb-col-uniq-item` (the per-entry row, where these same marker classes
already render correctly) is NOT a flex container — explaining why only
the NEW section-header usage hit this, not the pre-existing per-entry
usage. Fix: added `iconGlyph.style.height = '14px'` (matching
`_initColHeaderGlyph`'s own established value) when `meta.markerClass` is
set — mirrors that fix precisely rather than inventing a new sizing value.
No margin needed (unlike that fix) since `.mb-uniq-section-hdr`'s own
`gap: 5px` already spaces every header child.

`node --check ShowAllEntityData.user.js` passed after this edit too.

---

## 2026-08-14 — Format/Country-Date/Country/Tracks/Catalog# sections (v9.99.873)

**Snapshots**: `format.html` (`"2×12\" Vinyl"`, `"12\" Vinyl"`, `"7\"
Vinyl"`, `"10\" Acetate"`), `country-date.html` (three release events:
full date+country+weekday; year-only+country, no weekday; year-only, no
country at all — `<span class="release-country no-country">`),
`country.html` (`"United States (US)"` — confirmed byte-for-byte identical
to what `splitCountryDate()` itself synthesizes for its own "Country"
output column, i.e. NOT a separate native column), `tracks.html` (`"7"`,
`"5 + 6"`), `catalog.html` (`"S CBS 86061"`, `"CBS 32542"`, and a row with
BOTH `"32210"` and `"CBS 32210"` as separate `<li>`s).

Five new sections added, all following the exact `_findCellXxx()` →
`SYN_SECTION_META` → `MB_UNIQ_KIND_TO_SECTION` → `makeValueSynItem` →
`_cellMatchesStructureMode` → (optional highlight) →
`_structureModeLabel`/`_structureModeTooltip` pipeline established
earlier this session for Join phrases/Name variations/the Entity-info
split:

- **Format info** (💿) — `_findCellFormatParts()` mirrors the EXISTING
  `extractFormatTypes()` extractor's own documented grammar exactly
  (`ColumnDataExtractor`, ~line 3259: `^\d+[x×]` count prefix, `" + "`-
  joined groups) rather than inventing a new one. Confirmed with the user
  before implementing: the "<n>x<type>" meta entry (e.g. "2xVinyl") is
  ONE ENTRY PER distinct combo actually present (only for count>1 groups)
  — not a simple yes/no flag — since checked entries within a column OR
  together, so separate size/count checkboxes can't express an AND; only
  a dedicated combo entry can filter an exact count+type combination.
- **Release events** (📅, "Country/Date") / **Country details** (🌍, the
  synthetic "Country" column) — `_findCellReleaseEventParts()`/
  `_findCellCountryNameParts()` mirror `splitCountryDate()`'s own DOM walk
  (`.release-event` → `.release-country`/`.release-date`, including its
  `.no-country` handling and its `.mb-day-of-week` stripping — here
  surfaced as its own `weekday` field instead of discarded). Confirmed
  with the user: the "Country" bullet's mention of "date expression,
  weekday" was a copy-paste artifact from the Country/Date bullet above
  it (debug/country.html has no date data at all) — dropped. The two
  extraction functions naturally never cross-fire on each other's column
  (Country/Date's bare abbr text like "NL" never matches the "Name (XX)"
  pattern `_findCellCountryNameParts()` requires), so no explicit gating
  was needed to keep them apart. Country-code entries show the SAME
  native flag icon class the source markup uses as their glyph marker —
  required extending `makeValueSynItem`'s existing `kind === 'name'`-only
  marker block to also fire for `revcountry`/`countrycode`.
- **Tracks info** (🎵) — `_findCellTracksPerMedium()` mirrors the
  EXISTING `sumTracks()` extractor's own `text.split('+')` grammar. The
  "multiple mediums" meta entry (confirmed with the user) IS a simple
  binary flag here (unlike Format's parameterized combo) since there's no
  further "type" dimension to parameterize by — routed via
  `MB_UNIQ_MODE_TO_SECTION`/`makeSynItem`, mirroring the existing
  `title-mismatch`/`name-variation` flags exactly.
- **Catalog info** (🏷️) — `_findCellCatalogParts()` reuses
  `_findCellListItems()` (CLAUDE.md's own explicit warning against a
  fresh ad hoc `ul > li` query at a new call site — this has regressed
  before) rather than treating the cell as flat text, since
  `renderMultiRowCell: [..., 'Catalog#']` always list-wraps it. TWO
  independent meta flags ("has prefix" / "no prefix"), not one toggle —
  confirmed necessary by `catalog.html`'s own third row, whose list
  contains BOTH a prefixed (`"CBS 32210"`) and an unprefixed (`"32210"`)
  item as separate `<li>`s, so a single row can (and does) match both
  flags simultaneously.

**Safety consideration new to this batch**: Format/Tracks/Catalog# parse
plain free text with NO CSS-class safety net (unlike every other
`_findCellXxx()` added this session, which are all safely scoped by class
presence) — a `Title`/`Comment` cell could coincidentally contain a `+` or
a `\d+x` pattern. Gated all three by column header name (`_colHeaderName`,
mirroring the existing `isTitleCol` computation) at the `openUniqDrop()`
call site, so their extraction functions are simply never invoked outside
their own column. Country/Date and Country needed no such gating (safely
scoped by `.release-event`/`.release-country` class presence).

**Highlighting decision**: only `revcountry`/`countrycode` got a dedicated
highlight function (`_highlightCountryMatch`, handling both) — their
matched value is genuinely the visible text (a literal substring of the
displayed country code/name). Every other new kind (size, count, combo,
date, weekday, tracks-per-medium, catalog prefix) is derived from cell-
wide or per-`<li>` free text with no single exact sub-node worth
isolating — deliberately left with no highlight dispatch branch, matching
the established "operates on pure text/state with no single corresponding
element, so it gets no highlight" precedent already documented for the
structural (empty/single/collapsed/…) modes.

`_findCellReleaseEventParts()`/`_findCellCountryNameParts()` needed a
small revision after first being written: added `abbrEl`/`a` element
references to their returned objects specifically so the highlight
function could re-derive its target from the SAME extraction function
(never a fresh independent DOM query at the highlight call site — this
session's own repeatedly-reinforced precedent).

`node --check ShowAllEntityData.user.js` passed after every edit.

**Follow-up round (same v9.99.873, not yet committed when found)** — user
reported via screenshots after trying the feature live:

1. **Split combined sections further.** "Country details" → "Country name
   details" + "Country code details"; "Release events" → "Release events
   - country"/"- date"/"- weekday". Mechanical: each kind already had its
   own extraction/aggregation, just needed its own `SYN_SECTION_META` key
   instead of sharing one — no other code touched.

2. **Format: add a plain "type" entry** (e.g. "Vinyl", "Acetate") that
   matches regardless of size — `_findCellFormatParts()` already extracted
   `type` per group, it just was never surfaced as its own kind (`size`/
   `count`/`combo` were, `type` wasn't). New `formattype` kind, same
   pipeline as the other three. User's request literally said "Tracks"
   column but described Vinyl/Acetate/size-specifications, which are
   unambiguously Format concepts (confirmed by debug/format.html) — very
   likely a slip given how many columns this session covers; implemented
   under Format and flagged the assumption rather than blocking on it.

3. **Highlighting was broken for every new structural entry except
   country CODE.** Root cause, traced per-column:
   - `countryname:` — simply never wired into `_highlightCountryMatch()`
     at all (only `revcountry:`/`countrycode:` were) despite having just
     as valid a target (the same anchor element, matching the "Full Name"
     half instead of the "(XX)" half). Fixed by extending that one
     function.
   - `catalogprefix:` — needed a NEW highlight function, which needed
     `_findCellCatalogParts()` to be revised to also carry an element
     reference (`el`, the `.catalog-number` span) — it only returned
     `{prefix, number}` before, no node to highlight.
   - `trackspermedium:` / `formatsize:`/`formatcount:`/`formatcombo:`/
     `formattype:` — these were DELIBERATELY left with no highlight
     dispatch branch in the original design, reasoning "derived from
     cell-wide free text with no single exact sub-node worth isolating."
     That reasoning was wrong for these five: Tracks/Format cells ARE
     plain flat text with no wrapper, but a precise, escaped,
     word-boundary-anchored regex applied directly to the whole cell
     (mirroring `_highlightCreditValueMatch()`'s own established
     literal-escape pattern for its `attr:`/`task:`/etc. branches, just
     without a sentinel-class element to scope to first) works safely,
     since the cell's ENTIRE text content is nothing but the structured
     data being parsed — no unrelated text for a bare regex to
     accidentally cross-match. Two new functions:
     `_highlightTracksPerMediumMatch()` (word-boundary around the exact
     number) and `_highlightFormatMatch()` (handles all four Format
     kinds: `formatsize`/`formattype` are literal-word matches;
     `formatcount`/`formatcombo` deliberately highlight ONLY the leading
     "N×"/"Nx" count-prefix token, not a bare number — a bare "2" could
     collide with the "2" inside an unrelated "12"", so the regex
     specifically requires the digit to be immediately followed by `x`/`×`
     — `formatcombo` parses its own value string, e.g. "2xVinyl", back
     apart to recover just the count for this purpose, matching exactly
     what the user reported missing ("the '2x' are not highlighted").

`node --check ShowAllEntityData.user.js` passed after every edit in this
follow-up round too.

**Second follow-up round (still v9.99.873, not yet committed when found)**
— user reported 3 more issues via screenshots after trying the round-1
fixes live:

1. **Catalog#: `"[none]"` (MusicBrainz's own literal placeholder for "no
   catalog number set on this medium") had no dedicated entry.**
   `_findCellCatalogParts()`'s grammar (`^(?:(.+?)\s+)?(\d+)$`) simply
   never matched it — it silently produced zero parts for that `<li>`, not
   an error, so this was invisible until the user pointed at a specific
   cell. Added a new shape check ahead of the numeric regex
   (`t === '[none]'` → `{prefix: null, number: null, none: true, el}`),
   a third independent counter `catalogNoneCount` (a row's list can mix
   `"[none]"` items with real prefixed/unprefixed ones, so this is NOT
   mutually exclusive with the other two flags), a `catalog-none` mode in
   `MB_UNIQ_MODE_TO_SECTION`/`_cellMatchesStructureMode`/both render
   branches/`_structureModeLabel`/`_structureModeTooltip`, and a new
   `_highlightCatalogNoneMatch()` (mirrors `_highlightCatalogPrefixMatch()`'s
   shape, highlights the literal `[none]` text via the same `el` field).
   **Self-caught bug while doing this**: `"[none]"` items also have
   `prefix: null`, exactly like a genuine unprefixed catalog NUMBER — the
   existing `catalog-no-prefix` aggregation/matching would have silently
   double-counted them as "no prefix" entries. Fixed by adding `&& !p.none`
   to both the aggregation check and the `_cellMatchesStructureMode`
   branch for `catalog-no-prefix` before it ever shipped.

2. **Country/Date: `revdate:`/`revweekday:` highlighting was designed out
   for the wrong reason.** Screenshot showed "date: 1973-06" and "weekday:
   Fri" checked with zero highlighting in the rows, despite the filter
   itself working (rows correctly narrowed). Root cause:
   `_findCellReleaseEventParts()` only ever captured `abbrEl` (the country
   code's own element) — `dateText`/`weekday` were read as plain strings
   with NO element reference kept, so there was nothing for a highlight
   function to target. This is the exact same class of mistake just fixed
   in round 1 for Tracks/Format ("cell-wide text has no single sub-node
   worth isolating, skip highlighting") recurring for a different pair of
   kinds — except here an exact element WAS available (`.release-date`
   itself, and the nested `.mb-day-of-week` span for weekday) and was just
   never threaded through. Fixed: extended `_findCellReleaseEventParts()`
   to also return `dateSpanEl` (the `.release-date` span itself — matching
   must run against the LIVE span, not the detached clone used to compute
   `dateText`, since the clone has already had `.mb-day-of-week` stripped
   out and would throw off `highlightCrossTag`'s text-node walk) and
   `dowEl` (the `.mb-day-of-week` span). Verified against
   `debug/country-date.html`'s markup that date text always precedes the
   nested weekday span in DOM order (`<span class="release-date">1975-08-25<span
   class="mb-day-of-week">Mon</span></span>`), so `highlightCrossTag`
   walking `dateSpanEl`'s full concatenated text ("1975-08-25Mon") still
   matches only the date portion correctly — no interleaving risk. New
   `_highlightReleaseEventMatch(cell, mode)` function (kept separate from
   `_highlightCountryMatch()` — different concept, date/weekday vs.
   country), wired into the dispatch chain alongside the existing
   `revcountry:`/`countryname:`/`countrycode:` branch.

3. **Format info badge alignment was a session-wide gap, not
   Format-specific.** Screenshot showed count badges in the "Format info"
   section looking center- rather than right-aligned relative to each
   other. Root cause: `panelBadgeChWidth` (the shared badge width in `ch`
   units computed once via `Math.max(...)` over every possible count value
   across ALL sections in the panel, so every "(N)" badge right-aligns
   consistently against the SAME width) was missing numerous
   `*ValueCounts` Maps/counters — not just the newest Format/Release-events/
   Country/Tracks/Catalog# batch, but also `joinPhraseValueCounts` and
   `nameVariationValueCounts` from earlier this session. None of these
   have a broader "any"/superset map the way entity names do
   (`entityNameAnyValueCounts` already covers those), so their own raw
   values are exactly what ends up on a badge — omitting them from the
   `Math.max(...)` call left the shared width silently too narrow for any
   section whose digit counts happened to exceed whatever the width WAS
   computed from. This wasn't literally "center-aligned" (the CSS itself
   right-aligns correctly) — it was every OTHER section's badges sized to
   a too-narrow shared width while Format's own values needed more room,
   making Format's column look visually different/misaligned relative to
   the rest of the panel. Fixed comprehensively: audited every
   `*ValueCounts` Map and standalone counter added this entire session and
   added every one missing from the `Math.max(...)` computation in one
   edit, rather than patching in only the Format-specific ones.

`node --check ShowAllEntityData.user.js` passed after every edit in this
second follow-up round.

## 2026-08-14 — report-detail extractMainColumn rollout + report-multiple-linked mismatch (v9.99.879/880)

- Added `extractMainColumn: ['Release', 'Release group', 'Recording', 'Label',
  'Artist', 'Event', 'Place', 'Series', 'Work', 'Collaborator']` to
  `report-detail`'s features (v9.99.879) so the "MB-Name"/"Comment"/
  "MB-Primary alias" split — previously only wired up for the
  `report-multiple-linked` family (e.g. ISRCsWithManyRecordings) — also
  fires on ordinary `/report/<Name>` pages whose table has one of these
  columns.
- `a.html` (/report/ArtistsWithMultipleOccurrencesInArtistCredits?filter=0):
  flat table, 2 native columns (Artist, Type), one row per artist — same
  shape as `report_filter0.html` above, NOT the grouped/colspan shape
  `report-multiple-linked` exists for. Its URL nonetheless matches that page
  type's `\w+With(?:Multiple|Many)\w+$` regex (`Artists` + `With` +
  `Multiple` + `OccurrencesInArtistCredits`), so
  `_reportMultipleLinkedMainColumnName` derived "Occurrences In Artist
  Credit" from the URL suffix instead of the real header ("Artist" — the
  URL PREFIX here, not the suffix), leaving `mainColIdx` at -1 and every
  MB-Name/Comment/MB-Primary-alias cell empty despite the headers being
  injected (header injection is gated only on `extractMainColumn` being
  configured, not on `mainColIdx` actually resolving). Fixed (v9.99.880) by
  excluding this one report path from `report-multiple-linked`'s `match()`
  so it falls through to `report-detail`, which already has 'Artist' in its
  new candidate list.

## 2026-08-14 — PlacesWithoutCoordinates "Area" column not extracted (v9.99.881)

- `coordinates.html` (/report/PlacesWithoutCoordinates?filter=0): 4 native
  columns (Place, Address, Area, "Search for coordinates"). Unlike
  AnnotationsPlaces (see `## 2026-07-01` entry above, `debug/place.html`),
  the 'Place' cell here is JUST `<a href="/place/...">name</a>` — no
  embedded "in <area chain>" text. The district/region/country chain
  instead lives entirely in the separate 'Area' column, same per-anchor
  shape `splitArea` already handles elsewhere (first non-flag '/area/' link
  = locality, subsequent non-flag links = region, flag-wrapped link =
  country; e.g. `<a>Songpa District</a>, <span class="area-icon">…</span>
  <a>Seoul</a>, <span class="flag flag-KR"><a>South Korea</a></span>`).
  report-detail's `columnExtractors` had no entry reading 'Area' at all, so
  Locality/Region/Country stayed empty for every row even though the data
  was right there in the native table.
- Fixed by adding `{ sourceColumn: 'Area', extractor: 'splitArea',
  syntheticColumns: ['MB-Locality', 'MB-Region', 'MB-Country'] }`. Named
  'MB-Country' instead of the usual bare 'Country' (which is what every
  OTHER page definition's own splitArea/'Area' entry uses, e.g. around line
  13582/13623/13921/13996/14086/14124/14232/14487) because
  PlacesWithoutCoordinates has BOTH 'Place' and 'Area' as real columns at
  once — report-detail's existing 'Place' entry already claims
  'Locality'/'Region'/'Country'. Row-level cell appending
  (`extractedSyntheticCells.forEach` → unconditional `newRow.appendChild`)
  has no dedup against already-injected headers the way header injection
  does — two *resolved* extractor entries emitting the same synthetic
  column name would each unconditionally append their own `<td>` per row,
  so the row would carry more cells than the (deduped) header row has
  columns, silently shifting every subsequent column's data one or more
  cells to the left. This is a general landmine for report-detail
  specifically (it's the one page type deliberately column-agnostic enough
  that two normally-mutually-exclusive extractor entries CAN both resolve
  on the same page) — any future report-detail columnExtractors addition
  must check its synthetic column names against every other entry already
  in that array, not just the ones it superficially resembles.

## 2026-08-14 — "Event" column dropdown missing "date:" entries (v9.99.882)

- `data-missing.html` (single `<td>` snapshot from /user/vzell/tag/england
  and /user/vzell/tag/rescheduled — user-tag-value pageType, 'Events'
  entityFeatures): `<a href="/event/…"><bdi>2024‐05‐25: Orange Vélodrome,
  Marseille, France</bdi></a> (2024-05-25) <span class="cancelled">(
  cancelled)</span>`. Note the link's OWN text repeats the date using
  U+2010 HYPHEN ("2024‐05‐25"), while the trailing bare parenthetical after
  the link uses plain ASCII hyphens ("2024-05-25") — the two must not be
  confused; only the ASCII trailing one is "the date" for filtering/
  highlighting purposes (matches `Name_Date_Comment`'s own extraction into
  the synthetic "Date" column, ShowAllEntityData.user.js:4098).
- Root cause: `openUniqDrop()`'s "date:" dropdown entries were fed
  exclusively by `dateValueCounts`, itself fed exclusively by
  `cell.querySelectorAll('.mb-credit-date')` — a sentinel span injected
  only by `_wrapDateAnnotationsInText()`, itself only ever called from the
  AR-credit relationship cell builders (release-tracks-style credits like
  "Producer (on 1988-04-27)"). A plain native "Event" cell on a tag-listing
  page never passes through those builders, so its trailing "(date)" text
  was never wrapped in that sentinel and never counted.
- Fixed by adding a second, independent pair mirroring the "name:"/
  "comment:" family's own native-markup-parsing precedent
  (`_findCellEntityCommentParts()`) rather than trying to extend the
  sentinel-based mechanism: `_findCellEventDateParts(cell)` (near
  `_findCellCatalogParts`) walks the cell's own childNodes for the bare
  trailing `"(YYYY-MM-DD)"` text node right after the entity `<a>` link
  (reusing `_parseBareParenDate()`'s existing regex — the same one
  "Recorded at event" already uses on release-tracks — rather than a third
  copy of it), feeding a new `eventDateValueCounts` Map, gated to the
  "Event" column by name (`isEventCol`, mirrors `isTracksCol`/
  `isCatalogCol`'s own column-name gating — this is plain free-text
  parsing with no CSS-class safety net, unlike the sentinel-based one).
  Wired into `_cellMatchesStructureMode()` (`eventdate:` compound mode) and
  a new cell-wide word-boundary highlight (`_highlightEventDateMatch()`,
  mirrors `_highlightTracksPerMediumMatch()`'s own "no wrapper element to
  scope to" reasoning) exactly like every other `makeValueSynItem()` kind.
  Routed into its own new "Event info" section (`SYN_SECTION_META.eventInfo`)
  rather than reusing "Credit info" (where the sentinel-based "date:" kind
  lives) — an Event cell's date isn't a credit, and the two Maps/kinds
  ('date' vs 'eventdate') must stay fully independent since they're fed by
  completely different extraction mechanisms.

## 2026-08-16 — "Event info" split into date/cancelled, entity-events cancelled section (v9.99.886)

- `entity-event.html` (`place-events` pageType final render): confirms the
  "Event" column's `<a href="/event/…"><bdi>…</bdi></a> <span
  class="cancelled">(<bdi>cancelled</bdi>)</span>` shape — no trailing
  bare "(YYYY-MM-DD)" text here (unlike `tag-value`/`user-tag-value`
  below), since `area-events`/`place-events`/`artist-events` all have a
  SEPARATE native "Date" column instead.
- `cancelled.html` (`/user/vzell/tag/cancelled`, `user-tag-value`
  pageType) and `tag-2024.html` (`/tag/2024`, `tag-value` pageType): both
  confirm the "Events" group's "Event" cell carries BOTH the trailing bare
  date AND the `span.cancelled` marker in the same cell: `<a…>…</a>
  (2024-05-25)<!-- --> <span class="cancelled">(<bdi>cancelled</bdi>)
  </span>` — the pre-existing `_findCellEventDateParts()`/`eventdate:`
  machinery and the new cancelled-marker extraction below coexist without
  conflict since they parse different parts of the same cell.
- Added `_findCellEventCancelled(cell)` (near `_findCellTagCount`),
  mirroring `ColumnDataExtractor.cancelledEvent`'s own
  `sourceCell.querySelector('span.cancelled')` extraction exactly, so both
  agree on the same shape.
- Gating this to ONLY the 5 requested page types
  (`area-events`/`place-events`/`artist-events` → new "Entity info - Event
  cancelled" section; `tag-value`/`user-tag-value` → new "Event info -
  Event cancelled" section) needed a DIFFERENT mechanism than
  `isTagEntityCol` (v9.99.885)'s `activeColumnExtractors` lookup:
  `tag-value`/`user-tag-value` are `tableMode: 'multi'`, and
  `activeColumnExtractors` gets REASSIGNED per group during the multi-table
  fetch loop, so by the time `openUniqDrop()` runs it only reflects
  whichever entity-kind group was processed LAST — unreliable for
  per-table gating on these two page types specifically. Used
  `activeDefinition.type` instead (page-load-scoped, never reassigned
  per-group, confirmed by grepping every `activeDefinition =` assignment
  site) combined with the pre-existing `isEventCol` (a per-table,
  DOM-derived column-name check, already correct on multi-table pages
  since it reads directly from the currently-open table's own thead).
  Two kind strings ('entitycancelled'/'eventcancelled', chosen once at
  collection time from `activeDefinition.type` into `_eventCancelledKind`)
  route to the two different sections via a static `MB_UNIQ_KIND_TO_SECTION`
  lookup, sharing one Map/extraction/highlight function — deliberately NOT
  using the dynamic per-value routing precedent (`name`/`arttype`) since
  which section applies is decided once per page load, not per matched
  value.
- Deliberately did NOT extend this to the other page types that also carry
  a `cancelledEvent` extractor on their own "Event" column
  (`user-ratings`/`user-ratings-type`/`user-tag-value-entity`/
  `collections-releases`/`search`/`series-releases`) — only the 5 page
  types actually requested get the new sections; the others' dropdown
  behavior is unchanged.
- Renamed `SYN_SECTION_META.eventInfo`'s label from "Event info" to "Event
  info - Event date", and the `eventdate` kind's `makeValueSynItem()` label
  prefix from `'» date: '` to `'» event date: '`, to disambiguate now that
  the sibling "Event info - Event cancelled" section exists. Left
  `revdate` (the UNRELATED "Release events - date" family, release
  country/date/weekday) untouched — it keeps its own separate `'» date: '`
  prefix; the two must not be confused despite the similar name.

## 2026-08-18 — "Country/Date" (show N more) release-event expansion (v9.99.895)

- `show-more-cell.html` — an isolated "Country/Date" `<td>`'s inner `<ul
  class="release-events abbreviated">`: only 2 leading `<li
  class="release-event">` + `<li class="show-all"><a …>(show 204
  more)</a></li>` + 1 trailing (pinned) `<li class="release-event">`
  actually render — 204 of 207 total release events are genuinely absent
  from the `<li>` markup, not just CSS-hidden.
- `show-more.html` — the full `artist-releases` page (BoDeans) this cell
  came from. Confirms the missing data is NOT fetched via AJAX on click:
  every `.release-events-container` div is immediately preceded by a
  sibling `<script type="application/json">{"events":[...]}</script>`
  containing the COMPLETE list (verified: 207 entries in the JSON for the
  204-more cell, `{country:{gid,name,iso_3166_1_codes,primary_code,
  country_code,…}, date:{year,month,day}}` per entry) — React reads this
  same JSON on mount and simply limits how many `<li>`s it renders;
  clicking "(show N more)" is a pure client-side re-render, not a network
  round-trip.
- This is exactly the shape `expandShowAllCells()`/`SHOW_ALL_JSON_HANDLERS`
  (added earlier for Place-Events "Artists"/Artist-Works "Recording
  artists"/"Attributes"/"ISWC" columns) already generalizes over — it was
  simply missing a handler for the `"events"` top-level JSON key. Added
  one: builds `<li aria-label="Release event" class="release-event"><span
  class="flag flag-{code} release-country"><a
  href="/area/{gid}"><abbr title="{name}">{code}</abbr></a></span><span
  class="release-date">{YYYY[-MM[-DD]]}</span></li>`, verified byte-for-
  byte identical to the native markup for real entries via a throwaway
  Node script with a minimal fake-DOM shim (no jsdom in this environment)
  against `show-more.html`'s own embedded JSON — entries 0/1/206 matched
  exactly, and the before(2)+after(1)+missing(204)=207 count matched
  "(show 204 more)" precisely. Also verified the `[Worldwide]`/`"XW"`
  pseudo-country case (present natively elsewhere in the same snapshot,
  `<span class="flag flag-XW release-country">…<abbr
  title="[Worldwide]">XW</abbr>…`) and partial dates (year-only,
  year+month) render correctly.
- Deliberately did NOT reproduce the `<span class="mb-day-of-week …">`
  weekday decoration seen in the LIVE-page snapshot — confirmed via
  `splitCountryDate`'s own existing comment that this is injected by the
  chaban companion userscript client-side on the live page only, never
  present in raw fetched HTML. A reconstructed `<li>` on a *fetched* page
  correctly has no weekday span either way, matching what that page's own
  native (non-truncated) `<li>`s would look like without chaban installed.
- Unlike every other `SHOW_ALL_JSON_HANDLERS` shape (always applied, no
  opt-out — they're integral to correct row extraction), gated the new
  `events` handler behind a new `sa_enable_expand_release_events` setting
  (default: on, new "▶️ EXPAND TRUNCATED CELLS" section) since artists with
  hundreds of digital-release territories could make this add real
  per-page overhead some users may want to skip. Checked inside
  `expandShowAllCells()` right where `topKey === 'events'` resolves to a
  handler, with its own dedicated debug log distinguishing "off by
  setting" from "unknown shape" — the two must read differently to anyone
  debugging via `Lib.debug('expand', …)`.
- Did NOT reuse the existing `sa_enable_release_events_column` setting
  name/section — that's a completely unrelated feature (an *injected*
  "Release events" column fetched via the WS2 API on pages declaring
  `injectedColumns: ['Release events']`), confirmed by reading
  `buildActiveReleaseEventColumns`/`_rePopulateCell`.
- No changes needed to `splitCountryDate` (`ColumnDataExtractor`) — it
  already does a plain `sourceCell.querySelectorAll('.release-event')`
  with no awareness of truncation, so once `expandShowAllCells()` builds
  the missing `<li>`s into the DOM before extraction runs, it picks them
  all up for free. Confirmed call order: `expandShowAllCells(doc, p)` runs
  inside the per-page fetch loop before any row extraction, uniformly for
  both the live `document` and every `DOMParser`-parsed page.
- This fix is generic to `expandShowAllCells()`, so it benefits every page
  definition that declares `splitCountryDate` on a "Country/Date" column
  (`artist-releases` plus several others), not just the one the user
  reported.

`node --check ShowAllEntityData.user.js` passed after every edit.

## 2026-08-20 — "DJ-mix of" dynamic AR column collapsed to one row instead of 26 (v9.99.897)

- `DJ-mix-of-original.html` — the native `release-tracks` page for
  https://musicbrainz.org/release/a24eb845-0b82-44a7-8227-d13d4c1200dd (Paul
  Oakenfold's "1993-11-06: BBC Radio 1 Essential Mix" broadcast, a single
  continuous-mix track). Its Title `<td>`'s bare `div.ars > dl.ars` has
  exactly ONE `<dt>DJ-mix of:</dt>`, whose single `<dd>` credits 26 separate
  source recordings, comma/"and"-joined: each item's own direct-child marker
  is `<span class="recordinglink">`, immediately followed by
  `<a href="/recording/…">` (the recording title) then literal text `" by "`
  then a `<bdi>` wrapping `<span class="artistlink"></span><a
  href="/artist/…">` (the credited artist) — i.e. the artist's own marker
  sits nested one level deeper inside `<bdi>`, never as a direct child of
  `<dd>`.
- `DJ-mix-of-final.html` — this script's rendered output. The "Dj-mix of"
  column (dynamic-fallback, correctly discovered and given its own `<th>`,
  header count badge reading "1") crammed ALL 26 recording+artist credits
  into a SINGLE `<li>` instead of one `<li>` per recording — confirmed by
  extracting the row's `<td><ul><li>…</li></ul></td>` and finding all 26
  `recordinglink`/artist pairs inside that one `<li>`, run together with no
  row boundaries.
- Root cause: `_collectEntityKinds(dd)` only detects DIRECT-child
  `<span class="{kind}link">` markers (`:scope > span.{kind}link`). Since the
  artist marker here is nested inside `<bdi>` (not a direct child), only
  `recording` is ever collected — but `PEER_SPLIT_KINDS` (consulted via
  `_filterPeerKinds` at both dynamic-fallback call sites, page-wide `<th>`
  discovery and per-row `<td>` building) only listed `artist`/`label`, so
  `recording` was stripped to an empty Set. `_buildKindSplitListTd` then took
  its `kinds.size === 0` "no recognized marker — clone the whole `<dd>`
  verbatim into one `<li>`" branch, exactly the observed bug.
- Fix: added `'recording'` to `PEER_SPLIT_KINDS`. A `recordinglink` marker in
  a dynamic-fallback AR's `<dd>` is always a genuine distinct credited
  recording, never a recording's own nested "decoration" the way an area
  nests its own parent-area ancestry (the reason place/event/work/area/series
  stay excluded) — so it's safe to always treat as a row/segment boundary.
  `_splitColumnByEntityKind` still collapses a single-kind set to one
  `'default'` column (no "Dj-mix of recording" suffix), since the artist's
  nested marker never contributes a second kind here. Affects every
  recording-to-recording dynamic column with 2+ targets on the same `<dd>`
  (DJ-mix of, Samples, remix of, edit of, Music videos, …), not just this one
  release; single-target cases were already correct by coincidence (one
  clone into one `<li>` looks right when there's only one item).
- `node --check ShowAllEntityData.user.js` passed after the edit.

## 2026-08-22 — annotations page type (`annotations.html`)

- `annotations.html` (`/label/011d1192-6f65-45bd-85c4-0400dd45693e/annotations`,
  label "Columbia"): `div#content` present. Native `<h1>` (label header),
  `div.tabs`, then a single native `<h2>Annotation history</h2>` — the raw
  file has 3 total `<h2` matches, but the other 2 are false positives:
  literal `<h2>Early History</h2>`/`<h2>Notes</h2>` text embedded inside the
  escaped `"html"` field of a `<script type="application/json">` blob
  (historic annotation revision bodies that themselves contained wiki
  headings), not real DOM elements — grep for `<h2` on a raw MB snapshot
  before trusting a match count when a JSON blob is present.
- The real `<h2>` is immediately followed by
  `<form action=".../annotations-differences">` wrapping an ALREADY
  `table.tbl`-shaped table (`<div class="annotation-history-table"><table
  class="tbl" id="annotation-history">`) — no `listToTable`/`insertH2`
  needed, same minimal shape as `cd-stub`/`auto-editor-election`. 5 columns:
  Old/New (`<input type="radio" name="old"/"new" value="<annotationId>"
  [checked] [disabled]>`, no visible text — native "Compare versions" diff
  form), Editor (`<a href="/user/NAME"><img class="avatar">…<bdi>NAME</bdi>`
  — plus a previously-unseen-in-this-file shape for deleted/reactivated
  editors: `class="tooltip j2revivededitor"` with a multi-line `title`
  tooltip and a trailing `<span class="comment">(active N years until
  YYYY)</span>`, e.g. the `brianfreud`/`Deleted Editor #95678` rows), Date
  (plain text `"2024-03-19 23:11 GMT+1"`), Version history (`<a
  href=".../annotation/<id>">View this version</a>` + `(changelog text)` or
  `(<em>no changelog specified</em>)`). 59 total `<tr>` (1 thead + 58
  tbody), 0 occurrences of `class="pagination"`.
- Old/New radios left as plain default columns (no extractor, no
  columnEraser, no `checkbox-cell` class stamp — that mechanism is for
  single-checkbox merge columns tied to MB's own client-side JS hydration,
  a different shape/dependency than this plain radio+form UI). Verified
  against the actual render pipeline: `renderFinalTable` repopulates the
  existing table's own `<tbody>` in place (never relocates `<table>` out of
  its wrapping `<form>`), and new rows are `importNode`-deep-cloned from
  freshly-fetched static HTML, so `checked`/`disabled`/`name`/`value`
  survive untouched — the "Compare versions" form should keep working
  post-render, unlike `report-detail`'s mergeable-table checkbox (which
  goes inert on clone because it depends on MB's own JS hydration).
- `Date` column reuses the existing `dateTimeParts` extractor (splits on
  first whitespace: `"2024-03-19 23:11 GMT+1"` → date `"2024-03-19"`, time
  `"23:11 GMT+1"`) into `Revision date`/`Revision time`, same extractor
  already used on report-detail's "Last edited" column.
- `pageType: 'annotations'`, `tableMode: 'single'`, `non_paginated: true`
  (no `class="pagination"` in this 58-row fixture, same bet as
  `cd-stub`/`isrc`/`auto-editor-election`) — **unverified against a
  heavily-annotated entity**; worth a spot check before relying on it for
  a real >1-page annotation history.
- `match()` includes `artist` in the same alternation as every other
  entity (unlike `entity-aliases`, which routes artist separately because
  `/artist/<mbid>/aliases` has an extra "Artist credits" section) — there
  is no MB feature parallel to that for annotations, so no split is
  needed. **Unverified**: no `/artist/<mbid>/annotations` snapshot was
  captured, only this label one; worth a follow-up snapshot to confirm the
  DOM shape matches before treating this as fully confirmed.
- Also required a fix to the `@include` Tampermonkey filter
  (`ShowAllEntityData.user.js:17`) — `annotations` was missing from the
  URL-suffix alternation, so without adding it the userscript would never
  have injected on this URL at all regardless of the `pageDefinitions`
  entry.

## 2026-08-23 — annotations pageType: Compare versions button + radio range

- Live testing against the rendered `annotations` pageType (screenshots,
  not a new HTML snapshot) surfaced two gaps versus the native MB page:
  1. The "Compare versions" button was left at the bottom of the page
     (native `.row.no-margin > .buttons > button`), unstyled, instead of
     living in the h2 header bar next to the other controls.
  2. Native MB restricts the Old/New radio pair so Old must always be
     strictly older (higher `data-index`) than New — enforced by MB's own
     client-side JS, wired directly to the original DOM nodes. This
     script's cloneNode(true)/importNode-based row rebuilding on every
     sort/filter re-render drops that JS along with the nodes it was
     attached to (same class of bug documented elsewhere in this file for
     `initExpandRGsFeature()`/`_cdtocInitTracklistToggles()`), leaving only
     the pristine static `disabled` attributes MB bakes into the initial
     HTML: New is statically disabled on every row except index 0, Old
     only on index 0. Net effect: New is permanently stuck on the newest
     revision — you can only ever compare "newest vs. some older row",
     never two arbitrary intermediate revisions.
- Fix: `initAnnotationCompareButton()` relocates the native button into
  the h2 (via `filterContainer.parentNode.insertBefore(btn,
  filterContainer)`, the same anchor every other header button uses),
  restyled with `uiFilterBarBtnCSS()`. Since moving it out of the `<form>`
  breaks native submit, its click handler instead reads the checked
  old/new radio values and navigates to `${form.action}?old=...&new=...`
  directly (the form has no explicit `method`, so it's a plain GET) — this
  also made "open in a new tab" (point 3 of the request) trivial: just
  `window.open()` vs. `window.location.href`, gated by the new
  `sa_annotations_compare_new_tab` setting (default true).
- `initAnnotationCompareRadios()` re-derives the constraint from whichever
  radios are CURRENTLY checked (not hardcoded index 0/1), so it produces
  the correct result both on first render and after a user has already
  picked a different pair before the next sort/filter clones the rows
  again. Called once after initial render (both the live-fetch and
  load-from-disk paths) and again after every `runFilter()` single-table
  re-render, alongside the other rewire-after-clone calls.
- Both functions self-guard on `pageType === 'annotations'` and are called
  unconditionally from shared code paths (cheap no-op elsewhere), matching
  the existing `initExpandRGsFeature()`/`_cdtocInitTracklistToggles()`
  convention.
- `node --check ShowAllEntityData.user.js` passed after the edit.

- Follow-up (same day): the button also had no visible gap from the h2's
  native "Annotation history" text (fixed with an 8px left margin,
  matching `.mb-row-count-stat`'s own margin), and swapped sides with the
  count-stat span between the initial render and any later sort/filter —
  root cause: `updateH2Count()` removes and recreates `.mb-row-count-stat`
  on every re-render, always re-inserting it immediately before
  `filterContainer`; a button anchored on `filterContainer` itself gets
  displaced by that fresh insertion after the first re-render. Fixed by
  anchoring the button on the count span when present
  (`targetH2.insertBefore(compareBtn, countSpan || filterContainer)`),
  keeping it consistently right after the h2 text and before the count on
  every render, not just the first one.

- Follow-up (2026-08-23): the "Old must be strictly older than New" range
  restriction added above turned out to interact badly with this script's
  own filtering. `runFilter()`/`renderFinalTable()` don't just hide
  non-matching rows — they don't render them in the DOM at all — so
  whichever row held the currently-checked Old or New radio can end up
  filtered out of view entirely. `initAnnotationCompareRadios()`'s
  `applyConstraints()` was still re-applying the range restriction against
  only the CURRENTLY VISIBLE rows, and depending on the filtered index
  range relative to the (possibly now-invisible) checked pair, that could
  disable every remaining radio in one entire column, with no valid
  Old/New pair reachable without clearing the filter first — most starkly
  when the filter narrowed the visible rows to just one, where "New must
  be < Old" can never be satisfied by a single index at all.
- Rather than make the range restriction filter-aware (tracking the
  checked pair independently of visibility, recomputing valid ranges
  against the full row set instead of just the DOM), the restriction was
  dropped entirely per explicit request: `initAnnotationCompareRadios()`
  now just clears `disabled` on every Old/New radio, unconditionally.
  Every combination is always selectable, including ones MB's own native
  page would never let you reach (e.g. Old numerically newer than New) —
  a deliberate trade-off in favor of never getting stuck, especially since
  this is exactly the situation active filtering creates routinely.
- `node --check ShowAllEntityData.user.js` passed after the edit.

## 2026-08-24 — sanojjonas artefacts after the table on artist-relationships-filtered (round 2)

- `sanoj.html` (`/artist/70248960-cb53-4ea4-943a-edb18f7d336f/relationships?link_type_id=1`,
  post-render snapshot): reported bug — leftover userscript artefacts
  after the table. Same page as the earlier same-day report, but this
  time the user pointed directly at the PRE-EXISTING
  `removeSanojjonasContainers()` function (`ShowAllEntityData.user.js`)
  instead of the generic `#sidebar` reflow theory from the first pass
  (which was implemented then explicitly rolled back at the user's
  request — see git history around that same timestamp).
- Confirmed via byte-offset search directly on `sanoj.html`: right after
  `</table>` (byte 158431) sits a literal run of sanojjonas' own
  infinite-scroll placeholder markup — `<br><div id="load"><h1>Busy</h1>
  </div><br><div id="load2"></div><br><div id="load3"></div><br><div
  id="bottom1" style="overflow-x: auto; width: 792px;"></div>` … through
  `id="bottom7"` … `<div id="load4"></div></div><div id="sidebar"
  class="sidebar-collapsed">…` — i.e. these ARE literally, physically
  "after the table" in DOM order, a separate and more direct problem than
  the `#sidebar` CSS-reflow theory investigated in the earlier note
  (`#sidebar` itself sits even further after these, and its own reflow
  issue is real but out of scope for this fix — the user only asked for
  the sanojjonas artefacts this time).
- `removeSanojjonasContainers()` already existed (3 call sites:
  `performClutterCleanup()`'s conditional call, a redundant duplicate call
  right after it in the main fetch pass, and an unconditional
  presence-checked call inside `finalCleanup()`) but only ever removed a
  fixed `load`/`load2`-`load4`/`bottom1`-`bottom6` ID list — this
  snapshot's own `bottom7` is one past that list, confirming the function
  was ALREADY silently under-cleaning even for its original intended
  targets, before even considering the Taggregator gap. It also never
  targeted `#taggregator-settings`/`#taggregator-import-button` at all — a
  second, unrelated sanojjonas userscript ("Taggregator", a tag-
  aggregation tool) that injects its own settings panel into native
  `#sidebar`.
- Fix: replaced the fixed ID list with `_findSanojjonasContainers()`,
  matching `load`/`bottom` containers by ID SHAPE
  (`/^(load\d*|bottom\d+)$/`, no hardcoded suffix cap) plus the two fixed
  Taggregator IDs — shared by both `removeSanojjonasContainers()` and the
  `finalCleanup()` presence check (previously an independently hardcoded,
  now-eliminated duplicate list, itself a latent bug risk: if only the
  removal list had been extended without also updating the separate
  presence-check list, `finalCleanup()`'s `if (foundSanoj)` gate could
  have stayed false and skipped calling the removal function entirely on
  a page whose ONLY sanojjonas artefact was a new one the presence check
  didn't know about).
- Verified end-to-end against `sanoj.html` via a headless Playwright page:
  `_findSanojjonasContainers()` found all 13 real elements present
  (`taggregator-settings`, `taggregator-import-button`, `load`-`load4`,
  `bottom1`-`bottom7`), and after removing them all, a second query
  confirmed zero remained.
- `node --check ShowAllEntityData.user.js` passed after the edit.

## 2026-08-24 — sanojjonas artefacts after the table (round 3): async timing, not a matching bug

- `sanoj-debug.log` (console log) + `sanoj-page.html` (final-state
  snapshot) — user reported round 2's fix (`removeSanojjonasContainers()`
  extended to pattern-match `load\d*`/`bottom\d+` + the two Taggregator
  IDs) still didn't remove the artefacts on the SAME page, opened via
  MusicBrainz's own "Show single-table" button from the multi-table
  overview page (`/artist/…/relationships`, no `link_type_id`) into a new
  tab — the cross-tab snapshot hydration path
  (`_hydrateAndRenderFromSnapshotData`), not a normal page load.
- `sanoj-page.html` byte-offset inspection: right after `</table>` sits
  `id="load"`/`id="load2"`/`id="load3"`, `id="bottom1"`…`id="bottom7"`
  (one of them, `bottom2`, even contains a nested `<h2>Artist Table</h2>
  <table class="sanojjonas">` — sanojjonas' own injected content), then
  `id="load4"`, then `#sidebar`. `grep`/Python confirmed ZERO occurrences
  of "taggregator" anywhere in this particular capture — a different
  artist/session state than the original `sanoj.html`, not a regression
  in the Taggregator-specific matching itself.
- `sanoj-debug.log` line 27: `_clearNativeTableSectionsForSnapshot: h2
  "Taggregator Settings" owns 3 h3(s), only 0 removed — left standing.`
  (from an EARLIER capture where Taggregator WAS present) — red herring
  at first glance, but harmless: that function only clears h2s owning
  h3s tied to a `table.tbl` it already removed; Taggregator's own h2 was
  correctly left alone by design, since `removeSanojjonasContainers()`
  (called later, from `finalCleanup()`) is what's actually responsible
  for it via its own `#taggregator-settings` ID match.
- `sanoj-debug.log` line 52: `Removed 2 Sanojjonas container(s).` — this
  is the real smoking gun. Only 2 of the 11+ elements that eventually
  exist (per `sanoj-page.html`) had actually been injected by sanojjonas'
  own script(s) at the moment `finalCleanup()`'s one-shot
  `removeSanojjonasContainers()` call ran. Root cause: this cross-tab
  snapshot bootstrap runs its ENTIRE render+cleanup pipeline within one
  `setTimeout(...,0)` tick of the tab opening (see
  `_clearNativeTableSectionsForSnapshot()`'s own JSDoc) — dramatically
  faster than a normal page load's real network-fetch timeline — and the
  user separately confirmed sanojjonas' own script(s) are asynchronous
  AND noticeably slower than jesus2099's, so most of its containers
  simply don't exist yet by the time our one-shot pass runs.
- This exact race — a third-party script injecting content
  asynchronously, faster than a one-shot cleanup pass but slower than
  this fast snapshot bootstrap — already has a precedent fix in this
  file: `_watchForLateJesus2099Injections()`, a 5-second `MutationObserver`
  installed at the very same cross-tab-snapshot call site (right before
  `_hydrateAndRenderFromSnapshotData()`), for exactly this reason with a
  DIFFERENT third-party script. Added the sanojjonas counterpart,
  `_watchForLateSanojjonasInjections()`, mirroring that pattern (15s
  window instead of 5s, given the confirmed extra slowness), wired into
  the same call site.
- Refactored `_findSanojjonasContainers()` to share a new
  `_isSanojjonasContainerId()` predicate with the new observer (checking
  only newly-added nodes + their descendants, not a full-document
  `querySelectorAll` per mutation batch, mirroring
  `_watchForLateJesus2099Injections()`'s own per-node-check style) —
  single source of truth for "is this ID a sanojjonas container",
  removing the last bit of duplicated matching logic between the
  one-shot and late-watch paths.
- Verified via a standalone Playwright simulation (elements added on a
  staggered timeline, mimicking a slow async injector): all four
  simulated late arrivals (`load`, `bottom1`, `bottom7`, and
  `taggregator-settings` nested inside a wrapper div, exercising the
  descendant-scan fallback) were caught and removed by the observer.
- `node --check ShowAllEntityData.user.js` passed after the edit.

## 2026-08-24 — artist-events perf-comparison test infra: two pre-existing quirks found (not fixed, out of scope)

While building `tests/live/artist-events-interactions.spec.js` /
`tests/support/capture-interaction-perf.js` /
`tests/support/capture-snapshots.js`'s new post-filter/post-sort snapshots
(see `ShowAllEntityData_CHANGELOG.wip.json` WIP.1) — a test suite comparing
`main` vs the `perf-steps-1-4` branch's PERFORMANCE.org Steps 1-4 on the
`artist-events` pageType (4174 rows) — two pre-existing behaviors surfaced
that are NOT caused by perf-steps-1-4's changes (both confirmed present on
`main`, and both computations are untouched by Steps 1-4 — Step 3 only adds
a cache around `_updateAllColHeaderCounts`, it doesn't change what it
computes). Neither was fixed here; both are out of scope for the
performance-comparison work. Recorded so they aren't rediscovered from
scratch later.

1. **`.mb-col-collapse-count` header badge under-counts for "Location"**:
   `_updateAllColHeaderCounts()`'s live-recomputed badge for the "Location"
   column reports `1` on the committed `artist-events` fixture, while the
   DOM genuinely has 5 cells with a `.mb-cell-collapse-toggle` present
   (confirmed via direct `querySelectorAll` — row indexes 422, 966, 1848,
   3156, 3792 in the fixture's tbody order) — independently corroborated by
   `window.__saTest.getUniqDropSections('Location')`'s "Structure" section,
   which correctly reports `5` collapsed / 0 expanded. Both read the SAME
   live DOM at the SAME moment, just via different code paths
   (`_updateAllColHeaderCounts()`'s own per-row `_classifyCollapseCell()`
   scan vs. `openUniqDrop()`'s own separate scan for the "Structure"
   section) — looks like a `_classifyCollapseCell()` mis-classification
   specific to this column's multi-venue cell shape (a `<ul>` of alternate
   recurring-event venues), not a data or timing issue. The correctness spec
   deliberately does NOT assert the header badge against the known-correct
   `5` — see its own inline comment at the relevant `expect()`.
2. **Filter-clear / sort on a large single-table page: status text and row
   count both lie about "done" for a while** — a filter-clear-triggered (or
   sort-triggered) rebuild's real `tbody tr` count, and the
   `#mb-render-heading` chunked-render overlay's removal, both lag well
   behind `waitForFilterSettled()`/`waitForSortSettled()`'s own
   `#mb-filter-status-display`/`.mb-row-count-stat`-based "settled" signal.
   Confirmed empirically: clearing a column filter that had narrowed 4174
   rows to 158 left `tbody tr` at 2500-3500 (not 4174) and the "🎨 Rendering
   rows..." overlay still on-screen well after `getPageRowCount()` already
   read back the correct final `(4174)` text. This is the filter-clear/sort
   counterpart of the ALREADY-documented initial-chunked-render race (see
   `tests/support/browser.js`'s `waitForRenderComplete()` JSDoc, and this
   file's own `artist-events` fixture-capture entries) — same underlying
   cause (a chunked `requestAnimationFrame`-batched insertion loop that
   outlives the "done" signal other code already relies on), just a second
   trigger for it nobody had exercised via Playwright before. On `main`
   this affects ANY large-table filter-clear or sort (not specific to
   `artist-events`, just first observed there since it's the only large
   `tableMode: 'single'` page under test). perf-steps-1-4's Step 1/2
   in-place-mutation rewrite may well eliminate this race entirely (no
   rebuild ⇒ no chunked re-insertion) — worth checking once that branch's
   `post-filter.html`/`post-sort.html` are captured, but not verified as
   part of this note. Worked around in the new test files via
   `waitForActualRowCount()` (new helper,
   `tests/support/filterSortAssertions.js`) plus an explicit
   `#mb-render-heading`-absence wait — both needed after EACH of the
   filter-clear step and the sort step independently (an earlier capture
   that only waited after the filter-clear still had the overlay baked into
   `post-sort.html`, from the sort's own separate rebuild).

## 2026-08-25 — sanojjonas now wraps its output in #sanojjonasRoot; simplified matching; fixed Taggregator attribution

- `debug/sanoj-initial.html` (full page, ~1.9MB, captured today) and
  `debug/sanoj-new.html` (just the wrapper's own outerHTML, ~66KB) show
  sanojjonas' userscript has changed behavior since the round-2/round-3
  fixes (2026-08-24, above): it now wraps every element it injects — `load`,
  `load2`, `load3`, `load4`, `bottom1`-`bottom7` — inside a single `<div
  id="sanojjonasRoot" class="sanojjonasRoot">` container, appended as the
  last child of `#content` (verified by balanced-tag byte-offset parsing:
  the wrapper's span is exactly those 12 descendants, nothing else). The
  "Taggregator" panel (`#taggregator-settings`/`#taggregator-import-button`)
  is NOT wrapped by this root — it still lands separately inside native
  `#sidebar`, confirmed present in `sanoj-initial.html` (outside the
  wrapper's byte span) and absent from `sanoj-new.html` (which only
  captured the wrapper itself).
- This made the existing `/^(load\d*|bottom\d+)$/` ID-shape regex sweep
  (introduced in the 2026-08-24 round-2 fix) both unnecessary — every
  `load`/`bottom*` id now lives inside one predictable container id — and
  latently unsafe: neither the regex nor `_isSanojjonasContainerId()`
  matched `sanojjonasRoot` itself, only its descendants, so removing them
  one by one would leave an orphaned empty shell (`<div
  id="sanojjonasRoot"><br></div>`) behind instead of cleanly removing the
  whole thing.
- Fix: added `'sanojjonasRoot'` to `SANOJJONAS_FIXED_IDS` (now
  `['sanojjonasRoot', 'taggregator-settings', 'taggregator-import-button']`),
  dropped the ID-shape regex entirely, and rewrote `_findSanojjonasContainers()`
  from a whole-document `querySelectorAll('[id]')` sweep to three direct
  `document.getElementById()` lookups. Removing `#sanojjonasRoot` removes
  all its wrapped placeholders in one DOM operation.
- Verified via a standalone Node script (no browser needed — string/
  balanced-tag parsing over the raw HTML, since playwright isn't installed
  in this environment) against both snapshots: `_findSanojjonasContainers()`'s
  new logic finds all 3 ids in `sanoj-initial.html` (1 in `sanoj-new.html`,
  which has no Taggregator content), and after removal no `sanojjonasRoot`/
  `taggregator-*`/stray `load*`/`bottom*` id remains anywhere in either
  file, while `#sidebar` and the rendered events table are left untouched.
- Also fixed a mis-attribution bug in the JSDoc (not the runtime logic):
  the comments previously described the load/bottom placeholders and the
  Taggregator panel as "two unrelated MusicBrainz userscripts by that
  author" (sanojjonas) — i.e. implying Taggregator was itself a second
  script by sanojjonas. Taggregator is actually **MusicBrainz Taggregator**,
  a separate, unrelated userscript by `zabe` (`@namespace
  https://github.com/zabe40`). It's only grouped with sanojjonas cleanup
  because both are removed via the same mechanism (same call sites, same
  async-late-injection handling) — not because they share an author.
  Corrected every JSDoc/comment mention across `SANOJJONAS_FIXED_IDS`,
  `_isSanojjonasContainerId()`, `_findSanojjonasContainers()`,
  `removeSanojjonasContainers()`, `_watchForLateSanojjonasInjections()`,
  the cross-tab snapshot bootstrap call-site comment, and `finalCleanup()`'s
  own doc bullet. No identifier/constant renaming — `SANOJJONAS_FIXED_IDS`
  etc. correctly remain a single shared "remove third-party clutter"
  mechanism, not a per-author grouping.
- `node --check ShowAllEntityData.user.js` passed after the edit.

## 2026-08-28 — sanojjonas still present on final page: normal-flow + disk-load watcher gap (v9.99.962)

- `debug/sanojjonas-still-present.org` (user report) plus two captured
  snapshots confirm a fourth sanojjonas timing bug, distinct from the
  2026-08-24/2026-08-25 rounds above: `debug/s-present-on-initial.html`
  (raw page, no ShowAllEntityData markers — 0 matches for
  `mb-filter-container`/`mb-master-toggle`/`class="tbl"`) shows
  `#sanojjonasRoot` already present before the action button was pressed
  (working case — the one-shot cleanup catches it). `debug/s-present-on-final.html`
  (confirmed final rendered `artist-releasegroups` discography page — has
  `mb-master-toggle`/"discography" markers) shows `#sanojjonasRoot` STILL
  PRESENT after a full render, because the action button was pressed
  before sanojjonas had rendered its container on the initial page.
- Root cause: `_watchForLateSanojjonasInjections()` (line ~41571) — added
  in the 2026-08-24 round-3 fix above — was only ever called from the
  cross-tab "Show single-table" snapshot bootstrap (line ~30340). Neither
  the normal (button-click) fetch path nor the plain "Load from Disk" path
  ever armed it; both only ran one-shot cleanup: `performClutterCleanup()`
  (line ~32782, gated `pageType === 'events' || _isReleaseGroupsMultiMode()`,
  line ~32830) before the fetch, a duplicate guarded call right after it in
  `startFetchingProcess()` (line ~39050), and `finalCleanup()`'s
  unconditional presence check (line ~51924) after render. None of these
  can catch a container sanojjonas injects AFTER they run. The watcher's
  own JSDoc incorrectly assumed normal page loads didn't need it ("a normal
  (non-snapshot) page load takes the much slower real network-fetch path,
  giving sanojjonas' script more natural time to finish... this watcher is
  only needed on the fast snapshot-hydration path") — disproved by
  `s-present-on-final.html`. The "Load from Disk" path
  (`loadTableDataFromDisk`'s `reader.onload`, line ~56590) has the same gap:
  it calls `_hydrateAndRenderFromSnapshotData()` directly, just like the
  cross-tab bootstrap, and can hydrate+render just as fast — user confirmed
  this independently.
- Fix: call `_watchForLateSanojjonasInjections()` from three sites now:
  the cross-tab snapshot bootstrap (already existing, unconditional,
  line ~30340), `reader.onload` in the "Load from Disk" path (newly added,
  unconditional, right before its own `_hydrateAndRenderFromSnapshotData()`
  call, mirroring the bootstrap's own pattern), and `startFetchingProcess()`
  (newly added, right alongside its existing pre-fetch one-shot
  `removeSanojjonasContainers()` call at line ~39050, under the same
  `pageType === 'events' || _isReleaseGroupsMultiMode()` gate already
  guarding every other sanojjonas call site in the normal-fetch path).
  Installing it before the fetch loop begins means the 15s observer window
  covers essentially the entire fetch+render duration, not just the
  post-render tail. Corrected `_watchForLateSanojjonasInjections()`'s own
  JSDoc (line ~41536) to drop the "normal page load doesn't need this"
  claim and document all three call sites and their rationale.
- `node --check ShowAllEntityData.user.js` passed after the edit.
- Related, NOT fixed here (out of scope — user's report is sanojjonas-
  specific): `_watchForLateJesus2099Injections()` (line ~41390) has the
  identical single-call-site gap (only called at line ~30322, the cross-tab
  bootstrap) on both the normal-fetch and disk-load paths.

## 2026-08-28 — multiple-dates.html: eventParts Event-Date misses "/DD" uncertain-day dates

- Snapshot: `multiple-dates.html` — one rendered row from `work-recordings`
  on work "A Rainy Night in Soho" (`/work/8727a75a-8d33-3a2c-912a-
  f57952773201`), recording `de9ff1d7-dd78-4ed6-a328-c1ab126304e6`, Comment
  `"(live, 2001-12-22/23)"`. Shows `2001-12-22/23` landing in the
  "Event-Detail" column instead of "Event-Date".
- Root cause: `eventParts()`'s `DATE_RE` (`ShowAllEntityData.user.js`,
  ~line 4395) only matched plain partial ISO 8601 (`YYYY`, `YYYY-MM`,
  `YYYY-MM-DD`), not MusicBrainz's own "recorded on one of these days,
  exact day unclear" convention of appending one or more `/DD` segments to
  a full date. Since the regex didn't match, the date string fell through
  to the `else` branch and was stored in Event-Detail instead.
- Fix: extended `DATE_RE` to `/^\d{4}(?:-\d{2}(?:-\d{2}(?:\/\d{2})*)?)?$/`
  — accepts zero or more trailing `/DD` segments on a full date. Verified
  against a small standalone test covering `YYYY`/`YYYY-MM`/`YYYY-MM-DD`/
  `YYYY-MM-DD/DD`/`YYYY-MM-DD/DD/DD` (all match) and rejecting
  `YYYY-MM-DD/YYYY-MM-DD` (two full dates, a different shape) and free text.
- Live-verified: `tests/live/event-parts-extraction.spec.js`'s second test
  reuses this same work page and recording; confirmed it fails on the
  pre-fix code (`Event-Date` empty) and passes after the fix.

## 2026-08-29 — CAA/EAA completion signal never fires after runFilter() (fixed); deeper re-enrichment-on-every-filter issue found but NOT fixed

- Found while building `tests/live/artist-releases-filter-sort.spec.js`
  (branch `fix/caa-completion-signal-disk-restore`): a disk-restored table
  (`loadFromDiskFixture()`) never showed `#mb-info-display-caa` or the
  "🎨 All CAA/EAA artwork loaded" toast, even though the artwork itself
  loaded correctly (`data-cache-hint` attributes present, cells rendered
  fine). Same symptom on ordinary (non-disk-load) filter/sort actions too.
- Root cause (FIXED): `runFilter()`'s own CAA/EAA re-init block
  (`ShowAllEntityData.user.js`, near `initCaaPics(); initEaaPics();` inside
  the single-table branch) called `initCaaPics()`/`initEaaPics()` but never
  registered `_caaQueue.onIdle(_showCaaCompletionToast)` — unlike
  `startFetchingProcess()`'s otherwise-identical block, which does. Since
  `runFilter()` is the ONLY call site that runs after a disk-load hydration
  (`_hydrateAndRenderFromSnapshotData()` → `runFilter()`), and also runs on
  every ordinary filter/sort keystroke, the completion signal never fired
  from either path. Fix: register the same `onIdle()` callback in
  `runFilter()`'s block, mirroring `startFetchingProcess()`'s pattern.
  `makeCaaQueue()`'s own `onIdle()` already handles "queue already idle at
  registration time" safely (fires via `setTimeout(cb, 0)`), so this is
  safe to register unconditionally on every `runFilter()` pass.
- Deeper issue found while verifying the fix (NOT fixed — scoped out,
  needs its own design pass): `runFilter()` intentionally strips every
  cloned row's `data-caa-enriched`/`data-eaa-enriched` markers before
  re-rendering (see the comment directly above `initCollapsableColumns()`
  in the same function) so that `_artHighlightImageLi` re-applies the
  active filter's highlight to CAA/EAA art cells after every re-render —
  necessary, not a bug on its own. But the side effect is that
  `_artEnrichIcon` then treats every cell as unenriched too, re-queuing a
  FULL re-fetch of every image's enrichment data on every single
  filter/sort action — including the very first `runFilter()` call right
  after a disk-restore, even though that data was already fully populated
  and saved in the fixture. Confirmed live on the BoDeans `artist-releases`
  fixture (56 rows): `_caaQueue` had 220 pending + 4 running tasks
  immediately after a disk-load's first `runFilter()` call, taking real
  wall-clock time (real network calls to coverartarchive.org in a
  non-`realNetwork` test context even) to drain — unlike Relationships,
  which correctly skips already-`relDone` cells and never re-fetches them.
  A proper fix would separate "re-apply highlight to already-known art"
  from "re-fetch enrichment data from the network", which the current code
  doesn't distinguish — a bigger, riskier change than the completion-signal
  fix above, intentionally not attempted here.
- Test-suite impact: `tests/live/artist-releases-filter-sort.spec.js`'s
  `loadBodeans()` helper does NOT rely on `hasCaaOrEaa`/`hasRelationships`
  waits (both hang for a disk-fixture load per `browser.js`'s own
  documented gap — those signals are only ever driven by the live-fetch
  pipeline); the one case needing Relationships data
  (`Relationships ~ "amazon.com"`) uses a short fixed settle delay instead
  (`needsRelSettle` in `bodeansArtistReleasesFixture.js`). CAA/EAA data
  itself is read directly from already-populated DOM state
  (`.mb-caa-sort-key`), never from the completion signal, so none of that
  suite's assertions depend on either issue above.

## 2026-08-29 — highlightCrossTag() never highlights a comment-boundary match (fixed)

- Found while building `tests/live/artist-releases-filter-sort.spec.js`
  (BoDeans `artist-releases`): a plain-text filter match spanning from an
  entity's own `<bdi>` name into a *separate* sibling
  `<span class="comment"><bdi>` (joined only by a normalized `&nbsp;`) —
  Release `In (Disc` (1 row), Label `Slash (US` (26 rows), Country/Date
  `US 2009-03-10` / `US 1986` (1/2 rows) — correctly narrowed the page's
  row count but produced **zero** `.mb-column-filter-highlight` spans.
  `highlightCrossTag()`'s own JSDoc already described fixing this exact
  shape of bug (for the Release sticky column's erg-btn/caa-inline-ph
  decorations); this comment-boundary variant was an uncovered gap in that
  same fix.
- Root cause: `getCleanColumnText()` (`ShowAllEntityData.user.js:33716`)
  builds its matched text via `textParts.join(' ')` — a real space is
  spliced between every collected text-node fragment unconditionally. But
  `highlightCrossTag()` (`:34086`) collected only text nodes whose
  `.trim()`ed value was truthy, then joined the SURVIVORS with `join('')`
  (no separator). An `&nbsp;`-only text node between the `<bdi>` and the
  `<span class="comment">` has `.trim()` return `''` — JS's `String.trim()`
  strips U+00A0 identically to regular ASCII whitespace — so that node was
  dropped entirely, and the two neighboring fragments were concatenated
  with nothing between them. `getCleanColumnText()`'s `fullText` therefore
  read `"...In (Disctronics..."` (space present, matches `In (Disc`) while
  `highlightCrossTag()`'s own internal `fullText` read `"...In(Disctronics..."`
  (no space) — the regex simply never matched inside `highlightCrossTag()`,
  so `if (!matches.length) return;` fired early with no highlight spans,
  even though the row-level match (via `getCleanColumnText()`) was correct.
- Fix (`ShowAllEntityData.user.js:34086`, `highlightCrossTag()`): mirror
  `getCleanColumnText()`'s `join(' ')` behavior — insert a virtual
  1-character offset gap between consecutive accepted text-node entries
  (`if (entries.length) offset += 1;`), and build `fullText` via
  `entries.map(e => e.node.nodeValue).join(' ')` instead of `join('')`.
  Also added a defensive `root.normalize()` at the top of the function
  (safe/idempotent — every current caller already normalizes before
  calling it, but this makes the function self-sufficient against a future
  caller that doesn't). Expanded the function's JSDoc with a new paragraph
  documenting this second gap and its root cause, alongside the
  pre-existing gap description it already had.
- Verified live (standalone Playwright diagnostic against the real
  userscript + BoDeans fixture): all 4 previously-broken cases now produce
  the correct 2 highlight spans per match (one in the entity's own
  `<bdi>`, one in the comment's `<bdi>`); 3 spot-checked previously-working
  cases (Release "Black and White", Format "CD", DD "1") remain unaffected.
  Full `tests/live/artist-releases-filter-sort.spec.js` run (§A-§F) and
  the broader `npm run test:live:extended` suite both pass cleanly with no
  regressions.
- One case intentionally left alone, confirmed unrelated: the §F uniq-
  dropdown-driven flat "Country" entry (`United States (US)`,
  `highlightExpected: false` in `bodeansArtistReleasesFixture.js`) still
  produces zero highlight spans after this fix, as expected — that path
  never dispatches through `_highlightCountryMatch()`/`highlightCrossTag()`
  at all (see the fixture's own comment above that case), a genuinely
  different mechanism from the bug fixed here.

## 2026-09-01 — highlightCrossTag() still misses a comma/paren-boundary match (fixed; follow-up to the 2026-08-29 entry above)

- Reported live on `artist-events` (Bruce Springsteen, the URL
  `tests/support/artistEventsFixture.js` already fixtures): filtering the
  Event column for `USA, bleach` correctly narrowed to the one matching row
  — "From the Studio to the Stage: New York" (2024-10-04, w/ Bleachers),
  whose native MB markup is `<a>…</a>&nbsp;<span class="comment"><bdi>(<i
  title="Primary alias">…New York City, NY, USA</i>, Bleachers)</bdi></span>`
  — but produced **zero** `.mb-column-filter-highlight` spans, the same
  symptom as the 2026-08-29 entry above.
- Root cause: the opposite half of the same alignment gap. The 2026-08-29
  fix made `highlightCrossTag()` insert an unconditional virtual space
  between every pair of accepted text-node entries, mirroring
  `getCleanColumnText()`'s `textParts.join(' ')`. But `join(' ')` is only
  half of `getCleanColumnText()`'s own alignment:
  `normalizeExtractedText()` (`:33561`) then STRIPS the space immediately
  before a `,`/`)`/`]` and immediately after a `(`/`[` (its steps 2 & 3),
  because MusicBrainz never intentionally renders "word ," or "( word". The
  `</i>` boundary here sits directly before a bare `,` in the sibling text
  node (no separating whitespace in the DOM at all) — so
  `getCleanColumnText()`'s normalized text reads `"…USA, Bleachers)"` (space
  stripped, matches `USA, bleach`), while `highlightCrossTag()`'s own
  `fullText` — which never mirrored the strip step — read
  `"…USA , Bleachers)"` (space retained), and the literal query never
  matched it.
- Fix (`ShowAllEntityData.user.js`, `highlightCrossTag()`): decide whether
  to insert the virtual join-space per boundary, using the exact same rule
  `normalizeExtractedText()` encodes — skip it when the next entry's text
  starts with `,`/`)`/`]`, or the previous entry's text ends with `(`/`[`.
  Folded entries/offset/`fullText` construction into a single pass (rather
  than building entries first and reconstructing `fullText` separately
  afterwards via `.map().join(' ')`) so the two bookkeeping structures
  cannot drift apart from each other again.
- Regression test: `tests/live/artist-events-interactions.spec.js` ("Event
  column filter highlights a match spanning a comment-comma boundary"),
  reusing the already-committed `artist-events` disk fixture — confirmed to
  fail (0 spans) before the fix and pass (`['USA', ', Bleach']`) after.
  Re-ran `tests/live/artist-releases-filter-sort.spec.js`'s full §A-§F suite
  (the 2026-08-29 fix's own regression coverage, including its `In (Disc`/
  `Slash (US`/`US 2009-03-10`/`US 1986` cross-tag cases) with no
  regressions.

## 2026-09-01 — highlightCrossTag() still misses a match across a REAL comma-separator node (fixed; second follow-up, "Location" column)

- Reported live on `artist-events` (same URL/fixture as the two entries
  above): filtering the **Location** column for `k, n` correctly narrowed
  the row count, and highlighted fine inside a plain-text comment entirely
  within one `<bdi>` (e.g. "(Colts Neck, NJ 1987–present)" — Bruce
  Springsteen's own residence, one span `"k, N"`), but produced **zero**
  highlight spans for rows whose match instead spanned a native MB
  "place in area, area, area" chain — e.g. Madison Square Garden's
  `…<a><bdi>Midtown Manhattan</bdi></a>, <a><bdi>New York</bdi></a>,
  <a><bdi>New York</bdi></a>, <span class="flag …">…` — at the "New York" /
  "New York" area-link boundary.
- Root cause: the SAME underlying principle as the 2026-09-01 entry above
  (a boundary where `normalizeExtractedText()` and `highlightCrossTag()`'s
  own join disagree), one level removed. The `, ` between two area links is
  a genuine, non-whitespace-only text node — NOT the `&nbsp;`-only case the
  2026-08-29 fix handles — so it's its own accepted entry, already carrying
  its own trailing space. `highlightCrossTag()`'s unconditional virtual
  join-space, inserted immediately AFTER that node too (nothing in the
  existing comma/paren rule stops it, since the char right after the gap is
  `N`, not `,`/`)`/`]`), doubled it up: `"…New York"` + `", "` (real) +
  `" "` (virtual) + `"New York…"` read `"…New York,  New York…"` (TWO
  spaces). The literal single-space query `"k, n"` never matches that as a
  contiguous substring, while `getCleanColumnText()`'s
  `normalizeExtractedText()` step 1 (`\s+` → one space) collapses the same
  double space on the row-match side, so the row still matched correctly —
  exactly the same "highlights inside comments, not across areas" split
  symptom the user reported, confirmed live: 1189 rows matched, only 30 of
  them (all same-node comment matches) got a highlight span.
- Fix (`ShowAllEntityData.user.js`, `highlightCrossTag()`): extended the
  join-point `skipGap` rule with two more conditions — skip the virtual gap
  when the previous entry's text already ends in whitespace, or the next
  entry's text already begins with whitespace. Same principle as the
  comma/paren rule (steps 2 & 3): never add whitespace where whitespace
  already exists on either side of the join point.
- Regression test: `tests/live/artist-events-interactions.spec.js` ("Location
  column filter highlights a match spanning a real comma-separator text node
  between two area links"), reusing the same disk fixture, targeting two
  specific rows by place UUID — confirmed to fail (0 spans on the Madison
  Square Garden row; the Colts Neck comment-row assertion already passed
  before this fix) and pass (`['k', ', ', 'N']` on the area-chain row, one
  span per originating text node) after. Re-ran the full
  `artist-events-interactions.spec.js` suite and
  `artist-releases-filter-sort.spec.js`'s §A suite with no regressions.

## 2026-09-02 — unique-values dropdown collapses two DIFFERENT areas sharing the same name (fixed)

- **Snapshot**: `debug/2-ny.html` — a single `series-events` row (SiriusXM
  Studio, 2020-04-08) from
  `/series/f4818e95-a515-4821-ad6d-270703f72dcf`, saved as the final
  rendered `<tr>` (no `<table>`/`<thead>` wrapper — just the row). Same
  underlying "two areas both named New York" collision the 2026-09-01
  entry above already brushed past for a highlighting bug, but here it's
  the actual root cause of a different report: MusicBrainz has TWO
  distinct area entities that are both literally named "New York" — a
  county/city-level area (`/area/74e50e58-5deb-4b99-93a2-decbb365c07f`)
  and the state (`/area/75e398a3-5f3f-4224-9cd8-0fe44715bc95`). Reported
  live: the "Region"/"Location" columns' 📊 unique-values dropdown only
  ever showed ONE "New York" entry, even though the underlying data has
  two unrelated real-world entities.
- **Root cause, layer 1 (data)**: `_routeAreaLink()`/
  `_maybeCorrectAreaFlagRegion()`'s `forceRegion`/`qualifies` check
  compared `a.textContent` (or `flaggedAnchor.textContent`) — the anchor's
  own bare link text, "New York" for BOTH areas — against
  `AREA_FLAG_REGION_SUBDIVISIONS`. Since both anchors' own text is
  identical, the county/city (which should stay in Locality) got
  misclassified as a flagged STATE-level link and force-routed into Region
  alongside the real state, producing a "New York, New York" cell instead
  of splitting Locality="New York" (city) / Region="New York" (state). The
  "More Flags Everywhere" userscript's own decorating icon actually
  disambiguates this already: its `alt`/`title` reads "New York City" for
  the city (sourced from that script's own "(Cities)" list) vs. plain "New
  York" for the state (its "(States)" list) — the anchor text alone just
  never carries that distinction.
- **Root cause, layer 2 (dropdown)**: even independent of layer 1,
  `openUniqDrop()`'s "Entity info" `entityNameValueCounts`/
  `entityNameGlyphMap`/`entityNameTypeMap`/`entityNameFlagMap` family is
  keyed by display NAME string only, by design (documented repeatedly in
  the surrounding code as intentional, e.g. "a name-only entry here would
  be a pure duplicate") — so two different hrefs sharing a name always
  collapse into one dropdown row.
- **Fix** (`ShowAllEntityData.user.js`):
  - New `_flagIconSubdivisionLabel(iconSpan, a)` — reads the decorating
    icon's own `alt`/`title` (falling back to `a.textContent` when absent)
    instead of the anchor's own text; used by both `_routeAreaLink()` and
    `_maybeCorrectAreaFlagRegion()`.
  - `_findCellEntityCommentParts()` now also returns each entry's `href`.
  - New href-keyed counterparts of the `entityName*` Maps
    (`entityNameHrefsMap`, `entityHrefAnyValueCounts`,
    `entityHrefValueCounts`, `entityHrefGlyphMap`, `entityHrefTypeMap`,
    `entityHrefFlagMap`) and a new `_emitNameSynItem()` helper: when a
    display name maps to 2+ distinct hrefs, the flat "» name:" entry
    splits into one auto-numbered entry per href ("New York (1)"/"New York
    (2)"), each wired to a new href-scoped `namehref:<href>` compound
    filter mode (`makeValueSynItem()`'s new `hrefOverride` param) —
    matched/highlighted via new branches in `_cellMatchesStructureMode()`
    and `_highlightEntityCommentPartMatch()`.
- Confirmed the fix is load-bearing by temporarily reverting
  `_flagIconSubdivisionLabel()` to plain `a.textContent` — this reproduced
  the exact bug (the city dragged into Region alongside the state) and
  failed the new fixture test.
- Regression test: `tests/fixtures/area-name-collision.spec.js` (new),
  built from a fixture distilled directly from `debug/2-ny.html`'s row
  markup — covers `_flagIconSubdivisionLabel()`'s icon-vs-anchor-text
  discrimination, `ColumnDataExtractor.splitLocation()`'s Locality/Region
  split, and `_cellMatchesStructureMode()`'s new `namehref:` isolation vs.
  the broader `name:` match. Also added three new `window.__saTest` hooks
  (`cellMatchesStructureMode`, `flagIconSubdivisionLabel`,
  `splitLocationAreas`) and extended the existing `findCellEntityCommentParts`
  hook with `href` — updated `entity-refs-mp-wrapper.spec.js`'s existing
  `toEqual` assertions accordingly (extra field, exact deep-equality).
  `node --check ShowAllEntityData.user.js` and the full `npm test`
  (chromium-fixtures) suite passed after every edit.

## 2026-09-02 — CollaborationRelationships report routed to report-detail instead of report-multiple-linked (fixed)

- **Snapshot**: `debug/collaboration.html` — raw HTML of page 1 of
  `/report/CollaborationRelationships` ("Artists with collaboration
  relationships"), captured with the script's own controls already
  injected into the native `<h1>`. Has: native `<h1>`, no `<h2>`, no
  `div#content` (table sits directly under `div#page`), one
  `table.tbl`, 15-page native pagination.
- **DOM shape**: identical to the existing `report-multiple-linked`
  family (`ASINsWithMultipleReleases`, `ISRCsWithManyRecordings`, etc.) —
  a `<tr class="even"><td colspan="2">…</td></tr>` group-header row
  (the "Collaboration" artist) followed by plain `<tr>`s with an EMPTY
  first `<td>` and the linked "Collaborator" artist in the second.
- **Bug**: `/report/CollaborationRelationships` doesn't match the
  `...With(Multiple|Many)...` naming pattern `report-multiple-linked`'s
  `match()` keys off, so it fell through to the generic `report-detail`
  catch-all, which has no group-header/empty-first-`<td>` merge logic.
  Every collaborator row rendered with an empty "Collaboration" cell —
  see the user's screenshot, second column of the raw page vs. the
  rendered table.
- **Fix**: added a `REPORT_MULTIPLE_LINKED_INCLUSIONS` allowlist
  (mirroring the existing `REPORT_MULTIPLE_LINKED_EXCEPTIONS` in the
  opposite direction) to `report-multiple-linked`'s `match()`, naming
  `/report/CollaborationRelationships` explicitly. No changes needed to
  `_reportMultipleLinkedMainColumnName()` or the shared `features` block:
  the URL has no `With(Multiple|Many)<Entity>` suffix to derive a column
  name from, so `extractMainColumn` falls back to the definition's own
  numeric `1`, which already happens to be the correct column
  ("Collaborator", index 1) for this report. `@include` header (line 18,
  `report\/.*`) already covered this URL — no injection-gate change
  needed.

## 2026-09-02 — unique-values dropdown "Event cancelled" entry didn't match the cell's red styling (fixed)

- **Snapshot**: `debug/user-ratings-event.html` — final rendered
  `/user/vzell/ratings/event/` page. Native "Event" column cell markup:
  `<a href="/event/…">…</a> (date) <span class="cancelled">(<bdi>cancelled</bdi>)</span> <span class="comment">…</span>` —
  MusicBrainz's own `.cancelled` CSS class renders the "(cancelled)"
  marker in red directly in the cell.
- **Request**: the dropdown's "Event info - Event cancelled" entry
  ("» event cancelled: cancelled" — `eventCancelled`/`entityEventCancelled`
  in `SYN_SECTION_META`, populated by `makeValueSynItem('eventcancelled'/
  'entitycancelled', …)`) rendered in plain text, not matching the cell's
  red styling.
- **Fix**: `makeValueSynItem()`'s generic label-building branch now adds
  MusicBrainz's own `.cancelled` class to the entry's `.mb-uniq-syn-label-
  text` span whenever `kind === 'entitycancelled' || kind === 'eventcancelled'`
  — reusing the native CSS class (same technique `makeSynItem()`'s existing
  `extraLabelClass` param already uses for `disabled-acoustid`, see its own
  JSDoc) rather than hardcoding a color, so it stays in sync automatically
  if musicbrainz.org's own styling changes. Verified inheritance-safe: the
  class is applied directly to the label span, so it isn't affected by
  `_applySynBoxQuickFilter()`'s `labelSpan.textContent =`/`innerHTML =`
  rebuilds (neither touches the span's own class list).
- Extended the `window.__saTest.getUniqDropSections()` test hook with a new
  `cancelled: boolean` field per item (`.mb-uniq-syn-label-text.cancelled`
  presence).
- Regression test: `tests/fixtures/uniq-drop-event-cancelled.spec.js` (new,
  + `artist-events-cancelled.html` fixture) — uses `artist-events`
  (`entitycancelled` kind) rather than `user-ratings-type` directly, since
  it needs no `listToTable`/`entityFeatures` H2-resolution machinery and no
  `GM_xmlhttpRequest`/fetch mocking (its lone button carries no `params`,
  so `startFetchingProcess` reuses the live `document` — see its "use
  existing document" fast path); both kinds hit the exact same
  `makeValueSynItem()` code branch this test covers. Confirmed the fixture
  needed a native `<h2>Events</h2>` before the table — without it,
  `updateH2Count()` never finds a `targetH2` to append `#mb-filter-container`
  to, so it never becomes visible and `waitForRenderComplete()` times out;
  confirmed via `tests/snapshots/artist-events/raw.html`, whose real
  MusicBrainz markup has exactly this native `<h2>Events</h2>` immediately
  before the table (a fact easy to miss since the page's own `<h1>` is the
  artist name, not a table-section heading). Confirmed the test fails
  (asserts `cancelled === false`) with the `.classList.add('cancelled')`
  call temporarily removed, and passes with it restored.

## 2026-09-02 — CAA/EAA per-column collapse glyph (`.mb-caa-col-hdr-btn`) shown before artwork metadata loads (fixed)

- **Request**: the small ▶/▼+thumbnail collapse toggle
  `_artInitCaaColHeaderToggle()` injects into a CAA/EAA column's `<th>`
  rendered unconditionally, immediately, on every render pass — before
  `_artEnrichTable()`'s enqueued JSON-API enrichment (`_artEnrichIcon`) had
  resolved for even one row. On the FIRST render pass this meant a
  permanently-uninformative ▶-with-no-thumbnail glyph sat in the header for
  however long the CAA/EAA queue took to drain, and — since
  `_artBuildMultiRowArtCell()` wraps EVERY cell with ≥1 image (not just 2+,
  despite that function's own stale-sounding doc comment) in the same
  `[data-caa-expand-btn]` structure — the button was equally uninformative
  (but never removed) on a column where every enriched entity turned out to
  have zero artwork at all.
- **Fix**: `_artInitCaaColHeaderToggle()` now only shows a NEWLY created
  button immediately when `[data-caa-expand-btn]` markup already exists in
  the table right now (the common case on every re-render AFTER the first —
  that markup persists across filter/sort re-renders even though this
  button itself is destroyed and recreated every render pass by
  `initCollapsableColumns()`'s own idempotent cleanup). On the genuine first
  render pass nothing is known yet, so the button starts hidden
  (`data-mb-caa-col-hdr-ready="0"`). New `_artRevealCaaColHeaderButtons()`,
  registered as a `_caaQueue.onIdle()` callback alongside the existing
  `_showCaaCompletionToast()` at all 3 render-pass call sites (initial
  fetch, `runFilter()`'s single-table branch, `renderGroupedTable()`),
  reveals the button once metadata is confirmed (any `[data-caa-expand-btn]`
  now present) or removes it outright if the whole column ended up with no
  artwork anywhere. `_artInitGlobalCaaColHdrToggle()`'s (the h2-level
  toggle-all button, multi-table pages only) own visibility now also only
  counts `data-mb-caa-col-hdr-ready="1"` per-column buttons, so it doesn't
  show before any of the per-column buttons it controls are visible.
- Regression test: `tests/fixtures/caa-col-hdr-deferred-visibility.spec.js`
  (new, + `artist-events-eaa.html` fixture) — routes
  `https://eventartarchive.org/**` via `page.route()` (delaying the JSON
  metadata response 600ms so there's a window to observe the pre-reveal
  hidden state), with `sa_art_idb_enable: false` so `_artLoadIcon` takes the
  plain native-`<img>` fallback path instead of IndexedDB (no extra mocking
  needed). Needed a new `settingsOverride` option on
  `tests/support/loadPage.js`'s `loadUserscriptPage()` (merged on top of the
  existing `FIXTURE_SETTINGS_OVERRIDE`, which forces `sa_enable_caa_pics:
  false` for every other fixture test) — the first fixture-suite test to
  exercise the CAA/EAA pipeline at all. Confirmed the test fails (button
  visible immediately, `sa_enable_caa_pics` unreachable without
  `settingsOverride`) against the pre-fix code, and passes against the fix.

## 2026-09-02 — unique-values dropdown "Entity info" name-collision split applied to every entity type, not just areas (fixed)

- **Snapshot**: `debug/work.recordings.html` — the final rendered
  `work-recordings` page for
  `/work/1f573511-eb4b-3106-8fb2-f15de52e4868` ("4th of July, Asbury Park
  (Sandy)"). Reported live, with a screenshot of the "Title" column's 📊
  unique-values dropdown: the "Entity info - Recording name" section showed
  ~93 near-identical entries, "4th of July, Asbury Park (Sandy) (1)" through
  "… (93)" — one per distinct recording — instead of one flat, merged
  entry.
- **Root cause**: this is a direct regression from the SAME-DAY fix
  immediately above (2026-09-02 — "unique-values dropdown collapses two
  DIFFERENT areas sharing the same name"). That fix's `_emitNameSynItem()`
  splits any display-name collision (2+ distinct hrefs sharing one name)
  into one auto-numbered entry per href — built specifically for two
  genuinely different MusicBrainz AREAS sharing a name (`debug/2-ny.html`'s
  "New York" city/state collision) — but it applied unconditionally to
  EVERY entity type. On `work-recordings`, 93 distinct `/recording/<mbid>`
  entities happen to share one track title; that's ordinary MusicBrainz
  data (many recordings of the same song), not two unrelated real-world
  entities colliding on name, so it should have stayed one flat entry
  exactly as it did before the area fix — the same class of "ordinary
  same-name collision" also applies to releases/works/artists/labels/etc.
  sharing a title/name.
- **Fix** (`ShowAllEntityData.user.js`): new pure helper
  `_entityNameSplitsByHref(entityType)` (next to `_ENTITY_TYPE_GLYPH`),
  returning `entityType === 'area'`. `_emitNameSynItem()` now consults it
  (`hrefs.size <= 1 || !_entityNameSplitsByHref(entityType)`) before
  splitting — every other entity type falls through to the original flat,
  merged `makeValueSynItem('name', …)` call, unchanged from before the area
  fix. `entityNameHrefsMap`/`entityHref*` population, `namehref:` matching/
  highlighting, and the area-routing fix
  (`_flagIconSubdivisionLabel`/`_routeAreaLink`/`_maybeCorrectAreaFlagRegion`)
  are untouched — only the rendering decision changed.
- Regression test: `tests/fixtures/uniq-drop-name-collision-non-area.spec.js`
  (new, + `uniq-drop-name-collision-non-area.html` fixture) — an
  `artist-recordings`-shaped table with two DIFFERENT recordings
  (distinct hrefs, each with its own trailing `<span class="comment">` so
  they're non-bare and feed `entityNameTypeMap`) sharing one title, real
  render via a clicked button + `page.route()` for the paginated fetch,
  then `window.__saTest.getUniqDropSections('Name')`. Confirmed the test
  fails (2 entries, "Same Recording Title (1)"/"(2)") against the pre-fix
  code and passes (1 merged entry, count 2, no "(n)" suffix) against the
  fix. Also extended `tests/fixtures/area-name-collision.spec.js` with a
  unit-level check of the new `_entityNameSplitsByHref()` helper itself
  (`area` → `true`; `recording`/`artist`/`work`/`label`/`undefined` →
  `false`), exposed via a new `window.__saTest.entityNameSplitsByHref()`
  hook. `node --check ShowAllEntityData.user.js` and the full `npm test`
  (chromium-fixtures) suite passed after every edit.

  Building the new fixture also surfaced an unrelated fixture-authoring
  gotcha (not a script bug): `updateH2Count()`'s `filterContainer`
  (`#mb-filter-container`, what `tests/support/browser.js`'s
  `waitForRenderComplete()` waits on) only gets appended to the DOM when a
  real `document.querySelectorAll('h2')` match precedes `table.tbl` in
  document position — a fixture missing the page's native section `<h2>`
  (e.g. `<h2>Recordings</h2>` right before the table, present on every real
  MusicBrainz artist/work sub-page) silently renders the table correctly
  but never shows the filter bar, so `waitForRenderComplete()` times out
  waiting for it. `area-name-collision.html` also lacks this `<h2>`, but
  none of its own tests exercise the render pipeline, so it never surfaced
  there.

## 2026-09-03 — "Show single-table" cross-tab snapshot: Relationships column icons doubled (fixed)

User report: after clicking a `label-relationships`/`place-performances`
sub-section's "Show single-table" button, the "Relationships" column's
icons appeared doubled — the exact same relationship icon(s) rendered
twice in a row, only for rows whose Relationships fetch had already
produced *some* content by the time the snapshot tab was saved (rows still
pending stayed correctly empty). Reported alongside (but distinct from)
the `_ensureReCell()` column-swap bug fixed earlier the same session —
same feature, different mechanism.

**Snapshot**: `debug/work-rec-double-relationships.html` — a rendered
"Show single-table" tab for the "Distributed release" category on
`/label/0b805b9c-ea03-4fc1-b50d-6dcef76433e0/relationships`, saved
mid-fetch. Confirmed via a small extraction script: of the 20 `mb-rel-cell`
tds that had any content at save time, 19 had every href duplicated
exactly once (the 20th genuinely has zero relationships); the remaining 48
were still empty (not yet reached).

**Root cause**: `_hydrateAndRenderFromSnapshotData()`'s tail calls
`runFilter()` — whose single-table branch has its own "re-populate any
`td.mb-rel-cell` not yet marked `data-rel-done`" check
(`if (document.querySelector('td.mb-rel-cell:not([data-rel-done="1"])')) initRelationshipsColumn();`)
that fires internally, synchronously, the moment `runFilter()` runs, since
every restored cell is unpopulated right after hydration. Moments later —
well before that first invocation's Phase 1 (parallel IDB lookup) / Phase 2
(1100ms-throttled WS2 queue) has resolved anything — the hydrate tail's own
later code calls `initRelationshipsColumn()` again directly (this second
call exists for a real, separate reason: a disk-load whose cells are
*already* fully populated needs this call to run the "nothing to fetch —
show the completion toast" branch, since nothing else would). Both
invocations independently compute the *same* not-yet-done MBID set (`67
unique MBIDs` logged twice, ~86ms apart, confirmed live via
`sa_enable_relationship_debug`), both fetch/resolve the same data, and both
call `_populateCells()` — which *appends* icons via `_relAppendIcon()`
rather than replacing cell content — so every icon lands twice.
`initReleaseEventsColumn()` has no equivalent second call site and was not
affected.

**Fix**: `initRelationshipsColumn()` is now a thin re-entrancy-guarded
wrapper (`ShowAllEntityData.user.js`, module-level
`_relColumnActivePromise`) around the unchanged original implementation
(renamed `_initRelationshipsColumnImpl()`) — a call arriving while one is
already in flight awaits the in-flight run and returns, instead of
starting a second overlapping pass over the same not-done cells. Confirmed
live (same debug-logging technique): only one `initRelationshipsColumn: N
unique MBIDs` log line now, and zero cells with duplicate hrefs.

**Regression test**: `tests/live/label-relationships-single-table-column-swap.spec.js`
— added a second test to the same file (same page already exercises this
race, since `#mb-filter-container` becomes visible long before the
throttled Relationships fetch finishes): confirms the source page's own
fetch is still incomplete at click time (guards against the test
trivially passing once the fetch eventually completes on its own), then
waits for at least 3 popup cells to reach `data-rel-done="1"` and asserts
none carry duplicate `<a>` hrefs. Confirmed failing pre-fix (reproduced
the exact `debug/work-rec-double-relationships.html` duplicate) and
passing post-fix.

## 2026-09-06 — search?type=recording continuation rows shifted four columns left (fixed)

**Snapshots**: `debug/search-recordings-initial.html` (native page 1) and
`debug/search-recordings-final.html` (after "Show all Search Results for
Recordings"), both for
`https://musicbrainz.org/search?query=roulette&type=recording&method=indexed`.

**Shape**: MusicBrainz paginates these results by RECORDING — "Found 5,362
results" over 215 pages, 25 per page — but renders one `<tr>` per
*(recording, release)* pair. The recording's own four columns (Name, Length,
Artist, ISRCs) appear only on the first release's row; every further release
is a **continuation row**:

```html
<tr><td colspan="4">&nbsp;</td>
    <td>…release…</td><td>7/10</td><td>4</td><td>Album + Compilation</td></tr>
```

Page 1 of the initial snapshot is 42 `<tr>`: **25 base rows + 17 continuation
rows**. Because pagination is per recording, a recording's continuation rows
are always on the same page as its base row — there is no page-boundary case
to carry across a fetch.

**Root cause**: the row-import loop had no notion of a continuation row. Such a
row has `cells.length === 5 > 1`, so it passed the generic data-row test, was
imported, and then had its cells addressed **positionally** — `row.cells[colIdx]`
ignores `colSpan` entirely. Everything on it read four columns to the left:
release title → Length, Track → Artist, Medium → ISRCs, Type → Release.

**Why the symptom looked like a Length-column bug**: with a release title
sitting in the Length column, `applyIntegerColumnStyling` wrapped it in that
column's `align: ':'` split spans, and `finalizeSplitAlignedColumns` then sized
*every* Length cell in the table to the longest title — visible in the final
snapshot as `min-width: 51ch` on `.mb-ic-right` and a 5557 px-wide table. The
misaligned Medium/Type values also picked up `.mb-text-clamp-marker` prose
wrappers, because a bare non-list cell in a `collapsableColumns` column is a
prose candidate.

**Fix**: new `features.mergeContinuationRows` (enabled on the search pageType's
`Recordings` entityFeatures), plus `_isContinuationRow()` /
`_buildContinuationSourceRow()` / `_mergeContinuationRowInto()`. A continuation
row is folded into the preceding data row, one extra `<li>` per column, and the
four release-side columns are declared in `renderMultiRowCell` so every row —
including single-release ones — carries the same `<ul><li>` shape. Detection is
structural (an empty spanning first cell), not keyed on the page type.

Two things fell out for free because both already handled `ul > li` cells:
`_artInitInlinePics()` gives each release in a merged cell its own inline
thumbnail, and `initExpandRGsFeature()` gives each its own ▶ toggle.

**Also fixed alongside**: `finalizeRLCColumnWidths()` sized an L/R/C integer
column from `span.textContent`, which on a merged cell is the *concatenation*
of every `<li>` — a three-release "Track" cell read as `"7/1012/254/9"`, 12
chars instead of 5. New `_rlcValueLength()` measures the longest single `<li>`
instead. This only ever mattered for a column that is both an `integerColumns`
and a multi-row column, which "Track"/"Medium" here are the first instance of.

**Regression test**: `tests/fixtures/search-recordings-continuation.{html,spec.js}`
— hand-trimmed 3-recording fixture (3 releases / 2 releases / 1 release).
Asserts 3 rendered rows rather than 6, no surviving `td[colspan]`, every row's
Length parsing as `M:SS` (the direct assertion against the shift), the per-column
`<li>` counts, that the four columns stay row-aligned, that a comma-bearing
release title is not comma-split, and the 2ch `min-width` on the Medium value
span. Confirmed failing pre-fix (6 rows) and passing post-fix.

## 2026-09-06 — follow-up on the above: three separate reasons Track/Medium wouldn't line up

Reported from a live screenshot of the fixed page: the merge itself was right,
but the "Track" and "Medium" values "looked distorted". Three independent
causes, found by measuring `getBoundingClientRect()` in a Playwright fixture
rather than reading CSS — worth recording because two of them are invisible in
the DOM and the third only reproduces WITHOUT MusicBrainz's stylesheet.

**1. `padding-right` on some cells only (10.5 px drift).**
`td.mb-has-collapse-toggle { padding-right: 22px !important }` reserves space
for the absolutely-positioned toggle, but lands only on cells that HAVE a
toggle. `applyIntegerColumnStyling` centres its value span in the `<td>`, so
half of that padding shifts the value: the same "1" in "Medium" measured
`right: 1264.5` in a toggle row and `1275` in a single-row one. New
`td.mb-collapse-col-pad` reserves the same space on every other cell of a
toggle-bearing column (added by `initCollapsableColumns`, cleared by its own
idempotent cleanup pass). No-op for left-aligned columns; no width cost, since
the auto-resize pass already budgets the toggle once per column.

**2. An unstyled `<ul>` (4 px drift) — only reproducible without MB's CSS.**
`applyRenderMultiRowCells` was the ONLY list builder in the script that didn't
reset the `<ul>` it creates (`splitCountryDate` line ~4710 and the CAA art list
both do `list-style:none;margin:0;padding:0`). Measured in the fixture:
`padding-inline-start: 40px`, `margin: 16px 0`, `list-style-type: disc`. The
40 px is added to the containing box, so the `.mb-ic-val` span measured 56 px
for a 2-char cell and 48 px for a 1-char one — `min-width: 2ch` (16 px) never
binds — and centring turned that into a 4 px drift. On the real page MB's own
stylesheet hides this; the dependency is still a bug. Now reset like the rest.
Lesson: a fixture with no MusicBrainz CSS is a FEATURE here — it surfaces exactly
this class of "works only because the host page happens to fix it" defect.

**3. Merged `<li>`s never got integer-column styling (the actual "distortion").**
`applyIntegerColumnStyling()` is the last step of row assembly and guards on a
per-CELL `data-mb-int-col-styled` flag — but a continuation row isn't parsed
until after the base row is fully assembled, so every `<li>` the merge appends
arrives too late. Invisible for `align: 'R'` (that branch wraps the whole `<ul>`
in one `.mb-ic-val`, so late items land inside it and inherit everything), but
for a split-aligned column it meant each cell had exactly ONE `.mb-ic-sep`, on
its first item. `_mergeContinuationRowInto()` now styles what it appends, via
`_styleIntColListItem()`, resolving the column's `align` from
`activeIntegerColumns` by the destination index.

**Also**: "Track" ("N/M") switched from `align: 'R'` to `align: '/'`, so the
separator sits at one horizontal position for the column instead of values
merely ending flush right ("5/13" and "23/39" lined up on the 3 and the 9).
That required teaching split alignment about multi-row cells at all:
`applyIntegerColumnStyling` builds one `.mb-ic-wrap` per `<li>` (the old code
read the cell's concatenated text, split at its LAST separator, and cleared the
cell to rebuild it — destroying the list), and `finalizeSplitAlignedColumns`
measures/widens every span pair in a cell, not just the first.

**Measured after all four changes**: every "Track" separator at x=246.8 and
every "Medium" item's right edge at x=1208.5, across all 6 items in 3 rows,
toggle rows and non-toggle rows alike. Locked in by a second test in the same
spec file, which drives the real `#mb-col-collapse-all-btn` (and must
`waitForFunction` on all 6 items having layout — reading straight after the
click catches the table mid-re-render and sees only each cell's first item).

**Picard**: `_picardExtractRowEntity()` → `_picardExtractRowEntities()`, one ♪
button per release. The first taggable anchor in document order still decides
the entity type AND the cell — unchanged on every other page — but that whole
cell is now harvested. Anchoring on the first match's own cell is what stops it
over-collecting elsewhere (a `release-tracks` AR column holds many unrelated
`/recording/` links, but is never the row's first entity cell). Note this page's
`stickyColumn: 'Name'` is why it targets Release and not the recording at all:
the extractor skips `.mb-sticky-col`, so the Name column's `/recording/` link was
never a candidate.

**Picard, round 2 — making it an actual multi-row column.** Buttons laid out
inline read badly the moment a recording had eight releases (screenshot: a row
of eight ♪ crowded onto one line, aligned with nothing). One `<li>` per entity
instead. The interesting part is why it can't just be declared collapsable:

- `initPicardTaggerColumn()` runs LAST on every render path, and has to — the
  Picard `<td>` must be appended after the Relationships cells to stay
  rightmost. So both the initial render (`initCollapsableColumns` at the
  `renderFinalTable` tail, Picard ~250 lines later) and `runFilter()`'s
  single-table branch (collapse pass, then Picard rewire) do their collapse
  pass before the column exists.
- Worse, rewire mode does `_td.innerHTML = ''` and refills, which would wipe a
  `.mb-cell-collapse-toggle` the collapse pass had added (the toggle is a `<td>`
  child, not inside the `<ul>`).
- Reordering the call sites was the tempting fix and is the risky one — the
  Picard-after-Relationships ordering is load-bearing on several paths.

So `initPicardTaggerColumn()` registers "Picard" on
`activeDefinition.features.collapsableColumns` and re-runs
`initCollapsableColumns()` itself, but ONLY when some row actually produced >1
button (`_anyMultiRowPicardCell`) — so no other page pays for it. Registration
is `concat`, not `push`: `activeDefinition.features` is rebuilt per fetch but
its `collapsableColumns` VALUE is the page definition's own array, and pushing
would mutate the definition for the session. `initCollapsableColumns()` never
calls back into Picard, so there is no loop.

Measured after: Picard cells 3/2/1 `<li>`, collapsed to 1 with a `▶3▤` toggle
matching the Release cell beside them, and expanding together via
`#mb-col-collapse-all-btn`.

**Known limitation, not new to Picard**: when a source `<li>` WRAPS to two lines
(a long release title in a narrow column) the neighbouring columns' items no
longer line up with it — each `<td>` has its own `<ul>` and its own item
heights. Measured in the fixture, where the Release column is narrow: Release
item tops 267/286/323 against Picard's 285/304/323. This affects Track/Medium/
Type and Label/Catalog# on other pages identically; it is inherent to the
multi-row-cell approach, and does not show on the real page, where auto-resize
gives the Release column enough width not to wrap.

## 2026-09-07 — `_artSyncSearchTextToSourceRow()`'s index lookup in merged view (investigated: NOT a live bug)

**This entry supersedes an earlier version of itself that claimed a
user-visible symptom. That claim was wrong** — it was reasoned from the code
and written up before anything ran. Measured, the symptom does not occur. What
follows is the corrected record.

### The weakness (real, in the code)

`_artSyncSearchTextToSourceRow()` mirrors a CAA/EAA cell's per-image
type/comment text onto the source row, which is what makes a typed filter over
a CAA column match at all on `tableMode: 'multi'` pages (the live cell is a
clone; the row `runFilter()` reads is not). It resolves that source row by
table POSITION:

```js
const tableIndex = Array.from(document.querySelectorAll('table.tbl')).indexOf(liveTable);
const group = groupedRows[tableIndex];
if (!group) return;
const sourceRow = group.rows.find(r => r.dataset.mbRowIdx === rowIdx);
if (!sourceRow) return;          // ← silently gives up
```

That assumes every row in a live table belongs to the group at the same index.
Merged discography view does break the assumption: `_applyDiscographyViewFilter()`
fills each first-occurrence table with CLONES of every same-category group's
rows, so relocated rows sit in a table whose `groupedRows` entry does not
contain them, and the lookup misses.

### Why it produces no symptom

A folded-away duplicate section keeps its STALE rows in the DOM —
`_applyDiscographyViewFilter()` marks the h3 `data-mb-disc-hidden="true"` and
hides the table but never empties it — and **artwork is built in those hidden
tables too**, where the DOM index still lines up with the row's own
`groupedRows` entry. Every relocated row therefore gets its search text synced
through its hidden twin, and the failed lookup on the visible merged copy costs
nothing.

Measured on `/artist/5d02f264-…` (Simon & Garfunkel, 123 rows / 17 sections,
22 rows in duplicate sections), switching to merged view BEFORE any artwork was
built so nothing could have synced beforehand:

```
CAA cells built, visible tables    85
CAA cells built, hidden tables     72     ← the masking mechanism
sampled relocated row              105, one hidden twin, twin's cell built
typed CAA filter on its own text   row survives — sync DID reach it
```

### What was done about it

Nothing to the userscript. `CLAUDE.md` requires a fails-before/passes-after
test for a DOM/rendering fix, and no such test can be written for a defect that
does not manifest; changing a working lookup on reasoning alone is how a
regression gets introduced for free.

Instead `tests/live/merged-view-caa-search-sync.spec.js` was added as a
REGRESSION GUARD. It passes today. The masking rests on pure waste — 72 artwork
builds nobody can see — so the obvious future optimisation ("don't build
artwork in hidden tables") would remove it and make the weakness live
immediately. That spec is what would catch it, and it names the one-line fix
(`_findMasterRowByIdx()`, which `_artResolveSourceCounterpart()` already uses)
in its own header.

### Method note

The first attempt to write this test compared each row's table index before and
after the switch to decide "was it relocated". That is wrong twice over: the
view switch re-renders the whole table set, and the stale twin means a
relocated row exists in TWO tables afterwards, so the diff can resolve to the
hidden copy. It did — the run picked a row inside a hidden table and failed on
the filter input's visibility, nowhere near what it meant to assert. The
working signal is the section's category ORDINAL: merged view moves exactly the
rows in the 2nd, 3rd, … occurrence of a category.

## 2026-09-07 — inline cover-art thumbnails torn down on every multi-table re-render (fixed)

The second of the two items 9.99.1038 carried forward. Its sibling — the icon
column — was fixed by `_artMirrorIconToSourceRow()`; the inline thumbnails were
not, and the changelog said why in one line: *"it needs the placeholder
constructed, not just a value copied."*

### Why the icon fix could not be reused

`_artMirrorIconToSourceRow()` writes a VALUE (`background-image`) onto a
`span.caa-icon` the source row already owns, because that span comes from
MusicBrainz's own markup and `cloneNode(true)` carries inline styles through.

An inline thumbnail is a NODE this script creates. `_artInitInlinePics()` walks
`document.querySelectorAll('table.tbl')` — the live clones — so on
`tableMode: 'multi'` the rows in `groupedRows[i].rows` have never held a
`.mb-caa-inline-ph` at all. `_stripTransientCellState()`'s `preserveLiveArt`
placeholder branch (which is what makes single-table work) therefore had nothing
to match, and every thumbnail was deleted and re-resolved on every sort and
every filter keystroke.

### The fix

`_artMirrorInlineThumbToSourceRow(livePh, ctx)` clones the whole placeholder
onto the matching source cell. `_artResolveSourceCounterpart()` was split so its
row/cell half (`_artResolveSourceCell()`) can be reused by a caller that has to
BUILD its target rather than find it. Both keep `_findMasterRowByIdx()` — merged
view folds other groups' rows into the first-occurrence table, so a group-index
lookup misses exactly those rows.

`renderGroupedTable()`'s row insertion clones the source row WITHOUT stripping
it, so the live row arrives with the image already showing and lands in
`_artInitInlinePics()`'s Case C1 — hover + bigbox tooltip re-wired, live image
kept, nothing re-resolved. That branch already existed for exactly this shape.

### Measured

```
                        small RG (7 rows)   Springsteen RG (124 rows / 3 tables)
inlineThumbsAtInsert    0/7  ->  7/7        0/119  ->  119/119
iconsPaintedAtInsert    7/7 (unchanged)     119/124 (unchanged)
archiveFetches          0                   0
```

`discography-view-artwork.spec.js`: all four views green, 0 archive requests in
each. `save-to-disk-strips-live-artwork.spec.js` green with a new assertion that
no `mb-*-inline-ph` reaches the payload; saved JSON stayed 66 082 bytes, so the
strip really does remove them. Mutation-verified: an early `return` in the mirror
makes the new assertion fire.

### Two placement traps, both checked rather than assumed

- **ERG button ordering.** The live injection puts the placeholder after the
  cell's `[data-erg-btn]`. Source rows have no such button (`initExpandRGsFeature()`
  injects into the live DOM), so the mirrored placeholder lands first — and that
  is correct, because ERG runs BEFORE the inline-thumbnail pass in
  `renderGroupedTable()`'s tail and prepends its ▶ ahead of it
  (`parent.insertBefore(button, parent.firstChild)`), reproducing a fresh page's
  order.
- **The `_hadInlineArtPh` jesus2099 gate.** Planting a placeholder on a source
  cell arms that gate for the cell at serialisation time, where it was previously
  never armed. It cannot misfire: `ColumnDataExtractor.caa`'s Path A *moves*
  (not copies) a jesus2099 anchor into the synthetic "CAA" column — "detach from
  source so the title cell is clean" — and no page definition names "CAA" as its
  `addCAA`/`addEAA` column (the eight distinct values are Release, Title, Release
  group, Name, Entered from release, Release title, Release groups, Event). So
  the protected anchor and the mirrored placeholder are never in the same source
  cell.

### Still open

Sorting one sub-table still re-renders all of them (`rowsInserted` 124 for a
sort of the 119-row sub-table; `survivingTaggedTables` 3/3 — the `<table>`
elements are reused, only their rows are replaced). It costs no network traffic
now that both mirrors have landed, so this is CPU/DOM waste rather than anything
visible.

## 2026-09-07 — sorting one sub-table re-rendered all of them (fixed)

The last of the two items 9.99.1038 carried forward, and the one three earlier
sessions deferred as "needs the render redesign". It did not: the information a
scoped render needs is already in hand at click time.

### What was actually happening

`makeTableSortableUnified()`'s handler mutates exactly one array
(`groupedRows[groupIndex].rows`) and then does:

```js
_invalidateFilterCache();
runFilter();
```

Two separate pieces of waste follow from those two lines:

- The wholesale cache clear forces a full `testRowMatch()` membership pass over
  every row of every group — but a re-order cannot change which rows MATCH, only
  the order of an already-correct array.
- `runFilter()`'s multi branch then re-clones, re-strips, re-highlights and
  re-inserts every row of every group, and `renderGroupedTable()`'s reuse branch
  wipes all 17 tbodies and re-runs the whole per-group decorate pass —
  `initCollapsableColumns()` and its full unique-value column scan included.

### The fix

`_renderDirtyGroupIdxs` (a `Set`, or `null` meaning "everything", which is what
every other entry into `runFilter()` sees) plus `_invalidateFilterCacheForGroups()`
and `_sortDirtyGroupIdxs()`. Set in the sort handler, cleared in its `finally` —
not right after `runFilter()`, so an exception mid-render cannot strand a later
keystroke rendering only one sub-table.

Two details worth keeping:

- **The cache drop is by group index across ALL `discographyViewState` values.**
  The key is `m:<view>:<groupIdx>`, so dropping only the current view's entry
  leaves a pre-sort ordering cached under another view, ready to come back on the
  next switch.
- **The colon-alignment finalizers are skipped on a scoped pass.** They measure
  one shared width across the whole rendered row set. A re-order does not change
  that set, and running them on a `filteredArray` with the undisturbed groups
  emptied would narrow every column to what the sorted sub-table alone needs.

### Merged view: carved out, then measured

`_sortDirtyGroupIdxs()` adds every same-category group in merged view, because
`runFilter()` renders such a category from the union of all of them. Measured
afterwards: those co-contributors cost nothing. They are the hidden duplicate
tables whose rows are already folded into the visible one, so re-rendering them
empties their tbody and inserts no rows — `sortProbe.rows` came out equal to the
sorted table's own row count in merged view exactly as in the other three, so the
spec needed no merged-view exception at all.

### Measured

```
                          small RG (2 tables)   Springsteen RG (3 tables)
rows re-inserted by a sort   7 -> 6                124 -> 119
icons painted at insertion   6/6                   (unchanged)
inline thumbs at insertion   6/6                   (unchanged)
archive requests             0                     0
```

### A test-quality trap this created

`discography-view-artwork.spec.js` picked "the first visible sub-section" to
sort. That was harmless while a sort re-rendered all 17 tables — it still
exercised 123 rows — but under scoping it exercises only the sorted one, and this
page's first visible section holds ONE row. The artwork assertion silently became
`1 of 1` in three views and `0 of 0` in Non-Official: passing, and proving
nothing. It now picks the visible section carrying the most painted artwork and
asserts a non-vacuity floor (>1 row, >0 painted) before measuring.

The same shift applies to `caa-icon-survives-sort-multi.spec.js`: its artwork
guarantees now compare against the SORTED sub-table's own counts rather than the
page-wide ones, because artwork in an untouched sub-table is never re-inserted
and cannot appear in an insertion-time tally.

### Follow-up: why the saved payload got 20% bigger (not a leak)

Noticed during verification: `save-to-disk-strips-live-artwork.spec.js` reported
65-67 KB of JSON before the scoping and 78-82 KB after, consistently. Chased it
rather than waving it off, by capturing a payload from each arm (scoping toggled
in place, one variable) and diffing them by top-level key:

```
key        unscoped   scoped     delta
headers       25654    38748    +13094      <- essentially all of it
groups        28352    30155     +1803
```

Per-column, every header differed in the same way — and in the SCOPED payload's
favour:

```
                        badges  filled  populated-tooltips  placeholder-tooltips
unscoped.json.gz            22       0                   0                    22
scoped.json.gz              22      19                  38                     2
```

The 📊 unique-value count badges (`.mb-col-uniq-count`) and their real tooltips
("Show the 6 different unique values in this column…") are PRESENT after a
scoped sort and ABSENT before it. `initCollapsableColumns(table)` →
`_scheduleColHeaderCounts(table)` is part of the per-group work now skipped for
an undisturbed sub-table; unscoped, every sort reset all 17 tables' badges to
the empty placeholder and re-scheduled the scan, and a save landing before that
finished captured them empty.

Skipping it is correct, not merely cheaper: a sort changes a group's row ORDER,
never its row SET, so the counts it would recompute are the ones already
displayed. Filters — which DO change row sets — never take the scoped path
(`_renderDirtyGroupIdxs` is null for every non-sort entry into `runFilter()`),
so the badges still refresh whenever they can actually change.

So the bigger payload is a more complete one, and the user-visible effect is
that the 📊 counts stop blanking out when you sort some other sub-section.

### Two test-side adjustments the scoping forced

Both specs compared an insertion-time artwork tally against a PAGE-WIDE count.
That was right while a sort re-rendered everything and is wrong now — an
untouched sub-table's rows are never re-inserted, so its artwork cannot appear
in such a tally. Both now compare against the SORTED sub-table's own counts:

- `caa-icon-survives-sort-multi.spec.js` — `target.paintedProbe` /
  `target.inlineThumbs`, measured with selectors byte-identical to the probe's
  `inspectRow()` so the two sides cannot drift.
- `save-to-disk-strips-live-artwork.spec.js` — `target.painted`, whose own
  selector was widened to match the probe for the same reason. Its non-vacuity
  control loses nothing: what it must establish is that the mirrors put live
  blob URLs on the source rows being serialised, and "every painted icon in the
  sorted table came back painted, and there was at least one" establishes
  exactly that.

`waitForSortSettled()` gained an optional `statusLocator`. Its `subTableHeading`
form resolves via `hasText` + `.first()`, which ignores visibility — in
Non-Official view (11 of 17 sections hidden) that resolved to a hidden
duplicate and every action against it timed out.

### One transient, recorded rather than buried

`tag-value-sort-overflow-row.spec.js` failed twice in one window on a
page-level `SyntaxError: Unexpected token '<'` (its own overflow-row assertions
passed; the failure was the final `expect(pageErrors).toEqual([])`). It did not
reproduce: 4/4 green on the branch afterwards and 3/3 on the unmodified tree.
Consistent with MusicBrainz serving an HTML error page for some resource during
a burst, not with this change, which parses nothing.

## 2026-09-07 — PERFORMANCE.org consolidated; CAA/EAA sort-key regression found (recorded, NOT fixed)

Two unrelated things, both from one question: "do the latest CAA/EAA sorting
changes affect what PERFORMANCE.org says?"

### The doc had forked into three incompatible numberings

`main`, `perf-steps-1-4` and `filter-performance-fix-caa-throughput` each had a
different **Step 6** — the sub-table sort scoping (added 2026-09-07),
`_visibleRowSetSignature` order-dependence, and CAA/EAA request-throughput
tuning respectively. That had already broken a live cross-reference:
`ShowAllEntityData.user.js:56582` says "making it order-independent is
PERFORMANCE.org Step 6", which on `main` pointed at the sort scoping. `main`'s
own Step 4 text also cited a "Step 8" that `main`'s copy did not contain.

Resolved by adopting `perf-steps-1-4`'s 6-14 verbatim — the most-developed
scheme, and the one `main`'s own code and prose already pointed at, so both
those references became correct with no edit. What moved instead was
`caa-throughput`'s 6/7/8 (→ 15/16/17) and `main`'s one-day-old Step 6 (→ 18).
There is now a "Step-number provenance" table mapping every old number, because
branch commit messages reference "Step 5/7/12/14" and would otherwise dangle.

The branch-only prose was harvested rather than left in place. The reason is
concrete, not tidiness: `filter-performance-fix-caa-throughput` records
`content-visibility: auto` on `<tr>` as **"Manual validation gate result
(2026-08-20): FAILED — do not implement as designed"**, and `debug/perf.org`
(2026-08-24) proposes re-running exactly that experiment. `main` had no trace of
the failure to prevent it. 374 → 1647 lines; a `verify-no-loss.py` pass confirms
every retained source line survived, with the 18 deliberate edits enumerated.

Also fixed while in there: `main`'s Findings section had entirely stale line
numbers (it cited `:36407` for `runFilter`, now `:42225`) and claimed the
multi-table branch re-clones per group on every render — no longer true for a
sort since Step 18. And the "30–120 s / 8 k+ rows" anchor it cites is still in
the code, at `:56886`; it uses an en-dash, which is why a grep for "30-120"
comes back empty.

### CAA/EAA columns do not sort by artwork presence (pre-existing)

Filed as Step 21. **Not caused by the 9.99.1032-1040 series** — the pickaxe
bottoms out at `cf5042c` (2026-05-16, a repo-wide rename), so it predates the
visible history.

`_CLEAN_STRIP_SEL` (`:38143`) strips `.mb-caa-sort-key` (`:38166`), and
`getCleanVisibleText()` (`:38082`) removes it by clone-and-remove before its
TreeWalker even runs, with a `FILTER_REJECT` belt-and-braces at `:38108`. Both
comparators — `createSortComparator()` (`:18565-18566`) and
`createMultiColumnComparator()` (`:18604-18605`) — read *only*
`getCleanVisibleText()`. `_sortColumnKind()` (`:16552`) has no CAA/EAA branch.
Since `.caa-icon`, `.artwork-icon` and `.mb-caa-count-badge` are in the same
selector, a plain CAA/EAA icon cell resolves to the empty string for every row.

**The strip is correct and must stay** — its own comment gives the reason: a
typed filter of `"no"` would otherwise match `"not readable"`. The real finding
is that the other two consumers each got a replacement and sorting got nothing:

| Consumer             | Replacement                                             |
|----------------------|---------------------------------------------------------|
| Column filter        | explicit bypass, `testRowMatch():41738-41749`           |
| Uniq-values dropdown | migrated to structure-mode relabeling ("✓ has artwork") |
| **Sort**             | **none**                                                |

An audit of every sort-key class the script creates shows the damage is confined
to the artwork pair — worth knowing, because "CAA/EAA sorting is broken" was the
first summary and it was too broad:

| Class                              | In `_CLEAN_STRIP_SEL`? | Contract                                                                                                                                                                 |
|------------------------------------|------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `mb-caa-sort-key` (serves EAA too) | yes `:38166`           | **broken**; JSDoc `:3614` still claims `"no" < "yes"`                                                                                                                    |
| `mb-inline-art-sort-key`           | yes `:38155`           | filter-only by design, no sort contract broken — but `_artSetInlineSortKey()`'s JSDoc claims the strip pass excludes its class and that no bypass is needed. Both false. |
| `mb-cancelled-sort-key`            | no                     | intact; JSDoc `:3827` correct                                                                                                                                            |
| `mb-video-sort-key`                | no                     | intact; JSDoc `:3525` correct                                                                                                                                            |

`.mb-eaa-sort-key` is in the selector but never created — the `caa` extractor
always writes `mb-caa-sort-key` for both.

**Why it went unnoticed:** no spec asserts a CAA/EAA column *orders* by artwork
presence. `caa-icon-survives-sort.spec.js` and its multi sibling assert artwork
*survives* a sort — a different guarantee, and one that is met.

Deliberately not fixed in that session: it is a userscript change needing a
version bump, a changelog entry, a regression test (there is none) and three
JSDoc corrections, so it gets its own session. Fix shape is in Step 21 — mirror
the filter bypass at `:41749`, and change both comparators together, since they
have silently disagreed before.

## 2026-09-07 — column-header count scan cached; multi-table sub-tables were cancelling each other (fixed)

Branch `perf-step-3-header-count-cache`. PERFORMANCE.org Steps 3 and 22.

**What the scan costs.** `_updateAllColHeaderCounts()` re-derives every visible
cell's clean text and collapse structure per column — 4174 rows × 21 columns is
~88 000 `getCleanColumnText()` calls on the `artist-events` fixture — and runs on
every filter apply, every filter clear, every sort, every column show/hide and
every multi-table sub-table render. It now memoizes per `<table>`, keyed by an
order-independent signature of the visible `data-mb-row-idx` values, keeping the
last four row sets.

**The shared-token bug, found while reading that code.** `_colHeaderCountsToken`
was one module-level counter, but `renderGroupedTable()` schedules a scan once
per sub-table from inside its own loop. Each schedule bumped the shared counter,
so every sub-table but the last abandoned itself before writing a single badge —
silently, because an unwritten badge is an empty `<span>`, not an error. It is
sitting in the committed baselines:

| Baseline                                         | uniq badges | populated |
|--------------------------------------------------|-------------|-----------|
| `artist-releasegroups/rendered.html` (47 tables) | 423         | 1         |
| `releasegroup-releases/rendered.html` (2 tables) | 42          | 14        |
| `artist-events/rendered.html` (1 table)          | 21          | 1         |

The `artist-events` row is a different, benign case: one table, nothing to
cancel — `captureOne()` simply snapshots while the scan is still working through
its per-column slices, and that page's own `post-filter.html`/`post-sort.html`
(captured after `waitForColHeaderCountsStable()`) read 18 and 20 of 21. The token
is now per-table.

**Where the win actually landed, and where it could not.** Measured on
`artist-events`, median of 5, same session: `headerCountsRestore` 12631 → 8944 ms
(−29%, about 3.7 s of scan removed from a filter-clear), `headerCountsInitial`
8507 → 8066 ms (−5%, the micro-costs, not the cache). Everything else flat. That
distribution is the whole finding: a full-table scan happens only at initial
render (a cold miss) and at a filter cleared back to the full set (a cache hit).
Every other scan runs over an already-filtered row set that is small by
construction, so the filter metrics this branch was predicted to improve never
had seconds of work in them to remove.

**A per-cell text memo was built, measured and removed** for exactly that
reason: it can only help a miss, and the only full-table miss is the cold one
where it is still empty. It cost ~88 000 retained strings on this page and a
second staleness surface. See PERFORMANCE.org Step 3's own section.

**Two harness defects the work exposed, both fixed:**

- The new `headerCounts*` metrics first waited only for the `Event` badge and
  reported 1884 ms while most of the header was still blank. The same too-narrow
  wait made this branch's own sort regression test report "sorting changed 15
  badges" when the sort had merely *completed* a scan the test caught mid-flight.
  Both now wait for the value AND for every badge to stop changing.
- `loadFromDiskFixture()` is not offline. It makes the table DATA deterministic,
  but passes no `fixtureFile` to `loadUserscriptPage()`, so no route is
  registered and the page SHELL is fetched from the live site. Two complete
  20-minute perf runs died on a 30 s navigation timeout while roughly one probe
  in three to musicbrainz.org was timing out. `capture-interaction-perf.js` now
  retries a failed sample; `tests/README.org` records the distinction.

**Pre-existing, not caused by this work:** the five `pending-edits-filter.spec.js`
multi-table cases timed out at the 30 s default during this session —
reproduced identically on `main` in the same conditions.

Re-measured the next day on an idle machine, and the first reading of this was
wrong: those five run in **6.7-7.8 s each**, nowhere near 30 s. They were not
marginal, they were starved — this session had perf captures and test suites
running concurrently on a machine already measuring ~2x slow. `--workers=1`
makes no difference to pass/fail either way (141/141 both serialized and
parallel), so the earlier "worth raising the timeout for that file" note was
treating a symptom of my own concurrency. Do not raise it.

`tests/live/artist-events-interactions.spec.js` is a genuine case by contrast,
and got a file-level 300 s budget: measured serially on an idle machine its
tests run 20.9 s to 90 s against chromium-live's 120 s default, so the top of
that range crosses under any load at all. The slowest of them is a pre-existing
case, which is why the budget is file-level rather than two ad-hoc
`test.setTimeout()` calls on the tests added here.

## 2026-09-08 — `petri`'s 2x perf step change: a resident Claude Code session, exonerated; reboot recency implicated (measured, mechanism still unknown)

No code change. Ran the protocol `tests/MEASUREMENTS.org` pre-registered for
its open question "what changed on `petri` on 2026-09-07: a resident session,
or uptime?". Full workings, all arms and every caveat live in that file's
"The answer, 2026-09-08" subsection; recorded here because it was an
investigation with a result, and because it falsified prose elsewhere.

Three arms, all `petri`, all 9.99.1049, `artist-events` disk fixture,
`globalFilter` shown (the other six metrics move the same way):

- **C** — 18 d uptime, 30 h-old session resident: 3634 ms
- **A** — 18 d uptime, no `claude` process at all: 2820 ms (user-run from a
  plain terminal; cannot be run from inside Claude Code). Reached by closing
  C's 30 h session, not by never having run one — `claudeResident: 0` cannot
  distinguish those, so A tests "not running", not "never ran".
- **R** — 10 min after a full host reboot, fresh session resident: 2388 ms

**The LIVE session is not the cause.** A moved four of seven metrics not at
all or slightly the *wrong* way against C. R is faster than A on all seven
(1.18-1.68x) *while carrying a session A does not have* — the fastest `petri`
arm ever recorded at this version had Claude Code running during it.

**But a session's RESIDUE is not exonerated, and I first said it was.** Arm A
reached `claudeResident: 0` by closing C's session, not by never having run
one. If a session leaves something that outlives the process and only a reboot
clears, the measured ordering (C 3634 residue+live, A 2820 residue only, R 2388
live only) is exactly what you would expect — and the 30 h session started
`Mon Sep 7 16:40:22`, inside the 11:41-18:58 bracket the step change falls in.
Generic uptime accumulation fits equally well and arm D separates neither.
Only an **arm E** does: ~18 days of uptime on a `petri` that has never run
Claude Code.

**Reboot recency reproduces the whole ~2x**, and it also kills the
cross-machine conclusion recorded the previous evening: rebooted `petri` sits
at 0.86-1.24x of `NB-3641` against the 1.17x that 28-vs-24 cores predicts, so
the "1.5-1.85x is the machine" table was measuring reboot recency with a
machine ratio inside it. Corrected in place in `tests/MEASUREMENTS.org` and
`PERFORMANCE.org`.

**What it does not explain**, and the reason this is not closed: `petri` was up
18 days *across* 2026-09-07 and never rebooted, so the step change happened
inside one uptime. "Uptime" names what **clears** the slow state, not what
causes it, and there is still no process leak or memory pressure to point at.

**Two process notes worth carrying forward.** Arm B (18 d uptime + fresh
session) is permanently unobtainable — an unplanned host reboot landed 31 min
after arm A finished, and that uptime cannot be recreated. And arm C, captured
21:07 UTC, predates by 29 minutes the commit that added `uptimeHours`/
`claudeResident` to the `machine` block, so the one arm whose conditions the
whole question turns on records them nowhere in its own JSON. That is exactly
the gap those fields were added to close, missed by a single arm.

Three arms outstanding:

- **D** — rebooted `petri`, no `claude` process. Closes the 2x2 cell; R
  bounds it at <= 2388 but does not replace it. One run.
- **E** — ~18 days of uptime on a `petri` that has never run Claude Code.
  The only arm that separates "a session leaves residue" from "uptime
  accumulates on its own". Costs 18 days of discipline, not runtime.
- **F** — `NB-3641`, freshly rebooted, `--label=rebooted`. Every
  cross-machine ratio in `tests/MEASUREMENTS.org` rests on one `NB-3641`
  arm captured ~73 min before `uptimeHours` existed, so its "freshly
  rebooted" condition is recollection, not measurement. If that box was
  also slowed, the post-reboot 0.86-1.24x understates the machine gap
  instead of settling it. One run.

## 2026-09-09 — uniq-dropdown "Entity info - Area name" flag replaced the generic glyph and rendered before the name (fixed)

Reported via two debug snapshots of `artist-events`
(`https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f/events`):
`debug/originally-country-flag-right.html` (final rendered page) and
`debug/originally-country-flag-right-uvdd.html` (the "Location" column's 📊
dropdown opened, filtered to "Spain"). The dropdown's "Entity info - Area
name" section rendered the country entry as `[🇪🇸] » area name: Spain` — the
real country flag had taken the generic area glyph's slot, before the name,
rather than appearing alongside it.

Root cause: `makeValueSynItem()` (ShowAllEntityData.user.js, grep
`const makeValueSynItem = (kind, value, count, glyphClass, entityType, flagNode, hrefOverride) =>`)
built one `markerSlot` before the label and filled it with a strict
either/or — `flagNode` (a baked `<span class="flag flag-XX">`, from
`entityNameFlagMap`/`_bakeFlagIconNode()`) when present, else the generic
`glyphClass` marker (`arealink`). The main table's own area-chain rendering
(`_routeAreaLink()`/`_buildFlagSegmentsForRoot()`) never has this conflict —
confirmed against `debug/originally-country-flag-right.html`'s native
`<span class="flag flag-ES"><a…><bdi>Spain</bdi></a></span>`, which simply
IS the country segment, with no separate generic-glyph slot to compete
with.

Fix: `markerSlot` now always renders the generic glyph for `kind ===
'name'`; when `flagNode` exists, a second, separate marker span is appended
AFTER the label instead, cloning `flagNode` the same way `flagIconMap`
already does elsewhere. Result:
`[area glyph] » area name: Spain [🇪🇸]`. `revcountry`/`countrycode` kind
entries are untouched (their `glyphClass` already IS the combined `flag
flag-XX` string — there is no separate generic glyph to preserve there).

New regression coverage:
`tests/fixtures/uniq-drop-area-name-flag-position.spec.js` (+ matching
`.html` fixture) — asserts the leading marker slot carries `arealink` (not
a `flag-` class) and a trailing sibling after the label carries the real
`flag flag-XX` class. Verified failing against the pre-fix code (reverted
`ShowAllEntityData.user.js` via `git stash`, re-ran, confirmed the "flag
replaces glyph" assertion failed) before restoring the fix.

## 2026-09-09 — uniq-dropdown "Entity info - Area name" never showed a flag for a SUBDIVISION, only the country (fixed)

Follow-up to the same-day fix above. That fix generalized correctly to any
`kind === 'name'` entry with a `flagNode`, but `flagNode` itself was only
ever populated for the country segment, because the underlying icon
detection (`_routeAreaLink()`'s inline check, `_findCellEntityRefs()`'s
`flagEl` expression, and `_buildFlagSegmentsForRoot()`'s `iconSel`) only
recognized `a.closest('.flag')` (native) and a sibling `span.area-icon`
(an old third-party shape) — neither of which either CURRENTLY registered
interop fixture actually produces.

Read the real fixture sources rather than trusting the existing JSDoc,
which named `span.area-icon` as "More Flags Everywhere"'s shape:

- `tests/fixtures/live-userscripts/MusicBrainz_More_Flags_Everywhere.user.js`'s
  `createFlagIcon()` now builds `<span class="custom-area-icon"><img
  class="flag-custom-region"></span>`, inserted as
  `a.previousElementSibling` — same POSITION as the old shape, renamed
  class. The old `area-icon` name is not dead, though: the existing
  `tests/fixtures/area-name-collision.html` fixture (New York
  city/state collision) still uses it, so both class names needed to stay
  recognized, not swap one for the other.
- `tests/fixtures/live-userscripts/MusicBrainz_Right_Side_Flags_Everywhere.user.js`
  (per the user: intended to eventually replace More Flags Everywhere)
  produces a THIRD, structurally different shape via `insertFlags()`: the
  anchor is wrapped in `<span class="mfe-flag-wrapper">`, with the icon as
  a TRAILING `<img class="mb-hq-flag-img">` sibling *inside* that same
  wrapper, after the anchor — not a preceding sibling at all.

The main table cell never showed this gap because both third-party
scripts run their own page-wide `MutationObserver` and repaint whatever
DOM currently holds a `/area/` anchor (including this script's own
rendered cells) on every mutation — so the visible table looks right
regardless of what this script's own selectors match. The dropdown has no
such live repaint; it bakes a one-time snapshot into `entityNameFlagMap`,
so its gap was directly visible: a subdivision like "Catalunya" never got
a `flagNode` with either script active.

Fix: one new shared helper, `_findAreaLinkIcon(anchor)` (grep anchor
`function _findAreaLinkIcon`), recognizing all three shapes plus the
native flag, built from three named selector constants
(`AREA_ICON_PRECEDING_SIBLING_SEL`, `AREA_ICON_WRAPPER_SEL`,
`AREA_ICON_TRAILING_IMG_SEL`) so `_buildFlagSegmentsForRoot()`'s `iconSel`
is built from the SAME constants instead of an independently-typed copy —
directly closing the "two implementations quietly disagree" gap that
caused this bug (the MFE class rename landed in neither of them).
`_routeAreaLink()` and `_findCellEntityRefs()` now both call the shared
helper instead of their own inline checks. `_bakeFlagIconNode()`'s
verbatim-clone branch was widened from `classList.contains('area-icon')`
alone to also cover `custom-area-icon` and any bare `<img>` (RSFE's
shape), same verbatim-clone treatment as before — no new cross-document
portability guarantee, matching the pre-existing limitation of the legacy
shape.

No change needed to `makeValueSynItem()` — the rendering already keyed off
`flagNode` generically per entry, not per country.

New regression coverage:
`tests/fixtures/uniq-drop-area-name-flag-thirdparty-shapes.spec.js` (+
`uniq-drop-area-name-flag-mfe-shape.html` /
`uniq-drop-area-name-flag-rsfe-shape.html`) — one case per third-party
shape, each asserting the leading `arealink` glyph plus a trailing icon
matching that shape's own class (`img.flag-custom-region` /
`img.mb-hq-flag-img`). Verified both fail against the pre-fix code (`git
stash` on `ShowAllEntityData.user.js` alone) before restoring the fix.

## 2026-09-09 — `#sanojjonasRoot` survived on a fully-rendered `artist-events` page (fixed)

Unrelated to the two entries above — reported separately in the same
session ("why is `#sanojjonasRoot` still there, it should have been
removed by now with one of our sanojjonas fixes").

Root cause, found by grepping every `removeSanojjonasContainers()` /
`_watchForLateSanojjonasInjections()` call site: two of them —
`performClutterCleanup()` and `startFetchingProcess()`'s normal fetch
path — were gated on `pageType === 'events' || _isReleaseGroupsMultiMode()`.
**`pageType` is never literally `'events'`.** Grepping `pageDefinitions`
confirms it only ever assigns `'artist-events'`, `'area-events'`, or
`'place-events'` — no entry anywhere uses the bare string. Both guards
were therefore dead code on every real events page: the one-shot
`removeSanojjonasContainers()` call there never ran, and — the part that
actually surfaces as a bug — `_watchForLateSanojjonasInjections()` never
got armed either.

That watcher's `MutationObserver` is the ONLY thing that can catch
sanojjonas injecting its container AFTER this script's own render has
finished; its own JSDoc already documented this exact race (confirmed via
the referenced `debug/s-present-on-final.html`, 2026-08-28: a
fully-rendered `artist-releasegroups` page with `#sanojjonasRoot` still
present because the button was pressed before sanojjonas had rendered
anything). `finalCleanup()` has its own UNCONDITIONAL one-shot check
(`if (_findSanojjonasContainers().length > 0) removeSanojjonasContainers();`),
which is why the container isn't ALWAYS left behind — only when
sanojjonas' own async script finishes after that check has already run,
which is exactly the scenario the never-armed watcher was supposed to
cover on events pages and silently didn't.

Fix: introduced `_shouldCleanupSanojjonas()` (grep anchor `function
_shouldCleanupSanojjonas`), checking membership in a new
`EVENTS_PAGE_TYPES = ['area-events', 'place-events', 'artist-events']`
array (the same three values already used correctly elsewhere in this
file for the `_eventCancelledKind` derivation — left that other call site
alone; same underlying fact, unrelated concern) `|| _isReleaseGroupsMultiMode()`.
Both call sites now go through this one helper instead of repeating the
condition inline — directly closing the "two guards can silently drift
apart" shape that caused this bug in the first place. Updated the stale
JSDoc on `performClutterCleanup()` and `_watchForLateSanojjonasInjections()`
that had described the broken condition as intentional.

New regression coverage: `tests/fixtures/sanojjonas-events-late-injection.spec.js`,
reusing the existing `artist-events-cancelled.html` fixture. Loads the
page, clicks the button, waits for render complete (past the point where
`finalCleanup()`'s one-shot check has already run and found nothing),
THEN injects a `<div id="sanojjonasRoot">` — simulating sanojjonas'
own script finishing late — and asserts it gets removed within 3s
(`_watchForLateSanojjonasInjections()`'s `MutationObserver` reacts on the
next microtask after the mutation, so this resolves in milliseconds once
armed). Verified failing against the pre-fix code first (`git stash` on
`ShowAllEntityData.user.js` alone): the injected node was never removed
and the test timed out, confirming this is a real, currently-failing case
and not a no-op assertion.

## 2026-09-09 — "Right Side Flags Everywhere": hollow-duplicate flag icon + artificial "Isra el" space (fixed)

Reported with a real capture, `debug/Israel-flag.html` (`artist-events`,
Location column filtered to "isra"), and a screenshot showing what looked
like two flag icons around "Israel" plus a visible gap splitting the
name. Root-caused by reproducing the EXACT captured markup in a fixture
and dumping the actual rendered dropdown DOM rather than guessing from
the screenshot alone — two genuinely separate bugs, both in code touched
by the same-day subdivision-flag fix above.

**Bug 1 — hollow native flag treated as a real icon.** The captured HTML
for the "Location" cell:
```html
<span class="flag flag-IL" data-hq-processed="1"
      style="background-image: none !important; padding: 0 !important; margin: 0 !important;">
  <span class="mfe-flag-wrapper">
    <a class="arealink" data-flag-processed="1"><bdi>Israel</bdi></a>
    <img class="mb-hq-flag-img" data-hq-flag="IL" src="…Flag_of_Israel.svg">
  </span>
</span>
```
Reading RSFE's own source (`processFlags()`) explains this exactly: *"If
this flag wraps an area link that will be handled by insertFlags,
suppress it"* — RSFE deliberately neutralizes a native `.flag` span's own
background rather than removing it, when it's about to wrap that same
anchor in its own `mfe-flag-wrapper` + trailing `img.mb-hq-flag-img`.
`_findAreaLinkIcon()` checked `.closest('.flag')` BEFORE checking for
RSFE's wrapper, so it returned the hollow, backgroundless outer span
instead of RSFE's real icon — confirmed via a debug dump: the dropdown's
"Entity info - Area name" trailing icon baked to an empty
`<span class="flag flag-IL"></span>` (no image, no background) instead of
the real flag `<img>`.

**Bug 1b — the SAME hollow span also got double-matched by
`_buildFlagSegmentsForRoot()`'s `iconSel`.** Its native-flag fragment was
a bare `span[class*="flag-"]` SUBSTRING check — which also matches
`class="mfe-flag-wrapper"` purely because that string CONTAINS the
characters "flag-" (`m-f-e-‑flag-‑wrapper`), with no relation to the
wrapper actually being a flag. Dumped preview row before the fix:
`Cinema City Hall in <span class="flag flag-IL"></span><span
class="mfe-flag-wrapper"></span>Isra el<img class="mb-hq-flag-img">` — TWO
bogus, empty icon segments in front of the name, each carrying its own
`margin-right: 4px`, before the one real icon at the end.

Fix: `_findAreaLinkIcon()` now checks `AREA_ICON_WRAPPER_SEL` FIRST,
before the native `.flag` ancestor — RSFE's own real icon wins whenever
it's present. `iconSel` was tightened from `span[class*="flag-"]` to
`span.flag[class*="flag-"]:not(:has(${AREA_ICON_WRAPPER_SEL}))` — the
`.flag` CLASS-TOKEN selector (not a substring match) already excludes
`mfe-flag-wrapper` on its own (it has no `flag` token, just one compound
class name), and the `:not(:has(...))` clause additionally skips a native
flag span RSFE has hollowed out, so only the real trailing `<img>` is
ever matched for that anchor.

**Bug 2 — artificial space when a highlight splits a country name.**
Filtering "Location" to "isra" wraps the matched prefix:
`<bdi><span class="mb-column-filter-highlight">Isra</span>el</bdi>` — two
sibling text nodes ("Isra" inside the highlight span, "el" right after)
with nothing between them in the source. `_buildFlagSegmentsForRoot()`
collected each as a SEPARATE `textParts` entry and joined them with
`textParts.join(' ')`, unconditionally inserting a space at every
boundary — "Isra" + " " + "el" = "Isra el". Confirmed via a debug dump
that the dropdown's OWN "Entity info - Area name" LABEL never had this
problem (it reads from an already-correct, separately-built value) — only
the cell-preview row's rendered text did, which is why the bug was easy
to overlook from the label alone.

`getCleanColumnText()` already solves this exact class of bug (its own
JSDoc names it directly: *"Illinois" → "I" + "llino" + "is" → "I llino
is"*) by cloning the element, UNWRAPPING `_COLLAPSE_MATCH_SEL`/`.mb-ic-wrap`
spans into plain text nodes, and calling `.normalize()` to merge adjacent
text-node siblings back into one — so `join(' ')` only ever fires at a
REAL inter-element boundary. `_buildFlagSegmentsForRoot()` never had this
treatment ported over, and couldn't simply reuse it verbatim: its icon
segments need `_bakeFlagIconNode()`'s `getComputedStyle()` read on a
LIVE, attached element (a detached clone has no computed style at all,
which would have broken the ALREADY-correct native-flag baking).

Fix: bake every icon from the LIVE root first, in document order
(`Array.from(root.querySelectorAll(iconSel)).map(_bakeFlagIconNode)`),
*then* build a clone with the same unwrap-and-normalize treatment as
`getCleanColumnText()`, and walk THAT for text — consuming the pre-baked
icons by position as the walker re-encounters each icon-matching element
in the clone. Safe specifically because `_COLLAPSE_MATCH_SEL`/`.mb-ic-wrap`
never overlap `iconSel` — unwrapping them can never change how many icon
elements exist or their relative order, so pairing live-baked icons to
clone-walked positions by simple ordinal index is exact.

New regression coverage: `tests/fixtures/uniq-drop-israel-flag-artifacts.spec.js`
(+ matching `.html` fixture, built directly from `debug/Israel-flag.html`'s
own markup) — one case per bug. The first asserts exactly one trailing
icon (a real `<img>`, never an empty `<span class="flag">`) in both the
entity-info row and the cell-preview row. The second types "isra" into
the Location filter and asserts the preview's RENDERED TEXT (not its
`title`, which was never wrong) never contains "Isra el". Both verified
failing against the pre-fix code first (`git stash` on
`ShowAllEntityData.user.js` alone) — the first attempt at the second test
mistakenly asserted on `.title` and passed even pre-fix, a genuine false
negative caught only by dumping the real pre-fix DOM and checking which
field actually carried the bug.

## 2026-09-09 — "Locality"/"Region" columns render the SAME area's icon in a different order on different rows (fixed)

Reported with `debug/Czech-flag.html` (`artist-events`, filtered to "cz")
and a screenshot showing "Praha" with its icon BEFORE the name in one row
and AFTER it in another — same area, same page, same script version.

Traced by extracting both rows' native "Location" cell and their derived
"Locality" cell side by side. The NATIVE cells were byte-identical (RSFE
had already fully decorated both, `<span class="mfe-flag-wrapper"><a>
Praha</a><img class="mb-hq-flag-img"></span>`). The DERIVED "Locality"
cells differed:
- Row 1: `<img class="mb-hq-flag-img"> <a data-flag-processed="1">
  Praha</a>` — `_routeAreaLink()`'s own icon-then-anchor rendering,
  unwrapped, never touched again.
- Row 2: `<span class="mfe-flag-wrapper"><a data-flag-processed="1">
  Praha</a><img class="mb-hq-flag-img"></span>` — RSFE's OWN native
  shape, wrapper and all — meaning RSFE had re-decorated this specific
  clone AFTER `_routeAreaLink()` built it.

Root cause: `_routeAreaLink()`'s `clonedA = a.cloneNode(true)` only
inherits `data-flag-processed="1"` when the SOURCE anchor already had it
at extraction time. Both MFE and RSFE skip an anchor outright when that
attribute is already truthy (confirmed in both scripts' own per-anchor
loops — not a coincidence, same author, RSFE is MFE's intended
successor per the user). Whether a given row's SOURCE anchor had already
been decorated by the time OUR extraction ran is a pure timing race
against each script's own asynchronous, continuous
`document.body`-wide `MutationObserver` — and once a freshly-cloned,
still-unflagged anchor lands in our own "Locality"/"Region" column, that
SAME live observer notices it too and decorates it AGAIN, in whatever
order it natively uses, permanently overwriting `_routeAreaLink()`'s own
rendering for that one row. Two rows built from identically-shaped input
can therefore settle into two different, PERMANENT states depending
purely on scheduling — not something `_routeAreaLink()`'s own logic ever
controlled non-deterministically on its own.

Per the user's explicit direction (asked rather than guessed, given the
two legitimate resolutions — converge on our own order, or let the
third-party script's order always win): force our own order, always, and
put the icon AFTER the name (matching the dropdown's already-established
"name, then flag" convention from the two entries above).

Fix, in `_routeAreaLink()`:
- Swapped the append order: `clonedA` first, then the icon.
- Stamp `clonedA.dataset.flagProcessed = '1'` whenever an icon was found
  and rendered — the exact attribute both MFE and RSFE check, so neither
  ever re-decorates this clone again. Only stamped when an icon was
  actually found; a clone with no icon yet is left alone, so a script
  that decorates the SOURCE only later still gets a chance to add one.

This surfaced a real regression in `_findAreaLinkIcon()`, caught by
`area-name-collision.spec.js`'s existing `splitLocationAreas()` test:
that function's own re-detection of "does this reconstructed cell have a
flag" (`_findCellEntityRefs()` → `_findAreaLinkIcon()`) only ever checked
`anchor.previousElementSibling` for the legacy `area-icon`/
`custom-area-icon` shape — which is exactly the position `_routeAreaLink()`
no longer uses now that the icon comes after. Fixed by also checking
`anchor.nextElementSibling` (renamed `AREA_ICON_PRECEDING_SIBLING_SEL` →
`AREA_ICON_SIBLING_SEL` throughout, since it's no longer preceding-only).

New regression coverage: `tests/fixtures/uniq-drop-locality-flag-order.spec.js`
(+ matching `.html` fixture, using `debug/Czech-flag.html`'s own "Praha"
markup) — asserts the icon lands AFTER the anchor via
`Node.compareDocumentPosition()`, and that the anchor is stamped
`data-flag-processed="1"`. Verified failing against the pre-fix code
first (`git stash` on `ShowAllEntityData.user.js` alone).

## 2026-09-09 — "More Flags Everywhere": Locality/Region columns render a misattributed/borrowed flag icon (fixed)

Reported with `debug/More-Flags-Everywhere-bug.html` (`artist-events`,
MBID 70248960-cb53-4ea4-943a-edb18f7d336f) and a screenshot showing
"Manhattan"/"Brooklyn"/"Gelsenkirchen" in the Locality column each
carrying a flag that reads as doubled, and the Region column showing
"New York, New York" each with an icon in a way that looked duplicated.

Traced against the actual captured row markup (row-idx 6, Madison Square
Garden). The NATIVE "Location" cell chains THREE `/area/` anchors:
`Midtown Manhattan` (MBID `edd27a39-…`) → `[icon alt="New York City"]` →
`New York` the COUNTY (MBID `74e50e58-…`) → `[icon alt="New York"]` →
`New York` the STATE (MBID `75e398a3-…`) → `.flag` United States. Two
genuinely different MusicBrainz areas share the display name "New York"
(same collision `area-name-collision.spec.js` already covers), but here
they're preceded by a THIRD anchor, "Midtown Manhattan", which has no
flag of its own — its MBID isn't in "More Flags Everywhere"'s region map,
confirmed directly from the real script,
`tests/fixtures/live-userscripts/MusicBrainz_More_Flags_Everywhere.user.js`'s
`processLink()`: `if (match) { … }` never runs for it, so no icon and no
`data-flag-processed` are ever added.

Root cause: `_findAreaLinkIcon()` matches a candidate icon via EITHER
`anchor.previousElementSibling` OR `anchor.nextElementSibling`. The real
script always inserts its icon `insertBefore(iconSpan, wrapper)` —
immediately BEFORE the anchor it decorates, never after — confirmed
directly from `processLink()`. So the icon that legitimately belongs to
the COUNTY anchor (`74e50e58`, via its own `previousElementSibling`) is
ALSO `Midtown Manhattan`'s `nextElementSibling` — and since Manhattan is
processed FIRST by `_processNode()`'s per-anchor loop, its `next`
fallback wrongly "borrowed" the county's icon before the county anchor
was ever reached. That clone landed in Locality; the county anchor
separately got its own (correct) copy in Region — net effect, one icon
cloned into two different output columns. The exact same shape
reproduces with the simpler 2-anchor Gelsenkirchen row (row-idx 73):
`Gelsenkirchen` (a city, not in the region map) borrows
`Nordrhein-Westfalen`'s icon.

A second, mirror-image manifestation exists in the READ-BACK direction:
`_findCellEntityRefs()` (behind the 📊 dropdown and
`splitLocationAreas()`) calls `_findAreaLinkIcon()` on cells this script
has ALREADY rendered, where the convention is reversed — icon follows
its anchor, per `_routeAreaLink()`'s own "name, then icon" order
(previous entry above). Once the fix below makes Region legitimately
hold two icon-bearing entries side by side, the SECOND anchor's
`previousElementSibling` is the FIRST anchor's own trailing icon, not
its own — the mirror of the same ambiguity.

Fix, in `_findAreaLinkIcon()`/`_routeAreaLink()`:
- `_findAreaLinkIcon(anchor, excludeFromNext)` gained an optional
  `excludeFromNext` param, consulted only in the `next` branch.
- New `_collectPrecedingAreaIcons(node)` pre-scans every `/area/` anchor
  in a cell/`<li>` ONCE, up front, collecting each anchor's own
  `previousElementSibling` icon (if any) into a `Set` — the anchors that
  DO legitimately own an icon. `splitLocation()`'s `_processNode()` and
  `splitArea()` now build this set and thread it through as
  `areaState.precedingIcons`, so an ambiguous `next` match is rejected
  whenever some OTHER (later) anchor already owns that icon via `prev`.
- For the read-back direction: `_routeAreaLink()` now marks every icon
  clone it emits with `iconClone.dataset.mbRouted = '1'`.
  `_findAreaLinkIcon()`'s `prev` branch rejects a candidate carrying that
  marker unconditionally (no exclude set needed — a genuine NATIVE icon
  is never marked this way, so the guard only ever fires against another
  anchor's own trailing clone).
- Neither change touches the RSFE-wrapper branch or the native `.flag`
  country branch — both return before the ambiguous `prev`/`next` check
  is ever reached, so RSFE's currently-working handling
  (`c2c53e0` and predecessors) is untouched by construction.

`window.__saTest.splitLocationAreas()`'s `refsOf()` wrapper gained a
`flagLabel` field (the matched icon's own `<img alt>`, or `null`) — a
"has a flag" boolean alone can't distinguish a CORRECT icon from a
BORROWED one, since a misattributed icon still reports `hasFlag: true`.
`area-name-collision.spec.js`'s existing assertions were updated to
include the new field (mechanical fallout, not a behavior change there —
that fixture's chains never hit the 3-anchor ambiguity, confirmed
unaffected by hand-tracing and by the full suite staying green).

New regression coverage: `tests/fixtures/mfe-icon-misattribution.spec.js`
(+ matching `.html` fixture, using `debug/More-Flags-Everywhere-bug.html`'s
own Manhattan/New-York-county/New-York-state and Gelsenkirchen/
Nordrhein-Westfalen markup) — asserts Locality gets no icon for the
unflagged leading anchor and Region gets each subsequent anchor's own,
distinct icon (via `flagLabel`, not just `hasFlag`). Verified failing
against the pre-fix code first (`git stash` on `ShowAllEntityData.user.js`
alone) — both new tests failed with `hasFlag: true` on the unflagged
anchor, exactly reproducing the reported bug.

## 2026-09-10 — Picard column emptied on every multi-table re-render (fixed)

**Symptom as reported.** On `releasegroup-releases`
(`https://musicbrainz.org/release-group/c497fc44-ddaf-3cce-a9b4-bfec958a0f3c`)
the Picard column's ♪ rendered correctly at first, then disappeared from the
"Official release" sub-table as soon as that sub-table was sorted or filtered.
Snapshot: `debug/picard-missing.html`.

**What the snapshot actually shows.** Three `table.tbl`, all three carrying
`data-picard-th-injected="true"` and 23 `<th>` per header row including
`mb-picard-th`, and three `<colgroup>`s of 23 `<col>`. The sorted table
(`.mb-sort-status` reads `✓ Sorted by: 'Primary alias'▼`, 119 rows) has **0**
`td.mb-picard-cell` and **22** `<td>` per row. The untouched 4-row and 1-row
tables still have 4 and 1 cells and 23 `<td>`. So the body of the sorted
sub-table was one column short of its own header. (There is no 24-vs-23
colgroup discrepancy — an earlier reading of this file said so and was wrong.)

**Root cause: the two table modes render differently, and the Picard code was
written for only one of them.**

- Single-table's initial render **MOVES** the source rows into the DOM —
  `await renderFinalTable(allRows)`, and `renderFinalTable` appends what it is
  handed. So the live rows *are* `allRows`' rows and the Picard `<td>` lands on
  the source rows for free.
- `renderGroupedTable` **ALWAYS CLONES** — `group.rows.forEach(r =>
  …r.cloneNode(true))`, on the first render too. `initPicardTaggerColumn()`'s
  full-mode pass then walks `table.querySelectorAll('tbody tr')` and appends the
  cell to those **clones**. `groupedRows[i].rows` never received it.

The code asserted the opposite in a comment — *"Not needed in multi-table mode:
… group.rows already carries the picard cell before any cloning happens"* —
which is what made the gap invisible. `_artResolveSourceCell()`'s JSDoc states
the same fact correctly for artwork (*"renderGroupedTable() ALWAYS inserts
clones … while groupedRows[i].rows … stay blank forever"*), which is precisely
why `_artMirrorIconToSourceRow()`/`_artMirrorInlineThumbToSourceRow()` exist.
The Picard comment simply never got the memo.

Every re-render then re-cloned blank rows and `initPicardTaggerColumn(/*
rewireOnly */ true)` correctly declined to append a cell (appending there would
land it before the Relationships cell on the load-from-disk path, where
`runFilter()` fires first).

**The bug was much bigger than "sorting".** `runFilter()`'s multi branch sets
`_sourceRows = group.rows` and re-clones for *every* group it processes, so the
column emptied page-wide on the **first global-filter keystroke**. The snapshot
showed only one affected sub-table purely because `_renderDirtyGroupIdxs` had
scoped that particular render to the sorted group. The cheapest reproduction is
one keystroke, not a sort — and that is the first case the new spec covers.

**Fix.** `initPicardTaggerColumn()` full mode now mirrors each built cell onto
its master row, resolved through `data-mb-row-idx`, and then sweeps the owning
source array so the rows the active filter left UNRENDERED get one too. Split
into `_picardFillCell()` (shared body) plus two entry points: `_picardApplyToRow()`
for live rows (create-or-rewire, unchanged semantics) and `_picardEnsureRow()`
for source rows (fill-if-absent).

Three details worth keeping:

1. **The built cell is CLONED onto the master, never re-derived**, and that is
   not a micro-optimisation. `_picardExtractRowEntities()` skips `.mb-sticky-col`
   cells and `applyStickyColumn()` classes only the **live** rows. On this very
   page the sticky column IS the release column: measured in the snapshot, a
   row's `td[0]` is `.mb-sticky-col` holding `/release/76415396-…` and `td[18]`
   (the synthetic MB-Name column) holds the *same* MBID. The marked live row
   therefore harvests `td[18]`; an unmarked master row would harvest `td[0]` —
   same release, but a different `<a>` text for the button tooltip and a
   different `<li>` count wherever the two cells differ in arity. Same reasoning
   `_artMirrorInlineThumbToSourceRow()` documents for cloning its node instead
   of copying a value. The unrendered-rows fallback does extract on the master,
   which is self-correcting: a clone never carries `_mbPicardWired`, so the live
   pass rebuilds every cell it renders anyway.
2. **A `_buildMasterRowIndex()` Map, not per-row `_findMasterRowByIdx()`.** That
   function is a linear scan of `allRows` plus every group; calling it once per
   row makes the pass O(N²) — order 10^7 string comparisons on a 4174-row page.
   It is deliberately not used to reimplement `_findMasterRowByIdx()` itself,
   whose callers resolve one row seconds after a render, where a cached map
   would be stale.
3. **The source-row work is driven from inside the per-table loop**, after the
   release-link guard, rather than as a flat sweep of `groupedRows`. That guard
   is per TABLE ("does this tbody contain a `/release/<mbid>` link") and the
   column then exists for every row of a qualifying table, including rows that
   themselves link only a release-group — no per-row predicate can reproduce it.
   `initRelationshipsColumn()` can afford the flat shape only because its own
   qualification (`_extractMbidFromRow`) is row-intrinsic. A flat Picard sweep
   would be wrong twice: it would add a ghost cell to a non-qualifying
   sub-table's rows on a heterogeneous page (`artist-relationships`' "Composed
   work" beside "Composed release"), and it would assume a group-index ↔
   table-index correspondence that merged discography view breaks.

**Performance.** Restoring the cells means a multi-table keystroke genuinely
rebuilds them again, where before it skipped the build. Flagged to the user
before implementing, per CLAUDE.md's gate. The added cost is narrower than it
first looks: `_picardExtractRowEntities()` is the *unconditional first line* of
the old `_picardApplyToRow`, so the expensive per-row anchor subtree walk was
already paid on every multi-table keystroke — what is new is only the `<ul>` /
`<li>` / `<button>` / `<img>` construction. Mitigated by a `_mbPicardWired` JS
**property** (not an attribute — `cloneNode(true)` copies attributes but never
JS properties, making it an exact "was I cloned?" test, the same trick
`applyStickyColumn` uses with `tr._mbStickyEnter`): a scoped sub-table sort now
pays only for the group it sorted. A global-filter keystroke re-renders every
group and still pays in full.

**Four adjacent defects fixed in the same pass**, each of which this change
would otherwise have made reachable or worse:

- `_applyDiscographyViewFilter()` re-clones source rows into live tbodies twice
  (the restore-from-merged pre-pass and the merged fill) without going through
  `renderGroupedTable()`, and nothing re-wired them. Before, those clones simply
  had no Picard cell; after, they would have arrived carrying an **inert** button
  — a control that looks live and silently does nothing, which is worse than a
  missing one. Now re-wired at that function's tail.
- `_ensureRelCell()` appended with a bare `appendChild`, and `_ensureReCell()`
  fell back to one when there was no rel cell to aim at. Both now anchor on
  `td.mb-picard-cell`, like `_ensureIceCells()` already did, so "Picard is
  rightmost" holds by construction rather than by call ordering. That invariant
  is load-bearing: every index-based consumer indexes from the left, so a
  trailing extra cell is inert but a misplaced one shifts five of them at once.
- `table.dataset.picardThInjected` was never cleared, and the disk-load path
  replaces the thead from `data.headers`, which excludes `mb-picard-th`. A
  Load-from-Disk after a live fetch therefore left the table with no Picard
  header while every row still got a cell. Now cleared alongside the thead.
- `renderGroupedTable`'s thead templates are cloned from the first `table.tbl`
  *before* the `!query` cleanup removes every table, so on a second full render
  in one session they already carried a Picard `<th>` while the freshly created
  `<table>` had no `picardThInjected` — the guard would then append a **second**.
  `.mb-picard-th` is now stripped from both templates (`cleanupHeaders()` does
  not remove it; its removal map targets MusicBrainz's own "Tagger" column).
  A DOM-presence check was added to the header guard as well.

**Tests.** `tests/fixtures/picard-cells-survive-rerender.spec.js`, network-free:
the page shell comes from the committed `tests/snapshots/releasegroup-releases/raw.html`
and the rows from the committed `tests/fixtures/saved-data/releasegroup-releases.json.gz`
(same release group, "Tougher Than the Rest", 6 + 1 rows). `loadFromDiskFixture()`
gained optional `pageFixtureFile`/`settingsOverride` pass-throughs to make that
possible. Two cases — a global-filter keystroke (re-renders every group) and a
scoped sub-table sort — each asserting per sub-table against that sub-table's
own pre-action counts, never a page-wide tally.

Verified failing first, by planting a mutation that reverts exactly the mirror
and the owner sweep: both tests failed with `Expected: 6, Received: 0` picard
cells, while the *initial render* assertion still passed — so the tests pin the
re-render specifically rather than Picard in general. Full fixture suite: 152
passed.

Two spec mechanics that each cost a run and are worth remembering: the
Load-from-disk dialog is a `position: fixed` overlay, so when it is taller than
the viewport its confirm button sits where no page scrolling can reach it and
Playwright retries "element is outside of the viewport" until the hook times out
(fixed with a taller spec-local viewport — the raw shell has none of
musicbrainz.org's own CSS, so it is taller than the live page
`tests/live/disk-fixture-load.spec.js` uses); and `releasegroup-releases`
renders its sub-sections COLLAPSED, so the sort icon is a 0×0 element until
`clickMasterToggleAndExpandAll()` has run.

A third one showed up only at merge time, and it is the already-documented
one: `waitForFilterSettled()`/`waitForSortSettled()` watch a status-text
element that reaches its final value BEFORE the tbody insertion loop has
caught up (see `waitForActualRowCount()`'s own JSDoc, which records real
`tbody tr` counts of 2500-3500 immediately after the filter settle resolved on
a 4174-row page). A single snapshot read straight after the settle therefore
sees a partly-repopulated table. It passed in isolation every time and failed
once in a full-suite parallel run — the worst shape of flake. Fixed by adding
`waitForActualRowCount(page, 7)` as the second completion signal after every
filter and sort, which is the established idiom rather than a new mechanism.
Re-verified against the mutation afterwards, so the extra wait did not weaken
the assertion: both tests still fail with `Expected: 6, Received: 0`. Three
consecutive clean full-suite runs after the fix.

**Separately found, NOT fixed, not in scope.** On `search?type=recording` the
continuation-row merge does **not** survive a filter re-render: the table
renders 3 merged rows and a global-filter keystroke brings back all 6 source
rows (3 base + 3 continuation). Confirmed pre-existing by running the same
assertion against `HEAD`'s userscript — identical `Expected: 3, Received: 6`.
An attempt to extend `tests/fixtures/search-recordings-continuation.spec.js`
with a single-table Picard-survives-a-filter case ran straight into it and was
backed out rather than encoding the bug into a test. Worth its own session; the
likely shape is that `mergeContinuationRows` runs during row assembly against
the `DOMParser` document while `allRows` keeps the unmerged rows.

**HELP reconciled, not skipped.** `ShowAllEntityData_HELP.txt` has no Picard
section (a known gap); its only two mentions are the multi-row Picard paragraph
under the recording-search section and the cross-tab sub-table note. Both were
re-read against what shipped and neither is falsified — this restores the
behaviour they already describe rather than changing it, so no HELP edit was
needed. `tests/README.org` DID need one: it stated that `loadFromDiskFixture()`
"calls `loadUserscriptPage()` with no `fixtureFile`, so no `page.route()` is
registered and the page SHELL is still fetched from the live site", which the
new `pageFixtureFile` pass-through makes conditional. No snapshot baseline
re-capture, and that is evidenced rather than assumed: the mirror writes to
detached source rows, and in the mutation run above the new spec's *initial
render* assertions passed identically with and without the fix — the initial
render is exactly what every `rendered.html` captures.

## 2026-09-10 — Picard column: on-demand ▶♪/▼♪ header toggle, collapsed by default (branch picard-column-collapse-toggle)

Part 2 of the Picard work — question 3 of `org/picard.org`. Part 1 (9.99.1056,
the multi-table clone bug) is the entry above; this depended on it, because a
toggle that fills cells on demand is meaningless while the next sort destroys
them.

**What shipped.** `sa_picard_tagger_initially_collapsed` (default `true`), a
per-table `▶♪`/`▼♪` toggle in each `th.mb-picard-th`, and a page-wide
`#mb-picard-col-hdr-toggle-all-btn` on multi-table pages. Collapsed, the `<th>`
and every `<td class="mb-picard-cell">` still exist and only the content is
deferred; `_picardApplyCellState()` is the single gate, and it sits in FRONT of
`_picardExtractRowEntities()` rather than inside it, so a collapsed row skips
the whole `td:not(.mb-sticky-col):not(.mb-rel-cell) a[href]` subtree walk, a
regex per anchor, and the construction of a `<ul>`, N `<li>`, N `<button>`, N
`<img>` and N `addEventListener` calls. State lives on
`<table>.dataset.mbPicardExpanded`; the listener is delegated on the `<table>`
element, guarded by `data-mb-picard-hdr-delegate` set only AFTER
`addEventListener` has run — deliberately not copying `ensureCollapseDelegate`'s
latent bug of marking the table before its own `tbody` null-check (that fix is
still open and was not folded in). Full rationale in `CLAUDE.md`'s new "Picard
column: collapsed by default" section and `PERFORMANCE.org` Step 32.

**Three things the plan predicted correctly and one it got wrong.**

Correct: the CSS-only header glyph, the explicit `<table>.dataset` state (the
`notes-received` counter-example is real — 1688 `mb-picard-cell` behind 8
`mb-picard-btn`, so "empty" cannot distinguish collapsed from nothing-to-tag),
and the `<td>` never being removed.

Wrong: **the master-row mirroring is not load-bearing for correctness.** The
plan's stated failure mode was "if collapse only emptied the live cells, the
next re-render would clone still-populated masters and the column would
silently re-appear while the header read collapsed". Measured by mutation — an
`if (true) return;` in front of the mirror — and it does not happen:
`_picardApplyToRow()` reconciles every freshly-cloned cell against its table's
state on every pass (a clone never carries `_mbPicardWired`, so it is always
rebuilt), so the live DOM ends up right either way. Every visible assertion in
both specs stayed green under that mutation. The mirror is kept, and its JSDoc
now says what it actually buys: masters and live rows never disagree, and a
collapsed column's re-renders stop cloning `<ul><li><button><img>` subtrees
only to discard them — which on a four-thousand-row table is a large part of
the cost the feature exists to remove. Load-bearing for the FEATURE, not for
the rendered result.

**A real latent defect fell out of the mutation run**, from an unrelated
direction. The first version of the new spec asserted
`th.textContent === 'Picard'`, and under the "always expanded" mutation it
failed reading `"Picard▶3▤"`. Cause: once the Picard column has multi-row
cells, `initCollapsableColumns()` reaches its `th.appendChild(collapseHdrBtn)`
FALLBACK branch — the one for a header with no `.mb-col-hdr-flex`, and Picard's
is the only such header — and `_cleanColHeaderText()`'s step-3 strip selector
did not list `.mb-col-collapse-hdr-btn`. So any consumer resolving that column
name while the button was present got the glyphs with it. Latent rather than
live only because `initCollapsableColumns()`'s own cleanup pass removes the
button before its own name lookup runs, `_exportCleanHeaderText` already
stripped it, and `_updateAllColHeaderCounts` strips `▶◀▤0-9` by regex.
`.mb-col-collapse-hdr-btn` is now in that selector alongside the new
`.mb-picard-col-hdr-btn`, and the spec asserts the `<th>`'s own TEXT NODES
instead of its whole subtree, so it pins the invariant the CSS-glyph decision
protects without fighting a legitimate contribution from another feature.

**Tests.** `tests/fixtures/search-recordings-continuation.spec.js` gained a
third test at the shipped default and both existing tests gained
`settingsOverride: { sa_picard_tagger_initially_collapsed: false }` — they pin
the Picard column AT INITIAL RENDER (three exact button titles, the
`picardLiCount === releaseLiCount` invariant, the whole `▶3▤`/`▼3▤` premise of
the second), so the setting keeps every assertion verbatim and is honest about
which behaviour they describe. Same for
`tests/fixtures/picard-cells-survive-rerender.spec.js`'s first describe block,
which gained a second describe covering per-table scope across a filter and a
scoped sort, and the page-wide button including its insertion ORDER
(collapse-all → CAA/EAA all-buttons → Picard-all, since Picard injects after
the artwork tail and a naive `.after(#mb-col-collapse-all-btn)` would wedge it
in the middle). Mutation-verified: `expanded = true` in
`_picardApplyCellState()` fails the new default-state test on
`expect(button.mb-picard-btn).toHaveCount(0)`.

`__saTest.picardEntityScans()` was added because the gate's effect is otherwise
invisible: an empty Picard cell looks identical whether it was skipped or
whether the row has nothing to tag. Both new tests use it — the single-table
one asserts a filter keystroke adds ZERO scans while collapsed, the multi-table
one asserts exactly 6 (the expanded sub-table's rows, none of the collapsed
one's).

**One new spec flake found and fixed in the writing, not left in.** The
per-table-scope test originally cleared the global filter with
`waitForFilterSettled(page, () => input.fill(''))` before sorting, and timed
out 1 run in 3: that helper needs `#mb-filter-status-display` to reach a value
it has not shown before, and with a query that kept every row there is nothing
in that text for the clear to change. Fixed by leaving the filter ACTIVE across
the sort, which needs no such signal (the sub-table's own `.mb-sort-status`
carries it), keeps the row count at 7 so `waitForActualRowCount` still works,
and covers strictly more. 5 consecutive clean runs after. **Note the identical
pattern still stands at line ~164 in that file's FIRST describe block** — it is
pre-existing and has not been observed failing, but it is the same shape.

**Pre-existing full-suite flake, measured so it is not mis-attributed.**
`tests/fixtures/release-tracks-ms-length-overflow.spec.js:174` ("a row already
stamped by the embedded payload is never re-sent to the network") fails roughly
1 full-suite run in 3 and passes standalone every time. Confirmed on `main` in
a clean worktree: 1 failure across 6 `npm test` runs there, same spec. Nothing
to do with this change; recorded here so the next person does not spend the run
this cost.

**Snapshot baselines: re-capture is OWED, not done.** Three `rendered.html`
carry Picard markup and all three will change —
`releasegroup-releases` (7 `mb-picard-btn` → 0, +2 toggle spans, +1 page-wide
button), `series-releases` (12 → 0, +1 span), `notes-received` (8 → 0, +1 span;
its 1688 cells stay, they were already empty) — plus a narrower Picard column
in each, since auto-resize measures content and there now is none. The
re-capture needs a logged-in session (`npm run auth:login`;
`notes-received` is `/edit/notes-received`) and the saved session had expired
2026-09-07. Deliberately NOT dodged by seeding the setting off in
`tests/pagetypes.json` — the baselines should record what a user actually sees.
Nothing in `npm test` reads these files, so the suite cannot go red on it. The
exact expected numbers are in `tests/snapshots/registry.org`'s "Expected
drift" section.

**A live spec was added, and it corrected the plan.**
`tests/live/picard-header-toggle.spec.js` (`@extended`, 2 tests, registered in
`tests/live/registry.org`) drives the toggle on real pages in both table modes,
because the fixture suite covers curated markup only. Writing it found that
`org/picard.org`'s named single-table verification target,
`release/3ec14d03-…`, **has no Picard column at all** — verified against the
live page, 0 Picard columns. That is correct and pre-existing: the guard is
data-driven ("does this tbody link a `/release/<mbid>`") and a release
TRACKLIST's rows link recordings. The plan's mention of that URL was about the
⏱ Length toggle's precedent, not about Picard being present there.
`series-releases` (`series/aa3694d3-…`) is the single-table pageType that does
carry the column — its committed baseline has 12 `mb-picard-btn` in one table,
which is how that was settled without guessing — and it is what the spec uses.
HELP now states the tracklist case explicitly; it was never written down.

Both live tests pass. Note the two `data-label` values were wrong on the first
attempt (`"Show all Releases"` / `"Show all Tracks"` rather than
`"…for ReleaseGroup"` / `"…for Release"`), which costs a full 180 s timeout
each — copy the label from an existing spec or from the pageDefinition rather
than inferring it.

**Not measured, and the reason is structural.** `PERFORMANCE.org` Step 32 has
prescribed the same free measurement for weeks — flip
`sa_enable_picard_tagger` off and re-run one filter on a real release-listing
page — and it still has not been run, because the perf harness's only
instrumented page is `artist-events`, which has no `/release/` links and so has
no Picard column at all. Sizing this needs an instrumented release-listing page
first. Nothing was added to `tests/MEASUREMENTS.org` because nothing was
timed; the scan COUNTS in the two specs are correctness assertions about the
gate, not a measurement of what the gate is worth.

## 2026-09-10 — instrumented a release-listing perf arm; found the perf harness had been dead for a day (branch instrument-artist-releases-perf)

Follow-up to the Picard Part 2 entry above. `PERFORMANCE.org` Steps 23 and 32
were both about the Picard column, and the interaction-perf harness had exactly
one instrumented page — `artist-events` — which contains no `/release/<mbid>`
link anywhere and therefore never gets that column. So neither step was
measurable, which both of them recorded as an obstacle without acting on it.

**The harness was also simply broken, and that is the more embarrassing half.**
`capture-interaction-perf.js` referenced `sanitizeForFilename` without
importing it. The symbol moved into `runMetadata.js` in `fcae7a2` (2026-09-09)
and this file's import list missed it. Because it is used on the LAST line of
the run — building the output filename — **every run from that commit until
today measured all seven metrics and then died with a `ReferenceError`, writing
nothing.** Three arms of the comparison below were lost to it before I looked
at the output file rather than at the process list. One line to fix.

Two things came out of that beyond the fix. A `--samples=N` flag, whose only
purpose is to exercise the entire path including the file write in about a
minute before committing to a 3×8-minute run; it warns that it is not
publishable, so it cannot be mistaken for an arm. And the ordering lesson worth
keeping: validate the END of a long measurement pipeline first, because
everything cheap to get wrong there is only reached after all the expensive
work is already done.

**Choosing the page.** Bob Dylan's releases tab, 2301 rows × 21 columns,
24 native pages, committed fixture **618 KB** (smaller than `artist-events`'
700 KB). Two things decided it against Springsteen's own releases tab, which
was already in `capture-fixture.js` as a `local: true` dogfooding capture:
8125 rows would commit a multi-MB blob, and it crosses `sa_render_threshold`
(5000), popping `showRenderDecisionDialog()` — the one blocking dialog
`tests/support/customDialog.js` cannot clear, since its buttons are
Save/Render/Cancel rather than OK/Cancel. At 2301 rows the page never reaches
that gate.

`PAGETYPES-TESTING-REFERENCE.org`'s "Springsteen-connected first" criterion
**could not be met**, and that is measured rather than assumed:
`scripts/probe-artist-release-counts.py` puts Patti Scialfa at 6 releases,
Clarence Clemons 15, Joe Grushecky 24, Little Steven 50 (MusicBrainz has no
"Steven Van Zandt" artist at all), Southside Johnny 71, Nils Lofgren 163 —
and Springsteen himself 8125. Nothing connected lands anywhere near a usable
size, so an unconnected peer was the only option. Recorded as a deliberate
deviation in the fixture entry's own comment.

**Every descriptor constant was measured, and two of them cannot be derived.**
`scripts/probe-fixture-columns.js` loads the fixture through the real
Load-from-disk pipeline and reports them:

- `UNIQ_COUNT_TOTAL` must come from the rendered `.mb-col-uniq-count` **badge**,
  not a distinct-textContent tally. The two disagree on most columns of this
  page — Country reads 68 against a naive 58, Label 257 against 240 — because
  the badge comes from the real uniq-drop machinery. It happens to agree on
  `Release` (1433), the column used here, but that is luck.
- `UNIQ_COUNT_FILTER_VALUE` is a **substring**, because that is what a column
  filter is. "Nashville Skyline" keeps 27 rows across 5 distinct Release
  values; the probe reports both numbers per candidate so a value that drags in
  unrelated rows is rejected before a run rather than after.

**A smoke check caught one of my own numbers wrong**, which is exactly why it
ran before the arms. I had derived `FILTER_VALUE_COUNT = 167` by adding the
probe's per-value tallies (164 cells reading "United Kingdom (GB)" plus 3
reading "United Kingdom (GB)▶2▤"). The real answer is **181**: a column filter
matches `getCleanColumnText()`, which concatenates ALL items of a multi-row
cell, so every Country cell that merely LISTS the UK among several countries
matches too — and those appear in the probe under their own combined text, not
under "United Kingdom". Only the running filter knows that number. The same
mistake is available for any multi-row column.

The check also confirmed the feature itself on a real 2301-row page: Picard
column present with 2301 cells, 2 `<th>`, 1 header toggle, **0 buttons and 0
`_picardExtractRowEntities()` calls** while collapsed.

**The measurement.** Three arms — `absent` (no column), `collapsed` (the
shipped 9.99.1057 default), `expanded` (pre-9.99.1057) — one session, one host
(`NB-3641`, 28 cores), ~9 minutes apart, host conditions identical, median of
5. Differing only in Picard settings, verified from each JSON's own recorded
`seedGmValues`. Full table in `tests/MEASUREMENTS.org`; the ratios:

| metric              | coll/abs | exp/coll | saved by collapsing |
|---------------------|----------|----------|---------------------|
| globalFilter        | 1.01×    | 1.24×    | 19%                 |
| columnFilter        | 1.00×    | 1.08×    | 7%                  |
| sort                | 1.05×    | 1.15×    | 13%                 |
| uniqDropCold        | 1.08×    | 1.07×    | 6%                  |
| uniqDropWarm        | 1.10×    | 1.05×    | 5%                  |
| headerCountsInitial | 1.01×    | 1.07×    | 6%                  |
| headerCountsRestore | 1.01×    | 1.26×    | 21%                 |

Both of Step 32's predictions hold. `collapsed` vs `absent` — the column merely
existing in the five O(rows × columns) walks — is 1.00-1.10× against that
step's own "~5% on a 21-column page" estimate, with the filter metrics a dead
heat. And `headerCountsRestore` at 1.26× is **Step 23's prediction arriving
from the other side**: that step expected fixing the Picard rewire to restore
"Step 3's measured -27 to -30% on `headerCountsRestore` for every
release-listing pageType, where today it never applies at all". Measured, the
`expanded` arm still drops `_colHeaderCountsCache` every pass and pays 4440 ms
against `collapsed`'s 3518 — and `collapsed` is within 1.01× of having no
Picard column at all, i.e. the cache survives entirely. The 9.99.1057 gate is
what banks that.

`uniqDropCold` is the largest absolute (35-41 s) and the least Picard-sensitive
(1.07×) — it is dominated by Step 4's own five full `tbody.rows` passes, so it
is not where this column should be judged.

**Two caveats that must travel with these numbers.** The host is `NB-3641`, not
`petri`, and `MEASUREMENTS.org` already records `NB-3641` running roughly
1.5-1.9× faster on identical scripts — so the ratios are sound and the
absolutes are not comparable to the `petri` reference points in `CLAUDE.md`.
And these are single-pass filter numbers: the harness types inside one 300 ms
debounce, so nothing here observes the repeated-pass, progressive-typing
behaviour `PERFORMANCE.org`'s "Findings: the per-keystroke filter cost" section
is about. That arm stays deliberately unbuilt.

**Docs reconciled rather than appended to.** Step 32's "Still not measured"
subsection was replaced, not supplemented — it was the thing that became false.
Step 23's "those numbers were never captured anyway" and Tier 1's "Before
writing any of it, flip `sa_enable_picard_tagger` off" were both discharged.
`PERFORMANCE.org`'s "the interaction-perf harness cannot see any of this,
before or after" and `org/picard.org`'s matching claim were corrected. No
`// @version` bump or changelog entry: everything here is under `tests/` or
`scripts/`.

## 2026-09-10 — search?type=recording continuation-row merge "does not survive a filter": could not reproduce on 9.99.1058

Follow-up to the "Separately found, NOT fixed, not in scope" note above (the
one recorded during the Picard collapse-toggle session), which guessed that a
global-filter keystroke un-merges continuation rows back to 6 source rows
(3 base + 3 continuation) instead of the correct 3.

**Live-page attempt first, and why it goes nowhere.**
`https://musicbrainz.org/search?query=Roulette&type=recording&method=indexed`
reports "Found 5,362 results" over 215 native pages. Clicking "Show all Search
Results for Recordings" hits `sa_max_page`'s default of 50 immediately —
215 > 50 pops the "⚠️ High Page Count" `Lib.showCustomConfirm` dialog before
any fetching starts — so there is nothing to look at on that URL without first
confirming past it and then waiting out a 215-page fetch. This alone explains
"I cannot confirm this" without saying anything about whether the underlying
bug exists.

**So the reproduction used the same fixture and same trigger as the original
investigation instead**, driven directly against current `main` (9.99.1058, no
uncommitted changes) via a disposable Playwright script reusing
`tests/support/loadPage.js`/`browser.js` exactly like
`tests/fixtures/search-recordings-continuation.spec.js`: navigate to the
`Roulette` search URL routed to the hand-trimmed 3-recording fixture, click
"Show all", confirm 3 merged rows (3/2/1 `<li>` in Release/Track/Medium/Type),
then trigger a re-render four different ways and re-check both the row count
and the per-row `<li>` shape:

| Trigger                                                | Rows before | Rows after | Merge survived?           |
|--------------------------------------------------------|-------------|------------|---------------------------|
| Global filter, real keystroke "e" (matches everything) | 3           | 3          | yes — 3/2/1 `<li>` intact |
| Global filter, "Springsteen" (narrows to 1)            | 3           | 1          | yes                       |
| Column filter on "Release"                             | 3           | 3          | yes                       |
| Click "Name" header to sort                            | 3           | 3          | yes                       |

None of the four reproduced the "6 rows" symptom — row count and per-row
`<li>` counts held in every case, checked out to 4 s after the triggering
action, with the filter status line confirming each pass actually ran (e.g.
`✓ Filtered 1 row in 53ms [GLOBAL:"springsteen"]`).

**The original note's own guessed mechanism doesn't match the code, either.**
It proposed "`mergeContinuationRows` runs during row assembly against the
`DOMParser` document while `allRows` keeps the unmerged rows." Reading the
merge call site (`_isContinuationRow`/`_mergeContinuationRowInto`, grep
`mergeContinuationRows` in the row-import loop) shows the opposite: a
continuation row is folded into the preceding row and explicitly never pushed
onto `allRows`/`groupedRows` at all ("`// Skip — do not add to allRows /
groupedRows`"). Both arrays only ever hold the already-merged row, which is
consistent with the merge surviving a filter/sort rebuild exactly as measured
above.

**Not fixed, because nothing here shows it as currently broken.** This does
not retroactively call the original observation false — only that it does not
reproduce today via the global filter, a narrowing global filter, a column
filter, or a sort, against a clean 9.99.1058 checkout and the exact fixture
used originally. If it resurfaces, check first whether the reproduction
differs from the four tried here (a different trigger entirely, a dirty
working tree, or a live multi-page fetch's page-boundary timing that a
single-native-page fixture cannot exercise).

## 2026-09-10 — arm-E cron failures: playwright version split + unexplained zero-output run

`org/arm.org` reported the unattended arm-E cron job (18-day WSL-uptime perf
experiment, `tests/MEASUREMENTS.org`, worktree
`/home/vzell/git/saed-perf-9.99.1049-arm-e`, branch
`measure/9.99.1049-arm-e`, run by `tests/support/run-perf-arm-e.sh` via cron
at 07:00/19:00) failing again on 2026-09-10 (`05:00:01Z FAILED
slot=morning`) after a manual fix the previous evening. Two separate,
confirmed causes, plus one failure left open.

**Confirmed root cause of the original "Executable doesn't exist" error.**
The worktree's *committed* `package.json` (at both the pinned base commit
`a56f1b1` and the later "OK" commit `e58c5c8`) pins `@playwright/test` and
`playwright` to the identical `^1.62.1`, deduping to one `playwright-core`
— same as `main`. But the working tree had an **uncommitted** diff (left
over from interactive troubleshooting logged in
`~/.npm/_logs/2026-09-09T19_*`) bumping `playwright` to `^1.63.0`, which
re-splits it into a top-level `playwright-core@1.63.0` (wants
chromium-headless-shell rev 1243) and a nested
`@playwright/test/node_modules/playwright-core@1.62.1` (wants rev 1234) —
two browser caches instead of one, and a direct violation of the worktree's
own "pinned, byte-identical" invariant. **Fix applied**: `git checkout --
package.json package-lock.json` to drop the stray drift, `npm ci`, then
`node node_modules/playwright/cli.js install chromium` through the now-
single package (confirmed via `npm ls --all`: one `playwright-core@1.62.1`,
no nested copy; binary at `chromium_headless_shell-1234` runs standalone).
See `tests/README.org`'s new "Node version and the playwright/@playwright/test
pin" section for the general-case writeup and prevention note.

**Confirmed general tooling mismatch (system vs repo-local Node).** cron's
minimal inherited `PATH` resolved `node` to the distro package
`/usr/bin/node` v18.19.1, not the nvm-managed v24.16.0 used interactively —
confirmed by simulating cron's PATH directly, and independently by the
literal "Playwright requires Node.js 20 or higher" warning already present
in the one committed sample's own captured output
(`interaction-perf-arm-e-evening.json`'s companion log file). This is also a
measurement-validity concern: that committed sample ran on Node 18 while
manual/interactive runs use Node 24, and this capture path's JSON has no
`machine`/node-version field (unlike the newer scripts `PERFORMANCE.org`
describes) to catch that drift after the fact — worth a caveat in
`tests/MEASUREMENTS.org`'s arm-E subsection if that Node-18 sample is ever
compared against others. **Fix applied**: added a `PATH=` line
(`/home/vzell/.nvm/versions/node/v24.16.0/bin:/usr/bin:/bin`) to the front of
the user crontab, ahead of both arm-E entries — does not touch the pinned
worktree's script at all. Added `ShowAllEntityData/.nvmrc` (`v24.16.0`) on
`main` as the durable, discoverable pin for any future worktree/clone.

**Left open: the 05:00:01 failure's zero-byte output.** Both chromium
revisions were already cached since the previous night (rules out "missing
executable" for this specific run). Empirically verified in this exact `if
cmd >> file 2>&1; then` shape that both a `command not found` (exit 127) and
a `kill -9` (SIGKILL) on the foreground command still produce visible text
somewhere — the first inside the redirected file, the second as a "Killed"
line from the parent shell, which cron would have captured into
`arm-e-cron.log` — yet the actual failed run appended **zero new bytes** to
both `arm-e-runs.log.capture-output` and `arm-e-cron.log`. `journalctl -k`
and `dmesg` show no OOM-kill, no WSL suspend/resume, and no crash logged in
the `2026-09-10 05:00–05:01 UTC` window. The one nearby, inconclusive lead:
a WSL2 `dxgkrnl` GPU-passthrough kernel `WARNING` involving a `chrome`
process at `21:55:57` the previous evening (~9h earlier — not a direct
match, but suggestive of a flaky WSL2/GPU driver interacting with Chromium
on this box, `petri`). Not fixed because no reproducible mechanism was
found — if it recurs, check first whether `arm-e-cron.log`/`capture-output`
are non-empty this time (narrows "died before producing any output" vs "died
after").

## 2026-09-10 — PERFORMANCE.org Tier 1 re-ordered: Step 23 moved from second to last (docs only)

Asked to "start with Step 23" from Tier 1 and to re-check whether the tier's
order (`34, 23, 24, 25, 26`) still held. It did not, and Step 23 is what moved.
No code changed — this entry records why, and the code-grounded findings the
re-read produced, so the next session does not re-derive them.

**Step 23's headline argument had already been taken by Step 32.** It sat
second as one of "the two defects", on the strength of restoring Step 3's
−27…−30% on `headerCountsRestore` "for every release-listing pageType, where
today it never applies at all". 9.99.1057 gated that cache drop on a row having
actually changed; with the column collapsed — now the default — the cache
survives a keystroke entirely, measured at **1.01×** of a page with no Picard
column. The drop that remains on an *expanded* column is correct behaviour, not
a defect, so the step no longer contains a defect at all and Step 25 is now
Tier 1's only one. Reordered to **`34, 24, 25, 26, 23`**.

Two further reasons to take it last rather than merely later, both "otherwise
you write the same code twice":

- Four of the twelve per-cell scans **Step 34** collapses *are* the ERG arm of
  `_stripTransientCellState` (▼→▶ glyph reset, ghost-table strip, two
  `data-erg-injected` sweeps).
- Step 23's sticky-column member lives inside `applyStickyColumn`, which
  **Step 24** must open anyway. Folded into Step 24, with the two things that
  make it non-obvious: `mouseenter`/`mouseleave` do not bubble, so it needs
  `mouseover`/`mouseout` plus a `relatedTarget` row-boundary gate (without it,
  moving between two `<td>`s of one row fires an out/over pair and visibly
  repaints, because `_leave` restores rest backgrounds before `_enter`
  re-applies hover — and the existing CAA/EAA bigbox tbody delegation omits
  exactly that gate, so it is *not* a usable template); and three writers of
  `data-mb-rest-bg` must stay in sync with any change to *when* the stamp is
  written.

**ERG is a redesign, not a re-wire** — the finding that most changes Step 23's
cost/risk shape. `initExpandRGsFeature()` selects
`:is(#content,#page) table.tbl > tbody > tr > td a[href^="/release"]` and
injects into `link.parentNode`, i.e. **live rows only**, so in
`tableMode: 'multi'` the master rows never own the button — the identical gap
behind the 2026-09-10 Picard bug two entries up. Delegating without mirroring
onto the source rows first would make the buttons *disappear* after the first
re-render rather than merely go inert. Step 23's own correction #2 claimed that
prerequisite was "now met"; it is met for Picard, not for ERG. Two more:
`link.parentNode` is a `<td>` on a flat cell, an `<li>` in a multi-row cell and
`li.mb-caa-art-li-summary` in a CAA art cell — and art cells are built on the
live rows *after* any mirror would have run, with `[data-erg-btn]` itself the
insertion anchor for this script's inline thumbnails (`ergBtn.after(ph)`); and
the fetch lifecycle is encoded in the **listener set** (`loadOnce` removes
itself; a one-shot `retrySetup` re-arms it), so "have I fetched yet" is
unrepresentable after a clone and needs an explicit `data-erg-state`.

By contrast **Picard's half is small and mostly already built**: the per-cell
button closure holds exactly three data values (`guid`, `entityType`, display
`name`), host is read from settings at click time, port comes from a module
memo, and all three visual states are already in the DOM as `img.src` +
`title`. So it is three `data-*` attributes plus a second `closest()` arm inside
`_picardHdrDelegateHandler` — reusing the listener `_picardEnsureHdrDelegate`
has had installed on the `<table>` since 9.99.1057.

**Two latent ERG bugs, filed not fixed** (both live in the code Step 23
rewrites; neither has been reported):

1. The ghost-table strip is `Array.from(el.children)` — **direct children of
   the `<td>` only** — but `ergInjectReleaseGroupButton`'s `<li>` arm inserts
   with `parent.after(table)` and `ergInjectReleaseButton` with
   `resolvedTableParent.appendChild(...)` where the parent IS the `<li>`, i.e.
   inside the `<ul>`. Such a table survives `cloneNode(true)`, and its own
   `/release/` anchors then match `initExpandRGsFeature`'s *descendant*
   selector and get their own fresh buttons on the next pass.
2. `_applyDiscographyViewFilter()` re-wires Picard at its tail (it re-clones
   source rows into live tbodies twice without going through
   `renderGroupedTable()`) but has no matching `initExpandRGsFeature()` call, so
   a view switch leaves inert `[data-erg-btn]` clones behind until the next
   full render.

**Neither ERG nor Picard is visible on the primary baseline page**, which is
worth knowing before reading any committed number as covering them:
`artist-events` has no `/release/` link anywhere, so ERG early-returns on
`links.length` and Picard skips every table. The ERG-carrying baselines are
`artist-releasegroups` (4286 `[data-erg-btn]`, 6429 `data-erg-injected`, 47
sub-tables), `artist-releases-dylan` (~2301), `series-releases` (24),
`releasegroup-releases` (14), `notes-received` (7).

**The whole family is invisible to the test suite.** Nothing in `tests/` clicks
`.mb-picard-btn`, `[data-erg-btn]`, `h2.mb-toggle-h2`, a cdtoc toggle, a row
hover, or a barcode cell — every assertion that touches them is an element
count, a class check or a `title` read, all of which survive `cloneNode(true)`
whether or not the listeners do. So **every current test would stay green if
Step 23 delegated the listeners and got it wrong.** The required assertions are
now tabulated in the step. (The barcode one is not currently writable at all:
no committed fixture carries `input[name="add-to-merge"]`, so that handler is
never even attached.)

**Two harness gaps recorded in Tier 1**, both invisible from Tier 0's single
arm because that arm is the one page with neither feature:
`capture-pass-cost.js` is hardcoded to `artist-events` (a `const PAGE_TYPE`
plus a direct `artistEventsFixture` require — no `--pageType=`), and its
`addEventListener`/`byEventType` counters are the only instrument that can
prove a listener count went to zero; and **no `tableMode: 'multi'` pageType is
instrumented for interaction perf at all**, though `renderGroupedTable`'s
always-clone path is where the family costs most. A pageType also has to be
registered in three places today (`ARMS`, `probe-fixture-columns.js`'s
`DESCRIPTORS`, that `const PAGE_TYPE`) — the drift `runMetadata.js` was
extracted to prevent. Both are closed by the next commit.

Also corrected in the same pass, per this repo's "re-read the file for what
your change made false" rule: the "Two of these are defects" subsection heading
(one is discharged), the Findings-section aside that has ERG *and* Picard
rebuilding every interactive cell (Picard collapsed builds nothing), Tier 1's
closing "restores the cache on a fourth" sentence, Step 32's "Ordering against
Step 23" outcome, and Step 34's verify instruction — which pointed at a
three-versions-old baseline as the sole comparison target and needed the
"capture a fresh `main` arm in the same session" and "read `filterClear`
together with `postClearSettle`" qualifications. Step 23's and Step 24's stale
`:NNNNN` line anchors (~700 and ~200-400 lines off at 9.99.1058) were replaced
with grep anchors.

No `// @version` bump and no changelog entry: `PERFORMANCE.org` and this file
only.

## 2026-09-10 — instrumented the first multi-table perf arm; three harness gaps closed, four findings (branch instrument-artist-releasegroups-perf)

Prerequisite for measuring PERFORMANCE.org Tier 1 on both table modes, which is
what the Step 34 work asked for. Everything here is under `tests/` and
`scripts/` — no `// @version` bump, no changelog entry.

**The gap.** Both instrumented interaction-perf arms were `tableMode: 'single'`,
so every committed number described `renderFinalTable()`, which MOVES the rows
it is handed. `renderGroupedTable()` ALWAYS CLONES, on the first render too, and
that is where the per-pass costs Tier 1 is about are largest. Separately,
`capture-pass-cost.js` — whose `addEventListener`/`byEventType` counters are the
*only* instrument that can prove a listener count went to zero — was hardcoded
to `artist-events` via a `const PAGE_TYPE` plus a direct `artistEventsFixture`
require, with no `--pageType=` flag. So neither Step 23's nor Step 24's listener
half was countable anywhere, on the one page that has neither feature.

**Chose `artist-releasegroups`** (Springsteen `?all=1&va=0`): 2143 rows across
47 sub-tables, 9 columns, and the ERG-heaviest page in the repo (4286
`[data-erg-btn]`). Its `capture-fixture.js` entry already existed as a
`local: true` dogfooding capture named `artist-releasegroups-va0`; promoted to a
committed fixture and renamed to match `tests/pagetypes.json`'s own
`artist-releasegroups` entry, which carries the same URL and seeds. **166 KB**,
not the multi-MB blob `local: true` exists to avoid, because a release-group row
has 9 columns against `artist-events`' 21.

**A pageType took three registrations; now one.** `ARMS` in
`capture-interaction-perf.js`, `DESCRIPTORS` in
`scripts/probe-fixture-columns.js`, and that `const PAGE_TYPE` — the same drift
`runMetadata.js` was extracted to prevent, one level up. All three now read
`tests/support/perfDescriptors.js`, which also owns `PICARD_ARMS` and a
`NO_PICARD_COLUMN` set so a run on a page with no Picard column says so instead
of silently reporting three identical arms.

### Three things measured that decided the descriptor

**1. `TOTAL_ROWS` is 2143, not the 2239 `<tr>` in `rendered.html`** — that count
includes header and filter rows. Measured, not derived.

**2. `SUB_TABLE_INDEX` is 29, and defaulting it to 0 would have wrecked the
arm.** Every per-table metric — `columnFilter`, `sort`, `uniqDrop*` and both
`headerCounts*` badge assertions — is scoped to ONE sub-table, because the
harness's helpers are page-wide-with-`.first()`: `columnIndex()` `findIndex`es
across every sub-table's `<thead>`, `columnFilterInput()`/`columnFilterClear()`
take `.first()` of one input per sub-table. Sub-table 0 here is "Album" with
**21** of the page's 2143 rows; index 29 is "Album + Live" with **830**, the
largest. A descriptor written against the default would have measured 1% of the
page and reported it as a fast result. `columnIndex`, `columnFilterInput`,
`columnFilterClear` and `waitForColHeaderUniqCount` all gained an optional
`tableIndex` (no-op when omitted, so every existing spec is unaffected), and
resolution is by INDEX rather than heading text — an `<h3>`'s `textContent`
swallows its entire per-table filter bar, and `waitForSortSettled()`'s JSDoc
separately warns that a `hasText` lookup on *this* page can land on a
view-hidden section.

**3. A multi-table sort writes only its own group's status.** Confirmed from
that function's own JSDoc and honoured by handing it a `statusLocator` resolved
by index — `#mb-sort-status-display` is never touched, so omitting it times out
on a page that sorted perfectly well.

### The trap that actually broke the first smoke run

`locator.click: Timeout 30000ms exceeded` on sub-table 29's column-filter input.
Diagnosed with a new `scripts/probe-multitable-metric-targets.js` rather than
guessed:

| Element                          | Measured                                         |
|----------------------------------|--------------------------------------------------|
| `.mb-master-toggle`              | `data-state="expanded"`, "Hide all sub-sections" |
| `table.tbl` visibility           | **45 of 47 `display:none`**                      |
| sub-table 29 `<table>`           | `display:none`                                   |
| sub-table 29 `<h3>`              | visible 1570x31                                  |
| its filter input / ✕ / sort / 📊 | **0x0**                                          |
| after a DOM-level `<h3>` click   | visible 1570x26142; all four clickable           |

This is CLAUDE.md's "do not trust `.mb-master-toggle`'s `data-state`" with
numbers on it. `clickMasterToggleAndExpandAll()` cannot drive this page — it
asserts `data-state="collapsed"` first, and needs Playwright's `expect`, which a
standalone capture script does not have. So `filterSortAssertions.js` gained
`ensureSubTableVisible(page, tableIndex)`: check before clicking (the toggle
toggles), click the `<h3>` at the DOM level (a coordinate click can land on one
of the many controls an `<h3>` contains, and a DOM-level click also keeps
`makeH2sCollapsible`'s "ignore clicks on A/BUTTON/INPUT/…" guard from swallowing
it), then assert rows are present rather than measure a hidden table. Called
from both capture scripts — in `loadPage()` before every bracket for timings,
and after `initialRender` for counts so the expansion is not counted as render.

Only the TARGET section is expanded, not all 47: a hidden section's rows are
still in the DOM, so `runFilter()`/`renderGroupedTable()` do the same work either
way and the page-wide metrics are unaffected by how many are open.

### Four findings from the first multi-table count arm

Full tables in `tests/MEASUREMENTS.org`; `main` at 9.99.1058 on `NB-3641`.

1. **`_stripTransientCellState` leads in BOTH table modes** — 71% of the
   multi-table clear's 323 422 `querySelectorAll`, against 97.5% of
   `artist-events`' 1 078 372. Step 34 is not an artefact of the page it was
   found on.
2. **Step 23's ERG cost has a number at last**: `byEventType` reads
   `mousedown=8572` on a filter clear, exactly 2 × 4286 buttons, since
   `ergCreateButton` attaches a glyph-toggle and a lazy-loader listener to each.
3. **A multi-table clear renders TWICE** — `cloneNodeDeepTr` 4286 for 2143 rows,
   `getComputedStyle` 38 575 for 19 287 cells, both exactly 2×, against the
   single-table arm's exactly 1×. Recorded as an observation and **not
   diagnosed**: it is Step 27/31 territory and it would halve both, so it should
   be chased before either is estimated.
4. **The deferred-work phase boundary inverts.** `postClearSettle` is empty on
   the multi-table arm (5 `querySelectorAll`) because `renderGroupedTable()` has
   no `await` and the post-render passes land inside `filterClear`. The existing
   "read the two phases together" rule holds, for the opposite reason.

Also captured a same-version `artist-events` `main` arm at 9.99.1058, so Step 34
is not compared against a three-versions-old file. It reproduces 9.99.1049
almost exactly across a different host: `initialRender` `querySelectorAll`
**bit-identical** at 2 364 742, `postClearSettle` `getComputedStyle` identical
at 87 654, and the only movers are the same four counters the reproducibility
note already names.

**Two mistakes of mine worth recording.** I ran `node -e "require(…)"` on
`capture-fixture.js` as a "syntax check" — it has a top-level IIFE, so it
executed and re-captured three committed fixtures against the live site. Restored
byte-for-byte from git (`700565`/`617642`/`4253` bytes, confirmed). `node --check`
is the parse-only check, and the project's own "never run inline `node -e`" rule
exists for exactly this. Separately, the first full fixture suite reported 2
failures in `picard-cells-survive-rerender.spec.js`, both at
`waitForActualRowCount` — the flake shape that spec's own history documents.
Attributed rather than assumed: it imports none of the four helpers I changed,
passed 4/4 in isolation, and a second full run came back **156 passed, 0
failed**. The trigger was CPU contention from the perf runs going on alongside.

**Docs reconciled:** `tests/README.org` (three arms, the multi-table scoping
rules, `capture-pass-cost.js`'s new flags, and the third un-guessable
descriptor constant), `tests/snapshots/registry.org` (why
`artist-releasegroups/` now holds both an HTML baseline pair AND perf JSONs, and
that a perf arm landing there is not a re-capture), `tests/MEASUREMENTS.org`
(two new sections), and `PERFORMANCE.org` — where Tier 1's "two harness gaps"
note became "closed", plus the third gap above, and Steps 23/34 took the numbers.

## 2026-09-10 — PERFORMANCE.org Step 34: one bucketed pass instead of twelve per-cell scans (branch perf-step-34-strip-transient-one-pass)

Tier 1's leading item, and the first Tier 1 step to land. `_stripTransientCellState()`
made about a dozen unconditional `el.querySelectorAll()` calls per cell — one per
marker family, each a full subtree walk of that cell, each returning nothing on
any page lacking that feature. Tier 0 had measured it at **97.5% of a filter
clear's 1 078 372 `querySelectorAll`** on `artist-events`, and the multi-table
arm added a day earlier put it at **71%** of `artist-releasegroups`' 323 422. The
measured page had cover art switched off entirely and still paid every CAA/EAA
query: the cost was not doing work, it was asking a dozen times per cell whether
there was any.

**What landed.** One `el.querySelectorAll(_STRIP_TRANSIENT_UNION_SEL)` per cell,
its hits collected into per-family buckets, then the buckets executed in the
function's ORIGINAL step order.

**Bucketing rather than dispatching inline is the whole safety argument.** A
union selector returns DOCUMENT order; this function's correctness depends on
STEP order in four places, three of which fail silently:

- `_hadInlineArtPh` must be read BEFORE the inline placeholders are removed — it
  gates the jesus2099 sweep at the end, and getting it wrong destroys a cell's
  only artwork (WIP.91).
- the CAA/EAA count badge must be lifted out of `.mb-art-cache-hint-col-wrap`
  before that wrap is removed, or it goes with it.
- the art-cell `.mb-cell-collapse-toggle` removal must precede the generic
  toggle collapse. The original's second loop re-queried and so never saw what
  the first had removed; a bucket still holds them, so the second sweep now
  skips anything no longer `isConnected`.
- the artwork-icon background clear precedes the jesus2099 anchor removal, and
  one element can be in both families.

**A first-match-wins dispatch was written first, and it was wrong.** The twelve
loops each ran over every element matching their OWN selector, so an element in
two families got both treatments — and that is reachable, not theoretical:
`initExpandRGsFeature()` stamps `data-erg-injected` on a link's parent *before*
it skips `/cover-art` hrefs, so an `li.mb-caa-art-li-image` inside an art cell
carries both markers and needs both its `display:none` and its dataset delete. An
`else if` chain silently gave it only the first. The dispatch now uses
**independent `if`s**, and the spec has a test for exactly that cell shape.

**Two additions the step had not planned.** A `firstElementChild` early-out —
a cell with no element children has nothing for any bucket to match, and most
cells on most pages are exactly that; it is why the measured result came in
*below* one query per cell. And the jesus2099 sweep now starts from the ICON
(`closest('a')`, `el.contains()`-guarded) instead of walking every `<a>` in the
cell and asking each whether it contained one — that was the most expensive of
the twelve on any cell with links, and it is where the `querySelector` drop
comes from.

**Fix 2 of the step — hoisting the CAA/EAA feature gates — was deliberately NOT
taken**, and the reasoning is recorded in the step rather than left implicit:
once twelve walks are one, its remaining win is a shorter arm list on a single
traversal (Chromium buckets a selector list by its rightmost simple selector),
while the risk is real — a "no artwork on this page" gate that is wrong once
skips the strip entirely, and third-party markup can put artwork in a cell
without this script's own artwork code ever having run. Filed for re-judging
against the new counts, not the old framing.

**Filed, not implemented:** hoisting the query to the ROW. `runFilter`'s two hot
loops have the cloned `<tr>` in hand, so one union query per row bucketed by
`closest('td')` would take `artist-events`' clear from ~54 000 to ~4174 — another
order of magnitude on top of this. Three of the five call sites have no row
context and would keep the per-cell form.

### Measured, both table modes, same session, same host

`main` arms captured minutes earlier at the SAME script version (9.99.1058,
`NB-3641`) rather than against the three-versions-old committed file. Full
tables in `tests/MEASUREMENTS.org`.

| Arm                                          | `filterClear` `querySelectorAll` | Change     |
|----------------------------------------------|----------------------------------|------------|
| `artist-events` (single, 87 654 cells)       | 1 079 876 → 83 680               | **−92.3%** |
| `artist-releasegroups` (multi, 19 287 cells) | 323 422 → 107 099                | **−66.9%** |

`initialRender` −84.4% and −66.9%; `querySelector` on the clear −75.5% and
−37.7%. This function's share of the phase went 97.5% → 65% (single) and 71% →
13% (multi), ÷19.5 and ÷16, and on the multi-table arm **it is no longer the
leader** — its successor is `normalizeCommentSpans` at ~36%, one of
`_applyPostRenderRowPasses()`'s four page-wide sweeps, i.e. Step 27's target,
which had no measurement of its own until now. On the single-table arm
`_countLiveDateFlags` (Step 25) is now second at ~10 600, matching its own
separately measured figure exactly.

**The strongest evidence is what did NOT move.** Every non-query counter is
bit-identical across the change, on both arms and in every phase —
`getComputedStyle`, `cloneNodeDeepTr` and `addEventListener`, fourteen figures
in all. That is precisely the signature a change to *how a cell is queried*
should leave, and a restructure that had altered the rendered DOM, the clone
count or the listener wiring would have had to do so while leaving all fourteen
untouched to the digit.

### Testing: an equivalence pin, verified in both directions

`tests/fixtures/strip-transient-cell-equivalence.spec.js` (+ its `.html`), eight
tests, network-free. Step 34 is a refactor with no intended behaviour change, so
"fails before the fix, passes after" does not apply — there is no bug to
reproduce. The equivalent guarantee is an equivalence pin, so:

1. **It passes 8/8 against `main`'s userscript** (checked out alone into the
   branch tree, the established technique), which is what makes it a pin on
   pre-existing behaviour rather than a restatement of the new code.
2. **It passes 8/8 after the change.**
3. **Mutation-checked, twice.** Planting a first-match-wins dispatch fails "an
   element in two marker families gets BOTH treatments" (`Expected: "none"`,
   `Received: ""`); moving the `_hadInlineArtPh` read after the placeholder
   removal fails "jesus2099's icon is removed when it duplicates our own inline
   thumbnail". A first mutation attempt did NOT fail anything — it chained the
   `else if` to the wrong neighbour and so changed no behaviour, which is worth
   recording: an uncaught mutation is as likely to mean a bad mutation as a weak
   test, and the way to tell is to read what the mutation actually did.

Deliberately shaped as named properties rather than one golden serialised cell:
a blob would also fail on a harmless attribute-order difference, and when it
failed it would not say which of the twelve families broke. Four of the eight
tests pin an ORDERING rather than an outcome.

Full fixture suite: **164 passed, 0 failed.**

**No snapshot re-capture, and the claim is scoped to the evidence.** Baselines
are only comparable by re-capturing against the live site, which folds in
unrelated upstream drift, so that was not run. What supports "nothing rendered
differently" is the equivalence spec passing identically on both versions, the
fourteen bit-identical non-query counters (including every `initialRender` one),
and the full suite — several of whose specs (`caa-icon-preserve`,
`jesus2099-artifact-purge`, `subtable-tab-handoff`,
`picard-cells-survive-rerender`) assert on cell contents after a strip.

**Test-framework impact: checked, nothing stale.** Twelve test-side references
to `_stripTransientCellState` were read; all describe its *behaviour*
(`preserveLiveArt`, blanking artwork, clearing `data-caa-enriched`), none its
twelve-scan implementation, so none is falsified. The committed
`saved-data/*.json.gz` fixtures run through this function on the Load-from-disk
path and stay valid — equivalent output, and the disk-fixture specs pass.

**HELP reconciled, not skipped.** `ShowAllEntityData_HELP.txt` needs no edit and
that was checked rather than assumed: the sections that could plausibly be
touched are "⚡ PERFORMANCE SETTINGS" (a list of settings, none added or changed),
the Picard passage about walking every row on every keystroke (unchanged — that
is `_picardExtractRowEntities`, not this), and the dropdown note about a section
that scans every row (unrelated). No new setting, no new UI, no behaviour change.

## 2026-09-10 — Relationships column: on-demand ▶🔗/▼🔗 header toggle, threshold-collapsed (branch relationships-column-collapse-toggle)

Asked as "could we gain the same benefits with the Relationships column as
commit `4814c70` gave the Picard column". Answer: yes, and the prize is far
larger — because what defers here is the NETWORK, not DOM construction.

### What shipped

`sa_rel_collapse_threshold` (new, default **200** distinct entities, `0` =
never). A table whose Relationships column would need more than that many
distinct MBID lookups starts collapsed: the `<th>` and every
`td.mb-rel-cell` exist as before, and nothing is fetched until the user
presses `▶🔗` in that table's own column header. Per table, not per page.
Multi-table pages also get `#mb-rel-col-hdr-toggle-all-btn`, anchored after
the Picard all-button (else the last CAA/EAA one, else collapse-all), giving
collapse-all → CAA-all → EAA-all → Picard-all → Rel-all whichever pass ran
first.

The arithmetic that motivates it: `_initRelationshipsColumnImpl()` issues one
WS/2 request per distinct MBID, Phase 2 serialised with a hard-coded 1100 ms
sleep. Unique-MBID count ≈ row count on these 26 pageTypes, so Bob Dylan's
2301-release page cost **~42 minutes** of trickling requests, started from the
render tail before the user had scrolled, plus one cross-origin
`google.com/s2/favicons` `<img>` per icon. Measured result: **requests issued
at render go from ~2301 to 0.**

### Why a THRESHOLD and not Picard's flat "collapsed by default"

This is the one real asymmetry with `4814c70` and it drove the whole design. A
Picard cell contributed `''` to filtering, sorting and the 📊 dropdown, so
hiding it cost the user nothing. A rel cell is a first-class filter
participant: its `display:none` `.mb-rel-filter-key` spans feed
`getCleanColumnText()` (they are deliberately IN `getCleanColumnText`'s input
and OUT of `getCleanVisibleText`'s — that asymmetry is why `testRowMatch()` and
`applySubFilter()` each carry a targeted `.mb-rel-cell` fallback),
`_highlightRelCellIcons()`, `openUniqDrop()`'s `isRelCellCol`/`relIconCounts`,
and the `rel:<domainKey>` structure modes. So collapsing removes searchable
content — affordable at 2301 entities, pointless at 12. Sorting is unaffected
either way: `_sortCellText()` already returned `''` for every rel cell.

Hence also the affordances, and hence that none of them auto-fetches: a tinted
filter input reading "collapsed — press ▶🔗" (originals stashed in
`data-mb-rel-ph-saved`/`-title-saved` and restored verbatim, because the
generic filter-row builder puts a real help `title` there), a
`.mb-uniq-rel-collapsed-note` row in the 📊 dropdown instead of an empty
"Relationship icons" section, and `🔗Rels: collapsed` in the status bar. A
glance at a dropdown must not be able to queue a throttled multi-minute run.

### Four mechanisms that had to change, none with a Picard analogue

1. **The re-entrancy wrapper silently DROPPED work.**
   `initRelationshipsColumn()` awaited `_relColumnActivePromise` and returned.
   Correct only while every cell was a candidate from birth; a table expanded
   mid-flight is not in the running pass's `allCells` snapshot, so it would sit
   empty forever with no error. Now the wrapper coalesces: `do { … } while
   (_relColumnRerunPending)`, one pending follow-up. That cannot revive the
   doubled-icon bug the guard exists for (the one
   `label-relationships-single-table-column-swap.spec.js` test 2 covers),
   because the follow-up recomputes AFTER the previous pass finished marking
   cells `relDone` — the two sets are disjoint by construction, which is exactly
   what two OVERLAPPING passes could not guarantee.
2. **Both `runFilter()` gates would have become a per-keystroke regression.**
   `document.querySelector('td.mb-rel-cell:not([data-rel-done="1"])')` matches a
   collapsed cell FOREVER, so every keystroke would re-read three GM tables
   (`_initRelMappings()`) and sweep the live tbody + `groupedRows` + `allRows`
   (`_ensureRelCell()`). Replaced with `_relAnyPendingInExpandedTable()`.
   **That also fixes a pre-existing instance of the same defect**: the row-build
   pass creates the `<td>` unconditionally but stamps `data-mbid` only when the
   row links a release/release-group/work, so a page with any such row already
   had a permanently unfillable cell keeping the old gate true. The new gate
   requires `[data-mbid]`.
3. **The completion signal lost its meaning.** The `!allCells.length` branch
   counted `td.mb-rel-cell[data-mbid]` page-wide, ignoring `relDone`, so an
   all-collapsed page reported a whole page of deliberately-empty cells as
   "already populated from disk-load" — on `#mb-info-display-rel`, which
   `waitForRelationshipsComplete()` reads as settled. Now counted per table over
   expanded ones only.
4. **The pipeline was page-wide.** `allCells`, `uniqueMbids` and the Phase-2
   queue are one per page; candidate collection is now per table.
   `_suppressRelationshipsIfNoReleaseOrReleaseGroupLinks()` already removes the
   column outright from a sub-table whose rows link no release, so "fewer
   Relationships headers than tables, possibly none" is a normal state the
   page-wide button tolerates by design.

### Three things found by measuring rather than reasoning

- **The collapsed status message was published and then immediately wiped.**
  First version set `#mb-info-display-rel` inline in the impl's collapsed
  branch; the probe read it back empty and hidden.
  `startFetchingProcess()`'s status block runs `globalStatusDisplay.innerHTML =
  ''`, `_relGlobalStatusDone = false` and `_setInfoSub('mb-info-display-rel',
  '')` **synchronously after** the render tail has already called us. The normal
  completion toast survives only because it is genuinely async. Fixed by
  extracting `_relPublishCollapsedStatus()` and calling it from BOTH the impl
  and just after each status reset (fetch path and disk-load path) —
  deliberately not by deferring with a microtask, which would work only until
  someone adds an `await` between the tail and the reset.
- **`_relTableExpanded()` was stamping every table on every page.** Most of its
  callers run unconditionally, and `runFilter()`'s gate is one of them, so a
  `data-mb-rel-expanded` attribute would have landed in every rendered table on
  every pageType — including the eleven committed `tests/snapshots/*/rendered.html`
  baselines that carry no rel cell at all. It now returns `true` without
  stamping when the table has no `td.mb-rel-cell`. Caught before running the
  snapshot harness, by asking what the attribute would do to a page with no such
  column; that guard is the only reason **no baseline gains real markup** here.
- **The CSS still drifts every baseline, and the first draft of this entry said
  otherwise.** `snapshot.js`'s `_serializeWithoutScripts()` strips `<script>`
  but KEEPS `<style>`, so the nine new selectors land in every `rendered.html`
  on its next re-capture, on every pageType, column or no column. Found by
  grepping a `SAVE_HTML=1` run for `data-mb-rel-*`: the only hits on a rel-OFF
  page are the CSS rule text itself — the same "it is the stylesheet, not a
  cell" trap `tests/snapshots/registry.org` already documents for
  `mb-rel-cell`. Recorded there as expected drift, with the exact nine-selector
  delta and the check that distinguishes it from real markup drift. Not
  re-captured: that needs a logged-in session (`notes-received` is user-scoped)
  and the delta is inert style text.
- **The first mirror test proved nothing.** It collapsed a table that had never
  been expanded, so its master rows were empty either way — removing the
  master-row mirroring entirely left all nine tests green. Replaced with a test
  that expands, collapses, then filters and clears, on the MULTI-table page
  specifically (`renderFinalTable()` MOVES rows, so on a single-table initial
  render the live row IS the master and emptying one empties both for free;
  `renderGroupedTable()` always clones). That version does fail under the
  mutation. This is CLAUDE.md's "name the guarantee precisely, or the test
  proves something adjacent" arriving in practice.

### Tests

`tests/fixtures/rel-column-collapse-toggle.spec.js`, 9 tests, network-free.
Deliberately NOT built on `loadFromDiskFixture()`: see the pre-existing flake
below. It uses `loadUserscriptPage()` + a routed `page.route()` fetch + the
"Show all" click, `search-recordings-continuation.spec.js`'s shape, with both
table modes (`series-releases` single / `releasegroup-releases` multi, whose two
sub-tables of 6 and 1 entities straddle a threshold of 3 and so make "decided
per table" falsifiable rather than merely asserted).

The headline assertion is a **request count**, intercepted and exact — "the
icons are absent" would also pass if they were merely slow, and "the icons
arrive" would also pass if the column had never been deferred.
`__saTest.relInitRuns()` and `__saTest.relTableStates()` were added because
neither is observable otherwise: a collapsed rel cell is byte-identical whether
a full pass ran and found nothing or no pass ran at all.

Mutation-verified, four mutations:

| Mutation                                   | Fails                               |
|--------------------------------------------|-------------------------------------|
| `_expanded = true` (never collapse)        | 6 of 9                              |
| restore the old page-wide `runFilter` gate | exactly the keystroke test          |
| drop the `_thr === 0` carve-out            | exactly the threshold test          |
| remove the master-row mirroring            | exactly the populated-collapse test |

**One thing the threshold test does NOT cover, recorded so it is not mistaken
for covered:** reading the setting as `Lib.settings.x || 200` — the falsy-zero
defect `sa_render_threshold` and `sa_chunked_render_threshold` still carry. That
mutant resolves `0` to `200` and, on a 12-entity page, still reports "expanded",
so the two readings are indistinguishable there. They diverge only above the
schema default, which no committed fixture reaches. The code reads it explicitly
anyway.

Full fixture suite: **173 passed**, no regressions.

### A pre-existing harness flake, measured so it is not mis-attributed

`loadFromDiskFixture()` can fail at `page.click('#sa-render-no-filter-confirm')`
with "element is outside of the viewport". `#sa-load-dialog-overlay` is
`position: fixed` with `max-height: calc(100vh - 40px)`, `overflow-y: auto` and
**no `top`/`left`** — so it takes its static flow position, measured at viewport
y≈382 on the `releasegroup-releases` shell, leaving its own bottom (and that
button, at y≈1051) below a 1280×720 viewport. Playwright can scroll the
overlay's own content but not the overlay itself.

Confirmed pre-existing and independent of this change: it reproduces with an
exact copy of `picard-cells-survive-rerender.spec.js`'s `beforeEach`, and that
spec itself failed 1 of 4 on a standalone re-run of unmodified `main` code
(passing 4 of 4 in the next run). Raising the viewport to 1400×1200 does **not**
fix it, since the overlay's height tracks `100vh`. Not fixed here — the real fix
is to give that dialog a `top` — but new specs should avoid the dialog, and a
`loadFromDiskFixture` timeout should not be read as evidence about the code
under test.

### Not done, with reasons

- **Interaction-latency arms.** `tests/support/perfDescriptors.js`'s
  `applyPicardArm()` JSDoc forbids an arm re-enabling this column — *"that
  would put thousands of live requests inside a measurement bracket"* — and it
  is right. A `rel-absent|rel-collapsed|rel-expanded` arm needs the `rel-ws2`
  store pre-seeded first (`tests/live/idb-cache-hit-bigbox.spec.js` is the
  existing seed-IDB idiom). So nothing was added to `tests/MEASUREMENTS.org`:
  the only number this change has is the request count, and it is in the spec.
  Expect the DOM-side win to be well under Picard's 19%/13%/21% — a collapsed
  rel cell saves cloning an `<a><img>` plus one span, where a collapsed Picard
  cell saved a whole per-row anchor walk plus `<ul>/<li>/<button>/<img>`
  construction and an `addEventListener`.
- **No live spec.** The fixture spec covers both table modes and the guarantee
  is "nothing is fetched", which a fixture pins exactly and a live page pins
  only slowly. Worth adding if the toggle grows behaviour that depends on real
  WS/2 payload shapes.
- **`_relRetryMbids()`'s dead flag.** It sets and clears `_relRetryActive`
  *synchronously around a fire-and-forget async call*, so the flag is already
  `false` by the time Phase 2 reads it. Harmless only because the caches are
  physically deleted first. Found while reading the retry path; deliberately not
  folded in (one logical change per session).
- **`sa_enable_relationships_column`'s own description names 4 pageTypes**
  (`artist-releasegroups, artist-releases, label-releases, releasegroup-releases`)
  when 26 declare the column, and the Statistics panel's TTL-eviction prose says
  "7-day TTL" against a 30-day default. Both are pre-existing doc drift, left
  for a separate docs commit.

## 2026-09-10 — uniq-dropdown quickfilter only highlighted the FIRST occurrence of a match (fixed, branch fix-uniq-quickfilter-highlight-all-matches)

Reported: typing "as" into the 📊 unique-values dropdown's own quickfilter box
(`.mb-uniq-qf-input`) against `» alias: Southside Johnny & The Asbury Jukes at
The Stone Pony` highlighted only the "as" inside "alias", never the "As" inside
"Asbury" — screenshot on `/user/vzell/ratings/event/`. The main table's own
global/column filter inputs always highlight EVERY occurrence
(`highlightText()` → `highlightCrossTag()`, a `RegExp` with the `g` flag driven
through a `while ((m = regex.exec(fullText)))` loop).

**Root cause: plain `String.prototype.indexOf()`, which only ever returns the
first hit.** Three independent call sites inside `openUniqDrop()` built their
own single-`<mark>` highlight this way, all with the identical bug:
`_applySynBoxQuickFilter()` (synthetic "» alias:"/"» comment:"/etc. entries —
the reported case), `renderItems()`'s plain-value branch (any unique-value
entry with no flag icon), and `renderItems()`'s `flagSegments` branch
(Country/Area-style entries with inline flag icons) — whose own comment
explicitly documented "only the FIRST occurrence" as accepted behaviour.

**Fix:** one shared helper, `_appendAllMatchesHighlighted(parentEl, text, lf)`
(defined right after the `hlColor`/`hlBg` settings reads, so all three call
sites — already in the same `openUniqDrop()` closure — can use it), scans with
`indexOf(lf, pos)` in a loop instead of a single lookup, wrapping every
case-insensitive occurrence in its own `<mark>`. `highlightCrossTag()` itself
was deliberately NOT reused: its whole design is walking nested DOM inside real
`<td>` cells while staying positionally aligned with `getCleanColumnText()`;
these dropdown entries are one flat, already-known JS string with no nested
tags, so only its core "regex/scan with `g`, loop" *technique* was needed, not
the function.

The `flagSegments` branch keeps one deliberate, documented limitation: a match
straddling an icon boundary (split across two segments) still renders
unhighlighted — a real cell never breaks a word around a flag, and inclusion in
`matching` already guarantees the match exists somewhere in the value, so this
is harmless. Every occurrence *within* a single segment is now highlighted,
where before the `marked` guard stopped after the first segment that matched
at all.

**Regression test:** `tests/fixtures/uniq-drop-quickfilter-multi-occurrence.spec.js`,
three cases, one per call site. Case 1 reuses `user-ratings-multigroup.html` —
a REAL captured snapshot of the reported page — and asserts the exact reported
labels `['as', 'As']`. Case 2 (plain-value branch) self-computes its expected
occurrence count from the entry's own `title` text rather than hardcoding
fixture content, so it stays valid if the fixture changes. Case 3 reuses
`uniq-drop-area-name-flag-position.html`'s "Test Arena in Test City, Spain"
Location value (two "Test"s in one pre-icon text segment). All three
mutation-checked: fail on the pre-fix code (`git stash` of the userscript
change alone, keeping the new test) with exactly the expected wrong output
(`['as']` only, `1` mark instead of `3`, `['Test']` only), pass after
`git stash pop`.

## 2026-09-11 — `/cdstub/browse`: duplicate rows + lastupdate text misattributed to "Primary alias" (fixed, branch fix-cdstub-browse-dedup-and-comment-cell)

Reported (`org/top-cd-stubs.org`, three debug captures:
`debug/top-cd-stubs-initial.html` = native page 1 before the script touches
anything, `debug/top-cd-stubs-final.html` = fully fetched/rendered before any
sort, `debug/top-cd-stubs-final-sort.html` = after a column sort): (1)
duplicate rows appearing "after sort" but not on the initial render, and (2)
the native `<tr><td class="lastupdate" colspan="4">Added N years ago, last
modified M years ago</td></tr>` info row's text landing in "Primary alias"
instead of "Comment".

**Bug 2 (misattributed cell) root-caused by reading the code, not guessing.**
`_extractMainColumnParts()` always returns `{tdName, tdComment, tdAlias}`, and
every one of its call sites appends them in that fixed order — MB-Name,
Comment, Primary alias. So for `top-cd-stub` (no `injectedColumns`/`addCAA`/
`addEAA`), the row's real last cell is Primary alias, not Comment. The
`pageType === 'top-cd-stub'` lastupdate-merge branch wrote into
`_lastRow.cells[_lastRow.cells.length - 1]` on the stated assumption "always
the row's last cell for this page type" — true of the CELL COUNT, wrong about
WHICH cell is last. Confirmed against the actual captured page before
touching anything: the rendered `<thead>`'s "Comment" column had an empty
unique-value badge (never populated) while "Primary alias" reported "16
different unique values" — the plausible count of distinct "Added N
years/months ago…" phrasings across ~2000 rows, not real alias data (this
pageType's Title never carries a native alias). A sample row's raw HTML
confirmed it cell-by-cell. Fix: `cells.length - 1` → `cells.length - 2`.

**Bug 1 (duplicate rows) root-caused as upstream pagination drift, NOT a
sort/render bug** — the DOM-debugging rule ("confirm root cause with
evidence... do not ship a guess") mattered here specifically because the
obvious guess (sort introduces duplicates) was wrong. Evidence:
- `-final.html`'s own status text: "Loaded 2 pages (2000 rows)".
- `-initial.html` (native page 1 ALONE) already has 2000 `<tr>` = 1000 real
  rows + 1000 lastupdate rows — MusicBrainz's native page size here is 1000.
- Only 1100 of the 2000 fetched rows have a unique `/cdstub/<id>` href — 900
  are exact repeats of another already-fetched row.
- Three sampled duplicate pairs are all EXACTLY 900 row-indices apart
  (362/1262, 308/1208, 967/1867).
- **This is bit-for-bit identical in `-final.html` and `-final-sort.html`**
  (same 2000/1100 split, same duplicate hrefs) — sorting adds/removes nothing.

Conclusion: this listing ranks by lookup count, a value that changes in real
time with no stable secondary sort key, so page=1 and page=2 fetched a few
seconds apart can return ~90%-overlapping results — a live-reranking artifact
on MusicBrainz's own side. Sorting only made pre-existing, scattered
duplicates (900 rows apart, invisible while scrolling a huge unsorted table)
collate adjacently and become obvious — which is why the user only noticed it
"after sort." Fix: `_seenTopCdStubHrefs`, a `Set` of Title hrefs already
rendered (declared next to `allRows`/`groupedRows`, reset alongside them per
fetch), checked at the top of `startFetchingProcess`'s "real data row" branch
— `pageType === 'top-cd-stub'` only, skipping (not counting toward
`rowsInThisPage`/`totalRowsAccumulated`) a row whose href was already seen.
Scoped narrowly to this one pageType: no other browse-style listing in this
script has evidenced the same live-reranking hazard.

**Regression tests:**
`tests/fixtures/top-cd-stub-lastupdate-and-dedup.spec.js`, two cases. The
misattribution case is a single minimal page (`top-cd-stub-lastupdate.html`);
the dedup case is a real two-fixture pagination pair
(`top-cd-stub-dup-rows-page{1,2}.html`, page 2 deliberately repeating page 1's
"Row B"/"Row C" hrefs), routed by inspecting the fetch URL's own `page` query
param. Both mutation-checked: `git stash` of just the userscript change (kept
the new tests) reproduced exactly the predicted wrong output — empty Comment
cell for the first case, `['Row A','Row B','Row B','Row C','Row C','Row D']`
for the second — then `git stash pop` restored the fix and both passed.

## 2026-09-11 — `/cdstub/browse` dedup fix leaked a skipped duplicate's lastupdate text onto an unrelated kept row (fixed, branch fix-cdstub-dedup-lastupdate-leak)

Reported live, right after merging the fix above: `debug/top-cd-stubs-bug.html`
showed only the "Title" column rendering, each row cell artificially large.

**Root-caused with evidence, not guessed** — the width itself
(`min-width: 272902px` on the sticky Title `<th>`) looked exactly like a
plausible browser `position: sticky` + nowrap-measurement quirk (this
project's `toggleAutoResizeColumns()` measures via `th.offsetWidth` after
applying a table-wide nowrap class), and a first attempt at a repro (a
synthetic 1200-row table with random content) measured a perfectly sane
709px, disproving that theory outright — worth recording since it would have
been an easy, wrong story to believe from the symptom alone. Actually reading
the CAPTURED page's own sticky-column cell text found the real cause: one
row's Title `<td>` contained **44,015 characters** — dozens of
`(Added N years ago, last modified N years ago)` comment spans concatenated
onto ONE row.

**The actual bug: the previous session's dedup fix (`_seenTopCdStubHrefs`)
skips a duplicate DATA row, but MusicBrainz always renders that row's own
lastupdate info row as the very next sibling `<tr>` — and the separate
lastupdate-merge branch was untouched, still merging onto
`allRows[allRows.length - 1]` unconditionally.** For a skipped duplicate, that
is not the duplicate's own row (which was never pushed) — it's whichever row
happened to be the last one ACTUALLY KEPT, e.g. several rows earlier if a long
run of duplicates preceded it. Every duplicate in that run wrongly appended
its own lastupdate `<span class="comment">` onto that one earlier row's Title
cell (via `appendChild`, so unlike the Comment COLUMN's plain `textContent =`
overwrite, these accumulate without bound) — hence one row absorbing 44,000+
characters after a long duplicate run.

**Fix:** `_skipNextTopCdStubLastupdate`, a boolean set when the dedup guard
skips a data row and checked (then cleared) at the top of the lastupdate
branch — when true, that lastupdate row is dropped too, instead of merging
onto the wrong target.

**Regression test:** extended `top-cd-stub-lastupdate-and-dedup.spec.js`'s
dedup fixtures to dupe THREE consecutive rows (A/B/C) rather than one — a
single-duplicate run can accidentally "self-heal" the Comment COLUMN's value
(the last overwrite happens to be the correct one), which is exactly why the
1-duplicate version of this fixture pair didn't catch this bug the first
time. The new assertion counts each row's OWN `span.comment` inside its
sticky Title cell (must be exactly 1 — the Comment column's overwrite
semantics hide the leak that appendChild does not). Mutation-checked: fails
with `[1, 1, 4, 1]` on the pre-fix code (Row C absorbed A's, B's, and its own
lastupdate spans), passes after.

## 2026-09-11 — Relationships column: multiplying icons after repeated toggles (fixed, branch relationships-column-collapse-toggle)

Reported against the previous day's on-demand column, with a snapshot:
`debug/relationships-multiplying.html`. Four observations, all reproduced:

1. First expand — every icon renders once. Correct.
2. Collapse mid-fetch — rendered icons vanish, but **new icons keep appearing**.
3. Re-expand — the already-fetched ones come back, the newly-arrived ones are
   **doubled**.
4. Every further toggle multiplies by n, where n is the number of toggles.

The snapshot bears this out exactly: 11 cells hold a **single distinct href
repeated 4 or 5 times**, against a distribution of 0/1/2/4/5 anchors per cell.

### Root cause

**`_initRelationshipsColumnImpl()` never awaited its Phase-2 queue.** The tail
is `queue.then(() => { … })` — fire-and-forget — so the function resolves as
soon as *Phase 1* does, `_relColumnActivePromise` goes null, and the queue keeps
trickling one request per 1100 ms with nothing tracking it. So:

- **Collapse** cleared the cells and `relDone`, but the detached queue still
  held live references to those `<td>`s and kept calling `_populateCells()` on
  them → observation 2.
- **Re-expand** found the re-entrancy guard free, so it started a *second* pass
  over every cell the first queue had not reached. Both queues then called
  `_relAppendIcon()`, which **appends** → observation 3. n toggles, n concurrent
  queues, n copies → observation 4.

So the guard `_relColumnActivePromise` has never covered Phase 2 and never did;
it only ever serialised calls that arrived inside Phase 1's window, which is why
it fixed the cross-tab hydrate race it was written for and nothing else. **The
previous day's JSDoc on the coalescing loop asserted the opposite** — that a
follow-up pass's candidate set was "disjoint by construction" because the
previous pass had finished marking cells `relDone`. That was simply false, and
saying it confidently is how this shipped. Corrected in place.

This also means a variant was **pre-existing on `main`**: `runFilter()`'s gate
calls `initRelationshipsColumn()` whenever any cell lacks `relDone`, which is
true throughout Phase 2 — so a filter keystroke mid-fetch started a second
queue there too. Same family as the doubled-icon bug
`label-relationships-single-table-column-swap.spec.js` test 2 covers.

### Fix — three changes, and only ONE of them is load-bearing

Recorded this way round on purpose, because the intuitive ranking is wrong and
the mutation run said so:

| Change                                                                        | Reverting it fails      |
|-------------------------------------------------------------------------------|-------------------------|
| `_relCellWritable()` — refuse to write into a table whose column is collapsed | **the regression test** |
| `_populateCells()` replaces instead of appending (`td.textContent = ''`)      | nothing                 |
| `_relQueueStillWants()`'s PRE-sleep skip                                      | nothing                 |

- **`_relCellWritable()` is the fix.** One check, applied inside
  `_populateCells()` so every writer — Phase 1's IDB hits and Phase 2's network
  answers alike — goes through it. A detached cell (`closest()` → null, i.e. a
  re-render replaced the row the pass captured) is deliberately treated as
  writable, preserving the existing behaviour where `_srcCells` carries the
  content to the masters.
- **`_relQueueStillWants()`'s `!relDone` half is the second correctness guard**
  and stops a second queue re-answering an mbid the first already wrote. Its
  pre-sleep placement is a cost win only — the post-sleep check still prevents
  the request, so reverting the pre-sleep one fails no test. What it buys is
  that a superseded queue drains at microtask speed instead of holding a
  ~40-minute timer chain on a large listing.
- **The idempotency of `_populateCells()` is defence in depth, and is labelled
  as such in the code.** Kept rather than dropped because the two guards above
  make overlap *unreachable* while this makes it *harmless*, and every
  doubled-icon bug in this file's history is a caller reaching a non-idempotent
  writer twice. The one path with no `relDone` guard in front of it is Phase 1:
  two passes both resolving the same mbid from IndexedDB would both write.
  Unreachable today only because the coalescing guard stops two passes sharing a
  Phase-1 window — which is a conjunction of three separate properties, not an
  invariant.

### Explicitly rejected: a cancellation epoch

The obvious design — bump a counter on every toggle and have in-flight passes
abort — is wrong here. A toggle on ONE table would cancel a DIFFERENT table's
legitimate in-flight fetch, and on a multi-table page that is the normal case.
The question is per mbid and has to be re-asked at the moment each queue step
runs, which is what `_relQueueStillWants()` does. Also rejected: `await queue`
to make the guard honest — it would serialise tables and block a re-expand
behind a stale queue for as long as the original fetch had left to run.

### Test

One test added to `tests/fixtures/rel-column-collapse-toggle.spec.js`:
"toggling MID-FETCH never multiplies an icon, and a collapsed column stays
empty". Six expand/collapse cycles, every one of them landing inside the
~13 s window that 12 entities at 1100 ms apart provide.

**`maxPerCell` is the assertion that pins this**, not a page-wide anchor total:
the total grows legitimately as the fetch progresses, so only a per-cell maximum
distinguishes "12 rows filled in" from "6 rows filled in twice". Before the fix
the test reported 4 anchors appearing in a *collapsed* column and then 19
anchors across 12 cells with 7 duplicated; after it, `maxPerCell` is 1 at every
sample and the end state is 12/12 with zero duplicates.

It also asserts the rate-limit guarantee directly — `ws2.length` must not grow
while the column is collapsed — and that six cycles still issue **exactly 12
requests for 12 distinct entities**, so the L1 promise cache is serving the
repeats and nothing is re-fetched.

Full fixture suite: 174 passed.

## 2026-09-11 — column-header toggles were illegible on injected/sorted headers; four blocks folded into one family

Reported with two screenshots: `▶🔗` on a `Relationships` header, plain and
sorted, in both cases barely visible. Diagnosed, six options mocked against the
real backgrounds for the user to choose from, and the pick applied to **all
four** toggles rather than just the one that was reported.

### Why it was invisible — four things compounding

1. **`opacity: 0.60` at rest**, inherited from `.mb-ms-col-hdr-btn`, which was
   designed for the plain `#e8e8e8` header where 40% washout still reads.
2. **🔗 is a colour emoji and renders blue-grey. The injected-column header is
   `#b8b8d0` — also blue-grey.** Same hue family at the same lightness, so
   almost no figure/ground separation. This is the real culprit, and it is
   exactly why `▶♪` on the Picard header never had the problem: **♪ (U+266A) is
   a text-presentation character** that inherits `#333`.
3. **Sorting made it worse, not better.** The first sort column blends
   `rgba(255,200,80,.60)` over the header (`_MSCOL_HDR_TINT_RGBA`), giving
   `rgb(227,194,131)` — a cool glyph on a warm ground, both mid-tone.
4. **Transparent background and border at rest**, so it did not read as a
   control at all.

### What shipped

The four blocks (`.mb-caa-`/`.mb-ms-`/`.mb-picard-`/`.mb-rel-col-hdr-btn`) were
four near-identical copies of the same declarations. They are now **one rule**,
so "these are the same kind of control" is structural rather than something four
blocks have to keep agreeing on. Resting state is a light pill
(`rgba(255,255,255,.72)` + a real border) at full opacity and `0.92em`, which
fixes every header/sort combination at once — including a header the user
recoloured via `sa_ui_thead_th_bg`/`sa_ui_thead_th_injected_bg`, which no
hand-picked glyph colour could.

Glyph presentation had to be handled per button, because the four differ more
than they look:

| Button                   | Glyph from                           | Treatment                       |
|--------------------------|--------------------------------------|---------------------------------|
| `.mb-rel-col-hdr-btn`    | CSS `::before`                       | 🔗 + U+FE0E                     |
| `.mb-picard-col-hdr-btn` | CSS `::before`                       | none needed — ♪ is already text |
| `.mb-ms-col-hdr-btn`     | element text, `_msUpdateColHdrBtn()` | ⏱ + U+FE0E, in the JS strings   |
| `.mb-caa-col-hdr-btn`    | child `<span>` + real 16px `<img>`   | no emoji at all                 |

The `.mb-caa-col-hdr-btn` comment claiming `▶🖼/▼🖼` was **wrong** and has been
corrected: that button has never contained an emoji, it contains a thumbnail.

U+FE0E degrades safely: where a font declines to honour it the glyph falls back
to the colour emoji *on a white pill*, which is still the reported problem
solved. `⏳` (loading) deliberately keeps its colour — transient and
informative.

### Two traps, both found by doing it rather than by reasoning

- **Raising the resting opacity silently merged two ⏱ states.** The settled
  "no sub-second data on record" state had **no CSS rule of its own** — `grep -c
  '\[aria-disabled'` returned **0**. Its dimming was a side effect of the
  family's `opacity: 0.60`, so lifting that to 1 would have made `unavailable`
  look identical to a normal available button, collapsing it into the `retry`
  state CLAUDE.md's millisecond section is explicit about keeping distinct ("one
  is worth a second click, the other is not"). Now an explicit
  `[aria-disabled="true"]` rule, and `work-recordings-ms-length.spec.js` pins
  the dimming — mutation-verified: setting that rule's opacity back to 1 fails
  the test. **Before changing any base declaration in a shared rule, check which
  states were relying on inheriting it.**
- **A state tint's alpha is relative to what is behind it.** The retry yellow
  moved `0.45 → 0.55` (hover `0.65 → 0.75`) and the engaged blue `0.13 → 0.20`,
  purely because they now sit over a white pill rather than over the header
  itself. The existing spec caught the retry change immediately, which is the
  system working: that tint is how `retry` is told apart from `unavailable`, so
  it *should* be pinned exactly. Updated with the reason recorded beside it.

### Two self-inflicted rounds worth not repeating

Both are properties of the `GM_addStyle` template literal the CSS lives in:

- **A backtick in a CSS comment terminates the literal** and breaks the entire
  userscript. `node --check` reported the failure ~50 lines *before* the real
  cause, at the start of the template, which makes it easy to misread.
- **A CSS `\XXXX` escape is read as a JS escape first.** `content: '\25B6'`
  does not survive. The file's own convention — literal glyph characters — is
  the reason nothing had hit this before.

### Tests

Nothing new was written for the restyle itself beyond the `[aria-disabled]` pin;
three existing specs already asserted the ⏱ glyph text and now assert it
**exactly, U+FE0E included** (`GLYPH_SECONDS`/`GLYPH_MILLIS` named in
`release-tracks-ms-length.spec.js`), so dropping the text-presentation selector
is a test failure rather than a silent look regression. Full fixture suite: 174
passed.

The six-option comparison the pick was made from is an artifact, not a committed
file: https://claude.ai/code/artifact/8e450e55-7d3e-4691-a5e8-ed65a42878e0

## 2026-09-11 — multi-row ▶N▤ toggle joins the header-control family; its count was two-thirds header size

Follow-up to the entry above, from a screenshot of a `Date` column header:
`▶2▤` was as washed out as `▶🔗` had been, and its count was smaller still.

`.mb-col-collapse-hdr-btn` is now the **fifth** member of the shared
column-header control rule, so it gets the same resting pill, full opacity and
`0.92em` as the other four, plus an engaged tint keyed on `aria-expanded` (its
state attribute — the others use `aria-pressed`).

**The count was the real finding: `em` compounds.** `.mb-col-collapse-count` was
`0.82em` inside a `0.80em` button, i.e. **`0.66em` of the header** — so the one
piece of actual INFORMATION in that control was the smallest thing in the entire
header row. It is `0.92em` inside a `0.92em` button now: `0.85em` of the header,
**up 29%**, and still deliberately a shade smaller than the ▶/▤ glyphs around
it. Worth generalising: anything nested inside one of these buttons has to be
sized against the button's own `font-size`, not against the header's.

**Two per-control deltas that must not be tidied into the family**, both
recorded in CLAUDE.md:

- `margin-right: 0`, because this control is not laid out by the family's
  margin at all. It carries an inline `margin-left: auto` (set alongside
  clearing `.mb-col-uniq-wrap`'s own inline one, see `initCollapsableColumns`),
  so BOTH it and the uniq wrap have `margin-left: auto` and the flex row splits
  the free space between them. That split is what produces the gap before 📊; a
  `margin-right` here would sit inside that gap and only make the pair look
  misaligned.
- No entry in the family's `:focus-visible` group: this control is already in
  the page-wide `:focus-visible` list near the end of the stylesheet, which uses
  `!important` and would override the family's rule anyway.

**Not touched, and offered rather than assumed:** `.mb-col-uniq-wrap`'s own
`35 📊` pair, whose count is `0.72em` at `opacity: 0.60` and is arguably the
next-least-legible thing in the header. It is a different kind of control (always
present, not a toggle), so it was left alone pending a decision rather than
swept in.

Nothing in `tests/` asserts on these controls' styling — the four specs that
touch `.mb-col-collapse-count` all read its textContent — so no test changed.
Full fixture suite: 174 passed. One run showed the known pre-existing
`loadFromDiskFixture` viewport flake (documented 2026-09-10); the spec passes
4/4 standalone and the suite passed clean on re-run.

## 2026-09-11 — 📊 unique-values pair joins the header-control family (sixth member)

Asked for after the multi-row entry above, which had flagged it as the
next-least-legible thing in the header and left it pending a decision.

`.mb-col-uniq-wrap` is now the **sixth** member of the shared rule. Its two
children were the faintest things in the whole header:
`.mb-col-uniq-btn` (📊) at **`opacity: 0.45`** and `.mb-col-uniq-count` at
`0.72em` / `opacity: 0.60`. Both are at full opacity now — the pill provides the
contrast the dimming was standing in for — and the count is `0.92em` of the
wrapper, i.e. **0.85em of the header, up 18%**, still a shade smaller than the
📊 beside it, which is the same relationship `.mb-col-collapse-count` has to its
own glyphs.

### The em-compounding trap, a second time

`.mb-col-uniq-btn` was `0.80em` of the header. The wrapper had **no**
`font-size`, so that was its absolute size. Joining the family gives the wrapper
`0.92em` — at which point leaving `0.80em` on the child would have made the
glyph **smaller** (0.80 × 0.92 = 0.74em) while looking untouched in the diff. It
is `1em` now, i.e. the wrapper's 0.92em. Same trap as the multi-row count, hit
from the opposite direction: there a literal was too small, here an unchanged
literal would have *become* too small.

### A cascade bug caught before it shipped

`.mb-col-uniq-wrap`'s own block sits **earlier** in the stylesheet than the
family rule, and both are single-class selectors — so source order decides, and
the family's `margin-right: 3px` would have beaten the `margin-right: 0` this
control needs as the flex row's last element. The layout deltas were moved to
sit after the family, next to `.mb-col-collapse-hdr-btn`'s, with a pointer left
behind at the descriptive comment. **Any per-control delta in this family has to
be after the family rule**; that is now stated in CLAUDE.md.

### Two states re-tuned for the pill beneath them

- `.mb-col-uniq-active` (a filter from this column's dropdown is engaged):
  `rgba(0,100,255,0.13) → 0.20` plus a border, matching the family's
  `[aria-pressed]`/`[aria-expanded]` arm. Same reason the ⏱ retry yellow had to
  move: the alpha is relative to what is behind it, and that is now white rather
  than the header. It wins on specificity (two classes) regardless of order, so
  no move was needed.
- The two `:hover` rules that lifted the children from 0.45/0.60 to full opacity
  are **deleted**, not kept — at full opacity they were dead CSS, and the pill's
  own hover is what responds now.

No test changed: every `tests/` reference to `.mb-col-uniq-wrap`/`-btn` is a
click target or a textContent read, never a style assertion. Full fixture suite:
174 passed.

## 2026-09-11 — ⇅▲▼ drawn as one segmented pill; `data-mb-resize-min` drift discovered and an earlier claim corrected

Last of the header-control restyles. The three sort glyphs were the only thing
in the header row still unframed, so a header read as a line of pills with one
loose trio in the middle. They were never *illegible* (`.sort-icon-btn` is
`color: black` at full opacity), so this is grouping and consistency, not
contrast: three glyphs that are one control now look like one control.

Chosen from mockups: one pill, hairline dividers, active segment keeping the
existing green-on-yellow but filling the whole segment.

### Zero DOM change, and that is load-bearing

No JS at all — pure stylesheet. Not merely the cheap option: **19 spec files**
locate these as `locator('.sort-icon-btn', { hasText: '▲' }).first()`, and
`hasText` is a **substring** match. A wrapper carrying that class would have the
text `⇅▲▼`, match all three queries, and — first in document order — win
`.first()`, so every one of those clicks would land on the wrapper's centre
instead of the glyph it named. A differently-classed wrapper avoids that and
still costs a re-capture of 14 baselines.

The three spans are already contiguous siblings with no whitespace between them,
so the segments are built from the spans themselves.

### `:first-of-type` / `:last-of-type` are wrong, and they fail differently

They count elements of the same TAG, and these spans are neither the first nor
the last `<span>` in `.mb-col-hdr-flex` — a `.mb-ms-col-hdr-btn` /
`.mb-caa-col-hdr-btn` / `.mb-rel-col-hdr-btn` / `.worklink` can precede them, and
`.mb-col-uniq-wrap` **always** follows. Verified against the committed baselines
before writing any CSS: the Length column really does read
`mb-ms-col-hdr-btn > sort-icon-btn ×3 > mb-col-uniq-wrap`.

Run-relative selectors instead: `:not(.sort-icon-btn + .sort-icon-btn)` for the
first, `:not(:has(+ .sort-icon-btn))` for the last. `:has()` is already used
seven times in this file — though all in `querySelector`, so this is its first
CSS use, where an unsupported selector drops the rule silently instead of
throwing. Worst case is a missing right cap, not a broken control.

**Mutated separately, which changed what the spec claims.** A combined mutation
failed two tests, so the two halves were mutated independently:

| Mutation              | Fails                                                                                           |
|-----------------------|-------------------------------------------------------------------------------------------------|
| only `:first-of-type` | **test 3 alone** (prefixed Length column)                                                       |
| only `:last-of-type`  | tests 1 and 3 — `.mb-col-uniq-wrap` always follows, so ▼ is never `:last-of-type` on ANY column |

The spec's header comment originally said the Length test was the only one
either mutation broke. That was wrong; the decomposition above replaced the
guess, and the comment now states which test guards which rule.

### Two bugs the work itself caught

- **Double dividers.** The first version kept the `border` shorthand's right
  border and only zeroed the left, so every divider was drawn twice — 2px
  between segments, 1px at the pill's edges. The new spec failed on its first
  run and named it. Side borders now start at 0 and are re-grown per position.
- **The tokens were scoped where one control could not see them.** The shared
  `--mb-hdr-pill-*` custom properties were first declared on
  `.mb-col-hdr-flex` — but `.mb-picard-col-hdr-btn` is inserted straight into
  its `<th>`, because the Picard header is the one header with no
  `.mb-col-hdr-flex` at all. That control would have resolved every `var()` to
  nothing and rendered silently unstyled while the other six looked right.
  Declared on `table.tbl thead` instead, the nearest ancestor all seven share.

### The backtick trap, twice

`node --check` failed again with `missing ) after argument list` pointing at the
`GM_addStyle(` line — a **backtick inside a CSS comment** (`` `0 2px` ``)
terminating the template literal. This is the second time in two days, and the
first time was on the commit that documented it. The tell is that the reported
line is the *start of the template*, hundreds of lines before the real cause.
CLAUDE.md now says to grep the region you just edited for a backtick first.

### An earlier claim corrected: `data-mb-resize-min` drifts on every `<th>`

The previous rounds' notes said the pill restyles were style-block text only and
that no element gained anything. The first half is right about classes and
attributes being *added*; it missed an attribute whose **value** moves.

`makeColumnsResizable()` caches `th.dataset.mbResizeMin = String(hdrFlex.scrollWidth + 8)`
**once**, from measured layout, and writes it into the DOM. Every pill added
padding and borders inside the flex row, so the number goes up. Measured,
committed `release-tracks` baseline vs a fresh render of this branch:

| column   | baseline | now | delta |
|----------|----------|-----|-------|
| `#`      | 71       | 125 | +54   |
| `Title`  | 87       | 149 | +62   |
| `Artist` | 94       | 157 | +63   |
| `Rating` | 99       | 163 | +64   |
| `Length` | 128      | 206 | +78   |

**Cumulative across the whole series**, not this commit alone — the baselines
have not been re-captured since before any of it. Recorded in
`tests/snapshots/registry.org` with the earlier entry explicitly corrected, so a
re-capture diff is read as expected rather than as a regression. Still not
re-captured: it needs a logged-in session (`npm run auth:login`; the saved one
expired 2026-09-10), so it is a merge-time decision.

### Tests

New `tests/fixtures/sort-pill-segments.spec.js`, 3 tests: the segment geometry
of a plain column, the active segment's yellow fill, and the prefixed-column
case that is the sole guard on the first-in-run selector. **No existing spec
needed editing** — the point of the zero-DOM approach. Full fixture suite: 177
passed.

## 2026-09-11 — column drag floor was measured before the header was finished (fixed)

Reported as "resize a column to its minimum and the 📊 glyph is cut off a little
bit on the right", with a screenshot of `Country/Date` on
`/artist/84c38d3a-…/releases` and the full header row captured to
`debug/header-row-resize-bug.html`.

### Root cause, measured rather than guessed

`makeColumnsResizable()` computed the drag floor as `hdrFlex.scrollWidth + 8`,
**once, at set-up time**, and cached it on `th.dataset.mbResizeMin`. Two things
arrive after that moment:

- **late-injected header controls** — `.mb-rel-col-hdr-btn`, `.mb-caa-col-hdr-btn`
  (with its 16 px thumbnail), `.mb-ms-col-hdr-btn` are all added to
  `.mb-col-hdr-flex` *after* `makeColumnsResizable()` has run;
- **the deferred header-count digits** — `.mb-col-uniq-count` /
  `.mb-col-collapse-count` are written by `_updateAllColHeaderCounts()`, which
  is idle-scheduled and coalesced per table (PERFORMANCE.org Steps 3/22), so
  those spans are empty when the floor is taken.

So the floor was smaller than the header, the drag honoured it, and the
rightmost control overflowed into the next column.

Quantified against the user's own captured header, re-rendered under the current
stylesheet and compared to each column's true `max-content` width:

|                                   |                                                                                                                                             |
|-----------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------|
| user's real page                  | **20 of 21** columns had a floor below their own header; worst 126 px (`CAA`), `Relationships` 76 px, the reported `Country/Date` **37 px** |
| fresh render of the current build | **6 of 21**; `Relationships` 43 px, four others 4-6 px                                                                                      |

The two figures differ for a reason worth keeping: the first reproduction
attempt used a fixture where `loadPage.js`'s `FIXTURE_SETTINGS_OVERRIDE` forces
`sa_enable_caa_pics` and `sa_enable_relationships_column` OFF — i.e. it removed
exactly the two largest contributors and reported **0** affected columns. The
bug only appears once those are switched back on. A "cannot reproduce" on this
harness means very little until that override is checked.

**It was wrong in the other direction too.** Where the value happened to get
cached after auto-resize had already widened a column, the floor was far too
large: `Label` carried 765 px for a header needing 211, so it could not be
narrowed at all.

### The fix, and why the old comment argued against it

The existing JSDoc explained at length that the value could *not* be
re-measured: `scrollWidth` on an element that fits returns its `clientWidth`, so
after a column has been widened it reports the current width and the floor
ratchets upward, making the column impossible to narrow again.

That reasoning is correct about `scrollWidth` and led to the wrong conclusion —
it froze the measurement at the one moment the header was still incomplete.
`_measureHeaderMinWidth()` measures `max-content` instead, which is
**independent of the current column width** and therefore has no ratchet. So it
can be, and now is, called again at every mousedown, when every control
genuinely exists. One forced layout per mousedown; never from `mousemove`, which
stays rAF-gated.

The fresh measurement **replaces** the stamped value rather than being `max()`'d
with it — the old number is unreliable in both directions, and `max()` would
have preserved the un-narrowable-`Label` half of the bug. (Written as `max()`
first, caught while re-reading.)

### A scope bug introduced and caught during the fix

`_minWidth` was briefly moved to a `const` inside the mousedown handler — but
`onMouseMove` is a *sibling* function in the enclosing per-column scope, not a
closure inside mousedown, so it would have thrown
`ReferenceError: _minWidth is not defined` on the first movement of every drag.
`node --check` cannot see this. It is now `let` in the per-column scope, assigned
at mousedown.

### This was not caused by the pill restyling, but the restyling exposed it

The defect is structural and predates all of it. The pills widened every header
control, which turned a few-pixel discrepancy into a visible clip.

### Test

`tests/fixtures/column-resize-minimum.spec.js` — asserts, per column, that the
enforced floor is at least the header's true `max-content` width, after the
deferred counts have landed (polled, not slept). Mutation-verified: removing the
mousedown re-measure fails it with `floor 206 < needed 242`.

Two deliberate shapes worth not "simplifying":

- It asserts the **floor**, not "the 📊 is visible after a drag". A drag test
  would pass as soon as the floor got merely closer, and would hinge on
  pixel-level hit-testing of an 8 px grip.
- The expected value is computed **independently** (clone into an off-layout
  `width: max-content` box) rather than by calling the same helper the fix uses,
  so the assertion is not circular.
- `mousedown` is dispatched directly on each grip rather than driven through
  `page.mouse`: a wide table scrolls most grips out of the viewport, so real
  coordinates silently miss — which is how the first version of this test failed
  for the wrong reason.
- It waits on `waitForColHeaderCountsStable()`, not on "a count span has
  digits". The count scan is **sliced per column** and coalesced per table, so
  columns finish at different times: the first version waited for the first span
  only, passed standalone, and failed under full-suite load with `Catalog#` 2 px
  short because that column's digits landed after the mousedown.

**A residual worth knowing, deliberately not fixed.** That last failure was a
real race, not just a test artefact: a mousedown fired *while* the initial count
scan is still running can still commit a floor a few pixels short, because the
digits arrive afterwards. Closing it would mean re-measuring during `mousemove`,
which is rAF-gated precisely to avoid per-pixel layout. The window is the first
second or so after render and costs at most ~6 px, against 43-126 px for the bug
actually fixed here.

Full fixture suite: 178 passed.

## 2026-09-11 — sort pill sat flush against the column name (fixed); and the backtick trap, a third time

Reported after the pill landed: no gap between the column name and `⇅ ▲ ▼`.

`makeTableSortableUnified()` appends the name as a text node **with a trailing
space**, and that space used to be the gap. It is trimmed: the text node is an
anonymous FLEX ITEM in `.mb-col-hdr-flex`, and edge whitespace inside a flex
item is collapsed away. The defect predates the restyle — it simply could not be
seen while the glyphs were bare text sitting exactly where the space had been,
and appeared the moment they gained a border and a ground.

Fixed with `margin-left: 4px` on the run's first segment (the same
`:not(.sort-icon-btn + .sort-icon-btn)` rule that gives it its left cap), so
only the outside of the pill gains the gap and the segments stay flush with each
other. Pinned in `sort-pill-segments.spec.js`: 4px on the first segment, 0 on
the other two.

### The GM_addStyle backtick trap, third occurrence

Broke the whole userscript again, from
`` `${colName} ` `` inside a CSS comment — this time carrying **both** a backtick
pair and a `${…}` interpolation into the template literal. Twice now on the very
commits that documented the hazard.

Two things made the recovery slower than it should have been, both worth
recording:

- `node --check` reports the failure at the `GM_addStyle(` line — ~160 lines
  before the real cause here — so the reported location is actively misleading.
  The reliable move is
  `awk 'NR>=<style start> && NR<=<style end> && /\`/ {print NR": "$0}'` over the
  stylesheet region.
- `` `${colName} ` `` occurs **three times in the file**, only one of them inside
  the stylesheet. A blind search-and-replace hit the wrong ones twice before the
  range was constrained.

A one-second guard script under `scripts/` that scans the stylesheet region for
stray backticks would pay for itself; not added here because it is outside what
was asked for.

## 2026-09-11 — Merge to main (9.99.1072) + first snapshot re-capture since before the header restyles

Merged `relationships-column-collapse-toggle` into `main` (`--no-ff`), folded
`WIP.1` → **9.99.1072**, and re-captured the snapshot baselines — the step every
round of this series had deferred for want of a logged-in session.

### The merge itself

Clean, no conflicts. The hazard worth naming, because it looked certain to bite:
`main` had folded and DELETED `ShowAllEntityData_CHANGELOG.wip.json` twice
(9.99.1068, 9.99.1071) while the branch was re-creating it, which is the classic
modify/delete shape. It merged silently instead, because the merge base
(`b09f4f4`) predates the branch re-creating the file — so it is an
*add-against-nothing*, not a modify-against-a-delete. Verified with
`git merge-tree --write-tree` before merging rather than discovered afterwards.

One thing the fold script does NOT do, and CLAUDE.md's merge-time step 5 says to
do by hand: the WIP entry kept its authoring date (2026-09-10) while
`// @version` got the ship date. Corrected to 2026-09-11 so the two agree, which
is what every existing entry does.

### The re-capture: markup barely moved, and one prediction was wrong twice

10 of 11 pageTypes re-captured (`capture-snapshots.js`, host `NB-3641`,
2026-09-11 ~14:30-15:05 UTC). `summarize-snapshot-diff.py` reports **0 token
kinds moved** on six of them; the rest is the already-documented
`mb-caa-completion-toast` flap plus `user-tags` folding in three features that
postdate its baseline. The `mb-rel-*` prediction held exactly — **no element in
any baseline gained a Relationships class or attribute**, which is what
`_relTableExpanded()`'s no-stamp early return was written for. Every file grew
16-33 KB of `<style>`.

`data-mb-resize-min` is where the prediction failed, in both halves: it said
*uniform upward drift on every `<th>`*. Measured:

- **Up +25..+40** on tight headers — the restyle series' real cost (the +54..+78
  predicted from a fixture render overstated it).
- **DOWN, hugely, on wide columns** — `AcoustID` **889 → 149**, `Edit notes`
  616 → 204, `Location` 554 → 180. That is the fix: `scrollWidth` on an element
  that fits returns `clientWidth`, so the old stamp recorded the auto-resized
  COLUMN and produced an un-narrowable floor. The baselines held worse cases
  than the 765 px one the userscript's own comment cites. **A DOWN value here is
  now expected, not a red flag** — registry.org said the opposite and has been
  corrected.
- **Unchanged only where degenerate.** Every "unchanged" count equals that
  file's count of `8` and `0`: `8` is `0 + 8` from a header stamped while its
  sub-table was `display:none`, `0` is the Picard `<th>`, which has no
  `.mb-col-hdr-flex` to measure. Harmless — the drag re-measures at mousedown,
  which is the entire point of measuring late — but it means a multi-table
  baseline's floors say nothing about that page.

### `user-open-edits` cannot be re-captured right now, and it is not ours

The run aborts there on `#mb-filter-container` timing out after 90 s. Read off
the captured HTML rather than guessed: the page says **"Found 0 edits"**, with
`<title>Open edits by vzell</title>` proving the session was fine. The account
simply has no open edits any more — the committed baseline was taken while
several were still inside their ~7-day voting window. No table ⇒ no filter
container ⇒ nothing to render.

Its `raw.html` was **reverted rather than committed**: a raw saying "Found 0
edits" beside a `rendered.html` built from a table of edits is an incoherent
pair, and the rendered half is uncapturable today. A timeout there is evidence
about the account's edit queue, never about the change under test — the same
class of false signal as `waitForCaaEaaComplete()` on a large page.

## 2026-09-11 — `#sanojjonasRoot` survived on a fully-rendered series page — second whitelist-gap recurrence, whitelist removed (fixed, branch fix/sanojjonas-unconditional-cleanup)

Reported via `org/sanojjonas.org`: on
`https://musicbrainz.org/series/f4818e95-a515-4821-ad6d-270703f72dcf`, the
sanojjonas third-party container reappeared at the bottom of the page after a
while on the final rendered page — confirmed via `debug/event-series-final.html`,
a fully-rendered final page (`<h1>...Bruce Springsteen: From My Home to
Yours...`, `mb-master-toggle`/`table.tbl` markers present) still carrying
`<div id="sanojjonasRoot">` appended immediately after the rendered
`</table>`, inside `#content`.

**Root cause: the exact same bug shape as the 2026-09-09 entry below, for a
different pageType.** `_shouldCleanupSanojjonas()` gated both
`removeSanojjonasContainers()` and — critically —
`_watchForLateSanojjonasInjections()`'s `MutationObserver` arming behind
`EVENTS_PAGE_TYPES.includes(pageType) || _isReleaseGroupsMultiMode()`.
`EVENTS_PAGE_TYPES` was `['area-events', 'place-events', 'artist-events']` —
it never included `'series-releases'`, the one constant pageType every
`/series/<mbid>` page gets regardless of which `<h2>` sub-view
(Releases/Events/Works/Recordings/…) it resolves to. So on a series page the
watcher never armed at all, and only `finalCleanup()`'s unconditional
one-shot presence check ran — which found nothing, because sanojjonas' own
script (`tests/fixtures/live-userscripts/Sanojjonas_Visualise_Stuff.user.js`)
does 5 chained top-level `await getJsonFile(...)` calls to an external
gitlab.io asset host before it ever calls `prepareDivs()` to build
`#sanojjonasRoot` — confirming the container is injected well after this
script's own render completes, exactly the race
`_watchForLateSanojjonasInjections()` exists to catch, but couldn't on this
pageType.

**Fix: removed the pageType whitelist entirely, rather than adding
`'series-releases'` as a sixth entry.** This is the second time a hardcoded
sanojjonas pageType whitelist has gone stale (see 2026-09-09 below for the
first), and we don't control which MB page types sanojjonas' upstream script
decides to support next (its own `case "series":` branch shows it already
outran our whitelist once). `removeSanojjonasContainers()`/
`_findSanojjonasContainers()` are cheap `getElementById` presence checks, and
`_watchForLateSanojjonasInjections()`'s `MutationObserver` cost was already
being paid unconditionally on the largest committed fixture (`artist-events`,
4174 rows) under the old whitelist with no known problem — confirmed
explicitly with the user, including the detail that the observer is armed at
the TOP of `startFetchingProcess()` (before fetch/render), so its 15s window
overlaps the full fetch+render pass, not just a quiet post-render tail. Both
`EVENTS_PAGE_TYPES` and `_shouldCleanupSanojjonas()` were deleted; the two
previously-gated call sites (`performClutterCleanup()`,
`startFetchingProcess()`) now call `removeSanojjonasContainers()`/
`_watchForLateSanojjonasInjections()` unconditionally, same as the two
call sites that were already unconditional (cross-tab snapshot bootstrap,
"Load from Disk").

**Regression test:** `tests/fixtures/sanojjonas-series-late-injection.spec.js`,
mirroring `sanojjonas-events-late-injection.spec.js`'s pattern exactly
(click the button, wait for render complete, inject a fresh
`#sanojjonasRoot` via `page.evaluate`, assert it gets purged within the
watch window) against the committed `series-releases` raw snapshot.
Mutation-checked: `git stash` of just the userscript change (kept the new
test) timed out waiting for the container to be removed — confirming the
pre-fix code never purges it on this pageType — then `git stash pop`
restored the fix and the test passed.

## 2026-09-11 — Relationships interaction-latency arm (branch rel-interaction-latency-arm)

PERFORMANCE.org Step 35 shipped a request-count win and explicitly declined to
claim an interaction number, because `perfDescriptors.js` forbids an arm
re-enabling the Relationships column — an unseeded `expanded` arm on the Dylan
page would spend ~42 minutes making 2301 live WS/2 requests *inside* the
measurement brackets. This builds the arm that removes the reason for that rule.

### Getting real data without 2301 requests

The column fetches `/ws/2/release/<mbid>?inc=url-rels` one MBID at a time.
`/ws/2/release?artist=<mbid>&inc=url-rels&limit=100` returns the *same*
per-release `relations` arrays — **24 requests instead of 2301**, verified by
`scripts/probe-rel-browse-endpoint.py` before anything was built on it. Same
trick the ms-length batch source documents, in the opposite direction: there the
browse endpoint was rejected for costing the artist's whole catalogue; here the
whole catalogue is exactly what is wanted.

The data is REAL, not synthesized — the DOM cost being measured is driven by how
many `<a><img>` + `.mb-rel-filter-key` triples land per cell, so inventing that
number would be inventing the answer. `scripts/capture-rel-ws2-seed.py` refuses
to write a seed with any coverage gap (one uncovered MBID = one live request in
a bracket). Result: **2301/2301**, zero missing.

### Three guards, because every failure here looks like success

An arm whose seed did not apply still produces a full, plausible set of medians.
So: a missing seed is refused up front; any WS/2 request during a seeded run
fails the run; and a column settling under half the seed's url-rel count fails
it too. `tests/fixtures/rel-ws2-seed-warm-cache.spec.js` pins the premise on a
small page (2 tests, mutation-verified: no-op'ing the seed fails the seeded test
and leaves the control green).

### Two mistakes of mine the guards caught

**1. The icon count.** I asserted the seeded column would render 2329 icons —
the seed's url-rel total. It rendered **2090**, identically across three
attempts. Replaying `_populateCells()`'s own rule reproduced 2090 exactly:
2329 − 131 duplicate URLs − 108 relation types with no icon class (mostly
"purchase for mail-order"). The rendering was right and my expectation was
wrong. The icon maps are user-overridable settings (`sa_rel_url_icon_classes`
et al), so predicting the count in Node would be guaranteed drift — the field
was renamed `urlRelTotal`, documented as an upper bound, the check became a
floor, and the harness now RECORDS `relIconsRendered` instead.

**2. The settle wait, which silently biased the whole first run.** The wait for
icons to finish populating ran only on the seeded arm — and every
`measure*Once()` starts its bracket the instant `loadPage()` returns, so it was
a head start subtracted from all seven expanded metrics. It produced
`headerCountsInitial` at **0.42x** of collapsed: a populated column apparently
2.4x *faster* than an empty one. Isolated at `--samples=1`, same arm and script,
the wait alone moved that metric **7875 ms → 1603 ms**. Fixed by charging every
rel arm the same idle; the first run's JSONs were deleted rather than committed.

`relSettleMs` is recorded per arm so the equalisation is checkable rather than
assumed — and it immediately showed the fix was only partial: 3001/3002/**6479**.
The seeded settle overruns a 3000 ms cap on 2301 rows. That bias runs the safe
way (expanded got *more* idle and is still slower on all seven metrics), so the
committed ratios are **lower bounds**; the cap is now 8000.

### Result

`collapsed/absent` is 0.96-1.04x on every metric — a collapsed column is free,
the same result Step 32 got for Picard. Collapsing saves 7-30%
(`1 - collapsed/expanded`): 28% on sort, 30% on warm uniq-drop, 15% on global
filter. **Step 35's prediction that this would be smaller than Picard's
19/13/21% was wrong**, and instructively so: it compared only what a collapsed
cell saves on the WRITE side, ignoring that `.mb-rel-filter-key` spans feed
`getCleanColumnText()`, so every keystroke and sort re-reads 2090 hidden URL
strings. Step 35's own text says a rel cell is a first-class filter participant
where Picard's was not; the estimate just failed to carry that into the
arithmetic.

## 2026-09-12 — 📊 unique-values count badge didn't close the dropdown on a second click (fixed, branch fix/uniq-dropdown-count-click-toggle)

Reported via `debug/uvd.html`: clicking the 📊 glyph inside
`.mb-col-uniq-wrap` toggles the dropdown correctly (open, then closed on a
second click), but clicking the count badge in front of it
(`.mb-col-uniq-count`, a sibling span) opens it and then appears to never
close — a second click reopens it instead.

Root cause was not in `openUniqDrop()`'s toggle check (`_uniqDropOwner ===
btn`, line ~54037) — that logic is correct and target-agnostic, since the
wrapper's own `click` listener always passes `uniqWrap` regardless of which
child was clicked. It was in the document-level capture-phase "close on
outside click" `mousedown` handler, which used an exact-identity check:

```javascript
if (ev.target === _uniqDropOwner) return; // button click handled separately
```

`.mb-col-uniq-btn` has `pointer-events: none` ("clicks pass through to the
wrapper"), so a click on the glyph is hit-tested by the browser as landing on
`.mb-col-uniq-wrap` itself — `ev.target === _uniqDropOwner` is true, and the
handler exempts it. `.mb-col-uniq-count` deliberately does NOT have
`pointer-events: none` (a click there needs to keep its own `title` tooltip
working — `pointer-events: none` suppresses those), so `ev.target` is the
count span, a distinct element. The check failed, so the handler fell through
to `closeUniqDrop(false)` and cleared `_uniqDropOwner` to `null` in the
capture phase — *before* the wrapper's own bubble-phase `click` listener ran
and called `openUniqDrop(uniqWrap, ...)` again. By then `_uniqDropOwner` was
`null`, not `uniqWrap`, so the toggle-close branch never matched and the
"open" branch ran instead: a close-then-immediately-reopen flicker that reads
as "never closes."

Fix: change the identity check to a containment check, so any click landing
anywhere inside the owning wrapper — glyph, count, or the wrapper's own
padding — is recognized as "the button click, handled separately," regardless
of which child's `pointer-events` happened to route the hit test there:

```javascript
if (_uniqDropOwner.contains(ev.target)) return; // click on wrap or either child (glyph/count)
```

**Regression test:** `tests/fixtures/uniq-drop-count-click-toggle.spec.js`,
against the same `artist-recordings`/`Length`-column fixture
`uniq-drop-length-bucket.spec.js` uses. Asserts the existing glyph
double-click toggle as a sanity control, then opens via the glyph and closes
via a click on `.mb-col-uniq-count`. Confirmed failing before the fix (second
assertion: dropdown stayed visible) and passing after.

## 2026-09-12 — every multi-row column widened on each sort click (fixed, branch fix/collapse-column-minwidth-ratchet)

Reported as: on `https://musicbrainz.org/release/9d451257-ebce-44ec-aad8-b48609bfaf7a`,
"when repeatedly sorting on a column, all multi-line columns, e.g. 'Recorded at
place', get wider for every click on the sort glyph".

### Root cause

`initCollapsableColumns()` sets a per-column floor from the widest first `<li>`
of that column's multi-row cells:

```javascript
_firstLisForMeasure.forEach(li => { li.style.whiteSpace = 'nowrap'; });
_firstLisForMeasure.forEach(li => {
    maxFirstLiWidth = Math.max(maxFirstLiWidth, li.scrollWidth);
});
…
const minPx = maxFirstLiWidth + 28;
const existingMin = parseFloat(th.style.minWidth) || 0;
if (minPx > existingMin) th.style.minWidth = minPx + 'px';
```

An `<li>` is a BLOCK box and MusicBrainz's `<ul>`s carry `padding: 0`, so it
fills its `<td>`'s content box exactly — and for a block box with no horizontal
overflow **`scrollWidth` returns `clientWidth`**, i.e. the column's CURRENT
rendered width, not the item's own. `nowrap` makes the reading unwrapped; it does
not stop that fallback.

A sort click is `runFilter()` → `renderGroupedTable()`'s reuse branch, which does
`tbody.innerHTML = ''` and nothing else — `makeTableSortableUnified()` is
new-table-only, so the `<thead>` and its inline `style="min-width:…"` survive.
`initCollapsableColumns(table)` then runs from that render tail, reads its own
previous value back as `existingMin`, and adds another notch. Per pass the error
is `28 − tdPadLeft − tdPadRight(22) − ulPadLeft` plus the header's own chrome.

Measured live on the reported page, `min-width` per sort click:

| column             | click 1 | 2   | 3   | 4   | 5   |
|--------------------|---------|-----|-----|-----|-----|
| Recorded at place  | 537     | 549 | 561 | 573 | 585 |
| Recording engineer | 310     | 322 | 334 | 346 | 358 |
| Engineer           | 255     | 267 | 279 | 291 | 303 |
| Producer           | 355     | 367 | 379 | 391 | 403 |

**+12 px per click, every multi-row column, identical delta regardless of
content** — which is the signature: `maxFirstLiWidth` collapses to the one shared
`clientWidth`, so every column moves by the same amount.

This is the same failure mode `_measureHeaderMinWidth()` already documents and
cures for the column drag floor (see 2026-09-11 above). The cure is the same:
`max-content` sizes an element to its content and is independent of the
containing block.

### The fix

1. Measure `li.style.width = 'max-content'` → `getBoundingClientRect().width`,
   keeping the same three-phase write-all/read-all/reset-all batch so the cost
   stays one forced layout per column. `max-content` subsumes the `nowrap`
   intent, so the second property is gone.
2. Stamp the written value on `th.dataset.mbCollapseMinPx`, and release it in the
   function's own cleanup pass (`thead th[data-mb-collapse-min-px]`), so a fresh
   measurement REPLACES ours. The `> existingMin` comparison stays — auto-resize
   writes the same property with a floor measured across the whole cell, which is
   legitimately larger and must keep winning. Clearing only a value that still
   equals our own stamp is what keeps those two apart.

The cleanup comment had claimed for its whole existence that it cleared
"previously set minWidths"; `git log -S "th.style.minWidth = '';"` shows it never
did. It does now.

### Only the sorted sub-table ratchets

A sort is a scoped re-render (`_renderDirtyGroupIdxs`), and untouched groups
return before `initCollapsableColumns` is reached. On a multi-medium release,
sorting medium 1 repeatedly leaves medium 2's widths pinned — a useful diagnostic
signature, and the reason a page-wide tally would have been the wrong measurement.

### The fixture could not reproduce it, and said so with a clean pass

The first version of the regression spec passed against **fully broken code**.
A fixture is a saved HTML file and musicbrainz.org's stylesheet is not loaded, so
browser defaults apply — and they differ in exactly the two properties this bug
turns on:

|                        | live  | fixture (bare)            |
|------------------------|-------|---------------------------|
| `td ul` `padding-left` | 0px   | 40px (the `<ul>` default) |
| `td` `padding-left`    | 4.8px | 1px                       |

With a 40 px list indent the per-pass error is comfortably NEGATIVE: the value
converges after one pass and the fixture reports stable, plausible, entirely
misleading numbers. Restoring just those two declarations
(`MB_GEOMETRY_CSS` in the spec) reproduces it — +3 px per click there, +12 live.

**This is the `FIXTURE_SETTINGS_OVERRIDE` trap from 2026-09-11 in a second
form**, and worth generalizing: a fixture's CSS environment is not the live
page's, so "cannot reproduce on the fixture" is not evidence until the specific
properties the bug depends on have been compared against a live measurement.

### Tests

`tests/fixtures/collapse-column-width-stable-on-sort.spec.js`, four tests, all
network-free. Mutation-checked against three separate reverts
(`scripts/mutate-collapse-minwidth.py`):

| mutation                            | 1 sorts/auto-on | 2 sorts/auto-off | 3 narrows again | 4 not inflated |
|-------------------------------------|-----------------|------------------|-----------------|----------------|
| A — measurement back to scrollWidth | **fail**        | pass             | pass            | **fail**       |
| B — cleanup reset removed           | pass            | pass             | **fail**        | pass           |
| C — both (the shipped pre-fix code) | **fail**        | **fail**         | **fail**        | **fail**       |

B is why test 3 exists at all: with the max-content measurement in place the
"only ever raised" half is otherwise invisible, since on this data the
high-water mark equals the current mark. Test 3 filters the page down to a row
that is narrow in the widest column and asserts the floor drops.

Full fixture suite: 207 passed.

Verified on the reported page after the fix: `Recorded at place` pinned at
`min-width: 537px` / 548 px rendered across five consecutive sort clicks.

### Which change caused it — none of the recent ones

Asked explicitly, so it was measured rather than attributed.

- `scripts/scan-minwidth-history.sh` walks every commit that touched the
  userscript and tests for both anchors. The one-way `minPx > existingMin`
  application is present in the FIRST commit of this repo's visible history
  (`cf5042c`, 2026-05-16, the rename — so it predates it); the batched
  `li.scrollWidth` read arrives with `3d1d4f1` (2026-05-20), which only moved an
  existing per-cell `scrollWidth` read out of the loop.
- `scripts/bisect-collapse-minwidth.sh` swaps in the userscript from a given
  commit and runs the ratchet probe against the live page. `ef0cd87` (current
  `main`) ratchets +12 px/click; **`aba1951^` (2026-08-09) ratchets identically**,
  507→519→531→543. The `3d1d4f1^` arm could not be measured — that build has no
  "Show all Tracks for Release" button, so the page type was not supported yet.
- **An earlier guess in this session was wrong and is corrected here**: `aba1951`
  ("support every AR relationship type on release-tracks") was suspected of
  making the bug visible by registering AR columns as collapsable. It did not —
  "Recorded at place" and its siblings are statically declared in the
  `release-tracks` page definition and were already ratcheting before that
  commit. `aba1951` only added the *dynamically discovered* AR columns.

Across the last 25 commits touching the userscript the only width-related diffs
are `1d0f0b2` (the drag floor — a different min-width, read only at mousedown)
and the four header-pill restyles, none of which touch this measurement.

### Docs

`ShowAllEntityData_HELP.txt` needed no edit — checked rather than assumed. It
documents ↔️ Resize, manual drag resize and the prose-column auto-resize cap, but
has never described the collapsable-column minimum this bug is in, so nothing in
it became false.

### Snapshot baselines re-captured — they had the ratchet baked in

Deferred at first because the Playwright session had expired; done once it was
renewed. `tests/snapshots/artist-events/` is the clearest evidence in the repo,
because its three files are captured after different numbers of passes:

| file             | pass                | Location | Place   | Locality | Region  | Country |
|------------------|---------------------|----------|---------|----------|---------|---------|
| rendered.html    | first render        | 913      | 425     | 238      | 353     | 187     |
| post-filter.html | + one column filter | 924→913  | 436→425 | 249→238  | 364→353 | 198→187 |
| post-sort.html   | + a sort            | 948→913  | 460→425 | 273→238  | 388→353 | 222→187 |

**+11 px after a filter pass and +35 px after a sort pass**, on five columns, in
files that are supposed to differ only in row order and row count. All three now
agree on the first-pass value.

**The frozen disk fixture confirms those are the correct widths, independently.**
`tests/fixtures/saved-data/artist-events.json.gz` was saved long before this bug
was noticed and stores `min-width: 913px`/`425px`/`238px`/`353px`/`187px` in its
own serialized headers — exactly what the fixed build now produces. It is also
the answer to a puzzle that cost a detour: those `<th>`s carry NO
`data-mb-collapse-min-px` stamp even though the value is clearly ours. They do
not need one — hydration restores the stored value, the fresh intrinsic
measurement equals it, so `minPx > existingMin` is false and nothing is written.
The stamp is absent because the write never happens, not because it was lost.

Measured on the disk-fixture path, which is a second rendering path entirely
(`loadFromDiskFixture` → `_hydrateAndRenderFromSnapshotData`, auto-resize never
runs there): `main` goes 924 after render → **936 after a sort**; the fixed build
holds 913 → 913. So the fix is verified on both the live fetch path and the
hydration path.

Per baseline: `artist-events/rendered.html` +5 stamps and +150 bytes with no
value moved; `release-tracks/rendered.html` +9 stamps, no value moved;
`notes-received` byte-identical; the eight others have no multi-row collapsable
cells at all, so they cannot move and were deliberately left alone rather than
re-captured into unrelated upstream drift.

**An orphaned stamp is expected, not a bug.** `artist-events/rendered.html`
serializes `data-mb-collapse-min-px="546"` beside `min-width: 930px`: we wrote
and stamped 546, then auto-resize cleared every floor and wrote its own 930. The
next `initCollapsableColumns()` pass sees the mismatch, leaves the min-width
alone — correctly, it is not ours — and drops the stale attribute. Self-healing
by construction, and the reason the cleanup compares the value rather than just
testing for the attribute's presence.

### `user-open-edits` cannot be captured right now — pre-existing, not this change

Its capture times out waiting for `#mb-filter-container`. **Reproduced on
unmodified `main`**, so it is not this branch's doing. Cause, measured against
the live page with the renewed session rather than guessed: the account has
**zero** open edits at the moment — `table.tbl` count 0, no edit rows, logged in
confirmed — so the script has nothing to render and the filter bar is never
built. Its committed baseline dates from when there were open edits and is left
untouched; the orphaned `raw.html` the aborted run wrote was reverted, since raw
and rendered must stay a matched pair. Re-capture when the account next has open
edits. `scripts/check-auth-state.js` reports whether the saved session is usable,
which is the first thing to check if this ever looks like an auth problem
instead.

## 2026-09-13 — `<span class="mp">` open-edits wrapper silently ate four release-tracks anchors (fixed, branch fix/release-tracks-pending-edits-anchors)

User-reported: a track's "Recording of work" cell rendered completely empty
for a work with open/pending edits (`debug/release-tracks-initial.html`/
`-final.html`, "Barcelona Night" release 20a52f17-ce0b-48bf-911e-9f962a518185,
track 8 "Light of Day", work d662d712-f9f8-4118-8bb2-a821395dbf96). Root cause:
`_findRecOfDt`'s work-anchor lookup was `_recOfDd.querySelector(':scope > a')`
— a direct-child-only query — but MusicBrainz wraps a credited entity's anchor
one level deeper in native `<span class="mp">` whenever that entity's own
`/entity/<mbid>/open_edits` list is non-empty (same marker documented in
`[[project_mb_mp_open_edits_class]]`, previously only confirmed for a joined
ARTIST credit). Confirmed the real shape directly in the debug HTML:
`<dd><span class="worklink"></span><span class="mp"><a href="/work/…">Light
of Day</a></span> (on 1999-04-11)<dl class="ars">…`. Fixed by filtering on
`href^="/work/"` instead of scope (mirroring `_recordedAtDdAnchor`'s existing
fix for the equivalent name-variation-wrapping case), then cloning the
OUTERMOST `<span class="mp">`/`<span class="name-variation">` wrapper via a
new shared `_outerCreditAnchorWrapper()` rather than the bare anchor, so the
pending-edits highlight survives into the cell too — not just the link text.

Auditing every other AR-column builder for the same shape (user asked "could
this happen on other columns") turned up three more real instances, all
narrower — the credited NAME still rendered in each, only the marker/row was
lost:

- **Performer/Vocals/Instruments/engineer-mixer-etc. credit columns**
  (`_buildCreditListItem()`/`_buildInstrumentVocalsListItem()`) cloned the
  wrapping `<span class="name-variation">` when present but never checked for
  `.mp` — `_findCreditSegmentArtistAnchor()` already finds the anchor
  regardless of wrapping (unscoped `querySelector`), so only the highlight was
  lost, silently. Same `_outerCreditAnchorWrapper()` fix.
- **The Title column's own recording anchor** — found only while trying to
  write a fixture for the next item below: a debug dump of the rendered Title
  `<td>` showed the `<span class="mp">` I'd put in the raw fixture had
  vanished entirely, even though nothing I'd touched yet should affect it.
  Root cause was upstream of every anchor-lookup fix above:
  `applyExtractTrackTitleData()` rebuilds the Title cell via
  `_titleTd.innerHTML = ''; _titleTd.appendChild(_recAnchor)` — `_recAnchor`
  is only the bare `<a>` (found via an unscoped query, so wrapping doesn't
  stop it being FOUND), and moving just that element back in discards
  whatever it was wrapped in. Fixed by moving
  `_outerCreditAnchorWrapper(_recAnchor)` instead — still a move, not a
  clone, so the JSDoc's node-identity guarantee for third-party scripts
  (jesus2099's AcoustID lookup) holds.
- **The millisecond-length WS2 backfill** (`_msStampFullReleaseRows()`) keys
  each row by re-reading the Title cell's recording anchor via
  `:scope > a[href*="/recording/"]` (deliberately direct-child-scoped — an
  unscoped query can grab an unrelated `/recording/` link from e.g. a
  "DJ-mix of" relationship elsewhere in the cell). Before the Title-column fix
  above, this was actually unreachable dead weight: the wrapper never
  survived long enough to reach it. New shared `_titleRecordingAnchor()`
  enumerates the direct-child case plus both wrapper orders
  (`mp > name-variation` and the reverse), keeping the scoping guarantee
  while tolerating the wrapper. Verified reachable only after fixing the
  Title-column bug first — my first mutation-test attempt on this one falsely
  "passed" against the unfixed code because the wrapper was already gone
  before this function ever ran.

Five fixture regression tests added, each mutation-tested (temporarily
reverted, confirmed to fail, restored):
`release-tracks-recording-of-pending-edits.spec.js` (two tests — the empty
cell, and a same-`<dd>` nested "version of:" work that a naive unscoped query
could have grabbed instead, since the real fixture row happens to credit
TWO different `.mp`-wrapped works one nested inside the other's `<dd>`),
`release-tracks-credit-pending-edits.spec.js`, `release-tracks-title-pending-edits.spec.js`,
`release-tracks-ms-length-overflow-pending-edits.spec.js`. All four new/
reused fixtures are real MusicBrainz markup (three spliced from
`debug/release-tracks-initial.html`'s own "Barcelona Night" tracklist rows
into the existing clean `tests/snapshots/release-tracks/raw.html` DOM shell;
the ms-length one reuses `release-tracks-ms-length-overflow.html` with one
track's title anchor synthetically `.mp`-wrapped, since no real captured page
happened to have a pending-edit RECORDING rather than a pending-edit work).

## 2026-09-14 — tag-value multi-table: Areas/Artists/Series/Works picked up Recordings' Event-* columns (fixed, branch fix/tag-value-entity-column-leak)

User-reported on `/tag/rock` (`pageType: 'tag-value'`, `tableMode: 'multi'`,
snapshot `debug/tag-rock.html`): the Areas and Artists sub-tables rendered
their entity name/comment under `Event-Type`/`Event-Date`/`Event-Detail`
instead of `MB-Name`/`Comment`, Series/Works got a spurious
`Event-Additional-Info` column that exactly duplicated `Comment`, and
Instruments/Labels/Places happened to render correctly. All seven declare an
empty `entityFeatures: {}` in the pageDefinition, same as everything else
with no per-entity extras — so the config itself was not the bug.

Root cause: `activeColumnExtractors`/`activeSyntheticColumnExtractors`/
`activeInjectedColumnExtractors`/`activeIntegerColumns`/`activeColumnErasers`
are module-level variables shared across every group table on a multi-table
page. Two call sites (the fetch loop's "Per-table extractor colIdx
resolution" block, and `renderGroupedTable`'s "Per-group thead for tag-value
/ instrument-list multi-table" block, plus the neighboring `user-ratings`
branch with the identical pattern) only rebuilt these arrays from the
current group's own `entityFeatures` when that map was non-empty
(`if (Object.keys(_groupFeatures).length > 0) { ... }`). When a group's
`entityFeatures` was `{}`, the whole rebuild was skipped, so the shared
arrays simply kept whatever the *previous group in iteration order* last
built. Both loops walk groups in the same fixed order — Areas, Artists,
Events, Instruments, Labels, Places, Release groups, Releases, Recordings,
Series, Works (the `entityFeatures` map's own declaration order) — so:

- Areas/Artists (right before Events) got correct 4-cell rows in the fetch
  pass (still `[]` at that point), but in the render pass — which restarts
  iteration from Areas again — inherited whatever the *previous full pass*
  left behind: Recordings' `eventParts` extractor (keyed on `'Comment'`,
  always resolvable since `MB-Name`/`Comment`/`Primary alias` exist on every
  group via the page-level `extractMainColumn` feature). 13 `<th>` vs. 4
  `<td>` → the browser's own positional column-count mismatch fallback
  shifted the real data left into `Event-Type`/`Event-Date`/`Event-Detail`.
- Instruments/Labels/Places (right after Events) inherited Events' harmless
  `dateParts` extractor (keyed on `'Date'`, a no-op column they don't have) —
  just as leaked, but invisibly so.
- Series/Works (right after Recordings) inherited `eventParts` consistently
  in both passes, so header/cell counts agreed (13/13), but the extractor ran
  for real against their own unrelated `Comment` text, hit its own
  "unrecognized shape" fallback, and dumped the whole raw comment into
  `Event-Additional-Info` — an exact duplicate of `Comment`.

Fixed by dropping the `Object.keys(...).length > 0` guard at all three call
sites (fetch loop, tag-value/user-tag-value/instrument-list render-loop
branch, user-ratings render-loop branch) — the rebuild now always runs,
merging the group's own `entityFeatures` when present and otherwise
collapsing back to the page-level `activeDefinition.features` baseline, so a
`{}` group can no longer inherit a neighbor's extractors. No change needed
to `resolveEntityFeaturesFromH3` or any `buildActive*` helper — both were
already correct; only the callers' conditional skip was at fault.

Separately (same session, unrelated cause): the "Show single-table" button
was missing entirely on every tag-value/user-tag-value sub-table without a
native MusicBrainz overflow link (`group.seeAllUrl`) — `SA_SNAPSHOT_SUPPORTED_PAGETYPES`
is a hardcoded pageType allow-list and simply never included `'tag-value'`/
`'user-tag-value'`. Added both, plus a new `SA_TAG_VALUE_CATEGORY_SLUGS` map
(h3 category name → MusicBrainz's own singular entity-type URL slug, e.g.
"Release groups" → `release-group`, confirmed against
`PAGETYPES-TESTING-REFERENCE.org` #38/#36's real `/tag/rock/artist` URL) so
`openSubtableAsSingleTableTab` routes the new tab to the `tag-value-entity`/
`user-tag-value-entity` single-table sibling via an extra PATH segment,
rather than the `?link_type_id=1` query-param trick the other pageTypes in
that allow-list use.

**Follow-up, same day:** adding tag-value/user-tag-value to
`SA_SNAPSHOT_SUPPORTED_PAGETYPES` immediately surfaced a second, genuinely
pre-existing bug — every category that DOES have a native "See all N …"
overflow link (e.g. Events, 257 rows) got a redundant "Show single-table"
button rendered alongside its correct "Show all N rows" one. Root cause: the
button-insertion blocks (the primary one right after `_updateSubTableH3Tooltip`,
and the defensive "Also inject … if absent" tail) both gate on
`group.seeAllUrl` alone — but that is only the field name
artist-relationships/label-relationships/place-performances-style pages use.
tag-value/user-tag-value's own "See all N" block (grep `group.tagSeeAllUrl
= _href;`) sets `tagSeeAllUrl` instead, never `seeAllUrl`, so
`!group.seeAllUrl` was unconditionally true for every tag-value category
regardless of whether it actually had a real overflow link. (Initial
suspicion was a later settle/re-render pass losing `seeAllUrl` off a rebuilt
group object — checked via `runFilter()`'s `filteredArray.push({ ...group,
rows: matches })`, which is a full shallow spread and drops nothing. The bug
was present on the very first render already, via the wrong field name, not
a second-pass data loss.) Fixed by additionally checking `!group.tagSeeAllUrl
&& !group.ratingsViewAllUrl` (the latter for `user-ratings`' equivalent
field, currently unreachable here since `user-ratings` isn't in
`SA_SNAPSHOT_SUPPORTED_PAGETYPES`, but included so the same mistake can't
recur if it ever is) at both call sites, rather than touching `seeAllUrl`
itself — the existing `if (group.seeAllUrl) { …builds a generic "Show all N
rows" button… }` branch must stay untouched, since tag-value's own dedicated
block already builds the correctly-worded button using `tagSeeAllUrl`
earlier in the same render pass.

## 2026-09-14 — Relationships column missing on release-group/release/label/work tables (branch fix/relationships-column-missing-entities)

Reported against `/tag/rock` (Labels/Release groups/Releases/Works
sub-tables), `/user/vzell/tag/back%20scan%20missing` (Releases), and
`/report/ASINsWithMultipleReleases`/`/report/DiscogsLinksWithMultipleReleaseGroups`.
Confirmed against the captured `debug/tag-rock.html`: zero
`Relationships`/`mb-rel-cell` occurrences across all 11 rendered sub-tables,
not just the four named ones.

**Root cause 1 - `activeInjectedColumns` resolved once, page-wide.**
`tag-value`/`user-tag-value` declare `injectedColumns: ['Relationships']`
only under the `'Release groups'`/`'Releases'` `entityFeatures` keys.
`activeInjectedColumns` was built exactly once in `startFetchingProcess()`
from `resolveEntityFeaturesFromH2(baseDef)` - and a tag page's real `<h2>`
("Entities tagged as X") never matches any `entityFeatures` key, so
resolution always fell back to the FIRST declared key (`'Areas'`, which is
`{}`), hiding the column for the whole page. The per-group extractor-rebuild
block that already exists for exactly this class of page (see the
2026-09-14 entity-column-leak entry above - same mechanism, same fix
pattern) never rebuilt `activeInjectedColumns`, only the extractor/eraser
arrays.

**A second, independent instance of the same bug** lived in
`renderGroupedTable()`'s OWN per-group `<thead>` rebuild (a separate,
later pass from the fetch loop) - it also never rebuilt
`activeInjectedColumns`, so even after fixing the fetch-loop rebuild, every
group's cloned `<thead>` still carried whichever entity type the FETCH
LOOP's last-processed group had left behind. Caught by a debug capture
showing every group's header-injection log line reporting the SAME
`entityType` ("(work)", since `'Works'` is last in `entityFeatures`'
declaration order) regardless of which group it belonged to, and a
`hasColumn: true` on `'Areas'` (which declares no `injectedColumns` at
all) with a `null` mbid - a ghost cell, not a real one.

**A third, independent instance** lived in `_initRelationshipsColumnImpl()`
itself: `const { entityType, incOptions } = activeInjectedColumns[0];` is a
SINGLE destructured value used for every cell's IDB lookup, L1 cache key,
and WS2 fetch across the WHOLE page - so even with both rebuilds above
fixed, every group's WS2 request was still issued against whichever
entityType happened to be the page-wide value by the time this function
ran (again, whichever group's render-loop rebuild ran last). Confirmed via
route interception: all requests hit `/ws/2/work/<mbid>` regardless of
whether the mbid belonged to a Label, Release group, or Release row.

**Fix**, in three parts mirroring the three call sites: (1)
`buildActiveInjectedColumns(def, entityKindHint)` gained an optional hint
parameter, normalized via a new `_relEntityKindFromHint()` (`'Release
groups'`/`'Releases'`/`'Labels'`/`'Works'` -> `release-group`/`release`/
`label`/`work`, anything else -> unsupported/no column); (2) both the
fetch-loop and render-loop per-group rebuilds now pass the group's own
category/entityFeatures key as that hint, AND the render-loop additionally
stamps the resolved entity type onto the actual DOM `<table>` element
(`table.dataset.mbRelEntityType`) since that table - not the fetch-loop's
scratch table - is what still exists when `_initRelationshipsColumnImpl()`
runs later; (3) that function now resolves each cell's entityType from its
OWN closest table's stamp (`mbidEntityType` map, built alongside
`cellsByMbid`) at every IDB/cache/fetch call site, falling back to the old
page-wide value for every other pageType (single entity kind, never
stamped, unaffected). `_relRetryTable`/`_relRetryAll` got the same
per-table/per-entity-type treatment, the latter now grouping mbids by
their owning table's entity type and issuing one retry pass per group
instead of one page-wide pass.

Two smaller, narrower gaps compounded root causes 1-3: `_extractMbidFromRow()`'s
href regex didn't recognize `/label/` at all (only
release-group/release/work), and `_suppressRelationshipsIfNoReleaseOrReleaseGroupLinks()`
only exempted `entityType === 'work'` from its "no release/release-group
link found -> strip the column" check - a Labels table's only entity link
lives in the STICKY title column (excluded by that check's own selector),
exactly the same reason `work` needed the exemption. Both fixed by adding
`label` alongside the existing `work` handling.

Also added the same `injectedColumns: ['Relationships']` declaration to
several other pageTypes/entityFeatures-keys found missing it by the same
audit, where a sibling with the identical entity kind already had it:
`area-labels`, `area-works`/`area-works-filtered`, `collections-releases`
(`'Labels'`/`'Works'`), `series-releases` (`'Works'`), `search`
(`'Labels'`/`'Works'`), and - resolved dynamically per report from its own
main-column name rather than a static declaration, since `report-detail`/
`report-multiple-linked` are ONE definition shared by ~117 differently
shaped reports - the whole report family. A report whose main column isn't
Release/Release group/Label/Work (Recording, Artist, Place, Collaborator,
etc.) correctly gets no column, via the same `_relEntityKindFromHint()`
normalization returning "unsupported" rather than a hardcoded per-pageType
denylist.

Regression coverage: `tests/fixtures/tag-value-relationships-column.spec.js`
(new fixture `tag-value-relationships-column.html`, extending the same
h3+ul native shape as `tag-value-entity-column-leak.html`) asserts all four
target groups get the column with the CORRECT WS2 entity type
simultaneously, that the control group (`'Areas'`) gets none, and that no
request ever queries `entityType=release` for a Labels/Release-groups/Works
row (the specific old-default regression). `tests/fixtures/report-relationships-column.spec.js`
covers both named reports plus a report-detail report whose main column
(`Place`) is unsupported, confirming it gets no column and issues no WS2
request at all. Both mutation-checked via the actual before/after states
captured while iterating on the fix (each of the three root causes was
independently observed to reproduce with the fix for the other two already
applied, then to disappear once fixed).

## 2026-09-15 — Relationships column follow-up: user-ratings, artist-credit, artist-relationships (same branch)

User reported the 2026-09-14 fix above still left the column missing on
`/user/vzell/ratings`, `/artist/<mbid>/relationships` (work-related
sub-tables), and `/artist-credit/<id>` — plus a second, independent bug on
the latter (missing column HEADERS on its 'Recordings' sub-table). All three
turned out to be more instances of the same "a shared value is read after
whichever group ran last, not the group actually being asked about" family
already diagnosed the day before, plus one genuinely new mechanism
(artist-relationships has no entityFeatures map at all to key a fix off of).

**user-ratings/user-ratings-type**: their 'Release groups'/'Labels'/'Works'
entityFeatures keys had `injectedColumns` deliberately REMOVED, with a
comment citing three reasons — verbatim, buildActiveInjectedColumns()
resolving entityType from pageType alone, the render-loop per-group thead
rebuild never re-deriving activeInjectedColumns, and
`_initRelationshipsColumnImpl()`'s page-wide `_ensureRelCell` scan tagging
every entity kind as the same one. All three were exactly what the
2026-09-14 fix addressed for tag-value — the comment's own reasoning was
sound, just no longer current. Re-enabled `injectedColumns` on those keys;
the only new wiring needed was storing `_lastGroup.entityFeaturesKey`
(distinct from `.category`, since user-ratings' h3 text is "Release group
ratings" but its entityFeatures key is "Release groups") and passing THAT as
buildActiveInjectedColumns()'s hint in both the fetch-loop and (newly added)
render-loop rebuilds. Verified against the real capture
`tests/fixtures/user-ratings-multigroup.html` (already committed for an
unrelated bug) — Labels/Release groups/Works ratings now get the column with
the correct WS2 entity type, Artist ratings correctly gets none.

**artist-credit**: `renderGroupedTable()`'s per-group `<thead>` rebuild
branch (the one that already existed for tag-value/user-tag-value/
instrument-list) never listed `'artist-credit'` as a matching pageType,
despite the FETCH-loop's own equivalent rebuild already covering it. Every
sub-table's header was therefore just a clone of the single shared
`templateHead` — built once, reflecting whichever group's extractors the
fetch loop left active last. Confirmed via `debug/artist-credit.html`:
'Recordings'' own `Video`/`Event-*` headers (from its own
`columnExtractors`/`syntheticColumnExtractors`) never appeared at all, and
'Release groups'/'Releases' MB-Name/Comment/Primary-alias headers carried a
`title="Extracted from 'Release group': …"` tooltip regardless of which
group they actually belonged to. Fix: add `'artist-credit'` to that branch's
condition — same one-line class of fix as the tag-value/user-ratings case
above, just a different call site.

**A fourth, page-wide instance of the same bug family**, found debugging
artist-credit: several functions gate on the shared `activeInjectedColumns.length`
to decide "does this PAGE have a Relationships column at all" —
`_relInitColHeaderToggles()`, `_relPublishCollapsedStatus()`,
`_initRelationshipsColumnImpl()`'s own entry guard, `_relCreateRetryButtons()`,
and both `initRelationshipsColumn()` call sites in the render tail (live and
disk-load paths). Every one of these runs AFTER the whole per-group render
loop finishes, so by then that variable holds whatever the LAST-processed
group's own declaration was — on artist-credit, that group is 'Recordings'
(declares no `injectedColumns`), so `initRelationshipsColumn()` was never
even CALLED, for the whole page, despite 'Release groups'/'Releases' having
real `.mb-rel-cell` tds sitting inert in the DOM. Same failure shape as
user-ratings if its last-alphabetical group (e.g. 'Works') happened to be
declared and a later one wasn't — order-dependent, silent, and invisible
from a single test fixture unless the fixture's own group order happens to
put a declaring group last. Fixed by adding `_relPageHasColumn()` —
`!!document.querySelector('td.mb-rel-cell')`, the actual DOM-truth signal,
since a cell is only ever appended when SOME group's own
`activeInjectedColumns.length` was true at that row's build time — and
swapping every one of those gates to call it instead. `_initRelationshipsColumnImpl()`'s
own fallback `entityType`/`incOptions` destructure (now genuinely reachable
with `activeInjectedColumns` empty, where it used to be unreachable because
the same stale check that gated the function also gated the destructure)
needed default values to not throw.

**artist-relationships (and label-relationships/place-performances, same
shape)**: genuinely the odd one out — no entityFeatures map at all, one flat
page-wide `features` block, grouped by RELATIONSHIP TYPE (h3 = "wrote work",
"producer", …) rather than entity kind. `buildActiveInjectedColumns()` has
nothing to key a hint off, so every sub-table's entityType is the page-wide
generic 'release' default forever. `_suppressRelationshipsIfNoReleaseOrReleaseGroupLinks()`'s
existing work/label exemption only fired when the (never-varying) page-wide
default already equalled 'work'/'label' — never true here — so a
work-targeted sub-table's column was unconditionally stripped. Confirmed
against a real capture, `debug/artist-relationships.html`'s "wrote work"
sub-table (uncollapsed, user-supplied): the Title column is not even
physically first (native order is Date, Title, Credited as, Attributes,
Artist) and its cell is exactly `<span class="worklink"></span><a
href="/work/<mbid>">`, no secondary reference anywhere else in the row — the
same structural fact that already justified the work/label sticky-column
exemption for artist-works/area-labels, just never reachable dynamically.

Fix: `_suppressRelationshipsIfNoReleaseOrReleaseGroupLinks()` now SNIFFS for
a `/work/` or `/label/` link anywhere in the tbody (deliberately NOT scoped
to `.mb-sticky-col` — `applyStickyColumn()` hasn't run yet at this call site,
it happens later in the render tail, confirmed by this exact table failing
to match a sticky-scoped selector on the first attempt) and, if found, stamps
`table.dataset.mbRelEntityType` and exempts the table exactly as if it had
been declared that way. The existing release/release-group non-sticky scan
was extended the same way — capture which of the two patterns matched and
stamp accordingly, since a page mixing release- and release-group-targeted
relationship types (both surface their link via the CAA-column thumbnail)
would otherwise all silently fall back to the page-wide 'release' default
too.

**Regression this same sniff caused, caught by the existing suite**: gating
the sniff on "`table.dataset.mbRelEntityType` not yet set" alone was too
broad — it also fired for `series-releases` (which DOES have an
entityFeatures map and an already-correctly-resolved 'release' entityType
via the 2026-09-14 fix's `_entityKindHintFromH2` mechanism), because a
release listing's own "Label" column (record-label credit, unrelated to the
row's own release entity) legitimately contains a `/label/<mbid>` link. That
wrongly re-stamped a genuinely release-typed table as 'label', caught by
`rel-ws2-seed-warm-cache.spec.js` expecting `/ws/2/release/` and observing
`/ws/2/label/` instead. Fixed by gating the whole sniff (both the new
work/label check and the extended release/release-group stamp) on
`!activeDefinition.entityFeatures` — it now only ever runs for pageTypes
that have NO entityFeatures map to have resolved a hint from in the first
place, which is exactly the set of pageTypes it exists for.

New regression coverage: `tests/fixtures/user-ratings-relationships-column.spec.js`
(reuses the already-committed `user-ratings-multigroup.html` capture),
`tests/fixtures/artist-credit-relationships-column.spec.js` (new fixture,
covers both the header-cloning bug and the Relationships column),
`tests/fixtures/artist-relationships-work-column.spec.js` (new fixture built
from the real "wrote work" structure above). All three mutation-checked the
same way as the 2026-09-14 entry's specs — observed failing before each
respective fix, passing after.

## 2026-09-15 — a WS/2 503 in the Relationships column read as "no relationships", permanently (fixed, branch rel-column-batch-and-cell-states)

Not reported. Found while designing PERFORMANCE.org Step 36's per-row
load-state glyphs, where a "none" glyph would have displayed the defect as
fact.

**Root cause, three parts that compounded.** `_relFetchWs2()` resolved `null`
for any non-OK status and for a thrown fetch. `_populateCells(mbid, null)` is
ALSO the "this entity has zero relationships" path, so it stamped `relDone` and
left the cell empty. And the `null` promise stayed in `_relWs2Cache` for the
rest of the session, so neither a later pass nor a collapse/expand ever asked
again — only a 🔗⟳ retry, which evicts, recovered it. The millisecond-Length
batch source had already fixed the identical defect for itself ("only a
SUCCESSFUL answer is cached").

**How often it bites.** The Step 36 endpoint probe (host `vzell-lap`,
2026-09-15 19:30-19:42 UTC) needed 3-5 attempts for most requests. At the old
single attempt, most of those would have become permanent empty "done" cells.

**Fix.**

- `_ws2GetJson()` extracted from `_msFetchOneBatch()` with identical behaviour
  (3 attempts, 503 or thrown request retried, other statuses final). All five
  `*ms-length*.spec.js` fixture specs pass on it.
- `_relFetchWs2()` resolves `{outcome: 'ok'|'error', data, detail}`. A 404 is
  `ok` with `null` data. An `error` is evicted from L1 as soon as it settles and
  is never written to IndexedDB.
- `_relMarkCellsFailed()` marks `data-rel-error` — never `relDone` — on the
  live cells and the master rows.
- A failed cell is skipped by `_relAnyPendingInExpandedTable()`, the impl's
  candidate scan and `_relQueueStillWants()`. `_relToggleTable()`'s collapse and
  `_relRetryMbids()` clear the marker; those two are the retry paths.
- `_relAwaitRateSlot()`: one ≥1100 ms gate for every Relationships request,
  retries included. It replaces the Phase-2 queue's unconditional sleep, so an
  L1 hit no longer waits a second. The queue reserves the slot itself and
  re-asks `_relQueueStillWants()` after the wait, which keeps Step 35's "a
  superseded queue stops requesting" guarantee
  (`rel-column-collapse-toggle.spec.js` still passes).
- The completion toast and status tooltip report the failed count.

**Regression spec** `tests/fixtures/rel-column-fetch-failure.spec.js`. Before
the fix it failed at `a failed request must not be marked done` (received
`[true]`).

**Mutation-checked with a new runner**, `scripts/mutation-check.py` fed
`scripts/mutations/rel-column-fetch-failure.json`: 8 planted defects, run
unattended, userscript restored and hash-verified afterwards. All 6
expected-fail mutations failed, each at its own assertion (gate exclusion,
scan+stillWants exclusion, L1 eviction, collapse clearing the marker, retries,
master mirror). Both expected-pass mutations passed: removing only the
candidate-scan exclusion, or only `_relQueueStillWants()`'s, is invisible
because each covers for the other. The spec pins them as a PAIR and says so in
its header, rather than implying each is load-bearing.

The first draft of the spec pinned "no retry storm" with a request count after
a keystroke only. That would have stayed green under the removal of any one of
the three exclusions, since the other two still prevented the request — the
"proves something adjacent" trap. It now asserts `relInitRuns()` does not move
(the gate) and forces a pass through a new `__saTest.relRunPass()` hook (the
pair).

**Observed, not attributed.** In one parallel 35-test run (this spec +
`rel-column-collapse-toggle.spec.js` + the five ms-length specs, default
workers, `vzell-lap`, evening of 2026-09-15 UTC), the collapse spec's
"multi-table: the threshold is decided per sub-table, and collapsing survives a
filter" failed its final assertion. `relTableStates()` returned only the
still-filtered table — `[{expanded: false, pending: 1, uniqueMbids: 1}]` — so
its fixed `waitForTimeout(1500)` after clearing the filter sampled the page
before the re-render finished. It passed 3/3 standalone with `--workers=1`. The
test issues no toggle and its single fetch had already landed, so it does not
reach the changed code — but it was NOT run against `main`, so "pre-existing"
is inferred, not established. The new multi-table failure test polls the
re-render instead of sleeping.

## 2026-09-15 — Relationships per-row load-state glyphs and click-to-load (branch rel-column-batch-and-cell-states)

PERFORMANCE.org Step 36, part 2. Requested in `org/relationships.org` (items
2-4): show per row whether it has been fetched, and let a click fetch only that
row, even in a collapsed column. The user picked the link-outline glyph set and
a hover ⟳ reload.

**Built.** CSS-only glyphs (🔗︎ not loaded, ⋯ queued, ◌ loading, – none, ⚠︎
failed, hover ⟳), keyed on `data-mbid`/`data-rel-done`/`:empty` and the table's
`data-mb-rel-expanded`, plus two transient attributes, `data-rel-loading` and
`data-rel-error`. `_relLoadRow()` loads one row; the icon writer, the failure
marker and the master-cell lookup moved to module level (`_relWriteResult()`,
`_relWriteFailure()`, `_relMasterCellsFor()`) so the bulk pass and a click share
them. New setting `sa_rel_cell_state_glyphs` (default on). The spec
`tests/fixtures/rel-cell-state-glyphs.spec.js` was written first: 8 of its 9
original tests failed on the pre-change code (the ninth pins the off switch,
which cannot fail on code without the feature).

**Four things went differently from the plan, each worth keeping.**

1. *The glyph CSS was first gated by a class on `<html>`.* The snapshot harness
   (`tests/support/snapshot.js`) serializes the whole `documentElement`, so that
   class would have become markup drift in every rendered baseline — including
   pageTypes with no Relationships column at all, the exact drift CLAUDE.md's
   Relationships section warns about. It is now a separate stylesheet,
   `#mb-rel-cell-glyph-style`, injected only while the setting is on.
2. *A clicked row can be filtered out before its answer arrives.* Then there is
   no live cell, and the first version of the writer mirrored `cells[0].innerHTML`
   — i.e. `''` — over the master row, which came back marked done with no icon.
   The writer now renders into the first master when there is no live cell. It
   was caught while writing the mutation list, not by a report; test "a row
   hidden by the filter while its answer is in flight still gets its icon"
   asserts the row really was hidden before the (delayed) answer landed, so it
   cannot pass trivially.
3. *No priority lane on the rate gate.* The Phase-2 queue only ever reserves one
   slot ahead, so a click that simply reserves the next slot is served ahead of
   the rest of the queue. Test "a queued row shows ⋯, and clicking it fetches it
   ahead of the queue".
4. *The partial-snapshot rule was needed now, not later.* `_relTableExpanded()`
   read ANY `relDone` cell as "restored from a snapshot, start expanded", so a
   sub-table carrying one hand-loaded row reopened in its own tab expanded and
   queued the rest. It now defaults to expanded only when every rel cell is
   done. Driven through the real cross-tab handoff (`tests/support/subtableTab.js`).

**Guards and their mutation results** (`scripts/mutations/rel-cell-state-glyphs.json`,
`vzell-lap`, 2026-09-15). 9 of 9 expected-fail mutations failed, each at its own
assertion: the per-cell token filter; collapse clearing the token; the master
mirror of a hand-loaded row; the delegate ignoring icon-link clicks; the forced
reload; the writer's `textContent` clear (a reload then appends a second icon —
the multiplying-icons failure, now reachable by a click, so the clear is no
longer merely defence in depth); the settings gate on clicks; the
partial-snapshot rule; and the master fallback for a filtered-out row. The one
expected-pass entry passed: removing the queue's `data-rel-loading` exclusion is
invisible to request counts, because the step shares the click's in-flight L1
promise.

The Step A mutation list (`rel-column-fetch-failure.json`) was re-run after the
writer refactor, since several of its `find` strings moved: 8 of 8 as expected.
Userscript restored and hash-verified after both runs.

## 2026-09-15 — release listings looked every row up as a LABEL: no Relationships icons at all (hotfix, branch fix/rel-release-listings-label-entity)

Not reported by a user. Found while building the Relationships browse source
(PERFORMANCE.org Step 36, branch `rel-column-batch-and-cell-states`): its
browse-resolver refused every releasegroup-releases table because the table
claimed to be a LABEL table, and the spec saw zero browse requests.

**Evidence.** The failing test's Playwright trace held seven requests of the
form `/ws/2/label/001af5ba-d4a5-4677-a3ec-601250031fb6?inc=url-rels+label-rels`.
In `tests/snapshots/releasegroup-releases/raw.html` that MBID is
`href="/release/001af5ba-…"` — a release. The page's 7 rows carry 7 `/label/`
links (the "Label" column) and 8 `/release/` links. The only `/release-group/`
links in the raw page sit in MusicBrainz's own relationship details table, not
in the release rows.

**Root cause.** `442dd8c` added a work/label sniff to
`_suppressRelationshipsIfNoReleaseOrReleaseGroupLinks()` for
artist-relationships' work- and label-targeted sub-tables, and placed it BEFORE
the release/release-group scan. A release listing's own record-label link
matched it on the first row, so the table was stamped
`mbRelEntityType = 'label'` and every release was looked up as a label. Live,
each lookup is a 404, which the column renders as "no relationships": no icons
at all. The earlier `!activeDefinition.entityFeatures` gate fixed exactly this
for series-releases (caught by `rel-ws2-seed-warm-cache.spec.js`) but left every
release listing WITHOUT an entityFeatures map exposed — artist-releases,
releasegroup-releases, recording-releases and the rest.

**Shipped in 9.99.1086 through 9.99.1091**, verified by ancestry rather than log
order: `git merge-base --is-ancestor 442dd8c` holds for the 9.99.1086 and
9.99.1091 folds and fails for 9.99.1084.

**Why no test caught it.** Every Relationships spec routes `**/ws/2/**` to a
canned answer carrying a relationship, whatever URL was asked. A label lookup
"found" icons exactly like a release lookup, so the column looked healthy. The
lesson is the same "proves something adjacent" trap CLAUDE.md warns about: the
specs pinned "icons appear", never "the right entity is asked for" — except the
tag-value/user-ratings/artist-credit/report specs, which do assert the entity
segment but on pages that never had a Label column.

**Fix.** The release/release-group scan now runs first (after the empty-tbody
guard, which the sniff could never have matched through anyway), and the
work/label sniff only runs when no release link exists. A row that links a
release is a release row, whatever else it links. The "wrote work" fixture
(`tests/fixtures/artist-relationships-work-column.html`) has 0 release links
and 1 work link, so the case the sniff exists for is unchanged.

**Regression spec** `tests/fixtures/rel-column-release-listing-entity.spec.js`
asserts the REQUEST, not the icons: both sub-tables stamped `release`, every
lookup `/ws/2/release/<mbid>`, none `/ws/2/label/`, and each looked-up MBID one
of the page's own releases. It failed on unmodified `main` with stamps
`["label", "label"]`. Reverting the fix restores exactly that pre-fix code, so
that run is the mutation check.

Done in a git worktree off `main`, so the in-progress Step 36 branch's
uncommitted work was never stashed or disturbed.

**One red test in the pre-merge suite, bisected rather than waved through.**
The full fixture suite on this branch was 254/255: `picard-cells-survive-rerender.spec.js`'s
"a global-filter keystroke does not empty the Picard column" timed out in a
`page.waitForFunction` (its filter-settle waits). It runs on the SAME
releasegroup-releases shell this fix touches, so it was A/B'd on `vzell-lap`,
2026-09-15 evening UTC, running that one test with `--workers=1
--repeat-each` on the userscript stashed back to `main` and on the fix:

| Code     | Runs | Failed |
|----------|------|--------|
| `main`   | 18   | 2      |
| this fix | 22   | 4      |

The same timeout on unfixed `main`, at a comparable rate. The code rules the fix
out entirely, too: that spec loads a disk fixture through `loadUserscriptPage()`
with `fixtureFile`, so `FIXTURE_SETTINGS_OVERRIDE` forces
`sa_enable_relationships_column` off; the disk-load path rebuilds
`activeInjectedColumns` through `buildActiveInjectedColumns()`, which returns
`[]` with that setting off; and `_suppressRelationshipsIfNoReleaseOrReleaseGroupLinks()`
returns on its `!activeInjectedColumns.length` check, before the reordered
block, in both versions. It is the spec's own documented settle flake, not a
regression.

## 2026-09-15 — Relationships browse endpoint as a bulk source (branch rel-column-batch-and-cell-states)

PERFORMANCE.org Step 36, part 3 — item 1 of `org/relationships.org`: fetch more
than one row per request.

**Built.** `features.relBrowse: { entity, by }` on the seven pageTypes
`scripts/probe-rel-batch-endpoints.py` cleared; `_relBrowseSource()` resolves it
only when the URL's own entity is `by` AND the table's entity type is
`entity`. The impl's browse phase is the first link of the fire-and-forget
fetch chain: a lone pending row is left to a lookup; page 1 is always fetched
otherwise; browsing stops on a page that matched nothing still pending, when
the pages left are no fewer than the rows still pending, on the last page, or
on a failed page. Every entity on a page is cached under its lookup key (L1,
plus one IndexedDB transaction per page via `_relIdbPutMany()`). Kill switch
`sa_rel_browse_batch_enable`.

**First run: zero browse requests — a bug on `main`, not in this code.**
Release listings were stamped as label tables (see the hotfix entry above), so
`_relBrowseSource()` correctly refused every one. Fixed on `main` as 9.99.1092
and merged into this branch; `rel-column-browse-batch.spec.js` went 0/6 →
7/7 on the merged tree with no change to the browse code.

**Mutation run** (`scripts/mutations/rel-column-browse-batch.json`, `vzell-lap`,
2026-09-15 evening UTC): 14 of 14 as expected, userscript restored and
hash-verified.

- An early `return` in the browse phase — the pre-Step-36 code — failed all six
  browse-exercising tests, one entry each, which is the "fails before" proof.
- Removing the zero-match stop, removing the page-count stop, browsing a lone
  pending row, ignoring the kill switch, and asking for a wrong `inc` set each
  failed their own test.
- Two documented passes: a hard-coded `url-rels` (the spec only covers the
  release mapping, whose inc set is `url-rels` alone — a real coverage gap for
  release-group/work/label), and not putting browse answers into L1 (IndexedDB
  covers the re-expand).

**One mutation failed at the WRONG assertion, and that was a finding.**
"Browse page not written to IndexedDB" was meant to fail at the fresh-page L2
check, but failed earlier, at "the L1 cache served the re-expand". With the IDB
write gone, the re-expand's Phase 1 misses every row, and `_relBrowsePhase()`
then fetched a whole page again — it never consults `_relWs2Cache`, although
every answer was already there. Live, that is one wasted request per expand
whenever IndexedDB does not serve the rows (`sa_rels_idb_enable` off, or a
failed write).

**Fixed.** The browse phase now leaves L1-answerable rows out of its pending
set, so the per-MBID steps serve them for free. Pinned by a new test, "with
IndexedDB off, re-expanding a browsed sub-table is served from memory, not
re-browsed", and a fifteenth mutation entry, "browse phase ignores L1", which
reverts the fix. Re-run of the whole list: 15 of 15 as expected, userscript
restored and hash-verified — and the IndexedDB entry now fails at the assertion
it was written for ("IndexedDB served every row, browsed or looked up") rather
than at the L1 one. Browse spec: 8 of 8.

## 2026-09-16 — Relationships done/total badge and 📊 "Load state" section (branch rel-column-batch-and-cell-states)

PERFORMANCE.org Step 36, the last two parts — item 4 of `org/relationships.org`:
see, without the debug console, whether a huge sparse table still has rows to
fetch.

**Built.**

- *Badge*: `.mb-rel-col-hdr-btn[data-rel-progress]::after { content:
  attr(data-rel-progress) }`. `_relUpdateColHdrBtn()` sets `done/total`
  (distinct entities, from `_relTableProgress()`) only while something is
  unloaded, and adds "N failed" to the tooltip. Both cell writers call
  `_relScheduleProgressRefresh()`, coalesced to one refresh per animation frame
  per table, which also re-syncs the collapsed filter box and drops that
  table's 📊 cache.
- *📊 section* `relLoadState`, "Relationships - Load state": four fixed
  `rel-state-*` modes (pending / has / none / error). The counts and the
  `_cellMatchesStructureMode()` branch share one classifier,
  `_relCellLoadState()`. Offered collapsed or expanded; zero counts omitted.
  The collapsed note now says "N of M loaded", and icon counts are computed for
  a collapsed column once any of its cells is loaded.

Both specs were written first and failed 8 of 8 on the pre-change code.

**Two mistakes of mine, both in the SPEC, both caught by the first green-ish
run.**

1. *"3 of 12 loaded" was wrong; the code's "2 of 12" was right.* The test loads
   a row with relationships, a row with none, and a row whose request fails.
   The badge, its spec, the changelog and HELP all define a failed request as
   NOT loaded, so the note must agree with them. The expectation was changed,
   not the code, with a comment pointing at the badge spec's definition.
2. *Clicking the 📊 wrap to close the dropdown reopened it.* The failure
   screenshot showed the header at the very bottom edge of the 720 px viewport,
   with the panel opened upward. Playwright scrolls an element into view before
   clicking; the dropdown's scroll handler closes the panel as soon as its
   owning wrap moves; the click then toggled it OPEN again. A person clicking a
   visible wrap never triggers that scroll, so this is a harness effect, not a
   product bug. Escape was no alternative: while the quick-filter box has focus
   its own key handler takes Escape over. The helper now dispatches a
   `mousedown` on `document.body`, which reaches the capture-phase
   outside-press listener — no scroll, no focus dependency, nothing clickable.

**Recorded overlaps** (`expect: "pass"` in the mutation lists, not hidden):
the failure writer's own refresh is invisible when later successful writes
refresh the badge anyway; and the per-write 📊 cache drop is invisible to a
spec that loads rows by clicking, because `_relLoadRow()` drops the cache
itself — it matters for bulk writes during a fetch, which no spec reopens the
dropdown during.

**Mutation results** (`vzell-lap`, 2026-09-15 evening UTC; userscript restored and
hash-verified after each list):

- `scripts/mutations/rel-column-progress-badge.json`: 7 of 7 as expected. The
  attribute never set, never removed on completion, drawn by an empty CSS
  rule, the result writer not refreshing, a failed row counted as done, and the
  tooltip omitting failures each failed; the failure-writer overlap passed.
- `scripts/mutations/uniq-drop-rel-load-state.json`: 7 of 7 as expected. A
  matcher that matches every row, a section that never renders, a zero-count
  entry shown, a collapsed note ignoring loaded rows, an empty row classified as
  "has", and icon counts skipped on a collapsed partly-loaded column each failed
  at their own assertion; the per-write cache-drop overlap passed.

**A third spec weakness, found by reading WHERE a mutation failed.** "A failed
row counted as done" was caught — but by the tooltip's "1 failed" check, not by
the badge check meant for it. The test polled the badge until it read `11/12`,
and that value appears transiently while the failing row is still retrying, so
the badge assertion could pass without proving anything about failures. The test
now waits until every other row is done and the failing row is marked failed,
and only then reads the badge. Re-checked with that single mutation: it now
fails at the badge's `toBe('11/12')`, not at the tooltip.

**Full fixture suite** on the finished tree: 284 passed (9.9 min, `vzell-lap`,
2026-09-15 evening UTC).

## 2026-09-16 — Load-from-Disk builds a Relationships `<th>` with no `<td>`s (9.99.1086, fixed in 9.99.1093)

**Not this branch.** Found while running PERFORMANCE.org Step 36's perf gate:
both `--rel-arm=expanded` arms (branch AND `main`) aborted on the harness's own
icon floor with *0 icons rendered* against a seed of 2329 url-rels. The same arm
rendered 2090 at 9.99.1073. The guard did exactly its job — an under-populated
column would otherwise have been published as a second `--rel-arm=collapsed`
arm reading "the feature costs nothing".

**Root cause.** `442dd8c` (released as **9.99.1086**) replaced the guard on BOTH
`initRelationshipsColumn()` call sites:

```
-            if (activeInjectedColumns.length) initRelationshipsColumn();
+            if (_relPageHasColumn()) initRelationshipsColumn();
```

`_relPageHasColumn()` is `!!document.querySelector('td.mb-rel-cell')`. On the
LIVE render path that is right, and its own JSDoc says why: a rel `<td>` "is
only ever appended when SOME group's own `activeInjectedColumns.length` was true
at that row's build time", which is the correct per-page answer on pageTypes
whose sub-tables get a per-group rebuild.

**That premise does not hold on the Load-from-Disk path**, and that is the bug.
There, rows are rebuilt from the snapshot, and
`_hydrateAndRenderFromSnapshotData()` stamps `td.mb-rel-cell` only for cells
whose saved payload carried an `mbid` — which `_buildDiskCellData()` writes only
for a cell that already WAS a rel cell at save time. The cells for a snapshot
that never had the column are created by `_ensureRelCell()`, which lives
*inside* `initRelationshipsColumn()`. So the guard asks for the cells that the
function it guards is the thing that creates: false for exactly the files that
need it, and it can never become true.

**The `<th>` is built anyway**, from `activeInjectedColumns` in the header pass
(`thInj.classList.add('mb-injected-column')`), which the disk path rebuilds at
`buildActiveInjectedColumns()`. So the restored table is **misaligned by one
column**, not merely missing icons — every cell from the Relationships index
rightward shifts, and the Picard `<td>` lands under the Relationships `<th>`.

**Bisected** (`vzell-lap`, 2026-09-16, `scripts/diagnose-rel-expanded-arm.js`,
Dylan `artist-releases` disk fixture, 2301 rows, rel cache pre-seeded so the
column needs no network):

| Userscript                   | icons | rel cells | `<th>` | `<td>` | `relInitRuns` | WS/2 |
|------------------------------|------:|----------:|-------:|-------:|--------------:|-----:|
| `60eab35` (parent)           |  2090 |      2301 |     22 |     22 |             1 |    0 |
| `442dd8c` (the change)       |     0 |         0 |     22 | **21** |             0 |    0 |
| `d5bba41` = `main` 9.99.1092 |     0 |         0 |     22 | **21** |             0 |    0 |

The seed itself is fine in every run: 2301 records written, keys `release:<mbid>`,
and the table is correctly stamped `mbRelEntityType: release` (so 9.99.1092's
own hotfix works). Zero WS/2 requests on all three — the column never starts.

**Blast radius.** Any Load-from-Disk of a file saved WITHOUT populated rel cells
on a pageType that declares the column: no icons, no `▶🔗` toggle, and a
one-column misalignment. Files saved WITH the column populated are unaffected
(their cells carry `mbid`, so the guard is true). The cross-tab "Show
single-table" handoff shares the same hydrate function and the same gate.
The live "Show all" path is NOT affected — there the row-build pass appends the
cells before the gate runs.

**Why no test caught it**, which is the part worth fixing alongside:

- `FIXTURE_SETTINGS_OVERRIDE` applies **only when `fixtureFile` is passed**
  (`loadPage.js`), so fixture specs force the column off and disk-load specs run
  with it ON — the exposure exists in the suite already.
- `tests/live/artist-releases-filter-sort.spec.js` DOES load a disk fixture with
  the column on and counts 56 populated rel cells — but it uses
  `artist-releases-bodeans.json.gz`, the one committed snapshot whose cells
  carry `mbid`/`relDone` (56 of 56), so its guard is true and it is blind to
  this by fixture choice alone.
- `tests/live/disk-fixture-load.spec.js` loads `releasegroup-releases.json.gz`
  (v1.0, **`mbid=0`**) on a pageType that declares the column, with the column
  on — it should be hitting this today, and passes because it asserts only row
  counts and page errors, never header-vs-cell alignment.
- Counted with `scripts/check-fixture-rel-cell-fields.js`: of five committed
  disk fixtures, only `bodeans` carries rel fields; `artist-events`,
  `artist-releasegroups`, `artist-releases-dylan` and `releasegroup-releases`
  are all `mbid=0`.

**Fixed on `main` the same day, as 9.99.1093**, in a worktree off `main` so this
branch's in-progress work was never disturbed.

**The fix.** A second predicate, `_relPageHasOrNeedsColumn()` — the DOM answer
OR `activeInjectedColumns.length`, which the hydrate path rebuilds before the
render tail runs — used at exactly the three sites that CREATE the column:
`_initRelationshipsColumnImpl()`'s entry, `_relInitColHeaderToggles()`, and the
Load-from-Disk call site. This restores the pre-9.99.1086 entry condition for
those three while leaving 9.99.1086's stricter DOM answer everywhere it was
right: `_relCreateRetryButtons()` (runs 200 ms later, by which time the cells
exist), `_relPublishCollapsedStatus()`, and the global retry button.

**The live render path's own call site was deliberately NOT widened.** There the
row-build pass appends the cells before the gate is reached, so the broader test
buys nothing — and it could let `_ensureRelCell()` add a `<td>` to a table whose
`<th>` `_suppressRelationshipsIfNoReleaseOrReleaseGroupLinks()` had removed,
which is the same misalignment in reverse.

**`_relInitColHeaderToggles()` had to move too**, and that is the half a fix
confined to the impl would have missed: it runs BEFORE
`initRelationshipsColumn()` on the disk tail, so with only the impl fixed the
cells appear with no toggle. Safe to widen — `_relInitColHeaderToggle()` returns
at once for a table with no Relationships `<th>`, and
`_relInitGlobalColHdrToggle()` is multi-table-only and bails when no header
button exists.

**Regression spec**: `tests/fixtures/rel-column-disk-load-cells.spec.js`, on the
`releasegroup-releases` shell plus its v1.0 snapshot — chosen because that file
has `mbid=0` on all 147 saved cells. Before the fix it failed with `Expected 23,
Received 22` on alignment, 0 rel cells, and no toggle; after, 3 passed. It needs
a taller viewport than the project default: the Load-from-Disk dialog is
`position: fixed` with `max-height: calc(100vh - 40px)` and no `top`, so at 720px
its confirm button can land below the fold — the pre-existing fragility
`rel-column-collapse-toggle.spec.js` documents, which the sibling rel specs avoid
by not using the dialog at all. This spec cannot avoid it: the disk path is its
subject.

**Mutations** (`scripts/mutations/rel-column-disk-load-cells.json`): 4 of 4 as
expected, each failing at its own assertion — the predicate reverted (alignment),
the impl gate reverted (rel cells), the call site reverted (rel cells), the
toggle gate reverted (toggle). Userscript restored and hash-verified.

**A hole in `scripts/mutation-check.py`, found by this run.** The toggle entry
first reported `expected fail, got fail — OK` with `Error: No tests found.` — its
`grep` still named a test title I had renamed. Playwright matching NOTHING is
scored as a failure, so a stale or mistyped `grep` silently becomes a green
mutation that proves nothing. Every `expect: "fail"` entry in the existing lists
is only as trustworthy as its `grep`. Not fixed here (the tool lives on the
batched-Relationships branch); worth making "no tests selected" an error there.

**HELP needed no change, and that is a finding rather than an omission.**
`ShowAllEntityData_HELP.txt` already stated that a disk round-trip is network-free
only "when every Relationships cell was already fully populated at save time —
only a row saved mid-fetch triggers a fresh fetch for that row on load", and that
saving a collapsed column saves it empty. That describes the restored behaviour
exactly; 9.99.1086 had made the code contradict the documentation.

## 2026-09-16 — Three test-harness defects, all found while shipping 9.99.1093

No userscript change and therefore no version bump or changelog entry —
`CLAUDE.md` excludes `tests/`/`scripts/` tooling from both. Recorded here
instead, because each one silently weakened evidence the project relies on.

**1. `scripts/mutation-check.py` scored "no tests found" as a pass.**
`run_spec()` returned `proc.returncode == 0` as "passed", and Playwright exits
NON-ZERO when `-g` matches nothing — indistinguishable from a real assertion
failure. So an `expect: "fail"` entry whose `grep` was stale or mistyped
reported `expected fail, got fail — OK` while proving nothing at all. Found the
honest way: an entry in the disk-load list still named a test title I had
renamed mid-session, and reported OK with `Error: No tests found.`

`run_spec()` now returns a third value, `selected`, and a `grep` that matches no
test is reported as **ERROR**, alongside the existing "find text must occur
exactly once" ERROR. Proved before and after with a throwaway list whose grep
names a title that exists nowhere: before, `expected fail, got fail — OK`, exit
0; after, `ERROR — grep selected NO tests: …`, exit 1. The real 4-entry
disk-load list still runs 4 of 4 at its own assertions, so the changed return
did not disturb the normal path. **Every `expect: "fail"` entry written before
today is only as trustworthy as its `grep` string** — worth a pass over the
existing lists.

**2. `tests/support/diskFixture.js` clicked a button Playwright could not
reach.** The Load-from-Disk dialog is `position: fixed` with `max-height:
calc(100vh - 40px)` and no `top`, so at the project's 1280x720 viewport
`#sa-render-no-filter-confirm` can sit below the fold (measured at y≈1051).
Playwright refuses to click an element outside the viewport and cannot scroll a
fixed-position dialog into view, so it retried to the timeout. This is the
fragility `rel-column-collapse-toggle.spec.js` documents and the reason both
sibling rel specs avoid the dialog entirely; it flaked
`picard-cells-survive-rerender.spec.js` roughly one run in three.

The helper now dispatches the click through the DOM
(`locator.evaluate((el) => el.click())`). Only the button's POSITION was ever
the problem — it is present, visible and enabled — so this drops an
actionability check that was testing the dialog's CSS geometry rather than
anything a disk-load spec is about. Evidence: `picard-cells-survive-rerender`
now **12 of 12** with `--repeat-each=3` (58.6 s), where one run in three used to
fail.

**`rel-column-disk-load-cells.spec.js` lost its viewport override in the same
change, and that is the point.** It had shipped hours earlier with
`test.use({ viewport: 1280x1600 })` to dodge the dialog, since unlike its
siblings it cannot avoid the dialog — the Load-from-Disk path is its subject.
Keeping that override now would be worse than pointless: at 1600px the
below-the-fold condition never arises, so the spec would pass without ever
exercising the helper it depends on, and a revert of the DOM click would go
unnoticed. At the default viewport it is the spec that would notice. Re-run at
1280x720 after the change: 3 of 3 (11.2 s).

**3. `rel-column-fetch-failure.spec.js`'s 503 test had no budget for its own
waiting.** It timed out once inside a full-suite run (286 passed, 1 failed,
10.6 min, straight after a memory-pressure kill) at a `page.waitForTimeout(3000)`
— which cannot itself exceed a 30 s budget, so the test had already spent ~27 s.
It had: Phase 2 walks 12 entities at the feature's hard-coded ~1100 ms rate gate
(~13 s), the failing MBID adds three 503 retries with widening backoff, then the
no-retry-storm section sleeps 1.5 s + 3 s + 3 s. That is ~28 s against
Playwright's 30 s default, i.e. a test whose pass depended on a few percent of
machine load.

Bisect-before-attributing applied rather than assumed, since this ran on the
tree that had just merged the 9.99.1093 hotfix: standalone `--repeat-each=3`
gave 3 of 3 at ~28 s each, and the hotfix cannot reach this spec anyway — it
drives the LIVE render path, whose call site was deliberately left on
`_relPageHasColumn()`, and its rel cells exist at render, so the widened gates
evaluate identically. `test.setTimeout(90000)` with the arithmetic written out,
so the next reader sees a stated budget rather than a mystery. After the change:
2 of 2 (39.1 s).

## 2026-09-16 — The fixture suite's 30 s default was too small, and it failed as flakiness

**Three consecutive full-suite runs, three DIFFERENT tests, every one green in
isolation.** Found while trying to get a clean run before merging the
batched-Relationships branch:

| Run    | Result  | Wall   | Failing test                                             | Re-run alone          |
|--------|---------|--------|----------------------------------------------------------|-----------------------|
| first  | 286 / 1 | 10.6 m | `rel-column-fetch-failure.spec.js:109`                   | 3 of 3                |
| second | 285 / 2 | 11.2 m | `rel-column-collapse-toggle.spec.js:371`, `picard-…:268` | 42 of 42 (both files) |
| third  | 286 / 1 | 10.0 m | `rel-cell-state-glyphs.spec.js:460`                      | 33 of 33              |

**Why this family and not others.** These specs intercept every request, so they
are network-free — but the userscript's own Relationships rate gate sleeps
~1100 ms between WS/2 calls, so a 12-entity table legitimately takes ~13 s to
settle, and the specs that pin MID-FETCH behaviour then wait inside that window
deliberately. Against Playwright's 30 s default that leaves almost no headroom,
so a few percent of machine load decides the outcome. The suite is
single-worker, which is why full-suite runs lose and isolated ones win.

**Four fixes, and they are NOT interchangeable — I conflated two of them at
first and had to correct myself.** What expires matters:

- *The test budget* — `chromium-fixtures` had no `timeout` at all and inherited
  30 s, while `chromium-live` has set 120 s with a comment for ages. Now 90 s,
  with the reasoning in the config. This is the systemic half.
- *A test whose real floor exceeds even that* — `rel-column-collapse-toggle.spec.js`'s
  MID-FETCH test states `test.setTimeout(180000)`. Its own deliberate waiting is
  ~32 s (a ≤15 s poll, 300 ms + 4000 ms, then six cycles of 1400 ms + 700 ms)
  before a final `expect.poll` that asks for 90 s. **A 90 s poll inside a 30 s
  test can never be honoured**, so that test had always been passing only while
  its early phases ran fast.
- *An inner poll* — `rel-cell-state-glyphs.spec.js:491` went 15 s → 45 s. A
  project timeout cannot help here: what expired was the poll, not the test.
  Clearing the filter rebuilds the tbody WHILE the Phase-2 queue is in flight,
  so the rebuild competes with the fetch pass for the main thread.
- *A helper's own default* — `picard-cells-survive-rerender.spec.js:313` passes
  `{ timeout: 90000 }` to `waitForActualRowCount()`, whose 30 s default is
  shared by ~19 specs and justified in its JSDoc by measured evidence. Widening
  it globally to suit one page would weaken every other caller's completion
  signal, so the override is at the call site.

**The generalisation worth keeping**: when a spec waits on a rate gate the
PRODUCT owns, the test's budget has to be derived from that gate, not from a
framework default. And when one of these fails, read WHICH clock ran out —
test, poll, or helper — because the fix differs in all three cases and the
symptom is identical.

**What this cost, and the lesson about masking exit codes.** The first of these
runs was reported to me as "exit code 0" because the command was
`npm test > log ; tail -6 log` — the status came from `tail`, not from the
suite. A red suite looked green. Every later run chained with `&&` instead.

**Correction, from a fourth run: not everything here was a budget.** With the
three fixes above in, the next full suite came back 286/1 again — this time
`release-tracks-ms-length-overflow.spec.js:174`, and NOT as a timeout. It failed
on equality, reading `"4:50"` where it expected `"4:50.160"`: seconds instead of
milliseconds. Isolation, same standard as the others: 9 of 9 in 44.6 s.

The cause is specific and is a defect in that one test rather than a tight
budget. Its two siblings in the same file both do
`click()` → `await expect(firstToggle).toHaveAttribute('aria-pressed', 'true')`
→ read. The failing one clicked and read immediately, with no settle at all, so
under load it sampled the Length column while the backfill's response was still
being stamped. **No project timeout and no `test.setTimeout` could ever have
fixed it** — a single unretried read has no clock to extend. Fixed by giving it
the settle its siblings have and polling the value; its `expect(calls).toHaveLength(1)`
was polled too, being the same race against a live array that merely happened to
win.

So the tally is three budget problems and one missing wait, presenting with the
identical symptom — "passes alone, fails in the suite". Worth carrying: after
establishing that a failure is load-sensitive, still read WHICH clock ran out
(test, poll, helper — or none at all, for a bare read), because the fix differs
in every case and the first three answers made the fourth look like more of the
same.

## 2026-09-16 — A collapse poisoned the row-text cache, and the 📊 Relationships filter stopped highlighting

**Found by a human in a real browser, minutes after 287 fixture tests were
green.** Reported against a `release-group` page: pick an entry from the
Relationships 📊 dropdown → it filters, matching icons get the red outline.
Clear it, type in another column's filter, collapse the Relationships column
with ▼🔗, expand it again with ▶🔗, then pick the same entry — and nothing
happens, for that pick and every one after it.

**Root cause: two sentinels that disagree.**

```
_cachedColText()       if (c.cols[idx] === undefined) c.cols[idx] = getCleanColumnText(...)
_relDropRowTextCache()     _c.cols[colIdx] = null;      // ← not the same value
```

`null !== undefined`, so the drop did not invalidate the entry, it **poisoned**
it. The next `matchOnly` pass read `null` back as though it were cached text and
`testRowMatch()` threw on `cellText.toLowerCase()` (line 43456), which aborted
`runFilter()`'s row `.filter()` part-way — so everything after the throw was
skipped, including `_highlightRelCellIcons()`. Stack, from the reproduction:

```
testRowMatch      … :43456    const probe = f.isCaseSensitive ? cellText : cellText.toLowerCase();
runFilter         … :44498    the .filter() over rows
applyUniqValueSet … :58646    the direct runFilter() after a pick
_wireStructureCheckbox click … :56979
```

Branch-local: `_relDropRowTextCache()` is this branch's own code, added so a
collapse would not leave stale text behind. The comment two lines above it even
notes that `_rowTextCache` "is never invalidated anywhere (PERFORMANCE.org
Step 9)" — this was the first code to try, and it picked the wrong sentinel.

**Fix**: `delete _c.cols[colIdx]`, so the write matches the accessor's own
"not cached" test. Fixed at the WRITE site rather than making the reader tolerate
`null`: `null` has no meaning anywhere in this cache, and teaching ~5 readers to
handle it would spread the confusion instead of removing it. Surveyed the only
other writer (73479) first — it already does `cached.cols[colIdx] = undefined;
cached.full = null;`, i.e. each field's own correct sentinel — so
`_relDropRowTextCache()` was the lone outlier and the fix is sufficient, not just
necessary.

**The symptom was severity-dependent, which is why the report and the fixture
disagreed in detail.** The throw kills the row loop wherever it happens to be:
on the fixture the rows had already been filtered, so the reproduction showed
`visible=2 expected=2 outlined=0` — correct narrowing, no highlight. On the
reported page it evidently threw earlier, so the narrowing was lost too and the
filter looked entirely dead. One defect, two appearances.

**Reproduction** (`tests/fixtures/rel-uniq-filter-after-collapse-cycle.spec.js`),
and note what it took: the MINIMAL cycle — load, collapse, expand, pick — passes.
The bug needs **another column's filter active across the cycle**, because that
is what puts `runFilter()` on the `matchOnly` path that reads the cache at all.
The spec therefore drives the reported sequence in full: pick, clear, filter
another column, collapse, expand, pick again. Mutation
(`scripts/mutations/rel-uniq-filter-after-collapse-cycle.json`) reverts the
sentinel and the spec fails at the outline assertion.

**Three harness facts this cost, all now written into the spec:**

- `locator.fill()` cannot type into a column filter: the inputs are
  readonly-until-a-genuine-trusted-interaction (anti-autofill hardening), so it
  times out with "element is not editable". Click first, then `pressSequentially`.
- `fill('')` cannot CLEAR one either — `_isGenuineFilterInputEvent()` rejects it
  and the filter silently never re-runs. Only the ✕ (`columnFilterClear()`) works.
- A needle for a text filter must be chosen **by frequency across rows**, not
  taken from row 0. The first attempt used row 0's first word, which occurred in
  no other row, so the filter matched nothing and the rest of the test measured a
  blank table. The guard that caught it (`> 0` hits) is now `> 0 && < rowCount`,
  since a needle matching EVERY row would make the step a silent no-op.

Also added: the spec captures `pageerror.stack`, not just the message.
`collectPageErrors()` keeps only `err.message`, and "Cannot read properties of
null" with no stack is indistinguishable among ~40 `.toLowerCase()` call sites on
the filter path. The stack turned an afternoon of hypotheses into one line.

**The process lesson, now a rule in CLAUDE.md.** This branch had been merged to
`main` locally on the strength of a green suite; the merge was unwound
(`git reset --hard`) because this bug exists. Nothing had been pushed, which is
the only reason it cost nothing. A green fixture suite is evidence that the
assertions someone already thought of still hold — not that the feature works.

## 2026-09-16 — The 📊 Relationships filter replayed an old row list after a second row loaded

**Second bug from the same live-testing session, and a different cache.** On a
COLLAPSED column: hand-load one row whose relationship is
springsteenlyrics.com/bootlegs.php, pick that entry from the 📊 dropdown — it
filters to that row correctly. Clear it, hand-load a SECOND row carrying the
same URL, pick the entry again: **only the first row comes back.**

**Root cause: `_buildFilterKey()` hashes filter INPUTS, and a hand-load changes
cell CONTENT.** The key covers the global query, the case/regexp/exclude flags,
`_lenMismatchFilterKind`, pending-edits, and each column filter's `idx` +
`valueSet` + `structureModes`. Nothing in it describes what is in the cells. So
the second pick builds a key IDENTICAL to the first pick's, `_filterResultCache`
hits, and `runFilter()` renders the remembered row array instead of re-testing
the rows. Exactly the defect class the length-mismatch summary filter had when
it was missing from the key ("pressing the button again did nothing at all") —
except cell content cannot be hashed cheaply, so the cache must be dropped
rather than keyed.

**The captures are what made this unambiguous.** In `rg-r-filtered-3658.html`
BOTH rows carry their own `.mb-rel-filter-key` (`…?item=3658` and `…?item=1742`),
so the data was complete when the second pick happened. In
`rg-r-filtered-3658-uvd.html` the second row is **absent from the DOM**, not
present-and-unmatched — and a row that was removed was never tested. That single
observation separates "the filter replayed" from "the filter matched wrongly".

**Fix**: `_relScheduleProgressRefresh()` now drops the filter-result cache
alongside the uniq-dropdown cache it already dropped. That function is the right
home because it is coalesced to one call per table per animation frame and BOTH
cell writers reach it through `_relScheduleProgressRefreshForCells()` — so the
hand-click path, the Phase-2 queue and the browse bulk source are all covered by
one line, and a hundred-row browse page pays one clear rather than a hundred.

Wholesale, not `_invalidateFilterCacheForGroups()`: that variant matches keys by
GROUP INDEX (`^m:[^:]*:(\d+)\|`), and a rel write knows its `<table>`, which
cannot be mapped back to a group index reliably — merged discography view folds
other groups' rows into the first-occurrence table, the same reason
`_findMasterRowByIdx()` exists — while a single-table page's one `s|…` key would
not match that pattern at all.

**Two caches, one symptom, and why the spec asserts both.** The dropdown's entry
COUNT comes from the uniq-dropdown cache, which the rel writers already dropped;
the rendered ROWS come from the filter-result cache, which they did not. Before
the fix the entry correctly read "2" while exactly one row rendered. A test
asserting only the rows could not tell that apart from a stale dropdown, so
`tests/fixtures/rel-uniq-filter-after-second-row-load.spec.js` asserts the count
and the row set at every pick. Its mutation
(`scripts/mutations/rel-uniq-filter-after-second-row-load.json`) removes the new
drop and the spec fails on the row count while the count assertion still passes
— confirmed by reading WHICH assertion the mutation tripped, not by assuming.

**Worth carrying**: when a feature mutates cell content outside a filter input —
an async column populating, a per-row load, a bulk fetch — it owes BOTH caches a
drop. The uniq-dropdown one is already documented as needing it ("the cache's
signature is the visible row set, which a write does not change"); the
filter-result cache has exactly the same blind spot and was not.

## 2026-09-17 — Inline-artwork 📊 entries render fewer rows than they count (all 9.99.x with addCAA/addEAA; hotfix, branch fix/art-async-filter-staleness)

Found by the async-cell-population audit (`AUDIT.md` §3.1 on
`rel-column-batch-and-cell-states`), reproduced in a fixture spec BEFORE any code
change, on `main` 9.99.1093. Live twins of every test: `AUDIT.md` §10 L1–L4.

**Symptom.** The 📊 "Structure - Inline artwork" entries ("🖼️ front-image
available" / "∅ NO front-image available") and a typed `caa-inline-yes` column
filter advertised a correct count but rendered fewer rows — on a multi-table page
**none at all**. Separately, re-picking a "CAA info - Type" entry after more image
metadata had loaded replayed the first pick's rows.

**Two independent root causes with one symptom.**

1. *The state never reached the rows the filter tests.* `runFilter()` matches
   SOURCE rows (`allRows` / `groupedRows[i].rows`); 📊 counts LIVE rows.
   `_artSetInlineSortKey()` stamps `.mb-inline-art-sort-key` on the live `<td>`.
   `renderGroupedTable()` always inserts clones, and
   `_artMirrorInlineThumbToSourceRow()` copies the placeholder `<span>` but not the
   sort-key span (a `<td>` child outside it) — so on multi-table pages no source
   row ever carried it. On single-table pages the first render MOVES rows, so early
   settles did reach `allRows`; any settle after the first re-render landed on a
   clone only (the original loadTask bails on `!ph.isConnected`).
2. *Replay.* `_buildFilterKey()` hashes filter inputs; a late settle changes what a
   source row matches with every input unchanged, and nothing in the artwork path
   dropped `_filterResultCache`. `_artSyncSearchTextToSourceRow()` DID sync the CAA
   column's facts and drop `_rowTextCache` correctly — the result cache was the
   only gap there.

A stale comment in `_stripTransientCellState()` asserted the clone's span was what
`testRowMatch()` matched — true once, before matching moved to source rows — which
is how (1) stayed invisible.

**Fixture results on `main`** (`tests/fixtures/art-inline-uniq-filter-late-load.spec.js`,
each test alone, `vzell-lap`, 2026-09-17):

| Test                                                      | main                | What it establishes                                                                                |
|-----------------------------------------------------------|---------------------|----------------------------------------------------------------------------------------------------|
| single-table baseline                                     | pass 10/10, 2/2     | the spec drives 📊 correctly                                                                       |
| multi-table control ("» country code: AU")                | pass 3/3            | same, multi-table                                                                                  |
| H1 multi, nothing late                                    | **count 5, rows 0** | (1), not a timing bug                                                                              |
| H1 typed `caa-inline-yes`                                 | **5 vs 0**          | same defect via the typed bypass                                                                   |
| H2 single, late thumbnail after a sort                    | **10 vs 9**         | (1) alone — the sort cached no key                                                                 |
| H2b single, late 404 after a sort                         | pass 2/2            | predicted asymmetry: the error path has no `isConnected` guard and stamps the detached SOURCE cell |
| H3 single, pick/unpick/late/pick                          | **10 vs 9**         | symptom of (1) AND (2) — see mutation 4                                                            |
| H4 multi CAA "» image type: Front", pick/unpick/late/pick | **6 vs 5**          | (2)                                                                                                |
| H4 isolation: same late metadata, sort instead            | pass 6/6            | the sync works; H4 is purely (2)                                                                   |

Lateness was controlled without network: `GM_xmlhttpRequest` wrapped after load
(per-mbid 200/404, held until released), and the CAA metadata route gated in Node.

**Fix.**
- `_inlineArtSettled` (`Map`, `"rowIdx:colIdx"` → `{value, guid}`, reset with
  `expandedCells`), written by `_artSetInlineSortKey()` for connected cells, read
  through `_inlineArtSentinelFor()` by the structure modes, the typed bypass, AND
  `openUniqDrop()`'s count pass. Map first, span as fallback (a single-table late
  404 stamps the source cell itself). The GUID rejects an entry left by an earlier
  fetch that reused the `rowIdx`.
- `_invalidateFilterCacheWhere(affectsKey)`: drops only keys whose JSON can read
  the changed content — `_filterKeyReadsInlineArtSentinel()` /
  `_filterKeyReadsArtColumn(colIdx)` — and resets incremental narrowing only when
  its partial key is affected. Called only on an actual change.

**Why not mirror the span onto the master row**, which is what the other artwork
mirrors do: `_findMasterRowByIdx()` measured **0.69 ms per lookup at 4174 rows,
1.89 ms at 10 000** (`scripts/bench-master-row-lookup.js`, `vzell-lap`
2026-09-16T23:24Z) — seconds per page load when paid per settle. The fix instead
adds one GUID read per settled cell per render: **6.6 ms per render at 4174 rows**
(`scripts/bench-art-guid-read.js`, 2026-09-17T00:59Z), ~0.2% of a ~3 s filter pass
there. Same measurement exposes a pre-existing cost: `_artMirrorInlineThumbToSourceRow()`
runs that scan per row on EVERY multi-table re-render (Case C1) — noted in AUDIT.md,
not changed here.

**Mutation check** (`scripts/mutations/art-inline-late-load.json`), 11/11 as
expected, each failing on its own labelled assertion: matcher → span (H1 0 rows);
typed bypass → span (H1 typed); map never written (H2 9 rows); settle never drops
the cache (**H3 still 9 rows with (1) fixed — the replay is real and stacked**);
predicate misses `"inline-art-` (H3); CAA sync never drops (H4); CAA predicate on
the wrong column (H4). Recorded as `expect: pass`, KNOWN UNCOVERED: the value/GUID
change test on an existing entry (needs a retry- or re-fetch-driven fixture), the
GUID validation, the `isConnected` gate, and the count pass routed through the
resolver (a construction guarantee; live spans are re-stamped every render).

**Not covered:** a single-table page with a CAA **column** (not inline thumbnail)
whose metadata settles after a re-render — `_artSyncSearchTextToSourceRow()` still
returns early for `tableMode !== 'multi'` (AUDIT.md §3.1 H4b). No committed
single-table shell carries `/cover-art` anchors.

## 2026-09-17 — ⏱ toggle left an active Length filter stale (hotfix, branch fix/ms-length-filter-staleness)

Found by the async-cell-population audit (`AUDIT.md` §3.2 on
`rel-column-batch-and-cell-states`), reproduced in a fixture spec on `main`
9.99.1093 before any code change. Live twin: `AUDIT.md` §10 L5.

**Symptom.** On "Born to Run" (release-tracks, `tableMode: 'multi'`, 8 tracks):
filter the Length column for `.` (0 rows — seconds have no dot), press ▶⏱ —
still 0 rows, although every length now reads e.g. `3:11.666`. Reverse: in
milliseconds filter `.666` (1 row), press ▼⏱ — still 1 row, now reading `3:12`.

**Two stacked causes.** `_msApplyLengthPrecision()` rewrites the SOURCE rows'
Length text and calls `runFilter()`, dropping only the uniq-dropdown cache.
1. `_filterResultCache` is keyed on filter inputs; the toggle changes none, so
   the pre-toggle row list was replayed.
2. Each source row's `_rowTextCache` entry still held the pre-toggle column and
   full text, and `testRowMatch()` reads it even on a result-cache miss.

**Fixture results** (`tests/fixtures/ms-length-filter-after-toggle.spec.js`,
`vzell-lap`, 2026-09-17):

| Test                                                                             | main                                                                                                                                | hotfix |
|----------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------|--------|
| control: toggle, then filter `.`                                                 | pass 8/8                                                                                                                            | pass   |
| A: filter `.`, then toggle                                                       | **8 expected, 0**                                                                                                                   | pass   |
| A isolation: same, then flip the page-wide Case checkbox (new key, same matches) | **0** — cause 2 on its own                                                                                                          | pass   |
| B: ms, filter `.666`, toggle back                                                | **0 expected, 1**                                                                                                                   | pass   |
| C: global filter `11.666`, then toggle (added with the fix)                      | **fails — nothing rendered** (observed; both causes are present on main — mutation 4 shows the stale full text alone also fails it) | pass   |

**Fix.** Per rewritten cell `cols[cellIndex] = undefined`, per changed row
`full = null` (the two different sentinels — AUDIT.md §4), and a wholesale
`_invalidateFilterCache()` before `runFilter()`. Wholesale is fine here: it runs
once per button press, not per keystroke or per async settle.

**Mutation check** (`scripts/mutations/ms-length-filter-after-toggle.json`),
5/5 as expected: no result-cache drop → A fails while A-isolation still passes
(the separation holds); no column-text drop → A-isolation fails; no full-text
drop → C fails; `null` instead of `undefined` in `cols[]` → fails, but EARLIER
than predicted — the `TypeError` escapes before the toggle repaints, so
`toggleMs()`'s `aria-pressed` wait is what trips. Recorded as observed.

**Not changed, noted for the audit:** `_adoptJesus2099MsLength()` also rewrites
Length text (adopting a jesus2099-leaked value), possibly after a filter has run;
not reproduced or examined here.

## 2026-09-17 — A second load-sensitive mechanism in picard-cells-survive-rerender: the global filter's focus-prefix race

`picard-cells-survive-rerender.spec.js` › "expanding one sub-table leaves the other
collapsed, across a filter and a sort" failed in two full-suite runs on
`vzell-lap` the same day — once on a `main`-based hotfix tree (01:29–01:34Z,
30 s helper budget) and once on this branch after merging `main` 9.99.1095
(11:32–11:37Z, **90 s**, i.e. WITH `68f6aff`'s widened budget). It passed 2/2
and 3/3 standalone respectively, and passed inside the merged-`main` suite run
in between.

**Not the `68f6aff` budget mechanism, and a budget cannot fix it.** The
`error-context.md` snapshot shows the global filter input holding `🔍 e🔍` and
the status line `GLOBAL:"e🔍 "` with `0 of 6` rows: the character typed by
`pressSequentially('e')` interleaved with the input's decorative focus prefix, so
the ACTIVE query was `e🔍 `, which matches nothing. `waitForActualRowCount()`
then waits for a row count that can never arrive, whatever its timeout.

Read the clock: the helper's own `waitForFunction` expired — but the page had
settled long before, on the wrong query. Candidate fixes, not applied: wait for
the focus decoration to settle before typing (e.g. poll the input value for the
prefix), or assert the status line's `GLOBAL:"e"` before waiting on rows, which
would turn a 90 s timeout into an immediate, self-explaining failure. Whether a
real user can hit the same interleave (typing within the first frame after
focusing) is unexamined.

## 2026-09-17 — A plain global filter could not see CAA image types on multi-table pages (hotfix, branch fix/global-filter-art-search)

`AUDIT.md` §3.1 H5, found while fixing H1–H4 and confirmed in a live browser via
§10 L4b before any code change. Reproduced on `main` 9.99.1095.

**Symptom.** On a release group's releases, typing `Booklet`/`Back` into the
GLOBAL filter matched no rows, while the same word matched with Rx ticked, and
matched when typed into the CAA column's own filter box.

**Root cause.** Image types and comments are stored out of band by
`_artBuildMultiRowArtCell()` and reach a filter through two different places
depending on which row is read: `ul.mb-caa-art-ul`'s `dataset.mbArtSearch` on the
RENDERED cell, and the `<td>`'s `dataset.mbArtSearchSync` on the SOURCE row
(written by `_artSyncSearchTextToSourceRow()`). `runFilter()` matches source
rows. `getCleanColumnText()` already read both — so the column filter and the
regexp global path worked — but `testRowMatch()`'s plain-global art fallback read
only the `<ul>`, which a multi-table source row never has. Single-table pages
were unaffected: there `allRows`' rows ARE the rendered rows on the first render,
so the `<ul>` is present.

**Fix.** `_artSearchTextFor(element)` — one resolver, used by both
`getCleanColumnText()` and the plain-global fallback.

**Fixture results** (`tests/fixtures/global-filter-art-search.spec.js`,
`vzell-lap`, 2026-09-17): on `main`, the plain global query rendered **0 rows**
where the regexp control and the CAA column-filter control each rendered 1; a
query for an image type no row carries rendered 0 both before and after, so the
fix does not simply widen matching. All 4 pass on the hotfix.

**Mutation check** (`scripts/mutations/global-filter-art-search.json`), 3/3 as
expected: the fallback reading the `<ul>` again fails the H5 test while both
controls stay green; dropping the synced-attribute branch fails the COLUMN filter
control (that channel is what the column filter has always used). Recorded as
`expect: pass`, KNOWN UNCOVERED: dropping the `<ul>` branch, which only a
single-table page with a CAA column would notice — the same gap as §3.1 H4b, and
no committed single-table shell carries `/cover-art` anchors.

## 2026-09-17 — The global filter's focus-prefix race, and the harness fix for it

Not a userscript bug report — a test-harness one, recorded because it cost three
full-suite runs in a day and presented each time as a timeout far from its cause.

**Symptom.** `picard-cells-survive-rerender.spec.js` failed under full-suite load
on three different trees (30 s budget, then 90 s with `68f6aff`'s widened
budget), always passing in isolation. The saved `error-context.md` shows the
global filter input holding `🔍 e🔍` and the status line `GLOBAL:"e🔍 "` with
`0 of 6` rows.

**Mechanism.** The input's focus handler writes `prefix + value` back. A
character typed between that read and that write lands INSIDE the result, and
`stripFilterPrefix()` removes only a LEADING prefix, so the active query became
`e🔍 ` — which matches nothing, so `waitForActualRowCount()` then waited out its
whole budget for a count that could never arrive. No budget can fix that.

**Fix (tests only).** `typeGlobalFilter()` in
`tests/support/filterSortAssertions.js`: click, wait for the prefix to land, then
type. Both `pressSequentially` callers on the global filter now use it
(`picard-cells-survive-rerender.spec.js` ×2, `search-recordings-continuation.spec.js`).
`fill()` callers are left alone — it replaces the whole value in one step.

**Whether a real user can hit the same interleave** — typing within the frame
after focusing — is unexamined, and would be a userscript fix, not a harness one.

**A third, environmental one, for completeness** (2026-09-18, `vzell-lap`): a
full-suite shard failed with `page.addScriptTag: Failed to load script at
https://cdn.jsdelivr.net/npm/@jaames/iro@5`. `loadPage.js` pulls iro and pako
from their CDNs on every fixture load, so a network blip fails whichever test
happens to be loading at that moment — here `tag-value-entity-column-leak`,
which passed 8/8 standalone straight afterwards. Nothing to fix in the spec; the
standing option, if it recurs, is vendoring those two files, which `loadPage.js`'s
own comment already weighs and declines.

**Second, unfixed harness weakness found in the same suite run** (2026-09-17,
`vzell-lap`): `rel-column-collapse-toggle.spec.js` › "multi-table: the threshold
is decided per sub-table, and collapsing survives a filter" failed once under
full-suite load and passed 2/2 standalone. It clears the filter, sleeps a fixed
`waitForTimeout(1500)`, then asserts the shape of BOTH sub-tables; under load it
read mid-re-render and saw one table instead of two. A fixed sleep where a poll
belongs — CLAUDE.md's own "settle, don't sleep". Not changed here, to keep this
hotfix to its subject: the fix is to poll `readRelShape()` until it matches,
rather than to widen the sleep.

*Fixed 2026-09-17, later the same day*, after it cost a second suite run (on
the §3.3 hotfix tree): both fixed sleeps in that test are now `expect.poll()`s
on `readRelShape()`. Green 10/10 for the file.

## 2026-09-17 — Release events were LOST when a filter ran during the fetch, and its filters went stale (hotfix, branch fix/release-events-filter-staleness)

`AUDIT.md` §3.3 (which absorbed §3.7). Reproduced on `main` 9.99.1096 before any
code change, with the page the user verified for §10 L6: label `011d1192-…`'s
relationships page, "Distributed release" sub-table, 31 releases.

**Three defects, one symptom ("the column is empty").**

1. **The data was thrown away.** `initReleaseEventsColumn()` collected the cells
   to fill from the LIVE DOM, then awaited one WS/2 call. `runFilter()` REMOVES
   non-matching rows, so a filter typed meanwhile took those rows out of the
   list; a sort or view switch re-renders from clones, which detaches them just
   the same. The answer was written into cells no longer in the document, the
   sync-to-source step only walks `document`, and the function runs once per
   fetch — so clearing the filter brought the rows back EMPTY, for good.
2. **`_filterResultCache` replay.** The needle typed before the answer cached an
   empty row list under a key the answer does not change.
3. **`_rowTextCache` staleness.** The rewritten source rows still had the text
   read when the column was empty, so even a FRESH key matched nothing.

**Fixture results** (`tests/fixtures/release-events-filter-after-populate.spec.js`,
`vzell-lap`, 2026-09-17): control (filter after the answer) passes on `main`;
A (31 expected, **0** populated), B (3 expected, **0**) and C (fresh key, 3
expected, **0**) all fail there and pass on the hotfix.

**Fix.** Collect the cells from the source rows as well as the live DOM; reset
those rows' `cols`/`full` cache entries (the two different sentinels, §4); drop
`_filterResultCache`; and re-run an active filter once, so the user is not left
looking at a table filtered against data that had not arrived — the same thing
`_msApplyLengthPrecision()` does after rewriting its column. That last point is
its own test (D) rather than an assumption.

**Mutation check** (`scripts/mutations/release-events-filter-after-populate.json`),
5/5 as expected, each on its own labelled assertion — including the `null`-into-
`cols[]` sentinel trap from `a861512`, which fails on C.

**Harness note.** The fixture is a real captured page
(`scripts/capture-page-fixture.js`, new). MusicBrainz's own scripts throw on it
— `supported-browser-check.js` hits a null node, and a versioned bundle the
capture references now answers with an HTML error page — so the spec filters
those two by origin instead of asserting zero page errors blindly.

## 2026-09-18 — The Locality→Region flag correction left every filter on its pre-move answer (hotfix, branch fix/area-flag-region-filter-staleness)

`AUDIT.md` §3.4, live twin §10 L7. Reproduced on `main` 9.99.1097 before any
code change.

**Symptom.** With a flag userscript installed, a bare subdivision moves from
Locality to Region up to ~6 s after render. A "Region" filter for that value
kept finding only the rows that had it BEFORE the move — retyped, and even typed
fresh under a different cache key — and a "Locality" filter went on listing the
rows the value had just left.

**Root cause.** `_maybeCorrectAreaFlagRegion()` rewrites two cells on the live
row and on the master row, and dropped only the uniq-dropdown/header-count
caches. `runFilter()` matches the MASTER rows via `_rowTextCache`, which still
held the pre-move text, and `_filterResultCache` still held the row list built
under the same (unchanged) filter inputs. Nothing re-applied an active filter.

**Fixture results** (`tests/fixtures/area-flag-region-filter.spec.js`,
`vzell-lap`, 2026-09-18): control (decorate, then filter) passes on `main`;
B (retyped Region needle: 6 expected, **3**), C (fresh key: 6 expected, **3**)
and D (Locality filter after the value left: 0 expected, **3** still rendered)
all fail there and pass on the hotfix.

**Fix.** Drop the moved rows' `cols`/`full` cache entries (the two different
sentinels, §4), drop `_filterResultCache`, and re-run an active filter —
coalesced per animation frame by `_scheduleAreaFlagFilterRefresh()`, because one
sweep corrects many rows and the observer fires per decorated batch. The
"is anything filtering" test is now a shared `_anyFilterActive()`, used by this
and by `initReleaseEventsColumn()` (§3.3), which had it inline.

**Fixture note.** `tests/fixtures/area-flag-region-filter.html` is served
UNDECORATED — as MusicBrainz serves it — and the spec stamps
`data-flag-processed` at runtime, which is what makes the deferred observer path
fire rather than the extraction-time one. Three row shapes: city+state+country
(already Region, so a stale count is visible as one that never grows),
state+country (the rows that move), and two German rows that must never move.

**Mutation check** (`scripts/mutations/area-flag-region-filter.json`), 6/6 as
expected, each on its own labelled assertion, including the `null`-into-`cols[]`
sentinel trap. Recorded as `expect: pass`, KNOWN UNCOVERED: dropping the
per-frame coalescing guard — a cost, not a wrong answer, and three corrected
rows cannot show it.

## 2026-09-18 — The 📊 collapsed/expanded entries kept their pre-toggle row list (hotfix, branch fix/collapse-state-filter-staleness)

`AUDIT.md` §3.8, live twin §10 L8 — confirmed live by the user on 9.99.1098
before this spec was written. Reproduced there in a fixture too.

**Symptom.** Pick "▶ collapsed multi-row cells (K)" → K rows. Uncheck, expand one
of those cells, pick the entry again: the dropdown says K−1 and the table still
shows K, including the cell just expanded. And expanding a cell while that entry
was filtering left the row on screen.

**Root cause.** Not content and not a cache of text: `expandedCells` (keyed
`"rowIdx:colIdx"`) is what `_cellMatchesStructureMode()`'s `collapsed`/`expanded`
modes read. A toggle changes which rows they match while every filter INPUT stays
the same, so `_buildFilterKey()` produces the same key and `_filterResultCache`
replays. The five sites that write `expandedCells` all dropped the uniq-dropdown
cache — which is exactly why the COUNTS kept up and made the mismatch visible —
and none of them touched the filter side.

**Fixture results** (`tests/fixtures/collapse-state-filter-staleness.spec.js`,
`vzell-lap`, 2026-09-18, Catalog# column of the Greetings release group, 46
collapsed multi-row cells): control passes on `main`; B (45 expected, **46**) and
D (45 expected, **46**) fail; **C, the isolation test, PASSES on main** — a fresh
cache key sees the expanded cell at once, which is what pins this to a replayed
row list rather than to stale state.

**Fix.** One writer, `_applyExpandedCellState()`, replacing the five hand-rolled
copies (`_applyCollapseState()` ×2, `ensureCollapseDelegate()`'s list, prose and
CAA/EAA branches). It drops the uniq-drop cache as before, and on an actual
change schedules `_scheduleCollapseStateFilterRefresh()`: drop only the cached
row lists whose key mentions those modes, then re-run an active filter —
coalesced per animation frame, since the column-header and global mass toggles
walk every cell of a column.

**Mutation check** (`scripts/mutations/collapse-state-filter-staleness.json`),
6/6 as expected, each on its own labelled assertion. Two are recorded as
`expect: pass`, KNOWN UNCOVERED: the no-op gate and the per-frame coalescing
guard are both cost, not correctness, and 46 cells cannot show the difference.

**Fixture note.** `tests/fixtures/releasegroup-releases-multirow-catalog.html` is
the real page the user verified, captured with `scripts/capture-page-fixture.js`
(which redacts credential-shaped strings). Its page-1 shell is served for page 2
as well, so rows appear twice — harmless here, since every expectation is read
from the dropdown rather than hard-coded.

## 2026-09-18 — The ⚠️/❌ live-date summary buttons counted the filtered view (hotfix, branch fix/live-date-flag-button-counts)

`AUDIT.md` §3.6, live twin §10 L10. Found by CODE READING during that section's
check — the flags themselves are sound (all four `_appendLiveDateFlag()` writers
run synchronously inside `applyExtractTrackTitleData()`, before the first render
and never again), so this is a different defect that the check happened to walk
into.

**Symptom.** `_countLiveDateFlags()` tallied `document.querySelectorAll('table.tbl')`'s
LIVE rows, and `_updateLiveDateFlagButtons()` — called after every filter pass —
hides a button whose count is 0. `runFilter()` REMOVES non-matching rows, so any
filter excluding the flagged tracks made the ⚠️ button disappear, and with it the
only affordance for getting back to those rows. A filter hiding SOME of them
understated the count instead.

**Precedent, and why this is not a matter of taste.** The sibling pair
(`_countLengthMismatchRows()` / `_updateLengthMismatchButtons()`) walks
`_msSourceRows()` for exactly this reason: "filtering to ⚠️ made the ❌ button
vanish" is a shipped bug `CLAUDE.md` already records. Only the live-date tally
read the live DOM.

**Fixture** (`tests/fixtures/release-tracks-live-date-flags.html`): the real live
album the user supplied for L10 — 2 mediums, 27 tracks, 2 ⚠️ rows, no ❌.
Captured with the new `--strip-json` flag: MusicBrainz's embedded payload was
978 KB of 1.1 MB and feeds only the millisecond-length features, which this spec
does not exercise; the fixture is 124 KB with it gone.

**Results** (`tests/fixtures/live-date-flag-button-counts.spec.js`, `vzell-lap`,
2026-09-18): both controls pass on `main`; A (filter hides the flagged rows →
button **hidden**) and B (filter hides one of them → label says **(1)**, not (2))
fail there and pass on the hotfix.

**Fix.** Tally the captured source rows (`groupedRows`/`allRows`), resolving
column names from the RENDERED table since a source row has no header of its own
(`groupedRows[i]` ↔ `tables[i]`, the pairing `_artSyncSearchTextToSourceRow()`
also relies on), with a fallback to the live rows for the pre-capture case.

**Mutation check** (`scripts/mutations/live-date-flag-button-counts.json`), 4/4
as expected. Two are `expect: pass`, KNOWN UNCOVERED and deliberately defensive:
the `allRows` arm (live-date flags exist only on `release-tracks`, which is always
multi-table) and the pre-capture fallback.

**One thing this does NOT change:** clicking ⚠️ still filters by typing the glyph
into the global filter, so the ROWS it shows are the flagged ones. Only the
counts and the buttons' availability now describe the data.

## 2026-09-18 — A fourth load-sensitive spec: waiting for a status text that never changes

`artist-recordings-ms-batch.spec.js` › "answers are cached: sorting, filtering
and re-toggling never re-request" failed once in a full-suite run on the feature
branch (shard 1, 118 passed + 1 failed) and passed **7/7 three times** standalone
straight afterwards, on the same tree. Not a regression from the 9.99.1100 merge.

**Read which clock ran out.** `_runAndWaitForSettledText` timed out waiting for
`#mb-filter-status-display` to settle *to a NEW value*, and its message names the
problem precisely: baseline and last-seen were the same string —
`✓ Filtered 9 rows in 22ms [1 COLUMN FILTER ['⏱︎Length':"1:0"]]`. So the wait can
only succeed if the triggered action produces text that DIFFERS. Under load the
re-filter can finish with an identical line (same row count, same query, and the
"in 22ms" figure is not unique enough to force a difference), and then no timeout
is long enough — the same shape as the focus-prefix and fixed-sleep cases above.

**Not changed here**, because the right fix depends on what that test means to
observe: the honest wait is the thing it actually asserts (the WS/2 request
count staying put, or the row set settling), not a text transition. Recorded so
the next reader does not re-diagnose it as flakiness with no mechanism.

## 2026-09-18 — Two merge-time hand steps that were documented, skipped, and are now enforced (branch tooling/fold-ship-date-and-doc-audits)

Found while merging `rel-column-batch-and-cell-states` (9.99.1101-9.99.1108),
not by a failure — both defects are invisible unless someone goes looking.

**1. The changelog ship date.** `CLAUDE.md`'s "At merge time (on `main`)" list
said to set each folded entry's `date` to the day the merge lands, matching
`@version`'s `+YYYY-MM-DD`, and noted that `fold-wip-changelog.py` carries the
WIP file's AUTHORING date through — "so this is a real step and not an automatic
one". The script's own docstring asserted the opposite policy in the same words:
"a WIP entry is dated when it was written, not when it ships". Two documents,
one file, opposite rules.

The hand step lost. Evidence, from the shipped changelog:

| Entry     | Dated      | Fold commit that introduced it | Really shipped |
|-----------|------------|--------------------------------|----------------|
| 9.99.1005 | 2026-09-04 | `c2cf44a`                      | 2026-09-05     |
| 9.99.955  | 2026-08-24 | `066096e`                      | 2026-08-28     |
| 9.99.755  | 2026-08-01 | `a6738b4`                      | 2026-08-05     |

Those three are only the entries where the leak crosses a release boundary and
the file contradicts itself — a newer version dated BEFORE the one below it.
The leak is wider: 9.99.1005-1009 all read 2026-09-04 though the whole batch
landed on the 05th, and 9.99.952-958 read 08-24..26 against a fold on the 28th.

Fixed at the source: the fold sets the ship date itself, reports every re-dating
in the dry run, and `--date` now governs both the entries and the header. The
three published dates are NOT corrected — release notes already show them, and
repairing only the visible three would imply the rest had been cleaned up. They
are allowlisted by name in `audit-changelog.py`, which now also fails on a new
inversion and on a newest entry whose date disagrees with the header stamp.
Mutation-checked: both new checks fail on a planted defect and the known
inversions still pass.

**2. "Re-read PERFORMANCE.org for what your change made FALSE."** Also
documented, also skipped — by me, one merge earlier. 9.99.1100 fixed
`_countLiveDateFlags()` to tally source rows (AUDIT.md §3.6), and Step 25 went
on describing that as an open bug for four commits, through a merge whose own
checklist says to look. Its cost half is genuinely still open, which is what
makes this the easy kind to miss: the step legitimately stays TODO, so nothing
about it looks stale.

`scripts/audit-docs.py` now catches the three mechanical kinds — a DONE-set
sentence disagreeing with the keywords (has drifted twice), a step whose keyword
reads DONE while its body still says "Still TODO on `main`", and an "IN
PROGRESS" section naming a branch that no longer exists. Verified against the
pre-merge docs at `6420cc4`: it flags both real `IN PROGRESS` sections and
nothing else. Its first draft also flagged `~release-tracks~`, a pageType six
lines down an org table — the window is now the heading line plus one, because a
check that cries wolf gets ignored.

**What neither script can do.** Step 25's rot is semantic: the prose was
well-formed, correctly cross-referenced, and simply not true any more. No parser
sees that. The scripts remove the bookkeeping excuses so the re-read is about
meaning; they are not the re-read.

## 2026-09-18 — The live-date flag scan: 87 654 fruitless queries per keystroke (branch perf/live-date-flag-scan-gate)

PERFORMANCE.org Step 25's cost half, the part left open when its correctness
half shipped as 9.99.1100. Not a bug report — nothing misbehaved — so the
numbers are the whole argument.

`_countLiveDateFlags()` runs on every filter pass, from
`updateFilterButtonsVisibility()`. It ran `cell.querySelectorAll('.mb-live-date-flag')`
per CELL, and those spans are built only by `applyExtractTrackTitleData()`, i.e.
only on `release-tracks`. Every other pageType therefore paid a full walk to be
told "none".

Measured on the 4174-row `artist-events` disk fixture (`vzell-lap`, 2026-09-18
08:27 UTC, median of 5, `scripts/measure-live-date-flag-scan.js`):

| Shape                          | Queries | Median  |
|--------------------------------|---------|---------|
| per cell — what shipped before | 87 654  | 64.0 ms |
| per row — the new first pass   | 4 174   | 4.6 ms  |
| gated — every later pass       | 0       | 0 ms    |

Step 25's estimate of "~87 700" was right to three figures. Against that page's
~3033 ms global filter it is ~2% — the reason to fix it is that it is pure waste
on every pageType but one, not that it dominates anything.

**The trap, and it is a sharp one.** The obvious gate —
`document.querySelector('.mb-live-date-flag')` — is wrong in a way that only
shows up under a filter. `runFilter()` REMOVES non-matching rows, so that query
answers "no" the moment a filter excludes the flagged rows, the tally returns 0,
and `_updateLiveDateFlagButtons()` HIDES a button whose count is 0. That is
exactly the §3.6 vanishing-button bug, re-entered through the optimisation. The
gate is keyed on two non-DOM facts instead: `_appendLiveDateFlag()` having built
one, and a tally over the CAPTURED rows coming back empty.

Two further edges, both of which would fail silently:

- **`false` is cached only from the captured-rows branch.** The pre-capture
  fallback's "found nothing" means "no rows yet", not "no flags", and would
  stick for the life of the page.
- **Hydration resets it.** `_hydrateAndRenderFromSnapshotData()` restores rows
  whose stored HTML already contains the flags, with `_appendLiveDateFlag()`
  never running — so a page that had concluded "none" would show no ⚠️/❌
  buttons at all on a restored tracklist. No fixture drives Load-from-Disk into
  a flagged release, so this is recorded as an `expect: "pass"` mutation rather
  than claimed as covered.

The spec has to assert both directions. On a flagless page the scan counter
(`__saTest.liveDateFlagRowScans()`, exposed for the same reason as
`picardEntityScans()` — "walked 4174 rows and found nothing" and "did not walk"
produce identical DOM) must stop moving; on a flagged page the button must still
count the data under a filter that hides every flagged row. Without the second
half, `return result` at the top of the function passes the first half perfectly
— which is what the "the gate closes on a page that HAS flags" mutation exists
to prove.

### Live confirmation before the merge (2026-09-18)

The two edges the fixture suite cannot reach were checked by hand on the real
site before 9.99.1109 was merged, and both behaved:

- **Load-from-Disk into a flagged tracklist.** A release tracklist saved to disk
  and reopened still shows its ⚠️ button — i.e. the
  `_hydrateAndRenderFromSnapshotData()` reset works. This is the sharp edge: a
  hydrated row carries its flags as stored HTML with `_appendLiveDateFlag()`
  never running, so without the reset a restored tracklist would show no buttons
  at all.
- **Filters that hide the flagged rows.** Both a filter excluding BOTH flagged
  tracks and one excluding just one; the button kept `(2)` in each case.

They stay `expect: "pass"` in the mutation list, because that field describes
what the SPECS cover and nothing changed about that. Recorded here so the next
reader knows the gap was closed by a person rather than left open.

## 2026-09-18 — A zero-width space made most 📊 Structure sections lose their collapsed/expanded entries (branch fix/uniq-drop-collapse-gate-glyph-column)

The parking-lot item from the 9.99.1098 session, and it was one cause with two
faces — which is why it read as two unrelated observations:

- "Born to Run"'s Instruments column shows `▶8▤` in its header but has NO
  Structure section in its 📊 dropdown.
- This release's Instruments column shows `▶9▤` AND a Structure section — but
  the section contains only `○ empty cells (3)`.

Both are the same failure. The collapsed/expanded entries were never emitted;
whether a Structure section appeared at all depended only on whether the column
happened to have empty cells, which take a different branch.

**Root cause.** Two readers answer "is this a collapsable column", and they
resolved the column's NAME differently:

| Reader                     | Resolution                                               |
|----------------------------|----------------------------------------------------------|
| `initCollapsableColumns()` | `_cleanColHeaderText(th)` → prefers `th.dataset.colName` |
| `openUniqDrop()`           | `th.textContent.replace(/[⇅▲▼…▶◀▤0-9]/g,'').trim()`      |

`_initColHeaderGlyph()` gives each AR column an entity glyph, and
`_guardGlyphAgainstEmptySelectorHiding()` appends U+200B to that span so it is
never an empty selector target. **U+200B is not JS whitespace** — it is matched
by neither `\s` nor `String.prototype.trim()` — so the second reader compared
`"Instruments​"` against `collapsableColumns` and concluded the column was
not collapsable, while the first had already built its `▶9▤` toggle.

The sting: `initCollapsableColumns()` already carries a comment explaining this
exact trap and why it must use `_cleanColHeaderText()`. The knowledge was
written down at one call site while another re-derived the answer — the
"hand-rolled check at a new call site" failure CLAUDE.md documents for
`_classifyCollapseCell()` and `_findCellListItems()`, a third time, in a third
place.

Measured on the captured fixture (5 collapsable AR columns):

| Column             | Header | 📊 before       | 📊 after                       |
|--------------------|--------|-----------------|--------------------------------|
| Recorded at place  | ▶3▤    | empty cells (1) | collapsed (3) + single + empty |
| Vocals             | ▶10▤   | no section      | collapsed (10)                 |
| Instruments        | ▶9▤    | empty cells (3) | collapsed (9)                  |
| Recording engineer | ▶2▤    | no section      | collapsed (2)                  |
| Engineer           | ▶14▤   | no section      | collapsed (14)                 |

**A mutation caught a vacuous test, and it is worth recording.** The spec pins
the trap itself — that U+200B survives the strip — by looping over the
glyph-bearing headers. The mutation "the glyph stops appending its zero-width
space" was predicted to fail it and PASSED: with no glyph, the filter returns an
empty array and a `for` loop over nothing asserts nothing. The guard now asserts
the set is non-empty first. A test that iterates a filtered collection needs to
assert the collection is not empty, or its premise disappearing looks like
success.

## 2026-09-18 — The inline-thumbnail mirror searched the whole table once per thumbnail (branch perf/art-mirror-master-row-index)

The largest remaining known cost, recorded as "known and separate" when the
AUDIT.md §3.1 work rejected span-mirroring. `_artInitInlinePics()`'s Case C1
mirrors every already-painted thumbnail onto its source row, runs on EVERY
multi-table re-render, and resolved each row with `_findMasterRowByIdx()` — a
linear scan of `allRows` plus every `groupedRows` entry. O(N²) per keystroke.

Measured (`scripts/bench-master-row-index.js`, `vzell-lap`, 2026-09-18 10:06
UTC): **1479 ms at 4174 rows** and **13 152 ms at 10 000**, against 3.8 ms and
14.2 ms for building one index and looking up in it — 389x and 926x. Full table
and the caveat about the per-scan figure in `tests/MEASUREMENTS.org`.

**Only the synchronous half is fixed, and that boundary is the whole design.**
Of the five mirror call sites, one (C1) runs synchronously inside the pass; the
other four are deferred — an image `load`, a `.then()`. A pass-scoped index
handed to a deferred caller would answer with rows that no longer exist, which
is precisely what `_buildMasterRowIndex()`'s JSDoc forbids ("build per call, use
per call, discard"). So the index is threaded as an OPTIONAL argument and only
C1 passes one. Measured on the fixture: a keystroke went from 14 scans to 7, the
remaining 7 being `_artMirrorIconToSourceRow()`, whose two call sites are both
deferred. That half stays, and is now recorded rather than implied.

The index is built LAZILY. Most passes mirror nothing — a single-table page, a
page whose artwork has not painted, a pageType with no artwork — and must not
walk every source row for an index nobody reads.

**Three tests were written before one of them tested anything.** The cost half
is easy (`__saTest.masterRowScans()` counts scans; a keystroke must not add one
per thumbnail) but it is satisfiable by a mirror that resolves nothing, so the
guarantee half has to be real. A mutation that makes every lookup return the
WRONG master row was predicted to fail it. It passed — three times, against
three successively stronger assertions:

1. the COUNT of painted thumbnails after a re-render;
2. the same count with the artwork network FROZEN, so nothing could be repainted
   by a re-fetch;
3. the SET of `data-mb-row-idx` values carrying a thumbnail, not the count.

All three passed, and the third is what made the reason clear: **C1 is not the
primary writer.** By the time it runs — on a re-render — the deferred mirrors
have already written each thumbnail onto its correct source row during the
initial paint. C1 is idempotent maintenance, so a wrong row is overwritten with
what is already there. Catching it would need a source row that lacks its
thumbnail at C1 time, which no fixture arranges. Recorded as `expect: "pass"`
with that explanation rather than engineered around — the three failed attempts
are the evidence that the path is masked, not that the tests are weak.

### Two more instances of the same family, during the 9.99.1111 merge (2026-09-18)

Recorded because two flakes in one suite run is new, and the pair is worth
seeing together. Both failed once on the merged tree and passed immediately
afterwards — standalone AND on a plain re-run of the same shard:

| Spec                                                                 | Standalone | Shard re-run |
|----------------------------------------------------------------------|------------|--------------|
| `live-date-flag-button-counts` › "C: clearing the filter restores …" | 5/5        | 116 passed   |
| `rel-column-fetch-failure` › "multi-table: the failure marker …"     | 2/2        | 110 passed   |

The second one mattered more than the first: it is about a MULTI-TABLE
RE-RENDER, which is exactly what 9.99.1111 changed, so it could not be waved off
as load. It was still load — the run before it, on the same userscript code plus
one `@version` comment line, was 116 + 110 + 113 green, and the host had just
had a background task killed for memory pressure.

The lesson is the one already in this file: **re-run before believing a
full-suite failure**, and re-run the SHARD as well as the spec. A spec that
passes standalone but keeps failing in its shard is a different finding from one
that passes both ways, and only the second is load.

## 2026-09-18 — Fewer Playwright workers made the flaky family WORSE, which the "load sensitivity" attribution does not predict (NB-3641 re-runs, main)

Found while re-running this repo's measurements on `NB-3641` (28 cores, 31 GB)
because every recent arm had been captured on `vzell-lap` (4 cores, 16 GB). Six
full fixture-suite runs on `main` at 9.99.1111, machine otherwise idle:

| Workers      | Runs | Green | Wall      | Failing spec, when red                                                     |
|--------------|------|-------|-----------|----------------------------------------------------------------------------|
| 14 (default) | 3    | 2/3   | 1.7-1.8 m | `rel-column-fetch-failure.spec.js:109`                                     |
| 4            | 3    | 1/3   | 4.4-4.5 m | `rel-cell-state-glyphs.spec.js:328`, `area-flag-region-filter.spec.js:142` |

**Two separate findings, and only the first is settled.**

**Sharding is a memory workaround, and the memory half is host-specific.** 339
tests run unsharded here in 1.7 min with ~24 GB free, backgrounded — against the
~10-11 min of three hand-run shards on the smaller hosts, and against AUDIT.md
§6's three memory kills, which did not reproduce. §6 now carries the host
qualifier rather than the bare claim.

**What did NOT go away is the flaky family, and cutting parallelism made it
worse.** Playwright's default worker count is half the cores — 14 here, 2 on
`vzell-lap` — so "unsharded on a big box" is *more* concurrency per run, not
less. If load were the mechanism, dropping to 4 workers should have helped. It
produced twice as many red runs, on two specs that had not failed at 14, and
cost 2.6x wall clock.

Three distinct specs across six runs, every one a poll or a fixed
`waitForTimeout` racing the userscript's own 1100 ms Relationships rate gate.
A hypothesis that fits the direction, recorded as a hypothesis and **not acted
on**: those waits were tuned on the slow host, and giving each test *more* CPU
finishes the userscript's async work sooner relative to a fixed sleep, so the
sample lands at the wrong point — under which reading contention is what had
been keeping them green, and the fix is a settle-condition, not a bigger budget
and not fewer workers. N=6 across three specs: enough to refute "more
parallelism is what breaks it", not enough to publish a mechanism.

Nothing was changed in response. The practical rule is unchanged and is the one
already in this file: **re-run before believing a full-suite failure.** What
changes is that on this host you can re-run the whole suite in 1.7 min instead
of re-running a shard.

Numbers, host conditions and the per-arm detail: `tests/MEASUREMENTS.org`,
"Unsharded vs. worker count — NB-3641, 2026-09-18".

## 2026-09-18 — The injected Release-events column was built in a shape nothing could read (branch fix/release-events-native-markup)

Reported as a flag problem on
`https://musicbrainz.org/place/a727b970-8ea0-4f75-abc8-db131f72aecb/performances`
with "MusicBrainz: Right Side Flags Everywhere" installed: the 📊 dropdown for
"Release events" showed no flags and none of its usual sections, and "Release
country" showed two flags per entry, one before the name and one after.

**Four independent defects, and only ONE of them was the flag userscript's
doing.** Root-caused from `debug/right-flags-release-events.html`, the real
rendered DOM, rather than from the screenshots — and cross-checked against
`debug/label-rels-final.html`, the same pipeline with the flag userscript
absent (`mb-hq-flag-img` count: 0), which is what showed three of the four
reproduce with no third-party script at all.

**The shared cause.** `release-country`, `release-date` and `release-event`
appear **0 times** in that 1.3 MB page. `_rePopulateCell()` was building

    <li class="flag flag-US" title="United States (US)">US  2005-12-20</li>

where MusicBrainz builds `.release-event` > `.release-country` + `.release-date`.
Every consumer that reads structure rather than pixels scopes on those classes:

| Consumer                       | scopes on               | found                                                                                                            |
|--------------------------------|-------------------------|------------------------------------------------------------------------------------------------------------------|
| `_findCellReleaseEventParts()` | `.release-event`        | nothing                                                                                                          |
| `_findCellCountryNameParts()`  | `.release-country`      | nothing                                                                                                          |
| `openUniqDrop()`'s `iconSel`   | `span.flag`             | nothing — the class was on the `<li>`, which is ALSO the walk root and so never returned by `querySelectorAll()` |
| `hasFlagIcons`                 | a column-NAME whitelist | 'Release events' explicitly excluded                                                                             |

The column rendered perfectly, which is exactly why this survived: nothing was
missing on screen, only in the dropdown. `_rePopulateCell()` now goes through a
shared `_buildReleaseEventLi()` that also serves the show-all JSON
reconstruction, so the two producers cannot drift again, and
`SyntheticColumnDataExtractor.splitCountryDate` is a pass-through to the native
extractor instead of re-parsing a two-space separator out of the `<li>`'s text.

**The double flag was downstream of that same shape, not a separate bug.**
RSFE picks its shape by whether the `.flag` element wraps an
`a[href*="/area/"]`: with one it neutralizes in place and puts its `<img>` in a
sibling `span.mfe-flag-wrapper`; without one it appends the `<img>` INSIDE the
element. Our script-built spans had no anchor, so they got the second shape —
and only the first was excluded from `iconSel`, so the hollow span and the img
both matched. Now that these cells emit anchored native markup, RSFE takes the
first branch there anyway; the guard is kept and pinned separately because any
anchorless flag span reaches the same path.

**One correction to my own fix, caught by an existing spec.** The first version
dropped the dropdown icon whenever `resolveFlagVisual()` found nothing
paintable, reasoning "invisible in the cell ⇒ invisible in the dropdown". Those
are different facts. A native flag paints from MusicBrainz's sprite stylesheet,
which is **absent in every fixture** and briefly absent on a slow real page, so
the resolver legitimately returns null for a perfectly good flag. That stripped
the trailing flag from every "Entity info - Area name" entry and failed
`uniq-drop-area-name-flag-position.spec.js`, which exists for exactly that
guarantee. The guard now keys on the userscript's own `data-hq-processed`
marker — positive evidence of neutralization — and never on absence of paint.

**A pre-existing bug the new fixture exposed.** `_rePopulateCell()` did
`cell.appendChild(ul)` with no clear, so two passes reaching one cell before
either stamped `data-re-done` rendered every event twice, in the cell and in
both derived columns. WS/2 latency hides it live; a stubbed fetch that answers
instantly reproduces it every time. The identical unguarded `appendChild` is
visible in this change's own diff, so it is not a regression from it. Fixed the
way `_populateCells()` already does it — replace, never append.

**Mutation testing changed the work three times**, which is the argument for
running it rather than assuming:

- The alignment test only inspected the countryless row, so removing the
  DATE-side padding left it green. A mirror test for the dateless row now exists.
- "Remove the `<a>`" passed: `ColumnDataExtractor.splitCountryDate()` rebuilds
  the anchor itself from the `<abbr>`, so it is not load-bearing for the
  Country-details sections. Recorded as `expect: "pass"` rather than dropped.
- **The two hollow-flag guards cover for each other in BOTH directions.**
  Removing `iconSel`'s exclusion alone passes (the bake guard catches it);
  removing the bake guard alone passes (the selector catches it). Either one
  recorded as `expect: "fail"` would have been false. A combined mutation
  removing both now fails with `RSFE direct-append shape: one icon, not two` —
  that, not the individual entries, is what shows the pair is load-bearing.

`scripts/mutations/release-events-native-markup.json`, 11 entries, 9 expect-fail
and 2 expect-pass. Perf gate in `tests/MEASUREMENTS.org`: the cell grew from one
node per event to four, costing +0.9 ms per pass at 2000 cells with one event
and +5.6 ms with three — 0.08% and 0.51% of this host's own 1096 ms filter pass.

### Follow-up, same day: the date ran into the flag, and CSS could not fix it

Found by exercising the real page rather than by a test — the fixture suite was
green and had nothing to say about it. With "Right Side Flags Everywhere"
installed the cell and the dropdown both rendered `US<flag>2005-12-20`, the date
jammed against the flag.

**Not a native-markup faithfulness problem.** MusicBrainz's own
`.release-event` puts `.release-country` and `.release-date` adjacent with no
whitespace node between them, and this column now reproduces that exactly. The
crowding comes from the flag userscript: it gives its `<img>`
`margin-left: 0.40em` but `margin-right: 0.05em`, which is correct on every
surface where its flag is the last thing in the cell — and this column is the
one where something follows it.

**Superseded the same day — see "Follow-up 3" below.** The first fix put a
leading space in the date span's own text, scoped to the injected column. That
was too narrow: the bug is in MusicBrainz's NATIVE `Country/Date` column too,
which this script does not build. It is now a stylesheet rule plus a
segment-builder flag, covering both columns with one mechanism, and the text is
left byte-identical to MusicBrainz's own.

What was already right in that first attempt, and still holds: the fix needs
TWO mechanisms, because neither surface can be reached by the other's. A margin
rule alone cannot touch the 📊 panel — it rebuilds an entry from `flagIconMap`
segments as `[text][cloned icon][text]` and never clones the `.release-date`
element at all.

`padForAlignment` became `injectedColumn` in the same edit. Two options now hang
off it, and they are one fact rather than two: an injected cell is not native
markup sitting in MusicBrainz's own CSS context, so it pads its own alignment
spans AND supplies its own separator.

### Follow-up 2: the country sections put the flag before the name, the area sections after it

Also found by looking at a real panel. One dropdown showed both conventions at
once:

    🇬🇧 » country: GB                    <- "Release events - Country"
    🌐 » area name: California 🏞        <- "Entity info - Area name"

**The decision had already been made — for one kind only.** `'name'` entries
used to render `[flag] » area name: Spain` and were changed to
`[glyph] » area name: Spain [flag]`, with `uniq-drop-area-name-flag-position.spec.js`
written to pin it. `'revcountry'` and `'countrycode'` were never brought along,
because they reach `makeValueSynItem()` by a different route: they pass their
flag as a CLASS STRING in `glyphClass` (the combined `flag flag-XX`), where
`'name'` passes a baked NODE in `flagNode`. The marker slot rendered whatever
`glyphClass` held, so for the country kinds that was the flag itself.

Both kinds now put a generic `arealink` glyph in the marker slot — a country is
an area — and render the flag after the label. The trailing slot builds a span
from the class string when there is no node to clone; same slot, same position,
so every flag-bearing entry in the panel reads alike.

**The class-only span deliberately does NOT get `data-hq-skip`.** That marker
belongs on clones `_bakeFlagIconNode()` resolves from a live cell, which carry
an inline background that has to survive a flag userscript's `!important`
blanking rule. This span has no inline background to protect — it is painted by
MusicBrainz's own `.flag` stylesheet, or by whichever userscript replaces it —
so opting it out would leave an empty span rather than protect anything.

Two mutations, because the marker alone cannot distinguish "the flag moved" from
"the flag is gone": one puts it back in the leading slot, the other removes the
trailing one.


### Follow-up 3: the same gap is missing on NATIVE pageTypes, and CSS alone cannot fix it

Reported against `artist-releases`' own `Country/Date` column: `US<flag>1986-05`.
So follow-up 2's fix was scoped wrongly — the defect is not in what this script
builds. MusicBrainz's native markup is

    <li class="release-event"><span class="flag flag-XX release-country">…</span
    ><span class="release-date">1986-05</span></li>

with no whitespace between the two spans, and this column now reproduces it
byte for byte. It reads fine while the flag is a background sprite ON the
country span and badly once a flag userscript puts a real `<img>` there.

**The gap cannot go on the image.** "Right Side Flags Everywhere" sets
`margin-right: 0.05em` INLINE with `!important`, and an inline `!important`
declaration outranks every stylesheet rule — author `!important` beats normal
inline, but inline `!important` beats author `!important`. So the rule targets
`.release-date`, which carries no inline margin:

    table.tbl li.release-event > .release-country:not(.no-country) + .release-date

`:not(.no-country)` keeps a countryless date flush left instead of spacing it
off an empty span.

**And CSS alone is not enough**, which is the part worth remembering: the 📊
panel rebuilds an entry from segments and never clones `.release-date`. That
half is `spaceAfter` on an icon segment whose element sits inside a
`.release-country` — scoped exactly so, because elsewhere an icon decorates the
text that FOLLOWS it (an area chain reads `<flag>Los Angeles, <flag>California`)
and a blanket space would push every flag away from its own name.

**A test that passed for the wrong reason, caught by mutation-testing.** The
first version of the dropdown assertion had no flag userscript in the fixture —
and with no image, the walker keeps `US` and the date in ONE text segment, where
`textParts.join(' ')` supplies the space by itself. Clearing `spaceAfter`
entirely left the test green. The image is what splits the run in two, so the
spec now decorates the rendered cells with `tests/fixtures/thirdPartyScripts/rsfe-flags.js`
(both of that script's branches, from its v2026-09-16.1151 source) before
asserting. The mutation fails properly now.

One more detail the same run exposed: the entry-finder used `/US\b/`, which
cannot match `US2005-12-20` — so the mutation reported "entry missing" for what
is really a spacing defect. Dropped the word boundary so the real assertion is
what fires.

**And the trap this file already documents, hit again:** the CSS comment was
written with backticks, inside the `GM_addStyle` template literal. `node --check`
reported `missing ) after argument list` 15 lines away. Third time recorded;
the replacement comment says in-line why it uses none.

### Follow-up 4: the snapshot that "showed the bug still there" predated the fix

Reported as the date/flag spacing still being broken on `artist-releases`, with
`debug/flag-spacing.html` as evidence. The snapshot does not contain the fix:
`release-country:not(.no-country)` appears **0** times in it, so it was captured
from the installed 9.99.1111 build rather than this branch. It also carries
**0** `data-hq-processed` and **0** `mb-hq-flag-img`, i.e. no flag userscript was
active either — those flags are MusicBrainz's own sprites.

Worth keeping rather than discarding, because it is the first real capture of
the NATIVE shape this fix has to cover, and it settled the open question
directly: the selector is now asserted against that page's exact bytes, injected
into a rendered table so the real stylesheet resolves them —
`tests/fixtures/uniq-drop-release-events-sections.spec.js`, "the date-spacing
rule matches MusicBrainz's OWN native Country/Date markup". It passes, and a
mutation narrowing the rule to `td.mb-re-cell` fails it. So the rule was already
right; only the evidence was stale.

**The lesson for the next report: check whether the snapshot contains the change
before diagnosing.** One grep for a distinctive string from the fix answers it,
and answering it first would have saved re-deriving a defect that was already
fixed.

### Follow-up 5: only half of a "Country" cell's value got a flag

Same report, second half. A "Country" cell renders both halves of ONE value —
`United States (US)` — and the dropdown lists them as two sections, "Country
details - Name" and "- Code". Only the code half was decorated: `countryCodeFlagMap`
existed, was populated from `_findCellCountryNameParts()`'s own `flagClass`, and
was passed to `makeValueSynItem()`; there was simply no name-keyed equivalent,
and the `'countryname'` kind was absent from the marker/trailing-flag lists.

`countryNameFlagMap` now sits beside it, populated in the same pass and — the
part that is easy to miss — **cached alongside it in `_setUniqDropDataCache()`**.
Without that a cold dropdown would show the flags and a warm one would not,
which is the sort of split that reads as a rendering race rather than a missing
map.

### Follow-up 6: the rule was applying the whole time — it was 4.2px, not 0

Settled from the live page rather than from another snapshot. One console
expression returned everything at once:

    ruleInAnyStylesheet: true    selectorMatches: 469
    marginLeft: "4.2px"          fontSize: "12px"

So neither the selector nor the cascade was ever the problem. `0.35em` against
musicbrainz.org's 12px root font is 4.2px; the fixture that "proved" the rule
works runs at 16px and produced 5.6px, which is why it read as fine there and
tight on the real page. **A gap sized in `em` and verified only in a fixture is
verified at the wrong font size.**

The value is now `0.4em`, chosen rather than guessed: it is exactly the
`margin-left` that flag userscript gives its own image, so the flag sits evenly
between the country code and the date instead of hugging one side.

`!important` stays, but it fixed nothing and the code comment no longer implies
it did.

**Two reporting failures on my side, recorded because they are the reusable
lesson, not the CSS.**

1. *A truncated read reported as a whole result.* The mutation run was checked
   with `tail -3`, which showed three `OK` lines, and reported as "18/18". One
   entry was `UNEXPECTED`: the `!important` edit had invalidated its `find`
   anchor and `mutation-check.py` correctly refused it as `ERROR`. Counting
   outcomes explicitly — `grep -c` on `^        OK`, `^UNEXPECTED` and `ERROR` —
   is the fix, and is cheap.
2. *A conclusion stated firmer than its evidence.* `debug/flag-spacing.html` was
   declared to predate the fix because the rule's text was absent from it. These
   captures contain **zero** `<style>` blocks, so a CSS rule's absence says
   nothing at all about the build.

Both are the same habit. The snapshot-based check that WOULD have worked is a
DOM-visible marker, never a stylesheet one.


### Follow-up 7: the Country/Date cell gap was REVERTED — root cause found, fix abandoned

Three CSS attempts, all reverted at the user's call. The column is left at
MusicBrainz's own rendering, which puts nothing between the country and the
date. Recorded because the root cause WAS found, and anyone tempted to try
again should start from it rather than from the margin.

**The root cause.** Two numbers from the live page, together, are the whole
story:

    computed margin-left: 4.8px      rendered gap: 0.59px

Both true at once only if the date is laid out after `.release-country`'s box
EDGE while the flag image overflows that box. musicbrainz.org's own `.flag`
rule makes that span a fixed-width 16px inline-block holding a background
sprite; "Right Side Flags Everywhere" zeroes its `background-image`, `padding`
and `margin` — but NOT its `width` — so its ~21px image overflows, and any
margin on the date lands inside the overflow. Reproduced at 0.66px against the
live 0.59px, and releasing the width gave 5.39px.

So `width: auto !important` on `.release-country:has(img)` did work in the lab.
It was still reverted: the user reported it as not working on the real page, and
after three rounds the honest read is that something further up that page's
cascade is not reproducible here. Leaving a rule that is unverifiable in a
fixture and unconfirmed in the browser is worse than leaving the column alone.

**What was NOT reverted, and why.** `_buildFlagSegmentsForRoot()`'s `spaceAfter`
stays. That is the 📊 panel, not the cell, and it is not cosmetic there: the
panel rebuilds an entry as `[text][cloned icon][text]` with no separator between
segments, so without it an entry reads "US2005-12-20" — WORSE than before this
column was rewritten, when the cell was a single text node and
`textParts.join(' ')` spaced it for free. Reverting it would introduce a
regression rather than restore a baseline.

**Four rounds of my own diagnosis were wrong, in the same way each time**, and
that is the reusable part:

| Claimed                                          | Actually                                                                    |
|--------------------------------------------------|-----------------------------------------------------------------------------|
| the snapshot predates the fix (rule text absent) | these captures strip `<style>` entirely — a CSS rule's absence says nothing |
| the live cascade must be overriding it           | it was not; the rule computed 4.8px                                         |
| 18/18 mutations green                            | 17 OK, 1 UNEXPECTED — read off a `tail -3`                                  |
| the flag and date overlap (gap -20px)            | the line had WRAPPED in a narrow test column                                |

Every one came from measuring the wrong thing and reporting it with more
confidence than the measurement carried. The check that finally worked was
geometry on the live page — `getBoundingClientRect()` — asked for in one console
expression. **For anything about visual spacing, measure rects, not computed
styles, and measure them where the bug is.**

## 2026-09-19 — A Cover Art Archive outage was stored on disk as "this release has no artwork" (branch fix/caa-metadata-transient)

`org/503-handling.org` F5, ranked first there because it is the only finding
whose damage **outlives the session**. Found by reading the code at 9.99.1116;
confirmed by `tests/fixtures/caa-metadata-transient-503.spec.js`, which is also
the first test in the repo to read the art cache's `metadata` store back.

**Root cause.** `_artEnrichIcon()`'s Tier 3 had one branch for every `!resp.ok`:

```js
if (resp.status === 404) { /* debug */ } else { Lib.warn(...) }   // severity ONLY
ctx.countCache.set(entityPath, 0);
ctx.imagesCache.set(entityPath, []);
if (Lib.settings.sa_art_idb_enable) _artIdbPutMetadata(entityPath, 0, []);
```

`resp.status` picked the log level and nothing else. A 503 therefore became a
stored fact about the release, in IndexedDB, for `sa_art_idb_metadata_ttl_days`.
Every later page load hit Tier 2, took the `count <= 0` early return, and showed
no artwork with **no request and no warning** — so the symptom outlived the
outage by a week and looked nothing like a network problem.

**The second half was worse, and was the part I only suspected.** The org note
said `_artRetryTable()` "may not clear it". It does not: it purges `countCache`,
`imagesCache` and `_artMissCache`, all session Maps, and never touches the store.
So the retry re-entered `_artEnrichIcon`, missed Tier 1, **hit Tier 2** and
returned the same stored zero. Measured by the `"no IDB metadata eviction"`
mutation: the ⟳ button issues **zero** metadata requests for the whole table,
not just for the failed release. The one visible affordance for recovering from
this bug was itself a no-op.

**Three things worth carrying forward.**

- **The predicate already existed.** `_ART_MISS_STATUSES = [404, 410]`, declared
  next to `_artMissCache`, with `_artGmFetchBlob()`'s comment already stating the
  exact semantics ("a DEFINITIVE absence … from a transport failure"). The image-
  *bytes* path had been right about this the whole time; only the *metadata* path
  was wrong. I nearly added a new helper before grepping. Reusing it also fixed a
  latent bug for free: the old bare `resp.status === 404` meant a 410 was logged
  as a warning while being treated as definitive.
- **The fix is deliberately narrower than the org note proposed.** That note said
  only 404/410 may write the zero *and* only they may go to IDB. Gating the
  in-memory zero too would re-fire one request per failed entity on every filter
  keystroke and every sort — hammering the archive precisely while it is already
  struggling. Only the IDB write is gated. There is a mutation entry for this, so
  the narrowing is a *tested decision* rather than an unexplained divergence.
- **Key parity is by construction, not by inspection.** `_artRetryTable`'s step 2
  derives its cache keys from `ctx.rowLinkSel` + `href.split('?')[0]`, but
  `_artEnrichIcon` *writes* under `anchor.getAttribute('ref') || href.replace(artSuffix)`,
  read off the art anchor. Those agree for an ordinary row and diverge on a Path-C
  synthetic anchor; `rowLinkSel` also matches the sticky-column duplicate and
  release-group breadcrumbs that were never written. The eviction therefore
  derives its keys with the *writer's own expression*, off the art anchors.

**Testing note.** None of this is visible in the DOM — a release with no artwork
renders identically whether the archive said 404 or 503, on the broken build and
the fixed one alike. Every assertion reads the `metadata` store or the request
counter. Two traps cost a cycle each and are commented in the spec: `route.abort()`
makes `fetch()` *throw* and lands in the `catch` arm that already caches nothing
(so a spec built on it passes on unfixed code), and `sa_caa_pics_big: false` makes
`_artInitPics()` return before the ⟳ button is ever created.

All 9 mutations behaved as predicted (4 `fail`, 5 `pass` — the `pass` entries
being the un-awaited eviction, which cannot race from a fixture because
`_artIdbDelete` and `_artIdbGetMetadata` share one cached `_artIdbPromise`, and
the three `|| N` fallbacks, unreachable while `min: 1` holds).

## 2026-09-19 — `_ws2GetJson()` retried one status out of four, and read no headers at all

Branch `fix/ws2-transient-classifier`. `org/503-handling.org` F6 / item 1, the
prerequisite for items 3-4 (F1-F3) and item 6 (F4). Found by reading, not by a
report; pinned by `tests/fixtures/ws2-transient-classifier.spec.js` before any
code changed shape.

**The defect.** The file's only shared retry engine tested exactly one status:

```js
detail = `HTTP ${resp.status}`;
// Only a 503 is worth another attempt; a 4xx will not change.
if (resp.status !== 503) break;
```

The comment is right about 4xx and wrong about everything between. A 502 or 504
— what MusicBrainz's front-end returns while a deploy rolls — and a 429 from the
rate limiter each broke out on the first attempt and were reported as settled
failures: a ⚠ cell in the Relationships column, a yellow ⏱ button. And a grep
for `Retry-After` across all 80,757 lines came back empty, so the one case where
the server says exactly how long to wait was the one case we ignored.

**Three consumers, three separate `beforeRetry` bodies.** `_msFetchOneBatch()`,
`_relFetchWs2()` and `_relBrowseFetchPage()`. That mattered more than expected:
the floor is applied per call site, so "wired up" had to be proved three times.
The browse one is the quietest failure of the three — a failed browse page does
not surface as an error at all, the loop just `break`s and per-row lookups take
over, so the only visible difference is 1 browse + 6 lookups instead of 2
browses + 1. The test counts the two request kinds apart for that reason.

**Two things learned from the mutation run, both worth carrying forward.**

- **The rate gate MASKS a lost backoff.** Dropping the hint argument at the
  handover makes every caller compute `Math.max(delay, undefined)` = `NaN`, and
  `setTimeout(fn, NaN)` fires at once — no pause whatsoever. The measured retry
  gap was still **1100 ms**, because `_relAwaitRateSlot()` alone held the line.
  A spec asserting "there was a pause" would have been green on a build with no
  backoff at all. The assertion has to name the number.
- **Order matters around the rate slot.** The extra wait goes *before*
  `_relAwaitRateSlot()`. Topping up after the reservation would spend a slot and
  then fire late, so the request would no longer sit immediately behind the slot
  it holds — PERFORMANCE.org Step 36's "one rate gate" invariant. Recorded there
  as well, because nothing about the code makes the order look load-bearing.

**One correction to the analysis file itself.** `org/503-handling.org`'s
inventory had the ⏱ feature down as retrying "via row 4". Only the `'batch'`
source does. `_msFetchWs2RecordingLengths()` and
`_msFetchFullReleaseTrackLengths()` call `fetch()` directly with no retry at all
— the same defect as F4, on a path whose honest button states make it look
handled. Split out as row 6b rather than fixed here, to keep one change one
change.

**Testing note.** Everything is asserted through the real pipeline except the
30 s cap and the statuses this script never meets (408, 410), which go through
`__saTest.parseRetryAfterMs`/`isTransientHttp` — a behavioural cap test would
have to wait out half a minute to prove anything. The `a 400 is final` test
passes on unfixed code **on purpose**: widening a retry set is the change that
overshoots, and its mutation is the overshoot, not the original defect. All 12
mutations were `expect: "fail"` and all 12 failed; no known-overlap entries were
needed. One flake seen and chased down: `rel-column-fetch-failure.spec.js`'
multi-table test failed once inside a 50-test batch, passed standalone, passed
on a re-run of the same batch, and passes identically on unmodified code — the
change cannot touch it, since a 503 with no `Retry-After` parses to `0` and
`Math.max` is then a no-op.

## 2026-09-19 — a truncated page fetch was reported as a completed one

Branch `fix/html-fetch-transient`. `org/503-handling.org` F1-F3 / items 3 and 4,
unblocked by the `_isTransientHttp()` / `_parseRetryAfterMs()` helpers that
shipped as 9.99.1118 the same day.

**The defect, in one line each.** `fetchHtml()` had no retry. The main loop did
`pagesProcessed++` *before* fetching page `p` and `break`d in its catch, so a
503 on page 4 of 40 ended the run at page 3 and then printed "Loaded 4 pages" —
counting the page that failed, in the words a complete run uses (F1).
`fetchMaxPageGeneric()` returned `1` from its catch, so a failed page count was
indistinguishable from a one-page listing; its own JSDoc said "defaults to 1 on
error", which is how it survived — it read as a decision (F2). And the
artist-releasegroups official-headers pre-fetch `break`d too (F3).

**Two of the file's own open questions were answerable by reading, and both
answers changed the fix.**

- *What does a short official set do?* (open question 2) It is **worse than
  truncation**. The consumer walks `h3_all_category_header_array` and treats
  entries matching the FRONT of the official array *in sequence* as official;
  the first mismatch starts the non-official section. A set short by two
  categories therefore files two genuinely-official categories under
  Non-Official — confidently, silently — and `discOfficialCategories` persists
  that to disk. So the fix is to **discard** the partial set, not to carry it.
  Discarding is also what reaches every consumer: all of them gate on
  `length > 0`, including `saveTableDataToDisk()`, which does not run inside
  `startFetchingProcess()` and so could not have seen a flag.
- *Should the HTML retry share a budget across pages?* (open question 4) **No,
  and none is needed.** Every caller stops at its first failed page, so exactly
  one page can ever pay the retries: a genuinely down site costs three attempts
  in total, not three per page. The `break` already is the budget. Worth
  re-deciding only if item 5 (resume) makes the loop continue past a failure.

**Open question 1 was answerable only by fixing it.** Save-to-Disk after a
truncated fetch did write the partial set with no marker at all. The payload now
carries an optional `incomplete` block — absent on a clean run and in every file
written before it existed, so `!incomplete` keeps its old meaning and no format
version bump was needed. A loaded file's marker is carried forward, so re-saving
a partial file keeps it partial.

**The wording distinction that took a second pass.** `dataIncomplete` is
narrower than "something went wrong": a failed page or an unreadable count means
rows are missing, but an incomplete *pre-fetch* does not — the main pass fetched
everything and only the discography split is lost. Marking that run INCOMPLETE
would train the user to ignore the word. And when the count is unknown, `maxPage`
is the fallback `1`, so printing "N of M" would have produced "Loaded 1 of 1
pages" — a complete one-page listing, the same lie in new words. Hence
`pagesPhrase`, and a mutation entry for each.

**Testing note, and the trap worth remembering.** `tests/fixtures/html-fetch-transient.spec.js`
drives two shells that `scripts/build-html-fetch-fixtures.py` derives from the
committed snapshots, rewriting only the pagination widget to 3 pages — the real
ones say 42 and 22, and a fixture route serves the same shell for *every* page,
so honouring them would mean dozens of parses of a quarter-megabyte document per
test.

The trap: **once `fetchHtml()` retries, failing ONE attempt proves nothing.**
The first draft of the F2 test failed the page-count request once and asserted
the run was marked incomplete; the new retry absorbed it, the count came back
correct, and the spec reported a clean three-page run. A test that wants a final
failure has to exhaust all three attempts — and, here, stop there, so the loop's
own page-1 request (the same URL) still succeeds and F1 is not what is being
measured instead. Two smaller ones: the tooltip is on the status line's first
child span, not on the container (reading `title` off `#mb-global-status-display`
returns `null`, which looks exactly like "no tooltip was set"); and the F3 test
needs its CONTROL — without asserting that a *clean* run builds the discography
buttons, "no buttons" would pass on a fixture that never had them.

All 10 mutations behaved as predicted, all `expect: "fail"`. Full fixture suite
369 passed.

**Unrelated observation, recorded because it cost three investigations.** The
full fixture suite on this machine currently produces about one spurious failure
per run, a different spec each time, mostly `_runAndWaitForSettledText` timing
out at 30 s. It reproduces on **unmodified** code (verified by stashing the
userscript and re-running the same batch), and each spec passes standalone. It
is environmental, not a regression — but it means a single red spec in a full
run is not evidence on its own. Re-run it alone before believing it.

## 2026-09-19 — one lost request emptied the Release-events column, silently

Branch `fix/release-events-transient`. `org/503-handling.org` F4 / item 6, the
last of that file's silent-failure findings.

**The defect.** `initReleaseEventsColumn()` called `fetch()` directly rather
than `_ws2GetJson()`, so it had neither the three attempts nor the
transient/final classification every other WS/2 path had gained. A failure ended
in `_dbg(...)` — gated behind `sa_enable_release_events_debug`, so silent by
default — and a `return`. It is **one request for the whole page**, which is
what made it so cheap to lose: a single 503 and the column was empty, with
nothing on screen and no retry short of a page reload.

**What shipped beyond the routing.** The org note asked for "the failure state
on the column header if it still fails". Making that state CLICKABLE was barely
more code and gives the script its first **column-level** retry — a level the
file's own "Visualisation and retry level" table had as "No" everywhere.
`.mb-re-col-hdr-btn` is the eighth member of the `.mb-col-hdr-flex` family,
added by extending the three shared selector lists rather than copying a block,
per that section's own instruction.

It is painted **only** while loading (⏳) or after a final failure (⚠), which is
not just restraint: a clean render therefore gains no markup, so no committed
`rendered.html` baseline changes except its `<style>` block. Recorded in
`tests/snapshots/registry.org`'s "Expected drift", alongside the equivalent
entry from the Relationships glyph work.

**Two traps, both of which bit.**

- **Destroy and rebuild the control; never reuse it.** Two independent reasons,
  and I only had the second one in mind when writing it. (1) The control changes
  STATE — ⏳ becomes ⚠ — so reusing the existing element strands it on whatever
  it was first painted as. (2) `renderGroupedTable()` rebuilds every `<thead>`
  from a `cloneNode(true)`, which carries classes and attributes but **not** the
  click listener, so a reused control would look perfectly normal and do
  nothing. The mutation that turns the rebuild into a reuse is caught by (1)
  first; the spec clicks the control after a filter keystroke, which is what
  covers (2). The mutation file says so explicitly rather than claiming the
  edit proves only the listener half.
- **A test must wait on `[data-re-state="error"]`, not on the bare class.** The
  control exists while loading too, and the three attempts take a few seconds.
  Waiting on `.mb-re-col-hdr-btn` therefore proceeds mid-retry: the first draft
  of the spec asserted three requests, saw one, and reported a defect that did
  not exist. Three of its six tests failed that way at once, which is the
  cheapest possible way to learn it.

**Deliberately not on the rate gate.** `_relAwaitRateSlot()` exists to space a
STREAM of one request per entity. This is one request per page, so joining it
would couple two unrelated features' pacing for no benefit — and the bare
`fetch()` it replaces did not join it either, so nothing regressed. Written down
because "share the gate" is the obvious-looking tidy-up.

**Testing note.** `tests/fixtures/release-events-transient.spec.js` reuses the
`label-relationships-release-events.html` shell that
`release-events-filter-after-populate.spec.js` already drives, including its
page-error exclusions (that captured shell's own MusicBrainz scripts throw). All
6 mutations behaved as predicted, all `expect: "fail"`. Full fixture suite 375
passed.

## 2026-09-19 — retrying three failed rows cost two thousand requests

Branch `feat/rel-retry-failed-only`. `org/503-handling.org` F7 / item 8,
Relationships half. The CAA half stays blocked: nothing on the art path records
that a request failed *transiently*, since F5 deliberately kept the in-memory
zero for both a genuine 404 and a 503.

**The defect.** `_relRetryTable()` collects every `td.mb-rel-cell[data-mbid]` in
the table and re-requests all of them. On a 2000-row table with three failures
that is 2000 requests at one per 1.1 s — about forty minutes to repair three
seconds of trouble. `_relRetryAll()` does the same page-wide.

**What shipped**: `#mb-rel-retry-failed` (`⚠⟳ N`), present only when something
failed. Both existing buttons are untouched — "force a genuine refetch of a
table I believe is stale" and "recover the failures" are different intents, and
there is a mutation for the future simplification that would collapse them.

**Two real bugs surfaced while making the tests pass**, neither of which was the
thing being built:

- **`_relRetryMbids()` cleared `data-rel-error` on the LIVE DOM only.** A
  failure a filter was hiding kept its marker, and the impl's candidate scan and
  `_relQueueStillWants()` both read a marked cell as "leave alone" — so it was
  stranded *permanently*, silently, even after a retry the user watched succeed.
  Markers are now cleared on the source rows too.
- **`_relRetryAnchorFor()`**: the anchor walk stopped at the `<h2>` and returned
  `null`, so on a single-table page with cover art off the retry buttons were
  created and then dropped on the floor. That is every single-table FIXTURE
  (`FIXTURE_SETTINGS_OVERRIDE` forces `sa_enable_caa_pics` off), which is why no
  spec had ever seen these buttons and why this only came to light now.

**Three things I got wrong first, all caught by mutation-testing.** Worth
recording because each looked right:

1. **"Present but dimmed at zero" does not answer trap 2.** The org offers
   "count source rows, OR keep the zone present and merely dimmed" and I took
   the second as the cheaper route. It is not equivalent: a filter that hides
   the failures still dims the control into uselessness, which is the same
   defect wearing a different hat. The count has to be filter-proof either way,
   and once it is, absent-at-zero is fine and adds no button to a clean page.
2. **My filter test was measuring the wrong thing.** It filtered every row away
   and asserted the label still read `⚠⟳ 1`. That passes on a live-DOM-only
   count too — because a filter triggers no cell write, so nothing recomputes
   the label at all. The mutation that strips the source-row scan passed against
   it. The assertion now goes through `__saTest.relFailedMbids()`, and the test
   pins the *recovery*, not the label.
3. **The repaint hook was redundant and expensive.** I hung
   `_relRefreshFailedRetryButtons()` off `_relScheduleProgressRefresh()`, which
   is the obvious place. Its mutation could not be made to fail — because
   `_relCreateRetryButtons()` already runs when the Phase-2 queue drains, i.e.
   once every failure has settled. And `_relFailedMbidsPageWide()` walks every
   captured source row, so a per-animation-frame call is thousands of
   `querySelectorAll()`s per frame on a large page. Removed rather than kept as
   belt and braces. **A mutation that will not fail is worth reading as a
   question about the code, not only about the test.**

**Scope deviations from the org's UI design, both deliberate.** Plain sibling
button rather than a segmented pill (user's call: the CAA half is blocked, so a
half-converted header would read inconsistently). And page-wide rather than per
table — scoping zone 4 to one table needs a table → source-rows mapping that
`_relScheduleProgressRefresh()`'s own comment says is unreliable, and it saves
nothing, since F7 is about not re-requesting the successes. That mapping is the
first problem to solve when the per-table pill is built.

**What is NOT guaranteed.** A filtered-out failure is not re-*fetched* while it
is off screen: `initRelationshipsColumn()`'s candidate scan is live-DOM-based.
It is un-marked, so it loads as soon as it is back in view, and the spec pins
that rather than claiming an immediate fetch.

Six mutations, five `expect: "fail"` and one honest `expect: "pass"` — the
done-wins rule needs a fixture listing the same entity twice, and no committed
fixture has one.

## 2026-09-20 — the art path could not say a request had failed

Branch `feat/caa-retry-failed-only`. `org/503-handling.org` F7, CAA half — the
half its own design record called a hard prerequisite rather than a detail, and
the last piece of item 8.

**The blocker, restated.** After F5, `ctx.countCache` holds `0` for both "the
archive says this release has no artwork" (a 404 — a fact) and "the request
failed" (a 503). F5 kept the in-memory zero for **both** deliberately: dropping
it would re-fire one request per failed entity on every keystroke and every
sort, hammering the archive precisely while it is already struggling. The
consequence was that nothing downstream could tell the two apart, so there was
nothing for a "just what failed" control to count.

**What cleared it.** `ctx.failedCache` — a session-scoped `Set` of entity paths
per archive, written in `_artEnrichIcon()`'s Tier 3 at exactly the point F5
decided not to persist. The org predicted this shape almost exactly. Two
corrections to the prediction:

- It is cleared by the **success path** and by `_artRetryFailedAll()` as well as
  by `_artRetryTable()`, not only the last.
- **Only a non-definitive status is recorded.** A 404 is the commonest answer
  the archive gives; recording it too would have put a `⚠⟳` carrying a large
  number on almost every page, which is the same as having no signal.

**Keyed by entity path, not by DOM — and that mattered more than expected.** The
Relationships half of F7 had to be argued into surviving a filter, and got there
only by reading the captured source rows. Here the property is structural: a
`Set` of paths has no idea the table exists.

**Two mutations that would not fail, and what each taught.** This is the second
day running that a non-failing mutation was more informative than a failing one.

- **"a successful answer leaves the entity on the failed list" passed.** Because
  the failed-only retry clears the set up front, so that path empties it whether
  or not the success arm works. The success arm is observable only on the
  NETWORK-ERROR branch, which caches no zero and is therefore retried by an
  ordinary re-render with nobody pressing anything. Added a test for exactly
  that, using `route.abort()` — normally the wrong tool on this path, and the
  right one here precisely because the catch arm is the subject.
- **"the retry re-arms every entity, not just the failed ones" passed**, and
  corrected my own understanding of the code I had just written. That membership
  test is an **efficiency** guard, not the correctness one: re-arming an anchor
  only produces a request when the entity has no cache entry, and the ones that
  answered still have theirs. What actually limits the requests is the
  cache-deletion loop, which is scoped to `paths` and does have a failing
  mutation. Recorded as `expect: "pass"` with that reasoning rather than deleted.

**What this does NOT touch**, since the CAA/EAA section of CLAUDE.md asks for
that statement up front: no sort key is rewritten, no source-row mirror is
re-resolved, no big-image strip is rebuilt, no image is cache-busted, and no
IDB record is evicted. A metadata failure means the JSON never arrived, so the
whole recovery is "clear the zero, drop the `enriched` marker, re-run
`_artEnrichIcon()`" — and `_artEnrichTable()` is the same entry point an
ordinary render uses. `_artRetryTable()` keeps its full eight-step rebuild for
the case it was written for.

**One asymmetry worth knowing.** The per-frame refresh hook that was *removed*
from the Relationships control is *kept* here, and the reason is the cost of the
count: `Set.size` versus `_relFailedMbidsPageWide()` walking every captured
source row.

## 2026-09-20 — the artwork summary panel, built from data already thrown away

Branch `feat/caa-artwork-summary`. `org/503-handling.org`'s zone 2, decided
2026-09-19 and the last designed-but-unbuilt piece of that file apart from the
segmented pill itself.

**Why it is worth having.** The only surface reporting artwork state was
`_showCaaCompletionToast()`: page-wide, transient, and fired on the `_caaQueue`'s
`onIdle`. CLAUDE.md already recorded that on a large listing it **never fires**
— measured still hidden after 300 s while artwork was visibly painting. So on
exactly the pages where a user most wants to know what happened, there was
nothing to look at.

**It costs no requests, and that is structural.** `_artEnrichIcon()` Tier 3
stores `json.images` verbatim, so the full archive record is already in
`ctx.imagesCache`: `edit`, `front`/`back`, the thumbnail ladder, and `release`
on a release-group lookup. Four of those were stored and surfaced nowhere. The
archive has no batch endpoint, so anything the panel could not answer from that
cache would be one request per entity — the cost this whole file exists to
reduce.

**The distinction worth knowing about**: `img.front` is not
`types.includes('Front')`. An image can be typed Front without being the
archive's chosen main front. The fixture makes the two disagree by construction
— two Front-typed images per release, one main front — because a fixture where
they agreed would pass on code that conflated them. There is a mutation for
exactly that conflation.

**Three departures from the written design, all deliberate and all recorded in
the org file:**

1. **A separate 📊 sibling button, not the count badge.** The design drew the
   count as the opener; making it a click target would nest an interactive
   element inside the toggle `<button>` — the design's *own* trap 3 — and
   `.mb-caa-toggle-count` is located by two specs and read by
   `_artRetryTable()`'s badge arithmetic.
2. **The scope is declared, not walked.** Trap 2 asks for a pass over the source
   rows so a filter cannot make the panel report a subset as the whole table.
   That needs a table → source-rows mapping this file calls unreliable (merged
   discography view), which is the same wall zone 4 hit twice. So the panel
   tallies the live rows and says "a filter is active" in its own header. That
   is trap 2's own second option, taken knowingly rather than by omission.
3. **The Cache-tier group was deferred.** It is the one group that merely
   reproduces the toast per table; every other group shows something no screen
   in the script showed before.

**Two test-shape corrections, both caught on the first run:**

- **The panel is per-table; `hits.size` is page-wide.** The first draft asserted
  against the number of releases the PAGE asked about (7) while the panel covers
  the first sub-table (Official, 6). Every assertion is now relative to the
  panel's own entity count, which is both correct and a better assertion.
- **The "could not be fetched" rows have no value cell**, so the generic
  row-reader threw on `null`. Worth remembering for any future group that is a
  list rather than a label/value pair.

**Known gap, recorded rather than discovered later:** the "Cover sourced from"
group ships untested. The archive returns `release` only on a release-GROUP
lookup, and this fixture's page (`releasegroup-releases`) looks up releases;
covering it needs an `artist-releasegroups` fixture.

Seven mutations, six `expect: "fail"` confirmed plus one honest `expect: "pass"`
for the entity-path dedup — this fixture has no sticky-column duplicate reaching
an art anchor, so double-counting does not move the numbers here.

## 2026-09-20 (later) — the artwork panel's live pass: one fix, one withdrawal, one open

Corrects and extends the entry above, after the first browser pass over the
zone 2 panel. Three things were reported; two are settled and one is not, and
the not-settled one is the interesting entry.

**"Cover sourced from" never appeared — because the field does not exist.**
`org/503-handling.org`'s field table said a `/release-group/{mbid}` lookup
"adds a `release` field — the specific release from which the art was sourced".
That row was filled in from the Cover Art Archive's **documentation** on
2026-09-19. `scripts/probe-caa-release-group-release-field.py`, 2026-09-20:

    RELEASE-GROUP lookup  HTTP 200, 12 images
      first image keys: approved back comment edit front id image thumbnails types
      images carrying `release`: 0 of 12

A release-group answer carries exactly the same nine keys a release answer
does. The group is removed and every doc that repeated the claim is corrected,
citing the probe.

The root CLAUDE.md already says this in as many words — "the docs describe
intent, and several endpoints behave differently from what they suggest…
Record the probe result next to the code that depends on it" — and I built the
group from the docs anyway. **The tell was there and I wrote it down myself**:
the previous entry records the group as "shipped but UNTESTED" because no
fixture could exercise it. A group nothing could test was a group nothing had
checked.

**The panel's presentation was reworked** toward the agreed mock: read-time and
a "still loading" marker in the header, chip-style sections, a "N images have no
1200" note, a distinct failed section, Retry/Close in a footer.

**STILL OPEN: "not looked up yet" stuck at 21 on a 2144-row Springsteen
artist-releasegroups page**, not falling over time or across reopens.

I guessed a cause, wrote a regression test for it, and **the test passed against
the build that still had the bug** — so the guess was reverted rather than
shipped. Recorded because the guess was plausible and the disproof is cheap to
repeat:

- The guess: the panel scans `a[href$="/cover-art"]` while `_artEnrichTable()`
  enqueues from `ctx.iconSel` (anchors that CONTAIN an icon span), so the panel
  counts entities nothing will ever look up.
- Disproof 1: `releasegroup-releases` has 7 cover-art anchors and **all 7**
  carry icon spans, so the two selectors agree and that fixture cannot show the
  difference either way — which is exactly why the test passed on the buggy
  build.
- Disproof 2: a Simon & Garfunkel **artist-releasegroups** page — the same
  pageType — renders the panel correctly (43 with artwork), so `iconSel` does
  find those anchors on that pageType.

What actually differs between the two live pages is SCALE: 123 rows against
2144. At the archive's ~1.2 req/s, ~2144 entities is roughly half an hour of
queue, so the Album sub-table's 21 may genuinely still be behind it. If that is
the story, the number is TRUE and useless, and the defect is that "pending"
does not distinguish "queued behind two thousand others" from "in flight" and
offers no sense of the queue.

That remains a hypothesis. What would settle it, in order of cost: does the
number move at all after several minutes; does the CAA toggle badge beside
"Album (21)" stay at 0; does the page header ever show a `CAA:` timing. If
enrichment is not running at all there, a `debug/` snapshot of that page is the
next step.

## 2026-09-20 (later still) — defect 1 answered: the panel was telling the truth

Closes the "STILL OPEN" item in the entry above. Answered from evidence, not
from reasoning: `debug/bs-debug.html`, an 11.7 MB save of the 2144-row
Springsteen artist-releasegroups page taken while other sub-tables were still
loading.

**What the snapshot says**, counted with
`scratchpad/analyse_bs.py`-style greps:

    table.tbl count: 47
    PAGE-WIDE: cover-art anchors = 2144, with a direct-child icon span = 2144
    occurrences of data-caa-enriched: 0

Two conclusions, and the second is the answer.

1. **My earlier guess is dead twice over.** All 2144 anchors carry
   `<span class="artwork-icon caa-icon">`, so `ctx.iconSel` and the plain
   `a[href$="/cover-art"]` scan find the *same* 2144. The selector was never
   the difference — which is what the reverted test had already failed to show.
2. **Not one anchor on the page had been enriched.** `data-caa-enriched`
   occurs zero times across 2144 anchors. So "21 pending" was *literally true*:
   nothing had been looked up, in that sub-table or any other.

**Why nothing had been looked up.** `initCaaPics()` Pass 2 enqueues every JSON
lookup BEHIND every image fetch on the page, and says so in its own comment —
"so that small icons and big-strip loads have priority in `_caaQueue`. Users
who start filtering immediately will see visual feedback before count badges
and multi-row art cells arrive." That is a deliberate and defensible choice.
Its consequence at this scale is not: 2144 entities at the archive's ~1.2 req/s
is roughly half an hour before the first *lookup* runs, during which every
table's summary reads "N pending" and never moves.

**So the defect was never a wrong number — it was a true number with no
context**, which is indistinguishable from a stuck one. The fix is
informational: the panel now shows the page-wide queue depth beside the pending
count and says lookups are queued behind the images. Mutation-covered
(`"pending" is shown with no explanation`).

**What was NOT changed, deliberately.** The Pass 1 / Pass 2 ordering stands.
Reversing it would make count badges appear before any picture did, on every
page, to improve one screen on the largest pages only — and PERFORMANCE.org has
no measurement for that trade. If it is ever revisited, the thing to measure is
time-to-first-painted-icon against time-to-first-count, not either alone.

**Method note worth keeping.** Three rounds on this one: a guess (reverted), a
test that passed against the buggy build (deleted), and then eleven megabytes of
saved HTML that answered it in one grep. The snapshot was cheaper than either
of the first two, and CLAUDE.md already said so — "Always read the relevant
`debug/*.html` before proposing any DOM fix". I proposed one first.

## 2026-09-20 — the summary opener walked out of its own control run

Reported live on `https://musicbrainz.org/artist/84c38d3a-…/releases` (BoDeans,
`artist-releases`, `tableMode: 'single'`): filtering from a 📊 column dropdown
left the 📊 artwork-summary button between the "Releases" heading text and the
row-count stat, while the rest of the artwork controls stayed together.

**Diagnosed from the saved DOM**, `debug/bd-filter-relocation-bug.html`, whose
h2 children read, in order:

    [mb-toggle-icon] "Releases" [summary-0] [row-count-stat]
    [caa-toggle-0] [caa-retry-0] [rel-retry-0] [mb-filter-container]

**Cause — an asymmetry, not a mystery.** `.mb-row-count-stat` is REMOVED AND
RE-CREATED every time the count changes, and re-inserted relative to the master
toggle or, on a single-table page, the filter container.
`_artCreateOrUpdateToggleButton()` copes because it re-derives its position
from the live stat on every call:

    const countStat = header.querySelector('.mb-row-count-stat');
    if (countStat) countStat.after(btn);          // runs even if btn existed

⟳ and 🔗⟳ chain off that. The summary opener was created once, inside
`_artCreateOrUpdateRetryButton()`'s "just created" branch, and bailed out on
every later call — so the run rebuilt itself around the new stat and left it
behind. **It is the only control in the run that does not re-derive its own
position**, which is exactly why it is the only one that moved.

**Fix.** `_artCreateSummaryButton()` re-anchors an existing button instead of
returning, and `_artCreateOrUpdateRetryButton()` calls it on BOTH paths —
before its own early return, not only after creating.

**Reproduced before fixing, which is the part worth recording.** The two
previous rounds on this feature were a guess and a test that passed against the
broken build. This time the committed disk fixture
`tests/fixtures/saved-data/artist-releases-bodeans.json.gz` turned out to be
*the very page reported* — `artist-releases`, single-table, 56 rows, every one
carrying a `/cover-art` anchor — so the bug reproduced offline in one run, and
the fix was verified against a failing test rather than against reasoning.

Two things that cost a cycle each:

- **`page.fill()` is not actionable on `#mb-global-filter-input` after a disk
  load.** The input is present, visible, enabled and 500x24, with no modal over
  it, and `fill` still waits until the test times out — the script re-asserts a
  🔍 focus prefix in it. `typeGlobalFilter()` (click, wait for the prefix to
  settle, then type) is the harness's own answer and works.
- **The assertion has to be on ORDER, not existence.** The button never
  disappeared during the bug, so any "is it there" check passed the whole time.

**Note on multi-table pages:** the per-table controls live in an `<h3>` that
carries no row-count stat, so the churn cannot reach them. That is why the
panel's own spec, which runs on `releasegroup-releases`, never saw this — and
why the new spec has to be single-table.

## 2026-09-20 — the automatic retry pass (item 7), and two tests that lied

`org/503-handling.org` item 7, on `feat/rel-auto-retry-failed`. The last item in
that file with any rate-limit risk, and the only one that makes the script fetch
without the user asking — so it is bounded on four independent axes, and any one
of them stopping it is enough: it starts only after the Phase-2 queue drains
plus 30 s; at most two passes per page; it does not start above 25 failures
(`sa_rel_auto_retry_max_failed`); and five CONSECUTIVE refusals abort it
mid-flight.

**The breaker needed no new mechanism.** `_relQueueStillWants()` is already
consulted before AND after the rate-slot wait, and returning `false` is already
how a superseded pass drains at microtask speed with no requests. A tripped
breaker is exactly that — a pass nobody wants any more — so the whole hook is
one line in a guard that already existed.

**Two tests that passed while proving nothing**, both caught rather than
shipped:

- **A second page load poisons the fixture via IndexedDB.** The first draft
  loaded the page, read the MBIDs, chose its victims and reloaded. The first
  load answered three entities before the reload and those went into the
  `rel-ws2` store — and **IDB survives a reload**, so on the second pass they
  were served from cache, never reached the route, and never failed. The test
  reported 9 failures where it expected 10 and looked like a breaker bug. Fixed
  by choosing the victims in the route on first sight, with no second load, and
  `sa_rels_idb_enable: false` on top: a cache that outlives a page load has no
  business in a test about what gets REQUESTED.
- **A fixed `waitForTimeout()` after the breaker trips bounds the request count
  by the WAIT, not by the pass.** At ~1.1 s per request a 4 s pause admits about
  four more, so an unguarded pass that would have spent thirty looked identical
  to an aborted one — and the mutation that removes the breaker's read from
  `_relQueueStillWants()` passed against it. Now the test settles the request
  log. **Mutation-testing found this one**, which is twice this week that a
  mutation refusing to fail was the more useful result.

**One honest gap.** No test here can tell consecutive counting from cumulative:
a retry pass only ever asks about entities that already failed, so either every
request in it fails or none does, and there is no interleaving to distinguish
the two. Recorded as `expect: "pass"` with what would cover it.

**Cost, measured and recorded rather than absorbed.** The spec is 324 s on
`NB-3641` (2026-09-20, `--workers=1`) — four times the previous slowest fixture
spec, and it takes the full suite from ~120 s to ~318 s. None of it is slow
code: it is the rate gate, paid twice, once to MAKE 10-12 entities fail during
setup (three attempts each) and again to retry them. Not shortened, because the
breaker's own threshold is 5 and a test that pins it needs more failures than
that. `tests/README.org` and `tests/MEASUREMENTS.org` now both say so, with the
host, so the next person reading the suite's wall clock knows which spec owns
the increase.

## 2026-09-20 — a resume cannot re-enter `startFetchingProcess()`: `isLoaded` reloads the page

`org/503-handling.org` item 5 ("↻ Load remaining pages") was designed before any
code, as that entry demanded. The design's feasibility argument rested on four
facts; three held, and the fourth was false in a way that only building it
showed.

**The false one.** *"The render tail is already re-entrant against a rendered
page — the critical error arm's own advice is 'repress the Show all button',
which is a second full pass over one."* The render halves really are re-entrant
(`renderFinalTable()`/`renderGroupedTable()` clear before inserting, and
`runFilter()` drives them on every keystroke). But a re-press is not a pass at
all:

```js
// Reload the page if a fetch process has already run to fix column-level
// filter unresponsiveness
if (isLoaded) {
    sessionStorage.setItem('mb_show_all_reload_pending', 'true');
    window.location.reload();
    return;
}
```

Nothing re-presses afterwards — init only clears the flag — so "repress the
button" means *reload, then press again*. The inference had been drawn from a
comment in an error arm rather than from the code that comment describes.

**How it presented.** The first five runs of
`tests/fixtures/resume-from-failed-page.spec.js` failed as a status line that
never settled, with the renderer blocked so hard that `page.evaluate()` itself
timed out and Playwright reported *"Target page, context or browser has been
closed"*. No console error, no page error, nothing in the trace: the reload was
racing the fixture's own route and the page never came back. Bisected with six
`console.log` markers through the setup — the last one to print was
`const activeBtn = e.target`, which bracketed it to a 350-line window, and the
reload block is in it.

**The fix, and its price.** `if (isLoaded && !_isResume)`. The exemption is not
free: the guard's stated reason is "column-level filter unresponsiveness" after
a second fetch — a 2026-05 workaround whose mechanism is not recorded anywhere,
so it cannot be reasoned about, only tested. The spec therefore filters a
COLUMN after a resume, asserts the rows narrow to exactly the matching count,
and clears it again. They do. A mutation in the other direction (dropping
`isLoaded &&` outright) is in `scripts/mutations/resume-from-failed-page.json`
too, so the reload for a genuine second press cannot be removed by accident.

**A second defect, found by reading and NOT yet reproduced.** The heading
pre-processing block is idempotent per function but not as a group.
`applyInsertH2()` guards itself with a `data-mb-injected-h2="1"` marker it
stamps and then queries for. `applyRenameH2ToH3()` runs *before* it, renames
**every** `<h2>` in the document, and copies all attributes onto the `<h3>` it
substitutes — so a second pass turns the injected `<h2 data-mb-injected-h2="1">`
into an `<h3 data-mb-injected-h2="1">`, the marker query finds nothing, and
another heading is injected beside the orphan. **18 pageTypes declare both
features** (every `*-tags` type plus `user-ratings`, `popular-tags`,
`reports-index`, `edit-types`, `instrument-list`, `privileged-accounts`,
`notes-received`). It is reachable today by pressing the button twice — which
is what the script tells the user to do after a critical error. Not on the
resume path (the resume skips the block), so it keeps its own entry in
`org/503-handling.org` and its own future branch.

**Smaller things the same build turned up**, each recorded because each is
invisible when wrong:

- The synthetic click event needs three members, not one.
  `startFetchingProcess()` reads `e.target` and then calls `e.preventDefault()`
  and `e.stopPropagation()`; a bare `{target}` throws on the second and aborts
  the resumed run before its first fetch.
- The loop's "this page is the page we are standing on, use `document`"
  shortcut must be disabled on a resume, or it re-extracts this script's own
  rendered table as page N. Reachable on a real page (standing on `?page=7`
  with page 5 failing), but not from the `artist-events` fixture, so it is an
  `expect: "pass"` entry in the mutation list rather than an untested claim.
- The column-filter inputs are `readonly` until a trusted interaction
  (anti-autofill hardening), so `locator.fill()` never applies —
  `columnFilterInput()` plus `click()` and `pressSequentially()` is the only
  route. Documented in `tests/support/filterSortAssertions.js`; rediscovered
  here as a 150 s timeout.

Seven tests, 1.4 min on `NB-3641`. Eleven mutations: nine `fail`, two recorded
`pass` with their reasons above.

## 2026-09-20 — the heading pre-processing defect: real mechanism, no visible symptom, and two wrong claims

Filed on 2026-09-20 while designing item 5, from reading alone, with the caveat
"found by reading, not yet reproduced in a browser". Reproducing it first was
the right call: the mechanism is real, but **two of the three things the note
asserted were wrong**, and the symptom is not what it predicted.

**What was right.** `applyInsertH2()` guards itself by stamping
`data-mb-injected-h2="1"` and querying `h2[data-mb-injected-h2="1"]`.
`applyRenameH2ToH3()` runs before it and renames every `<h2>`, copying all
attributes onto the `<h3>`. So a second pass demotes the anchor, the guard's
query misses, and a second heading is injected. Confirmed from the script's own
debug output on a real Save→Load round trip (`user-ratings` fixture):

```
[press]    applyRenameH2ToH3: renamed 7 <h2> element(s) to <h3>.
[press]    applyInsertH2: inserted <h2>"Ratings"</h2> after <div class="tabs">.
[diskload] disk-load: running DOM pre-processing (renameH2ToH3, insertH2, applyListToTable)
[diskload] applyRenameH2ToH3: renamed 1 <h2> element(s) to <h3>.     <- the anchor
[diskload] applyInsertH2: inserted <h2>"Ratings"</h2> after <div class="tabs">.  <- again
```

**Wrong claim 1: "reachable by pressing the button twice".** It is not. A second
press never reaches pre-processing — `startFetchingProcess()` answers it with
`window.location.reload()` long before the block, so the DOM is MusicBrainz's
own again and the first pass is the only pass. The note had inherited that
sentence from the *resume* investigation, where the reload was the whole
finding, and applied it to the opposite conclusion. The actual path is **Load
from Disk on an already-rendered page**: `_hydrateAndRenderFromSnapshotData()`
re-runs the block itself, gated on `features.listToTable`.

**Wrong claim 2: "18 pageTypes".** 18 declare `renameH2ToH3` + `insertH2`, but
the disk-load block is gated on `listToTable` too, and `notes-received` does not
declare it. **17** can reach it.

**The symptom is not a duplicate heading.** The first spec written against this
asserted counts — one marked anchor, no orphan `<h3>` — and **passed against
unfixed code**. That is why it was written before the fix. The net DOM really is
correct: `renderGroupedTable()`'s cleanup sweeps the demoted orphan, and the
freshly injected `<h2>` takes its place. What actually changes is ELEMENT
IDENTITY. Tagging the anchor with a token no production code knows about, then
doing the round trip:

```
{"markedTags":["H2"],"tokenBearers":[],"anchorIsSameElement":false}
```

The original element is gone from the document; the survivor is a different
node. So anything holding a reference to that anchor, or state on it, silently
loses both — it works today only because every consumer re-derives from the DOM
after the render.

**So this was a latent dependency on cleanup ordering, not a visible bug**, and
the fix is framed that way: both renamers now exclude
`h2:not([data-mb-injected-h2])`, which makes `applyInsertH2()`'s documented
guard actually work instead of being defeated and then covered for. No
user-visible change; the rendered result was already correct.

**The transferable lesson** is the one the original note's own caveat pointed
at. "Found by reading" was worth writing down, and worth *not* acting on until
reproduced: the reading got the mechanism right and the reachability, the
blast radius and the symptom all wrong. A count-based test would have shipped
green and proved nothing.

Spec: `tests/fixtures/preprocessing-group-idempotency.spec.js` (identity, plus a
counter-guard that native headings are still demoted). Mutations:
`scripts/mutations/preprocessing-group-idempotency.json` — 2 fail, 1 recorded
`pass` (`applyRenameH2ToH1` carries the identical hazard on `user-edits` /
`user-open-edits`, which have no driveable fixture).

## 2026-09-20 — a filter-proofness test that proved nothing, and the mutation that said so

Building the per-table `⚠⟳` controls (`org/503-handling.org`'s zone 4). The
property that matters is the one that design names as its own trap 2: the count
must come from SOURCE rows, because `runFilter()` REMOVES non-matching rows and
a control that hides itself at zero would vanish exactly when a filter excludes
the rows it is the only way back to.

So the spec filtered the table to nothing and asserted the counts were
unchanged. It passed. **It also passed against a build with the source-row walk
deliberately removed** — `scripts/mutation-check.py` reported
`expected fail, got pass`.

**Why.** Nothing recomputes those counts after a filter. The refresh is driven
by the enrich pass, which has long finished by the time anyone types. The
buttons were simply *stale*, and a stale correct number is indistinguishable
from a freshly-computed correct number by looking at it. Traced by logging the
refresh:

```
DIAGPT[load]          PTREFRESH caa
DIAGPT[load]          PTREFRESH caa
DIAGPT counts-before  ["⚠⟳ 6","⚠⟳ 1"]
DIAGPT counts-after   ["⚠⟳ 6","⚠⟳ 1"]      <- after the filter; no PTREFRESH between
```

**Two things follow, and only one of them is a code change.**

The staleness itself is benign and was left alone: the counts only change while
failures are being recorded, so there is nothing to recompute afterwards. An
intermediate attempt to "fix" it by hooking the refresh into the render path
(`_artCreateOrUpdateRetryButton`, once per table per render) did not make the
mutation fail either — that hook is not reached on a filter re-render — and it
was kept only because re-anchoring the controls after a render is worth doing on
its own terms.

What made the property testable was `__saTest.artRefreshPerTableFailed()`,
which runs the real function and bypasses only its 1 s throttle. With the
recompute forced, the mutation fails with the right message.

**The transferable part** is the shape of the mistake, not the API. The
assertion was about a value that nothing was recalculating, so it could only
ever observe inertia. CLAUDE.md already says "name the guarantee precisely, or
the test proves something adjacent" — this is the variant where the test proves
something *stationary*. Before asserting that X survives an event, check that
anything recomputes X in response to it; if not, the test measures nothing and
mutation-testing is what will say so.

## 2026-09-20 — the full-suite flake is not spec-specific

The existing note (2026-09-10) records
`tests/fixtures/release-tracks-ms-length-overflow.spec.js:174` as failing
"roughly 1 full-suite run in 3 and passes standalone every time". That is
accurate but reads as though ONE spec is flaky. It is not — the suite is, and
it picks a different victim each run.

Today's instance, on the `fix/summary-btn-height` merge gate:

| Run | Tree                                           | Result                   |
|-----|------------------------------------------------|--------------------------|
| 1   | `fix/summary-btn-height`                       | 412 passed, 0 failed     |
| 2   | merged `main` (same userscript + version bump) | 411 passed, **1 failed** |
| 3   | merged `main`, unchanged                       | 412 passed, 0 failed     |

The failure in run 2 was
`tests/fixtures/length-column-filter-colon-gap.spec.js:25` — a spec with no
connection to the change under test (a CSS selector list) and not the one the
older note names. It passed standalone immediately afterwards.

**Why this matters at a merge gate.** The skill says "do not push a red tree",
so a red run has to be explained rather than re-rolled. The evidence that
distinguishes flake from regression is not "it passes standalone" on its own —
that is true of a real load-order bug too. It is that *the identical userscript
had just run green*, and that the only delta between runs 1 and 2 was the
version bump and a changelog entry, neither of which the failing spec reads.
Establish that before re-running; re-running until green without it is how a
real regression gets shipped.

Both spec names are worth knowing, but the pattern to expect is "some spec,
about 1 run in 3", not "that spec".

### 2026-09-25 — the same pattern across the help/pill work, four victims deep

Six full-suite runs over one afternoon on `petri`, while the host was also
running mutation lists, probes and a live snapshot capture back to back:

| Arm                                  | Tests | Result                                       |
|--------------------------------------|-------|----------------------------------------------|
| `help-github-md`, run 1              |   585 | green                                        |
| `help-github-md`, run 2              |   587 | 1 failed — `rel-column-fetch-failure:210`    |
| `help-github-md`, run 3              |   587 | 1 failed — `uniq-drop-join-phrases:200`      |
| `main`, comparison arm               |   571 | green                                        |
| `help-github-md`, final              |   590 | green                                        |
| merged `main`, gate                  |   590 | 1 failed — `length-column-filter-colon-gap:25` |

**Four different victims now** — the two named above plus those two — and the
merge-gate instance reproduced the 2026-09-20 shape exactly: the identical
userscript had just run green on the branch, and `git diff` between the two
trees is **one line**, the `@version` comment. The changelog JSON, the deleted
WIP file and the regenerated `CONFIG_DEFAULTS.json` are the only other changes,
and none of them is read by any spec — that artifact's own header says nothing
in the userscript reads it.

Two things this adds to the earlier note:

- **`uniq-drop-join-phrases` is the interesting one.** Unlike the others it
  POLLS rather than sleeping — deliberately, because `waitForFilterSettled()`
  works exactly once on that grouped pageType — so "a fixed wait was too short"
  does not explain it. A poll timing out under load is a different mechanism
  from a sleep being too short, and it widens the family rather than fitting it.
- **Host state is a real term and was not controlled for here.** The
  2026-09-18 figures were taken on an idle box at 1 red in 3; this afternoon
  ran 3 red in 6 while the same machine was doing other Playwright work
  throughout. That is consistent with load sensitivity and is not evidence of
  anything else, but it is also not a clean measurement, and saying so is
  cheaper than someone later reading 3-in-6 as a regression.

## 2026-09-21 — every numeric setting is a string after the first SAVE, and four reads throw the value away

Reported from a real browser, which is the only place it was ever visible: the
Relationships auto-collapse threshold was set to `0` — documented, in
`configSchema` and in HELP, as "never auto-collapse" — and
`https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f/releases`
still rendered the column collapsed, its badge reading `0/1000`.

**Root cause, two layers deep.** VZ_MBLibrary's SAVE handler writes
`input.value` for every non-checkbox widget, and `input.value` is always a
string. It also iterates the whole `configSchema` rather than a dirty-set, so
the FIRST press of SAVE — even with nothing changed — writes all 38 numeric
settings to GM storage as strings, and `settingsInterface.init()` hands them
straight back on every later load without re-coercing.

`_relTableExpanded()` then reads:

```javascript
const _raw = Lib.settings.sa_rel_collapse_threshold;
const _thr = (typeof _raw === 'number' && _raw >= 0) ? _raw : 200;
_expanded = (_thr === 0) || (_relTableUniqueMbidCount(table) <= _thr);
```

`typeof "0"` is `'string'`, so `_thr` became 200, and `1000 <= 200` is false.
The arithmetic is exact and the screenshot confirmed both numbers.

**The part worth remembering.** That guard is not sloppy code — it is the
*documented correct fix* for the falsy-zero defect, and its own JSDoc explains
at length that it avoids `||` precisely because `0 || 200` is `200`. It traded
a falsy-zero bug for a wrong-type bug with the identical symptom for the
identical input. Three other reads share it: `_relAutoRetryMaxFailed()`,
`_showRelCompletionToast()`, `_showCaaCompletionToast()`.

**`_buildConfigJson()` already knew.** The config-export path has always
coerced `number` back with `Number()`, and its comment says why — "after a
RESET → SAVE cycle the settings dialog stores all values via input.value which
is always a string". Only the runtime read path never got the same treatment.

**Why no test caught it.** Every numeric seed under `tests/` is a real number —
98 of them, checked mechanically; not one string. So the post-SAVE state the
bug lives in was never exercised anywhere in the suite.

**Fixed** on `fix/settings-numeric-coercion` by coercing in
`_coerceNumericSettings()`, on READ rather than on save. Coercing on read is
what repairs profiles that are *already* stringified; a library-side save fix
would stop producing them but leave every existing user broken.

Three things that fix had to get right, each of which is a trap:

- **`Number('') === 0`.** Clearing a number field stores `''`, so naive
  coercion invents a deliberate-looking `0` — which for a threshold is exactly
  the documented "disable". Empty falls back to the schema default instead.
- **`sa_render_threshold || 5000` had to change in the same commit.** Before
  the coercion the stored `"0"` was *truthy*, survived the `||`, and then failed
  `"0" > 0` — so "0 to disable" worked **by accident**, and the `> 0` test just
  below it was dead code. Coercing to a real `0` alone would have made `||`
  swallow it, turning a fix into a regression. Same shape at
  `sa_chunked_render_threshold` in both renderers.
- **Absent keys stay absent**, for the `VZ_MBLibrary`-failed-to-load stub path
  where `Lib.settings` is `{}` and each consumer's own `?? default` must apply.

**Two things the tests cannot see, both recorded as `expect: "pass"` in
`scripts/mutations/settings-numeric-coercion.json` rather than left unsaid.**
The `"0"`-means-never case is not falsifiable on any committed fixture: the
largest shell has 12 distinct entities, so the broken fallback of 200 renders
it expanded and a correctly-honoured `0` renders it expanded too. Identical
outcome. It is pinned on the mechanism instead, through a new
`__saTest.numericSettings()` hook, while the user-visible half uses the string
`"2"` against those 12 entities — where broken gives expanded and fixed gives
collapsed. And the `||` → `??` change is unobservable on fixtures at all: the
two operators differ only when the value is `0` AND the row count exceeds the
hardcoded fallback, and every fixture here renders 12 rows.

**One mutation-testing lesson.** The empty-string mutation first failed by a
**91-second Playwright timeout** instead of an assertion, because the spec also
seeded `sa_max_page: '   '` and a page count of `0` stalls the fetch loop. A
mutation has to fail *legibly*, not merely fail — the seed was moved to
`sa_uniq_dropdown_visible_rows` and the same mutation now fails in 2 s with a
one-line value mismatch.

**Unrelated defect noticed in passing, not fixed here:**
`ShowAllEntityData_HELP.txt` still documents a "Sort progress threshold"
setting under ⚡ PERFORMANCE SETTINGS. `sa_sort_progress_threshold` was removed
from `configSchema` some time before 9.99.1129 (`grep -c` returns 0), so that
line documents a control that does not exist. It belongs with the
defaults-snapshot work in `org/config-handling.org`, which is meant to catch
exactly this kind of schema-vs-docs drift.

## 2026-09-21 — the Relationships retry control was anchored two different wrong ways (branch fix/rel-retry-anchor-and-pending-edits-highlight)

Reported live on `/artist/70248960-cb53-4ea4-943a-edb18f7d336f/works`
(`artist-works`, `tableMode: 'single'`): the Relationships column renders, but
there is no `#mb-rel-retry-0`. Snapshots:
`debug/artist-works-pending-edits-uncollapsed.html` and
`debug/artist-works-pending-edits-collapsed.html`, both captured 2026-09-21 at
9.99.1130 with the ⏳ pending-edits filter engaged (5 of 200 rows).

`_relRetryAnchorFor(tbl, i)` had two independent defects. The `_art` branch —
anchor on `#mb-caa-toggle-btn-retry-{i}` — masked both, because **every
`mb-rel-retry-{i}` in every saved snapshot in `debug/` was created by
`_artCreateOrUpdateRetryButton()`, not by this fallback**. The fallback had
essentially never produced a correctly placed control in its life.

**Defect 1 — the sibling walk cannot leave a wrapper.** The walk was
`tbl.previousElementSibling` in a loop. On this page the DOM is

```
div#content
  h2 "Works"                                   <- the heading
  script type="application/json"
  form action="/work/merge_queue?returnto=…"
    nav
    table.tbl.mergeable-table                  <- the table
```

so the walk sees `<nav>`, then `null`, and returns `null` from inside the
`<form>`. `_relCreateRetryButtons()`'s `if (sb && a) a.after(sb)` then discards
the button it had just built, and with it both `⚠⟳` controls, which anchor on
`#mb-rel-retry-{i}` / `#mb-rel-retry-0`.

This shape is not rare and was already on record: the 2026-07-01 entry at the
top of this file notes `report_dup.html` as `table class="tbl mergeable-table"`,
`wrapped in <form action="/artist/merge_queue" method="post">`. A structural
sweep of the committed `tests/snapshots/*/rendered.html` finds the same
wrapper-nesting on `artist-events` and `user-open-edits` (`<form>`) and on
`notes-received` (`div.edit-notes`) and `recording-fingerprints`
(`div.acoustid-fingerprints`) — those four carry no Relationships column, but
they are the same shape, which is what makes this a class rather than one page.

**Defect 2 — `button:last-of-type` is not "the heading's last button".** It
means *the first `<button>` in document order that is the last `<button>` among
ITS OWN parent's children*. On an `<h3>` carrying a sub-table filter that
resolves to the STF's own clear button, several levels down, so the control was
appended inside the filter's input wrapper. Measured on
`debug/right-flags-release-events.html` (place-performances "Madison Square
Garden", 2026-09-18), 4 of 5 sub-tables:

```
mb-rel-retry-0 -> span.mb-stf-input-wrap < span.mb-subtable-filter-wrapper
                  < span.mb-subtable-filter-container < h3.mb-toggle-h3
   siblings: [input#mb-stf-engineering_location_for_recording-input,
              button#mb-stf-engineering_location_for_recording-clear,
              button#mb-rel-retry-0]
mb-rel-retry-4 -> h3.mb-toggle-h3            <- the one sub-table WITH artwork
```

**Fix.** The heading is resolved with `caaFindHeaderForTable()` (document
order, wrapper-agnostic — the resolver `_artCreateOrUpdateToggleButton()` was
already using), and the insertion point with a new `_hdrCtlAnchor(header)`
querying `:scope >` only: the last existing run member
(`mb-caa-toggle-btn-*` / `mb-eaa-toggle-btn-*` / `mb-rel-retry-*`), else
`.mb-row-count-stat`, else `.mb-toggle-icon`, else `lastElementChild`. The
multi-table `<h2>` guard is unchanged — there the `<h2>` belongs to
`#mb-rel-retry-global`.

**Why no spec saw it.** `tests/fixtures/artist-works-attributes.html` renders
`<h2>Works</h2>` as a direct sibling of `<table class="tbl mergeable-table">`,
dropping the `<form>`; and `tests/fixtures/rel-retry-failed-only.spec.js`
asserts `#mb-rel-retry-0` EXISTS. On its `series-releases` shell with
`sa_enable_caa_pics: false` it did exist — buried inside `#mb-filter-container`
— and the spec was green throughout. The new spec asserts the PARENT ELEMENT.

## 2026-09-21 — the ⏳ pending-edits filter marked nothing, so collapsed cells hid their own matches

Same report, same two snapshots. With the ⏳ toggle engaged, 12
`.mb-cell-collapse-toggle` spans, **0** carrying `mb-collapse-toggle-has-match`,
and **0** `.mb-column-filter-highlight` anywhere on the page — while the in-table
`span.mp` markers sat at `<li>` index 1 and 2 of `td.mb-has-collapse-toggle`
cells (`ul.work-artists` and `ul.artist-roles`), i.e. exactly the hidden items
the tint exists to advertise.

Root cause is a property of the tint rather than of the filter:
`mb-collapse-toggle-has-match` is computed ONLY from `_COLLAPSE_MATCH_SEL`
spans found inside `lis.slice(1)`. A structural filter — one with no text to
type — writes no such span, so it gets no tint. `.mp` is a CSS-only orange
marker with no text of its own, `testRowMatch()` consults
`ctx.pendingEditsOnly` as a predicate and marks nothing, and a collapsed
"Authors" cell hiding a pending author was byte-identical to one with no
pending author at all.

The 📊 dropdown's `⏳ has pending edits` entry already did the right thing via
`_highlightPendingEditsMatch()`, for one column. The fix gives the row-level
toggle the same treatment: `_highlightRowPendingEdits(row)`, called from
`testRowMatch()`'s existing `if (finalHit && !matchOnly)` block, collects the
distinct `<td>`s holding a `span.mp` in one `querySelectorAll` and delegates to
that same helper. The class is therefore `mb-column-filter-highlight`, which is
already in `_COLLAPSE_MATCH_SEL`, already cleared by `testRowMatch()`'s own
reset and already unwrapped by `getCleanColumnText()` — so the cell toggle, the
per-sub-table `▤` button and the global collapse button all light up with no
further change, and no sort key, cached row text or filter key moves.

Considered and rejected: teaching the ~10 sites that spell out the four
highlight classes to additionally count `span.mp` in a hidden `<li>` while that
table's ⏳ toggle is engaged. It needs a per-table state lookup at every one of
them and still leaves the matched entity unmarked in the visible rows.

**One mutation-testing finding, from a prediction that was wrong.** The planted
defect "call the highlighter on the SOURCE rows too" was expected to fail, on
the reasoning that `testRowMatch()`'s highlight reset runs only on the
`!matchOnly` pass, so a marker written during the `matchOnly` pass lands on a
source row nothing ever cleans and comes back on the next render. The first two
steps hold; the last does not. That reset strips
`.mb-column-filter-highlight` from the CLONE **unconditionally**, so however
dirty a source row is, the rendered row is clean — and `getCleanColumnText()`
unwraps the spans, so the row's text is unaffected too. Source-row pollution
here is invisible to every DOM assertion. The real reason to keep the call
inside the `!matchOnly` block is COST: the `matchOnly` pass runs over every
source row, not just the survivors. Recorded as an `expect: "pass"` in
`scripts/mutations/pending-edits-collapsed-cell.json` rather than deleted,
because the wrong half of the reasoning is the part worth keeping.

## 2026-09-21 — the retry control was offered on sub-tables with no Relationships column (same branch)

Reported after the anchoring fix above landed, on
`/place/a727b970-8ea0-4f75-abc8-db131f72aecb/performances`
(`place-performances`, `tableMode: 'multi'`, 5 sub-tables): the first four each
show a `🔗⟳` although they have no Relationships column at all. Only the fifth,
"Recording location for release", legitimately has one.
Snapshot: `debug/place-performances-bug.html`, all sub-tables uncollapsed.

Measured from it:

```
 [0] relCells=   0  relTh=0  btn=mb-rel-retry-0     Engineering location for recording
 [1] relCells=   0  relTh=0  btn=mb-rel-retry-1     Producing location for recording
 [2] relCells=   0  relTh=0  btn=mb-rel-retry-2     Recording location for recording
 [3] relCells=   0  relTh=0  btn=mb-rel-retry-3     Shooting location for recording
 [4] relCells=  16  relTh=1  btn=mb-rel-retry-4     Recording location for release
```

`place-performances` groups by RELATIONSHIP TYPE, not by entity kind, so one
page mixes recording-targeted sub-tables with release-targeted ones.
`_suppressRelationshipsIfNoReleaseOrReleaseGroupLinks()` correctly strips the
`<th>` and every `.mb-rel-cell` from the first four. **Both sites that create a
per-table `🔗⟳` then asked the PAGE-wide question** —
`_relCreateRetryButtons()` gated on `_relPageHasColumn()`, and
`_artCreateOrUpdateRetryButton()`'s block on `activeInjectedColumns.length` —
so all five got one.

**This is older than the anchoring fix, and the anchoring fix is what made it
visible.** `debug/right-flags-release-events.html` (2026-09-18) is the same page
one version earlier, with the same four strays — but
`_relRetryAnchorFor()`'s `button:last-of-type` anchor had buried each of them
inside `span.mb-stf-input-wrap`, next to the sub-table filter's ✗ clear button,
where nobody noticed them. Placing the control where it belongs is what put a
`🔗⟳` visibly beside four section headings that have nothing to retry.

Fix: `_relTableHasColumn(table)`, used at both sites, plus a sweep beside the
loop for a stray the loop's own `return` cannot reach. **The `<thead>` arm is
the load-bearing one**: `runFilter()` REMOVES non-matching rows, so a
`tbody td.mb-rel-cell` test alone would report "no column" for any sub-table a
filter has narrowed to nothing — and since neither caller re-runs on a
keystroke, the button would go and not come back. The `<th>` is what the
suppression actually removes, it carries `data-col-name` (unlike Picard's), and
`runFilter()` never touches the `<thead>`.

**Two mutation-testing findings.** First, the loop guard and the sweep COVER FOR
EACH OTHER on any committed fixture — removing either alone leaves the spec
green, and only removing both reproduces the defect. Recorded as one combined
`expect: "fail"` plus two `expect: "pass"` singles in
`scripts/mutations/rel-retry-anchor-placement.json`, so a future tidy-up of
either has to fail the combined entry rather than find a passing suite. Second,
the first attempt at the "sweep is not restricted to the numeric id form"
mutation relaxed `(\d+)` to `(\d*)`, which changes nothing —
`mb-rel-retry-global` still fails to match, because `global` is not digits
followed by end-of-string. `(.*)` is the mutation that bites: `Number('global')`
is `NaN`, `_tbls[NaN]` is `undefined`, and the sweep deletes the page-wide
controls.

**A fixture note worth keeping.** `place-performances` does NOT group by
`<h3>` + `<table>` pairs. That shape is gated on
`features.listToTable`/`groupByH3`; this pageType has neither, and its sections
are `<tr class="subh">` rows inside ONE `<table class="tbl">`.
`startFetchingProcess()`'s generic branch takes the subh `<th>`'s text as the
raw group name and appends the entity type read from the first following data
row's main-column link — so `"Recording location for"` plus a `/release/` link
becomes `"Recording location for release"`. The first attempt at
`tests/fixtures/place-performances-mixed-sections.html` used two `<h3>`
sections and rendered as a single unnamed group ("Unknown (2)"), which is how
this was found.

## 2026-09-21 — one join phrase missing, and a 📊 badge that disagreed with its own result

Reported on `https://musicbrainz.org/work/bcd490e5-dac7-3b8a-b423-ae17e1209f3d`
(`work-recordings`), tracked in
`org/uvd-filtering-join-phrases-missing-bug.org`. Two independent defects that
happened to meet on the same panel. Read from three snapshots captured on the
final rendered page: `debug/work-ComeTogether-final-filtered.html` (Artist
filtered to "bruce"), `…-uvd.html` (with the panel open) and
`…-uvd-filtered.html` (after picking "join phrase: with").

**Bug A — `<span class="mp">` hid a join phrase.** Row 46 of the first
snapshot is, verbatim:

```html
<bdi><span class="mp"><a href="/artist/eeb1195b-…">Guns N’ Roses</a></span> feat. <a href="/artist/70248960-…">Bruce Springsteen</a></bdi>
```

`_findCellJoinPhrases()` accepted an entity boundary only as a DIRECT CHILD of
the `<bdi>` — a bare `<a>`, or a `span.name-variation` wrapping exactly one.
MusicBrainz's own native open-edits marker is neither, so that `<bdi>` reported
ONE entity, `entityIdx.length < 2` short-circuited, and `" feat. "` did not
exist anywhere: no 📊 entry, no `joinphrase:` filter, no highlight.

**The diagnosis came from what the same cell DID offer.** `…-uvd.html` shows
"» artist name: Guns N’ Roses" present with count (1). `_findCellEntityRefs()`
resolves its governing `<bdi>` with `a.closest('bdi')` and walks through the
wrapper transparently — it has done since the `.mp` work recorded above. So the
two finders disagreed about where an entity boundary is in one cell, and the
fix is to make the boundary structural rather than a list of wrapper classes:
nearest common ancestor of each consecutive anchor pair, then each anchor's own
highest ancestor below it. `tests/fixtures/entity-refs-mp-wrapper.spec.js` now
pins the agreement on its existing `#qb-cell`.

The nearest-common-ancestor form is not decoration over "walk up to the
`<bdi>`". The latter handles `.mp`, `.name-variation` and both nesting orders,
but collapses `<span class="mp"><a>A</a> feat. <a>B</a></span>` — one wrapper
around both anchors — to a single host and drops the phrase. Fixture row H is
the only guard on that half, and the mutation list records it as such.

**An adjacent defect the fix made reachable.** MusicBrainz nests each entity's
own `<span class="comment">` INSIDE the shared `<bdi>`, so the nodes between
two anchors are routinely `[ " ", <span class="comment">, " & " ]` — three
nodes for a one-character phrase. The highlight anchor was "the first text node
in the slice", i.e. the non-breaking space in front of the PREVIOUS entity's
comment. It now prefers a text node that carries text. Pinned by fixture row J,
which is `#qb-cell`'s shape.

**Bug B — the badge counted one thing and the click did another.** With Artist
typed-filtered to "bruce" (7 rows) the panel offered `(3) » join phrase: with`;
clicking it produced 9. `…-uvd-filtered.html` shows the end state:
`data-mb-uniq-values="[&quot;\u0003joinphrase:with&quot;]"` with the typed
"bruce" gone. A column filter input was architecturally EITHER typed text OR a
checkbox value set — `applyUniqValueSet()` overwrote `input.value` and
`getColFilters()` returned one descriptor shape or the other — while
`openUniqDrop()` collects its counts from the rows currently VISIBLE. So the
badge answered "…and" and the filter answered "…instead".

The fix needed no new matching machinery: the typed text is stashed on
`input.dataset.mbUniqTypedText` at the transition into value-set mode, and
`getColFilters()` emits a SECOND, plain descriptor for the same column index.
`testRowMatch()`'s own `for (const f of colFilters)` loop AND's them and breaks
on the first miss; both highlight loops iterate the same array, so the typed
text keeps its mark; and `_buildFilterKey()`/`_buildIncrPartialKey()` map over
it, so the stash enters both cache keys with no new field. **Anything new that
indexes `colFilters` by column must stop assuming one entry per column** — that
is the one invariant this change breaks, and it is recorded in
`getColFilters()`'s own JSDoc.

**The risk in the stash is that it is invisible**, so every clear path now goes
through one `_clearColFilterValueSet()`. `mbUniqValues` alone was forgiving
about a missed site — `getColFilters()`'s empty-field early return deletes it —
but that return is unreachable while the input displays a summary label.
`clearAllFilters()` turned out to have been relying on exactly that self-heal.

**A test note that cost a run.** This pageType's tbody is led by a
`<tr class="subh">`, so it renders GROUPED, and on a grouped render
`#mb-filter-status-display` only ever reports the GLOBAL filter. It reads
"✓ Global filter" from the first column-filter change onward and never changes
again, so `waitForFilterSettled()` works exactly once per test and then times
out on a baseline identical to its last read. `uniq-drop-join-phrases.spec.js`
polls the visible row set for a KNOWN value instead — which also refuses to
accept a trigger that silently did nothing, the way a stability-based wait
would.

## 2026-09-21 — arm E folded back: 156 h not 432 h, an unpredicted slow window, and a boot whose clock started at 16 h

`org/TODO.org` asked for the arm-E cron results (worktree
`saed-perf-9.99.1049-arm-e`, 2026-09-09 to 2026-09-21) to be analysed, folded
into `tests/MEASUREMENTS.org` and the worktree cleaned up. Everything
quantitative is in that file's "Arm E results" section; this entry keeps only
what a future session needs to avoid re-deriving.

**Headline.** 21 samples, two boots, longest uptime 156 h — not the 18 days
planned. 18 of 21 sit at the reboot floor (global filter median 2176) with no
drift against uptime (boot 2 alone: every metric within ±1.2%/day, smallest
p 0.12). Three consecutive samples (2026-09-11 05:00 to 2026-09-12 05:00 UTC,
43-68 h of uptime) were 1.45-1.98x slower — the size of the 2026-09-07/08
state, arm C — and the box recovered by itself with no reboot. That is the
result no pre-registered reading anticipated, and it breaks "cleared only by a
reboot". The one Claude Code session in the window (2026-09-10 12:53-21:06 UTC)
ends 7 h 54 min before the first slow sample; two episodes, n=2, no mechanism.
The 18-day uptime case is still untested.

**The mid-run reboot was a VM shutdown, and the journal is the witness.**
`journalctl --list-boots`: boot 1 ended 2026-09-15 03:43 CEST after 136.35 h,
boot 2 began 23:15:43 CEST, so both 2026-09-15 slots simply did not exist.
Nothing in the run's own artefacts said so — `arm-e-runs.log` has no line for a
slot that never ran.

**`/proc/uptime` can be tens of hours ahead of the kernel's own start.** Boot
2's first journal line already carries a monotonic timestamp of 58 899 s
(16.36 h); realtime and monotonic then advance together to the end of the boot.
The logged `uptimeHours` (24.1 ... 156.1) is therefore 16.36 h more than time
since the kernel started, by a constant. Cause not found. `runMetadata.js`
reads `os.uptime()`, the same source, and `claudeSinceBoot()` derives its boot
epoch from it, so the harness's own `machine` block is exposed to this too —
worth cross-checking against the journal whenever a claim rests on uptime.

**Data-recovery trap.** The pinned wrapper committed a JSON that the next run
overwrote (`interaction-perf-arm-e-<slot>.json`), so the 21 sets of medians
existed only as branch history; they were read with `git show <sha>:<path>` per
capture commit. The pinned 9.99.1049 harness also predates the `machine` block,
so hostname and start times came from the cron log. If this arm is ever re-run,
use the current harness and the filename convention (version, date, host).

**Cleanup done.** `crontab -r` (the crontab held only the `PATH=` line and the
two arm-E jobs), `git worktree remove --force`, `git branch -D
measure/9.99.1049-arm-e` (never pushed; tip `c17a8b4`). `pgrep -x claude`
matched this session's own PID beforehand, so the gate's process name was still
right. No `// @version` bump or changelog entry: nothing under the userscript
changed.

## 2026-09-21 — config import destroys the five editable lookup tables (branch fix/config-import-tables)

`org/config-handling.org` F3, Item 3. Read off the code at 9.99.1135.

**The chain.** `_loadSettingsConfig()` skipped only `type: 'divider'` and ran
every other value through `String(value)`. The five `type: 'table'` settings are
row ARRAYS, so `[['discogs','discogs']]` was stored as the string
`"discogs,discogs"`. `Lib.getTableRows()` (VZ_MBLibrary's public-API block) is
`Array.isArray(rows) ? rows : (defaultRows || [])`, so all three lazy seeders —
`_loadDefaultHiddenColumnsMap()`, `_initRelMappings()`'s `_loadMap()` and
`_loadUnicodeCharsMappings()` — saw an empty list and refilled from their
built-in defaults. **Importing a config file therefore discarded every
hand-entered row** in Default Hidden Columns, the three Relationships icon
tables and the Unicode picker, while the summary dialog counted them as applied.

Nothing crashed and nothing warned. The loss is invisible at import time and
surfaces a whole page load later as tables quietly back at their defaults —
which is why this shipped in 9.99.273 and survived until now.

**`type: 'function'` was wrong at both ends.** `sa_fn_edit_pinned_filter_list`'s
`default:` is the internal method name `_openEditPinnedFilterListFromSettings`,
resolved through the `functionRegistry` the library's `showModal()` takes.
`_buildConfigJson()` exported it and `_loadSettingsConfig()` wrote it back into
GM storage as if it were a user value. VZ_MBLibrary's own
save/snapshot/reset loops all skip `['divider','function','table']`; this
consumer's two loops skipped only `divider`.

**The fix.** `_applyConfigSettings(settingsObj)` is split out of
`_loadSettingsConfig()` — same decisions, no dialog and no `location.reload()`.
It skips `function` alongside `divider`, stores a `table` value verbatim when
`Array.isArray()` and counts a non-array `invalid` rather than stringifying it.
`_buildConfigJson()` skips `function` and omits a table with no stored rows.
Tables keep being exported: arrays round-trip through JSON correctly, and those
rows are the most valuable thing in the file.

**Two things learned while making this testable, both non-obvious.**

- **`_buildConfigJson()` reads `Lib.settings`, which is a snapshot.**
  `settingsInterface.init()` populates it once at library construction, so a
  `GM_setValue` made mid-session is invisible to the export. On a fresh profile
  all five table keys are therefore `undefined` at export time *even after* the
  lazy seeders have written them, because the seeders run after `init()`. That
  is what forces the spec's two page loads: seed with `GM_setValue` on load #1,
  let `init()` pick it up on load #2.
- **`settingsOverride` cannot be used to seed a two-load test.**
  `loadUserscriptPage()` registers it through `context.addInitScript()`, which
  re-runs on EVERY navigation in the context — so it would re-seed the pristine
  table over whatever the import had just written, hiding the exact defect under
  test. Not a harness bug; worth knowing before reaching for it.

The user-visible assertion works inside load #2 because
`_seedDefaultHiddenColumnsForPageType()` runs from the render tail (two call
sites, both after the fetch) and calls `_loadDefaultHiddenColumnsMap()`
unconditionally, reading GM storage LIVE rather than the `Lib.settings`
snapshot. So the "Show all" click has to come *after* the import, not before.

**Coverage.** `tests/fixtures/config-import-export.spec.js` (7 tests, ~11 s) —
the feature's first, 3 years after it shipped. Mutation list
`scripts/mutations/config-import-tables.json`, 7 entries, all as predicted: the
original defect fails both the mechanism test and the user-visible one (kept as
two entries so the consequence is recorded, not just the mechanism), and two
honest `expect: "pass"` entries — the unseeded-table `continue` (JSON.stringify
drops an `undefined` property anyway, so the emitted file is byte-identical) and
the coercion arms' order (the four type tests are mutually exclusive).

Two hooks were added to `__saTest`: `buildConfigJson()` (read-only) and
`applyConfigSettings()` (writes). Neither half of this feature has a surface a
fixture can drive — the export hands a Blob to the browser as a download, the
import reads a `File` from a hidden input inside the library's modal and ends in
`location.reload()`. The block's header comment said "read-only introspection
surface"; it now says which members are not, and why.

## 2026-09-22 — the OTHER half of F3: the export read a stale snapshot (same branch)

Found by the user in a real browser, hours after the entry above was written,
doing exactly the hand-check that entry's own coverage note could not do: add a
symbol in the Unicode picker's table editor, 💾 Save configuration, 📂 Load
configuration — **and the symbol was gone.**

**The import was faithful. The file never had the symbol.**

`_buildConfigJson()` read `Lib.settings[key]`. VZ_MBLibrary populates
`settingsInterface.values` exactly once, in `settingsInterface.init()`, during
construction. Its settings dialog can live with that because its SAVE ends in
`location.reload()` — but the TABLE EDITOR's own 💾 Save
(`_openTableEditor()`'s footer button, `lib/VZ_MBLibrary.user.js`) does
`GM_setValue(key, rows)` and then sets its label to "✓ Saved". It updates
neither `settingsInterface.values` nor the page. So for the five
`type: 'table'` keys, and only for those, `Lib.settings` is stale for the rest
of the session.

The full chain: edit → GM storage has the new row, `Lib.settings` does not →
💾 export writes the PRE-EDIT rows → 📂 import faithfully restores them over
the good ones → reload → the row is gone. Same destruction as F3, arriving from
the opposite end, and the fixed import is what carried it out.

**The evidence that identified it, before reading any code.** The user's
summary dialog said `Applied: 237 settings / Skipped: 1 key`. The wording is
the new one, so the fixed import was running; 237 + 1 = 238 keys, i.e. the file
held every setting including the five tables. So the tables were in the file
and were applied — which rules out the import and points at what was IN them.

**The fix.** `_configLiveTableRows(key)` reads GM storage directly, and the
export's `table` arm calls it instead of using `Lib.settings`. Only these five
keys need it: `grep -oE "GM_setValue\(\s*'(sa_[a-z0-9_]+)'"` over the userscript
returns `sa_default_hidden_columns` and `sa_unicode_char_picker_mappings` and
nothing else, plus `_initRelMappings()`'s `_loadMap()` writing its three through
a variable key. Every other configSchema key is written only by the library's
SAVE, which reloads.

An empty array is reported as "nothing stored". Every seeder reads an empty
list as "refill from the built-ins", so `[]` cannot survive a reload and is a
state the file format cannot honestly promise; exporting it would actively
empty the destination's table on import, while omitting the key leaves the
destination's own rows alone.

**What this says about the previous entry, which is the part worth keeping.**
That entry *documented this mechanism* — "`_buildConfigJson()` reads
`Lib.settings`, which is a snapshot … a `GM_setValue` made mid-session is
invisible to the export" — and filed it under *two things learned while making
this testable*. It was written up as a constraint on the SPEC (hence the two
page loads) and never once as a fact about the FEATURE. The spec's own
`seedTablesAndReload()` reloads before exporting, which is precisely the step
that made every test agree with the buggy code.

So the bug was not missed for lack of information; it was in the notes, in the
right words, pointed the wrong way. A sentence that begins "the export cannot
see a mid-session write" is a user-facing defect whatever else it is also true
of. Worth asking, next time a test needs an unexpected step to pass: *is that
step compensating for something the user cannot do?* Here the user cannot
reload between editing a table and exporting — the buttons are in the same
dialog.

**Coverage.** Two tests added to
`tests/fixtures/config-import-export.spec.js` (8 total): the mid-session edit
reproduces the report end to end, and the "nothing stored" test now covers both
a deleted key and an explicitly empty one — the deleted half cannot see the
`length > 0` guard, since `GM_getValue` returns `undefined` there and fails
`Array.isArray` either way. Mutation list now 8 entries, all as predicted; the
old "unseeded-table drop" entry was removed rather than repaired, its anchor
and its premise having both been replaced by the live read.

## 2026-09-22 — F4: the 15 inline fallbacks that disagreed with their own default (branch fix/config-fallback-drift)

`org/config-handling.org` F4, the branch Item 4 was built to make possible.
The audit named the sites; this fixed them.

**The direction was settled by git, not by taste.** `bfb8ac3` ("adjust
configuration setting defaults to sensible values", 2026-08-17) contains
`default: 8` → `default: 30` on `sa_uniq_dropdown_visible_rows`, and left
`Number(Lib.settings.sa_uniq_dropdown_visible_rows) || 8` untouched about
10 000 lines away. So the schema default is the deliberate value and the inline
literal is what that commit missed — every one of the 15 was fixed by moving
the LITERAL. Worth checking that way round before any similar sweep: the
opposite conclusion would have quietly reverted seven deliberate decisions.

**The drift was almost entirely inert, and saying so is the important part.**
`settingsInterface.init()` writes `GM_getValue(key, schema.default)` into
`Lib.settings` for every schema key, so `Lib.settings.sa_X` is never `undefined`
in normal operation and the `||` never fires. It fires in exactly two places:
a FALSY stored value (a colour field the user cleared and saved, or a `0`), and
the stub path where the `VZ_MBLibrary` `@require` failed and `Lib.settings` is
`{}`. Nobody's colours were wrong. The changelog entry says so explicitly,
because "15 wrong colours fixed" would have been a much better story and a
false one.

**The user-visible half was the descriptions, not the literals.** Four
statements in the settings dialog were false: `sa_ui_h3_bg` said "Default is a
light green" while `#f7dfdf` is a pale rose (`#f0fff4`, the inline fallback, IS
a light green — the description was written against it); both hover settings
claimed "the original MusicBrainz light grey (#f9f9f9)" while their defaults
are oranges; both non-hover settings promised "the existing grey hover
background is preserved", already falsified by those orange hover defaults. A
fifth, `sa_ui_thead_th_bg`, claimed its default "matches the original
MusicBrainz grey", which stopped being true at `#bababa`.

A scripted check comparing NAMED hex colours finds only two of them. The others
contradict in prose. That is the same wall `--docs` hit from the other side, and
it is why F4's hand-written "four descriptions" was right where a script said
two.

**One design change the fix forced, in the audit rather than the userscript.**
The snapshot records `_meta.script_version`, so a release bump makes it stale —
and `merge-push-remove` bumps the version during its fold, AFTER the audit has
run. Left alone, the gate would be red after every merge, for a file whose
content is entirely correct: the exact state in which a gate gets regenerated
blindly and stops being read. A version-only difference is now a NOTE with an
exit code of 0, while every difference that is actually about the schema —
a default, a label, a table seed, a count in `_meta` — still fails.
`check-config-defaults-gate.py` gained an arm asserting the NOTE path does NOT
fail, and one asserting a rename DOES.

**Coverage.** `tests/fixtures/settings-fallback-matches-default.spec.js`
(3 tests) pins the half a person could see: a cleared colour renders the schema
default, an unset one still does, and a colour the user chose beats both. That
third test is the one that catches the plausible wrong fix — hardcoding
`#bababa` and dropping the setting read entirely, which both other tests would
happily pass. Mutation list `scripts/mutations/config-fallback-drift.json`,
4 entries, one an honest `expect: "pass"`: reverting the literal cannot change
what an UNSET setting renders, and that pass is what pins the "when does the
fallback actually fire" reasoning above.

The other 14 sites are not covered by Playwright and should not be. The
guarantee is about all 165, and `scripts/audit-config-defaults.py` checks it
mechanically; its baseline is now empty.

## 2026-09-22 — one SAVE froze every setting for ever (branch fix/settings-dirty-set-and-migration)

org/config-handling.org F1, the finding that file recorded and declined to fix.
VZ_MBLibrary's settings dialog wrote EVERY key it rendered on every SAVE,
whether or not anything had changed, and `settingsInterface.init()` reads
`GM_getValue(key, configSchema[key].default)` — so a stored value shadows the
schema permanently. The first SAVE a user ever pressed, having changed nothing,
froze all ~232 settings into their profile, and every default shipped
afterwards was invisible to them.

**The org file said five settings were stuck. It is ten, and the reason the
count was wrong is worth keeping.** F1 measured by diffing the schema at
9.99.746 against 9.99.1129 — two points, not a history. A setting ADDED after
746 whose default then changed before 1129 reads as "added" to an endpoint
diff, so its frozen old value is invisible. Three of `bfb8ac3`'s seven are
exactly that shape, including `sa_uniq_dropdown_visible_rows`, which is F4's
own worked example. Two more (`sa_auto_resize_columns_threshold`,
`sa_ui_row_hover_bg`) changed before 746 entirely and were outside the window.

`scripts/dump-default-history.py` replays all 591 revisions of the userscript,
parses `configSchema` at each with `dump-config-defaults.py`'s own parser and
diffs the `default:` values. 12 changes, 10 settings whose current default is
not the only one they ever had, and **4 keys that were in the schema once and
are gone now** — `sa_area_flag_region_countries`,
`sa_ui_download_notification_font_size`, `sa_ui_h2_artist_rgs_global_bg` and
`sa_sort_progress_threshold`. That last one is the setting HELP was still
documenting after it was removed: the doc and the storage went stale from the
same deletion, and were found six weeks apart, from opposite directions.
`GM_listValues` is not granted, so nothing in the codebase could have
enumerated the strays — only git could.

**The fix is in two places because the two halves reach users on different
days.** `lib/VZ_MBLibrary.user.js` 4.1.0 makes SAVE a dirty set — a value equal
to its schema default is deleted, not written — which stops NEW profiles
freezing, and reaches nobody until the publish mirror is republished (F6). The
repair of profiles that are already frozen is consumer-side, in
`_migrateFrozenSettings()`, which ships with the userscript. That is the same
split `_coerceNumericSettings()` made for F2, and its JSDoc gives the reason
verbatim: a save-side fix "would leave every already-saved profile broken for
good".

**`GM_deleteValue` is feature-detected, and that is not defensive
programming.** A `@require`d library runs in the CONSUMER's sandbox with the
consumer's grants. ShowAllEntityData grants `GM_deleteValue`; MB_PageEnhancer,
which uses the same schema mechanism, does not. Calling it there would throw
inside SAVE and lose the user's edits outright, so an ungranted consumer falls
back to `GM_setValue` — to exactly its pre-4.1.0 behaviour, not to a
half-applied dirty set.

**Three passes, and the third is the one that actually fixes F1.** Adopting the
ten retired defaults repairs what has already drifted. Pruning every key that
already equals its CURRENT default changes nothing observable — `init()` falls
back to the same value — and is what makes the NEXT default flip reach these
users without waiting for another SAVE. Its cost, stated rather than hidden: a
value deliberately chosen that happens to equal today's default stops being
pinned. Storage holds values, never intentions, and the two are already
indistinguishable in effect today.

**Everything removed is written to one backup key first.** This is a mass
deletion of somebody else's configuration, and the backup is what makes it
defensible rather than merely well-intentioned; ↩︎ Undo in the notice restores
it and deliberately does NOT reset the migration level, or the next page load
would undo the user's undo.

**The importer was a back door into the same bug.** The exported config file is
a FULL DUMP of all ~232 importable keys, so one 📂 Load configuration re-froze
every setting the migration had just freed, and reported a clean success.
`_applyConfigSettings()` now applies the same dirty-set rule.

### Two things the test harness had to learn

**A seeded setting looks exactly like a frozen one.** Four call sites in
`collapse-column-width-stable-on-sort.spec.js` seed `sa_auto_resize_columns:
false`, which IS a retired default — the migration would have deleted the seed
and handed the spec today's value, so the test would measure the opposite of
what it asked for. `loadPage.js` now seeds the migration level far above
anything the script will ship, and `settings-migration.spec.js` is the one file
that opts back in. The mutation list records that as an honest `expect: "pass"`:
the spec that exercises the migration cannot see the harness setting at all,
because it overrides it.

**One pre-existing assertion was made false BY DESIGN, and that is the right
kind of failure.** `config-import-export.spec.js`'s "non-table settings import
exactly as they did before" imported `sa_enable_barcode_highlight: 'true'` —
which is that setting's own default, so the importer now clears it instead of
storing `true`. Changed to `'false'`, with the reason written next to it. The
test is about the coercion table; keeping its values clear of the prune rule is
what keeps it about that.

### Coverage

`tests/fixtures/settings-migration.spec.js`, 18 tests across four groups (the
migration, its notice, the library's dirty-set SAVE, the importer). Mutation
list `scripts/mutations/settings-migration.json`, 16 entries, 13 failing as
planted and **three honest `expect: "pass"`**:

- the notice's DOM-side empty-`adopted` guard — with the writer's guard intact
  there is no record to render, so removing the renderer's is unobservable.
  Found BY the mutation check: the first version of that test asserted only the
  DOM, and the writer-side mutation passed. It now asserts the stored record
  too, which is what survives to the next page load.
- the importer's `type !== 'table'` arm — fully redundant with `'default' in
  schemaCfg` beside it (the five tables carry no default at all), and with both
  removed a row array is compared against `undefined`, where
  `String([['a','b']]) === 'undefined'` is false, so it is stored anyway. The
  guard stays: a row array surviving because of how `String()` renders
  `undefined` is not a property anyone should have to re-derive, and F3 is what
  happens when the tables lose their special case.
- the harness's pre-applied level, above.

`scripts/mutation-check.py` gained an optional per-entry `file`, so the library
and the harness can be mutated too — each target gets its own backup and its
own SHA-256 check. The library's settings code has no test harness of its own;
this is the only place it is exercised against a real schema.

`scripts/audit-config-defaults.py` gained Stage 3: the migration table must
match the git-derived history in BOTH directions. A missing entry leaves a
frozen profile frozen; an INVENTED one silently overwrites a value the user may
have chosen on purpose, which is why both fail. It does not re-walk git (~26 s;
a gate nobody waits for is a gate nobody runs) — it compares the history file's
`current` block against the snapshot Stage 1 has just verified, which catches
the only case that matters: a default that moved since the last refresh.
`check-config-defaults-gate.py` is up to 11 arms, all correct.

## 2026-09-23 — the settings dialog had six frictions and no tests (branch fix/settings-dialog-friction)

org/config-handling.org F5, plus the MB_PageEnhancer grant F1 left behind.
Seven frictions were recorded there by READING `showModal()`; six are fixed
here and the seventh (what the exported file leaves out) is a file-format
change with its own branch. **None of them produced an error message, and one
produced no visible symptom at all**, which is why a dialog opened daily had
gone years without any of this being filed.

**The dialog had NO test coverage whatsoever** — 238 settings, ~1200 lines,
and the only thing any spec had ever done with it was avoid it. That is now
`tests/fixtures/settings-dialog.spec.js`, 22 tests, driving the REAL library
against ShowAllEntityData's own schema.

### The entry-point bug, and why a convenient test would have missed it

`setupMenus()` registers two ways in — the Tampermonkey menu command and a
link in MusicBrainz's own *Editing* menu — and both called
`settingsInterface.showModal()` with no arguments, while this script's toolbar
button called `Lib.showSettings({functionRegistry})` after arming a
MutationObserver. So via those two routes the 💾/📂 buttons were never injected
and the 🔧 *Edit Pinned Filter List* button rendered and did nothing.

The fix is `settingsInterface.configure({functionRegistry, beforeOpen})`,
registered once by `_registerSettingsIntegration()`, with `showModal()` falling
back to it. **Registering the intent on the library rather than passing it per
call site is what makes the six paths identical by construction** rather than
by everyone remembering — a seventh entry point gets it free.

`gmStubs.js` records every `GM_registerMenuCommand` in `window.__gmMenuCommands`
WITH its callback, so the spec invokes the Tampermonkey item exactly as
Tampermonkey would. That mattered more than usual here: a test that opened the
dialog the convenient way would have passed throughout the bug's whole life.

### Two owners of `row.style.display`

`applySectionCollapse()` and `applySettingsSearch()` both assigned it, last
writer winning. Symptoms: a search left all 38 section headers on screen with
nothing under most of them; a match inside a collapsed section appeared under a
header still drawn collapsed; clicking that header then revealed every row in
it rather than the matches. Adding a third filter to that arrangement would
have made it three.

Replaced by ONE pass computing visibility from three inputs — the needle, the
changed-only toggle, each section's stored state. **A filter opens the sections
holding matches without touching their stored state**, so clearing it restores
the user's own layout rather than leaving everything expanded; there is a
mutation for each of those two directions, because the plausible wrong fix is
to expand them for real.

### `isSchemaDefault()` made bullet 4 nearly free

"No changed-from-default indication anywhere" was a real gap across 238
settings — and after 9.99.1138 the comparison already existed, for the dirty-set
SAVE. The marks are RECOMPUTED on every widget event rather than tracked
incrementally, deliberately: RESET, the colour pickers and the popup sub-editors
all write widget values without a common choke point, and a counter maintained
at each of those is wrong the first time one is missed. 238 `getElementById`
calls is not worth optimising against that.

**The per-section badge is the half that matters.** A per-row marker you can
only see by opening all 38 sections is not an answer to "what have I changed".

### Three traps the tests hit

- **`data-section` holds the divider's KEY, not its label.** The schema keys
  its dividers `divider_<topic>` and carries the label separately, so the first
  version of the spec matched `'🐞 DEBUGGING'`, found nothing, and reported it
  as the feature being broken. 11 of 22 tests failed for that one reason.
- **A fixture profile is not a pristine profile.** `loadPage.js`'s
  `FIXTURE_SETTINGS_OVERRIDE` forces `sa_enable_caa_pics` and
  `sa_enable_relationships_column` OFF, and both DEFAULT to true — so "an
  untouched profile" arrives with two settings already changed and every count
  in the file would have been off by two while looking plausible. These tests
  never fetch, so the spec puts both back at their defaults.
- **A widget in a collapsed section cannot be clicked.** Obvious in hindsight;
  it presented as a 90-second timeout on `element is not visible`. Expanding the
  section first is also the flow a user takes.

### The redundant-guard pair, found by mutation

`↺` sits inside the section header, whose click handler toggles the section, so
a reset press must not fold away the rows it just changed. TWO guards prevent
it — `stopPropagation()` in the ↺ handler and a
`closest('.vz-section-reset')` bail-out in the header handler — and they are
**mutually redundant**: either alone suffices, so mutating either alone leaves
the spec green. Recorded the way CLAUDE.md already prescribes for `iconSel` and
the bake guard: one combined entry that fails, plus two `expect: "pass"`
singles, and a comment at the code saying not to tidy either away on the
evidence that its own mutation passes.

### Coverage

`tests/fixtures/settings-dialog.spec.js`, 22 tests in six groups. Mutation list
`scripts/mutations/settings-dialog.json`, 22 entries, 19 failing as planted and
three honest `expect: "pass"` — the two guards above, and the widget-only
contract of the per-section reset, which has no guard to remove because it is
true by construction (`resetSettingWidget()` assigns to inputs and nothing
else). That last one is recorded anyway: the property is load-bearing, and a
future "helpfully save it too" change is exactly what it exists to catch.

`npm run test:full`: 490 passed, 5 m 41 s (`petri`, 12 workers, 09:12:34-09:18:15
UTC).

### MB_PageEnhancer

`// @grant GM_deleteValue`, bumped to 1.0.12. Without it the library's
dirty-set SAVE feature-detects its way back to pre-4.1.0 behaviour there, so
that script would go on freezing whole profiles. While in its changelog: 1.0.11
had shipped with no entry at all, leaving the header a version ahead of the
file — backfilled from commit `58bc077`, which says exactly what it was.

## 2026-09-23 — the dev repo was testing against the published library, and a published script has been broken since February

Two findings from one change, both about the gap between this development
repository and `vzell/mb-userscripts`, the announced one whose
`raw.githubusercontent.com` URLs every user's Tampermonkey actually fetches.

**The dev userscript `@require`d the PUBLISHED library.** Reasonable while the
library barely changed — one copy, always the announced one. Two consecutive
branches ended that: 4.1.0 made SAVE a dirty set and 4.2.0 rewrote the settings
dialog, and the mirror serves 4.0.0. So a live browser check of either was
worth nothing, and looked exactly like a real one: the page loads, the
userscript IS the dev version, only the library silently is not.

The consumer-side halves were genuinely tested, which is why this stayed
hidden — F1's migration was confirmed in a real browser while its library half
had never once executed. Dev now requires the working copy:
`file:///V:/home/vzell/git/musicbrainz-userscripts/lib/VZ_MBLibrary.user.js`.

**That makes publishing a copy plus a one-line rewrite, and the failure mode is
silent.** A `file://` `@require` shipped to users does not error:
`const Lib = (typeof VZ_MBLibrary !== 'undefined') ? … : { settings: {}, … }`
lands on the stub, every setting resolves to its inline fallback, and nothing
reports anything — org/config-handling.org F4's second live scenario, reached
by accident instead of by a broken CDN.

**So it was already true somewhere.** `scripts/check-publish-ready.py`'s first
run found `CustomizableMultiSelector.user.js`, published at 2.0.0 since
**2026-02-02**, requiring
`file:///V:/home/vzell/git/mb-userscripts/lib/VZMBLibrary.user.js` — nearly
eight months live, against a library path that exists on one machine. Anyone
who installed it got the stub.

**That script is not in this dev repo at all**, and that is the design note
worth keeping: the `file://` sweep covers EVERY `.user.js` in the mirror rather
than only the ones this repo can pair up. A pairwise check would have reported
a clean run — the single real instance is precisely the file a dev-repo-driven
check cannot see.

### The checker's own first run was 1 finding and 2 false alarms

Recorded because the ratio is the point, not the bugs.

- It called `SpringsteenCoverArtUploader` "live without the library it needs".
  That script does not `@require` VZ_MBLibrary at all; it had simply not
  changed in three months while the dev library moved on. Version skew between
  a script and today's dev library is the NORMAL state. Now a PENDING ordering
  note, scoped to scripts that actually require the library.
- It read every `SpringsteenCoverArtUploader_CHANGELOG.json` entry as
  disagreeing with its script, because these projects do not agree on whether a
  changelog `version` carries the `+YYYY-MM-DD` suffix — that one writes
  `1.02.003+2026-06-21`, ShowAllEntityData writes a bare `9.99.1138`. Comparing
  one convention against the other flags everything. Both sides are normalised
  now.

Two false alarms in the first three findings is how a pre-publish check becomes
a thing people skip, and the real finding goes with it. Hence
`scripts/check-publish-ready-gate.py`: 11 arms, including the one that asserts
**behind is not broken** — the mirror lagging the dev repo is the normal state
between releases and must never fail, or the script stops being run at all.
`--strict` is the run straight after publishing, where behind means the copy
stopped half way.

The scratch mirror is built in a temp directory from the dev repo's own files,
with the library `@require` rewritten the way a real publish does it — so the
"clean" case exercises the actual publish contract rather than a guess at it,
and nothing ever reads or writes the real publish repo.

## 2026-09-23 — the config file never carried the pinned filter list (branch feat/config-export-workspace)

`org/config-handling.org` F5's seventh and last bullet, and the only one of the
seven that needed a file-format change. 💾 Save configuration had covered
`configSchema` keys and nothing else since it shipped in 9.99.273.

**The sharp edge is the pinned filter list.** `persistent-sa-hist-list` is
edited from *inside* the ⚙️ Settings dialog, via the 🔧 Edit Pinned Filter List
button, so it has always looked like part of the configuration — and the file
that dialog writes did not contain it. Nothing said so; the summary reported a
successful import and the list was simply still whatever the destination had.
The laborious one is column visibility: one `vz-mb-colvis-<pageType>` state per
page type, built up over months of clicking the 👁️ Visible menu, and a second
browser meant redoing all of it.

### Why a sweep, and why a grant

`vz-mb-colvis-<pageType>` is derivable from `pageDefinitions`.
`vz-mb-colvis-<pageType>-sub-<safeId>` is not — `safeId` comes from a runtime
heading id, so no walk of the definitions can produce it, and those are the
states for the sub-tables on a multi-table page. Hence `// @grant
GM_listValues`, feature-detected the way VZ_MBLibrary 4.1.0 feature-detects
`GM_deleteValue`, falling back to the `pageDefinitions` walk.

The fallback's gap is real and is asserted rather than glossed: the spec pins
that *without* `GM_listValues` the per-pageType keys still resolve and the
sub-table key genuinely does not. `tests/support/gmStubs.js` gained a
`GM_listValues` stub in the same commit — its own docstring promises it stubs
every `@grant` the userscript declares, and without it every test would have
silently exercised the fallback arm, leaving the sweep with no coverage at all.

### The defect this was most likely to reintroduce

`String(value)`, i.e. F3 arriving from a third direction, and this block is a
strictly worse place for it. The five `type: 'table'` settings at least had
`Lib.getTableRows()`'s `Array.isArray` check re-seeding the built-ins behind
them, so the damage was recoverable by re-entering rows. **Nothing re-seeds a
pinned filter list.**

It is also the one block where the shapes differ per key, so there is no
correct coercion even in principle:

| key                       | stored as                                                      |
|---------------------------|----------------------------------------------------------------|
| `vz-mb-colvis-*`          | a `JSON.stringify()`ed STRING — both readers `JSON.parse()` it |
| `persistent-sa-hist-list` | an array of strings                                            |
| `sa_stats_panel_geometry` | an object of numbers                                           |

A "helpful" `JSON.parse()` on the colvis value makes the file prettier and
hands `loadColVisState()` something it throws on — and a deep-equal assertion
does not catch it, which is why the spec asserts `typeof` separately. There is
a mutation for exactly that.

### The registry is a security boundary, not just a lookup

A `workspace` block is user-supplied data. `_configWorkspaceGroupFor()` gating
what may be written is what stops a hand-edited or unfamiliar file reaching
into this installation's own bookkeeping — setting
`sa_settings_migration_level` would permanently disable F1's one-shot repair,
and a planted `mb_sa_subtable_snapshot_*` payload would be consumed by the next
sub-table tab. The `settings` half is only safe because `configSchema` gates it
the same way; this block had nothing until the registry existed.

The migration trio (`_level` / `_backup` / `_notice`) is deliberately out of
the registry in **both** directions. They describe what this INSTALL has
repaired, not what the user chose: importing another profile's level marks a
still-frozen browser as already migrated, and importing its backup offers to
undo a migration that never ran there.

### Two carve-outs that look like inconsistencies and are not

- **An empty `[]`/`{}` IS exported here**, where an unseeded `type: 'table'`
  key is omitted. Copying that arm across is the plausible mistake and is wrong
  for the opposite reason: the three table seeders read `[]` as "re-seed from
  the built-ins", so an emptied table cannot survive a reload and the format
  cannot honestly promise it. Nothing re-seeds these, so "no pinned filters" is
  a real state. Mutated in both directions.
- **There is no prune.** `_applyConfigSettings()` deletes a value equal to its
  schema default so the key keeps following future defaults (F1). These have no
  schema and no default — the closest thing is a literal baked into each reader
  (`{width: 940, height: 680}`) — so there is nothing to compare against.

### The version guard, and why v1↔v2 is not hypothetical

Both blocks are optional in both directions. A v1 file has no `workspace` key,
so nothing is restored and the settings import is byte-for-byte what it was; a
v2 file read by a pre-2026-09-23 script reads its own `payload.settings` and
ignores the rest. The mirror is still at **9.99.746** (F6), so every file a
user already has is v1, and every file this version writes will be read by a v1
script somewhere. A mismatch is therefore a NOTE in the summary, naming which
of the two happened — "my window positions did not come across" is otherwise
indistinguishable from a bug.

Geometry is carried even though it holds absolute viewport pixels, which is a
decision rather than an oversight: both readers clamp what they load to the
current viewport (`_clampGeo()` in `showStatsPanel()` and in the load dialog),
so a 4K desktop's coordinates cannot strand a panel off a laptop screen.
Without those clamps the group would have had to be excluded.

Covered by `tests/fixtures/config-workspace-roundtrip.spec.js` (13 tests);
mutation list `scripts/mutations/config-workspace.json` — 13 entries, 12 `fail`
and one honest `expect: "pass"` for the exact-name-before-prefix ordering in
`_configWorkspaceGroupFor()`, which no key that exists today can distinguish.

## 2026-09-23 — the five lookup tables never see a row shipped later (branch feat/table-seed-ledger)

`org/config-handling.org` F1's closing note, and the last item left in that
file. All five `type: 'table'` settings are lazy-seeded from code on FIRST USE
and never reconsult the built-ins, so a row added in a later version reaches
nobody who already has the table. The documented escape has been to empty the
table in the editor, save and reload — which throws away every row the user
entered by hand to gain one they did not.

### F1 said this was unsolvable, and was right about the reason

> Merging built-in rows into stored ones cannot tell "the user deleted this
> row" from "the user has never seen it", and unlike the scalar case there is
> no historical value to recognise — a row is not a default.

Both halves hold. The way out is to stop trying to INFER the distinction and
start RECORDING it: `sa_table_seed_ledger` holds, per table, every built-in row
key this profile has been offered. Absent from the ledger ⇒ new, add it.
Present in the ledger but not in the rows ⇒ deleted on purpose, leave it gone.

That is the same shape, and the same reason, as `vz-mb-colvis-touched-*`, which
already distinguishes "the user chose this column's visibility" from "never
asked" — the pattern was in the codebase, one screen away from the problem.

### The measurement is what made it exact instead of a bet

`scripts/dump-table-seed-history.py` walks all **623** revisions of the
userscript and extracts the built-in rows of all five tables. Result:

    0 change(s) to the built-in rows after their introduction:
      none — the built-in tables have never gained or lost a row.

So every profile in existence was seeded from **precisely today's built-ins**,
and recording today's keys as "already offered" is a fact rather than a guess.
This is the last moment that is true: ship one row first and an absent key
becomes permanently ambiguous, exactly as F1 describes. The strongest argument
for building it was that there is currently nothing to fix.

It also reframes the finding honestly — it is a LATENT defect. Nobody has been
harmed, because nothing has been added.

### Three things the tests found that reasoning did not

- **`page.reload()` drops the userscript.** `loadPage.js` injects it with
  `addScriptTag` AFTER `goto`, so a reload brings the page back bare — the
  notice never renders and the 90 s timeout reads as the feature being broken.
  Call `loadUserscriptPage()` again instead; GM storage survives either way,
  being backed by localStorage through a context-level init script.
- **A mutation that ADDS an early call proves nothing.** The foot-of-IIFE call
  still ran and did the work. The mutation has to MOVE the call.
- **And the moved call still passed**, twice, because every test drove
  `__saTest.seedNewTableRows()` — which runs after the whole IIFE has evaluated
  and therefore succeeds wherever the production call sits. The fix was to read
  the ledger the PAGE LOAD produced, before touching the hook. A hook that
  re-runs the thing under test is a hook that can hide where it is called from.

### Why the early call is silent, and what was added because of it

`_TABLE_SEED_REGISTRY()` reads `SA_UNICODE_CHARS_DEFAULT` and the three
`REL_*_DEFAULT` maps, all declared tens of thousands of lines BELOW the startup
block. Module-level `const`s sit in the temporal dead zone until evaluated, so
calling the pass there throws `ReferenceError` — and `node --check` cannot see
it, because the TDZ is a runtime rule and not a syntax one.

Worse, the try/catch around `rows()` swallows it per entry: all five tables are
skipped, the ledger stays empty, and the only trace is a `Lib.warn` that is off
by default. `_seedNewTableRows()` now returns an **`unreadable`** count for
exactly that, so a registry entry pointing at a constant that does not exist is
assertable rather than invisible. (It is NOT what catches a moved call — see
above.)

### A duplication removed on the way

The three Relationships icon maps had their built-ins written out TWICE: once
as the `let REL_*` initializer, once as the object literal passed to
`_loadMap()` inside `_initRelMappings()`. Two copies thousands of lines apart
with nothing keeping them equal — a row added to one and not the other would
make the seeded table disagree with the fallback a failed `@require` falls back
to, silently. They are one `REL_*_DEFAULT` constant each now, which is also
what let all five tables go through one registry, and what let
`scripts/dump-config-defaults.py` delete its whole second parsing branch. The
regenerated snapshot's `seed_rows` are byte-identical, which is the evidence
the hoist changed nothing.

### The ledger is in the config file's workspace block, and that is a decision

It looks like install bookkeeping — the same shape as
`sa_settings_migration_level`, which is deliberately NOT exported. The
difference: the migration level records what the SCRIPT did to this install,
while the ledger's DIFFERENCE from the stored rows is the only record anywhere
that the USER deleted a built-in row. Leave it behind and a config file stops
meaning what it says: the destination has no entry saying the row was offered,
so the next load hands it straight back — the file recorded the deletion and
the import undid it.

Covered by `tests/fixtures/table-seed-ledger.spec.js` (12 tests); mutation list
`scripts/mutations/table-seed-ledger.json` — 14 entries, 13 `fail` and one
honest `expect: "pass"` for the `String()` coercion on row keys, which nothing
can exercise while every built-in key is already a string.

## 2026-09-23 — the ⏳ filter erased the marker it filtered on (branch fix/pending-edits-highlight-ring)

Reported from `https://musicbrainz.org/work/bcd490e5-dac7-3b8a-b423-ae17e1209f3d`
with two snapshots taken minutes apart:
`debug/work-recordings-pending-edits-final.html` (not filtered) and
`debug/work-recordings-pending-edits-filtered-final.html` (⏳ engaged). Pressing
the toggle narrowed the rows correctly and made MusicBrainz's orange
"modification pending" highlight disappear — the one signal the button exists
to find.

### Root cause, confirmed by diffing the two snapshots

`_highlightPendingEditsMatch()` called
`highlightCrossTag(p.node, /[\s\S]+/g, 'mb-column-filter-highlight')` with
`p.node` being the `span.mp` itself. `highlightCrossTag()` descends to TEXT
NODES, so the span it builds is not the marker — it is a new innermost wrapper
covering all of the marker's text:

```
.mp → a → bdi → span.mb-column-filter-highlight → text
```

`.mb-column-filter-highlight` paints `sa_column_filter_highlight_bg` (`#add8e6`),
so 100% of the text area went light blue and the orange survived only in the
padding, which is visually nothing. The `.mp` element is **byte-identical**
between the two snapshots — nothing marked it, and the script defines no CSS
for `.mp` at all; the orange is purely MusicBrainz's own stylesheet.

Both snapshots carry 8 `.mp`, of which only 3 are inside a `<td>`; the other 5
belong to jesus2099's page-header `PendingEdits` widget, which
`_findCellPendingEdits()`'s descendant-of-`<td>` scoping already excludes. 3
in-table markers, 3 highlight spans in the filtered file — a clean 1:1, which is
what ruled out the highlighter running somewhere it should not.

A second symptom in the same files, easy to miss: on the `mp mp-rel` shape the
marker also encloses the entity-kind icon span, so the filtered render showed
an orange band under the icon and a blue band under the title **inside one
marker**.

### The fix is a MODIFIER class, not a fifth highlight class

CLAUDE.md's standing rule is that a new highlight class costs entries in
`_COLLAPSE_MATCH_SEL`, in `testRowMatch()`'s reset, in
`getCleanColumnText()`/`getCleanVisibleText()`'s unwrap, in `clearAllFilters()`
and in the ~10 sites that spell the four classes out by hand. So the span now
carries `mb-column-filter-highlight mb-pending-edits-match` — additional, never
instead of. `highlightCrossTag()` assigns `span.className = className`, so a
space-separated string needed no signature change, and every one of those
consumers already matches the span because the base class never left it.

Two CSS rules do the rest: the modifier turns the fill and the text colour off,
and `table.tbl td span.mp:has(.mb-pending-edits-match)` draws the ring around
the whole marker. `outline`, not `border`, so nothing reflows — the same reason
`td.mb-rel-cell a.mb-rel-icon-match` uses one. Colour is the new
`sa_pending_edits_match_outline` (gold by default).

Nothing downstream needed a hook, and two of those are worth naming because
they are where a change like this usually leaks:

- `testRowMatch()`'s reset is `replaceWith(document.createTextNode(...))` — it
  removes the whole span, so the modifier cannot outlive it or strand an orphan.
- `applySubFilter()` Step 2 clears only `.mb-subtable-filter-highlight`, so a
  ring survives a sub-table filter with **no** re-derivation pass of the kind
  `mb-rel-icon-match` needs there.

### Scoped to the pending-edits filters, deliberately

The generalisation — "any fill inside a `.mp` destroys the orange, so ring them
all" — is wrong, and it is a pure-CSS one-liner, so it is in the mutation list.
For every other filter the highlight COLOUR is what says which filter matched
(gold global, blue column, green sub-table); collapsing three of them into one
ring trades a real distinction for a marginal gain. A ring has one meaning.

The multi-table fixture is the sharpest guard on this, because every Artist cell
on it reads "Bruce Springsteen" whether or not it is wrapped: a typed filter
highlights all of them and must ring none.

### One prediction that was wrong, kept because it reads plausible

The CSS comment first asserted that the modifier rule MUST sit after the rule it
overrides — same specificity, source order decides — citing the column-header
pill family, where that is genuinely true. It is not true here:
`.mb-column-filter-highlight.mb-pending-edits-match` is TWO classes against the
base rule's ONE, so it wins from either position. The mutation run is what said
so (expected fail, got pass), and both the comment and the mutation entry now
record it, so nobody re-derives a constraint that was never load-bearing and
then preserves it.

### The first colour shipped was invisible, and no fixture could have said so

Reported back the same day as "there is still NO surrounding marker", with
`debug/work-recordings-pending-edits-filtered-final-bug.html`. That file
confirmed the markup — 4 spans, both classes, each inside a `span.mp` — and
could say nothing about the ring, because the save stripped **every** `<style>`
element, MusicBrainz's own included: `<style` appears 0 times in it, as do
`.mb-column-filter-highlight {` and every other rule from the one `GM_addStyle`
block. A snapshot with no CSS cannot answer a CSS question.

`scripts/probe-pending-edits-ring.js` was written to answer it against the live
page, and is the durable record:

```
"hasSelectorHas": true,                    :has() is supported
"ringRuleFound": true,                     both rules are in a live stylesheet
"mpBackground":   "rgb(255, 221, 153)"     MusicBrainz's marker, #FFDD99
"mpOutlineColor": "rgb(255, 215, 0)"       the ring, #FFD700
"mpOutlineStyle": "solid", "mpOutlineWidth": "2px"
"innerBackground": "rgba(0, 0, 0, 0)"      fill correctly suppressed
```

Everything worked. The ring was computed, applied, 2px solid — and **1.07:1**
against the marker it rings, **1.39:1** against the white row behind it.
MusicBrainz's own pending-edit marker is a yellow, so "a bold yellow border"
was the single hue that could not work, and it was taken from the report
without measuring what it would sit on. The default is now `#cc0000` — 4.5:1
and 5.9:1 — which is what `td.mb-rel-cell a.mb-rel-icon-match` has always used,
for this reason.

**Why the suite was green throughout.** No fixture loads MusicBrainz's
stylesheet, so `.mp` has no background in a test at all; the spec asserted
`outlineColor === the schema default` and every fact it checked was true. This
is the same class of blind spot CLAUDE.md already records for flag sprites
(`resolveFlagVisual()` legitimately returns null in every fixture), reached
from a different direction: a fixture can pin which colour is applied, never
whether it can be seen. The mutation list carries the yellow default as a
`fail` arm and says in its own `why` that it proves the suite reads the schema
default and **not** that the colour is visible.

Covered by `tests/fixtures/pending-edits-highlight-ring.spec.js` (9 tests,
single- and multi-table); mutation list
`scripts/mutations/pending-edits-highlight-ring.json` — 9 entries, 7 `fail` and
two honest `expect: "pass"` (the `table.tbl td` scoping, which no committed
fixture loads jesus2099's widget to exercise, and the rule ordering above).

## 2026-09-24 — Step 26: the summary-button tallies re-walked every source row on every keystroke (branch perf/step-26-source-row-tally-memo)

PERFORMANCE.org Step 26, a cost, not a defect. `runFilter()` ends every pass
with `updateFilterButtonsVisibility()`, whose tail feeds the ⏳ pending-edits
and LENGTH ⚠️/❌ summary buttons. Both count the captured SOURCE rows, and must:
AUDIT.md §3.6 is what happens when they count the live tbody instead. That made
each pass cost one `querySelector` per source row per counter, however narrow
the filter was, for an answer that cannot change between passes.

### What the measurement found that the step did not say

- "~8 300 per pass" was exact on `artist-events`: **8 348 = 2 x 4174**.
- **A multi-table page paid 3N.** `_pendingEditsGroups()` ran twice per pass:
  once for the buttons, and once more from `_pendingEditsAnyActive()`, which
  only reads the `<h3>`s. On `artist-releasegroups` that was 6 429 = 3 x 2143.
  Under a global query it is 2N, because `clearAllFiltersBtn`'s `||` chain
  short-circuits before reaching it.
- The step proposed invalidating the memo "wherever a flag is stamped
  asynchronously". **There is no such site.** `data-mb-len-flag` is written only
  by `_applyLengthMismatchFlag()`, during pre-processing and before capture.
  `span.mp` is MusicBrainz's own markup; the ⏳ highlight wraps text inside it,
  and only on clones.

### The design choice: a self-validating key, not invalidation hooks

`_sourceRowTally(rows)` memoizes per ARRAY in a `WeakMap`, validated by the
array's length. I grepped every write to `allRows` and `groupedRows`. Each
either replaces an array (fetch reset, hydrate, sort) or grows one (fetch loop
`push`, resume). None splices, assigns by index, or truncates. So there is no
hook for a future change to forget. The step's own list of sites to hook
("fetch, sort, disk load") would have worked today, because the fetch-start
`_invalidateFilterCache()` sits above the resume guard and so runs on a resume
too. The argument for the key is only that it needs no site at all.

**Mutation-testing showed the key must be the array, not only its length.**
With identity dropped, two same-sized sub-tables share one answer. The
multi-table fixture's Single and Live sections have 2 rows each, so Live
reported Single's pending count.

### A test-design note worth keeping

The `__saTest.sourceRowTallyScans()` counter instruments `_sourceRowTally()`
and nothing else. If a call site is reverted to its own per-pass
`reduce(... _rowHasPendingEdits ...)`, the counter reads zero and the gate test
passes. So the spec also wraps `Element.prototype.querySelector` around one
`updateFilterButtonsVisibility()` call and counts the two tally selectors. The
three call-site reverts in the mutation list are caught only by that probe.
The counter still earns its place: it shows the first tally walked the rows at
all.

Measured on `vzell-lap`, 2026-09-23 22:34–22:37 UTC, two runs, `main` versus
the branch in one session (`tests/MEASUREMENTS.org`). On a narrow filter,
`updateFilterButtonsVisibility()` fell from 8.6–10.9 ms to under 0.1 ms per
call.

Covered by `tests/fixtures/source-row-tally-memo.spec.js`, with 4 tests. Its
mutation list is `scripts/mutations/source-row-tally-memo.json`: 10 entries,
one honest `expect: "pass"`. That one is the length check alone, which only a
resume that adds marker-carrying rows reaches.

### Found on the way, NOT fixed here: LENGTH flags do not survive Save to Disk

*Fixed the next day — see the 2026-09-24 entry on branch
`fix/len-flag-disk-roundtrip` below.*

`_buildDiskCellData()` stores a cell's `innerHTML` plus colSpan/rowSpan, and
nothing else. A length mismatch is marked by `data-mb-len-flag` ON the `<td>`,
and `_applyLengthMismatchFlag()` is attributes-only by design. So a reopened
tracklist loses the marking entirely. `scripts/probe-len-flag-disk-roundtrip.js`,
`vzell-lap`, 2026-09-23 22:59 UTC, on "Born to Run" at a 500 ms threshold:
8 flagged cells and `(3) LENGTH ⚠️` / `(1) LENGTH ❌` before the save; **0
flagged cells and both buttons hidden** after the load. The cell tints and
glyphs go with them, since both are CSS keyed on the same attribute.

This predates Step 26 and is independent of it: the memo counts what the rows
carry, and after a load they carry nothing. The sub-table handoff
(`captureSubtableSnapshot()`, also `innerHTML`) presumably has the same gap, but
it was not probed. The ⏳ pending-edits markers are not affected, because
`span.mp` lives inside the cell's HTML. Two candidate fixes, both open: persist
the attribute in the cell record (a format addition the loader must read back),
or re-derive the flag on hydrate from the two duration cells' text. The second
would lose sub-second precision, since `data-mb-ms` does not survive either.

## 2026-09-24 — LENGTH flags lost on Save to Disk → Load (branch fix/len-flag-disk-roundtrip)

This closes the finding recorded in the Step 26 entry above. The root cause was
exactly the one suspected there. `_buildDiskCellData()` wrote a cell as
`{html, colSpan, rowSpan}` (plus `mbid`/`relDone` for a rel cell), and a length
mismatch is `data-mb-len-flag` ON the `<td>`. So the flag was never in the file.
Both writers use the same builder: Save to Disk, and the sub-table handoff
through `captureSubtableSnapshot()`.

### The fix

The writer adds optional `lenFlag`/`lenTip` fields. `_restoreLenMismatchFlag()`
reads them back, called from both of `_hydrateAndRenderFromSnapshotData()`'s
cell loops after their cleanup passes. Nothing else needed a hook, because
everything the flag drives already reads the attribute:
- the tint and the glyph (CSS);
- the summary counts (`_sourceRowTally()`, over the rebuilt source rows);
- the structural ⚠️/❌ filter (`testRowMatch()`).

The design choices, and why:

- **As saved, not re-derived.** Re-deriving under today's threshold looks
  better on paper, but the millisecond values behind the comparison do not
  survive a snapshot either (`data-mb-ms`, `_msResetCarriedOverPrecision()`).
  Re-deriving would have meant reading seconds from cell text, which is exactly
  the precision the feature exists to go past. Live-date flags already travel as
  saved HTML, so this matches them. The on/off setting is still honoured.
- **No format bump.** A file without the fields loads as it always did, which is
  the precedent set by the `incomplete` block.
- **Not reachable through the handoff today.** `release-tracks` is not in
  `SA_SNAPSHOT_SUPPORTED_PAGETYPES`, and no other pageType has LENGTH flags. So
  the single-table loop's call is recorded as an honest `expect: "pass"`: it is
  unreachable, not unverified.

### One prediction that was wrong, kept because it was plausible

While writing the reader I inlined its allowlist rather than using a
module-level `Set`, and first gave a TDZ reason: that a sub-table tab hydrates
during start-up, before a `const` declared above it would be initialised.
Checking the one tab-side call site (`_hydrateAndRenderFromSnapshotData()`,
reached from the start-up block) showed it sits LATER in source order than the
helper. So the `const` would have been initialised, and the reason was false.
I removed it from the JSDoc before commit. The inline check stayed, because it
is two values.

### Coverage

Covered by `tests/fixtures/len-flag-disk-roundtrip.spec.js`, 4 tests:
- the round trip restores each cell's kind and tooltip, and the ⚠️ filter still
  filters;
- a restored tracklist saved again keeps its flags;
- flagging switched off before the load wins;
- a tampered file applies only a known kind, and only a string tooltip.

Three of the four failed on the unfixed code. The switched-off test passed
there, vacuously, and its mutation is what makes it load-bearing.

The mutation list is `scripts/mutations/len-flag-disk-roundtrip.json`: 9
entries, 2 of them honest `expect: "pass"`. The first is the writer's ownership
check on the tooltip, which every flag a fixture can produce already satisfies.
The second is the single-table loop, which is unreachable.

## 2026-09-24 — a track's WORK relationships reached no column (branch release-tracks-work-ars)

`org/release-tracks-ARs.org`. On a release tracklist, the relationships of the
work each track records — publisher, lyricist, composer, arranger,
sub-publisher, "is based on" — appeared nowhere except the raw "ARs" column.

### Root cause: one nesting level, two finders

MusicBrainz renders the work's own relationship list INSIDE the `<dd>` of the
track's `recording of:` `<dt>` (`debug/work-ARs.html`, and the same markup in
the committed `tests/snapshots/release-tracks/raw.html`):

```
td.title > div.ars
  dl.ars > dt "recording of:"
           dd  > a[/work/…]
                 dl.ars > dt "publisher:"              (artist)
                          dt "lyricist and composer:"
                 dl.ars > dt "publisher:"              (label)
                 dl.ars > dt "is based on:" ×3
```

`_findAllArDts()` is `:scope > dl.ars > dt` on the bare `div.ars` — direct
children only — so those `<dt>`s never reached `_classifyArDt()`, the fixed
handlers or the dynamic-fallback scan. Confirmed against the committed
baseline rather than inferred: `release-tracks/rendered.html` carries
`Part of series`, `Horn arranger`, `Compilation of`, `Additional conductor`
and `Strings arranger`, and no `Publisher`/`Lyricist`/`Composer`/`Arranger` at
all.

The fix is a SECOND finder, `_findWorkArDts()`, not a widening of the first.
Widening it would merge two relationship levels into one set of columns — the
recording's `arranger:` and the work's are different relationships between
different entities.

### What the page actually contains

Surveyed across all 8 tracks of `debug/ARs.html` before designing anything;
the numbers are what settled the three open decisions:

| work phrase             | tracks | `<dd>` kinds     | `<dt>`s per track |
|-------------------------|--------|------------------|-------------------|
| `publisher:`            |      8 | artist AND label | 1 of each         |
| `lyricist and composer:`|      7 | artist           | 1                 |
| `arranger:`             |      7 | artist           | 1                 |
| `is based on:`          |      1 | work             | **3**             |
| `sub-publisher:`        |      1 | label            | 1                 |
| `lyricist:`             |      1 | artist           | 1                 |
| `composer:`             |      1 | artist           | 1                 |

- `publisher:` spanning two kinds is why the columns split by entity kind — the
  `_findPhonographicCopyrightDts` shape exactly.
- `is based on:` as three sibling `<dt>`s is why no finder here may use
  `.find()`, and why its multi-row cell needs no new machinery:
  `_buildKindSplitListTd()` already iterates every `<dt>`, and `work` is
  correctly absent from `PEER_SPLIT_KINDS`.
- The last two rows are why `lyricist and composer:` is SPLIT on `,`/` and `.
  Track 5 ("She's the One") states the roles separately while the other seven
  combine them; unsplit, the release carries three part-filled columns instead
  of a full `Work lyricist` and `Work composer`.

Columns are named with a `Work ` prefix, decided with the user: it namespaces
the keys AND the column names, so a same-named recording relationship can never
be dropped by the header block's own dedup guard.

### The suite caught one thing, and it was not the feature

`uniq-drop-collapse-gate-glyph-column.spec.js` failed with
`Work publisher label: header ▶5▤ vs 📊 15`. Measured rather than guessed, with
a throwaway probe spec: that fixture's release has TWO mediums, and the column's
badges are 15 and 5 — both correct, one per table.

The flaw was in the spec. `window.__saTest.getUniqDropSections(colName)`
resolves the FIRST matching `<th>` page-wide, so it always answered for table 0,
while the badge it was compared against is per-table. Probing every collapsable
column showed why it had never fired: the five pre-existing ones
(`Engineer`, `Instruments`, `Recorded at place`, `Recording engineer`, `Vocals`)
each own a toggle in ONE table only. `Work publisher label` is the first column
to own one in both.

Fixed by giving the spec a table-scoped reader, mirroring
`getUniqDropSectionsForTable()` in
`tests/live/releasegroup-releases-filter-sort.spec.js`, which exists for exactly
this reason and says so. The shared hook was left alone. Re-running that spec's
own mutation list afterwards confirmed all four of its original guarantees still
fail-on-mutation, i.e. the scoping fix did not weaken it.

### Coverage

`tests/fixtures/release-tracks-work-ars.spec.js`, 8 tests, reusing the committed
`release-tracks-ms-length.html` (the real Born to Run page — it already carries
every shape this needs, so no second copy of the same release was committed).

Mutation list `scripts/mutations/release-tracks-work-ars.json`: 12 entries, 9
confirmed failing, 3 honest `expect: "pass"`:
- the `:scope >` guard on the work `<dd>` — prophylactic against a third nesting
  level MusicBrainz does not render today;
- `_workArColumnNames` vs the glyph array — every work relationship in real data
  credits an artist, a label or a work, so the two lists are identical and the
  difference is invisible. Writing that entry is what corrected my own claim
  that the tint would be lost;
- `_workColumnThs` in the row loop's no-op early return — unreachable, because
  this release also gains Recording-of/Vocals/CREDIT_ROLES columns, so the guard
  never fires.

### Still owed

`tests/snapshots/release-tracks/rendered.html` gains the seven columns and has
NOT been re-captured — `playwright/.auth/vzell.json` had expired, and a
logged-out capture drifts every baseline's header chrome for unrelated reasons.
Recorded in `tests/snapshots/registry.org`'s "Expected drift" with the command
to run. No other baseline changes, not even in `<style>`: the feature adds no
CSS and `_stampArColumnHeaderBg()` returns early off `release-tracks`.

## 2026-09-24 — the action-button redesign: what the tests found that reading did not

`org/action-button-redesign.org`, items 1/3/4/5/6. Branch
`action-button-redesign`. Measured on `NB-3641`, 2026-09-24.

### The starting measurement

From the committed baselines, not from memory: `artist-events`' h1 rendered 13
controls, nine of them carrying a text label, and `artist-releasegroups` added a
five-element `Discography:` run on top. Meanwhile every h3 on a multi-table page
had already solved the same problem — `▼ Album (312) ↔️ 👁️ 🔍[…]`, glyph-only,
next to the table it acts on.

### The design, in one line

The menus ADOPT the existing buttons. A row is the same element that used to sit
in the bar — same id, same `title`, same `onclick`, same colour setting, same
`ctrlMFunctionMap` entry — moved into a panel by `adopt()`. That is what kept
the diff small and the nine test call sites a mechanical migration rather than a
rewrite.

### Three defects the specs found, none of which reading the code produced

1. **`stopPropagation()` ate the row-activation close.** `densityBtn.onclick`
   and `exportBtn.onclick` both open with `e.stopPropagation()` — they have to,
   or their own document-level outside-click handler closes the pull-down they
   just opened. So the panel's bubble-phase close listener never fired for
   exactly the two rows that most need it. Capture phase fixes it and cannot be
   stopped by the target. Found on `toolbar-menus.spec.js`'s first run.

2. **`sa_enable_direct_ctrl_char_shortcuts` ships OFF.** The first version of
   the Ctrl+D test pressed `Control+d` and asserted the menu opened; it failed,
   and the reason was not the code under test. Seeded on in that one test, which
   is what makes it exercise the shortcut path instead of passing vacuously.

3. **My own assertion was wrong, not the code.** The Ctrl+D test then asserted
   the 🛠 View panel was still open afterwards. It is not, and should not be:
   activating a row closes its menu. `#mb-density-btn` therefore has no bounding
   box by the time the assertion runs either — the test now compares the density
   pull-down's position against the 🛠 View BUTTON, which is still laid out. A
   zero-rect anchor would put the pull-down at y=5, x=0; that is what the
   assertion discriminates against.

### `uniq-drop-viewport-clip.spec.js` was passing by 3px, for the wrong reason

It failed on the branch by 14px, and the honest answer took a probe
(`scripts/probe-uniq-drop-clamp-geometry.js`, kept):

| arm    | button y @1280 | crampedHeight | button bottom after resize | spaceBelow | panel overshoot |
|--------|----------------|---------------|----------------------------|------------|-----------------|
| `main` | 274.5          | 324           | 345.3                      | **-27.3**  | 2.0 px          |
| branch | 203.2          | 252           | 297.3                      | **-51.3**  | 14.3 px         |

The spec measured the button at 1280 wide, computed a cramped viewport from it,
then resized to **1024** — a width change that re-wraps the h1 bar and moves the
button 52-75px DOWN. So `spaceBelow` was NEGATIVE on both arms: the trigger was
below the fold, and a panel anchored above a button the viewport does not
contain must overrun. `main` overran by 2px and the spec's ±5 slack swallowed
it. The redesign shortens the h1 bar, so the button starts 71px higher, so the
computed viewport is 72px tighter, so the same structural error surfaced as 14.

Fixed by changing the HEIGHT only, and by asserting the button is still on
screen after the resize — the guard whose absence let the original slip through.
Verified to pass on both arms. **The clamp was never involved.**

### Two guards that turned out not to be guards, recorded as `expect: "pass"`

- **`_orderToolbar()`'s emptiness reconcile.** What actually keeps a fully
  gated-off 🛠 View menu off the page is lazy creation: every `_ensure*Menu()`
  call sits inside its own `sa_enable_*` gate. The reconcile is defence for a
  call site that ensures a menu and then adopts nothing; no fixture can tell the
  two apart.
- **Adding `.mb-h2-table-controls` to `updateH2Count()`'s `globalArtBtns`
  selector.** The plausible "simplification" is harmless, because
  `_reanchorH2TableControls()` runs later in the same function and moves the
  wrapper back. The guard against splitting the artwork pill is the ANCHOR
  (`#mb-filter-container`), not absence from that list — so the mutation was
  re-scoped to the alternative design that really does split it: anchoring on
  `.mb-row-count-stat`.

### Performance

The one hot-path touch is `updateH2Count()`, which runs once per filter
keystroke. `_reanchorH2TableControls()` adds one sibling comparison and at most
one `before()` call against a CACHED element — no `querySelectorAll`, which is
why the pair is one wrapper rather than two loose buttons. Nothing in
`PERFORMANCE.org` is made false by this change; re-read and confirmed, not
assumed.

### Still owed

All 11 `tests/snapshots/*/rendered.html` baselines drift — this is the largest
expected drift the registry records, and the only one in it that changes MARKUP
rather than only the `<style>` block. Detailed in
`tests/snapshots/registry.org`'s "Expected drift"; not re-captured here (the
baselines are reviewed as a git diff, not asserted by a spec).

Branch 2, `org/action-button-redesign.org` item 2 — ❓ opening the GitHub help
page, and the hand-written `ShowAllEntityData_HELP.md` — is deliberately not in
this branch.

## 2026-09-24 — ❓ goes to GitHub, and the help text becomes Markdown (branch help-github-md)

`org/action-button-redesign.org` item 2, the second half of the redesign.
A plain ❓ click opens `ShowAllEntityData_HELP.md` on GitHub; **Shift-click**
opens the in-script dialog, as before. The 2448-line `.txt` is retired and
replaced by a hand-written `.md` about a third its length.

### Why the dialog needed a renderer, and what that renderer is not

`showAppHelp()` dropped the fetched bytes into a `<pre>`. That was right while
the source was hand-laid-out plain text and became wrong the moment it was
Markdown: a `<pre>` shows the syntax instead of the document. So
`_mdRenderInto()` / `_mdInline()` / `_mdHeadingId()` were added.

**It is deliberately small, and the coupling runs file → renderer.** It covers
exactly what the help file uses — ATX headings, fenced code, lists one level
deep, GFM pipe tables, blockquotes, rules, and `<details>`/`<summary>` — and
the file is written to stay inside it rather than the renderer being grown to
chase the file. GitHub is where full Markdown rendering lives, and the button
goes there by default. The spec's last test renders the REAL committed file and
is what keeps that statement true.

Five decisions in it that are not obvious from the code:

- **Classes and `GM_addStyle`, not per-node inline styles** — as every other
  panel has been since the 9.99.736-9.99.745 CSP run, and far less code than a
  dozen properties on each node. *The reason first written here was wrong and
  is corrected in the 9.99.1149 entry below:* `/account/*` blocks `<style>`
  elements and `style="…"` inside an `innerHTML` template, not CSSOM writes, so
  a node-building renderer was never in the blocked case.
- **`_italic_` is NOT supported; only `*italic*`.** Half the nouns here are
  snake_case settings keys, and an underscore-emphasis rule renders
  `sa_enable_caa_pics` as "sa" + *enable_caa* + "pics". CommonMark refuses
  intra-word underscore emphasis for the same reason, so leaving the rule out
  makes this renderer AGREE with GitHub on the case that occurs and disagree
  only on a spelling the file does not use. There is a test for the absence of
  a feature, because the plausible "improvement" is to add it back.
- **Nodes, never `innerHTML`, and an href allowlist.** The bytes arrive over
  the network at runtime. "It is our own file" is a fact about the repository,
  not about what a fetch returns, and a help dialog is not where to find out.
- **`<details>` renders OPEN.** Collapsed content is still in the DOM, so the
  dialog's quick filter would highlight matches the reader cannot see — a
  filter reporting hits into a closed box is worse than none, and searching the
  whole text is the only reason to be in this dialog rather than on GitHub.
- **An `#anchor` link scrolls the DIALOG.** It is a fixed overlay with its own
  scroll area, so following the fragment scrolls MusicBrainz's page underneath
  while the table of contents appears to do nothing. Heading ids carry an
  `mb-md-` prefix against collisions with the page's own ids, and both sides
  resolve through `_mdHeadingId()` — which is why a table of contents written
  for GitHub's bare slug resolves here too.

### The cache key had to change, and nothing would have said so

`Lib.fetchCachedText()` keys on the cache key ALONE and stores no URL beside
the bytes. An upgrading user with the plain-text help still cached would
therefore have had it fed to the Markdown renderer for up to a TTL — every
`-----` underline read as a heading rule, every hand-laid-out block reflowed.
`CACHE_KEY_HELP` is now `…-remote-help-md`, so the format change is a cache
MISS. Every fixture starts with empty GM storage, so no test here can hold a
stale value from a previous format: recorded as a second honest
`"expect": "pass"`.

### A defect fifteen green assertions could not see

**Every wrapped bullet ended its list.** A continuation line matches no rule, so
the list loop broke, the continuation became a stray paragraph, and the next
bullet opened a fresh one-item list. The "Supported pages" section — twelve
bullets, most of them wrapped — rendered as **six one-item lists with five
paragraphs between them**.

Nothing in the spec could see it, and the reason generalises: **every fragment
is individually well-formed.** There is a `<ul>`, its `<li>` has the right text,
the paragraph has the right text, no syntax leaked through, the document's
heading and table counts are unchanged. An assertion would have to count
SIBLINGS to notice, and the test asking "does a list render" does not.

It was found by `scripts/probe-help-md-render.js`, written to answer a
different question — not "is the output correct" but "what shape is it" — which
printed

```
ul  1 items
p
ul  1 items
p
ul  5 items
```

and made it obvious in one line. The fix is a lazy-continuation rule: an
indented non-bullet line appends to the item above it. **The indent requirement
is load-bearing** — a heading, fence, table row or rule starts at column 0, so
none of them can be swallowed as continuation text — and it needed its own
fixture case, because in the real help file every list is followed by a blank
line, which ends the list either way.

The transferable part: a renderer's tests naturally check *what* each construct
became, and this class of bug is about *how many*. A structural dump is cheap
and catches what the assertions were never shaped to ask.

### What the mutation run found

Two mutations passed when they should have failed, and both meant the fixture
was short of a case rather than the expectation being wrong:

- **"the table separator row is not required"** — a well-formed table cannot
  see that guard, because the table branch consumes header-plus-separator
  unconditionally either way. The discriminator is a line the rule should
  REFUSE: a pipe-led line with no separator under it, which without the guard
  becomes a table AND swallows the line beneath it.
- **"a lazy continuation need not be indented"** — invisible in the real help
  file, where every list is followed by a blank line. The discriminator is a
  heading sitting directly under a list with no blank line between.

15 mutations: 13 fail as declared, 2 honest passes.

### One defect found by the snapshot baselines, not by any test

`#mb-barcode-highlight-btn` was adopted into 🛠 View ▾ with no hint argument,
making it the only menu row with no `data-mb-menu-hint` while every sibling
showed its accelerator. It is not a control with nothing to show:
`sa_toggle_barcode_highlighting` (Ctrl+B) exists and is routed through
`_toolbarInvoke()` like the others. Nothing failed — it surfaced as a count
mismatch (7 `.mb-toolbar-menu-item` against 6 `data-mb-menu-hint`) while
reviewing the baselines re-captured earlier the same day, on branch
`snapshot-baselines-action-buttons`. Fixed here, because this branch re-drifts
those two baselines anyway.

### The docs audit got a better question, and it found four gaps immediately

`scripts/audit-config-defaults.py --docs` read the retired `.txt` by absolute
path, so the rename would have left it opening a file that does not exist. The
interesting part is what it should read INSTEAD.

It used to match HELP's one-setting-per-bullet lines against schema LABELS, and
its own docstring recorded the result honestly: 41 of 119 bullets flagged at
9.99.1136, most of them correct prose summarising several settings at once. A
34% false-positive rate is something people skim.

The new help file does not list settings one per bullet at all — its settings
section is a **table of groups, one row per `configSchema` divider**. So the
question became "does every schema section appear in HELP's table", which is
near one-to-one instead of one-to-many, and is the case that actually matters:
a new settings GROUP shipping without HELP hearing about it.

**It reported 6 of 38 on its first run against a help file written an hour
earlier, and four of them were real** — `#₁ UNIQUE COLUMN VALUES DROP DOWN
CONFIGURATION` and `Σ THRESHOLD SETTINGS` had been folded into neighbouring
rows, `▶️ EXPAND TRUNCATED CELLS` was missing outright, and
`🖼️ CAA/EAA ILLUSTRATED DISCOGRAPHY` had been renamed in the table so it no
longer matched. It now reports 2 of 38, both deliberate folds of a sub-divider
into its parent row. Still a report, not a gate, for the reason
org/config-handling.org gives — but a report worth reading, which the old one
had stopped being.

### Publishing: the failure mode this change could have shipped

`scripts/check-publish-ready.py` paired `{base}_HELP.txt` with the mirror and
skipped the pair whenever EITHER side was missing. After the rename that
`continue` hides the exact half-finished publish this change makes possible:
script published, renamed help file not, and the ❓ dialog 404s for everyone
already updated. It now FAILS on a companion the published script fetches but
the mirror lacks, and separately NOTES a companion the mirror still carries
that the dev repo no longer ships.

**That note is deliberately not a failure.** `_HELP.txt` has to outlive the
rename: every user still on an older version fetches it until Tampermonkey
updates them, so deleting it from the mirror the day the `.md` lands breaks
help for exactly the people who have not upgraded. `check-publish-ready-gate.py`
gained an arm for the missing-companion case and is green on all 12.

### The merge gate flaked twice, and the comparison does NOT fully settle it

Recorded as data rather than as a verdict, because the evidence is strong in
one direction and the confound is real.

| Arm             | Tests | Result                                            |
|-----------------|-------|---------------------------------------------------|
| branch, run 1   | 585   | green                                             |
| branch, run 2   | 587   | 1 failed — `rel-column-fetch-failure.spec.js:210` |
| branch, run 3   | 587   | 1 failed — `uniq-drop-join-phrases.spec.js:200`   |
| `main`, one run | 571   | green                                             |

**What says it is not this change.** A DIFFERENT test failed in each red run,
and each passed both standalone (2/2 and 10/10) and inside the other full run.
A code defect is deterministic; this is not. Neither spec is reachable from
anything here — the change is the help constants, two help functions, a new
Markdown renderer nothing else calls, and one missing `adopt()` argument. And
`rel-column-fetch-failure` › "multi-table: the failure marker …" is a named
member of the load-flaky family this file has tracked since 2026-09-18, where
it behaved identically: red in a full run, 2/2 standalone, green on the
re-run. It still carries two bare `waitForTimeout(1500)` calls in a test whose
own comment records a 1500 ms wait sampling the still-filtered page under a
parallel run.

**What the `main` arm does NOT prove.** It ran 571 tests against the branch's
587, so a green `main` and a red branch differ in load as well as in code. The
16 added tests are fast (~15 s total) and should not move the needle, but that
is an argument, not a measurement. One green run is also not a rate.

**And the host was not a neutral observer.** This session had been running
Playwright suites, mutation lists and live captures back to back for hours.
The 2026-09-18 measurements put this family at 1 red in 3 at 14 workers on an
idle box; today's 2 red in 3 on the branch is worse than that, and I cannot
separate "the branch" from "the afternoon" with the arms I have.

**`uniq-drop-join-phrases` is the one to watch.** Unlike its neighbour it polls
rather than sleeping — it was written that way deliberately, because
`waitForFilterSettled()` works exactly once on this grouped pageType — and it
has no prior flake history here. A second sighting makes it a family member; a
third without one makes it something else.

### Still owed

The 11 snapshot baselines drift again, in two small ways: `#mb-app-help-btn`'s
`title` changed, and the barcode row gained a `data-mb-menu-hint` (the latter
only on `releasegroup-releases` and `series-releases`, the two baselines
carrying a Barcode column). They were re-captured for the redesign the same
day, so this is a small top-up rather than the backlog item that was.

Publishing to `vzell/mb-userscripts` is owed too, and this is the first change
where a merge alone leaves users worse off rather than merely behind: the ❓
button points at a GitHub path that does not exist until the `.md` is pushed
there.

## 2026-09-25 — ⚙️ and ❓ become one segmented pill (branch help-github-md)

Asked for directly, with a screenshot: give the two pinned buttons the menus'
background and draw them as one rounded control with a divider, keeping their
original actions and tooltips.

**Built as a FOURTH instance of the segmented-run idiom**, not as something
new — same side-borders-start-at-zero rule, same `!important` requirement
(both buttons set `border` and `border-radius` inline, from `uiSettingsBtnCSS()`
and `uiHelpBtnCSS()`, and a normal-priority rule cannot outrank inline). Three
things are specific to it:

- **A CLASS, not an id prefix**, because `mb-settings-btn` and
  `mb-app-help-btn` share none — and a class, not a WRAPPER, because
  `_TOOLBAR_TAIL_ORDER` re-appends both as direct children of
  `#mb-show-all-controls-container` and `toolbar-menus.spec.js` reads that
  container's own children to assert they are the last two. A wrapper is the
  obvious way to build a pill and would have broken both.
- **The caps are run-relative** (`:not(.c + .c)` / `:not(:has(+ .c))`).
  `:first-of-type`/`:last-of-type` are wrong for the same reason CLAUDE.md
  already records for the sort group: they count elements of the same TAG, and
  these `<button>`s are neither the first nor the last button among their
  siblings — the fetch buttons and both menu buttons are buttons too.
- **It has to cancel a flex gap**, which none of the h2/h3 runs do. Those sit
  in inline layout and space themselves with margins; this one lives in a
  `display:inline-flex` bar with `gap: 8px` between every pair of children, and
  a flex gap cannot be suppressed for one pair. One segment pulls back by
  exactly one `--mb-toolbar-gap` — a custom property declared on the bar and
  read by both sides, so the pill cannot split open if that number is retuned.
  **Which segment carries that margin was a real defect**; see below.

**The colours are SETTINGS, not pill CSS.** `sa_ui_settings_btn_style` and
`sa_ui_help_btn_style` keep their own keys; only their DEFAULTS moved to match
`sa_ui_toolbar_menu_btn_style`, with `_SETTINGS_MIGRATIONS` entries naming the
old slate values. So the pill reads as one control by default and a user who
had chosen their own colours keeps them. Forcing one ground in the stylesheet
would have been less code and would have silently overwritten that choice.

Measured by `scripts/probe-toolbar-pinned-pill.js` before any assertion was
written: both halves `rgb(236, 239, 241)`, seam delta **0.0 px**, radii
`6 0 0 6` and `0 6 6 0`, one hairline. A pill is a geometry claim, so the spec
asserts geometry — and asserts the background against `#mb-data-menu-btn`
rather than a literal, because the property is that they AGREE; a literal would
still pass if the menu buttons were recoloured and the pinned pair were not.

### A width sweep found what a single measurement could not

The first version put the gap-cancelling margin on the RIGHT half — the obvious
place, since that is the segment being pulled toward its partner. At 1400px it
measured perfectly: seam 0.0 px, correct caps, one hairline.

The bar is also `flex-wrap: wrap`. Sweeping the viewport from 1400px down in
10px steps found **12 widths where the two halves land on different lines**,
including **1040-1080px** — an ordinary browser window, not a contrived
minimum. On those widths the negative margin pulled ❓ to `bar.x - 8`, i.e.
eight pixels outside the container it belongs to, wearing a square left edge
and no partner.

Moving the margin to the LEFT half fixes the failure mode without preventing
the split: the same pull now only shortens a line that has nothing after it,
and ❓ starts the new line exactly at `bar.x`. Re-measured: overhang 0 at every
splitting width, seam still 0.0 px when they share a line.

**Preventing the split needs a wrapper, and the wrapper costs more than the
split does.** The two must stay DIRECT children of the bar
(`_TOOLBAR_TAIL_ORDER` re-appends them there; the spec reads the container's
own children), so a wrapper means changing the ordering contract and its test
to buy a square corner at a minority of widths. Recorded as a deliberate
trade, not an oversight.

The transferable part: a segmented control's geometry was verified at one
viewport, and one viewport is where this kind of bug hides. The sweep is four
lines in the probe.

### The backtick trap, third recorded occurrence

The CSS comment said "whose \`gap\` applies", inside the `GM_addStyle` template
literal. `node --check` reported `missing ) after argument list` at the
template's OPENING line, 340 lines above the real cause.

**This one was the lucky variant.** CLAUDE.md warns that a BALANCED pair is the
dangerous case because the file stays syntactically valid and only the CSS
after it stops applying. Here the pair was balanced too, but what sat between
the backticks (`gap`) left two adjacent template literals with no operator
between them, so it failed loudly instead of silently. The rule is unchanged
and the comment now carries its own warning: grep the edited region for a
backtick before debugging anything else.

### A correction carried over from the help branch

While checking whether inline styles were safe for the pill, the 9.99.736-745
changelog turned out to say something narrower than I had written into the help
renderer's JSDoc, CLAUDE.md, DEBUG-NOTES and a mutation entry the day before.

What `/account/*`'s `style-src 'self'` blocks is **`<style>` elements and
`style="…"` written into an `innerHTML` template** — 9.99.737's own words are
"built via `container.innerHTML` templates with ~75 inline `style="…"`
attributes, which are blocked by page CSP the same as `<style>` elements".
**CSSOM writes are not blocked**, which is why the entire h1 toolbar sets its
styles with `el.style.cssText` and renders correctly on
`/account/applications`.

So the Markdown renderer, which builds nodes, was never in the blocked case.
The CHOICE of a stylesheet stands — it is what every other panel does and far
less code than a dozen properties per node — but the reason given for it did
not, and it had been used to excuse a mutation as an honest `"expect": "pass"`
("no fixture can see this"). With the reason gone so is the excuse: the
stylesheet's absence is observable as a computed value, the spec now asserts
it, and that mutation is `"expect": "fail"` like the rest. One honest pass
remains, not two.

That is the second wrong-reason correction in two days on this work — the other
being `updateBarcodeHighlightBtnState()` supposedly rewriting `innerHTML`. Both
were plausible, both were load-bearing in a rule that is itself correct, and
both would have licensed a wrong generalisation later.
