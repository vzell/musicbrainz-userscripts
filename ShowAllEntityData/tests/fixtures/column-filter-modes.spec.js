'use strict';

// Per-column Cc / Rx / Ex switches (`sa_enable_column_filter_modes`, default
// on) — the follow-up org/column-level-checkbox-filtering.org proposes after
// F3–F7, mockup variants A (chips in the cell) and B (one compact button, for
// columns narrower than `sa_column_filter_modes_compact_width`).
//
// The rule these tests hold the code to: with the setting on, every level OWNS
// its switches. The global boxes govern the global query only, a sub-table's
// its text only, and each column's chips that column's typed text and 📊
// selection only. Levels still AND. With the setting off nothing here exists
// and filter-flag-scoping.spec.js pins the old borrowing rule instead.
//
// Network-free. Single-table: the BoDeans artist-releases disk fixture (56
// rows). Multi-table: releasegroup-releases "Tougher Than the Rest" (7 rows in
// 2 sub-tables; sub-table 0 has 6).

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { loadFromDiskFixture } = require('../support/diskFixture');
const { waitForRenderComplete } = require('../support/browser');
const { collectPageErrors, clickMasterToggleAndExpandAll } = require('../support/liveAssertions');
const { columnFilterInput, columnFilterClear, typeGlobalFilter } = require('../support/filterSortAssertions');

const RG = {
    url: 'https://musicbrainz.org/release-group/f83d2211-dd81-4b1e-9a02-e89733891e1c',
    shell: path.join(__dirname, '..', 'snapshots', 'releasegroup-releases', 'raw.html'),
    routeGlob: 'https://musicbrainz.org/release-group/**',
    button: 'button[data-label="Show all Releases for ReleaseGroup"]',
};
const AR = {
    url: 'https://musicbrainz.org/artist/84c38d3a-3400-4c28-b988-90558bb6fae0/releases',
    fixture: path.join(__dirname, 'saved-data', 'artist-releases-bodeans.json.gz'),
    total: 56,
};

/** How long a filter pass may take to land: the debounce plus a render. */
const SETTLE = { timeout: 10000 };

/** Always the three chips, never the compact button — layout cannot interfere. */
const CHIPS = { sa_column_filter_modes_compact_width: 0 };

/**
 * Rows shown in one `table.tbl`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} [i=0]
 * @returns {Promise<number>}
 */
const rowsIn = (page, i = 0) => page.evaluate((idx) => Array.from(
    document.querySelectorAll('table.tbl')[idx].querySelectorAll('tbody tr'))
    .filter((r) => r.style.display !== 'none').length, i);

/**
 * Text of `#mb-filter-status-display`.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string>}
 */
const globalStatus = (page) => page.evaluate(() =>
    (document.getElementById('mb-filter-status-display') || {}).textContent || '');

/**
 * Text of sub-table `i`'s h3 status span.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} i
 * @returns {Promise<string>}
 */
const h3Status = (page, i) => page.evaluate((idx) => {
    const s = document.querySelectorAll('h3.mb-toggle-h3')[idx].querySelector('.mb-filter-status');
    return s ? s.textContent : '';
}, i);

/**
 * Index of the column whose header's `data-col-name` is `name`, in table `t`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 * @param {number} [t=0]
 * @returns {Promise<number>}
 */
const colIdx = (page, name, t = 0) => page.evaluate(({ n, ti }) => Array.from(
    document.querySelectorAll('table.tbl')[ti].querySelector('thead tr:first-child').cells)
    .findIndex((th) => th.dataset.colName === n), { n: name, ti: t });

/**
 * The filter cell (wrapper) of column `i` in table `t`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} i
 * @param {number} [t=0]
 * @returns {import('@playwright/test').Locator}
 */
const cell = (page, i, t = 0) => page.locator('table.tbl').nth(t)
    .locator(`thead .mb-col-filter-wrapper:has(.mb-col-filter-input[data-col-idx="${i}"])`);

/**
 * One chip ('cc' | 'rx' | 'ex') of column `i` in table `t`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} i
 * @param {'cc'|'rx'|'ex'} mode
 * @param {number} [t=0]
 * @returns {import('@playwright/test').Locator}
 */
const chip = (page, i, mode, t = 0) => cell(page, i, t).locator(`.mb-col-mode-chip.mb-col-mode-${mode}`);

/**
 * Types into a column filter with real key events. Clicks the text area near
 * the left edge, as a user does: with the compact threshold forced to 0 a
 * narrow column's chips cover its middle, which is the whole reason the real
 * default is 160 px (see the default-threshold test below).
 *
 * @param {import('@playwright/test').Locator} input
 * @param {string} text
 */
async function typeColumn(input, text) {
    await input.click({ position: { x: 6, y: 6 } });
    await input.pressSequentially(text);
}

/**
 * Loads the BoDeans single-table page from its disk fixture.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object<string, *>} [settings]
 */
async function openBodeans(page, settings = CHIPS) {
    await loadFromDiskFixture(page, { url: AR.url, fixturePath: AR.fixture, testMode: true, settingsOverride: settings });
    await expect.poll(() => rowsIn(page), { timeout: 30000 }).toBe(AR.total);
}

/**
 * Loads the release group, artwork off, every sub-table expanded.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object<string, *>} [settings]
 */
async function openReleaseGroup(page, settings = CHIPS) {
    await loadUserscriptPage(page, {
        url: RG.url, fixtureFile: RG.shell, testMode: true,
        settingsOverride: { sa_enable_caa_pics: false, sa_enable_relationships_column: false, ...settings },
    });
    await page.route(RG.routeGlob, (route) => route.fulfill({ path: RG.shell, contentType: 'text/html' }));
    await page.click(RG.button);
    await waitForRenderComplete(page, { waitForAutoResize: false });
    await clickMasterToggleAndExpandAll(page);
    expect(await rowsIn(page, 0), 'sub-table 0 renders its 6 releases').toBe(6);
}

test.describe('single-table: each column owns its Cc / Rx / Ex (artist-releases)', () => {
    let pageErrors;
    let release;

    test.beforeEach(async ({ page }) => {
        pageErrors = collectPageErrors(page);
        await openBodeans(page);
        release = await colIdx(page, 'Release');
        expect(release).toBe(0);
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('every column filter carries three chips and a compact button', async ({ page }) => {
        const counts = await page.evaluate(() => ({
            inputs: document.querySelectorAll('table.tbl .mb-col-filter-input').length,
            wrappers: document.querySelectorAll('table.tbl .mb-col-filter-wrapper.mb-col-modes').length,
            chips: document.querySelectorAll('table.tbl .mb-col-mode-chip').length,
            buttons: document.querySelectorAll('table.tbl .mb-col-mode-btn').length,
        }));
        expect(counts.inputs).toBeGreaterThan(10);
        expect(counts.wrappers).toBe(counts.inputs);
        expect(counts.chips).toBe(3 * counts.inputs);
        expect(counts.buttons).toBe(counts.inputs);
    });

    test('a column\'s Ex inverts that column; the global Ex no longer does', async ({ page }) => {
        await typeColumn(columnFilterInput(page, release), 'live');
        await expect.poll(() => rowsIn(page), SETTLE).toBe(4);
        // The global Ex with an empty global field: under the old rule it
        // inverted every column filter (52 rows). Now it governs the global
        // query only, and there is none.
        await page.locator('#mb-global-filter-exclude-label').click();
        await expect.poll(() => globalStatus(page), SETTLE).toContain('\'Release\':"live"');
        expect(await rowsIn(page)).toBe(4);
        await page.locator('#mb-global-filter-exclude-label').click();
        await chip(page, release, 'ex').click();
        await expect.poll(() => rowsIn(page), { ...SETTLE, message: 'the column\'s own Ex inverts it' }).toBe(AR.total - 4);
        await expect(chip(page, release, 'ex')).toHaveAttribute('aria-pressed', 'true');
        await expect(cell(page, release)).toHaveClass(/mb-col-modes-ex/);
        await expect.poll(() => globalStatus(page), SETTLE)
            .toMatch(/^✓ Filtered 52 rows in \d+ms \[1 COLUMN FILTER \['Release':\(ex\) "live"\]\]$/);
    });

    test('a column\'s Rx and Cc apply to that column', async ({ page }) => {
        await typeColumn(columnFilterInput(page, release), '^l');
        await expect.poll(() => rowsIn(page), SETTLE).toBe(0);
        await chip(page, release, 'rx').click();
        await expect.poll(() => rowsIn(page), { ...SETTLE, message: '"^l" as a regexp' }).toBe(7);
        await columnFilterClear(page, release).click();
        await expect.poll(() => rowsIn(page), SETTLE).toBe(AR.total);
        await typeColumn(columnFilterInput(page, release), 'live');
        await expect.poll(() => rowsIn(page), SETTLE).toBe(4);
        await chip(page, release, 'cc').click();
        await expect.poll(() => rowsIn(page), { ...SETTLE, message: 'case-sensitive: "live" is not "Live"' }).toBe(0);
    });

    test('two columns, one excluded: CDs that are not live releases', async ({ page }) => {
        const format = await colIdx(page, 'Format');
        await typeColumn(columnFilterInput(page, format), 'CD');
        await expect.poll(() => rowsIn(page), SETTLE).toBeLessThan(AR.total);
        const cds = await rowsIn(page);
        await typeColumn(columnFilterInput(page, release), 'live');
        await expect.poll(() => rowsIn(page), SETTLE).toBeLessThan(cds);
        const liveCds = await rowsIn(page);
        await chip(page, release, 'ex').click();
        await expect.poll(() => rowsIn(page), { ...SETTLE, message: 'CDs minus live CDs' }).toBe(cds - liveCds);
        // Only Release is inverted: Format keeps matching "CD".
        await expect(chip(page, format, 'ex')).toHaveAttribute('aria-pressed', 'false');
    });

    test('a global Ex no longer inverts a column filter: no Slash, but CDs', async ({ page }) => {
        const format = await colIdx(page, 'Format');
        await typeColumn(columnFilterInput(page, format), 'CD');
        await expect.poll(() => rowsIn(page), SETTLE).toBeLessThan(AR.total);
        const cds = await rowsIn(page);
        await typeGlobalFilter(page, 'Slash');
        await expect.poll(() => globalStatus(page), SETTLE).toContain('GLOBAL:"Slash"');
        const slashCds = await rowsIn(page);
        await page.locator('#mb-global-filter-exclude-label').click();
        await expect.poll(() => rowsIn(page), { ...SETTLE, message: 'CDs not on Slash' }).toBe(cds - slashCds);
        await expect.poll(() => globalStatus(page), SETTLE).toContain('[GLOBAL:(ex) "Slash", 1 COLUMN FILTER [\'Format\':"CD"]]');
    });

    test('Ctrl+Click on a global box also sets that mode on every column filter', async ({ page }) => {
        await page.locator('#mb-global-filter-rx-label').click({ modifiers: ['Control'] });
        await expect(page.locator('#mb-global-filter-rx-checkbox')).toBeChecked();
        const pressed = await page.evaluate(() => Array.from(document.querySelectorAll(
            'table.tbl .mb-col-mode-chip.mb-col-mode-rx')).map((c) => c.getAttribute('aria-pressed')));
        expect(pressed.length).toBeGreaterThan(10);
        expect(new Set(pressed)).toEqual(new Set(['true']));
        await typeColumn(columnFilterInput(page, release), '^l');
        await expect.poll(() => rowsIn(page), { ...SETTLE, message: 'the column got Rx from the bulk click' }).toBe(7);
        // A plain click on the same box touches the global query only.
        await page.locator('#mb-global-filter-rx-label').click();
        await expect(chip(page, release, 'rx')).toHaveAttribute('aria-pressed', 'true');
    });

    test('the column ✕ clears its switches along with its text', async ({ page }) => {
        await typeColumn(columnFilterInput(page, release), 'live');
        await chip(page, release, 'ex').click();
        await expect.poll(() => rowsIn(page), SETTLE).toBe(AR.total - 4);
        await columnFilterClear(page, release).click();
        await expect.poll(() => rowsIn(page), SETTLE).toBe(AR.total);
        await expect(chip(page, release, 'ex')).toHaveAttribute('aria-pressed', 'false');
        await expect(cell(page, release)).not.toHaveClass(/mb-col-modes-ex/);
        // And the next text typed is matched plainly again.
        await typeColumn(columnFilterInput(page, release), 'live');
        await expect.poll(() => rowsIn(page), SETTLE).toBe(4);
    });

    test('clicking a chip leaves the caret in the filter field', async ({ page }) => {
        const input = columnFilterInput(page, release);
        await typeColumn(input, 'liv');
        await chip(page, release, 'cc').click();
        await expect(input).toBeFocused();
        await input.pressSequentially('e');
        await expect.poll(() => globalStatus(page), SETTLE).toContain('\'Release\':(case) "live"');
    });

    test('a 📊 selection follows the column\'s own Ex, and the panel says so', async ({ page }) => {
        const format = await colIdx(page, 'Format');
        const exactCd = await page.evaluate((i) => Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((r) => r.cells[i].innerText.trim() === 'CD').length, format);
        expect(exactCd).toBeGreaterThan(0);
        const open = async () => {
            await page.evaluate((i) => document.querySelector('table.tbl thead tr:first-child')
                .cells[i].querySelector('.mb-col-uniq-wrap').click(), format);
            await page.waitForSelector('#mb-col-uniq-dropdown');
        };
        await open();
        await expect(page.locator('#mb-col-uniq-dropdown .mb-uniq-ex-banner')).toHaveCount(0);
        await page.keyboard.press('Escape');
        await chip(page, format, 'ex').click();
        await open();
        await expect(page.locator('#mb-col-uniq-dropdown .mb-uniq-ex-banner')).toHaveCount(1);
        // A regular entry reads "☐(37)CD": box glyph, count badge, value. The
        // value must be exactly "CD" — not "2×CD", not "» type: CD".
        await page.locator('#mb-col-uniq-dropdown .mb-col-uniq-item')
            .filter({ hasText: /^\s*☐?\s*\(\d+\)\s*CD\s*$/ }).first().click();
        await expect.poll(() => rowsIn(page), { ...SETTLE, message: 'the ticked value is hidden' }).toBe(AR.total - exactCd);
    });

    // Logged in, a single-table page's table.tbl stays inside MusicBrainz's
    // merge <form> (div.list-merge-buttons-row-container). The navigation
    // guard's merge-form arm used to match EVERY <button> in that form, so a
    // chip click raised "You are about to leave this page" — and Playwright
    // auto-dismisses confirm(), which swallowed the click silently. The disk
    // fixture's shell has no such form, so this test builds one around the
    // table, the way the live page has it.
    test('inside the merge form a chip raises no leave-page prompt; a submit button still does', async ({ page }) => {
        await page.evaluate(() => {
            const table = document.querySelector('table.tbl');
            const form = document.createElement('form');
            form.action = '/release/merge_queue';
            form.method = 'post';
            const row = document.createElement('div');
            row.className = 'list-merge-buttons-row-container';
            const submit = document.createElement('button');
            submit.type = 'submit';
            submit.id = 'test-merge-submit';
            submit.textContent = 'Add selected releases for merging';
            row.appendChild(submit);
            table.before(form);
            form.append(table, row);
        });
        const dialogs = [];
        page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });

        await typeColumn(columnFilterInput(page, release), 'live');
        await expect.poll(() => rowsIn(page), SETTLE).toBe(4);
        await chip(page, release, 'cc').click();
        await expect(chip(page, release, 'cc')).toHaveAttribute('aria-pressed', 'true');
        await expect.poll(() => rowsIn(page), { ...SETTLE, message: 'the Cc click took effect' }).toBe(0);
        // The compact button is hidden under CHIPS; a DOM click still runs
        // every document-level click listener, the guard included.
        await page.evaluate((i) => document.querySelector(
            `table.tbl thead .mb-col-filter-input[data-col-idx="${i}"]`)
            .closest('.mb-col-filter-wrapper').querySelector('.mb-col-mode-btn').click(), release);
        await expect(page.locator('#mb-col-mode-pop')).toBeVisible();
        expect(dialogs, 'no type="button" control may raise the leave-page prompt').toEqual([]);

        // The guard is narrowed, not gone: a real merge submit still asks.
        await page.locator('#test-merge-submit').click();
        await expect.poll(() => dialogs.length, SETTLE).toBe(1);
        expect(dialogs[0]).toContain('You are about to leave this page');
        expect(await rowsIn(page), 'dismissed: still on the page').toBe(0);
    });
});

test.describe('multi-table: each column owns its Cc / Rx / Ex (releasegroup-releases)', () => {
    let pageErrors;

    test.beforeEach(async ({ page }) => {
        pageErrors = collectPageErrors(page);
        await openReleaseGroup(page);
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('the sub-table Rx no longer governs a column filter; the column\'s Rx does', async ({ page }) => {
        await typeColumn(columnFilterInput(page, 0, { tableIndex: 0 }), '^Tun');
        await expect.poll(() => rowsIn(page, 0), SETTLE).toBe(0);
        await page.locator('.mb-subtable-filter-toggle-icon').nth(0).click();
        await page.locator('h3.mb-toggle-h3').nth(0).locator('label[id$="-rx-label"]').click();
        // Give a wrong pass every chance to land before asserting nothing changed.
        await page.waitForTimeout(1500);
        expect(await rowsIn(page, 0)).toBe(0);
        await chip(page, 0, 'rx', 0).click();
        await expect.poll(() => rowsIn(page, 0), SETTLE).toBe(1);
        await expect.poll(() => h3Status(page, 0), SETTLE)
            .toBe('✓ Filtered 1 row [1 COLUMN FILTER [\'Release\':(rx) "^Tun"]]');
    });

    test('a column\'s switch survives the re-render a global filter causes', async ({ page }) => {
        await typeColumn(columnFilterInput(page, 0, { tableIndex: 0 }), 'tunnel');
        await chip(page, 0, 'ex', 0).click();
        await expect.poll(() => rowsIn(page, 0), SETTLE).toBe(5);
        await typeGlobalFilter(page, 'Tougher');
        await expect.poll(() => globalStatus(page), SETTLE).toContain('GLOBAL:"Tougher"');
        await expect(chip(page, 0, 'ex', 0)).toHaveAttribute('aria-pressed', 'true');
        await expect.poll(() => rowsIn(page, 0), { ...SETTLE, message: '"Tougher" AND not "tunnel"' }).toBe(5);
    });

    test('Ctrl+Click on a sub-table box sets that sub-table\'s columns only', async ({ page }) => {
        await page.locator('.mb-subtable-filter-toggle-icon').nth(0).click();
        await page.locator('h3.mb-toggle-h3').nth(0).locator('label[id$="-ex-label"]')
            .click({ modifiers: ['Control'] });
        const state = await page.evaluate(() => Array.from(document.querySelectorAll('table.tbl')).slice(0, 2)
            .map((t) => Array.from(t.querySelectorAll('.mb-col-mode-chip.mb-col-mode-ex'))
                .map((c) => c.getAttribute('aria-pressed'))));
        expect(new Set(state[0]), 'sub-table 0: every column').toEqual(new Set(['true']));
        expect(new Set(state[1]), 'sub-table 1: untouched').toEqual(new Set(['false']));
    });
});

test.describe('compact mode: one mode button below the width threshold', () => {
    let pageErrors;

    test.beforeEach(({ page }) => { pageErrors = collectPageErrors(page); });
    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('at the default threshold each cell shows chips or the button, by its own width', async ({ page }) => {
        await openBodeans(page, {});
        const cells = await page.evaluate(() => Array.from(document.querySelectorAll('table.tbl .mb-col-filter-wrapper.mb-col-modes'))
            .filter((w) => w.offsetParent !== null)
            .map((w) => {
                const inp = w.querySelector('.mb-col-filter-input');
                inp.scrollIntoView({ block: 'nearest', inline: 'center' });
                const r = inp.getBoundingClientRect();
                const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
                return {
                    width: w.getBoundingClientRect().width,
                    chips: getComputedStyle(w.querySelector('.mb-col-mode-chips')).display !== 'none',
                    btn: getComputedStyle(w.querySelector('.mb-col-mode-btn')).display !== 'none',
                    centreIsField: hit === inp,
                };
            }));
        expect(cells.length).toBeGreaterThan(10);
        expect(cells.some((c) => c.btn), 'this page has narrow columns').toBe(true);
        expect(cells.some((c) => c.chips), 'and wide ones').toBe(true);
        for (const c of cells) {
            expect(c.chips !== c.btn, `exactly one form shows at ${c.width}px`).toBe(true);
            expect(c.btn, `button iff width <= 160 (width ${c.width}px)`).toBe(c.width <= 160);
            // The guarantee the 160 default exists for: clicking the middle of
            // a field that shows chips lands in the field, not on a chip.
            if (c.chips) expect(c.centreIsField, `middle of a ${c.width}px field is the field`).toBe(true);
        }
    });

    test('the button opens the switches in a pop-up, and its Ex inverts the column', async ({ page }) => {
        await openBodeans(page, { sa_column_filter_modes_compact_width: 5000 });
        const btn = cell(page, 0).locator('.mb-col-mode-btn');
        await expect(btn).toBeVisible();
        await expect(cell(page, 0).locator('.mb-col-mode-chips')).toBeHidden();
        await typeColumn(columnFilterInput(page, 0), 'live');
        await expect.poll(() => rowsIn(page), SETTLE).toBe(4);
        await btn.click();
        const pop = page.locator('#mb-col-mode-pop');
        await expect(pop).toBeVisible();
        await expect(pop).toContainText('"Release" filter');
        await pop.locator('input[data-mb-mode="ex"]').check();
        await expect.poll(() => rowsIn(page), SETTLE).toBe(AR.total - 4);
        await expect(btn).toHaveText('E');
        await expect(btn).toHaveClass(/mb-col-mode-has-ex/);
        await page.keyboard.press('Escape');
        await expect(pop).toBeHidden();
    });

    test('"Apply these modes to every column" copies them across the table', async ({ page }) => {
        await openBodeans(page, { sa_column_filter_modes_compact_width: 5000 });
        await cell(page, 0).locator('.mb-col-mode-btn').click();
        const pop = page.locator('#mb-col-mode-pop');
        await pop.locator('input[data-mb-mode="rx"]').check();
        await pop.locator('input[data-mb-mode="cc"]').check();
        await pop.locator('.mb-col-mode-pop-all').click();
        const labels = await page.evaluate(() => Array.from(document.querySelectorAll('table.tbl .mb-col-mode-btn'))
            .map((b) => b.textContent));
        expect(new Set(labels)).toEqual(new Set(['C·R']));
    });

    test('threshold 0 always shows the chips', async ({ page }) => {
        await openBodeans(page, { sa_column_filter_modes_compact_width: 0 });
        const shown = await page.evaluate(() => {
            const cells = Array.from(document.querySelectorAll('table.tbl .mb-col-filter-wrapper'))
                .filter((w) => w.offsetParent !== null);
            const visible = (el) => !!el && getComputedStyle(el).display !== 'none';
            return {
                cells: cells.length,
                withChips: cells.filter((w) => visible(w.querySelector('.mb-col-mode-chips'))).length,
                withButton: cells.filter((w) => visible(w.querySelector('.mb-col-mode-btn'))).length,
            };
        });
        expect(shown.cells).toBeGreaterThan(10);
        // Every cell, the narrow ones included — not merely "no button".
        expect(shown.withChips).toBe(shown.cells);
        expect(shown.withButton).toBe(0);
    });
});

test.describe('the setting', () => {
    test('off: no switches, and the global boxes govern the column filters again', async ({ page }) => {
        const pageErrors = collectPageErrors(page);
        await openBodeans(page, { sa_enable_column_filter_modes: false });
        expect(await page.locator('table.tbl .mb-col-mode-chip, table.tbl .mb-col-mode-btn').count()).toBe(0);
        expect(await page.locator('table.tbl .mb-col-filter-wrapper.mb-col-modes').count()).toBe(0);
        await typeColumn(columnFilterInput(page, 0), 'live');
        await expect.poll(() => rowsIn(page), SETTLE).toBe(4);
        await page.locator('#mb-global-filter-exclude-label').click();
        await expect.poll(() => rowsIn(page), SETTLE).toBe(AR.total - 4);
        expect(pageErrors).toEqual([]);
    });

    test('on or off, the switches never change a column\'s width', async ({ page, browser }) => {
        const widths = async (p) => {
            let last = null;
            for (let k = 0; k < 20; k++) {
                const w = await p.evaluate(() => Array.from(document.querySelector('table.tbl thead tr:first-child').cells)
                    .map((th) => Math.round(th.getBoundingClientRect().width)));
                if (last && JSON.stringify(w) === JSON.stringify(last)) return w;
                last = w;
                await p.waitForTimeout(250);
            }
            return last;
        };
        await openBodeans(page, {});
        const on = await widths(page);
        const other = await browser.newPage();
        try {
            await openBodeans(other, { sa_enable_column_filter_modes: false });
            const off = await widths(other);
            expect(on).toEqual(off);
        } finally {
            await other.close();
        }
    });
});
