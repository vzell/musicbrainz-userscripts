'use strict';

const { test, expect } = require('../support/test');
const { loadUserscriptPageWithRealNetwork } = require('../support/realNetworkGmXhr');
const { collectPageErrors, clickMasterToggleAndExpandAll } = require('../support/liveAssertions');
const { waitForCaaEaaComplete, waitForRelationshipsComplete } = require('../support/asyncCompletion');
const {
    waitForFilterSettled, waitForSortSettled,
    getPageRowCount, getSubTableRowCounts,
} = require('../support/filterSortAssertions');
const {
    URL, TOTAL_ROWS, GROUPS, COLUMN_INDEX,
    PROMOTION_FILTER_CASES, PROMOTION_COMBO_CASES,
    OFFICIAL_FILTER_CASES, OFFICIAL_COMBO_CASES,
    INTERLEAVE_CASES, SORT_CHECKPOINTS, CAA_HIGHLIGHT_FILTER,
    UNIQ_DROP_COLUMNS_CLEARED, UNIQ_DROP_ACTIVE_FILTER,
} = require('../support/greetingsReleaseGroupReleasesFixture');

/**
 * Comprehensive filter/sort/highlight/uniq-dropdown regression coverage for
 * `releasegroup-releases` (tableMode: 'multi') — Bruce Springsteen's
 * "Greetings From Asbury Park, N.J." release group. This is the multi-table
 * sibling of `artist-releases-filter-sort.spec.js`: existing multi-table
 * specs for this pageType (filter-global/filter-column/filter-subtable/
 * sort-column/subtable-filter-sort-caa-interaction) all share one thin pilot
 * page (7 rows/2 groups) and never exercise highlight spans, the
 * uniq-dropdown, Cc/Rx/Ex modifiers, or combo/order-pair cases on this
 * pageType at all — that's the gap this suite fills.
 *
 * REAL NETWORK ONLY throughout (`loadUserscriptPageWithRealNetwork`, not a
 * disk fixture) — every test needs real CAA data. This is deliberately
 * slower than the artist-releases disk-fixture suite (a full setup —
 * 2-page pagination + real CAA fetch for ~119 images — takes ~2 minutes by
 * itself, confirmed live) — scenarios are grouped into a handful of
 * `test()`s with many `test.step()`s each, exactly like the reference
 * spec's own PERFORMANCE rationale, to avoid paying that cost once per case.
 *
 * Architecture notes load-bearing for every helper below (verified directly
 * against ShowAllEntityData.user.js's source, not assumed — see the plan):
 *   1. Column filters are genuinely PER-SUB-TABLE — `runFilter()`'s
 *      multi-table branch calls `getColFilters()` once per group's own
 *      table. A column-filter locator must be scoped by table index.
 *   2. Cc/Rx/Ex modifiers for a COLUMN filter are governed by that
 *      column's own SUB-TABLE's STF checkboxes
 *      (`#mb-stf-{TableName}-{case,rx,ex}-checkbox`), NOT the global triad —
 *      confirmed via an explicit `runFilter()` code comment. The global
 *      triad (`#mb-global-filter-*-checkbox`) affects ONLY the global filter.
 *   3. `window.__saTest.getUniqDropSections()` is NOT table-scoped — it
 *      resolves to the FIRST matching `<th>` page-wide (always "Official
 *      release", table index 0). "Promotion release" needs a table-scoped
 *      local helper instead (see `getUniqDropSectionsForTable()`).
 *
 * "Big picture image stripe" (the task's own phrase) refers to the NATIVE
 * MusicBrainz cover-art "bigbox" thumbnail row shown above/near each h3
 * section — toggled via `#mb-caa-toggle-btn-global`/`#mb-caa-toggle-btn-{i}`
 * — NOT the injected "CAA" COLUMN's own per-cell inline stripe (a separate
 * mechanism, toggled via `#mb-caa-col-hdr-toggle-all-btn-caa`/
 * `[data-caa-expand-btn]`). Both default to collapsed
 * (`sa_caa_pics_initially_collapsed`) and are expanded in setup below, since
 * the sort-regression block's v9.99.970 CAA-highlight-duplication guard
 * needs the CAA COLUMN's own stripe expanded, while the task's own step 3
 * asks for the bigbox stripe specifically.
 */

const SHOW_ALL_BUTTON = 'button[data-label="Show all Releases for ReleaseGroup"]';

/**
 * Shared setup: real-network load -> "Show all" -> wait for full render +
 * CAA/Relationships completion -> reveal every sub-table (master toggle) ->
 * expand the native bigbox CAA stripe (global) -> expand the CAA COLUMN's
 * own per-cell stripe (global) -> reveal each target group's own STF input.
 *
 * @param {import('@playwright/test').Page} page
 */
async function setupExpandedGreetingsPage(page) {
    await loadUserscriptPageWithRealNetwork(page, { url: URL, testMode: true });

    const showAllBtn = page.locator(SHOW_ALL_BUTTON);
    await expect(showAllBtn).toBeVisible({ timeout: 30000 });
    await showAllBtn.click();
    await expect(page.locator('#mb-filter-container')).toBeVisible({ timeout: 120000 });

    // 124 rows across a 2-page paginated fetch + real CAA network for ~119
    // images — confirmed live to take up to ~2 minutes.
    await waitForCaaEaaComplete(page, { timeout: 280000 });
    // Confirmed live: 60s was occasionally too tight for 124 rows'
    // worth of real Relationships icon data — some test() runs passed,
    // others timed out here under normal network variance. Matches the
    // CAA wait's own generous budget for the same reason.
    await waitForRelationshipsComplete(page, { timeout: 150000 });

    await clickMasterToggleAndExpandAll(page);

    const globalBigboxBtn = page.locator('#mb-caa-toggle-btn-global');
    await expect(globalBigboxBtn).toBeVisible({ timeout: 15000 });
    await globalBigboxBtn.click();

    const globalCaaColBtn = page.locator('#mb-caa-col-hdr-toggle-all-btn-caa');
    await expect(globalCaaColBtn).toBeVisible({ timeout: 15000 });
    await globalCaaColBtn.click();

    for (const groupLabel of [GROUPS.OFFICIAL.label, GROUPS.PROMOTION.label]) {
        const h3 = page.locator('h3.mb-toggle-h3', { hasText: groupLabel }).first();
        const toggleIcon = h3.locator('.mb-subtable-filter-toggle-icon');
        const caseCheckbox = page.locator(`#mb-stf-${groupLabel.replace(/ /g, '_')}-case-checkbox`);
        // Confirmed live (intermittent): the STF panel occasionally doesn't
        // reveal on the first click — every later helper
        // (setSubTableModifierCheckboxes/stfInput) depends on it being
        // open, and a silent no-op here surfaces much later as an opaque
        // "locator never resolves" timeout deep inside some other
        // test.step. Verify the click actually worked and retry once.
        await toggleIcon.click();
        try {
            await caseCheckbox.waitFor({ state: 'visible', timeout: 5000 });
        } catch {
            await toggleIcon.click();
            await caseCheckbox.waitFor({ state: 'visible', timeout: 10000 });
        }
    }
}

// A focused filter input carries a decorative "🔍 " prefix — see the
// reference spec's own FOCUS_PREFIX JSDoc for why every emptiness check
// must strip it first.
const FOCUS_PREFIX = '🔍 ';
function stripFocusPrefix(value) {
    return value && value.startsWith(FOCUS_PREFIX) ? value.slice(FOCUS_PREFIX.length) : (value || '');
}

/** Locates one sub-table's own column-filter input — see architecture note 1. */
function colFilterInput(page, tableIndex, columnName) {
    const idx = COLUMN_INDEX[columnName];
    return page.locator('table.tbl').nth(tableIndex).locator(`.mb-col-filter-input[data-col-idx="${idx}"]`).first();
}

function stfInput(page, groupLabel) {
    return page.locator('h3.mb-toggle-h3', { hasText: groupLabel }).first()
        .locator('.mb-subtable-filter-container input[type="search"]');
}

function globalFilterInput(page) {
    return page.locator('#mb-global-filter-input');
}

async function setGlobalModifierCheckboxes(page, { caseSensitive, regExp, exclude } = {}) {
    const cc = page.locator('#mb-global-filter-case-checkbox');
    const rx = page.locator('#mb-global-filter-rx-checkbox');
    const ex = page.locator('#mb-global-filter-exclude-checkbox');
    if (caseSensitive) await cc.check(); else if (await cc.isChecked()) await cc.uncheck();
    if (regExp) await rx.check(); else if (await rx.isChecked()) await rx.uncheck();
    if (exclude) await ex.check(); else if (await ex.isChecked()) await ex.uncheck();
}

/** Sets one sub-table's OWN Cc/Rx/Ex checkboxes — see architecture note 2. */
async function setSubTableModifierCheckboxes(page, groupLabel, { caseSensitive, regExp, exclude } = {}) {
    const pfx = `mb-stf-${groupLabel.replace(/ /g, '_')}`;
    const cc = page.locator(`#${pfx}-case-checkbox`);
    const rx = page.locator(`#${pfx}-rx-checkbox`);
    const ex = page.locator(`#${pfx}-ex-checkbox`);
    if (caseSensitive) await cc.check(); else if (await cc.isChecked()) await cc.uncheck();
    if (regExp) await rx.check(); else if (await rx.isChecked()) await rx.uncheck();
    if (exclude) await ex.check(); else if (await ex.isChecked()) await ex.uncheck();
}

/**
 * Backspaces a filter input clear one keystroke at a time (see the
 * reference spec's own JSDoc for why — Ctrl+A/`.selectText()`/`.fill()`
 * are all confirmed unreliable for this icon-prefixed input). Each
 * individual `.press()` gets a SHORT explicit timeout (not this suite's own
 * much larger 300s test-level budget) — confirmed live: on the 119-row
 * Official release table, a mid-backspace partial-substring re-render
 * (e.g. clearing "SOPL-248" one character at a time re-filters against
 * "SOPL-24", "SOPL-2", … at every step, each a real, if brief, re-render)
 * can occasionally leave the input transiently unstable for longer than a
 * single keystroke should ever need — without a short per-press timeout, a
 * genuinely stuck press silently consumes the ENTIRE remaining test
 * budget before failing, taking down every later test.step in the same
 * test() with it. Failing fast here (and letting the caller's own
 * post-clear count assertion catch a truly incomplete clear) is far
 * cheaper than that.
 */
async function clearFilterInputEl(input) {
    const current = await input.inputValue();
    if (!stripFocusPrefix(current)) return;
    await input.click({ timeout: 10000 });
    await input.press('End', { timeout: 10000 });
    for (let i = 0; i < current.length; i++) {
        await input.press('Backspace', { timeout: 5000 });
    }
}

/**
 * Polls a group's own `h3 .mb-row-count-stat` badge until its PARSED
 * filtered count equals `expectedCount` exactly.
 *
 * IMPORTANT — this is the robust replacement for text-settle-detection
 * (`waitForSubTableFilterSettled()`/`waitForFilterSettled()`) for
 * column/STF operations, adopted after TWO separate confirmed-live
 * failure modes of the settle-detection approach on this suite's small
 * ("Promotion release", 4 rows) group:
 *   1. Applying a filter whose result count equals the group's CURRENT
 *      total (a non-narrowing case) never changes the badge text at all,
 *      so "wait for a NEW value" times out — confirmed live, this is why
 *      PROMOTION_FILTER_CASES has no "matches all 4 rows" case.
 *   2. REMOVING one of several simultaneously-active filters can ALSO
 *      leave the badge text unchanged, whenever the remaining filters
 *      alone already produce the identical count (e.g. two predicates
 *      that are independently already unique to the same single row) —
 *      confirmed live while designing INTERLEAVE_CASES.PROMOTION.
 * Both failure modes disappear entirely once completion is judged by
 * "did the count reach the value I already know it should be", rather
 * than "did the text visibly change" — every case in this suite's fixture
 * already carries that expected value.
 *
 * `#mb-filter-status-display` (global-only text) is NOT affected by
 * either failure mode — see `applyGlobalFilter()`'s own note — so global
 * apply/clear keep using `waitForFilterSettled()`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} groupLabel
 * @param {number} expectedCount
 * @param {{ timeout?: number }} [opts]
 */
async function waitForGroupFilteredCount(page, groupLabel, expectedCount, { timeout = 30000 } = {}) {
    await page.waitForFunction(({ label, expected }) => {
        const h3s = Array.from(document.querySelectorAll('h3.mb-toggle-h3'));
        const h3 = h3s.find((h) => h.textContent.includes(label));
        if (!h3) return false;
        const stat = h3.querySelector('.mb-row-count-stat');
        if (!stat) return false;
        const m = (stat.textContent || '').trim().match(/^\((\d+)/);
        return m !== null && Number(m[1]) === expected;
    }, { label: groupLabel, expected: expectedCount }, { timeout });
    // Small settle buffer — confirmed live: the row-count-stat badge text
    // can update slightly before a large DOM rebuild (e.g. clearing back
    // to Official release's full 119 rows) has actually finished
    // re-appending every row, occasionally leaving the very NEXT action's
    // target element transiently unstable (mirrors the single-table
    // `waitForActualRowCount()` helper's own documented rationale for the
    // same race, in filterSortAssertions.js).
    await page.waitForTimeout(400);
}

/** Page-wide equivalent of `waitForGroupFilteredCount()` — polls `h2 .mb-row-count-stat`. */
async function waitForPageFilteredCount(page, expectedCount, { timeout = 30000 } = {}) {
    await page.waitForFunction((expected) => {
        const stat = document.querySelector('h2 .mb-row-count-stat');
        if (!stat) return false;
        const m = (stat.textContent || '').trim().match(/^\((\d+)/);
        return m !== null && Number(m[1]) === expected;
    }, expectedCount, { timeout });
    await page.waitForTimeout(400);
}

/**
 * Applies one column-filter case, scoped to a sub-table.
 *
 * `expectedCount`, when given, is awaited via `waitForGroupFilteredCount()`
 * (see that function's own JSDoc for why this replaced text-settle
 * detection). Pass `null` (the default) only for an INTERMEDIATE step
 * inside a multi-filter sequence (a combo, or thirdOrder's `columns` array)
 * where no precomputed intermediate count exists — falls back to a flat
 * settle delay, empirically sufficient for this page's near-instant
 * filtering (confirmed live via the fixture's own recording pass).
 */
async function applyColumnFilter(page, tableIndex, groupLabel, caseDef, expectedCount = null) {
    await setSubTableModifierCheckboxes(page, groupLabel, caseDef);
    const input = colFilterInput(page, tableIndex, caseDef.column);
    await input.click();
    await input.pressSequentially(caseDef.value);
    if (expectedCount !== null) await waitForGroupFilteredCount(page, groupLabel, expectedCount);
    else await page.waitForTimeout(2500);
}

async function clearColumnFilter(page, tableIndex, groupLabel, columnName, expectedCount = null) {
    const input = colFilterInput(page, tableIndex, columnName);
    const current = await input.inputValue();
    if (!stripFocusPrefix(current)) return;
    await clearFilterInputEl(input);
    if (expectedCount !== null) await waitForGroupFilteredCount(page, groupLabel, expectedCount);
    else await page.waitForTimeout(2500);
    await setSubTableModifierCheckboxes(page, groupLabel, {});
}

async function applySubTableFilter(page, groupLabel, value, expectedCount = null, modifiers = {}) {
    await setSubTableModifierCheckboxes(page, groupLabel, modifiers);
    const input = stfInput(page, groupLabel);
    await input.click();
    await input.pressSequentially(value);
    if (expectedCount !== null) await waitForGroupFilteredCount(page, groupLabel, expectedCount);
    else await page.waitForTimeout(2500);
}

/**
 * Clears the Sub-Table Filter (STF) via its OWN dedicated clear button
 * (`#mb-stf-{TableName}-clear`), NOT character-by-character backspacing —
 * confirmed live this is the reliable mechanism (the existing
 * `subtable-filter-sort-caa-interaction.spec.js` already uses it, exactly
 * this way). A first draft copied the column-filter convention
 * (`clearFilterInputEl`'s backspace loop) for the STF input too, which
 * intermittently left the filter genuinely still active (confirmed live —
 * a page-wide count stuck at a value consistent with the STF filter never
 * clearing, not just a slow re-render): the STF input's own value only
 * carries the decorative "🔍 " prefix while FOCUSED, so a read/backspace
 * sequence spanning a focus-state change can silently miscount how many
 * real characters remain to remove.
 */
async function clearSubTableFilter(page, groupLabel, expectedCount = null) {
    const input = stfInput(page, groupLabel);
    const current = await input.inputValue();
    if (!current) return;
    const clearBtn = page.locator(`#mb-stf-${groupLabel.replace(/ /g, '_')}-clear`);
    await clearBtn.click({ timeout: 10000 });
    if (expectedCount !== null) await waitForGroupFilteredCount(page, groupLabel, expectedCount);
    else await page.waitForTimeout(2500);
}

async function applyGlobalFilter(page, value, modifiers = {}) {
    await setGlobalModifierCheckboxes(page, modifiers);
    const input = globalFilterInput(page);
    await input.click();
    await waitForFilterSettled(page, () => input.pressSequentially(value));
}

async function clearGlobalFilter(page) {
    const input = globalFilterInput(page);
    const current = await input.inputValue();
    if (!stripFocusPrefix(current)) return;
    await waitForFilterSettled(page, () => clearFilterInputEl(input));
    await setGlobalModifierCheckboxes(page, {});
}

/**
 * Table-scoped `.mb-column-filter-highlight` reader — `getColumnHighlightTexts()`
 * from filterSortAssertions.js is unscoped and would conflate spans across
 * sub-tables sharing the same `colIndex`.
 */
async function getTableColumnHighlightTexts(page, tableIndex, colIndex) {
    return page.locator('table.tbl').nth(tableIndex)
        .locator(`tbody tr td:nth-child(${colIndex + 1}) .mb-column-filter-highlight`)
        .allTextContents();
}

/**
 * Table-scoped uniq-dropdown reader — needed for "Promotion release" since
 * `window.__saTest.getUniqDropSections()` always resolves to the FIRST
 * matching `<th>` page-wide (table index 0, "Official release") — see
 * architecture note 3. Opens via a real trusted Playwright click on the
 * SPECIFIC sub-table's own `.mb-col-uniq-wrap`, then reads the shared
 * `#mb-col-uniq-dropdown` panel directly (same DOM shape the test hook
 * itself reads).
 *
 * DO NOT "simplify" this back to `window.__saTest.getUniqDropSections()`
 * for a non-Official group — that hook is unscoped and would silently read
 * Official release's own dropdown instead (see architecture note 3).
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} tableIndex
 * @param {string} columnName
 */
async function getUniqDropSectionsForTable(page, tableIndex, columnName) {
    const wrap = page.locator('table.tbl').nth(tableIndex)
        .locator(`thead th[data-col-name="${columnName}"] .mb-col-uniq-wrap`);
    await wrap.click();
    const sections = await page.evaluate(() => {
        const dropEl = document.getElementById('mb-col-uniq-dropdown');
        if (!dropEl || getComputedStyle(dropEl).display === 'none') return [];
        return Array.from(dropEl.querySelectorAll('.mb-uniq-section')).map((section) => ({
            label: section.querySelector('.mb-uniq-section-hdr')?.textContent?.trim() ?? '',
            items: Array.from(section.querySelectorAll('.mb-col-uniq-item')).map((item) => ({
                title: item.getAttribute('title') ?? '',
                text: item.textContent.replace(/\s+/g, ' ').trim(),
            })),
        }));
    });
    // Close the dropdown the same way a user would, so it doesn't leak open
    // state into the next test.step().
    await page.evaluate(() => {
        if (window.__saTest && typeof window.__saTest.closeUniqDrop === 'function') window.__saTest.closeUniqDrop();
    });
    return sections;
}

// ─────────────────────────── smoke test ───────────────────────────

test('renders 124 rows across 3 sub-tables, matching the fixture ground truth', { tag: '@extended' }, async ({ page }) => {
    test.setTimeout(360000);
    const pageErrors = collectPageErrors(page);
    await setupExpandedGreetingsPage(page);

    const pageTotal = await getPageRowCount(page);
    expect(pageTotal.filtered).toBe(TOTAL_ROWS);
    expect(pageTotal.total).toBe(TOTAL_ROWS);

    const subTables = await getSubTableRowCounts(page);
    expect(subTables.length).toBe(3);
    const byLabel = Object.fromEntries(subTables.map((g) => [g.groupLabel, g]));
    expect(byLabel[GROUPS.OFFICIAL.label].total).toBe(GROUPS.OFFICIAL.total);
    expect(byLabel[GROUPS.PROMOTION.label].total).toBe(GROUPS.PROMOTION.total);
    expect(byLabel[GROUPS.BOOTLEG.label].total).toBe(GROUPS.BOOTLEG.total);

    const sum = subTables.reduce((s, g) => s + g.filtered, 0);
    expect(sum).toBe(TOTAL_ROWS);

    expect(pageErrors).toEqual([]);
});

// ─────────────────────────── §Official/§Promotion per-column filter cases ───────────────────────────

test('per-column typed filter cases (Official release + Promotion release)', { tag: '@extended' }, async ({ page }) => {
    test.setTimeout(480000);
    const pageErrors = collectPageErrors(page);
    await setupExpandedGreetingsPage(page);

    const groupsToTest = [
        { group: GROUPS.OFFICIAL, cases: OFFICIAL_FILTER_CASES },
        { group: GROUPS.PROMOTION, cases: PROMOTION_FILTER_CASES },
    ];

    for (const { group, cases } of groupsToTest) {
        for (const caseDef of cases) {
            const title = `[${group.label}] ${caseDef.column} ~ "${caseDef.value}" -> ${caseDef.expected} rows`;
            await test.step(title, async () => {
                await applyColumnFilter(page, group.tableIndex, group.label, caseDef, caseDef.expected);

                const subTables = await getSubTableRowCounts(page);
                const thisGroup = subTables.find((g) => g.groupLabel === group.label);
                expect(thisGroup.filtered).toBe(caseDef.expected);
                expect(thisGroup.total).toBe(group.total);

                const spans = await getTableColumnHighlightTexts(page, group.tableIndex, COLUMN_INDEX[caseDef.column]);
                if (caseDef.regExp) {
                    expect(spans.length).toBeGreaterThan(0);
                    const re = new RegExp(caseDef.highlightRegex);
                    for (const s of spans) expect(s).toMatch(re);
                } else {
                    expect(spans.length).toBeGreaterThan(0);
                    for (const s of spans) expect(s).toBe(caseDef.highlight);
                }

                await clearColumnFilter(page, group.tableIndex, group.label, caseDef.column, group.total);
                const afterClear = (await getSubTableRowCounts(page)).find((g) => g.groupLabel === group.label);
                expect(afterClear.filtered).toBe(group.total);
            });
        }
    }

    expect(pageErrors).toEqual([]);
});

// ─────────────────────────── §Official/§Promotion combo (2-column) cases ───────────────────────────

test('combo (2-column) and 3-way filter cases (Official release + Promotion release)', { tag: '@extended' }, async ({ page }) => {
    test.setTimeout(420000);
    const pageErrors = collectPageErrors(page);
    await setupExpandedGreetingsPage(page);

    const groupsToTest = [
        { group: GROUPS.OFFICIAL, combos: OFFICIAL_COMBO_CASES },
        { group: GROUPS.PROMOTION, combos: PROMOTION_COMBO_CASES },
    ];

    for (const { group, combos } of groupsToTest) {
        for (const combo of combos) {
            await test.step(`[${group.label}] ${combo.name} -> ${combo.expected} rows`, async () => {
                // Only the LAST filter's own resulting count is precomputed
                // in the fixture — intermediate steps fall back to a flat
                // settle delay (see applyColumnFilter()'s own JSDoc).
                for (let i = 0; i < combo.filters.length; i++) {
                    const isLast = i === combo.filters.length - 1;
                    await applyColumnFilter(page, group.tableIndex, group.label, combo.filters[i], isLast ? combo.expected : null);
                }
                const after = (await getSubTableRowCounts(page)).find((g) => g.groupLabel === group.label);
                expect(after.filtered).toBe(combo.expected);

                for (let i = 0; i < combo.filters.length; i++) {
                    const isLast = i === combo.filters.length - 1;
                    await clearColumnFilter(page, group.tableIndex, group.label, combo.filters[i].column, isLast ? group.total : null);
                }
                const afterClear = (await getSubTableRowCounts(page)).find((g) => g.groupLabel === group.label);
                expect(afterClear.filtered).toBe(group.total);
            });
        }
    }

    expect(pageErrors).toEqual([]);
});

// ─────────────────────────── §4a/§4b/§4c — filter-order interleavings ───────────────────────────

test('filter-order interleavings: global/subtable/column applied in 3 different orders (Official release + Promotion release)', { tag: '@extended' }, async ({ page }) => {
    test.setTimeout(420000);
    const pageErrors = collectPageErrors(page);
    await setupExpandedGreetingsPage(page);

    for (const [groupKey, group] of [['OFFICIAL', GROUPS.OFFICIAL], ['PROMOTION', GROUPS.PROMOTION]]) {
        const cases = INTERLEAVE_CASES[groupKey];

        // §4a — global -> subtable -> column
        await test.step(`[${group.label}] §4a global -> subtable -> column`, async () => {
            const { global, subtable, column } = cases.globalFirst;

            await applyGlobalFilter(page, global.value);
            let after = await getPageRowCount(page);
            expect(after.filtered).toBe(global.expectedAfter);

            await applySubTableFilter(page, group.label, subtable.value, subtable.expectedAfter);
            after = (await getSubTableRowCounts(page)).find((g) => g.groupLabel === group.label);
            expect(after.filtered).toBe(subtable.expectedAfter);

            await applyColumnFilter(page, group.tableIndex, group.label, column, column.expectedAfter);
            after = (await getSubTableRowCounts(page)).find((g) => g.groupLabel === group.label);
            expect(after.filtered).toBe(column.expectedAfter);

            // Clear in reverse, re-asserting each intermediate state. Clear
            // operations here use the flat-delay fallback (no precomputed
            // per-step count in the right SCOPE for every one of them —
            // some assert page-wide, some group-scoped) — the assertion
            // immediately after each clear still catches a real problem.
            await clearColumnFilter(page, group.tableIndex, group.label, column.column);
            after = (await getSubTableRowCounts(page)).find((g) => g.groupLabel === group.label);
            expect(after.filtered).toBe(subtable.expectedAfter);

            await clearSubTableFilter(page, group.label);
            // Robust page-wide wait — the flat-delay fallback proved too
            // short here on the larger Official release table (confirmed
            // live: a stale intermediate read, 57 instead of 113). A
            // generous timeout too — this recomputes across all 3 groups
            // on the page, confirmed live to occasionally need more than
            // the default 30s.
            await waitForPageFilteredCount(page, global.expectedAfter, { timeout: 60000 });
            after = await getPageRowCount(page);
            expect(after.filtered).toBe(global.expectedAfter);

            await clearGlobalFilter(page);
            after = await getPageRowCount(page);
            expect(after.filtered).toBe(TOTAL_ROWS);
        });

        // §4b — column -> subtable -> global (reversed)
        await test.step(`[${group.label}] §4b column -> subtable -> global (reversed)`, async () => {
            const { column, subtable, global } = cases.columnFirst;

            await applyColumnFilter(page, group.tableIndex, group.label, column, column.expectedAfter);
            let after = (await getSubTableRowCounts(page)).find((g) => g.groupLabel === group.label);
            expect(after.filtered).toBe(column.expectedAfter);

            await applySubTableFilter(page, group.label, subtable.value, subtable.expectedAfter);
            after = (await getSubTableRowCounts(page)).find((g) => g.groupLabel === group.label);
            expect(after.filtered).toBe(subtable.expectedAfter);

            await applyGlobalFilter(page, global.value);
            after = (await getSubTableRowCounts(page)).find((g) => g.groupLabel === group.label);
            expect(after.filtered).toBe(global.expectedAfter);

            // Clear in the SAME order they were applied this time (a
            // deliberately different clear-order from §4a, still ending at
            // the full unfiltered state).
            await clearColumnFilter(page, group.tableIndex, group.label, column.column);
            await clearSubTableFilter(page, group.label);
            await clearGlobalFilter(page);
            after = await getPageRowCount(page);
            expect(after.filtered).toBe(TOTAL_ROWS);
        });

        // §4c — subtable -> two simultaneous column filters -> global
        await test.step(`[${group.label}] §4c subtable -> 2 column filters -> global`, async () => {
            const { subtable, columns, expectedAfterColumns, global } = cases.thirdOrder;

            await applySubTableFilter(page, group.label, subtable.value, subtable.expectedAfter);
            let after = (await getSubTableRowCounts(page)).find((g) => g.groupLabel === group.label);
            expect(after.filtered).toBe(subtable.expectedAfter);

            // Only the LAST column's own resulting count is precomputed —
            // intermediate columns (when there are 2+) fall back to a flat
            // settle delay (see applyColumnFilter()'s own JSDoc).
            for (let i = 0; i < columns.length; i++) {
                const isLast = i === columns.length - 1;
                await applyColumnFilter(page, group.tableIndex, group.label, columns[i], isLast ? expectedAfterColumns : null);
            }
            after = (await getSubTableRowCounts(page)).find((g) => g.groupLabel === group.label);
            expect(after.filtered).toBe(expectedAfterColumns);

            await applyGlobalFilter(page, global.value);
            after = (await getSubTableRowCounts(page)).find((g) => g.groupLabel === group.label);
            expect(after.filtered).toBe(global.expectedAfter);

            await clearGlobalFilter(page);
            for (const col of columns) {
                await clearColumnFilter(page, group.tableIndex, group.label, col.column);
            }
            await clearSubTableFilter(page, group.label);
            after = await getPageRowCount(page);
            expect(after.filtered).toBe(TOTAL_ROWS);
        });
    }

    expect(pageErrors).toEqual([]);
});

// ─────────────────────────── §Sort — sort-then-restore checkpoints ───────────────────────────

test('sort-then-restore checkpoints (Official release + Promotion release)', { tag: '@extended' }, async ({ page }) => {
    test.setTimeout(360000);
    const pageErrors = collectPageErrors(page);
    await setupExpandedGreetingsPage(page);

    for (const [groupKey, group] of [['OFFICIAL', GROUPS.OFFICIAL], ['PROMOTION', GROUPS.PROMOTION]]) {
        for (const checkpoint of SORT_CHECKPOINTS[groupKey]) {
            await test.step(`[${group.label}] ${checkpoint.name}: sort ${checkpoint.sortColumn} asc -> desc -> restore`, async () => {
                for (let i = 0; i < checkpoint.filters.length; i++) {
                    const isLast = i === checkpoint.filters.length - 1;
                    await applyColumnFilter(page, group.tableIndex, group.label, checkpoint.filters[i], isLast ? checkpoint.expectedCount : null);
                }
                let after = (await getSubTableRowCounts(page)).find((g) => g.groupLabel === group.label);
                expect(after.filtered).toBe(checkpoint.expectedCount);

                // ALSO apply the CAA presence filter ("yes"/"no") — chosen
                // here for a simple, deterministic narrowing target; the
                // rich per-image type/comment text (e.g. "Front"/"Booklet")
                // is exercised separately by
                // releasegroup-releases-caa-type-comment-filter.spec.js.
                // That text-search path used to be broken page-wide on
                // EVERY tableMode:'multi' page — a typed substring search
                // against it produced ZERO matches and ZERO
                // .mb-column-filter-highlight spans regardless of column,
                // root-caused to `renderGroupedTable()` always inserting
                // `row.cloneNode(true)` copies (unlike the single-table
                // path, which appends the original row objects), so the
                // "source" rows `runFilter()` matches against never
                // received the async CAA/EAA enrichment applied to the
                // live, rendered clone. Fixed via `_artSyncSearchTextToSourceRow()`
                // (ShowAllEntityData.user.js). This narrows further and
                // confirms the CAA presence column survives a sort/filter
                // interaction on this multi-table page too — a full
                // v9.99.970-style CAA highlight-duplication guard would
                // need the dropdown-driven mechanism instead (not
                // implemented here — see this comment as the TODO).
                await applyColumnFilter(page, group.tableIndex, group.label, CAA_HIGHLIGHT_FILTER, null);
                after = (await getSubTableRowCounts(page)).find((g) => g.groupLabel === group.label);
                const combinedCount = after.filtered;
                expect(combinedCount, 'at least one row must match the CAA presence filter').toBeGreaterThan(0);

                const columnTh = page.locator('table.tbl').nth(group.tableIndex)
                    .locator('thead th', { hasText: checkpoint.sortColumn }).first();
                const ascBtn = columnTh.locator('.sort-icon-btn', { hasText: '▲' }).first();
                const descBtn = columnTh.locator('.sort-icon-btn', { hasText: '▼' }).first();
                const restoreBtn = columnTh.locator('.sort-icon-btn', { hasText: '⇅' }).first();

                for (const [label, btn] of [['ascending', ascBtn], ['descending', descBtn], ['restore', restoreBtn]]) {
                    await waitForSortSettled(page, () => btn.click(), { subTableHeading: group.label });
                    after = (await getSubTableRowCounts(page)).find((g) => g.groupLabel === group.label);
                    expect(after.filtered, `row count after ${label} sort`).toBe(combinedCount);
                }

                await clearColumnFilter(page, group.tableIndex, group.label, CAA_HIGHLIGHT_FILTER.column, checkpoint.expectedCount);
                for (let i = 0; i < checkpoint.filters.length; i++) {
                    const isLast = i === checkpoint.filters.length - 1;
                    await clearColumnFilter(page, group.tableIndex, group.label, checkpoint.filters[i].column, isLast ? group.total : null);
                }
                after = (await getSubTableRowCounts(page)).find((g) => g.groupLabel === group.label);
                expect(after.filtered).toBe(group.total);
            });
        }
    }

    expect(pageErrors).toEqual([]);
});

// ─────────────────────────── §Uniq-drop — dropdown contents ───────────────────────────

test('uniq-value dropdown contents, filters cleared and one filter active (Official release + Promotion release)', { tag: '@extended' }, async ({ page }) => {
    test.setTimeout(360000);
    const pageErrors = collectPageErrors(page);
    await setupExpandedGreetingsPage(page);

    // Official release: the existing __saTest hook resolves correctly by
    // construction (table index 0 is always the first DOM match).
    for (const columnName of UNIQ_DROP_COLUMNS_CLEARED.OFFICIAL) {
        await test.step(`[Official release] uniq-drop contents (filters cleared): ${columnName}`, async () => {
            const sections = await page.evaluate((col) => window.__saTest.getUniqDropSections(col), columnName);
            expect(Array.isArray(sections)).toBe(true);
            expect(sections.length).toBeGreaterThan(0);
            await page.evaluate(() => window.__saTest.closeUniqDrop());
        });
    }

    // Promotion release: MUST use the table-scoped helper — see this file's
    // own architecture note 3 and getUniqDropSectionsForTable()'s JSDoc.
    // Proven here first on Label (a column with a known live surprise —
    // see PROMOTION_FILTER_CASES' own note on Label combining name+comment
    // text — so opening its dropdown at all is a useful first check) before
    // trusting the helper for anything else.
    await test.step('[Promotion release] uniq-drop contents (filters cleared): Label — proves getUniqDropSectionsForTable()', async () => {
        const sections = await getUniqDropSectionsForTable(page, GROUPS.PROMOTION.tableIndex, 'Label');
        expect(sections.length).toBeGreaterThan(0);
        const allItems = sections.flatMap((s) => s.items);
        expect(allItems.length).toBeGreaterThan(0);
    });

    for (const columnName of UNIQ_DROP_COLUMNS_CLEARED.PROMOTION) {
        if (columnName === 'Label') continue; // already proven above
        await test.step(`[Promotion release] uniq-drop contents (filters cleared): ${columnName}`, async () => {
            const sections = await getUniqDropSectionsForTable(page, GROUPS.PROMOTION.tableIndex, columnName);
            expect(Array.isArray(sections)).toBe(true);
        });
    }

    // One filter left active, per group.
    await test.step('[Official release] uniq-drop contents with Format~Vinyl active', async () => {
        const active = UNIQ_DROP_ACTIVE_FILTER.OFFICIAL;
        await applyColumnFilter(page, GROUPS.OFFICIAL.tableIndex, GROUPS.OFFICIAL.label, active, active.expected);
        const after = (await getSubTableRowCounts(page)).find((g) => g.groupLabel === GROUPS.OFFICIAL.label);
        expect(after.filtered).toBe(active.expected);
        const sections = await page.evaluate((col) => window.__saTest.getUniqDropSections(col), 'Format');
        expect(sections.length).toBeGreaterThan(0);
        await page.evaluate(() => window.__saTest.closeUniqDrop());
        await clearColumnFilter(page, GROUPS.OFFICIAL.tableIndex, GROUPS.OFFICIAL.label, active.column, GROUPS.OFFICIAL.total);
    });

    await test.step('[Promotion release] uniq-drop contents with Country~Japan active', async () => {
        const active = UNIQ_DROP_ACTIVE_FILTER.PROMOTION;
        await applyColumnFilter(page, GROUPS.PROMOTION.tableIndex, GROUPS.PROMOTION.label, active, active.expected);
        const after = (await getSubTableRowCounts(page)).find((g) => g.groupLabel === GROUPS.PROMOTION.label);
        expect(after.filtered).toBe(active.expected);
        const sections = await getUniqDropSectionsForTable(page, GROUPS.PROMOTION.tableIndex, 'Country');
        expect(Array.isArray(sections)).toBe(true);
        await clearColumnFilter(page, GROUPS.PROMOTION.tableIndex, GROUPS.PROMOTION.label, active.column, GROUPS.PROMOTION.total);
    });

    expect(pageErrors).toEqual([]);
});
