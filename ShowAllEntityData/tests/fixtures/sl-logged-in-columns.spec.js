'use strict';

// springsteenlyrics.com lists while logged in (vzell, 2026-11-04;
// org/springsteenlyrics.org "Add new SL PTs and POHs"): the cards then carry
// the site's MusicBrainz link and, on the collection, its "Good scans" and
// "In <country>" icons, which become the MusicBrainz, Good scans and Kept in
// columns (_SL_LOGGED_IN_HEADERS). A bootleg's Info file links its
// `_infofile.txt`; the CD and vinyl bootlegs get PDF and Artwork.
// Fixtures: scripts/build-sl-item-fixtures.py (logged-in cards and login box
// grafted into the anonymous page 1). Logged out, nothing changes: the other
// sl-* specs pin the anonymous headers.

const { test, expect } = require('../support/test');
const { loadSlListPage, renderedSlRows, renderedSlHeaders } = require('../support/slFixture');
const { waitForRenderComplete } = require('../support/browser');

/**
 * Loads a logged-in list fixture and presses its button.
 * @param {import('@playwright/test').Page} page
 * @param {string} kind
 */
async function render(page, kind) {
    const { spec } = await loadSlListPage(page, { kind });
    await page.click(`button[data-label="${spec.button}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/**
 * A rendered row's cell by item number and column name, as an element handle's properties.
 * @param {import('@playwright/test').Page} page
 * @param {string} item
 * @param {string} col
 * @returns {Promise<{text: string, href: string, cls: string}>}
 */
function cellOf(page, item, col) {
    return page.evaluate(([it, c]) => {
        const names = Array.from(document.querySelectorAll('table.tbl thead tr:first-child th')).map((th) => th.dataset.colName || th.textContent.trim());
        const tr = Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .find((r) => r.querySelector(`a[href*="item=${it}&"], a[href$="item=${it}"]`));
        const td = tr && tr.cells[names.indexOf(c)];
        const a = td && td.querySelector('a');
        return { text: td ? td.textContent.trim() : null, href: a ? a.getAttribute('href') : '', cls: a ? a.className : '' };
    }, [item, col]);
}

test.describe('springsteenlyrics.com lists, logged in: the cards\' icons as columns', () => {
    test('collection: MusicBrainz, Good scans and Kept in after Copies', async ({ page }) => {
        await render(page, 'collection-logged-in');
        const headers = await renderedSlHeaders(page);
        expect(headers.slice(9, 13)).toEqual(['Copies', 'MusicBrainz', 'Good scans', 'Kept in']);
        const byItem = Object.fromEntries((await renderedSlRows(page)).map((r) => [r._item, r]));
        expect(Object.keys(byItem)).toHaveLength(14);
        expect(byItem['7057']).toMatchObject({ 'MusicBrainz': 'MB', 'Good scans': 'yes', 'Kept in': 'Switzerland' });
        // A logged-in card writes its item number and a second marker before
        // the title; Version is still the bold text after the title's marker.
        expect(byItem['7722']['Version']).toBe('Enhanced packaging reissue');
        expect(byItem['7057']['Version']).toBe('');
        expect(byItem['8981']).toMatchObject({ 'MusicBrainz': '', 'Good scans': 'yes', 'Kept in': 'Switzerland' });
        // The one "In Lebanon" card, without Good scans.
        expect(byItem['6553']).toMatchObject({ 'MusicBrainz': '', 'Good scans': '', 'Kept in': 'Lebanon' });
        // The MusicBrainz cell is the site's own release link.
        const mb = await cellOf(page, '8595', 'MusicBrainz');
        expect(mb).toEqual({ text: 'MB', href: 'https://musicbrainz.org/release/6069bf25-f108-4670-8e62-d42eb55dfe32', cls: 'mb-sl-mb-link' });
    });

    test('bootlegs: MusicBrainz last, Info file links the original info file', async ({ page }) => {
        await render(page, 'bootlegs-logged-in');
        const headers = await renderedSlHeaders(page);
        expect(headers.slice(9, 13)).toEqual(['Lossy', 'Artwork', 'Info file', 'MusicBrainz']);
        const byItem = Object.fromEntries((await renderedSlRows(page)).map((r) => [r._item, r]));
        expect(byItem['7639']).toMatchObject({ 'Artwork': 'yes', 'Info file': 'yes', 'MusicBrainz': 'MB' });
        expect(byItem['7158']).toMatchObject({ 'Artwork': '', 'Info file': 'yes', 'MusicBrainz': '' });
        expect(byItem['2888']).toMatchObject({ 'Info file': '', 'MusicBrainz': 'MB' });
        expect((await cellOf(page, '7639', 'Info file')).href).toBe('bootlegs/aud_live1978/7639_infofile.txt');
        expect((await cellOf(page, '2888', 'Info file')).href).toBe('');
    });

    test('CD and vinyl bootlegs: PDF links the item page, Artwork says yes; no MusicBrainz column', async ({ page }) => {
        await render(page, 'brucelegs-logged-in');
        const headers = await renderedSlHeaders(page);
        expect(headers.slice(9, 12)).toEqual(['Format', 'PDF', 'Artwork']);
        expect(headers).not.toContain('MusicBrainz');
        const pdf = await cellOf(page, '281', 'PDF');
        expect(pdf.text).toBe('yes');
        expect(pdf.href).toMatch(/^brucelegs\.php\?item=281&/);
        expect((await cellOf(page, '281', 'Artwork')).text).toBe('yes');
    });

    test('logged out: the collection keeps its anonymous columns', async ({ page }) => {
        await render(page, 'collection');
        const headers = await renderedSlHeaders(page);
        expect(headers).not.toContain('MusicBrainz');
        expect(headers).not.toContain('Kept in');
        expect(headers.slice(0, 10)).toEqual(['Cover', 'Title', 'Version', 'Label', 'Cat. no.', 'Format', 'Country', 'Release date', 'Original year', 'Copies']);
    });
});

/**
 * Hovers a link with Ctrl held (the default way to ask for its card) and
 * waits for the card to show; Ctrl goes up after the hover, so a later Space
 * is not Ctrl+Space.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} link
 */
async function ctrlHover(page, link) {
    await page.mouse.move(0, 0);
    await link.scrollIntoViewIfNeeded();
    await page.keyboard.down('Control');
    await link.hover();
    await page.keyboard.up('Control');
    await expect(page.locator('#mb-dp-peek')).toBeVisible();
}

test.describe('springsteenlyrics.com lists, logged in: previews of the new cells', () => {
    test('Info file: the card names the file and asks nothing; Space reads it into the window, once', async ({ page }) => {
        const { spec } = await loadSlListPage(page, { kind: 'bootlegs-logged-in', settingsOverride: { sa_sl_detail_preview: true } });
        const asked = [];
        await page.route(/_infofile\.txt$/, (route) => {
            asked.push(route.request().url());
            return route.fulfill({ status: 200, contentType: 'text/plain', body: 'Source: audience\nLineage: tape > flac' });
        });
        await page.click(`button[data-label="${spec.button}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const link = page.locator('table.tbl tbody a[href="bootlegs/aud_live1978/7639_infofile.txt"]');
        await ctrlHover(page, link);
        await expect(page.locator('#mb-dp-peek')).toContainText('7639_infofile.txt · Space reads it');
        expect(asked).toEqual([]);
        await page.keyboard.press('Space');
        await expect(page.locator('#mb-dp-dialog')).toContainText('Lineage: tape > flac');
        expect(asked).toEqual(['https://springsteenlyrics.com/bootlegs/aud_live1978/7639_infofile.txt']);
    });

    test('MusicBrainz cell: MusicBrainz\'s own card (the dg-mb source), named by the item', async ({ page }) => {
        const { spec } = await loadSlListPage(page, { kind: 'collection-logged-in', settingsOverride: { sa_pop_mb: true } });
        await page.click(`button[data-label="${spec.button}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await ctrlHover(page, page.locator('table.tbl tbody a.mb-sl-mb-link').first());
        const src = await page.evaluate(() => document.getElementById('mb-dp-peek').dataset.mbPopSrc || document.getElementById('mb-dp-peek').textContent);
        expect(src).toBeTruthy();
        await expect(page.locator('#mb-dp-peek')).toContainText(/Release/);
    });
});
