'use strict';

// External link previews on a Springsteen site, on a touch screen
// (chromium-mobile: Pixel 7, touch, no hover; org/iframe.org U5). A tap on a
// link to another site in the site's text opens the window instead of
// following the link, as on MusicBrainz (popup-ext.mobile.spec.js). Desktop:
// popup-ext-foreign.spec.js. On touch the switch is `sa_pop_ext_on_touch`
// (`_popSettingOn()`, org/non-MB-sites.org), which replaces `sa_pop_ext` there.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadSlListPage } = require('../support/slFixture');

const BB_SONG = 'https://brucebase.wikidot.com/song:4th-of-july-asbury-park-sandy';

test('a tap on a link to Brucebase in springsteenlyrics.com\'s text opens Brucebase\'s card in the window, not the page', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    await page.context().addInitScript((r) => { window.__gmXhrResponses = r; }, {
        [BB_SONG]: {
            status: 200, responseHeaders: 'Content-Type: text/html; charset=utf-8',
            responseText: fs.readFileSync(path.join(__dirname, 'detail-bb-4th-of-july.html'), 'utf8'),
        },
    });
    await loadSlListPage(page, { kind: 'bootlegs', settingsOverride: { sa_pop_ext_on_touch: true, sa_rich_tooltip_delay_ms: 0 } });
    await page.evaluate((h) => {
        const a = document.createElement('a');
        a.setAttribute('href', h);
        a.className = 'u5-probe';
        a.textContent = '4th Of July, Asbury Park (Sandy) on Brucebase';
        a.style.cssText = 'display:inline-block;padding:12px;font-size:20px';
        const host = document.querySelector('.project-detail');
        host.insertBefore(a, host.firstChild);
    }, BB_SONG);
    const navigations = [];
    page.on('framenavigated', (f) => { if (f === page.mainFrame()) navigations.push(f.url()); });

    const link = page.locator('a.u5-probe');
    await link.scrollIntoViewIfNeeded();
    // Tap where the link is, once a finger there touches it (on a zoomed-out
    // page Locator.tap() can miss: release-rg-popup.mobile.spec.js).
    const box = await link.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    expect(await link.evaluate((a, [px, py]) => a.contains(document.elementFromPoint(
        px + visualViewport.offsetLeft, py + visualViewport.offsetTop)), [x, y])).toBe(true);
    await page.touchscreen.tap(x, y);

    const dialog = page.locator('#mb-dp-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('4th Of July, Asbury Park (Sandy)');
    expect(navigations, 'the page stays').toEqual([]);
    expect(page.context().pages()).toHaveLength(1);
    expect(errors).toEqual([]);
});
