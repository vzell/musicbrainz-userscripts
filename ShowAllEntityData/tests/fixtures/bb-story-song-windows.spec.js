'use strict';

// org/brucebase.org, Phase 16 batch 4 — the sweep's last gaps (G6, G7), as
// vzell answered the mockup (https://claude.ai/artifact/CZ2t1cS2fw7W4RDSyTvoNo),
// all as recommended: a story page's own picture in the window's Images,
// captioned with its title, the Storyteller badge left out (answer 1); a
// song's intro keeps its links on the window's line under the title, the card
// keeps the words (2); the Lyrics section keeps the "Visit SpringsteenLyrics.com
// …" line after each version, linked (3); no preview for a link to the page
// you are on that only adds an #anchor (4).
//
// Pinned: the window's records of the fixtures; the window's and the card's
// line on a real hover; which links the preview takes.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadBbEventPage } = require('../support/bbFixture');

const FX = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');
const BB = 'https://brucebase.wikidot.com/';
const NATIONWIDE = 'bb-song-i-m-bad-i-m-nationwide.html';
const INTRO = 'Billy Gibbons, Dusty Hill, and Frank Beard, 1979. Originally recorded by ZZ Top.';

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
            subtitle: d.subtitle, subtitleHtml: d.subtitleHtml || '',
            images: d.images.map(i => ({ label: i.label, thumb: i.thumb, full: i.full, caption: i.caption })),
            sections: d.sections.map(s => ({ label: s.label, text: s.text || '', html: s.html || '' })),
        }];
    })), input);
}

let pageErrors;
test.beforeEach(({ page }) => {
    pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e.stack || e.message || e)));
});
test.afterEach(() => {
    expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
});

test.describe('Brucebase story and song windows (Phase 16, batch 4)', () => {
    test('a story page: its own picture, captioned with its title; not the badge, not the side bar\'s promo', async ({ page }) => {
        await loadBbEventPage(page, 'gig-1978-07-07');
        const dj = FX('bb-story-dj-2020-04-08-siriusxm-studio-new-york-city-ny.html');
        expect(dj, 'premise: the side bar\'s promo is an image block too').toContain('disco_livefromasburypark');
        const story = FX('bb-story-story-1978-07-07-roxy-theatre-west-hollywood-ca.html');
        expect(story, 'premise: the Storyteller badge').toContain('/storyteller.gif');
        const r = await records(page, {
            dj: ['bb-story-dj-2020-04-08-siriusxm-studio-new-york-city-ny.html', 'story:dj-2020-04-08-siriusxm-studio-new-york-city-ny'],
            story: ['bb-story-story-1978-07-07-roxy-theatre-west-hollywood-ca.html', 'story:story-1978-07-07-roxy-theatre-west-hollywood-ca'],
        });
        const dir = 'https://brucebase.wdfiles.com/';
        expect(r.dj.images).toEqual([{
            label: 'Picture', caption: 'Part 1',
            thumb: `${dir}local--resized-images/news:2020-04-08-siriusxm-studio-new-york-city-ny/20200408_Banner_05_EStreetRadio.jpg/small.jpg`,
            full: `${dir}local--files/news:2020-04-08-siriusxm-studio-new-york-city-ny/20200408_Banner_05_EStreetRadio.jpg`,
        }]);
        expect(r.story.images).toEqual([]);
    });

    test('a song\'s intro: its words for the card, its links for the window; none when it has no link', async ({ page }) => {
        await loadBbEventPage(page, 'gig-1978-07-07');
        const r = await records(page, {
            nw: [NATIONWIDE, 'song:i-m-bad-i-m-nationwide'],
            promise: ['bb-song-the-promise.html', 'song:the-promise'],
        });
        expect(r.nw.subtitle).toBe(INTRO);
        const link = (slug, name) => `<a href="${BB}relation:${slug}" target="_blank" rel="noopener">${name}</a>`;
        expect(r.nw.subtitleHtml).toBe(`${link('billy-gibbons', 'Billy Gibbons')}, ${link('dusty-hill', 'Dusty Hill')}, and ${link('frank-beard', 'Frank Beard')}, ` +
            `1979. Originally recorded by ${link('zz-top', 'ZZ Top')}.`);
        expect(r.promise.subtitle.length, 'premise: The Promise has an intro').toBeGreaterThan(20);
        expect(r.promise.subtitleHtml).toBe('');
    });

    test('a song\'s Lyrics: the springsteenlyrics.com line after each version, linked; the text as before', async ({ page }) => {
        await loadBbEventPage(page, 'gig-1978-07-07');
        const { promise } = await records(page, { promise: ['bb-song-the-promise.html', 'song:the-promise'] });
        const lyr = promise.sections.find(s => s.label === 'Lyrics');
        const hrefs = (lyr.html.match(/<a href="https:\/\/www\.springsteenlyrics\.com\/lyrics\.php\?song=[^"]+"/g) || []).map(m => m.slice(9, -1));
        expect(hrefs).toEqual(['https://www.springsteenlyrics.com/lyrics.php?song=thepromise_official1999', 'https://www.springsteenlyrics.com/lyrics.php?song=thepromise']);
        // The same lines as the text, the links aside.
        expect(lyr.html.replace(/<a [^>]*>([^<]*)<\/a>/g, '$1').replace(/&#39;/g, '\'').replace(/&quot;/g, '"').replace(/&amp;/g, '&')).toBe(lyr.text);
    });

    test('on a hover: the card shows the intro\'s words, the window its links', async ({ page }) => {
        await loadBbEventPage(page, 'gig-1978-07-07', { settingsOverride: { sa_bb_detail_preview: true } });
        await page.route(`${BB}song:i-m-bad-i-m-nationwide`, (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: FX(NATIONWIDE) }));
        await page.evaluate(() => {
            const a = document.createElement('a');
            a.className = 'p16-song';
            a.setAttribute('href', '/song:i-m-bad-i-m-nationwide');
            a.textContent = 'I\'m Bad, I\'m Nationwide';
            const pc = document.getElementById('page-content');
            pc.insertBefore(a, pc.firstChild);
        });
        await page.mouse.move(0, 0);
        await page.keyboard.down('Control');
        await page.locator('a.p16-song').hover();
        await page.keyboard.up('Control');
        const peek = page.locator('#mb-dp-peek');
        await expect(peek.locator('.mb-tt-comment').first()).toHaveText(INTRO);
        await expect(peek.locator('.mb-tt-comment a')).toHaveCount(0);
        await page.keyboard.press('Space');
        const line = page.locator('#mb-dp-dialog .mb-dp-xsub').first();
        await expect(line).toHaveText(INTRO);
        await expect(line.locator('a')).toHaveText(['Billy Gibbons', 'Dusty Hill', 'Frank Beard', 'ZZ Top']);
    });

    test('no preview for a link to this page that only adds an #anchor; the page itself and another page\'s anchor still preview', async ({ page }) => {
        const { url } = await loadBbEventPage(page, 'gig-1978-07-07');
        const got = await page.evaluate(hrefs => hrefs.map(h => window.__saTest.dpPreviewsHref(h)), [
            `${url}#setlist`, url, `${BB}gig:2005-06-20-palais-omnisports-paris-france#setlist`,
        ]);
        expect(got).toEqual([false, true, true]);
    });
});
