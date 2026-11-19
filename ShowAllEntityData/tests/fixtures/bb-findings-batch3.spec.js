'use strict';

// A Brucebase show's expected tags against the tags it has (org/bbp-parity.org,
// Track A batch 3; vzell's decisions of 2026-11-15; mockup
// https://claude.ai/artifact/Xx3N3sZgqkoy4DYQK5ZBoo):
//   bb-tag-missing  (❌)  a date part, the day letter, the kind of page or the
//                         premiere count the page calls for is on none of the
//                         show's pages
//   bb-tag-spurious (⚠️)  a tag of those four families the page does not call for
// Three places: the year table's Tags column (the registry findings), the
// event page's Tags card and the preview window (marks on the chips).
//
// The fixture is 2016's year page with four of its entries, their pages and
// the three gigs' On stage pages, all real (mirror 2026-11-15,
// scripts/build-bb-findings-batch3-fixtures.py); what each shows is what
// scripts/probe-bb-batch3-findings.py found:
//   Pittsburgh 2016-01-16   35 songs in bold, "prem" but no "9+"  -> missing
//   Chicago    2016-01-19   6 in bold and the tag "6"             -> nothing
//   Madrid     2016-05-21   3 in bold, the tag "2"                -> "3" missing, "2" not expected
//   interview  2016-09-06   also tagged "nogig"                   -> not expected
//                           (an On Stage tab, but the wiki has no On stage page)
// The tags expected in a cell are counted HERE from the fixture files.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { BB_YEAR_BUTTON, BB_EVENT_BUTTON } = require('../support/bbFixture');
const { waitForRenderComplete } = require('../support/browser');
const { findingRow, clickFinding, findingRowState } = require('../support/findingsMenu');
const { clickToolbarItem } = require('../support/toolbarMenu');

const BB = 'https://brucebase.wikidot.com/';
const YEAR_URL = `${BB}2016`;
const YEAR_FILE = path.join(__dirname, 'bb-year-2016-findings.html');
const DIR = path.join(__dirname, 'bb-findings');
const PAGE_RE = /^https:\/\/brucebase\.wikidot\.com\/((?:gig|nogig|recording|rehearsal|interview|onstage):[^/?#]+)(\/noredirect\/true)?$/;
const PIT = 'gig:2016-01-16-consol-energy-center-pittsburgh-pa';
const CHI = 'gig:2016-01-19-united-center-chicago-il';
const MAD = 'gig:2016-05-21-estadio-santiago-bernabeu-madrid-spain';
const INT = 'interview:2016-09-06-stone-hill-studio-colts-neck-nj';
const KEYS = [PIT, CHI, MAD, INT];
/** Each entry's findings once every page is read: [missing tags, not-expected tags]. */
const WANT = { [PIT]: [['9+'], []], [CHI]: [[], []], [MAD]: [['3'], ['2']], [INT]: [[], ['nogig']] };
/** The On stage pages are read: the setting FIXTURE_SETTINGS_OVERRIDE switches off. */
const ON = { sa_bb_onstage_tags: true };
/** Other findings of the year table that would ask for pages this spec does not serve. */
const QUIET = { sa_findings_bb_venue_mismatch: false, sa_findings_bb_year_unlisted: false };

const fileOf = name => path.join(DIR, `${name.replace(':', '_')}.html`);

/**
 * A fixture page's tags, read with a regex (not the script).
 *
 * @param {string} name - "gig:2016-…".
 * @returns {string[]}
 */
function tagsOf(name) {
    const html = fs.readFileSync(fileOf(name), 'utf8');
    const box = (html.match(/<div class="page-tags">([\s\S]*?)<\/div>/) || [])[1] || '';
    return Array.from(box.matchAll(/<a href="\/system:page-tags\/tag\/[^"#]*#pages">([^<]*)<\/a>/g), m => m[1].trim()).filter(Boolean);
}

/**
 * A show's own tags and the ones its On stage page adds.
 *
 * @param {string} name
 * @param {boolean} onstage - Whether the On stage page is read.
 * @returns {{own: string[], extra: string[]}}
 */
function tagsFor(name, onstage) {
    const own = tagsOf(name);
    const seen = new Set(own.map(t => t.toLowerCase()));
    const on = name.replace(/^gig:/, 'onstage:');
    const extra = onstage && on !== name && fs.existsSync(fileOf(on)) ? tagsOf(on).filter(t => !seen.has(t.toLowerCase())) : [];
    return { own, extra };
}

/**
 * Serves the event pages and the tag pages (`…/noredirect/true`) from the
 * fixtures, a 404 for a page the wiki does not have; logs each request.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string[]>} The pages asked, in order ("gig:…", "onstage:…").
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
 * Loads the year fixture with the userscript, every other request refused.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object<string, *>} [settings]
 * @returns {Promise<void>}
 */
async function loadYear(page, settings = {}) {
    await page.setViewportSize({ width: 1900, height: 1400 });
    await page.route(/^https?:\/\//, route => route.abort('blockedbyclient'));
    await loadUserscriptPage(page, {
        url: YEAR_URL, fixtureFile: YEAR_FILE, testMode: true,
        settingsOverride: { sa_enable_brucebase: true, sa_bb_year_pages: true, sa_foreign_mb_titles: false, sa_foreign_typography: false, ...QUIET, ...settings },
    });
}

/**
 * Presses "Show all events" and waits for the table.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function show(page) {
    await page.click(`button[data-label="${BB_YEAR_BUTTON}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

const pagesBtn = page => page.locator('th[data-col-name="On stage"] .mb-bbevp-col-hdr-btn');

/**
 * The live rows' Tags cells, in the page's order.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<{key: string, state: string, miss: string[], spur: string[], os: number, rows: number,
 *   shown: string[], stamps: string[], level: string, title: string}>>}
 */
function tagCells(page) {
    return page.evaluate(() => Array.from(document.querySelectorAll('table.tbl tbody tr')).filter(tr => tr.style.display !== 'none').map((tr) => {
        const td = tr.querySelector('td.mb-bbevp-cell[data-mb-bbevp-col="Tags"]') || Array.from(tr.querySelectorAll('td')).find(c => c.querySelector(':scope > span.mb-bb-tag-data'));
        const a = tr.querySelector('td a[href*="wikidot.com/"][href*=":2016-"], td a[href^="/"][href*=":2016-"]');
        const lis = td ? Array.from(td.querySelectorAll(':scope > ul > li')) : [];
        const text = li => li.textContent.replace(/\s+missing$/, '').trim();
        return {
            key: a ? decodeURIComponent(new URL(a.href, location.href).pathname.slice(1)) : '',
            state: td ? td.dataset.mbBbevpState || '' : 'no cell',
            miss: lis.filter(li => li.classList.contains('mb-bb-tag-miss')).map(text),
            spur: lis.filter(li => li.classList.contains('mb-bb-tag-spur')).map(text),
            os: lis.filter(li => li.classList.contains('mb-bb-tag-os')).length,
            rows: lis.length,
            shown: lis.filter(li => getComputedStyle(li).display !== 'none').map(text),
            stamps: td ? (td.dataset.mbFindings || '').split(' ').filter(x => x.startsWith('bb-tag-')).sort() : [],
            level: td ? td.dataset.mbFinding || '' : '',
            title: td ? td.getAttribute('title') || '' : '',
        };
    }));
}

/**
 * Presses ▶ Pages, waits until every row is read, then stops.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function readAll(page) {
    await pagesBtn(page).click();
    await expect.poll(async () => {
        await page.evaluate(() => {
            const td = document.querySelector('table.tbl tbody td.mb-bbevp-cell[data-mb-bbevp-col="On stage"][data-mb-bbevp-state="cold"]');
            if (td) td.scrollIntoView({ block: 'center' });
        });
        return (await tagCells(page)).map(r => r.state).join(' ');
    }, { timeout: 60000 }).toBe(KEYS.map(() => 'done').join(' '));
    await pagesBtn(page).click();
}

/**
 * Asserts every row's Tags cell and the two menu rows.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{onstage?: boolean, missing?: boolean, spurious?: boolean}} [opts] - What is read and looked for.
 * @returns {Promise<void>}
 */
async function expectRead(page, { onstage = true, missing = true, spurious = true } = {}) {
    const want = KEYS.map((k) => {
        const t = tagsFor(k, onstage && missing);
        // A missing tag is said only when every page that may keep the
        // show's tags is read: never for a gig whose On stage page is not.
        const known = !k.startsWith('gig:') || (onstage && missing);
        const miss = missing && known ? WANT[k][0] : [];
        const spur = spurious ? WANT[k][1] : [];
        return {
            key: k, miss, spur, os: t.extra.length, rows: t.own.length + t.extra.length + miss.length,
            stamps: [miss.length ? 'bb-tag-missing' : '', spur.length ? 'bb-tag-spurious' : ''].filter(Boolean),
            level: miss.length ? 'error' : spur.length ? 'warn' : '',
        };
    });
    const pick = r => ({ key: r.key, miss: r.miss, spur: r.spur, os: r.os, rows: r.rows, stamps: r.stamps, level: r.level });
    await expect.poll(async () => (await tagCells(page)).map(pick), { timeout: 15000 }).toEqual(want);
    for (const [id, level, i] of [['bb-tag-missing', 'error', 'miss'], ['bb-tag-spurious', 'warn', 'spur']]) {
        const n = want.filter(r => r[i].length).length;
        const row = await findingRow(page, level, id);
        if (n) expect(row && row.count, `${id} in the ${level} menu`).toBe(n);
        else expect(row, `${id} has no menu row`).toBeUndefined();
    }
}

let pageErrors;
test.beforeEach(({ page }) => {
    pageErrors = [];
    page.on('pageerror', e => pageErrors.push(String(e)));
});
test.afterEach(() => {
    expect(pageErrors, 'no script error').toEqual([]);
});

test.describe('Brucebase year table: the Tags column and its findings (bbp-parity batch 3)', () => {
    test('with the table, before any page is read: a Tags column, cold, no finding and no request', async ({ page }) => {
        await loadYear(page, ON);
        const asked = await servePages(page);
        await show(page);
        const names = await page.locator('table.tbl thead tr:first-child th').evaluateAll(ths => ths.map(th => th.dataset.colName || ''));
        expect(names.slice(names.indexOf('On stage'), names.indexOf('On stage') + 5)).toEqual(['On stage', 'Content', 'Images', 'Start', 'Tags']);
        expect((await tagCells(page)).map(r => [r.key, r.state, r.rows, r.stamps])).toEqual(KEYS.map(k => [k, 'cold', 0, []]));
        expect(await findingRow(page, 'error', 'bb-tag-missing')).toBeUndefined();
        expect(await findingRow(page, 'warn', 'bb-tag-spurious')).toBeUndefined();
        await page.evaluate(() => new Promise(r => setTimeout(r, 1200)));
        expect(asked, 'nothing asked').toEqual([]);
    });

    test('after ▶ Pages: every tag a row, the cast\'s from the On stage page; the missing and the not-expected tags, counted and painted', async ({ page }) => {
        await loadYear(page, ON);
        const asked = await servePages(page);
        await show(page);
        await readAll(page);
        await expectRead(page);
        // WHICH pages: each entry's own; the "-2" of a page whose tags are
        // over 450 of the 512 characters (counted here from the fixtures:
        // Pittsburgh and Chicago), which the wiki does not have; every
        // show's On stage page (all four have the tab), and for the
        // interview, whose On stage page the wiki does not have, its "-1".
        const full = KEYS.filter(k => tagsOf(k).join(' ').length > 450);
        expect(full).toEqual([PIT, CHI]);
        const on = k => k.replace(/^[a-z]+:/, 'onstage:');
        expect(asked.filter(n => !KEYS.includes(n)).sort()).toEqual(
            [...full.map(k => `${k}-2`), ...KEYS.map(on), `${on(INT)}-1`].sort());
        expect(asked.filter(n => KEYS.includes(n)).sort()).toEqual(KEYS.slice().sort());
        const cells = await tagCells(page);
        const by = Object.fromEntries(cells.map(r => [r.key, r]));
        // The look: an error's tint for a missing tag, a warning's for a tag
        // that is not expected alone.
        expect([by[PIT].level, by[CHI].level, by[MAD].level, by[INT].level]).toEqual(['error', '', 'error', 'warn']);
        // The cell's hover text says each finding with its reason.
        expect(by[PIT].title).toMatch(/an expected tag is missing/);
        expect(by[PIT].title).toMatch(/missing: 9\+ \(35 songs are in bold on the Setlist tab/);
        expect(by[MAD].title).toMatch(/missing: 3 \(3 songs are in bold/);
        expect(by[MAD].title).toMatch(/not expected: 2 \(3 songs are in bold on the Setlist tab, not 2\)/);
        expect(by[INT].title).toMatch(/not expected: nogig \(The page is a interview, and "nogig" is another kind of page\)/);
        expect(by[CHI].title).not.toMatch(/tag/i);
        // Folded: the first row, and every marked row whatever its place.
        expect(by[PIT].shown).toEqual(['9+']);
        expect(by[MAD].shown).toEqual(['3', '2']);
        expect(by[INT].shown[0]).toBe('nogig');
        expect(by[INT].shown).toHaveLength(1);
        expect(by[CHI].shown).toHaveLength(1);
        // A tag kept on the On stage page is listed once, as such.
        const pit = await page.evaluate(() => {
            const td = Array.from(document.querySelectorAll('td.mb-bbevp-cell[data-mb-bbevp-col="Tags"]')).find(c => /9\+/.test(c.textContent));
            return Array.from(td.querySelectorAll('li.mb-bb-tag-os'), li => li.textContent);
        });
        expect(pit.slice().sort()).toEqual(tagsFor(PIT, true).extra.slice().sort());
    });

    test('a menu row leaves the flagged rows, a second click brings all back', async ({ page }) => {
        await loadYear(page, ON);
        await servePages(page);
        await show(page);
        await readAll(page);
        await expectRead(page);
        await clickFinding(page, 'bb-tag-missing');
        await expect.poll(() => findingRowState(page, 'bb-tag-missing')).toEqual({ visible: 2, withFinding: 2 });
        expect((await tagCells(page)).map(r => r.key)).toEqual([PIT, MAD]);
        await clickFinding(page, 'bb-tag-missing');
        await expect.poll(async () => (await tagCells(page)).length).toBe(KEYS.length);
        await clickFinding(page, 'bb-tag-spurious');
        await expect.poll(() => findingRowState(page, 'bb-tag-spurious')).toEqual({ visible: 2, withFinding: 2 });
        expect((await tagCells(page)).map(r => r.key)).toEqual([MAD, INT]);
    });

    test('the On stage pages switched off: none is asked, no gig is said to lack a tag, a tag that is not expected still is', async ({ page }) => {
        await loadYear(page, { sa_bb_onstage_tags: false });
        const asked = await servePages(page);
        await show(page);
        await readAll(page);
        await expectRead(page, { onstage: false });
        expect(asked.filter(n => /^onstage:|-2$/.test(n)), 'no tag page asked').toEqual([]);
    });

    test('"missing" switched off: no tag page is asked for it, the tags that are not expected alone', async ({ page }) => {
        await loadYear(page, { ...ON, sa_findings_bb_tag_missing: false });
        const asked = await servePages(page);
        await show(page);
        await readAll(page);
        await expectRead(page, { missing: false });
        expect(asked.filter(n => /^onstage:|-2$/.test(n)), 'no tag page asked').toEqual([]);
    });

    test('"not expected" switched off: the missing tags alone', async ({ page }) => {
        await loadYear(page, { ...ON, sa_findings_bb_tag_spurious: false });
        await servePages(page);
        await show(page);
        await readAll(page);
        await expectRead(page, { spurious: false });
        // No row is marked as not expected, in its list either.
        expect((await tagCells(page)).flatMap(r => r.spur)).toEqual([]);
    });

    test('rows read before, in a second tab: tags and findings from the store, with no ▶ Pages and no request', async ({ page }) => {
        await loadYear(page, ON);
        await servePages(page);
        await show(page);
        await readAll(page);
        await expectRead(page);
        // A second tab of the same browser: the store is shared, memory is not.
        const two = await page.context().newPage();
        two.on('pageerror', e => pageErrors.push(String(e)));
        await loadYear(two, ON);
        const asked = await servePages(two);
        await show(two);
        await expectRead(two);
        await two.evaluate(() => new Promise(r => setTimeout(r, 1200)));
        expect(asked, 'painted from the store').toEqual([]);
        await expect(pagesBtn(two)).toHaveAttribute('aria-pressed', 'false');
    });

    test('Save to Disk → Load from Disk: the cells keep their tags and findings, and nothing is asked', async ({ context }) => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-bb-tags-disk-'));
        try {
            const source = await context.newPage();
            await loadYear(source, ON);
            await servePages(source);
            await show(source);
            await readAll(source);
            await expectRead(source);
            const downloadPromise = source.waitForEvent('download', { timeout: 60000 });
            await clickToolbarItem(source, '#mb-save-to-disk-btn');
            await source.locator('#sa-sd-save-confirm').waitFor({ state: 'visible', timeout: 15000 });
            await source.click('#sa-sd-save-confirm');
            const saved = path.join(tmpDir, 'bb-year.json.gz');
            await (await downloadPromise).saveAs(saved);
            await source.close();

            const page = await context.newPage();
            await loadYear(page, ON);
            const asked = await servePages(page);
            await clickToolbarItem(page, '#mb-load-from-disk-btn');
            await page.locator('input[type="file"]').first().setInputFiles(saved);
            await waitForRenderComplete(page, { waitForAutoResize: false });
            await expectRead(page);
            await page.evaluate(() => new Promise(r => setTimeout(r, 1200)));
            expect(asked, 'nothing asked').toEqual([]);
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });
});

test.describe('Brucebase tag check: the rule (bbp-parity batch 3)', () => {
    test('date parts, the day letter, the kind and the premiere count; a number with or without its zero; a tag of another page', async ({ page }) => {
        await loadYear(page);
        const run = (facts, own, more) => page.evaluate(([f, o, m]) => {
            const r = window.__saTest.bbTagCheck(f, o, m);
            return { missing: r.missing.map(x => `${x.tag}/${x.family}`), spurious: r.spurious.map(x => `${x.tag}/${x.family}`) };
        }, [facts, own, more || []]);
        const gig = { kind: 'gig', date: '2016-05-21', letter: '', prem: 0 };
        // 2016-05-21 was a Saturday.
        expect(await run(gig, ['2016', 'may', '21', 'saturday', 'gig'])).toEqual({ missing: [], spurious: [] });
        expect(await run(gig, ['2016', 'may', '21', 'friday', 'gig'])).toEqual({ missing: ['saturday/date'], spurious: ['friday/date'] });
        expect(await run(gig, [])).toEqual({ missing: ['2016/date', 'may/date', '21/date', 'saturday/date', 'gig/type'], spurious: [] });
        // "5" and "05" are one day.
        const fifth = { kind: 'gig', date: '2016-05-05', letter: '', prem: 0 };
        expect((await run(fifth, ['2016', 'may', '5', 'thursday', 'gig'])).missing).toEqual([]);
        expect((await run(fifth, ['2016', 'may', '05', 'thursday', 'gig'])).missing).toEqual([]);
        // A month without a day: "00" is the day, and no weekday.
        expect(await run({ kind: 'recording', date: '1984-09-00', letter: '', prem: 0 }, ['1984', 'september', '00', 'recording']))
            .toEqual({ missing: [], spurious: [] });
        // The day letter comes from the address; a letter without one is not expected.
        expect((await run({ ...gig, letter: 'b' }, ['2016', 'may', '21', 'saturday', 'gig'])).missing).toEqual(['b/letter']);
        expect((await run(gig, ['2016', 'may', '21', 'saturday', 'gig', 'a'])).spurious).toEqual(['a/letter']);
        // The premiere count with "prem"; ten or more is "9+"; a single digit is a count before it is a day.
        expect((await run({ ...gig, prem: 3 }, ['2016', 'may', '21', 'saturday', 'gig', '2', 'prem']))).toEqual({ missing: ['3/prem'], spurious: ['2/prem'] });
        expect((await run({ ...gig, prem: 35 }, ['2016', 'may', '21', 'saturday', 'gig', 'prem'])).missing).toEqual(['9+/prem']);
        expect((await run(gig, ['2016', 'may', '21', 'saturday', 'gig', 'prem'])).spurious).toEqual(['prem/prem']);
        // Another kind of page; "onstage" and "soundcheck" are left alone.
        expect((await run(gig, ['2016', 'may', '21', 'saturday', 'gig', 'recording', 'onstage', 'soundcheck'])).spurious).toEqual(['recording/type']);
        // A tag kept on another page is present, and never "not expected".
        expect(await run(gig, ['2016', 'may', '21', 'gig'], ['saturday', 'friday'])).toEqual({ missing: [], spurious: [] });
        // Not a show: nothing.
        expect(await page.evaluate(() => window.__saTest.bbTagCheck(null, ['x'], []))).toEqual({ missing: [], spurious: [] });
    });

    test('what a page says: its kind and letter from the address, its date from the title, the songs in bold', async ({ page }) => {
        await loadYear(page);
        const facts = (name, addr) => page.evaluate(([html, url]) => window.__saTest.bbTagFacts(html, url), [fs.readFileSync(fileOf(name), 'utf8'), BB + (addr || name)]);
        // The title as written (batch 3b's place family reads its parts) and
        // what the tabs hold (its content family).
        const none = { ticket: false, setlist: false, handwritten: false, printed: false, storyteller: false, eyewitness: false };
        // The 2016 tour's On Stage tab: the band as the page lists it (batch 3b's cast family).
        const band = { tab: 'On Stage', names: ['Bruce Springsteen', 'The E Street Band', 'Roy Bittan', 'Nils Lofgren', 'Patti Scialfa',
            'Garry Tallent', 'Steven Van Zandt', 'Max Weinberg', 'Jake Clemons', 'Charles Giordano', 'Soozie Tyrell'] };
        expect(await facts(PIT)).toEqual({
            title: '2016-01-16 Consol Energy Center, Pittsburgh, PA', kind: 'gig', date: '2016-01-16', letter: '', prem: 35, help: false, featured: false,
            content: { ...none, ticket: true, setlist: true, printed: true, storyteller: true }, cast: band,
            venue: 'venue:consol-energy-center-pittsburgh-pa', songs: expect.any(Array),
        });
        expect(await facts(MAD)).toEqual({
            title: '2016-05-21 Estadio Santiago Bernabéu, Madrid, Spain', kind: 'gig', date: '2016-05-21', letter: '', prem: 3, help: false, featured: false,
            content: { ...none, ticket: true, storyteller: true }, cast: band,
            venue: 'venue:estadio-santiago-bernabeu-madrid-spain', songs: expect.any(Array),
        });
        expect(await facts(INT)).toEqual({
            title: '2016-09-06 Stone Hill Studio, Colts Neck, NJ', kind: 'interview', date: '2016-09-06', letter: '', prem: 0, help: false, featured: false,
            content: none, cast: { tab: 'On Stage', names: ['Rahni Sadler', 'Bruce Springsteen'] },
            venue: 'venue:stone-hill-studio-colts-neck-nj', songs: [],
        });
        // The setlist's song links by line (batch 3b's songs family): Pittsburgh's first line.
        expect((await facts(PIT)).songs[0]).toEqual([{ page: 'song:rebel-rebel', text: 'REBEL REBEL' }]);
        expect((await facts(MAD, 'gig:2016-05-21b-estadio-santiago-bernabeu-madrid-spain')).letter).toBe('b');
        // Not a show: a venue address gets a page's facts (batch 4), no date or premiere count;
        // a kind no check covers gets none.
        const asVenue = await facts(MAD, 'venue:estadio-santiago-bernabeu-madrid-spain');
        expect([asVenue.page, asVenue.kind, 'date' in asVenue, 'prem' in asVenue], 'not a show').toEqual([true, 'venue', false, false]);
        expect(await facts(MAD, 'lyrics:estadio-santiago-bernabeu-madrid-spain'), 'not a checked kind').toBeNull();
    });
});

test.describe('Brucebase tag check: the event page\'s Tags card (bbp-parity batch 3)', () => {
    /**
     * Loads an event page fixture at its address and presses its button.
     *
     * @param {import('@playwright/test').Page} page
     * @param {string} name
     * @param {Object<string, *>} [settings]
     * @returns {Promise<string[]>} The tag pages asked.
     */
    async function showEvent(page, name, settings = {}) {
        await page.setViewportSize({ width: 1500, height: 1200 });
        await page.route(/^https?:\/\//, route => route.abort('blockedbyclient'));
        const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
        await page.route(/brucebase\.wdfiles\.com\//, route => route.fulfill({ status: 200, contentType: 'image/png', body: png }));
        await loadUserscriptPage(page, {
            url: BB + name, fixtureFile: fileOf(name), testMode: true,
            settingsOverride: { sa_enable_brucebase: true, sa_bb_detail_pages: true, ...settings },
        });
        const asked = await servePages(page);
        await page.click(`button[data-label="${BB_EVENT_BUTTON}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        return asked;
    }
    const card = page => page.locator('section.mb-sb-card').filter({ has: page.locator(':scope > .mb-sb-card-head', { hasText: /^Tags/ }) });

    test('Madrid: "3" missing as a chip that is not counted, "2" marked; the pills, the findings in words, the Findings filter', async ({ page }) => {
        await showEvent(page, MAD, ON);
        const c = card(page);
        const t = tagsFor(MAD, true);
        await expect(c.locator('.mb-sb-chip.mb-cbx-x')).toHaveCount(t.extra.length);
        await expect(c.locator('.mb-sb-chip.mb-cbx-miss')).toHaveText(['3 missing']);
        await expect(c.locator('.mb-sb-chip.mb-cbx-spur')).toHaveText(['2']);
        // The missing tag's chip is in its family's row, and no tag of the wiki: not counted.
        await expect(c.locator('.mb-sb-chip-row', { hasText: 'On the page' }).locator('.mb-sb-chip.mb-cbx-miss')).toHaveCount(1);
        await expect(c.locator('.mb-sb-chip:not(.mb-cbx-miss)')).toHaveCount(t.own.length + t.extra.length);
        await expect(c.locator(':scope > .mb-sb-card-head .mb-sb-card-count')).toHaveText(String(t.own.length + t.extra.length));
        await expect(c.locator('.mb-cbx-pill-e')).toHaveText('❌ 1 missing');
        await expect(c.locator('.mb-cbx-pill-w')).toHaveText('⚠️ 1 not expected');
        // "As expected" is said only with nothing found.
        await expect(c.locator('.mb-cbx-pill-ok')).toHaveCount(0);
        await expect(c.locator('.mb-cbx-finds .mb-cbx-find-e')).toContainText('3 is expected and missing. 3 songs are in bold on the Setlist tab');
        await expect(c.locator('.mb-cbx-finds .mb-cbx-find-w')).toContainText('2 is not expected. 3 songs are in bold on the Setlist tab, not 2.');
        // Each marked chip says why in its card.
        expect(await c.locator('.mb-sb-chip.mb-cbx-miss').getAttribute('data-mbtt')).toMatch(/Missing: 3[\s\S]*3 songs are in bold/);
        expect(await c.locator('.mb-sb-chip.mb-cbx-spur').getAttribute('data-mbtt')).toMatch(/Not expected: 2/);
        // A pill leaves the marked chips; pressed again, all are back.
        await c.locator('.mb-cbx-pill-e').click();
        await expect(c.locator('.mb-sb-chip')).toHaveCount(2);
        await expect(c.locator('button.mb-cbx-b[data-mb-cbx-k="show"][data-mb-cbx-v="find"]:not(.mb-cbx-pill)')).toHaveAttribute('aria-pressed', 'true');
        await c.locator('.mb-cbx-pill-e').click();
        await expect(c.locator('.mb-sb-chip:not(.mb-cbx-miss)')).toHaveCount(t.own.length + t.extra.length);
    });

    test('Chicago: nothing found, and the card says so; Pittsburgh: "9+" missing', async ({ page }) => {
        await showEvent(page, CHI, ON);
        await expect(card(page).locator('.mb-sb-chip.mb-cbx-x').first()).toBeVisible();
        await expect(card(page).locator('.mb-cbx-pill-ok')).toHaveText(/as expected/);
        await expect(card(page).locator('.mb-cbx-miss, .mb-cbx-spur, .mb-cbx-pills, .mb-cbx-finds')).toHaveCount(0);
        const second = await page.context().newPage();
        second.on('pageerror', e => pageErrors.push(String(e)));
        await showEvent(second, PIT, ON);
        await expect(card(second).locator('.mb-sb-chip.mb-cbx-miss')).toHaveText(['9+ missing']);
        await expect(card(second).locator('.mb-cbx-spur')).toHaveCount(0);
    });

    test('the On stage pages switched off: no missing tag is said (a note says why), the tag that is not expected is still marked', async ({ page }) => {
        const asked = await showEvent(page, MAD, { sa_bb_onstage_tags: false });
        const c = card(page);
        await expect(c.locator('.mb-sb-chip.mb-cbx-spur')).toHaveText(['2']);
        await expect(c.locator('.mb-cbx-miss')).toHaveCount(0);
        await expect(c.locator('.mb-cbx-wait')).toContainText('A missing tag is not looked for');
        await page.evaluate(() => new Promise(r => setTimeout(r, 1200)));
        expect(asked).toEqual([]);
    });

    test('both findings switched off: the card as before, no mark, no note', async ({ page }) => {
        await showEvent(page, MAD, { ...ON, sa_findings_bb_tag_missing: false, sa_findings_bb_tag_spurious: false });
        const c = card(page);
        const t = tagsFor(MAD, true);
        await expect(c.locator('.mb-sb-chip.mb-cbx-x')).toHaveCount(t.extra.length);
        await expect(c.locator('.mb-sb-chip')).toHaveCount(t.own.length + t.extra.length);
        await expect(c.locator('.mb-cbx-miss, .mb-cbx-spur, .mb-cbx-pills, .mb-cbx-finds, .mb-cbx-wait, .mb-cbx-pill-ok')).toHaveCount(0);
    });

    test('an interview whose On stage page the wiki does not have: asked (and its "-1"), then checked', async ({ page }) => {
        const asked = await showEvent(page, INT, ON);
        const c = card(page);
        await expect(c.locator('.mb-sb-chip.mb-cbx-spur')).toHaveText(['nogig']);
        await expect(c.locator('.mb-cbx-pill-w')).toHaveText('⚠️ 1 not expected');
        await expect(c.locator('.mb-cbx-wait')).toHaveCount(0);
        await expect(c.locator('.mb-cbx-miss')).toHaveCount(0);
        expect(asked).toEqual(['onstage:2016-09-06-stone-hill-studio-colts-neck-nj', 'onstage:2016-09-06-stone-hill-studio-colts-neck-nj-1']);
    });
});

test.describe('Brucebase tag check: the preview window, and a title\'s two blanks (bbp-parity batch 3)', () => {
    const HIT = 'recording:1983-06-13-hit-factory-new-york-city-ny';
    const PONY = 'gig:2026-08-28-stone-pony-asbury-park-nj';

    /**
     * A page's preview window content, as the window draws it (the parsed
     * record's two columns), in a detached box of the page.
     *
     * @param {import('@playwright/test').Page} page
     * @param {string} name
     * @returns {Promise<{tags: string, miss: string[], spur: string[], chips: number, finds: string, wait: number, blanks: ?string, title: string}>}
     */
    const windowOf = (page, name) => page.evaluate(([html, url]) => {
        const box = document.createElement('div');
        box.innerHTML = window.__saTest.dpWindowHtml('brucebase.wikidot.com', html, url);
        const sec = Array.from(box.querySelectorAll('details.mb-dp-sec')).find(d => /^Tags \(/.test((d.querySelector('summary h4') || {}).textContent || ''));
        const q = sel => (sec ? Array.from(sec.querySelectorAll(sel), n => n.textContent.trim()) : []);
        const blanks = box.querySelector('.mb-dp-xtitle .mb-bb-title-blanks');
        return {
            tags: sec ? sec.querySelector('summary h4').textContent : '',
            miss: q('a.mb-dp-tag.mb-cbx-miss'), spur: q('a.mb-dp-tag.mb-cbx-spur'), chips: q('a.mb-dp-tag:not(.mb-cbx-miss)').length,
            finds: q('.mb-cbx-finds').join(' '), wait: q('.mb-cbx-wait').length,
            blanks: blanks ? blanks.getAttribute('title') : null,
            title: box.querySelector('.mb-dp-xtitle').textContent,
        };
    }, [fs.readFileSync(fileOf(name), 'utf8'), BB + name]);

    test('the window\'s Tags section: a Monday tagged "wednesday" — "monday" missing and not counted, "wednesday" marked, both in words', async ({ page }) => {
        await loadYear(page);
        const w = await windowOf(page, HIT);
        const own = tagsOf(HIT);
        // No cast tab of the On stage kind and tags far from full: every tag
        // of the show is on its page, so the check is made at once.
        expect(own.join(' ').length).toBeLessThan(450);
        expect(w.tags).toBe(`Tags (${own.length})`);
        expect(w.chips).toBe(own.length);
        expect(w.miss).toEqual(['monday missing']);
        expect(w.spur).toEqual(['wednesday']);
        expect(w.finds).toMatch(/monday is expected and missing\. 1983-06-13 is a Monday\./);
        expect(w.finds).toMatch(/wednesday is not expected\. 1983-06-13 is a Monday\./);
        expect(w.wait).toBe(0);
        expect(w.blanks, 'a title without two blanks has no mark').toBeNull();
    });

    test('the window of a gig with a cast: nothing is called missing before its On stage page is read', async ({ page }) => {
        await loadYear(page, ON);
        const w = await windowOf(page, MAD);
        expect(w.miss).toEqual([]);
        expect(w.spur).toEqual(['2']);
        expect(w.wait).toBe(1);
    });

    test('a title with two blanks: marked on the window\'s title, with the blanks shown; not with the finding off', async ({ page }) => {
        await loadYear(page);
        const raw = (fs.readFileSync(fileOf(PONY), 'utf8').match(/<div id="page-title">\s*([^\n]*?)\s*<\/div>/) || [])[1];
        expect(raw, 'the fixture\'s title has the two blanks').toMatch(/Summer Stage, {2}Asbury Park/);
        const w = await windowOf(page, PONY);
        expect(w.blanks).toContain('Summer Stage,␣␣Asbury Park, NJ');
        expect(w.title).toContain('⚠️');
        const off = await page.context().newPage();
        off.on('pageerror', e => pageErrors.push(String(e)));
        await loadYear(off, { sa_findings_bb_title_spaces: false });
        expect((await windowOf(off, PONY)).blanks).toBeNull();
    });

    test('a title with two blanks: marked after the event page\'s byline', async ({ page }) => {
        await page.setViewportSize({ width: 1500, height: 1200 });
        await page.route(/^https?:\/\//, route => route.abort('blockedbyclient'));
        await loadUserscriptPage(page, {
            url: BB + PONY, fixtureFile: fileOf(PONY), testMode: true,
            settingsOverride: { sa_enable_brucebase: true, sa_bb_detail_pages: true },
        });
        await page.click(`button[data-label="${BB_EVENT_BUTTON}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const mark = page.locator('p.mb-fd-sub .mb-bb-title-blanks');
        await expect(mark).toHaveCount(1);
        expect(await mark.getAttribute('title')).toContain('Summer Stage,␣␣Asbury Park, NJ');
    });
});
