'use strict';

// schema_version 2 — the config file's `workspace` block.
// org/config-handling.org F5, last bullet.
//
// ── What was missing ─────────────────────────────────────────────────────────
//
// The export covered `configSchema` keys and nothing else. Not per-pageType
// column visibility (`vz-mb-colvis-*`), not the pinned filter list
// (`persistent-sa-hist-list`), not filter history, panel geometry, the
// unique-values dropdown's section collapse, the settings dialog's own size and
// column widths, or `vz-lib-prefs`.
//
// The pinned filter list is the sharp edge: it is edited from INSIDE the
// settings dialog, so a user has every reason to expect the file that dialog
// writes to contain it. Column visibility is the laborious one — one state per
// pageType, built up over months.
//
// ── The trap this file exists for ────────────────────────────────────────────
//
// These keys have no schema, so nothing declares their type, and they are not
// all the same shape: `vz-mb-colvis-*` holds a `JSON.stringify()`ed STRING
// (both readers `JSON.parse()` what they get), `persistent-sa-hist-list` an
// array, the geometries plain objects. So there is no correct coercion even in
// principle — the only correct handling is verbatim, in both directions.
//
// That is org/config-handling.org F3 arriving from a third direction, and this
// block is a worse place to repeat it: the five `type: 'table'` settings at
// least had `Lib.getTableRows()` re-seeding the built-ins behind them, so the
// damage was recoverable by re-entering rows. Nothing re-seeds a pinned filter
// list.
//
// A coercion defect is also INVISIBLE at import time — the summary counts the
// key as restored either way — and surfaces a page load later as column
// visibility that reverted, or a pinned list holding one comma-joined string
// where six entries used to be. Hence the `typeof` assertions below: a
// deep-equal alone would not distinguish `'{"Artist":false}'` from
// `{Artist: false}`.
//
// ── Why the hooks ────────────────────────────────────────────────────────────
//
// Same reason as config-import-export.spec.js: the export is a button inside
// VZ_MBLibrary's settings modal that hands a Blob to the browser, and the
// import reads a `File` from a hidden `<input type="file">` and ends in
// `location.reload()`. Both hooks call the shipping functions and add nothing.
//
// Unlike that file, no second page load is needed anywhere here —
// `_buildWorkspaceBlock()` reads GM storage LIVE rather than the `Lib.settings`
// page-load snapshot, because none of these keys is a `configSchema` key in the
// first place.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { collectPageErrors } = require('../support/liveAssertions');

// "Bruce Springsteen Studio Collection", `tableMode: 'single'` — the same shell
// config-import-export.spec.js uses, and for the same reason: it has an
// "Artist" column to hide and it loads fast.
const SERIES_URL = 'https://musicbrainz.org/series/aa3694d3-a3d0-48ed-8f07-5b576de87908';
const SERIES_SHELL = path.join(__dirname, '..', 'snapshots', 'series-releases', 'raw.html');
const SERIES_LABEL = 'Show all Releases for Series';
const SERIES_GLOB = 'https://musicbrainz.org/series/**';

const SCRIPT_ID = 'vz-mb-show-all-entity-data';

// One value per group in `_CFG_WORKSPACE_GROUPS`, each a DIFFERENT JS shape, so
// a coercion applied to the block as a whole cannot pass. The colvis pair is
// deliberately stringified: that is genuinely how the script stores it.
const WORKSPACE = {
    // pinned — array of strings
    'persistent-sa-hist-list': ['^Bruce', 'tour 1978'],
    // history — array of strings
    'lru-sa-hist-list': ['live', 'bootleg'],
    // colvis — a JSON STRING, not an object
    'vz-mb-colvis-series-releases': '{"Artist":false}',
    'vz-mb-colvis-touched-series-releases': '["Artist"]',
    // geometry — plain objects, with numbers
    'sa_stats_panel_geometry': { top: 40, left: 60, width: 500, height: 400, fontSize: 125 },
    'sa_load_dialog_geometry': { top: 10, left: 20, width: 700, height: 300 },
    // dropdown — object of booleans
    'mb_sa_uniq_section_collapse': { structure: true, entity_artist: false },
    // dialog — objects written by VZ_MBLibrary into this script's storage
    [`${SCRIPT_ID}-modal-size`]: { width: 1100, height: 720 },
    [`${SCRIPT_ID}-col-widths`]: { col1: 640, col2: 180 },
    [`${SCRIPT_ID}-section-collapse`]: { 'divider_thresholds': false },
    [`${SCRIPT_ID}-changelog-size`]: { width: 900, height: 600 },
    // libprefs — object of strings
    'vz-lib-prefs': { lib_content_font_size: '1.6em' },
};

const WORKSPACE_KEYS = Object.keys(WORKSPACE);

/** Navigates to the series shell and injects the userscript. */
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

/** Writes values straight into GM storage, as the features themselves do. */
const seedGm = (page, values) =>
    page.evaluate((v) => {
        Object.entries(v).forEach(([k, val]) => window.GM_setValue(k, val));
    }, values);

/** Reads GM storage back, unfiltered — the SHAPE is the whole point. */
const readGmValues = (page, keys) =>
    page.evaluate((k) => Object.fromEntries(
        k.map((key) => [key, window.GM_getValue(key, null)])), keys);

/** @returns {Promise<Object>} the parsed 💾 export. */
const exportConfig = (page) =>
    page.evaluate(() => JSON.parse(window.__saTest.buildConfigJson()));

/** Runs the 📂 import's workspace write loop; returns its tallies. */
const importWorkspace = (page, workspaceObj) =>
    page.evaluate((w) => window.__saTest.applyWorkspaceState(w), workspaceObj);

test.describe('config file schema_version 2 — the workspace block', () => {
    let pageErrors;

    test.beforeEach(async ({ page }) => {
        pageErrors = collectPageErrors(page);
    });

    test.afterEach(() => {
        expect(pageErrors, 'no uncaught page errors').toEqual([]);
    });

    // ── Round trip ──────────────────────────────────────────────────────────

    test('every workspace group survives an export → import round trip, verbatim',
        async ({ page }) => {
            await loadSeriesPage(page);
            await seedGm(page, WORKSPACE);

            const exported = await exportConfig(page);
            expect(exported._meta.schema_version, 'the format is v2').toBe(2);

            // Wipe, so a "restored" value cannot just be the one already there.
            await page.evaluate((keys) => {
                keys.forEach((k) => window.GM_deleteValue(k));
            }, WORKSPACE_KEYS);
            expect(Object.values(await readGmValues(page, WORKSPACE_KEYS)),
                'the seed really is gone before the import')
                .toEqual(WORKSPACE_KEYS.map(() => null));

            const summary = await importWorkspace(page, exported.workspace);
            const after = await readGmValues(page, WORKSPACE_KEYS);

            for (const key of WORKSPACE_KEYS) {
                expect(after[key], `${key} round-tripped`).toEqual(WORKSPACE[key]);
                // The assertion a deep-equal cannot make: a JSON string that
                // has been "helpfully" parsed still deep-equals nothing here,
                // but a stored object where the reader JSON.parse()s a string
                // is a broken column-visibility state.
                expect(typeof after[key], `${key} kept its JS type`)
                    .toBe(typeof WORKSPACE[key]);
            }
            expect(summary.restored).toBe(WORKSPACE_KEYS.length);
            expect(summary.skipped, 'nothing in our own export was refused').toBe(0);
        });

    test('the colvis value stays a STRING through the round trip', async ({ page }) => {
        // Isolated from the loop above because it is the one shape that reads
        // as correct while being wrong: `{"Artist":false}` and `{Artist:false}`
        // print almost identically in a failure diff, and only the string form
        // survives `loadColVisState()`'s JSON.parse().
        await loadSeriesPage(page);
        await seedGm(page, { 'vz-mb-colvis-series-releases': '{"Artist":false}' });

        const exported = await exportConfig(page);
        expect(typeof exported.workspace['vz-mb-colvis-series-releases'],
            'exported as a string').toBe('string');

        await importWorkspace(page, exported.workspace);
        const after = await readGmValues(page, ['vz-mb-colvis-series-releases']);
        expect(after['vz-mb-colvis-series-releases']).toBe('{"Artist":false}');
    });

    test('an empty array or object IS carried, unlike a type:table key', async ({ page }) => {
        // The deliberate difference from `_buildConfigJson()`'s table arm. The
        // three table seeders treat `[]` as "re-seed from the built-ins", so an
        // emptied table cannot survive a reload and the format refuses to
        // promise it. Nothing re-seeds a pinned filter list or a colvis state,
        // so "I have no pinned filters" is a state worth transferring.
        await loadSeriesPage(page);
        await seedGm(page, {
            'persistent-sa-hist-list': [],
            'mb_sa_uniq_section_collapse': {},
        });

        const exported = await exportConfig(page);
        expect(exported.workspace['persistent-sa-hist-list']).toEqual([]);
        expect(exported.workspace['mb_sa_uniq_section_collapse']).toEqual({});

        await seedGm(page, { 'persistent-sa-hist-list': ['stale'] });
        await importWorkspace(page, exported.workspace);
        const after = await readGmValues(page, ['persistent-sa-hist-list']);
        expect(after['persistent-sa-hist-list'], 'the empty list really was applied')
            .toEqual([]);
    });

    test('a key GM storage has never held is omitted, not exported as null',
        async ({ page }) => {
            // The importer's rule is "a missing key keeps the destination's
            // current value", so omitting is how the file says "no opinion".
            // Exporting null would make every export actively erase whatever
            // the exporter happened not to have used.
            await loadSeriesPage(page);
            await page.evaluate((keys) => {
                keys.forEach((k) => window.GM_deleteValue(k));
            }, WORKSPACE_KEYS);

            const exported = await exportConfig(page);
            for (const key of WORKSPACE_KEYS) {
                expect(Object.keys(exported.workspace), `${key} omitted while unset`)
                    .not.toContain(key);
            }
            // The block is still present and still an object — absent would be
            // indistinguishable from a v1 file.
            expect(exported.workspace).toEqual({});
        });

    // ── The registry is the gate ────────────────────────────────────────────

    test('a key outside the registry is refused, and writes NOTHING', async ({ page }) => {
        // The file is user-supplied data. Without this the workspace block is
        // an arbitrary write into GM storage: `sa_settings_migration_level`
        // would permanently disable F1's one-shot repair, and a planted
        // `mb_sa_subtable_snapshot_*` payload would be consumed by the next
        // sub-table tab.
        await loadSeriesPage(page);
        const before = await readGmValues(page, ['sa_settings_migration_level']);

        const summary = await importWorkspace(page, {
            sa_settings_migration_level: 1,
            mb_sa_subtable_snapshot_evil: { rows: [] },
            'some-unrelated-key': 'x',
            'persistent-sa-hist-list': ['kept'],   // control: a real one still lands
        });

        expect(summary.restored, 'only the registered key was written').toBe(1);
        expect(summary.skipped).toBe(3);
        expect(summary.skippedKeys.sort()).toEqual(
            ['mb_sa_subtable_snapshot_evil', 'sa_settings_migration_level',
             'some-unrelated-key']);

        const after = await readGmValues(page, [
            'sa_settings_migration_level', 'mb_sa_subtable_snapshot_evil',
            'some-unrelated-key', 'persistent-sa-hist-list',
        ]);
        // Counting them as skipped would pass even if the write had happened,
        // so the stored values are what this asserts.
        expect(after.sa_settings_migration_level,
            'the migration guard is untouched').toEqual(before.sa_settings_migration_level);
        expect(after.mb_sa_subtable_snapshot_evil).toBeNull();
        expect(after['some-unrelated-key']).toBeNull();
        expect(after['persistent-sa-hist-list']).toEqual(['kept']);
    });

    test('the migration keys are absent from the export as well as refused on import',
        async ({ page }) => {
            // Both directions, because they are install state rather than user
            // state: exporting this profile's level would mark a frozen
            // destination as already migrated, and exporting its backup would
            // offer to "undo" a migration that never ran there.
            await loadSeriesPage(page);
            await seedGm(page, {
                sa_settings_migration_level: 1,
                sa_settings_migration_backup: { sa_max_page: 50 },
                sa_settings_migration_notice: true,
            });

            const exported = await exportConfig(page);
            for (const key of ['sa_settings_migration_level',
                'sa_settings_migration_backup', 'sa_settings_migration_notice']) {
                expect(Object.keys(exported.workspace), `${key} not exported`)
                    .not.toContain(key);
                expect(Object.keys(exported.settings), `${key} is not a schema key either`)
                    .not.toContain(key);
            }
        });

    // ── Key resolution ──────────────────────────────────────────────────────

    test('the prefix sweep finds a sub-table colvis key the fallback cannot predict',
        async ({ page }) => {
            // `vz-mb-colvis-<pageType>` is derivable from `pageDefinitions`;
            // `vz-mb-colvis-<pageType>-sub-<safeId>` is built from a runtime
            // heading id and is not. That gap is the whole reason
            // `@grant GM_listValues` was added.
            await loadSeriesPage(page);
            const SUB_KEY = 'vz-mb-colvis-series-releases-sub-greetings-from-asbury-park';
            await seedGm(page, { [SUB_KEY]: '{"Length":false}' });

            const keys = await page.evaluate(() =>
                window.__saTest.workspaceKeys().map((k) => k.key));
            expect(keys, 'the sweep sees it').toContain(SUB_KEY);

            const exported = await exportConfig(page);
            expect(exported.workspace[SUB_KEY]).toBe('{"Length":false}');
        });

    test('without GM_listValues the fallback still derives the per-pageType keys',
        async ({ page }) => {
            // The grant is feature-detected exactly like GM_deleteValue, so a
            // consumer or environment without it degrades rather than throwing.
            // Deleting the stub is the only way to reach that arm: the harness
            // now provides GM_listValues on every load, so this branch is dead
            // code from every other test's point of view.
            await loadSeriesPage(page);
            const SUB_KEY = 'vz-mb-colvis-series-releases-sub-xyz';
            await seedGm(page, { [SUB_KEY]: '{"Length":false}' });

            const keys = await page.evaluate(() => {
                delete window.GM_listValues;
                return window.__saTest.workspaceKeys().map((k) => k.key);
            });

            // Derived from pageDefinitions, so both prefixes for a real
            // pageType are there…
            expect(keys).toContain('vz-mb-colvis-series-releases');
            expect(keys).toContain('vz-mb-colvis-touched-series-releases');
            // …and the fixed-name groups are unaffected either way.
            expect(keys).toContain('persistent-sa-hist-list');
            expect(keys).toContain(`${SCRIPT_ID}-col-widths`);
            // …but the sub-table key is genuinely unreachable, which is the
            // documented cost of the fallback rather than a bug in it.
            expect(keys, 'the fallback cannot invent a runtime heading id')
                .not.toContain(SUB_KEY);
        });

    test('the exporter resolves each key to the group the summary names',
        async ({ page }) => {
            // The summary dialog lists groups, not keys, because "14 keys
            // restored" does not answer "did my pinned filter list come
            // across". A key resolving to the wrong group mislabels that line
            // while every count stays right.
            await loadSeriesPage(page);
            await seedGm(page, WORKSPACE);

            const exported = await exportConfig(page);
            const summary = await importWorkspace(page, exported.workspace);

            expect(summary.byGroup).toMatchObject({
                pinned: 1,
                history: 1,
                colvis: 2,          // the state and its -touched- companion
                geometry: 2,
                dropdown: 1,
                dialog: 4,
                libprefs: 1,
            });
        });

    // ── Version compatibility ───────────────────────────────────────────────

    test('a schema_version 1 file imports cleanly and touches no workspace state',
        async ({ page }) => {
            // The live case, not a hypothesis: the published mirror is still at
            // 9.99.746, so every file a user already has is v1.
            await loadSeriesPage(page);
            await seedGm(page, { 'persistent-sa-hist-list': ['mine'] });

            const v1 = { _meta: { schema_version: 1 }, settings: { sa_max_page: '7' } };
            const settingsSummary = await page.evaluate(
                (p) => window.__saTest.applyConfigSettings(p.settings), v1);
            const wsSummary = await importWorkspace(page, v1.workspace);

            expect(settingsSummary.applied, 'the settings half is unchanged').toBe(1);
            expect(wsSummary).toMatchObject({ restored: 0, skipped: 0 });

            const after = await readGmValues(page, ['persistent-sa-hist-list', 'sa_max_page']);
            expect(after['persistent-sa-hist-list'], 'my own pinned list is left alone')
                .toEqual(['mine']);
            expect(after.sa_max_page).toBe(7);
        });

    test('a malformed workspace block is ignored rather than thrown on', async ({ page }) => {
        await loadSeriesPage(page);
        for (const bad of [null, 'a string', ['an', 'array'], 42]) {
            const summary = await importWorkspace(page, bad);
            expect(summary, `${JSON.stringify(bad)} produced an empty tally`)
                .toMatchObject({ restored: 0, skipped: 0 });
        }
    });

    // ── User-visible behaviour ──────────────────────────────────────────────

    test('a column hidden on another profile starts hidden here after an import',
        async ({ page }) => {
            // The test that would have caught the whole missing feature in the
            // wild, and the reason column visibility is in the block at all:
            // before this, moving to a second machine meant re-hiding columns
            // pageType by pageType.
            //
            // No reload is needed — `addColumnVisibilityToggle()` calls
            // `loadColVisState()` from the render, which reads GM storage live.
            // So the import has to come BEFORE the click, not after.
            await loadSeriesPage(page);
            await importWorkspace(page, {
                'vz-mb-colvis-series-releases': '{"Artist":false}',
                'vz-mb-colvis-touched-series-releases': '["Artist"]',
            });

            await showAll(page);

            const artistTh = page.locator(
                'table.tbl thead tr:first-child th[data-col-name="Artist"]');
            await expect(artistTh, 'the imported column visibility applied').toBeHidden();

            // Counter-guard: a page where every column were hidden would also
            // satisfy the assertion above.
            await expect(
                page.locator('table.tbl thead tr:first-child th[data-col-name="Release"]'),
                'an unconfigured column is untouched').toBeVisible();
        });

    test('a pinned filter list imported from a file is what the load dialog reads',
        async ({ page }) => {
            // The group F5 calls the sharp edge. `persistent-sa-hist-list` is
            // edited from inside the settings dialog (the 🔧 Edit Pinned Filter
            // List button), so a user has every reason to expect the file that
            // dialog writes to contain it — and before v2 it silently did not.
            //
            // Asserted through GM storage because that is what every reader
            // uses: `showLoadDialog()` and `_openEditPinnedFilterListFromSettings()`
            // both `GM_getValue('persistent-sa-hist-list', [])` at open time.
            await loadSeriesPage(page);
            await seedGm(page, { 'persistent-sa-hist-list': ['^local only'] });

            await importWorkspace(page, {
                'persistent-sa-hist-list': ['^Bruce', 'tour 1978', 'Live/1975'],
            });

            const after = await readGmValues(page, ['persistent-sa-hist-list']);
            expect(after['persistent-sa-hist-list'],
                'the file replaced the list, entry for entry')
                .toEqual(['^Bruce', 'tour 1978', 'Live/1975']);
            // Not merged, and not stringified: both are failure modes that
            // still leave a non-empty list in place.
            expect(Array.isArray(after['persistent-sa-hist-list'])).toBe(true);
            expect(after['persistent-sa-hist-list']).toHaveLength(3);
        });
});
