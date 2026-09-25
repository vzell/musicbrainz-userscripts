'use strict';

/**
 * Driving the h1 controls bar's pull-down menus from a test.
 *
 * Since the action-button redesign the bar no longer holds one flat run of
 * labelled buttons. Save to Disk, Load from Disk and Export are rows inside
 * `📦 Data ▾`; Density, Statistics and the keyboard shortcuts reference are
 * rows inside `🛠 View ▾` (Barcode highlighting moved out of this menu
 * entirely, into the "Barcode" column header's own ▶/▼ toggle);
 * `artist-releasegroups`'
 * four discography views are rows inside `📀 Discography ▾`. The rows keep
 * their ids — `#mb-save-to-disk-btn` still selects the same element it always
 * did — but a row inside a closed panel is not visible, so a bare
 * `page.click('#mb-save-to-disk-btn')` waits for actionability until the test
 * times out.
 *
 * `clickToolbarItem()` is the migration for every such call site: it opens the
 * owning menu when the item needs it, and is a plain click otherwise. It reads
 * the ownership from the DOM (`data-mb-menu-owner`, written by
 * `createToolbarMenu()`'s `adopt()`), not from a table here, so a control that
 * moves between menus — or out of one, as ↔️ Resize and 👁️ Visible did when
 * they moved to the h2 — needs no change on this side.
 *
 * Keep the layout knowledge in THIS file. That is the point of it: a spec that
 * hard-codes "click #mb-data-menu-btn, then click the row" pins the current
 * grouping as if it were the behaviour under test, and the next grouping
 * change then edits nine specs instead of one helper.
 */

/** Menu short name (`data-mb-menu-owner`) → its button's selector. */
const TOOLBAR_MENU_BUTTON = {
    data: '#mb-data-menu-btn',
    view: '#mb-view-menu-btn',
    disc: '#mb-disc-menu-btn',
};

/**
 * Opens one toolbar menu by name, if it is not already open.
 *
 * @param {import('@playwright/test').Page} page
 * @param {'data'|'view'|'disc'} which
 * @returns {Promise<boolean>} False when that menu does not exist on this page
 *   — every row it would hold is gated off, so `_orderToolbar()` never attached
 *   its button. Callers that need the menu should assert on this.
 */
async function openToolbarMenu(page, which) {
    const selector = TOOLBAR_MENU_BUTTON[which];
    if (!selector) throw new Error(`openToolbarMenu: unknown menu "${which}"`);

    const btn = page.locator(selector);
    if (await btn.count() === 0) return false;
    if (await btn.getAttribute('aria-expanded') === 'true') return true;

    await btn.click();
    await page.locator(`${selector}-panel`).waitFor({ state: 'visible' });
    return true;
}

/**
 * Clicks a toolbar control by selector, opening its host menu first when it is
 * a menu row.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} selector - e.g. `'#mb-save-to-disk-btn'`.
 * @param {{ force?: boolean, timeout?: number }} [opts] - `force` skips
 *   Playwright's actionability checks, for a row whose panel can extend below
 *   the fold in the project's 1280x720 viewport. `timeout` applies to the click
 *   itself, for a control whose handler serialises a large dataset before it
 *   settles.
 * @returns {Promise<void>}
 */
async function clickToolbarItem(page, selector, { force = false, timeout } = {}) {
    const item = page.locator(selector);
    await item.waitFor({ state: 'attached', timeout });

    const owner = await item.getAttribute('data-mb-menu-owner');
    if (owner) {
        const opened = await openToolbarMenu(page, owner);
        if (!opened) {
            throw new Error(
                `clickToolbarItem: "${selector}" belongs to the "${owner}" menu, ` +
                'but that menu is not present on this page');
        }
    }

    await item.click(timeout === undefined ? { force } : { force, timeout });
}

/**
 * Reads which menu owns a control, or null when it is not in a menu at all
 * (↔️ Resize and 👁️ Visible live in the h2 heading, not the bar).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} selector
 * @returns {Promise<string|null>}
 */
async function toolbarItemOwner(page, selector) {
    const item = page.locator(selector);
    if (await item.count() === 0) return null;
    return item.getAttribute('data-mb-menu-owner');
}

module.exports = { TOOLBAR_MENU_BUTTON, openToolbarMenu, clickToolbarItem, toolbarItemOwner };
