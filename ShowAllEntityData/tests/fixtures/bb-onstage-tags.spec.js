'use strict';

// The tags kept on other pages (org/springsteen-marriage.org, Phase 1;
// mockup https://claude.ai/artifact/18teQxyrom93rWw5mvY98D, version 2).
// Brucebase allows 512 characters of tags per page: a show's cast is tagged
// on its /onstage: page, and a full page continues on "-2", "-3" (the name
// cut to 60 characters first). Fixtures: three real shows and their onstage
// pages from the 2026-11-13 mirror (scripts/build-bb-event-fixtures.py).
//
// Pinned, with the expected tags counted HERE from the fixture files (not
// from what the script rendered):
//  - the head's Tags card shows the union of the show's tags and its other
//    pages' tags, each extra one dashed (`.mb-cbx-x`), once;
//  - WHICH pages are asked, in order: the show's own "-2" only when its
//    tags are nearly full (Pittsburgh, 508 chars), the onstage page, its
//    next page only while the one before is nearly full (MSG: -2, -3, not
//    -4), "-1" when the onstage page itself is missing (Waldorf);
//  - the setting off: no request, only the page's own tags;
//  - a failure: Done with errors, Retry reads it again;
//  - the tool row: Show, the filter keeps and MARKS, Group by Page, Z–A,
//    and the remembered Group by/sort;
//  - the window on musicbrainz.org: Space reads the onstage page, a hover
//    does not.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadBbEventPage, BB_EVENT_PAGES, BB_EVENT_BUTTON } = require('../support/bbFixture');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const FX = (name) => path.join(__dirname, name);
const BB = 'https://brucebase.wikidot.com/';
/** The setting back on: FIXTURE_SETTINGS_OVERRIDE switches it off for every other spec. */
const ON = { sa_bb_onstage_tags: true };
/** The onstage pages the wiki has, by name: fixture file. */
const ONSTAGE = {
    'onstage:2016-01-16-consol-energy-center-pittsburgh-pa': 'bb-onstage-2016-01-16.html',
    'onstage:2009-05-03-madison-square-garden-new-york-city-ny': 'bb-onstage-2009-05-03.html',
    'onstage:2009-05-03-madison-square-garden-new-york-city-ny-2': 'bb-onstage-2009-05-03-2.html',
    'onstage:2009-05-03-madison-square-garden-new-york-city-ny-3': 'bb-onstage-2009-05-03-3.html',
    'onstage:1990-01-17-waldorf-astoria-hotel-new-york-city-ny-1': 'bb-onstage-1990-01-17-1.html',
    'onstage:1990-01-17-waldorf-astoria-hotel-new-york-city-ny-2': 'bb-onstage-1990-01-17-2.html',
};

/**
 * A fixture page's tags, read with a regex (not the script).
 * @param {string} file
 * @returns {string[]}
 */
function tagsOf(file) {
    const html = fs.readFileSync(file, 'utf8');
    const box = (html.match(/<div class="page-tags">([\s\S]*?)<\/div>/) || [])[1] || '';
    return Array.from(box.matchAll(/<a href="\/system:page-tags\/tag\/[^"#]*#pages">([^<]*)<\/a>/g), m => m[1].trim()).filter(Boolean);
}

/**
 * The show's tags and the extra ones its pages add (union, case-blind).
 * @param {string} key A BB_EVENT_PAGES key.
 * @param {string[]} pages Onstage page names, in reading order.
 * @returns {{own: number, extra: number}}
 */
function expected(key, pages) {
    const own = tagsOf(BB_EVENT_PAGES[key].file);
    const seen = new Set(own.map(t => t.toLowerCase()));
    let extra = 0;
    pages.forEach((p) => tagsOf(FX(ONSTAGE[p])).forEach((t) => {
        if (!seen.has(t.toLowerCase())) { seen.add(t.toLowerCase()); extra++; }
    }));
    return { own: own.length, extra };
}

/**
 * Answers the wiki's pages for their tags (`<name>/noredirect/true`): a
 * fixture, a 404 for a page the wiki does not have, or `fail` (500).
 * Records every name asked, in order.
 * @param {import('@playwright/test').Page} page
 * @param {{fail?: string[]}} [opts]
 * @returns {Promise<string[]>}
 */
async function routeTagPages(page, { fail = [] } = {}) {
    const asked = [];
    await page.route(/^https:\/\/brucebase\.wikidot\.com\/[a-z]+:[^/]+\/noredirect\/true$/, (route) => {
        const name = decodeURIComponent(new URL(route.request().url()).pathname.slice(1).replace(/\/noredirect\/true$/, ''));
        asked.push(name);
        if (fail.includes(name)) return route.fulfill({ status: 500, contentType: 'text/html', body: 'boom' });
        const f = ONSTAGE[name];
        return f ? route.fulfill({ path: FX(f), contentType: 'text/html; charset=utf-8' })
            : route.fulfill({ status: 404, contentType: 'text/html', body: '<html><body>The page does not exist.</body></html>' });
    });
    return asked;
}

/**
 * Waits out one slot of the request gate, so a request that should not be
 * made would have been made by now.
 * @param {import('@playwright/test').Page} page
 * @param {number} ms
 * @returns {Promise<void>}
 */
const quiet = (page, ms) => page.evaluate(t => new Promise(r => setTimeout(r, t)), ms);

/**
 * The show's tags and its onstage page's extra ones, Z–A (the order the
 * box must show), read from the fixtures.
 * @returns {{all: string[], extra: string[]}}
 */
function pittsburghZtoA() {
    const own = tagsOf(BB_EVENT_PAGES['gig-2016-01-16'].file);
    const seen = new Set(own.map(t => t.toLowerCase()));
    const extra = tagsOf(FX(ONSTAGE['onstage:2016-01-16-consol-energy-center-pittsburgh-pa'])).filter(t => !seen.has(t.toLowerCase()));
    const desc = (a, b) => b.localeCompare(a, undefined, { sensitivity: 'base' });
    return { all: own.concat(extra).sort(desc), extra: extra.slice().sort(desc) };
}

const tagsCard = (page) => page.locator('section.mb-sb-card').filter({ has: page.locator(':scope > .mb-sb-card-head', { hasText: /^Tags/ }) });

/**
 * Presses the event page's button.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function showEvent(page) {
    await page.click(`button[data-label="${BB_EVENT_BUTTON}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

let pageErrors;
test.beforeEach(({ page }) => {
    pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e.stack || e.message || e)));
});
test.afterEach(() => {
    expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
});

test.describe('bb tags kept on other pages: the head\'s Tags card', () => {
    test.describe.configure({ timeout: 30000 });

    test('Pittsburgh 2016: its own -2 is asked (508 chars) and missing, then the onstage page; 11 cast tags join, dashed', async ({ page }) => {
        await loadBbEventPage(page, 'gig-2016-01-16', { settingsOverride: ON });
        const asked = await routeTagPages(page);
        await showEvent(page);
        const want = expected('gig-2016-01-16', ['onstage:2016-01-16-consol-energy-center-pittsburgh-pa']);
        expect(want.extra).toBe(11);
        const card = tagsCard(page);
        await expect(card.locator('.mb-sb-chip.mb-cbx-x')).toHaveCount(want.extra);
        await expect(card.locator('.mb-sb-chip')).toHaveCount(want.own + want.extra);
        await expect(card.locator(':scope > .mb-sb-card-head .mb-sb-card-count')).toHaveText(String(want.own + want.extra));
        await expect(card.locator('.mb-cbx-foot')).toContainText('onstage:2016-01-16-consol-energy-center-pittsburgh-pa');
        await expect(card.locator('.mb-cbx-foot')).toContainText('11 tags');
        expect(asked).toEqual(['gig:2016-01-16-consol-energy-center-pittsburgh-pa-2', 'onstage:2016-01-16-consol-energy-center-pittsburgh-pa']);
        // A cast tag is a person (the SHOW's /relation: links classify it).
        await expect(card.locator('.mb-sb-chip-row', { hasText: 'People' }).locator('.mb-sb-chip.mb-cbx-x', { hasText: 'garrytallent' })).toHaveCount(1);
    });

    test('MSG 2009: three onstage pages (-2, -3) and no -4; the show\'s own -2 is not asked (224 chars)', async ({ page }) => {
        await loadBbEventPage(page, 'gig-2009-05-03', { settingsOverride: ON });
        const asked = await routeTagPages(page);
        await showEvent(page);
        const names = ['onstage:2009-05-03-madison-square-garden-new-york-city-ny',
            'onstage:2009-05-03-madison-square-garden-new-york-city-ny-2',
            'onstage:2009-05-03-madison-square-garden-new-york-city-ny-3'];
        const want = expected('gig-2009-05-03', names);
        await expect(tagsCard(page).locator('.mb-sb-chip.mb-cbx-x')).toHaveCount(want.extra);
        await expect(tagsCard(page).locator('.mb-sb-chip')).toHaveCount(want.own + want.extra);
        expect(asked).toEqual(names);
    });

    test('Waldorf 1990: the onstage page is missing, so -1 is read, then -2 (-1 is 496 chars)', async ({ page }) => {
        await loadBbEventPage(page, 'gig-1990-01-17', { settingsOverride: ON });
        const asked = await routeTagPages(page);
        await showEvent(page);
        const names = ['onstage:1990-01-17-waldorf-astoria-hotel-new-york-city-ny-1', 'onstage:1990-01-17-waldorf-astoria-hotel-new-york-city-ny-2'];
        const want = expected('gig-1990-01-17', names);
        await expect(tagsCard(page).locator('.mb-sb-chip.mb-cbx-x')).toHaveCount(want.extra);
        expect(asked).toEqual(['onstage:1990-01-17-waldorf-astoria-hotel-new-york-city-ny'].concat(names));
    });

    test('the setting off: no tag page is asked, only the page\'s own tags', async ({ page }) => {
        await loadBbEventPage(page, 'gig-2016-01-16', { settingsOverride: { sa_bb_onstage_tags: false } });
        const asked = await routeTagPages(page);
        await showEvent(page);
        const want = expected('gig-2016-01-16', []);
        await expect(tagsCard(page).locator('.mb-sb-chip')).toHaveCount(want.own);
        await quiet(page, 1500);
        expect(asked).toEqual([]);
        await expect(tagsCard(page).locator('.mb-sb-chip.mb-cbx-x')).toHaveCount(0);
    });

    test('a page that fails: the error with Retry; Retry reads it and its tags join', async ({ page }) => {
        await loadBbEventPage(page, 'gig-2016-01-16', { settingsOverride: ON });
        const failing = ['onstage:2016-01-16-consol-energy-center-pittsburgh-pa'];
        const asked = await routeTagPages(page, { fail: failing });
        await showEvent(page);
        const card = tagsCard(page);
        await expect(card.locator('.mb-cbx-err')).toContainText('Could not read');
        await expect(card.locator('.mb-cbx-seg.mb-cbx-bad')).toHaveCount(1);
        await expect(card.locator('.mb-sb-chip.mb-cbx-x')).toHaveCount(0);
        failing.length = 0;
        await card.locator('button.mb-cbx-retry').click();
        await expect(card.locator('.mb-sb-chip.mb-cbx-x')).toHaveCount(11);
        await expect(card.locator('.mb-cbx-err')).toHaveCount(0);
        expect(asked.filter(n => /^onstage:/.test(n))).toHaveLength(2);
    });
});

test.describe('chip boxes: the tool row', () => {
    test.describe.configure({ timeout: 30000 });

    test('Show, the filter (keeps and marks), Group by Page, Z–A; Group by and the sort are remembered', async ({ page }) => {
        await loadBbEventPage(page, 'gig-2016-01-16', { settingsOverride: ON });
        await routeTagPages(page);
        await showEvent(page);
        const card = tagsCard(page);
        await expect(card.locator('.mb-sb-chip.mb-cbx-x')).toHaveCount(11);
        const want = expected('gig-2016-01-16', ['onstage:2016-01-16-consol-energy-center-pittsburgh-pa']);

        // Show: this page only, then the other pages only.
        await card.locator('button.mb-cbx-b[data-mb-cbx-k="show"][data-mb-cbx-v="own"]').click();
        await expect(card.locator('.mb-sb-chip.mb-cbx-x')).toHaveCount(0);
        await expect(card.locator('.mb-sb-chip')).toHaveCount(want.own);
        await card.locator('button.mb-cbx-b[data-mb-cbx-k="show"][data-mb-cbx-v="extra"]').click();
        await expect(card.locator('.mb-sb-chip')).toHaveCount(11);
        await card.locator('button.mb-cbx-b[data-mb-cbx-k="show"][data-mb-cbx-v="all"]').click();

        // The filter keeps the chips that contain the text, marks it, and says how many are left.
        const q = card.locator('input.mb-cbx-q');
        await q.fill('an');
        const names = (await card.locator('.mb-sb-chip a').allTextContents());
        expect(names.length).toBeGreaterThan(0);
        names.forEach(n => expect(n.toLowerCase()).toContain('an'));
        const all = tagsOf(BB_EVENT_PAGES['gig-2016-01-16'].file).concat(tagsOf(FX(ONSTAGE['onstage:2016-01-16-consol-energy-center-pittsburgh-pa'])));
        const wantN = new Set(all.map(t => t.toLowerCase()).filter(t => t.includes('an'))).size;
        expect(names).toHaveLength(wantN);
        await expect(card.locator('.mb-sb-chip a .mb-column-filter-highlight, .mb-sb-chip a mark').first()).toHaveText(/an/i);
        await expect(card.locator('.mb-cbx-cnt')).toHaveText(`${wantN} of ${want.own + want.extra}`);
        await expect(q).toBeFocused();
        await q.press('Escape');
        await expect(q).toHaveValue('');
        await expect(card.locator('.mb-sb-chip')).toHaveCount(want.own + want.extra);

        // Group by Page: this page, then the On stage page.
        await card.locator('button.mb-cbx-b[data-mb-cbx-k="group"][data-mb-cbx-v="page"]').click();
        await expect(card.locator('.mb-sb-chip-kind')).toHaveText(['This page', 'On stage']);
        expect(await card.locator('.mb-sb-chip-kind').evaluateAll(ks => ks.map(k => k.dataset.mbCbxN))).toEqual([String(want.own), '11']);
        // Z–A inside the group.
        await card.locator('button.mb-cbx-b[data-mb-cbx-k="dir"][data-mb-cbx-v="-1"]').click();
        await expect(card.locator('.mb-sb-chip-row').nth(1).locator('.mb-sb-chip a')).toHaveText(pittsburghZtoA().extra);
        expect(await page.evaluate(() => window.GM_getValue('mb_sa_fd_chip_view', null))).toEqual({ 'bb-tags': { group: 'page', dir: -1 } });
    });

    test('a remembered Group by and sort are the next page\'s start', async ({ page }) => {
        await loadBbEventPage(page, 'gig-2016-01-16', { settingsOverride: { ...ON, mb_sa_fd_chip_view: { 'bb-tags': { group: 'none', dir: -1 } } } });
        await routeTagPages(page);
        await showEvent(page);
        const card = tagsCard(page);
        await expect(card.locator('.mb-sb-chip.mb-cbx-x')).toHaveCount(11);
        await expect(card.locator('.mb-sb-chip-kind')).toHaveText([/^All/]);
        await expect(card.locator('button.mb-cbx-b[data-mb-cbx-k="dir"][data-mb-cbx-v="-1"]')).toHaveAttribute('aria-pressed', 'true');
        await expect(card.locator('.mb-sb-chip a')).toHaveText(pittsburghZtoA().all);
    });
});

test.describe('bb tags kept on other pages: the window on musicbrainz.org', () => {
    test.describe.configure({ timeout: 30000 });
    const GIG = `${BB}gig:2016-01-16-consol-energy-center-pittsburgh-pa`;
    const ONS = `${BB}onstage:2016-01-16-consol-energy-center-pittsburgh-pa/noredirect/true`;

    test('a hover reads the show only; Space reads its onstage page, and the Tags section counts the cast', async ({ page }) => {
        const gigHtml = fs.readFileSync(BB_EVENT_PAGES['gig-2016-01-16'].file, 'utf8');
        const onsHtml = fs.readFileSync(FX(ONSTAGE['onstage:2016-01-16-consol-energy-center-pittsburgh-pa']), 'utf8');
        await page.context().addInitScript(({ gig, gigHtml, ons, onsHtml }) => {
            window.__gmAsked = [];
            window.__gmXhrResponder = (opts) => {
                window.__gmAsked.push(opts.url);
                if (opts.url === gig) return { status: 200, finalUrl: gig, responseHeaders: 'Content-Type: text/html; charset=utf-8', responseText: gigHtml };
                if (opts.url === ons) return { status: 200, finalUrl: ons, responseHeaders: 'Content-Type: text/html; charset=utf-8', responseText: onsHtml };
                return { status: 404, responseHeaders: 'Content-Type: text/html', responseText: 'The page does not exist.' };
            };
        }, { gig: GIG, gigHtml, ons: ONS, onsHtml });
        const ctx = page.context();
        await ctx.route(/^https?:\/\/(?:[^/]+\.)?(?:wikidot\.com|wdfiles\.com)\//, (route) => route.abort('blockedbyclient'));
        await ctx.route(/\/ws\/2\//, (route) => route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"Not Found"}' }));
        await ctx.route('https://static.metabrainz.org/**', (route) => route.abort('blockedbyclient'));
        await ctx.route('https://eventartarchive.org/**', (route) => route.fulfill({ status: 404, body: '' }));
        await loadUserscriptPage(page, {
            url: 'https://musicbrainz.org/event/3f2ca30a-7de4-4964-ad30-48376535fec8', fixtureFile: FX('event-overview.html'), testMode: true,
            settingsOverride: { ...ON, sa_enable_event_overview: true, sa_event_overview_setlist: false, sa_pop_ext: true, sa_rich_tooltip_delay_ms: 0, sa_pop_ext_favicons: false },
        });
        await page.evaluate((h) => {
            const host = document.querySelector('.annotation .annotation-body') || document.querySelector('.annotation');
            const a = document.createElement('a');
            a.className = 'p1-probe';
            a.setAttribute('href', h);
            a.textContent = 'Pittsburgh 2016';
            host.insertBefore(a, host.firstChild);
        }, GIG);
        const link = page.locator('a.p1-probe');
        await page.mouse.move(0, 0);
        await link.scrollIntoViewIfNeeded();
        await page.keyboard.down('Control');
        await link.hover();
        await page.keyboard.up('Control');
        await expect(page.locator('#mb-dp-peek')).toContainText('Consol Energy Center', { timeout: 10000 });
        await quiet(page, 1300);
        expect(await page.evaluate(() => window.__gmAsked.filter(u => /noredirect/.test(u))), 'a hover reads no tag page').toEqual([]);

        await page.keyboard.press('Space');
        const sec = page.locator('#mb-dp-dialog details.mb-dp-sec[data-mb-dp-sec="Tags"]');
        const want = expected('gig-2016-01-16', ['onstage:2016-01-16-consol-energy-center-pittsburgh-pa']);
        await expect(sec.locator(':scope > summary h4')).toHaveText(`Tags (${want.own + want.extra})`, { timeout: 10000 });
        await sec.locator(':scope > summary').click();
        await expect(sec.locator('a.mb-dp-tag.mb-cbx-x')).toHaveCount(want.extra);
        expect(await page.evaluate(() => window.__gmAsked.filter(u => /noredirect/.test(u)))).toEqual([
            'https://brucebase.wikidot.com/gig:2016-01-16-consol-energy-center-pittsburgh-pa-2/noredirect/true', ONS]);
    });
});
