'use strict';

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// The sidebar picture (docs/claude/sidebar.md "The sidebar picture").
// The artist's Wikimedia Commons picture arrives in the sidebar AFTER load,
// as another userscript's `div.entity-image` (what the user's browser shows;
// MusicBrainz's own Commons switch is off) or as MusicBrainz's own
// `div.commons-image`; the raw page has none, so each test adds it late and
// serves the upload host from a 1×1 PNG. The guarantees pinned:
//   - a picture that arrives late is wired: hover card, keyboard, and a copy
//     beside the name in the heading; MusicBrainz's own markup too;
//   - a click opens the shared artwork viewer on that picture, with an
//     "Open on Commons" link to its file page; Esc closes it and gives focus
//     back to what opened it; Enter on the copy opens it too;
//   - a picture that is not a Commons file (the event sidebar's event art) is
//     left alone, and the setting off leaves everything alone;
//   - nothing is requested for it beyond the picture MusicBrainz shows.
// An instrument's IROMBOOK drawing has its own describe block at the end.

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
 * Adds the picture as MusicBrainz's own CommonsImage component renders it
 * (musicbrainz-server root/static/scripts/common/components/CommonsImage.js).
 * @param {import('@playwright/test').Page} page
 */
const addNativePicture = (page) => page.evaluate((s) => {
    const box = document.createElement('div');
    box.className = 'commons-image';
    box.innerHTML = `<div class="picture"><img src="${s}"><br><span class="picture-note">` +
        '<a href="https://commons.wikimedia.org/wiki/File:x.jpg">Image from Wikimedia Commons</a></span></div>';
    document.getElementById('sidebar').prepend(box);
}, SRC);

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

    test('MusicBrainz\'s own Commons picture markup is wired too', async ({ page }) => {
        await open(page);
        await addNativePicture(page);
        const native = page.locator('#sidebar .commons-image .picture img');
        await expect(native).toHaveClass(/mb-sb-pic/);
        await expect(avatar(page)).toHaveCount(1);
        await native.click();
        await expect(viewer(page)).toBeVisible();
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

// An instrument's IROMBOOK drawing: MusicBrainz's own `#sidebar > div.picture`,
// server-rendered, so it is there at load (not added late). The guarantees
// pinned:
//   - it is wired at load (card naming IROMBOOK and the file), and its copy is
//     the FIRST child of the h1 on the initial page, fitted whole
//     (`mb-sb-avatar-contain`), not cropped;
//   - the copy is still first in the h1 after "Show all Recordings" rendered
//     the table (the final page);
//   - a click opens the viewer on it with NO page link (a drawing has no
//     Commons page); both switches still govern it.
// Fixture: scripts/build-sidebar-picture-instrument-fixture.py.

const INST_URL = 'https://musicbrainz.org/instrument/b62ace3b-47e7-4319-8a3e-1b035ccd20b2/recordings';
const INST_FIXTURE = path.join(__dirname, 'sidebar-picture-instrument-recordings.html');
const INST_FILE = 'bass_guitar_electric.png';
const INST_SRC = `https://static.metabrainz.org/irombook/bass_guitar/${INST_FILE}`;

/**
 * Loads the instrument recordings page with the IROMBOOK host served locally
 * and WS/2 answered empty (the "Recording of" pair is off).
 * @param {import('@playwright/test').Page} page
 * @param {Object} [settings]
 * @returns {Promise<void>}
 */
async function openInstrument(page, settings = {}) {
    await page.route('https://static.metabrainz.org/irombook/**', (r) => r.fulfill({ body: PNG, contentType: 'image/png' }));
    await page.route('**/ws/2/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await loadUserscriptPage(page, { url: INST_URL, fixtureFile: INST_FIXTURE, testMode: true,
                                     settingsOverride: { sa_enable_caa_pics: false, sa_enable_relationships_column: false,
                                                         sa_recording_of_on_instrument: false, ...settings } });
}

const instPic = (page) => page.locator('#sidebar > .picture img');
/** Whether the h1's first element child is the copy beside the name. */
const avatarFirst = (page) => page.evaluate(() => {
    const h1 = document.querySelector('h1 .mb-sb-avatar') && document.querySelector('h1 .mb-sb-avatar').closest('h1');
    return !!h1 && h1.firstElementChild === h1.querySelector('.mb-sb-avatar');
});

test.describe('an instrument\'s IROMBOOK drawing', () => {
    test('is wired at load, with a fitted copy first in the heading, kept after the render', async ({ page }) => {
        await openInstrument(page);
        await expect(instPic(page)).toHaveClass(/mb-sb-pic/);
        await expect(instPic(page)).toHaveAttribute('role', 'button');
        await expect(instPic(page)).toHaveAttribute('tabindex', '0');
        const tip = await instPic(page).getAttribute('title');
        expect(tip).toContain('IROMBOOK');
        expect(tip).toContain(INST_FILE);
        expect(tip).not.toContain('Commons');
        await expect(avatar(page)).toHaveCount(1);
        await expect(avatar(page)).toHaveClass(/mb-sb-avatar-contain/);
        await expect(avatar(page).locator('img')).toHaveAttribute('src', INST_SRC);
        expect(await avatar(page).locator('img').evaluate((i) => getComputedStyle(i).objectFit)).toBe('contain');
        expect(await avatarFirst(page), 'the copy leads the heading on the initial page').toBe(true);
        await page.route(`${INST_URL}?**`, (r) => r.fulfill({ path: INST_FIXTURE, contentType: 'text/html' }));
        await page.locator('button[data-label^="Show all Recordings for Instrument"]').first().click();
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await expect(page.locator('table.tbl tbody tr').first()).toBeVisible();
        await expect(avatar(page)).toHaveCount(1);
        expect(await avatarFirst(page), 'the copy still leads the heading on the final page').toBe(true);
    });

    test('a click opens the viewer with no page link; Esc gives focus back', async ({ page }) => {
        await openInstrument(page);
        await instPic(page).click();
        await expect(viewer(page)).toBeVisible();
        await expect(viewer(page).locator('.mb-artv-title')).toContainText('instrument image');
        await expect(viewer(page).locator('[data-mb-artv-page]')).toHaveCount(0);
        await page.keyboard.press('Escape');
        await expect(viewer(page)).toBeHidden();
        expect(await page.evaluate(() => document.activeElement && document.activeElement.matches('#sidebar img.mb-sb-pic'))).toBe(true);
        await avatar(page).click();
        await expect(viewer(page)).toBeVisible();
    });

    test('the setting off leaves the drawing alone', async ({ page }) => {
        await openInstrument(page, { sa_sidebar_picture: false });
        await observerRan(page);
        await expect(instPic(page)).not.toHaveClass(/mb-sb-pic/);
        await expect(avatar(page)).toHaveCount(0);
    });

    test('without the copy beside the name, the drawing still opens the viewer', async ({ page }) => {
        await openInstrument(page, { sa_sidebar_picture_in_header: false });
        await expect(instPic(page)).toHaveClass(/mb-sb-pic/);
        await expect(avatar(page)).toHaveCount(0);
        await instPic(page).focus();
        await page.keyboard.press('Enter');
        await expect(viewer(page)).toBeVisible();
    });
});
