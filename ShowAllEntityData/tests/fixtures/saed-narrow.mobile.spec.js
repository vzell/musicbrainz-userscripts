'use strict';

// The SAED button on a phone (chromium-mobile: Pixel 7 emulation, touch, no
// hover). A submenu opens IN PLACE under its row by a tap, since nothing
// hovers (docs/claude/toolbar-and-header-ui.md, "The SAED button").
//
// The narrow rule (actions move into the menu as "Load") follows the LAYOUT
// width, ≤ 520 px. A real MusicBrainz page sets
// <meta name="viewport" content="width=device-width, initial-scale=1">, so a
// phone lays it out 412 px wide and the rule applies: the first test pins
// that on a full MusicBrainz page, including that a tap on a Load row starts
// the fetch. (Until 2026-10-23 this spec claimed MusicBrainz sets no mobile
// viewport — true only of the 5 KB uniq-drop fixture, which lacks the tag
// and is laid out 980 px wide; the second test keeps that case.) The rule
// itself, by resizing a desktop window: saed-toolbar.spec.js.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const MB_URL = 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f?all=1&va=0';
const MB_FIXTURE = path.join(__dirname, 'artist-releasegroups-live-titles.html');
const URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/recordings';
const FIXTURE_FILE = path.join(__dirname, 'uniq-drop-viewport-clip.html');

test.describe('the SAED button on a phone', () => {
    test('on a real MusicBrainz page the actions head the menu as "Load", and a tap there fetches', async ({ page }) => {
        await loadUserscriptPage(page, {
            url: MB_URL, fixtureFile: MB_FIXTURE, testMode: true,
            settingsOverride: { sa_enable_caa_pics: false, sa_enable_relationships_column: false },
        });
        await page.route(`${MB_URL}*`, (r) => r.fulfill({ path: MB_FIXTURE, contentType: 'text/html' }));
        expect(await page.evaluate(() => document.documentElement.clientWidth),
            'premise: device-width layout').toBeLessThanOrEqual(520);
        await expect(page.locator('#mb-saed-bar')).toHaveClass(/mb-saed-narrow/);
        await expect(page.locator('#mb-saed-bar [data-mb-area="actions"]')).toBeHidden();

        await page.locator('#mb-saed-menu-btn').tap();
        const load = page.locator('#mb-saed-menu-btn-panel .mb-saed-group[data-mb-group="load"]');
        await expect(load).toBeVisible();
        const rows = load.locator('.mb-saed-load-row');
        const segs = await page.locator('#mb-saed-bar .mb-seg-action').count();
        await expect(rows, 'one row per action').toHaveCount(segs);
        await expect(rows.first()).toContainText('Artist RGs');

        await rows.first().tap();
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await expect(page.locator('table.tbl tbody tr').first()).toBeVisible();
    });

    test('on a page wider than the screen the menu opens inside what SHOWS, not the layout viewport', async ({ page }) => {
        // releasegroup-releases needs ≈636 px: the layout viewport grows to
        // 636 × 1296 while 412 × 839 of it shows. Measured against
        // window.innerHeight the panel "fitted" below ☰ and opened under the
        // bottom of the screen (_toolbarViewBox(), 2026-10-23).
        const RG_URL = 'https://musicbrainz.org/release-group/f83d2211-dd81-4b1e-9a02-e89733891e1c';
        await loadUserscriptPage(page, {
            url: RG_URL, fixtureFile: path.join(__dirname, '..', 'snapshots', 'releasegroup-releases', 'raw.html'),
            testMode: true,
        });
        expect(await page.evaluate(() => window.innerHeight - window.visualViewport.height),
            'premise: the layout viewport is taller than what shows').toBeGreaterThan(100);
        await page.locator('#mb-saed-menu-btn').tap();
        const panel = page.locator('#mb-saed-menu-btn-panel');
        await expect(panel).toBeVisible();
        const fit = await panel.evaluate((p) => {
            const r = p.getBoundingClientRect();
            const vv = window.visualViewport;
            return { top: r.top, bottom: r.bottom, left: r.left, right: r.right,
                vTop: vv.offsetTop, vBottom: vv.offsetTop + vv.height, vLeft: vv.offsetLeft, vRight: vv.offsetLeft + vv.width };
        });
        expect(fit.top, JSON.stringify(fit)).toBeGreaterThanOrEqual(fit.vTop);
        expect(fit.bottom, JSON.stringify(fit)).toBeLessThanOrEqual(fit.vBottom);
        expect(fit.left, JSON.stringify(fit)).toBeGreaterThanOrEqual(fit.vLeft);
        expect(fit.right, JSON.stringify(fit)).toBeLessThanOrEqual(fit.vRight);
        // …so its first Load row takes a real tap.
        await page.locator('#mb-saed-menu-btn-panel .mb-saed-load-row').first().tap({ trial: true });
    });

    test('a page without a viewport tag is laid out wide and keeps its action segments', async ({ page }) => {
        await loadUserscriptPage(page, { url: URL, fixtureFile: FIXTURE_FILE, testMode: true });
        expect(await page.evaluate(() => document.documentElement.clientWidth)).toBeGreaterThan(520);
        await expect(page.locator('#mb-saed-bar')).not.toHaveClass(/mb-saed-narrow/);
        await expect(page.locator('#mb-saed-bar [data-mb-area="actions"]')).toBeVisible();

        await page.locator('#mb-saed-menu-btn').tap();
        await expect(page.locator('#mb-saed-menu-btn-panel')).toBeVisible();
        await expect(page.locator('#mb-saed-menu-btn-panel .mb-saed-group[data-mb-group="load"]')).toBeHidden();
    });

    test('Export ▸ opens its formats in place under the row by a tap', async ({ page }) => {
        await loadUserscriptPage(page, { url: URL, fixtureFile: FIXTURE_FILE, testMode: true });
        await page.route(`${URL}?**`, (route) => route.fulfill({ path: FIXTURE_FILE, contentType: 'text/html' }));
        await page.locator('button[data-label="⊚ All recordings"]').evaluate((b) => b.click());
        await waitForRenderComplete(page, { waitForAutoResize: false });

        await page.locator('#mb-saed-menu-btn').tap();
        await page.locator('#mb-export-btn').tap();
        const sub = page.locator('#mb-export-sub-panel');
        await expect(sub).toBeVisible();
        await expect(sub).toHaveClass(/mb-toolbar-menu-inline/);
        expect(await sub.evaluate((el) => el.previousElementSibling && el.previousElementSibling.id),
            'right after its row').toBe('mb-export-btn');
        // A second tap on the row folds it away again; the menu stays.
        await page.locator('#mb-export-btn').tap();
        await expect(sub).toBeHidden();
        await expect(page.locator('#mb-saed-menu-btn-panel')).toBeVisible();
    });
});
