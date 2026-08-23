# Task: Playwright test harness + first regression test (unique-values 📊 dropdown)

## Context

`ShowAllEntityData.user.js` is a single-IIFE Tampermonkey userscript (~63,500
lines) for MusicBrainz. It is read/display-only — it never submits edits back
to MusicBrainz — so, unlike Falcon's Playwright tests (which must abort every
POST as a safety net), these tests can generally run against real MusicBrainz
pages without a submit-blocking harness. Reserve `page.route()` interception
for the few features that do make outbound calls worth inspecting (CAA/EAA
image fetches), not as a blanket safety measure.

This task has two parts: (1) a reusable Playwright test harness, and (2) the
first concrete test built on it, targeting the unique-values dropdown (the
📊 column-header filter panel documented in the project's
`uniq-dropdown-section` skill).

## Part 1 — Reusable test harness

Create a `test/` directory (mirroring Falcon's `userscripts/falcon/test/`
layout) containing a shared harness module, e.g. `test/harness.mjs`, that:

1. **Launches a real, persistent, logged-in Chromium context** via
   `playwright`'s `chromium.launchPersistentContext()`, the same pattern used
   in `falcon/test/verify-533-release-comment-routed.mjs`. Use a separate
   profile directory from Falcon's (e.g. `.pw-profile-sa/`) so the two
   scripts' test sessions never collide.

2. **Stubs the GM_* sandbox** via `ctx.addInitScript()`:
   - `GM_getValue` / `GM_setValue` / `GM_deleteValue` backed by an in-memory
     `Map`, exactly as Falcon's test does.
   - `GM_addStyle(css)` — this script's `@grant` list includes it (added in
     v9.99.737 for CSP reasons); stub it as
     `document.head.appendChild(Object.assign(document.createElement('style'), { textContent: css }))`.
   - `GM_info` — `{ script: { name: 'ShowAllEntityData', version: 'test' } }`.
   - `GM_xmlhttpRequest` — stub as a thin wrapper over `fetch()` if any
     targeted feature needs it; leave unstubbed (undefined) otherwise so
     tests fail loudly if a feature unexpectedly depends on it.

3. **Injects dependencies in the correct order** before the main script:
   `VZ_MBLibrary.user.js` → `iro` → `pako` → `ShowAllEntityData.user.js`.
   Read all four from the local git checkout (find their current paths/URLs
   at the top of `ShowAllEntityData.user.js`'s `==UserScript==` block —
   `@require` lines) rather than fetching them over the network on every
   test run; vendor local copies into `test/vendor/` if they aren't already
   present in the repo, and note in the harness file where each came from.

4. **Sets `window.__SA_TEST_MODE__ = true`** via `addInitScript()`, *before*
   injecting the main script. This is the gate the debug hook (Part 2) reads
   to decide whether to attach itself — it must never be defined in a normal
   Tampermonkey install.

5. Exports a single `setupPage(page, url)` helper that performs steps 2–4
   against an already-navigated `page`, plus a `newContext()` helper wrapping
   step 1, so individual test files stay short (setup call + assertions).

## Part 2 — Debug hook: `window.__saTest`

Add a small, read-only introspection API to `ShowAllEntityData.user.js`,
gated behind the harness's `window.__SA_TEST_MODE__` flag from step 4 above
— define it only when that flag is present, mirroring how Falcon gates
`window.__falconTest`. Do not add any new UI or change any user-visible
behavior; this is purely an introspection surface for tests.

Expose, at minimum:

- **`__saTest.getUniqDropSections(colName)`** — opens (or reads the current
  state of, if already open) the 📊 panel for the given column name, and
  returns a plain-JSON-serializable structure: for each rendered section
  (per `SYN_SECTION_META`), its label/icon and an array of `{ label, count,
  checked }` for each entry row. Read this from the actual rendered DOM
  inside `openUniqDrop()`'s output (not from internal state that might
  diverge from what the user sees) so the test is verifying what a person
  actually sees in the panel.
- **`__saTest.closeUniqDrop()`** — thin wrapper calling the existing
  `closeUniqDrop()` internal, for tests to reset panel state between
  assertions.

Report back (diff + exact insertion point) before finalizing this addition,
since it touches the shared main script file, even though it's additive and
inert outside test mode.

## Part 3 — First test: `test/verify-uniqdrop-structure-section.mjs`

Target: the **"Structure"** section (cell-structure states: empty /
single-row / multi-row-collapsed / multi-row-expanded — see
`_findCellXxx`-family extractors and `SYN_SECTION_META`), since it's
rendered on effectively every page type with collapsible multi-value cells,
making it a good first target independent of any single page type's quirks.

The test should:

1. Use the Part 1 harness to open a real MusicBrainz page known to produce
   a mix of empty / single-row / multi-row cells in a collapsible column —
   an artist's release-groups listing is a reasonable choice (multi-disc /
   multi-format groups reliably produce multi-row "Format" or "Tracks"
   cells). Pick a specific, stable artist MBID with enough releases to
   exercise all four structure states; note the chosen MBID and *why* it
   was chosen in a comment, the way the Falcon test explains its `RELEASE`
   MBID choice.
2. Wait for the table to fully render (the existing fetch pipeline's
   completion signal — check `startFetchingProcess`/`finalCleanup` for
   the right hook to await rather than a fixed `waitForTimeout`).
3. Call `__saTest.getUniqDropSections('<column name>')` for the chosen
   collapsible column.
4. Assert:
   - The "Structure" section is present.
   - All four structure-state entries the page's data should produce are
     present with non-zero counts (adjust the specific asserted counts to
     match what the chosen page actually contains — inspect it first rather
     than guessing numbers).
   - Every entry carries `dataset.mbUniqSynLabel` in the underlying DOM
     (the step-7 quickfilter-visibility check from the `uniq-dropdown-section`
     skill) — read this directly via `page.evaluate`, not through the
     `__saTest` summary, since this is exactly the kind of wiring gap that's
     invisible to a summary but breaks quickfilter in practice.
   - Reopening the panel (`closeUniqDrop()` then re-triggering open) produces
     an identical section/entry list — this guards the "self-corrupting on
     second filter pass" failure mode the skill documents.

## Project conventions (apply to all touched code)

- Untabify tab stops; strip trailing whitespace.
- Standardized JSDoc block on every new function (harness helpers included).
- Add a changelog entry to `ShowAllEntityData_CHANGELOG.json` for the
  `__saTest` hook addition (label: `"🔧 Internal"` or existing equivalent —
  match whatever internal/tooling label the changelog already uses) and bump
  the script version. The harness/test files themselves are not part of the
  userscript's runtime and don't need a changelog entry or version bump.
- Report the `__saTest` diff before finalizing (Part 2), per the
  confirmation-gate convention for changes to the shared main script file.
