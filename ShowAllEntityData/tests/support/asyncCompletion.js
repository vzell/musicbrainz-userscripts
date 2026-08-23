'use strict';

const { expect } = require('@playwright/test');

/**
 * Waits for the CAA/EAA artwork-fetch queue to drain, signaled by
 * `#mb-info-display-caa` becoming visible.
 *
 * That element starts hidden/empty, is cleared at the top of every fetch,
 * and is set exactly once — flipping to `style.display = 'inline-block'` —
 * when the shared CAA/EAA request queue reaches idle (see
 * ShowAllEntityData.user.js's `_showCaaCompletionToast()` /
 * `_caaQueue.onIdle()`). This is a more reliable "done" signal than polling
 * the transient, auto-dismissing `#mb-caa-completion-toast` toast, which
 * removes itself from the DOM after `sa_caa_completion_toast_duration`
 * seconds regardless of whether a test has finished reading it.
 *
 * No-op if the page type has no CAA/EAA feature — `#mb-info-display-caa`
 * never becomes visible, so this simply waits out the timeout in that case.
 * Callers should only await this on a page type that actually declares
 * `addCAA`/`addEAA`.
 *
 * Verified live against a small `releasegroup-releases` page (~3.9s to
 * complete) rather than a large `artist-releasegroups` catalogue — a page
 * with thousands of releases can genuinely take several minutes for its CAA
 * queue to drain even under `gmStubs.js`'s always-404 `GM_xmlhttpRequest`
 * stub (still bottlenecked by `sa_caa_fetch_concurrency`), so pick a small
 * pilot page for tests built on this helper rather than raising `timeout`
 * to compensate.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ timeout?: number }} [opts]
 * @returns {Promise<void>}
 */
async function waitForCaaEaaComplete(page, { timeout = 30000 } = {}) {
    await expect(page.locator('#mb-info-display-caa')).toBeVisible({ timeout });
}

/**
 * Waits for the "Relationships" injected column's async fetch/render to
 * finish, signaled by `#mb-info-display-rel` becoming visible.
 *
 * Same start-hidden / cleared-per-fetch / set-exactly-once-on-completion
 * shape as `waitForCaaEaaComplete()` above (see
 * ShowAllEntityData.user.js's `initRelationshipsColumn()` tail /
 * `_showRelCompletionToast()`), and for the same reason preferred over
 * polling the Relationships completion toast — which, unlike the CAA/EAA
 * toast, doesn't even have a stable `id` to select on.
 *
 * No-op if the page type has no Relationships feature (no
 * `injectedColumns: ['Relationships']`, or `sa_enable_relationships_column`
 * is off) — `#mb-info-display-rel` never becomes visible, so this simply
 * waits out the timeout in that case.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ timeout?: number }} [opts]
 * @returns {Promise<void>}
 */
async function waitForRelationshipsComplete(page, { timeout = 30000 } = {}) {
    await expect(page.locator('#mb-info-display-rel')).toBeVisible({ timeout });
}

module.exports = { waitForCaaEaaComplete, waitForRelationshipsComplete };
