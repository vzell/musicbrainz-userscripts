'use strict';

// The `eti-case` finding (org/ETI.org item 1): a trailing "(…)"/"[…]" whose
// FIRST word is an sa_findings_eti_keywords keyword written capitalized —
// "(Version 1)" instead of "(version 1)" — is extra title information written
// against https://musicbrainz.org/doc/Style/Titles#Extra_title_information.
// It is ETI (📊 "Title info - Extra title information" lists it) AND a ⚠️
// WARNING (menu row, 📊 "Findings - Warning", generic yellow tint).
//
// Fixture: "NOW Yearbook: The Vault 1986" (debug/ETI.html), three vinyl sides
// in three sub-tables. Its real titles carry no capitalized keyword under the
// default list — which this spec pins as "no false positive" — so the
// positive half adds "theme" to the list, making "I Do What I Do (Theme for
// 9 1/2 Weeks) (7” version)" the one Title cell that has it. That the list is
// user-configurable is part of the feature, so this is not a workaround.
//
// Guarantees pinned, each against its neighbour:
//   - detection: the defaults flag nothing; a capitalized keyword flags exactly
//     the cells whose parser output says so;
//   - count: the menu row counts ROWS, read off the page, not a literal alone;
//   - filter: clicking leaves exactly those rows in every sub-table; clicking
//     again restores every row;
//   - look: computed background and ::after, not only the attribute; the tint
//     setting turns the paint off and keeps the menu row;
//   - survival: a filter re-render (clones of the source rows) keeps the stamp;
//   - grammar: _parseTitleAnatomy() — first word only, alternative titles and
//     minor-word starts untouched.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { findingRow, clickFinding, findingRowState } = require('../support/findingsMenu');

const URL = 'https://musicbrainz.org/release/5cf63c93-e27e-4d98-81bc-9aba8b6861a7';
const FIXTURE = path.join(__dirname, 'release-tracks-eti-keywords.html');
const DEFAULT_KEYWORDS = 'version, single, album, soundtrack, live, rehearsal, studio, radio, remix, mix, edit, ' +
    'demo, instrumental, acoustic, extended, original, remaster, remastered, take, dub, reprise, mono, stereo, ' +
    'bonus, karaoke';
const WITH_THEME = { sa_findings_eti_keywords: `${DEFAULT_KEYWORDS}, theme` };
const FLAGGED_TITLE = 'I Do What I Do (Theme for 9 1/2 Weeks) (7” version)';
const WARN_BG = 'rgb(255, 243, 205)';   // #fff3cd, the default warn tint

/**
 * Loads the release fixture and runs "Show all Tracks".
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} [settingsOverride]
 */
async function openRelease(page, settingsOverride = {}) {
    await loadUserscriptPage(page, {
        url: URL,
        fixtureFile: FIXTURE,
        testMode: true,
        settingsOverride: { sa_enable_release_tracks: true, sa_uvd_autocollapse_threshold: 0, ...settingsOverride },
    });
    await page.click('button[data-label="Show all Tracks for Release"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/**
 * Every live cell carrying `eti-case`: its title text, level, computed
 * background and ::after glyph.
 *
 * @param {import('@playwright/test').Page} page
 */
const etiCaseCells = (page) => page.evaluate(() =>
    Array.from(document.querySelectorAll('table.tbl tbody td[data-mb-findings~="eti-case"]')).map((td) => ({
        title: (td.querySelector('a[href] bdi') || td).textContent.trim(),
        level: td.dataset.mbFinding || null,
        bg: getComputedStyle(td).backgroundColor,
        after: getComputedStyle(td, '::after').content,
    })));

/**
 * How many rows (across every table, visible or not) carry `eti-case` in
 * some cell — the number the menu row must show.
 *
 * @param {import('@playwright/test').Page} page
 */
const rowsWithFinding = (page) => page.evaluate(() =>
    Array.from(document.querySelectorAll('table.tbl tbody tr'))
        .filter((tr) => tr.querySelector('td[data-mb-findings~="eti-case"]')).length);

test.describe('eti-case finding', () => {
    test('the default keyword list flags nothing on real titles', async ({ page }) => {
        await openRelease(page);
        expect(await etiCaseCells(page)).toEqual([]);
        expect(await findingRow(page, 'warn', 'eti-case')).toBeUndefined();
    });

    test('a capitalized keyword is flagged, counted by row and tinted yellow with a ⚠️', async ({ page }) => {
        await openRelease(page, WITH_THEME);
        const cells = await etiCaseCells(page);
        expect(cells.map((c) => c.title)).toEqual([FLAGGED_TITLE]);
        cells.forEach((c) => {
            expect(c.level).toBe('warn');
            expect(c.bg).toBe(WARN_BG);
            expect(c.after).toBe('"⚠️"');
        });
        const n = await rowsWithFinding(page);
        expect(n).toBe(1);
        expect((await findingRow(page, 'warn', 'eti-case'))?.count).toBe(n);
    });

    test('it is ETI as well: 📊 lists the capitalized group and the Findings entry', async ({ page }) => {
        await openRelease(page, WITH_THEME);
        const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Title'));
        const byLabel = Object.fromEntries((sections || []).map((s) =>
            [s.label, Object.fromEntries(s.items.map((i) => [i.label, i.count]))]));
        expect(byLabel['Title info - Extra title information']['» ETI: Theme for 9 1/2 Weeks']).toBe(1);
        expect(byLabel['Findings - Warning']['⚠️ Extra title information starts uppercase']).toBe(1);
    });

    test('clicking the menu row filters every sub-table to its rows; again restores them', async ({ page }) => {
        await openRelease(page, WITH_THEME);
        const total = (await findingRowState(page)).visible;
        expect(total).toBeGreaterThan(1);
        await clickFinding(page, 'eti-case');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const filtered = await findingRowState(page, 'eti-case');
        expect(filtered.visible).toBe(1);
        expect(filtered.withFinding).toBe(filtered.visible);
        await clickFinding(page, 'eti-case');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        expect((await findingRowState(page)).visible, 'every row is back').toBe(total);
    });

    test('the tint setting turns the paint off but keeps the finding and its menu row', async ({ page }) => {
        await openRelease(page, { ...WITH_THEME, sa_findings_tint_eti_case: false });
        const cells = await etiCaseCells(page);
        expect(cells.length, 'still detected').toBe(1);
        expect(cells[0].level, 'not tinted').toBeNull();
        expect(cells[0].bg).not.toBe(WARN_BG);
        expect((await findingRow(page, 'warn', 'eti-case'))?.count, 'the menu still offers it').toBe(1);
    });

    test('the stamp survives a filter re-render (it is on the source rows)', async ({ page }) => {
        await openRelease(page, WITH_THEME);
        await page.fill('#mb-global-filter-input', '9 1/2 Weeks');
        await expect.poll(async () => (await etiCaseCells(page)).map((c) => c.level),
            { timeout: 15000, message: 'the re-rendered clone carries the stamp' }).toEqual(['warn']);
        await page.fill('#mb-global-filter-input', '');
        await expect.poll(async () => (await etiCaseCells(page)).length,
            { timeout: 15000, message: 'still one after the filter is cleared' }).toBe(1);
    });
});

test.describe('ETI grammar (_parseTitleAnatomy)', () => {
    /**
     * Parses titles in the page through `__saTest.parseTitleAnatomy`,
     * keeping only the ETI fields.
     *
     * @param {import('@playwright/test').Page} page
     * @param {string[]} titles
     */
    const parse = (page, titles) => page.evaluate((ts) => Object.fromEntries(ts.map((t) => {
        const a = window.__saTest.parseTitleAnatomy(t);
        return [t, { eti: a.eti, etiCase: a.etiCase }];
    })), titles);

    test('first word capitalized is eti-case; last word lowercase is ETI; the rest is untouched', async ({ page }) => {
        await loadUserscriptPage(page, { url: URL, fixtureFile: FIXTURE, testMode: true });
        const r = await parse(page, [
            'Song (Version 1)', 'Song (Single Version)', 'Song (LIVE)', 'Song [Radio Edit]',
            'Song (Moonitor remix)', 'Song (Moonitor Remix)', 'Song (the original mix)',
            "Cecilia (Does Your Mother Know You're Out)", 'Nancy (with the Laughing Face)',
            'Song (Live at Wembley) (single version)',
        ]);
        expect(r['Song (Version 1)']).toEqual({ eti: ['Version 1'], etiCase: ['Version 1'] });
        expect(r['Song (Single Version)']).toEqual({ eti: ['Single Version'], etiCase: ['Single Version'] });
        expect(r['Song (LIVE)']).toEqual({ eti: ['LIVE'], etiCase: ['LIVE'] });
        expect(r['Song [Radio Edit]']).toEqual({ eti: ['Radio Edit'], etiCase: ['Radio Edit'] });
        expect(r['Song (Moonitor remix)']).toEqual({ eti: ['Moonitor remix'], etiCase: [] });
        // First word only: a capitalized LAST keyword is neither ETI nor flagged.
        expect(r['Song (Moonitor Remix)']).toEqual({ eti: [], etiCase: [] });
        // A minor-word start ending in a keyword is ETI.
        expect(r['Song (the original mix)']).toEqual({ eti: ['the original mix'], etiCase: [] });
        expect(r["Cecilia (Does Your Mother Know You're Out)"]).toEqual({ eti: [], etiCase: [] });
        expect(r['Nancy (with the Laughing Face)']).toEqual({ eti: [], etiCase: [] });
        expect(r['Song (Live at Wembley) (single version)']).toEqual({
            eti: ['Live at Wembley', 'single version'], etiCase: ['Live at Wembley'],
        });
    });

    test('an empty keyword list keeps lowercase-only ETI and flags nothing', async ({ page }) => {
        await loadUserscriptPage(page, { url: URL, fixtureFile: FIXTURE, testMode: true,
            settingsOverride: { sa_findings_eti_keywords: '' } });
        const r = await parse(page, ['Song (Version 1)', 'Song (Moonitor remix)', 'Song (single version)']);
        expect(r['Song (Version 1)']).toEqual({ eti: [], etiCase: [] });
        expect(r['Song (Moonitor remix)']).toEqual({ eti: [], etiCase: [] });
        expect(r['Song (single version)']).toEqual({ eti: ['single version'], etiCase: [] });
    });
});
