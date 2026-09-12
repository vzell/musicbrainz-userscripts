'use strict';

// Sorting the Relationships column used to be a silent no-op: every sort
// comparator derives its comparison value from `_sortCellText()`, which for
// a `.mb-rel-cell` always resolved to '' — its only content is
// `<a><img></a>` icons plus a `display:none` `.mb-rel-filter-key` span that
// `getCleanVisibleText()` deliberately strips (see CLAUDE.md's Relationships
// column section). Comparing '' against '' left every click a stable no-op
// in both directions.
//
// `_sortColumnKind()` now classifies 'Relationships' as a new 'count' kind,
// and both comparators (single- and multi-column) read the number of
// `.mb-rel-filter-key` spans in the cell directly instead of going through
// `_sortCellText()` — one span per rendered icon (`_relAppendIcon()` appends
// them together), so this is the literal on-screen icon count.
//
// This spec forces the column COLLAPSED (`sa_rel_collapse_threshold: 1`),
// which guarantees ZERO WS/2 requests are ever issued — the bug and its fix
// live entirely in the comparator reading already-rendered cells, so no real
// fetch is needed. A known ROTATED permutation of icon markup is injected
// directly, using the exact shape `_relAppendIcon()` produces: counts are
// `(rowIndex + 6) % 12`, i.e. [6,7,8,9,10,11,0,1,2,3,4,5]. That shape is
// neither already ascending nor already descending, which matters: a plain
// reverse permutation ([11,10,...,0]) would make the DESCENDING assertion
// pass even for a broken no-op comparator, since the untouched starting
// order already reads as "descending". The rotation makes every one of
// "untouched", "ascending", and "descending" a distinct, exact row order, so
// each assertion actually falsifies a no-op comparator.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { waitForSortSettled } = require('../support/filterSortAssertions');

// "Bruce Springsteen Studio Collection" — 12 releases, one sub-table,
// tableMode: 'single'. Reused from rel-column-collapse-toggle.spec.js.
const SERIES_URL = 'https://musicbrainz.org/series/aa3694d3-a3d0-48ed-8f07-5b576de87908';
const SERIES_SHELL = path.join(__dirname, '..', 'snapshots', 'series-releases', 'raw.html');
const SERIES_ROWS = 12;

/**
 * Appends `count` icon anchors to a rel cell, in the exact shape
 * `_relAppendIcon()` produces — one `<a><img></a>` plus a `display:none`
 * `.mb-rel-filter-key` span per icon.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number[]} counts - Icon count for each row, in DOM row order.
 * @returns {Promise<void>}
 */
async function injectIconCounts(page, counts) {
    await page.evaluate((rowCounts) => {
        const headers = Array.from(document.querySelectorAll('table.tbl thead tr:first-child th'));
        const relIdx = headers.findIndex((th) => th.dataset.colName === 'Relationships');
        const rows = Array.from(document.querySelectorAll('table.tbl tbody tr'));
        rows.forEach((tr, i) => {
            const td = tr.cells[relIdx];
            const count = rowCounts[i];
            for (let k = 0; k < count; k++) {
                const a = document.createElement('a');
                a.href = `https://example.com/${i}/${k}`;
                a.title = a.href;
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                const img = document.createElement('img');
                img.src = 'https://example.com/favicon.ico';
                img.style.cssText = 'width:16px;height:16px;vertical-align:middle;margin:1px;';
                a.appendChild(img);
                const key = document.createElement('span');
                key.className = 'mb-rel-filter-key';
                key.textContent = a.href;
                key.setAttribute('aria-hidden', 'true');
                key.style.cssText = 'display:none;';
                a.appendChild(key);
                td.appendChild(a);
            }
        });
    }, counts);
}

/** Reads each row's `.mb-rel-filter-key` count, in current DOM row order. */
const readCounts = (page) => page.evaluate(() => {
    const headers = Array.from(document.querySelectorAll('table.tbl thead tr:first-child th'));
    const relIdx = headers.findIndex((th) => th.dataset.colName === 'Relationships');
    return Array.from(document.querySelectorAll('table.tbl tbody tr'))
        .map((tr) => tr.cells[relIdx].querySelectorAll('.mb-rel-filter-key').length);
});

/** Clicks the Relationships column header's ▲ or ▼ sort icon. */
async function clickRelSort(page, glyph) {
    const th = page.locator('table.tbl thead th[data-col-name="Relationships"]');
    const btn = th.locator('.sort-icon-btn', { hasText: glyph }).first();
    await waitForSortSettled(page, () => btn.click());
}

test.describe('Relationships column: sort by icon count', () => {
    test.beforeEach(async ({ page }) => {
        await loadUserscriptPage(page, {
            url: SERIES_URL,
            fixtureFile: SERIES_SHELL,
            testMode: true,
            settingsOverride: {
                sa_enable_relationships_column: true,
                // Forces the column collapsed: guarantees zero WS/2 requests,
                // ever — the bug/fix under test is purely about the
                // comparator reading already-rendered cells.
                sa_rel_collapse_threshold: 1,
            },
        });
        // Belt-and-braces: the threshold above already guarantees this is
        // never hit, but keep the page network-free regardless.
        await page.route('**/ws/2/**', (route) => route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: '{"relations":[]}',
        }));
        await page.route('https://musicbrainz.org/series/**', (route) => route.fulfill({
            path: SERIES_SHELL,
            contentType: 'text/html',
        }));

        await page.click('button[data-label="Show all Releases for Series"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });

        // Rotated permutation — neither already ascending nor already
        // descending, so every direction (untouched/ascending/descending)
        // reads as a distinct, exact row order. See file header comment.
        const rotatedCounts = Array.from({ length: SERIES_ROWS }, (_, i) => (i + 6) % SERIES_ROWS);
        await injectIconCounts(page, rotatedCounts);
    });

    test('_sortColumnKind classifies Relationships as count', async ({ page }) => {
        const kind = await page.evaluate(() => window.__saTest.sortColumnKind('Relationships'));
        expect(kind).toBe('count');
    });

    test('ascending sort orders rows by icon count, fewest first', async ({ page }) => {
        // Sanity: confirm the starting order is the rotated permutation, not
        // already sorted in either direction, before trusting the assertion
        // below to mean anything.
        expect(await readCounts(page)).toEqual(
            Array.from({ length: SERIES_ROWS }, (_, i) => (i + 6) % SERIES_ROWS)
        );

        await clickRelSort(page, '▲');

        expect(await readCounts(page)).toEqual(
            Array.from({ length: SERIES_ROWS }, (_, i) => i)
        );
    });

    test('descending sort orders rows by icon count, most first', async ({ page }) => {
        await clickRelSort(page, '▼');

        expect(await readCounts(page)).toEqual(
            Array.from({ length: SERIES_ROWS }, (_, i) => SERIES_ROWS - 1 - i)
        );
    });
});
