'use strict';

// "All errors" / "All warnings" in the ❌/⚠️ findings menus (org/bbp-parity.org,
// "Closing the matrix": BruceBaseParser's mismatch filter; mockup
// https://claude.ai/artifact/Mji5y7i2vZzTkK1WQ4JWi7, questions 4-7, all as
// recommended). One row per menu, first among the findings, counting ROWS;
// on, it keeps every row with a finding of its level in ANY column (an OR,
// where the single rows AND across columns), releases and greys that level's
// single rows, and shows a chip; the other level's filters and typed filters
// still AND. On every page, MusicBrainz too.
//
// What each test pins, and the neighbouring bug it must still catch:
//   - the OR: on a release whose two warnings sit in different columns and
//     never on one row, the two single ticks show 0 rows, "All warnings" both;
//   - the count is the rows (a row with two warnings counts once), from the
//     source rows, not the rendered ones;
//   - turning it on releases a ticked single row, and greys the rest;
//   - every way out (its own row, its chip's ✕, the menu's Clear row, "Clear
//     ALL filters") restores every row: the filter is in the filter cache's key.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const {
    findingRow, clickFinding, clickClearFindings, findingRowState, findingLevelRow, clickFindingLevel,
} = require('../support/findingsMenu');
const { bbYearFixture } = require('../support/bbFixture');

const SETTINGS = { sa_enable_caa_pics: false, sa_enable_relationships_column: false };
// Real live album, 2 mediums: one track whose recording links no work, two
// tracks with an undated live credit (findings-menus.spec.js).
const LIVE_URL = 'https://musicbrainz.org/release/20a52f17-ce0b-48bf-911e-9f962a518185';
const LIVE_FIXTURE = path.join(__dirname, 'release-tracks-live-date-flags.html');
// Synthetic release group: live-title errors and plain "-" separators across two sub-tables.
const RG_URL = 'https://musicbrainz.org/release-group/aaaaaaaa-0000-0000-0000-000000000002';
const RG_FIXTURE = path.join(__dirname, 'releasegroup-releases-live-titles.html');

/**
 * Loads a fixture and presses its "Show all" button.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} url
 * @param {string} fixture
 * @param {string} button - The button's data-label.
 * @param {Object} [settingsOverride]
 */
async function open(page, url, fixture, button, settingsOverride = {}) {
    await loadUserscriptPage(page, { url, fixtureFile: fixture, testMode: true, settingsOverride: { ...SETTINGS, ...settingsOverride } });
    await page.route(`${url}*`, (r) => r.fulfill({ path: fixture, contentType: 'text/html' }));
    await page.click(`button[data-label="${button}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

const openLive = (page) => open(page, LIVE_URL, LIVE_FIXTURE, 'Show all Tracks for Release');
const openRg = (page) => open(page, RG_URL, RG_FIXTURE, 'Show all Releases for ReleaseGroup');

/**
 * Rendered rows with a finding of each level, counted from the stamp (the
 * menus' own definition: `data-mb-findings` ids of that level), and all of them.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{all: number, error: number, warn: number, both: number}>}
 */
const levelRows = page => page.evaluate(() => {
    const out = { all: 0, error: 0, warn: 0, both: 0 };
    Array.from(document.querySelectorAll('table.tbl tbody tr')).filter(r => r.style.display !== 'none' && r.cells.length > 1).forEach((r) => {
        out.all++;
        const lv = new Set();
        r.querySelectorAll('td[data-mb-findings]').forEach(td => td.dataset.mbFindings.split(' ').forEach(id => {
            const lvl = window.__saTest.findingLevel(id);
            if (lvl) lv.add(lvl);
        }));
        if (lv.has('error')) out.error++;
        if (lv.has('warn')) out.warn++;
        if (lv.has('error') && lv.has('warn')) out.both++;
    });
    return out;
});

/**
 * Settles after the level row was clicked: its aria-checked reaches `checked`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {'warn'|'error'} level
 * @param {string} checked
 */
async function settleLevel(page, level, checked) {
    await expect.poll(async () => (await findingLevelRow(page, level))?.checked, { timeout: 15000 }).toBe(checked);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

let pageErrors;
test.beforeEach(({ page }) => {
    pageErrors = [];
    page.on('pageerror', e => pageErrors.push(String(e)));
});
test.afterEach(() => {
    expect(pageErrors, 'no script error').toEqual([]);
});

test.describe('findings menus: All errors / All warnings', () => {
    test('the row comes first and counts ROWS with a finding of its level', async ({ page }) => {
        await openLive(page);
        const want = await levelRows(page);
        expect(want.warn, 'the fixture has warnings').toBeGreaterThan(1);
        const row = await findingLevelRow(page, 'warn');
        expect(row).toMatchObject({ label: 'All warnings', count: want.warn, checked: 'false', first: true, greyed: [] });
        expect(row.title).toMatch(/with at least one warning, in any column[\s\S]*Only what is known so far counts/);
    });

    test('an OR across columns: the two single warnings show no row together, All warnings shows both kinds', async ({ page }) => {
        await openLive(page);
        const want = await levelRows(page);
        await clickFinding(page, 'no-work');
        await expect.poll(async () => (await findingRow(page, 'warn', 'no-work'))?.checked).toBe('true');
        await clickFinding(page, 'live-credit-nodate');
        await expect.poll(async () => (await findingRow(page, 'warn', 'live-credit-nodate'))?.checked).toBe('true');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        expect((await findingRowState(page)).visible, 'the single ticks AND: no row has both').toBe(0);
        // On: the ticked single rows are released, the rest greyed, every warned row shown.
        await clickFindingLevel(page, 'warn');
        await settleLevel(page, 'warn', 'true');
        expect((await findingRowState(page)).visible).toBe(want.warn);
        expect((await findingRow(page, 'warn', 'no-work')).checked, 'released').toBe('false');
        expect((await findingLevelRow(page, 'warn')).greyed.sort()).toEqual(['live-credit-nodate', 'no-work']);
        await expect(page.locator('#mb-findings-chips .mb-findings-chip[data-mb-finding-level="warn"]')).toHaveText(/⚠️ All warnings/);
        // A greyed single row does nothing (aria-disabled: Playwright will not
        // click it, a user's click still reaches it).
        await page.evaluate(() => document.querySelector('#mb-findings-warn-menu-btn-panel .mb-findings-menu-item[data-mb-finding-id="no-work"]').click());
        await page.evaluate(() => new Promise(r => setTimeout(r, 400)));
        expect((await findingRowState(page)).visible).toBe(want.warn);
    });

    test('every way out shows every row again: the row, its chip, the Clear row, Clear ALL filters', async ({ page }) => {
        await openLive(page);
        const total = (await findingRowState(page)).visible;
        const ways = [
            async () => clickFindingLevel(page, 'warn'),
            async () => page.click('#mb-findings-chips .mb-findings-chip[data-mb-finding-level="warn"] .mb-findings-chip-remove'),
            async () => clickClearFindings(page, 'warn'),
            async () => page.click('#mb-clear-all-filters-btn'),
        ];
        for (const out of ways) {
            await clickFindingLevel(page, 'warn');
            await settleLevel(page, 'warn', 'true');
            expect((await findingRowState(page)).visible).toBeLessThan(total);
            await out();
            await settleLevel(page, 'warn', 'false');
            expect((await findingRowState(page)).visible).toBe(total);
            await expect(page.locator('#mb-findings-chips .mb-findings-chip')).toHaveCount(0);
        }
    });

    test('the two levels AND: All errors and All warnings keep rows with both', async ({ page }) => {
        await openRg(page);
        const want = await levelRows(page);
        expect(want.error, 'the fixture has errors').toBeGreaterThan(0);
        expect((await findingLevelRow(page, 'error')).count).toBe(want.error);
        await clickFindingLevel(page, 'error');
        await settleLevel(page, 'error', 'true');
        expect((await findingRowState(page)).visible).toBe(want.error);
        expect(want.warn, 'the fixture has warnings too').toBeGreaterThan(0);
        await clickFindingLevel(page, 'warn');
        await settleLevel(page, 'warn', 'true');
        expect((await findingRowState(page)).visible).toBe(want.both);
    });
});

test.describe('findings menus: All errors on Brucebase', () => {
    test('a year table: every row with an error, in any of its columns', async ({ page }) => {
        const { url, file } = bbYearFixture('1972');
        await page.route(/^https?:\/\//, route => route.abort('blockedbyclient'));
        await loadUserscriptPage(page, {
            url, fixtureFile: path.join(__dirname, 'bb-year-1972-findings.html'), testMode: true,
            settingsOverride: { sa_enable_brucebase: true, sa_bb_year_pages: true, sa_foreign_mb_titles: false, sa_foreign_typography: false },
        });
        void file;
        await page.click('button[data-label="Show all events"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const want = await levelRows(page);
        expect(want.error, 'the fixture has errors before any page is read').toBeGreaterThan(0);
        await clickFindingLevel(page, 'error');
        await settleLevel(page, 'error', 'true');
        expect((await findingRowState(page)).visible).toBe(want.error);
    });
});
