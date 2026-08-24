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

module.exports = {
    waitForFilterSettled,
    waitForSortSettled,
    waitForSubTableFilterSettled,
    parseRowCountText,
    getPageRowCount,
    getSubTableRowCounts,
    waitForActualRowCount,
};
