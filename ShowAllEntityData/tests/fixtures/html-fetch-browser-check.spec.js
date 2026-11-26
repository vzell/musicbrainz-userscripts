'use strict';

// MusicBrainz's "Verifying your browser" check as the answer to a page fetch
// (org/majkinetor.org, "The browser check on SAED's own page fetches").
//
// ── The defect ──────────────────────────────────────────────────────────────
//
// Once the browser's `__meb_verified` cookie (24 h, bound to the IP) has
// expired, musicbrainz.org answers a page request with its check page: HTTP
// 200, HTML, 1,396 bytes (debug/af1-rg-die-traktor.html), no `table.tbl`.
// `fetchHtml()` took any 2xx as the page, so page N of a "Show all" run added
// no rows and the run called itself complete. majkinetor's gate detects the
// page (`mbnIsCheck()`) and passes it once in a hidden same-origin frame
// (`mbnReverify()`), then retries (#733, #1103); SAED now does the same.
//
// ── What each test pins, and the adjacent property it avoids ────────────────
//
//  B1. RECOVERY. A check page on page 2 is passed in a frame and page 2 is
//      asked again: 300 rows. Pinned with the request log too (fetch, frame,
//      fetch for page 2), since 300 rows alone would also pass if the check
//      were never served; and the frame is gone afterwards.
//  B2. HONESTY. A check the frame cannot pass makes page 2 a FAILED page: "1 of
//      3 pages … INCOMPLETE", the reason in the tooltip, the resume offered at
//      page 2, and the resume loads the rest. "Loaded 3 pages (200 rows)" was
//      the old, complete-looking lie.
//  B3. THE PAGE COUNT. `fetchMaxPageGeneric()` goes through `fetchHtml()` too:
//      a check page on the count request must not become "an unknown total".
//  B4. THE DETECTOR. The title or the <noscript> sentinel marks the check; a
//      real page carrying a `/__meb_verify` beacon does not (upstream: Falcon
//      #551). The old pattern matched the beacon.
//
// Network-free. The check page is inlined below without its proof-of-work
// script, so nothing runs in the frame; whether the frame "passed" is decided
// by what the route serves the frame's own navigation.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { collectPageErrors } = require('../support/liveAssertions');
const { resumeMissingPages } = require('../support/stopButton');

// artist-events, 100 rows per page, pagination rewritten to 3 pages; page 1 is
// the live document, so pages 2 and 3 are the ones fetched.
const EVENTS = {
    url: 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f/events',
    shell: path.join(__dirname, 'html-fetch-transient-events.html'),
    label: 'Show all Events for Artist',
    rowsPerPage: 100,
    pages: 3,
};

// artist-releasegroups: its button carries params, so it asks
// `fetchMaxPageGeneric()` for the count (`all=1&page=1`, first occurrence).
const RG = {
    url: 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f',
    shell: path.join(__dirname, 'html-fetch-transient-rg.html'),
    labelMatch: 'Artist RGs',
};

/** The check page, as MusicBrainz serves it, minus the proof-of-work script. */
const CHECK_PAGE = '<!DOCTYPE html><html><head><meta charset="utf-8">\n'
    + '<title>Verifying your browser</title>\n'
    + '</head><body><div class="box"><div class="spinner"></div>\n'
    + '<p>Verifying your browser, please wait…</p>\n'
    + '<noscript><p><b>JavaScript is required to access this page.</b></p></noscript>\n'
    + '</div></body></html>\n';

const STATUS = '#mb-global-status-display';
const STATUS_LOADED = '#mb-global-status-display > span:first-child';

/**
 * The status line, once it has read the same "Loaded …" text for three polls
 * in a row (200 ms apart): a retry or a resume changes it in between, so the
 * first "Loaded" is not yet the end. Polled in the page, so no fixed sleeps.
 *
 * @returns {Promise<string>}
 */
async function settledStatus(page, timeout = 60000) {
    await page.waitForFunction((sel) => {
        const t = (document.querySelector(sel) || {}).textContent || '';
        const w = window;
        if (!/Loaded/.test(t)) { w.__bcLast = null; w.__bcSame = 0; return false; }
        w.__bcSame = (t === w.__bcLast) ? (w.__bcSame || 0) + 1 : 0;
        w.__bcLast = t;
        return w.__bcSame >= 3;
    }, STATUS, { polling: 200, timeout });
    return page.locator(STATUS).textContent();
}

/** @returns {Promise<number>} Rendered data rows across every table. */
const renderedRows = (page) => page.evaluate(
    () => document.querySelectorAll('table.tbl tbody tr').length);

/**
 * Loads a shell and routes every `artist/**` request.
 *
 * `respond(req)` sees `{page, all, frame, ordinal}` (`frame`: the request is a
 * frame's navigation, not the script's fetch; `ordinal`: how many requests this
 * exact URL has had, frames included) and returns `'check'` for the check page,
 * or anything falsy for the shell.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{url: string, shell: string}} fx
 * @param {function(Object): ?string} respond
 * @param {Object} [opts] - `{click: selector, before: async function(page)}` (`before` runs
 *   after the load and before the click).
 * @returns {Promise<Array<{page: number, all: string, frame: boolean}>>}
 */
async function load(page, fx, respond, opts = {}) {
    const reqs = [];
    const seen = new Map();
    await loadUserscriptPage(page, { url: fx.url, fixtureFile: fx.shell, testMode: true });
    await page.route('https://musicbrainz.org/artist/**', (route) => {
        const req = route.request();
        const url = req.url();
        const u = new URL(url);
        const ordinal = (seen.get(url) || 0) + 1;
        seen.set(url, ordinal);
        let frame = false;
        try { frame = req.frame() !== page.mainFrame(); } catch (_) { /* not a frame request */ }
        const r = { page: Number(u.searchParams.get('page') || '1'), all: u.searchParams.get('all') || '', frame, ordinal };
        reqs.push(r);
        if (respond(r) === 'check') {
            return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: CHECK_PAGE });
        }
        return route.fulfill({ path: fx.shell, contentType: 'text/html' });
    });
    if (opts.before) await opts.before(page);
    await page.click(opts.click || `button[data-label="${EVENTS.label}"]`);
    return reqs;
}

test.describe('the browser check as a page answer (mbnIsCheck / mbnReverify)', () => {
    let pageErrors;

    test.beforeEach(async ({ page }) => {
        pageErrors = collectPageErrors(page);
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('B1: a check page on page 2 is passed in a frame and page 2 is asked again', async ({ page }) => {
        test.setTimeout(90000);
        // Only the script's FIRST request for page 2 gets the check; the frame
        // and every later request get the real page.
        const reqs = await load(page, EVENTS, (r) => (r.page === 2 && !r.frame && r.ordinal === 1 ? 'check' : null));

        const status = await settledStatus(page);
        expect(await renderedRows(page), 'every page\'s rows').toBe(EVENTS.rowsPerPage * EVENTS.pages);
        expect(status).toMatch(/Loaded 3 pages \(300 rows\)/);
        expect(status).not.toMatch(/INCOMPLETE/);

        const p2 = reqs.filter((r) => r.page === 2).map((r) => (r.frame ? 'frame' : 'fetch'));
        expect(p2, 'page 2: the check, the frame passing it, the retry').toEqual(['fetch', 'frame', 'fetch']);
        expect(await page.locator('iframe[data-mbn-check]').count(), 'the frame is removed').toBe(0);
    });

    test('B2: a check the frame cannot pass makes page 2 a failed page, resumable', async ({ page }) => {
        test.setTimeout(90000);
        let fixed = false;
        // The frame gives up after 600 ms instead of 20 s.
        await load(page, EVENTS, (r) => (r.page === 2 && !fixed ? 'check' : null),
            { before: (pg) => pg.evaluate(() => window.__saTest.browserCheck.timeoutMs(600)) });

        const status = await settledStatus(page);
        expect(status, 'the run reports 1 of 3 pages').toMatch(/1 of 3 pages/);
        expect(status).toMatch(/INCOMPLETE/);
        const tip = await page.locator(STATUS_LOADED).getAttribute('title');
        expect(tip, 'the tooltip names the check').toContain('verify itself');
        const st = await page.evaluate(() => window.__saTest.resumeState());
        expect(st && st.nextPage, 'the resume starts at page 2').toBe(2);
        expect(await renderedRows(page)).toBe(EVENTS.rowsPerPage);

        // Once MusicBrainz serves pages again, the resume loads the rest.
        fixed = true;
        await resumeMissingPages(page);
        const after = await settledStatus(page);
        expect(await renderedRows(page)).toBe(EVENTS.rowsPerPage * EVENTS.pages);
        expect(after).toMatch(/Loaded 3 pages \(300 rows\)/);
    });

    test('B3: a check page on the page-count request is passed, the count is read', async ({ page }) => {
        test.setTimeout(90000);
        const reqs = await load(page, RG,
            (r) => (r.all === '1' && r.page === 1 && !r.frame && r.ordinal === 1 ? 'check' : null),
            { click: `button[data-label*="${RG.labelMatch}"]` });

        const status = await settledStatus(page);
        // Unfixed, the check page was read as a one-page listing: "Loaded 1
        // page (0 rows)", no warning. The fixture's pager names 3 pages.
        expect(status, 'the count from the real page').toMatch(/Loaded 3 pages/);
        expect(status).not.toContain('of an unknown total');
        expect(status).not.toMatch(/INCOMPLETE/);
        expect(reqs.some((r) => r.frame), 'a frame passed the check').toBe(true);
    });

    test('B4: the detector knows the check page by its title or noscript, never by the beacon', async ({ page }) => {
        await loadUserscriptPage(page, { url: EVENTS.url, fixtureFile: EVENTS.shell, testMode: true });
        const r = await page.evaluate((check) => {
            const is = window.__saTest.browserCheck.isCheck;
            return {
                check: is(check),
                noscriptOnly: is('<html><body><noscript>JavaScript is required to access this page.</noscript></body></html>'),
                titleSpaced: is('<html><head><title> Verifying your browser </title></head></html>'),
                beacon: is('<html><head><title>Bruce Springsteen - MusicBrainz</title>'
                    + '<script>navigator.sendBeacon("/__meb_verify", "x")</script></head><body></body></html>'),
                plain: is('<html><head><title>Bruce Springsteen - MusicBrainz</title></head></html>'),
            };
        }, CHECK_PAGE);
        expect(r).toEqual({ check: true, noscriptOnly: true, titleSpaced: true, beacon: false, plain: false });
    });
});
