'use strict';

// Desktop half of filter-autofocus.mobile.spec.js: with a mouse, the script
// still moves focus into the filter in all four places, exactly as before
// _autoFocusInput() existed (global filter after the render, column filter ✕,
// sub-table filter 🔍 reveal and ✕). This is also the control for the mobile
// spec's negative assertions (see tests/support/filterAutofocus.js).

const { test, expect } = require('../support/test');
const {
    FOCUS_SETTLE_MS, openSeries, openRatings, focused, activate, typeInto, fillAndClearColumnFilter,
} = require('../support/filterAutofocus');

const TOUCH = false;

test.describe('filters with a mouse: the script still focuses them', () => {
    test('after the render, the global filter is focused and editable', async ({ page }) => {
        await openRatings(page);
        await expect.poll(async () => (await focused(page)).id, { timeout: 5000 })
            .toBe('mb-global-filter-input');
        expect((await focused(page)).readOnly).toBe(false);
    });

    test('a column filter\'s ✕ clears it and focuses it again', async ({ page }) => {
        await openSeries(page);
        const { before, after } = await fillAndClearColumnFilter(page, 'a');
        expect(before, 'premise: the filter held text').toBe('a');
        expect(after, 'premise: ✕ cleared it').toBe('');
        expect((await focused(page)).cls).toContain('mb-col-filter-input');
    });

    test('revealing a sub-table filter with 🔍 focuses it', async ({ page }) => {
        await openRatings(page);
        await activate(page.locator('.mb-subtable-filter-toggle-icon').first(), TOUCH);
        const stf = page.locator('.mb-subtable-filter-wrapper input').first();
        await expect(stf).toBeVisible();
        const stfId = await stf.getAttribute('id');
        await expect.poll(async () => (await focused(page)).id).toBe(stfId);
    });

    test('a sub-table filter\'s ✕ clears it and focuses it again', async ({ page }) => {
        await openRatings(page);
        await activate(page.locator('.mb-subtable-filter-toggle-icon').first(), TOUCH);
        const stf = page.locator('.mb-subtable-filter-wrapper input').first();
        await expect(stf).toBeVisible();
        await typeInto(page, stf, TOUCH, 'a');
        expect(await stf.inputValue()).toBe('a');

        const stfId = await stf.getAttribute('id');
        await activate(page.locator(`#${stfId.replace(/-input$/, '-clear')}`), TOUCH);
        await page.waitForTimeout(FOCUS_SETTLE_MS);
        expect(await stf.inputValue()).toBe('');
        expect((await focused(page)).id).toBe(stfId);
    });
});
