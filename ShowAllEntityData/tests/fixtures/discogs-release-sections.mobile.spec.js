'use strict';

// A Discogs release's Tracks view on a touch-primary device (Pixel 7
// emulation): the section bands are there and fold on a tap, but they do NOT
// stick under the column headers — a sticky band takes too much of a small
// screen (vzell, 2026-11-11) — unless sa_dg_section_bands_sticky_on_touch is
// on. The desktop half: discogs-release-sections.spec.js.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const FX = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, `ext-${name}.json`), 'utf8'));
const answers = (...names) => Object.fromEntries(names.map((n) => {
    const f = FX(n);
    return [f.url, { status: f.status, responseHeaders: `Content-Type: ${f.contentType}`, responseText: f.body }];
}));

/**
 * Release 2012001's Tracks view, its sub-tables opened.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} [settings]
 * @returns {Promise<string[]>} Page errors.
 */
async function openTracks(page, settings = {}) {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
    await page.context().addInitScript((r) => { window.__gmXhrResponses = r; }, answers('discogs-release-2012001'));
    await loadUserscriptPage(page, {
        url: 'https://www.discogs.com/release/2012001-x', fixtureFile: path.join(__dirname, 'dg-release.html'), testMode: true,
        settingsOverride: { sa_enable_discogs: true, sa_pop_ext_discogs_token: 'tok-probe', sa_render_threshold: 100000, ...settings },
    });
    await page.locator('#mb-dg-root button[data-label="Show all tracks"]').tap();
    await waitForRenderComplete(page, { waitForAutoResize: false });
    const master = page.locator('.mb-master-toggle').first();
    if (/Show/.test(await master.textContent())) await master.tap();
    await expect(page.locator('#mb-dg-root table.tbl').first()).toBeVisible();
    return errors;
}

test.describe('Discogs Tracks view on a touch device: section bands (2026-11-11)', () => {
    test('bands, not sticky by default; a tap folds one', async ({ page }) => {
        const errors = await openTracks(page);
        const d1 = page.locator('#mb-dg-root table.tbl').first();
        await expect(d1.locator('tr.mb-sec-band')).toHaveCount(4);
        await expect(d1).not.toHaveClass(/\bmb-sec-sticky\b/);
        await expect(d1.locator('tr.mb-sec-band').first().locator('td')).not.toHaveCSS('position', 'sticky');
        const paris = d1.locator('tr.mb-sec-band', { hasText: 'Paris' }).locator('button');
        await paris.tap();
        await expect(d1.locator('tr.mb-sec-band', { hasText: 'Paris' }).locator('button')).toHaveAttribute('aria-expanded', 'false');
        await expect(d1.locator('tbody > tr.mb-sec-folded')).toHaveCount(8);
        expect(errors).toEqual([]);
    });

    test('sticky with "Tracks view: sticky section bands on touch devices" on', async ({ page }) => {
        const errors = await openTracks(page, { sa_dg_section_bands_sticky_on_touch: true });
        const d1 = page.locator('#mb-dg-root table.tbl').first();
        await expect(d1).toHaveClass(/\bmb-sec-sticky\b/);
        await expect(d1.locator('tr.mb-sec-band').first().locator('td')).toHaveCSS('position', 'sticky');
        expect(errors).toEqual([]);
    });
});
