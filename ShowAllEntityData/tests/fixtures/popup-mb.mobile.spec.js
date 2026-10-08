'use strict';

// The MusicBrainz link previews on a touch screen (chromium-mobile: Pixel 7,
// touch, no hover). A tap has no hover to show a card on and no Ctrl to hold,
// so with the previews on a tap on an entity link in a table opens the window
// instead of the page (the popup engine's tap rule, kept on MusicBrainz:
// org/iframe.org Phase 2); ↗ in the window opens the page. Desktop:
// popup-mb.spec.js.
//
// On a touch-primary device the switches are the `_on_touch` twins
// (`_popSettingOn()`, org/non-MB-sites.org): `sa_pop_mb_on_touch` and
// `sa_pop_mb_page_on_touch` REPLACE `sa_pop_mb` and `sa_pop_mb_page` there,
// and are off by default, so a phone keeps its ordinary links. Pinned here:
//   - twin on, plain key off → the tap opens the window (replaces, not gates);
//   - plain key on, twin at its default → the tap opens the page;
//   - the page-wide scope follows `sa_pop_mb_page_on_touch`, not the plain key.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');

const RG_URL = 'https://musicbrainz.org/release-group/c497fc44-ddaf-3cce-a9b4-bfec958a0f3c';
const FIXTURE = path.join(__dirname, 'releasegroup-releases-multirow-catalog.html');
const json = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');
const RELEASE_LINK = 'table.tbl tbody td:first-child a[href^="/release/"]:not([href$="/cover-art"])';
const ARTIST_LINK = 'p.subheader a[href^="/artist/"]';

let errors;
test.beforeEach(({ page }) => {
    errors = [];
    const THIRD_PARTY = [/supported-browser-check/, /Unexpected token '<'/];
    page.on('pageerror', (e) => {
        const where = String(e.stack || e.message || e);
        if (!THIRD_PARTY.some((re) => re.test(where))) errors.push(where);
    });
});
test.afterEach(() => {
    expect(errors).toEqual([]);
});

/**
 * Loads the release-group page on the emulated phone with `settings` on top
 * of the fixture defaults, answers the Web Service and the pages a tap may
 * open, and logs lookups, main-frame navigations and shown cards.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object<string, *>} settings
 * @returns {Promise<{lookups: string[], navigations: string[], shown: number[]}>}
 */
async function openPhone(page, settings) {
    const log = { lookups: [], navigations: [], shown: [] };
    await page.context().route('https://static.metabrainz.org/**', (route) => route.abort('blockedbyclient'));
    await page.context().route('https://coverartarchive.org/**', (route) => route.fulfill({ status: 404, body: '' }));
    await page.context().route(/\/ws\/2\/release\/[0-9a-f-]{36}\?/, (route) => {
        log.lookups.push(route.request().url());
        return route.fulfill({ status: 200, contentType: 'application/json', body: json('ws2-pop-release-greetings.json') });
    });
    await page.context().route(/\/ws\/2\/artist\/[0-9a-f-]{36}\?/, (route) => {
        log.lookups.push(route.request().url());
        return route.fulfill({ status: 200, contentType: 'application/json', body: json('ws2-pop-artist-bruce.json') });
    });
    // A tap that opens the page lands here instead of on musicbrainz.org.
    await page.context().route(/^https:\/\/musicbrainz\.org\/(release|artist)\//, (route) => route.fulfill({
        status: 200, contentType: 'text/html', body: '<html><body>opened</body></html>',
    }));
    await loadUserscriptPage(page, {
        url: RG_URL, fixtureFile: FIXTURE, testMode: true,
        settingsOverride: { sa_rich_tooltip_delay_ms: 0, ...settings },
    });
    page.on('framenavigated', (f) => { if (f === page.mainFrame()) log.navigations.push(f.url()); });
    await page.exposeFunction('__popPeekShown', () => log.shown.push(Date.now()));
    await page.evaluate(() => {
        new MutationObserver(() => {
            const p = document.getElementById('mb-dp-peek');
            if (p && p.style.display === 'block') window.__popPeekShown();
        }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
    });
    return log;
}

/**
 * Taps the middle of `link` with a finger, after checking that a finger
 * there really touches it (see release-rg-popup.mobile.spec.js: on this
 * zoomed-out page Locator.tap() misses).
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} link
 * @returns {Promise<void>}
 */
async function tapLink(page, link) {
    await link.scrollIntoViewIfNeeded();
    const box = await link.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    expect(await link.evaluate((a, [px, py]) => a.contains(document.elementFromPoint(
        px + visualViewport.offsetLeft, py + visualViewport.offsetTop)), [x, y])).toBe(true);
    await page.touchscreen.tap(x, y);
}

test('a tap on a release link opens the release window, not the page, and shows no card', async ({ page }) => {
    // The twin on and the plain key OFF: the twin replaces it on touch.
    const log = await openPhone(page, { sa_pop_mb: false, sa_pop_mb_on_touch: true });
    await tapLink(page, page.locator(RELEASE_LINK).first());

    const dialog = page.locator('#mb-dp-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(':scope > div > span').first()).toHaveText('Release');
    await expect(dialog.locator('.mb-pop-tracks li')).toHaveCount(9, { timeout: 20000 });
    expect(log.lookups).toHaveLength(1);
    expect(log.navigations, 'the page stays').toEqual([]);
    expect(page.context().pages()).toHaveLength(1);
    expect(log.shown).toEqual([]);
});

test('with the touch twin at its default, a tap opens the page even though the desktop switch is on', async ({ page }) => {
    const log = await openPhone(page, { sa_pop_mb: true, sa_pop_mb_on_touch: undefined });
    const link = page.locator(RELEASE_LINK).first();
    const href = await link.evaluate((a) => a.href);
    await tapLink(page, link);
    await expect.poll(() => log.navigations, { message: 'the tap opened the page' }).toContain(href);
    expect(log.lookups).toEqual([]);
    expect(log.shown).toEqual([]);
});

test('outside the tables, the tap follows sa_pop_mb_page_on_touch, not sa_pop_mb_page', async ({ page }) => {
    // The desktop scope switch on, the touch one off: the subheader's artist
    // link is outside the touch scope, so the tap opens its page.
    const log = await openPhone(page, { sa_pop_mb_on_touch: true, sa_pop_mb_page: true });
    const link = page.locator(ARTIST_LINK).first();
    const href = await link.evaluate((a) => a.href);
    await tapLink(page, link);
    await expect.poll(() => log.navigations, { message: 'the tap opened the page' }).toContain(href);
    expect(log.lookups).toEqual([]);
});

test('with sa_pop_mb_page_on_touch on, a tap on a link outside the tables opens the window', async ({ page }) => {
    const log = await openPhone(page, { sa_pop_mb_on_touch: true, sa_pop_mb_page: false, sa_pop_mb_page_on_touch: true });
    await tapLink(page, page.locator(ARTIST_LINK).first());
    const dialog = page.locator('#mb-dp-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Bruce Springsteen');
    expect(log.navigations, 'the page stays').toEqual([]);
    expect(log.shown).toEqual([]);
});
