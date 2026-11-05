'use strict';

// springsteenlyrics.com: a song's own page, one per version (sl-song;
// 2026-11-05, org/springsteenlyrics.org "Overwhole of the SL PTs and POHs",
// vzell's answers 1-5 and 8, mockup org/sl-song-mockups.html). The page is
// read by _slSongRead() (the preview's reader too): a sub-table per edition
// of each release (vinyl sides paired, "Disc 5:" among the sides read as side
// 5), Other official releases, Live releases split into Date/Release/Kind/
// Released (answer 4), Covers with an Item column logged in (answer 8),
// Appearance in movies, Available versions with the lyrics index's columns;
// above them the lyrics, the texts (Request without its form: answer 3), the
// facts (a live version's venue and tour from the Info sentence: answer 5),
// the pictures and Private Info, closed, logged in only (answer 2). "All
// versions" is the versions alone (answer 1). No request.
// Fixtures: scripts/build-sl-item-fixtures.py (vzell's logged-in snapshots of
// 2026-11-04: user name and Private Info scrubbed, lyrics blanked) and
// detail-sl-lyrics-badlands.html (logged out, build-detail-fixtures.py).

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage, FIXTURE_SETTINGS_OVERRIDE } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const SL = 'https://www.springsteenlyrics.com/';
const PAGES = {
    backstreets: ['lyrics.php?song=backstreets', 'detail-sl-song-backstreets-logged-in.html'],
    item2298: ['lyrics.php?item=2298', 'detail-sl-song-backstreets-logged-in.html'],
    live: ['lyrics.php?song=backstreets_1975-11-18', 'detail-sl-song-backstreets-1975-11-18-logged-in.html'],
    unofficial: ['lyrics.php?song=backstreets_unofficial1', 'detail-sl-song-backstreets-unofficial1-logged-in.html'],
    babyme: ['lyrics.php?song=babyme', 'detail-sl-song-babyme-logged-in.html'],
    badlands: ['lyrics.php?song=badlands', 'detail-sl-lyrics-badlands.html'],
};

/**
 * Loads a song page fixture under its own URL; every other request is
 * blocked and the springsteenlyrics.com ones are logged.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} key - A key of PAGES.
 * @returns {Promise<{asked: string[], errors: string[]}>}
 */
async function open(page, key, { siteCss = '' } = {}) {
    const asked = [];
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    page.on('request', (r) => { if (/springsteenlyrics\.com/.test(r.url()) && !/\.(?:jpe?g|png|gif)$/i.test(r.url())) asked.push(r.url()); });
    await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
    const file = path.join(__dirname, PAGES[key][1]);
    // A stand-in for the site's stylesheets (the fixtures have none), put
    // in the page itself so the script measures it at init.
    if (siteCss) {
        const html = fs.readFileSync(file, 'utf8').replace('</head>', `<style>${siteCss}</style></head>`);
        await page.route(SL + PAGES[key][0], (route) => route.fulfill({ body: html, contentType: 'text/html' }));
    }
    await loadUserscriptPage(page, {
        url: SL + PAGES[key][0], fixtureFile: siteCss ? undefined : file, testMode: true,
        settingsOverride: { ...FIXTURE_SETTINGS_OVERRIDE, sa_enable_springsteenlyrics: true, sa_render_threshold: 100000,
            sa_foreign_mb_titles: false, sa_foreign_typography: false },
    });
    return { asked, errors };
}

/**
 * The three rules of springsteenlyrics.com's own CSS (Bootstrap 3.3.2 and
 * style-red.css, read 2026-11-05) that place what our sticky elements are
 * measured against: the navbar's height (the toolbar h1 docks under it) and
 * the grid's 15 px gutters (the Title column's sticky left). Without them
 * the fixture's navbar is an unstyled 4,512 px block and nothing in the song
 * page's overflow:hidden box is ever displaced.
 * @type {string}
 */
const SITE_LAYOUT_CSS = '.navbar { height: 80px; overflow: hidden; } ' +
    '.container { width: 1170px; padding: 0 15px; margin: 0 auto; box-sizing: border-box; } ' +
    '.row { margin: 0 -15px; } .col-sm-12 { padding: 0 15px; box-sizing: border-box; }';

/**
 * Presses a button and waits for the render.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} [label]
 * @returns {Promise<void>}
 */
async function show(page, label = 'Show the song') {
    await page.click(`button[data-label="${label}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

// The sub-tables' headings, without their counts and toggles.
const h3s = (page) => page.locator('.project-detail h3.mb-toggle-h3').evaluateAll(hs => hs.map(h => Array.from(h.childNodes)
    .filter(n => n.nodeType === 3).map(n => n.textContent).join('').replace(/\s+/g, ' ').trim()));

/**
 * Every rendered sub-table (outside the head) as its column names and rows
 * of {column: text}.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<{cols: string[], rows: Array<Object>}>>}
 */
function tables(page) {
    return page.evaluate(() => Array.from(document.querySelectorAll('.project-detail table.tbl'))
        .filter(t => !t.closest('.mb-fd-head') && t.tBodies[0])
        .map((table) => {
            const cols = Array.from(table.querySelectorAll('thead tr:first-child th')).map(th => th.dataset.colName || th.textContent.trim());
            const rows = Array.from(table.querySelectorAll('tbody tr')).map((tr) => {
                const row = {};
                cols.forEach((n, i) => { row[n] = (tr.cells[i]?.textContent || '').replace(/\s+/g, ' ').trim(); });
                return row;
            });
            return { cols, rows };
        }));
}

// The head's h2 sections, by their text (without the fold glyph and count).
const heads = (page) => page.locator('.mb-fd-head > h2.mb-fd-h2').evaluateAll(hs => hs.map(h => Array.from(h.childNodes)
    .filter(n => n.nodeType === 3).map(n => n.textContent).join('').replace(/\s+/g, ' ').trim()));

/**
 * A head card's rows as [label, text] pairs, or null when there is no such card.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} name - The card's heading text.
 * @returns {Promise<?Array<string[]>>}
 */
function cardRows(page, name) {
    return page.evaluate((n) => {
        const card = Array.from(document.querySelectorAll('.mb-fd-head .mb-sb-card'))
            .find(c => (c.querySelector('.mb-sb-card-head')?.textContent || '').trim().replace(/\d+$/, '') === n);
        if (!card) return null;
        return Array.from(card.querySelectorAll('dt')).map(dt => [dt.textContent.trim(), dt.nextElementSibling.textContent.trim()]);
    }, name);
}

test.describe('springsteenlyrics.com song pages (sl-song)', () => {
    test('album version: a sub-table per edition, releases, live releases, covers, movies, versions; the song marked; no request', async ({ page }) => {
        const { asked, errors } = await open(page, 'backstreets');
        await expect(page.locator('h1.mb-sl-h1 bdi')).toHaveText('BACKSTREETS [Album version]');
        await expect(page.locator('button[data-label="Show all versions of this song"]')).toHaveCount(1);
        await show(page);
        expect(await h3s(page)).toEqual(['Born To Run · vinyl edition', 'Born To Run · CD edition', 'Other official releases',
            'Live releases', 'Covers', 'Appearance in movies', 'Available versions']);
        const t = await tables(page);
        // Vinyl: the two sides are one record, positions by side.
        expect(t[0].cols).toEqual(['Pos', 'Title']);
        expect(t[0].rows.map(r => r.Pos)).toEqual(['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4']);
        expect(t[1].rows.map(r => r.Pos)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
        // Other official releases: the format line split, the track lines kept.
        expect(t[2].cols).toEqual(['Cover', 'Artist', 'Title', 'Format', 'Label', 'Cat. no.', 'Country', 'Year', 'Note', 'Tracks']);
        expect(t[2].rows).toHaveLength(5);
        expect(t[2].rows[0]).toMatchObject({ 'Artist': 'Bruce Springsteen', 'Title': 'Born To Run', 'Format': '7" single',
            'Label': 'CBS/Sony', 'Cat. no.': 'SOPB 334', 'Country': 'Japan', 'Year': '1975' });
        expect(t[2].rows[0].Note).toMatch(/^Comes with a picture insert\./);
        expect(t[2].rows[1]).toMatchObject({ 'Title': 'Rocks Vol. 1 (1973 - 1982)', 'Cat. no.': 'no catalog number' });
        expect(t[2].rows[3]).toMatchObject({ 'Artist': 'Various artists', 'Format': 'LP', 'Label': 'CBS', 'Cat. no.': 'P 15663', 'Country': 'USA', 'Year': '1980' });
        // The track panel of a release row (Rocks Vol. 1) is its tracks.
        await expect(page.locator('.project-detail table.tbl').nth(2).locator('tbody tr').nth(1).locator('li')).toHaveCount(14);
        // Live releases (answer 4): one row per sentence, date split as in the lyrics index.
        expect(t[3].cols.slice(0, 8)).toEqual(['Cover', 'Date', 'Show', 'Release', 'Kind', 'Released', 'Version', 'Note']);
        expect(t[3].cols).toEqual(expect.arrayContaining(['DD', 'MM', 'YYYY']));
        expect(t[3].rows).toHaveLength(28);
        expect(t[3].rows[0]).toMatchObject({ 'Date': '1975-10-18', 'Show': 'early show', 'Release': 'The Roxy 1975',
            'Kind': 'official live download', 'Released': '2018', 'Version': '', 'YYYY': '1975' });
        // The show the site has a version page of links it.
        expect(t[3].rows[1]).toMatchObject({ 'Date': '1975-11-18', 'Release': 'Hammersmith Odeon, London \'75',
            'Kind': 'album and home video', 'Released': '2005', 'Version': 'Live 18 Nov 1975 version' });
        await expect(page.locator('.project-detail table.tbl').nth(3).locator('a[href="lyrics.php?song=backstreets_1975-11-18"]')).toHaveCount(1);
        expect(t[3].rows.find(r => r.Date === '1999-03-15').Note).toBe('first released here');
        // Covers, logged in: the Item column (view and edit), never "add N songs" (answer 8).
        expect(t[4].cols).toEqual(['Cover', 'Artist', 'Title', 'Format', 'Label', 'Cat. no.', 'Country', 'Year', 'Note', 'Item']);
        expect(t[4].rows).toHaveLength(7);
        expect(t[4].rows[0]).toMatchObject({ 'Artist': '7 Lvvas', 'Title': 'Pirata', 'Format': 'CD', 'Label': 'Boomerang Records',
            'Cat. no.': 'BG-008', 'Country': 'Spain', 'Year': '1995', 'Item': '1400' });
        const covers = page.locator('.project-detail table.tbl').nth(4);
        await expect(covers.locator('a[href="lyrics.php?cmd=displaycoverrelease&item=1400"]')).toHaveText('1400');
        await expect(covers.locator('a.mb-sl-edit[href="lyrics.php?cmd=editcoverrelease&item=1400"]')).toHaveText('');
        await expect(covers.locator('a[href*="addcoversongs"]')).toHaveCount(0);
        await expect(covers).not.toContainText('add 1 song');
        // Movies.
        expect(t[5]).toEqual({ cols: ['Poster', 'Title', 'Note'], rows: [expect.objectContaining({ 'Title': 'Blinded By The Light' })] });
        // Available versions: the lyrics index's columns, ID while logged in.
        expect(t[6].cols.slice(0, 8)).toEqual(['Title', 'Version', 'Type', 'Artist', 'Date', 'Show', 'No.', 'ID']);
        expect(t[6].rows).toHaveLength(61);
        expect(t[6].rows[0]).toMatchObject({ 'Title': 'BACKSTREETS', 'Version': 'Album version', 'Type': 'Album', 'ID': '2298' });
        expect(t[6].rows[4]).toMatchObject({ 'Version': 'Live 18 Nov 1975 version', 'Type': 'Live', 'Date': '1975-11-18', 'ID': '2439' });
        // This version is marked where it occurs (both editions, the versions),
        // unlinked in the versions as on the site, and the mark is not text.
        await expect(page.locator('td.mb-sl-self')).toHaveCount(3);
        await expect(page.locator('td.mb-sl-self').first()).toHaveText('BACKSTREETS');
        const mark = await page.locator('td.mb-sl-self').first().evaluate(td => getComputedStyle(td, '::before').content);
        expect(mark).toContain('●');
        await expect(page.locator('.project-detail table.tbl').nth(6).locator('td.mb-sl-self a')).toHaveCount(0);
        // The site's own song content is hidden; no request.
        await expect(page.locator('.project-detail > h3.mb-sl-item-native')).toBeHidden();
        expect(asked.filter(u => u !== SL + PAGES.backstreets[0])).toEqual([]);
        expect(errors).toEqual([]);
    });

    test('album version: the head — lyrics and texts closed, Request without its form, the facts, pictures, Private Info last', async ({ page }) => {
        await open(page, 'backstreets');
        await show(page);
        await expect(page.locator('p.mb-fd-sub')).toHaveText('~ Album version (page updated 30 May 2011)');
        expect(await heads(page)).toEqual(['Lyrics (Album version)', 'Info', 'Studio Recording', 'Born To Run', 'Other Official Releases',
            'Sad Eyed Interlude', 'Backstreets Magazine', 'Credits / References', 'Request', 'Details', 'Pictures', 'Private Info']);
        // Live History held only the site's "SECTION NOT YET COMPLETED".
        await expect(page.locator('.mb-fd-head')).not.toContainText('SECTION NOT YET COMPLETED');
        // Request (answer 3): its text, never the contact form or its script.
        const req = page.locator('.mb-fd-head > h2.mb-fd-h2', { hasText: 'Request' }).locator('xpath=following-sibling::*[1]');
        await expect(req).toContainText('An aborted outtake (duration 3:12)');
        await expect(req).not.toContainText('Your message');
        await expect(req).not.toContainText('document.write');
        // The lyrics keep their lines (blanked in the fixture) and start closed.
        const lyr = page.locator('.mb-fd-head > h2.mb-fd-h2', { hasText: 'Lyrics' }).locator('xpath=following-sibling::*[1]');
        await expect(lyr).toBeHidden();
        expect(await cardRows(page, 'Version')).toEqual([['Version', 'Album version'], ['Type', 'Album'],
            ['Song number', '2298 · edit'], ['Versions', '61: Album 1, Unofficial studio 3, Live 57']]);
        await expect(page.locator('.mb-fd-head a[href="https://www.springsteenlyrics.com/lyrics.php?cmd=edit&item=2298"]')).toHaveText('edit');
        expect(await cardRows(page, 'Studio recording')).toEqual([
            ['Recorded', '25 Apr 1975, 19 May 1975, 23 May 1975, 06 Jul 1975, and 18 Jul 1975'],
            ['Studio', 'The Record Plant in New York City, NY'], ['Takes', '4']]);
        expect(await cardRows(page, 'On this page')).toEqual([['Releases', 'Born To Run'], ['Other releases', '5'],
            ['Live releases', '28 (1975–2012)'], ['Covers', '7'], ['Movies', '1'], ['Versions', '61']]);
        expect(await cardRows(page, 'Show')).toBeNull();
        await expect(page.locator('.mb-fd-head .mb-release-art-tile')).toHaveCount(44);
        // Private Info (answer 2): closed, marked as yours, the scrubbed note.
        const priv = page.locator('.mb-fd-head > h2.mb-fd-h2', { hasText: 'Private Info' });
        await expect(priv.locator('xpath=following-sibling::*[1]')).toBeHidden();
        await expect(page.locator('.mb-fd-head')).toContainText('private note removed for the fixture');
        await expect(page.locator('.mb-fd-head')).toContainText('only shown while you are logged in');
    });

    test('live version: the release\'s editions ("Disc 5:" among the sides is side 5); Show and Released on from the Info sentences', async ({ page }) => {
        await open(page, 'live');
        await expect(page.locator('h1.mb-sl-h1 bdi')).toHaveText('BACKSTREETS [Live 18 Nov 1975 version]');
        await show(page);
        const r = 'Hammersmith Odeon, London \'75';
        expect(await h3s(page)).toEqual([`${r} · DVD edition`, `${r} · CD edition · Disc 1`, `${r} · CD edition · Disc 2`,
            `${r} · vinyl edition · Record 1`, `${r} · vinyl edition · Record 2`, `${r} · vinyl edition · Record 3`,
            `${r} · vinyl edition · Record 4`, 'Available versions']);
        const t = await tables(page);
        expect(t.map(x => x.rows.length)).toEqual([16, 9, 7, 6, 3, 3, 4, 61]);
        expect(t[5].rows.map(x => x.Pos)).toEqual(['E1', 'F1', 'F2']);
        expect(t[5].rows[0].Title).toBe('KITTY\'S BACK');
        // A song without a page of its own is plain text.
        await expect(page.locator('.project-detail table.tbl').nth(0).locator('tbody tr').nth(4).locator('a')).toHaveCount(0);
        // This version, in every edition that has it and in the versions.
        await expect(page.locator('td.mb-sl-self')).toHaveCount(4);
        await expect(page.locator('p.mb-fd-sub')).toHaveText('~ Live 18 Nov 1975 version (1975-11-18 · page updated 21 Oct 2010)');
        expect(await cardRows(page, 'Show')).toEqual([['Date', '1975-11-18'], ['Venue', 'Hammersmith Odeon'],
            ['Place', 'London, England'], ['Tour', 'Born To Run Tour']]);
        expect(await cardRows(page, 'Released on')).toEqual([['Release', r], ['Kind', 'album and home video'], ['Year', '2005'],
            ['Editions', 'DVD, CD (2 discs), vinyl (4 records)']]);
        expect(await heads(page)).toEqual(['Lyrics (Live 18 Nov 1975 version)', 'Info', r, 'Credits', 'Details', 'Pictures']);
    });

    test('unofficial studio version: only the versions; a song without lyrics and one version: no "All versions"', async ({ page }) => {
        await open(page, 'unofficial');
        await show(page);
        expect(await h3s(page)).toEqual(['Available versions']);
        expect(await cardRows(page, 'Version')).toContainEqual(['Type', 'Unofficial studio']);
        expect(await heads(page)).toEqual(['Lyrics (Unofficial studio version 1)', 'Info', 'Credits', 'Request', 'Details', 'Pictures']);

        await page.goto('about:blank');
        await open(page, 'babyme');
        await expect(page.locator('h1.mb-sl-h1 bdi')).toHaveText('BABY & ME (BLONDIE)');
        // Its one version is itself, unlinked: nothing for "All versions" to show.
        await expect(page.locator('button[data-label="Show all versions of this song"]')).toHaveCount(0);
        await show(page);
        expect(await h3s(page)).toEqual(['Available versions']);
        expect(await cardRows(page, 'Version')).toEqual([['Lyrics', 'not available'], ['Song number', '2097 · edit']]);
        await expect(page.locator('p.mb-fd-sub')).toHaveText('~ Song (page updated 17 Dec 2015)');
        expect(await heads(page)).toEqual(['Info', 'Unknown Songs from 1972-1975', 'Request', 'Details', 'Pictures']);
    });

    test('"All versions" (answer 1): the versions alone, ID sorted as a number', async ({ page }) => {
        const { asked } = await open(page, 'backstreets');
        await show(page, 'Show all versions of this song');
        expect(await h3s(page)).toEqual(['All versions']);
        const [v] = await tables(page);
        expect(v.rows).toHaveLength(61);
        expect(v.rows.filter(r => r.Type === 'Live')).toHaveLength(57);
        await page.locator('.project-detail table.tbl thead th', { hasText: 'ID' }).locator('.sort-icon-btn', { hasText: '▲' }).first().click();
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const ids = (await tables(page))[0].rows.map(r => Number(r.ID));
        expect(ids).toEqual(ids.slice().sort((a, b) => a - b));
        expect(asked.filter(u => u !== SL + PAGES.backstreets[0])).toEqual([]);
    });

    test('the song by its number (lyrics.php?item=2298) is the same page and view; it is not the lyrics index', async ({ page }) => {
        await open(page, 'item2298');
        // sl-lyrics' match leaves `item=` to sl-song: its buttons are absent.
        await expect(page.locator('button[data-label="Show the song"]')).toHaveCount(1);
        await expect(page.locator('button[data-label="Show all lyrics"]')).toHaveCount(0);
        await show(page);
        // The slug comes from the page itself, so the song is still marked.
        await expect(page.locator('td.mb-sl-self')).toHaveCount(3);
    });

    test('logged out: no ID column, no Private Info', async ({ page }) => {
        await open(page, 'badlands');
        await show(page);
        const t = await tables(page);
        const v = t[t.length - 1];
        expect(v.cols.slice(0, 7)).toEqual(['Title', 'Version', 'Type', 'Artist', 'Date', 'Show', 'No.']);
        expect(v.cols).not.toContain('ID');
        expect(await heads(page)).not.toContain('Private Info');
        expect(await cardRows(page, 'Version')).toEqual(expect.arrayContaining([['Type', 'Album']]));
    });

    // vzell's screenshots, 2026-11-05: the song page's .project-detail has the
    // site's inline overflow:hidden, which made it the scroll container of
    // our sticky h1 (drawn 80px down, over the site's title, before any
    // press) and of the sticky Title column (pushed 15px over Version).
    test('layout: the toolbar h1 above the site\'s title before any press', async ({ page }) => {
        await open(page, 'backstreets', { siteCss: SITE_LAYOUT_CSS });
        const before = await page.evaluate(() => ({
            h1: document.querySelector('h1.mb-sl-h1').getBoundingClientRect().bottom,
            title: document.querySelector('.project-detail > h3:not(.heading)').getBoundingClientRect().top,
        }));
        expect(before.h1).toBeLessThanOrEqual(before.title);
    });

    test('layout: the sticky Title column never covers the next one', async ({ page }) => {
        await open(page, 'backstreets', { siteCss: SITE_LAYOUT_CSS });
        await show(page, 'Show all versions of this song');
        const cells = await page.evaluate(() => {
            const t = Array.from(document.querySelectorAll('.project-detail table.tbl')).find(x => !x.closest('.mb-fd-head'));
            const [a, b] = t.tBodies[0].rows[1].cells;
            const [ha, hb] = t.tHead.rows[0].cells;
            return { td: [a.getBoundingClientRect().right, b.getBoundingClientRect().left],
                th: [ha.getBoundingClientRect().right, hb.getBoundingClientRect().left], sticky: getComputedStyle(a).position };
        });
        expect(cells.sticky).toBe('sticky');
        expect(cells.td[0]).toBeLessThanOrEqual(cells.td[1] + 0.5);
        expect(cells.th[0]).toBeLessThanOrEqual(cells.th[1] + 0.5);
    });
});
