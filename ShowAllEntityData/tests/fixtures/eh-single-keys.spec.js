'use strict';

// Event Horizon's single-letter keys must not leave MusicBrainz's page.
//
// ── The bug (org/majkinetor.org, "EH's bare-letter keys leave our FRP";
//    measured 2026-11-06 and 2026-11-08 with the live probe, case B) ─────────
//
// majkinetor's Event Horizon (alone or inside String Theory) binds single
// keys — h editing history, e edit, r relationships, o c t d a s p . , — on a
// `document` keydown in the bubble phase, installed even while it is OFF. On
// MusicBrainz's own page a stray `h` went to the entity's /edits page: the
// rendered table was lost, and (vzell, 2026-11-08) the initial page left just
// the same. EH skips an event whose `defaultPrevented` is set (EH:12495), so
// `_ehKeyGuardInstall()` calls `preventDefault()` on those keys in the
// capture phase, on the initial page and after a render, behind
// `sa_block_eh_single_keys` (default on).
//
// What must keep working, and is pinned below: V (EH's on/off switch), every
// key inside EH's own view, typing the same letters into a field, and other
// pages' single keys where Event Horizon is not installed.
//
// Event Horizon is simulated by tests/fixtures/thirdPartyScripts/eh-body-swap.js:
// its body swap, its marks, its launcher and a key listener with EH's own
// guards and key reading, which records the commands it would run in
// `window.__ehSim.fired` instead of navigating.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const RELEASE_URL = 'https://musicbrainz.org/release/1d404e1d-fcb6-3a52-b478-e706e893c897';
const FIXTURE_FILE = path.join(__dirname, 'release-tracks-ms-length.html');
const SIM = fs.readFileSync(path.join(__dirname, 'thirdPartyScripts', 'eh-body-swap.js'), 'utf8');
const TRACKS_BTN = 'button[data-label="Show all Tracks for Release"]';

/**
 * Loads the release fixture with Event Horizon simulated and OFF at load
 * (MusicBrainz's page showing), as after the user switched it off once.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ settings?: Object, noLauncher?: boolean }} [opts]
 * @returns {Promise<void>}
 */
async function openRelease(page, { settings = {}, noLauncher = false } = {}) {
    await page.context().addInitScript({ content: `window.__EH_SIM_START_ON__ = false;${noLauncher ? ' window.__EH_SIM_NO_LAUNCHER__ = true;' : ''}` });
    await page.context().addInitScript({ content: SIM });
    await loadUserscriptPage(page, {
        url: RELEASE_URL, fixtureFile: FIXTURE_FILE, testMode: true, settingsOverride: settings,
    });
    await page.waitForFunction(() => !!document.querySelector('#mb-saed-bar'));
}

/**
 * Presses keys with the focus on the page itself (no field focused), then
 * returns what the simulated Event Horizon ran, and clears the record.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string[]} keys - Playwright key names
 * @returns {Promise<string[]>}
 */
async function pressOnPage(page, keys) {
    await page.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); window.__ehSim.fired = []; });
    for (const k of keys) await page.keyboard.press(k);
    return page.evaluate(() => window.__ehSim.fired.splice(0));
}

test.describe('Event Horizon\'s single-letter keys on MusicBrainz\'s page', () => {
    test('initial page: EH\'s single keys (and Shift+H) are ignored, the page stays', async ({ page }) => {
        await openRelease(page);
        const url = page.url();
        // Guarantee: none of EH's page-leaving keys reaches it on the IP.
        expect(await pressOnPage(page, ['h', 'e', 'r', 'o', 'c', 't', 'd', 'a', 's', 'p', '.', ',', 'Shift+H'])).toEqual([]);
        expect(page.url()).toBe(url);
    });

    test('rendered page: EH\'s single keys are ignored, the table stays', async ({ page }) => {
        await openRelease(page);
        await page.click(TRACKS_BTN);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        expect(await pressOnPage(page, ['h', 'e', 'r', '.'])).toEqual([]);
        await expect(page.locator('#mb-filter-container')).toBeVisible();
    });

    test('V still switches EH on, and inside EH\'s own view its keys work', async ({ page }) => {
        await openRelease(page);
        // Guarantee: V is never taken (it is how the user gets to EH and back).
        expect(await pressOnPage(page, ['v'])).toEqual(['v']);
        expect(await page.evaluate(() => window.__ehSim.isOn())).toBe(true);
        // Guarantee: while EH's view shows (<html data-mbu-dock>), its keys are its own.
        expect(await pressOnPage(page, ['h'])).toEqual(['h']);
        expect(await pressOnPage(page, ['v'])).toEqual(['v']);
        expect(await page.evaluate(() => window.__ehSim.isOn())).toBe(false);
    });

    test('typing the same letters into a field is untouched', async ({ page }) => {
        await openRelease(page);
        await page.click(TRACKS_BTN);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const input = page.locator('#mb-global-filter-input');
        await input.click();
        await input.fill('');
        await input.pressSequentially('heros');
        // Guarantee: the guard never eats a typed character (the field keeps
        // its own "🔍 " prefix in front of what was typed).
        await expect(input).toHaveValue(/(^|\s)heros$/);
        expect(await page.evaluate(() => window.__ehSim.fired)).toEqual([]);
    });

    test('sa_block_eh_single_keys off: EH\'s keys work as before', async ({ page }) => {
        await openRelease(page, { settings: { sa_block_eh_single_keys: false } });
        expect(await pressOnPage(page, ['h'])).toEqual(['h']);
    });

    test('no Event Horizon on the page: single keys are not touched', async ({ page }) => {
        await openRelease(page, { noLauncher: true });
        // A bubble-phase probe sees whether anything called preventDefault().
        const prevented = await page.evaluate(() => new Promise((resolve) => {
            document.addEventListener('keydown', (e) => resolve(e.defaultPrevented), { once: true });
            if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
            document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true, cancelable: true }));
        }));
        expect(prevented).toBe(false);
    });
});
