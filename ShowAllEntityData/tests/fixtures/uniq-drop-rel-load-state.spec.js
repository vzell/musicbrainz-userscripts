'use strict';

// Relationships column: the 📊 "Relationships - Load state" section
// (PERFORMANCE.org Step 36, item 4 of org/relationships.org — find the rows in a
// huge, sparse table that are still unfetched, empty, or failed).
//
// ── What is pinned ──────────────────────────────────────────────────────────
//
//   1. COUNTS. Four fixed entries — not loaded / has relationships / none /
//      failed — counted over the column's visible rows. Zero-count entries are
//      omitted, like every other fixed-flag section.
//   2. FILTERING. Checking an entry narrows the table through the ordinary
//      structure-mode path. An entry that only rendered would pass (1) and fail
//      this — the skill's "silently dead entry" failure mode.
//   3. QUICKFILTER VISIBILITY. Every entry carries dataset.mbUniqSynLabel.
//   4. SHOWN ON A COLLAPSED COLUMN, where it matters most — and the collapsed
//      note says how many rows are loaded rather than "nothing is loaded".
//   5. FRESH COUNTS. The dropdown's per-table cache must be dropped by each
//      write, not only when a bulk pass ends, or a reopen after loading one more
//      row shows the old numbers.
//
// Network-free: every `**/ws/2/**` request is intercepted.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { collectPageErrors } = require('../support/liveAssertions');

// "Bruce Springsteen Studio Collection" — 12 releases, 12 distinct MBIDs,
// `tableMode: 'single'`, no browse source.
const SERIES = {
    url: 'https://musicbrainz.org/series/aa3694d3-a3d0-48ed-8f07-5b576de87908',
    shell: path.join(__dirname, '..', 'snapshots', 'series-releases', 'raw.html'),
    showAllLabel: 'Show all Releases for Series',
    urlGlob: 'https://musicbrainz.org/series/**',
};
const SERIES_ROWS = 12;

const SECTION = 'Relationships - Load state';
const LABEL = {
    pending: '🔗 not loaded yet',
    has: '✓ has relationships',
    none: '– no relationships',
    error: '⚠ request failed',
};

const OK_BODY = JSON.stringify({
    relations: [{
        'target-type': 'url',
        type: 'discogs',
        url: { resource: 'https://www.discogs.com/release/1' },
    }],
});
const EMPTY_BODY = JSON.stringify({ relations: [] });

/**
 * Loads the series shell with the Relationships column on and routes WS/2
 * through `respond`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{settings?: Object<string, *>, respond?: function(string): ?{status?: number, body?: string}}} opts
 * @returns {Promise<string[]>}
 */
async function loadSeries(page, { settings, respond } = {}) {
    const ws2 = [];
    await loadUserscriptPage(page, {
        url: SERIES.url,
        fixtureFile: SERIES.shell,
        testMode: true,
        settingsOverride: { sa_enable_relationships_column: true, ...(settings || {}) },
    });
    await page.route('**/ws/2/**', (route) => {
        const u = route.request().url();
        ws2.push(u);
        const r = (respond && respond(u)) || {};
        if (r.status && r.status !== 200) {
            return route.fulfill({ status: r.status, contentType: 'text/plain', body: 'Service Unavailable' });
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: r.body || OK_BODY });
    });
    await page.route(SERIES.urlGlob, (route) => route.fulfill({ path: SERIES.shell, contentType: 'text/html' }));
    await page.click(`button[data-label="${SERIES.showAllLabel}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
    return ws2;
}

const rowMbids = (page) => page.evaluate(() => Array.from(
    document.querySelectorAll('table.tbl tbody td.mb-rel-cell[data-mbid]')).map((td) => td.dataset.mbid));

/** One cell's load state, from its attributes. */
const cellState = (page, mbid) => page.evaluate((m) => {
    const td = document.querySelector(`table.tbl tbody td.mb-rel-cell[data-mbid="${m}"]`);
    return td ? { done: td.dataset.relDone === '1', error: td.dataset.relError || null,
        loading: td.dataset.relLoading !== undefined } : null;
}, mbid);

/** Clicks a cell at its right edge, away from any icon link. */
async function clickCellEdge(page, mbid) {
    const loc = page.locator(`table.tbl tbody td.mb-rel-cell[data-mbid="${mbid}"]`);
    const box = await loc.boundingBox();
    await loc.click({ position: { x: Math.max(1, box.width - 3), y: Math.floor(box.height / 2) } });
}

/** Opens the Relationships 📊 dropdown and returns the load-state section, or undefined. */
async function loadStateSection(page) {
    const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Relationships'));
    return (sections || []).find((s) => s.label === SECTION);
}

/**
 * Closes the 📊 dropdown through its own outside-mousedown handler.
 *
 * Deliberately NOT by clicking the column's 📊 wrap again, although that
 * toggles the panel closed for a person. Playwright scrolls an element into
 * view before clicking it, and on this page the header sits at the very bottom
 * edge of the viewport with the panel opened upward; the dropdown's scroll
 * handler closes the panel as soon as its owning wrap moves, and the click then
 * REOPENS it (observed: the panel still visible in the failure screenshot).
 * Escape is not reliable either: while the dropdown's quick-filter box has
 * focus, its own key handler takes Escape over.
 *
 * A mousedown dispatched on `document.body` reaches the capture-phase
 * listener that closes the panel for any press outside it and its owner —
 * with no scroll, no focus dependency, and nothing clickable hit.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function closeDropdown(page) {
    await page.evaluate(() => document.body.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, cancelable: true })));
    await expect(page.locator('#mb-col-uniq-dropdown')).toBeHidden({ timeout: 5000 });
}

const countsByLabel = (section) => Object.fromEntries(section.items.map((i) => [i.label, i.count]));

/**
 * Collapsed table (threshold 2) with row 0 loaded (has relationships), row 1
 * loaded empty, and row 2 failed.
 *
 * @returns {Promise<string[]>} Row MBIDs.
 */
async function loadThreeKinds(page) {
    let mbids = [];
    await loadSeries(page, {
        settings: { sa_rel_collapse_threshold: 2 },
        respond: (u) => {
            if (mbids[1] && u.includes(mbids[1])) return { body: EMPTY_BODY };
            if (mbids[2] && u.includes(mbids[2])) return { status: 503 };
            return null;
        },
    });
    mbids = await rowMbids(page);
    expect(mbids).toHaveLength(SERIES_ROWS);
    await clickCellEdge(page, mbids[0]);
    await clickCellEdge(page, mbids[1]);
    await clickCellEdge(page, mbids[2]);
    await expect.poll(async () => (await cellState(page, mbids[0])).done, { timeout: 15000 }).toBe(true);
    await expect.poll(async () => (await cellState(page, mbids[1])).done, { timeout: 15000 }).toBe(true);
    await expect.poll(async () => (await cellState(page, mbids[2])).error, { timeout: 30000 }).toContain('503');
    return mbids;
}

test.describe('unique-values dropdown: "Relationships - Load state" section', () => {
    let pageErrors;

    test.beforeEach(async ({ page }) => {
        pageErrors = collectPageErrors(page);
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('a collapsed column lists all four states with their counts, each quickfilter-visible',
        async ({ page }) => {
            await loadThreeKinds(page);

            const section = await loadStateSection(page);
            expect(section, `a "${SECTION}" section exists on a COLLAPSED column`).toBeTruthy();
            expect(countsByLabel(section)).toEqual({
                [LABEL.pending]: SERIES_ROWS - 3,
                [LABEL.has]: 1,
                [LABEL.none]: 1,
                [LABEL.error]: 1,
            });

            const shape = await page.evaluate((label) => {
                const sectionByLabel = (text) => Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
                    .find((s) => s.querySelector('.mb-uniq-section-label')?.textContent === text);
                const sectionEl = sectionByLabel(label);
                const iconsEl = sectionByLabel('Relationship icons');
                return {
                    datasetLabels: Array.from(sectionEl.querySelectorAll('.mb-col-uniq-item'))
                        .map((item) => item.dataset.mbUniqSynLabel || null),
                    note: (document.querySelector('#mb-col-uniq-dropdown .mb-uniq-rel-collapsed-note') || {})
                        .textContent || null,
                    // The collapsed note carries .mb-col-uniq-item too, so it is
                    // excluded: only real icon entries count here.
                    iconEntries: iconsEl
                        ? iconsEl.querySelectorAll('.mb-col-uniq-item:not(.mb-uniq-rel-collapsed-note)').length
                        : 0,
                };
            }, SECTION);
            expect(shape.datasetLabels.every(Boolean), 'every entry carries dataset.mbUniqSynLabel').toBe(true);
            // Two, not three: a FAILED request is not "loaded" — the same
            // definition the ▶🔗 progress badge uses (rel-column-progress-badge.spec.js).
            expect(shape.note, 'the collapsed note counts what IS loaded').toContain(`2 of ${SERIES_ROWS} loaded`);
            // A row loaded by hand in a COLLAPSED column has its icon listed like
            // any expanded column's — icon counts used to be skipped whenever the
            // column was collapsed.
            expect(shape.iconEntries, 'the hand-loaded row\'s icon is listed on a collapsed column')
                .toBeGreaterThan(0);
        });

    test('checking "request failed" narrows the table to exactly the failed row', async ({ page }) => {
        const mbids = await loadThreeKinds(page);
        const section = await loadStateSection(page);
        expect(section).toBeTruthy();

        await page.evaluate(({ sectionLabel, itemLabel }) => {
            const sectionEl = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
                .find((s) => s.querySelector('.mb-uniq-section-label')?.textContent === sectionLabel);
            Array.from(sectionEl.querySelectorAll('.mb-col-uniq-item'))
                .find((el) => el.dataset.mbUniqSynLabel === itemLabel).click();
        }, { sectionLabel: SECTION, itemLabel: LABEL.error });

        await expect.poll(() => page.evaluate(() => Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((r) => r.style.display !== 'none').length), { timeout: 15000 }).toBe(1);
        const visibleMbids = await page.evaluate(() => Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((r) => r.style.display !== 'none')
            .map((r) => (r.querySelector('td.mb-rel-cell') || {}).dataset?.mbid || null));
        expect(visibleMbids).toEqual([mbids[2]]);
    });

    test('counts follow a later load: reopening after one more row loads shows the new numbers',
        async ({ page }) => {
            await loadSeries(page, { settings: { sa_rel_collapse_threshold: 2 } });
            const mbids = await rowMbids(page);

            await clickCellEdge(page, mbids[0]);
            await expect.poll(async () => (await cellState(page, mbids[0])).done, { timeout: 15000 }).toBe(true);
            const first = await loadStateSection(page);
            expect(countsByLabel(first)).toEqual({ [LABEL.pending]: SERIES_ROWS - 1, [LABEL.has]: 1 });
            await closeDropdown(page);

            await clickCellEdge(page, mbids[1]);
            await expect.poll(async () => (await cellState(page, mbids[1])).done, { timeout: 15000 }).toBe(true);
            const second = await loadStateSection(page);
            expect(countsByLabel(second), 'the dropdown cache was dropped by the second write')
                .toEqual({ [LABEL.pending]: SERIES_ROWS - 2, [LABEL.has]: 2 });
        });

    test('a fully loaded table offers no "not loaded" entry', async ({ page }) => {
        // Threshold 0 = never collapse, so the whole table fetches at render.
        await loadSeries(page, { settings: { sa_rel_collapse_threshold: 0 } });
        await expect.poll(() => page.evaluate(
            () => window.__saTest.relTableStates()[0].pending), { timeout: 40000 }).toBe(0);
        const section = await loadStateSection(page);
        expect(section).toBeTruthy();
        expect(countsByLabel(section)).toEqual({ [LABEL.has]: SERIES_ROWS });
    });
});
