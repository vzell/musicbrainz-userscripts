'use strict';

// The Brucebase side bar (#side-bar) on every Brucebase pageType:
// _bbArrangeSideBar() makes #content-wrap a flex row, moves the side bar to
// the RIGHT of #main-content (sa_bb_sidebar_right, default on), and gives it
// the MusicBrainz sidebar's collapse handle (sa_collabsable_sidebar),
// starting collapsed while sa_sidebar_collapsed is on. On the left it
// collapses to the left. Fixture: the 2026 year page
// (scripts/build-bb-fixtures.py). See docs/claude/brucebase.md.

const { test, expect } = require('../support/test');
const { loadBbYearPage } = require('../support/bbFixture');
const { waitForRenderComplete } = require('../support/browser');

const DEFAULTS = { sa_bb_sidebar_right: true, sa_collabsable_sidebar: true, sa_sidebar_collapsed: true };

/**
 * Collects uncaught page errors, so every test can end by asserting none.
 * @param {import('@playwright/test').Page} page
 * @returns {string[]}
 */
function trackPageErrors(page) {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    return errors;
}

/**
 * Reads the layout: child order of #content-wrap, its classes, the side
 * bar's and main content's boxes, and the handle's state and box.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object>}
 */
function layout(page) {
    return page.evaluate(() => {
        const wrap = document.getElementById('content-wrap');
        const side = document.getElementById('side-bar');
        const main = document.getElementById('main-content');
        const handle = document.getElementById('mb-bb-sidebar-handle');
        const box = (el) => {
            if (!el || getComputedStyle(el).display === 'none') return null;
            const r = el.getBoundingClientRect();
            return { left: Math.round(r.left), right: Math.round(r.right) };
        };
        return {
            order: Array.from(wrap.children).map((c) => c.id),
            cls: ['mb-bb-cw', 'mb-bb-sb-right', 'mb-bb-sb-left', 'mb-bb-sb-collapsed'].filter((c) => wrap.classList.contains(c)),
            side: box(side),
            main: box(main),
            handle: handle ? { ...box(handle), pressed: handle.getAttribute('aria-pressed'), side: handle.className } : null,
            vw: window.innerWidth,
        };
    });
}

test('by default the side bar moves to the right, starts hidden, and the handle shows it', async ({ page }) => {
    const errors = trackPageErrors(page);
    await loadBbYearPage(page, '2026', { settingsOverride: DEFAULTS });
    await expect(page.locator('#mb-bb-sidebar-handle')).toBeVisible();
    let l = await layout(page);
    expect(l.order).toEqual(['main-content', 'side-bar']);
    expect(l.cls).toEqual(['mb-bb-cw', 'mb-bb-sb-right', 'mb-bb-sb-collapsed']);
    expect(l.side).toBeNull();
    expect(l.handle).toEqual(expect.objectContaining({ pressed: 'false', side: expect.stringContaining('mb-bb-handle-right') }));
    expect(l.vw - l.handle.right).toBeLessThanOrEqual(1);

    await page.click('#mb-bb-sidebar-handle');
    await expect.poll(async () => (await layout(page)).side).not.toBeNull();
    l = await layout(page);
    expect(l.cls).not.toContain('mb-bb-sb-collapsed');
    expect(l.handle.pressed).toBe('true');
    // On the right of the main content, the handle against its left edge.
    expect(l.side.left).toBeGreaterThanOrEqual(l.main.right);
    expect(Math.abs(l.handle.right - l.side.left)).toBeLessThanOrEqual(1);

    await page.focus('#mb-bb-sidebar-handle');
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await layout(page)).side).toBeNull();
    expect(errors).toEqual([]);
});

test('on the left it stays first and collapses to the left', async ({ page }) => {
    const errors = trackPageErrors(page);
    await loadBbYearPage(page, '2026', { settingsOverride: { ...DEFAULTS, sa_bb_sidebar_right: false } });
    await expect(page.locator('#mb-bb-sidebar-handle')).toBeVisible();
    let l = await layout(page);
    expect(l.order).toEqual(['side-bar', 'main-content']);
    expect(l.cls).toEqual(['mb-bb-cw', 'mb-bb-sb-left', 'mb-bb-sb-collapsed']);
    expect(l.side).toBeNull();
    expect(l.handle).toEqual(expect.objectContaining({ left: 0, side: expect.stringContaining('mb-bb-handle-left') }));

    await page.click('#mb-bb-sidebar-handle');
    await expect.poll(async () => (await layout(page)).side).not.toBeNull();
    l = await layout(page);
    expect(l.side.right).toBeLessThanOrEqual(l.main.left);
    expect(Math.abs(l.handle.left - l.side.right)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
});

test('without the collapsible sidebar there is no handle and the side bar shows', async ({ page }) => {
    const errors = trackPageErrors(page);
    await loadBbYearPage(page, '2026', { settingsOverride: { ...DEFAULTS, sa_collabsable_sidebar: false } });
    await expect(page.locator('h1.mb-bb-h1')).toHaveCount(1);
    const l = await layout(page);
    expect(l.handle).toBeNull();
    expect(l.order).toEqual(['main-content', 'side-bar']);
    expect(l.cls).toEqual(['mb-bb-cw', 'mb-bb-sb-right']);
    expect(l.side).not.toBeNull();
    expect(errors).toEqual([]);
});

test('with the year pages off the wiki\'s layout is left alone', async ({ page }) => {
    const errors = trackPageErrors(page);
    const logs = [];
    page.on('console', (msg) => logs.push(msg.text()));
    await loadBbYearPage(page, '2026', { years: false, settingsOverride: DEFAULTS });
    await expect.poll(() => logs.some((t) => t.includes('year pages are off'))).toBe(true);
    const l = await layout(page);
    expect(l.order).toEqual(['side-bar', 'main-content']);
    expect(l.cls).toEqual([]);
    expect(l.handle).toBeNull();
    expect(errors).toEqual([]);
});

test('after a table is rendered the open side bar stays at the window\'s right edge', async ({ page }) => {
    // Reported from a real page (2026-10-09): the sticky page headers widen
    // the content to the table's width, which put the side bar's natural
    // place 4,800 px to the right; it had also become one of their pinned
    // bodies (sticky against the LEFT). Now it is excluded from pinning and
    // sticks to the right edge.
    const errors = trackPageErrors(page);
    await loadBbYearPage(page, '2026', {
        settingsOverride: { ...DEFAULTS, sa_sidebar_collapsed: false, sa_enable_sticky_page_headers: true },
    });
    await page.click('button[data-label="Show all events"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
    const state = await page.evaluate(() => {
        const side = document.getElementById('side-bar');
        const r = side.getBoundingClientRect();
        const h = document.getElementById('mb-bb-sidebar-handle').getBoundingClientRect();
        return {
            widened: document.getElementById('content-wrap').getBoundingClientRect().width > window.innerWidth,
            pinned: side.classList.contains('mb-sph-target') || !!side.querySelector('.mb-sph-target'),
            position: getComputedStyle(side).position,
            inView: r.left >= 0 && Math.round(r.right) <= window.innerWidth,
            handleAtEdge: Math.abs(h.right - r.left) <= 1,
        };
    });
    expect(state).toEqual({ widened: true, pinned: false, position: 'sticky', inView: true, handleAtEdge: true });
    expect(errors).toEqual([]);
});
