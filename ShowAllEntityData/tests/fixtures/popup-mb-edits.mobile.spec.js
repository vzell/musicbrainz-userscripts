'use strict';

// The editing history in the MusicBrainz entity window on a touch screen
// (chromium-mobile: Pixel 7, touch, no hover; org/mb-edit-history.org).
// Desktop: popup-mb-edits.spec.js. Pinned: a tap on a recording link opens
// its window (with `sa_pop_mb_on_touch`, the touch twin), the narrow header
// shows the button as ✎ alone, a tap on it shows the history, a tap on a row
// selects it and shows its changes stacked (OLD over NEW), and Back returns.

const path = require('path');
const fs = require('fs');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');

const RG_URL = 'https://musicbrainz.org/release-group/c497fc44-ddaf-3cce-a9b4-bfec958a0f3c';
const FIXTURE = path.join(__dirname, 'releasegroup-releases-multirow-catalog.html');
const REC = 'de571208-2c6d-4dc6-9efa-c16405c904f9';
const json = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');

let errors;
test.beforeEach(({ page }) => {
    errors = [];
    const THIRD_PARTY = [/supported-browser-check/, /Unexpected token '<'/];
    page.on('pageerror', (e) => {
        const where = String(e.stack || e.message || e);
        if (!THIRD_PARTY.some((re) => re.test(where))) errors.push(where);
    });
});
test.afterEach(() => {
    expect(errors).toEqual([]);
});

/**
 * Taps the middle of `el` with a finger, after checking that a finger there
 * really touches it (popup-mb.mobile.spec.js's tapLink(): on this zoomed-out
 * page Locator.tap() misses).
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} el
 * @returns {Promise<void>}
 */
async function tapAt(page, el) {
    await el.scrollIntoViewIfNeeded();
    const box = await el.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    expect(await el.evaluate((a, [px, py]) => a.contains(document.elementFromPoint(
        px + visualViewport.offsetLeft, py + visualViewport.offsetTop)), [x, y])).toBe(true);
    await page.touchscreen.tap(x, y);
}

test('a tap opens the recording window; ✎ alone shows its history; a tapped row\'s changes stack; Back returns', async ({ page }) => {
    const ctx = page.context();
    await ctx.route('https://static.metabrainz.org/**', (route) => route.abort('blockedbyclient'));
    await ctx.route(/\/ws\/2\/recording\/[0-9a-f-]{36}\?inc=artist-credits\+isrcs/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: json('ws2-pop-recording-thunder.json') }));
    await ctx.route(/\/ws\/2\/recording\/[0-9a-f-]{36}\?inc=artist-rels/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: json('ws2-pop-recording-thunder-pin.json') }));
    await ctx.route(/\/ws\/2\/(release\?recording=|work\/|area\/)/, (route) => route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
    await ctx.route(new RegExp(`^https://musicbrainz\\.org/recording/${REC}/edits$`), (route) => route.fulfill({ path: path.join(__dirname, 'edits-page-recording.html'), contentType: 'text/html' }));
    await loadUserscriptPage(page, {
        url: RG_URL, fixtureFile: FIXTURE, testMode: true,
        settingsOverride: { sa_rich_tooltip_delay_ms: 0, sa_pop_mb_on_touch: true },
    });
    await page.evaluate((rec) => {
        const td = document.querySelector('table.tbl tbody tr td:first-child');
        const a = document.createElement('a');
        a.href = `/recording/${rec}`;
        a.className = 'pop-probe';
        a.textContent = 'She’s a Runaway';
        td.append(' ', a);
    }, REC);
    await tapAt(page, page.locator('a.pop-probe'));
    const dialog = page.locator('#mb-dp-dialog');
    await expect(dialog).toBeVisible();
    const hist = dialog.locator('button.mb-meh-hist-btn');
    await expect(hist).toBeVisible();
    await expect(hist.locator('.mb-meh-t'), 'a narrow header keeps the glyph alone').toBeHidden();
    await tapAt(page, hist);
    await expect(dialog.locator(':scope > div > span').first()).toHaveText('Recording › Editing history');
    await expect(dialog.locator('.mb-meh-e')).toHaveCount(23);
    await tapAt(page, dialog.locator('.mb-meh-e[data-mb-meh-v="44371223"]'));
    const o = dialog.locator('[data-mb-dg-sec="meh-diff"] .mb-meh-o');
    const n = dialog.locator('[data-mb-dg-sec="meh-diff"] .mb-meh-n');
    await expect(o.locator('.mb-dgh-rem')).toHaveText('She\'s');
    const [ob, nb] = [await o.boundingBox(), await n.boundingBox()];
    expect(nb.y, 'NEW stacked under OLD').toBeGreaterThan(ob.y + ob.height - 1);
    await tapAt(page, dialog.locator('button.mb-dp-tbtn', { hasText: '← Back' }));
    await expect(dialog.locator(':scope > div > span').first()).toHaveText('Recording');
});
