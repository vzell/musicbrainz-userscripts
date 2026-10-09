'use strict';

// Brucebase year pages ('bb-year', brucebase.wikidot.com/2026, …, /1949-64),
// opt-in via sa_bb_year_pages on top of sa_enable_brucebase. Every show,
// session and appearance of the year sits in #page-content as flat blocks
// (heading paragraph, set paragraphs, description, icon row, <hr>);
// applyBbYearToTable() turns them into one table, one row per entry, on the
// live page and again on Load from Disk. Fixtures:
// scripts/build-bb-fixtures.py — 2026 (the request's own page), 1968 (a
// combined era box, 00 days, superscript notes), 1985 (Australian regions,
// descriptions as plain paragraphs, a "Continuation of" box), 2018 (letter
// anchors, setlists in italics). The rules come from
// scripts/probe-bb-year-pages.py over all 63 year pages; see
// docs/claude/brucebase.md, "Year pages — `bb-year`".

const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('../support/test');
const {
    BB_YEAR_BUTTON, bbYearFixture, loadBbYearPage, renderedBbYearRows,
} = require('../support/bbFixture');
const { routeDetailPages } = require('../support/detailFixture');
const { waitForRenderComplete } = require('../support/browser');
const { waitForSortSettled, columnFilterInput } = require('../support/filterSortAssertions');
const { clickToolbarItem } = require('../support/toolbarMenu');

const HEADERS = ['Date', 'Type', 'Venue', 'City', 'State', 'Country', 'Tour',
    'Soundcheck', 'Setlist', 'Set note', 'Notes', 'Media', 'Info wanted',
    'DD', 'MM', 'YYYY', 'Day', 'Month'];

// The fixtures' own numbers, read from the files rather than written down,
// so a rebuilt fixture cannot leave this spec checking stale ones. An entry
// is a paragraph that is one date-led <strong> (its anchor optional).
const HEADING_RE = /<p>(?:\s*<a name="[^"]*"><\/a>\s*(?:<br\s*\/?>)?)?\s*<strong>(?:<a [^>]*>|<span[^>]*>)?\d{4}-\d\d-\d\d/g;
// The 2026 page was saved from the browser, which writes `"` where the
// server's own HTML (the other three) writes `&quot;`; read them alike.
const html = (year) => fs.readFileSync(bbYearFixture(year).file, 'utf8').replace(/&quot;/g, '"');
const headings = (s) => (s.match(HEADING_RE) || []).length;
const H2026 = html('2026');
const H1968 = html('1968');
const between = (s, from, to) => s.slice(s.indexOf(from), to ? s.indexOf(to) : undefined);
const TOUR_2026 = '"Land Of Hope And Dreams - No Kings" tour - U.S.';
const TOUR_2026_ROWS = headings(between(H2026, 'Start of the "Land Of Hope', 'End of the "Land Of Hope'));
const AFTER_2026_TOUR = headings(between(H2026, 'End of the "Land Of Hope'));
const EARTH_1968_ROWS = headings(between(H1968, 'Start of the "Earth" era'));
// Icons after entries, by their src (the file name is in alt too); the
// legend at the top of the page carries one Bootleg icon and no Help Us.
const icons = (s, stem) => (s.match(new RegExp(`src="[^"]*/00${stem}-32\\.png"`, 'g')) || []).length;
const BOOTLEG_2026 = icons(H2026, 'Bootleg') - 1;
const HELP_2026 = icons(H2026, 'Help');

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
 * Presses "Show all events" and waits for the render.
 * @param {import('@playwright/test').Page} page
 */
async function showAll(page) {
    await page.click(`button[data-label="${BB_YEAR_BUTTON}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/**
 * Loads a year fixture, presses the button, and returns the rows.
 * @param {import('@playwright/test').Page} page
 * @param {string} year
 * @returns {Promise<Array<Object<string, *>>>}
 */
async function rowsOf(page, year) {
    await loadBbYearPage(page, year);
    await showAll(page);
    return renderedBbYearRows(page);
}

/**
 * The rows of one date.
 * @param {Array<Object<string, *>>} rows
 * @param {string} date
 * @returns {Array<Object<string, *>>}
 */
const onDate = (rows, date) => rows.filter((r) => r.Date === date);

test('the fixtures still have the shapes this spec relies on', () => {
    expect(headings(H2026)).toBe(54);
    expect(TOUR_2026_ROWS).toBeGreaterThan(5);
    expect(AFTER_2026_TOUR).toBeGreaterThan(0);
    expect(H1968).toContain('End of the "Castiles" era / Start of the "Earth" era');
    expect(EARTH_1968_ROWS).toBeGreaterThan(5);
    expect(html('1985')).toContain('Continuation of the "Born In The U.S.A." tour - U.S.');
    expect(html('2018')).toContain('<a name="180718a">');
    expect(BOOTLEG_2026).toBeGreaterThan(0);
    expect(HELP_2026).toBeGreaterThan(0);
});

test.describe('Brucebase year pages: opt-in gate', () => {
    test('with Brucebase off, the page is left untouched', async ({ page }) => {
        const errors = trackPageErrors(page);
        const logs = [];
        page.on('console', (msg) => logs.push(msg.text()));
        await loadBbYearPage(page, '2026', { enabled: false });
        await expect.poll(() => logs.some((t) => t.includes('brucebase.wikidot.com support is off')), {
            timeout: 10000, message: 'the host gate logs why it stopped',
        }).toBe(true);
        expect(await page.locator('h1.mb-bb-h1').count()).toBe(0);
        expect(await page.locator('table.tbl').count()).toBe(0);
        expect(errors).toEqual([]);
    });

    test('with Brucebase on but the year pages off, the page is left untouched', async ({ page }) => {
        const errors = trackPageErrors(page);
        const logs = [];
        page.on('console', (msg) => logs.push(msg.text()));
        await loadBbYearPage(page, '2026', { years: false });
        // Positive evidence that the script ran and chose to stop here.
        await expect.poll(() => logs.some((t) => t.includes('year pages are off (sa_bb_year_pages)')), {
            timeout: 10000, message: 'the year-page gate logs why it stopped',
        }).toBe(true);
        expect(await page.locator('h1.mb-bb-h1').count()).toBe(0);
        expect(await page.locator('button[data-label]').count()).toBe(0);
        expect(await page.locator('table.tbl').count()).toBe(0);
        await expect(page.locator('#page-title')).toBeVisible();
        expect(await page.evaluate(() => document.body.classList.contains('mb-sa-host-bb'))).toBe(false);
        expect(errors).toEqual([]);
    });

    test('with both on, the toolbar is offered and nothing else changes yet', async ({ page }) => {
        const errors = trackPageErrors(page);
        await loadBbYearPage(page, '2026');
        await expect(page.locator(`h1.mb-bb-h1 button[data-label="${BB_YEAR_BUTTON}"]`)).toHaveCount(1);
        await expect(page.locator('h1.mb-bb-h1 > bdi')).toHaveText('Brucebase — 2026');
        expect(await page.locator('#header h1 button[data-label]').count()).toBe(0);
        await expect(page.locator('#page-title')).toBeHidden();
        expect(await page.locator('table.tbl').count()).toBe(0);
        expect(await page.evaluate(() => document.querySelectorAll('#page-content > p > strong').length))
            .toBeGreaterThanOrEqual(54);
        expect(errors).toEqual([]);
    });
});

test.describe('bb-year 2026', () => {
    let errors;
    let rows;

    test.beforeEach(async ({ page }) => {
        errors = trackPageErrors(page);
        rows = await rowsOf(page, '2026');
    });

    test.afterEach(() => {
        expect(errors).toEqual([]);
    });

    test('every entry becomes one row of one table, in its place on the page', async ({ page }) => {
        const names = await page.evaluate(() => Array.from(document.querySelectorAll('table.tbl thead tr:first-child th'))
            .map((th) => th.dataset.colName || th.textContent.trim()));
        expect(names).toEqual(HEADERS);
        expect(rows).toHaveLength(headings(H2026));
        expect(await page.locator('table.tbl').count()).toBe(1);
        const page_ = await page.evaluate(() => {
            const content = document.getElementById('page-content');
            const table = content.querySelector('table.mb-bb-year-table');
            const h2 = content.querySelector('h2.mb-bb-list-heading');
            const after = (a, b) => !!(a && b && (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING));
            const jump = Array.from(content.querySelectorAll('a')).find((a) => a.textContent === 'most recent');
            const prev = Array.from(content.querySelectorAll('a')).find((a) => a.textContent.includes('Previous'));
            return {
                // No entry heading or tour box is left; the legend, the "Jump
                // to" line and the Previous / Listing / Next line are.
                headingsLeft: Array.from(content.querySelectorAll('p > strong'))
                    .filter((s) => /^\d{4}-\d\d-\d\d/.test(s.textContent.trim())).length,
                tourBoxes: Array.from(content.querySelectorAll('h2')).filter((h) => /^(Start|End) of/.test(h.textContent.trim())).length,
                legend: content.querySelectorAll('img[alt="00Photo-32.png"]').length,
                order: after(jump, h2) && after(h2, table) && after(table, prev),
            };
        });
        expect(page_).toEqual({ headingsLeft: 0, tourBoxes: 0, legend: 1, order: true });
        // The shared foreign-host table look applies.
        expect(await page.evaluate(() => {
            const cs = getComputedStyle(document.querySelector('table.mb-bb-table tbody td'));
            return `${cs.borderTopWidth} ${cs.borderTopStyle}`;
        })).toBe('1px solid');
    });

    test('the heading splits into Date, Type, Venue (linked), City, State and Country', () => {
        expect(onDate(rows, '2026-01-30')).toEqual([expect.objectContaining({
            Type: 'Gig', Venue: 'FIRST AVENUE', City: 'MINNEAPOLIS', State: 'MN', Country: 'USA',
            DD: '30', MM: '1', YYYY: '2026', Day: 'Friday', Month: 'January',
            _venueHref: 'https://brucebase.wikidot.com/gig:2026-01-30-first-avenue-minneapolis-mn',
        })]);
        // A 00 day is "not known": the date keeps year and month, and the
        // splitter leaves DD and Day empty rather than naming a weekday.
        expect(rows[0]).toEqual(expect.objectContaining({
            Date: '2026-01', Type: 'Recording', Venue: 'STONE HILL STUDIO', DD: '', MM: '1', Day: '', Month: 'January',
        }));
        // A sub-venue stays with the venue.
        expect(rows.find((r) => r.Venue === 'DAVID GEFFEN HALL, LINCOLN CENTER')).toEqual(expect.objectContaining({
            City: 'NEW YORK CITY', State: 'NY',
        }));
        // A heading without the " - " still splits.
        expect(rows.find((r) => r.Venue === 'THE STONE PONY, SUMMER STAGE')).toEqual(expect.objectContaining({
            Date: '2026-08-28', City: 'ASBURY PARK', State: 'NJ',
        }));
        expect([...new Set(rows.map((r) => r.Type))].sort()).toEqual(['Gig', 'Interview', 'No gig', 'Recording', 'Rehearsal']);
    });

    test('Soundcheck and Setlist hold one song per row; other prefixed sets are labelled in Setlist', () => {
        const fa = onDate(rows, '2026-01-30')[0];
        expect(fa._soundcheck).toEqual(['STREETS OF MINNEAPOLIS', 'THE GHOST OF TOM JOAD (with Tom Morello)']);
        expect(fa._setlist).toEqual(['STREETS OF MINNEAPOLIS', 'THE GHOST OF TOM JOAD (with Tom Morello)',
            'POWER TO THE PEOPLE (with all performers)']);
        expect(fa._labels).toEqual([]);

        const lod = onDate(rows, '2026-01-17')[0];
        expect(lod._soundcheck).toEqual([]);
        expect(lod._labels).toEqual(['with Willie Nile', 'with Joe Grushecky & The Houserockers']);
        expect(lod._setlist[0]).toBe('with Willie Nile ONE GUITAR (with James Maddock)');
        expect(lod._setlist[1]).toBe('with Joe Grushecky & The Houserockers JOLÉ BLON (with Gary U.S. Bonds, Laurie Anderson, Mark Leimbach, and Joe Grillo)');
        // A medley joined by " - " is one song.
        expect(lod._setlist).toContain('LIGHT OF DAY - HAPPY BIRTHDAY (with all performers)');

        expect(onDate(rows, '2026-03-20')[0]._labels).toEqual(['Without Bruce', 'With Bruce']);
        // A recording's blockquote is its setlist.
        expect(onDate(rows, '2026-01-27')[0]._setlist).toEqual(['STREETS OF MINNEAPOLIS']);
        // Tour premieres keep their bold.
        const opener = onDate(rows, '2026-03-31')[0];
        expect(opener._bold).toEqual(expect.arrayContaining(['WAR', 'PURPLE RAIN', 'CHIMES OF FREEDOM']));
        expect(opener._setlist).toHaveLength(27);
    });

    test('the set note is its own column and leaves the last song alone', () => {
        const r = onDate(rows, '2026-03-19')[0];
        expect(r['Set note']).toBe('Set details may be inaccurate.');
        expect(r._setlist[r._setlist.length - 1]).toBe('ACROSS THE BORDER');
        expect(r._setlist).toHaveLength(13);
    });

    test('Tour carries the tour box onto the entries it covers, and an End clears it', () => {
        expect(rows.filter((r) => r.Tour === TOUR_2026)).toHaveLength(TOUR_2026_ROWS);
        expect(onDate(rows, '2026-03-28')[0].Tour).toBe('');
        expect(onDate(rows, '2026-03-31')[0].Tour).toBe(TOUR_2026);
        expect(rows.slice(-AFTER_2026_TOUR).map((r) => r.Tour)).toEqual(Array(AFTER_2026_TOUR).fill(''));
        expect(new Set(rows.map((r) => r.Tour))).toEqual(new Set(['', TOUR_2026]));
    });

    test('Notes keeps the description, its paragraphs and its links, made absolute', () => {
        const fa = onDate(rows, '2026-01-30')[0];
        expect(fa.Notes).toContain('A Concert of Solidarity & Resistance to Defend Minnesota!');
        expect(fa._notesParas).toBe(1);
        expect(fa._notesLinks).toEqual([
            'https://brucebase.wikidot.com/relation:tom-morello',
            'https://brucebase.wikidot.com/song:streets-of-minneapolis',
            'https://brucebase.wikidot.com/song:the-ghost-of-tom-joad',
            'https://brucebase.wikidot.com/song:power-to-the-people',
        ]);
        // A link to another year page keeps its anchor.
        expect(rows.flatMap((r) => r._notesLinks)).toContain('https://brucebase.wikidot.com/2017#260917');
        // The "Help Us" request text is not part of the description.
        expect(rows.filter((r) => r.Notes.includes('If you have any information'))).toEqual([]);
    });

    test('Media shows the site\'s icons with their labels; Help Us is Info wanted', () => {
        expect(onDate(rows, '2026-03-31')[0]._media)
            .toEqual(['Photo', 'Ticket', 'Setlist', 'Storyteller', 'News', 'Memorabilia', 'Video', 'Bootleg', 'LiveDL']);
        expect(onDate(rows, '2026-03-31')[0]._mediaImgs).toBe(9);
        expect(rows.filter((r) => r._media.includes('Help Us'))).toEqual([]);
        expect(rows.filter((r) => r['Info wanted'] === 'yes')).toHaveLength(HELP_2026);
        expect(onDate(rows, '2026-03-19')[0]['Info wanted']).toBe('yes');
        expect(onDate(rows, '2026-03-31')[0]['Info wanted']).toBe('');
    });

    test('a Media filter narrows to the entries with that icon', async ({ page }) => {
        const input = columnFilterInput(page, HEADERS.indexOf('Media'));
        await input.click();
        await input.pressSequentially('Bootleg');
        await expect.poll(async () => (await renderedBbYearRows(page)).length, {
            timeout: 15000, message: 'only the entries with a Bootleg icon remain',
        }).toBe(BOOTLEG_2026);
        expect((await renderedBbYearRows(page)).filter((r) => !r._media.includes('Bootleg'))).toEqual([]);
    });

    test('a Setlist filter finds a song, and Date sorts', async ({ page }) => {
        const input = columnFilterInput(page, HEADERS.indexOf('Setlist'));
        await input.click();
        await input.pressSequentially('PURPLE RAIN');
        await expect.poll(async () => (await renderedBbYearRows(page)).length, { timeout: 15000 }).toBeLessThan(rows.length);
        const hits = await renderedBbYearRows(page);
        expect(hits.length).toBeGreaterThan(0);
        expect(hits.filter((r) => !r._setlist.some((s) => s.includes('PURPLE RAIN')))).toEqual([]);

        await input.fill('');
        await expect.poll(async () => (await renderedBbYearRows(page)).length, { timeout: 15000 }).toBe(rows.length);
        const btn = page.locator('table.tbl thead th[data-col-name="Date"] .sort-icon-btn', { hasText: '▼' }).first();
        await waitForSortSettled(page, () => btn.click());
        const dates = (await renderedBbYearRows(page)).map((r) => r.Date);
        expect(dates.filter((d, i) => i > 0 && dates[i - 1].localeCompare(d, undefined, { numeric: true }) < 0)).toEqual([]);
    });
});

test.describe('bb-year: the other fixtures', () => {
    test('1968: a combined "End of … / Start of …" box starts the next era', async ({ page }) => {
        const errors = trackPageErrors(page);
        const rows = await rowsOf(page, '1968');
        expect(rows).toHaveLength(headings(H1968));
        expect(rows.filter((r) => r.Tour === '"Earth" era')).toHaveLength(EARTH_1968_ROWS);
        expect(rows.slice(-EARTH_1968_ROWS).map((r) => r.Tour)).toEqual(Array(EARTH_1968_ROWS).fill('"Earth" era'));
        // A superscript-only "No set details known." paragraph is a set note,
        // not the description.
        const cafe = rows.filter((r) => r.Venue === 'CAFÉ WHA?' && r.Date === '1968-01');
        expect(cafe.length).toBeGreaterThan(0);
        expect(cafe[0]['Set note']).toBe('No set details known.');
        expect(cafe[0]._setlist).toEqual([]);
        expect(cafe[0].Notes).not.toContain('No set details known.');
        expect(errors).toEqual([]);
    });

    test('1985: regions, plain-paragraph descriptions, and a year that opens mid-tour', async ({ page }) => {
        const errors = trackPageErrors(page);
        const rows = await rowsOf(page, '1985');
        expect(rows).toHaveLength(headings(html('1985')));
        expect(onDate(rows, '1985-03-21')).toEqual([expect.objectContaining({
            Venue: 'SYDNEY ENTERTAINMENT CENTRE', City: 'SYDNEY', State: 'NEW SOUTH WALES', Country: 'AUSTRALIA',
        })]);
        expect(onDate(rows, '1985-07-03')).toEqual([expect.objectContaining({
            Venue: 'WEMBLEY STADIUM', City: 'LONDON', State: '', Country: 'ENGLAND',
        })]);
        // The description is plain paragraphs here (no .list-pages-box): it
        // still lands in Notes, after the setlist, with its links.
        const first = onDate(rows, '1985-01-04')[0];
        expect(first._setlist[0]).toBe('BORN IN THE U.S.A.');
        expect(first.Notes).toContain('Bruce and the band return to the stage after the Christmas and New Year break.');
        expect(first._notesLinks).toContain('https://brucebase.wikidot.com/song:johnny-bye-bye');
        expect(onDate(rows, '1985-01-05')[0]._soundcheck).toEqual(['BAD MOON RISING']);
        // "Continuation of …" at the top names the tour from the first entry.
        expect(rows[0].Tour).toBe('"Born In The U.S.A." tour - U.S.');
        // Two entries on one date: the cancelled show and its replacement.
        expect(onDate(rows, '1985-03-31').map((r) => r.Type)).toEqual(['No gig', 'Gig']);
        expect(errors).toEqual([]);
    });

    test('2018: letter anchors, and setlists set in italics', async ({ page }) => {
        const errors = trackPageErrors(page);
        const rows = await rowsOf(page, '2018');
        expect(rows).toHaveLength(headings(html('2018')));
        expect(onDate(rows, '2018-07-18').map((r) => r.Venue)).toEqual(['WALTER KERR THEATRE', 'MADISON SQUARE GARDEN']);
        const taping = onDate(rows, '2018-07-17')[0];
        expect(taping._setlist).toHaveLength(17);
        expect(taping._setlist[0]).toBe("GROWIN' UP");
        expect(taping['Set note']).toBe('Setlist may be inaccurate.');
        expect(taping.Notes).not.toContain("GROWIN' UP");
        expect(errors).toEqual([]);
    });
});

test('bb-year: nothing is requested from MusicBrainz or the Cover Art Archive', async ({ page }) => {
    // CAA and Relationships are seeded back ON, because the fixture profile
    // forces both off and would hide exactly this.
    const { requests } = await loadBbYearPage(page, '2026', {
        settingsOverride: { sa_enable_caa_pics: true, sa_enable_relationships_column: true },
    });
    await showAll(page);
    expect(await renderedBbYearRows(page)).toHaveLength(headings(H2026));
    expect(requests.filter((u) => /\/ws\/2\/|musicbrainz\.(org|eu)|coverartarchive\.org|eventartarchive\.org/.test(u))).toEqual([]);
});

test('bb-year: a song link in Notes gets the song preview', async ({ page }) => {
    const errors = trackPageErrors(page);
    await loadBbYearPage(page, '2026', { settingsOverride: { sa_bb_detail_preview: true } });
    const { served } = await routeDetailPages(page, 'bb');
    await showAll(page);
    const link = page.locator('table.tbl tbody td a[href="https://brucebase.wikidot.com/song:power-to-the-people"]').first();
    await page.mouse.move(0, 0);
    await link.scrollIntoViewIfNeeded();
    await page.keyboard.down('Control');
    await link.hover();
    await page.keyboard.up('Control');
    await expect(page.locator('#mb-dp-peek')).toBeVisible();
    await expect.poll(() => served, { timeout: 15000 }).toContain('https://brucebase.wikidot.com/song:power-to-the-people');
    expect(errors).toEqual([]);
});

test.describe('bb-year: Save to Disk → Load from Disk', () => {
    let tmpDir;

    test.beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-bb-year-disk-'));
    });

    test.afterEach(() => {
        if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('a reopened year renders in place, from entries converted on the fresh page', async ({ context }) => {
        const key = (r) => [r.Date, r.Venue, r._setlist.length, r._media.join(','), r.Tour, r['Info wanted']].join('|');
        const source = await context.newPage();
        const sourceErrors = trackPageErrors(source);
        await loadBbYearPage(source, '2026');
        await showAll(source);
        const before = (await renderedBbYearRows(source)).map(key);
        expect(before).toHaveLength(headings(H2026));

        const downloadPromise = source.waitForEvent('download', { timeout: 60000 });
        await clickToolbarItem(source, '#mb-save-to-disk-btn');
        await source.locator('#sa-sd-save-confirm').waitFor({ state: 'visible', timeout: 15000 });
        await source.click('#sa-sd-save-confirm');
        const saved = path.join(tmpDir, 'bb-year.json.gz');
        await (await downloadPromise).saveAs(saved);
        expect(sourceErrors).toEqual([]);
        await source.close();

        const page = await context.newPage();
        const errors = trackPageErrors(page);
        const consoleTexts = [];
        page.on('console', (m) => consoleTexts.push(m.text()));
        await loadBbYearPage(page, '2026');
        const load = async () => {
            await clickToolbarItem(page, '#mb-load-from-disk-btn');
            await page.locator('input[type="file"][accept*="json"]').setInputFiles(saved);
            const renderBtn = page.locator('#sa-render-no-filter-confirm');
            await renderBtn.waitFor({ state: 'attached', timeout: 15000 });
            await renderBtn.evaluate((el) => el.click());
            await waitForRenderComplete(page, { waitForAutoResize: false });
        };
        await load();
        expect((await renderedBbYearRows(page)).map(key)).toEqual(before);
        expect(await page.locator('table.tbl').count()).toBe(1);
        await expect(page.locator('h2.mb-bb-list-heading')).toHaveCount(1);

        // Again, onto the page that already shows the table: the converter
        // finds no entries there, the one case its warning stays quiet for.
        await load();
        expect((await renderedBbYearRows(page)).map(key)).toEqual(before);
        expect(await page.locator('table.tbl').count()).toBe(1);
        expect(consoleTexts.filter((t) => t.includes('applyBbYearToTable: no entries found'))).toEqual([]);
        expect(errors).toEqual([]);
    });
});

test('_bbParseHeading and _bbParseTourHeading', async ({ page }) => {
    await loadBbYearPage(page, '2026');
    const out = await page.evaluate(() => {
        const h = window.__saTest.bbParseHeading;
        const t = window.__saTest.bbParseTourHeading;
        return {
            heading: [
                h('2026-01-30 - FIRST AVENUE, MINNEAPOLIS, MN', '/gig:2026-01-30-first-avenue-minneapolis-mn'),
                h('1954-10-00 - 39½ INSTITUTE STREET, FREEHOLD, NJ', '/nogig:1954-10-00-x'),
                h('1971-00-00 - UNKNOWN LOCATION', '/gig:1971-00-00-x'),
                h('2026-08-28 THE STONE PONY, SUMMER STAGE, ASBURY PARK, NJ', 'https://brucebase.wikidot.com/gig:x'),
                h('1985-03-21 - SYDNEY ENTERTAINMENT CENTRE, SYDNEY, NEW SOUTH WALES, AUSTRALIA', '/gig:x'),
                h('1996-11-17 - ICC BERLIN, SAAL 1, BERLIN, GERMANY', '/interview:x'),
                h('2016-02-02 - AIR CANADA CENTRE, TORONTO, ON', '/rehearsal:x'),
                h('2021-01-00 - VARIOUS LOCATIONS, CO/KS/NE', '/recording:x'),
                h('1980-05-30 - BOSTON GARDEN, BOSTON, MA', ''),
                h('1999-01-01 - SOMEWHERE, CITY, NJ', '/nobruce:x'),
            ],
            tour: [
                t('Start of the "Land Of Hope And Dreams - No Kings" tour - U.S.'),
                t('End of the "Land Of Hope And Dreams - No Kings" tour'),
                t('End of the "Castiles" era / Start of the "Earth" era'),
                t('Continuation of the "Born In The U.S.A." tour - U.S.'),
                t('End Of "The Rising" tour'),
                t('Band personnel'),
            ],
        };
    });
    const H = (date, type, venue, city, state, country) => ({ date, type, venue, city, state, country });
    expect(out.heading).toEqual([
        H('2026-01-30', 'Gig', 'FIRST AVENUE', 'MINNEAPOLIS', 'MN', 'USA'),
        H('1954-10', 'No gig', '39½ INSTITUTE STREET', 'FREEHOLD', 'NJ', 'USA'),
        H('1971', 'Gig', 'UNKNOWN LOCATION', '', '', ''),
        H('2026-08-28', 'Gig', 'THE STONE PONY, SUMMER STAGE', 'ASBURY PARK', 'NJ', 'USA'),
        H('1985-03-21', 'Gig', 'SYDNEY ENTERTAINMENT CENTRE', 'SYDNEY', 'NEW SOUTH WALES', 'AUSTRALIA'),
        H('1996-11-17', 'Interview', 'ICC BERLIN, SAAL 1', 'BERLIN', '', 'GERMANY'),
        H('2016-02-02', 'Rehearsal', 'AIR CANADA CENTRE', 'TORONTO', 'ON', 'CANADA'),
        H('2021-01', 'Recording', 'VARIOUS LOCATIONS', '', 'CO/KS/NE', 'USA'),
        H('1980-05-30', '', 'BOSTON GARDEN', 'BOSTON', 'MA', 'USA'),
        H('1999-01-01', 'No Bruce', 'SOMEWHERE', 'CITY', 'NJ', 'USA'),
    ]);
    expect(out.tour).toEqual([
        { start: true, name: '"Land Of Hope And Dreams - No Kings" tour - U.S.' },
        { start: false, name: '"Land Of Hope And Dreams - No Kings" tour' },
        { start: true, name: '"Earth" era' },
        { start: true, name: '"Born In The U.S.A." tour - U.S.' },
        { start: false, name: '"The Rising" tour' },
        null,
    ]);
});
