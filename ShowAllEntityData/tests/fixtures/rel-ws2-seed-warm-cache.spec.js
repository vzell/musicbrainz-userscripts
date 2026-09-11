'use strict';

// A pre-seeded `rel-ws2` IndexedDB store makes the Relationships column render
// its icons with ZERO network requests.
//
// ── Why this spec exists ────────────────────────────────────────────────────
//
// It pins the single premise the Relationships interaction-perf arm rests on.
// `perfDescriptors.js`'s `applyPicardArm()` forbids an arm re-enabling this
// column because "that would put thousands of live requests inside a
// measurement bracket", and PERFORMANCE.org Step 35 therefore shipped without
// an interaction-latency number at all. The `--rel-arm=expanded` arm is only
// legitimate if seeding really does eliminate those requests.
//
// **The failure this guards against is silent and looks like success.** An arm
// whose seed did not take still produces a complete, plausible set of medians —
// it just spent ~42 minutes issuing 2301 live WS/2 requests inside the timing
// brackets first. Nothing crashes, and the output looks publishable. So the
// assertion here is a REQUEST COUNT of exactly zero, in the same spirit as
// `rel-column-collapse-toggle.spec.js`'s: "the icons appeared" would also pass
// if every one of them had been fetched.
//
// ── Why the records are hand-built here ─────────────────────────────────────
//
// The committed Dylan seed is 2301 real entities captured from WS/2, and its
// realism is load-bearing for the MEASUREMENT (the DOM cost scales with how
// many `<a><img>` + `.mb-rel-filter-key` triples land per cell). It is not
// load-bearing for the PLUMBING, which is what this file tests — "a warm cache
// means no request" is true of any record shape. Building a few records by hand
// keeps this spec network-free, fast, and independent of a 173 KB fixture.
//
// Deliberately NOT using `loadFromDiskFixture()`, for the reason
// `rel-column-collapse-toggle.spec.js` records at length: the Load-from-Disk
// dialog can land its confirm button below the 720px viewport, which flakes
// roughly one run in three. The "Show all" + routed-fetch path avoids it.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { writeRelWs2Records } = require('../support/relWs2Seed');

// "Bruce Springsteen Studio Collection" — 12 releases, one sub-table. The same
// shell the sibling rel spec uses, for the same reason: single-table mode, so
// the per-table state has exactly one subject.
const SERIES_URL = 'https://musicbrainz.org/series/aa3694d3-a3d0-48ed-8f07-5b576de87908';
const SERIES_SHELL = path.join(__dirname, '..', 'snapshots', 'series-releases', 'raw.html');

/** Two url-rels per entity, so "icons" and "entities" cannot be confused. */
const seededRelations = (n) => ({
    relations: [
        {
            'target-type': 'url',
            type: 'discogs',
            url: { resource: `https://www.discogs.com/release/${n}` },
            ended: false,
        },
        {
            'target-type': 'url',
            type: 'wikidata',
            url: { resource: `https://www.wikidata.org/wiki/Q${n}` },
            ended: false,
        },
    ],
});

/**
 * Loads the shell with the Relationships column on, counting every WS/2
 * request, and returns the counter plus the MBIDs the page wants.
 *
 * The route is registered BEFORE the "Show all" click and fulfils rather than
 * aborts, so a spec that expects requests still gets working ones.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object<string, *>} settings
 * @returns {Promise<{ws2Urls: string[]}>}
 */
async function loadSeriesPage(page, settings) {
    await loadUserscriptPage(page, {
        url: SERIES_URL,
        fixtureFile: SERIES_SHELL,
        testMode: true,
        settingsOverride: { sa_enable_relationships_column: true, ...settings },
    });
    const ws2Urls = [];
    await page.route('**/ws/2/**', (route) => {
        ws2Urls.push(route.request().url());
        return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(seededRelations(999)),
        });
    });
    await page.route('https://musicbrainz.org/series/**', (route) =>
        route.fulfill({ path: SERIES_SHELL, contentType: 'text/html' }));
    return { ws2Urls };
}

/** Every `data-mbid` the rendered rel cells carry. */
const renderedMbids = (page) => page.evaluate(() =>
    Array.from(new Set(Array.from(document.querySelectorAll('td.mb-rel-cell[data-mbid]'))
        .map((td) => td.dataset.mbid))));

test.describe('a warm rel-ws2 cache serves the Relationships column offline', () => {
    test('seeded: every icon renders and NOT ONE WS/2 request is made', async ({ page }) => {
        // Pass 1 — collapsed, purely to learn which MBIDs this page asks for.
        // Reading them from the DOM rather than hard-coding twelve UUIDs keeps
        // the spec working if the shell is ever re-captured.
        const { ws2Urls: discoveryUrls } = await loadSeriesPage(page, {
            sa_rel_collapse_threshold: 1,
        });
        await page.click('button[data-label="Show all Releases for Series"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const mbids = await renderedMbids(page);
        expect(mbids.length, 'the shell must produce rel cells to seed against')
            .toBeGreaterThan(5);
        expect(discoveryUrls,
            'a collapsed column must not fetch — if this fires, the discovery pass '
            + 'is not measuring a collapsed column and the real assertion below is void')
            .toEqual([]);

        // Pass 2 — a fresh page, seeded, with the column expanded from the start.
        const page2 = await page.context().newPage();
        const { ws2Urls } = await loadSeriesPage(page2, { sa_rel_collapse_threshold: 0 });
        const written = await writeRelWs2Records(page2, mbids.map((mbid, i) => ({
            ckey: `release:${mbid}`,
            data: seededRelations(i + 1),
            ts: Date.now(),
        })));
        expect(written, 'the seed must actually land in IndexedDB').toBe(mbids.length);

        await page2.click('button[data-label="Show all Releases for Series"]');
        await waitForRenderComplete(page2, { waitForAutoResize: false });
        await expect
            .poll(() => page2.locator('td.mb-rel-cell a').count(), { timeout: 15000 })
            .toBeGreaterThan(0);

        // THE ASSERTION. Phase 1 resolves every MBID from IndexedDB, so
        // `_missMbids` is empty and the Phase-2 queue issues nothing.
        expect(ws2Urls,
            `expected a warm cache to make zero WS/2 requests, got ${ws2Urls.length}: `
            + `${ws2Urls.slice(0, 3).join(', ')}`).toEqual([]);

        // And the icons really are there — two url-rels per entity, so a
        // half-applied seed cannot pass by rendering one.
        const shape = await page2.evaluate(() => ({
            anchors: document.querySelectorAll('table.tbl tbody td.mb-rel-cell a').length,
            filterKeys: document.querySelectorAll('table.tbl tbody .mb-rel-filter-key').length,
            done: document.querySelectorAll('td.mb-rel-cell[data-rel-done="1"]').length,
        }));
        expect(shape.anchors, 'two seeded url-rels per entity').toBe(mbids.length * 2);
        expect(shape.filterKeys, 'each icon carries its hidden filter key')
            .toBe(mbids.length * 2);
        expect(shape.done).toBe(mbids.length);
        await page2.close();
    });

    test('UNSEEDED, the same page DOES fetch — so the zero above is the seed, not the page',
        async ({ page }) => {
            // The control. Without it, "zero requests" would also be satisfied
            // by a page that never wanted any — which is exactly how the
            // collapsed default behaves, and would make the test above pass
            // while proving nothing about seeding.
            const { ws2Urls } = await loadSeriesPage(page, { sa_rel_collapse_threshold: 0 });
            await page.click('button[data-label="Show all Releases for Series"]');
            await waitForRenderComplete(page, { waitForAutoResize: false });
            await expect
                .poll(() => ws2Urls.length, { timeout: 15000 })
                .toBeGreaterThan(0);
            expect(ws2Urls[0]).toMatch(/\/ws\/2\/release\/[0-9a-f-]{36}\?inc=url-rels/);
        });
});
