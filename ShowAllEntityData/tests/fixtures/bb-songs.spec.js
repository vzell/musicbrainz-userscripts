'use strict';

// Brucebase song list ('bb-songs', brucebase.wikidot.com/stats:songs), opt-in
// via sa_enable_brucebase. The songs sit in one YUI tabview, a tab per first
// letter plus "Alt." (which repeats the songs whose title starts with a
// parenthesised subtitle); applyBbSongsToTable() turns them into one
// Title / Letter table, one row per song, on the live page and again on Load
// from Disk. A second tabview further down links songs too and must be left
// alone. Fixture: scripts/build-bb-fixtures.py (debug/bb-songs.html, whole
// page). See docs/claude/brucebase.md.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('../support/test');
const {
    BB_FIXTURE, BB_BUTTON, loadBbSongsPage, renderedBbRows, renderedBbHeaders,
} = require('../support/bbFixture');
const { waitForRenderComplete } = require('../support/browser');
const { waitForSortSettled, columnFilterInput } = require('../support/filterSortAssertions');
const { clickToolbarItem } = require('../support/toolbarMenu');

const HEADERS = ['Title', 'Letter'];

// The fixture's own numbers, read from the file rather than written down, so
// a rebuilt fixture cannot leave this spec checking stale ones. The letter
// tabview is everything before the second `yui-navset`; its tab labels and
// panels come in the same order.
const FIXTURE_HTML = fs.readFileSync(BB_FIXTURE, 'utf8');
const NAVSETS = FIXTURE_HTML.split('class="yui-navset');
const LETTER_TABVIEW = NAVSETS[1];
const LETTERS = [...LETTER_TABVIEW.split('<div class="yui-content">')[0].matchAll(/<em>=-\s*(.*?)\s*-=<\/em>/g)].map((m) => m[1]);
const PANELS = LETTER_TABVIEW.split(/<div id="wiki-tab-0-\d+"/).slice(1);
const songsOf = (html) => [...html.matchAll(/<li><a href="(\/song:[^"]+)">/g)].map((m) => m[1]);
const LETTER_SONGS = songsOf(LETTER_TABVIEW);
const DISTINCT_SONGS = new Set(LETTER_SONGS);
const ALT_SONGS = songsOf(PANELS[LETTERS.indexOf('Alt.')]);
const Q_SONGS = songsOf(PANELS[LETTERS.indexOf('Q')]);
const SECOND_TABVIEW_SONGS = songsOf(NAVSETS[2]);

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
 * Presses the list's "Show all songs" button and waits for the render.
 * @param {import('@playwright/test').Page} page
 */
async function showAll(page) {
    await page.click(`button[data-label="${BB_BUTTON}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

test('the fixture still has the shape this spec relies on', () => {
    expect(LETTERS).toHaveLength(28);
    expect(LETTERS[0]).toBe('0-9');
    expect(LETTERS[LETTERS.length - 1]).toBe('Alt.');
    expect(PANELS).toHaveLength(LETTERS.length);
    expect(LETTER_SONGS).toHaveLength(1689);
    expect(DISTINCT_SONGS.size).toBe(1679);
    expect(ALT_SONGS).toHaveLength(10);
    // Every Alt. song is also listed under its own letter.
    expect(ALT_SONGS.filter((h) => LETTER_SONGS.indexOf(h) === LETTER_SONGS.lastIndexOf(h))).toEqual([]);
    // The second tabview links songs too.
    expect(SECOND_TABVIEW_SONGS.length).toBeGreaterThan(0);
});

test.describe('Brucebase opt-in gate', () => {
    test('with the setting off, the page is left untouched', async ({ page }) => {
        const errors = trackPageErrors(page);
        const logs = [];
        page.on('console', (msg) => logs.push(msg.text()));
        await loadBbSongsPage(page, { enabled: false });

        // Positive evidence that the script ran and chose to stop, so the
        // assertions below cannot pass merely because nothing was injected.
        await expect.poll(() => logs.some((t) => t.includes('brucebase.wikidot.com support is off')), {
            timeout: 10000, message: 'the gate logs why it stopped',
        }).toBe(true);

        expect(await page.locator('h1.mb-bb-h1').count()).toBe(0);
        expect(await page.locator('button[data-label]').count()).toBe(0);
        expect(await page.locator('table.tbl').count()).toBe(0);
        expect(await page.locator('div.yui-navset').count()).toBe(2);
        await expect(page.locator('#page-title')).toBeVisible();
        expect(await page.evaluate(() => document.body.classList.contains('mb-sa-host-bb'))).toBe(false);
        expect(await page.evaluate(() => !!document.getElementById('mb-bb-style'))).toBe(false);
        expect(errors).toEqual([]);
    });

    test('with the setting on, the toolbar is offered and nothing else changes yet', async ({ page }) => {
        const errors = trackPageErrors(page);
        await loadBbSongsPage(page);
        await expect(page.locator(`h1.mb-bb-h1 button[data-label="${BB_BUTTON}"]`)).toHaveCount(1);
        await expect(page.locator('h1.mb-bb-h1 > bdi')).toHaveText('Brucebase — Songs');
        // The toolbar goes on the injected <h1>, not on the wiki's own
        // site-name <h1> in the header, and takes the page title's place.
        expect(await page.locator('#header h1 button[data-label]').count()).toBe(0);
        await expect(page.locator('#page-title')).toBeHidden();
        expect(await page.evaluate(() => document.body.classList.contains('mb-sa-host-bb'))).toBe(true);
        // The tabs stay until the button is pressed.
        expect(await page.locator('div.yui-navset').count()).toBe(2);
        expect(await page.locator('table.tbl').count()).toBe(0);
        expect(errors).toEqual([]);
    });
});

test.describe('bb-songs (Brucebase song list)', () => {
    let errors;

    test.beforeEach(async ({ page }) => {
        errors = trackPageErrors(page);
        await loadBbSongsPage(page);
        await showAll(page);
    });

    test.afterEach(() => {
        expect(errors).toEqual([]);
    });

    test('every song of the letter tabs becomes one row of one table', async ({ page }) => {
        expect(await renderedBbHeaders(page)).toEqual(HEADERS);
        const rows = await renderedBbRows(page);
        expect(rows).toHaveLength(DISTINCT_SONGS.size);
        expect(rows.map((r) => new URL(r._href).pathname).sort()).toEqual([...DISTINCT_SONGS].sort());
        expect(await page.locator('table.tbl').count()).toBe(1);

        // The letter tabview is gone; the second one (News / Media /
        // "Released (Not on Springsteen Album)") is left as it was.
        expect(await page.locator('div.yui-navset').count()).toBe(1);
        expect(await page.locator('div.yui-navset ul.yui-nav').textContent()).toContain('Released (Not on Springsteen Album)');
        expect(await page.locator('div.yui-navset a[href^="/song:"]').count()).toBe(SECOND_TABVIEW_SONGS.length);

        // The injected <h2> precedes the table, where the count and filter
        // bar anchor.
        expect(await page.evaluate(() => {
            const h2 = document.querySelector('h2.mb-bb-list-heading');
            const table = document.querySelector('table.mb-bb-table');
            return !!h2 && !!table && !!(h2.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING);
        })).toBe(true);

        // The site has no MusicBrainz CSS; the table look shared with the
        // other hosts (_ensureForeignTableStyle()) applies here too.
        expect(await page.evaluate(() => {
            const cs = getComputedStyle(document.querySelector('table.mb-bb-table tbody td'));
            return `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor} / ${cs.paddingLeft}`;
        })).toBe('1px solid rgb(221, 221, 221) / 6px');
    });

    test('Letter is the tab a song is listed under, and an Alt. repeat keeps its own', async ({ page }) => {
        const rows = await renderedBbRows(page);
        const letterOf = (t) => rows.filter((r) => r.Title === t).map((r) => r.Letter);

        expect(rows.filter((r) => r.Letter === 'Alt.')).toEqual([]);
        expect([...new Set(rows.map((r) => r.Letter))].sort())
            .toEqual(LETTERS.filter((l) => l !== 'Alt.' && songsOf(PANELS[LETTERS.indexOf(l)]).length > 0).sort());
        expect(letterOf('1945')).toEqual(['0-9']);
        expect(letterOf('Adam Raised A Cain')).toEqual(['A']);
        // Subtitle songs: listed under their main title's letter AND under
        // Alt.; one row each, with the main title's letter.
        expect(letterOf("(I Can't Get No) Satisfaction")).toEqual(['S']);
        expect(letterOf('(Your Love Keeps Lifting Me) Higher And Higher')).toEqual(['H']);
        const altRows = rows.filter((r) => ALT_SONGS.includes(new URL(r._href).pathname));
        expect(altRows).toHaveLength(ALT_SONGS.length);
    });

    test('titles are kept as written, and link to the song page in the same tab', async ({ page }) => {
        const rows = await renderedBbRows(page);
        const byTitle = (t) => rows.filter((r) => r.Title === t);

        expect(byTitle('Devils & Dust')).toEqual([expect.objectContaining({
            _href: 'https://brucebase.wikidot.com/song:devils-dust', _target: '',
        })]);
        expect(byTitle('Angel Eyes ( - Little Steven & The Disciples Of Soul - )')).toHaveLength(1);
        expect(byTitle('Jolé Blon')).toHaveLength(1);
        expect(rows.filter((r) => !r._href.startsWith('https://brucebase.wikidot.com/song:'))).toEqual([]);
        expect(rows.filter((r) => r._target !== '')).toEqual([]);
    });

    test('a Letter column filter narrows the rows to one tab', async ({ page }) => {
        const input = columnFilterInput(page, HEADERS.indexOf('Letter'));
        await input.click();
        await input.pressSequentially('Q');
        await expect.poll(async () => [...new Set((await renderedBbRows(page)).map((r) => r.Letter))], {
            timeout: 15000, message: 'only Q remains',
        }).toEqual(['Q']);
        expect(Q_SONGS.length).toBeGreaterThan(0);
        expect((await renderedBbRows(page)).map((r) => new URL(r._href).pathname).sort()).toEqual([...Q_SONGS].sort());
    });

    test('Title sorts as text, digits by their value', async ({ page }) => {
        await clickSort(page, 'Title', '▼');
        const titles = (await renderedBbRows(page)).map((r) => r.Title);
        expect(titles).toHaveLength(DISTINCT_SONGS.size);
        // The engine's text sort: case-insensitive, runs of digits compared
        // as numbers ("96 Tears" after "7 Rooms Of Gloom").
        const cmp = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
        // Descending: every title is >= the next.
        expect(titles.filter((t, i) => i > 0 && cmp(titles[i - 1], t) < 0)).toEqual([]);
        expect(titles.indexOf('96 Tears')).toBeLessThan(titles.indexOf('7 Rooms Of Gloom'));
    });
});

test('bb-songs: nothing is requested from MusicBrainz or the Cover Art Archive', async ({ page }) => {
    // CAA and Relationships are seeded back ON, because the fixture profile
    // forces both off and would hide exactly this.
    const { requests } = await loadBbSongsPage(page, {
        settingsOverride: { sa_enable_caa_pics: true, sa_enable_relationships_column: true },
    });
    await showAll(page);
    expect(await renderedBbRows(page)).toHaveLength(DISTINCT_SONGS.size);
    expect(requests.filter((u) => /\/ws\/2\/|musicbrainz\.(org|eu)|coverartarchive\.org|eventartarchive\.org/.test(u))).toEqual([]);
});

test.describe('Brucebase: Save to Disk → Load from Disk', () => {
    let tmpDir;

    test.beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-bb-disk-'));
    });

    test.afterEach(() => {
        if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('a reopened list renders in place, from tabs converted on the fresh page', async ({ context }) => {
        const source = await context.newPage();
        const sourceErrors = trackPageErrors(source);
        await loadBbSongsPage(source);
        await showAll(source);
        const before = (await renderedBbRows(source)).map((r) => `${r._href} ${r.Letter}`).sort();
        expect(before).toHaveLength(DISTINCT_SONGS.size);

        const downloadPromise = source.waitForEvent('download', { timeout: 60000 });
        await clickToolbarItem(source, '#mb-save-to-disk-btn');
        await source.locator('#sa-sd-save-confirm').waitFor({ state: 'visible', timeout: 15000 });
        await source.click('#sa-sd-save-confirm');
        const saved = path.join(tmpDir, 'bb-songs.json.gz');
        await (await downloadPromise).saveAs(saved);
        expect(sourceErrors).toEqual([]);
        await source.close();

        const page = await context.newPage();
        const errors = trackPageErrors(page);
        const consoleTexts = [];
        page.on('console', (m) => consoleTexts.push(m.text()));
        await loadBbSongsPage(page);
        expect(await page.locator('div.yui-navset').count(), 'a fresh page holds both tabviews again').toBe(2);

        await clickToolbarItem(page, '#mb-load-from-disk-btn');
        await page.locator('input[type="file"][accept*="json"]').setInputFiles(saved);
        const renderBtn = page.locator('#sa-render-no-filter-confirm');
        await renderBtn.waitFor({ state: 'attached', timeout: 15000 });
        await renderBtn.evaluate((el) => el.click());
        await waitForRenderComplete(page, { waitForAutoResize: false });

        expect((await renderedBbRows(page)).map((r) => `${r._href} ${r.Letter}`).sort()).toEqual(before);
        // Converted in place: one table, under the injected <h2>, and the
        // letter tabview gone.
        expect(await page.locator('table.tbl').count()).toBe(1);
        expect(await page.locator('table.mb-bb-table').count()).toBe(1);
        expect(await page.locator('div.yui-navset').count()).toBe(1);
        await expect(page.locator('h2.mb-bb-list-heading')).toHaveCount(1);

        // Loading again onto the page that already shows the table: the
        // converter finds no tabview there, and that is the one case its
        // warning must stay quiet for.
        await clickToolbarItem(page, '#mb-load-from-disk-btn');
        await page.locator('input[type="file"][accept*="json"]').setInputFiles(saved);
        await renderBtn.waitFor({ state: 'attached', timeout: 15000 });
        await renderBtn.evaluate((el) => el.click());
        await waitForRenderComplete(page, { waitForAutoResize: false });
        expect((await renderedBbRows(page)).map((r) => `${r._href} ${r.Letter}`).sort()).toEqual(before);
        expect(await page.locator('table.tbl').count()).toBe(1);
        expect(consoleTexts.filter((t) => t.includes('no song list found'))).toEqual([]);
        expect(errors).toEqual([]);
    });
});

test('_bbParseTabLabel reads the letter out of the tab labels', async ({ page }) => {
    await loadBbSongsPage(page);
    const out = await page.evaluate(() => {
        const f = window.__saTest.bbParseTabLabel;
        return [
            f('=- 0-9 -='),
            f('=- A -='),
            f('  =-  Z  -=  '),
            f('=- Alt. -='),
            f('=-Q-='),
            f('News'),
            f(''),
            f(null),
        ];
    });
    expect(out).toEqual(['0-9', 'A', 'Z', 'Alt.', 'Q', 'News', '', '']);
});

test('the status line sits between the toolbar <h1> and the theme\'s rule, clear of the breadcrumbs', async ({ page }) => {
    // Reported 2026-10-09 (screenshot of stats:songs): the status line sat
    // BELOW the thin rule under the toolbar <h1>, and the breadcrumbs ran
    // into it. The theme (stripped from the fixture, so injected here)
    // underlines every h1 (flannel-ocean) and pulls #breadcrumbs up by
    // 0.5em (base); the status line comes right after the h1. The rule now
    // sits under the status line: h1, status, rule, breadcrumbs.
    const errors = trackPageErrors(page);
    await loadBbSongsPage(page);
    await page.addStyleTag({ content: 'h1 { border-bottom: 1px dotted #AAA; } #breadcrumbs { margin-top: -0.5em; }' });
    await showAll(page);
    const s = await page.evaluate(() => {
        const h1 = document.querySelector('h1.mb-bb-h1');
        const wrap = document.getElementById('mb-status-displays-wrapper');
        const crumbs = document.getElementById('breadcrumbs');
        const box = (el) => el.getBoundingClientRect();
        return {
            follows: wrap.previousElementSibling === h1,
            text: wrap.textContent.includes('Loaded'),
            h1Rule: getComputedStyle(h1).borderBottomStyle,
            wrapRule: getComputedStyle(wrap).borderBottomStyle,
            h1Bottom: box(h1).bottom,
            wrapTop: box(wrap).top,
            wrapBottom: box(wrap).bottom,
            crumbsTop: box(crumbs).top,
        };
    });
    expect(s).toEqual(expect.objectContaining({ follows: true, text: true, h1Rule: 'none', wrapRule: 'dotted' }));
    expect(s.wrapTop).toBeGreaterThanOrEqual(s.h1Bottom - 0.5);
    expect(s.crumbsTop, 'the breadcrumbs start below the rule').toBeGreaterThanOrEqual(s.wrapBottom);
    expect(errors).toEqual([]);
});
