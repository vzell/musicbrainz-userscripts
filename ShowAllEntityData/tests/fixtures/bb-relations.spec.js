'use strict';

// Brucebase Relations ('bb-relations', brucebase.wikidot.com/stats:relations),
// under sa_enable_brucebase. Everyone Bruce Springsteen shared a stage or a
// studio with, in a YUI tabview like the song list: tabs "=- 0-9 -=",
// "=- A -=" … "=- Z -=", "=- & -=", each a two-column table of "Persons" and
// "Bands", every entry a /relation: link named in sort form ("Adams, Bryan").
// applyBbRelationsToTable() turns them into one Name / Sort name / Type /
// Letter table. Fixture: scripts/build-bb-fixtures.py (the page as the
// server sends it, from scripts/probe-bb-recent-changes.py). See
// docs/claude/brucebase.md, "Relations".

const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('../support/test');
const {
    BB_RELATIONS_FIXTURE, BB_RELATIONS_BUTTON, loadBbRelationsPage, renderedBbHeaders,
} = require('../support/bbFixture');
const { waitForRenderComplete } = require('../support/browser');
const { columnFilterInput } = require('../support/filterSortAssertions');
const { clickToolbarItem } = require('../support/toolbarMenu');

const HEADERS = ['Name', 'Sort name', 'Type', 'Letter'];

// The fixture's own entries, read with plain regexes, independent of the
// converter: per tab, per group, the links in page order.
const HTML = fs.readFileSync(BB_RELATIONS_FIXTURE, 'utf8');
const TABVIEW = HTML.slice(HTML.indexOf('class="yui-navset'));
const LETTERS = [...TABVIEW.split('<div class="yui-content">')[0].matchAll(/<em>=-\s*(.*?)\s*-=<\/em>/g)]
    .map((m) => m[1].replace(/&amp;/g, '&'));
const PANELS = TABVIEW.split(/<div id="wiki-tab-0-\d+"/).slice(1);
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#039;|&#39;/g, "'").replace(/&quot;/g, '"');
const ENTRIES = PANELS.flatMap((panel, i) => panel.split(/<p><strong>/).slice(1).flatMap((group) => {
    const g = group.slice(0, group.indexOf('</strong>'));
    const type = g === 'Persons' ? 'Person' : g === 'Bands' ? 'Band' : g;
    return [...group.matchAll(/<li><a href="(\/relation:[^"]+)">(.*?)<\/a><\/li>/g)]
        .map((m) => ({ href: m[1], sortName: decode(m[2]), type, letter: LETTERS[i] }));
}));

/**
 * Collects uncaught page errors.
 * @param {import('@playwright/test').Page} page
 * @returns {string[]}
 */
function trackPageErrors(page) {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    return errors;
}

/**
 * The rendered rows: every column's text and the Name link.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<Object<string, string>>>}
 */
function renderedRows(page) {
    return page.evaluate(() => {
        const names = Array.from(document.querySelectorAll('table.tbl thead tr:first-child th'))
            .map((th) => th.dataset.colName || th.textContent.trim());
        return Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((tr) => tr.style.display !== 'none')
            .map((tr) => {
                const row = {};
                names.forEach((n, i) => { row[n] = (tr.cells[i]?.textContent || '').replace(/\s+/g, ' ').trim(); });
                const a = tr.cells[names.indexOf('Name')]?.querySelector('a');
                row._href = a ? new URL(a.href).pathname : '';
                return row;
            });
    });
}

/**
 * Presses "Show all relations" and waits for the render.
 * @param {import('@playwright/test').Page} page
 */
async function showAll(page) {
    await page.click(`button[data-label="${BB_RELATIONS_BUTTON}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

test('the fixture still has the shape this spec relies on', () => {
    expect(LETTERS).toHaveLength(28);
    expect(LETTERS[0]).toBe('0-9');
    expect(LETTERS[27]).toBe('&');
    expect(PANELS).toHaveLength(28);
    expect(ENTRIES.length).toBeGreaterThan(2800);
    expect(new Set(ENTRIES.map((e) => e.href)).size).toBe(ENTRIES.length);
    expect(new Set(ENTRIES.map((e) => e.type))).toEqual(new Set(['Person', 'Band']));
    // The three names with a comma that are not a sort form.
    expect(ENTRIES.filter((e) => /, .*&/.test(e.sortName)).map((e) => e.sortName).sort())
        .toEqual(['Crosby, Stills & Nash', 'Crosby, Stills, Nash & Young']);
});

test('with sa_enable_brucebase on: the toolbar on the injected <h1>, the tabs untouched until the press', async ({ page }) => {
    const errors = trackPageErrors(page);
    await loadBbRelationsPage(page);
    await expect(page.locator(`h1.mb-bb-h1 button[data-label="${BB_RELATIONS_BUTTON}"]`)).toHaveCount(1);
    await expect(page.locator('h1.mb-bb-h1 > bdi')).toHaveText('Brucebase — Relations');
    expect(await page.locator('div.yui-navset').count()).toBe(1);
    expect(await page.locator('table.tbl').count()).toBe(0);
    expect(errors).toEqual([]);
});

test('with it off, the page is left untouched', async ({ page }) => {
    const logs = [];
    page.on('console', (msg) => logs.push(msg.text()));
    await loadBbRelationsPage(page, { enabled: false });
    await expect.poll(() => logs.some((t) => t.includes('brucebase.wikidot.com support is off')), { timeout: 10000 }).toBe(true);
    expect(await page.locator('button[data-label]').count()).toBe(0);
    expect(await page.locator('div.yui-navset').count()).toBe(1);
});

test.describe('bb-relations', () => {
    let errors;
    let rows;

    test.beforeEach(async ({ page }) => {
        errors = trackPageErrors(page);
        await loadBbRelationsPage(page);
        await showAll(page);
        rows = await renderedRows(page);
    });

    test.afterEach(() => {
        expect(errors).toEqual([]);
    });

    test('every entry of the tabs is one row, with its type and its tab\'s letter', async ({ page }) => {
        expect(await renderedBbHeaders(page)).toEqual(HEADERS);
        expect(rows).toHaveLength(ENTRIES.length);
        const byHref = new Map(rows.map((r) => [r._href, r]));
        // Sort name is the site's text with typographic punctuation
        // (sa_foreign_typography, on by default): "1992–93 World Tour Band, The".
        const typo = await page.evaluate((names) => names.map((n) => window.__saTest.mbTypography(n)), ENTRIES.map((e) => e.sortName));
        expect(typo).toContain('1992–93 World Tour Band, The');
        ENTRIES.forEach((e, i) => {
            const r = byHref.get(e.href);
            expect(r, e.href).toBeTruthy();
            expect([r['Sort name'], r.Type, r.Letter], e.href).toEqual([typo[i], e.type, e.letter]);
        });
        // The tabview and the script that built it are gone; the counts above stay.
        expect(await page.locator('div.yui-navset').count()).toBe(0);
        expect(await page.locator('table.tbl').count()).toBe(1);
        await expect(page.locator('#page-content')).toContainText('Persons: 2642');
        expect(await page.evaluate(() => {
            const h2 = document.querySelector('h2.mb-bb-list-heading');
            const table = document.querySelector('table.mb-bb-relations-table');
            return !!h2 && h2.textContent.includes('Relations') &&
                !!(h2.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING);
        })).toBe(true);
    });

    test('Name is the sort name turned round, unless it is a band name with a comma', () => {
        const name = (sort) => rows.find((r) => r['Sort name'] === sort)?.Name;
        expect(name('Adams, Bryan')).toBe('Bryan Adams');
        expect(name('Alliance Singers, The')).toBe('The Alliance Singers');
        expect(name('Edge, The')).toBe('The Edge');
        expect(name('lang, k.d.')).toBe('k.d. lang');
        expect(name('Akil')).toBe('Akil');
        expect(name('Crosby, Stills & Nash')).toBe('Crosby, Stills & Nash');
        expect(name('Crosby, Stills, Nash & Young')).toBe('Crosby, Stills, Nash & Young');
        expect(name('Fields, Elysian')).toBe('Elysian Fields');
    });

    test('names get typographic apostrophes, never a change of case', () => {
        // "D'Angelo" as the site writes it, in both columns.
        const r = rows.find((x) => x._href === '/relation:d-angelo');
        expect(r).toBeTruthy();
        expect(r.Name).toBe('D’Angelo');
        expect(r['Sort name']).toBe('D’Angelo');
        expect(rows.find((x) => x['Sort name'] === 'grandson')?.Name).toBe('grandson');
    });

    test('a Type filter leaves the bands', async ({ page }) => {
        const input = columnFilterInput(page, HEADERS.indexOf('Type'));
        await input.click();
        await input.pressSequentially('Band');
        const bands = ENTRIES.filter((e) => e.type === 'Band').length;
        await expect.poll(async () => (await renderedRows(page)).length, { timeout: 15000 }).toBe(bands);
    });
});

test('with typographic punctuation off, names are kept exactly as written', async ({ page }) => {
    await loadBbRelationsPage(page, { settingsOverride: { sa_foreign_typography: false } });
    await showAll(page);
    const r = (await renderedRows(page)).find((x) => x._href === '/relation:d-angelo');
    expect(r.Name).toBe("D'Angelo");
});

test('_bbRelationDisplayName turns a sort name round only when it is one', async ({ page }) => {
    await loadBbRelationsPage(page);
    const out = await page.evaluate(() => {
        const f = window.__saTest.bbRelationDisplayName;
        return [f('Adams, Bryan'), f('Davis Jr., Sammy'), f('Crosby, Stills & Nash'), f('Bono'), f(''), f(null), f('A, B, C')];
    });
    expect(out).toEqual(['Bryan Adams', 'Sammy Davis Jr.', 'Crosby, Stills & Nash', 'Bono', '', '', 'A, B, C']);
});

test.describe('Relations: Save to Disk → Load from Disk', () => {
    let tmpDir;
    test.beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-bb-rel-')); });
    test.afterEach(() => { if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true }); });

    test('a reopened list renders in place of the fresh page\'s tabs', async ({ context }) => {
        const source = await context.newPage();
        await loadBbRelationsPage(source);
        await showAll(source);
        const before = (await renderedRows(source)).map((r) => `${r._href} ${r.Type} ${r.Letter}`).sort();
        const downloadPromise = source.waitForEvent('download', { timeout: 60000 });
        await clickToolbarItem(source, '#mb-save-to-disk-btn');
        await source.locator('#sa-sd-save-confirm').waitFor({ state: 'visible', timeout: 15000 });
        await source.click('#sa-sd-save-confirm');
        const saved = path.join(tmpDir, 'bb-relations.json.gz');
        await (await downloadPromise).saveAs(saved);
        await source.close();

        const page = await context.newPage();
        const errors = trackPageErrors(page);
        await loadBbRelationsPage(page);
        await clickToolbarItem(page, '#mb-load-from-disk-btn');
        await page.locator('input[type="file"][accept*="json"]').setInputFiles(saved);
        const renderBtn = page.locator('#sa-render-no-filter-confirm');
        await renderBtn.waitFor({ state: 'attached', timeout: 15000 });
        await renderBtn.evaluate((el) => el.click());
        await waitForRenderComplete(page, { waitForAutoResize: false });
        expect((await renderedRows(page)).map((r) => `${r._href} ${r.Type} ${r.Letter}`).sort()).toEqual(before);
        expect(await page.locator('table.tbl').count()).toBe(1);
        expect(await page.locator('div.yui-navset').count()).toBe(0);
        expect(errors).toEqual([]);
    });
});
