'use strict';

// Sticky Page Headers (`sa_enable_sticky_page_headers`, initStickyPageHeaders()).
//
// ── What the feature promises ───────────────────────────────────────────────
//
// While a wide table is scrolled horizontally at WINDOW level, the page chrome
// — the MusicBrainz top header, the entity header (or bare h1), the tabs,
// every h2 section bar, every h3 sub-table bar and the footer — stays where it
// is instead of scrolling off to the left. Pure CSS `position: sticky`, so the
// only way to know it works is to scroll and measure.
//
// ── What this spec pins, and why it is shaped this way ──────────────────────
//
// The central assertion is GEOMETRIC: each pinned element's left edge is the
// same after scrolling to the far right as it was at scrollX = 0, while a
// table cell's left edge moved by the whole scroll distance (the premise —
// without it, "nothing moved" would also be what an unscrolled page shows).
// Asserting only that `.mb-sph-target` is present would pin "marked", not
// "pinned": the class is set by the refresh pass, while the pinning depends
// on three containing-block preconditions (see the section comment above
// _sphEnsureStyle()) that can each fail with every class still in place.
//
// The second half of the contract is "only while needed": inert while the
// sidebar is expanded and columns are not auto-resized, a no-op with the
// setting off, and it lets go again once the overflow is gone. The last one
// is a real bug fixed before the port (WIP.2): MB's `body { margin: auto }`
// let <body> lock at its widest width, so the feature could never disengage.
//
// ── What this spec CANNOT see ───────────────────────────────────────────────
//
// The fixtures load without MusicBrainz's stylesheet. So #page is not
// display: table, the collapsed #sidebar is a 0-width block below #content
// instead of #page's right-hand cell, and its translateX(100%) ghost box —
// which the `#sidebar.sidebar-collapsed { transform: none }` rule exists to
// remove — cannot occur. That guard is recorded as `"expect": "pass"` in
// scripts/mutations/sticky-page-headers.json and needs a live spec.
//
// Each negative assertion ("does NOT engage") is followed by a positive
// control in the same test that makes it engage by removing exactly the one
// condition under test, so a refresh pass that simply never ran cannot pass
// for "correctly declined".

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { waitForSortSettled } = require('../support/filterSortAssertions');

// series-releases: single-table page with div.header, a seriesheader entity
// block, .tabs, three h2 bars, #sidebar and #footer — every body-level and
// content-level target kind except h3, and a table thousands of px wide.
const SERIES_URL = 'https://musicbrainz.org/series/aa3694d3-a3d0-48ed-8f07-5b576de87908';
const SERIES_SHELL = path.join(__dirname, '..', 'snapshots', 'series-releases', 'raw.html');

// user-ratings: multi-table page, one h3 bar per entity group.
const RATINGS_URL = 'https://musicbrainz.org/user/vzell/ratings';
const RATINGS_SHELL = path.join(__dirname, 'user-ratings-multigroup.html');

const VIEWPORT = { width: 900, height: 800 };

// The refresh pass is debounced by SPH_REFRESH_DELAY_MS (60 ms) behind a
// ResizeObserver round-trip, then runs in the next animation frame. Kept
// generous (a busy frame can be late), so that a negative assertion cannot
// pass merely because the pass has not run yet. Used ONLY ahead of a negative
// assertion that is then followed by a positive control (see the header
// comment).
const REFRESH_SETTLE_MS = 1000;

/**
 * Lets the post-render focus land, then takes focus and pointer away from the
 * chrome.
 *
 * Two things otherwise poison the measurements:
 *   - the global filter input is focused shortly AFTER the render completes,
 *     and `focus()` scrolls it into view — measured: a scroll to scrollX 4658
 *     was pulled back to 70 by it;
 *   - a pinned element is raised to z-index 107 while it is hovered or
 *     contains focus (by design), and Playwright's pointer rests at (0, 0),
 *     i.e. on the MB header.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function settleFocusAndPointer(page) {
    await page.waitForFunction(
        () => document.activeElement && document.activeElement.id === 'mb-global-filter-input',
        null, { timeout: 5000 }).catch(() => {});
    await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
    const vp = page.viewportSize();
    await page.mouse.move(vp.width - 2, vp.height - 2);
}

/**
 * Opens the series fixture at VIEWPORT and renders the consolidated table.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} [opts]
 * @param {object} [opts.settingsOverride] - extra GM settings
 * @param {string} [opts.css] - stylesheet injected BEFORE the render, so it is
 *   in place when the feature first sees the page (it captures each target's
 *   native position/z-index on first sight)
 * @param {function(import('@playwright/test').Page): Promise<void>} [opts.beforeRender]
 *   - runs after the userscript is loaded and before the render is started
 * @returns {Promise<void>}
 */
async function openSeries(page, { settingsOverride = {}, css, beforeRender } = {}) {
    await page.setViewportSize(VIEWPORT);
    await loadUserscriptPage(page, {
        url: SERIES_URL,
        fixtureFile: SERIES_SHELL,
        testMode: true,
        settingsOverride,
    });
    if (css) await page.addStyleTag({ content: css });
    if (beforeRender) await beforeRender(page);
    // Clicked through the DOM: an injected sticky header can sit over the
    // button, and Playwright's hit-test would then refuse a real click.
    await page.$eval('button[data-label="Show all Releases for Series"]', (b) => b.click());
    await waitForRenderComplete(page, {
        waitForAutoResize: settingsOverride.sa_auto_resize_columns !== false,
    });
    await settleFocusAndPointer(page);
}

/**
 * Waits until the feature is engaged (`html.mb-sph-on`).
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
const waitEngaged = (page) => page.waitForFunction(
    () => document.documentElement.classList.contains('mb-sph-on'), null, { timeout: 10000 });

/**
 * Waits until the feature is disengaged (no `html.mb-sph-on`).
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
const waitDisengaged = (page) => page.waitForFunction(
    () => !document.documentElement.classList.contains('mb-sph-on'), null, { timeout: 10000 });

/**
 * Document overflow beside the viewport width — the premise of every test.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{scrollWidth: number, clientWidth: number}>}
 */
const overflow = (page) => page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
}));

/**
 * Geometry of every element that MUST be pinned, plus a table cell as the
 * scroll premise. `expected` is built from the page structure, independently
 * of the feature's own target collection, so a target that silently drops out
 * of `_sphCollectTargets()` is reported missing rather than not measured.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string[]} selectors - CSS selectors; every match outside a table and
 *   outside #sidebar that is rendered is expected
 * @returns {Promise<{scrollX: number, clientWidth: number, cellLeft: number,
 *   items: Array<{key: string, marked: boolean, left: number, right: number}>}>}
 */
const measure = (page, selectors) => page.evaluate((sels) => {
    const sidebar = document.getElementById('sidebar');
    const items = [];
    const all = new Set(sels.flatMap((sel) => Array.from(document.querySelectorAll(sel))));
    // An element nested inside another expected one is not a target of its
    // own (a sticky box inside a clamped sticky box has no room to travel).
    const nested = (el) => {
        for (let p = el.parentElement; p; p = p.parentElement) if (all.has(p)) return true;
        return false;
    };
    sels.forEach((sel) => {
        document.querySelectorAll(sel).forEach((el, i) => {
            // The PARENT's ancestry: a section body may itself be a table.
            const inTable = el.parentElement && el.parentElement.closest('table');
            if (inTable || (sidebar && sidebar.contains(el))) return;
            if (el.getClientRects().length === 0 || nested(el)) return;
            const r = el.getBoundingClientRect();
            items.push({
                key: `${sel}[${i}]`,
                // Pinned itself, or carried by a pinned ancestor (a bar
                // inside a pinned section body is not a target of its own).
                marked: !!el.closest('.mb-sph-target'),
                left: r.left,
                right: r.right,
            });
        });
    });
    // The last VISIBLE cell of the widest rendered table: never the sticky
    // column, never a hidden column (0x0, it would not move), and on a
    // multi-table page never a collapsed or narrow sub-table.
    const widest = Array.from(document.querySelectorAll('table.tbl'))
        .filter((t) => t.getClientRects().length > 0)
        .sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
    const cells = widest ? Array.from(widest.querySelectorAll('tbody tr:first-child td')) : [];
    const cell = cells.filter((td) => td.getClientRects().length > 0
        && !td.classList.contains('mb-sticky-col')).pop();
    return {
        scrollX: window.scrollX,
        clientWidth: document.documentElement.clientWidth,
        cellLeft: cell ? cell.getBoundingClientRect().left : NaN,
        items,
    };
}, selectors);

/**
 * Scrolls the window to its far right and waits for the scroll to land.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<number>} the resulting scrollX
 */
async function scrollToRightEnd(page) {
    await page.evaluate(() => window.scrollTo(document.documentElement.scrollWidth, window.scrollY));
    await page.waitForFunction(() => window.scrollX > 0);
    // One frame so sticky offsets are resolved for the new scroll position.
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
    return page.evaluate(() => window.scrollX);
}

/**
 * Asserts that every measured element is marked, did not move horizontally
 * between `before` and `after`, and ends inside the viewport at the far right
 * (i.e. was not dragged back by its containing block during the last part of
 * the scroll).
 *
 * @param {object} before - measure() at scrollX = 0
 * @param {object} after  - measure() at the far right
 * @returns {void}
 */
function expectPinned(before, after) {
    expect(before.scrollX).toBe(0);
    expect(after.scrollX, 'the page must actually scroll sideways').toBeGreaterThan(1000);
    // Loose on purpose: deferred header/cell content can still reflow a cell
    // by a few dozen px between the two reads; the premise is only that the
    // CONTENT scrolled, which a 1000+ px scroll makes unmistakable.
    expect(before.cellLeft - after.cellLeft,
        'premise: a table cell moves with the scroll').toBeGreaterThan(after.scrollX * 0.9);

    expect(after.items.length).toBe(before.items.length);
    const unmarked = before.items.filter((it) => !it.marked).map((it) => it.key);
    expect(unmarked, 'elements that should be pin targets but are not').toEqual([]);

    const moved = after.items
        .map((it, i) => ({ key: it.key, from: before.items[i].left, to: it.left }))
        .filter((m) => Math.abs(m.to - m.from) > 1);
    expect(moved, 'pinned elements whose left edge moved while scrolling').toEqual([]);

    const overhang = after.items
        .filter((it) => it.right > after.clientWidth + 1)
        .map((it) => ({ key: it.key, right: it.right }));
    expect(overhang, `pinned elements extending past the viewport (${after.clientWidth}px) `
        + 'at the far right').toEqual([]);
}

const SERIES_TARGETS = [
    'body > div.header',
    '#content > .seriesheader',
    '#content > .tabs',
    '#content h2',
    'body > #footer',
];

test.describe('sticky page headers — single-table page', () => {
    for (const autoResize of [true, false]) {
        // Two containing-block paths: auto-resize makes #page fit-content
        // wide; without it the table overflows #page and only <body> is
        // widened. Both have to hold the bars still.
        test(`pins header, entity header, tabs, h2 bars and footer (auto-resize ${autoResize ? 'on' : 'off'})`,
            async ({ page }) => {
                await openSeries(page, { settingsOverride: { sa_auto_resize_columns: autoResize } });
                const ov = await overflow(page);
                expect(ov.scrollWidth, 'premise: the table overflows the viewport')
                    .toBeGreaterThan(ov.clientWidth + 500);
                await waitEngaged(page);

                const before = await measure(page, SERIES_TARGETS);
                expect(before.items.length, 'premise: header, seriesheader, tabs, 3 h2, footer')
                    .toBeGreaterThanOrEqual(7);
                await scrollToRightEnd(page);
                const after = await measure(page, SERIES_TARGETS);
                expectPinned(before, after);

                // Content bars get NO base z-index, so a vertically sticky
                // header keeps painting over the bars scrolling under it.
                // (Measured with focus and pointer away — see
                // settleFocusAndPointer(); a focused bar is raised by design.)
                const h2z = await page.evaluate(() => Array.from(
                    document.querySelectorAll('#content h2.mb-sph-target'),
                    (h) => getComputedStyle(h).zIndex));
                expect(h2z.length).toBeGreaterThan(0);
                expect(new Set(h2z)).toEqual(new Set(['auto']));

                // Body-level chrome WITHOUT stacking of its own (the plain MB
                // header, the footer) does get SPH_Z_CHROME (106), so #page
                // cannot paint over its menus — and keeps it on later passes,
                // when its LIVE position is already this feature's sticky
                // (the reason _sphNativeStyle() caches what it saw first).
                const chromeZ = await page.evaluate(() => ['body > div.header', 'body > #footer']
                    .map((sel) => getComputedStyle(document.querySelector(sel)).zIndex));
                expect(chromeZ).toEqual(['106', '106']);
            });
    }

    test('a body-level bar with its own margin-right still ends inside the viewport and stays put', async ({ page }) => {
        // The plain MB header carries a 16px margin-right. Sticky keeps the
        // MARGIN box inside the containing block, so a width that ignores it
        // is pushed back by 16px during the last part of the scroll.
        await openSeries(page, { css: 'body > div.header { margin-right: 16px !important; }' });
        await waitEngaged(page);
        const before = await measure(page, ['body > div.header']);
        expect(before.items).toHaveLength(1);
        await scrollToRightEnd(page);
        const after = await measure(page, ['body > div.header']);
        expectPinned(before, after);
        expect(after.items[0].right).toBeLessThanOrEqual(after.clientWidth - 16 + 1);
    });

    test('offsets are already right on the pass that engages, not one observer round-trip later', async ({ page }) => {
        // html.mb-sph-on itself moves the geometry the refresh pass measures:
        // <body> loses its margins (8px under the bare fixture's UA
        // stylesheet) and turns fit-content wide. A pass that measures first
        // and engages last writes offsets for the page it is about to leave,
        // so every bar sits 8px off until a ResizeObserver round-trip happens
        // to trigger a second pass. The settle-based tests above cannot see
        // that — by the time they measure, the second pass has run — so this
        // one reads --mb-sph-left in a MutationObserver callback, i.e. at the
        // end of the very task that set the class, before any observer
        // round-trip, and compares it with the settled value.
        const snapshot = () => Array.from(document.querySelectorAll('.mb-sph-target'),
            (el) => `${el.tagName}.${el.className.split(' ')[0]}=${el.style.getPropertyValue('--mb-sph-left')}`);
        await openSeries(page, {
            settingsOverride: { sa_auto_resize_columns: false },
            beforeRender: (p) => p.evaluate((fn) => {
                const read = new Function(`return (${fn})()`);
                window.__sphFirstPass = [];
                const mo = new MutationObserver(() => {
                    if (!document.documentElement.classList.contains('mb-sph-on')) return;
                    window.__sphFirstPass.push(read());
                });
                mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
            }, snapshot.toString()),
        });
        await waitEngaged(page);
        await page.waitForTimeout(REFRESH_SETTLE_MS);

        const first = await page.evaluate(() => window.__sphFirstPass[0]);
        const settled = await page.evaluate(`(${snapshot.toString()})()`);
        expect(first, 'premise: the engaging pass was observed').toBeTruthy();
        expect(first.length, 'premise: header, seriesheader, tabs, h2s, footer').toBeGreaterThanOrEqual(7);
        expect(first, 'offsets written by the engaging pass').toEqual(settled);
    });

    test('a sort triggers no refresh pass; a table getting wider does', async ({ page }) => {
        // Performance guarantee, not a visual one. Every refresh pass forces a
        // layout of the whole table, and a sort changes only HEIGHTS (rows
        // re-ordered, re-appended) — measured on artist-events before the
        // width gate: 4-7 passes per sort, up to 253 ms. _sphOnResize() now
        // ignores height-only notifications. The positive control widens a
        // table, which must still be noticed, so a gate that drops EVERY
        // notification cannot pass.
        //
        // This fixture's sort is small enough to run synchronously, so it
        // changes no height at all and cannot tell the two builds apart on
        // its own (verified: the un-gated build passes the sort half). The
        // height-only change that does is made explicitly: a taller first
        // row grows the table, #content, <body> and <html> vertically while
        // every width stays put — what a chunked re-render does repeatedly.
        await openSeries(page, { settingsOverride: { sa_auto_resize_columns: false } });
        await waitEngaged(page);
        await page.waitForTimeout(REFRESH_SETTLE_MS);
        const passes = () => page.evaluate(() => window.__saTest.sphRefreshPasses());

        const before = await passes();
        const sortBtn = page.locator('table.tbl').first().locator('thead th .sort-icon-btn', { hasText: '▼' }).first();
        await waitForSortSettled(page, () => sortBtn.click());
        await page.waitForTimeout(REFRESH_SETTLE_MS);
        expect(await passes(), 'refresh passes caused by a sort').toBe(before);

        const grew = await page.evaluate(() => {
            const t = document.querySelector('table.tbl');
            const w = t.getBoundingClientRect().width;
            const h = t.getBoundingClientRect().height;
            t.querySelector('tbody tr td').style.height = '400px';
            const r = t.getBoundingClientRect();
            return { dw: r.width - w, dh: r.height - h };
        });
        expect(grew.dh, 'premise: the table grew vertically').toBeGreaterThan(100);
        expect(grew.dw, 'premise: ... and not horizontally').toBe(0);
        await page.waitForTimeout(REFRESH_SETTLE_MS);
        expect(await passes(), 'refresh passes caused by a height-only change').toBe(before);

        await page.evaluate(() => {
            const t = document.querySelector('table.tbl');
            t.style.minWidth = `${Math.ceil(t.getBoundingClientRect().width) + 300}px`;
        });
        await expect.poll(passes, { message: 'a wider table must schedule a pass' })
            .toBeGreaterThan(before);
    });

    test('the feature\'s custom properties stay on the element they are written to', async ({ page }) => {
        // Performance guarantee. An unregistered custom property INHERITS, so
        // one written on <html> changed the computed style of every element
        // and made the next measurement pay for a full-document style recalc
        // (traced at 249 ms on 4174 rows). They are registered with
        // `@property … inherits: false` now; a table cell must not see them.
        await openSeries(page, { settingsOverride: { sa_auto_resize_columns: false } });
        await waitEngaged(page);
        const props = await page.evaluate(() => {
            const read = (el) => {
                const cs = getComputedStyle(el);
                return ['--mb-sph-body-native-minw', '--mb-sph-left', '--mb-sph-maxw']
                    .map((n) => cs.getPropertyValue(n).trim());
            };
            const bar = document.querySelector('#content h2.mb-sph-target');
            return {
                body: read(document.body)[0],
                bar: read(bar).slice(1),
                barChild: read(bar.firstElementChild || bar.firstChild.parentElement),
                cell: read(document.querySelector('table.tbl tbody td')),
            };
        });
        expect(props.body, 'premise: <body> carries its floor').not.toBe('');
        expect(props.bar.every((v) => v !== ''), 'premise: a bar carries its offsets').toBe(true);
        expect(props.cell, 'a table cell inherits nothing').toEqual(['', '', '']);
        expect(props.barChild.slice(1), 'a bar\'s own child inherits nothing').toEqual(['', '']);
    });

    test('disengages once the overflow is gone, and re-engages when it returns (no ratchet)', async ({ page }) => {
        await openSeries(page, { settingsOverride: { sa_auto_resize_columns: false } });
        await waitEngaged(page);
        await scrollToRightEnd(page);

        await page.evaluate(() => {
            document.querySelectorAll('table.tbl').forEach((t) => { t.dataset.sphHidden = '1'; t.style.display = 'none'; });
        });
        await waitDisengaged(page);
        // <body>'s own width is the ratchet signal: the bug froze it at its
        // widest size. (Not the document's scrollWidth — the bare fixture
        // overflows by a few px with the feature off too.)
        const ov = await overflow(page);
        expect(await page.evaluate(() => document.body.getBoundingClientRect().width),
            '<body> must shrink back to the viewport').toBeLessThanOrEqual(ov.clientWidth + 1);

        await page.evaluate(() => {
            document.querySelectorAll('table.tbl[data-sph-hidden]').forEach((t) => { t.style.display = ''; });
        });
        await waitEngaged(page);
    });

    test('stays inert while the sidebar is expanded and columns are not auto-resized', async ({ page }) => {
        await openSeries(page, {
            settingsOverride: { sa_sidebar_collapsed: false, sa_auto_resize_columns: false },
        });
        const ov = await overflow(page);
        expect(ov.scrollWidth, 'premise: the table overflows the viewport')
            .toBeGreaterThan(ov.clientWidth + 500);
        expect(await page.evaluate(() => !!document.getElementById('mb-sticky-page-headers-style')),
            'premise: the feature is initialized').toBe(true);

        // Nudge the scroll fallback too, so every trigger has had its chance.
        await page.evaluate(() => window.scrollTo(50, 0));
        await page.waitForTimeout(REFRESH_SETTLE_MS);
        expect(await page.evaluate(() => document.documentElement.classList.contains('mb-sph-on')),
            'must not engage: widening <body> would push the expanded sidebar off-screen').toBe(false);
        expect(await page.locator('.mb-sph-target').count()).toBe(0);

        // Positive control: collapsing the sidebar is the only change.
        await page.evaluate(() => document.getElementById('sidebar-toggle-handle').click());
        await waitEngaged(page);
    });

    test('with the setting off nothing is installed and the chrome scrolls away', async ({ page }) => {
        await openSeries(page, { settingsOverride: { sa_enable_sticky_page_headers: false } });
        const before = await measure(page, ['body > div.header']);
        const scrollX = await scrollToRightEnd(page);
        await page.waitForTimeout(REFRESH_SETTLE_MS);
        const after = await measure(page, ['body > div.header']);

        const state = await page.evaluate(() => ({
            style: !!document.getElementById('mb-sticky-page-headers-style'),
            on: document.documentElement.classList.contains('mb-sph-on'),
            targets: document.querySelectorAll('.mb-sph-target').length,
        }));
        expect(state).toEqual({ style: false, on: false, targets: 0 });
        expect(before.items[0].left - after.items[0].left,
            'the header scrolls with the page').toBeCloseTo(scrollX, 0);
    });

    test('a natively sticky header (mb. STICKY HEADER userstyle) is pinned too, keeping its own top and z-index', async ({ page }) => {
        // jesus2099's userstyle, verbatim selector and declarations.
        await openSeries(page, {
            css: 'html > body > div.header { position: sticky; top: 0; z-index: 1; }',
        });
        await waitEngaged(page);
        // The bare fixture has no MB stylesheet, so the header's nested menu
        // lists render fully expanded; stuck at top: 0 the header then covers
        // the parked pointer and is raised by :hover (by design). Take it out
        // of hit-testing so the z-index read is the un-hovered one.
        await page.addStyleTag({ content: 'body > div.header { pointer-events: none !important; }' });
        await page.mouse.move(VIEWPORT.width - 3, VIEWPORT.height - 3);

        const hdr = () => page.evaluate(() => {
            const h = document.querySelector('body > div.header');
            const cs = getComputedStyle(h);
            const r = h.getBoundingClientRect();
            return {
                target: h.classList.contains('mb-sph-target'),
                chrome: h.classList.contains('mb-sph-chrome'),
                position: cs.position, top: cs.top, zIndex: cs.zIndex,
                left: r.left, rectTop: r.top,
            };
        });
        const before = await hdr();
        expect(before).toMatchObject({
            target: true, chrome: false, position: 'sticky', top: '0px', zIndex: '1',
        });

        await page.evaluate(() => window.scrollTo(document.documentElement.scrollWidth, 400));
        await page.waitForFunction(() => window.scrollX > 0 && window.scrollY > 0);
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
        const after = await hdr();
        expect(Math.abs(after.left - before.left), 'sticks horizontally').toBeLessThanOrEqual(1);
        expect(Math.abs(after.rectTop), 'still sticks vertically').toBeLessThanOrEqual(1);
        expect(after.zIndex, 'its own z-index is kept').toBe('1');
    });
});

test.describe('sticky page headers — stacking while the global filter has focus', () => {
    // The global filter input is focused after every render. Under a plain
    // `:focus-within` raise that kept the data h2 at z-index 107 until focus
    // moved, so it painted over a vertically sticky MB header (jesus2099's
    // userstyle, z-index 1) while scrolling down — the case WIP.2 removed the
    // bars' base z-index for. A text field resting with focus no longer
    // raises; a focused button and an open popup still must (they are what
    // the raise exists for: a pinned bar is a stacking context and would
    // otherwise trap its own menus under the next bar).

    /**
     * Computed z-index of the pinned bar holding the global filter.
     *
     * @param {import('@playwright/test').Page} page
     * @returns {Promise<?string>}
     */
    const gfBarZ = (page) => page.evaluate(() => {
        const bar = document.getElementById('mb-global-filter-input').closest('.mb-sph-target');
        return bar ? getComputedStyle(bar).zIndex : null;
    });

    test('focus resting in the global filter does not raise its bar; a focused button and an open history dropdown do', async ({ page }) => {
        await openSeries(page);
        await waitEngaged(page);

        await page.evaluate(() => document.getElementById('mb-global-filter-input').focus({ preventScroll: true }));
        expect(await page.evaluate(() => document.activeElement.id), 'premise').toBe('mb-global-filter-input');
        expect(await gfBarZ(page), 'a text field resting with focus').toBe('auto');

        await page.evaluate(() => {
            const bar = document.getElementById('mb-global-filter-input').closest('.mb-sph-target');
            bar.querySelector('button').focus({ preventScroll: true });
        });
        expect(await page.evaluate(() => document.activeElement.tagName), 'premise').toBe('BUTTON');
        expect(await gfBarZ(page), 'a focused button in the bar').toBe('107');

        await page.evaluate(() => document.activeElement.blur());
        expect(await gfBarZ(page)).toBe('auto');

        // The real dropdown: opening it moves focus into ITS OWN quick-filter
        // text field, so only the open-popup rule can raise the bar here.
        await page.evaluate(() => {
            const bar = document.getElementById('mb-global-filter-input').closest('.mb-sph-target');
            bar.querySelector('button[title^="Show/hide filter history"]').click();
        });
        expect(await page.evaluate(() => `${document.activeElement.tagName}:${document.activeElement.type}`),
            'premise: focus moved into the dropdown\'s own text field').toBe('INPUT:text');
        expect(await gfBarZ(page), 'an open filter-history dropdown').toBe('107');
    });

    test('with the global filter focused, the data h2 does not paint over a vertically sticky header', async ({ page }) => {
        await openSeries(page, {
            css: 'html > body > div.header { position: sticky; top: 0; z-index: 1; }',
        });
        await waitEngaged(page);
        await page.evaluate(() => document.getElementById('mb-global-filter-input').focus({ preventScroll: true }));

        // Scroll the data h2 up until it sits inside the stuck header's box,
        // then hit-test the overlap: the header must be on top.
        const probe = await page.evaluate(async () => {
            const hdr = document.querySelector('body > div.header');
            const bar = document.getElementById('mb-global-filter-input').closest('.mb-sph-target');
            const overlapY = Math.min(hdr.getBoundingClientRect().height, innerHeight) / 2;
            window.scrollTo(0, bar.getBoundingClientRect().top + window.scrollY - overlapY);
            await new Promise((r) => requestAnimationFrame(() => r()));
            const br = bar.getBoundingClientRect();
            const hr = hdr.getBoundingClientRect();
            const x = br.left + 30;
            const y = br.top + Math.min(5, br.height / 2);
            const hit = document.elementFromPoint(x, y);
            return {
                focused: document.activeElement.id,
                barInsideHeader: y > hr.top && y < hr.bottom,
                hitHeader: !!(hit && hit.closest('body > div.header')),
                hitBar: !!(hit && bar.contains(hit)),
            };
        });
        expect(probe.focused, 'premise: the global filter still has focus').toBe('mb-global-filter-input');
        expect(probe.barInsideHeader, 'premise: the bar is scrolled under the stuck header').toBe(true);
        expect(probe, 'the stuck header paints over the bar, not the other way round')
            .toMatchObject({ hitHeader: true, hitBar: false });
    });
});

test.describe('sticky page headers — expanded section bodies', () => {
    // The CONTENT of an expanded non-data h2 section (Credits, Annotation,
    // Relationships) used to scroll away under its pinned bar: it was never
    // collected, the "contains a table" rule excluded every table.details
    // body, and expanding a section changed no observed width, so nothing
    // re-collected it. Bodies are pinned now; a bar inside one rides along;
    // the data h2's own body (table.tbl sub-tables) keeps scrolling.

    const RELEASE_URL = 'https://musicbrainz.org/release/1d404e1d-fcb6-3a52-b478-e706e893c897';
    const RELEASE_SHELL = path.join(__dirname, '..', 'snapshots', 'release-tracks', 'raw.html');

    /**
     * Opens the release-tracks fixture (multi-table, with Annotation and the
     * relocated Credits section above the Tracklist) at VIEWPORT.
     *
     * @param {import('@playwright/test').Page} page
     * @returns {Promise<void>}
     */
    async function openRelease(page) {
        await page.setViewportSize(VIEWPORT);
        await loadUserscriptPage(page, {
            url: RELEASE_URL,
            fixtureFile: RELEASE_SHELL,
            testMode: true,
            settingsOverride: { sa_enable_release_tracks: true },
        });
        await page.route(`${RELEASE_URL}?**`, (r) => r.fulfill({ path: RELEASE_SHELL, contentType: 'text/html' }));
        await page.$eval('button[data-label="Show all Tracks for Release"]', (b) => b.click());
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await settleFocusAndPointer(page);
    }

    /**
     * Whether a data table that does NOT fit in the window, or an ancestor
     * of any data table, is pinned. A table that fits is pinned whole on
     * purpose (`_sphFitsTable()`); one that does not has to keep scrolling,
     * and a pinned ancestor would cap it to the viewport.
     *
     * @param {import('@playwright/test').Page} page
     * @returns {Promise<boolean>}
     */
    const dataTablePinned = (page) => page.evaluate(() => Array.from(document.querySelectorAll('table.tbl'))
        .some((t) => !!(t.parentElement && t.parentElement.closest('.mb-sph-target'))
            || (t.classList.contains('mb-sph-target')
                && t.getBoundingClientRect().width > document.documentElement.clientWidth)));

    /**
     * Whether an element is shown and pinned: a pin target itself, or
     * carried by a pinned ancestor. Since `_sphContentBodies()` pins any
     * container without a data table as a whole, a section wrapper such as
     * `#bottom-credits` or `div.annotation` is the target and its content
     * rides along inside it. A collapsed (hidden) element is never "shown
     * and pinned", so the collapsed premises below still mean something.
     *
     * @param {import('@playwright/test').Page} page
     * @param {string} sel
     * @returns {Promise<boolean>}
     */
    const isPinned = (page, sel) => page.evaluate((s) => {
        const el = document.querySelector(s);
        return !!el && el.getClientRects().length > 0 && !!el.closest('.mb-sph-target');
    }, sel);

    test('expanding Credits pins its content, and its Release / Release group bars ride along', async ({ page }) => {
        await openRelease(page);
        await waitEngaged(page);

        const order = await page.evaluate(() => {
            const credits = document.querySelector('#bottom-credits > h2');
            const tracklist = Array.from(document.querySelectorAll('h2'))
                .find((h) => h.querySelector('.mb-row-count-stat'));
            return !!(credits && tracklist
                && (credits.compareDocumentPosition(tracklist) & Node.DOCUMENT_POSITION_FOLLOWING));
        });
        expect(order, 'premise: Credits is relocated above the Tracklist (data) h2').toBe(true);
        expect(await isPinned(page, '#release-relationships'), 'premise: collapsed, not pinned').toBe(false);

        // A real click on the bar; nothing else (no scroll, no resize) may
        // be needed for the pass that pins the newly shown content.
        await page.locator('#bottom-credits > h2').click();
        await expect.poll(() => isPinned(page, '#release-relationships'),
            { message: 'the expanded body is pinned, itself or inside its pinned section wrapper' }).toBe(true);
        await expect.poll(() => isPinned(page, '#release-group-relationships')).toBe(true);

        const sels = ['#release-relationships', '#release-group-relationships'];
        const bars = ['#bottom-credits h3.mb-credits-toggle-h3'];
        const before = await measure(page, sels);
        const barsBefore = await measure(page, bars);
        expect(barsBefore.items.length, 'premise: the Release and Release group bars').toBe(2);
        await scrollToRightEnd(page);
        expectPinned(before, await measure(page, sels));
        expectPinned(barsBefore, await measure(page, bars));
        expect(await dataTablePinned(page), 'no data table wider than the window is ever pinned').toBe(false);

        // Collapsing again releases the bodies on the next pass.
        await page.evaluate(() => window.scrollTo(0, window.scrollY));
        await page.locator('#bottom-credits > h2').click();
        await expect.poll(() => isPinned(page, '#release-relationships')).toBe(false);
    });

    test('Credits Release / Release group h3 bars are indented like the data sub-table h3', async ({ page }) => {
        // Pins the INDENT relative to each bar's own h2, not merely that a
        // margin exists: .mb-credits-toggle-h3 mirrors .mb-toggle-h3's look,
        // and used to be copied without its margin-left, so "Release" sat
        // flush with "Credits" while "1 - CD" sat indented under "Tracklist".
        await openRelease(page);
        await page.locator('#bottom-credits > h2').click();
        await expect(page.locator('#bottom-credits h3.mb-credits-toggle-h3').first()).toBeVisible();

        const probe = await page.evaluate(() => {
            const left = (el) => el.getBoundingClientRect().left;
            const creditsH2 = document.querySelector('#bottom-credits > h2');
            const creditsH3s = Array.from(document.querySelectorAll('#bottom-credits h3.mb-credits-toggle-h3'));
            const dataH2 = Array.from(document.querySelectorAll('h2'))
                .find((h) => h.querySelector('.mb-row-count-stat'));
            const dataH3 = document.querySelector('h3.mb-toggle-h3');
            return {
                creditsOffsets: creditsH3s.map((h) => left(h) - left(creditsH2)),
                dataOffset: dataH2 && dataH3 ? left(dataH3) - left(dataH2) : null,
            };
        });

        expect(probe.creditsOffsets, 'premise: the Release and Release group bars').toHaveLength(2);
        expect(probe.dataOffset, 'premise: the data sub-table h3 is indented under its h2').toBeGreaterThan(0);
        for (const off of probe.creditsOffsets) {
            expect(off, 'a Credits h3 is indented under the Credits h2').toBeGreaterThan(0);
            expect(Math.abs(off - probe.dataOffset), 'by the same amount as the data sub-table h3')
                .toBeLessThanOrEqual(1);
        }
    });

    test('an Annotation with a wiki "== … ==" heading pins its whole text, the heading bar riding along', async ({ page }) => {
        // MusicBrainz renders the wiki heading as an <h2> inside
        // div.annotation-body. _sphSectionBodies() (since replaced by
        // _sphContentBodies()) skipped a body that contained an h2, so the
        // body was never pinned; its heading and the paragraph after it were
        // pinned on their own, but a sticky box cannot leave its (unpinned)
        // containing block, so they slid away with it, and the paragraphs
        // before the heading were not collected at all. The heading is an h3
        // bar now, and the whole div.annotation is pinned as one body.
        const ANN_URL = 'https://musicbrainz.org/release/6d19588c-0305-4fb0-b687-d4b75a75c3fd';
        const ANN_SHELL = path.join(__dirname, 'release-tracks-multirow-instruments.html');
        await page.setViewportSize(VIEWPORT);
        await loadUserscriptPage(page, {
            url: ANN_URL,
            fixtureFile: ANN_SHELL,
            testMode: true,
            settingsOverride: { sa_enable_release_tracks: true },
        });
        await page.route(`${ANN_URL}?**`, (r) => r.fulfill({ path: ANN_SHELL, contentType: 'text/html' }));
        await page.$eval('button[data-label="Show all Tracks for Release"]', (b) => b.click());
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await settleFocusAndPointer(page);
        await waitEngaged(page);

        const sel = 'div.annotation-body';
        expect(await isPinned(page, sel), 'premise: collapsed, not pinned').toBe(false);
        await page.locator('h2.annotation').click();
        await expect.poll(() => isPinned(page, sel),
            { message: 'expanding Annotation must pin its body' }).toBe(true);

        const inner = ['div.annotation-body h3', 'div.annotation-body > p'];
        const before = await measure(page, [sel]);
        const innerBefore = await measure(page, inner);
        expect(before.items).toHaveLength(1);
        expect(innerBefore.items.length,
            'premise: the heading bar plus the paragraphs before and after it').toBeGreaterThanOrEqual(4);
        await scrollToRightEnd(page);
        expectPinned(before, await measure(page, [sel]));
        expectPinned(innerBefore, await measure(page, inner));
        expect(await dataTablePinned(page), 'no data table wider than the window is ever pinned').toBe(false);
    });

    test('a section whose body is a bare table.details (series Relationships) pins that table', async ({ page }) => {
        await openSeries(page, { settingsOverride: { sa_auto_resize_columns: false } });
        await waitEngaged(page);
        const sel = 'h2.relationships + table.details';
        expect(await isPinned(page, sel), 'premise: collapsed, not pinned').toBe(false);

        await page.locator('h2.relationships').click();
        await expect.poll(() => isPinned(page, sel)).toBe(true);
        const before = await measure(page, [sel]);
        expect(before.items).toHaveLength(1);
        await scrollToRightEnd(page);
        expectPinned(before, await measure(page, [sel]));
        expect(await dataTablePinned(page), 'no data table wider than the window is ever pinned').toBe(false);
    });

    test('with every section expanded, a data table wider than the window is still never pinned', async ({ page }) => {
        await openRelease(page);
        await waitEngaged(page);
        await page.evaluate(() => document.querySelectorAll('h2').forEach((h) => {
            if (h._mbToggle && !h.closest('#sidebar')) h._mbToggle(true);
        }));
        await expect.poll(() => isPinned(page, '#release-relationships')).toBe(true);
        expect(await dataTablePinned(page)).toBe(false);
        // The data section's sub-table bars are pinned as bars, as before.
        expect(await page.evaluate(() => Array.from(document.querySelectorAll('h3.mb-toggle-h3'))
            .every((h) => h.classList.contains('mb-sph-target')))).toBe(true);
    });
});

test.describe('sticky page headers — multi-table page', () => {
    test('pins the h1, the tabs and every h3 sub-table bar', async ({ page }) => {
        await page.setViewportSize({ width: 700, height: 800 });
        await loadUserscriptPage(page, { url: RATINGS_URL, fixtureFile: RATINGS_SHELL, testMode: true });
        await page.click('button[data-label="Show Ratings for User"]');
        await waitForRenderComplete(page);
        // Sub-tables may start collapsed; a collapsed one has no width to
        // overflow with. Expand only when needed, then assert it worked.
        const anyHidden = () => page.evaluate(() => Array.from(document.querySelectorAll('table.tbl'))
            .some((t) => t.getClientRects().length === 0));
        if (await anyHidden()) await page.locator('.mb-master-toggle').first().click();
        await expect.poll(anyHidden, { message: 'every sub-table expanded' }).toBe(false);
        await settleFocusAndPointer(page);
        const ov = await overflow(page);
        expect(ov.scrollWidth, 'premise: a sub-table overflows the viewport')
            .toBeGreaterThan(ov.clientWidth + 500);
        await waitEngaged(page);

        const sels = ['h1', '.tabs', 'h3.mb-toggle-h3'];
        const before = await measure(page, sels);
        expect(before.items.filter((it) => it.key.startsWith('h3')).length,
            'premise: one h3 bar per entity group').toBeGreaterThanOrEqual(5);
        await scrollToRightEnd(page);
        expectPinned(before, await measure(page, sels));
    });
});

test.describe('sticky page headers — every block of content that is not a wide data table', () => {
    // org/sticky-bugs.org: only bars and the bodies of NON-data h2 sections
    // used to be pinned. So everything else in the page content scrolled
    // away under its pinned bar: the CAA/EAA big-image strip (bug 1), the
    // data section's intro text and forms (3b/3c, 4a-e), and the status line
    // when it follows a bare <h1> (4b-d). Inline siblings were pinned one by
    // one at the same left, so the Wikipedia extract's licence note was drawn
    // over its "Continue reading" link (bug 2). A narrow data table scrolled
    // out of view with its sticky column, because a sticky cell cannot leave
    // its table (3c). Each test is geometric, like the rest of this file.

    /**
     * Opens the user-ratings fixture (multi-table) at `width` and expands
     * every sub-table.
     *
     * @param {import('@playwright/test').Page} page
     * @param {number} width - Viewport width.
     * @returns {Promise<void>}
     */
    async function openRatings(page, width) {
        await page.setViewportSize({ width, height: 800 });
        await loadUserscriptPage(page, { url: RATINGS_URL, fixtureFile: RATINGS_SHELL, testMode: true });
        await page.addStyleTag({ content: '#content, #page { padding-left: 24px !important; }' });
        await page.click('button[data-label="Show Ratings for User"]');
        await waitForRenderComplete(page);
        const anyHidden = () => page.evaluate(() => Array.from(document.querySelectorAll('table.tbl'))
            .some((t) => t.getClientRects().length === 0));
        if (await anyHidden()) await page.locator('.mb-master-toggle').first().click();
        await expect.poll(anyHidden, { message: 'every sub-table expanded' }).toBe(false);
        await settleFocusAndPointer(page);
        await waitEngaged(page);
    }

    /**
     * Inserts a CAA-style big-image strip (the markup `_artInitBigPics()`
     * builds: a wrapping flex row of thumbnails) right before `tableSel`,
     * then has the feature re-collect, as showing a real strip does through
     * its observed width. The fixtures run with CAA off
     * (`FIXTURE_SETTINGS_OVERRIDE`), so the strip is built here.
     *
     * @param {import('@playwright/test').Page} page
     * @param {number} tableIndex - Which `table.tbl` the strip belongs to.
     * @returns {Promise<void>}
     */
    async function insertStrip(page, tableIndex) {
        const passes = await page.evaluate(() => window.__saTest.sphRefreshPasses());
        await page.evaluate((i) => {
            const table = document.querySelectorAll('table.tbl')[i];
            const box = document.createElement('div');
            box.className = 'mb-caa-bigbox';
            box.id = `mb-caa-bigbox-${i}`;
            box.dataset.caaVisible = 'true';
            box.style.cssText = 'display: flex; flex-wrap: wrap; gap: 4px; padding: 4px 0px; min-height: 0px;';
            for (let k = 0; k < 40; k++) {
                const img = document.createElement('div');
                img.style.cssText = 'width: 120px; height: 120px; background: #8a6;';
                box.appendChild(img);
            }
            table.before(box);
            window.dispatchEvent(new Event('resize'));
        }, tableIndex);
        await expect.poll(() => page.evaluate(() => window.__saTest.sphRefreshPasses()))
            .toBeGreaterThan(passes);
    }

    test('single-table: the big-image strip above the table stays put', async ({ page }) => {
        await openSeries(page, { css: '#content { padding-left: 24px !important; }' });
        await waitEngaged(page);
        await insertStrip(page, 0);
        await expect.poll(() => page.evaluate(() =>
            document.querySelector('.mb-caa-bigbox').classList.contains('mb-sph-target'))).toBe(true);
        const sels = ['.mb-caa-bigbox', '#content h2'];
        const before = await measure(page, sels);
        expect(before.items.length, 'premise: the strip and the h2 bars').toBeGreaterThanOrEqual(2);
        await scrollToRightEnd(page);
        expectPinned(before, await measure(page, sels));
        // It is pinned at the line of the bar above it, not at the window edge.
        const lefts = await page.evaluate(() => ({
            strip: document.querySelector('.mb-caa-bigbox').getBoundingClientRect().left,
            bar: Array.from(document.querySelectorAll('#content h2'))
                .find((h) => h.querySelector('.mb-row-count-stat')).getBoundingClientRect().left,
        }));
        expect(Math.abs(lefts.strip - lefts.bar), 'the strip docks in line with its h2 bar').toBeLessThanOrEqual(1);
    });

    test('multi-table: a big-image strip between an h3 bar and its table stays put', async ({ page }) => {
        await openRatings(page, 700);
        // The widest sub-table, so its h3 bar, strip and table all exist and
        // the table keeps scrolling.
        const idx = await page.evaluate(() => {
            const ts = Array.from(document.querySelectorAll('table.tbl'));
            return ts.indexOf(ts.slice().sort((a, b) => b.getBoundingClientRect().width
                - a.getBoundingClientRect().width)[0]);
        });
        await insertStrip(page, idx);
        await expect.poll(() => page.evaluate(() =>
            document.querySelector('.mb-caa-bigbox').classList.contains('mb-sph-target'))).toBe(true);
        const sels = ['.mb-caa-bigbox', 'h3.mb-toggle-h3'];
        const before = await measure(page, sels);
        await scrollToRightEnd(page);
        expectPinned(before, await measure(page, sels));
    });

    test('multi-table: a real big-image strip is indented like its h3 bar, before and after scrolling', async ({ page }) => {
        // _artInitBigPics() builds the strip right before its table. On a
        // multi-table page every sub-table and h3 bar is indented 1.5em, and
        // the strip used to be built without that indent: it sat flush with
        // the h2, and Sticky Page Headers pinned it there (user report,
        // debug/big-picture-stripe-indent-bug.html). CAA on here; the GM stub
        // answers every image with a 404, but the strip is built regardless.
        await page.setViewportSize({ width: 1300, height: 800 });
        await loadUserscriptPage(page, {
            url: RATINGS_URL, fixtureFile: RATINGS_SHELL, testMode: true,
            settingsOverride: { sa_enable_caa_pics: true, sa_art_idb_enable: false },
        });
        await page.click('button[data-label="Show Ratings for User"]');
        await waitForRenderComplete(page);
        const anyHidden = () => page.evaluate(() => Array.from(document.querySelectorAll('table.tbl'))
            .some((t) => t.getClientRects().length === 0));
        if (await anyHidden()) await page.locator('.mb-master-toggle').first().click();
        await expect.poll(anyHidden, { message: 'every sub-table expanded' }).toBe(false);
        await settleFocusAndPointer(page);
        await waitEngaged(page);
        // With every image a 404 the builder leaves the strip empty and
        // possibly hidden; its box is what carries the indent, so show it
        // (as its toggle button would) and let the feature re-collect.
        await expect.poll(() => page.evaluate(() => document.querySelectorAll('.mb-caa-bigbox').length),
            { message: 'premise: _artInitBigPics() built a strip' }).toBeGreaterThan(0);
        const passes = await page.evaluate(() => window.__saTest.sphRefreshPasses());
        await page.evaluate(() => {
            document.querySelectorAll('.mb-caa-bigbox').forEach((b) => {
                b.style.display = 'flex';
                b.style.minHeight = '40px';
            });
            window.dispatchEvent(new Event('resize'));
        });
        await expect.poll(() => page.evaluate(() => window.__saTest.sphRefreshPasses())).toBeGreaterThan(passes);
        // Compared with the strip's own TABLE, not the h3: both are indented
        // 1.5em of the same font size, while the bare fixture (no MB
        // stylesheet) gives the h3 a larger font, so its 1.5em is wider.
        // Live, MB's stylesheet puts all three on one line (34 px in the
        // reported snapshot).
        const offsets = () => page.evaluate(() => Array.from(document.querySelectorAll('.mb-caa-bigbox'))
            .filter((b) => b.getClientRects().length > 0)
            .map((b) => {
                const table = b.nextElementSibling;
                return {
                    strip: b.getBoundingClientRect().left,
                    parent: b.parentElement.getBoundingClientRect().left,
                    table: table.getBoundingClientRect().left,
                };
            }));
        const at0 = await offsets();
        expect(at0.length, 'premise: a rendered big-image strip').toBeGreaterThan(0);
        expect(at0.every((o) => o.table - o.parent > 10), 'premise: the sub-table is indented').toBe(true);
        expect(at0.every((o) => Math.abs(o.strip - o.table) <= 1),
            `strips indented like their table at scrollX 0: ${JSON.stringify(at0)}`).toBe(true);
        expect(await scrollToRightEnd(page), 'premise: the page scrolls').toBeGreaterThan(500);
        const end = await offsets();
        expect(end.every((o, i) => Math.abs(o.strip - at0[i].strip) <= 1),
            `strips still at that line when scrolled: ${JSON.stringify(end)}`).toBe(true);
    });

    test('Wikipedia extract: "Continue reading" and the licence note stay in place and apart', async ({ page }) => {
        // MB's own markup (debug/wikipedia-overwritten-come-together.html),
        // loaded into the page by MB's JS after load; the bare fixture has
        // none, so it is added before the render.
        await openSeries(page, {
            css: '#content { padding-left: 24px !important; }',
            beforeRender: (p) => p.evaluate(() => {
                const div = document.createElement('div');
                div.className = 'wikipedia-extract';
                div.id = 'mb-test-wiki';
                div.innerHTML = '<h2 class="wikipedia">Wikipedia</h2>'
                    + '<div class="wikipedia-extract-body wikipedia-extract-collapse"><p>"Come Together" is a song '
                    + 'by the English rock band the Beatles.</p></div>'
                    + '<a href="https://en.wikipedia.org/wiki/Come_Together">Continue reading at Wikipedia...</a> '
                    + '<small>Wikipedia content provided under the terms of the '
                    + '<a href="https://creativecommons.org/licenses/by-sa/3.0/">Creative Commons BY-SA license</a></small>';
                document.querySelector('#content > .tabs').after(div);
            }),
        });
        await waitEngaged(page);
        const read = () => page.evaluate(() => {
            const a = document.querySelector('#mb-test-wiki > a').getBoundingClientRect();
            const s = document.querySelector('#mb-test-wiki > small').getBoundingClientRect();
            return { aLeft: a.left, aRight: a.right, sLeft: s.left, sTop: s.top, aTop: a.top };
        });
        const before = await measure(page, ['#mb-test-wiki']);
        expect(before.items).toHaveLength(1);
        const at0 = await read();
        await scrollToRightEnd(page);
        expectPinned(before, await measure(page, ['#mb-test-wiki']));
        const end = await read();
        expect(end.sLeft, 'the licence note still starts after the link').toBeGreaterThanOrEqual(end.aRight - 1);
        expect(end.aLeft - at0.aLeft, 'the link did not move').toBeCloseTo(0, 0);
        expect(end.sLeft - at0.sLeft, 'the licence note did not move').toBeCloseTo(0, 0);
    });

    test('an inline element alone on its line beside the table stays put; inline siblings sharing one do not overlap', async ({ page }) => {
        // edit/notes-received (found by tests/support/probe-sph-unpinned.js):
        // MB puts <span class="new-notes-alert-checkbox"><p>…</p></span>
        // straight into #content between the h1 and the filter form. #content
        // holds the data table, so it is walked into, and its inline child
        // has to be pinned on its own. Markup copied from
        // tests/snapshots/notes-received/raw.html; the two inline siblings
        // after it are the shape that must NOT be pinned one by one (bug 2).
        await openSeries(page, {
            css: '#content { padding-left: 24px !important; }',
            beforeRender: (p) => p.evaluate(() => {
                const tabs = document.querySelector('#content > .tabs');
                tabs.insertAdjacentHTML('afterend', '<span class="new-notes-alert-checkbox"><p><label>'
                    + '<input id="alert-new-edit-notes" type="checkbox" checked> Show me an alert whenever I '
                    + 'receive a new edit note.</label></p></span><form><input type="text"></form>'
                    + '<a id="mb-test-inl-a" href="#">first inline</a> <small id="mb-test-inl-s">second inline</small>'
                    + '<div>a block after them</div>');
            }),
        });
        await waitEngaged(page);
        const sels = ['span.new-notes-alert-checkbox'];
        const before = await measure(page, sels);
        expect(before.items, 'premise: the span is rendered').toHaveLength(1);
        await scrollToRightEnd(page);
        expectPinned(before, await measure(page, sels));
        const overlap = await page.evaluate(() => {
            const a = document.getElementById('mb-test-inl-a').getBoundingClientRect();
            const s = document.getElementById('mb-test-inl-s').getBoundingClientRect();
            return { aRight: a.right, sLeft: s.left, sameLine: a.top < s.bottom && s.top < a.bottom };
        });
        expect(overlap.sameLine, 'premise: the two inline siblings share a line').toBe(true);
        expect(overlap.sLeft, 'the second inline sibling is not drawn over the first').toBeGreaterThanOrEqual(overlap.aRight - 1);
    });

    test('search page: the status line after a bare h1 inside #content stays put', async ({ page }) => {
        const SEARCH_URL = 'https://musicbrainz.org/search?query=roulette&type=recording&method=indexed';
        const SEARCH_SHELL = path.join(__dirname, 'search-recordings-continuation.html');
        await page.setViewportSize({ width: 700, height: 800 });
        await loadUserscriptPage(page, { url: SEARCH_URL, fixtureFile: SEARCH_SHELL, testMode: true });
        await page.route('https://musicbrainz.org/search**', (r) =>
            r.fulfill({ path: SEARCH_SHELL, contentType: 'text/html' }));
        await page.addStyleTag({ content: '#content { padding-left: 24px !important; }' });
        await page.click('button[data-label="Show all Search Results for Recordings"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await settleFocusAndPointer(page);
        await waitEngaged(page);
        const sels = ['#mb-status-displays-wrapper', '#content > h1'];
        const before = await measure(page, sels);
        expect(before.items.map((it) => it.key.replace(/\[\d+\]$/, '')).sort(),
            'premise: both are rendered').toEqual(sels.slice().sort());
        await scrollToRightEnd(page);
        expectPinned(before, await measure(page, sels));
    });

    test('a bare h1\'s status line stays put; narrow sub-tables are pinned whole, wide ones scroll', async ({ page }) => {
        await openRatings(page, 1300);
        const kinds = () => page.evaluate(() => Array.from(document.querySelectorAll('table.tbl')).map((t) => ({
            width: t.getBoundingClientRect().width,
            left: t.getBoundingClientRect().left,
            pinned: t.classList.contains('mb-sph-target') && t.classList.contains('mb-sph-table'),
            stamped: !!t.dataset.mbSphColLeft,
        })));
        const at0 = await kinds();
        const vw = (await overflow(page)).clientWidth;
        const narrow = at0.filter((t) => t.left + t.width < vw - 30);
        const wide = at0.filter((t) => t.left + t.width > vw + 30);
        expect(narrow.length, 'premise: a sub-table that fits').toBeGreaterThan(0);
        expect(wide.length, 'premise: a sub-table wider than the window').toBeGreaterThan(0);
        expect(narrow.every((t) => t.pinned), 'every sub-table that fits is pinned whole').toBe(true);
        expect(wide.some((t) => t.pinned), 'no wider one is pinned').toBe(false);
        expect(narrow.some((t) => t.stamped), 'a pinned table\'s column is not docked as well').toBe(false);

        const sels = ['#page > #mb-status-displays-wrapper'];
        const before = await measure(page, sels);
        // The fixture was saved with the script's own wrapper already in it,
        // so the page carries two; both have to stay put.
        expect(before.items.length, 'premise: the status line follows the bare h1').toBeGreaterThan(0);
        await scrollToRightEnd(page);
        expectPinned(before, await measure(page, sels));
        const end = await kinds();
        const moved = end.map((t, i) => ({ i, d: t.left - at0[i].left, pinned: at0[i].pinned }));
        expect(moved.filter((m) => m.pinned && Math.abs(m.d) > 1), 'pinned tables that moved').toEqual([]);
        expect(moved.filter((m) => !m.pinned).every((m) => m.d < -100), 'premise: the wide ones scrolled').toBe(true);
    });

    test('a big-image strip shown later is pinned without any other trigger', async ({ page }) => {
        // Showing a strip (the CAA toggle) changes no other observed WIDTH:
        // only observing the hidden strip itself lets its 0 → W change
        // through the width gate and schedule the pass that pins it.
        await openSeries(page, { css: '#content { padding-left: 24px !important; }' });
        await waitEngaged(page);
        await insertStrip(page, 0);
        await expect.poll(() => page.evaluate(() =>
            document.querySelector('.mb-caa-bigbox').classList.contains('mb-sph-target'))).toBe(true);
        // Hide it and let a pass see it hidden, so it is unmarked.
        const p1 = await page.evaluate(() => window.__saTest.sphRefreshPasses());
        await page.evaluate(() => { document.querySelector('.mb-caa-bigbox').style.display = 'none'; });
        await expect.poll(() => page.evaluate(() => window.__saTest.sphRefreshPasses())).toBeGreaterThan(p1);
        await expect.poll(() => page.evaluate(() =>
            document.querySelector('.mb-caa-bigbox').classList.contains('mb-sph-target')),
        { message: 'premise: unmarked while hidden' }).toBe(false);
        // Show it again: no resize, no scroll.
        await page.evaluate(() => { document.querySelector('.mb-caa-bigbox').style.display = 'flex'; });
        await expect.poll(() => page.evaluate(() =>
            document.querySelector('.mb-caa-bigbox').classList.contains('mb-sph-target')),
        { message: 'the shown strip is pinned by the pass its own width change scheduled' }).toBe(true);
    });

    test('a table pinned whole is not raised over a vertically sticky MB header while hovered', async ({ page }) => {
        // Every other pinned element is raised to z-index 107 while hovered,
        // so in-place popups escape its stacking context. A pinned TABLE is
        // left out: the pointer rests on it most of the time, and its rows
        // would then paint over a vertically sticky header ("mb. STICKY
        // HEADER" userstyle) as they scroll under it.
        await page.setViewportSize({ width: 1300, height: 800 });
        await loadUserscriptPage(page, { url: RATINGS_URL, fixtureFile: RATINGS_SHELL, testMode: true });
        await page.addStyleTag({ content: 'html > body > div.header { position: sticky; top: 0; z-index: 1; '
            + 'height: 40px; background: #eee; } #content, #page { padding-left: 24px !important; } '
            + '#page { padding-bottom: 1500px !important; }' });
        // This saved fixture has no MB top header; a stand-in, in place
        // before the feature first sees the page (it keeps an element's own
        // position and z-index from first sight).
        await page.evaluate(() => {
            const hdr = document.createElement('div');
            hdr.className = 'header';
            hdr.textContent = 'MusicBrainz';
            document.body.prepend(hdr);
        });
        await page.$eval('button[data-label="Show Ratings for User"]', (b) => b.click());
        await waitForRenderComplete(page);
        const anyHidden = () => page.evaluate(() => Array.from(document.querySelectorAll('table.tbl'))
            .some((t) => t.getClientRects().length === 0));
        if (await anyHidden()) await page.locator('.mb-master-toggle').first().click();
        await expect.poll(anyHidden, { message: 'every sub-table expanded' }).toBe(false);
        await settleFocusAndPointer(page);
        await waitEngaged(page);
        await expect.poll(() => page.evaluate(() => !!document.querySelector('table.tbl.mb-sph-table')),
            { message: 'premise: a table pinned whole' }).toBe(true);

        // Scroll the pinned table's body rows up under the stuck header.
        const geo = await page.evaluate(async () => {
            // The pinned table with the most rows, so rows reach below the header.
            const t = Array.from(document.querySelectorAll('table.tbl.mb-sph-table'))
                .sort((a, b) => b.rows.length - a.rows.length)[0];
            t.dataset.mbTestHover = '1';
            const hdr = document.querySelector('body > div.header');
            const row = t.querySelector(':scope > tbody > tr:first-child');
            const hh = hdr.getBoundingClientRect().height;
            window.scrollTo(0, row.getBoundingClientRect().top + window.scrollY - hh / 2);
            await new Promise((r) => requestAnimationFrame(() => r()));
            const tr = t.getBoundingClientRect();
            return { x: tr.left + 30, headerMidY: hh / 2, headerBottom: hdr.getBoundingClientRect().bottom,
                tableTop: tr.top, tableBottom: tr.bottom };
        });
        expect(geo.tableTop, 'premise: the table reaches up under the header').toBeLessThan(geo.headerMidY);
        expect(geo.tableBottom, 'premise: part of the table is below the header')
            .toBeGreaterThan(geo.headerBottom + 4);
        await page.mouse.move(geo.x, Math.min(geo.tableBottom - 2, geo.headerBottom + 4));
        const probe = await page.evaluate(({ x, y }) => {
            const t = document.querySelector('table[data-mb-test-hover]');
            const hit = document.elementFromPoint(x, y);
            return {
                hovered: t.matches(':hover'),
                hitHeader: !!(hit && hit.closest('body > div.header')),
                hitTable: !!(hit && t.contains(hit)),
            };
        }, { x: geo.x, y: geo.headerMidY });
        expect(probe.hovered, 'premise: the pointer is on the table').toBe(true);
        expect(probe, 'the stuck header paints over the hovered table')
            .toMatchObject({ hitHeader: true, hitTable: false });
    });

    for (const [label, tableSel] of [
        ['Show all Aliases for Artist', 'table.tbl:not(.artist-credits)'],
        ['Show all Artist Credits for Artist', 'table.tbl.artist-credits'],
    ]) {
        test(`artist aliases page (${label}): the intro text stays put, the table's first column stays at its line, `
            + '"Add a new alias" is gone', async ({ page }) => {
            const ALIASES_URL = 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f/aliases';
            const ALIASES_SHELL = path.join(__dirname, 'artist-aliases-springsteen.html');
            await page.setViewportSize({ width: 1280, height: 800 });
            await loadUserscriptPage(page, { url: ALIASES_URL, fixtureFile: ALIASES_SHELL, testMode: true });
            await page.route(`${ALIASES_URL}?**`, (r) => r.fulfill({ path: ALIASES_SHELL, contentType: 'text/html' }));
            // Live, the page overflows by ~120 px even with the 906 px Credits
            // table: MB's stylesheet makes #page a table whose collapsed
            // sidebar cell sits beside the auto-resized content. The bare
            // fixture has neither, so #content is widened by hand; the indent
            // separates "at its line" from "at the window edge".
            await page.addStyleTag({ content: '#content { min-width: 2600px !important; } '
                + '#content { padding-left: 24px !important; }' });
            // MB renders this link for logged-in editors only, so the
            // logged-out fixture lacks it; same markup, same place.
            await page.evaluate(() => {
                const p = document.createElement('p');
                p.innerHTML = '<a href="/artist/70248960-cb53-4ea4-943a-edb18f7d336f/add-alias">Add a new alias</a>';
                document.getElementById('content').appendChild(p);
            });
            await page.$eval(`button[data-label="${label}"]`, (b) => b.click());
            await waitForRenderComplete(page, { waitForAutoResize: false });
            await settleFocusAndPointer(page);
            await waitEngaged(page);

            expect(await page.locator('a[href$="/add-alias"]').count(), '"Add a new alias" is removed').toBe(0);
            const geom = () => page.evaluate((sel) => {
                const t = document.querySelector(sel);
                const th = t.querySelector(':scope > thead > tr:first-child > .mb-sticky-col');
                const intro = t.previousElementSibling;
                return {
                    th: th.getBoundingClientRect().left,
                    intro: intro.tagName === 'P' ? intro.getBoundingClientRect().left : NaN,
                };
            }, tableSel);
            const at0 = await geom();
            expect(at0.intro, 'premise: the intro <p> right above the table').not.toBeNaN();
            const scrollX = await scrollToRightEnd(page);
            expect(scrollX, 'premise: the page scrolls further than the table\'s indent').toBeGreaterThan(300);
            const end = await geom();
            expect(Math.abs(end.intro - at0.intro), 'the intro text did not move').toBeLessThanOrEqual(1);
            expect(Math.abs(end.th - at0.th), 'the first column stays at its line').toBeLessThanOrEqual(1);
        });
    }

    test('a pinned table that grows wider while scrolled is measured at its natural place', async ({ page }) => {
        // A property check, not a guard of its own: a table pinned whole has
        // a rect that travels with the scroll, and in the pass where it has
        // just outgrown the window _sphContentExtent() still reads that rect.
        // Sticky never moves it past its containing block, so the extent and
        // with it every bar's width must come out as at scrollX 0. A natural-
        // geometry special case for this was tried and taken out again: its
        // mutation changed nothing (2026-10-05).
        await openRatings(page, 1300);
        const maxw = () => page.evaluate(() => document.querySelector('#page > h1').style.getPropertyValue('--mb-sph-maxw'));
        const idx = await page.evaluate(() => Array.from(document.querySelectorAll('table.tbl'))
            .findIndex((t) => t.classList.contains('mb-sph-table')));
        expect(idx, 'premise: a table pinned whole').toBeGreaterThanOrEqual(0);
        await scrollToRightEnd(page);
        const passes = await page.evaluate(() => window.__saTest.sphRefreshPasses());
        // Wider than the window, but well short of the widest table.
        await page.evaluate((i) => {
            const t = document.querySelectorAll('table.tbl')[i];
            t.style.minWidth = `${document.documentElement.clientWidth + 150}px`;
        }, idx);
        await expect.poll(() => page.evaluate(() => window.__saTest.sphRefreshPasses())).toBeGreaterThan(passes);
        await expect.poll(() => page.evaluate((i) =>
            document.querySelectorAll('table.tbl')[i].classList.contains('mb-sph-table'), idx)).toBe(false);
        const scrolled = await maxw();
        // The same pass again at scrollX 0, where every rect is natural.
        await page.evaluate(() => window.scrollTo(0, window.scrollY));
        const p2 = await page.evaluate(() => window.__saTest.sphRefreshPasses());
        await page.evaluate(() => window.dispatchEvent(new Event('resize')));
        await expect.poll(() => page.evaluate(() => window.__saTest.sphRefreshPasses())).toBeGreaterThan(p2);
        expect(scrolled, 'bar width computed while scrolled equals the one at scrollX 0').toBe(await maxw());
    });
});

test.describe('sticky page headers — the sticky column docks in line with its bars', () => {
    // applyStickyColumn() pins its cells at `left: 0`, while every h2/h3 bar
    // is pinned at its own natural left. So the column docked at the window
    // edge, left of the (indented) bar above its table (release 52c6808b…,
    // isrc/USSM19500019). While the feature is engaged the column now docks
    // at its TABLE's natural left, and the gutter left of it is masked once
    // it has docked. The guarantee pinned here is the docking POSITION, read
    // after a real scroll — not "the cell is still visible", which the old
    // `left: 0` met as well.

    const RELEASE_URL = 'https://musicbrainz.org/release/1d404e1d-fcb6-3a52-b478-e706e893c897';
    const RELEASE_SHELL = path.join(__dirname, '..', 'snapshots', 'release-tracks', 'raw.html');

    /**
     * Geometry of every rendered table with a sticky column: the table's own
     * left (its natural left only while scrollX is 0), the sticky header and
     * first body cell's left, the nearest preceding h2/h3 bar's left, the
     * docked class and the sticky header cell's box-shadow.
     *
     * @param {import('@playwright/test').Page} page
     * @returns {Promise<Array<{tableLeft: number, thLeft: number, tdLeft: number,
     *   tableRight: number, barLeft: number, docked: boolean, shadow: string, p: number}>>}
     */
    const stickyGeom = (page) => page.evaluate(() => Array.from(document.querySelectorAll('table.tbl'))
        .filter((t) => t.getClientRects().length > 0
            && t.querySelector(':scope > thead > tr:first-child > .mb-sticky-col'))
        .map((t) => {
            const th = t.querySelector(':scope > thead > tr:first-child > .mb-sticky-col');
            const td = t.querySelector(':scope > tbody > tr > td.mb-sticky-col');
            let bar = null;
            for (let el = t.previousElementSibling; el && !bar; el = el.previousElementSibling) {
                if (/^H[23]$/.test(el.tagName)) bar = el;
            }
            const prev = th.previousElementSibling;
            return {
                tableLeft: t.getBoundingClientRect().left + t.clientLeft,
                tableRight: t.getBoundingClientRect().right,
                thLeft: th.getBoundingClientRect().left,
                tdLeft: td ? td.getBoundingClientRect().left : NaN,
                barLeft: bar ? bar.getBoundingClientRect().left : NaN,
                docked: t.classList.contains('mb-sph-col-docked'),
                shadow: getComputedStyle(th).boxShadow,
                p: prev ? prev.getBoundingClientRect().right - (t.getBoundingClientRect().left + t.clientLeft) : 0,
            };
        }));

    // MusicBrainz's own table.tbl rules that matter here (musicbrainz-server
    // root/static/styles/layout.less): a top and bottom border on the TABLE
    // box, and a background on thead. The bare fixtures load without that
    // stylesheet, and it is exactly what drew the stray lines into the
    // gutter (debug/stray-lines.html).
    const MB_TBL_CSS = 'table.tbl { border-top: solid 1px #999; border-bottom: solid 1px #999; } '
        + 'table.tbl > thead { background: #c8c8c8; } '
        + '#content { padding-left: 24px !important; }';

    /**
     * Counts the pixels in the gutter beside the first table with a sticky
     * column that differ from the page background: the strip from the
     * window's left edge to just short of the docking offset, from 3 px above
     * the table to 3 px below it. This is what the user sees: a column
     * sliding through the gutter, or a border line stretching into it, both
     * show up here, whatever CSS produced them. Decoded through a canvas in
     * the page, so no PNG library is needed.
     *
     * @param {import('@playwright/test').Page} page
     * @returns {Promise<{bad: number, total: number, sample: number[]}>}
     */
    async function gutterDirt(page) {
        const box = await page.evaluate(() => {
            const t = Array.from(document.querySelectorAll('table.tbl'))
                .find((x) => x.dataset.mbSphColLeft && x.getClientRects().length > 0);
            const r = t.getBoundingClientRect();
            return {
                x: 0,
                y: Math.max(0, Math.floor(r.top) - 3),
                width: Math.floor(parseFloat(t.dataset.mbSphColLeft)) - 2,
                height: Math.ceil(r.height) + 6,
            };
        });
        expect(box.width, 'premise: a gutter wide enough to inspect').toBeGreaterThan(10);
        const png = await page.screenshot({ clip: box });
        return page.evaluate(async (b64) => {
            const img = new Image();
            img.src = `data:image/png;base64,${b64}`;
            await img.decode();
            const c = document.createElement('canvas');
            c.width = img.width;
            c.height = img.height;
            const ctx = c.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const d = ctx.getImageData(0, 0, c.width, c.height).data;
            let bad = 0;
            let sample = [];
            for (let i = 0; i < d.length; i += 4) {
                if (Math.abs(d[i] - 255) + Math.abs(d[i + 1] - 255) + Math.abs(d[i + 2] - 255) > 6) {
                    if (!bad) sample = [i / 4 % c.width, Math.floor(i / 4 / c.width), d[i], d[i + 1], d[i + 2]];
                    bad++;
                }
            }
            return { bad, total: d.length / 4, sample };
        }, png.toString('base64'));
    }

    /**
     * Scrolls the window to `x` and waits one frame for sticky offsets.
     *
     * @param {import('@playwright/test').Page} page
     * @param {number} x
     * @returns {Promise<number>} the resulting scrollX
     */
    async function scrollToX(page, x) {
        await page.evaluate((v) => window.scrollTo(v, window.scrollY), x);
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
        return page.evaluate(() => window.scrollX);
    }

    test('single-table: docks at the table\'s own left, masked, not at the window edge', async ({ page }) => {
        // The bare fixture has no MB stylesheet, so #content has no indent of
        // its own; give it one, or "docks at the table's left" and "docks at
        // 0" would be the same number.
        await openSeries(page, { css: MB_TBL_CSS });
        await waitEngaged(page);
        const before = await stickyGeom(page);
        expect(before, 'premise: one table with a sticky column').toHaveLength(1);
        expect(before[0].tableLeft, 'premise: the table is indented').toBeGreaterThan(10);

        const scrollX = await scrollToRightEnd(page);
        expect(scrollX).toBeGreaterThan(1000);
        const after = await stickyGeom(page);
        expect(after[0].tableLeft, 'premise: the table itself scrolled').toBeLessThan(before[0].tableLeft - 900);
        expect(Math.abs(after[0].thLeft - before[0].tableLeft), 'sticky th docks at the table\'s natural left')
            .toBeLessThanOrEqual(1);
        expect(Math.abs(after[0].tdLeft - before[0].tableLeft), 'sticky td docks at the table\'s natural left')
            .toBeLessThanOrEqual(1);
        expect(after[0].docked).toBe(true);
        const left = await page.evaluate(() => document.querySelector('table.tbl').dataset.mbSphColLeft);
        expect(after[0].shadow, 'the gutter left of the docked column is masked').toContain(`-${left}px 0px 0px 0px`);
        // What the user sees: no cell content and no stray table border line
        // in the strip left of the docked column.
        const dirt = await gutterDirt(page);
        expect(dirt.bad, `gutter pixels that are not page background (first: ${dirt.sample})`).toBe(0);
    });

    test('multi-table: every sub-table\'s sticky column docks at its own table\'s left', async ({ page }) => {
        await page.setViewportSize({ width: 700, height: 800 });
        await loadUserscriptPage(page, { url: RATINGS_URL, fixtureFile: RATINGS_SHELL, testMode: true });
        await page.addStyleTag({ content: '#content { padding-left: 24px !important; }' });
        await page.click('button[data-label="Show Ratings for User"]');
        await waitForRenderComplete(page);
        const anyHidden = () => page.evaluate(() => Array.from(document.querySelectorAll('table.tbl'))
            .some((t) => t.getClientRects().length === 0));
        if (await anyHidden()) await page.locator('.mb-master-toggle').first().click();
        await expect.poll(anyHidden, { message: 'every sub-table expanded' }).toBe(false);
        await settleFocusAndPointer(page);
        await waitEngaged(page);

        const before = await stickyGeom(page);
        expect(before.length, 'premise: several sub-tables with a sticky column').toBeGreaterThanOrEqual(5);
        expect(before.every((g) => g.tableLeft > 10), 'premise: the tables are indented').toBe(true);
        await scrollToRightEnd(page);
        // A sticky cell cannot leave its table, so a narrow sub-table that
        // scrolled out of view entirely takes its column with it. Judge the
        // ones still reaching past their docking point, and that did scroll.
        const after = await stickyGeom(page);
        const judged = after
            .map((g, i) => ({ ...g, natural: before[i].tableLeft }))
            .filter((g) => g.tableLeft < g.natural - 200 && g.tableRight > g.natural + 300);
        expect(judged.length, 'premise: some sub-tables scrolled under their sticky column').toBeGreaterThan(0);
        const off = judged
            .map((g) => ({ th: g.thLeft, td: g.tdLeft, natural: g.natural }))
            .filter((g) => Math.abs(g.th - g.natural) > 1 || Math.abs(g.td - g.natural) > 1);
        expect(off, 'sticky cells not docked at their table\'s natural left').toEqual([]);
    });

    test('a column after another one ("#" then "Title"): nothing slides into the gutter, before or after it docks', async ({ page }) => {
        await page.setViewportSize(VIEWPORT);
        await loadUserscriptPage(page, {
            url: RELEASE_URL,
            fixtureFile: RELEASE_SHELL,
            testMode: true,
            settingsOverride: { sa_enable_release_tracks: true },
        });
        await page.addStyleTag({ content: MB_TBL_CSS });
        await page.route(`${RELEASE_URL}?**`, (r) => r.fulfill({ path: RELEASE_SHELL, contentType: 'text/html' }));
        await page.$eval('button[data-label="Show all Tracks for Release"]', (b) => b.click());
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await settleFocusAndPointer(page);
        await waitEngaged(page);

        const at0 = (await stickyGeom(page))[0];
        expect(at0.p, 'premise: a column precedes the sticky one').toBeGreaterThan(20);
        // release-tracks indents each sub-table like its h3 bar (both
        // margin-left: 1.5em, the layout of the reported release 52c6808b…);
        // they differ by a few px only through the em of each font size.
        expect(Math.abs(at0.barLeft - at0.tableLeft), 'premise: table indented like its h3 bar')
            .toBeLessThan(8);
        // At scrollX 0 a mask L px wide would sit over the "#" column.
        expect(at0.docked).toBe(false);
        expect(at0.shadow).toBe('none');

        const s1 = await scrollToX(page, Math.round(at0.p / 2));
        expect(s1, 'premise: the page scrolled less than "#" is wide').toBeLessThan(at0.p);
        const mid = (await stickyGeom(page))[0];
        expect(mid.docked, 'not docked yet, so the sticky column does not mask yet').toBe(false);
        // "#" docks at the bar's line instead of sliding into the gutter; the
        // sticky column is on its way over it.
        const hashLeft = await page.evaluate(() => document.querySelector('table.tbl')
            .querySelector(':scope > thead > tr:first-child > th').getBoundingClientRect().left);
        expect(Math.abs(hashLeft - at0.tableLeft), '"#" holds at the table\'s natural left').toBeLessThanOrEqual(1);
        expect(mid.thLeft, 'premise: the sticky column has not docked yet').toBeGreaterThan(at0.tableLeft + 5);
        const dirtMid = await gutterDirt(page);
        expect(dirtMid.bad, `gutter pixels before docking (first: ${dirtMid.sample})`).toBe(0);

        const s2 = await scrollToX(page, Math.round(at0.p) + 200);
        expect(s2).toBeGreaterThan(at0.p);
        const docked = (await stickyGeom(page))[0];
        expect(docked.docked).toBe(true);
        expect(docked.shadow).not.toBe('none');
        expect(Math.abs(docked.thLeft - at0.tableLeft), 'docks at the table\'s natural left').toBeLessThanOrEqual(1);
        // In line with the pinned h3 bar: the same offset from it as before
        // scrolling (the old left: 0 put it ~tableLeft px further left).
        expect(Math.abs((docked.barLeft - docked.thLeft) - (at0.barLeft - at0.tableLeft)),
            'keeps its alignment with the pinned h3 bar').toBeLessThanOrEqual(1);
        expect(Math.abs((docked.barLeft - docked.tdLeft) - (at0.barLeft - at0.tableLeft))).toBeLessThanOrEqual(1);
        await scrollToRightEnd(page);
        const dirtEnd = await gutterDirt(page);
        expect(dirtEnd.bad, `gutter pixels at the far right (first: ${dirtEnd.sample})`).toBe(0);

        await scrollToX(page, 0);
        expect((await stickyGeom(page))[0].docked, 'scrolling back takes the mask off again').toBe(false);
    });

    test('a refresh pass while scrolled keeps the column docked and masked', async ({ page }) => {
        // The docking point p is the width of the columns before the sticky
        // one ("#" here). It used to be read from the right edge of "#",
        // which docks too: a pass that ran while the page was scrolled read
        // p ≈ scrollX + 40, so the docked class and the gutter mask went off.
        // On petri the settle-based test above hit that by timing alone
        // (2026-10-05); this one forces the pass.
        await openSeries(page, { css: MB_TBL_CSS });
        await waitEngaged(page);
        const at0 = (await stickyGeom(page))[0];
        expect(at0.p, 'premise: a column precedes the sticky one').toBeGreaterThan(10);
        await scrollToRightEnd(page);
        expect((await stickyGeom(page))[0].docked, 'premise: docked after scrolling').toBe(true);
        const passes = await page.evaluate(() => window.__saTest.sphRefreshPasses());
        await page.evaluate(() => window.dispatchEvent(new Event('resize')));
        await expect.poll(() => page.evaluate(() => window.__saTest.sphRefreshPasses())).toBeGreaterThan(passes);
        const after = (await stickyGeom(page))[0];
        expect(after.docked, 'still docked after a pass at the far right').toBe(true);
        expect(after.shadow).not.toBe('none');
    });

    test('with sticky page headers off the column keeps docking at the window edge', async ({ page }) => {
        await openSeries(page, {
            settingsOverride: { sa_enable_sticky_page_headers: false },
            css: '#content { padding-left: 24px !important; }',
        });
        const before = await stickyGeom(page);
        expect(before[0].tableLeft, 'premise: the table is indented').toBeGreaterThan(10);
        await scrollToRightEnd(page);
        const after = await stickyGeom(page);
        expect(Math.abs(after[0].thLeft), 'previous behaviour: left 0').toBeLessThanOrEqual(1);
        expect(after[0].shadow).toBe('none');
    });
});
