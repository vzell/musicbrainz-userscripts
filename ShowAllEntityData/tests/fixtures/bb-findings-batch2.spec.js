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
                c('1985-06-15 Waldstadion, Frankfurt, West Germany', 'Waldstadion, Frankfurt, Germany'),
                // Compared as written: case, and "(The)" where each page has it.
                c('1972-01-21 Captain\'s Garter (The), Neptune, NJ', 'The Captain\'s Garter, Neptune, NJ'),
                c('1972-12-29 HARA ARENA, Dayton, OH', 'Hara Arena, Dayton, OH'),
                // Three parts cannot hold a description.
                c('1972-12-29 Hara Arena, Dayton, OH', 'Hara Arena, OH'),
            ];
        });
        expect(out).toEqual(['', '', 'variant', 'variant', 'detail', 'detail', 'mismatch', 'mismatch', 'mismatch', 'mismatch', 'mismatch']);
    });
});
