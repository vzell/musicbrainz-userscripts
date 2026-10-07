'use strict';

// The release-group popup on a release tracklist, since the popup engine
// (org/iframe.org, Phase 1, WIP.2): the subheader link's card and the "#"
// cell's card are sources of the detail-page engine (#mb-dp-peek, Space,
// #mb-dp-dialog). What the older specs already pin stays with them:
// release-rg-main-event.spec.js (the link, the main event, 4a-4c) and
// release-event-colours-rg-tooltip.spec.js (the "#" card's contents, the
// Ctrl gate, the search). This one pins what the engine adds:
//
//  1. THE CARD sits beside the subheader link, on a plain hover (the link was
//     never Ctrl-gated; org/iframe.org answer 8), and costs one request.
//  2. THE WINDOW lists EVERY release: the browse is paged by the releases
//     RETURNED (a first page of 90 makes the second offset=90, not 100),
//     beside the group's facts from one lookup; it sorts by a header;
//     each title links its release; covers only where the archive has a
//     front; ⟳ asks again.
//  3. KEPT A DAY in IndexedDB: after a reload the card asks nothing.
//  4. ONE RATE GATE: the popup's request waits behind slots another feature
//     reserved (org/iframe.org answer 7).
//  5. "#" CELLS: ← → step down the column; a no-match event's window links
//     the closest titles and the search.
//  6. THE LIVE PAGE: the release group's own page, without its scripts, with
//     the site's header and footer hidden.
//
// Fixture: release e384f062 "Brixton Night" (see
// release-event-colours-rg-tooltip.spec.js). WS/2 answers are real ones:
// ws2-rg-release-browse.json, ws2-rg-lookup.json (scripts/probe-rg-release-browse.py
// --lookup), ws2-rg-search-*.json; rg-page-berlin.html is the release group's
// own page (scripts/fetch-mb-page-fixture.js).

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage, addRequiredLibs, MB_LIBRARY_PATH, USERSCRIPT_PATH } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const RELEASE_URL = 'https://musicbrainz.org/release/e384f062-85a3-4141-9122-0814d987cda3';
const RELEASE_GID = 'e384f062-85a3-4141-9122-0814d987cda3';
const FIXTURE = path.join(__dirname, 'release-tracks-brixton-night.html');
const RG_PAGE = path.join(__dirname, 'rg-page-berlin.html');
const LINK = 'p.subheader span.small > a[href^="/release-group/"]';
const json = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');
// A 1×1 PNG, so a cover the table asks for loads instead of being dropped.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

/**
 * A browse of 150 releases built from the real answer's first release: ids
 * and titles numbered, dates spread over the years with every 17th undated,
 * every third without a front cover, and release 42 the page's own. Answered
 * as the Web Service would, by `offset`: a first page of 90 (as if the
 * 500-track cap had cut it), then the rest, so a client that steps `offset`
 * by the limit (100) instead of by the releases returned misses ten.
 *
 * @param {number} offset
 * @returns {string} The JSON body.
 */
function twoPageBrowse(offset) {
    const real = JSON.parse(json('ws2-rg-release-browse.json'));
    const base = real.releases[0];
    const all = Array.from({ length: 150 }, (_, i) => Object.assign(JSON.parse(JSON.stringify(base)), {
        id: i === 42 ? RELEASE_GID : `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        title: `Release ${String(i).padStart(3, '0')}`,
        date: i % 17 === 0 ? '' : `${1970 + ((i * 7) % 50)}-0${1 + (i % 9)}-1${i % 10}`,
        'cover-art-archive': { artwork: i % 3 !== 0, count: i % 3 !== 0 ? 1 : 0, front: i % 3 !== 0, back: false, darkened: false },
    }));
    const size = offset === 0 ? 90 : 100;
    return JSON.stringify({ 'release-count': 150, 'release-offset': offset, releases: all.slice(offset, offset + size) });
}

/**
 * Loads Brixton Night with the Web Service routed and counted. `browse`
 * answers the release browse (default: the real five-release answer).
 *
 * @param {import('@playwright/test').Page} page
 * @param {{browse?: function(number): {status: number, body: string}, search?: function(string): {status: number, body: string},
 *          settings?: Object, showAll?: boolean}} [opts]
 * @returns {Promise<{browses: Array<{offset: number, at: number}>, lookups: string[], searches: string[], pages: string[]}>}
 */
async function open(page, { browse = null, search = null, settings = {}, showAll = true } = {}) {
    await page.context().route('https://static.metabrainz.org/**', (route) => route.abort('blockedbyclient'));
    await page.context().route('https://coverartarchive.org/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    const log = { browses: [], lookups: [], searches: [], pages: [] };
    await page.context().route('**/ws/2/release?release-group=**', (route) => {
        const offset = Number(new URL(route.request().url()).searchParams.get('offset') || 0);
        log.browses.push({ offset, at: Date.now() });
        const r = browse ? browse(offset) : { status: 200, body: json('ws2-rg-release-browse.json') };
        return route.fulfill({ status: r.status, contentType: 'application/json', body: r.body });
    });
    await page.context().route(/\/ws\/2\/release-group\/[0-9a-f-]{36}\?/, (route) => {
        log.lookups.push(route.request().url());
        return route.fulfill({ status: 200, contentType: 'application/json', body: json('ws2-rg-lookup.json') });
    });
    await page.context().route('**/ws/2/release-group?query=**', (route) => {
        const q = new URL(route.request().url()).searchParams.get('query');
        log.searches.push(q);
        const r = search ? search(q) : { status: 200, body: json('ws2-rg-search-none.json') };
        return route.fulfill({ status: r.status, contentType: 'application/json', body: r.body });
    });
    await page.context().route('https://musicbrainz.org/release-group/**', (route) => {
        log.pages.push(route.request().url());
        return route.fulfill({ path: RG_PAGE, contentType: 'text/html' });
    });
    await loadUserscriptPage(page, { url: RELEASE_URL, fixtureFile: FIXTURE, testMode: true, settingsOverride: { sa_rich_tooltip_delay_ms: 0, ...settings } });
    await page.route('https://musicbrainz.org/release/**', (route) => route.fulfill({ path: FIXTURE, contentType: 'text/html' }));
    if (showAll) {
        await page.click('button[data-label="Show all Tracks for Release"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const master = page.locator('.mb-master-toggle');
        if (await master.count() && (await master.getAttribute('data-state')) === 'collapsed') await master.click();
    }
    await page.mouse.move(0, 0);
    return log;
}

const card = (page) => page.locator('#mb-dp-peek');
const dialog = (page) => page.locator('#mb-dp-dialog');
/** The "#" cell of row `r` of table `t`. */
const hashCell = (page, t, r) => page.locator('table.tbl').nth(t).locator('tbody tr').nth(r).locator('td').first();
/** The window's release rows. */
const rows = (page) => dialog(page).locator('.mb-rg-wtable tbody tr');

/**
 * Hovers the subheader link with a plain pointer and pins its card.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function pinLink(page) {
    await page.locator(LINK).hover();
    await expect(card(page)).toBeVisible();
    await page.keyboard.press('Space');
    await expect(dialog(page)).toBeVisible();
}

test.describe('the release-group popup on the popup engine (org/iframe.org Phase 1)', () => {
    let pageErrors;

    test.beforeEach(({ page }) => {
        pageErrors = [];
        page.on('pageerror', (e) => pageErrors.push(String(e.stack || e.message)));
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('the subheader card: a plain hover, beside the link, one request', async ({ page }) => {
        const log = await open(page);
        const link = page.locator(LINK);
        await link.hover();
        await expect(card(page)).toBeVisible();
        await expect(card(page)).toContainText('Born Again', { timeout: 15000 });
        await expect(card(page)).toHaveClass(/mb-dp-wide/);
        const l = await link.boundingBox();
        const c = await card(page).boundingBox();
        expect(c.x >= l.x + l.width || c.x + c.width <= l.x || c.y >= l.y + l.height,
            'beside or below the link, never over it').toBe(true);
        expect(log.browses.map((b) => b.offset)).toEqual([0]);
        expect(log.lookups, 'the facts wait for the pin').toEqual([]);
    });

    test('the window: every release, paged by the releases returned, beside the facts', async ({ page }) => {
        const log = await open(page, { browse: (offset) => ({ status: 200, body: twoPageBrowse(offset) }) });
        await page.locator(LINK).hover();
        await expect(card(page)).toContainText('150 releases · showing 8', { timeout: 15000 });
        expect(log.browses.map((b) => b.offset), 'the card reads one page').toEqual([0]);
        await page.keyboard.press('Space');
        await expect(dialog(page).locator(':scope > div > span').first()).toHaveText('Release group');
        await expect(rows(page)).toHaveCount(150, { timeout: 20000 });
        expect(log.browses.map((b) => b.offset), 'offset grows by the 90 returned').toEqual([0, 90]);
        await expect(dialog(page)).toContainText('Album + Live');
        await expect(dialog(page)).toContainText('rock, rock and roll');
        await expect(dialog(page)).toContainText('no votes');
        await expect(dialog(page)).toContainText('Links (2)');
        expect(log.lookups).toHaveLength(1);
        expect(log.lookups[0]).toContain('inc=artist-credits+genres+ratings+url-rels+annotation');
    });

    test('the window: this release first and linked, covers only where the archive has a front', async ({ page }) => {
        await open(page, { browse: (offset) => ({ status: 200, body: twoPageBrowse(offset) }) });
        await pinLink(page);
        await expect(rows(page)).toHaveCount(150, { timeout: 20000 });
        const first = rows(page).first();
        await expect(first).toHaveClass(/mb-rg-cur/);
        await expect(first).toContainText('▸ Release 042');
        await expect(first.locator('a')).toHaveAttribute('href', `/release/${RELEASE_GID}`);
        await expect(first.locator('a')).toHaveAttribute('target', '_blank');
        // Every third release (0, 3, …, 147: 50 of them) has no front cover.
        await expect(dialog(page).locator('.mb-rg-thumb img')).toHaveCount(100);
    });

    test('the window sorts by a header, empty dates last both ways', async ({ page }) => {
        await open(page, { browse: (offset) => ({ status: 200, body: twoPageBrowse(offset) }) });
        await pinLink(page);
        await expect(rows(page)).toHaveCount(150, { timeout: 20000 });
        const dates = () => dialog(page).locator('.mb-rg-wtable tbody tr td:nth-child(5)').allTextContents();
        await dialog(page).locator('button[data-mb-rg-sort="date"]').click();
        let d = await dates();
        const dated = d.filter((x) => x !== '—');
        expect(dated).toEqual([...dated].sort());
        expect(d.slice(dated.length).every((x) => x === '—'), 'undated last').toBe(true);
        await dialog(page).locator('button[data-mb-rg-sort="date"]').click();
        d = await dates();
        expect(d.filter((x) => x !== '—')).toEqual([...dated].sort().reverse());
        expect(d[d.length - 1]).toBe('—');
        await expect(dialog(page).locator('th[aria-sort="descending"]')).toHaveText('Date');
    });

    test('⟳ asks MusicBrainz again for every page and the facts', async ({ page }) => {
        const log = await open(page, { browse: (offset) => ({ status: 200, body: twoPageBrowse(offset) }) });
        await pinLink(page);
        await expect(rows(page)).toHaveCount(150, { timeout: 20000 });
        // Only the lookup says this ("Album + Live" is in the page's own JSON
        // too): the facts have arrived, so ⟳ finds nothing in flight.
        await expect(dialog(page)).toContainText('no votes', { timeout: 20000 });
        await dialog(page).locator('button.mb-dp-tbtn', { hasText: '⟳' }).click();
        await expect.poll(() => log.browses.length, { timeout: 20000 }).toBe(4);
        await expect.poll(() => log.lookups.length, { timeout: 20000 }).toBe(2);
        await expect(rows(page)).toHaveCount(150, { timeout: 20000 });
    });

    test('kept a day: after a reload the card is answered from IndexedDB, with no request', async ({ page }) => {
        const log = await open(page, { showAll: false });
        await page.locator(LINK).hover();
        await expect(card(page)).toContainText('Born Again', { timeout: 15000 });
        expect(log.browses).toHaveLength(1);
        // A reload empties memory; the database still has the record. The
        // harness injects the userscript by hand, so it does again.
        await page.reload();
        await addRequiredLibs(page);
        await page.addScriptTag({ path: MB_LIBRARY_PATH });
        await page.addScriptTag({ path: USERSCRIPT_PATH });
        await expect(page.locator(`${LINK}[data-mb-rg-link]`)).toBeVisible({ timeout: 30000 });
        await page.mouse.move(0, 0);
        await page.locator(LINK).hover();
        await expect(card(page)).toContainText('Born Again', { timeout: 15000 });
        await expect(card(page)).toContainText('saved today');
        expect(log.browses, 'nothing asked again').toHaveLength(1);
    });

    test('one rate gate: the card\'s request waits behind slots another feature holds', async ({ page }) => {
        const log = await open(page, { showAll: false });
        const t0 = await page.evaluate(() => {
            window.__saTest.reserveMbRateSlots(3);
            return Date.now();
        });
        await page.locator(LINK).hover();
        await expect(card(page)).toContainText('Born Again', { timeout: 15000 });
        expect(log.browses).toHaveLength(1);
        // Three slots 1.1 s apart from t0: the browse gets the fourth, at t0 + 3.3 s.
        expect(log.browses[0].at - t0).toBeGreaterThanOrEqual(3000);
    });

    test('"#" cells: Space pins, ← → step down the column, the row mark follows', async ({ page }) => {
        await open(page);
        await page.keyboard.down('Control');
        await hashCell(page, 0, 0).hover();
        await page.keyboard.up('Control');
        await expect(card(page)).toContainText('main event');
        await page.keyboard.press('Space');
        await expect(dialog(page)).toBeVisible();
        const pos = dialog(page).locator('.mb-dp-pos-label');
        await expect(pos).toHaveText(/^1 \/ \d+$/);
        const total = Number((await pos.textContent()).split(' / ')[1]);
        expect(total).toBeGreaterThan(20);
        await expect(page.locator('table.tbl').nth(0).locator('tbody tr').nth(0)).toHaveClass(/mb-dp-current/);
        await page.keyboard.press('ArrowRight');
        await expect(pos).toHaveText(`2 / ${total}`);
        await expect(page.locator('table.tbl').nth(0).locator('tbody tr').nth(1)).toHaveClass(/mb-dp-current/);
        await expect(page.locator('table.tbl').nth(0).locator('tbody tr').nth(0)).not.toHaveClass(/mb-dp-current/);
    });

    test('"#" window of an event no release group is named like: the closest titles and the search, as links', async ({ page }) => {
        await open(page, { search: () => ({ status: 200, body: json('ws2-rg-search-terms.json') }) });
        await page.keyboard.down('Control');
        await hashCell(page, 2, 11).hover();
        await page.keyboard.up('Control');
        await expect(card(page)).toContainText('No release group is named like this event.', { timeout: 15000 });
        await page.keyboard.press('Space');
        await expect(dialog(page)).toContainText('Closest titles');
        await expect(dialog(page).locator('.mb-dp-col a[href^="/release-group/"]')).toHaveCount(5);
        await expect(dialog(page).locator('a[href^="/search?query="]')).toHaveText('Run it on musicbrainz.org ↗');
    });

    test('Live page: the release group page without its scripts, the site\'s header and footer hidden', async ({ page }) => {
        const log = await open(page, { showAll: false });
        await pinLink(page);
        await dialog(page).locator('button.mb-dp-tbtn', { hasText: 'Live page' }).click();
        const frameEl = dialog(page).locator('iframe');
        await expect(frameEl).toHaveAttribute('srcdoc', /id="page"/, { timeout: 15000 });
        expect(await frameEl.getAttribute('srcdoc')).not.toContain('<script');
        expect(log.pages).toEqual(['https://musicbrainz.org/release-group/499a96d4-f934-34a8-a9f7-0636ff42ba6b']);
        const frame = page.frameLocator('#mb-dp-dialog iframe');
        await expect(frame.locator('#content')).toBeVisible();
        await expect(frame.locator('#sidebar')).toBeVisible();
        await expect(frame.locator('.header')).toBeHidden();
        await expect(frame.locator('#footer')).toBeHidden();
    });
});
