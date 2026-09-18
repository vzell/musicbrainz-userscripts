'use strict';

// A WS/2 transport failure must not be recorded as "this entity has no
// relationships".
//
// ── Why this exists ─────────────────────────────────────────────────────────
//
// Before PERFORMANCE.org Step 36, `_relFetchWs2()` resolved `null` on ANY HTTP
// failure, `_populateCells(mbid, null)` then stamped `relDone` exactly as it
// does for an entity with zero relationships, and the null promise stayed in
// `_relWs2Cache` for the rest of the session. So a MusicBrainz 503 — which
// arrives in bursts under bot load; the Step 36 probe on 2026-09-15 saw most
// requests need 3-5 retries — became a permanent and invisible "none".
//
// ── The guarantees, pinned separately because each fails differently ───────
//
//   1. OUTCOME. A failed cell is marked failed (`data-rel-error`), is NOT done,
//      and the request was retried before being called a failure. Checking
//      only "no icons" would pass on the old code too, since "none" has no
//      icons either — that is the adjacent property this deliberately avoids.
//   2. NO RETRY STORM. A failed cell is excluded in three places, and they
//      cover for one another, so a request count after a keystroke proves
//      almost nothing on its own:
//        - `_relAnyPendingInExpandedTable()`, runFilter()'s gate — pinned by
//          `relInitRuns()` NOT moving across a keystroke;
//        - the impl's candidate scan and `_relQueueStillWants()` — pinned
//          together by forcing a pass (`relRunPass()`) and asserting the failed
//          MBID is still not re-requested. Either one alone suffices, so
//          mutating just one of the two leaves this green; that is recorded
//          rather than hidden.
//   3. NOT CACHED. An explicit collapse + re-expand DOES re-request it, and a
//      success then populates it. The cells that succeeded are NOT
//      re-requested, because collapsing keeps the cache — so this also proves
//      that the failure, specifically, was not what got cached.
//   4. SURVIVES A RE-RENDER (multi-table). `renderGroupedTable()` always clones
//      from the master rows, so the marker must be mirrored onto them.
//      Otherwise the next keystroke hands back a plain pending cell, the gate
//      sees work to do, and the failure is re-requested after all. Untestable
//      on a single-table page, where the initial render MOVES the master rows
//      into the DOM and the live cell is the master.
//
// Network-free: every `**/ws/2/**` request is intercepted and counted, the
// shape `rel-column-collapse-toggle.spec.js` established.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { clickMasterToggleAndExpandAll, collectPageErrors } = require('../support/liveAssertions');

// "Bruce Springsteen Studio Collection" — 12 releases, 12 distinct MBIDs, one
// table (`tableMode: 'single'`).
const SERIES_URL = 'https://musicbrainz.org/series/aa3694d3-a3d0-48ed-8f07-5b576de87908';
const SERIES_SHELL = path.join(__dirname, '..', 'snapshots', 'series-releases', 'raw.html');
const SERIES_ROWS = 12;

// "Tougher Than the Rest" — 7 releases across 2 sub-tables (Official 6,
// Promotion 1), `tableMode: 'multi'`.
const RG_URL = 'https://musicbrainz.org/release-group/f83d2211-dd81-4b1e-9a02-e89733891e1c';
const RG_SHELL = path.join(__dirname, '..', 'snapshots', 'releasegroup-releases', 'raw.html');
const RG_REL_CELLS = 7;

// One url-rel per entity, so one icon per successful cell.
const OK_BODY = JSON.stringify({
    relations: [{
        'target-type': 'url',
        type: 'discogs',
        url: { resource: 'https://www.discogs.com/release/1' },
    }],
});

const FAIL_503 = { status: 503, contentType: 'text/plain', body: 'Service Unavailable' };

/**
 * Splits the Relationships cells into the one whose requests fail and the rest.
 *
 * @param {import('@playwright/test').Page} page
 * @param {?string} failMbid
 * @returns {Promise<{othersDone: number, othersTotal: number, failDone: boolean[],
 *                    failError: Array<?string>, failAnchors: number}>}
 */
const readCells = (page, failMbid) => page.evaluate((m) => {
    const cells = Array.from(document.querySelectorAll('table.tbl tbody td.mb-rel-cell[data-mbid]'));
    const failing = cells.filter((td) => td.dataset.mbid === m);
    const others = cells.filter((td) => td.dataset.mbid !== m);
    return {
        othersDone: others.filter((td) => td.dataset.relDone === '1').length,
        othersTotal: others.length,
        failDone: failing.map((td) => td.dataset.relDone === '1'),
        failError: failing.map((td) => td.dataset.relError || null),
        failAnchors: failing.reduce((n, td) => n + td.querySelectorAll('a').length, 0),
    };
}, failMbid);

/** @param {import('@playwright/test').Page} page @returns {Promise<number>} */
const relInitRuns = (page) => page.evaluate(() => window.__saTest.relInitRuns());

test.describe('Relationships column: a failed WS/2 request is not "no relationships"', () => {
    let pageErrors;

    test.beforeEach(async ({ page }) => {
        pageErrors = collectPageErrors(page);
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('a 503 is marked failed and retried; nothing re-requests it on its own; re-expanding does',
        async ({ page }) => {
            // The floor here is the FEATURE's own rate gate, not slowness, so
            // the default 30 s budget is simply too small: Phase 2 walks 12
            // entities at ~1100 ms each (~13 s), the failing MBID adds three
            // 503 retries with widening backoff, and section 2 below sleeps
            // 1.5 s + 3 s + 3 s. That totals ~28 s on a good run, which is why
            // this timed out once inside a full-suite run (10.6 min, right
            // after a memory-pressure kill) while passing 3 of 3 standalone at
            // ~28 s each. Stating the budget beats letting a few percent of
            // machine load decide it — nothing here is waiting on a bug.
            test.setTimeout(90000);

            const ws2 = [];
            let failMbid = null;
            let failing = true;

            // Collapsed at render (threshold 2 < 12 entities), so the failing
            // MBID can be chosen from the DOM before a single request is made.
            // `sa_enable_relationships_column` must be re-enabled: loadPage.js'
            // FIXTURE_SETTINGS_OVERRIDE forces it off for every fixture spec.
            await loadUserscriptPage(page, {
                url: SERIES_URL,
                fixtureFile: SERIES_SHELL,
                testMode: true,
                settingsOverride: {
                    sa_enable_relationships_column: true,
                    sa_rel_collapse_threshold: 2,
                },
            });
            await page.route('**/ws/2/**', (route) => {
                const url = route.request().url();
                ws2.push(url);
                if (failing && failMbid && url.includes(failMbid)) return route.fulfill(FAIL_503);
                return route.fulfill({ status: 200, contentType: 'application/json', body: OK_BODY });
            });
            await page.route('https://musicbrainz.org/series/**',
                (route) => route.fulfill({ path: SERIES_SHELL, contentType: 'text/html' }));
            await page.click('button[data-label="Show all Releases for Series"]');
            await waitForRenderComplete(page, { waitForAutoResize: false });
            expect(ws2).toHaveLength(0);

            failMbid = await page.evaluate(
                () => document.querySelector('table.tbl tbody td.mb-rel-cell[data-mbid]').dataset.mbid);
            const failHits = () => ws2.filter((u) => u.includes(failMbid)).length;

            // ── 1. OUTCOME ────────────────────────────────────────────────────
            await page.click('thead .mb-rel-col-hdr-btn');
            // Settled = every other cell is done AND the failing cell has an
            // answer of either kind. Polled, not slept: Phase 2 is throttled.
            await expect.poll(async () => {
                const s = await readCells(page, failMbid);
                const failSettled = s.failDone.every(Boolean) || s.failError.every(Boolean);
                return s.othersDone === s.othersTotal && failSettled;
            }, { timeout: 90000 }).toBe(true);

            const settled = await readCells(page, failMbid);
            expect(settled.othersTotal).toBe(SERIES_ROWS - 1);
            expect(settled.failDone, 'a failed request must not be marked done').not.toContain(true);
            expect(settled.failError.every(Boolean), 'a failed cell carries data-rel-error').toBe(true);
            expect(settled.failError[0]).toContain('503');
            expect(settled.failAnchors).toBe(0);
            const hitsAfterSettle = failHits();
            expect(hitsAfterSettle, 'a 503 is retried before being called a failure').toBeGreaterThan(1);

            // ── 2. NO RETRY STORM ─────────────────────────────────────────────
            const runsBefore = await relInitRuns(page);
            await page.fill('#mb-global-filter-input', 'Born');
            await page.waitForTimeout(1500);
            await page.fill('#mb-global-filter-input', '');
            await page.waitForTimeout(3000);
            expect(await relInitRuns(page), 'a keystroke must not start a pass for a failed cell')
                .toBe(runsBefore);
            expect(failHits()).toBe(hitsAfterSettle);

            await page.evaluate(() => window.__saTest.relRunPass());
            await page.waitForTimeout(3000);                         // ≥ two throttled slots
            expect(failHits(), 'a pass that DOES run must not pick a failed cell up either')
                .toBe(hitsAfterSettle);

            // ── 3. NOT CACHED ─────────────────────────────────────────────────
            failing = false;
            await page.click('thead .mb-rel-col-hdr-btn');            // collapse
            await expect.poll(async () => (await readCells(page, failMbid)).othersDone,
                { timeout: 15000 }).toBe(0);
            const successfulRequests = ws2.length - failHits();

            await page.click('thead .mb-rel-col-hdr-btn');            // expand
            await expect.poll(async () => (await readCells(page, failMbid)).failAnchors,
                { timeout: 30000 }).toBe(1);

            const recovered = await readCells(page, failMbid);
            expect(recovered.failDone.every(Boolean)).toBe(true);
            expect(recovered.failError.every((e) => e === null), 'recovery clears the error').toBe(true);
            expect(recovered.othersDone).toBe(SERIES_ROWS - 1);
            expect(failHits(), 'exactly one new request for the previously failed MBID')
                .toBe(hitsAfterSettle + 1);
            expect(ws2.length - failHits(), 'successful answers were served from cache, not re-requested')
                .toBe(successfulRequests);
        });

    test('multi-table: the failure marker survives a re-render instead of turning back into a request',
        async ({ page }) => {
            const ws2 = [];
            let failMbid = null;

            // Threshold 3: the 6-entity sub-table starts collapsed and the
            // 1-entity one expanded, so exactly one MBID is fetched at render.
            // That first-requested MBID is the one made to fail.
            await loadUserscriptPage(page, {
                url: RG_URL,
                fixtureFile: RG_SHELL,
                testMode: true,
                settingsOverride: {
                    sa_enable_relationships_column: true,
                    sa_rel_collapse_threshold: 3,
                    // Per-row lookups are what this test counts; browse has its
                    // own spec, rel-column-browse-batch.spec.js.
                    sa_rel_browse_batch_enable: false,
                },
            });
            await page.route('**/ws/2/**', (route) => {
                const url = route.request().url();
                ws2.push(url);
                const m = url.match(/\/ws\/2\/[a-z-]+\/([0-9a-f-]{36})/);
                if (m && !failMbid) failMbid = m[1];
                if (m && m[1] === failMbid) return route.fulfill(FAIL_503);
                return route.fulfill({ status: 200, contentType: 'application/json', body: OK_BODY });
            });
            await page.route('https://musicbrainz.org/release-group/**',
                (route) => route.fulfill({ path: RG_SHELL, contentType: 'text/html' }));
            await page.click('button[data-label="Show all Releases for ReleaseGroup"]');
            await waitForRenderComplete(page, { waitForAutoResize: false });
            // releasegroup-releases renders its sub-sections COLLAPSED.
            await clickMasterToggleAndExpandAll(page);

            await expect.poll(async () => (await readCells(page, failMbid)).failError.every(Boolean)
                && (await readCells(page, failMbid)).failError.length === 1, { timeout: 30000 }).toBe(true);
            const failHits = () => ws2.filter((u) => u.includes(failMbid)).length;
            const hitsAfterSettle = failHits();

            // The re-render: a keystroke clones every group from
            // `groupedRows[i].rows`, and clearing clones them again.
            await page.fill('#mb-global-filter-input', 'Tunnel');
            await page.waitForTimeout(1500);
            await page.fill('#mb-global-filter-input', '');
            // Settle on the re-render itself rather than a fixed wait: under a
            // parallel full-suite run a 1500 ms wait was seen to sample the
            // still-filtered page (DEBUG-NOTES.md, 2026-09-15).
            await expect.poll(() => page.evaluate(
                () => document.querySelectorAll('table.tbl tbody td.mb-rel-cell').length), { timeout: 15000 })
                .toBe(RG_REL_CELLS);
            await page.waitForTimeout(3000);                         // room for a re-request to land

            const after = await readCells(page, failMbid);
            expect(after.failError, 'the re-rendered clone still carries the failure').toHaveLength(1);
            expect(after.failError[0]).toContain('503');
            expect(after.failDone).toEqual([false]);
            expect(failHits(), 'the re-render must not re-request the failure').toBe(hitsAfterSettle);
        });
});
