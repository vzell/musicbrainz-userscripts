'use strict';

const { test, expect } = require('../support/test');
const { loadFromDiskFixture } = require('../support/diskFixture');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { collectPageErrors } = require('../support/liveAssertions');
const { buildChabanPatchedFixture } = require('../support/chabanDayOfWeekFixture');
const {
    waitForFilterSettled, waitForSortSettled, getPageRowCount,
    getColumnHighlightTexts, getGlobalHighlightTexts,
    getFilterStatusText, buildFilterStatusRegex,
    assertRowCountTooltip, getFilterButtonsState, getPrefilterButtonState,
} = require('../support/filterSortAssertions');
const {
    URL: BODEANS_URL, FIXTURE_PATH, TOTAL_ROWS, COLUMN_INDEX,
    FILTER_CASES, COMBO_CASES, ORDER_PAIR_CASE, SORT_CHECKPOINTS,
    UNIQ_DROP_COLUMNS_CLEARED, UNIQ_DROP_ACTIVE_FILTER, UNIQ_DROP_COLUMNS_ACTIVE,
    UNIQ_DROP_SINGLE_CASES, UNIQ_DROP_COMBO_CASES, UNIQ_DROP_CROSS_COLUMN_COMBO,
} = require('../support/bodeansArtistReleasesFixture');

/**
 * Comprehensive filter/sort/highlight/uniq-dropdown regression coverage for
 * `artist-releases` (BoDeans' own 56-row catalog — see
 * `debug/filterSort-tests.org` for the original brief, and
 * `debug/artist-releases-filterSort-test-report.org` for the full
 * methodology, every expected-count's provenance, and the corrections a
 * live run surfaced versus the original static-HTML-derived draft).
 *
 * Loaded via the committed disk fixture (captured once via
 * `node tests/support/capture-fixture.js --only=artist-releases-bodeans`,
 * with real CAA/Relationships network access) rather than a live fetch, so
 * these run fast and are immune to MusicBrainz data drift; re-capture the
 * fixture (and `tests/support/bodeansArtistReleasesFixture.js`'s derived
 * constants) if BoDeans' real catalog ever meaningfully changes.
 *
 * PERFORMANCE: one page load per `test()`, not per case — `loadFromDiskFixture()`/
 * `loadUserscriptPage()` still does a real `page.goto()` to musicbrainz.org
 * plus two CDN fetches (iro.js, pako.min.js) even for a "disk fixture" load
 * (the fixture only replaces the *data* hydration step). §A/§F's many cases
 * are grouped into a handful of `test()`s, one `test.step()` per case,
 * clearing filters between steps rather than reloading — this is what makes
 * a ~45-case suite take a couple of minutes instead of ~16.
 *
 * VIEWPORT: the 22-column table is wider than Playwright's default 1280px
 * viewport — a uniq-dropdown panel opened for a column scrolled out of that
 * default hangs every item click until Playwright's actionability timeout
 * ("element is outside of the viewport"). `test.use()` below sizes the
 * viewport to comfortably fit the whole table instead.
 *
 * Sections mirror the plan's own lettering:
 *   A — per-column typed filter cases (+ highlight, folded in per-case)
 *   A2 — chaban day-of-week third-party interop (own test — needs a
 *        pre-render script injection, not part of §A's shared page load)
 *   B — combo / global+column-order-pair cases
 *   C — sort-then-restore checkpoints
 *   D — uniq-dropdown checks, filters cleared
 *   E — uniq-dropdown checks, one filter left active
 *   F — uniq-dropdown-DRIVEN filtering (checking items, not typing)
 *   G — folded into A/B/F's own per-case highlight assertions
 *   I — stats/tooltip/button UI-state assertions, folded into every §A/§B/§C
 *       `test.step` via `assertFilterUiState()`/`assertFilterUiCleared()`
 *   J/K — pre-filtered disk-load repeat / column-visibility exercise,
 *         CONFIGURABLE opt-in via TEST_PREFILTER_LOAD=1 / TEST_COLVIS=1
 *         (skipped entirely otherwise — each roughly doubles run time)
 */

test.use({ viewport: { width: 3200, height: 1600 } });

// A focused filter input carries a decorative "🔍 " prefix in its own
// `.value` (ShowAllEntityData.user.js's `stripColFilterPrefix()` / default
// `sa_filter_focus_prefix`) — NOT part of the real filter text. Every
// "is this input currently empty" check in this file must strip it first;
// naively checking the raw `.inputValue()` treats a merely-focused, truly
// EMPTY input as "has content to clear", triggering a clear attempt that
// changes nothing (backspace is blocked right at the icon boundary) and
// hangs `waitForFilterSettled()` until timeout — confirmed live, this was
// the root cause of an early "clear never settles" bug in this spec.
const FOCUS_PREFIX = '🔍 ';
function stripFocusPrefix(value) {
    return value && value.startsWith(FOCUS_PREFIX) ? value.slice(FOCUS_PREFIX.length) : (value || '');
}

async function loadBodeans(page) {
    await loadFromDiskFixture(page, { url: BODEANS_URL, fixturePath: FIXTURE_PATH, testMode: true });
    // waitForAutoResize: false — loadFromDiskFixture()'s hydration path
    // never triggers the auto-resize pass (that only runs from
    // startFetchingProcess()'s live-fetch path).
    await waitForRenderComplete(page, { waitForAutoResize: false, timeout: 60000 });
}

/**
 * A few disk-restored columns (confirmed live: Relationships) finish
 * populating an event-loop tick or two AFTER waitForRenderComplete()'s own
 * signal — that signal has no feature-specific awareness of them.
 * `hasCaaOrEaa`/`hasRelationships` on waitForRenderComplete() itself hang
 * indefinitely for a disk-fixture load (those completion signals are only
 * ever driven by the live-fetch pipeline) — confirmed live, do NOT pass
 * them here. A short fixed settle is the pragmatic fix.
 */
async function settleRelationships(page) {
    await page.waitForTimeout(3000);
}

function colFilterInput(page, columnName) {
    const idx = COLUMN_INDEX[columnName];
    return page.locator(`table.tbl thead .mb-col-filter-input[data-col-idx="${idx}"]`).first();
}

async function setModifierCheckboxes(page, { caseSensitive, regExp, exclude } = {}) {
    const cc = page.locator('#mb-global-filter-case-checkbox');
    const rx = page.locator('#mb-global-filter-rx-checkbox');
    const ex = page.locator('#mb-global-filter-exclude-checkbox');
    if (caseSensitive) await cc.check(); else if (await cc.isChecked()) await cc.uncheck();
    if (regExp) await rx.check(); else if (await rx.isChecked()) await rx.uncheck();
    if (exclude) await ex.check(); else if (await ex.isChecked()) await ex.uncheck();
}

/**
 * Applies one §A/§B-style column-filter case. Modifier checkboxes (Cc/Rx/Ex)
 * are the single global triad this `tableMode: 'single'` page has — see
 * the plan's Context section — so they govern this column filter too.
 */
async function applyColumnFilter(page, caseDef) {
    await setModifierCheckboxes(page, caseDef);
    const input = colFilterInput(page, caseDef.column);
    // Column filter inputs are readonly-until-a-genuine-trusted-interaction
    // (anti-autofill hardening) — .click() lifts that, and typing must go
    // through .pressSequentially() (real per-key events), never .fill().
    await input.click();
    await waitForFilterSettled(page, () => input.pressSequentially(caseDef.value));
}

/**
 * Clears a filter input via repeated single-key Backspace presses from the
 * end. Confirmed live: BOTH keyboard Ctrl+A and Playwright's own
 * `.selectText()` end up selecting a range that does NOT include a
 * leading "🔍 " icon glyph the userscript prepends to the input's own
 * `.value` (`stripColFilterPrefix()` in `getColFilters()` strips it back
 * off before checking emptiness) — and a single Backspace over that
 * selection silently no-ops rather than deleting it. Pressing Backspace
 * one character at a time from the end reliably stops right at the icon
 * boundary (confirmed live: repeating it `value.length` times leaves
 * exactly `"🔍 "`, which the userscript treats as empty) — never `.fill()`,
 * for the same real-per-key-event reason `applyColumnFilter()` uses
 * `.pressSequentially()` instead.
 *
 * @param {import('@playwright/test').Locator} input
 */
async function clearFilterInput(input) {
    const current = await input.inputValue();
    if (!stripFocusPrefix(current)) return;
    await input.click();
    await input.press('End');
    for (let i = 0; i < current.length; i++) {
        await input.press('Backspace');
    }
}

async function clearColumnFilter(page, columnName) {
    const input = colFilterInput(page, columnName);
    const current = await input.inputValue();
    if (!stripFocusPrefix(current)) return;
    await waitForFilterSettled(page, () => clearFilterInput(input));
}

async function clearGlobalFilter(page) {
    const globalInput = page.locator('#mb-global-filter-input');
    const current = await globalInput.inputValue();
    if (!stripFocusPrefix(current)) return;
    await waitForFilterSettled(page, () => clearFilterInput(globalInput));
}

/**
 * Clears the global filter plus every given column. Pass the exact
 * column(s) touched since the last clear (§A/§F's per-case loops always
 * know this) rather than looping over all 21 columns unconditionally —
 * each `clearColumnFilter()` call is a real round-trip even when it's a
 * cheap no-op read, and 21x that per case (35+ cases in §A alone) was
 * enough overhead to push the consolidated test past Playwright's default
 * timeout. Defaults to every column for callers that don't know exactly
 * what's dirty (§C/§K, run far fewer times each).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string[]} [columns] - Column names to clear; defaults to all.
 */
async function clearAllFilters(page, columns = Object.keys(COLUMN_INDEX)) {
    await clearGlobalFilter(page);
    for (const columnName of columns) {
        await clearColumnFilter(page, columnName);
    }
    await setModifierCheckboxes(page, {});
}

/**
 * Asserts a §A/§F case's `.mb-column-filter-highlight` expectation. See
 * `bodeansArtistReleasesFixture.js`'s `FILTER_CASES` JSDoc for the field
 * shapes this reads (`highlight`/`highlightRegex`/`highlightCaseInsensitive`).
 * Cross-tag cases with a confirmed highlight gap (`knownHighlightGap`) fall
 * through to the plain `highlight === null` -> "expect zero spans" path,
 * same as Ex-mode/always-empty-column cases — no special dispatch needed.
 */
function assertHighlight(actualSpans, caseDef) {
    if (caseDef.crossTag) {
        // A comment-boundary (or other cross-element) match produces TWO
        // highlight spans per matching row — see highlightCrossTag()'s own
        // JSDoc and debug/NOTES.md's 2026-08-29 entry. Every matching row
        // contributes exactly one of each fragment.
        const { spans } = caseDef.highlight;
        expect(actualSpans.length).toBe(caseDef.expected * spans.length);
        for (const fragment of spans) {
            expect(actualSpans.filter((s) => s === fragment).length).toBe(caseDef.expected);
        }
        return;
    }
    if (caseDef.skipHighlightCheck) return;
    if (caseDef.highlight === null && !caseDef.highlightRegex) {
        expect(actualSpans.length).toBe(0);
        return;
    }
    if (caseDef.expectHighlightCount !== undefined) {
        expect(actualSpans.length).toBe(caseDef.expectHighlightCount);
    } else {
        expect(actualSpans.length).toBeGreaterThan(0);
    }
    if (caseDef.highlightRegex) {
        const re = new RegExp(caseDef.highlightRegex);
        for (const s of actualSpans) expect(s).toMatch(re);
        return;
    }
    for (const s of actualSpans) {
        if (caseDef.highlightCaseInsensitive) {
            expect(s.toLowerCase()).toBe(caseDef.highlight.toLowerCase());
        } else {
            expect(s).toBe(caseDef.highlight);
        }
    }
}

/**
 * §I — asserts the filter-bar's stats/tooltip/button state matches the
 * currently active filter combination. Folded into every §A/§B/§C
 * `test.step` (rather than a handful of isolated checkpoints) so it runs
 * after every filter change in this suite for free, per the plan's own
 * point 5:
 *   - `#mb-filter-status-display`'s exact success text (`buildFilterStatusRegex()`).
 *   - `.mb-row-count-stat`'s `data-mbtt` tooltip content (`assertRowCountTooltip()`).
 *   - `#mb-toggle-filter-highlight-btn` visible whenever ANY filter (global or
 *     column) is active; `#mb-clear-column-filters-btn` visible whenever at
 *     least one COLUMN filter is active — see `updateFilterButtonsVisibility()`
 *     (ShowAllEntityData.user.js).
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ rowCount: number, totalCount?: number, global?: string, globalCaseSensitive?: boolean, columns?: Array<{column: string, value: string}> }} spec
 */
async function assertFilterUiState(page, { rowCount, totalCount = TOTAL_ROWS, global, globalCaseSensitive = false, columns = [] }) {
    const statusText = await getFilterStatusText(page);
    expect(statusText, 'filter-status text').toMatch(buildFilterStatusRegex({ rowCount, global, globalCaseSensitive, columns }));

    await assertRowCountTooltip(page, { filteredCount: rowCount, totalCount, global, columns });

    const anyFilterActive = !!global || columns.length > 0;
    const buttons = await getFilterButtonsState(page);
    expect(buttons.toggleHighlightVisible, '#mb-toggle-filter-highlight-btn visible').toBe(anyFilterActive);
    expect(buttons.clearColumnFiltersVisible, '#mb-clear-column-filters-btn visible').toBe(columns.length > 0);
}

/**
 * Asserts the SAME two buttons are hidden (no filter active) — the
 * post-`clearAllFilters()` counterpart of `assertFilterUiState()` above, so
 * every case also confirms the shown->hidden transition, not just the
 * shown state.
 *
 * @param {import('@playwright/test').Page} page
 */
async function assertFilterUiCleared(page) {
    const buttons = await getFilterButtonsState(page);
    expect(buttons.toggleHighlightVisible, '#mb-toggle-filter-highlight-btn hidden after clear').toBe(false);
    expect(buttons.clearColumnFiltersVisible, '#mb-clear-column-filters-btn hidden after clear').toBe(false);
}

// ─────────────────────────── §A — per-column filter cases ───────────────────────────

test('§A per-column typed filter cases', { tag: '@extended' }, async ({ page }) => {
    // 35+ cases, each a real apply+assert+clear round-trip — comfortably
    // over Playwright's 120s test-level default even after targeting
    // clearAllFilters() to just the touched column.
    test.setTimeout(240000);
    const pageErrors = collectPageErrors(page);
    await loadBodeans(page);

    for (const caseDef of FILTER_CASES) {
        const modifiers = [
            caseDef.caseSensitive && 'Cc',
            caseDef.regExp && 'Rx',
            caseDef.exclude && 'Ex',
        ].filter(Boolean).join('+');
        const title = `${caseDef.column} ~ "${caseDef.value}"${modifiers ? ` [${modifiers}]` : ''} -> ${caseDef.expected} rows`;

        await test.step(title, async () => {
            await applyColumnFilter(page, caseDef);

            if (caseDef.needsRelSettle) await settleRelationships(page);

            const after = await getPageRowCount(page);
            expect(after.filtered).toBe(caseDef.expected);
            expect(after.total).toBe(TOTAL_ROWS);

            const spans = await getColumnHighlightTexts(page, COLUMN_INDEX[caseDef.column]);
            assertHighlight(spans, caseDef);

            if (caseDef.checkCollapseHasMatch) {
                const sel = `table.tbl tbody tr td:nth-child(${COLUMN_INDEX[caseDef.column] + 1}) `
                    + `.mb-cell-collapse-toggle.mb-collapse-toggle-has-match`;
                await expect(page.locator(sel)).toHaveCount(caseDef.checkCollapseHasMatch.expectedCount);
            }

            await assertFilterUiState(page, {
                rowCount: caseDef.expected,
                columns: [{ column: caseDef.column, value: caseDef.value }],
            });

            await clearAllFilters(page, [caseDef.column]);
            await assertFilterUiCleared(page);
        });
    }

    expect(pageErrors).toEqual([]);
});

// ─────────────────────────── §A2 — chaban day-of-week third-party interop ───────────────────────────

test('§A2 chaban day-of-week third-party interop: Country/Date ~ "Tue"', { tag: '@extended' }, async ({ page }) => {
    const pageErrors = collectPageErrors(page);

    // Country/Date is a declared `collapsableColumns` entry — its
    // `initCollapsableColumns()` per-column pass REBUILDS `<td>` content
    // from the row's own stored source HTML on every filter-triggered
    // re-render. Confirmed live: the usual `injectThirdPartyScript()`
    // post-render DOM-mutation pattern (every OTHER third-party-interop
    // test in this repo) is visible immediately after injection but is
    // reliably WIPED the instant a column-filter keystroke fires a
    // re-render — 445 `.mb-day-of-week` spans present right after
    // injection, 0 present after typing one character into any filter.
    // `buildChabanPatchedFixture()` sidesteps this by patching the
    // weekday span directly into the fixture's own stored cell HTML
    // BEFORE it's ever loaded, so every rebuild-from-source re-render
    // faithfully includes it — see that helper's own JSDoc for the full
    // investigation.
    const patchedFixturePath = buildChabanPatchedFixture(FIXTURE_PATH, COLUMN_INDEX['Country/Date']);
    await loadFromDiskFixture(page, { url: BODEANS_URL, fixturePath: patchedFixturePath, testMode: true });
    await waitForRenderComplete(page, { waitForAutoResize: false, timeout: 60000 });

    const dayTuesdayCase = FILTER_CASES.find((c) => c.column === 'Day' && c.value === 'Tuesday');

    await test.step('Country/Date ~ "Tue" narrows to the same count as Day ~ "Tuesday"', async () => {
        await applyColumnFilter(page, { column: 'Country/Date', value: 'Tue' });

        const after = await getPageRowCount(page);
        // Cross-check: both are asserting "how many release events happened
        // on a Tuesday" — one via chaban's injected abbreviation, one via
        // ShowAllEntityData's own independently-computed synthetic "Day"
        // column (bodeansArtistReleasesFixture.js).
        expect(after.filtered).toBe(dayTuesdayCase.expected);
        expect(after.total).toBe(TOTAL_ROWS);

        const spans = await getColumnHighlightTexts(page, COLUMN_INDEX['Country/Date']);
        expect(spans.length).toBeGreaterThan(0);
        for (const s of spans) expect(s).toBe('Tue');

        await clearAllFilters(page, ['Country/Date']);
    });

    expect(pageErrors).toEqual([]);
});

// ─────────────────────────── §B — combo + ordering cases ───────────────────────────

test('§B combo and global+column order-pair cases', { tag: '@extended' }, async ({ page }) => {
    const pageErrors = collectPageErrors(page);
    await loadBodeans(page);

    for (const combo of COMBO_CASES) {
        await test.step(`combo: ${combo.name} -> ${combo.expected} rows`, async () => {
            for (const f of combo.filters) {
                await applyColumnFilter(page, f);
            }

            const after = await getPageRowCount(page);
            expect(after.filtered).toBe(combo.expected);

            // Highlighting independently in EACH filtered column.
            for (const f of combo.filters) {
                const spans = await getColumnHighlightTexts(page, COLUMN_INDEX[f.column]);
                expect(spans.length).toBeGreaterThan(0);
            }

            const orderedColumns = [...combo.filters]
                .sort((a, b) => COLUMN_INDEX[a.column] - COLUMN_INDEX[b.column])
                .map((f) => ({ column: f.column, value: f.value }));
            await assertFilterUiState(page, { rowCount: combo.expected, columns: orderedColumns });

            await clearAllFilters(page, combo.filters.map((f) => f.column));
            await assertFilterUiCleared(page);
        });
    }

    await test.step('global+column order pair: global first, then column', async () => {
        const globalInput = page.locator('#mb-global-filter-input');
        await globalInput.click();
        await waitForFilterSettled(page, () => globalInput.pressSequentially(ORDER_PAIR_CASE.globalValue));
        expect((await getPageRowCount(page)).filtered).toBe(ORDER_PAIR_CASE.globalExpected);

        await applyColumnFilter(page, { column: ORDER_PAIR_CASE.column, value: ORDER_PAIR_CASE.columnValue });
        const after = await getPageRowCount(page);
        expect(after.filtered).toBe(ORDER_PAIR_CASE.combinedExpected);

        const globalSpans = await getGlobalHighlightTexts(page);
        expect(globalSpans.length).toBeGreaterThan(0);
        const colSpans = await getColumnHighlightTexts(page, COLUMN_INDEX[ORDER_PAIR_CASE.column]);
        expect(colSpans.length).toBeGreaterThan(0);

        await assertFilterUiState(page, {
            rowCount: ORDER_PAIR_CASE.combinedExpected,
            global: ORDER_PAIR_CASE.globalValue,
            columns: [{ column: ORDER_PAIR_CASE.column, value: ORDER_PAIR_CASE.columnValue }],
        });

        await clearAllFilters(page, [ORDER_PAIR_CASE.column]);
        await assertFilterUiCleared(page);
    });

    await test.step('global+column order pair: column first, then global', async () => {
        await applyColumnFilter(page, { column: ORDER_PAIR_CASE.column, value: ORDER_PAIR_CASE.columnValue });
        expect((await getPageRowCount(page)).filtered).toBe(ORDER_PAIR_CASE.columnExpected);

        const globalInput = page.locator('#mb-global-filter-input');
        await globalInput.click();
        await waitForFilterSettled(page, () => globalInput.pressSequentially(ORDER_PAIR_CASE.globalValue));

        const after = await getPageRowCount(page);
        expect(after.filtered).toBe(ORDER_PAIR_CASE.combinedExpected);

        const globalSpans = await getGlobalHighlightTexts(page);
        expect(globalSpans.length).toBeGreaterThan(0);
        const colSpans = await getColumnHighlightTexts(page, COLUMN_INDEX[ORDER_PAIR_CASE.column]);
        expect(colSpans.length).toBeGreaterThan(0);

        await assertFilterUiState(page, {
            rowCount: ORDER_PAIR_CASE.combinedExpected,
            global: ORDER_PAIR_CASE.globalValue,
            columns: [{ column: ORDER_PAIR_CASE.column, value: ORDER_PAIR_CASE.columnValue }],
        });

        await clearAllFilters(page, [ORDER_PAIR_CASE.column]);
        await assertFilterUiCleared(page);
    });

    expect(pageErrors).toEqual([]);
});

// ─────────────────────────── §C — sort-then-restore checkpoints ───────────────────────────

test('§C sort-then-restore checkpoints preserve row count across every scenario', { tag: '@extended' }, async ({ page }) => {
    const pageErrors = collectPageErrors(page);
    await loadBodeans(page);

    for (const cp of SORT_CHECKPOINTS) {
        await test.step(`checkpoint: ${cp.name}`, async () => {
            await clearAllFilters(page);

            if (cp.name === 'after order-pair result') {
                const globalInput = page.locator('#mb-global-filter-input');
                await globalInput.click();
                await waitForFilterSettled(page, () => globalInput.pressSequentially(ORDER_PAIR_CASE.globalValue));
            }
            for (const f of cp.filters) {
                await applyColumnFilter(page, f);
            }

            const before = await getPageRowCount(page);
            expect(before.filtered, `checkpoint "${cp.name}" pre-sort count`).toBe(cp.expectedCount);

            // Stats/tooltip/button UI state — only for checkpoints with an
            // active filter; "baseline" (nothing ever typed on a freshly
            // loaded page) has an ambiguous pre-interaction status-text/
            // button state not worth asserting against.
            if (cp.filters.length > 0 || cp.name === 'after order-pair result') {
                await assertFilterUiState(page, {
                    rowCount: cp.expectedCount,
                    global: cp.name === 'after order-pair result' ? ORDER_PAIR_CASE.globalValue : undefined,
                    columns: cp.filters.map((f) => ({ column: f.column, value: f.value })),
                });
            }

            const columnTh = page.locator(`table.tbl thead th[data-col-name="${cp.sortColumn}"]`).first();
            const ascBtn = columnTh.locator('.sort-icon-btn', { hasText: '▲' }).first();
            const descBtn = columnTh.locator('.sort-icon-btn', { hasText: '▼' }).first();
            const restoreBtn = columnTh.locator('.sort-icon-btn', { hasText: '⇅' }).first();

            await waitForSortSettled(page, () => ascBtn.click());
            expect((await getPageRowCount(page)).filtered, `checkpoint "${cp.name}" after asc sort`).toBe(cp.expectedCount);

            await waitForSortSettled(page, () => descBtn.click());
            expect((await getPageRowCount(page)).filtered, `checkpoint "${cp.name}" after desc sort`).toBe(cp.expectedCount);

            await waitForSortSettled(page, () => restoreBtn.click());
            expect((await getPageRowCount(page)).filtered, `checkpoint "${cp.name}" after restore`).toBe(cp.expectedCount);
        });
    }

    expect(pageErrors).toEqual([]);
});

// ─────────────────────────── §D — uniq-dropdown checks, filters cleared ───────────────────────────

test('§D uniq-dropdown contents (filters cleared) are self-consistent and survive a reopen', { tag: '@extended' }, async ({ page }) => {
    const pageErrors = collectPageErrors(page);
    await loadBodeans(page);

    for (const columnName of UNIQ_DROP_COLUMNS_CLEARED) {
        await test.step(`"${columnName}" dropdown is non-empty and survives a reopen`, async () => {
            const before = await page.evaluate((col) => window.__saTest.getUniqDropSections(col), columnName);
            expect(before.length, `"${columnName}" dropdown has at least one section`).toBeGreaterThan(0);
            const totalItemsBefore = before.reduce((sum, s) => sum + s.items.length, 0);
            expect(totalItemsBefore, `"${columnName}" dropdown has at least one item`).toBeGreaterThan(0);

            await page.evaluate(() => window.__saTest.closeUniqDrop());
            const after = await page.evaluate((col) => window.__saTest.getUniqDropSections(col), columnName);
            expect(after, `"${columnName}" dropdown identical after reopen`).toEqual(before);
        });
    }

    // Format: faceted sections (NOT a flat "Values" list — confirmed live,
    // see bodeansArtistReleasesFixture.js's own §F JSDoc for the same
    // correction). Check the "Format info - Type" facet's exact counts.
    await test.step('Format "Type" facet has the expected exact counts', async () => {
        const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Format'));
        const typeSection = sections.find((s) => s.label.includes('Type'));
        expect(typeSection, 'Format has a Type facet section').toBeTruthy();
        const byLabel = Object.fromEntries(typeSection.items.map((i) => [i.label.replace(/^.*type:\s*/i, '').trim(), i.count]));
        expect(byLabel.CD).toBe(42);
        expect(byLabel['Digital Media']).toBe(8);
    });

    // Artist: like Format/Label/Country/Barcode, this is NOT a flat value
    // list either — confirmed live it's a "Flags - Name variation" /
    // "Name variations" facet pair instead (the mixed-case "Bodeans"
    // credit surfaces as a name-variation entry, not a simple case-distinct
    // item). Check the flag count the raw HTML analysis already
    // established (1 row) rather than assuming a specific item-label shape.
    await test.step('Artist dropdown flags the one name-variation row', async () => {
        const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Artist'));
        const flags = sections.find((s) => s.label.includes('Name variation'));
        expect(flags, 'Artist has a Name-variation flags section').toBeTruthy();
        const hasVariation = flags.items.find((i) => /name variation/i.test(i.label));
        expect(hasVariation.count).toBe(1);
    });

    // CAA: yes/no sentinel-based bucketing sums to 37/19 in Structure.
    await test.step('CAA Structure section has/no-artwork counts', async () => {
        const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('CAA'));
        const structure = sections.find((s) => s.label === 'Structure');
        expect(structure, 'CAA has a Structure section').toBeTruthy();
        const hasArt = structure.items.find((i) => /has artwork/i.test(i.label));
        const noArt = structure.items.find((i) => /no artwork/i.test(i.label));
        expect(hasArt.count).toBe(37);
        expect(noArt.count).toBe(19);
    });

    // Primary alias: Structure section, all 56 rows empty.
    await test.step('Primary alias Structure section is 100% empty', async () => {
        const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Primary alias'));
        const structure = sections.find((s) => s.label === 'Structure');
        expect(structure, '"Primary alias" has a Structure section').toBeTruthy();
        const empty = structure.items.find((i) => /empty/i.test(i.label));
        expect(empty.count).toBe(56);
    });

    // Label: Structure section empty-count is 5.
    await test.step('Label Structure section empty-count is 5', async () => {
        const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Label'));
        const structure = sections.find((s) => s.label === 'Structure');
        expect(structure, '"Label" has a Structure section').toBeTruthy();
        const empty = structure.items.find((i) => /empty/i.test(i.label));
        expect(empty.count).toBe(5);
    });

    expect(pageErrors).toEqual([]);
});

// ─────────────────────────── §E — uniq-dropdown checks, one filter left active ───────────────────────────

test('§E uniq-dropdown contents with the Format~CD filter left active', { tag: '@extended' }, async ({ page }) => {
    const pageErrors = collectPageErrors(page);
    await loadBodeans(page);

    await applyColumnFilter(page, { column: UNIQ_DROP_ACTIVE_FILTER.column, value: UNIQ_DROP_ACTIVE_FILTER.value });
    expect((await getPageRowCount(page)).filtered).toBe(UNIQ_DROP_ACTIVE_FILTER.expected);

    // NOTE: these columns are faceted (multiple sections, e.g. Structure +
    // Type/Name/Code) — summing every item's count across every section
    // does NOT equal "total rows" even when unfiltered (facets overlap by
    // design), so this only documents which per-section counts look
    // filter-scoped vs whole-table-scoped, it does not assert a specific
    // "sum equals N" invariant.
    for (const columnName of UNIQ_DROP_COLUMNS_ACTIVE) {
        await test.step(`"${columnName}" dropdown while Format~CD is active`, async () => {
            const sections = await page.evaluate((col) => window.__saTest.getUniqDropSections(col), columnName);
            expect(sections.length).toBeGreaterThan(0);
            const totalItems = sections.reduce((sum, s) => sum + s.items.length, 0);
            expect(totalItems).toBeGreaterThan(0);
        });
    }

    expect(pageErrors).toEqual([]);
});

// ─────────────────────────── §F — uniq-dropdown-DRIVEN filtering ───────────────────────────

/** Opens `columnName`'s uniq-dropdown panel via its header 📊 button. */
async function openUniqDrop(page, columnName) {
    const th = page.locator(`table.tbl thead th[data-col-name="${columnName}"]`).first();
    const uniqBtn = th.locator('.mb-col-uniq-wrap').first();
    await uniqBtn.click();
}

/** Clicks one item (by its exact `title` attribute) inside the currently-open uniq-dropdown panel. */
function uniqDropItem(page, itemTitle) {
    return page.locator(`.mb-col-uniq-item[title="${itemTitle}"], .mb-col-uniq-item[title^="${itemTitle} —"]`).first();
}

test('§F uniq-dropdown-DRIVEN filtering (single value, combination, cross-column)', { tag: '@extended' }, async ({ page }) => {
    test.setTimeout(180000);
    const pageErrors = collectPageErrors(page);
    await loadBodeans(page);

    for (const caseDef of UNIQ_DROP_SINGLE_CASES) {
        await test.step(`single value: ${caseDef.column} check "${caseDef.itemTitle}" -> ${caseDef.expected} rows`, async () => {
            await openUniqDrop(page, caseDef.column);
            const item = uniqDropItem(page, caseDef.itemTitle);
            await waitForFilterSettled(page, () => item.click());

            const after = await getPageRowCount(page);
            expect(after.filtered).toBe(caseDef.expected);

            const spans = await getColumnHighlightTexts(page, COLUMN_INDEX[caseDef.column]);
            if (caseDef.highlightExpected) {
                expect(spans.length).toBeGreaterThan(0);
            } else {
                expect(spans.length).toBe(0);
            }

            await clearAllFilters(page, [caseDef.column]);
        });
    }

    for (const combo of UNIQ_DROP_COMBO_CASES) {
        await test.step(`combination: ${combo.name} -> ${combo.expected} rows`, async () => {
            await openUniqDrop(page, combo.column);
            for (const itemTitle of combo.itemTitles) {
                const item = uniqDropItem(page, itemTitle);
                await waitForFilterSettled(page, () => item.click());
            }

            const after = await getPageRowCount(page);
            expect(after.filtered).toBe(combo.expected);

            const spans = await getColumnHighlightTexts(page, COLUMN_INDEX[combo.column]);
            if (combo.highlightExpected) {
                expect(spans.length).toBeGreaterThan(0);
            } else {
                expect(spans.length).toBe(0);
            }

            await clearAllFilters(page, [combo.column]);
        });
    }

    await test.step('cross-column combo: Format CD (dropdown) AND Country United States (US) (dropdown)', async () => {
        const { columnA, itemA, columnB, itemB, expected } = UNIQ_DROP_CROSS_COLUMN_COMBO;

        await openUniqDrop(page, columnA);
        await waitForFilterSettled(page, () => uniqDropItem(page, itemA).click());
        await page.evaluate(() => window.__saTest.closeUniqDrop());

        await openUniqDrop(page, columnB);
        await waitForFilterSettled(page, () => uniqDropItem(page, itemB).click());

        const after = await getPageRowCount(page);
        expect(after.filtered).toBe(expected);

        // Country's flat combined "Name (Code)" dropdown entry doesn't
        // highlight (confirmed live — see UNIQ_DROP_SINGLE_CASES' own note
        // on this exact item), so columnB produces zero spans here too.
        const spansB = await getColumnHighlightTexts(page, COLUMN_INDEX[columnB]);
        expect(spansB.length).toBe(0);

        await clearAllFilters(page, [columnA, columnB]);
    });

    expect(pageErrors).toEqual([]);
});

// ─────────────────────────── §J — pre-filtered disk-load repeat (CONFIGURABLE, opt-in) ───────────────────────────

test.describe('§J pre-filtered disk-load repeat', () => {
    test.skip(!process.env.TEST_PREFILTER_LOAD, 'set TEST_PREFILTER_LOAD=1 to run this (roughly doubles suite duration)');

    /**
     * Drives the Load-from-Disk dialog's REAL filtered-load path end to
     * end — Phase 1 (file select) -> Phase 2 "Filter Data"
     * (`#sa-filter-confirm`) -> Phase 3 "Render Data" (`#sa-render-confirm`)
     * — with query `"BoDeans"` and the `#sa-load-case` (Case Sensitive)
     * checkbox enabled, per explicit request. Earlier drafts of this
     * section called the shared `loadFromDiskFixture()` helper, which per
     * its own JSDoc always drives the OTHER "Render All Rows"
     * (`#sa-render-no-filter-confirm`) path — that never actually exercised
     * a genuine pre-filtered load despite this section's name, so it's
     * driven directly here instead. The exact match count is read back from
     * the dialog's own Phase-2 status text (`#sa-ld-filter-status`) rather
     * than hardcoded, since it depends on live BoDeans data.
     */
    test('re-runs a representative subset of §A/§B against a genuine "BoDeans" pre-filtered load', { tag: '@extended' }, async ({ page }) => {
        const pageErrors = collectPageErrors(page);

        await loadUserscriptPage(page, { url: BODEANS_URL, testMode: true });
        await page.click('#mb-load-from-disk-btn');

        const fileInput = page.locator('input[type="file"][accept*="json"]');
        await fileInput.setInputFiles(FIXTURE_PATH);

        const filterInput = page.locator('#sa-load-filter-input');
        await filterInput.click();
        await filterInput.pressSequentially('BoDeans');
        await page.check('#sa-load-case');
        await page.click('#sa-filter-confirm');

        const filterStatusText = await page.locator('#sa-ld-filter-status').textContent();
        const m = (filterStatusText || '').match(/^(\d+) of (\d+) rows? match/);
        expect(m, `Phase-2 filter status text is parseable: ${JSON.stringify(filterStatusText)}`).toBeTruthy();
        const matchCount = Number(m[1]);
        const totalRows = Number(m[2]);
        expect(matchCount).toBeGreaterThan(0);
        expect(matchCount).toBeLessThanOrEqual(totalRows);
        expect(totalRows).toBe(TOTAL_ROWS);

        await page.click('#sa-render-confirm');
        await waitForRenderComplete(page, { waitForAutoResize: false, timeout: 60000 });

        // Row count after the filtered load matches Phase 2's own reported count.
        const after = await getPageRowCount(page);
        expect(after.filtered).toBe(matchCount);
        expect(after.total).toBe(matchCount);

        // #mb-toggle-prefilter-btn — visible with the exact
        // updatePrefilterToggleButton() template, using the SAME matchCount
        // just read from the dialog (self-consistent rather than a
        // hardcoded guess at BoDeans' real live data).
        const prefilterBtn = await getPrefilterButtonState(page);
        expect(prefilterBtn.visible).toBe(true);
        expect(prefilterBtn.text).toBe(`🎨 ${matchCount} of ${totalRows} rows prefiltered: "BoDeans"`);

        // The loading-filter string is highlighted on the rendered rows —
        // loadTableDataFromDisk() applies highlightText(row, query, ...,
        // 'prefilter') per row, producing `.mb-pre-filter-highlight` spans
        // (ShowAllEntityData.user.js:33874/33978).
        const prefilterSpans = await page.$$eval(
            'table.tbl tbody tr td .mb-pre-filter-highlight',
            (spans) => spans.map((s) => s.textContent)
        );
        expect(prefilterSpans.length).toBeGreaterThan(0);
        for (const s of prefilterSpans) expect(s).toBe('BoDeans');

        // Representative subset: a handful of §A cases re-run against this
        // pre-narrowed starting set — confirming the MECHANISM (filtering
        // still works correctly on top of a pre-filtered load) rather than
        // re-deriving exact intersection numbers for every case.
        const preFilteredCases = FILTER_CASES.filter((c) => ['Country', 'CAA', 'Barcode'].includes(c.column));
        for (const caseDef of preFilteredCases) {
            await test.step(`pre-filtered: ${caseDef.column} ~ "${caseDef.value}"`, async () => {
                await applyColumnFilter(page, caseDef);
                const afterCase = await getPageRowCount(page);
                expect(afterCase.filtered).toBeLessThanOrEqual(matchCount);
                expect(afterCase.total).toBeLessThanOrEqual(matchCount);
                await clearColumnFilter(page, caseDef.column);
            });
        }

        expect(pageErrors).toEqual([]);
    });
});

// ─────────────────────────── §K — column-visibility architecture exercise (CONFIGURABLE, opt-in) ───────────────────────────

// The 9 non-native/synthetic columns requested — COLUMN_INDEX 12-20, a
// contiguous block immediately after "Total Tracks" (11). Note "Primary
// alias" (lowercase "a") — matches COLUMN_INDEX exactly.
const COLVIS_HIDE_COLUMNS = [
    'DD', 'MM', 'YYYY', 'Day', 'Month', 'MB-Name', 'Comment', 'Primary alias', 'Relationships',
];

test.describe('§K column-visibility architecture exercise', () => {
    test.skip(!process.env.TEST_COLVIS, 'set TEST_COLVIS=1 to run this');

    /**
     * Column checkboxes inside the 👁️ menu are plain, class-less `<div>`
     * wrappers around `<input id="mb-col-vis-N"><label for="mb-col-vis-N">`
     * (`addColumnVisibilityToggle()`, ShowAllEntityData.user.js) — an
     * earlier draft of this test targeted `.mb-colvis-menu-item`, a CSS
     * class that does not exist anywhere in the real DOM (confirmed via a
     * full-file grep), so that locator could never have matched live
     * markup. `getByLabel()` works via the real `label[for]`<->`input#id`
     * association instead.
     */
    function colVisCheckbox(page, columnName) {
        return page.getByLabel(columnName, { exact: true });
    }

    test('hiding then re-showing 9 columns does not break filtering on other columns', { tag: '@extended' }, async ({ page }) => {
        const pageErrors = collectPageErrors(page);
        await loadBodeans(page);

        // Filtering an UNRELATED column works (baseline, all columns still visible).
        await applyColumnFilter(page, { column: 'Format', value: 'CD' });
        expect((await getPageRowCount(page)).filtered).toBe(42);
        await clearColumnFilter(page, 'Format');

        // Apply a filter on "Comment" — one of the 9 columns about to be
        // hidden — WHILE it's still visible. Hiding a column's `<th>`/filter
        // input via the 👁️ menu makes that input non-interactable
        // (`display:none`), so a filter can't be TYPED into an
        // already-hidden column through the UI — the meaningful thing to
        // demonstrate per the plan's "text-content matching is independent
        // of CSS visibility" claim is that an ALREADY-ACTIVE filter keeps
        // narrowing rows correctly after its own column is hidden, not that
        // a hidden input remains clickable (it doesn't, by design).
        await applyColumnFilter(page, { column: 'Comment', value: 'BMG' });
        expect((await getPageRowCount(page)).filtered).toBe(2);

        // Open the 👁️ column-visibility menu once and uncheck all 9,
        // including "Comment", which still has that filter active.
        await page.click('#mb-visible-btn');
        for (const columnName of COLVIS_HIDE_COLUMNS) {
            await colVisCheckbox(page, columnName).uncheck();
        }
        await page.keyboard.press('Escape'); // close the menu

        for (const columnName of COLVIS_HIDE_COLUMNS) {
            const th = page.locator(`table.tbl thead th[data-col-name="${columnName}"]`).first();
            await expect(th, `"${columnName}" header hidden`).toBeHidden();
        }

        // The "Comment" filter still narrows to 2 rows even though its own
        // column is now hidden — text-content matching is independent of
        // CSS visibility.
        expect((await getPageRowCount(page)).filtered, 'Comment filter still active after its column is hidden').toBe(2);

        // Re-show all 9.
        await page.click('#mb-visible-btn');
        for (const columnName of COLVIS_HIDE_COLUMNS) {
            await colVisCheckbox(page, columnName).check();
        }
        await page.keyboard.press('Escape');

        for (const columnName of COLVIS_HIDE_COLUMNS) {
            const th = page.locator(`table.tbl thead th[data-col-name="${columnName}"]`).first();
            await expect(th, `"${columnName}" header visible again`).toBeVisible();
        }

        // Now that "Comment" is visible again, its filter input is
        // interactable again — clear it normally.
        await clearColumnFilter(page, 'Comment');
        expect((await getPageRowCount(page)).filtered).toBe(TOTAL_ROWS);

        expect(pageErrors).toEqual([]);
    });
});
