'use strict';

// The detail-page preview on the four non-MusicBrainz hosts
// (docs/claude/detail-pages.md): resting the pointer on a row's detail link
// shows a card with what the detail page adds; Space pins it into a dialog
// with an Extracted and a Live page view; Esc closes either; ← → step through
// the rows; a tap on a touch screen opens the dialog (detail-preview.mobile.spec.js).
// Opt-in per host (sa_sl/jl/bs/bb_detail_preview), off by default. The card
// waits for Ctrl (held during the hover, or pressed on a hovered link) unless
// sa_dp_hover_without_ctrl is on.
//
// Detail pages are served from tests/fixtures/detail-*.html
// (scripts/build-detail-fixtures.py) by tests/support/detailFixture.js, which
// records every request, so "one request", "no request" and "from the cache"
// are asserted on the wire, not inferred from the card.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadBsRecordsPage } = require('../support/bsFixture');
const { loadJlListPage, JL_BUTTON } = require('../support/jlFixture');
const { loadBbSongsPage, BB_BUTTON } = require('../support/bbFixture');
const { loadSlListPage, SL_KINDS } = require('../support/slFixture');
const { loadUserscriptPage, addRequiredLibs, MB_LIBRARY_PATH, USERSCRIPT_PATH } = require('../support/loadPage');
const { routeDetailPages, FIXTURE_DIR } = require('../support/detailFixture');
const { waitForRenderComplete } = require('../support/browser');

const ALL_PREVIEWS_ON = {
    sa_sl_detail_preview: true, sa_jl_detail_preview: true, sa_bs_detail_preview: true, sa_bb_detail_preview: true,
};

// 1x1 transparent PNG: real image bytes, so an <img> loads rather than errors.
const ONE_PX_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

/**
 * Collects uncaught page errors, so every test can end by asserting none.
 * @param {import('@playwright/test').Page} page
 * @returns {string[]}
 */
function trackPageErrors(page) {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    return errors;
}

/**
 * Reads a detail fixture as the browser would decode it.
 * @param {string} name     File name under tests/fixtures.
 * @param {string} encoding 'utf8', or 'latin1' for a windows-1252 page
 *   (the two agree on every byte the jungleland.it fixtures use).
 * @returns {string}
 */
function fixtureHtml(name, encoding = 'utf8') {
    return fs.readFileSync(path.join(FIXTURE_DIR, name), encoding);
}

/**
 * Loads brucespringsteen.it's list, presses Unofficial, and routes the detail pages.
 * @param {import('@playwright/test').Page} page
 * @param {Object<string, *>} [settings] Extra settings (the preview is on unless overridden).
 * @returns {Promise<{served: string[]}>}
 */
async function bsWithTable(page, settings = {}) {
    await loadBsRecordsPage(page, { settingsOverride: { sa_bs_detail_preview: true, ...settings } });
    const { served } = await routeDetailPages(page, 'bs');
    await page.click('h1.mb-bs-h1 button[data-label="Unofficial"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
    return { served };
}

/**
 * Hovers a link after parking the pointer, so the hover really starts there,
 * WITHOUT Ctrl: with sa_dp_hover_without_ctrl off (loadPage.js's fixture
 * override; the schema default is on since org/non-MB-sites.org) no card is due.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} link
 */
async function plainHover(page, link) {
    await page.mouse.move(0, 0);
    await link.scrollIntoViewIfNeeded();
    await link.hover();
}

/**
 * Hovers a link with Ctrl held, the default way to ask for its card. Ctrl
 * goes down while the pointer is parked (on no link, so the press itself
 * shows nothing) and up after the hover: a held Ctrl would turn a later
 * Space into Ctrl+Space, which does not pin.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} link
 */
async function hover(page, link) {
    await page.mouse.move(0, 0);
    await link.scrollIntoViewIfNeeded();
    await page.keyboard.down('Control');
    await link.hover();
    await page.keyboard.up('Control');
}

/** @param {import('@playwright/test').Page} page */
function peek(page) {
    return page.locator('#mb-dp-peek');
}

/**
 * Hovers a link and waits for its card to SHOW. A hidden card keeps its last
 * content, and `toContainText` does not wait for visibility, so a text check
 * alone can pass on the previous hover's card before the new one is up.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} link
 */
async function peekAt(page, link) {
    await hover(page, link);
    await expect(peek(page)).toBeVisible();
}

test.describe('detail-page parsers (one record per saved page)', () => {
    test('springsteenlyrics.com: discs, a lineage note, scans; side numbers; an unnumbered list', async ({ page }) => {
        await loadBsRecordsPage(page);
        const base = 'https://www.springsteenlyrics.com/';
        const parse = (name, url) => page.evaluate(([h, u]) => window.__saTest.dpParse('springsteenlyrics.com', h, u),
            [fixtureHtml(name), base + url]);

        const b = await parse('detail-sl-bootlegs-6739.html', 'bootlegs.php?item=6739&category=aud_live2014');
        expect(b.title).toBe('First Ever Show In Perth');
        expect(b.subtitle).toBe('Asbury Park Discs');
        // "Format: –" and "Duration: –" are the site's unknowns and are left out.
        expect(b.fields).toEqual([['Date', '05 Feb 2014'], ['Location', 'Perth Arena, Perth, Australia']]);
        expect(b.tracks).toHaveLength(28);
        expect(new Set(b.tracks.map((t) => t.disc))).toEqual(new Set(['Disc 1', 'Disc 2', 'Disc 3']));
        expect(b.tracks[0]).toEqual({ disc: 'Disc 1', pos: '01', title: 'Intro', from: '' });
        expect(b.tracks.at(-1)).toMatchObject({ disc: 'Disc 3', title: 'THUNDER ROAD' });
        expect(b.notes).toEqual(['Original Cd-r --> EAC (Secure) --> Waw --> Flac Level 8 & Align']);
        expect(b.unnumbered).toBe(false);
        expect(b.cover).toBe(base + 'bootlegs/aud_live2014/6739.jpg');
        expect(b.images.map((i) => i.thumb)).toEqual([1, 2, 3, 4, 5].map((n) => `${base}bootlegs/aud_live2014/6739_artwork_0${n}_tn.jpg`));
        expect(b.images[0].full).toBe(base + 'bootlegs/aud_live2014/6739_artwork_01.jpg');

        const c = await parse('detail-sl-collection-7431.html', 'collection.php?item=7431&category=audioboot');
        expect(c.title).toBe('Born To Run Unreleased');
        expect(c.fields.map(([k]) => k)).toEqual(['Label (Cat #)', 'Format', 'Country']);
        expect(c.tracks.map((t) => t.pos)).toEqual(['A1', 'B1']);
        expect(c.notes[0]).toMatch(/^This release is a hand-numbered limited edition of 25 copies/);
        expect(c.images).toHaveLength(13);

        const u = await parse('detail-sl-bootlegs-1331.html', 'bootlegs.php?item=1331&category=aud_live2014');
        expect(u.unnumbered).toBe(true);
        expect(u.tracks[0]).toEqual({ disc: '', pos: '', title: 'LAND OF HOPE AND DREAMS', from: '' });
        expect(u.tracks.length).toBeGreaterThan(20);
        // The tracklist directly follows the card; Duration stays the duration.
        expect(u.fields).toContainEqual(['Duration', '3:44:16']);
    });

    test('springsteenlyrics.com tracklist shapes the saved pages lack', async ({ page }) => {
        await loadBsRecordsPage(page);
        const split = (text) => page.evaluate((t) => window.__saTest.dpSlTracklist(t), text);
        // A note straight after the last track, without a blank line.
        expect(await split('01- Badlands\n02- The River\nTaped from the floor')).toEqual({
            tracks: [{ disc: '', pos: '01', title: 'Badlands', from: '' }, { disc: '', pos: '02', title: 'The River', from: '' }],
            notes: ['Taped from the floor'], unnumbered: false,
        });
        // Prose only: a note, not an unnumbered tracklist.
        expect(await split('A hand-numbered edition of 25 copies. This is copy 18.')).toMatchObject({ tracks: [], unnumbered: false });
        // Side headers, and a year at the start of a note is not a track.
        const sides = await split('Side A:\nA1- Thunder Road\n\nSide B:\nB1- Jungleland\n\n1975 - remastered');
        expect(sides.tracks.map((t) => [t.disc, t.pos])).toEqual([['Side A', 'A1'], ['Side B', 'B1']]);
        expect(sides.notes).toEqual(['1975 - remastered']);
    });

    test('the Live page view\'s copy: no scripts, videos as links, its own base URL, the doctype kept', async ({ page }) => {
        await loadBsRecordsPage(page);
        const clean = (html, url) => page.evaluate(([h, u]) => {
            const out = window.__saTest.dpLiveDocHtml(h, u);
            const doc = new DOMParser().parseFromString(out, 'text/html');
            return {
                head: out.slice(0, 15),
                scripts: doc.querySelectorAll('script, noscript').length,
                iframes: doc.querySelectorAll('iframe').length,
                links: Array.from(doc.querySelectorAll('p.mb-dp-embed a'), (a) => [a.textContent, a.getAttribute('href')]),
                bases: Array.from(doc.querySelectorAll('base'), (b) => [b.getAttribute('href'), b.getAttribute('target')]),
                refresh: doc.querySelectorAll('meta[http-equiv]').length,
                text: doc.body.textContent.replace(/\s+/g, ' ').trim(),
            };
        }, [html, url]);

        // A springsteenlyrics.com-like song page: scripts, a YouTube embed.
        const sl = await clean('<!DOCTYPE html><html><head><script src="js/jquery.js"></script><meta http-equiv="refresh" content="60"></head>' +
            '<body><p>Song text</p><script>init();</script><noscript><img src="track.gif"></noscript>' +
            '<div class="row"><iframe src="https://www.youtube-nocookie.com/embed/SDlSCeQXbPo" allowfullscreen></iframe></div>' +
            '<iframe src="/stats:songs/html/abc"></iframe></body></html>',
        'https://www.springsteenlyrics.com/lyrics.php?song=badlands');
        expect(sl.head).toBe('<!DOCTYPE html>');
        expect(sl.scripts).toBe(0);
        expect(sl.iframes).toBe(0);
        expect(sl.refresh).toBe(0);
        expect(sl.links).toEqual([
            ['▶ Watch on YouTube', 'https://www.youtube.com/watch?v=SDlSCeQXbPo'],
            ['▶ Open the embedded page', 'https://www.springsteenlyrics.com/stats:songs/html/abc'],
        ]);
        expect(sl.bases).toEqual([['https://www.springsteenlyrics.com/lyrics.php?song=badlands', null]]);
        expect(sl.text).toContain('Song text');

        // A jungleland.it-like page: no doctype (quirks mode stays), its own
        // <base target> keeps its target and gains the page's address.
        const jl = await clean('<html><head><title>Artwork</title><base target="_self"></head><body><b>Title: X</b></body></html>',
            'https://www.jungleland.it/html/19760930.htm');
        expect(jl.head.startsWith('<html')).toBe(true);
        expect(jl.bases).toEqual([['https://www.jungleland.it/html/19760930.htm', '_self']]);

        // A Brucebase (Wikidot)-like page: inline handlers and javascript:
        // links, which the sandbox also refuses, and Chrome logs, as the page
        // is parsed (9.99.1266). Gone, with the elements and their text kept.
        const bb = await page.evaluate(([h, u]) => {
            const doc = new DOMParser().parseFromString(window.__saTest.dpLiveDocHtml(h, u), 'text/html');
            const handlers = [];
            doc.querySelectorAll('*').forEach((el) => {
                for (const a of el.attributes) if (/^on/i.test(a.name)) handlers.push(a.name);
            });
            return {
                handlers,
                js: doc.querySelectorAll('[href^="javascript:" i], [src^="javascript:" i], [action^="javascript:" i]').length,
                kept: Array.from(doc.querySelectorAll('a, input, form'), (el) => el.tagName.toLowerCase() + ':' + (el.textContent || el.getAttribute('name') || '')),
                plain: doc.querySelector('a.plain').getAttribute('href'),
            };
        }, ['<!DOCTYPE html><html><body onload="init()">' +
            '<input name="query" onfocus="clearIt(this)">' +
            '<a href="javascript:;" onclick="WIKIDOT.page.listeners.loginClick(event)">Sign in</a>' +
            '<a href="  JavaScript:void(0)">Report a bug</a>' +
            '<form name="f" action="javascript:submitIt()"></form>' +
            '<a class="plain" href="/song:badlands" onmouseover="hi()">Badlands</a>' +
            '</body></html>', 'https://brucebase.wikidot.com/song:4th-of-july-asbury-park-sandy']);
        expect(bb.handlers).toEqual([]);
        expect(bb.js).toBe(0);
        expect(bb.kept).toEqual(['input:query', 'a:Sign in', 'a:Report a bug', 'form:f', 'a:Badlands']);
        expect(bb.plain).toBe('/song:badlands');
    });

    test('springsteenlyrics.com song pages: version, lyrics by shape, sections, versions count; no lyrics', async ({ page }) => {
        // The fixtures' lyrics are blanked (build-detail-fixtures.py), so this
        // pins lines, verses and sections, never lyric text.
        await loadBsRecordsPage(page);
        const parse = (name, slug) => page.evaluate(([h, u]) => window.__saTest.dpParse('springsteenlyrics.com', h, u),
            [fixtureHtml(name), `https://www.springsteenlyrics.com/lyrics.php?song=${slug}`]);

        const s = await parse('detail-sl-lyrics-badlands.html', 'badlands');
        expect(s.title).toBe('BADLANDS');
        expect(s.subtitle).toBe('Album version');
        expect(s.sections[0].label).toBe('Lyrics');
        const lines = s.sections[0].text.split('\n');
        // Verses are separated by one blank line, and the stage notes are kept.
        expect(lines.filter((l) => l === '').length).toBeGreaterThan(5);
        expect(lines.some((l) => /^\[.*\]$/.test(l))).toBe(true);
        // The card's excerpt: the first four sung lines and the count of all of them.
        const sung = lines.filter((l) => l && !/^\[.*\]$/.test(l));
        expect(s.excerpt).toEqual({ label: 'Lyrics', lines: sung.slice(0, 4), total: sung.length });
        const labels = s.sections.map((x) => x.label);
        expect(labels).toEqual(expect.arrayContaining(['Info', 'Writing and Recording', 'Credits / References', 'Available Versions']));
        expect(s.sections.every((x) => !/SECTION NOT YET COMPLETED/.test(x.text))).toBe(true);
        expect(s.fields).toEqual([['Versions on the site', '9']]);
        expect(s.summary).toMatch(/^BADLANDS is a song written by Bruce Springsteen/);
        expect(s.notes).toEqual([]);

        const n = await parse('detail-sl-lyrics-babyme.html', 'babyme');
        expect(n.title).toBe('BABY & ME (BLONDIE)');
        expect(n.subtitle).toBe('');
        expect(n.notes).toEqual(['Lyrics not available']);
        expect(n.excerpt).toBeNull();
        expect(n.sections[0].label).toBe('Info');
        expect(n.images.length).toBeGreaterThan(0);
        expect(n.images[0].thumb).toMatch(/^https:\/\/www\.springsteenlyrics\.com\/lyrics\/images\//);
    });

    test('jungleland.it: title, uploader, labelled scans with backslash paths; no unknown date', async ({ page }) => {
        await loadBsRecordsPage(page);
        const url = 'https://www.jungleland.it/html/Magic%20In%20The%20K%C3%B6ln%20Night%20(2007-12-13).htm';
        const r = await page.evaluate(([h, u]) => window.__saTest.dpParse('jungleland.it', h, u),
            [fixtureHtml('detail-jl-koln.html', 'latin1'), url]);
        expect(r.title).toBe('Magic In The Köln Night (2007-12-13)');
        expect(r.fields).toEqual([['Uploader', 'Highway12']]);
        expect(r.images.map((i) => i.label)).toEqual(['front', 'back', 'cd1', 'cd2', 'booklet1', 'booklet2']);
        expect(r.images[0].thumb).toBe('https://www.jungleland.it/artwork/other/thumb/tn_Magic%20In%20The%20K%C3%B6ln%20Night%20(2007-12-13)_front.jpg');
        expect(r.images[0].full).toBe('https://www.jungleland.it/artwork/other/Magic%20In%20The%20K%C3%B6ln%20Night%20(2007-12-13)_front.jpg');
        expect(r.cover).toBe(r.images[0].thumb);
    });

    test('brucespringsteen.it: the label run, ditto marks carried down, official labels, the photo', async ({ page }) => {
        await loadBsRecordsPage(page);
        const parse = (code) => page.evaluate(([h, u]) => window.__saTest.dpParse('brucespringsteen.it', h, u),
            [fixtureHtml(`detail-bs-${code}.html`), `https://www.brucespringsteen.it/DB/detrec.aspx?code=${code}`]);

        const u = await parse('CR1AD1');
        expect(u.title).toBe('1001 AMERICAN DREAMS');
        expect(u.fields).toEqual([['Support', '2 CD-R'], ['Matrix', '2211/12'], ['Producer', 'Anubis Records'], ['Vinyl', 'CD']]);
        expect(u.notes).toEqual(['Date on package is wrong. Fine package. Full show.']);
        expect(u.tracks).toHaveLength(14);
        // Rows 2-14 write `"` in From: every track carries the first row's show.
        expect(new Set(u.tracks.map((t) => t.from))).toEqual(new Set(['Tampa,FL,Jai Alai(USA) 10-Nov-1975']));
        expect(u.tracks[0]).toEqual({ disc: '1', pos: '1/1', title: 'Thunder road', from: 'Tampa,FL,Jai Alai(USA) 10-Nov-1975' });
        expect(new Set(u.tracks.map((t) => t.disc))).toEqual(new Set(['1', '2']));
        expect(u.cover).toBe('');

        const o = await parse('COL4942001');
        expect(o.fields.map(([k]) => k)).toEqual(['Support', 'Catalogue number', 'Pressed in', 'Release period']);
        expect(o.tracks).toHaveLength(18);
        expect(new Set(o.tracks.map((t) => t.from)).size).toBeGreaterThan(10);

        const p = await parse('LP1B1');
        expect(p.cover).toBe('https://www.brucespringsteen.it/blegs/images/LP1B1.jpg');
    });

    test('Brucebase: origin, the performance count, last show, releases, downloads, the long sections', async ({ page }) => {
        await loadBsRecordsPage(page);
        const r = await page.evaluate(([h, u]) => window.__saTest.dpParse('brucebase.wikidot.com', h, u),
            [fixtureHtml('detail-bb-4th-of-july.html'), 'https://brucebase.wikidot.com/song:4th-of-july-asbury-park-sandy']);
        expect(r.title).toBe('4th Of July, Asbury Park (Sandy)');
        expect(r.subtitle).toBe('Track 2 of The Wild, The Innocent & The E Street Shuffle, 1973.');
        expect(r.highlight).toEqual({ value: '280', label: 'live performances' });
        expect(r.fields).toContainEqual(['Performed live', '280 times']);
        expect(r.fields).toContainEqual(['Last played', '2024-09-15 Beach, Surf Stage, Asbury Park, NJ']);
        expect(r.fields).toContainEqual(['Live downloads', '28']);
        // One release per line, its year, kind and recording date kept with
        // it; the live releases are their own field.
        expect(r.fields.find(([k]) => k === 'Released on')[1].split('\n')).toEqual([
            'The Wild, The Innocent & The E Street Shuffle (1973)',
            '4th Of July, Asbury Park (Sandy) (Single, 1975)',
            'The Essential (2003)',
            'Chapter And Verse (2016)',
            'Best Of (2024)',
        ]);
        expect(r.fields.find(([k]) => k === 'Released live on')[1].split('\n')).toEqual([
            'Live/1975–85 (1986) (recorded December 31, 1980)',
            "Hammersmith Odeon, London '75 (2006) (recorded November 18, 1975)",
            'Magic Tour Highlights (EP, 2008) (recorded March 20, 2008)',
            'Live From Asbury Park (2026) (recorded September 15, 2024)',
        ]);
        expect(r.sections.map((s) => s.label)).toEqual(['Credits', 'On The Tracks', 'Lyrics']);
        // The fixture's lyrics are blanked (build-detail-fixtures.py): pin the
        // shape, never the words.
        expect(r.sections[2].text.split('\n').filter(Boolean).length).toBeGreaterThan(20);
    });
});

test.describe('opt-in, and MusicBrainz untouched', () => {
    test('with the host on but its preview off, a hover shows nothing and fetches nothing', async ({ page }) => {
        const errors = trackPageErrors(page);
        // A fake clock (time still flows) lets the test jump past the hover
        // delay instead of sleeping through it.
        await page.clock.install();
        const { served } = await bsWithTable(page, { sa_bs_detail_preview: false });
        await hover(page, page.locator('table.tbl tbody a[href*="code=CR1AD1"]'));
        await page.clock.fastForward(1200);
        expect(await peek(page).count()).toBe(0);
        expect(await page.locator('#mb-dp-style').count()).toBe(0);
        await page.keyboard.press('Space');
        expect(await page.locator('#mb-dp-dialog').count()).toBe(0);
        expect(served).toEqual([]);
        expect(errors).toEqual([]);
    });

    test('on a MusicBrainz page, every preview setting on changes nothing', async ({ page }) => {
        const errors = trackPageErrors(page);
        await page.clock.install();
        await loadUserscriptPage(page, {
            url: 'https://musicbrainz.org/iswc/T-070.127.339-3',
            fixtureFile: path.join(__dirname, 'iswc.html'),
            testMode: true,
            settingsOverride: ALL_PREVIEWS_ON,
        });
        await expect(page.locator('#mb-show-all-controls-container')).toBeVisible();
        const link = page.locator('table.tbl tbody a[href]').first();
        await hover(page, link);
        await page.clock.fastForward(1200);
        expect(await page.locator('#mb-dp-style, #mb-dp-peek, #mb-dp-dialog').count()).toBe(0);
        expect(errors).toEqual([]);
    });
});

test.describe('the card waits for Ctrl (sa_dp_hover_without_ctrl)', () => {
    test('by default a plain hover shows nothing and fetches nothing', async ({ page }) => {
        const errors = trackPageErrors(page);
        await page.clock.install();
        const { served } = await bsWithTable(page);
        await plainHover(page, page.locator('table.tbl tbody a[href*="code=CR1AD1"]'));
        await page.clock.fastForward(1200);
        await expect(peek(page)).toHaveCount(0);
        expect(served).toEqual([]);
        expect(errors).toEqual([]);
    });

    test('Ctrl pressed while the pointer rests on a title shows its card at once', async ({ page }) => {
        const errors = trackPageErrors(page);
        // A long delay: the card showing anyway proves the Ctrl press skips it.
        const { served } = await bsWithTable(page, { sa_rich_tooltip_delay_ms: 60000 });
        await plainHover(page, page.locator('table.tbl tbody a[href*="code=CR1AD1"]'));
        await page.keyboard.press('Control');
        await expect(peek(page)).toBeVisible();
        await expect(peek(page)).toContainText('14 tracks on 2 discs');
        expect(served).toEqual(['https://www.brucespringsteen.it/DB/detrec.aspx?code=CR1AD1']);
        expect(errors).toEqual([]);
    });

    test('Ctrl with the pointer on no title shows nothing', async ({ page }) => {
        const { served } = await bsWithTable(page);
        await page.mouse.move(0, 0);
        await page.keyboard.press('Control');
        await expect(peek(page)).toHaveCount(0);
        expect(served).toEqual([]);
    });

    test('with the setting on, a plain hover shows the card as before', async ({ page }) => {
        const errors = trackPageErrors(page);
        const { served } = await bsWithTable(page, { sa_dp_hover_without_ctrl: true });
        await plainHover(page, page.locator('table.tbl tbody a[href*="code=CR1AD1"]'));
        await expect(peek(page)).toBeVisible();
        await expect(peek(page)).toContainText('14 tracks on 2 discs');
        expect(served).toHaveLength(1);
        expect(errors).toEqual([]);
    });
});

test.describe('the hover card and the pinned dialog (brucespringsteen.it)', () => {
    test('a hover loads the page once, shows what it adds, and a second hover reads it from memory', async ({ page }) => {
        const errors = trackPageErrors(page);
        const { served } = await bsWithTable(page);
        const link = page.locator('table.tbl tbody a[href*="code=CR1AD1"]');
        await peekAt(page, link);
        await expect(peek(page)).toBeVisible();
        await expect(peek(page)).toContainText('14 tracks on 2 discs');
        await expect(peek(page)).toContainText('Tampa,FL,Jai Alai(USA) 10-Nov-1975');
        await expect(peek(page)).toContainText('Anubis Records');
        await expect(peek(page)).toContainText('Date on package is wrong.');
        await expect(peek(page)).toContainText('fetched now');
        expect(served).toEqual(['https://www.brucespringsteen.it/DB/detrec.aspx?code=CR1AD1']);
        // Beside the link, not over the rows below it.
        const [lb, pb] = [await link.boundingBox(), await peek(page).boundingBox()];
        expect(pb.x).toBeGreaterThanOrEqual(lb.x + lb.width);

        await page.mouse.move(0, 0);
        await expect(peek(page)).toBeHidden();
        await peekAt(page, link);
        await expect(peek(page)).toContainText('saved today');
        expect(served).toHaveLength(1);
        expect(errors).toEqual([]);
    });

    test('Esc hides the card; Space pins it; ← → step through the rows; Esc closes the dialog', async ({ page }) => {
        const errors = trackPageErrors(page);
        const { served } = await bsWithTable(page);
        const link = page.locator('table.tbl tbody a[href*="code=CR1AD1"]');
        await peekAt(page, link);
        await expect(peek(page)).toContainText('14 tracks');
        await page.keyboard.press('Escape');
        await expect(peek(page)).toBeHidden();

        await peekAt(page, link);
        await expect(peek(page)).toContainText('14 tracks');
        await page.keyboard.press('Space');
        const dialog = page.locator('#mb-dp-dialog');
        await expect(dialog).toBeVisible();
        await expect(peek(page)).toBeHidden();
        await expect(dialog.locator('.mb-dp-xtitle')).toHaveText('1001 AMERICAN DREAMS');
        await expect(dialog.locator('.mb-dp-gname')).toHaveText(['Tampa,FL,Jai Alai(USA) 10-Nov-1975']);
        await expect(dialog.locator('.mb-dp-tracks li')).toHaveCount(14);
        await expect(dialog.locator('.mb-dp-pos-label')).toHaveText(/^1 \/ \d+$/);
        await expect(page.locator('tr.mb-dp-current a[href*="code=CR1AD1"]')).toHaveCount(1);
        // The Space did not scroll the page under the dialog.
        expect(served).toHaveLength(1);

        // → is the next row, which has no fixture: a definite error, with a way to retry.
        await page.mouse.move(0, 0);
        await page.keyboard.press('ArrowRight');
        await expect(dialog.locator('.mb-dp-pos-label')).toHaveText(/^2 \/ \d+$/);
        await expect(dialog.locator('.mb-dp-warn')).toHaveText('Could not load the detail page.');
        await expect(dialog.locator('.mb-dp-retry')).toBeVisible();
        expect(served).toHaveLength(2);
        expect(served[1]).toMatch(/code=(?!CR1AD1)/);
        // ← is back on the first row, from memory.
        await page.keyboard.press('ArrowLeft');
        await expect(dialog.locator('.mb-dp-xtitle')).toHaveText('1001 AMERICAN DREAMS');
        expect(served).toHaveLength(2);

        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
        await expect(page.locator('tr.mb-dp-current')).toHaveCount(0);
        expect(errors).toEqual([]);
    });

    test('Space pins even with the focus the render left in the filter, but a Space TYPED there stays typed', async ({ page }) => {
        const errors = trackPageErrors(page);
        await page.clock.install();
        await bsWithTable(page);
        const filter = page.locator('#mb-global-filter-input');
        const link = page.locator('table.tbl tbody a[href*="code=CR1AD1"]');
        // Typing in the filter while the pointer rests on a title. The input
        // carries its own prefix ("🔍 "), so the checks are on what a key adds;
        // "1001" keeps the hovered row (1001 AMERICAN DREAMS) in the table.
        await filter.focus();
        await peekAt(page, link);
        await expect(peek(page)).toContainText('14 tracks');
        const before = await filter.inputValue();
        await page.keyboard.type('1001');
        await page.keyboard.press('Space');
        await expect(filter).toHaveValue(`${before}1001 `);
        expect(await page.locator('#mb-dp-dialog').count()).toBe(0);

        // Focus still in the filter, but nothing typed for a while (the
        // clock jumps past the 1.5 s grace): Space pins, and types nothing.
        await page.clock.fastForward(1600);
        await peekAt(page, link);
        await expect(peek(page)).toContainText('14 tracks');
        await page.keyboard.press('Space');
        await expect(page.locator('#mb-dp-dialog .mb-dp-xtitle')).toHaveText('1001 AMERICAN DREAMS');
        await expect(filter).toHaveValue(`${before}1001 `);
        expect(errors).toEqual([]);
    });

    test('a hover that has moved on by the time its slot comes up makes no request', async ({ page }) => {
        await page.clock.install();
        const { served } = await bsWithTable(page, { sa_rich_tooltip_delay_ms: 0 });
        const links = page.locator('table.tbl tbody a[href*="detrec.aspx"]');
        await hover(page, links.nth(0));
        await expect.poll(() => served.length).toBe(1);
        // The second hover asks right away, but its slot must still be in the
        // future when the pointer leaves. Reserved here rather than assumed:
        // "a second after the first" held only while the test ran within that
        // second, and under a loaded full run it did not (the slot was free at
        // once, the card still showing, so the page was asked: 14 of 20 runs
        // failed with --repeat-each=20, DEBUG-NOTES 2026-10-07).
        await page.evaluate(() => window.__saTest.reserveDpRateSlots(2));
        await page.keyboard.down('Control');
        await links.nth(1).hover();
        await page.keyboard.up('Control');
        await expect(peek(page)).toBeVisible();
        await expect(peek(page)).toContainText('Loading the detail page');
        await page.mouse.move(0, 0);
        await expect(peek(page)).toBeHidden();
        // Past the slot: it comes up, finds nobody wanting the page, and asks
        // nothing. The gate idle is the signal that every reserved slot (and
        // the hover's own) has come up.
        await page.clock.fastForward(3500);
        await expect.poll(() => page.evaluate(() => window.__saTest.dpRateSlotWaitMs())).toBe(0);
        await expect(peek(page)).toBeHidden();
        expect(served).toHaveLength(1);
    });

    test('a record with a photo shows it', async ({ page }) => {
        const errors = trackPageErrors(page);
        await bsWithTable(page);
        await page.route('https://www.brucespringsteen.it/blegs/images/LP1B1.jpg', (route) => route.fulfill({
            contentType: 'image/png', body: ONE_PX_PNG,
        }));
        await peekAt(page, page.locator('table.tbl tbody a[href*="code=LP1B1"]'));
        await expect(peek(page).locator('img.mb-dp-cover')).toHaveAttribute('src', 'https://www.brucespringsteen.it/blegs/images/LP1B1.jpg');
        await expect.poll(() => peek(page).locator('img.mb-dp-cover').evaluate((img) => img.naturalWidth)).toBe(1);
        expect(errors).toEqual([]);
    });

    test('a photo that fails to load is dropped, not shown broken', async ({ page }) => {
        const errors = trackPageErrors(page);
        await bsWithTable(page);
        // The list loader's catch-all aborts the photo, as a missing one 404s on the site.
        await peekAt(page, page.locator('table.tbl tbody a[href*="code=LP1B1"]'));
        await expect(peek(page)).toContainText('15 tracks');
        await expect(peek(page).locator('img')).toHaveCount(0);
        expect(errors).toEqual([]);
    });
});

test.describe('the other hosts', () => {
    test('springsteenlyrics.com: the card, then the Live page view with the site\'s navigation hidden', async ({ page }) => {
        const errors = trackPageErrors(page);
        await loadSlListPage(page, { kind: 'bootlegs', settingsOverride: { sa_sl_detail_preview: true } });
        const { served } = await routeDetailPages(page, 'sl');
        await page.click(`button[data-label="${SL_KINDS.bootlegs.button}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });

        const link = page.locator('table.tbl tbody td a[href*="item=4554"]').filter({ hasNot: page.locator('img') });
        await peekAt(page, link);
        await expect(peek(page)).toContainText(/\d+ tracks?/);
        await page.keyboard.press('Space');
        const dialog = page.locator('#mb-dp-dialog');
        await expect(dialog.locator('.mb-dp-xtitle')).toBeVisible();

        await dialog.locator('button', { hasText: 'Live page' }).click();
        const frame = dialog.locator('iframe');
        await expect(frame).toHaveAttribute('sandbox', 'allow-same-origin allow-popups allow-popups-to-escape-sandbox');
        // Seen from the list page: same origin, so the frame's document is
        // readable. "Rendered" is measured by client rects: a child of a hidden
        // ancestor keeps its own computed display.
        const state = () => page.evaluate(() => {
            const doc = document.querySelector('#mb-dp-dialog iframe').contentDocument;
            if (!doc || !doc.documentElement.dataset.mbDpDone) return null;
            const shown = (sel) => doc.querySelector(sel).getClientRects().length > 0;
            return { topBar: shown('.top-bar'), footer: shown('footer'), detail: shown('.project-detail') };
        });
        await expect.poll(state).toEqual({ topBar: false, footer: false, detail: true });
        await dialog.locator('input.mb-dp-hidenav').uncheck();
        await expect.poll(state).toEqual({ topBar: true, footer: true, detail: true });
        // The frame shows the page the hover already fetched: no second
        // request. It is a cleaned copy (srcdoc): no script left to block, and
        // its relative URLs resolve against the page's own address.
        expect(served.filter((u) => /item=4554/.test(u))).toHaveLength(1);
        expect(await page.evaluate(() => {
            const fr = document.querySelector('#mb-dp-dialog iframe');
            const doc = fr.contentDocument;
            return { srcdoc: fr.hasAttribute('srcdoc'), src: fr.getAttribute('src'), scripts: doc.querySelectorAll('script').length, base: doc.baseURI };
        })).toEqual({ srcdoc: true, src: null, scripts: 0, base: 'https://springsteenlyrics.com/bootlegs.php?item=4554&category=aud_live1967' });
        // ⟳ reads the page again, bypassing that memory.
        await dialog.locator('button.mb-dp-tbtn', { hasText: '⟳' }).click();
        await expect.poll(state).toEqual({ topBar: true, footer: true, detail: true });
        expect(served.filter((u) => /item=4554/.test(u))).toHaveLength(2);
        expect(errors).toEqual([]);
    });

    test('springsteenlyrics.com: a one-disc tracklist takes the whole column, two discs share it', async ({ page }) => {
        // Pins: `.mb-dp-discs` leaves no empty grid tracks. With
        // `auto-fill` a single disc sat in one ~180 px track of a ~430 px
        // column and its titles wrapped ("DOES THIS BUS STOP AT / 82ND
        // STREET?") with the rest of the column empty.
        const errors = trackPageErrors(page);
        await loadSlListPage(page, { kind: 'bootlegs', settingsOverride: { sa_sl_detail_preview: true } });
        await routeDetailPages(page, 'sl');
        await page.click(`button[data-label="${SL_KINDS.bootlegs.button}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await peekAt(page, page.locator('table.tbl tbody td a[href*="item=4554"]').filter({ hasNot: page.locator('img') }));
        await page.keyboard.press('Space');
        const discs = page.locator('#mb-dp-dialog .mb-dp-discs');
        await expect(discs.locator(':scope > div')).toHaveCount(1);
        const widths = () => discs.evaluate((el) => ({
            all: el.getBoundingClientRect().width,
            each: Array.from(el.children, (d) => d.getBoundingClientRect().width),
        }));
        const one = await widths();
        expect(one.all).toBeGreaterThan(360);
        expect(Math.abs(one.each[0] - one.all)).toBeLessThan(1);
        // Two discs: side by side, half each (less the 16 px gap).
        await discs.evaluate((el) => { el.appendChild(el.firstElementChild.cloneNode(true)); });
        const two = await widths();
        expect(two.each).toHaveLength(2);
        two.each.forEach((w) => expect(Math.abs(w - (two.all - 16) / 2)).toBeLessThan(1));
        expect(errors).toEqual([]);
    });

    test('springsteenlyrics.com lyrics index: a song\'s card, its dialog, and a song without lyrics', async ({ page }) => {
        const errors = trackPageErrors(page);
        await loadSlListPage(page, { kind: 'lyrics-b', settingsOverride: { sa_sl_detail_preview: true } });
        const { served } = await routeDetailPages(page, 'sl');
        await page.click(`button[data-label="${SL_KINDS['lyrics-b'].button}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        // What the card should show, read from the (blanked) fixture rather than written here.
        const want = await page.evaluate(([h, u]) => window.__saTest.dpParse('springsteenlyrics.com', h, u),
            [fixtureHtml('detail-sl-lyrics-badlands.html'), 'https://www.springsteenlyrics.com/lyrics.php?song=badlands']);

        await peekAt(page, page.locator('table.tbl tbody a[href$="lyrics.php?song=badlands"]'));
        await expect(peek(page).locator('.mb-tt-title')).toHaveText('BADLANDS');
        await expect(peek(page)).toContainText('Album version');
        await expect(peek(page)).toContainText('Versions on the site');
        expect(await peek(page).locator('.mb-dp-excerpt').evaluate((el) => el.innerText.split('\n')))
            .toEqual(want.excerpt.lines);
        await expect(peek(page)).toContainText(`Lyrics: ${want.excerpt.total} lines`);
        await expect(peek(page)).toContainText('BADLANDS is a song written by Bruce Springsteen');
        expect(served).toEqual(['https://springsteenlyrics.com/lyrics.php?song=badlands']);

        await page.keyboard.press('Space');
        const dialog = page.locator('#mb-dp-dialog');
        await expect(dialog.locator('.mb-dp-xtitle')).toHaveText('BADLANDS');
        await expect(dialog.locator('.mb-dp-col').last().locator('h4').first()).toHaveText('Lyrics');
        expect(await dialog.locator('.mb-dp-section').first().evaluate((el) => el.textContent))
            .toBe(want.sections[0].text);
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);

        await peekAt(page, page.locator('table.tbl tbody a[href$="lyrics.php?song=babyme"]'));
        await expect(peek(page)).toContainText('Lyrics not available');
        await expect(peek(page).locator('.mb-dp-excerpt')).toHaveCount(0);
        expect(errors).toEqual([]);
    });

    test('jungleland.it: a windows-1252 page is decoded, and the parse survives a reload (IndexedDB)', async ({ page }) => {
        const errors = trackPageErrors(page);
        await loadJlListPage(page, { settingsOverride: { sa_jl_detail_preview: true } });
        const { served } = await routeDetailPages(page, 'jl');
        await page.route(/^https:\/\/www\.jungleland\.it\/artwork\//, (route) => route.fulfill({ contentType: 'image/jpeg', body: ONE_PX_PNG }));
        await page.click(`button[data-label="${JL_BUTTON}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const link = page.locator('table.tbl tbody a', { hasText: 'Magic In The Köln Night' });
        await peekAt(page, link);
        await expect(peek(page).locator('.mb-tt-title')).toHaveText('Magic In The Köln Night (2007-12-13)');
        await expect(peek(page)).toContainText('Highway12');
        await expect(peek(page)).not.toContainText('0000-00-00');
        await expect(peek(page).locator('img.mb-dp-cover')).toHaveCount(1);
        await expect(peek(page).locator('.mb-dp-thumbs img')).toHaveCount(5);
        expect(served).toHaveLength(1);

        // A reload empties memory; the database still has the record.
        await page.reload();
        await addRequiredLibs(page);
        await page.addScriptTag({ path: MB_LIBRARY_PATH });
        await page.addScriptTag({ path: USERSCRIPT_PATH });
        await page.click(`button[data-label="${JL_BUTTON}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await peekAt(page, page.locator('table.tbl tbody a', { hasText: 'Magic In The Köln Night' }));
        await expect(peek(page)).toContainText('saved today');
        expect(served).toHaveLength(1);
        expect(errors).toEqual([]);
    });

    test('jungleland.it: a click on a scan opens the artwork viewer over the window; Esc closes only the viewer', async ({ page }) => {
        // Pins: a plain click opens #mb-art-viewer on THAT image, with the
        // cover first and the scans after it; the large image is the scan's
        // full file, loaded without a referrer and outside the art cache
        // (through the cache it would go to the GM stub's 404 and stay a
        // thumbnail); a click in the viewer is not a click outside the
        // window; Esc closes the viewer, not the window, and focus returns to
        // the thumbnail; a Ctrl-click is left to the link.
        const errors = trackPageErrors(page);
        await loadJlListPage(page, { settingsOverride: { sa_jl_detail_preview: true } });
        await routeDetailPages(page, 'jl');
        const art = [];
        await page.route(/^https:\/\/www\.jungleland\.it\/artwork\//, (route) => {
            art.push({ url: route.request().url(), referer: route.request().headers().referer || '' });
            return route.fulfill({ contentType: 'image/jpeg', body: ONE_PX_PNG });
        });
        await page.click(`button[data-label="${JL_BUTTON}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await peekAt(page, page.locator('table.tbl tbody a', { hasText: 'Magic In The Köln Night' }));
        await page.keyboard.press('Space');
        const dialog = page.locator('#mb-dp-dialog');
        await expect(dialog.locator('.mb-dp-gallery a')).toHaveCount(5);
        // The cover (the front scan's thumbnail) links the front's full image.
        await expect(dialog.locator('a:has(> img.mb-dp-xcover)')).toHaveAttribute('href', /\/artwork\/other\/Magic.*_front\.jpg$/);

        // A Ctrl-click is the link's: nothing prevents it, no viewer opens.
        const ctrlPrevented = await dialog.locator('.mb-dp-gallery a').nth(1).evaluate((a) => {
            let prevented = null;
            document.addEventListener('click', (e) => { prevented = e.defaultPrevented; e.preventDefault(); }, { once: true });
            a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
            return prevented;
        });
        expect(ctrlPrevented).toBe(false);
        await expect(page.locator('#mb-art-viewer:not([hidden])')).toHaveCount(0);

        const cd1 = dialog.locator('.mb-dp-gallery a', { hasText: 'cd1' });
        await cd1.click();
        const viewer = page.locator('#mb-art-viewer');
        await expect(viewer).toBeVisible();
        await expect(viewer.locator('.mb-artv-title')).toHaveText('Magic In The Köln Night (2007-12-13)');
        // front (the cover), back, cd1, …: cd1 is the third.
        await expect(viewer.locator('.mb-artv-pos')).toHaveText('3 / 6');
        await expect(viewer.locator('.mb-artv-info .mb-tt-title')).toHaveText('cd1');
        await expect(viewer.locator('.mb-artv-info')).toContainText('www.jungleland.it');
        // None of the archive's rows.
        await expect(viewer.locator('.mb-artv-info')).not.toContainText('Main front');
        await expect(viewer.locator('.mb-artv-info')).not.toContainText('approved');
        const stage = viewer.locator('.mb-artv-stage .mb-artv-img');
        await expect(stage).toHaveAttribute('data-artv-size', 'big');
        await expect(stage).toHaveAttribute('data-artv-url', /\/artwork\/other\/Magic.*_cd1\.jpg$/);
        const full = art.filter((r) => /\/artwork\/other\/Magic.*_cd1\.jpg$/.test(r.url));
        expect(full.length).toBeGreaterThan(0);
        expect(full.every((r) => r.referer === '')).toBe(true);

        await page.keyboard.press('ArrowRight');
        await expect(viewer.locator('.mb-artv-pos')).toHaveText('4 / 6');
        await expect(viewer.locator('.mb-artv-info .mb-tt-title')).toHaveText('cd2');
        // The grid is one run, not "(no type)".
        await page.keyboard.press('g');
        await expect(viewer.locator('.mb-artv-grid-hdr')).toHaveText(['Images × 6']);
        await viewer.locator('.mb-artv-grid img').first().click();
        await expect(viewer.locator('.mb-artv-pos')).toHaveText('1 / 6');
        await expect(viewer.locator('.mb-artv-info .mb-tt-title')).toHaveText('front');

        // A click inside the viewer leaves the window open.
        await viewer.locator('.mb-artv-info').click();
        await expect(dialog).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(viewer).toBeHidden();
        await expect(dialog).toBeVisible();
        expect(await cd1.evaluate((a) => document.activeElement === a)).toBe(true);
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
        expect(errors).toEqual([]);
    });

    test('Brucebase: the card\'s count and last show; the dialog\'s lyrics; the Live page with every tab', async ({ page }) => {
        const errors = trackPageErrors(page);
        await loadBbSongsPage(page, { settingsOverride: { sa_bb_detail_preview: true } });
        await routeDetailPages(page, 'bb');
        await page.click(`button[data-label="${BB_BUTTON}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await peekAt(page, page.locator('table.tbl tbody a[href$="/song:4th-of-july-asbury-park-sandy"]'));
        await expect(peek(page).locator('.mb-dp-stat')).toHaveText('280 live performances');
        await expect(peek(page)).toContainText('2024-09-15 Beach, Surf Stage, Asbury Park, NJ');
        await expect(peek(page)).toContainText('Track 2 of The Wild, The Innocent & The E Street Shuffle, 1973.');
        await page.keyboard.press('Space');
        const dialog = page.locator('#mb-dp-dialog');
        await expect(dialog.locator('h4', { hasText: 'Lyrics' })).toBeVisible();
        expect(await dialog.locator('.mb-dp-section').last().evaluate((el) => el.textContent.split('\n').filter(Boolean).length))
            .toBeGreaterThan(20);
        // The window shows the releases one per line ...
        const released = dialog.locator('.mb-dp-kv dt:text-is("Released on") + dd');
        expect(await released.evaluate((dd) => dd.innerText.split('\n'))).toEqual([
            'The Wild, The Innocent & The E Street Shuffle (1973)', '4th Of July, Asbury Park (Sandy) (Single, 1975)',
            'The Essential (2003)', 'Chapter And Verse (2016)', 'Best Of (2024)',
        ]);
        await expect(dialog.locator('.mb-dp-kv dt:text-is("Released live on") + dd br')).toHaveCount(3);
        // ... and markup in a value is still text, not HTML.
        expect(await released.evaluate((dd) => dd.querySelectorAll('*:not(br)').length)).toBe(0);

        await dialog.locator('button', { hasText: 'Live page' }).click();
        await expect.poll(() => page.evaluate(() => {
            const doc = document.querySelector('#mb-dp-dialog iframe').contentDocument;
            if (!doc || !doc.documentElement.dataset.mbDpDone) return null;
            const panels = Array.from(doc.querySelectorAll('#page-content .yui-content > div'));
            return {
                sideBar: getComputedStyle(doc.getElementById('side-bar')).display,
                labels: doc.querySelectorAll('h3.mb-dp-tablabel').length,
                hiddenPanels: panels.filter((p) => getComputedStyle(p).display === 'none').length,
                panels: panels.length,
            };
        })).toEqual({ sideBar: 'none', labels: 10, hiddenPanels: 0, panels: 10 });
        // The premise: the saved page carries Wikidot's inline handlers and
        // javascript: links (the build strips scripts only). The frame's copy
        // has none, so the sandbox has nothing to refuse (9.99.1266).
        const raw = fixtureHtml('detail-bb-4th-of-july.html');
        expect(raw).toMatch(/\sonclick="/);
        expect(raw).toMatch(/href="javascript:/);
        expect(await page.evaluate(() => {
            const doc = document.querySelector('#mb-dp-dialog iframe').contentDocument;
            let handlers = 0;
            doc.querySelectorAll('*').forEach((el) => {
                for (const a of el.attributes) if (/^on/i.test(a.name)) handlers++;
            });
            return { handlers, js: doc.querySelectorAll('[href^="javascript:" i]').length };
        })).toEqual({ handlers: 0, js: 0 });
        expect(errors).toEqual([]);
    });
});
