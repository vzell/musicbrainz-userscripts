'use strict';

// An editor's edit lists, the links of a profile's Statistics:
// /user/<name>/edits/<status> and /user/<name>/votes. Before 2026-10-22 only
// /user/<name>/edits (user-edits) and /edits/open (user-open-edits) were
// pageTypes; the other six statuses and the votes list had no button, and
// the @include did not even inject the script there. The guarantees pinned:
//   - INCLUDE  every list URL (with ?page=N, with a trailing slash) is
//              injected; a status MusicBrainz does not have is not;
//   - BUTTON   each list gets its own pageType, seen as its own button label
//              (so no list is swallowed by another's match);
//   - RENDER   a list converts like user-edits: its title <h2> becomes the
//              page's one <h1> holding the toolbar, an injected <h2> anchors
//              the filter bar, and every div.edit-list becomes a table row.
//
// Fixtures (2026-10-21, scripts/fetch-mb-page-fixture.js --auth, then
// scripts/anonymize-user-fixtures.py): edits-page-user-vzell-rejected.html
// (65 edits, 2 pages), edits-page-user-vzell-votes.html. The page shape of
// all eight lists was probed 2026-10-22 with scripts/probe-user-edit-lists.py:
// identical, so the rejected page stands in for the four statuses that have
// no fixture of their own — only the button is asserted there.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage, USERSCRIPT_PATH } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const REJECTED = path.join(__dirname, 'edits-page-user-vzell-rejected.html');
const VOTES = path.join(__dirname, 'edits-page-user-vzell-votes.html');
const BASE = 'https://musicbrainz.org/user/vzell';

/** Each list: its path below /user/vzell, its button label, its fixture. */
const LISTS = [
    ['/edits/accepted', 'Show all Accepted Edits for User', REJECTED],
    ['/edits/autoedits', 'Show all Auto-edits for User', REJECTED],
    ['/edits/applied', 'Show all Applied Edits for User', REJECTED],
    ['/edits/rejected', 'Show all Rejected Edits for User', REJECTED],
    ['/edits/failed', 'Show all Failed Edits for User', REJECTED],
    ['/edits/cancelled', 'Show all Cancelled Edits for User', REJECTED],
    ['/votes', 'Show all Votes for User', VOTES],
];

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

test.describe('an editor\'s edit lists', () => {
    test('INCLUDE: every list is injected, a status MusicBrainz lacks is not', () => {
        for (const p of ['/edits', '/edits/open', ...LISTS.map((l) => l[0])]) {
            for (const url of [BASE + p, `${BASE}${p}/`, `${BASE}${p}?page=3`]) {
                expect(injected(url), url).toBe(true);
            }
        }
        expect(injected(`${BASE}/edits/bogus`)).toBe(false);
        expect(injected(`${BASE}/votes/open`)).toBe(false);
    });

    for (const [p, label, fixture] of LISTS) {
        test(`BUTTON: ${p} has its own button`, async ({ page }) => {
            await loadUserscriptPage(page, { url: BASE + p, fixtureFile: fixture, testMode: true });
            await page.locator(`button[data-label="${label}"]`).waitFor({ state: 'attached', timeout: 15000 });
            expect(await buttonLabels(page)).toEqual([label]);
        });
    }

    test('RENDER: the rejected list converts like user-edits', async ({ page }) => {
        const url = `${BASE}/edits/rejected`;
        await loadUserscriptPage(page, { url, fixtureFile: REJECTED, testMode: true });
        // Page 2 is served the same 50 edits: only the conversion is pinned.
        await page.route(`${url}?**`, (route) => route.fulfill({ path: REJECTED, contentType: 'text/html' }));
        const nativeEdits = await page.locator('div.edit-list').count();
        expect(nativeEdits, 'the fixture holds a page of edits').toBe(50);

        const btn = page.locator('button[data-label="Show all Rejected Edits for User"]');
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
                filterUnderH2: !!h2s[0]?.querySelector('#mb-filter-container'),
                editLists: document.querySelectorAll('div.edit-list').length,
                rows: rows.length,
                editLinks: rows.filter((r) => r.querySelector('a[href*="/edit/"]')).length,
            };
        });
        expect(shape.h1, 'the title <h2> is now the one <h1>').toEqual(['Rejected edits by']);
        expect(shape.toolbarInH1, 'the toolbar moved with it').toBe(true);
        expect(shape.h2, 'one <h2>, the injected anchor').toEqual([true]);
        expect(shape.filterUnderH2, 'the filter bar sits on that anchor').toBe(true);
        expect(shape.editLists, 'no native edit block is left').toBe(0);
        expect(shape.rows % nativeEdits, 'whole pages of rows').toBe(0);
        expect(shape.rows).toBeGreaterThanOrEqual(nativeEdits);
        expect(shape.editLinks, 'every row is an edit').toBe(shape.rows);
    });
});
