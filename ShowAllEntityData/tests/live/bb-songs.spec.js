'use strict';

// The Brucebase song list against the REAL wiki — what the bb-songs fixture
// spec cannot show: the page as Wikidot serves it today, with its own
// scripts (the YUI TabView set-up, the html-block iframe) and theme CSS
// running, not the stripped snapshot of 2026-10-07.
//
// Self-consistency, not fixed counts: the list keeps growing, so the test
// counts the distinct song links of the letter tabview before pressing the
// button and expects that many rows after. The page's own "N different
// songs" line is a different count (1683 against 1679 linked on 2026-10-07)
// and is not used.

const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { collectPageErrors } = require('../support/liveAssertions');
const { waitForRenderComplete } = require('../support/browser');

const URL = 'https://brucebase.wikidot.com/stats:songs';
const BUTTON = 'Show all songs';

test('Brucebase song list: one row per distinct song of the letter tabs', { tag: '@extended' }, async ({ page }) => {
    test.setTimeout(180000);
    const pageErrors = collectPageErrors(page);
    await loadUserscriptPage(page, {
        url: URL,
        settingsOverride: { sa_enable_brucebase: true },
    });

    // The letter tabview, found the way the converter finds it: every tab
    // label "=- … -=".
    const expected = await page.evaluate(() => {
        const nav = Array.from(document.querySelectorAll('div.yui-navset')).find((n) => {
            const lis = Array.from(n.querySelectorAll(':scope > ul.yui-nav > li'));
            return lis.length > 0 && lis.every((li) => /^=-.*-=$/.test(li.textContent.trim()));
        });
        if (!nav) return null;
        return {
            tabs: nav.querySelectorAll(':scope > ul.yui-nav > li').length,
            songs: new Set(Array.from(nav.querySelectorAll('li > a[href^="/song:"]'), (a) => a.getAttribute('href'))).size,
        };
    });
    expect(expected, 'the page still has a letter tabview').not.toBeNull();
    expect(expected.tabs).toBe(28);
    expect(expected.songs).toBeGreaterThan(1500);

    await page.click(`button[data-label="${BUTTON}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false, timeout: 120000 });

    const headers = await page.evaluate(() => Array.from(document.querySelectorAll('table.tbl thead tr:first-child th'))
        .map((th) => th.dataset.colName || th.textContent.trim()));
    expect(headers).toEqual(['Title', 'Letter']);
    expect(await page.locator('table.tbl tbody tr').count()).toBe(expected.songs);
    const letters = await page.evaluate(() => [...new Set(Array.from(document.querySelectorAll('table.tbl tbody tr'),
        (tr) => tr.cells[1].textContent.trim()))].sort());
    expect(letters).toContain('0-9');
    expect(letters).toContain('A');
    expect(letters).not.toContain('Alt.');
    expect(letters).not.toContain('');
    expect(pageErrors).toEqual([]);
});
