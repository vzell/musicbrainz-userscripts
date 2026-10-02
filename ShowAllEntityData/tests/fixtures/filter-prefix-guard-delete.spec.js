'use strict';

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// Bug: guardFilterPrefixKeydown() — the keydown guard that keeps the "🔍 "
// focus prefix out of reach of Backspace/Delete — had two holes:
//
//   1. Ctrl+A (rewritten by the guard to select only the user text) then
//      Backspace did NOTHING: any Backspace whose selection started at or
//      before the prefix boundary was blocked, selection or not.
//   2. Delete on a selection starting INSIDE the prefix (a select-all whose
//      async selectionchange clamp had not run yet) rewrote `.value` by hand
//      and fired no 'input' event: the box emptied, the table stayed
//      filtered on the old text.
//
// (2) is what made source-row-tally-memo.spec.js's "single-table" test fail
// intermittently: Playwright's fill('') selects all and presses Delete, and
// on feature/uvd-recording-comments the timing let the Delete arrive first.
// The guarantee pinned here is "deleting the filter text re-runs the filter",
// not merely "the text is gone" — (2) met the latter.

const REC_URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/recordings';
const REC_FIXTURE = path.join(__dirname, 'uniq-drop-pending-edits.html');

/**
 * Rows currently shown, across every table.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<number>}
 */
const visible = (page) => page.evaluate(() =>
    Array.from(document.querySelectorAll('table.tbl tbody tr'))
        .filter((r) => r.style.display !== 'none' && !r.classList.contains('mb-col-filter-row')).length);

/**
 * Renders the five-recording fixture and types "Track E" into the global
 * filter for real, leaving one row.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<import('@playwright/test').Locator>} The global filter.
 */
async function renderFiltered(page) {
    await loadUserscriptPage(page, { url: REC_URL, fixtureFile: REC_FIXTURE, testMode: true });
    await page.route(`${REC_URL}?**`, (r) => r.fulfill({ path: REC_FIXTURE, contentType: 'text/html' }));
    await page.click('button[data-label="⊚ All recordings"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
    const gf = page.locator('#mb-global-filter-input');
    await gf.click();
    await page.keyboard.type('Track E');
    await expect.poll(() => visible(page)).toBe(1);
    return gf;
}

test.describe('filter prefix guard: deleting the text re-runs the filter', () => {
    test('Ctrl+A then Backspace clears the text and shows every row', async ({ page }) => {
        const gf = await renderFiltered(page);
        await page.keyboard.press('Control+a');
        await page.keyboard.press('Backspace');
        await expect(gf).toHaveValue('🔍 ');
        await expect.poll(() => visible(page)).toBe(5);
    });

    for (const key of ['Delete', 'Backspace']) {
        test(`${key} on a selection still covering the prefix keeps it and re-filters`, async ({ page }) => {
            const gf = await renderFiltered(page);
            // Select from 0 and press the key in ONE task, before the async
            // selectionchange clamp can move the selection off the prefix —
            // the window Playwright's fill('') sometimes hit.
            const handled = await page.evaluate((k) => {
                const el = document.getElementById('mb-global-filter-input');
                el.setSelectionRange(0, el.value.length);
                const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
                el.dispatchEvent(ev);
                return ev.defaultPrevented;
            }, key);
            expect(handled, 'the guard handled the deletion itself').toBe(true);
            await expect(gf).toHaveValue('🔍 ');
            await expect.poll(() => visible(page), { message: 'the filter re-ran' }).toBe(5);
        });
    }

    test('Backspace with the caret right after the prefix still leaves the prefix alone', async ({ page }) => {
        const gf = await renderFiltered(page);
        await page.evaluate(() => {
            const el = document.getElementById('mb-global-filter-input');
            el.setSelectionRange(2, 2);
        });
        await page.keyboard.press('Backspace');
        await expect(gf).toHaveValue('🔍 Track E');
        expect(await visible(page)).toBe(1);
    });
});
