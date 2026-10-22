'use strict';

// The SAED button (approved mockup v6, 2026-10-22:
// https://claude.ai/artifact/QUqoriyP6qX3D3EutjhyzX): everything the script
// adds to the page heading is ONE segmented button, #mb-saed-bar, in four
// areas — actions │ 📀 Discography │ attention indicators │ ☰ SAED ▾ — and
// the ☰ SAED menu holds the groups Load (narrow screens), Needs attention,
// Data, View, Help and Changelog. It replaced 📦 Data ▾, 🛠 View ▾ and the
// ⚙️❓ pill (toolbar-menus.spec.js pinned those).
//
// What is under test is the set of properties that make that safe, each of
// which fails silently:
//
//   • **Adoption keeps the element.** A menu row IS the button that used to sit
//     in the bar or in 📦/🛠: same id, same `onclick`, same `ctrlMFunctionMap`
//     entry. A menu that rebuilt its rows would look identical and quietly
//     orphan every one of those.
//   • **A row in a closed panel has a ZERO bounding rect.** Density and the
//     load dialog position themselves from a rect, so `Ctrl+D` goes through
//     `_toolbarInvoke()` (open the host first) and an anchor through
//     `_toolbarAnchorFor()` (the ☰ SAED segment, not the row).
//   • **A group with nothing to show is not shown**, and View holds Keyboard
//     Shortcuts only while it holds something else (the approved View rule).
//   • **A submenu keeps its parent open**, takes the keyboard while open and
//     gives it back on ← / Escape, and a choice in it closes both.
//
// The 📀 Discography segment is covered live on `artist-releasegroups`
// (tests/live/discography-view.spec.js) — no committed fixture renders that
// pageType's view buttons; the indicators by findings-menus.spec.js.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { openToolbarMenu } = require('../support/toolbarMenu');

// artist-recordings, single-table — the fixture toolbar-menus.spec.js used.
const ARTIST_RECORDINGS_URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/recordings';
const FIXTURE_FILE = path.join(__dirname, 'uniq-drop-viewport-clip.html');

const MENU = '#mb-saed-menu-btn';
const PANEL = '#mb-saed-menu-btn-panel';
const EXPORT_SUB = '#mb-export-sub-panel';

/**
 * Loads the fixture with `window.open` recorded rather than performed.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object<string, *>} [settingsOverride]
 * @returns {Promise<void>}
 */
async function load(page, settingsOverride) {
    await page.context().addInitScript({ content: `
        window.__openCalls = [];
        window.open = function (url, target, features) {
            window.__openCalls.push({ url: url, target: target, features: features });
            return null;
        };
    ` });
    await loadUserscriptPage(page, {
        url: ARTIST_RECORDINGS_URL, fixtureFile: FIXTURE_FILE, testMode: true, settingsOverride,
    });
    await expect(page.locator('#mb-saed-bar')).toBeAttached();
}

/**
 * Loads the fixture and runs the fetch, so the render tail has adopted every
 * post-render control.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object<string, *>} [settingsOverride]
 * @returns {Promise<void>}
 */
async function loadAndRender(page, settingsOverride) {
    await load(page, settingsOverride);
    await page.route(`${ARTIST_RECORDINGS_URL}?**`,
        (route) => route.fulfill({ path: FIXTURE_FILE, contentType: 'text/html' }));
    await page.click('button[data-label="⊚ All recordings"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/**
 * Which groups of the SAED menu show, and their rows' ids (or text).
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object<string, string[]>>} group key → row ids, shown groups only
 */
const shownGroups = (page) => page.evaluate((panelSel) => {
    const out = {};
    document.querySelectorAll(`${panelSel} > .mb-saed-group`).forEach((g) => {
        if (g.hidden) return;
        out[g.dataset.mbGroup] = Array.from(g.querySelectorAll(':scope > .mb-toolbar-menu-item'))
            .filter((r) => r.style.display !== 'none')
            .map((r) => r.id || r.textContent.trim());
    });
    return out;
}, PANEL);

/**
 * A viewport point whose hit-test target is plain, non-interactive page
 * surface outside the toolbar — what "an outside click" means.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<?{x: number, y: number}>}
 */
const neutralPoint = (page) => page.evaluate(() => {
    const INTERACTIVE = 'a, button, input, select, textarea, label, summary, th, td, '
        + '[role="menu"], [onclick], #mb-show-all-controls-container';
    for (let y = 5; y < innerHeight; y += 15) {
        for (let x = 5; x < innerWidth; x += 15) {
            const el = document.elementFromPoint(x, y);
            if (el && !el.closest(INTERACTIVE)) return { x, y };
        }
    }
    return null;
});

test.describe('the SAED button', () => {
    test('one segmented button: the actions, the indicators, ☰ SAED — and nothing else in the bar', async ({ page }) => {
        await loadAndRender(page);

        const areas = await page.evaluate(() => Array.from(document.querySelectorAll('#mb-saed-bar > .mb-saed-area'))
            .map((a) => ({
                area: a.dataset.mbArea,
                first: a.classList.contains('mb-saed-first'),
                kids: Array.from(a.children).map((c) => c.id || c.dataset.label || c.className),
            })));
        expect(areas.map((a) => a.area)).toEqual(['actions', 'disc', 'attn', 'menu']);
        expect(areas[0].kids).toEqual(['⊚ All recordings', '♫ Standalone', '🎬 Video']);
        expect(areas[1].kids, 'no 📀 Discography off artist-releasegroups').toEqual([]);
        expect(areas[3].kids).toEqual(['mb-saed-menu-btn']);
        // The first visible area has no left rule, whichever it is.
        expect(areas[0].first).toBe(true);
        expect(areas.filter((a) => a.first)).toHaveLength(1);

        // The old controls are not in the bar any more, as anything.
        for (const gone of ['#mb-data-menu-btn', '#mb-view-menu-btn', '#mb-button-divider-initial',
            '#mb-button-divider-findings', '.mb-toolbar-pinned-btn']) {
            await expect(page.locator(gone), `${gone} is gone`).toHaveCount(0);
        }
        // ⚙️ and ❓ are menu rows now, not segments.
        await expect(page.locator('#mb-saed-bar #mb-settings-btn')).toHaveCount(0);
        await expect(page.locator(`${PANEL} #mb-settings-btn`)).toHaveCount(1);
        await expect(page.locator(`${PANEL} #mb-app-help-btn`)).toHaveCount(1);

        // The container holds the bar first; only what a fetch shows trails it.
        // (The hidden <input type="file"> behind Load from Disk is no control.)
        const tail = await page.evaluate(() => Array.from(document.getElementById('mb-show-all-controls-container').children)
            .map((c) => c.id).filter((id) => id && id !== 'mb-file-input'));
        expect(tail[0]).toBe('mb-saed-bar');
        expect(tail.slice(1).every((id) => ['mb-stop-btn', 'mb-fetch-progress-wrap'].includes(id)),
            `only fetch controls after the bar: ${tail.join(', ')}`).toBe(true);
    });

    test('each group adopts the real buttons, keeping their ids, in the declared order', async ({ page }) => {
        await loadAndRender(page);
        await openToolbarMenu(page, 'saed');
        const groups = await shownGroups(page);

        expect(groups.data).toEqual(['mb-save-to-disk-btn', 'mb-load-from-disk-btn', 'mb-export-btn']);
        // Row order is declared by _TOOLBAR_MENU_ROW_ORDER, not by the sequence
        // the render tail happens to adopt them in — 🎹 is adopted on the
        // INITIAL render and would otherwise head the View list.
        expect(groups.view).toEqual(['mb-density-btn', 'mb-stats-btn', 'mb-shortcuts-help-btn']);
        expect(groups.help, 'Settings before Help (approved)').toEqual(['mb-settings-btn', 'mb-app-help-btn']);
        expect(groups.log).toEqual(['mb-saed-whatsnew-btn', 'mb-saed-devlog-btn']);
        expect(groups.load, 'the Load group is for narrow screens only').toBeUndefined();
        expect(Object.keys(groups)).toEqual(['attn', 'data', 'view', 'help', 'log']);
        await expect(page.locator(`${PANEL} .mb-saed-foot`)).toContainText('Installed');
    });

    test('before anything is loaded, View is not shown and Keyboard Shortcuts sits in Help', async ({ page }) => {
        await load(page);
        await openToolbarMenu(page, 'saed');
        const groups = await shownGroups(page);
        expect(groups.view, 'View would hold only Keyboard Shortcuts').toBeUndefined();
        expect(groups.help).toEqual(['mb-settings-btn', 'mb-app-help-btn', 'mb-shortcuts-help-btn']);
        expect(groups.data).toEqual(['mb-load-from-disk-btn']);
        expect(groups.attn, 'nothing needs attention before a render').toBeUndefined();
    });

    test('the menu opens on click and closes on Escape, on an outside click, and on a row', async ({ page }) => {
        await loadAndRender(page);
        const btn = page.locator(MENU);
        const panel = page.locator(PANEL);

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
        const outside = await neutralPoint(page);
        expect(outside, 'no non-interactive spot outside the menu in the viewport').not.toBeNull();
        await page.mouse.click(outside.x, outside.y);
        await expect(panel).toBeHidden();

        // Activating a row closes the menu, deferred by one task so a row that
        // measures its own rect has already done so.
        await btn.click();
        await page.locator('#mb-stats-btn').click();
        await expect(panel).toBeHidden();
    });

    test('a link click whose leave-page confirm is cancelled still closes the menu', async ({ page }) => {
        // The leave-page guard answers a cancelled confirm with
        // stopImmediatePropagation() on the click, so only the capture-phase
        // mousedown dismiss sees it.
        await loadAndRender(page);
        const dialogs = [];
        page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });

        await page.locator(MENU).click();
        await expect(page.locator(PANEL)).toBeVisible();
        const urlBefore = page.url();
        await page.locator('table.tbl tbody td.mb-sticky-col a[href]').nth(5).click();
        expect(dialogs.length, 'premise: the leave-page guard asked').toBe(1);
        expect(page.url(), 'premise: cancelling kept the page').toBe(urlBefore);
        await expect(page.locator(PANEL)).toBeHidden();
    });

    test('opening an indicator\'s list closes the SAED menu, and the other way round', async ({ page }) => {
        await loadAndRender(page);
        const warn = page.locator('#mb-findings-warn-menu-btn');
        await expect(warn, 'premise: this fixture has the ⚠️ segment').toHaveCount(1);

        await page.locator(MENU).click();
        await expect(page.locator(PANEL)).toBeVisible();
        await warn.click();
        await expect(page.locator('#mb-findings-warn-menu-btn-panel')).toBeVisible();
        await expect(page.locator(PANEL)).toBeHidden();

        await page.locator(MENU).click();
        await expect(page.locator(PANEL)).toBeVisible();
        await expect(page.locator('#mb-findings-warn-menu-btn-panel')).toBeHidden();

        // Without a click: an outside-click handler cannot be what closes it.
        // The Tampermonkey "📜 ChangeLog" entry opens the SAED menu while the
        // ⚠️ list is open; only open()'s own closing of the others removes it.
        await page.keyboard.press('Escape');
        await warn.click();
        await expect(page.locator('#mb-findings-warn-menu-btn-panel')).toBeVisible();
        await page.evaluate(() => Object.values(window.__gmMenuCommands)
            .find((c) => c.name === '📜 ChangeLog').callback());
        await expect(page.locator(PANEL)).toBeVisible();
        await expect(page.locator('#mb-findings-warn-menu-btn-panel')).toBeHidden();
    });

    test('an open row has a real bounding rect — the reason Ctrl+D cannot be a bare click', async ({ page }) => {
        await loadAndRender(page);
        const density = page.locator('#mb-density-btn');
        await expect(density).toHaveCount(1);
        expect(await density.boundingBox(), 'a row in a closed panel has no box').toBeNull();
        expect(await openToolbarMenu(page, 'view')).toBe(true);
        const box = await density.boundingBox();
        expect(box, 'an open row has a box').toBeTruthy();
        expect(box.width).toBeGreaterThan(0);
    });

    test('Ctrl+D opens the menu AND the density pull-down, positioned on its row', async ({ page }) => {
        await loadAndRender(page, { sa_enable_direct_ctrl_char_shortcuts: true });
        await page.locator('h2').first().click();
        await page.keyboard.press('Control+d');

        // A bare .click() on a closed row reads a ZERO rect and puts the
        // pull-down at x=0, y=5; opened through _toolbarInvoke() it lands
        // below the ☰ SAED segment, inside the opened menu's span.
        const densityMenu = page.locator('div:has(> div:text-is("Table Density"))').last();
        await expect(densityMenu).toBeVisible();
        const menuBox = await densityMenu.boundingBox();
        const hostBox = await page.locator(MENU).boundingBox();
        expect(menuBox.y, 'the pull-down opened below the menu segment').toBeGreaterThan(hostBox.y + hostBox.height);
        expect(menuBox.x, 'not pinned to the left edge, as a zero rect would give').toBeGreaterThan(5);
    });

    test('a gated-off feature leaves no empty row, and an empty group does not show', async ({ page }) => {
        await loadAndRender(page, {
            sa_enable_density_control: false,
            sa_enable_stats_panel: false,
            sa_enable_keyboard_shortcuts: false,
        });
        await expect(page.locator('#mb-density-btn')).toHaveCount(0);
        await openToolbarMenu(page, 'saed');
        const groups = await shownGroups(page);
        expect(groups.view, 'every View row is gated off').toBeUndefined();
        expect(groups.data, 'Data is untouched, so this is not "the menu failed to build"')
            .toEqual(['mb-save-to-disk-btn', 'mb-load-from-disk-btn', 'mb-export-btn']);
    });

    test('a row carries its shortcut hint as an attribute, not as text', async ({ page }) => {
        await loadAndRender(page);
        const save = page.locator('#mb-save-to-disk-btn');
        await expect(save).toHaveAttribute('data-mb-menu-hint', /.+/);
        expect((await save.textContent()).trim(), 'the hint is not part of the row text').toBe('💾 Save to Disk');
        await expect(save).toHaveAttribute('data-mb-menu-owner', 'data');
    });

    test('every row is labelled', async ({ page }) => {
        await loadAndRender(page);
        for (const [id, label] of [
            ['#mb-shortcuts-help-btn', '🎹 Keyboard Shortcuts'],
            ['#mb-density-btn', '📏 Density'],
            ['#mb-stats-btn', '📊 Statistics'],
            ['#mb-export-btn', '📤 Export▸'],
            ['#mb-load-from-disk-btn', '📂 Load from Disk'],
            ['#mb-settings-btn', '⚙️ Settings'],
            ['#mb-app-help-btn', '❓ Help ↗'],
            ['#mb-saed-whatsnew-btn', "📜 What's new ↗"],
            ['#mb-saed-devlog-btn', '🗒 Full development log ↗'],
        ]) {
            expect((await page.locator(id).textContent()).trim(), `${id} row label`).toBe(label);
        }
        await expect(page.locator('#mb-shortcuts-help-btn u')).toHaveText('K');
    });

    test('the ☰ SAED card names the script, version, library, author and the AI help — without a request', async ({ page }) => {
        await loadAndRender(page);
        const before = await page.evaluate(() => (window.__gmXhrLog || []).length);
        const html = await page.locator(MENU).getAttribute('data-mbtt');
        expect(html).toContain('class="mb-tt-title"');
        for (const part of ['Version', 'Library', 'VZ_MBLibrary', 'Author', 'vzell', 'AI help from Claude (Anthropic)']) {
            expect(html, `the card shows "${part}"`).toContain(part);
        }
        await page.locator(MENU).hover();
        await expect(page.locator('#mb-stat-tooltip')).toContainText('Written with');
        // While the menu is open the card stays away: it would cover the menu.
        await page.locator(MENU).click();
        await expect(page.locator('#mb-stat-tooltip')).toBeHidden();
        expect(await page.evaluate(() => (window.__gmXhrLog || []).length), 'no request').toBe(before);
    });

    test('the menu name is a setting, and a blank one is SAED', async ({ page }) => {
        await load(page, { sa_toolbar_menu_name: 'Tools' });
        await expect(page.locator(`${MENU} .mb-toolbar-menu-btn-label`)).toHaveText('☰ Tools');
    });

    test('a blank menu name falls back to SAED', async ({ page }) => {
        await load(page, { sa_toolbar_menu_name: '   ' });
        await expect(page.locator(`${MENU} .mb-toolbar-menu-btn-label`)).toHaveText('☰ SAED');
    });
});

test.describe('the SAED menu: Help and Changelog open GitHub', () => {
    test('Help, What\'s new and the full log each open their GitHub page in a new tab', async ({ page }) => {
        await load(page);
        for (const [id, url] of [
            ['#mb-app-help-btn', 'https://github.com/vzell/mb-userscripts/blob/master/ShowAllEntityData_HELP.md'],
            ['#mb-saed-whatsnew-btn', 'https://github.com/vzell/mb-userscripts/blob/master/ShowAllEntityData_RELEASES.md'],
            ['#mb-saed-devlog-btn', 'https://github.com/vzell/mb-userscripts/blob/master/ShowAllEntityData_CHANGELOG.md'],
        ]) {
            await openToolbarMenu(page, 'saed');
            await page.locator(id).click();
            const calls = await page.evaluate(() => window.__openCalls.splice(0));
            expect(calls, `${id} opened one tab`).toHaveLength(1);
            expect(calls[0].url).toBe(url);
            expect(calls[0].target).toBe('_blank');
            expect(calls[0].features).toContain('noopener');
            await expect(page.locator(PANEL)).toBeHidden();
        }
    });

    test('the Tampermonkey "📜 ChangeLog" entry opens the menu on its Changelog group alone', async ({ page }) => {
        await load(page);
        const opened = await page.evaluate(() => {
            const cmd = Object.values(window.__gmMenuCommands || {}).find((c) => c.name === '📜 ChangeLog');
            if (!cmd) return false;
            cmd.callback();
            return true;
        });
        expect(opened, 'the entry is registered on a supported page').toBe(true);
        await expect(page.locator(PANEL)).toBeVisible();
        expect(Object.keys(await shownGroups(page))).toEqual(['log']);
        await expect(page.locator(`${PANEL} .mb-saed-foot`)).toBeHidden();
        await expect(page.locator('#mb-saed-whatsnew-btn')).toBeFocused();

        // Closed and opened from ☰ SAED, the whole menu is back.
        await page.keyboard.press('Escape');
        await openToolbarMenu(page, 'saed');
        expect(Object.keys(await shownGroups(page))).toContain('help');
    });

    test('the library does not fetch, store or parse the changelog for this script', async ({ page }) => {
        await load(page);
        const state = await page.evaluate(() => ({
            requests: (window.__gmXhrLog || []).filter((r) => /raw\.githubusercontent\.com/.test(r.url)).map((r) => r.url),
            stored: window.GM_getValue('showallentitydata-remote-changelog', undefined) !== undefined,
            libEntry: Object.values(window.__gmMenuCommands || {}).filter((c) => c.name === '📜 ChangeLog').length,
        }));
        expect(state.requests, 'nothing fetched from GitHub at load').toEqual([]);
        expect(state.stored, 'no changelog in GM storage').toBe(false);
        expect(state.libEntry, 'one 📜 ChangeLog entry: this script\'s, not the library\'s as well').toBe(1);
    });
});

test.describe('the SAED menu: Export ▸ is a submenu', () => {
    test('hovering Export opens the formats beside the menu, and the pointer can cross to them', async ({ page }) => {
        await loadAndRender(page);
        await openToolbarMenu(page, 'saed');
        await page.locator('#mb-export-btn').hover();
        const sub = page.locator(EXPORT_SUB);
        await expect(sub).toBeVisible();
        await expect(page.locator('#mb-export-btn')).toHaveAttribute('aria-expanded', 'true');
        const geo = await page.evaluate(([p, s]) => {
            const a = document.querySelector(p).getBoundingClientRect();
            const b = document.querySelector(s).getBoundingClientRect();
            return { menuLeft: a.left, menuRight: a.right, subLeft: b.left, subRight: b.right };
        }, [PANEL, EXPORT_SUB]);
        expect(geo.subRight <= geo.menuLeft + 3 || geo.subLeft >= geo.menuRight - 3,
            `beside the menu, not over it: ${JSON.stringify(geo)}`).toBe(true);
        // Crossing to the submenu keeps both open.
        await page.locator(`${EXPORT_SUB} [data-format-label="JSON"]`).hover();
        await expect(sub).toBeVisible();
        await expect(page.locator(PANEL)).toBeVisible();
        // Moving to another row of the menu closes the submenu.
        await page.locator('#mb-load-from-disk-btn').hover();
        await expect(sub).toBeHidden();
        await expect(page.locator(PANEL)).toBeVisible();
    });

    test('→ opens the submenu on its first format, ← and Escape give the keyboard back, a second Escape closes the menu', async ({ page }) => {
        await loadAndRender(page);
        await openToolbarMenu(page, 'saed');
        await page.locator('#mb-export-btn').focus();
        await page.keyboard.press('ArrowRight');
        await expect(page.locator(EXPORT_SUB)).toBeVisible();
        await expect(page.locator(`${EXPORT_SUB} [data-format-label="CSV"]`)).toBeFocused();
        await page.keyboard.press('ArrowDown');
        await expect(page.locator(`${EXPORT_SUB} [data-format-label="JSON"]`)).toBeFocused();

        await page.keyboard.press('ArrowLeft');
        await expect(page.locator(EXPORT_SUB)).toBeHidden();
        await expect(page.locator('#mb-export-btn')).toBeFocused();
        await expect(page.locator(PANEL)).toBeVisible();

        await page.keyboard.press('ArrowRight');
        await expect(page.locator(EXPORT_SUB)).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.locator(EXPORT_SUB)).toBeHidden();
        await expect(page.locator(PANEL), 'the first Escape closes only the submenu').toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.locator(PANEL)).toBeHidden();
    });

    test('choosing a format closes the submenu AND the menu', async ({ page }) => {
        await loadAndRender(page);
        await openToolbarMenu(page, 'export');
        await page.locator(`${EXPORT_SUB} [data-format-label="Org-Mode"]`).click();
        await expect(page.locator(EXPORT_SUB)).toBeHidden();
        await expect(page.locator(PANEL)).toBeHidden();
    });

    test('Ctrl+E opens the menu and the submenu, positioned on the Export row', async ({ page }) => {
        await loadAndRender(page, { sa_enable_direct_ctrl_char_shortcuts: true });
        await page.locator('h2').first().click();
        await page.keyboard.press('Control+e');
        await expect(page.locator(PANEL)).toBeVisible();
        await expect(page.locator(EXPORT_SUB)).toBeVisible();
        await expect(page.locator(`${EXPORT_SUB} [data-format-label="CSV"]`)).toBeFocused();
    });
});

test.describe('the SAED button on a narrow screen', () => {
    test('the actions leave the bar and head the menu as "Load"; Export opens in place', async ({ page }) => {
        await loadAndRender(page);
        await page.setViewportSize({ width: 480, height: 800 });
        await expect(page.locator('#mb-saed-bar')).toHaveClass(/mb-saed-narrow/);
        await expect(page.locator('#mb-saed-bar [data-mb-area="actions"]')).toBeHidden();

        await openToolbarMenu(page, 'saed');
        const groups = await shownGroups(page);
        expect(Object.keys(groups)[0]).toBe('load');
        expect(groups.load).toEqual(['🧮 ⊚ All recordings', '🧮 ♫ Standalone', '🧮 🎬 Video']);

        await page.locator('#mb-export-btn').click();
        const placement = await page.evaluate((s) => {
            const sub = document.querySelector(s);
            return { inline: sub.classList.contains('mb-toolbar-menu-inline'), inData: !!sub.closest('[data-mb-group="data"]') };
        }, EXPORT_SUB);
        expect(placement).toEqual({ inline: true, inData: true });
        await expect(page.locator(`${EXPORT_SUB} [data-format-label="HTML"]`)).toBeVisible();

        // Back to a wide window: the actions are segments again, Load is gone.
        await page.keyboard.press('Escape');
        await page.keyboard.press('Escape');
        await page.setViewportSize({ width: 1280, height: 800 });
        await expect(page.locator('#mb-saed-bar [data-mb-area="actions"]')).toBeVisible();
        await openToolbarMenu(page, 'saed');
        expect((await shownGroups(page)).load).toBeUndefined();
    });
});

/**
 * Pushes the toolbar down by putting a spacer of `height` px at the top of the
 * body, so the menu segment sits where a test needs it.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} height
 */
async function pushToolbarDown(page, height) {
    await page.evaluate((h) => {
        const s = document.createElement('div');
        s.id = 'test-spacer';
        s.style.height = `${h}px`;
        document.body.insertBefore(s, document.body.firstChild);
        window.scrollTo(0, 0);
    }, height);
}

/**
 * The menu segment's and panel's rects, and the window height.
 *
 * @param {import('@playwright/test').Page} page
 */
const menuGeometry = (page) => page.evaluate(([b, p]) => {
    const br = document.querySelector(b).getBoundingClientRect();
    const pe = document.querySelector(p);
    const r = pe.getBoundingClientRect();
    return {
        btnTop: br.top, btnBottom: br.bottom, top: r.top, bottom: r.bottom, height: r.height,
        scrolls: pe.scrollHeight > pe.clientHeight, vh: window.innerHeight,
    };
}, [MENU, PANEL]);

// A menu panel is position: fixed, so the page cannot scroll it into view.
test.describe('the SAED menu fits in the window', () => {
    test('near the window\'s bottom it opens upward, and its rows are reachable', async ({ page }) => {
        await loadAndRender(page);
        await openToolbarMenu(page, 'saed');
        let g = await menuGeometry(page);
        expect(g.top).toBeGreaterThanOrEqual(g.btnBottom);
        await page.locator(MENU).click();
        await expect(page.locator(PANEL)).toBeHidden();

        await pushToolbarDown(page, Math.round(g.vh - g.btnBottom - 20));
        g = await menuGeometry(page);
        expect(g.vh - g.btnBottom).toBeLessThan(25);
        await openToolbarMenu(page, 'saed');
        g = await menuGeometry(page);
        expect(g.bottom).toBeLessThanOrEqual(g.btnTop);
        expect(g.top).toBeGreaterThanOrEqual(0);
        await page.locator('#mb-save-to-disk-btn').click();
        await expect(page.locator('#sa-sd-save-confirm')).toBeVisible();
    });

    test('with too little room on either side it is capped to the window and scrolls inside', async ({ page }) => {
        await loadAndRender(page);
        await openToolbarMenu(page, 'saed');
        const natural = (await menuGeometry(page)).height;
        await page.locator(MENU).click();
        await page.setViewportSize({ width: 1280, height: Math.round(natural + 40) });
        let g = await menuGeometry(page);
        await pushToolbarDown(page, Math.round(g.vh / 2 - (g.btnBottom - g.btnTop) / 2 - g.btnTop));
        await openToolbarMenu(page, 'saed');
        g = await menuGeometry(page);
        expect(g.top).toBeGreaterThanOrEqual(0);
        expect(g.bottom).toBeLessThanOrEqual(g.vh);
        expect(g.height).toBeLessThan(natural);
        expect(g.scrolls).toBe(true);
        const last = page.locator('#mb-saed-devlog-btn');
        await last.scrollIntoViewIfNeeded();
        await expect(last).toBeInViewport();
    });
});
