'use strict';

// The jungleland.it bootleg artwork list against the REAL site — what the
// jl-list fixture spec cannot show: the whole page (about 6,300 entries when
// this was written, 2026-10-06, against 677 in the cut-down fixture), served
// as windows-1252 rather than the fixture's UTF-8, and rendered under the
// site's own markup with nothing stripped.
//
// Self-consistency, not fixed counts: the list keeps growing, so the test
// counts the page's own entry links before pressing the button and expects
// that many rows after. The whole page is above sa_render_threshold's default,
// so both render thresholds are seeded.

const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { collectPageErrors } = require('../support/liveAssertions');
const { waitForRenderComplete } = require('../support/browser');

const URL = 'https://www.jungleland.it/html/list.htm';
const BUTTON = 'Show all bootlegs of this list';

test('jungleland.it list: every entry becomes one row, decoded from windows-1252', { tag: '@extended' }, async ({ page }) => {
    test.setTimeout(300000);
    const pageErrors = collectPageErrors(page);
    await loadUserscriptPage(page, {
        url: URL,
        settingsOverride: {
            sa_enable_jungleland: true,
            sa_render_threshold: 1000000,
            sa_render_warning_threshold: 1000000,
        },
    });

    const announced = await page.locator('a[target="inferioredx1"]').count();
    expect(announced, 'the page lists its entries the way the converter reads them').toBeGreaterThan(5000);
    // A non-ASCII title, as the browser decoded the windows-1252 page.
    const hasKoeln = await page.evaluate(() => Array.from(document.querySelectorAll('a[target="inferioredx1"]'))
        .some((a) => a.textContent.includes('Köln')));
    expect(hasKoeln, 'a title with "ö" decodes').toBe(true);

    await page.click(`button[data-label="${BUTTON}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false, timeout: 240000 });

    const headers = await page.evaluate(() => Array.from(document.querySelectorAll('table.tbl thead tr:first-child th'))
        .map((th) => th.dataset.colName || th.textContent.trim()));
    expect(headers).toEqual(['Title', 'Date', 'Year', 'Version', 'DD', 'MM', 'YYYY', 'Day', 'Month']);
    expect(await page.locator('table.tbl tbody tr').count()).toBe(announced);
    // Across the whole real list: every row has a Version, every dated row
    // is split and agrees with its Date, and no undated row is split.
    const bad = await page.evaluate(() => {
        const out = { version: [], split: [] };
        const pad = (s) => s.padStart(2, '0');
        document.querySelectorAll('table.tbl tbody tr').forEach((tr) => {
            const c = Array.from(tr.cells).map((td) => td.textContent.trim());
            const [title, date, , version, dd, mm, yyyy, day, month] = c;
            if (!/^\d+$/.test(version)) out.version.push(title);
            const split = date ? `${yyyy}-${pad(mm)}-${pad(dd)}` === date && !!day && !!month
                : !(dd || mm || yyyy || day || month);
            if (!split) out.split.push(`${title} | ${date}`);
        });
        return { version: out.version.slice(0, 10), split: out.split.slice(0, 10) };
    });
    expect(bad).toEqual({ version: [], split: [] });
    expect(await page.locator('a[target="inferioredx1"]').count()).toBe(0);
    const koeln = await page.evaluate(() => {
        const tr = Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .find((r) => r.cells[0].textContent.includes('Köln'));
        return tr ? Array.from(tr.cells).map((c) => c.textContent.trim()) : null;
    });
    expect(koeln, 'the Köln row survives with its date').not.toBeNull();
    expect(koeln[1]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(pageErrors).toEqual([]);
});
