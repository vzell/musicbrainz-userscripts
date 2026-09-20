'use strict';

// One automatic follow-up pass for failed Relationships cells
// (org/503-handling.org item 7) — and the four ceilings that keep it from
// becoming the "automatic retry loop with no ceiling" that file explicitly
// refuses to propose.
//
// This is the only change in that file that makes the script talk to the
// network without the user asking, so the tests are mostly about when it
// DOESN'T run.
//
// ── What each test pins, and the adjacent property it avoids ────────────────
//
//  1. IT RECOVERS. A burst that has passed by the time the pass fires turns ⚠
//     cells into icons, and asks about the failed entities ONLY. Asserted as a
//     request count against the failure count, because "the icons appeared"
//     would also pass if it had re-requested the whole table.
//  2. THE BREAKER TRIPS. With the Web Service still refusing, the pass gives up
//     after 5 refusals in a row instead of walking the whole failed set. The
//     assertion is on the REQUEST COUNT, not on the tripped flag: a breaker
//     that sets its flag but keeps issuing requests would satisfy the flag.
//  3. A TRIPPED BREAKER SCHEDULES NOTHING FURTHER. Otherwise the ceiling on
//     passes is the only thing left and an outage still costs two walks.
//  4. AN OUTAGE-SIZED FAILURE SET IS NEVER STARTED. More than 25 failures is
//     not a burst; retrying it automatically is the hammering the org warns
//     about. Asserted as "no pass was scheduled at all", so the ceiling cannot
//     be satisfied by starting and aborting.
//  5. THE BUDGET IS SPENT. At most two passes per page, ever.
//
// Network-free: every `**/ws/2/**` request is intercepted and counted, the
// shape `rel-column-collapse-toggle.spec.js` established. Failures are always
// `route.fulfill({status})`, never `route.abort()`.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { collectPageErrors } = require('../support/liveAssertions');

// "Bruce Springsteen Studio Collection" — 12 releases, `tableMode: 'single'`.
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

/**
 * Loads the series shell with the column expanded, failing the first
 * `failFirstN` DISTINCT entities the Web Service is asked about.
 *
 * **Chosen in the route on first sight, with no second page load.** An earlier
 * version loaded the page once to read the MBIDs, picked its victims, then
 * reloaded — and the first load answered three entities before the reload,
 * which went into the `rel-ws2` IndexedDB store. IDB survives a reload, so on
 * the second pass those three were served from cache, never reached the route,
 * and never failed. The test then reported 9 failures where it expected 10 and
 * looked like a breaker bug.
 *
 * `sa_rels_idb_enable: false` belt-and-braces on top: nothing here is about
 * persistence, and a cache that outlives a page load has no business in a test
 * about what gets REQUESTED.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{failFirstN?: number, settings?: Object}} [opts]
 * @returns {Promise<{ws2: string[], failing: Set<string>, heal: function(): void}>}
 */
async function loadExpandedRelPage(page, opts) {
    const { failFirstN = 0, settings } = opts || {};
    const ws2 = [];
    const failing = new Set();
    const state = { healed: false };

    await loadUserscriptPage(page, {
        url: SERIES_URL,
        fixtureFile: SERIES_SHELL,
        testMode: true,
        settingsOverride: {
            sa_enable_relationships_column: true,
            sa_rel_browse_batch_enable: false,
            sa_rel_collapse_threshold: 0,
            sa_rels_idb_enable: false,
            ...(settings || {}),
        },
    });
    await page.route('**/ws/2/**', (route) => {
        const url = route.request().url();
        ws2.push(url);
        const m = url.match(/\/ws\/2\/[a-z-]+\/([0-9a-f-]{36})/);
        const mbid = m && m[1];
        const shouldFail = !state.healed && mbid
            && (failing.has(mbid) || failing.size < failFirstN);
        if (shouldFail) {
            failing.add(mbid);
            return route.fulfill({ status: 503, contentType: 'text/plain', body: 'Service Unavailable' });
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: OK_BODY });
    });
    await page.route('https://musicbrainz.org/series/**',
        (route) => route.fulfill({ path: SERIES_SHELL, contentType: 'text/html' }));
    await page.click('button[data-label="Show all Releases for Series"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
    return { ws2, failing, heal: () => { state.healed = true; } };
}

const rowMbids = (page) => page.evaluate(() => Array.from(
    document.querySelectorAll('table.tbl tbody td.mb-rel-cell[data-mbid]')).map((td) => td.dataset.mbid));

const shape = (page) => page.evaluate(() => {
    const cells = Array.from(document.querySelectorAll('table.tbl tbody td.mb-rel-cell[data-mbid]'));
    return {
        done: cells.filter((td) => td.dataset.relDone === '1').length,
        failed: cells.filter((td) => td.dataset.relError && td.dataset.relDone !== '1').length,
    };
});

const settle = (page, timeout = 120000) => expect
    .poll(async () => { const s = await shape(page); return s.done + s.failed; }, { timeout })
    .toBe(SERIES_ROWS);

/**
 * Waits until the request log stops growing.
 *
 * A fixed `waitForTimeout()` after the breaker trips bounds the count by the
 * WAIT rather than by the pass: at ~1.1 s per request a 4 s pause admits about
 * four more, so an unguarded pass that would have spent thirty looks identical
 * to an aborted one. Mutation-testing caught exactly that.
 *
 * @param {string[]} ws2
 * @param {number} [stableFor]
 * @returns {Promise<void>}
 */
async function settleRequests(ws2, stableFor = 12) {
    let last = -1;
    let same = 0;
    for (let i = 0; i < 700; i++) {
        const now = ws2.length;
        same = (now === last) ? same + 1 : 0;
        last = now;
        if (same >= stableFor) return;
        await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`requests never settled (last ${last})`);
}

const autoState = (page) => page.evaluate(() => window.__saTest.relAutoRetryState());
/** Drives the REAL decision path, then fires its timer — every ceiling applies. */
const runAuto = (page) => page.evaluate(() => window.__saTest.relRunAutoRetryNow());
const failedCount = (page) => page.evaluate(() => window.__saTest.relFailedMbids().length);

test.describe('Relationships: the automatic follow-up pass, and its ceilings',
    { tag: '@slow' }, () => {
    let pageErrors;

    test.beforeEach(async ({ page }) => {
        pageErrors = collectPageErrors(page);
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('a burst that has passed is recovered, asking only about what failed',
        async ({ page }) => {
            test.setTimeout(180000);
            const { ws2, failing, heal } = await loadExpandedRelPage(page, { failFirstN: 3 });
            await settle(page);
            expect(failing.size, 'three entities refused').toBe(3);
            expect(await failedCount(page)).toBe(3);

            // A pass is waiting; nothing has been asked again yet.
            await expect.poll(() => autoState(page).then((s) => s.pending), { timeout: 30000 })
                .toBe(true);

            heal();                                  // the burst passes
            const before = ws2.length;
            expect(await runAuto(page), 'a pass was scheduled').toBe(true);

            await expect.poll(async () => (await shape(page)).done, { timeout: 90000 })
                .toBe(SERIES_ROWS);
            expect(ws2.length - before, 'one request per failed entity, and no more').toBe(3);
            expect((await autoState(page)).passes).toBe(1);
        });

    test('the breaker gives up after 5 refusals in a row', async ({ page }) => {
        test.setTimeout(180000);
        // Ten refusals: under the 25 ceiling so a pass is allowed, and well over
        // the 5 the breaker stops at, so the abort is what limits it.
        const { ws2, failing } = await loadExpandedRelPage(page, { failFirstN: 10 });
        await settle(page);
        expect(failing.size).toBe(10);
        expect(await failedCount(page), 'every one of them failed').toBe(10);

        const before = ws2.length;
        expect(await runAuto(page), 'a pass was scheduled').toBe(true);
        await expect.poll(() => autoState(page).then((s) => s.tripped), { timeout: 90000 })
            .toBe(true);
        // Settled, not slept: the count has to be the WHOLE pass, or the bound
        // below is a statement about the wait instead of about the breaker.
        await settleRequests(ws2);

        // THE assertion: the count, not the flag. A breaker that sets its flag
        // and keeps requesting would satisfy the flag. Each retried entity
        // costs _REL_WS2_TRIES attempts, so ten unguarded would be thirty.
        const spent = ws2.length - before;
        expect(spent, 'the pass aborted instead of walking every failure')
            .toBeLessThan(10 * 3);
        expect(spent, 'and it did ask about something before giving up').toBeGreaterThan(0);
    });

    test('a tripped breaker schedules nothing further', async ({ page }) => {
        test.setTimeout(180000);
        const { ws2 } = await loadExpandedRelPage(page, { failFirstN: 10 });
        await settle(page);

        await runAuto(page);
        await expect.poll(() => autoState(page).then((s) => s.tripped), { timeout: 90000 })
            .toBe(true);

        const before = ws2.length;
        expect(await runAuto(page), 'no second pass once the breaker has tripped').toBe(false);
        await page.waitForTimeout(3000);
        expect(ws2.length, 'and nothing was requested').toBe(before);
    });

    test('an outage-sized failure set is never started', async ({ page }) => {
        // More than the ceiling is an outage, not a burst. The assertion is
        // that NOTHING was scheduled: a ceiling satisfied by starting and then
        // aborting would still have issued requests.
        //
        // The ceiling is SEEDED to 5 rather than faked — `sa_rel_auto_retry_max_failed`
        // is a real setting. The fixture has 12 entities, so 12 > 5 exercises
        // the rule without a 26-row fixture, and the rule is "more than the
        // ceiling", not the number 25.
        test.setTimeout(180000);
        const { ws2, failing } = await loadExpandedRelPage(page,
            { failFirstN: SERIES_ROWS, settings: { sa_rel_auto_retry_max_failed: 5 } });
        await settle(page);
        expect(failing.size, 'more than the seeded ceiling').toBeGreaterThan(5);
        expect(await failedCount(page)).toBe(failing.size);

        const before = ws2.length;
        expect(await runAuto(page), 'an outage-sized set is not retried automatically')
            .toBe(false);
        expect((await autoState(page)).passes, 'no pass was spent either').toBe(0);
        await page.waitForTimeout(3000);
        expect(ws2.length, 'and nothing was requested').toBe(before);
    });

    test('a ceiling of 0 disables it, and is not read as "use the default"',
        async ({ page }) => {
            // The falsy-zero defect CLAUDE.md records for sa_render_threshold,
            // whose own description promises "0 to disable" and does not.
            test.setTimeout(180000);
            await loadExpandedRelPage(page,
                { failFirstN: 1, settings: { sa_rel_auto_retry_max_failed: 0 } });
            await settle(page);
            expect(await failedCount(page), 'one failure, far under the default 25').toBe(1);

            expect(await runAuto(page), '0 means off, not 25').toBe(false);
        });

    test('the setting turns it off entirely', async ({ page }) => {
        // The only change in org/503-handling.org that makes the script fetch
        // unprompted, so its kill switch is worth an assertion of its own.
        test.setTimeout(180000);
        const { ws2 } = await loadExpandedRelPage(page,
            { failFirstN: 2, settings: { sa_rel_auto_retry_failed: false } });
        await settle(page);
        expect(await failedCount(page)).toBe(2);

        const before = ws2.length;
        expect(await runAuto(page), 'nothing is scheduled when the setting is off').toBe(false);
        expect((await autoState(page)).passes).toBe(0);
        await page.waitForTimeout(3000);
        expect(ws2.length, 'and nothing was requested').toBe(before);
    });

    test('the budget is two passes per page', async ({ page }) => {
        // One failure, kept failing: each pass costs one entity, so the breaker
        // never trips and the budget is the only thing that can stop it.
        test.setTimeout(180000);
        await loadExpandedRelPage(page, { failFirstN: 1 });
        await settle(page);
        expect(await failedCount(page)).toBe(1);

        expect(await runAuto(page), 'pass 1').toBe(true);
        await expect.poll(() => failedCount(page), { timeout: 60000 }).toBe(1);
        expect(await runAuto(page), 'pass 2').toBe(true);
        await expect.poll(() => failedCount(page), { timeout: 60000 }).toBe(1);

        expect((await autoState(page)).passes).toBe(2);
        expect(await runAuto(page), 'the budget is spent').toBe(false);
    });
});
