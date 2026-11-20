'use strict';

// The global filter's query mode on a touch device (chromium-mobile: Pixel 7,
// hasTouch, no hover). What a phone could lose: the Q box must take a tap,
// the card must open from the tap that focuses the field (there is no hover
// to open it), its Syntax button must take a tap without taking the focus
// away, and a word typed in query mode must keep what the plain filter keeps.
// Desktop and the grammar: gf-query-mode.spec.js.
//
// The user-ratings fixture (tests/support/filterAutofocus.js), a multi-table
// page whose global filter a tap reaches at this width.

const { test, expect } = require('../support/test');
const { openRatings, activate } = require('../support/filterAutofocus');
const { waitForFilterSettled } = require('../support/filterSortAssertions');

/**
 * The rendered rows' source indexes.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string[]>}
 */
const shownRows = (page) => page.evaluate(() => Array.from(document.querySelectorAll('table.tbl tbody tr'))
    .filter((tr) => tr.style.display !== 'none' && !tr.closest('table').classList.contains('mb-empty-subtable-hidden'))
    .map((tr) => tr.dataset.mbRowIdx || tr.textContent.slice(0, 40)));

/**
 * Taps the global filter and types `text` at its end.
 * @param {import('@playwright/test').Page} page
 * @param {string} text
 * @returns {Promise<void>}
 */
async function tapAndType(page, text) {
    const input = page.locator('#mb-global-filter-input');
    await activate(input, true);
    await expect.poll(() => input.inputValue()).toMatch(/\u{1F50D}/u);
    await page.keyboard.press('End');
    await page.keyboard.type(text);
}

test('query mode on mobile: Q takes a tap, the card opens from the field, a word keeps what plain text keeps', async ({ page }) => {
    test.setTimeout(120000);
    await openRatings(page);
    const word = await page.evaluate(() => {
        const cells = Array.from(document.querySelector('table.tbl tbody tr').cells).map((c) => c.textContent.trim());
        return cells.sort((a, b) => b.length - a.length)[0].slice(0, 3).toLowerCase();
    });
    await waitForFilterSettled(page, () => tapAndType(page, word));
    const plain = await shownRows(page);
    expect(plain.length, 'premise: the word keeps some rows').toBeGreaterThan(0);

    await waitForFilterSettled(page, () => page.locator('#mb-global-filter-query-label').tap());
    await expect(page.locator('#mb-global-filter-query-checkbox')).toBeChecked();
    expect(await shownRows(page), 'a word in query mode keeps what the plain filter keeps').toEqual(plain);

    await activate(page.locator('#mb-global-filter-input'), true);
    const card = page.locator('#mb-gfq-card');
    await expect(card, 'the tap that focuses the field opens the card').toBeVisible();
    await expect(card.locator('.mb-gfq-what')).toContainText(`any column contains ${word}`);
    // A card rebuilt between the touch and its click loses that click (seen:
    // touchend, then no mousedown or click at all), so _gfqCardSync() leaves
    // unchanged markup alone.
    await card.locator('.mb-gfq-syn-btn').tap();
    await expect(card.locator('dl.mb-gfq-syn')).toBeVisible();
    await expect(page.locator('#mb-global-filter-input'), 'the tap on Syntax leaves the focus in the field').toBeFocused();
});
