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
