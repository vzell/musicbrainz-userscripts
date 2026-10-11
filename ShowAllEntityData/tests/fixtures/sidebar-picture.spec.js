'use strict';

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');

// The sidebar picture (docs/claude/sidebar.md "The sidebar picture").
// MusicBrainz adds an artist's Wikimedia Commons picture to the sidebar AFTER
// load; the raw page has none, so each test adds it late, as MusicBrainz does,
// and serves the upload host from a 1×1 PNG. The guarantees pinned:
//   - a picture that arrives late is wired: hover card, keyboard, and a copy
//     beside the name in the heading;
//   - a click opens the shared artwork viewer on that picture, with an
//     "Open on Commons" link to its file page; Esc closes it and gives focus
//     back to what opened it; Enter on the copy opens it too;
//   - a picture that is not a Commons file (the event sidebar's event art) is
//     left alone, and the setting off leaves everything alone;
//   - nothing is requested for it beyond the picture MusicBrainz shows.

const URL = 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f';
const FIXTURE = path.join(__dirname, 'artist-releasegroups-live-titles.html');
const FILE = 'Bruce_Springsteen_-_Roskilde_Festival_2012.jpg';
const SRC = `https://upload.wikimedia.org/wikipedia/commons/3/3b/${FILE}`;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

/**
 * Loads the artist page with the upload host served locally and counts its
 * requests in `window.__uploads` (Node side: `uploads.n`).
 * @param {import('@playwright/test').Page} page
 * @param {Object} [settings]
 * @returns {Promise<{n: number}>}
 */
async function open(page, settings = {}) {
    const uploads = { n: 0 };
    await page.route('https://upload.wikimedia.org/**', (r) => { uploads.n++; r.fulfill({ body: PNG, contentType: 'image/png' }); });
    await loadUserscriptPage(page, { url: URL, fixtureFile: FIXTURE, testMode: true,
                                     settingsOverride: { sa_enable_caa_pics: false, sa_enable_relationships_column: false, ...settings } });
    return uploads;
}

/**
 * Adds the sidebar picture the way MusicBrainz does, after load.
 * @param {import('@playwright/test').Page} page
 * @param {string} [src]
 */
const addPicture = (page, src = SRC) => page.evaluate((s) => {
    const box = document.createElement('div');
    box.className = 'entity-image';
    box.innerHTML = `<div class="picture"><img src="${s}" alt=""></div>`;
    document.getElementById('sidebar').prepend(box);
}, src);

/**
 * Waits until the page's MutationObservers have seen the last change: their
 * callbacks are microtasks, so one macrotask turn later they have all run.
 * @param {import('@playwright/test').Page} page
 */
const observerRan = (page) => page.evaluate(() => new Promise((r) => setTimeout(r, 0)));

const pic = (page) => page.locator('#sidebar .entity-image .picture img');
const avatar = (page) => page.locator('h1 .mb-sb-avatar');
const viewer = (page) => page.locator('#mb-art-viewer');

test.describe('the sidebar picture', () => {
    test('a picture that arrives late gets its card, keyboard and a copy beside the name', async ({ page }) => {
        await open(page);
        await expect(pic(page)).toHaveCount(0);
        await addPicture(page);
        await expect(pic(page)).toHaveClass(/mb-sb-pic/);
        await expect(pic(page)).toHaveAttribute('role', 'button');
        await expect(pic(page)).toHaveAttribute('tabindex', '0');
        await expect(pic(page)).toHaveAttribute('data-mb-tip', '');
        expect(await pic(page).getAttribute('title')).toContain(FILE);
        await expect(avatar(page)).toHaveCount(1);
        await expect(avatar(page).locator('img')).toHaveAttribute('src', SRC);
    });

    test('a click opens the viewer with an Open on Commons link; Esc closes and gives focus back', async ({ page }) => {
        const uploads = await open(page);
        await addPicture(page);
        await expect(pic(page)).toHaveClass(/mb-sb-pic/);
        await pic(page).click();
        await expect(viewer(page)).toBeVisible();
        await expect(viewer(page).locator('[data-mb-artv-page]')).toHaveAttribute('href', `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(FILE)}`);
        await expect(viewer(page).locator('.mb-artv-title')).toContainText('artist image');
        await page.keyboard.press('Escape');
        await expect(viewer(page)).toBeHidden();
        expect(await page.evaluate(() => document.activeElement && document.activeElement.matches('#sidebar img.mb-sb-pic'))).toBe(true);
        // Enter on the copy beside the name opens it too.
        await avatar(page).focus();
        await page.keyboard.press('Enter');
        await expect(viewer(page)).toBeVisible();
        expect(uploads.n, 'only the picture itself was fetched (and only from the upload host)').toBeGreaterThan(0);
        expect(await page.evaluate(() => performance.getEntriesByType('resource').filter((e) => /commons-image|\/ws\/2\//.test(e.name)).length),
            'no lookup was made for it').toBe(0);
    });

    test('a picture that is not a Commons file is left alone', async ({ page }) => {
        await open(page);
        await addPicture(page, 'https://eventartarchive.org/event/x/1-250.jpg');
        await observerRan(page);
        await expect(pic(page)).not.toHaveClass(/mb-sb-pic/);
        await expect(avatar(page)).toHaveCount(0);
    });

    test('the setting off leaves the picture alone; the copy has its own switch', async ({ page }) => {
        await open(page, { sa_sidebar_picture: false });
        await addPicture(page);
        await observerRan(page);
        await expect(pic(page)).not.toHaveClass(/mb-sb-pic/);
        await expect(avatar(page)).toHaveCount(0);
    });

    test('without the copy beside the name, the sidebar picture still opens the viewer', async ({ page }) => {
        await open(page, { sa_sidebar_picture_in_header: false });
        await addPicture(page);
        await expect(pic(page)).toHaveClass(/mb-sb-pic/);
        await expect(avatar(page)).toHaveCount(0);
        await pic(page).focus();
        await page.keyboard.press(' ');
        await expect(viewer(page)).toBeVisible();
    });
});
