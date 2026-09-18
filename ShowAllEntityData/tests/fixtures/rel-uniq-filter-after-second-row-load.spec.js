'use strict';

// Relationships column: picking the SAME 📊 icon entry again, after another row
// has been hand-loaded, must include that row.
//
// ── The report this reproduces (2026-09-16, live testing) ───────────────────
//
// On a collapsed column: click one cell's Load glyph — the row whose
// relationship is springsteenlyrics.com/bootlegs.php — then pick that entry
// from the 📊 dropdown. It filters to that one row, correctly. Clear the
// filter, hand-load a SECOND row carrying the same URL, and pick the entry
// again: only the FIRST row comes back.
//
// ── Why this is not "the dropdown went stale" ───────────────────────────────
//
// The saved captures show both rows carrying their own hidden
// `.mb-rel-filter-key` at the moment of the second pick, and the missing row
// REMOVED from the DOM rather than left unmatched. A row that is gone was never
// tested — so the row list was replayed, not recomputed.
//
// `_buildFilterKey()` hashes only filter INPUTS (query, flags, and each column's
// valueSet/structureModes). A hand-load changes cell CONTENT while every input
// stays identical, so the second pick produces the same key as the first and
// `_filterResultCache` returns the first pick's rows. The same defect class as
// the length-mismatch flag's missing key entry; the fix is at the write side —
// a rel write now drops the filter-result cache, coalesced per animation frame
// in `_relScheduleProgressRefresh()`.
//
// Each pick therefore asserts BOTH the dropdown's entry count and the rendered
// row count. The counts come from the uniq-dropdown cache and the rows from the
// filter-result cache — two different caches, and only asserting both tells
// "the dropdown is stale" apart from "the filter replayed an old result".
//
// Network-free: every `**/ws/2/**` request is intercepted.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { collectPageErrors } = require('../support/liveAssertions');

// "Bruce Springsteen Studio Collection" — 12 releases, `tableMode: 'single'`,
// the shape the reported page actually rendered.
const SERIES_URL = 'https://musicbrainz.org/series/aa3694d3-a3d0-48ed-8f07-5b576de87908';
const SERIES_SHELL = path.join(__dirname, '..', 'snapshots', 'series-releases', 'raw.html');
const SERIES_ROWS = 12;

// springsteenlyrics.com is _findCellRelIcons()'s one PATH_SENSITIVE_HOSTS
// entry, so its domainKey is host + path — the entry the user picked, and the
// one that exercises that branch.
const SL_DOMAIN_KEY = 'www.springsteenlyrics.com/bootlegs.php';
const ICONS_SECTION = 'Relationship icons';

/** Two rows get the same springsteenlyrics base URL; everything else discogs. */
const slBody = (item) => JSON.stringify({
    relations: [{
        'target-type': 'url',
        type: 'discogs',
        url: { resource: `https://www.springsteenlyrics.com/bootlegs.php?item=${item}` },
    }],
});
const otherBody = JSON.stringify({
    relations: [{
        'target-type': 'url',
        type: 'discogs',
        url: { resource: 'https://www.discogs.com/release/999' },
    }],
});

/**
 * Loads the series shell with the column ON and COLLAPSED, so nothing is
 * fetched until a cell is clicked, and `slFor` decides which mbids get the
 * springsteenlyrics relationship.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{slMbids: string[]}} state - mutated by the caller once row mbids are known
 * @returns {Promise<string[]>} intercepted WS/2 URLs
 */
async function loadCollapsedSeries(page, state) {
    const ws2 = [];
    await loadUserscriptPage(page, {
        url: SERIES_URL,
        fixtureFile: SERIES_SHELL,
        testMode: true,
        settingsOverride: {
            sa_enable_relationships_column: true,
            // 12 distinct entities > 2, so the column starts collapsed and the
            // render fetches nothing: every request below is a deliberate click.
            sa_rel_collapse_threshold: 2,
        },
    });
    await page.route('**/ws/2/**', (route) => {
        const u = route.request().url();
        ws2.push(u);
        const hit = state.slMbids.findIndex((m) => m && u.includes(m));
        return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: hit === -1 ? otherBody : slBody(1742 + hit),
        });
    });
    await page.route('https://musicbrainz.org/series/**',
        (route) => route.fulfill({ path: SERIES_SHELL, contentType: 'text/html' }));
    await page.click('button[data-label="Show all Releases for Series"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
    return ws2;
}

const rowMbids = (page) => page.evaluate(() => Array.from(
    document.querySelectorAll('table.tbl tbody td.mb-rel-cell[data-mbid]')).map((td) => td.dataset.mbid));

/** Rendered rows — runFilter() REMOVES non-matching rows on this path. */
const visibleRows = (page) => page.evaluate(() => Array.from(
    document.querySelectorAll('table.tbl tbody tr')).filter((r) => r.style.display !== 'none').length);

/** Whether one cell has finished loading. */
const cellDone = (page, mbid) => page.evaluate((m) => {
    const td = document.querySelector(`table.tbl tbody td.mb-rel-cell[data-mbid="${m}"]`);
    return !!td && td.dataset.relDone === '1';
}, mbid);

/** Clicks a cell at its right edge, away from any icon link. */
async function clickCellEdge(page, mbid) {
    const loc = page.locator(`table.tbl tbody td.mb-rel-cell[data-mbid="${mbid}"]`);
    const box = await loc.boundingBox();
    await loc.click({ position: { x: Math.max(1, box.width - 3), y: Math.floor(box.height / 2) } });
}

/**
 * Opens the 📊 dropdown and clicks the springsteenlyrics entry.
 *
 * @returns {Promise<?number>} the entry's own count, or null when absent
 */
async function pickSlEntry(page) {
    const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Relationships'));
    const icons = (sections || []).find((s) => s.label === ICONS_SECTION);
    if (!icons) return null;
    const entry = icons.items.find((i) => (i.label || '').includes(SL_DOMAIN_KEY));
    if (!entry) return null;
    await page.evaluate(({ sectionLabel, key }) => {
        const sectionEl = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
            .find((s) => s.querySelector('.mb-uniq-section-label')?.textContent === sectionLabel);
        Array.from(sectionEl.querySelectorAll('.mb-col-uniq-item'))
            .find((el) => (el.dataset.mbUniqSynLabel || '').includes(key)).click();
    }, { sectionLabel: ICONS_SECTION, key: SL_DOMAIN_KEY });
    return entry.count;
}

/** Closes the dropdown through its own outside-mousedown handler. */
async function closeDropdown(page) {
    await page.evaluate(() => document.body.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, cancelable: true })));
    await expect(page.locator('#mb-col-uniq-dropdown')).toBeHidden({ timeout: 5000 });
}

test.describe('Relationships 📊: a second hand-loaded row joins the same icon filter', () => {
    let pageErrors;

    test.beforeEach(async ({ page }) => {
        pageErrors = collectPageErrors(page);
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('picking the entry again after loading a second matching row includes both rows',
        async ({ page }) => {
            const state = { slMbids: [] };
            const ws2 = await loadCollapsedSeries(page, state);

            const mbids = await rowMbids(page);
            expect(mbids).toHaveLength(SERIES_ROWS);
            // Decided before any click, so the route can answer by mbid.
            state.slMbids = [mbids[0], mbids[1]];
            expect(ws2, 'a collapsed column fetches nothing at render').toHaveLength(0);

            // ── 1. Hand-load the first matching row, then filter to it ────────
            await clickCellEdge(page, mbids[0]);
            await expect.poll(() => cellDone(page, mbids[0]), { timeout: 20000 }).toBe(true);

            expect(await pickSlEntry(page), 'one row carries the URL so far').toBe(1);
            await expect.poll(() => visibleRows(page), { timeout: 15000 }).toBe(1);

            // ── 2. Clear it by unchecking the same entry ──────────────────────
            await pickSlEntry(page);
            await expect.poll(() => visibleRows(page), { timeout: 15000 }).toBe(SERIES_ROWS);
            await closeDropdown(page);

            // ── 3. Hand-load a SECOND row carrying the same URL ───────────────
            await clickCellEdge(page, mbids[1]);
            await expect.poll(() => cellDone(page, mbids[1]), { timeout: 20000 }).toBe(true);

            // ── 4. Pick the same entry again ──────────────────────────────────
            // The count comes from the uniq-dropdown cache and the rows from the
            // filter-result cache. Before the fix the count was already 2 while
            // only 1 row was rendered: the dropdown had been refreshed, the row
            // list had not.
            expect(await pickSlEntry(page), 'the entry now counts both rows').toBe(2);
            // Labelled deliberately: this is the assertion the defect trips, and
            // an unlabelled `toBe` reports only "expect(received).toBe(expected)",
            // which is indistinguishable from the count assertion above in a
            // mutation summary.
            await expect.poll(() => visibleRows(page), {
                timeout: 15000,
                message: 'both matching rows are rendered, not just the first',
            }).toBe(2);

            // Exactly one request per clicked row, and nothing else fetched.
            expect(ws2).toHaveLength(2);
        });
});
