'use strict';

const { test, expect } = require('../support/test');
const { loadUserscriptPageWithRealNetwork } = require('../support/realNetworkGmXhr');
const { collectPageErrors } = require('../support/liveAssertions');

/**
 * A typed CAA type/comment filter must keep matching a row that the MERGED
 * discography view relocated into another category's table.
 *
 * ## What this guards, and what it does NOT claim
 *
 * On `tableMode: 'multi'` pages the row `runFilter()` matches against is the
 * SOURCE row in `groupedRows`, never the rendered clone — so a CAA cell's
 * per-image type/comment text only becomes filterable once
 * `_artSyncSearchTextToSourceRow()` has copied it there
 * (`td.dataset.mbArtSearchSync`, read by `getCleanColumnText()` — the
 * function now also mirrors four structural facts alongside it, for the 📊
 * unique-values dropdown's own entries; see
 * `releasegroup-releases-caa-uniqdrop-filter.spec.js`. This spec exercises
 * the TYPED-filter path, so `mbArtSearchSync` is the only one it depends on,
 * but the position lookup below governs all five equally). That function
 * resolves its target row by table POSITION:
 *
 *     const tableIndex = [...document.querySelectorAll('table.tbl')].indexOf(liveTable);
 *     const group = groupedRows[tableIndex];
 *     const sourceRow = group.rows.find(r => r.dataset.mbRowIdx === rowIdx);
 *     if (!sourceRow) return;                    // ← silently gives up
 *
 * which assumes every row in a live table belongs to the group at the same
 * index. Merged view appears to break that: `_applyDiscographyViewFilter()`
 * fills each first-occurrence table with CLONES of every same-category group's
 * rows, so relocated rows sit in a table whose `groupedRows` entry does not
 * contain them, and that lookup misses.
 *
 * **Measured, it does not currently produce a user-visible symptom, and this
 * spec passes on unmodified code.** The reason is worth writing down, because
 * it is incidental rather than designed: a folded-away duplicate section keeps
 * its STALE rows in the DOM (`_applyDiscographyViewFilter` sets
 * `data-mb-disc-hidden` and hides the table but does not empty it), artwork is
 * built in those hidden tables too, and there the DOM index still lines up with
 * the row's own `groupedRows` entry. So every relocated row gets its search
 * text synced through its hidden twin, and the failed lookup on the visible
 * merged copy costs nothing.
 *
 * Measured on this page: 85 built CAA cells in visible tables and 72 more in
 * hidden ones, with the sampled relocated row's twin among them.
 *
 * That makes this a REGRESSION GUARD, not a fails-before/passes-after test.
 * The masking rests on work that is pure waste — 72 artwork builds nobody can
 * see — so the obvious future optimisation (skip hidden tables) would remove
 * it and make the weakness live immediately. This spec is what would catch
 * that. If it ever fails, the fix is the lookup `_artResolveSourceCounterpart()`
 * (the icon mirror's sibling) already uses: `_findMasterRowByIdx()`, which
 * searches `allRows` and then EVERY group and so is correct in all four
 * `discographyViewState` modes.
 *
 * ## Why this page and this pageType
 *
 * `artist-releasegroups` is the ONLY pageType with discography view modes, so
 * it is the only place this can be reached at all. It carries its own synthetic
 * `CAA` column (`columnExtractors: [{sourceColumn: 'Title', extractor: 'caa',
 * syntheticColumns: ['CAA']}]`), which is what makes a typed type/comment
 * filter meaningful here.
 *
 * ## Why the row is chosen at runtime rather than hardcoded
 *
 * Two conditions must hold at once, and neither is stable enough to pin to a
 * fixed MBID as MusicBrainz's data drifts:
 *
 *   1. **The merge must actually relocate it** — it has to come from a
 *      duplicate (2nd, 3rd, …) occurrence of its category. A row in the first
 *      occurrence stays put and proves nothing.
 *   2. **Its artwork must be built AFTER the switch to merged view.** A cell
 *      built while still in Complete view syncs correctly there, and that value
 *      persists on the source row afterwards — so such a row would keep
 *      filtering fine regardless.
 *
 * If no row satisfies both, the spec FAILS rather than passing vacuously: that
 * would mean the conditions never occurred, not that the code is correct.
 *
 * Needs REAL CAA network access: with `gmStubs.js`'s always-404
 * `GM_xmlhttpRequest` no `ul.mb-caa-art-ul` is ever built, there is no
 * type/comment text to filter on, and the whole spec is vacuous.
 */

// Simon & Garfunkel — the same artist `discography-view.spec.js` and
// `discography-view-artwork.spec.js` use. 123 release groups across 17
// categories, so merged view genuinely has same-category duplicates to fold
// together (the precondition this spec depends on).
const ARTIST_URL = 'https://musicbrainz.org/artist/5d02f264-e225-41ff-83f7-d9b1f0b1874a';
const SHOW_ALL_BUTTON = 'button[data-label="🧮 Artist RGs"]';
const MERGED_VIEW_BTN = '#mb-disc-merged-btn';

const SETTLE_MS = Number(process.env.MERGED_CAA_SETTLE_MS || 180000);

/**
 * Records, for the CURRENT (Complete) view, which rows live in a section that
 * merged view will fold away, plus which rows already have a built CAA cell.
 *
 * **Relocation is derived from each section's category ORDINAL, not from table
 * indices.** Merged view combines every same-category `groupedRows` entry into
 * the FIRST occurrence of that category, so exactly the rows in the 2nd, 3rd, …
 * occurrence get moved. Comparing a row's table index before and after the
 * switch looks equivalent but is not: the view switch re-renders the whole
 * table set, and — worse — a folded-away duplicate keeps its STALE rows in the
 * DOM (`renderGroupedTable` leaves hidden tables untouched), so a relocated row
 * exists twice afterwards and an index diff can resolve to the hidden copy.
 * That is exactly what happened on this spec's first run: it picked row 43 in a
 * hidden table and failed on the filter input's visibility rather than on
 * anything it meant to test.
 *
 * `data-mb-art-search` is the marker for "this cell's artwork has been built
 * and its search text computed" — set by `_artBuildMultiRowArtCell()` on the
 * `<ul>` at the same moment it calls the sync being tested.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{willRelocate: string[], built: string[], sections: number}>}
 */
async function readCompleteViewLayout(page) {
    return page.evaluate(() => {
        const willRelocate = [];
        const built = [];
        const seen = new Map();                 // category label -> times seen so far
        const tables = document.querySelectorAll('table.tbl');
        tables.forEach((t) => {
            let h3 = t.previousElementSibling;
            while (h3 && h3.tagName !== 'H3') h3 = h3.previousElementSibling;
            const label = h3
                ? (h3.textContent.trim().match(/^[^(]+/) || [''])[0].replace(/^[▶▼\s]+/, '').trim()
                : '(none)';
            const ordinal = seen.get(label) || 0;
            seen.set(label, ordinal + 1);
            t.querySelectorAll('tbody tr[data-mb-row-idx]').forEach((tr) => {
                const idx = tr.dataset.mbRowIdx;
                // Only a duplicate section's rows are moved by the merge; the
                // first occurrence of a category stays exactly where it is.
                if (ordinal > 0) willRelocate.push(idx);
                if (tr.querySelector('ul.mb-caa-art-ul[data-mb-art-search]')) built.push(idx);
            });
        });
        return { willRelocate, built, sections: tables.length };
    });
}

/**
 * Waits until the number of BUILT CAA cells stops changing.
 *
 * Never settles on zero — a count of 0 means the artwork pass has not produced
 * anything yet, not that it finished (the standing rule for every artwork
 * probe in this suite; see `ShowAllEntityData/CLAUDE.md`).
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ timeoutMs?: number, pollMs?: number, stableFor?: number }} [opts]
 * @returns {Promise<{cells: number, stable: boolean}>}
 */
async function waitForArtCellsSettled(page, { timeoutMs = SETTLE_MS, pollMs = 3000, stableFor = 5 } = {}) {
    const started = Date.now();
    const read = () => page.evaluate(
        () => document.querySelectorAll('ul.mb-caa-art-ul[data-mb-art-search]').length
    );

    let last = await read();
    let same = 0;
    while (Date.now() - started < timeoutMs) {
        await new Promise((r) => setTimeout(r, pollMs));
        const current = await read();
        if (current === last) {
            if (current > 0 && ++same >= stableFor) return { cells: current, stable: true };
        } else {
            same = 0;
            console.log(`[merged-sync] building… ${current} CAA cells at ${Math.round((Date.now() - started) / 1000)}s`);
        }
        last = current;
    }
    return { cells: last, stable: false };
}

/**
 * Expands every sub-section, whichever state the page starts in, and asserts
 * it worked — a collapsed sub-table is `display:none` and loads no artwork.
 *
 * @param {import('@playwright/test').Page} page
 */
async function expandAll(page) {
    const masterToggle = page.locator('.mb-master-toggle');
    await expect(masterToggle).toBeVisible();
    if ((await masterToggle.getAttribute('data-state')) === 'collapsed') {
        await masterToggle.click();
    }
    await expect(masterToggle).toHaveAttribute('data-state', 'expanded');

    // The flag can read "expanded" while individual sub-tables are still
    // hidden, so force a full cycle rather than trusting it. View-hidden
    // duplicates (merged view's folded-away sections) are excluded — they are
    // hidden legitimately.
    const hidden = () => page.evaluate(() => Array.from(document.querySelectorAll('table.tbl'))
        .filter((t) => {
            if (t.offsetParent !== null) return false;
            let h3 = t.previousElementSibling;
            while (h3 && h3.tagName !== 'H3') h3 = h3.previousElementSibling;
            return !(h3 && h3.dataset.mbDiscHidden === 'true');
        }).length);

    if (await hidden() > 0) {
        await masterToggle.click();
        await expect(masterToggle).toHaveAttribute('data-state', 'collapsed');
        await masterToggle.click();
        await expect(masterToggle).toHaveAttribute('data-state', 'expanded');
    }
    expect(await hidden(), 'sub-tables are still collapsed — no artwork would load').toBe(0);
}

test.describe('merged discography view: CAA search-text sync', { tag: '@extended' }, () => {
    test('a row relocated by the merged view still matches a typed CAA type/comment filter', async ({ page }) => {
        test.setTimeout(SETTLE_MS + 300000);

        const pageErrors = collectPageErrors(page);

        await loadUserscriptPageWithRealNetwork(page, { url: ARTIST_URL, testMode: true });

        await expect(page.locator(SHOW_ALL_BUTTON)).toBeVisible();
        await page.click(SHOW_ALL_BUTTON);
        await expect(page.locator('#mb-filter-container')).toBeVisible({ timeout: 300000 });

        // Collapse everything immediately. Sub-sections render EXPANDED on this
        // pageType, so artwork starts building the moment the table lands, and
        // every cell built here would sync correctly (Complete view's table
        // indices line up with groupedRows) and mask the bug. Collapsing makes
        // the tables display:none, which stops the pass.
        const masterToggle = page.locator('.mb-master-toggle');
        await expect(masterToggle).toBeVisible();
        if ((await masterToggle.getAttribute('data-state')) === 'expanded') {
            await masterToggle.click();
        }
        await expect(masterToggle).toHaveAttribute('data-state', 'collapsed');

        // Layout BEFORE the merge, plus which cells the race above already let
        // through. Both are needed to pick a row that proves something.
        const beforeView = await readCompleteViewLayout(page);
        const preBuilt = new Set(beforeView.built);
        console.log(`[merged-sync] complete view: ${beforeView.sections} sections, ` +
                    `${beforeView.willRelocate.length} rows in duplicate sections (will be relocated), ` +
                    `${preBuilt.size} CAA cells already built before the switch`);
        expect(beforeView.willRelocate.length,
            'no duplicate category sections on this page — merged view would move nothing')
            .toBeGreaterThan(0);

        // ── Switch to merged view, THEN let the artwork build ────────────────
        await page.click(MERGED_VIEW_BTN);
        await expandAll(page);

        const globalCaaBtn = page.locator('#mb-caa-toggle-btn-global');
        await expect(globalCaaBtn).toBeVisible({ timeout: 30000 });
        await globalCaaBtn.click();

        const settled = await waitForArtCellsSettled(page);
        console.log('[merged-sync] art cells settled: ' + JSON.stringify(settled));
        expect(settled.cells, 'no CAA cells built at all — nothing to filter on').toBeGreaterThan(0);

        // ── Pick a row the merge relocated whose artwork is new ──────────────
        //
        // Restricted to VISIBLE, non-folded tables: a folded-away duplicate
        // keeps its stale rows, so a relocated row exists twice in the DOM and
        // only the copy in the surviving merged table is the one the user
        // filters against.
        const totalVisibleRows = await page.locator('table.tbl:visible tbody tr[data-mb-row-idx]').count();
        const candidate = await page.evaluate(({ relocatable, preBuiltList }) => {
            const moved = new Set(relocatable);
            const pre = new Set(preBuiltList);
            let best = null;
            document.querySelectorAll('table.tbl').forEach((t, ti) => {
                if (t.offsetParent === null) return;            // hidden / folded away
                let h3 = t.previousElementSibling;
                while (h3 && h3.tagName !== 'H3') h3 = h3.previousElementSibling;
                if (h3 && h3.dataset.mbDiscHidden === 'true') return;
                t.querySelectorAll('tbody tr[data-mb-row-idx]').forEach((tr) => {
                    const idx = tr.dataset.mbRowIdx;
                    if (!moved.has(idx)) return;                // stayed put, proves nothing
                    if (pre.has(idx)) return;                   // synced pre-switch, proves nothing
                    const ul = tr.querySelector('ul.mb-caa-art-ul[data-mb-art-search]');
                    if (!ul) return;
                    const text = (ul.dataset.mbArtSearch || '').trim();
                    if (!text) return;
                    // Prefer the richest search text — more words means a token
                    // less likely to be shared by every other row.
                    const words = text.split(/\s+/).filter(Boolean);
                    if (!best || words.length > best.words.length) {
                        best = { rowIdx: idx, tableIndex: ti, text, words };
                    }
                });
            });
            return best;
        }, { relocatable: beforeView.willRelocate, preBuiltList: [...preBuilt] });

        expect(
            candidate,
            'no row was both relocated by the merged view AND first built after the switch — ' +
            'the preconditions this spec needs never occurred, so it would prove nothing'
        ).not.toBeNull();
        console.log('[merged-sync] candidate: ' + JSON.stringify({
            rowIdx: candidate.rowIdx,
            nowInTable: candidate.tableIndex,
            searchText: candidate.text.slice(0, 160),
        }));

        // Diagnostic, not an assertion — it explains WHY this passes. A
        // relocated row also survives as a stale twin inside its original,
        // now-folded-away section, and that table's DOM index still lines up
        // with its own groupedRows entry. If artwork builds there too, the sync
        // succeeds through the twin even when it fails through the visible
        // merged copy, which is exactly what masks the index-lookup weakness.
        console.log('[merged-sync] twin census: ' + JSON.stringify(await page.evaluate((idx) => {
            let visibleCells = 0, hiddenCells = 0, twinBuilt = 0, twinTables = 0;
            document.querySelectorAll('table.tbl').forEach((t) => {
                const isHidden = t.offsetParent === null;
                t.querySelectorAll('tbody tr[data-mb-row-idx]').forEach((tr) => {
                    const has = !!tr.querySelector('ul.mb-caa-art-ul[data-mb-art-search]');
                    if (has) { if (isHidden) hiddenCells++; else visibleCells++; }
                    if (tr.dataset.mbRowIdx === idx && isHidden) {
                        twinTables++;
                        if (has) twinBuilt++;
                    }
                });
            });
            return { visibleCells, hiddenCells, candidateHiddenTwins: twinTables, candidateTwinsBuilt: twinBuilt };
        }, candidate.rowIdx)));

        // The longest word in that cell's search text: still real type/comment
        // text, but the least likely to collide with every other row's "Front".
        const token = candidate.words.slice().sort((a, b) => b.length - a.length)[0];
        expect(token.length, 'no usable filter token in the candidate cell').toBeGreaterThan(2);
        console.log(`[merged-sync] filtering the CAA column on "${token}"`);

        // ── Filter that table's CAA column and look for the row ──────────────
        const caaColIdx = await page.evaluate((ti) => {
            const strip = (t) => t.replace(/[⇅▲▼📊▶◀▤0-9⁰¹²³⁴⁵⁶⁷⁸⁹]/g, '').trim();
            const table = document.querySelectorAll('table.tbl')[ti];
            if (!table) return -1;
            return Array.from(table.querySelectorAll('thead th')).findIndex((t) => strip(t.textContent) === 'CAA');
        }, candidate.tableIndex);
        expect(caaColIdx, 'no CAA column in the candidate row\'s table').toBeGreaterThanOrEqual(0);

        const targetTable = page.locator('table.tbl').nth(candidate.tableIndex);
        const caaFilterInput = targetTable.locator(`.mb-col-filter-input[data-col-idx="${caaColIdx}"]`);
        await expect(caaFilterInput).toBeVisible({ timeout: 15000 });
        await caaFilterInput.click();
        await caaFilterInput.pressSequentially(token);

        // runFilter() REMOVES non-matching rows from a multi-table tbody rather
        // than hiding them, so presence in the DOM is the assertion. Wait for
        // the filter to actually narrow something before reading it.
        await page.waitForFunction(
            (total) => document.querySelectorAll('table.tbl:not([style*="display: none"]) tbody tr[data-mb-row-idx]').length < total,
            totalVisibleRows,
            { timeout: 20000 },
        ).catch(() => { /* assertion below reports the real state with a diff */ });

        // Scoped to the candidate's own table: its stale twin may still sit in a
        // folded-away duplicate, and finding THAT one would be a false pass.
        const survived = await page.evaluate(
            ({ idx, ti }) => {
                const t = document.querySelectorAll('table.tbl')[ti];
                return !!(t && t.querySelector(`tbody tr[data-mb-row-idx="${idx}"]`));
            },
            { idx: candidate.rowIdx, ti: candidate.tableIndex },
        );
        const remaining = await page.locator('table.tbl:visible tbody tr[data-mb-row-idx]').count();
        console.log(`[merged-sync] rows remaining after filter: ${remaining}; candidate survived: ${survived}`);

        expect(
            survived,
            `the merged view relocated row ${candidate.rowIdx} into table ${candidate.tableIndex}, ` +
            `and its own CAA text no longer matches a filter for "${token}" — ` +
            '_artSyncSearchTextToSourceRow() never reached its source row'
        ).toBe(true);

        expect(pageErrors, 'uncaught page errors').toEqual([]);
    });
});
