'use strict';

// Apollo findings, batch 4 (org/majkinetor.org; docs/claude/findings.md,
// "A release-wide finding: a ℗ notice no relationship has"): release-notice,
// Group Therapy's notice parser on a release's annotation. Mockup
// https://claude.ai/artifact/7X3bbpdfmSuqr4jU85Q4Bn (variant A, approved
// 2026-11-20 with every recommendation).
//
// Fixtures: scripts/make-release-notice-fixtures.py, from the real raw page of
// "Blinded by the Light" (65f35399), whose annotation ends with
// "℗ 1973 CBS, Inc. / Manufactured by …" and has no ℗ relationship anywhere.
//
// What each test pins, and the neighbouring bug it must still catch:
//   - FLAGGED, both renders: exactly the ℗ line is wrapped and tinted, with
//     a ⚠️; the © line above it ("Copyright © 1972 LAUREL CANYON …") is not
//     (℗ only, question 3). A rule that also read © lines, or wrapped every
//     line, fails. The Credits render removes the tracklist, so a reader that
//     looked at the page AFTER the render would see no recordings at all;
//     the facts must still say "2 recordings".
//   - a ℗ on ONE recording (payload), on the release itself, a medium not all
//     on the page: nothing flagged. A rule that wanted "every recording", or
//     ignored the release's own relationships, or flagged on unknown, fails.
//   - without the payload, the page's own lists: flagged; with a native ℗
//     list in a track row: not. A reader that only knew the payload flags
//     nothing in the first, and everything in the second.
//   - the menu: a "This release" group whose row shows the line (scrolls,
//     opens the collapsed Annotation section, flashes, card after 0.5 s);
//     the ⚠️ count adds it; no Clear row under it alone.
//   - the card: hover, grace, Esc; the tint switch: no tint, no card, the
//     menu row stays; survival of a filter pass (no re-stamp needed).
//   - the notice parser through the shipping function.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { typeGlobalFilter, waitForFilterSettled } = require('../support/filterSortAssertions');
const { findingRow, findingsMenuState, FINDINGS_MENU_BUTTON } = require('../support/findingsMenu');
const { clickToolbarItem } = require('../support/toolbarMenu');

const URL = 'https://musicbrainz.org/release/65f35399-f638-4295-8c78-0ddea0e36ed8';
const fx = (k) => path.join(__dirname, `release-notice${k}.html`);
const WARN_BG = 'rgb(255, 243, 205)';   // #fff3cd
const TRACKS = 'Show all Tracks for Release';
const CREDITS = 'Show all Credits for Release';

/**
 * Loads one fixture (MusicBrainz's own bundles blocked, every page fetch
 * answered with the same fixture, ws/2 refused) and presses a button.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} fixture
 * @param {{settings?: Object, button?: ?string}} [opts] - `button: null` presses nothing.
 */
async function open(page, fixture, { settings = {}, button = TRACKS } = {}) {
    await page.context().route('https://static.metabrainz.org/**', (route) => route.abort('blockedbyclient'));
    await loadUserscriptPage(page, {
        url: URL, fixtureFile: fixture, testMode: true,
        settingsOverride: { sa_enable_relationship_tables: true, sa_enable_release_tracks: true,
            sa_sidebar_in_rel_tables: false, ...settings },
    });
    await page.route('https://musicbrainz.org/ws/2/**', (route) => route.fulfill({ status: 404, body: '' }));
    await page.route(/^https:\/\/musicbrainz\.org\/(?!ws\/)/, (route) => route.fulfill({ path: fixture, contentType: 'text/html' }));
    await page.route('https://coverartarchive.org/**', (route) => route.fulfill({ status: 404, body: '' }));
    if (!button) return;
    await page.click(`button[data-label="${button}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/**
 * The annotation's notice marks: each wrapped line's text, level, look.
 *
 * @param {import('@playwright/test').Page} page
 */
const notices = (page) => page.evaluate(() => Array.from(document.querySelectorAll('#content div.annotation-body span.mb-release-notice'))
    .map((s) => ({
        text: s.textContent.trim(),
        level: s.dataset.mbFinding || null,
        findings: s.dataset.mbFindings || '',
        bg: getComputedStyle(s).backgroundColor,
        glyph: getComputedStyle(s, '::after').content,
    })));

/**
 * Waits until `ms` of the page's own time have passed: the card's timers
 * (the 0.5 s delay after a menu row, the 350 ms grace) run there.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} ms
 */
async function waitPageMs(page, ms) {
    const t0 = await page.evaluate(() => performance.now());
    await page.waitForFunction(([t, d]) => performance.now() - t >= d, [t0, ms]);
}

/** @param {import('@playwright/test').Page} page */
const relFindings = (page) => page.evaluate(() => window.__saTest.releaseFindings());

/** @param {import('@playwright/test').Page} page */
const card = (page) => page.evaluate(() => {
    const c = document.getElementById('mb-release-notice-card');
    return c && c.style.display === 'block' ? c.textContent : null;
});

/**
 * The WARNING panel's group structure, in order: heads, rows (by finding id
 * or class) and notes.
 *
 * @param {import('@playwright/test').Page} page
 */
const panelOutline = (page) => page.evaluate((id) => {
    const panel = document.getElementById(`${id}-panel`);
    if (!panel) return null;
    return Array.from(panel.children).map((el) => {
        if (el.classList.contains('mb-findings-group-head')) return `head:${el.textContent}`;
        if (el.classList.contains('mb-findings-group-rule')) return 'rule';
        if (el.classList.contains('mb-findings-group-empty')) return 'empty';
        if (el.classList.contains('mb-findings-clear-item')) return 'clear';
        if (el.classList.contains('mb-findings-style-item')) return 'style';
        if (el.classList.contains('mb-findings-level-item')) return 'level';
        return el.dataset.mbFindingId ? `row:${el.dataset.mbFindingId}` : el.className;
    });
}, FINDINGS_MENU_BUTTON.warn);

const LINE = '℗ 1973 CBS, Inc. / Manufactured by Columbia Records / CBS, Inc. / 51 W. 52 Street, New York, N.Y. / ® “Columbia,” [Columbia Logo] Marcas Reg.';

test.describe('release-notice', () => {
    test('Tracklist render: only the ℗ line is marked, the © line is not', async ({ page }) => {
        await open(page, fx(''));
        const n = await notices(page);
        expect(n.map((x) => x.text.replace(/\s+/g, ' '))).toEqual([LINE]);
        expect(n[0]).toEqual(expect.objectContaining({ level: 'warn', findings: 'release-notice', bg: WARN_BG }));
        expect(n[0].glyph).toContain('⚠️');
        const html = await page.evaluate(() => document.querySelector('#content div.annotation-body').innerHTML);
        expect(html, 'the © line is still there, unmarked').toMatch(/Copyright ©<br>\s*1972 LAUREL CANYON/);
        expect(await relFindings(page)).toEqual([{ text: expect.stringMatching(/^℗ 1973 CBS, Inc\. \/ Manufactured/), holder: 'CBS, Inc.', recs: 2 }]);
        const row = await findingRow(page, 'warn', 'release-notice');
        expect(row.count).toBe(1);
        expect(row.label).toContain('℗ notice with no relationship');
        expect(row.label).toContain('CBS, Inc. · click to show it in the annotation');
    });

    test('Credits render: the tracklist is gone, the recordings were read before it', async ({ page }) => {
        await open(page, fx(''), { button: CREDITS });
        expect(await page.evaluate(() => document.querySelectorAll('table.tbl.medium').length), 'no tracklist in this render').toBe(0);
        const n = await notices(page);
        expect(n.length).toBe(1);
        expect(n[0].level).toBe('warn');
        expect(await relFindings(page)).toEqual([expect.objectContaining({ holder: 'CBS, Inc.', recs: 2 })]);
    });

    for (const [k, why] of [
        ['-rec-rel', 'a ℗ on one of the two recordings'],
        ['-own-rel', 'a ℗ on the release itself'],
        ['-incomplete', 'a medium not all on the page (track_count 3, two tracks)'],
        ['-nopayload-rec', 'no payload, a native ℗ list in a track row'],
    ]) {
        test(`not flagged: ${why}`, async ({ page }) => {
            await open(page, fx(k));
            expect(await notices(page)).toEqual([]);
            expect(await relFindings(page)).toEqual([]);
            expect(await findingRow(page, 'warn', 'release-notice')).toBeUndefined();
        });
    }

    test('without the payload, the page\'s own lists are read: flagged', async ({ page }) => {
        await open(page, fx('-nopayload'));
        expect(await page.evaluate(() => window.__saTest.releasePhonoFacts())).toEqual({ complete: true, own: false, recs: 2, onRecs: 0 });
        expect((await notices(page)).map((x) => x.level)).toEqual(['warn']);
    });

    test('without the payload, Credits render: the tracklist was read at the press, before it was removed', async ({ page }) => {
        await open(page, fx('-nopayload-rec'), { button: CREDITS });
        expect(await page.evaluate(() => document.querySelectorAll('table.tbl.medium').length), 'no tracklist in this render').toBe(0);
        expect(await page.evaluate(() => window.__saTest.releasePhonoFacts())).toEqual({ complete: true, own: false, recs: 2, onRecs: 1 });
        expect(await notices(page), 'the ℗ in track 2\'s row still counts').toEqual([]);
    });

    test('the menu: a "This release" group above "In the tables"; the count adds it', async ({ page }) => {
        await open(page, fx(''));
        const outline = await panelOutline(page);
        expect(outline.slice(0, 4)).toEqual(['head:This release', 'row:release-notice', 'rule', 'head:In the tables']);
        const state = await findingsMenuState(page, 'warn');
        const tableRows = state.rows.filter((r) => r.id !== 'release-notice').reduce((s, r) => s + r.count, 0);
        expect(state.label).toBe(`⚠️ ${tableRows + 1}`);
        // No table finding: the note and no Clear row; with one, the reverse.
        const hasTable = state.rows.some((r) => r.id !== 'release-notice');
        expect({ empty: outline.includes('empty'), clear: outline.includes('clear') }).toEqual({ empty: !hasTable, clear: hasTable });
        expect(state.title).toContain('About this release: 1 ℗ notice in the annotation with no relationship.');
    });

    test('the menu row opens the collapsed Annotation, flashes the line and shows its card', async ({ page }) => {
        await open(page, fx(''));
        const collapsed = () => page.evaluate(() => {
            const s = document.querySelector('span.mb-release-notice');
            return !s.checkVisibility();
        });
        expect(await collapsed(), 'the Annotation h2 starts collapsed after a render').toBe(true);
        await clickToolbarItem(page, '.mb-findings-menu-item[data-mb-finding-id="release-notice"]');
        expect(await collapsed()).toBe(false);
        expect(await page.evaluate(() => document.querySelector('span.mb-release-notice').classList.contains('mb-rn-flash'))).toBe(true);
        await expect.poll(() => card(page), { timeout: 3000 }).toContain('Holder as read: CBS, Inc.');
        const text = await card(page);
        expect(text).toContain('⚠️ ℗ notice with no relationship');
        expect(text).toContain('Neither the release nor any of its 2 recordings has a phonographic copyright (℗) relationship.');
        expect(text).toContain('Warning');
        expect(text).toContain("rule from majkinetor's Group Therapy · no requests");
        expect(await page.evaluate((id) => document.getElementById(`${id}-panel`).style.display, FINDINGS_MENU_BUTTON.warn)).toBe('none');
        await page.keyboard.press('Escape');
        expect(await card(page)).toBeNull();
    });

    test('hover shows the card, leaving hides it after the grace period', async ({ page }) => {
        await open(page, fx(''));
        await clickToolbarItem(page, '.mb-findings-menu-item[data-mb-finding-id="release-notice"]');
        await expect.poll(() => card(page), { timeout: 3000 }).not.toBeNull();
        await page.keyboard.press('Escape');
        await page.hover('span.mb-release-notice');
        expect(await card(page)).toContain('The annotation says “℗ 1973 CBS, Inc.');
        await page.mouse.move(2, 2);
        expect(await card(page), 'still up during the grace period').not.toBeNull();
        await expect.poll(() => card(page), { timeout: 2000 }).toBeNull();
        await page.focus('span.mb-release-notice');
        expect(await card(page), 'keyboard focus opens it').not.toBeNull();
        await page.keyboard.press('Escape');
        expect(await card(page)).toBeNull();
        await page.hover('span.mb-release-notice');
        expect(await card(page)).not.toBeNull();
        await page.click('span.mb-release-notice');
        expect(await card(page), 'a click toggles: the card hover opened closes').toBeNull();
        // Unfocused again, so the next press focuses the line before its
        // click: that focus must open nothing, or the click closes it again.
        await page.evaluate(() => document.activeElement && document.activeElement.blur());
        await page.click('span.mb-release-notice');
        expect(await card(page), 'and opens again').not.toBeNull();
    });

    test('tint off: the line is not marked and has no card; the menu row stays', async ({ page }) => {
        await open(page, fx(''), { settings: { sa_findings_tint_release_notice: false } });
        const n = await notices(page);
        expect(n.length).toBe(1);
        expect(n[0].level).toBeNull();
        expect(n[0].bg).not.toBe(WARN_BG);
        expect(n[0].glyph).not.toContain('⚠️');
        expect((await findingRow(page, 'warn', 'release-notice')).count).toBe(1);
        await clickToolbarItem(page, '.mb-findings-menu-item[data-mb-finding-id="release-notice"]');
        // The row shows a card 0.5 s after its click, when the line has one.
        await waitPageMs(page, 800);
        expect(await card(page)).toBeNull();
    });

    test('survives a filter pass: the line and the row stay', async ({ page }) => {
        await open(page, fx(''));
        await waitForFilterSettled(page, () => typeGlobalFilter(page, 'stereo'));
        const tracks = await page.evaluate(() => Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((r) => r.style.display !== 'none' && r.querySelector('a[href*="/recording/"]'))
            .map((r) => r.querySelector('a[href*="/recording/"]').textContent.trim()));
        expect(tracks, 'the filter narrowed the tracklist to the stereo track').toEqual(['Blinded by the Light (stereo)']);
        expect((await notices(page)).map((x) => x.level)).toEqual(['warn']);
        expect((await findingRow(page, 'warn', 'release-notice')).count).toBe(1);
    });

    test('the notice parser, through the shipping function', async ({ page }) => {
        await open(page, fx(''), { button: null });
        const got = await page.evaluate(() => {
            const f = window.__saTest.rnNoticeOf;
            return {
                discogs: f('Phonographic Copyright (p) –  CBS Inc.'),
                plain: f('℗ 1975 CBS Inc.'),
                parenP: f('(P) 1980 Virgin Records Ltd'),
                bullet: f('- ℗ 1975 CBS Inc.'),
                compound: f('© 1975 Laurel Canyon Music Ltd. / ℗ 1975 CBS Inc.'),
                both: f('℗ & © 1982 CBS Inc.'),
                copyrightOnly: f('© 1974 Laurel Canyon Music Ltd.'),
                prose: f('Lyrics by Bruce Springsteen. Copyright ©'),
                midSentence: f('The sleeve says ℗ 1975 CBS Inc. on the back.'),
                noHolder: f('℗ 1975'),
                twoYears: f('℗ 1973, 1975 Columbia'),
            };
        });
        expect(got).toEqual({
            discogs: { text: 'Phonographic Copyright (p) – CBS Inc.', holder: 'CBS Inc.' },
            plain: { text: '℗ 1975 CBS Inc.', holder: 'CBS Inc.' },
            parenP: { text: '(P) 1980 Virgin Records Ltd', holder: 'Virgin Records Ltd' },
            bullet: { text: '℗ 1975 CBS Inc.', holder: 'CBS Inc.' },
            compound: { text: '℗ 1975 CBS Inc.', holder: 'CBS Inc.' },
            both: { text: '℗ & © 1982 CBS Inc.', holder: 'CBS Inc.' },
            copyrightOnly: null,
            prose: null,
            midSentence: null,
            noHolder: null,
            twoYears: { text: '℗ 1973, 1975 Columbia', holder: 'Columbia' },
        });
    });
});
