'use strict';

// Every data table has its own paint layer (`table.tbl { position: relative;
// z-index: 0 }`, PERFORMANCE.org "Table paint layer"). Without it the table
// paints into the page's root layer, and one character typed into a filter box
// re-records the whole visible table: about 75 ms per key on artist-events,
// 17-19 ms with the rule (DEBUG-NOTES 2026-10-10, measured with
// tests/support/probe-keystroke-cost.js).
//
// ── The guarantees pinned ───────────────────────────────────────────────────
//
// 1. Every rendered `table.tbl` computes to `position: relative` and
//    `z-index: 0`, on a single-table and a multi-table page. A spec cannot time
//    a paint, so this pins the property that produces the layer, not the
//    saving; the typed perf metric (`capture-interaction-perf.js --only=typed`)
//    measures the saving.
// 2. It holds with sticky headers OFF too. The rule lives in the always-on
//    stylesheet, not in applyStickyHeaders()'s, which only runs when
//    `sa_enable_sticky_headers` is on; a rule moved there would pass (1) with
//    the default settings and silently stop applying for anyone who turned
//    sticky headers off.
// 3. The stacking context the rule creates does not change what the reader
//    sees on the table's own edge: with sticky headers on, a row scrolled up
//    under the stuck thead is still covered by the thead.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadFromDiskFixture } = require('../support/diskFixture');

// The BoDeans page: artist-releases, tableMode 'single', 56 rows.
const BODEANS_URL = 'https://musicbrainz.org/artist/84c38d3a-3400-4c28-b988-90558bb6fae0/releases';
const BODEANS_FIXTURE = path.join(__dirname, 'saved-data', 'artist-releases-bodeans.json.gz');

// "Tougher Than the Rest" — 7 releases across 2 groups, tableMode 'multi'.
const RG_URL = 'https://musicbrainz.org/release-group/f83d2211-dd81-4b1e-9a02-e89733891e1c';
const RG_SHELL = path.join(__dirname, '..', 'snapshots', 'releasegroup-releases', 'raw.html');
const RG_FIXTURE = path.join(__dirname, 'saved-data', 'releasegroup-releases.json.gz');

/**
 * The computed position and z-index of every `table.tbl` on the page.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<{position: string, zIndex: string}>>}
 */
const tableLayers = (page) => page.evaluate(() =>
    Array.from(document.querySelectorAll('table.tbl')).map((t) => {
        const cs = getComputedStyle(t);
        return { position: cs.position, zIndex: cs.zIndex };
    }));

test.describe('table paint layer', () => {
    test('single-table: the table is relative with z-index 0', async ({ page }) => {
        test.setTimeout(120000);
        await loadFromDiskFixture(page, {
            url: BODEANS_URL, fixturePath: BODEANS_FIXTURE, testMode: true,
            settingsOverride: { sa_enable_relationships_column: false },
        });
        await expect(page.locator('h2 .mb-row-count-stat')).toHaveText('(56)', { timeout: 30000 });
        const layers = await tableLayers(page);
        expect(layers.length, 'the data table is rendered').toBeGreaterThanOrEqual(1);
        for (const l of layers) expect(l).toEqual({ position: 'relative', zIndex: '0' });
    });

    test('multi-table: every sub-table is relative with z-index 0', async ({ page }) => {
        test.setTimeout(120000);
        await loadFromDiskFixture(page, {
            url: RG_URL, fixturePath: RG_FIXTURE, pageFixtureFile: RG_SHELL, testMode: true,
        });
        await expect(page.locator('table.tbl')).toHaveCount(2, { timeout: 30000 });
        expect(await tableLayers(page)).toEqual([
            { position: 'relative', zIndex: '0' },
            { position: 'relative', zIndex: '0' },
        ]);
    });

    test('with sticky headers off the layer is still there', async ({ page }) => {
        test.setTimeout(120000);
        await loadFromDiskFixture(page, {
            url: BODEANS_URL, fixturePath: BODEANS_FIXTURE, testMode: true,
            settingsOverride: { sa_enable_relationships_column: false, sa_enable_sticky_headers: false },
        });
        await expect(page.locator('h2 .mb-row-count-stat')).toHaveText('(56)', { timeout: 30000 });
        // Premise: sticky headers really are off, so their stylesheet is absent.
        expect(await page.locator('#mb-sticky-headers-style').count()).toBe(0);
        for (const l of await tableLayers(page)) expect(l).toEqual({ position: 'relative', zIndex: '0' });
    });

    test('a row scrolled under the stuck header is still covered by it', async ({ page }) => {
        test.setTimeout(120000);
        await page.setViewportSize({ width: 1280, height: 500 });
        await loadFromDiskFixture(page, {
            url: BODEANS_URL, fixturePath: BODEANS_FIXTURE, testMode: true,
            settingsOverride: { sa_enable_relationships_column: false },
        });
        await expect(page.locator('h2 .mb-row-count-stat')).toHaveText('(56)', { timeout: 30000 });
        // The thead sticks BELOW the stuck h2 bar (sticky filter bars), not at
        // the viewport's top edge. So: scroll well into the table, read where
        // the stuck thead now sits, then put row 10's top 2 px below that line.
        const probe = await page.evaluate(() => {
            const table = document.querySelector('table.tbl');
            const rows = table.tBodies[0].rows;
            window.scrollTo(0, window.scrollY + rows[30].getBoundingClientRect().top);
            const stuckTop = table.tHead.getBoundingClientRect().top;
            const row = rows[9];
            window.scrollBy(0, row.getBoundingClientRect().top - stuckTop - 2);
            const head = table.tHead.getBoundingClientRect();
            const rowNow = row.getBoundingClientRect();
            const x = head.left + Math.min(40, head.width / 2);
            const y = head.top + head.height / 2;
            const hit = document.elementFromPoint(x, y);
            return {
                headStuck: head.top < rowNow.bottom && head.bottom > rowNow.top,
                inHead: !!(hit && hit.closest('thead') === table.tHead),
                hitTag: hit ? hit.tagName : null,
            };
        });
        // Premise: the thead really overlaps the scrolled row (it is stuck).
        expect(probe.headStuck, 'the thead overlaps the scrolled row').toBe(true);
        expect(probe.inHead, `the point is drawn by the thead, got ${probe.hitTag}`).toBe(true);
    });
});
