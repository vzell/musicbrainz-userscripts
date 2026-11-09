'use strict';

// `?` and `/` open the keyboard shortcuts reference, except while typing.
//
// ── The bug (org/majkinetor.org, "Shortcut clashes with String Theory / EH:
//    Ctrl+K, Ctrl+L, the typing guard"; shown to and confirmed by vzell
//    2026-11-09 on https://claude.ai/artifact/Qf6CgYftyqi9D3rJ4hbr5j) ─────────
//
// `initKeyboardShortcuts()` (installed in the render tail, so a render comes
// first here) counted only INPUT and TEXTAREA as typing. With
// the focus on a drop-down (MusicBrainz's header search type, reached with
// Tab from the search box) `/` opened the reference over it; in editable
// text (contenteditable, a rich-text editor another script adds) the
// reference opened AND the key never reached the text (`preventDefault()`).
// The fix uses the test Event Horizon's key guard already uses
// (`_ehKeyGuardInstall()`): INPUT, TEXTAREA, SELECT, or `isContentEditable`.
//
// Guarantees pinned here, each in its own test so a regression names itself:
//   - `/` and `?` in the header type drop-down do NOT open the reference;
//   - `/` in editable text does not open it AND is typed into the text;
//   - `/` in the header search box types a slash (the case always covered);
//   - control: `?` with no field focused DOES open it, so the three "does
//     not open" assertions above can see the dialog when it appears.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const RELEASE_URL = 'https://musicbrainz.org/release/1d404e1d-fcb6-3a52-b478-e706e893c897';
const FIXTURE_FILE = path.join(__dirname, 'release-tracks-ms-length.html');
const HELP = '#mb-shortcuts-help';
const TRACKS_BTN = 'button[data-label="Show all Tracks for Release"]';

/**
 * Loads the release fixture and renders it ("Show all Tracks for Release"):
 * `initKeyboardShortcuts()` is installed only in the render tail, so before
 * a render `?` does nothing anywhere.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function openRelease(page) {
    await loadUserscriptPage(page, { url: RELEASE_URL, fixtureFile: FIXTURE_FILE, testMode: true });
    await page.waitForFunction(() => !!document.querySelector('#mb-saed-bar'));
    await page.click(TRACKS_BTN);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/**
 * Whether the shortcuts reference is in the document and shown, after one
 * frame so a dialog opened by the key press has been inserted.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<boolean>}
 */
async function helpShown(page) {
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => r())));
    return page.evaluate((sel) => {
        const el = document.querySelector(sel);
        return !!(el && el.isConnected && el.getClientRects().length > 0);
    }, HELP);
}

test.describe('? and / while typing (the typing guard)', () => {
    test('control: ? with no field focused opens the shortcuts reference', async ({ page }) => {
        await openRelease(page);
        await page.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
        await page.keyboard.press('?');
        // Guarantee: the reference opens off a field, so the negative tests
        // below would see it if it opened there too.
        expect(await helpShown(page)).toBe(true);
    });

    test('/ in the header search box types a slash, no reference', async ({ page }) => {
        await openRelease(page);
        await page.click('#headerid-query');
        await page.keyboard.press('/');
        expect(await helpShown(page)).toBe(false);
        await expect(page.locator('#headerid-query')).toHaveValue('/');
    });

    test('/ and ? on the header type drop-down (Tab from the search box) open no reference', async ({ page }) => {
        await openRelease(page);
        await page.click('#headerid-query');
        await page.keyboard.press('Tab');
        // Guarantee pinned only if the focus really is on the drop-down.
        expect(await page.evaluate(() => document.activeElement && document.activeElement.id)).toBe('headerid-type');
        await page.keyboard.press('/');
        expect(await helpShown(page)).toBe(false);
        await page.keyboard.press('?');
        expect(await helpShown(page)).toBe(false);
    });

    test('/ in editable text opens no reference and is typed', async ({ page }) => {
        await openRelease(page);
        await page.evaluate(() => {
            const div = document.createElement('div');
            div.id = 'tg-editable';
            div.contentEditable = 'true';
            div.textContent = 'AC';
            document.getElementById('content').prepend(div);
        });
        await page.click('#tg-editable');
        await page.keyboard.press('End');
        await page.keyboard.press('/');
        expect(await helpShown(page)).toBe(false);
        // Guarantee: the key was not swallowed (no preventDefault on it).
        await expect(page.locator('#tg-editable')).toHaveText('AC/');
    });
});
