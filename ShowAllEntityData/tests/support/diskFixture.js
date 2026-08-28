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
 *   - As of save-format version 1.1 (`SA_SNAPSHOT_FORMAT_VERSION` in
 *     `ShowAllEntityData.user.js`), two previously-broken/incomplete
 *     round-trips are fixed:
 *       - `cdtoc` pages' tracklist show/hide toggle (`data-cdtoc-tracklist-html`/
 *         `-visible`) now survives a disk-load, via the new `cdtocTracklistData`
 *         field.
 *       - The "Relationships" injected column (`td.mb-rel-cell`) is now baked
 *         into the saved snapshot the same way CAA/EAA artwork is — a page
 *         saved with every relationship icon already loaded restores them
 *         immediately on disk-load with **zero** network/IDB activity
 *         (confirmed via code trace: `initRelationshipsColumn()`'s own
 *         `td.dataset.mbid && !td.dataset.relDone` candidate filter skips a
 *         restored cell entirely). `waitForRelationshipsComplete()`
 *         (`asyncCompletion.js`) still resolves correctly in this case — the
 *         "all cells already done" path still fires the same completion
 *         signal the normal fetch-and-populate path does, just with no fetch.
 *     Fixture files captured **before** this change are version `1.0` and
 *     naturally lack both new fields — they still load correctly, just via
 *     the pre-1.1 fallback behavior (cdtoc toggle stays broken, Relationships
 *     still re-fetches). Re-capture a fixture (`capture-fixture.js`) to get
 *     1.1-format coverage of either fix.
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
