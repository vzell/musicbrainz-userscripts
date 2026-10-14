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

// Both settings of the script's 'iconPosition' (2026-10-12.2140): the icon is
// the anchor's immediate previous sibling ('before', its first-run default)
// or its immediate next sibling ('after'). Every test below runs in both.
const POSITIONS = ['before', 'after'];

for (const position of POSITIONS) {
    test(`instrument-list: the extracted "Name" column keeps each instrument's icon [icon ${position}]`, async ({ page }) => {
        // debounceMs: the script decorates the native list at once, but would
        // re-decorate the consolidated table only 2 s later — so an icon read
        // right after the render was copied with its link, not added afterwards.
        await injectThirdPartyScript(page, 'ii-instrument-icons', { when: 'init', config: { allIcons: true, debounceMs: 2000, position } });
        await loadUserscriptPage(page, { url: INSTRUMENTS_URL, fixtureFile: FIXTURE_FILE, testMode: true });
        await page.route(`${INSTRUMENTS_URL}?**`, (route) => route.fulfill({ path: FIXTURE_FILE, contentType: 'text/html' }));
        await page.click('button[data-label="Show all Instruments"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });

        const names = await page.evaluate((pos) => {
            const tbl = document.querySelector('table.tbl');
            const idx = Array.from(tbl.querySelectorAll('thead tr:first-child th')).findIndex((t) => t.dataset.colName === 'Name');
            return Array.from(tbl.querySelectorAll('tbody tr')).map((tr) => {
                const a = tr.cells[idx].querySelector('a[href*="/instrument/"]');
                // The icon on the script's side only: one on the other side
                // was copied to the wrong place.
                const sib = a && (pos === 'after' ? a.nextSibling : a.previousSibling);
                return {
                    name: a ? a.textContent.trim() : null,
                    icon: (sib && sib.nodeType === 1 && sib.matches('img.mb-ii-icon')) ? sib.getAttribute('title') : null,
                    icons: tr.cells[idx].querySelectorAll('img.mb-ii-icon').length,
                };
            });
        }, position);
        expect(names.length).toBe(4);
        for (const n of names) {
            expect(n.icon, n.name).toBe(n.name);
            expect(n.icons, n.name).toBe(1);
        }
    });
}

// _findInstrumentLinkIcon()'s side rule. An icon right AFTER an anchor is that
// anchor's ('after' mode) unless another instrument anchor follows it with
// no text between — then it is that next anchor's ('before' mode). Real
// MusicBrainz markup always puts ", " or " and " between two instrument
// links, so this shape is built by hand; it pins the tie-break the 'after'
// support added, and that the previous-sibling rule still wins.
test('an icon between two adjacent instrument links belongs to the one after it', async ({ page }) => {
    await loadUserscriptPage(page, { url: INSTRUMENTS_URL, fixtureFile: FIXTURE_FILE, testMode: true });
    const owners = await page.evaluate(() => {
        const host = document.createElement('div');
        host.innerHTML =
            // a1 <img> a2: the image is a2's (before), not a1's.
            '<p id="t1"><a id="a1" href="/instrument/1">one</a><img class="mb-ii-icon" id="i1"><a id="a2" href="/instrument/2">two</a></p>'
            // a3 <img> ", ": the image is a3's (after).
            + '<p id="t2"><a id="a3" href="/instrument/3">three</a><img class="mb-ii-icon" id="i3">, <a id="a4" href="/instrument/4">four</a></p>'
            // a5 <img> <a artist>: an artist link does not claim it, so a5 does.
            + '<p id="t3"><a id="a5" href="/instrument/5">five</a><img class="mb-ii-icon" id="i5"><a id="x" href="/artist/9">nine</a></p>';
        document.body.appendChild(host);
        const own = (id) => {
            const icon = window.__saTest.findInstrumentLinkIcon(document.getElementById(id));
            return icon ? icon.id : null;
        };
        const res = { a1: own('a1'), a2: own('a2'), a3: own('a3'), a4: own('a4'), a5: own('a5') };
        host.remove();
        return res;
    });
    expect(owners).toEqual({ a1: null, a2: 'i1', a3: 'i3', a4: null, a5: 'i5' });
});
