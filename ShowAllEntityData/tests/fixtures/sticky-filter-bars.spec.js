'use strict';

// Sticky filter bars (`sa_enable_sticky_filter_bars`, initStickyFilterBars()).
//
// ── What the feature promises ───────────────────────────────────────────────
//
// Scrolled down, the data h2 bar (global filter, row count) stays at the top
// of the window; on a multi-table page the h3 bar of the sub-table in view
// stays right under it — the next sub-table's bar takes its place as it
// arrives — and each table's thead sticks under the bars. Requested
// 2026-10-09: before, only the thead stuck.
//
// ── How it is pinned ────────────────────────────────────────────────────────
//
// GEOMETRY and HIT TESTS, not classes: `position: sticky` with a wrong `top`
// still has every class in place. Each test scrolls far enough that the bar's
// natural place is above the window (the premise is asserted), then reads
// where the bar actually is and what the pointer would hit. The "next h3
// takes over" promise is a hit test on the h3 band (both bars are stuck
// there; only paint order tells them apart). The h3's left gutter mask is a
// box-shadow, invisible to hit testing, so it is checked on painted pixels.
// The stacking promises (a dropdown opened from the stuck h2 is above the
// rows; a hovered content body does not jump over the stuck h2) are hit
// tests at the overlap.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// series-releases: single-table page (12 rows, a table far wider than the
// window, so the sticky page headers engage too).
const SERIES_URL = 'https://musicbrainz.org/series/aa3694d3-a3d0-48ed-8f07-5b576de87908';
const SERIES_SHELL = path.join(__dirname, '..', 'snapshots', 'series-releases', 'raw.html');

// user-ratings: multi-table page, seven small sub-tables with an h3 bar each.
const RATINGS_URL = 'https://musicbrainz.org/user/vzell/ratings';
const RATINGS_SHELL = path.join(__dirname, 'user-ratings-multigroup.html');

// Tall rows (the fixtures have few), and room to scroll past the last table.
// The space under the stuck header block before the h2 (VSB_HEAD_GAP).
const HEAD_GAP = 6;

const TALL_ROWS = 'table.tbl > tbody > tr > td { height: 500px; } #page { padding-bottom: 2000px !important; }';

/**
 * Takes focus and pointer away from the bars once the post-render focus has
 * landed: a bar is raised while it holds focus or is hovered (by design).
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
 * Opens the single-table series fixture and renders it.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} [opts]
 * @param {object} [opts.settingsOverride]
 * @param {string} [opts.css] - injected before the render
 * @param {{width: number, height: number}} [opts.viewport]
 * @returns {Promise<void>}
 */
async function openSeries(page, { settingsOverride = {}, css = TALL_ROWS, viewport = { width: 1200, height: 800 } } = {}) {
    await page.setViewportSize(viewport);
    await loadUserscriptPage(page, { url: SERIES_URL, fixtureFile: SERIES_SHELL, testMode: true, settingsOverride });
    if (css) await page.addStyleTag({ content: css });
    await page.$eval('button[data-label="Show all Releases for Series"]', (b) => b.click());
    await waitForRenderComplete(page, { waitForAutoResize: settingsOverride.sa_auto_resize_columns !== false });
    await settleFocusAndPointer(page);
}

/**
 * Opens the multi-table ratings fixture, renders it and expands every
 * sub-table.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} [settingsOverride]
 * @returns {Promise<void>}
 */
async function openRatings(page, settingsOverride = {}) {
    await page.setViewportSize({ width: 1300, height: 800 });
    await loadUserscriptPage(page, { url: RATINGS_URL, fixtureFile: RATINGS_SHELL, testMode: true, settingsOverride });
    await page.addStyleTag({ content: TALL_ROWS });
    await page.$eval('button[data-label="Show Ratings for User"]', (b) => b.click());
    await waitForRenderComplete(page);
    const anyHidden = () => page.evaluate(() => Array.from(document.querySelectorAll('table.tbl'))
        .some((t) => t.getClientRects().length === 0));
    if (await anyHidden()) await page.locator('.mb-master-toggle').first().click();
    await expect.poll(anyHidden, { message: 'premise: every sub-table expanded' }).toBe(false);
    await settleFocusAndPointer(page);
}

/**
 * Scrolls vertically and waits for the scroll and two frames (the bars'
 * re-measure runs in a frame).
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} y
 * @param {number} [x]
 * @returns {Promise<void>}
 */
async function scrollToY(page, y, x = 0) {
    await page.evaluate(([vx, vy]) => window.scrollTo(vx, vy), [x, y]);
    await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBe(Math.round(y));
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/**
 * Appends a 3,000 px spacer to the parent of the header block (and of the
 * table), so the page can scroll far enough for the block to stick. A
 * sticky element is held inside its parent's content box, so padding would
 * not do.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function addSpacer(page) {
    await page.evaluate(() => {
        const ctl = document.getElementById('mb-show-all-controls-container');
        const h1 = ctl.closest('h1');
        const host = h1.parentElement.matches('#content, #page') ? h1.parentElement : h1.parentElement.parentElement;
        const spacer = document.createElement('div');
        spacer.style.height = '3000px';
        host.appendChild(spacer);
    });
}

/**
 * Reads the bars' and a thead's boxes (viewport coordinates), plus where the
 * data h2 would be without sticking (its document offset minus scrollY).
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} [tableIndex] - which table.tbl's thead
 * @returns {Promise<Object>}
 */
function bars(page, tableIndex = 0) {
    return page.evaluate(([ti, gap]) => {
        const h2 = document.getElementById('mb-global-filter-input').closest('h2');
        const t = document.querySelectorAll('table.tbl')[ti];
        const box = (el) => {
            const r = el.getBoundingClientRect();
            return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height };
        };
        // The stuck header block (h1 with the buttons, the status line), in
        // stacking order; the bars dock under its last part.
        const heads = Array.from(document.querySelectorAll('.mb-vsb-head'))
            .sort((a, b) => Number(a.dataset.mbVsbHead) - Number(b.dataset.mbVsbHead)).map(box);
        return {
            heads,
            // Where the h2 docks: under the block plus its gap (VSB_HEAD_GAP).
            headBottom: heads.length ? heads[heads.length - 1].bottom + gap : 0,
            h2: box(h2),
            h2Class: h2.classList.contains('mb-vsb-h2'),
            thead: box(t.tHead),
            tableTop: t.getBoundingClientRect().top,
            input: box(document.getElementById('mb-global-filter-input')),
        };
    }, [tableIndex, HEAD_GAP]);
}

/**
 * Reads the painted colour of one viewport pixel from a screenshot.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} x
 * @param {number} y
 * @returns {Promise<string>} "r,g,b".
 */
async function pixelAt(page, x, y) {
    const png = await page.screenshot({ clip: { x: Math.round(x), y: Math.round(y), width: 1, height: 1 } });
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

// Both with and without the sticky page headers: when the table overflows
// sideways those make every bar `position: sticky` too (sideways only), which
// would hide a missing rule of this feature.
const SPH_ARMS = [['sticky page headers on', {}], ['sticky page headers off', { sa_enable_sticky_page_headers: false }]];

test.describe('sticky filter bars — single-table page', () => {
    for (const [arm, sph] of SPH_ARMS) {
        test(`the data h2 sticks at the top and the thead under it; the global filter stays usable (${arm})`, async ({ page }) => {
            await openSeries(page, { settingsOverride: sph });
            const natural = await bars(page);
            expect(natural.h2Class, 'the h2 holding the global filter is the stuck one').toBe(true);
            // Scroll the table's top well above the window: the h2's natural
            // place is then far above it too.
            const y = await page.evaluate(() => document.querySelector('table.tbl').getBoundingClientRect().top + window.scrollY + 900);
            await scrollToY(page, y);
            const b = await bars(page);
            expect(b.tableTop, 'premise: the table starts above the window').toBeLessThan(-500);
            expect(Math.abs(b.h2.top - b.headBottom), 'the h2 docks under the header block').toBeLessThanOrEqual(1);
            expect(Math.abs(b.thead.top - b.h2.bottom), 'the thead is right under the h2').toBeLessThanOrEqual(1);
            const hit = await page.evaluate(({ x, yy }) => document.elementFromPoint(x, yy)?.id,
                { x: b.input.left + b.input.height, yy: (b.input.top + b.input.bottom) / 2 });
            expect(hit, 'the global filter input is on top').toBe('mb-global-filter-input');
            // And typing still filters: the bar works where it sticks.
            await page.locator('#mb-global-filter-input').fill('zzzz-no-such-release');
            await expect.poll(() => page.evaluate(() => document.querySelectorAll('table.tbl > tbody > tr')
                .length)).toBe(0);
        });
    }

    test('with the setting off only the thead sticks, at the top', async ({ page }) => {
        await openSeries(page, { settingsOverride: { sa_enable_sticky_filter_bars: false } });
        const y = await page.evaluate(() => document.querySelector('table.tbl').getBoundingClientRect().top + window.scrollY + 900);
        await scrollToY(page, y);
        const b = await bars(page);
        expect(b.h2Class).toBe(false);
        expect(b.h2.bottom, 'the h2 scrolled away').toBeLessThan(0);
        expect(Math.abs(b.thead.top), 'the thead is at the top').toBeLessThanOrEqual(1);
        expect(await page.evaluate(() => document.documentElement.classList.contains('mb-vsb-on'))).toBe(false);
    });

    test('a filter-history dropdown opened from the stuck h2 is above the rows', async ({ page }) => {
        await openSeries(page);
        const y = await page.evaluate(() => document.querySelector('table.tbl').getBoundingClientRect().top + window.scrollY + 900);
        await scrollToY(page, y);
        await page.evaluate(() => {
            const bar = document.getElementById('mb-global-filter-input').closest('h2');
            bar.querySelector('button[title^="Show/hide filter history"]').click();
        });
        const probe = await page.evaluate(() => {
            const bar = document.getElementById('mb-global-filter-input').closest('h2');
            const dd = Array.from(bar.querySelectorAll('*')).find((el) =>
                el.style.position === 'absolute' && el.style.display === 'block' && el.style.zIndex);
            if (!dd) return null;
            const r = dd.getBoundingClientRect();
            const thead = document.querySelector('table.tbl').tHead.getBoundingClientRect();
            const x = r.left + Math.min(20, r.width / 2);
            const yy = Math.max(r.top + 2, thead.bottom + 4);
            const hit = document.elementFromPoint(x, yy);
            return { below: yy > thead.bottom && yy < r.bottom, inside: !!(hit && dd.contains(hit)) };
        });
        expect(probe, 'premise: the dropdown is open').not.toBeNull();
        expect(probe, 'the dropdown reaches below the thead and is hit there').toEqual({ below: true, inside: true });
    });

    test('a hovered pinned body does not paint over the stuck h2', async ({ page }) => {
        // The sticky page headers raise a hovered pinned body (here a CAA
        // big-image strip between the h2 and its table) to z-index 107 so its
        // popups escape; under a stuck h2 that would lift the whole strip
        // over the bar. Capped under the bars while they are on.
        await openSeries(page, { viewport: { width: 900, height: 800 } });
        await page.waitForFunction(() => document.documentElement.classList.contains('mb-sph-on'));
        const passes = await page.evaluate(() => window.__saTest.sphRefreshPasses());
        await page.evaluate(() => {
            const box = document.createElement('div');
            box.className = 'mb-caa-bigbox';
            box.id = 'mb-caa-bigbox-0';
            box.dataset.caaVisible = 'true';
            box.style.cssText = 'display: flex; flex-wrap: wrap; gap: 4px; padding: 4px 0px; min-height: 0px;';
            for (let k = 0; k < 40; k++) {
                const img = document.createElement('div');
                img.style.cssText = 'width: 120px; height: 120px; background: #8a6;';
                box.appendChild(img);
            }
            document.querySelector('table.tbl').before(box);
            window.dispatchEvent(new Event('resize'));
        });
        await expect.poll(() => page.evaluate(() => window.__saTest.sphRefreshPasses())).toBeGreaterThan(passes);
        await expect.poll(() => page.evaluate(() =>
            document.querySelector('.mb-caa-bigbox').classList.contains('mb-sph-target')),
        { message: 'premise: the strip is a pinned body' }).toBe(true);
        // Strip top 100 px above the window: its upper part is under the h2.
        const y = await page.evaluate(() => document.querySelector('.mb-caa-bigbox').getBoundingClientRect().top + window.scrollY + 100);
        await scrollToY(page, y);
        const b = await bars(page);
        expect(Math.abs(b.h2.top - b.headBottom), 'premise: the h2 is stuck').toBeLessThanOrEqual(1);
        await page.mouse.move(b.h2.left + 60, b.h2.bottom + 40);
        const probe = await page.evaluate(({ x, yy }) => {
            const strip = document.querySelector('.mb-caa-bigbox');
            const hit = document.elementFromPoint(x, yy);
            return {
                hovered: strip.matches(':hover'),
                hitH2: !!(hit && hit.closest('h2.mb-vsb-h2')),
                stripZ: getComputedStyle(strip).zIndex,
            };
        }, { x: b.h2.left + 60, yy: (b.h2.top + b.h2.bottom) / 2 });
        expect(probe.hovered, 'premise: the pointer rests on the strip').toBe(true);
        expect(probe, 'the stuck h2 stays on top').toEqual({ hovered: true, hitH2: true, stripZ: '101' });
    });

    test('scrolled sideways too (sticky page headers engaged), the h2 stays at the top and docked', async ({ page }) => {
        // The MB header at a real height (unstyled it is taller than the
        // window and would be ignored as a base anyway): the sticky page
        // headers make it position: sticky, sideways only, and it must not
        // be taken for a vertically stuck one — the stack starts at 0.
        await openSeries(page, {
            viewport: { width: 900, height: 800 },
            css: `${TALL_ROWS} body > div.header { max-height: 60px; overflow: hidden; }`,
        });
        await page.waitForFunction(() => document.documentElement.classList.contains('mb-sph-on'));
        const before = await bars(page);
        const y = await page.evaluate(() => document.querySelector('table.tbl').getBoundingClientRect().top + window.scrollY + 900);
        await scrollToY(page, y, 1500);
        expect(await page.evaluate(() => Math.round(window.scrollX)), 'premise: scrolled sideways').toBeGreaterThan(1000);
        const b = await bars(page);
        expect(Math.abs(b.heads.length ? b.heads[0].top : b.h2.top), 'the stack starts at the top').toBeLessThanOrEqual(1);
        expect(Math.abs(b.h2.top - b.headBottom)).toBeLessThanOrEqual(1);
        expect(Math.abs(b.h2.left - before.h2.left), 'still at its own left').toBeLessThanOrEqual(1);
        expect(Math.abs(b.thead.top - b.h2.bottom)).toBeLessThanOrEqual(1);
    });

    test('under a vertically sticky MB header (userstyle) the bars dock below it', async ({ page }) => {
        // jesus2099's "mb. STICKY HEADER": html > body > div.header sticky at
        // top 0. The bars take its height as their base offset instead of
        // sliding under it.
        await openSeries(page, {
            css: `${TALL_ROWS} html > body > div.header { position: sticky; top: 0; z-index: 1; max-height: 60px; overflow: hidden; background: #eee; }`,
        });
        const y = await page.evaluate(() => document.querySelector('table.tbl').getBoundingClientRect().top + window.scrollY + 900);
        await scrollToY(page, y);
        const hdr = await page.evaluate(() => {
            const r = document.querySelector('body > div.header').getBoundingClientRect();
            return { top: r.top, bottom: r.bottom };
        });
        expect(Math.abs(hdr.top), 'premise: the header is stuck').toBeLessThanOrEqual(1);
        const b = await bars(page);
        expect(b.heads.length, 'premise: the header block is stuck').toBeGreaterThan(0);
        expect(Math.abs(b.heads[0].top - hdr.bottom), 'the header block docks right under the header').toBeLessThanOrEqual(1);
        expect(Math.abs(b.h2.top - b.headBottom), 'the h2 under the header block').toBeLessThanOrEqual(1);
        expect(Math.abs(b.thead.top - b.h2.bottom)).toBeLessThanOrEqual(1);
    });
});

test.describe('sticky filter bars — multi-table page', () => {
    for (const [arm, sph] of SPH_ARMS) {
        test(`h2, the current sub-table's h3 and its thead stack at the top; the next h3 takes over (${arm})`, async ({ page }) => {
            await openRatings(page, sph);
            // Into the first sub-table.
            const t0 = await page.evaluate(() => document.querySelectorAll('table.tbl')[0].tBodies[0].rows[0]
                .getBoundingClientRect().top + window.scrollY);
            await scrollToY(page, t0 + 150);
            const s0 = await page.evaluate(() => {
                const h2 = document.querySelector('h2.mb-vsb-h2').getBoundingClientRect();
                const h3s = Array.from(document.querySelectorAll('h3.mb-toggle-h3'));
                const t = document.querySelectorAll('table.tbl')[0];
                const h3 = h3s[0].getBoundingClientRect();
                const heads = Array.from(document.querySelectorAll('.mb-vsb-head'), (el) => el.getBoundingClientRect().bottom);
                return { h2Top: h2.top, h2Bottom: h2.bottom, h3Top: h3.top, h3Bottom: h3.bottom,
                    theadTop: t.tHead.getBoundingClientRect().top, headBottom: heads.length ? Math.max(...heads) + 6 : 0 };
            });
            expect(Math.abs(s0.h2Top - s0.headBottom), 'h2 under the header block').toBeLessThanOrEqual(1);
            expect(Math.abs(s0.h3Top - s0.h2Bottom), 'h3 right under the h2').toBeLessThanOrEqual(1);
            expect(Math.abs(s0.theadTop - s0.h3Bottom), 'thead right under the h3').toBeLessThanOrEqual(1);

            // Into the third sub-table: its h3 is the one on top of the band.
            const t2 = await page.evaluate(() => document.querySelectorAll('table.tbl')[2].tBodies[0].rows[0]
                .getBoundingClientRect().top + window.scrollY);
            await scrollToY(page, t2 + 150);
            const s2 = await page.evaluate(() => {
                const h3s = Array.from(document.querySelectorAll('h3.mb-toggle-h3'));
                const r = h3s[2].getBoundingClientRect();
                const hit = document.elementFromPoint(r.left + 40, (r.top + r.bottom) / 2);
                const owner = hit && hit.closest('h3.mb-toggle-h3');
                const t = document.querySelectorAll('table.tbl')[2];
                return {
                    ownerIndex: owner ? h3s.indexOf(owner) : -1,
                    h3Top: r.top,
                    theadTop: t.tHead.getBoundingClientRect().top,
                    h3Bottom: r.bottom,
                    // Every passed bar is stuck under it, at the same top.
                    passedTops: h3s.slice(0, 2).map((h) => Math.round(h.getBoundingClientRect().top)),
                    text: h3s[2].textContent.slice(0, 20),
                };
            });
            expect(s2.ownerIndex, `the band shows the third sub-table's bar (${s2.text})`).toBe(2);
            expect(Math.abs(s2.theadTop - s2.h3Bottom)).toBeLessThanOrEqual(1);
            expect(s2.passedTops, 'premise: the passed bars are stuck under it').toEqual([Math.round(s2.h3Top), Math.round(s2.h3Top)]);
        });
    }

    test('the h3\'s indent shows no rows scrolling under it', async ({ page }) => {
        await openRatings(page);
        await page.addStyleTag({ content: 'table.tbl > tbody > tr > td { background: rgb(0, 128, 0) !important; }' });
        const t0 = await page.evaluate(() => document.querySelectorAll('table.tbl')[1].tBodies[0].rows[0]
            .getBoundingClientRect().top + window.scrollY);
        await scrollToY(page, t0 + 150);
        const geo = await page.evaluate(() => {
            const h3 = document.querySelectorAll('h3.mb-toggle-h3')[1].getBoundingClientRect();
            const t = document.querySelectorAll('table.tbl')[1].getBoundingClientRect();
            return { x: h3.left - 2, y: (h3.top + h3.bottom) / 2, gap: h3.left - t.left };
        });
        expect(geo.gap, 'premise: the h3 is indented relative to its table').toBeGreaterThan(2);
        expect(await pixelAt(page, geo.x, geo.y), 'no green row in the gap').not.toBe('0,128,0');
    });

    test('every h3 bar takes the tallest one\'s height, and gives it back', async ({ page }) => {
        // Every passed h3 stays stuck under the current one: a taller one
        // would peek out below a shorter one. All bars share the tallest
        // bar's content height as min-height, measured through a Range so
        // the min-height cannot hold itself up once the tall bar shrinks.
        await openRatings(page);
        const heights = () => page.evaluate(() => Array.from(document.querySelectorAll('h3.mb-toggle-h3'),
            (h) => Math.round(h.getBoundingClientRect().height)));
        const before = await heights();
        expect(new Set(before).size, 'premise: equal bars to start with').toBe(1);
        await page.evaluate(() => {
            const extra = document.createElement('div');
            extra.id = 'mb-test-extra-line';
            extra.textContent = 'a second line';
            document.querySelectorAll('h3.mb-toggle-h3')[0].appendChild(extra);
        });
        await expect.poll(async () => {
            const h = await heights();
            return h[0] > before[0] && new Set(h).size === 1;
        }, { message: 'all bars grow with the tallest' }).toBe(true);
        await page.evaluate(() => document.getElementById('mb-test-extra-line').remove());
        await expect.poll(heights, { message: 'and shrink back' }).toEqual(before);
    });

    test('with the setting off, h3 bars scroll away', async ({ page }) => {
        await openRatings(page, { sa_enable_sticky_filter_bars: false });
        const t2 = await page.evaluate(() => document.querySelectorAll('table.tbl')[2].tBodies[0].rows[0]
            .getBoundingClientRect().top + window.scrollY);
        await scrollToY(page, t2 + 150);
        const top = await page.evaluate(() => document.querySelectorAll('h3.mb-toggle-h3')[2].getBoundingClientRect().bottom);
        expect(top).toBeLessThan(0);
    });
});

test.describe('sticky filter bars — the header block (h1 with the action buttons, the status line)', () => {
    // Requested 2026-10-09, the same day as the bars: the line with the
    // action buttons and the status line stick too, above the data h2 — on
    // an entity page the whole entity header (h1 + p.subheader, where the
    // status line sits), elsewhere the h1 and #mb-status-displays-wrapper.

    test('entity page: the entity header sticks at the top, the h2 under it, the buttons stay usable', async ({ page }) => {
        await openSeries(page);
        const y = await page.evaluate(() => document.querySelector('table.tbl').getBoundingClientRect().top + window.scrollY + 900);
        await scrollToY(page, y);
        const b = await bars(page);
        const head = await page.evaluate(() => {
            const hdr = document.querySelector('#content > .seriesheader');
            const btn = document.querySelector('#mb-show-all-controls-container button');
            const r = btn.getBoundingClientRect();
            const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return {
                stamped: hdr.classList.contains('mb-vsb-head'),
                holdsStatus: hdr.contains(document.getElementById('mb-status-displays-container')),
                top: hdr.getBoundingClientRect().top,
                buttonHit: !!(hit && btn.contains(hit)),
            };
        });
        expect(head.stamped, 'the entity header is the stuck block').toBe(true);
        expect(head.holdsStatus, 'premise: its p.subheader holds the status line').toBe(true);
        expect(b.heads).toHaveLength(1);
        expect(Math.abs(head.top), 'at the top').toBeLessThanOrEqual(1);
        expect(head.buttonHit, 'an action button is on top').toBe(true);
        expect(Math.abs(b.h2.top - b.heads[0].bottom - HEAD_GAP), 'the h2 a gap under it').toBeLessThanOrEqual(1);
    });

    test('report page: the h1 and the status line under it stick, then the h2', async ({ page }) => {
        const url = 'https://musicbrainz.org/report/ASINsWithMultipleReleases';
        const fixtureFile = path.join(__dirname, 'asins-with-multiple-releases.html');
        await page.setViewportSize({ width: 1200, height: 800 });
        await loadUserscriptPage(page, { url, fixtureFile, testMode: true });
        await page.route(`${url}?**`, (route) => route.fulfill({ path: fixtureFile, contentType: 'text/html' }));
        await page.click('button[data-label="Unfiltered"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await settleFocusAndPointer(page);
        // The report's table is short, and a sticky element is held inside
        // its parent's CONTENT box (padding does not count): room to scroll
        // comes from a spacer in that parent, after the table.
        await addSpacer(page);
        const y = await page.evaluate(() => document.querySelector('table.tbl').getBoundingClientRect().top + window.scrollY + 900);
        await scrollToY(page, y);
        const b = await bars(page);
        const kinds = await page.evaluate(() => Array.from(document.querySelectorAll('.mb-vsb-head'))
            .sort((x, z) => Number(x.dataset.mbVsbHead) - Number(z.dataset.mbVsbHead))
            .map((el) => el.id || el.tagName));
        expect(kinds).toEqual(['H1', 'mb-status-displays-wrapper']);
        expect(Math.abs(b.heads[0].top)).toBeLessThanOrEqual(1);
        expect(Math.abs(b.heads[1].top - b.heads[0].bottom), 'the status line right under the h1').toBeLessThanOrEqual(1);
        expect(Math.abs(b.h2.top - b.heads[1].bottom - HEAD_GAP), 'the h2 a gap under the status line').toBeLessThanOrEqual(1);
        // (The report's table is short and has scrolled away with its thead.)
    });

    test('nothing scrolling under the stuck header block shows through it or beside it', async ({ page }) => {
        // Reported 2026-10-09 (artist releases: the tabs ran through the
        // status line; a recording page: rows behind and right of the h1).
        // The block is transparent and narrower than the table, so a
        // window-wide backdrop sits behind it while it is stuck — and only
        // then (in its natural place it would cover MB's sidebar top).
        await openSeries(page, { css: `${TALL_ROWS} table.tbl > tbody > tr > td { background: rgb(0, 128, 0) !important; }` });
        await scrollToY(page, 0);
        expect(await page.evaluate(() => document.getElementById('mb-vsb-mask').classList.contains('mb-vsb-mask-on')),
            'no backdrop in the natural place').toBe(false);
        const y = await page.evaluate(() => document.querySelector('table.tbl').getBoundingClientRect().top + window.scrollY + 900);
        await scrollToY(page, y);
        const b = await bars(page);
        expect(b.heads.length, 'premise: the header block is stuck').toBe(1);
        const vw = page.viewportSize().width;
        const band = (b.heads[0].top + b.heads[0].bottom) / 2;
        // Inside the block's own box near its right end, and right of it.
        for (const x of [Math.min(b.heads[0].right - 5, vw - 30), vw - 5]) {
            expect(await pixelAt(page, x, band), `no row at x=${x}`).not.toBe('0,128,0');
        }
        // The gap under the block, before the h2 (asked for the same day).
        expect(b.h2.top - b.heads[0].bottom, 'a gap under the stats line').toBeGreaterThanOrEqual(HEAD_GAP - 1);
        expect(await pixelAt(page, vw - 5, (b.heads[0].bottom + b.h2.top) / 2), 'no row in the gap').not.toBe('0,128,0');
        expect(await pixelAt(page, vw - 5, b.thead.bottom + 30), 'premise: rows are green below the bars').toBe('0,128,0');
    });

    test('before any button is pressed the header block already sticks', async ({ page }) => {
        await page.setViewportSize({ width: 1200, height: 800 });
        await loadUserscriptPage(page, { url: SERIES_URL, fixtureFile: SERIES_SHELL, testMode: true });
        await addSpacer(page);
        await expect.poll(() => page.evaluate(() => !!document.querySelector('.mb-vsb-head'))).toBe(true);
        // Past the entity header (the fixture's unstyled MB header above it
        // is taller than the window).
        const y = await page.evaluate(() => Math.round(document.querySelector('#content > .seriesheader')
            .getBoundingClientRect().top + window.scrollY + 1000));
        await scrollToY(page, y);
        const top = await page.evaluate(() => document.querySelector('#content > .seriesheader').getBoundingClientRect().top);
        expect(Math.abs(top)).toBeLessThanOrEqual(1);
    });

    test('in a window too small for the whole stack the header block scrolls away', async ({ page }) => {
        await openSeries(page, { viewport: { width: 1200, height: 220 } });
        const y = await page.evaluate(() => document.querySelector('table.tbl').getBoundingClientRect().top + window.scrollY + 900);
        await scrollToY(page, y);
        const b = await bars(page);
        expect(b.heads, 'nothing stamped').toEqual([]);
        expect(Math.abs(b.h2.top), 'the h2 at the top').toBeLessThanOrEqual(1);
    });

    test('an open MusicBrainz header menu stays above the sticky entity header', async ({ page }) => {
        // MB's long Editing menu opens down over the entity header right
        // under it. The sticky entity header (z-index 105) would cover it;
        // the header is lifted over it (_vsbLiftChrome()).
        await openSeries(page, { settingsOverride: { sa_enable_sticky_page_headers: false } });
        const geo = await page.evaluate(async () => {
            const li = document.querySelector('body > div.header li.editing');
            const menu = li.querySelector(':scope > ul');
            const ent = document.querySelector('#content > .seriesheader');
            // Out of flow FIRST (unstyled, the submenu is part of the
            // header's height), then the entity header into view: the
            // fixture's unstyled MB header is taller than the window.
            li.style.position = 'relative';
            Object.assign(menu.style, { position: 'absolute', width: '200px', margin: '0', background: '#fff' });
            ent.scrollIntoView({ block: 'center' });
            await new Promise((r) => requestAnimationFrame(() => r()));
            const lr = li.getBoundingClientRect();
            const er0 = ent.getBoundingClientRect();
            menu.style.left = `${er0.left + 10 - lr.left}px`;
            menu.style.top = `${er0.top - 20 - lr.top}px`;
            await new Promise((r) => requestAnimationFrame(() => r()));
            const mr = menu.getBoundingClientRect();
            const er = ent.getBoundingClientRect();
            const x = mr.left + 10;
            const y = (Math.max(mr.top, er.top) + Math.min(mr.bottom, er.bottom)) / 2;
            const hit = document.elementFromPoint(x, y);
            return {
                stuckBlock: ent.classList.contains('mb-vsb-head'),
                overlap: Math.min(mr.bottom, er.bottom) - Math.max(mr.top, er.top),
                hitMenu: !!(hit && menu.contains(hit)),
            };
        });
        expect(geo.stuckBlock, 'premise: the entity header is the sticky block').toBe(true);
        expect(geo.overlap, 'premise: the menu overlaps the entity header').toBeGreaterThan(4);
        expect(geo.hitMenu, 'the menu is on top').toBe(true);
    });
});
