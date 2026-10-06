'use strict';

// pageType 'event-overview' (org/event-overview-pt.org, WIP.2): the setlist as
// tables.
//
// Fixture: tests/fixtures/event-overview.html (see event-overview.spec.js). Its
// p.setlist holds 21 "Artist:" lines joined by "&" / "with" / "and", then a
// blank line, "Soundcheck" (3 songs), a blank line, "Concert" with the note
// "Scheduled: 19:30 | Local Start Time 19:40 / End Time 22:29" and 26 song
// lines — one of them the medley "Land of Hope and Dreams / People Get Ready".
// Three songs are played in both parts. The page's 26 "recording location for"
// recordings carry the concert's song titles.
//
// What each test pins, and the neighbouring property it keeps apart:
//
//  1. ONE TABLE PER PART AFTER THE LINE-UP, aligned, and the native setlist
//     gone. "Three tables appear" passes on code that leaves the paragraph
//     on the page as well.
//  2. THE LINE-UP'S BILLING: "&" keeps the group, every other joining word
//     starts the next one. Counting artists passes on a parser that ignores
//     the joining words.
//  3. A MEDLEY LINE IS ONE ROW WITH ITS WORKS; "Also in" names the other part
//     by work, not by title text; Recording links the recording made here
//     whose title is the line (the medley included).
//  4. A PART'S NOTE SITS UNDER ITS H3, not in a row.
//  5. ONE TABLE for the whole setlist, with a Part column, when set.
//  6. NEITHER PART NEEDS THE OTHER: setlist off leaves it native; relationships
//     off still converts the setlist, anchored on its own h2.
//  7. NO HEADER, AND A SONG WITHOUT A WORK LINK: the songs go to "Songs" and
//     the plain line is a row, not dropped.
//  8. A SAVE/LOAD ROUND TRIP KEEPS THE NOTE (group.introHtml is stored).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { clickToolbarItem } = require('../support/toolbarMenu');

const URL = 'https://musicbrainz.org/event/3f2ca30a-7de4-4964-ad30-48376535fec8';
const FIXTURE = path.join(__dirname, 'event-overview.html');
const BUTTON = 'button[data-label="Show all Relationships for Event"]';
const NOTE = 'Scheduled: 19:30 | Local Start Time 19:40 / End Time 22:29';

/**
 * Loads the event fixture (optionally rewritten), presses the button and
 * waits for the render.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{settings?: Object, rewrite?: function(string): string, press?: boolean}} [opts]
 */
async function openEvent(page, { settings = {}, rewrite = null, press = true } = {}) {
    await page.context().route('https://static.metabrainz.org/**', (route) => route.abort('blockedbyclient'));
    let fixtureFile = FIXTURE;
    if (rewrite) {
        fixtureFile = path.join(__dirname, '..', '..', 'test-results', `event-setlist-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
        fs.mkdirSync(path.dirname(fixtureFile), { recursive: true });
        fs.writeFileSync(fixtureFile, rewrite(fs.readFileSync(FIXTURE, 'utf8')));
    }
    await loadUserscriptPage(page, {
        url: URL, fixtureFile, testMode: true,
        settingsOverride: { sa_enable_event_overview: true, sa_event_overview_setlist: true, ...settings },
    });
    await page.route('https://musicbrainz.org/event/**', (route) => route.fulfill({ path: fixtureFile, contentType: 'text/html' }));
    await page.route('https://eventartarchive.org/**', (route) => route.fulfill({ status: 404, body: '' }));
    if (!press) return;
    await page.click(BUTTON);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/**
 * Every rendered group: name, header cells, intro text, and each row's cells
 * (text, plus the number of list items and recording links per cell).
 *
 * @param {import('@playwright/test').Page} page
 */
const groups = (page) => page.evaluate(() => Array.from(document.querySelectorAll('h3.mb-toggle-h3')).map((h3) => {
    let t = h3.nextElementSibling;
    let intro = '';
    while (t && t.tagName !== 'TABLE') {
        if (t.classList.contains('mb-group-intro')) intro = t.textContent.trim();
        t = t.nextElementSibling;
    }
    const icon = h3.querySelector('.mb-toggle-icon');
    const name = icon && icon.nextSibling ? icon.nextSibling.textContent.trim() : h3.textContent.trim();
    const heads = t ? Array.from(t.querySelectorAll('thead tr:first-child th')).map((th) => (th.dataset.colName || th.textContent).replace(/[⇅▲▼📊]/gu, '').trim()) : [];
    const rows = t ? Array.from(t.querySelectorAll('tbody tr')).map((tr) => Array.from(tr.cells).map((td) => ({
        text: td.textContent.replace(/\s+/g, ' ').trim(),
        items: td.querySelectorAll('li').length,
        recs: td.querySelectorAll('a[href^="/recording/"]').length,
        works: td.querySelectorAll('a[href^="/work/"]').length,
    }))) : [];
    return { name, heads, intro, rows };
}));

/** @returns {Object<string, Object>} groups by name. */
const byName = async (page) => Object.fromEntries((await groups(page)).map((g) => [g.name, g]));

test.describe('pageType event-overview: the setlist as tables (WIP.2)', () => {
    test('a Line-up table, then one table per part, aligned; the native setlist is gone', async ({ page }) => {
        await openEvent(page);
        const g = await groups(page);
        const setlist = g.filter((x) => x.name.startsWith('Setlist: '));
        expect(setlist.map((x) => [x.name, x.rows.length])).toEqual([
            ['Setlist: Line-up', 21], ['Setlist: Soundcheck', 3], ['Setlist: Concert', 26],
        ]);
        expect(g.indexOf(setlist[0]), 'after the relationship tables').toBeGreaterThan(0);
        const s = Object.fromEntries(setlist.map((x) => [x.name, x]));
        expect(s['Setlist: Line-up'].heads.slice(0, 4)).toEqual(['#', 'Artist', 'Joined by', 'Billing']);
        expect(s['Setlist: Concert'].heads.slice(0, 5)).toEqual(['#', 'Song', 'Medley', 'Also in', 'Recording']);
        expect(s['Setlist: Soundcheck'].heads.slice(0, 4)).toEqual(['#', 'Song', 'Also in', 'Recording']);
        setlist.forEach((x) => x.rows.forEach((r, k) => expect(r.length, `${x.name} row ${k + 1}`).toBe(x.heads.length)));
        const native = await page.evaluate(() => ({
            h2: document.querySelectorAll('#content h2.setlist').length,
            p: document.querySelectorAll('#content p.setlist').length,
        }));
        expect(native).toEqual({ h2: 0, p: 0 });
    });

    test('the line-up\'s billing: "&" keeps the group, "with" / "and" start the next', async ({ page }) => {
        await openEvent(page);
        const lineup = (await byName(page))['Setlist: Line-up'];
        const pick = (artist) => {
            const r = lineup.rows.find((x) => x[1].text === artist);
            return [r[2].text, r[3].text];
        };
        expect(pick('Bruce Springsteen')).toEqual(['', '1']);
        expect(pick('The E Street Band')).toEqual(['&', '1']);
        expect(pick('Roy Bittan')).toEqual(['with', '2']);
        expect(pick('Max Weinberg')).toEqual(['', '2']);
        expect(pick('Charles Giordano')).toEqual(['and', '3']);
        expect(pick('The E Street Horns')).toEqual(['and', '4']);
        expect(pick('Jake Clemons')).toEqual(['with', '5']);
        expect(pick('The E Street Choir')).toEqual(['and', '6']);
        expect(pick('Michelle Moore')).toEqual(['', '7']);
        // Billing is a declared integer column: right-aligned, tabular figures.
        expect(await page.evaluate(() => {
            const h3 = Array.from(document.querySelectorAll('h3.mb-toggle-h3')).find((h) => h.textContent.includes('Setlist: Line-up'));
            let t = h3.nextElementSibling;
            while (t && t.tagName !== 'TABLE') t = t.nextElementSibling;
            return Array.from(t.querySelectorAll('tbody tr')).every((tr) => tr.cells[3].dataset.mbIntColStyled === '1');
        })).toBe(true);
    });

    test('a medley is one row with its works; "Also in" and "Recording" cross-reference', async ({ page }) => {
        await openEvent(page);
        const g = await byName(page);
        const concert = g['Setlist: Concert'];
        const col = (h) => concert.heads.indexOf(h);
        const medley = concert.rows[1];
        expect(medley[col('Song')].items, 'one row, one list item per work').toBe(2);
        expect(medley[col('Song')].works).toBe(2);
        expect(medley[col('Medley')].text).toBe('medley');
        expect(medley[col('Recording')].recs, 'the medley\'s own recording').toBe(1);
        const also = concert.rows.filter((r) => r[col('Also in')].text === 'Soundcheck').map((r) => r[col('Song')].text);
        expect(also).toEqual(['No Surrender', 'Something in the Night', 'Reason to Believe']);
        expect(concert.rows.filter((r) => r[col('Recording')].recs === 1)).toHaveLength(26);
        const soundcheck = g['Setlist: Soundcheck'];
        expect(soundcheck.rows.map((r) => r[soundcheck.heads.indexOf('Also in')].text)).toEqual(['Concert', 'Concert', 'Concert']);
    });

    test('a part\'s note sits under its h3, not in a row', async ({ page }) => {
        await openEvent(page);
        const g = await byName(page);
        expect(g['Setlist: Concert'].intro).toBe(NOTE);
        expect(g['Setlist: Soundcheck'].intro).toBe('');
        expect(g['Setlist: Concert'].rows.some((r) => r.some((c) => c.text.includes('Scheduled')))).toBe(false);
    });

    test('"One table for the whole setlist": every song with a Part column', async ({ page }) => {
        await openEvent(page, { settings: { sa_event_overview_setlist_one_table: true } });
        const g = await byName(page);
        expect(Object.keys(g).filter((n) => n.startsWith('Setlist: '))).toEqual(['Setlist: Line-up', 'Setlist: All songs']);
        const all = g['Setlist: All songs'];
        expect(all.rows).toHaveLength(29);
        expect(all.heads.slice(0, 3)).toEqual(['Part', '#', 'Song']);
        expect(all.rows[3].map((c) => c.text).slice(0, 2)).toEqual(['Concert', '1']);
        expect(all.intro).toBe(`Concert: ${NOTE}`);
    });

    test('setlist off: left native; relationships off: the setlist is still converted', async ({ page }) => {
        await openEvent(page, { settings: { sa_event_overview_setlist: false } });
        let names = (await groups(page)).map((x) => x.name);
        expect(names.some((n) => n.startsWith('Setlist: '))).toBe(false);
        expect(await page.locator('#content p.setlist').count()).toBe(1);

        await openEvent(page, { settings: { sa_event_overview_relationships: false } });
        names = (await groups(page)).map((x) => x.name);
        expect(names).toEqual(['Setlist: Line-up', 'Setlist: Soundcheck', 'Setlist: Concert']);
        expect(await page.locator('#content table.details').count(), 'the relationship lists stay native').toBe(9);
        expect(await page.locator('#content h2.setlist').count(), 'the setlist\'s own h2 is the anchor').toBe(1);
    });

    test('no part header, and a song without a work link: "Songs", and the line is kept', async ({ page }) => {
        await openEvent(page, {
            rewrite: (html) => html
                .replace('<span class="comment">Soundcheck</span>', '')
                .replace('<a href="/work/028e665e-f76c-43d3-9e6d-25108b87dd97">Death to My Hometown</a>', 'Death to My Hometown'),
        });
        const g = await byName(page);
        expect(g['Setlist: Songs'].rows.map((r) => r[1].text)).toEqual(['Something in the Night', 'No Surrender', 'Reason to Believe']);
        const concert = g['Setlist: Concert'];
        const plain = concert.rows.find((r) => r[1].text === 'Death to My Hometown');
        expect(plain, 'the plain-text line is a row').toBeTruthy();
        expect(plain[1].works).toBe(0);
        expect(plain[concert.heads.indexOf('Recording')].recs, 'matched by title all the same').toBe(1);
    });

    test('a Save to Disk → Load from Disk round trip keeps the note', async ({ page, context }) => {
        await openEvent(page);
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-event-setlist-'));
        try {
            const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
            await clickToolbarItem(page, '#mb-save-to-disk-btn');
            await page.locator('#sa-sd-save-confirm').waitFor({ state: 'visible', timeout: 15000 });
            await page.click('#sa-sd-save-confirm');
            const download = await downloadPromise;
            const saved = path.join(tmpDir, download.suggestedFilename() || 'snapshot.json.gz');
            await download.saveAs(saved);

            const reopened = await context.newPage();
            await openEvent(reopened, { press: false });
            await clickToolbarItem(reopened, '#mb-load-from-disk-btn');
            await reopened.locator('input[type="file"][accept*="json"]').setInputFiles(saved);
            const renderBtn = reopened.locator('#sa-render-no-filter-confirm');
            await renderBtn.waitFor({ state: 'attached', timeout: 15000 });
            await renderBtn.evaluate((el) => el.click());
            await waitForRenderComplete(reopened, { waitForAutoResize: false });
            const g = await byName(reopened);
            expect(g['Setlist: Concert'].intro).toBe(NOTE);
            expect(await reopened.locator('#content p.setlist').count(), 'no native setlist beside the tables').toBe(0);
            await reopened.close();
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });
});
