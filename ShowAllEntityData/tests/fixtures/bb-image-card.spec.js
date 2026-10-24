'use strict';

// Brucebase and springsteenlyrics' lyrics index, 2026-10-23
// (org/foreign-images.org, phase 3, mockups B1, B2, L1), through the shared
// foreign-image path (`_fiCardHtml()`, `_fiClick()`):
//   - bb-year: the Media icons Photo, Ticket, News and Memorabilia of an
//     entry with a page of its own are ringed triggers (`a.mb-fi-media`,
//     `_BB_FI`). The card shows the icon's kind; the viewer opens on it,
//     every other kind one ← → away; Shift+← → walk ROWS. The entry's page is
//     read by `_dpParseBbPage()`, never by the detail preview (its
//     `isDetailUrl` stays `/song:`).
//   - bb-songs and sl-lyrics: a Title glyph (`_fiGlyph()`, `_BBS_FI`,
//     `_SLL_FI`) — dashed until read, the count once read, gone for none —
//     with no text, so Title's filter and sort do not change.
// See docs/claude/brucebase.md and docs/claude/springsteenlyrics.md.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadBbYearPage, loadBbSongsPage, BB_YEAR_BUTTON, BB_BUTTON } = require('../support/bbFixture');
const { loadSlListPage, SL_KINDS } = require('../support/slFixture');
const { routeDetailPages } = require('../support/detailFixture');
const { addRequiredLibs, MB_LIBRARY_PATH, USERSCRIPT_PATH } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { typeGlobalFilter, waitForSortSettled, columnFilterInput } = require('../support/filterSortAssertions');

// A wide window (2026-10-24): on a year page the sticky Event column (the
// whole name on one line) and MB-Event come first, and on 1280 px the Media
// icons sit under the sticky headers' right mask (docs/claude/brucebase.md).
test.use({ viewport: { width: 1920, height: 1000 } });

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const GIG4 = 'https://brucebase.wikidot.com/gig:1985-01-04-roads-coliseum-hampton-va';
const GIG7 = 'https://brucebase.wikidot.com/gig:1985-01-07-market-square-arena-indianapolis-in';
const GIG13 = 'https://brucebase.wikidot.com/gig:1985-01-13-carolina-coliseum-columbia-sc';
const SONG = 'https://brucebase.wikidot.com/song:4th-of-july-asbury-park-sandy';
const SONG_NONE = 'https://brucebase.wikidot.com/song:500-miles';

const tip = (page) => page.locator('#mb-stat-tooltip');
const viewer = (page) => page.locator('#mb-art-viewer');
const visibleRows = (page) => page.locator('table.tbl tbody tr:visible');
const icon = (page, href, kind) => page.locator(`table.tbl tbody a.mb-fi-media[href="${href}"][data-mb-fi-kind="${kind}"]`).first();
const glyph = (page, key, href) => page.locator(`table.tbl tbody a.mb-fi-glyph[data-mb-fi="${key}"][href$="${href}"]`).first();

/**
 * Serves every wikidot image (thumbnail, small, medium, original) as a 1 px
 * PNG, and collects the URLs asked.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string[]>}
 */
async function routeWdImages(page) {
    const asked = [];
    await page.route(/^https:\/\/brucebase\.wdfiles\.com\//, (route) => {
        asked.push(route.request().url());
        return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    });
    return asked;
}

/**
 * Collects page errors; returns the list.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {string[]}
 */
function errorsOf(page) {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    return errors;
}

/**
 * The 1985 year page, rendered, its entry pages and images routed.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object<string, *>} [settings]
 * @returns {Promise<{errors: string[], served: string[]}>}
 */
async function openYear(page, settings = {}) {
    const errors = errorsOf(page);
    await loadBbYearPage(page, '1985', { settingsOverride: { sa_render_threshold: 100000, ...settings } });
    const { served } = await routeDetailPages(page, 'bb');
    await routeWdImages(page);
    await page.click(`button[data-label="${BB_YEAR_BUTTON}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
    return { errors, served };
}

/**
 * The song list, rendered, its song pages and images routed.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object<string, *>} [settings]
 * @returns {Promise<{errors: string[], served: string[]}>}
 */
async function openSongs(page, settings = {}) {
    const errors = errorsOf(page);
    await loadBbSongsPage(page, { settingsOverride: { sa_render_threshold: 100000, ...settings } });
    const { served } = await routeDetailPages(page, 'bb');
    await routeWdImages(page);
    await page.click(`button[data-label="${BB_BUTTON}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
    return { errors, served };
}

/**
 * Hovers a link from outside, so the card is built for this hover.
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} link
 * @returns {Promise<void>}
 */
async function hover(page, link) {
    await page.mouse.move(0, 0);
    await link.scrollIntoViewIfNeeded();
    await link.hover();
}

/**
 * Writes one parsed page into the detail-page database, as `_dpGet()` would
 * have, from a fixture file.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} host - Its `_DP_SITES` key.
 * @param {?string} file - The fixture; null for a page with no images.
 * @param {string} url  - Its URL.
 * @param {string} [bare] - With no file: the page's HTML (default: a
 *   Brucebase page with a title only).
 * @returns {Promise<void>}
 */
async function seedPage(page, host, file, url, bare = '') {
    // No file: a page with a title and nothing else (no images).
    const html = file ? fs.readFileSync(path.join(__dirname, file), 'utf8')
        : bare || '<html><body><div id="page-title">500 Miles</div><div id="page-content"><p>A song.</p></div></body></html>';
    await page.evaluate(([h, hst, u]) => new Promise((resolve, reject) => {
        const data = window.__saTest.dpParse(hst, h, u);
        const req = indexedDB.open('vz-saed-detail-pages', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('pages', { keyPath: 'url' });
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
            const tx = req.result.transaction('pages', 'readwrite');
            tx.objectStore('pages').put({ url: u, v: window.__saTest.dpParserVersion, at: Date.now(), data });
            tx.oncomplete = () => { req.result.close(); resolve(); };
            tx.onerror = () => reject(tx.error);
        };
    }), [html, host, url]);
}

test.describe('the Brucebase readers (one record per saved page)', () => {
    test('a gig page: its gallery images by kind, never the side bar\'s promo or the icons', async ({ page }) => {
        await loadBbYearPage(page, '1985');
        const read = (file, url) => page.evaluate(([h, u]) => window.__saTest.dpParse('brucebase.wikidot.com', h, u),
            [fs.readFileSync(path.join(__dirname, file), 'utf8'), url]);
        const g4 = await read('detail-bb-gig-1985-01-04.html', GIG4);
        expect(g4.title).toContain('Hampton Roads Coliseum');
        expect(g4.images.map(i => i.label)).toEqual(['Photo', 'Photo', 'Ticket', 'News']);
        expect(g4.images.filter(i => /artwork-disco|storyteller|icon_/.test(i.thumb))).toEqual([]);
        // The original, and the page's own medium.jpg for gallery and news images.
        expect(g4.images[0].full).toBe('https://brucebase.wdfiles.com/local--files/gallery:1985-01-04-roads-coliseum-hampton-va/19850104_MicHampton_01.jpg');
        expect(g4.images[0].medium).toMatch(/\/19850104_MicHampton_01\.jpg\/medium\.jpg$/);
        expect(g4.images[2].medium).toBe('');
        const g7 = await read('detail-bb-gig-1985-01-07.html', GIG7);
        expect(g7.images.map(i => i.label)).toEqual(['Memorabilia', 'Ticket', 'News', 'News', 'News']);
        // The Setlist tab's gallery (files:setlist-1985): two setlist images,
        // of kind Setlist, not Other; the tab's inline small.jpg is not a
        // gallery item and is not read twice.
        const g13 = await read('detail-bb-gig-1985-01-13.html', GIG13);
        const setlists = g13.images.filter(i => i.label === 'Setlist');
        expect(setlists.map(i => i.full.replace(/^.*\//, ''))).toEqual(
            ['19850113_Setlist_01a_Handwritten.jpg', '19850113_Setlist_01b_Handwritten.jpg']);
        expect(g13.images.filter(i => i.label === 'Other')).toEqual([]);
        // A song page keeps its fields and gains its graph and lyric sheet.
        const song = await read('detail-bb-4th-of-july.html', SONG);
        expect(song.images.map(i => i.label)).toEqual(['Song graph', 'Lyric sheet']);
        expect(song.fields.map(f => f[0])).toContain('Performed live');
    });
});

test.describe('bb-year: the Media icons open the entry page\'s images (mockup B1)', () => {
    test('render asks nothing; only Photo, Ticket, Setlist, News and Memorabilia icons of entries with a page are triggers', async ({ page }) => {
        const { errors, served } = await openYear(page);
        expect(served, 'no entry page at render').toEqual([]);
        const kinds = await page.evaluate(() => Array.from(new Set(
            Array.from(document.querySelectorAll('table.tbl tbody a.mb-fi-media'), a => a.dataset.mbFiKind))).sort());
        expect(kinds).toEqual(['Memorabilia', 'News', 'Photo', 'Setlist', 'Ticket']);
        // Storyteller, Bootleg, Video … stay plain images.
        const plain = await page.evaluate(() => Array.from(document.querySelectorAll('table.tbl tbody ul.mb-bb-media > li'))
            .filter(li => !li.querySelector('a.mb-fi-media'))
            .map(li => li.querySelector('.mb-bb-media-label').textContent)
            .filter(l => ['Photo', 'Ticket', 'Setlist', 'News', 'Memorabilia'].includes(l)).length);
        expect(plain, 'every such icon of an entry with a page is a trigger').toBe(0);
        await expect(icon(page, GIG4, 'Photo')).toBeVisible();
        await expect(icon(page, GIG7, 'Memorabilia')).toBeVisible();
        expect(errors).toEqual([]);
    });

    test('hover on Photo: ONE request, the card of the photos only, titled by date and kind', async ({ page }) => {
        const { errors, served } = await openYear(page);
        await hover(page, icon(page, GIG4, 'Photo'));
        await expect(tip(page).locator('.mb-art-card-tile')).toHaveCount(2);
        await expect(tip(page).locator('.mb-tt-title').first()).toHaveText('1985-01-04 · Photo');
        await expect(tip(page).locator('.mb-tt-pill')).toHaveText(['Photo ×2']);
        // The tiles are the 250 px rendition.
        await expect(tip(page).locator('.mb-art-card-tile img').first()).toHaveAttribute('src', /\/small\.jpg$/);
        expect(served).toEqual([GIG4]);
        // The same row's Ticket answers from memory.
        await hover(page, icon(page, GIG4, 'Ticket'));
        await expect(tip(page).locator('.mb-tt-title').first()).toHaveText('1985-01-04 · Ticket');
        await expect(tip(page).locator('.mb-art-card-tile')).toHaveCount(1);
        expect(served).toEqual([GIG4]);
        expect(errors).toEqual([]);
    });

    test('the Setlist icon is ringed: its card shows the two setlist images, a click opens the viewer on the first', async ({ page }) => {
        const { errors, served } = await openYear(page);
        // 1985-01-13 (debug/media-icons.html): the Setlist icon was a bare
        // <img> beside the ringed Photo, Ticket, News and Memorabilia.
        await expect(icon(page, GIG13, 'Setlist')).toBeVisible();
        await hover(page, icon(page, GIG13, 'Setlist'));
        await expect(tip(page).locator('.mb-tt-title').first()).toHaveText('1985-01-13 · Setlist');
        await expect(tip(page).locator('.mb-art-card-tile')).toHaveCount(2);
        await expect(tip(page).locator('.mb-tt-pill')).toHaveText(['Setlist ×2']);
        await expect(tip(page).locator('.mb-art-card-tile img').first()).toHaveAttribute('src', /Setlist_01a_Handwritten\.jpg\/small\.jpg$/);
        expect(served).toEqual([GIG13]);
        await page.mouse.move(0, 0);
        await icon(page, GIG13, 'Setlist').click();
        await expect(viewer(page)).toBeVisible();
        await expect(viewer(page).locator('.mb-artv-img')).toHaveAttribute('src', /19850113_Setlist_01a_Handwritten\.jpg/);
        expect(served).toEqual([GIG13]);
        expect(errors).toEqual([]);
    });

    test('a ringed icon: no native tooltip over its card, the card says Space opens the viewer; with the card off its own tip names it', async ({ page }) => {
        const { errors } = await openYear(page);
        const a = icon(page, GIG4, 'Photo');
        // vzell, 2026-10-24: the <li>'s title drew the browser's own tooltip
        // over the card. The name lives on the trigger, whose title the card
        // stashes while it shows.
        await expect(a.locator('xpath=..')).not.toHaveAttribute('title', /.*/);
        await hover(page, a);
        await expect(tip(page).locator('.mb-art-card-tile')).toHaveCount(2);
        const titled = await a.evaluate((el) => {
            const out = [];
            for (let n = el; n && n.nodeType === 1; n = n.parentElement) if (n.getAttribute('title')) out.push(n.tagName + ': ' + n.getAttribute('title'));
            return out;
        });
        expect(titled, 'no title on the trigger or above it while the card shows').toEqual([]);
        await expect(tip(page).locator('.mb-tt-foot:not(.mb-art-card-keys)')).toHaveText(/^Click or Space: viewer/);
        // An unringed icon keeps its name on the <li>.
        const plain = page.locator('table.tbl tbody ul.mb-bb-media > li', { hasNot: page.locator('a') }).first();
        await expect(plain).toHaveAttribute('title', /\S/);
        expect(errors).toEqual([]);
    });

    test('a ringed icon with the card off: its own tip names the icon', async ({ page }) => {
        const { errors } = await openYear(page, { sa_bb_tip_images: false });
        const a = icon(page, GIG4, 'Photo');
        await hover(page, a);
        await expect(tip(page)).toContainText('Photo');
        await expect(tip(page).locator('.mb-art-card-tile')).toHaveCount(0);
        expect(errors).toEqual([]);
    });

    test('hover on Memorabilia shows the pass', async ({ page }) => {
        const { errors, served } = await openYear(page);
        await hover(page, icon(page, GIG7, 'Memorabilia'));
        await expect(tip(page).locator('.mb-art-card-tile')).toHaveCount(1);
        await expect(tip(page).locator('.mb-art-card-tile img')).toHaveAttribute('src', /Pass_01\.jpg\/small\.jpg$/);
        expect(served).toEqual([GIG7]);
        expect(errors).toEqual([]);
    });

    test('a click opens the viewer on the icon\'s kind, every kind one ← → away; Shift+→ goes to the next ROW', async ({ page }) => {
        const { errors, served } = await openYear(page, { sa_bb_tip_images: false });
        // Card off: pointing asks nothing, and shows no card.
        await hover(page, icon(page, GIG4, 'Ticket'));
        await expect(tip(page)).toBeHidden();
        expect(served).toEqual([]);
        await icon(page, GIG4, 'Ticket').click();
        // Grouped by kind: Photo, Photo, Ticket, News — the Ticket is 3 of 4.
        await expect(viewer(page).locator('.mb-artv-pos')).toHaveText('3 / 4');
        await expect(viewer(page).locator('.mb-artv-bar a.mb-artv-btn', { hasText: 'Entry page' })).toHaveAttribute('href', GIG4);
        await page.keyboard.press('ArrowLeft');
        await expect(viewer(page).locator('.mb-artv-pos')).toHaveText('2 / 4');
        expect(served).toEqual([GIG4]);
        // Shift+→: the next row (01-05), not the same row's News icon.
        const pos = viewer(page).locator('.mb-artv-rowpos');
        const [, k, n] = (await pos.textContent()).match(/^row (\d+) of (\d+)$/);
        await page.keyboard.press('Shift+ArrowRight');
        await expect.poll(() => served.length).toBe(2);
        expect(served[1]).toMatch(/\/gig:1985-01-05-/);
        // One stop per row: n counts rows, not icons.
        await expect(pos).toHaveText(`row ${Number(k) + 1} of ${n}`);
        expect(Number(n)).toBe(await visibleRows(page).filter({ has: page.locator('a.mb-fi-media') }).count());
        expect(errors).toEqual([]);
    });

    test('Ctrl-click keeps the link', async ({ page }) => {
        const { errors, served } = await openYear(page);
        const taken = await page.evaluate((href) => {
            const a = document.querySelector(`table.tbl tbody a.mb-fi-media[href="${href}"]`);
            let prevented = null;
            document.addEventListener('click', (e) => { prevented = e.defaultPrevented; e.preventDefault(); }, { once: true });
            a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true, button: 0 }));
            return prevented;
        }, GIG4);
        expect(taken, 'Ctrl-click not taken').toBe(false);
        await expect(viewer(page)).toBeHidden();
        expect(served).toEqual([]);
        expect(errors).toEqual([]);
    });

    test('the Media column reads the same: a Photo filter keeps exactly the rows with a Photo icon', async ({ page }) => {
        const { errors } = await openYear(page);
        const withPhoto = await page.evaluate(() => Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter(tr => Array.from(tr.querySelectorAll('.mb-bb-media-label')).some(s => s.textContent === 'Photo')).length);
        expect(withPhoto).toBeGreaterThan(0);
        const at = await page.locator('table.tbl thead tr:first-child th').evaluateAll(ths => ths.map(th => th.dataset.colName).indexOf('Media'));
        expect(at, 'the Media column').toBeGreaterThanOrEqual(0);
        const input = columnFilterInput(page, at);
        await input.click();
        await input.pressSequentially('Photo');
        await expect.poll(() => visibleRows(page).count(), { timeout: 15000 }).toBe(withPhoto);
        expect(errors).toEqual([]);
    });

    test('a ringed Media icon stays the image card\'s: never the event preview\'s, though it links the event page', async ({ page }) => {
        // Since 2026-10-24 every TEXT link to an event page previews it
        // (bb-event-preview.spec.js); the icon is an <img> link and keeps
        // its image card. Card off here, so any card would be the preview's.
        const { errors, served } = await openYear(page, { sa_bb_detail_preview: true, sa_bb_tip_images: false });
        await page.mouse.move(0, 0);
        await page.locator(`table.tbl tbody td a.mb-fi-media[href="${GIG4}"]`).first().hover();
        await page.keyboard.down('Control');
        await page.evaluate(() => new Promise(r => setTimeout(r, 800)));
        await expect(page.locator('#mb-dp-peek')).toBeHidden();
        await page.keyboard.up('Control');
        expect(served).toEqual([]);
        expect(errors).toEqual([]);
    });
});

test.describe('bb-songs: the Title glyph (mockup B2)', () => {
    test('render asks nothing; every glyph unread, with no text', async ({ page }) => {
        const { errors, served } = await openSongs(page);
        expect(served).toEqual([]);
        const g = await page.evaluate(() => {
            const all = Array.from(document.querySelectorAll('table.tbl tbody a.mb-fi-glyph[data-mb-fi="bbs"]'));
            return { n: all.length, cold: all.filter(a => a.dataset.mbFiState === 'cold').length, text: all.map(a => a.textContent).join('') };
        });
        expect(g.n).toBeGreaterThan(100);
        expect(g.cold).toBe(g.n);
        expect(g.text).toBe('');
        expect(errors).toEqual([]);
    });

    test('hover: ONE request, the graph and the lyric sheet; the glyph shows 2; a song with none hides its glyph', async ({ page }) => {
        const { errors, served } = await openSongs(page);
        await hover(page, glyph(page, 'bbs', '/song:4th-of-july-asbury-park-sandy'));
        await expect(tip(page).locator('.mb-art-card-tile')).toHaveCount(2);
        await expect(tip(page).locator('.mb-tt-pill')).toHaveText(['Song graph', 'Lyric sheet']);
        expect(served).toEqual([SONG]);
        await expect(glyph(page, 'bbs', '/song:4th-of-july-asbury-park-sandy')).toHaveAttribute('data-mb-fi-n', '2');
        expect(errors).toEqual([]);
    });

    test('Title filter and sort are unchanged by the glyph and its count', async ({ page }) => {
        const { errors } = await openSongs(page);
        await hover(page, glyph(page, 'bbs', '/song:4th-of-july-asbury-park-sandy'));
        await expect(glyph(page, 'bbs', '/song:4th-of-july-asbury-park-sandy')).toHaveAttribute('data-mb-fi-n', '2');
        await page.mouse.move(0, 0);
        const all = await visibleRows(page).count();
        // The count "2" is CSS: a filter "2" does not match 4th of July by it.
        await typeGlobalFilter(page, 'Asbury Park (Sandy)2');
        await expect.poll(() => visibleRows(page).count()).toBe(0);
        await page.locator('#mb-global-filter-input').fill('');
        await expect.poll(() => visibleRows(page).count()).toBe(all);
        const asc = page.locator('table.tbl thead th[data-col-name="Title"] .sort-icon-btn', { hasText: '▲' }).first();
        await waitForSortSettled(page, () => asc.click());
        const titles = await page.evaluate(() => Array.from(document.querySelectorAll('table.tbl tbody tr'), tr => tr.cells[0].textContent.trim()));
        const sorted = [...titles].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
        expect(titles.slice(0, 20)).toEqual(sorted.slice(0, 20));
        expect(errors).toEqual([]);
    });

    test('the glyph is the image card\'s, not the detail preview\'s', async ({ page }) => {
        const { errors } = await openSongs(page, { sa_bb_detail_preview: true, sa_bb_tip_images: false });
        await hover(page, glyph(page, 'bbs', '/song:4th-of-july-asbury-park-sandy'));
        await page.keyboard.down('Control');
        await page.evaluate(() => new Promise(r => setTimeout(r, 800)));
        await expect(page.locator('#mb-dp-peek')).toBeHidden();
        await page.keyboard.up('Control');
        expect(errors).toEqual([]);
    });

    test('after a reload the songs read before are painted from the database, with no request; one with no images loses its glyph', async ({ page }) => {
        const { errors, served } = await openSongs(page);
        await seedPage(page, 'brucebase.wikidot.com', 'detail-bb-4th-of-july.html', SONG);
        await seedPage(page, 'brucebase.wikidot.com', null, SONG_NONE);
        await page.reload();
        await addRequiredLibs(page);
        await page.addScriptTag({ path: MB_LIBRARY_PATH });
        await page.addScriptTag({ path: USERSCRIPT_PATH });
        await page.click(`button[data-label="${BB_BUTTON}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await expect(glyph(page, 'bbs', '/song:4th-of-july-asbury-park-sandy')).toHaveAttribute('data-mb-fi-state', 'done');
        await expect(glyph(page, 'bbs', '/song:4th-of-july-asbury-park-sandy')).toHaveAttribute('data-mb-fi-n', '2');
        await expect(glyph(page, 'bbs', '/song:500-miles')).toHaveAttribute('data-mb-fi-state', 'none');
        await expect(glyph(page, 'bbs', '/song:500-miles')).toBeHidden();
        expect(served).toEqual([]);
        expect(errors).toEqual([]);
    });

    test('a click opens the viewer on the song\'s images', async ({ page }) => {
        const { errors, served } = await openSongs(page);
        await glyph(page, 'bbs', '/song:4th-of-july-asbury-park-sandy').click();
        await expect(viewer(page).locator('.mb-artv-pos')).toHaveText('1 / 2');
        await expect(viewer(page).locator('.mb-artv-bar a.mb-artv-btn', { hasText: 'Song page' })).toHaveAttribute('href', SONG);
        expect(served).toEqual([SONG]);
        expect(errors).toEqual([]);
    });

    test('the song preview card now shows the song\'s images', async ({ page }) => {
        const { errors } = await openSongs(page, { sa_bb_detail_preview: true });
        await page.mouse.move(0, 0);
        await page.locator('table.tbl tbody a:not(.mb-fi-glyph)[href$="/song:4th-of-july-asbury-park-sandy"]').first().hover();
        await page.keyboard.down('Control');
        await expect(page.locator('#mb-dp-peek')).toBeVisible();
        await page.keyboard.up('Control');
        await expect(page.locator('#mb-dp-peek .mb-dp-thumbs img')).toHaveCount(2);
        expect(errors).toEqual([]);
    });
});

test.describe('sl-lyrics: the Title glyph and a single-image card (mockup L1)', () => {
    /**
     * The lyrics letter B, rendered, its song pages and images routed.
     *
     * @param {import('@playwright/test').Page} page
     * @param {Object<string, *>} [settings]
     * @returns {Promise<{errors: string[], served: string[]}>}
     */
    async function openLyrics(page, settings = {}) {
        const errors = errorsOf(page);
        const { spec } = await loadSlListPage(page, { kind: 'lyrics-b', settingsOverride: { sa_render_threshold: 100000, ...settings } });
        const { served } = await routeDetailPages(page, 'sl');
        await page.route(/^https:\/\/(?:www\.)?springsteenlyrics\.com\/lyrics\/images\//, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
        await page.click(`button[data-label="${spec.button}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        return { errors, served };
    }

    test('render asks nothing; Baby Me: one request, the single big picture; click opens the viewer', async ({ page }) => {
        const { errors, served } = await openLyrics(page);
        expect(served).toEqual([]);
        const g = glyph(page, 'sll', 'lyrics.php?song=babyme');
        await expect(g).toHaveAttribute('data-mb-fi-state', 'cold');
        await hover(page, g);
        await expect(tip(page).locator('img.mb-fi-card-big')).toHaveCount(1);
        expect(served).toHaveLength(1);
        expect(served[0]).toMatch(/\/lyrics\.php\?song=babyme$/);
        await expect(g).toHaveAttribute('data-mb-fi-n', '1');
        await page.mouse.move(0, 0);
        await g.click();
        await expect(viewer(page).locator('.mb-artv-pos')).toHaveText('1 / 1');
        expect(errors).toEqual([]);
    });

    test('Badlands: its album covers as a contact sheet, the glyph counting them', async ({ page }) => {
        const { errors, served } = await openLyrics(page);
        const g = glyph(page, 'sll', 'lyrics.php?song=badlands');
        await hover(page, g);
        await expect(tip(page).locator('.mb-art-card-tile').first()).toBeVisible();
        await expect(tip(page)).toContainText('14 images');
        await expect(g).toHaveAttribute('data-mb-fi-n', '14');
        expect(served).toHaveLength(1);
        expect(errors).toEqual([]);
    });

    test('after a reload a song page read before with no pictures has no glyph, with no request', async ({ page }) => {
        const { errors, served } = await openLyrics(page);
        const url = await glyph(page, 'sll', 'lyrics.php?song=babydoll').evaluate(a => a.href);
        await seedPage(page, 'springsteenlyrics.com', null, url,
            '<html><body><div class="project-detail"><h3>Baby Doll</h3><p><em></em></p></div></body></html>');
        await page.reload();
        await addRequiredLibs(page);
        await page.addScriptTag({ path: MB_LIBRARY_PATH });
        await page.addScriptTag({ path: USERSCRIPT_PATH });
        await page.click(`button[data-label="${SL_KINDS['lyrics-b'].button}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await expect(glyph(page, 'sll', 'lyrics.php?song=babydoll')).toHaveAttribute('data-mb-fi-state', 'none');
        await expect(glyph(page, 'sll', 'lyrics.php?song=babydoll')).toBeHidden();
        await expect(glyph(page, 'sll', 'lyrics.php?song=babyme')).toHaveAttribute('data-mb-fi-state', 'cold');
        expect(served).toEqual([]);
        expect(errors).toEqual([]);
    });
});
