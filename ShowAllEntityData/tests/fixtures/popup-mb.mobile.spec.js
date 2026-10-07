'use strict';

// The MusicBrainz link previews on a touch screen (chromium-mobile: Pixel 7,
// touch, no hover). A tap has no hover to show a card on and no Ctrl to hold,
// so with `sa_pop_mb` on a tap on an entity link in a table opens the window
// instead of the page (the popup engine's tap rule, kept on MusicBrainz:
// org/iframe.org Phase 2); ↗ in the window opens the page. Desktop:
// popup-mb.spec.js.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');

const RG_URL = 'https://musicbrainz.org/release-group/c497fc44-ddaf-3cce-a9b4-bfec958a0f3c';
const FIXTURE = path.join(__dirname, 'releasegroup-releases-multirow-catalog.html');
const json = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');

test('a tap on a release link opens the release window, not the page, and shows no card', async ({ page }) => {
    const errors = [];
    const THIRD_PARTY = [/supported-browser-check/, /Unexpected token '<'/];
    page.on('pageerror', (e) => {
        const where = String(e.stack || e.message || e);
        if (!THIRD_PARTY.some((re) => re.test(where))) errors.push(where);
    });
    await page.context().route('https://static.metabrainz.org/**', (route) => route.abort('blockedbyclient'));
    await page.context().route('https://coverartarchive.org/**', (route) => route.fulfill({ status: 404, body: '' }));
    const lookups = [];
    await page.context().route(/\/ws\/2\/release\/[0-9a-f-]{36}\?/, (route) => {
        lookups.push(route.request().url());
        return route.fulfill({ status: 200, contentType: 'application/json', body: json('ws2-pop-release-greetings.json') });
    });
    await loadUserscriptPage(page, {
        url: RG_URL, fixtureFile: FIXTURE, testMode: true,
        settingsOverride: { sa_rich_tooltip_delay_ms: 0, sa_pop_mb: true },
    });
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

    const link = page.locator('table.tbl tbody td:first-child a[href^="/release/"]:not([href$="/cover-art"])').first();
    await link.scrollIntoViewIfNeeded();
    // Tap where the link is (see release-rg-popup.mobile.spec.js: on this
    // zoomed-out page Locator.tap() misses), once a finger there touches it.
    const box = await link.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    expect(await link.evaluate((a, [px, py]) => a.contains(document.elementFromPoint(
        px + visualViewport.offsetLeft, py + visualViewport.offsetTop)), [x, y])).toBe(true);
    await page.touchscreen.tap(x, y);

    const dialog = page.locator('#mb-dp-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(':scope > div > span').first()).toHaveText('Release');
    await expect(dialog.locator('.mb-pop-tracks li')).toHaveCount(9, { timeout: 20000 });
    expect(lookups).toHaveLength(1);
    expect(navigations, 'the page stays').toEqual([]);
    expect(page.context().pages()).toHaveLength(1);
    expect(shown).toEqual([]);
    expect(errors).toEqual([]);
});
