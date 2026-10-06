'use strict';

// release-tracks Cover art section on a touch device (chromium-mobile: Pixel 7
// emulation, touch, no hover). P2 of org/CAA-release-tracks-handling.org.
//
// The tile's hover card is `data-mbtt`, shown by the shared tooltip engine,
// whose `_isTouchCompatMouseEvent()` guard skips the compatibility mouseover a
// tap fires. The property pinned is "a tap never SHOWS the card" — observed
// with a MutationObserver that keeps every intermediate style value, as in
// touch-tooltip.mobile.spec.js, because "hidden afterwards" cannot tell a
// guarded handler from one that showed and hid it within the same tap.
// Control: a real mouse hover in the same context still shows it.
//
// The tap lands on the caption: a tap on the thumbnail opens the viewer
// (P3), which the second test covers — tap to open, swipe to step.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const URL = 'https://musicbrainz.org/release/a9a3b139-cf22-4d28-801e-3f3d49521d0e';
const FIXTURE = path.join(__dirname, 'release-tracks-medley.html');
const RECORD = fs.readFileSync(path.join(__dirname, 'caa-release-d0adda7e.json'), 'utf8');
const META_RE = /^https:\/\/coverartarchive\.org\/release\/([0-9a-f-]{36})$/;
const CORS = { 'access-control-allow-origin': '*' };
const TILE = 'figure.mb-release-art-tile[data-mb-art-i="5"] figcaption';

/**
 * Records, on `window.__everShown`, every listed tooltip displayed at any
 * moment from now on (see touch-tooltip.mobile.spec.js's watchShown()).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string[]} ids
 */
const watchShown = (page, ids) => page.evaluate((tipIds) => {
    window.__everShown = [];
    const shown = (el) => el && el.style.display && el.style.display !== 'none';
    const note = (id) => { if (!window.__everShown.includes(id)) window.__everShown.push(id); };
    new MutationObserver((records) => {
        records.forEach((r) => {
            const id = r.target && r.target.id;
            if (r.type === 'attributes' && tipIds.includes(id)
                && /display:\s*(?!none\b)[a-z]/.test(r.oldValue || '')) note(id);
        });
        tipIds.forEach((id) => { if (shown(document.getElementById(id))) note(id); });
    }).observe(document.body, {
        subtree: true, childList: true, attributes: true, attributeFilter: ['style'], attributeOldValue: true,
    });
}, ids);

/**
 * Loads the medley fixture with the archive routed and waits for the sheet.
 *
 * @param {import('@playwright/test').Page} page
 */
async function openRelease(page) {
    await loadUserscriptPage(page, {
        url: URL, fixtureFile: FIXTURE, testMode: true,
        settingsOverride: {
            sa_enable_release_tracks: true,
            sa_enable_release_tracks_cover_art: true,
            sa_art_idb_enable: false,
        },
    });
    await page.route('https://coverartarchive.org/**',
        (route) => route.fulfill({ status: 404, headers: CORS, body: '' }));
    await page.route(META_RE, (route) => route.fulfill({
        status: 200, headers: CORS, contentType: 'application/json', body: RECORD,
    }));
    await page.locator('button[data-label="Show all Tracks for Release"]').evaluate((b) => b.click());
    await waitForRenderComplete(page, { waitForAutoResize: false });
    await page.locator('.mb-release-art-sec[data-mb-art-state="ok"]').waitFor({ state: 'attached', timeout: 15000 });
}

test.describe('release-tracks Cover art section on a touch device', () => {
    test('tapping a tile shows no hover card; a mouse hover still does', async ({ page }) => {
        await openRelease(page);

        // The tracklist's container is far wider than the window on this page
        // (measured 8418 px): without a cap the sheet laid all 16 tiles out as
        // one row the user had to scroll sideways through.
        const fit = await page.evaluate(() => ({
            sec: document.querySelector('.mb-release-art-sec').getBoundingClientRect().width,
            parent: document.querySelector('.mb-release-art-sec').parentElement.getBoundingClientRect().width,
            win: window.innerWidth,
        }));
        expect(fit.parent, 'premise: the container is wider than the window').toBeGreaterThan(fit.win);
        expect(fit.sec, 'the sheet fits the window').toBeLessThanOrEqual(fit.win);

        const tile = page.locator(TILE);
        await tile.scrollIntoViewIfNeeded();
        await page.evaluate((sel) => {
            window.__seen = {};
            ['pointerdown', 'mouseover'].forEach((t) => document.addEventListener(t, (e) => {
                if (e.target instanceof Element && e.target.closest(sel)) window.__seen[t] = true;
            }, true));
        }, TILE);
        await watchShown(page, ['mb-stat-tooltip']);

        await tile.tap();
        // A data-mbtt card is shown synchronously inside the mouseover
        // handler (no delay, unlike data-mb-tip), so once the tap's
        // compatibility mouseover has fired, any show has already happened.
        await expect.poll(() => page.evaluate(() => !!(window.__seen && window.__seen.mouseover))).toBe(true);
        const seen = await page.evaluate(() => window.__seen);
        expect(seen.pointerdown, 'premise: the tap reached the tile as a touch').toBe(true);
        expect(seen.mouseover, 'premise: the tap fired a compatibility mouseover').toBe(true);
        expect(await page.evaluate(() => window.__everShown), 'tooltips the tap showed').toEqual([]);

        // Control: a real mouse in the same context still gets the card —
        // once _isTouchCompatMouseEvent()'s 800 ms window has passed, which
        // toPass() waits out by retrying rather than by a fixed sleep.
        const vp = page.viewportSize();
        const box = await tile.boundingBox();
        await expect(async () => {
            await page.mouse.move(vp.width - 2, vp.height - 2);
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
            await expect(page.locator('#mb-stat-tooltip')).toBeVisible({ timeout: 200 });
        }).toPass({ timeout: 10000 });
        await expect(page.locator('#mb-stat-tooltip')).toContainText('6 of 16');
    });

    test('tapping a thumbnail opens the viewer; a horizontal swipe steps', async ({ page }) => {
        await openRelease(page);
        const thumb = page.locator('figure.mb-release-art-tile[data-mb-art-i="5"] > a');
        await thumb.scrollIntoViewIfNeeded();
        await thumb.tap();
        const pos = page.locator('#mb-art-viewer .mb-artv-pos');
        await expect(pos).toHaveText('6 / 16');

        // No swipe precedent in the suite: dispatch the touch pointer pair the
        // handler reads (pointerType 'touch', clientX), right-to-left = next.
        const swipe = (fromX, toX) => page.evaluate(([a, b]) => {
            const stage = document.querySelector('#mb-art-viewer .mb-artv-stage');
            const r = stage.getBoundingClientRect();
            const y = r.top + r.height / 2;
            const opts = (x) => ({ bubbles: true, pointerType: 'touch', clientX: r.left + x, clientY: y, isPrimary: true });
            stage.dispatchEvent(new PointerEvent('pointerdown', opts(a)));
            stage.dispatchEvent(new PointerEvent('pointerup', opts(b)));
        }, [fromX, toX]);
        await swipe(250, 100);
        await expect(pos).toHaveText('7 / 16');
        await swipe(100, 250);
        await expect(pos).toHaveText('6 / 16');
        await swipe(150, 130);
        await expect(pos, 'a 20 px move is not a swipe').toHaveText('6 / 16');
    });

    test('Spreads: an opened spread fits the phone window (P4, R6)', async ({ page }) => {
        await openRelease(page);
        await page.locator('.mb-release-art-sec [data-mb-art-layout="spreads"]').tap();
        const fit = await page.evaluate(() => Array.from(document.querySelectorAll('.mb-release-art-spread-pages'))
            .map((p) => ({ right: p.getBoundingClientRect().right, width: p.getBoundingClientRect().width,
                           win: window.innerWidth })));
        expect(fit.length, 'premise: the gatefold spread and the liner pager').toBe(2);
        fit.forEach((f) => {
            expect(f.width).toBeGreaterThan(100);
            expect(f.right, 'no sideways scrolling to see the right page').toBeLessThanOrEqual(f.win);
        });
    });

    test('tapping a Medium thumb in the medium heading opens the viewer, not the collapse (P4, R7)', async ({ page }) => {
        await openRelease(page);
        // One CD: all four Medium images (7, 8, 11, 12) are its own.
        const thumb = page.locator('.mb-medium-art-btn[data-mb-art-i="8"]');
        await thumb.scrollIntoViewIfNeeded();
        const tableShown = () => thumb.evaluate((b) => {
            let n = b.closest('h3').nextElementSibling;
            while (n && n.tagName !== 'TABLE') n = n.nextElementSibling;
            return !!n && n.style.display !== 'none';
        });
        const before = await tableShown();
        // A raw touch at the box centre, not locator.tap(): once the visual
        // viewport is scrolled (here 865 px down a 1648 px wide, zoomed-out
        // layout viewport), Playwright's actionability hit-check tests the
        // VISUAL-viewport coordinates as if they were layout ones, lands on
        // the Cover art grid above and reports it as intercepting — forever.
        // The real touch reaches the button (probed 2026-10-06), and the
        // pointerdown target is asserted below rather than assumed.
        await page.evaluate(() => {
            window.__tapTarget = null;
            document.addEventListener('pointerdown', (e) => { window.__tapTarget = e.target.className; }, { capture: true, once: true });
        });
        const box = await thumb.boundingBox();
        await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
        expect(await page.evaluate(() => window.__tapTarget), 'the touch landed on the thumb').toBe('mb-medium-art-btn');
        await expect(page.locator('#mb-art-viewer .mb-artv-pos')).toHaveText('2 / 4');
        expect(await tableShown(), 'the tap did not toggle the medium').toBe(before);
    });
});
