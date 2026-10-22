'use strict';

const { test, expect } = require('../support/test');
const { R, open } = require('../support/caaColumnFixture');

// The CAA/EAA column is wide enough for a fully loaded summary line even when
// the archive records arrive AFTER the auto-resize (debug/CAA-wrapped.png).
//
// The auto-resize measures every column once, right after the render. An art
// cell gets its count badge and type chips only when its record comes in —
// on a large page minutes later — and its summary line (li-0) is a wrapping
// flex row, so a column sized to the header put the chips on a second line
// wherever the table had no slack. _artReserveSummaryWidths() measures one
// fully loaded sample line per art column (_artBuildSummarySample()) and the
// resize never goes below it.
//
// Fixture: the release-group page of tests/support/caaColumnFixture.js, with
// every archive answer held open until the resize has finished.

/**
 * Per built CAA cell: what its summary line needs on one line (its
 * max-content width plus the cell's horizontal padding), and the column's
 * min-width as the resize set it on the header.
 *
 * @param {import('@playwright/test').Page} page
 */
const lines = (page) => page.evaluate(() => Array.from(document.querySelectorAll('table.tbl tbody td:has(> ul.mb-caa-art-ul)'), (td) => {
    const li0 = td.querySelector(':scope > ul.mb-caa-art-ul > li.mb-caa-art-li-summary');
    const th = td.closest('table').querySelectorAll('thead tr:first-child th')[td.cellIndex];
    const saved = [li0.style.flexWrap, li0.style.width];
    li0.style.flexWrap = 'nowrap';
    li0.style.width = 'max-content';
    const cs = getComputedStyle(td);
    const need = Math.ceil(li0.getBoundingClientRect().width + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)
        + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth));
    [li0.style.flexWrap, li0.style.width] = saved;
    return { need, min: parseFloat(th.style.minWidth) || 0, chips: !!li0.querySelector('.mb-caa-type-chips') };
}));

/**
 * Releases the held archive answers until every release with artwork has its
 * cell built. `release()` frees only the answers held at that moment, and the
 * art queue sends the next ones after, so it is called on every poll.
 *
 * @param {import('@playwright/test').Page} page
 * @param {function(): void} release
 */
async function releaseAll(page, release) {
    await expect.poll(() => { release(); return page.locator('table.tbl td > ul.mb-caa-art-ul').count(); }, {
        timeout: 30000, message: 'every release with artwork gets its cell built',
    }).toBe(6);
}

test.describe('CAA column width when the artwork arrives after the auto-resize', () => {
    test('auto-resize on load: the column fits every summary line that arrives later', async ({ page }) => {
        const { release } = await open(page, { sa_auto_resize_columns: true, sa_enable_column_resizing: true },
            { hold: Object.values(R) });
        await expect.poll(() => page.locator('#mb-resize-btn').getAttribute('title'), { timeout: 30000 }).toMatch(/^Restore/);
        // The records really came after the measurement: no art cell yet.
        expect(await page.locator("table.tbl td > ul.mb-caa-art-ul").count()).toBe(0);
        await releaseAll(page, release);
        const out = await lines(page);
        expect(out).toHaveLength(6);
        expect(out.every((l) => l.chips)).toBe(true);
        const short = out.filter((l) => l.min < l.need);
        expect(short, `column min-width below a summary line: ${JSON.stringify(out)}`).toEqual([]);
    });

    test('the per-sub-table resize reserves the same width', async ({ page }) => {
        const { release } = await open(page, { sa_auto_resize_columns: false, sa_enable_column_resizing: true },
            { hold: Object.values(R) });
        const btns = page.locator('.mb-subtable-resize-btn');
        const n = await btns.count();
        expect(n).toBeGreaterThan(0);
        for (let i = 0; i < n; i++) await btns.nth(i).evaluate((b) => b.click());
        expect(await page.locator("table.tbl td > ul.mb-caa-art-ul").count()).toBe(0);
        await releaseAll(page, release);
        const out = await lines(page);
        expect(out).toHaveLength(6);
        const short = out.filter((l) => l.min < l.need);
        expect(short, `column min-width below a summary line: ${JSON.stringify(out)}`).toEqual([]);
    });

    test('the measured sample never stays in the page', async ({ page }) => {
        const { release } = await open(page, { sa_auto_resize_columns: true, sa_enable_column_resizing: true },
            { hold: Object.values(R) });
        await expect.poll(() => page.locator('#mb-resize-btn').getAttribute('title'), { timeout: 30000 }).toMatch(/^Restore/);
        // Every art list in the document is inside a table cell, before and
        // after the records arrive.
        const stray = () => page.evaluate(() => Array.from(document.querySelectorAll('ul.mb-caa-art-ul'))
            .filter((ul) => !ul.closest('table.tbl td')).length);
        expect(await stray()).toBe(0);
        await releaseAll(page, release);
        expect(await stray()).toBe(0);
    });
});
