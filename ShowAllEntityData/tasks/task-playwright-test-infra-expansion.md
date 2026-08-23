# Task: Test-mode debug hook + behavioral live-test coverage (uniqdrop, async completion, Stop button, filter/sort, disk fixtures)

## Context

This supersedes two earlier task docs (`task-playwright-uniqdrop-harness.md`,
`task-playwright-html-snapshot-harness.md`'s harness-building portions) that
assumed shared infrastructure — a repo-root `falcon/test/`, `discogs_credits/
test/`, a top-level `ShowAllEntityData/test/` (singular), a `.pw-profile-sa/`
or `.pw-profile/` profile directory — that **does not exist in this repo**.
Grepping git history and sibling directories under `~/git` confirms
`falcon/` and `discogs_credits/` were never part of this checkout.

What already exists and works, under `ShowAllEntityData/tests/` (**plural**),
wired to `playwright.config.js` and `package.json`
(`@playwright/test`/`playwright` `^1.62.1`):

- `tests/support/gmStubs.js` — `buildGmStubsScript(initialValues)` stubs
  every `@grant`ed GM_* API; `GM_getValue`/`GM_setValue`/`GM_deleteValue` are
  backed by an in-memory object seedable via `initialValues`.
- `tests/support/loadPage.js` — `loadUserscriptPage(page, {url,
  fixtureFile})` injects the GM stub, then loads iro → pako →
  `lib/VZ_MBLibrary.user.js` → `ShowAllEntityData.user.js`, matching the
  userscript's own `@require` order.
- `tests/support/liveAssertions.js` — `collectPageErrors(page)`,
  `assertGroupedRenderCompleted(page, pageErrors, opts)`,
  `clickMasterToggleAndExpandAll(page)`.
- `tests/support/auth-setup.js` + `npm run auth:login` — a real, interactive,
  one-time login saved as Playwright `storageState` to
  `playwright/.auth/vzell.json` (gitignored); the `chromium-live` project in
  `playwright.config.js` applies it automatically when present. This is the
  auth mechanism to reuse — do not build a separate persistent-context
  profile.
- Two Playwright projects: `chromium-fixtures` (local HTML fixtures, no
  network, `npm test`) and `chromium-live` (real musicbrainz.org,
  `npm run test:live`).
- Existing specs: `tests/fixtures/{gmStubs,smoke}.spec.js`,
  `tests/live/{smoke,release-group-fetch,release-group-paginated-fetch}.spec.js`.

No `diff`/`jsdiff` devDependency exists anywhere in the repo. No
`window.__SA_TEST_MODE__` / `window.__saTest` hook exists yet in
`ShowAllEntityData.user.js` (confirmed via grep) — Part 1 below is the only
genuinely new *script* addition this doc requires; everything else (Parts
3-6) reads DOM state the script already exposes.

---

## Part 1 — `__saTest` test-mode debug hook (touches the shared userscript)

Add a small, read-only introspection API to `ShowAllEntityData.user.js`,
gated behind a `window.__SA_TEST_MODE__` flag so it never exists in a normal
Tampermonkey install. Do not add any new UI or change any user-visible
behavior — this is purely a test introspection surface.

**Harness wiring** — extend `tests/support/loadPage.js`'s
`loadUserscriptPage(page, opts)` with a `testMode` option:

```js
async function loadUserscriptPage(page, { url, fixtureFile, testMode }) {
    if (testMode) {
        await page.addInitScript({ content: 'window.__SA_TEST_MODE__ = true;' });
    }
    await page.addInitScript({ content: buildGmStubsScript(...) });
    // ...rest unchanged
}
```

Inject `window.__SA_TEST_MODE__ = true` **before** the GM stub script and
before the userscript itself loads, matching the existing ordering.

**Script-side hook** — insertion point: near the init tail of
`ShowAllEntityData.user.js`, after `ctrlMFunctionMap` is populated (currently
~line 63453; re-grep the symbol before editing, line numbers drift as the
file grows):

```js
if (typeof window !== 'undefined' && window.__SA_TEST_MODE__) {
    window.__saTest = {
        getUniqDropSections(colName) { /* ... */ },
        closeUniqDrop() { closeUniqDrop(); },
    };
}
```

- **`__saTest.getUniqDropSections(colName)`** — opens (or reads the current
  state of, if already open) the 📊 panel for the given column name, and
  returns a plain-JSON-serializable structure: for each rendered section
  (per `SYN_SECTION_META`), its label/icon and an array of `{label, count,
  checked}` for each entry row. Read this from the actual rendered DOM
  inside `openUniqDrop()`'s output (not from internal state that might
  diverge from what the user sees), so the test verifies what a person
  actually sees in the panel.
- **`__saTest.closeUniqDrop()`** — thin wrapper calling the existing
  `closeUniqDrop()` internal, for tests to reset panel state between
  assertions.

Explicitly scope OUT of this hook: fetch-progress/page-count exposure and
CAA/EAA-queue exposure. Parts 4 and 3 below don't need them — existing DOM
(`#mb-fetch-progress-label`, `#mb-info-display-caa`, `#mb-info-display-rel`)
already provides reliable signals with zero script changes. Keep this hook
minimal; the uniqdrop panel is the only feature here with no existing
DOM-level introspection surface.

**Convention**: bump `// @version`, add a `ShowAllEntityData_CHANGELOG.json`
entry (label matching whatever internal/tooling label the changelog already
uses for this kind of addition), and **report the exact diff for approval
before finalizing**, per the confirmation-gate convention for changes to the
shared script file — even though this is additive and inert outside test
mode.

---

## Part 2 — First test: `tests/live/uniqdrop-structure-section.spec.js`

Target: the **"Structure"** section (cell-structure states: empty /
single-row / multi-row-collapsed / multi-row-expanded — see the
`uniq-dropdown-section` skill and `SYN_SECTION_META`), since it renders on
effectively every page type with collapsible multi-value cells, making it a
good first target independent of any single page type's quirks.

1. Use `loadUserscriptPage(page, {url, testMode: true})` on a real
   MusicBrainz page known to produce a mix of empty / single-row / multi-row
   cells in a collapsible column — an artist's release-groups listing is a
   reasonable choice (multi-disc/multi-format groups reliably produce
   multi-row "Format" or "Tracks" cells). Pick a specific, stable artist
   MBID with enough releases to exercise all four structure states; note the
   chosen MBID and *why* it was chosen in a comment, the way
   `release-group-paginated-fetch.spec.js` explains its URL choice.
2. Click "Show all" and wait for render completion via
   `assertGroupedRenderCompleted(page, pageErrors)` (the existing helper) —
   do not use a fixed `waitForTimeout`.
3. Call `__saTest.getUniqDropSections('<column name>')` for the chosen
   collapsible column.
4. Assert:
   - The "Structure" section is present.
   - All four structure-state entries the page's data should produce are
     present with non-zero counts (adjust the specific asserted counts to
     match what the chosen page actually contains — inspect it first rather
     than guessing numbers).
   - Every entry carries `dataset.mbUniqSynLabel` in the underlying DOM (the
     quickfilter-visibility wiring the `uniq-dropdown-section` skill
     documents) — read this directly via `page.evaluate`, not through the
     `__saTest` summary, since this is exactly the kind of wiring gap that's
     invisible to a summary but breaks quickfilter in practice.
   - Reopening the panel (`__saTest.closeUniqDrop()` then re-triggering
     open) produces an identical section/entry list — guards the
     "self-corrupting on second filter pass" failure mode the skill
     documents.

---

## Part 3 — Async CAA/EAA + Relationships completion waiting

No userscript changes needed. Confirmed directly in the script:

- `#mb-info-display-caa` / `#mb-info-display-rel` (created ~lines
  27955-27967, written by `_setInfoSub()` ~line 27976) start hidden/empty
  (`style.display = 'none'`, empty `textContent`), are cleared at the top of
  every fetch (~lines 40566-40568), and are set **exactly once** — flipping
  to `style.display = 'inline-block'` — when the CAA/EAA queue drains
  (`_caaQueue.onIdle(_showCaaCompletionToast)`, ~line 63378) or when
  `initRelationshipsColumn()`'s async work finishes (~line 54022). This is a
  more reliable "done" signal than the transient, auto-dismissing toasts
  (`#mb-caa-completion-toast`, and the untitled Relationships toast — no id,
  matched only by text starting "🔗 All Relationships loaded" — see
  `_showRelCompletionToast()` ~line 54029).
- Toast-duration settings already exist and can be seeded to `0` (disables
  the toast entirely, but does **not** affect the info-sub-display, which is
  unconditional): `sa_caa_completion_toast_duration` (default 10),
  `sa_rel_completion_toast_duration` (default 8).

New `tests/support/asyncCompletion.js`:

```js
/**
 * Waits for the CAA/EAA artwork-fetch queue to drain, signaled by
 * #mb-info-display-caa becoming visible (set exactly once, on queue-idle —
 * see ShowAllEntityData.user.js's _showCaaCompletionToast()/_caaQueue.onIdle()).
 */
async function waitForCaaEaaComplete(page, { timeout = 30000 } = {}) {
    await expect(page.locator('#mb-info-display-caa')).toBeVisible({ timeout });
}

/**
 * Waits for the Relationships column's async fetch/render to finish,
 * signaled by #mb-info-display-rel becoming visible (set exactly once —
 * see ShowAllEntityData.user.js's initRelationshipsColumn() tail).
 */
async function waitForRelationshipsComplete(page, { timeout = 30000 } = {}) {
    await expect(page.locator('#mb-info-display-rel')).toBeVisible({ timeout });
}

module.exports = { waitForCaaEaaComplete, waitForRelationshipsComplete };
```

No dedicated spec is mandated here — these are consumed by whichever live
spec exercises `addCAA`/`addEAA`/`sa_enable_relationships_column` on a
concrete pageType (e.g. a future `artist-releasegroups` test). Document the
helpers with JSDoc and leave concrete usage to that consumer.

---

## Part 4 — Stop-button pagination-limit emulation

No userscript changes needed. Confirmed directly in the script:

- `#mb-stop-btn` (created ~line 27919, click handler ~lines 36894-36901)
  only sets a module-level `let stopRequested = false;` (declared ~line
  30159) to `true` — it does not abort any in-flight `fetch()` (page HTML is
  fetched via `fetchHtml()`, ~line 51677, no `AbortController`).
- `startFetchingProcess()`'s pagination loop (~lines 38534-38541) checks
  `stopRequested` once per iteration and `break`s:
  ```js
  for (let p = 1; p <= maxPage; p++) {
      if (stopRequested) { break; }
      pagesProcessed++;
      // ...fetch + accumulate page p
  }
  ```
- `#mb-fetch-progress-label` (id ~line 27848) is updated every iteration
  (~line 39990) with text:
  `` `Loading page ${p} of ${maxPage}... (${totalRowsAccumulated} rows) - ${estRemainingSeconds}s left` ``
  — regex-parseable to know which page is currently loading.
- After a stop, the loop's normal post-processing/render path still runs
  (confirmed via `stopBtn.style.display = 'none'` appearing in every
  completion branch, ~lines 40030/40047/40074/40143) — a stopped fetch still
  renders whatever rows were accumulated, it does not error out. Watch for
  `showRenderDecisionDialog(totalRows, pagesProcessed)` (~line 40015), a
  modal gate that can appear before rendering above a row-count threshold —
  irrelevant at the n=2 default for realistic page sizes, but a future
  higher-`n` variant of this test should expect/dismiss it.

New `tests/support/stopButton.js`:

```js
/**
 * Waits until the fetch-progress label reports page >= n (or the page's
 * own total, whichever is smaller, so this can't hang on a pageType with
 * fewer than n total pages), then clicks #mb-stop-btn — emulating a user
 * stopping a long paginated fetch after n pages.
 */
async function stopAfterPages(page, { n = 2, timeout = 60000 } = {}) {
    await page.waitForFunction((n) => {
        const el = document.getElementById('mb-fetch-progress-label');
        if (!el) return false;
        const m = el.textContent.match(/Loading page (\d+) of (\d+)/);
        return m && (Number(m[1]) >= n || Number(m[1]) >= Number(m[2]));
    }, n, { timeout });

    await page.click('#mb-stop-btn');
    await expect(page.locator('#mb-stop-btn')).toBeDisabled();
    await expect(page.locator('#mb-stop-btn')).toHaveText('Stopping...');
}

module.exports = { stopAfterPages };
```

New `tests/live/stop-button-pagination.spec.js`:

- Needs a pageType/URL with **more than 2** real MB pages — the existing
  `release-group-paginated-fetch.spec.js` URL only spans 2 pages, which
  isn't useful here since stopping "after 2" wouldn't truncate anything.
  Pick a different, larger listing (e.g. a prolific artist's releases) and
  verify its actual page count first, the way that existing spec's own
  comment documents its 2-page choice.
- Flow: `loadUserscriptPage` → click "Show all" → `stopAfterPages(page, {n:
  2})` → assert the render still completes with partial, non-zero row data
  (reuse `assertGroupedRenderCompleted`/the single-table equivalent) → assert
  `#mb-stop-btn` ends at `style.display === 'none'` (confirms cleanup ran).
- This test must stay **live** (real network) by definition — it exercises
  the fetch/pagination pipeline itself, so it's one of the few cases Part 6
  (disk-based fixtures) below cannot replace.
- The `n` default of 2 lives as `stopAfterPages`'s default param, overridable
  per call.

---

## Part 5 — Filter/sort row-count assertions

No userscript changes needed. Confirmed directly in the script:

- `runFilter()` (~line 36204) reads the global search box
  `#mb-global-filter-input` (~lines 28013-28014) plus its case/regexp/exclude
  checkboxes, and per-column filters via `input.mb-col-filter-input
  [data-col-idx="N"]` inside `thead tr.mb-col-filter-row`. Multi-table pages
  additionally have a per-group **Sub-Table Filter (STF)** text input inside
  `.mb-subtable-filter-container` (its own case/regexp/exclude checkboxes),
  reapplied after every re-render by `reapplyAllSubTableFilters()` (~lines
  36493/42343).
- **Two different filter mechanisms** — a row-count helper must handle both:
  - Global/column filtering **re-renders**: `allRows`/`group.rows` are
    filtered, then `renderFinalTable`/`renderGroupedTable` re-render with
    `cloneNode(true)`d rows (single-table: ~line 36617; multi-table: ~line
    36448).
  - STF filtering instead **hides** existing rows in place
    (`row.style.display = 'none'`, `dataset.mbStfHidden`) — confirmed by
    `_updateSubTableH3Tooltip()` (~line 42162) and
    `updateH2CountFromSubtables()` (~lines 42300-42334), both of which count
    via `r.style.display !== 'none'`.
- Row counts: `updateH2Count(filteredCount, totalCount, absoluteTotal)`
  (~line 32824) writes `h2 .mb-row-count-stat` for **both** table modes —
  `(N)` when filtered===total, `(F of T)` when a global/column filter is
  active, `(F of T)/A` (3-tier) when an STF has additionally reduced an
  already-filtered total. Per-sub-table counts (multi-table only) live at
  `h3.mb-toggle-h3 .mb-row-count-stat`, written by
  `_updateSubTableH3Tooltip(tbl)` — summing these across all groups equals
  the page-level `h2` filtered count (the existing
  `assertGroupedRenderCompleted` helper already relies on this identity for
  the *unfiltered* case).
- Settle signals: `#mb-filter-status-display` (~line 28629, e.g.
  `⏳ Filtering...` → `✓ Filtered N rows in Xms`) and
  `#mb-sort-status-display` (~line 28633, class `.mb-sort-status`, e.g.
  `⏳ Sorting...` → `` ✓ Sorted by: 'Col'▲ (N rows in Xms) ``). On multi-table
  pages the sort status instead goes to the relevant sub-table's own
  `h3 .mb-sort-status` span (~lines 49917-49943).
- `makeTableSortableUnified()` (~line 49475) drives `sortLargeArray()`
  (~line 15296, async/chunked Tim-sort for ≥5000 rows) then calls
  `runFilter()` (~line 49901) to re-render in sorted order through the
  *same* re-render path filtering uses. Sorting only reorders `<tr>`s — it
  does not invoke `updateH2Count`/`_updateSubTableH3Tooltip` directly, but
  they get refreshed indirectly since `runFilter()` runs at the end of the
  sort handler; row count must be unchanged after a sort.

New `tests/support/filterSortAssertions.js`:

- **`waitForFilterSettled(page, {timeout})`** — poll
  `#mb-filter-status-display` until its text stops starting with `⏳`.
- **`waitForSortSettled(page, {timeout, subTableHeading})`** — same on
  `#mb-sort-status-display`, or (when `subTableHeading` is given, for a
  multi-table page) that group's own `h3 .mb-sort-status`.
- **`getPageRowCount(page)`** — parse `h2 .mb-row-count-stat` text into
  `{filtered, total, absolute}`, handling all three shapes: `(N)`,
  `(F of T)`, `(F of T)/A`.
- **`getSubTableRowCounts(page)`** — for multi-table pages, read every
  `h3.mb-toggle-h3 .mb-row-count-stat` into `[{groupLabel, filtered,
  total}]`; the caller asserts these sum to `getPageRowCount(page).filtered`.

New specs:

- `tests/live/filter-global.spec.js` — type into `#mb-global-filter-input`,
  `waitForFilterSettled`, assert `getPageRowCount` narrows (`filtered <
  total`) and, on a multi-table pilot page, `getSubTableRowCounts` sums to
  the page-level `filtered` count.
- `tests/live/filter-column.spec.js` — same, via one
  `.mb-col-filter-input[data-col-idx=N]`.
- `tests/live/filter-subtable.spec.js` (multi-table only) — filter ONE
  group's STF input, assert only that group's `filtered` count changes while
  sibling groups stay at their unfiltered `total`, and the page-level count
  reflects the resulting `(F of T)/A` 3-tier text.
- `tests/live/sort-column.spec.js` — click a column's sort-icon button,
  `waitForSortSettled`, assert `getPageRowCount`/`getSubTableRowCounts` are
  **unchanged** by the sort while a representative cell's text at row 1
  changes (confirms reordering happened without dropping/adding rows).

---

## Part 6 — Disk-based fixture loading for deterministic tests

The most consequential finding here: **Load-from-disk is fully
Playwright-automatable**, because it drives a real DOM
`<input type="file">`, not a native OS picker or the File System Access API.
This gives every test in Parts 2, 3, and 5 a way to run against a fixed,
previously-captured dataset instead of live musicbrainz.org — eliminating
false failures/drift from other editors changing MB data between test runs.

Confirmed directly in the script:

- `saveTableDataToDisk()` (line 54250) serializes the **already-rendered**
  row/header DOM (via `getCleanCellHtml()`, which strips transient
  filter-highlight spans — so CAA/EAA/relationship HTML resolved during
  fetch is baked into the saved cell HTML) into a versioned JSON envelope:
  `{version, url, pageType, buttonLabel, timestamp, tableMode, entityType,
  rowCount, headers: [...], rows: [...] | null, groups: [...] | null, ...}`
  (`rows` for `tableMode: 'single'`, `groups` for `'multi'`). It gzips this
  via `pako.gzip()` and triggers a real browser download (`Blob` +
  `URL.createObjectURL()` + `<a download>` click, ~line 30536) — no
  `GM_download`. The `showRenderDecisionDialog()` "save" branch (~line
  40017) calls this exact same function, not a separate path.
- `loadTableDataFromDisk(file, ...)` (line 55552), reached via the 📂 **Load
  from Disk** button (`#mb-load-from-disk-btn`, gated by the
  `sa_enable_save_load` setting) → `showLoadFilterDialog()` (line 31188, a
  Load → Filter → Render 3-phase dialog) → the dialog's own hidden
  `dialogFileInput` (`type="file"`, `accept=".gz,application/gzip,.json"`,
  created and appended to `document.body` for the dialog's lifetime, ~lines
  31399-31403, removed on dialog close ~line 31526). The dialog's "Load
  Data" button just does `dialogFileInput.click()` (~line 31646) — Playwright
  doesn't need that click; `page.setInputFiles()` can target the hidden
  input directly. Loading skips the network fetch entirely and hydrates
  straight into the **same** `renderFinalTable`/`renderGroupedTable`
  pipeline a live fetch uses, via `_hydrateAndRenderFromSnapshotData()`
  (line 54478) — so this exercises real render code, not a mock.
- There is also a vestigial `id="mb-file-input"` toolbar input (~line 27736)
  with its own `onchange` — it is never `.click()`'d anywhere in the code
  (dead/legacy). Do not target it; use the dialog's `dialogFileInput`.
- Known pageType caveats:
  - `listToTable` pages (e.g. artist-credit) need `startFetchingProcess`'s
    DOM pre-processing (`applyRenameH2ToH3`/`applyInsertH2`/
    `applyListToTable`) manually re-run before hydration — the disk-load
    entry point skips it (comment ~lines 54531-54553).
  - `cdtoc` pages lose their tracklist-toggle `data-cdtoc-tracklist-html`
    dataset attributes on disk-load (not serialized, ~line 50291) — avoid
    disk-fixture-based testing of that one behavior.
  - `artist-releasegroups` pages get special `discOfficialCategories`
    persistence to rebuild view-mode buttons — should round-trip cleanly,
    but verify when building that pageType's fixture.

### Fixture capture (one-time, per pilot pageType)

Document as a manual/headed procedure (or a small standalone Node script,
mirroring the pattern an eventual HTML-snapshot capture runner would use —
see the sibling `task-playwright-html-snapshot-harness.md`): load the page
live, click "Show all", wait for render completion, trigger Save-to-disk,
and capture the resulting download via Playwright's `page.on('download')`
event, saving the file to `tests/fixtures/saved-data/<pageType>.json.gz`,
committed to git.

### `tests/support/diskFixture.js`

```js
/**
 * Loads a previously-captured Save-to-disk fixture instead of fetching
 * live, by driving the real hidden file input inside the Load-from-disk
 * dialog (showLoadFilterDialog()'s dialogFileInput — see
 * ShowAllEntityData.user.js ~line 31399). Hydrates through the same
 * render pipeline a live fetch uses (_hydrateAndRenderFromSnapshotData()).
 */
async function loadFromDiskFixture(page, { url, fixturePath, testMode } = {}) {
    await loadUserscriptPage(page, { url, testMode });
    await page.click('#mb-load-from-disk-btn');
    // TODO at implementation time: trace showLoadFilterDialog()'s exact
    // Load -> Filter -> Render button sequence (this investigation only
    // confirmed the file-input mechanism, not the full click sequence).
    await page.setInputFiles('input[type="file"][accept*="gz"]', fixturePath);
    // ...drive remaining dialog phase(s)
}

module.exports = { loadFromDiskFixture };
```

**Open item for the implementer**: trace `showLoadFilterDialog()`'s exact
button sequence through its 3 phases before finalizing this helper — this
investigation confirmed the file-input mechanism is real and automatable,
but not the precise sequence of subsequent confirm-button clicks. If
`dialogFileInput` turns out to have no stable selector once the dialog is
open (only the `accept` attribute to key off), consider adding a minimal
`id`/`data-testid` to it as a small, additive, non-behavior-changing script
change — subject to the same diff-approval convention as Part 1's
`__saTest` hook.

### Recommended usage

Route Parts 2, 3, and 5's own tests through `loadFromDiskFixture()` instead
of a live "Show all" click once a fixture exists for that pageType — faster
and immune to MB data drift. **Part 4 (Stop-button) stays live-only**, since
it specifically tests the fetch/pagination pipeline that disk-loading
bypasses entirely.

---

## Project conventions (apply to all touched code)

- Untabify tab stops; strip trailing whitespace.
- Standardized JSDoc block on every new function (harness helpers included).
- Changelog entry + version bump apply **only** to Part 1's `__saTest` hook
  (it touches the shared script). Nothing under `tests/` needs either — test
  tooling isn't part of the userscript runtime.
- Report the `__saTest` diff before finalizing (Part 1), per the
  confirmation-gate convention for changes to the shared main script file.
