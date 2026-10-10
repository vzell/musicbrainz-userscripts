'use strict';

// applyStickyColumn() writes every cell's style first and reads the computed
// backgrounds afterwards (PERFORMANCE.org Step 41). Interleaved per cell — write
// the inline background, read getComputedStyle back, next cell — every read had
// to recompute the style the previous write had just invalidated.
//
// ── The guarantees pinned ───────────────────────────────────────────────────
//
// 1. The getComputedStyle reads of one call come in ONE group: no DOM write
//    between them. Counted from inside window.getComputedStyle: a read that
//    finds the table mutated since the previous read (style and class writes
//    are attribute mutations; MutationObserver.takeRecords() is synchronous)
//    starts a group. Premise: many rows were read.
// 2. The snapshot is right: every non-sticky cell's data-mb-rest-bg is the
//    background it computes to at rest (or its own data-mb-custom-cell-bg),
//    and every sticky cell's data-mb-sticky-bg is what it paints with — the
//    property the hover handlers restore from. A pass that read before
//    writing would store the PREVIOUS inline colour and fail this.
// 3. Row hover still paints the whole row and restores it on leave.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadFromDiskFixture } = require('../support/diskFixture');

// The BoDeans page: artist-releases, tableMode 'single', 56 rows.
const BODEANS_URL = 'https://musicbrainz.org/artist/84c38d3a-3400-4c28-b988-90558bb6fae0/releases';
const BODEANS_FIXTURE = path.join(__dirname, 'saved-data', 'artist-releases-bodeans.json.gz');

/**
 * Loads the fixture with the sticky column on.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function open(page) {
    await loadFromDiskFixture(page, {
        url: BODEANS_URL, fixturePath: BODEANS_FIXTURE, testMode: true,
        settingsOverride: { sa_enable_relationships_column: false, sa_enable_sticky_columns: true },
    });
    await expect(page.locator('h2 .mb-row-count-stat')).toHaveText('(56)', { timeout: 30000 });
    await expect(page.locator('table.tbl tbody td.mb-sticky-col').first()).toBeAttached();
}

test.describe('sticky column: writes first, then reads', () => {
    test('one call reads every computed background in a single group', async ({ page }) => {
        test.setTimeout(120000);
        await open(page);
        const rec = await page.evaluate(() => {
            const table = document.querySelector('table.tbl');
            const obs = new MutationObserver(() => {});
            obs.observe(table, { attributes: true, childList: true, subtree: true });
            const r = { groups: 0, reads: 0 };
            const gcs = window.getComputedStyle;
            window.getComputedStyle = function (el, ...rest) {
                if (el && table.contains(el) && el.closest('tbody')) {
                    r.reads++;
                    if (obs.takeRecords().length > 0 || r.groups === 0) r.groups++;
                }
                return gcs.call(this, el, ...rest);
            };
            try {
                obs.takeRecords();
                window.__saTest.sticky.apply(0);
            } finally {
                window.getComputedStyle = gcs;
                obs.disconnect();
            }
            return r;
        });
        expect(rec.reads, 'premise: every body cell was read').toBeGreaterThan(56);
        expect(rec.groups, `reads came in ${rec.groups} groups (${rec.reads} reads)`).toBe(1);
    });

    test('the stored rest colours are the ones the cells paint with', async ({ page }) => {
        test.setTimeout(120000);
        await open(page);
        await page.evaluate(() => window.__saTest.sticky.apply(0));
        const bad = await page.evaluate(() => {
            const norm = (c) => ((c === 'rgba(0, 0, 0, 0)' || c === 'transparent') ? '#ffffff' : c);
            const out = [];
            document.querySelectorAll('table.tbl tbody tr').forEach((tr, ri) => {
                Array.from(tr.cells).forEach((td, ci) => {
                    const now = getComputedStyle(td).backgroundColor;
                    if (td.classList.contains('mb-sticky-col')) {
                        const want = td.dataset.mbStickyBg;
                        if (!want || td.style.backgroundColor === '') out.push(`sticky r${ri}: no paint (${want})`);
                    } else {
                        const want = td.dataset.mbCustomCellBg || norm(now);
                        if (td.dataset.mbRestBg !== want) out.push(`r${ri}c${ci}: stored ${td.dataset.mbRestBg}, paints ${want}`);
                    }
                });
            });
            return out.slice(0, 5).concat(out.length > 5 ? [`… ${out.length} in all`] : []);
        });
        expect(bad).toEqual([]);
    });

    test('hovering a row paints it and leaving restores it', async ({ page }) => {
        test.setTimeout(120000);
        await open(page);
        const row = page.locator('table.tbl tbody tr').nth(3);
        const cellBgs = () => row.evaluate((tr) => Array.from(tr.cells).map((td) => getComputedStyle(td).backgroundColor));
        const rest = await cellBgs();
        await row.locator('td').nth(2).hover();
        const hovered = await cellBgs();
        expect(new Set(hovered).size, 'the whole row takes one hover colour').toBe(1);
        expect(hovered[0]).not.toBe(rest[2]);
        await page.mouse.move(0, 0);
        await expect.poll(cellBgs).toEqual(rest);
    });
});
