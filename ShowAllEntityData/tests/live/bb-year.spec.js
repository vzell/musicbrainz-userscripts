'use strict';

// A Brucebase year page against the REAL wiki — what the bb-year fixture spec
// cannot show: the page as Wikidot serves it today, with its own scripts and
// theme CSS running, not the snapshots of 2026-10-09.
//
// Self-consistency, not fixed counts: the current year keeps growing, so the
// test counts the entry headings (a paragraph that is one date-led <strong>,
// as the converter finds them) before pressing the button and expects that
// many rows after.

const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { collectPageErrors } = require('../support/liveAssertions');
const { waitForRenderComplete } = require('../support/browser');

const URL = 'https://brucebase.wikidot.com/2026';
const BUTTON = 'Show all events';

test('Brucebase year page: one row per entry heading', { tag: '@extended' }, async ({ page }) => {
    test.setTimeout(180000);
    const pageErrors = collectPageErrors(page);
    await loadUserscriptPage(page, {
        url: URL,
        settingsOverride: { sa_enable_brucebase: true, sa_bb_year_pages: true },
    });

    const expected = await page.evaluate(() => Array.from(document.querySelectorAll('#page-content > p > strong'))
        .filter((s) => /^\d{4}-\d\d-\d\d/.test(s.textContent.trim()) &&
            s.parentElement.textContent.replace(/\s+/g, ' ').trim() === s.textContent.replace(/\s+/g, ' ').trim())
        .length);
    expect(expected, 'the page still lists its entries as bold dated headings').toBeGreaterThan(20);

    await page.click(`button[data-label="${BUTTON}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false, timeout: 120000 });

    const headers = await page.evaluate(() => Array.from(document.querySelectorAll('table.tbl thead tr:first-child th'))
        .map((th) => th.dataset.colName || th.textContent.trim()));
    expect(headers.slice(0, 13)).toEqual(['Date', 'Type', 'Venue', 'City', 'State', 'Country', 'Tour',
        'Soundcheck', 'Setlist', 'Set note', 'Notes', 'Media', 'Info wanted']);
    expect(await page.locator('table.tbl tbody tr').count()).toBe(expected);
    const shape = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('table.tbl tbody tr'));
        return {
            noDate: rows.filter((tr) => !tr.cells[0].textContent.trim()).length,
            withSetlist: rows.filter((tr) => tr.cells[8].querySelector('li')).length,
            withMedia: rows.filter((tr) => tr.cells[11].querySelector('img')).length,
        };
    });
    expect(shape.noDate).toBe(0);
    expect(shape.withSetlist).toBeGreaterThan(0);
    expect(shape.withMedia).toBeGreaterThan(0);
    expect(pageErrors).toEqual([]);
});
