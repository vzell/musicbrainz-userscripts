'use strict';

// features.keepH2Intro (_keepH2Intro()) on the multi-table tag pages.
//
// MusicBrainz writes "<h2>Entities tagged as …</h2><p>N entities found</p>"
// and then the h3/list sections (debug/tag-entity-initial.html).
// renderGroupedTable() inserts every h3/table pair after the target h2, so
// without the feature the paragraph ends up below the LAST table
// (debug/tag-entity-final.html). Guarantees pinned here, each named:
//   - PLACE: the paragraph is the element right after the h2, and the first
//     h3 sub-section follows it;
//   - INDENT: it starts where the h3s start (margin-left 1.5em), not at the
//     h2's left edge;
//   - STAYS: a global filter re-render and clearing it leave it there;
//   - FOLD: collapsing the h2 hides it with the section.
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { typeGlobalFilter, waitForFilterSettled } = require('../support/filterSortAssertions');

const FIXTURE = path.join(__dirname, 'tag-value-artists-first.html');

/**
 * Loads the tag fixture under a musicbrainz.org URL and presses the page's
 * "Show all" button. The user-tag page fetches with `?show_downvoted=0`, so
 * every query variant of the URL is served the same fixture.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} url
 * @param {string} buttonLabel
 * @returns {Promise<void>}
 */
async function openAndRender(page, url, buttonLabel) {
    await loadUserscriptPage(page, { url, fixtureFile: FIXTURE, testMode: true });
    await page.route(`${url}?*`, (route) => route.fulfill({ path: FIXTURE, contentType: 'text/html' }));
    await page.click(`button[data-label="${buttonLabel}"]`);
    await page.locator('#mb-filter-container').waitFor();
}

/**
 * Where the "entities found" paragraph sits relative to the h2 that holds
 * the global filter, and the left edges of it and of the first h3.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{found: boolean, afterH2: boolean, nextIsH3: boolean, pLeft: number, h3Left: number, h2Left: number, visible: boolean}>}
 */
function introShape(page) {
    return page.evaluate(() => {
        const p = Array.from(document.querySelectorAll('p')).find((x) => /entities found/.test(x.textContent));
        const h2 = document.querySelector('#mb-global-filter-input').closest('h2');
        const h3 = document.querySelector('h3.mb-toggle-h3');
        if (!p || !h2 || !h3) return { found: false };
        const next = p.nextElementSibling;
        return {
            found: true,
            afterH2: h2.nextElementSibling === p,
            nextIsH3: !!next && next.matches('h3.mb-toggle-h3'),
            pLeft: Math.round(p.getBoundingClientRect().left),
            h3Left: Math.round(h3.getBoundingClientRect().left),
            h2Left: Math.round(h2.getBoundingClientRect().left),
            visible: p.getClientRects().length > 0,
        };
    });
}

for (const variant of [
    { pt: 'tag-value', url: 'https://musicbrainz.org/tag/arena%20rock', button: 'Show all Entities tagged' },
    { pt: 'user-tag-value', url: 'https://musicbrainz.org/user/vzell/tag/arena%20rock', button: 'Tag for Entities upvoted' },
]) {
    test.describe(`${variant.pt}: the "entities found" paragraph stays under its h2`, () => {
        test.beforeEach(async ({ page }) => {
            await openAndRender(page, variant.url, variant.button);
        });

        test('PLACE + INDENT: right after the h2, before the first sub-section, indented like the h3s', async ({ page }) => {
            const s = await introShape(page);
            expect(s.found).toBe(true);
            expect(s.afterH2, 'the paragraph follows the h2 with the global filter').toBe(true);
            expect(s.nextIsH3, 'the first h3 sub-section comes after it').toBe(true);
            expect(s.pLeft).toBe(s.h3Left);
            expect(s.pLeft).toBeGreaterThan(s.h2Left);
        });

        test('STAYS: a global filter and clearing it leave it in place', async ({ page }) => {
            await waitForFilterSettled(page, () => typeGlobalFilter(page, 'back'));
            let s = await introShape(page);
            expect(s.afterH2).toBe(true);
            expect(s.nextIsH3).toBe(true);
            await waitForFilterSettled(page, () => page.locator('#mb-global-filter-input').fill(''));
            s = await introShape(page);
            expect(s.afterH2).toBe(true);
            expect(s.nextIsH3).toBe(true);
        });

        test('FOLD: collapsing the h2 hides it with its section', async ({ page }) => {
            const h2 = page.locator('#mb-global-filter-input').locator('xpath=ancestor::h2');
            await h2.locator('.mb-toggle-icon').click();
            await expect.poll(async () => (await introShape(page)).visible).toBe(false);
            await h2.locator('.mb-toggle-icon').click();
            await expect.poll(async () => (await introShape(page)).visible).toBe(true);
        });
    });
}
