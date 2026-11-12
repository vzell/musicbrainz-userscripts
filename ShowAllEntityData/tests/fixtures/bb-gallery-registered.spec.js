'use strict';

// Brucebase stats pages, Phase 13 batch 3 (org/brucebase.org): a discography
// (`bb-gallery`, `stats:discography-*`: a row per entry of the page — Year,
// Release, Subtitle, Cover with the image card and the viewer, Released in
// ISO with its date parts, Label, the Section on a page with several, the
// cover strip's Tab; vzell's answer: the entries, not the strip, which is
// the same 203 covers on every discography page) and the songs registered
// at the Library of Congress (`bb-registered`: Title, Song page from
// stats:songs, one request; the registration record above). Fixtures:
// scripts/build-bb-stats-fixtures.py; the galleries read whole first
// (scripts/check-bb-galleries.js). docs/claude/brucebase.md, "Stats pages".

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadBbStatsPage, bbStatsFixture } = require('../support/bbFixture');
const { waitForRenderComplete } = require('../support/browser');

const RELEASES = 'Show the releases';
const SONGS = 'Show the songs';

/**
 * Presses a button and waits for the render.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} label
 * @returns {Promise<void>}
 */
async function press(page, label) {
    await page.click(`button[data-label="${label}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/**
 * The fixture's entries read with a plain DOM: every paragraph outside a
 * tabview whose bold part starts with a year and holds a link, as [year,
 * href, title, the h1 before it (its small print dropped)]; and the cover
 * strip's tab per release.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 * @returns {Promise<{entries: Array<[string, string, string, string]>, tabs: Object<string, string>}>}
 */
function fixtureEntries(page, name) {
    const html = fs.readFileSync(bbStatsFixture(name).file, 'utf8');
    return page.evaluate((h) => {
        const d = new DOMParser().parseFromString(h, 'text/html');
        const root = d.getElementById('page-content');
        const tabs = {};
        root.querySelectorAll('.yui-navset').forEach((nav) => {
            const labels = Array.from(nav.querySelectorAll(':scope > ul.yui-nav > li'), li => li.textContent.trim());
            Array.from(nav.querySelectorAll(':scope > .yui-content > div')).forEach((panel, i) => {
                panel.querySelectorAll('a[href] > img').forEach((img) => {
                    const href = `https://brucebase.wikidot.com${img.parentElement.getAttribute('href')}`;
                    if (!(href in tabs)) tabs[href] = labels[i];
                });
            });
        });
        const entries = [];
        let section = '';
        root.querySelectorAll('h1, p').forEach((el) => {
            if (el.tagName === 'H1') {
                const c = el.cloneNode(true);
                c.querySelectorAll('sup').forEach(x => x.remove());
                section = c.textContent.replace(/\s+/g, ' ').trim();
                return;
            }
            if (el.closest('.yui-navset')) return;
            const s = el.querySelector(':scope > strong');
            const a = s && s.querySelector('a[href]');
            if (!a || !/^\d{4}/.test(s.textContent.trim())) return;
            entries.push([s.textContent.trim().slice(0, 4), `https://brucebase.wikidot.com${a.getAttribute('href')}`, a.textContent.replace(/\s+/g, ' ').trim(), section]);
        });
        return { entries, tabs };
    }, html);
}

/**
 * The single table: headers, rows as cell texts, and per row the Release
 * link, the covers' links and thumbnails, the Released hover text.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{headers: string[], rows: Array<Object<string, *>>}>}
 */
function galleryTable(page) {
    return page.evaluate(() => {
        const t = document.querySelector('table.tbl');
        const headers = Array.from(t.tHead.rows[0].cells, c => c.dataset.colName || c.textContent.trim());
        const at = name => headers.indexOf(name);
        return {
            headers,
            rows: Array.from(t.tBodies[0].rows, (tr) => {
                const r = {};
                headers.forEach((h, i) => { r[h] = (tr.cells[i]?.textContent || '').replace(/\s+/g, ' ').trim(); });
                const rel = tr.cells[at('Release')];
                r._href = rel.querySelector('a') ? rel.querySelector('a').getAttribute('href') : '';
                r._tip = rel.querySelector('[data-mb-tip]') ? rel.querySelector('[data-mb-tip]').getAttribute('title') : '';
                r._covers = Array.from(tr.cells[at('Cover')].querySelectorAll('a.mb-bb-cover'), a => [a.getAttribute('href'), a.querySelector('img').getAttribute('src')]);
                const rd = tr.cells[at('Released')].querySelector('[data-mb-tip]');
                r._released = rd ? rd.getAttribute('title') : '';
                return r;
            }),
        };
    });
}

/** Requests to the wiki itself (pages, AJAX); the covers on wdfiles.com are the page's own pictures. */
const wikiRequests = reqs => reqs.filter(u => /^https?:\/\/brucebase\.wikidot\.com\//.test(u));

test.describe('Brucebase discographies (Phase 13, batch 3)', () => {
    test('a row per entry, not the strip: Year, Release, Subtitle, Cover, Released (ISO), Label, Tab; no request', async ({ page }) => {
        const { requests } = await loadBbStatsPage(page, 'discography-album');
        const fx = await fixtureEntries(page, 'discography-album');
        await expect(page.locator('button[data-label="Show the list"], button[data-label="Show the tables"]'), 'not bb-stats').toHaveCount(0);
        await press(page, RELEASES);
        await expect(page.locator('h2.mb-bb-gallery-heading')).toHaveText(/^▼?Releases/);
        const { headers, rows } = await galleryTable(page);
        expect(headers.slice(0, 7)).toEqual(['Year', 'Release', 'Subtitle', 'Cover', 'Released', 'Label', 'Tab']);
        expect(headers, 'the release date split into its parts').toEqual(expect.arrayContaining(['DD', 'MM', 'YYYY']));
        expect(headers, 'one section: no Section column').not.toContain('Section');
        expect(fx.entries.length).toBeGreaterThan(100);
        expect(Object.keys(fx.tabs).length, 'the strip is not the rows').toBeGreaterThan(fx.entries.length);
        expect(rows.map(r => [r.Year, r._href, r.Release])).toEqual(fx.entries.map(x => [x[0], x[1], x[2]]));
        expect(rows.map(r => r.Tab)).toEqual(fx.entries.map(x => fx.tabs[x[1]] || ''));
        const n82 = rows[0];
        expect([n82.Release, n82.Subtitle, n82.Released, n82.Label]).toEqual(['Nebraska \'82', 'Expanded Edition', '2025-10-17', 'Columbia']);
        expect(n82._released).toContain('October 17, 2025');
        // The cover: the wiki's thumbnail, linking its full image.
        expect(n82._covers).toEqual([[
            'https://brucebase.wdfiles.com/local--files/files:artwork-disco/disco_nebraska-82.jpg',
            'https://brucebase.wdfiles.com/local--resized-images/files:artwork-disco/disco_nebraska-82.jpg/thumbnail.jpg',
        ]]);
        expect(rows.every(r => r._covers.length > 0), 'every entry has a cover').toBe(true);
        // "Released: …" and "Label: …" outside a paragraph (a wiki slip) are read too.
        const ham = rows.find(r => r.Release === 'Hammersmith Odeon London \'75');
        expect([ham.Released, ham.Label]).toEqual(['2006-02-28', 'Columbia']);
        expect(wikiRequests(requests), 'read from the page itself').toEqual([]);
        await expect(page.locator('h2.mb-bb-native-h2')).toHaveText(/Brucebase page/);
    });

    test('a cover: its full image in the card, a click the viewer, Shift+→ the next row\'s; no request', async ({ page }) => {
        const { requests } = await loadBbStatsPage(page, 'discography-album', { settingsOverride: { sa_bb_tip_images: true, sa_rich_tooltip_delay_ms: 0 } });
        await press(page, RELEASES);
        const covers = page.locator('table.tbl tbody a.mb-bb-cover');
        const hrefs = await covers.evaluateAll(as => as.slice(0, 2).map(a => a.getAttribute('href')));
        await page.mouse.move(0, 0);
        await covers.first().scrollIntoViewIfNeeded();
        await covers.first().hover();
        const tip = page.locator('#mb-stat-tooltip');
        await expect(tip).toBeVisible();
        await expect(tip.locator('img.mb-fi-card-big')).toHaveAttribute('src', hrefs[0]);
        await covers.first().click();
        const img = page.locator('#mb-art-viewer .mb-artv-stage .mb-artv-img');
        await expect(page.locator('#mb-art-viewer')).toBeVisible();
        await expect(img).toHaveAttribute('src', hrefs[0]);
        await page.keyboard.press('Shift+ArrowRight');
        await expect(img).toHaveAttribute('src', hrefs[1]);
        expect(wikiRequests(requests)).toEqual([]);
    });

    test('a page of nine sections: a Section column, the h1\'s small print dropped; a single links its song', async ({ page }) => {
        await loadBbStatsPage(page, 'discography-retail', { settingsOverride: { sa_foreign_mb_titles: true } });
        const fx = await fixtureEntries(page, 'discography-retail');
        await press(page, RELEASES);
        const { headers, rows } = await galleryTable(page);
        expect(headers).toContain('Section');
        expect(rows.map(r => r.Section)).toEqual(fx.entries.map(x => x[3]));
        expect(new Set(rows.map(r => r.Section))).toEqual(new Set(['Album Release', 'Video Release', 'Single Release', 'Special Release', 'PBS Exclusive', 'Record Store Day', 'Collaborations', 'Compilations / Soundtracks', 'Promo'].filter(s => fx.entries.some(x => x[3] === s))));
        const single = rows.find(r => /\/song:/.test(r._href));
        expect(single.Section).toBe('Single Release');
        // A song's title in MusicBrainz style, the wiki's as the hover.
        const styled = rows.find(r => /\/song:/.test(r._href) && r._tip);
        expect(styled._tip).toContain('As written on Brucebase');
    });

    test('a discography page with no entries, and the hub whose entries are in its tabs, stay bb-stats\'', async ({ page }) => {
        await loadBbStatsPage(page, 'discography-playlist');
        await expect(page.locator(`button[data-label="${RELEASES}"]`)).toHaveCount(0);
        await expect(page.locator('button[data-label="Show the list"]')).toBeVisible();
        // stats:discography: a tab per included page (Retail holds discography-retail's entries).
        await page.goto('about:blank');
        await loadBbStatsPage(page, 'discography');
        await expect(page.locator('button[data-label="Show the list"]')).toBeVisible();
        await expect(page.locator(`button[data-label="${RELEASES}"]`)).toHaveCount(0);
    });
});

test.describe('Brucebase registered songs (Phase 13, batch 3)', () => {
    test('Title, Song page from stats:songs (one request); the registration record above', async ({ page }) => {
        const { requests } = await loadBbStatsPage(page, 'songs-registered');
        const asked = [];
        await page.route(/\/stats:songs$/, (route) => {
            asked.push(route.request().url());
            return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fs.readFileSync(path.join(__dirname, 'bb-songs.html'), 'utf8') });
        });
        await expect(page.locator('button[data-label="Show the list"]'), 'not bb-stats').toHaveCount(0);
        await press(page, SONGS);
        await expect(page.locator('h2.mb-bb-registered-heading')).toHaveText(/^▼?Songs/);
        const fx = await page.evaluate((h) => {
            const d = new DOMParser().parseFromString(h, 'text/html');
            return Array.from(d.querySelectorAll('#page-content li'), li => li.textContent.trim()).filter(Boolean);
        }, fs.readFileSync(bbStatsFixture('songs-registered').file, 'utf8'));
        const t = await page.evaluate(() => {
            const tb = document.querySelector('table.tbl');
            return {
                headers: Array.from(tb.tHead.rows[0].cells, c => c.dataset.colName || c.textContent.trim()),
                rows: Array.from(tb.tBodies[0].rows, tr => [tr.cells[0].textContent.trim(), tr.cells[1].querySelector('a') ? tr.cells[1].querySelector('a').getAttribute('href') : '']),
            };
        });
        expect(t.headers).toEqual(['Title', 'Song page']);
        expect(t.rows.map(r => r[0])).toEqual(fx);
        expect(t.rows.find(r => r[0] === '1945')[1]).toBe('https://brucebase.wikidot.com/song:1945');
        expect(t.rows.find(r => r[0] === 'Adelita')[1]).toMatch(/\/song:adelita$/);
        const known = t.rows.filter(r => r[1]).length;
        expect(known).toBeGreaterThan(50);
        expect(known).toBeLessThan(fx.length);
        expect(asked, 'stats:songs once').toHaveLength(1);
        expect(wikiRequests(requests)).toEqual([]);
        await expect(page.locator('.mb-fd-head .mb-fd-text').first()).toContainText('Type of Work: Recorded Document');
        const card = page.locator('.mb-fd-details .mb-sb-card', { has: page.locator('.mb-sb-card-head', { hasText: /^Registered songs/ }) });
        await expect(card).toContainText(String(fx.length));
        await expect(card).toContainText(String(known));
    });
});
