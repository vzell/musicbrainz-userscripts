'use strict';

// The external link previews on a touch screen (chromium-mobile: Pixel 7,
// touch, no hover). A tap has no hover to show a card on and no Ctrl to
// hold, so with the previews on a tap on a link to another site opens the
// window instead of the page (the popup engine's tap rule). A tap is an
// explicit act, so it may make the first request to a host the script never
// reached (org/iframe.org answer 7), anonymously. Desktop: popup-ext.spec.js.
// U2: with the entity previews on, a tap on the "[info]" link beside a URL
// opens the URL's window the same way.
//
// On a touch-primary device the switches are the `_on_touch` twins
// (`_popSettingOn()`, org/non-MB-sites.org): `sa_pop_ext_on_touch` and
// `sa_pop_mb_on_touch` REPLACE `sa_pop_ext` and `sa_pop_mb` there, and are off
// by default, so a phone keeps its ordinary links. The tests below seed the
// twins only, with the plain keys left off by the fixture override.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const URL_EVENT = 'https://musicbrainz.org/event/3f2ca30a-7de4-4964-ad30-48376535fec8';
const FIXTURE = path.join(__dirname, 'event-overview.html');
const SETLIST = 'https://www.setlist.fm/setlist/bruce-springsteen/2025/co-op-live-manchester-england-43535b97.html';
const SETLIST_URL_ID = '2e9887a2-ec25-4423-9f10-eee13f180512';
const SETLIST_HTML = '<!doctype html><html><head><title>Concert Setlist | setlist.fm</title>' +
    '<meta property="og:title" content="Bruce Springsteen Setlist at Co-op Live, Manchester"></head><body></body></html>';

/**
 * Loads the event page with `settings`, the setlist.fm page as the one
 * `GM_xmlhttpRequest` answer and the URL entity's capture as the Web
 * Service's (U2), presses "Show all" and opens the "URLs" sub-table. Watches
 * for navigations, the card and page errors.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} settings
 * @returns {Promise<{errors: string[], navigations: string[], shown: number[], ws2: string[]}>}
 */
async function openEvent(page, settings) {
    const seen = { errors: [], navigations: [], shown: [], ws2: [] };
    const THIRD_PARTY = [/supported-browser-check/, /Unexpected token '<'/];
    page.on('pageerror', (e) => {
        const where = String(e.stack || e.message || e);
        if (!THIRD_PARTY.some((re) => re.test(where))) seen.errors.push(where);
    });
    const ctx = page.context();
    await ctx.route('https://static.metabrainz.org/**', (route) => route.abort('blockedbyclient'));
    await ctx.route('https://eventartarchive.org/**', (route) => route.fulfill({ status: 404, body: '' }));
    await ctx.route(/\/ws\/2\/url[/?]/, (route) => {
        seen.ws2.push(route.request().url());
        return route.fulfill({ status: 200, contentType: 'application/json',
            body: fs.readFileSync(path.join(__dirname, 'ws2-pop-url-setlist.json'), 'utf8') });
    });
    await ctx.addInitScript((r) => { window.__gmXhrResponses = r; }, {
        [SETLIST]: { status: 200, responseHeaders: 'Content-Type: text/html; charset=utf-8', responseText: SETLIST_HTML },
    });
    await loadUserscriptPage(page, {
        url: URL_EVENT, fixtureFile: FIXTURE, testMode: true,
        settingsOverride: { sa_enable_event_overview: true, sa_event_overview_setlist: false, sa_rich_tooltip_delay_ms: 0, ...settings },
    });
    await page.route('https://musicbrainz.org/event/**', (route) => route.fulfill({ path: FIXTURE, contentType: 'text/html' }));
    await page.click('button[data-label="Show all Relationships for Event"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
    // The "URLs" sub-table renders collapsed: open it by its own h3.
    await page.evaluate((u) => {
        const t = document.querySelector(`table.tbl a[href="${u}"]`).closest('table.tbl');
        if (t.getClientRects().length) return;
        let h = t.previousElementSibling;
        while (h && !h.matches('h3.mb-toggle-h3')) h = h.previousElementSibling;
        h.click();
    }, SETLIST);

    page.on('framenavigated', (f) => { if (f === page.mainFrame()) seen.navigations.push(f.url()); });
    await page.exposeFunction('__popPeekShown', () => seen.shown.push(Date.now()));
    await page.evaluate(() => {
        new MutationObserver(() => {
            const p = document.getElementById('mb-dp-peek');
            if (p && p.style.display === 'block') window.__popPeekShown();
        }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
    });
    return seen;
}

/**
 * Taps the middle of a link, once a finger there touches it (on this
 * zoomed-out page Locator.tap() misses: release-rg-popup.mobile.spec.js).
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

test('a tap on a link to another site opens its window, not the page, and shows no card', async ({ page }) => {
    const seen = await openEvent(page, { sa_pop_ext_on_touch: true });
    await tapLink(page, page.locator(`table.tbl a[href="${SETLIST}"]`).first());

    const dialog = page.locator('#mb-dp-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(':scope > div > span').first()).toHaveText('Web page');
    await expect(dialog).toContainText('Bruce Springsteen Setlist at Co-op Live, Manchester');
    const calls = await page.evaluate((u) => (window.__gmXhrLog || []).filter(r => r.url === u).map(r => r.anonymous), SETLIST);
    expect(calls, 'one anonymous request').toEqual([true]);
    // U2: the window (a tap is a pin) asks what MusicBrainz knows of the URL.
    await expect(dialog).toContainText('MusicBrainz knows this URL');
    expect(seen.navigations, 'the page stays').toEqual([]);
    expect(page.context().pages()).toHaveLength(1);
    expect(seen.shown).toEqual([]);
    expect(seen.errors).toEqual([]);
});

test('a tap on an "[info]" link opens the URL\'s window, not MusicBrainz\'s page for it (U2)', async ({ page }) => {
    const seen = await openEvent(page, { sa_pop_mb_on_touch: true });
    await tapLink(page, page.locator(`table.tbl a[href="/url/${SETLIST_URL_ID}"]`).first());

    const dialog = page.locator('#mb-dp-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(':scope > div > span').first()).toHaveText('URL');
    await expect(dialog).toContainText('Linked from · 1');
    expect(seen.ws2).toHaveLength(1);
    expect(seen.navigations, 'the page stays').toEqual([]);
    expect(page.context().pages()).toHaveLength(1);
    expect(seen.shown).toEqual([]);
    expect(seen.errors).toEqual([]);
});

test('with the touch twin at its default, a tap on a link to another site is not the engine\'s, even with sa_pop_ext on', async ({ page }) => {
    // Whether the page then opens is not asserted: in this emulation the tap
    // on this table link dispatches touchstart, touchend and mousedown but
    // no click, with every preview off as well (checked 2026-10-08), so no
    // navigation follows either way. What is pinned is that the engine,
    // which DOES get a click here when it is on (the first test), stays out.
    const seen = await openEvent(page, { sa_pop_ext: true, sa_pop_ext_on_touch: undefined });
    await tapLink(page, page.locator(`table.tbl a[href="${SETLIST}"]`).first());
    // A tap's compatibility events are dispatched by the time tap() resolves,
    // and the engine opens its window synchronously in its click handler:
    // two frames later it would be there.
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    expect(await page.locator('#mb-dp-style, #mb-dp-peek, #mb-dp-dialog').count()).toBe(0);
    const calls = await page.evaluate((u) => (window.__gmXhrLog || []).filter(r => r.url === u).length, SETLIST);
    expect(calls, 'no preview request').toBe(0);
    expect(seen.shown).toEqual([]);
    expect(seen.errors).toEqual([]);
});
