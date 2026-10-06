'use strict';

// pageType 'event-overview' (org/event-overview-pt.org, WIP.3): the "Event
// art (N)" section, the viewer and the tab click — the release page's Cover
// art section (P1–P4) driven by EAA_CTX through _artSectionDesc('eaa').
//
// Fixture: tests/fixtures/event-overview.html; record:
// tests/fixtures/eaa-event-3f2ca30a.json (eventartarchive.org, 2026-10-06 —
// probed with scripts/probe-caa-release-images.py --event): 15 images, types
// Poster/Merchandise/Schedule/Banner/Setlist/Ticket/Map, one front:true, no
// comments, NO "back" key at all, https URLs.
//
// What each test pins, and the neighbouring property it keeps apart:
//
//  1. NOTHING BEFORE THE BUTTON, ONE REQUEST AFTER; the section sits above the
//     tables, open, a tile per image in archive order, ★ only on front:true.
//     A section that loaded on page load would pass every later test.
//  2. THE EVENT'S OWN CHIPS AND LAYOUTS: Grid / By type only (Spreads is
//     release packaging), remembered under the EVENT key — the release
//     page's remembered layout is untouched. Sharing the key passes 1.
//  3. "NO IMAGES" AND "COULD NOT BE REACHED" NAME THE EVENT ART ARCHIVE; retry
//     asks again.
//  4. THE VIEWER: a tile opens it at that image with the event's title; the
//     info panel has no "Main back" line (the record has no such flag, so
//     "no" would be an invention).
//  5. THE TAB: a plain click opens the grid without the leave-page confirm;
//     Ctrl-click, and any click with the tab setting off, are not intercepted
//     (the navigation guard's confirm is what shows the click went its way).
//  6. THE SETTING OFF: no section, no request; the tables are unaffected.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const URL = 'https://musicbrainz.org/event/3f2ca30a-7de4-4964-ad30-48376535fec8';
const FIXTURE = path.join(__dirname, 'event-overview.html');
const RECORD = fs.readFileSync(path.join(__dirname, 'eaa-event-3f2ca30a.json'), 'utf8');
const META_RE = /^https:\/\/eventartarchive\.org\/event\/([0-9a-f-]{36})$/;
const CORS = { 'access-control-allow-origin': '*' };
const BUTTON = 'button[data-label="Show all Relationships for Event"]';
const TAB = 'ul.tabs a[href$="/event-art"]';
const TITLE = '2025‐05‐20: Co‐op Live, Manchester, England, UK';

/**
 * Loads the event fixture with the archive routed; `respond(hit)` decides each
 * record request (a status, or 200 with the record).
 *
 * @param {import('@playwright/test').Page} page
 * @param {{settings?: Object, respond?: function(number): ?number, press?: boolean}} [opts]
 * @returns {Promise<{hits: function(): number}>}
 */
async function openEvent(page, { settings = {}, respond = null, press = true } = {}) {
    let hits = 0;
    await page.context().route('https://static.metabrainz.org/**', (route) => route.abort('blockedbyclient'));
    await loadUserscriptPage(page, {
        url: URL, fixtureFile: FIXTURE, testMode: true,
        settingsOverride: {
            sa_enable_event_overview: true,
            sa_event_overview_event_art: true,
            sa_art_idb_enable: false,
            ...settings,
        },
    });
    await page.route('https://musicbrainz.org/event/**', (route) => route.fulfill({ path: FIXTURE, contentType: 'text/html' }));
    await page.route('https://eventartarchive.org/**', (route) => route.fulfill({ status: 404, headers: CORS, body: '' }));
    await page.route(META_RE, (route) => {
        hits += 1;
        const status = respond ? respond(hits) : 200;
        if (status !== 200) return route.fulfill({ status, headers: CORS, contentType: 'text/plain', body: '' });
        return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: RECORD });
    });
    if (press) {
        await page.click(BUTTON);
        await waitForRenderComplete(page, { waitForAutoResize: false });
    }
    return { hits: () => hits };
}

/**
 * Waits until the section has settled into `state`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} state
 */
const settled = (page, state) => page.locator(`.mb-release-art-sec[data-mb-art-state="${state}"]`)
    .waitFor({ state: 'attached', timeout: 15000 });

/**
 * The section as the user sees it.
 *
 * @param {import('@playwright/test').Page} page
 */
const sectionFacts = (page) => page.evaluate(() => {
    const h2 = document.querySelector('h2.mb-release-art-h2');
    const sec = document.querySelector('.mb-release-art-sec');
    if (!h2 || !sec) return null;
    return {
        h2Text: h2.textContent.replace(/^[▲▼]/, '').trim(),
        collapsible: h2.classList.contains('mb-toggle-h2'),
        open: sec.style.display !== 'none' && sec.offsetParent !== null,
        nextIsRelationships: !!(sec.nextElementSibling && sec.nextElementSibling.matches('h2.relationships')),
        ctx: sec.dataset.mbArtCtx,
        status: (sec.querySelector('.mb-release-art-status') || {}).textContent || null,
        tiles: Array.from(sec.querySelectorAll('figure.mb-release-art-tile')).map((t) => ({
            i: Number(t.dataset.mbArtI),
            types: t.querySelector('.mb-release-art-types').textContent,
            star: !!t.querySelector('.mb-release-art-star'),
            src: t.querySelector('img').getAttribute('src'),
        })),
        chips: Array.from(sec.querySelectorAll('.mb-release-art-chip')).map((c) => c.textContent.replace(/\s+/g, ' ').trim()),
        layouts: Array.from(sec.querySelectorAll('[data-mb-art-layout]')).map((b) => b.dataset.mbArtLayout),
    };
});

/**
 * The viewer as the user sees it.
 *
 * @param {import('@playwright/test').Page} page
 */
const viewer = (page) => page.evaluate(() => {
    const v = document.querySelector('#mb-art-viewer');
    if (!v || v.hidden) return { open: false };
    return {
        open: true,
        pos: (v.querySelector('.mb-artv-pos') || {}).textContent || null,
        title: (v.querySelector('.mb-artv-title') || {}).textContent || null,
        grid: !!v.querySelector('.mb-artv-grid'),
        info: (v.querySelector('.mb-artv-info') || {}).textContent || '',
    };
});

test.describe('pageType event-overview: the Event art section (WIP.3)', () => {
    test('only after the button, one request; above the tables, open, a tile per image, ★ on the main image', async ({ page }) => {
        const { hits } = await openEvent(page, { press: false });
        expect(await page.locator('.mb-release-art-sec').count()).toBe(0);
        expect(hits(), 'no archive request before the button').toBe(0);
        await page.click(BUTTON);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await settled(page, 'ok');
        const f = await sectionFacts(page);
        expect(f.ctx).toBe('eaa');
        expect(f.h2Text).toBe('Event art (15)');
        expect(f.collapsible).toBe(true);
        expect(f.open, 'starts uncollapsed').toBe(true);
        expect(f.nextIsRelationships, 'directly above the tables').toBe(true);
        expect(f.tiles.map((t) => t.i)).toEqual([...Array(15).keys()]);
        expect(f.tiles.slice(0, 3).map((t) => t.types)).toEqual(['Poster', 'Merchandise / Poster', 'Schedule / Poster']);
        expect(f.tiles.filter((t) => t.star).map((t) => t.i)).toEqual([0]);
        expect(f.tiles[0].src, 'https kept, 250 px thumbnail')
            .toBe('https://eventartarchive.org/event/3f2ca30a-7de4-4964-ad30-48376535fec8/42097088052-250.jpg');
        expect(hits()).toBe(1);
    });

    test('the event\'s own chips; Grid / By type only, remembered under the event key', async ({ page }) => {
        await openEvent(page);
        await settled(page, 'ok');
        let f = await sectionFacts(page);
        expect(f.chips).toEqual(['All 15', 'Poster 7', 'Merchandise 1', 'Schedule 9', 'Banner 3', 'Setlist 1', 'Ticket 2', 'Map 1']);
        expect(f.layouts).toEqual(['grid', 'grouped']);
        await page.click('.mb-release-art-sec [data-mb-art-filter="Schedule"]');
        expect((await sectionFacts(page)).tiles).toHaveLength(9);
        await page.click('.mb-release-art-sec [data-mb-art-layout="grouped"]');
        const keys = await page.evaluate(() => ({
            event: window.GM_getValue('mb_sa_event_art_layout', null),
            release: window.GM_getValue('mb_sa_release_art_layout', null),
        }));
        expect(keys).toEqual({ event: 'grouped', release: null });
        f = await sectionFacts(page);
        expect(f.layouts).toEqual(['grid', 'grouped']);
    });

    test('"no images" and "could not be reached" name the Event Art Archive; retry asks again', async ({ page }) => {
        await openEvent(page, { respond: () => 404 });
        await settled(page, 'none');
        expect((await sectionFacts(page)).status).toBe('The Event Art Archive has no images for this event.');

        const second = await page.context().newPage();
        const { hits } = await openEvent(second, { respond: (n) => (n === 1 ? 503 : 200) });
        await settled(second, 'failed');
        expect((await sectionFacts(second)).status).toMatch(/^The Event Art Archive could not be reached\./);
        await second.click('.mb-release-art-retry');
        await settled(second, 'ok');
        expect(hits()).toBe(2);
        await second.close();
    });

    test('a tile opens the viewer at that image with the event\'s title; no "Main back" line', async ({ page }) => {
        const { hits } = await openEvent(page);
        await settled(page, 'ok');
        await page.click('figure.mb-release-art-tile[data-mb-art-i="12"] > a');
        let v = await viewer(page);
        expect(v.open).toBe(true);
        expect(v.pos).toBe('13 / 15');
        expect(v.title).toBe(TITLE);
        expect(v.info).toContain('Ticket');
        expect(v.info).toContain('Main front');
        expect(v.info).not.toContain('Main back');
        await page.keyboard.press('ArrowRight');
        v = await viewer(page);
        expect(v.pos).toBe('14 / 15');
        await page.keyboard.press('Escape');
        expect((await viewer(page)).open).toBe(false);
        expect(hits(), 'the viewer makes no JSON request').toBe(1);
    });

    test('a plain click on the "Event art" tab opens the grid — no leave-page confirm', async ({ page }) => {
        await openEvent(page);
        await settled(page, 'ok');
        const dialogs = [];
        page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });
        await page.click(TAB);
        const v = await viewer(page);
        expect(v.open).toBe(true);
        expect(v.grid).toBe(true);
        expect(v.pos).toBe('15 images');
        expect(dialogs).toEqual([]);
        expect(page.url()).toBe(URL);
    });

    test('Ctrl-click, and a plain click with the tab setting off, are not intercepted', async ({ page }) => {
        await openEvent(page);
        await settled(page, 'ok');
        let dialogs = [];
        page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });
        await page.click(TAB, { modifiers: ['Control'] });
        await expect.poll(() => dialogs.length, 'the navigation guard saw the Ctrl-click').toBe(1);
        expect((await viewer(page)).open).toBe(false);

        const second = await page.context().newPage();
        await openEvent(second, { settings: { sa_event_overview_art_tab: false } });
        await settled(second, 'ok');
        dialogs = [];
        second.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });
        await second.click(TAB);
        await expect.poll(() => dialogs.length, 'the plain click went its way').toBe(1);
        expect((await viewer(second)).open).toBe(false);
        await second.close();
    });

    test('the setting off: no section, no request; the tables are unaffected', async ({ page }) => {
        const { hits } = await openEvent(page, { settings: { sa_event_overview_event_art: false } });
        expect(await page.locator('.mb-release-art-sec').count()).toBe(0);
        expect(hits()).toBe(0);
        expect(await page.locator('h3.mb-toggle-h3').count()).toBeGreaterThan(5);
    });
});
