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
//     beside the name in the heading; MusicBrainz's own markup too. The hover
//     card is the CAA/EAA column's image card (2026-10-21): the picture's
//     preview, its origin and file name — on the copy too;
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
                                     settingsOverride: { sa_enable_caa_pics: false, sa_enable_relationships_column: false,
                                                         sa_rich_tooltip_delay_ms: 0, ...settings } });
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
    // Sized as MusicBrainz's CSS would: the 1×1 test image would otherwise
    // sit under the fixed sidebar handle at the page's left edge.
    box.innerHTML = `<div class="picture"><img src="${s}" alt="" style="width: 120px; height: 120px; margin-left: 40px;"></div>`;
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
const tip = (page) => page.locator('#mb-stat-tooltip');

/**
 * Hovers `el` from outside and waits for its card in #mb-stat-tooltip.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} el
 */
async function hoverCard(page, el) {
    await page.mouse.move(0, 0);
    await el.hover();
    await expect(tip(page)).toBeVisible();
}
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
        await expect(avatar(page)).toHaveCount(1);
        await expect(avatar(page).locator('img')).toHaveAttribute('src', SRC);
        for (const el of [pic(page), avatar(page)]) {
            await hoverCard(page, el);
            await expect(tip(page).locator('.mb-tt-title')).toHaveText('Artist image');
            await expect(tip(page).locator('img.mb-art-card-preview')).toHaveAttribute('src', SRC);
            await expect(tip(page).locator('.mb-tt-pill')).toHaveText('Wikimedia Commons');
            await expect(tip(page).locator('.mb-tt-comment')).toHaveText(FILE);
            await expect(tip(page).locator('.mb-tt-foot')).toHaveText('Click: viewer');
        }
        expect(await pic(page).getAttribute('title'), 'no plain tooltip any more').toBeNull();
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
                                                         sa_recording_of_on_instrument: false, sa_rich_tooltip_delay_ms: 0, ...settings } });
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
        await hoverCard(page, instPic(page));
        await expect(tip(page).locator('.mb-tt-title')).toHaveText('Instrument image');
        await expect(tip(page).locator('.mb-tt-pill')).toHaveText('IROMBOOK');
        await expect(tip(page).locator('.mb-tt-comment')).toHaveText(INST_FILE);
        await page.mouse.move(0, 0);
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

// A release's, release group's or event's front cover: MusicBrainz's own
// `#sidebar .cover-art.present span.artwork-image` (an event's
// `.event-art span.artwork-image`), server-rendered with its
// address in `data-small-thumbnail`; MusicBrainz's script puts the `<img>` in,
// and replaces the whole span with "Image failed to load" when it cannot. The
// harness blocks every archive.org image, so each fixture is served from a
// copy whose thumbnails live on a host this spec answers (THUMB_HOST).
// The guarantees pinned:
//   - a copy of the cover leads the heading at load, from the span's
//     thumbnail address (made absolute);
//   - nothing is asked of the archive at load; the first HOVER asks once and
//     shows the CAA/EAA column's card of every image (tiles, ★ main front);
//     the click opens the viewer on ALL the images, at the FRONT image even
//     when it is not the first (the record is reordered so the front is
//     second); Esc gives focus back to the copy;
//   - the sidebar's own cover link has the same card, and a plain click on
//     it opens OUR viewer (MusicBrainz's dialog, which our bars painted
//     through, is not opened), even with the copy switched off;
//   - the copy still leads the heading after the tracks rendered;
//   - a release group page does the same with its own path, an event page
//     with the Event Art Archive;
//   - no `.present` cover, or the copy switched off, makes no copy.

const REL_URL = 'https://musicbrainz.org/release/20a52f17-ce0b-48bf-911e-9f962a518185';
const REL_FIXTURE = path.join(__dirname, 'release-tracks-live-date-flags.html');
const THUMB_HOST = 'thumbs.mb-test.invalid';
const REL_THUMB = `https://${THUMB_HOST}/download/mbid-20a52f17-ce0b-48bf-911e-9f962a518185/mbid-20a52f17-ce0b-48bf-911e-9f962a518185-40457792022_thumb250.jpg`;
const RG_URL = 'https://musicbrainz.org/release-group/fa9c43a7-2592-3336-a09b-1414b4b6ee68';
const RG_FIXTURE = path.join(__dirname, 'rg-page-berlin.html');
const EV_URL = 'https://musicbrainz.org/event/3f2ca30a-7de4-4964-ad30-48376535fec8';
const EV_FIXTURE = path.join(__dirname, 'event-overview.html');
const CAA_CORS = { 'access-control-allow-origin': '*' };
const CAA_RECORD = JSON.parse(require('fs').readFileSync(path.join(__dirname, 'caa-release-d0adda7e.json'), 'utf8'));

/**
 * Loads a release or release group page from a copy of `fixture` whose
 * archive.org thumbnails are on THUMB_HOST (`edit` changes the copy further),
 * with the Cover Art Archive record served locally (the front image moved to
 * second place) and every record request counted in `asked`.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').TestInfo} testInfo
 * @param {string} url
 * @param {string} fixture
 * @param {{settings?: Object, edit?: function(string): string}} [opts]
 * @returns {Promise<{asked: string[]}>}
 */
async function openCover(page, testInfo, url, fixture, { settings = {}, edit = (h) => h } = {}) {
    const fs = require('fs');
    const copy = testInfo.outputPath(path.basename(fixture));
    fs.writeFileSync(copy, edit(fs.readFileSync(fixture, 'utf8').split('//archive.org/download/').join(`//${THUMB_HOST}/download/`)));
    const asked = [];
    const images = CAA_RECORD.images.slice();
    const fi = images.findIndex((im) => im.front);
    const [front] = images.splice(fi, 1);
    images.splice(1, 0, front);
    const body = JSON.stringify({ ...CAA_RECORD, images });
    await page.route(`https://${THUMB_HOST}/**`, (r) => r.fulfill({ body: PNG, contentType: 'image/png' }));
    await page.route(/^https:\/\/(cover|event)artarchive\.org\//, (r) => {
        const u = r.request().url();
        if (/^https:\/\/(coverartarchive\.org\/(release|release-group)|eventartarchive\.org\/event)\/[0-9a-f-]{36}\/?$/.test(u)) {
            asked.push(u);
            return r.fulfill({ status: 200, headers: CAA_CORS, contentType: 'application/json', body });
        }
        return r.fulfill({ status: 200, headers: CAA_CORS, body: PNG, contentType: 'image/png' });
    });
    await loadUserscriptPage(page, { url, fixtureFile: copy, testMode: true,
                                     settingsOverride: { sa_enable_caa_pics: false, sa_enable_relationships_column: false,
                                                         sa_art_idb_enable: false, sa_rich_tooltip_delay_ms: 0, ...settings } });
    return { asked };
}

test.describe('a release\'s or release group\'s cover beside the name', () => {
    test('the copy leads the heading at load; a hover shows every image; the click opens them at the front', async ({ page }, testInfo) => {
        const { asked } = await openCover(page, testInfo, REL_URL, REL_FIXTURE);
        await expect(avatar(page)).toHaveCount(1);
        expect(await avatarFirst(page), 'the copy leads the heading').toBe(true);
        await expect(avatar(page).locator('img')).toHaveAttribute('src', REL_THUMB);
        await expect(avatar(page)).toHaveAttribute('role', 'button');
        await observerRan(page);
        expect(asked, 'nothing asked at load').toEqual([]);
        await hoverCard(page, avatar(page));
        await expect(tip(page).locator('.mb-tt-title')).toHaveText('Barcelona Night');
        await expect(tip(page).locator('.mb-art-card-tile')).toHaveCount(Math.min(12, CAA_RECORD.images.length));
        await expect(tip(page).locator('.mb-art-card-tile.mb-art-card-main'), 'the ★ main front').toHaveCount(1);
        await expect(tip(page).locator('.mb-tt-foot:not(.mb-art-card-keys)')).toHaveText('Click: viewer');
        expect(asked, 'the first hover asks once').toEqual(['https://coverartarchive.org/release/20a52f17-ce0b-48bf-911e-9f962a518185']);
        await avatar(page).click();
        await expect(viewer(page)).toBeVisible();
        await expect(viewer(page).locator('.mb-artv-title')).toContainText('cover art');
        await expect(viewer(page).locator('.mb-artv-pos'), 'opened at the front image, which is second').toHaveText(`2 / ${CAA_RECORD.images.length}`);
        expect(asked).toEqual(['https://coverartarchive.org/release/20a52f17-ce0b-48bf-911e-9f962a518185']);
        await page.keyboard.press('Escape');
        await expect(viewer(page)).toBeHidden();
        expect(await page.evaluate(() => document.activeElement && document.activeElement.matches('h1 .mb-sb-avatar'))).toBe(true);
        // Enter opens it again from the record already in.
        await page.keyboard.press('Enter');
        await expect(viewer(page)).toBeVisible();
        expect(asked.length, 'the record is asked once').toBe(1);
    });

    test('the copy still leads the heading after "Show all Tracks" rendered', async ({ page }, testInfo) => {
        await openCover(page, testInfo, REL_URL, REL_FIXTURE);
        await expect(avatar(page)).toHaveCount(1);
        await page.route(`${REL_URL}?**`, (r) => r.fulfill({ path: testInfo.outputPath(path.basename(REL_FIXTURE)), contentType: 'text/html' }));
        await page.click('button[data-label="Show all Tracks for Release"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await expect(page.locator('table.tbl tbody tr').first()).toBeVisible();
        await expect(avatar(page)).toHaveCount(1);
        expect(await avatarFirst(page), 'the copy still leads the heading on the final page').toBe(true);
    });

    test('the sidebar\'s own cover: the same card, and a click opens our viewer, not MusicBrainz\'s dialog', async ({ page }, testInfo) => {
        const { asked } = await openCover(page, testInfo, REL_URL, REL_FIXTURE);
        const own = page.locator('#sidebar .cover-art a.artwork-image');
        await hoverCard(page, own);
        await expect(tip(page).locator('.mb-art-card-tile')).toHaveCount(Math.min(12, CAA_RECORD.images.length));
        await expect(tip(page).locator('.mb-tt-foot:not(.mb-art-card-keys)')).toHaveText('Click: viewer · Ctrl-click: MusicBrainz\'s own');
        await own.click();
        await expect(viewer(page)).toBeVisible();
        await expect(viewer(page).locator('.mb-artv-pos')).toHaveText(`2 / ${CAA_RECORD.images.length}`);
        await expect(page.locator('.ui-dialog:visible'), 'MusicBrainz\'s dialog is not opened').toHaveCount(0);
        expect(page.url(), 'and the page is not left').toBe(REL_URL);
        expect(asked.length, 'one record for card and viewer').toBe(1);
    });

    test('Space on the hovered cover (the sidebar\'s own, and the copy) opens our viewer, as the click does (2026-10-24)', async ({ page }, testInfo) => {
        // 20 tiles: nothing cut off, so Space is not the card's "every
        // image" toggle (16 images; the default 12 tiles cut it).
        const { asked } = await openCover(page, testInfo, REL_URL, REL_FIXTURE, { settings: { sa_caa_tip_summary_tiles: 20 } });
        const own = page.locator('#sidebar .cover-art a.artwork-image');
        await hoverCard(page, own);
        await expect(tip(page).locator('.mb-art-card-tile')).toHaveCount(CAA_RECORD.images.length);
        const scrollY = await page.evaluate(() => window.scrollY);
        await page.keyboard.press('Space');
        await expect(viewer(page).locator('.mb-artv-pos')).toHaveText(`2 / ${CAA_RECORD.images.length}`);
        await expect(page.locator('.ui-dialog:visible'), 'MusicBrainz\'s dialog is not opened').toHaveCount(0);
        expect(await page.evaluate(() => window.scrollY), 'the page did not scroll').toBe(scrollY);
        await page.keyboard.press('Escape');
        await expect(viewer(page)).toBeHidden();
        await hoverCard(page, avatar(page));
        await page.keyboard.press('Space');
        await expect(viewer(page).locator('.mb-artv-pos')).toHaveText(`2 / ${CAA_RECORD.images.length}`);
        expect(asked.length, 'one record for both').toBe(1);
    });

    test('a release group page opens its own record', async ({ page }, testInfo) => {
        const { asked } = await openCover(page, testInfo, RG_URL, RG_FIXTURE);
        await expect(avatar(page)).toHaveCount(1);
        await expect(avatar(page)).toHaveAttribute('aria-label', 'Open the release group\'s cover art');
        await avatar(page).click();
        await expect(viewer(page)).toBeVisible();
        expect(asked).toEqual(['https://coverartarchive.org/release-group/fa9c43a7-2592-3336-a09b-1414b4b6ee68']);
    });

    test('an event page: its event art beside the name, the EAA card, the viewer', async ({ page }, testInfo) => {
        const { asked } = await openCover(page, testInfo, EV_URL, EV_FIXTURE);
        await expect(avatar(page)).toHaveCount(1);
        expect(await avatarFirst(page), 'the copy leads the heading').toBe(true);
        await expect(avatar(page)).toHaveAttribute('aria-label', 'Open the event\'s event art');
        await hoverCard(page, avatar(page));
        await expect(tip(page).locator('.mb-art-card-tile')).toHaveCount(Math.min(12, CAA_RECORD.images.length));
        expect(asked).toEqual(['https://eventartarchive.org/event/3f2ca30a-7de4-4964-ad30-48376535fec8']);
        await page.locator('#sidebar .event-art a.artwork-image').click();
        await expect(viewer(page)).toBeVisible();
        await expect(viewer(page).locator('.mb-artv-title')).toContainText('event art');
    });

    test('no copy with the copy switched off; the sidebar\'s own cover still opens our viewer', async ({ page }, testInfo) => {
        await openCover(page, testInfo, REL_URL, REL_FIXTURE, { settings: { sa_sidebar_picture_in_header: false } });
        await expect(page.locator('h1')).toHaveCount(1);
        await observerRan(page);
        await expect(avatar(page)).toHaveCount(0);
        await page.locator('#sidebar .cover-art a.artwork-image').click();
        await expect(viewer(page)).toBeVisible();
    });

    test('no copy without a present cover', async ({ page }, testInfo) => {
        await openCover(page, testInfo, REL_URL, REL_FIXTURE, { edit: (h) => h.replace('class="cover-art present"', 'class="cover-art"') });
        await expect(page.locator('h1')).toHaveCount(1);
        await observerRan(page);
        await expect(avatar(page)).toHaveCount(0);
    });
});
