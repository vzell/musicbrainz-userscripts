'use strict';

// Help opens on GitHub, and only there (2026-10-22).
//
// Until then a Shift-click on ❓ rendered ShowAllEntityData_HELP.md inside
// the page and prefix-mode H opened that dialog; the dialog moved into
// VZ_MBLibrary as Lib.showMarkdownHelp() (lib-markdown-help.spec.js) and this
// script no longer opens it. What is pinned here, each silent if lost:
//
//   • the SAED menu's "❓ Help ↗" row opens the GitHub page in a new tab,
//     with noopener — a plain click AND a Shift-click (the old modifier
//     branch must not come back as a dead route);
//   • prefix-mode H opens the same page (a key press is a user gesture);
//   • nothing renders help in the page, and nothing fetches the raw file.
//
// Help's place in the menu and the Changelog rows: saed-toolbar.spec.js.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { openToolbarMenu } = require('../support/toolbarMenu');

const ARTIST_RECORDINGS_URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/recordings';
const FIXTURE_FILE = path.join(__dirname, 'uniq-drop-viewport-clip.html');
const GITHUB_URL = 'https://github.com/vzell/mb-userscripts/blob/master/ShowAllEntityData_HELP.md';

/**
 * Loads the fixture with `window.open` recorded rather than performed.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function load(page) {
    await page.context().addInitScript({ content: `
        window.__openCalls = [];
        window.open = function (url, target, features) {
            window.__openCalls.push({ url: url, target: target, features: features });
            return null;
        };
    ` });
    await loadUserscriptPage(page, { url: ARTIST_RECORDINGS_URL, fixtureFile: FIXTURE_FILE, testMode: true });
    await expect(page.locator('#mb-saed-bar')).toBeAttached();
}

/**
 * The tabs opened so far, emptied.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<{url: string, target: string, features: string}>>}
 */
const takeOpens = (page) => page.evaluate(() => window.__openCalls.splice(0));

test.describe('❓ Help opens GitHub, only', () => {
    for (const modifiers of [[], ['Shift']]) {
        test(`the Help row, ${modifiers.length ? 'Shift-' : ''}clicked, opens the GitHub help page and no dialog`, async ({ page }) => {
            await load(page);
            await openToolbarMenu(page, 'help');
            await page.locator('#mb-app-help-btn').click({ modifiers });

            const calls = await takeOpens(page);
            expect(calls, 'exactly one window.open').toHaveLength(1);
            expect(calls[0].url).toBe(GITHUB_URL);
            expect(calls[0].target).toBe('_blank');
            // noopener so the opened page gets no window.opener handle back
            // into a MusicBrainz tab this script is driving.
            expect(calls[0].features).toContain('noopener');
            await expect(page.locator('#mb-app-help-dialog, .vz-md-dialog')).toHaveCount(0);
        });
    }

    test('prefix-mode H opens the GitHub help page', async ({ page }) => {
        await load(page);
        await page.locator('h2').first().click();
        await page.keyboard.press('Control+m');
        await page.keyboard.press('h');
        await expect.poll(() => page.evaluate(() => window.__openCalls.length)).toBe(1);
        const calls = await takeOpens(page);
        expect(calls[0].url).toBe(GITHUB_URL);
        await expect(page.locator('#mb-app-help-dialog, .vz-md-dialog')).toHaveCount(0);
    });

    test('nothing fetches the raw help file', async ({ page }) => {
        await load(page);
        await openToolbarMenu(page, 'help');
        await page.locator('#mb-app-help-btn').click();
        const fetched = await page.evaluate(() =>
            (window.__gmXhrLog || []).filter((r) => /_HELP\.(md|txt)$/.test(r.url)).length);
        expect(fetched).toBe(0);
    });
});
