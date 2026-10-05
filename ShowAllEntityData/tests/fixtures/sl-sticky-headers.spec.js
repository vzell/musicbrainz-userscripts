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

        expect(after.items.filter((it) => !it.marked).map((it) => it.sel), 'not pinned').toEqual([]);
        const moved = after.items
            .map((it, i) => ({ sel: it.sel, from: before.items[i].left, to: it.left }))
            .filter((m) => Math.abs(m.to - m.from) > 1);
        expect(moved, 'elements whose left edge moved while scrolling').toEqual([]);
        const outside = after.items
            .filter((it) => it.left < -1 || it.right > VIEWPORT.width + 1)
            .map((it) => ({ sel: it.sel, left: it.left, right: it.right }));
        expect(outside, 'pinned elements not inside the window').toEqual([]);

        // The table itself scrolls; its container is walked through, not pinned.
        expect(after.tableParentMarked).toBe(false);
        expect(Math.abs(after.thLeft - before.tableLeft), 'Title th docks at the table\'s natural left').toBeLessThanOrEqual(1);
        expect(Math.abs(after.tdLeft - before.tableLeft), 'Title td docks at the table\'s natural left').toBeLessThanOrEqual(1);
    });
}
