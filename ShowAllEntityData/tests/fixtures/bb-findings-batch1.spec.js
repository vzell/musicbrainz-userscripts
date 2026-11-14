'use strict';

// BruceBaseParser's year-page checks as findings on the year table's Event
// cell (org/bbp-parity.org, Track A batch 1; vzell's decisions of 2026-11-14):
//   bb-name-mismatch (❌)  heading ≠ the event page's title
//   bb-name-variant  (⚠️)  the title adds "(Early)", "(Late)", …
//   bb-anchor-date   (⚠️)  the anchor is not the date's DDMMYY
//   bb-anchor-link   (❌)  the page's "Info & Setlist" link names another anchor
//   bb-anchor-postfix(⚠️)  the anchor's letter ≠ the address's
//   bb-title-spaces  (⚠️)  two blanks, or a blank before a comma
// The fixture is 1972's year page with eight of its entries and those
// entries' own pages, all real (scripts/build-bb-findings-batch1-fixtures.py);
// what each fails is what scripts/probe-bb-batch1-findings.py found on the
// whole mirror and BruceParser's reports list. Two checks need no request
// (anchor date, anchor letter); the others wait for ▶ Pages.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { BB_YEAR_BUTTON } = require('../support/bbFixture');
const { waitForRenderComplete } = require('../support/browser');
const { findingRow, clickFinding, findingRowState } = require('../support/findingsMenu');
const { clickToolbarItem } = require('../support/toolbarMenu');

const YEAR_URL = 'https://brucebase.wikidot.com/1972';
const YEAR_FILE = path.join(__dirname, 'bb-year-1972-findings.html');
const EVENT_DIR = path.join(__dirname, 'bb-findings');
const EVENT_RE = /^https:\/\/brucebase\.wikidot\.com\/((?:gig|nogig|recording|rehearsal|interview):[^/?#]+)$/;
const IDS = ['bb-name-mismatch', 'bb-name-variant', 'bb-anchor-date', 'bb-anchor-link', 'bb-anchor-postfix', 'bb-title-spaces'];

// Each entry's failed checks: before its page is read, and after. In the
// page's order (the wiki lists 1972-05-02 before 1972-05-00).
const ROWS = {
    'gig:1972-01-21-captain-s-garter-neptune-nj': { build: [], read: [] },
    'gig:1972-02-12-sunshine-in-asbury-park-nj-early': { build: ['anchor-postfix'], read: ['anchor-postfix', 'name-variant'] },
    'gig:1972-02-12-sunshine-in-asbury-park-nj-late': { build: ['anchor-postfix'], read: ['anchor-postfix', 'name-variant'] },
    'recording:1972-04-00b-mediasound-studios-new-york-city-ny': { build: [], read: [] },
    'gig:1972-05-02-cbs-records-new-york-city-ny': { build: ['anchor-postfix'], read: ['anchor-postfix'] },
    'recording:1972-05-00-mediasound-studios-new-york-city-ny': { build: ['anchor-date', 'anchor-postfix'], read: ['anchor-date', 'anchor-link', 'anchor-postfix'] },
    'gig:1972-06-00-unknown-location-point-pleasant-nj': { build: ['anchor-postfix'], read: ['anchor-postfix', 'name-mismatch'] },
    'gig:1972-12-29-hara-arena-dayton-oh': { build: [], read: ['name-mismatch'] },
};
const KEYS = Object.keys(ROWS);
const countOf = (phase, token) => KEYS.filter(k => ROWS[k][phase].includes(token)).length;

/**
 * Loads the year fixture (or another file at its address) with the
 * userscript, every other request refused.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ settings?: Object<string, *>, file?: string }} [opts]
 * @returns {Promise<void>}
 */
async function loadYear(page, { settings = {}, file = YEAR_FILE } = {}) {
    await page.setViewportSize({ width: 1700, height: 1400 });
    await page.route(/^https?:\/\//, route => route.abort('blockedbyclient'));
    await loadUserscriptPage(page, {
        url: YEAR_URL, fixtureFile: file, testMode: true,
        settingsOverride: { sa_enable_brucebase: true, sa_bb_year_pages: true, sa_foreign_mb_titles: false, sa_foreign_typography: false, ...settings },
    });
}

/**
 * Serves the eight event pages from their fixtures and logs each request.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ change?: function(string, string): string, hold?: function(string): ?Promise<void> }} [opts]
 *   `change(key, html)` rewrites a page; `hold(key)` returns a promise the
 *   answer waits for.
 * @returns {Promise<string[]>} The pages asked, as "gig:…" keys, in order.
 */
async function serveEvents(page, { change = null, hold = null } = {}) {
    const asked = [];
    await page.route(EVENT_RE, async (route) => {
        const key = route.request().url().match(EVENT_RE)[1];
        asked.push(key);
        const file = path.join(EVENT_DIR, `${key.replace(':', '_')}.html`);
        if (!fs.existsSync(file)) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'no such page' });
        const wait = hold ? hold(key) : null;
        if (wait) await wait;
        const html = fs.readFileSync(file, 'utf8');
        return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: change ? change(key, html) : html });
    });
    return asked;
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
 * The live rows' Event cells: the entry ("gig:…"), the failed checks, the
 * stamped finding ids, the paint level, the event-page state.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<{key: string, checks: string[], stamps: string[], level: string, state: string}>>}
 */
function eventCells(page) {
    return page.evaluate(() => Array.from(document.querySelectorAll('table.tbl tbody tr')).filter(tr => tr.style.display !== 'none').map((tr) => {
        // The data sits on a hidden carrier inside the cell (a row loaded
        // from disk has no cell classes, and no <td> attribute survives).
        const d = tr.querySelector('td > span.mb-bb-ev-data');
        const td = d.parentElement;
        const a = td.querySelector('a[href]');
        const st = tr.querySelector('td.mb-bbevp-cell[data-mb-bbevp-col="On stage"]');
        return {
            key: a ? new URL(a.href).pathname.slice(1) : '',
            checks: (d.getAttribute('data-mb-bb-checks') || '').split(' ').filter(Boolean).sort(),
            stamps: (td.dataset.mbFindings || '').split(' ').filter(x => x.startsWith('bb-')).sort(),
            level: td.dataset.mbFinding || '',
            state: st ? st.dataset.mbBbevpState : '',
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
    // Rows are read as they come into view: bring the next cold one in.
    await expect.poll(async () => {
        await page.evaluate(() => {
            const td = document.querySelector('table.tbl tbody td.mb-bbevp-cell[data-mb-bbevp-col="On stage"][data-mb-bbevp-state="cold"]');
            if (td) td.scrollIntoView({ block: 'center' });
        });
        return (await eventCells(page)).map(r => r.state).join(' ');
    }, { timeout: 40000 }).toBe(KEYS.map(() => 'done').join(' '));
    await pagesBtn(page).click();
}

/**
 * Asserts each row's checks and stamps for a phase, and the menus' counts.
 *
 * @param {import('@playwright/test').Page} page
 * @param {'build'|'read'} phase
 * @returns {Promise<void>}
 */
async function expectPhase(page, phase) {
    await expect.poll(async () => (await eventCells(page)).map(r => `${r.key}=${r.stamps.join(',')}`), { timeout: 10000 })
        .toEqual(KEYS.map(k => `${k}=${ROWS[k][phase].map(t => `bb-${t}`).sort().join(',')}`));
    const got = await eventCells(page);
    expect(got.map(r => [r.key, r.checks])).toEqual(KEYS.map(k => [k, ROWS[k][phase]]));
    for (const id of IDS) {
        const level = id === 'bb-name-mismatch' || id === 'bb-anchor-link' ? 'error' : 'warn';
        const n = countOf(phase, id.slice(3));
        // The count is the rows carrying the stamp, on the page.
        expect(got.filter(r => r.stamps.includes(id)).length, id).toBe(n);
        const row = await findingRow(page, level, id);
        if (n) expect(row && row.count, `${id} in the ${level} menu`).toBe(n);
        else expect(row, `${id} has no menu row`).toBeUndefined();
    }
}

test.describe('Brucebase year table: the name and anchor findings (bbp-parity batch 1)', () => {
    test('with the table, before any page is read: the anchor date and the anchor letter, and no request', async ({ page }) => {
        await loadYear(page);
        const asked = await serveEvents(page);
        await show(page);
        await expectPhase(page, 'build');
        await page.evaluate(() => new Promise(r => setTimeout(r, 1200)));
        expect(asked, 'no event page asked').toEqual([]);
        // The cell keeps the heading as the wiki writes it, and the anchor.
        const data = await page.evaluate(() => {
            const d = document.querySelector('td.mb-bb-event-cell a[href*="1972-05-00-mediasound"]').closest('td').querySelector('span.mb-bb-ev-data');
            return { raw: d.getAttribute('data-mb-bb-raw-heading'), anchor: d.getAttribute('data-mb-bb-anchor'), title: d.hasAttribute('data-mb-bb-raw-title'), hidden: getComputedStyle(d).display };
        });
        expect(data).toEqual({ raw: '1972-05-00 - MEDIASOUND STUDIOS, STUDIO C, NEW YORK CITY, NY', anchor: '000472b', title: false, hidden: 'none' });
        // The look: a warning's tint and glyph.
        const look = await page.evaluate(() => {
            const td = document.querySelector('span.mb-bb-ev-data[data-mb-bb-checks~="anchor-postfix"]').parentElement;
            return { level: td.dataset.mbFinding, bg: getComputedStyle(td).backgroundColor, after: getComputedStyle(td, '::after').content };
        });
        expect(look.level).toBe('warn');
        expect(look.bg).not.toMatch(/^rgba?\(255, 255, 255|rgba\(0, 0, 0, 0\)/);
        expect(look.after).toContain('⚠');
        // The filter: exactly the flagged rows (a re-render from the source rows), then all again.
        const n = countOf('build', 'anchor-postfix');
        await clickFinding(page, 'bb-anchor-postfix');
        await expect.poll(() => findingRowState(page, 'bb-anchor-postfix')).toEqual({ visible: n, withFinding: n });
        await clickFinding(page, 'bb-anchor-postfix');
        await expect.poll(async () => (await findingRowState(page, null)).visible).toBe(KEYS.length);
        await clickFinding(page, 'bb-anchor-date');
        await expect.poll(() => findingRowState(page, 'bb-anchor-date')).toEqual({ visible: 1, withFinding: 1 });
        expect((await eventCells(page))[0].key).toBe('recording:1972-05-00-mediasound-studios-new-york-city-ny');
        await clickFinding(page, 'bb-anchor-date');
        await expect.poll(async () => (await findingRowState(page, null)).visible).toBe(KEYS.length);
        expect(asked).toEqual([]);
    });

    test('after ▶ Pages: the name, the variant and the "Info & Setlist" link; counted, filtered, painted, stamped on the source rows', async ({ page }) => {
        await loadYear(page);
        const asked = await serveEvents(page);
        await show(page);
        await readAll(page);
        expect(asked.slice().sort()).toEqual(KEYS.slice().sort());
        await expectPhase(page, 'read');
        // What the cell keeps of the page: the title as written, the link.
        const data = await page.evaluate(() => {
            const d = document.querySelector('td.mb-bb-event-cell a[href*="1972-05-00-mediasound"]').closest('td').querySelector('span.mb-bb-ev-data');
            return { title: d.getAttribute('data-mb-bb-raw-title'), info: d.getAttribute('data-mb-bb-info-href') };
        });
        expect(data).toEqual({ title: '1972-05-00 Mediasound Studios, Studio C, New York City, NY', info: '/1972#000572b' });
        // An error paints red over a warning on the same cell; a variant yellow.
        const look = await page.evaluate(() => {
            const of = (sel) => {
                const td = document.querySelector(sel).closest('td');
                return { level: td.dataset.mbFinding || '', bg: getComputedStyle(td).backgroundColor, after: getComputedStyle(td, '::after').content };
            };
            return {
                mismatch: of('td.mb-bb-event-cell a[href*="1972-12-29-hara-arena"]'),
                variant: of('td.mb-bb-event-cell a[href*="sunshine-in-asbury-park-nj-early"]'),
                clean: of('td.mb-bb-event-cell a[href*="1972-01-21-captain-s-garter"]'),
            };
        });
        expect(look.mismatch.level).toBe('error');
        expect(look.mismatch.after).toContain('❌');
        expect(look.variant.level).toBe('warn');
        expect(look.variant.after).toContain('⚠');
        expect(look.mismatch.bg).not.toBe(look.variant.bg);
        expect(look.clean.level).toBe('');
        expect(look.clean.bg).not.toBe(look.mismatch.bg);
        // The tooltips say what differs.
        const tipOf = part => page.evaluate(sel => document.querySelector(sel).closest('td').getAttribute('title') || '', `td a[href*="${part}"]`);
        expect(await tipOf('1972-12-29-hara-arena')).toContain('Year page "1972-12-29 - DAYTON HARA ARENA, DAYTON, OH", event page "1972-12-29 Hara Arena, Dayton, OH".');
        expect(await tipOf('sunshine-in-asbury-park-nj-early')).toContain('The event page is "1972-02-12 Sunshine In, Asbury Park, NJ (Early)".');
        const medi = await tipOf('1972-05-00-mediasound');
        expect(medi).toContain('This entry\'s anchor is "000472b", its page links "/1972#000572b".');
        expect(medi).toContain('The anchor is "000472b", the address has no letter.');
        // Each late finding filters to its rows and back; the stamps are on
        // the source rows (the filter re-renders from them).
        for (const id of ['bb-name-mismatch', 'bb-name-variant', 'bb-anchor-link']) {
            const n = countOf('read', id.slice(3));
            await clickFinding(page, id);
            await expect.poll(() => findingRowState(page, id), { message: id }).toEqual({ visible: n, withFinding: n });
            await clickFinding(page, id);
            await expect.poll(async () => (await findingRowState(page, null)).visible).toBe(KEYS.length);
        }
        await expectPhase(page, 'read');
    });

    test('a title with two blanks (the event page) and a heading with a blank before a comma (the year page): bb-title-spaces', async ({ page }, testInfo) => {
        // Planted: the mirror's five cases are in other years' event pages,
        // and no year heading has one. The Captain's Garter is the row that
        // fails nothing as it is.
        const planted = testInfo.outputPath('bb-year-1972-planted.html');
        const src = fs.readFileSync(YEAR_FILE, 'utf8');
        const from = '1972-05-02 - CBS RECORDS, NEW YORK CITY, NY';
        const from2 = '1972-12-29 - DAYTON HARA ARENA, DAYTON, OH';
        expect(src.split(from).length, 'the heading to plant a blank before a comma in').toBe(2);
        expect(src.split(from2).length, 'the heading to plant two blanks in').toBe(2);
        fs.writeFileSync(planted, src.replace(from, '1972-05-02 - CBS RECORDS , NEW YORK CITY, NY').replace(from2, '1972-12-29 - DAYTON HARA ARENA,  DAYTON, OH'));
        await loadYear(page, { file: planted });
        const titleFrom = "1972-01-21 Captain's Garter (The), Neptune, NJ";
        const asked = await serveEvents(page, {
            change: (key, html) => {
                if (key !== 'gig:1972-01-21-captain-s-garter-neptune-nj') return html;
                expect(html.includes(titleFrom), 'the title to plant in').toBe(true);
                return html.replace(titleFrom, "1972-01-21 Captain's Garter (The),  Neptune, NJ");
            },
        });
        await show(page);
        // The headings' blanks are seen with the table, no request: a blank
        // before a comma, and two blanks as the wiki writes them (one in the
        // browser's rendering).
        const cbs = async () => (await eventCells(page)).find(r => r.key === 'gig:1972-05-02-cbs-records-new-york-city-ny');
        const hara = async () => (await eventCells(page)).find(r => r.key === 'gig:1972-12-29-hara-arena-dayton-oh');
        await expect.poll(async () => (await cbs()).stamps).toEqual(['bb-anchor-postfix', 'bb-title-spaces']);
        expect((await hara()).stamps).toEqual(['bb-title-spaces']);
        expect((await findingRow(page, 'warn', 'bb-title-spaces')).count).toBe(2);
        expect(asked).toEqual([]);
        await readAll(page);
        // The page's title: two blanks are a blank finding AND another name
        // (blanks are compared as written, as BruceParser does). The CBS
        // row's page is named without the blank, so its name differs too.
        const garter = async () => (await eventCells(page)).find(r => r.key === 'gig:1972-01-21-captain-s-garter-neptune-nj');
        await expect.poll(async () => (await garter()).stamps).toEqual(['bb-name-mismatch', 'bb-title-spaces']);
        await expect.poll(async () => (await cbs()).stamps).toEqual(['bb-anchor-postfix', 'bb-name-mismatch', 'bb-title-spaces']);
        await expect.poll(async () => (await hara()).stamps).toEqual(['bb-name-mismatch', 'bb-title-spaces']);
        await expect.poll(async () => (await findingRow(page, 'warn', 'bb-title-spaces')).count).toBe(3);
        await clickFinding(page, 'bb-title-spaces');
        await expect.poll(() => findingRowState(page, 'bb-title-spaces')).toEqual({ visible: 3, withFinding: 3 });
        // The tooltips mark the blanks, and name where they are.
        const tipOf = part => page.evaluate(sel => document.querySelector(sel).closest('td').getAttribute('title') || '', `td a[href*="${part}"]`);
        expect(await tipOf('captain-s-garter')).toContain('Event page "1972-01-21 Captain\'s Garter (The),␣␣Neptune, NJ"');
        expect(await tipOf('1972-12-29-hara-arena')).toContain('Year page "1972-12-29 - DAYTON HARA ARENA,␣␣DAYTON, OH"');
        expect(await tipOf('1972-05-02-cbs-records')).toContain('Year page "1972-05-02 - CBS RECORDS␣, NEW YORK CITY, NY"');
    });

    test('the title style of other sites changes nothing: the checks read the text as the wiki writes it', async ({ page }) => {
        await loadYear(page, { settings: { sa_foreign_mb_titles: true, sa_foreign_typography: true } });
        await serveEvents(page);
        await show(page);
        // The cell shows the restyled name, and keeps the wiki's.
        const cell = await page.evaluate(() => {
            const td = document.querySelector('td.mb-bb-event-cell a[href*="1972-12-29-hara-arena"]').closest('td');
            return { shown: td.textContent, raw: td.querySelector('span.mb-bb-ev-data').getAttribute('data-mb-bb-raw-heading') };
        });
        expect(cell.raw).toBe('1972-12-29 - DAYTON HARA ARENA, DAYTON, OH');
        expect(cell.shown).not.toBe(cell.raw);
        await expectPhase(page, 'build');
        // A cell with nothing to report keeps its own tooltip, alone.
        const tipOf = part => page.evaluate(sel => document.querySelector(sel).closest('td').getAttribute('title') || '', `td a[href*="${part}"]`);
        expect(await tipOf('1972-12-29-hara-arena')).toBe('As written on the site:\n1972-12-29 - DAYTON HARA ARENA, DAYTON, OH');
        await readAll(page);
        await expectPhase(page, 'read');
        // Its finding is written above that tooltip, not instead of it and
        // not hidden by it (every Event cell has one in this style).
        const tip = await tipOf('1972-12-29-hara-arena');
        expect(tip.split('\n')[0]).toContain('❌ Brucebase event page named differently from the year page: Year page "1972-12-29 - DAYTON HARA ARENA, DAYTON, OH", event page "1972-12-29 Hara Arena, Dayton, OH".');
        expect(tip.endsWith('As written on the site:\n1972-12-29 - DAYTON HARA ARENA, DAYTON, OH')).toBe(true);
        // The rich card's comparisons name their lines: the site's moved down by one.
        const cmp = await page.evaluate(() => JSON.parse(document.querySelector('td a[href*="1972-12-29-hara-arena"]').closest('td').getAttribute('data-mb-tip-cmp')));
        expect(cmp.t).toBe(tip);
        expect(cmp.c.map(c => [c.at, c.la])).toEqual([[0, 'Year page'], [1, 'Site']]);
    });

    test('a tint setting off: stamped and counted, not painted; a finding\'s switch off: gone', async ({ page }) => {
        await loadYear(page, { settings: { sa_findings_tint_bb_anchor: false, sa_findings_tint_bb_name: false, sa_findings_bb_name_variant: false } });
        await serveEvents(page);
        await show(page);
        await readAll(page);
        const n = countOf('read', 'anchor-postfix');
        await expect.poll(async () => (await eventCells(page)).filter(r => r.stamps.includes('bb-name-mismatch')).length).toBe(2);
        const got = await eventCells(page);
        expect(got.filter(r => r.stamps.includes('bb-anchor-postfix')).length).toBe(n);
        expect((await findingRow(page, 'warn', 'bb-anchor-postfix')).count).toBe(n);
        expect((await findingRow(page, 'error', 'bb-name-mismatch')).count).toBe(2);
        expect(got.every(r => r.level === ''), 'nothing painted').toBe(true);
        // The variant's switch: no stamp, no menu row; its check is still on the cell.
        expect(got.some(r => r.stamps.includes('bb-name-variant'))).toBe(false);
        expect(got.filter(r => r.checks.includes('name-variant')).length).toBe(2);
        expect(await findingRow(page, 'warn', 'bb-name-variant')).toBeUndefined();
    });

    test('a finding ticked while pages arrive: a row read later joins the filtered table', async ({ page }) => {
        await loadYear(page);
        let release;
        const gate = new Promise((r) => { release = r; });
        const LATE = 'gig:1972-02-12-sunshine-in-asbury-park-nj-late';
        const asked = await serveEvents(page, { hold: key => (key === LATE ? gate : null) });
        await show(page);
        await pagesBtn(page).click();
        // The early show is read and flagged; the late show's page is on its way.
        await expect.poll(async () => (await findingRow(page, 'warn', 'bb-name-variant') || {}).count, { timeout: 20000 }).toBe(1);
        await expect.poll(() => asked.includes(LATE), { timeout: 20000 }).toBe(true);
        await clickFinding(page, 'bb-name-variant');
        await expect.poll(() => findingRowState(page, 'bb-name-variant')).toEqual({ visible: 1, withFinding: 1 });
        release();
        // Its row is not in the page now: the source row is written and stamped, and the filter brings it in.
        await expect.poll(() => findingRowState(page, 'bb-name-variant'), { timeout: 20000 }).toEqual({ visible: 2, withFinding: 2 });
        await pagesBtn(page).click();
    });

    test('Save to Disk → Load from Disk: the read rows keep their findings, and nothing is asked', async ({ context }) => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-bb-findings-disk-'));
        try {
            const source = await context.newPage();
            await loadYear(source);
            await serveEvents(source);
            await show(source);
            await readAll(source);
            await expectPhase(source, 'read');
            const downloadPromise = source.waitForEvent('download', { timeout: 60000 });
            await clickToolbarItem(source, '#mb-save-to-disk-btn');
            await source.locator('#sa-sd-save-confirm').waitFor({ state: 'visible', timeout: 15000 });
            await source.click('#sa-sd-save-confirm');
            const saved = path.join(tmpDir, 'bb-year.json.gz');
            await (await downloadPromise).saveAs(saved);
            await source.close();

            const page = await context.newPage();
            await loadYear(page);
            const asked = await serveEvents(page);
            await clickToolbarItem(page, '#mb-load-from-disk-btn');
            await page.locator('input[type="file"][accept*="json"]').setInputFiles(saved);
            const renderBtn = page.locator('#sa-render-no-filter-confirm');
            await renderBtn.waitFor({ state: 'attached', timeout: 15000 });
            await renderBtn.evaluate(el => el.click());
            await waitForRenderComplete(page, { waitForAutoResize: false });
            // The checks came with the saved rows; the stamps are made again from them.
            const got = await eventCells(page);
            expect(got.map(r => [r.key, r.checks])).toEqual(KEYS.map(k => [k, ROWS[k].read]));
            await expect.poll(async () => (await eventCells(page)).map(r => r.stamps.join(','))).toEqual(KEYS.map(k => ROWS[k].read.map(t => `bb-${t}`).sort().join(',')));
            expect((await findingRow(page, 'error', 'bb-name-mismatch')).count).toBe(2);
            expect(asked).toEqual([]);
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    test('the rules, pure: the article, the " - ", the variants, 1949-64, a listing row', async ({ page }) => {
        await loadYear(page);
        const out = await page.evaluate(() => {
            const c = window.__saTest.bbEventChecks;
            const row = (heading, anchor, href) => ({ heading, anchor, href: href ? `https://brucebase.wikidot.com/${href}` : '' });
            return {
                // "(The)" per comma part, upper case, the " - " or none.
                article: c(row('2025-10-14 - SPOTIFY HQ, THE ADELPHI, LONDON, ENGLAND', '141025', 'interview:2025-10-14-adelphi-london-england'),
                    { title: '2025-10-14 Spotify HQ, Adelphi (The), London, England', infoHref: '/2025#141025' }),
                noDash: c(row('2026-08-28 THE STONE PONY, SUMMER STAGE, ASBURY PARK, NJ', '280826', 'gig:2026-08-28-stone-pony-asbury-park-nj'),
                    { title: '2026-08-28 Stone Pony (The), Summer Stage, Asbury Park, NJ', infoHref: '/2026#280826' }),
                // The real 2026 title: two blanks.
                stonePony: c(row('2026-08-28 THE STONE PONY, SUMMER STAGE, ASBURY PARK, NJ', '280826', 'gig:2026-08-28-stone-pony-asbury-park-nj'),
                    { title: '2026-08-28 Stone Pony (The), Summer Stage,  Asbury Park, NJ', infoHref: '/2026#280826' }),
                // Two blanks after the date are a blank finding, not another name.
                afterDate: c(row('1966-07-28 - ARTHUR PRYOR BANDSHELL, ASBURY PARK, NJ', '280766', 'gig:1966-07-28-arthur-pryor-bandshell-asbury-park-nj'),
                    { title: '1966-07-28  Arthur Pryor Bandshell, Asbury Park, NJ', infoHref: '/1966#280766' }),
                variants: ['Early', 'Late', 'Afternoon', 'Evening', 'First', 'Second', 'Third', 'Morning', 'Soundcheck', 'Matinee'].map(w =>
                    c(row('1969-05-28 - PANDEMONIUM, WANAMASSA, NJ', '280569', 'gig:1969-05-28-pandemonium-wanamassa-nj-x'),
                        { title: `1969-05-28 Pandemonium, Wanamassa, NJ (${w})`, infoHref: '/1969#280569' }).join(' ')),
                otherDate: c(row('1972-05-01 - X, NY', '010572', 'gig:1972-05-01-x-ny'), { title: '1972-05-02 X, NY', infoHref: '/1972#010572' }),
                // The year page of 1949 to 1964.
                slugIn: c(row('1964-12-25 - 68 SOUTH STREET, FREEHOLD, NJ', '251264', 'nogig:1964-12-25-private-residence-freehold-nj'),
                    { title: '1964-12-25 68 South Street, Freehold, NJ', infoHref: '/1949-64#251264' }),
                slugOut: c(row('1965-01-01 - X, NJ', '010165', 'gig:1965-01-01-x-nj'), { title: '1965-01-01 X, NJ', infoHref: '/1949-64#010165' }),
                otherAnchor: c(row('1964-12-25 - X, NJ', '251264', 'nogig:1964-12-25-x-nj'), { title: '1964-12-25 X, NJ', infoHref: '/1949-64#251164' }),
                // The letter: both the same, none on the address, none on the anchor.
                letterSame: c(row('1972-04-00 - X, NY', '000472b', 'recording:1972-04-00b-x-ny'), null),
                letterNoUrl: c(row('1972-04-00 - X, NY', '000472b', 'recording:1972-04-00-x-ny'), null),
                letterNoAnchor: c(row('1972-04-00 - X, NY', '000472', 'recording:1972-04-00b-x-ny'), null),
                // An entry without an anchor or a page: nothing to compare.
                noAnchor: c(row('1980-01-01 - X, NY', '', ''), null),
                // A listing row (no anchor of its own): the blanks only.
                listing: c({ heading: '1985-01-13 Carolina Coliseum , Columbia, SC', anchor: null, href: 'https://brucebase.wikidot.com/1985#130185' },
                    { title: '1985-01-14 Another Place, Columbia, SC', infoHref: '/1984#999999' }),
                listingClean: c({ heading: '1985-01-13 Carolina Coliseum, Columbia, SC', anchor: null, href: 'https://brucebase.wikidot.com/1985#130185' }, null),
            };
        });
        expect(out.article).toEqual([]);
        expect(out.noDash).toEqual([]);
        expect(out.stonePony).toEqual(['title-spaces', 'name-mismatch']);
        expect(out.afterDate).toEqual(['title-spaces']);
        expect(out.variants).toEqual([...Array(9).fill('name-variant'), 'name-mismatch']);
        expect(out.otherDate).toEqual(['name-mismatch']);
        expect(out.slugIn).toEqual([]);
        expect(out.slugOut).toEqual(['anchor-link']);
        expect(out.otherAnchor).toEqual(['anchor-link']);
        expect(out.letterSame).toEqual([]);
        expect(out.letterNoUrl).toEqual(['anchor-postfix']);
        expect(out.letterNoAnchor).toEqual(['anchor-postfix']);
        expect(out.noAnchor).toEqual([]);
        expect(out.listing).toEqual(['title-spaces']);
        expect(out.listingClean).toEqual([]);
    });

    test('the event page\'s reader: the title as written and the "Info & Setlist" link', async ({ page }) => {
        await loadYear(page);
        const read = await page.evaluate(({ html, spaced }) => {
            const p = h => window.__saTest.dpParse('brucebase.wikidot.com', h, 'https://brucebase.wikidot.com/recording:1972-05-00-mediasound-studios-new-york-city-ny');
            const a = p(html);
            const b = p(spaced);
            return { title: a.bbRawTitle, info: a.bbInfoHref, shown: a.title, spacedRaw: b.bbRawTitle, spacedShown: b.title };
        }, (() => {
            const html = fs.readFileSync(path.join(EVENT_DIR, 'recording_1972-05-00-mediasound-studios-new-york-city-ny.html'), 'utf8');
            const from = '1972-05-00 Mediasound Studios, Studio C, New York City, NY\n';
            expect(html.split(from).length, 'the title to plant in, in #page-title').toBe(2);
            return { html, spaced: html.replace(from, '1972-05-00 Mediasound Studios, Studio C,  New York City, NY\n') };
        })());
        expect(read.title).toBe('1972-05-00 Mediasound Studios, Studio C, New York City, NY');
        expect(read.info).toBe('/1972#000572b');
        // The window's title has one blank; the raw one keeps both.
        expect(read.spacedRaw).toBe('1972-05-00 Mediasound Studios, Studio C,  New York City, NY');
        expect(read.spacedShown).toBe(read.shown);
    });
});
