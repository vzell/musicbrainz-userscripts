'use strict';

// An entity's open edits: /<entity>/<mbid>/open_edits, the sidebar's "Open
// edits". Before 2026-10-23 the @include did not inject the script there and
// no pageType matched. The page is the same as the entity's /edits (native
// <h1> "Open Edits for …", "Found N edits", one div.edit-list per edit), so
// it gets the edits pipeline under its own pageType 'open-edits'. The
// guarantees pinned:
//   - INCLUDE  /open_edits (plain, trailing slash, ?page=N) is injected for
//              every entity kind the /edits tab is; a path below it is not;
//   - BUTTON   it has its own button, and the entity's /edits keeps its own
//              (neither pageType swallows the other);
//   - RENDER   the native <h1> stays the one <h1> and holds the toolbar, an
//              injected <h2> anchors the filter bar, and every div.edit-list
//              becomes a table row.
//
// Fixtures (2026-10-23, scripts/fetch-mb-page-fixture.js, anonymous):
// open-edits-page-artist.html (Bruce Springsteen, 2 open edits),
// open-edits-page-recording.html (Streets of Philadelphia, 1). The link
// preview of the same pages is pinned in popup-mb-edits.spec.js (PATH, OPEN).
// Mutation list: scripts/mutations/entity-open-edits.json.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage, USERSCRIPT_PATH } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const ARTIST = '70248960-cb53-4ea4-943a-edb18f7d336f';
const REC = '0da6ef66-f98f-4917-8d50-770586eaafea';
const ARTIST_OPEN = path.join(__dirname, 'open-edits-page-artist.html');
const REC_OPEN = path.join(__dirname, 'open-edits-page-recording.html');
const ARTIST_EDITS = path.join(__dirname, 'edits-page-artist.html');
const KINDS = ['artist', 'release-group', 'release', 'work', 'recording', 'label', 'series', 'place', 'area', 'instrument', 'event'];

/**
 * Returns the header's `@include` patterns as RegExp objects, read the way
 * Tampermonkey reads them (see sl-include-regex.spec.js).
 * @returns {RegExp[]}
 */
function includePatterns() {
    const header = fs.readFileSync(USERSCRIPT_PATH, 'utf8').split('// ==/UserScript==')[0];
    return header.split('\n')
        .map((line) => line.match(/^\/\/ @include\s+\/(.*)\/\s*$/))
        .filter(Boolean)
        .map((m) => new RegExp(m[1]));
}

/**
 * True when any `@include` pattern admits the URL.
 * @param {string} url
 * @returns {boolean}
 */
const injected = (url) => includePatterns().some((re) => re.test(url));

/**
 * The labels of the script's fetch buttons on the page.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string[]>}
 */
const buttonLabels = (page) => page.evaluate(() => Array.from(document.querySelectorAll('button[data-label]'))
    .map((b) => b.dataset.label).filter((l) => /^Show all /.test(l)));

test.describe('an entity\'s open edits', () => {
    test('INCLUDE: /open_edits is injected for every entity kind; a path below it is not', () => {
        for (const kind of KINDS) {
            const base = `https://musicbrainz.org/${kind}/${ARTIST}/open_edits`;
            for (const url of [base, `${base}/`, `${base}?page=3`]) {
                expect(injected(url), url).toBe(true);
            }
        }
        expect(injected(`https://musicbrainz.org/artist/${ARTIST}/open_edits/bogus`)).toBe(false);
    });

    test('BUTTON: /open_edits has its own button; the entity\'s /edits keeps "Show all Edits"', async ({ page }) => {
        await loadUserscriptPage(page, { url: `https://musicbrainz.org/recording/${REC}/open_edits`, fixtureFile: REC_OPEN, testMode: true });
        await page.locator('button[data-label="Show all Open Edits"]').waitFor({ state: 'attached', timeout: 15000 });
        expect(await buttonLabels(page)).toEqual(['Show all Open Edits']);

        await loadUserscriptPage(page, { url: `https://musicbrainz.org/artist/${ARTIST}/edits`, fixtureFile: ARTIST_EDITS, testMode: true });
        await page.locator('button[data-label="Show all Edits"]').waitFor({ state: 'attached', timeout: 15000 });
        expect(await buttonLabels(page)).toEqual(['Show all Edits']);
    });

    test('RENDER: the artist\'s open edits convert like its edits', async ({ page }) => {
        const url = `https://musicbrainz.org/artist/${ARTIST}/open_edits`;
        await loadUserscriptPage(page, { url, fixtureFile: ARTIST_OPEN, testMode: true });
        // No pagination on the page: a request for a page 2 would be a bug,
        // and is answered with the same edits so the row count shows it.
        await page.route(`${url}?**`, (route) => route.fulfill({ path: ARTIST_OPEN, contentType: 'text/html' }));
        const nativeEdits = await page.locator('div.edit-list').count();
        expect(nativeEdits, 'the fixture holds two edits').toBe(2);

        const btn = page.locator('button[data-label="Show all Open Edits"]');
        await btn.waitFor({ state: 'attached', timeout: 15000 });
        await btn.click();
        await waitForRenderComplete(page, { waitForAutoResize: false });

        const shape = await page.evaluate(() => {
            const content = document.querySelector('#content');
            const h1s = Array.from(content.querySelectorAll('h1'));
            const h2s = Array.from(content.querySelectorAll('h2'));
            const rows = Array.from(document.querySelectorAll('table.tbl tbody tr'));
            return {
                h1: h1s.map((h) => h.firstChild.textContent.trim()),
                toolbarInH1: !!h1s[0]?.querySelector('button[data-label]'),
                h2: h2s.map((h) => h.dataset.mbInjectedH2 !== undefined),
                h2Text: h2s[0] ? h2s[0].textContent : '',
                filterUnderH2: !!h2s[0]?.querySelector('#mb-filter-container'),
                editLists: document.querySelectorAll('div.edit-list').length,
                rows: rows.length,
                edits: rows.map((r) => (/\/edit\/(\d+)/.exec(r.querySelector('a[href*="/edit/"]')?.getAttribute('href') || '') || [])[1] || ''),
                headers: Array.from(document.querySelectorAll('table.tbl thead th')).map((th) => th.textContent),
            };
        });
        expect(shape.h1, 'the native heading stays the one <h1>').toEqual(['Open Edits for']);
        expect(shape.toolbarInH1, 'the toolbar sits on it').toBe(true);
        expect(shape.h2, 'one <h2>, the injected anchor').toEqual([true]);
        expect(shape.h2Text, 'titled Open edits').toContain('Open edits');
        expect(shape.filterUnderH2, 'the filter bar sits on that anchor').toBe(true);
        expect(shape.editLists, 'no native edit block is left').toBe(0);
        expect(shape.edits, 'one row per edit, one page').toEqual(['156151063', '156093950']);
        expect(shape.headers.some((h) => h.includes('Edit details')), 'Edit details column').toBe(true);
        expect(shape.headers.some((h) => h.includes('Edit notes')), 'Edit notes column').toBe(true);
    });
});
