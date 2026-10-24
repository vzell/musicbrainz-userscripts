'use strict';

// Touch (Pixel 7 emulation): the foreign tables' 🖼 gallery has no
// hover-only part. A tap on the 🖼 opens the window, a tap on an image opens
// the viewer, a tap outside the window closes it (org/foreign-images.org,
// phase 4).

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadSlListPage, SL_KINDS } = require('../support/slFixture');
const { routeDetailPages } = require('../support/detailFixture');
const { waitForRenderComplete } = require('../support/browser');
const { pressAction } = require('../support/toolbarMenu');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const ITEM_4554 = 'https://springsteenlyrics.com/bootlegs.php?item=4554&category=aud_live1967';

test('tap the 🖼: the window; tap an image: the viewer; tap outside: closed', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    await loadSlListPage(page, { kind: 'bootlegs', settingsOverride: { sa_render_threshold: 100000 } });
    const { served } = await routeDetailPages(page, 'sl');
    await page.route(/^https:\/\/springsteenlyrics\.com\/.*\.jpg$/, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    await pressAction(page, `button[data-label="${SL_KINDS.bootlegs.button}"]`, { tap: true });
    await waitForRenderComplete(page, { waitForAutoResize: false });
    const html = fs.readFileSync(path.join(__dirname, 'detail-sl-bootlegs-4554.html'), 'utf8');
    await page.evaluate(([h, u]) => new Promise((resolve, reject) => {
        const data = window.__saTest.dpParse('springsteenlyrics.com', h, u);
        const req = indexedDB.open('vz-saed-detail-pages', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('pages', { keyPath: 'url' });
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
            const tx = req.result.transaction('pages', 'readwrite');
            tx.objectStore('pages').put({ url: u, v: window.__saTest.dpParserVersion, at: Date.now(), data });
            tx.oncomplete = () => { req.result.close(); resolve(); };
            tx.onerror = () => reject(tx.error);
        };
    }), [html, ITEM_4554]);
    const btn = page.locator('button.mb-fgal-btn').first();
    // Centred: scrolled only "into view" it lands under the site's sticky
    // navbar of the zoomed-out phone layout.
    await btn.evaluate(b => b.scrollIntoView({ block: 'center' }));
    const box = await btn.boundingBox();
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    const gal = page.locator('#mb-fgal');
    await expect(gal).toBeVisible();
    const tile = gal.locator('figure.mb-fgal-tile').first();
    await expect(tile).toBeVisible();
    await tile.evaluate(t => t.scrollIntoView({ block: 'center' }));
    const tb = await tile.boundingBox();
    await page.touchscreen.tap(tb.x + tb.width / 2, tb.y + tb.height / 2);
    await expect(page.locator('#mb-art-viewer')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#mb-art-viewer')).toBeHidden();
    await expect(gal).toBeVisible();
    // A tap outside the window closes it.
    const out = page.locator('#mb-status-displays-wrapper');
    await out.evaluate(t => t.scrollIntoView({ block: 'center' }));
    const ob = await out.boundingBox();
    await page.touchscreen.tap(ob.x + 10, ob.y + ob.height / 2);
    await expect(gal).toHaveCount(0);
    expect(served).toEqual([]);
    expect(errors).toEqual([]);
});

// org/TODO.org "Some enhancements" 1 (2026-10-24): the title bar drags by
// touch too (pointer events, `touch-action: none` on the bar). Playwright
// has no touch drag, so the touches go in through CDP.
test('a touch drag on the title bar moves the window, and the place is remembered', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    await loadSlListPage(page, { kind: 'bootlegs', settingsOverride: { sa_render_threshold: 100000 } });
    await routeDetailPages(page, 'sl');
    await pressAction(page, `button[data-label="${SL_KINDS.bootlegs.button}"]`, { tap: true });
    await waitForRenderComplete(page, { waitForAutoResize: false });
    const btn = page.locator('button.mb-fgal-btn').first();
    await btn.evaluate(b => b.scrollIntoView({ block: 'center' }));
    const bb = await btn.boundingBox();
    await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
    const gal = page.locator('#mb-fgal');
    await expect(gal).toBeVisible();
    const title = gal.locator('.mb-fgal-head b');
    await title.evaluate(t => t.scrollIntoView({ block: 'center' }));
    // Playwright's box coordinates, which its own tap sends through the
    // same CDP call; the zoomed-out phone layout scales them.
    const tb = await title.boundingBox();
    const at = { x: tb.x + 8, y: tb.y + tb.height / 2 };
    const before = await gal.evaluate(el => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top) }; });
    const scale = await page.evaluate(() => (window.visualViewport ? window.visualViewport.scale : 1));
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    await touch('touchStart', at.x, at.y);
    for (let k = 1; k <= 6; k++) await touch('touchMove', at.x - 5 * k, at.y + 6 * k);
    await touch('touchEnd');
    const after = await gal.evaluate(el => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), pos: getComputedStyle(el).position }; });
    expect(after.pos).toBe('fixed');
    // 30 / 36 touch pixels, in CSS pixels of the scaled page.
    expect(Math.abs(after.x - Math.max(0, before.x - 30 / scale))).toBeLessThanOrEqual(2);
    expect(Math.abs(after.y - (before.y + 36 / scale))).toBeLessThanOrEqual(2);
    await expect.poll(() => page.evaluate(() => window.GM_getValue('sa_fgal_geometry', null))).toMatchObject({ top: after.y });
    await expect(gal, 'a drag on the bar is no tap outside').toBeVisible();
    expect(errors).toEqual([]);
});
