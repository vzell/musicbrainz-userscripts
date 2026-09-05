'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { openSubtableTab, readCapturedSnapshot } = require('../support/subtableTab');

// The cross-tab sub-table handoff, driven for real: a "Show single-table"
// click on a multi-table page runs openSubtableAsSingleTableTab(), which
// captures a snapshot into GM storage and window.open()s a URL carrying its
// uid in the hash; the new tab reads that back and renders through
// _hydrateAndRenderFromSnapshotData().
//
// That boundary had no coverage at all, despite several features crossing it —
// CAA/EAA art cells, the Relationships column, collapse state, and now
// millisecond Length precision, whose reset on hydration is asserted here.
// Nothing below fabricates a payload: the source page captures its own, exactly
// as it does for a person clicking the button. See tests/support/subtableTab.js
// for the three Playwright-specific details that make that possible.
const PLACE_URL = 'https://musicbrainz.org/place/6a59a67c-fcc5-491f-949c-bfc45bc97463/performances';
const FIXTURE_FILE = path.join(__dirname, 'place-performances-ms-length.html');

const WS2_BODY = JSON.stringify({
    relations: [
        { recording: { id: '528327c7-0f7a-46d1-b03f-700ebc39f747', length: 305146 } },
        { recording: { id: 'de9ff1d7-dd78-4ed6-a328-c1ab126304e6', length: 305000 } },
        { recording: { id: '089026d3-1c1d-45bb-bf16-072d0bff8412', length: 334866 } },
    ],
});

/** Reads one page's rendered "Length" column, in row order, across every table. */
async function lengthValues(target) {
    return target.evaluate(() => {
        const out = [];
        document.querySelectorAll('table.tbl').forEach((tbl) => {
            const ths = Array.from(tbl.querySelectorAll('thead th'));
            const idx = ths.findIndex((t) => (t.dataset.colName || '') === 'Length');
            if (idx < 0) return;
            tbl.querySelectorAll('tbody tr').forEach((tr) => {
                if (tr.style.display === 'none' || tr.classList.contains('subh')) return;
                const td = tr.cells[idx];
                if (td) out.push(td.textContent.replace(/\s+/g, ''));
            });
        });
        return out;
    });
}

// Scoped to a VISIBLE table: not every rendered sub-table is on screen, and
// the toggle inside a hidden one is a 0x0 element Playwright will never
// click. The toggle is page-wide, so any visible one drives the whole column.
const toggle = (target) => target.locator('table.tbl:visible .mb-ms-col-hdr-btn').first();

/**
 * Routes must live on the CONTEXT: the popup navigates the instant it is
 * created, so there is no window in which to attach a per-page route to it.
 */
async function setup(page) {
    const context = page.context();
    await context.route('**/ws/2/place/**', (route) => route.fulfill({
        status: 200, contentType: 'application/json', body: WS2_BODY,
    }));
    await context.route(`${PLACE_URL}**`, (route) => route.fulfill({
        path: FIXTURE_FILE, contentType: 'text/html',
    }));
    await loadUserscriptPage(page, {
        url: PLACE_URL,
        testMode: true,
        settingsOverride: {
            sa_enable_show_single_table_btn: true,
            // Keeps the run network-free: this pageType also declares a
            // "Release events" injected column, which fetches on its own.
            sa_enable_release_events_column: false,
        },
    });
    await page.click('button[data-label="Show all Performances for Place"]');
    await page.waitForSelector('#mb-filter-container');

    // Sub-sections render collapsed, so every sub-table (and the ⏱ toggle in
    // its header) is display:none and therefore unclickable. Expand them the
    // way a person would, via the master toggle.
    const master = page.locator('.mb-master-toggle[data-state="collapsed"]');
    if (await master.count()) await master.first().click();
    await expect(page.locator('table.tbl:visible').first()).toBeVisible();
}

test.describe('cross-tab sub-table handoff', () => {
    test('a sub-table opens in its own tab and hydrates from the captured snapshot', async ({ page }) => {
        await setup(page);
        // Three rows across two relationship-type groups.
        expect(await lengthValues(page)).toEqual(['5:05', '5:05', '5:35']);
        expect(await readCapturedSnapshot(page)).toBeNull();

        const { tab, snapshot: stored } = await openSubtableTab(page, {
            categoryName: 'shooting location for recording',
        });

        // The snapshot really was written to GM storage under the documented
        // key shape, and really did carry that one sub-table's row.
        expect(stored).not.toBeNull();
        expect(stored.key).toMatch(/^mb_sa_subtable_snapshot_/);
        expect(stored.payload.tableMode).toBe('single');
        expect(stored.payload.pageType).toBe('place-performances-filtered');
        expect(stored.payload.rowCount).toBe(1);
        // The script appends the entity word to the group's own heading text.
        expect(stored.payload.detailSegment).toBe('shooting location for recording recording');

        // The tab shows exactly that sub-table's row, hydrated — not the whole
        // page, and not a re-fetch.
        expect(await lengthValues(tab)).toEqual(['5:35']);
        await tab.close();
    });

    test('the tab starts with milliseconds hidden even when the source page was showing them', async ({ page }) => {
        await setup(page);

        // Turn milliseconds ON on the source page first.
        await toggle(page).click();
        await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
        expect(await lengthValues(page)).toEqual(['5:05.146', '5:05.000', '5:34.866']);

        const { tab } = await openSubtableTab(page, {
            categoryName: 'shooting location for recording',
        });

        // Precision is a per-page view setting, not something that follows the
        // data around — so the tab starts from what MusicBrainz itself renders.
        // "5:35" also proves the seconds were recovered with MusicBrainz's
        // ROUNDING rather than truncated to "5:34".
        await expect(toggle(tab)).toHaveAttribute('aria-pressed', 'false');
        expect(await lengthValues(tab)).toEqual(['5:35']);

        // And the toggle works in the tab, round-tripping cleanly — the bug was
        // that the seconds baseline had been poisoned with the millisecond
        // string carried over from the source page, so switching off restored
        // milliseconds and the column never moved.
        await toggle(tab).click();
        await expect(toggle(tab)).toHaveAttribute('aria-pressed', 'true');
        expect(await lengthValues(tab)).toEqual(['5:34.866']);

        await toggle(tab).click();
        await expect(toggle(tab)).toHaveAttribute('aria-pressed', 'false');
        expect(await lengthValues(tab)).toEqual(['5:35']);

        await tab.close();
    });
});
