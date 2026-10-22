'use strict';

// The SAED button on a phone (chromium-mobile: Pixel 7 emulation, touch, no
// hover). A submenu opens IN PLACE under its row by a tap, since nothing
// hovers (docs/claude/toolbar-and-header-ui.md, "The SAED button").
//
// The narrow rule (actions move into the menu as "Load") follows the LAYOUT
// width, ≤ 520 px. MusicBrainz sets no mobile viewport, so a phone lays the
// page out about 980 px wide, the bar fits on one line there, and the
// actions stay segments: that is what the first test pins. The rule itself,
// by resizing a desktop window: saed-toolbar.spec.js.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/recordings';
const FIXTURE_FILE = path.join(__dirname, 'uniq-drop-viewport-clip.html');

test.describe('the SAED button on a phone', () => {
    test('the narrow rule follows the layout width; the menu opens by a tap', async ({ page }) => {
        await loadUserscriptPage(page, { url: URL, fixtureFile: FIXTURE_FILE, testMode: true });
        const width = await page.evaluate(() => document.documentElement.clientWidth);
        const narrow = width <= 520;
        await expect(page.locator('#mb-saed-bar')).toHaveClass(narrow ? /mb-saed-narrow/ : /^(?!.*mb-saed-narrow).*$/);
        await expect(page.locator('#mb-saed-bar [data-mb-area="actions"]')).toBeVisible({ visible: !narrow });

        await page.locator('#mb-saed-menu-btn').tap();
        await expect(page.locator('#mb-saed-menu-btn-panel')).toBeVisible();
        await expect(page.locator('#mb-saed-menu-btn-panel .mb-saed-group[data-mb-group="load"]'))
            .toBeVisible({ visible: narrow });
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
