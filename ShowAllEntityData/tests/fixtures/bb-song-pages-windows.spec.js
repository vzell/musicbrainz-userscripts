'use strict';

// org/brucebase.org, Phase 16 batch 3 — links that had no preview (the
// sweep's L1–L4), as vzell answered the mockup
// (https://claude.ai/artifact/6HcKkN6QeAvw1SKk4BYC5f), all as recommended:
// a song's own pages (tour counts, On The Tracks, lyrics) under the song
// preview's setting, an album's studio sessions and a discography under the
// event, venue, people and release one (answer 1); a sessions table a folded
// section of its first 100 rows and "N more rows on the page" (2); a
// discography's releases under the page's headings with year, date and label,
// the covers the window's pictures (3); a lyrics card with the first four
// lines and how many versions (4); a lyrics window a section per version,
// the first open, the springsteenlyrics.com link last (5); no preview for the
// other stats pages (6). And /multi:, /soundcheck: as their show.
//
// Pinned: the window's records of the fixtures; which setting each kind of
// link falls under; the redirect; the card and the window on a real hover of
// a tour-counts and a lyrics link.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadBbEventPage } = require('../support/bbFixture');

const FX = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');
const BB = 'https://brucebase.wikidot.com/';

/**
 * The window's records of fixtures, in the page.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object<string, [string, string]>} pages name → [fixture, path]
 * @returns {Promise<Object<string, Object>>}
 */
function records(page, pages) {
    const input = Object.fromEntries(Object.entries(pages).map(([k, [f, p]]) => [k, [FX(f), BB + p]]));
    return page.evaluate((all) => Object.fromEntries(Object.entries(all).map(([k, [html, url]]) => {
        const d = window.__saTest.dpParse('brucebase.wikidot.com', html, url);
        return [k, {
            title: d.title, highlight: d.highlight, fields: d.fields, excerpt: d.excerpt,
            images: d.images.map(i => ({ label: i.label, thumb: i.thumb })),
            sections: d.sections.map(s => ({ label: s.label, text: s.text || '', html: s.html || '', open: s.open })),
        }];
    })), input);
}

const labels = r => r.sections.map(s => s.label);
const sec = (r, re) => r.sections.find(s => re.test(s.label));
const field = (r, k) => (r.fields.find(f => f[0] === k) || [])[1];

let pageErrors;
test.beforeEach(({ page }) => {
    pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e.stack || e.message || e)));
});
test.afterEach(() => {
    expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
});

test.describe('Brucebase song and album pages\' previews (Phase 16, batch 3)', () => {
    test('which setting a link previews under; the other stats pages none', async ({ page }) => {
        await loadBbEventPage(page, 'gig-1978-07-07');
        const got = await page.evaluate(hrefs => Object.fromEntries(hrefs.map(h => [h, window.__saTest.bbPreviewSetting(h)])), [
            '/song:thunder-road', '/stats:thunder-road-tour', '/ott:do-you-want-me-to-say-alright', '/lyrics:born-in-the-u-s-a',
            '/stats:born-to-run-studio-sessions', '/stats:born-to-run-studio-sessions-details', '/stats:discography-album',
            '/stats:discography', '/stats:discography-playlist', '/stats:discography-playlist-songs', '/stats:on-the-tracks', '/stats:songs-list', '/stats:songs-btr-tour', '/multi:1978-07-07-x', '/soundcheck:2016-01-16-x',
        ]);
        expect(got).toEqual({
            '/song:thunder-road': 'sa_bb_detail_preview',
            '/stats:thunder-road-tour': 'sa_bb_detail_preview',
            '/ott:do-you-want-me-to-say-alright': 'sa_bb_detail_preview',
            '/lyrics:born-in-the-u-s-a': 'sa_bb_detail_preview',
            '/stats:born-to-run-studio-sessions': 'sa_bb_event_preview',
            '/stats:born-to-run-studio-sessions-details': 'sa_bb_event_preview',
            '/stats:discography-album': 'sa_bb_event_preview',
            '/stats:discography': '',
            '/stats:discography-playlist': '',
            '/stats:discography-playlist-songs': '',
            '/stats:on-the-tracks': '',
            '/stats:songs-list': '',
            '/stats:songs-btr-tour': '',
            '/multi:1978-07-07-x': 'sa_bb_event_preview',
            '/soundcheck:2016-01-16-x': 'sa_bb_event_preview',
        });
    });

    test('/multi: and /soundcheck: are read at their show\'s address', async ({ page }) => {
        await loadBbEventPage(page, 'gig-1978-07-07');
        const gig = 'gig:1978-07-07-roxy-theatre-west-hollywood-ca';
        const html = FX('bb-event-gig-1978-07-07.html').replace('</head>',
            `<script>var WIKIREQUEST = { info: {} }; WIKIREQUEST.info.requestPageName = "${gig}";</script></head>`);
        const got = await page.evaluate(({ h }) => ['multi:x', 'soundcheck:y', 'onstage:z', 'retail:w'].map(p => window.__saTest.bbRedirectedUrl(h, `https://brucebase.wikidot.com/${p}`)), { h: html });
        expect(got).toEqual([BB + gig, BB + gig, BB + gig, `${BB}retail:w`]);
    });

    test('tour counts: the tour performances, the tours and the other shows; every tour in an open section', async ({ page }) => {
        await loadBbEventPage(page, 'gig-1978-07-07');
        const html = FX('bb-stats-57-channels-and-nothin-on-tour.html');
        const tours = await page.evaluate(h => window.__saTest.bbTourCounts(h), html);
        expect(tours.tours.length, 'premise: the page counts tours').toBeGreaterThan(1);
        const { r } = await records(page, { r: ['bb-stats-57-channels-and-nothin-on-tour.html', 'stats:57-channels-and-nothin-on-tour'] });
        const played = tours.tours.reduce((n, t) => n + t.played, 0);
        expect(r.highlight).toEqual({ value: played.toLocaleString('en-US'), label: played === 1 ? 'tour performance' : 'tour performances' });
        expect(field(r, 'Tours')).toBe(String(tours.tours.filter(t => t.played).length));
        expect(tours.other, 'premise: the box of other shows').toBeTruthy();
        expect(field(r, 'Other shows')).toBe(`${tours.other.shows} known · ${tours.other.rehearsals} public rehearsals`);
        const s = sec(r, /^Tours \(/);
        expect(s.label).toBe(`Tours (${tours.tours.length})`);
        expect(s.open).toBeUndefined();
        expect((s.html.match(/<li>/g) || []).length).toBe(tours.tours.length);
        const t0 = tours.tours[0];
        expect(s.html).toContain(`<li>${t0.tour} — <b>${t0.played}</b> of ${t0.shows} shows`);
        expect(labels(r)[0]).toMatch(/^Tours \(/);
    });

    test('studio sessions: the facts, Overview open, Credits and each table folded, 100 rows, then "N more rows on the page"', async ({ page }) => {
        await loadBbEventPage(page, 'gig-1978-07-07');
        const r = await records(page, {
            btr: ['bb-stats-born-to-run-studio-sessions.html', 'stats:born-to-run-studio-sessions'],
            dark: ['bb-stats-darkness-on-the-edge-of-town-studio-sessions-timeline.html', 'stats:darkness-on-the-edge-of-town-studio-sessions-timeline'],
        });
        const read = await page.evaluate(([h, u]) => window.__saTest.bbSessionsRead(h, u).tables.map(t => [t.name, t.rows.length]),
            [FX('bb-stats-darkness-on-the-edge-of-town-studio-sessions-timeline.html'), `${BB}stats:darkness-on-the-edge-of-town-studio-sessions-timeline`]);
        expect(r.btr.fields).toEqual([['Released', 'August 25, 1975'], ['Label', 'Columbia'], ['Album', 'Born To Run'], ['Tables', '15']]);
        expect(labels(r.btr).slice(0, 3)).toEqual(['Overview', 'Credits', 'Released › Born To Run (8)']);
        expect(sec(r.btr, /^Overview$/).open).toBeUndefined();
        expect(sec(r.btr, /^Overview$/).text).toMatch(/^The Born To Run sessions spanned a 14-month period/);
        expect(sec(r.btr, /^Credits$/)).toMatchObject({ open: false, text: expect.stringMatching(/^Commercially Released\*: August 25, 1975\nLabel: Columbia/) });
        const btr = sec(r.btr, /^Released › Born To Run/);
        expect(btr.open).toBe(false);
        expect(btr.html).toMatch(/^<ul><li>1\. · <span data-mb-tip title="As written on Brucebase:\nTHUNDER ROAD"><a href="https:\/\/brucebase\.wikidot\.com\/song:thunder-road"[^>]*>Thunder Road<\/a><\/span> · 4:44 · /);
        // Every table of the reader is a section, its count in the label.
        for (const [name, n] of read) {
            const s = sec(r.dark, new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\(${n}\\)$`));
            expect(s, name).toBeTruthy();
            expect(s.open).toBe(false);
            // A line of text per row shown (a cell's own lines are joined).
            expect(s.text.split('\n').length, name).toBe(Math.min(n, 100) + (n > 100 ? 1 : 0));
            const tail = n > 100 ? `</ul><p class="mb-dp-xsub">${(n - 100).toLocaleString('en-US')} more rows on the page</p>` : '</ul>';
            expect(s.html.endsWith(tail), `${name}: ends with ${tail}`).toBe(true);
        }
        expect(read.some(([, n]) => n > 100), 'premise: a table of more than 100 rows').toBe(true);
    });

    test('a discography: the releases under the page\'s headings with year, date and label; the covers as "Cover" pictures, not the strip', async ({ page }) => {
        await loadBbEventPage(page, 'gig-1978-07-07');
        const html = FX('bb-stats-discography-album.html');
        const read = await page.evaluate(([h, u]) => window.__saTest.bbGalleryRead(h, u), [html, `${BB}stats:discography-album`]);
        const { r } = await records(page, { r: ['bb-stats-discography-album.html', 'stats:discography-album'] });
        expect(field(r, 'Releases')).toBe(String(read.entries.length));
        expect(field(r, 'Years')).toBe('1973–2025');
        const sections = new Map();
        read.entries.forEach(e => sections.set(e.section || e.tab || 'Releases', (sections.get(e.section || e.tab || 'Releases') || 0) + 1));
        const tags = labels(r).findIndex(l => /^Tags \(/.test(l));
        expect(labels(r).slice(0, tags)).toEqual(Array.from(sections, ([k, n]) => `${k} (${n})`));
        const first = r.sections[0];
        expect(first.open).toBe(false);
        expect(first.html).toMatch(/^<ul class="mb-dp-bbdisc"><li><img class="mb-dp-bbcov" src="https:\/\/brucebase\.wdfiles\.com\/[^"]+" alt="" loading="lazy">2025 <a href="https:\/\/brucebase\.wikidot\.com\/retail:nebraska-82"[^>]*>Nebraska '82<\/a> <span class="mb-dp-xsub">Expanded Edition<\/span> · October 17, 2025 · Columbia<\/li>/);
        const withCover = read.entries.filter(e => e.covers[0]);
        // The entries' own covers, in their order — not the strip of every
        // discography's covers at the top of the page.
        expect(r.images.map(i => i.thumb)).toEqual(withCover.map(e => e.covers[0].thumb || e.covers[0].full));
        expect(new Set(r.images.map(i => i.label))).toEqual(new Set(['Cover']));
        const imgs = (html.match(/<img\b/g) || []).length;
        expect(imgs, 'premise: the page has the strip').toBeGreaterThan(withCover.length + 100);
    });

    test('an On The Tracks page: versions and how many circulate; the versions under each song, open; the notes folded', async ({ page }) => {
        await loadBbEventPage(page, 'gig-1978-07-07');
        const { r } = await records(page, { r: ['bb-ott-do-you-want-me-to-say-alright.html', 'ott:do-you-want-me-to-say-alright'] });
        expect(r.fields).toEqual([['Versions', '10'], ['Circulating', '9 of 10']]);
        const v = sec(r, /^Versions \(/);
        expect(v.label).toBe('Versions (10)');
        expect(v.open).toBeUndefined();
        expect(v.html).toMatch(/^<p><b>In the City Tonight<\/b><\/p><ul><li>V1 · 4:47 — <a href="https:\/\/brucebase\.wikidot\.com\/bootleg:lost-masters-xiv-lol"[^>]*>LM-14<\/a><\/li>/);
        expect((v.html.match(/<p><b>In the City Tonight<\/b><\/p>/g) || []).length).toBe(1);
        expect(sec(r, /^Notes$/)).toMatchObject({ open: false, text: expect.stringMatching(/^Note: "In The City Tonight" V1–V8/) });
    });

    test('a lyrics page: a section per version, the first open, its date in a live version\'s label; the springsteenlyrics.com links last; the card\'s first four lines', async ({ page }) => {
        await loadBbEventPage(page, 'gig-1978-07-07');
        const r = await records(page, {
            usa: ['bb-lyrics-born-in-the-u-s-a.html', 'lyrics:born-in-the-u-s-a'],
            bab: ['bb-lyrics-american-babylon.html', 'lyrics:american-babylon'],
        });
        expect(labels(r.usa).slice(0, 4)).toEqual(['Born In The U.S.A.', 'Born In The U.S.A. (Tracks)', 'Born In The U.S.A. (Nebraska \'82; Electric)', 'Other versions']);
        expect(r.usa.sections.slice(0, 3).map(s => s.open)).toEqual([undefined, false, false]);
        expect(field(r.usa, 'Versions')).toBe('3');
        const other = sec(r.usa, /^Other versions$/);
        expect((other.html.match(/href="https:\/\/www\.springsteenlyrics\.com\/lyrics\.php\?song=[^"]+"/g) || []).length).toBe(3);
        expect(other.html).toMatch(/^<ul><li><a href="https:\/\/www\.springsteenlyrics\.com\/lyrics\.php\?song=bornintheusa"[^>]*>SpringsteenLyrics\.com<\/a> — Born In The U\.S\.A\.<\/li>/);
        // The verses (blanked in the fixture: "la"), a line each.
        const first = sec(r.usa, /^Born In The U\.S\.A\.$/).text.split('\n');
        expect(r.usa.excerpt).toEqual({ label: 'Born In The U.S.A.', lines: first.filter(Boolean).slice(0, 4), total: first.filter(Boolean).length, foot: '3 versions (Space for all)' });
        expect(r.usa.excerpt.lines[0]).toMatch(/^la la/);
        expect(labels(r.bab)[0]).toBe('American Babylon (Live Version) · October 20, 1995');
        expect(sec(r.bab, /^Other versions$/).html).toMatch(/^<p><a href="https:\/\/www\.springsteenlyrics\.com\/[^"]+"[^>]*>SpringsteenLyrics\.com<\/a><\/p>$/);
        expect(r.bab.excerpt.foot).toBe('1 version (Space for all)');
    });

    test('on a hover: a tour-counts link\'s card and window; a lyrics link\'s card shows its first lines and its versions', async ({ page }) => {
        await loadBbEventPage(page, 'gig-1978-07-07', { settingsOverride: { sa_bb_detail_preview: true, sa_bb_event_preview: false } });
        await page.route(`${BB}stats:57-channels-and-nothin-on-tour`, (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: FX('bb-stats-57-channels-and-nothin-on-tour.html') }));
        await page.route(`${BB}lyrics:born-in-the-u-s-a`, (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: FX('bb-lyrics-born-in-the-u-s-a.html') }));
        await page.evaluate(() => {
            const pc = document.getElementById('page-content');
            [['p16-tour', '/stats:57-channels-and-nothin-on-tour', '57 Channels tours'], ['p16-lyr', '/lyrics:born-in-the-u-s-a', 'Born In The U.S.A. lyrics']].forEach(([c, h, t]) => {
                const a = document.createElement('a');
                a.className = c;
                a.setAttribute('href', h);
                a.textContent = t;
                pc.insertBefore(a, pc.firstChild);
                pc.insertBefore(document.createElement('br'), a.nextSibling);
            });
        });
        const hover = async (sel) => {
            await page.mouse.move(0, 0);
            await page.keyboard.down('Control');
            await page.locator(sel).hover();
            await page.keyboard.up('Control');
        };
        await hover('a.p16-lyr');
        const peek = page.locator('#mb-dp-peek');
        await expect(peek.locator('.mb-dp-excerpt')).toHaveText(/^la la/);
        await expect(peek).toContainText('3 versions (Space for all)');
        await page.keyboard.press('Escape');
        await hover('a.p16-tour');
        await expect(peek.locator('.mb-dp-stat')).toContainText('tour performances');
        await page.keyboard.press('Space');
        const first = page.locator('#mb-dp-dialog details.mb-dp-sec').first();
        await expect(first).toHaveAttribute('data-mb-dp-sec', 'Tours');
        await expect(first).toHaveAttribute('open', '');
    });
});
