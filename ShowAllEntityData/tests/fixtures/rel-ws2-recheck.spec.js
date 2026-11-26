'use strict';

// The Relationships column's background re-check of older kept answers
// (stale-while-revalidate, 2026-11-26; majkinetor's Event Horizon kpCheck();
// vzell: "re-check a few, in background"). After the column has loaded from
// IndexedDB, the answers kept for more than 7 days are asked again, the
// oldest first, at most 100 per page, one per rate slot, with no ◌ in the
// cells; a changed answer rewrites its row, an unchanged one only renews.
//
// Shell: series-releases (12 releases), seeded in rel-ws2 like
// rel-ws2-seed-warm-cache.spec.js. Guarantees pinned, each named:
//   R1  only the answers older than 7 days are asked, oldest first, and the
//       cells never show the loading state;
//   R2  a changed answer rewrites the row (a third icon), an unchanged one
//       does not; the job's counts say so;
//   R3  the per-page cap (seeded to 2) takes the two oldest;
//   R4  sa_rel_idb_recheck off: nothing is asked.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { writeRelWs2Records } = require('../support/relWs2Seed');

const SERIES_URL = 'https://musicbrainz.org/series/aa3694d3-a3d0-48ed-8f07-5b576de87908';
const SERIES_SHELL = path.join(__dirname, '..', 'snapshots', 'series-releases', 'raw.html');
const DAY = 86400000;

/** Two url-rels per entity (the seed and an unchanged answer are this, exactly). */
const rels = (n, extra = false) => ({
    relations: [
        { 'target-type': 'url', type: 'discogs', url: { resource: `https://www.discogs.com/release/${n}` }, ended: false },
        { 'target-type': 'url', type: 'wikidata', url: { resource: `https://www.wikidata.org/wiki/Q${n}` }, ended: false },
    ].concat(extra ? [{ 'target-type': 'url', type: 'purchase for download', url: { resource: `https://example.bandcamp.com/album/${n}` }, ended: false }] : []),
});

/**
 * Loads the shell; the Web Service answers a release from `answerFor(mbid)`
 * and every request is logged.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} settings
 * @param {function(string): Object} answerFor
 * @returns {Promise<{ws2: string[]}>}
 */
async function loadSeries(page, settings, answerFor) {
    await loadUserscriptPage(page, {
        url: SERIES_URL, fixtureFile: SERIES_SHELL, testMode: true,
        settingsOverride: { sa_enable_relationships_column: true, ...settings },
    });
    const ws2 = [];
    await page.route('**/ws/2/**', (route) => {
        const url = route.request().url();
        ws2.push(url);
        const m = /\/ws\/2\/release\/([0-9a-f-]{36})\?/.exec(url);
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(m ? answerFor(m[1]) : { relations: [] }) });
    });
    await page.route('https://musicbrainz.org/series/**', (route) => route.fulfill({ path: SERIES_SHELL, contentType: 'text/html' }));
    return { ws2 };
}

/** The page's release MBIDs, from a collapsed (fetch-free) discovery pass. */
async function discover(page) {
    await loadSeries(page, { sa_rel_collapse_threshold: 1 }, () => ({ relations: [] }));
    await page.click('button[data-label="Show all Releases for Series"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
    return page.evaluate(() => Array.from(new Set(Array.from(document.querySelectorAll('td.mb-rel-cell[data-mbid]')).map(td => td.dataset.mbid))));
}

/**
 * A fresh page with every release seeded: those in `ages` (mbid → days) that
 * old, the rest kept today.
 *
 * @returns {Promise<{page2: import('@playwright/test').Page, ws2: string[]}>}
 */
async function seeded(page, mbids, ages, { settings = {}, answerFor = null, before = null } = {}) {
    const page2 = await page.context().newPage();
    const index = new Map(mbids.map((m, i) => [m, i + 1]));
    const { ws2 } = await loadSeries(page2, { sa_rel_collapse_threshold: 0, ...settings }, answerFor || (m => rels(index.get(m))));
    const written = await writeRelWs2Records(page2, mbids.map((mbid, i) => ({
        ckey: `release:${mbid}`, data: rels(i + 1), ts: Date.now() - (ages[mbid] || 0) * DAY,
    })));
    expect(written).toBe(mbids.length);
    // Every cell's loading state, as it happens.
    await page2.evaluate(() => {
        window.__relLoadingSeen = 0;
        new MutationObserver((ms) => ms.forEach(m => { if (m.attributeName === 'data-rel-loading' && m.target.dataset.relLoading) window.__relLoadingSeen++; }))
            .observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-rel-loading'] });
    });
    if (before) await before(page2);
    await page2.click('button[data-label="Show all Releases for Series"]');
    await waitForRenderComplete(page2, { waitForAutoResize: false });
    return { page2, ws2, index };
}

const askedMbids = (ws2) => ws2.map(u => (/\/ws\/2\/release\/([0-9a-f-]{36})\?/.exec(u) || [])[1]).filter(Boolean);

test.describe('the Relationships column re-checks older kept answers in the background', () => {
    test('R1 + R2: only answers older than 7 days are asked, oldest first, no ◌; a changed one rewrites its row', async ({ page }) => {
        const mbids = await discover(page);
        expect(mbids.length).toBeGreaterThan(5);
        const [a, b, c] = mbids;
        const ages = { [a]: 10, [b]: 20, [c]: 8 };
        const idx = new Map(mbids.map((m, i) => [m, i + 1]));
        const { page2, ws2 } = await seeded(page, mbids, ages, { answerFor: m => rels(idx.get(m), m === b) });
        await expect.poll(() => askedMbids(ws2).length, { timeout: 20000, message: 'three re-checks' }).toBe(3);
        expect(askedMbids(ws2), 'the oldest first; nothing kept today').toEqual([b, a, c]);
        expect(ws2.every(u => u.includes('inc=url-rels'))).toBe(true);
        await expect.poll(() => page2.evaluate(() => window.__saTest.relRecheck.stats()), { timeout: 10000 }).toEqual({ asked: 3, changed: 1, done: true });
        expect(await page2.evaluate(() => window.__relLoadingSeen), 'no ◌ during a re-check').toBe(0);
        // The changed row has its third icon; an unchanged one still two.
        await expect(page2.locator(`td.mb-rel-cell[data-mbid="${b}"] .mb-rel-filter-key`)).toHaveCount(3);
        await expect(page2.locator(`td.mb-rel-cell[data-mbid="${a}"] .mb-rel-filter-key`)).toHaveCount(2);
        await page2.close();
    });

    test('R3: the per-page cap takes the oldest', async ({ page }) => {
        const mbids = await discover(page);
        const [a, b, c] = mbids;
        const { page2, ws2 } = await seeded(page, mbids, { [a]: 10, [b]: 20, [c]: 8 },
            { before: (p) => p.evaluate(() => window.__saTest.relRecheck.cap(2)) });
        await expect.poll(() => page2.evaluate(() => window.__saTest.relRecheck.stats().done), { timeout: 20000 }).toBe(true);
        expect(askedMbids(ws2)).toEqual([b, a]);
        await page2.close();
    });

    test('R4: sa_rel_idb_recheck off: nothing is asked', async ({ page }) => {
        const mbids = await discover(page);
        const [a, b] = mbids;
        const { page2, ws2 } = await seeded(page, mbids, { [a]: 10, [b]: 20 }, { settings: { sa_rel_idb_recheck: false } });
        await expect.poll(() => page2.locator('td.mb-rel-cell[data-rel-done="1"]').count(), { timeout: 15000 }).toBe(mbids.length);
        // The re-check decides at the drain, and says so even when it does nothing.
        await expect.poll(() => page2.evaluate(() => window.__saTest.relRecheck.stats().done), { timeout: 15000 }).toBe(true);
        expect(ws2).toEqual([]);
        await page2.close();
    });
});
