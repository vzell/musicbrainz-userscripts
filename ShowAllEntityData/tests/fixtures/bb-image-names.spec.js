'use strict';

// org/brucebase.org, Plan (2026-11-11), Phase 1: what a Brucebase image's
// FILENAME says (`_bbParseImageName()`, `_bbImageCaption()`) and which
// family a page tag belongs to (`_bbTagFamily()`). Every filename below is
// a real one, from the BruceParser mirror (scripts/probe-bb-detail-pages.py
// over debug/bb-mirror/, 2026-11-11), one or more per shape A–H, plus the
// three spellings the probe found that a strict reading misses (an encoded
// space, a 7-digit date, an icon). The window side (captions, photos by
// photographer, the Tags section) is pinned in bb-event-preview.spec.js.

const { test, expect } = require('../support/test');
const { loadBbYearPage } = require('../support/bbFixture');

const W = 'https://brucebase.wdfiles.com/local--resized-images';

// [url or filename, folder kind, the fields to pin, the caption]
const NAMES = [
    [`${W}/gallery:1978-07-07-roxy-theatre-west-hollywood-ca/19780707_CliffBreining_01.jpg/medium.jpg`, 'Photo',
        { shape: 'A', date: '1978-07-07', photographer: 'Cliff Breining', seq: '01', kind: '' }, 'Photo · Cliff Breining · #01'],
    ['20240522_Setlist_01_Handwritten.jpg', 'Setlist',
        { shape: 'A', kind: 'Setlist', detail: 'Handwritten', photographer: '' }, 'Setlist · #01 · Handwritten'],
    ['19781216_Pass_01_Backstage.jpg', 'Memorabilia', { shape: 'A', kind: 'Pass', detail: 'Backstage' }, 'Pass · #01 · Backstage'],
    ['19761126b_Unknown_006_Patti-Smith.jpg', 'Photo',
        { shape: 'A', letter: 'b', unknownPhotographer: true, photographer: '', seq: '006', detail: 'Patti Smith' },
        'Photo · photographer unknown · #006 · Patti Smith'],
    ['19630900_ClassPhoto_01a.jpg', 'Photo', { shape: 'A', date: '1963-09', kind: 'Class photo', seq: '01a' }, 'Class photo · #01a'],
    ['20120329_Centermic_01_Before.jpg', 'Other', { shape: 'A', kind: 'Center mic', detail: 'Before' }, 'Center mic · #01 · Before'],
    ['19780707_Merchandise_01a_Shirt.jpg', 'News', { shape: 'A', kind: 'Merchandise', seq: '01a', detail: 'Shirt' }, 'Merchandise · #01a · Shirt'],
    ['19810507_GregTurnbull_01_Airport-Arrival.jpg', 'Other', { shape: 'A', photographer: 'Greg Turnbull', detail: 'Airport Arrival' },
        'Other · Greg Turnbull · #01 · Airport Arrival'],
    ['Retail-BTR_AdPoster_01b_Custom.jpg', 'Other', { shape: 'B', release: 'BTR', kind: 'Ad poster', seq: '01b', detail: 'Custom' },
        'Ad poster · BTR · #01b · Custom'],
    ['2023-INT_Announcement_01_TM-Verified-Fan.jpg', 'Other', { shape: 'C', tour: '2023-INT', kind: 'Announcement', detail: 'TM Verified Fan' },
        'Announcement · tour 2023-INT · #01 · TM Verified Fan'],
    ['disco_borntorun_single.jpg', 'Other', { shape: 'D', kind: 'Release cover', release: 'borntorun', detail: 'single' }, 'Release cover · single'],
    ['bs780707.jpg', 'Other', { shape: 'E', kind: 'Live download', date: '1978-07-07' }, 'Live download · 1978-07-07'],
    ['bs1978_boxset_01_broadcast.jpg', 'Other', { shape: 'E', date: '1978', detail: 'boxset 01 broadcast' }, 'Live download · boxset 01 broadcast · 1978'],
    ['lyricsheet_riverhorse_3.jpg', 'Lyric sheet', { shape: 'F', kind: 'Lyric sheet', detail: 'riverhorse 3' }, 'Lyric sheet · riverhorse 3'],
    ['Bootleg_Restless-Night_Back.jpg', 'Other', { shape: 'H', kind: 'Bootleg', release: 'Restless Night', label: '', part: 'Back' },
        'Bootleg · Restless Night · Back'],
    ['Bootleg_River-Outtakes_WildRiver_Disc2.jpg', 'Other', { shape: 'H', release: 'River Outtakes', label: 'Wild River', part: 'Disc 2' },
        'Bootleg · River Outtakes · Wild River · Disc 2'],
    ['apollo-theatre-manchester-england_03_19810513.jpg', 'Photo', { shape: 'G', seq: '03', date: '1981-05-13' }, 'Photo · #03 · 1981-05-13'],
    ['convention-hall-asbury-park-nj_02_casino.jpg', 'Photo', { shape: 'G', seq: '02', detail: 'casino' }, 'Photo · #02 · casino'],
    // Decoded, spaces around the underscore dropped (gallery:2016-02-08-…).
    [`${W}/gallery:2016-02-08-times-union-center-albany-ny/20160208_WarrenLinhart%20_01.jpg/thumbnail.jpg`, 'Photo',
        { shape: 'A', photographer: 'Warren Linhart', file: '20160208_WarrenLinhart _01.jpg' }, 'Photo · Warren Linhart · #01'],
    // Not read: a 7-digit date, a site icon. The folder's kind is all there is.
    ['2019116_KyleBrendle_01.jpg', 'Photo', { shape: '', photographer: '' }, ''],
    ['00Help-32.png', 'Other', { shape: '' }, ''],
];

test('_bbParseImageName and _bbImageCaption read every shape of the wiki\'s filenames', async ({ page }) => {
    await loadBbYearPage(page, '2026');
    const got = await page.evaluate((names) => names.map(([u, k]) => [
        window.__saTest.bbParseImageName(u), window.__saTest.bbImageCaption(u, k)]), NAMES);
    NAMES.forEach(([u, , fields, caption], i) => {
        expect(got[i][0], u).toEqual(expect.objectContaining(fields));
        expect(got[i][1], u).toBe(caption);
    });
});

test('_bbTagFamily sorts a page\'s tags by family, by the page\'s own links and title', async ({ page }) => {
    await loadBbYearPage(page, '2026');
    const ctx = { category: 'gig', songs: ['badlands', 'thunderroad'], people: ['pattiscialfa'], places: ['carolinacoliseum', 'columbia'] };
    const cases = [
        ['13', 'date'], ['1985', 'date'], ['january', 'date'], ['sunday', 'date'],
        ['carolinacoliseum', 'place'], ['columbia', 'place'], ['southcarolina(sc)', 'place'], ['usa', 'place'],
        ['tour_bitusa', 'tour'], ['r_borntorun', 'release'], ['ott_btr', 'ott'], ['lbl_crystalcat', 'label'],
        ['pl_springsteenonbroadway', 'playlist'], ['key_e', 'key'], ['toursnip_detroit', 'snippet'],
        ['ticket', 'material'], ['bootleg', 'material'], ['handwritten', 'material'], ['memorabilia', 'material'],
        // Another category word on a gig says what it holds; its own is its kind.
        ['news', 'material'], ['retail', 'material'], ['gig', 'category'], ['info', 'category'],
        ['badlands', 'song'], ['pattiscialfa', 'person'], ['patti.scialfa', 'person'],
        ['b', 'letter'], ['0-9', 'letter'], ['btn', 'other'], ['6', 'other'],
    ];
    const got = await page.evaluate(([cs, c]) => cs.map(([t]) => window.__saTest.bbTagFamily(t, c)), [cases, ctx]);
    expect(Object.fromEntries(cases.map(([t], i) => [t, got[i]]))).toEqual(Object.fromEntries(cases));
    // Without the page's category a category word is a category.
    expect(await page.evaluate(() => window.__saTest.bbTagFamily('bootleg', {}))).toBe('material');
    expect(await page.evaluate(() => window.__saTest.bbTagFamily('song', {}))).toBe('category');
});
