'use strict';

// Track A batch 3b (org/springsteen-marriage.org): the tag families
// BruceBaseParser guessed at, each behind its own switch (default off) and
// tuned with vzell. The tour family (vzell, 2026-11-19): a gig or a nogig
// whose date lies in a tour's dates (the Brucebase feed's tour table,
// tagTables, feed 1.4) should carry that tour's tag, every covering tour's
// when two overlap, unless a page of the show carries "tour_no"; a tour tag
// of the page whose tour has other dates is not expected. Rehearsals,
// recordings, interviews and "00" dates are not looked at.
//
// Every page is real (mirror 2026-11-19, scripts/build-bb-findings-batch3b-fixtures.py;
// the 2016 year and its pages from batch 3), the feed is the published one
// of that run. What scripts/probe-bb-tour-tags.py found on them is WANT;
// scripts/check-bb-tour-tags.js runs the shipped rule over all 5,007 shows.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { BB_YEAR_BUTTON, BB_EVENT_BUTTON } = require('../support/bbFixture');
const { waitForRenderComplete } = require('../support/browser');
const { findingRow } = require('../support/findingsMenu');

const BB = 'https://brucebase.wikidot.com/';
const FEED_URL = 'https://raw.githubusercontent.com/vzell/brucebase-feed/main/bb-feed.json';
const FEED = JSON.parse(fs.readFileSync(path.join(__dirname, 'bb-feed-2026-11-19.json'), 'utf8'));
const DIR = path.join(__dirname, 'bb-findings');
const PAGE_RE = /^https:\/\/brucebase\.wikidot\.com\/((?:gig|nogig|recording|rehearsal|interview|onstage):[^/?#]+)(\/noredirect\/true)?$/;

const RATH = 'gig:2023-05-04-burrow-rathangan-ireland';
const BRUS = 'nogig:2008-06-23a-koning-boudewijnstadion-brussels-belgium';
const ATL = 'nogig:1975-03-13-electric-ballroom-atlanta-ga';
const WELL = 'gig:2016-01-22-louisburg-farm-wellington-fl';
const MAN = 'gig:2025-05-14-co-op-live-manchester-england';
const REH = 'rehearsal:2016-01-15-consol-energy-center-pittsburgh-pa';
const MEM = 'nogig:1975-10-00-unknown-location-memphis-tn';
const CHI = 'gig:2016-01-19-united-center-chicago-il';
const PIT = 'gig:2016-01-16-consol-energy-center-pittsburgh-pa';
const MAD = 'gig:2016-05-21-estadio-santiago-bernabeu-madrid-spain';
const INT = 'interview:2016-09-06-stone-hill-studio-colts-neck-nj';
/** The tour family's findings of each page (probe, mirror 2026-11-19): [missing, not expected]. */
const WANT = {
    [RATH]: [['tour_23int'], []],
    [BRUS]: [['tour_mgc'], ['tour_rsng']],
    [ATL]: [[], ['tour_wiess']],
    [WELL]: [[], []],
    [MAN]: [[], []],
    [REH]: [[], []],
    [MEM]: [[], []],
    [CHI]: [[], []],
};

const fileOf = name => path.join(DIR, `${name.replace(':', '_')}.html`);
const kept = (data, ageMs = 60 * 1000) => ({ mb_sa_bb_feed: { at: Date.now() - ageMs, data, err: '', errAt: 0 } });
/** The feed as BruceParser wrote it before 1.4: no tables. */
const FEED_13 = (() => { const f = JSON.parse(JSON.stringify(FEED)); delete f.tagTables; f.run.feed = '1.3'; return f; })();
const TOUR = { sa_bb_feed: true, sa_bb_tag_family_tour: true };
const BASE = { sa_enable_brucebase: true, sa_foreign_mb_titles: false, sa_foreign_typography: false };

/**
 * The feed with The River 2016's dates moved so that the 2016 fixture's two
 * January gigs lie outside them (a table edit; the gigs keep tour_rvr16).
 *
 * @returns {Object}
 */
function feedRiverLater() {
    const f = JSON.parse(JSON.stringify(FEED));
    f.tagTables.tours.find(t => t.tag === 'tour_rvr16').ranges = [['2016-02-01', '2016-04-25'], ['2016-05-14', '2016-09-14']];
    return f;
}

/**
 * Serves the event pages and the tag pages from the fixtures, a 404 for a
 * page the wiki does not have.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function servePages(page) {
    await page.route(PAGE_RE, (route) => {
        const name = decodeURIComponent(route.request().url().match(PAGE_RE)[1]);
        return fs.existsSync(fileOf(name))
            ? route.fulfill({ path: fileOf(name), contentType: 'text/html; charset=utf-8' })
            : route.fulfill({ status: 404, contentType: 'text/html', body: '<html><body>The page does not exist.</body></html>' });
    });
}

/**
 * Answers the feed's address with a body after a delay (before the page loads).
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} data
 * @param {number} [delayMs]
 * @returns {Promise<void>}
 */
async function answerFeed(page, data, delayMs = 0) {
    await page.addInitScript(({ url, body, delay }) => {
        window.__gmXhrResponses = Object.assign(window.__gmXhrResponses || {}, {
            [url]: { status: 200, responseHeaders: 'content-type: text/plain; charset=utf-8\r\n', responseText: body, finalUrl: url, delayMs: delay },
        });
    }, { url: FEED_URL, body: JSON.stringify(data), delay: delayMs });
}

/** @returns {Promise<number>} How often the feed was asked for. */
const feedAsks = page => page.evaluate(url => (window.__gmXhrLog || []).filter(x => x.url === url).length, FEED_URL);

let pageErrors;
test.beforeEach(({ page }) => {
    pageErrors = [];
    page.on('pageerror', e => pageErrors.push(String(e)));
});
test.afterEach(() => {
    expect(pageErrors, 'no script error').toEqual([]);
});

test.describe('Brucebase tag check, batch 3b: the tour family\'s rule', () => {
    /**
     * Loads a fixture page with the given settings and returns a function
     * giving a page's tour findings through the shipped check.
     *
     * @param {import('@playwright/test').Page} page
     * @param {Object<string, *>} settings
     * @returns {Promise<function(string, ?string[]): Promise<{missing: string[], spurious: string[], why: string[]}>>}
     */
    async function rule(page, settings) {
        await page.route(/^https?:\/\//, route => route.abort('blockedbyclient'));
        await loadUserscriptPage(page, { url: BB + CHI, fixtureFile: fileOf(CHI), testMode: true, settingsOverride: { ...BASE, ...settings } });
        await page.waitForFunction(() => window.__saTest && window.__saTest.bbTagCheck);
        return (name, own = null) => page.evaluate(([html, url, o]) => {
            const facts = window.__saTest.bbTagFacts(html, url);
            const rec = window.__saTest.dpParse('brucebase.wikidot.com', html, url);
            const tags = o || ((rec && rec.tags) || []).map(t => t.text.toLowerCase());
            const r = window.__saTest.bbTagCheck(facts, tags, []);
            const tour = list => list.filter(x => x.family === 'tour');
            return { missing: tour(r.missing).map(x => x.tag), spurious: tour(r.spurious).map(x => x.tag), why: tour(r.missing.concat(r.spurious)).map(x => x.why) };
        }, [fs.readFileSync(fileOf(name), 'utf8'), BB + name, own]);
    }

    test('on, with the feed\'s tables: each page as the probe found it, every finding with its reason', async ({ page }) => {
        const check = await rule(page, { ...TOUR, ...kept(FEED) });
        for (const [name, [missing, spurious]] of Object.entries(WANT)) {
            const got = await check(name);
            expect({ name, missing: got.missing, spurious: got.spurious }).toEqual({ name, missing, spurious });
            expect(got.why.every(w => /the Brucebase feed's tour table/.test(w)), `${name}: every finding says why`).toBe(true);
        }
        expect((await check(BRUS)).why).toEqual([
            '2008-06-23 is in the dates of the tour "Magic" (the Brucebase feed\'s tour table).',
            '2008-06-23 is not in the dates of the tour "The Rising" (the Brucebase feed\'s tour table); it is in those of "Magic" (tour_mgc).',
        ]);
    });

    test('two tours on one date: both expected; "tour_no" excuses the tour, and the tour\'s tag beside it is not wrong', async ({ page }) => {
        const check = await rule(page, { ...TOUR, ...kept(FEED) });
        const man = fs.readFileSync(fileOf(MAN), 'utf8');
        const own = await page.evaluate(([html, url]) => window.__saTest.dpParse('brucebase.wikidot.com', html, url).tags.map(t => t.text.toLowerCase()), [man, BB + MAN]);
        expect(own, 'Manchester carries both tours').toEqual(expect.arrayContaining(['tour_23int', 'tour_lohad']));
        expect((await check(MAN, own.filter(t => t !== 'tour_lohad'))).missing).toEqual(['tour_lohad']);
        expect((await check(MAN, own.filter(t => !t.startsWith('tour_')))).missing).toEqual(['tour_23int', 'tour_lohad']);
        // Wellington is tagged tour_no in The River 2016's dates.
        const well = await page.evaluate(([html, url]) => window.__saTest.dpParse('brucebase.wikidot.com', html, url).tags.map(t => t.text.toLowerCase()), [fs.readFileSync(fileOf(WELL), 'utf8'), BB + WELL]);
        expect(well).toContain('tour_no');
        expect(well).not.toContain('tour_rvr16');
        expect(await check(WELL, well), 'tour_no and no tour tag').toMatchObject({ missing: [], spurious: [] });
        expect(await check(WELL, well.concat('tour_rvr16'))).toMatchObject({ missing: [], spurious: [] });
        expect(await check(WELL, well.filter(t => t !== 'tour_no'))).toMatchObject({ missing: ['tour_rvr16'], spurious: [] });
        // A date with "00" is not looked at, though "1975-10-00" sorts inside Born to Run's dates.
        const mem = await page.evaluate(([html, url]) => window.__saTest.dpParse('brucebase.wikidot.com', html, url).tags.map(t => t.text.toLowerCase()), [fs.readFileSync(fileOf(MEM), 'utf8'), BB + MEM]);
        expect(await check(MEM, mem.filter(t => !t.startsWith('tour_'))), '1975-10-00 without a tour tag').toMatchObject({ missing: [], spurious: [] });
    });

    test('off, a feed without its tables, the feed off: no tour finding', async ({ browser }) => {
        for (const settings of [{ sa_bb_feed: true, sa_bb_tag_family_tour: false, ...kept(FEED) },
            { ...TOUR, ...kept(FEED_13) }, { sa_bb_feed: false, sa_bb_tag_family_tour: true, ...kept(FEED) }]) {
            const page = await browser.newPage();
            page.on('pageerror', e => pageErrors.push(String(e)));
            const check = await rule(page, settings);
            for (const name of [RATH, BRUS, ATL]) expect(await check(name), `${name} with ${JSON.stringify(Object.keys(settings))}`).toMatchObject({ missing: [], spurious: [] });
            await page.close();
        }
    });
});

test.describe('Brucebase tag check, batch 3b: the tour family on the event page\'s Tags card', () => {
    /**
     * Loads an event page fixture at its address and presses its button.
     *
     * @param {import('@playwright/test').Page} page
     * @param {string} name
     * @param {Object<string, *>} settings
     * @returns {Promise<void>}
     */
    async function showEvent(page, name, settings) {
        await page.setViewportSize({ width: 1500, height: 1200 });
        await page.route(/^https?:\/\//, route => route.abort('blockedbyclient'));
        const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
        await page.route(/brucebase\.wdfiles\.com\//, route => route.fulfill({ status: 200, contentType: 'image/png', body: png }));
        await loadUserscriptPage(page, {
            url: BB + name, fixtureFile: fileOf(name), testMode: true,
            settingsOverride: { ...BASE, sa_bb_detail_pages: true, ...settings },
        });
        await servePages(page);
        await page.click(`button[data-label="${BB_EVENT_BUTTON}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
    }
    const card = page => page.locator('section.mb-sb-card').filter({ has: page.locator(':scope > .mb-sb-card-head', { hasText: /^Tags/ }) });

    test('Brussels: "tour_mgc" missing in the Tour row, "tour_rsng" marked, both in words', async ({ page }) => {
        await showEvent(page, BRUS, { ...TOUR, ...kept(FEED) });
        const c = card(page);
        await expect(c.locator('.mb-sb-chip.mb-cbx-miss')).toHaveText(['tour_mgc missing']);
        // The row is found by its label: "Tour" is also in the chip's own text.
        const tourRow = c.locator('.mb-sb-chip-row').filter({ has: page.locator(':scope > .mb-sb-chip-kind', { hasText: /^Tour$/ }) });
        await expect(tourRow.locator('.mb-sb-chip.mb-cbx-miss')).toHaveText(['tour_mgc missing']);
        await expect(c.locator('.mb-sb-chip.mb-cbx-spur')).toHaveText(['tour_rsng']);
        await expect(c.locator('.mb-cbx-finds .mb-cbx-find-e')).toContainText('tour_mgc is expected and missing. 2008-06-23 is in the dates of the tour "Magic"');
        await expect(c.locator('.mb-cbx-finds .mb-cbx-find-w')).toContainText('tour_rsng is not expected. 2008-06-23 is not in the dates of the tour "The Rising"');
        await expect(c.locator('.mb-cbx-wait')).toHaveCount(0);
    });

    test('the switch off: the card as batch 3 drew it, nothing about tours', async ({ page }) => {
        await showEvent(page, BRUS, { sa_bb_feed: true, sa_bb_tag_family_tour: false, ...kept(FEED) });
        const c = card(page);
        await expect(c.locator('.mb-cbx-pill-ok')).toHaveText('✓ date, letter, kind, premiere and icon tags as expected');
        await expect(c.locator('.mb-cbx-miss, .mb-cbx-spur, .mb-cbx-wait')).toHaveCount(0);
    });

    test('a show the rule leaves alone: "as expected" names the tour only where it is checked', async ({ page }) => {
        await showEvent(page, WELL, { ...TOUR, ...kept(FEED), sa_bb_onstage_tags: true });
        await expect(card(page).locator('.mb-cbx-pill-ok')).toHaveText('✓ date, letter, kind, premiere, icon and tour tags as expected');
    });

    test('the feed off: the card says the tour is not checked', async ({ page }) => {
        await showEvent(page, BRUS, { sa_bb_feed: false, sa_bb_tag_family_tour: true });
        await expect(card(page).locator('.mb-cbx-wait')).toHaveText('The tour tag is not checked: the Brucebase feed is off.');
        await expect(card(page).locator('.mb-cbx-miss, .mb-cbx-spur')).toHaveCount(0);
    });

    test('a kept feed without tables, read an hour ago: asked again on the press (not with the switch off); the card waits, then marks', async ({ page, browser }) => {
        await answerFeed(page, FEED, 2500);
        await showEvent(page, BRUS, { ...TOUR, ...kept(FEED_13, 2 * 3600 * 1000) });
        const c = card(page);
        await expect(c.locator('.mb-cbx-wait')).toHaveText('The tour tag is checked once the Brucebase feed with its tour table is read.');
        await expect(c.locator('.mb-sb-chip.mb-cbx-miss')).toHaveText(['tour_mgc missing'], { timeout: 10000 });
        await expect(c.locator('.mb-sb-chip.mb-cbx-spur')).toHaveText(['tour_rsng']);
        await expect(c.locator('.mb-cbx-wait')).toHaveCount(0);
        expect(await feedAsks(page)).toBe(1);
        // The switch off: the same kept feed is not read again for its tables.
        const off = await browser.newPage();
        off.on('pageerror', e => pageErrors.push(String(e)));
        await answerFeed(off, FEED, 0);
        await showEvent(off, BRUS, { sa_bb_feed: true, sa_bb_tag_family_tour: false, ...kept(FEED_13, 2 * 3600 * 1000) });
        await expect(card(off).locator('.mb-cbx-pill-ok')).toBeVisible();
        await off.evaluate(() => new Promise(r => setTimeout(r, 800)));
        expect(await feedAsks(off)).toBe(0);
        await off.close();
    });
});

test.describe('Brucebase tag check, batch 3b: the tour family on the year table', () => {
    const KEYS = [PIT, CHI, MAD, INT];

    /**
     * The live rows' Tags cells: the not-expected tags and the cell's stamps.
     *
     * @param {import('@playwright/test').Page} page
     * @returns {Promise<Array<{key: string, state: string, spur: string[], stamps: string[]}>>}
     */
    function tagCells(page) {
        return page.evaluate(() => Array.from(document.querySelectorAll('table.tbl tbody tr')).filter(tr => tr.style.display !== 'none').map((tr) => {
            const td = tr.querySelector('td.mb-bbevp-cell[data-mb-bbevp-col="Tags"]');
            const a = tr.querySelector('td a[href*="wikidot.com/"][href*=":2016-"], td a[href^="/"][href*=":2016-"]');
            const lis = td ? Array.from(td.querySelectorAll(':scope > ul > li')) : [];
            return {
                key: a ? decodeURIComponent(new URL(a.href, location.href).pathname.slice(1)) : '',
                state: td ? td.dataset.mbBbevpState || '' : 'no cell',
                spur: lis.filter(li => li.classList.contains('mb-bb-tag-spur')).map(li => li.textContent.trim()),
                stamps: td ? (td.dataset.mbFindings || '').split(' ').filter(x => x.startsWith('bb-tag-')).sort() : [],
            };
        }));
    }

    test('the tables come after the rows were read: the Tags cells are written again, stamped and counted', async ({ page }) => {
        await page.setViewportSize({ width: 1900, height: 1400 });
        await page.route(/^https?:\/\//, route => route.abort('blockedbyclient'));
        await loadUserscriptPage(page, {
            url: `${BB}2016`, fixtureFile: path.join(__dirname, 'bb-year-2016-findings.html'), testMode: true,
            settingsOverride: {
                ...BASE, sa_bb_year_pages: true, sa_bb_onstage_tags: true, ...TOUR, ...kept(FEED_13),
                sa_findings_bb_venue_mismatch: false, sa_findings_bb_year_unlisted: false,
            },
        });
        await servePages(page);
        await page.click(`button[data-label="${BB_YEAR_BUTTON}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const pagesBtn = page.locator('th[data-col-name="On stage"] .mb-bbevp-col-hdr-btn');
        await pagesBtn.click();
        await expect.poll(async () => {
            await page.evaluate(() => {
                const td = document.querySelector('table.tbl tbody td.mb-bbevp-cell[data-mb-bbevp-col="On stage"][data-mb-bbevp-state="cold"]');
                if (td) td.scrollIntoView({ block: 'center' });
            });
            return (await tagCells(page)).map(r => r.state).join(' ');
        }, { timeout: 60000 }).toBe(KEYS.map(() => 'done').join(' '));
        await pagesBtn.click();
        // Batch 3's own findings only: Madrid's "2"; no tour tag yet (no tables).
        expect((await tagCells(page)).map(r => [r.key, r.spur])).toEqual([[PIT, []], [CHI, []], [MAD, ['2']], [INT, ['nogig']]]);
        // The tables arrive: The River 2016 now starts in February.
        await page.evaluate(({ url, body }) => {
            window.__gmXhrResponses = Object.assign(window.__gmXhrResponses || {}, {
                [url]: { status: 200, responseHeaders: 'content-type: text/plain; charset=utf-8\r\n', responseText: body, finalUrl: url },
            });
            return window.__saTest.bbFeedLoad(true);
        }, { url: FEED_URL, body: JSON.stringify(feedRiverLater()) });
        await expect.poll(async () => (await tagCells(page)).map(r => [r.key, r.spur, r.stamps]), { timeout: 15000 }).toEqual([
            [PIT, ['tour_rvr16'], ['bb-tag-missing', 'bb-tag-spurious']],
            [CHI, ['tour_rvr16'], ['bb-tag-spurious']],
            [MAD, ['2'], ['bb-tag-missing', 'bb-tag-spurious']],
            [INT, ['nogig'], ['bb-tag-spurious']],
        ]);
        const row = await findingRow(page, 'warn', 'bb-tag-spurious');
        expect(row && row.count, 'every row with a tag that is not expected, in the menu').toBe(4);
    });
});
