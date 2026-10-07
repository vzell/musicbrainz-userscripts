'use strict';

// Per-event colours in "#" and the "#" cell's release group card (follow-up
// to org/live-bootleg.org item 4; mockup variant B approved 2026-10-05:
// https://claude.ai/artifact/WNk84AymBEwfc6pKoyvmLR).
//
// Fixture: release e384f062-85a3-4141-9122-0814d987cda3 "Brixton Night", the
// server's raw HTML (scripts/fetch-release-fixture.js) with its recording
// comments put back (scripts/build-multi-event-fixture.py). Its release group
// "1996‐04‐24: Brixton Academy, London, England, UK" names the main event;
// CD 3 mixes four others: 1996‐03‐25 (Academy Awards, 1 track), 1996‐04‐22
// (Royal Albert Hall, 2), 1996‐04‐25 (Brixton, 9), 1996‐04‐27 (RAH, 1).
// WS/2 answers are the real ones, captured by scripts/probe-rg-event-search.py
// and scripts/probe-rg-release-browse.py.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const RELEASE_URL = 'https://musicbrainz.org/release/e384f062-85a3-4141-9122-0814d987cda3';
const FIXTURE = path.join(__dirname, 'release-tracks-brixton-night.html');
const json = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');

/**
 * Loads Brixton Night with the WS/2 search and browse routed and counted.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{search?: function(string): {status: number, body: string}, settings?: Object}} [opts]
 * @returns {Promise<{searches: string[], browses: string[]}>}
 */
async function open(page, { search = null, settings = {} } = {}) {
    await page.context().route('https://static.metabrainz.org/**', (route) => route.abort('blockedbyclient'));
    await page.context().route('https://coverartarchive.org/**', (route) => route.fulfill({ status: 404, body: '' }));
    const searches = [];
    const browses = [];
    await page.context().route('**/ws/2/release-group?query=**', (route) => {
        const q = new URL(route.request().url()).searchParams.get('query');
        searches.push(q);
        const r = search ? search(q) : { status: 200, body: json('ws2-rg-search-none.json') };
        return route.fulfill({ status: r.status, contentType: 'application/json', body: r.body });
    });
    await page.context().route('**/ws/2/release?release-group=**', (route) => {
        browses.push(route.request().url());
        return route.fulfill({ status: 200, contentType: 'application/json', body: json('ws2-rg-release-browse.json') });
    });
    await loadUserscriptPage(page, { url: RELEASE_URL, fixtureFile: FIXTURE, testMode: true, settingsOverride: { sa_rich_tooltip_delay_ms: 0, ...settings } });
    await page.route('https://musicbrainz.org/release/**', (route) => route.fulfill({ path: FIXTURE, contentType: 'text/html' }));
    await page.click('button[data-label="Show all Tracks for Release"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
    const master = page.locator('.mb-master-toggle');
    if (await master.count() && (await master.getAttribute('data-state')) === 'collapsed') await master.click();
    await page.mouse.move(0, 0);
    return { searches, browses };
}

const RAH22 = '1996‐04‐22: Royal Albert Hall, London, England, UK';
const RAH27 = '1996‐04‐27: Royal Albert Hall, London, England, UK';
const OSCARS = '1996‐03‐25: Dorothy Chandler Pavilion, Los Angeles, CA, USA';
const BRIX25 = '1996‐04‐25: Brixton Academy, London, England, UK';

/**
 * A search answer whose one release group is named `title` — a test double
 * built from the real "found" answer, since none of Brixton Night's other
 * events has a release group of its own (scripts/probe-rg-event-search.py).
 *
 * @param {string} title
 * @returns {string}
 */
const foundFor = (title) => {
    const data = JSON.parse(json('ws2-rg-search-found.json'));
    data['release-groups'][0].title = title;
    return JSON.stringify(data);
};

/** The "#" cell of row `r` of table `t`. */
const hashCell = (page, t, r) => page.locator('table.tbl').nth(t).locator('tbody tr').nth(r).locator('td').first();

/** The shown tooltip card. */
const tip = (page) => page.locator('#mb-dp-peek');

/**
 * Hovers one "#" cell from a resting pointer WITHOUT Ctrl: by default
 * (sa_event_rg_tooltip_without_ctrl off) no card is due.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} t
 * @param {number} r
 */
async function plainHoverHash(page, t, r) {
    await page.mouse.move(0, 0);
    await expect(tip(page)).toBeHidden();
    await hashCell(page, t, r).hover();
}

/**
 * Hovers one "#" cell from a resting pointer with Ctrl held, so the card is
 * shown afresh. Ctrl goes down on no cell (so the press shows nothing) and
 * up after the hover, so a later Alt+click is not Ctrl+Alt+click.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} t
 * @param {number} r
 */
async function hoverHash(page, t, r) {
    await page.mouse.move(0, 0);
    await expect(tip(page)).toBeHidden();
    await page.keyboard.down('Control');
    await hashCell(page, t, r).hover();
    await page.keyboard.up('Control');
}

/** `[event-idx, background, chip]` of every "#" cell of table `t`. */
const hashState = (page, t) => page.evaluate((i) => Array.from(document.querySelectorAll('table.tbl')[i].querySelectorAll('tbody tr'))
    .map((r) => [r.cells[0].dataset.mbEventIdx || '', getComputedStyle(r.cells[0]).backgroundColor,
        getComputedStyle(r.cells[0], '::before').content]), t);

const TINT = { 1: 'rgb(230, 220, 245)', 2: 'rgb(207, 227, 247)', 3: 'rgb(251, 224, 194)', 4: 'rgb(205, 238, 230)' };
const NONE = 'rgba(0, 0, 0, 0)';

test.describe('per-event "#" colours and the "#" release group card', () => {
    let pageErrors;

    test.beforeEach(({ page }) => {
        pageErrors = [];
        page.on('pageerror', (e) => pageErrors.push(String(e.stack || e.message)));
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('colours: each event off the main one has its own tint and E-chip, numbered by date', async ({ page }) => {
        await open(page);
        const e = (k) => [String(k), TINT[k], `"E${k}"`];
        expect(await hashState(page, 2)).toEqual([
            ...Array(9).fill(e(3)), e(2), e(2), e(4), e(1),
        ]);
        expect((await hashState(page, 0)).every(([idx, bg, chip]) => idx === '' && bg === NONE && chip === 'none'),
            'main-event tracks keep a plain "#"').toBe(true);
    });

    test('colours survive a filter and a sort (clones of the source rows)', async ({ page }) => {
        await open(page);
        await page.fill('#mb-global-filter-input', 'Royal Albert');
        await expect.poll(async () => (await hashState(page, 2)).length, { timeout: 15000 }).toBe(3);
        expect((await hashState(page, 2)).map(([i]) => i)).toEqual(['2', '2', '4']);
        await page.fill('#mb-global-filter-input', '');
        await expect.poll(async () => (await hashState(page, 2)).length, { timeout: 15000 }).toBe(13);
        await page.locator('table.tbl').nth(2).locator('thead .sort-icon-btn', { hasText: '▼' }).first().click();
        await expect.poll(async () => (await hashState(page, 2))[0][0], { timeout: 15000 }).toBe('1');
        expect((await hashState(page, 2))[0]).toEqual(['1', TINT[1], '"E1"']);
    });

    test('the 🎪 badge legend shows each event with its tint and chip', async ({ page }) => {
        await open(page);
        const legend = await page.locator('.mb-medium-events-badge').getAttribute('data-mbtt');
        for (const [k, n, ev] of [[1, 1, OSCARS], [2, 2, RAH22], [3, 9, BRIX25], [4, 1, RAH27]]) {
            expect(legend).toContain(`background:${['', '#e6dcf5', '#cfe3f7', '#fbe0c2', '#cdeee6'][k]};`);
            expect(legend).toContain(`>E${k}</span><span>${n} track${n === 1 ? '' : 's'} · ${ev}</span>`);
        }
    });

    test('"#" card, main event: the release\'s own release group, no search', async ({ page }) => {
        const { searches, browses } = await open(page);
        await hoverHash(page, 0, 0);
        await expect(tip(page)).toContainText('main event');
        await expect(tip(page)).toContainText('Born Again', { timeout: 15000 });
        expect(searches).toEqual([]);
        expect(browses).toHaveLength(1);
    });

    test('"#" card, another event: one search, the found group\'s card, kept per event', async ({ page }) => {
        const { searches, browses } = await open(page, { search: () => ({ status: 200, body: foundFor(RAH22) }) });
        await hoverHash(page, 2, 9);
        await expect(tip(page)).toContainText(RAH22, { timeout: 15000 });
        await expect(tip(page)).toContainText('Born Again', { timeout: 15000 });
        await expect(tip(page)).toContainText('Found by searching for this event');
        expect(searches).toEqual([`releasegroup:"${RAH22}" AND (arid:70248960-cb53-4ea4-943a-edb18f7d336f)`]);
        expect(browses).toHaveLength(1);
        await hoverHash(page, 2, 10);
        await expect(tip(page)).toContainText('Born Again');
        expect(searches, 'the other track of the same event asks nothing').toHaveLength(1);
        expect(browses).toHaveLength(1);
    });

    test('"#" card, no match: the event, its tracks and the closest titles', async ({ page }) => {
        const { searches } = await open(page, { search: () => ({ status: 200, body: json('ws2-rg-search-terms.json') }) });
        await hoverHash(page, 2, 11);
        await expect(tip(page)).toContainText('No release group is named like this event.', { timeout: 15000 });
        await expect(tip(page)).toContainText('1 track on this release · not the main event');
        await expect(tip(page)).toContainText('2005‐05‐28: Royal Albert Hall, London, England, UK');
        await expect(tip(page)).toContainText('1996‐04‐24: Brixton Academy, London, England, UK');
        await expect(tip(page), 'five hints, not six').not.toContainText('2009‐06‐28: Hyde Park');
        await expect(tip(page)).toContainText('phrase search, by the release\'s artist');
        expect(searches).toHaveLength(1);
    });

    test('settings shape the query and the card', async ({ page }) => {
        const { searches } = await open(page, {
            search: () => ({ status: 200, body: json('ws2-rg-search-terms.json') }),
            settings: { sa_event_rg_search_phrase: false, sa_event_rg_search_artist: false, sa_event_rg_search_hints: 0 },
        });
        await hoverHash(page, 2, 11);
        await expect(tip(page)).toContainText('No release group is named like this event.', { timeout: 15000 });
        await expect(tip(page)).not.toContainText('Closest titles');
        await expect(tip(page)).toContainText('terms search');
        expect(searches).toHaveLength(1);
        expect(searches[0]).not.toContain('"');
        expect(searches[0]).not.toContain('arid:');
        expect(searches[0]).toContain('releasegroup:(1996‐04‐27\\: Royal Albert Hall, London, England, UK)');
    });

    test('tooltip setting off: no card, no request', async ({ page }) => {
        // A fake clock (time still flows) lets the test jump past the card's
        // show timer (sa_rich_tooltip_delay_ms) before asserting there is
        // none, as detail-preview.spec.js does.
        await page.clock.install();
        const { searches, browses } = await open(page, { settings: { sa_event_rg_tooltip: false } });
        await hoverHash(page, 2, 11);
        await page.clock.fastForward(1000);
        await expect(tip(page)).toBeHidden();
        expect(searches).toEqual([]);
        expect(browses).toEqual([]);
    });

    test('Ctrl gate: a plain hover shows no card and asks nothing', async ({ page }) => {
        await page.clock.install();
        const { searches, browses } = await open(page);
        await plainHoverHash(page, 2, 11);
        await plainHoverHash(page, 0, 0);
        await page.clock.fastForward(1000);
        await expect(tip(page)).toBeHidden();
        expect(searches).toEqual([]);
        expect(browses).toEqual([]);
    });

    test('Ctrl gate: Ctrl pressed while the pointer is on a "#" cell shows its card', async ({ page }) => {
        await page.clock.install();
        const { searches } = await open(page, { search: () => ({ status: 200, body: json('ws2-rg-search-terms.json') }) });
        await plainHoverHash(page, 2, 11);
        await page.keyboard.press('Control');
        await expect(tip(page)).toBeVisible();
        await expect(tip(page)).toContainText('No release group is named like this event.', { timeout: 15000 });
        expect(searches).toHaveLength(1);
        // Leaving the cell hides it as any card; a plain hover back does not
        // bring the card back.
        await page.mouse.move(0, 0);
        await expect(tip(page)).toBeHidden();
        await plainHoverHash(page, 2, 11);
        await page.clock.fastForward(1000);
        await expect(tip(page)).toBeHidden();
    });

    test('Ctrl gate: with sa_event_rg_tooltip_without_ctrl on, a plain hover shows the card', async ({ page }) => {
        await open(page, { settings: { sa_event_rg_tooltip_without_ctrl: true } });
        await plainHoverHash(page, 0, 0);
        await expect(tip(page)).toContainText('main event');
    });

    test('a failed search is not kept: the next hover asks again', async ({ page }) => {
        test.setTimeout(60000);
        // Only this event's search fails, and only its own requests are
        // counted: a search another hover started must not use up the 503s.
        let n = 0;
        const mine = (q) => q.includes('1996‐03‐25');
        const { searches } = await open(page, {
            search: (q) => (mine(q) && ++n <= 4 ? { status: 503, body: '' } : { status: 200, body: json('ws2-rg-search-none.json') }),
        });
        await hoverHash(page, 2, 12);
        await expect(tip(page)).toContainText('Could not search (HTTP 503)', { timeout: 30000 });
        // Exactly the retry limit: a failure is not restarted by its own
        // repaint (it once was, in a loop — the card then never settled on
        // the failure line above).
        expect(searches.filter(mine), 'retried up to the limit').toHaveLength(4);
        await hoverHash(page, 2, 12);
        await expect(tip(page)).toContainText('No release group is named like this event.', { timeout: 15000 });
        expect(searches.filter(mine), 'asked again, once').toHaveLength(5);
    });

    test('Alt+click opens the found group, or the search', async ({ page }) => {
        await open(page, { search: (q) => ({ status: 200, body: q.includes('04‐22') ? foundFor(RAH22) : json('ws2-rg-search-none.json') }) });
        await page.evaluate(() => { window.__opened = []; window.open = (u) => { window.__opened.push(u); return null; }; });
        await hoverHash(page, 2, 9);
        await expect(tip(page)).toContainText('Found by searching', { timeout: 15000 });
        await hashCell(page, 2, 9).click({ modifiers: ['Alt'] });
        await hoverHash(page, 2, 11);
        await expect(tip(page)).toContainText('No release group is named', { timeout: 15000 });
        await hashCell(page, 2, 11).click({ modifiers: ['Alt'] });
        await hashCell(page, 0, 0).click({ modifiers: ['Alt'] });
        const opened = await page.evaluate(() => window.__opened);
        expect(opened[0]).toBe('/release-group/fa9c43a7-2592-3336-a09b-1414b4b6ee68');
        expect(opened[1]).toMatch(/^\/search\?query=releasegroup%3A%22.*&type=release_group&method=advanced$/);
        expect(opened[2]).toBe('/release-group/499a96d4-f934-34a8-a9f7-0636ff42ba6b');
    });
});
