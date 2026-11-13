'use strict';

// Brucebase year listing pages ('bb-year-list': /2026-list, …, /1949-64-list;
// org/brucebase.org Phase 9, vzell 2026-11-11). One line per entry of the
// year page: "DATE - VENUE" linking the show on its year page, an optional
// note "(Recording Session)", and tour boxes between the lists. Two buttons:
// this year (the live page, no request) and all years (the nav line's
// listings, features.pageKeys). Fixtures: scripts/build-bb-year-list-
// fixtures.py from the mirror; shapes from scripts/probe-bb-year-list.py.
// See docs/claude/brucebase.md, "Year listing pages".

const fs = require('fs');
const { test, expect } = require('../support/test');
const {
    BB_YEAR_LIST_BUTTON, BB_YEAR_LIST_ALL_BUTTON, bbYearListFixture, loadBbYearListPage,
} = require('../support/bbFixture');
const { waitForRenderComplete } = require('../support/browser');

// Since 2026-11-12 (Phase 14): the four columns from each entry's own page after Tour.
const HEADERS = ['Event', 'Date', 'Venue', 'City', 'State', 'Country', 'Note', 'Tour', 'On stage', 'Content', 'Images', 'Start', 'DD', 'MM', 'YYYY', 'Day', 'Month'];

/**
 * The entries of a listing fixture, read with plain regexes in document
 * order (independent of the converter): each `<li>` show link with its
 * label, href and note, and the tour of the last box before it (a box whose
 * text has "Start of"/"Continuation of" names the tour from its last such
 * part on; "End of" alone clears it).
 *
 * @param {string} key
 * @returns {Array<{heading: string, href: string, note: string, tour: string}>}
 */
function fixtureEntries(key) {
    const html = fs.readFileSync(bbYearListFixture(key).file, 'utf8');
    const body = html.slice(html.indexOf('<div id="page-content">'), html.indexOf('<div class="page-tags">'));
    const dec = (t) => t.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#039;/g, '\'')
        .replace(/\s+/g, ' ').trim();
    const out = [];
    let tour = '';
    const re = /<table[\s\S]*?<\/table>|<li><a href="(\/(?:\d{4}|1949-64)#\d{6}[a-z]?)">([\s\S]*?)<\/a>([\s\S]*?)<\/li>/g;
    let m;
    while ((m = re.exec(body))) {
        if (!m[1]) {
            const text = dec(m[0]);
            const parts = text.split(/(?:\s+\/|,\s*and)\s+(?=(?:Start|End|Continuation) of\b)/i);
            parts.forEach((p) => {
                const t = p.match(/^(Start|End|Continuation) of (?:the )?(.*)$/i);
                if (t) tour = /^end$/i.test(t[1]) ? '' : t[2].trim();
            });
            continue;
        }
        const em = m[3].match(/<em>\(([\s\S]*?)\)<\/em>/);
        out.push({ heading: dec(m[2]), href: m[1], note: em ? dec(em[1]) : '', tour });
    }
    return out;
}

/**
 * The rendered table's visible rows: each column's text, and Event's link.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<Object<string, string>>>}
 */
function renderedRows(page) {
    return page.evaluate(() => {
        const names = Array.from(document.querySelectorAll('table.tbl thead tr:first-child th'))
            .map((th) => th.dataset.colName || th.textContent.trim());
        return Array.from(document.querySelectorAll('table.tbl tbody tr')).filter((tr) => tr.style.display !== 'none').map((tr) => {
            const row = {};
            names.forEach((n, i) => { row[n] = (tr.cells[i]?.textContent || '').replace(/\s+/g, ' ').trim(); });
            const a = tr.cells[names.indexOf('Event')]?.querySelector('a');
            row._href = a ? a.getAttribute('href') : '';
            row._tip = tr.cells[names.indexOf('Event')]?.getAttribute('title') || '';
            return row;
        });
    });
}

/**
 * The requests that would be data, not the page's own load or pictures: any
 * other Brucebase page, or MusicBrainz.
 *
 * @param {string[]} requests
 * @returns {string[]}
 */
function asked(requests) {
    return requests.filter((u) => /musicbrainz\.org/.test(u) ||
        (/^https:\/\/brucebase\.wikidot\.com\//.test(u) && !/\/2026-list$/.test(u)));
}

/**
 * Presses a listing button and waits for the render.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} label
 * @returns {Promise<void>}
 */
async function press(page, label) {
    await page.click(`button[data-label="${label}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

test.describe('bb-year-list (Phase 9)', () => {
    test('the gate: under sa_bb_year_pages; two buttons, no request before a press', async ({ page }) => {
        const { requests } = await loadBbYearListPage(page, '2026');
        await expect(page.locator(`button[data-label="${BB_YEAR_LIST_BUTTON}"]`)).toHaveCount(1);
        await expect(page.locator(`button[data-label="${BB_YEAR_LIST_ALL_BUTTON}"]`)).toHaveCount(1);
        expect(asked(requests)).toEqual([]);
    });

    test('the gate off: no button, the page untouched', async ({ page }) => {
        await loadBbYearListPage(page, '2026', { years: false });
        await expect(page.locator('button[data-label]')).toHaveCount(0);
        await expect(page.locator('#page-content ul > li > a[href^="/2026#"]').first()).toBeVisible();
    });

    test('2026: one row per entry, every column against the fixture, nothing asked', async ({ page }) => {
        const { requests } = await loadBbYearListPage(page, '2026');
        await press(page, BB_YEAR_LIST_BUTTON);
        const want = fixtureEntries('2026');
        const rows = await renderedRows(page);
        const names = await page.locator('table.tbl thead tr:first-child th').evaluateAll((ths) => ths.map((th) => th.dataset.colName || th.textContent.trim()));
        expect(names.filter((n) => HEADERS.includes(n))).toEqual(HEADERS);
        expect(rows).toHaveLength(want.length);
        rows.forEach((r, i) => {
            const w = want[i];
            const [date, ...place] = w.heading.split(' - ');
            expect(r._href, w.heading).toBe(`https://brucebase.wikidot.com${w.href}`);
            expect(r.Date, w.heading).toBe(date.replace(/-00-00$/, '').replace(/-00$/, ''));
            expect(r.Note, w.heading).toBe(w.note);
            expect(r.Tour, w.heading).toBe(w.tour);
            expect(r.Event, w.heading).toBe(w.heading);
            expect(place.join(' - ').toUpperCase()).toContain(r.Venue.toUpperCase());
        });
        expect(rows.some((r) => r.Tour)).toBe(true);
        expect(rows.some((r) => r.Note === 'Recording Session')).toBe(true);
        // The nav line, the h1 and the intro stay; the lists, boxes and banners go.
        await expect(page.locator('#page-content h1')).toContainText('2026 listing by date / location');
        await expect(page.locator('#page-content div.code')).toHaveCount(1);
        await expect(page.locator('#page-content a[href="/1978-list"]')).toHaveCount(1);
        await expect(page.locator('#page-content > ul')).toHaveCount(0);
        await expect(page.locator('#page-content div.image-container')).toHaveCount(0);
        expect(asked(requests)).toEqual([]);
    });

    // Each fixture's own shape, checked on top of the regex read: a value the
    // rows must contain (or, for 1973, its first two Tours).
    const SHAPES = [
        ['1978', 'a whole tour', (rows) => rows.some((r) => r.Tour), true],
        ['1949-64', '00 dates, no tour', (rows) => rows.map((r) => r.Date).includes('1954-10'), true],
        ['1981', '"End of the 1st leg, and Start of the 2nd leg of …"', (rows) => rows.map((r) => r.Tour).includes('2nd leg of "The River" tour - Europe'), true],
        ['2005', '"… era / Start of …" and a stray "]"', (rows) => rows.some((r) => r.Note === 'Recording Session'), true],
        // 1973's first entry comes before its "Continuation of …" box.
        ['1973', '"Continuation of …" at the top', (rows) => [rows[0].Tour, rows[1].Tour].join('|'), '|"Greetings From Asbury Park" tour'],
    ];
    for (const [key, what, shape, shapeWant] of SHAPES) {
        test(`${key}: ${what}`, async ({ page }) => {
            await loadBbYearListPage(page, key);
            await press(page, BB_YEAR_LIST_BUTTON);
            const want = fixtureEntries(key);
            const rows = await renderedRows(page);
            expect(rows).toHaveLength(want.length);
            expect(rows.map((r) => r.Tour)).toEqual(want.map((w) => w.tour));
            expect(rows.map((r) => r.Note)).toEqual(want.map((w) => w.note));
            expect(rows.map((r) => r._href)).toEqual(want.map((w) => `https://brucebase.wikidot.com${w.href}`));
            expect(shape(rows), what).toBe(shapeWant);
        });
    }

    test('a row\'s Event link previews the show (the bbdate reader)', async ({ page }) => {
        await loadBbYearListPage(page, '2026', { settingsOverride: { sa_pop_ext: true } });
        await press(page, BB_YEAR_LIST_BUTTON);
        const r = await page.locator('table.tbl tbody a.mb-bb-show-link').first().evaluate((a) => window.__saTest.popResolve(a));
        expect(r).toContain('bbdate');
    });

    test('all years: the nav line\'s listings in order, one table', async ({ page }) => {
        const { served } = await loadBbYearListPage(page, '2026');
        // Three years only, so the run stays small: the others are cut
        // from the nav line before the press.
        await page.evaluate(() => {
            document.querySelectorAll('#page-content a[href$="-list"]').forEach((a) => {
                if (!/^\/(1978|1981|2026)-list$/.test(a.getAttribute('href'))) a.remove();
            });
        });
        await press(page, BB_YEAR_LIST_ALL_BUTTON);
        // This year's listing is the live page, reused in its place (the
        // engine's pageKeys rule): only the other two are fetched.
        expect(served.map((u) => new URL(u).pathname)).toEqual(['/1978-list', '/1981-list']);
        const rows = await renderedRows(page);
        const want = [...fixtureEntries('1978'), ...fixtureEntries('1981'), ...fixtureEntries('2026')];
        expect(rows).toHaveLength(want.length);
        expect(rows.map((r) => r._href)).toEqual(want.map((w) => `https://brucebase.wikidot.com${w.href}`));
        await expect(page.locator('h2.mb-bb-list-heading')).toContainText('Events — all years');
    });

    test('_bbParseTourHeading: ", and Start of" splits like " / "', async ({ page }) => {
        await loadBbYearListPage(page, '2026');
        const r = await page.evaluate(() => [
            window.__saTest.bbParseTourHeading('End of the 1st leg, and Start of the 2nd leg of "The River" tour - Europe'),
            window.__saTest.bbParseTourHeading('End of the "Castiles" era / Start of the "Earth" era'),
            window.__saTest.bbParseTourHeading('End of the 2nd leg of "Born In The U.S.A." tour'),
        ]);
        expect(r).toEqual([
            { start: true, name: '2nd leg of "The River" tour - Europe' },
            { start: true, name: '"Earth" era' },
            { start: false, name: '2nd leg of "Born In The U.S.A." tour' },
        ]);
    });
});
