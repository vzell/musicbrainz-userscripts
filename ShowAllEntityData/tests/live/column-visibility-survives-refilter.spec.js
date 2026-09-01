'use strict';

const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { seedGmValues } = require('../support/gmStubs');
const { collectPageErrors } = require('../support/liveAssertions');

// Same release-tracks pilot page used elsewhere in this repo.
const RELEASE_URL = 'https://musicbrainz.org/release/1d404e1d-fcb6-3a52-b478-e706e893c897';
const SHOW_ALL_BUTTON = 'button[data-label="Show all Tracks for Release"]';

// Reported live bug: hiding a column via the 👁️ "Visible" Column Visibility
// button (toggleColumn()) sets display:none directly on the <td>/<th>
// elements currently in the DOM — but runFilter()'s single-table path
// (renderFinalTable) and multi-table path (renderGroupedTable) both replace
// <tbody> content wholesale with FRESH rows on every filter/sort re-render,
// cloned from a captured source-row set that never saw that mutation. The
// hidden column's cell data silently reappears, fully populated, the moment
// the user types into any filter or sorts any column — even though the
// column's own header stays correctly hidden (headers are never rebuilt).
test('a column hidden via Column Visibility stays hidden after filtering a different column', { tag: '@core' }, async ({ page }) => {
    const pageErrors = collectPageErrors(page);

    await seedGmValues(page, { sa_enable_release_tracks: true });
    await loadUserscriptPage(page, { url: RELEASE_URL, testMode: true });

    const showAllBtn = page.locator(SHOW_ALL_BUTTON);
    await expect(showAllBtn).toBeVisible();
    await showAllBtn.click();
    await expect(page.locator('#mb-filter-container')).toBeVisible({ timeout: 90000 });

    const headerIndex = await page.evaluate(() => {
        const strip = (t) => t.replace(/[⇅▲▼📊▶◀▤0-9⁰¹²³⁴⁵⁶⁷⁸⁹​]/g, '').trim();
        const ths = Array.from(document.querySelectorAll('table.tbl thead tr:first-child th'));
        const map = {};
        ths.forEach((th, i) => { map[strip(th.textContent)] = i; });
        return map;
    });

    const arsIdx = headerIndex['ARs'];
    const titleIdx = headerIndex['Title'];
    expect(arsIdx).toBeGreaterThanOrEqual(0);
    expect(titleIdx).toBeGreaterThanOrEqual(0);

    // Hide the "ARs" column via the real Column Visibility checkbox, same
    // mechanism a user clicking the 👁️ Visible button's checkbox exercises.
    await page.locator('#mb-visible-btn').click();
    await page.evaluate((idx) => {
        const cb = document.querySelector(`#mb-col-vis-${idx}`);
        cb.checked = false;
        cb.dispatchEvent(new Event('change'));
    }, arsIdx);
    await page.mouse.click(10, 10); // close the dropdown

    const readArsDisplay = () => page.evaluate((idx) => {
        return Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .map((r) => (r.cells[idx] ? r.cells[idx].style.display : null));
    }, arsIdx);

    const beforeFilter = await readArsDisplay();
    expect(beforeFilter.length).toBeGreaterThan(0);
    expect(beforeFilter.every((d) => d === 'none')).toBe(true);

    // Filter a DIFFERENT column (Title) — this is what triggers the
    // tbody rebuild that used to lose the ARs column's hidden state.
    const input = page.locator(`.mb-col-filter-input[data-col-idx="${titleIdx}"]`).first();
    await input.click();
    await input.type('to', { delay: 20 });
    await page.waitForTimeout(1000);

    const afterFilter = await readArsDisplay();
    expect(afterFilter.length).toBeGreaterThan(0);
    expect(afterFilter.every((d) => d === 'none')).toBe(true);

    // Clearing the filter (another full re-render) must not reveal it either.
    await input.fill('');
    await page.waitForTimeout(1000);
    const afterClear = await readArsDisplay();
    expect(afterClear.length).toBeGreaterThan(0);
    expect(afterClear.every((d) => d === 'none')).toBe(true);

    // The header itself must also still be hidden throughout.
    const headerStillHidden = await page.evaluate((idx) => {
        const th = document.querySelector('table.tbl thead tr:first-child th:nth-child(' + (idx + 1) + ')');
        return th.style.display === 'none';
    }, arsIdx);
    expect(headerStillHidden).toBe(true);

    expect(pageErrors).toEqual([]);
});
