'use strict';

// The h1 controls bar's two pull-down menus, 📦 Data ▾ and 🛠 View ▾.
//
// What is under test is NOT "does a menu open" — it is the set of properties
// that make grouping the bar into menus safe, each of which fails silently:
//
//   • **Adoption keeps the element.** A menu row IS the button that used to sit
//     in the bar: same id, same `onclick`, same colour settings, same
//     `ctrlMFunctionMap` entry. A menu that rebuilt its rows would look
//     identical and quietly orphan every one of those.
//
//   • **A row in a closed panel has a ZERO bounding rect.** Density and Export
//     position their own pull-downs from `getBoundingClientRect()`, and the
//     load dialog positions itself from its trigger's. So `Ctrl+D` has to open
//     🛠 View ▾ first — `_toolbarInvoke()` — and anything that wants an ANCHOR
//     has to ask for the menu BUTTON, not the row (`_toolbarAnchorFor()`).
//     A bare `.click()` opens the sub-menu pinned to the top-left corner.
//
//   • **An empty menu must not render.** Every row is gated by its own
//     `sa_enable_*` setting, so a profile with the lot off would otherwise get
//     a button opening onto nothing.
//
// The 📀 Discography menu is a third instance of the same primitive and is
// covered live, on `artist-releasegroups`, by `tests/live/discography-view.spec.js`
// — no committed fixture renders that pageType's view buttons.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { openToolbarMenu } = require('../support/toolbarMenu');

// artist-recordings, single-table — the same fixture/page shape
// uniq-drop-length-bucket.spec.js uses, so pageType detection and
// headerContainer resolution are already known to work here.
const ARTIST_RECORDINGS_URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/recordings';
const FIXTURE_FILE = path.join(__dirname, 'uniq-drop-viewport-clip.html');

/**
 * Loads the fixture and runs the fetch, so the render tail has adopted every
 * post-render control into its menu.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object<string, *>} [settingsOverride]
 * @returns {Promise<void>}
 */
async function loadAndRender(page, settingsOverride) {
    await loadUserscriptPage(page, {
        url: ARTIST_RECORDINGS_URL, fixtureFile: FIXTURE_FILE, testMode: true, settingsOverride,
    });
    await page.route(`${ARTIST_RECORDINGS_URL}?**`,
        (route) => route.fulfill({ path: FIXTURE_FILE, contentType: 'text/html' }));

    await page.click('button[data-label="⊚ All recordings"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

test.describe('the h1 toolbar menus', () => {
    test('each menu adopts the real buttons, keeping their ids', async ({ page }) => {
        await loadAndRender(page);

        const dataPanel = page.locator('#mb-data-menu-btn-panel');
        const viewPanel = page.locator('#mb-view-menu-btn-panel');

        // The rows are the original elements, now living in a panel.
        for (const id of ['#mb-save-to-disk-btn', '#mb-load-from-disk-btn', '#mb-export-btn']) {
            await expect(dataPanel.locator(id), `${id} is a 📦 Data row`).toHaveCount(1);
        }
        for (const id of ['#mb-density-btn', '#mb-stats-btn', '#mb-shortcuts-help-btn']) {
            await expect(viewPanel.locator(id), `${id} is a 🛠 View row`).toHaveCount(1);
        }

        // Row order is declared by _TOOLBAR_MENU_ROW_ORDER, not by the sequence
        // the render tail happens to adopt them in — 🎹 is adopted on the
        // INITIAL render and would otherwise head the View list.
        expect(await viewPanel.evaluate((el) =>
            Array.from(el.querySelectorAll('.mb-toolbar-menu-item')).map((b) => b.id)))
            .toEqual(['mb-density-btn', 'mb-stats-btn', 'mb-shortcuts-help-btn']);

        // Nothing was left behind in the bar, and ⚙️ / ❓ stayed pinned there.
        const bar = page.locator('#mb-show-all-controls-container');
        await expect(bar.locator('#mb-density-btn')).toHaveCount(0);
        await expect(bar.locator('#mb-settings-btn')).toHaveCount(1);
        await expect(bar.locator('#mb-app-help-btn')).toHaveCount(1);

        // …and ⚙️ ❓ are the last two BUTTONS, in that order — the fetch
        // progress bar (present but display:none outside a fetch) trails
        // both of them, per _TOOLBAR_TAIL_ORDER.
        expect(await bar.evaluate((el) => Array.from(el.children).map((c) => c.id).filter(Boolean).slice(-3)))
            .toEqual(['mb-settings-btn', 'mb-app-help-btn', 'mb-fetch-progress-wrap']);
    });

    test('⚙️ and ❓ are drawn as ONE pill: same ground as the menus, touching, one hairline', async ({ page }) => {
        await loadAndRender(page);

        const geom = await page.evaluate(() => {
            const read = (id) => {
                const el = document.getElementById(id);
                const cs = getComputedStyle(el);
                const r  = el.getBoundingClientRect();
                return {
                    bg: cs.backgroundColor,
                    x: r.x, right: r.right,
                    radius: [cs.borderTopLeftRadius, cs.borderTopRightRadius,
                             cs.borderBottomRightRadius, cs.borderBottomLeftRadius],
                    borderLeft: cs.borderLeftWidth,
                    borderRight: cs.borderRightWidth,
                    title: el.title,
                    parent: el.parentElement.id,
                };
            };
            return { data: read('mb-data-menu-btn'), gear: read('mb-settings-btn'), help: read('mb-app-help-btn') };
        });

        // The ground is the menus' ground. Asserted against #mb-data-menu-btn
        // rather than against a literal, because the point is that they AGREE
        // — a literal would still pass if the menu buttons were recoloured and
        // the pinned pair were not.
        expect(geom.gear.bg, '⚙️ shares the menu buttons\' background').toBe(geom.data.bg);
        expect(geom.help.bg, '❓ shares the menu buttons\' background').toBe(geom.data.bg);

        // They TOUCH. The bar is a flex container with a gap between every
        // pair of children, so this only holds because the second segment
        // pulls back by exactly one gap. A seam wider than a rounding error
        // means the pill has split open.
        expect(Math.abs(geom.help.x - geom.gear.right),
            'no gap between the two halves').toBeLessThan(0.5);

        // ONE hairline, not two: the left half gives up its right border and
        // the right half keeps its left. Both keeping theirs draws a 2px seam
        // against 1px outer edges — the defect the sort-group pill hit on its
        // first run.
        expect(geom.gear.borderRight, '⚙️ gives up its right border').toBe('0px');
        expect(geom.help.borderLeft, '❓ keeps its left border as the divider').toBe('1px');

        // Rounded at the run's two outer ends only.
        expect(geom.gear.radius.map((v) => parseFloat(v)),
            '⚙️ rounds left, squares right').toEqual([6, 0, 0, 6]);
        expect(geom.help.radius.map((v) => parseFloat(v)),
            '❓ squares left, rounds right').toEqual([0, 6, 6, 0]);

        // Still direct children of the bar. A wrapper element would be the
        // obvious way to build a pill and would break both _TOOLBAR_TAIL_ORDER
        // and the ordering assertion above.
        expect(geom.gear.parent).toBe('mb-show-all-controls-container');
        expect(geom.help.parent).toBe('mb-show-all-controls-container');

        // Each half kept its OWN action's tooltip — the pill is a visual
        // grouping, not a merge.
        expect(geom.gear.title.toLowerCase()).toContain('settings');
        expect(geom.help.title.toLowerCase()).toContain('help');
    });

    test('when the bar wraps between the two halves, ❓ does not hang outside it', async ({ page }) => {
        // The bar is flex-wrap:wrap and a flex gap cannot be suppressed for one
        // pair, so the pill closes its gap with a negative margin — and at some
        // widths the two halves land on different lines anyway. Measured at
        // 1040-1080px, which is ordinary window territory.
        //
        // Which SIDE carries that margin is the whole point. On the right half
        // it pulled ❓ 8px past the bar's own left edge on the new line, i.e.
        // content outside its container. On the left half the same pull merely
        // shortens a line with nothing after it.
        await loadAndRender(page);

        let split = null;
        for (let w = 1200; w >= 500 && !split; w -= 10) {
            await page.setViewportSize({ width: w, height: 900 });
            const r = await page.evaluate(() => {
                const g   = document.getElementById('mb-settings-btn').getBoundingClientRect();
                const h   = document.getElementById('mb-app-help-btn').getBoundingClientRect();
                const bar = document.getElementById('mb-show-all-controls-container').getBoundingClientRect();
                return { sameLine: Math.abs(g.y - h.y) < 1, overhang: h.x - bar.x };
            });
            if (!r.sameLine) split = { w, ...r };
        }

        // Not reaching a split is a legitimate outcome — it depends on this
        // fixture's heading width — so the test reports that rather than
        // failing, and only asserts when it has the case in hand.
        test.skip(!split, 'this fixture never wraps between the two halves');
        expect(split.overhang,
            `at ${split && split.w}px the pill split; ❓ must not start left of the bar`)
            .toBeGreaterThanOrEqual(-0.5);
    });

    test('a panel opens on click and closes on Escape, on an outside click, and on a row', async ({ page }) => {
        await loadAndRender(page);

        const btn = page.locator('#mb-data-menu-btn');
        const panel = page.locator('#mb-data-menu-btn-panel');

        await expect(panel).toBeHidden();
        await expect(btn).toHaveAttribute('aria-expanded', 'false');

        await btn.click();
        await expect(panel).toBeVisible();
        await expect(btn).toHaveAttribute('aria-expanded', 'true');

        await page.keyboard.press('Escape');
        await expect(panel).toBeHidden();
        await expect(btn).toHaveAttribute('aria-expanded', 'false');

        await btn.click();
        await expect(panel).toBeVisible();
        await page.mouse.click(5, 400);
        await expect(panel).toBeHidden();

        // Activating a row closes the menu too — the conventional behaviour,
        // deferred by one task so a row that measures its own rect has already
        // done so.
        await btn.click();
        await expect(panel).toBeVisible();
        await page.locator('#mb-export-btn').click();
        await expect(panel).toBeHidden();
    });

    test('opening one menu closes the other', async ({ page }) => {
        await loadAndRender(page);

        await page.locator('#mb-data-menu-btn').click();
        await expect(page.locator('#mb-data-menu-btn-panel')).toBeVisible();

        await page.locator('#mb-view-menu-btn').click();
        await expect(page.locator('#mb-view-menu-btn-panel')).toBeVisible();
        await expect(page.locator('#mb-data-menu-btn-panel')).toBeHidden();
    });

    test('an open row has a real bounding rect — the reason Ctrl+D cannot be a bare click', async ({ page }) => {
        await loadAndRender(page);

        const density = page.locator('#mb-density-btn');

        // Closed: the row is attached but has no box at all. This is the fact
        // the whole `_toolbarInvoke()` / `_toolbarAnchorFor()` pair exists for.
        await expect(density).toHaveCount(1);
        expect(await density.boundingBox(), 'a row in a closed panel has no box').toBeNull();

        expect(await openToolbarMenu(page, 'view')).toBe(true);
        const box = await density.boundingBox();
        expect(box, 'an open row has a box').toBeTruthy();
        expect(box.width).toBeGreaterThan(0);
        expect(box.height).toBeGreaterThan(0);
    });

    test('Ctrl+D opens the View menu AND the density pull-down, positioned on its row', async ({ page }) => {
        // `sa_enable_direct_ctrl_char_shortcuts` ships OFF, so the bare Ctrl+D
        // binding is inert by default — seeding it on is what makes this test
        // exercise the shortcut path at all rather than passing vacuously.
        await loadAndRender(page, { sa_enable_direct_ctrl_char_shortcuts: true });

        // Focus the body so the shortcut is not swallowed by an input.
        await page.locator('h2').first().click();
        await page.keyboard.press('Control+d');

        // The 🛠 View panel is NOT expected to still be open: `_toolbarInvoke()`
        // opens it and then clicks the row, and activating a row closes its
        // menu. That is the point — the panel exists for exactly as long as the
        // row needs a bounding rect.
        //
        // The density pull-down has no id, so it is located by its own header
        // text. What matters is WHERE it landed: anchored to the row, not to
        // the top-left corner.
        //
        // `#mb-density-btn` itself cannot be measured here either, for the same
        // reason — by now the row has no box again. Compare against the 🛠 View
        // BUTTON: the panel opens below it and the row is inside the panel, so
        // a pull-down anchored to a real row is necessarily below it too. A
        // bare `.click()` on a closed row reads a ZERO rect, and
        // `menu.style.top = rect.bottom + 5` then puts the pull-down at y=5,
        // x=0 — which is what this discriminates against.
        const densityMenu = page.locator('div:has(> div:text-is("Table Density"))').last();
        await expect(densityMenu).toBeVisible();
        const menuBox = await densityMenu.boundingBox();
        const hostBox = await page.locator('#mb-view-menu-btn').boundingBox();
        expect(menuBox.y, 'the pull-down opened below its row inside the open panel')
            .toBeGreaterThan(hostBox.y + hostBox.height);
        expect(menuBox.x, 'not pinned to the left edge, as a zero rect would give')
            .toBeGreaterThan(5);
    });

    test('a gated-off feature leaves no empty row, and a fully gated-off menu does not render', async ({ page }) => {
        await loadAndRender(page, {
            sa_enable_density_control: false,
            sa_enable_stats_panel: false,
            sa_enable_keyboard_shortcuts: false,
        });

        // Every 🛠 View row is gated off, so the button itself must be absent —
        // not present-and-opening-onto-nothing. What delivers that is LAZY
        // CREATION: each `_ensure*Menu()` call sits inside its own feature
        // gate, so the menu is never constructed at all. `_orderToolbar()`'s
        // emptiness reconcile is a second line for a call site that ensures a
        // menu and then adopts nothing — mutation-testing confirms no fixture
        // can tell the two apart, and the mutation list records that.
        await expect(page.locator('#mb-view-menu-btn')).toHaveCount(0);
        await expect(page.locator('#mb-density-btn')).toHaveCount(0);

        // 📦 Data is untouched and still there, so this is not "the whole
        // toolbar failed to build".
        await expect(page.locator('#mb-data-menu-btn')).toHaveCount(1);
        expect(await openToolbarMenu(page, 'data')).toBe(true);
        await expect(page.locator('#mb-data-menu-btn-panel .mb-toolbar-menu-item').first()).toBeVisible();
    });

    test('a row carries its shortcut hint as an attribute, not as text', async ({ page }) => {
        await loadAndRender(page);

        // The hint is rendered by CSS `::after` from `data-mb-menu-hint`, never
        // as an appended <kbd> child — a rewrite of the button's own content
        // (several of these buttons repaint their title/style on every state
        // change) would otherwise delete it. Same rule the column-header
        // glyphs follow (CSS ::before/::after, never element text).
        const save = page.locator('#mb-save-to-disk-btn');
        expect(await save.getAttribute('data-mb-menu-hint')).toBeTruthy();
        expect((await save.textContent()).trim(),
            'the hint is not part of the row text').toBe('💾 Save to Disk');
        expect(await save.getAttribute('data-mb-menu-owner')).toBe('data');
    });

    test('every row is labelled, including 🎹, which used to be glyph-only', async ({ page }) => {
        await loadAndRender(page);

        // 🎹 is the one row that was NOT labelled when it lived in the h1 bar,
        // where width was the scarce thing and it sat next to ⚙️ and ❓. In a
        // menu an unlabelled row is a mystery glyph, so it now reads like its
        // siblings — and is built in TWO places (the initial render and
        // `addShortcutsHelpButton()`), which is the reason to pin it.
        for (const [id, label] of [
            ['#mb-shortcuts-help-btn', '🎹 Keyboard Shortcuts'],
            ['#mb-density-btn', '📏 Density'],
            ['#mb-stats-btn', '📊 Statistics'],
            ['#mb-export-btn', '💾 Export'],
            ['#mb-load-from-disk-btn', '📂 Load from Disk'],
        ]) {
            expect((await page.locator(id).textContent()).trim(), `${id} row label`).toBe(label);
        }

        // The accelerator letter stays underlined, as in every other row.
        await expect(page.locator('#mb-shortcuts-help-btn u')).toHaveText('K');
    });
});
