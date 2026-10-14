'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { injectThirdPartyScript } = require('../support/thirdPartyScripts');

// instrument-list (/instruments) × "MusicBrainz: Instrument Icons Everywhere"
// (@Lotheric). The page is read from the live document, which the script has
// already decorated. The Name_Comment_Description extractor used to copy the
// Name link with a bare cloneNode(true): the copy kept the script's
// data-ii-processed stamp and lost the icon (a sibling, not a child), so the
// "Name" column never showed one while "Family" and "Description" did.
const INSTRUMENTS_URL = 'https://musicbrainz.org/instruments';
const FIXTURE_FILE = path.join(__dirname, 'uniq-drop-instrument-crossreference.html');

test('instrument-list: the extracted "Name" column keeps each instrument\'s icon', async ({ page }) => {
    // debounceMs: the script decorates the native list at once, but would
    // re-decorate the consolidated table only 2 s later — so an icon read
    // right after the render was copied with its link, not added afterwards.
    await injectThirdPartyScript(page, 'ii-instrument-icons', { when: 'init', config: { allIcons: true, debounceMs: 2000 } });
    await loadUserscriptPage(page, { url: INSTRUMENTS_URL, fixtureFile: FIXTURE_FILE, testMode: true });
    await page.route(`${INSTRUMENTS_URL}?**`, (route) => route.fulfill({ path: FIXTURE_FILE, contentType: 'text/html' }));
    await page.click('button[data-label="Show all Instruments"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });

    const names = await page.evaluate(() => {
        const tbl = document.querySelector('table.tbl');
        const idx = Array.from(tbl.querySelectorAll('thead tr:first-child th')).findIndex((t) => t.dataset.colName === 'Name');
        return Array.from(tbl.querySelectorAll('tbody tr')).map((tr) => {
            const a = tr.cells[idx].querySelector('a[href*="/instrument/"]');
            const prev = a && a.previousSibling;
            return {
                name: a ? a.textContent.trim() : null,
                icon: (prev && prev.nodeType === 1 && prev.matches('img.mb-ii-icon')) ? prev.getAttribute('title') : null,
                icons: tr.cells[idx].querySelectorAll('img.mb-ii-icon').length,
            };
        });
    });
    expect(names.length).toBe(4);
    for (const n of names) {
        expect(n.icon, n.name).toBe(n.name);
        expect(n.icons, n.name).toBe(1);
    }
});
