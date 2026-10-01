'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// The 📊 "Title info - …" sections (uniq-drop-title-anatomy.spec.js) reach
// beyond "Title" columns: every column named in sa_uvd_title_info_columns
// (default "Name, Recording, Release, Release group, Release groups, Work")
// gets them too. On every column — Title included — a cell counts only when
// its title links a recording, release, release group, work or track
// (_findCellTitleEl() / _TITLE_ENTITY_HREF_RE), so an artist called "ABBA"
// is never an ALL-UPPERCASE title.
//
// Each test rewrites a few title texts BEFORE the panel is first opened (its
// counts are cached per visible row set), so every section has a known count.

const PAGES = {
    recordings: {
        url: 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/recordings',
        fixture: 'artist-recordings-ms-batch.html',
        button: '⊚ All recordings',
        col: 'Name',
    },
    works: {
        url: 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f/works',
        fixture: 'uniq-drop-work-attr-slash-types.html',
        button: 'Show all Works for Artist',
        col: 'Work',
    },
    rgReleases: {
        url: 'https://musicbrainz.org/release-group/aaaaaaaa-0000-0000-0000-000000000001',
        fixture: 'releasegroup-releases-catalog-prefix.html',
        button: 'Show all Releases for ReleaseGroup',
        col: 'Release',
    },
    medley: {
        url: 'https://musicbrainz.org/release/a9a3b139-cf22-4d28-801e-3f3d49521d0e',
        fixture: 'release-tracks-medley.html',
        button: 'Show all Tracks for Release',
        col: 'Title',
        settings: { sa_enable_release_tracks: true },
    },
};

/**
 * Loads one of PAGES and runs its "Show all" button.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} p - A PAGES entry.
 * @param {Object} [settingsOverride]
 */
async function open(page, p, settingsOverride = {}) {
    // Keep every fetch the "Show all" button makes off the network: the
    // paginated `?page=N` requests are served the same fixture, and the
    // recordings page's WS/2 millisecond-length batches get an empty answer.
    await page.route('**/ws/2/**', (route) => route.fulfill({
        status: 200, contentType: 'application/json', body: '{"count":0,"recordings":[]}',
    }));
    await loadUserscriptPage(page, {
        url: p.url,
        fixtureFile: path.join(__dirname, p.fixture),
        testMode: true,
        settingsOverride: { ...(p.settings || {}), ...settingsOverride },
    });
    await page.route(`${p.url}?**`, (route) => route.fulfill({ path: path.join(__dirname, p.fixture), contentType: 'text/html' }));
    await page.click(`button[data-label="${p.button}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/**
 * Rewrites the title text (and optionally the link) of the first rows of a
 * column. Each edit is `{text, href?}`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} col
 * @param {Array<{text: string, href?: string}>} edits
 * @returns {Promise<number>} How many cells were rewritten.
 */
const plant = (page, col, edits) => page.evaluate(([c, e]) => {
    const tbl = document.querySelector('table.tbl');
    const idx = Array.from(tbl.querySelectorAll('thead tr:first-child th')).findIndex((t) => t.dataset.colName === c);
    let n = 0;
    Array.from(tbl.tBodies[0].rows).filter((tr) => tr.cells[idx] && tr.cells[idx].querySelector('a[href] bdi'))
        .slice(0, e.length).forEach((tr, i) => {
            const bdi = tr.cells[idx].querySelector('a[href] bdi');
            bdi.textContent = e[i].text;
            if (e[i].href) bdi.closest('a').setAttribute('href', e[i].href);
            n++;
        });
    return n;
}, [col, edits]);

/**
 * Opens a column's 📊 panel; returns only its "Title info" sections as
 * `{label: {item: count}}`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} col
 */
async function titleInfo(page, col) {
    const sections = await page.evaluate((c) => window.__saTest.getUniqDropSections(c), col);
    return Object.fromEntries((sections || []).filter((s) => s.label.startsWith('Title info'))
        .map((s) => [s.label, Object.fromEntries(s.items.map((i) => [i.label, i.count]))]));
}

const ARTIST_HREF = '/artist/0aa8294b-6332-4b65-b677-e3a1f8591d3b';

test.describe('📊 Title info on non-Title columns', () => {
    test('artist recordings: the "Name" column gets the sections', async ({ page }) => {
        await open(page, PAGES.recordings);
        expect(await plant(page, 'Name', [
            { text: 'Medley: Alpha / Beta' },
            { text: 'Gamma (live)' },
            { text: 'SHOUTING SONG' },
        ])).toBe(3);
        const s = await titleInfo(page, 'Name');
        expect(s['Title info - Medley']).toEqual({ '🎶 medley': 1 });
        expect(s['Title info - Number of titles']).toEqual({ '» titles: 2': 1 });
        expect(s['Title info - Single title']).toEqual({ '» title: Alpha': 1, '» title: Beta': 1 });
        expect(s['Title info - Extra title information']['» ETI: live']).toBe(1);
        expect(s['Title info - Style issues']['🔠 ALL UPPERCASE']).toBe(1);
        // No "Recording of work" column on this page.
        expect(s['Title info - Work']).toBeUndefined();
    });

    test('artist works: the "Work" column gets the sections', async ({ page }) => {
        await open(page, PAGES.works);
        expect(await plant(page, 'Work', [{ text: 'Suite, Part 2' }])).toBe(1);
        const s = await titleInfo(page, 'Work');
        expect(s['Title info - Series numbering']).toEqual({ '🔂 has series numbering': 1, '» number: 2': 1 });
    });

    test('release-group releases: the "Release" column gets the sections', async ({ page }) => {
        await open(page, PAGES.rgReleases);
        expect(await plant(page, 'Release', [{ text: 'Greatest Hits (deluxe edition)' }])).toBe(1);
        const s = await titleInfo(page, 'Release');
        expect(s['Title info - Extra title information']).toEqual({
            '➕ has extra title information': 1, '» ETI: deluxe edition': 1,
        });
    });

    test('an empty sa_uvd_title_info_columns means Title columns only', async ({ page }) => {
        await open(page, PAGES.recordings, { sa_uvd_title_info_columns: '' });
        await plant(page, 'Name', [{ text: 'Medley: Alpha / Beta' }]);
        expect(await titleInfo(page, 'Name')).toEqual({});
    });

    test('a column added to the setting gets the sections', async ({ page }) => {
        // "Work" taken OUT of the list, then the list is just "Work": proves
        // the setting, not a hard-coded name, decides.
        await open(page, PAGES.works, { sa_uvd_title_info_columns: 'Name' });
        await plant(page, 'Work', [{ text: 'Suite, Part 2' }]);
        expect(await titleInfo(page, 'Work')).toEqual({});
    });
});

test.describe('📊 Title info: only recording/release/RG/work/track titles count', () => {
    test('an artist link in a "Name" column is never read as a title', async ({ page }) => {
        await open(page, PAGES.recordings);
        await plant(page, 'Name', [
            { text: 'ABBA', href: ARTIST_HREF },
            { text: 'Medley: Alpha / Beta', href: ARTIST_HREF },
            { text: 'SHOUTING SONG' },
        ]);
        const s = await titleInfo(page, 'Name');
        // Only the recording counts.
        expect(s['Title info - Style issues']).toEqual({ '🔠 ALL UPPERCASE': 1 });
        expect(s['Title info - Medley']).toBeUndefined();
    });

    test('...and the same holds on a "Title" column', async ({ page }) => {
        await open(page, PAGES.medley);
        // Turn the first medley's recording link into an artist link.
        await page.evaluate((href) => {
            const tbl = document.querySelector('table.tbl');
            const idx = Array.from(tbl.querySelectorAll('thead tr:first-child th')).findIndex((t) => t.dataset.colName === 'Title');
            const row = Array.from(tbl.tBodies[0].rows).find((tr) => /^Medley:/.test(tr.cells[idx].textContent.trim()));
            row.cells[idx].querySelector('a[href]').setAttribute('href', href);
        }, ARTIST_HREF);
        const s = await titleInfo(page, 'Title');
        expect(s['Title info - Medley']).toEqual({ '🎶 medley': 3 });
    });
});
