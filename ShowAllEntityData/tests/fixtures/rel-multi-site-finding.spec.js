'use strict';

// ⚠️ "Several links to one site in Relationships" (rel-multi-site) — the
// Discogs-only rel-multi-discogs extended to every site, and its two display
// bugs (debug/multiple-discogs-relationships.html, /tag/distributor, reported
// 2026-10-20 with two screenshots):
//
//   a. hovering the cell's ⚠️ showed the reload ⟳ IN ITS PLACE: both were the
//      cell's ::after, the finding rule made it absolute at the right edge
//      and the ⟳ hover rule only swapped its content. And the hover title
//      handler replaced the finding title with the reload hint;
//   b. the icon's popup stack did not carry the finding at all;
//   c. only Discogs was checked.
//
// Shell: the releasegroup-releases raw snapshot (7 releases, 2 sub-tables,
// tableMode 'multi'). Every ws/2 lookup is answered by arrival order
// (ANSWERS); oracles are read back from the cells, so it does not matter
// which release got which answer.
//
// Guarantees pinned, each named:
//   - SITES: a cell flags when ANY host (without "www.") has 2+ distinct
//     URLs; music./itunes.apple.com and amazon.de/amazon.com are different sites;
//     the count equals a DOM oracle computed from the cells;
//   - DETAIL: the finding names EVERY site involved (Discogs and Amazon
//     both, for a cell with two of each);
//   - IGNORE: a host in sa_findings_rel_multi_site_ignore never counts;
//   - GLYPHS: while the cell is hovered the ⚠️ stays at the right edge
//     (::before, absolute, right 2px) and the ⟳ is in flow after the icons
//     (::after, static) — two pseudo-elements, not one with two contents;
//   - TITLE: the hovered cell's title holds the finding AND the reload hint;
//   - STACK: an icon's popup (#mb-stat-tooltip without a preview card,
//     #mb-dp-notes with one) starts with the finding box, naming the sites
//     and marking the hovered icon's URL.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { clickMasterToggleAndExpandAll } = require('../support/liveAssertions');
const { findingRow } = require('../support/findingsMenu');

const RG_URL = 'https://musicbrainz.org/release-group/f83d2211-dd81-4b1e-9a02-e89733891e1c';
const RG_SHELL = path.join(__dirname, '..', 'snapshots', 'releasegroup-releases', 'raw.html');
const RG_ROWS = 7;
const ID = 'rel-multi-site';
const LABEL = 'Several links to one site in Relationships';

/** A ws/2 URL relation. */
const rel = (type, resource) => ({ 'target-type': 'url', type, url: { resource } });
const ANSWERS = [
    // Two sites twice each: one finding, both named.
    [rel('discogs', 'https://www.discogs.com/release/1'), rel('discogs', 'https://www.discogs.com/release/2'),
        rel('amazon asin', 'https://www.amazon.de/gp/product/B0000001'), rel('amazon asin', 'https://www.amazon.de/gp/product/B0000002')],
    // Different sites (hosts) of one site kind, not flagged. Only link
    // types that draw an icon count (wikipedia draws none by default).
    [rel('streaming', 'https://music.apple.com/us/album/1'), rel('purchase for download', 'https://itunes.apple.com/us/album/2')],
    [rel('amazon asin', 'https://www.amazon.de/gp/product/B0000003'), rel('amazon asin', 'https://www.amazon.com/gp/product/B0000004')],
    // One site twice: flagged unless ignored.
    [rel('streaming', 'https://x.bandcamp.com/album/a'), rel('purchase for download', 'https://x.bandcamp.com/album/b')],
];
const ONE = [rel('discogs', 'https://www.discogs.com/release/9')];

/**
 * Loads the shell with the Relationships column on, answers its lookups and
 * waits until every row's cell is written.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} [settings]
 */
async function open(page, settings = {}) {
    let k = 0;
    await loadUserscriptPage(page, {
        url: RG_URL, fixtureFile: RG_SHELL, testMode: true,
        settingsOverride: {
            sa_enable_relationships_column: true, sa_rel_collapse_threshold: 50, sa_rel_browse_batch_enable: false,
            sa_rich_tooltip_delay_ms: 0,
            ...settings,
        },
    });
    await page.route('**/ws/2/**', (route) => {
        const relations = ANSWERS[k++] || ONE;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ relations }) });
    });
    await page.route('https://musicbrainz.org/release-group/**', (route) => route.fulfill({ path: RG_SHELL, contentType: 'text/html' }));
    await page.route('https://api.discogs.com/**', (route) => route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
    await page.click('button[data-label="Show all Releases for ReleaseGroup"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
    await clickMasterToggleAndExpandAll(page);
    await expect.poll(() => page.evaluate(() => document.querySelectorAll('table.tbl tbody td.mb-rel-cell[data-rel-done="1"]').length),
        { timeout: 30000, message: 'every Relationships cell written' }).toBe(RG_ROWS);
}

/**
 * Per cell: the hosts (without "www.") that hold 2+ distinct URLs (host +
 * path, no trailing "/", no query), minus `ignore`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string[]} [ignore]
 * @returns {Promise<string[][]>}
 */
const dupeOracle = (page, ignore = []) => page.evaluate((ign) => Array.from(document.querySelectorAll('table.tbl tbody td.mb-rel-cell')).map((td) => {
    const by = new Map();
    td.querySelectorAll('.mb-rel-filter-key').forEach((s) => {
        const u = new URL(s.textContent);
        const h = u.hostname.replace(/^www\./, '');
        if (ign.includes(h)) return;
        if (!by.has(h)) by.set(h, new Set());
        by.get(h).add(h + u.pathname.replace(/\/+$/, ''));
    });
    return Array.from(by).filter(([, s]) => s.size >= 2).map(([h]) => h);
}), ignore);

/** The flagged cell holding two Discogs and two amazon.de links. */
const twoSiteCell = (page) => page.locator(`table.tbl tbody td.mb-rel-cell[data-mb-findings~="${ID}"]:has(.mb-rel-filter-key:text("amazon.de"))`).first();

test.describe('finding: Several links to one site in Relationships', () => {
    let pageErrors;
    test.beforeEach(({ page }) => {
        pageErrors = [];
        page.on('pageerror', (e) => pageErrors.push(String(e.stack || e.message)));
    });
    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('SITES + DETAIL: any host twice flags; different hosts of one site kind do not; every site is named', async ({ page }) => {
        await open(page);
        const dupes = await dupeOracle(page);
        const expected = dupes.filter((d) => d.length).length;
        expect(expected, 'premise: the discogs+amazon.de cell and the bandcamp cell').toBe(2);
        expect(dupes.flat().sort(), 'premise: the apple hosts and amazon.de/.com never pair up').toEqual(['amazon.de', 'discogs.com', 'x.bandcamp.com']);
        await expect.poll(async () => (await findingRow(page, 'warn', ID) || {}).count,
            { timeout: 15000, message: 'the re-stamp after the column loaded' }).toBe(expected);
        expect((await findingRow(page, 'warn', ID)).label).toBe(LABEL);

        const tip = await twoSiteCell(page).evaluate((td) => td.getAttribute('data-mb-tip') || td.title);
        expect(tip).toContain(`⚠️ ${LABEL}`);
        expect(tip).toContain('Discogs (discogs.com): https://discogs.com/release/1, https://discogs.com/release/2');
        expect(tip).toContain('Amazon (amazon.de): https://amazon.de/gp/product/B0000001, https://amazon.de/gp/product/B0000002');
    });

    test('IGNORE: a listed host never counts', async ({ page }) => {
        await open(page, { sa_findings_rel_multi_site_ignore: 'www.x.bandcamp.com, foo.example' });
        const expected = (await dupeOracle(page, ['x.bandcamp.com'])).filter((d) => d.length).length;
        expect(expected).toBe(1);
        await expect.poll(async () => (await findingRow(page, 'warn', ID) || {}).count, { timeout: 15000 }).toBe(expected);
        const flagged = await page.evaluate((id) => Array.from(document.querySelectorAll(`table.tbl tbody td[data-mb-findings~="${id}"]`))
            .map((td) => td.textContent.includes('bandcamp')), ID);
        expect(flagged, 'one flagged cell, not the bandcamp one').toEqual([false]);
    });

    test('GLYPHS + TITLE: hovering the ⚠️ keeps it at the right edge, the ⟳ follows the icons, the title keeps the finding', async ({ page }) => {
        await open(page);
        await expect.poll(async () => (await findingRow(page, 'warn', ID) || {}).count, { timeout: 15000 }).toBe(2);
        const cell = twoSiteCell(page);
        await cell.scrollIntoViewIfNeeded();
        const box = await cell.boundingBox();
        // Where the ⚠️ is drawn: the user's "hover over the warning icon".
        await cell.hover({ position: { x: box.width - 6, y: box.height / 2 } });
        const look = await cell.evaluate((td) => {
            const b = getComputedStyle(td, '::before');
            const a = getComputedStyle(td, '::after');
            return {
                hovered: td.matches(':hover'),
                before: b.content, beforePos: b.position, beforeRight: b.right,
                after: a.content, afterPos: a.position,
            };
        });
        expect(look).toEqual({
            hovered: true,
            before: '"⚠️"', beforePos: 'absolute', beforeRight: '2px',
            after: '"⟳"', afterPos: 'static',
        });
        // The title wherever it is parked right now: on the cell, or in the
        // rich tooltip's stash (_setTip(): data-mb-tip-saved) while its card
        // shows.
        const titleOf = () => cell.evaluate((td) => td.title || td.dataset.mbTipSaved || td.dataset.mbDpSavedTitle || '');
        await expect.poll(titleOf).toContain(`⚠️ ${LABEL}: Discogs (discogs.com)`);
        const title = await titleOf();
        expect(title).toContain('Amazon (amazon.de)');
        expect(title).toContain('Click here, outside the icons, to reload this row’s relationships');

        // At rest: the ⚠️ alone, nothing after the icons.
        await page.mouse.move(0, 0);
        const rest = await cell.evaluate((td) => ({ before: getComputedStyle(td, '::before').content, after: getComputedStyle(td, '::after').content }));
        expect(rest).toEqual({ before: '"⚠️"', after: 'none' });
    });

    test('STACK without a preview card: #mb-stat-tooltip starts with the finding box, the hovered URL marked', async ({ page }) => {
        await open(page);
        await expect.poll(async () => (await findingRow(page, 'warn', ID) || {}).count, { timeout: 15000 }).toBe(2);
        await page.mouse.move(0, 0);
        await twoSiteCell(page).locator('a:has(.mb-rel-filter-key:text("discogs.com/release/2"))').hover();
        const tip = page.locator('#mb-stat-tooltip');
        await expect(tip).toBeVisible();
        await expect(tip.locator('.mb-tt-title').first()).toHaveText(`⚠️ ${LABEL}`);
        await expect(tip.locator('.mb-rel-fd-site')).toHaveCount(2);
        await expect(tip.locator('.mb-rel-fd-site').nth(0)).toContainText('Discogs');
        await expect(tip.locator('.mb-rel-fd-site').nth(1)).toContainText('Amazon');
        await expect(tip.locator('.mb-rel-fd-url.mb-rel-here')).toHaveText(/^https:\/\/discogs\.com\/release\/2/);
        await expect(tip.locator('.mb-rel-lk b')).toHaveText('Discogs');
    });

    test('STACK under the preview card: #mb-dp-notes starts with the finding box in the finding colour', async ({ page }) => {
        await open(page, { sa_pop_ext: true, sa_dp_hover_without_ctrl: true });
        await expect.poll(async () => (await findingRow(page, 'warn', ID) || {}).count, { timeout: 15000 }).toBe(2);
        await page.mouse.move(0, 0);
        await twoSiteCell(page).locator('a:has(.mb-rel-filter-key:text("amazon.de/gp/product/B0000001"))').hover();
        await expect(page.locator('#mb-dp-peek')).toBeVisible();
        const notes = page.locator('#mb-dp-notes .mb-dp-note');
        await expect(notes.first()).toHaveClass(/mb-dp-note-tip/);
        await expect(notes.first()).toContainText(LABEL);
        await expect(notes.first().locator('.mb-rel-fd-site')).toHaveCount(2);
        await expect(notes.first().locator('.mb-rel-fd-url.mb-rel-here')).toHaveText(/^https:\/\/amazon\.de\/gp\/product\/B0000001/);
        await expect(page.locator('#mb-dp-notes')).not.toContainText('outside the icons');
    });
});
