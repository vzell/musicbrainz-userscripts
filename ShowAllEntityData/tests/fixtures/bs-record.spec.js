'use strict';

// brucespringsteen.it: a record's own page (bs-record; 2026-11-06,
// org/brucespringsteen.it.org, mockup
// https://claude.ai/artifact/XULiW1dUFME9F4nbsrQokD). The tracklist as
// release-tracks shows a release: a sub-table per record or disc, vinyl sides
// paired when the count adds up (vzell: "Pair sides when it adds up"), the
// source show split into Date, Show and Country ("Date + Show + Country"),
// and the record's facts, notes, sources and photo above. No request: the
// page holds everything. The page's own song and show links get their real
// pages, so they preview; their onclick (the site's small window) stays.
// Fixtures: scripts/build-bs-fixtures.py (curl captures of the five pages
// vzell saved as debug/KF-*-initial.html).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadBsRecordPage, loadBsRecordInFrameset, bsRecordUrl } = require('../support/bsFixture');
const { waitForRenderComplete } = require('../support/browser');
const { clickToolbarItem } = require('../support/toolbarMenu');

const BS = 'https://www.brucespringsteen.it/DB/';

/**
 * Presses the record page's button and waits for the render.
 *
 * @param {import('@playwright/test').Page|import('@playwright/test').Frame} page
 * @returns {Promise<void>}
 */
async function show(page) {
    await page.click('h1.mb-bs-h1 button[data-label="Show the tracklist"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

// The sub-tables' headings, without their counts and toggles.
const h3s = (page) => page.locator('h3.mb-toggle-h3').evaluateAll(hs => hs.map(h => Array.from(h.childNodes)
    .filter(n => n.nodeType === 3).map(n => n.textContent).join('').replace(/\s+/g, ' ').trim()));

/**
 * Every rendered sub-table's rows as {column: text}, plus the Title's and
 * Show's link hrefs as `_song` and `_show`.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<Array<Object>>>}
 */
function tables(page) {
    return page.evaluate(() => Array.from(document.querySelectorAll('table.tbl'))
        .filter(t => !t.closest('.mb-fd-head') && t.tBodies[0] && t.tBodies[0].rows.length)
        .map((table) => {
            const names = Array.from(table.querySelectorAll('thead tr:first-child th')).map(th => th.dataset.colName || th.textContent.trim());
            return Array.from(table.querySelectorAll('tbody tr')).map((tr) => {
                const row = {};
                names.forEach((n, i) => { row[n] = (tr.cells[i]?.textContent || '').replace(/\s+/g, ' ').trim(); });
                const a = (n) => tr.cells[names.indexOf(n)]?.querySelector('a[href]');
                row._song = a('Title') ? a('Title').href : '';
                row._show = a('Show') ? a('Show').href : '';
                row._target = a('Title') ? a('Title').getAttribute('target') || '' : '';
                return row;
            });
        }));
}

/**
 * The column names of the first rendered sub-table.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string[]>}
 */
const headers = (page) => page.evaluate(() => {
    const t = Array.from(document.querySelectorAll('table.tbl')).find(x => !x.closest('.mb-fd-head') && x.tBodies[0] && x.tBodies[0].rows.length);
    return Array.from(t.querySelectorAll('thead tr:first-child th')).map(th => th.dataset.colName || th.textContent.trim());
});

/**
 * A Details card's rows as [label, value] pairs.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} name The card's heading.
 * @returns {Promise<string[][]>}
 */
function card(page, name) {
    return page.evaluate((nm) => {
        const c = Array.from(document.querySelectorAll('.mb-fd-head section.mb-sb-card'))
            .find(x => (x.querySelector(':scope > .mb-sb-card-head > span:first-child') || {}).textContent === nm);
        if (!c) return null;
        return Array.from(c.querySelectorAll('dt')).map(dt => [dt.textContent.trim(), (dt.nextElementSibling?.textContent || '').replace(/\s+/g, ' ').trim()]);
    }, name);
}

test.describe('brucespringsteen.it: a record\'s own page (bs-record, 2026-11-06)', () => {
    test('the initial page: our h1 with the button, the script links given their pages, the site\'s onclick kept', async ({ page }) => {
        const { errors } = await loadBsRecordPage(page, 'COLPC2368543');
        await expect(page.locator('h1.mb-bs-h1 bdi')).toHaveText('THE RIVER -- \'blank red label\' misprint');
        await expect(page.locator('h1.mb-bs-h1 button[data-label="Show the tracklist"]')).toHaveCount(1);
        // The h1 sits after the site's notice (and its <hr>), before the
        // record block, which holds the facts, notes and tracklist.
        expect(await page.evaluate(() => {
            const h1 = document.querySelector('h1.mb-bs-h1');
            const native = document.querySelector('.mb-bs-record-native');
            return [h1.previousElementSibling?.nodeName, !!(h1.compareDocumentPosition(native) & Node.DOCUMENT_POSITION_FOLLOWING),
                native.querySelectorAll('table tr').length, /Title\s*:/.test(native.textContent)];
        })).toEqual(['HR', true, 21, true]);
        const first = page.locator('.mb-bs-record-native table tr').nth(1);
        await expect(first.locator('td').nth(1).locator('a')).toHaveAttribute('href', `${BS}sd3.aspx?sid=586`);
        await expect(first.locator('td').nth(2).locator('a')).toHaveAttribute('href', `${BS}mn.aspx?ex=S198010101`);
        await expect(first.locator('td').nth(1).locator('a')).toHaveAttribute('onclick', /hs\('586'\)/);
        // A plain click still runs the site's own window opener (stubbed).
        await first.locator('td').nth(1).locator('a').click();
        expect(await page.evaluate(() => window.__bsSiteCalls)).toEqual([['hs', '586']]);
        await expect(page).toHaveURL(bsRecordUrl('COLPC2368543'));
        expect(errors).toEqual([]);
    });

    test('LPATY1 (10 LP, 20 side groups): Records 1–10, sides paired; no request on the press', async ({ page }) => {
        const { requests, errors } = await loadBsRecordPage(page, 'LPATY1');
        const before = requests.length;
        await show(page);
        const after = requests.slice(before).filter(u => /brucespringsteen\.it\/DB\/(?:detrec|sd3|mn)\.aspx/i.test(u));
        expect(after, 'no record, song or show page asked by the press').toEqual([]);
        expect(await h3s(page)).toEqual(Array.from({ length: 10 }, (_, k) => `Record ${k + 1} (sides ${2 * k + 1} + ${2 * k + 2})`));
        const t = await tables(page);
        // Sides 1+2: 2+3 tracks, … sides 19+20: 4+6 (13/1 holds two rows).
        expect(t.map(x => x.length)).toEqual([5, 6, 5, 6, 6, 7, 6, 9, 10, 10]);
        expect(t[0][0]).toMatchObject({ Pos: '1/1', Title: 'Oh mama why?', Date: '1971-01-18', Show: 'Sayreville, NJ, D\' Scene', Country: 'USA', Notes: '', Ver: '' });
        // A ditto (") repeats the row above's show.
        expect(t[0][1]).toMatchObject({ Pos: '1/2', Date: '1971-01-18', Show: 'Sayreville, NJ, D\' Scene', Country: 'USA' });
        expect(t[0][1]._show).toBe(`${BS}mn.aspx?ex=197101181`);
        expect(t[0][0]._song).toBe(`${BS}sd3.aspx?sid=411`);
        expect(t[0][0]._target).toBe('_blank');
        // A note, and a studio session's version number.
        expect(t[1][0]).toMatchObject({ Pos: '3/1', Notes: 'Listed as 30-Aug-1972' });
        const dlb = t[7].find(r => r.Title === 'Don\'t look back');
        expect(dlb, 'record 8 holds sides 15 + 16').toBeTruthy();
        expect(dlb).toMatchObject({ Pos: '15/3', Show: 'New York, NY, Record Plant / Atlantic studios', Date: '1977-06-01', Ver: '3' });
        expect(dlb._show).toBe(`${BS}mn.aspx?ex=S197706001`);
        expect(await headers(page)).toEqual(['Pos', 'Title', 'Date', 'Show', 'Country', 'Notes', 'Ver']);
        // The site's record block is hidden; our view shows all of it.
        await expect(page.locator('.mb-bs-record-native')).toBeHidden();
        expect(errors).toEqual([]);
    });

    test('the other shapes: 2 LP with two groups, a 7" single, 5 CD with medleys, 3 CD-R', async ({ page }) => {
        await loadBsRecordPage(page, 'COLPC2368543');
        await show(page);
        expect(await h3s(page)).toEqual(['Record 1', 'Record 2']);
        const river = await tables(page);
        expect(river.map(x => x.length)).toEqual([11, 9]);
        expect(river[0][0]).toMatchObject({ Title: 'The ties that bind', Show: 'Album release, The river', Country: 'USA', Date: '1980-10-10', Ver: '99' });
    });

    for (const [code, names, counts] of [
        ['CBS39404', ['Record 1 (sides A + B)'], [2]],
        ['CDATY1', ['Disc 1', 'Disc 2', 'Disc 3', 'Disc 4', 'Disc 5'], [10, 11, 12, 15, 19]],
        ['CR3TIM1', ['Disc 1', 'Disc 2', 'Disc 3'], [11, 7, 12]],
    ]) {
        test(`${code}: sub-tables ${names.join(', ')}`, async ({ page }) => {
            await loadBsRecordPage(page, code);
            await show(page);
            expect(await h3s(page)).toEqual(names);
            expect((await tables(page)).map(x => x.length)).toEqual(counts);
        });
    }

    test('CDATY1: a medley keeps both rows at one position', async ({ page }) => {
        await loadBsRecordPage(page, 'CDATY1');
        await show(page);
        const t = await tables(page);
        expect(t[0].filter(r => r.Pos === '1/2').map(r => r.Title)).toEqual(['Dancing in the street', 'Honky tonk woman']);
        expect(t[4].filter(r => r.Pos === '5/16').map(r => r.Title)).toEqual(['Lucille', 'On the prowl']);
    });
});

test.describe('brucespringsteen.it record page: the head', () => {
    test('a bootleg: subheader, the line before Notes as a note, facts as the page names them, Sources, the photo', async ({ page }) => {
        await loadBsRecordPage(page, 'LPATY1');
        await show(page);
        await expect(page.locator('p.mb-fd-sub')).toHaveText('~ Bootleg by Bruce Springsteen');
        const notes = page.locator('.mb-fd-head .mb-fd-text').first();
        await expect(notes).toContainText('The original version is numbered.');
        await expect(notes).toContainText('500 un-numbered copies were further pressed from the same plates.');
        const rec = await card(page, 'Record');
        expect(rec).toEqual([
            ['Title', 'ALL THOSE YEARS'], ['Support', '10 LP'], ['Matrix', 'SR 111-1102'], ['Producer', 'Heart and Soul'],
            ['Vinyl', 'Black'], ['Code', 'LPATY1'], ['This page', 'detrec.aspx?code=LPATY1'],
        ]);
        const src = await card(page, 'Sources');
        // 29 shows: a show met again later (Max's Kansas City 18-Jul-1973,
        // records 2 and 4) is one entry, its tracks counted together.
        expect(src[0]).toEqual(['70 tracks', 'from 29 shows']);
        expect(src[1]).toEqual(['1971-01-18', 'Sayreville, NJ, D\' Scene (USA) · 5 tracks']);
        expect(src).toHaveLength(30);
        await expect(page.locator('.mb-fd-head a[href$="mn.aspx?ex=197101181"]')).toHaveCount(1);
        // The photo, as the art section: one tile, the type Photo.
        await expect(page.locator('.mb-fd-head figure.mb-release-art-tile')).toHaveCount(1);
        await expect(page.locator('.mb-fd-head figure.mb-release-art-tile img')).toHaveAttribute('src', /blegs\/images\/LPATY1\.jpg$/);
    });

    test('an official promo: the kind, the release period, Promo, no Sources wider than one show', async ({ page }) => {
        await loadBsRecordPage(page, 'CBS39404');
        await show(page);
        await expect(page.locator('p.mb-fd-sub')).toHaveText('~ Official release by Bruce Springsteen (1976 (Oct))');
        await expect(page.locator('h1.mb-bs-h1 bdi')).toHaveText('10TH AVENUE FREEZE OUT / SHE\'S THE ONE');
        const rec = await card(page, 'Record');
        expect(rec).toEqual([
            ['Title', '10TH AVENUE FREEZE OUT / SHE\'S THE ONE'], ['Support', '1 7 in.'], ['Catalogue number', 'CBS 3940'],
            ['Pressed in', 'Germany'], ['Release period', '1976 (Oct)'], ['Promo', 'yes'], ['Code', 'CBS39404'],
            ['This page', 'detrec.aspx?code=CBS39404'],
        ]);
        expect((await card(page, 'Sources'))[0]).toEqual(['2 tracks', 'from 1 show']);
    });

    test('a photo the site cannot load (404) is no picture at all', async ({ page }) => {
        await loadBsRecordPage(page, 'CBS39404', { photo: '404' });
        await show(page);
        await expect(page.locator('.mb-fd-head figure.mb-release-art-tile')).toHaveCount(0);
        await expect(page.locator('.mb-fd-head')).toBeVisible();
    });
});

test.describe('brucespringsteen.it record page: gates and frames', () => {
    test('setting off: nothing happens, the page stays the site\'s', async ({ page }) => {
        await loadBsRecordPage(page, 'CR3TIM1', { enabled: false });
        await expect(page.locator('h1.mb-bs-h1')).toHaveCount(0);
        await expect(page.locator('.mb-bs-record-native')).toHaveCount(0);
        await expect(page.locator('a[href="#"][onclick*="hs("]').first()).toBeAttached();
    });

    test('in the frameset\'s right frame (principale) the button is there; in another frame it is not', async ({ page }) => {
        const frame = await loadBsRecordInFrameset(page, 'CR3TIM1');
        await expect(frame.locator('h1.mb-bs-h1 button[data-label="Show the tracklist"]')).toHaveCount(1);
        await show(frame);
        await expect(frame.locator('h3.mb-toggle-h3')).toHaveCount(3);
    });

    test('in a frame of any other name the script does nothing', async ({ page }) => {
        const frame = await loadBsRecordInFrameset(page, 'CR3TIM1', { frameName: 'elsewhere' });
        await expect(frame.locator('a[href="#"][onclick*="hs("]').first()).toBeAttached();
        await expect(frame.locator('h1.mb-bs-h1')).toHaveCount(0);
    });
});

test.describe('brucespringsteen.it record page: Save to Disk → Load from Disk', () => {
    let tmpDir;

    test.beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-bs-record-disk-'));
    });

    test.afterEach(() => {
        if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('a saved record view renders again on a fresh page: the sub-tables, the site\'s block hidden, one data table per medium', async ({ context }) => {
        const source = await context.newPage();
        const { errors: sourceErrors } = await loadBsRecordPage(source, 'CR3TIM1');
        await show(source);
        const before = await tables(source);
        const downloadPromise = source.waitForEvent('download', { timeout: 60000 });
        await clickToolbarItem(source, '#mb-save-to-disk-btn');
        await source.locator('#sa-sd-save-confirm').waitFor({ state: 'visible', timeout: 15000 });
        await source.click('#sa-sd-save-confirm');
        const saved = path.join(tmpDir, 'bs-record.json.gz');
        await (await downloadPromise).saveAs(saved);
        expect(sourceErrors).toEqual([]);
        await source.close();

        const page = await context.newPage();
        const { errors } = await loadBsRecordPage(page, 'CR3TIM1');
        await expect(page.locator('.mb-bs-record-native')).toBeVisible();
        await clickToolbarItem(page, '#mb-load-from-disk-btn');
        await page.locator('input[type="file"][accept*="json"]').setInputFiles(saved);
        const renderBtn = page.locator('#sa-render-no-filter-confirm');
        await renderBtn.waitFor({ state: 'attached', timeout: 15000 });
        await renderBtn.evaluate((el) => el.click());
        await waitForRenderComplete(page, { waitForAutoResize: false });
        expect(await h3s(page)).toEqual(['Disc 1', 'Disc 2', 'Disc 3']);
        expect(await tables(page)).toEqual(before);
        await expect(page.locator('.mb-bs-record-native')).toBeHidden();
        await expect(page.locator('h2.mb-bs-list-heading')).toHaveCount(1);
        // The head is read again from the record page the file is loaded on.
        await expect(page.locator('p.mb-fd-sub')).toHaveText('~ Bootleg by Bruce Springsteen');
        await expect(page.locator('.mb-fd-head section.mb-sb-card')).toHaveCount(2);
        expect(errors).toEqual([]);
    });
});
