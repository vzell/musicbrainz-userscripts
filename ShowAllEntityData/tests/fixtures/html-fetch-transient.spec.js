'use strict';

// The HTML pagination path: what a 503 does to a multi-page fetch, and what the
// user is told afterwards (org/503-handling.org F1-F3).
//
// ── The defect ──────────────────────────────────────────────────────────────
//
// `fetchHtml()` had no retry, and both of its callers swallowed the failure:
//
//   - the main loop did `pagesProcessed++` BEFORE fetching page `p` and
//     `break`d in its catch, so a 503 on page 4 of 40 ended the run at page 3
//     and then printed "Loaded 4 pages (N rows)" — counting the page that
//     failed, in the exact words a complete run uses (F1);
//   - `fetchMaxPageGeneric()` returned `1` from its catch, so a 503 on the
//     page-count request was indistinguishable from a listing that genuinely
//     has one page (F2);
//   - the artist-releasegroups official-headers pre-fetch `break`d too, and a
//     SHORT official set does not truncate the Official/Non-Official split — it
//     MISFILES genuinely-official categories as non-official, because the
//     consumer treats the first category that stops matching the front of that
//     array as the start of the non-official section (F3).
//
// ── What each test pins, and the adjacent property it avoids ────────────────
//
//  1. RECOVERY. A transient page failure is retried and the run completes with
//     every row. Asserted as a REQUEST COUNT as well as a row count: "300 rows
//     arrived" would also pass if the retry had never been needed.
//  2. HONESTY. A page that keeps failing stops the run and says so — and the
//     assertion is on "1 of 3", not merely on the presence of a warning glyph.
//     The number is the whole fix: the old line's defect was that "Loaded 2
//     pages" was true-looking and wrong.
//  3. THE BOUNDARY. A 404 is not retried. Widening a retry set is the change
//     that overshoots; this is its guard and it passes on unfixed code.
//  4. THE WAIT. `Retry-After: 5` moves the retry out past the 2 s backoff.
//     Measured from the intercepted requests' own timestamps.
//  5. F2 SEPARATELY. An unreadable page count reports "of an unknown total",
//     never "1 of 1 pages" — which would read as a complete one-page listing,
//     i.e. the same lie in new words.
//  6. F3 WITH ITS CONTROL. A short pre-fetch suppresses the discography view
//     buttons; a clean run of the same fixture produces them. Without the
//     control the suppression test would pass on a fixture that never had the
//     buttons at all.
//
// Network-free. The two shells are built by scripts/build-html-fetch-fixtures.py
// from the committed snapshots, with only the pagination widget rewritten to 3
// pages — the real ones say 42 and 22, and a fixture route serves the same shell
// for every page, so honouring those would mean dozens of parses of a
// quarter-megabyte document per test.
//
// Failures are always `route.fulfill({status})`, NEVER `route.abort()`: an abort
// makes fetch() throw, which `fetchHtml()` retries on its own terms, so an
// aborting spec would not distinguish the status classification at all.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { collectPageErrors } = require('../support/liveAssertions');

// artist-events, 100 rows per page, pagination rewritten to 3 pages.
// Page 1 is served from the LIVE document (`p === currentPageNum`, no
// overrideParams), so pages 2 and 3 are the only ones fetched — which is why
// page 2 is the interesting one to fail.
const EVENTS = {
    url: 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f/events',
    shell: path.join(__dirname, 'html-fetch-transient-events.html'),
    label: 'Show all Events for Artist',
    rowsPerPage: 100,
    pages: 3,
};

// artist-releasegroups, 21 rows per page. Its buttons carry params, so this one
// goes through `fetchMaxPageGeneric()` (F2) AND runs the two-pass
// official-headers pre-fetch (F3). The two passes are told apart by `all=0`
// (pre-fetch) versus `all=1` (main).
const RG = {
    url: 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f',
    shell: path.join(__dirname, 'html-fetch-transient-rg.html'),
    labelMatch: 'Artist RGs',
};

const STATUS = '#mb-global-status-display';
// The status line is a CONTAINER of spans; the "Loaded …" segment is its first
// child and carries the tooltip. Reading `title` off the container returns null,
// which looked exactly like "no tooltip was set".
const STATUS_LOADED = '#mb-global-status-display > span:first-child';

/** @returns {Promise<string>} The status line, once it stops changing. */
async function settledStatus(page, timeout = 60000) {
    let last = null;
    let same = 0;
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        const now = await page.locator(STATUS).textContent().catch(() => null);
        // A run is only settled once the line says "Loaded" — the intermediate
        // "Loading (pass 1 of 2)…" texts are stable for seconds at a time while
        // a retry backoff runs, so sampling for stability alone settles early.
        if (now && /Loaded/.test(now)) {
            same = (now === last) ? same + 1 : 0;
            if (same >= 3) return now;
        }
        last = now;
        await page.waitForTimeout(200);
    }
    throw new Error(`status never settled on a "Loaded …" line (last seen: ${JSON.stringify(last)})`);
}

/** @returns {Promise<number>} Rendered data rows across every table. */
const renderedRows = (page) => page.evaluate(
    () => document.querySelectorAll('table.tbl tbody tr').length);

/**
 * Loads the artist-events shell and routes every paginated page fetch.
 *
 * `respond(pageNum)` may return `{status, headers}`; anything falsy serves the
 * shell. The returned array logs one entry per intercepted request, with the
 * timestamp the Retry-After test measures.
 *
 * @param {import('@playwright/test').Page} page
 * @param {?function(number): ?{status?: number, headers?: Object<string, string>}} respond
 * @returns {Promise<Array<{page: number, at: number}>>}
 */
async function loadEvents(page, respond) {
    const reqs = [];
    await loadUserscriptPage(page, {
        url: EVENTS.url, fixtureFile: EVENTS.shell, testMode: true,
    });
    await page.route('https://musicbrainz.org/artist/**', (route) => {
        const u = new URL(route.request().url());
        const p = Number(u.searchParams.get('page') || '1');
        reqs.push({ page: p, at: Date.now() });
        const r = (respond && respond(p)) || {};
        if (r.status && r.status !== 200) {
            return route.fulfill({
                status: r.status,
                headers: { 'content-type': 'text/plain', ...(r.headers || {}) },
                body: 'Service Unavailable',
            });
        }
        return route.fulfill({ path: EVENTS.shell, contentType: 'text/html' });
    });
    await page.click(`button[data-label="${EVENTS.label}"]`);
    return reqs;
}

/**
 * Loads the artist-releasegroups shell and routes both passes.
 *
 * `respond({all, page, ordinal})` sees which pass a request belongs to, and how
 * many requests that exact URL has already had — the page-count request and the
 * loop's own page 1 are the SAME url, so failing "the count" means failing the
 * first occurrence only.
 *
 * @param {import('@playwright/test').Page} page
 * @param {?function({all: string, page: number, ordinal: number}): ?{status?: number}} respond
 * @returns {Promise<Array<{all: string, page: number, at: number}>>}
 */
async function loadRg(page, respond) {
    const reqs = [];
    const seen = new Map();
    await loadUserscriptPage(page, {
        url: RG.url, fixtureFile: RG.shell, testMode: true,
    });
    await page.route('https://musicbrainz.org/artist/**', (route) => {
        const url = route.request().url();
        const u = new URL(url);
        const all = u.searchParams.get('all') || '';
        const p = Number(u.searchParams.get('page') || '1');
        const ordinal = (seen.get(url) || 0) + 1;
        seen.set(url, ordinal);
        reqs.push({ all, page: p, at: Date.now() });
        const r = (respond && respond({ all, page: p, ordinal })) || {};
        if (r.status && r.status !== 200) {
            return route.fulfill({
                status: r.status, contentType: 'text/plain', body: 'Service Unavailable',
            });
        }
        return route.fulfill({ path: RG.shell, contentType: 'text/html' });
    });
    await page.click(`button[data-label*="${RG.labelMatch}"]`);
    return reqs;
}

const hits = (reqs, pageNum) => reqs.filter((r) => r.page === pageNum);

test.describe('HTML page fetch: a transient failure is retried', () => {
    let pageErrors;

    test.beforeEach(async ({ page }) => {
        pageErrors = collectPageErrors(page);
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('a 503 on page 2 is retried and the run still loads every page', async ({ page }) => {
        test.setTimeout(90000);
        let failed = false;
        const reqs = await loadEvents(page, (p) => {
            if (p !== 2 || failed) return null;
            failed = true;
            return { status: 503 };
        });

        const status = await settledStatus(page);
        expect(hits(reqs, 2), 'page 2: one 503, then the answer').toHaveLength(2);
        expect(hits(reqs, 3), 'page 3 was still reached').toHaveLength(1);
        expect(status).toContain(`Loaded ${EVENTS.pages} pages`);
        expect(status, 'a recovered run is not marked').not.toContain('INCOMPLETE');
        expect(status).not.toContain('⚠️');
        expect(await renderedRows(page)).toBe(EVENTS.rowsPerPage * EVENTS.pages);
    });

    test('a page that keeps failing stops the run and is NOT counted as loaded',
        async ({ page }) => {
            test.setTimeout(90000);
            const reqs = await loadEvents(page, (p) => (p === 2 ? { status: 503 } : null));

            const status = await settledStatus(page);
            expect(hits(reqs, 2), 'three attempts, then given up on').toHaveLength(3);
            expect(hits(reqs, 3), 'the loop stops at the first failed page').toHaveLength(0);

            // The heart of F1: 1, not 2. `pagesProcessed++` used to run before
            // the fetch, so the failed page was counted as loaded.
            expect(status).toContain('Loaded 1 of 3 pages');
            expect(status).toContain('INCOMPLETE');
            expect(status).toContain('⚠️');

            // Page 1's rows are kept — the run is truncated, not discarded.
            expect(await renderedRows(page)).toBe(EVENTS.rowsPerPage);

            const tip = await page.locator(STATUS_LOADED).getAttribute('title');
            expect(tip).toContain('page 2 of 3 failed');
            expect(tip).toContain('HTTP 503');
        });

    test('a 404 is final — the widened retry set must not swallow a 4xx', async ({ page }) => {
        // Passes on unfixed code too: this guards the overshoot, not the defect.
        test.setTimeout(90000);
        const reqs = await loadEvents(page, (p) => (p === 2 ? { status: 404 } : null));

        const status = await settledStatus(page);
        expect(hits(reqs, 2), 'asked once; a 404 answers the same way every time')
            .toHaveLength(1);
        expect(status).toContain('Loaded 1 of 3 pages');
        expect(await page.locator(STATUS_LOADED).getAttribute('title')).toContain('HTTP 404');
    });

    test('a Retry-After header is honoured as a floor on the page backoff', async ({ page }) => {
        test.setTimeout(90000);
        let failed = false;
        const reqs = await loadEvents(page, (p) => {
            if (p !== 2 || failed) return null;
            failed = true;
            return { status: 503, headers: { 'retry-after': '5' } };
        });

        await settledStatus(page);
        const two = hits(reqs, 2);
        expect(two).toHaveLength(2);
        const gap = two[1].at - two[0].at;
        // The first backoff is _HTML_FETCH_BACKOFF_MS[0] = 2000; the header
        // asked for 5000. Nothing else in this path produces a ~5 s pause.
        expect(gap, `retry gap was ${gap} ms; the header asked for 5000, the backoff alone is 2000`)
            .toBeGreaterThanOrEqual(4800);
        expect(gap).toBeLessThan(15000);
    });
});

test.describe('HTML page count: a failure is not "one page"', () => {
    let pageErrors;

    test.beforeEach(async ({ page }) => {
        pageErrors = collectPageErrors(page);
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('an unreadable page count reports an unknown total, not a complete one-page run',
        async ({ page }) => {
            test.setTimeout(120000);
            // `fetchMaxPageGeneric()`'s request and the loop's own page 1 are
            // both `all=1&page=1`, and the count request comes first. Failing
            // its three attempts and no more leaves the loop's page 1 to
            // succeed — otherwise this would just be testing F1 again.
            //
            // Failing ONE attempt is not enough and that is the point: the new
            // retry absorbs it and the count comes back correct. This spec's
            // first draft did exactly that and reported a clean 3-page run.
            let countAttempts = 0;
            const reqs = await loadRg(page, ({ all, page: p }) => {
                if (all !== '1' || p !== 1) return null;
                countAttempts += 1;
                return countAttempts <= 3 ? { status: 503 } : null;
            });

            const status = await settledStatus(page);
            expect(reqs.some((r) => r.all === '1'), 'the main pass ran at all').toBe(true);
            expect(status).toContain('of an unknown total');
            expect(status).toContain('INCOMPLETE');
            // "1 of 1 pages" would read as a complete one-page listing — the
            // same lie in new words, and the reason pagesPhrase exists.
            expect(status).not.toContain('1 of 1 pages');

            const tip = await page.locator(STATUS_LOADED).getAttribute('title');
            expect(tip).toContain('the page count could not be read');
        });
});

test.describe('artist-releasegroups: an incomplete pre-fetch suppresses the discography views', () => {
    let pageErrors;

    test.beforeEach(async ({ page }) => {
        pageErrors = collectPageErrors(page);
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('a clean run DOES build them (control)', async ({ page }) => {
        test.setTimeout(120000);
        await loadRg(page, null);
        const status = await settledStatus(page);

        expect(status).not.toContain('⚠️');
        await expect(page.locator('#mb-disc-official-btn')).toHaveCount(1);
        await expect(page.locator('#mb-disc-nonofficial-btn')).toHaveCount(1);
    });

    test('a failed official-headers page suppresses them rather than guessing a split',
        async ({ page }) => {
            test.setTimeout(120000);
            // all=0 is the official-only pre-fetch pass. Its page 2 fails for good.
            const reqs = await loadRg(page, ({ all, page: p }) => (
                (all === '0' && p === 2) ? { status: 503 } : null));

            const status = await settledStatus(page);
            expect(reqs.filter((r) => r.all === '0' && r.page === 2), 'retried first')
                .toHaveLength(3);

            // No buttons — a short official set would misfile categories, and
            // `discOfficialCategories` would persist that wrong split to disk.
            await expect(page.locator('#mb-disc-official-btn')).toHaveCount(0);
            await expect(page.locator('#mb-disc-nonofficial-btn')).toHaveCount(0);

            // The ROWS are complete — the main pass is independent of the
            // pre-fetch — so this is warned about but never called INCOMPLETE.
            expect(status).toContain('⚠️');
            expect(status, 'the rows are all there; only the split is missing')
                .not.toContain('INCOMPLETE');

            const tip = await page.locator(STATUS_LOADED).getAttribute('title');
            expect(tip).toContain('official-headers pass');
            expect(tip).toContain('discography views are unavailable');
        });
});
