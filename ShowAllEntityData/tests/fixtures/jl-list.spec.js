'use strict';

// jungleland.it bootleg artwork list ('jl-list'), opt-in via
// sa_enable_jungleland. The page is one static list of links, one <p> each,
// under one anchor heading per year plus "others"; applyJlListToTable()
// turns them into a Title / Date / Year table on the live page, and again
// on Load from Disk. Only list.htm opened as its own tab is converted: on the
// site it is normally the narrow left frame of the artwork.htm frameset.
// Fixture: scripts/build-jl-fixtures.py (debug/jungleland.it.html, sections
// 1966, 1975, 2026 and others). See docs/claude/jungleland.md.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('../support/test');
const {
    JL_FIXTURE, JL_BUTTON, loadJlListPage, loadJlFramesetPage, renderedJlRows, renderedJlHeaders,
} = require('../support/jlFixture');
const { waitForRenderComplete } = require('../support/browser');
const { waitForSortSettled, columnFilterInput } = require('../support/filterSortAssertions');
const { clickToolbarItem } = require('../support/toolbarMenu');

// DD … Month come from the MusicBrainz `dateParts` extractor, fed the ISO
// Date; extracted columns are appended after the converter's own three.
const HEADERS = ['Title', 'Date', 'Year', 'Version', 'DD', 'MM', 'YYYY', 'Day', 'Month'];

// The fixture's own entry count, read from the file rather than written down,
// so a rebuilt fixture cannot leave this spec checking a stale number.
const FIXTURE_ENTRIES = (fs.readFileSync(JL_FIXTURE, 'utf8').match(/<a target="inferioredx1" href=/g) || []).length;
// Entries whose link is a re-issue page ("…_N.htm"), read the same way.
const FIXTURE_SUFFIXED = (fs.readFileSync(JL_FIXTURE, 'utf8').match(/<a target="inferioredx1" href="[^"]*_\d+\.htm"/g) || []).length;

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
 * Clicks a column header's ▲ (ascending) or ▼ (descending) sort icon.
 * @param {import('@playwright/test').Page} page
 * @param {string} colName
 * @param {string} glyph
 */
async function clickSort(page, colName, glyph) {
    const btn = page.locator(`table.tbl thead th[data-col-name="${colName}"] .sort-icon-btn`, { hasText: glyph }).first();
    await waitForSortSettled(page, () => btn.click());
}

/**
 * Presses the list's "Show all" button and waits for the render.
 * @param {import('@playwright/test').Page} page
 */
async function showAll(page) {
    await page.click(`button[data-label="${JL_BUTTON}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

test.describe('jungleland.it opt-in and frame gates', () => {
    test('with the setting off, the page is left untouched', async ({ page }) => {
        const errors = trackPageErrors(page);
        const logs = [];
        page.on('console', (msg) => logs.push(msg.text()));
        await loadJlListPage(page, { enabled: false });

        // Positive evidence that the script ran and chose to stop, so the
        // assertions below cannot pass merely because nothing was injected.
        await expect.poll(() => logs.some((t) => t.includes('jungleland.it support is off')), {
            timeout: 10000, message: 'the gate logs why it stopped',
        }).toBe(true);

        expect(await page.locator('h1').count()).toBe(0);
        expect(await page.locator('button[data-label]').count()).toBe(0);
        expect(await page.locator('table.tbl').count()).toBe(0);
        expect(await page.locator('a[target="inferioredx1"]').count()).toBe(FIXTURE_ENTRIES);
        expect(await page.evaluate(() => document.body.classList.contains('mb-sa-host-jl'))).toBe(false);
        expect(await page.evaluate(() => !!document.getElementById('mb-jl-style'))).toBe(false);
        expect(errors).toEqual([]);
    });

    test('with the setting on, the toolbar is offered and nothing else changes yet', async ({ page }) => {
        const errors = trackPageErrors(page);
        await loadJlListPage(page);
        await expect(page.locator(`h1.mb-jl-h1 button[data-label="${JL_BUTTON}"]`)).toHaveCount(1);
        await expect(page.locator('h1.mb-jl-h1 > bdi')).toHaveText('jungleland.it — Bootleg artwork list');
        expect(await page.evaluate(() => document.body.classList.contains('mb-sa-host-jl'))).toBe(true);
        // The list stays until the button is pressed.
        expect(await page.locator('a[target="inferioredx1"]').count()).toBe(FIXTURE_ENTRIES);
        expect(await page.locator('table.tbl').count()).toBe(0);
        await expect(page.locator('form[name="theForm"]')).toBeVisible();
        expect(errors).toEqual([]);
    });

    test('inside the artwork.htm frameset the list frame is left untouched', async ({ page }) => {
        const errors = trackPageErrors(page);
        const logs = [];
        page.on('console', (msg) => logs.push(msg.text()));
        const frame = await loadJlFramesetPage(page);

        await expect.poll(() => logs.some((t) => t.includes('inside the artwork.htm frameset')), {
            timeout: 10000, message: 'the frame gate logs why it stopped',
        }).toBe(true);
        expect(await frame.locator('h1').count()).toBe(0);
        expect(await frame.locator('button[data-label]').count()).toBe(0);
        expect(await frame.locator('table.tbl').count()).toBe(0);
        expect(await frame.locator('a[target="inferioredx1"]').count()).toBe(FIXTURE_ENTRIES);
        expect(await frame.evaluate(() => document.body.classList.contains('mb-sa-host-jl'))).toBe(false);
        expect(errors).toEqual([]);
    });
});

test.describe('jl-list (jungleland.it bootleg artwork list)', () => {
    let errors;

    test.beforeEach(async ({ page }) => {
        errors = trackPageErrors(page);
        await loadJlListPage(page);
        await showAll(page);
    });

    test.afterEach(() => {
        expect(errors).toEqual([]);
    });

    test('every entry becomes one row of one table with the expected columns', async ({ page }) => {
        expect(FIXTURE_ENTRIES).toBe(677);
        expect(await renderedJlHeaders(page)).toEqual(HEADERS);
        expect(await renderedJlRows(page)).toHaveLength(FIXTURE_ENTRIES);
        expect(await page.locator('table.tbl').count()).toBe(1);

        // No entry and no year heading is left behind; the injected <h2>
        // precedes the table, where the count and filter bar anchor.
        expect(await page.locator('a[target="inferioredx1"]').count()).toBe(0);
        expect(await page.locator('a[name="1975"], a[name="others"]').count()).toBe(0);
        expect(await page.evaluate(() => {
            const h2 = document.querySelector('h2.mb-jl-list-heading');
            const table = document.querySelector('table.mb-jl-table');
            return !!h2 && !!table && !!(h2.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING);
        })).toBe(true);

        // The jump menu's anchors are gone: hidden, not removed.
        await expect(page.locator('form[name="theForm"]')).toHaveCount(1);
        await expect(page.locator('form[name="theForm"]')).toBeHidden();

        // The site has no MusicBrainz CSS; the table look shared with
        // springsteenlyrics.com (_ensureForeignTableStyle()) applies here too.
        expect(await page.evaluate(() => {
            const cs = getComputedStyle(document.querySelector('table.mb-jl-table tbody td'));
            return `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor} / ${cs.paddingLeft}`;
        })).toBe('1px solid rgb(221, 221, 221) / 6px');
    });

    test('the date is cut off the title, and Year comes from the date', async ({ page }) => {
        const rows = await renderedJlRows(page);
        const byTitle = (t) => rows.filter((r) => r.Title === t);

        expect(byTitle('The Castiles 1966-1967')).toEqual([expect.objectContaining({
            Date: '1966-01-01', Year: '1966',
            _href: 'https://www.jungleland.it/html/19660101.htm', _target: '_blank',
        })]);
        // A re-issue keeps the site's own "(Version N)" in its title.
        expect(byTitle('You can trust your Car to the Man who wears the Star (Version 2)')).toEqual([expect.objectContaining({
            Date: '1975-02-05', Year: '1975', _href: 'https://www.jungleland.it/html/19750205_2.htm',
        })]);
        // Filed under "others", but dated — after a space — so it gets its
        // own Year rather than none.
        expect(byTitle('Magic In The Köln Night')).toEqual([expect.objectContaining({ Date: '2007-12-13', Year: '2007' })]);
        // An undated "others" entry, whose text starts with a space.
        expect(byTitle('Berlin, DVD - Disc 3 - betterDay Berlin productions')).toEqual([expect.objectContaining({ Date: '', Year: '' })]);

        // Every dated row's title is free of its date; every year section's
        // row is dated.
        expect(rows.filter((r) => /\(\d{4}-\d{2}-\d{2}\)\s*$/.test(r.Title))).toEqual([]);
        expect(rows.filter((r) => r.Date).length).toBe(192);
        expect(rows.filter((r) => r.Date && r.Year !== r.Date.slice(0, 4))).toEqual([]);
        expect(rows.filter((r) => r._target !== '_blank')).toEqual([]);
    });

    test('Date is split into DD / MM / YYYY / Day / Month, empty when undated', async ({ page }) => {
        const rows = await renderedJlRows(page);
        const parts = (r) => ({ DD: r.DD, MM: r.MM, YYYY: r.YYYY, Day: r.Day, Month: r.Month });
        const byTitle = (t) => rows.filter((r) => r.Title === t).map(parts);

        expect(byTitle('The Castiles 1966-1967')).toEqual([
            { DD: '1', MM: '1', YYYY: '1966', Day: 'Saturday', Month: 'January' }]);
        expect(byTitle('You can trust your Car to the Man who wears the Star (Version 2)')).toEqual([
            { DD: '5', MM: '2', YYYY: '1975', Day: 'Wednesday', Month: 'February' }]);
        // Dated, though filed under "others".
        expect(byTitle('Magic In The Köln Night')).toEqual([
            { DD: '13', MM: '12', YYYY: '2007', Day: 'Thursday', Month: 'December' }]);
        expect(byTitle('Berlin, DVD - Disc 3 - betterDay Berlin productions')).toEqual([
            { DD: '', MM: '', YYYY: '', Day: '', Month: '' }]);

        // Every dated row is split, and agrees with its Date; no undated row is.
        const pad = (s) => s.padStart(2, '0');
        expect(rows.filter((r) => r.Date && r.Date !== `${r.YYYY}-${pad(r.MM)}-${pad(r.DD)}`)).toEqual([]);
        expect(rows.filter((r) => !r.Date && (r.DD || r.MM || r.YYYY || r.Day || r.Month))).toEqual([]);
    });

    test('Version comes from the link: a _N page is N, any other page 1', async ({ page }) => {
        const rows = await renderedJlRows(page);
        const byHref = (h) => rows.filter((r) => r._href.endsWith(`/html/${h}`)).map((r) => r.Version);

        expect(byHref('19660101.htm')).toEqual(['1']);
        expect(byHref('19750205_2.htm')).toEqual(['2']);
        // The site cut this title off before its "(Version 2)"; the link
        // still says which issue it is.
        expect(rows.filter((r) => r._href.endsWith('/html/19750813_2.htm'))).toEqual([expect.objectContaining({
            Title: '1975-08-13 Bottom Line, New York, NY, USA - Late Show (Original Master Series -', Version: '2',
        })]);
        // A named "others" page is versioned the same way.
        expect(rows.filter((r) => r.Title === 'Magic In The Köln Night').map((r) => r.Version)).toEqual(['1']);
        expect(rows.filter((r) => r.Title === '2009 TV Compilation DVD (Version 3)').map((r) => r.Version)).toEqual(['3']);

        // Every row has one, and the _N count matches the fixture's own links.
        expect(rows.filter((r) => !/^\d+$/.test(r.Version))).toEqual([]);
        expect(rows.filter((r) => r.Version !== '1')).toHaveLength(FIXTURE_SUFFIXED);
        // Wherever the title still carries "(Version N)", it agrees.
        expect(rows.filter((r) => {
            const m = r.Title.match(/\(Version (\d+)\)$/);
            return m && m[1] !== r.Version;
        })).toEqual([]);
    });

    test('DD sorts as a number, not as text', async ({ page }) => {
        await clickSort(page, 'DD', '▲');
        const days = (await renderedJlRows(page)).map((r) => r.DD).filter(Boolean).map(Number);
        expect(days).toHaveLength(192);
        // A text sort would put 10 before 2.
        expect(days).toEqual([...days].sort((a, b) => a - b));
    });

    test('a Year column filter narrows the rows to one year', async ({ page }) => {
        const input = columnFilterInput(page, HEADERS.indexOf('Year'));
        await input.click();
        await input.pressSequentially('1975');
        await expect.poll(async () => [...new Set((await renderedJlRows(page)).map((r) => r.Year))], {
            timeout: 15000, message: 'only 1975 remains',
        }).toEqual(['1975']);
        expect(await renderedJlRows(page)).toHaveLength(183);
    });

    test('Date sorts chronologically', async ({ page }) => {
        await clickSort(page, 'Date', '▼');
        const dates = (await renderedJlRows(page)).map((r) => r.Date).filter(Boolean);
        expect(dates).toHaveLength(192);
        expect(dates[0]).toBe('2026-04-16');
        expect(dates).toEqual([...dates].sort().reverse());
    });
});

test('jl-list: nothing is requested from MusicBrainz or the Cover Art Archive', async ({ page }) => {
    // CAA and Relationships are seeded back ON, because the fixture profile
    // forces both off and would hide exactly this.
    const { requests } = await loadJlListPage(page, {
        settingsOverride: { sa_enable_caa_pics: true, sa_enable_relationships_column: true },
    });
    await showAll(page);
    expect(await renderedJlRows(page)).toHaveLength(FIXTURE_ENTRIES);
    expect(requests.filter((u) => /\/ws\/2\/|musicbrainz\.(org|eu)|coverartarchive\.org|eventartarchive\.org/.test(u))).toEqual([]);
});

test.describe('jungleland.it: Save to Disk → Load from Disk', () => {
    let tmpDir;

    test.beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-jl-disk-'));
    });

    test.afterEach(() => {
        if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('a reopened list renders in place, from links converted on the fresh page', async ({ context }) => {
        const source = await context.newPage();
        const sourceErrors = trackPageErrors(source);
        await loadJlListPage(source);
        await showAll(source);
        const before = (await renderedJlRows(source)).map((r) => r._href).sort();
        expect(before).toHaveLength(FIXTURE_ENTRIES);

        const downloadPromise = source.waitForEvent('download', { timeout: 60000 });
        await clickToolbarItem(source, '#mb-save-to-disk-btn');
        await source.locator('#sa-sd-save-confirm').waitFor({ state: 'visible', timeout: 15000 });
        await source.click('#sa-sd-save-confirm');
        const saved = path.join(tmpDir, 'jl-list.json.gz');
        await (await downloadPromise).saveAs(saved);
        expect(sourceErrors).toEqual([]);
        await source.close();

        const page = await context.newPage();
        const errors = trackPageErrors(page);
        const consoleTexts = [];
        page.on('console', (m) => consoleTexts.push(m.text()));
        await loadJlListPage(page);
        expect(await page.locator('a[target="inferioredx1"]').count(), 'a fresh page holds the plain list again')
            .toBe(FIXTURE_ENTRIES);

        await clickToolbarItem(page, '#mb-load-from-disk-btn');
        await page.locator('input[type="file"][accept*="json"]').setInputFiles(saved);
        const renderBtn = page.locator('#sa-render-no-filter-confirm');
        await renderBtn.waitFor({ state: 'attached', timeout: 15000 });
        await renderBtn.evaluate((el) => el.click());
        await waitForRenderComplete(page, { waitForAutoResize: false });

        expect((await renderedJlRows(page)).map((r) => r._href).sort()).toEqual(before);
        // Converted in place: one table, under the injected <h2>, and no
        // entry of the plain list left over.
        expect(await page.locator('table.tbl').count()).toBe(1);
        expect(await page.locator('table.mb-jl-table').count()).toBe(1);
        expect(await page.locator('a[target="inferioredx1"]').count()).toBe(0);
        await expect(page.locator('h2.mb-jl-list-heading')).toHaveCount(1);

        // Loading again onto the page that already shows the table: the
        // converter finds no entries there, and that is the one case its
        // warning must stay quiet for.
        await clickToolbarItem(page, '#mb-load-from-disk-btn');
        await page.locator('input[type="file"][accept*="json"]').setInputFiles(saved);
        await renderBtn.waitFor({ state: 'attached', timeout: 15000 });
        await renderBtn.evaluate((el) => el.click());
        await waitForRenderComplete(page, { waitForAutoResize: false });
        expect((await renderedJlRows(page)).map((r) => r._href).sort()).toEqual(before);
        expect(await page.locator('table.tbl').count()).toBe(1);
        expect(consoleTexts.filter((t) => t.includes('no list entries found'))).toEqual([]);
        expect(errors).toEqual([]);
    });
});

test('_jlParseItem handles the title shapes the site writes', async ({ page }) => {
    await loadJlListPage(page);
    const out = await page.evaluate(() => {
        const f = window.__saTest.jlParseItem;
        return [
            f('The way it was(1975-08-15)', '1975'),
            f('Magic In The Köln Night (2007-12-13)', 'others'),
            f('  Live at the Bottom Line (Version 2)(1975-08-15)  ', '1975'),
            f('World Rising Disc 3+4', 'others'),
            f('Undated in a year section', '1980'),
            f('(1975-08-15)', '1975'),
            f('1978-09-19  30th Anniversary Rendition', 'others'),
        ];
    });
    expect(out).toEqual([
        { title: 'The way it was', date: '1975-08-15', year: '1975' },
        { title: 'Magic In The Köln Night', date: '2007-12-13', year: '2007' },
        { title: 'Live at the Bottom Line (Version 2)', date: '1975-08-15', year: '1975' },
        { title: 'World Rising Disc 3+4', date: '', year: '' },
        { title: 'Undated in a year section', date: '', year: '1980' },
        { title: '(1975-08-15)', date: '1975-08-15', year: '1975' },
        // A date at the START is part of the title, not the entry's date.
        { title: '1978-09-19 30th Anniversary Rendition', date: '', year: '' },
    ]);
});

test('_jlVersionFromHref reads the issue number from the link alone', async ({ page }) => {
    await loadJlListPage(page);
    const out = await page.evaluate(() => {
        const f = window.__saTest.jlVersionFromHref;
        return [
            f('19750815.htm'),
            f('19750815_2.htm'),
            f('19700113_17.htm'),
            f('/html/19750815_3.htm'),
            f('Magic In The Köln Night (2007-12-13).htm'),
            f('2009 TV Compilation DVD_3.htm'),
            // Underscore digits that are part of the name, not a suffix.
            f('barcelona 19_20 july 2008.htm'),
            f('19750815_2.html'),
            f(''),
            f(null),
        ];
    });
    expect(out).toEqual(['1', '2', '17', '3', '1', '3', '1', '', '', '']);
});
