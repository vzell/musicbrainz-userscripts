'use strict';

// YouTube videos, played where they are listed (org/youtube.org; mockup
// org/youtube-embeds-mockups.html). A YouTube link keeps its card and window;
// beside it a "Play here" tile (`_ytTileHtml()`) plays it in YouTube's
// privacy-enhanced player (youtube-nocookie.com), behind
// `sa_yt_play_in_place`, with a still frame from i.ytimg.com behind
// `sa_yt_stills` (both default on, both forced OFF in fixtures by
// FIXTURE_SETTINGS_OVERRIDE and seeded back on here).
//
// Pins, Step 1 (the shared tile and player, mounted through
// `__saTest.ytTileHtml()`, the shipping builder):
//   1. `_ytParse()`: every URL shape the org file lists, and what is NOT one;
//   2. the tile: a <button>, its data, a lazy no-referrer still only with
//      `sa_yt_stills`, a playlist's plain "≡ list" frame either way;
//   3. NO request to youtube-nocookie.com or i.ytimg.com before a click with
//      the stills off; a click asks the player ONCE (its exact nocookie src);
//   4. one player at a time: a second tile stops the first, the playing tile
//      clicked again stops it;
//   5. Esc stops the player and nothing else sees that Esc; the next one
//      goes on as before; "■ Stop" stops too, the focus back on the tile;
//   6. in a table, the player is a full-width row under the row
//      (`tr.mb-yt-playerrow`), and a re-render that empties the tbody stops
//      it, the re-rendered copy of the tile left unmarked;
//   7. stills on: one i.ytimg.com request per tile shown;
//   8. a tile known dead (the reader's oEmbed said so) shows Unavailable and
//      asks nothing when clicked;
//   9. decision 6: a frame-policy refusal of youtube-nocookie.com removes the
//      player, opens YouTube in a new tab, and every tile says so from then on;
//  10. `sa_yt_play_in_place` off: the builder makes nothing (no style either).
//
// Mutation list: scripts/mutations/youtube-embeds.json.
//
// Host page: tests/fixtures/event-overview.html (any MusicBrainz page would
// do for Step 1; the later steps read its URLs table and annotation).

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');

const URL_EVENT = 'https://musicbrainz.org/event/3f2ca30a-7de4-4964-ad30-48376535fec8';
const FIXTURE = path.join(__dirname, 'event-overview.html');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const V1 = 'https://www.youtube.com/watch?v=Wu4_zVxmufY';
const V2 = '//www.youtube.com/watch?v=dJkaZ8hQM60';
const LIST = 'https://www.youtube.com/playlist?list=PLM0aPYPhFzkrHWh8uoXwAsxdDXyFEEELt';

/**
 * Loads the event page (no button pressed) with the two YouTube settings
 * seeded, every YouTube host answered locally and counted.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} [settings] - On top of both YouTube settings on.
 * @param {Object} [responses] - GM_xmlhttpRequest answers by URL (the stub's).
 * @returns {Promise<{player: string[], stills: string[], youtube: string[]}>}
 */
async function openPage(page, settings = {}, responses = {}) {
    const log = { player: [], stills: [], youtube: [] };
    const ctx = page.context();
    await ctx.addInitScript((r) => { window.__gmXhrResponses = r; }, responses);
    await ctx.route('https://www.youtube-nocookie.com/**', (route) => {
        log.player.push(route.request().url());
        return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>player</title><p>player</p>' });
    });
    await ctx.route('https://i.ytimg.com/**', (route) => {
        log.stills.push(route.request().url());
        return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    });
    await ctx.route(/^https:\/\/(?:www\.)?youtube\.com\//, (route) => {
        log.youtube.push(route.request().url());
        return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>YouTube</title>' });
    });
    await ctx.route('https://static.metabrainz.org/**', (route) => route.abort('blockedbyclient'));
    await loadUserscriptPage(page, {
        url: URL_EVENT, fixtureFile: FIXTURE, testMode: true,
        settingsOverride: { sa_yt_play_in_place: true, sa_yt_stills: true, ...settings },
    });
    await page.waitForFunction(() => !!window.__saTest);
    return log;
}

/**
 * Mounts tiles at the top of #content, each in its own `div.mb-yt-host`
 * (the "under the tile" placement), and returns nothing; tiles are found
 * by `.mb-yt-host:nth-of-type(n) .mb-yt-tile`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Array<[string, Object]>} tiles - [href, opts] pairs.
 * @returns {Promise<void>}
 */
async function mountTiles(page, tiles) {
    await page.evaluate((list) => {
        const box = document.createElement('div');
        box.id = 'yt-test-box';
        box.innerHTML = list.map(([href, opts]) => `<div class="mb-yt-host">${window.__saTest.ytTileHtml(href, opts)}</div>`).join('');
        (document.getElementById('content') || document.body).prepend(box);
    }, tiles);
}

const tile = (page, n) => page.locator('#yt-test-box .mb-yt-host').nth(n).locator('.mb-yt-tile');

test.describe('YouTube in place — Step 1: the shared tile and player', () => {
    test('_ytParse: every YouTube shape, and what is not one', async ({ page }) => {
        await openPage(page, { sa_yt_stills: false });
        const r = await page.evaluate(() => Object.fromEntries([
            ['watch', 'https://www.youtube.com/watch?v=Wu4_zVxmufY'],
            ['protocolRelative', '//www.youtube.com/watch?v=dJkaZ8hQM60'],
            ['watchWithList', 'https://www.youtube.com/watch?v=Wu4_zVxmufY&list=PLabc'],
            ['mobile', 'https://m.youtube.com/watch?v=Wu4_zVxmufY'],
            ['music', 'https://music.youtube.com/watch?v=Wu4_zVxmufY'],
            ['short', 'https://youtu.be/MLnTqKksftM?t=3'],
            ['shorts', 'https://www.youtube.com/shorts/abcdefghijk'],
            ['live', 'https://www.youtube.com/live/abcdefghijk'],
            ['v', 'https://www.youtube.com/v/abcdefghijk'],
            ['embed', 'https://www.youtube.com/embed/Wu4_zVxmufY?rel=0'],
            ['nocookie', 'https://www.youtube-nocookie.com/embed/Wu4_zVxmufY'],
            ['playlist', 'https://www.youtube.com/playlist?list=PLM0aPYPhFzkrHWh8uoXwAsxdDXyFEEELt'],
            ['videoseries', 'https://www.youtube.com/embed/videoseries?si=xY&list=PLTejJhB5zqTA'],
            ['channel', 'http://www.youtube.com/brucebasewiki'],
            ['noId', 'https://www.youtube.com/watch'],
            ['relative', '/watch?v=Wu4_zVxmufY'],
            ['otherSite', 'https://vimeo.com/123456'],
            ['lookalike', 'https://notyoutube.com/watch?v=Wu4_zVxmufY'],
        ].map(([k, u]) => [k, window.__saTest.ytParse(u)])));
        expect(r.watch).toEqual({ kind: 'video', id: 'Wu4_zVxmufY', list: '' });
        expect(r.protocolRelative, 'MusicBrainz writes //www.youtube.com/…').toEqual({ kind: 'video', id: 'dJkaZ8hQM60', list: '' });
        expect(r.watchWithList, 'a video in a list plays the video').toEqual({ kind: 'video', id: 'Wu4_zVxmufY', list: 'PLabc' });
        expect(r.mobile.id).toBe('Wu4_zVxmufY');
        expect(r.music.id).toBe('Wu4_zVxmufY');
        expect(r.short).toEqual({ kind: 'video', id: 'MLnTqKksftM', list: '' });
        expect(r.shorts).toEqual({ kind: 'short', id: 'abcdefghijk', list: '' });
        expect(r.live.kind).toBe('video');
        expect(r.v.id).toBe('abcdefghijk');
        expect(r.embed).toEqual({ kind: 'video', id: 'Wu4_zVxmufY', list: '' });
        expect(r.nocookie.id).toBe('Wu4_zVxmufY');
        expect(r.playlist).toEqual({ kind: 'playlist', id: '', list: 'PLM0aPYPhFzkrHWh8uoXwAsxdDXyFEEELt' });
        expect(r.videoseries, 'embed/videoseries is the playlist, never a video named "videoseries"')
            .toEqual({ kind: 'playlist', id: '', list: 'PLTejJhB5zqTA' });
        for (const k of ['channel', 'noId', 'relative', 'otherSite', 'lookalike']) expect(r[k], k).toBeNull();
    });

    test('the tile: a button with its data; a lazy no-referrer still only with the setting; a playlist is plain', async ({ page }) => {
        await openPage(page, { sa_yt_stills: false });
        const off = await page.evaluate(([v, l]) => {
            const t = document.createElement('template');
            t.innerHTML = window.__saTest.ytTileHtml(v, { title: 'Born to Run', dur: 270 }) + window.__saTest.ytTileHtml(l, {});
            const [a, b] = t.content.children;
            return {
                tag: a.tagName, type: a.type, key: a.dataset.mbYt, img: a.querySelectorAll('img').length,
                text: a.textContent, aria: a.getAttribute('aria-label'),
                listKey: b.dataset.mbYt, listText: b.textContent, listImg: b.querySelectorAll('img').length,
            };
        }, [V1, LIST]);
        expect(off.tag).toBe('BUTTON');
        expect(off.type).toBe('button');
        expect(off.key).toBe('Wu4_zVxmufY');
        expect(off.img, 'stills off: no picture, no request').toBe(0);
        expect(off.text).toContain('Born to Run');
        expect(off.text).toContain('Play here · 4:30');
        expect(off.aria).toBe('Play Born to Run');
        expect(off.listKey).toBe('list:PLM0aPYPhFzkrHWh8uoXwAsxdDXyFEEELt');
        expect(off.listText).toContain('Play the playlist here');
        expect(off.listText).toContain('list');
        expect(off.listImg).toBe(0);
    });

    test('nothing is asked before a click; a click asks the nocookie player once, right under the tile', async ({ page }) => {
        const log = await openPage(page, { sa_yt_stills: false });
        await mountTiles(page, [[V1, { title: 'Born to Run', dur: 270 }], [LIST, {}]]);
        // Before a click there is nothing in the page that could ask: no
        // frame, and (stills off) no picture.
        await expect(page.locator('#yt-test-box .mb-yt-tile')).toHaveCount(2);
        await expect(page.locator('#yt-test-box iframe, #yt-test-box img')).toHaveCount(0);
        expect(log.player, 'no player request before a click').toEqual([]);
        expect(log.stills, 'stills off: no picture request').toEqual([]);
        expect(log.youtube).toEqual([]);

        await tile(page, 0).click();
        const frame = page.locator('#yt-test-box .mb-yt-under iframe.mb-yt-frame');
        await expect(frame).toHaveCount(1);
        await expect(frame).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/Wu4_zVxmufY?autoplay=1');
        await expect(frame).toHaveAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen');
        await expect(frame).toHaveAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
        await expect(frame, 'the player needs its scripts').not.toHaveAttribute('sandbox');
        await expect(frame).toHaveAttribute('title', 'Born to Run');
        await expect.poll(() => log.player.length).toBe(1);
        expect(log.player[0]).toBe('https://www.youtube-nocookie.com/embed/Wu4_zVxmufY?autoplay=1');
        await expect(tile(page, 0)).toHaveAttribute('aria-pressed', 'true');
        const foot = page.locator('#yt-test-box .mb-yt-foot');
        await expect(foot).toContainText('Playing');
        await expect(foot).toContainText('Video Wu4_zVxmufY');
        await expect(foot.locator('a')).toHaveAttribute('href', 'https://www.youtube.com/watch?v=Wu4_zVxmufY');
        // The player sits right after the tile, inside the tile's own box.
        const after = await page.evaluate(() => {
            const t = document.querySelector('#yt-test-box .mb-yt-tile');
            return t.nextElementSibling && t.nextElementSibling.className;
        });
        expect(after).toBe('mb-yt-under');
        // As wide as its column, at most 640 px, 16:9 (decision 5).
        const box = await frame.boundingBox();
        expect(box.width).toBeLessThanOrEqual(640.5);
        expect(Math.abs(box.width / box.height - 16 / 9)).toBeLessThan(0.02);
        expect(log.youtube, 'youtube.com itself is never asked').toEqual([]);
    });

    test('one player at a time: a second tile stops the first; the playing tile clicked again stops it', async ({ page }) => {
        const log = await openPage(page, { sa_yt_stills: false });
        await mountTiles(page, [[V1, {}], [LIST, { title: 'A list' }]]);
        await tile(page, 0).click();
        await expect(page.locator('iframe.mb-yt-frame')).toHaveCount(1);
        await tile(page, 1).click();
        await expect(page.locator('iframe.mb-yt-frame')).toHaveCount(1);
        await expect(page.locator('iframe.mb-yt-frame'))
            .toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/videoseries?list=PLM0aPYPhFzkrHWh8uoXwAsxdDXyFEEELt&autoplay=1');
        await expect(tile(page, 0)).toHaveAttribute('aria-pressed', 'false');
        await expect(tile(page, 1)).toHaveAttribute('aria-pressed', 'true');
        expect(await page.evaluate(() => window.__saTest.ytPlaying())).toBe('list:PLM0aPYPhFzkrHWh8uoXwAsxdDXyFEEELt');
        await expect(page.locator('.mb-yt-foot')).toContainText('Playlist PLM0aPYPhFzkrHWh8uoXwAsxdDXyFEEELt');
        await tile(page, 1).click();
        await expect(page.locator('.mb-yt-player')).toHaveCount(0);
        expect(await page.evaluate(() => window.__saTest.ytPlaying())).toBeNull();
        expect(log.player.length).toBe(2);
    });

    test('Esc stops the player and nothing else sees it; the next Esc goes on; ■ Stop stops too', async ({ page }) => {
        await openPage(page, { sa_yt_stills: false });
        await mountTiles(page, [[V1, {}]]);
        await page.evaluate(() => {
            window.__escSeen = 0;
            document.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.__escSeen++; });
        });
        await tile(page, 0).click();
        await expect(page.locator('.mb-yt-player')).toHaveCount(1);
        await page.keyboard.press('Escape');
        await expect(page.locator('.mb-yt-player')).toHaveCount(0);
        expect(await page.evaluate(() => window.__escSeen), 'the Esc that stopped the player went no further').toBe(0);
        await expect(tile(page, 0)).toBeFocused();
        await page.keyboard.press('Escape');
        expect(await page.evaluate(() => window.__escSeen), 'with nothing playing, Esc is the page\'s again').toBe(1);

        // Enter on the focused tile plays (a <button>); ■ Stop stops.
        await tile(page, 0).focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('.mb-yt-player')).toHaveCount(1);
        await page.locator('.mb-yt-stop').click();
        await expect(page.locator('.mb-yt-player')).toHaveCount(0);
        await expect(tile(page, 0)).toBeFocused();
        await expect(tile(page, 0)).toHaveAttribute('aria-pressed', 'false');
    });

    test('in a table: a full-width row under the row; a re-render that empties the tbody stops it', async ({ page }) => {
        await openPage(page, { sa_yt_stills: false });
        await page.evaluate((href) => {
            const table = document.createElement('table');
            table.className = 'mb-yt-test-table';
            table.innerHTML = '<thead><tr><th>#</th><th>URL</th><th>Rel</th></tr></thead><tbody>' +
                `<tr data-n="1"><td>1</td><td><a href="${href}">link</a>${window.__saTest.ytTileHtml(href, {})}</td><td>x</td></tr>` +
                '<tr data-n="2"><td>2</td><td>other</td><td>y</td></tr></tbody>';
            (document.getElementById('content') || document.body).prepend(table);
        }, V2);
        const t = page.locator('table.mb-yt-test-table .mb-yt-tile');
        await t.click();
        const row = page.locator('table.mb-yt-test-table tbody > tr').nth(1);
        await expect(row).toHaveClass('mb-yt-playerrow');
        await expect(row.locator('td')).toHaveAttribute('colspan', '999');
        await expect(row.locator('iframe.mb-yt-frame')).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dJkaZ8hQM60?autoplay=1');
        await expect(page.locator('table.mb-yt-test-table tbody > tr').nth(2)).toHaveAttribute('data-n', '2');

        // What runFilter()/renderGroupedTable() do: empty the tbody, put
        // copies of the source rows back. The copy of the marked tile must not
        // stay marked once the player is gone.
        await page.evaluate(() => {
            const tb = document.querySelector('table.mb-yt-test-table tbody');
            const src = Array.from(tb.querySelectorAll('tr[data-n]'));
            tb.innerHTML = '';
            src.forEach(r => tb.appendChild(r.cloneNode(true)));
        });
        await expect.poll(() => page.evaluate(() => window.__saTest.ytPlaying())).toBeNull();
        await expect(page.locator('.mb-yt-player')).toHaveCount(0);
        await expect(page.locator('table.mb-yt-test-table .mb-yt-tile.mb-yt-playing')).toHaveCount(0);
        // The copy plays as the first did (one delegated handler, no listener on the tile).
        await page.locator('table.mb-yt-test-table .mb-yt-tile').click();
        await expect(page.locator('table.mb-yt-test-table tr.mb-yt-playerrow iframe')).toHaveCount(1);
    });

    test('stills on: one i.ytimg.com request per tile shown, none for a playlist', async ({ page }) => {
        const log = await openPage(page, { sa_yt_stills: true });
        await mountTiles(page, [[V1, { dur: 270 }], [V2, {}], [LIST, {}]]);
        await expect.poll(() => log.stills.slice().sort()).toEqual([
            'https://i.ytimg.com/vi/Wu4_zVxmufY/mqdefault.jpg',
            'https://i.ytimg.com/vi/dJkaZ8hQM60/mqdefault.jpg',
        ]);
        await expect(tile(page, 0).locator('.mb-yt-dur')).toHaveText('4:30');
        const img = tile(page, 0).locator('img');
        await expect(img).toHaveAttribute('loading', 'lazy');
        await expect(img).toHaveAttribute('referrerpolicy', 'no-referrer');
        await expect(tile(page, 2).locator('img'), 'a playlist has no id-based still').toHaveCount(0);
        expect(log.player, 'a still is no player request').toEqual([]);
    });

    test('a tile known dead: Unavailable, and a click asks nothing', async ({ page }) => {
        const log = await openPage(page, { sa_yt_stills: false });
        await mountTiles(page, [['https://www.youtube.com/watch?v=MLnTqKksftM', { title: 'Audience video', dead: true }]]);
        await expect(tile(page, 0)).toContainText('Not available on YouTube any more');
        await tile(page, 0).click();
        await expect(page.locator('.mb-yt-player .mb-yt-gone')).toHaveText('This video is not available on YouTube any more.');
        await expect(page.locator('.mb-yt-pill')).toHaveText('Unavailable');
        await expect(page.locator('iframe.mb-yt-frame'), 'no frame: nothing could ask the player').toHaveCount(0);
        expect(log.player).toEqual([]);
    });

    test('off: the shipping builder makes no tile at all', async ({ page }) => {
        await openPage(page, { sa_yt_play_in_place: false });
        expect(await page.evaluate((v) => window.__saTest.ytTileHtml(v, { title: 'x' }), V1)).toBe('');
        await expect(page.locator('#mb-yt-style'), 'no tile built: no style either').toHaveCount(0);
    });

    test('decision 6: a frame-policy refusal removes the player, opens YouTube in a new tab, and the tiles say so', async ({ page }) => {
        const log = await openPage(page, { sa_yt_stills: false });
        await mountTiles(page, [[V1, { title: 'Born to Run' }], [V2, {}]]);
        await tile(page, 0).click();
        await expect(page.locator('iframe.mb-yt-frame')).toHaveCount(1);
        const opened = page.context().waitForEvent('page', { timeout: 10000 });
        await page.evaluate(() => document.dispatchEvent(new SecurityPolicyViolationEvent('securitypolicyviolation', {
            blockedURI: 'https://www.youtube-nocookie.com/embed/Wu4_zVxmufY?autoplay=1',
            violatedDirective: 'frame-src', effectiveDirective: 'frame-src',
            originalPolicy: "frame-src 'self'", disposition: 'enforce', statusCode: 200,
        })));
        const tab = await opened;
        expect(tab.url()).toBe('https://www.youtube.com/watch?v=Wu4_zVxmufY');
        await tab.close();
        await expect(page.locator('.mb-yt-player')).toHaveCount(0);
        await expect(tile(page, 0)).toContainText('Opens on YouTube (new tab)');
        await expect(tile(page, 1)).toContainText('Opens on YouTube (new tab)');
        // From now on a tile opens the tab itself, no player.
        const second = page.context().waitForEvent('page', { timeout: 10000 });
        await tile(page, 1).click();
        const tab2 = await second;
        expect(tab2.url()).toBe('https://www.youtube.com/watch?v=dJkaZ8hQM60');
        await tab2.close();
        await expect(page.locator('.mb-yt-player')).toHaveCount(0);
        expect(log.player.length, 'only the first click reached the player').toBe(1);
    });
});

// ---------------------------------------------------------------------------
// Step 2 — MusicBrainz (decision 2): the Relationships URLs sub-table, the
// sidebar's "Play on YouTube", the annotation, the YouTube link's window.
//
// Host page: tests/fixtures/recording-youtube.html — recording
// 3e8d2331-3734-4f4b-b865-3313b7bf4303 ("I'll See You in My Dreams"), captured
// logged out by tests/support/capture-raw-page.js on 2026-10-28: one URL
// relationship and one sidebar link, both //www.youtube.com/watch?v=dJkaZ8hQM60.
// ---------------------------------------------------------------------------

const URL_REC = 'https://musicbrainz.org/recording/3e8d2331-3734-4f4b-b865-3313b7bf4303';
const REC_FIXTURE = path.join(__dirname, 'recording-youtube.html');
const REC_BUTTON = 'button[data-label="Show all Relationships for Recording"]';
const REC_VIDEO = '//www.youtube.com/watch?v=dJkaZ8hQM60';
const REC_OEMBED = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=dJkaZ8hQM60')}`;
const { waitForRenderComplete } = require('../support/browser');

/**
 * Loads the recording page, YouTube hosts answered locally and counted, the
 * Web Service's URL lookups answered 404 unless `ws2` holds them.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{settings?: Object, responses?: Object, ws2?: function(): Promise<void>, press?: boolean}} [opts]
 * @returns {Promise<{player: string[], stills: string[], youtube: string[]}>}
 */
async function openRecording(page, { settings = {}, responses = {}, ws2 = null, press = true } = {}) {
    const log = { player: [], stills: [], youtube: [] };
    const ctx = page.context();
    await ctx.route('https://www.youtube-nocookie.com/**', (route) => {
        log.player.push(route.request().url());
        return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>player</title><p>player</p>' });
    });
    await ctx.route('https://i.ytimg.com/**', (route) => {
        log.stills.push(route.request().url());
        return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    });
    await ctx.route(/^https:\/\/(?:www\.)?youtube\.com\//, (route) => {
        log.youtube.push(route.request().url());
        return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>YouTube</title>' });
    });
    await ctx.route(/\/ws\/2\/url[/?]/, async (route) => {
        if (ws2) await ws2();
        return route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"Not Found"}' });
    });
    await ctx.route('https://static.metabrainz.org/**', (route) => route.abort('blockedbyclient'));
    await ctx.addInitScript((r) => { window.__gmXhrResponses = r; }, responses);
    await loadUserscriptPage(page, {
        url: URL_REC, fixtureFile: REC_FIXTURE, testMode: true,
        settingsOverride: { sa_yt_play_in_place: true, sa_yt_stills: false, sa_sidebar_open_all: true, sa_rich_tooltip_delay_ms: 0, ...settings },
    });
    await page.waitForFunction(() => !!window.__saTest);
    if (press) {
        await page.click(REC_BUTTON);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        // The URLs sub-table may render collapsed: open it by its own h3.
        await page.evaluate((u) => {
            const a = document.querySelector(`table.tbl a[href="${u}"]`);
            const t = a && a.closest('table.tbl');
            if (!t || t.getClientRects().length) return;
            let h = t.previousElementSibling;
            while (h && !h.matches('h3.mb-toggle-h3')) h = h.previousElementSibling;
            if (h) h.click();
        }, REC_VIDEO);
    }
    return log;
}

const urlCell = (page) => page.locator(`table.tbl a[href="${REC_VIDEO}"]`).first().locator('xpath=ancestor::td[1]');

test.describe('YouTube in place — Step 2: MusicBrainz', () => {
    test('off (the fixture profile): no tile on the page, in the URLs table or the sidebar, no style', async ({ page }) => {
        await openRecording(page, { settings: { sa_yt_play_in_place: false } });
        await expect(urlCell(page)).toBeVisible();
        await expect(page.locator('.mb-yt-tile')).toHaveCount(0);
        await expect(page.locator('#mb-yt-style')).toHaveCount(0);
    });

    test('the sidebar: a small tile inside "Play on YouTube"\'s item, the link untouched; it plays under the tile', async ({ page }) => {
        const log = await openRecording(page, { press: false });
        const li = page.locator('#sidebar ul.external_links li').filter({ has: page.locator(`a[href="${REC_VIDEO}"]`) });
        await expect(li.locator('.mb-yt-tile.mb-yt-small')).toHaveCount(1);
        await expect(li.locator(':scope > a').first(), 'the link is neither moved nor rebuilt').toHaveAttribute('href', REC_VIDEO);
        await expect(li.locator('.mb-yt-tile')).toContainText('▶ Play');
        expect(log.player).toEqual([]);
        await li.locator('.mb-yt-tile').scrollIntoViewIfNeeded();
        await li.locator('.mb-yt-tile').click();
        await expect(li.locator('.mb-yt-under iframe.mb-yt-frame')).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dJkaZ8hQM60?autoplay=1');
        // Column width: never wider than the sidebar.
        const side = await page.locator('#sidebar').boundingBox();
        const frame = await li.locator('iframe.mb-yt-frame').boundingBox();
        expect(frame.width).toBeLessThanOrEqual(side.width + 0.5);
        await expect.poll(() => log.player.length).toBe(1);
    });

    test('the initial page: a tile after the "stream video for free" line; it plays in a row under the relationship', async ({ page }) => {
        const log = await openRecording(page, { press: false });
        const td = page.locator('#content table.details td').filter({ has: page.locator(`a[href="${REC_VIDEO}"]`) });
        const tile = td.locator(':scope > .mb-yt-tile');
        await expect(tile).toHaveCount(1);
        await expect(tile).toHaveAttribute('data-mb-yt', 'dJkaZ8hQM60');
        // After the line's <br>: the relationship's own line ("… [info]") is untouched.
        expect(await tile.evaluate(t => t.previousElementSibling && t.previousElementSibling.tagName)).toBe('BR');
        await expect(td).toContainText('[info]');
        expect(log.player).toEqual([]);
        await tile.click();
        const tr = td.locator('xpath=ancestor::tr[1]');
        const next = tr.locator('xpath=following-sibling::tr[1]');
        await expect(next).toHaveClass('mb-yt-playerrow');
        await expect(next.locator('iframe.mb-yt-frame')).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dJkaZ8hQM60?autoplay=1');
        await expect.poll(() => log.player.length).toBe(1);
        // A second run of the page pass adds nothing.
        await page.evaluate(() => window.__saTest.ytDecorateMbPage());
        await expect(td.locator('.mb-yt-tile')).toHaveCount(1);
    });

    test('the URLs sub-table: a tile under the link, built with the cell; it plays in a row under the row', async ({ page }) => {
        const log = await openRecording(page);
        const cell = urlCell(page);
        await expect(cell).toBeVisible();
        await expect(cell.locator('.mb-yt-tile')).toHaveCount(1);
        await expect(cell.locator('.mb-yt-tile')).toHaveAttribute('data-mb-yt', 'dJkaZ8hQM60');
        // The initial page's own tile (in the native list) was no line of
        // its own for the converter: one row, one tile, nowhere else.
        await expect(cell.locator('xpath=ancestor::table[1]').locator('tbody > tr')).toHaveCount(1);
        await expect(page.locator('table.tbl .mb-yt-tile')).toHaveCount(1);
        // The tile follows the link (and its [info]); the link is unchanged.
        expect(await cell.evaluate(td => td.lastElementChild.matches('.mb-yt-tile'))).toBe(true);
        expect(log.player).toEqual([]);
        await cell.locator('.mb-yt-tile').click();
        const tr = cell.locator('xpath=ancestor::tr[1]');
        const next = tr.locator('xpath=following-sibling::tr[1]');
        await expect(next).toHaveClass('mb-yt-playerrow');
        await expect(next.locator('iframe.mb-yt-frame')).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dJkaZ8hQM60?autoplay=1');
        await expect.poll(() => log.player.length).toBe(1);
    });

    test('the tile is out of every filter; a re-render stops the player and the re-rendered tile plays again', async ({ page }) => {
        await openRecording(page);
        const cell = urlCell(page);
        await expect(cell.locator('.mb-yt-tile')).toHaveCount(1);
        const text = await page.evaluate((u) => {
            const td = document.querySelector(`table.tbl a[href="${u}"]`).closest('td');
            return { clean: td.innerText };
        }, REC_VIDEO);
        expect(text.clean, 'the tile is in the cell').toContain('Play here');
        await cell.locator('.mb-yt-tile').click();
        await expect(page.locator('tr.mb-yt-playerrow')).toHaveCount(1);

        // A global filter for the tile's own words finds nothing: its text is
        // stripped from every match (_CLEAN_STRIP_SEL).
        const gf = page.locator('#mb-global-filter-wrapper input').first();
        await gf.fill('Play here');
        await expect.poll(() => page.locator(`table.tbl a[href="${REC_VIDEO}"]`).count()).toBe(0);
        await expect(page.locator('tr.mb-yt-playerrow'), 'the re-render emptied the tbody, the player with it').toHaveCount(0);
        expect(await page.evaluate(() => window.__saTest.ytPlaying())).toBeNull();

        // A filter for the link itself brings the row back, its tile unmarked and playable.
        await gf.fill('dJkaZ8hQM60');
        await expect(urlCell(page).locator('.mb-yt-tile')).toBeVisible();
        await expect(urlCell(page).locator('.mb-yt-tile')).toHaveAttribute('aria-pressed', 'false');
        await urlCell(page).locator('.mb-yt-tile').click();
        await expect(page.locator('tr.mb-yt-playerrow iframe.mb-yt-frame')).toHaveCount(1);
    });

    test('the window (Space): the tile in its left column plays in the window, and keeps playing through a repaint', async ({ page }) => {
        let release;
        const held = new Promise(r => { release = r; });
        const log = await openRecording(page, {
            settings: { sa_pop_ext: true, sa_pop_ext_favicons: false },
            responses: {
                [REC_OEMBED]: {
                    status: 200, responseHeaders: 'Content-Type: application/json',
                    responseText: JSON.stringify({
                        type: 'video', title: "Bruce Springsteen - I'll See You In My Dreams (Lyric Video)", author_name: 'Bruce Springsteen',
                        thumbnail_url: 'https://i.ytimg.com/vi/dJkaZ8hQM60/hqdefault.jpg',
                    }),
                },
            },
            ws2: () => held,
        });
        const link = page.locator(`table.tbl a[href="${REC_VIDEO}"]`).first();
        await page.mouse.move(0, 0);
        await link.scrollIntoViewIfNeeded();
        await page.keyboard.down('Control');
        await link.hover();
        await page.keyboard.up('Control');
        await expect(page.locator('#mb-dp-peek')).toContainText('I\'ll See You In My Dreams');
        await page.keyboard.press('Space');
        const d = page.locator('#mb-dp-dialog');
        const wTile = d.locator('.mb-yt-win .mb-yt-tile');
        await expect(wTile).toContainText('I\'ll See You In My Dreams (Lyric Video)');
        await expect(d.locator('img.mb-dp-xcover'), 'the tile takes the thumbnail\'s place').toHaveCount(0);
        await wTile.click();
        const frame = d.locator('.mb-yt-under iframe.mb-yt-frame');
        await expect(frame).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dJkaZ8hQM60?autoplay=1');
        await frame.evaluate(f => { f.__ytMark = 1; });

        // The window's "MusicBrainz knows this URL" answer arrives: a repaint.
        release();
        await expect(d).toContainText(/not in MusicBrainz|MusicBrainz/);
        await expect.poll(() => d.locator('.mb-yt-under iframe.mb-yt-frame').evaluate(f => f.__ytMark || 0)).toBe(1);
        await expect(d.locator('.mb-yt-win .mb-yt-tile')).toHaveAttribute('aria-pressed', 'true');
        // The harness's Chromium has moveBefore() (151 on 2026-10-28), which
        // keeps the frame playing; a browser without it reloads the frame.
        expect(await page.evaluate(() => typeof Element.prototype.moveBefore)).toBe('function');
        expect(log.player.length, 'moveBefore() kept the frame: no second request').toBe(1);

        // Esc stops the player first; the window stays; the next Esc closes it.
        await page.keyboard.press('Escape');
        await expect(d.locator('.mb-yt-player')).toHaveCount(0);
        await expect(d).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(d).toBeHidden();
    });

    test('a video YouTube no longer has: the window\'s tile says so at once, and asks nothing', async ({ page }) => {
        const log = await openRecording(page, {
            settings: { sa_pop_ext: true, sa_pop_ext_favicons: false },
            responses: { [REC_OEMBED]: { status: 404, responseHeaders: 'Content-Type: text/html', responseText: 'Not Found' } },
        });
        const link = page.locator(`table.tbl a[href="${REC_VIDEO}"]`).first();
        await page.mouse.move(0, 0);
        await link.scrollIntoViewIfNeeded();
        await page.keyboard.down('Control');
        await link.hover();
        await page.keyboard.up('Control');
        await expect(page.locator('#mb-dp-peek')).toContainText('YouTube does not show this video');
        await page.keyboard.press('Space');
        const wTile = page.locator('#mb-dp-dialog .mb-yt-win .mb-yt-tile');
        await expect(wTile).toHaveClass(/mb-yt-dead/);
        await expect(wTile).toContainText('Not available on YouTube any more');
        await wTile.click();
        await expect(page.locator('#mb-dp-dialog .mb-yt-pill')).toHaveText('Unavailable');
        expect(log.player).toEqual([]);
    });

    test('the annotation: a tile after the heading that holds a YouTube link, the heading\'s text unchanged', async ({ page }) => {
        await openPage(page, { sa_yt_stills: false });
        const h2 = page.locator('.annotation-body h2').filter({ has: page.locator('a[href*="youtube.com/playlist"]') });
        await expect(h2).toHaveText('YouTube Playlist');
        const after = h2.locator('xpath=following-sibling::*[1]');
        await expect(after).toHaveClass(/mb-yt-tile/);
        await expect(after).toHaveAttribute('data-mb-yt', 'list:PLM0aPYPhFzkrHWh8uoXwAsxdDXyFEEELt');
        await expect(after, 'the link\'s own words name the tile').toContainText('YouTube Playlist');
        await expect(after).toContainText('Play the playlist here');
    });

    test('an Annotation cell (ytTiles): a tile after each YouTube link, idempotent', async ({ page }) => {
        await openPage(page, { sa_yt_stills: false });
        const r = await page.evaluate(() => {
            const td = document.createElement('td');
            td.innerHTML = '<p>See <a href="https://youtu.be/MLnTqKksftM">this video</a> and <a href="/artist/x">an artist</a>.</p>';
            window.__saTest.ytTilesExtract(td);
            window.__saTest.ytTilesExtract(td);
            const tiles = td.querySelectorAll('.mb-yt-tile');
            return { n: tiles.length, prev: tiles[0] && tiles[0].previousElementSibling.textContent, key: tiles[0] && tiles[0].dataset.mbYt };
        });
        expect(r).toEqual({ n: 1, prev: 'this video', key: 'MLnTqKksftM' });
    });
});

// ---------------------------------------------------------------------------
// Step 3 — Discogs (decisions 3, 6): the release window's Videos, the master
// window's (the master reader reads videos since record version 5), and a
// "Videos" sub-table on the release page. The frame-policy fallback itself is
// Step 1's last test.
//
// Answers: tests/fixtures/ext-discogs-release.json (release 1874253, three
// videos: Wu4_zVxmufY "Born to Run" 4:30, x1gMfIsi5Dk, VO-n2EFK6sM) and
// ext-discogs-master.json (master 26725, three videos).
// ---------------------------------------------------------------------------

const fs = require('fs');
const DG_FX = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, `ext-${name}.json`), 'utf8'));
const dgAnswers = (...names) => Object.fromEntries(names.map((n) => {
    const f = DG_FX(n);
    return [f.url, { status: f.status, responseHeaders: `Content-Type: ${f.contentType}`, responseText: f.body }];
}));
const DG_RELEASE_VIDEOS = JSON.parse(DG_FX('discogs-release').body).videos;
const DG_MASTER_VIDEOS = JSON.parse(DG_FX('discogs-master').body).videos;

/**
 * Opens a Discogs link's window from the event page: the link is added to
 * the annotation, hovered with Ctrl, then pinned with Space.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} href
 * @returns {Promise<import('@playwright/test').Locator>} The dialog.
 */
async function openDgWindow(page, href) {
    await page.evaluate((h) => {
        const host = document.querySelector('.annotation .annotation-body') || document.querySelector('.annotation');
        const p = document.createElement('p');
        p.className = 'dg-probe';
        p.innerHTML = `<a href="${h}" rel="nofollow">a Discogs link</a>`;
        host.insertBefore(p, host.firstChild);
    }, href);
    const a = page.locator('.dg-probe a');
    if (!await a.isVisible()) await page.locator('.annotation h2').first().click();
    await page.mouse.move(0, 0);
    await a.scrollIntoViewIfNeeded();
    await page.keyboard.down('Control');
    await a.hover();
    await page.keyboard.up('Control');
    await expect(page.locator('#mb-dp-peek')).toBeVisible();
    await page.keyboard.press('Space');
    const d = page.locator('#mb-dp-dialog');
    await expect(d).toBeVisible();
    return d;
}

test.describe('YouTube in place — Step 3: Discogs', () => {
    test('the release window: a small tile per video, the player in the slot above the list', async ({ page }) => {
        expect(DG_RELEASE_VIDEOS.length, 'the capture carries the videos').toBe(3);
        const log = await openPage(page, { sa_pop_ext: true, sa_pop_ext_favicons: false, sa_rich_tooltip_delay_ms: 0 },
            dgAnswers('discogs-release', 'discogs-master', 'discogs-master-versions-p1'));
        const d = await openDgWindow(page, 'https://www.discogs.com/release/1874253-Bruce-Springsteen-Born-To-Run');
        const sec = d.locator('[data-mb-dg-sec="videos"]');
        await expect(sec.locator('.mb-dg-xh')).toHaveText('Videos 3');
        const tiles = sec.locator('.mb-yt-tile.mb-yt-small');
        await expect(tiles).toHaveCount(3);
        await expect(tiles.first()).toHaveAttribute('data-mb-yt', 'Wu4_zVxmufY');
        await expect(sec.locator('.mb-yt-row').first()).toContainText('4:30');
        // The slot is the list's first child, empty until a click.
        const lines = sec.locator('[data-mb-yt-slots]');
        await expect(lines.locator(':scope > .mb-yt-slot')).toHaveCount(1);
        expect(await lines.evaluate(l => l.firstElementChild.className)).toBe('mb-yt-slot');
        await expect(lines.locator('.mb-yt-slot iframe')).toHaveCount(0);
        expect(log.player).toEqual([]);

        // Three aligned columns (vzell, 2026-10-28): every tile starts at
        // one x, every title at one x (right of the widest tile), every
        // length ends at one x — the second video has none, its cell is
        // there all the same.
        const cols = await lines.locator('.mb-yt-row').evaluateAll(rs => rs.map((r) => {
            const [a, b, c] = Array.from(r.children).map(e => e.getBoundingClientRect());
            return { tileL: a.left, tileR: a.right, linkL: b.left, linkR: b.right, lenL: c.left, lenR: c.right, n: r.children.length };
        }));
        expect(cols.map(c => c.n)).toEqual([3, 3, 3]);
        const same = (k) => cols.every(c => Math.abs(c[k] - cols[0][k]) < 0.5);
        expect(same('tileL'), 'tiles in one column').toBe(true);
        expect(same('linkL'), 'titles in one column').toBe(true);
        expect(same('lenR'), 'lengths in one column').toBe(true);
        expect(cols[0].linkL).toBeGreaterThan(Math.max(...cols.map(c => c.tileR)));
        expect(cols[0].lenL, 'the length is not glued to the title').toBeGreaterThan(cols[0].linkR);
        await expect(sec.locator('.mb-yt-len')).toHaveText(['4:30', '', '4:31']);

        const rowsBefore = await lines.locator('.mb-yt-row').evaluateAll(rs => rs.map(r => r.textContent));
        await tiles.nth(1).click();
        await expect(lines.locator('.mb-yt-slot iframe.mb-yt-frame')).toHaveAttribute('src', /\/embed\/x1gMfIsi5Dk\?autoplay=1$/);
        // The list itself is as it was: same lines, same order, no player among them.
        expect(await lines.locator('.mb-yt-row').evaluateAll(rs => rs.map(r => r.textContent))).toEqual(rowsBefore);
        await expect(lines.locator('.mb-yt-row .mb-yt-player')).toHaveCount(0);
        // Another tile of the same list: the same slot, one player.
        await tiles.nth(0).click();
        await expect(lines.locator('iframe.mb-yt-frame')).toHaveCount(1);
        await expect(lines.locator('.mb-yt-slot iframe.mb-yt-frame')).toHaveAttribute('src', /\/embed\/Wu4_zVxmufY\?autoplay=1$/);
        await expect.poll(() => log.player.length).toBe(2);
    });

    test('the window: the PLAYING pill holds its own text, and each title\'s text starts clear of its tile', async ({ page }) => {
        // vzell, 2026-10-29 (a Discogs master window, screenshot): "PLAYING"
        // overlapped "Video <id>", and the titles sat right against their
        // tiles. The window's `.mb-dg-lines > div` rule (padding-left: 1em;
        // text-indent: -1em) reached the Videos list's slot and rows, and
        // text-indent is inherited: each text started 1em left of its box.
        // Boxes alone cannot see that, so this measures the TEXT (a Range).
        await openPage(page, { sa_pop_ext: true, sa_pop_ext_favicons: false, sa_rich_tooltip_delay_ms: 0 },
            dgAnswers('discogs-release', 'discogs-master', 'discogs-master-versions-p1'));
        const d = await openDgWindow(page, 'https://www.discogs.com/release/1874253-Bruce-Springsteen-Born-To-Run');
        const sec = d.locator('[data-mb-dg-sec="videos"]');
        await sec.locator('.mb-yt-tile.mb-yt-small').first().click();
        await expect(sec.locator('.mb-yt-slot iframe.mb-yt-frame')).toHaveCount(1);
        // The window repaints around a click: measure once the foot is there,
        // and in ONE task that finds the section itself. `sec.evaluate()`
        // resolves the section, then runs a step later; a repaint in between
        // (`_ytAreaRepaint()` moves the player into the NEW section) left it
        // measuring the detached old one, whose slot is empty but whose tile
        // still reads "playing" (2026-10-31: about 1 run in 40; a probe found
        // the one live player in the one live section's slot, foot and all).
        await expect(sec.locator('.mb-yt-foot .mb-yt-pill')).toBeVisible();
        const m = await page.evaluate(() => {
            const s = document.querySelector('#mb-dp-dialog [data-mb-dg-sec="videos"]');
            const textBox = (el) => {
                const r = document.createRange();
                r.selectNodeContents(el);
                return r.getBoundingClientRect();
            };
            const pill = s.querySelector('.mb-yt-foot .mb-yt-pill');
            const grow = s.querySelector('.mb-yt-foot .mb-yt-grow');
            if (!pill || !grow) return { missing: s.innerHTML.slice(0, 600) };
            const p = pill.getBoundingClientRect();
            const rows = Array.from(s.querySelectorAll('.mb-yt-row')).map((r) => {
                const tileEl = r.querySelector('.mb-yt-tile, .mb-yt-notile');
                if (!tileEl) return { gap: 'no tile: ' + r.outerHTML.slice(0, 200) };
                const tile = tileEl.getBoundingClientRect();
                const a = r.querySelector('a');
                return { gap: textBox(a).left - tile.right };
            });
            return {
                pillTextL: textBox(pill).left - p.left,
                pillTextR: p.right - textBox(pill).right,
                growTextL: textBox(grow).left - p.right,
                indent: getComputedStyle(grow).textIndent,
                rows,
            };
        });
        expect(m.missing, 'the player foot is in the section').toBeUndefined();
        expect(m.indent).toBe('0px');
        expect(m.pillTextL, '"Playing" starts inside its pill').toBeGreaterThanOrEqual(2);
        expect(m.pillTextR, '"Playing" ends inside its pill').toBeGreaterThanOrEqual(2);
        expect(m.growTextL, '"Video <id>" starts right of the pill').toBeGreaterThanOrEqual(8);
        m.rows.forEach((r, i) => expect(r.gap, `title ${i + 1}'s text starts clear of its tile`).toBeGreaterThanOrEqual(14));
    });

    test('the master window: its videos too (record version 5), with tiles', async ({ page }) => {
        expect(DG_MASTER_VIDEOS.length, 'the capture carries the videos').toBeGreaterThan(0);
        await openPage(page, { sa_pop_ext: true, sa_pop_ext_favicons: false, sa_rich_tooltip_delay_ms: 0 },
            dgAnswers('discogs-master', 'discogs-master-versions-p1'));
        const d = await openDgWindow(page, 'https://www.discogs.com/master/26725-Bruce-Springsteen-Born-To-Run');
        const sec = d.locator('[data-mb-dg-sec="videos"]');
        await expect(sec.locator('.mb-dg-xh')).toHaveText(`Videos ${DG_MASTER_VIDEOS.length}`);
        await expect(sec.locator('.mb-yt-tile')).toHaveCount(DG_MASTER_VIDEOS.filter(v => /youtu/.test(v.uri)).length);
    });

    test('the window with play-in-place off: the Videos section as it always was', async ({ page }) => {
        await openPage(page, { sa_yt_play_in_place: false, sa_pop_ext: true, sa_pop_ext_favicons: false, sa_rich_tooltip_delay_ms: 0 },
            dgAnswers('discogs-release', 'discogs-master', 'discogs-master-versions-p1'));
        const d = await openDgWindow(page, 'https://www.discogs.com/release/1874253-Bruce-Springsteen-Born-To-Run');
        const sec = d.locator('[data-mb-dg-sec="videos"]');
        await expect(sec.locator('.mb-dg-xh')).toHaveText('Videos 3');
        await expect(sec.locator('.mb-yt-tile, .mb-yt-slot, [data-mb-yt-slots], .mb-yt-row')).toHaveCount(0);
        await expect(sec.locator('.mb-dg-lines > div > a')).toHaveCount(3);
    });

    test('the release page: a Videos sub-table, Play first; a tile plays in a row under its row', async ({ page }) => {
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
        await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
        await page.route('https://i.discogs.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
        const player = [];
        await page.route('https://www.youtube-nocookie.com/**', (route) => {
            player.push(route.request().url());
            return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>player</title>' });
        });
        await page.context().addInitScript((r) => { window.__gmXhrResponses = r; },
            dgAnswers('discogs-release', ...[1, 2, 3, 4].map(p => `discogs-master-versions-p${p}`)));
        await loadUserscriptPage(page, {
            url: 'https://www.discogs.com/release/1874253-Bruce-Springsteen-Born-To-Run',
            fixtureFile: path.join(__dirname, 'dg-release.html'),
            testMode: true,
            settingsOverride: {
                sa_enable_discogs: true, sa_pop_ext_discogs_token: 'tok-probe', sa_render_threshold: 100000,
                sa_yt_play_in_place: true, sa_yt_stills: false,
            },
        });
        await page.locator('#mb-dg-root button[data-label="Show tracklist, credits and other versions"]').click();
        await waitForRenderComplete(page, { waitForAutoResize: false });
        // The heading carries its toggle and count around the name.
        const h3 = page.locator('#mb-dg-root h3').filter({ hasText: 'Videos' });
        await expect(h3).toHaveCount(1);
        if (!await page.locator('#mb-dg-root td.mb-dg-playcell').first().isVisible()) await h3.click();
        const table = page.locator('#mb-dg-root table.tbl').filter({ has: page.locator('td.mb-dg-playcell') });
        const heads = await table.locator('thead th').evaluateAll(ths => ths.map(th => (th.dataset.colName || th.textContent).trim()));
        expect(heads.slice(0, 4).map(h => h.split(/\s/)[0])).toEqual(['Play', 'Title', 'Length', 'URL']);
        await expect(table.locator('tbody .mb-yt-tile.mb-yt-bare')).toHaveCount(3);
        const first = table.locator('tbody > tr').first();
        await expect(first).toContainText('4:30');
        await expect(first.locator('a[href="https://www.youtube.com/watch?v=Wu4_zVxmufY"]')).toHaveText('youtube.com/watch?v=Wu4_zVxmufY');
        expect(player).toEqual([]);
        await first.locator('.mb-yt-tile').click();
        const next = first.locator('xpath=following-sibling::tr[1]');
        await expect(next).toHaveClass('mb-yt-playerrow');
        await expect(next.locator('iframe.mb-yt-frame')).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/Wu4_zVxmufY?autoplay=1');
        await expect.poll(() => player.length).toBe(1);
        expect(errors).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// Step 4 — Brucebase: the entry window's Media section (`_bbMediaSection()`),
// tiles after the YouTube links of its sections (`data.ytTiles`, decorated at
// render by `_ytDecorateHtml()`), and the Live page's `videoseries` link (in
// detail-preview.spec.js, beside the embed → link pins).
//
// Page: tests/fixtures/detail-bb-gig-2026-10-03.html
// (scripts/build-bb-youtube-gig-fixture.py from debug/bb-event-youtube.html):
// the Media tab is one playlist player, the Recording tab links MLnTqKksftM.
// ---------------------------------------------------------------------------

const { loadBbYearPage, BB_YEAR_BUTTON } = require('../support/bbFixture');
const { routeDetailPages } = require('../support/detailFixture');
const GIG_YT = 'https://brucebase.wikidot.com/gig:2026-10-03-merriweather-post-pavilion-columbia-md';

test.describe('YouTube in place — Step 4: Brucebase', () => {
    test('the reader: a Media section from the playlist player, Media counted on the page, the record marked for tiles', async ({ page }) => {
        await loadBbYearPage(page, '2026');
        const html = fs.readFileSync(path.join(__dirname, 'detail-bb-gig-2026-10-03.html'), 'utf8');
        const rec = await page.evaluate(([h, u]) => window.__saTest.dpParse('brucebase.wikidot.com', h, u), [html, GIG_YT]);
        const labels = rec.sections.map(s => s.label);
        expect(labels).toContain('Media');
        const at = (l) => labels.indexOf(l);
        expect(at('Recording'), 'the fixture\'s Recording tab has its text').toBeGreaterThan(-1);
        expect(at('Media'), 'the page\'s own order').toBeLessThan(at('Recording'));
        const media = rec.sections.find(s => s.label === 'Media');
        expect(media.html).toContain('href="https://www.youtube.com/playlist?list=PLTejJhB5zqTA"');
        expect(media.html, 'never a video named videoseries').not.toContain('videoseries');
        expect(media.html, 'the player itself is never in the window').not.toContain('<iframe');
        expect(Object.fromEntries(rec.fields)['On the page'].split(' · '), 'a tab that is only a player is content').toContain('Media');
        expect(rec.ytTiles).toBe(true);
        expect(rec.sections.map(s => s.html).join(''), 'the cached record carries no tile').not.toContain('mb-yt-tile');
    });

    test('the window: a tile after the Media playlist and after the Recording link; the playlist plays in the section', async ({ page }) => {
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
        await loadBbYearPage(page, '2026', {
            settingsOverride: { sa_render_threshold: 100000, sa_yt_play_in_place: true, sa_yt_stills: false, sa_rich_tooltip_delay_ms: 0 },
        });
        await routeDetailPages(page, 'bb');
        await page.route(/^https:\/\/brucebase\.wdfiles\.com\//, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
        const player = [];
        await page.route('https://www.youtube-nocookie.com/**', (route) => {
            player.push(route.request().url());
            return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>player</title>' });
        });
        await page.click(`button[data-label="${BB_YEAR_BUTTON}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const link = page.locator(`table.tbl tbody a.mb-bb-event-link[href="${GIG_YT}"]`).first();
        await page.mouse.move(0, 0);
        await link.scrollIntoViewIfNeeded();
        await page.keyboard.down('Control');
        await link.hover();
        await page.keyboard.up('Control');
        await expect(page.locator('#mb-dp-peek')).toContainText('Merriweather Post Pavilion');
        await page.keyboard.press('Space');
        const d = page.locator('#mb-dp-dialog');
        const media = d.locator('details.mb-dp-sec[data-mb-dp-sec="Media"]');
        await expect(media).toHaveCount(1);
        if (!await media.evaluate(x => x.open)) await media.locator('summary').click();
        const listTile = media.locator('.mb-yt-tile');
        await expect(listTile).toHaveCount(1);
        await expect(listTile).toHaveAttribute('data-mb-yt', 'list:PLTejJhB5zqTA');
        await expect(listTile).toContainText('Play the playlist here');
        const rec = d.locator('details.mb-dp-sec[data-mb-dp-sec="Recording"]');
        await expect(rec.locator('.mb-yt-tile[data-mb-yt="MLnTqKksftM"]')).toHaveCount(1);
        // Not a video: the wiki's YouTube channel and a news article about YouTube get none.
        await expect(d.locator('.mb-yt-tile')).toHaveCount(2);
        expect(player, 'nothing asked before a click').toEqual([]);

        await listTile.click();
        await expect(media.locator('.mb-yt-under iframe.mb-yt-frame'))
            .toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/videoseries?list=PLTejJhB5zqTA&autoplay=1');
        await expect.poll(() => player.length).toBe(1);
        // Esc: the player first, the window stays.
        await page.keyboard.press('Escape');
        await expect(d.locator('.mb-yt-player')).toHaveCount(0);
        await expect(d).toBeVisible();
        expect(errors).toEqual([]);
    });

    test('off: the window\'s sections carry no tile; the Media section is there all the same', async ({ page }) => {
        await loadBbYearPage(page, '2026', { settingsOverride: { sa_render_threshold: 100000, sa_rich_tooltip_delay_ms: 0 } });
        await routeDetailPages(page, 'bb');
        await page.route(/^https:\/\/brucebase\.wdfiles\.com\//, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
        await page.click(`button[data-label="${BB_YEAR_BUTTON}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const link = page.locator(`table.tbl tbody a.mb-bb-event-link[href="${GIG_YT}"]`).first();
        await page.mouse.move(0, 0);
        await link.scrollIntoViewIfNeeded();
        await page.keyboard.down('Control');
        await link.hover();
        await page.keyboard.up('Control');
        await expect(page.locator('#mb-dp-peek')).toContainText('Merriweather Post Pavilion');
        await page.keyboard.press('Space');
        const d = page.locator('#mb-dp-dialog');
        await expect(d.locator('details.mb-dp-sec[data-mb-dp-sec="Media"]')).toHaveCount(1);
        await expect(d.locator('.mb-yt-tile')).toHaveCount(0);
    });
});
