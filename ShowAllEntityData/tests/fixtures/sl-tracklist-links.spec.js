'use strict';

// springsteenlyrics.com tracklists: each song linked to its page, a bootleg's
// songs to the version of that show, and a MusicBrainz work glyph before each
// (org/springsteenlyrics.org "URLify the tracklist to song URLs (SL and MB)",
// 2026-11-05; mockups org/sl-tracklist-links-mockups.html, vzell's answers
// 1-8). The slug rule is pinned on the WHOLE committed index
// (docs/sl-song-base-slugs.json); the rest on item pages: 10163 (vzell's
// example), 6739 (a bootleg of 05 Feb 2014), 9685 (various artists), 8595
// (logged in, its MusicBrainz release), the song page's editions and an
// item's preview window. springsteenlyrics.com's letter pages and
// MusicBrainz are stubs that log what they are asked.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage, FIXTURE_SETTINGS_OVERRIDE } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { loadSlListPage, SL_KINDS } = require('../support/slFixture');
const { routeDetailPages } = require('../support/detailFixture');

const SL = 'https://www.springsteenlyrics.com/';
const SONG = `${SL}lyrics.php?song=`;
const FX = name => path.join(__dirname, name);
const ITEMS = {
    'collection-10163': 'collection.php?item=10163',
    'collection-9685': 'collection.php?item=9685&category=vaalbum&f_format=12i',
    'collection-8595': 'collection.php?item=8595&category=album&f_format=12i',
    'collection-7457': 'collection.php?item=7457&category=audioboot&f_country=Europe',
    'bootlegs-6739': 'bootlegs.php?item=6739&category=aud_live2014',
    'brucelegs-148': 'brucelegs.php?item=148&f_format=vinyl',
    'song-backstreets-logged-in': 'lyrics.php?song=backstreets',
};
const BASE_SLUGS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'sl-song-base-slugs.json'), 'utf8')).songs;

// Stand-in work MBIDs.
const W = {
    shuffle: '00000000-0000-4000-8000-000000000001',
    rosalita: '00000000-0000-4000-8000-000000000002',
    billy: '00000000-0000-4000-8000-000000000003',
    kitty1: '00000000-0000-4000-8000-000000000004',
    kitty2: '00000000-0000-4000-8000-000000000005',
    thunder: '00000000-0000-4000-8000-000000000006',
    blinded: '00000000-0000-4000-8000-000000000007',
    blindedRel: '00000000-0000-4000-8000-000000000008',
    thatswhat: '00000000-0000-4000-8000-000000000009',
};
// Bruce Springsteen's works as the stub's one browse page answers them: an
// annotation with the OLD address form, one with the current form, one
// without (a title match), two works of one title (several).
const WORKS = [
    { id: W.shuffle, title: 'The E Street Shuffle', annotation: 'Lyrics: [http://www.springsteenlyrics.com/lyrics/t/theestreetshuffle.php|SL]' },
    { id: W.rosalita, title: 'Rosalita (Come Out Tonight)', annotation: 'See https://www.springsteenlyrics.com/lyrics.php?song=rosalita' },
    // "Circus Song" is one of its MusicBrainz aliases: a title the site has no page for.
    { id: W.billy, title: 'Wild Billy’s Circus Story', annotation: null, aliases: [{ name: 'Circus Song' }] },
    { id: W.kitty1, title: 'Kitty’s Back', annotation: null, disambiguation: 'one' },
    { id: W.kitty2, title: 'Kitty’s Back', annotation: null, disambiguation: 'two' },
    { id: W.thunder, title: 'Thunder Road', annotation: '[https://www.springsteenlyrics.com/lyrics.php?song=thunderroad]' },
    { id: W.blinded, title: 'Blinded by the Light', annotation: '[https://www.springsteenlyrics.com/lyrics.php?song=blindedbythelight]' },
    { id: W.thatswhat, title: 'That’s What You Get', annotation: '[http://www.springsteenlyrics.com/lyrics/t/thatswhatyouget.php]' },
].map(w => ({ disambiguation: '', aliases: [], ...w }));

/**
 * Installs the MusicBrainz stub (`__gmXhrResponder`, the GM requests a
 * foreign host makes) before the page loads: the work browse, one work's
 * card lookup, and item 8595's release.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{failWorks?: number}} [opts] failWorks: answer the first N work browses 503.
 * @returns {Promise<void>}
 */
async function stubMusicBrainz(page, { failWorks = 0 } = {}) {
    await page.addInitScript(([works, w, failN]) => {
        const json = (status, body) => ({ status, responseHeaders: 'Content-Type: application/json', responseText: JSON.stringify(body) });
        let worksAsked = 0;
        window.__gmXhrResponder = (opts) => {
            const u = new URL(opts.url);
            if (u.hostname !== 'musicbrainz.org') return undefined;
            if (u.pathname === '/ws/2/work') {
                if (worksAsked++ < failN) return { status: 503, responseHeaders: 'Content-Type: text/html', responseText: 'busy' };
                return json(200, { 'work-count': works.length, 'work-offset': 0, works });
            }
            const one = u.pathname.match(/^\/ws\/2\/work\/([0-9a-f-]+)$/);
            if (one) return json(200, works.find(x => x.id === one[1]) || { id: one[1], title: 'Some work' });
            if (/^\/ws\/2\/release\/6069bf25/.test(u.pathname)) {
                const work = (id, title) => ({ 'target-type': 'work', type: 'performance', work: { id, title, disambiguation: '' } });
                return json(200, { id: '6069bf25-f108-4670-8e62-d42eb55dfe32', media: [{ tracks: [
                    { number: 'A1', title: 'Blinded by the Light', recording: { title: 'Blinded by the Light', relations: [work(w.blindedRel, 'Blinded by the Light')] } },
                    { number: 'A2', title: 'Growin’ Up', recording: { title: 'Growin’ Up', relations: [] } },
                ] }] });
            }
            return undefined;
        };
    }, [WORKS, W, failWorks]);
}

/**
 * The stub's springsteenlyrics.com lyrics index: the landing page names
 * three letters, each letter page a few song lines.
 * @type {Object<string, string[]>}
 */
const LETTERS = {
    t: ['theestreetshuffle', 'theestreetshuffle_2014-02-05', 'theestreetshuffle_1975-10-18-early', 'thunderroad'],
    k: ['kittysback', 'kittysback_2014-02-05'],
    f: ['foryou', 'foryou_2014-02-05-wgoe', 'frankiefellinlove'],
};

/**
 * Routes the lyrics index (landing page and letter pages) to stubs, logging
 * every request. Call AFTER the catch-all of `open()`.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string[]>} The URLs asked, in order.
 */
async function routeLyricsIndex(page) {
    const asked = [];
    const shell = body => `<!DOCTYPE html><html><body><div class="project-detail">${body}</div></body></html>`;
    await page.route(/springsteenlyrics\.com\/lyrics\.php(?:\?cmd=list&letter=\w)?$/, (route) => {
        const u = new URL(route.request().url());
        asked.push(u.href);
        const letter = u.searchParams.get('letter');
        const body = letter
            ? `<h3 class="heading">Starting with "${letter.toUpperCase()}"</h3>` + (LETTERS[letter] || []).map(s =>
                `<span class="monospaced"><i class="bi bi-file-earmark-text"></i> <a href="lyrics.php?song=${s}">${s.toUpperCase()}</a></span><br>`).join('')
            : '<div class="element-buttons">' + Object.keys(LETTERS).map(l => `<a href="lyrics.php?cmd=list&letter=${l}">${l}</a>`).join(' ') + '</div>';
        return route.fulfill({ status: 200, contentType: 'text/html; charset=UTF-8', body: shell(body) });
    });
    return asked;
}

/**
 * Loads an item (or song) page fixture under its own URL; every other
 * request is blocked unless a later route takes it.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} key - A key of ITEMS.
 * @param {{settings?: Object, mb?: boolean, index?: boolean, root?: string, failWorks?: number}} [opts]
 *   `root`: the site's address to load it under (default with "www.").
 * @returns {Promise<{asked: string[], errors: string[], index: ?string[]}>}
 */
async function open(page, key, { settings = {}, mb = false, index = false, root = SL, failWorks = 0 } = {}) {
    const asked = [];
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    page.on('request', (r) => { if (/springsteenlyrics\.com/.test(r.url()) && !/\.(?:jpg|png|gif)$/.test(r.url())) asked.push(r.url()); });
    await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
    const idx = index ? await routeLyricsIndex(page) : null;
    if (mb) await stubMusicBrainz(page, { failWorks });
    await loadUserscriptPage(page, {
        url: root + ITEMS[key], fixtureFile: FX(`detail-sl-${key}.html`), testMode: true,
        settingsOverride: { ...FIXTURE_SETTINGS_OVERRIDE, sa_enable_springsteenlyrics: true, sa_render_threshold: 100000,
            sa_foreign_mb_titles: false, sa_foreign_typography: false,
            sa_sl_mb_works: mb, sa_sl_song_versions: index, ...settings },
    });
    return { asked, errors, index: idx };
}

/**
 * Presses a button and waits for the render.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} [label]
 * @returns {Promise<void>}
 */
async function show(page, label = 'Show the tracklist') {
    await page.click(`button[data-label="${label}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/**
 * Every rendered tracklist song: its title cell's text, the song's base
 * slug, its link, whether it is this show's version, and its glyphs.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<{text: string, songs: Array<object>}>>}
 */
function songs(page) {
    return page.evaluate(() => Array.from(document.querySelectorAll('.project-detail table.tbl tbody tr')).map((tr) => {
        const td = tr.cells[1];
        return {
            text: td.textContent.replace(/\s+/g, ' ').trim(),
            songs: Array.from(td.querySelectorAll('span.mb-sl-song')).map(s => ({
                slug: s.dataset.mbSlSong,
                href: (s.querySelector('a.mb-sl-song-link') || {}).href || '',
                show: (s.querySelector('a.mb-sl-show-link') || {}).href || '',
                showText: (s.querySelector('a.mb-sl-show-link') || {}).textContent || '',
                thisShow: s.classList.contains('mb-sl-this-show'),
                works: Array.from(s.querySelectorAll('.mb-sl-work-slot a.mb-sl-work')).map(a => ({
                    how: (a.className.match(/mb-sl-work-(\w+)/) || [])[1], id: a.href.split('/').pop(), n: a.dataset.n || '',
                })),
            })),
        };
    }));
}

/**
 * MusicBrainz requests the page made through GM, as paths with queries.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string[]>}
 */
function mbAsked(page) {
    return page.evaluate(() => (window.__gmXhrLog || []).map(r => new URL(r.url)).filter(u => u.hostname === 'musicbrainz.org')
        .map(u => u.pathname + u.search));
}

test.describe('springsteenlyrics.com tracklists: song links (sl-*-item)', () => {
    test('the slug rule: every title of the committed index gets one of its own slugs; vzell\'s examples; medleys', async ({ page }) => {
        await open(page, 'collection-10163');
        const titles = new Map();
        BASE_SLUGS.forEach(r => { if (!titles.has(r.title)) titles.set(r.title, []); titles.get(r.title).push(r.slug); });
        const got = await page.evaluate(ts => ts.map(t => window.__saTest.slSongSlug(t).slug), Array.from(titles.keys()));
        const wrong = Array.from(titles.keys()).filter((t, i) => !titles.get(t).includes(got[i]));
        expect(wrong).toEqual([]);
        const one = t => page.evaluate(x => window.__saTest.slSongSlug(x), t);
        // vzell's four examples; the leading "(…)"; an exception list entry;
        // two titles alike but for the parentheses; no page at all.
        expect((await one('THE E STREET SHUFFLE')).slug).toBe('theestreetshuffle');
        expect((await one('KITTY\'S BACK')).slug).toBe('kittysback');
        expect((await one('4TH OF JULY, ASBURY PARK (SANDY)')).slug).toBe('4thofjulyasburypark');
        expect((await one('ROSALITA (COME OUT TONIGHT)')).slug).toBe('rosalita');
        expect((await one('(GET YOUR KICKS ON) ROUTE 66')).slug).toBe('route66');
        expect((await one('FOURTY MILES OF BAD ROAD')).slug).toBe('fortymilesofbadroad');
        expect((await one('SOMEDAY (WE\'LL BE TOGETHER)')).slug).toBe('someday');
        expect((await one('SOMEDAY WE\'LL BE TOGETHER')).slug).toBe('somedaywellbetogether');
        expect((await one('SLEEPY JOE\'S CAFÉ')).slug).toBe('sleepyjoescafe');
        expect((await one('SEE MY FRIENDS')).slug).toBe('');
        expect((await one('Intro')).slug).toBe('');
        // A medley: each song of it; a title with " / " that is ONE song stays whole.
        expect((await one('THUNDER ROAD / BADLANDS')).parts).toEqual([
            { text: 'THUNDER ROAD', slug: 'thunderroad' }, { sep: ' / ' }, { text: 'BADLANDS', slug: 'badlands' }]);
        expect((await one('ROULETTE / outro')).parts).toEqual([
            { text: 'ROULETTE', slug: 'roulette' }, { sep: ' / ' }, { text: 'outro', slug: '' }]);
        expect((await one('BEDROCK RAP / MEET THE FLINTSTONES')).parts).toHaveLength(1);
        // " - " splits only when every part is a song.
        expect((await one('THUNDER ROAD - BADLANDS')).parts).toHaveLength(3);
        expect((await one('Dear Mr. Fantasy - Hey Jude')).parts).toEqual([{ text: 'Dear Mr. Fantasy - Hey Jude', slug: '' }]);
    });

    test('item 10163: every title links its page, the text, filter and sort unchanged; no request', async ({ page }) => {
        const { asked, errors } = await open(page, 'collection-10163');
        await show(page);
        const rows = await songs(page);
        expect(rows.map(r => r.text)).toEqual(['THE E STREET SHUFFLE', '4TH OF JULY, ASBURY PARK (SANDY)', 'KITTY\'S BACK',
            'WILD BILLY\'S CIRCUS STORY', 'INCIDENT ON 57TH STREET', 'ROSALITA (COME OUT TONIGHT)', 'NEW YORK CITY SERENADE']);
        expect(rows.map(r => r.songs[0].href)).toEqual(['theestreetshuffle', '4thofjulyasburypark', 'kittysback',
            'wildbillyscircusstory', 'incidenton57thstreet', 'rosalita', 'newyorkcityserenade'].map(s => SONG + s));
        // The filter matches the title's text and keeps the link (a re-render
        // clones the source rows).
        await page.fill('#mb-global-filter-input', 'rosalita');
        await expect.poll(async () => (await songs(page)).map(r => r.text)).toEqual(['ROSALITA (COME OUT TONIGHT)']);
        expect((await songs(page))[0].songs[0].href).toBe(`${SONG}rosalita`);
        await page.fill('#mb-global-filter-input', '');
        await expect.poll(async () => (await songs(page)).length).toBe(7);
        // Nothing asked of the site beyond the page itself; no glyph slot filled.
        expect(asked.filter(u => !u.startsWith(SL + 'collection.php?item=10163'))).toEqual([]);
        expect((await songs(page)).every(r => r.songs[0].works.length === 0)).toBe(true);
        expect(errors).toEqual([]);
    });

    test('off: sa_sl_song_links and sa_sl_mb_works off leave the titles plain text', async ({ page }) => {
        await open(page, 'collection-10163', { settings: { sa_sl_song_links: false } });
        await show(page);
        await expect(page.locator('.project-detail table.tbl span.mb-sl-song')).toHaveCount(0);
        await expect(page.locator('.project-detail table.tbl tbody a')).toHaveCount(0);
    });

    test('various artists (9685): another artist\'s song stays plain text', async ({ page }) => {
        await open(page, 'collection-9685');
        await show(page);
        const rows = await page.evaluate(() => Array.from(document.querySelectorAll('.project-detail table.tbl tbody tr')).map(tr => ({
            artist: tr.cells[2].textContent.trim(), links: tr.cells[1].querySelectorAll('a.mb-sl-song-link').length,
        })));
        expect(rows.length).toBeGreaterThan(10);
        // A9 "Chase: Get It On": the site HAS a GET IT ON page (Bruce's),
        // so only the artist keeps it plain.
        expect(rows.filter(r => r.links && r.artist && !/springsteen/i.test(r.artist))).toEqual([]);
        expect(rows.filter(r => r.links).map(r => r.artist)).toEqual(['Bruce Springsteen']);
        await expect(page.locator('.project-detail table.tbl tbody a.mb-sl-song-link')).toHaveAttribute('href', `${SONG}borntorun`);
    });
});

test.describe('springsteenlyrics.com tracklists: this show\'s version (bootleg 6739, 05 Feb 2014)', () => {
    test('the runtime index is read once; the title links the song, a "this show" link of its own the show\'s version', async ({ page }) => {
        const { index, errors } = await open(page, 'bootlegs-6739', { index: true });
        await show(page);
        const shuffle = () => songs(page).then(rs => rs.find(r => r.text === 'THE E STREET SHUFFLE').songs[0]);
        // The title previews the official song; the mark, a link of its own
        // with no text, the show's version (vzell, "Adjustments" 3a).
        await expect.poll(shuffle, { timeout: 15000 }).toMatchObject({ href: `${SONG}theestreetshuffle`,
            show: `${SONG}theestreetshuffle_2014-02-05`, showText: '', thisShow: true });
        const rs = await songs(page);
        const by = t => rs.find(r => r.text === t).songs[0];
        expect(by('KITTY\'S BACK')).toMatchObject({ href: `${SONG}kittysback`, show: `${SONG}kittysback_2014-02-05`, thisShow: true });
        // The one slug that goes on from <slug>_<date> ("-wgoe").
        expect(by('FOR YOU')).toMatchObject({ href: `${SONG}foryou`, show: `${SONG}foryou_2014-02-05-wgoe`, thisShow: true });
        expect(by('FRANKIE FELL IN LOVE')).toMatchObject({ href: `${SONG}frankiefellinlove`, show: '', thisShow: false });
        // "Intro": no page, no link.
        expect(rs.find(r => r.text === 'Intro').songs).toEqual([]);
        // The landing page, then its three letters, one request each.
        expect(index.map(u => u.replace(SL, ''))).toEqual(['lyrics.php', 'lyrics.php?cmd=list&letter=t',
            'lyrics.php?cmd=list&letter=k', 'lyrics.php?cmd=list&letter=f']);
        // A filter re-render clones the SOURCE rows: they carry the version too.
        await page.fill('#mb-global-filter-input', 'shuffle');
        await expect.poll(async () => (await songs(page)).map(r => r.songs[0] && r.songs[0].show)).toEqual([`${SONG}theestreetshuffle_2014-02-05`]);
        // The mark is CSS: the cell's text is the title alone.
        expect((await songs(page))[0].text).toBe('THE E STREET SHUFFLE');
        expect(errors).toEqual([]);

        // Another page of the same browser: the saved index, no request.
        const page2 = await page.context().newPage();
        const second = await open(page2, 'bootlegs-6739', { index: true });
        await show(page2);
        await expect.poll(async () => (await songs(page2)).find(r => r.text === 'KITTY\'S BACK').songs[0].show)
            .toBe(`${SONG}kittysback_2014-02-05`);
        expect(second.index).toEqual([]);
        await page2.close();
    });

    test('without "www.": the index is read from the page\'s own origin, and the links stay on it', async ({ page }) => {
        const root = 'https://springsteenlyrics.com/';
        const { index } = await open(page, 'bootlegs-6739', { index: true, root });
        await show(page);
        const kitty = () => songs(page).then(rs => rs.find(r => r.text === 'KITTY\'S BACK').songs[0]);
        await expect.poll(kitty, { timeout: 15000 }).toMatchObject({ href: `${root}lyrics.php?song=kittysback`,
            show: `${root}lyrics.php?song=kittysback_2014-02-05` });
        expect(index.every(u => u.startsWith(root))).toBe(true);
        expect(index).toHaveLength(4);
    });

    test('the lyrics index\'s letter pages keep the runtime index current (no request)', async ({ page }) => {
        await loadSlListPage(page, { kind: 'lyrics-b', settingsOverride: { sa_sl_song_versions: true } });
        await page.click('button[data-label="Show the lyrics of this letter"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        // The write is not awaited by the converter: poll. A store that does
        // not exist yet (nothing ever written) reads as "no record".
        const rec = () => page.evaluate(() => new Promise((resolve) => {
            const req = indexedDB.open('vz-saed-sl-songs', 1);
            req.onupgradeneeded = () => req.result.createObjectStore('data', { keyPath: 'key' });
            req.onsuccess = () => {
                const db = req.result;
                try {
                    const get = db.transaction('data', 'readonly').objectStore('data').get('letter:b');
                    get.onsuccess = () => {
                        const r = get.result;
                        db.close();
                        resolve(r ? { many: r.slugs.length > 300, has: r.slugs.includes('backstreets_1975-11-18') } : null);
                    };
                    get.onerror = () => { db.close(); resolve(null); };
                } catch (_) {
                    db.close();
                    resolve(null);
                }
            };
            req.onerror = () => resolve(null);
        }));
        await expect.poll(rec, { timeout: 5000 }).toEqual({ many: true, has: true });
    });
});

test.describe('springsteenlyrics.com tracklists: MusicBrainz work glyphs', () => {
    test('item 10163: exact by annotation (both address forms), dashed by title, several with a count, none; one request, then saved', async ({ page }) => {
        const { errors } = await open(page, 'collection-10163', { mb: true });
        await show(page);
        const works = () => songs(page).then(rs => rs.map(r => r.songs[0].works));
        await expect.poll(works).toEqual([
            [{ how: 'exact', id: W.shuffle, n: '' }],
            [],
            [{ how: 'ambig', id: W.kitty1, n: '2' }, { how: 'ambig', id: W.kitty2, n: '' }],
            [{ how: 'title', id: W.billy, n: '' }],
            [],
            [{ how: 'exact', id: W.rosalita, n: '' }],
            [],
        ]);
        const asked = await mbAsked(page);
        expect(asked).toHaveLength(1);
        expect(asked[0]).toMatch(/^\/ws\/2\/work\?artist=70248960-cb53-4ea4-943a-edb18f7d336f&inc=aliases\+annotation&limit=100&offset=0&fmt=json$/);
        // The glyph adds no text; a filter re-render keeps it (source rows).
        expect((await songs(page))[0].text).toBe('THE E STREET SHUFFLE');
        await page.fill('#mb-global-filter-input', 'rosalita');
        await expect.poll(works).toEqual([[{ how: 'exact', id: W.rosalita, n: '' }]]);
        expect(errors).toEqual([]);

        // Saved: another page of the same browser asks MusicBrainz nothing.
        const page2 = await page.context().newPage();
        await open(page2, 'collection-10163', { mb: true });
        await show(page2);
        await expect.poll(() => songs(page2).then(rs => rs[0].songs[0].works.map(w => w.id))).toEqual([W.shuffle]);
        expect(await mbAsked(page2)).toEqual([]);
        await page2.close();
    });

    test('the glyph gets MusicBrainz\'s own work card (the dg-mb source)', async ({ page }) => {
        await open(page, 'collection-10163', { mb: true, settings: { sa_pop_mb: true } });
        await show(page);
        const glyph = page.locator('.project-detail table.tbl tbody a.mb-sl-work-exact').first();
        await expect(glyph).toHaveCount(1, { timeout: 15000 });
        await page.mouse.move(0, 0);
        await glyph.scrollIntoViewIfNeeded();
        await page.keyboard.down('Control');
        await glyph.hover();
        await page.keyboard.up('Control');
        await expect(page.locator('#mb-dp-peek')).toBeVisible();
        await expect(page.locator('#mb-dp-peek')).toContainText(/Work/);
    });

    test('logged in (8595): the card\'s MusicBrainz release answers first, by its recordings\' works', async ({ page }) => {
        await open(page, 'collection-8595', { mb: true });
        await show(page);
        const first = () => songs(page).then(rs => rs[0].songs[0].works);
        await expect.poll(first, { timeout: 15000 }).toEqual([{ how: 'release', id: W.blindedRel, n: '' }]);
        const asked = await mbAsked(page);
        expect(asked.filter(u => u.startsWith('/ws/2/release/6069bf25-f108-4670-8e62-d42eb55dfe32?inc=recordings+recording-level-rels+work-rels'))).toHaveLength(1);
    });

    test('sl-song: the editions\' songs get their glyph; this version\'s row its glyph without a link', async ({ page }) => {
        await open(page, 'song-backstreets-logged-in', { mb: true });
        await show(page, 'Show the song');
        const glyphs = () => page.evaluate(() => Array.from(document.querySelectorAll('.project-detail table.tbl tbody span.mb-sl-song'))
            .filter(s => s.querySelector('a.mb-sl-work')).map(s => ({ slug: s.dataset.mbSlSong, linked: !!s.querySelector('a.mb-sl-song-link'),
                self: !!s.closest('td.mb-sl-self') })));
        await expect.poll(async () => (await glyphs()).some(g => g.slug === 'thunderroad' && g.linked), { timeout: 15000 }).toBe(true);
        // The site's own links stay as written.
        const fixed = await page.locator('.project-detail table.tbl tbody span.mb-sl-song[data-mb-sl-fixed] a.mb-sl-song-link').first().getAttribute('href');
        expect(fixed).toMatch(/lyrics\.php\?song=/);
    });
});

test.describe('springsteenlyrics.com tracklists: the item\'s preview window', () => {
    test('the record says its tracks are songs; the window links each one, the card stays plain', async ({ page }) => {
        await loadSlListPage(page, { kind: 'bootlegs', settingsOverride: { sa_sl_detail_preview: true } });
        await routeDetailPages(page, 'sl');
        await page.click(`button[data-label="${SL_KINDS.bootlegs.button}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const rec = await page.evaluate(([h, u]) => window.__saTest.dpParse('springsteenlyrics.com', h, u),
            [fs.readFileSync(FX('detail-sl-bootlegs-6739.html'), 'utf8'), `${SL}bootlegs.php?item=6739&category=aud_live2014`]);
        expect(rec.slTracks).toBe(true);
        expect(rec.slShow).toEqual({ date: '2014-02-05', qual: '' });

        const link = page.locator('table.tbl tbody td a[href*="item=4554"]').filter({ hasNot: page.locator('img') });
        await page.mouse.move(0, 0);
        await link.scrollIntoViewIfNeeded();
        await page.keyboard.down('Control');
        await link.hover();
        await page.keyboard.up('Control');
        await expect(page.locator('#mb-dp-peek')).toBeVisible();
        await expect(page.locator('#mb-dp-peek .mb-dp-tracks a')).toHaveCount(0);
        await page.keyboard.press('Space');
        const dialog = page.locator('#mb-dp-dialog');
        await expect(dialog.locator('.mb-dp-xtitle')).toBeVisible();
        const items = await dialog.locator('.mb-dp-tracks li').evaluateAll(lis => lis.map(li => ({
            text: li.textContent.replace(/\s+/g, ' ').trim(), href: (li.querySelector('a.mb-sl-song-link') || {}).href || '',
        })));
        // The list page is springsteenlyrics.com without "www.": the link
        // stays on the page's own origin.
        expect(items.find(i => /THAT'S WHAT YOU GET/.test(i.text)).href).toBe('https://springsteenlyrics.com/lyrics.php?song=thatswhatyouget');
        expect(items.find(i => /SEE MY FRIENDS/.test(i.text)).href).toBe('');
    });
});

/**
 * Opens item 4554's window on the bootleg list (aud_live1967): the list
 * rendered, the item's card shown with Ctrl and pinned with Space, its THAT'S
 * WHAT YOU GET glyph waited for.
 *
 * @param {import('@playwright/test').Page} page
 * @param {boolean} readAhead - `sa_dp_window_read_ahead` (the window's dots).
 * @returns {Promise<void>}
 */
async function openWindowWithGlyph(page, readAhead) {
    await stubMusicBrainz(page);
    await loadSlListPage(page, { kind: 'bootlegs', settingsOverride: { sa_sl_detail_preview: true, sa_sl_mb_works: true,
        // MusicBrainz's previews on (the schema default, vzell's): only then
        // is a glyph a link that opens in the window, with the dot.
        sa_dp_window_read_ahead: readAhead, sa_pop_mb: true } });
    await routeDetailPages(page, 'sl');
    await page.click(`button[data-label="${SL_KINDS.bootlegs.button}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
    const link = page.locator('table.tbl tbody td a[href*="item=4554"]').filter({ hasNot: page.locator('img') });
    await page.mouse.move(0, 0);
    await link.scrollIntoViewIfNeeded();
    await page.keyboard.down('Control');
    await link.hover();
    await page.keyboard.up('Control');
    await expect(page.locator('#mb-dp-peek')).toBeVisible();
    await page.keyboard.press('Space');
    const li = page.locator('#mb-dp-dialog .mb-dp-tracks li', { hasText: 'THAT\'S WHAT YOU GET' });
    await expect(li.locator('a.mb-sl-work-exact')).toHaveAttribute('href', `https://musicbrainz.org/work/${W.thatswhat}`, { timeout: 15000 });
    if (readAhead) {
        await expect(page.locator('#mb-dp-dialog .mb-dp-area.mb-dp-dots')).toHaveCount(1);
        // The works are in memory now: the next paint of this row has the
        // glyph from the start, so the window marks it as a link that opens
        // here, with its reserved dot (vzell's case: works saved before).
        await page.mouse.move(0, 0);
        await page.keyboard.press('ArrowRight');
        await expect(page.locator('#mb-dp-dialog .mb-dp-pos-label')).toHaveText(/^2 \//);
        await page.keyboard.press('ArrowLeft');
        await expect(li.locator('a.mb-sl-work-exact')).toHaveClass(/\bmb-dp-l-here\b/, { timeout: 10000 });
    }
}

// vzell, 2026-11-05: org/springsteenlyrics.org "Adjustments to 'URLify the
// tracklist to song URLs (SL and MB)'".
test.describe('springsteenlyrics.com tracklists: adjustments', () => {
    test('3b: a title without an SL page still gets its work glyph (a MusicBrainz alias); every trailing (…); "aka"', async ({ page }) => {
        await open(page, 'brucelegs-148', { mb: true });
        await show(page);
        const rows = () => songs(page);
        const by = (rs, t) => rs.find(r => r.text === t);
        await expect.poll(async () => (by(await rows(), 'Circus Song') || { songs: [] }).songs, { timeout: 15000 })
            .toEqual([{ slug: '', href: '', show: '', showText: '', thisShow: false, works: [{ how: 'title', id: W.billy, n: '' }] }]);
        const rs = await rows();
        // "Rosalita (Come Out Tonight) (instrumental)": both "(…)" dropped.
        expect(by(rs, 'Rosalita (Come Out Tonight) (instrumental)').songs[0]).toMatchObject({ slug: 'rosalita', href: `${SONG}rosalita` });
        // "Phantoms aka Wild Zero And Blind Terry": the song by its first name, the whole text linked.
        expect(by(rs, 'Phantoms aka Wild Zero And Blind Terry').songs[0]).toMatchObject({ slug: 'phantoms', href: `${SONG}phantoms` });
    });

    test('3c: the glyphs pulse while the works load', async ({ page }) => {
        // The first browse answers 503: the retry waits 2 s, the glyphs wait with it.
        await open(page, 'collection-10163', { mb: true, failWorks: 1 });
        await show(page);
        const wait = page.locator('.project-detail table.tbl tbody .mb-sl-work-wait img').first();
        await expect(wait).toBeAttached();
        expect(await wait.evaluate(img => getComputedStyle(img).animationName)).toBe('mb-sl-work-pulse');
        await expect(page.locator('.project-detail table.tbl tbody a.mb-sl-work-exact').first()).toBeAttached({ timeout: 15000 });
        await expect(page.locator('.project-detail table.tbl tbody .mb-sl-work-wait')).toHaveCount(0);
    });

    for (const readAhead of [false, true]) {
        test(`6: the item window's songs get their glyph on the list page (the works read on Space), in the line${readAhead ? ', read-ahead dots on' : ''}`, async ({ page }) => {
            await openWindowWithGlyph(page, readAhead);
            // In the line, before the title (vzell, 2026-11-05: the icons sat
            // BELOW each line; with read-ahead on, the window's dot stacked
            // above them too).
            const geo = await page.locator('#mb-dp-dialog .mb-dp-tracks li', { hasText: 'THAT\'S WHAT YOU GET' }).evaluate((li) => {
                const r = el => el.getBoundingClientRect();
                const img = r(li.querySelector('a.mb-sl-work img'));
                const link = r(li.querySelector('a.mb-sl-song-link'));
                const pos = r(li.querySelector('.mb-dp-pos'));
                return { dy: Math.abs((img.top + img.bottom) / 2 - (link.top + link.bottom) / 2), before: img.right <= link.left + 0.5,
                    lineH: li.getBoundingClientRect().height, posH: pos.height, imgW: img.width };
            });
            expect(geo.imgW).toBe(13);
            expect(geo.dy).toBeLessThan(6);
            expect(geo.before).toBe(true);
            expect(geo.lineH).toBeLessThan(geo.posH * 1.8);
        });
    }

    test('6: the item window\'s songs get their glyph on the list page (the works read on Space)', async ({ page }) => {
        await openWindowWithGlyph(page, false);
        expect((await mbAsked(page)).filter(u => u.startsWith('/ws/2/work?'))).toHaveLength(1);
    });

    test('6 (setup reference): the card asks MusicBrainz nothing before Space', async ({ page }) => {
        await stubMusicBrainz(page);
        await loadSlListPage(page, { kind: 'bootlegs', settingsOverride: { sa_sl_detail_preview: true, sa_sl_mb_works: true } });
        await routeDetailPages(page, 'sl');
        await page.click(`button[data-label="${SL_KINDS.bootlegs.button}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const link = page.locator('table.tbl tbody td a[href*="item=4554"]').filter({ hasNot: page.locator('img') });
        await page.mouse.move(0, 0);
        await link.scrollIntoViewIfNeeded();
        await page.keyboard.down('Control');
        await link.hover();
        await page.keyboard.up('Control');
        await expect(page.locator('#mb-dp-peek')).toBeVisible();
        expect(await mbAsked(page)).toEqual([]);
    });

    test('5b: a various-artists line in the window links Bruce\'s song, another artist\'s stays plain', async ({ page }) => {
        await open(page, 'collection-10163');
        const html = (t) => page.evaluate(x => window.__saTest.slTrackTitleHtml(x), t);
        expect(await html('Bruce Springsteen: BORN TO RUN')).toContain(`href="${SONG}borntorun"`);
        expect(await html('Bruce Springsteen: BORN TO RUN')).toMatch(/^Bruce Springsteen: <span class="mb-sl-song"/);
        expect(await html('Chase: Get It On')).toBe('Chase: Get It On');
        expect(await html('Ted Nugent: Moter City Madhouse')).toBe('Ted Nugent: Moter City Madhouse');
        expect(await html('SHE\'S THE ONE #2 [partial]')).toMatch(/<a class="mb-sl-song-link" href="[^"]*song=shestheone">SHE'S THE ONE<\/a><\/span> #2 \[partial\]$/);
    });

    test('5a: logged in, the collection and bootleg lists get the item\'s ID (linked, an edit pencil, a number); logged out none', async ({ page }) => {
        const { spec } = await loadSlListPage(page, { kind: 'collection-logged-in' });
        await page.click(`button[data-label="${spec.button}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const heads = await page.locator('table.tbl thead tr:first-child th').evaluateAll(ths => ths.map(th => th.dataset.colName || th.textContent.trim()));
        expect(heads.some(h => /^ID\b/.test(h))).toBe(true);
        const cells = await page.evaluate(() => {
            const ths = Array.from(document.querySelectorAll('table.tbl thead tr:first-child th'));
            const i = ths.findIndex(th => /^ID\b/.test(th.dataset.colName || th.textContent.trim()));
            return Array.from(document.querySelectorAll('table.tbl tbody tr')).map(tr => {
                const td = tr.cells[i];
                const title = tr.querySelector('a[href*="item="]');
                return { text: td.textContent.trim(), href: (td.querySelector('a:not(.mb-sl-edit)') || {}).getAttribute?.('href') || '',
                    edit: !!td.querySelector('a.mb-sl-edit'), item: title ? (title.getAttribute('href').match(/item=(\d+)/) || [])[1] : '' };
            });
        });
        expect(cells.length).toBeGreaterThan(5);
        cells.forEach(c => {
            expect(c.text).toMatch(/^\d+$/);
            expect(c.text).toBe(c.item);
            expect(c.href).toMatch(new RegExp(`item=${c.text}\\b`));
            expect(c.edit).toBe(true);
        });
    });

    test('5a: logged out, no ID column', async ({ page }) => {
        const { spec } = await loadSlListPage(page, { kind: 'collection' });
        await page.click(`button[data-label="${spec.button}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const heads = await page.locator('table.tbl thead tr:first-child th').evaluateAll(ths => ths.map(th => th.dataset.colName || th.textContent.trim()));
        expect(heads.some(h => /^ID\b/.test(h))).toBe(false);
    });

    test('3a: a label\'s list is a record: its name, its count, its items, their covers', async ({ page }) => {
        await open(page, 'collection-10163');
        const rec = await page.evaluate(([h, u]) => window.__saTest.dpParse('springsteenlyrics.com', h, u),
            [fs.readFileSync(FX('detail-sl-brucelegs-label-greatdane.html'), 'utf8'), `${SL}brucelegs.php?cmd=list&f_label=Great%20Dane%20Records`]);
        expect(rec.title).toBe('Great Dane Records');
        expect(rec.highlight).toEqual({ value: '15', label: 'CD and vinyl bootlegs' });
        expect(rec.excerpt.lines).toHaveLength(6);
        expect(rec.excerpt.total).toBe(15);
        expect(rec.sections.map(x => x.label)).toEqual(['Items (15)']);
        expect(rec.images).toHaveLength(15);
        // The window's lines link their items (vzell: "the item lines should
        // also get hyperlinked + POH support").
        const hrefs = Array.from(rec.sections[0].html.matchAll(/<a href="([^"]+)">/g), m => m[1]);
        expect(hrefs).toHaveLength(15);
        hrefs.forEach(h => expect(h).toMatch(/^https:\/\/www\.springsteenlyrics\.com\/brucelegs\.php\?item=\d+/));
    });

    test('3a: the CD and vinyl bootleg list\'s Label cell links the label and previews it', async ({ page }) => {
        await loadSlListPage(page, { kind: 'brucelegs', settingsOverride: { sa_sl_detail_preview: true } });
        const asked = [];
        await page.route(/brucelegs\.php\?cmd=list&f_label=/, (route) => {
            asked.push(route.request().url());
            return route.fulfill({ path: FX('detail-sl-brucelegs-label-greatdane.html'), contentType: 'text/html; charset=UTF-8' });
        });
        await page.click(`button[data-label="${SL_KINDS.brucelegs.button}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const label = page.locator('table.tbl tbody a[href*="f_label="]', { hasText: 'The Godfatherecords' }).first();
        await expect(label).toHaveAttribute('href', 'brucelegs.php?cmd=list&f_label=The Godfatherecords');
        await page.mouse.move(0, 0);
        await label.scrollIntoViewIfNeeded();
        await page.keyboard.down('Control');
        await label.hover();
        await page.keyboard.up('Control');
        await expect(page.locator('#mb-dp-peek')).toBeVisible();
        await expect(page.locator('#mb-dp-peek')).toContainText('CD and vinyl bootlegs', { timeout: 10000 });
        expect(asked).toHaveLength(1);
        // Space: the window lists every item as a link that opens here (its
        // own card on a rest, the item in the window on a click).
        await page.keyboard.press('Space');
        const items = page.locator('#mb-dp-dialog .mb-dp-section a[href*="brucelegs.php?item="]');
        await expect(items).toHaveCount(15);
        await expect(items.first()).toHaveClass(/\bmb-dp-l-here\b/);
    });

    test('4: a head picture shows large on a rest, larger with Shift; Space opens the viewer', async ({ page }) => {
        await open(page, 'collection-10163');
        await show(page);
        const tile = page.locator('.mb-fd-art figure.mb-release-art-tile > a').first();
        await expect(tile).toHaveAttribute('data-mbtt-fn', 'fd-pic');
        await page.mouse.move(0, 0);
        await tile.scrollIntoViewIfNeeded();
        await tile.hover();
        const prev = page.locator('#mb-stat-tooltip img.mb-fd-pic-prev');
        await expect(prev).toBeVisible();
        const w0 = await prev.evaluate(i => i.getBoundingClientRect().width);
        expect(w0).toBe(320);
        await expect(page.locator('#mb-stat-tooltip')).toContainText('Picture 1 of 6');
        await page.keyboard.down('Shift');
        await expect.poll(() => page.locator('#mb-stat-tooltip img.mb-fd-pic-prev').evaluate(i => i.getBoundingClientRect().width)).toBeGreaterThan(320);
        await page.keyboard.up('Shift');
        await expect.poll(() => page.locator('#mb-stat-tooltip img.mb-fd-pic-prev').evaluate(i => i.getBoundingClientRect().width)).toBe(320);
        await page.keyboard.press('Space');
        await expect(page.locator('#mb-art-viewer')).toBeVisible();
    });

    test('IP: before any press, the item page\'s own tracklist links its songs; its text unchanged; a rest previews', async ({ page }) => {
        const { errors } = await open(page, 'collection-10163', { settings: { sa_sl_detail_preview: true } });
        const block = page.locator('.project-detail span.monospaced[data-mb-sl-linked]');
        await expect(block.locator('a.mb-sl-song-link')).toHaveCount(7);
        expect(await block.locator('a.mb-sl-song-link').evaluateAll(as => as.map(a => a.getAttribute('href')))).toEqual(
            ['theestreetshuffle', '4thofjulyasburypark', 'kittysback', 'wildbillyscircusstory', 'incidenton57thstreet', 'rosalita',
                'newyorkcityserenade'].map(x => SONG + x));
        // The site's text, untouched: the same as the fixture's block.
        const original = await page.evaluate((html) => {
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const b = Array.from(doc.querySelectorAll('span.monospaced')).find(x => /E STREET SHUFFLE/.test(x.textContent));
            return b.textContent;
        }, fs.readFileSync(FX('detail-sl-collection-10163.html'), 'utf8'));
        expect(await block.evaluate(b => b.textContent)).toBe(original);
        // A rest with Ctrl previews the song (its page is blocked: the card says so).
        const link = block.locator('a.mb-sl-song-link').first();
        await page.mouse.move(0, 0);
        await page.keyboard.down('Control');
        await link.hover();
        await page.keyboard.up('Control');
        await expect(page.locator('#mb-dp-peek')).toBeVisible();
        // The press still reads the page's own copy: the tables as before.
        await show(page);
        expect((await songs(page)).map(r => r.text)).toEqual(['THE E STREET SHUFFLE', '4TH OF JULY, ASBURY PARK (SANDY)', 'KITTY\'S BACK',
            'WILD BILLY\'S CIRCUS STORY', 'INCIDENT ON 57TH STREET', 'ROSALITA (COME OUT TONIGHT)', 'NEW YORK CITY SERENADE']);
        expect(errors).toEqual([]);
    });

    test('IP: the glyphs come from what is saved; a visit alone asks MusicBrainz nothing', async ({ page }) => {
        // Nothing saved yet: no glyph, no request.
        await open(page, 'collection-10163', { mb: true });
        await expect(page.locator('.project-detail span.monospaced a.mb-sl-song-link')).toHaveCount(7);
        expect(await mbAsked(page)).toEqual([]);
        await expect(page.locator('.project-detail span.monospaced a.mb-sl-work')).toHaveCount(0);
        // A press reads and keeps the works...
        await show(page);
        await expect(page.locator('.project-detail table.tbl tbody a.mb-sl-work-exact').first()).toBeAttached({ timeout: 15000 });
        // ...and the next visit's initial page shows them, asking nothing.
        const page2 = await page.context().newPage();
        await open(page2, 'collection-10163', { mb: true });
        const first = page2.locator('.project-detail span.monospaced span.mb-sl-song').first();
        await expect(first.locator('a.mb-sl-work-exact')).toHaveAttribute('href', `https://musicbrainz.org/work/${W.shuffle}`);
        expect(await mbAsked(page2)).toEqual([]);
        await page2.close();
    });
});

// vzell, 2026-11-05, org/springsteenlyrics.org: collection item 7457
// (Broadcast Rarities) writes its media as "Disc 1: [CD]" / "Disc 2: [DVD]",
// which were no medium headers, so the DVD's 15 tracks were read as notes;
// and in its window the titles after "09" sat left of the others.
test.describe('springsteenlyrics.com tracklists: media with their kind in brackets (item 7457)', () => {
    const URL7457 = SL + ITEMS['collection-7457'];
    const HTML7457 = () => fs.readFileSync(FX('detail-sl-collection-7457.html'), 'utf8');

    test('the record: "Disc 1: [CD]" and "Disc 2: [DVD]" are media; no track is a note', async ({ page }) => {
        await open(page, 'collection-7457');
        const rec = await page.evaluate(([h, u]) => window.__saTest.dpParse('springsteenlyrics.com', h, u), [HTML7457(), URL7457]);
        const byDisc = {};
        rec.tracks.forEach((t) => { byDisc[t.disc] = (byDisc[t.disc] || 0) + 1; });
        expect(byDisc).toEqual({ 'Disc 1: [CD]': 12, 'Disc 2: [DVD]': 15 });
        expect(rec.notes.filter(n => /GLORY DAYS|^Disc/.test(n))).toEqual([]);
        expect(rec.tracks.find(t => t.disc === 'Disc 2: [DVD]' && t.pos === '02').title).toBe('GLORY DAYS [continued]');
    });

    test('the initial page links the DVD\'s songs too; "GLORY DAYS [continued]" links glorydays', async ({ page }) => {
        const { errors } = await open(page, 'collection-7457');
        const block = page.locator('.project-detail span.monospaced[data-mb-sl-linked]');
        const hrefs = await block.locator('a.mb-sl-song-link').evaluateAll(as => as.map(a => a.getAttribute('href')));
        const dvd = await block.evaluate((b) => {
            const links = Array.from(b.querySelectorAll('a.mb-sl-song-link'));
            const marker = Array.from(b.childNodes).find(n => n.nodeType === 3 && /Disc 2: \[DVD\]/.test(n.nodeValue));
            return links.filter(a => marker.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING).map(a => a.textContent);
        });
        expect(dvd.slice(0, 3)).toEqual(['GLORY DAYS', 'GLORY DAYS', 'YOUNGSTOWN']);
        expect(dvd).toContain('DARKNESS ON THE EDGE OF TOWN');
        expect(hrefs.filter(h => h === SONG + 'glorydays')).toHaveLength(3);
        expect(errors).toEqual([]);
    });

    test('the press: a sub-table per disc, the DVD\'s 15 tracks linked', async ({ page }) => {
        await open(page, 'collection-7457');
        await show(page);
        const heads = await page.locator('.project-detail h3').evaluateAll(hs => hs.map(h => h.textContent));
        expect(heads.some(h => h.includes('Disc 1: [CD]'))).toBe(true);
        expect(heads.some(h => h.includes('Disc 2: [DVD]'))).toBe(true);
        const rows = await songs(page);
        expect(rows).toHaveLength(27);
        // The DVD's second row ("GLORY DAYS [continued]": the table keeps
        // the bracket out of the Title cell) links the song.
        expect(rows[13].text).toMatch(/^GLORY DAYS\b/);
        expect(rows[13].songs.map(x => x.href)).toEqual([SONG + 'glorydays']);
        // Every DVD song the site has a page for; ANGEL EYES has none.
        expect(rows.slice(12).filter(r => !r.songs.some(x => x.href)).map(r => r.text)).toEqual(['ANGEL EYES']);
    });

    test('the window: the numbers get one width, so every title starts at the same x', async ({ page }) => {
        await loadSlListPage(page, { kind: 'collection', settingsOverride: { sa_sl_detail_preview: true } });
        await routeDetailPages(page, 'sl');
        // The list's item 8981 answers with item 7457's page (registered
        // last, so it wins over the detail routes).
        await page.route(/collection\.php\?item=8981/, route => route.fulfill({ status: 200, contentType: 'text/html; charset=UTF-8', body: HTML7457() }));
        await page.click(`button[data-label="${SL_KINDS.collection.button}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const link = page.locator('table.tbl tbody td a[href*="item=8981"]').filter({ hasNot: page.locator('img') }).first();
        await page.mouse.move(0, 0);
        await link.scrollIntoViewIfNeeded();
        await page.keyboard.down('Control');
        await link.hover();
        await page.keyboard.up('Control');
        await expect(page.locator('#mb-dp-peek')).toBeVisible();
        await page.keyboard.press('Space');
        const dialog = page.locator('#mb-dp-dialog');
        await expect(dialog.locator('.mb-dp-tracks.mb-sl-tracks')).toHaveCount(2);
        const geo = await dialog.locator('.mb-dp-tracks.mb-sl-tracks li').evaluateAll(lis => lis.map((li) => {
            const list = li.closest('ol');
            const pos = li.querySelector('.mb-dp-pos');
            const r = document.createRange();
            r.selectNodeContents(pos);
            // Where the line's text starts: the first box after the number
            // (a song, a glyph, or plain text).
            const after = document.createRange();
            after.setStartAfter(pos);
            after.setEnd(li, li.childNodes.length);
            return { pos: pos.textContent, box: pos.getBoundingClientRect().width, text: r.getBoundingClientRect().width,
                minWidth: getComputedStyle(pos).minWidth, title: after.getClientRects()[0].left - list.getBoundingClientRect().left };
        }));
        expect(geo).toHaveLength(27);
        // The guarantee: a box at least as wide as the widest number, the
        // same for every line, whatever the font's figures are like.
        const widest = Math.max(...geo.map(g => g.text));
        geo.forEach((g) => {
            expect(g.minWidth).not.toBe('0px');
            expect(Math.abs(g.box - geo[0].box)).toBeLessThan(0.5);
            expect(g.box).toBeGreaterThanOrEqual(widest - 0.01);
            expect(Math.abs(g.title - geo[0].title)).toBeLessThan(0.5);
        });
    });
});

// vzell, 2026-11-05, org/springsteenlyrics.org 2.): a box set's sampler
// item lists its records with their pressing, catalogue number and sleeve,
// and no tracklist; the item page read the first record's three lines as
// "Tracks (3)".
test.describe('springsteenlyrics.com: a box set listing its records without tracklists (sampler 5618, 5619)', () => {
    const BOX = {
        5618: { url: `${SL}collection.php?item=5618&category=sampler&f_format=12i`, n: 6, last: ['Record 6', 'Tunnel Of Love', 'CBS 460270 1'],
            notes: [/^Also includes a 4-page picture insert\.$/, /^Notes from Lost In The Flood:\nExtremely rare/] },
        5619: { url: `${SL}collection.php?item=5619&category=sampler&f_format=12i`, n: 4, last: ['Record 4', 'Darkness On The Edge OF Town', 'CBS 86061'],
            notes: [/^Notes from Lost In The Flood:\nLimited edition/] },
    };
    const html = id => fs.readFileSync(FX(`detail-sl-collection-${id}.html`), 'utf8');

    for (const id of ['5618', '5619']) {
        test(`${id}: the record has no tracks; its contents are a section and a count; the notes are only the notes`, async ({ page }) => {
            await open(page, 'collection-10163');
            const rec = await page.evaluate(([h, u]) => window.__saTest.dpParse('springsteenlyrics.com', h, u), [html(id), BOX[id].url]);
            expect(rec.tracks).toEqual([]);
            expect(rec.highlight).toEqual({ value: String(BOX[id].n), label: 'records listed, without their tracklists' });
            const sec = rec.sections.find(s => /^Contents/.test(s.label));
            expect(sec.label).toBe(`Contents (${BOX[id].n})`);
            expect(sec.text.split('\n\n')[0].split('\n')).toEqual(['Record 1: Greetings From Asbury Park N.J.',
                `Cat. no. ${id === '5618' ? 'CBS SBP 234758' : 'CBS 65480'}`, id === '5618' ? 'Aussie pressing' : 'Dutch pressing',
                expect.stringMatching(/sleeve/)]);
            expect(rec.notes).toHaveLength(BOX[id].notes.length);
            BOX[id].notes.forEach((re, i) => expect(rec.notes[i]).toMatch(re));
            expect(rec.notes.join('\n')).not.toMatch(/^(?:Aussie|Dutch) pressing$|Cat#|Record \d:/m);
        });
    }

    test('5618: the press shows one Contents table, a row per record; the head\'s Notes keep only the notes', async ({ page }) => {
        const asked = [];
        page.on('pageerror', e => asked.push(String(e)));
        await page.route(/^https?:\/\//, route => route.abort('blockedbyclient'));
        await loadUserscriptPage(page, {
            url: BOX[5618].url, fixtureFile: FX('detail-sl-collection-5618.html'), testMode: true,
            settingsOverride: { ...FIXTURE_SETTINGS_OVERRIDE, sa_enable_springsteenlyrics: true, sa_render_threshold: 100000,
                sa_foreign_mb_titles: false, sa_foreign_typography: false },
        });
        await show(page);
        const heads = await page.locator('.project-detail h3').evaluateAll(hs => hs.map(h => h.textContent));
        expect(heads.some(h => h.includes('Contents (no tracklists on the page)'))).toBe(true);
        expect(heads.some(h => /^\s*Tracks\b/.test(h))).toBe(false);
        const rows = await page.locator('.project-detail table.tbl tbody tr').evaluateAll(trs => trs.map(tr =>
            Array.from(tr.cells).map(td => td.innerText.trim())));
        expect(rows).toHaveLength(6);
        expect(rows[0].slice(0, 3)).toEqual(['Record 1', 'Greetings From Asbury Park N.J.', 'CBS SBP 234758']);
        expect(rows[0][3]).toBe('Aussie pressing\nPicture sleeve, transparent plastic inner bag, orange/yellow labels');
        expect(rows[5].slice(0, 3)).toEqual(BOX[5618].last);
        const notes = await page.locator('.mb-fd-head').evaluate(h => h.textContent);
        expect(notes).toContain('Also includes a 4-page picture insert.');
        expect(notes).not.toContain('Aussie pressing');
        expect(asked).toEqual([]);
    });

    test('the window of such an item: no "no tracklist" line; its contents, the count', async ({ page }) => {
        await loadSlListPage(page, { kind: 'collection', settingsOverride: { sa_sl_detail_preview: true } });
        await routeDetailPages(page, 'sl');
        await page.route(/collection\.php\?item=8981/, route => route.fulfill({ status: 200, contentType: 'text/html; charset=UTF-8', body: html('5619') }));
        await page.click(`button[data-label="${SL_KINDS.collection.button}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const link = page.locator('table.tbl tbody td a[href*="item=8981"]').filter({ hasNot: page.locator('img') }).first();
        await page.mouse.move(0, 0);
        await link.scrollIntoViewIfNeeded();
        await page.keyboard.down('Control');
        await link.hover();
        await page.keyboard.up('Control');
        const peek = page.locator('#mb-dp-peek');
        await expect(peek.locator('.mb-dp-stat')).toHaveText('4 records listed, without their tracklists');
        await expect(peek.locator('.mb-dp-tracks')).toHaveCount(0);
        await page.keyboard.press('Space');
        const dialog = page.locator('#mb-dp-dialog');
        await expect(dialog.locator('h4', { hasText: 'Contents (4)' })).toBeVisible();
        await expect(dialog.locator('ol.mb-dp-contents > li')).toHaveCount(4);
        await expect(dialog.locator('ol.mb-dp-contents > li').first()).toContainText('Record 1 Greetings From Asbury Park N.J. · CBS 65480');
        await expect(dialog).not.toContainText('The page has no tracklist.');
        await expect(dialog.locator('.mb-dp-note')).toHaveCount(1);
    });
});
