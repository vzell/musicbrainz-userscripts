'use strict';

/**
 * Runs `trigger()` (e.g. a filter-input keystroke, a sort-icon click), then
 * polls `locator`'s textContent until it reflects a genuinely NEW, settled
 * result of that action — not merely "not currently showing the ⏳
 * in-progress glyph".
 *
 * This callback-based shape — rather than a bare `waitForXSettled(page)`
 * called standalone right after the caller already triggered the action —
 * is a deliberate deviation from this module's original design sketch,
 * forced by empirical testing against real (variable, ~0ms-400ms+) filter/
 * sort debounce delays. Two simpler designs were tried and found racy:
 *   1. A one-shot `expect(locator).not.toHaveText(/^⏳/)`, called after the
 *      trigger, resolves the instant it observes ANY non-⏳ text — including
 *      a *stale* snapshot caught before a debounced operation has even
 *      started. Playwright's retrying `expect()` stops at the first passing
 *      check; it doesn't wait for an actual transition.
 *   2. Requiring the text to be IDENTICAL across a couple of consecutive
 *      polls (still called after the trigger, with no pre-trigger baseline)
 *      looks more robust but isn't: if the real debounce is longer than
 *      that polling window, the stale pre-action text is "stable" across
 *      every poll until the window closes, and this resolves on the stale
 *      value regardless.
 *   3. Capturing a "baseline" snapshot *inside* the wait function (still
 *      called after the trigger already fired) and requiring the text to
 *      differ from it fixes #1/#2 for a debounced operation, but breaks the
 *      opposite way for a genuinely INSTANT one (a 6-row sort settles in
 *      ~30ms): by the time the wait function's first read runs, the
 *      baseline it captures IS ALREADY the final post-trigger text, so
 *      "differs from baseline" never becomes true and the wait times out.
 *
 * The only way to resolve both failure modes is to capture the baseline
 * BEFORE the trigger runs, which requires owning the trigger call — hence
 * this function takes `trigger` as a parameter instead of assuming the
 * caller already ran it.
 *
 * @param {import('@playwright/test').Locator} locator
 * @param {() => Promise<void>} trigger
 * @param {number} timeout
 * @param {number} [pollIntervalMs]
 * @returns {Promise<void>}
 */
async function _runAndWaitForSettledText(locator, trigger, timeout, pollIntervalMs = 100) {
    const readOnce = () => locator.textContent().catch(() => null);
    const baseline = await readOnce();

    await trigger();

    const deadline = Date.now() + timeout;
    let sawInProgress = false;
    let lastText = baseline;
    let stableStreak = 0;

    while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        const text = await readOnce();

        if (text !== null && text.startsWith('⏳')) {
            sawInProgress = true;
            stableStreak = 0;
        } else {
            const eligible = text !== null && (sawInProgress || text !== baseline);
            stableStreak = eligible && text === lastText ? stableStreak + 1 : (eligible ? 1 : 0);
            if (stableStreak >= 2) return;
        }
        lastText = text;
    }
    throw new Error(
        `_runAndWaitForSettledText: text did not settle to a new value within ${timeout}ms `
        + `(baseline: ${JSON.stringify(baseline)}, last seen: ${JSON.stringify(lastText)})`
    );
}

/**
 * Runs `trigger()` (e.g. `() => input.pressSequentially('text')`) and waits
 * for the page-wide filter status text to settle afterward, signaling
 * `runFilter()`'s re-render has finished — see ShowAllEntityData.user.js's
 * `#mb-filter-status-display`. See `_runAndWaitForSettledText()` above for
 * why `trigger` must be run BY this function, not before calling it.
 *
 * @param {import('@playwright/test').Page} page
 * @param {() => Promise<void>} trigger
 * @param {{ timeout?: number }} [opts]
 * @returns {Promise<void>}
 */
async function waitForFilterSettled(page, trigger, { timeout = 30000 } = {}) {
    await _runAndWaitForSettledText(page.locator('#mb-filter-status-display'), trigger, timeout);
}

/**
 * Runs `trigger()` (e.g. `() => sortIconBtn.click()`) and waits for the
 * resulting sort operation to settle.
 *
 * On a single-table page (or a page-wide sort trigger) this polls
 * `#mb-sort-status-display`. On a multi-table page, pass `subTableHeading`
 * (the exact `<h3>` group-label text, e.g. `"Album"` — see
 * `getSubTableRowCounts()` below for how that label is derived) to poll
 * that specific group's own `h3 .mb-sort-status` span instead — sorting a
 * multi-table page's column writes its status there, and the page-wide
 * display is never touched at all (confirmed empirically: it stayed empty
 * and the wait timed out when this was omitted on a multi-table pilot
 * page — see ShowAllEntityData.user.js's `makeTableSortableUnified()`
 * sort-click handler).
 *
 * @param {import('@playwright/test').Page} page
 * @param {() => Promise<void>} trigger
 * @param {{ timeout?: number, subTableHeading?: string }} [opts]
 * @returns {Promise<void>}
 */
async function waitForSortSettled(page, trigger, { timeout = 30000, subTableHeading } = {}) {
    const locator = subTableHeading
        ? page.locator('h3.mb-toggle-h3', { hasText: subTableHeading }).first().locator('.mb-sort-status')
        : page.locator('#mb-sort-status-display');
    await _runAndWaitForSettledText(locator, trigger, timeout);
}

/**
 * Runs `trigger()` (e.g. `() => stfInput.pressSequentially('text')`) and
 * waits for the given group's Sub-Table Filter (STF) to settle.
 *
 * Unlike global/column filters (`#mb-filter-status-display`) or sorting
 * (`.mb-sort-status`), STF has no dedicated status-message element —
 * confirmed empirically, there's nothing to poll there. Its only visible
 * completion signal is the group's own `h3 .mb-row-count-stat` text itself
 * (updated by `_updateSubTableH3Tooltip()`/`updateSubTableRowCount()`), so
 * this polls that directly instead.
 *
 * @param {import('@playwright/test').Page} page
 * @param {() => Promise<void>} trigger
 * @param {{ timeout?: number, subTableHeading: string }} opts - `subTableHeading`
 *   is required (unlike `waitForSortSettled`'s optional one) since STF is
 *   inherently per-sub-table — there's no page-wide STF equivalent.
 * @returns {Promise<void>}
 */
async function waitForSubTableFilterSettled(page, trigger, { timeout = 30000, subTableHeading }) {
    const locator = page.locator('h3.mb-toggle-h3', { hasText: subTableHeading }).first().locator('.mb-row-count-stat');
    await _runAndWaitForSettledText(locator, trigger, timeout);
}

/**
 * Parses one `.mb-row-count-stat` span's text into its filtered/total/
 * absolute components. Handles all three shapes `updateH2Count()`/
 * `_updateSubTableH3Tooltip()` produce:
 *   `(N)`             — filtered === total, no absolute tier
 *   `(F of T)`         — filtered narrower than total, no absolute tier
 *   `(F of T)/A`       — 3-tier: F narrowed further than T by a sub-table
 *                         filter (STF), which itself narrowed the page's
 *                         own absolute unfiltered total A (h2-level only —
 *                         h3-level stats never carry this third tier).
 *
 * @param {string} text
 * @returns {{filtered: number, total: number, absolute: number|null}|null}
 *   `null` if `text` doesn't match any known shape.
 */
function parseRowCountText(text) {
    const m = (text || '').trim().match(/^\((\d+)(?: of (\d+))?\)(?:\/(\d+))?$/);
    if (!m) return null;
    const filtered = Number(m[1]);
    const total = m[2] !== undefined ? Number(m[2]) : filtered;
    const absolute = m[3] !== undefined ? Number(m[3]) : null;
    return { filtered, total, absolute };
}

/**
 * Reads and parses the page-wide `h2 .mb-row-count-stat` span — present on
 * both `tableMode: 'single'` and `'multi'` pages (written by the same
 * `updateH2Count()` for both).
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{filtered: number, total: number, absolute: number|null}>}
 */
async function getPageRowCount(page) {
    const text = await page.locator('h2 .mb-row-count-stat').first().textContent();
    const parsed = parseRowCountText(text);
    if (!parsed) throw new Error(`getPageRowCount: unrecognized row-count text ${JSON.stringify(text)}`);
    return parsed;
}

/**
 * Reads and parses every sub-table group's own `h3 .mb-row-count-stat` span
 * on a `tableMode: 'multi'` page. `groupLabel` is the group's own display
 * name (e.g. `"Album"`, `"Album + Compilation"`) — the first non-empty text
 * node inside the `<h3 class="mb-toggle-h3">`, i.e. everything between the
 * leading `▲`/`▼` toggle-icon span and the row-count-stat span itself.
 *
 * Summing every entry's `filtered` here equals `getPageRowCount(page)`'s
 * own `filtered` (already relied on, for the unfiltered case, by
 * `liveAssertions.js`'s `assertGroupedRenderCompleted()`).
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<{groupLabel: string, filtered: number, total: number}>>}
 */
async function getSubTableRowCounts(page) {
    return page.evaluate(() => {
        const parse = (text) => {
            const m = (text || '').trim().match(/^\((\d+)(?: of (\d+))?\)$/);
            if (!m) return null;
            const filtered = Number(m[1]);
            const total = m[2] !== undefined ? Number(m[2]) : filtered;
            return { filtered, total };
        };
        return Array.from(document.querySelectorAll('h3.mb-toggle-h3')).map((h3) => {
            const statEl = h3.querySelector('.mb-row-count-stat');
            const counts = statEl ? parse(statEl.textContent) : null;
            const labelNode = Array.from(h3.childNodes).find((n) => n.nodeType === 3 && n.textContent.trim());
            const groupLabel = labelNode ? labelNode.textContent.trim() : '';
            return { groupLabel, filtered: counts ? counts.filtered : null, total: counts ? counts.total : null };
        });
    });
}

/**
 * Waits for `table.tbl tbody tr`'s ACTUAL element count to reach
 * `expectedCount` — a stronger completion signal than
 * `waitForFilterSettled`/`waitForSortSettled` for an action that narrows a
 * table then widens it back out on a large `tableMode: 'single'` page.
 *
 * Confirmed empirically (artist-events, 4174 rows, on `main`): clearing a
 * column filter that had narrowed 4174 rows down to 158 triggers a tbody
 * rebuild back up to the full row count. `#mb-filter-status-display` (what
 * `waitForFilterSettled` polls) updates to its final text — and
 * `getPageRowCount()`'s `.mb-row-count-stat` reads "(4174)" — well before
 * that rebuild has actually finished re-appending every row: real
 * `tbody tr` counts of 2500-3500 were observed immediately after
 * `waitForFilterSettled()` had already resolved. This is the filter-clear
 * counterpart of the already-documented initial-chunked-render race (see
 * `browser.js`'s `waitForRenderComplete()` JSDoc) — the status text and the
 * row-count stat both update from data that's already final before the DOM
 * insertion loop populating `tbody` has caught up.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} expectedCount
 * @param {{ timeout?: number }} [opts]
 * @returns {Promise<void>}
 */
async function waitForActualRowCount(page, expectedCount, { timeout = 30000 } = {}) {
    await page.waitForFunction(
        (n) => document.querySelectorAll('table.tbl tbody tr').length === n,
        expectedCount,
        { timeout }
    );
}

/**
 * Waits for one column header's `.mb-col-uniq-count` badge (the number left of
 * the 📊 button) to read `expected`.
 *
 * A THIRD completion signal, needed after both `waitForFilterSettled()` (status
 * text) and `waitForActualRowCount()` (real `tbody tr` count) have resolved.
 * That badge is written by `_updateAllColHeaderCounts()`, which
 * `_scheduleColHeaderCounts()` runs strictly after the in-flight render settles
 * AND slices across event-loop turns — one turn per column — because a full pass
 * over this page is ~88 000 `getCleanColumnText()` calls (4174 rows × 21
 * columns). So the badge legitimately lands well after every other "done"
 * signal on the page, and a test that reads it eagerly reads the previous
 * pass's number.
 *
 * Historically this was invisible: `runFilter()` did not await its own chunked
 * `renderFinalTable()`, so the scan ran against whatever prefix of the tbody
 * existed (a multiple of the 500-row chunk size) and "settled" quickly on a
 * wrong value. `tests/snapshots/artist-events/post-sort.html` still carries
 * that era's numbers.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} colName - Column header text with sort arrows/counts/glyphs
 *   stripped (e.g. "Event"), matched the same way `__saTest.getUniqDropSections()`
 *   matches it.
 * @param {number} expected
 * @param {{ timeout?: number }} [opts]
 * @returns {Promise<void>}
 */
async function waitForColHeaderUniqCount(page, colName, expected, { timeout = 90000 } = {}) {
    await page.waitForFunction(
        ({ name, want }) => {
            const strip = (t) => t.replace(/[⇅▲▼📊▶◀▤0-9⁰¹²³⁴⁵⁶⁷⁸⁹]/g, '').trim();
            const th = Array.from(document.querySelectorAll('table.tbl thead th'))
                .find((t) => strip(t.textContent) === name);
            const badge = th && th.querySelector('.mb-col-uniq-count');
            return !!badge && badge.textContent.trim() === String(want);
        },
        { name: colName, want: expected },
        { timeout }
    );
}

/**
 * Waits until EVERY column-header count badge (`.mb-col-uniq-count` and
 * `.mb-col-collapse-count`, across all tables) has held the same value for
 * `stableFor` consecutive polls.
 *
 * The value-free counterpart to {@link waitForColHeaderUniqCount}, for callers
 * that need "the header-count scan has finished" without knowing what the
 * numbers should be — `capture-snapshots.js` captures arbitrary filter states
 * and has no expected value to assert against, but must not bake a half-scanned
 * thead into a committed baseline.
 *
 * Prefer `waitForColHeaderUniqCount()` in a spec: an exact expected value is a
 * real assertion, whereas "stopped changing" is only a heuristic — it can in
 * principle resolve inside a long enough pause between two of the scan's
 * per-column slices. The default window is sized well above the scan's own
 * `requestIdleCallback({ timeout: 250 })` yield so that cannot happen in
 * practice on an otherwise idle page.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ stableFor?: number, pollIntervalMs?: number, timeout?: number }} [opts]
 * @returns {Promise<void>}
 */
async function waitForColHeaderCountsStable(page, { stableFor = 4, pollIntervalMs = 250, timeout = 90000 } = {}) {
    const readAll = () => page.evaluate(() => Array.from(
        document.querySelectorAll('.mb-col-uniq-count, .mb-col-collapse-count')
    ).map((el) => el.textContent.trim()).join('|'));

    const deadline = Date.now() + timeout;
    let last = null;
    let streak = 0;

    while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        const now = await readAll();
        streak = now === last ? streak + 1 : 0;
        last = now;
        if (streak >= stableFor) return;
    }
    throw new Error(
        `waitForColHeaderCountsStable: header counts still changing after ${timeout}ms (last: ${JSON.stringify(last)})`
    );
}

/**
 * Reads the text content of every `.mb-column-filter-highlight` span
 * currently present in one column's cells (across all visible rows) —
 * written by `highlightText()`/`highlightCrossTag()`
 * (`ShowAllEntityData.user.js:33961`/`34060`) for a plain-text column
 * filter, or by one of the uniq-dropdown compound-mode highlighters
 * (`_highlightCountryMatch()`, `_highlightArtValueMatch()`, etc.) for a
 * dropdown-driven value-set filter. `colIndex` is the same `row.cells`
 * zero-based index `getColFilters()`/`highlightText()` use — see
 * `bodeansArtistReleasesFixture.js`'s `COLUMN_INDEX` map.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} colIndex
 * @returns {Promise<string[]>} One entry per highlight span found, in DOM order.
 */
async function getColumnHighlightTexts(page, colIndex) {
    return page.$$eval(
        `table.tbl tbody tr td:nth-child(${colIndex + 1}) .mb-column-filter-highlight`,
        (spans) => spans.map((s) => s.textContent)
    );
}

/**
 * Reads the text content of every `.mb-global-filter-highlight` span
 * currently present anywhere in the table — the global filter's own
 * highlight class, written by the same `highlightText()`/`highlightCrossTag()`
 * pair as `getColumnHighlightTexts()` above, just scanning every `<td>`
 * instead of one column.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string[]>}
 */
async function getGlobalHighlightTexts(page) {
    return page.$$eval(
        'table.tbl tbody tr td .mb-global-filter-highlight',
        (spans) => spans.map((s) => s.textContent)
    );
}

/**
 * Reads `#mb-filter-status-display`'s current text — the single-table
 * success line ShowAllEntityData writes as
 * `` `✓ Filtered ${N} ${row(s)} in ${ms}ms${filterInfo}` `` (`runFilter()`,
 * ShowAllEntityData.user.js). Callers assert against this with
 * {@link buildFilterStatusRegex} rather than an exact string, since the
 * elapsed-ms portion is inherently non-deterministic.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string>}
 */
async function getFilterStatusText(page) {
    return (await page.locator('#mb-filter-status-display').textContent()) || '';
}

/**
 * Escapes a string for safe embedding inside a `RegExp` literal.
 * @param {string} s
 * @returns {string}
 */
function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds the exact `RegExp` a single-table page's `#mb-filter-status-display`
 * success text must match for a given global/column-filter combination — see
 * `runFilter()`'s `filterParts`/`filterInfo` construction
 * (ShowAllEntityData.user.js). The elapsed-ms figure is matched as `\d+`
 * (never deterministic); everything else — row count, singular/plural
 * "row"/"rows", the `GLOBAL:"..."` part, and one `'ColName':"value"` pair
 * per active column filter — is asserted exactly.
 *
 * `columns` must already be in the SAME order the real DOM produces them in
 * (ascending `COLUMN_INDEX`, i.e. left-to-right column order) — the actual
 * code iterates `document.querySelectorAll('.mb-col-filter-input')` in DOM
 * order, which does not necessarily match the order a test applied filters
 * in for a multi-column combo case.
 *
 * Asymmetric quirk this function deliberately encodes (confirmed live, not
 * a bug): `runFilter()`'s own `globalQuery` variable (used in the
 * `GLOBAL:"..."` part) is lowercased whenever the global filter is NOT
 * case-sensitive (`globalQuery = (isCaseSensitive || isRegExp) ?
 * globalQueryRaw : globalQueryRaw.toLowerCase()`, ShowAllEntityData.user.js)
 * — unlike a COLUMN filter's own status text, which always shows the raw
 * typed value regardless of case-sensitivity. Pass `globalCaseSensitive:
 * true` when the Cc checkbox was on for the global filter.
 *
 * @param {{ rowCount: number, global?: string, globalCaseSensitive?: boolean, columns?: Array<{column: string, value: string}> }} spec
 * @returns {RegExp}
 */
function buildFilterStatusRegex({ rowCount, global, globalCaseSensitive = false, columns = [] }) {
    const rowWord = rowCount === 1 ? 'row' : 'rows';
    const parts = [];
    if (global) {
        const displayedGlobal = globalCaseSensitive ? global : global.toLowerCase();
        parts.push(`GLOBAL:"${escapeRegExp(displayedGlobal)}"`);
    }
    if (columns.length > 0) {
        const n = columns.length;
        const colDetail = columns
            .map((c) => `'${escapeRegExp(c.column)}':"${escapeRegExp(c.value)}"`)
            .join(', ');
        parts.push(`${n} COLUMN FILTER${n > 1 ? 'S' : ''} \\[${colDetail}\\]`);
    }
    const filterInfo = parts.length > 0 ? ` \\[${parts.join(', ')}\\]` : '';
    return new RegExp(`^✓ Filtered ${rowCount} ${rowWord} in \\d+ms${filterInfo}$`);
}

/**
 * Reads the h2 `.mb-row-count-stat` span's rich `data-mbtt` tooltip HTML —
 * see `_buildH2CountTooltip()` (ShowAllEntityData.user.js). Never used as
 * `title` — this is the custom-hover-tooltip payload.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string>}
 */
async function getRowCountTooltip(page) {
    return (await page.locator('h2 .mb-row-count-stat').first().getAttribute('data-mbtt')) || '';
}

/**
 * Escapes a string the same way `_mbttSpan()`/`_mbttColName()`
 * (ShowAllEntityData.user.js) do before embedding it in the `data-mbtt`
 * tooltip HTML.
 * @param {string} s
 * @returns {string}
 */
function escapeMbttHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Asserts a `data-mbtt` tooltip's content against the active filter
 * combination, per `_buildH2CountTooltip()`'s own branching
 * (ShowAllEntityData.user.js:33218). Deliberately checks for the presence of
 * the count/colname/value pill spans it's KNOWN to always emit, rather than
 * the full surrounding English sentence (which varies by branch) — a looser,
 * lower-maintenance spot-check of "the right figures/filters are mentioned",
 * not a byte-exact tooltip snapshot.
 *
 * IMPORTANT quirks this function deliberately encodes (not bugs — real
 * `_buildH2CountTooltip()` behavior):
 *   - When `filteredCount === totalCount` (e.g. a column filter that happens
 *     to match every row), the function takes its early "total unfiltered"
 *     return and mentions NO column/global filter detail at all, even
 *     though a filter is technically active. Callers must not pass
 *     `columns`/`global` expecting them to be asserted in that case — this
 *     function silently skips that part of the check instead of failing.
 *   - Unlike `#mb-filter-status-display`'s own text (built from the RAW,
 *     untrimmed `stripColFilterPrefix(inp.value)`), the tooltip's per-COLUMN
 *     expression is built from `_raw.trim()` (`_buildH2CountTooltip()`'s
 *     `_activeCol` map) — a column value with leading/trailing whitespace
 *     (e.g. the Tracks column's `" + "` case) appears TRIMMED in the
 *     tooltip but untrimmed in the status text. The GLOBAL filter value is
 *     NOT trimmed in either place (`_gfVal` has no `.trim()` call). This
 *     function trims only `c.value`, never `global`;
 *     `buildFilterStatusRegex()` trims neither.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ filteredCount: number, totalCount: number, global?: string, columns?: Array<{column: string, value: string}> }} spec
 * @returns {Promise<void>}
 */
async function assertRowCountTooltip(page, { filteredCount, totalCount, global, columns = [] }) {
    const { expect } = require('@playwright/test');
    const html = await getRowCountTooltip(page);
    expect(html).toContain(`<span class="mb-mbtt-count">${filteredCount}</span>`);
    if (filteredCount === totalCount) return; // "total unfiltered" branch — no filter detail mentioned
    expect(html).toContain(`<span class="mb-mbtt-count">${totalCount}</span>`);
    if (global) {
        // The "global" LABEL word uses class `mb-mbtt-gf` (_mbttLabel());
        // the VALUE itself uses `mbtt-gf` (_mbttSpan()) — parallel to
        // column filters' `mb-mbtt-colname`/`mbtt-cf` split. Only the value
        // is asserted here.
        expect(html).toContain(`<span class="mbtt-gf">${escapeMbttHtml(global)}</span>`);
    }
    for (const c of columns) {
        expect(html).toContain(`<span class="mb-mbtt-colname">'${escapeMbttHtml(c.column)}'</span>`);
        expect(html).toContain(`<span class="mbtt-cf">${escapeMbttHtml(c.value.trim())}</span>`);
    }
}

/**
 * Reads the visibility + label text of the filter-bar's `#mb-toggle-filter-
 * highlight-btn` / `#mb-clear-column-filters-btn` buttons — see
 * `updateFilterButtonsVisibility()` (ShowAllEntityData.user.js). Both are
 * `display:inline-block` whenever ANY filter has text (highlight-toggle) or
 * at least one COLUMN filter specifically has text (clear-column-filters),
 * `display:none` otherwise; their label text is static, not dynamic.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{ toggleHighlightVisible: boolean, toggleHighlightText: string, clearColumnFiltersVisible: boolean, clearColumnFiltersText: string }>}
 */
async function getFilterButtonsState(page) {
    const toggle = page.locator('#mb-toggle-filter-highlight-btn');
    const clearCols = page.locator('#mb-clear-column-filters-btn');
    const [toggleDisplay, toggleText, clearDisplay, clearText] = await Promise.all([
        toggle.evaluate((el) => getComputedStyle(el).display),
        toggle.textContent(),
        clearCols.evaluate((el) => getComputedStyle(el).display),
        clearCols.textContent(),
    ]);
    return {
        toggleHighlightVisible: toggleDisplay !== 'none',
        toggleHighlightText: (toggleText || '').trim(),
        clearColumnFiltersVisible: clearDisplay !== 'none',
        clearColumnFiltersText: (clearText || '').trim(),
    };
}

/**
 * Reads `#mb-toggle-prefilter-btn`'s visibility + text — see
 * `updatePrefilterToggleButton()` (ShowAllEntityData.user.js), only ever
 * shown (with `show=true` AND a non-empty `query`) from the Load-from-Disk
 * hydration path when a genuine pre-filter was applied. Text template:
 * `` `🎨 ${count}${totalRows > 0 ? ` of ${totalRows}` : ''} ${row(s)} ${isExclude ? 'excluded' : 'prefiltered'}: "${query}"` ``.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{ visible: boolean, text: string }>}
 */
async function getPrefilterButtonState(page) {
    const btn = page.locator('#mb-toggle-prefilter-btn');
    const count = await btn.count();
    if (count === 0) return { visible: false, text: '' };
    const [display, text] = await Promise.all([
        btn.evaluate((el) => getComputedStyle(el).display),
        btn.textContent(),
    ]);
    return { visible: display !== 'none', text: (text || '').trim() };
}

module.exports = {
    waitForFilterSettled,
    waitForSortSettled,
    waitForSubTableFilterSettled,
    parseRowCountText,
    getPageRowCount,
    getSubTableRowCounts,
    waitForActualRowCount,
    waitForColHeaderUniqCount,
    waitForColHeaderCountsStable,
    getColumnHighlightTexts,
    getGlobalHighlightTexts,
    getFilterStatusText,
    buildFilterStatusRegex,
    getRowCountTooltip,
    assertRowCountTooltip,
    getFilterButtonsState,
    getPrefilterButtonState,
    escapeRegExp,
};
