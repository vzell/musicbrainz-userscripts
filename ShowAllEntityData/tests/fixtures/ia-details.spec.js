'use strict';

// archive.org's item page, pageType ia-details (2026-11-03,
// org/foreign-detail-PTs.org; docs/claude/internet-archive.md "An item page").
// Modelled on MusicBrainz's release-tracks: a sub-table per disc, a file's
// MP3 copy as a column, the item's pictures and facts above the tables.
// One anonymous request: the metadata API (answered here by the GM stub from
// the captures ext-ia-metadata-*.json; the show's capture is trimmed to the
// fields read, so it has no MD5).
//
// Pins:
//   1. Tracks: ONE request; a sub-table per disc ("1-01." in the names),
//      named with its format and running time; the row's values;
//   2. the pictures (cover first) and facts above the tables; a picture
//      opens the artwork viewer;
//   3. "All files": every file, one row each;
//   4. a video item: its video files;
//   5. the toolbar is named after the item.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const FILE = path.join(__dirname, 'ia-details.html');
const FX = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, `ext-${name}.json`), 'utf8'));
const SHOW = 'bs1975-12-27.aud.jk.cb.hrubesh.flac16';
const VIDEO = '1975-bruce-springsteen-widener-college-audience-cam';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

/**
 * A capture as a GM stub answer.
 *
 * @param {Object} f - `{url, status, contentType, body}`.
 * @returns {[string, Object]}
 */
const answer = (f) => [f.url, { status: f.status, responseHeaders: `Content-Type: ${f.contentType}`, responseText: f.body }];

/**
 * Loads an item page with the item's metadata as the GM answer; archive.org's
 * files (the pictures) are served locally, nothing else reaches the network.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} id
 * @param {Object} [settings]
 * @returns {Promise<string[]>} Page errors.
 */
async function open(page, id, settings = {}) {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
    await page.context().addInitScript((r) => { window.__gmXhrResponses = r; }, Object.fromEntries([answer(FX(`ia-metadata-${id}`))]));
    await loadUserscriptPage(page, {
        url: `https://archive.org/details/${id}`, fixtureFile: FILE, testMode: true,
        settingsOverride: { sa_enable_internetarchive: true, sa_render_threshold: 100000, sa_ia_play_in_place: true, ...settings },
    });
    const png = (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    await page.route('https://archive.org/download/**', png);
    return errors;
}

/**
 * Presses one of the item's buttons and waits for the render.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} label
 * @returns {Promise<void>}
 */
async function press(page, label) {
    await page.locator(`#mb-ia-root button[data-label="${label}"]`).click();
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

const apiLog = (page) => page.evaluate(() => (window.__gmXhrLog || []).map(r => r.url).filter(u => u.startsWith('https://archive.org/')));

/**
 * Every sub-table of our section: its h3's text, its column names, its rows' cell texts.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<{h3: string, heads: string[], rows: string[][]}>>}
 */
const subTables = (page) => page.evaluate(() => Array.from(document.querySelectorAll('#mb-ia-root table.tbl')).map((t) => {
    let h = t.previousElementSibling;
    while (h && h.tagName !== 'H3') h = h.previousElementSibling;
    return {
        h3: h ? h.textContent.replace(/\s+/g, ' ').trim() : '',
        heads: Array.from(t.querySelectorAll('thead tr:first-child th')).map(th => th.dataset.colName || th.textContent.trim()),
        rows: Array.from(t.tBodies[0].rows).map(r => Array.from(r.cells).map(c => c.textContent.trim())),
    };
}).filter(x => x.rows.length));

test.describe('archive.org: an item page (ia-details)', () => {
    test('Tracks: one request; a sub-table per disc with its format and running time; the MP3 copy as a column', async ({ page }) => {
        const errors = await open(page, SHOW);
        await press(page, 'Show all tracks');
        expect(await apiLog(page), 'one request, the metadata API').toEqual([`https://archive.org/metadata/${SHOW}`]);
        const st = await subTables(page);
        expect(st.map(x => x.h3.match(/Disc \d · Flac · [\d:]+/i)?.[0])).toEqual(['Disc 1 · Flac · 1:13:19', 'Disc 2 · Flac · 1:19:37']);
        expect(st.map(x => x.rows.length)).toEqual([10, 9]);
        expect(st[0].heads.slice(0, 6)).toEqual(['#', 'Title', 'Length', 'File', 'Size', 'VBR MP3']);
        expect(st[0].heads).toContain('Play');
        const first = st[0].rows[0];
        const at = (col) => first[st[0].heads.indexOf(col)];
        expect([at('#'), at('Title'), at('Length'), at('File'), at('Size'), at('VBR MP3')])
            .toEqual(['1', 'Intro', '0:50', '1-01. Intro.flac', '3.4 MB', '0.89 MB']);
        expect(st[1].rows[0][st[1].heads.indexOf('Title')]).toBe('Jungleland');
        // The title links the track on archive.org (its card: the show, the track marked).
        await expect(page.locator('#mb-ia-root table.tbl a', { hasText: /^Intro$/ }).first())
            .toHaveAttribute('href', `https://archive.org/details/${SHOW}/1-01.%20Intro.flac`);
        expect(errors).toEqual([]);
    });

    test('the head as release-tracks: subheader, Description (closed), Details cards and Pictures tiles (open); a picture opens the viewer', async ({ page }) => {
        // vzell 2026-11-04: "emulate the MB PT for release-tracks".
        const errors = await open(page, SHOW);
        await press(page, 'Show all tracks');
        // The subheader under the h1, as a release's "~ Release by …" (this item names no creator).
        await expect(page.locator('#mb-ia-root > h1 + p.mb-ia-det-sub')).toHaveText('~ Audio (1975-12-27: Tower Theater, Philadelphia)');
        const head = page.locator('#mb-ia-root .mb-ia-det-head');
        const h2s = head.locator(':scope > h2.mb-ia-det-h2');
        await expect(h2s).toHaveText([/Description$/, /Details \(\d+\)$/, /Pictures \(7\)$/]);
        // Collapsible h2 sections (makeH2sCollapsible() ran after they went in): Description starts closed,
        // like a release's Annotation; Details and Pictures open.
        await expect(h2s.nth(0)).toHaveClass(/mb-toggle-h2/);
        await expect(head.locator('.mb-ia-det-desc')).toBeHidden();
        await expect(head.locator('.mb-ia-det-details')).toBeVisible();
        await h2s.nth(0).click();
        await expect(head.locator('.mb-ia-det-desc')).toBeVisible();
        // Details: the Sidebar section's cards.
        const show = head.locator('.mb-sb-card', { has: page.locator('.mb-sb-card-head', { hasText: /^Show/ }) });
        await expect(show).toContainText('1975-12-27');
        await expect(show).toContainText('Tower Theater, Philadelphia');
        // The tracks' lengths added up (9176.4 s, rounded).
        await expect(show).toContainText('Running time2:32:57');
        await expect(head.locator('.mb-sb-card', { hasText: 'External links' }).locator('a').first())
            .toHaveAttribute('href', /brucebase\.wikidot\.com/);
        await expect(head.locator('.mb-sb-card', { hasText: 'Collections' }).locator('.mb-sb-pill')).toHaveCount(3);
        // A card folds on its heading.
        await show.locator('.mb-sb-card-head').click();
        await expect(show).toHaveClass(/mb-sb-card-shut/);
        await show.locator('.mb-sb-card-head').click();
        await expect(show).not.toHaveClass(/mb-sb-card-shut/);
        // Pictures: the Cover art section's tiles, the cover first.
        const tiles = head.locator('.mb-ia-det-art figure.mb-release-art-tile');
        await expect(tiles).toHaveCount(7);
        await expect(tiles.first().locator('figcaption')).toHaveText('Cover');
        // Above the data heading, as release-tracks' sections.
        expect(await page.evaluate(() => {
            const h = document.querySelector('#mb-ia-root .mb-ia-det-head');
            return !!(h && h.nextElementSibling && h.nextElementSibling.matches('h2.mb-ia-list-heading'));
        })).toBe(true);
        // A filter re-render keeps the head as it is: not rebuilt, the folds kept.
        await head.evaluate((h) => { h.dataset.mbProbe = '1'; });
        await page.locator('#mb-global-filter-input').fill('Jungleland');
        await expect(page.locator('#mb-ia-root h3', { hasText: 'Disc 2' })).toContainText('(1 of 9)');
        await expect(head).toHaveAttribute('data-mb-probe', '1');
        await expect(head.locator('.mb-ia-det-desc')).toBeVisible();
        await tiles.first().locator('a').click();
        await expect(page.locator('#mb-art-viewer')).toBeVisible();
        expect(errors).toEqual([]);
    });

    test('All files: every file of the item, one row each', async ({ page }) => {
        const errors = await open(page, SHOW);
        await press(page, 'Show all files');
        const st = await subTables(page);
        const files = JSON.parse(FX(`ia-metadata-${SHOW}`).body).files.length;
        expect(st).toHaveLength(1);
        expect(st[0].heads).toEqual(['Name', 'Format', 'Source', 'Original', 'Size', 'Length', 'MD5']);
        expect(st[0].rows).toHaveLength(files);
        expect(errors).toEqual([]);
    });

    test('a video item: its video files, with a Play here tile', async ({ page }) => {
        const errors = await open(page, VIDEO);
        await press(page, 'Show all tracks');
        const st = await subTables(page);
        expect(st).toHaveLength(1);
        expect(st[0].h3).toMatch(/^▼?Videos \(1\)/);
        expect(st[0].heads).toEqual(['Play', 'Title', 'Format', 'Length', 'Size']);
        expect(st[0].rows.length).toBeGreaterThan(0);
        expect(errors).toEqual([]);
    });

    test('before any button, the item\'s own content previews (its Brucebase link); the site\'s top bar does not', async ({ page }) => {
        // The item page is plain HTML; its content is main#maincontent
        // (_iaShadowLinkInScope(), 2026-11-03).
        const errors = await open(page, SHOW, { sa_pop_ext: true });
        const r = await page.evaluate(() => ({
            bb: window.__saTest.popResolve(document.querySelector('#maincontent a[href*="brucebase"]')),
            nav: window.__saTest.popResolve(document.querySelector('#topnav a[href="/details/etree"]')),
        }));
        // The key keeps the link as written (http); the reader reads the year page as https.
        expect(r.bb).toBe('ext|ext:bbdate:http://brucebase.wikidot.com/1975#271275');
        expect(r.nav, 'archive.org\'s top bar').toBeNull();
        expect(errors).toEqual([]);
    });

    test('the toolbar is named after the item, before any button', async ({ page }) => {
        const errors = await open(page, SHOW);
        await expect(page.locator('#mb-ia-root h1.mb-ia-h1 bdi')).toHaveText('Internet Archive: Bruce Springsteen - 1975-12-27, Tower Theater, Philadelphia');
        await expect(page.locator('#mb-ia-root button[data-label="Show all tracks"]')).toBeVisible();
        expect(await apiLog(page), 'nothing asked before a button').toEqual([]);
        expect(errors).toEqual([]);
    });
});
