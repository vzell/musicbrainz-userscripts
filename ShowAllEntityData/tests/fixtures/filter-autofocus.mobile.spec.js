'use strict';

// No programmatic focus into a filter on a touch device (org/mobile.org,
// follow-up 2). Runs in chromium-mobile (Pixel 7).
//
// On a phone, focusing an input raises the on-screen keyboard. The script
// used to focus the global filter after every render, so the keyboard popped
// up over the freshly rendered page. It also re-focused a column or sub-table
// filter after its ✕ and on the sub-table 🔍 reveal. The keyboard should appear
// only when the user taps an input themselves (_autoFocusInput()).
//
// Pinned per call site: after the action, focus is NOT in that input. The
// same four scenarios run on a desktop in filter-autofocus.spec.js, which
// asserts focus IS there, so a scenario that never reached its focus call
// cannot pass here unnoticed. Plus the other half of the promise: the user's
// own tap still focuses the global filter, and leaves it editable (not
// readonly), so the keyboard does open then.

const { test, expect } = require('../support/test');
const {
    FOCUS_SETTLE_MS, openSeries, openRatings, focused, activate, typeInto, fillAndClearColumnFilter,
    openUvd, fillAndClearUvdQuickFilter,
} = require('../support/filterAutofocus');

const TOUCH = true;

test.describe('filters on a touch device: no focus the user did not ask for', () => {
    test('after the render, the global filter is not focused; tapping it focuses it, editable', async ({ page }) => {
        await openRatings(page);
        await page.waitForTimeout(FOCUS_SETTLE_MS);
        expect((await focused(page)).id, 'nothing auto-focused after the render').not.toBe('mb-global-filter-input');

        const gf = page.locator('#mb-global-filter-input');
        await activate(gf, TOUCH);
        const f = await focused(page);
        expect(f.id, 'the user\'s own tap focuses the global filter').toBe('mb-global-filter-input');
        expect(f.readOnly, 'and leaves it editable, so the keyboard opens').toBe(false);
    });

    test('a column filter\'s ✕ clears it without focusing it again', async ({ page }) => {
        await openSeries(page);
        const { before, after } = await fillAndClearColumnFilter(page, 'a');
        expect(before, 'premise: the filter held text').toBe('a');
        expect(after, 'premise: ✕ cleared it').toBe('');
        expect((await focused(page)).cls).not.toContain('mb-col-filter-input');
    });

    test('revealing a sub-table filter with 🔍 does not focus it', async ({ page }) => {
        await openRatings(page);
        await activate(page.locator('.mb-subtable-filter-toggle-icon').first(), TOUCH);
        const stf = page.locator('.mb-subtable-filter-wrapper input').first();
        await expect(stf, 'premise: the filter was revealed').toBeVisible();
        await page.waitForTimeout(FOCUS_SETTLE_MS);
        expect((await focused(page)).id).not.toBe(await stf.getAttribute('id'));
    });

    test('a sub-table filter\'s ✕ clears it without focusing it again', async ({ page }) => {
        await openRatings(page);
        await activate(page.locator('.mb-subtable-filter-toggle-icon').first(), TOUCH);
        const stf = page.locator('.mb-subtable-filter-wrapper input').first();
        await expect(stf).toBeVisible();
        await typeInto(page, stf, TOUCH, 'a');
        expect(await stf.inputValue(), 'premise: the filter holds text').toBe('a');

        const stfId = await stf.getAttribute('id');
        await activate(page.locator(`#${stfId.replace(/-input$/, '-clear')}`), TOUCH);
        await page.waitForTimeout(FOCUS_SETTLE_MS);
        expect(await stf.inputValue(), 'premise: ✕ cleared it').toBe('');
        expect((await focused(page)).id).not.toBe(stfId);
    });

    test('opening a column\'s 📊 dropdown does not focus its quick filter', async ({ page }) => {
        await openSeries(page);
        await openUvd(page);
        expect((await focused(page)).cls).not.toContain('mb-uniq-qf-input');
    });

    test('the 📊 quick filter\'s × clears it without focusing it', async ({ page }) => {
        await openSeries(page);
        await openUvd(page);
        const { before, after } = await fillAndClearUvdQuickFilter(page, 'a');
        expect(before, 'premise: the quick filter held text').toBe('a');
        expect(after, 'premise: × cleared it').toBe('');
        expect((await focused(page)).cls).not.toContain('mb-uniq-qf-input');
    });
});
