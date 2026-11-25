'use strict';

// springsteenlyrics.com: Sticky Page Headers and the sticky "Title" column.
//
// What is promised: when the consolidated table is wider than the window and
// the window is scrolled sideways, everything ABOVE the table stays put — the
// site's breadcrumb, the injected toolbar <h1>, the category and filter
// blocks and the list's <h2> bar — and the "Title" column docks at the
// table's own left, in line with that bar. initStickyPageHeaders() used to
// stand down on this host, so all of it scrolled away.
//
// The assertions are GEOMETRIC (left edge before vs. after a real scroll),
// with a table cell moving as the premise, for the reason given at the top of
// sticky-page-headers.spec.js: a class can be present while the pinning fails.
//
// Three page shapes, because they reach the table differently: on "Official
// Albums" (collection) `.project-detail` contains the table, so the walk goes
// through it; on sampler the site's stray `</div>` closed it early, so
// `.project-detail` is pinned whole and the table sits in a later container;
// on memorabilia a second stray `</div>` also closes the floated column
// around `.project-detail` (the live "book" page has the same shape).
//
// The fixtures carry no site stylesheet. BOOTSTRAP_CSS restores the few
// Bootstrap 3 grid rules that matter here — container/column padding (so the
// table's natural left is not 0, otherwise "docks at the table's left" and
// "docks at the window edge" are the same number) and the FLOATED
// `.col-sm-12` around the list, which `_sphIsEligible()` refuses to pin and
// therefore must only ever be walked through.

const { test, expect } = require('../support/test');
const { loadSlListPage } = require('../support/slFixture');
const { waitForRenderComplete } = require('../support/browser');

// Wide enough for the widest Title column (sampler: ~660 px). A sticky cell
// cannot travel past its table's right edge, so in a narrower window, at the
// far right, a wider-than-the-room Title is pushed back left of its dock —
// plain `position: sticky`, on any host. The first premise below checks it.
const VIEWPORT = { width: 1000, height: 800 };

const BOOTSTRAP_CSS = [
    // Bootstrap's own global rule; without it every `width: 100%` column
    // overflows its row by its padding, and the boxes around the table end
    // short of it — which would fail the pinning for a reason the real site
    // does not have.
    '*, *::before, *::after { box-sizing: border-box; }',
    '.container { padding-left: 15px; padding-right: 15px; margin-left: auto; margin-right: auto; }',
    '.row { margin-left: -15px; margin-right: -15px; }',
    '.row::after { content: ""; display: table; clear: both; }',
    '.col-sm-12 { position: relative; min-height: 1px; padding-left: 15px; padding-right: 15px; float: left; width: 100%; }',
    // Bootstrap's fixed container width at this window size. The site's
    // year-filter block is such a container; centred with auto margins in the
    // table-wide column it sat off-screen (see _ensureSlStyle()).
    '@media (min-width: 992px) { .container { width: 970px; } }',
].join('\n');

/**
 * Selectors of what must stay put, built from the page structure rather than
 * from the feature's own target list.
 * @type {string[]}
 */
const MUST_PIN = [
    '.breadcrumb-wrap',
    'h1.mb-sl-h1',
    '.project-detail > .element-buttons',
    'h2.mb-sl-list-heading',
];

/**
 * With the compact category/filter bar on (sa_sl_compact_nav), the bar
 * stands in for the walls of links and the year slider, which are hidden:
 * the bar is what must stay put.
 * @type {string[]}
 */
const MUST_PIN_COMPACT = [
    '.breadcrumb-wrap',
    'h1.mb-sl-h1',
    '.mb-sl-scope',
    'h2.mb-sl-list-heading',
];

/**
 * The bootleg lists wrap their content in `.col-md-12`, not `.col-sm-12`
 * (debug/sl-bootleg-date-range.html); Bootstrap gives it the same padding and
 * full-width float from 992 px up. Added for that page only, so the other
 * shapes keep exactly the CSS they were checked with.
 * @type {string}
 */
const BOOTSTRAP_CSS_MD = '@media (min-width: 992px) { .col-md-12 { position: relative; min-height: 1px; '
    + 'padding-left: 15px; padding-right: 15px; float: left; width: 100%; } }';

/**
 * Opens one SL fixture at VIEWPORT with BOOTSTRAP_CSS and renders the table.
 * @param {import('@playwright/test').Page} page
 * @param {string} kind
 * @param {Object<string, *>} [settingsOverride={}]
 * @returns {Promise<void>}
 */
async function openSl(page, kind, settingsOverride = {}) {
    await page.setViewportSize(VIEWPORT);
    const { spec } = await loadSlListPage(page, { kind, settingsOverride });
    await page.addStyleTag({ content: kind === 'bootlegs' ? `${BOOTSTRAP_CSS}\n${BOOTSTRAP_CSS_MD}` : BOOTSTRAP_CSS });
    // Through the DOM: a pinned bar can sit over the button for the hit-test.
    await page.$eval(`button[data-label="${spec.button}"]`, (b) => b.click());
    await waitForRenderComplete(page, { waitForAutoResize: false });
    // The global filter takes focus after the render, and focus() scrolls it
    // into view; then park the pointer away from the pinned bars.
    await page.waitForFunction(
        () => document.activeElement && document.activeElement.id === 'mb-global-filter-input',
        null, { timeout: 5000 }).catch(() => {});
    await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
    await page.mouse.move(VIEWPORT.width - 2, VIEWPORT.height - 2);
    await page.waitForFunction(() => document.documentElement.classList.contains('mb-sph-on'), null, { timeout: 10000 });
}

/**
 * Left edges of every MUST_PIN match (first match per selector), of the
 * table, of its Title header/cell and of a non-sticky cell.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<object>}
 */
const geometry = (page, sels) => page.evaluate((sels) => {
    const table = document.querySelector('table.tbl');
    const th = table.querySelector(':scope > thead > tr:first-child > th.mb-sticky-col');
    const td = table.querySelector(':scope > tbody > tr > td.mb-sticky-col');
    const last = Array.from(table.querySelectorAll(':scope > tbody > tr:first-child > td')).pop();
    return {
        scrollX: window.scrollX,
        items: sels.map((sel) => {
            const el = document.querySelector(sel);
            return {
                sel,
                found: !!el,
                marked: !!(el && el.closest('.mb-sph-target')),
                // Hidden in the table view since the original-page switch
                // (2026-11-25): the site's walls, when the compact bar is off.
                shown: !!(el && el.getClientRects().length),
                left: el ? el.getBoundingClientRect().left : NaN,
                right: el ? el.getBoundingClientRect().right : NaN,
            };
        }),
        tableLeft: table.getBoundingClientRect().left + table.clientLeft,
        tableParentMarked: !!table.parentElement.closest('.mb-sph-target'),
        stickyName: th ? (th.dataset.colName || th.textContent.trim()) : null,
        thLeft: th ? th.getBoundingClientRect().left : NaN,
        tdLeft: td ? td.getBoundingClientRect().left : NaN,
        lastCellLeft: last.getBoundingClientRect().left,
        thWidth: th ? th.getBoundingClientRect().width : NaN,
    };
}, sels);

/**
 * The year-filter block: a fixed-width Bootstrap `.container` inside the
 * widened column, present on sampler but not on "Official Albums".
 * @type {string}
 */
const YEAR_FILTER = '.container:not(.mb-sl-wide):has(#f_range)';

// memorabilia: a second stray `</div>` also closes the FLOATED `.col-sm-12`
// holding `.project-detail`, so the walk has to descend into a full-width
// float (_sphIsFullWidthFloat()) to reach the toolbar <h1> and the buttons.
// Each shape runs twice: with the site's walls of links, and with the compact
// bar (sa_sl_compact_nav) folding them, which must be pinned the same way.
for (const [kind, sels, settings, tag] of [
    ['collection', MUST_PIN, {}, ''],
    ['sampler', [...MUST_PIN, YEAR_FILTER], {}, ''],
    ['memorabilia', [...MUST_PIN, YEAR_FILTER], {}, ''],
    ['collection', MUST_PIN_COMPACT, { sa_sl_compact_nav: true }, ' (compact bar)'],
    ['sampler', MUST_PIN_COMPACT, { sa_sl_compact_nav: true }, ' (compact bar)'],
    ['memorabilia', MUST_PIN_COMPACT, { sa_sl_compact_nav: true }, ' (compact bar)'],
    ['bootlegs', MUST_PIN_COMPACT, { sa_sl_compact_nav: true }, ' (compact bar)'],
]) {
    test(`${kind}${tag}: everything above the table stays put, and Title docks at the table's left`, async ({ page }) => {
        await openSl(page, kind, settings);
        const before = await geometry(page, sels);
        expect(before.scrollX).toBe(0);
        expect(before.stickyName, 'the sticky column is Title').toMatch(/^Title/);
        expect(before.tableLeft, 'premise: the table is indented').toBeGreaterThan(10);
        expect(before.tableLeft + before.thWidth, 'premise: the Title column fits the window')
            .toBeLessThan(VIEWPORT.width - 30);
        expect(before.items.filter((it) => !it.found).map((it) => it.sel), 'premise: every element exists').toEqual([]);

        await page.evaluate(() => window.scrollTo(document.documentElement.scrollWidth, window.scrollY));
        await page.waitForFunction(() => window.scrollX > 0);
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
        const after = await geometry(page, sels);
        expect(after.scrollX, 'premise: the page scrolls sideways').toBeGreaterThan(200);
        expect(before.lastCellLeft - after.lastCellLeft, 'premise: a table cell moves with the scroll')
            .toBeGreaterThan(after.scrollX * 0.9);

        // What shows above the table stays put; the site's leftovers hide in the
        // table view (vzell, 2026-11-25), the walls among them without the compact bar.
        expect(after.items.filter((it) => it.shown && !it.marked).map((it) => it.sel), 'not pinned').toEqual([]);
        const moved = after.items
            .map((it, i) => ({ sel: it.sel, shown: it.shown, from: before.items[i].left, to: it.left }))
            .filter((m) => m.shown)
            .filter((m) => Math.abs(m.to - m.from) > 1);
        expect(moved, 'elements whose left edge moved while scrolling').toEqual([]);
        const outside = after.items
            .filter((it) => it.shown && (it.left < -1 || it.right > VIEWPORT.width + 1))
            .map((it) => ({ sel: it.sel, left: it.left, right: it.right }));
        expect(outside, 'pinned elements not inside the window').toEqual([]);

        // The table itself scrolls; its container is walked through, not pinned.
        expect(after.tableParentMarked).toBe(false);
        expect(Math.abs(after.thLeft - before.tableLeft), 'Title th docks at the table\'s natural left').toBeLessThanOrEqual(1);
        expect(Math.abs(after.tdLeft - before.tableLeft), 'Title td docks at the table\'s natural left').toBeLessThanOrEqual(1);
    });
}

test('collection: scrolled down, the list h2 docks under the site\'s navbar and the thead under it', async ({ page }) => {
    // The sticky filter bars (2026-10-09): the site's navbar is fixed at the
    // top once the page scrolls (its "sticky" plugin), so the thead already
    // stuck below it (--mb-sl-navbar-h); the list h2 now docks there, the
    // thead below the h2. The fixture has no site CSS, so the navbar itself
    // is not fixed here: what is pinned is the offset. Unstyled, the navbar
    // measures thousands of px, which the bars ignore (no real fixed header
    // is a third of the window), so a real one's height is set here.
    await openSl(page, 'collection');
    await page.addStyleTag({ content: 'table.tbl > tbody > tr > td { height: 200px; }' });
    // The height is the navbar's own, measured again on every resize
    // (_slNavbarOffset()), so it is given to the navbar, not to the variable.
    await page.addStyleTag({ content: '.navbar { height: 52px; overflow: hidden; }' });
    await page.evaluate(() => { window.dispatchEvent(new Event('resize')); });
    const y = await page.evaluate(() => document.querySelector('table.tbl').getBoundingClientRect().top + window.scrollY + 1200);
    await page.evaluate((v) => window.scrollTo(0, v), y);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const g = await page.evaluate(() => {
        const nav = parseFloat(document.documentElement.style.getPropertyValue('--mb-sl-navbar-h'));
        const h2 = document.getElementById('mb-global-filter-input').closest('h2').getBoundingClientRect();
        const t = document.querySelector('table.tbl');
        const heads = Array.from(document.querySelectorAll('.mb-vsb-head'), (el) => el.getBoundingClientRect());
        return { nav, h2Top: h2.top, h2Bottom: h2.bottom, theadTop: t.tHead.getBoundingClientRect().top,
            tableTop: t.getBoundingClientRect().top,
            stackTop: heads.length ? Math.min(...heads.map((r) => r.top)) : h2.top,
            // The h2 docks a 6 px gap under the block (VSB_HEAD_GAP).
            headBottom: heads.length ? Math.max(...heads.map((r) => r.bottom)) + 6 : h2.top };
    });
    expect(g.nav, 'premise: the navbar height is known').toBeGreaterThan(0);
    // The measurement tries `position: fixed` on the navbar for one read
    // (_slNavbarOffset()); nothing of it may stay behind.
    expect(await page.evaluate(() => document.querySelector('.navbar.sticky').style.position),
        'the navbar\'s inline position is left empty').toBe('');
    expect(g.tableTop, 'premise: the table starts above the window').toBeLessThan(-500);
    // The stuck stack (the header block, if it is stuck here, then the h2)
    // starts at the navbar height.
    expect(Math.abs(g.stackTop - g.nav), 'the stack docks at the navbar height').toBeLessThanOrEqual(1);
    expect(Math.abs(g.h2Top - g.headBottom), 'the h2 under the header block').toBeLessThanOrEqual(1);
    expect(Math.abs(g.theadTop - g.h2Bottom), 'the thead docks under the h2').toBeLessThanOrEqual(1);
});

// ---------------------------------------------------------------------------
// The navbar on a narrow window, and the backdrop of a block that has left
// (reported 2026-11-16 from a phone: a white band stayed near the top of
// collection.php and the page scrolled behind it).
// ---------------------------------------------------------------------------

/**
 * The site's navbar rules that matter here (css/style-red.css, read
 * 2026-11-16): 80 px high, white, and NOT fixed up to 992 px, whatever the
 * "sticky" plugin writes inline.
 * @type {string}
 */
const NAVBAR_CSS = [
    '.navbar { min-height: 80px; height: 80px; overflow: hidden; background: #fff; width: 100%; }',
    '@media (max-width: 992px) { .navbar-default, .navbar-inverse { position: relative !important; } }',
].join('\n');

/**
 * Opens the collection entry page WITHOUT pressing anything, with the
 * navbar's CSS, the plugin's inline `position: fixed` and room to scroll.
 * @param {import('@playwright/test').Page} page
 * @param {?{width: number, height: number}} viewport - `null`: the project's own (Pixel 7).
 * @returns {Promise<void>}
 */
async function openSlInitial(page, viewport) {
    if (viewport) await page.setViewportSize(viewport);
    await loadSlListPage(page, { kind: 'collection-intro' });
    await page.addStyleTag({ content: `${BOOTSTRAP_CSS}\n${NAVBAR_CSS}` });
    await page.evaluate(() => {
        // jquery.sticky, once scrolled: inline, at any width.
        const nav = document.querySelector('.navbar.sticky');
        nav.style.position = 'fixed';
        nav.style.top = '0px';
        const spacer = document.createElement('div');
        spacer.style.height = '4000px';
        document.body.appendChild(spacer);
        window.dispatchEvent(new Event('resize'));
    });
    await page.waitForFunction(() => document.querySelector('h1.mb-sl-h1')?.closest('.mb-vsb-head') && document.getElementById('mb-vsb-mask'),
        null, { timeout: 10000 });
    await frames(page);
}

/**
 * Two animation frames: the bars' refresh and the backdrop's scroll update
 * are each scheduled for the next frame.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
const frames = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

/**
 * Scrolls to `y` and reads the header block, the backdrop and what is
 * painted in the band the backdrop takes.
 * @param {import('@playwright/test').Page} page
 * @param {number} y
 * @returns {Promise<{h1Top: number, h1Bottom: number, maskOn: boolean, bandIsMask: boolean, scrollY: number}>}
 */
async function scrollAndRead(page, y) {
    await page.evaluate((v) => window.scrollTo(0, v), y);
    await frames(page);
    return page.evaluate(() => {
        // The sticky block: the h1, or the div.mb-sl-header around it
        // where the site closes .project-detail early (_slPlaceHead()).
        const h1 = document.querySelector('h1.mb-sl-h1');
        const head = h1.closest('.mb-vsb-head') || h1;
        const r = head.getBoundingClientRect();
        const mask = document.getElementById('mb-vsb-mask');
        const dock = parseFloat(getComputedStyle(head).top) || 0;
        const hit = document.elementFromPoint(window.innerWidth - 5, dock + 10);
        return { h1Top: r.top, h1Bottom: r.bottom, maskOn: mask.classList.contains('mb-vsb-mask-on'),
            bandIsMask: hit === mask, scrollY: window.scrollY };
    });
}

/**
 * Document positions the scrolls are derived from: the header block's
 * natural top and the end of its parent (the end of its sticky travel).
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{h1Y: number, parentEndY: number, dock: number, navVar: string, navH: number}>}
 */
const layout = (page) => page.evaluate(() => {
    window.scrollTo(0, 0);
    const h1 = document.querySelector('h1.mb-sl-h1');
    const head = h1.closest('.mb-vsb-head') || h1;
    return { h1Y: head.getBoundingClientRect().top, parentEndY: head.parentElement.getBoundingClientRect().bottom,
        dock: parseFloat(getComputedStyle(head).top), navVar: document.documentElement.style.getPropertyValue('--mb-sl-navbar-h'),
        navH: document.querySelector('.navbar.sticky').offsetHeight };
});

test('narrow window: the site leaves its navbar in the flow, so the header block docks at the very top', async ({ page }) => {
    await openSlInitial(page, { width: 700, height: 800 });
    const l = await layout(page);
    expect(l.navH, 'premise: the navbar has its height').toBe(80);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.navbar.sticky')).position),
        'premise: the site overrides the plugin\'s inline fixed').toBe('relative');
    expect(l.navVar, 'no navbar height is reserved').toBe('0px');
    expect(l.dock, 'the h1\'s dock').toBe(0);
    const g = await scrollAndRead(page, l.h1Y + 3);
    expect(g.scrollY, 'premise: scrolled').toBeGreaterThan(80);
    expect(Math.abs(g.h1Top), 'the h1 sits at the top of the window, no gap above it').toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.querySelector('.navbar.sticky').style.position),
        'the plugin\'s inline position is left as it was').toBe('fixed');
});

test('wide window: the navbar can be fixed, the header block docks under it', async ({ page }) => {
    await openSlInitial(page, VIEWPORT);
    const l = await layout(page);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.navbar.sticky')).position),
        'premise: the navbar is fixed').toBe('fixed');
    expect(l.navVar, 'the navbar height is reserved').toBe('80px');
    expect(l.dock, 'the h1\'s dock').toBe(80);
});

for (const [name, viewport] of [['narrow', { width: 700, height: 800 }], ['wide', VIEWPORT]]) {
    test(`${name} window: the backdrop is there while the header block is docked and gone once the block has left`, async ({ page }) => {
        await openSlInitial(page, viewport);
        const l = await layout(page);
        const stuckY = l.h1Y - l.dock + 3;
        const goneY = l.parentEndY + 300;
        const stuck = await scrollAndRead(page, stuckY);
        expect(Math.abs(stuck.h1Top - l.dock), 'premise: the h1 is docked').toBeLessThanOrEqual(1);
        expect(stuck.maskOn, 'docked: the backdrop is on').toBe(true);
        const gone = await scrollAndRead(page, goneY);
        expect(gone.h1Bottom, 'premise: the h1 has left the window with its parent').toBeLessThan(0);
        expect(gone.maskOn, 'left: the backdrop is off').toBe(false);
        expect(gone.bandIsMask, 'left: the page, not a white band, is painted where the block was').toBe(false);
        const back = await scrollAndRead(page, stuckY);
        expect(back.maskOn, 'docked again: the backdrop is back').toBe(true);
    });
}

// ---------------------------------------------------------------------------
// Where the site closes .project-detail early, the header block still stays
// docked over the whole list (reported 2026-11-16 the same day,
// debug/SL-sticky-area-sticky-then-moved-IP.mp4: on the collection entry
// page the SAED line docked, then scrolled away). A sticky element never
// leaves its parent, and .project-detail ended right after the category
// walls on these three shapes (scripts/probe-sl-sticky-head.probe.js found
// no other). _slPlaceHead() wraps the h1 in div.mb-sl-header in the nearest
// ancestor that holds the list.
// ---------------------------------------------------------------------------

/** The page shapes whose list comes after `.project-detail` has closed. */
const EARLY_CLOSE = ['collection-intro', 'sampler', 'memorabilia'];

/**
 * Opens an SL list with the Bootstrap stand-in in its own `<head>` (so the
 * header wrapper's side padding is measured against it, as on the real
 * site), optionally presses its button.
 * @param {import('@playwright/test').Page} page
 * @param {string} kind
 * @param {boolean} press
 * @param {{css?: string, viewport?: {width: number, height: number}}} [opts]
 * @returns {Promise<void>}
 */
async function openWithHeadCss(page, kind, press, { css = BOOTSTRAP_CSS, viewport = VIEWPORT } = {}) {
    await page.setViewportSize(viewport);
    const { spec } = await loadSlListPage(page, { kind, headCss: css, settingsOverride: { sa_render_threshold: 100000 } });
    if (press) {
        await page.$eval(`button[data-label="${spec.button}"]`, (b) => b.click());
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
    }
    await page.waitForFunction(() => document.querySelector('h1.mb-sl-h1')?.closest('.mb-vsb-head'), null, { timeout: 10000 });
    await frames(page);
}

/**
 * Scrolls to 80 % of the page's scroll range (deep in the list or table on
 * every list fixture) and reads the header block against its dock and
 * against the end of `.project-detail`.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<object>}
 */
async function readDeep(page) {
    await page.evaluate(() => window.scrollTo(0, Math.round((document.documentElement.scrollHeight - innerHeight) * 0.8)));
    await frames(page);
    return page.evaluate(() => {
        const h1 = document.querySelector('h1.mb-sl-h1');
        const head = h1.closest('.mb-vsb-head');
        const status = document.getElementById('mb-status-displays-wrapper');
        return {
            headTop: head.getBoundingClientRect().top, dock: parseFloat(getComputedStyle(head).top) || 0,
            projectDetailBottom: document.querySelector('.project-detail').getBoundingClientRect().bottom,
            statusInHead: !!(status && head.contains(status)),
            maskOn: document.getElementById('mb-vsb-mask').classList.contains('mb-vsb-mask-on'),
            scrollY: Math.round(window.scrollY), scrollHeight: document.documentElement.scrollHeight,
            pdHeight: Math.round(document.querySelector('.project-detail').getBoundingClientRect().height),
        };
    });
}

for (const kind of EARLY_CLOSE) {
    for (const press of [false, true]) {
        test(`${kind} (${press ? 'after the press' : 'initial page'}): the header block stays docked past the end of .project-detail`, async ({ page }) => {
            await openWithHeadCss(page, kind, press);
            const g = await readDeep(page);
            // After the press .project-detail holds only the site's walls here (the h1
            // moved out of it), so the table view hides it (2026-11-25): out of the
            // window either way.
            expect(g.projectDetailBottom < 0 || (press && g.pdHeight === 0),
                `premise: .project-detail is out of the window ${JSON.stringify(g)}`).toBe(true);
            expect(Math.abs(g.headTop - g.dock), 'the header block is at its dock').toBeLessThanOrEqual(1);
            expect(g.statusInHead, 'the status line docks with the h1').toBe(true);
            expect(g.maskOn, 'the backdrop is behind it').toBe(true);
        });
    }

    test(`${kind}: the h1 moved out of .project-detail keeps its place on the page`, async ({ page }) => {
        await openWithHeadCss(page, kind, false);
        await expectSamePlace(page, kind === 'memorabilia' ? MEMORABILIA_RISE : 0);
    });
}

/**
 * How far anything may rise on memorabilia, in px. There the h1 leaves the
 * floated .col-sm-12 for the .row around it, and two spaces of the site's
 * markup change place (scripts/probe-sl-head-margins.probe.js, 2026-11-16):
 * a line box of a U+FEFF (a byte-order mark, which CSS does not treat as
 * white space) that starts the column, 17 px, is now under the status line
 * instead of over the h1; and a <p>'s 16 px margin that collapsed up to the
 * container's top while the float was the row's only block before it no
 * longer pushes the column down (wide window only: under 768 px the column
 * is not floated). So the h1 sits up to 34 px higher and the walls up to
 * 16 px: spaces of the broken markup close up, none opens, nothing sinks.
 * @type {number}
 */
const MEMORABILIA_RISE = 34;

/**
 * Positions as moved, then with the h1 and the status line put back as the
 * first children of .project-detail (where _slPrepareLivePage() inserts the
 * h1): nothing may differ by more than a pixel, except that a top edge may
 * sit up to `rise` px higher (never lower).
 * @param {import('@playwright/test').Page} page
 * @param {number} [rise=0]
 * @returns {Promise<void>}
 */
async function expectSamePlace(page, rise = 0) {
    const g = await page.evaluate(() => {
        window.scrollTo(0, 0);
        const h1 = document.querySelector('h1.mb-sl-h1');
        const pd = document.querySelector('.project-detail');
        const status = document.getElementById('mb-status-displays-wrapper');
        const wrapper = h1.parentElement;
        const next = Array.from(pd.children).find((c) => c.getClientRects().length);
        const read = () => ({ h1Left: h1.getBoundingClientRect().left, h1Top: h1.getBoundingClientRect().top,
            statusTop: status.getBoundingClientRect().top, nextTop: next.getBoundingClientRect().top,
            nextLeft: next.getBoundingClientRect().left });
        const moved = read();
        const inWrapper = wrapper.classList.contains('mb-sl-header');
        pd.insertBefore(status, pd.firstChild);
        pd.insertBefore(h1, status);
        wrapper.remove();
        return { inWrapper, moved, original: read() };
    });
    expect(g.inWrapper, 'premise: the h1 was moved').toBe(true);
    for (const k of Object.keys(g.original)) {
        if (rise && k.endsWith('Top')) {
            expect(g.original[k] - g.moved[k], `${k}: never lower than in the original place`).toBeGreaterThanOrEqual(-1);
            expect(g.original[k] - g.moved[k], `${k}: at most ${rise} px higher`).toBeLessThanOrEqual(rise + 1);
        } else {
            expect(Math.abs(g.moved[k] - g.original[k]), `${k}: as in the original place`).toBeLessThanOrEqual(1);
        }
    }
}

/**
 * Bootstrap's own rule: the column floats only from 768 px. Under it the
 * column starts no block formatting context, and the h1's margin collapses
 * up through it as it did in its original place.
 * @type {string}
 */
const BOOTSTRAP_CSS_SM_FLOAT = BOOTSTRAP_CSS.replace(
    '.col-sm-12 { position: relative; min-height: 1px; padding-left: 15px; padding-right: 15px; float: left; width: 100%; }',
    '.col-sm-12 { position: relative; min-height: 1px; padding-left: 15px; padding-right: 15px; } '
    + '@media (min-width: 768px) { .col-sm-12 { float: left; width: 100%; } }');

test('memorabilia at 700 px (the column not floated): the moved h1 keeps its place', async ({ page }) => {
    expect(BOOTSTRAP_CSS_SM_FLOAT, 'premise: the float rule was replaced').not.toBe(BOOTSTRAP_CSS);
    await openWithHeadCss(page, 'memorabilia', false, { css: BOOTSTRAP_CSS_SM_FLOAT, viewport: { width: 700, height: 800 } });
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.col-sm-12')).float), 'premise').toBe('none');
    await expectSamePlace(page, MEMORABILIA_RISE);
});

test('memorabilia opened wide, then narrowed to 700 px: the moved h1 keeps its place', async ({ page }) => {
    await openWithHeadCss(page, 'memorabilia', false, { css: BOOTSTRAP_CSS_SM_FLOAT });
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.col-sm-12')).float), 'premise').toBe('left');
    await page.setViewportSize({ width: 700, height: 800 });
    await frames(page);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.col-sm-12')).float), 'premise').toBe('none');
    await expectSamePlace(page, MEMORABILIA_RISE);
});

test('a list inside .project-detail: the h1 is left where it is, no wrapper', async ({ page }) => {
    await openWithHeadCss(page, 'collection', true);
    const g = await page.evaluate(() => ({
        parent: document.querySelector('h1.mb-sl-h1').parentElement.className,
        wrappers: document.querySelectorAll('.mb-sl-header').length,
    }));
    expect(g.parent).toBe('project-detail');
    expect(g.wrappers).toBe(0);
});
