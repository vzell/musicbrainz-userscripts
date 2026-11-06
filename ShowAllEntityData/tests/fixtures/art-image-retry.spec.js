// @ts-check
// Pictures that do not load: a ⟳ instead of the browser's broken glyph
// (vzell, 2026-11-06: the Event Art Archive's files timed out on archive.org
// while the record had come through). The release page's Cover art section:
// a tile's ⟳ and "⟳ Reload N failed"; a medium thumb that asks again on the
// click that opens the viewer; the viewer's "⟳ Try again". The heading's
// cover copy and the artwork card: sidebar-picture.spec.js "image retry".
//
// The archive's picture files are routed through `files`: 'fail' answers
// every request with a timeout, 'ok' with a 1×1 PNG, so a test can let them
// fail first and then answer the retry.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const URL = 'https://musicbrainz.org/release/a9a3b139-cf22-4d28-801e-3f3d49521d0e';
const FIXTURE = path.join(__dirname, 'release-tracks-medley.html');
const RECORD = fs.readFileSync(path.join(__dirname, 'caa-release-d0adda7e.json'), 'utf8');
const N = JSON.parse(RECORD).images.length;
const META_RE = /^https:\/\/coverartarchive\.org\/release\/([0-9a-f-]{36})$/;
const THUMB_RE = /^https:\/\/coverartarchive\.org\/release\/[0-9a-f-]{36}\/\d+-250\.jpg$/;
// Every larger rendition: the viewer falls back from 1200 to 500 to the original.
const BIG_RE = /^https:\/\/coverartarchive\.org\/release\/[0-9a-f-]{36}\/\d+(-500|-1200)?\.jpg$/;
const CORS = { 'access-control-allow-origin': '*' };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const SEC = '.mb-release-art-sec';

/**
 * Loads the medley release with its record served and its picture files
 * answered as `files.thumbs` / `files.big` say, presses "Show all" and waits
 * for the sheet.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{thumbs: string, big: string}} files 'fail' or 'ok', read at each request.
 * @returns {Promise<void>}
 */
async function openRelease(page, files) {
    await loadUserscriptPage(page, {
        url: URL, fixtureFile: FIXTURE, testMode: true,
        settingsOverride: { sa_enable_release_tracks: true, sa_enable_release_tracks_cover_art: true, sa_art_idb_enable: false },
    });
    await page.route('https://coverartarchive.org/**', (route) => route.fulfill({ status: 404, headers: CORS, body: '' }));
    const answer = (route, how) => (how === 'fail' ? route.abort('timedout')
        : route.fulfill({ status: 200, headers: CORS, contentType: 'image/png', body: PNG }));
    await page.route(BIG_RE, (route) => answer(route, files.big));
    await page.route(THUMB_RE, (route) => answer(route, files.thumbs));
    await page.route(META_RE, (route) => route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: RECORD }));
    await page.click('button[data-label="Show all Tracks for Release"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
    await page.locator(`${SEC}[data-mb-art-state="ok"]`).waitFor({ state: 'attached', timeout: 15000 });
}

test.describe('pictures that do not load (image retry)', () => {
    test('a failed tile is a ⟳ box with its own ⟳; that asks again for it alone, "⟳ Reload N failed" for every one; the tile still opens the viewer', async ({ page }) => {
        const files = { thumbs: 'fail', big: 'ok' };
        await openRelease(page, files);
        const failed = page.locator(`${SEC} figure.mb-release-art-tile > a.mb-img-failed`);
        await expect(failed).toHaveCount(N);
        await expect(page.locator(`${SEC} figure.mb-release-art-tile > .mb-img-retry`)).toHaveCount(N);
        const all = page.locator(`${SEC} .mb-release-art-reload`);
        await expect(all).toHaveText(`⟳ Reload ${N} failed`);
        // The broken glyph is gone: the picture keeps its place, invisible.
        expect(await failed.first().locator('img').evaluate(i => getComputedStyle(i).visibility)).toBe('hidden');
        // The tile itself still opens the viewer (its large image may load).
        await failed.nth(1).click();
        await expect(page.locator('#mb-art-viewer')).toBeVisible();
        await page.keyboard.press('Escape');

        files.thumbs = 'ok';
        // One tile's ⟳: that tile only, and it does not open the viewer.
        await page.locator(`${SEC} figure.mb-release-art-tile`).first().locator('.mb-img-retry').click();
        await expect(page.locator(`${SEC} figure.mb-release-art-tile`).first().locator('a')).not.toHaveClass(/\bmb-img-failed\b/);
        await expect(page.locator(`${SEC} figure.mb-release-art-tile`).first().locator('.mb-img-retry')).toHaveCount(0);
        // Really asked again: the picture is there now (the class alone goes on the click).
        await expect.poll(() => page.locator(`${SEC} figure.mb-release-art-tile`).first().locator('img').evaluate(i => i.naturalWidth)).toBeGreaterThan(0);
        await expect(page.locator('#mb-art-viewer')).toBeHidden();
        await expect(all).toHaveText(`⟳ Reload ${N - 1} failed`);
        // All the others at once.
        await all.click();
        await expect(failed).toHaveCount(0);
        await expect(all).toBeHidden();
    });

    test('a failed medium thumb asks again on the click that opens the viewer', async ({ page }) => {
        const files = { thumbs: 'fail', big: 'ok' };
        await openRelease(page, files);
        const thumb = page.locator('h3 .mb-medium-art > button.mb-medium-art-btn').first();
        await expect(thumb).toHaveClass(/\bmb-img-failed\b/);
        files.thumbs = 'ok';
        await thumb.click();
        await expect(page.locator('#mb-art-viewer')).toBeVisible();
        await expect(thumb).not.toHaveClass(/\bmb-img-failed\b/);
        await expect.poll(() => thumb.locator('img').evaluate(i => i.naturalWidth)).toBeGreaterThan(0);
    });

    test('the viewer: a large image that did not load gets "⟳ Try again", which asks again', async ({ page }) => {
        const files = { thumbs: 'ok', big: 'fail' };
        await openRelease(page, files);
        await page.locator(`${SEC} figure.mb-release-art-tile > a`).first().click();
        const note = page.locator('#mb-art-viewer .mb-artv-note');
        await expect(note).toContainText('the large image could not be loaded');
        const again = note.locator('button[data-artv="reload"]');
        await expect(again).toHaveText('⟳ Try again');
        files.big = 'ok';
        await again.click();
        await expect(page.locator('#mb-art-viewer .mb-artv-img')).toHaveAttribute('data-artv-size', 'big');
        await expect(note).not.toContainText('could not be loaded');
    });

    test('the viewer: when the thumbnail fails too, no broken glyph, "This picture did not load" with its ⟳', async ({ page }) => {
        const files = { thumbs: 'fail', big: 'fail' };
        await openRelease(page, files);
        await page.locator(`${SEC} figure.mb-release-art-tile > a`).first().click();
        const img = page.locator('#mb-art-viewer .mb-artv-img');
        await expect(img).toHaveClass(/\bmb-artv-img-failed\b/);
        expect(await img.evaluate(i => getComputedStyle(i).visibility)).toBe('hidden');
        const note = page.locator('#mb-art-viewer .mb-artv-note');
        await expect(note).toContainText('This picture did not load.');
        files.thumbs = 'ok';
        files.big = 'ok';
        await note.locator('button[data-artv="reload"]').click();
        await expect(img).not.toHaveClass(/\bmb-artv-img-failed\b/);
        await expect(img).toHaveAttribute('data-artv-size', 'big');
    });
});
