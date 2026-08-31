'use strict';

const { waitForCaaEaaComplete, waitForRelationshipsComplete } = require('./asyncCompletion');

/**
 * Waits for a triggered fetch+render to fully settle.
 *
 * `#mb-filter-container` becoming visible (`renderFinalTable()`/
 * `renderGroupedTable()`'s own "initial render finished" signal, reused
 * from `tests/support/liveAssertions.js`'s `assertGroupedRenderCompleted()`)
 * is necessary but NOT SUFFICIENT on:
 *
 *   - a pageType with async CAA/EAA artwork or an injected Relationships
 *     column: those complete well *after* that point — confirmed
 *     empirically while building the `task-playwright-html-snapshot-harness.md`
 *     pilot (`#mb-info-display-caa`/`-rel` were still empty several seconds
 *     after `#mb-filter-container` became visible). Capturing an HTML
 *     snapshot before they finish would bake in an incomplete,
 *     run-to-run-varying `#mb-info-display-caa`/`-rel` state, defeating the
 *     point of a stable baseline.
 *   - a `tableMode: 'single'` pageType whose row count exceeds
 *     `sa_chunked_render_threshold` (default 1000): `startFetchingProcess()`
 *     sets `#mb-filter-container` visible SYNCHRONOUSLY, in the same tick as
 *     calling `renderFinalTable()` — which for a large table `await`s
 *     `renderRowsChunked()`'s batched, `requestAnimationFrame`-yielding
 *     insertion loop. Confirmed live on `artist-events` (4174 rows, exceeds
 *     the threshold): a captured `rendered.html` showed the "🎨 Rendering
 *     rows... 2000 / 4,174" progress overlay (`#mb-render-heading`) still on
 *     screen, and the auto-resize button entirely missing from the action
 *     bar (`addAutoResizeButton()` only runs once the chunked render fully
 *     resolves — strictly after this same point). Waiting for
 *     `#mb-render-heading` to be ABSENT closes this gap; there is no race
 *     window checking it immediately after `#mb-filter-container` becomes
 *     visible, because both DOM mutations happen in the same synchronous JS
 *     execution burst (Playwright/CDP can only observe DOM state after that
 *     burst yields) — if the overlay was going to appear at all, it already
 *     has by the time this function's own poll can run.
 *
 * Still NOT sufficient for the column-header count badges
 * (`.mb-col-uniq-count`/`.mb-col-collapse-count`). Those are written by
 * `_updateAllColHeaderCounts()`, which is scheduled after the render settles
 * and then sliced one event-loop turn per column, so it finishes strictly
 * later than everything this function waits on. Use
 * `filterSortAssertions.js`'s `waitForColHeaderUniqCount()` (exact expected
 * value) or `waitForColHeaderCountsStable()` (value-free) when a test or a
 * snapshot capture depends on those badges.
 *
 * `seedGMValue`-equivalent note: no separate helper needed here —
 * `tests/support/gmStubs.js`'s `buildGmStubsScript(initialValues)` already
 * covers seeding settings (e.g. `sa_enable_release_tracks`) before the
 * userscript's init runs.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ hasCaaOrEaa?: boolean, hasRelationships?: boolean, waitForAutoResize?: boolean, timeout?: number }} [opts]
 *   `hasCaaOrEaa`/`hasRelationships` should mirror the target pageType's own
 *   `features.addCAA`/`features.addEAA`/`features.injectedColumns` (does it
 *   include `'Relationships'`?) declarations in `ShowAllEntityData.user.js`'s
 *   `pageDefinitions`. `waitForAutoResize` (default `true`) additionally
 *   waits for the auto-resize-on-load pass (`sa_auto_resize_columns`,
 *   default-on) to finish — via `#mb-resize-btn`'s title flipping to
 *   "Restore…" (`updateResizeButtonState(true)`, the same signal a user
 *   watches for after manually clicking the button) — before returning.
 *   Set `false` for a pageType where `sa_auto_resize_columns` is seeded off,
 *   or whose row count is expected to exceed
 *   `sa_auto_resize_columns_threshold` (default 10000) — in either case the
 *   button never reaches "Restore…" and this wait would otherwise hang
 *   until `timeout`. When `#mb-resize-btn` doesn't exist at all
 *   (`sa_enable_column_resizing` off), this step is a no-op regardless of
 *   `waitForAutoResize`.
 * @returns {Promise<void>}
 */
async function waitForRenderComplete(page, {
    hasCaaOrEaa = false, hasRelationships = false, waitForAutoResize = true, timeout = 90000,
} = {}) {
    await page.locator('#mb-filter-container').waitFor({ state: 'visible', timeout });
    await page.waitForFunction(
        () => !document.getElementById('mb-render-heading'),
        null,
        { timeout }
    );
    if (hasCaaOrEaa) await waitForCaaEaaComplete(page, { timeout });
    if (hasRelationships) await waitForRelationshipsComplete(page, { timeout });
    if (waitForAutoResize) {
        await page.waitForFunction(
            () => {
                const btn = document.getElementById('mb-resize-btn');
                return !btn || btn.title.startsWith('Restore');
            },
            null,
            { timeout }
        );
    }
}

module.exports = { waitForRenderComplete };
