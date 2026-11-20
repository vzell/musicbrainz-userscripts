'use strict';

// The Brucebase feed 1.8: MusicBrainz works whose Brucebase link is doubtful
// (org/springsteen-marriage.org, Track A idea 5, check 2; mockup
// https://claude.ai/artifact/5fTN5NNCgvMNehzPscurWn, vzell's answers of
// 2026-11-20 all as recommended). BruceParser 0.27.0's mb-works.awk writes
// `mbWorks`, keyed by work MBID: a link that reaches nothing (bb-mbw-none ❌ ⚓,
// with the likely right target), a song page two works link (bb-mbw-shared
// ⚠️ ⇉), a title that is not the song's (bb-mbw-title ⚠️ ≉). Marked on the
// Work cell of an artist's works and beside a work page's Brucebase link (and
// its copy in the rendered "Sidebar" card), in the events' card.
//
// Real data: tests/fixtures/bb-feed-2026-11-19-works.json is the feed 1.8 of
// the run of 2026-11-19 with its whole `mbWorks`
// (scripts/build-bb-feed-dates-fixture.py --map mbWorks). The list cases plant
// a small feed on the four works of artist-works-pending-edits.html; the work
// page case adds a Brucebase link to rel-work-overview.html's sidebar.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { findingRow } = require('../support/findingsMenu');

const FEED_URL = 'https://raw.githubusercontent.com/vzell/brucebase-feed/main/bb-feed.json';
const WORKS = JSON.parse(fs.readFileSync(path.join(__dirname, 'bb-feed-2026-11-19-works.json'), 'utf8'));
const LIST_URL = 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f/works';
const LIST_FILE = path.join(__dirname, 'artist-works-pending-edits.html');
const LIST_BUTTON = 'button[data-label="Show all Works for Artist"]';
const WORK_ID = '1f573511-eb4b-3106-8fb2-f15de52e4868';
const WORK_URL = `https://musicbrainz.org/work/${WORK_ID}`;
const W = n => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
const DAY = 24 * 3600 * 1000;
const GREET = 'stats:greetings-from-asbury-park-nj-studio-sessions';

/**
 * A feed of format 1 with `extra` maps, from a run `daysAgo` days back.
 *
 * @param {Object} extra
 * @param {number} [daysAgo]
 * @returns {Object}
 */
function feedOf(extra, daysAgo = 1) {
    const date = new Date(Date.now() - daysAgo * DAY).toISOString().slice(0, 10);
    return { format: 1, run: { date, bruceparser: '0.27.0', commit: 'test', feed: '1.8' }, site: 'https://brucebase.wikidot.com/',
        credit: 'test', reports: {}, pages: {}, anchors: {}, mb: {}, ...extra };
}

/**
 * The four works of the fixture, one per case: W(1) a link that reaches
 * nothing (a gone page, two candidates, the first likely), W(2) and W(3) one
 * song page, W(4) a title.
 *
 * @param {number} [daysAgo]
 * @returns {Object}
 */
function worksFeed(daysAgo = 1) {
    return feedOf({ mbWorks: {
        [W(1)]: { kind: 'no-target', link: 'stats:greetings-from-asbury-park-studio-sessions#blindedbythelight', work: 'Livin’ on a Prayer', missing: 'page',
            candidates: [{ link: `${GREET}#blindedbythelight`, likely: true }, { link: `${GREET}-details#blindedbythelight` }] },
        [W(2)]: { kind: 'shared', link: 'song:don-t-back-down', work: 'Wanted Dead or Alive', title: 'Don\'t Back Down',
            others: [{ mbid: W(3), title: 'You Give Love a Bad Name' }] },
        [W(3)]: { kind: 'shared', link: 'song:don-t-back-down', work: 'You Give Love a Bad Name', title: 'Don\'t Back Down',
            others: [{ mbid: W(2), title: 'Wanted Dead or Alive' }] },
        [W(4)]: { kind: 'title', link: 'song:tarantella-napoletana', work: 'Blaze of Glory', title: 'Tarantella Napoletana' },
    } }, daysAgo);
}

/**
 * Settings that turn the feed on with `kept` as the kept copy, read `ageMs` ago.
 *
 * @param {?Object} kept
 * @param {number} [ageMs]
 * @returns {Object<string, *>}
 */
function feedOn(kept, ageMs = 1000) {
    return {
        sa_bb_feed: true, sa_bb_feed_mb: true, sa_render_threshold: 100000,
        ...(kept ? { mb_sa_bb_feed: { at: Date.now() - ageMs, data: kept, err: '', errAt: 0 } } : {}),
    };
}

/**
 * Answers the feed's address with `body` (before the page loads).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} body
 * @returns {Promise<void>}
 */
async function answerFeed(page, body) {
    await page.addInitScript(({ url, b }) => {
        window.__gmXhrResponses = Object.assign(window.__gmXhrResponses || {}, {
            [url]: { status: 200, responseHeaders: 'content-type: text/plain; charset=utf-8\r\n', responseText: b, finalUrl: url },
        });
    }, { url: FEED_URL, b: body });
}

/** @returns {Promise<number>} How often the feed was asked for. */
const feedAsks = page => page.evaluate(u => (window.__gmXhrLog || []).filter(r => r.url === u).length, FEED_URL);

/**
 * Loads the artist's works with `settings` and presses "Show all Works".
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object<string, *>} settings
 * @returns {Promise<void>}
 */
async function showWorks(page, settings) {
    await page.route(/^https?:\/\//, route => route.abort('blockedbyclient'));
    await loadUserscriptPage(page, { url: LIST_URL, fixtureFile: LIST_FILE, testMode: true, settingsOverride: settings });
    await page.route(`${LIST_URL}*`, r => r.fulfill({ path: LIST_FILE, contentType: 'text/html' }));
    await page.click(LIST_BUTTON);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/** @returns {Promise<Array<{mbid: string, ids: string[], level: string, tip: string}>>} The Work cells with a feed finding. */
const workCells = page => page.evaluate(() => {
    const t = document.querySelector('table.tbl');
    const names = Array.from(t.querySelectorAll('thead tr:first-child th')).map(th => th.dataset.colName || th.textContent.trim());
    const i = names.indexOf('Work');
    return Array.from(t.querySelectorAll('tbody tr')).filter(tr => tr.cells[i]).map((tr) => {
        const td = tr.cells[i];
        const a = td.querySelector('a[href*="/work/"]');
        return { mbid: a ? a.getAttribute('href').split('/work/')[1] : '', ids: (td.dataset.mbFindings || '').split(' ').filter(x => x.startsWith('bb-mbw-')),
            level: td.dataset.mbFinding || '', tip: td.getAttribute('title') || '' };
    }).filter(r => r.ids.length);
});

test.describe('the Brucebase feed 1.8: MusicBrainz works', () => {
    test('BruceParser 0.27.0\'s mbWorks: the counts of the run, the renamed Greetings page and King\'s Rock with their likely target', () => {
        expect(WORKS.run.feed).toBe('1.8');
        const kinds = {};
        Object.values(WORKS.mbWorks).forEach((f) => { kinds[f.kind] = (kinds[f.kind] || 0) + 1; });
        expect(kinds).toEqual({ 'no-target': 10, 'shared': 2, 'title': 2 });
        const blinded = WORKS.mbWorks['7a757d97-da2a-3751-8d32-94d471de2eeb'];
        expect(blinded).toMatchObject({ kind: 'no-target', missing: 'page', link: 'stats:greetings-from-asbury-park-studio-sessions#blindedbythelight' });
        expect(blinded.candidates[0]).toEqual({ link: `${GREET}#blindedbythelight`, likely: true });
        expect(WORKS.mbWorks['fdb63bfc-2429-474a-816d-281d1d33ceb3'].candidates).toEqual([
            { link: 'stats:darkness-on-the-edge-of-town-studio-sessions#kingsrock', likely: true }]);
    });

    test('an artist\'s works: each kind on its Work cell with its level, the hover text in words; the menus count them', async ({ page }) => {
        await showWorks(page, feedOn(worksFeed()));
        const cells = await workCells(page);
        expect(cells.map(r => [r.mbid, r.ids, r.level])).toEqual([
            [W(1), ['bb-mbw-none'], 'error'],
            [W(2), ['bb-mbw-shared'], 'warn'],
            [W(3), ['bb-mbw-shared'], 'warn'],
            [W(4), ['bb-mbw-title'], 'warn'],
        ]);
        expect(cells[0].tip).toContain('Brucebase has no page stats:greetings-from-asbury-park-studio-sessions. Pages with its anchor #blindedbythelight: '
            + `${GREET}#blindedbythelight (likely); ${GREET}-details#blindedbythelight.`);
        expect(cells[1].tip).toContain('Its link is the song page "Don\'t Back Down", which another work links too: You Give Love a Bad Name.');
        expect(cells[3].tip).toContain('Its link is the song "Tarantella Napoletana"; the work is "Blaze of Glory", and none of its aliases is the song\'s title.');
        expect((await findingRow(page, 'error', 'bb-mbw-none')).count).toBe(1);
        expect((await findingRow(page, 'warn', 'bb-mbw-shared')).count).toBe(2);
        expect((await findingRow(page, 'warn', 'bb-mbw-title')).count).toBe(1);
        expect(await page.evaluate(() => [...document.querySelectorAll('.mb-findings-feed-item')].map(x => x.textContent))).toEqual(
            expect.arrayContaining([expect.stringMatching(/^Brucebase feed · run of /)]));
    });

    test('the card: where a link that reaches nothing likely should go, the likely one first; the other work of a shared song', async ({ page }) => {
        await showWorks(page, feedOn(worksFeed()));
        const card = page.locator('#mb-bbmb-card');
        await page.locator('table.tbl tbody td[data-mb-findings~="bb-mbw-none"]').hover();
        await expect(card).toBeVisible();
        await expect(card.locator('.mb-bbmb-ttl')).toHaveText('❌ ⚓ Brucebase link reaches nothing');
        await expect(card.locator('.mb-bbmb-cmp dt')).toHaveText(['Work', 'Links']);
        await expect(card.locator('li.mb-bbmb-likely a')).toHaveAttribute('href', `https://brucebase.wikidot.com/${GREET}#blindedbythelight`);
        await expect(card.locator('.mb-bbmb-cands li')).toHaveCount(2);
        await page.keyboard.press('Escape');
        await expect(card).toBeHidden();
        await page.locator(`table.tbl tbody td[data-mb-findings~="bb-mbw-shared"]:has(a[href="/work/${W(2)}"])`).hover();
        await expect(card.locator('.mb-bbmb-ttl')).toHaveText('⚠️ ⇉ Two works link one Brucebase song');
        await expect(card.locator('.mb-bbmb-cands a')).toHaveAttribute('href', `/work/${W(3)}`);
    });

    test('each kind\'s own switch: the title check off leaves the others', async ({ page }) => {
        await showWorks(page, { ...feedOn(worksFeed()), sa_findings_bb_mbw_title: false });
        expect((await workCells(page)).map(r => [r.mbid, r.ids])).toEqual([
            [W(1), ['bb-mbw-none']], [W(2), ['bb-mbw-shared']], [W(3), ['bb-mbw-shared']]]);
    });

    test('the MusicBrainz switch off: no mark on the works', async ({ page }) => {
        await showWorks(page, { ...feedOn(worksFeed()), sa_bb_feed_mb: false });
        expect(await workCells(page)).toEqual([]);
    });

    test('the words of a missing anchor (King\'s Rock, the real feed)', async ({ page }) => {
        await page.route(/^https?:\/\//, route => route.abort('blockedbyclient'));
        await loadUserscriptPage(page, { url: LIST_URL, fixtureFile: LIST_FILE, testMode: true, settingsOverride: feedOn(WORKS) });
        await page.waitForFunction(() => window.__saTest && window.__saTest.bbFeedMbw);
        const r = await page.evaluate(id => window.__saTest.bbFeedMbw(id), 'fdb63bfc-2429-474a-816d-281d1d33ceb3');
        expect(r.fact.kind).toBe('no-target');
        expect(r.text).toBe('The page stats:darkness-on-the-edge-of-town-studio-sessions has no anchor #kingsrockkingsbigchance. '
            + 'Its anchors that start the same: stats:darkness-on-the-edge-of-town-studio-sessions#kingsrock (likely).');
    });

    test('a kept feed without mbWorks (1.7), read two hours ago: a works list\'s press reads it again', async ({ page }) => {
        const old = feedOf({});
        old.run.feed = '1.7';
        await answerFeed(page, JSON.stringify(worksFeed()));
        await showWorks(page, feedOn(old, 2 * 3600 * 1000));
        await expect.poll(() => feedAsks(page)).toBe(1);
        await expect.poll(async () => (await workCells(page)).length).toBe(4);
    });

    /**
     * The work-page fixture with a Brucebase link in its sidebar, written to a
     * temp file; the work is planted as no-target in the kept feed.
     *
     * @param {import('@playwright/test').Page} page
     * @param {string} dir - A temp directory for the changed fixture.
     * @returns {Promise<string>} The changed fixture's path.
     */
    async function loadMarkedWork(page, dir) {
        const src = fs.readFileSync(path.join(__dirname, 'rel-work-overview.html'), 'utf8');
        const link = 'http://brucebase.wikidot.com/stats:wild-innocent-e-street-shuffle-studio-sessions#4thofjulyasburypark';
        const html = src.replace('<ul class="external_links">', `<ul class="external_links"><li class="no-favicon"><a href="${link}">Brucebase</a></li>`);
        expect(html).not.toBe(src);
        const file = path.join(dir, 'rel-work-overview-bb.html');
        fs.writeFileSync(file, html);
        const feed = feedOf({ mbWorks: { [WORK_ID]: { kind: 'no-target', link: link.replace('http://brucebase.wikidot.com/', ''),
            work: '4th of July, Asbury Park (Sandy)', missing: 'anchor', candidates: [{ link: 'stats:wild-innocent-e-street-shuffle-studio-sessions#4thofjuly', likely: true }] } } });
        await page.route(/^https?:\/\//, route => route.abort('blockedbyclient'));
        await loadUserscriptPage(page, { url: WORK_URL, fixtureFile: file, testMode: true,
            settingsOverride: { ...feedOn(feed), sa_sidebar_inline_collapsed: false } });
        return file;
    }

    test('a work page: ❌ ⚓ beside its Brucebase link, from the kept feed; after the press also in the Sidebar card, and its hover opens the card', async ({ page }) => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-mbw-'));
        try {
            const file = await loadMarkedWork(page, dir);
            await expect(page.locator('#sidebar ul.external_links button.mb-bbmb-mark')).toHaveText('❌ ⚓');
            await expect(page.locator('#sidebar ul.external_links button.mb-bbmb-mark')).toHaveAttribute('data-mb-bbmb-type', 'work');
            await page.route(`${WORK_URL}*`, r => r.fulfill({ path: file, contentType: 'text/html' }));
            await page.click('button[data-label="Show all Recordings for Work"]');
            await waitForRenderComplete(page, { waitForAutoResize: false });
            const chip = page.locator('.mb-sb-inline .mb-sb-chip:has(a[href*="brucebase.wikidot.com"])');
            await expect(chip).toHaveCount(1);
            await expect(chip).not.toContainText('⚓');
            const mark = page.locator('button.mb-bbmb-mark:visible');
            await expect(mark).toHaveCount(1);
            await mark.hover();
            const card = page.locator('#mb-bbmb-card');
            await expect(card.locator('.mb-bbmb-ttl')).toHaveText('❌ ⚓ Brucebase link reaches nothing');
            await expect(card).toContainText('The page stats:wild-innocent-e-street-shuffle-studio-sessions has no anchor #4thofjulyasburypark.');
            await expect(card.locator('li.mb-bbmb-likely a')).toHaveText('stats:wild-innocent-e-street-shuffle-studio-sessions#4thofjuly');
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
});
