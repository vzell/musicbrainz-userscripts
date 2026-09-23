'use strict';

// A profile frozen by VZ_MBLibrary's old SAVE handler is repaired once, and
// only where there is evidence it was frozen.
//
// ── The bug ──────────────────────────────────────────────────────────────────
//
// org/config-handling.org F1. Until VZ_MBLibrary 4.1.0 the settings dialog's
// SAVE wrote EVERY key it rendered, on every save, whether or not anything had
// changed. `settingsInterface.init()` then reads
// `GM_getValue(key, configSchema[key].default)`, so a stored value shadows the
// schema for ever — and the first SAVE a user ever pressed, even having changed
// nothing, froze all ~232 settings into their profile. Every default shipped
// afterwards was invisible to them permanently.
//
// Ten settings have already diverged that way, and four keys are still stored
// after being dropped from the schema entirely. Both lists come from
// `scripts/dump-default-history.py`, which replays all 591 revisions of the
// userscript and diffs `configSchema`'s `default:` values — not from reading
// the current file, which cannot know what a default USED to be.
//
// ── Why every assertion here is about an ABSENCE ─────────────────────────────
//
// The migration only ever DELETES. A repaired profile and a profile that was
// never frozen are byte-identical: in both, the key is gone and `init()` hands
// back the schema default. So "the setting now reads 30" is not evidence of
// anything — it is what an untouched profile reads too. What distinguishes them
// is whether the GM KEY still exists, which is why these tests read GM storage
// directly rather than only `Lib.settings`.
//
// That is also why the counter-guards matter more than usual. Three of them:
//
//   • a value that was never a default must SURVIVE — otherwise "delete
//     everything" would pass every adoption test in this file;
//   • a value differing from a colour default only in CASE must be pruned,
//     because iro.js writes `#c2d2e9` where the schema says the same thing in
//     another case, and treating those as different would pin a colour for ever
//     the first time someone opened the picker;
//   • the pass must run ONCE — a user who sets a value back after the migration
//     keeps it, and a migration that re-fires would silently overrule them on
//     the next page load.
//
// ── Why the fixture seeds `sa_settings_migration_level: 0` ───────────────────
//
// `tests/support/loadPage.js` seeds that level at 9999 for every other spec, so
// a seeded setting is never mistaken for a frozen one — several specs seed
// `sa_auto_resize_columns: false`, which IS a retired default. This file opts
// back in, which is the only place that happens.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { collectPageErrors } = require('../support/liveAssertions');

const SERIES_URL = 'https://musicbrainz.org/series/aa3694d3-a3d0-48ed-8f07-5b576de87908';
const SERIES_SHELL = path.join(__dirname, '..', 'snapshots', 'series-releases', 'raw.html');

// A sentinel no setting can hold, so "absent" and "stored as undefined" stay
// distinguishable through `page.evaluate`'s JSON round trip — which turns a
// real `undefined` into `null` and would make the two look the same.
const ABSENT = '__ABSENT__';

/**
 * Loads the shell with `settings` seeded into GM storage. The migration runs
 * during load, exactly as it does for a real user — no "Show all" click is
 * needed, because none of this touches the rendered table.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object<string, *>} settings
 */
async function loadWithProfile(page, settings) {
    await loadUserscriptPage(page, {
        url: SERIES_URL,
        fixtureFile: SERIES_SHELL,
        testMode: true,
        settingsOverride: { sa_settings_migration_level: 0, ...settings },
    });
}

/** The raw GM value for `key`, or ABSENT when no key is stored. */
const gm = (page, key) =>
    page.evaluate(([k, sentinel]) => window.GM_getValue(k, sentinel), [key, ABSENT]);

// What the running script resolves `key` to — `Lib.settings[key]`, which the
// migration patches in place after deleting the GM key. Reading GM storage
// alone cannot tell a repaired profile from one where only the on-disk half
// was fixed and the in-memory copy still holds the frozen value.
const live = (page, key) =>
    page.evaluate((k) => window.__saTest.liveSetting(k), key);

test.describe('the one-time settings migration', () => {
    let pageErrors;

    test.beforeEach(async ({ page }) => {
        pageErrors = collectPageErrors(page);
    });

    test.afterEach(() => {
        expect(pageErrors, 'no uncaught page errors').toEqual([]);
    });

    test('a value frozen at a RETIRED default is cleared, so the key follows the schema again',
        async ({ page }) => {
            // `false` is what sa_sidebar_collapsed defaulted to until bfb8ac3
            // (9.99.888) flipped it. A profile still holding it is one a SAVE
            // froze before that release.
            await loadWithProfile(page, { sa_sidebar_collapsed: false });

            expect(await gm(page, 'sa_sidebar_collapsed'),
                'the frozen key is gone from GM storage, not rewritten').toBe(ABSENT);
            expect(await live(page, 'sa_sidebar_collapsed'),
                'and the live setting is now the current default').toBe(true);
        });

    test('a value that was NEVER a default survives untouched', async ({ page }) => {
        // The counter-guard, and the one that keeps the rest of this file
        // honest: without it, a migration that simply deleted every stored key
        // would pass every adoption assertion above and below.
        //
        // 17 is not a value this script has ever shipped for
        // sa_uniq_dropdown_visible_rows (8, then 30), so it can only be the
        // user's own.
        await loadWithProfile(page, { sa_uniq_dropdown_visible_rows: 17 });

        expect(await gm(page, 'sa_uniq_dropdown_visible_rows'),
            'a deliberate value is still stored').toBe(17);
    });

    test('a retired default is recognised through the settings dialog\'s string storage',
        async ({ page }) => {
            // Every non-checkbox widget hands back `input.value`, so a number
            // frozen by the dialog is the STRING "8", never 8. A migration that
            // compared with `===` would leave exactly the profiles it exists to
            // repair — the ones written by the SAVE handler — untouched.
            await loadWithProfile(page, { sa_uniq_dropdown_visible_rows: '8' });

            expect(await gm(page, 'sa_uniq_dropdown_visible_rows')).toBe(ABSENT);
            expect(await live(page, 'sa_uniq_dropdown_visible_rows')).toBe(30);
        });

    test('a colour is compared case-insensitively, in both directions', async ({ page }) => {
        // iro.js writes lowercase hex; the schema writes mixed case. A
        // case-sensitive comparison would (a) fail to recognise the retired
        // colour and (b) refuse to prune a value identical to the current
        // default, pinning it for ever the first time someone opened the
        // picker. Both halves in one load.
        await loadWithProfile(page, {
            sa_ui_row_hover_bg: '#E2E2E2',        // the RETIRED default, upper case
            sa_ui_thead_th_bg: '#BABABA',         // the CURRENT default, upper case
        });

        expect(await gm(page, 'sa_ui_row_hover_bg'),
            'the retired colour is recognised despite the case').toBe(ABSENT);
        expect(await live(page, 'sa_ui_row_hover_bg')).toBe('#c2d2e9');

        expect(await gm(page, 'sa_ui_thead_th_bg'),
            'and a value that only differs in case from the current default is pruned')
            .toBe(ABSENT);
    });

    test('a key already sitting at its CURRENT default is pruned', async ({ page }) => {
        // Pass 3. Nothing observable changes — `init()` falls back to the same
        // value — and it is the pass that actually fixes F1 going forward:
        // an absent key follows the schema, a stored one does not.
        await loadWithProfile(page, { sa_max_page: 50 });

        expect(await gm(page, 'sa_max_page')).toBe(ABSENT);
        expect(await live(page, 'sa_max_page'),
            'the effective value is unchanged, which is the point').toBe(50);
    });

    test('a key dropped from the schema is removed outright', async ({ page }) => {
        // sa_sort_progress_threshold left configSchema before 9.99.1129 and
        // nothing has read it since. GM_listValues is not granted, so no sweep
        // could have found it — only the git walk can.
        await loadWithProfile(page, { sa_sort_progress_threshold: 10000 });

        expect(await gm(page, 'sa_sort_progress_threshold')).toBe(ABSENT);
    });

    test('it runs once — a value set back afterwards is not overruled', async ({ page }) => {
        await loadWithProfile(page, { sa_sidebar_collapsed: false });
        expect(await gm(page, 'sa_sidebar_collapsed')).toBe(ABSENT);

        // The user decides they preferred the old behaviour.
        await page.evaluate(() => window.GM_setValue('sa_sidebar_collapsed', false));

        const second = await page.evaluate(() => window.__saTest.runSettingsMigration());
        expect(second, 'the pass declines to run again').toBeNull();
        expect(await gm(page, 'sa_sidebar_collapsed'),
            'and the value they chose is still there').toBe(false);
    });

    test('the whole step is reversible from the backup', async ({ page }) => {
        await loadWithProfile(page, {
            sa_sidebar_collapsed: false,     // adopted
            sa_max_page: 50,                 // pruned
            sa_sort_progress_threshold: 1,   // orphaned
        });

        expect(await gm(page, 'sa_sidebar_collapsed')).toBe(ABSENT);
        expect(await gm(page, 'sa_max_page')).toBe(ABSENT);
        expect(await gm(page, 'sa_sort_progress_threshold')).toBe(ABSENT);

        const restored = await page.evaluate(() => window.__saTest.undoSettingsMigration());
        expect(restored, 'every removed key comes back, not just the adopted one').toBe(3);

        expect(await gm(page, 'sa_sidebar_collapsed')).toBe(false);
        expect(await gm(page, 'sa_max_page')).toBe(50);
        expect(await gm(page, 'sa_sort_progress_threshold')).toBe(1);

        // The level is deliberately NOT reset: the user has said no, and
        // re-running the pass on the next load would undo their undo.
        const level = await page.evaluate(() => window.GM_getValue('sa_settings_migration_level', 0));
        expect(level, 'undo does not re-arm the migration').toBeGreaterThan(0);
    });

    test('nothing is written when there is nothing to repair', async ({ page }) => {
        // A fresh install. The level is still recorded — otherwise the pass
        // would re-run on every page load for ever — but no backup is left
        // behind to suggest something happened.
        await loadWithProfile(page, {});

        expect(await gm(page, 'sa_settings_migration_backup')).toBe(ABSENT);
        expect(await gm(page, 'sa_settings_migration_notice')).toBe(ABSENT);
        expect(await gm(page, 'sa_settings_migration_level')).toBeGreaterThan(0);
    });
});

test.describe('the migration notice', () => {
    let pageErrors;

    test.beforeEach(async ({ page }) => {
        pageErrors = collectPageErrors(page);
    });

    test.afterEach(() => {
        expect(pageErrors, 'no uncaught page errors').toEqual([]);
    });

    test('names the settings that changed, and only those', async ({ page }) => {
        await loadWithProfile(page, {
            sa_sidebar_collapsed: false,     // adopted — must be named
            sa_max_page: 50,                 // pruned  — must NOT be named
        });

        const notice = page.locator('#mb-settings-migration-notice');
        await expect(notice).toBeVisible();

        const items = await notice.locator('li').allTextContents();
        expect(items, 'one line per adopted setting').toHaveLength(1);
        expect(items[0]).toContain('false');
        expect(items[0]).toContain('true');

        // A pruned key changes nothing the user can see, so listing it would
        // make the notice read as a bigger event than it is. It is counted in
        // the footnote instead.
        expect(items[0]).not.toContain('sa_max_page');
        await expect(notice.locator('.mb-smn-note')).toContainText('1 other setting');
    });

    test('does not appear when the migration only pruned', async ({ page }) => {
        // Pass 3 alone changes nothing observable. A notice for it would train
        // the user to dismiss notices.
        await loadWithProfile(page, { sa_max_page: 50 });

        expect(await gm(page, 'sa_max_page')).toBe(ABSENT);
        await expect(page.locator('#mb-settings-migration-notice')).toHaveCount(0);

        // Both halves, because there are two guards and the DOM one covers for
        // the other: `_showSettingsMigrationNotice()` also bails on an empty
        // `adopted`, so a migration that WROTE a notice record for a prune-only
        // run would still render nothing here and look correct. Asserting the
        // record is what makes that mutation visible — and a stored record is
        // not harmless, because it is what survives to the next page load.
        expect(await gm(page, 'sa_settings_migration_notice'),
            'and no notice record is left to fire on the next page load').toBe(ABSENT);
    });

    test('✓ Keep dismisses it for good', async ({ page }) => {
        await loadWithProfile(page, { sa_sidebar_collapsed: false });

        await page.click('#mb-smn-dismiss');
        await expect(page.locator('#mb-settings-migration-notice')).toHaveCount(0);

        // Driven by a GM key rather than a session flag, so the notice survives
        // navigation until it is read — and, once dismissed, does not come back.
        expect(await gm(page, 'sa_settings_migration_notice')).toBe(ABSENT);
    });

    test('↩︎ Undo restores the profile', async ({ page }) => {
        await loadWithProfile(page, { sa_sidebar_collapsed: false });

        await page.click('#mb-smn-undo');
        await page.waitForLoadState('domcontentloaded');

        expect(await gm(page, 'sa_sidebar_collapsed'),
            'the value is back, and the reload has applied it').toBe(false);
    });
});

test.describe('VZ_MBLibrary\'s dirty-set SAVE', () => {
    let pageErrors;

    test.beforeEach(async ({ page }) => {
        pageErrors = collectPageErrors(page);
    });

    test.afterEach(() => {
        expect(pageErrors, 'no uncaught page errors').toEqual([]);
    });

    test('a value equal to the schema default is CLEARED, not stored', async ({ page }) => {
        // The library half, on the live instance. Before 4.1.0 this loop wrote
        // every key it was handed, which is how one SAVE froze a whole profile.
        await loadWithProfile(page, {});

        const report = await page.evaluate(() => window.__saTest.libPersistSettings({
            sa_max_page: 50,                          // the default — cleared
            sa_global_filter_highlight_bg: '#FF0000', // a real choice — stored
        }));

        expect(report).toEqual({ stored: 1, cleared: 1 });
        expect(await gm(page, 'sa_max_page')).toBe(ABSENT);
        expect(await gm(page, 'sa_global_filter_highlight_bg')).toBe('#FF0000');
    });

    test('a number arriving as a STRING is still recognised as the default',
        async ({ page }) => {
            // This is the case the dialog actually produces: `input.value` is
            // always a string, so a `type: 'number'` default of 50 comes back
            // as "50". A strict comparison would store every numeric setting on
            // every save — which is most of what freezing a profile consisted
            // of.
            await loadWithProfile(page, {});

            const report = await page.evaluate(() => window.__saTest.libPersistSettings({
                sa_max_page: '50',
            }));

            expect(report).toEqual({ stored: 0, cleared: 1 });
            expect(await gm(page, 'sa_max_page')).toBe(ABSENT);
        });

    test('a checkbox compares as a boolean, whichever way it arrives', async ({ page }) => {
        await loadWithProfile(page, {});

        const report = await page.evaluate(() => window.__saTest.libPersistSettings({
            sa_enable_barcode_highlight: 'true',   // string form of the default
            sa_sidebar_collapsed: false,           // genuinely off the default
        }));

        expect(report).toEqual({ stored: 1, cleared: 1 });
        expect(await gm(page, 'sa_enable_barcode_highlight')).toBe(ABSENT);
        expect(await gm(page, 'sa_sidebar_collapsed')).toBe(false);
    });
});

test.describe('📂 Load configuration applies the same rule', () => {
    let pageErrors;

    test.beforeEach(async ({ page }) => {
        pageErrors = collectPageErrors(page);
    });

    test.afterEach(() => {
        expect(pageErrors, 'no uncaught page errors').toEqual([]);
    });

    test('an imported value equal to the default is left unstored', async ({ page }) => {
        // Without this the importer is a back door straight back into F1: the
        // exported file is a FULL DUMP of all ~232 importable keys, so one
        // 📂 Load would re-freeze every setting the migration had just freed.
        await loadWithProfile(page, {});

        const report = await page.evaluate(() => window.__saTest.applyConfigSettings({
            sa_max_page: 50,                          // the default
            sa_global_filter_highlight_bg: '#123456', // a real choice
        }));

        expect(report.applied, 'both are applied — the file\'s value is in effect either way')
            .toBe(2);
        expect(report.pruned, 'one of them without being stored').toBe(1);
        expect(await gm(page, 'sa_max_page')).toBe(ABSENT);
        expect(await gm(page, 'sa_global_filter_highlight_bg')).toBe('#123456');
    });

    test('a table setting is never pruned', async ({ page }) => {
        // The five `type: 'table'` keys carry no `default:` at all, so there is
        // nothing to compare against — and their rows are the most valuable
        // thing in the file (org/config-handling.org F3).
        await loadWithProfile(page, {});

        const rows = [['discogs', 'discogs-icon']];
        const report = await page.evaluate((r) => window.__saTest.applyConfigSettings({
            sa_rel_other_db_classes: r,
        }), rows);

        expect(report.pruned).toBe(0);
        expect(await gm(page, 'sa_rel_other_db_classes')).toEqual(rows);
    });
});
