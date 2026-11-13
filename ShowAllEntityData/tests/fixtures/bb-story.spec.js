'use strict';

// Brucebase story pages (`bb-story`, org/brucebase.org Phase 12): a show's
// Storyteller words, an interview, a podcast, a speech, a DJ set — their
// words as tables, a sub-table per part with the columns the part uses
// (Moment, Song, Speaker, Words), the kind, date, event page and "Compiled
// by" above. Fixtures: scripts/build-bb-story-fixtures.py (one page per
// shape of scripts/probe-bb-story-pages.py and check-bb-story-reader.js);
// the event lookup's answers: scripts/capture-bb-story-answers.py.
// docs/claude/brucebase.md, "Story pages".

const fs = require('fs');
const { test, expect } = require('../support/test');
const { loadBbStoryPage, bbStoryFixture, loadBbHistoryPage } = require('../support/bbFixture');
const { waitForRenderComplete } = require('../support/browser');

const ROXY = 'story-1978-07-07-roxy-theatre-west-hollywood-ca';
const UNION = 'story-1971-05-15-union-nj';
const INTERVIEW = 'interview-1978-08-25a-veterans-memorial-coliseum-new-h';
const PODCAST = 'podcast-2021-02-22-stone-hill-farm-colts-neck-nj-ep-0';
const SPEECH = 'speech-2023-10-29-performing-arts-center-newark-nj';
const DJ = 'dj-2020-04-08-siriusxm-studio-new-york-city-ny';
const BUTTON = 'Show the story';

/**
 * The fixture read with a plain DOM (not the script): its paragraphs that
 * open with a bold heading, the headings' texts, and the paragraphs that
 * open with a coloured "Name:".
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 * @returns {Promise<{heads: string[], spans: string[], paras: number}>}
 */
function fixtureRead(page, name) {
    const html = fs.readFileSync(bbStoryFixture(name).file, 'utf8');
    return page.evaluate((h) => {
        const d = new DOMParser().parseFromString(h, 'text/html');
        const ps = Array.from(d.querySelectorAll('#page-content p')).filter(p => p.textContent.trim() && !/^Compiled by/i.test(p.textContent.trim()));
        const lead = (p, tag) => p.firstElementChild && p.firstElementChild.tagName === tag && p.textContent.trim().startsWith(p.firstElementChild.textContent.trim());
        return {
            heads: ps.filter(p => lead(p, 'STRONG')).map(p => p.firstElementChild.textContent.replace(/\s+/g, ' ').trim()),
            spans: ps.filter(p => lead(p, 'SPAN') && /^\s*:/.test(p.textContent.trim().slice(p.firstElementChild.textContent.trim().length)))
                .map(p => p.firstElementChild.textContent.trim()),
            paras: ps.length,
        };
    }, html);
}

/**
 * The rendered sub-tables by name: headers and rows as cell texts.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object<string, {headers: string[], rows: string[][]}>>}
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
            };
        });
        return out;
    });
}

/**
 * The head's Story card as {fact: text}.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object<string, string>>}
 */
async function storyCard(page) {
    const card = page.locator('.mb-fd-details .mb-sb-card', { has: page.locator('.mb-sb-card-head', { hasText: /^Story/ }) });
    const ns = await card.locator('dt, dd').evaluateAll(xs => xs.map(n => n.textContent.trim()));
    const kv = {};
    for (let i = 0; i < ns.length; i += 2) kv[ns[i]] = ns[i + 1];
    return kv;
}

/**
 * Presses the button and waits for the render.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function show(page) {
    await page.click(`button[data-label="${BUTTON}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

const lookups = (posts) => posts.filter(p => p.moduleName === 'list/ListPagesModule').map(p => p.name);

test.describe('Brucebase story pages (Phase 12)', () => {
    test('a show\'s Storyteller words: Moment, Song, Words, one row per bold heading; the event page found by name', async ({ page }) => {
        const { posts } = await loadBbStoryPage(page, ROXY);
        const fx = await fixtureRead(page, ROXY);
        await show(page);
        const t = await tables(page);
        expect(Object.keys(t)).toEqual(['Storyteller']);
        expect(t.Storyteller.headers).toEqual(['Moment', 'Song', 'Words']);
        expect(t.Storyteller.rows.length).toBe(fx.heads.length);
        expect(t.Storyteller.rows[0][0]).toBe('Intro to');
        expect(t.Storyteller.rows[0][1]).toBe('Rave On');
        expect(t.Storyteller.rows[0][2]).toMatch(/^´´Hello/);
        expect(lookups(posts)).toEqual([`${ROXY.replace(/^story-/, '')}*`]);
        const kv = await storyCard(page);
        expect(kv).toEqual(expect.objectContaining({ Kind: 'Storyteller', Date: '1978-07-07', Rows: String(fx.heads.length) }));
        expect(kv.Event).toContain('1978-07-07');
        expect(kv['Compiled by']).toBeTruthy();
        await expect(page.locator('.mb-fd-details a[href="https://brucebase.wikidot.com/gig:1978-07-07-roxy-theatre-west-hollywood-ca"]')).toHaveCount(1);
        await expect(page.locator('h2.mb-bb-native-h2')).toHaveText(/Brucebase page/);
    });

    test('an older story named by date and town: no page by name, so that day\'s events', async ({ page }) => {
        const { posts } = await loadBbStoryPage(page, UNION);
        const fx = await fixtureRead(page, UNION);
        await show(page);
        expect(lookups(posts)).toEqual(['1971-05-15-union-nj*', '1971-05-15*']);
        // Its one paragraph with no heading carries on the row above: a row per heading.
        const rows = Object.values(await tables(page)).reduce((n, x) => n + x.rows.length, 0);
        expect(rows).toBe(fx.heads.length);
        const kv = await storyCard(page);
        expect(kv['Events that day']).toContain('·');
        await expect(page.locator('.mb-fd-details a[href*="/gig:1971-05-15-"]')).toHaveCount(2);
    });

    test('an interview: Speaker and Words, a turn per bold name', async ({ page }) => {
        await loadBbStoryPage(page, INTERVIEW);
        const fx = await fixtureRead(page, INTERVIEW);
        await show(page);
        const all = await tables(page);
        // The part is named by the page's own h2.
        expect(Object.keys(all)).toEqual(['Interview with Bob Harris following the show for the BBC\'s Old Grey Whistle Test']);
        const t = Object.values(all)[0];
        expect(t.headers).toEqual(['Speaker', 'Words']);
        expect(t.rows.map(r => r[0])).toEqual(fx.heads);
        expect(new Set(t.rows.map(r => r[0]))).toEqual(new Set(['Bob Harris', 'Bruce Springsteen']));
    });

    test('a podcast: the coloured "Name:" before each turn is the speaker', async ({ page }) => {
        await loadBbStoryPage(page, PODCAST);
        const fx = await fixtureRead(page, PODCAST);
        expect(fx.spans.length, 'the fixture has "Name:" turns').toBeGreaterThan(3);
        await show(page);
        const all = await tables(page);
        expect(Object.keys(all)).toEqual(['Trailer']);
        const t = all.Trailer;
        expect(t.headers).toEqual(['Speaker', 'Words']);
        expect(t.rows.map(r => r[0])).toEqual(fx.spans);
        expect(t.rows.every(r => r[1] && !r[1].startsWith(':'))).toBe(true);
    });

    test('a speech: each caption heading starts a part of its own', async ({ page }) => {
        await loadBbStoryPage(page, SPEECH);
        await show(page);
        const t = await tables(page);
        expect(Object.keys(t).slice(0, 1)).toEqual(['Bruce Springsteen\'s Induction Speech For Patti Scialfa']);
        // The acceptance speeches are captions too ("Patti Scialfa's Acceptance Speech"): their own parts, no speaker.
        expect(Object.keys(t)).toEqual(expect.arrayContaining(['Patti Scialfa\'s Acceptance Speech', 'David Chase\'s Acceptance Speech']));
        Object.values(t).forEach(x => expect(x.headers).toEqual(['Words']));
    });

    test('a DJ set: the part named by its h2, a row per paragraph', async ({ page }) => {
        await loadBbStoryPage(page, DJ);
        const fx = await fixtureRead(page, DJ);
        await show(page);
        const t = await tables(page);
        expect(Object.keys(t)).toEqual(['Part 1']);
        expect(t['Part 1'].headers).toContain('Words');
        expect(t['Part 1'].rows.length).toBeGreaterThan(5);
        expect(t['Part 1'].rows.length).toBeLessThanOrEqual(fx.paras);
    });

    test('a story with no date in its name asks nothing', async ({ page }) => {
        const { posts } = await loadBbStoryPage(page, INTERVIEW, { url: 'https://brucebase.wikidot.com/story:about-bob-harris' });
        await show(page);
        expect(lookups(posts)).toEqual([]);
        expect((await storyCard(page)).Kind).toBe('About');
    });

    test('with the detail pages off, no button', async ({ page }) => {
        await loadBbStoryPage(page, ROXY, { settingsOverride: { sa_bb_detail_pages: false } });
        await expect(page.locator(`button[data-label="${BUTTON}"]`)).toHaveCount(0);
    });

    test('a story link\'s window names its kind, date, moments and compiler', async ({ page }) => {
        await loadBbHistoryPage(page, { settingsOverride: { sa_bb_history: false } });
        await page.evaluate((href) => {
            const a = Object.assign(document.createElement('a'), { href, textContent: 'The Palladium story' });
            a.id = 'mb-test-story';
            document.querySelector('#page-content .yui-content > div').prepend(a);
        }, '/story:story-1978-09-15-palladium-new-york-city-ny');
        await page.mouse.move(0, 0);
        await page.keyboard.down('Control');
        await page.locator('#mb-test-story').hover();
        await page.keyboard.up('Control');
        await expect(page.locator('#mb-dp-peek')).toBeVisible();
        await page.keyboard.press('Space');
        const dialog = page.locator('#mb-dp-dialog');
        const kv = await dialog.locator('dl.mb-dp-kv').first().locator('dt, dd').evaluateAll(xs => xs.map(n => n.textContent.trim()));
        const m = {};
        for (let i = 0; i < kv.length; i += 2) m[kv[i]] = kv[i + 1];
        expect(m).toEqual(expect.objectContaining({ Kind: 'Storyteller', Date: '1978-09-15', Moments: '5' }));
        expect(m['Compiled by']).toBeTruthy();
    });
});
