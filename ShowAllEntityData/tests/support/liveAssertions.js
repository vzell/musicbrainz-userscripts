'use strict';

const { expect } = require('@playwright/test');

/**
 * Attaches an uncaught-JS-exception collector to `page` and returns the
 * backing array (appended to as errors occur — read it after the actions
 * you want to check finish).
 *
 * Deliberately listens only to `pageerror` (uncaught exceptions), not the
 * `console` 'error' event — the browser itself logs console errors for
 * things with nothing to do with script correctness (a favicon or asset
 * request that transiently 503s, a blocked third-party request, …), and a
 * live test hitting real infrastructure will see those from time to time.
 * `pageerror` only fires for an actual uncaught JS exception, which is what
 * we care about here.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {string[]}
 */
function collectPageErrors(page) {
    const errors = [];
    page.on('pageerror', (err) => errors.push(String(err)));
    return errors;
}

/**
 * Asserts a `tableMode: 'multi'` render (renderGroupedTable) completed
 * successfully and self-consistently, without depending on the exact
 * current MusicBrainz data (which can change at any time — see the
 * rationale comment in tests/live/release-group-fetch.spec.js).
 *
 * Checks:
 *   - #mb-filter-container became visible (renderGroupedTable's own
 *     "initial render finished" signal),
 *   - at least one row rendered,
 *   - the script's own per-<h3>-group `.mb-row-count-stat` counts sum to
 *     the actual rendered row count,
 *   - no page/console errors occurred.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string[]} pageErrors - array from collectPageErrors(page)
 * @param {{ timeout?: number }} [opts]
 * @returns {Promise<number>} the rendered row count
 */
async function assertGroupedRenderCompleted(page, pageErrors, opts = {}) {
    const timeout = opts.timeout || 90000;

    await expect(page.locator('#mb-filter-container')).toBeVisible({ timeout });

    const rowCount = await page.locator('table.tbl tbody tr').count();
    expect(rowCount).toBeGreaterThan(0);

    const groupCountTexts = await page.locator('.mb-toggle-h3 .mb-row-count-stat').allTextContents();
    expect(groupCountTexts.length).toBeGreaterThan(0);

    const reportedTotal = groupCountTexts.reduce((sum, text) => {
        const match = text.match(/\((\d+)/);
        return sum + (match ? Number(match[1]) : 0);
    }, 0);
    expect(reportedTotal).toBe(rowCount);

    expect(pageErrors, `Unexpected console/page errors during fetch+render:\n${pageErrors.join('\n')}`).toEqual([]);

    return rowCount;
}

module.exports = { collectPageErrors, assertGroupedRenderCompleted };
