'use strict';

const { test, expect } = require('../support/test');
const { loadUserscriptPageWithRealNetwork } = require('../support/realNetworkGmXhr');
const { collectPageErrors } = require('../support/liveAssertions');
const { waitForCaaEaaComplete } = require('../support/asyncCompletion');
const { waitForSortSettled, getPageRowCount } = require('../support/filterSortAssertions');

/**
 * End-to-end guard for the CAA icon column surviving a sort on a
 * `tableMode: 'single'` page.
 *
 * Sorting is not a DOM reorder — the sort-icon handler sorts the row array
 * and then re-enters `runFilter()`, which re-clones every row and runs
 * `_stripTransientCellState()` over each clone. That helper used to blank
 * every artwork icon's `background-image` unconditionally, so the whole CAA
 * column went empty on each sort and then refilled one image at a time.
 * Nothing was actually re-fetched (every image came straight back out of the
 * Tier-1 `_artIdbMemCache`), but it read as a full reload.
 *
 * **How this is measured.** The blanking happens on a DETACHED clone, in the
 * window between `cloneNode(true)` and insertion, so a MutationObserver
 * watching the table subtree can never observe it — by the time a row is in
 * the document the queue may already have repainted it. Sampling "is it
 * painted?" after the sort settles is likewise racy for the same reason.
 * Instead this probes each row AT INSERTION, synchronously inside the
 * observer callback: with the fix, rows arrive already carrying their
 * thumbnails; without it, every row arrives blank and is repainted
 * asynchronously afterwards. That distinction is the whole bug.
 *
 * Needs REAL CAA network access — `gmStubs.js`'s always-404
 * `GM_xmlhttpRequest` would leave every icon unpainted, making the
 * assertion vacuously true (nothing painted can't be blanked). Uses
 * `realNetworkGmXhr.js`'s passthrough, as
 * `subtable-filter-sort-caa-interaction.spec.js` does.
 *
 * ## Why BoDeans and not a large artist
 *
 * The bug reproduces at any row count, so this deliberately picks the
 * smallest artist-releases page that still has real cover art: BoDeans fits
 * on ONE native page, so there is no pagination to sit through and no
 * `stopAfterPages()` cutoff to tune. The same artist backs
 * `artist-releases-filter-sort.spec.js` (via its disk fixture), so its CAA
 * coverage is already known-good.
 *
 * A larger artist was tried first and rejected on evidence: on
 * `/artist/70248960-…/releases` (Bruce Springsteen) the live fetch did not
 * advance past its FIRST page within 200 s through this harness — the
 * `#mb-fetch-progress-fill` bar stayed at 0% and `#mb-fetch-progress-label`
 * stayed empty the whole time, so `stopAfterPages()` had nothing to wait on.
 * That is a property of the harness/page, not of this fix; anything wanting
 * a large-artist CAA baseline needs that investigated first.
 */

// BoDeans — a single-table pageType (artist-releases) with a real CAA column,
// per that pageDefinition's `caa` columnExtractor. One native page of rows.
const ARTIST_RELEASES_URL = 'https://musicbrainz.org/artist/84c38d3a-3400-4c28-b988-90558bb6fae0/releases';
const SHOW_ALL_BUTTON = 'button[data-label="🧮 Artist releases"]';
const SORT_COLUMN = 'Date';

/**
 * Installs a `childList` observer that records, for every `<tr>` inserted
 * into the table from now on, whether its artwork icons were ALREADY
 * painted at the moment of insertion.
 *
 * @param {import('@playwright/test').Page} page
 */
async function installInsertionProbe(page) {
    await page.evaluate(() => {
        window.__artInsertProbe = { iconsSeen: 0, iconsPaintedAtInsert: 0 };
        const table = document.querySelector('table.tbl');
        const obs = new MutationObserver((muts) => {
            for (const m of muts) {
                for (const node of m.addedNodes) {
                    if (node.nodeType !== 1 || node.tagName !== 'TR') continue;
                    const icons = node.querySelectorAll('span.caa-icon, span.eaa-icon, span.artwork-icon');
                    for (const i of icons) {
                        window.__artInsertProbe.iconsSeen++;
                        if (/url\(/.test(i.style.backgroundImage || '')) {
                            window.__artInsertProbe.iconsPaintedAtInsert++;
                        }
                    }
                }
            }
        });
        obs.observe(table, { childList: true, subtree: true });
        window.__artInsertObs = obs;
    });
}

test.describe('CAA icon column survives a sort (single-table)', { tag: '@extended' }, () => {
    test('rows re-inserted by a sort arrive with their thumbnails already painted', async ({ page }) => {
        // Over the 120 s project default: a real CAA queue drain for every
        // rendered row has to finish before the sort can even be triggered.
        test.setTimeout(300000);

        const pageErrors = collectPageErrors(page);

        await loadUserscriptPageWithRealNetwork(page, { url: ARTIST_RELEASES_URL, testMode: true });

        const showAllBtn = page.locator(SHOW_ALL_BUTTON);
        await expect(showAllBtn).toBeVisible();
        await showAllBtn.click();

        await expect(page.locator('#mb-filter-container')).toBeVisible({ timeout: 120000 });
        await waitForCaaEaaComplete(page, { timeout: 180000 });

        // Baseline: how many icons are actually carrying a thumbnail right
        // now. NOT every row has one — a release with no cover art in the
        // archive keeps an empty .caa-icon forever, so "all icons painted"
        // is the wrong invariant (BoDeans: 56 icons, 36 of them painted).
        // What must hold is that whatever WAS painted survives the sort.
        //
        // Also guards against a vacuous pass: if nothing ever got painted (no
        // network, no artwork at all), the assertion below could not fail no
        // matter how the code behaved.
        const paintedBefore = await page.evaluate(() =>
            Array.from(document.querySelectorAll('table.tbl tbody span.caa-icon'))
                .filter((i) => /url\(/.test(i.style.backgroundImage || '')).length
        );
        expect(paintedBefore, 'no artwork was painted before the sort — the probe would be vacuous')
            .toBeGreaterThan(0);

        const rowsBefore = await getPageRowCount(page);

        await installInsertionProbe(page);

        const columnTh = page.locator('table.tbl thead th', { hasText: SORT_COLUMN }).first();
        const ascendingBtn = columnTh.locator('.sort-icon-btn', { hasText: '▲' }).first();
        await waitForSortSettled(page, () => ascendingBtn.click(), { timeout: 60000 });

        const probe = await page.evaluate(() => {
            window.__artInsertObs.disconnect();
            return window.__artInsertProbe;
        });

        // The sort must actually have re-inserted rows, or there is nothing
        // to have measured.
        expect(probe.iconsSeen).toBeGreaterThan(0);

        // The fix. Before it this was 0 — every icon arrived blank and was
        // repainted afterwards, one queue task at a time.
        expect(probe.iconsPaintedAtInsert).toBe(paintedBefore);

        // Sorting must not have changed what is on the page.
        expect(await getPageRowCount(page)).toEqual(rowsBefore);
        expect(pageErrors).toEqual([]);
    });
});
