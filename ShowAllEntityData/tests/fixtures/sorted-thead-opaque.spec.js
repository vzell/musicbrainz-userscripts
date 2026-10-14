'use strict';

// A sorted column's header stays opaque while rows scroll under the sticky
// thead (applyStickyHeaders(): `table.tbl thead { background-color: inherit }`;
// on the Springsteen sites `_ensureForeignTableStyle()`'s explicit `#fff`).
//
// Reported 2026-10-14 on brucespringsteen.it: sort "Notes", scroll down, and
// the text of the rows passing under the pinned header showed through the
// "Notes" header ("gatefold"); after a multi-column sort, through every
// sorted column's header. The header tint `.mb-mscol-hdr-N` is a 60 % alpha
// `background-color !important`, which replaces the cell's own opaque
// colour. On MusicBrainz, MB's stylesheet paints an image on the thead
// itself, behind it; on the other sites the thead had no background at all.
//
// What this pins: the PAINTED colour of one point inside a sorted header
// cell's padding is the same with rows scrolled under the thead as with
// nothing under it, and is not the rows' colour. Not "the header has a tint"
// (always true, also while broken) and not a computed style (a wrong
// stacking or a clipped background would pass that).
//
// springsteenlyrics.com carries Bootstrap 3.3.2, whose `table {
// background-color: transparent }` outranks the zero-specificity table
// colour of _ensureForeignTableStyle(): the thead inherited `transparent`
// and the rows still showed through there after the first fix (reported
// 2026-10-14). The fixtures load no site CSS, so that arm injects the rule.
//
// MusicBrainz itself is not an arm here: the fixtures load without MB's
// stylesheet, so its thead image is missing and a pixel taken there would
// describe a page no user sees. On MB the rule changes nothing by
// construction: MB's `table.tbl` has no background colour, so the thead
// inherits `transparent`, its value before this rule existed.

const { test, expect } = require('../support/test');
const { loadBsRecordsPage } = require('../support/bsFixture');
const { loadSlListPage, SL_KINDS } = require('../support/slFixture');
const { waitForRenderComplete } = require('../support/browser');
const { waitForSortSettled } = require('../support/filterSortAssertions');

// Rows painted in a colour no header ever has.
const LOUD_ROWS = 'table.tbl > tbody > tr > td { background: rgb(255, 0, 0) !important; color: rgb(255, 0, 0) !important; }';

/**
 * Reads the painted colour of one viewport pixel from a screenshot.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} x
 * @param {number} y
 * @returns {Promise<string>} "r,g,b".
 */
async function pixelAt(page, x, y) {
    const png = await page.screenshot({ clip: { x: Math.round(x), y: Math.round(y), width: 1, height: 1 } });
    return page.evaluate(async (b64) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = 1;
        c.height = 1;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        return Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)).join(',');
    }, png.toString('base64'));
}

/**
 * Clicks a column header's ▲ sort icon, optionally Ctrl+Click (multi-sort).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} colName
 * @param {{ctrl?: boolean}} [opts]
 * @returns {Promise<void>}
 */
async function sortAsc(page, colName, { ctrl = false } = {}) {
    const th = page.locator(`table.tbl thead tr:first-child th[data-col-name="${colName}"]`).first();
    const btn = th.locator('.sort-icon-btn', { hasText: '▲' }).first();
    await waitForSortSettled(page, () => btn.click(ctrl ? { modifiers: ['Control'] } : {}));
}

/**
 * A point inside a header cell's top-left padding (no text, no button), in
 * viewport coordinates, plus whether the cell carries a sort tint.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} colName
 * @returns {Promise<{x: number, y: number, tinted: boolean}>}
 */
function headerPoint(page, colName) {
    return page.evaluate((name) => {
        const th = document.querySelector(`table.tbl thead tr:first-child th[data-col-name="${name}"]`);
        const r = th.getBoundingClientRect();
        return { x: r.left + 3, y: r.top + 3, tinted: /\bmb-mscol-hdr-\d\b/.test(th.className) };
    }, colName);
}

/**
 * Scrolls down until rows are under the stuck thead, then waits two frames.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{theadTop: number, rowsUnder: boolean}>}
 */
async function scrollRowsUnderThead(page) {
    await page.evaluate(() => {
        const t = document.querySelector('table.tbl');
        window.scrollTo(0, t.getBoundingClientRect().top + window.scrollY + 600);
    });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    return page.evaluate(() => {
        const t = document.querySelector('table.tbl');
        const head = t.tHead.getBoundingClientRect();
        return { theadTop: head.top, rowsUnder: t.tBodies[0].rows[0].getBoundingClientRect().top < head.top };
    });
}

// Any non-sticky column shows it ("Title" is the sticky one on both hosts,
// with an opaque blended tint of its own). The reported "Notes" lies right
// of a 1300 px window in the Unofficial list; "Format" and "Label" are in
// view. On springsteenlyrics.com: "Version" and "Label", as reported.
const HOSTS = [
    {
        name: 'brucespringsteen.it',
        cols: ['Format', 'Label'],
        css: '',
        open: async (page) => {
            await loadBsRecordsPage(page);
            await page.click('h1.mb-bs-h1 button[data-label="Unofficial"]');
        },
    },
    {
        name: 'springsteenlyrics.com (Bootstrap: table { background-color: transparent })',
        cols: ['Version', 'Label'],
        css: 'table { background-color: transparent; }',
        open: async (page) => {
            await loadSlListPage(page, { kind: 'collection' });
            await page.$eval(`button[data-label="${SL_KINDS.collection.button}"]`, (b) => b.click());
        },
    },
];

for (const host of HOSTS) {
    test.describe(`sorted header stays opaque over rows scrolling under the sticky thead (${host.name})`, () => {
        const arms = [
            ['one sorted column', [[host.cols[0], false]]],
            ['a multi-column sort (every sorted header)', [[host.cols[0], false], [host.cols[1], true]]],
        ];
        for (const [arm, sorts] of arms) {
            test(arm, async ({ page }) => {
                await page.setViewportSize({ width: 1300, height: 800 });
                await host.open(page);
                await waitForRenderComplete(page, { waitForAutoResize: false });
                await page.addStyleTag({ content: `${host.css}\n${LOUD_ROWS}` });
                for (const [col, ctrl] of sorts) await sortAsc(page, col, { ctrl });
                await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
                await page.mouse.move(2, 790);
                // The table's top 150 px down the window: the thead in its
                // natural place, nothing under it (the unstyled SL fixture
                // puts the table far below the fold).
                await page.evaluate(() => window.scrollTo(0,
                    document.querySelector('table.tbl').getBoundingClientRect().top + window.scrollY - 150));
                await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

                const cols = sorts.map(([c]) => c);
                const before = {};
                for (const col of cols) {
                    const p = await headerPoint(page, col);
                    expect(p.tinted, `premise: the ${col} header carries its sort tint`).toBe(true);
                    before[col] = await pixelAt(page, p.x, p.y);
                }

                const s = await scrollRowsUnderThead(page);
                expect(s.rowsUnder, 'premise: rows have scrolled under the stuck thead').toBe(true);
                for (const col of cols) {
                    const p = await headerPoint(page, col);
                    expect(Math.abs(p.y - 3 - s.theadTop), `premise: the ${col} header is in the stuck thead`).toBeLessThanOrEqual(1);
                    const after = await pixelAt(page, p.x, p.y);
                    expect(after, `the ${col} header shows no row through it`).toBe(before[col]);
                    expect(after, `the ${col} header is not the rows' colour`).not.toBe('255,0,0');
                }
            });
        }
    });
}
