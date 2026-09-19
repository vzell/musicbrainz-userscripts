'use strict';

// Retrying a Relationships table recovers the FAILURES without re-requesting
// everything (org/503-handling.org F7 / item 8, zone 4 of its retry design).
//
// ── The defect ──────────────────────────────────────────────────────────────
//
// `_relRetryTable()` collects every `td.mb-rel-cell[data-mbid]` in the table and
// evicts and re-requests all of them, successes included. On a 2000-row table
// with three failures that is 2000 requests at one per 1.1 s — about forty
// minutes to repair three seconds of trouble. The per-cell ⟳ was the only way
// to recover one failure without paying for the whole table.
//
// ── What each test pins, and the adjacent property it avoids ────────────────
//
//  1. THE COST. The measurement here is a REQUEST COUNT, and it is asserted as
//     an exact number against the failure count — not "fewer than before",
//     which a broken filter could also satisfy by requesting nothing at all.
//     The companion assertion is that the icons already loaded are still there:
//     retrying nothing would pass a count test and lose the data.
//  2. THE OLD BUTTON IS UNCHANGED. `_relRetryTable()` still reloads everything.
//     "Force a refetch of a table I believe is stale" is a different intent from
//     "recover the failures", and collapsing them would quietly remove the
//     first. Pinned by its own test, so a future simplification has to fail it.
//  3. IT DOES NOT VANISH UNDER A FILTER. `runFilter()` REMOVES non-matching
//     rows, so a count taken from the live tbody drops to zero exactly when a
//     filter excludes the rows that failed — the identical bug CLAUDE.md
//     records for `_updateLengthMismatchButtons()`. The count therefore reads
//     the captured SOURCE rows, and this test hides EVERY row and asserts the
//     control is still there with its number intact.
//
//     An earlier draft kept the control present but DIMMED at zero instead,
//     believing that answered the trap. It did not: a filter still dimmed it
//     into uselessness, which is the same defect wearing a different hat. That
//     is why the assertion below is on the COUNT surviving, not on presence.
//  4. ABSENT WHEN NOTHING FAILED. Safe only because of 3 — with a filter-proof
//     count, "nothing failed" really does mean nothing failed.
//
// Network-free: every `**/ws/2/**` request is intercepted and counted, the
// shape `rel-column-collapse-toggle.spec.js` established.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { collectPageErrors } = require('../support/liveAssertions');

// "Bruce Springsteen Studio Collection" — 12 releases, 12 distinct MBIDs, one
// table (`tableMode: 'single'`), so the page-wide and per-table scopes coincide
// and the arithmetic below is easy to read.
const SERIES_URL = 'https://musicbrainz.org/series/aa3694d3-a3d0-48ed-8f07-5b576de87908';
const SERIES_SHELL = path.join(__dirname, '..', 'snapshots', 'series-releases', 'raw.html');
const SERIES_ROWS = 12;

const OK_BODY = JSON.stringify({
    relations: [{
        'target-type': 'url',
        type: 'discogs',
        url: { resource: 'https://www.discogs.com/release/1' },
    }],
});

const RETRY_ALL = '#mb-rel-retry-0';
const RETRY_FAILED = '#mb-rel-retry-failed';

/**
 * Loads the series shell with the Relationships column ON and EXPANDED, failing
 * whichever MBIDs `failing` holds.
 *
 * Expanded (threshold 0 = never collapse) because the subject is what a retry
 * costs once a table has loaded, so the table has to load first.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Set<string>} failing  Mutable: a test empties it to let a retry succeed.
 * @returns {Promise<string[]>} The live list of intercepted WS/2 URLs.
 */
async function loadExpandedRelPage(page, failing) {
    const ws2 = [];
    await loadUserscriptPage(page, {
        url: SERIES_URL,
        fixtureFile: SERIES_SHELL,
        testMode: true,
        settingsOverride: {
            sa_enable_relationships_column: true,
            sa_rel_browse_batch_enable: false,
            sa_rel_collapse_threshold: 0,
        },
    });
    await page.route('**/ws/2/**', (route) => {
        const url = route.request().url();
        ws2.push(url);
        if ([...failing].some((m) => url.includes(m))) {
            return route.fulfill({ status: 503, contentType: 'text/plain', body: 'Service Unavailable' });
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: OK_BODY });
    });
    await page.route('https://musicbrainz.org/series/**',
        (route) => route.fulfill({ path: SERIES_SHELL, contentType: 'text/html' }));
    await page.click('button[data-label="Show all Releases for Series"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
    return ws2;
}

/** @returns {Promise<string[]>} Rel-cell MBIDs in document order. */
const rowMbids = (page) => page.evaluate(() => Array.from(
    document.querySelectorAll('table.tbl tbody td.mb-rel-cell[data-mbid]')).map((td) => td.dataset.mbid));

/** @returns {Promise<{done: number, failed: number, anchors: number}>} */
const shape = (page) => page.evaluate(() => {
    const cells = Array.from(document.querySelectorAll('table.tbl tbody td.mb-rel-cell[data-mbid]'));
    return {
        done: cells.filter((td) => td.dataset.relDone === '1').length,
        failed: cells.filter((td) => td.dataset.relError && td.dataset.relDone !== '1').length,
        anchors: cells.reduce((n, td) => n + td.querySelectorAll('a').length, 0),
    };
});

/** Waits until every cell has settled one way or the other. */
const settle = (page, timeout = 90000) => expect
    .poll(async () => { const s = await shape(page); return s.done + s.failed; }, { timeout })
    .toBe(SERIES_ROWS);

const hits = (ws2, mbid) => ws2.filter((u) => u.includes(mbid)).length;

test.describe('Relationships: retrying recovers the failures, not the whole table', () => {
    let pageErrors;

    test.beforeEach(async ({ page }) => {
        pageErrors = collectPageErrors(page);
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('⚠⟳ requests exactly the failed entities, and keeps the icons already loaded',
        async ({ page }) => {
            test.setTimeout(180000);
            const failing = new Set();
            const ws2 = await loadExpandedRelPage(page, failing);
            const mbids = await rowMbids(page);
            expect(mbids).toHaveLength(SERIES_ROWS);

            // Chosen from the DOM before anything is requested, so the route can
            // fail exactly these three and nothing else.
            [mbids[2], mbids[5], mbids[9]].forEach((m) => failing.add(m));
            await page.reload();
            const ws2b = await loadExpandedRelPage(page, failing);
            await settle(page);

            const settled = await shape(page);
            expect(settled.failed, 'three cells failed').toBe(3);
            expect(settled.done, 'the other nine loaded').toBe(SERIES_ROWS - 3);

            failing.clear();                         // the Web Service recovers
            const before = ws2b.length;
            await page.locator(RETRY_FAILED).click();
            await expect.poll(async () => (await shape(page)).done, { timeout: 90000 })
                .toBe(SERIES_ROWS);

            // THE measurement: three requests, not twelve.
            expect(ws2b.length - before, 'one request per failed entity, and no more').toBe(3);
            for (const m of [mbids[2], mbids[5], mbids[9]]) {
                expect(hits(ws2b, m), `the failed entity ${m} was re-asked`).toBeGreaterThan(3);
            }
            // Retrying nothing at all would also satisfy a count assertion.
            expect((await shape(page)).anchors, 'every row ends with its icon').toBe(SERIES_ROWS);
        });

    test('🔗⟳ still reloads EVERYTHING — the two intents stay separate',
        async ({ page }) => {
            test.setTimeout(180000);
            const failing = new Set();
            const ws2 = await loadExpandedRelPage(page, failing);
            await settle(page);
            expect((await shape(page)).done).toBe(SERIES_ROWS);

            const before = ws2.length;
            await page.locator(RETRY_ALL).click();
            await expect.poll(() => ws2.length - before, { timeout: 90000 }).toBe(SERIES_ROWS);
            expect(ws2.length - before, 'a stale-table refetch asks about every row')
                .toBe(SERIES_ROWS);
        });

    test('⚠⟳ is absent when nothing failed, and appears only when something does',
        async ({ page }) => {
            test.setTimeout(180000);
            const failing = new Set();
            await loadExpandedRelPage(page, failing);
            await settle(page);
            expect((await shape(page)).done).toBe(SERIES_ROWS);

            // The control adds nothing to a page that never failed — which is
            // also what keeps it out of the committed rendered.html baselines.
            await expect(page.locator(RETRY_FAILED)).toHaveCount(0);
            await expect(page.locator(RETRY_ALL), 'the reload-everything button is unconditional')
                .toHaveCount(1);
        });

    test('a failure hidden by a filter is not stranded — it recovers when it returns',
        async ({ page }) => {
            // What IS guaranteed, and what is not.
            //
            // `_relFailedMbidsPageWide()` reads the captured SOURCE rows, so the
            // failed set — and the button's count — include rows a filter has
            // removed. That much is asserted directly, through __saTest.
            //
            // The FETCH cannot reach them while they are out of the DOM:
            // `initRelationshipsColumn()`'s candidate scan is live-DOM-based, so
            // an absent row is not a candidate. What `_relRetryMbids()` does for
            // it is clear its master cell's `data-rel-error`, which is the part
            // that used to be missing: the marker stayed, and the impl's scan and
            // `_relQueueStillWants()` both treat a failed cell as "leave alone",
            // so the row was stranded FOREVER. Now it is merely pending, and the
            // next pass over a table that contains it picks it up.
            test.setTimeout(180000);
            const failing = new Set();
            await loadExpandedRelPage(page, failing);
            const mbids = await rowMbids(page);
            const [hidden, shown] = [mbids[2], mbids[5]];
            failing.add(hidden);
            failing.add(shown);

            await page.reload();
            const ws2 = await loadExpandedRelPage(page, failing);
            await settle(page);
            expect((await shape(page)).failed, 'two cells failed').toBe(2);
            await expect(page.locator(RETRY_FAILED)).toHaveText('⚠⟳ 2');

            // Narrow to the OTHER failed row, so `hidden` is not in the DOM at
            // all. The needle is checked to match exactly one row — one matching
            // both, or neither, would make everything below meaningless.
            const needleFor = (m) => page.evaluate((mbid) => {
                const td = document.querySelector(`table.tbl tbody td.mb-rel-cell[data-mbid="${mbid}"]`);
                // Every cell, not `cells[0]`: that one holds the row ORDINAL on
                // this pageType ("1".."12"), which has no word in it at all.
                const words = (td.parentElement.textContent || '')
                    .split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 4);
                const rows = Array.from(document.querySelectorAll('table.tbl tbody tr'));
                return words.find((w) => rows.filter(
                    (r) => r.textContent.toLowerCase().includes(w.toLowerCase())).length === 1) || '';
            }, m);
            const needle = await needleFor(shown);
            const needleHidden = await needleFor(hidden);
            expect(needle, 'a word matching exactly the shown row').not.toBe('');
            expect(needleHidden, 'a word matching exactly the hidden row').not.toBe('');

            await page.fill('#mb-global-filter-input', needle);
            await expect.poll(async () => (await rowMbids(page)).length, { timeout: 30000 }).toBe(1);
            expect(await rowMbids(page), 'the hidden one is gone from the DOM').not.toContain(hidden);

            // THE assertion the source-row scan exists for: the set still knows
            // about the row that is no longer on the page.
            expect(await page.evaluate(() => window.__saTest.relFailedMbids()),
                'the failed set survives a filter').toEqual([hidden, shown].sort());

            failing.clear();
            const before = ws2.length;
            const hiddenBefore = hits(ws2, hidden);
            await page.locator(RETRY_FAILED).click();
            await expect.poll(() => hits(ws2, shown) > 3, { timeout: 90000 }).toBe(true);

            // Un-marked, not re-fetched: it has no live cell to fetch into.
            await expect.poll(
                async () => (await page.evaluate(() => window.__saTest.relFailedMbids())).length,
                { timeout: 30000 }).toBe(0);
            expect(hits(ws2, hidden), 'nothing was requested for the absent row').toBe(hiddenBefore);

            // Back in view, it is pending rather than failed, so it loads.
            //
            // The filter is SWAPPED to the hidden row rather than cleared. An
            // earlier version emptied the input and polled for all 12 rows; that
            // is unreliable, because the global filter carries a 🔍 focus prefix
            // and `fill('')` fights it — it failed under full-suite load while
            // passing standalone, which is the worst way for a test to be wrong.
            // Swapping needles uses the same mechanism as the first fill, which
            // has never been flaky here.
            await page.fill('#mb-global-filter-input', needleHidden);
            await expect.poll(async () => (await rowMbids(page)).includes(hidden),
                { timeout: 60000 }).toBe(true);
            await expect.poll(async () => (await shape(page)).done, { timeout: 90000 })
                .toBe(1);
            expect(hits(ws2, hidden) - hiddenBefore,
                'the once-hidden failure was asked about exactly once, on its return').toBe(1);
            expect(ws2.length - before, 'two recoveries in all, and no third request').toBe(2);
        });
});
