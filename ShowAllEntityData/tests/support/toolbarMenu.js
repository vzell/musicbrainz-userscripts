'use strict';

/**
 * Driving the SAED button's menus from a test.
 *
 * Since the SAED button (2026-10-22) everything the script adds to the page
 * heading is one segmented button, `#mb-saed-bar`. Save to Disk, Load from
 * Disk and Export ▸ are rows of the ☰ SAED menu's Data group; Density,
 * Statistics and the keyboard shortcuts reference are rows of its View group
 * (Keyboard Shortcuts sits in Help while View would hold nothing else);
 * Settings and Help are its Help group; What's new and the full log its
 * Changelog group; Export's four formats are a submenu of the Export row.
 * `artist-releasegroups`' four discography views are rows of the
 * `📀 Discography ▾` segment, and each findings level is an indicator
 * segment (`❌ 1 ▾`, `⚠️ 43 ▾`). The rows keep their ids —
 * `#mb-save-to-disk-btn` still selects the same element it always did — but a
 * row inside a closed panel is not visible, so a bare
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

/** The ☰ SAED segment, which opens the script's menu. */
const SAED_MENU_BUTTON = '#mb-saed-menu-btn';

/**
 * Menu or group short name (`data-mb-menu-owner`) → the segment that opens it.
 * Every group of the SAED menu opens through ☰ SAED.
 */
const TOOLBAR_MENU_BUTTON = {
    saed: SAED_MENU_BUTTON,
    data: SAED_MENU_BUTTON,
    view: SAED_MENU_BUTTON,
    help: SAED_MENU_BUTTON,
    log: SAED_MENU_BUTTON,
    attn: SAED_MENU_BUTTON,
    load: SAED_MENU_BUTTON,
    hist: SAED_MENU_BUTTON,
    disc: '#mb-disc-menu-btn',
    'findings-warn': '#mb-findings-warn-menu-btn',
    'findings-error': '#mb-findings-error-menu-btn',
};

/** Submenu short name → the row of the SAED menu that opens it. */
const TOOLBAR_SUBMENU_ROW = {
    export: '#mb-export-btn',
    // The Editing history group's "Entity history ▸" (panel #mb-saed-hist-sub-panel).
    'saed-hist': '#mb-saed-hist-btn',
};

/**
 * Opens one toolbar menu by name, if it is not already open. A group of the
 * SAED menu opens the SAED menu; a submenu (Export ▸) opens the SAED menu and
 * then its row.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} which - A key of TOOLBAR_MENU_BUTTON or TOOLBAR_SUBMENU_ROW.
 * @returns {Promise<boolean>} False when that menu does not exist on this page
 *   — every row it would hold is gated off, so `_orderToolbar()` never attached
 *   its segment. Callers that need the menu should assert on this.
 */
async function openToolbarMenu(page, which) {
    if (TOOLBAR_SUBMENU_ROW[which]) {
        if (!await openToolbarMenu(page, 'saed')) return false;
        const row = page.locator(TOOLBAR_SUBMENU_ROW[which]);
        if (await row.count() === 0) return false;
        if (await row.getAttribute('aria-expanded') !== 'true') await row.click();
        await page.locator(`#mb-${which}-sub-panel`).waitFor({ state: 'visible' });
        return true;
    }
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
 *   Playwright's actionability checks. It was added for a row whose panel
 *   extended below the fold in the project's 1280x720 viewport; since
 *   9.99.1262 a panel always fits the window (opening upward, or capped and
 *   scrolling), so no caller needs it for that. `timeout` applies to the click
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

/**
 * Presses one of the page's actions (a `🧮 …` fetch button) the way a user
 * can on this screen: its segment on the SAED button, or — on a narrow
 * layout, where the segments leave the bar — its row in the ☰ menu's "Load"
 * group (`_saedApplyNarrow()`, ≤ 520 px).
 *
 * The narrow case is every phone on a real MusicBrainz page: MusicBrainz
 * sets `<meta name="viewport" content="width=device-width, …">`, so a Pixel 7
 * lays the page out 412 px wide (chromium-mobile). A fixture without that
 * tag is laid out 980 px wide and keeps its segments. A Load row clicks its
 * segment, so the fetch, its event target and its running state are the
 * segment's either way. `selector` names the SEGMENT
 * (`button[data-label="…"]`).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} selector - The action segment.
 * @param {{tap?: boolean}} [opts] - `tap`: touch taps instead of clicks.
 * @returns {Promise<void>}
 */
async function pressAction(page, selector, { tap = false } = {}) {
    const seg = page.locator(selector).first();
    await seg.waitFor({ state: 'attached' });
    const press = (loc) => (tap ? loc.tap() : loc.click());
    if (await seg.isVisible()) {
        await press(seg);
        return;
    }
    const idx = await seg.evaluate((b) =>
        Array.from(document.querySelectorAll('#mb-saed-bar .mb-seg-action')).indexOf(b));
    if (idx < 0) throw new Error(`pressAction: "${selector}" is not an action segment of the SAED button`);
    await press(page.locator(SAED_MENU_BUTTON));
    await press(page.locator(`${SAED_MENU_BUTTON}-panel .mb-saed-group[data-mb-group="load"] .mb-saed-load-row`).nth(idx));
}

module.exports = {
    SAED_MENU_BUTTON, TOOLBAR_MENU_BUTTON, TOOLBAR_SUBMENU_ROW, openToolbarMenu, clickToolbarItem, toolbarItemOwner,
    pressAction,
};
