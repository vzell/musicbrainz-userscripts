'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// Feature: the barcode-highlight on/off toggle moved out of the h1 toolbar's
// 🛠 View ▾ menu (#mb-barcode-highlight-btn) into the "Barcode" column
// header itself, mirroring the Length column's ▶⏱/▼⏱ toggle idiom
// (_initBarcodeColHeaderToggle()/_barcodeUpdateColHdrBtn()/
// _barcodeToggleHighlight() in ShowAllEntityData.user.js). The fixture
// carries two INDEPENDENT duplicate barcode+format pairs (rows A/B and D/E)
// plus one unique barcode (row C), so "highlights duplicate groups only" is
// pinned against real grouping, not just "any duplicate exists somewhere".
const RG_URL = 'https://musicbrainz.org/release-group/aaaaaaaa-0000-0000-0000-000000000002';
const FIXTURE_FILE = path.join(__dirname, 'barcode-col-header-toggle.html');

async function loadAndRender(page, settingsOverride) {
    await loadUserscriptPage(page, {
        url: RG_URL, fixtureFile: FIXTURE_FILE, testMode: true, settingsOverride,
    });
    await page.click('button[data-label="Show all Releases for ReleaseGroup"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/** @returns {Promise<string[]>} background-color of every td.barcode-cell, document order. */
async function barcodeCellBackgrounds(page) {
    return page.evaluate(() =>
        Array.from(document.querySelectorAll('td.barcode-cell'))
            .map((td) => td.style.backgroundColor || ''));
}

test.describe('barcode-highlight toggle in the "Barcode" column header', () => {
    test('renders the toggle engaged by default, and highlights duplicate groups only', async ({ page }) => {
        await loadAndRender(page);

        const toggle = page.locator('.mb-barcode-col-hdr-btn');
        await expect(toggle).toHaveCount(1);
        expect((await toggle.textContent()).startsWith('▼')).toBe(true);
        expect(await toggle.getAttribute('aria-pressed')).toBe('true');
        expect(await toggle.getAttribute('role')).toBe('button');

        // #mb-barcode-highlight-btn is gone entirely — replaced, not duplicated.
        await expect(page.locator('#mb-barcode-highlight-btn')).toHaveCount(0);
        const viewPanelIds = await page.evaluate(() =>
            Array.from(document.querySelectorAll('#mb-view-menu-btn-panel .mb-toolbar-menu-item'))
                .map((el) => el.id));
        expect(viewPanelIds).not.toContain('mb-barcode-highlight-btn');

        // A/B share barcode+format, C is unique, D/E share a DIFFERENT barcode+format.
        const backgrounds = await barcodeCellBackgrounds(page);
        expect(backgrounds).toHaveLength(5);
        expect(backgrounds[0]).not.toBe('');
        expect(backgrounds[1]).not.toBe('');
        expect(backgrounds[2]).toBe('');
        expect(backgrounds[3]).not.toBe('');
        expect(backgrounds[4]).not.toBe('');
        // The two groups are independent identifiers, so they're free to get
        // different colours — not asserted equal to each other.
    });

    test('clicking the header toggle turns highlighting off, then back on', async ({ page }) => {
        await loadAndRender(page);

        const toggle = page.locator('.mb-barcode-col-hdr-btn');
        await toggle.click();

        expect((await toggle.textContent()).startsWith('▶')).toBe(true);
        expect(await toggle.getAttribute('aria-pressed')).toBe('false');
        expect(await barcodeCellBackgrounds(page)).toEqual(['', '', '', '', '']);

        await toggle.click();

        expect((await toggle.textContent()).startsWith('▼')).toBe(true);
        expect(await toggle.getAttribute('aria-pressed')).toBe('true');
        const restored = await barcodeCellBackgrounds(page);
        expect(restored[0]).not.toBe('');
        expect(restored[1]).not.toBe('');
        expect(restored[2]).toBe(''); // the unique barcode never highlights.
        expect(restored[3]).not.toBe('');
        expect(restored[4]).not.toBe('');
    });

    test('keyboard activation (Enter) toggles the focused header control', async ({ page }) => {
        await loadAndRender(page);
        const toggle = page.locator('.mb-barcode-col-hdr-btn');

        await toggle.focus();
        await page.keyboard.press('Enter');
        await expect(toggle).toHaveAttribute('aria-pressed', 'false');
        expect(await barcodeCellBackgrounds(page)).toEqual(['', '', '', '', '']);

        await page.keyboard.press('Enter');
        await expect(toggle).toHaveAttribute('aria-pressed', 'true');
        const restored = await barcodeCellBackgrounds(page);
        expect(restored[0]).not.toBe('');
    });

    test('prefix-mode Ctrl+M b toggles it (the shipped default)', async ({ page }) => {
        await loadAndRender(page);
        const toggle = page.locator('.mb-barcode-col-hdr-btn');

        await page.keyboard.press('Control+M');
        await page.keyboard.press('b');
        await expect(toggle).toHaveAttribute('aria-pressed', 'false');
        expect(await barcodeCellBackgrounds(page)).toEqual(['', '', '', '', '']);

        await page.keyboard.press('Control+M');
        await page.keyboard.press('b');
        await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    });

    // `sa_enable_direct_ctrl_char_shortcuts` ships OFF, so the bare Ctrl+B
    // path needs it opted back in — see toolbar-menus.spec.js.
    test('direct Ctrl+B toggles it when direct shortcuts are enabled', async ({ page }) => {
        await loadAndRender(page, { sa_enable_direct_ctrl_char_shortcuts: true });
        const toggle = page.locator('.mb-barcode-col-hdr-btn');

        await page.keyboard.press('Control+B');
        await expect(toggle).toHaveAttribute('aria-pressed', 'false');
        expect(await barcodeCellBackgrounds(page)).toEqual(['', '', '', '', '']);

        await page.keyboard.press('Control+B');
        await expect(toggle).toHaveAttribute('aria-pressed', 'true');
        const restored = await barcodeCellBackgrounds(page);
        expect(restored[0]).not.toBe('');
    });

    test('sa_enable_barcode_highlight: false suppresses the toggle entirely', async ({ page }) => {
        await loadAndRender(page, { sa_enable_barcode_highlight: false });

        await expect(page.locator('.mb-barcode-col-hdr-btn')).toHaveCount(0);
        await expect(page.locator('#mb-barcode-highlight-btn')).toHaveCount(0);
    });
});
