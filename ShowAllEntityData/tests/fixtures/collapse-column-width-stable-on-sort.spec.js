'use strict';

// Repeatedly sorting must not widen the table.
//
// ── The bug ─────────────────────────────────────────────────────────────────
//
// Reported on a release page: "when repeatedly sorting on a column, all
// multi-line columns, e.g. 'Recorded at place', get wider for every click on
// the sort glyph". `release-tracks` declares 18 collapsable columns, so the
// whole table crept sideways a few pixels at a time.
//
// Root cause: `initCollapsableColumns()` measured the first `<li>` of each
// multi-row cell with `white-space:nowrap` + `li.scrollWidth`, and applied
// `maxFirstLiWidth + 28` as `th.style.minWidth`, raising it but never lowering
// it. An `<li>` is a BLOCK box and the script's `<ul>`s carry `padding:0`, so
// it fills its `<td>`'s content box exactly — and for a block box with no
// horizontal overflow `scrollWidth` returns `clientWidth`, i.e. THE COLUMN'S
// CURRENT WIDTH rather than the item's own. A sort re-render reuses the
// existing `<thead>` untouched (renderGroupedTable's reuse branch empties only
// the `<tbody>`), so each click read back the width the previous click had
// forced, added 28 px, and committed it.
//
// The fix measures `width:max-content` instead — independent of the containing
// block, the same cure `_measureHeaderMinWidth()` already applies to the column
// drag floor — and stamps `data-mb-collapse-min-px` so the cleanup pass can drop
// its own previous value without touching an auto-resize floor.
//
// ── What these tests pin, and why they are shaped this way ──────────────────
//
// Both the symptom (rendered column width) and the mechanism
// (`th.style.minWidth`). The mechanism assertion is the load-bearing one: a
// width-only test would also pass if some unrelated layout constraint happened
// to pin the table while the floor kept climbing invisibly underneath.
//
// `sa_auto_resize_columns` defaults to TRUE and writes the SAME property with a
// floor of its own (`columnWidths[idx] + 20`, measured across the whole cell,
// not just its first `<li>`), so it is usually the larger of the two and masks
// this feature's value entirely. That is why the setting is pinned explicitly
// per test rather than left at its default:
//
//   - ON  — the shipped configuration, and the one the bug was reported from.
//   - OFF — the sharp case: this feature is then the only writer of
//           `th.style.minWidth`, so nothing can mask a ratchet.
//
// Each test also asserts its own premise — that a multi-row column exists at
// all, and (for the inflation test) that some column's floor really is this
// feature's. Without that, a fixture whose cells all happened to be single-row
// would sail through while exercising none of the code under test.
//
// Single sub-table only: this release has one medium, so the "only the SORTED
// sub-table ratchets" half of the diagnosis (a sort is a scoped re-render —
// `_renderDirtyGroupIdxs`) is not reproducible here. It needs no separate
// guard: an untouched group returns before `initCollapsableColumns` is reached.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { waitForColHeaderCountsStable } = require('../support/filterSortAssertions');

const RELEASE_URL = 'https://musicbrainz.org/release/1d404e1d-fcb6-3a52-b478-e706e893c897';
const FIXTURE_FILE = path.join(__dirname, 'release-tracks-ms-length.html');

const SORT_CLICKS = 5;

// ── The two declarations that decide whether this bug is reproducible ───────
//
// A fixture is a saved HTML file; musicbrainz.org's own stylesheet is NOT
// loaded, so the browser's defaults apply and the geometry differs from the
// real page in exactly the two properties this bug turns on. Measured on the
// reported release (9d451257-…, live) versus this fixture:
//
//                          live      fixture (bare)
//   td ul   padding-left   0px       40px   ← the browser default for <ul>
//   td      padding-left   4.8px     1px
//
// The old measurement's error per pass was `28 − tdPadLeft − tdPadRight(22)
// − ulPadLeft` plus the header's own chrome. With the default 40 px list
// indent that is comfortably NEGATIVE, so the value converges after one pass
// and the fixture reports a clean, stable, entirely misleading pass — which is
// what the first version of this spec did, against genuinely broken code.
//
// Restoring just these two declarations reproduces it: +3 px per sort click
// here, +12 px per click on the live page. Nothing else about MusicBrainz's
// stylesheet is needed, and nothing here fakes the behaviour under test — only
// the box model the real page has.
const MB_GEOMETRY_CSS = 'table.tbl td ul { padding-left: 0 !important; }\n'
    + 'table.tbl td { padding-left: 4.8px !important; }';

/**
 * Loads the release fixture, expands it, and waits until the header is settled.
 *
 * The deferred per-column count scan writes into `.mb-col-collapse-count` /
 * `.mb-col-uniq-count`, which changes header width — so it has to have fully
 * landed before anything is measured, or the first "growth" reading is that
 * instead of the bug.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} settingsOverride  Extra GM settings, merged over the defaults.
 */
async function setup(page, settingsOverride) {
    await loadUserscriptPage(page, {
        url: RELEASE_URL,
        fixtureFile: FIXTURE_FILE,
        testMode: true,
        settingsOverride: { sa_enable_release_tracks: true, ...settingsOverride },
    });
    await page.addStyleTag({ content: MB_GEOMETRY_CSS });
    await page.click('button[data-label="Show all Tracks for Release"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
    await waitForColHeaderCountsStable(page, { timeout: 60000 });
}

/**
 * Reads, for every header of the first rendered table, its rendered width, the
 * inline `min-width`, whether that floor is this feature's own
 * (`data-mb-collapse-min-px`), and how many multi-row cells the column has
 * (`td.mb-has-collapse-toggle`, applied to the cells that got a `▶N▤` toggle).
 *
 * @param   {import('@playwright/test').Page} page
 * @returns {Promise<Array<{col: string, width: number, minWidth: number, ours: boolean, multiRow: number}>>}
 */
async function columnMetrics(page) {
    return page.evaluate(() => {
        const tbl = document.querySelector('table.tbl');
        if (!tbl) return [];
        const ths = Array.from(tbl.querySelectorAll('thead tr:first-child th'));
        return ths.map((th, idx) => {
            let multiRow = 0;
            tbl.querySelectorAll('tbody tr').forEach((tr) => {
                const td = tr.cells[idx];
                if (td && td.classList.contains('mb-has-collapse-toggle')) multiRow++;
            });
            const stamped = th.dataset.mbCollapseMinPx;
            return {
                col: th.dataset.colName || th.textContent.trim().slice(0, 24),
                width: Math.round(th.getBoundingClientRect().width),
                minWidth: parseFloat(th.style.minWidth) || 0,
                ours: Boolean(stamped) && th.style.minWidth === `${stamped}px`,
                multiRow,
            };
        });
    });
}

/**
 * Clicks the first ascending-sort glyph `SORT_CLICKS` times, sampling every
 * column after each click. The first click's sample is the baseline: that is
 * the one pass allowed to establish a floor — every later one must be a no-op.
 *
 * @param   {import('@playwright/test').Page} page
 * @returns {Promise<{baseline: Array<Object>, samples: Array<Array<Object>>}>}
 */
async function sortRepeatedly(page) {
    const sortAsc = page.locator('.sort-icon-btn', { hasText: '▲' }).first();
    await expect(sortAsc).toBeVisible();

    await sortAsc.click();
    await waitForColHeaderCountsStable(page, { timeout: 60000 });
    const baseline = await columnMetrics(page);

    const samples = [];
    for (let i = 1; i < SORT_CLICKS; i++) {
        await sortAsc.click();
        await waitForColHeaderCountsStable(page, { timeout: 60000 });
        samples.push(await columnMetrics(page));
    }
    return { baseline, samples };
}

/**
 * Asserts no column's rendered width or `min-width` grew across the samples.
 *
 * @param {Array<Object>} baseline
 * @param {Array<Array<Object>>} samples
 */
function expectNoGrowth(baseline, samples) {
    expect(baseline.length, 'no headers rendered — the premise is broken')
        .toBeGreaterThan(5);
    const multiRowCols = baseline.filter((c) => c.multiRow > 0);
    expect(multiRowCols.length,
        'no multi-row (collapsable) column in this fixture — this spec would '
        + 'exercise none of the code under test').toBeGreaterThan(0);

    samples.forEach((sample, n) => {
        const grownWidth = sample
            .map((c, i) => ({ col: c.col, from: baseline[i].width, to: c.width }))
            .filter((c) => Math.abs(c.to - c.from) > 1);
        expect(grownWidth,
            `after sort click ${n + 2}, these columns changed rendered width: `
            + JSON.stringify(grownWidth)).toEqual([]);

        const grownMin = sample
            .map((c, i) => ({ col: c.col, from: baseline[i].minWidth, to: c.minWidth }))
            .filter((c) => c.to > c.from + 0.5);
        expect(grownMin,
            `after sort click ${n + 2}, th.style.minWidth grew on: `
            + JSON.stringify(grownMin)).toEqual([]);
    });
}

test.describe('collapsable columns: width is stable across repeated sorts', () => {
    test('repeated sorts do not widen multi-row columns (auto-resize on)', async ({ page }) => {
        await setup(page, { sa_auto_resize_columns: true });
        const { baseline, samples } = await sortRepeatedly(page);
        expectNoGrowth(baseline, samples);
    });

    test('repeated sorts do not widen multi-row columns (auto-resize off)', async ({ page }) => {
        await setup(page, { sa_auto_resize_columns: false });
        const { baseline, samples } = await sortRepeatedly(page);
        expectNoGrowth(baseline, samples);

        // With auto-resize off this feature owns every floor in play, so the
        // ratchet has nothing to hide behind — say so, or a future change that
        // let auto-resize mask it again would keep this test green.
        expect(baseline.some((c) => c.ours),
            'no column carries this feature\'s own min-width stamp — nothing here '
            + 'is exercising the code under test').toBe(true);
    });

    test('a column min-width comes back down when its widest row is filtered away', async ({ page }) => {
        // The other half of the fix. Measuring intrinsically stops the floor
        // CLIMBING, but on its own it would still leave the floor stuck at the
        // high-water mark of every row ever rendered, because the value is only
        // ever raised. The cleanup pass drops this feature's own previous stamp
        // so a fresh measurement replaces it.
        //
        // Without this test that half is invisible: removing the cleanup entry
        // and keeping the max-content measurement passes every other assertion
        // in this file (mutation-checked).
        await setup(page, { sa_auto_resize_columns: false });

        // Pick the column carrying the widest floor of this feature's own, then
        // pick the row that is NARROWEST in it and still multi-row. Filtering
        // down to that row leaves the column genuinely narrower than the floor
        // it is carrying, while keeping it a collapsable column (a column with
        // no multi-row cell left sets no floor at all, which would make the
        // assertion pass for an uninteresting reason).
        const target = await page.evaluate(() => {
            const tbl = document.querySelector('table.tbl');
            const ths = Array.from(tbl.querySelectorAll('thead tr:first-child th'));
            const rows = Array.from(tbl.querySelectorAll('tbody tr'));
            const titleIdx = ths.findIndex((t) => (t.dataset.colName || '') === 'Title');
            // Every rendered <li> is a block box filling its cell, so they all
            // report the SAME width — the per-row figure that matters is the
            // INTRINSIC one, measured in an off-layout shrink-to-fit box.
            const box = document.createElement('div');
            box.style.cssText = 'position:absolute;left:-9999px;top:0;'
                + 'width:max-content;visibility:hidden;';
            document.body.appendChild(box);
            const intrinsic = (li) => {
                const cs = getComputedStyle(li);
                box.style.font = cs.font;
                box.style.letterSpacing = cs.letterSpacing;
                box.innerHTML = '';
                box.appendChild(li.cloneNode(true));
                return box.getBoundingClientRect().width;
            };
            let best = null;
            ths.forEach((th, idx) => {
                const stamped = th.dataset.mbCollapseMinPx;
                if (!stamped || th.style.minWidth !== `${stamped}px`) return;
                const cells = [];
                rows.forEach((tr) => {
                    const td = tr.cells[idx];
                    if (!td || !td.classList.contains('mb-has-collapse-toggle')) return;
                    const li = td.querySelector('ul > li');
                    if (!li || titleIdx < 0 || !tr.cells[titleIdx]) return;
                    cells.push({
                        liWidth: intrinsic(li),
                        title: tr.cells[titleIdx].textContent.trim(),
                    });
                });
                if (cells.length < 2) return;
                const minWidth = parseFloat(stamped);
                if (!best || minWidth > best.minWidth) {
                    cells.sort((a, b) => a.liWidth - b.liWidth);
                    best = {
                        col: th.dataset.colName, idx, minWidth,
                        keepTitle: cells[0].title,
                        keepLiWidth: cells[0].liWidth,
                        widestLiWidth: cells[cells.length - 1].liWidth,
                    };
                }
            });
            box.remove();
            return best;
        });

        expect(target,
            'no column carries this feature\'s own min-width on 2+ multi-row rows')
            .toBeTruthy();
        expect(target.keepTitle.length,
            'could not identify the row to keep by its title').toBeGreaterThan(2);
        expect(target.widestLiWidth,
            `${target.col}: every row is the same width — filtering cannot narrow it`)
            .toBeGreaterThan(target.keepLiWidth + 20);

        const before = await page.evaluate(() =>
            document.querySelectorAll('table.tbl tbody tr').length);
        await page.fill('#mb-global-filter-input', target.keepTitle);
        await expect
            .poll(async () => page.evaluate(() =>
                document.querySelectorAll('table.tbl tbody tr').length))
            .toBeLessThan(before);
        await waitForColHeaderCountsStable(page, { timeout: 60000 });

        const after = await page.evaluate((idx) => {
            const th = document.querySelectorAll(
                'table.tbl thead tr:first-child th')[idx];
            return { minWidth: parseFloat(th.style.minWidth) || 0 };
        }, target.idx);

        expect(after.minWidth,
            `${target.col}: min-width stayed at ${after.minWidth}px after the page was `
            + `filtered down to a row needing ~${Math.round(target.keepLiWidth) + 28}px — `
            + 'the previous floor is never released').toBeLessThan(target.minWidth);
    });

    test('a column min-width is not inflated beyond its own content', async ({ page }) => {
        await setup(page, { sa_auto_resize_columns: false });
        await sortRepeatedly(page);

        // The floor this feature writes is `intrinsic first-<li> width + 28`
        // (18 px toggle + 10 px buffer). Measured intrinsically that is a real
        // bound on the content; measured via scrollWidth it was "the current
        // column width + 28" and drifted arbitrarily far from it.
        //
        // The expectation is computed INDEPENDENTLY — each first `<li>` cloned
        // into an off-layout shrink-to-fit box carrying the live cell's own font
        // metrics — rather than by calling the code path under test, so the
        // assertion is not circular. Only columns whose floor is actually ours
        // are considered; an auto-resize or hand-dragged width is a different
        // contract.
        const overshoot = await page.evaluate(() => {
            const tbl = document.querySelector('table.tbl');
            const ths = Array.from(tbl.querySelectorAll('thead tr:first-child th'));
            const box = document.createElement('div');
            box.style.cssText = 'position:absolute;left:-9999px;top:0;'
                + 'width:max-content;visibility:hidden;';
            document.body.appendChild(box);
            const out = [];
            ths.forEach((th, idx) => {
                const stamped = th.dataset.mbCollapseMinPx;
                if (!stamped || th.style.minWidth !== `${stamped}px`) return;
                let needed = 0;
                tbl.querySelectorAll('tbody tr').forEach((tr) => {
                    const td = tr.cells[idx];
                    if (!td || !td.classList.contains('mb-has-collapse-toggle')) return;
                    const li = td.querySelector('ul > li');
                    if (!li) return;
                    const cs = getComputedStyle(li);
                    box.style.font = cs.font;
                    box.style.letterSpacing = cs.letterSpacing;
                    box.innerHTML = '';
                    box.appendChild(li.cloneNode(true));
                    needed = Math.max(needed, Math.ceil(box.getBoundingClientRect().width));
                });
                if (!needed) return;
                out.push({ col: th.dataset.colName || '', minWidth: parseFloat(stamped), needed: needed + 28 });
            });
            box.remove();
            return out;
        });

        expect(overshoot.length,
            'no collapsable column carried this feature\'s own min-width — nothing '
            + 'was measured').toBeGreaterThan(0);

        // 12 px of slack for sub-pixel text metrics and inherited styles the
        // clone cannot reproduce exactly; the bug produced multiples of the
        // whole column width, not a rounding difference.
        const inflated = overshoot.filter((c) => c.minWidth > c.needed + 12);
        expect(inflated,
            'min-width far exceeds the column\'s own content — the measurement is '
            + `reading the rendered column width, not the item: ${JSON.stringify(inflated)}`)
            .toEqual([]);
    });
});
