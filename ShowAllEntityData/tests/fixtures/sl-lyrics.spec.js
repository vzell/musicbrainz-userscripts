'use strict';

// springsteenlyrics.com lyrics index ('sl-lyrics'), opt-in via
// sa_enable_springsteenlyrics. One page per first letter, each one page, so
// the pages are fetched by KEY (features.pageKeys → _readPageKeys()): the
// letter links of the page's own wall are the page list, each fetched by its
// own link. applySlLyricsToTable() turns the song lines into a table; the
// bracketed version text is split by _slLyricsParseVersion(), and the
// MusicBrainz dateParts extractor splits its date.
// Fixtures: scripts/build-sl-fixtures.py (debug/sl-lyrics.html, sl-(.html,
// sl-b.html, letter walls trimmed to "(" and "b"). See
// docs/claude/springsteenlyrics.md.

const { test, expect } = require('../support/test');
const { loadSlListPage, renderedSlRows, renderedSlHeaders } = require('../support/slFixture');
const { waitForRenderComplete } = require('../support/browser');
const { waitForSortSettled, columnFilterInput } = require('../support/filterSortAssertions');

const HEADERS = ['Title', 'Lyrics', 'Version', 'Type', 'Artist', 'Date', 'Show', 'No.', 'Letter',
    'DD', 'MM', 'YYYY', 'Day', 'Month'];
// Lines in the two fixture letter pages: "(" 12, "B" 312.
const PAREN_ROWS = 12;
const B_ROWS = 312;

/**
 * Clicks a column header's ▲ (ascending) or ▼ (descending) sort icon.
 * @param {import('@playwright/test').Page} page
 * @param {string} colName
 * @param {string} glyph
 */
async function clickSort(page, colName, glyph) {
    const btn = page.locator(`table.tbl thead th[data-col-name="${colName}"] .sort-icon-btn`, { hasText: glyph }).first();
    await waitForSortSettled(page, () => btn.click());
}

/**
 * Loads a lyrics fixture, presses "Show all lyrics" and waits for the render.
 * @param {import('@playwright/test').Page} page
 * @param {string} kind 'lyrics-intro' or 'lyrics-b'
 * @returns {Promise<string[]>} Every request URL the page made.
 */
async function showAllLyrics(page, kind) {
    const { requests, spec } = await loadSlListPage(page, { kind });
    await page.click(`button[data-label="${spec.button}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
    return requests;
}

/**
 * Indexes rendered rows by the `song=` slug of their Title link.
 * @param {Array<Object<string, string>>} rows
 * @returns {Object<string, Object<string, string>>}
 */
function bySong(rows) {
    return Object.fromEntries(rows.map((r) => [(r._href.match(/[?&]song=([^&]+)/) || [])[1], r]));
}

test.describe('sl-lyrics (springsteenlyrics.com lyrics index)', () => {
    test('from the landing page: every letter fetched by its link, one table, in letter order', async ({ page }) => {
        const requests = await showAllLyrics(page, 'lyrics-intro');
        expect(await renderedSlHeaders(page)).toEqual(HEADERS);
        const rows = await renderedSlRows(page);
        expect(rows).toHaveLength(PAREN_ROWS + B_ROWS);
        expect(rows.slice(0, PAREN_ROWS).every((r) => r.Letter === '(')).toBe(true);
        expect(rows.slice(PAREN_ROWS).every((r) => r.Letter === 'B')).toBe(true);
        await expect(page.locator('#mb-global-status-display')).toContainText(`Loaded 2 pages (${PAREN_ROWS + B_ROWS} rows)`);

        // Exactly one request per letter, each the letter link itself (the
        // landing page's own URL has no cmd=list).
        const fetched = requests.filter((u) => /\/lyrics\.php\?/.test(u)).map((u) => new URL(u).search);
        expect(fetched.sort()).toEqual(['?cmd=list&letter=(', '?cmd=list&letter=b'].sort());
        // The landing page's empty table sits under its own heading, which
        // carries the count and filter bar.
        await expect(page.locator('h2.mb-sl-list-heading')).toHaveText(/All lyrics/);
        expect(await page.locator('table.tbl').count()).toBe(1);
    });

    test('from a letter page: that letter is the live page, the others are fetched, order unchanged', async ({ page }) => {
        const requests = await showAllLyrics(page, 'lyrics-b');
        const rows = await renderedSlRows(page);
        expect(rows).toHaveLength(PAREN_ROWS + B_ROWS);
        // "(" first even though the run started on "b": the live page is
        // reused when the loop REACHES its key, not as page 1.
        expect(rows[0].Letter).toBe('(');
        expect(rows[rows.length - 1].Letter).toBe('B');
        expect(new Set(rows.map((r) => r._href)).size).toBe(rows.length);
        // One request per letter: "b"'s is the page load itself (the request
        // log starts before navigation), so a second "b" would mean the live
        // page was NOT reused.
        const fetched = requests.filter((u) => /\/lyrics\.php\?/.test(u)).map((u) => new URL(u).search);
        expect(fetched.sort()).toEqual(['?cmd=list&letter=(', '?cmd=list&letter=b'].sort());
        // The site's own list heading, promoted to the h2 the count and
        // filter bar anchor on (which is why it holds more than its text).
        await expect(page.locator('h2.mb-sl-list-heading')).toContainText('Starting with "B"');
        expect(await page.locator('span.monospaced a[href*="lyrics.php?song="]').count()).toBe(0);
    });

    test('a failed letter resumes at that LETTER, keeping the rows already loaded', async ({ page }) => {
        const { requests, spec } = await loadSlListPage(page, { kind: 'lyrics-intro' });
        // Registered last, so it wins once: "b" (page 2 of 2) answers 404,
        // which fetchHtml() does not retry.
        await page.route((url) => url.pathname === '/lyrics.php' && url.searchParams.get('letter') === 'b',
            (route) => route.fulfill({ status: 404, body: 'gone for now' }), { times: 1 });
        await page.click(`button[data-label="${spec.button}"]`);
        await expect(page.locator('#mb-resume-fetch-btn')).toBeVisible({ timeout: 30000 });
        expect(await page.evaluate(() => window.__saTest.resumeState())).toMatchObject({ nextPage: 2, maxPage: 2 });
        await expect(page.locator('table.tbl tbody tr')).toHaveCount(PAREN_ROWS);

        const before = requests.length;
        await page.click('#mb-resume-fetch-btn');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const rows = await renderedSlRows(page);
        expect(rows).toHaveLength(PAREN_ROWS + B_ROWS);
        expect(rows[0].Letter).toBe('(');
        expect(rows[rows.length - 1].Letter).toBe('B');
        // The resume asked for "b" by its own link, and for nothing else on the site.
        const resumed = requests.slice(before).filter((u) => /springsteenlyrics\.com\/lyrics\.php/.test(u)).map((u) => new URL(u).search);
        expect(resumed).toEqual(['?cmd=list&letter=b']);
    });

    test('a resume keeps every column\'s name, also once the 📊 counts are filled in', async ({ page }) => {
        // "↻ Load remaining pages" re-runs makeTableSortableUnified() over the
        // live table's headers. Once their 📊 count badges hold digits, a name
        // read from the header text came out "Title 4", "Letter 1": the
        // resumed table's columns were renamed, and the test above failed
        // whenever the resume began after the badges were filled (3+ of 5 on
        // 2026-10-07). Here the resume waits for exactly that state.
        const { spec } = await loadSlListPage(page, { kind: 'lyrics-intro' });
        await page.route((url) => url.pathname === '/lyrics.php' && url.searchParams.get('letter') === 'b',
            (route) => route.fulfill({ status: 404, body: 'gone for now' }), { times: 1 });
        await page.click(`button[data-label="${spec.button}"]`);
        await expect(page.locator('#mb-resume-fetch-btn')).toBeVisible({ timeout: 30000 });
        // The premise: the partial table's badges hold digits before the resume.
        for (const col of ['Title', 'Letter']) {
            await expect(page.locator(`table.tbl thead th[data-col-name="${col}"] .mb-col-uniq-count`)).toHaveText(/\d/);
        }
        await page.click('#mb-resume-fetch-btn');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        expect(await renderedSlHeaders(page)).toEqual(HEADERS);
        const rows = await renderedSlRows(page);
        expect(rows).toHaveLength(PAREN_ROWS + B_ROWS);
        expect(rows[0].Letter).toBe('(');
    });

    test('each line is split into Lyrics / Version / Type / Artist / Date / Show / No.', async ({ page }) => {
        await showAllLyrics(page, 'lyrics-intro');
        const s = bySong(await renderedSlRows(page));
        const pick = (r) => ({
            Title: r.Title, Lyrics: r.Lyrics, Version: r.Version, Type: r.Type, Artist: r.Artist,
            Date: r.Date, Show: r.Show, 'No.': r['No.'], Letter: r.Letter,
        });

        expect(pick(s.satisfaction)).toEqual({
            Title: "(I CAN'T GET NO) SATISFACTION", Lyrics: '✓', Version: 'Live 19 May 1978 version', Type: 'Live',
            Artist: '', Date: '1978-05-19', Show: '', 'No.': '', Letter: '(',
        });
        expect(pick(s.satisfaction_original)).toMatchObject({ Type: 'Original', Artist: 'The Rolling Stones', Date: '' });
        // The plain icon: the song page says "Lyrics not available".
        expect(pick(s.babyme)).toEqual({
            Title: 'BABY & ME (BLONDIE)', Lyrics: '✗', Version: '', Type: '', Artist: '', Date: '', Show: '', 'No.': '', Letter: 'B',
        });
        expect(pick(s.babycomeback)).toMatchObject({ Version: 'Home demo version', Type: 'Demo' });
        expect(pick(s.babydontgo2)).toMatchObject({ Version: 'version 2', Type: 'Version', 'No.': '2' });
        expect(pick(s['bishopdanced_1973-01-31-early'])).toMatchObject({ Type: 'Live', Date: '1973-01-31', Show: 'early show' });
        expect(pick(s['blessmysoul_1972-02-00'])).toMatchObject({ Type: 'Live', Date: '1972-02' });
        expect(pick(s.beneaththefloodline)).toMatchObject({ Type: 'Soundcheck', Date: '1984-09-17' });
        // The LAST possessive names the artist.
        expect(pick(s['blindedbythelight_cov-mmeb'])).toMatchObject({ Type: 'Cover', Artist: "Manfred Mann's Earth Band" });
    });

    test('Date is split into DD / MM / YYYY / Day / Month at its own precision', async ({ page }) => {
        await showAllLyrics(page, 'lyrics-intro');
        const rows = await renderedSlRows(page);
        const s = bySong(rows);
        const parts = (r) => ({ DD: r.DD, MM: r.MM, YYYY: r.YYYY, Day: r.Day, Month: r.Month });

        expect(parts(s.satisfaction)).toEqual({ DD: '19', MM: '5', YYYY: '1978', Day: 'Friday', Month: 'May' });
        expect(parts(s['bishopdanced_1973-01-31-early'])).toEqual({ DD: '31', MM: '1', YYYY: '1973', Day: 'Wednesday', Month: 'January' });
        expect(parts(s['blessmysoul_1972-02-00'])).toEqual({ DD: '', MM: '2', YYYY: '1972', Day: '', Month: 'February' });
        expect(parts(s.babycomeback)).toEqual({ DD: '', MM: '', YYYY: '', Day: '', Month: '' });

        // On every row the parts agree with Date.
        const bad = rows.filter((r) => {
            const [y, m, d] = (r.Date || '').split('-');
            return (r.YYYY || '') !== (y || '') || (r.MM || '') !== (m ? String(Number(m)) : '') ||
                (r.DD || '') !== (d ? String(Number(d)) : '') || !!r.Day !== !!d;
        });
        expect(bad.map((r) => `${r.Title} ${r.Date}`)).toEqual([]);
    });

    test('a Type filter keeps only Live rows, and YYYY sorts numerically', async ({ page }) => {
        await showAllLyrics(page, 'lyrics-intro');
        const input = columnFilterInput(page, HEADERS.indexOf('Type'));
        await input.click();
        await input.pressSequentially('Live');
        await expect.poll(async () => {
            const rows = await renderedSlRows(page);
            return rows.length > 0 && rows.length < PAREN_ROWS + B_ROWS && rows.every((r) => r.Type === 'Live');
        }, { timeout: 15000, message: 'only Live rows remain' }).toBe(true);

        await clickSort(page, 'YYYY', '▲');
        const years = (await renderedSlRows(page)).map((r) => r.YYYY).filter(Boolean).map(Number);
        expect(years.length).toBeGreaterThan(50);
        expect(years).toEqual([...years].sort((a, b) => a - b));
    });
});

test('_slLyricsParseVersion reads every bracket shape the site writes', async ({ page }) => {
    await loadSlListPage(page, { kind: 'lyrics-b' });
    const cases = [
        // [bracket, type, artist, date, show, no]
        ['Live 30 Sep 1987 version', 'Live', '', '1987-09-30', '', ''],
        ['Live 18 Oct 1975 (early show) version', 'Live', '', '1975-10-18', 'early show', ''],
        ['Live 18 Oct (early show) 1975 version', 'Live', '', '1975-10-18', 'early show', ''],
        ['Live 13 Mar 2016 (Liberty Hall, late show) version', 'Live', '', '2016-03-13', 'Liberty Hall, late show', ''],
        ['Live 08 Oct 1984 (take #2) version', 'Live', '', '1984-10-08', '', '2'],
        ['Live 27 Jun 2000 / 01 Jul 2000 version', 'Live', '', '2000-06-27', '', ''],
        ['Live July 2018 version', 'Live', '', '2018-07', '', ''],
        ['live 1999 version', 'Live', '', '1999', '', ''],
        ['Live version', 'Live', '', '', '', ''],
        ['13 Mar 2016 sound-check version', 'Soundcheck', '', '2016-03-13', '', ''],
        ['Original Roy Orbison version', 'Original', 'Roy Orbison', '', '', ''],
        ['Original version', 'Original', '', '', '', ''],
        ['Original studio version', 'Original', '', '', '', ''],
        ["James Taylor's original version", 'Original', 'James Taylor', '', '', ''],
        ["Steel Mill Retro's cover version", 'Cover', 'Steel Mill Retro', '', '', ''],
        ["Manfred Mann's Earth Band's cover version", 'Cover', "Manfred Mann's Earth Band", '', '', ''],
        ["Little Steven And The Disciples Of Soul's album version", 'Other artist album', 'Little Steven And The Disciples Of Soul', '', '', ''],
        ["Joe Grushecky & The Houserockers' album version", 'Other artist album', 'Joe Grushecky & The Houserockers', '', '', ''],
        ["Dropkick Murphys' EP version", 'Other', 'Dropkick Murphys', '', '', ''],
        ["Bruce Springstone's version", 'Other', 'Bruce Springstone', '', '', ''],
        ['Album version', 'Album', '', '', '', ''],
        ['1995 album version', 'Album', '', '1995', '', ''],
        ['Home demo version 2', 'Demo', '', '', '', '2'],
        ['30 Jun 1982 demo version take #1', 'Demo', '', '1982-06-30', '', '1'],
        ['Early home demo version', 'Demo', '', '', '', ''],
        ['Band rehearsal #3', 'Rehearsal', '', '', '', '3'],
        ['Studio rehearsal version', 'Rehearsal', '', '', '', ''],
        ['Official rehearsal version', 'Rehearsal', '', '', '', ''],
        ['Outtake version #1', 'Outtake', '', '', '', '1'],
        ['Unofficial studio version 3', 'Unofficial studio', '', '', '', '3'],
        ['Official studio version', 'Official studio', '', '', '', ''],
        ['Official 1995 studio version 2', 'Official studio', '', '1995', '', '2'],
        ['Handwritten lyrics', 'Handwritten', '', '', '', ''],
        ['Early draft #2', 'Draft', '', '', '', '2'],
        ['Studio version take #2', 'Studio', '', '', '', '2'],
        ['Version 4', 'Version', '', '', '', '4'],
        ['Alternative version #1', 'Version', '', '', '', '1'],
        ['Take #1', 'Version', '', '', '', '1'],
        ['1994 music video version', 'Other', '', '1994', '', ''],
        ['Vocal snippet', 'Other', '', '', '', ''],
        ['Z100 Jerry Maguire Mix', 'Other', '', '', '', ''],
        ['', '', '', '', '', ''],
    ];
    const out = await page.evaluate((brackets) => brackets.map((b) => {
        const v = window.__saTest.slLyricsParseVersion(b);
        return [b, v.type, v.artist, v.date, v.show, v.no];
    }), cases.map((c) => c[0]));
    expect(out).toEqual(cases);
});
