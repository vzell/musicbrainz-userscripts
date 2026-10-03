'use strict';

// Shared scenarios for filter-autofocus.spec.js (desktop, chromium-fixtures)
// and filter-autofocus.mobile.spec.js (touch, chromium-mobile). Both specs run
// the SAME four interactions. The desktop one pins that the script still moves
// focus into the filter, the mobile one that it no longer does. Each is the
// other's control: a scenario that never reached its focus call would leave
// focus elsewhere on both devices, and the desktop spec would fail.

const path = require('path');
const { loadUserscriptPage } = require('./loadPage');
const { waitForRenderComplete } = require('./browser');

const SERIES_URL = 'https://musicbrainz.org/series/aa3694d3-a3d0-48ed-8f07-5b576de87908';
const SERIES_SHELL = path.join(__dirname, '..', 'snapshots', 'series-releases', 'raw.html');
const RATINGS_URL = 'https://musicbrainz.org/user/vzell/ratings';
const RATINGS_SHELL = path.join(__dirname, '..', 'fixtures', 'user-ratings-multigroup.html');

// The post-render auto-focus runs 150 ms after the render, a sub-table
// filter's reveal 50 ms after the click. Generous, so a negative assertion
// cannot pass merely because the focus has not happened yet.
const FOCUS_SETTLE_MS = 800;

/**
 * Renders the single-table series fixture, for the column filters (the
 * ratings fixture shows none). Not used for the global filter: at phone
 * width this shell's unstyled MB header (the fixture carries no MB
 * stylesheet) lies over the global filter and swallows the tap.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function openSeries(page) {
    await loadUserscriptPage(page, { url: SERIES_URL, fixtureFile: SERIES_SHELL, testMode: true });
    await page.locator('button[data-label="Show all Releases for Series"]').evaluate((b) => b.click());
    await waitForRenderComplete(page);
}

/**
 * Renders the multi-table user-ratings fixture, for the global filter and
 * the sub-table filters.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function openRatings(page) {
    await loadUserscriptPage(page, { url: RATINGS_URL, fixtureFile: RATINGS_SHELL, testMode: true });
    await page.locator('button[data-label="Show Ratings for User"]').evaluate((b) => b.click());
    await waitForRenderComplete(page);
}

/**
 * Describes the focused element: its id, tag, class and whether it is
 * readonly. On a phone, a readonly field takes focus without raising the
 * keyboard.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{id: string, tag: string, cls: string, readOnly: boolean}>}
 */
const focused = (page) => page.evaluate(() => {
    const a = document.activeElement;
    return { id: a ? a.id : '', tag: a ? a.tagName : '', cls: a ? String(a.className) : '', readOnly: !!(a && a.readOnly) };
});

/**
 * Activates `locator` the way the device's user would: a tap on touch, a
 * click with a mouse. Aimed near the LEFT edge: a filter's ✕ sits inside the
 * input's right end and, in a narrow column, covers its middle.
 *
 * @param {import('@playwright/test').Locator} locator
 * @param {boolean} touch - `true` in the chromium-mobile project
 * @returns {Promise<void>}
 */
async function activate(locator, touch) {
    const box = await locator.boundingBox();
    const position = { x: Math.min(8, box.width / 2), y: box.height / 2 };
    return touch ? locator.tap({ position }) : locator.click({ position });
}

/**
 * Types `text` into a filter input that the user focused themselves, then
 * waits for the debounced filter to settle.
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} input
 * @param {boolean} touch
 * @param {string} text
 * @returns {Promise<void>}
 */
async function typeInto(page, input, touch, text) {
    await activate(input, touch);
    await page.keyboard.type(text);
    await page.waitForTimeout(600);
}

/**
 * Puts `text` into the first rendered column filter and presses its ✕, both
 * from script, then waits for any focus to land. Returns the filter's value
 * after the ✕.
 *
 * From script, not by pointer, on purpose. The series shell carries no MB
 * stylesheet, so at phone width its header covers the filter row, and in the
 * narrow "#" column the Aa mode button covers the input. Real taps there test
 * the fixture's geometry, not the script. The ✕ handler decides whether to
 * focus from the DEVICE (_autoFocusInput()), not from how the click arrived,
 * so a scripted click runs exactly the decision under test. The value goes in
 * as an internal input event (`mbInternal`), the same path the script's own
 * history/dropdown writes take.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} text
 * @returns {Promise<{before: string, after: string}>}
 */
async function fillAndClearColumnFilter(page, text) {
    const before = await page.evaluate((t) => {
        const input = Array.from(document.querySelectorAll('.mb-col-filter-input'))
            .find((el) => el.getClientRects().length > 0);
        input.id = input.id || 'mb-test-col-filter';
        input.value = t;
        const evt = new Event('input', { bubbles: true });
        evt.mbInternal = true;
        input.dispatchEvent(evt);
        input.blur();
        return input.value;
    }, text);
    await page.waitForTimeout(600);
    await page.evaluate(() => {
        const input = document.getElementById('mb-test-col-filter') ||
            Array.from(document.querySelectorAll('.mb-col-filter-input')).find((el) => el.getClientRects().length > 0);
        input.parentElement.querySelector('.mb-col-filter-clear').click();
    });
    await page.waitForTimeout(FOCUS_SETTLE_MS);
    const after = await page.evaluate(() => {
        const input = Array.from(document.querySelectorAll('.mb-col-filter-input'))
            .find((el) => el.getClientRects().length > 0);
        return input.value;
    });
    return { before, after };
}

module.exports = {
    FOCUS_SETTLE_MS, openSeries, openRatings, focused, activate, typeInto, fillAndClearColumnFilter,
};
