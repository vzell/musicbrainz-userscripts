'use strict';

// The Brucebase side bar (#side-bar) on every Brucebase pageType:
// _bbArrangeSideBar() makes #content-wrap a flex row, keeps the side bar on
// the left (or moves it to the RIGHT of #main-content with
// sa_bb_sidebar_right, default off since 2026-10-09), keeps it in view while
// the page scrolls down or sideways (sticky on both axes), and gives it the
// MusicBrainz sidebar's collapse handle under its OWN setting
// (sa_bb_collabsable_sidebar, default off), starting collapsed while
// sa_sidebar_collapsed is on; it collapses toward its own side. Also pins
// that the sticky Date column docks under its h2 bar when the page is
// scrolled sideways, and masks nothing before. Fixture: the
// 2026 year page (scripts/build-bb-fixtures.py). See docs/claude/brucebase.md.

const { test, expect } = require('../support/test');
const { loadBbYearPage } = require('../support/bbFixture');
const { waitForRenderComplete } = require('../support/browser');

// sa_bb_sidebar_right seeded as undefined: its schema default (off). The
// handle is opt-in (sa_bb_collabsable_sidebar), so most tests turn it on.
const DEFAULTS = { sa_bb_sidebar_right: undefined, sa_bb_collabsable_sidebar: true, sa_sidebar_collapsed: true };
const RIGHT = { ...DEFAULTS, sa_bb_sidebar_right: true };

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

/**
 * Reads the painted colour of one viewport pixel from a screenshot.
 * @param {import('@playwright/test').Page} page
 * @param {number} x
 * @param {number} y
 * @returns {Promise<string>} "r,g,b".
 */
async function pixelAt(page, x, y) {
    const png = await page.screenshot({ clip: { x, y, width: 1, height: 1 } });
    return page.evaluate(async (b64) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = 1;
        c.height = 1;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        return Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)).join(',');
    }, png.toString('base64'));
}

test('on the right (opt-in) the side bar moves after the content, starts hidden, and the handle shows it', async ({ page }) => {
    const errors = trackPageErrors(page);
    await loadBbYearPage(page, '2026', { settingsOverride: RIGHT });
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

test('by default it stays on the left, first, and collapses to the left', async ({ page }) => {
    const errors = trackPageErrors(page);
    await loadBbYearPage(page, '2026', { settingsOverride: DEFAULTS });
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
    await loadBbYearPage(page, '2026', { settingsOverride: { ...RIGHT, sa_bb_collabsable_sidebar: false } });
    await expect(page.locator('h1.mb-bb-h1')).toHaveCount(1);
    const l = await layout(page);
    expect(l.handle).toBeNull();
    expect(l.order).toEqual(['main-content', 'side-bar']);
    expect(l.cls).toEqual(['mb-bb-cw', 'mb-bb-sb-right']);
    expect(l.side).not.toBeNull();
    expect(errors).toEqual([]);
});

test('the handle has its own setting: off by default, whatever MusicBrainz\'s sidebar setting says', async ({ page }) => {
    // Requested 2026-10-09: a Brucebase-only "Collabsable sidebar", default
    // off. MusicBrainz's sa_collabsable_sidebar (default on) no longer
    // reaches this side bar.
    const errors = trackPageErrors(page);
    await loadBbYearPage(page, '2026', {
        settingsOverride: { sa_bb_collabsable_sidebar: undefined, sa_collabsable_sidebar: true, sa_sidebar_collapsed: true },
    });
    await expect(page.locator('h1.mb-bb-h1')).toHaveCount(1);
    const l = await layout(page);
    expect(l.handle).toBeNull();
    expect(l.cls).toEqual(['mb-bb-cw', 'mb-bb-sb-left']);
    expect(l.side).not.toBeNull();
    expect(errors).toEqual([]);
});

for (const [name, settings] of [['left', DEFAULTS], ['right', RIGHT]]) {
    test(`the ${name} side bar stays in view when the rendered page scrolls down and sideways`, async ({ page }) => {
        // Requested 2026-10-09 (screenshots of /2026): scrolled down, the
        // side bar went off the top with the rest of the page. It is sticky
        // on both axes now, and on the left it sits over the docked Date
        // column's gutter mask, with Date docking just to its right.
        const errors = trackPageErrors(page);
        await loadBbYearPage(page, '2026', {
            settingsOverride: { ...settings, sa_sidebar_collapsed: false, sa_enable_sticky_page_headers: true },
        });
        // The theme's side-bar box (base: width 14em, padding 1em;
        // flannel-ocean: #F0F0F5), which the fixture strips: the gutter mask
        // is page-coloured, so only a coloured side bar shows whether the
        // mask paints over it, and the padding gives a pixel with no text.
        await page.addStyleTag({ content: '#side-bar { width: 14em; padding: 1em; background-color: #F0F0F5; }' });
        await page.click('button[data-label="Show all events"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });

        /**
         * Reads the side bar's box, whether a hit test at its centre lands
         * in it, and the Date header's left edge.
         * @returns {Promise<Object>}
         */
        const read = () => page.evaluate(() => {
            const side = document.getElementById('side-bar');
            const r = side.getBoundingClientRect();
            const hit = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height, window.innerHeight) / 2);
            const th = document.querySelector('table.tbl').tHead.rows[0].cells[0];
            return {
                top: Math.round(r.top),
                left: Math.round(r.left),
                right: Math.round(r.right),
                bottom: Math.round(r.bottom),
                hitInside: side.contains(hit),
                dateLeft: Math.round(th.getBoundingClientRect().left),
                vw: window.innerWidth,
                vh: window.innerHeight,
            };
        });
        const natural = await read();
        const scrollDown = Math.max(1500, natural.top + 500);
        await page.evaluate((y) => window.scrollTo(0, y), scrollDown);
        await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBe(scrollDown);
        let s = await read();
        expect(s.top, 'stuck at the top').toBe(0);
        expect(s.bottom).toBeLessThanOrEqual(s.vh);
        expect(s.hitInside).toBe(true);

        await page.evaluate((y) => window.scrollTo(700, y), scrollDown);
        await expect.poll(() => page.evaluate(() => Math.round(window.scrollX))).toBe(700);
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        s = await read();
        expect(s.top).toBe(0);
        expect(s.hitInside, 'over the table').toBe(true);
        // A box-shadow is invisible to hit testing, so read the paint: the
        // side bar's own padding, half way down, must keep its colour.
        expect(await pixelAt(page, s.left + 3, Math.round(s.vh / 2)), 'painted over the gutter mask').toBe('240,240,245');
        // At the window's edge on its own side; on the left, Date docks
        // right of it.
        const edge = name === 'left'
            ? { atEdge: s.left === 0, dateClear: s.dateLeft >= s.right }
            : { atEdge: s.right <= s.vw && s.left > s.vw / 2, dateClear: true };
        expect(edge, JSON.stringify(s)).toEqual({ atEdge: true, dateClear: true });
        expect(errors).toEqual([]);
    });
}

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
        settingsOverride: { ...RIGHT, sa_sidebar_collapsed: false, sa_enable_sticky_page_headers: true },
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

/**
 * Reads the Date column's and its h2 bar's left edges, the table's docked
 * state and the first row's cell shadows.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object>}
 */
function alignment(page) {
    return page.evaluate(() => {
        const t = document.querySelector('table.tbl');
        const h2 = document.querySelector('h2.mb-bb-list-heading');
        const th = t.tHead.rows[0].cells[0];
        return {
            first: th.dataset.colName,
            dateLeft: Math.round(th.getBoundingClientRect().left),
            h2Left: Math.round(h2.getBoundingClientRect().left),
            docked: t.classList.contains('mb-sph-col-docked'),
            shadow: getComputedStyle(t.tBodies[0].rows[0].cells[0]).boxShadow !== 'none',
            scrollX: Math.round(window.scrollX),
        };
    });
}

/**
 * Scrolls the page sideways and waits two frames, by which the sticky page
 * headers have re-measured and re-docked.
 * @param {import('@playwright/test').Page} page
 * @param {number} x
 */
async function scrollTo(page, x) {
    await page.evaluate((v) => window.scrollTo(v, 0), x);
    await expect.poll(() => page.evaluate(() => Math.round(window.scrollX))).toBe(x);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

for (const [name, sidebarOpen] of [['collapsed', false], ['open', true]]) {
    test(`left side bar ${name}: scrolled sideways, Date stays under its h2 bar; unscrolled, no mask`, async ({ page }) => {
        // Reported from a real browser (2026-10-09): scrolled to the right,
        // the Date column docked at the window's edge while its "Events" bar
        // stayed pinned further in. The column alignment of the sticky page
        // headers puts it under the bar — but a first sticky column counts
        // as docked at scrollX 0 and its gutter mask then painted over the
        // side bar, so a Brucebase table docks only once scrolled.
        const errors = trackPageErrors(page);
        await loadBbYearPage(page, '2026', {
            settingsOverride: { ...DEFAULTS, sa_sidebar_collapsed: !sidebarOpen, sa_enable_sticky_page_headers: true },
        });
        await page.click('button[data-label="Show all events"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await scrollTo(page, 0);
        const before = await alignment(page);
        expect(before).toEqual(expect.objectContaining({ first: 'Date', docked: false, shadow: false }));
        expect((await layout(page)).side !== null).toBe(sidebarOpen);

        await scrollTo(page, 700);
        const after = await alignment(page);
        expect(after).toEqual(expect.objectContaining({ docked: true, shadow: true, scrollX: 700 }));
        expect(Math.abs(after.dateLeft - after.h2Left)).toBeLessThanOrEqual(1);
        expect(errors).toEqual([]);
    });
}

test('opening the side bar re-measures, so Date still docks under its h2 bar', async ({ page }) => {
    const errors = trackPageErrors(page);
    await loadBbYearPage(page, '2026', { settingsOverride: { ...DEFAULTS, sa_enable_sticky_page_headers: true } });
    await page.click('button[data-label="Show all events"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
    const h2Before = (await alignment(page)).h2Left;
    await page.click('#mb-bb-sidebar-handle');
    // The open side bar pushes the table right; the bar moves with it.
    await expect.poll(async () => (await alignment(page)).h2Left).toBeGreaterThan(h2Before + 100);
    await scrollTo(page, 700);
    const after = await alignment(page);
    expect(after.docked).toBe(true);
    expect(Math.abs(after.dateLeft - after.h2Left)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
});
