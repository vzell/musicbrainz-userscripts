'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// Reuses the already-committed uniq-drop-date-expression fixture (see
// uniq-drop-date-expression.spec.js) — a single-table artist-events page
// with a "Date" column, headed by the native "Events" h2.
const ARTIST_EVENTS_URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/events';
const FIXTURE_FILE = path.join(__dirname, 'uniq-drop-date-expression.html');

async function openDateDropAndCollectDebugLines(page, settingsOverride) {
    const lines = [];
    page.on('console', (msg) => {
        if (msg.text().includes('Uniq-drop')) lines.push(msg.text());
    });
    await loadUserscriptPage(page, { url: ARTIST_EVENTS_URL, fixtureFile: FIXTURE_FILE, testMode: true, settingsOverride });
    await page.click('button[data-label="Show all Events for Artist"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
    const wrap = page.locator('table.tbl thead th[data-col-name="Date"] .mb-col-uniq-wrap').first();
    await wrap.locator('.mb-col-uniq-btn').click();
    await expect(page.locator('#mb-col-uniq-dropdown')).toBeVisible();
    return lines;
}

// sa_enable_uniq_drop_context_debug is the SOLE on/off switch for these
// debug lines — there is deliberately no "on, without column/table context"
// mode. Off means zero "Uniq-drop col N" lines, even with the script-wide
// "Enable debug logging" master switch on; on means every line carries
// col="…" table="…", even with the master switch also on (still required —
// Lib.debug() itself no-ops when it's off, covered by the last test below).
test.describe('unique-values dropdown: sa_enable_uniq_drop_context_debug setting', () => {
    test('defaults to off — no "Uniq-drop" debug lines at all, even with the debug-logging master switch on', async ({ page }) => {
        const lines = await openDateDropAndCollectDebugLines(page, { sa_enable_debug_logging: true });
        expect(lines.length).toBe(0);
    });

    test('when enabled, every debug line carries the real column name and owning table/h2 name', async ({ page }) => {
        const lines = await openDateDropAndCollectDebugLines(page, {
            sa_enable_debug_logging: true,
            sa_enable_uniq_drop_context_debug: true,
        });
        expect(lines.length).toBeGreaterThan(0);
        expect(lines.every((l) => l.includes('col="Date"') && l.includes('table="Events"'))).toBe(true);
    });

    test('setting alone, without the debug-logging master switch, produces no debug output at all', async ({ page }) => {
        const lines = await openDateDropAndCollectDebugLines(page, {
            sa_enable_debug_logging: false,
            sa_enable_uniq_drop_context_debug: true,
        });
        expect(lines.length).toBe(0);
    });
});
