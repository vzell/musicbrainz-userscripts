'use strict';

// The global filter's Rx card: with Rx on, the card under the field (the one
// query mode has, gf-query-mode.spec.js) says whether the pattern is valid,
// reads it piece by piece, or marks where and why it is invalid; Examples put
// a pattern into the field, "Back to …" restores what was typed. Mockup
// approved 2026-11-20: https://claude.ai/artifact/P2mgvatkWwPXYkTHJAYfFX.
//
// What each test pins, and the neighbour it keeps apart:
//
//  1. THE READER AND THE DIAGNOSIS, straight on the shipping functions
//     (__saTest.rx): one case per construct, and one per kind of error with
//     its position. A reader that only said "valid" would pass a test that
//     looked at the pill alone; the rows are what this pins.
//  2. THE CARD FOLLOWS THE FIELD: a valid pattern gets the Valid pill and its
//     rows, an invalid one the Invalid pill, the marked spot and the reason —
//     while the table is left unfiltered (the status line's existing error).
//     The notes follow Cc and Ex.
//  3. EXAMPLES FILTER, AND BACK RESTORES what was typed, with its rows. A Back
//     that only restored the text would leave the example's rows; the row
//     count is checked after it.
//  4. ESC: the Examples list first, then the card; Rx off: no card.
//
// Network-free: the BoDeans artist-releases disk fixture (56 rows).

const path = require('path');
const { test, expect } = require('../support/test');
const { loadFromDiskFixture } = require('../support/diskFixture');
const { collectPageErrors } = require('../support/liveAssertions');
const { typeGlobalFilter } = require('../support/filterSortAssertions');

const AR = {
    url: 'https://musicbrainz.org/artist/84c38d3a-3400-4c28-b988-90558bb6fae0/releases',
    fixture: path.join(__dirname, 'saved-data', 'artist-releases-bodeans.json.gz'),
    total: 56,
};
const SETTLE = { timeout: 10000 };

/**
 * The number of rows shown.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<number>}
 */
const shownCount = (page) => page.evaluate(() => Array.from(document.querySelectorAll('table.tbl tbody tr'))
    .filter(tr => tr.style.display !== 'none').length);

/**
 * The text of `#mb-filter-status-display`.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string>}
 */
const status = (page) => page.evaluate(() =>
    (document.getElementById('mb-filter-status-display') || {}).textContent || '');

/**
 * Loads the fixture (cover art and relationships off) and ticks Rx.
 *
 * @param {import('@playwright/test').Page} page
 */
async function openWithRx(page) {
    await loadFromDiskFixture(page, {
        url: AR.url, fixturePath: AR.fixture, testMode: true,
        settingsOverride: { sa_enable_relationships_column: false, sa_enable_caa_pics: false },
    });
    await expect.poll(() => shownCount(page), { timeout: 30000 }).toBe(AR.total);
    await page.locator('#mb-global-filter-rx-label').click();
    await expect(page.locator('#mb-global-filter-rx-checkbox')).toBeChecked();
}

/**
 * Replaces the global filter's text with `text`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} text
 */
async function setGlobal(page, text) {
    const clr = page.locator('#mb-global-filter-clear');
    if (await clr.isVisible()) await clr.click();
    if (text) await typeGlobalFilter(page, text);
}

test.describe('the Rx card: reader and diagnosis', () => {
    test('every construct is read, every error found where it is', async ({ page }) => {
        await openWithRx(page);
        const r = await page.evaluate(() => {
            const R = window.__saTest.rx;
            const words = (p) => R.read(p).map(([d, c, w]) => `${d}|${c}|${w}`);
            return {
                anchors: words('^Born (to|in)$'),
                classes: words('\\b19[89]\\d\\b'),
                neg: words('[^a-z0-9 ]'),
                quants: words('a+?b{2,}c*d{3}e{1,2}f?'),
                groups: words('(?<y>19\\d\\d)-(?:0[1-9]|1[0-2])(?=x)(?!y)'),
                top: words('colou?r|grey'),
                escapes: words('\\x41\\u00e9\\.\\1'),
                unicode: words('\\p{L}'),
                errs: ['(Live', 'Live)', '*Born', '[A-Z', 'a{3,1}', 'River\\', '(?x)', '[z-a]', 'a**', '^*'].map(p => [p, R.diagnose(p)]),
                validNone: R.diagnose('^Born (to|in)'),
            };
        });
        expect(r.anchors).toEqual([
            '0|^|the start of the cell', '0|Born |the text “Born␣”', '0|(to|in)|group 1, holding:',
            '1||either', '2|to|the text “to”', '1|||or', '2|in|the text “in”', '0|$|the end of the cell',
        ]);
        expect(r.classes).toEqual(['0|\\b|a word edge', '0|19|the text “19”', '0|[89]|one of: 8, 9',
            '0|\\d|a digit (0–9)', '0|\\b|a word edge']);
        expect(r.neg).toEqual(['0|[^a-z0-9 ]|any character except: a–z, 0–9, a space']);
        expect(r.quants).toEqual([
            '0|a+?|the text “a” — one or more times, as few as possible', '0|b{2,}|the text “b” — 2 or more times',
            '0|c*|the text “c” — any number of times, also none', '0|d{3}|the text “d” — exactly 3 times',
            '0|e{1,2}|the text “e” — 1 to 2 times', '0|f?|the text “f” — optional',
        ]);
        expect(r.groups[0]).toBe('0|(?<y>19\\d\\d)|group “y”, holding:');
        expect(r.groups).toContain('0|(?:0[1-9]|1[0-2])|a group of:');
        expect(r.groups).toContain('0|(?=x)|followed by:');
        expect(r.groups).toContain('0|(?!y)|not followed by:');
        expect(r.top).toEqual(['0||either', '1|colo|the text “colo”', '1|u?|the text “u” — optional',
            '1|r|the text “r”', '0|||or', '1|grey|the text “grey”']);
        expect(r.escapes).toEqual(['0|\\x41|the character “A” (U+0041)', '0|\\u00e9|the character “é” (U+00E9)',
            '0|\\.|the text “.”', '0|\\1|the same text again as group 1']);
        expect(r.unicode[0], '\\p is a letter without the Unicode flag, and the row says so')
            .toBe('0|\\p|the letter “p” (\\p{…} needs the Unicode flag, which the filter does not use)');
        const err = Object.fromEntries(r.errs.map(([p, d]) => [p, d && [d.at, d.why]]));
        expect(err['(Live']).toEqual([0, 'This ( has no closing ).']);
        expect(err['Live)']).toEqual([4, 'This ) closes nothing: there is no ( before it.']);
        expect(err['*Born']).toEqual([0, '* repeats the piece before it, and there is none.']);
        expect(err['[A-Z']).toEqual([0, 'This [ has no closing ].']);
        expect(err['a{3,1}']).toEqual([1, 'In {3,1} the numbers are the wrong way round.']);
        expect(err['River\\']).toEqual([5, 'A \\ at the very end escapes nothing.']);
        expect(err['(?x)'][0]).toBe(0);
        expect(err['[z-a]']).toEqual([1, 'The range z-a runs backwards.']);
        expect(err['a**']).toEqual([2, '* repeats the piece before it, and there is none (it follows another repeat).']);
        expect(err['^*']).toEqual([1, '* repeats the piece before it, and there is none (^, $ and \\b cannot repeat).']);
        expect(r.validNone, 'a valid pattern has no diagnosis').toBe(null);
        // Every error the diagnosis claims is one the browser agrees about.
        const agree = await page.evaluate((ps) => ps.map(p => { try { new RegExp(p, 'i'); return false; } catch (e) { return true; } }),
            r.errs.map(([p]) => p));
        expect(agree.every(Boolean), 'each diagnosed pattern really is invalid').toBe(true);
    });
});

test.describe('the Rx card on a page (BoDeans artist-releases)', () => {
    let pageErrors;

    test.beforeEach(async ({ page }) => {
        pageErrors = collectPageErrors(page);
        await openWithRx(page);
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('valid: the pill, the reading and the notes; invalid: the spot, the reason, nothing filtered', async ({ page }) => {
        const card = page.locator('#mb-gfq-card');
        await setGlobal(page, '^Home (\\(|No)');
        await expect(card).toBeVisible();
        await expect(card.locator('.mb-tt-ajpill-ok')).toHaveText('Valid');
        await expect(card.locator('dl.mb-gfq-read dd').first()).toHaveText('the start of the cell');
        await expect(card.locator('dl.mb-gfq-read')).toContainText('group 1, holding:');
        await expect(card.locator('.mb-gfq-note')).toHaveText('Each cell is tested on its own: ^ and $ are its start and end. Case is ignored (Cc is off).');
        await page.locator('#mb-global-filter-exclude-label').click();
        await page.locator('#mb-global-filter-input').focus();
        await expect(card.locator('.mb-gfq-note')).toContainText('Rows that match are hidden (Ex).');
        await page.locator('#mb-global-filter-exclude-label').click();

        await setGlobal(page, 'Home (Col');
        await page.locator('#mb-global-filter-input').focus();
        await expect(card.locator('.mb-tt-ajpill-err')).toHaveText('Invalid');
        await expect(card.locator('.mb-gfq-bad'), 'the unclosed ( is the marked spot').toHaveText('(');
        await expect(card.locator('.mb-gfq-why')).toHaveText('This ( has no closing ).');
        await expect(card).toContainText('Write \\( for a bracket.');
        await expect.poll(() => status(page), SETTLE).toContain('Invalid regexp');
        expect(await shownCount(page), 'an invalid pattern filters nothing').toBe(AR.total);
    });

    test('an example filters, and Back brings the typed text and its rows back', async ({ page }) => {
        const card = page.locator('#mb-gfq-card');
        await setGlobal(page, 'home');
        await expect.poll(() => status(page), SETTLE).toContain('"home"');
        const homeRows = await shownCount(page);
        expect(homeRows, 'premise: "home" narrows').toBeLessThan(AR.total);
        await card.locator('[data-gfq-examples]').click();
        await expect(card.locator('.mb-gfq-ex button')).toHaveCount(9);
        await card.locator('.mb-gfq-ex button', { hasText: /^\^\$$/ }).click();
        await expect.poll(() => page.locator('#mb-global-filter-input').inputValue()).toMatch(/\^\$$/);
        await expect.poll(() => status(page), SETTLE).toContain('"^$"');
        expect(await shownCount(page), 'premise: the example filters differently').not.toBe(homeRows);
        const back = card.locator('[data-gfq-back]');
        await expect(back).toHaveText('↶ Back to home');
        await back.click();
        await expect.poll(() => status(page), SETTLE).toContain('"home"');
        expect(await shownCount(page), 'Back restores the rows too').toBe(homeRows);
        await expect(back, 'Back is spent').toHaveCount(0);
    });

    test('Esc closes the Examples list first, then the card; with Rx off there is no card', async ({ page }) => {
        const card = page.locator('#mb-gfq-card');
        await setGlobal(page, 'home');
        await card.locator('[data-gfq-examples]').click();
        await expect(card.locator('.mb-gfq-ex')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(card.locator('.mb-gfq-ex')).toHaveCount(0);
        await expect(card).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(card).toBeHidden();
        await page.locator('#mb-global-filter-rx-label').click();
        await page.locator('#mb-global-filter-input').click();
        await expect(card, 'plain text has no card').toBeHidden();
    });
});
