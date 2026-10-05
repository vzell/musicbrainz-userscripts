'use strict';

// The brucespringsteen.it record database against the REAL site — what the
// bs-records fixture spec cannot show: the server's current lists, fetched by
// the two buttons from the frameset's default list (Vinyl LP only), as a
// real browser decodes them.
//
// Self-consistency, not fixed counts: the database keeps growing, so each
// test first reads the "N RESULTS:" of the all-formats list of its kind and
// expects N rows after the button (1878 unofficial and 1186 official when this
// was written, 2026-10-06).

const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { collectPageErrors } = require('../support/liveAssertions');
const { waitForRenderComplete } = require('../support/browser');

const ORIGIN = 'https://www.brucespringsteen.it';
const START_URL = `${ORIGIN}/DB/records.aspx?tipe=-1,4&sort=0`;
const ALL = '0,1,2,3,4,5,6,7,8,9,10,11';

for (const kind of [
    { button: 'Unofficial', tipe: `-1,${ALL}`, headers: ['Title', 'Matrix', 'Format', 'Label', 'Code', 'Notes'] },
    { button: 'Official', tipe: `-2,${ALL}`, headers: ['Title', 'Catalogue', 'Format', 'Country', 'Promo', 'Code', 'Notes'] },
]) {
    test(`brucespringsteen.it ${kind.button}: every record of every format, as many as the list announces`, { tag: '@extended' }, async ({ page, request }) => {
        test.setTimeout(240000);
        const listUrl = `${ORIGIN}/DB/records.aspx?tipe=${kind.tipe}&sort=0&addon=0`;
        const res = await request.get(listUrl);
        expect(res.ok()).toBe(true);
        const announced = parseInt(((await res.text()).match(/(\d+) RESULTS:/) || [])[1], 10);
        expect(announced, 'the list announces its record count').toBeGreaterThan(500);

        const pageErrors = collectPageErrors(page);
        await loadUserscriptPage(page, { url: START_URL, settingsOverride: { sa_enable_brucespringsteen: true } });
        await page.click(`h1.mb-bs-h1 button[data-label="${kind.button}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false, timeout: 180000 });

        const headers = await page.evaluate(() => Array.from(document.querySelectorAll('table.tbl thead tr:first-child th'))
            .map((th) => th.dataset.colName || th.textContent.trim()));
        expect(headers).toEqual(kind.headers);
        expect(await page.locator('table.tbl tbody tr').count()).toBe(announced);
        // The live page's own LP records are gone, and nothing is mis-decoded.
        expect(await page.locator('p a[href*="detrec.aspx?code="]').count()).toBe(0);
        expect(await page.evaluate(() => document.querySelector('table.tbl tbody').textContent.includes('â€'))).toBe(false);
        // Pages carry no page errors of their own, so none are exempted.
        expect(pageErrors).toEqual([]);
    });
}
