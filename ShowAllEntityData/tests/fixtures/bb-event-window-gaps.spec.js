'use strict';

// org/brucebase.org, Phase 16 batch 1 — what a Brucebase event page's window
// left out (the sweep's G1–G3), as vzell answered the mockup
// (https://claude.ai/artifact/RX3xHaYRozwSiZP2g5MujY): the description above
// the tabs as the first section, "About this show", open, its first sentence
// on the hover card (answers 1, 2); every cast tab under its own name ("In
// studio"), its bold line leading the section (answer 3); an interview's
// Playlist as the Setlist; the venue's other lists folded after Performances
// (answer 5); an older page's "News" tab as News/Memorabilia (answer 6). The
// year table's On stage column takes whatever cast tab the page has (answer
// 4) — pinned in bb-year-event-pages.spec.js.
//
// Pinned here: the readers on five event fixtures (the window's record, and
// the page view's description, which now also finds plain paragraphs); the
// card and the window on a real hover.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadBbEventPage } = require('../support/bbFixture');

const FX = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');
const PAGES = {
    roxy: ['gig:1978-07-07-roxy-theatre-west-hollywood-ca', 'bb-event-gig-1978-07-07.html'],
    redBank: ['gig:1974-08-14-monmouth-arts-center-red-bank-nj-early', 'bb-event-gig-1974-08-14.html'],
    powerStation: ['recording:1979-04-09-power-station-new-york-city-ny', 'bb-event-recording-1979-04-09.html'],
    sirius: ['interview:2021-04-28-siriusxm-studio-new-york-city-ny', 'bb-event-interview-2021-04-28.html'],
    rodgers: ['nogig:2013-04-16-richard-rodgers-theatre-new-york-city-ny', 'bb-event-nogig-2013-04-16.html'],
};
const URL_OF = (k) => `https://brucebase.wikidot.com/${PAGES[k][0]}`;

/**
 * The window's records (and the page view's reading) of the fixtures, in
 * the page.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object<string, {rec: Object, view: Object}>>}
 */
function records(page) {
    const input = Object.fromEntries(Object.keys(PAGES).map(k => [k, { html: FX(PAGES[k][1]), url: URL_OF(k) }]));
    return page.evaluate((all) => {
        const out = {};
        for (const [k, { html, url }] of Object.entries(all)) {
            const rec = window.__saTest.dpParse('brucebase.wikidot.com', html, url);
            const view = window.__saTest.bbEventRead(html, url);
            out[k] = {
                rec: { fields: rec.fields, cardLine: rec.cardLine || '', sections: rec.sections.map(s => ({ label: s.label, text: s.text, html: s.html, open: s.open })) },
                view: { about: view.about ? view.about.text : '' },
            };
        }
        return out;
    }, input);
}

const labels = (r) => r.rec.sections.map(s => s.label);
const field = (r, k) => (r.rec.fields.find(f => f[0] === k) || [])[1];
const section = (r, re) => r.rec.sections.find(s => re.test(s.label));

let pageErrors;
test.beforeEach(({ page }) => {
    pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e.stack || e.message || e)));
});
test.afterEach(() => {
    expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
});

test.describe('Brucebase event windows: what they left out (Phase 16, batch 1)', () => {
    test('the description: "About this show" first, its first sentence for the card; plain paragraphs too, in the page view as well', async ({ page }) => {
        await loadBbEventPage(page, 'gig-1978-07-07');
        const r = await records(page);
        for (const k of Object.keys(PAGES)) expect(labels(r[k])[0], k).toBe('About this show');
        expect(section(r.roxy, /^About/).text).toMatch(/^Broadcast on KMET-FM radio\. Remarkable setlist includes the premieres of/);
        // A song link of the description stays a link.
        expect(section(r.roxy, /^About/).html).toMatch(/href="https:\/\/brucebase\.wikidot\.com\/song:point-blank"/);
        expect(r.roxy.rec.cardLine).toBe('Broadcast on KMET-FM radio.');
        // Red Bank's description is plain paragraphs (no box); the
        // "Info & Setlist | Venue" line is not part of it.
        const rb = section(r.redBank, /^About/).text;
        expect(rb).toMatch(/^First of two shows, double billing, with Springsteen/);
        expect(rb).not.toMatch(/Info & Setlist/);
        // Portland's "Info & Setlist | Venue" line is a <p> of its own, then
        // the description as a plain paragraph: only the description.
        const portland = await page.evaluate((html) => window.__saTest.dpParse('brucebase.wikidot.com', html,
            'https://brucebase.wikidot.com/gig:1978-06-23-paramount-theatre-portland-or').sections[0], FX('bb-event-gig-1978-06-23.html'));
        expect(portland.label).toBe('About this show');
        expect(portland.text).toMatch(/^As he had done a couple of months earlier in New York City/);
        expect(portland.text).not.toMatch(/Info & Setlist/);
        // A first sentence past 160 characters is cut at a word.
        expect(r.redBank.rec.cardLine).toMatch(/^First of two shows, double billing, .* …$/);
        expect(r.redBank.rec.cardLine.length).toBeLessThanOrEqual(162);
        // The page view reads the same description, plain paragraphs included.
        expect(r.redBank.view.about).toMatch(/^First of two shows, double billing/);
        expect(r.roxy.view.about).toMatch(/^Broadcast on KMET-FM radio\./);
        // Event pages only: a person page's text above its tabs (her
        // biography, batch 2) is no "About this show".
        const patti = await page.evaluate((html) => window.__saTest.dpParse('brucebase.wikidot.com', html,
            'https://brucebase.wikidot.com/relation:patti-scialfa').sections.map(s => s.label), FX('bb-relation-patti-scialfa-p1.html'));
        expect(patti.length).toBeGreaterThan(0);
        expect(patti).not.toContain('About this show');
    });

    test('a cast tab under its own name: "In studio" as a fact and a section, its bold line first; On stage as before', async ({ page }) => {
        await loadBbEventPage(page, 'gig-1978-07-07');
        const r = await records(page);
        const ps = r.powerStation;
        expect(field(ps, 'In studio')).toBe('Bruce Springsteen, Roy Bittan, Clarence Clemons, Danny Federici, Garry Tallent, Steven Van Zandt, Max Weinberg');
        expect(field(ps, 'On stage')).toBeUndefined();
        expect(labels(ps).slice(0, 3)).toEqual(['About this show', 'In studio', 'Setlist (1)']);
        const sec = section(ps, /^In studio$/);
        expect(sec.html).toMatch(/^<p><em>The River Recording Session<\/em><\/p>/);
        expect(sec.html).toMatch(/href="https:\/\/brucebase\.wikidot\.com\/relation:roy-bittan"/);
        // The interview's In Studio: one person, its line "E Street Radio".
        expect(field(r.sirius, 'In studio')).toBe('Bruce Springsteen');
        expect(section(r.sirius, /^In studio$/).html).toMatch(/^<p><em>E Street Radio<\/em><\/p>/);
        // On Stage keeps its fact and its section, the panel as it is.
        expect(field(r.roxy, 'On stage')).toMatch(/^Bruce Springsteen, The E Street Band \(Roy Bittan,/);
        expect(labels(r.roxy).slice(0, 3)).toEqual(['About this show', 'On stage', 'Setlist (25)']);
        expect(section(r.roxy, /^On stage$/).html).not.toMatch(/<em>/);
    });

    // vzell, 2026-11-12: the rarer cast tabs too; every list of a cast tab
    // (a second one holds the guests).
    test('the rarer cast tabs (On Phone, In Room) and a cast tab\'s second list, the guests', async ({ page }) => {
        await loadBbEventPage(page, 'gig-1978-07-07');
        const out = await page.evaluate((all) => {
            const T = window.__saTest;
            const rec = (k) => T.dpParse('brucebase.wikidot.com', all[k][0], all[k][1]);
            const f = (r, n) => (r.fields.find(x => x[0] === n) || [])[1];
            const phone = rec('phone');
            const room = rec('room');
            const lane = rec('lane');
            const view = T.bbEventRead(all.phone[0], all.phone[1]);
            const laneView = T.bbEventRead(all.lane[0], all.lane[1]);
            return {
                phone: f(phone, 'On phone'), phoneSec: (phone.sections.find(s => s.label === 'On phone') || {}).html || '',
                room: f(room, 'In room'), lane: f(lane, 'On stage'),
                view: view.cast ? { label: view.cast.label, names: view.cast.rows.map(r => r.name) } : null,
                laneView: laneView.cast ? laneView.cast.rows.map(r => `${r.name}${r.role ? ` ${r.role}` : ''}`) : null,
                lines: T.bbEvpStageLines('Bruce Springsteen, The E Street Band (Roy Bittan, Clarence Clemons), Southside Johnny (Guest), Garry Tallent (Guest)'),
                plain: T.bbEvpStageLines('Bruce Springsteen, The E Street Band (Roy Bittan, Clarence Clemons)'),
                two: T.bbEvpStageLines('Bruce Springsteen, The E Street Band (Roy Bittan, Max Weinberg), Soozie Tyrell, ' +
                    'The E Street Horns (Curt Ramm, Ed Manion), The Joyce Garrett Singers (Guests)'),
                none: T.bbEvpStageLines('Robert Gordon, Chris Spedding, Bruce Springsteen (Guest)'),
            };
        }, {
            phone: [FX('bb-event-interview-2019-07-10.html'), 'https://brucebase.wikidot.com/interview:2019-07-10-siriusxm-studio-new-york-city-ny'],
            room: [FX('bb-event-gig-1978-10-17.html'), 'https://brucebase.wikidot.com/gig:1978-10-17-sunset-marquis-hotel-west-hollywood-ca'],
            lane: [FX('bb-event-gig-1979-03-14.html'), 'https://brucebase.wikidot.com/gig:1979-03-14-fast-lane-asbury-park-nj'],
        });
        // On Phone: the hosts, then Bruce from the second list.
        expect(out.phone).toBe('Dave Marsh, Jim Rotolo, Bruce Springsteen (Guest)');
        expect(out.phoneSec).toMatch(/^<p><em>E Street Radio<\/em><\/p>/);
        expect(out.view).toEqual({ label: 'On Phone', names: ['Dave Marsh', 'Jim Rotolo', 'Bruce Springsteen'] });
        expect(out.room).toBe('Bruce Springsteen, The Knack (Bruce Gary)');
        // On Stage's second list: the guests, in the window and the page view.
        expect(out.lane).toMatch(/, Bruce Springsteen \(Guest\), Garry Tallent \(Guest\)$/);
        expect(out.laneView).toEqual(expect.arrayContaining(['Bruce Springsteen (Guest)', 'Garry Tallent (Guest)']));
        // The year table's rows: the band folded as before, the guests after it.
        expect(out.plain).toEqual(['Bruce Springsteen, The E Street Band', 'Roy Bittan', 'Clarence Clemons']);
        expect(out.lines).toEqual(['Bruce Springsteen, The E Street Band', 'Roy Bittan', 'Clarence Clemons', 'Southside Johnny (Guest)', 'Garry Tallent (Guest)']);
        // Two groups (the 2009 rehearsal): each its name, then its members.
        expect(out.two).toEqual(['Bruce Springsteen, The E Street Band', 'Roy Bittan', 'Max Weinberg', 'Soozie Tyrell',
            'The E Street Horns', 'Curt Ramm', 'Ed Manion', 'The Joyce Garrett Singers (Guests)']);
        // No group: one row, as before.
        expect(out.none).toEqual(['Robert Gordon, Chris Spedding, Bruce Springsteen (Guest)']);
    });

    test('an interview\'s Playlist as the Setlist: the fact, numbered songs with their artists, after In studio', async ({ page }) => {
        await loadBbEventPage(page, 'gig-1978-07-07');
        const r = await records(page);
        const s = r.sirius;
        expect(field(s, 'Playlist')).toBe('20 songs: Blood Brothers, Waiting on a Friend, You’re a Friend of Mine … Backstreets');
        const pl = section(s, /^Playlist \(/);
        expect(pl.label).toBe('Playlist (20)');
        expect(labels(s).indexOf('Playlist (20)')).toBe(labels(s).indexOf('In studio') + 1);
        expect(pl.html).toMatch(/<ol><li><a href="https:\/\/brucebase\.wikidot\.com\/song:blood-brothers"[^>]*>Blood Brothers<\/a> <span class="mb-dp-xsub">\(Rock Version\)<\/span><\/li>/);
        expect(pl.text.split('\n')).toContain('2. Waiting on a Friend (The Rolling Stones)');
        expect((pl.html.match(/<li>/g) || []).length).toBe(20);
    });

    test('the venue\'s other lists folded after Performances, with their counts; an old "News" tab as News/Memorabilia, without the Flickr module\'s JSON', async ({ page }) => {
        await loadBbEventPage(page, 'gig-1978-07-07');
        const r = await records(page);
        const rb = r.redBank;
        const at = labels(rb).indexOf('Performances');
        expect(labels(rb).slice(at, at + 4)).toEqual(['Performances', 'Appearances (3)', 'Cancelled (2)', 'Performances (w/o Bruce) (1)']);
        for (const l of ['Appearances (3)', 'Cancelled (2)', 'Performances (w/o Bruce) (1)']) expect(rb.rec.sections.find(x => x.label === l).open, l).toBe(false);
        expect(section(rb, /^Cancelled/).html).toMatch(/href="https:\/\/brucebase\.wikidot\.com\/nogig:1975-10-10-monmouth-arts-center-red-bank-nj"/);
        expect(labels(r.sirius)).toContain('From My Home To Yours (31)');
        // "News" is News/Memorabilia; its Flickr gallery module (hidden JSON)
        // is not text.
        const news = section(rb, /^News/);
        expect(news.label).toBe('News/Memorabilia');
        expect(news.text).not.toMatch(/FlickrGalleryModule|"module"/);
        expect(labels(rb)).not.toContain('News');
        // The Performances section keeps its open default.
        expect(section(rb, /^Performances$/).open).toBeUndefined();
    });

    test('on a hover: the card has the first sentence; Space opens the window with "About this show" first and open', async ({ page }) => {
        await loadBbEventPage(page, 'gig-1978-07-07');
        await page.route(URL_OF('redBank'), (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: FX(PAGES.redBank[1]) }));
        await page.evaluate((h) => {
            const a = document.createElement('a');
            a.className = 'p16-probe';
            a.setAttribute('href', h);
            a.textContent = 'Red Bank, early show';
            const pc = document.getElementById('page-content');
            pc.insertBefore(a, pc.firstChild);
        }, `/${PAGES.redBank[0]}`);
        const link = page.locator('a.p16-probe');
        await page.mouse.move(0, 0);
        await page.keyboard.down('Control');
        await link.hover();
        await page.keyboard.up('Control');
        const card = page.locator('#mb-dp-peek');
        await expect(card.locator('.mb-dp-cardline')).toHaveText(/^First of two shows, double billing, .* …$/);
        await page.keyboard.press('Space');
        const first = page.locator('#mb-dp-dialog details.mb-dp-sec').first();
        await expect(first).toHaveAttribute('data-mb-dp-sec', 'About this show');
        await expect(first).toHaveAttribute('open', '');
        await expect(first).toContainText('previously the Carlton Theater');
        await expect(page.locator('#mb-dp-dialog details.mb-dp-sec[data-mb-dp-sec="Cancelled"]')).not.toHaveAttribute('open', '');
    });
});
