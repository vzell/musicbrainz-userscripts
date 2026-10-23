'use strict';

const { expect } = require('@playwright/test');

/** The action segment a fetch is running in (`_saedRunStart()`). */
const RUNNING_SEGMENT = '#mb-saed-bar .mb-seg.mb-seg-running';

/** The 🔄 missing-pages indicator a failed fetch leaves on the SAED button. */
const MISSING_PAGES_SEGMENT = '#mb-fetch-missing-menu-btn';

/** Its "↻ Load the N missing pages" row (the resume). */
const RESUME_ROW = '#mb-resume-fetch-btn';

/**
 * Emulates a user pressing Stop partway through a paginated fetch, after at
 * least `n` pages have started loading. Since the SAED button (2026-10-23)
 * Stop IS the running action segment ("■ Stop · n / N"); there is no
 * separate `#mb-stop-btn` any more.
 *
 * Waits on `#mb-fetch-progress-label`'s text (the progress line under the
 * heading, written every page-fetch iteration inside
 * `startFetchingProcess()`'s pagination loop, format
 * `Loading page ${p} of ${maxPage} · …`) until the reported page number
 * reaches `n`, or the page type's own total page count, whichever is
 * smaller — so this never hangs waiting for a page number a given pageType
 * will never reach.
 *
 * The click itself only sets a module-level `stopRequested` flag inside the
 * script (`_saedRequestStop()`) — it does not abort the in-flight page
 * fetch, so the pagination loop finishes its CURRENT page before breaking.
 * The script's normal post-loop completion/render path still runs afterward
 * with whatever partial data was accumulated — callers should still await
 * their usual render-complete signal (`assertGroupedRenderCompleted()`/
 * `#mb-filter-container` visibility) after this resolves, not treat this
 * function itself as "fetch is done".
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ n?: number, timeout?: number }} [opts] - `n` defaults to 2,
 *   matching the "stop after 2 pages" default a user would reach for.
 * @returns {Promise<void>}
 */
async function stopAfterPages(page, { n = 2, timeout = 60000 } = {}) {
    await page.waitForFunction((n) => {
        const el = document.getElementById('mb-fetch-progress-label');
        if (!el) return false;
        const m = el.textContent.match(/Loading page (\d+) of (\d+)/);
        return m && (Number(m[1]) >= n || Number(m[1]) >= Number(m[2]));
    }, n, { timeout });

    const seg = page.locator(RUNNING_SEGMENT);
    await seg.click();
    await expect(seg).toHaveAttribute('aria-disabled', 'true');
    await expect(seg).toHaveText('Stopping…');
}

/**
 * Runs the resume a failed fetch offers: opens the 🔄 indicator's list and
 * picks "↻ Load the N missing pages" (it used to be a "↻ Load remaining
 * pages" button at the end of the status line).
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function resumeMissingPages(page) {
    await page.locator(MISSING_PAGES_SEGMENT).click();
    await page.locator(RESUME_ROW).click();
}

module.exports = { stopAfterPages, resumeMissingPages, RUNNING_SEGMENT, MISSING_PAGES_SEGMENT, RESUME_ROW };
