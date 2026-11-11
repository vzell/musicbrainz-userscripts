'use strict';

// A Discogs release's Tracks view: the tracklist headings inside a disc as
// SECTION BANDS (org/discogs.org "make a nice mockup for a release with
// subheaders", vzell's answers 2026-11-11: variant A, sticky on desktop, the
// Section column hidden by default). Release 2012001, Manfred Mann's Earth
// Band – Bootleg Archives Volumes 1-5: Disc 1 holds four sections
// (Cologne 2 tracks 10:42, Paris 8 · 51:49, Vienna 2 · 6:54, Unknown 1 ·
// 7:13), Disc 3 two (Köln, Germany 11 · 1:04:47, London, England 2 · 11:34),
// Discs 2, 4, 5 none. A band is a real row (`tr.mb-nd-row.mb-sec-band`) that
// every engine pass skips: these specs pin that it is drawn where it belongs
// AND that it is never counted, filtered or exported as a track.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { waitForFilterSettled, waitForSortSettled, waitForSubTableFilterSettled } = require('../support/filterSortAssertions');
const { openToolbarMenu } = require('../support/toolbarMenu');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const FX = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, `ext-${name}.json`), 'utf8'));
const answers = (...names) => Object.fromEntries(names.map((n) => {
    const f = FX(n);
    return [f.url, { status: f.status, responseHeaders: `Content-Type: ${f.contentType}`, responseText: f.body }];
}));
const ALL = answers('discogs-release-2012001', 'discogs-release-15121926', 'discogs-release');
const release = id => `https://www.discogs.com/release/${id}-x`;

/**
 * Loads Discogs' release page fixture under a release's URL, the API
 * answered from the fixtures, and presses "Show all tracks".
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} id
 * @param {Object} [settings]
 * @returns {Promise<string[]>} Page errors.
 */
async function openTracks(page, id = 2012001, settings = {}) {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
    await page.route('https://i.discogs.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    await page.context().addInitScript((r) => { window.__gmXhrResponses = r; }, ALL);
    await loadUserscriptPage(page, {
        url: release(id), fixtureFile: path.join(__dirname, 'dg-release.html'), testMode: true,
        settingsOverride: { sa_enable_discogs: true, sa_pop_ext_discogs_token: 'tok-probe', sa_render_threshold: 100000, ...settings },
    });
    await page.locator('#mb-dg-root button[data-label="Show all tracks"]').click();
    await waitForRenderComplete(page, { waitForAutoResize: false });
    // The sub-tables start collapsed here: open them, and make sure it worked
    // (a hidden table passes every "hidden"/geometry assertion for nothing).
    const master = page.locator('.mb-master-toggle').first();
    if (await master.count() && /Show/.test(await master.textContent())) await master.click();
    if (await page.locator('#mb-dg-root table.tbl').count()) await expect(page.locator('#mb-dg-root table.tbl').first()).toBeVisible();
    return errors;
}

// The disc tables of our section, in order (Release credits last).
const disc = (page, n) => page.locator('#mb-dg-root table.tbl').nth(n - 1);
// A table's bands as [name, meta].
const bands = (table) => table.locator('tr.mb-sec-band').evaluateAll(trs => trs.map(tr => [
    tr.querySelector('.mb-sec-band-name').textContent, tr.querySelector('.mb-sec-band-meta').textContent]));
// The # of the data rows shown (not folded, not hidden), in order.
const shownPos = (table) => table.locator('tbody > tr:not(.mb-nd-row)').evaluateAll(trs => trs
    .filter(tr => getComputedStyle(tr).display !== 'none').map(tr => tr.cells[0].textContent.trim()));
// What each band row is directly above: the # of the next row.
const bandAbove = (table) => table.locator('tr.mb-sec-band').evaluateAll(trs => trs.map(tr => [tr.dataset.mbSecBand,
    tr.nextElementSibling ? tr.nextElementSibling.cells[0].textContent.trim() : null]));

test.describe('Discogs Tracks view: section bands (2026-11-11)', () => {
    test('a band above each section of a disc, with its tracks and length; none on a disc without sections; Section hidden', async ({ page }) => {
        const errors = await openTracks(page);
        const d1 = disc(page, 1);
        expect(await bands(d1)).toEqual([
            ['Cologne 13/02/1981', '2 tracks · 10:42'], ['Paris 05/02/1981', '8 tracks · 51:49'],
            ['Vienna 12/02/1981', '2 tracks · 6:54'], ['Unknown', '1 track · 7:13']]);
        // Each right above the section's first track (Discogs' place).
        expect(await bandAbove(d1)).toEqual([['Cologne 13/02/1981', '1-1'], ['Paris 05/02/1981', '1-3'],
            ['Vienna 12/02/1981', '1-11'], ['Unknown', '1-13']]);
        // Disc 3: the stacked "Köln, Germany" (after the disc's own heading) is its first band.
        expect(await bands(disc(page, 3))).toEqual([['Köln, Germany', '11 tracks · 1:04:47'], ['London, England', '2 tracks · 11:34']]);
        for (const n of [2, 4, 5]) await expect(disc(page, n).locator('tr.mb-sec-band'), `Disc ${n}`).toHaveCount(0);
        // A band is one cell over every column, and not data.
        const band = d1.locator('tr.mb-sec-band').first();
        await expect(band).toHaveClass(/\bmb-nd-row\b/);
        expect(await band.locator('td').evaluateAll(tds => tds.map(td => td.colSpan))).toEqual([999]);
        // The Section column says it twice now: hidden by default, still a column (📊, 👁️ Visible).
        const secTh = d1.locator('thead tr:first-child th').filter({ hasText: /^Section/ });
        await expect(secTh).toHaveCount(1);
        await expect(secTh).toBeHidden();
        // Never counted as a track: the disc's h3 still says 13, the data rows are 13.
        await expect(page.locator('h3.mb-toggle-h3', { hasText: 'Disc 1' }).locator('.mb-row-count-stat')).toHaveText('(13)');
        expect(await shownPos(d1)).toHaveLength(13);
        // Zebra striping counts tracks only: 1-1 odd, 1-2 even, 1-3 (after a band) odd again.
        const stripes = await d1.locator('tbody > tr:not(.mb-nd-row)').evaluateAll(trs => trs.slice(0, 3).map(tr => tr.className.match(/\b(odd|even)\b/)?.[1] || ''));
        expect(stripes).toEqual(['odd', 'even', 'odd']);
        expect(errors).toEqual([]);
    });

    test('a click folds a section, a second shows it; a fold survives a re-render', async ({ page }) => {
        const errors = await openTracks(page);
        const d1 = disc(page, 1);
        const paris = d1.locator('tr.mb-sec-band', { hasText: 'Paris' }).locator('button');
        await expect(paris).toHaveAttribute('aria-expanded', 'true');
        await paris.click();
        await expect(d1.locator('tr.mb-sec-band', { hasText: 'Paris' }).locator('button')).toHaveAttribute('aria-expanded', 'false');
        expect(await shownPos(d1)).toEqual(['1-1', '1-2', '1-11', '1-12', '1-13']);
        // The band stays, the other sections too.
        expect((await bands(d1)).map(b => b[0])).toEqual(['Cologne 13/02/1981', 'Paris 05/02/1981', 'Vienna 12/02/1981', 'Unknown']);
        // A re-render (a page filter typed and cleared) rebuilds the bands: Paris still folded.
        await waitForFilterSettled(page, () => page.fill('#mb-global-filter-input', 'a'));
        await waitForFilterSettled(page, () => page.fill('#mb-global-filter-input', ''));
        await expect(d1.locator('tr.mb-sec-band', { hasText: 'Paris' }).locator('button')).toHaveAttribute('aria-expanded', 'false');
        expect(await shownPos(d1)).toEqual(['1-1', '1-2', '1-11', '1-12', '1-13']);
        await d1.locator('tr.mb-sec-band', { hasText: 'Paris' }).locator('button').click();
        expect(await shownPos(d1)).toHaveLength(13);
        expect(errors).toEqual([]);
    });

    test('a page filter: a band says "k of N"; a section with no match has no band', async ({ page }) => {
        const errors = await openTracks(page);
        // "Springsteen" wrote 1-5 and 1-8 (both Paris) on Disc 1.
        await waitForFilterSettled(page, () => page.fill('#mb-global-filter-input', 'Springsteen'));
        const d1 = disc(page, 1);
        expect(await bands(d1)).toEqual([['Paris 05/02/1981', '2 of 8 tracks · 51:49']]);
        expect(await shownPos(d1)).toEqual(['1-5', '1-8']);
        // The band is no match of its own: the filter never highlights in it.
        await expect(d1.locator('tr.mb-sec-band .mb-global-filter-highlight')).toHaveCount(0);
        await waitForFilterSettled(page, () => page.fill('#mb-global-filter-input', ''));
        expect(await bands(d1)).toHaveLength(4);
        expect(errors).toEqual([]);
    });

    test('a sub-table filter: bands count what it leaves, the filter never hides or counts a band', async ({ page }) => {
        const errors = await openTracks(page);
        const h3 = page.locator('h3.mb-toggle-h3', { hasText: 'Disc 1' });
        await h3.locator('.mb-subtable-filter-toggle-icon').click();
        const stf = h3.locator('.mb-subtable-filter-wrapper input');
        await waitForSubTableFilterSettled(page, () => stf.fill('Mann'), { subTableHeading: 'Disc 1' });
        const d1 = disc(page, 1);
        // Every track has a "Band … – Manfred Mann" line: all 13 stay. Narrower:
        await waitForSubTableFilterSettled(page, () => stf.fill('Heron'), { subTableHeading: 'Disc 1' });
        // "Stranded" (1-9, Paris) is Mann/Heron's.
        expect(await shownPos(d1)).toEqual(['1-9']);
        expect(await bands(d1)).toEqual([['Paris 05/02/1981', '1 of 8 tracks · 51:49']]);
        await expect(d1.locator('tr.mb-sec-band[data-mb-stf-hidden]')).toHaveCount(0);
        await expect(h3.locator('.mb-row-count-stat')).toContainText('1');
        await expect(h3.locator('.mb-row-count-stat')).not.toContainText('2');
        await waitForSubTableFilterSettled(page, () => stf.fill(''), { subTableHeading: 'Disc 1' });
        expect(await bands(d1)).toHaveLength(4);
        expect(errors).toEqual([]);
    });

    test('sorted by another column: no bands, the section rides each title as a tag; back in order, the bands return', async ({ page }) => {
        const errors = await openTracks(page);
        const d1 = disc(page, 1);
        const lenTh = d1.locator('thead tr:first-child th').filter({ hasText: /^Length/ });
        await waitForSortSettled(page, () => lenTh.locator('.sort-icon-btn', { hasText: '▼' }).click(), { subTableHeading: 'Disc 1' });
        await expect(d1).toHaveClass(/\bmb-sec-sorted\b/);
        await expect(d1.locator('tr.mb-sec-band')).toHaveCount(0);
        // The longest first: 1-7 Martha's Madman (10:52), a Paris track.
        expect((await shownPos(d1))[0]).toBe('1-7');
        const tag = await d1.locator('tbody > tr:not(.mb-nd-row)').first().locator('td[data-mb-sec]')
            .evaluate(td => getComputedStyle(td, '::after').content);
        expect(tag).toBe('"Paris 05/02/1981"');
        // A tag is drawn, not written: the cell's text is the title alone.
        expect((await d1.locator('tbody > tr:not(.mb-nd-row)').first().locator('td[data-mb-sec]').textContent()).trim()).toBe('Martha\'s Madman');
        await waitForSortSettled(page, () => lenTh.locator('.sort-icon-btn', { hasText: '⇅' }).click(), { subTableHeading: 'Disc 1' });
        await expect(d1).not.toHaveClass(/\bmb-sec-sorted\b/);
        expect(await bands(d1)).toHaveLength(4);
        expect(errors).toEqual([]);
    });

    test('sticky on a desktop: a band docks right under the column headers while its tracks scroll past', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 500 });
        const errors = await openTracks(page);
        const d1 = disc(page, 1);
        await expect(d1).toHaveClass(/\bmb-sec-sticky\b/);
        const band = d1.locator('tr.mb-sec-band', { hasText: 'Paris' });
        await expect(band.locator('td')).toHaveCSS('position', 'sticky');
        // Scroll until 1-8 (late in Paris) is under the headers' block.
        await d1.locator('tbody > tr:not(.mb-nd-row)', { has: page.locator('td:first-child:text-is("1-8")') }).evaluate((tr) => {
            window.scrollBy(0, tr.getBoundingClientRect().top - 200);
        });
        // The band's cell is what sticks (a row's own box stays in the flow).
        await expect.poll(async () => d1.evaluate((t) => {
            const b = Array.from(t.querySelectorAll('tr.mb-sec-band')).find(tr => tr.dataset.mbSecBand.startsWith('Paris'));
            return Math.round(b.cells[0].getBoundingClientRect().top - t.tHead.getBoundingClientRect().bottom);
        }), { message: 'the Paris band sits on the stuck thead (px apart)' }).toBeGreaterThanOrEqual(-2);
        expect(await d1.evaluate((t) => {
            const b = Array.from(t.querySelectorAll('tr.mb-sec-band')).find(tr => tr.dataset.mbSecBand.startsWith('Paris'));
            return Math.round(b.cells[0].getBoundingClientRect().top - t.tHead.getBoundingClientRect().bottom);
        }), 'and not below it').toBeLessThanOrEqual(2);
        // Docked, it stands over the rows of its section: 1-8 starts under it.
        const [bandBottom, rowTop] = await d1.evaluate((t) => {
            const b = Array.from(t.querySelectorAll('tr.mb-sec-band')).find(tr => tr.dataset.mbSecBand.startsWith('Paris'));
            const r = Array.from(t.tBodies[0].rows).find(tr => tr.cells[0].textContent.trim() === '1-7');
            return [b.cells[0].getBoundingClientRect().bottom, r.getBoundingClientRect().top];
        });
        expect(rowTop, 'an earlier Paris row has scrolled up under the band').toBeLessThan(bandBottom);
        expect(errors).toEqual([]);
    });

    test('a split LP: a band per side; a release without sections has none and no Section column', async ({ page }) => {
        // Born To Run / E. C. Was Here (15121926): one heading per side.
        let errors = await openTracks(page, 15121926);
        expect((await bands(disc(page, 1))).map(b => b[0])).toEqual(['Born To Run', 'E. C. Was Here']);
        expect(errors).toEqual([]);
        // Born To Run (1874253): no heading at all.
        errors = await openTracks(page, 1874253);
        await expect(page.locator('#mb-dg-root tr.mb-sec-band')).toHaveCount(0);
        await expect(disc(page, 1)).not.toHaveClass(/\bmb-sec-(?:sticky|sorted)\b/);
        expect(errors).toEqual([]);
    });

    test('Export ▸ CSV writes the tracks only, never a band', async ({ page }) => {
        // The exporter hands its text to URL.createObjectURL(): keep that Blob.
        await page.context().addInitScript(() => {
            const orig = URL.createObjectURL.bind(URL);
            URL.createObjectURL = (b) => { window.__lastBlob = b; return orig(b); };
        });
        const errors = await openTracks(page);
        await expect(disc(page, 1).locator('tr.mb-sec-band')).toHaveCount(4);
        expect(await openToolbarMenu(page, 'export')).toBe(true);
        await page.locator('#mb-export-sub-panel').getByText('CSV', { exact: true }).click();
        await expect.poll(() => page.evaluate(() => !!window.__lastBlob)).toBe(true);
        const csv = await page.evaluate(() => window.__lastBlob.text());
        // Disc 1's 13 tracks (the first table), one line each; no band's "N tracks · length".
        const tracks = csv.split('\n').filter(l => /^1-\d+,/.test(l));
        expect(tracks.map(l => l.split(',')[0])).toEqual(Array.from({ length: 13 }, (_, i) => `1-${i + 1}`));
        expect(csv.split('\n').filter(l => /\d+ tracks? · /.test(l))).toEqual([]);
        expect(errors).toEqual([]);
    });
});
