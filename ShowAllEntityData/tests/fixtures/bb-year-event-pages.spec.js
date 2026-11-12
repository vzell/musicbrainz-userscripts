'use strict';

// The year table's columns from each event's own page (org/brucebase.org
// Phase 14; mockup https://claude.ai/artifact/WribjsoLZpeUYU8k8Vx3eY, vzell's
// answers 2026-11-12): On stage (the whole line-up, members folded), Content
// (the tabs with content), Images (by kind), Start. Nothing is asked before
// ▶ Pages; then the rows as they come into view, one page a second, the link
// previews' own record (`_dpGet()`), so a row read before costs nothing; a
// failed row's ⟳ asks again; a listing's row finds its page through its
// year page. Every event page here is served from one fixture (the Roxy,
// 1978-07-07): the cells must say what the previews' parser reads from it.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadBbYearPage, loadBbYearListPage, BB_YEAR_BUTTON, BB_YEAR_LIST_BUTTON, revealPastStickyColumn } = require('../support/bbFixture');
const { waitForRenderComplete } = require('../support/browser');
const { columnFilterInput } = require('../support/filterSortAssertions');

const EVENT_RE = /^https:\/\/brucebase\.wikidot\.com\/(?:gig|nogig|recording|rehearsal|interview):[^/?#]+$/;
const EVENT_FILE = path.join(__dirname, 'bb-event-gig-1978-07-07.html');
const COLS = ['On stage', 'Content', 'Images', 'Start'];
const PLAIN_TABS = ['On Stage', 'Setlist', 'Performances', 'Gallery'];

/**
 * Serves every event page from one fixture (the Roxy's by default) and logs
 * each request.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} [file]
 * @returns {Promise<string[]>} The URLs asked, in order.
 */
async function serveEvents(page, file = EVENT_FILE) {
    const asked = [];
    await page.route(EVENT_RE, (route) => {
        asked.push(route.request().url());
        return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fs.readFileSync(file, 'utf8') });
    });
    return asked;
}

/**
 * What the four cells must show for the Roxy's page: the previews' own
 * parse of it (`__saTest.dpParse()`), as the columns write it.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{stage: string[], content: string, images: string, start: string}>}
 */
function expected(page, file = EVENT_FILE) {
    return page.evaluate(({ html, plain }) => {
        const d = window.__saTest.dpParse('brucebase.wikidot.com', html, 'https://brucebase.wikidot.com/gig:1978-07-07-roxy-theatre-west-hollywood-ca');
        const f = n => (d.fields.find(x => x[0] === n) || [])[1] || '';
        const kinds = new Map();
        d.images.forEach((im) => { kinds.set(im.label || 'Other', (kinds.get(im.label || 'Other') || 0) + 1); });
        return {
            // The rows as the column splits them (pinned on its own in
            // bb-event-window-gaps.spec.js: the band folded, guests after it).
            stage: window.__saTest.bbEvpStageLines(f('On stage')),
            content: f('On the page').split(' · ').filter(t => t && !plain.includes(t)).join(' · '),
            images: Array.from(kinds, ([k, n]) => `${k} ${n}`).join(' · '),
            start: f('Scheduled').split(' · ')[0],
            scheduled: f('Scheduled'),
        };
    }, { html: fs.readFileSync(file, 'utf8'), plain: PLAIN_TABS });
}

/**
 * The live rows' four cells: state, On stage's list rows, the others' text.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<{key: string, state: string, stage: string[], content: string, images: string, start: string}>>}
 */
function cells(page) {
    return page.evaluate(() => Array.from(document.querySelectorAll('table.tbl tbody tr')).filter(tr => tr.style.display !== 'none').map((tr) => {
        const td = c => tr.querySelector(`td.mb-bbevp-cell[data-mb-bbevp-col="${c}"]`);
        const st = td('On stage');
        return {
            key: st ? st.dataset.mbBbevpKey || '' : '', state: st ? st.dataset.mbBbevpState : '',
            stage: st ? Array.from(st.querySelectorAll('li'), li => li.textContent.trim()) : [],
            content: td('Content') ? td('Content').textContent.trim() : '', images: td('Images') ? td('Images').textContent.trim() : '',
            start: td('Start') ? td('Start').textContent.trim() : '',
        };
    }));
}

/**
 * Presses the page's button and waits for the render.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} label
 * @returns {Promise<void>}
 */
async function show(page, label) {
    await page.click(`button[data-label="${label}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

const pagesBtn = page => page.locator('th[data-col-name="On stage"] .mb-bbevp-col-hdr-btn');

test.describe('Brucebase year table: the columns from each event\'s page (Phase 14)', () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 1600, height: 700 });
    });

    test('before ▶ Pages nothing is asked; after it the rows in view, filled as the previews read the page; Stop stops', async ({ page }) => {
        await loadBbYearPage(page, '1985');
        const asked = await serveEvents(page);
        await show(page, BB_YEAR_BUTTON);
        const names = await page.locator('table.tbl thead tr:first-child th').evaluateAll(ths => ths.map(th => th.dataset.colName || th.textContent.trim()));
        expect(names.slice(names.indexOf('Tour'), names.indexOf('Tour') + 5)).toEqual(['Tour', ...COLS]);
        const before = await cells(page);
        expect(before.length).toBeGreaterThan(80);
        expect(before.every(r => r.state === 'cold' || r.state === 'none'), 'nothing read').toBe(true);
        expect(before.every(r => !r.stage.length && !r.content && !r.start), 'a cold cell has no text').toBe(true);
        await page.evaluate(() => new Promise(r => setTimeout(r, 1500)));
        expect(asked, 'no request before the press').toEqual([]);

        await pagesBtn(page).click();
        await expect(pagesBtn(page)).toHaveAttribute('aria-pressed', 'true');
        // The rows in view (and 200 px around): the reading settles with
        // the button still on, the rows further down never asked.
        await expect.poll(async () => {
            const c = await cells(page);
            return c.filter(r => r.state === 'done').length >= 3 && !c.some(r => r.state === 'queued' || r.state === 'run');
        }, { timeout: 40000 }).toBe(true);
        expect(asked.length, 'only the rows in view').toBeLessThan(30);
        const order = before.map(r => r.key);
        asked.forEach(u => expect(order.indexOf(u), `${u} is near the top`).toBeLessThan(35));
        const want = await expected(page);
        const done = (await cells(page)).filter(r => r.state === 'done');
        done.forEach((r) => {
            expect(r.stage).toEqual(want.stage);
            expect([r.content, r.images, r.start]).toEqual([want.content, want.images, want.start]);
        });
        expect(want.stage[0]).toBe('Bruce Springsteen, The E Street Band');
        expect(want.content).toContain('Recording');
        // Each request is a row's own page, one each.
        const keys = done.map(r => r.key);
        expect(new Set(asked).size).toBe(asked.length);
        keys.forEach(k => expect(asked).toContain(k));

        await pagesBtn(page).click();
        await expect(pagesBtn(page)).toHaveAttribute('aria-pressed', 'false');
        await page.evaluate(() => new Promise(r => setTimeout(r, 1200)));
        const stopped = asked.length;
        expect(stopped, 'only the rows in view (the window shows a few)').toBeLessThan(30);
        await page.mouse.wheel(0, 4000);
        await page.evaluate(() => new Promise(r => setTimeout(r, 2500)));
        expect(asked.length, 'stopped: scrolling asks nothing').toBe(stopped);
        expect((await cells(page)).filter(r => r.state === 'queued' || r.state === 'run').length).toBe(0);
    });

    test('a filled cell is filtered: On stage finds a member folded away; a re-render keeps the cells and asks nothing', async ({ page }) => {
        await loadBbYearPage(page, '1985');
        const asked = await serveEvents(page);
        await show(page, BB_YEAR_BUTTON);
        await pagesBtn(page).click();
        await expect.poll(async () => (await cells(page)).filter(r => r.state === 'done').length, { timeout: 20000 }).toBeGreaterThanOrEqual(3);
        await pagesBtn(page).click();
        await page.evaluate(() => new Promise(r => setTimeout(r, 1200)));
        const read = (await cells(page)).filter(r => r.state === 'done').map(r => r.key);
        const n = asked.length;
        // Clarence Clemons is a member: the folded part of the cell.
        const names = await page.locator('table.tbl thead tr:first-child th').evaluateAll(ths => ths.map(th => th.dataset.colName || th.textContent.trim()));
        const input = columnFilterInput(page, names.indexOf('On stage'));
        await revealPastStickyColumn(page, input);
        await input.focus();
        await input.pressSequentially('Clarence');
        await expect.poll(async () => (await cells(page)).length, { timeout: 15000 }).toBe(read.length);
        expect((await cells(page)).map(r => r.key).sort()).toEqual([...read].sort());
        await input.fill('');
        await input.press('Enter');
        await expect.poll(async () => (await cells(page)).length, { timeout: 15000 }).toBeGreaterThan(80);
        expect((await cells(page)).filter(r => r.state === 'done').map(r => r.key).sort()).toEqual([...read].sort());
        expect(asked.length, 'the re-render asks nothing').toBe(n);
    });

    test('a filter set while pages arrive: rows filtered away but still queued come back once read (the four duties)', async ({ page }) => {
        // Tall, the table's top at the window's: about fifteen rows in view
        // (the table starts 1,290 px down the page), so most are still
        // queued when the filter is set.
        await page.setViewportSize({ width: 1600, height: 1400 });
        await loadBbYearPage(page, '1985');
        const asked = await serveEvents(page);
        await show(page, BB_YEAR_BUTTON);
        await page.evaluate(() => window.scrollTo(0, document.querySelector('table.tbl').getBoundingClientRect().top + window.scrollY));
        await pagesBtn(page).click();
        await expect.poll(async () => (await cells(page)).filter(r => r.state === 'done').length, { timeout: 20000 }).toBeGreaterThanOrEqual(2);
        const queued = (await cells(page)).filter(r => r.state === 'queued').length;
        expect(queued, 'rows still queued').toBeGreaterThan(2);
        const names = await page.locator('table.tbl thead tr:first-child th').evaluateAll(ths => ths.map(th => th.dataset.colName || th.textContent.trim()));
        const input = columnFilterInput(page, names.indexOf('On stage'));
        await revealPastStickyColumn(page, input);
        await input.focus();
        await input.pressSequentially('Clarence');
        await expect.poll(async () => (await cells(page)).length, { timeout: 15000 }).toBeLessThan(50);
        const shown1 = (await cells(page)).length;
        // The rows left the table with the filter, but stay queued: each one
        // read is written to its source row and the filter runs again.
        await expect.poll(async () => (await cells(page)).length, { timeout: 30000 }).toBeGreaterThan(shown1 + 1);
        expect((await cells(page)).every(r => r.state === 'done' && r.stage.includes('Clarence Clemons'))).toBe(true);
        await pagesBtn(page).click();
        expect(asked.length).toBeGreaterThan(shown1);
    });

    test('Start is the scheduled time; "??:??" (time not known) leaves it empty', async ({ page }) => {
        const REHEARSAL = path.join(__dirname, 'bb-event-rehearsal-2009-01-29a.html');
        await loadBbYearPage(page, '1985');
        await serveEvents(page, REHEARSAL);
        await show(page, BB_YEAR_BUTTON);
        const want = await expected(page, REHEARSAL);
        expect(want.scheduled).toMatch(/^time not known/);
        await pagesBtn(page).click();
        await expect.poll(async () => (await cells(page)).filter(r => r.state === 'done').length, { timeout: 20000 }).toBeGreaterThanOrEqual(2);
        await pagesBtn(page).click();
        const done = (await cells(page)).filter(r => r.state === 'done');
        expect(done.every(r => r.start === '')).toBe(true);
        expect(done.every(r => r.stage.join() === want.stage.join())).toBe(true);
    });

    // Phase 16, vzell's answer 4: the column shows whoever the page lists in
    // its cast tab, whatever the tab is called — a recording's In Studio.
    test('a recording\'s In Studio people fill On stage', async ({ page }) => {
        const STUDIO = path.join(__dirname, 'bb-event-recording-1979-04-09.html');
        await loadBbYearPage(page, '1985');
        await serveEvents(page, STUDIO);
        await show(page, BB_YEAR_BUTTON);
        const want = await page.evaluate((html) => {
            const d = window.__saTest.dpParse('brucebase.wikidot.com', html, 'https://brucebase.wikidot.com/recording:1979-04-09-power-station-new-york-city-ny');
            return { studio: (d.fields.find(f => f[0] === 'In studio') || [])[1] || '', stage: (d.fields.find(f => f[0] === 'On stage') || [])[1] || '' };
        }, fs.readFileSync(STUDIO, 'utf8'));
        expect(want.stage).toBe('');
        expect(want.studio.split(', ')).toHaveLength(7);
        await pagesBtn(page).click();
        await expect.poll(async () => (await cells(page)).filter(r => r.state === 'done').length, { timeout: 20000 }).toBeGreaterThanOrEqual(2);
        await pagesBtn(page).click();
        const done = (await cells(page)).filter(r => r.state === 'done');
        expect(done.every(r => r.stage.join(', ') === want.studio)).toBe(true);
    });

    test('a failed row: ⟳ in its On stage cell asks again', async ({ page }) => {
        await loadBbYearPage(page, '1985');
        let failUrl = '';
        const asked = [];
        let fails = 0;
        await page.route(EVENT_RE, (route) => {
            const u = route.request().url();
            asked.push(u);
            if (!failUrl) failUrl = u;
            if (u === failUrl && fails < 2) {
                fails++;
                return route.fulfill({ status: 503, contentType: 'text/plain', body: 'busy' });
            }
            return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fs.readFileSync(EVENT_FILE, 'utf8') });
        });
        await show(page, BB_YEAR_BUTTON);
        await pagesBtn(page).click();
        await expect.poll(async () => (await cells(page)).filter(r => r.state === 'failed').length, { timeout: 20000 }).toBe(1);
        const failed = (await cells(page)).find(r => r.state === 'failed');
        expect(failed.key).toBe(failUrl);
        expect(failed.stage).toEqual([]);
        await expect(pagesBtn(page)).toHaveAttribute('data-bbevp-state', 'error');
        const retry = page.locator(`td.mb-bbevp-cell[data-mb-bbevp-key="${failUrl}"] button.mb-bbevp-retry`).first();
        await expect(retry).toBeVisible();
        await expect(retry, 'its words are CSS: the filter never reads them').toHaveText('');
        await retry.click();
        await expect.poll(async () => ((await cells(page)).find(r => r.key === failUrl) || {}).state, { timeout: 20000 }).toBe('done');
        expect(asked.filter(u => u === failUrl).length).toBe(3);
    });

    test('rows read before: at the next render they fill in at once, from the previews\' store, with no request', async ({ page }) => {
        await loadBbYearPage(page, '1985');
        const asked = await serveEvents(page);
        await show(page, BB_YEAR_BUTTON);
        await pagesBtn(page).click();
        await expect.poll(async () => (await cells(page)).filter(r => r.state === 'done').length, { timeout: 20000 }).toBeGreaterThanOrEqual(3);
        await pagesBtn(page).click();
        await page.evaluate(() => new Promise(r => setTimeout(r, 1200)));
        const read = (await cells(page)).filter(r => r.state === 'done').map(r => r.key);
        const n = asked.length;
        // A second tab of the same browser: the store is shared, memory is not.
        const two = await page.context().newPage();
        await two.setViewportSize({ width: 1600, height: 700 });
        await loadBbYearPage(two, '1985');
        const asked2 = await serveEvents(two);
        await show(two, BB_YEAR_BUTTON);
        await expect.poll(async () => (await cells(two)).filter(r => r.state === 'done').length, { timeout: 10000 }).toBe(read.length);
        expect((await cells(two)).filter(r => r.state === 'done').map(r => r.key).sort()).toEqual([...read].sort());
        expect(asked2, 'painted from the store').toEqual([]);
        expect(asked.length).toBe(n);
        await expect(pagesBtn(two)).toHaveAttribute('aria-pressed', 'false');
    });
});

test.describe('Brucebase year listing: the same columns, a row\'s page from its year page (Phase 14)', () => {
    test('a show link finds its page on the year page (one request for the year), then the page fills the row', async ({ page }) => {
        await page.setViewportSize({ width: 1600, height: 700 });
        const YEAR = 'https://brucebase.wikidot.com/1985';
        await page.context().addInitScript((r) => { window.__gmXhrResponses = r; },
            { [YEAR]: { status: 200, responseHeaders: 'content-type: text/html; charset=utf-8\r\n', responseText: fs.readFileSync(path.join(__dirname, 'bb-year-1985.html'), 'utf8') } });
        await loadBbYearListPage(page, '1985');
        const asked = await serveEvents(page);
        await show(page, BB_YEAR_LIST_BUTTON);
        const names = await page.locator('table.tbl thead tr:first-child th').evaluateAll(ths => ths.map(th => th.dataset.colName || th.textContent.trim()));
        expect(names.slice(names.indexOf('Tour'), names.indexOf('Tour') + 5)).toEqual(['Tour', ...COLS]);
        const before = await cells(page);
        expect(before.every(r => /^https:\/\/brucebase\.wikidot\.com\/1985#\d{6}[a-z]?$/.test(r.key)), 'keyed by the show link').toBe(true);
        await pagesBtn(page).click();
        await expect.poll(async () => (await cells(page)).filter(r => r.state === 'done').length, { timeout: 20000 }).toBeGreaterThanOrEqual(3);
        const yearAsks = await page.evaluate(y => (window.__gmXhrLog || []).filter(r => r.url === y).length, YEAR);
        expect(yearAsks, 'the year page once').toBe(1);
        const want = await expected(page);
        (await cells(page)).filter(r => r.state === 'done').forEach(r => expect(r.stage).toEqual(want.stage));
        // The page asked is the one the year page names for the row's anchor.
        const html = fs.readFileSync(path.join(__dirname, 'bb-year-1985.html'), 'utf8');
        asked.forEach((u) => {
            const slug = u.replace(/^https:\/\/brucebase\.wikidot\.com/, '');
            expect(html, `${slug} is linked from the year page`).toContain(`href="${slug}"`);
        });
        await pagesBtn(page).click();
    });
});
