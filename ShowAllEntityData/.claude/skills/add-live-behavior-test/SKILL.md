---
name: add-live-behavior-test
description: Write a new tests/live/*.spec.js behavioral test for ShowAllEntityData — a Playwright test that navigates a real musicbrainz.org page and asserts on filter/sort/fetch/interaction behavior (no HTML-baseline diffing, that's add-snapshot-pagetype's job). Use this whenever the user asks to "add a live test for X", "test this interaction against a real MB page", "add a behavioral spec", or wants coverage for a specific mechanism (filtering, sorting, pagination, CAA/IDB caching, third-party-userscript interop, disk fixtures) rather than a whole new pageType's structural baseline.
---

# Adding a `tests/live/*.spec.js` behavioral test

`tests/live/` holds 13 functional specs (no baseline diffing) run against
real musicbrainz.org pages — see `tests/live/registry.org` for the full
index of what exists and why each page was picked. This is a different
harness from `tests/snapshots/` (whole-DOM regression baselines — use
`add-snapshot-pagetype` for that instead); reach for this skill when the
thing worth testing is a *behavior* (a filter narrows correctly, a click
truncates pagination, a cache tier is actually hit) rather than "does this
whole page still render the same DOM."

## 1. Pick the pageType/URL and identifier

Same criteria as `add-snapshot-pagetype`: check
`pageTypes-testing-reference.org`'s "Coverage clusters & representatives"
section first for an already-chosen representative/identifier; otherwise
default to a Bruce Springsteen-connected entity, prefer the smallest
qualifying catalog unless the test is specifically about pagination (then
use the minimum page count that triggers it — see
`release-group-paginated-fetch.spec.js`'s 2-page `RG_GREET` for the
precedent). Reuse an existing spec's URL if you're testing a *different*
mechanism on the *same* page — most of the filter/sort specs already share
"Tougher Than the Rest" (`f83d2211-dd81-4b1e-9a02-e89733891e1c`) for exactly
this reason (one real page, several independent behaviors asserted against
it across different spec files).

## 2. Decide the tag

Every spec carries exactly one Playwright tag, passed as the second
argument to `test()`/`test.describe()` — see `playwright.config.js`'s
project split and `tests/live/registry.org`'s intro for what each drives:

- **`@core`** — exercises a mechanism every change to the shared render/
  filter/sort/fetch pipeline could plausibly regress (global/column filter,
  sort, disk-fixture load, basic fetch/pagination, the markup-drift smoke
  test). Runs by default via `npm run test:live`.
- **`@extended`** — a bespoke/pageType-specific edge case (sub-table
  filter, Stop-button pagination limit, IDB cache-hit tiers, third-party
  userscript interop, a specific uniqdrop section). Runs via
  `npm run test:live:extended`.
- **`@perf`** — timing-focused, part of the deliberate perf-comparison
  instrumentation (`PERFORMANCE.org`) rather than a pass/fail correctness
  check. Only `tests/live/artist-events-interactions.spec.js` carries this
  today — don't add a new `@perf` spec without reading `PERFORMANCE.org`'s
  "no CI gate, manual trigger" framing first; see `run-perf-comparison`.

When unsure, default to `@extended` — it's the safe middle ground between
"every run" and "perf-only."

## 3. Write the spec

Follow the shape every existing spec uses (see `filter-global.spec.js` for
a complete, minimal example):

```js
'use strict';

const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { collectPageErrors } = require('../support/liveAssertions');
// + whichever of filterSortAssertions.js's helpers you need:
// waitForFilterSettled, waitForSortSettled, waitForActualRowCount,
// getPageRowCount, getSubTableRowCounts

const SOME_URL = 'https://musicbrainz.org/...';
const SHOW_ALL_BUTTON = 'button[data-label="..."]';

test('what this proves', { tag: '@core' }, async ({ page }) => {
    const pageErrors = collectPageErrors(page);
    await loadUserscriptPage(page, { url: SOME_URL, testMode: true });
    // ... interact, assert ...
    expect(pageErrors).toEqual([]);
});
```

Key building blocks, all in `tests/support/`:

- `loadPage.js`'s `loadUserscriptPage()` — navigates and injects the
  userscript; pass `testMode: true` to enable the `__saTest` debug hook
  used by several specs (see `tasks/task-playwright-test-infra-expansion.md`
  Part 1 for what it exposes).
- `gmStubs.js`'s `seedGmValues()` — pre-seed a `sa_*` setting (e.g.
  `sa_enable_release_tracks`) before the script's init runs, same as
  snapshot captures do.
- `filterSortAssertions.js` — `waitForFilterSettled`/`waitForSortSettled`
  wrap an interaction and wait out its async completion race (read the
  implementation notes there before assuming a bare `waitForFunction` on
  visible state is enough — this file exists because that assumption broke
  twice already); `getPageRowCount`/`getSubTableRowCounts` read the
  filtered/total/absolute tiers.
- `diskFixture.js`'s `loadFromDiskFixture()` — load a committed
  `.json.gz` fixture instead of a live fetch, for tests where determinism
  matters more than exercising the real fetch pipeline (see
  `disk-fixture-load.spec.js`). Capture a new fixture with
  `tests/support/capture-fixture.js` if none exists yet for your page.
- `liveAssertions.js`'s `collectPageErrors()` — assert `toEqual([])` at the
  end of nearly every spec; a silent console error is often the only signal
  a regression leaves.

Prefer asserting **invariants** (row-count tiers sum correctly, a sort only
reorders, a specific title text narrows to a specific count) over exact
row counts pulled from live MusicBrainz data — real MB data drifts; text
content and structural relationships don't. See any existing spec's
comment block for the reasoning behind its specific assertions.

## 4. Document it

Add a row to `tests/live/registry.org` (spec file, pageType, URL, page
title, what it verifies, notes) matching the existing rows' format, and
note the tag choice from step 2 if it's not obvious from the "verifies"
column.

## No changelog / version bump

Test tooling under `tests/` doesn't touch `ShowAllEntityData_CHANGELOG.json`
or `// @version` — same convention as `add-snapshot-pagetype`.

## How to drive this skill

> "Add a live test that Ctrl+Click on a prose cell's collapse toggle force-
> expands nested `<h2>`s — use the Annotation column on a label page."

Claude Code will pick (or reuse) a small Springsteen-connected identifier,
decide `@core` vs `@extended`, write the spec using the existing support
helpers, and add the `tests/live/registry.org` row.
