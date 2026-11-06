'use strict';

// A Discogs release's Tracks view (dg-release's first button, 2026-11-04;
// org/foreign-detail-PTs.org, the Discogs step): the release as MusicBrainz's
// release-tracks shows one — a sub-table per disc or record, the credits as
// role columns (Instruments, Vocals, Producer, Engineer, Mixed by, Arranged
// by, Other credits), the credits naming no track as "Release credits", and
// above the tables Notes (closed), Details and Images. One request: the
// release. The splitter's shapes come from scripts/probe-dg-release-shapes.py
// (52 releases); the fixtures beyond Born To Run (1874253) were saved by it
// and wrapped by scripts/wrap-dg-release-fixtures.py.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const FX = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, `ext-${name}.json`), 'utf8'));
const answers = (...names) => Object.fromEntries(names.map((n) => {
    const f = FX(n);
    return [f.url, { status: f.status, responseHeaders: `Content-Type: ${f.contentType}`, responseText: f.body }];
}));
const API = 'https://api.discogs.com/';
const ALL = answers('discogs-release', 'discogs-release-2012001', 'discogs-release-10667945', 'discogs-release-532687', 'discogs-release-15121926',
    ...[1, 2, 3, 4].map(p => `discogs-master-versions-p${p}`));
const BTR = 'https://www.discogs.com/release/1874253-Bruce-Springsteen-Born-To-Run';
const release = id => `https://www.discogs.com/release/${id}-x`;

/**
 * Loads a release page fixture (Discogs' page for 1874253, under the URL of
 * the release asked for) with the API answered from the fixtures, images as
 * a pixel, everything else aborted.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} [url]
 * @returns {Promise<string[]>} Page errors.
 */
async function openRelease(page, url = BTR, settings = {}) {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
    await page.route('https://i.discogs.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    await page.context().addInitScript((r) => { window.__gmXhrResponses = r; }, ALL);
    await loadUserscriptPage(page, {
        url, fixtureFile: path.join(__dirname, 'dg-release.html'), testMode: true,
        settingsOverride: { sa_enable_discogs: true, sa_pop_ext_discogs_token: 'tok-probe', sa_render_threshold: 100000, ...settings },
    });
    return errors;
}

/**
 * Hovers an element with Ctrl held, as the other popup specs do.
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} el
 * @returns {Promise<void>}
 */
async function ctrlHover(page, el) {
    await page.mouse.move(0, 0);
    await el.scrollIntoViewIfNeeded();
    await page.keyboard.down('Control');
    await el.hover();
    await page.keyboard.up('Control');
}

/**
 * Presses a toolbar button of our section and waits for the render.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} label
 * @returns {Promise<void>}
 */
async function press(page, label) {
    await page.locator(`#mb-dg-root button[data-label="${label}"]`).click();
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

// The sub-tables' headings, without their counts and toggles.
const h3s = (page) => page.locator('#mb-dg-root h3').evaluateAll(hs => hs.map(h => Array.from(h.childNodes)
    .filter(n => n.nodeType === 3).map(n => n.textContent).join('').replace(/\s+/g, ' ').trim()));
// The requests to Discogs' API so far.
const apiLog = (page) => page.evaluate(api => (window.__gmXhrLog || []).map(r => r.url).filter(u => u.startsWith(api)), API);
// A table's header names.
const heads = (table) => table.locator('thead tr:first-child th').evaluateAll(ths => ths.map(th => th.dataset.colName || th.textContent.trim()));
// The data tables of our section (not the head's), in order.
const tables = (page) => page.locator('#mb-dg-root table.tbl');

/**
 * The `<li>` texts of one cell (row by its # value, column by name).
 *
 * @param {import('@playwright/test').Locator} table
 * @param {string} pos
 * @param {string} col
 * @returns {Promise<string[]>}
 */
async function items(table, pos, col) {
    const i = (await heads(table)).indexOf(col);
    if (i < 0) return [];
    return table.locator('tbody > tr').filter({ has: table.page().locator(`td:first-child:text-is("${pos}")`) })
        .locator(':scope > td').nth(i).locator('li').evaluateAll(lis => lis.map(li => li.textContent.replace(/\s+/g, ' ').trim()));
}

test.describe('Discogs release: the Tracks view, as release-tracks (2026-11-04)', () => {
    test('Born To Run: one request; one record; the credits as role columns; Release credits', async ({ page }) => {
        const errors = await openRelease(page);
        await press(page, 'Show all tracks');
        expect(await apiLog(page), 'the release alone: no other versions').toEqual([`${API}releases/1874253`]);
        await expect(page.locator('#mb-dg-root h2.mb-dg-list-heading')).toContainText('Tracklist');
        // A1…B4 is one record of two sides; 39:20 is the eight lengths added up.
        expect(await h3s(page)).toEqual(['Record 1 · Vinyl LP · 39:20', 'Release credits']);
        const t = tables(page).first();
        expect(await heads(t)).toEqual(['#', 'Title', 'Length', 'Instruments', 'Vocals', 'Producer', 'Engineer', 'Mixed by', 'Arranged by', 'Other credits']);
        await expect(t.locator('tbody > tr')).toHaveCount(8);
        // The track's own credits, split by role: Roy Bittan's "Backing Vocals,
        // Electric Piano [Fender Rhodes], Glockenspiel" goes to both columns.
        expect(await items(t, 'A1', 'Vocals')).toEqual(['Backing Vocals – Mike Appel', 'Backing Vocals – Steve Van Zandt',
            'Backing Vocals – Roy Bittan', 'Vocals – Bruce Springsteen']);
        expect(await items(t, 'A1', 'Instruments')).toContain('Electric Piano [Fender Rhodes], Glockenspiel – Roy Bittan');
        expect(await items(t, 'A1', 'Instruments')).toContain('Harmonica, Guitar – Bruce Springsteen');
        // The release credits spread by their spec ("A1 to A4, B2 to B4"): not on B1.
        expect(await items(t, 'A1', 'Producer')).toEqual(['Jon Landau']);
        expect(await items(t, 'B1', 'Producer')).toEqual([]);
        expect(await items(t, 'A1', 'Engineer')).toHaveLength(7);
        expect(await items(t, 'A1', 'Engineer')).toContain('Jimmy Iovine');
        expect(await items(t, 'A1', 'Engineer')).toContain('Andy Abrams (Assistant)');
        expect(await items(t, 'B1', 'Engineer')).toEqual(['Louis Lahav']);
        expect(await items(t, 'A1', 'Mixed by')).toContain('Jimmy Iovine');
        expect(await items(t, 'B4', 'Arranged by')).toEqual(['Charlie Calello (Strings)']);
        expect(await items(t, 'B4', 'Other credits')).toEqual(['Conductor [Strings] – Charlie Calello']);
        // A name links its artist page; the role carries the 📊 sentinels.
        await expect(t.locator('td a[href^="https://www.discogs.com/artist/"]', { hasText: 'Roy Bittan' }).first()).toBeAttached();
        await expect(t.locator('.mb-credit-role').first()).toBeAttached();
        // No MusicBrainz column on a track table.
        expect(await heads(t)).not.toContain('MusicBrainz');
        // The credits that name no track.
        const rc = tables(page).nth(1);
        await expect(rc.locator('tbody > tr')).toHaveCount(8);
        await expect(rc).toContainText('Mastered By');
        // Credited as printed (Discogs' anv): David Thoener as "Dave Thoener".
        await expect(rc).toContainText('Dave Thoener');
        expect(errors).toEqual([]);
    });

    test('Born To Run: the head as release-tracks — subheader, Notes (closed), Details cards, Images; an image opens the viewer', async ({ page }) => {
        const errors = await openRelease(page);
        // Discogs' own Statistics box, as its page renders it
        // (debug/discogs-release-withMB-icons.html): the sales figures are only there.
        await page.evaluate(() => {
            const li = (name, val) => `<li><span class="name_qjn4_">${name}<!-- -->:</span>${val}</li>`;
            document.querySelector('#app main').insertAdjacentHTML('beforeend', '<aside><section id="release-stats"><header><h2>Statistics</h2></header>' +
                '<div class="content_ETGfR"><div class="items_PQSxS"><ul>' +
                li('Have', '<a href="/release/stats/1874253">18913</a>') + li('Avg Rating', '<span>4.35<!-- --> / 5</span>') + '</ul><ul>' +
                li('Last Sold', '<a href="/sell/history/1874253"><time datetime="2026-10-25">Oct 25, 2026</time></a>') +
                li('Low', '<span>€6.67</span>') + li('Median', '<span>€13.32</span>') + li('High', '<span>€71.16</span>') +
                '</ul></div></div></section></aside>');
        });
        await press(page, 'Show all tracks');
        await expect(page.locator('#mb-dg-root > h1 + p.mb-fd-sub')).toHaveText('~ Release by Bruce Springsteen (1975: US)');
        const head = page.locator('#mb-dg-root .mb-fd-head');
        const h2s = head.locator(':scope > h2.mb-fd-h2');
        await expect(h2s).toHaveText([/Notes$/, /Details \(55\)$/, /Images \(5\)$/]);
        await expect(head.locator('.mb-fd-text')).toBeHidden();
        await expect(head.locator('.mb-fd-details')).toBeVisible();
        const card = name => head.locator('.mb-sb-card', { has: page.locator('.mb-sb-card-head', { hasText: new RegExp(`^${name}`) }) });
        await expect(card('Release')).toContainText('LabelColumbia – PC 33795');
        // The format with its free text ("Terre Haute Pressing") and descriptions.
        await expect(card('Release')).toContainText('FormatVinyl, Terre Haute Pressing, LP, Album, Stereo');
        // Community: Discogs' Statistics box, all of it, linked as there (vzell
        // 2026-11-04); have, want and ratings from the API answer, the sales
        // figures from the page's box; then for sale and data quality. In two
        // columns (vzell 2026-11-04), grouped: the collection and the data
        // quality, then the market.
        const comm = card('Community');
        await expect(comm.locator('.mb-fd-2col > dl.mb-fd-kv')).toHaveCount(2);
        await expect(comm.locator('dl.mb-fd-kv').first().locator('dt')).toHaveText(['Have', 'Want', 'Avg rating', 'Ratings', 'Data quality']);
        await expect(comm.locator('dl.mb-fd-kv').nth(1).locator('dt')).toHaveText(['Last sold', 'Low', 'Median', 'High', 'For sale']);
        // Side by side on this width, not one under the other.
        const [l, r] = await comm.locator('dl.mb-fd-kv').evaluateAll(ds => ds.map(x => x.getBoundingClientRect()));
        expect(r.left, 'the market beside the collection').toBeGreaterThan(l.left + 50);
        expect(Math.abs(r.top - l.top), 'both columns start on one line').toBeLessThan(2);
        await expect(card('Community').locator('.mb-sb-card-count')).toHaveText('10');
        const stats = 'https://www.discogs.com/release/stats/1874253';
        // Counts as Discogs' box writes them, with thousands separators.
        await expect(comm.locator('dd a', { hasText: '18,799' })).toHaveAttribute('href', stats);
        await expect(comm.locator('dd a', { hasText: '2,149' })).toHaveAttribute('href', stats);
        await expect(comm.locator('dd a', { hasText: '1,170' })).toHaveAttribute('href', stats);
        await expect(comm).toContainText('Avg rating4.34 / 5');
        await expect(comm.locator('dd a', { hasText: 'Oct 25, 2026' })).toHaveAttribute('href', 'https://www.discogs.com/sell/history/1874253');
        await expect(comm).toContainText('Low€6.67');
        await expect(comm).toContainText('Median€13.32');
        await expect(comm).toContainText('High€71.16');
        // Contributors: the submitter first, each linked to the user's page.
        const users = card('Contributors').locator('.mb-sb-pill a');
        await expect(users).toHaveCount(23);
        await expect(users.first()).toHaveText('greenwoodgm');
        await expect(users.first()).toHaveAttribute('href', 'https://www.discogs.com/user/greenwoodgm');
        await expect(card('Community').locator('a', { hasText: '60' })).toHaveAttribute('href', 'https://www.discogs.com/sell/release/1874253');
        // vzell 2026-11-04: Release, the links, genres and styles, Community last on
        // the left; the long identifiers on the right.
        const names = col => head.locator(`.mb-sb-${col} .mb-sb-card-head > span:first-child`).allTextContents();
        expect(await names('rail')).toEqual(['Release', 'External links', 'Genres and styles', 'Contributors', 'Community']);
        expect(await names('main')).toEqual(['Identifiers']);
        await expect(card('External links').locator('a')).toHaveText(['Release', 'Master', 'History']);
        await expect(card('Genres and styles').locator('.mb-sb-pill')).toHaveText(['Rock', 'Pop Rock', 'Rock & Roll']);
        const tiles = head.locator('.mb-fd-art figure.mb-release-art-tile');
        await expect(tiles).toHaveCount(5);
        await expect(tiles.first().locator('figcaption')).toHaveText('Primary');
        await tiles.first().locator('a').click();
        await expect(page.locator('#mb-art-viewer')).toBeVisible();
        expect(errors).toEqual([]);
    });

    // org/image-handling.org P1: the head's Images are an art section, the
    // same component as MusicBrainz's Cover art, fed by the Discogs answer.
    test('Born To Run: Images as an art section — Primary/Secondary chips, ★ primary, By type remembered; the viewer steps the shown tiles (image section P1)', async ({ page }) => {
        const errors = await openRelease(page);
        await press(page, 'Show all tracks');
        const sec = page.locator('#mb-dg-root .mb-fd-head .mb-release-art-sec.mb-fd-art');
        await expect(sec).toHaveCount(1);
        await expect(sec).toHaveAttribute('data-mb-art-state', 'ok');
        // Chips from Discogs' own types; no Spreads for another site's pictures.
        await expect(sec.locator('.mb-release-art-chip')).toHaveText(['All 5', 'Primary 1', 'Secondary 4']);
        await expect(sec.locator('[data-mb-art-layout]')).toHaveText(['Grid', 'By type']);
        // The primary starred; the site's URLs kept as they are, no referrer, the picture card.
        const first = sec.locator('figure.mb-release-art-tile').first();
        await expect(first.locator('.mb-release-art-star')).toHaveText('★ primary');
        await expect(sec.locator('.mb-release-art-star')).toHaveCount(1);
        const a = first.locator('a');
        expect(await a.getAttribute('href')).toMatch(/^https:\/\/i\.discogs\.com\//);
        await expect(a).toHaveAttribute('data-mbtt-fn', 'fd-pic');
        await expect(a).toHaveAttribute('rel', 'noopener noreferrer');
        await expect(a.locator('img')).toHaveAttribute('referrerpolicy', 'no-referrer');
        expect(await first.getAttribute('data-mbtt'), 'not the archive card').toBeNull();

        // A chip narrows the sheet, and the viewer steps through what it shows.
        await sec.locator('.mb-release-art-chip', { hasText: 'Secondary' }).click();
        await expect(sec.locator('figure.mb-release-art-tile')).toHaveCount(4);
        await sec.locator('figure.mb-release-art-tile > a').nth(1).click();
        const viewer = page.locator('#mb-art-viewer');
        await expect(viewer).toBeVisible();
        await expect(viewer.locator('.mb-artv-pos')).toHaveText('2 / 4');
        await expect(viewer.locator('.mb-artv-title')).toContainText('Born To Run');
        expect(await viewer.locator('.mb-artv-img').getAttribute('src')).toMatch(/^https:\/\/i\.discogs\.com\//);
        await page.keyboard.press('Escape');
        await expect(viewer).toBeHidden();

        // By type: one group per type, remembered under the foreign sites' own key.
        await sec.locator('.mb-release-art-chip', { hasText: 'All' }).click();
        await sec.locator('[data-mb-art-layout="grouped"]').click();
        await expect(sec.locator('.mb-release-art-group-hdr')).toHaveText(['Primary × 1', 'Secondary × 4']);
        expect(await page.evaluate(() => window.GM_getValue('mb_sa_fd_art_layout', null))).toBe('grouped');
        expect(await page.evaluate(() => window.GM_getValue('mb_sa_release_art_layout', null)), 'MusicBrainz\'s key untouched').toBeNull();
        expect(errors).toEqual([]);
    });

    test('the head\'s values: identifiers beside their labels, values linked as on Discogs\' page, the notes\' markup as links; previews on them (vzell 2026-11-04)', async ({ page }) => {
        const errors = await openRelease(page, BTR, { sa_pop_ext: true, sa_rich_tooltip_delay_ms: 0 });
        await press(page, 'Show all tracks');
        const head = page.locator('#mb-dg-root .mb-fd-head');
        const card = name => head.locator('.mb-sb-card', { has: page.locator('.mb-sb-card-head', { hasText: new RegExp(`^${name}`) }) });
        // 1. Every identifier's value shows, with room, its description beside it
        //    (a long description in the label column had left the values no width).
        const ids = card('Identifiers');
        const geo = await ids.locator('dd').evaluateAll(dds => dds.map(dd => ({ w: dd.getBoundingClientRect().width, t: dd.textContent.trim() })));
        expect(geo).toHaveLength(12);
        expect(geo.every(g => g.w > 40 && g.t), JSON.stringify(geo)).toBe(true);
        await expect(ids.locator('dt').first()).toHaveText('Rights Society');
        await expect(ids.locator('dd').first()).toHaveText('ASCAP');
        await expect(ids.locator('dd', { hasText: 'AL 33795' }).first()).toContainText('A-side label');
        // 2. Linked as on Discogs' own page.
        await expect(card('Release').locator('a', { hasText: 'Columbia' })).toHaveAttribute('href', 'https://www.discogs.com/label/1866');
        await expect(card('Release').locator('a', { hasText: 'US' })).toHaveAttribute('href', 'https://www.discogs.com/search/?country=US');
        await expect(card('Release').locator('a', { hasText: 'Vinyl' })).toHaveAttribute('href', 'https://www.discogs.com/search/?format_exact=Vinyl');
        await expect(card('Release').locator('a', { hasText: '1975' })).toHaveAttribute('href', 'https://www.discogs.com/search/?decade=1970&year=1975');
        await expect(card('Genres and styles').locator('a', { hasText: 'Rock & Roll' }))
            .toHaveAttribute('href', 'https://www.discogs.com/music/style/rock%20%26%20roll');
        // 3. The notes' [url=…]text[/url] is a link.
        await head.locator('h2.mb-fd-h2', { hasText: 'Notes' }).click();
        const pressing = head.locator('.mb-fd-text a', { hasText: 'Canadian Pressing' });
        await expect(pressing).toHaveAttribute('href', 'http://www.discogs.com/release/567824');
        await expect(head.locator('.mb-fd-text')).not.toContainText('[url=');
        // 2 and 4. Our card on a head link (the Release chip: the fixture's answer), the window on a plain click.
        const chip = card('External links').locator('a', { hasText: 'Release' });
        await ctrlHover(page, chip);
        await expect(page.locator('#mb-dp-peek')).toBeVisible();
        await expect(page.locator('#mb-dp-peek')).toContainText('Born To Run');
        await page.mouse.move(0, 0);
        await chip.click();
        await expect(page.locator('#mb-dp-dialog')).toBeVisible();
        expect(errors).toEqual([]);
    });

    test('the second button: today\'s sub-tables but the Tracklist, then the other versions; no head', async ({ page }) => {
        const errors = await openRelease(page);
        await press(page, 'Show credits, companies and other versions');
        expect(await h3s(page)).toEqual(['Credits', 'Companies, etc.', 'Barcode and Other Identifiers', 'Videos', 'Other versions']);
        await expect(page.locator('#mb-dg-root .mb-fd-head, #mb-dg-root .mb-fd-sub')).toHaveCount(0);
        expect(errors).toEqual([]);
    });

    test('five CDs: a sub-table per disc named by its heading; the headings inside a disc as Section; ranges per disc', async ({ page }) => {
        // Bootleg Archives Volumes 1-5 (2012001): "1-1"…"5-9", 11 headings.
        const errors = await openRelease(page, release(2012001));
        await press(page, 'Show all tracks');
        const names = await h3s(page);
        expect(names.filter(n => /^Disc/.test(n)).map(n => n.split(' · ').slice(0, 3).join(' · '))).toEqual([
            'Disc 1 · Volume 1: Live In Europe, 1981 · CD', 'Disc 2 · Volume 2: Live In Vienna - 28/05/1986 · CD',
            'Disc 3 · Volume 3: Live In Köln - 03/07/1991 · CD', 'Disc 4 · Volume 4: Live In Hell - 10/09/1999 · CD',
            'Disc 5 · Volume 5: Live In Markranstadt - 23/06/2007 · CD']);
        const t = tables(page).first();
        expect(await heads(t)).toContain('Section');
        const sections = await t.locator('tbody > tr').evaluateAll((trs, i) => trs.map(tr => tr.cells[i].textContent.trim()),
            (await heads(t)).indexOf('Section'));
        // Disc 1's own headings (the Discogs data also has one called "Unknown").
        expect([...new Set(sections)]).toEqual(expect.arrayContaining(['Cologne 13/02/1981', 'Paris 05/02/1981', 'Vienna 12/02/1981']));
        expect(errors).toEqual([]);
    });

    test('ten 7-inch singles: a record per "Record N" heading over sides A and AA; a range naming a heading ("Record 10")', async ({ page }) => {
        // Summer Party (10667945): every record's sides are A and AA again.
        const errors = await openRelease(page, release(10667945));
        await press(page, 'Show all tracks');
        const names = (await h3s(page)).filter(n => /^Record/.test(n));
        expect(names).toHaveLength(10);
        expect(names[0]).toMatch(/^Record 1 · Record 1 · Vinyl 7"/);
        const last = tables(page).nth(9);
        await expect(last.locator('tbody > tr')).toHaveCount(2);
        // A compilation: the tracks' own artists as a column.
        expect(await heads(last)).toContain('Artist');
        // The credit for "Record 10" is on both its tracks, not in Release credits.
        const n10 = await last.locator('tbody > tr').evaluateAll(trs => trs.map(tr => tr.querySelectorAll('li').length));
        expect(n10.every(n => n > 0)).toBe(true);
        expect(await h3s(page)).not.toContain('Release credits');
        expect(errors).toEqual([]);
    });

    test('dotted parts of a plain-numbered track stay on its disc (16.1 after 15); a split LP: one heading per side as Section', async ({ page }) => {
        // Rare Trax Vol. 1 (532687): "1".."15", "16.1".."16.3".
        let errors = await openRelease(page, release(532687));
        await press(page, 'Show all tracks');
        expect((await h3s(page)).filter(n => /^Disc/.test(n))).toHaveLength(1);
        await expect(tables(page).first().locator('tbody > tr')).toHaveCount(18);
        expect(errors).toEqual([]);
        // Born To Run / E. C. Was Here (15121926): heading "Born To Run" over side A,
        // "E. C. Was Here" over B — Sections, not the record's name.
        errors = await openRelease(page, release(15121926));
        await press(page, 'Show all tracks');
        const names = (await h3s(page)).filter(n => /^Record/.test(n));
        expect(names).toHaveLength(1);
        expect(names[0]).not.toContain('Born To Run');
        const t = tables(page).first();
        const i = (await heads(t)).indexOf('Section');
        const secs = await t.locator('tbody > tr').evaluateAll((trs, k) => trs.map(tr => tr.cells[k].textContent.trim()), i);
        expect([...new Set(secs)]).toEqual(['Born To Run', 'E. C. Was Here']);
        expect(errors).toEqual([]);
    });
});
