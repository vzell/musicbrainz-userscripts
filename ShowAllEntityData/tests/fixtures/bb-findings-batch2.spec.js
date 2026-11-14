'use strict';

// BruceBaseParser's comparisons between pages as findings (org/bbp-parity.org,
// Track A batch 2; vzell's decisions of 2026-11-14).
//
// Part 1, the year listings against their year pages:
//   bb-list-title  (❌)  the listing's label ≠ the year page's heading at the linked anchor
//   bb-list-anchor (⚠️)  the link's anchor is not the label's date, names another
//                        year's page, or is not on the year page
// The fixtures are whole pages of the mirror
// (scripts/build-bb-findings-batch2-fixtures.py); what each row fails is what
// scripts/probe-bb-batch2-findings.py found:
//   1966: "BUSINESS DISTRICT" on the listing, "UNKNOWN LOCATION" on the year
//         page, for 1966-07-25 and 1966-07-26;
//   2011: "2011-02-15 - STONE HILL STUDIO" links #000211, the anchor of
//         2011-02-00 (the year page has 2011-02-15 at #150211).
// The year page is read with ▶ Pages (one request a year) and answers every
// row of that year at once.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadBbYearListPage, BB_YEAR_LIST_BUTTON } = require('../support/bbFixture');
const { waitForRenderComplete } = require('../support/browser');
const { findingRow, clickFinding, findingRowState } = require('../support/findingsMenu');
const { clickToolbarItem } = require('../support/toolbarMenu');

const EVENT_RE = /^https:\/\/brucebase\.wikidot\.com\/((?:gig|nogig|recording|rehearsal|interview|nobruce):[^/?#]+)$/;
const EVENT_FILE = path.join(__dirname, 'bb-findings', 'gig_1972-01-21-captain-s-garter-neptune-nj.html');
const pagesBtn = page => page.locator('th[data-col-name="On stage"] .mb-bbevp-col-hdr-btn');

/**
 * Loads a listing, its year page ready for the one request ▶ Pages makes
 * for it, every event page served from one real page (the rows' own pages
 * are not this part's matter).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} year
 * @param {{ settings?: Object<string, *>, serveYear?: boolean }} [opts]
 * @returns {Promise<{ yearAsks: function(): Promise<number>, anyAsk: function(): Promise<number> }>}
 */
async function openListing(page, year, { settings = {}, serveYear = true } = {}) {
    await page.setViewportSize({ width: 1600, height: 700 });
    const url = `https://brucebase.wikidot.com/${year}`;
    if (serveYear) {
        await page.context().addInitScript((r) => { window.__gmXhrResponses = r; },
            { [url]: { status: 200, responseHeaders: 'content-type: text/html; charset=utf-8\r\n', responseText: fs.readFileSync(path.join(__dirname, `bb-year-${year}.html`), 'utf8') } });
    }
    await loadBbYearListPage(page, year, { settingsOverride: { sa_render_threshold: 100000, ...settings } });
    await page.route(EVENT_RE, route => route.fulfill({ path: EVENT_FILE, contentType: 'text/html; charset=utf-8' }));
    await page.click(`button[data-label="${BB_YEAR_LIST_BUTTON}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
    return {
        yearAsks: () => page.evaluate(u => (window.__gmXhrLog || []).filter(r => r.url === u).length, url),
        anyAsk: () => page.evaluate(() => (window.__gmXhrLog || []).length),
    };
}

/**
 * The listing rows that fail a check: the link, the label, the checks, the
 * stamps, the paint level.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<{link: string, label: string, checks: string[], stamps: string[], level: string}>>}
 */
function flagged(page) {
    return page.evaluate(() => Array.from(document.querySelectorAll('table.tbl tbody tr')).filter(tr => tr.style.display !== 'none').map((tr) => {
        const d = tr.querySelector('td > span.mb-bb-ev-data');
        const td = d.parentElement;
        const a = td.querySelector('a[href]');
        return {
            link: a ? `${new URL(a.href).pathname}${new URL(a.href).hash}` : '', label: d.getAttribute('data-mb-bb-raw-heading'),
            checks: (d.getAttribute('data-mb-bb-checks') || '').split(' ').filter(Boolean).sort(),
            stamps: (td.dataset.mbFindings || '').split(' ').filter(x => x.startsWith('bb-list')).sort(),
            level: td.dataset.mbFinding || '',
        };
    }).filter(r => r.checks.length || r.stamps.length));
}

/** How many listing rows know their year page's headings, and how many were read. */
const known = page => page.evaluate(() => ({
    rows: document.querySelectorAll('table.tbl tbody tr').length,
    answered: document.querySelectorAll('table.tbl tbody span.mb-bb-ev-data[data-mb-bb-list-headings]').length,
    read: document.querySelectorAll('table.tbl tbody td.mb-bbevp-cell[data-mb-bbevp-col="On stage"][data-mb-bbevp-state="done"]').length,
}));

const D25 = { link: '/1966#250766', label: '1966-07-25 - BUSINESS DISTRICT, ASBURY PARK, NJ', checks: ['list-title'], stamps: ['bb-list-title'], level: 'error' };
const D26 = { link: '/1966#260766', label: '1966-07-26 - BUSINESS DISTRICT, ASBURY PARK, NJ', checks: ['list-title'], stamps: ['bb-list-title'], level: 'error' };

test.describe('Brucebase year listing: the entries against their year page (bbp-parity batch 2)', () => {
    test('1966: nothing before ▶ Pages; then one read of the year page answers every row, and two are named differently', async ({ page }) => {
        const net = await openListing(page, '1966');
        expect(await flagged(page)).toEqual([]);
        expect(await known(page)).toMatchObject({ answered: 0, read: 0 });
        await page.evaluate(() => new Promise(r => setTimeout(r, 800)));
        expect(await net.anyAsk(), 'no request before the press').toBe(0);
        expect(await findingRow(page, 'error', 'bb-list-title')).toBeUndefined();

        await pagesBtn(page).click();
        await expect.poll(() => flagged(page), { timeout: 20000 }).toEqual([D25, D26]);
        // Every row of the year is answered by that one read, the rows not in view too.
        const k = await known(page);
        expect(k.answered).toBe(k.rows);
        expect(k.rows).toBe(34);
        expect(k.read, 'only the rows in view were read').toBeLessThan(k.rows);
        expect(await net.yearAsks(), 'the year page once').toBe(1);
        await pagesBtn(page).click();

        expect((await findingRow(page, 'error', 'bb-list-title')).count).toBe(2);
        expect(await findingRow(page, 'warn', 'bb-list-anchor')).toBeUndefined();
        // The look and the card's text: both names.
        const look = await page.evaluate(() => {
            const td = document.querySelector('span.mb-bb-ev-data[data-mb-bb-checks~="list-title"]').parentElement;
            return { bg: getComputedStyle(td).backgroundColor, after: getComputedStyle(td, '::after').content, tip: td.getAttribute('title') || '', cmp: td.getAttribute('data-mb-tip-cmp') || '' };
        });
        expect(look.bg).not.toMatch(/^rgba?\(255, 255, 255|rgba\(0, 0, 0, 0\)/);
        expect(look.after).toContain('❌');
        expect(look.tip).toContain('Listing "1966-07-25 - BUSINESS DISTRICT, ASBURY PARK, NJ", year page "1966-07-25 - UNKNOWN LOCATION, ASBURY PARK, NJ".');
        expect(look.cmp).toContain('UNKNOWN LOCATION');
        // The filter: exactly the two rows (a re-render from the source rows), then all again.
        await clickFinding(page, 'bb-list-title');
        await expect.poll(() => findingRowState(page, 'bb-list-title')).toEqual({ visible: 2, withFinding: 2 });
        expect(await flagged(page)).toEqual([D25, D26]);
        await clickFinding(page, 'bb-list-title');
        await expect.poll(async () => (await findingRowState(page, null)).visible).toBe(34);
    });

    test('2011: a link to another date\'s anchor is a warning with the table, and an error once the year page is read', async ({ page }) => {
        const net = await openListing(page, '2011');
        const WRONG = { link: '/2011#000211', label: '2011-02-15 - STONE HILL STUDIO, COLTS NECK, NJ' };
        // With the table: the anchor 000211 is not 2011-02-15's (150211). No request.
        await expect.poll(() => flagged(page)).toEqual([{ ...WRONG, checks: ['list-anchor'], stamps: ['bb-list-anchor'], level: 'warn' }]);
        expect((await findingRow(page, 'warn', 'bb-list-anchor')).count).toBe(1);
        expect(await net.anyAsk()).toBe(0);
        expect(await page.evaluate(() => document.querySelector('span.mb-bb-ev-data[data-mb-bb-checks~="list-anchor"]').parentElement.getAttribute('title')))
            .toContain('The link is /2011#000211.');
        await pagesBtn(page).click();
        // The year page has 2011-02-00 there: the entry of 02-00 right beside it, with the same link, is fine.
        await expect.poll(() => flagged(page), { timeout: 20000 })
            .toEqual([{ ...WRONG, checks: ['list-anchor', 'list-title'], stamps: ['bb-list-anchor', 'bb-list-title'], level: 'error' }]);
        await pagesBtn(page).click();
        expect((await findingRow(page, 'error', 'bb-list-title')).count).toBe(1);
        expect(await page.evaluate(() => document.querySelectorAll('span.mb-bb-ev-data[data-mb-bb-list]').length)).toBe(28);
    });

    test('a tint setting off: stamped and counted, not painted; a finding\'s switch off: gone', async ({ page }) => {
        await openListing(page, '1966', { settings: { sa_findings_tint_bb_list: false } });
        await pagesBtn(page).click();
        await expect.poll(async () => (await flagged(page)).map(r => [r.link, r.stamps.join(), r.level]), { timeout: 20000 })
            .toEqual([['/1966#250766', 'bb-list-title', ''], ['/1966#260766', 'bb-list-title', '']]);
        await pagesBtn(page).click();
        expect((await findingRow(page, 'error', 'bb-list-title')).count).toBe(2);
    });

    test('the switches: each finding off is neither stamped nor in a menu', async ({ page }) => {
        await openListing(page, '2011', { settings: { sa_findings_bb_list_title: false, sa_findings_bb_list_anchor: false } });
        await pagesBtn(page).click();
        await expect.poll(async () => (await known(page)).answered, { timeout: 20000 }).toBe(28);
        await page.evaluate(() => new Promise(r => setTimeout(r, 500)));
        await pagesBtn(page).click();
        // The checks are made (data), the findings are not.
        expect((await flagged(page)).map(r => [r.checks.join(), r.stamps.join()])).toEqual([['list-anchor,list-title', '']]);
        expect(await findingRow(page, 'error', 'bb-list-title')).toBeUndefined();
        expect(await findingRow(page, 'warn', 'bb-list-anchor')).toBeUndefined();
    });

    test('Save to Disk → Load from Disk: the answered rows keep their findings, and nothing is asked', async ({ context, browser }) => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-bb-list-disk-'));
        // A context of its own: the saving page's stored year page must not answer for the file.
        const fresh = await browser.newContext();
        try {
            const source = await context.newPage();
            await openListing(source, '1966');
            await pagesBtn(source).click();
            await expect.poll(() => flagged(source), { timeout: 20000 }).toEqual([D25, D26]);
            await pagesBtn(source).click();
            const downloadPromise = source.waitForEvent('download', { timeout: 60000 });
            await clickToolbarItem(source, '#mb-save-to-disk-btn');
            await source.locator('#sa-sd-save-confirm').waitFor({ state: 'visible', timeout: 15000 });
            await source.click('#sa-sd-save-confirm');
            const saved = path.join(tmpDir, 'bb-list.json.gz');
            await (await downloadPromise).saveAs(saved);
            await source.close();

            const page = await fresh.newPage();
            await page.setViewportSize({ width: 1600, height: 700 });
            await loadBbYearListPage(page, '1966', { settingsOverride: { sa_render_threshold: 100000 } });
            await clickToolbarItem(page, '#mb-load-from-disk-btn');
            await page.locator('input[type="file"][accept*="json"]').setInputFiles(saved);
            const renderBtn = page.locator('#sa-render-no-filter-confirm');
            await renderBtn.waitFor({ state: 'attached', timeout: 15000 });
            await renderBtn.evaluate(el => el.click());
            await waitForRenderComplete(page, { waitForAutoResize: false });
            await expect.poll(() => flagged(page)).toEqual([D25, D26]);
            expect((await findingRow(page, 'error', 'bb-list-title')).count).toBe(2);
            expect(await page.evaluate(() => (window.__gmXhrLog || []).length)).toBe(0);
        } finally {
            await fresh.close();
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    test('the rules, pure: the date, the year, an anchor the year page lacks, a shared anchor, blanks and case', async ({ page }) => {
        await openListing(page, '1966', { serveYear: false });
        const out = await page.evaluate(() => {
            const c = window.__saTest.bbEventChecks;
            const row = (heading, link, listHeadings) => ({ heading, anchor: null, href: `https://brucebase.wikidot.com${link}`, list: true, listHeadings });
            return {
                unread: c(row('1978-03-05 - RECORD PLANT, NEW YORK CITY, NY', '/1978#050378', null), null),
                equal: c(row('1978-03-05 - RECORD PLANT, NEW YORK CITY, NY', '/1978#050378', ['1978-03-05 - RECORD PLANT, NEW YORK CITY, NY']), null),
                caseAndBlanks: c(row('1978-03-05 - Record Plant, New York City, NY', '/1978#050378', ['1978-03-05 -  RECORD PLANT, NEW YORK CITY, NY']), null),
                differs: c(row('1978-03-05 - RECORD PLANT, NEW YORK CITY, NY', '/1978#050378', ['1978-03-05 - THE RECORD PLANT, NEW YORK CITY, NY']), null),
                // 1972's 000472b is on two entries: the listing's label may be either.
                shared: c(row('1972-05-00 - MEDIASOUND STUDIOS, STUDIO C, NEW YORK CITY, NY', '/1972#000572b',
                    ['1972-04-00 - MEDIASOUND STUDIOS, STUDIO C, NEW YORK CITY, NY', '1972-05-00 - MEDIASOUND STUDIOS, STUDIO C, NEW YORK CITY, NY']), null),
                // The year page has no such anchor (1972's listing links #000572b): only the link is wrong.
                noAnchor: c(row('1972-05-00 - MEDIASOUND STUDIOS, STUDIO C, NEW YORK CITY, NY', '/1972#000572b', []), null),
                otherDate: c(row('1995-08-00 - THRILL HILL WEST, BEVERLY HILLS, CA', '/1995#000795', null), null),
                otherYear: c(row('1977-04-00 - TELEGRAPH HILL STUDIO, HOLMDEL, NJ', '/1978#000477', null), null),
                early: c(row('1964-06-00 - ELKS LODGE, FREEHOLD, NJ', '/1949-64#000664', null), null),
                // A year row never gets a listing check.
                yearRow: c({ heading: '1978-03-05 - RECORD PLANT, NEW YORK CITY, NY', anchor: '050378', href: 'https://brucebase.wikidot.com/recording:1978-03-05-record-plant-new-york-city-ny', listHeadings: [] }, null),
            };
        });
        expect(out).toEqual({
            unread: [], equal: [], caseAndBlanks: [], differs: ['list-title'], shared: [], noAnchor: ['list-anchor'],
            otherDate: ['list-anchor'], otherYear: ['list-anchor'], early: [], yearRow: [],
        });
    });

    test('the year reader: an anchor with a letter is a show too, and the first entry of a shared anchor stays the show', async ({ page }) => {
        await openListing(page, '1966', { serveYear: false });
        const html = fs.readFileSync(path.join(__dirname, 'bb-year-1972-findings.html'), 'utf8');
        const shows = await page.evaluate(h => window.__saTest.extBbParseYear(h, 'https://brucebase.wikidot.com/1972').shows, html);
        expect(Object.keys(shows).sort()).toEqual(['000472b', '000672b', '020572a', '120272a', '120272b', '210172', '291272']);
        expect(shows['000472b'].heading).toBe('1972-04-00 - MEDIASOUND STUDIOS, STUDIO C, NEW YORK CITY, NY');
        expect(shows['000472b'].also).toEqual(['1972-05-00 - MEDIASOUND STUDIOS, STUDIO C, NEW YORK CITY, NY']);
        expect(shows['000472b'].gig).toBe('https://brucebase.wikidot.com/recording:1972-04-00b-mediasound-studios-new-york-city-ny');
        expect(shows['120272a'].gig).toContain('sunshine-in-asbury-park-nj-early');
        expect(shows['210172'].also).toEqual([]);
    });
});
