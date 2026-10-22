'use strict';

// The header-count scan publishes its numbers in batches (PERFORMANCE.org
// Step 38). Every write to a header badge makes the browser lay out the whole
// table again on its next frame, and while a person types that frame is the
// next keystroke: 74-163 ms per write on artist-events (DEBUG-NOTES
// 2026-10-10). The scan used to write each column's badges as soon as that
// column was done, one layout per column.
//
// ── The guarantees pinned ───────────────────────────────────────────────────
//
// 1. A scan that finishes inside the flush interval writes every badge in ONE
//    task. Observed through a MutationObserver: it delivers one callback per
//    task that changed the header, so "one callback with badge records" is
//    "one batch". A control run with the interval at 0 must see SEVERAL
//    callbacks — otherwise the observer could not tell batches apart and (1)
//    would pass while measuring nothing.
// 2. A scan superseded mid-way writes nothing it had not yet published: only
//    the superseding scan's batch reaches the header, and the final numbers
//    are the right ones.
//
// The interval is set through `__saTest.colHeaderCounts.setFlushMs()` so the
// outcome does not depend on how fast this machine scans 56 rows.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadFromDiskFixture } = require('../support/diskFixture');
const { waitForColHeaderCountsStable } = require('../support/filterSortAssertions');

// The BoDeans page: artist-releases, tableMode 'single', 56 rows.
const BODEANS_URL = 'https://musicbrainz.org/artist/84c38d3a-3400-4c28-b988-90558bb6fae0/releases';
const BODEANS_FIXTURE = path.join(__dirname, 'saved-data', 'artist-releases-bodeans.json.gz');

const BADGES = '.mb-col-uniq-count, .mb-col-collapse-count';

/**
 * Loads the fixture and waits until the first header-count scan is over.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function open(page) {
    await loadFromDiskFixture(page, {
        url: BODEANS_URL, fixturePath: BODEANS_FIXTURE, testMode: true,
        settingsOverride: { sa_enable_relationships_column: false },
    });
    await expect(page.locator('h2 .mb-row-count-stat')).toHaveText('(56)', { timeout: 30000 });
    await waitForColHeaderCountsStable(page, { timeout: 60000 });
}

/**
 * Starts counting, per MutationObserver callback, the records that touched a
 * header badge of the first table. Read with `stopBatchCount()`.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
const startBatchCount = (page) => page.evaluate((sel) => {
    const thead = document.querySelector('table.tbl thead');
    const rec = { batches: [] };
    rec.obs = new MutationObserver((records) => {
        const n = records.filter((r) => {
            const el = r.target.nodeType === 1 ? r.target : r.target.parentElement;
            return el && el.closest(sel);
        }).length;
        if (n) rec.batches.push(n);
    });
    rec.obs.observe(thead, { childList: true, characterData: true, subtree: true });
    window.__batchRec = rec;
}, BADGES);

/**
 * Stops counting and returns the badge-record counts per callback.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<number[]>}
 */
const stopBatchCount = (page) => page.evaluate(async () => {
    // Let a pending observer callback for the last task run first.
    await new Promise((r) => setTimeout(r, 0));
    window.__batchRec.obs.disconnect();
    return window.__batchRec.batches;
});

/**
 * The text of every unique-count badge of the first table, in column order.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string[]>}
 */
const uniqTexts = (page) => page.evaluate(() =>
    Array.from(document.querySelectorAll('table.tbl thead tr:first-child th'))
        .map((th) => { const s = th.querySelector('.mb-col-uniq-count'); return s ? s.textContent : null; }));

test.describe('header counts are published in batches', () => {
    test('a scan inside the flush interval writes every badge in one task', async ({ page }) => {
        test.setTimeout(120000);
        await open(page);
        const before = await uniqTexts(page);
        const badgeCount = before.filter((t) => t !== null).length;
        expect(badgeCount, 'the table has enough badges to tell one batch from many').toBeGreaterThanOrEqual(8);

        // Control: with no interval every recomputed column flushes on its own,
        // and the observer must be able to see that.
        await page.evaluate(() => window.__saTest.colHeaderCounts.setFlushMs(0));
        await startBatchCount(page);
        await page.evaluate(() => window.__saTest.colHeaderCounts.rescan(0));
        const perColumn = await stopBatchCount(page);
        expect(perColumn.length, `control: per-column flushes are visible as separate callbacks ${JSON.stringify(perColumn)}`)
            .toBeGreaterThan(3);

        // The real interval, made long enough that this scan never reaches it.
        await page.evaluate(() => window.__saTest.colHeaderCounts.setFlushMs(60000));
        await startBatchCount(page);
        await page.evaluate(() => window.__saTest.colHeaderCounts.rescan(0));
        const batched = await stopBatchCount(page);
        await page.evaluate(() => window.__saTest.colHeaderCounts.setFlushMs(null));
        expect(batched, 'one callback carries every badge write').toHaveLength(1);
        expect(batched[0], 'that batch wrote every unique-count badge').toBeGreaterThanOrEqual(badgeCount);
        expect(await uniqTexts(page), 'the numbers are unchanged by batching').toEqual(before);
    });

    test('a scan superseded mid-way publishes nothing of its own', async ({ page }) => {
        test.setTimeout(120000);
        await open(page);
        const before = await uniqTexts(page);

        await page.evaluate(() => {
            const h = window.__saTest.colHeaderCounts;
            h.setFlushMs(60000);
            // After the scan's THIRD recomputed column, start a fresh scan of the
            // same table: the first one is now stale and must drop what it holds.
            let n = 0;
            h.setAfterColumn(() => {
                if (++n !== 3) return;
                h.setAfterColumn(null);
                window.__second = h.rescan(0);
            });
        });
        await startBatchCount(page);
        await page.evaluate(async () => {
            await window.__saTest.colHeaderCounts.rescan(0);
            await window.__second;
        });
        const batches = await stopBatchCount(page);
        const superseded = await page.evaluate(() => !!window.__second);
        await page.evaluate(() => window.__saTest.colHeaderCounts.setFlushMs(null));

        // Premise: the first scan really was superseded mid-way.
        expect(superseded, 'the second scan started from inside the first').toBe(true);
        expect(batches, `only the second scan's batch reached the header ${JSON.stringify(batches)}`).toHaveLength(1);
        expect(await uniqTexts(page), 'the final numbers are the right ones').toEqual(before);
    });
});
