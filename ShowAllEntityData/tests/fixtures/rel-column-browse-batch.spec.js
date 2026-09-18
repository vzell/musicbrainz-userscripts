'use strict';

// Relationships column: the WS/2 BROWSE bulk source (PERFORMANCE.org Step 36).
//
// ── What each test pins ─────────────────────────────────────────────────────
//
// The point of the feature is a REQUEST COUNT. "Every row got its icon" would
// pass just as well with one lookup per row, so every test here counts BROWSE
// requests (`/ws/2/<entity>?<param>=…`) and single LOOKUPS
// (`/ws/2/<entity>/<mbid>`) separately and asserts both.
//
// The cost rule has two stop conditions, and each gets a test that the OTHER
// condition alone would fail:
//   - pages left ≥ MBIDs still pending — a huge catalogue is not browsed to
//     find three rows ("the page-count rule");
//   - a page that matched nothing pending — rows the browse set can never
//     contain (a "Various Artists" view, say) end browsing after one page even
//     when the page count alone would say "keep going" ("the zero-match rule").
//
// Page: releasegroup-releases for "Tougher Than the Rest" — two sub-tables,
// Official (6 releases) and Promotion (1). Threshold 3, so Official starts
// collapsed and Promotion expanded. Promotion's single pending row is cheaper
// as one lookup than as a browse page, so every test starts from exactly one
// lookup at render.
//
// Network-free: every `**/ws/2/**` request is intercepted, classified and
// answered here.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { clickMasterToggleAndExpandAll, collectPageErrors } = require('../support/liveAssertions');

const RG_MBID = 'f83d2211-dd81-4b1e-9a02-e89733891e1c';
const RG = {
    url: `https://musicbrainz.org/release-group/${RG_MBID}`,
    shell: path.join(__dirname, '..', 'snapshots', 'releasegroup-releases', 'raw.html'),
    showAllLabel: 'Show all Releases for ReleaseGroup',
    urlGlob: 'https://musicbrainz.org/release-group/**',
};

/** One discogs url-rel, so one icon per answered row. */
const discogs = (id) => ({
    'target-type': 'url',
    type: 'discogs',
    url: { resource: `https://www.discogs.com/release/${id}` },
});
const LOOKUP_BODY = JSON.stringify({ relations: [discogs('lookup')] });

/** MBIDs that are on no page — browse filler that must match nothing. */
const STRANGERS = Array.from({ length: 100 },
    (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);

/**
 * A browse response page in WS/2's own shape.
 *
 * @param {string[]} ids    Entities on this page.
 * @param {number}   [total] `release-count` — the catalogue size, not the page size.
 * @returns {string}
 */
const browseBody = (ids, total) => JSON.stringify({
    'release-count': total === undefined ? ids.length : total,
    'release-offset': 0,
    releases: ids.map((id) => ({ id, relations: [discogs(id)] })),
});

/**
 * @param {string} u
 * @returns {'browse'|'lookup'|'other'}
 */
function classify(u) {
    const { pathname } = new URL(u);
    if (/^\/ws\/2\/[a-z-]+$/.test(pathname)) return 'browse';
    if (/^\/ws\/2\/[a-z-]+\/[0-9a-f-]{36}$/.test(pathname)) return 'lookup';
    return 'other';
}

/**
 * Loads the releasegroup-releases shell, routes WS/2 through `browse`/`lookup`
 * handlers, clicks "Show all" and expands every sub-section.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{settings?: Object<string, *>,
 *          browse?: function(URL): ?{status?: number, body?: string},
 *          lookup?: function(URL): ?{status?: number, body?: string}}} [opts]
 * @returns {Promise<Array<{kind: string, url: string}>>} Live request log.
 */
async function loadRgPage(page, { settings, browse, lookup } = {}) {
    const reqs = [];
    await loadUserscriptPage(page, {
        url: RG.url,
        fixtureFile: RG.shell,
        testMode: true,
        settingsOverride: {
            sa_enable_relationships_column: true,
            sa_rel_collapse_threshold: 3,
            ...(settings || {}),
        },
    });
    await page.route('**/ws/2/**', (route) => {
        const u = route.request().url();
        const kind = classify(u);
        reqs.push({ kind, url: u });
        const handler = kind === 'browse' ? browse : lookup;
        const r = (handler && handler(new URL(u))) || {};
        if (r.status && r.status !== 200) {
            return route.fulfill({ status: r.status, contentType: 'text/plain', body: 'Service Unavailable' });
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: r.body || LOOKUP_BODY });
    });
    await page.route(RG.urlGlob, (route) => route.fulfill({ path: RG.shell, contentType: 'text/html' }));
    await page.click(`button[data-label="${RG.showAllLabel}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
    await clickMasterToggleAndExpandAll(page);
    return reqs;
}

const count = (reqs, kind) => reqs.filter((r) => r.kind === kind).length;

/** MBIDs in the collapsed (Official) sub-table. */
const collapsedMbids = (page) => page.evaluate(() => {
    const t = Array.from(document.querySelectorAll('table.tbl')).find((x) => x.dataset.mbRelExpanded === '0');
    return t ? Array.from(t.querySelectorAll('tbody td.mb-rel-cell[data-mbid]')).map((td) => td.dataset.mbid) : [];
});

/** mbid → icon count, across every table. */
const anchorsByMbid = (page) => page.evaluate(() => Object.fromEntries(
    Array.from(document.querySelectorAll('table.tbl tbody td.mb-rel-cell[data-mbid]'))
        .map((td) => [td.dataset.mbid, td.querySelectorAll('a').length])));

/** Cells not yet done, across every table. */
const pendingTotal = (page) => page.evaluate(
    () => window.__saTest.relTableStates().reduce((n, t) => n + t.pending, 0));

/** Presses ▶🔗 on the collapsed sub-table. */
const expandCollapsed = (page) =>
    page.locator('table.tbl[data-mb-rel-expanded="0"] thead .mb-rel-col-hdr-btn').first().click();

test.describe('Relationships column: browse endpoint as a bulk source', () => {
    let pageErrors;

    test.beforeEach(async ({ page }) => {
        pageErrors = collectPageErrors(page);
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('expanding a sub-table fetches it in ONE browse request, asking for the lookup inc set',
        async ({ page }) => {
            let official = [];
            const reqs = await loadRgPage(page, { browse: () => ({ body: browseBody(official) }) });
            await expect.poll(() => count(reqs, 'lookup'), { timeout: 15000 }).toBe(1);
            official = await collapsedMbids(page);
            expect(official).toHaveLength(6);

            await expandCollapsed(page);
            await expect.poll(() => pendingTotal(page), { timeout: 20000 }).toBe(0);

            expect(count(reqs, 'browse'), 'one browse request').toBe(1);
            expect(count(reqs, 'lookup'), 'no lookup for any browsed row').toBe(1);
            const b = new URL(reqs.find((r) => r.kind === 'browse').url);
            expect(b.pathname).toBe('/ws/2/release');
            expect(b.searchParams.get('release-group')).toBe(RG_MBID);
            // Parity with _relIncOptionsForEntityType('release'): a browse
            // record is cached under the lookup's own key, so a thinner inc
            // would be served as complete for the whole TTL.
            expect(b.search).toContain('inc=url-rels&');
            expect(b.searchParams.get('limit')).toBe('100');

            const anchors = await anchorsByMbid(page);
            for (const m of official) expect(anchors[m], `icon for ${m}`).toBe(1);
        });

    test('rows the browse page does not contain fall back to exactly one lookup each',
        async ({ page }) => {
            let official = [];
            const reqs = await loadRgPage(page, { browse: () => ({ body: browseBody(official.slice(0, 4)) }) });
            await expect.poll(() => count(reqs, 'lookup'), { timeout: 15000 }).toBe(1);
            official = await collapsedMbids(page);

            await expandCollapsed(page);
            await expect.poll(() => pendingTotal(page), { timeout: 20000 }).toBe(0);

            expect(count(reqs, 'browse')).toBe(1);
            expect(count(reqs, 'lookup'), '1 at render + the 2 rows browse did not cover').toBe(3);
            const looked = reqs.filter((r) => r.kind === 'lookup').map((r) => r.url);
            for (const m of official.slice(4)) {
                expect(looked.some((u) => u.includes(m)), `lookup for uncovered ${m}`).toBe(true);
            }
            const anchors = await anchorsByMbid(page);
            for (const m of official) expect(anchors[m], `icon for ${m}`).toBe(1);
        });

    test('the zero-match rule: a page that matches nothing ends browsing, even with pages to spare',
        async ({ page }) => {
            // release-count 300 → 2 pages left, fewer than the 6 pending rows,
            // so the page-count rule alone would fetch page 2. A page that
            // matched nothing is evidence the rows are not in this browse set.
            const reqs = await loadRgPage(page, { browse: () => ({ body: browseBody(STRANGERS, 300) }) });
            await expect.poll(() => count(reqs, 'lookup'), { timeout: 15000 }).toBe(1);

            await expandCollapsed(page);
            await expect.poll(() => pendingTotal(page), { timeout: 30000 }).toBe(0);

            expect(count(reqs, 'browse'), 'one fruitless page, then stop').toBe(1);
            expect(count(reqs, 'lookup'), '1 at render + all 6 rows').toBe(7);
        });

    test('the page-count rule: a huge catalogue is not browsed to find a few rows',
        async ({ page }) => {
            // Page 1 matches 3 of the 6, so the zero-match rule alone would keep
            // going — through 49 more pages of a 5 000-release catalogue — for
            // 3 rows that 3 lookups can answer.
            let official = [];
            const reqs = await loadRgPage(page, {
                browse: () => ({ body: browseBody([...official.slice(0, 3), ...STRANGERS.slice(0, 97)], 5000) }),
            });
            await expect.poll(() => count(reqs, 'lookup'), { timeout: 15000 }).toBe(1);
            official = await collapsedMbids(page);

            await expandCollapsed(page);
            await expect.poll(() => pendingTotal(page), { timeout: 30000 }).toBe(0);

            expect(count(reqs, 'browse')).toBe(1);
            expect(count(reqs, 'lookup'), '1 at render + the 3 rows page 1 did not cover').toBe(4);
        });

    test('browse answers are cached under the lookup key: re-expanding and reopening cost nothing',
        async ({ page }) => {
            let official = [];
            const reqs = await loadRgPage(page, { browse: () => ({ body: browseBody(official) }) });
            await expect.poll(() => count(reqs, 'lookup'), { timeout: 15000 }).toBe(1);
            official = await collapsedMbids(page);
            await expandCollapsed(page);
            await expect.poll(() => pendingTotal(page), { timeout: 20000 }).toBe(0);
            // Without this the rest of the test would pass on per-row lookups
            // alone — they fill IndexedDB too — and prove nothing about browse.
            expect(count(reqs, 'browse'), 'the sub-table really was browsed').toBe(1);
            expect(count(reqs, 'lookup')).toBe(1);
            const settled = reqs.length;

            // L1: collapse and re-expand the browsed sub-table.
            const officialToggle = page.locator('table.tbl thead .mb-rel-col-hdr-btn').first();
            await officialToggle.click();
            await expect.poll(async () => (await anchorsByMbid(page))[official[0]], { timeout: 10000 }).toBe(0);
            await officialToggle.click();
            await expect.poll(() => pendingTotal(page), { timeout: 15000 }).toBe(0);
            expect(reqs, 'the L1 cache served the re-expand').toHaveLength(settled);

            // L2: a fresh page in the same browser context shares IndexedDB,
            // and Phase 1 reads it by the LOOKUP key — so any hit here proves
            // the browse answer was stored under that key.
            const page2 = await page.context().newPage();
            const reqs2 = await loadRgPage(page2, { browse: () => ({ body: browseBody(official) }) });
            await page2.locator('table.tbl[data-mb-rel-expanded="0"] thead .mb-rel-col-hdr-btn').first().click();
            await expect.poll(() => pendingTotal(page2), { timeout: 20000 }).toBe(0);
            expect(reqs2, 'IndexedDB served every row, browsed or looked up').toHaveLength(0);
            const anchors2 = await anchorsByMbid(page2);
            for (const m of official) expect(anchors2[m], `icon for ${m} from IndexedDB`).toBe(1);
            await page2.close();
        });

    test('with IndexedDB off, re-expanding a browsed sub-table is served from memory, not re-browsed',
        async ({ page }) => {
            // Browse answers go into L1 as well as IndexedDB. The browse phase
            // used to ignore L1: with IndexedDB off (or a failed write), a
            // re-expand missed Phase 1 and fetched the whole page again although
            // every answer was already in memory. Found when a mutation meant to
            // fail the fresh-page IndexedDB assertion in the cache test failed its
            // L1 assertion instead (DEBUG-NOTES.md, 2026-09-15).
            let official = [];
            const reqs = await loadRgPage(page, {
                settings: { sa_rels_idb_enable: false },
                browse: () => ({ body: browseBody(official) }),
            });
            await expect.poll(() => count(reqs, 'lookup'), { timeout: 15000 }).toBe(1);
            official = await collapsedMbids(page);
            await expandCollapsed(page);
            await expect.poll(() => pendingTotal(page), { timeout: 20000 }).toBe(0);
            expect(count(reqs, 'browse'), 'the sub-table was browsed once').toBe(1);
            const settled = reqs.length;

            const officialToggle = page.locator('table.tbl thead .mb-rel-col-hdr-btn').first();
            await officialToggle.click();
            await expect.poll(async () => (await anchorsByMbid(page))[official[0]], { timeout: 10000 }).toBe(0);
            await officialToggle.click();
            await expect.poll(() => pendingTotal(page), { timeout: 15000 }).toBe(0);
            await page.waitForTimeout(1500);                 // room for a stray browse or lookup

            expect(reqs, 'no second browse page and no lookups: memory served the re-expand')
                .toHaveLength(settled);
            const anchors = await anchorsByMbid(page);
            for (const m of official) expect(anchors[m], `icon for ${m} from memory`).toBe(1);
        });

    test('with sa_rel_browse_batch_enable off, the column only ever issues lookups',
        async ({ page }) => {
            const reqs = await loadRgPage(page, {
                settings: { sa_rel_browse_batch_enable: false },
                browse: () => ({ body: browseBody(STRANGERS) }),
            });
            await expect.poll(() => count(reqs, 'lookup'), { timeout: 15000 }).toBe(1);
            await expandCollapsed(page);
            await expect.poll(() => pendingTotal(page), { timeout: 30000 }).toBe(0);
            expect(count(reqs, 'browse')).toBe(0);
            expect(count(reqs, 'lookup')).toBe(7);
        });

    test('a browse page that keeps failing is retried, then the rows fall back to lookups',
        async ({ page }) => {
            const reqs = await loadRgPage(page, { browse: () => ({ status: 503 }) });
            await expect.poll(() => count(reqs, 'lookup'), { timeout: 15000 }).toBe(1);
            await expandCollapsed(page);
            await expect.poll(() => pendingTotal(page), { timeout: 40000 }).toBe(0);
            expect(count(reqs, 'browse'), 'the browse page was retried before giving up').toBeGreaterThan(1);
            expect(count(reqs, 'lookup'), '1 at render + all 6 rows').toBe(7);
            const anchors = await anchorsByMbid(page);
            expect(Object.values(anchors).every((n) => n === 1), 'every row still got its icon').toBe(true);
        });
});
