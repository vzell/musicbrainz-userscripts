'use strict';

// Brucebase's top-bar menus ("Manage Site", "Help Docs", …) must stay usable
// with our toolbar and status line under them (vzell, 2026-11-11, Image #18:
// the entries could not be clicked, before any press too).
// org/brucebase.org, Phase 7; docs/claude/brucebase.md, "Styling".
//
// The fixture has no theme CSS (build-bb-fixtures.py strips the @imports), so
// the rules that place the menu are added here verbatim from Wikidot's
// common--theme/base/css/style.css and flannel-ocean/css/style.css (fetched
// 2026-11-11): #header is relative with z-index 30, #top-bar absolute at its
// bottom, a dropdown is an absolute <ul> shown on li:hover.

const { test, expect } = require('../support/test');
const { loadBbChangesPage } = require('../support/bbFixture');
const { waitForRenderComplete } = require('../support/browser');

const WIKIDOT_HEADER_CSS = `
#container-wrap-wrap { position: relative; }
#header { position: relative; z-index: 30; height: 9em; border-bottom: 3px solid #707080; }
#top-bar { position: absolute; right: 10em; bottom: 0px; z-index: 0; }
#top-bar ul { display: block; margin: 0; padding: 0; list-style: none; }
#top-bar li { list-style: none; float: left; margin: 0 5px; padding: 0; }
#top-bar li ul { padding: 0; margin: 0; width: 12em; border: 1px solid #EEE; }
#top-bar li ul li { padding: 0; margin: 0; display: block; float: none; }
#top-bar li a { text-align: center; display: block; margin: 0; padding: 1px 1em; text-decoration: none; }
#top-bar li ul li a { width: 10em; text-align: left; background-color: #FFF; border: none; }
#top-bar li ul { position: absolute; visibility: hidden; }
#top-bar li:hover ul, #top-bar li.sfhover ul { visibility: visible; }
`;

/**
 * Opens a top-bar dropdown by hovering its toggle, then reports, for every
 * entry, which element the browser hits at the entry's centre.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} label - The toggle's text ("Manage Site").
 * @returns {Promise<Array<{text: string, hit: string, ok: boolean}>>}
 */
async function hitsOfMenu(page, label) {
    const toggle = page.locator('#top-bar li.dropdown > a.dropdown-toggle', { hasText: label });
    await toggle.hover();
    return page.evaluate((lbl) => {
        const li = [...document.querySelectorAll('#top-bar li.dropdown')]
            .find(x => x.querySelector(':scope > a').textContent.trim() === lbl);
        return [...li.querySelectorAll('ul.dropdown-menu > li > a')]
            .filter(a => a.getClientRects().length)
            .map((a) => {
                const r = a.getBoundingClientRect();
                const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
                const name = el ? `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''}` : 'null';
                return { text: a.textContent.trim(), hit: name, ok: !!el && (el === a || a.contains(el)) };
            });
    }, label);
}

/**
 * Hovers a dropdown's toggle, then walks the pointer straight down, in small
 * steps as a hand does, to the centre of its last entry: the menu must stay
 * open the whole way (a covering element takes the li's :hover and closes
 * it). Then clicks the entry named `pick` and reports the href clicked (the
 * click's navigation is cancelled by a listener of the test).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} label - The toggle's text.
 * @param {string} pick - An entry's text.
 * @returns {Promise<{closedAt: number, clicked: string}>}
 */
async function walkAndClick(page, label, pick) {
    await page.evaluate(() => {
        window.__bbMenuClicks = [];
        document.addEventListener('click', (e) => {
            const a = e.target.closest('#top-bar a');
            if (a) {
                window.__bbMenuClicks.push(a.getAttribute('href'));
                e.preventDefault();
            }
        }, true);
    });
    const li = page.locator('#top-bar li.dropdown', { has: page.locator(':scope > a.dropdown-toggle', { hasText: label }) });
    const toggle = li.locator(':scope > a.dropdown-toggle');
    const t = await toggle.boundingBox();
    const entries = li.locator('ul.dropdown-menu > li > a');
    await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2);
    const last = await entries.last().boundingBox();
    const x = last.x + 20;
    const y0 = t.y + t.height / 2;
    const y1 = last.y + last.height / 2;
    let closedAt = -1;
    for (let i = 1, n = 30; i <= n; i++) {
        const y = y0 + (y1 - y0) * i / n;
        await page.mouse.move(x, y);
        const vis = await li.locator('ul.dropdown-menu').evaluate(u => getComputedStyle(u).visibility);
        if (vis !== 'visible') { closedAt = Math.round(y); break; }
    }
    const target = entries.filter({ hasText: pick });
    const b = await target.boundingBox();
    await page.mouse.move(b.x + 20, b.y + b.height / 2, { steps: 5 });
    await page.mouse.down();
    await page.mouse.up();
    const clicks = await page.evaluate(() => window.__bbMenuClicks);
    return { closedAt, clicked: clicks[clicks.length - 1] || '' };
}

test.describe('Brucebase top-bar menus (Phase 7)', () => {
    test.use({ viewport: { width: 1600, height: 900 } });

    test('every Manage Site entry is on top, before and after a press', async ({ page }) => {
        await loadBbChangesPage(page);
        await page.addStyleTag({ content: WIKIDOT_HEADER_CSS });
        // The case at all: the menu does open over our toolbar h1.
        const h1 = await page.locator('h1.mb-bb-h1').boundingBox();
        const before = await hitsOfMenu(page, 'Manage Site');
        expect(before.length).toBeGreaterThan(3);
        const menu = await page.locator('#top-bar li.dropdown ul.dropdown-menu').first().boundingBox();
        expect(menu.y).toBeLessThan(h1.y + h1.height);
        expect(menu.y + menu.height).toBeGreaterThan(h1.y);
        expect(before.filter(h => !h.ok)).toEqual([]);

        await page.mouse.move(5, 890);
        await page.click('button[data-label="Show the last 200 changes"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        // Rendered: the status line has its text and is part of the stuck block.
        await expect(page.locator('#mb-status-displays-wrapper')).toHaveClass(/mb-vsb-head/);
        const after = await hitsOfMenu(page, 'Manage Site');
        expect(after.filter(h => !h.ok)).toEqual([]);

        // Focus left on a toolbar button (after a press, or Tab) raises the
        // stuck block to 107 (SPH_Z_RAISED): the header must stay above that.
        await page.mouse.move(5, 890);
        await page.locator('#mb-saed-menu-btn').focus();
        await expect.poll(() => page.locator('h1.mb-bb-h1').evaluate(h => getComputedStyle(h).zIndex)).toBe('107');
        const focused = await hitsOfMenu(page, 'Manage Site');
        expect(focused.filter(h => !h.ok)).toEqual([]);
    });

    test('the pointer reaches an entry and its click lands, on both menus', async ({ page }) => {
        await loadBbChangesPage(page);
        await page.addStyleTag({ content: WIKIDOT_HEADER_CSS });
        // A loaded table asks before a link leaves the page (the navigation
        // guard, a native confirm): yes, so the click goes through to the
        // page's own listener below, which records it and stays.
        const asked = [];
        page.on('dialog', (d) => { asked.push(d.type()); d.accept(); });
        await page.mouse.move(5, 890);
        await page.click('button[data-label="Show the last 200 changes"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const manage = await walkAndClick(page, 'Manage Site', 'Pages');
        expect(manage).toEqual({ closedAt: -1, clicked: '/manage:page-list' });
        await page.mouse.move(5, 890);
        const help = await walkAndClick(page, 'Help Docs', 'First Time User');
        expect(help).toEqual({ closedAt: -1, clicked: '/help:first-time-user' });
        expect(asked).toEqual(['confirm', 'confirm']);
    });

    test('the lift is the sticky bars\': off, no class on #header', async ({ page }) => {
        await loadBbChangesPage(page, { settingsOverride: { sa_enable_sticky_filter_bars: false } });
        await expect(page.locator('h1.mb-bb-h1')).toBeVisible();
        await expect(page.locator('#header')).not.toHaveClass(/mb-vsb-chrome/);
        await expect(page.locator('h1.mb-bb-h1')).not.toHaveClass(/mb-vsb-head/);
    });
});
