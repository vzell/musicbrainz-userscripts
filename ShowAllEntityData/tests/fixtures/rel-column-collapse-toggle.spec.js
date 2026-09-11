'use strict';

// The injected "Relationships" column ships COLLAPSED on a table whose
// distinct-entity count exceeds `sa_rel_collapse_threshold`, and loads on
// demand from a per-table ▶🔗/▼🔗 header toggle.
//
// ── What each guarantee here actually pins, and why it is that one ───────────
//
// The point of this feature is NETWORK, not DOM: the column issues one WS/2
// request per distinct entity, strictly serialised 1100 ms apart, so a
// 2 301-row release listing costs roughly 42 minutes of background fetching
// that starts before the user has scrolled. So the headline assertion is a
// REQUEST COUNT, not a timing and not an element count — "the icons are
// absent" would also pass if they were merely slow, and "the icons arrive"
// would also pass if the column had never been deferred at all.
//
// Every request is intercepted, so this spec is network-free and the counts
// are exact rather than approximate. `page.route()` is registered AFTER the
// page load and BEFORE the "Show all" click, the shape
// `search-recordings-continuation.spec.js` established.
//
// Deliberately NOT using `loadFromDiskFixture()`: the Load-from-Disk dialog is
// `position: fixed` with `max-height: calc(100vh - 40px)` and no `top`, so at
// the 1280×720 project viewport its `#sa-render-no-filter-confirm` button can
// land below the fold and Playwright cannot click it — measured at viewport
// y≈1051. That is a PRE-EXISTING harness fragility (it flakes
// `picard-cells-survive-rerender.spec.js` too, on `main`, roughly one run in
// three) and is not this feature's business; the "Show all" + routed-fetch
// path avoids the dialog entirely.
//
// The two shells are chosen for their table modes, since the state is
// per-`<table>`: `series-releases` is `tableMode: 'single'`, and
// `releasegroup-releases` is `'multi'` with two sub-tables of DIFFERENT sizes,
// which is what makes "the threshold is decided per table" falsifiable rather
// than merely stated.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { clickMasterToggleAndExpandAll, collectPageErrors } = require('../support/liveAssertions');

// "Bruce Springsteen Studio Collection" — 12 releases, one sub-table.
const SERIES_URL = 'https://musicbrainz.org/series/aa3694d3-a3d0-48ed-8f07-5b576de87908';
const SERIES_SHELL = path.join(__dirname, '..', 'snapshots', 'series-releases', 'raw.html');
const SERIES_ROWS = 12;

// "Tougher Than the Rest" — 7 releases across 2 sub-tables (Official 6,
// Promotion 1). The asymmetry is the point: with the threshold at 3, the
// 6-entity table must collapse and the 1-entity table must not.
const RG_URL = 'https://musicbrainz.org/release-group/f83d2211-dd81-4b1e-9a02-e89733891e1c';
const RG_SHELL = path.join(__dirname, '..', 'snapshots', 'releasegroup-releases', 'raw.html');

// One url-rel per entity, so "how many icons" and "how many entities were
// looked up" are the same number and a partial fetch cannot look complete.
const WS2_BODY = JSON.stringify({
    relations: [{
        'target-type': 'url',
        type: 'discogs',
        url: { resource: 'https://www.discogs.com/release/1' },
    }],
});

/**
 * Loads a shell, routes every WS/2 request into `ws2Urls`, and clicks
 * "Show all".
 *
 * `sa_enable_relationships_column: true` is required: `loadPage.js`'s
 * `FIXTURE_SETTINGS_OVERRIDE` forces the column OFF for every fixture spec, so
 * without this the whole subject of this file is absent.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{url: string, shell: string, showAllLabel: string, urlGlob: string,
 *          settings?: Object<string, *>, ws2Urls: string[]}} opts
 * @returns {Promise<void>}
 */
async function loadRelPage(page, { url, shell, showAllLabel, urlGlob, settings, ws2Urls }) {
    await loadUserscriptPage(page, {
        url,
        fixtureFile: shell,
        testMode: true,
        settingsOverride: { sa_enable_relationships_column: true, ...(settings || {}) },
    });

    await page.route('**/ws/2/**', (route) => {
        ws2Urls.push(route.request().url());
        return route.fulfill({ status: 200, contentType: 'application/json', body: WS2_BODY });
    });
    // The fetch pipeline re-requests the page shell for each pagination step.
    await page.route(urlGlob, (route) => route.fulfill({ path: shell, contentType: 'text/html' }));

    await page.click(`button[data-label="${showAllLabel}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/**
 * Everything this spec asserts on, read from the live DOM in one pass.
 *
 * `relTableStates()` / `relInitRuns()` come from `window.__saTest` rather than
 * being re-derived here, deliberately: the distinct-entity count is
 * `_relTableUniqueMbidCount()`'s job and a second hand-rolled copy of it in a
 * test is exactly the drift CLAUDE.md warns about for `_findCellListItems()`.
 * `relInitRuns()` in particular is not observable any other way — a collapsed
 * rel cell is byte-identical whether a full pass ran and found nothing or no
 * pass ran at all.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object>}
 */
const readRelShape = (page) => page.evaluate(() => ({
    tables: window.__saTest.relTableStates(),
    initRuns: window.__saTest.relInitRuns(),
    toggles: Array.from(document.querySelectorAll('thead .mb-rel-col-hdr-btn'))
        .map((b) => b.getAttribute('aria-pressed')),
    anchors: document.querySelectorAll('table.tbl tbody td.mb-rel-cell a').length,
    filterKeys: document.querySelectorAll('table.tbl tbody .mb-rel-filter-key').length,
    markedFilterInputs:
        document.querySelectorAll('thead .mb-col-filter-input[data-mb-rel-collapsed="1"]').length,
    infoRelText: (document.getElementById('mb-info-display-rel') || {}).textContent,
    infoRelVisible: (() => {
        const el = document.getElementById('mb-info-display-rel');
        return !!el && el.style.display !== 'none';
    })(),
    globalBtn: (() => {
        const b = document.getElementById('mb-rel-col-hdr-toggle-all-btn');
        if (!b) return null;
        return {
            label: b.querySelector('.mb-rel-col-hdr-all-label').textContent,
            allExpanded: b.dataset.mbRelColAllExpanded,
            visible: b.style.display !== 'none',
            precededBy: b.previousElementSibling ? b.previousElementSibling.id : null,
        };
    })(),
}));

test.describe('Relationships column: collapsed by threshold, loaded on demand', () => {
    let pageErrors;

    test.beforeEach(async ({ page }) => {
        pageErrors = collectPageErrors(page);
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('over the threshold: the column exists, ZERO requests are issued, and the toggle says so',
        async ({ page }) => {
            const ws2 = [];
            await loadRelPage(page, {
                url: SERIES_URL,
                shell: SERIES_SHELL,
                showAllLabel: 'Show all Releases for Series',
                urlGlob: 'https://musicbrainz.org/series/**',
                settings: { sa_rel_collapse_threshold: 2 },
                ws2Urls: ws2,
            });

            const shape = await readRelShape(page);

            // The headline: the column is structurally complete and cost nothing.
            expect(ws2).toHaveLength(0);
            expect(shape.tables).toEqual([
                { uniqueMbids: SERIES_ROWS, expanded: false, pending: SERIES_ROWS },
            ]);
            expect(shape.anchors).toBe(0);
            expect(shape.filterKeys).toBe(0);

            // The <td>s and the <th> are still there — deferring the COLUMN
            // rather than its content is what PERFORMANCE.org Step 32 rejected,
            // because the column COUNT is what every index churns off.
            const relTh = page.locator('table.tbl thead tr:first-child th[data-col-name="Relationships"]');
            await expect(relTh).toHaveCount(1);
            await expect(page.locator('table.tbl tbody td.mb-rel-cell')).toHaveCount(SERIES_ROWS);
            const cellCounts = await page.evaluate(() => {
                const t = document.querySelector('table.tbl');
                const headers = t.querySelectorAll('thead tr:first-child th').length;
                return Array.from(t.querySelectorAll('tbody tr'))
                    .filter((r) => r.cells.length !== headers).length;
            });
            expect(cellCounts).toBe(0);

            // The toggle, and the affordances that keep a collapsed column from
            // reading as a broken one.
            expect(shape.toggles).toEqual(['false']);
            expect(shape.markedFilterInputs).toBe(1);
            expect(shape.infoRelVisible).toBe(true);
            expect(shape.infoRelText).toContain('collapsed');

            // Single-table page: no page-wide button, its own toggle IS the
            // page-wide control (same rule as the CAA/EAA and Picard globals).
            expect(shape.globalBtn).toBeNull();

            // The <th>'s own TEXT NODES must still read exactly "Relationships".
            // Text nodes, not the subtree: this pins the CSS-::before glyph
            // decision without fighting a legitimate contribution from another
            // feature's span, which is the lesson the Picard spec landed.
            const thText = await relTh.evaluate((th) => Array.from(th.querySelectorAll('*'))
                .concat([th])
                .flatMap((el) => Array.from(el.childNodes))
                .filter((n) => n.nodeType === Node.TEXT_NODE)
                .map((n) => n.textContent.trim())
                .filter(Boolean)
                .join('|'));
            expect(thText).toContain('Relationships');
            expect(thText).not.toContain('▶');
            expect(thText).not.toContain('🔗');
        });

    test('a filter keystroke on a collapsed column starts no pass and no request',
        async ({ page }) => {
            const ws2 = [];
            await loadRelPage(page, {
                url: SERIES_URL,
                shell: SERIES_SHELL,
                showAllLabel: 'Show all Releases for Series',
                urlGlob: 'https://musicbrainz.org/series/**',
                settings: { sa_rel_collapse_threshold: 2 },
                ws2Urls: ws2,
            });

            const before = await readRelShape(page);
            expect(before.initRuns).toBe(1);

            // Before the fix, `runFilter()`'s gate was a page-wide
            // `td.mb-rel-cell:not([data-rel-done="1"])`, which a collapsed cell
            // matches FOREVER — so every keystroke re-read three GM tables and
            // swept the live tbody plus groupedRows plus allRows. That is
            // invisible in the DOM, hence the counter.
            await page.fill('#mb-global-filter-input', 'Born');
            await page.waitForTimeout(1500);
            const afterType = await readRelShape(page);
            expect(afterType.initRuns).toBe(before.initRuns);
            expect(ws2).toHaveLength(0);

            await page.fill('#mb-global-filter-input', '');
            await page.waitForTimeout(1200);
            const afterClear = await readRelShape(page);
            expect(afterClear.initRuns).toBe(before.initRuns);
            expect(ws2).toHaveLength(0);
        });

    test('pressing ▶🔗 loads exactly one request per distinct entity; re-expanding costs nothing',
        async ({ page }) => {
            const ws2 = [];
            await loadRelPage(page, {
                url: SERIES_URL,
                shell: SERIES_SHELL,
                showAllLabel: 'Show all Releases for Series',
                urlGlob: 'https://musicbrainz.org/series/**',
                settings: { sa_rel_collapse_threshold: 2 },
                ws2Urls: ws2,
            });
            expect(ws2).toHaveLength(0);

            await page.click('thead .mb-rel-col-hdr-btn');
            // Phase 2 is serialised 1100 ms apart, so 12 entities need ~14 s.
            // Polled rather than slept: a fixed wait would sample mid-fetch and
            // an under-count would look like a real defect.
            await expect
                .poll(async () => (await readRelShape(page)).tables[0].pending, { timeout: 40000 })
                .toBe(0);

            const expanded = await readRelShape(page);
            expect(ws2).toHaveLength(SERIES_ROWS);          // one per distinct entity
            expect(expanded.tables[0].expanded).toBe(true);
            expect(expanded.anchors).toBe(SERIES_ROWS);
            expect(expanded.filterKeys).toBe(SERIES_ROWS);  // the column is filterable again
            expect(expanded.toggles).toEqual(['true']);
            expect(expanded.markedFilterInputs).toBe(0);

            // Collapsing clears the cells but deliberately keeps BOTH caches
            // (`_relWs2Cache` and the rel-ws2 IDB store) — contrast
            // `_relRetryMbids()`, whose whole purpose is to evict them.
            await page.click('thead .mb-rel-col-hdr-btn');
            await expect
                .poll(async () => (await readRelShape(page)).anchors, { timeout: 15000 })
                .toBe(0);
            const recollapsed = await readRelShape(page);
            expect(recollapsed.tables[0]).toEqual(
                { uniqueMbids: SERIES_ROWS, expanded: false, pending: SERIES_ROWS });
            expect(ws2).toHaveLength(SERIES_ROWS);          // nothing new on the way down

            await page.click('thead .mb-rel-col-hdr-btn');
            await expect
                .poll(async () => (await readRelShape(page)).anchors, { timeout: 25000 })
                .toBe(SERIES_ROWS);
            // The guarantee that makes collapsing safe to do casually: the
            // second expand issued NO new requests at all.
            expect(ws2).toHaveLength(SERIES_ROWS);
        });

    test('threshold semantics: 0 means never auto-collapse', async ({ page }) => {
            // `0` must mean "never auto-collapse", per the setting's own
            // description. Mutation-checked: dropping the `_thr === 0` carve-out
            // (so that `0` becomes "collapse anything with more than zero
            // entities") fails this test, which is the likely coding error.
            //
            // What this does NOT cover, stated so it is not mistaken for
            // covered: reading the setting as `Lib.settings.x || 200` — the
            // falsy-zero defect `sa_render_threshold` and
            // `sa_chunked_render_threshold` still carry. On a 12-entity page
            // that mutant resolves 0 to 200 and still reports "expanded", so
            // the two readings are indistinguishable here. They diverge only
            // above the schema default, which no committed fixture reaches.
            const zeroWs2 = [];
            await loadRelPage(page, {
                url: SERIES_URL,
                shell: SERIES_SHELL,
                showAllLabel: 'Show all Releases for Series',
                urlGlob: 'https://musicbrainz.org/series/**',
                settings: { sa_rel_collapse_threshold: 0 },
                ws2Urls: zeroWs2,
            });
            const zero = await readRelShape(page);
            expect(zero.tables[0].expanded).toBe(true);
            expect(zero.toggles).toEqual(['true']);
            expect(zero.markedFilterInputs).toBe(0);
            // Fetching has begun rather than merely being permitted.
            await expect.poll(() => zeroWs2.length, { timeout: 15000 }).toBeGreaterThan(0);
        });

    test('threshold semantics: above the count leaves it expanded', async ({ page }) => {
        const ws2 = [];
        await loadRelPage(page, {
            url: SERIES_URL,
            shell: SERIES_SHELL,
            showAllLabel: 'Show all Releases for Series',
            urlGlob: 'https://musicbrainz.org/series/**',
            settings: { sa_rel_collapse_threshold: SERIES_ROWS + 1 },
            ws2Urls: ws2,
        });
        const shape = await readRelShape(page);
        expect(shape.tables[0]).toMatchObject({ uniqueMbids: SERIES_ROWS, expanded: true });
        await expect.poll(() => ws2.length, { timeout: 15000 }).toBeGreaterThan(0);
    });

    test('the 📊 dropdown says the column is collapsed instead of listing nothing',
        async ({ page }) => {
            const ws2 = [];
            await loadRelPage(page, {
                url: SERIES_URL,
                shell: SERIES_SHELL,
                showAllLabel: 'Show all Releases for Series',
                urlGlob: 'https://musicbrainz.org/series/**',
                settings: { sa_rel_collapse_threshold: 2 },
                ws2Urls: ws2,
            });

            // An empty "Relationship icons" section is indistinguishable from
            // "this page has no relationships at all", which is the reason this
            // note exists rather than the section simply being absent.
            await page.click(
                'table.tbl thead tr:first-child th[data-col-name="Relationships"] .mb-col-uniq-btn');
            const note = page.locator('#mb-col-uniq-dropdown .mb-uniq-rel-collapsed-note');
            await expect(note).toHaveCount(1);
            await expect(note).toContainText('Collapsed');
            // Opening the dropdown must not have started the fetch: a glance
            // cannot be allowed to queue a throttled multi-minute run.
            expect(ws2).toHaveLength(0);
        });

    test('toggling MID-FETCH never multiplies an icon, and a collapsed column stays empty',
        async ({ page }) => {
            // Regression for the bug reported against the first version of this
            // feature, reproduced in `debug/relationships-multiplying.html`: one
            // toggle cycle doubled every newly-arrived icon, two tripled it, and
            // that snapshot holds five copies of a single URL.
            //
            // Mechanism, because the shape of the test follows from it: the
            // Phase-2 queue is FIRE-AND-FORGET — `_initRelationshipsColumnImpl()`
            // resolves as soon as Phase 1 does — so `_relColumnActivePromise`
            // goes null while the queue is still trickling one request per
            // 1100 ms. Collapsing therefore left a detached queue writing into a
            // cleared column, and re-expanding started a SECOND queue over every
            // cell the first had not reached, with `_relAppendIcon()` appending
            // to both. n toggles, n copies.
            //
            // So every assertion here has to be made WHILE the queue is in
            // flight. 12 entities at 1100 ms apart give ~13 s of window, and
            // each cycle below deliberately lands inside it.
            const ws2 = [];
            await loadRelPage(page, {
                url: SERIES_URL,
                shell: SERIES_SHELL,
                showAllLabel: 'Show all Releases for Series',
                urlGlob: 'https://musicbrainz.org/series/**',
                settings: { sa_rel_collapse_threshold: 2 },
                ws2Urls: ws2,
            });

            const toggle = 'thead .mb-rel-col-hdr-btn';
            /**
             * Per-cell icon counts, plus how many cells hold a repeated href.
             *
             * `maxPerCell` is the assertion that actually pins this bug:
             * a page-wide anchor TOTAL grows legitimately as the fetch
             * progresses, so only a per-cell maximum can tell "12 rows filled
             * in" from "6 rows filled in twice".
             *
             * @returns {Promise<{anchors: number, maxPerCell: number,
             *                    dupCells: number, pending: number}>}
             */
            const iconShape = () => page.evaluate(() => {
                const cells = Array.from(
                    document.querySelectorAll('table.tbl tbody td.mb-rel-cell'));
                const per = cells.map((td) => td.querySelectorAll('a').length);
                return {
                    anchors: per.reduce((a, b) => a + b, 0),
                    maxPerCell: Math.max(0, ...per),
                    dupCells: cells.filter((td) => {
                        const h = Array.from(td.querySelectorAll('a'))
                            .map((a) => a.getAttribute('href'));
                        return h.length !== new Set(h).size;
                    }).length,
                    pending: window.__saTest.relTableStates()[0].pending,
                };
            });

            // Expand and let the first request land, so the queue is genuinely
            // mid-flight for everything that follows.
            await page.click(toggle);
            await expect.poll(async () => (await iconShape()).anchors, { timeout: 15000 })
                .toBeGreaterThan(0);

            // Collapse mid-fetch. The detached queue must write NOTHING more —
            // and must stop requesting, or it burns MusicBrainz's rate limit on
            // answers that are discarded (`_relQueueStillWants()`).
            await page.click(toggle);
            await page.waitForTimeout(300);
            expect((await iconShape()).anchors).toBe(0);
            const requestsAtCollapse = ws2.length;
            await page.waitForTimeout(4000);        // ≥3 throttled slots
            const afterWaiting = await iconShape();
            expect(afterWaiting.anchors, 'a collapsed column must stay empty').toBe(0);
            expect(ws2.length, 'a superseded queue must stop requesting')
                .toBe(requestsAtCollapse);

            // Now the reported scenario: toggle repeatedly, always mid-fetch.
            for (let i = 0; i < 5; i++) {
                await page.click(toggle);
                await page.waitForTimeout(1400);    // ~one more request lands
                const mid = await iconShape();
                expect(mid.maxPerCell, `cycle ${i}: one relationship, one icon`).toBe(1);
                expect(mid.dupCells, `cycle ${i}: no repeated href`).toBe(0);
                await page.click(toggle);
                await page.waitForTimeout(700);
                expect((await iconShape()).anchors, `cycle ${i}: collapse empties`).toBe(0);
            }

            // Settle fully and check the end state.
            await page.click(toggle);
            await expect.poll(async () => (await iconShape()).pending, { timeout: 90000 }).toBe(0);
            const settled = await iconShape();
            expect(settled.anchors).toBe(SERIES_ROWS);
            expect(settled.maxPerCell).toBe(1);
            expect(settled.dupCells).toBe(0);
            // Six expand/collapse cycles, still exactly one request per distinct
            // entity: the L1 promise cache serves the repeats and nothing is
            // re-fetched.
            expect(ws2).toHaveLength(SERIES_ROWS);
            expect(new Set(ws2).size).toBe(SERIES_ROWS);
        });

    test('multi-table: the threshold is decided per sub-table, and collapsing survives a filter',
        async ({ page }) => {
            const ws2 = [];
            await loadRelPage(page, {
                url: RG_URL,
                shell: RG_SHELL,
                showAllLabel: 'Show all Releases for ReleaseGroup',
                urlGlob: 'https://musicbrainz.org/release-group/**',
                // Between the two sub-tables' sizes (6 and 1), so the two must
                // land on opposite sides of the decision.
                settings: { sa_rel_collapse_threshold: 3 },
                ws2Urls: ws2,
            });
            // releasegroup-releases renders its sub-sections COLLAPSED, so
            // anything inside a sub-table is a 0×0 element until this runs.
            await clickMasterToggleAndExpandAll(page);

            const shape = await readRelShape(page);
            expect(shape.tables).toEqual([
                { uniqueMbids: 6, expanded: false, pending: 6 },
                { uniqueMbids: 1, expanded: true, pending: 0 },
            ]);
            expect(shape.toggles).toEqual(['false', 'true']);
            // Only the small table's single entity was ever requested.
            expect(ws2).toHaveLength(1);

            // The page-wide button exists here (multi-table only) and sits after
            // the last of the other page-wide column buttons, giving a
            // deterministic reading order whichever pass ran first.
            expect(shape.globalBtn).toMatchObject({
                allExpanded: 'false',
                visible: true,
                precededBy: 'mb-picard-col-hdr-toggle-all-btn',
            });
            expect(shape.globalBtn.label).toContain('Load all');

            // A filter re-renders from CLONES of the master rows, so a collapse
            // that had left the masters populated would have the icons reappear
            // here. The collapsed table must stay empty and the expanded one
            // must keep its icon.
            await page.fill('#mb-global-filter-input', 'Tunnel');
            await page.waitForTimeout(1500);
            const filtered = await readRelShape(page);
            expect(filtered.toggles).toEqual(['false', 'true']);
            expect(ws2).toHaveLength(1);

            await page.fill('#mb-global-filter-input', '');
            await page.waitForTimeout(1500);
            const cleared = await readRelShape(page);
            expect(cleared.tables).toEqual([
                { uniqueMbids: 6, expanded: false, pending: 6 },
                { uniqueMbids: 1, expanded: true, pending: 0 },
            ]);
            expect(ws2).toHaveLength(1);
        });

    test('multi-table: collapsing a POPULATED column empties the master rows too',
        async ({ page }) => {
            // This is the mirror test, and it has to start from a POPULATED
            // column — which is the whole reason it is separate from the
            // per-sub-table test above. That one collapses a table that was
            // never expanded, so its master rows were empty either way:
            // mutation-checked, removing the master mirroring entirely left
            // every other test in this file green.
            //
            // It also has to be the MULTI-table page. `renderFinalTable()`
            // MOVES the rows it is handed, so on a single-table page's initial
            // render the live row IS the master and emptying one empties both
            // for free. `renderGroupedTable()` always clones, even on the first
            // render, so here the masters are genuinely separate nodes and a
            // collapse that skipped them would have every icon reappear on the
            // next keystroke.
            const ws2 = [];
            await loadRelPage(page, {
                url: RG_URL,
                shell: RG_SHELL,
                showAllLabel: 'Show all Releases for ReleaseGroup',
                urlGlob: 'https://musicbrainz.org/release-group/**',
                settings: { sa_rel_collapse_threshold: 3 },
                ws2Urls: ws2,
            });
            await clickMasterToggleAndExpandAll(page);

            // Populate everything first.
            await page.click('#mb-rel-col-hdr-toggle-all-btn');
            await expect
                .poll(async () => (await readRelShape(page)).anchors, { timeout: 40000 })
                .toBe(7);

            // Now collapse everything, and confirm the LIVE cells are empty.
            await page.click('#mb-rel-col-hdr-toggle-all-btn');
            await expect
                .poll(async () => (await readRelShape(page)).anchors, { timeout: 15000 })
                .toBe(0);

            // The re-render is what reads the masters. A filter keystroke
            // re-clones every group from `groupedRows[i].rows`; clearing it
            // re-clones them again, including the rows the filter had left
            // unrendered, which is what the owner-array sweep exists for.
            await page.fill('#mb-global-filter-input', 'Tunnel');
            await page.waitForTimeout(1500);
            expect((await readRelShape(page)).anchors).toBe(0);

            await page.fill('#mb-global-filter-input', '');
            await page.waitForTimeout(1500);
            const cleared = await readRelShape(page);
            expect(cleared.anchors).toBe(0);
            expect(cleared.filterKeys).toBe(0);
            expect(cleared.toggles).toEqual(['false', 'false']);
            // And nothing was re-requested to get back to empty.
            expect(ws2).toHaveLength(7);
        });

    test('multi-table: the page-wide button brings every sub-table to expanded in one click',
        async ({ page }) => {
            const ws2 = [];
            await loadRelPage(page, {
                url: RG_URL,
                shell: RG_SHELL,
                showAllLabel: 'Show all Releases for ReleaseGroup',
                urlGlob: 'https://musicbrainz.org/release-group/**',
                settings: { sa_rel_collapse_threshold: 3 },
                ws2Urls: ws2,
            });
            await clickMasterToggleAndExpandAll(page);
            expect((await readRelShape(page)).toggles).toEqual(['false', 'true']);

            // Expand-if-any-collapsed, driven by dispatching a real bubbling
            // click at each per-table span — so it exercises the actual
            // per-table delegate rather than a copy of the toggle logic.
            await page.click('#mb-rel-col-hdr-toggle-all-btn');
            await expect
                .poll(async () => (await readRelShape(page)).tables.every((t) => t.pending === 0),
                    { timeout: 40000 })
                .toBe(true);

            const all = await readRelShape(page);
            expect(all.toggles).toEqual(['true', 'true']);
            expect(all.globalBtn.allExpanded).toBe('true');
            expect(all.globalBtn.label).toContain('Empty all');
            expect(all.anchors).toBe(7);
            expect(ws2).toHaveLength(7);   // 6 + the 1 already done, none repeated

            // And back down: every sub-table empties, nothing is re-requested.
            await page.click('#mb-rel-col-hdr-toggle-all-btn');
            await expect
                .poll(async () => (await readRelShape(page)).anchors, { timeout: 15000 })
                .toBe(0);
            const down = await readRelShape(page);
            expect(down.toggles).toEqual(['false', 'false']);
            expect(down.globalBtn.label).toContain('Load all');
            expect(ws2).toHaveLength(7);
        });
});
