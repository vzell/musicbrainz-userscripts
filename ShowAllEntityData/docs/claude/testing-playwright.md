<!-- Split out of ShowAllEntityData/CLAUDE.md on 2026-09-27, verbatim (section headings unchanged). This file is the authority for its topic; CLAUDE.md keeps only a digest and the doc map. -->

# Testing with Playwright

## Testing (Playwright)

A full Playwright harness lives under `tests/` (`ShowAllEntityData/
package.json`, `playwright.config.js`). Three projects, split by directory
and file name:

- **`chromium-fixtures`** (`tests/fixtures/*.spec.js`) — local HTML
  fixtures via `page.route()`, no network. Two selections, and the difference
  matters at merge time:
  - `npm test` — everything EXCEPT `@slow`. The default for iterating.
  - `npm run test:slow` — only `@slow`.
  - **`npm run test:full` — every fixture test. This is the merge gate**, and
    `merge-push-remove` runs it rather than `npm test`.

  **`@slow` is opt-in for iteration, mandatory at a merge.** Two specs carry
  it — `rel-auto-retry-failed` (~295 s on `petri`, ~324 s on `NB-3641`) and
  `resume-from-failed-page` (~84 s) — and between them they are most of the
  suite's wall clock
  and *all* of its coverage of org/503-handling.org items 5 and 7. Neither is
  slow because of slow code: both spend their time in rate gates and retry
  backoffs that the feature under test exists to respect, so shortening them
  means testing something other than what ships. The cost of the tag, stated
  plainly: a `@slow` spec can now rot for a whole working session. That is
  bounded by the merge gate, not eliminated — so if you change the merge
  workflow, keep it on `test:full`.
- **`chromium-mobile`** (`tests/fixtures/*.mobile.spec.js`, which
  `chromium-fixtures` ignores) — the same local fixtures under Playwright's
  `Pixel 7` descriptor: touch (`locator.tap()` fires compatibility mouse
  events), no hover, coarse pointer, and mobile viewport handling (a page
  without a viewport meta is laid out wide and zoomed out). `npm run
  test:mobile`; also part of `npm test` and `test:full`. It is Chromium
  emulation, NOT Firefox Android (which Playwright cannot drive), and the two
  differ: Chromium sends a `mouseleave` after a tap on an artwork thumbnail,
  Firefox did not on the reported device. So pin "a tap never SHOWS it", not
  "hidden afterwards" (see the touch-guard section of
  `toolbar-and-header-ui.md`). Mutation entries need `"project":
  "chromium-mobile"`.
  **`locator.tap()` can fail forever on a zoomed-out page once the visual
  viewport has scrolled** (release-tracks: a 1648 px layout viewport, the
  412 × 839 visual one 865 px down): its actionability hit-check treats the
  visual-viewport point as a layout one, lands on whatever sits higher up and
  reports it as "intercepts pointer events". A real touch at the same spot is
  fine. Use `page.touchscreen.tap()` at `boundingBox()`'s centre and assert the
  `pointerdown` target, as `release-tracks-cover-art.mobile.spec.js` does.
- **`chromium-live`** (`tests/live/*.spec.js`) — real musicbrainz.org
  pages. Every spec carries exactly one tag:
  - `@core` — shared-mechanism sanity net (filter/sort/fetch/pagination
    basics). `npm run test:live` (default).
  - `@extended` — bespoke/pageType-specific edge cases (Stop-button, IDB
    cache tiers, third-party interop, sub-table filter). `npm run
    test:live:extended` (`@core`+`@extended`, today's full live suite).
  - `@perf` — the deliberate perf-comparison instrumentation only
    (`tests/live/artist-events-interactions.spec.js`). `npm run
    test:live:perf`.
  - `npm run test:all` runs literally everything (fixtures + live).

`tests/README.org` is the end-user-facing guide to the harness: every npm
script, measured wall-clock timings per suite, the login step, and how to read
the results. Keep it in sync when a script or a project timeout changes.

Three pieces of harness infrastructure worth knowing before you reach for
something new:

- **`tests/support/customDialog.js`** — clicks through `Lib.showCustomConfirm`'s
  plain-DOM overlay, which Playwright's native dialog handling cannot see. See
  the threshold-dialog table below for its one blind spot.
- **`tests/fixtures/live-userscripts/`** — real third-party userscript bodies
  copied from the local Tampermonkey install, driven by `manifest.json` and
  `tests/support/run-live-interop.js` (`npm run live-interop`). The bodies are
  gitignored (not ours to redistribute); only the harness and manifest are
  committed. This is a **debugging aid with no pass/fail, deliberately not a
  regression gate** — don't treat a clean run as coverage. The
  `register-live-userscript` skill maintains the manifest.
- **`npm run auth:login`** writes `playwright/.auth/vzell.json` (gitignored — a
  session cookie is as good as a password). Without it live specs run **logged
  out**, which silently changes what login-gated pageTypes render rather than
  failing; `tests/support/authState.js` warns when the file exists but has
  expired.

The `vz-mb-saed-art-cache` IndexedDB database is shared by four unrelated
features purely so they get one sweep/count/clear code path: `images` +
`metadata` (artwork), `rel-ws2` (Relationships column), `ms-rec-len`
(millisecond Length), and `recof-ws2` + `artist-works` ("Recording of",
version 4). Adding a store means bumping `_ART_IDB_VERSION` — **and
`tests/support/idbFixture.js`'s `ART_IDB_VERSION` plus its seed's store
list**: a spec that opens the database at a LOWER version than the userscript
already did gets a VersionError (the v3 → v4 bump failed
`caa-metadata-transient-503.spec.js` exactly that way). Note the record
shapes timestamp themselves differently — `storedAt` for the artwork stores,
`ts` for the rest — which `sweepStore()` must keep reading both of; keying on
`storedAt` alone made the sweep a silent no-op for `rel-ws2` for its whole
existence. The 💾 browser cache overview (`_idboStamp()`) reads `storedAt`,
`ts` and the link-preview database's `at`.

**Snapshot regression coverage** (`tests/snapshots/<pageType>/{raw,
rendered}.html`, captured via `node tests/support/capture-snapshots.js`) covers
a small minority of pageTypes. Don't carry the count here — `tests/snapshots/registry.org`
is the authority for what is captured, and `tests/pagetypes.json` for what is
wired into the harness. The two can legitimately differ: a pageType on a
personal account can be configured without its baseline being committed.

`PAGETYPES-TESTING-REFERENCE.org`'s "Coverage clusters & representatives"
section is the authoritative coverage *plan* — it groups the pageTypes into
structural clusters, names 1-2 representatives per cluster (avoiding redundant
captures of near-identical shapes), gives identifier-selection criteria
(Springsteen-connected first, smallest qualifying catalog unless pagination is
specifically the point), and tracks `captured` vs `planned` per representative.
`tests/live/registry.org` and `tests/snapshots/registry.org` are the
hand-maintained dashboards of what's wired up today (spec/pageType, URL, what
it verifies); the latter also has an "Expected drift" section to read before
treating a re-capture diff as a regression.

Keep any filename in this file on ONE line. A hard-wrapped
`PAGETYPES-TESTING-REFERENCE.org` (broken across a newline mid-name) is
invisible to the `git grep` that a rename audit depends on, and that is exactly
how one reference here survived a rename undetected.

**Cross-tab sub-table handoff** (`tests/support/subtableTab.js`) drives the
real `openSubtableAsSingleTableTab()` → `_hydrateAndRenderFromSnapshotData()`
round trip, in the same spirit as `diskFixture.js`: the source page captures
its own snapshot, nothing is hand-built. Three non-obvious requirements, all
documented in that file — the GM store must be shared (it is:
`gmStubs.js` keeps every value in ONE `localStorage` entry,
`__sa_test_gm_values__`, installed via `context.addInitScript`), routes must
be registered on the CONTEXT (the popup navigates before a `page.route()`
could attach), and the userscript must be `addScriptTag`'d into the popup by
hand. Note the destination `GM_deleteValue`s the payload the moment it
consumes it, so `openSubtableTab()` reads it in the window before injecting
the script — reading afterwards always comes back empty. Sub-sections render
COLLAPSED, so a test must click the master toggle before anything inside a
sub-table is clickable (a toggle in a hidden table is a 0×0 element
Playwright will never click).

**CAA/EAA artwork tests: expand every sub-table BEFORE measuring, and assert
it worked.** A collapsed sub-table is `display:none`, so none of its artwork
ever loads — a test that measures a partly-collapsed page reports clean,
plausible numbers while measuring almost nothing. It passes for the wrong
reason, which is worse than failing. Specifics, each of which cost a wasted
run:

- **Do not trust `.mb-master-toggle`'s `data-state`.** On `artist-releasegroups`
  it reads `expanded` while individual sub-tables are still hidden. Drive a
  full collapse→expand cycle whenever anything is hidden rather than believing
  the flag.
- **Never click the master toggle unconditionally.** The initial state differs
  per pageType — `releasegroup-releases` renders sub-sections COLLAPSED,
  `artist-releasegroups` renders them EXPANDED — so a blind click collapses all
  17 sub-tables and the run reports clean zeros. `liveAssertions.js`'s
  `clickMasterToggleAndExpandAll()` asserts `collapsed` first and therefore
  cannot drive both; see `caa-icon-survives-sort-multi.spec.js`'s
  `ensureSubSectionsExpanded()`.
- **Re-expand after every discography view switch.** `_applyDiscographyViewFilter()`
  re-collapses the sub-sections, silently undoing the expansion done at page
  load. Measured: after switching to "Complete", the painted-icon count SETTLED
  at 6 on a page that settles at 85 expanded. Exclude view-hidden sections
  (`[data-mb-disc-hidden="true"]`) from the "nothing is collapsed" assertion —
  Official/Non-Official hide sections legitimately.
- **Assert a plausible floor after settling** (zero collapsed tables, and an
  artwork count in the expected range), so a mostly-hidden page fails loudly.
- **Settle, don't sleep.** A view switch re-inits artwork page-wide, so a fixed
  `waitForTimeout()` samples mid-repaint. Poll until the painted count is
  stable AND non-zero — a count of 0 means "the pass has not produced anything
  yet", not "settled". (A view with genuinely no artwork is the one exception,
  so allow zero to settle only after a longer run of identical samples.)
- **`waitForCaaEaaComplete()` DOES NOT WORK on a large page — do not reach for
  it as the artwork wait.** It waits for `#mb-info-display-caa` to become
  visible, which `_showCaaCompletionToast()` writes on the `_caaQueue`'s
  `onIdle`. On a big listing that toast never fires: measured still empty and
  hidden after 300 s (529 polls) on `artist-releasegroups` while artwork was
  visibly painting the whole time, and the same on `releasegroup-releases`'
  124-row "Greetings From Asbury Park, N.J." page — at the archive's
  ~1.2 req/s a per-entity metadata sweep of that size simply outlasts any
  sane timeout. **Poll the thing you actually care about until it stops
  changing** (painted icons, built `<ul>`s, `.mb-caa-type-badge` spans),
  per "Settle, don't sleep" above; `caa-icon-survives-sort-multi.spec.js`'s
  `waitForArtworkSettled()` is the worked example. The same applies to
  `waitForRelationshipsComplete()`/`#mb-info-display-rel`. This has cost a
  wasted run many times over, and it is ALSO why
  `releasegroup-releases-filter-sort.spec.js` fails on `main` — its
  `setupExpandedGreetingsPage()` still waits on both toasts, so all six of
  its tests fail in setup on that page regardless of the code under test.
  A "toast never appeared" timeout is evidence about the page's size, never
  about the change being tested — re-run the spec standalone, or on reverted
  code, before believing it caught anything.
- **Always uncollapse the big-image strips, in BOTH single- and multi-table
  pageTypes, and assert the uncollapse worked.** `sa_caa_pics_initially_collapsed`
  defaults true, so a strip loads *nothing* until toggled — the same
  "passes while measuring nothing" failure as a collapsed sub-table, and it
  applies to `tableMode: 'single'` too, where there is no master toggle to make
  the problem visible. Click `#mb-caa-toggle-btn-global` (and
  `#mb-eaa-toggle-btn-global` on a page carrying EAA — `tag-value-sort-overflow-row.spec.js`
  needs both), then verify the strips actually populated before measuring.
  Per-section buttons are `#mb-caa-toggle-btn-{i}`.
  There is no shared helper for this yet: roughly seven live specs hand-roll
  the click, unlike sub-table expansion which has
  `liveAssertions.js`'s `clickMasterToggleAndExpandAll()`. If you touch more
  than one of them, factor it out.

**Threshold dialogs will stall a test — check this before writing a new spec or
re-running an old one on a bigger page.** There are FOUR blocking dialogs, they
are plain DOM overlays rather than native `confirm()`s (so Playwright's
`page.on('dialog')` never fires), and the existing helper only clears three:

| Gate                         | Fires when                                                    | Shape                                                                            | Cleared by                     |
|------------------------------|---------------------------------------------------------------|----------------------------------------------------------------------------------|--------------------------------|
| `ℹ️ Unknown Page Count`       | `features.unboundedPagination` + ambiguous pagination widget  | `Lib.showCustomConfirm`, OK/Cancel                                               | `dismissCustomConfirmDialog()` |
| `⚠️ High Page Count`          | `maxPage > sa_max_page` (default **50**)                      | `Lib.showCustomConfirm`, OK/Cancel                                               | `dismissCustomConfirmDialog()` |
| `showRenderDecisionDialog()` | `totalRows > sa_render_threshold` (default **5000**)          | **three** buttons: `#mb-dialog-save` / `#mb-dialog-render` / `#mb-dialog-cancel` | **nothing — see below**        |
| `⚠️ Large Render Warning`     | `totalRows > sa_render_warning_threshold` (default **10000**) | `Lib.showCustomConfirm`, OK/Cancel                                               | `dismissCustomConfirmDialog()` |

Three things make this a live hazard rather than a theoretical one:

- **`tests/support/customDialog.js`'s `dismissCustomConfirmDialog()` cannot clear
  the render-decision dialog.** It clicks `getByRole('button', {name: 'OK', exact: true})`;
  that dialog's buttons are `💾 Save to Disk` / `🎨 Render Now` / `❌ Cancel`.
  A test that can reach it must click `#mb-dialog-render` explicitly.
- **No `tests/live/*.spec.js` calls that helper at all** — it is wired only into
  `capture-snapshots.js`, `capture-fixture.js` and `run-live-interop.js`. The
  live suite passes today only because its largest page (`artist-events`, 4174
  rows) sits just under the 5000 default. Any new spec on a bigger listing
  crosses it.
- **The last two gates fire AFTER the fetch completes**, so hitting one burns
  the entire multi-minute fetch and then times out with nothing to show. The
  symptom is a run that looks stalled with no console error and no progress.

**Preferred fix is to seed the settings so the dialogs never fire**, not to
dismiss them: `seedGmValues` in `tests/pagetypes.json`,
`buildGmStubsScript(initialValues)` for fixture specs, `realNetworkGmXhr`'s
`settingsOverride` for live specs. Dismissing is the fallback.

**One trap when seeding: `sa_render_threshold: 0` does NOT disable that dialog**,
despite the setting's own description saying "0 to disable". The code reads
`Lib.settings.sa_render_threshold || 5000`, so `0` is falsy and becomes 5000 —
seed a large number instead. `sa_render_warning_threshold` uses `?? 10000` and
*does* honour `0`. `sa_chunked_render_threshold` has the same `|| 1000` defect.
This is a real bug in the settings, filed but not yet fixed; don't write a test
against the "0 to disable" premise.

**Skills.** This project's recurring workflows are packaged as skills in
`.claude/skills/`. They are auto-discovered and listed with their own
descriptions at the start of every session, so they are NOT enumerated here —
an out-of-date list is worse than none (this file named 3 of them long after
there were 10). Check the session's skill listing, or `ls .claude/skills/`, and
prefer invoking the matching skill over improvising the workflow.

**`PERFORMANCE.org` Step numbers were reconciled — check the provenance table
before following any "Step N" reference.** Three copies of that file (`main`,
`perf-steps-1-4`, `filter-performance-fix-caa-throughput`) had drifted into
three incompatible schemes, each with a different Step 6, which silently broke
a cross-reference in the userscript's own JSDoc. Steps 1-5 never moved;
`perf-steps-1-4`'s 6-14 became canonical; `caa-throughput`'s 6/7/8 became
15/16/17; `main`'s Step 6 became 18. Branch commit messages and older
`debug/*.org` session logs still carry the OLD numbers, so map them through
`PERFORMANCE.org`'s "Step-number provenance" section rather than reading them
at face value. Its TODO/DONE keyword tracks "landed on `main`", not effort —
several steps were implemented on an unmerged branch and still read TODO.

No `// @version` bump or `ShowAllEntityData_CHANGELOG.json` entry for
anything under `tests/` — test tooling isn't part of the userscript
runtime.

**Before implementing any change to the userscript, check its test-framework
impact.** The Playwright harness under `tests/` isn't just coverage of the
script — parts of it (`tests/support/diskFixture.js` and the committed
`tests/fixtures/saved-data/*.json.gz` fixtures) are built directly on runtime
mechanisms like the Save/Load-from-Disk pipeline, so a behavior change there
can silently invalidate fixtures or turn documentation (JSDoc/comments) in
`tests/support/*.js` false without any test actually failing. Before writing
code, check for: stale JSDoc/comments in `tests/support/*.js` that describe
the pre-change behavior, existing fixtures/snapshots captured under
assumptions the change invalidates, and live-spec assertions or timing
(`waitForRenderComplete`/`waitForRelationshipsComplete`/`waitForCaaEaaComplete`
etc.) tied to the changed behavior. Call out every affected test file
explicitly in the plan/PR description, even when no test code needs to
change — a stale comment is still a defect.

## Fixture specs are network-free; settle-waits count writes

**The userscript's `@require`d libraries come from `node_modules`.** iro and
pako are exact-pinned devDependencies, injected by `addRequiredLibs()`
(`tests/support/loadPage.js`), never `addScriptTag({ url })` to a CDN: on
2026-10-04 a jsdelivr outage failed 72 merge-gate tests in `addScriptTag`. A new
place that loads the userscript by hand (a popup tab, a real-network page) calls
`addRequiredLibs()` too. `harness-required-libs.spec.js` fails when a `@require`
version moves without the devDependency; `scripts/check-vendored-libs.py`
compares the bytes with the CDNs by hand. `PLAYWRIGHT_BLOCK_CDN=1` blocks both
CDN hosts for a whole run.

**`waitForFilterSettled` / `waitForSortSettled` / `waitForSubTableFilterSettled`
count WRITES to the status element, not only text changes.** An operation that
ends with a byte-identical line ("✓ Filtered 9 rows in 22ms …" twice) used to
make the wait unsatisfiable. `_runAndWaitForSettledText()` now installs a
MutationObserver before the trigger: a write after the trigger (every writer
assigns `textContent` unconditionally) or a replaced node makes the text
eligible. A trigger that writes NOTHING still times out — so a spec whose
trigger may be a genuine no-op must wait on what it asserts (a row set, a
request count) instead. `harness-settled-text.spec.js` pins both halves.

## Lint rules for specs

`eslint-plugin-playwright` runs on `tests/**/*.spec.js` under `npm run lint`
(report-only, see `tests/README.org` section "Lint"). Two of its rules are
errors because they are defects, not style: `missing-playwright-await` (an
un-awaited `expect(locator).toHaveCount()` never checks anything — the
2026-10-04 baseline found one in `app-help-github-and-markdown.spec.js`) and
`no-focused-test` (a stray `test.only` silently shrinks the suite).
`no-wait-for-timeout` is a warning and is this file's "settle, don't sleep"
rule in machine form. House-style rules (`prefer-locator`,
`no-conditional-in-test`, `no-eval`, …) are switched off on purpose: the
harness reads the DOM through `page.evaluate()` by design.
