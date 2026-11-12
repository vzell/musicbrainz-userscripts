'use strict';

// Brucebase stats pages, Phase 13 batch 2 (org/brucebase.org): a song's tour
// counts (`bb-song-tours`, `stats:<song>-tour`: a row per tour — Played,
// Tour shows, Share and its bar, the box's note — then the other shows and
// the rehearsals) and an album's studio sessions (`bb-sessions`,
// `stats:<album>-studio-sessions` and its parts: a sub-table per section and
// tab, Version History's per-song tables one table, each take's name split
// into Song / Version / Take / Date; the album, release, credits and
// overview above). Both read a copy of the page: no request. Fixtures:
// scripts/build-bb-stats-fixtures.py; the families were read whole first
// (scripts/check-bb-tours-sessions.js). docs/claude/brucebase.md, "Stats
// pages".

const fs = require('fs');
const { test, expect } = require('../support/test');
const { loadBbStatsPage, bbStatsFixture } = require('../support/bbFixture');
const { waitForRenderComplete } = require('../support/browser');

const TOURS = 'Show the tours';
const SESSIONS = 'Show the sessions';

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
 * The fixture's tour boxes read with a plain DOM: [played, shows, tour,
 * note] per "Performed at N show(s) of" box, and the other-shows box.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 * @returns {Promise<{tours: Array<[string, string, string, string]>, other: ?[string, string]}>}
 */
function fixtureBoxes(page, name) {
    const html = fs.readFileSync(bbStatsFixture(name).file, 'utf8');
    return page.evaluate((h) => {
        const d = new DOMParser().parseFromString(h, 'text/html');
        const tours = [];
        let other = null;
        d.querySelectorAll('#page-content table').forEach((t) => {
            const [l, r] = t.querySelectorAll('td');
            const left = l.textContent.replace(/\s+/g, ' ');
            const s = Array.from(r.querySelectorAll('strong'), x => x.textContent.trim());
            const sup = r.querySelector('sup');
            if (/known other show/.test(left)) other = [l.querySelector('strong').textContent, s[0]];
            else tours.push([l.querySelector('strong').textContent, s[0], s[1], sup ? sup.textContent.trim().replace(/^\(|\)$/g, '').replace(/\.$/, '') : '']);
        });
        return { tours, other };
    }, html);
}

/**
 * The single table's columns and rows as cell texts, and each Bar cell's
 * bar width.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{headers: string[], rows: string[][], bars: string[]}>}
 */
function singleTable(page) {
    return page.evaluate(() => {
        const t = document.querySelector('table.tbl');
        const headers = Array.from(t.tHead.rows[0].cells, c => c.dataset.colName || c.textContent.trim());
        const bi = headers.indexOf('Bar');
        return {
            headers,
            rows: Array.from(t.tBodies[0].rows, tr => Array.from(tr.cells, c => c.textContent.replace(/\s+/g, ' ').trim())),
            bars: Array.from(t.tBodies[0].rows, (tr) => { const i = tr.cells[bi]?.querySelector('.mb-bb-share-bar > i'); return i ? i.style.width : ''; }),
        };
    });
}

/**
 * The rendered sub-tables by name (h3 without the engine's row count):
 * headers, rows as cell texts, whether the table shows, the Song cells'
 * hover texts.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object<string, {headers: string[], rows: string[][], open: boolean, tips: string[]}>>}
 */
function subTables(page) {
    return page.evaluate(() => {
        const out = {};
        document.querySelectorAll('table.tbl').forEach((t) => {
            let h3 = t.previousElementSibling;
            while (h3 && h3.tagName !== 'H3') h3 = h3.previousElementSibling;
            const name = h3 ? h3.textContent.replace(/[▲▼]/g, '').replace(/\s*\(\d[\d,]*\)(?!.*\(\d[\d,]*\)).*$/, '').trim() : '';
            const headers = Array.from(t.tHead.rows[0].cells, c => c.dataset.colName || c.textContent.trim());
            const si = headers.indexOf('Song');
            out[name] = {
                headers,
                rows: Array.from(t.tBodies[0].rows, tr => Array.from(tr.cells, c => c.textContent.replace(/\s+/g, ' ').trim())),
                open: getComputedStyle(t).display !== 'none',
                tips: si < 0 ? [] : Array.from(t.tBodies[0].rows, (tr) => { const x = tr.cells[si]?.querySelector('[data-mb-tip]'); return x ? x.getAttribute('title') || '' : ''; }),
            };
        });
        return out;
    });
}

/**
 * A section's first tab in the fixture, read with a plain DOM: the first
 * cell of every data row of its tables (Version History: the per-song
 * tables, one row a version; the heading-only table has `th`s).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 * @param {string} section - The h1's text ("Details").
 * @returns {Promise<string[]>}
 */
function fixtureSectionRows(page, name, section) {
    const html = fs.readFileSync(bbStatsFixture(name).file, 'utf8');
    return page.evaluate(({ h, section }) => {
        const d = new DOMParser().parseFromString(h, 'text/html');
        const h1 = Array.from(d.querySelectorAll('#page-content h1')).find(x => x.textContent.trim() === section);
        let nav = h1.nextElementSibling;
        while (nav && !nav.classList.contains('yui-navset')) nav = nav.nextElementSibling;
        const panel = nav.querySelector(':scope > .yui-content > div');
        return Array.from(panel.querySelectorAll('table tr'))
            .filter(tr => tr.querySelector('td'))
            .map(tr => tr.querySelector('td').textContent.replace(/\s+/g, ' ').trim());
    }, { h: html, section });
}

/** Requests to the wiki itself (pages, AJAX): the views make none. */
const wikiRequests = reqs => reqs.filter(u => /^https?:\/\/brucebase\.wikidot\.com\//.test(u));

test.describe('Brucebase song tour counts (Phase 13, batch 2)', () => {
    test('a row per tour — Played, Tour shows, Share and its bar — then the other shows and rehearsals; no request', async ({ page }) => {
        const { requests } = await loadBbStatsPage(page, '4th-of-july-asbury-park-sandy-tour');
        const fx = await fixtureBoxes(page, '4th-of-july-asbury-park-sandy-tour');
        await expect(page.locator('button[data-label="Show the list"], button[data-label="Show the tables"]'), 'not bb-stats').toHaveCount(0);
        await press(page, TOURS);
        await expect(page.locator('h2.mb-bb-song-tours-heading')).toHaveText(/^▼?Tours/);
        const { headers, rows, bars } = await singleTable(page);
        // Note: the Land Of Hope And Dreams legs (every page since 2025).
        expect(headers).toEqual(['Tour', 'Played', 'Tour shows', 'Share', 'Bar', 'Note']);
        expect(rows).toHaveLength(fx.tours.length + 2);
        // Every tour of the page, in its order, the zeros too.
        expect(rows.slice(0, fx.tours.length).map(r => [r[1], r[2], r[0]])).toEqual(fx.tours.map(t => [t[0], t[1], t[2]]));
        expect(rows.some(r => r[1] === '0'), 'tours the song was not played on stay').toBe(true);
        const played = fx.tours.findIndex(t => Number(t[0]) > 0);
        const share = (100 * Number(fx.tours[played][0]) / Number(fx.tours[played][1])).toFixed(1);
        expect(rows[played][3]).toBe(`${share}%`);
        expect(bars[played]).toBe(`${share}%`);
        expect(rows.slice(-2)).toEqual([
            ['Other known shows', fx.other[0], '', '', '', ''],
            ['Public tour rehearsals', fx.other[1], '', '', '', ''],
        ]);
        expect(wikiRequests(requests), 'read from the page itself').toEqual([]);
        await expect(page.locator('h2.mb-bb-native-h2')).toHaveText(/Brucebase page/);
    });

    test('a box\'s note ("Excl. the first leg of …") is the Note column', async ({ page }) => {
        await loadBbStatsPage(page, '57-channels-and-nothin-on-tour');
        const fx = await fixtureBoxes(page, '57-channels-and-nothin-on-tour');
        await press(page, TOURS);
        const { headers, rows } = await singleTable(page);
        expect(headers).toEqual(['Tour', 'Played', 'Tour shows', 'Share', 'Bar', 'Note']);
        const noted = fx.tours.filter(t => t[3]);
        expect(noted.length).toBe(2);
        noted.forEach((t) => {
            expect(rows.find(r => r[0] === t[2])[5]).toBe(t[3]);
        });
        expect(rows.find(r => r[0] === noted[0][2])[5]).toMatch(/^(?:Excl|Incl)\. the first leg/);
    });
});

test.describe('Brucebase studio sessions (Phase 13, batch 2)', () => {
    test('a sub-table per section and tab, all open; Version History one table, its takes split; no request', async ({ page }) => {
        const { requests } = await loadBbStatsPage(page, 'born-to-run-studio-sessions');
        const vh = await fixtureSectionRows(page, 'born-to-run-studio-sessions', 'Details');
        const possible = await fixtureSectionRows(page, 'born-to-run-studio-sessions', 'Possible BTR-era Songs');
        await expect(page.locator('button[data-label="Show the tables"]'), 'not bb-stats').toHaveCount(0);
        await press(page, SESSIONS);
        await expect(page.locator('h2.mb-bb-sessions-heading')).toHaveText(/^▼?Sessions/);
        const t = await subTables(page);
        expect(Object.keys(t).slice(0, 5)).toEqual([
            'Released › Born To Run', 'Additional Recordings › Released', 'Additional Recordings › Unreleased',
            'Details › Version History', 'Details › Timeline',
        ]);
        expect(Object.keys(t)).toContain('Potential Album Sequences › Potential Sequence #1 › Album #3');
        expect(Object.values(t).every(x => x.open)).toBe(true);
        expect(t['Released › Born To Run'].headers).toEqual(['#', 'Song Title', 'Running Time', 'Release']);
        expect(t['Released › Born To Run'].rows[0]).toEqual(['1.', 'THUNDER ROAD', '4:44', 'BTR']);
        // Version History: every song's table in one, the columns from the
        // heading-only table above them (not the first take's row).
        const v = t['Details › Version History'];
        expect(v.headers).toEqual(['Song', 'Version', 'Take', 'Date', 'Running Time', 'Release']);
        expect(v.rows).toHaveLength(vh.length);
        expect(v.rows[0]).toEqual(['BACKSTREETS', 'V1', '', '', '', 'uncirculating']);
        expect(v.rows).toContainEqual(['BORN TO RUN', 'V1a', '', '', '4:24', 'ESR / BTRS']);
        expect(v.rows).toContainEqual(expect.arrayContaining(['THE HEIST', 'V2', '14']));
        expect(v.rows).toContainEqual(expect.arrayContaining(['JUNGLELAND', 'V1', '', 'August 1, 1974']));
        expect(v.rows).toContainEqual(expect.arrayContaining(['JUNGLELAND', 'V6', '', 'April - July 1975']));
        // A song with one version is a table of one row: every one counts.
        expect(t['Possible BTR-era Songs'].rows).toHaveLength(possible.length);
        expect(possible.length).toBeGreaterThan(10);
        // The Timeline keeps its own columns; a numbered sequence is # / Song.
        expect(t['Details › Timeline'].headers).toEqual(['Date', 'Song Title', 'Location', 'Personnel']);
        expect(t['Potential Album Sequences › Potential Sequence #1 › Album #3'].headers).toEqual(['#', 'Song']);
        expect(wikiRequests(requests), 'read from the page itself').toEqual([]);
    });

    test('a title with no take keeps its cell as Song; in MusicBrainz case with the wiki\'s name as the hover', async ({ page }) => {
        await loadBbStatsPage(page, 'born-to-run-studio-sessions', { settingsOverride: { sa_foreign_mb_titles: true } });
        await press(page, SESSIONS);
        const t = await subTables(page);
        const v = t['Details › Version History'];
        const i = v.rows.findIndex(r => r[0] === 'Born to Run' && r[1] === 'V1a');
        expect(i).toBeGreaterThanOrEqual(0);
        expect(v.tips[i]).toContain('BORN TO RUN - V1a');
        // A list of titles naming no take is not split.
        expect(t['Possible BTR-era Songs'].headers).toEqual(['Song Title', 'Running Time', 'Release']);
        // Takes and titles with none in one table: the title stays whole, Version empty.
        await page.goto('about:blank');
        await loadBbStatsPage(page, 'devils-and-dust-studio-sessions-details');
        await press(page, SESSIONS);
        const d = (await subTables(page))['Details › Version History'];
        expect(d.headers.slice(0, 2)).toEqual(['Song', 'Version']);
        const plain = d.rows.filter(r => !r[1]);
        expect(plain.length).toBeGreaterThan(0);
        expect(plain.every(r => r[0] && !/ - V\d/.test(r[0])), 'the wiki\'s title, whole').toBe(true);
        expect(d.rows.some(r => r[1])).toBe(true);
    });

    test('the head: Overview, Credits; the card — Album, Released, Label, Sections', async ({ page }) => {
        await loadBbStatsPage(page, 'born-to-run-studio-sessions');
        await press(page, SESSIONS);
        await expect(page.locator('.mb-fd-head .mb-fd-text').first()).toContainText('sessions spanned a 14-month period');
        await expect(page.locator('.mb-fd-head .mb-fd-text', { hasText: 'Label: Columbia' })).toHaveCount(1);
        const card = page.locator('.mb-fd-details .mb-sb-card', { has: page.locator('.mb-sb-card-head', { hasText: /^Studio sessions/ }) });
        const ns = await card.locator('dt, dd').evaluateAll(xs => xs.map(n => n.textContent.trim()));
        const kv = {};
        for (let i = 0; i < ns.length; i += 2) kv[ns[i]] = ns[i + 1];
        expect(kv).toEqual(expect.objectContaining({ Album: 'Born To Run', Released: 'August 25, 1975', Label: 'Columbia' }));
        expect(kv.Sections).toBe('Overview · Released · Additional Recordings · Details · Potential Album Sequences · Possible BTR-era Songs');
        await expect(card.locator('a[href="https://brucebase.wikidot.com/retail:born-to-run"]')).toHaveCount(1);
    });

    test('a part with the Timeline alone: a column listing several takes a cell is not split', async ({ page }) => {
        await loadBbStatsPage(page, 'darkness-on-the-edge-of-town-studio-sessions-timeline');
        await press(page, SESSIONS);
        const t = await subTables(page);
        const [only] = Object.values(t);
        expect(Object.keys(t)).toHaveLength(1);
        expect(only.headers).toEqual(['Date', 'Song Title', 'Location', 'Personnel']);
        expect(only.rows.some(r => (r[1].match(/ - V\d/g) || []).length > 1)).toBe(true);
    });

    test('a part with no table is no sessions page; with sa_bb_detail_pages off a sessions page is bb-stats\', its version tables headed right', async ({ page }) => {
        await loadBbStatsPage(page, 'born-to-run-studio-sessions-overview');
        await expect(page.locator(`button[data-label="${SESSIONS}"]`)).toHaveCount(0);
        await page.goto('about:blank');
        await loadBbStatsPage(page, 'born-to-run-studio-sessions', { settingsOverride: { sa_bb_detail_pages: false } });
        await expect(page.locator(`button[data-label="${SESSIONS}"]`)).toHaveCount(0);
        await press(page, 'Show the tables');
        const t = await subTables(page);
        // Every row of a song's table is bold by its style: none is a header.
        expect(t['Version History'].headers).toEqual(['Song Title', 'Running Time', 'Release']);
        expect(t['Version History'].rows[0][0]).toBe('BACKSTREETS - V1');
    });
});
