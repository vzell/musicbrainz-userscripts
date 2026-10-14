'use strict';

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// The collapsible sidebar's handle (initSidebarCollapse(), sa_collabsable_sidebar)
// on a page wider than the window (2026-10-14, reported on a release group):
//   - an OPENED sidebar is in view at the window's right edge at scrollX 0.
//     It is the last cell of MB's #page table, so on a wide page its own
//     place is past that edge; auto-resize made it `position: sticky;
//     left: 0`, which never applied there, and the sidebar only slid in
//     while scrolling right (`right: 0` now);
//   - the handle sits at the sidebar's TOP (it was at 50% of the window),
//     flush against its left edge once the slide and the sticky page
//     headers' switch have settled (a single measurement landed 50 px off);
//   - collapsed, the handle is at the window's right edge, at the top of
//     #content.
// The fixtures carry no MB stylesheet: MB_LAYOUT is the excerpt
// sticky-page-headers.spec.js uses for the same table layout.

const URL = 'https://musicbrainz.org/release-group/d5f992ab-6238-3b28-bf2b-7b16d913c9f6';
const FIXTURE = path.join(__dirname, 'rel-release-group-overview.html');
const MB_LAYOUT = '#page { display: table; width: 100%; padding: 16px; box-sizing: border-box; }'
    + ' #content { display: table-cell; padding-right: 16px; }'
    + ' #sidebar { display: table-cell; vertical-align: top; padding-left: 16px; width: 218px; border-left: 1px solid #ddd; }';

/**
 * Opens the release group's releases at a 1000 px window, with the sidebar
 * collapsible and starting collapsed, and waits for the render.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function open(page) {
    await page.setViewportSize({ width: 1000, height: 720 });
    await loadUserscriptPage(page, {
        url: URL, fixtureFile: FIXTURE, testMode: true,
        settingsOverride: { sa_collabsable_sidebar: true, sa_sidebar_collapsed: true },
    });
    await page.addStyleTag({ content: MB_LAYOUT });
    await page.click('button[data-label="Show all Releases for ReleaseGroup"]');
    await waitForRenderComplete(page);
}

/** The sidebar's and the handle's boxes, the window width and the scroll. */
const geo = (page) => page.evaluate(() => {
    const box = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, width: r.width }; };
    return {
        vw: document.documentElement.clientWidth,
        scrollW: document.documentElement.scrollWidth,
        scrollX: window.scrollX,
        collapsed: document.getElementById('sidebar').classList.contains('sidebar-collapsed'),
        sidebar: box(document.getElementById('sidebar')),
        handle: box(document.getElementById('sidebar-toggle-handle')),
        contentTop: document.getElementById('content').getBoundingClientRect().top,
    };
});

test.describe('the sidebar handle on a page wider than the window', () => {
    test('collapsed: the handle is at the right edge, at the top of #content', async ({ page }) => {
        await open(page);
        const g = await geo(page);
        expect(g.collapsed, 'premise: starts collapsed').toBe(true);
        expect(Math.round(g.handle.right)).toBeGreaterThanOrEqual(g.vw - 1);
        expect(Math.abs(g.handle.top - Math.max(8, g.contentTop)), 'at the top of #content').toBeLessThanOrEqual(1);
    });

    test('opened: the sidebar is in view at the right edge, the handle at its top-left corner', async ({ page }) => {
        await open(page);
        await page.click('#sidebar-toggle-handle');
        // The content slides for 0.3 s after the click: settled once the
        // page width reads the same twice and the handle is against the sidebar.
        let lastW = -1;
        await expect.poll(async () => {
            const g = await geo(page);
            const settled = g.scrollW === lastW;
            lastW = g.scrollW;
            return settled && !g.collapsed && Math.abs(g.handle.right - g.sidebar.left) <= 1.5;
        }, { message: 'the layout settles, the handle against the sidebar', intervals: [100, 100, 150, 200, 250] }).toBe(true);
        const g = await geo(page);
        expect(g.scrollW, 'premise: the page is wider than the window').toBeGreaterThan(g.vw + 50);
        expect(g.scrollX).toBe(0);
        expect(g.sidebar.width).toBeGreaterThan(100);
        expect(Math.round(g.sidebar.right), 'the sidebar ends at the window edge, not past it').toBeLessThanOrEqual(g.vw);
        expect(g.sidebar.left, 'all of it in view').toBeGreaterThanOrEqual(g.vw - g.sidebar.width - 1);
        expect(Math.abs(g.handle.top - Math.max(8, g.sidebar.top)), 'at the sidebar\'s top').toBeLessThanOrEqual(1);
    });

    test('closed again: the handle goes back to the right edge', async ({ page }) => {
        await open(page);
        await page.click('#sidebar-toggle-handle');
        await expect.poll(async () => !(await geo(page)).collapsed).toBe(true);
        await page.click('#sidebar-toggle-handle');
        await expect.poll(async () => {
            const g = await geo(page);
            return g.collapsed && Math.round(g.handle.right) >= g.vw - 1;
        }).toBe(true);
    });
});
