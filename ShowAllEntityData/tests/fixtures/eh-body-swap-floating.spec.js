'use strict';

// SAED's floating elements must survive Event Horizon's body swap.
//
// ── The bug (org/majkinetor.org, "SAED's floating elements survive Event
//    Horizon's body swap"; measured 2026-11-08 with the live probe) ───────────
//
// Event Horizon (majkinetor; on by default once installed) puts its own
// <body> in front of MusicBrainz's and hides MusicBrainz's, so while it
// shows, `document.body` is EH's body. SAED starts then, and everything it
// appended once to `document.body` and kept by reference landed in EH's body:
//
//   - the sidebar handle (#sidebar-toggle-handle) showed over EH's view,
//     where it toggles MusicBrainz's hidden sidebar (vzell's finding 1);
//   - V (EH off) removes EH's body and takes those elements along: no hover
//     cards (#mb-stat-tooltip), no sidebar handle on the initial page or the
//     rendered one (initSidebarCollapse('final') never rebuilds it), no
//     #mb-vsb-mask.
//
// With EH OFF at load the handle sits in MusicBrainz's body, hides with it
// while EH shows and comes back on V — correct, and pinned by the control
// test below (vzell's finding 2).
//
// The fix: `_saBody()`, MusicBrainz's own <body> (the one holding #page),
// receives every persistent floating host.
//
// The swap is simulated by tests/fixtures/thirdPartyScripts/eh-body-swap.js,
// which does what EH's setOn() does, verbatim.

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
 * Loads the release fixture with the body-swap simulator registered first.
 *
 * @param {import('@playwright/test').Page} page
 * @param {boolean} ehOnAtLoad - whether "Event Horizon" shows when SAED starts
 * @returns {Promise<void>}
 */
async function openRelease(page, ehOnAtLoad) {
    if (!ehOnAtLoad) await page.context().addInitScript({ content: 'window.__EH_SIM_START_ON__ = false;' });
    await page.context().addInitScript({ content: SIM });
    await loadUserscriptPage(page, {
        url: RELEASE_URL, fixtureFile: FIXTURE_FILE, testMode: true,
        // the handle on the initial page and the sticky filter bars are
        // schema defaults; seeded here so the test does not depend on them
        settingsOverride: {
            sa_collabsable_sidebar: true,
            sa_sidebar_handle_initial_page: true,
            sa_enable_sticky_filter_bars: true,
            sa_rich_tooltip_delay_ms: 0,
        },
    });
    // SAED is up once its toolbar exists (in MusicBrainz's body, hidden or not)
    await page.waitForFunction(() => !!document.querySelector('#mb-saed-bar'));
    expect(await page.evaluate(() => window.__ehSim.isOn()), 'the simulated EH state at load').toBe(ehOnAtLoad);
}

/**
 * Where an element is: in MusicBrainz's body (the one holding #page), in the
 * simulated EH body, or nowhere; whether it can be seen; how many there are.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} sel
 * @returns {Promise<{ where: string, visible: boolean, copies: number }>}
 */
function locate(page, sel) {
    return page.evaluate((s) => {
        const all = document.querySelectorAll(s);
        const el = all[0];
        if (!el) return { where: 'none', visible: false, copies: 0 };
        const mb = document.getElementById('page').closest('body');
        const where = mb.contains(el) ? 'mb' : (window.__ehSim.ehBody && window.__ehSim.ehBody.contains(el) ? 'eh' : 'other');
        const r = el.getBoundingClientRect();
        return { where, visible: r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden', copies: all.length };
    }, sel);
}

test.describe('SAED floating elements and Event Horizon\'s body swap', () => {
    test('EH on at load: the sidebar handle lives in MusicBrainz\'s body, hidden under EH, back and working after V and the render', async ({ page }) => {
        await openRelease(page, true);
        // Guarantee: never drawn over EH's view (finding 1).
        expect(await locate(page, '#sidebar-toggle-handle')).toEqual({ where: 'mb', visible: false, copies: 1 });

        await page.evaluate(() => window.__ehSim.off());
        // Guarantee: present after V, on the initial page (finding 1, second half).
        await expect.poll(() => locate(page, '#sidebar-toggle-handle')).toEqual({ where: 'mb', visible: true, copies: 1 });

        await page.click(TRACKS_BTN);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        // Guarantee: present on the rendered page too, exactly one.
        expect(await locate(page, '#sidebar-toggle-handle')).toEqual({ where: 'mb', visible: true, copies: 1 });

        // ...and it works: a click collapses MusicBrainz's sidebar.
        const before = await page.evaluate(() => document.getElementById('sidebar').classList.contains('sidebar-collapsed'));
        await page.click('#sidebar-toggle-handle');
        await expect.poll(() => page.evaluate(() => document.getElementById('sidebar').classList.contains('sidebar-collapsed'))).toBe(!before);
    });

    test('EH on at load: hover cards work after V', async ({ page }) => {
        await openRelease(page, true);
        await page.evaluate(() => window.__ehSim.off());
        const btn = page.locator(TRACKS_BTN);
        await expect(btn).toBeVisible();
        await btn.hover();
        // Guarantee: the one card host is in the document and shows a card.
        await expect.poll(() => page.evaluate(() => {
            const t = document.getElementById('mb-stat-tooltip');
            return !!t && t.isConnected && getComputedStyle(t).display !== 'none' && t.getBoundingClientRect().height > 0;
        })).toBe(true);
        expect((await locate(page, '#mb-stat-tooltip')).where).toBe('mb');
    });

    test('EH on at load: the sticky-bar mask and the ☰ SAED panel stay in MusicBrainz\'s body after V', async ({ page }) => {
        await openRelease(page, true);
        await page.evaluate(() => window.__ehSim.off());
        // #mb-vsb-mask is made once at start-up (initStickyFilterBars()) and
        // kept in _vsb.mask; it must still be in the document.
        expect((await locate(page, '#mb-vsb-mask')).where).toBe('mb');
        await page.click('#mb-saed-menu-btn');
        await expect.poll(async () => (await locate(page, '#mb-saed-menu-btn-panel')).where).toBe('mb');
        expect((await locate(page, '#mb-saed-menu-btn-panel')).visible).toBe(true);
    });

    test('EH off at load (control): the handle hides with MusicBrainz\'s page under EH and comes back on V', async ({ page }) => {
        await openRelease(page, false);
        expect(await locate(page, '#sidebar-toggle-handle')).toEqual({ where: 'mb', visible: true, copies: 1 });
        await page.evaluate(() => window.__ehSim.on());
        expect(await locate(page, '#sidebar-toggle-handle')).toEqual({ where: 'mb', visible: false, copies: 1 });
        await page.evaluate(() => window.__ehSim.off());
        await expect.poll(() => locate(page, '#sidebar-toggle-handle')).toEqual({ where: 'mb', visible: true, copies: 1 });
    });
});
