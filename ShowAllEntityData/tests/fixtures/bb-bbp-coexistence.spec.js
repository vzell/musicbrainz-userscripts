'use strict';

// BruceBaseParser and ShowAllEntityData on the same Brucebase page
// (org/bbp-parity.org, "Coexistence"; vzell's decisions of 2026-11-19, mockup
// https://claude.ai/artifact/Mji5y7i2vZzTkK1WQ4JWi7, questions 1-3, all as
// recommended). BruceBaseParser changes a page at its load (it wraps a year
// page's entries, marks tab labels and tags), so a table made from it would
// be empty or wrong: SAED stands aside and says why, when it makes its
// buttons and at every press.
//
// Two ways in:
//   - the real BruceBaseParser (vzell's checkout, ~/git/userscripts/
//     BruceBaseParser, or BBP_USERSCRIPT=…); these cases are skipped where it
//     is not on the machine, and show the page changes themselves;
//   - tests/fixtures/thirdPartyScripts/bbp-start-mark.js, which does only what
//     BruceBaseParser does first (div#bb-tooltip): the guard, everywhere.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { BB_YEAR_BUTTON } = require('../support/bbFixture');
const { waitForRenderComplete } = require('../support/browser');

const BB = 'https://brucebase.wikidot.com/';
const BBP = process.env.BBP_USERSCRIPT || path.join(os.homedir(), 'git/userscripts/BruceBaseParser/BruceBaseParser.user.js');
const HAVE_BBP = fs.existsSync(BBP);
const MARK = path.join(__dirname, 'thirdPartyScripts', 'bbp-start-mark.js');
const YEAR = { url: `${BB}2016`, file: path.join(__dirname, 'bb-year-2016-findings.html'), button: BB_YEAR_BUTTON };
const SONG = { url: `${BB}song:dinner-at-eight`, file: path.join(__dirname, 'bb-findings', 'song_dinner-at-eight.html'), button: 'Show the song' };
const VENUE = { url: `${BB}venue:stone-pony-asbury-park-nj`, file: path.join(__dirname, 'bb-findings', 'venue_stone-pony-asbury-park-nj.html'), button: 'Show the venue' };
const NOTICE = '#mb-saed-bar [data-mb-area="actions"] .mb-bb-bbp-notice';

/**
 * Loads a Brucebase fixture with SAED and, optionally, another script before
 * or after it; every other request refused.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{url: string, file: string}} at
 * @param {Array<{path: string, when: string}>} [extra]
 * @returns {Promise<void>}
 */
async function load(page, at, extra = []) {
    await page.setViewportSize({ width: 1500, height: 1100 });
    await page.route(/^https?:\/\//, route => route.abort('blockedbyclient'));
    await loadUserscriptPage(page, {
        url: at.url, fixtureFile: at.file, testMode: true, extraScripts: extra,
        settingsOverride: {
            sa_enable_brucebase: true, sa_bb_year_pages: true, sa_bb_detail_pages: true,
            sa_foreign_mb_titles: false, sa_foreign_typography: false,
        },
    });
    // BruceBaseParser is an async IIFE: let its synchronous start run.
    await page.evaluate(() => new Promise(r => setTimeout(r, 300)));
}

/**
 * The year page's entry headings where the year table reads them
 * (`_bbYearEntries()`: direct `<p>` children of #page-content that start with
 * a date).
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<number>}
 */
const entryHeads = page => page.evaluate(() => Array.from(document.querySelectorAll('#page-content > p'))
    .filter(p => /^\s*\d{4}-\d{2}-\d{2}/.test(p.textContent)).length);

let pageErrors;
test.beforeEach(({ page }) => {
    pageErrors = [];
    page.on('pageerror', e => pageErrors.push(String(e)));
});
test.afterEach(() => {
    expect(pageErrors, 'no script error').toEqual([]);
});

test.describe('BruceBaseParser on the same page: SAED stands aside (bbp-parity, coexistence)', () => {
    test('BruceBaseParser\'s start mark before SAED: the notice instead of the buttons, its hover text says why', async ({ page }) => {
        await load(page, YEAR, [{ path: MARK, when: 'before' }]);
        const notice = page.locator(NOTICE);
        await expect(notice).toHaveText('🎛 BruceBaseParser is on this page');
        expect(await notice.getAttribute('title')).toMatch(/would be empty or wrong[\s\S]*Switch BruceBaseParser off/);
        await expect(page.locator(`#mb-saed-bar button[data-label="${YEAR.button}"]`)).toHaveCount(0);
    });

    test('BruceBaseParser started after SAED: the press makes no table, the actions stand aside', async ({ page }) => {
        await load(page, VENUE, [{ path: MARK, when: 'after' }]);
        const btn = page.locator(`#mb-saed-bar button[data-label="${VENUE.button}"]`);
        await expect(btn, 'the buttons were made before BruceBaseParser started').toHaveCount(1);
        await btn.click();
        await expect(page.locator(NOTICE)).toHaveCount(1);
        await expect(page.locator(`#mb-saed-bar button[data-label="${VENUE.button}"]`)).toHaveCount(0);
        await page.evaluate(() => new Promise(r => setTimeout(r, 500)));
        await expect(page.locator('table.tbl')).toHaveCount(0);
        await expect(page.locator('section.mb-sb-card')).toHaveCount(0);
    });

    test('without BruceBaseParser: the buttons as always, no notice', async ({ page }) => {
        await load(page, YEAR);
        await expect(page.locator(`#mb-saed-bar button[data-label="${YEAR.button}"]`)).toHaveCount(1);
        await expect(page.locator(NOTICE)).toHaveCount(0);
        expect(await entryHeads(page), 'the year table\'s entries are where it reads them').toBe(4);
    });

    test('on MusicBrainz an element of that id changes nothing: the button, and its press makes the table', async ({ page }) => {
        const shell = path.join(__dirname, '..', 'snapshots', 'releasegroup-releases', 'raw.html');
        await page.route(/^https?:\/\//, route => route.abort('blockedbyclient'));
        await page.route('https://musicbrainz.org/release-group/**', route => route.fulfill({ path: shell, contentType: 'text/html' }));
        await loadUserscriptPage(page, {
            url: 'https://musicbrainz.org/release-group/f83d2211-dd81-4b1e-9a02-e89733891e1c',
            fixtureFile: shell, testMode: true, extraScripts: [{ path: MARK, when: 'before' }],
        });
        const btn = page.locator('#mb-saed-bar button[data-label="Show all Releases for ReleaseGroup"]');
        await expect(btn).toHaveCount(1);
        await btn.click();
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await expect(page.locator(NOTICE)).toHaveCount(0);
        expect(await page.locator('table.tbl tbody tr').count()).toBeGreaterThan(0);
    });
});

test.describe('the real BruceBaseParser and SAED (bbp-parity, coexistence)', () => {
    test.skip(!HAVE_BBP, `BruceBaseParser is not at ${BBP} (set BBP_USERSCRIPT)`);

    test('a year page: BruceBaseParser wraps its entries, SAED shows the notice and makes no empty table', async ({ page }) => {
        await load(page, YEAR, [{ path: BBP, when: 'before' }]);
        await expect(page.locator('#page-content div.bb-section-processed').first(), 'BruceBaseParser changed the page').toBeAttached();
        expect(await entryHeads(page), 'no entry is left where the year table reads them').toBe(0);
        await expect(page.locator(NOTICE)).toHaveCount(1);
        await expect(page.locator(`#mb-saed-bar button[data-label="${YEAR.button}"]`)).toHaveCount(0);
        await expect(page.locator('table.tbl')).toHaveCount(0);
    });

    test('a year page, BruceBaseParser second: the buttons first, the press stands aside', async ({ page }) => {
        await load(page, YEAR, [{ path: BBP, when: 'after' }]);
        await expect(page.locator('#page-content div.bb-section-processed').first()).toBeAttached();
        await page.locator(`#mb-saed-bar button[data-label="${YEAR.button}"]`).click();
        await expect(page.locator(NOTICE)).toHaveCount(1);
        await page.evaluate(() => new Promise(r => setTimeout(r, 500)));
        await expect(page.locator('table.tbl')).toHaveCount(0);
    });

    test('a song page: BruceBaseParser boxes its tags, SAED shows the notice', async ({ page }) => {
        await load(page, SONG, [{ path: BBP, when: 'before' }]);
        await expect(page.locator('.bb-tags-box, .bb-tags-warn-box').first(), 'BruceBaseParser changed the page').toBeAttached();
        await expect(page.locator(NOTICE)).toHaveCount(1);
        await expect(page.locator(`#mb-saed-bar button[data-label="${SONG.button}"]`)).toHaveCount(0);
    });
});
