'use strict';

const { test, expect } = require('../support/test');
const { setupRecordingOf, headerNames } = require('../support/recordingOf');
const { waitForSortSettled, columnFilterInput } = require('../support/filterSortAssertions');

// The "table work" provider of the progress card (_tw*): long sorts and
// filters. Properties:
//   - after a real sort and a real filter, hovering the status line shows the
//     breakdown (sort time and rows, then filtering, then drawing; the last
//     filter with the rows it left);
//   - a sort running longer than 500 ms opens the card by itself with its
//     progress (driven through __saTest.tableWork with a fake clock: the live
//     progress callback only fires above sortLargeArray()'s 5000-row
//     threshold, and no fixture is that large); a short one never does.

const pop = (page) => page.locator('#mb-async-pop');

test.describe('progress card: sorting and filtering', () => {
    test('the status line shows the last sort and filter breakdown on hover', async ({ page }) => {
        await setupRecordingOf(page, { settings: { sa_rich_tooltip_delay_ms: 0 } });
        const nameHeader = page.locator('table.tbl thead tr:first-child th[data-col-name="Name"]');
        await waitForSortSettled(page, () => nameHeader.locator('.sort-icon-btn', { hasText: '▲' }).first().click());
        const idx = (await headerNames(page)).indexOf('Name');
        const input = columnFilterInput(page, idx);
        await input.click();
        await input.pressSequentially('Badlands');
        await expect.poll(() => page.locator('table.tbl tbody tr:visible').count(), { timeout: 15000 }).toBe(2);
        await page.mouse.move(0, 0);
        await page.locator('#mb-filter-status-display').hover();
        await expect(pop(page)).toBeVisible();
        await expect(pop(page).locator('.mb-tt-title')).toContainText('Sorting and filtering');
        const facts = pop(page).locator('.mb-tt-ajfacts');
        await expect(facts).toContainText('Last sort');
        await expect(facts).toContainText('for 16 rows');
        await expect(facts).toContainText('Then drawing');
        await expect(facts).toContainText('2 rows shown');
    });

    test('a sort over 500 ms opens the card with its progress; a short one does not', async ({ page }) => {
        await page.clock.install();
        await setupRecordingOf(page, { settings: { sa_async_pop_auto_open: true } });
        // Short: progress arrives before 500 ms.
        await page.evaluate(() => { window.__saTest.tableWork.sortBegin(80000); window.__saTest.tableWork.sortProgress(40); });
        await expect(pop(page)).toHaveCount(0);
        await page.evaluate(() => window.__saTest.tableWork.sortEnd());
        // Long: the next sort's progress arrives after 500 ms.
        await page.evaluate(() => window.__saTest.tableWork.sortBegin(80000));
        await page.clock.fastForward(700);
        await page.evaluate(() => window.__saTest.tableWork.sortProgress(25));
        await expect(pop(page)).toBeVisible();
        await expect(pop(page).locator('.mb-tt-dim').first()).toContainText('Sorting 80,000 rows');
        await expect(pop(page).locator('.mb-tt-ajcount')).toContainText('25 / 100 % sorted');
        await page.evaluate(() => window.__saTest.tableWork.sortProgress(75));
        await expect(pop(page).locator('.mb-tt-ajcount')).toContainText('75 / 100');
    });
});
