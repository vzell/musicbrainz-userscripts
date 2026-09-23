'use strict';

// VZ_MBLibrary 4.3.0 — the settings dialog's header band, and tooltips.
//
// ── Why the version numbers are load-bearing, not decoration ────────────────
//
// A `@require`d library has NO entry of its own in Tampermonkey's installed-
// scripts list, so before this there was nowhere at all to read which library
// a script was actually running against. That is not a theoretical gap:
// ShowAllEntityData 9.99.1138 shipped against library 4.0.0 for anyone who
// installed from the published mirror, and 4.1.0's dirty-set SAVE and 4.2.0's
// whole dialog rewrite simply did not run — with no error, and a dialog that
// looked entirely normal. org/config-handling.org F6 and the `@require`
// PUBLISHING note in the userscript header are both about that pairing.
//
// So the chip is asserted as a NUMBER matched against `LIBRARY_VERSION`, never
// as "a chip exists". A hardcoded or stale string would satisfy the weak form
// while being exactly the defect the chip exists to expose.
//
// ── Why tooltips get real tests ─────────────────────────────────────────────
//
// A `title` is invisible until hovered, so it rots in total silence — nothing
// renders differently, no console warning, no layout change. The two that
// carry information available NOWHERE else in the UI are asserted by content:
//
//   • the GM STORAGE KEY on every settings row. Nothing else in the dialog
//     shows it, and it is what someone hand-editing an exported config file is
//     looking for (org/config-handling.org's whole export half is keyed by it).
//   • "Collapse all"'s reason for being disabled while a filter is running. A
//     dead control with no explanation is precisely the class of friction F5
//     is a list of.
//
// The rest are asserted as "every interactive element in the header has one",
// which is the guarantee that actually matters and which survives rewording.

const path = require('path');
const fs = require('fs');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { collectPageErrors } = require('../support/liveAssertions');

const SERIES_URL = 'https://musicbrainz.org/series/aa3694d3-a3d0-48ed-8f07-5b576de87908';
const SERIES_SHELL = path.join(__dirname, '..', 'snapshots', 'series-releases', 'raw.html');

const SID = 'vz-mb-show-all-entity-data';
const OVERLAY = `#${SID}-settings-overlay`;

// Same reasoning as settings-dialog.spec.js's own PRISTINE: the fixture
// harness forces two settings OFF that both default to true, so an untouched
// profile would otherwise arrive with two changes already on the counter.
const PRISTINE = {
    sa_enable_caa_pics: true,
    sa_enable_relationships_column: true,
};

/**
 * The library's own `LIBRARY_VERSION`, read from the file the harness loads.
 *
 * Read rather than hardcoded so the assertion keeps its meaning after a bump:
 * a literal here would have to be edited in lockstep with the library, and the
 * edit that gets forgotten is the one that turns this into a test of nothing.
 */
function libraryVersionNumber() {
    const libPath = path.join(__dirname, '..', '..', '..', 'lib', 'VZ_MBLibrary.user.js');
    const src = fs.readFileSync(libPath, 'utf8');
    const m = src.match(/const LIBRARY_VERSION = '([^']+)'/);
    expect(m, 'LIBRARY_VERSION is declared in the library').not.toBeNull();
    return m[1].split('+')[0];
}

async function loadShell(page, settings) {
    await loadUserscriptPage(page, {
        url: SERIES_URL,
        fixtureFile: SERIES_SHELL,
        testMode: true,
        settingsOverride: { ...PRISTINE, ...(settings || {}) },
    });
}

/** Opens Settings the way Tampermonkey's own menu item does. */
async function openSettings(page) {
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

const rowFor = (page, key) => page.locator(`.vz-setting-row[data-vz-key="${key}"]`);

/**
 * Expands the section holding a setting, so its widget can be clicked.
 *
 * Sections start collapsed on a fresh profile, and a widget inside a collapsed
 * one is a 0x0 element Playwright waits 90 s for and then reports as "not
 * visible" — which reads as a broken dialog rather than a closed section.
 */
async function expandSectionFor(page, key) {
    const section = await rowFor(page, key).getAttribute('data-section');
    await page.locator(`.vz-section-header[data-section="${section}"]`).click();
    await expect(rowFor(page, key)).toBeVisible();
}

/**
 * Where the drag handler actually writes: `container.style.left/top`.
 *
 * Asserted instead of a bounding box because a box moves for reasons that have
 * nothing to do with dragging — a chip appearing re-wraps the header and shifts
 * a centred dialog, a scrollbar narrows the viewport by a few pixels. Reading
 * the property the handler sets tests the guard rather than the layout, and a
 * dialog that has never been dragged has both as the empty string.
 */
const dragOffset = (page) =>
    page.locator(`#${SID}-config-container`).evaluate(
        (el) => ({ left: el.style.left, top: el.style.top, position: el.style.position }));

test.describe('settings dialog: the header band', () => {
    let pageErrors;

    test.beforeEach(async ({ page }) => {
        pageErrors = collectPageErrors(page);
        await loadShell(page);
        await openSettings(page);
    });

    test.afterEach(() => {
        expect(pageErrors, 'no uncaught page errors').toEqual([]);
    });

    test('the library chip shows the version the page actually loaded', async ({ page }) => {
        const chip = page.locator(`#${SID}-version-row .vz-hdr-chip-lib b`);
        await expect(chip).toHaveText(libraryVersionNumber());
    });

    test('the script chip shows the running script version, from GM_info', async ({ page }) => {
        // The harness's GM_info stub reports 'test' as the script version, so
        // this pins the PLUMBING — that the chip reads GM_info at all — rather
        // than a number. A chip filled from anywhere else (a constant, the
        // library's own version) would show something other than 'test'.
        const chip = page.locator(`#${SID}-version-row .vz-hdr-chip-script b`);
        await expect(chip).toHaveText('test');

        // And the two are genuinely different values, which is the whole point
        // of showing both: a single chip could never have exposed the 9.99.1138
        // against library 4.0.0 pairing.
        const lib = await page.locator(`#${SID}-version-row .vz-hdr-chip-lib b`).textContent();
        expect(lib).not.toBe('test');
    });

    test('a missing GM_info costs a word, not the dialog', async ({ page }) => {
        // Feature-detected exactly like GM_deleteValue: the library runs in the
        // consumer's sandbox with the consumer's grants, so a consumer that has
        // not granted GM_info must still get a working settings dialog.
        await page.evaluate(() => { delete window.GM_info; });
        await page.click(`#${SID}-close`);
        await page.waitForSelector(OVERLAY, { state: 'detached' }).catch(() => {});
        await openSettings(page);

        await expect(page.locator(`#${SID}-version-row .vz-hdr-chip-script b`))
            .toHaveText('unknown');
        // The counter-guard: the dialog is otherwise intact.
        await expect(page.locator(`#${SID}-version-row .vz-hdr-chip-lib b`))
            .toHaveText(libraryVersionNumber());
        await expect(page.locator(`#${SID}-save-btn`)).toBeVisible();
    });

    test('the counts chip matches the schema the dialog actually rendered', async ({ page }) => {
        // Asserted against the rendered DOM rather than a literal, so the chip
        // cannot drift from the schema as settings are added or retired.
        const chips = page.locator(`#${SID}-version-row .vz-hdr-chip`);
        const countsText = await chips.nth(2).textContent();
        const [settings, sections] = countsText.match(/\d+/g).map(Number);

        expect(settings).toBe(await page.locator('.vz-setting-row').count());
        expect(sections).toBe(await page.locator('.vz-section-header').count());
        // A plausible floor, so "0 settings · 0 sections" cannot pass.
        expect(settings).toBeGreaterThan(200);
        expect(sections).toBeGreaterThan(20);
    });

    test('the changed badge is absent on an untouched profile and appears on a change',
        async ({ page }) => {
            const chip = page.locator(`#${SID}-changed-chip`);
            // Not merely "empty": the chip is a pill with a border and padding,
            // so an empty one is a visible blob sitting beside the versions.
            // `.vz-hdr-chip` sets `display`, which outranks the UA stylesheet's
            // `[hidden] { display: none }` — this assertion is what caught that.
            await expect(chip, 'nothing differs yet').toBeHidden();

            // Flip one checkbox. The badge is recomputed from the WIDGETS on
            // every event, not tracked, so it must move without a save.
            await expandSectionFor(page, 'sa_enable_debug_logging');
            await page.locator(`#${SID}-input-sa_enable_debug_logging`).click();
            await expect(chip).toBeVisible();
            await expect(chip).toHaveText('● 1 changed');

            // And back — a badge that only ever counts up would pass the above.
            await page.locator(`#${SID}-input-sa_enable_debug_logging`).click();
            await expect(chip).toBeHidden();
        });

    test('the header badge agrees with the toolbar button', async ({ page }) => {
        // Two surfaces for one number. The header one answers "is there
        // anything?" with every section collapsed; the toolbar one answers
        // "show me them". They are computed in the same pass, and a test that
        // read only one would not notice them diverging.
        await expandSectionFor(page, 'sa_enable_debug_logging');
        await page.locator(`#${SID}-input-sa_enable_debug_logging`).click();
        await expandSectionFor(page, 'sa_max_page');
        await page.locator(`#${SID}-input-sa_max_page`).fill('99');
        await page.locator(`#${SID}-input-sa_max_page`).dispatchEvent('change');

        await expect(page.locator(`#${SID}-changed-chip`)).toHaveText('● 2 changed');
        await expect(page.locator(`#${SID}-changed-only-btn`))
            .toHaveText(/Changed only \(2\)/);
    });

    test('RESET and CLOSE are focusable controls, not bare anchors', async ({ page }) => {
        // They were `<a>` with no href, which takes no tab stop at all — so the
        // dialog could not be dismissed from the keyboard except by Escape.
        for (const id of [`${SID}-reset`, `${SID}-close`]) {
            const el = page.locator(`#${id}`);
            await expect(el).toHaveJSProperty('tagName', 'BUTTON');
            const focusable = await el.evaluate(n => {
                n.focus();
                return document.activeElement === n;
            });
            expect(focusable, `#${id} takes focus`).toBe(true);
        }
    });

    test('CLOSE still closes, and RESET still prompts', async ({ page }) => {
        // The regression control for turning both into buttons: the wiring is
        // `getElementById(...).onclick`, which does not care about the tag, and
        // this is what proves the change was cosmetic.
        await page.click(`#${SID}-reset`);
        const ok = page.getByRole('button', { name: 'OK', exact: true });
        await expect(ok, 'RESET asks before doing anything').toBeVisible();
        await page.getByRole('button', { name: 'Cancel', exact: true }).click();

        await page.click(`#${SID}-close`);
        const discard = page.getByRole('button', { name: 'OK', exact: true });
        if (await discard.isVisible().catch(() => false)) await discard.click();
        await expect(page.locator(OVERLAY)).toHaveCount(0);
    });

    test('pressing a header BUTTON does not drag the dialog', async ({ page }) => {
        // Every control except SAVE lives inside the drag handle, so pressing
        // one armed a drag: the dialog followed the pointer while you decided
        // whether to release on the button, and `didDrag` — whose job is to
        // suppress the overlay click that ends a drag — could swallow the very
        // click meant to dismiss the dialog.
        //
        // The button, not the search field. Mutation-testing is what settled
        // that: removing the guard left a search-field version of this test
        // GREEN, because the input has carried its own mousedown
        // stopPropagation since 3.9.0. The field was never the broken case;
        // the buttons were, and they have no local guard of their own.
        expect(await dragOffset(page), 'nothing has been dragged yet')
            .toMatchObject({ left: '', top: '' });

        // "Collapse all" rather than RESET or CLOSE: it is enabled on a
        // pristine profile (● Changed only is not) and releasing away from it
        // fires no click, so the press has no side effect to confuse this.
        const box = await page.locator(`#${SID}-collapse-all-btn`).boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 90, { steps: 8 });
        await page.mouse.up();

        // The handler's own writes, not a bounding box — see dragOffset()'s
        // note on why a box moves for reasons unrelated to dragging.
        expect(await dragOffset(page), 'the drag handler never ran')
            .toMatchObject({ left: '', top: '' });
    });

    test('and neither does pressing in the search field', async ({ page }) => {
        // Kept as a separate test because it is a separate guarantee with a
        // separate owner: here the input's own stopPropagation and the header
        // guard overlap, so this passes with either one removed. That makes it
        // a REGRESSION control rather than a proof — it is what notices if
        // someone removes both while tidying.
        const box = await page.locator(`#${SID}-search`).boundingBox();
        await page.mouse.move(box.x + 12, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + 160, box.y + box.height / 2 + 80, { steps: 8 });
        await page.mouse.up();

        expect(await dragOffset(page), 'the drag handler never ran')
            .toMatchObject({ left: '', top: '' });
    });

    test('the header bar itself still drags', async ({ page }) => {
        // The counter-guard for the test above: a guard that refused every
        // mousedown would satisfy it while breaking the dialog outright.
        const box = await page.locator(`#${SID}-title-text`).boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 40, { steps: 8 });
        await page.mouse.up();

        const after = await dragOffset(page);
        expect(after.position, 'the drag switched the dialog to absolute').toBe('absolute');
        expect(after.left, 'the drag handler wrote a position').not.toBe('');
        expect(after.top).not.toBe('');
    });
});

test.describe('settings dialog: tooltips', () => {
    let pageErrors;

    test.beforeEach(async ({ page }) => {
        pageErrors = collectPageErrors(page);
        await loadShell(page);
        await openSettings(page);
    });

    test.afterEach(() => {
        expect(pageErrors, 'no uncaught page errors').toEqual([]);
    });

    test('every interactive element in the header carries one', async ({ page }) => {
        // Asserted as a set rather than one by one: the guarantee is "nothing
        // in here is unexplained", and a per-element test would pass while a
        // newly added control arrived bare.
        const ids = [
            `${SID}-reset`, `${SID}-close`, `${SID}-search`, `${SID}-search-clear`,
            `${SID}-changed-only-btn`, `${SID}-collapse-all-btn`,
            `${SID}-col-hdr-1`, `${SID}-col-hdr-2`, `${SID}-col-hdr-3`,
            `${SID}-col-drag-1`, `${SID}-col-drag-2`,
            `${SID}-save-btn`, `${SID}-resize-handle`, `${SID}-subtitle`,
        ];
        const missing = await page.evaluate((list) => list.filter((id) => {
            const el = document.getElementById(id);
            return !el || !el.title || el.title.trim() === '';
        }), ids);
        expect(missing, 'every header/footer control explains itself').toEqual([]);
    });

    test('all three version chips carry one', async ({ page }) => {
        const bare = await page.evaluate((sid) => {
            const row = document.getElementById(`${sid}-version-row`);
            return Array.from(row.querySelectorAll('.vz-hdr-chip'))
                .filter((c) => !c.hidden && !(c.title || '').trim())
                .map((c) => c.textContent.trim());
        }, SID);
        expect(bare).toEqual([]);
    });

    test("a setting's tooltip names its GM storage key", async ({ page }) => {
        // The key appears NOWHERE else in the dialog, and it is what someone
        // hand-editing an exported config file needs. Asserted on all four
        // surfaces of the row, because they are meant to share one tooltip and
        // a user hovers whichever is nearest.
        const row = rowFor(page, 'sa_max_page');
        const titles = await row.evaluate((r) => ({
            label:  r.querySelector('.vz-setting-label').title,
            widget: r.querySelector('input').title,
            dflt:   r.querySelector('[data-vz-settings-col="2"]').title,
            desc:   r.children[2].title,
        }));
        for (const [where, text] of Object.entries(titles)) {
            expect(text, `${where} names the key`).toContain('sa_max_page');
            expect(text, `${where} names the default`).toMatch(/Default: /);
        }
        // One tooltip, four places — not four that drifted apart.
        expect(new Set(Object.values(titles)).size).toBe(1);
    });

    test('every settings row has a tooltip on the widget you can actually hover',
        async ({ page }) => {
            // `input[type=hidden]` is excluded deliberately, not overlooked: a
            // popup_dialog row keeps its pipe-separated composite there while
            // the ✏️ Edit fields button is what the user sees, and an element
            // with no box has no hover surface for a title to appear over.
            // Without the exclusion this reported all 15 popup_dialog rows as
            // defects.
            const bare = await page.evaluate(() =>
                Array.from(document.querySelectorAll('.vz-setting-row'))
                    .filter((row) => {
                        const w = row.querySelector(
                            'input:not([type="hidden"]), button, select, textarea');
                        return w && !(w.title || '').trim();
                    })
                    .map((row) => row.dataset.vzKey));
            expect(bare, 'no widget is left unexplained').toEqual([]);

            // A floor, so an empty NodeList cannot pass as "all covered".
            const withTitles = await page.evaluate(() =>
                document.querySelectorAll(
                    '.vz-setting-row input:not([type="hidden"])[title], ' +
                    '.vz-setting-row button[title]').length);
            expect(withTitles).toBeGreaterThan(200);
        });

    test('an action button says it is an action, not a value', async ({ page }) => {
        // `type: 'function'` runs immediately and has nothing for SAVE to
        // store, which is true of no other row in the dialog. The Default
        // column already says "(an action, not a value)"; the tooltip is what
        // the user reads when that column is dragged narrow.
        const btn = page.locator(`#${SID}-input-sa_fn_edit_pinned_filter_list-fn-btn`);
        await expect(btn).toHaveCount(1);
        await expect(btn).toHaveAttribute('title', /action, not a setting/i);
    });

    test('a table editor says its own Save writes immediately', async ({ page }) => {
        // The trap: the table editor has its own 💾 which writes at once and
        // does NOT wait for this dialog's SAVE. Getting that backwards loses
        // the rows — and the same asymmetry is why `_configLiveTableRows()`
        // exists on the consumer side.
        const btn = page.locator('.vz-tbl-btn').first();
        await expect(btn).toHaveAttribute('title', /does not wait for this dialog/i);
    });

    test('"Collapse all" explains why it is disabled while filtering', async ({ page }) => {
        const btn = page.locator(`#${SID}-collapse-all-btn`);
        await expect(btn).toBeEnabled();
        const idle = await btn.getAttribute('title');
        expect(idle).not.toMatch(/Unavailable/);

        await page.locator(`#${SID}-search`).fill('debug');
        await expect(btn).toBeDisabled();
        await expect(btn, 'a dead control says why it is dead')
            .toHaveAttribute('title', /Unavailable while a filter is active/);

        // And back, so the explanation cannot simply be permanent.
        await page.locator(`#${SID}-search`).fill('');
        await expect(btn).toBeEnabled();
        await expect(btn).not.toHaveAttribute('title', /Unavailable/);
    });

    test('the section header and its ↺ carry different tooltips', async ({ page }) => {
        // They are nested — the ↺ lives inside the header — so the inner one
        // has to say something of its own or hovering the button explains the
        // header instead.
        const header = page.locator('.vz-section-header').first();
        const headerTitle = await header.getAttribute('title');
        const resetTitle = await header.locator('.vz-section-reset').getAttribute('title');

        expect(headerTitle).toMatch(/expand or collapse/i);
        expect(resetTitle).toMatch(/Reset/);
        expect(resetTitle, 'the per-section reset says it is scoped')
            .toMatch(/only the settings in this section/i);
        expect(resetTitle).not.toBe(headerTitle);
    });
});
