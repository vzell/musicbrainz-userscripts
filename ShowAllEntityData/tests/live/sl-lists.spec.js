'use strict';

// springsteenlyrics.com list pages against the REAL site — the one thing the
// sl-* fixture specs cannot show: the site's own pagination (100 cards per
// page, a windowed `ul.pagination` whose "»" carries the last page number)
// consolidating into exactly the number of items the page announces.
//
// Self-consistency, not fixed counts: the collection keeps growing, so each
// test reads the page's own "Showing items 1-100 of N" before pressing the
// button and expects N rows after. Both lists span several pages (539 and 273
// items when this was written, 2026-10-04).
//
// Headless Chromium passed the site's CloudFlare front on 2026-10-04; if that
// changes, a challenge page is what these tests will see — the "Showing
// items" read fails first and says so.

const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { collectPageErrors } = require('../support/liveAssertions');

const LISTS = [
    {
        name: 'collection',
        url: 'https://springsteenlyrics.com/collection.php?cmd=list&category=album&f_format=12i',
        button: 'Show all items of this collection list',
        headers: ['Cover', 'Title', 'Version', 'Label', 'Cat. no.', 'Format', 'Country', 'Release date', 'Original year', 'Copies'],
    },
    {
        name: 'bootlegs',
        url: 'https://springsteenlyrics.com/bootlegs.php?cmd=list&category=aud_live1967',
        button: 'Show all bootlegs of this list',
        headers: ['Cover', 'Title', 'Label', 'Date', 'First date', 'Location', 'Format', 'Duration', 'Lossy', 'Artwork', 'Info file'],
    },
];

for (const list of LISTS) {
    test(`springsteenlyrics.com ${list.name}: every page consolidates into the announced item count`, { tag: '@extended' }, async ({ page }) => {
        const pageErrors = collectPageErrors(page);
        await loadUserscriptPage(page, { url: list.url, settingsOverride: { sa_enable_springsteenlyrics: true } });

        const announced = await page.evaluate(() => {
            const m = document.body.innerText.match(/Showing items \d+-\d+ of (\d+)/);
            return m ? parseInt(m[1], 10) : null;
        });
        expect(announced, 'the page announces its item count (no CloudFlare challenge)').not.toBeNull();
        expect(announced, 'the list spans more than one page').toBeGreaterThan(100);

        await page.click(`button[data-label="${list.button}"]`);
        await page.locator('#mb-filter-container').waitFor({ state: 'visible', timeout: 120000 });
        await page.waitForFunction(() => !document.getElementById('mb-render-heading'), null, { timeout: 120000 });

        const headers = await page.evaluate(() => Array.from(document.querySelectorAll('table.tbl thead tr:first-child th'))
            .map((th) => th.dataset.colName || th.textContent.trim()));
        expect(headers).toEqual(list.headers);
        await expect(page.locator('table.tbl tbody tr')).toHaveCount(announced);
        await expect(page.locator('#mb-global-status-display'))
            .toContainText(`Loaded ${Math.ceil(announced / 100)} pages (${announced} rows)`);
        expect(pageErrors).toEqual([]);
    });
}
