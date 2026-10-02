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
            if (el.closest('table') || (sidebar && sidebar.contains(el))) return;
            if (el.getClientRects().length === 0 || nested(el)) return;
            const r = el.getBoundingClientRect();
            items.push({
                key: `${sel}[${i}]`,
                marked: el.classList.contains('mb-sph-target'),
                left: r.left,
                right: r.right,
            });
        });
    });
    // The last cell of the widest rendered table: never the sticky column,
    // and on a multi-table page never a collapsed or narrow sub-table.
    const widest = Array.from(document.querySelectorAll('table.tbl'))
        .filter((t) => t.getClientRects().length > 0)
        .sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
    const cell = widest && widest.querySelector('tbody tr td:last-child');
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
