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

