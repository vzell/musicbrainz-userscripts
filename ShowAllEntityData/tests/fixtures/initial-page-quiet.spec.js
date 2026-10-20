'use strict';

// A quieter initial page (IP): the page of a supported MusicBrainz pageType
// before any button is pressed (org/initial-page-footprint.org, asked
// 2026-10-20).
//
//  b. Link previews get a master switch (sa_pop_enabled) and an IP switch
//     (sa_pop_initial_page), both on by default.
//  c. The sidebar's collapse handle is there on the IP already, with the
//     sidebar OPEN (sa_sidebar_handle_initial_page, sa_sidebar_collapsed_
//     initial_page); the consolidated view still starts collapsed
//     (sa_sidebar_collapsed).
//
// Guarantees pinned, each named:
//   - DEFAULT CARD: with the defaults a link on the IP still gets its card;
//   - MASTER OFF: no engine at all — no stylesheet, nothing resolves, no
//     card, before and after a render;
//   - IP OFF: nothing resolves on the IP, the same link resolves and shows
//     its card once the table is rendered;
//   - IP HANDLE: the handle exists on the IP, the sidebar is open, and the
//     #page / #content / #sidebar boxes are EXACTLY those of a page without
//     the handle (an open sidebar keeps MusicBrainz's layout);
//   - IP TOGGLE: the handle collapses and reopens the sidebar on the IP;
//   - FRP COLLAPSED: after the render the sidebar is collapsed (the default);
//   - IP COLLAPSED: sa_sidebar_collapsed_initial_page collapses it on the IP;
//   - NO IP HANDLE: with sa_sidebar_handle_initial_page off the IP has no
//     handle, the render builds it collapsed (the behaviour before).

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { clickMasterToggleAndExpandAll } = require('../support/liveAssertions');

const URL = 'https://musicbrainz.org/release-group/d5f992ab-6238-3b28-bf2b-7b16d913c9f6';
const FIXTURE = path.join(__dirname, 'rel-release-group-overview.html');
// sidebar-collapse-handle.spec.js's excerpt of MusicBrainz's table layout
// (the fixtures carry no MB stylesheet).
const MB_LAYOUT = '#page { display: table; width: 100%; padding: 16px; box-sizing: border-box; }'
    + ' #content { display: table-cell; padding-right: 16px; }'
    + ' #sidebar { display: table-cell; vertical-align: top; padding-left: 16px; width: 218px; border-left: 1px solid #ddd; }';
const BUTTON = 'button[data-label="Show all Releases for ReleaseGroup"]';
// A release title link in MusicBrainz's own table (a `table.tbl > tbody
// a[href]` the MusicBrainz source claims), on the IP and in the rendered
// table alike — not the cover-art link before it, which has no text box.
const LINK = 'table.tbl > tbody a.wrap-anywhere[href^="/release/"]';

/**
 * Opens the release group's IP with `settings`; the ws/2 lookups a card
 * makes get an empty answer.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} [settings]
 */
async function openIp(page, settings = {}) {
    await page.setViewportSize({ width: 1400, height: 800 });
    await loadUserscriptPage(page, {
        url: URL, fixtureFile: FIXTURE, testMode: true,
        settingsOverride: { sa_collabsable_sidebar: true, sa_rich_tooltip_delay_ms: 0, ...settings },
    });
    await page.addStyleTag({ content: MB_LAYOUT });
    await page.route('**/ws/2/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await page.route(`${URL}*`, (route) => route.fulfill({ path: FIXTURE, contentType: 'text/html' }));
}

/** Renders the consolidated table, every sub-table open. */
async function render(page) {
    await page.click(BUTTON);
    await waitForRenderComplete(page);
    await clickMasterToggleAndExpandAll(page);
}

/** The layout boxes an open sidebar must leave alone, and the handle state. */
const layout = (page) => page.evaluate(() => {
    const box = (id) => { const r = document.getElementById(id).getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round); };
    const sb = document.getElementById('sidebar');
    return {
        page: box('page'), content: box('content'), sidebar: box('sidebar'),
        handle: !!document.getElementById('sidebar-toggle-handle'),
        collapsed: sb.classList.contains('sidebar-collapsed'),
    };
});

/** Whether the popup engine claims the first matching link. */
const resolves = (page) => page.evaluate((sel) => !!window.__saTest.popResolve(document.querySelector(sel)), LINK);

test.describe('initial page: link previews', () => {
    const PREVIEWS = { sa_pop_mb: true, sa_dp_hover_without_ctrl: true };

    test('DEFAULT CARD: a link on the initial page gets its card', async ({ page }) => {
        await openIp(page, PREVIEWS);
        expect(await page.evaluate(() => !!document.querySelector('table.tbl.mb-rendered, #mb-global-filter-input')), 'premise: nothing rendered').toBe(false);
        await page.mouse.move(0, 0);
        await page.locator(LINK).first().hover();
        await expect(page.locator('#mb-dp-peek')).toBeVisible();
    });

    test('MASTER OFF: no engine at all, before and after a render', async ({ page }) => {
        await openIp(page, { ...PREVIEWS, sa_pop_enabled: false });
        expect(await page.evaluate(() => !!document.getElementById('mb-dp-style')), 'no preview stylesheet').toBe(false);
        await render(page);
        expect(await page.evaluate(() => !!document.getElementById('mb-dp-style'))).toBe(false);
        await page.mouse.move(0, 0);
        await page.locator(LINK).first().hover();
        // The engine never ran: neither its peek element nor its style exist.
        expect(await page.evaluate(() => !!document.getElementById('mb-dp-peek'))).toBe(false);
    });

    test('IP OFF: nothing resolves before the render, the card shows after it', async ({ page }) => {
        await openIp(page, { ...PREVIEWS, sa_pop_initial_page: false });
        expect(await resolves(page), 'the initial page: no preview').toBe(false);
        await render(page);
        expect(await resolves(page), 'the rendered table: previews as set').toBe(true);
        await page.mouse.move(0, 0);
        await page.locator(LINK).first().hover();
        await expect(page.locator('#mb-dp-peek')).toBeVisible();
    });

    test('IP ON (default): the same link resolves on the initial page', async ({ page }) => {
        await openIp(page, PREVIEWS);
        expect(await resolves(page)).toBe(true);
    });
});

test.describe('initial page: the sidebar handle', () => {
    test('IP HANDLE: the handle is there, the sidebar open, the layout exactly MusicBrainz\'s', async ({ page }) => {
        await openIp(page, { sa_sidebar_handle_initial_page: false });
        const without = await layout(page);
        expect(without.handle, 'premise: no handle when switched off').toBe(false);

        // Seeded explicitly: the GM stubs keep the first load's values.
        await openIp(page, { sa_sidebar_handle_initial_page: true });
        const withHandle = await layout(page);
        expect(withHandle.handle).toBe(true);
        expect(withHandle.collapsed).toBe(false);
        expect({ page: withHandle.page, content: withHandle.content, sidebar: withHandle.sidebar },
            'an open sidebar keeps the native layout').toEqual({ page: without.page, content: without.content, sidebar: without.sidebar });
    });

    test('IP TOGGLE: the handle collapses and reopens the sidebar before any button', async ({ page }) => {
        await openIp(page);
        const before = await layout(page);
        await page.click('#sidebar-toggle-handle');
        await expect.poll(async () => (await layout(page)).collapsed).toBe(true);
        await expect.poll(async () => (await layout(page)).content[2], 'the content takes the width').toBeGreaterThan(before.content[2]);
        await page.click('#sidebar-toggle-handle');
        await expect.poll(async () => (await layout(page)).collapsed).toBe(false);
    });

    test('FRP COLLAPSED: the render collapses the sidebar (sa_sidebar_collapsed, the default)', async ({ page }) => {
        await openIp(page, { sa_sidebar_collapsed: true });
        expect((await layout(page)).collapsed, 'open on the initial page').toBe(false);
        await render(page);
        const g = await layout(page);
        expect(g).toMatchObject({ handle: true, collapsed: true });
        expect(await page.evaluate(() => document.querySelectorAll('#sidebar-toggle-handle').length), 'one handle').toBe(1);
    });

    test('IP COLLAPSED: sa_sidebar_collapsed_initial_page collapses it from the start', async ({ page }) => {
        await openIp(page, { sa_sidebar_collapsed_initial_page: true });
        expect(await layout(page)).toMatchObject({ handle: true, collapsed: true });
    });

    test('NO IP HANDLE: switched off, the render still builds it collapsed', async ({ page }) => {
        await openIp(page, { sa_sidebar_handle_initial_page: false, sa_sidebar_collapsed: true });
        expect((await layout(page)).handle).toBe(false);
        await render(page);
        expect(await layout(page)).toMatchObject({ handle: true, collapsed: true });
    });
});
