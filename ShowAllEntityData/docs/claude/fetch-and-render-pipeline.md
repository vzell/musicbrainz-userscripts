<!-- Split out of ShowAllEntityData/CLAUDE.md on 2026-09-27, verbatim (section headings unchanged). This file is the authority for its topic; CLAUDE.md keeps only a digest and the doc map. -->

# Fetch and render pipeline

## `startFetchingProcess()` is entered TWICE only by a resume — a second press reloads

Anything that reasons about "what happens when the fetch runs again" has to
start here, because the obvious answer is wrong. A second press does not
re-enter the function:

```javascript
// Reload the page if a fetch process has already run to fix column-level
// filter unresponsiveness
if (isLoaded && !_isResume) {
    sessionStorage.setItem('mb_show_all_reload_pending', 'true');
    window.location.reload();
    return;
}
```

Nothing re-presses after the reload — init only clears the flag — so the error
arm's own advice, *repress the "Show all" button*, means **reload, then press
again**. Do not read that comment as evidence that the render tail is exercised
a second time on a live page; it is not, and building item 5 on that inference
cost five stalled spec runs whose only symptom was a renderer blocked so hard
that `page.evaluate()` timed out (DEBUG-NOTES.md, 2026-09-20).

**The `_isResume` exemption is the ONE way back in**, and it is deliberately
narrow. `startFetchingProcess(e, buttonConfig, baseDef, resumeFrom)` with a
`resumeFrom` record changes exactly six things and nothing else:

1. the page count is reused from the record, not re-probed — and its two
   threshold dialogs stay shut, so the user is not asked twice about the same
   pages;
2. the four HEADING pre-processing steps are skipped (see the defect below);
3. the artist-releasegroups official-headers pre-fetch, and the
   `h3_*_category_header_array` reset that sits **in front of** its pageType
   guard, are skipped — that reset is unconditional and would otherwise empty
   the very arrays the accumulator guard protects;
4. the row accumulators are **not** cleared — `allRows`, `groupedRows`,
   `_mbRowIdxCounter`, `expandedCells`, `_inlineArtSettled`,
   `_areaFlagRegionCorrected`, `_seenTopCdStubHrefs`, the `h3_*` arrays;
5. the loop starts at `resumeFrom.nextPage`;
6. the "this page is the page we are standing on, use `document`" shortcut is
   disabled — by then the render has replaced the live table with the
   consolidated one, so it would re-extract this script's own output as page N.

**`_mbRowIdxCounter` staying un-zeroed is the load-bearing one.** It is what
gives resumed rows fresh `data-mb-row-idx` values continuing from where the
interrupted run stopped, so every map keyed `"rowIdx:colIdx"` stays consistent
with no merge step and no renumbering pass. Re-zeroing it is invisible to every
row-count, status-text and request-log assertion.

**The filter is NOT preserved across a resume**, and that is a decision, not an
oversight: the render tail never calls `runFilter()`, so a preserved filter
input would sit above a table showing every row. A resume is a fetch, and a
fetch starts from a clean filter.

`_resumeState` is written only by the loop's page-failure arm and cleared at the
top of every run (including a resumed one) and on a disk load. `__saTest.resumeState()`
exposes it, because a resumed run that silently re-fetched everything looks
identical on screen to one that kept its rows.

## The heading pre-processing must never touch the anchor it injected

`applyInsertH2()` guards itself with a `data-mb-injected-h2="1"` marker it
stamps and then queries for. `applyRenameH2ToH3()` and `applyRenameH2ToH1()`
run **before** it and rename `<h2>`s wholesale, copying all attributes onto the
substitute — so without an exclusion a second pass turns the injected
`<h2 data-mb-injected-h2="1">` into an `<h3 data-mb-injected-h2="1">`, the
marker query finds nothing, and another heading is injected beside the orphan.
**Both renamers therefore exclude `h2:not([data-mb-injected-h2])`.** Do not
widen that back: demoting MusicBrainz's OWN section headings is the whole point
of the feature, which is why the spec has a counter-guard for it.

**Two corrections to what this section said while the defect was still open,
both worth keeping because the reasoning was wrong in instructive ways:**

- **It is NOT reachable by pressing the button twice.** That path never re-runs
  pre-processing at all — `startFetchingProcess()` answers a second press with
  `window.location.reload()` long before the block. The real path is **Load from
  Disk after the page has already rendered**: `_hydrateAndRenderFromSnapshotData()`
  re-runs the block itself, gated on `features.listToTable`. Two loads in a row
  do it as well as fetch-then-load.
- **17 pageTypes can reach it, not 18.** The count of those declaring
  `renameH2ToH3` + `insertH2` is 18, but `notes-received` lacks `listToTable`,
  so the disk-load block never re-runs for it. The others are every `*-tags`
  type plus `user-ratings`, `popular-tags`, `reports-index`, `edit-types`,
  `instrument-list` and `privileged-accounts`.

**It produced no visible breakage, and that is the interesting part.** Measured
on 2026-09-20 through a real Save→Load round trip: the disk-load pass logged
`renamed 1 <h2>` then `inserted <h2>"Ratings"`, and the ORIGINAL anchor element
left the document entirely — the surviving `<h2>` was a different node. The
rendered page still looked correct, because `renderGroupedTable()`'s own cleanup
swept the demoted orphan. So a COUNT of anchors was 1 before and after; only
element IDENTITY distinguished them, which is what
`tests/fixtures/preprocessing-group-idempotency.spec.js` pins. It was a latent
dependency on cleanup ordering that nothing documented or tested, not a visible
bug — and the guard removes the dependency rather than fixing a symptom.

## Critical bug fix: user-tags container re-root (v9.99.521)

`/user/<n>/tags` has no `div#content`. Native DOM:

```
div#page
  h2 "Tags vzell upvoted"    ← targetHeader
  div#all-tags               ← initial container (table.tbl parentNode)
    h3 / table.tbl pairs
```

`renderGroupedTable` uses `let container` (not `const`) and re-roots it after cleanup:

```javascript
if (targetHeader && !container.contains(targetHeader)) {
    container = targetHeader.parentNode;  // div#page
}
```

Without this, all rendered h3/table pairs land outside `div#all-tags` and the
master-toggle's `container.querySelectorAll('table.tbl')` finds nothing.

**Do not add `renameH2ToH3` or `insertH2` to the `user-tags` definition.**
The native `<h2>Tags vzell upvoted</h2>` is already the correct targetHeader.

## HTTP failure classification: two sets, and they are not opposites

`_isTransientHttp(status)` + `_TRANSIENT_HTTP_STATUSES` (429/502/503/504) and
`_parseRetryAfterMs(headerValue)` + `_RETRY_AFTER_MAX_MS` (30 s) live together
just above `_ws2GetJson()`, which is their only consumer today. Everything
below is a decision, not an accident.

**`_TRANSIENT_HTTP_STATUSES` is NOT the complement of `_ART_MISS_STATUSES`**
(`[404, 410]`, "this artwork does not exist"). The two answer different
questions and a status can be in neither — a 403 is not transient and not a
definitive absence. Never express one in terms of the other, and do not
"complete" the transient set with 500 (a real server-side error, not a burst)
or 408. The boundary is pinned by the `a 400 is final` test, which passes on
unfixed code on purpose: it guards the overshoot, not the original defect.

**`_ws2GetJson()` applies no floor of its own.** It parses the header and hands
it on as `beforeRetry(attempt, retryAfterMs)`; a `beforeRetry` that ignores the
second argument silently does not honour `Retry-After`. All three call sites —
`_msFetchOneBatch()`, `_relFetchWs2()`, `_relBrowseFetchPage()` — fold it in as
`Math.max(ownDelay, retryAfterMs)`, so the server's ask is a **floor**, never a
replacement (a `Retry-After: 0.5` must not let us retry faster than
MusicBrainz's 1 req/s rule) and never additive. Each is written out separately,
so each is its own guard and needs its own test.

**On both Relationships sites the extra wait precedes `_relAwaitRateSlot()`.**
See PERFORMANCE.org Step 36: reserving the slot first and topping up afterwards
would spend a reservation and then fire late.

**Delta-seconds is parsed BEFORE the HTTP-date form.** `Date.parse('12')`
succeeds on some engines as the year 12, so a bare number would otherwise be
read as two millennia past and discarded as `0`. The parser returns `0`, never
`null`, for missing/garbage/past — that is what lets callers use a bare
`Math.max()`.

**The rate gate MASKS a lost backoff**, which is why an assertion here has to
name the number. Dropping the hint argument entirely makes every caller compute
`Math.max(delay, undefined)` = `NaN`, i.e. no pause at all — and the measured
retry gap was still 1100 ms, because `_relAwaitRateSlot()` alone held the line.
A spec that only checked "was there a pause" would not see it.

Covered by `tests/fixtures/ws2-transient-classifier.spec.js`; mutation list
`scripts/mutations/ws2-transient-classifier.json`. Two WS/2 paths deliberately
do NOT go through `_ws2GetJson()` and so have no retry at all —
`_msFetchWs2RecordingLengths()` and `_msFetchFullReleaseTrackLengths()` (the ⏱
`'ws2'` source) — and neither does `initReleaseEventsColumn()`. That is
`org/503-handling.org`'s remaining work, not an oversight.

**`fetchHtml()` has its own retry on the same helpers**, with a longer backoff
(`_HTML_FETCH_BACKOFF_MS`, 2 s then 5 s) because a lost page fetch costs a whole
page of rows rather than one cell, and there are far fewer of them. It throws an
Error carrying `status` so callers classify without parsing `message`, and its
backoff is interruptible (`_sleepInterruptible()`) or a pressed Stop would sit
out up to seven seconds. **There is no shared retry budget across pages and none
is needed** — every caller stops at its first failed page, so exactly one page
can ever pay the retries. That stops being true the moment anything makes the
loop continue past a failure.

## Release events: one request for the whole page, so losing it costs the column

`org/503-handling.org` F4. `initReleaseEventsColumn()` now goes through
`_ws2GetJson()` (`_RE_WS2_TRIES`, `_RE_WS2_BACKOFF_MS`) instead of a bare
`fetch()`, and a final failure is **visible and retryable** via
`.mb-re-col-hdr-btn` — the eighth member of the column-header family.

- **It is deliberately NOT on `_relAwaitRateSlot()`.** That gate spaces a
  STREAM of one request per entity; this is one request for the whole page, so
  joining it would couple two unrelated features' pacing for nothing. The
  pre-existing bare `fetch()` did not join it either, so nothing regressed.
- **A failure must not mark the cells `reDone`.** They stay unpopulated, which
  is what lets the retry — or any later render path — pick every one of them up.
  Marking them done would look completely settled and be permanently wrong.
- **`_reInitColHeaderState()` destroys and rebuilds the control, never reuses
  it**, and both halves of that matter. The control has to change STATE (⏳ →
  ⚠), so reusing leaves it stuck on whatever it was first painted as; and
  `renderGroupedTable()` rebuilds every `<thead>` from a `cloneNode(true)`,
  which carries classes and attributes but **not** the click listener, so a
  reused control would look normal and do nothing. One mutation covers both;
  the spec clicks the control after a re-render rather than just looking at it.
- **It is called from every render path**, beside `_relInitColHeaderToggles()`,
  for the same reason that one is.
- **The glyph is CSS `::before`, never element text** — this `<th>`'s
  textContent feeds `_cleanColHeaderText()`'s fallback,
  `_exportCleanHeaderText()` and the 📊 dropdown's column lookup. U+FE0E keeps
  it monochrome, as on `.mb-rel-col-hdr-btn`.
- **`_reFetchState` resets at the start of every run**, or a ⚠ from the
  previous fetch is painted into the fresh headers.

Covered by `tests/fixtures/release-events-transient.spec.js`; mutation list
`scripts/mutations/release-events-transient.json`. **A test here must wait on
`[data-re-state="error"]`, not the bare class** — the control is painted while
loading too, so waiting on the class alone proceeds mid-retry and sees one
request where three are coming. That cost a run.

## A truncated fetch must never be reported like a complete one

`org/503-handling.org` F1-F3. The rule: anything that makes the fetched set
smaller than the listing goes into `startFetchingProcess()`'s `fetchIncomplete`
record, and **every surface renders it through the one resolver
`_fetchIncompleteSummary()`** — status line, render-decision dialog,
save-without-rendering line, disk-load line, saved file. Four of those printed
"Loaded N pages" independently before, and a truncated run reached all four in
the words of a complete one.

- **`pagesProcessed++` happens AFTER the fetch.** It used to run before the try
  block, so the page that 503'd was counted as loaded. Any assertion here must
  name the NUMBER (`"1 of 3"`), not just look for a warning glyph.
- **`dataIncomplete` is narrower than "something went wrong", deliberately.** A
  failed page or an unreadable page count means rows are missing. An incomplete
  artist-releasegroups pre-fetch does not — the main pass fetched everything,
  and only the Official/Non-Official split is lost. Marking a complete row set
  INCOMPLETE would train the user to ignore the word.
- **`fetchMaxPageGeneric()` returns `{maxPage, ok, detail}`, not a number.**
  `maxPage` is still `1` on failure so nothing fetches zero pages; `ok: false`
  is what lets the line say "of an unknown total" rather than "1 of 1 pages" —
  which would read as a complete one-page listing, i.e. the same lie in new
  words.
- **An incomplete pre-fetch DISCARDS its partial official set.** Every consumer
  — the view-button builder, the two re-render walks and `saveTableDataToDisk()`
  — gates on `h3_official_category_header_array.length > 0`, so discarding
  switches all of them off at once. Threading a flag out instead misses the save
  path, which does not run inside `startFetchingProcess()`. A short set does not
  truncate the Official view: the consumer matches against the FRONT of that
  array in sequence, so a missing tail MISFILES genuinely-official categories as
  non-official.
- **The saved file carries an optional `incomplete` block, and no format bump
  was needed.** It is absent on a clean run and in every file written before it
  existed, so `!incomplete` keeps its old meaning. `_lastFetchIncomplete` is
  module-level because the Save button fires whenever the user likes, long
  outside the fetch; the disk-load path re-points it so re-saving a partial file
  keeps it partial.

Covered by `tests/fixtures/html-fetch-transient.spec.js`, whose two shells
`scripts/build-html-fetch-fixtures.py` derives from the committed snapshots with
only the pagination widget rewritten to 3 pages (the real ones say 42 and 22,
and a fixture route serves the same shell for every page). Mutation list
`scripts/mutations/html-fetch-transient.json`. **Note the trap that spec hit:
once `fetchHtml()` retries, failing ONE attempt of a request proves nothing** —
the retry absorbs it and the run comes back clean. A test that wants a final
failure has to exhaust all three attempts.
