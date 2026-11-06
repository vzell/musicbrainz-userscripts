'use strict';

// springsteenlyrics.com: an item's own page (sl-collection-item,
// sl-bootlegs-item, sl-brucelegs-item; 2026-11-04, org/springsteenlyrics.org
// "Add new SL PTs and POHs", mockup org/sl-item-pts-mockups.html). The
// tracklist as release-tracks shows a release: a sub-table per disc or record
// (vinyl sides paired, vzell's answer 4), Take and Note on bootlegs (answer
// 3), and the item's head above (facts, Your collection when logged in,
// files, scans per copy, the original info file read on opening (answer 2),
// Private info closed). "All versions" on a CD and vinyl bootleg (answer 1).
// No request: the page holds everything. Fixtures:
// scripts/build-sl-item-fixtures.py (vzell's logged-in snapshots, user name
// and Private info scrubbed).

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage, FIXTURE_SETTINGS_OVERRIDE } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const SL = 'https://www.springsteenlyrics.com/';
const FX = name => path.join(__dirname, name);
const ITEMS = {
    'collection-8595': 'collection.php?item=8595&category=album&f_format=12i',
    'collection-5240': 'collection.php?item=5240&category=sampler&f_format=12i',
    'collection-9685': 'collection.php?item=9685&category=vaalbum&f_format=12i',
    'collection-6463': 'collection.php?item=6463&category=single&f_format=cd3',
    'collection-5472': 'collection.php?item=5472&category=single&f_format=cd3',
    'bootlegs-9507': 'bootlegs.php?item=9507&category=aud_live1988',
    'bootlegs-2567': 'bootlegs.php?item=2567',
    'brucelegs-281': 'brucelegs.php?item=281&f_format=vinyl',
    'brucelegs-41': 'brucelegs.php?item=41&f_format=vinyl',
    'brucelegs-148': 'brucelegs.php?item=148&f_format=vinyl',
};

/**
 * Loads an item page fixture under its own URL. Every other request is
 * blocked, except an info file, which is answered by `infoText` and logged.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} key - A key of ITEMS.
 * @param {{infoText?: string, settings?: Object}} [opts]
 * @returns {Promise<{asked: string[], errors: string[]}>}
 */
async function open(page, key, { infoText = 'TAPER: someone\nLINEAGE: tape > wav > flac', settings = {} } = {}) {
    const asked = [];
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    page.on('request', (r) => { if (/springsteenlyrics\.com/.test(r.url()) && !/\.(?:jpg|png|gif)$/.test(r.url())) asked.push(r.url()); });
    await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
    await page.route(/_infofile\.txt$/, (route) => route.fulfill({ status: 200, contentType: 'text/plain', body: infoText }));
    await loadUserscriptPage(page, {
        url: SL + ITEMS[key], fixtureFile: FX(`detail-sl-${key}.html`), testMode: true,
        settingsOverride: { ...FIXTURE_SETTINGS_OVERRIDE, sa_enable_springsteenlyrics: true, sa_render_threshold: 100000,
            sa_foreign_mb_titles: false, sa_foreign_typography: false, ...settings },
    });
    return { asked, errors };
}

/**
 * Presses a button and waits for the render.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} [label]
 * @returns {Promise<void>}
 */
async function show(page, label = 'Show the tracklist') {
    await page.click(`button[data-label="${label}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

// The sub-tables' headings, without their counts and toggles.
const h3s = (page) => page.locator('.project-detail h3.mb-toggle-h3').evaluateAll(hs => hs.map(h => Array.from(h.childNodes)
    .filter(n => n.nodeType === 3).map(n => n.textContent).join('').replace(/\s+/g, ' ').trim()));

/**
 * Every rendered sub-table's rows as {column: text}.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<Array<Object>>>}
 */
function tables(page) {
    return page.evaluate(() => Array.from(document.querySelectorAll('.project-detail table.tbl'))
        .filter(t => !t.closest('.mb-fd-head') && t.tBodies[0] && t.tBodies[0].rows.length)
        .map((table) => {
            const names = Array.from(table.querySelectorAll('thead tr:first-child th')).map(th => th.dataset.colName || th.textContent.trim());
            return Array.from(table.querySelectorAll('tbody tr')).map((tr) => {
                const row = {};
                names.forEach((n, i) => { row[n] = (tr.cells[i]?.textContent || '').replace(/\s+/g, ' ').trim(); });
                return row;
            });
        }));
}

// The head's h2 sections, by their text (without the count).
const heads = (page) => page.locator('.mb-fd-head > h2.mb-fd-h2').evaluateAll(hs => hs.map(h => Array.from(h.childNodes)
    .filter(n => n.nodeType === 3).map(n => n.textContent).join('').replace(/\s+/g, ' ').trim()));

/**
 * A head card's rows as [label, text] pairs.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} name - The card's heading text.
 * @returns {Promise<Array<string[]>>}
 */
function cardRows(page, name) {
    return page.evaluate((n) => {
        const card = Array.from(document.querySelectorAll('.mb-fd-head .mb-sb-card'))
            .find(c => (c.querySelector('.mb-sb-card-head')?.textContent || '').trim().startsWith(n));
        if (!card) return null;
        return Array.from(card.querySelectorAll('dt')).map(dt => [dt.textContent.trim(), dt.nextElementSibling.textContent.trim()]);
    }, name);
}

test.describe('springsteenlyrics.com item pages (sl-*-item)', () => {
    test('collection 8595: one record, the head with Your collection (logged in), scans; no request', async ({ page }) => {
        const { asked, errors } = await open(page, 'collection-8595');
        await expect(page.locator('h1.mb-sl-h1 bdi')).toHaveText('Greetings From Asbury Park, N.J.');
        await show(page);
        expect(await h3s(page)).toEqual(['Record 1']);
        const [rec] = await tables(page);
        expect(rec).toHaveLength(9);
        expect(rec[0]).toEqual({ 'Pos': 'A1', 'Title': 'BLINDED BY THE LIGHT', 'Version / note': '' });
        expect(rec.at(-1)).toMatchObject({ 'Pos': 'B4', 'Title': 'IT\'S HARD TO BE A SAINT IN THE CITY' });
        expect(await heads(page)).toEqual(['Notes', 'Details', 'Scans', 'Private info']);
        expect(await cardRows(page, 'Release')).toEqual([['Version', '2015 remastered reissue'], ['Label', 'Columbia'],
            ['Cat. no.', '88875014221'], ['Format', 'LP'], ['Country', 'Canada'], ['Release date', '2015'], ['Original year', '1973'], ['Copies', '1']]);
        expect(await cardRows(page, 'Your collection')).toEqual([['MusicBrainz', 'MusicBrainz release'], ['Good scans', 'yes'],
            ['Kept in', 'Switzerland'], ['Item', '8595'], ['Edit', 'edit item']]);
        await expect(page.locator('.mb-fd-head a[href^="https://musicbrainz.org/release/6069bf25"]')).toHaveCount(1);
        await expect(page.locator('.mb-fd-head .mb-release-art-tile')).toHaveCount(2);
        // The site's own item content is hidden, our view shows it.
        await expect(page.locator('.project-detail div.blog-post').first()).toBeHidden();
        // Private info: the (scrubbed) note, closed, marked as yours.
        const priv = page.locator('.mb-fd-head > h2.mb-fd-h2', { hasText: 'Private info' });
        await expect(priv.locator('xpath=following-sibling::*[1]')).toBeHidden();
        await expect(page.locator('.mb-fd-head')).toContainText('private note removed for the fixture');
        expect(asked.filter(u => u !== SL + ITEMS['collection-8595'])).toEqual([]);
        expect(errors).toEqual([]);
    });

    // org/image-handling.org P2: one Scans section over both copies; the copy
    // the site lists without scans is a placeholder (until P2 it was left out).
    test('collection 5240: five named records; one Scans section, the empty copy as a placeholder (image section P2)', async ({ page }) => {
        await open(page, 'collection-5240');
        await show(page);
        expect(await h3s(page)).toEqual(['Record 1: "Dancing In The Dark" (CBS TA 4436)', 'Record 2: "Cover Me" (CBS QTA 4662)',
            'Record 3: "I\'m On Fire" (CBS TA 6342)', 'Record 4: "Glory Days" (CBS TA 6375)', 'Record 5: "I\'m Goin\' Down" (CBS A 6561)']);
        const t = await tables(page);
        expect(t.map(r => r.length)).toEqual([2, 5, 4, 4, 2]);
        expect(t[1][0]).toEqual({ 'Pos': 'A1', 'Title': 'COVER ME', 'Version / note': 'Undercover Mix' });
        expect(await heads(page)).toEqual(['Notes', 'Details', 'Scans', 'Private info']);
        const sec = page.locator('.mb-fd-head .mb-release-art-sec');
        await expect(sec.locator('.mb-release-art-chip')).toHaveText(['All 23', 'Copy #1 23', 'Copy #2 0']);
        await expect(sec.locator('.mb-release-art-chip-empty')).toHaveText('Copy #2 0');
        const missing = sec.locator('.mb-release-art-missing');
        await expect(missing).toHaveCount(1);
        await expect(missing.locator('div')).toHaveText('No scans available yet');
        await expect(missing.locator('figcaption')).toHaveText('Copy #2');
        expect(await cardRows(page, 'Release')).toContainEqual(['Copies', '2']);
        expect(await cardRows(page, 'Your collection')).toContainEqual(['Kept in', 'Lebanon']);
    });

    test('collection 6463: two copies with scans in ONE section — chips and By copy per copy, one viewer over both (image section P2)', async ({ page }) => {
        const { errors } = await open(page, 'collection-6463');
        await show(page);
        expect(await heads(page)).toContain('Scans');
        const sec = page.locator('.mb-fd-head .mb-release-art-sec');
        await expect(sec).toHaveCount(1);
        await expect(sec.locator('figure.mb-release-art-tile')).toHaveCount(4);
        await expect(sec.locator('.mb-release-art-chip')).toHaveText(['All 4', 'Copy #1 2', 'Copy #2 2']);
        await expect(sec.locator('[data-mb-art-layout]')).toHaveText(['Grid', 'By copy', 'Table']);
        await expect(sec.locator('.mb-release-art-missing')).toHaveCount(0);
        // One viewer steps across the copies (two sections had two viewers).
        await sec.locator('figure.mb-release-art-tile > a').nth(2).click();
        await expect(page.locator('#mb-art-viewer .mb-artv-pos')).toHaveText('3 / 4');
        await page.keyboard.press('Escape');
        // By copy: a group per copy, in the page's order.
        await sec.locator('[data-mb-art-layout="grouped"]').click();
        await expect(sec.locator('.mb-release-art-group-hdr')).toHaveText(['Copy #1 × 2', 'Copy #2 × 2']);
        // A copy's chip narrows to that copy.
        await sec.locator('.mb-release-art-chip', { hasText: 'Copy #2' }).click();
        await expect(sec.locator('figure.mb-release-art-tile')).toHaveCount(2);
        expect(errors).toEqual([]);
    });

    test('collection 5472: copy #1 without scans comes FIRST, as on the page; the placeholder is never in the viewer (image section P2)', async ({ page }) => {
        const { errors } = await open(page, 'collection-5472');
        await show(page);
        const sec = page.locator('.mb-fd-head .mb-release-art-sec');
        await expect(sec.locator('.mb-release-art-chip')).toHaveText(['All 3', 'Copy #1 0', 'Copy #2 3']);
        // Grid: the three scans and the placeholder.
        await expect(sec.locator('figure.mb-release-art-tile')).toHaveCount(3);
        await expect(sec.locator('.mb-release-art-missing figcaption')).toHaveText('Copy #1');
        // By copy: copy #1 first, with only its placeholder.
        await sec.locator('[data-mb-art-layout="grouped"]').click();
        await expect(sec.locator('.mb-release-art-group-hdr')).toHaveText(['Copy #1 × 0', 'Copy #2 × 3']);
        await expect(sec.locator('.mb-release-art-group').first().locator('.mb-release-art-missing')).toHaveCount(1);
        // Copy #2's chip hides the placeholder; copy #1's alone shows only it.
        await sec.locator('.mb-release-art-chip', { hasText: 'Copy #2' }).click();
        await expect(sec.locator('.mb-release-art-missing')).toHaveCount(0);
        await sec.locator('.mb-release-art-chip', { hasText: 'All' }).click();
        await sec.locator('.mb-release-art-chip', { hasText: 'Copy #1' }).click();
        await expect(sec.locator('.mb-release-art-missing')).toHaveCount(1);
        await expect(sec.locator('figure.mb-release-art-tile')).toHaveCount(0);
        // The viewer holds the three scans only.
        await sec.locator('.mb-release-art-chip', { hasText: 'All' }).click();
        await sec.locator('figure.mb-release-art-tile > a').first().click();
        await expect(page.locator('#mb-art-viewer .mb-artv-pos')).toHaveText('1 / 3');
        expect(errors).toEqual([]);
    });

    test('collection 5472: Table has a Copy column and a row for the copy without scans; Show missing hides it everywhere (image section P4a)', async ({ page }) => {
        const { errors } = await open(page, 'collection-5472');
        await show(page);
        const sec = page.locator('.mb-fd-head .mb-release-art-sec');
        await sec.locator('[data-mb-art-layout="table"]').click();
        const table = sec.locator('table.mb-release-art-table');
        await expect(table.locator('thead th')).toHaveText(['#', 'Picture', 'Type', 'Copy', 'Comment', 'Flags', 'File']);
        await expect(table.locator('tbody tr[data-mb-art-i]')).toHaveCount(3);
        const missingRow = table.locator('tbody tr.mb-release-art-missing-row');
        await expect(missingRow).toHaveCount(1);
        await expect(missingRow.locator('td').nth(3)).toHaveText('Copy #1');
        await expect(missingRow.locator('td').nth(4)).toHaveText('No scans available yet');
        await expect(table.locator('tbody tr[data-mb-art-i]').first().locator('td').nth(6)).toHaveText('5472_01.jpg');
        // Show missing off: no placeholder row, nor tile back in Grid.
        await sec.locator('.mb-release-art-miss input').uncheck();
        await expect(missingRow).toHaveCount(0);
        await sec.locator('[data-mb-art-layout="grid"]').click();
        await expect(sec.locator('.mb-release-art-missing')).toHaveCount(0);
        await expect(sec.locator('.mb-release-art-miss input')).not.toBeChecked();
        await sec.locator('.mb-release-art-miss input').check();
        await expect(sec.locator('.mb-release-art-missing')).toHaveCount(1);
        // A row's picture opens the viewer with the fd-pic card's picture.
        await sec.locator('[data-mb-art-layout="table"]').click();
        await expect(table.locator('a.mb-release-art-row-link').first()).toHaveAttribute('data-mbtt-fn', 'fd-pic');
        await table.locator('a.mb-release-art-row-link').nth(1).click();
        await expect(page.locator('#mb-art-viewer .mb-artv-pos')).toHaveText('2 / 3');
        expect(errors).toEqual([]);
    });

    // vzell, 2026-11-06 (his screenshot: "sc" typed on this page): what the
    // filter matches is marked wherever it shows, and nowhere else.
    test('collection 5472: the filter\'s text is highlighted where it shows — types, group headings, table cells (image section P4a)', async ({ page }) => {
        await open(page, 'collection-5472');
        await show(page);
        const sec = page.locator('.mb-fd-head .mb-release-art-sec');
        await sec.locator('[data-mb-art-layout="grouped"]').click();
        await sec.locator('input.mb-release-art-q').fill('sc');
        const marks = sec.locator('mark.mb-release-art-hl');
        // "Sc" in each of the three "Scan" captions, nothing else.
        await expect(sec.locator('.mb-release-art-types mark.mb-release-art-hl')).toHaveText(['Sc', 'Sc', 'Sc']);
        await expect(marks).toHaveCount(3);
        // The mark splits the text node only: the caption reads as before.
        await expect(sec.locator('.mb-release-art-types').first()).toHaveText('Scan');
        // "co" in the group heading "Copy #2 × 3".
        await sec.locator('input.mb-release-art-q').fill('co');
        await expect(sec.locator('.mb-release-art-group-hdr mark.mb-release-art-hl')).toHaveText(['Co']);
        // Table: the File column's match is marked too.
        await sec.locator('[data-mb-art-layout="table"]').click();
        await sec.locator('input.mb-release-art-q').fill('5472_02');
        await expect(sec.locator('table.mb-release-art-table tbody tr[data-mb-art-i]')).toHaveCount(1);
        await expect(sec.locator('table.mb-release-art-table td mark.mb-release-art-hl')).toHaveText(['5472_02']);
        // No filter, no marks.
        await sec.locator('input.mb-release-art-q').fill('');
        await expect(marks).toHaveCount(0);
    });

    test('collection 9685 (various artists): an Artist column', async ({ page }) => {
        await open(page, 'collection-9685');
        await show(page);
        const [rec] = await tables(page);
        expect(rec[0]).toEqual({ 'Pos': 'A1', 'Title': 'Devotion', 'Artist': 'Earth, Wind & Fire', 'Version / note': '' });
        expect(rec.find(r => r.Pos === 'B6')).toMatchObject({ 'Title': 'BORN TO RUN', 'Artist': 'Bruce Springsteen' });
        expect(await cardRows(page, 'Your collection')).toContainEqual(['MusicBrainz', 'not linked yet']);
    });

    test('bootleg 9507: two discs, Take and Note; Show and Recording; the info file read once, on opening', async ({ page }) => {
        const { asked } = await open(page, 'bootlegs-9507');
        await expect(page.locator('h1.mb-sl-h1 bdi')).toHaveText('25 Feb 1988 (soundcheck) · Centrum In Worcester');
        await show(page);
        expect(await h3s(page)).toEqual(['Disc 1', 'Disc 2']);
        const [d1] = await tables(page);
        expect(d1[1]).toEqual({ 'Pos': '02', 'Title': 'TUNNEL OF LOVE', 'Take': '#2', 'Note': 'partial' });
        expect(d1[8]).toEqual({ 'Pos': '09', 'Title': 'ALL THAT HEAVEN WILL ALLOW', 'Take': '', 'Note': 'intro' });
        expect(await cardRows(page, 'Show')).toEqual([['Date', '25 Feb 1988 (soundcheck)'], ['First date', '1988-02-25'], ['Show', 'soundcheck'],
            ['Place', 'Centrum In Worcester'], ['Locality', 'Worcester'], ['Region', 'MA'], ['Country', 'United States']]);
        expect(await cardRows(page, 'Files')).toEqual([['Info file', '9507_infofile.txt']]);
        expect(await heads(page)).toEqual(['Details', 'Artwork', 'Original info file', 'Private info']);
        expect(asked.filter(u => /infofile/.test(u))).toEqual([]);
        const info = page.locator('.mb-fd-head > h2.mb-fd-h2', { hasText: 'Original info file' });
        await info.click();
        await expect(page.locator('.mb-fd-head pre.mb-fd-pre')).toHaveText('TAPER: someone\nLINEAGE: tape > wav > flac');
        await info.click();
        await info.click();
        expect(asked.filter(u => /infofile/.test(u))).toEqual([SL + 'bootlegs/aud_live1988/9507_infofile.txt']);
    });

    test('bootleg 2567 (a vinyl transfer): sides paired into Record 1; the MusicBrainz link; captions', async ({ page }) => {
        await open(page, 'bootlegs-2567');
        await show(page);
        expect(await h3s(page)).toEqual(['Record 1']);
        expect((await tables(page))[0].map(r => r.Pos)).toEqual(['A1', 'A2', 'A3', 'B1', 'B2', 'B3']);
        expect(await cardRows(page, 'Your collection')).toContainEqual(['MusicBrainz', 'MusicBrainz release']);
        // Since image section P3: the caption names the type ("front" → Front,
        // "disc side 1" / "label side 2" / "runout groove side 1" → Medium); a
        // caption that only repeats its type is not printed again.
        const sec = page.locator('.mb-fd-head .mb-release-art-sec');
        await expect(sec.locator('.mb-release-art-chip')).toHaveText(['All 8', 'Front 1', 'Back 1', 'Medium 6']);
        await expect(sec.locator('.mb-release-art-types').first()).toHaveText('Front');
        await expect(sec.locator('figure.mb-release-art-tile').first().locator('.mb-release-art-comment')).toHaveCount(0);
        await expect(sec.locator('figure.mb-release-art-tile').nth(2).locator('.mb-release-art-comment')).toHaveText('disc side 1');
    });

    test('CD bootleg 281: one unnumbered "Disc" heading is medium 1 — "disc front" and "disc back" go into it (image section P3)', async ({ page }) => {
        await open(page, 'brucelegs-281');
        await show(page);
        const h3 = page.locator('.project-detail h3.mb-toggle-h3').first();
        await expect(h3.locator('.mb-medium-art > .mb-medium-art-btn')).toHaveCount(2);
        await expect(page.locator('.mb-fd-head .mb-release-art-chip')).toHaveText(['All 7', 'Front 1', 'Back 2', 'Booklet 2', 'Medium 2']);
    });

    // org/image-handling.org P3: the record's Medium pictures in its heading,
    // as on a MusicBrainz release; one record takes them all (R7's rule 1).
    test('bootleg 2567: the six Medium pictures go into "Record 1"\'s heading; a thumb opens the viewer on them (image section P3)', async ({ page }) => {
        const { errors } = await open(page, 'bootlegs-2567');
        await show(page);
        const h3 = page.locator('.project-detail h3.mb-toggle-h3').first();
        await expect(h3.locator('.mb-medium-art > .mb-medium-art-btn')).toHaveCount(4);
        await expect(h3.locator('.mb-medium-art > .mb-medium-art-more')).toHaveText('+2');
        await expect(h3.locator('.mb-medium-art-note')).toHaveCount(0);
        // External pictures: their own URLs, no referrer on the card.
        expect(await h3.locator('.mb-medium-art-btn img').first().getAttribute('src')).toMatch(/^https:\/\/www\.springsteenlyrics\.com\/.*2567_artwork_03_tn\.jpg$/);
        expect(await h3.locator('.mb-medium-art-btn').first().getAttribute('data-mbtt')).toContain('referrerpolicy="no-referrer"');
        await h3.locator('.mb-medium-art-btn').nth(1).click();
        const viewer = page.locator('#mb-art-viewer');
        await expect(viewer).toBeVisible();
        await expect(viewer.locator('.mb-artv-pos')).toHaveText('2 / 6');
        await expect(h3, 'the click did not collapse the record').not.toHaveClass(/mb-collapsed|collapsed/);
        expect(errors).toEqual([]);
    });

    test('CD bootleg 281: Length, notes, the inner ring text, the PDF', async ({ page }) => {
        await open(page, 'brucelegs-281');
        await show(page);
        expect(await h3s(page)).toEqual(['Disc (82:40.00)']);
        const [disc] = await tables(page);
        expect(disc).toHaveLength(15);
        expect(disc[0]).toEqual({ 'Pos': '01', 'Title': 'The Ghost Of Tom Joad', 'Version': '', 'Note': '', 'Length': '5:45.15' });
        expect(await heads(page)).toEqual(['Notes', 'Release info', 'Details', 'Artwork']);
        expect(await cardRows(page, 'Runout / inner ring')).toEqual([['Disc', 'GSG020 C70117']]);
        expect(await cardRows(page, 'Files')).toEqual([['PDF', 'PDF file 1']]);
    });

    test('vinyl bootleg 41, the second button: its six versions as one table with the list\'s columns', async ({ page }) => {
        // A second press reloads the page and presses again (docs/claude/
        // fetch-and-render-pipeline.md), so each view is pressed on a fresh load.
        await open(page, 'brucelegs-41');
        await show(page, 'Show all versions of this bootleg');
        expect(await h3s(page)).toEqual(['All versions']);
        const [versions] = await tables(page);
        expect(versions).toHaveLength(6);
        expect(new Set(versions.map(v => v.Title))).toEqual(new Set(['A Journey Thru The USA Part 1']));
        expect(versions.map(v => v.Version)).toEqual(expect.arrayContaining([
            'Limited Edition #200 copies numbered - Picture Disc', 'Red Cover - Colored Vinyl', 'No Numbered - Picture Disc']));
        expect(versions.every(v => v.Label === 'Rock Records' && v.PDF === 'yes')).toBe(true);
        const items = await page.evaluate(() => Array.from(document.querySelectorAll('.project-detail table.tbl:not(.mb-sl-item-table) tbody tr'))
            .map(tr => (tr.querySelector('a[href*="item="]').getAttribute('href').match(/item=(\d+)/) || [])[1]));
        expect(items.sort((a, b) => a - b)).toEqual(['8', '38', '39', '40', '41', '42']);
    });

    test('a bootleg whose page lists itself as its only version gets no All versions button', async ({ page }) => {
        await open(page, 'brucelegs-281');
        await expect(page.locator('button[data-label="Show the tracklist"]')).toBeVisible();
        await expect(page.locator('button[data-label="Show all versions of this bootleg"]')).toHaveCount(0);
        await open(page, 'brucelegs-41');
        await expect(page.locator('button[data-label="Show all versions of this bootleg"]')).toBeVisible();
    });

    test('the preview cache keeps a logged-in and a public read apart (login state in the record)', async ({ page }) => {
        // A logged-in page carries the MusicBrainz link and flags a public
        // one lacks; the cache is keyed by URL only, so the record says
        // which state it was read in, and the other state is a miss.
        await open(page, 'collection-8595');
        const usable = (s) => page.evaluate((x) => window.__saTest.dpRecUsable('springsteenlyrics.com', x === null ? undefined : x), s);
        expect(await usable('in')).toBe(true);
        expect(await usable('out')).toBe(false);
        expect(await usable(null)).toBe(true);
        // The parser stamps the state the page was read in.
        const stamp = await page.evaluate((u) => window.__saTest.dpParse('springsteenlyrics.com', document.documentElement.outerHTML, u).session,
            SL + ITEMS['collection-8595']);
        expect(stamp).toBe('in');
    });

    test('the preview cache on a logged-out page: a logged-in record is a miss', async ({ page }) => {
        await open(page, 'brucelegs-148');
        const usable = (s) => page.evaluate((x) => window.__saTest.dpRecUsable('springsteenlyrics.com', x), s);
        expect(await usable('out')).toBe(true);
        expect(await usable('in')).toBe(false);
    });

    test('vinyl bootleg 148 (logged out): sides A–H paired into four records, versions split off; no Your collection', async ({ page }) => {
        await open(page, 'brucelegs-148');
        await show(page);
        expect(await h3s(page)).toEqual(['Record 1', 'Record 2', 'Record 3', 'Record 4']);
        const t = await tables(page);
        expect(t.map(r => r.length)).toEqual([6, 7, 6, 7]);
        expect(t[0][0]).toEqual({ 'Pos': 'A1', 'Title': '4th Of July, Asbury Park (Sandy)', 'Version': 'V1', 'Note': '' });
        expect(t[1][4]).toEqual({ 'Pos': 'D2', 'Title': 'Phantoms aka Wild Zero And Blind Terry', 'Version': 'V1', 'Note': 'backing track' });
        expect(await cardRows(page, 'Your collection')).toBeNull();
        expect(await cardRows(page, 'Runout groove etchings')).toContainEqual(['Side C', 'July c']);
        expect(await heads(page)).not.toContain('Private info');
    });
});

// The site's Bootstrap 3 grid, as the fixtures carry no stylesheet (the same
// rules as sl-sticky-headers.spec.js, plus the item pages' `.col-md-12` and
// the container width of a wide window). vzell, 2026-11-04: an item page had
// "so much empty space on both sides" (bootlegs.php?item=4615), and All
// versions squeezed the head into a column ~150 px wide (brucelegs.php?item=148,
// debug/sl-brucelegs-all-versions.html: its one-row table is 2307 px wide).
const BOOTSTRAP_CSS = [
    '*, *::before, *::after { box-sizing: border-box; }',
    '.container { padding-left: 15px; padding-right: 15px; margin-left: auto; margin-right: auto; }',
    '.row { margin-left: -15px; margin-right: -15px; }',
    '.row::after { content: ""; display: table; clear: both; }',
    '.col-sm-12, .col-md-12 { position: relative; min-height: 1px; padding-left: 15px; padding-right: 15px; float: left; width: 100%; }',
    '@media (min-width: 1200px) { .container { width: 1170px; } }',
].join('\n');

test.describe('springsteenlyrics.com item pages: the width of the window', () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 1600, height: 900 });
    });

    test('the tracklist and its head use the window\'s width, not the site\'s 1170 px container', async ({ page }) => {
        await open(page, 'bootlegs-9507');
        await page.addStyleTag({ content: BOOTSTRAP_CSS });
        await show(page);
        const w = await page.evaluate(() => {
            const h2 = document.querySelector('h2.mb-sl-list-heading');
            const box = h2.getBoundingClientRect();
            const narrow = [];
            for (let el = h2.parentElement; el; el = el.parentElement) {
                if (el.classList.contains('container') && !el.classList.contains('mb-sl-wide')) narrow.push(el.className);
            }
            return { width: box.width, narrow };
        });
        expect(w.narrow, 'no fixed-width container around the view').toEqual([]);
        expect(w.width, 'the h2 bar spans the window, not 1170 px').toBeGreaterThan(1400);
    });

    test('All versions: a wide table leaves the toolbar and the head their width', async ({ page }) => {
        await open(page, 'brucelegs-41');
        await page.addStyleTag({ content: BOOTSTRAP_CSS });
        await show(page, 'Show all versions of this bootleg');
        const g = await page.evaluate(() => {
            const r = (s) => document.querySelector(s).getBoundingClientRect();
            const right = Array.from(document.querySelectorAll('.mb-fd-head .mb-sb-card'))
                .find(c => /^Your collection/.test(c.querySelector('.mb-sb-card-head').textContent.trim()));
            return { h1: r('h1.mb-sl-h1').width, h1H: r('h1.mb-sl-h1 bdi').height, details: right.getBoundingClientRect().width,
                table: r('.project-detail table.tbl:not(.mb-sl-item-table)').width };
        });
        expect(g.table, 'premise: the one-row table is wider than the window').toBeGreaterThan(1600);
        expect(g.h1, 'the toolbar heading is not squeezed').toBeGreaterThan(1000);
        expect(g.h1H, 'the name on one line').toBeLessThan(60);
        // The left rail (Release, Runout) has the shared head's fixed width,
        // as in the Tracklist view; the right column spans the rest.
        expect(g.details, 'the right column\'s card spans the window').toBeGreaterThan(1000);
    });
});
