'use strict';

// VZ_MBLibrary's settings dialog: every entry point opens the same dialog, it
// says what a setting's default IS, it remembers where you were, and it can
// tell you what you have changed.
//
// ── Why this file exists at all ──────────────────────────────────────────────
//
// The dialog had NO test coverage before this — 238 settings, ~1200 lines of
// `showModal()`, and the only thing any spec had ever done with it was avoid
// it. org/config-handling.org F5 lists seven separate frictions found by
// reading that code; this covers six of them (the seventh, what the exported
// file leaves out, is a format change with its own branch).
//
// The fixture harness loads the REAL `lib/VZ_MBLibrary.user.js`, so these
// drive the shipping dialog against ShowAllEntityData's own 238-setting
// schema rather than a toy one.
//
// ── The entry-point tests use the real menu callbacks ────────────────────────
//
// `gmStubs.js` records every `GM_registerMenuCommand` in `window.__gmMenuCommands`
// with its callback, so a test can invoke the Tampermonkey menu item exactly
// as Tampermonkey would. That matters here more than usual: the bug was that
// THIS path and the Editing-menu link called `showModal()` with no arguments
// while the toolbar button called `showSettings({functionRegistry})`. A test
// that opened the dialog the convenient way would have passed throughout.
//
// ── What each assertion pins, and what would still pass without it ───────────
//
// Several of these have an obvious weaker form that proves nothing:
//
//   • "the dialog opens from the GM menu" passed BEFORE the fix. What was
//     missing is what is IN it, so these assert the 💾/📂 buttons and the
//     🔧 button's effect, never the overlay's existence.
//   • "a section is expanded after reopening" would also pass if every section
//     were expanded, so the same test asserts a sibling section is still
//     collapsed.
//   • "search shows matching rows" would pass on the old code too — it always
//     showed them. The defect was the 38 section headers left standing with
//     nothing under them, and a match revealed under a header still drawn
//     collapsed. So the assertions are about HEADERS and arrows.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage, FIXTURE_SETTINGS_OVERRIDE } = require('../support/loadPage');
const { collectPageErrors } = require('../support/liveAssertions');

const SERIES_URL = 'https://musicbrainz.org/series/aa3694d3-a3d0-48ed-8f07-5b576de87908';
const SERIES_SHELL = path.join(__dirname, '..', 'snapshots', 'series-releases', 'raw.html');

// Derived in the userscript as 'vz-mb-' + kebab-cased SCRIPT_BASE_NAME. Every
// test below asserts the overlay exists before doing anything else, so a
// change to that derivation fails loudly here rather than silently matching
// nothing.
const SID = 'vz-mb-show-all-entity-data';
const OVERLAY = `#${SID}-settings-overlay`;

// `data-section` carries the DIVIDER'S SCHEMA KEY, not its label — the schema
// keys its dividers `divider_<topic>` and the label is a separate field. Both
// are named here because a test that matched on the label would find nothing
// and report it as the feature being broken.
//   divider_             → "🛠️ GENERIC SETTINGS", holds sa_enable_debug_logging
//   divider_thresholds   → holds sa_max_page, used as the "other section"
const SECTION_A = 'divider_';

// `loadPage.js`'s FIXTURE_SETTINGS_OVERRIDE forces every one of its keys
// (artwork, the Relationships column, the link previews) OFF for every
// fixture, to keep the suite network-free once a spec clicks "Show all" or
// hovers a link. They all DEFAULT to true — so from this dialog's point of
// view a fixture profile arrives with that many settings already changed, and
// every count here would be off by that many while looking plausible. These
// tests never click "Show all" and never fetch, so putting them back at their
// defaults is safe and is what makes "an untouched profile" mean it. Each key
// is seeded as `undefined`, which JSON.stringify drops: nothing is stored and
// the schema default applies. Derived from the override, so a key added there
// can no longer leave this list behind (the five link-preview keys did, on
// 2026-10-08, when this was a hand-written copy of four).
const PRISTINE = Object.fromEntries(Object.keys(FIXTURE_SETTINGS_OVERRIDE).map((k) => [k, undefined]));

/** Loads the shell without clicking anything — the dialog needs no table. */
async function loadShell(page, settings) {
    await loadUserscriptPage(page, {
        url: SERIES_URL,
        fixtureFile: SERIES_SHELL,
        testMode: true,
        settingsOverride: { ...PRISTINE, ...(settings || {}) },
    });
}

/** Opens Settings the way Tampermonkey's own menu item does. */
async function openViaGmMenu(page) {
    const opened = await page.evaluate(() => {
        const cmds = Object.values(window.__gmMenuCommands || {});
        const entry = cmds.find(c => /Settings Manager/i.test(c.name));
        if (!entry) return false;
        entry.callback();
        return true;
    });
    expect(opened, 'the Tampermonkey settings menu command is registered').toBe(true);
    await page.waitForSelector(OVERLAY, { state: 'visible' });
}

/** Opens Settings from the link the library injects into MusicBrainz's Editing menu. */
async function openViaEditingMenu(page) {
    const link = page.locator(`#${SID}-menu-link`);
    await expect(link, 'the library injected its Editing-menu link').toHaveCount(1);
    await link.evaluate(el => el.click());   // the menu itself is not hover-expanded
    await page.waitForSelector(OVERLAY, { state: 'visible' });
}

/** Closes the dialog, accepting the discard prompt if one appears. */
async function closeDialog(page) {
    await page.click(`#${SID}-close`);
    const ok = page.getByRole('button', { name: 'OK', exact: true });
    if (await ok.isVisible().catch(() => false)) await ok.click();
    await page.waitForSelector(OVERLAY, { state: 'detached' }).catch(() => {});
}

/** The row element for one setting key. */
const rowFor = (page, key) => page.locator(`.vz-setting-row[data-vz-key="${key}"]`);

/** The section header element for one divider key. */
const headerFor = (page, section) =>
    page.locator(`.vz-section-header[data-section="${section}"]`);

test.describe('every settings entry point opens the same dialog', () => {
    let pageErrors;
    test.beforeEach(async ({ page }) => { pageErrors = collectPageErrors(page); });
    test.afterEach(() => { expect(pageErrors, 'no uncaught page errors').toEqual([]); });

    test('the Tampermonkey menu item gets the 💾/📂 configuration buttons',
        async ({ page }) => {
            // org/config-handling.org F5. This path called showModal() with no
            // arguments, so ShowAllEntityData's beforeOpen hook never ran and
            // its two buttons were never injected. The dialog opened perfectly
            // well, which is why nobody filed it.
            await loadShell(page);
            await openViaGmMenu(page);

            await expect(page.getByRole('button', { name: /Save configuration/ }))
                .toBeVisible();
            await expect(page.getByRole('button', { name: /Load configuration/ }))
                .toBeVisible();
        });

    test('the MusicBrainz Editing-menu link gets them too', async ({ page }) => {
        await loadShell(page);
        await openViaEditingMenu(page);

        await expect(page.getByRole('button', { name: /Save configuration/ }))
            .toBeVisible();
        await expect(page.getByRole('button', { name: /Load configuration/ }))
            .toBeVisible();
    });

    test('a type:function button actually calls its registered function',
        async ({ page }) => {
            // The other half of the same bug, and the one with no visible
            // symptom at all: without a functionRegistry the 🔧 button rendered
            // and did nothing when pressed.
            await loadShell(page);
            await openViaGmMenu(page);

            const fnRow = rowFor(page, 'sa_fn_edit_pinned_filter_list');
            await expect(fnRow, 'the function entry has a row').toHaveCount(1);
            // Its section starts collapsed; the button is still in the DOM and
            // clickable via a direct dispatch, which is what the registry wiring
            // is about — not the layout.
            await fnRow.locator('button.vz-fn-btn').evaluate(el => el.click());

            await expect(page.locator('#sa-edit-pin-list-dialog'),
                'clicking 🔧 opened the pinned-filter editor').toHaveCount(1);
        });

    test('a secret setting (the Discogs token) shows as dots, from either entry point, and still holds its value',
        async ({ page }) => {
            // U3 (org/iframe.org "What the answers change", 3): the library
            // renders every text setting alike; _maskSecretSettingInputs()
            // turns this one into a password input when the dialog opens.
            const TOKEN = 'secret-ShowAllEntityData-probe';
            const sel = `#${SID}-input-sa_pop_ext_discogs_token`;
            await loadShell(page, { sa_pop_ext_discogs_token: TOKEN });
            for (const open of [openViaGmMenu, openViaEditingMenu]) {
                await open(page);
                const input = page.locator(sel);
                await expect(input).toHaveAttribute('type', 'password');
                await expect(input).toHaveAttribute('autocomplete', 'off');
                await expect(input, 'SAVE reads .value, which a password input keeps').toHaveValue(TOKEN);
                await closeDialog(page);
            }
        });
});

test.describe('the Default column says what the default is', () => {
    let pageErrors;
    test.beforeEach(async ({ page }) => { pageErrors = collectPageErrors(page); });
    test.afterEach(() => { expect(pageErrors, 'no uncaught page errors').toEqual([]); });

    test('a table setting does not render the literal "undefined"', async ({ page }) => {
        // The five type:'table' settings carry no `default:` at all — rows are
        // seeded from code on first use — so `String(cfg.default)` printed
        // "undefined" in the column a user reads to decide whether to change
        // something.
        await loadShell(page);
        await openViaGmMenu(page);

        const cell = rowFor(page, 'sa_unicode_char_picker_mappings').locator('> div').nth(1);
        await expect(cell).not.toHaveText('undefined');
        await expect(cell).toContainText('seeded from code');
    });

    test('a function setting does not expose its internal method name',
        async ({ page }) => {
            await loadShell(page);
            await openViaGmMenu(page);

            const cell = rowFor(page, 'sa_fn_edit_pinned_filter_list').locator('> div').nth(1);
            await expect(cell).not.toContainText('_openEditPinnedFilterList');
            await expect(cell).toContainText('an action');
        });

    test('a popup_dialog setting shows its real default, not a format hint',
        async ({ page }) => {
            // It used to print the fixed placeholder "(pipe-sep.)" — the format
            // instead of the value — for the one type whose default is hardest
            // to reconstruct by hand.
            await loadShell(page);
            await openViaGmMenu(page);

            const row = page.locator('.vz-setting-row[data-vz-key]').filter({
                has: page.locator('button.vz-pd-toggle-btn'),
            }).first();
            await expect(row, 'the schema has at least one popup_dialog').toHaveCount(1);

            const cell = row.locator('> div').nth(1);
            await expect(cell).not.toContainText('pipe-sep');
            await expect(cell, 'the cell carries the stored default text')
                .not.toHaveText('');
        });
});

test.describe('"what have I changed?"', () => {
    let pageErrors;
    test.beforeEach(async ({ page }) => { pageErrors = collectPageErrors(page); });
    test.afterEach(() => { expect(pageErrors, 'no uncaught page errors').toEqual([]); });

    test('a non-default setting is marked, counted, and badged on its section',
        async ({ page }) => {
            await loadShell(page, { sa_enable_debug_logging: true });   // default false
            await openViaGmMenu(page);

            await expect(rowFor(page, 'sa_enable_debug_logging'))
                .toHaveClass(/vz-setting-changed/);
            await expect(page.locator(`#${SID}-changed-only-btn`)).toContainText('(1)');

            const badge = headerFor(page, SECTION_A).locator('.vz-section-changed-badge');
            await expect(badge, 'the section that holds it is badged').toHaveText('● 1');
        });

    test('an untouched profile marks nothing', async ({ page }) => {
        // The counter-guard. Without it, "the row is marked" would also pass if
        // every row were marked — which is exactly what a comparison that got
        // its types wrong would do across all 238.
        await loadShell(page);
        await openViaGmMenu(page);

        await expect(page.locator('.vz-setting-row.vz-setting-changed')).toHaveCount(0);
        await expect(page.locator('.vz-section-changed-badge:not([hidden])')).toHaveCount(0);
        await expect(page.locator(`#${SID}-changed-only-btn`)).not.toContainText('(');
    });

    test('"Changed only" shows exactly the changed rows', async ({ page }) => {
        await loadShell(page, { sa_enable_debug_logging: true });
        await openViaGmMenu(page);

        await page.click(`#${SID}-changed-only-btn`);

        const visible = page.locator('.vz-setting-row:visible');
        await expect(visible).toHaveCount(1);
        await expect(visible.first()).toHaveAttribute('data-vz-key', 'sa_enable_debug_logging');

        // And the 37 sections holding nothing changed are gone, not left
        // standing empty — the half of this that the old search got wrong.
        await expect(page.locator('.vz-section-header:visible')).toHaveCount(1);
    });

    test('the marks follow a live edit, without a save', async ({ page }) => {
        await loadShell(page);
        await openViaGmMenu(page);

        // Its section starts collapsed, so the widget is not clickable until
        // the section is opened — which is the flow a user takes, and is worth
        // going through rather than dispatching a synthetic click at a hidden
        // element.
        await headerFor(page, SECTION_A).click();
        await expect(rowFor(page, 'sa_enable_debug_logging')).toBeVisible();

        await expect(page.locator(`#${SID}-changed-only-btn`)).not.toContainText('(');
        await page.locator(`#${SID}-input-sa_enable_debug_logging`).click();
        await expect(page.locator(`#${SID}-changed-only-btn`)).toContainText('(1)');

        // …and back again, so this is a comparison and not a one-way flag.
        await page.locator(`#${SID}-input-sa_enable_debug_logging`).click();
        await expect(page.locator(`#${SID}-changed-only-btn`)).not.toContainText('(');
    });
});

test.describe('section state survives a close', () => {
    let pageErrors;
    test.beforeEach(async ({ page }) => { pageErrors = collectPageErrors(page); });
    test.afterEach(() => { expect(pageErrors, 'no uncaught page errors').toEqual([]); });

    test('a section left open is still open next time', async ({ page }) => {
        await loadShell(page);
        await openViaGmMenu(page);

        await headerFor(page, SECTION_A).click();
        await expect(rowFor(page, 'sa_enable_debug_logging')).toBeVisible();
        await closeDialog(page);

        await openViaGmMenu(page);
        await expect(rowFor(page, 'sa_enable_debug_logging'),
            'the section the user left open is open again').toBeVisible();

        // The counter-guard: "is expanded" would also pass if EVERYTHING were,
        // which is what a broken default would produce.
        const expanded = await page.locator('.vz-section-header[data-collapsed="false"]').count();
        expect(expanded, 'and only that one section is expanded').toBe(1);
    });

    test('a fresh profile still starts with everything collapsed', async ({ page }) => {
        await loadShell(page);
        await openViaGmMenu(page);

        await expect(page.locator('.vz-setting-row:visible')).toHaveCount(0);
        await expect(page.locator('.vz-section-header:visible').first()).toBeVisible();
    });
});

test.describe('search and collapse no longer fight', () => {
    let pageErrors;
    test.beforeEach(async ({ page }) => { pageErrors = collectPageErrors(page); });
    test.afterEach(() => { expect(pageErrors, 'no uncaught page errors').toEqual([]); });

    test('a match inside a collapsed section is revealed, and its header says so',
        async ({ page }) => {
            // The old behaviour: the row appeared while its header still drew
            // itself collapsed, because the search wrote row.style.display and
            // the collapse state wrote it too, last writer winning.
            await loadShell(page);
            await openViaGmMenu(page);

            await expect(rowFor(page, 'sa_enable_debug_logging')).toBeHidden();

            await page.fill(`#${SID}-search`, 'debug logging');
            await expect(rowFor(page, 'sa_enable_debug_logging')).toBeVisible();
            await expect(headerFor(page, SECTION_A),
                'its header is drawn expanded, not collapsed')
                .toHaveAttribute('data-collapsed', 'false');
        });

    test('sections with no match are hidden, not left standing empty',
        async ({ page }) => {
            await loadShell(page);
            await openViaGmMenu(page);

            const allHeaders = await page.locator('.vz-section-header').count();
            expect(allHeaders, 'the schema has many sections').toBeGreaterThan(10);

            await page.fill(`#${SID}-search`, 'debug logging');
            const shown = await page.locator('.vz-section-header:visible').count();
            expect(shown, 'only sections containing a match remain').toBeLessThan(allHeaders);
            expect(shown).toBeGreaterThan(0);
        });

    test('clearing the search restores the collapse state, it does not expand everything',
        async ({ page }) => {
            await loadShell(page);
            await openViaGmMenu(page);

            await page.fill(`#${SID}-search`, 'debug logging');
            await expect(rowFor(page, 'sa_enable_debug_logging')).toBeVisible();

            await page.click(`#${SID}-search-clear`);
            await expect(rowFor(page, 'sa_enable_debug_logging'),
                'back to collapsed, because that is where the user left it').toBeHidden();
            await expect(page.locator('.vz-setting-row:visible')).toHaveCount(0);
        });

    test('a search matching nothing says so', async ({ page }) => {
        await loadShell(page);
        await openViaGmMenu(page);

        await page.fill(`#${SID}-search`, 'zzzznotasetting');
        await expect(page.locator(`#${SID}-no-matches`)).toBeVisible();
        await expect(page.locator('.vz-section-header:visible')).toHaveCount(0);
    });
});

test.describe('SAVE only reloads when there is something to apply', () => {
    let pageErrors;
    test.beforeEach(async ({ page }) => { pageErrors = collectPageErrors(page); });
    test.afterEach(() => { expect(pageErrors, 'no uncaught page errors').toEqual([]); });

    test('saving an unchanged dialog does not reload the page', async ({ page }) => {
        await loadShell(page);
        await openViaGmMenu(page);

        // A marker that only a real navigation can destroy.
        await page.evaluate(() => { window.__notReloaded = true; });
        await page.click(`#${SID}-save-btn`);
        await page.waitForSelector(OVERLAY, { state: 'detached' });
        await page.waitForTimeout(300);

        expect(await page.evaluate(() => window.__notReloaded === true),
            'the page was not reloaded to apply nothing').toBe(true);
    });

    test('saving a real change does reload', async ({ page }) => {
        // The counter-guard, and the one that matters: a reload is how a saved
        // setting takes effect, so "never reload" would be a far worse bug than
        // the one being fixed.
        await loadShell(page);
        await openViaGmMenu(page);

        await headerFor(page, SECTION_A).click();
        await expect(rowFor(page, 'sa_enable_debug_logging')).toBeVisible();

        await page.evaluate(() => { window.__notReloaded = true; });
        await page.locator(`#${SID}-input-sa_enable_debug_logging`).click();
        await page.click(`#${SID}-save-btn`);
        await page.waitForFunction(() => window.__notReloaded === undefined, null,
            { timeout: 5000 });

        expect(await page.evaluate(() => window.GM_getValue('sa_enable_debug_logging', null)),
            'and the change really was stored').toBe(true);
    });
});

test.describe('per-section RESET', () => {
    let pageErrors;
    test.beforeEach(async ({ page }) => { pageErrors = collectPageErrors(page); });
    test.afterEach(() => { expect(pageErrors, 'no uncaught page errors').toEqual([]); });

    test('resets only its own section, and only what differs', async ({ page }) => {
        await loadShell(page, {
            sa_enable_debug_logging: true,        // 🐞 DEBUGGING
            sa_max_page: 7,                       // a different section
        });
        await openViaGmMenu(page);
        await expect(page.locator(`#${SID}-changed-only-btn`)).toContainText('(2)');

        await headerFor(page, SECTION_A).locator('.vz-section-reset').click();
        await page.getByRole('button', { name: 'OK', exact: true }).click();

        await expect(rowFor(page, 'sa_enable_debug_logging'))
            .not.toHaveClass(/vz-setting-changed/);
        await expect(rowFor(page, 'sa_max_page'),
            'the other section is untouched').toHaveClass(/vz-setting-changed/);
        await expect(page.locator(`#${SID}-changed-only-btn`)).toContainText('(1)');
    });

    test('it is widget-only — nothing reaches storage until SAVE', async ({ page }) => {
        // Same contract as the global RESET it was factored out of. A reset
        // that wrote immediately would make a mis-click unrecoverable.
        await loadShell(page, { sa_enable_debug_logging: true });
        await openViaGmMenu(page);

        await headerFor(page, SECTION_A).locator('.vz-section-reset').click();
        await page.getByRole('button', { name: 'OK', exact: true }).click();

        expect(await page.evaluate(() => window.GM_getValue('sa_enable_debug_logging', null)),
            'still stored — only the widget moved').toBe(true);
    });

    test('a section with nothing to reset says so instead of asking', async ({ page }) => {
        await loadShell(page);
        await openViaGmMenu(page);

        await headerFor(page, SECTION_A).locator('.vz-section-reset').click();
        await expect(page.getByText(/already at its default/)).toBeVisible();
    });

    test('pressing ↺ does not also toggle the section', async ({ page }) => {
        // The button lives inside the header, whose click handler collapses it.
        await loadShell(page);
        await openViaGmMenu(page);

        const before = await headerFor(page, SECTION_A).getAttribute('data-collapsed');
        await headerFor(page, SECTION_A).locator('.vz-section-reset').click();
        await page.getByRole('button', { name: 'OK', exact: true }).click().catch(() => {});

        expect(await headerFor(page, SECTION_A).getAttribute('data-collapsed'),
            'the section is where it was').toBe(before);
    });
});

// ── type: 'select' (VZ_MBLibrary 4.4.0) ──────────────────────────────────────
//
// Segmented buttons over a hidden input that carries the value under the usual
// widget id. Pinned on two real keys: sa_sidebar_inline_cards_open (string
// options) and sa_caa_small_img_size (NUMBER options, so "SAVE stores the
// typed value" is a different guarantee from "SAVE stores the button's
// data-value", which would be the string "500").
test.describe('type: select', () => {
    const SIDEBAR = 'divider_collabsable_sidebar';
    const CAA = 'divider_caa_pics';
    const KEY = 'sa_sidebar_inline_cards_open';
    const segs = (page, key) => rowFor(page, key).locator('.vz-seg-btn');
    const checked = (page, key) => rowFor(page, key).locator('.vz-seg-btn[aria-checked="true"]');
    const stored = (page, key) => page.evaluate((k) => {
        const v = window.GM_getValue(k, '__absent__');
        return { v, type: typeof v };
    }, key);
    let pageErrors;
    test.beforeEach(async ({ page }) => { pageErrors = collectPageErrors(page); });
    test.afterEach(() => { expect(pageErrors, 'no uncaught page errors').toEqual([]); });

    test('RENDER: one segment per option, the current one checked; Default shows the option label; the tooltip lists the choices', async ({ page }) => {
        await loadShell(page);
        await openViaGmMenu(page);
        await headerFor(page, SIDEBAR).click();
        await expect(rowFor(page, KEY)).toBeVisible();

        await expect(segs(page, KEY)).toHaveText(['No card', 'Information card', 'Every card']);
        await expect(checked(page, KEY)).toHaveText('Information card');
        await expect(checked(page, KEY), 'the checked segment is the group\'s tab stop').toHaveAttribute('tabindex', '0');
        await expect(page.locator(`#${SID}-input-${KEY}`)).toHaveValue('info');
        await expect(rowFor(page, KEY).locator('[data-vz-settings-col="2"]'), 'the label, not the stored word')
            .toHaveText('Information card');
        expect(await rowFor(page, KEY).locator('.vz-setting-label').getAttribute('title'))
            .toContain('Choices: No card · Information card · Every card');
        await expect(rowFor(page, KEY), 'an untouched select is not marked').not.toHaveClass(/vz-setting-changed/);
    });

    test('PICK + SAVE: a click marks the row changed, SAVE stores the option\'s TYPED value (number options as numbers)', async ({ page }) => {
        await loadShell(page);
        await openViaGmMenu(page);
        await headerFor(page, SIDEBAR).click();
        await headerFor(page, CAA).click();

        await segs(page, KEY).filter({ hasText: 'Every card' }).click();
        await expect(checked(page, KEY)).toHaveText('Every card');
        await expect(rowFor(page, KEY)).toHaveClass(/vz-setting-changed/);
        await segs(page, 'sa_caa_small_img_size').filter({ hasText: '500 px' }).click();
        await expect(rowFor(page, 'sa_caa_small_img_size')).toHaveClass(/vz-setting-changed/);

        await page.evaluate(() => { window.__notReloaded = true; });
        await page.click(`#${SID}-save-btn`);
        await page.waitForFunction(() => window.__notReloaded === undefined, null, { timeout: 5000 });
        expect(await stored(page, KEY)).toEqual({ v: 'all', type: 'string' });
        expect(await stored(page, 'sa_caa_small_img_size'), 'typed as the schema writes it').toEqual({ v: 500, type: 'number' });
    });

    test('RESET + SAVE: the section ↺ puts the segment back, and a default-equal SAVE deletes the stored key', async ({ page }) => {
        // Stored by hand, not through settingsOverride: the harness re-seeds
        // its overrides on every load, so the SAVE's reload would bring a
        // seeded 'none' straight back and hide the deletion. GM values outlive
        // a navigation; the second load is what reads this one.
        await loadShell(page);
        await page.evaluate((k) => window.GM_setValue(k, 'none'), KEY);
        await loadShell(page);
        await openViaGmMenu(page);
        await headerFor(page, SIDEBAR).click();
        await expect(checked(page, KEY)).toHaveText('No card');
        await expect(rowFor(page, KEY)).toHaveClass(/vz-setting-changed/);

        await headerFor(page, SIDEBAR).locator('.vz-section-reset').click();
        await page.getByRole('button', { name: 'OK', exact: true }).click();
        await expect(checked(page, KEY), 'the buttons follow the reset, not only the hidden input').toHaveText('Information card');
        await expect(page.locator(`#${SID}-input-${KEY}`)).toHaveValue('info');
        await expect(rowFor(page, KEY)).not.toHaveClass(/vz-setting-changed/);

        await page.evaluate(() => { window.__notReloaded = true; });
        await page.click(`#${SID}-save-btn`);
        await page.waitForFunction(() => window.__notReloaded === undefined, null, { timeout: 5000 });
        expect(await stored(page, KEY), 'at the default nothing is stored').toEqual({ v: '__absent__', type: 'string' });
    });

    test('KEYBOARD: arrows move the choice and the focus; Escape on a segment blurs it and keeps the dialog open', async ({ page }) => {
        await loadShell(page);
        await openViaGmMenu(page);
        await headerFor(page, SIDEBAR).click();
        // Escape FIRST, with nothing changed: there an unguarded Escape closes
        // the dialog outright (with a change it would only ask first).
        await checked(page, KEY).focus();
        await page.keyboard.press('Escape');
        await expect(page.locator(OVERLAY), 'Escape on a segment does not close the dialog').toBeVisible();
        expect(await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('vz-seg-btn')),
            'the segment lost focus').toBe(false);

        await checked(page, KEY).focus();
        await page.keyboard.press('ArrowRight');
        await expect(checked(page, KEY)).toHaveText('Every card');
        await expect(checked(page, KEY)).toBeFocused();
        await page.keyboard.press('ArrowRight');
        await expect(checked(page, KEY), 'wraps round').toHaveText('No card');
        await page.keyboard.press('End');
        await expect(checked(page, KEY)).toHaveText('Every card');
        await page.keyboard.press('Home');
        await expect(checked(page, KEY)).toHaveText('No card');
        await expect(rowFor(page, KEY)).toHaveClass(/vz-setting-changed/);
    });

    test('ON LOAD: stored values are put in canonical form ("500" → 500, " List " → "list"); a stray one is left for its reader', async ({ page }) => {
        await loadShell(page, {
            sa_caa_small_img_size: '500',      // stored while it was a number setting
            sa_caa_cell_layout: ' List ',      // stored by the old text box
            sa_art_viewer_pan: 'sideways',     // no option at all
        });
        const s = await page.evaluate(() => window.__saTest.selectSettings());
        expect(s.sa_caa_small_img_size).toEqual({ value: 500, type: 'number', read: 500 });
        expect(s.sa_caa_cell_layout).toEqual({ value: 'list', type: 'string', read: 'list' });
        expect(s.sa_art_viewer_pan, 'left as stored; _selectSetting() reads the default')
            .toEqual({ value: 'sideways', type: 'string', read: 'follow' });
    });

    test('STORED VALUES: one written by a text box is recognised; one that is no option shows and saves as the default', async ({ page }) => {
        await loadShell(page, { sa_caa_cell_layout: 'List ', [KEY]: 'bogus' });
        await openViaGmMenu(page);
        await headerFor(page, SIDEBAR).click();
        await headerFor(page, CAA).click();
        await expect(checked(page, 'sa_caa_cell_layout'), '"List " is the list option').toHaveText('List');
        await expect(rowFor(page, 'sa_caa_cell_layout')).toHaveClass(/vz-setting-changed/);
        await expect(checked(page, KEY), 'a stray value shows the default').toHaveText('Information card');

        await page.click(`#${SID}-save-btn`);
        await expect(page.locator(OVERLAY)).toHaveCount(0);
        await expect.poll(() => stored(page, 'sa_caa_cell_layout'), { message: 'saved in its canonical form' })
            .toEqual({ v: 'list', type: 'string' });
        await expect.poll(() => stored(page, KEY), { message: 'the stray value is gone' })
            .toEqual({ v: '__absent__', type: 'string' });
    });
});
