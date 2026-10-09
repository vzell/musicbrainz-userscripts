'use strict';

// The Brucebase start page ('bb-home', brucebase.wikidot.com/ and /home),
// opt-in with the year pages (sa_bb_year_pages on top of
// sa_enable_brucebase). Its one button, "Show all events of all years",
// pages through the year links of the side bar's "Gig Pages" — keyed by path
// (features.pageKeys.pathRe) — and converts each fetched year page with
// applyBbYearToTable() into one table, rendered into an empty one at the top
// of the start page. The fixture (scripts/build-bb-fixtures.py) keeps four
// year links (1968, 1985, 2018, 2026), served from the year fixtures. Also
// pins the year table's sticky Date column and its exemption from the sticky
// page headers' gutter masks. See docs/claude/brucebase.md.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const {
    BB_HOME_BUTTON, bbYearFixture, loadBbHomePage, renderedBbYearRows,
} = require('../support/bbFixture');
const { waitForRenderComplete } = require('../support/browser');

const YEARS = ['1968', '1985', '2018', '2026'];
const HEADING_RE = /<p>(?:\s*<a name="[^"]*"><\/a>\s*(?:<br\s*\/?>)?)?\s*<strong>(?:<a [^>]*>|<span[^>]*>)?\d{4}-\d\d-\d\d/g;
const HEADINGS = Object.fromEntries(YEARS.map((y) => [y, (fs.readFileSync(bbYearFixture(y).file, 'utf8').match(HEADING_RE) || []).length]));
const TOTAL = YEARS.reduce((n, y) => n + HEADINGS[y], 0);
const HOME_HTML = fs.readFileSync(path.join(__dirname, 'bb-home.html'), 'utf8');

/**
 * Collects uncaught page errors, so every test can end by asserting none.
 * @param {import('@playwright/test').Page} page
 * @returns {string[]}
 */
function trackPageErrors(page) {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    return errors;
}

/**
 * Presses the start page's button and waits for the render.
 * @param {import('@playwright/test').Page} page
 */
async function showAll(page) {
    await page.click(`button[data-label="${BB_HOME_BUTTON}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false, timeout: 120000 });
}

test('the start-page fixture links exactly the four fixture years', () => {
    const side = HOME_HTML.slice(HOME_HTML.indexOf('id="side-bar"'), HOME_HTML.indexOf('id="main-content"'));
    expect([...side.matchAll(/<a href="\/(\d{4}|1949-64)">/g)].map((m) => m[1])).toEqual(YEARS);
    expect(TOTAL).toBe(54 + 53 + 100 + 191);
});

test('with the year pages off, the start page is left untouched', async ({ page }) => {
    const errors = trackPageErrors(page);
    const logs = [];
    page.on('console', (msg) => logs.push(msg.text()));
    await loadBbHomePage(page, { years: false });
    await expect.poll(() => logs.some((t) => t.includes('year pages are off (sa_bb_year_pages)')), {
        timeout: 10000, message: 'the gate logs why it stopped',
    }).toBe(true);
    expect(await page.locator('h1.mb-bb-h1').count()).toBe(0);
    expect(await page.locator('button[data-label]').count()).toBe(0);
    await expect(page.locator('#page-title')).toBeVisible();
    expect(errors).toEqual([]);
});

test('with the year pages on, the start page offers the button after "Home"', async ({ page }) => {
    const errors = trackPageErrors(page);
    const { served } = await loadBbHomePage(page);
    await expect(page.locator('h1.mb-bb-h1 > bdi')).toHaveText('Brucebase — Home');
    await expect(page.locator(`h1.mb-bb-h1 button[data-label="${BB_HOME_BUTTON}"]`)).toHaveCount(1);
    expect(await page.locator('#header h1 button[data-label]').count()).toBe(0);
    expect(await page.locator('table.tbl').count()).toBe(0);
    expect(served).toEqual([]);
    expect(errors).toEqual([]);
});

test('the button pages through every linked year into one table', async ({ page }) => {
    const errors = trackPageErrors(page);
    const { served, requests } = await loadBbHomePage(page, {
        // CAA and Relationships back ON: the fixture profile forces both off
        // and would hide a MusicBrainz request.
        settingsOverride: { sa_enable_caa_pics: true, sa_enable_relationships_column: true },
    });
    await showAll(page);

    // One request per linked year, in side-bar order, and nothing else.
    expect(served.map((u) => new URL(u).pathname)).toEqual(YEARS.map((y) => `/${y}`));
    expect(requests.filter((u) => /\/ws\/2\/|musicbrainz\.(org|eu)|coverartarchive\.org|eventartarchive\.org/.test(u))).toEqual([]);

    const rows = await renderedBbYearRows(page);
    expect(rows).toHaveLength(TOTAL);
    YEARS.forEach((y) => expect(rows.filter((r) => r.YYYY === y)).toHaveLength(HEADINGS[y]));
    // Each year converted as on its own page: its tours, its regions, its
    // italic setlists.
    expect(rows.filter((r) => r.Tour === '"Earth" era').length).toBeGreaterThan(5);
    expect(rows.find((r) => r.YYYY === '1985' && r.Venue === 'SYDNEY ENTERTAINMENT CENTRE')).toEqual(expect.objectContaining({
        State: 'NEW SOUTH WALES', Country: 'AUSTRALIA',
    }));
    expect(rows.find((r) => r.Venue === 'FIRST AVENUE')._setlist).toHaveLength(3);

    // One table, at the top of the start page's content, under its <h2>;
    // the start page's own text stays below it.
    const placed = await page.evaluate(() => {
        const content = document.getElementById('page-content');
        const h2 = content.querySelector('h2.mb-bb-list-heading');
        const table = content.querySelector('table.mb-bb-year-table');
        const intro = content.querySelector('h1#toc0');
        const after = (a, b) => !!(a && b && (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING));
        return { tables: document.querySelectorAll('table.tbl').length, h2: h2?.textContent, order: after(h2, table) && after(table, intro) };
    });
    expect(placed).toEqual({ tables: 1, h2: expect.stringContaining('Events — all years'), order: true });
    expect(errors).toEqual([]);
});

test('Date is the first, sticky column, and no gutter mask paints over the side bar', async ({ page }) => {
    // Reported from a real browser (2026-10-09): with Venue sticky, the
    // sticky page headers docked Date and Type as "columns before the sticky
    // one" and gave each a gutter mask — a page-coloured box-shadow shifted
    // left by the table's offset, which on Brucebase is the wiki's side bar —
    // so Type's mask hid all of Date, and the first column's mask hid the
    // side bar under the table. Now Date is the sticky column, and Brucebase
    // tables are left out of the sticky-header column alignment altogether.
    const errors = trackPageErrors(page);
    await loadBbHomePage(page, { settingsOverride: { sa_enable_sticky_page_headers: true } });
    await showAll(page);
    await page.evaluate(() => window.scrollTo(600, 0));
    await expect.poll(() => page.evaluate(() => window.scrollX)).toBeGreaterThan(0);
    // The sticky page headers re-measure in the frames after a scroll; a
    // mask, if any, is there once two have passed.
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const readState = () => page.evaluate(() => {
        const t = document.querySelector('table.tbl');
        const th0 = t.tHead.rows[0].cells[0];
        const td0 = t.tBodies[0].rows[0].cells[0];
        return {
            first: th0.dataset.colName,
            visible: getComputedStyle(th0).display !== 'none' && getComputedStyle(td0).display !== 'none',
            sticky: th0.classList.contains('mb-sticky-col') && td0.classList.contains('mb-sticky-col'),
            stickyCount: t.tBodies[0].rows[0].querySelectorAll(':scope > .mb-sticky-col').length,
            aligned: t.dataset.mbSphColLeft || null,
            shadows: Array.from(t.tBodies[0].rows[0].cells).slice(0, 3).map((c) => getComputedStyle(c).boxShadow),
        };
    });
    const expected = {
        first: 'Date', visible: true, sticky: true, stickyCount: 1, aligned: null, shadows: ['none', 'none', 'none'],
    };
    expect(await readState()).toEqual(expected);
    expect(errors).toEqual([]);
});
