'use strict';

const { expect } = require('@playwright/test');

/**
 * Emulates a user clicking the "Stop" button (`#mb-stop-btn`) partway
 * through a paginated fetch, after at least `n` pages have started loading.
 *
 * Waits on `#mb-fetch-progress-label`'s text (updated every page-fetch
 * iteration inside `startFetchingProcess()`'s pagination loop — see
 * ShowAllEntityData.user.js, format `` `Loading page ${p} of ${maxPage}...` ``)
 * until the reported page number reaches `n`, or the page type's own total
 * page count, whichever is smaller — so this never hangs waiting for a
 * page number a given pageType will never reach.
 *
 * The click itself only sets a module-level `stopRequested` flag inside the
 * script (see `#mb-stop-btn`'s own click handler) — it does not abort the
 * in-flight page fetch, so the pagination loop finishes its CURRENT page
 * before breaking. The script's normal post-loop completion/render path
 * still runs afterward with whatever partial data was accumulated (see
 * `#mb-stop-btn`'s `style.display = 'none'` in every completion branch) —
 * callers should still await their usual render-complete signal
 * (`assertGroupedRenderCompleted()`/`#mb-filter-container` visibility)
 * after this resolves, not treat this function itself as "fetch is done".
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

    await page.click('#mb-stop-btn');
    await expect(page.locator('#mb-stop-btn')).toBeDisabled();
    await expect(page.locator('#mb-stop-btn')).toHaveText('Stopping...');
}

module.exports = { stopAfterPages };
