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
 * A COLLAPSED column still resolves this, and deliberately so. Since
 * 9.99.1060 a table whose Relationships column would need more than
 * `sa_rel_collapse_threshold` distinct lookups starts collapsed and fetches
 * nothing, but `_relPublishCollapsedStatus()` publishes `🔗Rels: collapsed`
 * into this same element — because what the element means is "this subsystem
 * has settled", which is true either way, and a wait that hung on the shipped
 * default would be worse than useless. Read the TEXT, not just visibility, if
 * a spec needs to know which of the two happened.
 *
 * Note this is NOT the wait to reach for on a large page. `_showRelCompletionToast()`
 * fires when the whole Phase-2 queue drains, and that queue is serialised
 * 1100 ms apart — a 2 000-entity listing simply outlasts any sane timeout.
 * Poll the thing you actually care about (populated `td.mb-rel-cell a`, or
 * `__saTest.relTableStates()[i].pending`) until it stops changing. Same
 * argument, and the same trap, as `waitForCaaEaaComplete()` above.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ timeout?: number }} [opts]
 * @returns {Promise<void>}
 */
async function waitForRelationshipsComplete(page, { timeout = 30000 } = {}) {
    await expect(page.locator('#mb-info-display-rel')).toBeVisible({ timeout });
}

module.exports = { waitForCaaEaaComplete, waitForRelationshipsComplete };
