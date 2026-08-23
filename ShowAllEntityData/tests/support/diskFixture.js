'use strict';

const { loadUserscriptPage } = require('./loadPage');

/**
 * Loads a previously-captured Save-to-disk fixture instead of fetching
 * live, by driving the real hidden file input inside the Load-from-disk
 * dialog (`showLoadFilterDialog()`'s `dialogFileInput`). Hydrates through
 * the same render pipeline a live fetch uses
 * (`_hydrateAndRenderFromSnapshotData()`, via `loadTableDataFromDisk()`) —
 * this exercises real render code, not a mock, and skips the network fetch
 * entirely, making it fast and immune to MusicBrainz data drift.
 *
 * Flow, traced directly from `showLoadFilterDialog()`'s button wiring:
 *   1. Click `#mb-load-from-disk-btn` — its `onclick` is exactly
 *      `() => showLoadFilterDialog(loadFromDiskBtn)`, which builds the
 *      dialog (and its file input) fresh; neither exists before this.
 *   2. `page.setInputFiles()` on the dialog's hidden
 *      `input[type="file"][accept*="gz"]` — fires its own `'change'`
 *      handler directly, which reads/validates the file and reveals
 *      "Phase 2". No need to click the visible "Load Data" button first —
 *      that button's only job is `dialogFileInput.click()`, opening a real
 *      OS file picker that `setInputFiles()` bypasses entirely.
 *   3. Click "▶ Render All Rows" (`#sa-render-no-filter-confirm`) — its
 *      `onclick` clears any filter state, calls `loadTableDataFromDisk()`
 *      directly, and closes the dialog. "Phase 3" (the plain "Render Data"
 *      button, `#sa-render-confirm`) only exists for the FILTERED-load path
 *      (via "Filter Data", `#sa-filter-confirm`) and is never reached by
 *      this all-rows flow.
 *
 * Known pageType caveats (not handled by this helper — see
 * `task-playwright-test-infra-expansion.md`'s Part 6 for the underlying
 * script code these come from):
 *   - `listToTable` pages (e.g. artist-credit) need `startFetchingProcess`'s
 *     DOM pre-processing manually re-run before hydration — the disk-load
 *     entry point skips it.
 *   - `cdtoc` pages lose their tracklist-toggle dataset attributes on
 *     disk-load (not serialized).
 *   - The "Relationships" injected column is NOT baked into the saved
 *     snapshot the way CAA/EAA artwork is — confirmed empirically (a live
 *     WS/2 `url-rels` request still fired after disk-loading a page with
 *     `injectedColumns: ['Relationships']`, with no corresponding CAA/EAA
 *     network activity). A disk-loaded page is not fully network-free if
 *     that feature is active; `waitForRelationshipsComplete()`
 *     (`asyncCompletion.js`) still applies and is still needed for tests
 *     that depend on that column's final state.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ url: string, fixturePath: string, testMode?: boolean }} opts
 * @returns {Promise<void>}
 */
async function loadFromDiskFixture(page, { url, fixturePath, testMode } = {}) {
    await loadUserscriptPage(page, { url, testMode });

    await page.click('#mb-load-from-disk-btn');

    // The dialog's own file input has no id and shares "accept*=gz" with
    // the vestigial, dead #mb-file-input toolbar input (see this module's
    // own JSDoc) — but only the dialog's input also accepts ".json"
    // (`.gz,application/gzip,.json` vs. the vestigial one's
    // `.gz,application/gzip`), which disambiguates the two uniquely.
    const fileInput = page.locator('input[type="file"][accept*="json"]');
    await fileInput.setInputFiles(fixturePath);

    await page.click('#sa-render-no-filter-confirm');
}

module.exports = { loadFromDiskFixture };
