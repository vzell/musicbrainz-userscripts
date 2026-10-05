'use strict';

// springsteenlyrics.com list pages against the REAL site — the one thing the
// sl-* fixture specs cannot show: the site's own pagination (100 cards per
// page, a windowed `ul.pagination` whose "»" carries the last page number)
// consolidating into exactly the number of items the page announces.
//
// Self-consistency, not fixed counts: the collection keeps growing, so each
// test reads the page's own "Showing items 1-100 of N" before pressing the
// button and expects N rows after. Every list spans several pages (539 and 273
// items when this was written, 2026-10-04; book 105 and the entry page 5365 on
// 2026-10-05).
//
// "book" and the entry page render the year-filter block whose stray `</div>`
// closes `.project-detail` before the cards (see _slFindCards()); the entry
// page also paginates with `pg=`. Its 54 pages and 5365 rows would trip the
// High Page Count and render-decision dialogs, so it seeds both thresholds.
//
// Headless Chromium passed the site's CloudFlare front on 2026-10-04; if that
// changes, a challenge page is what these tests will see — the "Showing
// items" read fails first and says so.

const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { collectPageErrors } = require('../support/liveAssertions');

const LISTS = [
    {
        name: 'collection',
        url: 'https://springsteenlyrics.com/collection.php?cmd=list&category=album&f_format=12i',
        button: 'Show all items of this collection list',
        headers: ['Cover', 'Title', 'Version', 'Label', 'Cat. no.', 'Format', 'Country', 'Release date', 'Original year', 'Copies'],
    },
    {
        name: 'collection category with the year filter (book)',
        url: 'https://springsteenlyrics.com/collection.php?cmd=list&category=book',
        button: 'Show all items of this collection list',
        headers: ['Cover', 'Title', 'Version', 'Label', 'Cat. no.', 'Format', 'Country', 'Release date', 'Original year', 'Copies'],
    },
    {
        name: 'collection entry page',
        url: 'https://springsteenlyrics.com/collection.php',
        button: 'Show all latest additions',
        headers: ['Cover', 'Title', 'Version', 'Label', 'Cat. no.', 'Format', 'Country', 'Release date', 'Original year', 'Copies'],
        settingsOverride: { sa_max_page: 1000, sa_render_threshold: 1000000, sa_render_warning_threshold: 1000000 },
        timeout: 600000,
    },
    {
        name: 'bootlegs',
        url: 'https://springsteenlyrics.com/bootlegs.php?cmd=list&category=aud_live1967',
        button: 'Show all bootlegs of this list',
        headers: ['Cover', 'Title', 'Label', 'Date', 'First date', 'Location', 'Format', 'Duration', 'Lossy', 'Artwork', 'Info file'],
    },
];

/**
 * The site's OWN error on every page with the year-filter block: its inline
 * rSlider snippet ends in `window.onload = init;`, and the page never defines
 * `init` (see debug/sl-sampler-raw.html). Thrown while the page loads, before
 * the userscript does anything — exempted by exact message, nothing broader.
 * @type {string}
 */
const SITE_OWN_ERROR = 'ReferenceError: init is not defined';

for (const list of LISTS) {
    test(`springsteenlyrics.com ${list.name}: every page consolidates into the announced item count`, { tag: '@extended' }, async ({ page }) => {
        const pageErrors = collectPageErrors(page);
        if (list.timeout) test.setTimeout(list.timeout);
        await loadUserscriptPage(page, {
            url: list.url,
            settingsOverride: { sa_enable_springsteenlyrics: true, ...(list.settingsOverride || {}) },
        });

        const announced = await page.evaluate(() => {
            const m = document.body.innerText.match(/Showing items \d+-\d+ of (\d+)/);
            return m ? parseInt(m[1], 10) : null;
        });
        expect(announced, 'the page announces its item count (no CloudFlare challenge)').not.toBeNull();
        expect(announced, 'the list spans more than one page').toBeGreaterThan(100);

        await page.click(`button[data-label="${list.button}"]`);
        const wait = list.timeout || 120000;
        await page.locator('#mb-filter-container').waitFor({ state: 'visible', timeout: wait });
        await page.waitForFunction(() => !document.getElementById('mb-render-heading'), null, { timeout: wait });

        const headers = await page.evaluate(() => Array.from(document.querySelectorAll('table.tbl thead tr:first-child th'))
            .map((th) => th.dataset.colName || th.textContent.trim()));
        expect(headers).toEqual(list.headers);
        await expect(page.locator('table.tbl tbody tr')).toHaveCount(announced);
        await expect(page.locator('#mb-global-status-display'))
            .toContainText(`Loaded ${Math.ceil(announced / 100)} pages (${announced} rows)`);
        expect(pageErrors.filter((e) => e !== SITE_OWN_ERROR)).toEqual([]);
    });
}

// Sticky Page Headers and the sticky Title column under the site's REAL
// stylesheet (Bootstrap 3, the jquery.sticky navbar), which the fixtures
// strip: everything above the table keeps its left edge while the window is
// scrolled sideways, and Title docks at the table's own left. Geometry, with
// a moving table cell as the premise — see tests/fixtures/sl-sticky-headers.spec.js.
test('springsteenlyrics.com: the page above a wide table stays put while scrolling sideways', { tag: '@extended' }, async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 800 });
    await loadUserscriptPage(page, {
        url: 'https://springsteenlyrics.com/collection.php?cmd=list&category=book',
        settingsOverride: { sa_enable_springsteenlyrics: true },
    });
    await page.$eval('button[data-label="Show all items of this collection list"]', (b) => b.click());
    await page.locator('#mb-filter-container').waitFor({ state: 'visible', timeout: 120000 });
    await page.waitForFunction(() => !document.getElementById('mb-render-heading'), null, { timeout: 120000 });
    await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
    await page.mouse.move(998, 798);
    await page.waitForFunction(() => document.documentElement.classList.contains('mb-sph-on'), null, { timeout: 10000 });

    const sels = ['.breadcrumb-wrap', 'h1.mb-sl-h1', 'h2.mb-sl-list-heading'];
    const geometry = () => page.evaluate((s) => {
        const table = document.querySelector('table.tbl');
        const th = table.querySelector(':scope > thead > tr:first-child > th.mb-sticky-col');
        const last = Array.from(table.querySelectorAll(':scope > tbody > tr:first-child > td')).pop();
        return {
            scrollX: window.scrollX,
            lefts: s.map((sel) => document.querySelector(sel).getBoundingClientRect().left),
            tableLeft: table.getBoundingClientRect().left + table.clientLeft,
            thName: th ? (th.dataset.colName || th.textContent.trim()) : null,
            thLeft: th ? th.getBoundingClientRect().left : NaN,
            lastCellLeft: last.getBoundingClientRect().left,
        };
    }, sels);

    const before = await geometry();
    expect(before.thName).toMatch(/^Title/);
    await page.evaluate(() => window.scrollTo(document.documentElement.scrollWidth, window.scrollY));
    await page.waitForFunction(() => window.scrollX > 0);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
    const after = await geometry();

    expect(after.scrollX, 'premise: the page scrolls sideways').toBeGreaterThan(200);
    expect(before.lastCellLeft - after.lastCellLeft, 'premise: a table cell moves').toBeGreaterThan(after.scrollX * 0.9);
    const moved = sels.filter((sel, i) => Math.abs(after.lefts[i] - before.lefts[i]) > 1);
    expect(moved, 'elements whose left edge moved while scrolling').toEqual([]);
    expect(Math.abs(after.thLeft - before.tableLeft), 'Title docks at the table\'s natural left').toBeLessThanOrEqual(1);
});
