'use strict';

// The help-icon check (org/bbp-parity.org; vzell's decisions of 2026-11-16):
// a show the wiki marks with the Help Us icon carries the tag "help", one it
// marks Featured carries "featured", and a show with neither icon carries
// neither. A fifth family ("icon") of the two tag findings of batch 3,
// bb-tag-missing (❌) and bb-tag-spurious (⚠️). The icon is on the YEAR page:
//   - a year row has it from its build;
//   - a listing row gets it with its year page (read for the row anyway);
//   - a show's page and its window read the year page for it, one request.
//
// The fixture is 1968's year page with three of its entries, their pages and
// the On stage pages the wiki has of them, and 1968's listing, all real
// (mirror 2026-11-15, scripts/build-bb-findings-help-icon-fixtures.py), and
// one entry of 1966. All three 1968 entries have the Help Us icon:
//   1968-03-10  Hullabaloo          tagged "help"                 -> nothing
//   1968-05-00a Off Broad Street    no "help" tag                 -> "help" missing
//   1968-06-22a Off Broad Street    tagged "help" and "featured"; its star icon
//                                   has NO title on the year page -> nothing
//   1966-07-25  Unknown Location    no icon, tagged "help"        -> "help" not expected
// The star without a title is why the year page's icons are read by their
// image FILE: BruceBaseParser asks for title="Featured" and calls the
// "featured" tag of 12 such shows not expected.
// Also pinned: an On stage page whose name the wiki cut to 60 characters is
// asked by the cut name (1968-06-22a's ends in "-red-bank-n").

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { BB_YEAR_BUTTON, BB_YEAR_LIST_BUTTON, BB_EVENT_BUTTON } = require('../support/bbFixture');
const { waitForRenderComplete } = require('../support/browser');
const { findingRow } = require('../support/findingsMenu');

const BB = 'https://brucebase.wikidot.com/';
const YEAR_URL = `${BB}1968`;
const YEAR_FILE = path.join(__dirname, 'bb-year-1968-findings.html');
const LIST_FILE = path.join(__dirname, 'bb-year-list-1968.html');
const DIR = path.join(__dirname, 'bb-findings');
const PAGE_RE = /^https:\/\/brucebase\.wikidot\.com\/((?:gig|nogig|recording|rehearsal|interview|onstage):[^/?#]+)(\/noredirect\/true)?$/;
const OK = 'gig:1968-03-10-hullabaloo-freehold-nj';
const MISS = 'gig:1968-05-00a-off-broad-street-coffee-house-red-bank-nj';
const STAR = 'gig:1968-06-22a-off-broad-street-coffee-house-red-bank-nj';
/** The On stage page of 1968-06-22a as the wiki names it: cut to 60 characters. */
const STAR_ONSTAGE = 'onstage:1968-06-22a-off-broad-street-coffee-house-red-bank-n';
/** 1966: a show tagged "help" that the year page does not mark. */
const SPUR = 'gig:1966-07-25-unknown-location-asbury-park-nj';
const YEAR66_URL = `${BB}1966`;
const YEAR66_FILE = path.join(__dirname, 'bb-year-1966-icons.html');
const ON = { sa_bb_onstage_tags: true };
const QUIET = { sa_findings_bb_venue_mismatch: false, sa_findings_bb_year_unlisted: false };

const fileOf = name => path.join(DIR, `${name.replace(':', '_')}.html`);

/**
 * Serves the event pages and the tag pages from the fixtures, a 404 for a
 * page the wiki does not have; logs each request.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string[]>} The pages asked, in order.
 */
async function servePages(page) {
    const asked = [];
    await page.route(PAGE_RE, (route) => {
        const name = decodeURIComponent(route.request().url().match(PAGE_RE)[1]);
        asked.push(name);
        return fs.existsSync(fileOf(name))
            ? route.fulfill({ path: fileOf(name), contentType: 'text/html; charset=utf-8' })
            : route.fulfill({ status: 404, contentType: 'text/html', body: '<html><body>The page does not exist.</body></html>' });
    });
    return asked;
}

/**
 * Answers the script's own requests for the 1968 and 1966 year pages (the
 * cut fixtures), or refuses them (`fail`), and logs them in `window.__yearAsked`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{fail?: boolean}} [opts]
 * @returns {Promise<void>}
 */
async function answerYear(page, { fail = false } = {}) {
    await page.context().addInitScript(({ years, fail: bad }) => {
        window.__yearAsked = [];
        window.__gmXhrResponder = (opts) => {
            if (!years[opts.url]) return undefined;
            window.__yearAsked.push(opts.url);
            return bad ? { status: 500, responseHeaders: 'content-type: text/html\r\n', responseText: 'boom' }
                : { status: 200, finalUrl: opts.url, responseHeaders: 'content-type: text/html; charset=utf-8\r\n', responseText: years[opts.url] };
        };
    }, { years: { [YEAR_URL]: fs.readFileSync(YEAR_FILE, 'utf8'), [YEAR66_URL]: fs.readFileSync(YEAR66_FILE, 'utf8') }, fail });
}

/**
 * Loads a fixture at an address with the userscript, every other request refused.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} url
 * @param {string} file
 * @param {Object<string, *>} [settings]
 * @returns {Promise<void>}
 */
async function load(page, url, file, settings = {}) {
    await page.setViewportSize({ width: 1900, height: 1400 });
    await page.route(/^https?:\/\//, route => route.abort('blockedbyclient'));
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
    await page.route(/brucebase\.wdfiles\.com\//, route => route.fulfill({ status: 200, contentType: 'image/png', body: png }));
    await loadUserscriptPage(page, {
        url, fixtureFile: file, testMode: true,
        settingsOverride: {
            sa_enable_brucebase: true, sa_bb_year_pages: true, sa_bb_detail_pages: true,
            sa_foreign_mb_titles: false, sa_foreign_typography: false, ...QUIET, ...settings,
        },
    });
}

const pagesBtn = page => page.locator('th[data-col-name="On stage"] .mb-bbevp-col-hdr-btn');

/**
 * The live rows whose entry is one of the three, with their Tags cells.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<{key: string, state: string, icons: ?string, miss: string[], spur: string[], os: number, stamps: string[], level: string, title: string}>>}
 */
function tagCells(page) {
    return page.evaluate(() => Array.from(document.querySelectorAll('table.tbl tbody tr')).filter(tr => tr.style.display !== 'none').map((tr) => {
        const td = tr.querySelector('td.mb-bbevp-cell[data-mb-bbevp-col="Tags"]');
        const d = tr.querySelector('td > span.mb-bb-ev-data');
        const lis = td ? Array.from(td.querySelectorAll(':scope > ul > li')) : [];
        const text = li => li.textContent.replace(/\s+missing$/, '').trim();
        return {
            key: td ? (td.dataset.mbBbevpKey || '').replace('https://brucebase.wikidot.com/', '') : '',
            state: td ? td.dataset.mbBbevpState || '' : '',
            icons: d ? d.getAttribute('data-mb-bb-icons') : null,
            miss: lis.filter(li => li.classList.contains('mb-bb-tag-miss')).map(text),
            spur: lis.filter(li => li.classList.contains('mb-bb-tag-spur')).map(text),
            os: lis.filter(li => li.classList.contains('mb-bb-tag-os')).length,
            stamps: td ? (td.dataset.mbFindings || '').split(' ').filter(x => x.startsWith('bb-tag-')).sort() : [],
            level: td ? td.dataset.mbFinding || '' : '',
            title: td ? td.getAttribute('title') || '' : '',
        };
    }));
}

/**
 * Presses ▶ Pages and waits until the rows named are read, then stops.
 *
 * @param {import('@playwright/test').Page} page
 * @param {function(Object): boolean} mine - The rows that must be read.
 * @returns {Promise<void>}
 */
async function readRows(page, mine) {
    await pagesBtn(page).click();
    await expect.poll(async () => {
        await page.evaluate(() => {
            const td = document.querySelector('table.tbl tbody td.mb-bbevp-cell[data-mb-bbevp-col="On stage"][data-mb-bbevp-state="cold"]');
            if (td) td.scrollIntoView({ block: 'center' });
        });
        return (await tagCells(page)).filter(mine).every(r => r.state === 'done');
    }, { timeout: 90000 }).toBe(true);
    await pagesBtn(page).click();
}

let pageErrors;
test.beforeEach(({ page }) => {
    pageErrors = [];
    page.on('pageerror', e => pageErrors.push(String(e)));
});
test.afterEach(() => {
    expect(pageErrors, 'no script error').toEqual([]);
});

test.describe('Brucebase tag check: the Help Us and Featured icons (the help-icon check)', () => {
    test('the rule: an icon calls for its tag, a tag without the icon is not expected; with the year page not known only the page\'s own icon counts', async ({ page }) => {
        await load(page, YEAR_URL, YEAR_FILE);
        const run = (facts, own, icons) => page.evaluate(([f, o, i]) => {
            const r = window.__saTest.bbTagCheck(f, o, [], i);
            const pick = x => `${x.tag}/${x.family}: ${x.why}`;
            return { missing: r.missing.filter(x => x.family === 'icon').map(pick), spurious: r.spurious.filter(x => x.family === 'icon').map(pick) };
        }, [facts, own, icons]);
        const gig = { kind: 'gig', date: '1968-05-11', letter: '', prem: 0, help: false, featured: false };
        const base = ['1968', 'may', '11', 'saturday', 'gig'];
        const yes = { help: true, featured: true };
        const no = { help: false, featured: false };
        // The year page marks the show: both tags are called for.
        expect(await run(gig, base, yes)).toEqual({
            missing: ['help/icon: The year page marks this show with the Help Us icon.', 'featured/icon: The year page marks this show with the Featured icon.'],
            spurious: [],
        });
        expect(await run(gig, [...base, 'help', 'featured'], yes)).toEqual({ missing: [], spurious: [] });
        // Neither icon: the tags are not expected.
        expect(await run(gig, [...base, 'help', 'featured'], no)).toEqual({
            missing: [],
            spurious: ['help/icon: Neither the year page nor the show\'s page has the Help Us icon.', 'featured/icon: Neither the year page nor the show\'s page has the Featured icon.'],
        });
        expect(await run(gig, base, no)).toEqual({ missing: [], spurious: [] });
        // The year page not known: nothing is called not expected, and nothing missing…
        expect(await run(gig, [...base, 'help', 'featured'], null)).toEqual({ missing: [], spurious: [] });
        expect(await run(gig, base, null)).toEqual({ missing: [], spurious: [] });
        // …but for the icon the show's own page has.
        expect(await run({ ...gig, help: true }, base, null)).toEqual({ missing: ['help/icon: The show\'s page has the Help Us icon.'], spurious: [] });
        // The page's own icon counts beside a year page without it.
        expect(await run({ ...gig, help: true }, [...base, 'help'], no)).toEqual({ missing: [], spurious: [] });
    });

    test('what a page says: its own Help Us icon (MSG 2009-05-03 has one, the 1968 pages have none)', async ({ page }) => {
        await load(page, YEAR_URL, YEAR_FILE);
        const facts = (file, name) => page.evaluate(([html, url]) => window.__saTest.bbTagFacts(html, url), [fs.readFileSync(file, 'utf8'), BB + name]);
        const msg = path.join(__dirname, 'bb-event-gig-2009-05-03.html');
        expect(fs.readFileSync(msg, 'utf8')).toMatch(/<img[^>]*title="Help Us"[^>]*class="image"/);
        expect(await facts(msg, 'gig:2009-05-03-madison-square-garden-new-york-city-ny')).toMatchObject({ help: true, featured: false });
        expect(await facts(fileOf(MISS), MISS)).toMatchObject({ help: false, featured: false });
    });

    test('the year reader keeps each show\'s Help Us and Featured icon', async ({ page }) => {
        await load(page, YEAR_URL, YEAR_FILE);
        const shows = await page.evaluate(([html, url]) => Object.values(window.__saTest.extBbParseYear(html, url).shows)
            .map(s => [new URL(s.gig).pathname.slice(1), s.help, s.featured]), [fs.readFileSync(YEAR_FILE, 'utf8'), YEAR_URL]);
        expect(shows).toEqual([[OK, true, false], [MISS, true, false], [STAR, true, true]]);
        // The fixture as the wiki writes it (not a guess of this spec): three
        // Help Us icons, and one star in an entry, which has NO title (the
        // other star is the page's legend, "Featured Pages").
        const html = fs.readFileSync(YEAR_FILE, 'utf8');
        expect((html.match(/title="Help Us"/g) || []).length).toBeGreaterThanOrEqual(3);
        expect(html).not.toMatch(/title="Featured"/);
        expect((html.match(/<img src="[^"]*\/00Star-32\.png" alt="00Star-32\.png" class="image" \/>/g) || []).length).toBe(1);
        // 1966-07-25: no icon of either kind.
        const y66 = await page.evaluate(([h, u]) => Object.values(window.__saTest.extBbParseYear(h, u).shows)
            .map(s => [new URL(s.gig).pathname.slice(1), s.help, s.featured]), [fs.readFileSync(YEAR66_FILE, 'utf8'), YEAR66_URL]);
        expect(y66).toEqual([[SPUR, false, false]]);
    });

    test('the year table: the row knows its icons from the start; after ▶ Pages "help" is missing on one row, and the star without a title calls for "featured"', async ({ page }) => {
        await load(page, YEAR_URL, YEAR_FILE, ON);
        const asked = await servePages(page);
        await page.click(`button[data-label="${BB_YEAR_BUTTON}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        // With the table, no request: every row says its icons on the Event cell's carrier.
        expect((await tagCells(page)).map(r => [r.key, r.icons, r.stamps])).toEqual([[OK, 'help', []], [MISS, 'help', []], [STAR, 'help featured', []]]);
        await readRows(page, () => true);
        const by = Object.fromEntries((await tagCells(page)).map(r => [r.key, r]));
        expect([by[OK].miss, by[OK].spur, by[OK].level]).toEqual([[], [], '']);
        expect([by[MISS].miss, by[MISS].spur, by[MISS].level, by[MISS].stamps]).toEqual([['help'], [], 'error', ['bb-tag-missing']]);
        // 1968-06-22a is tagged "featured" and has the star: nothing to say.
        expect([by[STAR].miss, by[STAR].spur, by[STAR].level, by[STAR].stamps]).toEqual([[], [], '', []]);
        expect(by[MISS].title).toMatch(/missing: help \(The year page marks this show with the Help Us icon\)/);
        expect((await findingRow(page, 'error', 'bb-tag-missing')).count).toBe(1);
        expect(await findingRow(page, 'warn', 'bb-tag-spurious')).toBeUndefined();
        // The On stage page whose name the wiki cut to 60 characters is asked
        // by that name, found, and its cast tags are listed.
        expect(asked).toContain(STAR_ONSTAGE);
        expect(asked.filter(n => n.startsWith('onstage:1968-06-22a'))).toEqual([STAR_ONSTAGE]);
        expect(by[STAR].os).toBeGreaterThan(0);
        // 1968-05-00a has no On stage page: asked, then its "-1"; both missing, so every tag is known.
        expect(asked.filter(n => n.startsWith('onstage:1968-05-00a'))).toEqual([
            'onstage:1968-05-00a-off-broad-street-coffee-house-red-bank-n', 'onstage:1968-05-00a-off-broad-street-coffee-house-red-bank-1']);
    });

    test('the year table: a show tagged "help" that the year page does not mark: not expected', async ({ page }) => {
        await load(page, YEAR66_URL, YEAR66_FILE, ON);
        await servePages(page);
        await page.click(`button[data-label="${BB_YEAR_BUTTON}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        expect((await tagCells(page)).map(r => [r.key, r.icons])).toEqual([[SPUR, '']]);
        await readRows(page, () => true);
        const [row] = await tagCells(page);
        expect([row.miss, row.spur, row.level, row.stamps]).toEqual([[], ['help'], 'warn', ['bb-tag-spurious']]);
        expect(row.title).toMatch(/not expected: help \(Neither the year page nor the show's page has the Help Us icon\)/);
        expect((await findingRow(page, 'warn', 'bb-tag-spurious')).count).toBe(1);
    });

    test('the year listing: its rows get their icons with the year page, and the same tags are marked', async ({ page }) => {
        await answerYear(page);
        await load(page, `${BB}1968-list`, LIST_FILE, ON);
        await servePages(page);
        await page.click(`button[data-label="${BB_YEAR_LIST_BUTTON}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const mine = r => ['1968#100368', '1968#000568a', '1968#220668a'].includes(r.key);
        // Before the year page is read a listing row does not know its icons.
        expect((await tagCells(page)).filter(mine).map(r => r.icons)).toEqual([null, null, null]);
        // Only the three rows whose pages this spec serves are waited for.
        await pagesBtn(page).click();
        await expect.poll(async () => {
            await page.evaluate((keys) => {
                const td = Array.from(document.querySelectorAll('table.tbl tbody td.mb-bbevp-cell[data-mb-bbevp-col="On stage"][data-mb-bbevp-state="cold"]'))
                    .find(c => keys.some(k => c.dataset.mbBbevpKey.endsWith(k)));
                if (td) td.scrollIntoView({ block: 'center' });
            }, ['1968#100368', '1968#000568a', '1968#220668a']);
            return (await tagCells(page)).filter(mine).map(r => r.state).join(' ');
        }, { timeout: 90000 }).toBe('done done done');
        await pagesBtn(page).click();
        const rows = (await tagCells(page)).filter(mine);
        expect(rows.map(r => [r.key, r.icons, r.miss, r.spur])).toEqual([
            ['1968#100368', 'help', [], []],
            ['1968#000568a', 'help', ['help'], []],
            ['1968#220668a', 'help featured', [], []],
        ]);
        expect(await page.evaluate(() => window.__yearAsked.length), 'one request for the year').toBe(1);
    });
});

test.describe('Brucebase tag check: the icons on a show\'s page (the help-icon check)', () => {
    const card = page => page.locator('section.mb-sb-card').filter({ has: page.locator(':scope > .mb-sb-card-head', { hasText: /^Tags/ }) });

    /**
     * Loads an event page fixture at its address and presses its button.
     *
     * @param {import('@playwright/test').Page} page
     * @param {string} name
     * @param {Object<string, *>} [settings]
     * @returns {Promise<void>}
     */
    async function showEvent(page, name, settings = {}) {
        await load(page, BB + name, fileOf(name), settings);
        await servePages(page);
        await page.click(`button[data-label="${BB_EVENT_BUTTON}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
    }

    test('the year page is read once for the show: "help" is missing, with the reason', async ({ page }) => {
        await answerYear(page);
        await showEvent(page, MISS, ON);
        const c = card(page);
        await expect(c.locator('.mb-sb-chip.mb-cbx-miss')).toHaveText(['help missing']);
        await expect(c.locator('.mb-sb-chip-row', { hasText: 'On the page' }).locator('.mb-sb-chip.mb-cbx-miss')).toHaveCount(1);
        await expect(c.locator('.mb-cbx-finds .mb-cbx-find-e')).toContainText('help is expected and missing. The year page marks this show with the Help Us icon.');
        expect(await page.evaluate(() => window.__yearAsked)).toEqual([YEAR_URL]);
    });

    test('"help" without the icon is marked as not expected; shows with their icons and tags are as expected (the star without a title too)', async ({ page }) => {
        await answerYear(page);
        await showEvent(page, SPUR, ON);
        await expect(card(page).locator('.mb-sb-chip.mb-cbx-spur')).toHaveText(['help']);
        expect(await card(page).locator('.mb-sb-chip.mb-cbx-spur').getAttribute('data-mbtt')).toMatch(/Not expected: help[\s\S]*Help Us icon/);
        await expect(card(page).locator('.mb-cbx-miss')).toHaveCount(0);
        expect(await page.evaluate(() => window.__yearAsked)).toEqual([YEAR66_URL]);
        for (const name of [OK, STAR]) {
            const two = await page.context().newPage();
            two.on('pageerror', e => pageErrors.push(String(e)));
            await showEvent(two, name, ON);
            await expect(card(two).locator('.mb-cbx-pill-ok'), name).toHaveText(/icon tags as expected/);
            await expect(card(two).locator('.mb-cbx-miss, .mb-cbx-spur'), name).toHaveCount(0);
            await two.close();
        }
    });

    test('with the On stage pages off, the year page\'s answer alone refills the card', async ({ page }) => {
        await answerYear(page);
        // No other tag page is read, so nothing but the year page's answer
        // comes after the card is drawn.
        await showEvent(page, SPUR, { sa_bb_onstage_tags: false });
        await expect(card(page).locator('.mb-sb-chip.mb-cbx-spur')).toHaveText(['help']);
        expect(await page.evaluate(() => window.__yearAsked)).toEqual([YEAR66_URL]);
    });

    test('the year page not read (it fails): no icon tag is called missing or not expected', async ({ page }) => {
        await answerYear(page, { fail: true });
        await showEvent(page, SPUR, ON);
        const c = card(page);
        // The check is made (the On stage page is read), without the icon family.
        await expect(c.locator('.mb-sb-chip.mb-cbx-x').first()).toBeVisible();
        await expect.poll(() => page.evaluate(() => window.__yearAsked.length)).toBeGreaterThan(0);
        await expect(c.locator('.mb-cbx-wait')).toHaveCount(0, { timeout: 15000 });
        await expect(c.locator('.mb-cbx-miss, .mb-cbx-spur')).toHaveCount(0);
    });

    test('both tag findings switched off: the year page is not asked', async ({ page }) => {
        await answerYear(page);
        await showEvent(page, MISS, { ...ON, sa_findings_bb_tag_missing: false, sa_findings_bb_tag_spurious: false });
        await expect(card(page).locator('.mb-sb-chip').first()).toBeVisible();
        await page.evaluate(() => new Promise(r => setTimeout(r, 1500)));
        expect(await page.evaluate(() => window.__yearAsked)).toEqual([]);
        await expect(card(page).locator('.mb-cbx-miss, .mb-cbx-spur')).toHaveCount(0);
    });
});
