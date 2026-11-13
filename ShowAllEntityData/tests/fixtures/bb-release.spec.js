'use strict';

// bb-retail and bb-bootleg (org/brucebase.org, Plan 2026-11-11, Phase 5;
// mockup M3, https://claude.ai/artifact/3rAGVKsBHEv9jGspkJ5X7Z): a Brucebase
// release, playlist or bootleg page as a detail view. Fixtures: real pages
// from the BruceParser mirror (scripts/build-bb-event-fixtures.py).
//
// Pinned against the FIXTURE, read here with a plain DOM where a count is
// the page's own: the gate; a sub-table per edition and disc (a one-cell
// heading row opening a part), their headers and rows, a footnote read into
// its track's Note; Personnel over every list; Related releases' notes;
// Recording dates by disc, ISO dates with the wiki's words on hover; On The
// Tracks takes with a suffix; the head's facts (a continued line joined),
// running time, texts, Lyrics and the artwork typed from its filenames; a
// bootleg's facts, discs, sides, numbered lines and notes (one note under
// two discs is one); a release link previews its tracks; Save → Load from
// Disk; the two readers on lines the fixtures do not have.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadBbEventPage, BB_EVENT_PAGES } = require('../support/bbFixture');
const { waitForRenderComplete } = require('../support/browser');
const { clickToolbarItem } = require('../support/toolbarMenu');

const RELEASE_BUTTON = 'Show the release';
const BOOTLEG_BUTTON = 'Show the bootleg';

/**
 * Collects uncaught page errors.
 * @param {import('@playwright/test').Page} page
 * @returns {string[]}
 */
function trackPageErrors(page) {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    return errors;
}

/**
 * Presses a button and waits for the render.
 * @param {import('@playwright/test').Page} page
 * @param {string} label
 * @returns {Promise<void>}
 */
async function press(page, label) {
    await page.click(`button[data-label="${label}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/**
 * The rendered sub-tables by name: headers, rows (cell texts), open or not.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object<string, {headers: string[], rows: string[][], open: boolean}>>}
 */
function tables(page) {
    return page.evaluate(() => {
        const out = {};
        document.querySelectorAll('table.tbl').forEach((t) => {
            const h3 = t.previousElementSibling && t.previousElementSibling.tagName === 'H3' ? t.previousElementSibling : null;
            if (!h3) return;
            const m = h3.textContent.replace(/[▲▼]/g, '').trim().match(/^(.*?)\s*\(\d+\)/);
            out[m ? m[1] : h3.textContent.trim()] = {
                headers: Array.from(t.tHead.rows[0].cells, c => c.dataset.colName || c.textContent.trim()),
                rows: Array.from(t.tBodies[0].rows, r => Array.from(r.cells, c => c.textContent.replace(/\s+/g, ' ').trim())),
                open: getComputedStyle(t).display !== 'none',
            };
        });
        return out;
    });
}

/**
 * The FIXTURE's own counts, read with a plain DOM: per tab label (of every
 * tabview outside the ListPages boxes), its tracks (rows with a `<td>`),
 * its list items, its `<tr>`s of three cells or more, its links to lyrics.
 * @param {import('@playwright/test').Page} page
 * @param {string} key
 * @returns {Promise<Object<string, {tracks: number, li: number, tr3: number, tables: number, lyrics: number}>>}
 */
function fixtureTabs(page, key) {
    const html = fs.readFileSync(BB_EVENT_PAGES[key].file, 'utf8');
    return page.evaluate((h) => {
        const d = new DOMParser().parseFromString(h, 'text/html');
        const out = {};
        d.querySelectorAll('#page-content div.yui-navset').forEach((nav) => {
            if (nav.closest('.list-pages-box')) return;
            const labels = Array.from(nav.querySelectorAll(':scope > ul.yui-nav > li'), li => li.textContent.trim());
            const panels = Array.from(nav.querySelector(':scope > .yui-content').children);
            labels.forEach((l, i) => {
                const p = panels[i];
                out[l] = {
                    tracks: Array.from(p.querySelectorAll('tr')).filter(tr => tr.querySelector(':scope > td')).length,
                    li: p.querySelectorAll('li').length,
                    tr3: Array.from(p.querySelectorAll('tr')).filter(tr => tr.querySelectorAll(':scope > td').length >= 3).length,
                    tables: p.querySelectorAll('table').length,
                    lyrics: p.querySelectorAll('a[href*="/lyrics:"]').length,
                };
            });
        });
        return out;
    }, html);
}

/**
 * The head's card of that name as dt → dd text.
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 * @returns {Promise<Object<string, string>>}
 */
function card(page, name) {
    return page.locator('.mb-fd-details .mb-sb-card', { has: page.locator('.mb-sb-card-head', { hasText: new RegExp(`^${name}`) }) })
        .locator('dt, dd').evaluateAll((ns) => {
            const o = {};
            for (let i = 0; i + 1 < ns.length; i += 2) o[ns[i].textContent.trim()] = ns[i + 1].textContent.replace(/\s+/g, ' ').trim();
            return o;
        });
}

/**
 * The head's section headings (text sections, Details, Artwork).
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string[]>}
 */
function headSections(page) {
    return page.locator('.mb-fd-head > h2').evaluateAll(hs => hs.map(h => h.textContent.replace(/[▲▼]/g, '').trim()));
}

test.describe('bb-retail / bb-bootleg: the gate', () => {
    test('with sa_bb_detail_pages off, neither a release nor a bootleg page has a button', async ({ page }) => {
        await loadBbEventPage(page, 'retail-born-to-run', { detail: false });
        await expect(page.locator('button[data-label]')).toHaveCount(0);
        await expect(page.locator('#page-title')).toBeVisible();
    });

    test('a bootleg page off: no button', async ({ page }) => {
        await loadBbEventPage(page, 'bootleg-river-outtakes-wrr', { detail: false });
        await expect(page.locator('button[data-label]')).toHaveCount(0);
    });
});

test.describe('bb-retail: "Born To Run"', () => {
    test('the sub-tables, their headers and rows, counted from the page\'s own tabs; all open; no request', async ({ page }) => {
        const errors = trackPageErrors(page);
        const { requests } = await loadBbEventPage(page, 'retail-born-to-run');
        const c = await fixtureTabs(page, 'retail-born-to-run');
        const before = requests.length;
        await press(page, RELEASE_BUTTON);
        await expect(page.locator('h2.mb-bb-retail-heading')).toHaveText(/^▼?Release\(/);
        const t = await tables(page);
        expect(Object.keys(t)).toEqual(['Born To Run', 'Personnel', 'Related releases', 'On The Tracks', 'Performance']);
        expect(t['Born To Run'].headers).toEqual(['#', 'Song', 'Time', 'Release', 'Note']);
        expect(t.Personnel.headers).toEqual(['Name', 'Band', 'Instruments']);
        expect(t['Related releases'].headers).toEqual(['Group', 'Release', 'Note']);
        expect(t['On The Tracks'].headers, 'a take and a date split from the version (Phase 13)').toEqual(['Title', 'Version', 'Take', 'Date', 'Time', 'Releases']);
        expect(t.Performance.headers).toEqual(['Song', 'Performed']);
        expect(t['Born To Run'].rows).toHaveLength(c['Born To Run'].tracks);
        // Personnel: Bruce's list and the band's, every person a row.
        expect(t.Personnel.rows).toHaveLength(c.Personnel.li);
        expect(t.Personnel.rows[0]).toEqual(['Bruce Springsteen', '', 'Lead Vocals, Lead Guitar, Rhythm Guitar, Harmonica, Percussion']);
        expect(t.Personnel.rows).toContainEqual(['Wayne Andre', '', 'Trombone']);
        expect(t['On The Tracks'].rows).toHaveLength(c['On The Tracks'].tr3);
        expect(t.Performance.rows).toHaveLength(c.Performance.tracks - 1);
        // A track: #, the song in MusicBrainz case, its time, where it is from.
        expect(t['Born To Run'].rows[0]).toEqual(['1', 'Thunder Road', '4:44', 'BTR', '']);
        expect(t['Born To Run'].rows[1]).toEqual(['2', 'Tenth Avenue Freeze‐Out', '3:08', 'BTR / 1975 single', '']);
        // Related releases: the group, the release, its <sup> as the Note.
        expect(t['Related releases'].rows).toContainEqual(['Other', 'Born To Run (30th Anniversary Edition)', '2005']);
        expect(t['Related releases'].rows).toContainEqual(['Other', 'The Album Collection, Vol.1 (1973-1984)', '']);
        // "THE HEIST - V2 - take 14": Title, Version, Take; a bracket with a
        // year in it is the Date (org/brucebase.org, "On The Tracks").
        expect(t['On The Tracks'].rows).toContainEqual(['The Heist', 'V2', '14', '', '0:13', 'BTRCS']);
        expect(t['On The Tracks'].rows).toContainEqual(['Jungleland', 'V1', '', 'August 1, 1974', '', 'uncirculating']);
        expect(t['On The Tracks'].rows).toContainEqual(expect.arrayContaining(['Jungleland', 'V3', '', 'poss. October 16, 1974']));
        expect(t.Performance.rows[0]).toEqual(['Thunder Road', '1582']);
        expect(Object.values(t).every(x => x.open)).toBe(true);
        expect(requests.slice(before).filter(u => !/wdfiles\.com/.test(u))).toEqual([]);
        expect(errors).toEqual([]);
    });

    test('songs link their pages, the wiki\'s capitals on hover; a release abbreviation links its page', async ({ page }) => {
        await loadBbEventPage(page, 'retail-born-to-run');
        await press(page, RELEASE_BUTTON);
        const song = page.locator('table.tbl tbody tr', { hasText: 'Thunder Road' }).first().locator('td').nth(1);
        await expect(song.locator('[data-mb-tip]')).toHaveAttribute('title', 'As written on Brucebase:\nTHUNDER ROAD');
        await expect(song.locator('a')).toHaveAttribute('href', 'https://brucebase.wikidot.com/song:thunder-road');
        await expect(page.locator('table.tbl a[href="https://brucebase.wikidot.com/stats:born-to-run-studio-sessions#thunderroad"]').first()).toHaveText('BTR');
    });

    test('the head: Overview, the footnotes, History; the Release card; Tags, Media, Lyrics; the artwork by kind', async ({ page }) => {
        await loadBbEventPage(page, 'retail-born-to-run');
        const c = await fixtureTabs(page, 'retail-born-to-run');
        await press(page, RELEASE_BUTTON);
        await expect(page.locator('p.mb-fd-sub')).toHaveText('~ Release (August 25, 1975)');
        // Gallery/News since Phase 16 batch 2 (vzell: the page view too): the
        // press links, without the photo credits and placeholders.
        expect(await headSections(page)).toEqual(['Overview', 'Notes', 'History', 'On The Tracks notes', 'Gallery/News',
            expect.stringMatching(/^Details \(\d+\)$/), expect.stringMatching(/^Artwork \(\d+\)$/)]);
        const news = page.locator('.mb-fd-head .mb-fd-text', { has: page.locator('a[href="https://ew.com/music/tom-hanks-jimmy-fallon-bruce-springsteen-born-to-run/"]') });
        await expect(news).toHaveCount(1);
        await expect(news).not.toContainText('All credits');
        await expect(news).not.toContainText('Sorry, no');
        const kv = await card(page, 'Release');
        expect(kv).toEqual(expect.objectContaining({
            'Commercially released': 'August 25, 1975', Label: 'Columbia', 'Produced by': 'Bruce Springsteen, Jon Landau and Mike Appel',
            'Mastered by': 'Greg Calbi', 'Design by': 'John Berg and Andy Engel', 'Photography by': 'Eric Meola',
            'Running time': '39:28', Tracks: '8',
        }));
        // A line that starts with a space continues the fact before it.
        expect(kv['Recorded by']).toMatch(/Corky Stasiak at Record Plant Studios \(April–July 1975\) and 914 Sound/);
        await expect(page.locator('.mb-fd-details .mb-sb-card', { has: page.locator('.mb-sb-card-head', { hasText: /^Lyrics/ }) })
            .locator('.mb-sb-chip a')).toHaveCount(c.Lyrics.lyrics);
        // Media: the Spotify album and the YouTube playlist (an
        // "embed/playlist?list=" player, never a video named "playlist").
        const media = await page.locator('.mb-fd-details .mb-sb-card', { has: page.locator('.mb-sb-card-head', { hasText: /^Media/ }) })
            .locator('.mb-sb-chip a').evaluateAll(as => as.map(a => a.href));
        // (The fixture keeps only YouTube players: the builder drops every other iframe.)
        expect(media).toEqual(['https://www.youtube.com/playlist?list=OLAK5uy_nZs0gvllzGn7y9-5OuorN7W37HPrPGrn8']);
        // The footnotes under the facts.
        await page.locator('.mb-fd-head > h2', { hasText: /^\W*Notes$/ }).click();
        await expect(page.locator('.mb-fd-head .mb-fd-text', { hasText: 'Script Covers' })).toHaveCount(1);
        // The artwork: typed by what each filename says ("disco_…" a cover).
        await expect(page.locator('.mb-release-art-sec').getByText(/^Release cover \d+$/)).toHaveCount(1);
    });
});

test.describe('bb-retail: other pages', () => {
    test('"Live/1975-85": a table per disc; Recording dates by disc, ISO dates, a footnote as the Note', async ({ page }) => {
        const errors = trackPageErrors(page);
        await loadBbEventPage(page, 'retail-live-1975-85');
        const c = await fixtureTabs(page, 'retail-live-1975-85');
        await press(page, RELEASE_BUTTON);
        const t = await tables(page);
        const discs = Object.keys(t).filter(k => k.startsWith('Live/1975-85'));
        expect(discs).toEqual(['Live/1975-85 · Disc 1', 'Live/1975-85 · Disc 2', 'Live/1975-85 · Disc 3']);
        expect(discs.reduce((n, k) => n + t[k].rows.length, 0)).toBe(c['Live/1975-85'].tracks);
        expect(c['Live/1975-85'].tables).toBe(3);
        const dates = t['Recording dates'];
        expect(dates.headers).toEqual(['Disc', '#', 'Song', 'Date', 'Location', 'Note']);
        expect(dates.rows).toHaveLength(c["Recording 'Live' Dates"].tr3);
        expect(dates.rows[0]).toEqual(['Disc 1 - Club Shows', 'D1/1', 'Thunder Road', '1975-10-18', 'Roxy Theatre, West Hollywood, California', '']);
        // The footnote mark "a" leaves the title whole ("Asbury Park").
        expect(dates.rows[3][2]).toBe('4th of July, Asbury Park (Sandy)');
        expect(dates.rows.find(r => /Asbury Park/.test(r[2]))[5]).toBe('Mistitled as "4th of July, Ashbury Park" on some CD box sets.');
        expect(new Set(dates.rows.map(r => r[0]))).toEqual(new Set(['Disc 1 - Club Shows', 'Disc 2 - Arena Shows', 'Disc 3 - Stadium Shows']));
        const date = page.locator('table.tbl tbody tr', { hasText: 'D1/1' }).first().locator('td').nth(3);
        await expect(date.locator('[data-mb-tip]')).toHaveAttribute('title', 'As written on Brucebase:\nOctober 18, 1975');
        await expect(date.locator('a')).toHaveAttribute('href', 'https://brucebase.wikidot.com/gig:1975-10-18-roxy-theatre-west-hollywood-ca-early');
        // Performed is a number column (right-aligned, sorts as a number).
        expect(t.Performance.rows.every(r => /^\d+$/.test(r[1]))).toBe(true);
        expect(errors).toEqual([]);
    });

    test('"The Promise (Boxset)": two editions, the video one cut into parts by its heading rows', async ({ page }) => {
        await loadBbEventPage(page, 'retail-the-promise-boxset');
        await press(page, RELEASE_BUTTON);
        const t = await tables(page);
        const audio = Object.keys(t).filter(k => k.startsWith('Audio - The Promise (Boxset)'));
        const video = Object.keys(t).filter(k => k.startsWith('Video - The Promise (Boxset)'));
        expect(audio).toEqual(['Audio - The Promise (Boxset) · Disc 1', 'Audio - The Promise (Boxset) · Disc 2', 'Audio - The Promise (Boxset) · Disc 3']);
        expect(video).toContain('Video - The Promise (Boxset) · Paramount Theater, Asbury Park 2009 - BLU-RAY / DVD');
        expect(video).toHaveLength(6);
        // "THE WAY (1)": the footnote "1" under the tab is its Note.
        expect(t['Audio - The Promise (Boxset) · Disc 3'].rows.find(r => r[1] === 'The Way')[4]).toBe('Hidden in the previous track.');
        // A link naming part of the title: the release is the whole item.
        expect(t['Related releases'].rows).toContainEqual(['All Versions', 'The Promise: The Darkness On The Edge Of Town Story', '']);
        const kv = await card(page, 'Release');
        expect(kv.Editions).toBe('Audio - The Promise (Boxset) · Video - The Promise (Boxset)');
        // The video edition states no total.
        expect(kv['Running time']).toBe('Audio - The Promise (Boxset): 2:11:49');
    });

    test('a playlist: the same layout, its own heading', async ({ page }) => {
        const errors = trackPageErrors(page);
        await loadBbEventPage(page, 'playlist-songs-of-love');
        const c = await fixtureTabs(page, 'playlist-songs-of-love');
        await press(page, RELEASE_BUTTON);
        await expect(page.locator('h2.mb-bb-retail-heading')).toHaveText(/^▼?Playlist\(/);
        await expect(page.locator('p.mb-fd-sub')).toHaveText('~ Playlist (August 23, 2019)');
        const t = await tables(page);
        expect(t['Recording dates'].rows).toHaveLength(c["Recording 'Live' Dates"].tr3);
        expect(t['Recording dates'].rows[0]).toEqual(['', '01', 'She’s the One', '1975-10-18', 'The Roxy, West Hollywood, California', '']);
        expect((await card(page, 'Playlist')).Tracks).toBe('15');
        expect(errors).toEqual([]);
    });

    // A release's own page is a detail page of this host (`ownLinks`): a
    // take's "BTR" links it; the fixture answers the preview's request.
    test('a link to a release page previews its tracks (FRP)', async ({ page }) => {
        const errors = trackPageErrors(page);
        const { requests, url } = await loadBbEventPage(page, 'retail-born-to-run', {
            settingsOverride: { sa_bb_event_preview: true, sa_pop_ext: true, sa_rich_tooltip_delay_ms: 0 },
        });
        await press(page, RELEASE_BUTTON);
        const link = page.locator(`table.tbl tbody a[href="${url}"]:visible`).first();
        await link.scrollIntoViewIfNeeded();
        await page.mouse.move(0, 0);
        await page.keyboard.down('Control');
        await link.hover();
        await page.keyboard.up('Control');
        const peek = page.locator('#mb-dp-peek');
        await expect(peek).toBeVisible();
        // The highlight is the track count (the card's track list says
        // "8 tracks" too, so the stat itself is what is pinned).
        await expect(peek.locator('.mb-dp-stat')).toHaveText('8 tracks');
        await expect(peek).toContainText('Columbia');
        await expect(peek).toContainText('Thunder Road');
        expect(requests.filter(u => u === url).length).toBeGreaterThanOrEqual(2);
        expect(errors).toEqual([]);
    });
});

test.describe('bb-bootleg', () => {
    test('"The River Outtakes": the facts, a table per disc with its time, one note under two discs', async ({ page }) => {
        const errors = trackPageErrors(page);
        const { requests } = await loadBbEventPage(page, 'bootleg-river-outtakes-wrr');
        const c = await fixtureTabs(page, 'bootleg-river-outtakes-wrr');
        const before = requests.length;
        await press(page, BOOTLEG_BUTTON);
        await expect(page.locator('h2.mb-bb-bootleg-heading')).toHaveText(/^▼?Bootleg\(/);
        const t = await tables(page);
        expect(Object.keys(t)).toEqual(['Disc 1', 'Disc 2']);
        expect(t['Disc 1'].headers).toEqual(['#', 'Song', 'Time']);
        expect(t['Disc 1'].rows.length + t['Disc 2'].rows.length).toBe(c.Bootleg.li);
        expect(t['Disc 1'].rows[0]).toEqual(['1', 'Cindy', '2:27']);
        expect(t['Disc 1'].rows).toContainEqual(['7', 'Take ’Em as They Come', '4:35']);
        await expect(page.locator('p.mb-fd-sub')).toHaveText('~ Bootleg');
        const kv = await card(page, 'Bootleg');
        expect(kv).toEqual(expect.objectContaining({
            Label: 'Wild River Records', 'Catalog #': 'CD 1980', Time: '(95:43)', Format: '2CD', Source: 'Studio Demos - Outtakes', Discs: '2', Tracks: '26',
        }));
        expect(await headSections(page)).toEqual(['About this bootleg', 'Notes', expect.stringMatching(/^Details/), 'Artwork (4)']);
        await page.locator('.mb-fd-head > h2', { hasText: /^\W*Notes$/ }).click();
        const notes = await page.locator('.mb-fd-head .mb-fd-text', { hasText: 'mastering problem' }).textContent();
        expect(notes.match(/mastering problem/g)).toHaveLength(1);
        // The artwork typed by the filename's part: Front, Back, Disc.
        for (const kind of ['Front', 'Back', 'Disc']) {
            await expect(page.locator('.mb-release-art-sec').getByText(new RegExp(`^${kind} \\d+$`))).toHaveCount(1);
        }
        expect(requests.slice(before).filter(u => !/wdfiles\.com/.test(u))).toEqual([]);
        expect(errors).toEqual([]);
    });

    test('"Criminals And Artists": "//" ends side A; times written "7.02"', async ({ page }) => {
        await loadBbEventPage(page, 'bootleg-criminals-and-artists');
        await press(page, BOOTLEG_BUTTON);
        const t = await tables(page);
        expect(Object.keys(t)).toEqual(['Tracklist']);
        expect(t.Tracklist.headers).toEqual(['#', 'Side', 'Song', 'Time']);
        expect(t.Tracklist.rows.map(r => r[1]).join('')).toBe('AAAABBBBBB');
        expect(t.Tracklist.rows[3]).toEqual(['4', 'A', 'Sandy', '5:35']);
        expect(t.Tracklist.rows[0][3]).toBe('7:02');
        // "Notes:" starts the notes; the lines after it are not facts.
        const kv = await card(page, 'Bootleg');
        expect(Object.keys(kv)).toEqual(['Label', 'Catalog #', 'Time', 'Format', 'Source', 'Tracks', 'This page']);
    });

    test('numbered lines in a paragraph are the tracklist; "Disc 1" names a disc', async ({ page }) => {
        await loadBbEventPage(page, 'bootleg-definitive-remastered-darkness-outtakes-gfr');
        await press(page, BOOTLEG_BUTTON);
        const t = await tables(page);
        expect(Object.keys(t)).toEqual(['Disc 1', 'Disc 2']);
        expect(t['Disc 1'].rows).toHaveLength(20);
        expect(t['Disc 2'].rows).toHaveLength(16);
        expect(t['Disc 1'].rows[0]).toEqual(['1', 'Rendezvous', '']);
        expect(t['Disc 2'].rows[15]).toEqual(['16', 'Crazy Rocker', '']);
    });

    test('a bootleg with no facts: its own lines are the text; one list is the Tracklist', async ({ page }) => {
        await loadBbEventPage(page, 'bootleg-born-to-run-outtakes');
        const c = await fixtureTabs(page, 'bootleg-born-to-run-outtakes');
        await press(page, BOOTLEG_BUTTON);
        const t = await tables(page);
        expect(Object.keys(t)).toEqual(['Tracklist']);
        expect(t.Tracklist.rows).toHaveLength(c.Bootleg.li);
        await page.locator('.mb-fd-head > h2', { hasText: 'About this bootleg' }).click();
        await expect(page.locator('.mb-fd-head .mb-fd-text').first()).toContainText('Badlands69');
    });
});

test.describe('bb-retail / bb-bootleg: the readers', () => {
    test('a bootleg\'s lines: "01 Title (4:50)", "1-Title", "Disc One:", a quote in the notes is no fact', async ({ page }) => {
        await loadBbEventPage(page, 'bootleg-born-to-run-outtakes');
        const rec = await page.evaluate(() => window.__saTest.bbBootlegRead(`<html><body><div id="page-content">
            <div class="yui-navset"><ul class="yui-nav"><li><a><em>Bootleg</em></a></li><li><a><em>Artwork</em></a></li></ul>
            <div class="yui-content"><div id="wiki-tab-0-0">
            <p>Some Title<br>Label: Lost Label<br>Lineage:<br>Reel &gt; CDR</p>
            <p>Disc One:</p>
            <p>01 Guns Of Kid Cole (4:50)<br>02 Thunder Road (5.35) //<br>03 Jungleland</p>
            <p>Disc Two:</p>
            <p>1-Rendezvous<br>2-Break Out</p>
            <p>Notes:<br>Appel: Now people were coming in.<br>Source: Studio</p>
            </div><div id="wiki-tab-0-1"></div></div></div></div></body></html>`, 'https://brucebase.wikidot.com/bootleg:x'));
        expect(rec.about).toEqual(['Some Title']);
        expect(rec.facts).toEqual([['Label', 'Lost Label'], ['Lineage', 'Reel > CDR'], ['Source', 'Studio']]);
        expect(rec.discs.map(d => [d.name, d.rows.map(r => `${r.n}|${r.song}|${r.time}|${r.side}`)])).toEqual([
            ['Disc One', ['01|Guns Of Kid Cole|4:50|0', '02|Thunder Road|5:35|0', '03|Jungleland||1']],
            ['Disc Two', ['1|Rendezvous||1', '2|Break Out||1']],
        ]);
        expect(rec.sides).toBe(true);
        expect(rec.notes).toEqual(['Appel: Now people were coming in.']);
    });

    test('a release\'s facts: "Produced** by", a continued line, a sentence-case name', async ({ page }) => {
        await loadBbEventPage(page, 'bootleg-born-to-run-outtakes');
        const rec = await page.evaluate(() => window.__saTest.bbReleaseRead(`<html><body><div id="page-content">
            <div class="code"><pre><code>Commercially Released*: June 4, 1984
Label: Columbia
Produced** by Jon Landau
Recorded By Toby Scott
 at The Power Station
Re-Design by Sheila Rock</code></pre></div></div></body></html>`, 'https://brucebase.wikidot.com/retail:x'));
        expect(rec.facts).toEqual([
            ['Commercially released', 'June 4, 1984'], ['Label', 'Columbia'], ['Produced by', 'Jon Landau'],
            ['Recorded by', 'Toby Scott at The Power Station'], ['Re-design by', 'Sheila Rock'],
        ]);
        expect(rec.kind).toBe('release');
    });
});

test.describe('bb-retail: Save to Disk → Load from Disk', () => {
    let tmpDir;
    test.beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-bb-retail-')); });
    test.afterEach(() => { if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true }); });

    test('a reopened release renders its tables again', async ({ context }) => {
        const source = await context.newPage();
        await loadBbEventPage(source, 'retail-live-1975-85');
        await press(source, RELEASE_BUTTON);
        const before = await tables(source);
        const downloadPromise = source.waitForEvent('download', { timeout: 60000 });
        await clickToolbarItem(source, '#mb-save-to-disk-btn');
        await source.locator('#sa-sd-save-confirm').waitFor({ state: 'visible', timeout: 15000 });
        await source.click('#sa-sd-save-confirm');
        const saved = path.join(tmpDir, 'bb-retail.json.gz');
        await (await downloadPromise).saveAs(saved);
        await source.close();

        const page = await context.newPage();
        const errors = trackPageErrors(page);
        await loadBbEventPage(page, 'retail-live-1975-85');
        await clickToolbarItem(page, '#mb-load-from-disk-btn');
        await page.locator('input[type="file"][accept*="json"]').setInputFiles(saved);
        const renderBtn = page.locator('#sa-render-no-filter-confirm');
        await renderBtn.waitFor({ state: 'attached', timeout: 15000 });
        await renderBtn.evaluate((el) => el.click());
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const after = await tables(page);
        expect(Object.keys(after)).toEqual(Object.keys(before));
        Object.keys(before).forEach((k) => expect(after[k].rows.length, k).toBe(before[k].rows.length));
        await expect(page.locator('h2.mb-bb-native-h2')).toHaveCount(1);
        expect(errors).toEqual([]);
    });
});
