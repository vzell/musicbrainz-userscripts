'use strict';

// The global filter's Rx card on a touch device (chromium-mobile: Pixel 7,
// hasTouch, no hover): the card must open from the tap that focuses the field,
// and its Examples button, an example and Back must each take a tap (a card
// rebuilt between a touch and its click loses the click; see
// gf-query-mode.mobile.spec.js). Desktop: gf-rx-card.spec.js.
//
// The user-ratings fixture (tests/support/filterAutofocus.js).

const { test, expect } = require('../support/test');
const { openRatings, activate } = require('../support/filterAutofocus');

test('Rx card on mobile: Examples, an example and Back each take a tap', async ({ page }) => {
    test.setTimeout(120000);
    await openRatings(page);
    await page.locator('#mb-global-filter-rx-label').tap();
    await expect(page.locator('#mb-global-filter-rx-checkbox')).toBeChecked();
    const input = page.locator('#mb-global-filter-input');
    await activate(input, true);
    await expect.poll(() => input.inputValue()).toMatch(/\u{1F50D}/u);
    await page.keyboard.press('End');
    await page.keyboard.type('(a');

    const card = page.locator('#mb-gfq-card');
    await expect(card, 'the tap that focuses the field opens the card').toBeVisible();
    await expect(card.locator('.mb-gfq-why')).toHaveText('This ( has no closing ).');
    await card.locator('[data-gfq-examples]').tap();
    await expect(card.locator('.mb-gfq-ex button')).toHaveCount(9);
    await card.locator('.mb-gfq-ex button', { hasText: /^\^\$$/ }).tap();
    await expect.poll(() => input.inputValue()).toMatch(/\^\$$/);
    await expect(card.locator('.mb-tt-ajpill-ok')).toHaveText('Valid');
    await card.locator('[data-gfq-back]').tap();
    await expect.poll(() => input.inputValue(), { message: 'Back puts the typed text back' }).toMatch(/\(a$/);
});
