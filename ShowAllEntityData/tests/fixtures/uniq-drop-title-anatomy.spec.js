'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// Feature: the 📊 "Title info - …" sections on every "Title" column, following
// https://musicbrainz.org/doc/Style/Titles, and "Rating info - Presence" on
// every "Rating" column. All Title entries come from one _parseTitleAnatomy()
// pass over the cell's own title element (_findCellTitleEl()).
//
// Both fixtures are real release pages saved by scripts/fetch-release-fixture.js:
//   - "Live and Swingin': The Ultimate Rat Pack Collection" — four medleys
//     ("Medley:", "Medley 1:", "Medley 2:", one more "Medley:") joining 2, 3,
//     13 and 7 titles; "Fanfare & Introduction" and three others link no work;
//     "Birth of the Blues (reprise)" carries ETI; "Nancy (with the Laughing
//     Face)" is a song title whose lowercase "with" must NOT read as ETI.
//   - "Goodbye to the Island" — "I Believe in Your Sweet Love (single
//     version)" (ETI), and 4 of 13 tracks rated (anonymous page: the stars
//     show the average rating, `.current-rating`).
const MEDLEY_URL = 'https://musicbrainz.org/release/a9a3b139-cf22-4d28-801e-3f3d49521d0e';
const MEDLEY_FIXTURE = path.join(__dirname, 'release-tracks-medley.html');
const ETI_URL = 'https://musicbrainz.org/release/ef7147b8-19ac-4c2c-a9e1-a1136a6ffce4';
const ETI_FIXTURE = path.join(__dirname, 'release-tracks-eti.html');
// org/ETI.org item 2 — groups that do not start lowercase but END in a
// lowercase sa_findings_eti_keywords word are ETI too:
//   - "Seren E.P." — "Situations Like These (Moonitor remix)", "Everlasting
//     (Psyche remix)" beside plain lowercase "(album version)", "(edit)",
//     "(single version)".
//   - "NOW Yearbook: The Vault 1986" (debug/ETI.html) — "(U.S. remix)", and
//     "I Do What I Do (Theme for 9 1/2 Weeks) (7” version)", whose "(7”
//     version)" is ETI while "(Theme for 9 1/2 Weeks)" before it stays an
//     alternative title.
const REMIX_URL = 'https://musicbrainz.org/release/f6215982-62e1-4b81-b88f-754dca0da149';
const REMIX_FIXTURE = path.join(__dirname, 'release-tracks-remix-eti.html');
const NOW86_URL = 'https://musicbrainz.org/release/5cf63c93-e27e-4d98-81bc-9aba8b6861a7';
const NOW86_FIXTURE = path.join(__dirname, 'release-tracks-eti-keywords.html');

/**
 * Loads a release fixture and runs "Show all Tracks".
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} url
 * @param {string} fixtureFile
 * @param {Object} [settingsOverride]
 */
async function openRelease(page, url, fixtureFile, settingsOverride = {}) {
    await loadUserscriptPage(page, {
        url,
        fixtureFile,
        testMode: true,
        // Auto-collapse off: the medley release's "Title info - Title" holds
        // more than the default 15 entries and would open collapsed, and these
        // tests tick entries in it. Collapsing is uvd-grouped-sections.spec.js'
        // business, not this file's.
        settingsOverride: { sa_enable_release_tracks: true, sa_uvd_autocollapse_threshold: 0, ...settingsOverride },
    });
    await page.click('button[data-label="Show all Tracks for Release"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/**
 * Opens a column's 📊 panel and returns its sections as `{label: {item: count}}`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} colName
 * @returns {Promise<Object<string, Object<string, number>>>}
 */
async function sectionsOf(page, colName) {
    const sections = await page.evaluate((c) => window.__saTest.getUniqDropSections(c), colName);
    return Object.fromEntries((sections || []).map((s) => [s.label, Object.fromEntries(s.items.map((i) => [i.label, i.count]))]));
}

/**
 * Ticks one 📊 entry by its exact label and waits for the re-filter.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} label
 */
async function tick(page, label) {
    await page.locator('.mb-col-uniq-item').filter({ hasText: label }).first().click();
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/**
 * Title-element text of every visible row, plus each row's highlighted runs
 * inside it.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<{title: string, marks: string[]}>>}
 */
const visibleTitles = (page) => page.evaluate(() => {
    const out = [];
    document.querySelectorAll('table.tbl').forEach((tbl) => {
        const ths = Array.from(tbl.querySelectorAll('thead tr:first-child th'));
        const idx = ths.findIndex((t) => t.dataset.colName === 'Title');
        if (idx < 0) return;
        tbl.querySelectorAll('tbody tr').forEach((tr) => {
            if (tr.style.display === 'none' || !tr.cells[idx]) return;
            const bdi = tr.cells[idx].querySelector('a[href] bdi');
            if (!bdi) return;
            out.push({
                title: bdi.textContent,
                marks: Array.from(bdi.querySelectorAll('.mb-column-filter-highlight')).map((m) => m.textContent),
            });
        });
    });
    return out;
});

test.describe('📊 Title info sections', () => {
    test('medley release: medley / multi-title / count / single-title / work / ETI counts', async ({ page }) => {
        await openRelease(page, MEDLEY_URL, MEDLEY_FIXTURE);
        const s = await sectionsOf(page, 'Title');

        expect(s['Title info - Medley']).toEqual({ '🎶 medley': 4 });
        expect(s['Title info - Multiple titles']).toEqual({ '➗ multiple titles (" / ")': 4 });
        expect(s['Title info - Number of titles']).toEqual({
            '» titles: 2': 1, '» titles: 3': 1, '» titles: 7': 1, '» titles: 13': 1,
        });
        // 2 + 3 + 7 + 13 = 25 titles, "The Lady Is a Tramp" in two medleys.
        const parts = s['Title info - Single title'];
        expect(Object.keys(parts).length).toBe(24);
        expect(parts['» title: The Lady Is a Tramp']).toBe(2);
        expect(parts['» title: Volare']).toBe(1);
        // The medley prefix is never a title of its own.
        expect(Object.keys(parts).some((k) => /Medley/.test(k))).toBe(false);
        // A capitalized "(…)" stays part of the title (alternative title, not ETI).
        expect(parts["» title: Cecilia (Does Your Mother Know You're Out)"]).toBe(1);

        expect(s['Title info - Work']).toEqual({ '🚫 no associated work': 4, '🖋️ has an associated work': 21 });
        // "Nancy (with the Laughing Face)" is NOT ETI: its lowercase first
        // word is a preposition kept lowercase by title case.
        expect(s['Title info - Extra title information']).toEqual({
            '➕ has extra title information': 1, '» ETI: reprise': 1,
        });
        // No style-guide extras on this release.
        for (const label of ['Title info - Subtitle', 'Title info - Series numbering',
            'Title info - Format designation', 'Title info - Style issues']) {
            expect(s[label]).toBeUndefined();
        }
    });

    test('ticking "medley" keeps the 4 medleys and marks each "Medley N" prefix', async ({ page }) => {
        await openRelease(page, MEDLEY_URL, MEDLEY_FIXTURE);
        await sectionsOf(page, 'Title');
        await tick(page, '🎶 medley');
        const rows = await visibleTitles(page);
        expect(rows.length).toBe(4);
        expect(rows.every((r) => r.title.startsWith('Medley'))).toBe(true);
        expect(rows.map((r) => r.marks).flat().sort()).toEqual(['Medley', 'Medley', 'Medley 1', 'Medley 2']);
    });

    test('ticking a single title keeps its medley and marks exactly that title', async ({ page }) => {
        await openRelease(page, MEDLEY_URL, MEDLEY_FIXTURE);
        await sectionsOf(page, 'Title');
        await tick(page, '» title: Volare');
        const rows = await visibleTitles(page);
        expect(rows).toEqual([{ title: 'Medley: Volare / On an Evening in Roma', marks: ['Volare'] }]);
    });

    for (const order of [
        ['» title: Drink to Me Only With Thine Eyes', '» title: The Lady Is a Tramp'],
        ['» title: The Lady Is a Tramp', '» title: Drink to Me Only With Thine Eyes'],
    ]) {
        test(`two titles of one medley both get marked (ticked ${order[0].slice(9, 20)}… first)`, async ({ page }) => {
            await openRelease(page, MEDLEY_URL, MEDLEY_FIXTURE);
            await sectionsOf(page, 'Title');
            await tick(page, order[0]);
            await tick(page, order[1]);
            const row = (await visibleTitles(page)).find((r) => r.title.includes('Drink to Me Only'));
            expect(row).toBeTruthy();
            expect(row.marks.sort()).toEqual(['Drink to Me Only With Thine Eyes', 'The Lady Is a Tramp']);
        });
    }

    test('ticking "no associated work" keeps the rows whose Recording of work is empty', async ({ page }) => {
        await openRelease(page, MEDLEY_URL, MEDLEY_FIXTURE);
        await sectionsOf(page, 'Title');
        await tick(page, '🚫 no associated work');
        const rows = await visibleTitles(page);
        expect(rows.length).toBe(4);
        expect(rows.map((r) => r.title)).toContain('Fanfare & Introduction');
        // A whole-row fact: nothing to mark.
        expect(rows.every((r) => r.marks.length === 0)).toBe(true);
    });

    test('"Title info - Work" needs a "Recording of work" column', async ({ page }) => {
        await openRelease(page, MEDLEY_URL, MEDLEY_FIXTURE);
        await page.evaluate(() => {
            document.querySelectorAll('table.tbl thead th').forEach((th) => {
                if (th.dataset.colName === 'Recording of work') th.dataset.colName = 'Renamed';
            });
        });
        const s = await sectionsOf(page, 'Title');
        expect(s['Title info - Work']).toBeUndefined();
        expect(s['Title info - Medley']).toEqual({ '🎶 medley': 4 });
    });

    test('ETI release: "single version" is ETI, filters to its track and is marked', async ({ page }) => {
        await openRelease(page, ETI_URL, ETI_FIXTURE);
        const s = await sectionsOf(page, 'Title');
        expect(s['Title info - Extra title information']).toEqual({
            '➕ has extra title information': 1, '» ETI: single version': 1,
        });
        await tick(page, '» ETI: single version');
        expect(await visibleTitles(page)).toEqual([
            { title: 'I Believe in Your Sweet Love (single version)', marks: ['single version'] },
        ]);
    });

    test('ETI keywords: a group ENDING in a lowercase keyword is ETI ("Moonitor remix")', async ({ page }) => {
        await openRelease(page, REMIX_URL, REMIX_FIXTURE);
        const s = await sectionsOf(page, 'Title');
        expect(s['Title info - Extra title information']).toEqual({
            '➕ has extra title information': 5,
            '» ETI: album version': 1, '» ETI: edit': 1, '» ETI: single version': 1,
            '» ETI: Moonitor remix': 1, '» ETI: Psyche remix': 1,
        });
        await tick(page, '» ETI: Moonitor remix');
        expect(await visibleTitles(page)).toEqual([
            { title: 'Situations Like These (Moonitor remix)', marks: ['Moonitor remix'] },
        ]);
    });

    test('ETI keywords: "(U.S. remix)" and "(7” version)" are ETI, the alternative title before one is not', async ({ page }) => {
        await openRelease(page, NOW86_URL, NOW86_FIXTURE);
        const s = await sectionsOf(page, 'Title');
        expect(s['Title info - Extra title information']).toEqual({
            '➕ has extra title information': 5,
            '» ETI: 7” version': 2, '» ETI: single version': 2, '» ETI: U.S. remix': 1,
        });
        // No capitalized keyword group on this release under the default list.
        expect(s['Findings - Warning']).toBeUndefined();
    });

    test('ETI keywords: an empty keyword list falls back to lowercase-only ETI', async ({ page }) => {
        await openRelease(page, REMIX_URL, REMIX_FIXTURE, { sa_findings_eti_keywords: '' });
        const s = await sectionsOf(page, 'Title');
        expect(s['Title info - Extra title information']).toEqual({
            '➕ has extra title information': 3,
            '» ETI: album version': 1, '» ETI: edit': 1, '» ETI: single version': 1,
        });
    });
});

test.describe('📊 Title info extras behind settings', () => {
    /**
     * Rewrites the first four titles so every style-guide extra occurs once,
     * BEFORE the Title panel is first opened (its counts are cached per
     * visible row set).
     *
     * @param {import('@playwright/test').Page} page
     */
    const plantTitles = (page) => page.evaluate(() => {
        const titles = [
            'Biography: The Greatest Hits',
            'Orchestral Songs, Volume 1',
            'Flatline EP',
            'Chrono Trigger "Revival Day Impoetus" OC ReMix',
            'SHOUTING ALL THE WAY',
            'A very long title that got cut…',
        ];
        const tbl = document.querySelector('table.tbl');
        const idx = Array.from(tbl.querySelectorAll('thead tr:first-child th')).findIndex((t) => t.dataset.colName === 'Title');
        Array.from(tbl.tBodies[0].rows).slice(0, titles.length).forEach((tr, i) => {
            tr.cells[idx].querySelector('a[href] bdi').textContent = titles[i];
        });
    });

    test('all four extras show by default, with their values', async ({ page }) => {
        await openRelease(page, MEDLEY_URL, MEDLEY_FIXTURE);
        await plantTitles(page);
        const s = await sectionsOf(page, 'Title');
        expect(s['Title info - Subtitle']).toEqual({ '🪧 has a subtitle': 1 });
        expect(s['Title info - Series numbering']).toEqual({ '🔂 has series numbering': 1, '» number: 1': 1 });
        expect(s['Title info - Format designation']).toEqual({ '» format: EP': 1 });
        expect(s['Title info - Style issues']).toEqual({
            '✂️ truncated ("…")': 1, '🎮 OC ReMix title': 1, '🔠 ALL UPPERCASE': 1,
        });
    });

    test('each sa_enable_uvd_title_* setting hides its own section', async ({ page }) => {
        await openRelease(page, MEDLEY_URL, MEDLEY_FIXTURE, {
            sa_enable_uvd_title_subtitle: false,
            sa_enable_uvd_title_series: false,
            sa_enable_uvd_title_format: false,
            sa_enable_uvd_title_style_issues: false,
        });
        await plantTitles(page);
        const s = await sectionsOf(page, 'Title');
        for (const label of ['Title info - Subtitle', 'Title info - Series numbering',
            'Title info - Format designation', 'Title info - Style issues']) {
            expect(s[label]).toBeUndefined();
        }
        // The core sections are not settings-gated (2, not 4: plantTitles()
        // overwrote two of the medleys).
        expect(s['Title info - Medley']).toEqual({ '🎶 medley': 2 });
    });
});

test.describe('📊 Rating info - Presence', () => {
    test('counts rated and unrated tracks and filters to the rated ones', async ({ page }) => {
        await openRelease(page, ETI_URL, ETI_FIXTURE);
        const s = await sectionsOf(page, 'Rating');
        expect(s['Rating info - Presence']).toEqual({ '🌟 has a rating': 4, '☆ no rating': 9 });
        await tick(page, '🌟 has a rating');
        const rated = await page.evaluate(() => Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((tr) => tr.style.display !== 'none')
            .map((tr) => !!tr.querySelector('td.rating .current-rating')));
        expect(rated.length).toBe(4);
        expect(rated.every(Boolean)).toBe(true);
    });

    test('still offered when it is the panel\'s only section (every track rated)', async ({ page }) => {
        // An unrated cell also counts as "○ empty cells", which opens the
        // panel's render gate on its own. Rating every track removes that,
        // so only the new entries can open the gate — the case where a
        // render gate that forgot them shows nothing at all.
        await openRelease(page, ETI_URL, ETI_FIXTURE);
        await page.evaluate(() => {
            document.querySelectorAll('table.tbl td.rating .star-rating').forEach((sr) => {
                if (sr.querySelector('.current-rating')) return;
                const span = document.createElement('span');
                span.className = 'current-rating';
                span.style.width = '80%';
                span.textContent = '4';
                sr.prepend(span);
            });
        });
        const s = await sectionsOf(page, 'Rating');
        expect(s).toEqual({ 'Rating info - Presence': { '🌟 has a rating': 13 } });
    });
});

test.describe('_parseTitleAnatomy() grammar', () => {
    test('edge cases', async ({ page }) => {
        await openRelease(page, ETI_URL, ETI_FIXTURE);
        const p = (t) => page.evaluate((x) => window.__saTest.parseTitleAnatomy(x), t);

        // A bare slash is part of a name; only the spaced " / " splits.
        expect((await p('AC/DC Live')).parts).toEqual(['AC/DC Live']);
        // Stacked ETI, in reading order.
        expect((await p('Song (live) (remastered)')).eti).toEqual(['live', 'remastered']);
        // ETI is stripped from each part of a multi-title.
        expect((await p('One (live) / Two')).parts).toEqual(['One', 'Two']);
        // Square-bracket ETI.
        expect((await p('Song [instrumental]')).eti).toEqual(['instrumental']);
        // A medley prefix's colon is not a subtitle.
        const m = await p('Medley 2: A / B');
        expect(m.medley).toEqual({ label: 'Medley 2', num: '2' });
        expect(m.subtitle).toBe(false);
        expect(m.parts).toEqual(['A', 'B']);
        // "Medley;" form.
        expect((await p('Medley; A, B')).medley).toEqual({ label: 'Medley', num: null });
        // Series numbering forms.
        expect((await p('Shine On You Crazy Diamond, Parts I–V')).seriesNum).toBe('I–V');
        expect((await p('Hits, vol. 2')).seriesNum).toBe('2');
        expect((await p('Suite, Pt. II')).seriesNum).toBe('II');
        // All caps needs at least 4 letters, and "ABBA"-length words count.
        expect((await p('U2')).allCaps).toBe(false);
        expect((await p('HELP!')).allCaps).toBe(true);
        expect((await p('Help!')).allCaps).toBe(false);
        expect(await p('')).toBe(null);
    });
});
