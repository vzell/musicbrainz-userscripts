'use strict';

// The CAA/EAA column redesign (org/redesign-CAA-EAA-column.org): the grid /
// grouped / list cell layouts (C1/C2), the type chips (A2), the two artwork
// cards (B1 on the icon, B2 on one image), the viewer opened from the column
// (D1) and the two artwork findings.
//
// ── What each test pins, and the adjacent property it avoids ────────────────
//
//  - LAYOUT: the grid is a property of the EXPANDED cell only. A collapsed
//    cell must keep its old width, or every row of a long table widens; so
//    the test measures both states, not just "is a grid".
//  - FILTER PARITY: "Medi" and "outs" must still FILTER the rows (row count)
//    AND be MARKED on the tile (highlight span). Either alone passes on a
//    plausible bug: a layout that drops the badge classes keeps the row count
//    (the search index is separate) but loses the mark.
//  - CSS ONLY: switching layout must not rebuild a cell. Asserted on the
//    cell's markup being byte-identical across the switch — a rebuild would
//    produce equal-looking markup with new nodes, so identity of one node is
//    checked as well.
//  - NOT TEXT: chip letters and group headers are CSS content. Asserted
//    through the filter text itself (`__saTest.cleanColumnText`) and a typed
//    filter that would match them if they were text.
//  - CARDS SURVIVE A RE-RENDER: the cards come from one delegated engine, so
//    they must work on a row rendered after the first build.
//  - VIEWER ROWS ARE THE VISIBLE ROWS: Shift+→ with a filter active must skip
//    a row the filter removed — a plain "next row in the source array" passes
//    without a filter.
//  - FINDINGS ARRIVE LATE: the menu counts come from a re-stamp after the
//    artwork loaded; a release without artwork and a digital release are not
//    counted.
//
// Network-free: the release-group shell of caa-artwork-summary.spec.js, with
// the Promotion release's Format rewritten to "Digital Media", and archive
// records routed per release. `route.fulfill({status})`, never abort().

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { collectPageErrors } = require('../support/liveAssertions');
const { loadFromDiskFixture } = require('../support/diskFixture');
const { waitForCaaEaaComplete } = require('../support/asyncCompletion');
const { findingRow, clickFinding } = require('../support/findingsMenu');
const { R, ONE_PX_PNG, open, cell, expandCell, caaFilter, rowCount, viewer } = require('../support/caaColumnFixture');

test.describe('CAA/EAA column redesign', () => {
    let pageErrors;

    test.beforeEach(({ page }) => {
        pageErrors = collectPageErrors(page);
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('grid is the default: an expanded cell is a sheet of tiles, a collapsed cell keeps its width', async ({ page }) => {
        test.setTimeout(120000);
        await open(page);
        expect(await page.evaluate(() => document.documentElement.dataset.mbArtLayout)).toBe('grid');

        const ul = cell(page, R.sixteen).locator('ul.mb-caa-art-ul');
        const collapsed = await ul.evaluate((u) => ({ display: getComputedStyle(u).display, width: u.getBoundingClientRect().width }));
        expect(collapsed.display, 'a collapsed cell is not a grid').not.toBe('grid');

        await expandCell(page, R.sixteen);
        const expanded = await ul.evaluate((u) => {
            const tiles = Array.from(u.querySelectorAll(':scope > li.mb-caa-art-li-image'));
            const r = tiles[0].getBoundingClientRect();
            return {
                display: getComputedStyle(u).display,
                tile: [Math.round(r.width), Math.round(r.height)],
                tops: new Set(tiles.map((t) => Math.round(t.getBoundingClientRect().top))).size,
                star: getComputedStyle(tiles[0], '::after').content,
            };
        });
        expect(expanded.display).toBe('grid');
        expect(expanded.tile, 'sa_caa_cell_tile_size default').toEqual([64, 64]);
        expect(expanded.tops, '16 tiles, 4 per line (sa_caa_cell_grid_cols)').toBe(4);
        expect(expanded.star, 'the main front is starred').toBe('"★"');

        await cell(page, R.sixteen).locator('[data-caa-expand-btn]').click();
        const again = await ul.evaluate((u) => ({ display: getComputedStyle(u).display, width: u.getBoundingClientRect().width }));
        expect(again.display).not.toBe('grid');
        expect(Math.round(again.width)).toBe(Math.round(collapsed.width));
    });

    test('a typed "Medi" and "outs" filter the rows AND mark the tile that matches', async ({ page }) => {
        test.setTimeout(120000);
        await open(page);
        await caaFilter(page, 0, 'Medi');
        expect(await rowCount(page, 0), 'sixteen, noFront, outside and plain have a Medium image').toBe(4);
        await expect(cell(page, R.sixteen).locator('.mb-caa-type-badge > span .mb-column-filter-highlight'),
            'the four Medium tiles of the 16-image cell').toHaveText(['Medi', 'Medi', 'Medi', 'Medi']);
        await expandCell(page, R.sixteen);
        const outline = await cell(page, R.sixteen).locator('li.mb-caa-art-li-image[data-mb-art-i="7"]')
            .evaluate((li) => getComputedStyle(li).outlineStyle);
        expect(outline, 'the matching tile is outlined: its caption is cut to one line').toBe('solid');

        await caaFilter(page, 0, 'outs');
        expect(await rowCount(page, 0)).toBe(1);
        await expect(cell(page, R.outside).locator('.mb-caa-art-comment .mb-column-filter-highlight')).toHaveText('outs');
        await expect(cell(page, R.outside).locator('[data-caa-expand-btn]'),
            'a collapsed cell still says a match is inside').toHaveClass(/mb-collapse-toggle-has-match/);
    });

    test('the layout is CSS only, and the ▦ button cycles grid → grouped → list and remembers it', async ({ page }) => {
        test.setTimeout(120000);
        await open(page);
        await expandCell(page, R.sixteen);
        const before = await cell(page, R.sixteen).evaluate((td) => {
            window.__mbProbeLi = td.querySelector('li.mb-caa-art-li-image');
            return td.innerHTML;
        });
        const sortBefore = await page.locator('.mb-sort-status').allTextContents();

        await page.locator('.mb-caa-layout-hdr-btn').first().click();
        expect(await page.evaluate(() => document.documentElement.dataset.mbArtLayout)).toBe('grouped');
        const grouped = await cell(page, R.sixteen).evaluate((td) => ({
            same: td.innerHTML,
            node: td.querySelector('li.mb-caa-art-li-image') === window.__mbProbeLi,
            headers: Array.from(td.querySelectorAll('li[data-mb-art-grp-hdr]'))
                .sort((a, b) => Number(getComputedStyle(a).order) - Number(getComputedStyle(b).order))
                .map((li) => li.dataset.mbArtGrpHdr),
            text: window.__saTest.cleanColumnText(td),
        }));
        expect(grouped.same, 'no cell is rebuilt by a layout switch').toBe(before);
        expect(grouped.node).toBe(true);
        expect(grouped.headers, 'chip vocabulary first (Front, Back, Medium), then first appearance')
            .toEqual(['Front ×1', 'Back ×1', 'Medium ×4', 'Other ×3', 'Liner ×4', 'Poster ×2', 'Sticker ×1']);
        expect(grouped.text, 'a group header is never filter text').not.toContain('×');
        await expect(page.locator('.mb-sort-status'), 'the header click did not sort').toHaveText(sortBefore);

        await page.locator('.mb-caa-layout-hdr-btn').first().click();
        expect(await page.evaluate(() => document.documentElement.dataset.mbArtLayout)).toBe('list');
        expect(await cell(page, R.sixteen).locator('ul.mb-caa-art-ul').evaluate((u) => getComputedStyle(u).display)).toBe('block');
        expect(await page.evaluate(() => window.__saTest.artCellLayout()), 'remembered (GM storage)').toBe('list');
    });

    test('chips: filled, hollow and counted — and never filter text', async ({ page }) => {
        test.setTimeout(120000);
        await open(page);
        const chips = (mbid) => cell(page, mbid).locator('.mb-caa-type-chip').evaluateAll((cs) => cs.map((c) =>
            `${c.dataset.mbChip}${c.hasAttribute('data-mb-chip-on') ? '+' : '-'}${c.dataset.mbChipN || ''}|${c.textContent}`));
        expect(await chips(R.noFront)).toEqual(['F-|', 'B+|', 'Sp-|', 'M+|', 'Bk-|', 'T-|']);
        expect(await chips(R.sixteen)).toEqual(['F+|', 'B+|', 'Sp-|', 'M+4|', 'Bk-|', 'T-|']);
        const text = await cell(page, R.noFront).evaluate((td) => window.__saTest.cleanColumnText(td));
        expect(text).toContain('Medium');
        expect(text).not.toMatch(/\bBk\b|\bSp\b/);
        await caaFilter(page, 0, 'Bk');
        expect(await rowCount(page, 0), '"Bk" is a chip, not text').toBe(0);
    });

    test('B2: hovering an image shows one card carrying the cell\'s own filter marks, also after a re-render', async ({ page }) => {
        test.setTimeout(120000);
        await open(page);
        await caaFilter(page, 0, 'Medi');
        await expandCell(page, R.sixteen);
        await cell(page, R.sixteen).locator('li.mb-caa-art-li-image[data-mb-art-i="8"]').hover();
        const tip = page.locator('#mb-stat-tooltip');
        await expect(tip).toBeVisible();
        await expect(tip).toContainText('Image 9 of 16');
        await expect(tip).toContainText('Medium 2 of 4');
        await expect(tip.locator('.mb-column-filter-highlight')).toHaveText('Medi');
        await expect(page.locator('#mb-art-hover-preview'), 'the card replaces the separate preview').toBeHidden();
        await expect(page.locator('#mb-art-bigbox-tooltip')).toBeHidden();

        await page.mouse.move(0, 0);
        await caaFilter(page, 0, '');   // re-render: every row is a fresh clone now
        await expandCell(page, R.sixteen);
        await cell(page, R.sixteen).locator('li.mb-caa-art-li-image[data-mb-art-i="1"]').hover();
        await expect(tip).toBeVisible();
        await expect(tip).toContainText('Image 2 of 16');
        await expect(tip, 'image 2 of the record is the archive\'s main back').toContainText('Main back: yes');
    });

    test('B1: the icon shows the release\'s artwork card — 12 tiles, "+4", the type tally', async ({ page }) => {
        test.setTimeout(120000);
        await open(page);
        await cell(page, R.sixteen).locator('span.caa-icon').hover();
        const tip = page.locator('#mb-stat-tooltip');
        await expect(tip).toBeVisible();
        await expect(tip.locator('.mb-tt-title')).toHaveText('Tunnel of Love Express I: Tougher Than the Rest');
        await expect(tip.locator('.mb-art-card-tile')).toHaveCount(12);
        await expect(tip.locator('.mb-art-card-main')).toHaveCount(1);
        await expect(tip.locator('.mb-art-card-more')).toHaveText('+4');
        await expect(tip).toContainText('Medium ×4');
        await expect(tip).toContainText('16 images');
        await expect(page.locator('#mb-art-hover-preview'), 'no front preview beside the card').toBeHidden();
    });

    test('D1: a click opens the viewer at that image; ← → cross into the next row; no JSON request', async ({ page }) => {
        test.setTimeout(120000);
        const { hits } = await open(page);
        const requests = () => [...hits.values()].reduce((a, b) => a + b, 0);
        const before = requests();
        await expandCell(page, R.sixteen);
        await cell(page, R.sixteen).locator('li.mb-caa-art-li-image[data-mb-art-i="5"]').click();
        await expect.poll(() => viewer(page)).toMatchObject({ pos: '6 / 16', rowPos: 'row 1 of 5' });

        await page.keyboard.press('End');
        expect((await viewer(page)).pos).toBe('16 / 16');
        await page.keyboard.press('ArrowRight');
        const next = await viewer(page);
        expect(next).toMatchObject({ pos: '1 / 2', rowPos: 'row 2 of 5', title: 'Tougher Than the Rest' });
        expect(next.src).toContain(R.noFront);
        await page.keyboard.press('ArrowLeft');
        expect(await viewer(page)).toMatchObject({ pos: '16 / 16', rowPos: 'row 1 of 5' });
        await page.keyboard.press('Escape');
        expect(await viewer(page)).toBeNull();
        expect(requests(), 'the viewer reads the cached record').toBe(before);
    });

    test('D1: Shift+→ steps the VISIBLE rows; the icon opens the main front; Esc returns focus', async ({ page }) => {
        test.setTimeout(120000);
        await open(page);
        await caaFilter(page, 0, 'Medi');   // leaves sixteen, noFront, outside, plain
        const icon = cell(page, R.sixteen).locator(`a[href="/release/${R.sixteen}/cover-art"]`);
        await icon.click();
        await expect.poll(() => viewer(page)).toMatchObject({ pos: '1 / 16', rowPos: 'row 1 of 4' });
        await page.keyboard.press('Shift+ArrowRight');
        expect((await viewer(page)).src).toContain(R.noFront);
        await page.keyboard.press('ArrowRight');   // its Medium image
        expect((await viewer(page)).infoMarks, 'the info panel carries the cell\'s "Medi" mark').toBeGreaterThan(0);
        await page.keyboard.press('Shift+ArrowRight');
        const third = await viewer(page);
        expect(third.rowPos).toBe('row 3 of 4');
        expect(third.src, 'noMedium was filtered out, so the next row is "outside"').toContain(R.outside);
        await page.keyboard.press('Escape');
        expect(await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('href')))
            .toBe(`/release/${R.sixteen}/cover-art`);
    });

    test('D1: a plain icon click is the viewer\'s, a Ctrl-click the link\'s; with cross-rows off ← → wrap in the row', async ({ page }) => {
        test.setTimeout(120000);
        await open(page, { sa_art_viewer_cross_rows: false });
        // The navigation guard asks before a link leaves the loaded page (a
        // native confirm). So "the click reached the link" is observable as
        // that dialog — and a plain click must never get there.
        const dialogs = [];
        page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });
        const icon = cell(page, R.sixteen).locator(`a[href="/release/${R.sixteen}/cover-art"]`);
        await icon.click({ modifiers: ['Control'] });
        await expect.poll(() => dialogs.length, 'the navigation guard saw the Ctrl-click').toBe(1);
        expect(await viewer(page)).toBeNull();
        await icon.click();
        await expect.poll(() => viewer(page)).toMatchObject({ pos: '1 / 16' });
        expect(dialogs.length, 'a plain click opens the viewer, no leave-page confirm').toBe(1);
        await page.keyboard.press('Escape');

        await expandCell(page, R.sixteen);
        await cell(page, R.sixteen).locator('li.mb-caa-art-li-image[data-mb-art-i="15"]').click();
        await expect.poll(() => viewer(page)).toMatchObject({ pos: '16 / 16' });
        await page.keyboard.press('ArrowRight');
        expect(await viewer(page)).toMatchObject({ pos: '1 / 16', rowPos: 'row 1 of 5' });
        await page.keyboard.press('Shift+ArrowRight');
        expect((await viewer(page)).rowPos, 'Shift+→ still changes rows').toBe('row 2 of 5');
    });

    test('D1: an older record without a 1200 key still gets the 1200 px file, and the 500 px one when that fails', async ({ page }) => {
        test.setTimeout(120000);
        await open(page);
        // Before the viewer opens at all: it preloads the neighbours, and a
        // file the browser already has would never fail.
        await page.route(new RegExp(`${R.plain}/2-1200\\.jpg$`), (route) => route.fulfill({ status: 404, body: '' }));
        // scripts/probe-caa-thumbnail-keys.py: such records list only
        // small/large, but the archive serves the -1200.jpg sibling.
        await expandCell(page, R.plain);
        await cell(page, R.plain).locator('li.mb-caa-art-li-image[data-mb-art-i="0"]').click();
        await expect.poll(() => viewer(page)).toMatchObject({ size: 'big' });
        expect((await viewer(page)).src).toMatch(new RegExp(`${R.plain}/1-1200\\.jpg$`));
        await page.keyboard.press('Escape');

        // Image 2's 1200 px file is not there: the 500 px one.
        await cell(page, R.plain).locator('li.mb-caa-art-li-image[data-mb-art-i="1"]').click();
        await expect.poll(() => viewer(page)).toMatchObject({ size: 'big' });
        expect((await viewer(page)).src).toMatch(new RegExp(`${R.plain}/2-500\\.jpg$`));
    });

    test('D1: ↑ zooms and the zoom is kept and remembered; 0 fits; P runs a slideshow any key stops', async ({ page }) => {
        test.setTimeout(120000);
        await open(page);
        await expandCell(page, R.sixteen);
        await cell(page, R.sixteen).locator('li.mb-caa-art-li-image[data-mb-art-i="0"]').click();
        await expect.poll(() => viewer(page)).toMatchObject({ pos: '1 / 16' });
        await page.keyboard.press('ArrowUp');
        expect((await viewer(page)).zoom).toBe('scale(1.5)');
        await page.keyboard.press('ArrowRight');
        expect((await viewer(page)).zoom, 'sa_art_viewer_remember_zoom: kept on a step').toBe('scale(1.5)');
        await page.keyboard.press('Escape');
        await cell(page, R.sixteen).locator('li.mb-caa-art-li-image[data-mb-art-i="3"]').click();
        await expect.poll(() => viewer(page)).toMatchObject({ pos: '4 / 16', zoom: 'scale(1.5)' });
        await page.keyboard.press('0');
        expect((await viewer(page)).zoom).toBe('');

        await page.keyboard.press('p');
        expect((await viewer(page)).slideshow).toBe('true');
        // sa_art_viewer_slideshow_secs default 4: the next image within ~5 s.
        await expect.poll(async () => (await viewer(page)).pos, { timeout: 7000 }).toBe('5 / 16');
        await page.keyboard.press('i');
        expect((await viewer(page)).slideshow, 'any key stops it').toBe('false');
    });

    test('findings: no Front / no Medium are counted once the artwork is in, and filter to their rows', async ({ page }) => {
        test.setTimeout(120000);
        await open(page);
        await expect.poll(async () => (await findingRow(page, 'warn', 'art-no-front') || {}).count, {
            timeout: 15000, message: 'the re-stamp after the artwork counts the one release without a Front',
        }).toBe(1);
        expect((await findingRow(page, 'warn', 'art-no-medium')).count,
            'only the 12" vinyl: the digital release and the cassette without artwork are not counted').toBe(1);
        await expect(cell(page, R.noFront)).toHaveAttribute('data-mb-findings', /\bart-no-front\b/);
        await expect(cell(page, R.noFront)).toHaveAttribute('data-mb-finding', 'warn');
        await expect(cell(page, R.noMedium)).toHaveAttribute('data-mb-findings', /\bart-no-medium\b/);
        expect(await page.locator(`table.tbl tbody a[href="/release/${R.noArt}/cover-art"]`)
            .evaluate((a) => a.closest('td').dataset.mbFindings || '')).toBe('');
        expect(await cell(page, R.digital).evaluate((td) => td.dataset.mbFindings || '')).toBe('');

        await clickFinding(page, 'art-no-front');
        await expect.poll(() => page.evaluate(() => Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((r) => r.cells.length > 1).length)).toBe(1);
        await expect(cell(page, R.noFront)).toHaveCount(1);
    });
});

// ── EAA: the same features, driven by EAA_CTX ───────────────────────────────

const EVENTS_URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/events';
const EVENTS_FIXTURE = path.join(__dirname, 'artist-events-eaa.html');
const EVENT_GUID = '22222222-2222-2222-2222-222222222222';

test.describe('CAA/EAA column redesign — EAA', () => {
    test('EAA cells use the EAA chip vocabulary and open the viewer', async ({ page }) => {
        test.setTimeout(120000);
        const pageErrors = collectPageErrors(page);
        await loadUserscriptPage(page, {
            url: EVENTS_URL, fixtureFile: EVENTS_FIXTURE, testMode: true,
            settingsOverride: { sa_enable_caa_pics: true, sa_art_idb_enable: false },
        });
        const u = (n) => `https://eventartarchive.org/event/${EVENT_GUID}/${n}`;
        await page.route('https://eventartarchive.org/**', async (route) => {
            if (new RegExp(`/event/${EVENT_GUID}$`).test(route.request().url())) {
                return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ images: [
                    { id: '1', image: u('1.jpg'), thumbnails: { 250: u('1-250.jpg'), 1200: u('1-1200.jpg') }, types: ['Poster'], front: true },
                    { id: '2', image: u('2.jpg'), thumbnails: { 250: u('2-250.jpg'), 1200: u('2-1200.jpg') }, types: ['Poster'], front: false },
                    { id: '3', image: u('3.jpg'), thumbnails: { 250: u('3-250.jpg'), 1200: u('3-1200.jpg') }, types: ['Ticket'], front: false },
                ] }) });
            }
            return route.fulfill({ status: 200, contentType: 'image/png', body: ONE_PX_PNG });
        });
        await page.click('button[data-label="Show all Events for Artist"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const td = page.locator('table.tbl tbody td:has(> ul.mb-caa-art-ul)').first();
        await expect(td).toHaveCount(1, { timeout: 30000 });
        expect(await td.locator('.mb-caa-type-chip').evaluateAll((cs) => cs.map((c) =>
            `${c.dataset.mbChipType}${c.hasAttribute('data-mb-chip-on') ? '+' : '-'}${c.dataset.mbChipN || ''}`)))
            .toEqual(['Poster+2', 'Banner-', 'Schedule-', 'Setlist-', 'Ticket+']);
        await td.locator('[data-caa-expand-btn]').click();
        await td.locator('li.mb-caa-art-li-image[data-mb-art-i="2"]').click();
        await expect.poll(() => viewer(page)).toMatchObject({ pos: '3 / 3', rowPos: 'row 1 of 1' });
        const info = await page.locator('#mb-art-viewer .mb-artv-info').textContent();
        expect(info, 'event art records have no "back" flag: no Main back line').not.toContain('Main back');
        expect(pageErrors).toEqual([]);
    });
});

// ── The column header's ▶N▤ on a CAA column (single table) ──────────────────

/**
 * Loads the BoDeans artist-releases disk fixture (a single table, 56 rows —
 * the page both 2026-10-06 reports came from) with a two-image record for
 * every release, and waits for all 56 art cells and the archive queue.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} [settings]
 */
async function openBoDeans(page, settings = {}) {
    await page.route('https://coverartarchive.org/**',
        (route) => route.fulfill({ status: 200, contentType: 'image/png', body: ONE_PX_PNG }));
    await page.route(/^https:\/\/coverartarchive\.org\/release\/([0-9a-f-]{36})$/, (route) => {
        const mbid = route.request().url().split('/').pop();
        const u = (n) => `https://coverartarchive.org/release/${mbid}/${n}`;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ images: [
            { id: '1', image: u('1.jpg'), thumbnails: { 250: u('1-250.jpg') }, types: ['Front'], front: true },
            { id: '2', image: u('2.jpg'), thumbnails: { 250: u('2-250.jpg') }, types: ['Back'], front: false },
        ] }) });
    });
    await loadFromDiskFixture(page, {
        url: 'https://musicbrainz.org/artist/84c38d3a-3400-4c28-b988-90558bb6fae0/releases',
        fixturePath: path.join(__dirname, 'saved-data', 'artist-releases-bodeans.json.gz'),
        testMode: true,
        settingsOverride: { sa_enable_caa_pics: true, sa_art_idb_enable: false, ...settings },
    });
    await expect.poll(() => page.locator('table.tbl tbody ul.mb-caa-art-ul').count(), { timeout: 30000 }).toBe(56);
    await waitForCaaEaaComplete(page);
}

test.describe('CAA column on a single table (BoDeans): the ▶N▤ button and the summary line', () => {
    let pageErrors;

    test.beforeEach(({ page }) => {
        pageErrors = collectPageErrors(page);
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('▶N▤ is there from the first render, counts the art cells and works as the ▶ of the ▶🖼 button', async ({ page }) => {
        test.setTimeout(120000);
        // Reported 2026-10-06 twice: first it did nothing (art cells have no
        // .mb-cell-collapse-toggle), then — initCollapsableColumns() running
        // before any art cell exists — it was not there at all until a
        // re-render. Now the art code builds it beside ▶🖼, with no re-render.
        await openBoDeans(page);
        const proxy = page.locator('table.tbl thead .mb-col-collapse-hdr-btn[data-mb-art-proxy]');
        await expect(proxy).toHaveCount(1);
        await expect(proxy).toBeVisible();
        await expect(proxy.locator('.mb-art-col-collapse-count')).toHaveText('56');
        await expect(proxy.locator('.mb-col-collapse-glyph')).toHaveText('▶');
        const caaBtn = page.locator('table.tbl thead .mb-caa-col-hdr-btn');
        const states = () => page.evaluate(() => Array.from(document.querySelectorAll('table.tbl tbody [data-caa-expand-btn]'))
            .map((b) => b.dataset.caaExpandBtn));
        const sortBefore = await page.locator('.mb-sort-status').allTextContents();

        await proxy.click();
        expect(new Set(await states()), 'every art cell expanded').toEqual(new Set(['expanded']));
        await expect(caaBtn, 'the ▶🖼 button agrees').toHaveAttribute('data-caa-col-hdr-state', 'expanded');
        await expect(proxy.locator('.mb-col-collapse-glyph')).toHaveText('▼');
        await expect(page.locator('.mb-sort-status'), 'the header click did not sort').toHaveText(sortBefore);

        // The other handle: the ▶🖼 button's own ▶ — the proxy follows.
        await caaBtn.locator(':scope > span').click();
        expect(new Set(await states()), 'every art cell collapsed').toEqual(new Set(['collapsed']));
        await expect(proxy.locator('.mb-col-collapse-glyph')).toHaveText('▶');
        await expect(proxy).toHaveAttribute('aria-expanded', 'false');
    });

    test('the cache hint and the image count stay beside the icon, not under it', async ({ page }) => {
        test.setTimeout(120000);
        // Reported 2026-10-06 (debug/MGV-CAA-bug.html): the icon, hint and
        // count sit in the prose wrapper div the first render gives the
        // still-plain cell; next to the type chips that flex item shrank to
        // the icon's width and the hint + count wrapped below it.
        // Auto-resized, as on the reported page ("Auto-resized 22 visible
        // columns"): the column width is fixed from content measured before
        // the chips existed, so the summary line has to fit as built.
        await openBoDeans(page, { sa_rt_enable: true, sa_rt_show_icon_column: true, sa_ld_auto_resize_after_load: true });
        // The reported page's CAA column was 150 px (its <th> min-width, the
        // collapse pass's floor): ▶ + the six chips leave the wrapper less than
        // icon + count. Pinned here so the squeeze does not depend on how wide
        // the fixture's other columns happen to make this one.
        await page.locator('table.tbl tbody td:has(> ul.mb-caa-art-ul)').first().evaluate((td) => {
            const th = td.closest('table').tHead.rows[0].cells[td.cellIndex];
            th.style.minWidth = '150px';
            th.style.width = '150px';
            th.style.maxWidth = '150px';
        });
        const geo = await page.evaluate(() => Array.from(document.querySelectorAll('table.tbl tbody li.mb-caa-art-li-summary'))
            .map((li) => {
                const icon = li.querySelector('span.caa-icon');
                const count = li.querySelector('.mb-caa-count-badge');
                if (!icon || !count) return null;
                const a = icon.getBoundingClientRect();
                const b = count.getBoundingClientRect();
                return { below: b.top >= a.bottom - 1, right: b.left >= a.right - 1, marker: !!li.querySelector(':scope > .mb-text-clamp-marker') };
            }).filter(Boolean));
        expect(geo.length, 'premise: the summary lines were measured').toBeGreaterThan(40);
        expect(geo.some((g) => g.marker), 'premise: the cells carry the prose wrapper').toBe(true);
        expect(geo.filter((g) => g.below).length, 'counts below their icon').toBe(0);
        expect(geo.filter((g) => !g.right).length, 'counts left of their icon').toBe(0);
    });
});
