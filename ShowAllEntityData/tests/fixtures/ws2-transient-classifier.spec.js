'use strict';

// `_ws2GetJson()`'s retry policy: WHICH failures are worth another attempt,
// and HOW LONG to wait when the server says so (org/503-handling.org F6).
//
// ── The defect ──────────────────────────────────────────────────────────────
//
// The shared retry engine tested exactly one status — `if (resp.status !== 503)
// break;` — so a 502 or 504 (what MusicBrainz's reverse proxy returns while a
// deploy rolls) and a 429 (the rate limiter) each ended the request on the
// FIRST attempt and were reported to the user as final. And nothing in the
// script read a response header at all, so a `Retry-After` was ignored even
// where the server had said precisely how long to wait.
//
// ── What each test pins, and the adjacent property it avoids ────────────────
//
//  1. RETRIED, PER STATUS. One test per widened status, not one loop, so a
//     mutation that drops a single member of `_TRANSIENT_HTTP_STATUSES` is
//     attributable to it by name. Each asserts the REQUEST COUNT as well as the
//     recovery: "the cell ended up with an icon" would also pass if the retry
//     count were wrong, and "it was retried" would pass if it were retried
//     forever.
//  2. THE BOUNDARY. `a 400 is final` is a counter-guard and is the one test
//     here that PASSES on unfixed code — deliberately. Widening a retry set is
//     the kind of change that overshoots, and without this nothing would notice
//     a set that swallowed every 4xx. Its mutation is the overshoot, not the
//     defect.
//  3. THE FLOOR, BEHAVIOURALLY. `Retry-After: 3` must push the second attempt
//     out to ~3 s, where the backoff alone would have fired at ~1.1 s. Measured
//     from the intercepted requests' own timestamps, because the wait is the
//     whole guarantee and has no DOM surface.
//  4. THE CAP AND THE PARSER, THROUGH `__saTest`. `_RETRY_AFTER_MAX_MS` cannot
//     be asserted behaviourally without a test that genuinely waits half a
//     minute, and the statuses this script never meets (408, 410) have no
//     behavioural surface at all. Only those go through the pure helpers; the
//     floor above stays in the real pipeline.
//  5. ALL THREE CALL SITES. The point of a SHARED classifier is that it serves
//     more than one caller, and `beforeRetry` — where the `Retry-After` floor is
//     actually applied — is written out separately at each of the three:
//     `_relFetchWs2()`, `_msFetchOneBatch()` and `_relBrowseFetchPage()`. Each
//     gets its own test, because any one of them passing alone would leave a
//     wired-up-in-one-place fix looking complete.
//
// Network-free: every `**/ws/2/**` request is intercepted and counted, the
// shape `rel-column-collapse-toggle.spec.js` established. Failures are always
// `route.fulfill({status})`, NEVER `route.abort()` — an abort lands in
// `_ws2GetJson()`'s catch arm, which was already retried before this change, so
// an aborting spec would pass on unfixed code.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { clickMasterToggleAndExpandAll, collectPageErrors } = require('../support/liveAssertions');

// "Bruce Springsteen Studio Collection" — 12 releases, `tableMode: 'single'`.
const SERIES = {
    url: 'https://musicbrainz.org/series/aa3694d3-a3d0-48ed-8f07-5b576de87908',
    shell: path.join(__dirname, '..', 'snapshots', 'series-releases', 'raw.html'),
    showAllLabel: 'Show all Releases for Series',
    urlGlob: 'https://musicbrainz.org/series/**',
};

// 130 recordings → two `rid:` batches of 100 and 30. See the sibling
// artist-recordings-ms-batch.spec.js for the fixture's shape.
const MS_BATCH = {
    url: 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/recordings',
    shell: path.join(__dirname, 'artist-recordings-ms-batch.html'),
    showAllLabel: '⊚ All recordings',
    rows: 130,
};

/** One url-rel per entity, so exactly one icon per successful cell. */
const OK_BODY = JSON.stringify({
    relations: [{
        'target-type': 'url',
        type: 'discogs',
        url: { resource: 'https://www.discogs.com/release/1' },
    }],
});

/**
 * Loads the series shell with the Relationships column enabled and COLLAPSED,
 * and routes every WS/2 request through `respond`.
 *
 * Collapsed is what makes this cheap: a click loads exactly ONE row
 * (`_relLoadRow()`), so a test costs one entity's requests instead of the
 * twelve the expanded column would trickle out at 1100 ms apiece. The
 * click-to-load path goes through `_relFetchWs2()` → `_ws2GetJson()`, i.e.
 * through the code under test.
 *
 * `respond(url)` may return `{status, headers, body}`; anything falsy answers
 * 200 with `OK_BODY`. `headers` exists for `Retry-After` and is why this does
 * not just reuse rel-cell-state-glyphs.spec.js' loader.
 *
 * @param {import('@playwright/test').Page} page
 * @param {?function(string): ?{status?: number, headers?: Object<string, string>, body?: string}} respond
 * @returns {Promise<Array<{url: string, at: number}>>} The live request log.
 */
async function loadCollapsedRelPage(page, respond) {
    const ws2 = [];
    await loadUserscriptPage(page, {
        url: SERIES.url,
        fixtureFile: SERIES.shell,
        testMode: true,
        settingsOverride: {
            // loadPage.js' FIXTURE_SETTINGS_OVERRIDE forces this off for every
            // fixture spec, so the whole subject would otherwise be absent.
            sa_enable_relationships_column: true,
            // Below 12, so the column renders collapsed and nothing is
            // requested until a cell is clicked.
            sa_rel_collapse_threshold: 2,
            // Browse bulk source off: these are per-entity lookup guarantees.
            sa_rel_browse_batch_enable: false,
        },
    });
    await page.route('**/ws/2/**', async (route) => {
        const url = route.request().url();
        ws2.push({ url, at: Date.now() });
        const r = (respond && respond(url)) || {};
        try {
            if (r.status && r.status !== 200) {
                await route.fulfill({
                    status: r.status,
                    headers: { 'content-type': 'text/plain', ...(r.headers || {}) },
                    body: r.body || 'Service Unavailable',
                });
            } else {
                await route.fulfill({
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                    body: r.body || OK_BODY,
                });
            }
        } catch (_) {
            // The page can already be closed when a late answer lands.
        }
    });
    await page.route(SERIES.urlGlob, (route) => route.fulfill({ path: SERIES.shell, contentType: 'text/html' }));
    await page.click(`button[data-label="${SERIES.showAllLabel}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
    expect(ws2, 'a collapsed column requests nothing at render').toHaveLength(0);
    return ws2;
}

/** @returns {Promise<string[]>} Rel-cell MBIDs in document order. */
const rowMbids = (page) => page.evaluate(() => Array.from(
    document.querySelectorAll('table.tbl tbody td.mb-rel-cell[data-mbid]')).map((td) => td.dataset.mbid));

/** @returns {Promise<?{anchors: number, done: boolean, error: ?string}>} */
const cellState = (page, mbid) => page.evaluate((m) => {
    const td = document.querySelector(`table.tbl tbody td.mb-rel-cell[data-mbid="${m}"]`);
    if (!td) return null;
    return {
        anchors: td.querySelectorAll('a').length,
        done: td.dataset.relDone === '1',
        error: td.dataset.relError || null,
    };
}, mbid);

/**
 * Clicks a cell at its right edge — the empty area where the hover ⟳ sits — so
 * a click on an already-loaded cell cannot land on one of its icon links.
 * Lifted verbatim from rel-cell-state-glyphs.spec.js.
 */
async function clickCellEdge(page, mbid) {
    const loc = page.locator(`table.tbl tbody td.mb-rel-cell[data-mbid="${mbid}"]`);
    const box = await loc.boundingBox();
    await loc.click({ position: { x: Math.max(1, box.width - 3), y: Math.floor(box.height / 2) } });
}

/** @returns {Array<{url: string, at: number}>} entries for one MBID. */
const hitsFor = (ws2, mbid) => ws2.filter((h) => h.url.includes(mbid));

/**
 * Drives one row through "fails `failTimes` times with `status`, then succeeds"
 * and returns that row's request log.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{status: number, failTimes: number, headers?: Object<string, string>}} opts
 * @returns {Promise<{ws2: Array<{url: string, at: number}>, target: string,
 *                    state: {anchors: number, done: boolean, error: ?string}}>}
 */
async function recoverOneRow(page, { status, failTimes, headers }) {
    let target = null;
    let seen = 0;
    const ws2 = await loadCollapsedRelPage(page, (url) => {
        if (!target || !url.includes(target)) return null;
        seen += 1;
        return seen <= failTimes ? { status, headers } : null;
    });
    const mbids = await rowMbids(page);
    expect(mbids.length, 'the fixture must render rel cells at all').toBeGreaterThan(3);
    target = mbids[3];

    await clickCellEdge(page, target);
    await expect.poll(async () => (await cellState(page, target)).anchors, { timeout: 45000 }).toBe(1);
    return { ws2, target, state: await cellState(page, target) };
}

test.describe('_ws2GetJson(): which failures are retried', () => {
    let pageErrors;

    test.beforeEach(async ({ page }) => {
        pageErrors = collectPageErrors(page);
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('a 502 is retried before being called a failure', async ({ page }) => {
        // Two failures then an answer, i.e. all three attempts used — which
        // also pins `_REL_WS2_TRIES` being honoured for a NEWLY transient
        // status, not just for 503.
        const { ws2, target, state } = await recoverOneRow(page, { status: 502, failTimes: 2 });

        expect(hitsFor(ws2, target), 'three attempts: 502, 502, then the answer').toHaveLength(3);
        expect(state.done, 'a recovered cell is done').toBe(true);
        expect(state.error, 'a recovered cell carries no failure marker').toBeNull();
        expect(ws2, 'only the clicked row was fetched').toHaveLength(3);
    });

    test('a 504 is retried before being called a failure', async ({ page }) => {
        const { ws2, target, state } = await recoverOneRow(page, { status: 504, failTimes: 1 });

        expect(hitsFor(ws2, target), 'two attempts: 504, then the answer').toHaveLength(2);
        expect(state.done).toBe(true);
        expect(state.error).toBeNull();
    });

    test('a 429 is retried before being called a failure', async ({ page }) => {
        const { ws2, target, state } = await recoverOneRow(page, { status: 429, failTimes: 1 });

        expect(hitsFor(ws2, target), 'two attempts: 429, then the answer').toHaveLength(2);
        expect(state.done).toBe(true);
        expect(state.error).toBeNull();
    });

    test('a 400 is final — widening the set must not swallow a 4xx', async ({ page }) => {
        // NOTE: this passes on unfixed code too. It is not a regression test for
        // F6 but the boundary on its fix — see this file's header, point 2.
        let target = null;
        const ws2 = await loadCollapsedRelPage(page, (url) => (
            target && url.includes(target) ? { status: 400 } : null));
        const mbids = await rowMbids(page);
        target = mbids[3];

        await clickCellEdge(page, target);
        await expect.poll(async () => (await cellState(page, target)).error, { timeout: 30000 })
            .toContain('400');

        expect(hitsFor(ws2, target), 'a 400 answers the same way however often it is asked')
            .toHaveLength(1);
        const state = await cellState(page, target);
        expect(state.done, 'a failure is not "no relationships"').toBe(false);
        expect(state.anchors).toBe(0);
    });
});

test.describe('_ws2GetJson(): how long to wait', () => {
    let pageErrors;

    test.beforeEach(async ({ page }) => {
        pageErrors = collectPageErrors(page);
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('a Retry-After header is honoured as a floor on the backoff', async ({ page }) => {
        // 503 was ALREADY retried before this change, so what this separates is
        // purely the wait: the first retry's own backoff is
        // `_REL_WS2_SPACING_MS * 1` = 1100 ms, and the header asks for 3000.
        // The gap between the two intercepted requests therefore moves from
        // ~1.1 s to ~3 s, which no other plausible defect reproduces.
        const { ws2, target } = await recoverOneRow(page, {
            status: 503,
            failTimes: 1,
            headers: { 'retry-after': '3' },
        });

        const hits = hitsFor(ws2, target);
        expect(hits, 'two attempts: 503, then the answer').toHaveLength(2);
        const gap = hits[1].at - hits[0].at;
        expect(gap, `retry gap was ${gap} ms; the header asked for 3000, the backoff alone is 1100`)
            .toBeGreaterThanOrEqual(2900);
        // Upper bound, so "the wait is a floor" cannot be satisfied by waiting
        // forever: 3000 + one rate slot (1100) + scheduling slack.
        expect(gap).toBeLessThan(8000);
    });

    test('Retry-After parses both RFC forms and is capped at 30 s', async ({ page }) => {
        await loadUserscriptPage(page, {
            url: SERIES.url, fixtureFile: SERIES.shell, testMode: true,
        });

        const parsed = await page.evaluate(() => {
            const p = window.__saTest.parseRetryAfterMs;
            const future = new Date(Date.now() + 5000).toUTCString();
            const farFuture = new Date(Date.now() + 3600000).toUTCString();
            return {
                delta: p('3'),
                deltaZero: p('0'),
                // Capped, not honoured literally: a maintenance window saying
                // "come back in an hour" must not park a request for an hour.
                deltaCapped: p('600'),
                httpDate: p(future),
                httpDateCapped: p(farFuture),
                // A date in the past is "no usable hint", not a negative wait.
                httpDatePast: p('Wed, 21 Oct 2015 07:28:00 GMT'),
                // `Date.parse('12')` succeeds on some engines as the year 12,
                // so delta-seconds must be tested before the date form or a
                // bare number would be read as twenty centuries ago and
                // discarded. Kept under the cap so this pins the ORDER of the
                // two branches rather than re-testing the clamp.
                numericIsNotADate: p('12'),
                garbage: p('soon'),
                empty: p(''),
                missing: p(null),
                spaced: p('  7  '),
            };
        });

        expect(parsed.delta).toBe(3000);
        expect(parsed.deltaZero).toBe(0);
        expect(parsed.deltaCapped).toBe(30000);
        expect(parsed.httpDate).toBeGreaterThan(3000);
        expect(parsed.httpDate).toBeLessThanOrEqual(5000);
        expect(parsed.httpDateCapped).toBe(30000);
        expect(parsed.httpDatePast).toBe(0);
        expect(parsed.numericIsNotADate).toBe(12000);
        expect(parsed.garbage).toBe(0);
        expect(parsed.empty).toBe(0);
        expect(parsed.missing).toBe(0);
        expect(parsed.spaced).toBe(7000);
    });

    test('the transient set is exactly 429, 502, 503 and 504', async ({ page }) => {
        await loadUserscriptPage(page, {
            url: SERIES.url, fixtureFile: SERIES.shell, testMode: true,
        });

        const verdicts = await page.evaluate(() => {
            const t = window.__saTest.isTransientHttp;
            const out = {};
            [200, 400, 401, 403, 404, 408, 410, 414, 500, 501, 429, 502, 503, 504]
                .forEach((s) => { out[s] = t(s); });
            out.zero = t(0);
            out.missing = t(undefined);
            return out;
        });

        for (const s of [429, 502, 503, 504]) {
            expect(verdicts[s], `${s} must be retried`).toBe(true);
        }
        // 500 and 408 are the two most likely to be "completed" into the set by
        // a later reader; 410 is in `_ART_MISS_STATUSES`, which this is NOT the
        // complement of.
        for (const s of [200, 400, 401, 403, 404, 408, 410, 414, 500, 501]) {
            expect(verdicts[s], `${s} must be final`).toBe(false);
        }
        expect(verdicts.zero, 'no response is not a status').toBe(false);
        expect(verdicts.missing).toBe(false);
    });
});

test.describe('the same classifier serves the ⏱ millisecond batch source', () => {
    let pageErrors;

    test.beforeEach(async ({ page }) => {
        pageErrors = collectPageErrors(page);
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('a 502 on a batch is retried, and its Retry-After is honoured too', async ({ page }) => {
        // `_msFetchOneBatch()` is the second `_ws2GetJson()` consumer family,
        // and its `beforeRetry` is a SEPARATE call site from the Relationships
        // one — so the floor is asserted again here rather than assumed to
        // carry over. Before the fix the 502 ended batch 0 on its first
        // attempt, the run came back `'partial'`, and the button was left
        // yellow with half the column still in seconds.
        test.setTimeout(90000);

        const calls = [];
        let failed = false;
        await page.route('**/ws/2/recording?**', (route) => {
            const url = new URL(route.request().url());
            const query = url.searchParams.get('query') || '';
            const ids = query.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g) || [];
            calls.push({ ids, at: Date.now() });
            if (!failed) {
                failed = true;
                return route.fulfill({
                    status: 502,
                    headers: { 'content-type': 'text/plain', 'retry-after': '3' },
                    body: 'Bad Gateway',
                });
            }
            // Answer from the MBIDs this batch actually asked for, the shape
            // artist-recordings-ms-batch.spec.js established.
            const recordings = ids.map((id) => ({ id, length: (60 + Number(id.slice(-12))) * 1000 + 123 }));
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ count: recordings.length, recordings }),
            });
        });

        await loadUserscriptPage(page, {
            url: MS_BATCH.url, fixtureFile: MS_BATCH.shell, testMode: true,
        });
        await page.route(`${MS_BATCH.url}?**`,
            (route) => route.fulfill({ path: MS_BATCH.shell, contentType: 'text/html' }));
        await page.click(`button[data-label="${MS_BATCH.showAllLabel}"]`);
        await page.waitForSelector('#mb-filter-container');

        const toggle = page.locator('.mb-ms-col-hdr-btn').first();
        await toggle.click();
        await expect(toggle).toHaveAttribute('aria-pressed', 'true', { timeout: 60000 });

        expect(calls, 'batch 0 retried after its 502, then batch 1 — three requests in all')
            .toHaveLength(3);
        expect(calls[0].ids, 'the retry re-asks for the SAME batch').toEqual(calls[1].ids);
        expect(await toggle.getAttribute('data-mb-ms-retry'),
            'a recovered run is not partial').toBeNull();

        // `_MS_BATCH_DELAY * 1` is 1100 ms; the header asked for 3000.
        const retryGap = calls[1].at - calls[0].at;
        expect(retryGap, `batch retry gap was ${retryGap} ms; the header asked for 3000`)
            .toBeGreaterThanOrEqual(2900);

        // Both batches landed, so every row with a length shows milliseconds.
        const withMs = await page.evaluate(() => Array.from(
            document.querySelectorAll('table.tbl tbody td[data-mb-ms]'))
            .filter((td) => /\.\d{3}$/.test(td.textContent.trim())).length);
        expect(withMs, 'the 30-row second batch is present too, not just the first 100')
            .toBeGreaterThan(100);
    });
});

// "Tougher Than the Rest" — two sub-tables, Official (6) and Promotion (1).
// With a threshold of 3, Official renders collapsed and Promotion expanded, so
// expanding Official is exactly one BROWSE request. Mirrors
// rel-column-browse-batch.spec.js' setup.
const RG_MBID = 'f83d2211-dd81-4b1e-9a02-e89733891e1c';
const RG = {
    url: `https://musicbrainz.org/release-group/${RG_MBID}`,
    shell: path.join(__dirname, '..', 'snapshots', 'releasegroup-releases', 'raw.html'),
    showAllLabel: 'Show all Releases for ReleaseGroup',
    urlGlob: 'https://musicbrainz.org/release-group/**',
};

const discogs = (id) => ({
    'target-type': 'url',
    type: 'discogs',
    url: { resource: `https://www.discogs.com/release/${id}` },
});

/** @returns {'browse'|'lookup'|'other'} */
function classifyWs2(u) {
    const { pathname } = new URL(u);
    if (/^\/ws\/2\/[a-z-]+$/.test(pathname)) return 'browse';
    if (/^\/ws\/2\/[a-z-]+\/[0-9a-f-]{36}$/.test(pathname)) return 'lookup';
    return 'other';
}

test.describe('the same classifier serves the Relationships browse source', () => {
    let pageErrors;

    test.beforeEach(async ({ page }) => {
        pageErrors = collectPageErrors(page);
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('a 502 on a browse page is retried, and its Retry-After is honoured too',
        async ({ page }) => {
            // `_relBrowseFetchPage()` is the THIRD `_ws2GetJson()` call site and
            // the third separate `beforeRetry`. Its failure mode is quiet by
            // design: the browse loop just `break`s and "per-row lookups take
            // over", so on unfixed code the column still fills in — with six
            // lookups instead of one browse page. Counting the two kinds apart
            // is what makes that visible.
            test.setTimeout(90000);

            const reqs = [];
            let official = [];
            let browseFailed = false;

            await loadUserscriptPage(page, {
                url: RG.url,
                fixtureFile: RG.shell,
                testMode: true,
                settingsOverride: {
                    sa_enable_relationships_column: true,
                    sa_rel_collapse_threshold: 3,
                    sa_rel_browse_batch_enable: true,
                },
            });
            await page.route('**/ws/2/**', (route) => {
                const u = route.request().url();
                const kind = classifyWs2(u);
                reqs.push({ kind, url: u, at: Date.now() });
                if (kind === 'browse' && !browseFailed) {
                    browseFailed = true;
                    return route.fulfill({
                        status: 502,
                        headers: { 'content-type': 'text/plain', 'retry-after': '3' },
                        body: 'Bad Gateway',
                    });
                }
                const body = kind === 'browse'
                    ? JSON.stringify({
                        'release-count': official.length,
                        'release-offset': 0,
                        releases: official.map((id) => ({ id, relations: [discogs(id)] })),
                    })
                    : JSON.stringify({ relations: [discogs('lookup')] });
                return route.fulfill({ status: 200, contentType: 'application/json', body });
            });
            await page.route(RG.urlGlob, (route) => route.fulfill({ path: RG.shell, contentType: 'text/html' }));
            await page.click(`button[data-label="${RG.showAllLabel}"]`);
            await waitForRenderComplete(page, { waitForAutoResize: false });
            await clickMasterToggleAndExpandAll(page);

            const count = (kind) => reqs.filter((r) => r.kind === kind).length;
            // Promotion's single row is expanded at render and is cheaper as one
            // lookup than as a browse page — the settled starting point.
            await expect.poll(() => count('lookup'), { timeout: 20000 }).toBe(1);
            official = await page.evaluate(() => {
                const t = Array.from(document.querySelectorAll('table.tbl'))
                    .find((x) => x.dataset.mbRelExpanded === '0');
                return t ? Array.from(t.querySelectorAll('tbody td.mb-rel-cell[data-mbid]'))
                    .map((td) => td.dataset.mbid) : [];
            });
            expect(official, 'the collapsed Official sub-table').toHaveLength(6);

            await page.locator('table.tbl[data-mb-rel-expanded="0"] thead .mb-rel-col-hdr-btn')
                .first().click();
            await expect.poll(
                () => page.evaluate(() => window.__saTest.relTableStates()
                    .reduce((n, t) => n + t.pending, 0)),
                { timeout: 40000 }).toBe(0);

            const browses = reqs.filter((r) => r.kind === 'browse');
            expect(browses, 'the 502 browse page was retried, not abandoned').toHaveLength(2);
            expect(count('lookup'), 'a retried browse still covers every row — no per-row fallback')
                .toBe(1);

            const gap = browses[1].at - browses[0].at;
            expect(gap, `browse retry gap was ${gap} ms; the header asked for 3000`)
                .toBeGreaterThanOrEqual(2900);

            const anchors = await page.evaluate(() => Object.fromEntries(
                Array.from(document.querySelectorAll('table.tbl tbody td.mb-rel-cell[data-mbid]'))
                    .map((td) => [td.dataset.mbid, td.querySelectorAll('a').length])));
            for (const m of official) expect(anchors[m], `icon for ${m}`).toBe(1);
        });
});
