'use strict';

/**
 * Reading and driving the ⚠️ WARNING / ❌ ERROR findings menus from a test
 * (org/generalize-error-warning.org, docs/claude/findings.md).
 *
 * The two menus replaced the filter bar's live-date "(N) WARNING ⚠️ /
 * (N) ERROR ❌" and "(N) LENGTH ⚠️/❌" summary buttons. Each row is one
 * FINDINGS entry, `.mb-findings-menu-item[data-mb-finding-id="<id>"]`, and its
 * checked state is `aria-checked`. Rows live in a panel that is closed most of
 * the time, so clicks go through `clickToolbarItem()`, which opens the owning
 * menu first — the same reason `toolbarMenu.js` exists.
 *
 * Keep the layout knowledge here, for the reason `toolbarMenu.js` gives.
 */

const { clickToolbarItem } = require('./toolbarMenu');

/** Level → the menu button's id. */
const FINDINGS_MENU_BUTTON = {
    warn: 'mb-findings-warn-menu-btn',
    error: 'mb-findings-error-menu-btn',
};

/**
 * One findings menu's state, read without opening it.
 *
 * @param {import('@playwright/test').Page} page
 * @param {'warn'|'error'} level
 * @returns {Promise<null|{attached: boolean, label: string, title: string, pressed: string|null,
 *           rows: Array<{id: string, label: string, count: number, checked: string|null, title: string}>}>}
 *   `null` when the menu was never created on this page.
 */
async function findingsMenuState(page, level) {
    return page.evaluate((btnId) => {
        const btn = document.getElementById(btnId);
        if (!btn) return null;
        const panel = document.getElementById(`${btnId}-panel`);
        const container = document.getElementById('mb-show-all-controls-container');
        const rows = panel
            ? Array.from(panel.querySelectorAll('.mb-findings-menu-item[data-mb-finding-id]')).map((r) => ({
                id: r.dataset.mbFindingId,
                label: (r.querySelector('.mb-findings-item-label') || {}).textContent || '',
                count: Number((r.querySelector('.mb-findings-item-count') || {}).textContent || NaN),
                checked: r.getAttribute('aria-checked'),
                title: r.title,
            }))
            : [];
        return {
            attached: !!container && btn.parentNode === container,
            label: (btn.querySelector('.mb-toolbar-menu-btn-label') || btn).textContent.trim(),
            title: btn.title,
            pressed: btn.getAttribute('aria-pressed'),
            rows,
        };
    }, FINDINGS_MENU_BUTTON[level]);
}

/**
 * The row of one finding, or `undefined`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {'warn'|'error'} level
 * @param {string} id - A FINDINGS id, e.g. `'len-warn'`.
 */
async function findingRow(page, level, id) {
    const state = await findingsMenuState(page, level);
    return state ? state.rows.find((r) => r.id === id) : undefined;
}

/**
 * Clicks one finding's menu row (opening its menu first).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} id - A FINDINGS id.
 */
async function clickFinding(page, id) {
    await clickToolbarItem(page, `.mb-findings-menu-item[data-mb-finding-id="${id}"]`);
}

/**
 * Clicks a findings menu's trailing "Clear … filters" row.
 *
 * @param {import('@playwright/test').Page} page
 * @param {'warn'|'error'} level
 */
async function clickClearFindings(page, level) {
    await clickToolbarItem(page, `#${FINDINGS_MENU_BUTTON[level]}-panel .mb-findings-clear-item`);
}

/**
 * The rows currently rendered across every table, and how many carry a
 * finding (by id).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} [id]
 * @returns {Promise<{visible: number, withFinding: number}>}
 */
async function findingRowState(page, id) {
    return page.evaluate((fid) => {
        const rows = Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((r) => r.style.display !== 'none' && r.cells.length > 1);
        return {
            visible: rows.length,
            withFinding: fid ? rows.filter((r) => r.querySelector(`td[data-mb-findings~="${fid}"]`)).length : 0,
        };
    }, id || null);
}

module.exports = {
    FINDINGS_MENU_BUTTON, findingsMenuState, findingRow, clickFinding, clickClearFindings, findingRowState,
};
