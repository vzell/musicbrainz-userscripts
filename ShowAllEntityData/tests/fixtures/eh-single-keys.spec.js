'use strict';

// Event Horizon's single-letter keys must not leave MusicBrainz's page.
//
// ── The bug (org/majkinetor.org, "EH's bare-letter keys leave our FRP";
//    measured 2026-11-06 and 2026-11-08 with the live probe, case B) ─────────
//
// majkinetor's Event Horizon (alone or inside String Theory) binds single
// keys — h editing history, e edit, r relationships, o c t d a s p . , — on a
// `document` keydown in the bubble phase, installed even while it is OFF. On
// MusicBrainz's own page a stray `h` went to the entity's /edits page: the
// rendered table was lost, and (vzell, 2026-11-08) the initial page left just
// the same. EH skips an event whose `defaultPrevented` is set (EH:12495), so
// `_ehKeyGuardInstall()` calls `preventDefault()` on those keys in the
// capture phase, on the initial page and after a render, behind
// `sa_block_eh_single_keys` (default on).
//
// What must keep working, and is pinned below: V (EH's on/off switch), every
// key inside EH's own view, typing the same letters into a field, and other
// pages' single keys where Event Horizon is not installed.
//
// Event Horizon is simulated by tests/fixtures/thirdPartyScripts/eh-body-swap.js:
// its body swap, its marks, its launcher and a key listener with EH's own
// guards and key reading, which records the commands it would run in
// `window.__ehSim.fired` instead of navigating.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const RELEASE_URL = 'https://musicbrainz.org/release/1d404e1d-fcb6-3a52-b478-e706e893c897';
const FIXTURE_FILE = path.join(__dirname, 'release-tracks-ms-length.html');
const SIM = fs.readFileSync(path.join(__dirname, 'thirdPartyScripts', 'eh-body-swap.js'), 'utf8');
const TRACKS_BTN = 'button[data-label="Show all Tracks for Release"]';

/**
 * Loads the release fixture with Event Horizon simulated and OFF at load
 * (MusicBrainz's page showing), as after the user switched it off once.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ settings?: Object, noLauncher?: boolean, c3?: string, st?: string, eh?: string, rebind?: Object }} [opts]
 *   `c3`, `st`, `eh`, `rebind`: the simulator's `__EH_SIM_C3__` ('keep' /
 *   'off'), String Theory's version mark, a standalone Event Horizon's
 *   version mark and EH's rebound keys (eh-body-swap.js).
 * @returns {Promise<void>}
 */
async function openRelease(page, { settings = {}, noLauncher = false, c3 = '', st = '', eh = '', rebind = null } = {}) {
    const flags = [`window.__EH_SIM_START_ON__ = false;`];
    if (noLauncher) flags.push('window.__EH_SIM_NO_LAUNCHER__ = true;');
    if (c3) flags.push(`window.__EH_SIM_C3__ = ${JSON.stringify(c3)};`);
    if (st) flags.push(`window.__EH_SIM_ST__ = ${JSON.stringify(st)};`);
    if (eh) flags.push(`window.__EH_SIM_EH__ = ${JSON.stringify(eh)};`);
    if (rebind) flags.push(`window.__EH_SIM_REBIND__ = ${JSON.stringify(rebind)};`);
    await page.context().addInitScript({ content: flags.join(' ') });
    await page.context().addInitScript({ content: SIM });
    await loadUserscriptPage(page, {
        url: RELEASE_URL, fixtureFile: FIXTURE_FILE, testMode: true, settingsOverride: settings,
    });
    await page.waitForFunction(() => !!document.querySelector('#mb-saed-bar'));
}

/**
 * Presses keys with the focus on the page itself (no field focused), then
 * returns what the simulated Event Horizon ran, and clears the record.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string[]} keys - Playwright key names
 * @returns {Promise<string[]>}
 */
async function pressOnPage(page, keys) {
    await page.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); window.__ehSim.fired = []; });
    for (const k of keys) await page.keyboard.press(k);
    return page.evaluate(() => window.__ehSim.fired.splice(0));
}

test.describe('Event Horizon\'s single-letter keys on MusicBrainz\'s page', () => {
    test('initial page: EH\'s single keys (and Shift+H) are ignored, the page stays', async ({ page }) => {
        await openRelease(page);
        const url = page.url();
        // Guarantee: none of EH's page-leaving keys reaches it on the IP.
        expect(await pressOnPage(page, ['h', 'e', 'r', 'o', 'c', 't', 'd', 'a', 's', 'p', '.', ',', 'Shift+H'])).toEqual([]);
        expect(page.url()).toBe(url);
    });

    test('rendered page: EH\'s single keys are ignored, the table stays', async ({ page }) => {
        await openRelease(page);
        await page.click(TRACKS_BTN);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        expect(await pressOnPage(page, ['h', 'e', 'r', '.'])).toEqual([]);
        await expect(page.locator('#mb-filter-container')).toBeVisible();
    });

    test('V still switches EH on, and inside EH\'s own view its keys work', async ({ page }) => {
        await openRelease(page);
        // Guarantee: V is never taken (it is how the user gets to EH and back).
        expect(await pressOnPage(page, ['v'])).toEqual(['v']);
        expect(await page.evaluate(() => window.__ehSim.isOn())).toBe(true);
        // Guarantee: while EH's view shows (<html data-mbu-dock>), its keys are its own.
        // (',' = its settings: no navigation, so the V below need not reload;
        // H in its view loads a new page, see the navigation-guard tests.)
        expect(await pressOnPage(page, [','])).toEqual([',']);
        expect(await pressOnPage(page, ['v'])).toEqual(['v']);
        expect(await page.evaluate(() => window.__ehSim.isOn())).toBe(false);
    });

    test('typing the same letters into a field is untouched', async ({ page }) => {
        await openRelease(page);
        await page.click(TRACKS_BTN);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const input = page.locator('#mb-global-filter-input');
        await input.click();
        await input.fill('');
        await input.pressSequentially('heros');
        // Guarantee: the guard never eats a typed character (the field keeps
        // its own "🔍 " prefix in front of what was typed).
        await expect(input).toHaveValue(/(^|\s)heros$/);
        expect(await page.evaluate(() => window.__ehSim.fired)).toEqual([]);
    });

    test('sa_block_eh_single_keys off: EH\'s keys work as before', async ({ page }) => {
        await openRelease(page, { settings: { sa_block_eh_single_keys: false } });
        expect(await pressOnPage(page, ['h'])).toEqual(['h']);
    });

    test('no Event Horizon on the page: single keys are not touched', async ({ page }) => {
        await openRelease(page, { noLauncher: true });
        // A bubble-phase probe sees whether anything called preventDefault().
        const prevented = await page.evaluate(() => new Promise((resolve) => {
            document.addEventListener('keydown', (e) => resolve(e.defaultPrevented), { once: true });
            if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
            document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true, cancelable: true }));
        }));
        expect(prevented).toBe(false);
    });
});

// ── Convention C3 with data-mbu-keys-keep (#938, 2026-11-20) ────────────────
//
// While a table of ours shows, <html data-mbu-keys-off="saed"
// data-mbu-keys-keep="toggle"> asks Event Horizon to leave every command but
// its on/off one (EH:17972 at a1e8f54): its letters, `u`, Ctrl+P, its player
// keys. EH exempts the `view` COMMAND, whatever key it is bound to, so our
// letter guard steps aside under the marks — or a toggle rebound to `h` would
// be swallowed. The marks need an EH that honours keys-keep, known only from
// String Theory's <html data-mbu-st> version (≥ 2026.11.20.165956, upstream
// 352510c; 2026.11.20.164048 has keys-off without keep, where the marks would
// take V) or a standalone Event Horizon's <html data-mbu-eh> (≥
// 2026.11.22.184100, d8c0030). Elsewhere, and on the initial page (vzell, 2026-11-21), the letter
// guard stays, now with `u`.

const ST_KEEP = '2026.11.20.165956';
const ST_OLD = '2026.11.20.164048';
// A standalone Event Horizon marks <html data-mbu-eh> with its version since
// 2026.11.22.184100 (EH:134 at d8c0030, #938 answer 2026-11-21), a build that
// honours keys-keep; none inside String Theory. A lower value never shipped:
// it stands for a build the floor must keep out.
const EH_KEEP = '2026.11.22.184100';
const EH_OLD = '2026.11.21.190000';

/**
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{off: ?string, keep: ?string}>} the two marks on <html>
 */
const keysMarks = (page) => page.evaluate(() => ({
    off: document.documentElement.getAttribute('data-mbu-keys-off'),
    keep: document.documentElement.getAttribute('data-mbu-keys-keep'),
}));

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

/**
 * Dispatches Ctrl+P on the page body as a synthetic event (a real Ctrl+P
 * would open the browser's print dialog), and returns what the simulated
 * Event Horizon ran and whether anything prevented the default.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{fired: string[], prevented: boolean}>}
 */
const dispatchCtrlP = (page) => page.evaluate(() => {
    window.__ehSim.fired = [];
    const ev = new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, bubbles: true, cancelable: true });
    document.body.dispatchEvent(ev);
    return { fired: window.__ehSim.fired.splice(0), prevented: ev.defaultPrevented };
});

test.describe('C3: data-mbu-keys-off + data-mbu-keys-keep while our table shows', () => {
    test('current String Theory: the marks go up with the table, and EH leaves h, u, Ctrl+P', async ({ page }) => {
        await openRelease(page, { c3: 'keep', st: ST_KEEP });
        // Guarantee: no marks on the initial page (EH's player keys keep working there).
        expect(await keysMarks(page)).toEqual({ off: null, keep: null });
        await renderTracks(page);
        expect(await keysMarks(page)).toEqual({ off: 'saed', keep: 'toggle' });
        expect(await pressOnPage(page, ['h', 'u'])).toEqual([]);
        // Ctrl+P: EH does not take it, nor do we, so the browser's print dialog is back.
        expect(await dispatchCtrlP(page)).toEqual({ fired: [], prevented: false });
        await expect(page.locator('#mb-filter-container')).toBeVisible();
    });

    test('a toggle rebound to "h" still toggles Event Horizon with the marks set', async ({ page }) => {
        await openRelease(page, { c3: 'keep', st: ST_KEEP, rebind: { view: 'h' } });
        await renderTracks(page);
        expect(await keysMarks(page)).toEqual({ off: 'saed', keep: 'toggle' });
        // Guarantee: our letter list steps aside under the marks (EH exempts the
        // view COMMAND, whatever its key), so the rebound toggle reaches EH.
        expect(await pressOnPage(page, ['h'])).toEqual(['h']);
        expect(await page.evaluate(() => window.__ehSim.isOn())).toBe(true);
        await expect.poll(() => keysMarks(page)).toEqual({ off: null, keep: null });
        expect(await pressOnPage(page, ['h'])).toEqual(['h']);
        expect(await page.evaluate(() => window.__ehSim.isOn())).toBe(false);
        await expect.poll(() => keysMarks(page)).toEqual({ off: 'saed', keep: 'toggle' });
    });

    test('V toggles with the marks set; the marks are down in EH\'s view and back after it', async ({ page }) => {
        await openRelease(page, { c3: 'keep', st: ST_KEEP });
        await renderTracks(page);
        expect(await pressOnPage(page, ['v'])).toEqual(['v']);
        expect(await page.evaluate(() => window.__ehSim.isOn())).toBe(true);
        await expect.poll(() => keysMarks(page)).toEqual({ off: null, keep: null });
        expect(await pressOnPage(page, ['v'])).toEqual(['v']);
        expect(await page.evaluate(() => window.__ehSim.isOn())).toBe(false);
        await expect.poll(() => keysMarks(page)).toEqual({ off: 'saed', keep: 'toggle' });
    });

    test('an older String Theory (keys-off without keys-keep): no marks, V works, u is guarded', async ({ page }) => {
        await openRelease(page, { c3: 'off', st: ST_OLD });
        await renderTracks(page);
        // Guarantee: the marks would take V here, so they stay down.
        expect(await keysMarks(page)).toEqual({ off: null, keep: null });
        expect(await pressOnPage(page, ['u', 'h'])).toEqual([]);
        expect(await pressOnPage(page, ['v'])).toEqual(['v']);
        expect(await page.evaluate(() => window.__ehSim.isOn())).toBe(true);
    });

    test('a standalone Event Horizon (no String Theory mark): no marks, u and h guarded on both pages', async ({ page }) => {
        await openRelease(page, { c3: 'keep' });
        expect(await pressOnPage(page, ['u', 'h'])).toEqual([]);
        await renderTracks(page);
        expect(await keysMarks(page)).toEqual({ off: null, keep: null });
        expect(await pressOnPage(page, ['u', 'h'])).toEqual([]);
        await expect(page.locator('#mb-filter-container')).toBeVisible();
    });

    test('a standalone Event Horizon with its version mark: the marks go up, a toggle rebound to "h" works', async ({ page }) => {
        await openRelease(page, { c3: 'keep', eh: EH_KEEP, rebind: { view: 'h' } });
        expect(await keysMarks(page)).toEqual({ off: null, keep: null });
        await renderTracks(page);
        // Guarantee: data-mbu-eh counts like String Theory's mark.
        expect(await keysMarks(page)).toEqual({ off: 'saed', keep: 'toggle' });
        expect(await pressOnPage(page, ['u'])).toEqual([]);
        expect(await pressOnPage(page, ['h'])).toEqual(['h']);
        expect(await page.evaluate(() => window.__ehSim.isOn())).toBe(true);
        await expect.poll(() => keysMarks(page)).toEqual({ off: null, keep: null });
        expect(await pressOnPage(page, ['h'])).toEqual(['h']);
        await expect.poll(() => keysMarks(page)).toEqual({ off: 'saed', keep: 'toggle' });
    });

    test('a standalone Event Horizon mark below 2026.11.22.184100: no marks, V works, u is guarded', async ({ page }) => {
        await openRelease(page, { c3: 'off', eh: EH_OLD });
        await renderTracks(page);
        // Guarantee: the floor applies to data-mbu-eh too (keys-off would take V here).
        expect(await keysMarks(page)).toEqual({ off: null, keep: null });
        expect(await pressOnPage(page, ['u', 'h'])).toEqual([]);
        expect(await pressOnPage(page, ['v'])).toEqual(['v']);
    });

    test('Event Horizon\'s mark set after the render: the marks follow without another render', async ({ page }) => {
        await openRelease(page, { c3: 'keep' });
        await renderTracks(page);
        expect(await keysMarks(page)).toEqual({ off: null, keep: null });
        // Guarantee: EH can start after us; the <html> observer sees its mark.
        await page.evaluate((v) => document.documentElement.setAttribute('data-mbu-eh', v), EH_KEEP);
        await expect.poll(() => keysMarks(page)).toEqual({ off: 'saed', keep: 'toggle' });
    });

    test('String Theory\'s mark set after the render: the marks follow without another render', async ({ page }) => {
        await openRelease(page, { c3: 'keep' });
        await renderTracks(page);
        expect(await keysMarks(page)).toEqual({ off: null, keep: null });
        await page.evaluate((v) => document.documentElement.setAttribute('data-mbu-st', v), ST_KEEP);
        await expect.poll(() => keysMarks(page)).toEqual({ off: 'saed', keep: 'toggle' });
    });

    test('another script\'s keys-off is never overwritten or removed, and gets no keys-keep', async ({ page }) => {
        await openRelease(page, { c3: 'keep', st: ST_KEEP });
        await page.evaluate(() => document.documentElement.setAttribute('data-mbu-keys-off', 'other'));
        await renderTracks(page);
        expect(await keysMarks(page)).toEqual({ off: 'other', keep: null });
        await page.evaluate(() => window.__ehSim.toggle());
        await page.waitForFunction(() => document.documentElement.hasAttribute('data-mbu-dock'));
        await page.evaluate(() => new Promise((r) => setTimeout(r, 50)));
        expect(await keysMarks(page), 'in EH\'s view').toEqual({ off: 'other', keep: null });
        await page.evaluate(() => window.__ehSim.toggle());
        await page.evaluate(() => new Promise((r) => setTimeout(r, 50)));
        expect(await keysMarks(page), 'back on MusicBrainz\'s page').toEqual({ off: 'other', keep: null });
    });

    test('a keys-keep without "toggle" already there: no keys-off from us (V would die)', async ({ page }) => {
        await openRelease(page, { c3: 'keep', st: ST_KEEP });
        await page.evaluate(() => document.documentElement.setAttribute('data-mbu-keys-keep', 'other'));
        await renderTracks(page);
        expect(await keysMarks(page)).toEqual({ off: null, keep: 'other' });
        expect(await pressOnPage(page, ['v'])).toEqual(['v']);
    });

    test('sa_block_eh_single_keys off: no marks, and EH\'s keys work', async ({ page }) => {
        await openRelease(page, { c3: 'keep', st: ST_KEEP, settings: { sa_block_eh_single_keys: false } });
        await renderTracks(page);
        expect(await keysMarks(page)).toEqual({ off: null, keep: null });
        expect(await pressOnPage(page, ['u'])).toEqual(['u']);
    });
});

// ── SAED's leave-page protection and Event Horizon's view ──────────────────
//
// vzell, 2026-11-08: on a rendered page, V to Event Horizon's view, then H —
// SAED's "You are about to leave this page" came up, and OK showed EH's
// history. The live probe (case E) shows that H in EH's view LOADS a new page
// (/edits): the table really is lost, so a warning is right there. But a link
// in EH's view may also open in place (pushState, the table stays: case C),
// and SAED cannot tell which at click time. vzell's choice: no question at
// click time in EH's view (Guards 1 and 3 ignore clicks outside _saBody()),
// and the browser's own "Leave site?" prompt (Guard 4, beforeunload) when the
// page really unloads while EH's view shows — H, or V after EH navigated
// (EH:11490 reloads). On MusicBrainz's own rendered page SAED still asks.
//
// The simulator follows the measured EH: #eh-sim-edits (and H) load a page,
// #eh-sim-inplace opens in place, V after an in-place move reloads.

test.describe('leaving from Event Horizon\'s view after a render', () => {
    /**
     * Renders the release with every dialog recorded as { type, message }
     * and dismissed (a dismissed beforeunload cancels the leave). A page EH
     * would load (…/edits, …/aliases on reload) is answered locally.
     *
     * @param {import('@playwright/test').Page} page
     * @returns {Promise<Array<{type: string, message: string}>>} the live list
     */
    async function renderWithDialogLog(page) {
        const dialogs = [];
        page.on('dialog', (d) => { dialogs.push({ type: d.type(), message: d.message() }); d.dismiss().catch(() => {}); });
        await page.route(/musicbrainz\.org\/release\/[0-9a-f-]{36}\/(edits|aliases)/, (route) => route.fulfill({
            status: 200, contentType: 'text/html', body: '<!doctype html><title>left</title><h1 id="left">left the page</h1>',
        }));
        await openRelease(page);
        await page.click(TRACKS_BTN);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        return dialogs;
    }

    /**
     * Whether the rendered table is still on this page.
     *
     * @param {import('@playwright/test').Page} page
     * @returns {Promise<boolean>}
     */
    const tableStays = (page) => page.evaluate(() => !!document.querySelector('#mb-filter-container') && !document.getElementById('left'));

    test('rendered page → V → H in EH\'s view (EH loads a page): the browser\'s leave prompt, not SAED\'s question', async ({ page }) => {
        const dialogs = await renderWithDialogLog(page);
        expect(await pressOnPage(page, ['v'])).toEqual(['v']);
        await page.evaluate(() => { window.__ehSim.fired = []; });
        await page.keyboard.press('h');
        // Guarantee: a real leave from EH's view is warned about, once, by
        // the browser (beforeunload), and dismissing it keeps the table.
        await expect.poll(() => dialogs.length).toBe(1);
        expect(dialogs[0].type).toBe('beforeunload');
        expect(await tableStays(page)).toBe(true);
    });

    test('rendered page → V → a link EH opens in place: no question at all', async ({ page }) => {
        const dialogs = await renderWithDialogLog(page);
        await pressOnPage(page, ['v']);
        await page.click('#eh-sim-inplace');
        await expect.poll(() => page.evaluate(() => window.__ehSim.navs.length)).toBe(1);
        // Guarantee: an in-place move asks nothing (the old false alarm).
        expect(dialogs).toEqual([]);
        expect(await tableStays(page)).toBe(true);
    });

    test('rendered page → V → in-place link → V (EH reloads): the browser\'s leave prompt', async ({ page }) => {
        const dialogs = await renderWithDialogLog(page);
        await pressOnPage(page, ['v']);
        await page.click('#eh-sim-inplace');
        await page.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
        await page.keyboard.press('v');
        // Guarantee: EH's reload (EH:11490) is a real leave and is warned about.
        await expect.poll(() => dialogs.length).toBe(1);
        expect(dialogs[0].type).toBe('beforeunload');
        expect(await tableStays(page)).toBe(true);
    });

    test('control: a link click on MusicBrainz\'s own rendered page gets SAED\'s question, once', async ({ page }) => {
        const dialogs = await renderWithDialogLog(page);
        const url = page.url();
        await page.locator('table.tbl tbody a[href*="/recording/"]').first().click();
        await expect.poll(() => dialogs.length).toBe(1);
        // Guarantee: SAED's own wording, no second (browser) prompt on top.
        expect(dialogs[0].type).toBe('confirm');
        expect(dialogs[0].message).toContain('You are about to leave this page');
        expect(page.url()).toBe(url);
    });

    test('control: OK on SAED\'s question leaves, with no browser prompt on top', async ({ page }) => {
        const dialogs = [];
        page.on('dialog', (d) => { dialogs.push(d.type()); (d.type() === 'confirm' ? d.accept() : d.dismiss()).catch(() => {}); });
        await page.route(/musicbrainz\.org\/recording\//, (route) => route.fulfill({
            status: 200, contentType: 'text/html', body: '<!doctype html><title>left</title><h1 id="left">left the page</h1>',
        }));
        await openRelease(page);
        await page.click(TRACKS_BTN);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await Promise.all([page.waitForURL(/\/recording\//), page.locator('table.tbl tbody a[href*="/recording/"]').first().click()]);
        // Guarantee: on MusicBrainz's page Guard 4 stays silent (Guard 1 asked already).
        expect(dialogs).toEqual(['confirm']);
    });

    test('no table rendered: H in EH\'s view leaves without any prompt', async ({ page }) => {
        const dialogs = [];
        page.on('dialog', (d) => { dialogs.push(d.type()); d.dismiss().catch(() => {}); });
        await page.route(/musicbrainz\.org\/release\/[0-9a-f-]{36}\/edits/, (route) => route.fulfill({
            status: 200, contentType: 'text/html', body: '<!doctype html><title>left</title><h1 id="left">left the page</h1>',
        }));
        await openRelease(page);
        await pressOnPage(page, ['v']);
        // A mouse click first: Chromium shows a beforeunload prompt only after
        // a user activation (the rendered-page tests get one from the Tracks
        // click), so without it this test could not see a wrong prompt at all.
        await page.click('#app h1');
        await Promise.all([page.waitForURL(/\/edits$/), page.keyboard.press('h')]);
        // Guarantee: nothing to lose, nothing asked.
        expect(dialogs).toEqual([]);
    });
});
