<!-- Split out of ShowAllEntityData/CLAUDE.md on 2026-09-27, verbatim (section headings unchanged). This file is the authority for its topic; CLAUDE.md keeps only a digest and the doc map. -->

# release-tracks ARs and track length

## `release-tracks`: dynamic AR-column classification

`release-tracks` does NOT use the generic `columnExtractors`/
`syntheticColumnExtractors`/`injectedColumns` pipeline described above — it
has its own bespoke system, `applyExtractTrackTitleData()`, because it needs
in-place DOM surgery on the Title `<td>` rather than additive per-column
extraction. Every relationship ("AR") on a track lives as sibling
`<dt>label:</dt><dd>target(s)</dd>` pairs inside `<div class="ars"><dl
class="ars">`; a handful of shapes get dedicated columns (Recording of/date,
Recorded at event/place, Recorded in area, Mixed at place, Performer, the
five `CREDIT_ROLES` engineer/producer/mixer/etc. columns, Phonographic
copyright by artist/label, Produced for label, Instruments, Vocals) and
everything else is auto-discovered. Column order is controlled purely by the
SEQUENCE these insertion blocks run in inside `applyExtractTrackTitleData`
(all `.before()` against one shared `_arsHeaderRef` — see the "Common
pitfalls" entry below) — check that block first before assuming a column's
position needs a new mechanism.

**`_classifyArDt(dt)`** is the single source of truth for "what kind of AR
relationship is this `<dt>`", checked in priority order:

1. **Fixed handler** (`_dtMatchesAnyFixedHandler`) — matches any of the
   dedicated columns above via the same `roleWords`/`_creditDtMatch`
   machinery those columns already use.
2. **Instrument/Vocals** (`_parseInstrumentVocalsDt`) — a `<dt>` whose
   content is ENTIRELY instrument credit(s) and/or a vocals credit (with
   recognized attribute-word prefixes: additional/guest/solo/lead/
   background/spoken/choir). A single unrecognized word anywhere rejects
   the WHOLE `<dt>`, not just one component — this is what correctly keeps
   e.g. `<dt><a href="/instrument/…">strings</a> arranger:</dt>` OUT of
   "Instruments" ("arranger" isn't a recognized attribute word), leaving it
   for the dynamic fallback to claim as its own "Strings arranger" column.
3. **Dynamic fallback** — anything else gets bucketed by its own literal
   phrase text (`_dynamicRolePhraseKey`, lowercased/whitespace-collapsed) into
   an auto-created column, sentence-cased for display
   (`_dynamicRoleDisplayName`). Two different phrases NEVER merge (e.g.
   "strings arranger:" and "cello arranger:" become two separate columns) —
   simple, predictable, and immune to future MusicBrainz relationship types
   without a code change.

Both the page-wide "does any track need this column" scan and the per-row
`<td>` builder call `_classifyArDt` — never re-derive the classification
independently at a new call site, or the two can silently disagree.

**Entity-kind column-name uniqueness** (`_splitColumnByEntityKind`/
`_buildKindSplitListTd`, generalized from the original "Phonographic
copyright (℗) by artist"/"…by label" special case): when a relationship's
targets span more than one entity kind on the page (detected via each
target's own `<span class="{kind}link">` marker — `KNOWN_ENTITY_LINK_KINDS`
lists every kind actually seen: recording/artist/label/place/event/work/
area/series — `recording` was added later, for dynamic recording-to-
recording columns like "Samples"/"Music videos"), the column CAN split into
one per kind, named `` `${baseColumnName} ${kind}` ``.
A single-kind relationship's column name is never suffixed.

**`PEER_SPLIT_KINDS` — only `artist`/`label`/`recording` may ever trigger
that split.** This is a load-bearing distinction, not an arbitrary
restriction — two different relationship *shapes* share the same
`<span class="{kind}link">` marker syntax but need opposite treatment:
- **Peer-shaped** (artist/label/recording): repeated markers of the same or
  different peer kind mean MULTIPLE DISTINCT credited entities
  (comma/"and"-joined artists, or a mix of artists and labels — see
  `_buildPhonographicCopyrightTds`; comma/"and"-joined source recordings on a
  dynamic-fallback column like "DJ-mix of", a 26-target credit — the
  `debug/DJ-mix-of-original.html` snapshot this used to cite is gone, so see
  `DEBUG-NOTES.md` for the dated entry instead). Each marker is a real segment
  boundary. `recording` is
  safe here specifically because a credited recording's own artist marker
  (`<span class="artistlink">`) always sits nested inside a `<bdi>`, never as
  a direct child of `<dd>` — so it never itself competes as a second kind, and
  `_collectEntityKinds` reports only `{recording}`, keeping the column
  unsplit/unsuffixed even with multiple targets.
- **Chain-shaped** (place/event/work/area/series): a SINGLE primary target
  (if any) accompanied by its own nested geographic/hierarchical decoration
  that legitimately reuses `arealink` repeatedly — e.g. a place's own "in
  `<area>`, `<area>`, `<country>`" chain, or an area crediting its OWN parent
  area (`"recorded in:"`, `"mixed at:"` — see `debug/therising.html`).
  Marker KIND alone can't tell "the credited target" from "its own
  decoration" here, sometimes not even marker IDENTITY (an area's own
  ancestry reuses the exact same `arealink` class as the area itself).
  `recording` deliberately stays OUT of this category: a dynamic-fallback
  recording-to-recording relationship never nests a `recordinglink` inside
  another as its own "decoration" the way an area nests its own ancestry.

Treating a chain-shaped relationship as peer-splittable is exactly the bug
that shipped once already: "mixed at:" fragmented into separate "…place"/
"…area" columns, and "recorded in:" showed only its first area, dropping the
rest of the chain and the trailing date. Any relationship shaped like that
needs its OWN dedicated handler (`_buildRecordedAtPlaceTd`/
`_buildRecordedInAreaTd` — segment on the ONE primary marker only, or don't
segment at all when cardinality is 1) rather than the generic kind-splitter;
the dynamic-fallback discovery scan (`_dynamicRoleColumns`) always filters
through `_filterPeerKinds` before calling `_splitColumnByEntityKind`/
`_buildKindSplitListTd`, so an unrecognized FUTURE chain-shaped relationship
safely falls back to `_buildKindSplitListTd`'s `kinds.size === 0` "clone
whole `<dd>` verbatim, one row" behavior instead of fragmenting.

**Runtime `collapsableColumns`/header-glyph registration**:
`initCollapsableColumns()` and `_initColHeaderGlyph()` both match columns by
exact header-text string only — no wildcard support — so a
dynamically-discovered column's name (unknown at authoring time) can't be a
pre-declared page-definition entry or a static `_initColHeaderGlyph()` call.
Instead, `applyExtractTrackTitleData(def)` pushes each dynamic column's name
onto `def.features.collapsableColumns`, and — via `_glyphClassForDynamicColumn`,
which picks the first entity kind present by priority order (whether the
column carries exactly one kind or several, e.g. a chain-shaped multi-kind
decoration) — a `{columnName, glyphClass}` pair onto
`def.features._dynamicArColumnGlyphs`,
both at `<th>`-creation time (dedup-guarded, since this function can re-run
per its own idempotency design). This works because `def` is the exact same
object reference as `activeDefinition`, and `applyExtractTrackTitleData`
always runs (during `startFetchingProcess`) before `initCollapsableColumns()`/
the glyph re-injection loop are ever called (from `renderGroupedTable()`'s
tail) — a NEW static/fixed AR column (not dynamically-discovered) still
needs its OWN explicit `_initColHeaderGlyph('Column Name', 'kindlink')` call
added to that tail, mirroring the existing ones for "Recording of
work"/CREDIT_ROLES/etc. — don't forget it, or the header silently renders
with no icon (exactly the second half of the bug above).

## `release-tracks` has TWO AR levels, and the finders must not be merged

Everything above describes the RECORDING's own relationships. A track also
carries the **work's** — and they live one nesting level below, inside the
`<dd>` of the `recording of:` `<dt>` (`debug/work-ARs.html`):

```
td.title > div.ars
  dl.ars > dt "recording of:"
           dd  > a[/work/…]
                 dl.ars > dt "publisher:"              (artist)
                          dt "lyricist and composer:"
                 dl.ars > dt "publisher:"              (label)
                 dl.ars > dt "is based on:" ×3
```

**`_findAllArDts()` is `:scope > dl.ars > dt` and must stay that way.** That
scoping is why the work `<dt>`s reach neither `_classifyArDt()` nor the
dynamic-fallback scan — correct, since they are the work's relationships and
not the recording's, and also why they rendered nowhere but the raw "ARs"
column for the whole life of the feature. `_findWorkArDts()` is the second
finder; widening the first one instead would merge two relationship levels
into one set of columns.

Everything downstream is the dynamic-fallback mechanism re-used verbatim —
`_collectEntityKinds`, `_filterPeerKinds`, `_splitColumnByEntityKind`,
`_buildKindSplitListTd`, `_glyphClassForDynamicColumn`. What differs is the
keying, and each difference is load-bearing:

- **A separate `_workRoleColumns` Map, and a `work ` key prefix**
  (`WORK_AR_KEY_PREFIX`). A work `arranger:` and a recording `arranger:` are
  different relationships between different entities. Sharing a Map buckets
  them together; sharing a column NAME is worse, because the header block's
  own `_headerCells.some(...)` dedup then silently drops the second one.
- **`_workRoleComponentKeys()` SPLITS on `,`/` and `** — the exact opposite of
  `_dynamicRolePhraseKey`'s "two different phrases NEVER merge" rule, and
  deliberately so. On Born to Run seven tracks say `lyricist and composer:` in
  one `<dt>` while the eighth states the roles separately; unsplit that is
  three part-filled columns instead of a full `Work lyricist` and
  `Work composer`. The split pattern is `_creditDtMatch`'s own, so the two
  agree on what a component is. A `<dt>` yielding two keys feeds BOTH columns
  from its one `<dd>`.
- **`work` stays OUT of `PEER_SPLIT_KINDS`.** `is based on:`'s multi-row cell
  comes from its three sibling `<dt>`s through `_buildKindSplitListTd`'s
  `kinds.size === 0` branch, not from peer splitting. Adding `work` there
  would be a different change with the chain-shape risk that JSDoc describes.
- **Never `.find()` a work `<dt>`.** `is based on:` is three `<dt>`s on one
  track — the same shape already fixed twice, for
  `_findPhonographicCopyrightDts` and `_findRecordedAtDt`.

**`def.features._workArColumnNames` is a second registry beside
`_dynamicArColumnGlyphs`, on purpose.** The glyph array records only a column
that RESOLVED a glyph, and "is this an extracted column" (the header tint) is a
different question from "does it have an entity icon". Every work relationship
in real data credits an artist, a label or a work, so the two lists are
identical today and no fixture can tell them apart — recorded as an honest
`expect: "pass"` in the mutation list rather than left looking covered.

**Placement is part of the requirement, not a detail.** The columns sit between
`Recorded in area` and `Performer`, so a track reads recording → the work it
records → who played on it → raw ARs. Header creation order and row `<td>`
append order are mirrored by hand, as everywhere else in this function, and
`_workColumnThs.length === 0` had to join the row loop's no-op early return —
otherwise a table whose ONLY new columns are work ones keeps its `<th>`s while
every row comes up short.

Gated by `sa_enable_release_tracks_work_ar_columns` (default **true**), read as
`!== false`. Covered by `tests/fixtures/release-tracks-work-ars.spec.js`, which
reuses the committed `release-tracks-ms-length.html` fixture (the real Born to
Run page — it already carries every shape this needs); mutation list
`scripts/mutations/release-tracks-work-ars.json`.

## Track length precision (`Length` column) and the `treleases` trap

**`treleases` is a NATIVE MusicBrainz class**, not a jesus2099 marker. A
release page renders its Length column as `<th class="treleases">` plus one
`<td class="treleases">` per track — verified in
`tests/snapshots/release-tracks/raw.html`, which the Playwright harness
captures with only this script loaded (9 occurrences, zero `jesus2099`
strings). jesus2099's `RECORDING_LENGTH_COLUMN` merely REUSES that class name
on the page types MusicBrainz does not mark (work, artist-relationships,
place-performances), and never adds it alone — the same statements also set
its own script name as the `title` and, on the header, a yellow
`text-shadow`. `_isJesus2099Treleases()` tests for exactly that
co-occurrence and is the ONLY correct way to ask "did jesus2099 put this
here"; three separate call sites once keyed on the bare class and were each
deleting native markup (see git log). Anything new that touches `treleases`
must go through that predicate.

**A `title` THIS script writes is not evidence of jesus2099**, and the
carve-out is load-bearing. The predicate's cheapest discriminator is bare
`title` presence — sound only because nothing else ever put one on a Length
`<th>`/`<td>`. `_initLengthColHeaderTooltips()` now does, and without the
exemption it made the predicate report the release tracklist's own NATIVE
header as jesus2099's: `purgeJesus2099Artifacts()` then stripped
MusicBrainz's `treleases` class off it and removed the tooltip again on
every render — the exact destructive failure above, reintroduced from a
completely unrelated direction. Our tooltips carry `data-mb-col-tip`, and
BOTH bare-`title` call sites (`_isJesus2099Treleases()` and
`_stripJesus2099InTable()`'s disposition-3 title removal) go through
`_isOwnColumnTooltip()`. Anything that puts a `title` on a `treleases`
`<th>`/`<td>` must mark it the same way.

`purgeJesus2099Artifacts()`/`_stripJesus2099InTable()` strip every remaining
jesus2099 artifact from the tables this script renders — header row included,
plus the captured source rows in `groupedRows`/`allRows` (cleaning only the
live DOM would let the next `runFilter()` keystroke paste them back from the
clones). Scope stops at `table.tbl`: jesus2099's features on the surrounding
page keep working. The cover-art icon family is deliberately EXCLUDED — it
already has its own `_hadInlineArtPh`-gated handling in
`applyColumnErasers()` Strategy 2 / `_stripTransientCellState()`.

**Sorting** goes through `_sortColumnKind()` (`'duration'`/`'numeric'`/
`'text'`) for BOTH `createSortComparator()` and
`createMultiColumnComparator()` — they used to disagree. `_compareDurations()`
returns a DIRECTION-FINAL number, which is how `"?:??"` is pinned last in
both directions; a caller must never negate it, and only its `0` may fall
through to a tie-breaking column.

**`release-tracks` has a SECOND duration column, "Recording length"**, fed by
`tracks[].recording.length` from the same embedded payload
(`_buildReleaseRecordingLengthMap()`), inserted right after the native
"Length" by `applyExtractTrackTitleData()`. It is page-wide-gated by
`_releaseHasDifferingRecordingLength()` — added ONLY where some track's
recording length is present AND disagrees with its track length, so it can
never render as an exact copy of "Length". A track length with no recording
length behind it deliberately does not qualify (that alone would be a column
of `?:??`). Its cells carry the same `data-mb-ms`/`data-mb-sec-text` stamps,
which is the whole reason the single ⏱ button switches both columns:
`_msApplyLengthPrecision()` rewrites every `td[data-mb-ms]` on a row, NOT one
resolved column index. Independent of `sa_enable_ms_track_length` — that
setting governs the toggle and the stamping, not whether the column exists.

**"Recording length" also shares "Length"'s 📊 unique-values-dropdown
sections** ("Length info - Duration/Deviation/Milliseconds/Live status" — see
`docs/claude/uniq-dropdown.md`), gated by the same `isLengthCol` check in
`openUniqDrop()` (widened to match either column name) — the same section
labels/glyphs render for both, disambiguated only by which column's dropdown
is open, never two open at once. The reference average behind "Deviation"
(`_getLengthColumnAverages(table, lengthColName)`) is computed INDEPENDENTLY
per column, never shared, because the whole reason this column exists is that
it can disagree with "Length" — reusing Length's average would misclassify
Recording length's own deviation buckets. `_structureModeTooltip()`'s hover
text likewise names whichever column is open, not always "Length".

**Track-vs-recording length mismatch flagging** (`_lengthMismatchFlag()`/
`_applyLengthMismatchFlag()`, release-tracks only) marks BOTH duration cells
when the two lengths differ by more than `sa_release_tracks_length_mismatch_threshold_ms`
(default 1000), promoting `⚠️` to `❌` past `threshold × sa_release_tracks_length_mismatch_severe_factor`
(default 3). The severe level is disabled whenever that product is not
strictly greater than the threshold — a factor of 1, or a threshold of 0.

**The marking is ATTRIBUTES ONLY (`data-mb-len-flag`), with the tint and the
glyph both coming from CSS (`td[data-mb-len-flag]::after`).** All three
reasons are load-bearing, and two of them are silent if broken:
- `applyIntegerColumnStyling()` rebuilds these cells with
  `cell.textContent = ''` to build the `:`-alignment spans, so a marker
  appended as a CHILD is simply deleted.
- A glyph in the cell TEXT reaches `_compareDurations()`, which parses this
  column's rendered text — the flagged row would sort as if its duration were
  unparseable — and would also widen that one row's colon-split segment.
- Attributes survive `cloneNode(true)`, so the marking needs NO re-wire hook
  on any render path. A JS-painted marker would need one on every path.

The `<td>`s also carry `data-mb-col-tip` alongside their `title`, for the
same reason the headers do — a native Length `<td>` is `class="treleases"`,
and `_isJesus2099Treleases()` reads "a treleases cell with a title" as
jesus2099's. See the `treleases` section above.

**What attributes do NOT survive is serialization.** Save to Disk and the
sub-table handoff store a cell as its `innerHTML` (`_buildDiskCellData()`), so
until this was fixed a reopened tracklist lost every flag, tint and LENGTH
button — no error, the table just looked clean. The writer now records
`lenFlag`/`lenTip` in the cell record, and `_restoreLenMismatchFlag()` puts them
back from BOTH of `_hydrateAndRenderFromSnapshotData()`'s cell loops. Three
things about it are deliberate:
- **Restored as saved, never re-derived.** The millisecond values the
  comparison needs do not survive a snapshot either (`data-mb-ms` — see the
  millisecond section below), so there is nothing to recompute from. Only the
  on/off switch is honoured on load.
- **Allowlisted.** A saved file is user-supplied data: only `warn`/`severe`
  reach `data-mb-len-flag`, and the tooltip only as a string.
- **The reader re-sets `data-mb-col-tip`**, or a SECOND save would refuse the
  tooltip (the writer takes a title only when that marker says it is ours).
  Only the save-again test in `len-flag-disk-roundtrip.spec.js` sees this.

Any other `<td>`-level state a feature needs after a reload has the same
problem, and the rel cell's `mbid`/`relDone` is the older precedent for the
same fix.

**Filtering to the flagged tracks goes through the ⚠️ WARNING / ❌ ERROR
findings menus** (docs/claude/findings.md), which replaced the filter bar's
`(N) LENGTH ⚠️`/`(N) LENGTH ❌` summary buttons. The `len-warn`/`len-severe`
findings read this same `data-mb-len-flag`; being `coFlagged`, a menu row ticks
its 📊 "Findings - …" entry in the **Length** column of every table only —
both duration cells carry the same kind, so one column suffices, and ticking
"Recording length" too would only AND the same rows. The two severities
partition the flagged set; ticked together they OR, like two 📊 ticks in one
column. Three lessons the buttons taught still hold, now for the findings
menus' own row filter (`_findingRowFilter`):
- **`_buildFilterKey()` must include a structural filter.** A filter no input
  holds appears nowhere else in the key, so "no query, no column filters"
  hashed identically whether it was on or off — `_filterResultCache` returned
  the previous pass's rows and pressing the button a second time did nothing
  at all.
- **Counts read the SOURCE rows, not the live tbody.** `runFilter()` REMOVES
  non-matching rows from a multi-table tbody rather than hiding them, so a
  live-DOM tally reports only what the current filter left — filtering to ⚠️
  made the ❌ button vanish.
- **A filter no input holds must count as active** in
  `updateFilterButtonsVisibility()`, or the rows narrow while every "clear"
  affordance stays hidden; `clearAllFilters()` resets it explicitly too.
- **The ⏳ pending-edits counts are memoized per source-row ARRAY**
  (`_sourceRowTally()`, PERFORMANCE.org Step 26), validated by the array's
  length, with no invalidation hook: every way the row set changes — fetch,
  hydrate, sort, resume — replaces or grows an array, and `span.mp` exists
  before capture. Don't "simplify" the key to the length alone: two same-sized
  sub-tables would then share one answer, and `source-row-tally-memo.spec.js`'s
  multi-table fixture is built to catch it. The findings menus' tally
  (`_findingRowTally()`) needs one more input, a stamp generation, because
  `stampFindings()` writes into rows that are already captured.
The menu counts TRACKS, not cells — each flagged track marks two.

**Millisecond precision** is opt-in per page via the `▶⏱`/`▼⏱`
`.mb-ms-col-hdr-btn` prepended to the Length header's `.mb-col-hdr-flex`
(same slot/idiom as `.mb-caa-col-hdr-btn`), gated by
`sa_enable_ms_track_length`. Key invariants:

- Source is **`tracks[].length`**, never `tracks[].recording.length`. Those
  are different MusicBrainz fields and differ constantly (4 of `Born to Run`'s
  8 tracks, one by 3 s). MusicBrainz renders the TRACK length ROUNDED, so the
  contract is "reveal more precision in the number already shown", never
  "show a different measurement". The recording's own length is not
  discarded, just kept out of THIS column — it feeds "Recording length"
  above, where showing a different measurement is the point.
  `_msStampReleaseTrackLengths()` enforces it
  with a round-trip check and discards any value that disagrees with the
  seconds MusicBrainz rendered.
- `data-mb-sec-text` stores the original seconds string verbatim; toggling
  back restores it rather than recomputing (MusicBrainz rounds, so `3:11.666`
  must return to `3:12`, not `3:11`). Both stampers refuse to stash a
  millisecond-shaped string there — if the cell already displays milliseconds
  they derive the seconds form via `_msFormatSeconds()` instead, or switching
  the toggle OFF would "restore" milliseconds.
- **Millisecond display must be reset on CAPTURED and HYDRATED cells only.**
  `captureSubtableSnapshot()` stores `cell.innerHTML`, so the `<td>`'s own
  `data-mb-*` never survives the sub-table handoff — only the rendered
  `"11:17.000"` text does — and the destination then re-stamped it as if it
  were MusicBrainz's seconds. `_msResetCarriedOverPrecision()` recovers the
  seconds form from the text and is called from `getCleanCellHtml()` (capture)
  and both `_hydrateAndRenderFromSnapshotData()` cell loops. **Do NOT put it in
  `_stripTransientCellState()`** — that helper looks like the natural home, but
  `runFilter()` also calls it on the live re-render clones, so the reset would
  undo the toggle on every keystroke (tried; it broke five tests).
- State lives in the DOM (`data-mb-ms-shown`), not a module variable, so it
  survives `cloneNode(true)` re-renders for free — and travels with a
  sub-table opened in its own tab, whose rows are hydrated from a snapshot
  and so can arrive already rendered at millisecond precision.
- **`_initMsLengthColHeaderToggle()` is hooked at the END of
  `makeTableSortableUnified()`, and that is the only correct place.** That
  function is what builds the `.mb-col-hdr-flex` the button lives in (it wipes
  `th.innerHTML` first), so it is the one site guaranteed to run after the
  layout exists. Every other candidate has to *know* it runs late enough, and
  two didn't: `startFetchingProcess()`'s single-table branch and
  `_hydrateAndRenderFromSnapshotData()` both call `renderFinalTable()` — whose
  tail also tries — several steps BEFORE reaching it, so the button was
  silently never injected on `tableMode: 'single'` pages or on a sub-table
  tab. Don't add a fourth per-caller call site; extend the hook.
- Toggling rewrites the SOURCE rows then calls `runFilter()`; filters, sort
  order and highlighting come along because every consumer reads the rendered
  text — but only because THREE caches are dropped first, none of which can
  notice a text change on its own: the uniq-dropdown cache (its key is the
  visible row set), `_filterResultCache` (its key is the filter inputs, so an
  active Length filter would replay its pre-toggle rows), and each rewritten
  row's `_rowTextCache` entry (`cols[cellIndex] = undefined`, `full = null` —
  the two DIFFERENT sentinels, AUDIT.md §4), which `testRowMatch()` reads even
  on a result-cache miss. The last two were missing until the async-population
  audit; `tests/fixtures/ms-length-filter-after-toggle.spec.js` pins each one
  separately (its isolation test flips the key, so it cannot be served a
  replay).
- `_msLengthSource()` is the single answer to "where can this page's
  milliseconds come from", checked in cost order: `'embedded'` (release pages —
  already in the page's own `<script type="application/json">` at
  `$.release.mediums[].tracks[]`, so stamped during pre-processing, no
  network), `'ws2'` (ONE lookup of the page entity, declared per pageType via
  `features.msTrackLengthWs2` — work/artist-relationships/place-performances/
  area-recordings have NO length data in the page at all, confirmed by
  `scripts/probe-work-page-json.py`), `'batch'` (SEVERAL requests keyed on the
  rendered recording MBIDs, `features.msTrackLengthBatch`), or `null` (no
  toggle offered). All three branches must stay O(1) — `_initMsLengthColHeaderToggle()`
  calls this on every render specifically to avoid a row walk, which is why
  `'batch'` keys off the feature flag alone rather than checking for recording
  links.
- Both fetching sources are LAZY: `_msToggleLengthPrecision()` fires them on
  the first press only, never during render. `_msToggleInFlight` guards a
  double click.

**`'ws2'` vs `'batch'` — pick by what the page's table IS**, not by entity
type. `'ws2'` works only where the table is one entity's own relationship
list, so a single `inc=recording-rels` answer covers it; verified per entity
with `scripts/probe-ms-browse-endpoints.py`. An `area`'s answer covers its
recordings page exactly (Asbury Park: 24 relations, 24 rows). An
`instrument`'s returns **zero** relations for a page listing 100 recordings —
MusicBrainz models instrument credits as artist-recording relationships
carrying an instrument attribute — so `instrument` is deliberately absent from
`_msWs2PageKey()`'s regex and uses `'batch'`.

**The `'batch'` source uses the SEARCH endpoint, not the browse endpoint,
and that is load-bearing.** `/ws/2/recording?query=rid:(m1 OR m2 …)` costs
`ceil(rendered rows / 100)`; `/ws/2/recording?artist=…` costs
`ceil(the artist's whole catalogue / 100)` — 746 requests for Bruce
Springsteen (`recording-count: 74540`) whether the page shows ten rows or ten
thousand, and it cannot serve instrument/isrc/search at all.
`_MS_BATCH_SIZE = 100` is a **measured** ceiling
(`scripts/probe-ms-rid-batch-size.py`): 150 MBIDs is accepted but silently
capped by the endpoint's own `limit`, 200 is `HTTP 414 URI Too Long`. Values
come back identical to the browse endpoint's.

- **`_msCollectRecordingMbids()` is the "what is still outstanding" list**, and
  three exclusions matter: already stamped, already answered in
  `_msBatchMemCache` (INCLUDING answered as `null`/"no length on record" — such
  a row is never stamped, so without this it looks like pending work forever),
  and a Length cell that does not parse (`"?:??"` has no seconds text to
  round-trip an answer against). Its emptiness is what tells
  `_msToggleLengthPrecision()` there is nothing left to fetch. Exposed to tests
  as `__saTest.msPendingLengthLookups()` because none of this is visible in the
  DOM.
- **A partly-failed batched run is its own outcome (`'partial'`), not a
  success and not an error.** Failed batches cache nothing, so the rows that
  arrived are shown while the button keeps the yellow retry tint, and pressing
  the toggle off and on again re-requests exactly the outstanding MBIDs. This
  is why `needFetch` in `_msToggleLengthPrecision()` cannot simply be
  `!_msAnyStamped()` — that would strand the gap permanently, since partial
  data makes `_msAnyStamped()` true.
- **The L2 cache is keyed per RECORDING, not per page** (`ms-rec-len` store,
  `_msIdbGetLength`/`_msIdbPutLengths`, gated by `sa_ms_idb_enable`/
  `sa_ms_idb_ttl_days`). A recording seen on one pageType is free on every
  other one that lists it. `null` is cached deliberately — "MusicBrainz has no
  sub-second length for this recording" is a stable fact, and caching it is
  what stops a page of length-less recordings re-requesting them every visit.
- **`recording-releases` is deliberately excluded and must stay that way** —
  its rows are RELEASES carrying no `/recording/` link at all, and its Length
  is the per-release TRACK length, a different stored field from the
  recording's own. Same correctness objection as `release-discids`'
  TOC/sector-derived Length. Doing it properly needs a release-keyed source
  (`/ws/2/release?recording=<mbid>&inc=media+recordings`). The reasoning is
  repeated as a comment on the pageDefinition itself, because the pageType sits
  among neighbours that all DO have a source.
- **Only a SUCCESSFUL answer is cached in `_msWs2Cache`** — including a
  successful-but-empty one, which is a real, stable fact about the entity. A
  transport failure (any non-OK status or thrown error) is deliberately NOT
  cached: MusicBrainz's Web Service 503s under bot load, and caching that
  turned a few seconds of upstream trouble into a permanently dead button
  *and* claimed "no sub-second length on record", which was simply untrue.
  `_msFetchWs2RecordingLengths()` therefore returns
  `{outcome: 'ok'|'empty'|'error', map, detail}` (the batched sibling adds
  `'partial'`), and the button has five states: `loading` (⏳, carrying
  `"2/5"` batch progress when there is more than one), `retry` (yellow, still
  clickable, names the error, not cached), `partial` (yellow, pressed, some
  rows shown and the rest retryable), `unavailable` (dimmed +
  `aria-disabled`, the settled "no data" answer, cached), and normal. Never
  collapse `retry` back into `unavailable` — they are different facts and only
  one of them is worth a second click. Per-batch 503s are retried three times
  with a widening backoff before a batch is called failed, because MusicBrainz
  fails in bursts (measured at roughly one request in three during this work).
- MusicBrainz DOES populate the Length column natively on those pages
  (`scripts/probe-native-work-length.js` reads back `5:05`/`5:35`/`?:??`), and
  it rounds there too — so `data-mb-sec-text` round-tripping and the
  round-trip discard check are both meaningful, and the check doubles as a
  guard against a mis-resolved column index.

## Video column: video recordings on a medium that cannot carry video

A recording's "is a video" flag belongs to the RECORDING; a medium's format
belongs to this RELEASE. When a video recording sits on a medium whose format
cannot carry video at all, one of the two is wrong, and the Video cell says so:
`data-mb-video-flag="mismatch"`, painted by the same CSS rules as a far-over
length mismatch (light red, ❌, `sa_release_tracks_length_mismatch_severe_bg`).
A video recording on a video-capable medium gets `"ok"`, which paints nothing
but lets the 📊 "Video info - Medium format" section count both sides.
Setting: `sa_enable_release_tracks_video_medium_flag` (default on).

Rules that fail silently if broken:

- **The verdict is keyed by format ID, not name.** `MEDIUM_FORMAT_VIDEO_CAPABLE`
  holds every MusicBrainz format (115 as of 2026-10-01) as
  `id → {name, video: true|false|null}`. `_mediumFormatId()` reads the id from
  the embedded payload (`release.mediums[].format.id`), matched by the medium
  GID that `applyNormalizeMediumTracklists()` stamps on the table
  (`data-mb-medium-gid`) — never by position. MusicBrainz translates format
  names, so the name lookup (`data-mb-medium-format`, the header text, cut at
  `": "` for a titled medium) is only the fallback for a page with no payload.
- **Only a positive "cannot" flags.** `false` is reserved for formats that
  definitely cannot carry video (audio CD and its variants, SACD, every
  phonograph record, audio tape/cartridge, mechanical formats, the CD side of
  DualDisc/DVDplus/VinylDisc). Data carriers (Digital Media, Data CD, Enhanced
  CD, Mixed Mode CD, SD/USB/floppy, Download Card, KiT Album) are `true`;
  "Other" is `null`; an id missing from the table is treated as `null`. A
  format MusicBrainz adds later therefore never flags — and
  `release-tracks-video-medium-flag.spec.js` compares the table against
  `tests/fixtures/medium-formats.html` (the release editor's own `<select>`)
  so the omission is noticed instead.
- **Attributes only**, for `_applyLengthMismatchFlag()`'s reasons: they survive
  `cloneNode(true)`, and the Video column sorts and filters on its hidden
  `video`/`audio` sort key, which a glyph in the text would disturb. Stamped
  during pre-processing, so no post-render cache is involved.
- **Save/Load to Disk** carries it as `videoFlag`/`videoTip` in the cell record
  (`_buildDiskCellData()` / `_restoreVideoMediumFlag()`), validated to
  `mismatch|ok`, and the on/off setting wins over a saved flag.

Fixtures are real pages saved with their payload by
`scripts/fetch-release-fixture.js` (Playwright, because musicbrainz.org answers
a plain HTTP client with a JavaScript proof-of-work page as of 2026-10-01):
`release-tracks-video-on-cd.html` (four videos on a CD) and
`release-tracks-video-on-dvd.html` (five videos on a DVD-Video beside a CD).

## Title column: recordings with no associated work

A track whose recording links no work (empty "Recording of work" cell) gets
`data-mb-work-flag="none"` on its **Title** `<td>`, stamped by
`_applyNoWorkFlag()` in the row loop's `_recOfTh` block — the `else` of the
`_workAnchor` test, so the flag and the column can never disagree. Painted with
the over-threshold length look: `sa_release_tracks_length_mismatch_warn_bg`
and a ⚠️ `::after`. Setting: `sa_enable_release_tracks_no_work_flag`
(default on). The 📊 "Title info - Work" counts do NOT depend on it — they read
the row's "Recording of work" cell directly.

Rules that fail silently if broken:

- **The Title column is the sticky one.** Its inline `position: sticky` must
  keep beating the rule's `position: relative` (so no `!important` on
  position — a sticky cell is a containing block for the absolute glyph
  anyway), and its inline `background` must LOSE to the tint (so `!important`
  on background-color, which also beats MusicBrainz's zebra rule).
- **Attributes only**, as for the other two flags: the Title cell is emptied
  (`_titleTd.innerHTML = ''`) and rebuilt later in the same loop, which keeps
  attributes, and the glyph never reaches filter or sort text.
- **Save/Load to Disk** carries it as `workFlag` alone (the tooltip is a fixed
  text, re-supplied by `_applyNoWorkFlag()`); `_restoreNoWorkFlag()` accepts
  only `none` and honours the setting.

Spec: `release-tracks-no-work-flag.spec.js`; mutations in
`scripts/mutations/uvd-title-sections.json`.

## /disc/<n>#<track>: the targeted track's highlight

`/release/<mbid>/disc/<n>` is the release page scrolled to one medium; with
`#<track MBID>` MusicBrainz highlights that track through CSS `tr:target > td`
(rgb(242, 242, 178), measured live 2026-10-01). Supported by a dedicated
`@include` line (optional `?query`, optional `#fragment`) and the
release-tracks matcher's optional `(?:\/disc\/\d+)?`.

Rules that fail silently if broken:

- **`:target` cannot survive the render.** It matches the ONE element the
  browser resolved the fragment to, and multi-table render shows clones. So
  `_stampTrackTarget()` sets `data-mb-track-target` on the SOURCE row, from
  `applyExtractTrackTitleData()` before rows are captured, and CSS repaints
  from that attribute. Compares `row.id` as a string — never builds a selector
  from the fragment.
- **Flags win over the target tint.** The rule excludes cells carrying
  `data-mb-len-flag`, `data-mb-video-flag="mismatch"` or `data-mb-work-flag`.
- **Scroll once.** `_scrollToTrackTarget()` runs from `renderGroupedTable()`'s
  tail, i.e. on every filter and sort; `_trackTargetScrolledFor` stops it after
  the first time per target.
- Not handled: a later `hashchange` (pointing at another track without a
  reload) does not move the marker.

Spec: `release-tracks-track-target.spec.js`; mutations
`scripts/mutations/release-tracks-track-target.json` (the `!important` entry is
`expect: pass` — see its `why`).

## Live recordings: credit dates, events per medium, event/place vs comment

org/live-bootleg.org item 3. **Performer** joined the live-date check
(`_liveDateCtx` passed to its `_buildCreditListTd()`), so six columns are
checked now. Each row is stamped with `data-mb-event-key` in
`stampFindings()`'s pass (first "Recorded at event" name, else the event its
comment names, else "Recording date"); a medium with 2+ keys gets the
"🎪 N events" h3 badge and the 📊 "Event info - Events on this medium"
section on Disambiguation. `rec-event-mismatch`/`rec-place-mismatch` compare
the comment with the event name and with the place name (= the venue, the
location's first part). See docs/claude/findings.md.

**Fixture trap: a freshly fetched release page re-renders itself.**
`tests/fixtures/release-tracks-multi-event.html` came from
`scripts/fetch-release-fixture.js`, so its `static.metabrainz.org` bundle
hashes are CURRENT: loaded as a fixture, MusicBrainz's own release script
downloads and re-renders the tracklist from JSON, discarding the recording
comments `scripts/build-multi-event-fixture.py` put into the server markup.
Older fixtures name bundles that no longer exist, which is the only reason
they never hit this. `release-tracks-event-consistency.spec.js` aborts
`static.metabrainz.org/**`; any spec on a newly fetched release page must too.
