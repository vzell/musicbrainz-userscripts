// @ts-check
'use strict';

/**
 * Multi-table pages: a sub-table that a PAGE-WIDE filter (the global filter, or
 * a findings-menu filter) leaves with no row is hidden — its h3 and its table —
 * and comes back, in the state it had, once the filter broadens again.
 * See `_syncEmptySubtableVisibility()` and docs/claude/filter-and-cache-invariants.md,
 * "Empty sub-tables under a page-wide filter".
 *
 * Fixture: "Tougher Than the Rest" (releasegroup-releases), two sub-tables —
 * Official release (6 rows, one of them the only "Cassette") and Promotion
 * release (1 row, a 7" Vinyl). So:
 *   - "Cassette" empties Promotion only,
 *   - "Vinyl" matches both,
 *   - "zzzz-no-match" empties both.
 *
 * Every assertion on hiding reads the h3, never the table alone: a COLLAPSED
 * sub-table's table is display:none anyway, so "the table is hidden" would pass
 * with the feature missing.
 *
 * The findings-menu trigger (`_findingRowFilter`, or a finding's 📊 tick in a
 * column filter) is not exercised here: this fixture carries no finding. It
 * goes through the same render tail; `_isFindingOnlyColFilter()` is what keeps
 * a cell-scope tick from counting as a sub-table's own filter.
 */

const path = require('path');
const { test, expect } = require('../support/test');
const { loadFromDiskFixture } = require('../support/diskFixture');
const {
    waitForFilterSettled, typeGlobalFilter, waitForSortSettled,
    getRowCountTooltip, columnIndex, columnFilterInput, ensureSubTableVisible,
} = require('../support/filterSortAssertions');

const RG_URL = 'https://musicbrainz.org/release-group/f83d2211-dd81-4b1e-9a02-e89733891e1c';
const RG_SHELL = path.join(__dirname, '..', 'snapshots', 'releasegroup-releases', 'raw.html');
const RG_FIXTURE = path.join(__dirname, 'saved-data', 'releasegroup-releases.json.gz');

const OFFICIAL = 0;
const PROMOTION = 1;

/**
 * Loads the fixture and waits for both sub-tables.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object<string, *>} [settingsOverride]
 */
async function load(page, settingsOverride) {
    await loadFromDiskFixture(page, {
        url: RG_URL, fixturePath: RG_FIXTURE, pageFixtureFile: RG_SHELL, testMode: true,
        settingsOverride,
    });
    await expect(page.locator('#mb-filter-container')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('h3.mb-toggle-h3')).toHaveCount(2);
}

/** @param {import('@playwright/test').Page} page @param {number} i */
const h3 = (page, i) => page.locator('h3.mb-toggle-h3').nth(i);
/** @param {import('@playwright/test').Page} page @param {number} i */
const table = (page, i) => page.locator('table.tbl').nth(i);

/**
 * The global filter, set to `text` (empty clears it), then settled.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} text
 */
async function setGlobal(page, text) {
    const input = page.locator('#mb-global-filter-input');
    if (text && !(await input.inputValue()).replace(/\u{1F50D}\s*/u, '')) {
        await waitForFilterSettled(page, () => typeGlobalFilter(page, text));
    } else {
        await waitForFilterSettled(page, () => input.fill(text));
    }
}

/**
 * One sub-table's state, as the user sees it: h3 shown, table shown, ▼/▲.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} i
 * @returns {Promise<{h3Visible: boolean, tableDisplay: string, icon: string, marked: boolean}>}
 */
const state = (page, i) => page.evaluate((idx) => {
    const h = document.querySelectorAll('h3.mb-toggle-h3')[idx];
    const t = document.querySelectorAll('table.tbl')[idx];
    return {
        h3Visible: h.getClientRects().length > 0,
        tableDisplay: t.style.display,
        icon: (h.querySelector('.mb-toggle-icon') || {}).textContent || '',
        marked: t.dataset.mbEmptyHidden === '1',
    };
}, i);

test.describe('hide empty sub-tables under a page-wide filter', () => {
    test('a sub-table the global filter empties is hidden, the others are not', async ({ page }) => {
        test.setTimeout(120000);
        await load(page);
        await setGlobal(page, 'Cassette');

        await expect(h3(page, PROMOTION)).toBeHidden();
        await expect(table(page, PROMOTION)).toBeHidden();
        expect((await state(page, PROMOTION)).marked).toBe(true);
        await expect(h3(page, OFFICIAL)).toBeVisible();
        expect((await state(page, OFFICIAL)).marked).toBe(false);

        const tip = (await getRowCountTooltip(page)).replace(/<[^>]+>/g, '');
        expect(tip, 'the h2 tooltip says how many sub-tables are hidden').toContain('1 of 2 sub-tables hidden');
    });

    test('broadening brings it back EXPANDED when it was expanded', async ({ page }) => {
        test.setTimeout(120000);
        await load(page);
        await ensureSubTableVisible(page, PROMOTION);
        const before = await state(page, PROMOTION);
        expect(before.tableDisplay).toBe('');
        expect(before.icon).toBe('▼');

        await setGlobal(page, 'Cassette');
        await expect(h3(page, PROMOTION)).toBeHidden();
        // Hidden by class: the collapse state underneath is untouched.
        expect((await state(page, PROMOTION)).tableDisplay).toBe('');

        await setGlobal(page, 'Vinyl'); // broader for Promotion: its row matches again
        await expect(h3(page, PROMOTION)).toBeVisible();
        await expect(table(page, PROMOTION)).toBeVisible();
        expect(await state(page, PROMOTION)).toEqual({ ...before, marked: false });
        await expect(h3(page, PROMOTION).locator('.mb-row-count-stat')).toHaveText('(1)');
    });

    test('clearing brings it back COLLAPSED when it was collapsed', async ({ page }) => {
        test.setTimeout(120000);
        await load(page);
        const before = await state(page, PROMOTION);
        expect(before.tableDisplay).toBe('none');
        expect(before.icon).toBe('▲');

        await setGlobal(page, 'Cassette');
        await expect(h3(page, PROMOTION)).toBeHidden();

        await setGlobal(page, '');
        await expect(h3(page, PROMOTION)).toBeVisible();
        await expect(table(page, PROMOTION)).toBeHidden();
        expect(await state(page, PROMOTION)).toEqual({ ...before, marked: false });
    });

    test('nothing matches: every sub-table is hidden', async ({ page }) => {
        test.setTimeout(120000);
        await load(page);
        await setGlobal(page, 'zzzz-no-match');
        await expect(h3(page, OFFICIAL)).toBeHidden();
        await expect(h3(page, PROMOTION)).toBeHidden();
        const tip = (await getRowCountTooltip(page)).replace(/<[^>]+>/g, '');
        expect(tip).toContain('2 of 2 sub-tables hidden');
        expect(tip).toContain('global filter');

        await setGlobal(page, '');
        await expect(h3(page, OFFICIAL)).toBeVisible();
        await expect(h3(page, PROMOTION)).toBeVisible();
        expect((await getRowCountTooltip(page))).not.toContain('sub-tables hidden');
    });

    test('a sub-table with its own sub-table filter stays visible when empty', async ({ page }) => {
        test.setTimeout(120000);
        await load(page);
        const panel = h3(page, PROMOTION).locator('.mb-subtable-filter-container');
        if (!await panel.isVisible()) await h3(page, PROMOTION).locator('.mb-subtable-filter-toggle-icon').click();
        await expect(panel).toBeVisible();
        const stf = panel.locator('input[type="search"]');
        await stf.click();
        await stf.pressSequentially('zzzz-no-match');
        await expect(h3(page, PROMOTION).locator('.mb-row-count-stat')).toHaveText('(0 of 1)');

        // Typed after the STF, so the focus has left the sub-table: only the
        // own-filter exemption can keep it on screen.
        await setGlobal(page, 'Cassette');
        await expect(h3(page, OFFICIAL)).toBeVisible();
        await expect(h3(page, PROMOTION)).toBeVisible();
        await expect(stf).toBeVisible();
        expect((await state(page, PROMOTION)).marked).toBe(false);
    });

    test('a sub-table with its own column filter stays visible when empty', async ({ page }) => {
        test.setTimeout(120000);
        await load(page);
        await ensureSubTableVisible(page, PROMOTION);
        const idx = await columnIndex(page, 'Format', { tableIndex: PROMOTION });
        expect(idx).toBeGreaterThanOrEqual(0);
        const cf = columnFilterInput(page, idx, { tableIndex: PROMOTION });
        await waitForFilterSettled(page, async () => {
            await cf.click();
            await cf.pressSequentially('zzzz');
        });
        await expect(h3(page, PROMOTION).locator('.mb-row-count-stat')).toHaveText('(0 of 1)');

        await setGlobal(page, 'Cassette');
        await expect(h3(page, PROMOTION)).toBeVisible();
        await expect(cf).toBeVisible();
        expect((await state(page, PROMOTION)).marked).toBe(false);
    });

    test('the master toggle neither reveals a hidden sub-table nor counts it as open', async ({ page }) => {
        test.setTimeout(120000);
        await load(page);
        // Promotion expanded (style.display ''), Official collapsed: with the
        // hidden Promotion counted as open, the label would say "Hide all".
        await ensureSubTableVisible(page, PROMOTION);
        expect((await state(page, OFFICIAL)).tableDisplay).toBe('none');

        await setGlobal(page, 'Cassette');
        await expect(h3(page, PROMOTION)).toBeHidden();
        const toggle = page.locator('.mb-master-toggle');
        await expect(toggle).toHaveText('Show all sub-sections');

        await toggle.click();
        await expect(table(page, OFFICIAL)).toBeVisible();
        await expect(h3(page, PROMOTION)).toBeHidden();
        await expect(table(page, PROMOTION)).toBeHidden();
    });

    test('sorting a visible sub-table keeps the empty one hidden', async ({ page }) => {
        test.setTimeout(120000);
        await load(page);
        await ensureSubTableVisible(page, OFFICIAL);
        await setGlobal(page, 'Cassette');
        await expect(h3(page, PROMOTION)).toBeHidden();

        const th = table(page, OFFICIAL).locator('thead tr:first-child th').first();
        const asc = th.locator('.sort-icon-btn', { hasText: '▲' }).first();
        await waitForSortSettled(page, () => asc.click(),
            { statusLocator: h3(page, OFFICIAL).locator('.mb-sort-status') });
        await expect(h3(page, OFFICIAL)).toBeVisible();
        await expect(h3(page, PROMOTION)).toBeHidden();
    });

    test('setting off: every sub-table stays, showing (0 of N)', async ({ page }) => {
        test.setTimeout(120000);
        await load(page, { sa_hide_empty_subtables: false });
        await setGlobal(page, 'Cassette');
        await expect(h3(page, PROMOTION)).toBeVisible();
        await expect(h3(page, PROMOTION).locator('.mb-row-count-stat')).toHaveText('(0 of 1)');
        expect((await state(page, PROMOTION)).marked).toBe(false);
        expect(await getRowCountTooltip(page)).not.toContain('sub-tables hidden');
    });
});
