'use strict';

// Brucebase year pages: the 📊 dropdown of the Media column shows each
// value's Brucebase icon after its label (vzell, 2026-10-26: "The UVD in the
// Media column on PTs e.g. https://brucebase.wikidot.com/2026 should get the
// media icons also"). The cell is `ul.mb-bb-media`, one <li> per icon with
// the site's `00<kind>-32.png` and a hidden label (`_bbYearBuildRow()`); the
// entries come from `bbMediaIconMap`, filled by `_bbMediaSoleIconSrc()`.
//
// Pinned:
//   - every per-<li> entry ("Photo", "Setlist", …) carries exactly the icon
//     the table's own cells show for that label — the oracle is read from the
//     rendered table, not written down;
//   - a whole-cell entry of a cell with several icons carries none (there is
//     no one icon for it, the same rule as the instrument icons);
//   - the slot is AFTER the label text, never the leading marker slot;
//   - a re-open from the dropdown cache still draws them.

const { test, expect } = require('../support/test');
const { BB_YEAR_BUTTON, loadBbYearPage } = require('../support/bbFixture');
const { waitForRenderComplete } = require('../support/browser');

/**
 * Loads the 2026 fixture, presses the button and waits for the render.
 * @param {import('@playwright/test').Page} page
 */
async function render(page) {
    await loadBbYearPage(page, '2026');
    await page.click(`button[data-label="${BB_YEAR_BUTTON}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/**
 * The table's own label → icon file name, read from every Media cell.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object<string, string>>}
 */
const cellIcons = (page) => page.evaluate(() => {
    const out = {};
    document.querySelectorAll('table.tbl ul.mb-bb-media > li').forEach((li) => {
        const label = li.querySelector('.mb-bb-media-label')?.textContent.trim();
        const src = li.querySelector('img[src]')?.getAttribute('src') || '';
        if (label && !out[label]) out[label] = src.split('/').pop();
    });
    return out;
});

/**
 * Opens the Media 📊 panel and returns its value entries.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<{ label: string, icon: string, iconLast: boolean }>>}
 */
const mediaEntries = (page) => page.evaluate(() => {
    window.__saTest.getUniqDropSections('Media', 0);
    return Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-col-uniq-item'))
        .filter((it) => !it.dataset.mbUniqSynLabel)
        .map((it) => {
            const slot = it.querySelector('span.mb-uniq-bb-media-icon');
            const clone = it.cloneNode(true);
            clone.querySelectorAll('.mb-col-uniq-checkbox, .mb-uniq-count-badge, .mb-uniq-bb-media-icon').forEach((n) => n.remove());
            return {
                label: clone.textContent.replace(/[▤]/g, '').trim(),
                icon: slot ? slot.querySelector('img').getAttribute('src').split('/').pop() : '',
                iconLast: slot ? it.lastElementChild === slot : false,
            };
        });
});

test.describe('bb-year: Media icons in the 📊 dropdown', () => {
    test('each single-icon entry shows the icon its cells show, after the label', async ({ page }) => {
        await render(page);
        const oracle = await cellIcons(page);
        expect(Object.keys(oracle).length, 'premise: the fixture has several kinds of icon').toBeGreaterThan(5);
        const entries = await mediaEntries(page);
        const single = entries.filter((e) => oracle[e.label]);
        expect(single.length, 'premise: the per-icon entries are listed').toBeGreaterThan(5);
        for (const e of single) {
            expect(e.icon, `${e.label}: its icon`).toBe(oracle[e.label]);
            expect(e.iconLast, `${e.label}: the icon is the entry's last element`).toBe(true);
        }
    });

    test('a whole-cell entry of several icons has none', async ({ page }) => {
        await render(page);
        const oracle = await cellIcons(page);
        const entries = await mediaEntries(page);
        const multi = entries.filter((e) => !oracle[e.label]);
        expect(multi.length, 'premise: cells with several icons exist').toBeGreaterThan(0);
        expect(multi.filter((e) => e.icon)).toEqual([]);
    });

    test('a re-open from the dropdown cache draws the icons again', async ({ page }) => {
        await render(page);
        const first = await mediaEntries(page);
        // A second click on the same 📊 closes the panel; the next open reads the cache.
        await page.evaluate(() => document.querySelector('table.tbl th[data-col-name="Media"] .mb-col-uniq-wrap').click());
        const again = await mediaEntries(page);
        expect(again).toEqual(first);
        expect(again.some((e) => e.icon)).toBe(true);
    });
});
