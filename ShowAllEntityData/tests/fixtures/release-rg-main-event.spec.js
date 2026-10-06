'use strict';

// The release group as the authority for a live release's main event
// (org/live-bootleg.org item 4).
//
// Fixture: release-tracks-multi-event.html (Berlin Night, see
// release-tracks-event-consistency.spec.js). Its release group, named in the
// page's own JSON, is "1996‐04‐19: ICC Berlin, Saal 1, Berlin, Germany";
// every Berlin track's event and comment say "Saal 1, ICC Berlin" instead.
// CD 3 also carries 2 tracks from "1992‐06‐26: Festhalle, Frankfurt, Germany".
// The preview's WS/2 answer is the real one, captured by
// scripts/probe-rg-release-browse.py (ws2-rg-release-browse.json).
//
// ── What each test pins ─────────────────────────────────────────────────────
//
//  1. THE LINK. Rewritten from the page's own JSON, no request, href kept.
//  2. THE PREVIEW costs exactly one request, on the first hover, kept for the
//     page — and a failure is NOT kept: the next hover asks again.
//  3. THE MAIN EVENT is decided by DATE: the Festhalle tracks are off it, the
//     Berlin tracks on it although their text differs from the RG title.
//  4. 4b warns on main-event cells that name the event differently; 4c puts a
//     ⚠️ on the link, and no green, when the RG title is not a live title.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { waitForSortSettled } = require('../support/filterSortAssertions');

const RELEASE_URL = 'https://musicbrainz.org/release/d390b4ff-38ab-4783-99ef-2c4d338e016b';
const FIXTURE = path.join(__dirname, 'release-tracks-multi-event.html');
const WS2_BODY = fs.readFileSync(path.join(__dirname, 'ws2-rg-release-browse.json'), 'utf8');
const RG_NAME = '1996‐04‐19: ICC Berlin, Saal 1, Berlin, Germany';
const RG_JSON_NAME = '"name":"1996‐04‐19: ICC Berlin, Saal 1, Berlin, Germany"';
const LINK = 'p.subheader span.small > a[href^="/release-group/"]';

/**
 * Loads the fixture (optionally rewritten), with the WS/2 browse answered by
 * `ws2` and counted.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{rewrite?: function(string): string, ws2?: function(): {status: number, body: string},
 *          settings?: Object, showAll?: boolean}} [opts]
 * @returns {Promise<{calls: string[]}>}
 */
async function open(page, { rewrite = null, ws2 = null, settings = {}, showAll = true } = {}) {
    // See release-tracks-event-consistency.spec.js: current bundle hashes
    // would let MusicBrainz's own script re-render the tracklist.
    await page.context().route('https://static.metabrainz.org/**', (route) => route.abort('blockedbyclient'));
    await page.context().route('https://coverartarchive.org/**', (route) => route.fulfill({ status: 404, body: '' }));
    const calls = [];
    await page.context().route('**/ws/2/release?release-group=**', (route) => {
        calls.push(route.request().url());
        const r = ws2 ? ws2() : { status: 200, body: WS2_BODY };
        return route.fulfill({ status: r.status, contentType: 'application/json', body: r.body });
    });
    let file = FIXTURE;
    if (rewrite) {
        file = path.join(__dirname, '..', '..', 'test-results', `rg-main-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, rewrite(fs.readFileSync(FIXTURE, 'utf8')));
    }
    await loadUserscriptPage(page, { url: RELEASE_URL, fixtureFile: file, testMode: true, settingsOverride: { sa_rich_tooltip_delay_ms: 0, ...settings } });
    await page.route('https://musicbrainz.org/release/**', (route) => route.fulfill({ path: file, contentType: 'text/html' }));
    if (showAll) {
        await page.click('button[data-label="Show all Tracks for Release"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const master = page.locator('.mb-master-toggle');
        if (await master.count() && (await master.getAttribute('data-state')) === 'collapsed') await master.click();
    }
    await page.mouse.move(0, 0);
    return { calls };
}

/**
 * `{on, off, rgCols}` over every rendered row: main-event flags, the keys of
 * the off rows, and rg-title-mismatch cells per column.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{on: number, off: string[], unflagged: number, rgCols: Object<string, number>}>}
 */
const mainState = (page) => page.evaluate(() => {
    const out = { on: 0, off: [], unflagged: 0, rgCols: {} };
    document.querySelectorAll('table.tbl').forEach((t) => {
        const names = Array.from(t.querySelectorAll('thead tr:first-child th')).map((h) => h.dataset.colName);
        t.querySelectorAll('tbody tr').forEach((r) => {
            const v = r.dataset.mbMainEvent;
            if (v === '1') out.on++;
            else if (v === '0') out.off.push(r.dataset.mbEventKey);
            else out.unflagged++;
            Array.from(r.cells).forEach((c, i) => {
                if ((c.dataset.mbFindings || '').split(' ').includes('rg-title-mismatch')) {
                    out.rgCols[names[i]] = (out.rgCols[names[i]] || 0) + 1;
                }
            });
        });
    });
    return out;
});

/** Background colour of the "#" cell of every off-main-event row. */
const greenCells = (page) => page.evaluate(() => Array.from(document.querySelectorAll('table.tbl tbody tr[data-mb-main-event="0"]'))
    .map((r) => getComputedStyle(r.cells[0]).backgroundColor));

const FESTHALLE = '1992‐06‐26: Festhalle, Frankfurt, Germany';
// Since the per-event colours, an off-main track's "#" carries its event's
// own tint: the Festhalle event is the page's only other one, so E1.
const GREEN = 'rgb(230, 220, 245)';

test.describe('release group link and main event (org/live-bootleg.org 4)', () => {
    let pageErrors;

    test.beforeEach(({ page }) => {
        pageErrors = [];
        page.on('pageerror', (e) => pageErrors.push(String(e.stack || e.message)));
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('4a: the link names the release group at page load, no request, href kept', async ({ page }) => {
        const { calls } = await open(page, { showAll: false });
        const link = page.locator(LINK);
        await expect(link).toHaveText(`5 versions available in ${RG_NAME}`);
        await expect(link).toHaveAttribute('href', '/release-group/fa9c43a7-2592-3336-a09b-1414b4b6ee68');
        expect(calls, 'the name is in the page: nothing is fetched').toEqual([]);
    });

    test('4a: the preview loads on the first hover only, and lists the releases', async ({ page }) => {
        const { calls } = await open(page);
        expect(calls).toEqual([]);
        const tip = page.locator('#mb-stat-tooltip');
        await page.locator(LINK).hover();
        await expect(tip).toContainText('Born Again', { timeout: 15000 });
        await expect(tip).toContainText('▸ Berlin Night');
        await expect(tip).toContainText('3×CD');
        await expect(tip).toContainText('All 5 releases are Bootleg');
        expect(calls).toHaveLength(1);
        expect(calls[0]).toContain('inc=media+labels');

        await page.mouse.move(0, 0);
        await expect(tip).toBeHidden();
        await page.locator(LINK).hover();
        await expect(tip).toContainText('Born Again');
        expect(calls, 'kept for the page').toHaveLength(1);
    });

    test('4a: a failed preview is not kept — the next hover asks again', async ({ page }) => {
        test.setTimeout(60000);
        let n = 0;
        const { calls } = await open(page, {
            ws2: () => (++n <= 4 ? { status: 503, body: '' } : { status: 200, body: WS2_BODY }),
        });
        const tip = page.locator('#mb-stat-tooltip');
        await page.locator(LINK).hover();
        await expect(tip).toContainText('Could not load the releases (HTTP 503)', { timeout: 30000 });
        expect(calls, 'retried up to the limit').toHaveLength(4);
        await page.mouse.move(0, 0);
        await page.locator(LINK).hover();
        await expect(tip).toContainText('Born Again', { timeout: 15000 });
        expect(calls).toHaveLength(5);
    });

    test('4: exactly the Festhalle tracks are off the main event, and their "#" carries the tint of their event', async ({ page }) => {
        await open(page);
        const st = await mainState(page);
        expect(st.off).toEqual([FESTHALLE, FESTHALLE]);
        expect(st.on, 'the Berlin tracks, though their text differs from the RG title').toBe(36);
        expect(await greenCells(page)).toEqual([GREEN, GREEN]);

        await page.fill('#mb-global-filter-input', 'Festhalle');
        await expect.poll(async () => (await greenCells(page)).length, { timeout: 15000 }).toBe(2);
        await page.fill('#mb-global-filter-input', '');
        await expect.poll(async () => (await mainState(page)).on, { timeout: 15000 }).toBe(36);

        const sortBtn = page.locator('table.tbl').nth(2).locator('thead .sort-icon-btn', { hasText: '▼' }).first();
        await waitForSortSettled(page, () => sortBtn.click(), { subTableHeading: '3 - CD' });
        expect(await greenCells(page), 'a sort re-renders clones of the source rows').toEqual([GREEN, GREEN]);
    });

    test('4: one event date on the page: no green, but 4b still checks every track', async ({ page }) => {
        // All tracks on the RG's date: every track is main-event data, so 4b
        // applies (the former Festhalle tracks now disagree too); the green
        // "#" is only for a release that mixes dates.
        await open(page, { rewrite: (html) => html.replace(/1992‐06‐26/g, '1996‐04‐19').replace(/1992-06-26/g, '1996-04-19') });
        const st = await mainState(page);
        expect(st.on).toBe(38);
        expect(st.off).toEqual([]);
        expect(await page.locator('table.tbl[data-mb-multi-event]').count(), 'no table is marked as mixing events').toBe(0);
        expect(st.rgCols).toEqual({ Disambiguation: 38, 'Recorded at event': 38, 'Recorded at place': 38 });
    });

    test('4: a track off the main event on a single-date page is not green', async ({ page }) => {
        // RG date differs from the one date every track has: all tracks are
        // off the main event, and still none is green — that needs 2+ dates.
        await open(page, { rewrite: (html) => html.replace(/1992‐06‐26/g, '1996‐04‐19').replace(/1992-06-26/g, '1996-04-19')
            .split(RG_JSON_NAME).join('"name":"1996‐04‐20: ICC Berlin, Saal 1, Berlin, Germany"') });
        const st = await mainState(page);
        expect(st.off).toHaveLength(38);
        expect(await greenCells(page)).not.toContain(GREEN);
    });

    test('4b: main-event cells naming the event differently get the warning, with both values', async ({ page }) => {
        await open(page);
        expect((await mainState(page)).rgCols).toEqual({ Disambiguation: 36, 'Recorded at event': 36, 'Recorded at place': 36 });
        const tips = await page.evaluate(() => {
            const out = {};
            const t = document.querySelector('table.tbl');
            const names = Array.from(t.querySelectorAll('thead tr:first-child th')).map((h) => h.dataset.colName);
            const r = t.querySelector('tbody tr[data-mb-main-event="1"]');
            ['Recorded at event', 'Recorded at place'].forEach((n) => { out[n] = r.cells[names.indexOf(n)].title; });
            return out;
        });
        expect(tips['Recorded at event']).toBe(`⚠️ Main-event track differs from the release group title: release group "${RG_NAME}", here "1996‐04‐19: Saal 1, ICC Berlin, Berlin, Germany"`);
        expect(tips['Recorded at place']).toBe('⚠️ Main-event track differs from the release group title: release group "ICC Berlin", here "Saal 1"');
    });

    test('4c: a release group title that is not a live title gets a ⚠️ and no green', async ({ page }) => {
        const { calls } = await open(page, { rewrite: (html) => html.split(RG_JSON_NAME).join('"name":"Berlin Night (RG)"') });
        await expect(page.locator(LINK)).toHaveText('5 versions available in Berlin Night (RG)');
        const warn = page.locator('.mb-rg-live-warn');
        await expect(warn).toHaveText('⚠️');
        const card = await warn.getAttribute('data-mbtt');
        expect(card).toContain('which does not start with a date');
        expect(card).toContain('(36 of 38)');
        expect(card).toContain('1996‐04‐19: Saal 1, ICC Berlin, Berlin, Germany');
        const st = await mainState(page);
        expect(st.on + st.off.length).toBe(0);
        expect(st.rgCols).toEqual({});
        expect(calls).toEqual([]);
    });

    test('4c: an RG live title with an impossible date names no main event', async ({ page }) => {
        await open(page, { rewrite: (html) => html.split(RG_JSON_NAME).join('"name":"1996‐04‐31: ICC Berlin, Saal 1, Berlin, Germany"') });
        const warn = page.locator('.mb-rg-live-warn');
        await expect(warn).toHaveText('⚠️');
        expect(await warn.getAttribute('data-mbtt')).toContain('which has an impossible date: day 31');
        const st = await mainState(page);
        expect(st.on + st.off.length, 'no main event to be on or off').toBe(0);
    });

    test('4c: no ⚠️ while the title is a live title', async ({ page }) => {
        await open(page);
        await expect(page.locator('.mb-rg-live-warn')).toHaveCount(0);
    });

    test('setting off: the link is left as MusicBrainz wrote it', async ({ page }) => {
        await open(page, { settings: { sa_release_rg_link: false } });
        await expect(page.locator(LINK)).toHaveText('see all versions of this release, 5 available');
    });
});
