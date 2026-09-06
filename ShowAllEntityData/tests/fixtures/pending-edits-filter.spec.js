'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// Multi-table: artist-releasegroups, three <h3> sub-tables (Album 2/3 rows
// pending, Single 1/2, Live 0/2) — see the fixture's own comment.
const RG_URL = 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f?all=1&va=0';
const RG_FIXTURE = path.join(__dirname, 'pending-edits-multi.html');

// Single-table: artist-recordings, 4 of 5 rows pending. Reused from the
// dropdown-section spec — same markup, different feature.
const REC_URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/recordings';
const REC_FIXTURE = path.join(__dirname, 'uniq-drop-pending-edits.html');

const GLOBAL_BTN = '#mb-pending-edits-btn';
const SUB_BTN = '.mb-subtable-pending-edits-btn';

const renderMulti = async (page, settingsOverride) => {
    await loadUserscriptPage(page, {
        url: RG_URL, fixtureFile: RG_FIXTURE, testMode: true,
        settingsOverride: { sa_enable_caa_pics: false, sa_enable_relationships_column: false, ...(settingsOverride || {}) },
    });
    await page.route(`${RG_URL}*`, (r) => r.fulfill({ path: RG_FIXTURE, contentType: 'text/html' }));
    await page.click('button[data-label="🧮 Artist RGs"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
};

const renderSingle = async (page, settingsOverride) => {
    await loadUserscriptPage(page, {
        url: REC_URL, fixtureFile: REC_FIXTURE, testMode: true,
        ...(settingsOverride ? { settingsOverride } : {}),
    });
    await page.route(`${REC_URL}?**`, (r) => r.fulfill({ path: REC_FIXTURE, contentType: 'text/html' }));
    await page.click('button[data-label="⊚ All recordings"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
};

/** Per-sub-table toggle state, keyed by the sub-table's own <h3> label. */
const subButtons = (page) => page.evaluate(() =>
    Array.from(document.querySelectorAll('h3.mb-toggle-h3')).map((h3) => {
        const btn = h3.querySelector('.mb-subtable-pending-edits-btn');
        return {
            section: (h3.childNodes[1]?.textContent || '').trim(),
            present: !!btn,
            visible: !!btn && btn.style.display !== 'none',
            label: btn ? btn.textContent : null,
            pressed: btn ? btn.getAttribute('aria-pressed') : null,
        };
    }));

const globalBtn = (page) => page.evaluate((sel) => {
    const b = document.querySelector(sel);
    return { visible: !!b && b.style.display !== 'none', label: b ? b.textContent : null,
             pressed: b ? b.getAttribute('aria-pressed') : null, title: b ? b.title : null };
}, GLOBAL_BTN);

/** Visible row count per sub-table, in DOM order. */
const rowsPerTable = (page) => page.evaluate(() =>
    Array.from(document.querySelectorAll('table.tbl'))
        .filter((t) => t.querySelector('.mb-col-filter-row'))
        .map((t) => Array.from(t.querySelectorAll('tbody tr'))
            .filter((r) => r.style.display !== 'none' && !r.classList.contains('mb-col-filter-row')).length));

const visibleRows = (page) => page.evaluate(() =>
    Array.from(document.querySelectorAll('table.tbl tbody tr'))
        .filter((r) => r.style.display !== 'none' && !r.classList.contains('mb-col-filter-row')).length);

test.describe('pending-edits filter toggle: multi-table', () => {
    test('offers a toggle only where a sub-table actually has pending edits', async ({ page }) => {
        await renderMulti(page);

        expect(await subButtons(page)).toEqual([
            { section: 'Album',  present: true,  visible: true,  label: '(2) ⏳', pressed: 'false' },
            { section: 'Single', present: true,  visible: true,  label: '(1) ⏳', pressed: 'false' },
            // Live has no pending rows at all — no toggle is created for it.
            { section: 'Live',   present: false, visible: false, label: null,     pressed: null },
        ]);

        const g = await globalBtn(page);
        expect(g.visible).toBe(true);
        expect(g.label).toBe('(3) ⏳');          // 2 + 1 across the page
        expect(g.pressed).toBe('false');
        expect(g.title).toContain('2 sub-sections');
    });

    test('a sub-table toggle filters only its own table', async ({ page }) => {
        await renderMulti(page);
        expect(await rowsPerTable(page)).toEqual([3, 2, 2]);

        await page.click(`h3.mb-toggle-h3:has-text("Album") ${SUB_BTN}`);
        await page.waitForFunction(() => document.querySelectorAll('table.tbl')[0]
            .querySelectorAll('tbody tr:not(.mb-col-filter-row)').length === 2, null, { timeout: 15000 });

        // Album narrows to its 2 pending rows; Single and Live are untouched.
        expect(await rowsPerTable(page)).toEqual([2, 2, 2]);
    });

    test('the global toggle is tri-state and broadcasts to every eligible sub-table', async ({ page }) => {
        await renderMulti(page);

        // off -> click one sub-table -> partial
        await page.click(`h3.mb-toggle-h3:has-text("Album") ${SUB_BTN}`);
        await page.waitForFunction((s) => document.querySelector(s).getAttribute('aria-pressed') === 'mixed',
            GLOBAL_BTN, { timeout: 15000 });
        let g = await globalBtn(page);
        expect(g.pressed).toBe('mixed');
        expect(g.title).toContain('1 of 2 filtered');

        // partial -> click global -> all on (completes the set, never clears it)
        await page.click(GLOBAL_BTN);
        await page.waitForFunction((s) => document.querySelector(s).getAttribute('aria-pressed') === 'true',
            GLOBAL_BTN, { timeout: 15000 });
        expect((await subButtons(page)).map((b) => b.pressed)).toEqual(['true', 'true', null]);
        expect(await rowsPerTable(page)).toEqual([2, 1, 2]);   // Live has no toggle, stays full

        // all -> click global -> everything off
        await page.click(GLOBAL_BTN);
        await page.waitForFunction((s) => document.querySelector(s).getAttribute('aria-pressed') === 'false',
            GLOBAL_BTN, { timeout: 15000 });
        expect((await subButtons(page)).map((b) => b.pressed)).toEqual(['false', 'false', null]);
        expect(await rowsPerTable(page)).toEqual([3, 2, 2]);
    });

    test('counts stay whole while a filter is narrowing the table', async ({ page }) => {
        await renderMulti(page);
        expect((await subButtons(page))[0].label).toBe('(2) ⏳');

        // Narrow Album to its ONE non-pending row. Its button must still report
        // 2, because the count describes the table's own rows, not whatever the
        // current filter left behind — runFilter() REMOVES non-matching rows
        // from a multi-table tbody rather than hiding them, so a live-DOM tally
        // reads 0 here and the button disappears entirely. That is precisely
        // how the length-mismatch buttons broke (filtering to ⚠️ made the ❌
        // button vanish), and the reason both counts read source rows.
        await page.fill('#mb-global-filter-input', 'Born to Run');
        await page.waitForFunction(() => document.querySelectorAll('table.tbl')[0]
            .querySelectorAll('tbody tr:not(.mb-col-filter-row)').length === 1, null, { timeout: 15000 });

        const after = await subButtons(page);
        expect(after[0].label).toBe('(2) ⏳');
        expect(after[0].visible).toBe(true);
        expect((await globalBtn(page)).label).toBe('(3) ⏳');
    });

    test('"Clear all filters" appears while engaged and releases every sub-table', async ({ page }) => {
        await renderMulti(page);
        const clearVisible = () => page.evaluate(() => {
            const b = document.getElementById('mb-clear-all-filters-btn');
            return !!b && b.style.display !== 'none';
        });
        expect(await clearVisible()).toBe(false);

        await page.click(GLOBAL_BTN);
        await page.waitForFunction((s) => document.querySelector(s).getAttribute('aria-pressed') === 'true',
            GLOBAL_BTN, { timeout: 15000 });
        // This filter is held by no input, so without it counting as "active"
        // the rows narrow while every clear affordance stays hidden.
        expect(await clearVisible()).toBe(true);

        await page.click('#mb-clear-all-filters-btn');
        await page.waitForFunction(() => document.querySelectorAll('table.tbl')[0]
            .querySelectorAll('tbody tr:not(.mb-col-filter-row)').length === 3, null, { timeout: 15000 });
        expect((await subButtons(page)).map((b) => b.pressed)).toEqual(['false', 'false', null]);
    });
});

test.describe('pending-edits filter toggle: single-table', () => {
    test('narrows to pending rows and restores them on a second press', async ({ page }) => {
        await renderSingle(page);
        expect(await visibleRows(page)).toBe(5);

        const g = await globalBtn(page);
        expect(g.visible).toBe(true);
        expect(g.label).toBe('(4) ⏳');

        await page.click(GLOBAL_BTN);
        await page.waitForFunction(() => Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((r) => r.style.display !== 'none' && !r.classList.contains('mb-col-filter-row')).length === 4,
            null, { timeout: 15000 });

        // The second press is the real assertion: it is what fails when the
        // flag is missing from _buildFilterKey(), because "no query, no column
        // filters" then hashes identically in both states and
        // _filterResultCache hands back the previous pass's rows.
        await page.click(GLOBAL_BTN);
        await page.waitForFunction(() => Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((r) => r.style.display !== 'none' && !r.classList.contains('mb-col-filter-row')).length === 5,
            null, { timeout: 15000 });
        expect((await globalBtn(page)).pressed).toBe('false');
    });

    test('composes with a typed query, in both application orders', async ({ page }) => {
        await renderSingle(page);
        const type = async (q) => {
            await page.fill('#mb-global-filter-input', q);
            await page.waitForTimeout(700);
        };

        // Query first, then the toggle.
        await type('Bowie');
        const afterQuery = await visibleRows(page);
        expect(afterQuery).toBeGreaterThan(0);
        await page.click(GLOBAL_BTN);
        await page.waitForTimeout(700);
        const both = await visibleRows(page);
        expect(both).toBeLessThanOrEqual(afterQuery);

        // Extending the query while the toggle is engaged must keep narrowing
        // correctly — this is the incremental-narrowing path, whose own
        // partial cache key has to carry the flag too.
        await type('Bowiezzz');
        expect(await visibleRows(page)).toBe(0);

        // And widening back must restore, not stay stuck at the narrowed set.
        await type('Bowie');
        expect(await visibleRows(page)).toBe(both);
    });

    test('is not offered when the pending-edits feature is switched off', async ({ page }) => {
        await renderSingle(page, { sa_enable_pending_edits_section: false });
        expect((await globalBtn(page)).visible).toBe(false);
    });
});
