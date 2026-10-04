'use strict';

// The 👁️ column-visibility menus name each column by its CLEAN name, the one
// `makeTableSortableUnified()` stamps into `th.dataset.colName`, and not by
// the header's raw text minus a list of known glyphs.
//
// The raw text carries whatever buttons a header has grown. The Barcode
// header's highlight toggle reads "▶▌█" (or "▼▌█"), and only ▶/▼ were in the
// strip list, so the menu said "▌█Barcode". That name is also the key the
// choice is saved under, which made two things wrong at once:
//
//   1. the label itself (pinned by the first test), and
//   2. `sa_default_hidden_columns`: `_seedDefaultHiddenColumnsForPageType()`
//      writes the CONFIGURED name ("Barcode") into the saved state, and the
//      menu looked up "▌█Barcode". A default-hidden Barcode never hid (second
//      test).
//
// The third test pins the migration: a choice saved before the fix, under
// "▌█Barcode", still applies after it.
//
// "Hidden" is read from the Barcode `<th>`'s inline display, which is what
// `toggleColumn()` writes. The checkbox state alone would also pass if the
// menu ticked the box without hiding anything.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadFromDiskFixture } = require('../support/diskFixture');

const FIXTURE = path.join(__dirname, 'saved-data', 'artist-releases-bodeans.json.gz');
const PAGE_URL = 'https://musicbrainz.org/artist/84c38d3a-3400-4c28-b988-90558bb6fae0/releases';
const COLVIS_KEY = 'vz-mb-colvis-artist-releases';
const LEGACY_BARCODE = '▌█Barcode';

/**
 * Loads the BoDeans fixture with barcode highlighting (the source of the ▌█
 * glyph) and the column-visibility menu on, plus any extra GM values.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object<string, *>} [extra] - GM values seeded before the script runs
 * @returns {Promise<void>}
 */
async function load(page, extra = {}) {
    await loadFromDiskFixture(page, {
        url: PAGE_URL,
        fixturePath: FIXTURE,
        testMode: true,
        settingsOverride: {
            sa_enable_barcode_highlight: true,
            sa_enable_column_visibility: true,
            ...extra,
        },
    });
    await expect.poll(() => page.locator('label[for^="mb-col-vis-"]').count(),
        { timeout: 30000, message: 'the column-visibility menu is built' }).toBeGreaterThan(0);
}

/**
 * The Barcode header's state: its raw text, its clean name, and whether
 * `toggleColumn()` has hidden it.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{raw: string, hidden: boolean}|null>}
 */
const barcodeTh = (page) => page.evaluate(() => {
    const th = Array.from(document.querySelectorAll('table.tbl thead tr:first-child th'))
        .find((c) => c.dataset.colName === 'Barcode');
    return th ? { raw: th.textContent, hidden: th.style.display === 'none' } : null;
});

test.describe('👁️ column visibility uses clean column names', () => {
    test('every label is its header\'s clean name; Barcode is not "▌█Barcode"', async ({ page }) => {
        await load(page);

        const th = await barcodeTh(page);
        expect(th, 'the Barcode column exists').not.toBeNull();
        // Without the glyph in the header, the label would pass for nothing.
        expect(th.raw).toContain('▌█');

        const pairs = await page.evaluate(() => {
            const ths = document.querySelectorAll('table.tbl thead tr:first-child th');
            return Array.from(document.querySelectorAll('label[for^="mb-col-vis-"]')).map((l) => {
                const idx = Number(l.htmlFor.replace('mb-col-vis-', ''));
                return { label: l.textContent, colName: ths[idx] ? ths[idx].dataset.colName || null : null };
            });
        });
        expect(pairs.map((p) => p.label)).toContain('Barcode');
        expect(pairs.filter((p) => /[▌█]/.test(p.label))).toEqual([]);
        // Every header with a stamped name is listed under exactly that name.
        expect(pairs.filter((p) => p.colName && p.label !== p.colName)).toEqual([]);
    });

    test('a default-hidden "Barcode" (sa_default_hidden_columns) is hidden', async ({ page }) => {
        await load(page, { sa_default_hidden_columns: [['artist-releases', '"Barcode"']] });
        await expect.poll(async () => (await barcodeTh(page)).hidden,
            { message: 'the configured default hides the Barcode column' }).toBe(true);
    });

    test('a choice saved under the old "▌█Barcode" key still applies', async ({ page }) => {
        await load(page, { [COLVIS_KEY]: JSON.stringify({ [LEGACY_BARCODE]: false }) });
        await expect.poll(async () => (await barcodeTh(page)).hidden,
            { message: 'the pre-fix saved choice still hides the Barcode column' }).toBe(true);
        const checked = await page.evaluate(() => {
            const l = Array.from(document.querySelectorAll('label[for^="mb-col-vis-"]'))
                .find((x) => x.textContent === 'Barcode');
            return l ? document.getElementById(l.htmlFor).checked : null;
        });
        expect(checked, 'the Barcode checkbox reflects the saved choice').toBe(false);
    });
});

// Multi-table pages have a second menu per sub-table
// (`createSubTableColumnVisibilityButton()`), with labels `mb-stf-<id>-col-vis-N`
// and its own saved key. It is built before the Barcode header gets its
// highlight button, so its labels were never "▌█Barcode"; the first test below
// keeps them that way, and passes on the pre-fix code too.
const RG_URL = 'https://musicbrainz.org/release-group/f83d2211-dd81-4b1e-9a02-e89733891e1c';
const RG_FIXTURE = path.join(__dirname, 'saved-data', 'releasegroup-releases.json.gz');
const RG_SHELL = path.join(__dirname, '..', 'snapshots', 'releasegroup-releases', 'raw.html');

/**
 * Loads the two-sub-table release-group fixture from disk, network-free.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object<string, *>} [extra] - GM values seeded before the script runs
 * @returns {Promise<void>}
 */
async function loadMulti(page, extra = {}) {
    await page.route('**/ws/2/**', (route) => route.fulfill({
        status: 200, contentType: 'application/json', body: JSON.stringify({ relations: [] }),
    }));
    await loadFromDiskFixture(page, {
        url: RG_URL,
        fixturePath: RG_FIXTURE,
        pageFixtureFile: RG_SHELL,
        testMode: true,
        settingsOverride: {
            sa_enable_barcode_highlight: true,
            sa_enable_column_visibility: true,
            ...extra,
        },
    });
    await expect(page.locator('table.tbl')).toHaveCount(2, { timeout: 30000 });
    await expect.poll(() => page.locator('label[for^="mb-stf-"]').count(),
        { timeout: 30000, message: 'the sub-table menus are built' }).toBeGreaterThan(0);
}

/**
 * Per sub-table: its menu's labels and whether its Barcode `<th>` is hidden.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{raw: string, hidden: boolean}[]>}
 */
const subTables = (page) => page.evaluate(() => Array.from(document.querySelectorAll('table.tbl')).map((t) => {
    const th = Array.from(t.querySelectorAll('thead tr:first-child th'))
        .find((c) => c.dataset.colName === 'Barcode');
    return { raw: th ? th.textContent : '', hidden: th ? th.style.display === 'none' : false };
}));

test.describe('👁️ sub-table column visibility uses clean column names', () => {
    test('sub-table labels carry no header-button glyphs', async ({ page }) => {
        await loadMulti(page);
        const tables = await subTables(page);
        expect(tables).toHaveLength(2);
        expect(tables.every((t) => t.raw.includes('▌█')), 'each Barcode header carries the glyph').toBe(true);

        const labels = await page.evaluate(() =>
            Array.from(document.querySelectorAll('label[for^="mb-stf-"]')).map((l) => l.textContent));
        expect(labels.filter((l) => l === 'Barcode')).toHaveLength(2);
        expect(labels.filter((l) => /[▌█]/.test(l))).toEqual([]);
    });

    test('"Choose current configuration" in the page-wide menu reaches every sub-table menu', async ({ page }) => {
        // The page-wide menu pushes its state to each sub-table menu by column
        // name (`applyGlobalConfig()`). It used to say "▌█Barcode" while the
        // sub-table menus said "Barcode", so Barcode was the one column that
        // never propagated.
        await loadMulti(page);
        await page.click('#mb-visible-btn');
        // Both clicks are made from inside the page. The menu is fixed-position,
        // and where it opens depends on where the h2 ends up after layout, so
        // under load the Barcode label (as well as the Choose button below it)
        // can land outside the viewport, where Playwright cannot scroll a fixed
        // element into view. It then retries until the test times out. Every
        // sub-table menu also has its own hidden Choose button, hence :visible.
        const pageBarcode = page.locator('label[for^="mb-col-vis-"]', { hasText: /Barcode$/ });
        await pageBarcode.evaluate((l) => l.click());
        expect(await page.evaluate(() => {
            const l = Array.from(document.querySelectorAll('label[for^="mb-col-vis-"]'))
                .find((x) => /Barcode$/.test(x.textContent));
            return document.getElementById(l.htmlFor).checked;
        }), 'the page-wide Barcode checkbox is now unticked').toBe(false);
        await page.locator('button:visible', { hasText: 'Choose current configuration' }).evaluate((b) => b.click());

        const subBarcode = await page.evaluate(() =>
            Array.from(document.querySelectorAll('label[for^="mb-stf-"]'))
                .filter((l) => l.textContent === 'Barcode')
                .map((l) => document.getElementById(l.htmlFor).checked));
        expect(subBarcode, 'both sub-table menus untick Barcode').toEqual([false, false]);
    });
});
