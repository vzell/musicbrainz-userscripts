'use strict';

// 💾 Save configuration / 📂 Load configuration — the feature's first coverage
// since it shipped in 9.99.273.
//
// ── The bug ──────────────────────────────────────────────────────────────────
//
// `_loadSettingsConfig()` skipped only `type: 'divider'` and ran every other
// value through `String(value)`. The five `type: 'table'` settings are row
// ARRAYS, so importing a config file turned each into a comma-joined string in
// GM storage. `Lib.getTableRows()` returns `Array.isArray(rows) ? rows :
// defaultRows`, so all three lazy seeders — `_loadDefaultHiddenColumnsMap()`,
// `_initRelMappings()`'s `_loadMap()` and `_loadUnicodeCharsMappings()` — then
// saw an empty list and refilled from the built-in defaults.
//
// Importing therefore DESTROYED every hand-entered row in Default Hidden
// Columns, the three Relationships icon tables and the Unicode picker, while
// the summary dialog counted them as applied. See org/config-handling.org F3.
//
// ── Why the hooks, and why two page loads ────────────────────────────────────
//
// Neither half of the feature has a surface a fixture can drive. The export is
// a button inside VZ_MBLibrary's settings modal that hands a Blob to the
// browser as a download; the import reads a `File` from a hidden
// `<input type="file">` in that same modal and ends with `location.reload()`,
// so the interesting state is gone before any assertion could run. Both hooks
// call the shipping functions and add nothing of their own.
//
// The two loads are forced by where the export reads from. `_buildConfigJson()`
// reads `Lib.settings`, which VZ_MBLibrary's `settingsInterface.init()`
// populates ONCE at construction — so a `GM_setValue` made mid-session is
// invisible to it. And seeding through `loadUserscriptPage`'s
// `settingsOverride` cannot substitute: that goes through
// `context.addInitScript()`, which re-runs on EVERY navigation in the context
// and would re-seed the pristine table over whatever the import had just
// written, hiding the exact defect under test. So the tables are written with
// `GM_setValue` on load #1 and picked up by `init()` on load #2.
//
// ── What each half pins ──────────────────────────────────────────────────────
//
// The mechanism tests read GM storage back directly, because `Array.isArray()`
// is literally the predicate `Lib.getTableRows()` branches on — one line from
// the stored value to the user's rows being discarded.
//
// The user-visible test is the one that would have caught this in the wild: a
// column configured to start hidden still starts hidden after a round trip. It
// works in the same page as the import because
// `_seedDefaultHiddenColumnsForPageType()` runs from the render tail and calls
// `_loadDefaultHiddenColumnsMap()` unconditionally, reading GM storage LIVE
// rather than the `Lib.settings` snapshot — so the click has to come after the
// import, not before.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { collectPageErrors } = require('../support/liveAssertions');

// "Bruce Springsteen Studio Collection", `tableMode: 'single'` — the same shell
// settings-numeric-coercion.spec.js uses. Nothing here depends on its size;
// it is chosen for having an "Artist" column to hide and for loading fast.
const SERIES_URL = 'https://musicbrainz.org/series/aa3694d3-a3d0-48ed-8f07-5b576de87908';
const SERIES_SHELL = path.join(__dirname, '..', 'snapshots', 'series-releases', 'raw.html');
const SERIES_LABEL = 'Show all Releases for Series';
const SERIES_GLOB = 'https://musicbrainz.org/series/**';

// One custom row per `type: 'table'` setting. Every value is deliberately
// unlike the built-in defaults, so a seeder that refilled from the built-ins
// cannot be mistaken for one that preserved these.
const CUSTOM_TABLES = {
    sa_default_hidden_columns:       [['series-releases', '"Artist"']],
    sa_rel_url_icon_classes:         [['discogs', 'vz-test-discogs']],
    sa_rel_other_db_classes:         [['example.test', 'vz-test-otherdb']],
    sa_rel_streaming_classes:        [['stream.test', 'vz-test-stream']],
    sa_unicode_char_picker_mappings: [['✦', 'Test star', 'true', 'demo']],
};

const TABLE_KEYS = Object.keys(CUSTOM_TABLES);

/**
 * Navigates to the series shell and injects the userscript.
 *
 * Safe to call twice on the same `page`: the GM stub keeps its values in
 * `localStorage` under one key, so anything written by load #1 is still there
 * for load #2's `settingsInterface.init()`.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function loadSeriesPage(page) {
    await loadUserscriptPage(page, {
        url: SERIES_URL,
        fixtureFile: SERIES_SHELL,
        testMode: true,
    });
    await page.route(SERIES_GLOB, (route) => route.fulfill({
        path: SERIES_SHELL, contentType: 'text/html',
    }));
}

/** Clicks "Show all" and waits for the consolidated table. */
async function showAll(page) {
    await page.click(`button[data-label="${SERIES_LABEL}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/** Writes the custom row arrays straight into GM storage. */
const seedCustomTables = (page, tables) =>
    page.evaluate((t) => {
        Object.entries(t).forEach(([k, v]) => window.GM_setValue(k, v));
    }, tables);

/** Reads GM storage back, unfiltered — the array-ness is the whole point. */
const readGmValues = (page, keys) =>
    page.evaluate((k) => Object.fromEntries(
        k.map((key) => [key, window.GM_getValue(key, null)])), keys);

/** @returns {Promise<Object>} the parsed 💾 export. */
const exportConfig = (page) =>
    page.evaluate(() => JSON.parse(window.__saTest.buildConfigJson()));

/** Runs the 📂 import write loop; returns its tallies. */
const importConfig = (page, settingsObj) =>
    page.evaluate((s) => window.__saTest.applyConfigSettings(s), settingsObj);

/**
 * Load #1 seeds, load #2 picks the seeds up in `Lib.settings` — see the header.
 * Leaves the page on load #2 with nothing rendered yet.
 *
 * @returns {Promise<Object>} the export taken on load #2.
 */
async function seedTablesAndReload(page) {
    await loadSeriesPage(page);
    await seedCustomTables(page, CUSTOM_TABLES);
    await loadSeriesPage(page);
    return exportConfig(page);
}

test.describe('config save/load round trip preserves the editable lookup tables', () => {
    let pageErrors;

    test.beforeEach(async ({ page }) => {
        pageErrors = collectPageErrors(page);
    });

    test.afterEach(() => {
        expect(pageErrors, 'no uncaught page errors').toEqual([]);
    });

    // ── Mechanism ───────────────────────────────────────────────────────────

    test('every hand-entered table survives an export → import round trip', async ({ page }) => {
        const exported = await seedTablesAndReload(page);
        const summary = await importConfig(page, exported.settings);
        const after = await readGmValues(page, TABLE_KEYS);

        for (const key of TABLE_KEYS) {
            // On unfixed code this is the string "series-releases,\"Artist\"".
            expect(Array.isArray(after[key]), `${key} is still an array`).toBe(true);
            expect(after[key], `${key} kept its rows`).toEqual(CUSTOM_TABLES[key]);
        }
        expect(summary.invalid, 'no table was rejected').toBe(0);
    });

    test('the export emits the tables as real JSON arrays', async ({ page }) => {
        const exported = await seedTablesAndReload(page);

        for (const key of TABLE_KEYS) {
            expect(exported.settings[key], `${key} exported verbatim`)
                .toEqual(CUSTOM_TABLES[key]);
        }
    });

    test('the export omits the type:function key, and import skips it', async ({ page }) => {
        // `sa_fn_edit_pinned_filter_list`'s `default:` is the internal method
        // name `_openEditPinnedFilterListFromSettings`, resolved through the
        // library's functionRegistry. Exporting it meant the importer wrote
        // that method name into GM storage as if it were a user value.
        const exported = await seedTablesAndReload(page);
        expect(Object.keys(exported.settings)).not.toContain('sa_fn_edit_pinned_filter_list');

        // A file written before the export was fixed still carries the key, so
        // the import side needs its own guard rather than relying on the export.
        const summary = await importConfig(page, {
            sa_fn_edit_pinned_filter_list: '_openEditPinnedFilterListFromSettings',
        });
        expect(summary).toMatchObject({ applied: 0, skipped: 1, invalid: 0 });

        const [stored] = Object.values(
            await readGmValues(page, ['sa_fn_edit_pinned_filter_list']));
        expect(stored, 'nothing was written for the function key').toBeNull();
    });

    test('a non-array offered for a table key is rejected and writes NOTHING', async ({ page }) => {
        await seedTablesAndReload(page);

        // Exactly what the old String() arm produced, fed back in: the count
        // alone would pass even if the value were still written, so the stored
        // value is what this asserts.
        const summary = await importConfig(page, {
            sa_unicode_char_picker_mappings: '✦,Test star,true,demo',
        });
        expect(summary).toMatchObject({ applied: 0, skipped: 0, invalid: 1 });

        const after = await readGmValues(page, ['sa_unicode_char_picker_mappings']);
        expect(after.sa_unicode_char_picker_mappings)
            .toEqual(CUSTOM_TABLES.sa_unicode_char_picker_mappings);
    });

    test('a table edited AFTER page load exports its current rows, not the snapshot',
        async ({ page }) => {
            // Reported from a real browser on 2026-09-21: add a symbol in the
            // Unicode picker's table editor, 💾 Save configuration, 📂 Load it
            // back — and the new symbol is gone.
            //
            // The import was not at fault. VZ_MBLibrary's table editor writes
            // GM_setValue(key, rows) and, unlike the settings dialog's own SAVE,
            // neither updates settingsInterface.values nor reloads the page. So
            // `Lib.settings` keeps its page-load snapshot for the rest of the
            // session, and an export taken from it silently omits the edit.
            // Importing that file then writes the PRE-EDIT rows back over the
            // good ones — the same destruction as F3, arriving from the export.
            await seedTablesAndReload(page);

            // Exactly what the table editor's 💾 Save does: GM storage only.
            const edited = [
                ...CUSTOM_TABLES.sa_unicode_char_picker_mappings,
                ['♫', 'Beamed notes', 'false', 'added mid-session'],
            ];
            await page.evaluate((rows) => {
                window.GM_setValue('sa_unicode_char_picker_mappings', rows);
            }, edited);

            const exported = await exportConfig(page);
            expect(exported.settings.sa_unicode_char_picker_mappings,
                'the export reflects GM storage, not the page-load snapshot')
                .toEqual(edited);

            // And the round trip keeps it, which is what the user was after.
            await importConfig(page, exported.settings);
            const after = await readGmValues(page, ['sa_unicode_char_picker_mappings']);
            expect(after.sa_unicode_char_picker_mappings).toEqual(edited);
        });

    test('a table with no stored rows is dropped from the export rather than invented',
        async ({ page }) => {
            // The five tables carry no `default:` — they are lazy-seeded from
            // code on first use. With nothing stored there is genuinely nothing
            // to record, and omitting the key leaves the importer's "missing
            // keys keep their current value" rule to let the seeders do their
            // job. Exporting `[]` instead would actively empty the destination's
            // table, which is the destruction this whole file exists to prevent.
            //
            // The keys are deleted explicitly rather than relying on a fresh
            // profile: three of the five are seeded during startup, so "fresh"
            // stopped meaning "empty" once the export began reading GM storage
            // live.
            await loadSeriesPage(page);
            // Two shapes of "nothing stored", covered separately because they
            // reach the guard differently: a key GM storage has never held, and
            // one holding `[]` because the user deleted every row. Only the
            // second exercises the `length > 0` half.
            await page.evaluate((keys) => {
                keys.forEach((k) => window.GM_deleteValue(k));
                window.GM_setValue(keys[0], []);
            }, TABLE_KEYS);

            const exported = await exportConfig(page);
            for (const key of TABLE_KEYS) {
                expect(Object.keys(exported.settings), `${key} omitted while empty`)
                    .not.toContain(key);
            }
            // The export is otherwise a FULL dump, not a delta — guards against
            // "dropped the tables" being mistaken for "dropped everything default".
            expect(Object.keys(exported.settings).length).toBeGreaterThan(200);
        });

    test('non-table settings import exactly as they did before', async ({ page }) => {
        // The regression control. Every assertion above is about the new table
        // branch; this pins that adding it left the other four arms alone.
        //
        // Every value here is deliberately OFF its schema default, because an
        // imported value that MATCHES the default is now cleared from storage
        // rather than written — org/config-handling.org F1's dirty set, which
        // `tests/fixtures/settings-migration.spec.js` covers. This test is
        // about the coercion table, so it keeps its values clear of that rule:
        // `sa_enable_barcode_highlight` used to read `'true'` here, which is
        // its own default, so it asserted a stored `true` that the importer no
        // longer writes.
        await loadSeriesPage(page);
        const summary = await importConfig(page, {
            sa_enable_barcode_highlight: 'false',  // checkbox: string → boolean
            sa_max_page: '7',                      // number:   string → Number
            sa_ui_h2_bg: '#123456',                // colour:   String()
            sa_uniq_dropdown_visible_rows: 'abc',  // number:   unparseable
        });
        expect(summary).toMatchObject({ applied: 3, skipped: 0, invalid: 1, pruned: 0 });

        const after = await readGmValues(page, [
            'sa_enable_barcode_highlight', 'sa_max_page', 'sa_ui_h2_bg',
        ]);
        expect(after.sa_enable_barcode_highlight).toBe(false);
        expect(after.sa_max_page).toBe(7);
        expect(after.sa_ui_h2_bg).toBe('#123456');
    });

    // ── User-visible behaviour ──────────────────────────────────────────────

    test('a column configured to start hidden still starts hidden after an import',
        async ({ page }) => {
            const exported = await seedTablesAndReload(page);
            await importConfig(page, exported.settings);

            // The click must come AFTER the import: the render tail is what
            // calls _seedDefaultHiddenColumnsForPageType(), which re-reads GM
            // storage live. On unfixed code the stored string makes
            // _loadDefaultHiddenColumnsMap() fall back to the built-in
            // `release-tracks → "ARs"` row, so this pageType has no configured
            // hidden column at all and "Artist" renders visible.
            await showAll(page);

            const artistTh = page.locator(
                'table.tbl thead tr:first-child th[data-col-name="Artist"]');
            await expect(artistTh, 'the configured column is hidden').toBeHidden();

            // Counter-guard: a page where EVERY column were hidden would also
            // satisfy the assertion above.
            await expect(
                page.locator('table.tbl thead tr:first-child th[data-col-name="Release"]'),
                'an unconfigured column is untouched').toBeVisible();
        });
});
