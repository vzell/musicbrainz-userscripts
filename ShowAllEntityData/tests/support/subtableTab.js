'use strict';

const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

const IRO_URL = 'https://cdn.jsdelivr.net/npm/@jaames/iro@5';
const PAKO_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js';
const MB_LIBRARY_PATH = path.join(REPO_ROOT, 'lib', 'VZ_MBLibrary.user.js');
const USERSCRIPT_PATH = path.join(PROJECT_ROOT, 'ShowAllEntityData.user.js');

/**
 * Drives the REAL cross-tab sub-table handoff — `openSubtableAsSingleTableTab()`
 * on one page through to `_hydrateAndRenderFromSnapshotData()` on the next —
 * and returns the opened tab, ready to assert against.
 *
 * Same philosophy as `diskFixture.js`: exercise the actual runtime mechanism
 * rather than fabricate its input. Nothing here hand-builds a snapshot payload;
 * the source page captures its own, exactly as it does for a person clicking
 * the button.
 *
 * The handoff, traced from the script:
 *   1. `openSubtableAsSingleTableTab()` calls
 *      `GM_setValue('mb_sa_subtable_snapshot_<uid>', payload)` and then
 *      `window.open(<url>#mb-sa-snapshot=<uid>, '_blank')`.
 *   2. The new tab reads the uid out of `location.hash`, `GM_getValue`s the
 *      payload, `GM_deleteValue`s it, and hydrates.
 *
 * Three things make that work under Playwright, none of them obvious:
 *
 *   - **The GM store must be shared across the two pages.** `gmStubs.js` backs
 *     `GM_getValue`/`GM_setValue` with `localStorage` and is installed via
 *     `context.addInitScript()`, so every page in the context gets the stubs
 *     and — being same-origin — the same underlying store. That is what lets
 *     the payload survive the `window.open`. (`gmStubs.js`'s own JSDoc names
 *     this handoff as the reason it is `localStorage`-backed.)
 *   - **Routing must be on the CONTEXT, not the page.** The popup navigates the
 *     moment it is created, so there is no window in which to attach a
 *     `page.route()` to it. `context.route()` is already in force when it
 *     opens.
 *   - **The userscript must be injected into the popup by hand.** Only the GM
 *     stubs ride along on `addInitScript`; the script itself is added with
 *     `addScriptTag` per page, mirroring `loadUserscriptPage()`'s own order
 *     (iro, pako, VZ_MBLibrary, then the userscript).
 *
 * @param {import('@playwright/test').Page} page - The source page, already
 *   rendered into its multi-table view.
 * @param {{ categoryName?: string, timeout?: number }} [opts]
 *   `categoryName` picks which sub-table's "Show single-table" button to click
 *   (substring-matched against the button's own title, which embeds the
 *   category); omit it to click the first one on the page.
 * @returns {Promise<{tab: import('@playwright/test').Page, snapshot: ?Object}>}
 *   The hydrated tab, plus the payload the source page captured for it.
 *   `snapshot` is read in the window between the click and injecting the
 *   userscript into the tab — the destination `GM_deleteValue`s the key the
 *   moment it consumes it, and since the script is injected by hand here,
 *   that cannot happen until this function allows it. Reading it afterwards
 *   would always come back empty.
 */
async function openSubtableTab(page, { categoryName, timeout = 30000 } = {}) {
    const context = page.context();

    const btn = categoryName
        ? page.locator(`.mb-show-single-table-btn[title*="${categoryName}"]`).first()
        : page.locator('.mb-show-single-table-btn').first();
    await btn.waitFor({ state: 'visible', timeout });

    const [tab] = await Promise.all([
        context.waitForEvent('page', { timeout }),
        btn.click(),
    ]);

    const snapshot = await readCapturedSnapshot(page);

    await tab.waitForLoadState('domcontentloaded');
    await tab.addScriptTag({ url: IRO_URL });
    await tab.addScriptTag({ url: PAKO_URL });
    await tab.addScriptTag({ path: MB_LIBRARY_PATH });
    await tab.addScriptTag({ path: USERSCRIPT_PATH });

    // Hydration is what this handoff exists for, so wait for its table rather
    // than for an action button — the tab renders straight from the snapshot
    // and never shows one.
    await tab.waitForSelector('table.tbl tbody tr', { timeout });
    return { tab, snapshot };
}

/**
 * Reads back what the source page actually put into GM storage, so a test can
 * assert on the handoff itself rather than only on its visible effect.
 *
 * Note the destination `GM_deleteValue`s the key as soon as it has consumed it,
 * so call this BEFORE opening the tab if you want to see the payload.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<?{key: string, payload: Object}>} `null` when no snapshot
 *   has been captured yet.
 */
async function readCapturedSnapshot(page) {
    return page.evaluate(() => {
        // gmStubs.js keeps every GM value inside ONE localStorage entry as a
        // JSON object, rather than as individual top-level keys.
        let values = {};
        try {
            values = JSON.parse(localStorage.getItem('__sa_test_gm_values__') || '{}');
        } catch {
            return null;
        }
        const key = Object.keys(values).find((k) => k.startsWith('mb_sa_subtable_snapshot_'));
        return key ? { key, payload: values[key] } : null;
    });
}

module.exports = { openSubtableTab, readCapturedSnapshot };
