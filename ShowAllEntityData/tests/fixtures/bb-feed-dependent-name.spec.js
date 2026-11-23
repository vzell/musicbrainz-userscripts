'use strict';

// The Brucebase feed 1.6: a show's dependent page named differently from the
// show its breadcrumbs name (org/springsteen-marriage.org, Track A idea 4;
// vzell, 2026-11-20: instead of BruceParser's URL-shortening report, a
// WARNING). BruceParser 0.24.0's dependent-names.awk judges every gignote,
// gallery, eye, media and recnote page of a run; ShowAllEntityData's
// scripts/probe-bb-dependent-names.py finds the same 36 pages in the run of
// 2026-11-19. The script marks them as it marks dependent-title: bb-feed-name
// ⚠️ ⇋ on the page's own row and on its show (rows, the show's head and
// window), from an index of the feed's `event` read backwards
// (`_bbFeed.byEventName`).
//
// Real data: tests/fixtures/bb-feed-2026-11-19-names.json is that run's feed
// 1.6 cut to this kind (scripts/build-bb-feed-names-fixture.py): its 36
// pages and the anchors of their shows. The 1968 year page holds
// gig:1968-11-00-off-broad-street-coffee-house-red-bank-nj, whose gallery
// is gallery:1968-11-00-off-broad-street-red-bank-nj; the 1978 listing holds
// three of the shows through their anchors. The head and own-row cases use a
// small feed naming pages the fixtures have.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadBbYearPage, loadBbYearListPage, loadBbEventPage, loadBbChangesPage,
    BB_YEAR_BUTTON, BB_YEAR_LIST_BUTTON } = require('../support/bbFixture');
const { waitForRenderComplete } = require('../support/browser');
const { findingRow, clickFinding, findingRowState } = require('../support/findingsMenu');

const NAMES = JSON.parse(fs.readFileSync(path.join(__dirname, 'bb-feed-2026-11-19-names.json'), 'utf8'));
const BB = 'https://brucebase.wikidot.com/';
const DAY = 24 * 3600 * 1000;
const SHOW68 = 'gig:1968-11-00-off-broad-street-coffee-house-red-bank-nj';
const GALLERY68 = 'gallery:1968-11-00-off-broad-street-red-bank-nj';
const ROXY = 'gig:1978-07-07-roxy-theatre-west-hollywood-ca';
const BOARDWALK = 'gallery:1978-09-23-boardwalk-asbury-park-nj';
const LIST1978 = ['1978#030678', '1978#150778a', '1978#300878b'];

/**
 * A feed of format 1 naming `pages`, from a run `daysAgo` days back.
 *
 * @param {Object<string, Object>} pages
 * @param {number} [daysAgo]
 * @returns {Object}
 */
function feedOf(pages, daysAgo = 1) {
    const date = new Date(Date.now() - daysAgo * DAY).toISOString().slice(0, 10);
    return { format: 1, run: { date, bruceparser: '0.24.0', commit: 'test', feed: '1.6' }, site: BB, credit: 'test', reports: {}, pages };
}

/**
 * Settings that turn the feed on with `kept` as the kept copy, read a second ago.
 *
 * @param {Object} kept
 * @param {Object} [extra]
 * @returns {Object<string, *>}
 */
function feedOn(kept, extra = {}) {
    return {
        sa_bb_feed: true, sa_foreign_mb_titles: false, sa_foreign_typography: false, sa_render_threshold: 100000,
        mb_sa_bb_feed: { at: Date.now() - 1000, data: kept, err: '', errAt: 0 },
        ...extra,
    };
}

/**
 * The live cells of a column that carry a feed stamp: the page their first
 * link names (a year listing's anchor as "1978#030678"), the stamps, the
 * level and the tooltip.
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
        return Array.from(t.querySelectorAll('tbody tr')).filter(tr => tr.style.display !== 'none' && tr.cells[i]).map((tr) => {
            const td = tr.cells[i];
            const a = td.querySelector('a.mb-bb-event-link[href]') || td.querySelector('a[href]');
            const u = a ? new URL(a.href) : null;
            return {
                name: u ? decodeURIComponent(u.pathname.slice(1)) + u.hash : '',
                ids: (td.dataset.mbFindings || '').split(' ').filter(x => x.startsWith('bb-feed-')),
                level: td.dataset.mbFinding || '',
                tip: td.getAttribute('title') || '',
            };
        }).filter(r => r.ids.length);
    }, col);
}

/**
 * Loads a year page and shows all its events.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} year
 * @param {Object<string, *>} settings
 * @returns {Promise<void>}
 */
async function showYear(page, year, settings) {
    await page.route(/^https?:\/\//, route => route.abort('blockedbyclient'));
    await loadBbYearPage(page, year, { settingsOverride: settings });
    await page.click(`button[data-label="${BB_YEAR_BUTTON}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

let pageErrors;
test.beforeEach(({ page }) => {
    pageErrors = [];
    page.on('pageerror', e => pageErrors.push(String(e.stack || e)));
});
test.afterEach(() => {
    expect(pageErrors, 'no script error').toEqual([]);
});

test.describe('the Brucebase feed 1.6: a page named differently from its show', () => {
    test('BruceParser 0.24.0\'s kind: the 36 pages of the run, each with its show and the name it would have', () => {
        expect(NAMES.run).toMatchObject({ date: '2026-11-19', bruceparser: '0.24.0', feed: '1.6' });
        expect(NAMES.reports['dependent-name'].count).toBe(36);
        const entries = Object.entries(NAMES.pages);
        expect(entries).toHaveLength(36);
        entries.forEach(([name, kinds]) => {
            const v = kinds['dependent-name'];
            expect(name, name).toMatch(/^(gignote|gallery|eye|media|recnote):[a-z0-9-]+$/);
            expect(v.event, name).toMatch(/^(gig|nogig|rehearsal|recording|interview|nobruce):[a-z0-9-]+$/);
            // The page's own kind, the show's name after the colon, Wikidot's 60 characters.
            expect(v.expected.startsWith(`${name.split(':')[0]}:`), name).toBe(true);
            expect(v.expected.length, name).toBeLessThanOrEqual(60);
            expect(v.expected, name).not.toBe(name);
        });
        // The cases the record names: a day letter, a typo, a wrong date and place.
        expect(NAMES.pages['gallery:1967-11-00-first-presbyterian-church-freehold-nj']['dependent-name']).toEqual({
            event: 'gig:1967-11-00a-first-presbyterian-church-freehold-nj', expected: 'gallery:1967-11-00a-first-presbyterian-church-freehold-nj' });
        expect(NAMES.pages['gallery:1999-06-02-palais-omnisport-paris-france']['dependent-name'].event).toBe('gig:1999-06-02-palais-omnisports-paris-france');
        expect(NAMES.pages['media:1975-11-10-jai-alai-fronton-tampa-fl']['dependent-name'].event).toBe('gig:1975-11-11-jai-alai-fronton-miami-fl');
        // A download's note ("dl-") fits its show; these two do not for another reason.
        expect(entries.map(([n]) => n).filter(n => n.includes(':dl-'))).toEqual([
            'media:dl-2020-09-10-springsteen-residence-colts-neck-nj', 'recnote:dl-2021-11-12-basie-center-cinemas-red-bank-nj']);
        // Wikidot's cut of a long name fits: no page is a prefix of its expected name.
        expect(entries.filter(([n, k]) => k['dependent-name'].expected.startsWith(n.replace(/-$/, '')))).toEqual([]);
        // Every show is anchored but the one on no year page (feed.sh warns).
        const shows = [...new Set(entries.map(([, k]) => k['dependent-name'].event))];
        const anchored = new Set(Object.values(NAMES.anchors).flat());
        expect(shows.filter(s => !anchored.has(s))).toEqual(['nogig:1949-09-23-monmouth-medical-center-long-branch-nj']);
    });

    test('1968: the show whose gallery is named differently is ⚠️ ⇋ on its Event cell; the menu counts and filters it', async ({ page }) => {
        await showYear(page, '1968', feedOn(NAMES));
        const cells = await feedCells(page, 'Event');
        expect(cells.map(r => [r.name, r.ids, r.level])).toEqual([[SHOW68, ['bb-feed-name'], 'warn']]);
        expect(cells[0].tip).toContain(`Its page ${GALLERY68} is named differently from this show: a page of it would be named gallery:1968-11-00-off-broad-street-coffee-house-red-bank-nj.`);
        expect(cells[0].tip).toContain('From BruceParser\'s run of 2026-11-19');
        const after = await page.evaluate((n) => {
            const a = document.querySelector(`table.tbl tbody a.mb-bb-event-link[href$="${n}"]`);
            return getComputedStyle(a.closest('td'), '::after').content;
        }, SHOW68.split(':')[1]);
        expect(after).toContain('⚠️');
        const row = await findingRow(page, 'warn', 'bb-feed-name');
        expect(row.count).toBe(1);
        expect(row.label).toBe('Brucebase page named differently from its show');
        const all = (await findingRowState(page)).visible;
        await clickFinding(page, 'bb-feed-name');
        await expect.poll(() => findingRowState(page, 'bb-feed-name')).toEqual({ visible: 1, withFinding: 1 });
        await clickFinding(page, 'bb-feed-name');
        await expect.poll(async () => (await findingRowState(page)).visible).toBe(all);
    });

    test('the 1978 listing: the three shows the kind names, through their anchors, in the listing\'s order', async ({ page }) => {
        await page.route(/^https?:\/\//, route => route.abort('blockedbyclient'));
        await loadBbYearListPage(page, '1978', { settingsOverride: feedOn(NAMES) });
        await page.click(`button[data-label="${BB_YEAR_LIST_BUTTON}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const cells = await feedCells(page, 'Event');
        expect(cells.map(r => [r.name, r.ids])).toEqual(LIST1978.map(a => [a, ['bb-feed-name']]));
        expect(cells[1].tip).toContain('Its page gignote:1978-07-15-kilt-studio-houston-tx is named differently');
        expect((await findingRow(page, 'warn', 'bb-feed-name')).count).toBe(3);
    });

    test('its switch off: no stamp, no menu row, no fact; the feed\'s other kinds stay', async ({ page }) => {
        const feed = { ...NAMES, pages: { ...NAMES.pages, [SHOW68]: { 'no-tags': true } } };
        await showYear(page, '1968', feedOn(feed, { sa_findings_bb_feed_name: false }));
        const cells = await feedCells(page, 'Event');
        expect(cells.map(r => [r.name, r.ids])).toEqual([[SHOW68, ['bb-feed-no-tags']]]);
        expect(await findingRow(page, 'warn', 'bb-feed-name')).toBeUndefined();
        expect(await page.evaluate(n => window.__saTest.bbFeed(n).facts.map(f => f.kind), SHOW68)).toEqual(['no-tags']);
    });

    test('the facts: the show gets its pages, the page itself its show; nothing the page shows drops them', async ({ page }) => {
        await showYear(page, '1968', feedOn(NAMES));
        const facts = n => page.evaluate(x => window.__saTest.bbFeed(x, { title: 'x', tags: ['a'], parent: true }), n);
        const show = await facts('interview:2020-10-23a-siriusxm-studio-new-york-city-ny');
        expect(show.facts.map(f => f.kind)).toEqual(['dependent-name']);
        expect(show.facts[0].deps.map(d => d.name).sort()).toEqual([
            'media:2020-10-23b-siriusxm-studio-new-york-city-ny', 'recnote:2020-10-23b-siriusxm-studio-new-york-city-ny']);
        expect(show.kept).toEqual(show.facts);
        const own = await facts(GALLERY68);
        expect(own.facts[0].deps).toEqual([{ name: GALLERY68, event: SHOW68, expected: 'gallery:1968-11-00-off-broad-street-coffee-house-red-bank-nj', own: true }]);
        expect(own.kept).toEqual(own.facts);
    });

    test('a show\'s head: its page named differently is ⚠️ ⇋ after the title mark of another page', async ({ page }) => {
        const feed = feedOf({
            'gallery:1978-07-07-roxy-west-hollywood-ca': {
                'dependent-name': { event: ROXY, expected: 'gallery:1978-07-07-roxy-theatre-west-hollywood-ca' },
            },
            'onstage:1978-07-07-roxy-theatre-west-hollywood-ca': {
                'dependent-title': { title: '1978-07-07 Roxy, West Hollywood, CA', event: ROXY, eventTitle: '1978-07-07 Roxy Theatre (The), West Hollywood, CA' },
            },
        });
        await loadBbEventPage(page, 'gig-1978-07-07', { settingsOverride: feedOn(feed) });
        await page.click('button[data-label="Show the event"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const marks = page.locator('p.mb-fd-sub .mb-bb-feed-mark');
        await expect(marks).toHaveCount(2);
        expect(await marks.evaluateAll(ms => ms.map(m => [m.dataset.mbFeedKind, m.dataset.mbLevel, m.textContent]))).toEqual([
            ['dependent-title', 'error', '❌ ≢'],
            ['dependent-name', 'warn', '⚠️ ⇋'],
        ]);
        const tip = await marks.nth(1).getAttribute('title');
        expect(tip).toContain('Brucebase page named differently from its show. Its page gallery:1978-07-07-roxy-west-hollywood-ca is named differently from this show: a page of it would be named gallery:1978-07-07-roxy-theatre-west-hollywood-ca.');
        expect(tip).toContain('Report: the run\'s gignote, gallery, eye, media and recnote pages (dependent-names.awk) and its onstage, offstage and soundcheck pages (stage-names.awk).');
    });

    // BruceParser 0.40.0 (vzell, 2026-11-23: "the 76 pages should go into the
    // feed"): stage-names.awk's On stage pages come as dependent-name rows
    // whose show is the one show of their date; the script marks their show
    // as it marks a gallery's (the kind does not ask the page's category).
    test('an On stage page named differently: its show\'s head is ⚠️ ⇋ and names the On stage page', async ({ page }) => {
        const STAGE = 'onstage:1978-07-07-roxy-west-hollywood-ca';
        const feed = feedOf({
            [STAGE]: { 'dependent-name': { event: ROXY, expected: 'onstage:1978-07-07-roxy-theatre-west-hollywood-ca' } },
        });
        await loadBbEventPage(page, 'gig-1978-07-07', { settingsOverride: feedOn(feed) });
        await page.click('button[data-label="Show the event"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const marks = page.locator('p.mb-fd-sub .mb-bb-feed-mark');
        await expect(marks).toHaveCount(1);
        expect(await marks.evaluateAll(ms => ms.map(m => [m.dataset.mbFeedKind, m.dataset.mbLevel, m.textContent]))).toEqual([
            ['dependent-name', 'warn', '⚠️ ⇋'],
        ]);
        expect(await marks.first().getAttribute('title')).toContain(`Its page ${STAGE} is named differently from this show: a page of it would be named onstage:1978-07-07-roxy-theatre-west-hollywood-ca.`);
    });

    // vzell, 2026-11-23 ("like the venue card, a diff output"): the names as
    // the diff card, each page's name over the one it would have; two pages
    // of one show stack as two pairs (kind "pairs"), and the title kind on
    // the same show gets its card too, the page named in a pill.
    test('the diff card: a show with two pages named differently carries both pairs; the title kind its own', async ({ page }) => {
        const feed = feedOf({
            'onstage:1978-07-07-roxy-west-hollywood-ca': { 'dependent-name': { event: ROXY, expected: 'onstage:1978-07-07-roxy-theatre-west-hollywood-ca' } },
            'offstage:1978-07-07-the-roxy-west-hollywood-ca': { 'dependent-name': { event: ROXY, expected: 'offstage:1978-07-07-roxy-theatre-west-hollywood-ca' } },
            'gallery:1978-07-07-roxy-theatre-west-hollywood-ca': {
                'dependent-title': { title: '1978-07-07 Roxy, West Hollywood, CA', event: ROXY, eventTitle: '1978-07-07 Roxy Theatre (The), West Hollywood, CA' },
            },
        });
        await loadBbEventPage(page, 'gig-1978-07-07', { settingsOverride: feedOn(feed) });
        await page.click('button[data-label="Show the event"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const cmpOf = kind => page.locator(`p.mb-fd-sub .mb-bb-feed-mark[data-mb-feed-kind="${kind}"]`).evaluate((m) => {
            const raw = m.getAttribute('data-mb-tip-cmp');
            const d = raw ? JSON.parse(raw) : null;
            return d ? { sameText: d.t === m.getAttribute('title'), c: d.c } : null;
        });
        const names = await cmpOf('dependent-name');
        expect(names.sameText).toBe(true);
        expect(names.c).toHaveLength(1);
        expect(names.c[0]).toMatchObject({ kind: 'pairs', at: 0, head: 'Brucebase page named differently from its show' });
        expect(names.c[0].p.map(p => [p.la, p.a, p.lb, p.b]).sort()).toEqual([
            ['Its page', 'offstage:1978-07-07-the-roxy-west-hollywood-ca', 'A page of this show', 'offstage:1978-07-07-roxy-theatre-west-hollywood-ca'],
            ['Its page', 'onstage:1978-07-07-roxy-west-hollywood-ca', 'A page of this show', 'onstage:1978-07-07-roxy-theatre-west-hollywood-ca'],
        ]);
        const titles = await cmpOf('dependent-title');
        expect(titles.c).toEqual([expect.objectContaining({ at: 0, la: 'Its page', lb: 'This show', pill: 'gallery:1978-07-07-roxy-theatre-west-hollywood-ca',
            a: '1978-07-07 Roxy, West Hollywood, CA', b: '1978-07-07 Roxy Theatre (The), West Hollywood, CA' })]);
        // The card draws both pairs, the letters that differ marked.
        const html = await page.evaluate(() => {
            const m = document.querySelector('p.mb-fd-sub .mb-bb-feed-mark[data-mb-feed-kind="dependent-name"]');
            return window.__saTest.tipTextToHtml(m.getAttribute('title'), m);
        });
        expect((html.match(/class="mb-tt-cmp"/g) || []).length).toBe(2);
        expect(html).toContain('mb-tt-cmp-d');
    });

    test('Recent changes: the page\'s own row is ⚠️ ⇋ on its Page cell, naming its show', async ({ page }) => {
        const feed = feedOf({
            [BOARDWALK]: { 'dependent-name': { event: 'gig:1978-09-23a-boardwalk-asbury-park-nj', expected: 'gallery:1978-09-23a-boardwalk-asbury-park-nj' } },
        });
        await loadBbChangesPage(page, { settingsOverride: feedOn(feed) });
        await page.click('button[data-label="Show the last 200 changes"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const cells = await feedCells(page, 'Page');
        expect(cells.length).toBeGreaterThan(0);
        cells.forEach((r) => {
            expect(r.name).toBe(BOARDWALK);
            expect(r.ids).toEqual(['bb-feed-name']);
        });
        expect(cells[0].tip).toContain(`${BOARDWALK} is named differently from its show gig:1978-09-23a-boardwalk-asbury-park-nj: a page of that show would be named gallery:1978-09-23a-boardwalk-asbury-park-nj.`);
        expect((await findingRow(page, 'warn', 'bb-feed-name')).count).toBe(cells.length);
    });
});
