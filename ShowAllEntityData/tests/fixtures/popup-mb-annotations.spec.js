'use strict';

// Link previews for an entity's annotation history and its versions
// (2026-10-21): the annotation's "View annotation history" shows a card on
// hover and a window on Space; a version's "View this version" (and the
// current one, "View current revision") likewise.
//
// Pins, each named in its test (the uppercase tag is the mutation list's grep):
//   PATH     /<kind>/<MBID>/annotations is the `annotations` kind,
//            /<kind>/<MBID>/annotation[/<n>] the `annotation` kind, for every
//            annotated entity kind, the MBID lowercased; NOT edit_annotation,
//            NOT annotations-differences;
//   HISTORY  the release page's own link: the entity, how many versions, the
//            latest's date, editor and text; the window lists every version,
//            newest first, each linked so a click drills into it;
//   VERSION  an old version (told from the current one by the page JSON's
//            ids: logged out, both lines read "Annotation last modified on
//            …"): its date, editor, how many versions, its text; the window
//            links the history and the current version;
//   CURRENT  the current one: its date, and its editor from the page JSON
//            (the line names none); a heading of the text is a heading in
//            the window;
//   LOGIN    logged out, the history page is a login page: the card says the
//            page needs a logged-in editor;
//   SAFE     the annotation is copied as text: markup in it (an <img> with an
//            onerror) never reaches the card or the window, and never runs.
//
// Fixtures (2026-10-21, scripts/fetch-mb-page-fixture.js): the history of
// release 3ec14d03-… logged in (`--auth`: logged out the page never loads),
// release-annotations-history.html; version 810603 and the current version
// logged out, release-annotation-{version,current}.html. The host page is
// release-tracks-sidebar-search-links.html (another release: the cards
// answer by path, whatever the release). Mutation list:
// scripts/mutations/popup-annotations.json.

const path = require('path');
const fs = require('fs');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');

const MBID = '6336b8db-ac72-4afa-a954-94b437b49abc';
const URL = `https://musicbrainz.org/release/${MBID}`;
const FIXTURE = path.join(__dirname, 'release-tracks-sidebar-search-links.html');
const PAGES = [
    [/\/annotations$/, 'release-annotations-history.html'],
    [/\/annotation\/\d+$/, 'release-annotation-version.html'],
    [/\/annotation$/, 'release-annotation-current.html'],
];
const card = (page) => page.locator('#mb-dp-peek');
const dialog = (page) => page.locator('#mb-dp-dialog');
const title = (page) => dialog(page).locator(':scope > div > span').first();

/**
 * Loads the release page with the MusicBrainz cards on and answers the
 * annotation pages from the fixtures, logging every one asked.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{pageFixture?: function(string): ?Object}} [opts] - May answer a
 *   page instead of `PAGES` (a route.fulfill() object).
 * @returns {Promise<{html: string[]}>}
 */
async function open(page, { pageFixture = null } = {}) {
    const log = { html: [] };
    const ctx = page.context();
    await ctx.route('https://static.metabrainz.org/**', (route) => route.abort('blockedbyclient'));
    await ctx.route(/\/ws\/2\//, (route) => route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"no fixture"}' }));
    await ctx.route(/^https:\/\/musicbrainz\.org\/[a-z-]+\/[0-9a-f-]{36}\/annotations?(\/\d+)?$/, (route) => {
        const u = route.request().url();
        log.html.push(u.replace('https://musicbrainz.org', ''));
        const own = pageFixture ? pageFixture(u) : null;
        if (own) return route.fulfill(own);
        const hit = (PAGES.find(([re]) => re.test(u)) || [])[1];
        if (!hit) return route.fulfill({ status: 404, contentType: 'text/html', body: '<html><body>no fixture</body></html>' });
        return route.fulfill({ path: path.join(__dirname, hit), contentType: 'text/html' });
    });
    await loadUserscriptPage(page, {
        url: URL, fixtureFile: FIXTURE, testMode: true,
        settingsOverride: { sa_rich_tooltip_delay_ms: 0, sa_pop_mb: true, sa_pop_mb_page: true },
    });
    await page.mouse.move(0, 0);
    return log;
}

/**
 * Adds a link to the annotation's own line ("View annotation history | Edit
 * annotation"), where the release page carries its links.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} href
 * @param {string} text
 * @returns {Promise<import('@playwright/test').Locator>}
 */
async function addLink(page, href, text) {
    const n = await page.evaluate(([h, x]) => {
        const where = document.querySelector('.annotation-details');
        const a = document.createElement('a');
        a.href = h;
        a.className = 'pop-probe';
        a.dataset.probe = String(document.querySelectorAll('a.pop-probe').length);
        a.textContent = x;
        where.append(' ', a);
        return a.dataset.probe;
    }, [href, text]);
    return page.locator(`a.pop-probe[data-probe="${n}"]`);
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
    const THIRD_PARTY = [/supported-browser-check/, /Unexpected token '<'/];
    page.on('pageerror', (e) => {
        const where = String(e.stack || e.message || '');
        if (!THIRD_PARTY.some((re) => re.test(where))) pageErrors.push(where);
    });
});
test.afterEach(() => {
    expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
});

test.describe('MusicBrainz link previews: an annotation\'s history and versions', () => {
    test('PATH: annotations and annotation[/n] of every annotated kind; not edit_annotation, not the differences', async ({ page }) => {
        await open(page);
        const r = await page.evaluate((mbid) => {
            const where = document.querySelector('.annotation-details');
            const res = (href) => {
                const a = document.createElement('a');
                a.href = href;
                a.textContent = 'view';
                where.appendChild(a);
                return window.__saTest.popResolve(a);
            };
            return {
                hist: res(`/release/${mbid}/annotations`), ver: res(`/release/${mbid}/annotation/810603`),
                cur: res(`/release/${mbid}/annotation`), upper: res(`/artist/${mbid.toUpperCase()}/annotations/`),
                work: res(`/work/${mbid}/annotation/7`), edit: res(`/release/${mbid}/edit_annotation`),
                diff: res(`/release/${mbid}/annotations-differences?old=1&new=2`), url: res(`/url/${mbid}/annotations`),
            };
        }, MBID);
        expect(r.hist).toBe(`mb-entity|annotations:release/${MBID}`);
        expect(r.ver).toBe(`mb-entity|annotation:release/${MBID}/810603`);
        expect(r.cur).toBe(`mb-entity|annotation:release/${MBID}`);
        expect(r.upper, 'the MBID lowercased').toBe(`mb-entity|annotations:artist/${MBID}`);
        expect(r.work).toBe(`mb-entity|annotation:work/${MBID}/7`);
        expect(r.edit, 'the edit form is never a target').toBeNull();
        expect(r.diff, 'a comparison is not the history').toBeNull();
        expect(r.url, 'a URL has no annotation').toBeNull();
    });

    test('HISTORY: the release page\'s own link: card, then every version in the window; a version drills', async ({ page }) => {
        const log = await open(page);
        const link = page.locator('.annotation-details a[href$="/annotations"]');
        await expect(link).toHaveCount(1);
        await hover(page, link);
        await expect(card(page).locator('.mb-tt-title')).toHaveText('Tunnel of Love Express I: Tougher Than the Rest');
        await expect(card(page).locator('.mb-tt-comment').first()).toHaveText('Annotation history · release');
        await expect(card(page).locator('.mb-tt-pill')).toHaveText(['3 versions', 'latest 2022-11-08 22:48 GMT+1']);
        await expect(card(page)).toContainText('Latest byvzell');
        await expect(card(page)).toContainText('Comes in a 6x3‐inch snap‐pack');
        await page.keyboard.press('Space');
        await expect(title(page)).toHaveText('Annotation history');
        const rows = dialog(page).locator('table.mb-rg-wtable tbody tr');
        await expect(rows).toHaveCount(3);
        await expect(rows.locator('td:first-child')).toHaveText(['Version 3', 'Version 2', 'Version 1']);
        await expect(rows.first().locator('td')).toHaveText(['Version 3', 'vzell', '2022-11-08 22:48 GMT+1', 'none']);
        await expect(dialog(page).locator('h4', { hasText: 'Barcode and Other Identifiers' }), 'the latest text, its heading a heading').toHaveCount(1);
        await rows.nth(1).locator('a', { hasText: 'Version 2' }).click();
        await expect(title(page)).toHaveText('Annotation history › Annotation version');
        await expect.poll(() => log.html).toEqual([`/release/${MBID}/annotations`, `/release/${MBID}/annotation/810603`]);
    });

    test('VERSION: an old version: date, editor, versions, text; the window links the history and the current one', async ({ page }) => {
        await open(page);
        await hover(page, await addLink(page, `/release/${MBID}/annotation/810603`, 'View this version'));
        await expect(card(page).locator('.mb-tt-comment').first()).toHaveText('Annotation · an old version');
        await expect(card(page).locator('.mb-tt-pill')).toHaveText(['2020-03-24 08:51 UTC', 'by vzell', '3 versions']);
        await expect(card(page)).toContainText('Shrinkwrapped with a sticker reading "Welcome Back To Japan - Bruce Returns".');
        await page.keyboard.press('Space');
        await expect(title(page)).toHaveText('Annotation version');
        await expect(dialog(page).locator('.mb-dp-xsub').first()).toHaveText('MusicBrainz · release · annotation');
        await expect(dialog(page).locator(`a[href="/release/${MBID}/annotations"]`)).toHaveText('Annotation history');
        await expect(dialog(page).locator(`a[href="/release/${MBID}/annotation"]`)).toHaveText('The current version');
    });

    test('CURRENT: the current version: its date and editor; a heading of the text is a heading', async ({ page }) => {
        await open(page);
        await hover(page, await addLink(page, `/release/${MBID}/annotation`, 'View current revision'));
        await expect(card(page).locator('.mb-tt-comment').first()).toHaveText('Annotation · the current version');
        await expect(card(page).locator('.mb-tt-pill'), 'logged out the line names no editor; the page JSON does')
            .toHaveText(['2022-11-08 21:48 UTC', 'by vzell', '3 versions']);
        await page.keyboard.press('Space');
        await expect(title(page)).toHaveText('Annotation');
        await expect(dialog(page).locator('h4')).toContainText(['Annotation', 'Barcode and Other Identifiers']);
        await expect(dialog(page).locator('p', { hasText: 'Barcode (Scanned): 4988009005058' })).toHaveCount(1);
        await expect(dialog(page).locator('a', { hasText: 'The current version' })).toHaveCount(0);
    });

    test('LOGIN: logged out, the history is a login page: the card says so', async ({ page }) => {
        await open(page, {
            pageFixture: (u) => (u.endsWith('/annotations') ? { status: 200, contentType: 'text/html',
                body: '<html><body><div id="page"><div id="content"><h1>Log in</h1></div></div></body></html>' } : null),
        });
        await hover(page, page.locator('.annotation-details a[href$="/annotations"]'));
        await expect(card(page).locator('.mb-tt-alert')).toContainText('MusicBrainz shows an annotation history only to a logged-in editor.');
    });

    test('SAFE: markup in an annotation is copied as text and never runs', async ({ page }) => {
        const body = fs.readFileSync(path.join(__dirname, 'release-annotation-version.html'), 'utf8')
            .replace('<div class="annotation-body"><p><bdi>',
                '<div class="annotation-body"><p><bdi><img src="x:" onerror="window.__pwned = 1">Planted <b>bold</b> ');
        await open(page, { pageFixture: (u) => (/\/annotation\/\d+$/.test(u) ? { status: 200, contentType: 'text/html', body } : null) });
        await hover(page, await addLink(page, `/release/${MBID}/annotation/810603`, 'View this version'));
        await expect(card(page)).toContainText('Planted bold Comes in a 6x3-inch');
        await page.keyboard.press('Space');
        await expect(dialog(page)).toContainText('Planted bold Comes in a 6x3-inch');
        const planted = 'img[onerror], img[src="x:"], b:has-text("bold"), bdi';
        expect(await card(page).locator(planted).count(), 'no markup of the annotation in the card').toBe(0);
        expect(await dialog(page).locator(planted).count(), 'no markup of the annotation in the window').toBe(0);
        expect(await page.evaluate(() => window.__pwned), 'nothing ran').toBeUndefined();
    });
});
