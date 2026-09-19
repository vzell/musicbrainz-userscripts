'use strict';

// The Release-events column's ONE WS/2 call, when it fails
// (org/503-handling.org F4).
//
// ── The defect ──────────────────────────────────────────────────────────────
//
// `initReleaseEventsColumn()` called `fetch()` directly rather than
// `_ws2GetJson()`, so it got neither the three attempts nor the
// transient/final classification every other WS/2 path in the script had. A
// failure ended in a debug line — gated behind a setting, so silent by
// default — and a `return`. The column then stayed empty with nothing to say
// why, and there was no retry short of reloading the page. It is one request
// for the whole page, which is exactly what made it so cheap to lose.
//
// ── What each test pins, and the adjacent property it avoids ────────────────
//
//  1. RECOVERY. A 503 is retried and the column populates. Asserted as a
//     REQUEST COUNT as well as populated cells: "the cells filled" would also
//     pass if the retry had never been needed.
//  2. THE FAILURE IS VISIBLE, and the cells are left alone. Not merely "a
//     control appeared" — the cells must still be unpopulated and un-`reDone`,
//     because a failure that marked them done would be the "a transport
//     failure is not an answer" defect this file exists to remove.
//  3. THE RETRY WORKS. Clicking the control re-requests and fills the column.
//  4. THE BOUNDARY. A 404 is not retried. Passes on unfixed code; it guards the
//     overshoot.
//  5. IT SURVIVES A RE-RENDER, AND IS STILL CLICKABLE. This is the one that
//     needs care: `renderGroupedTable()` rebuilds every `<thead>` from a
//     `cloneNode(true)`, which carries classes and attributes but NOT the click
//     listener. A control that merely LOOKS present after a filter keystroke
//     would be dead, so the test clicks it and asserts the column fills.
//  6. A CLEAN RUN ADDS NOTHING (control). Without it, every "no control"
//     assertion above would pass on a build that never creates one.
//
// Network-free: the single `**/ws/2/label/**` call is answered by page.route.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// The same label-relationships shell release-events-filter-after-populate.spec.js
// uses: its "distributed" group is a sub-table whose Release events cells
// genuinely populate.
const LABEL_URL = 'https://musicbrainz.org/label/011d1192-6f65-45bd-85c4-0400dd45693e/relationships';
const FIXTURE_FILE = path.join(__dirname, 'label-relationships-release-events.html');
const CONTROL = '.mb-re-col-hdr-btn';
// The control is ALSO painted while the lookup is in flight (⏳), and the
// retries take a few seconds. Waiting on the bare class therefore proceeds
// mid-retry and reports one request where three were coming — which is exactly
// what the first draft of this file did. Every failure assertion waits on the
// settled error state instead.
const FAILED = '.mb-re-col-hdr-btn[data-re-state="error"]';

/** Release MBIDs of the fixture's "distributed" group, in document order. */
function distributedReleaseMbids() {
    const html = fs.readFileSync(FIXTURE_FILE, 'utf8');
    const appearances = html.slice(html.indexOf('<h2>Appearances'));
    const out = [];
    let inGroup = false;
    for (const row of appearances.split(/(?=<tr)/)) {
        const subh = /class="subh"[^>]*>[\s\S]*?colspan="\d+">([^<]+)/.exec(row);
        if (subh) { inGroup = subh[1].trim() === 'distributed'; continue; }
        if (!inGroup) continue;
        const m = /href="\/release\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/.exec(row);
        if (m && !out.includes(m[1])) out.push(m[1]);
    }
    return out;
}

/** A WS/2 `inc=release-rels` answer giving every distributed release an event. */
const releaseRelsBody = (mbids) => JSON.stringify({
    relations: mbids.map((id, i) => ({
        'target-type': 'release',
        type: 'distributed',
        release: {
            id,
            'release-events': [{
                date: `19${80 + (i % 20)}-05-01`,
                area: { name: 'United States', 'iso-3166-1-codes': ['US'] },
            }],
        },
    })),
});

/** Cells the populate pass has actually finished, page-wide. */
const doneCells = (page) => page.evaluate(
    () => document.querySelectorAll('td.mb-re-cell[data-re-done="1"]').length);

/** Cells that exist but hold nothing yet. */
const emptyCells = (page) => page.evaluate(() => Array.from(
    document.querySelectorAll('td.mb-re-cell'))
    .filter((td) => td.textContent.trim() === '').length);

/**
 * Loads the shell and answers the single Release-events call through `respond`.
 *
 * `respond(callIndex)` returns `{status}` to fail, or anything falsy to answer
 * normally. Failures are `route.fulfill`, never `route.abort()` — an abort
 * makes fetch() throw, which `_ws2GetJson()` retries on its own terms, so an
 * aborting spec could not tell the status classification apart at all.
 *
 * @param {import('@playwright/test').Page} page
 * @param {?function(number): ?{status?: number}} respond
 * @returns {Promise<{calls: number[], setRespond: function(Function): void}>}
 */
async function loadReleaseEventsPage(page, respond) {
    const calls = [];
    const mbids = distributedReleaseMbids();
    expect(mbids.length, 'the fixture has a distributed-release group').toBeGreaterThan(5);
    // Boxed so a test can swap the behaviour mid-run (fail, then let the retry
    // succeed) without unrouting.
    const state = { respond };

    await loadUserscriptPage(page, {
        url: LABEL_URL,
        fixtureFile: FIXTURE_FILE,
        testMode: true,
        settingsOverride: {
            sa_enable_release_events_column: true,
            sa_enable_relationships_column: false,
        },
    });
    await page.route('https://musicbrainz.org/label/**',
        (route) => route.fulfill({ path: FIXTURE_FILE, contentType: 'text/html' }));
    await page.route('**/ws/2/label/**', (route) => {
        const i = calls.length;
        calls.push(Date.now());
        const r = (state.respond && state.respond(i)) || {};
        if (r.status && r.status !== 200) {
            return route.fulfill({ status: r.status, contentType: 'text/plain', body: 'Service Unavailable' });
        }
        return route.fulfill({
            status: 200, contentType: 'application/json', body: releaseRelsBody(mbids),
        });
    });

    await page.click('button[data-label="Show all Relationships for Label"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });

    const master = page.locator('.mb-master-toggle');
    if (await master.count() && (await master.getAttribute('data-state')) === 'collapsed') {
        await master.click();
    }
    return { calls, setRespond: (fn) => { state.respond = fn; } };
}

test.describe('Release events: a failed lookup is retried, then shown', () => {
    let pageErrors;

    test.beforeEach(({ page }) => {
        pageErrors = [];
        // MusicBrainz's OWN scripts throw on this captured shell, as
        // release-events-filter-after-populate.spec.js documents: a null node in
        // supported-browser-check.js, and a versioned bundle the capture
        // references now answering with an HTML error page. Excluded by FILE,
        // not by message text, so nothing of the userscript's is swallowed.
        const THIRD_PARTY = [/supported-browser-check/, /Unexpected token '<'/];
        page.on('pageerror', (e) => {
            const where = String(e.stack || e.message || '');
            if (!THIRD_PARTY.some((re) => re.test(where))) pageErrors.push(where);
        });
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('a clean run populates the column and adds no control (control)', async ({ page }) => {
        const { calls } = await loadReleaseEventsPage(page, null);

        await expect.poll(() => doneCells(page), { timeout: 20000 }).toBeGreaterThan(0);
        expect(calls, 'one request for the whole page').toHaveLength(1);
        await expect(page.locator(CONTROL)).toHaveCount(0);
    });

    test('a 503 is retried and the column still populates', async ({ page }) => {
        const { calls } = await loadReleaseEventsPage(page, (i) => (i === 0 ? { status: 503 } : null));

        await expect.poll(() => doneCells(page), { timeout: 30000 }).toBeGreaterThan(0);
        expect(calls, 'one 503, then the answer').toHaveLength(2);
        await expect(page.locator(CONTROL), 'a recovered lookup leaves no marker')
            .toHaveCount(0);
    });

    test('a permanent failure leaves the cells alone and says so in the header',
        async ({ page }) => {
            test.setTimeout(60000);
            const { calls } = await loadReleaseEventsPage(page, () => ({ status: 503 }));

            await expect(page.locator(FAILED).first()).toBeVisible({ timeout: 30000 });
            expect(calls, 'three attempts before giving up').toHaveLength(3);

            // Not "done": a transport failure is not an answer, so the cells
            // stay unpopulated and a later pass picks every one of them up.
            expect(await doneCells(page), 'no cell may be marked done').toBe(0);
            expect(await emptyCells(page), 'the cells are still there, still empty')
                .toBeGreaterThan(0);

            const btn = page.locator(FAILED).first();
            expect(await btn.getAttribute('title')).toContain('HTTP 503');
            expect(await btn.getAttribute('title')).toContain('Click to try again');
            expect(await btn.getAttribute('data-re-state')).toBe('error');

            // Generated content, never element text: this <th>'s textContent
            // feeds _cleanColHeaderText()'s fallback, _exportCleanHeaderText()
            // and the 📊 dropdown's column lookup. U+FE0E keeps it monochrome.
            expect(await btn.evaluate((el) => getComputedStyle(el, '::before').content))
                .toBe('"⚠︎"');
            expect(await btn.evaluate((el) => el.textContent)).toBe('');
        });

    test('clicking the control retries, and the column fills', async ({ page }) => {
        test.setTimeout(60000);
        const { calls, setRespond } = await loadReleaseEventsPage(page, () => ({ status: 503 }));

        await expect(page.locator(FAILED).first()).toBeVisible({ timeout: 30000 });
        const before = calls.length;
        expect(before).toBe(3);

        setRespond(null);                       // the archive comes back
        await page.locator(FAILED).first().click();

        await expect.poll(() => doneCells(page), { timeout: 30000 }).toBeGreaterThan(0);
        expect(calls.length, 'the click really re-requested').toBeGreaterThan(before);
        await expect(page.locator(CONTROL), 'success clears the marker').toHaveCount(0);
    });

    test('a 404 is final — the widened retry set must not swallow a 4xx', async ({ page }) => {
        // Passes on unfixed code too: this guards the overshoot, not the defect.
        test.setTimeout(60000);
        const { calls } = await loadReleaseEventsPage(page, () => ({ status: 404 }));

        await expect(page.locator(FAILED).first()).toBeVisible({ timeout: 30000 });
        expect(calls, 'asked once; a 404 answers the same way every time').toHaveLength(1);
        expect(await page.locator(FAILED).first().getAttribute('title')).toContain('HTTP 404');
    });

    test('the control survives a re-render AND is still wired', async ({ page }) => {
        // renderGroupedTable() rebuilds every <thead> from a cloneNode(true),
        // which carries classes and attributes but NOT the click listener. A
        // control that only LOOKS present would be dead, so this clicks it.
        test.setTimeout(60000);
        const { calls, setRespond } = await loadReleaseEventsPage(page, () => ({ status: 503 }));

        await expect(page.locator(FAILED).first()).toBeVisible({ timeout: 30000 });
        const before = calls.length;

        await page.fill('#mb-global-filter-input', 'e');
        await page.waitForTimeout(1200);
        await page.fill('#mb-global-filter-input', '');
        await page.waitForTimeout(1200);

        await expect(page.locator(FAILED).first(), 'still painted after the re-render')
            .toBeVisible();
        expect(calls.length, 'a keystroke must not re-request on its own').toBe(before);

        setRespond(null);
        await page.locator(FAILED).first().click();
        await expect.poll(() => doneCells(page), { timeout: 30000 }).toBeGreaterThan(0);
        expect(calls.length, 'the post-re-render control is still clickable')
            .toBeGreaterThan(before);
    });
});
