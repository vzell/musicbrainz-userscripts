'use strict';

// The global filter's ✕ (#mb-global-filter-clear) shows whenever the field
// holds ANY text after the decorative focus prefix — blanks included. A
// filter of blanks alone filters nothing (the query is trimmed), but it is
// still text in the field, and ✕ is how it goes; every other ✕ (column,
// sub-table and quick filters) already tested the raw value. _syncGfClearBtn
// used to trim, so typing only spaces left the ✕ hidden.
//
// Network-free: the release group's own saved page, re-served for the fetch.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// "Tougher Than the Rest" — 7 releases in 2 sub-tables, tableMode 'multi'.
const RELEASE_GROUP = {
    url: 'https://musicbrainz.org/release-group/f83d2211-dd81-4b1e-9a02-e89733891e1c',
    shell: path.join(__dirname, '..', 'snapshots', 'releasegroup-releases', 'raw.html'),
    routeGlob: 'https://musicbrainz.org/release-group/**',
    button: 'button[data-label="Show all Releases for ReleaseGroup"]',
};

/**
 * Loads the release group and renders it, so the global filter exists.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function openRendered(page) {
    await loadUserscriptPage(page, { url: RELEASE_GROUP.url, fixtureFile: RELEASE_GROUP.shell, testMode: true });
    await page.route(RELEASE_GROUP.routeGlob,
        (route) => route.fulfill({ path: RELEASE_GROUP.shell, contentType: 'text/html' }));
    await page.click(RELEASE_GROUP.button);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/**
 * Types into the global filter after whatever it holds (the focus prefix).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} text
 * @returns {Promise<void>}
 */
async function typeInGlobalFilter(page, text) {
    const input = page.locator('#mb-global-filter-input');
    await input.click();
    await page.keyboard.press('End');
    await page.keyboard.type(text);
}

test.describe('global filter ✕', () => {
    test('blanks alone show the ✕, and the ✕ clears them back to the prefix', async ({ page }) => {
        await openRendered(page);
        const input = page.locator('#mb-global-filter-input');
        const clear = page.locator('#mb-global-filter-clear');
        const prefix = await input.inputValue();
        await expect(clear).toBeHidden();

        await typeInGlobalFilter(page, '   ');
        await expect(input).toHaveValue(prefix + '   ');
        await expect(clear).toBeVisible();

        await clear.click();
        await expect(clear).toBeHidden();
        await expect(input).toHaveValue(prefix);
    });

    test('control: a real query shows the ✕ too, and deleting it hides the ✕', async ({ page }) => {
        await openRendered(page);
        const clear = page.locator('#mb-global-filter-clear');
        await typeInGlobalFilter(page, 'x');
        await expect(clear).toBeVisible();
        await page.keyboard.press('Backspace');
        await expect(clear).toBeHidden();
    });
});
