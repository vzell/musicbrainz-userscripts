'use strict';

// The `sl-old-address` finding (⚠️, 2026-11-05; org/springsteenlyrics.org
// "Overwhole of the SL PTs and POHs", vzell's answer 6): an Annotation cell
// linking springsteenlyrics.com at an address the site no longer serves
// (/lyrics/<l>/<slug>.php, /collection/moreinfo.php?item=N; both 404 today)
// is a WARNING, so the annotation can be found and edited — on an annotation
// search or an annotation report (report/AnnotationsWorks). A current address
// (lyrics.php?song=) is not.
//
// Fixture: search-annotation-tooltip.html (an annotation search, 4 Release
// rows), with links planted into three Annotation cells here: an old song
// address (row 1), a current one (row 2), an old item address (row 3).

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { findingRow, clickFinding } = require('../support/findingsMenu');

const SEARCH_URL = 'https://musicbrainz.org/search?query=Barcode+and+other+i&type=annotation&limit=25&method=indexed';
const BUTTON = 'Show all Search Results for Annotations';
const OLD_SONG = 'http://www.springsteenlyrics.com/lyrics/a/angelina.php';
const NOW_SONG = 'http://www.springsteenlyrics.com/lyrics.php?song=alone';
const OLD_ITEM = 'http://www.springsteenlyrics.com/collection/moreinfo.php?item=5027';

/**
 * The fixture with the three links planted, each after a cell's first text.
 *
 * @returns {string}
 */
function plantedHtml() {
    let html = fs.readFileSync(path.join(__dirname, 'search-annotation-tooltip.html'), 'utf8');
    const plant = (anchor, href) => {
        if (html.split(anchor).length !== 2) throw new Error(`anchor not unique: ${anchor}`);
        html = html.replace(anchor, `${anchor} <a href="${href}" rel="nofollow">${href}</a>`);
    };
    plant('<bdi>Notes:<br />Made In The EU<br />', OLD_SONG);
    plant('<bdi>Cassette tape type I (ferric).<br />', NOW_SONG);
    plant('<bdi>The barcode found on', OLD_ITEM);
    return html;
}

/**
 * Loads the planted search page and runs its "Show all" button.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} [settings]
 * @returns {Promise<void>}
 */
async function open(page, settings = {}) {
    const html = plantedHtml();
    await page.route(/^https:\/\/(?:coverartarchive\.org|[^/]*springsteenlyrics\.com)\//, (route) => route.abort('blockedbyclient'));
    await page.route(SEARCH_URL, (route) => route.fulfill({ body: html, contentType: 'text/html' }));
    await loadUserscriptPage(page, {
        url: SEARCH_URL, testMode: true,
        settingsOverride: { sa_enable_caa_pics: false, sa_enable_relationships_column: false, sa_pop_ext: false, ...settings },
    });
    // A search page is always re-fetched over the network on "Show all".
    await page.route('https://musicbrainz.org/search**', (route) => route.fulfill({ body: html, contentType: 'text/html' }));
    await page.click(`button[data-label="${BUTTON}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

// The visible rows and how many of them carry the finding.
const rowState = (page) => page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('table.tbl tbody tr')).filter(tr => tr.offsetParent !== null);
    return { visible: rows.length, withFinding: rows.filter(tr => tr.querySelector('td[data-mb-findings~="sl-old-address"]')).length };
});

test.describe('the sl-old-address finding', () => {
    test('two old addresses flagged, the current one not; the menu filters to them and back; the look', async ({ page }) => {
        await open(page);
        const flagged = await page.evaluate(() => Array.from(document.querySelectorAll('td[data-mb-findings~="sl-old-address"]'))
            .map(td => td.closest('tr').querySelector('bdi').textContent));
        expect(flagged).toEqual(['If I Were the Boss: The Songs of Bruce Springsteen', 'Romeo and Juliet']);
        const row = await findingRow(page, 'warn', 'sl-old-address');
        expect(row).toMatchObject({ label: 'Old springsteenlyrics.com address in the annotation', count: 2 });
        // The tooltip names each link's current address.
        const tip = await page.locator('td[data-mb-findings~="sl-old-address"]').first().getAttribute('title');
        expect(tip).toContain(`${OLD_SONG} → https://www.springsteenlyrics.com/lyrics.php?song=angelina`);
        // The generic tint and glyph.
        const look = await page.locator('td[data-mb-findings~="sl-old-address"]').first().evaluate(td => ({
            bg: getComputedStyle(td).backgroundColor, after: getComputedStyle(td, '::after').content }));
        expect(look.bg).not.toBe('rgba(0, 0, 0, 0)');
        expect(look.after).toContain('⚠');
        // The filter: exactly those rows, and back.
        await clickFinding(page, 'sl-old-address');
        await expect.poll(() => rowState(page)).toEqual({ visible: 2, withFinding: 2 });
        await clickFinding(page, 'sl-old-address');
        await expect.poll(() => rowState(page)).toEqual({ visible: 4, withFinding: 2 });
    });

    test('the tint setting off: no tint, the menu row stays', async ({ page }) => {
        await open(page, { sa_findings_tint_sl_old_address: false });
        expect(await findingRow(page, 'warn', 'sl-old-address')).toMatchObject({ count: 2 });
        const after = await page.locator('td[data-mb-findings~="sl-old-address"]').first().evaluate(td => getComputedStyle(td, '::after').content);
        expect(after).not.toContain('⚠');
    });
});
