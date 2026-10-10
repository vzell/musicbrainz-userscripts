'use strict';

const { test, expect } = require('../support/test');
const { DATA, setupRecordingOf } = require('../support/recordingOf');

// The 📊 sections of the "Recording of" column: "Recording of - Load state"
// (fixed flags from _recOfCellLoadState()) and "Recording of - Suggested
// work" (one entry per suggested title, mode recofsugg:). Properties:
//   - the load-state counts on a column nothing has loaded yet, and after
//     loading — and every entry carries dataset.mbUniqSynLabel (quickfilter);
//   - ticking a load-state entry narrows the table to exactly the rows the
//     count promised (one classifier for both);
//   - ticking suggested titles narrows to their rows and HIGHLIGHTS the title
//     in each — two entries, in both orders (a highlighter must survive the
//     other's wrapper, see CLAUDE.md's highlightCrossTag() pitfall).

const LOAD = 'Recording of - Load state';
const SUGG = 'Recording of - Suggested work';
const N = DATA.recordings.length;

/** Opens the column's 📊 panel and returns its sections. */
const sections = (page) => page.evaluate(() => window.__saTest.getUniqDropSections('Recording of'));
const countsOf = (secs, label) => Object.fromEntries(((secs || []).find((s) => s.label === label) || { items: [] })
    .items.map((i) => [i.label, i.count]));

/** Closes the 📊 panel through its outside-mousedown handler. */
async function closeDropdown(page) {
    await page.evaluate(() => document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })));
    await expect(page.locator('#mb-col-uniq-dropdown')).toBeHidden({ timeout: 5000 });
}

/** Clicks one entry of a section in the open panel. */
async function tick(page, sectionLabel, itemLabel) {
    await page.evaluate(({ sectionLabel, itemLabel }) => {
        const sec = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
            .find((s) => s.querySelector('.mb-uniq-section-label')?.textContent === sectionLabel);
        Array.from(sec.querySelectorAll('.mb-col-uniq-item')).find((el) => el.dataset.mbUniqSynLabel === itemLabel).click();
    }, { sectionLabel, itemLabel });
}

/** Visible rows' recording titles. */
const visibleTitles = (page) => page.evaluate(() => Array.from(document.querySelectorAll('table.tbl tbody tr'))
    .filter((r) => r.style.display !== 'none').map((r) => r.cells[0].querySelector('a').textContent.trim()));

/** Loads every row and waits for the suggestion pass. */
async function loadAll(page) {
    await page.locator('.mb-recof-col-hdr-btn').click();
    await expect(page.locator('.mb-recof-col-hdr-btn')).toHaveAttribute('aria-pressed', 'true', { timeout: 30000 });
    await expect.poll(() => page.locator('td.mb-recof-cell[data-recof="suggested"]').count(), { timeout: 10000 }).toBe(5);
}

test.describe('"Recording of" 📊 sections', () => {
    test('load-state counts before and after loading; every entry is quickfilter-visible', async ({ page }) => {
        await setupRecordingOf(page);
        expect(countsOf(await sections(page), LOAD)).toEqual({ '🎼 not loaded yet': N });
        await closeDropdown(page);
        await loadAll(page);
        const secs = await sections(page);
        expect(countsOf(secs, LOAD)).toEqual({ '✓ has a work': 10, '💡 work suggested': 5, '– no work': 1 });
        const labels = await page.evaluate((l) => Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
            .filter((s) => l.includes(s.querySelector('.mb-uniq-section-label')?.textContent))
            .flatMap((s) => Array.from(s.querySelectorAll('.mb-col-uniq-item')).map((i) => i.dataset.mbUniqSynLabel || null)), [LOAD, SUGG]);
        expect(labels.length).toBeGreaterThan(0);
        expect(labels.every(Boolean)).toBe(true);
    });

    test('ticking "work suggested" narrows to exactly those rows', async ({ page }) => {
        await setupRecordingOf(page);
        await loadAll(page);
        await sections(page);
        await tick(page, LOAD, '💡 work suggested');
        await expect.poll(async () => (await visibleTitles(page)).length, { timeout: 15000 }).toBe(5);
        expect((await visibleTitles(page)).sort()).toEqual(
            ['Badlands', 'Badlands', 'Prove It All Night (alternate take)', 'Racing in the Streets', 'The Promised Land'].sort());
    });

    for (const order of [['Badlands', 'The Promised Land'], ['The Promised Land', 'Badlands']]) {
        test(`suggested titles: tick ${order.join(' then ')} — rows narrow and every title is highlighted`, async ({ page }) => {
            await setupRecordingOf(page);
            await loadAll(page);
            const secs = await sections(page);
            expect(countsOf(secs, SUGG)).toMatchObject({
                '» suggested: Badlands': 2, '» suggested: The Promised Land': 1,
                '» suggested: Racing in the Street': 1, '» suggested: Prove It All Night': 1,
            });
            for (const t of order) await tick(page, SUGG, `» suggested: ${t}`);
            await expect.poll(async () => (await visibleTitles(page)).length, { timeout: 15000 }).toBe(3);
            const marks = await page.evaluate(() => Array.from(document.querySelectorAll('table.tbl tbody tr'))
                .filter((r) => r.style.display !== 'none')
                .map((r) => Array.from(r.querySelectorAll('td.mb-recof-cell .mb-column-filter-highlight')).map((m) => m.textContent).join('|')));
            expect(marks.sort()).toEqual(['Badlands', 'Badlands', 'The Promised Land']);
        });
    }
});
