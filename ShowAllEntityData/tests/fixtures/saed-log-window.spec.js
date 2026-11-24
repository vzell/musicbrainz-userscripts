'use strict';

// ShowAllEntityData's side of VZ_MBLibrary's activity log (library 4.7.0+,
// tests/fixtures/lib-log-window.spec.js pins the window itself): the ☰ SAED →
// Help → "🧾 Activity log" row, the counts on it, the name and page type in
// the copy, and where the window lives under Event Horizon.
// Approved mockup: https://claude.ai/artifact/4gzcR5shSasSuRWYvJ2wMT.
//
// What is pinned here, each of which fails silently:
//
//   • **The row opens SAED's own log**, named "ShowAllEntityData" (not the
//     long @name), with the focus in its filter so Escape works at once.
//   • **The copy names the page type** (configureLog's subtitle): a report
//     says which page it came from.
//   • **The counts are attributes, never row text**, and they follow the
//     log: a read of the row stays its label (saed-toolbar.spec.js).
//   • **The window lives in MusicBrainz's body.** Opened while Event
//     Horizon's view is on, a window in document.body (EH's body) would
//     leave the document with it on V.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { openToolbarMenu } = require('../support/toolbarMenu');

const ARTIST_RECORDINGS_URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/recordings';
const FIXTURE_FILE = path.join(__dirname, 'uniq-drop-viewport-clip.html');
const SIM = fs.readFileSync(path.join(__dirname, 'thirdPartyScripts', 'eh-body-swap.js'), 'utf8');
// A page with MusicBrainz's own #page, which the Event Horizon simulator needs (eh-body-swap-floating.spec.js).
const RELEASE_URL = 'https://musicbrainz.org/release/1d404e1d-fcb6-3a52-b478-e706e893c897';
const RELEASE_FIXTURE = path.join(__dirname, 'release-tracks-ms-length.html');

const ROW = '#mb-saed-log-btn';
const WIN = '#vz-mb-show-all-entity-data-log';

/**
 * Loads the artist recordings fixture (no fetch: the row is there before any).
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function load(page) {
    await loadUserscriptPage(page, { url: ARTIST_RECORDINGS_URL, fixtureFile: FIXTURE_FILE, testMode: true });
    await expect(page.locator('#mb-saed-bar')).toBeAttached();
}

/**
 * Opens the log through ☰ SAED → Help → 🧾 Activity log.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function openFromRow(page) {
    await openToolbarMenu(page, 'saed');
    await page.locator(ROW).click();
    await expect(page.locator(WIN)).toBeVisible();
}

test.describe('ShowAllEntityData: the activity log', () => {
    test('☰ SAED → Help → Activity log opens SAED\'s own log, named ShowAllEntityData', async ({ page }) => {
        await load(page);
        await openFromRow(page);
        await expect(page.locator('#mb-saed-menu-btn-panel')).toBeHidden();
        // "ShowAllEntityData" and the script's version from GM_info (the harness stubs it)
        const ver = await page.evaluate(() => GM_info.script.version); // eslint-disable-line no-undef
        await expect(page.locator(`${WIN} .vz-log-who`)).toHaveText(`ShowAllEntityData ${ver}`);
        await expect(page.locator(`${WIN} .vz-log-q`)).toBeFocused();
        // SAED's own start-up lines are there: the buffer filled before the window opened.
        expect(await page.locator(`${WIN} .vz-log-li`).count()).toBeGreaterThan(0);

        await page.keyboard.press('Escape');
        await expect(page.locator(WIN)).toHaveCount(0);
    });

    test('the copied Markdown names the page type', async ({ page }) => {
        await load(page);
        await page.evaluate(() => {
            Object.defineProperty(navigator, 'clipboard', {
                configurable: true,
                value: { writeText: (t) => { window.__copied = t; return Promise.resolve(); } },
            });
        });
        await openFromRow(page);
        await page.locator(`${WIN} .vz-log-copybtn`).click();
        await expect(page.locator(`${WIN} .vz-log-copymsg`)).toHaveText(/^Copied ✓/);
        const md = await page.evaluate(() => window.__copied);
        expect(md).toMatch(/^<details><summary>ShowAllEntityData \S+ · VZ_MBLibrary \S+ · artist-recordings · \/artist\/89729b97-90a3-4f84-9e88-e16f96cab350\/recordings — activity log/);
    });

    test('warnings and errors show as counts on the row, never in its text', async ({ page }) => {
        await load(page);
        const base = await page.evaluate(() => window.__saTest.log.counts());
        await page.evaluate(() => {
            window.__saTest.log.warn('fetch', 'HTTP 503 (test)');
            window.__saTest.log.warn('fetch', 'HTTP 503 again (test)');
            window.__saTest.log.error('render', 'failed (test)');
        });
        const row = page.locator(ROW);
        await expect(row).toHaveAttribute('data-mb-log-warn', `${base.warn + 2} ⚠`);
        await expect(row).toHaveAttribute('data-mb-log-err', `${base.error + 1} ✖`);
        expect((await row.textContent()).trim(), 'the counts are not row text').toBe('🧾 Activity log');

        // drawn: the pills are really painted after the label
        await openToolbarMenu(page, 'saed');
        const after = await row.evaluate((el) => getComputedStyle(el, '::after').content);
        expect(after).toBe(`"${base.error + 1} ✖"`);

        // Clear in the window takes them off the row again
        await page.locator(ROW).click();
        await page.locator(`${WIN} .vz-log-clearbtn`).click();
        await page.locator(`${WIN} .vz-log-yes`).click();
        await expect(row).not.toHaveAttribute('data-mb-log-warn', /.*/);
        await expect(row).not.toHaveAttribute('data-mb-log-err', /.*/);
    });

    test('opened under Event Horizon, the window lives in MusicBrainz\'s body and comes back after V', async ({ page }) => {
        await page.context().addInitScript({ content: SIM });       // EH's view on at load
        await loadUserscriptPage(page, { url: RELEASE_URL, fixtureFile: RELEASE_FIXTURE, testMode: true });
        await page.waitForFunction(() => !!document.querySelector('#mb-saed-bar'));
        expect(await page.evaluate(() => window.__ehSim.isOn()), 'premise: EH is on').toBe(true);
        // ☰ SAED is under EH's view: Tampermonkey's menu entry is the way in (SAED's own library's).
        await page.evaluate(() => {
            const all = Object.values(window.__gmMenuCommands || {}).filter((c) => c.name === '🧾 Activity log');
            all[0].callback();
        });
        const where = () => page.evaluate((sel) => {
            const el = document.querySelector(sel);
            if (!el) return 'none';
            const mb = document.getElementById('page').closest('body');
            return mb.contains(el) ? 'mb' : (window.__ehSim.ehBody && window.__ehSim.ehBody.contains(el) ? 'eh' : 'other');
        }, WIN);
        expect(await where()).toBe('mb');

        await page.evaluate(() => window.__ehSim.off());            // V
        expect(await where(), 'still there after V').toBe('mb');
        await expect(page.locator(WIN)).toBeVisible();
        await page.evaluate(() => window.__saTest.log.warn('fetch', 'after V (test)'));
        await expect(page.locator(`${WIN} .vz-log-li`).last()).toContainText('after V (test)');
    });
});
