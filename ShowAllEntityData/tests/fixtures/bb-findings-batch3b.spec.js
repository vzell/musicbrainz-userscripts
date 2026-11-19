'use strict';

// Track A batch 3b (org/springsteen-marriage.org): the tag families
// BruceBaseParser guessed at, each behind its own switch (default off) and
// tuned with vzell. The tour family (vzell, 2026-11-19): a gig or a nogig
// whose date lies in a tour's dates (the Brucebase feed's tour table,
// tagTables, feed 1.4) should carry that tour's tag, every covering tour's
// when two overlap, unless a page of the show carries "tour_no"; a tour tag
// of the page whose tour has other dates is not expected. Rehearsals,
// recordings, interviews and "00" dates are not looked at. The place
// family (vzell, 2026-11-19): every show should carry its title's city, US
// state or Canadian province with "usa"/"canada", or its country, and the
// country's regions the feed's expectedRegions lists; the feed's placeTags
// name a few places the wiki tags its own way. A place tag is never "not
// expected".
//
// Every page is real (mirror 2026-11-19, scripts/build-bb-findings-batch3b-fixtures.py;
// the 2016 year and its pages, and Stone Pony 2026, from batch 3), the feed
// is that run's (BruceParser 0.22.1). What scripts/probe-bb-tour-tags.py and
// scripts/probe-bb-place-tags.py found on them is WANT and WANT_PLACE;
// scripts/check-bb-batch3b-findings.js runs the shipped rules over all 5,007 shows.

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
// The place family's pages.
const STONE = 'gig:2026-08-28-stone-pony-asbury-park-nj';
const KEN = 'gig:2022-04-24-kennedy-center-concert-hall-washington-dc';
const CNE = 'gig:1984-07-23-cne-grandstand-toronto-on';
const SOLNA = 'gig:2013-05-11-friends-arena-solna-sweden';
const BERLIN = 'gig:1981-04-09-icc-berlin-germany';
const NIJ = 'gig:2024-06-27-goffertpark-nijmegen-netherlands';
const WAN = 'gig:1969-05-28a-pandemonium-wanamassa-nj';
const SYD = 'gig:1985-03-21-entertainment-centre-sydney-australia';
const LA = 'interview:2025-04-28-saban-media-center-los-angels-ca';
const TWAIN = 'nogig:2003-09-17-mark-twain-house-hartford-ct';
/** The place family's missing tags of each page (probe, mirror 2026-11-19; a place tag is never "not expected"). */
const WANT_PLACE = {
    [STONE]: ['newjersey(nj)'], [KEN]: ['usa'], [CNE]: ['canada'], [SOLNA]: ['europe'], [LA]: ['losangels'], [TWAIN]: ['usa'],
    // placeTags: West Berlin and West Germany, The Netherlands as "netherlands"; "NJ (First)"; an Australian state.
    [BERLIN]: [], [NIJ]: [], [WAN]: [], [SYD]: [], [CHI]: [],
};
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
        await expect(c.locator('.mb-cbx-wait')).toHaveText('The tour tag is checked once the Brucebase feed with its tables is read.');
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

test.describe('Brucebase tag check, batch 3b: the place family', () => {
    const PLACE = { sa_bb_feed: true, sa_bb_tag_family_place: true };

    /**
     * Loads a fixture page with the given settings and returns a function
     * giving a page's place findings through the shipped check.
     *
     * @param {import('@playwright/test').Page} page
     * @param {Object<string, *>} settings
     * @returns {Promise<function(string): Promise<{missing: string[], spurious: string[], why: string[]}>>}
     */
    async function rule(page, settings) {
        await page.route(/^https?:\/\//, route => route.abort('blockedbyclient'));
        await loadUserscriptPage(page, { url: BB + CHI, fixtureFile: fileOf(CHI), testMode: true, settingsOverride: { ...BASE, ...settings } });
        await page.waitForFunction(() => window.__saTest && window.__saTest.bbTagCheck);
        return name => page.evaluate(([html, url]) => {
            const facts = window.__saTest.bbTagFacts(html, url);
            const rec = window.__saTest.dpParse('brucebase.wikidot.com', html, url);
            const r = window.__saTest.bbTagCheck(facts, ((rec && rec.tags) || []).map(t => t.text.toLowerCase()), []);
            const place = list => list.filter(x => x.family === 'place');
            return { missing: place(r.missing).map(x => x.tag), spurious: place(r.spurious).map(x => x.tag), why: place(r.missing).map(x => x.why) };
        }, [fs.readFileSync(fileOf(name), 'utf8'), BB + name]);
    }

    test('on, with the feed\'s tables: each page as the probe found it, with its reason; a place tag is never "not expected"', async ({ page }) => {
        const check = await rule(page, { ...PLACE, ...kept(FEED) });
        for (const [name, missing] of Object.entries(WANT_PLACE)) {
            const got = await check(name);
            expect({ name, missing: got.missing, spurious: got.spurious }).toEqual({ name, missing, spurious: [] });
        }
        expect((await check(STONE)).why).toEqual(['The title names the state NJ, New Jersey.']);
        expect((await check(KEN)).why).toEqual(['DC is a US state.']);
        expect((await check(SOLNA)).why).toEqual(['"Sweden" is in Europe.']);
        expect((await check(LA)).why).toEqual(['The title names the city "Los Angels".']);
    });

    test('the feed\'s placeTags and expectedRegions decide: without them, the names as written and no region', async ({ page }) => {
        const bare = JSON.parse(JSON.stringify(FEED));
        delete bare.tagTables.placeTags;
        delete bare.tagTables.expectedRegions;
        const check = await rule(page, { ...PLACE, ...kept(bare) });
        expect((await check(BERLIN)).missing).toEqual(['westberlin', 'westgermany']);
        expect((await check(NIJ)).missing).toEqual(['thenetherlands']);
        expect((await check(SOLNA)).missing).toEqual([]);
    });

    test('off, a feed without its tables, the feed off: no place finding', async ({ browser }) => {
        for (const settings of [{ sa_bb_feed: true, sa_bb_tag_family_place: false, ...kept(FEED) },
            { ...PLACE, ...kept(FEED_13) }, { sa_bb_feed: false, sa_bb_tag_family_place: true, ...kept(FEED) }]) {
            const page = await browser.newPage();
            page.on('pageerror', e => pageErrors.push(String(e)));
            const check = await rule(page, settings);
            for (const name of [STONE, KEN, TWAIN]) expect(await check(name), `${name} with ${JSON.stringify(settings).slice(0, 80)}`).toMatchObject({ missing: [], spurious: [] });
            await page.close();
        }
    });

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
        await loadUserscriptPage(page, { url: BB + name, fixtureFile: fileOf(name), testMode: true, settingsOverride: { ...BASE, sa_bb_detail_pages: true, ...settings } });
        await servePages(page);
        await page.click(`button[data-label="${BB_EVENT_BUTTON}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
    }
    const card = page => page.locator('section.mb-sb-card').filter({ has: page.locator(':scope > .mb-sb-card-head', { hasText: /^Tags/ }) });
    const row = (c, label) => c.locator('.mb-sb-chip-row').filter({ has: c.page().locator(':scope > .mb-sb-chip-kind', { hasText: new RegExp(`^${label}$`) }) });

    test('the Mark Twain House (a nogig): "usa missing" in the Place row; with the tour on too, "tour_rsng missing" in the Tour row', async ({ page }) => {
        await showEvent(page, TWAIN, { ...PLACE, sa_bb_tag_family_tour: true, ...kept(FEED) });
        const c = card(page);
        await expect(row(c, 'Place').locator('.mb-sb-chip.mb-cbx-miss')).toHaveText(['usa missing']);
        await expect(row(c, 'Tour').locator('.mb-sb-chip.mb-cbx-miss')).toHaveText(['tour_rsng missing']);
        await expect(c.locator('.mb-cbx-finds .mb-cbx-find-e')).toContainText(['usa is expected and missing. CT is a US state.']);
    });

    test('both families on, the feed off: one line says neither is checked', async ({ page }) => {
        await showEvent(page, TWAIN, { sa_bb_feed: false, sa_bb_tag_family_tour: true, sa_bb_tag_family_place: true });
        await expect(card(page).locator('.mb-cbx-wait')).toHaveText('The tour and place tags are not checked: the Brucebase feed is off.');
        await expect(card(page).locator('.mb-cbx-miss')).toHaveCount(0);
    });

    test('a show found as expected: "as expected" names the tour and the place', async ({ page }) => {
        await showEvent(page, WELL, { ...PLACE, sa_bb_tag_family_tour: true, ...kept(FEED), sa_bb_onstage_tags: true });
        await expect(card(page).locator('.mb-cbx-pill-ok')).toHaveText('✓ date, letter, kind, premiere, icon, tour and place tags as expected');
    });
});

test.describe('Brucebase tag check, batch 3b: the content family', () => {
    const CONTENT = { sa_bb_tag_family_content: true };
    const MEM = 'gig:1978-07-19-ellis-auditorium-memphis-tn';
    const SCH = 'gig:1974-10-19-memorial-chapel-concert-hall-schenectady-ny';
    const RB = 'gig:2005-04-04-joan-and-robert-rechnitz-theater-red-bank-nj';
    const NAS = 'gig:1980-12-31-nassau-coliseum-uniondale-ny';
    const NB = 'gig:1974-12-14a-auditorium-new-brunswick-nj';
    const PONY = 'gig:1982-10-03-stone-pony-asbury-park-nj';
    const ALLEN = 'gig:1976-04-07-allen-theatre-cleveland-oh';
    const SUN = 'gig:1971-05-14-sunshine-in-asbury-park-nj';
    /** The content family's findings (probe, mirror 2026-11-19): [missing, not expected]. */
    const WANT_CONTENT = {
        [MEM]: [['ticket'], []],
        [SCH]: [['setlist', 'handwritten'], []],
        [RB]: [['setlist', 'printed'], []],
        [NAS]: [['storyteller'], []],
        [NB]: [['eyewitness'], []],
        [PONY]: [[], ['eyewitness']],
        [ALLEN]: [[], ['storyteller']],
        // "setlist" and "handwritten" with no setlist picture in the page: never "not expected".
        [SUN]: [[], []],
        // Every content tag its page calls for is there.
        [PIT]: [[], []],
    };

    /**
     * Loads a fixture page with the given settings and returns a function
     * giving a page's content findings through the shipped check.
     *
     * @param {import('@playwright/test').Page} page
     * @param {Object<string, *>} settings
     * @returns {Promise<function(string): Promise<{missing: string[], spurious: string[], why: string[]}>>}
     */
    async function rule(page, settings) {
        await page.route(/^https?:\/\//, route => route.abort('blockedbyclient'));
        await loadUserscriptPage(page, { url: BB + CHI, fixtureFile: fileOf(CHI), testMode: true, settingsOverride: { ...BASE, ...settings } });
        await page.waitForFunction(() => window.__saTest && window.__saTest.bbTagCheck);
        return name => page.evaluate(([html, url]) => {
            const facts = window.__saTest.bbTagFacts(html, url);
            const rec = window.__saTest.dpParse('brucebase.wikidot.com', html, url);
            const r = window.__saTest.bbTagCheck(facts, ((rec && rec.tags) || []).map(t => t.text.toLowerCase()), []);
            const mine = list => list.filter(x => x.family === 'content');
            return { missing: mine(r.missing).map(x => x.tag), spurious: mine(r.spurious).map(x => x.tag), why: mine(r.missing.concat(r.spurious)).map(x => x.why) };
        }, [fs.readFileSync(fileOf(name), 'utf8'), BB + name]);
    }

    test('on: each page as the probe found it, every finding with its reason; no feed needed', async ({ page }) => {
        const check = await rule(page, { ...CONTENT, sa_bb_feed: false });
        for (const [name, [missing, spurious]] of Object.entries(WANT_CONTENT)) {
            const got = await check(name);
            expect({ name, missing: got.missing, spurious: got.spurious }).toEqual({ name, missing, spurious });
            expect(got.why.every(Boolean), `${name}: every finding says why`).toBe(true);
        }
        expect((await check(MEM)).why).toEqual(['The News/Memorabilia tab shows a ticket (an image named "ticket").']);
        expect((await check(PONY)).why).toEqual(['The page has no Eyewitness entry.']);
    });

    test('off: no content finding', async ({ page }) => {
        const check = await rule(page, { sa_bb_tag_family_content: false });
        for (const name of [MEM, SCH, PONY, ALLEN]) expect(await check(name), name).toMatchObject({ missing: [], spurious: [] });
    });

    test('what the tabs hold, on built markup: a pass is no ticket, a picture named "ticket" no setlist, "Sorry, no" is empty, a label\'s last tab counts', async ({ page }) => {
        await rule(page, CONTENT);
        // A page's tab bar and tabs as the wiki writes them, the news tab's pictures given.
        const html = (news, opts = {}) => `<html><body><div id="page-title">2016-01-19 United Center, Chicago, IL</div>
            <div class="yui-navset"><ul class="yui-nav"><li><em>Setlist</em></li><li><em>${opts.label || 'News/Memorabilia'}</em></li>
            <li><em>Storyteller</em></li><li><em>Eyewitness</em></li>${opts.second ? '<li><em>Storyteller</em></li>' : ''}</ul>
            <div class="yui-content"><div id="wiki-tab-0-0"><p>songs</p></div><div id="wiki-tab-0-1">${news}</div>
            <div id="wiki-tab-0-2">${opts.story || 'Sorry, no Storyteller available.'}</div><div id="wiki-tab-0-3">Sorry no Eyewitness-report available.</div>
            ${opts.second ? `<div id="wiki-tab-0-4">${opts.second}</div>` : ''}</div></div></body></html>`;
        const content = (h) => page.evaluate(([x, url]) => window.__saTest.bbTagFacts(x, url).content, [h, BB + CHI]);
        const img = src => `<img src="https://brucebase.wdfiles.com/local--files/content:files/${src}" class="image">`;
        expect(await content(html(img('backstage-pass-1988.jpg')))).toMatchObject({ ticket: false });
        expect(await content(html(img('ticket-1988.jpg')))).toMatchObject({ ticket: true, setlist: false });
        expect(await content(html(img('ticket-and-setlist-1988.jpg')))).toMatchObject({ ticket: true, setlist: false });
        expect(await content(html(img('setlist-handwritten-1988.jpg')))).toMatchObject({ setlist: true, handwritten: true, printed: false });
        expect(await content(html(img('setlist-printed-1988.jpg')))).toMatchObject({ setlist: true, handwritten: false, printed: true });
        expect(await content(html(`Sorry, no News available. ${img('ticket-1988.jpg')}`))).toMatchObject({ ticket: false });
        expect(await content(html(img('ticket-1988.jpg'), { label: 'News' }))).toMatchObject({ ticket: true });
        expect(await content(html('', { story: '<p>I was there.</p>' }))).toMatchObject({ storyteller: true, eyewitness: false });
        // Two Storyteller tabs: the last one decides (BruceBaseParser's buildTabMap()).
        expect(await content(html('', { story: '<p>I was there.</p>', second: 'Sorry, no Storyteller available.' }))).toMatchObject({ storyteller: false });
    });

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
        await loadUserscriptPage(page, { url: BB + name, fixtureFile: fileOf(name), testMode: true, settingsOverride: { ...BASE, sa_bb_detail_pages: true, ...settings } });
        await servePages(page);
        await page.click(`button[data-label="${BB_EVENT_BUTTON}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
    }
    const card = page => page.locator('section.mb-sb-card').filter({ has: page.locator(':scope > .mb-sb-card-head', { hasText: /^Tags/ }) });
    const row = (c, label) => c.locator('.mb-sb-chip-row').filter({ has: c.page().locator(':scope > .mb-sb-chip-kind', { hasText: new RegExp(`^${label}$`) }) });

    test('Nassau 1980-12-31: once its On stage page is read, "storyteller missing" in the "On the page" row', async ({ page }) => {
        await showEvent(page, NAS, { ...CONTENT, sa_bb_onstage_tags: true });
        const c = card(page);
        await expect(row(c, 'On the page').locator('.mb-sb-chip.mb-cbx-miss')).toHaveText(['storyteller missing']);
        await expect(c.locator('.mb-cbx-finds .mb-cbx-find-e')).toContainText(['storyteller is expected and missing. The Storyteller tab has an entry.']);
    });

    test('the Stone Pony 1982-10-03, its On stage page not read: "eyewitness" still marked (a tag of the page itself)', async ({ page }) => {
        await showEvent(page, PONY, { ...CONTENT, sa_bb_onstage_tags: false });
        const c = card(page);
        await expect(c.locator('.mb-sb-chip.mb-cbx-spur')).toHaveText(['eyewitness']);
        await expect(c.locator('.mb-cbx-finds .mb-cbx-find-w')).toContainText(['eyewitness is not expected. The page has no Eyewitness entry.']);
        await expect(c.locator('.mb-cbx-wait')).toContainText('A missing tag is not looked for');
    });

    test('Chicago 2016: "as expected" names the content too', async ({ page }) => {
        await showEvent(page, CHI, { ...CONTENT, sa_bb_onstage_tags: true });
        await expect(card(page).locator('.mb-cbx-pill-ok')).toHaveText('✓ date, letter, kind, premiere, icon and content tags as expected');
    });
});

test.describe('Brucebase tag check, batch 3b: the cast family', () => {
    const CAST = { sa_bb_feed: true, sa_bb_tag_family_cast: true };
    const WAN69 = 'gig:1969-04-05-pandemonium-wanamassa-nj';
    const SUN71 = 'gig:1971-03-27-sunshine-in-asbury-park-nj-early';
    const SHIP = 'gig:1972-10-25-shipbottom-lounge-point-pleasant-beach-nj';
    const FLO = 'recording:1979-06-21-power-station-new-york-city-ny';
    const SONY = 'interview:1995-04-07-sony-music-studios-new-york-city-ny';
    const KLOL = 'interview:1974-03-08-klol-studio-houston-tx';
    /** The cast family's missing tags (probe, mirror 2026-11-19; a cast tag is never "not expected"). */
    const WANT_CAST = {
        // An On Stage tab, no On stage page: "onstage" alone, not a tag per person.
        [WAN69]: ['onstage'],
        // "Big Danny" Gallagher is not tagged; the rest of the cast is, on the On stage page.
        [SUN71]: ['bigdannygallagher'],
        // Vini Lopez as "vini.lopez", the dotted form.
        [SHIP]: [],
        // "Flo & Eddie": each part.
        [FLO]: ['flo', 'eddie'],
        [SONY]: ['ianmollymeldrum'],
        // An interview's On Stage tab without an On stage page: no "onstage" asked.
        [KLOL]: [],
        [CHI]: [],
    };
    /** A show's other tag pages, as the fixtures hold them (the mirror's). */
    const pagesOf = (name) => {
        const on = name.replace(/^[a-z]+:/, 'onstage:');
        return fs.existsSync(fileOf(on)) ? [on] : [];
    };

    /**
     * Loads a fixture page with the given settings and returns a function
     * giving a page's cast findings through the shipped check.
     *
     * @param {import('@playwright/test').Page} page
     * @param {Object<string, *>} settings
     * @returns {Promise<function(string, ?Array<string>=): Promise<{missing: string[], spurious: string[], why: string[]}>>}
     */
    async function rule(page, settings) {
        await page.route(/^https?:\/\//, route => route.abort('blockedbyclient'));
        await loadUserscriptPage(page, { url: BB + CHI, fixtureFile: fileOf(CHI), testMode: true, settingsOverride: { ...BASE, ...settings } });
        await page.waitForFunction(() => window.__saTest && window.__saTest.bbTagCheck);
        return (name, pages = pagesOf(name)) => {
            const more = (pages || []).flatMap((p) => {
                const box = (fs.readFileSync(fileOf(p), 'utf8').match(/<div class="page-tags">([\s\S]*?)<\/div>/) || [])[1] || '';
                return Array.from(box.matchAll(/<a href="\/system:page-tags\/tag\/[^"#]*#pages">([^<]*)<\/a>/g), m => m[1].trim().toLowerCase());
            });
            return page.evaluate(([html, url, m, p]) => {
                const facts = window.__saTest.bbTagFacts(html, url);
                const rec = window.__saTest.dpParse('brucebase.wikidot.com', html, url);
                const r = window.__saTest.bbTagCheck(facts, ((rec && rec.tags) || []).map(t => t.text.toLowerCase()), m, null, p);
                const mine = list => list.filter(x => x.family === 'cast');
                return { missing: mine(r.missing).map(x => x.tag), spurious: mine(r.spurious).map(x => x.tag), why: mine(r.missing).map(x => x.why) };
            }, [fs.readFileSync(fileOf(name), 'utf8'), BB + name, more, pages]);
        };
    }

    test('on, with the feed\'s tables: each page as the probe found it, with its reason; a cast tag is never "not expected"', async ({ page }) => {
        const check = await rule(page, { ...CAST, ...kept(FEED) });
        for (const [name, missing] of Object.entries(WANT_CAST)) {
            const got = await check(name);
            expect({ name, missing: got.missing, spurious: got.spurious }).toEqual({ name, missing, spurious: [] });
        }
        expect((await check(WAN69)).why).toEqual(['The show has an On Stage tab but no On stage page: its cast is not tagged.']);
        expect((await check(SUN71)).why).toEqual(['The On Stage tab lists ""Big Danny" Gallagher".']);
        expect((await check(FLO)).why).toEqual(['The In Studio tab lists "Flo".', 'The In Studio tab lists "Eddie".']);
    });

    test('the pages not known: an On Stage tab\'s cast is not checked; an In Studio tab\'s is', async ({ page }) => {
        const check = await rule(page, { ...CAST, ...kept(FEED) });
        expect((await check(WAN69, null)).missing).toEqual([]);
        expect((await check(SUN71, null)).missing).toEqual([]);
        expect((await check(FLO, null)).missing).toEqual(['flo', 'eddie']);
    });

    test('off, a feed without its tables, the feed off: no cast finding', async ({ browser }) => {
        for (const settings of [{ sa_bb_feed: true, sa_bb_tag_family_cast: false, ...kept(FEED) },
            { ...CAST, ...kept(FEED_13) }, { sa_bb_feed: false, sa_bb_tag_family_cast: true, ...kept(FEED) }]) {
            const page = await browser.newPage();
            page.on('pageerror', e => pageErrors.push(String(e)));
            const check = await rule(page, settings);
            for (const name of [WAN69, SUN71, FLO]) expect(await check(name), name).toMatchObject({ missing: [], spurious: [] });
            await page.close();
        }
    });

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
        await loadUserscriptPage(page, { url: BB + name, fixtureFile: fileOf(name), testMode: true, settingsOverride: { ...BASE, sa_bb_detail_pages: true, ...settings } });
        await servePages(page);
        await page.click(`button[data-label="${BB_EVENT_BUTTON}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
    }
    const card = page => page.locator('section.mb-sb-card').filter({ has: page.locator(':scope > .mb-sb-card-head', { hasText: /^Tags/ }) });
    const row = (c, label) => c.locator('.mb-sb-chip-row').filter({ has: c.page().locator(':scope > .mb-sb-chip-kind', { hasText: new RegExp(`^${label}$`) }) });

    test('Wanamassa 1969: its On stage page asked and not there, then "onstage missing" in the People row with the reason', async ({ page }) => {
        await showEvent(page, WAN69, { ...CAST, ...kept(FEED), sa_bb_onstage_tags: true });
        const c = card(page);
        await expect(row(c, 'People').locator('.mb-sb-chip.mb-cbx-miss')).toHaveText(['onstage missing']);
        await expect(c.locator('.mb-cbx-finds .mb-cbx-find-e')).toContainText(['onstage is expected and missing. The show has an On Stage tab but no On stage page: its cast is not tagged.']);
    });

    test('the On stage tags switched off: nothing about the cast of an On Stage tab', async ({ page }) => {
        await showEvent(page, WAN69, { ...CAST, ...kept(FEED), sa_bb_onstage_tags: false });
        await expect(card(page).locator('.mb-sb-chip').first()).toBeVisible();
        await expect(card(page).locator('.mb-cbx-miss')).toHaveCount(0);
    });

    test('Sunshine In 1971: "bigdannygallagher missing" once the On stage page is read', async ({ page }) => {
        await showEvent(page, SUN71, { ...CAST, ...kept(FEED), sa_bb_onstage_tags: true });
        await expect(row(card(page), 'People').locator('.mb-sb-chip.mb-cbx-miss')).toHaveText(['bigdannygallagher missing']);
    });

    test('Chicago 2016: "as expected" names the cast; the feed off, the wait line names it', async ({ page, browser }) => {
        await showEvent(page, CHI, { ...CAST, ...kept(FEED), sa_bb_onstage_tags: true });
        await expect(card(page).locator('.mb-cbx-pill-ok')).toHaveText('✓ date, letter, kind, premiere, icon and cast tags as expected');
        const off = await browser.newPage();
        off.on('pageerror', e => pageErrors.push(String(e)));
        await showEvent(off, CHI, { sa_bb_feed: false, sa_bb_tag_family_cast: true, sa_bb_onstage_tags: true });
        await expect(card(off).locator('.mb-cbx-wait')).toHaveText('The cast tags are not checked: the Brucebase feed is off.');
        await off.close();
    });
});

test.describe('Brucebase tag check, batch 3b: the songs family, and the place family\'s venue', () => {
    const SONGS = { sa_bb_feed: true, sa_bb_tag_family_songs: true };
    const CAPE = 'gig:2014-01-26-bellville-velodrome-cape-town-south-africa';
    const BRIS = 'gig:2013-03-14-entertainment-centre-brisbane-australia';
    const WESTB = 'gig:1975-02-23-music-fair-westbury-ny';
    const FOREST = 'gig:1981-04-26-forest-national-brussels-belgium';
    const TOWER = 'gig:1995-12-08-tower-theater-philadelphia-pa';
    /** The songs family's missing tags (probe on the feed of 2026-11-19; a song tag is never "not expected"). */
    const WANT_SONGS = {
        // "LAND OF HOPE AND DREAMS - PEOPLE GET READY" counts through the feed's songCombos (lohad.pgr).
        [CAPE]: ['jlfw'],
        [BRIS]: ['highhopes', 'night', 'tess'],
        [WESTB]: ['dtbsa82s'],
        [CHI]: [],
    };

    /**
     * Loads a fixture page with the given settings and returns a function
     * giving a page's findings of one family through the shipped check.
     *
     * @param {import('@playwright/test').Page} page
     * @param {Object<string, *>} settings
     * @param {string} family
     * @returns {Promise<function(string): Promise<{missing: string[], spurious: string[], why: string[]}>>}
     */
    async function rule(page, settings, family) {
        await page.route(/^https?:\/\//, route => route.abort('blockedbyclient'));
        await loadUserscriptPage(page, { url: BB + CHI, fixtureFile: fileOf(CHI), testMode: true, settingsOverride: { ...BASE, ...settings } });
        await page.waitForFunction(() => window.__saTest && window.__saTest.bbTagCheck);
        return name => page.evaluate(([html, url, fam]) => {
            const facts = window.__saTest.bbTagFacts(html, url);
            const rec = window.__saTest.dpParse('brucebase.wikidot.com', html, url);
            const r = window.__saTest.bbTagCheck(facts, ((rec && rec.tags) || []).map(t => t.text.toLowerCase()), []);
            const mine = list => list.filter(x => x.family === fam);
            return { missing: mine(r.missing).map(x => x.tag), spurious: mine(r.spurious).map(x => x.tag), why: mine(r.missing).map(x => x.why) };
        }, [fs.readFileSync(fileOf(name), 'utf8'), BB + name, family]);
    }
    const edited = (fn) => { const f = JSON.parse(JSON.stringify(FEED)); fn(f); return f; };

    test('songs on, the feed 1.5: each page as the probe found it, with the map\'s tags in the reason', async ({ page }) => {
        const check = await rule(page, { ...SONGS, ...kept(FEED) }, 'song');
        for (const [name, missing] of Object.entries(WANT_SONGS)) {
            const got = await check(name);
            expect({ name, missing: got.missing, spurious: got.spurious }).toEqual({ name, missing, spurious: [] });
        }
        expect((await check(WESTB)).why).toEqual([`The setlist has "DOES THIS BUS STOP AT 82ND STREET?" (the Brucebase feed's song map: ${FEED.songTags['song:does-this-bus-stop-at-82nd-street'].join(', ')}).`]);
    });

    test('the feed decides: a song outside its map is not checked; without songCombos the medley\'s songs are missing', async ({ browser }) => {
        const pg = await browser.newPage();
        pg.on('pageerror', e => pageErrors.push(String(e)));
        const lessMap = await rule(pg, { ...SONGS, ...kept(edited(f => delete f.songTags['song:high-hopes'])) }, 'song');
        expect((await lessMap(BRIS)).missing).toEqual(['night', 'tess']);
        await pg.close();
        const pg2 = await browser.newPage();
        pg2.on('pageerror', e => pageErrors.push(String(e)));
        // People Get Ready's map without the medley's tag: Cape Town (tagged "lohad.pgr", not "peoplegetready")
        // still carries it through the feed's songCombos, and not without them.
        const pgrOnly = f => { f.songTags['song:people-get-ready'] = ['peoplegetready']; };
        const withCombos = await rule(pg2, { ...SONGS, ...kept(edited(pgrOnly)) }, 'song');
        expect((await withCombos(CAPE)).missing).toEqual(['jlfw']);
        await pg2.close();
        const pg3 = await browser.newPage();
        pg3.on('pageerror', e => pageErrors.push(String(e)));
        const noCombos = await rule(pg3, { ...SONGS, ...kept(edited(f => { pgrOnly(f); f.tagTables.songCombos = {}; })) }, 'song');
        expect((await noCombos(CAPE)).missing).toEqual(['jlfw', 'peoplegetready']);
        await pg3.close();
    });

    test('a song counts under the map\'s other tags and under its link\'s title (edited map entries, Westbury 1975)', async ({ browser }) => {
        // The bus stop under a second tag the show carries; Kitty's Back under a tag no show has, so only
        // its title ("kittysback", which Westbury carries) can count.
        const feed = edited((f) => {
            f.songTags['song:does-this-bus-stop-at-82nd-street'] = ['dtbsa82s', 'gig'];
            f.songTags['song:kitty-s-back'] = ['zzzkittysback'];
        });
        const page = await browser.newPage();
        page.on('pageerror', e => pageErrors.push(String(e)));
        const check = await rule(page, { ...SONGS, ...kept(feed) }, 'song');
        expect((await check(WESTB)).missing).toEqual([]);
        await page.close();
    });

    test('songs off, a feed without its tables or its song map, the feed off: no song finding', async ({ browser }) => {
        for (const settings of [{ sa_bb_feed: true, sa_bb_tag_family_songs: false, ...kept(FEED) }, { ...SONGS, ...kept(FEED_13) },
            { ...SONGS, ...kept(edited(f => delete f.songTags)) }, { sa_bb_feed: false, sa_bb_tag_family_songs: true, ...kept(FEED) }]) {
            const page = await browser.newPage();
            page.on('pageerror', e => pageErrors.push(String(e)));
            const check = await rule(page, settings, 'song');
            for (const name of [BRIS, WESTB]) expect(await check(name), name).toMatchObject({ missing: [], spurious: [] });
            await page.close();
        }
    });

    test('the venue: the place family expects the venue page\'s tag from the feed\'s venueTags, not without the map', async ({ browser }) => {
        const pg = await browser.newPage();
        pg.on('pageerror', e => pageErrors.push(String(e)));
        const check = await rule(pg, { sa_bb_feed: true, sa_bb_tag_family_place: true, ...kept(FEED) }, 'place');
        expect((await check(FOREST)).missing).toEqual(['forestnational']);
        expect((await check(TOWER)).missing).toEqual(['towertheater']);
        expect((await check(FOREST)).why).toEqual(['The show\'s venue page (venue:forest-national-brussels-belgium) is tagged "forestnational" (the Brucebase feed\'s venue map).']);
        expect((await check(CHI)).missing).toEqual([]);
        await pg.close();
        const pg2 = await browser.newPage();
        pg2.on('pageerror', e => pageErrors.push(String(e)));
        const noMap = await rule(pg2, { sa_bb_feed: true, sa_bb_tag_family_place: true, ...kept(edited(f => delete f.venueTags)) }, 'place');
        expect((await noMap(FOREST)).missing).toEqual([]);
        await pg2.close();
    });

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
        await loadUserscriptPage(page, { url: BB + name, fixtureFile: fileOf(name), testMode: true, settingsOverride: { ...BASE, sa_bb_detail_pages: true, ...settings } });
        await servePages(page);
        await page.click(`button[data-label="${BB_EVENT_BUTTON}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
    }
    const card = page => page.locator('section.mb-sb-card').filter({ has: page.locator(':scope > .mb-sb-card-head', { hasText: /^Tags/ }) });
    const row = (c, label) => c.locator('.mb-sb-chip-row').filter({ has: c.page().locator(':scope > .mb-sb-chip-kind', { hasText: new RegExp(`^${label}$`) }) });

    test('Brisbane 2013: the three missing song tags in the Songs row once the On stage page is read', async ({ page }) => {
        await showEvent(page, BRIS, { ...SONGS, ...kept(FEED), sa_bb_onstage_tags: true });
        await expect(row(card(page), 'Songs').locator('.mb-sb-chip.mb-cbx-miss')).toHaveText(['highhopes missing', 'night missing', 'tess missing']);
    });

    test('Chicago 2016: "as expected" names the songs; the feed off, the wait line names them', async ({ page, browser }) => {
        await showEvent(page, CHI, { ...SONGS, ...kept(FEED), sa_bb_onstage_tags: true });
        await expect(card(page).locator('.mb-cbx-pill-ok')).toHaveText('✓ date, letter, kind, premiere, icon and song tags as expected');
        const off = await browser.newPage();
        off.on('pageerror', e => pageErrors.push(String(e)));
        await showEvent(off, CHI, { sa_bb_feed: false, sa_bb_tag_family_songs: true, sa_bb_onstage_tags: true });
        await expect(card(off).locator('.mb-cbx-wait')).toHaveText('The song tags are not checked: the Brucebase feed is off.');
        await off.close();
    });
});
