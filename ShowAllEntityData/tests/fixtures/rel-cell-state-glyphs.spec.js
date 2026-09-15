'use strict';

// Per-row load-state glyphs in the Relationships column, and click-to-load ONE
// row (PERFORMANCE.org Step 36, user decisions in org/relationships.org).
//
// ── What each test pins, and the adjacent property it must not confuse ──────
//
// The glyph is CSS generated content (`::before`/`::after`) keyed on cell and
// table attributes — never text. So every glyph assertion reads
// `getComputedStyle(td, '::before').content`, AND asserts `td.textContent` is
// empty where no icons were loaded: a text glyph would also "show the right
// symbol", but would leak into getCleanColumnText(), the icon-count sort, the
// 📊 dropdown, export and Save-to-Disk.
//
// A click must load exactly ONE row. "The row got its icon" would also pass if
// the click had expanded the whole table, so every click test counts requests
// and asserts the header toggle is still collapsed and the other rows are
// untouched.
//
// Network-free: every `**/ws/2/**` request is intercepted and counted, the
// shape `rel-column-collapse-toggle.spec.js` established.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { clickMasterToggleAndExpandAll, collectPageErrors } = require('../support/liveAssertions');
const { openSubtableTab } = require('../support/subtableTab');

// "Bruce Springsteen Studio Collection" — 12 releases, 12 distinct MBIDs,
// `tableMode: 'single'`.
const SERIES = {
    url: 'https://musicbrainz.org/series/aa3694d3-a3d0-48ed-8f07-5b576de87908',
    shell: path.join(__dirname, '..', 'snapshots', 'series-releases', 'raw.html'),
    showAllLabel: 'Show all Releases for Series',
    urlGlob: 'https://musicbrainz.org/series/**',
};
const SERIES_ROWS = 12;

// "Tougher Than the Rest" — 7 releases across 2 sub-tables (Official 6,
// Promotion 1), `tableMode: 'multi'`.
const RG = {
    url: 'https://musicbrainz.org/release-group/f83d2211-dd81-4b1e-9a02-e89733891e1c',
    shell: path.join(__dirname, '..', 'snapshots', 'releasegroup-releases', 'raw.html'),
    showAllLabel: 'Show all Releases for ReleaseGroup',
    urlGlob: 'https://musicbrainz.org/release-group/**',
};
const RG_REL_CELLS = 7;

const OK_BODY = JSON.stringify({
    relations: [{
        'target-type': 'url',
        type: 'discogs',
        url: { resource: 'https://www.discogs.com/release/1' },
    }],
});
const EMPTY_BODY = JSON.stringify({ relations: [] });

// Computed `content` values, exactly as Chromium reports them (quoted). The
// two emoji carry U+FE0E so they render as monochrome text glyphs — the same
// treatment the ▶🔗 header toggle's glyph gets.
const G = {
    notLoaded: '"🔗︎"',
    queued: '"⋯"',
    loading: '"◌"',
    none: '"–"',
    failed: '"⚠︎"',
    reload: '"⟳"',
};
const NO_CONTENT = ['none', 'normal'];

/**
 * Loads a shell with the Relationships column enabled, routes every WS/2
 * request through `respond`, and clicks "Show all".
 *
 * @param {import('@playwright/test').Page} page
 * @param {{url: string, shell: string, showAllLabel: string, urlGlob: string,
 *          settings?: Object<string, *>,
 *          respond?: function(string): ?{status?: number, body?: string, delayMs?: number}}} opts
 * @returns {Promise<string[]>} The live list of intercepted WS/2 URLs.
 */
async function loadRelPage(page, { url, shell, showAllLabel, urlGlob, settings, respond }) {
    const ws2 = [];
    await loadUserscriptPage(page, {
        url,
        fixtureFile: shell,
        testMode: true,
        settingsOverride: { sa_enable_relationships_column: true, ...(settings || {}) },
    });
    await page.route('**/ws/2/**', async (route) => {
        const reqUrl = route.request().url();
        ws2.push(reqUrl);
        const r = (respond && respond(reqUrl)) || {};
        try {
            if (r.delayMs) await new Promise((res) => setTimeout(res, r.delayMs));
            if (r.status && r.status !== 200) {
                await route.fulfill({ status: r.status, contentType: 'text/plain', body: 'Service Unavailable' });
            } else {
                await route.fulfill({ status: 200, contentType: 'application/json', body: r.body || OK_BODY });
            }
        } catch (_) {
            // The page may already be closed when a delayed answer lands.
        }
    });
    await page.route(urlGlob, (route) => route.fulfill({ path: shell, contentType: 'text/html' }));
    await page.click(`button[data-label="${showAllLabel}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
    return ws2;
}

/** @returns {Promise<string[]>} Rel-cell MBIDs in document order. */
const rowMbids = (page) => page.evaluate(() => Array.from(
    document.querySelectorAll('table.tbl tbody td.mb-rel-cell[data-mbid]')).map((td) => td.dataset.mbid));

/**
 * Everything a test asserts about one cell, read in one pass.
 *
 * @returns {Promise<?{before: string, after: string, text: string, anchors: number,
 *                     done: boolean, loading: boolean, error: ?string}>}
 */
const cellState = (page, mbid) => page.evaluate((m) => {
    const td = document.querySelector(`table.tbl tbody td.mb-rel-cell[data-mbid="${m}"]`);
    if (!td) return null;
    return {
        before: getComputedStyle(td, '::before').content,
        after: getComputedStyle(td, '::after').content,
        text: td.textContent,
        anchors: td.querySelectorAll('a').length,
        done: td.dataset.relDone === '1',
        loading: td.dataset.relLoading !== undefined,
        error: td.dataset.relError || null,
    };
}, mbid);

/** @returns {import('@playwright/test').Locator} */
const relCell = (page, mbid) => page.locator(`table.tbl tbody td.mb-rel-cell[data-mbid="${mbid}"]`);

/**
 * Clicks a cell at its right edge — the empty area where the hover ⟳ sits —
 * so a click on a LOADED cell cannot land on one of its icon links.
 */
async function clickCellEdge(page, mbid) {
    const loc = relCell(page, mbid);
    const box = await loc.boundingBox();
    await loc.click({ position: { x: Math.max(1, box.width - 3), y: Math.floor(box.height / 2) } });
}

const hits = (ws2, mbid) => ws2.filter((u) => u.includes(mbid)).length;
const toggle = 'thead .mb-rel-col-hdr-btn';

test.describe('Relationships column: per-row load-state glyphs and click-to-load', () => {
    let pageErrors;

    test.beforeEach(async ({ page }) => {
        pageErrors = collectPageErrors(page);
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('collapsed: every fetchable cell shows the not-loaded glyph, as CSS only', async ({ page }) => {
        const ws2 = await loadRelPage(page, { ...SERIES, settings: { sa_rel_collapse_threshold: 2 } });
        const mbids = await rowMbids(page);
        expect(mbids).toHaveLength(SERIES_ROWS);
        for (const m of mbids) {
            const s = await cellState(page, m);
            expect(s.before, `glyph for ${m}`).toBe(G.notLoaded);
            expect(s.text, 'the glyph is generated content, never text').toBe('');
        }
        expect(ws2).toHaveLength(0);
    });

    test('clicking one cell loads ONLY that row; the table stays collapsed; a filter keeps it',
        async ({ page }) => {
            const ws2 = await loadRelPage(page, { ...SERIES, settings: { sa_rel_collapse_threshold: 2 } });
            const mbids = await rowMbids(page);
            const target = mbids[3];

            await clickCellEdge(page, target);
            await expect.poll(async () => (await cellState(page, target)).anchors, { timeout: 15000 }).toBe(1);

            expect(ws2, 'exactly one request, for the clicked row').toHaveLength(1);
            expect(hits(ws2, target)).toBe(1);
            await expect(page.locator(toggle)).toHaveAttribute('aria-pressed', 'false');
            expect((await page.evaluate(() => window.__saTest.relTableStates()))[0].expanded).toBe(false);

            const loaded = await cellState(page, target);
            expect(loaded.done).toBe(true);
            expect(NO_CONTENT, 'a cell with icons shows no state glyph').toContain(loaded.before);
            for (const m of mbids.filter((x) => x !== target)) {
                const s = await cellState(page, m);
                expect(s.before, `untouched row ${m}`).toBe(G.notLoaded);
                expect(s.anchors).toBe(0);
            }

            // Hover ⟳ only on a loaded cell, and only while hovered.
            await page.mouse.move(0, 0);
            expect(NO_CONTENT).toContain((await cellState(page, target)).after);
            await relCell(page, target).hover();
            expect((await cellState(page, target)).after).toBe(G.reload);
            await relCell(page, mbids[4]).hover();
            expect(NO_CONTENT, 'no ⟳ on a row that is not loaded').toContain((await cellState(page, mbids[4])).after);

            // A re-render must neither drop the hand-loaded icon nor fetch.
            await page.fill('#mb-global-filter-input', 'Born');
            await page.waitForTimeout(1500);
            await page.fill('#mb-global-filter-input', '');
            await expect.poll(async () => (await rowMbids(page)).length, { timeout: 15000 }).toBe(SERIES_ROWS);
            await page.waitForTimeout(1500);
            expect((await cellState(page, target)).anchors).toBe(1);
            expect(ws2).toHaveLength(1);
        });

    test('a row with no relationships shows the dash; a failed row shows ⚠︎ and a click retries it',
        async ({ page }) => {
            let failing = true;
            let emptyMbid = null;
            let failMbid = null;
            const ws2 = await loadRelPage(page, {
                ...SERIES,
                settings: { sa_rel_collapse_threshold: 2 },
                respond: (u) => {
                    if (emptyMbid && u.includes(emptyMbid)) return { body: EMPTY_BODY };
                    if (failing && failMbid && u.includes(failMbid)) return { status: 503 };
                    return null;
                },
            });
            const mbids = await rowMbids(page);
            [emptyMbid, failMbid] = [mbids[0], mbids[1]];

            await clickCellEdge(page, emptyMbid);
            await expect.poll(async () => (await cellState(page, emptyMbid)).done, { timeout: 15000 }).toBe(true);
            const none = await cellState(page, emptyMbid);
            expect(none.before).toBe(G.none);
            expect(none.text).toBe('');

            await clickCellEdge(page, failMbid);
            await expect.poll(async () => (await cellState(page, failMbid)).error, { timeout: 30000 })
                .toContain('503');
            const failed = await cellState(page, failMbid);
            expect(failed.before).toBe(G.failed);
            expect(failed.done).toBe(false);
            expect(failed.loading).toBe(false);
            const failHits = hits(ws2, failMbid);
            expect(failHits, 'retried before being called a failure').toBeGreaterThan(1);

            failing = false;
            await clickCellEdge(page, failMbid);
            await expect.poll(async () => (await cellState(page, failMbid)).anchors, { timeout: 15000 }).toBe(1);
            const recovered = await cellState(page, failMbid);
            expect(recovered.error).toBeNull();
            expect(NO_CONTENT).toContain(recovered.before);
            expect(hits(ws2, failMbid)).toBe(failHits + 1);
        });

    test('⟳ reload re-requests exactly that row, bypassing the cache, without doubling icons',
        async ({ page }) => {
            const ws2 = await loadRelPage(page, { ...SERIES, settings: { sa_rel_collapse_threshold: 2 } });
            const target = (await rowMbids(page))[5];

            await clickCellEdge(page, target);
            await expect.poll(async () => (await cellState(page, target)).anchors, { timeout: 15000 }).toBe(1);
            expect(hits(ws2, target)).toBe(1);

            await clickCellEdge(page, target);
            await expect.poll(() => hits(ws2, target), { timeout: 15000 }).toBe(2);
            await expect.poll(async () => (await cellState(page, target)).loading, { timeout: 15000 }).toBe(false);
            const reloaded = await cellState(page, target);
            expect(reloaded.anchors, 'reload replaces, never appends').toBe(1);
            expect(reloaded.done).toBe(true);
            expect(ws2).toHaveLength(2);
        });

    test('clicking one of the row\'s icon links does not reload the row', async ({ page }) => {
        const ws2 = await loadRelPage(page, { ...SERIES, settings: { sa_rel_collapse_threshold: 2 } });
        const target = (await rowMbids(page))[2];
        await clickCellEdge(page, target);
        await expect.poll(async () => (await cellState(page, target)).anchors, { timeout: 15000 }).toBe(1);

        // preventDefault on the anchor itself stops the new tab without
        // stopping propagation, so the table's delegate still sees this click
        // and must ignore it because it came from inside a link.
        await page.evaluate((m) => {
            const a = document.querySelector(`td.mb-rel-cell[data-mbid="${m}"] a`);
            a.addEventListener('click', (e) => e.preventDefault(), { once: true });
            a.querySelector('img').click();
        }, target);
        await page.waitForTimeout(2500);
        expect(hits(ws2, target)).toBe(1);
    });

    test('collapsing while a hand-loaded row is still in flight drops the late answer',
        async ({ page }) => {
            let slowMbid = null;
            const ws2 = await loadRelPage(page, {
                ...SERIES,
                settings: { sa_rel_collapse_threshold: 2 },
                respond: (u) => (slowMbid && u.includes(slowMbid) ? { delayMs: 3500 } : null),
            });
            slowMbid = (await rowMbids(page))[2];

            await clickCellEdge(page, slowMbid);
            await expect.poll(async () => (await cellState(page, slowMbid)).before, { timeout: 5000 })
                .toBe(G.loading);

            // Expand then collapse straight away: the collapse is what the
            // late answer must respect.
            await page.click(toggle);
            await page.click(toggle);
            await expect(page.locator(toggle)).toHaveAttribute('aria-pressed', 'false');

            await page.waitForTimeout(5000);                 // the delayed answer has landed
            const after = await cellState(page, slowMbid);
            expect(after.anchors, 'an emptied column must not be refilled by a late answer').toBe(0);
            expect(after.done).toBe(false);
            expect(after.loading).toBe(false);
            expect(after.before).toBe(G.notLoaded);
            expect(hits(ws2, slowMbid)).toBe(1);
        });

    test('multi-table: a row loaded by hand in a collapsed sub-table survives a re-render',
        async ({ page }) => {
            // renderGroupedTable() always clones from the master rows, so the
            // hand-loaded content must be mirrored onto them or the next
            // keystroke brings back the glyph.
            const ws2 = await loadRelPage(page, { ...RG, settings: { sa_rel_collapse_threshold: 3 } });
            await clickMasterToggleAndExpandAll(page);
            // The 1-entity Promotion table is expanded and fetched its one row.
            await expect.poll(() => ws2.length, { timeout: 15000 }).toBe(1);

            const collapsedMbids = await page.evaluate(() => {
                const t = Array.from(document.querySelectorAll('table.tbl'))
                    .find((x) => x.dataset.mbRelExpanded === '0');
                return Array.from(t.querySelectorAll('tbody td.mb-rel-cell[data-mbid]')).map((td) => td.dataset.mbid);
            });
            expect(collapsedMbids).toHaveLength(6);
            const target = collapsedMbids[0];

            await clickCellEdge(page, target);
            await expect.poll(async () => (await cellState(page, target)).anchors, { timeout: 15000 }).toBe(1);
            expect(ws2).toHaveLength(2);

            await page.fill('#mb-global-filter-input', 'Tunnel');
            await page.waitForTimeout(1500);
            await page.fill('#mb-global-filter-input', '');
            await expect.poll(() => page.evaluate(
                () => document.querySelectorAll('table.tbl tbody td.mb-rel-cell').length), { timeout: 15000 })
                .toBe(RG_REL_CELLS);
            await page.waitForTimeout(1500);

            const after = await cellState(page, target);
            expect(after.anchors, 'the re-rendered clone keeps the hand-loaded icon').toBe(1);
            expect(after.done).toBe(true);
            const states = await page.evaluate(() => window.__saTest.relTableStates());
            expect(states.map((s) => s.expanded)).toEqual([false, true]);
            expect(ws2).toHaveLength(2);
        });

    test('with sa_rel_cell_state_glyphs off there is no glyph and a click does nothing',
        async ({ page }) => {
            const ws2 = await loadRelPage(page, {
                ...SERIES,
                settings: { sa_rel_collapse_threshold: 2, sa_rel_cell_state_glyphs: false },
            });
            const target = (await rowMbids(page))[0];
            expect(NO_CONTENT).toContain((await cellState(page, target)).before);
            await clickCellEdge(page, target);
            await page.waitForTimeout(2500);
            expect(ws2).toHaveLength(0);
        });

    test('expanded: a queued row shows ⋯, and clicking it fetches it ahead of the queue',
        async ({ page }) => {
            // Threshold 0 = never collapse, so the throttled queue starts at
            // render and needs ~13 s for 12 entities.
            const ws2 = await loadRelPage(page, { ...SERIES, settings: { sa_rel_collapse_threshold: 0 } });
            const mbids = await rowMbids(page);
            const last = mbids[mbids.length - 1];

            expect((await cellState(page, last)).before).toBe(G.queued);
            await clickCellEdge(page, last);
            await expect.poll(() => hits(ws2, last), { timeout: 6000 }).toBe(1);
            const position = ws2.findIndex((u) => u.includes(last));
            expect(position, `the clicked row was request #${position + 1}, not left for last`)
                .toBeLessThan(SERIES_ROWS - 2);

            await expect.poll(async () => (await page.evaluate(() => window.__saTest.relTableStates()))[0].pending,
                { timeout: 40000 }).toBe(0);
            expect(ws2, 'the queue skipped the row the click had already answered').toHaveLength(SERIES_ROWS);
            expect(new Set(ws2).size).toBe(SERIES_ROWS);
        });

    test('a sub-table carrying only hand-loaded rows reopens COLLAPSED, and fetches nothing',
        async ({ page }) => {
            // `_relTableExpanded()` used to read ANY relDone cell in a restored
            // table as "restored from a snapshot — start expanded", so a table
            // with one row loaded by hand would open in its own tab expanded and
            // immediately queue a fetch of every other row. Partial restored
            // data now falls through to the threshold instead.
            //
            // Driven through the real cross-tab handoff (tests/support/
            // subtableTab.js), so routes live on the CONTEXT: the popup
            // navigates before a page-level route could attach.
            const context = page.context();
            const ws2 = [];
            await context.route('**/ws/2/**', (route) => {
                ws2.push(route.request().url());
                return route.fulfill({ status: 200, contentType: 'application/json', body: OK_BODY });
            });
            await context.route(`${RG.url}**`,
                (route) => route.fulfill({ path: RG.shell, contentType: 'text/html' }));
            await loadUserscriptPage(page, {
                url: RG.url,
                fixtureFile: RG.shell,
                testMode: true,
                settingsOverride: {
                    sa_enable_relationships_column: true,
                    sa_rel_collapse_threshold: 3,
                    sa_enable_show_single_table_btn: true,
                },
            });
            await page.click(`button[data-label="${RG.showAllLabel}"]`);
            await waitForRenderComplete(page, { waitForAutoResize: false });
            await clickMasterToggleAndExpandAll(page);
            // The 1-entity Promotion table is expanded and fetched its one row.
            await expect.poll(() => ws2.length, { timeout: 15000 }).toBe(1);

            const official = await page.evaluate(() => {
                const t = Array.from(document.querySelectorAll('table.tbl'))
                    .find((x) => x.dataset.mbRelExpanded === '0');
                return Array.from(t.querySelectorAll('tbody td.mb-rel-cell[data-mbid]')).map((td) => td.dataset.mbid);
            });
            expect(official).toHaveLength(6);
            await clickCellEdge(page, official[0]);
            await expect.poll(async () => (await cellState(page, official[0])).anchors, { timeout: 15000 }).toBe(1);
            expect(ws2).toHaveLength(2);

            const { tab } = await openSubtableTab(page, { categoryName: 'Official' });
            await tab.waitForTimeout(3500);                  // room for a queued fetch to start
            const inTab = await tab.evaluate((m) => {
                const td = document.querySelector(`table.tbl tbody td.mb-rel-cell[data-mbid="${m}"]`);
                return {
                    states: window.__saTest.relTableStates(),
                    loadedAnchors: td ? td.querySelectorAll('a').length : null,
                };
            }, official[0]);
            expect(inTab.states).toEqual([{ uniqueMbids: 6, expanded: false, pending: 5 }]);
            expect(inTab.loadedAnchors, 'the hand-loaded row arrives with its icon').toBe(1);
            expect(ws2, 'reopening the snapshot fetched nothing').toHaveLength(2);
        });

    test('a row hidden by the filter while its answer is in flight still gets its icon',
        async ({ page }) => {
            // With the row filtered out, there is no LIVE cell to render into
            // when the answer lands — only the master row, which still carries
            // the click's token. `_relWriteResult()` must render into that
            // master rather than mirror an empty innerHTML over it, or the row
            // comes back marked done with no icon when the filter is cleared.
            //
            // The answer is delayed, and the test asserts the row was hidden
            // well before it could land; otherwise this would pass trivially by
            // answering while the row was still on screen.
            const DELAY_MS = 6000;
            let slowMbid = null;
            const ws2 = await loadRelPage(page, {
                ...SERIES,
                settings: { sa_rel_collapse_threshold: 2 },
                respond: (u) => (slowMbid && u.includes(slowMbid) ? { delayMs: DELAY_MS } : null),
            });
            slowMbid = (await rowMbids(page))[1];

            const clickedAt = Date.now();
            await clickCellEdge(page, slowMbid);
            await expect.poll(async () => (await cellState(page, slowMbid)).loading, { timeout: 3000 }).toBe(true);

            await page.fill('#mb-global-filter-input', 'zzzz-matches-no-row');
            await expect.poll(async () => (await rowMbids(page)).length, { timeout: 10000 }).toBe(0);
            expect(Date.now() - clickedAt, 'the row was hidden before its answer could land')
                .toBeLessThan(DELAY_MS - 1000);

            await page.waitForTimeout(Math.max(0, DELAY_MS + 1500 - (Date.now() - clickedAt)));
            await page.fill('#mb-global-filter-input', '');
            await expect.poll(async () => (await rowMbids(page)).length, { timeout: 15000 }).toBe(SERIES_ROWS);

            const after = await cellState(page, slowMbid);
            expect(after.anchors, 'the answer reached the row even though it was hidden').toBe(1);
            expect(after.done).toBe(true);
            expect(after.loading).toBe(false);
            expect(hits(ws2, slowMbid)).toBe(1);
        });
});
