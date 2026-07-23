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
