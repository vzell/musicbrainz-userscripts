'use strict';

// The external link previews on a touch screen (chromium-mobile: Pixel 7,
// touch, no hover). A tap has no hover to show a card on and no Ctrl to
// hold, so with `sa_pop_ext` on a tap on a link to another site opens the
// window instead of the page (the popup engine's tap rule). A tap is an
// explicit act, so it may make the first request to a host the script never
// reached (org/iframe.org answer 7), anonymously. Desktop: popup-ext.spec.js.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const URL_EVENT = 'https://musicbrainz.org/event/3f2ca30a-7de4-4964-ad30-48376535fec8';
const FIXTURE = path.join(__dirname, 'event-overview.html');
const SETLIST = 'https://www.setlist.fm/setlist/bruce-springsteen/2025/co-op-live-manchester-england-43535b97.html';
const SETLIST_HTML = '<!doctype html><html><head><title>Concert Setlist | setlist.fm</title>' +
    '<meta property="og:title" content="Bruce Springsteen Setlist at Co-op Live, Manchester"></head><body></body></html>';

test('a tap on a link to another site opens its window, not the page, and shows no card', async ({ page }) => {
    const errors = [];
    const THIRD_PARTY = [/supported-browser-check/, /Unexpected token '<'/];
    page.on('pageerror', (e) => {
        const where = String(e.stack || e.message || e);
        if (!THIRD_PARTY.some((re) => re.test(where))) errors.push(where);
    });
    const ctx = page.context();
    await ctx.route('https://static.metabrainz.org/**', (route) => route.abort('blockedbyclient'));
    await ctx.route('https://eventartarchive.org/**', (route) => route.fulfill({ status: 404, body: '' }));
    await ctx.addInitScript((r) => { window.__gmXhrResponses = r; }, {
        [SETLIST]: { status: 200, responseHeaders: 'Content-Type: text/html; charset=utf-8', responseText: SETLIST_HTML },
    });
    await loadUserscriptPage(page, {
        url: URL_EVENT, fixtureFile: FIXTURE, testMode: true,
        settingsOverride: { sa_enable_event_overview: true, sa_event_overview_setlist: false, sa_rich_tooltip_delay_ms: 0, sa_pop_ext: true },
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

    const navigations = [];
    page.on('framenavigated', (f) => { if (f === page.mainFrame()) navigations.push(f.url()); });
    const shown = [];
    await page.exposeFunction('__popPeekShown', () => shown.push(Date.now()));
    await page.evaluate(() => {
        new MutationObserver(() => {
            const p = document.getElementById('mb-dp-peek');
            if (p && p.style.display === 'block') window.__popPeekShown();
        }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
    });

    const link = page.locator(`table.tbl a[href="${SETLIST}"]`).first();
    await link.scrollIntoViewIfNeeded();
    // Tap where the link is (on this zoomed-out page Locator.tap() misses:
    // release-rg-popup.mobile.spec.js), once a finger there touches it.
    const box = await link.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    expect(await link.evaluate((a, [px, py]) => a.contains(document.elementFromPoint(
        px + visualViewport.offsetLeft, py + visualViewport.offsetTop)), [x, y])).toBe(true);
    await page.touchscreen.tap(x, y);

    const dialog = page.locator('#mb-dp-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(':scope > div > span').first()).toHaveText('Web page');
    await expect(dialog).toContainText('Bruce Springsteen Setlist at Co-op Live, Manchester');
    const calls = await page.evaluate((u) => (window.__gmXhrLog || []).filter(r => r.url === u).map(r => r.anonymous), SETLIST);
    expect(calls, 'one anonymous request').toEqual([true]);
    expect(navigations, 'the page stays').toEqual([]);
    expect(page.context().pages()).toHaveLength(1);
    expect(shown).toEqual([]);
    expect(errors).toEqual([]);
});
