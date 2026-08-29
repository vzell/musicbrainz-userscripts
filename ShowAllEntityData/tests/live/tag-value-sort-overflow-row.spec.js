'use strict';

const { test, expect } = require('../support/test');
const { loadUserscriptPageWithRealNetwork } = require('../support/realNetworkGmXhr');
const { collectPageErrors, clickMasterToggleAndExpandAll } = require('../support/liveAssertions');
const { waitForCaaEaaComplete } = require('../support/asyncCompletion');
const { waitForSortSettled, getSubTableRowCounts } = require('../support/filterSortAssertions');

/**
 * Reproduces (and, once the corresponding production fix lands, guards
 * against a regression of) the bug described in debug/tag-rock-initial.org:
 * on a `tag-value` page, each `<h3>` section's native trailing
 * `<li><em><a href="/tag/…">See all N <entity>s</a></em></li>` becomes a
 * "Show all N rows" overflow button on first render, but the row itself
 * secretly survives in the script's in-memory row arrays. The very next
 * sort click on ANY uncollapsed sub-table's column re-inserts it as a real,
 * permanently visible row in EVERY sub-table that has an overflow button —
 * not just the one that was sorted — flipping each affected group's
 * row-count badge from "(N)" to "(N+1 of N)".
 *
 * Needs REAL CAA/EAA network access (per the .org file's explicit step 2b
 * "press both the CAA and EAA global toggle buttons" requirement) — the
 * standard `loadUserscriptPage()` + `gmStubs.js` path always fakes
 * GM_xmlhttpRequest as a 404. See realNetworkGmXhr.js's JSDoc and
 * subtable-filter-sort-caa-interaction.spec.js (the template this spec is
 * modeled on) for why real network is required here.
 */

const TAG_URL = 'https://musicbrainz.org/tag/rock';
const SHOW_ALL_BUTTON = 'button[data-label="Show all Entities tagged"]';
// The .org file's own repro target — an "Artists" section entity's
// synthetic split ("Comment") is where the bug was first observed.
const TARGET_GROUP_LABEL = 'Artists';
const SORT_COLUMN = 'Comment';

/**
 * Reads each native `<h3>` section's trailing "See all N <entity>s" count
 * directly from the raw, not-yet-fetched page — before any userscript
 * DOM-processing (applyListToTable) has run. Only sections that actually
 * overflow (>10 real entities) have this trailing `<li>`; sections without
 * one (e.g. a tag with ≤10 instruments) are simply absent from the map.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Record<string, number>>} groupLabel (e.g. "Artists") -> expected overflow count
 */
async function getExpectedOverflowCounts(page) {
    return page.evaluate(() => {
        const map = {};
        Array.from(document.querySelectorAll('h3')).forEach((h3) => {
            const ul = h3.nextElementSibling;
            if (!ul || ul.tagName !== 'UL') return;
            const lastLi = ul.querySelector(':scope > li:last-child');
            const link = lastLi && lastLi.querySelector('em > a[href]');
            const text = link ? link.textContent.trim() : '';
            const match = text.match(/^See all ([\d,]+)/i);
            if (match) {
                map[h3.textContent.trim()] = Number(match[1].replace(/,/g, ''));
            }
        });
        return map;
    });
}

/**
 * Reads every rendered sub-table's "Show all N rows" overflow button count,
 * keyed by its group's own h3 label — matches getExpectedOverflowCounts()'s
 * shape so the two can be compared directly.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Record<string, number>>}
 */
async function getRenderedOverflowButtonCounts(page) {
    return page.evaluate(() => {
        const map = {};
        Array.from(document.querySelectorAll('h3.mb-toggle-h3')).forEach((h3) => {
            const btn = h3.querySelector('.mb-show-all-subtable-btn');
            if (!btn) return;
            const match = btn.textContent.match(/Show all ([\d,]+) rows/i);
            if (!match) return;
            const labelNode = Array.from(h3.childNodes).find((n) => n.nodeType === 3 && n.textContent.trim());
            const groupLabel = labelNode ? labelNode.textContent.trim() : '';
            map[groupLabel] = Number(match[1].replace(/,/g, ''));
        });
        return map;
    });
}

/**
 * Counts any `<tr>` anywhere on the page whose text still starts with the
 * native "See all N …" overflow-link phrasing — the phantom row this bug
 * resurrects. Should always be 0, before AND after sorting.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<number>}
 */
async function countPhantomSeeAllRows(page) {
    return page.locator('table.tbl tbody tr', { hasText: /^See all [\d,]+/ }).count();
}

test.describe('tag-value overflow row survives a sort (debug/tag-rock-initial.org)', { tag: '@extended' }, () => {
    test('sorting one sub-table does not resurrect the "See all N" row in ANY sub-table', async ({ page }) => {
        const pageErrors = collectPageErrors(page);

        await loadUserscriptPageWithRealNetwork(page, { url: TAG_URL, testMode: true });

        // ── Step 1: capture the native page's own overflow counts ─────────
        const expectedCounts = await getExpectedOverflowCounts(page);
        expect(Object.keys(expectedCounts).length).toBeGreaterThan(0);
        expect(expectedCounts[TARGET_GROUP_LABEL]).toBeGreaterThan(10);

        // ── Step 1b: fetch/render ──────────────────────────────────────────
        const showAllBtn = page.locator(SHOW_ALL_BUTTON);
        await expect(showAllBtn).toBeVisible();
        await showAllBtn.click();
        await expect(page.locator('#mb-filter-container')).toBeVisible({ timeout: 90000 });
        await waitForCaaEaaComplete(page, { timeout: 60000 });

        // ── Step 2a: uncollapse every sub-section ──────────────────────────
        await clickMasterToggleAndExpandAll(page);

        // ── Step 2b: show both CAA and EAA images for all sub-tables ───────
        const globalCaaBtn = page.locator('#mb-caa-toggle-btn-global');
        const globalEaaBtn = page.locator('#mb-eaa-toggle-btn-global');
        await expect(globalCaaBtn).toBeVisible({ timeout: 15000 });
        await globalCaaBtn.click();
        await expect(globalEaaBtn).toBeVisible({ timeout: 15000 });
        await globalEaaBtn.click();
        await waitForCaaEaaComplete(page, { timeout: 60000 });

        // ── Step 3: overflow button counts match the native page's own counts ──
        const renderedCounts = await getRenderedOverflowButtonCounts(page);
        for (const [groupLabel, expectedCount] of Object.entries(expectedCounts)) {
            expect(renderedCounts[groupLabel], `overflow count for "${groupLabel}"`).toBe(expectedCount);
        }

        // ── Baseline: every sub-table reads "(N)", never "(N of M)" ────────
        const subBefore = await getSubTableRowCounts(page);
        for (const g of subBefore) {
            expect(g.filtered, `pre-sort filtered==total for "${g.groupLabel}"`).toBe(g.total);
        }
        expect(await countPhantomSeeAllRows(page)).toBe(0);

        // ── Step 4/5: uncollapse the target sub-table's column and sort ────
        const targetH3 = page.locator('h3.mb-toggle-h3', { hasText: TARGET_GROUP_LABEL }).first();
        const columnTh = targetH3.locator('xpath=following::table[1]').locator('thead th', { hasText: SORT_COLUMN }).first();
        const ascendingBtn = columnTh.locator('.sort-icon-btn', { hasText: '▲' }).first();
        await waitForSortSettled(page, () => ascendingBtn.click(), { subTableHeading: TARGET_GROUP_LABEL });

        // ── Step 6/7: the bug — no group's badge should now read "(N of M)",
        // and this must hold for every sub-table with an overflow button,
        // not just the one that was just sorted. ──────────────────────────
        const subAfter = await getSubTableRowCounts(page);
        for (const g of subAfter) {
            expect(g.filtered, `post-sort filtered==total for "${g.groupLabel}"`).toBe(g.total);
            if (Object.prototype.hasOwnProperty.call(expectedCounts, g.groupLabel)) {
                expect(g.total, `post-sort total unchanged for "${g.groupLabel}"`).toBe(subBefore.find((b) => b.groupLabel === g.groupLabel).total);
            }
        }
        expect(await countPhantomSeeAllRows(page)).toBe(0);

        // ── Sort a second, never-touched sub-table too — the .org file's own
        // claim is that contamination isn't scoped to the sorted table, so
        // confirm sorting elsewhere doesn't resurrect anything either. ─────
        const secondGroupLabel = subBefore.map((g) => g.groupLabel).find((label) => label !== TARGET_GROUP_LABEL && expectedCounts[label]);
        if (secondGroupLabel) {
            const secondH3 = page.locator('h3.mb-toggle-h3', { hasText: secondGroupLabel }).first();
            const secondColumnTh = secondH3.locator('xpath=following::table[1]').locator('thead th').first();
            const secondAscendingBtn = secondColumnTh.locator('.sort-icon-btn', { hasText: '▲' }).first();
            await waitForSortSettled(page, () => secondAscendingBtn.click(), { subTableHeading: secondGroupLabel });

            const subAfterSecondSort = await getSubTableRowCounts(page);
            for (const g of subAfterSecondSort) {
                expect(g.filtered, `after 2nd sort, filtered==total for "${g.groupLabel}"`).toBe(g.total);
            }
            expect(await countPhantomSeeAllRows(page)).toBe(0);
        }

        expect(pageErrors).toEqual([]);
    });
});
