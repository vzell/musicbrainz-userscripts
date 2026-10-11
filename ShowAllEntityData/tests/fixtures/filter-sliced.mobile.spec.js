'use strict';

// The time-sliced typing filter on a touch device (chromium-mobile: Pixel 7,
// hasTouch, no hover). The pass yields with scheduler.yield() / MessageChannel
// whatever the input device, so the property is the desktop one — a sliced pass
// shows exactly what a synchronous pass does — pinned here through the touch
// path: the user taps the field and types. Desktop, and the replaced-pass
// guarantees: filter-sliced.spec.js.
//
// Rendered and tapped through the shared helpers of filter-autofocus.mobile
// (tests/support/filterAutofocus.js): the user-ratings fixture, a multi-table
// page, whose global filter a tap reaches at this width.

const { test, expect } = require('../support/test');
const { openRatings, activate } = require('../support/filterAutofocus');
const { waitForFilterSettled } = require('../support/filterSortAssertions');

/**
 * The rendered rows' source indexes and the status line without its timing.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{rows: string[], status: string}>}
 */
const shown = (page) => page.evaluate(() => ({
    rows: Array.from(document.querySelectorAll('table.tbl tbody tr'))
        .filter((tr) => tr.style.display !== 'none').map((tr) => tr.dataset.mbRowIdx || tr.textContent.slice(0, 40)),
    status: (document.querySelector('#mb-filter-status-display') || {}).textContent.replace(/ in \d+ms/, ''),
}));

/**
 * Taps the global filter and types `text` into it.
 * @param {import('@playwright/test').Page} page
 * @param {string} text
 * @returns {Promise<void>}
 */
async function tapAndType(page, text) {
    const input = page.locator('#mb-global-filter-input');
    await activate(input, true);
    // The field's "🔍 " prefix lands on focus; a key typed before it ends up
    // in front of it (seen: "B🔍 ru"). Same wait as typeGlobalFilter().
    await expect.poll(() => input.inputValue()).toMatch(/\u{1F50D}/u);
    await page.keyboard.press('End');
    await page.keyboard.type(text);
}

test('sliced typing filter on mobile: same rows as a synchronous pass', async ({ page }) => {
    test.setTimeout(120000);
    await openRatings(page);
    const total = await page.locator('table.tbl tbody tr').count();
    // A query taken from the page itself: the first three letters of the first
    // row's longest cell, so it matches something without knowing the data.
    const query = await page.evaluate(() => {
        const cells = Array.from(document.querySelector('table.tbl tbody tr').cells).map((c) => c.textContent.trim());
        return cells.sort((a, b) => b.length - a.length)[0].slice(0, 3);
    });
    await page.evaluate(() => {
        window.__slices = 0;
        window.__saTest.filterSlicing.set({ threshold: 0, rowsPerCheck: 1, budgetMs: 0, onSlice: () => { window.__slices++; } });
    });
    await waitForFilterSettled(page, () => tapAndType(page, query));
    const sliced = await shown(page);
    expect(await page.evaluate(() => window.__slices), 'premise: the pass was sliced').toBeGreaterThanOrEqual(total);
    expect(sliced.rows.length, 'premise: the query matches something').toBeGreaterThan(0);

    await page.evaluate(() => { window.__saTest.filterSlicing.reset(); window.__saTest.filterSlicing.clearCache(); });
    // The ✕ from script: at this width the fixture's header covers it (see
    // filterAutofocus.js on why a scripted click runs the same handler).
    await waitForFilterSettled(page, () => page.locator('#mb-global-filter-clear').evaluate((b) => b.click()));
    await waitForFilterSettled(page, () => tapAndType(page, query));
    expect(await shown(page)).toEqual(sliced);
});
