'use strict';

// The conventions agreed with majkinetor in #938 (upstream 9e4cdd59;
// org/majkinetor.org, "Shared conventions"), this script's side:
//
//   - data-mbu-quiet="saed" on <html> while a table of ours shows on
//     MusicBrainz's page (String Theory's corner launchers and dock hide),
//     never while Event Horizon's view shows, with a ☰ row to bring them back
//     (_mbuQuietSync(), sa_mbu_quiet_corner);
//   - launchers in Event Horizon's More (⋯) menu: hidden
//     button[data-mbu-menu-item] under <html>, only while its view shows and
//     only for a page we support, decided from <html data-mbu-page>
//     (_ehMenuSync()); choosing one switches EH off as V does and, for a
//     button item, presses that button — at once, or after EH's reload
//     (_ehHandoff(), _ehHandoffResume());
//   - data-mbu-foreign="saed" on a single-table render too (the multi-table
//     case is in release-tracks-isrc-scout.spec.js);
//   - Ctrl+L kept from Event Horizon (its history.forward()) when our direct
//     Ctrl+L "Load from disk" acts on it (_ehKeyGuardInstall()).
//
// Event Horizon is simulated by tests/fixtures/thirdPartyScripts/eh-body-swap.js
// (its body swap, <html data-mbu-dock>/<html data-mbu-page>, the launcher,
// the keys and foreignMenuSync()'s projection: __ehSim.menuItems()/select()).

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { clickToolbarItem } = require('../support/toolbarMenu');

const RELEASE_PATH = '/release/1d404e1d-fcb6-3a52-b478-e706e893c897';
const RELEASE_URL = 'https://musicbrainz.org' + RELEASE_PATH;
const FIXTURE_FILE = path.join(__dirname, 'release-tracks-ms-length.html');
const SIM = fs.readFileSync(path.join(__dirname, 'thirdPartyScripts', 'eh-body-swap.js'), 'utf8');
const TRACKS_BTN = 'button[data-label="Show all Tracks for Release"]';
const TRACKS_TITLE = 'SAED: Show all Tracks for Release';

/**
 * Loads the release fixture with Event Horizon simulated.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ settings?: Object, ehOn?: boolean, noLauncher?: boolean, handoff?: Object, quietOwner?: string }} [opts]
 *   `handoff`: a sessionStorage record seeded before the page loads (the
 *   page Event Horizon reloaded into); `quietOwner`: another script's
 *   data-mbu-quiet value, set once the page has loaded.
 * @returns {Promise<void>}
 */
async function openRelease(page, { settings = {}, ehOn = false, noLauncher = false, handoff = null, quietOwner = null } = {}) {
    await page.context().addInitScript({ content: `window.__EH_SIM_START_ON__ = ${ehOn};${noLauncher ? ' window.__EH_SIM_NO_LAUNCHER__ = true;' : ''}` });
    if (handoff) {
        await page.context().addInitScript({ content: `try { sessionStorage.setItem('sa_eh_handoff', ${JSON.stringify(JSON.stringify(handoff))}); } catch (e) {}` });
    }
    // Every press of a definition button, as the handoff makes it (a synthetic click).
    await page.context().addInitScript({ content: `window.__saPressed = []; document.addEventListener('click', (e) => { const b = e.target && e.target.closest && e.target.closest('button[data-mb-def-idx]'); if (b) window.__saPressed.push(b.dataset.label); }, true);` });
    await page.context().addInitScript({ content: SIM });
    await loadUserscriptPage(page, {
        url: RELEASE_URL, fixtureFile: FIXTURE_FILE, testMode: true, settingsOverride: settings,
    });
    await page.waitForFunction(() => !!document.querySelector('#mb-saed-bar'));
    // Set after the load: an init script's attribute on <html> does not survive the parser.
    if (quietOwner) await page.evaluate((v) => document.documentElement.setAttribute('data-mbu-quiet', v), quietOwner);
}

/**
 * Presses "Show all Tracks for Release" and waits for the render.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function renderTracks(page) {
    await page.click(TRACKS_BTN);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/** @returns {Promise<?string>} <html data-mbu-quiet>, or null */
const quiet = (page) => page.evaluate(() => document.documentElement.getAttribute('data-mbu-quiet'));
/** @returns {Promise<string[]>} the definition buttons pressed so far (labels) */
const pressed = (page) => page.evaluate(() => window.__saPressed);
/** @returns {Promise<?string>} the sessionStorage handoff record, or null */
const handoffRecord = (page) => page.evaluate(() => sessionStorage.getItem('sa_eh_handoff'));

test.describe('data-mbu-quiet while our table shows', () => {
    test('up after the render, down while Event Horizon\'s view shows, up again after V', async ({ page }) => {
        await openRelease(page);
        // Pins: not on the initial page — only a table of ours asks for it.
        expect(await quiet(page)).toBeNull();
        await renderTracks(page);
        expect(await quiet(page)).toBe('saed');
        await page.evaluate(() => window.__ehSim.on());
        await expect.poll(() => quiet(page)).toBeNull();
        await page.evaluate(() => window.__ehSim.off());
        await expect.poll(() => quiet(page)).toBe('saed');
    });

    test('the ☰ View row shows the launchers again and hides them again', async ({ page }) => {
        await openRelease(page);
        await renderTracks(page);
        const row = page.locator('#mb-mbu-quiet-btn');
        await expect(row).toContainText('Show corner launchers');
        await clickToolbarItem(page, '#mb-mbu-quiet-btn');
        expect(await quiet(page)).toBeNull();
        await expect(row).toContainText('Hide corner launchers');
        await clickToolbarItem(page, '#mb-mbu-quiet-btn');
        expect(await quiet(page)).toBe('saed');
    });

    test('setting off: no mark and no ☰ row', async ({ page }) => {
        await openRelease(page, { settings: { sa_mbu_quiet_corner: false } });
        await renderTracks(page);
        expect(await quiet(page)).toBeNull();
        await expect(page.locator('#mb-mbu-quiet-btn')).toHaveCount(0);
    });

    test('another script\'s mark is neither overwritten nor removed', async ({ page }) => {
        await openRelease(page, { quietOwner: 'other-script' });
        await renderTracks(page);
        expect(await quiet(page)).toBe('other-script');
        await page.evaluate(() => window.__ehSim.on());
        await page.evaluate(() => window.__ehSim.off());
        expect(await quiet(page)).toBe('other-script');
    });

    test('no majkinetor script on the page: no ☰ row', async ({ page }) => {
        await openRelease(page, { noLauncher: true });
        await renderTracks(page);
        await expect(page.locator('#mb-mbu-quiet-btn')).toHaveCount(0);
    });
});

test.describe('launchers in Event Horizon\'s More (⋯) menu', () => {
    test('while its view shows a page of ours: "Open in" first, then one item per button', async ({ page }) => {
        await openRelease(page, { ehOn: true });
        const items = await page.evaluate(() => window.__ehSim.menuItems());
        expect(items[0]).toEqual({ id: 'saed:open', title: 'Open in ShowAllEntityData' });
        expect(items.map((i) => i.title)).toContain(TRACKS_TITLE);
        expect(items.every((i) => i.id.startsWith('saed:'))).toBe(true);
        // The launchers sit directly under <html> (they survive the body swaps) and stay hidden.
        const where = await page.evaluate(() => [...document.querySelectorAll('button[data-mbu-menu-item]')]
            .map((b) => ({ parent: b.parentElement.tagName, hidden: b.hidden })));
        expect(where.every((w) => w.parent === 'HTML' && w.hidden)).toBe(true);
    });

    test('they follow the page Event Horizon shows, never MusicBrainz\'s hidden one', async ({ page }) => {
        await openRelease(page, { ehOn: true });
        // An in-view move to a page we have no pageType for: no launcher.
        await page.evaluate(() => window.__ehSim.navigate('/no-such-musicbrainz-page'));
        await expect.poll(() => page.evaluate(() => window.__ehSim.menuItems().length)).toBe(0);
        // An artist's recordings: its own button, not the release's.
        await page.evaluate(() => window.__ehSim.navigate('/artist/70248960-cb53-4ea4-943a-edb18f7d336f/recordings'));
        await expect.poll(() => page.evaluate(() => window.__ehSim.menuItems().map((i) => i.title)))
            .toContain('SAED: ⊚ All recordings');
        const titles = await page.evaluate(() => window.__ehSim.menuItems().map((i) => i.title));
        expect(titles).not.toContain(TRACKS_TITLE);
    });

    test('none while MusicBrainz\'s page shows', async ({ page }) => {
        await openRelease(page, { ehOn: true });
        await page.evaluate(() => window.__ehSim.off());
        await expect.poll(() => page.evaluate(() => document.querySelectorAll('button[data-mbu-menu-item]').length)).toBe(0);
    });

    test('a button item on the loaded page: EH off, that button pressed, the table rendered', async ({ page }) => {
        await openRelease(page, { ehOn: true });
        await page.evaluate((t) => {
            const item = window.__ehSim.menuItems().find((i) => i.title === t);
            window.__ehSim.select(item.id);
        }, TRACKS_TITLE);
        expect(await page.evaluate(() => window.__ehSim.isOn())).toBe(false);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await expect(page.locator('#mb-filter-container')).toBeVisible();
        expect(await handoffRecord(page)).toBeNull();
    });

    test('"Open in" on the loaded page: EH off, no button pressed', async ({ page }) => {
        await openRelease(page, { ehOn: true });
        await page.evaluate(() => window.__ehSim.select('saed:open'));
        expect(await page.evaluate(() => window.__ehSim.isOn())).toBe(false);
        // "Open in" writes no record, so nothing is pending that could press
        // later; a press would have started a fetch in the same task.
        expect(await handoffRecord(page)).toBeNull();
        expect(await pressed(page)).toEqual([]);
    });

    test('after Event Horizon\'s reload: a fresh record for this page presses its button', async ({ page }) => {
        // What _ehHandoff() leaves for the page EH reloads into (idx 0: the
        // release's first button, "Show all Tracks for Release").
        await openRelease(page, { handoff: { page: RELEASE_PATH, idx: 0, at: Date.now() } });
        await expect.poll(() => pressed(page)).toEqual(['Show all Tracks for Release']);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await expect(page.locator('#mb-filter-container')).toBeVisible();
        expect(await handoffRecord(page)).toBeNull();
    });

    for (const [what, rec] of [
        ['a stale record', { page: RELEASE_PATH, idx: 0, at: Date.now() - 10 * 60 * 1000 }],
        ['a record for another page', { page: '/release/00000000-0000-0000-0000-000000000000', idx: 0, at: Date.now() }],
    ]) {
        test(`after a reload: ${what} presses nothing and is dropped`, async ({ page }) => {
            await openRelease(page, { handoff: rec });
            // The buttons are there (openRelease() waits for the bar), so a
            // record that would press has done so by the time it is gone:
            // _ehHandoffResume() drops it and clicks in the same task.
            await expect.poll(() => handoffRecord(page)).toBeNull();
            expect(await pressed(page)).toEqual([]);
        });
    }
});

test.describe('Ctrl+L with Event Horizon', () => {
    /**
     * Presses Ctrl+L on the page (no field focused) and returns what the
     * simulated Event Horizon ran.
     *
     * @param {import('@playwright/test').Page} page
     * @returns {Promise<string[]>}
     */
    async function ctrlL(page) {
        await page.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); window.__ehSim.fired = []; });
        await page.keyboard.press('Control+l');
        return page.evaluate(() => window.__ehSim.fired.splice(0));
    }

    test('direct Ctrl+letter shortcuts on: Ctrl+L is ours, EH does not go forward', async ({ page }) => {
        await openRelease(page, { settings: { sa_enable_direct_ctrl_char_shortcuts: true } });
        expect(await ctrlL(page)).toEqual([]);
    });

    test('direct Ctrl+letter shortcuts off (the default): Ctrl+L stays Event Horizon\'s', async ({ page }) => {
        // Pins: we take the key only when our handler acts on it.
        await openRelease(page, { settings: { sa_enable_direct_ctrl_char_shortcuts: false } });
        expect(await ctrlL(page)).toEqual(['ctrl+l']);
    });

    test('inside Event Horizon\'s view Ctrl+L is its own', async ({ page }) => {
        await openRelease(page, { ehOn: true, settings: { sa_enable_direct_ctrl_char_shortcuts: true } });
        expect(await ctrlL(page)).toEqual(['ctrl+l']);
    });
});

test('a single-table render is marked data-mbu-foreign="saed" too', async ({ page }) => {
    await loadUserscriptPage(page, {
        url: 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f/works',
        fixtureFile: path.join(__dirname, 'artist-works-attributes.html'),
        testMode: true,
    });
    await page.click('button[data-label="Show all Works for Artist"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
    const marks = await page.evaluate(() => [...document.querySelectorAll('table.tbl')].map((t) => t.getAttribute('data-mbu-foreign')));
    expect(marks).toEqual(['saed']);
});
