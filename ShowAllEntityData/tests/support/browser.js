'use strict';

const { waitForCaaEaaComplete, waitForRelationshipsComplete } = require('./asyncCompletion');

/**
 * Waits for a triggered fetch+render to fully settle.
 *
 * `#mb-filter-container` becoming visible (`renderFinalTable()`/
 * `renderGroupedTable()`'s own "initial render finished" signal, reused
 * from `tests/support/liveAssertions.js`'s `assertGroupedRenderCompleted()`)
 * is necessary but NOT SUFFICIENT on a pageType with async CAA/EAA artwork
 * or an injected Relationships column: those complete well *after* that
 * point — confirmed empirically while building the
 * `task-playwright-html-snapshot-harness.md` pilot (`#mb-info-display-caa`/
 * `-rel` were still empty several seconds after `#mb-filter-container`
 * became visible). Capturing an HTML snapshot before they finish would bake
 * in an incomplete, run-to-run-varying `#mb-info-display-caa`/`-rel` state,
 * defeating the point of a stable baseline.
 *
 * `seedGMValue`-equivalent note: no separate helper needed here —
 * `tests/support/gmStubs.js`'s `buildGmStubsScript(initialValues)` already
 * covers seeding settings (e.g. `sa_enable_release_tracks`) before the
 * userscript's init runs.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ hasCaaOrEaa?: boolean, hasRelationships?: boolean, timeout?: number }} [opts]
 *   `hasCaaOrEaa`/`hasRelationships` should mirror the target pageType's own
 *   `features.addCAA`/`features.addEAA`/`features.injectedColumns` (does it
 *   include `'Relationships'`?) declarations in `ShowAllEntityData.user.js`'s
 *   `pageDefinitions`.
 * @returns {Promise<void>}
 */
async function waitForRenderComplete(page, { hasCaaOrEaa = false, hasRelationships = false, timeout = 90000 } = {}) {
    await page.locator('#mb-filter-container').waitFor({ state: 'visible', timeout });
    if (hasCaaOrEaa) await waitForCaaEaaComplete(page, { timeout });
    if (hasRelationships) await waitForRelationshipsComplete(page, { timeout });
}

module.exports = { waitForRenderComplete };
