'use strict';

// The post-render auto-focus of the global filter must not take focus from a
// field someone is already typing in.
//
// 150 ms after the final render, startFetchingProcess() focuses
// #mb-global-filter-input so typing can start at once. It used to do that
// unconditionally. Anyone who had meanwhile clicked into another field (the
// 📊 quick filter, a column filter, MusicBrainz's own search box) had the
// rest of their typing land in the global filter. That window is short on a
// fast page and long on a slow one, where the timer fires late. It is also how
// uvd-grouped-sections.spec.js:257 failed under load: its qf.fill('month')
// ended up as "🔍 month" in the global filter (DEBUG-NOTES.md, 2026-10-04).
//
// Taking focus from the action button that was just pressed is still wanted;
// filter-autofocus.spec.js pins that half.
//
// Timing is ordered, not slept: the script schedules its 150 ms timer before
// render completes, so a 300 ms timer started afterwards always fires after it.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const ANNOTATIONS_URL = 'https://musicbrainz.org/label/011d1192-6f65-45bd-85c4-0400dd45693e/annotations';
const FIXTURE_FILE = path.join(__dirname, 'uniq-drop-editor-activity-sections.html');
const LOAD_BUTTON = 'button[data-label="Show Annotation History for Label"]';
const COL = 'Active start date';

/**
 * Resolves once a timer started now, longer than the script's own 150 ms
 * auto-focus timer, has fired, so that timer has run too.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
const afterAutoFocusTimer = (page) => page.evaluate(() => new Promise((r) => setTimeout(r, 300)));

/**
 * Where focus is, and what the global filter holds.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{active: ?string, globalFilter: ?string}>}
 */
const focusState = (page) => page.evaluate(() => {
    const ae = document.activeElement;
    const gfi = document.getElementById('mb-global-filter-input');
    return {
        active: ae ? (ae.id || ae.className || ae.tagName) : null,
        globalFilter: gfi ? gfi.value : null,
    };
});

test.describe('post-render auto-focus leaves a field being typed in alone', () => {
    test('a field focused while the table renders keeps focus and text', async ({ page }) => {
        await loadUserscriptPage(page, { url: ANNOTATIONS_URL, fixtureFile: FIXTURE_FILE, testMode: true });
        await page.evaluate(() => {
            const inp = document.createElement('input');
            inp.id = 'zz-user-field';
            document.body.prepend(inp);
        });
        await page.click(LOAD_BUTTON);
        // The user clicks elsewhere and types while the page is still busy.
        await page.locator('#zz-user-field').fill('abc');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await afterAutoFocusTimer(page);

        const s = await focusState(page);
        expect(s.active, 'focus stays in the field the user was typing in').toBe('zz-user-field');
        await expect(page.locator('#zz-user-field')).toHaveValue('abc');
    });

    test('typing into a 📊 quick filter right after render stays there', async ({ page }) => {
        await loadUserscriptPage(page, { url: ANNOTATIONS_URL, fixtureFile: FIXTURE_FILE, testMode: true });
        await page.click(LOAD_BUTTON);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await page.evaluate((c) => window.__saTest.getUniqDropSections(c), COL);
        await page.locator('#mb-col-uniq-dropdown .mb-uniq-qf-input').fill('month');
        await afterAutoFocusTimer(page);

        const s = await focusState(page);
        expect(s.active, 'focus stays in the quick filter').toContain('mb-uniq-qf-input');
        expect(s.globalFilter || '', 'nothing was typed into the global filter').not.toContain('month');
        await expect(page.locator('#mb-col-uniq-dropdown .mb-uniq-qf-input')).toHaveValue('month');
    });
});
