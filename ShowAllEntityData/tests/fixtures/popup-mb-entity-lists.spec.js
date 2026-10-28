'use strict';

// Link previews of an entity's sidebar list links (2026-10-22):
//   PATH   /<kind>/<MBID>/subscribers (artist, label, series, collection only)
//          is the `subscribers` kind, /<kind>/<MBID>/collections (every
//          collectable kind, not a collection) the `collections` kind, both
//          with the id <kind>/<MBID>; an editor's subscribers are unchanged.
//   SUBS   the sidebar's "Subscribers": the entity's name, its kind, the
//          subscriber and anonymous counts, the artist's glyph (not the
//          editor's); the window links every subscriber, a click drills.
//   COLLS  the sidebar's "Found in N user collections": the page's total
//          (private ones included), the private count, the first eight
//          collections with their owners; the window lists every public
//          collection with its owner, both linked.
//   EDITOR an editor's subscribers (id = the name) keep the editor glyph.
//   EMPTY  "… has not been added to any collections.": a card that says so.
//
// Host: tests/fixtures/entity-artist-subscribers.html, whose sidebar holds
// the real snapshot's two links (scripts/make-entity-list-fixtures.py).

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');

const MBID = '70248960-cb53-4ea4-943a-edb18f7d336f';
const RELEASE = '52c6808b-037d-47d5-b0c7-17331c9d36cd';
const HOST_URL = `https://musicbrainz.org/artist/${MBID}/subscribers`;
const HOST = path.join(__dirname, 'entity-artist-subscribers.html');
const PAGES = [
    [new RegExp(`/artist/${MBID}/subscribers$`), 'entity-artist-subscribers.html'],
    [new RegExp(`/artist/${MBID}/collections$`), 'entity-artist-collections.html'],
    [new RegExp(`/release/${RELEASE}/collections$`), 'entity-release-collections-empty.html'],
    [/\/user\/vzell\/subscribers$/, 'subscribers-page-vzell.html'],
];
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16"/></svg>';
const card = (page) => page.locator('#mb-dp-peek');
const dialog = (page) => page.locator('#mb-dp-dialog');
const title = (page) => dialog(page).locator(':scope > div > span').first();

/**
 * Loads the host page with the MusicBrainz cards on and answers the list
 * pages from the fixtures, logging every page request after the host's own.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{html: string[]}>}
 */
async function open(page) {
    const log = { html: [] };
    const ctx = page.context();
    let hostServed = false;
    await ctx.route('**/static/images/entity/*.svg', (route) =>
        route.fulfill({ status: 200, contentType: 'image/svg+xml', body: SVG }));
    await ctx.route(/\/ws\/2\//, (route) => route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"no fixture"}' }));
    await ctx.route(/^https:\/\/musicbrainz\.org\/(artist|release|user|collection)\//, (route) => {
        const u = route.request().url();
        if (u === HOST_URL && !hostServed) {
            hostServed = true;
            return route.fulfill({ path: HOST, contentType: 'text/html' });
        }
        log.html.push(u.replace('https://musicbrainz.org', ''));
        const hit = (PAGES.find(([re]) => re.test(u)) || [])[1];
        if (!hit) return route.fulfill({ status: 404, contentType: 'text/html', body: '<html><body>no fixture</body></html>' });
        return route.fulfill({ path: path.join(__dirname, hit), contentType: 'text/html' });
    });
    await loadUserscriptPage(page, {
        url: HOST_URL, testMode: true,
        settingsOverride: { sa_rich_tooltip_delay_ms: 0, sa_pop_mb: true, sa_pop_mb_page: true },
    });
    await page.mouse.move(0, 0);
    return log;
}

/**
 * Hovers a link with Ctrl held and waits for its card.
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} el
 * @returns {Promise<void>}
 */
async function hover(page, el) {
    await page.mouse.move(0, 0);
    await el.scrollIntoViewIfNeeded();
    await page.keyboard.down('Control');
    await el.hover();
    await page.keyboard.up('Control');
    await expect(card(page)).toBeVisible();
}

let pageErrors;
test.beforeEach(({ page }) => {
    pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e.stack || e.message || '')));
});
test.afterEach(() => {
    expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
});

test.describe('MusicBrainz link previews: an entity\'s subscribers and collections', () => {
    test('PATH: subscribers of the four subscribable kinds, collections of every collectable kind; an editor\'s unchanged', async ({ page }) => {
        await open(page);
        const r = await page.evaluate(([mbid, rel]) => {
            const res = (href) => {
                const a = document.createElement('a');
                a.href = href;
                a.textContent = 'x';
                document.getElementById('sidebar').appendChild(a);
                return window.__saTest.popResolve(a);
            };
            return {
                artistSubs: res(`/artist/${mbid}/subscribers`), upper: res(`/label/${mbid.toUpperCase()}/subscribers`),
                collSubs: res(`/collection/${mbid}/subscribers`), relSubs: res(`/release/${rel}/subscribers`),
                artistColls: res(`/artist/${mbid}/collections`), rgColls: res(`/release-group/${mbid}/collections`),
                collColls: res(`/collection/${mbid}/collections`), editor: res('/user/vzell/subscribers'),
            };
        }, [MBID, RELEASE]);
        expect(r.artistSubs).toBe(`mb-entity|subscribers:artist/${MBID}`);
        expect(r.upper, 'the MBID lowercased').toBe(`mb-entity|subscribers:label/${MBID}`);
        expect(r.collSubs).toBe(`mb-entity|subscribers:collection/${MBID}`);
        expect(r.relSubs, 'a release cannot be subscribed to').toBeNull();
        expect(r.artistColls).toBe(`mb-entity|collections:artist/${MBID}`);
        expect(r.rgColls).toBe(`mb-entity|collections:release-group/${MBID}`);
        expect(r.collColls, 'a collection is in no collection').toBeNull();
        expect(r.editor).toBe('mb-entity|subscribers:vzell');
    });

    test('SUBS: the sidebar\'s "Subscribers": counts, names, the artist\'s glyph; the window links every subscriber', async ({ page }) => {
        const log = await open(page);
        await hover(page, page.locator(`#sidebar a[href="/artist/${MBID}/subscribers"]`));
        await expect(card(page).locator('.mb-tt-title')).toHaveText('Bruce Springsteen');
        await expect(card(page).locator('.mb-tt-comment')).toHaveText('Subscribers · artist');
        await expect(card(page).locator('.mb-tt-pill')).toHaveText(['37 subscribers', '9 anonymous']);
        await expect(card(page).locator('.mb-tt-dim')).toHaveText('+ 16 more');
        await expect(card(page).locator('img.mb-pop-kind-icon')).toHaveAttribute('src', /\/static\/images\/entity\/artist\.svg$/);
        await page.keyboard.press('Space');
        await expect(title(page)).toHaveText('Subscribers');
        await expect(dialog(page).locator('.mb-pop-taglist a')).toHaveCount(28);
        await expect(dialog(page).locator('.mb-dp-xsub').first()).toHaveText('MusicBrainz · artist · subscribers');
        await dialog(page).locator('.mb-pop-taglist a').first().click();
        // The path's steps read names by default (org/POH-headerline.org;
        // this spec loads without a fixture file, so with the schema's
        // default): the subscriber's name; the list, a view, its kind.
        await expect(title(page)).toHaveText('Subscribers › editor-1');
        await expect.poll(() => log.html).toEqual([`/artist/${MBID}/subscribers`, '/user/editor-1']);
    });

    test('COLLS: the sidebar\'s "Found in N user collections": total, private, the first eight; the window lists them all', async ({ page }) => {
        const log = await open(page);
        await hover(page, page.locator(`#sidebar a[href="/artist/${MBID}/collections"]`));
        await expect(card(page).locator('.mb-tt-title')).toHaveText('Bruce Springsteen');
        await expect(card(page).locator('.mb-tt-comment')).toHaveText('Collections · artist');
        await expect(card(page).locator('.mb-tt-pill')).toHaveText(['34 collections', '23 private']);
        await expect(card(page).locator('.mb-tt-body:not(.mb-rg-pills)')).toHaveCount(8);
        await expect(card(page).locator('.mb-tt-body:not(.mb-rg-pills)').first()).toHaveText('Artists by editor-1');
        await expect(card(page).locator('.mb-tt-dim')).toHaveText('+ 3 more');
        await expect(card(page).locator('img.mb-pop-kind-icon')).toHaveAttribute('src', /\/static\/images\/entity\/artist\.svg$/);
        await page.keyboard.press('Space');
        await expect(title(page)).toHaveText('Collections');
        const rows = dialog(page).locator('tbody tr');
        await expect(rows).toHaveCount(11);
        await expect(rows.first().locator('a').first()).toHaveAttribute('href', '/collection/f59dcdbc-9c9c-40a3-b885-f71825c3b953');
        await expect(rows.first().locator('a').nth(1)).toHaveAttribute('href', '/user/editor-1');
        expect(log.html).toEqual([`/artist/${MBID}/collections`]);
    });

    // Pins that an editor's subscribers keep the EDITOR glyph: their id is a
    // name, so "the entity's glyph from the id" must not apply to it.
    test('EDITOR: an editor\'s subscribers keep the editor glyph', async ({ page }) => {
        await open(page);
        await page.evaluate(() => {
            const el = document.createElement('a');
            el.href = '/user/vzell/subscribers';
            el.id = 'probe';
            el.textContent = 'view list';
            document.getElementById('sidebar').appendChild(el);
        });
        await hover(page, page.locator('#probe'));
        await expect(card(page).locator('.mb-tt-comment')).toHaveText('Subscribers · editor');
        await expect(card(page).locator('img.mb-pop-kind-icon')).toHaveAttribute('src', /\/static\/images\/entity\/editor\.svg$/);
    });

    test('EMPTY: an entity in no collection', async ({ page }) => {
        await open(page);
        const a = await page.evaluate((rel) => {
            const el = document.createElement('a');
            el.href = `/release/${rel}/collections`;
            el.id = 'probe';
            el.textContent = 'Collections';
            document.getElementById('sidebar').appendChild(el);
            return true;
        }, RELEASE);
        expect(a).toBe(true);
        await hover(page, page.locator('#probe'));
        await expect(card(page).locator('.mb-tt-title')).toHaveText('Tougher Than the Rest');
        await expect(card(page).locator('.mb-tt-pill')).toHaveText(['0 collections']);
        await expect(card(page).locator('.mb-tt-comment').last()).toHaveText('In no collection.');
    });
});
