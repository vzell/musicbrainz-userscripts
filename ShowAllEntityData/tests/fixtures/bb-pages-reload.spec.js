'use strict';

// Brucebase year table, ▶ Pages: reading again what is kept (vzell,
// 2026-11-15: "as the Relationships column has it").
//   - a read row's ⟳ in its On stage cell reads that row's event page and
//     venue page again, whatever is kept, and its year's listing;
//   - "Read every row again" in the job's card forgets what is known of the
//     rows; each is read again when it is in view, a venue and a listing once.
// The fixtures are batch 2's (tests/fixtures/bb-findings-batch2.spec.js):
// 1972's year page with its event and venue pages, and 2011's whole year
// page with its listing.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { BB_YEAR_BUTTON, loadBbYearListPage, BB_YEAR_LIST_BUTTON } = require('../support/bbFixture');
const { waitForRenderComplete } = require('../support/browser');

const PAGE_DIR = path.join(__dirname, 'bb-findings');
const PAGE_RE = /^https:\/\/brucebase\.wikidot\.com\/((?:gig|nogig|recording|rehearsal|interview|nobruce|venue):[^/?#]+)$/;
const Y72_URL = 'https://brucebase.wikidot.com/1972';
const Y72_FILE = path.join(__dirname, 'bb-year-1972-findings.html');
const Y11_URL = 'https://brucebase.wikidot.com/2011';
const Y11_FILE = path.join(__dirname, 'bb-year-2011.html');
const L11_URL = 'https://brucebase.wikidot.com/2011-list';
const L11_FILE = path.join(__dirname, 'bb-year-list-2011.html');
const GARTER = 'gig:1972-01-21-captain-s-garter-neptune-nj';
const SUNSHINE_EARLY = 'gig:1972-02-12-sunshine-in-asbury-park-nj-early';

const pagesBtn = page => page.locator('th[data-col-name="On stage"] .mb-bbevp-col-hdr-btn');
const stageCell = (page, key) => page.locator(`table.tbl tbody td.mb-bbevp-cell[data-mb-bbevp-col="On stage"][data-mb-bbevp-key$="/${key}"]`);

/**
 * The 1972 fixture rendered, its event and venue pages served and logged.
 * The listing check is off: 1972's listing is not among the fixtures.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ swap?: Object<string, string> }} [opts] `swap`: a page answered with another page's file from its SECOND request on.
 * @returns {Promise<string[]>} The pages asked ("gig:…", "venue:…"), in order.
 */
async function openYear72(page, { swap = {} } = {}) {
    await page.setViewportSize({ width: 1700, height: 1400 });
    await page.route(/^https?:\/\//, route => route.abort('blockedbyclient'));
    await loadUserscriptPage(page, {
        url: Y72_URL, fixtureFile: Y72_FILE, testMode: true,
        settingsOverride: {
            sa_enable_brucebase: true, sa_bb_year_pages: true, sa_foreign_mb_titles: false, sa_foreign_typography: false,
            sa_findings_bb_year_unlisted: false,
        },
    });
    const asked = [];
    await page.route(PAGE_RE, (route) => {
        const key = route.request().url().match(PAGE_RE)[1];
        const again = asked.includes(key);
        asked.push(key);
        const file = path.join(PAGE_DIR, `${(again && swap[key] ? swap[key] : key).replace(':', '_')}.html`);
        return route.fulfill({ path: file, contentType: 'text/html; charset=utf-8' });
    });
    await page.click(`button[data-label="${BB_YEAR_BUTTON}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
    return asked;
}

/**
 * The 2011 year page rendered, its listing answered through the GM stub,
 * every event page served from one real page. The venue check is off.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string[]>} The event pages asked, in order.
 */
async function openYear11(page) {
    await page.setViewportSize({ width: 1700, height: 900 });
    await page.route(/^https?:\/\//, route => route.abort('blockedbyclient'));
    await page.context().addInitScript((r) => { window.__gmXhrResponses = r; },
        { [L11_URL]: { status: 200, responseHeaders: 'content-type: text/html; charset=utf-8\r\n', responseText: fs.readFileSync(L11_FILE, 'utf8') } });
    await loadUserscriptPage(page, {
        url: Y11_URL, fixtureFile: Y11_FILE, testMode: true,
        settingsOverride: { sa_enable_brucebase: true, sa_bb_year_pages: true, sa_findings_bb_venue_mismatch: false },
    });
    const asked = [];
    await page.route(PAGE_RE, (route) => {
        asked.push(route.request().url().match(PAGE_RE)[1]);
        return route.fulfill({ path: path.join(PAGE_DIR, 'gig_1972-01-21-captain-s-garter-neptune-nj.html'), contentType: 'text/html; charset=utf-8' });
    });
    await page.click(`button[data-label="${BB_YEAR_BUTTON}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
    return asked;
}

/** How often 2011's listing was asked since the page loaded. */
const listAsks = page => page.evaluate(u => (window.__gmXhrLog || []).filter(r => r.url === u).length, L11_URL);

/**
 * The On stage cells of the live rows by state, and how many carry a ⟳.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{rows: number, done: number, cold: number, busy: number, reloads: number}>}
 */
function stageState(page) {
    return page.evaluate(() => {
        const tds = Array.from(document.querySelectorAll('table.tbl tbody td.mb-bbevp-cell[data-mb-bbevp-col="On stage"]'));
        const n = st => tds.filter(td => td.dataset.mbBbevpState === st).length;
        return {
            rows: tds.length, done: n('done'), cold: n('cold'), busy: n('queued') + n('run'),
            reloads: document.querySelectorAll('table.tbl tbody button.mb-bbevp-reload').length,
        };
    });
}

/**
 * Waits until nothing is queued or being read and the asked list stands still.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string[]} asked
 * @returns {Promise<void>}
 */
async function settled(page, asked) {
    let last = -1;
    await expect.poll(async () => {
        const st = await stageState(page);
        const same = asked.length === last;
        last = asked.length;
        return st.busy === 0 && same;
    }, { timeout: 90000, intervals: [1500] }).toBe(true);
}

/**
 * Brings each row not read yet into view until none is left (the rows are
 * read as they come into view).
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function readAll(page) {
    await expect.poll(async () => {
        await page.evaluate(() => {
            const td = document.querySelector('table.tbl tbody td.mb-bbevp-cell[data-mb-bbevp-col="On stage"][data-mb-bbevp-state="cold"]');
            if (td) td.scrollIntoView({ block: 'center' });
        });
        const t = await stageState(page);
        return t.cold + t.busy;
    }, { timeout: 60000 }).toBe(0);
}

/** The findings stamped on the Event cell of a row, by its event page. */
const eventFindings = (page, key) => stageCell(page, key).evaluate(td => (td.parentElement.querySelector('td > span.mb-bb-ev-data').parentElement.dataset.mbFindings || '').split(' ').filter(Boolean));

/** The "Read every row again" action of the job's card, opened from ▶ Pages. */
async function againAction(page) {
    await page.mouse.move(0, 0);
    await pagesBtn(page).hover();
    await expect(page.locator('#mb-async-pop')).toBeVisible();
    return page.locator('#mb-async-pop [data-mb-aj-act="again"]');
}

test.describe('Brucebase year table: reading the event pages again (▶ Pages)', () => {
    test('a read row\'s ⟳ reads its event page and its venue page again, past what is kept, and no other row', async ({ page }) => {
        // From its second request on, the Captain's Garter's page is the Sunshine In's:
        // only a real second read can change what the row says.
        const asked = await openYear72(page, { swap: { [GARTER]: SUNSHINE_EARLY } });
        expect((await stageState(page)).reloads).toBe(0);
        await pagesBtn(page).click();
        await readAll(page);
        await settled(page, asked);
        const first = asked.slice();
        // Every read row has one ⟳, and it is no text of the cell.
        const st = await stageState(page);
        expect(st.reloads).toBe(st.done);
        expect(await stageCell(page, GARTER).evaluate(td => td.textContent)).not.toContain('⟳');
        expect(await eventFindings(page, GARTER)).not.toContain('bb-name-mismatch');
        // Hidden until the row is hovered.
        const btn = stageCell(page, GARTER).locator('button.mb-bbevp-reload');
        expect(Number(await btn.evaluate(b => getComputedStyle(b).opacity))).toBe(0);
        await stageCell(page, GARTER).hover();
        await expect.poll(() => btn.evaluate(b => Number(getComputedStyle(b).opacity))).toBeGreaterThan(0.5);
        expect(await btn.evaluate(b => getComputedStyle(b, '::before').content)).toContain('⟳');

        await btn.click();
        await expect.poll(() => asked.length, { timeout: 20000 }).toBe(first.length + 2);
        await settled(page, asked);
        // The venue is the one the page read NOW names, and it is read again
        // too although the Sunshine In's rows read it before.
        expect(asked.slice(first.length)).toEqual([GARTER, 'venue:sunshine-in-asbury-park-nj']);
        // The row shows what the second read said: another show's page.
        await expect.poll(() => eventFindings(page, GARTER)).toContain('bb-name-mismatch');
        const after = await stageState(page);
        expect(after).toMatchObject({ done: st.done, cold: 0, reloads: st.done });
    });

    test('a row\'s ⟳ on a year row reads the year\'s listing again, once a press', async ({ page }) => {
        const asked = await openYear11(page);
        await pagesBtn(page).click();
        await expect.poll(async () => (await stageState(page)).done, { timeout: 60000 }).toBeGreaterThan(2);
        await settled(page, asked);
        expect(await listAsks(page)).toBe(1);
        const before = asked.length;
        const btn = page.locator('table.tbl tbody button.mb-bbevp-reload').first();
        await btn.click();
        await expect.poll(() => asked.length, { timeout: 20000 }).toBe(before + 1);
        await settled(page, asked);
        expect(await listAsks(page)).toBe(2);
        // The answer still stands on every row: the one entry the listing lacks.
        expect(await page.evaluate(() => Array.from(document.querySelectorAll('table.tbl tbody td > span.mb-bb-ev-data[data-mb-bb-listed="0"]')).map(d => d.getAttribute('data-mb-bb-anchor')))).toEqual(['150211']);
        expect(await page.evaluate(() => document.querySelectorAll('table.tbl tbody td > span.mb-bb-ev-data[data-mb-bb-listed]').length)).toBe(28);
    });

    test('"Read every row again": each row past its kept page, a shared venue once', async ({ page }) => {
        const asked = await openYear72(page);
        // Nothing is read: nothing to read again.
        await expect(await againAction(page)).toHaveCount(0);
        await page.keyboard.press('Escape');
        await pagesBtn(page).click();
        await readAll(page);
        await settled(page, asked);
        const first = asked.slice();
        // The two Sunshine In shows share their venue: asked once.
        expect(first.filter(k => k === 'venue:sunshine-in-asbury-park-nj')).toHaveLength(1);

        const again = await againAction(page);
        await expect(again).toHaveText('Read every row again');
        await again.click();
        await expect.poll(() => asked.length, { timeout: 20000 }).toBeGreaterThan(first.length);
        await readAll(page);
        await settled(page, asked);
        // Every page a second time, each exactly once more.
        expect(asked.slice(first.length).sort()).toEqual(first.slice().sort());
    });

    test('"Read every row again" reads only the rows in view, and the listing once more', async ({ page }) => {
        const asked = await openYear11(page);
        await pagesBtn(page).click();
        await expect.poll(async () => (await stageState(page)).done, { timeout: 60000 }).toBeGreaterThan(2);
        await settled(page, asked);
        const st = await stageState(page);
        // The year is taller than the window: rows below it are not read.
        expect(st.cold).toBeGreaterThan(0);
        const first = asked.slice();
        expect(first).toHaveLength(st.done);
        expect(await listAsks(page)).toBe(1);

        await (await againAction(page)).click();
        // At once: every row is "not read" or waiting, none keeps its ⟳.
        await expect.poll(async () => (await stageState(page)).done).toBeLessThan(st.done);
        await expect.poll(async () => (await stageState(page)).done, { timeout: 60000 }).toBe(st.done);
        await settled(page, asked);
        expect(asked.slice(first.length).sort()).toEqual(first.slice().sort());
        expect((await stageState(page)).cold).toBe(st.cold);
        expect(await listAsks(page)).toBe(2);
        expect(await page.evaluate(() => document.querySelectorAll('table.tbl tbody td > span.mb-bb-ev-data[data-mb-bb-listed]').length)).toBe(28);
    });

    test('on a year listing, a row\'s ⟳ reads the year page again, which answers every row', async ({ page }) => {
        await page.setViewportSize({ width: 1600, height: 700 });
        await page.context().addInitScript((r) => { window.__gmXhrResponses = r; },
            { [Y11_URL]: { status: 200, responseHeaders: 'content-type: text/html; charset=utf-8\r\n', responseText: fs.readFileSync(Y11_FILE, 'utf8') } });
        await loadBbYearListPage(page, '2011', { settingsOverride: { sa_render_threshold: 100000 } });
        const asked = [];
        await page.route(PAGE_RE, (route) => {
            asked.push(route.request().url().match(PAGE_RE)[1]);
            return route.fulfill({ path: path.join(PAGE_DIR, 'gig_1972-01-21-captain-s-garter-neptune-nj.html'), contentType: 'text/html; charset=utf-8' });
        });
        await page.click(`button[data-label="${BB_YEAR_LIST_BUTTON}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const yearAsks = () => page.evaluate(u => (window.__gmXhrLog || []).filter(r => r.url === u).length, Y11_URL);
        const flagged = () => page.evaluate(() => Array.from(document.querySelectorAll('table.tbl tbody td'))
            .filter(td => (td.dataset.mbFindings || '').split(' ').includes('bb-list-anchor')).length);
        await pagesBtn(page).click();
        await expect.poll(async () => (await stageState(page)).done, { timeout: 60000 }).toBeGreaterThan(2);
        await settled(page, asked);
        expect(await yearAsks()).toBe(1);
        expect(await flagged()).toBe(1);
        const before = asked.length;
        await page.locator('table.tbl tbody button.mb-bbevp-reload').first().click();
        await expect.poll(() => asked.length, { timeout: 20000 }).toBe(before + 1);
        await settled(page, asked);
        expect(await yearAsks()).toBe(2);
        expect(await flagged()).toBe(1);
    });
});
