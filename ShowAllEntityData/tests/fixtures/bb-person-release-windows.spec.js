'use strict';

// org/brucebase.org, Phase 16 batch 2 — what a Brucebase person's and a
// release's window left out (the sweep's G4, G5), as vzell answered the
// mockup (https://claude.ai/artifact/LHEdFVu715Qu4z2dUackmb), all as
// recommended: a person's biography as the first section, "About", open, its
// "Source: Wikipedia" line last, its first sentence on the hover card
// (answers 1, 2); a release's On The Tracks versions under each song, its
// Recording 'Live' Dates under each disc with each date linked to its show,
// its Gallery/News headings and press links (no photo credits, no "Sorry, no
// … available"), then Performed live, the text tabs, Lyrics and Media — each
// a folded section (answers 3–6).
//
// Pinned: the window's records of the person and release fixtures; the card
// and the window on a real hover of a person link.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadBbEventPage } = require('../support/bbFixture');

const FX = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');
const PATTI = 'https://brucebase.wikidot.com/relation:patti-scialfa';

/**
 * The window's records of fixtures, in the page.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object<string, [string, string]>} pages name → [fixture, url]
 * @returns {Promise<Object<string, {cardLine: string, sections: Array<{label: string, text: string, html: string, open: *}>}>>}
 */
function records(page, pages) {
    const input = Object.fromEntries(Object.entries(pages).map(([k, [f, u]]) => [k, [FX(f), u]]));
    return page.evaluate((all) => Object.fromEntries(Object.entries(all).map(([k, [html, url]]) => {
        const d = window.__saTest.dpParse('brucebase.wikidot.com', html, url);
        return [k, { cardLine: d.cardLine || '', sections: d.sections.map(s => ({ label: s.label, text: s.text || '', html: s.html || '', open: s.open })) }];
    })), input);
}

const labels = r => r.sections.map(s => s.label);
const sec = (r, re) => r.sections.find(s => re.test(s.label));

let pageErrors;
test.beforeEach(({ page }) => {
    pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e.stack || e.message || e)));
});
test.afterEach(() => {
    expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
});

test.describe('Brucebase person and release windows (Phase 16, batch 2)', () => {
    test('a person: "About" first, the biography and its Source line; its first sentence for the card', async ({ page }) => {
        await loadBbEventPage(page, 'gig-1978-07-07');
        const r = await records(page, {
            patti: ['bb-relation-patti-scialfa-p1.html', PATTI],
            goman: ['bb-relation-anders-goman.html', 'https://brucebase.wikidot.com/relation:anders-goman'],
        });
        expect(labels(r.patti)[0]).toBe('About');
        const about = sec(r.patti, /^About$/);
        expect(about.open).toBeUndefined();
        expect(about.text).toMatch(/^Vivienne Patricia "Patti" Scialfa \(born July 29, 1953, Deal, NJ\)/);
        expect(about.html).toMatch(/href="https:\/\/brucebase\.wikidot\.com\/relation:the-e-street-band"/);
        expect(about.html).toMatch(/Source: <a[^>]*href="http:\/\/en\.wikipedia\.org\/wiki\/Patti_Scialfa"[^>]*>Wikipedia<\/a>/);
        expect(r.patti.cardLine).toBe('Vivienne Patricia "Patti" Scialfa (born July 29, 1953, Deal, NJ) is an American singer-songwriter and guitarist.');
        expect(labels(r.goman)[0]).toBe('About');
        expect(r.goman.cardLine).toBe('Anders Goman is a saxophone player who was a member of Billy Chinnock\'s band.');
        expect(labels(r.patti)).not.toContain('About this show');
    });

    test('a release: On The Tracks under each song, Gallery/News, Performed live, the text tabs, Lyrics, Media — folded, before Tags', async ({ page }) => {
        await loadBbEventPage(page, 'gig-1978-07-07');
        const { btr } = await records(page, { btr: ['bb-retail-born-to-run.html', 'https://brucebase.wikidot.com/retail:born-to-run'] });
        const at = labels(btr).indexOf('Related releases (7)');
        expect(labels(btr).slice(at + 1)).toEqual(['On The Tracks (63)', 'Gallery/News', 'Performed live (8)', 'Notes', 'History',
            'On The Tracks notes', 'Lyrics (8)', 'Media (1)', expect.stringMatching(/^Tags \(\d+\)$/)]);
        for (const s of btr.sections.slice(at + 1, -1)) expect(s.open, s.label).toBe(false);
        const ott = sec(btr, /^On The Tracks \(/).html;
        expect(ott).toMatch(/^<p><b>Backstreets<\/b><\/p><ul><li>V1 <span class="mb-dp-xsub">\(uncirculating\)<\/span><\/li><li>V2a · 6:44 — <a href="https:\/\/brucebase\.wikidot\.com\/bootleg:war-and-roses-esr"/);
        // One heading per song: Backstreets once.
        expect((ott.match(/<p><b>Backstreets<\/b><\/p>/g) || []).length).toBe(1);
        const news = sec(btr, /^Gallery\/News$/);
        expect(news.html).toMatch(/href="https:\/\/ew\.com\/music\/tom-hanks-jimmy-fallon-bruce-springsteen-born-to-run\/"/);
        expect(news.text).not.toMatch(/All credits|Sorry, no/);
        expect(sec(btr, /^Performed live/).html).toMatch(/<a href="https:\/\/brucebase\.wikidot\.com\/song:thunder-road"[^>]*>Thunder Road<\/a> <span class="mb-dp-xsub">1,582<\/span>/);
        expect(sec(btr, /^Lyrics/).html).toMatch(/href="https:\/\/brucebase\.wikidot\.com\/lyrics:backstreets"/);
        expect(sec(btr, /^History$/).text).toMatch(/^Born To Run was many more things/);
    });

    test('Recording \'Live\' Dates under each disc, each date linked to its show; a playlist\'s too', async ({ page }) => {
        await loadBbEventPage(page, 'gig-1978-07-07');
        const r = await records(page, {
            live: ['bb-retail-live-1975-85.html', 'https://brucebase.wikidot.com/retail:live-1975-85'],
            love: ['bb-playlist-songs-of-love.html', 'https://brucebase.wikidot.com/playlist:songs-of-love'],
        });
        const d = sec(r.live, /^Recording 'Live' Dates \(/);
        expect(d.label).toBe('Recording \'Live\' Dates (40)');
        expect(d.open).toBe(false);
        expect(d.html).toMatch(/^<p><b>Disc 1 - Club Shows<\/b><\/p><ul><li>D1\/1 Thunder Road — <a href="https:\/\/brucebase\.wikidot\.com\/gig:1975-10-18-roxy-theatre-west-hollywood-ca-early"[^>]*>1975-10-18<\/a> Roxy Theatre, West Hollywood, California<\/li>/);
        expect((d.html.match(/<li>/g) || []).length).toBe(40);
        expect(labels(r.live)).not.toContain('On The Tracks (0)');
        expect(labels(r.love)).toContain('Recording \'Live\' Dates (15)');
        expect(labels(r.love).some(l => /^On The Tracks/.test(l))).toBe(false);
    });

    test('on a hover: a person\'s card has the first sentence; Space opens the window with "About" first and open', async ({ page }) => {
        await loadBbEventPage(page, 'gig-1978-07-07');
        await page.route(PATTI, (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: FX('bb-relation-patti-scialfa-p1.html') }));
        await page.evaluate(() => {
            const a = document.createElement('a');
            a.className = 'p16-probe';
            a.setAttribute('href', '/relation:patti-scialfa');
            a.textContent = 'Patti Scialfa';
            const pc = document.getElementById('page-content');
            pc.insertBefore(a, pc.firstChild);
        });
        await page.mouse.move(0, 0);
        await page.keyboard.down('Control');
        await page.locator('a.p16-probe').hover();
        await page.keyboard.up('Control');
        await expect(page.locator('#mb-dp-peek .mb-dp-cardline')).toHaveText(/^Vivienne Patricia "Patti" Scialfa \(born July 29, 1953, Deal, NJ\)/);
        await page.keyboard.press('Space');
        const first = page.locator('#mb-dp-dialog details.mb-dp-sec').first();
        await expect(first).toHaveAttribute('data-mb-dp-sec', 'About');
        await expect(first).toHaveAttribute('open', '');
        await expect(first.locator('a', { hasText: 'Wikipedia' })).toBeVisible();
    });
});
