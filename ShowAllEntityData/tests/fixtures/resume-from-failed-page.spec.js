'use strict';

// Resuming an interrupted multi-page fetch at the page that failed
// (org/503-handling.org item 5, "DESIGN — item 5").
//
// ── What the feature is ─────────────────────────────────────────────────────
//
// When `fetchHtml()` has spent its three attempts on page K, the loop `break`s
// and the status line says "⚠️ Loaded K-1 of M pages — INCOMPLETE" (F1). Until
// now the only way forward was to press the button again and re-fetch all M
// pages. A "↻ Load remaining pages" button now re-enters
// `startFetchingProcess()` with a `resumeFrom` record, which changes exactly
// four things: the page count is reused rather than re-probed (and its two
// threshold dialogs stay shut), the heading pre-processing is skipped, the row
// accumulators are NOT cleared, and the loop starts at page K.
//
// ── What each test pins, and the adjacent property it avoids ────────────────
//
//  1. THE OFFER, and that it names the right page. Asserted through
//     `__saTest.resumeState()`, not just the button's presence: a button that
//     appeared with a wrong `nextPage` would still be a button.
//  2. THE ROWS ARE KEPT. The discriminator is 300 vs 200 — page 1's 100 rows
//     are served from the LIVE document and are never re-fetchable, so if the
//     accumulator reset ran on the resume the run would end at 200 rows while
//     every other signal (status text, request log) looked right. "300 rows
//     arrived" is the whole assertion; a row count alone would also pass if the
//     resume had simply re-run the entire fetch, so the request log is checked
//     against it.
//  3. ROW INDICES CONTINUE. `_mbRowIdxCounter` is deliberately left running, so
//     the resumed rows get fresh `data-mb-row-idx` values and every map keyed
//     "rowIdx:colIdx" stays consistent. Pinned as UNIQUENESS: re-zeroing the
//     counter yields 300 rows with 200 distinct indices, which nothing else
//     here would notice.
//  4. A SECOND FAILURE OFFERS AGAIN, from the new page — not from the original
//     one, which would re-fetch what the resume had just successfully loaded.
//  5. THE DIALOG DOES NOT FIRE TWICE. With `sa_max_page` below the page count,
//     "⚠️ High Page Count" gates the first run; the resume must not ask again
//     about the same set of pages.
//  6. A FRESH PRESS CLEARS THE OFFER, so a stale resume point can never be
//     spent against a different run's row set.
//
// Network-free. Shares `html-fetch-transient-events.html` with
// `html-fetch-transient.spec.js` — artist-events, 100 rows per page, pagination
// rewritten to 3 pages by scripts/build-html-fetch-fixtures.py.
//
// Failures are always `route.fulfill({status})`, NEVER `route.abort()`: an abort
// makes fetch() throw, which `fetchHtml()` retries on its own terms.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { collectPageErrors } = require('../support/liveAssertions');
const { dismissCustomConfirmDialog } = require('../support/customDialog');
const { columnFilterInput, columnFilterClear } = require('../support/filterSortAssertions');

const EVENTS = {
    url: 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f/events',
    shell: path.join(__dirname, 'html-fetch-transient-events.html'),
    label: 'Show all Events for Artist',
    rowsPerPage: 100,
    pages: 3,
};

const STATUS = '#mb-global-status-display';
const RESUME_BTN = '#mb-resume-fetch-btn';

/** @returns {Promise<string>} The status line, once it stops changing. */
async function settledStatus(page, timeout = 90000) {
    let last = null;
    let same = 0;
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        const now = await page.locator(STATUS).textContent().catch(() => null);
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

/** @returns {Promise<?object>} `__saTest.resumeState()`, or null. */
const resumeState = (page) => page.evaluate(
    () => (window.__saTest ? window.__saTest.resumeState() : 'NO __saTest'));

/**
 * Loads the artist-events shell and routes every paginated page fetch.
 *
 * `respond(pageNum)` may return `{status}`; anything falsy serves the shell.
 * The returned log carries one entry per intercepted request, so a test can
 * say which pages a PHASE asked for by slicing it at the resume click.
 *
 * @param {import('@playwright/test').Page} page
 * @param {?function(number): ?{status?: number}} respond
 * @param {Object<string, *>} [settingsOverride]
 * @returns {Promise<Array<{page: number, at: number}>>}
 */
async function loadEvents(page, respond, settingsOverride) {
    const reqs = [];
    await loadUserscriptPage(page, {
        url: EVENTS.url,
        fixtureFile: EVENTS.shell,
        testMode: true,
        ...(settingsOverride ? { settingsOverride } : {}),
    });
    await page.route('https://musicbrainz.org/artist/**', (route) => {
        const u = new URL(route.request().url());
        const p = Number(u.searchParams.get('page') || '1');
        reqs.push({ page: p, at: Date.now() });
        const r = (respond && respond(p)) || {};
        if (r.status && r.status !== 200) {
            return route.fulfill({
                status: r.status,
                headers: { 'content-type': 'text/plain' },
                body: 'Service Unavailable',
            });
        }
        return route.fulfill({ path: EVENTS.shell, contentType: 'text/html' });
    });
    await page.click(`button[data-label="${EVENTS.label}"]`);
    return reqs;
}

/** Distinct page numbers in a slice of the request log, in order. */
const pagesIn = (reqs) => [...new Set(reqs.map((r) => r.page))].sort();

test.describe('resume an interrupted fetch at the page that failed', () => {
    let pageErrors;

    test.beforeEach(async ({ page }) => {
        pageErrors = collectPageErrors(page);
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('an interrupted run offers to resume, at the page that failed', async ({ page }) => {
        test.setTimeout(120000);
        // Page 2 never recovers: three attempts, then the loop breaks.
        await loadEvents(page, (p) => (p === 2 ? { status: 503 } : null));

        const status = await settledStatus(page);
        expect(status, 'the run reports 1 of 3 pages').toMatch(/1 of 3 pages/);
        expect(status, 'and says so in the word the fix introduced').toMatch(/INCOMPLETE/);

        await expect(page.locator(RESUME_BTN), 'the offer is on screen').toBeVisible();

        // THE assertion: not that a button exists, but that it knows where to
        // pick up. A button offering page 1 would re-fetch what is already here.
        expect(await resumeState(page)).toEqual({
            nextPage: 2,
            maxPage: 3,
            pagesProcessed: 1,
            totalRowsAccumulated: EVENTS.rowsPerPage,
            maxPageKnown: true,
        });
        expect(await renderedRows(page), 'page 1 is rendered').toBe(EVENTS.rowsPerPage);
    });

    test('resuming keeps the rows already loaded instead of re-fetching them', async ({ page }) => {
        test.setTimeout(120000);
        // Page 2 fails exactly the three attempts of the first run, then works.
        let p2 = 0;
        const reqs = await loadEvents(page, (p) => {
            if (p !== 2) return null;
            p2 += 1;
            return p2 <= 3 ? { status: 503 } : null;
        });
        await settledStatus(page);
        expect(await renderedRows(page)).toBe(EVENTS.rowsPerPage);

        const beforeResume = reqs.length;
        await page.click(RESUME_BTN);
        const status = await settledStatus(page);

        // 300, not 200. Page 1's rows came from the LIVE document and can never
        // be re-fetched, so they are present only if the accumulators survived.
        expect(await renderedRows(page), 'every page\'s rows are present')
            .toBe(EVENTS.rowsPerPage * EVENTS.pages);
        expect(status, 'and the run no longer calls itself incomplete')
            .toMatch(/Loaded 3 pages \(300 rows\)/);
        expect(status).not.toMatch(/INCOMPLETE/);
        expect(await resumeState(page), 'a completed resume leaves no offer behind').toBeNull();
        await expect(page.locator(RESUME_BTN)).toHaveCount(0);

        // …and it really did resume rather than re-run: the second phase asked
        // only for the pages that were missing.
        const during = reqs.slice(beforeResume);
        expect(during.length, 'the resume made requests at all').toBeGreaterThan(0);
        expect(pagesIn(during), 'the resume asked only for pages 2 and 3').toEqual([2, 3]);
    });

    test('the resumed rows continue the row-index sequence rather than restarting it',
        async ({ page }) => {
            test.setTimeout(120000);
            let p2 = 0;
            await loadEvents(page, (p) => {
                if (p !== 2) return null;
                p2 += 1;
                return p2 <= 3 ? { status: 503 } : null;
            });
            await settledStatus(page);
            await page.click(RESUME_BTN);
            await settledStatus(page);

            const idx = await page.evaluate(() => Array.from(
                document.querySelectorAll('table.tbl tbody tr[data-mb-row-idx]'),
                (tr) => tr.getAttribute('data-mb-row-idx')));

            expect(idx.length, 'every rendered row carries an index')
                .toBe(EVENTS.rowsPerPage * EVENTS.pages);
            // Re-zeroing `_mbRowIdxCounter` on the resume gives 300 rows with
            // only 200 distinct indices — invisible to every other assertion
            // here, and corrupting for every map keyed "rowIdx:colIdx".
            expect(new Set(idx).size, 'no two rows share a row index').toBe(idx.length);
        });

    test('a resume that fails again offers again, from the NEW page', async ({ page }) => {
        test.setTimeout(150000);
        let p2 = 0;
        await loadEvents(page, (p) => {
            if (p === 3) return { status: 503 };          // never recovers
            if (p !== 2) return null;
            p2 += 1;
            return p2 <= 3 ? { status: 503 } : null;      // recovers for the resume
        });
        await settledStatus(page);
        expect((await resumeState(page)).nextPage).toBe(2);

        await page.click(RESUME_BTN);
        const status = await settledStatus(page);

        expect(status, 'two of three pages now').toMatch(/2 of 3 pages/);
        expect(await renderedRows(page), 'pages 1 and 2 are both present')
            .toBe(EVENTS.rowsPerPage * 2);
        // The new offer must point at 3. Pointing at 2 again would re-fetch the
        // page this resume just succeeded on.
        expect(await resumeState(page)).toEqual({
            nextPage: 3,
            maxPage: 3,
            pagesProcessed: 2,
            totalRowsAccumulated: EVENTS.rowsPerPage * 2,
            maxPageKnown: true,
        });
        await expect(page.locator(RESUME_BTN)).toBeVisible();
    });

    test('the page count is not re-probed, so its dialog does not fire a second time',
        async ({ page }) => {
            test.setTimeout(120000);
            let p2 = 0;
            // 3 pages against a cap of 2 puts "⚠️ High Page Count" in the way.
            await loadEvents(page, (p) => {
                if (p !== 2) return null;
                p2 += 1;
                return p2 <= 3 ? { status: 503 } : null;
            }, { sa_max_page: 2 });

            expect(await dismissCustomConfirmDialog(page, { timeout: 5000 }),
                'the first run really is gated by the dialog').toBe(true);
            await settledStatus(page);
            await expect(page.locator(RESUME_BTN)).toBeVisible();

            await page.click(RESUME_BTN);
            // Checked BEFORE settling: the dialog blocks the run, so if one
            // appeared this would catch it while it is still open.
            expect(await dismissCustomConfirmDialog(page, { timeout: 5000 }),
                'the resume must not ask again about the same pages').toBe(false);

            const status = await settledStatus(page);
            expect(status, 'and it completed without one').toMatch(/Loaded 3 pages \(300 rows\)/);
            expect(await renderedRows(page)).toBe(EVENTS.rowsPerPage * EVENTS.pages);
        });

    test('column filtering still works after a resume — the property the reload guarded',
        async ({ page }) => {
            test.setTimeout(150000);
            // `startFetchingProcess()` answers a SECOND press by reloading the
            // page, "to fix column-level filter unresponsiveness". A resume is
            // exempt from that path by necessity — a reload destroys the rows it
            // exists to keep — so the property the reload protected is asserted
            // directly here rather than assumed.
            let p2 = 0;
            await loadEvents(page, (p) => {
                if (p !== 2) return null;
                p2 += 1;
                return p2 <= 3 ? { status: 503 } : null;
            });
            await settledStatus(page);
            await page.click(RESUME_BTN);
            await settledStatus(page);
            const all = EVENTS.rowsPerPage * EVENTS.pages;
            expect(await renderedRows(page)).toBe(all);

            // Pick a real value out of a real column AND compute how many rows
            // contain it, in one pass. A query matching nothing would also
            // "narrow" the table, and would pass a bare `< 300` assertion while
            // proving the opposite of what this test is for.
            const pick = await page.evaluate(() => {
                const inputs = Array.from(
                    document.querySelectorAll('table.tbl thead .mb-col-filter-input[data-col-idx]'));
                const rows = Array.from(document.querySelectorAll('table.tbl tbody tr'));
                for (const inp of inputs) {
                    const idx = Number(inp.getAttribute('data-col-idx'));
                    const texts = rows.map(
                        (tr) => (tr.cells[idx] ? tr.cells[idx].textContent.trim() : ''));
                    const cand = texts.find((t) => t.length >= 5 && t.length <= 60);
                    if (!cand) continue;
                    const n = texts.filter((t) => t.includes(cand)).length;
                    if (n > 0 && n < rows.length) return { idx, text: cand, n };
                }
                return null;
            });
            expect(pick, 'the rendered table offers a column value to filter on').not.toBeNull();

            const input = columnFilterInput(page, pick.idx);
            await input.click();
            await input.pressSequentially(pick.text);
            await expect.poll(() => renderedRows(page), {
                timeout: 20000,
                message: 'the column filter narrows the table after a resume',
            }).toBe(pick.n);

            // And it is reversible — which is what tells "the filter ran" apart
            // from "the rows happened to be gone".
            await columnFilterClear(page, pick.idx).click();
            await expect.poll(() => renderedRows(page), {
                timeout: 20000, message: 'clearing the column filter restores every row',
            }).toBe(all);
        });

    test('a fresh press still reloads the page — the resume is the only exemption',
        async ({ page }) => {
            test.setTimeout(120000);
            let p2 = 0;
            await loadEvents(page, (p) => {
                if (p !== 2) return null;
                p2 += 1;
                return p2 <= 3 ? { status: 503 } : null;
            });
            await settledStatus(page);
            await expect(page.locator(RESUME_BTN)).toBeVisible();

            // A SECOND fetch is answered by `window.location.reload()`, and that
            // behaviour is deliberately untouched — the resume is exempted from
            // it, not the other way round. Detected by a marker the reload wipes,
            // because `isLoaded &&` could be dropped from the guard without any
            // assertion in this file noticing.
            await page.evaluate(() => { window.__saResumeSpecMark = 1; });
            await page.click(`button[data-label="${EVENTS.label}"]`);
            await expect.poll(() => page.evaluate(() => window.__saResumeSpecMark), {
                timeout: 30000, message: 'the second press reloads the page',
            }).toBeUndefined();

            // The reload is also how the stale offer goes away on that path —
            // by construction, since the whole module state goes with it. Not
            // asserted through `__saTest`: the fixture harness injects the
            // userscript into the page it loaded, so after a reload there is no
            // script running to ask.
            await expect(page.locator(RESUME_BTN)).toHaveCount(0);
        });
});
