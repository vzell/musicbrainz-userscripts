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
        // An anchor in a paragraph of its own (2015's "000515", copied from the mirror's 2015 page):
        // the heading and the page are the paragraph's after it.
        const own = '<html><body><div id="page-content"><hr /><p><a name="000515"></a></p>\n' +
            '<p><strong><a href="/recording:2015-05-00-stone-hill-studio-colts-neck-nj">2015-05-00 - STONE HILL STUDIO, COLTS NECK, NJ</a></strong></p>\n' +
            '<blockquote><p>UNKNOWN SONG</p></blockquote><hr /></div></body></html>';
        const alone = await page.evaluate(h => window.__saTest.extBbParseYear(h, 'https://brucebase.wikidot.com/2015').shows, own);
        expect(alone['000515'].heading).toBe('2015-05-00 - STONE HILL STUDIO, COLTS NECK, NJ');
        expect(alone['000515'].gig).toBe('https://brucebase.wikidot.com/recording:2015-05-00-stone-hill-studio-colts-neck-nj');
    });
});

// Part 2, the venue named on an event page against the venue's own page:
//   bb-venue-mismatch (⚠️)  on the year table's Venue cell
// The fixture is batch 1's 1972 year page (eight entries, their pages) plus
// the six venue pages those events link, all real. ▶ Pages reads an entry's
// page, then its venue's page: once per venue.
//   CBS Records (1972-05-02): "CBS Records, New York City, NY" on the event
//     page, "CBS, New York City, NY" on the venue page — the mismatch;
//   Sunshine In (two shows): "(Early)" / "(Late)" — accepted;
//   Mediasound (two sessions): "Mediasound Studios, Studio C, …" — accepted;
//   the Captain's Garter, Point Pleasant, Hara Arena — equal.
const { loadUserscriptPage } = require('../support/loadPage');
const { BB_YEAR_BUTTON } = require('../support/bbFixture');

const Y72_URL = 'https://brucebase.wikidot.com/1972';
const Y72_FILE = path.join(__dirname, 'bb-year-1972-findings.html');
const PAGE_DIR = path.join(__dirname, 'bb-findings');
const PAGE_RE = /^https:\/\/brucebase\.wikidot\.com\/((?:gig|nogig|recording|rehearsal|interview|venue):[^/?#]+)$/;
const VENUES = ['captain-s-garter-neptune-nj', 'sunshine-in-asbury-park-nj', 'mediasound-studios-new-york-city-ny',
    'cbs-records-new-york-city-ny', 'unknown-location-point-pleasant-nj', 'hara-arena-dayton-oh'].map(v => `venue:${v}`).sort();

/**
 * The 1972 fixture rendered, its event and venue pages served and logged.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ settings?: Object<string, *>, venues?: boolean }} [opts] `venues: false` answers every venue page 404.
 * @returns {Promise<string[]>} The pages asked ("gig:…", "venue:…"), in order.
 */
async function openYear72(page, { settings = {}, venues = true } = {}) {
    await page.setViewportSize({ width: 1700, height: 1400 });
    await page.route(/^https?:\/\//, route => route.abort('blockedbyclient'));
    await loadUserscriptPage(page, {
        url: Y72_URL, fixtureFile: Y72_FILE, testMode: true,
        settingsOverride: { sa_enable_brucebase: true, sa_bb_year_pages: true, sa_foreign_mb_titles: false, sa_foreign_typography: false, ...settings },
    });
    const asked = [];
    await page.route(PAGE_RE, (route) => {
        const key = route.request().url().match(PAGE_RE)[1];
        asked.push(key);
        const file = path.join(PAGE_DIR, `${key.replace(':', '_')}.html`);
        if (!fs.existsSync(file) || (!venues && key.startsWith('venue:'))) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'no such page' });
        return route.fulfill({ path: file, contentType: 'text/html; charset=utf-8' });
    });
    await page.click(`button[data-label="${BB_YEAR_BUTTON}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
    return asked;
}

/**
 * The live rows' Venue cells: the entry, what the carrier holds, the stamp
 * and the paint level, and whether the row's page is read.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<{key: string, part: ?string, title: ?string, check: string, stamp: boolean, level: string, state: string}>>}
 */
function venueCells(page) {
    return page.evaluate(() => Array.from(document.querySelectorAll('table.tbl tbody tr')).filter(tr => tr.style.display !== 'none').map((tr) => {
        const d = tr.querySelector('td > span.mb-bb-venue-data');
        const td = d.parentElement;
        const a = tr.querySelector('td > span.mb-bb-ev-data').parentElement.querySelector('a[href]');
        const st = tr.querySelector('td.mb-bbevp-cell[data-mb-bbevp-col="On stage"]');
        return {
            key: a ? new URL(a.href).pathname.slice(1) : '', part: d.getAttribute('data-mb-bb-venue-part'), title: d.getAttribute('data-mb-bb-venue-title'),
            check: d.getAttribute('data-mb-bb-venue-check') || '', stamp: (td.dataset.mbFindings || '').split(' ').includes('bb-venue-mismatch'),
            level: td.dataset.mbFinding || '', state: st ? st.dataset.mbBbevpState : '',
        };
    }));
}

/**
 * Presses ▶ Pages, brings every row into view until all are read, stops.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function readAll72(page) {
    await pagesBtn(page).click();
    await expect.poll(async () => {
        await page.evaluate(() => {
            const td = document.querySelector('table.tbl tbody td.mb-bbevp-cell[data-mb-bbevp-col="On stage"][data-mb-bbevp-state="cold"]');
            if (td) td.scrollIntoView({ block: 'center' });
        });
        return (await venueCells(page)).filter(r => r.state !== 'done').length;
    }, { timeout: 60000 }).toBe(0);
    await pagesBtn(page).click();
}

const CBS = 'gig:1972-05-02-cbs-records-new-york-city-ny';

test.describe('Brucebase year table: the venue of an event page against the venue\'s page (bbp-parity batch 2)', () => {
    test('nothing before ▶ Pages; then each venue page is read once, and one venue is named differently', async ({ page }) => {
        const asked = await openYear72(page);
        expect((await venueCells(page)).map(r => [r.part, r.check, r.stamp])).toEqual(Array.from({ length: 8 }, () => [null, '', false]));
        await page.evaluate(() => new Promise(r => setTimeout(r, 800)));
        expect(asked).toEqual([]);
        await readAll72(page);
        // Eight events, six venues: a venue two events share is asked once.
        expect(asked.filter(k => k.startsWith('venue:')).sort()).toEqual(VENUES);
        expect(asked.filter(k => !k.startsWith('venue:')).length).toBe(8);
        const got = await venueCells(page);
        expect(got.map(r => [r.key.split(':')[1].slice(0, 10), r.part, r.title, r.check])).toEqual([
            ['1972-01-21', 'Captain\'s Garter (The), Neptune, NJ', 'Captain\'s Garter (The), Neptune, NJ', ''],
            ['1972-02-12', 'Sunshine In, Asbury Park, NJ (Early)', 'Sunshine In, Asbury Park, NJ', ''],
            ['1972-02-12', 'Sunshine In, Asbury Park, NJ (Late)', 'Sunshine In, Asbury Park, NJ', ''],
            ['1972-04-00', 'Mediasound Studios, Studio C, New York City, NY', 'Mediasound Studios, New York City, NY', ''],
            ['1972-05-02', 'CBS Records, New York City, NY', 'CBS, New York City, NY', 'mismatch'],
            ['1972-05-00', 'Mediasound Studios, Studio C, New York City, NY', 'Mediasound Studios, New York City, NY', ''],
            ['1972-06-00', 'Unknown Location, Point Pleasant, NJ', 'Unknown Location, Point Pleasant, NJ', ''],
            ['1972-12-29', 'Hara Arena, Dayton, OH', 'Hara Arena, Dayton, OH', ''],
        ]);
        await expect.poll(async () => (await venueCells(page)).filter(r => r.stamp).map(r => [r.key, r.level])).toEqual([[CBS, 'warn']]);
        expect((await findingRow(page, 'warn', 'bb-venue-mismatch')).count).toBe(1);
        // The look, and both names in the cell's tooltip.
        const look = await page.evaluate(() => {
            const td = document.querySelector('span.mb-bb-venue-data[data-mb-bb-venue-check]').parentElement;
            return { bg: getComputedStyle(td).backgroundColor, after: getComputedStyle(td, '::after').content, tip: td.getAttribute('title') || '', cmp: td.getAttribute('data-mb-tip-cmp') || '' };
        });
        expect(look.bg).not.toMatch(/^rgba?\(255, 255, 255|rgba\(0, 0, 0, 0\)/);
        expect(look.after).toContain('⚠');
        expect(look.tip).toContain('Event page "CBS Records, New York City, NY", venue page "CBS, New York City, NY".');
        expect(look.cmp).toContain('CBS Records');
        // The filter: that row alone (a re-render from the source rows), then all again.
        await clickFinding(page, 'bb-venue-mismatch');
        await expect.poll(() => findingRowState(page, 'bb-venue-mismatch')).toEqual({ visible: 1, withFinding: 1 });
        await clickFinding(page, 'bb-venue-mismatch');
        await expect.poll(async () => (await findingRowState(page, null)).visible).toBe(8);
    });

    test('the finding switched off: no venue page is asked at all', async ({ page }) => {
        const asked = await openYear72(page, { settings: { sa_findings_bb_venue_mismatch: false } });
        await readAll72(page);
        expect(asked.filter(k => k.startsWith('venue:'))).toEqual([]);
        expect((await venueCells(page)).every(r => r.part === null && !r.stamp)).toBe(true);
        expect(await findingRow(page, 'warn', 'bb-venue-mismatch')).toBeUndefined();
    });

    test('the tint off: stamped and counted, not painted', async ({ page }) => {
        await openYear72(page, { settings: { sa_findings_tint_bb_venue: false } });
        await readAll72(page);
        await expect.poll(async () => (await venueCells(page)).filter(r => r.stamp).map(r => [r.key, r.level])).toEqual([[CBS, '']]);
        expect((await findingRow(page, 'warn', 'bb-venue-mismatch')).count).toBe(1);
    });

    test('a venue page that cannot be read leaves its rows read, without a venue check', async ({ page }) => {
        const asked = await openYear72(page, { venues: false });
        await readAll72(page);
        expect(asked.filter(k => k.startsWith('venue:')).length).toBeGreaterThan(0);
        const got = await venueCells(page);
        expect(got.every(r => r.state === 'done' && r.part === null && !r.stamp)).toBe(true);
    });

    test('a reload paints the rows read before with their venue check, and asks nothing', async ({ page }) => {
        await openYear72(page);
        await readAll72(page);
        await expect.poll(async () => (await venueCells(page)).filter(r => r.stamp).length).toBe(1);
        const asked = await openYear72(page);
        await expect.poll(async () => (await venueCells(page)).filter(r => r.state === 'done').length, { timeout: 15000 }).toBe(8);
        await expect.poll(async () => (await venueCells(page)).filter(r => r.stamp).map(r => r.key)).toEqual([CBS]);
        expect(asked).toEqual([]);
    });

    test('rows read before whose venue page was never read: painted at the reload, and ▶ Pages then asks the venues only', async ({ page }) => {
        await openYear72(page, { venues: false });
        await readAll72(page);
        expect((await venueCells(page)).every(r => r.part === null)).toBe(true);
        const asked = await openYear72(page);
        await expect.poll(async () => (await venueCells(page)).filter(r => r.state === 'done').length, { timeout: 15000 }).toBe(8);
        expect(asked).toEqual([]);
        expect((await venueCells(page)).every(r => r.part === null && !r.stamp)).toBe(true);
        await pagesBtn(page).click();
        // A row is read when it is seen: bring the next one still due into view.
        await expect.poll(async () => {
            await page.evaluate(() => {
                const td = document.querySelector('table.tbl tbody td.mb-bbevp-cell[data-mb-bbevp-venue-due]');
                if (td) td.scrollIntoView({ block: 'center' });
            });
            return (await venueCells(page)).filter(r => r.part !== null).length;
        }, { timeout: 40000 }).toBe(8);
        await expect.poll(async () => (await venueCells(page)).filter(r => r.stamp).map(r => r.key)).toEqual([CBS]);
        expect(await page.evaluate(() => document.querySelectorAll('td[data-mb-bbevp-venue-due]').length)).toBe(0);
        await pagesBtn(page).click();
        // The events came from the store; each venue was asked once.
        expect(asked.slice().sort()).toEqual(VENUES);
    });

    test('Save to Disk → Load from Disk: the venue check comes back, and nothing is asked', async ({ context, browser }) => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-bb-venue-disk-'));
        const fresh = await browser.newContext();
        try {
            const source = await context.newPage();
            await openYear72(source);
            await readAll72(source);
            await expect.poll(async () => (await venueCells(source)).filter(r => r.stamp).length).toBe(1);
            const downloadPromise = source.waitForEvent('download', { timeout: 60000 });
            await clickToolbarItem(source, '#mb-save-to-disk-btn');
            await source.locator('#sa-sd-save-confirm').waitFor({ state: 'visible', timeout: 15000 });
            await source.click('#sa-sd-save-confirm');
            const saved = path.join(tmpDir, 'bb-year.json.gz');
            await (await downloadPromise).saveAs(saved);
            await source.close();

            const page = await fresh.newPage();
            await page.setViewportSize({ width: 1700, height: 1400 });
            await page.route(/^https?:\/\//, route => route.abort('blockedbyclient'));
            await loadUserscriptPage(page, { url: Y72_URL, fixtureFile: Y72_FILE, testMode: true, settingsOverride: { sa_enable_brucebase: true, sa_bb_year_pages: true } });
            const asked = [];
            await page.route(PAGE_RE, (route) => { asked.push(route.request().url()); return route.abort('blockedbyclient'); });
            await clickToolbarItem(page, '#mb-load-from-disk-btn');
            await page.locator('input[type="file"][accept*="json"]').setInputFiles(saved);
            const renderBtn = page.locator('#sa-render-no-filter-confirm');
            await renderBtn.waitFor({ state: 'attached', timeout: 15000 });
            await renderBtn.evaluate(el => el.click());
            await waitForRenderComplete(page, { waitForAutoResize: false });
            await expect.poll(async () => (await venueCells(page)).filter(r => r.stamp).map(r => [r.key, r.title])).toEqual([[CBS, 'CBS, New York City, NY']]);
            expect((await findingRow(page, 'warn', 'bb-venue-mismatch')).count).toBe(1);
            expect(asked).toEqual([]);
        } finally {
            await fresh.close();
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    test('the rule, pure: equal, a show of the day, a description between, both, and real differences', async ({ page }) => {
        await openYear72(page);
        const out = await page.evaluate(() => {
            const c = window.__saTest.bbVenueCheck;
            return [
                c('1972-12-29 Hara Arena, Dayton, OH', 'Hara Arena, Dayton, OH'),
                c('1972-12-29  Hara Arena,  Dayton, OH', 'Hara Arena, Dayton, OH'),
                c('1972-02-12 Sunshine In, Asbury Park, NJ (Early)', 'Sunshine In, Asbury Park, NJ'),
                c('1969-05-28 Pandemonium, Wanamassa, NJ (Second)', 'Pandemonium, Wanamassa, NJ'),
                c('1968-12-28 Crystal Ballroom, Hotel Diplomat, New York City, NY', 'Crystal Ballroom, New York City, NY'),
                c('1973-01-01 A Hall, A College, A Campus, Richmond, VA (Late)', 'A Hall, Richmond, VA'),
                c('1972-05-02 CBS Records, New York City, NY', 'CBS, New York City, NY'),
                // BruceParser 0.41.0's conventions (2026-11-23): today's names on the
                // venue pages, the generic "Unknown Location", a room named first.
                c('1985-06-15 Waldstadion, Frankfurt, West Germany', 'Waldstadion, Frankfurt, Germany'),
                c('1981-04-09 ICC Berlin, West Berlin, West Germany', 'ICC Berlin, Berlin, Germany'),
                c('1970-06-05 Unknown Location, NJ', 'Unknown Location'),
                c('2025-10-14 Spotify HQ, Adelphi (The), London, England', 'Adelphi (The), London, England'),
                // A description for a venue page of four parts, and one of two parts.
                c('2014-02-26 Concert Hall, QPAC, South Brisbane, Brisbane, Queensland, Australia', 'Concert Hall, South Brisbane, Brisbane, Queensland, Australia'),
                c('2002-10-05 Rockefeller Center, GE Building, Studio 8H, New York City, NY', 'Rockefeller Center, New York City, NY'),
                // Compared as written: case, and "(The)" where each page has it.
                c('1972-01-21 Captain\'s Garter (The), Neptune, NJ', 'The Captain\'s Garter, Neptune, NJ'),
                c('1972-12-29 HARA ARENA, Dayton, OH', 'Hara Arena, Dayton, OH'),
                // A venue page of two parts is no name + place: no description.
                c('1972-12-29 Hara Arena, Dayton, OH', 'Hara Arena, OH'),
                // "Germany" alone is no historical name of a city.
                c('1985-06-15 Waldstadion, Frankfurt, Germany', 'Waldstadion, Frankfurt, West Germany'),
            ];
        });
        expect(out).toEqual(['', '', 'variant', 'variant', 'detail', 'detail', 'mismatch',
            'convention', 'convention', 'convention', 'convention', 'detail', 'detail',
            'mismatch', 'mismatch', 'mismatch', 'mismatch']);
    });
});

// Part 3 (vzell, 2026-11-15), a year entry no line of the year's listing links:
//   bb-year-unlisted (❌)  on the year table's Event cell (a warning until
//   vzell's browser check of 2026-11-15)
// The fixtures are 2011's year page and listing, whole (as part 1's): the
// listing's line for "2011-02-15 - STONE HILL STUDIO" links #000211, so no
// line links the year page's #150211 — the one entry of 28 the probe found.
// With ▶ Pages on, the listing of a year whose rows come into view is read:
// one request a year, kept, answering every row of that year.
const Y11_URL = 'https://brucebase.wikidot.com/2011';
const Y11_FILE = path.join(__dirname, 'bb-year-2011.html');
const L11_URL = 'https://brucebase.wikidot.com/2011-list';
const L11_FILE = path.join(__dirname, 'bb-year-list-2011.html');
const UNLISTED = { anchor: '150211', heading: '2011-02-15 - STONE HILL STUDIO, COLTS NECK, NJ' };

/**
 * The 2011 year page rendered, its listing ready for the one request made
 * for it (or 404: the GM stub's answer to an address it was not given),
 * every event page served from one real page. The venue check is off: its
 * requests are part 2's matter.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ settings?: Object<string, *>, listing?: boolean }} [opts] `listing: false` answers the listing 404.
 * @returns {Promise<{ events: string[] }>} The event pages asked, filled as they come; the listing's requests: `listAsks()`.
 */
async function openYear11(page, { settings = {}, listing = true } = {}) {
    await page.setViewportSize({ width: 1700, height: 900 });
    await page.route(/^https?:\/\//, route => route.abort('blockedbyclient'));
    if (listing) {
        await page.context().addInitScript((r) => { window.__gmXhrResponses = r; },
            { [L11_URL]: { status: 200, responseHeaders: 'content-type: text/html; charset=utf-8\r\n', responseText: fs.readFileSync(L11_FILE, 'utf8') } });
    }
    await loadUserscriptPage(page, {
        url: Y11_URL, fixtureFile: Y11_FILE, testMode: true,
        settingsOverride: { sa_enable_brucebase: true, sa_bb_year_pages: true, sa_findings_bb_venue_mismatch: false, ...settings },
    });
    const asked = { events: [] };
    await page.route(EVENT_RE, (route) => {
        asked.events.push(route.request().url());
        return route.fulfill({ path: EVENT_FILE, contentType: 'text/html; charset=utf-8' });
    });
    await page.click(`button[data-label="${BB_YEAR_BUTTON}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
    return asked;
}

/** How often the listing was asked since the page loaded. */
const listAsks = page => page.evaluate(u => (window.__gmXhrLog || []).filter(r => r.url === u).length, L11_URL);

/**
 * The year rows: how many, how many know whether the listing has them, and
 * the ones it lacks (anchor, heading, stamp, paint level).
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{rows: number, answered: number, read: number, unlisted: Array<{anchor: string, heading: string, stamp: boolean, level: string}>}>}
 */
function listedState(page) {
    return page.evaluate(() => {
        const ds = Array.from(document.querySelectorAll('table.tbl tbody tr')).filter(tr => tr.style.display !== 'none').map(tr => tr.querySelector('td > span.mb-bb-ev-data'));
        return {
            rows: ds.length,
            answered: ds.filter(d => d.hasAttribute('data-mb-bb-listed')).length,
            read: document.querySelectorAll('table.tbl tbody td.mb-bbevp-cell[data-mb-bbevp-col="On stage"][data-mb-bbevp-state="done"]').length,
            unlisted: ds.filter(d => d.getAttribute('data-mb-bb-listed') === '0' || (d.parentElement.dataset.mbFindings || '').split(' ').includes('bb-year-unlisted')).map(d => ({
                anchor: d.getAttribute('data-mb-bb-anchor'), heading: d.getAttribute('data-mb-bb-raw-heading'),
                check: (d.getAttribute('data-mb-bb-checks') || '').split(' ').includes('unlisted'),
                stamp: (d.parentElement.dataset.mbFindings || '').split(' ').includes('bb-year-unlisted'), level: d.parentElement.dataset.mbFinding || '',
            })),
        };
    });
}

/**
 * Brings the next row not read yet into view until more than `n` are read.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} n
 * @returns {Promise<void>}
 */
async function readMore(page, n) {
    await expect.poll(async () => {
        await page.evaluate(() => {
            const td = document.querySelector('table.tbl tbody td.mb-bbevp-cell[data-mb-bbevp-col="On stage"][data-mb-bbevp-state="cold"]');
            if (td) td.scrollIntoView({ block: 'center' });
        });
        return (await listedState(page)).read;
    }, { timeout: 60000 }).toBeGreaterThan(n);
}

test.describe('Brucebase year table: the entries the year\'s listing lacks (bbp-parity batch 2)', () => {
    test('nothing before ▶ Pages; then one read of the listing answers every row, and one entry is not listed', async ({ page }) => {
        const asked = await openYear11(page);
        expect(await listedState(page)).toMatchObject({ rows: 28, answered: 0, unlisted: [] });
        await page.evaluate(() => new Promise(r => setTimeout(r, 800)));
        expect(asked.events).toEqual([]);
        expect(await listAsks(page)).toBe(0);
        expect(await findingRow(page, 'error', 'bb-year-unlisted')).toBeUndefined();

        await pagesBtn(page).click();
        await expect.poll(async () => (await listedState(page)).unlisted, { timeout: 20000 }).toEqual([{ ...UNLISTED, check: true, stamp: true, level: 'error' }]);
        // Every row of the year is answered by that one read, the rows not read yet too.
        const st = await listedState(page);
        expect(st.answered).toBe(28);
        // More rows are scrolled to: the listing is not asked again.
        await readMore(page, st.read);
        await pagesBtn(page).click();
        expect(await listAsks(page), 'the listing once').toBe(1);

        expect((await findingRow(page, 'error', 'bb-year-unlisted')).count).toBe(1);
        const look = await page.evaluate(() => {
            const td = document.querySelector('span.mb-bb-ev-data[data-mb-bb-checks~="unlisted"]').parentElement;
            return { bg: getComputedStyle(td).backgroundColor, after: getComputedStyle(td, '::after').content, tip: td.getAttribute('title') || '' };
        });
        expect(look.bg).not.toMatch(/^rgba?\(255, 255, 255|rgba\(0, 0, 0, 0\)/);
        expect(look.after).toContain('❌');
        expect(look.tip).toContain('The listing /2011-list has no link to #150211.');
        // The filter: that row alone (a re-render from the source rows), then all again.
        await clickFinding(page, 'bb-year-unlisted');
        await expect.poll(() => findingRowState(page, 'bb-year-unlisted')).toEqual({ visible: 1, withFinding: 1 });
        expect((await listedState(page)).unlisted.map(r => r.anchor)).toEqual(['150211']);
        await clickFinding(page, 'bb-year-unlisted');
        await expect.poll(async () => (await findingRowState(page, null)).visible).toBe(28);
    });

    test('the unlisted finding off: the listing is not asked at all', async ({ page }) => {
        await openYear11(page, { settings: { sa_findings_bb_year_unlisted: false } });
        await pagesBtn(page).click();
        await expect.poll(async () => (await listedState(page)).read, { timeout: 20000 }).toBeGreaterThan(2);
        await pagesBtn(page).click();
        expect(await listAsks(page)).toBe(0);
        expect(await listedState(page)).toMatchObject({ answered: 0, unlisted: [] });
        expect(await findingRow(page, 'error', 'bb-year-unlisted')).toBeUndefined();
    });

    test('the unlisted tint off: stamped and counted, not painted', async ({ page }) => {
        await openYear11(page, { settings: { sa_findings_tint_bb_list: false } });
        await pagesBtn(page).click();
        await expect.poll(async () => (await listedState(page)).unlisted, { timeout: 20000 }).toEqual([{ ...UNLISTED, check: true, stamp: true, level: '' }]);
        expect((await findingRow(page, 'error', 'bb-year-unlisted')).count).toBe(1);
    });

    test('a listing that cannot be read: no row is answered, and it is asked once a press, not once a row', async ({ page }) => {
        await openYear11(page, { listing: false });
        await pagesBtn(page).click();
        await expect.poll(async () => (await listedState(page)).read, { timeout: 20000 }).toBeGreaterThan(2);
        await readMore(page, 8);
        expect(await listAsks(page)).toBe(1);
        expect(await listedState(page)).toMatchObject({ answered: 0, unlisted: [] });
        // A new press asks again.
        await pagesBtn(page).click();
        await pagesBtn(page).click();
        await expect.poll(() => listAsks(page), { timeout: 15000 }).toBe(2);
    });

    test('the listing read while the table is filtered: the rows filtered away are answered too', async ({ page }) => {
        await openYear11(page);
        // The live rows are copies now; the entry the listing lacks is not among them.
        await page.locator('#mb-global-filter-input').fill('Paramount');
        await expect.poll(async () => (await listedState(page)).rows, { timeout: 15000 }).toBeLessThan(5);
        const shown = (await listedState(page)).rows;
        expect(shown).toBeGreaterThan(0);
        await pagesBtn(page).click();
        await expect.poll(async () => (await listedState(page)).answered, { timeout: 20000 }).toBe(shown);
        await pagesBtn(page).click();
        expect((await listedState(page)).unlisted).toEqual([]);
        await page.locator('#mb-global-filter-input').fill('');
        await expect.poll(async () => (await listedState(page)).rows, { timeout: 15000 }).toBe(28);
        await expect.poll(async () => (await listedState(page)).unlisted).toEqual([{ ...UNLISTED, check: true, stamp: true, level: 'error' }]);
        expect((await listedState(page)).answered).toBe(28);
        expect(await listAsks(page)).toBe(1);
    });

    test('after a reload the kept listing answers without ▶ Pages, and asks nothing', async ({ page }) => {
        await openYear11(page);
        await pagesBtn(page).click();
        await expect.poll(async () => (await listedState(page)).answered, { timeout: 20000 }).toBe(28);
        await pagesBtn(page).click();
        await openYear11(page);
        await expect.poll(async () => (await listedState(page)).unlisted, { timeout: 15000 }).toEqual([{ ...UNLISTED, check: true, stamp: true, level: 'error' }]);
        expect((await listedState(page)).answered).toBe(28);
        expect((await findingRow(page, 'error', 'bb-year-unlisted')).count).toBe(1);
        expect(await listAsks(page)).toBe(0);
    });

    test('a saved year: the unlisted entry comes back, and nothing is asked', async ({ context, browser }) => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-bb-unlisted-disk-'));
        const fresh = await browser.newContext();
        try {
            const source = await context.newPage();
            await openYear11(source);
            await pagesBtn(source).click();
            await expect.poll(async () => (await listedState(source)).unlisted.length, { timeout: 20000 }).toBe(1);
            await pagesBtn(source).click();
            const downloadPromise = source.waitForEvent('download', { timeout: 60000 });
            await clickToolbarItem(source, '#mb-save-to-disk-btn');
            await source.locator('#sa-sd-save-confirm').waitFor({ state: 'visible', timeout: 15000 });
            await source.click('#sa-sd-save-confirm');
            const saved = path.join(tmpDir, 'bb-year.json.gz');
            await (await downloadPromise).saveAs(saved);
            await source.close();

            const page = await fresh.newPage();
            await page.setViewportSize({ width: 1700, height: 900 });
            const asked = [];
            await page.route(/^https?:\/\//, (route) => { asked.push(route.request().url()); return route.abort('blockedbyclient'); });
            await loadUserscriptPage(page, { url: Y11_URL, fixtureFile: Y11_FILE, testMode: true, settingsOverride: { sa_enable_brucebase: true, sa_bb_year_pages: true } });
            asked.length = 0;
            await clickToolbarItem(page, '#mb-load-from-disk-btn');
            await page.locator('input[type="file"][accept*="json"]').setInputFiles(saved);
            const renderBtn = page.locator('#sa-render-no-filter-confirm');
            await renderBtn.waitFor({ state: 'attached', timeout: 15000 });
            await renderBtn.evaluate(el => el.click());
            await waitForRenderComplete(page, { waitForAutoResize: false });
            await expect.poll(async () => (await listedState(page)).unlisted).toEqual([{ ...UNLISTED, check: true, stamp: true, level: 'error' }]);
            expect((await listedState(page)).answered).toBe(28);
            expect((await findingRow(page, 'error', 'bb-year-unlisted')).count).toBe(1);
            expect(asked.filter(u => /brucebase\.wikidot\.com\/[a-z]+:/.test(u))).toEqual([]);
            expect(await page.evaluate(() => (window.__gmXhrLog || []).length), 'no request of the script\'s own').toBe(0);
        } finally {
            await fresh.close();
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    test('unlisted, the rule and the listing reader, pure: only a year row the listing was read for, and the listing\'s links as written', async ({ page }) => {
        await openYear11(page);
        const html = fs.readFileSync(L11_FILE, 'utf8');
        const out = await page.evaluate((h) => {
            const c = row => window.__saTest.bbEventChecks(row, null).includes('unlisted');
            const row = { heading: '2011-02-15 - STONE HILL STUDIO, COLTS NECK, NJ', anchor: '150211', href: 'https://brucebase.wikidot.com/recording:2011-02-15-stone-hill-studio-colts-neck-nj' };
            const links = window.__saTest.extBbParseYearList(h).links;
            return {
                checks: [c({ ...row, listed: false }), c({ ...row, listed: true }), c({ ...row, listed: null }), c(row),
                    // A listing row is never "unlisted".
                    c({ heading: row.heading, anchor: null, href: 'https://brucebase.wikidot.com/2011#000211', list: true, listed: false })],
                n: links.length, has000211: links.includes('2011#000211'), has150211: links.includes('2011#150211'), first: links[0],
            };
        }, html);
        expect(out.checks).toEqual([true, false, false, false, false]);
        expect(out).toMatchObject({ has000211: true, has150211: false });
        expect(out.first).toMatch(/^2011#\d{6}[a-z]?$/);
        // 28 lines, two of them linking #000211.
        expect(out.n).toBe(27);
    });
});

// Part 4 (vzell, 2026-11-14 and 2026-11-15), the year page's setlist against
// the event page's Setlist tab, on the year table's Setlist cell:
//   bb-setlist-songs    (❌)  a song only on one of the two pages
//   bb-setlist-spelling (⚠️)  the same songs, one written differently
//   bb-setlist-sections (⚠️)  the sets are named differently
// and the card that lists both setlists (the approved mockup,
// https://claude.ai/artifact/T1D2ghbx9zHHCh8jgfr5g7). The fixture is 1981's
// year page cut to four entries, with their pages, all real
// (scripts/build-bb-findings-batch2-fixtures.py):
//   1981-02-01 Saint Paul  the same songs;
//   1981-03-04 Lexington   "TWIST & SHOUT" against "TWIST AND SHOUT";
//   1981-04-11 Zurich      a Soundcheck (HUNGRY HEART) only on the year page;
//   1981-06-05 London      "ROSALITA (COME OUT TONIGHT) - SWEET SOUL MUSIC" as
//                          one entry on the event page.
const Y81_URL = 'https://brucebase.wikidot.com/1981';
const Y81_FILE = path.join(__dirname, 'bb-year-1981-findings.html');

/**
 * The 1981 fixture rendered, its event pages served and logged. The venue
 * and listing checks are off: their requests are parts 2 and 3's matter.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ settings?: Object<string, *> }} [opts]
 * @returns {Promise<string[]>} The pages asked, filled as they come.
 */
async function openYear81(page, { settings = {} } = {}) {
    await page.setViewportSize({ width: 1700, height: 1400 });
    await page.route(/^https?:\/\//, route => route.abort('blockedbyclient'));
    await loadUserscriptPage(page, {
        url: Y81_URL, fixtureFile: Y81_FILE, testMode: true,
        settingsOverride: {
            sa_enable_brucebase: true, sa_bb_year_pages: true, sa_foreign_mb_titles: false, sa_foreign_typography: false,
            sa_findings_bb_venue_mismatch: false, sa_findings_bb_year_unlisted: false, ...settings,
        },
    });
    const asked = [];
    await page.route(PAGE_RE, (route) => {
        const key = route.request().url().match(PAGE_RE)[1];
        asked.push(key);
        return route.fulfill({ path: path.join(PAGE_DIR, `${key.replace(':', '_')}.html`), contentType: 'text/html; charset=utf-8' });
    });
    await page.click(`button[data-label="${BB_YEAR_BUTTON}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
    return asked;
}

/**
 * The live rows' Setlist cells: the entry's date, what the comparison
 * fails, the stamps, the paint level, whether the cell takes the focus and
 * whether its page is read.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<{date: string, check: string, stamps: string[], level: string, tab: boolean, state: string}>>}
 */
function setCells(page) {
    return page.evaluate(() => Array.from(document.querySelectorAll('table.tbl tbody tr')).filter(tr => tr.style.display !== 'none').map((tr) => {
        const d = tr.querySelector('td > span.mb-bb-set-data');
        const td = d.parentElement;
        const st = tr.querySelector('td.mb-bbevp-cell[data-mb-bbevp-col="On stage"]');
        return {
            date: tr.querySelector('td > span.mb-bb-ev-data').getAttribute('data-mb-bb-raw-heading').slice(0, 10),
            check: d.getAttribute('data-mb-bb-set-check') || '', stamps: (td.dataset.mbFindings || '').split(' ').filter(x => x.startsWith('bb-setlist')).sort(),
            level: td.dataset.mbFinding || '', tab: td.getAttribute('tabindex') === '0', state: st ? st.dataset.mbBbevpState : '',
        };
    }));
}

/**
 * Presses ▶ Pages, brings every row into view until all four are read, stops.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function readAll81(page) {
    await pagesBtn(page).click();
    await expect.poll(async () => {
        await page.evaluate(() => {
            const td = document.querySelector('table.tbl tbody td.mb-bbevp-cell[data-mb-bbevp-col="On stage"][data-mb-bbevp-state="cold"]');
            if (td) td.scrollIntoView({ block: 'center' });
        });
        return (await setCells(page)).filter(r => r.state !== 'done').length;
    }, { timeout: 60000 }).toBe(0);
    await pagesBtn(page).click();
}

/** The Setlist cell of the entry of a date. */
const setCell = (page, date) => page.locator('table.tbl tbody tr', { has: page.locator(`td.mb-bb-event-cell a[href*="gig:${date}"]`) }).locator('td:has(> span.mb-bb-set-data)');

/**
 * What the setlist card shows.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<?object>} null while it is closed.
 */
function cardState(page) {
    return page.evaluate(() => {
        const c = document.getElementById('mb-bb-setlist-card');
        if (!c || c.style.display === 'none') return null;
        const txt = sel => Array.from(c.querySelectorAll(sel), e => e.textContent.replace(/\s+/g, ' ').trim());
        return {
            title: txt('h3')[0], sub: txt('.mb-bbsl-sub')[0], pills: txt('.mb-bbsl-pill'), secs: txt('tr.mb-bbsl-sec'), gaps: txt('tr.mb-bbsl-gap'),
            songRows: c.querySelectorAll('table.mb-bbsl-diff tbody tr:not(.mb-bbsl-sec):not(.mb-bbsl-gap)').length,
            marks: txt('mark.mb-bbsl-ch'), yOnly: txt('td.mb-bbsl-y-only'), eOnly: txt('td.mb-bbsl-e-only'),
            button: txt('button')[0], links: Array.from(c.querySelectorAll('.mb-bbsl-actions a'), a => [a.textContent, a.getAttribute('href')]),
            tip: (() => { const t = document.getElementById('mb-stat-tooltip'); return !!t && t.style.display === 'block'; })(),
        };
    });
}

const SET_AFTER = [
    { date: '1981-02-01', check: '', stamps: [], level: '', tab: false, state: 'done' },
    { date: '1981-03-04', check: 'spelling', stamps: ['bb-setlist-spelling'], level: 'warn', tab: true, state: 'done' },
    { date: '1981-04-11', check: 'songs sections', stamps: ['bb-setlist-sections', 'bb-setlist-songs'], level: 'error', tab: true, state: 'done' },
    { date: '1981-06-05', check: 'songs', stamps: ['bb-setlist-songs'], level: 'error', tab: true, state: 'done' },
];

test.describe('Brucebase year table: the setlist against the event page\'s (bbp-parity batch 2)', () => {
    test('setlists: nothing before ▶ Pages; then songs, spelling and set names are flagged, counted and filtered', async ({ page }) => {
        const asked = await openYear81(page);
        expect((await setCells(page)).map(r => [r.date, r.check, r.stamps, r.tab])).toEqual(SET_AFTER.map(r => [r.date, '', [], false]));
        await page.evaluate(() => new Promise(r => setTimeout(r, 800)));
        expect(asked).toEqual([]);
        await readAll81(page);
        await expect.poll(() => setCells(page)).toEqual(SET_AFTER);
        expect(asked.length, 'the four event pages, nothing more').toBe(4);
        expect((await findingRow(page, 'error', 'bb-setlist-songs')).count).toBe(2);
        expect((await findingRow(page, 'warn', 'bb-setlist-spelling')).count).toBe(1);
        expect((await findingRow(page, 'warn', 'bb-setlist-sections')).count).toBe(1);
        const look = await page.evaluate(() => {
            const of = (token) => {
                const td = document.querySelector(`span.mb-bb-set-data[data-mb-bb-set-check="${token}"]`).parentElement;
                return { bg: getComputedStyle(td).backgroundColor, after: getComputedStyle(td, '::after').content, tip: td.getAttribute('title') || '' };
            };
            return { spell: of('spelling'), songs: of('songs'), both: of('songs sections') };
        });
        expect(look.spell.after).toContain('⚠');
        expect(look.songs.after).toContain('❌');
        expect(look.spell.bg).not.toBe(look.songs.bg);
        expect(look.spell.tip).toContain('1 written differently.');
        expect(look.both.tip).toContain('1 only on the year page; sets: "Soundcheck", the show on the year page, the show on the event page.');
        // The filter: the two rows (a re-render from the source rows), then all again.
        await clickFinding(page, 'bb-setlist-songs');
        await expect.poll(() => findingRowState(page, 'bb-setlist-songs')).toEqual({ visible: 2, withFinding: 2 });
        expect((await setCells(page)).map(r => r.date)).toEqual(['1981-04-11', '1981-06-05']);
        await clickFinding(page, 'bb-setlist-songs');
        await expect.poll(async () => (await findingRowState(page, null)).visible).toBe(4);
    });

    test('the setlist card: the differences with their neighbours, every song on demand, the pages\' links; Esc, the pointer and the keyboard', async ({ page }) => {
        await openYear81(page);
        await readAll81(page);
        await expect.poll(() => setCells(page)).toEqual(SET_AFTER);
        // A cell without a finding opens nothing.
        await setCell(page, '1981-02-01').hover();
        await page.evaluate(() => new Promise(r => setTimeout(r, 300)));
        expect(await cardState(page)).toBeNull();
        // A song written differently: the line, one song before it, the rest folded.
        await setCell(page, '1981-03-04').hover();
        await expect.poll(async () => (await cardState(page) || {}).title).toBe('A song is written differently');
        let c = await cardState(page);
        expect(c.sub).toBe('1981-03-04 - RUPP ARENA, LEXINGTON, KY');
        expect(c.pills).toEqual(['1 written differently', '26 the same']);
        expect(c.secs).toEqual(['Show']);
        expect(c.gaps).toEqual(['… 25 songs the same …']);
        expect(c.songRows).toBe(2);
        expect(c.marks).toEqual(['&', 'AND']);
        expect(c.button).toBe('Show all 27 songs');
        expect(c.links).toEqual([['Edit on the year page', 'https://brucebase.wikidot.com/1981#040381'],
            ['Open the event page', 'https://brucebase.wikidot.com/gig:1981-03-04-rupp-arena-lexington-ky']]);
        // The cell's own tooltip (its findings' lines) does not open over the card.
        await page.mouse.move(...Object.values(await setCell(page, '1981-03-04').evaluate((td) => { const b = td.getBoundingClientRect(); return { x: b.left + 12, y: b.top + 12 }; })));
        await page.evaluate(() => new Promise(r => setTimeout(r, 1500)));
        expect((await cardState(page)).tip, 'no second tooltip while the card shows').toBe(false);
        // The pointer reaches the card (the grace period), and the toggle lists every song.
        await page.locator('#mb-bb-setlist-card button').hover();
        await page.evaluate(() => new Promise(r => setTimeout(r, 600)));
        expect(await cardState(page), 'open while the pointer is on it').not.toBeNull();
        await page.locator('#mb-bb-setlist-card button').click();
        c = await cardState(page);
        expect(c.songRows).toBe(27);
        expect(c.gaps).toEqual([]);
        expect(c.button).toBe('Show only the differences');
        expect(c.tip, 'no second tooltip over the card').toBe(false);
        await page.keyboard.press('Escape');
        expect(await cardState(page)).toBeNull();
        // Songs and set names: the Soundcheck's song only on the year page.
        await setCell(page, '1981-04-11').hover();
        await expect.poll(async () => (await cardState(page) || {}).title).toBe('The setlists differ');
        c = await cardState(page);
        expect(c.pills.slice(0, 2)).toEqual(['1 only on the year page', 'sets named differently']);
        expect(c.secs).toEqual(['Soundcheck', 'Show']);
        expect(c.yOnly).toEqual(['HUNGRY HEART']);
        expect(c.button).toMatch(/^Show all \d+ songs$/);
        // The pointer leaves both: closed after the grace period.
        await page.mouse.move(5, 5);
        await expect.poll(() => cardState(page), { timeout: 5000 }).toBeNull();
        // A medley as one entry: one song against it, on both sides.
        await setCell(page, '1981-06-05').hover();
        await expect.poll(async () => (await cardState(page) || {}).title).toBe('The setlists differ');
        c = await cardState(page);
        expect(c.eOnly).toContain('ROSALITA (COME OUT TONIGHT) - SWEET SOUL MUSIC');
        expect(c.yOnly).toContain('ROSALITA (COME OUT TONIGHT)');
        await page.keyboard.press('Escape');
        await page.mouse.move(5, 5);
        // The keyboard: a flagged cell takes the focus, Enter opens its card.
        await setCell(page, '1981-03-04').focus();
        await page.keyboard.press('Enter');
        await expect.poll(async () => (await cardState(page) || {}).title).toBe('A song is written differently');
        expect((await cardState(page)).button, 'differences only again').toBe('Show all 27 songs');
        // A press elsewhere closes it.
        await page.mouse.click(5, 5);
        await expect.poll(() => cardState(page)).toBeNull();
    });

    test('setlists, the switches: a finding off is not stamped; all three off open no card; the tint off paints nothing', async ({ page }) => {
        await openYear81(page, { settings: { sa_findings_bb_setlist_songs: false } });
        await readAll81(page);
        await expect.poll(async () => (await setCells(page)).map(r => r.stamps)).toEqual([[], ['bb-setlist-spelling'], ['bb-setlist-sections'], []]);
        expect(await findingRow(page, 'error', 'bb-setlist-songs')).toBeUndefined();
        // The cell flagged for its set names still has its card; the one with songs only has none.
        await setCell(page, '1981-06-05').hover();
        await page.evaluate(() => new Promise(r => setTimeout(r, 300)));
        expect(await cardState(page)).toBeNull();
    });

    test('setlists, the other switches and the tint', async ({ page }) => {
        await openYear81(page, { settings: { sa_findings_bb_setlist_spelling: false, sa_findings_bb_setlist_sections: false, sa_findings_tint_bb_setlist: false } });
        await readAll81(page);
        await expect.poll(async () => (await setCells(page)).map(r => [r.stamps, r.level])).toEqual([[[], ''], [[], ''], [['bb-setlist-songs'], ''], [['bb-setlist-songs'], '']]);
        expect(await findingRow(page, 'warn', 'bb-setlist-spelling')).toBeUndefined();
        expect(await findingRow(page, 'warn', 'bb-setlist-sections')).toBeUndefined();
        expect((await findingRow(page, 'error', 'bb-setlist-songs')).count).toBe(2);
    });

    test('a saved year: the setlist findings and the card come back, and nothing is asked', async ({ context, browser }) => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-bb-setlist-disk-'));
        const fresh = await browser.newContext();
        try {
            const source = await context.newPage();
            await openYear81(source);
            await readAll81(source);
            await expect.poll(() => setCells(source)).toEqual(SET_AFTER);
            const downloadPromise = source.waitForEvent('download', { timeout: 60000 });
            await clickToolbarItem(source, '#mb-save-to-disk-btn');
            await source.locator('#sa-sd-save-confirm').waitFor({ state: 'visible', timeout: 15000 });
            await source.click('#sa-sd-save-confirm');
            const saved = path.join(tmpDir, 'bb-year.json.gz');
            await (await downloadPromise).saveAs(saved);
            await source.close();

            const page = await fresh.newPage();
            await page.setViewportSize({ width: 1700, height: 1400 });
            await page.route(/^https?:\/\//, route => route.abort('blockedbyclient'));
            await loadUserscriptPage(page, { url: Y81_URL, fixtureFile: Y81_FILE, testMode: true, settingsOverride: { sa_enable_brucebase: true, sa_bb_year_pages: true } });
            const asked = [];
            await page.route(PAGE_RE, (route) => { asked.push(route.request().url()); return route.abort('blockedbyclient'); });
            await clickToolbarItem(page, '#mb-load-from-disk-btn');
            await page.locator('input[type="file"][accept*="json"]').setInputFiles(saved);
            const renderBtn = page.locator('#sa-render-no-filter-confirm');
            await renderBtn.waitFor({ state: 'attached', timeout: 15000 });
            await renderBtn.evaluate(el => el.click());
            await waitForRenderComplete(page, { waitForAutoResize: false });
            await expect.poll(async () => (await setCells(page)).map(r => [r.date, r.check, r.stamps, r.level, r.tab]))
                .toEqual(SET_AFTER.map(r => [r.date, r.check, r.stamps, r.level, r.tab]));
            await setCell(page, '1981-03-04').hover();
            await expect.poll(async () => (await cardState(page) || {}).marks).toEqual(['&', 'AND']);
            expect(asked).toEqual([]);
        } finally {
            await fresh.close();
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    test('setlists, the rule and the readers, pure', async ({ page }) => {
        await openYear81(page);
        const year = fs.readFileSync(Y81_FILE, 'utf8');
        const zurich = fs.readFileSync(path.join(PAGE_DIR, 'gig_1981-04-11-hallenstadion-zurich-switzerland.html'), 'utf8');
        const out = await page.evaluate(({ y, z }) => {
            const c = (a, b) => window.__saTest.bbSetlistCheck(a, b).join(' ');
            const one = (...s) => [{ l: '', s }];
            const sets = window.__saTest.bbYearSets(y);
            const zy = sets.find(e => /1981-04-11/.test(e.href)).sets;
            const ze = window.__saTest.bbSetlistRaw(z);
            return {
                checks: [
                    c(one('BADLANDS', 'FIRE'), one('BADLANDS', 'FIRE')),
                    // A note in brackets with a lowercase letter is set aside; capitals in brackets are the title.
                    c(one('BADLANDS (with Tom Morello)', 'ROSALITA (COME OUT TONIGHT)'), one('BADLANDS', 'ROSALITA (COME OUT TONIGHT)')),
                    c(one('BADLANDS', 'ROSALITA'), one('BADLANDS', 'ROSALITA (COME OUT TONIGHT)')),
                    // A medley as one entry against one song: songs, not spelling.
                    c(one('CADILLAC RANCH'), one('NO MONEY DOWN - CADILLAC RANCH')),
                    // Case and punctuation: written differently.
                    c(one('TWIST & SHOUT'), one('TWIST AND SHOUT')),
                    c(one('82ND STREET?'), one('82ND Street?')),
                    // Prose: dropped on the year page; on the event page too, unless the year page has it in other case.
                    c(one('BADLANDS', 'power failure interruption', 'FIRE'), one('BADLANDS', 'FIRE')),
                    c(one('BADLANDS'), one('BADLANDS', 'blues improvisation')),
                    // One side without songs.
                    c([], one('BADLANDS')),
                    c(one('BADLANDS'), []),
                    c([], []),
                    // "A, B, and/or C" reads as a medley.
                    c(one('GLORIA, LOUIE LOUIE, and/or SHOUT'), one('GLORIA - LOUIE LOUIE - SHOUT')),
                    // Set names: as written; "Show" is the set without a name; a set without songs does not count.
                    c([{ l: 'Pre-show jam', s: ['FIRE'] }], [{ l: 'Pre-Show Jam', s: ['FIRE'] }]),
                    c([{ l: 'Soundcheck', s: ['FIRE'] }, { l: '', s: ['BADLANDS'] }], [{ l: 'Soundcheck', s: ['FIRE'] }, { l: 'Show', s: ['BADLANDS'] }]),
                    c([{ l: 'Soundcheck', s: ['FIRE'] }, { l: '', s: ['BADLANDS'] }], [{ l: '', s: ['FIRE', 'BADLANDS'] }]),
                    c([{ l: 'Soundcheck', s: ['no details known'] }, { l: '', s: ['BADLANDS'] }], [{ l: '', s: ['BADLANDS'] }]),
                    c([{ l: 'Pre-show', s: ['FIRE'] }], [{ l: 'Pre-Show', s: ['FIRE', 'BADLANDS'] }]),
                    // A song missing and another written differently: songs alone, never both.
                    c(one('FIRE', 'TWIST & SHOUT'), one('TWIST AND SHOUT')),
                    // "…" for songs not known is no song.
                    c(one('…', 'BADLANDS'), one('BADLANDS')),
                ],
                zy: zy.map(s => [s.l, s.s.length, s.s[0]]), ze: ze.map(s => [s.l, s.s.length]),
                noTab: window.__saTest.bbSetlistRaw('<html><body><div id="page-content"><p>No tabs here.</p></div></body></html>'),
                hrefs: sets.map(e => e.href.slice(5, 15)),
            };
        }, { y: year, z: zurich });
        expect(out.checks).toEqual(['', '', 'songs', 'songs', 'spelling', 'spelling', '', '', 'songs', 'songs', '', '',
            'sections', '', 'sections', '', 'songs sections', 'songs', '']);
        expect(out.zy[0]).toEqual(['Soundcheck', 1, 'HUNGRY HEART (Instrumental)']);
        expect(out.zy.length).toBe(2);
        expect(out.ze.length).toBe(1);
        expect(out.ze[0][0]).toBe('');
        expect(out.noTab).toBeNull();
        expect(out.hrefs).toEqual(['1981-02-01', '1981-03-04', '1981-04-11', '1981-06-05']);
    });
});
