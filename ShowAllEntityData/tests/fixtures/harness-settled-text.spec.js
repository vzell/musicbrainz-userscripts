'use strict';

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { waitForFilterSettled } = require('../support/filterSortAssertions');

// The settle-wait behind waitForFilterSettled / waitForSortSettled /
// waitForSubTableFilterSettled (_runAndWaitForSettledText). Until 2026-10-04
// it accepted a result only if the status text DIFFERED from the pre-trigger
// baseline (or a ⏳ was caught by its 100 ms poll), so an operation that
// finished with a byte-identical line made the wait unsatisfiable (DEBUG-NOTES,
// 2026-09-18 "A fourth load-sensitive spec"). It now also counts writes.
//
// What this pins:
//   - an identical rewrite of the status line counts as settled;
//   - a trigger that writes nothing still times out: the fix must not have
//     made the helper succeed on a no-op.
// Both triggers are synthetic on purpose: a real re-filter cannot be forced
// to repeat its "in N ms" figure, so it cannot reproduce the bug on demand.

const RG_URL = 'https://musicbrainz.org/release-group/aaaaaaaa-0000-0000-0000-000000000002';
const RG_FIXTURE = path.join(__dirname, 'releasegroup-releases-live-titles.html');
const STATUS = '#mb-filter-status-display';

/**
 * Renders the fixture and leaves a settled, non-empty filter status line.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string>} the status line
 */
async function renderWithStatus(page) {
    await loadUserscriptPage(page, { url: RG_URL, fixtureFile: RG_FIXTURE, testMode: true });
    await page.click('button[data-label="Show all Releases for ReleaseGroup"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
    // Settled by polling the line itself, NOT through the helper under test,
    // so a broken helper fails the assertion that names it rather than this
    // setup.
    await page.fill('#mb-global-filter-input', '1975');
    await expect(page.locator(STATUS), 'premise: a settled filter status line').toHaveText(/^✓ .*1975/);
    return page.locator(STATUS).textContent();
}

test.describe('harness: settle-waits', () => {
    test('a byte-identical status line written after the trigger counts as settled', async ({ page }) => {
        const before = await renderWithStatus(page);
        // What a re-filter does when it ends with the same count, query and
        // duration: it assigns the same string again.
        await waitForFilterSettled(page, () => page.evaluate((sel) => {
            const el = document.querySelector(sel);
            el.textContent = el.textContent;
        }, STATUS), { timeout: 3000 });
        expect(await page.locator(STATUS).textContent()).toBe(before);
    });

    test('a trigger that writes nothing still times out', async ({ page }) => {
        await renderWithStatus(page);
        await expect(waitForFilterSettled(page, async () => {}, { timeout: 1500 }))
            .rejects.toThrow(/did not settle to a new value/);
    });
});
