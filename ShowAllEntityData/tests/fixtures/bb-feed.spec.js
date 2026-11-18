'use strict';

// The BruceParser feed, version 1 (org/bbp-parity.org, "The feed, version 1";
// mockup https://claude.ai/artifact/65urMwgWSb6zq6xJa9Mf4x, vzell's answers of
// 2026-11-16 all as recommended). BruceParser's whole-wiki run publishes one
// JSON file; the script reads it at most once a day on a press or a Space,
// keeps it in GM storage, and marks the pages it names:
//   bb-feed-title ❌ (a show's page titled differently; marked on that page
//   AND on the show), bb-feed-no-tags ❌, bb-feed-no-parent ⚠️,
//   bb-feed-first-letter ⚠️ — on the cell naming a row's own page (Event,
//   Title, Name, Page), after a page head's byline and a window's title.
//
// Real data: tests/fixtures/bb-feed-2026-11-15.json is the feed as published
// (run of 2026-11-15). The 1972 year fixture holds two shows it names through
// their dependent pages (1972-06-00 Point Pleasant: its Notes page says
// "Private Property"; 1972-04-00b Mediasound: its Notes page says "Stucio C"),
// and the relations fixture holds relation:rob-demartin (no "d" tag). The
// story, event and song cases use a small feed naming pages the fixtures have.
//
// Feed 1.1 (feed v2, branch 1; vzell, 2026-11-17): bb-feed-date-missing ❌
// and bb-feed-date-wrong ⚠️ (the two lists of the feed's `date-parts`, pages
// that are no show only) and bb-feed-files ⚠️ (tagged "files", no picture).
// tests/fixtures/bb-feed-2026-11-15-v2.json is BruceParser 0.19.0's feed of
// the same run (published 2026-11-17; the raw file is byte-identical).
//
// Feed 1.2 (feed v2, branch 2; vzell, 2026-11-17): the feed's `anchors` map a
// year page's anchor to the show it names, so a year listing's rows (they
// link /1973#290173, not the show's page) and a year-anchor window are
// marked too. tests/fixtures/bb-feed-2026-11-15-v3.json is BruceParser
// 0.20.0's feed of the same run.
//
// Feed 1.3 (feed v2, branch 3; mockup https://claude.ai/artifact/Tip5CShMevQp8ycqBjjnRZ,
// vzell's answers of 2026-11-18 all as recommended): the feed's `mb` names
// MusicBrainz events whose Brucebase link reaches no entry (bb-mb-no-entry ❌ ⚓),
// shares one with another event (bb-mb-shared ⚠️ ⇉) or is no anchor
// (bb-mb-not-anchor ⚠️ ⌗): the Event cell of every event list, a card with
// the wiki's entries of the date, and the event page's sidebar mark.
// tests/fixtures/bb-feed-2026-11-15-v4.json is BruceParser 0.21.0's feed.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { loadBbYearPage, loadBbRelationsPage, loadBbSongsPage, loadBbStoryPage, loadBbEventPage, loadBbYearListPage,
    BB_YEAR_BUTTON, BB_BUTTON, BB_YEAR_LIST_BUTTON } = require('../support/bbFixture');
const { routeDetailPages } = require('../support/detailFixture');
const { waitForRenderComplete } = require('../support/browser');
const { findingRow, clickFinding, findingRowState } = require('../support/findingsMenu');
const { clickToolbarItem } = require('../support/toolbarMenu');

const FEED_URL = 'https://raw.githubusercontent.com/vzell/brucebase-feed/main/bb-feed.json';
const REAL = JSON.parse(fs.readFileSync(path.join(__dirname, 'bb-feed-2026-11-15.json'), 'utf8'));
const REAL2 = JSON.parse(fs.readFileSync(path.join(__dirname, 'bb-feed-2026-11-15-v2.json'), 'utf8'));
const REAL3 = JSON.parse(fs.readFileSync(path.join(__dirname, 'bb-feed-2026-11-15-v3.json'), 'utf8'));
const REAL4 = JSON.parse(fs.readFileSync(path.join(__dirname, 'bb-feed-2026-11-15-v4.json'), 'utf8'));
const MB_EVENTS_URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/events';
const MB_EVENTS_FILE = path.join(__dirname, 'artist-events-names.html');
const EV = n => `eeeeeeee-0000-0000-0000-00000000000${n}`;
// A feed naming three events of the artist-events fixture, in the shapes of
// the real run (2023-09-12 Pittsburgh, 2026-04-16 Phoenix, 2020-10-23).
/**
 * A feed naming three events of the artist-events fixture, `daysAgo` back.
 *
 * @param {number} [daysAgo]
 * @returns {Object}
 */
function mbFeed(daysAgo = 1) {
    return {
        ...feedOf({}, daysAgo),
        mb: {
            [EV(1)]: { kind: 'no-entry', link: '2023#120923', date: '2023-09-12', candidates: [
                { anchor: '2023#120923a', page: 'interview:2023-09-12a-stone-hill-farm-colts-neck-nj', heading: '2023-09-12 - STONE HILL FARM, COLTS NECK, NJ' },
                { anchor: '2023#120923b', page: 'nogig:2023-09-12b-ppg-paints-arena-pittsburgh-pa', heading: '2023-09-12 - PPG PAINTS ARENA, PITTSBURGH, PA', likely: true },
            ] },
            [EV(2)]: { kind: 'shared', link: '2026#130426', date: '2026-04-16', dateDiffers: true, page: 'gig:2026-04-13-chase-center-san-francisco-ca',
                heading: '2026-04-13 - CHASE CENTER, SAN FRANCISCO, CA', others: [EV(3)], candidates: [
                    { anchor: '2026#160426', page: 'gig:2026-04-16-mortgage-matchup-center-phoenix-az', heading: '2026-04-16 - MORTGAGE MATCHUP CENTER, PHOENIX, AZ', likely: true },
                ] },
            [EV(4)]: { kind: 'not-anchor', link: 'interview:2020-10-23-siriusxm-studio-new-york-city-ny', date: '2020-10-23' },
        },
    };
}
// The 1973 listing's rows of shows the feed names (scripts/probe-bb-feed.py, part 5).
const LIST1973 = [
    ['1973#290173', 'recording:1973-01-29-914-sound-studios-blauvelt-ny'],
    ['1973#300173', 'recording:1973-01-30-914-sound-studios-blauvelt-ny'],
    ['1973#160273', 'gig:1973-02-16-boylan-gymnasium-west-long-branch-nj'],
    ['1973#280273', 'gig:1973-02-28-memorial-civic-auditorium-stockton-ca'],
    ['1973#220973a', 'nogig:1973-09-22a-jai-alai-fronton-miami-fl'],
];
const NEWS78 = 'news:1978-08-22-madison-square-garden-new-york-city-ny';
const ROXY_VENUE = 'venue:roxy-theatre-west-hollywood-ca';
const DAY = 24 * 3600 * 1000;
const BB = 'https://brucebase.wikidot.com/';
const PT_PLEASANT = 'gig:1972-06-00-unknown-location-point-pleasant-nj';
const MEDIASOUND = 'recording:1972-04-00b-mediasound-studios-new-york-city-ny';
const DEMARTIN = 'relation:rob-demartin';
const STORY = 'story-1971-05-15-union-nj';
const STORY_TITLE = 'Story 1971-05-15 Newark State College, Union, NJ';
const ROXY = 'gig:1978-07-07-roxy-theatre-west-hollywood-ca';
const GIG13 = 'gig:1985-01-13-carolina-coliseum-columbia-sc';
const RELATIONS_BUTTON = 'Show all relations';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

/**
 * A feed of format 1 naming `pages`, from a run `daysAgo` days back.
 *
 * @param {Object<string, Object>} pages
 * @param {number} [daysAgo]
 * @returns {Object}
 */
function feedOf(pages, daysAgo = 1) {
    const date = new Date(Date.now() - daysAgo * DAY).toISOString().slice(0, 10);
    return { format: 1, run: { date, bruceparser: '0.18.0', commit: 'test', feed: '1.0' }, site: BB, credit: 'test', reports: {}, pages };
}

/**
 * Settings that turn the feed on with `kept` as the kept copy, read `ageMs` ago.
 *
 * @param {?Object} kept - A feed, or null for none kept.
 * @param {number} [ageMs]
 * @param {Object} [extra]
 * @returns {Object<string, *>}
 */
function feedOn(kept, ageMs = 1000, extra = {}) {
    return {
        sa_bb_feed: true, sa_foreign_mb_titles: false, sa_foreign_typography: false, sa_render_threshold: 100000,
        ...(kept ? { mb_sa_bb_feed: { at: Date.now() - ageMs, data: kept, err: '', errAt: 0 } } : {}),
        ...extra,
    };
}

/**
 * Answers the feed's address (before the page loads): a status, a body,
 * an optional delay.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{status?: number, body?: string, delayMs?: number}} answer
 * @returns {Promise<void>}
 */
async function answerFeed(page, { status = 200, body = '', delayMs = 0 }) {
    await page.addInitScript(({ url, a }) => {
        window.__gmXhrResponses = Object.assign(window.__gmXhrResponses || {}, {
            [url]: { status: a.status, responseHeaders: 'content-type: text/plain; charset=utf-8\r\n', responseText: a.body, finalUrl: url, delayMs: a.delayMs },
        });
    }, { url: FEED_URL, a: { status, body, delayMs } });
}

/**
 * Loads 1972's year page (the batch-1 fixture) with every other request refused.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object<string, *>} settings
 * @returns {Promise<void>}
 */
async function load1972(page, settings) {
    await page.route(/^https?:\/\//, route => route.abort('blockedbyclient'));
    await loadUserscriptPage(page, {
        url: `${BB}1972`, fixtureFile: path.join(__dirname, 'bb-year-1972-findings.html'), testMode: true,
        settingsOverride: { sa_enable_brucebase: true, sa_bb_year_pages: true, ...settings },
    });
}

/**
 * Loads 1972 and shows all its events.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object<string, *>} settings
 * @returns {Promise<void>}
 */
async function show1972(page, settings) {
    await load1972(page, settings);
    await page.click(`button[data-label="${BB_YEAR_BUTTON}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/** @returns {Promise<number>} The requests made for the feed so far. */
const feedAsks = page => page.evaluate(u => (window.__gmXhrLog || []).filter(r => r.url === u).length, FEED_URL);

/**
 * The live cells of a column with their feed stamps.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} col
 * @returns {Promise<Array<{name: string, ids: string[], level: string, tip: string}>>}
 */
function feedCells(page, col) {
    return page.evaluate((c) => {
        const t = document.querySelector('table.tbl');
        const names = Array.from(t.querySelectorAll('thead tr:first-child th')).map(th => th.dataset.colName || th.textContent.trim());
        const i = names.indexOf(c);
        return Array.from(document.querySelectorAll('table.tbl tbody tr')).filter(tr => tr.style.display !== 'none' && tr.cells[i]).map((tr) => {
            const td = tr.cells[i];
            const a = td.querySelector('a.mb-bb-event-link[href]') || td.querySelector('a[href]');
            return {
                name: a ? decodeURIComponent(new URL(a.href).pathname.slice(1)) : '',
                ids: (td.dataset.mbFindings || '').split(' ').filter(x => x.startsWith('bb-feed-')),
                others: (td.dataset.mbFindings || '').split(' ').filter(x => x && !x.startsWith('bb-feed-')),
                level: td.dataset.mbFinding || '',
                tip: td.getAttribute('title') || '',
            };
        }).filter(r => r.ids.length);
    }, col);
}

let pageErrors;
test.beforeEach(({ page }) => {
    pageErrors = [];
    page.on('pageerror', e => pageErrors.push(String(e.stack || e)));
});
test.afterEach(() => {
    expect(pageErrors, 'no script error').toEqual([]);
});

test.describe('the Brucebase feed: reading it', () => {
    test('the published file is format 1 and the pages it names are wiki names', () => {
        expect(REAL.format).toBe(1);
        expect(REAL.run.date).toBe('2026-11-15');
        const names = Object.keys(REAL.pages);
        expect(names).toHaveLength(192);
        expect(names.every(n => /^[a-z0-9_-]+:[^/]+$/.test(n))).toBe(true);
        expect(Object.fromEntries(Object.entries(REAL.reports).map(([k, v]) => [k, v.count])))
            .toEqual({ 'dependent-title': 39, 'first-letter': 10, 'no-parent': 105, 'no-tags': 38 });
    });

    test('a kept feed younger than a day is not read again', async ({ page }) => {
        // REAL4 has every map this script reads: a file without one is read
        // again after an hour (the 1.3 test "a kept file older than 1.3").
        await answerFeed(page, { body: JSON.stringify(REAL4) });
        await show1972(page, feedOn(REAL4, 2 * 3600 * 1000));
        expect((await page.evaluate(() => window.__saTest.bbFeed())).date).toBe('2026-11-15');
        expect(await feedAsks(page), 'fresh: no request').toBe(0);
    });

    test('an older one is read once, on the press, not before; then it is fresh', async ({ page }) => {
        await answerFeed(page, { body: JSON.stringify(REAL) });
        await load1972(page, feedOn(REAL, 2 * DAY));
        await page.locator(`button[data-label="${BB_YEAR_BUTTON}"]`).waitFor();
        expect(await feedAsks(page), 'nothing before a press').toBe(0);
        await page.click(`button[data-label="${BB_YEAR_BUTTON}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await expect.poll(() => feedAsks(page)).toBe(1);
        await expect.poll(async () => (await page.evaluate(() => window.__saTest.bbFeed())).loading).toBe(false);
        expect(await page.evaluate(() => window.__saTest.bbFeedLoad())).toBe(false);
        expect(await feedAsks(page), 'read today: no second request').toBe(1);
        const kept = await page.evaluate(() => window.__gmValues.mb_sa_bb_feed);
        expect(Date.now() - kept.at).toBeLessThan(60000);
        expect(kept.data.run.date).toBe('2026-11-15');
    });

    test('a failed read keeps the old feed, says why, and waits an hour; Retry reads at once; a bad file is not taken', async ({ page }) => {
        await answerFeed(page, { status: 404, body: '404: Not Found' });
        await show1972(page, feedOn(REAL, 2 * DAY));
        await expect.poll(async () => (await page.evaluate(() => window.__saTest.bbFeed())).err).toBe('GitHub answered 404');
        const st = await page.evaluate(() => window.__saTest.bbFeed());
        expect(st.date, 'the old feed is kept').toBe('2026-11-15');
        expect(st.status).toEqual({
            bad: true, text: expect.stringMatching(/^Brucebase feed: not loaded \(GitHub answered 404\) · using the run of 2026-11-15 · (\d+ days old · )?BruceParser 0\.18\.0 · /),
            action: 'Retry', detail: expect.stringContaining('written by BruceParser 0.18.0 (feed.sh 1.0, commit e3f821a)'),
        });
        // Its marks still come from the kept feed.
        expect((await feedCells(page, 'Event')).map(r => r.name).sort()).toEqual([MEDIASOUND, PT_PLEASANT].sort());
        // Within the hour, no second try; Retry (force) asks at once.
        expect(await page.evaluate(() => window.__saTest.bbFeedLoad())).toBe(false);
        expect(await feedAsks(page)).toBe(1);
        // A file of another format is not taken either: the real feed with only its format changed.
        const two = JSON.stringify({ ...REAL, format: 2, run: { ...REAL.run, date: '2026-11-20' } });
        await page.evaluate(([u, body]) => { window.__gmXhrResponses[u] = { status: 200, responseHeaders: 'content-type: text/plain\r\n', responseText: body }; }, [FEED_URL, two]);
        await page.evaluate(() => window.__saTest.bbFeedLoad(true));
        expect(await feedAsks(page)).toBe(2);
        const st2 = await page.evaluate(() => window.__saTest.bbFeed());
        expect(st2.err).toBe('the file is not a feed of format 1');
        expect(st2.date).toBe('2026-11-15');
    });

    test('the setting off: no request, no mark, no ☰ row, no menu line', async ({ page }) => {
        await answerFeed(page, { body: JSON.stringify(REAL) });
        await show1972(page, { ...feedOn(REAL, 2 * DAY), sa_bb_feed: false });
        expect(await feedAsks(page)).toBe(0);
        expect(await feedCells(page, 'Event')).toEqual([]);
        expect(await page.locator('#mb-saed-bbfeed-btn').count()).toBe(0);
        expect(await page.locator('.mb-findings-feed-item').count()).toBe(0);
    });
});

test.describe('the Brucebase feed: rows', () => {
    test('1972: the two shows whose Notes pages are titled differently are ❌ on their Event cell; the menu counts and filters them', async ({ page }) => {
        await show1972(page, feedOn(REAL));
        const cells = await feedCells(page, 'Event');
        expect(cells.map(r => r.name).sort()).toEqual([MEDIASOUND, PT_PLEASANT].sort());
        cells.forEach(r => { expect(r.ids).toEqual(['bb-feed-title']); expect(r.level).toBe('error'); });
        const pp = cells.find(r => r.name === PT_PLEASANT);
        expect(pp.tip).toContain('gignote:1972-06-00-unknown-location-point-pleasant-nj is titled "1972-06-00 Private Property, Point Pleasant, NJ"');
        expect(pp.tip).toContain('From BruceParser\'s run of 2026-11-15');
        // The tint: the generic ❌ on the cell.
        const look = await page.evaluate((n) => {
            const a = document.querySelector(`table.tbl tbody a.mb-bb-event-link[href$="${n}"]`);
            const td = a.closest('td');
            return { bg: getComputedStyle(td).backgroundColor, after: getComputedStyle(td, '::after').content };
        }, PT_PLEASANT.split(':')[1]);
        expect(look.bg).not.toBe('rgba(0, 0, 0, 0)');
        expect(look.after).toContain('❌');
        // The menu row counts ROWS, from the page; a click leaves those rows, a second click all.
        const row = await findingRow(page, 'error', 'bb-feed-title');
        expect(row.count).toBe(2);
        expect(row.label).toBe('Brucebase page titled differently from its show');
        const all = (await findingRowState(page)).visible;
        await clickFinding(page, 'bb-feed-title');
        await expect.poll(() => findingRowState(page, 'bb-feed-title')).toEqual({ visible: 2, withFinding: 2 });
        await clickFinding(page, 'bb-feed-title');
        await expect.poll(async () => (await findingRowState(page)).visible).toBe(all);
        // The menus' line names the run.
        const line = await page.locator('#mb-findings-error-menu-btn-panel .mb-findings-feed-item').textContent();
        expect(line).toMatch(/^Brucebase feed · run of 2026-11-15 · (\d+ days old · )?BruceParser 0\.18\.0 · 192 pages · read today · Read again$/);
    });

    test('the stamp survives a filter re-render; the tint setting off keeps the stamp and the menu row, without the tint', async ({ page }) => {
        // The two cells' other findings off (bb-anchor-shared, bb-anchor-postfix), so no tint is left.
        await show1972(page, feedOn(REAL, 1000, { sa_findings_tint_bb_feed: false, sa_findings_bb_anchor_shared: false, sa_findings_bb_anchor_postfix: false }));
        const cells = await feedCells(page, 'Event');
        expect(cells).toHaveLength(2);
        cells.forEach(r => { expect(r.others, 'premise: no other finding').toEqual([]); expect(r.level, 'no tint').toBe(''); });
        expect((await findingRow(page, 'error', 'bb-feed-title')).count).toBe(2);
        await page.locator('#mb-global-filter-input').fill('point pleasant');
        await expect.poll(async () => (await findingRowState(page)).visible).toBeLessThan(10);
        expect((await feedCells(page, 'Event')).map(r => r.name)).toContain(PT_PLEASANT);
    });

    test('a feed that comes in after the render is stamped then', async ({ page }) => {
        await answerFeed(page, { body: JSON.stringify(REAL), delayMs: 1500 });
        await show1972(page, feedOn(null));
        expect(await feedCells(page, 'Event'), 'nothing kept at the render').toEqual([]);
        await expect.poll(() => feedCells(page, 'Event').then(c => c.map(r => r.name).sort()), { timeout: 15000 })
            .toEqual([MEDIASOUND, PT_PLEASANT].sort());
        expect((await findingRow(page, 'error', 'bb-feed-title')).count).toBe(2);
    });

    test('Relations: Rob DeMartin\'s Name cell is ⚠️ (no "d" tag); Save to Disk → Load from Disk keeps it', async ({ context }) => {
        const source = await context.newPage();
        source.on('pageerror', e => pageErrors.push(String(e.stack || e)));
        await loadBbRelationsPage(source, { settingsOverride: feedOn(REAL) });
        await source.click(`button[data-label="${RELATIONS_BUTTON}"]`);
        await waitForRenderComplete(source, { waitForAutoResize: false });
        const before = await feedCells(source, 'Name');
        expect(before.map(r => [r.name, r.ids, r.level])).toEqual([[DEMARTIN, ['bb-feed-first-letter'], 'warn']]);
        expect(before[0].tip).toContain('lacks the tag "d" of its title\'s first letter');
        expect((await findingRow(source, 'warn', 'bb-feed-first-letter')).count).toBe(1);
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-bb-feed-'));
        try {
            const downloadPromise = source.waitForEvent('download', { timeout: 60000 });
            await clickToolbarItem(source, '#mb-save-to-disk-btn');
            await source.locator('#sa-sd-save-confirm').waitFor({ state: 'visible', timeout: 15000 });
            await source.click('#sa-sd-save-confirm');
            const saved = path.join(tmpDir, 'bb-relations.json.gz');
            await (await downloadPromise).saveAs(saved);
            await source.close();
            const page = await context.newPage();
            page.on('pageerror', e => pageErrors.push(String(e.stack || e)));
            await loadBbRelationsPage(page, { settingsOverride: feedOn(REAL) });
            await clickToolbarItem(page, '#mb-load-from-disk-btn');
            await page.locator('input[type="file"][accept*="json"]').setInputFiles(saved);
            const renderBtn = page.locator('#sa-render-no-filter-confirm');
            await renderBtn.waitFor({ state: 'attached', timeout: 15000 });
            await renderBtn.evaluate(el => el.click());
            await waitForRenderComplete(page, { waitForAutoResize: false });
            expect((await feedCells(page, 'Name')).map(r => [r.name, r.ids, r.level])).toEqual([[DEMARTIN, ['bb-feed-first-letter'], 'warn']]);
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    const SONGS_FEED = { 'song:1945': { 'first-letter': '0-9' }, 'song:30-days-out': { 'no-tags': true } };

    test('Songs: the Title cell of a song the feed names, another kind on another song; a run 30 days back is called old', async ({ page }) => {
        await loadBbSongsPage(page, { settingsOverride: feedOn(feedOf(SONGS_FEED, 30)) });
        await page.click(`button[data-label="${BB_BUTTON}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const cells = await feedCells(page, 'Title');
        expect(cells.map(r => [r.name, r.ids[0], r.level]).sort()).toEqual([
            ['song:1945', 'bb-feed-first-letter', 'warn'],
            ['song:30-days-out', 'bb-feed-no-tags', 'error'],
        ]);
        expect((await findingRow(page, 'error', 'bb-feed-no-tags')).count).toBe(1);
        expect(cells[0].tip).toContain('(30 days old)');
        expect((await page.evaluate(() => window.__saTest.bbFeed())).status.text).toContain(' · 30 days old · ');
    });

    test('a kind\'s switch off: its marks go, the others stay', async ({ page }) => {
        await loadBbSongsPage(page, { settingsOverride: feedOn(feedOf(SONGS_FEED), 1000, { sa_findings_bb_feed_no_tags: false }) });
        await page.click(`button[data-label="${BB_BUTTON}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        expect((await feedCells(page, 'Title')).map(r => [r.name, r.ids[0]])).toEqual([['song:1945', 'bb-feed-first-letter']]);
        expect(await findingRow(page, 'error', 'bb-feed-no-tags')).toBeUndefined();
    });
});

test.describe('the Brucebase feed: heads, the window, the ☰ row', () => {
    test('a story page\'s head: the marks the page does not contradict; what the page shows now wins', async ({ page }) => {
        const feed = feedOf({
            [`story:${STORY}`]: {
                'no-parent': true, 'no-tags': true, 'first-letter': 'z',
                'dependent-title': { title: STORY_TITLE, eventTitle: '1971-05-15 Somewhere Else, Union, NJ' },
            },
        });
        await loadBbStoryPage(page, STORY, { settingsOverride: feedOn(feed) });
        await page.click('button[data-label="Show the story"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const marks = page.locator('p.mb-fd-sub .mb-bb-feed-mark');
        // The page has a breadcrumb parent and five tags: no-parent and no-tags go;
        // "z" is missing indeed; its own title is the one the run saw.
        await expect(marks).toHaveCount(2);
        expect(await marks.evaluateAll(ms => ms.map(m => [m.dataset.mbFeedKind, m.dataset.mbLevel, m.textContent]))).toEqual([
            ['dependent-title', 'error', '❌ ≢'],
            ['first-letter', 'warn', '⚠️ Ⓐ'],
        ]);
        expect(await marks.first().getAttribute('title')).toContain('From BruceParser\'s run of');
        // The rule itself, case by case.
        const kept = (facts, live) => page.evaluate(([n, l]) => window.__saTest.bbFeed(n, l).kept.map(f => f.kind), [facts, live]);
        const live = { title: STORY_TITLE, tags: ['15', '1971', 'a', 'may', 'storyteller'], parent: true };
        expect(await kept(`story:${STORY}`, { ...live, title: 'Story 1971-05-15 Newark State College, Union, New Jersey' }), 'title edited since the run')
            .toEqual(['first-letter']);
        expect(await kept(`story:${STORY}`, { ...live, parent: false, tags: [] })).toEqual(['dependent-title', 'no-tags', 'no-parent', 'first-letter']);
        expect(await kept(`story:${STORY}`, { title: null, tags: null, parent: null }), 'nothing known: all stay').toHaveLength(4);
    });

    test('a show\'s head: its dependent page titled differently is marked on the show (vzell, decision 1)', async ({ page }) => {
        const feed = feedOf({
            'onstage:1978-07-07-roxy-theatre-west-hollywood-ca': {
                'dependent-title': { title: '1978-07-07 Roxy, West Hollywood, CA', event: ROXY, eventTitle: '1978-07-07 Roxy Theatre (The), West Hollywood, CA' },
            },
        });
        await loadBbEventPage(page, 'gig-1978-07-07', { settingsOverride: feedOn(feed) });
        await page.click('button[data-label="Show the event"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const mark = page.locator('p.mb-fd-sub .mb-bb-feed-mark');
        await expect(mark).toHaveCount(1);
        await expect(mark).toHaveText('❌ ≢');
        expect(await mark.getAttribute('title')).toContain('Its page onstage:1978-07-07-roxy-theatre-west-hollywood-ca is titled "1978-07-07 Roxy, West Hollywood, CA"');
        // The feed off: no mark at all.
        expect(await page.evaluate(n => window.__saTest.bbFeed(n).facts.length, ROXY)).toBe(1);
    });

    test('the window: the show\'s mark after its title; a stale feed is read on Space, never on the hover', async ({ page }) => {
        const feed = feedOf({ [`onstage:${GIG13.split(':')[1]}`]: { 'dependent-title': { title: '1985-01-13 Carolina Coliseum, Columbia, S.C.', event: GIG13, eventTitle: '1985-01-13 Carolina Coliseum, Columbia, SC' } } });
        await answerFeed(page, { body: JSON.stringify(feed) });
        await loadBbYearPage(page, '1985', { settingsOverride: { ...feedOn(feed, 2 * DAY), sa_bb_event_preview: true } });
        await routeDetailPages(page, 'bb');
        await page.route(/^https:\/\/brucebase\.wdfiles\.com\//, route => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
        await page.click(`button[data-label="${BB_YEAR_BUTTON}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await expect.poll(() => feedAsks(page), 'the press reads the stale feed').toBe(1);
        await expect.poll(async () => (await page.evaluate(() => window.__saTest.bbFeed())).loading).toBe(false);
        // A day later: the hover must not read it, Space must.
        await page.evaluate(d => window.__saTest.bbFeedAge(2 * d), DAY);
        const link = page.locator(`table.tbl tbody a.mb-bb-event-link[href="${BB}${GIG13}"]`).first();
        await page.mouse.move(0, 0);
        await link.scrollIntoViewIfNeeded();
        await page.keyboard.down('Control');
        await link.hover();
        await page.keyboard.up('Control');
        await expect(page.locator('#mb-dp-peek')).toContainText('28 songs');
        expect(await feedAsks(page), 'the hover reads nothing').toBe(1);
        await page.keyboard.press('Space');
        const title = page.locator('#mb-dp-dialog .mb-dp-xtitle');
        await expect(title).toContainText('1985-01-13 Carolina Coliseum, Columbia, SC');
        await expect(title.locator('.mb-bb-feed-mark')).toHaveText('❌ ≢');
        await expect.poll(() => feedAsks(page), 'Space reads the stale feed').toBe(2);
    });

    test('the ☰ menu\'s Brucebase group: the feed\'s line; Read again reads it', async ({ page }) => {
        await answerFeed(page, { body: JSON.stringify(REAL) });
        await load1972(page, feedOn(REAL));
        const row = page.locator('#mb-saed-bbfeed-btn');
        await expect(row).toHaveCount(1);
        expect(await row.evaluate(el => el.closest('.mb-saed-group').dataset.mbGroup)).toBe('bb');
        await expect(row).toHaveText(/^Brucebase feed · run of 2026-11-15 · (\d+ days old · )?BruceParser 0\.18\.0 · 192 pages · read today · Read again$/);
        // Which file is kept, in the hover text (vzell, 2026-11-17).
        expect(await row.getAttribute('title')).toMatch(/\nThe kept file: the run of 2026-11-15, written by BruceParser 0\.18\.0 \(feed\.sh 1\.0, commit e3f821a\), read \d{4}-\d\d-\d\d \d\d:\d\d\. Pages: dependent-title 39, first-letter 10, no-parent 105, no-tags 38\.$/);
        await clickToolbarItem(page, '#mb-saed-bbfeed-btn');
        await expect.poll(() => feedAsks(page)).toBe(1);
    });
});

test.describe('the Brucebase feed 1.1: date tags and the files tag', () => {
    test('BruceParser 0.19.0\'s file: format 1, the two new keys, and the counts the probe found', () => {
        expect(REAL2.format).toBe(1);
        expect(REAL2.run.feed).toBe('1.1');
        expect(Object.fromEntries(Object.entries(REAL2.reports).map(([k, v]) => [k, v.count]))).toEqual({
            'date-parts': 3, 'dependent-title': 39, 'files-no-images': 32, 'first-letter': 10, 'no-parent': 105, 'no-tags': 38,
        });
        expect(REAL2.pages[NEWS78]).toEqual({ 'date-parts': { missing: ['22'], wrong: ['23'] } });
        // No show among the date pages: a show's date tags are batch 3's.
        const dated = Object.keys(REAL2.pages).filter(n => REAL2.pages[n]['date-parts']);
        expect(dated.filter(n => /^(gig|nogig|interview|rehearsal|recording):/.test(n))).toEqual([]);
    });

    test('date-parts is two findings of two levels; the page in front drops the tags it has (or no longer has)', async ({ page }) => {
        await load1972(page, feedOn(REAL2));
        const facts = n => page.evaluate(x => window.__saTest.bbFeed(x).facts.map(f => [f.kind, f.value]), n);
        expect(await facts(NEWS78)).toEqual([['date-missing', ['22']], ['date-wrong', ['23']]]);
        expect(await facts('news:essay-1975-12-31-tower-theater-philadelphia-pa')).toEqual([['date-missing', ['1975']]]);
        expect(await facts('files:pass-1989')).toEqual([['files-no-images', true]]);
        const kept = (n, live) => page.evaluate(([x, l]) => window.__saTest.bbFeed(x, l).kept.map(f => [f.kind, f.value]), [n, live]);
        const two = { title: null, parent: null, images: null };
        expect(await kept('x:none', two)).toEqual([]);
        // The page fixed on both counts: nothing left.
        expect(await kept(NEWS78, { ...two, tags: ['22', '1978', 'august', 'news'] })).toEqual([]);
        // A missing and a wrong tag in one fact: only what still holds stays.
        const page2 = { 'news:x-2000-01-02-y': { 'date-parts': { missing: ['02', 'january'], wrong: ['03', '1999'] } } };
        await page.evaluate(f => window.__saTest.bbFeedSet(f), feedOf(page2));
        expect(await kept('news:x-2000-01-02-y', { ...two, tags: ['02', '1999', 'news'] }))
            .toEqual([['date-missing', ['january']], ['date-wrong', ['1999']]]);
        expect(await kept('news:x-2000-01-02-y', { ...two, tags: null }), 'tags unknown (none shown): all stay')
            .toEqual([['date-missing', ['02', 'january']], ['date-wrong', ['03', '1999']]]);
    });

    test('"files" without a picture: dropped once the page has no files tag or shows a picture; the shared icons are no picture', async ({ page }) => {
        await load1972(page, feedOn(REAL2));
        const kept = live => page.evaluate(l => window.__saTest.bbFeed('files:pass-1989', l).kept.map(f => f.kind), live);
        const base = { title: null, parent: null, tags: ['1989', 'content', 'files', 'pass'] };
        expect(await kept({ ...base, images: 0 })).toEqual(['files-no-images']);
        expect(await kept({ ...base, images: null }), 'the window cannot tell').toEqual(['files-no-images']);
        expect(await kept({ ...base, images: 2 })).toEqual([]);
        expect(await kept({ ...base, images: 0, tags: ['1989', 'content', 'pass'] })).toEqual([]);
        // The picture count of a page: the wiki's shared icons do not count.
        expect(await page.evaluate(() => {
            const doc = new DOMParser().parseFromString('<div id="page-content">' +
                '<img src="https://brucebase.wdfiles.com/local--files/content:files/icon_facebook.png">' +
                '<img src="https://brucebase.wdfiles.com/local--files/content:files/icon_youtube.png"></div>', 'text/html');
            const doc2 = new DOMParser().parseFromString('<div id="page-content"><img src="https://brucebase.wdfiles.com/local--resized-images/files:artwork-disco/x.jpg/thumbnail.jpg"></div>', 'text/html');
            return [window.__saTest.bbFeedPictures(doc), window.__saTest.bbFeedPictures(doc2), window.__saTest.bbFeedPictures(new DOMParser().parseFromString('<p></p>', 'text/html'))];
        })).toEqual([0, 1, null]);
    });

    test('a venue\'s head: the date mark stays, "files" goes because the page shows pictures', async ({ page }) => {
        const feed = feedOf({ [ROXY_VENUE]: { 'files-no-images': true, 'date-parts': { missing: ['07'] } } });
        await loadBbEventPage(page, 'venue-roxy-theatre', { settingsOverride: feedOn(feed) });
        await page.click('button[data-label="Show the venue"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const marks = page.locator('p.mb-fd-sub .mb-bb-feed-mark');
        await expect(marks).toHaveCount(1);
        await expect(marks).toHaveText('❌ ◷');
        expect(await marks.getAttribute('title')).toContain(`${ROXY_VENUE} lacks the date tag "07" of the date in its name.`);
        expect(await page.evaluate(() => window.__saTest.bbFeedPictures(document)), 'the Roxy\'s photos').toBeGreaterThan(0);
    });

    test('Songs: the new kinds on the Title cell, the two date findings on one cell, each with its switch', async ({ page }) => {
        const feed = feedOf({ 'song:1945': { 'files-no-images': true }, 'song:30-days-out': { 'date-parts': { missing: ['1'], wrong: ['2'] } } });
        await loadBbSongsPage(page, { settingsOverride: feedOn(feed) });
        await page.click(`button[data-label="${BB_BUTTON}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const cells = await feedCells(page, 'Title');
        expect(cells.map(r => [r.name, r.ids.sort(), r.level]).sort()).toEqual([
            ['song:1945', ['bb-feed-files'], 'warn'],
            ['song:30-days-out', ['bb-feed-date-missing', 'bb-feed-date-wrong'], 'error'],
        ]);
        expect(cells.find(r => r.name === 'song:30-days-out').tip).toContain('lacks the date tag "1" of the date in its name');
        expect((await findingRow(page, 'error', 'bb-feed-date-missing')).count).toBe(1);
        expect((await findingRow(page, 'warn', 'bb-feed-date-wrong')).count).toBe(1);
        expect((await findingRow(page, 'warn', 'bb-feed-files')).count).toBe(1);
    });

    test('the ☰ line names the BruceParser version of the file kept: 0.19.0 against 0.18.0 for one run', async ({ page }) => {
        await load1972(page, feedOn(REAL2));
        const row = page.locator('#mb-saed-bbfeed-btn');
        await expect(row).toHaveText(/^Brucebase feed · run of 2026-11-15 · (\d+ days old · )?BruceParser 0\.19\.0 · 226 pages · read today · Read again$/);
        expect(await row.getAttribute('title')).toContain('written by BruceParser 0.19.0 (feed.sh 1.1, commit edecd7e)');
        expect(await row.getAttribute('title')).toContain('Pages: date-parts 3, dependent-title 39, files-no-images 32, first-letter 10, no-parent 105, no-tags 38.');
    });

    test('a switch off: the date-wrong finding goes, date-missing stays', async ({ page }) => {
        const feed = feedOf({ 'song:30-days-out': { 'date-parts': { missing: ['1'], wrong: ['2'] } } });
        await loadBbSongsPage(page, { settingsOverride: feedOn(feed, 1000, { sa_findings_bb_feed_date_wrong: false }) });
        await page.click(`button[data-label="${BB_BUTTON}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        expect((await feedCells(page, 'Title')).map(r => [r.name, r.ids])).toEqual([['song:30-days-out', ['bb-feed-date-missing']]]);
        expect(await findingRow(page, 'warn', 'bb-feed-date-wrong')).toBeUndefined();
    });
});

/**
 * A year listing's Event cells that carry a feed finding: the anchor their
 * link names, the feed ids, the tooltip.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<{anchor: string, ids: string[], tip: string}>>}
 */
function listingFeedCells(page) {
    return page.evaluate(() => {
        const t = document.querySelector('table.tbl');
        const names = Array.from(t.querySelectorAll('thead tr:first-child th')).map(th => th.dataset.colName || th.textContent.trim());
        const i = names.indexOf('Event');
        return Array.from(t.querySelectorAll('tbody tr')).filter(tr => tr.style.display !== 'none' && tr.cells[i]).map((tr) => {
            const td = tr.cells[i];
            const a = td.querySelector('a[href]');
            const u = a ? new URL(a.href) : null;
            return {
                anchor: u ? `${u.pathname.slice(1)}${u.hash}` : '',
                ids: (td.dataset.mbFindings || '').split(' ').filter(x => x.startsWith('bb-feed-')),
                tip: td.getAttribute('title') || '',
            };
        }).filter(r => r.ids.length);
    });
}

test.describe('the Brucebase feed 1.2: a year listing\'s rows, through the anchors', () => {
    test('BruceParser 0.20.0\'s anchors: the shows the feed names, the shared one with both pages', () => {
        expect(REAL3.run.feed).toBe('1.2');
        expect(Object.keys(REAL3.anchors)).toHaveLength(25);
        expect(REAL3.anchors['1972#000472b']).toEqual([
            'recording:1972-04-00b-mediasound-studios-new-york-city-ny', 'recording:1972-05-00-mediasound-studios-new-york-city-ny',
        ]);
        expect(Object.keys(REAL3.anchors).every(k => /^\d{4}(-\d\d)?#[0-9a-z]+$/.test(k))).toBe(true);
    });

    test('1973: the listing\'s rows of the five shows are ❌ on their Event cell; nothing else', async ({ page }) => {
        await loadBbYearListPage(page, '1973', { settingsOverride: feedOn(REAL3) });
        await page.click(`button[data-label="${BB_YEAR_LIST_BUTTON}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const cells = await listingFeedCells(page);
        expect(cells.map(r => [r.anchor, r.ids])).toEqual(LIST1973.map(([a]) => [a, ['bb-feed-title']]));
        LIST1973.forEach(([, show], i) => expect(cells[i].tip, show).toContain('is titled'));
        expect((await findingRow(page, 'error', 'bb-feed-title')).count).toBe(5);
    });

    test('the lookup: one page, or on a shared anchor the one of the row\'s date; a feed without anchors gives none', async ({ page }) => {
        await load1972(page, feedOn(REAL3));
        const look = (h, d) => page.evaluate(([x, y]) => window.__saTest.bbFeedAnchor(x, y), [h, d]);
        expect(await look(`${BB}1973#290173`, '1973-01-29')).toBe('recording:1973-01-29-914-sound-studios-blauvelt-ny');
        expect(await look(`${BB}1973#290173`, ''), 'one page: no date needed').toBe('recording:1973-01-29-914-sound-studios-blauvelt-ny');
        expect(await look(`${BB}1972#000472b`, '1972-04-00')).toBe('recording:1972-04-00b-mediasound-studios-new-york-city-ny');
        expect(await look(`${BB}1972#000472b`, '1972-05-00')).toBe('recording:1972-05-00-mediasound-studios-new-york-city-ny');
        expect(await look(`${BB}1972#000472b`, ''), 'shared, no date: none').toBe('');
        expect(await look(`${BB}1972#000472b`, '1972-03-00'), 'shared, no page of that date: none').toBe('');
        expect(await look(`${BB}1972#210172`, '1972-01-21'), 'a show the feed does not name').toBe('');
        expect(await look(`${BB}gig:1972-01-21-captain-s-garter-neptune-nj`, ''), 'a page link is no anchor').toBe('');
        // Two pages of one date on a shared anchor: none (planted).
        await page.evaluate(f => window.__saTest.bbFeedSet(f), {
            ...feedOf({}), anchors: { '1999#010199': ['gig:1999-01-01a-x', 'gig:1999-01-01b-y'] },
        });
        expect(await look(`${BB}1999#010199`, '1999-01-01')).toBe('');
        // A feed before 1.2 has no anchors.
        await page.evaluate(f => window.__saTest.bbFeedSet(f), REAL2);
        expect(await look(`${BB}1973#290173`, '1973-01-29')).toBe('');
    });

    test('Save to Disk → Load from Disk keeps the listing\'s marks', async ({ context }) => {
        const source = await context.newPage();
        source.on('pageerror', e => pageErrors.push(String(e.stack || e)));
        await loadBbYearListPage(source, '1973', { settingsOverride: feedOn(REAL3) });
        await source.click(`button[data-label="${BB_YEAR_LIST_BUTTON}"]`);
        await waitForRenderComplete(source, { waitForAutoResize: false });
        expect(await listingFeedCells(source)).toHaveLength(5);
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-bb-feed-list-'));
        try {
            const downloadPromise = source.waitForEvent('download', { timeout: 60000 });
            await clickToolbarItem(source, '#mb-save-to-disk-btn');
            await source.locator('#sa-sd-save-confirm').waitFor({ state: 'visible', timeout: 15000 });
            await source.click('#sa-sd-save-confirm');
            const saved = path.join(tmpDir, 'bb-year-list.json.gz');
            await (await downloadPromise).saveAs(saved);
            await source.close();
            const page = await context.newPage();
            page.on('pageerror', e => pageErrors.push(String(e.stack || e)));
            await loadBbYearListPage(page, '1973', { settingsOverride: feedOn(REAL3) });
            await clickToolbarItem(page, '#mb-load-from-disk-btn');
            await page.locator('input[type="file"][accept*="json"]').setInputFiles(saved);
            const renderBtn = page.locator('#sa-render-no-filter-confirm');
            await renderBtn.waitFor({ state: 'attached', timeout: 15000 });
            await renderBtn.evaluate(el => el.click());
            await waitForRenderComplete(page, { waitForAutoResize: false });
            expect((await listingFeedCells(page)).map(r => r.anchor)).toEqual(LIST1973.map(([a]) => a));
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    test('a year-anchor window on Brucebase: the show\'s mark after its title', async ({ page }) => {
        // A planted feed names 1972-01-21 (#210172) of the 1972 fixture (the
        // test was written while the reader took six-digit anchors only; the
        // lettered ones are bb-date-links.spec.js'). On the 1973 listing
        // a link to it is another page's anchor (on 1972's own page an
        // in-page one, no preview); the window reads 1972's year page, served
        // from its fixture. The show comes from the entry's gig link
        // (`bbFeedPage`).
        const show = 'gig:1972-01-21-captain-s-garter-neptune-nj';
        const feed = { ...feedOf({ [show]: { 'no-tags': true } }), anchors: { '1972#210172': [show] } };
        // The reader asks through GM_xmlhttpRequest (not page.route).
        const html = fs.readFileSync(path.join(__dirname, 'bb-year-1972-findings.html'), 'utf8');
        await page.addInitScript(({ url, body }) => {
            window.__gmXhrResponses = Object.assign(window.__gmXhrResponses || {}, {
                [url]: { status: 200, responseHeaders: 'content-type: text/html; charset=utf-8\r\n', responseText: body, finalUrl: url },
            });
        }, { url: `${BB}1972`, body: html });
        await loadBbYearListPage(page, '1973', { settingsOverride: { ...feedOn(feed), sa_pop_ext: true } });
        await page.click(`button[data-label="${BB_YEAR_LIST_BUTTON}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await page.evaluate((h) => {
            const real = document.querySelector('table.tbl tbody a.mb-bb-show-link');
            const a = document.createElement('a');
            a.href = h;
            a.id = 'mb-test-anchor-link';
            a.className = 'mb-bb-show-link';
            a.textContent = ' 1972-01-21';
            real.parentNode.appendChild(a);
        }, `${BB}1972#210172`);
        const link = page.locator('#mb-test-anchor-link');
        expect(await link.evaluate(a => window.__saTest.popResolve(a))).toContain('bbdate');
        await link.scrollIntoViewIfNeeded();
        await page.keyboard.down('Control');
        await link.hover();
        await page.keyboard.up('Control');
        await expect(page.locator('#mb-dp-peek')).toBeVisible();
        await page.keyboard.press('Space');
        const title = page.locator('#mb-dp-dialog .mb-dp-xtitle');
        await expect(title).toContainText('CAPTAIN\'S GARTER');
        await expect(title.locator('.mb-bb-feed-mark')).toHaveText('❌ ⊘');
        expect(await title.locator('.mb-bb-feed-mark').getAttribute('title')).toContain(`${show} has no tag at all`);
    });
});

test.describe('the Brucebase feed 1.3: MusicBrainz events', () => {
    /**
     * Loads the artist-events fixture with the feed on MusicBrainz.
     *
     * @param {import('@playwright/test').Page} page
     * @param {Object<string, *>} settings
     * @returns {Promise<void>}
     */
    async function loadMbEvents(page, settings) {
        await page.route(/^https?:\/\//, route => route.abort('blockedbyclient'));
        await loadUserscriptPage(page, { url: MB_EVENTS_URL, fixtureFile: MB_EVENTS_FILE, testMode: true, settingsOverride: settings });
        await page.route(`${MB_EVENTS_URL}*`, r => r.fulfill({ path: MB_EVENTS_FILE, contentType: 'text/html' }));
    }
    /** @returns {Promise<Array<{mbid: string, ids: string[], level: string, tip: string}>>} The Event cells with a feed finding. */
    const mbCells = page => page.evaluate(() => {
        const t = document.querySelector('table.tbl');
        const names = Array.from(t.querySelectorAll('thead tr:first-child th')).map(th => th.dataset.colName || th.textContent.trim());
        const i = names.indexOf('Event');
        return Array.from(t.querySelectorAll('tbody tr')).filter(tr => tr.cells[i]).map((tr) => {
            const td = tr.cells[i];
            const a = td.querySelector('a[href*="/event/"]');
            return { mbid: a ? a.getAttribute('href').split('/event/')[1] : '', ids: (td.dataset.mbFindings || '').split(' ').filter(x => x.startsWith('bb-mb-')),
                level: td.dataset.mbFinding || '', tip: td.getAttribute('title') || '' };
        }).filter(r => r.ids.length);
    });

    test('BruceParser 0.21.0\'s mb: the counts of the run, the Pittsburgh case with its likely entry', () => {
        expect(REAL4.run.feed).toBe('1.3');
        const kinds = {};
        Object.values(REAL4.mb).forEach((f) => { kinds[f.kind] = (kinds[f.kind] || 0) + 1; });
        expect(kinds).toEqual({ 'no-entry': 197, 'shared': 18, 'not-anchor': 1 });
        const pit = REAL4.mb['f60ec13f-0c48-4c64-b80d-b4a226207017'];
        expect(pit.kind).toBe('no-entry');
        expect(pit.candidates.filter(c => c.likely).map(c => c.anchor)).toEqual(['2023#120923b']);
        expect(Object.keys(REAL4.mb).every(k => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(k))).toBe(true);
    });

    test('an event list: the three events on their Event cell, each kind its level; the menus count them and end with the feed\'s line', async ({ page }) => {
        await loadMbEvents(page, { ...feedOn(mbFeed()), sa_bb_feed_mb: true });
        await page.click('button[data-label="Show all Events for Artist"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const cells = await mbCells(page);
        expect(cells.map(r => [r.mbid, r.ids, r.level])).toEqual([
            [EV(1), ['bb-mb-no-entry'], 'error'],
            [EV(2), ['bb-mb-shared'], 'warn'],
            [EV(4), ['bb-mb-not-anchor'], 'warn'],
        ]);
        expect(cells[0].tip).toContain('has no entry #120923: it writes this date with a letter now');
        expect(cells[1].tip).toContain('likely this link is the wrong one');
        expect((await findingRow(page, 'error', 'bb-mb-no-entry')).count).toBe(1);
        expect((await findingRow(page, 'warn', 'bb-mb-shared')).count).toBe(1);
        expect(await page.evaluate(() => [...document.querySelectorAll('.mb-findings-feed-item')].map(x => x.textContent))).toEqual(
            expect.arrayContaining([expect.stringMatching(/^Brucebase feed · run of /)]));
    });

    test('the card: the wiki\'s entries of the date as links, the likely one marked; Esc closes it', async ({ page }) => {
        await loadMbEvents(page, { ...feedOn(mbFeed()), sa_bb_feed_mb: true });
        await page.click('button[data-label="Show all Events for Artist"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const cell = page.locator(`table.tbl tbody td[data-mb-findings~="bb-mb-no-entry"]`).first();
        await cell.hover();
        const card = page.locator('#mb-bbmb-card');
        await expect(card).toBeVisible();
        await expect(card.locator('.mb-bbmb-ttl')).toHaveText('❌ ⚓ Brucebase link reaches no entry');
        expect(await card.locator('.mb-bbmb-cands a').evaluateAll(as => as.map(a => a.getAttribute('href')))).toEqual([
            'https://brucebase.wikidot.com/2023#120923a', 'https://brucebase.wikidot.com/2023#120923b',
        ]);
        await expect(card.locator('li.mb-bbmb-likely')).toContainText('PPG PAINTS ARENA, PITTSBURGH, PA');
        await page.keyboard.press('Escape');
        await expect(card).toBeHidden();
    });

    test('a stale feed is read on an event list\'s press, not before it', async ({ page }) => {
        await answerFeed(page, { body: JSON.stringify(mbFeed()) });
        await loadMbEvents(page, { ...feedOn(mbFeed(), 2 * DAY), sa_bb_feed_mb: true });
        expect(await feedAsks(page), 'not before the press').toBe(0);
        await page.click('button[data-label="Show all Events for Artist"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await expect.poll(() => feedAsks(page)).toBe(1);
    });

    test('a kept file older than 1.3 (no mb map) is read on the press once it was read an hour ago, then marks; not within the hour', async ({ page }) => {
        // vzell's live check of 2026-11-18: 0.20.0's file, kept from a
        // Brucebase page less than a day before, and nothing marked.
        const old = mbFeed();
        delete old.mb;
        await answerFeed(page, { body: JSON.stringify(mbFeed()) });
        await loadMbEvents(page, { ...feedOn(old, 2 * 3600 * 1000), sa_bb_feed_mb: true });
        expect(await feedAsks(page), 'not before the press').toBe(0);
        await page.click('button[data-label="Show all Events for Artist"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await expect.poll(() => feedAsks(page)).toBe(1);
        await expect.poll(async () => (await mbCells(page)).map(r => r.mbid)).toEqual([EV(1), EV(2), EV(4)]);
    });

    test('a kept file without the mb map, read within the hour, is not read again', async ({ page }) => {
        const old = mbFeed();
        delete old.mb;
        await answerFeed(page, { body: JSON.stringify(mbFeed()) });
        await loadMbEvents(page, { ...feedOn(old, 10 * 60 * 1000), sa_bb_feed_mb: true });
        await page.click('button[data-label="Show all Events for Artist"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        expect(await feedAsks(page)).toBe(0);
        expect(await mbCells(page)).toEqual([]);
    });

    test('the MusicBrainz switch off: no read, no mark', async ({ page }) => {
        await answerFeed(page, { body: JSON.stringify(mbFeed()) });
        await loadMbEvents(page, { ...feedOn(mbFeed(), 2 * DAY), sa_bb_feed_mb: false });
        await page.click('button[data-label="Show all Events for Artist"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        expect(await feedAsks(page)).toBe(0);
        expect(await mbCells(page)).toEqual([]);
        expect(await page.evaluate(() => window.__saTest.bbFeedMb('eeeeeeee-0000-0000-0000-000000000001').on)).toBe(false);
    });

    test('a press on a MusicBrainz page that lists no events reads nothing, the switch on', async ({ page }) => {
        const rgUrl = 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f';
        const rgFile = path.join(__dirname, 'html-fetch-transient-rg.html');
        await answerFeed(page, { body: JSON.stringify(mbFeed()) });
        await page.route(/^https?:\/\//, route => route.abort('blockedbyclient'));
        await loadUserscriptPage(page, { url: rgUrl, fixtureFile: rgFile, testMode: true, settingsOverride: { ...feedOn(mbFeed(), 2 * DAY), sa_bb_feed_mb: true } });
        await page.route('https://musicbrainz.org/artist/**', r => r.fulfill({ path: rgFile, contentType: 'text/html' }));
        await page.locator('#mb-saed-bar button.mb-seg-action[data-label*="Artist RGs"]').first().click();
        await waitForRenderComplete(page, { waitForAutoResize: false });
        expect(await feedAsks(page)).toBe(0);
    });

    test('Save to Disk → Load from Disk keeps the Event cells\' marks', async ({ context }) => {
        const settings = { ...feedOn(mbFeed()), sa_bb_feed_mb: true };
        const source = await context.newPage();
        source.on('pageerror', e => pageErrors.push(String(e.stack || e)));
        await loadMbEvents(source, settings);
        await source.click('button[data-label="Show all Events for Artist"]');
        await waitForRenderComplete(source, { waitForAutoResize: false });
        expect(await mbCells(source)).toHaveLength(3);
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-bb-feed-mb-'));
        try {
            const downloadPromise = source.waitForEvent('download', { timeout: 60000 });
            await clickToolbarItem(source, '#mb-save-to-disk-btn');
            await source.locator('#sa-sd-save-confirm').waitFor({ state: 'visible', timeout: 15000 });
            await source.click('#sa-sd-save-confirm');
            const saved = path.join(tmpDir, 'artist-events.json.gz');
            await (await downloadPromise).saveAs(saved);
            await source.close();
            const page = await context.newPage();
            page.on('pageerror', e => pageErrors.push(String(e.stack || e)));
            await loadMbEvents(page, settings);
            await clickToolbarItem(page, '#mb-load-from-disk-btn');
            await page.locator('input[type="file"][accept*="json"]').setInputFiles(saved);
            const renderBtn = page.locator('#sa-render-no-filter-confirm');
            await renderBtn.waitFor({ state: 'attached', timeout: 15000 });
            await renderBtn.evaluate(el => el.click());
            await waitForRenderComplete(page, { waitForAutoResize: false });
            expect((await mbCells(page)).map(r => [r.mbid, r.ids])).toEqual([
                [EV(1), ['bb-mb-no-entry']], [EV(2), ['bb-mb-shared']], [EV(4), ['bb-mb-not-anchor']],
            ]);
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    test('an event page: the mark beside its Brucebase link, from the kept feed, with no request at load', async ({ page }) => {
        const id = '3f2ca30a-7de4-4964-ad30-48376535fec8';
        const feed = { ...feedOf({}), mb: { [id]: { kind: 'no-entry', link: '2025#200525', date: '2025-05-20', candidates: [
            { anchor: '2025#200525a', page: 'gig:2025-05-20a-x', heading: '2025-05-20 - SOMEWHERE', likely: true }] } } };
        await answerFeed(page, { body: JSON.stringify(feed) });
        await page.route(/^https?:\/\//, route => route.abort('blockedbyclient'));
        await loadUserscriptPage(page, {
            url: `https://musicbrainz.org/event/${id}`, fixtureFile: path.join(__dirname, 'event-overview.html'), testMode: true,
            settingsOverride: { ...feedOn(feed, 2 * DAY), sa_bb_feed_mb: true },
        });
        const mark = page.locator('ul.external_links button.mb-bbmb-mark');
        await expect(mark).toHaveText('❌ ⚓');
        expect(await mark.evaluate(b => b.previousSibling && b.previousSibling.previousSibling && b.previousSibling.previousSibling.getAttribute('href'))).toContain('brucebase.wikidot.com/2025#200525');
        expect(await feedAsks(page), 'the page load reads nothing').toBe(0);
        await mark.click();
        await expect(page.locator('#mb-bbmb-card li.mb-bbmb-likely')).toContainText('2025-05-20 - SOMEWHERE');
    });
});

test.describe('the Brucebase feed: MusicBrainz', () => {
    test('a MusicBrainz page reads no feed on a press and has no Brucebase row', async ({ page }) => {
        const url = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/events';
        const file = path.join(__dirname, 'artist-events-names.html');
        await page.route(/^https?:\/\//, route => route.abort('blockedbyclient'));
        await answerFeed(page, { body: JSON.stringify(REAL) });
        await loadUserscriptPage(page, { url, fixtureFile: file, testMode: true, settingsOverride: feedOn(REAL, 2 * DAY) });
        await page.route(`${url}*`, r => r.fulfill({ path: file, contentType: 'text/html' }));
        await page.click('button[data-label="Show all Events for Artist"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        expect(await feedAsks(page)).toBe(0);
        expect(await page.locator('#mb-saed-bbfeed-btn').count()).toBe(0);
        expect(await page.locator('[data-mb-findings*="bb-feed-"]').count()).toBe(0);
    });
});
