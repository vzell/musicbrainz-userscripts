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
 * @returns {Promise<{player: string[], stills: string[], youtube: string[]}>}
 */
async function openPage(page, settings = {}) {
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
