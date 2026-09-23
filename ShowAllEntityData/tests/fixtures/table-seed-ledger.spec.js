'use strict';

// The five `type: 'table'` settings, and rows shipped in a later version.
// org/config-handling.org F1's closing note — the last item in that file.
//
// ── The defect ──────────────────────────────────────────────────────────────
//
// All five are lazy-seeded from code on FIRST USE and never reconsult the
// built-ins, so a row added in a later version reaches nobody who already has
// the table. The only escape has been to empty the table in the editor, save
// and reload — which throws away every row you entered by hand to get one you
// did not.
//
// F1 called it unsolvable and was right about the reason: "merging built-in
// rows into stored ones cannot tell 'the user deleted this row' from 'the user
// has never seen it', and unlike the scalar case there is no historical value
// to recognise — a row is not a default."
//
// The answer is to stop inferring it and start RECORDING it. The ledger holds,
// per table, every built-in row key this profile has been offered.
//
// ── Why these tests have to manufacture the situation ───────────────────────
//
// Measured over all 623 revisions of the userscript by
// `scripts/dump-table-seed-history.py`: the built-in tables have NEVER gained
// or lost a row. So there is no version of this script in which a row actually
// arrives, and no fixture can produce one by loading a page. Every test here
// works the same way — put the profile in the state a future version would
// create (stored rows plus a ledger that is missing a key), then run the pass
// and ask what it did.
//
// That is also why the pass is worth having NOW: today's built-ins are exactly
// what every existing profile was seeded from, so recording them as "already
// offered" is a fact rather than a bet. After the first row ships it would be
// a guess forever.
//
// ── What each assertion pins ────────────────────────────────────────────────
//
// The two halves of the ledger are separate guarantees and are tested apart,
// because a mechanism that only does one of them is a plausible and much worse
// thing to ship:
//
//   • a key in NEITHER the ledger nor the rows is new, and arrives;
//   • a key in the LEDGER but not the rows was deleted on purpose, and must
//     never come back. A merge that skipped this would resurrect deletions on
//     every page load, silently, forever.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { collectPageErrors } = require('../support/liveAssertions');

const SERIES_URL = 'https://musicbrainz.org/series/aa3694d3-a3d0-48ed-8f07-5b576de87908';
const SERIES_SHELL = path.join(__dirname, '..', 'snapshots', 'series-releases', 'raw.html');
const SERIES_LABEL = 'Show all Releases for Series';
const SERIES_GLOB = 'https://musicbrainz.org/series/**';

const LEDGER = 'sa_table_seed_ledger';
const NOTICE = 'sa_table_seed_notice';

// The table used for most of these: additive, never announced, and its
// built-ins are a plain object so a test can reason about them directly.
const URL_ICONS = 'sa_rel_url_icon_classes';
// The one table whose additions DO announce themselves, because a new row
// there hides a column.
const HIDDEN_COLS = 'sa_default_hidden_columns';

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

async function showAll(page) {
    await page.click(`button[data-label="${SERIES_LABEL}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

const readGm = (page, key) =>
    page.evaluate((k) => window.GM_getValue(k, null), key);

const writeGm = (page, key, value) =>
    page.evaluate(([k, v]) => window.GM_setValue(k, v), [key, value]);

const seedPass = (page) =>
    page.evaluate(() => window.__saTest.seedNewTableRows());

const ledger = (page) =>
    page.evaluate(() => window.__saTest.tableSeedLedger());

/**
 * Puts the profile in the state a FUTURE version creates: real stored rows,
 * and a ledger that has not heard of `missing`.
 *
 * Deleting the key from the ledger is how a test says "this row is new" —
 * there is no other way, since the built-ins cannot be edited from the page.
 */
async function pretendRowIsNew(page, tableKey, missing) {
    const current = await ledger(page);
    const entry = (current && current[tableKey]) || [];
    await writeGm(page, LEDGER, {
        ...(current || {}),
        [tableKey]: entry.filter((k) => k !== missing),
    });
}

test.describe('built-in lookup-table rows shipped in a later version', () => {
    let pageErrors;

    test.beforeEach(async ({ page }) => {
        pageErrors = collectPageErrors(page);
        await loadSeriesPage(page);
    });

    test.afterEach(() => {
        expect(pageErrors, 'no uncaught page errors').toEqual([]);
    });

    // ── The ledger itself ───────────────────────────────────────────────────

    test('a profile with stored rows and no ledger adopts the built-ins, adding nothing',
        async ({ page }) => {
            // The upgrade path for every profile that exists today, and the
            // one case where being exact instead of cautious is possible: the
            // built-ins have never changed, so today's keys ARE what this
            // profile was seeded with.
            const rows = [['discogs', 'my-own-icon'], ['imdb', 'imdb']];
            await writeGm(page, URL_ICONS, rows);
            await page.evaluate((k) => window.GM_deleteValue(k), LEDGER);

            const summary = await seedPass(page);
            expect(summary.offered, 'nothing was added to a pre-ledger profile').toBe(0);
            expect(await readGm(page, URL_ICONS), 'the rows are untouched').toEqual(rows);

            const led = await ledger(page);
            expect(led[URL_ICONS], 'every built-in key is now recorded as offered')
                .toContain('discogs');
            expect(led[URL_ICONS]).toContain('wikidata');
            // The point of the adoption: a key the profile does NOT have is
            // still recorded, so it is never handed back.
            expect(led[URL_ICONS]).toContain('lyrics');
        });

    test('a built-in row the profile has never been offered is added', async ({ page }) => {
        await writeGm(page, URL_ICONS, [['discogs', 'discogs']]);
        await seedPass(page);                       // establishes the ledger
        await pretendRowIsNew(page, URL_ICONS, 'vgmdb');

        const summary = await seedPass(page);
        expect(summary.offered).toBe(1);
        expect(summary.byTable[URL_ICONS]).toEqual(['vgmdb → vgmdb']);

        const rows = await readGm(page, URL_ICONS);
        expect(rows, 'the new row was appended').toContainEqual(['vgmdb', 'vgmdb']);
        expect(rows[0], 'the existing row stayed first').toEqual(['discogs', 'discogs']);

        // And it is recorded, so it is offered exactly once.
        expect((await ledger(page))[URL_ICONS]).toContain('vgmdb');
        expect((await seedPass(page)).offered, 'a second pass offers nothing').toBe(0);
    });

    test('a built-in row the user DELETED is never handed back', async ({ page }) => {
        // The half F1 said was impossible, and the half that makes the whole
        // mechanism safe. Without it, every page load would resurrect a row
        // the user removed on purpose — silently, and forever.
        await writeGm(page, URL_ICONS, [['discogs', 'discogs'], ['imdb', 'imdb']]);
        await seedPass(page);           // ledger now holds ALL built-in keys

        const rows = await readGm(page, URL_ICONS);
        expect(rows, 'the profile is missing built-ins it once had').toHaveLength(2);

        const summary = await seedPass(page);
        expect(summary.offered, 'nothing came back').toBe(0);
        expect(await readGm(page, URL_ICONS)).toEqual(rows);
    });

    test('a row the user added by hand is not duplicated when it becomes a built-in',
        async ({ page }) => {
            // Not the same check as the ledger one, and a separate mutation
            // covers it: a duplicate key would give `_loadMap()`'s
            // last-writer-wins loop two rows for one key and silently override
            // the value the user typed.
            await writeGm(page, URL_ICONS, [['vgmdb', 'my-custom-vgmdb-icon']]);
            await seedPass(page);
            await pretendRowIsNew(page, URL_ICONS, 'vgmdb');

            const summary = await seedPass(page);
            expect(summary.offered, 'their row already covers that key').toBe(0);

            const rows = await readGm(page, URL_ICONS);
            expect(rows).toHaveLength(1);
            expect(rows[0][1], 'their own value survived').toBe('my-custom-vgmdb-icon');
        });

    test('an empty table is left to the lazy seeder, and still recorded', async ({ page }) => {
        // "Empty" means never used, or emptied in the editor — which is the
        // documented escape hatch for exactly this problem. The lazy seeder
        // owns that case and always writes the FULL current built-in set, so
        // this pass must not write a partial one beside it.
        await writeGm(page, URL_ICONS, []);
        await page.evaluate((k) => window.GM_deleteValue(k), LEDGER);

        const summary = await seedPass(page);
        expect(summary.offered).toBe(0);
        expect(await readGm(page, URL_ICONS), 'still empty — the seeder writes it')
            .toEqual([]);
        expect((await ledger(page))[URL_ICONS], 'but the built-ins are recorded')
            .toContain('discogs');
    });

    test('the PAGE LOAD covers all five tables, not just the named constants',
        async ({ page }) => {
            // Three of the five had their built-ins written out inline inside
            // `_initRelMappings()`, duplicated from the `let REL_*` defaults —
            // two copies thousands of lines apart with nothing keeping them
            // equal. They are one constant each now, which is what let all
            // five go through one registry.
            //
            // **Read the ledger WITHOUT calling the hook first, and that is
            // the entire point of this test.** Every other test here drives
            // `__saTest.seedNewTableRows()`, which runs after the whole IIFE
            // has evaluated and therefore succeeds no matter where the
            // production call sits. So they cannot see the mistake this design
            // invites: the pass reads constants declared far below the startup
            // block, and calling it there puts all five in the temporal dead
            // zone. `node --check` cannot see it either — the TDZ is a runtime
            // rule, not a syntax one — and the try/catch around `rows()` makes
            // it SILENT, skipping every table with only an off-by-default
            // warning. Mutation-testing is what established that: a mutation
            // moving the call passed twice before this test read the ledger
            // the LOAD produced rather than the one a hook call produced.
            const led = await ledger(page);
            expect(led, 'the pass ran during page load').not.toBeNull();
            expect(Object.keys(led || {}).sort()).toEqual([
                'sa_default_hidden_columns',
                'sa_rel_other_db_classes',
                'sa_rel_streaming_classes',
                'sa_rel_url_icon_classes',
                'sa_unicode_char_picker_mappings',
            ]);
            // A floor per table, so an empty array cannot pass as "covered".
            expect(led.sa_unicode_char_picker_mappings.length).toBeGreaterThan(10);
            expect(led.sa_rel_streaming_classes.length).toBeGreaterThan(10);

            // `unreadable` is the same guarantee from the other side, and is
            // what a future registry entry pointing at a constant that does
            // not exist would trip. It is NOT what catches a moved call — the
            // hook always runs late enough to read everything.
            expect((await seedPass(page)).unreadable,
                'every table\'s built-ins were readable').toBe(0);
        });

    // ── The notice ──────────────────────────────────────────────────────────

    test('an additive table adds its row silently', async ({ page }) => {
        // Four of the five are invisible until you go looking — a character in
        // the Unicode picker, an icon for a relationship you may never meet. A
        // banner for those is a banner people learn to dismiss unread.
        await writeGm(page, URL_ICONS, [['discogs', 'discogs']]);
        await seedPass(page);
        await pretendRowIsNew(page, URL_ICONS, 'vgmdb');

        expect((await seedPass(page)).offered).toBe(1);
        expect(await readGm(page, NOTICE), 'no notice was queued').toBeNull();
    });

    test('a new hidden-columns row announces itself, and can be undone', async ({ page }) => {
        // The one table where a new row changes what the page does: a column
        // disappears. With nothing on screen saying why, that reads as a bug.
        //
        // NOTE the second `loadSeriesPage()` rather than `page.reload()`.
        // `loadPage.js` injects the userscript with `addScriptTag` AFTER
        // `goto`, so a reload brings back the page WITHOUT the script — the
        // notice would never be rendered and the timeout reads as the feature
        // being broken. GM storage survives either way (the stub is backed by
        // localStorage through a context-level init script), which is what
        // makes the two-load shape work at all.
        await writeGm(page, HIDDEN_COLS, [['some-other-page', '"Foo"']]);
        await seedPass(page);
        await pretendRowIsNew(page, HIDDEN_COLS, 'release-tracks');

        const summary = await seedPass(page);
        expect(summary.offered).toBe(1);
        expect(summary.byTable[HIDDEN_COLS][0]).toMatch(/hidden by default on release-tracks/);
        expect(await readGm(page, NOTICE), 'a notice was queued').not.toBeNull();

        // Load #2 renders it, so the real banner and the real button are what
        // this drives — not a hand-built element.
        await loadSeriesPage(page);
        await page.waitForSelector('#mb-table-seed-notice', { state: 'visible' });
        await expect(page.locator('#mb-table-seed-notice')).toContainText('release-tracks');

        await page.click('#mb-tsn-undo');           // ends in location.reload()
        await page.waitForLoadState('domcontentloaded');

        expect(await readGm(page, HIDDEN_COLS), 'the added row is gone')
            .toEqual([['some-other-page', '"Foo"']]);
        expect(await readGm(page, NOTICE), 'and the notice is cleared').toBeNull();

        // …and it is NOT offered again, exactly as the migration undo keeps its
        // level: a pass that forgot would undo the user's undo on the next load.
        await loadSeriesPage(page);
        expect((await ledger(page))[HIDDEN_COLS]).toContain('release-tracks');
        expect((await seedPass(page)).offered, 'and stays gone').toBe(0);
        expect(await readGm(page, HIDDEN_COLS)).toEqual([['some-other-page', '"Foo"']]);
    });

    test('✓ Keep dismisses the notice without touching the rows', async ({ page }) => {
        await writeGm(page, HIDDEN_COLS, [['some-other-page', '"Foo"']]);
        await seedPass(page);
        await pretendRowIsNew(page, HIDDEN_COLS, 'release-tracks');
        await seedPass(page);

        await loadSeriesPage(page);
        await page.waitForSelector('#mb-table-seed-notice', { state: 'visible' });
        await page.click('#mb-tsn-dismiss');
        await expect(page.locator('#mb-table-seed-notice')).toHaveCount(0);

        expect(await readGm(page, NOTICE), 'the queue is cleared').toBeNull();
        expect(await readGm(page, HIDDEN_COLS), 'the row is kept')
            .toContainEqual(['release-tracks', '"ARs"']);
    });

    test('the notice does not come back on the next load after Keep', async ({ page }) => {
        // The queue is a GM key rather than a session flag so that navigating
        // away before reading it does not lose it — which is only safe because
        // dismissing actually clears it.
        await writeGm(page, HIDDEN_COLS, [['some-other-page', '"Foo"']]);
        await seedPass(page);
        await pretendRowIsNew(page, HIDDEN_COLS, 'release-tracks');
        await seedPass(page);

        await loadSeriesPage(page);
        await page.click('#mb-tsn-dismiss');

        await loadSeriesPage(page);
        await expect(page.locator('#mb-table-seed-notice')).toHaveCount(0);
    });

    test('a queued notice survives navigating away without reading it', async ({ page }) => {
        // The counter-guard for the test above: a queue that cleared itself on
        // render would satisfy "does not come back" while losing the message
        // for anyone who clicked a link before noticing it.
        await writeGm(page, HIDDEN_COLS, [['some-other-page', '"Foo"']]);
        await seedPass(page);
        await pretendRowIsNew(page, HIDDEN_COLS, 'release-tracks');
        await seedPass(page);

        await loadSeriesPage(page);
        await page.waitForSelector('#mb-table-seed-notice', { state: 'visible' });
        await loadSeriesPage(page);                 // navigate away, unread
        await expect(page.locator('#mb-table-seed-notice')).toBeVisible();
    });

    // ── It reaches the feature, not just storage ────────────────────────────

    test('a newly-offered hidden-columns row actually hides the column',
        async ({ page }) => {
            // The end-to-end half. Everything above is about GM storage; this
            // is what the user sees, and it goes through the real render tail,
            // where `_seedDefaultHiddenColumnsForPageType()` reads the table
            // live.
            //
            // The row arrives through the SHIPPING pass, not by writing the
            // table directly — writing it would test `loadColVisState()` and
            // prove nothing about the ledger. `series-releases` is this
            // fixture's own pageType, and its built-in row is for
            // `release-tracks`, so the row is manufactured the only way a test
            // can: seed it, record the built-ins, then drop the key from the
            // ledger and let the pass decide it is new.
            await writeGm(page, HIDDEN_COLS, [['series-releases', '"Artist"']]);
            await seedPass(page);
            await page.evaluate((k) => {
                const led = window.GM_getValue(k, {}) || {};
                led['sa_default_hidden_columns'] = [];
                window.GM_setValue(k, led);
                // Remove the row again so the pass has something to re-offer.
                window.GM_setValue('sa_default_hidden_columns', [['other-page', '"Foo"']]);
            }, LEDGER);

            const summary = await seedPass(page);
            expect(summary.offered, 'the pass offered the built-in row').toBe(1);

            // A new load so the render tail reads the table the pass wrote.
            await loadSeriesPage(page);
            await showAll(page);
            await expect(
                page.locator('table.tbl thead tr:first-child th[data-col-name="ARs"]'),
                'the offered row took effect').toHaveCount(0);
            await expect(
                page.locator('table.tbl thead tr:first-child th[data-col-name="Release"]'),
                'and the rest of the table is intact').toBeVisible();
        });
});
