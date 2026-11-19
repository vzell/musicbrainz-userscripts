'use strict';

// Brucebase, ▶ Pages: "Read every row" (org/bbp-parity.org, "Closing the
// matrix", branch 3; mockup https://claude.ai/artifact/Mji5y7i2vZzTkK1WQ4JWi7,
// questions 8-11, all as recommended). BruceBaseParser's HOME page reads
// every show of every year; ▶ Pages read only the rows scrolled to.
//
// What each test pins, and the neighbouring bug it must still catch:
//   - every row is read WITHOUT scrolling, in the table's order (a row out
//     of view stays queued; the observer must not take it back), each once;
//   - the order is the table's current one: after a sort, the sorted order;
//   - Stop sends the rest back to "not read", and the ☰ menu's row goes on
//     where it stopped (no row asked twice);
//   - rows hidden by a filter are read too, and join "All errors" as they
//     are read (the refresh re-filters for a findings filter, not only a
//     typed one), with the window's scroll position kept;
//   - above 200 unread rows it asks first: Cancel reads nothing.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { BB_YEAR_BUTTON, loadBbHomePage } = require('../support/bbFixture');
const { waitForRenderComplete } = require('../support/browser');
const { clickToolbarItem } = require('../support/toolbarMenu');
const { waitForSortSettled } = require('../support/filterSortAssertions');
const { findingLevelRow, clickFindingLevel, findingRowState } = require('../support/findingsMenu');

const PAGE_DIR = path.join(__dirname, 'bb-findings');
const PAGE_RE = /^https:\/\/brucebase\.wikidot\.com\/((?:gig|nogig|recording|rehearsal|interview|nobruce):[^/?#]+)$/;
// Every event page is answered with this one (a 1972 show): each 2011 row
// read then carries the checks' errors (another show's page).
const GARTER_FILE = path.join(PAGE_DIR, 'gig_1972-01-21-captain-s-garter-neptune-nj.html');
const Y11_URL = 'https://brucebase.wikidot.com/2011';
const Y11_FILE = path.join(__dirname, 'bb-year-2011.html');
const L11_URL = 'https://brucebase.wikidot.com/2011-list';
const L11_FILE = path.join(__dirname, 'bb-year-list-2011.html');
const HOME_BUTTON = 'Show all events of all years';

const pagesBtn = page => page.locator('th[data-col-name="On stage"] .mb-bbevp-col-hdr-btn');

/**
 * Serves every event page from one file and logs what was asked.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string[]>} The pages asked ("gig:…"), in order.
 */
async function servePages(page) {
    const asked = [];
    await page.route(PAGE_RE, (route) => {
        asked.push(route.request().url().match(PAGE_RE)[1]);
        return route.fulfill({ path: GARTER_FILE, contentType: 'text/html; charset=utf-8' });
    });
    return asked;
}

/**
 * The 2011 year page rendered (28 rows, taller than the window), its
 * listing answered through the GM stub. The venue check is off.
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
    const asked = await servePages(page);
    await page.click(`button[data-label="${BB_YEAR_BUTTON}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
    return asked;
}

/** How often 2011's listing was asked since the page loaded. */
const listAsks = page => page.evaluate(u => (window.__gmXhrLog || []).filter(r => r.url === u).length, L11_URL);

/**
 * The On stage cells of the SOURCE rows (live and filtered out alike) by
 * state, and the live rows' keys in table order ("gig:…").
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{rows: number, done: number, cold: number, busy: number, order: string[]}>}
 */
function stageState(page) {
    return page.evaluate(() => {
        const tds = window.__saTest.bbEvpSourceCells();
        const n = st => tds.filter(td => td.dataset.mbBbevpState === st).length;
        const order = Array.from(document.querySelectorAll('table.tbl tbody td.mb-bbevp-cell[data-mb-bbevp-col="On stage"][data-mb-bbevp-key]'))
            .map(td => td.dataset.mbBbevpKey.replace(/^https?:\/\/[^/]+\//, ''));
        return { rows: tds.length, done: n('done'), cold: n('cold'), busy: n('queued') + n('run'), order };
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
    }, { timeout: 120000, intervals: [1500] }).toBe(true);
}

/**
 * An action of the ▶ Pages job card, opened by hovering the button.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} id - 'all', 'stop', 'again', 'retry'.
 * @returns {Promise<import('@playwright/test').Locator>}
 */
async function cardAction(page, id) {
    await page.mouse.move(0, 0);
    await pagesBtn(page).hover();
    await expect(page.locator('#mb-async-pop')).toBeVisible();
    return page.locator(`#mb-async-pop [data-mb-aj-act="${id}"]`);
}

test.describe('Brucebase ▶ Pages: Read every row', () => {
    test('the card\'s "Read every row" reads every row without scrolling, in the table\'s order, each once', async ({ page }) => {
        test.setTimeout(180000);
        const asked = await openYear11(page);
        const before = await stageState(page);
        expect(before).toMatchObject({ rows: 28, done: 0, cold: 28 });
        const all = await cardAction(page, 'all');
        await expect(all).toHaveText('Read every row');
        await all.click();
        // 28 rows: no question first.
        await expect(page.getByRole('button', { name: 'OK', exact: true })).toHaveCount(0);
        // Back to the top (the click scrolled to the card): the rows below
        // the window are read without being scrolled to.
        await page.mouse.move(0, 0);
        await page.evaluate(() => window.scrollTo(0, 0));
        expect(await page.evaluate(() => Array.from(document.querySelectorAll('table.tbl tbody td.mb-bbevp-cell[data-mb-bbevp-col="On stage"]'))
            .filter(td => td.getBoundingClientRect().top > window.innerHeight + 200).length), 'premise: rows far below the window').toBeGreaterThan(5);
        await expect.poll(async () => (await stageState(page)).done, { timeout: 120000 }).toBe(28);
        await settled(page, asked);
        expect(asked, 'every row once, in the table\'s order').toEqual(before.order);
        expect(await page.evaluate(() => window.scrollY), 'nothing was scrolled').toBe(0);
        expect(await listAsks(page), 'the year\'s listing too, once').toBe(1);
        // Every row is read: the action is gone from the card.
        await expect(await cardAction(page, 'all')).toHaveCount(0);
    });

    test('the order follows a sort; Stop sends the rest back; the ☰ row goes on where it stopped', async ({ page }) => {
        test.setTimeout(180000);
        const asked = await openYear11(page);
        const unsorted = (await stageState(page)).order;
        const sortBtn = page.locator('table.tbl thead tr:first-child th .sort-icon-btn', { hasText: '▼' }).first();
        await waitForSortSettled(page, () => sortBtn.click());
        const order = (await stageState(page)).order;
        expect(order, 'premise: the sort changed the order').not.toEqual(unsorted);

        await clickToolbarItem(page, '#mb-saed-bbevp-all-btn');
        await expect.poll(() => asked.length, { timeout: 60000 }).toBeGreaterThanOrEqual(4);
        await pagesBtn(page).click(); // ■ Pages: Stop
        await settled(page, asked);
        const first = asked.slice();
        expect(first, 'read in the sorted order').toEqual(order.slice(0, first.length));
        expect(await stageState(page), 'the rest went back to "not read"').toMatchObject({ busy: 0, done: first.length, cold: 28 - first.length });

        await clickToolbarItem(page, '#mb-saed-bbevp-all-btn');
        await expect.poll(async () => (await stageState(page)).done, { timeout: 120000 }).toBe(28);
        await settled(page, asked);
        expect(asked, 'went on where it stopped: each row once, in order').toEqual(order);
    });

    test('rows a filter hides are read too, and join "All errors" as they are read; the scroll position is kept', async ({ page }) => {
        test.setTimeout(180000);
        const asked = await openYear11(page);
        // A few rows read the usual way, so the ❌ menu has its level row.
        await pagesBtn(page).click();
        await expect.poll(async () => (await stageState(page)).done, { timeout: 60000 }).toBeGreaterThanOrEqual(2);
        await pagesBtn(page).click();
        await settled(page, asked);
        const readFirst = (await stageState(page)).done;
        const e1 = (await findingLevelRow(page, 'error')).count;
        expect(e1, 'premise: a row read has an error').toBeGreaterThan(0);
        await clickFindingLevel(page, 'error');
        await expect.poll(async () => (await findingRowState(page)).visible).toBe(e1);
        await (await cardAction(page, 'all')).click();
        // The window where the reader left it (the click scrolled to the card).
        await page.mouse.move(0, 0);
        await page.evaluate(() => window.scrollTo(0, 60));
        const y = await page.evaluate(() => window.scrollY);
        await expect.poll(async () => (await stageState(page)).done, { timeout: 120000 }).toBe(28);
        await settled(page, asked);
        // Every row once: a page answered while Stop was pressed is not
        // counted as read, and is then taken from memory, not asked again.
        const keys = (await page.evaluate(() => window.__saTest.bbEvpSourceCells().map(td => td.dataset.mbBbevpKey.replace(/^https?:\/\/[^/]+\//, '')))).sort();
        expect(Array.from(new Set(asked)).sort(), 'the hidden rows were read: every row').toEqual(keys);
        expect(new Set(asked).size, 'none twice').toBe(asked.length);
        expect(readFirst).toBeLessThan(28);
        // The rows read joined the filter: within 25 rows or 10 s of the last.
        const e2 = (await findingLevelRow(page, 'error')).count;
        expect(e2).toBeGreaterThan(e1);
        await expect.poll(async () => (await findingRowState(page)).visible, { timeout: 15000 }).toBe(e2);
        expect(await page.evaluate(() => window.scrollY), 'the window stays where it was').toBe(y);
    });

    test('above 200 unread rows it asks first: Cancel reads nothing, OK reads', async ({ page }) => {
        test.setTimeout(180000);
        await page.setViewportSize({ width: 1700, height: 900 });
        await loadBbHomePage(page, { settingsOverride: { sa_findings_bb_venue_mismatch: false, sa_findings_bb_year_unlisted: false, sa_render_threshold: 100000 } });
        const asked = await servePages(page);
        await page.click(`button[data-label="${HOME_BUTTON}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const st = await stageState(page);
        expect(st.rows, 'premise: more than 200 rows').toBeGreaterThan(200);

        await clickToolbarItem(page, '#mb-saed-bbevp-all-btn');
        await expect(page.getByText('▶ Read every row of this table?')).toBeVisible();
        const fmt = n => n.toLocaleString('en-US');
        const msg = page.locator('div', { hasText: `Rows not read yet: ${fmt(st.rows)} of ${fmt(st.rows)}` }).last();
        await expect(msg).toBeVisible();
        await expect(msg).toContainText('Time: about');
        await page.getByRole('button', { name: 'Cancel', exact: true }).click();
        await page.evaluate(() => new Promise(r => setTimeout(r, 1500)));
        expect(asked, 'Cancel: nothing asked').toEqual([]);
        expect((await stageState(page)).busy, 'and nothing queued').toBe(0);
        await expect(pagesBtn(page)).toHaveAttribute('aria-pressed', 'false');

        await clickToolbarItem(page, '#mb-saed-bbevp-all-btn');
        await page.getByRole('button', { name: 'OK', exact: true }).click();
        await expect.poll(() => asked.length, { timeout: 60000 }).toBeGreaterThanOrEqual(2);
        expect(asked.slice(0, 2), 'from the top of the table').toEqual(st.order.slice(0, 2));
        expect((await stageState(page)).busy, 'the rest is queued, out of view').toBeGreaterThan(200);
        await pagesBtn(page).click();
    });
});
