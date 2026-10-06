'use strict';

// Cc / Rx / Ex scoping across the global, sub-table and column filter levels —
// findings F3–F7 of org/column-level-checkbox-filtering.org (analysis of
// 2026-09-28). Every test here failed against 9.99.1173 except the two titled
// "guard:", which pin behaviour the fixes must NOT change and passed before
// too. The mutation list scripts/mutations/filter-flag-scoping.json plants
// each defect back one at a time.
//
// The rule these tests hold the code to (_resolveColFilterFlags()):
//   - multi-table: a sub-table's own boxes (its 🔍 panel) govern its text AND
//     every column filter of that sub-table, also while the panel is closed;
//     the global boxes govern the global query only.
//   - single-table: no 🔍 panel, so the global boxes govern the global query
//     AND every column filter.
// That rule is what `sa_enable_column_filter_modes: false` keeps (every page
// here seeds it off; see LEGACY). What these tests pin is that the code
// applies it consistently and SAYS so:
//   F3  ticking a sub-table box re-runs the column filters it governs;
//   F4  both writers of a sub-table's status line agree (global flags, count);
//   F5  cover-art image rows highlight the global query with the GLOBAL flags;
//   F6  a plain global query matches inside one cell, like a regexp one does;
//   F7  status lines show each part's modifiers and the query as typed.
//
// Network-free. Multi-table: releasegroup-releases "Tougher Than the Rest"
// (7 rows, 2 sub-tables; sub-table 0 has 6). Single-table: the BoDeans
// artist-releases disk fixture (56 rows).

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { loadFromDiskFixture } = require('../support/diskFixture');
const { waitForRenderComplete } = require('../support/browser');
const { collectPageErrors, clickMasterToggleAndExpandAll } = require('../support/liveAssertions');
const { columnFilterInput, typeGlobalFilter } = require('../support/filterSortAssertions');

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

/**
 * Every page here runs with column modes OFF: this spec pins the BORROWING
 * rule (column filters follow the global / sub-table boxes), which is what
 * `sa_enable_column_filter_modes: false` keeps. The per-column switches that
 * replace it by default are column-filter-modes.spec.js's subject.
 */
const LEGACY = { sa_enable_column_filter_modes: false };

/**
 * Rows shown in one `table.tbl`. runFilter() removes rows, the sub-table
 * filter hides them with display:none; both count as not shown.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} i
 * @returns {Promise<number>}
 */
const rowsIn = (page, i) => page.evaluate((idx) => Array.from(
    document.querySelectorAll('table.tbl')[idx].querySelectorAll('tbody tr'))
    .filter((r) => r.style.display !== 'none').length, i);

/**
 * Text of sub-table `i`'s h3 `.mb-filter-status` span.
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
 * Text of the page's `#mb-filter-status-display`.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string>}
 */
const globalStatus = (page) => page.evaluate(() =>
    (document.getElementById('mb-filter-status-display') || {}).textContent || '');

/**
 * Types into a column filter with real key events (the inputs are
 * readonly until a genuine interaction and reject fill()).
 *
 * @param {import('@playwright/test').Locator} input
 * @param {string} text
 */
async function typeColumn(input, text) {
    await input.click();
    await input.pressSequentially(text);
}

/**
 * Opens sub-table `i`'s 🔍 panel if it is closed.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} i
 */
async function openSubTablePanel(page, i) {
    const panel = page.locator('h3.mb-toggle-h3').nth(i).locator('.mb-subtable-filter-container');
    if (!await panel.isVisible()) await page.locator('.mb-subtable-filter-toggle-icon').nth(i).click();
    await expect(panel).toBeVisible();
}

/**
 * The label of one of sub-table `i`'s boxes: 'case', 'rx' or 'ex'.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} i
 * @param {'case'|'rx'|'ex'} kind
 * @returns {import('@playwright/test').Locator}
 */
const subTableBox = (page, i, kind) =>
    page.locator('h3.mb-toggle-h3').nth(i).locator(`label[id$="-${kind}-label"]`);

/**
 * Sub-table `i`'s filter text input.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} i
 * @returns {import('@playwright/test').Locator}
 */
const subTableInput = (page, i) =>
    page.locator('h3.mb-toggle-h3').nth(i).locator('.mb-subtable-filter-container input[type="search"]');

/**
 * Loads the release group with artwork off and every sub-table expanded.
 *
 * @param {import('@playwright/test').Page} page
 */
async function openReleaseGroup(page) {
    await loadUserscriptPage(page, {
        url: RG.url, fixtureFile: RG.shell, testMode: true,
        settingsOverride: { ...LEGACY, sa_enable_caa_pics: false, sa_enable_relationships_column: false },
    });
    await page.route(RG.routeGlob, (route) => route.fulfill({ path: RG.shell, contentType: 'text/html' }));
    await page.click(RG.button);
    await waitForRenderComplete(page, { waitForAutoResize: false });
    await clickMasterToggleAndExpandAll(page);
    expect(await rowsIn(page, 0), 'sub-table 0 renders its 6 releases').toBe(6);
}

test.describe('multi-table: Cc/Rx/Ex scoping (releasegroup-releases)', () => {
    let pageErrors;

    test.beforeEach(async ({ page }) => {
        pageErrors = collectPageErrors(page);
        await openReleaseGroup(page);
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('F3: ticking a sub-table Rx re-runs the column filter it governs', async ({ page }) => {
        await typeColumn(columnFilterInput(page, 0, { tableIndex: 0 }), '^Tun');
        await expect.poll(() => rowsIn(page, 0), { ...SETTLE, message: 'a literal "^Tun" matches nothing' }).toBe(0);
        await openSubTablePanel(page, 0);
        await subTableBox(page, 0, 'rx').click();
        // No keystroke after the tick: the change alone must re-run the filter.
        await expect.poll(() => rowsIn(page, 0), { ...SETTLE, message: '"^Tun" as a regexp matches one release' }).toBe(1);
    });

    test('F3: ticking a sub-table Ex re-runs the column filter it governs', async ({ page }) => {
        await typeColumn(columnFilterInput(page, 0, { tableIndex: 0 }), 'tunnel');
        await expect.poll(() => rowsIn(page, 0), SETTLE).toBe(1);
        await openSubTablePanel(page, 0);
        await subTableBox(page, 0, 'ex').click();
        await expect.poll(() => rowsIn(page, 0), { ...SETTLE, message: 'the column filter is inverted' }).toBe(5);
    });

    test('guard: F3 — without a column filter, a sub-table box still re-applies the sub-table text', async ({ page }) => {
        // The cheap branch of applySubTableModes(): no column filter, so only
        // applySubFilter() runs. It must still honour the new box.
        await openSubTablePanel(page, 0);
        await subTableInput(page, 0).click();
        await subTableInput(page, 0).pressSequentially('tunnel');
        await expect.poll(() => rowsIn(page, 0), SETTLE).toBe(1);
        await subTableBox(page, 0, 'ex').click();
        await expect.poll(() => rowsIn(page, 0), { ...SETTLE, message: 'the sub-table text is inverted' }).toBe(5);
    });

    test('F4: the sub-table status labels the global query with the GLOBAL boxes', async ({ page }) => {
        await typeGlobalFilter(page, 'e');
        // Let the global pass land first, so the sub-table change below is the
        // LAST writer of the h3 span — the writer this test is about.
        await expect.poll(() => globalStatus(page), SETTLE).toContain('GLOBAL:');
        await openSubTablePanel(page, 0);
        await subTableBox(page, 0, 'case').click();
        await subTableInput(page, 0).click();
        await subTableInput(page, 0).pressSequentially('e');
        // applySubFilter() writes the span last here (a sub-table-only change).
        await expect.poll(() => h3Status(page, 0), SETTLE).toContain('SUB-TABLE:(case) "e"');
        const status = await h3Status(page, 0);
        expect(status, 'global Cc is off').toContain('GLOBAL:"e"');
        expect(status).not.toContain('GLOBAL:(case)');
    });

    test('F4: the sub-table status shows the global Ex', async ({ page }) => {
        await page.locator('#mb-global-filter-exclude-label').click();
        // A global query no row contains: under Ex, every row stays.
        await typeGlobalFilter(page, 'zzqq');
        await expect.poll(() => globalStatus(page), SETTLE).toContain('GLOBAL:');
        expect(await rowsIn(page, 0)).toBe(6);
        await openSubTablePanel(page, 0);
        await subTableInput(page, 0).click();
        await subTableInput(page, 0).pressSequentially('tunnel');
        await expect.poll(() => h3Status(page, 0), SETTLE).toContain('SUB-TABLE:"tunnel"');
        expect(await h3Status(page, 0)).toContain('GLOBAL:(ex) "zzqq"');
    });

    test('F4: a runFilter() pass keeps the row count the sub-table filter left', async ({ page }) => {
        await openSubTablePanel(page, 0);
        await subTableInput(page, 0).click();
        await subTableInput(page, 0).pressSequentially('tunnel');
        await expect.poll(() => h3Status(page, 0), SETTLE).toBe('✓ Filtered 1 row [SUB-TABLE:"tunnel"]');
        // Any global box change runs runFilter(), which rewrites the span after
        // its render. It used to count the rows BEFORE the sub-table filter.
        await page.locator('#mb-global-filter-case-label').click();
        await page.locator('#mb-global-filter-case-label').click();
        await expect.poll(() => rowsIn(page, 0), SETTLE).toBe(1);
        await expect.poll(() => h3Status(page, 0), SETTLE).toBe('✓ Filtered 1 row [SUB-TABLE:"tunnel"]');
    });

    test('F7: the sub-table status shows the modifiers that govern a column filter', async ({ page }) => {
        await typeColumn(columnFilterInput(page, 0, { tableIndex: 0 }), '^Tun');
        await openSubTablePanel(page, 0);
        await subTableBox(page, 0, 'rx').click();
        await expect.poll(() => rowsIn(page, 0), SETTLE).toBe(1);
        // Close the panel: its Rx stays ticked and keeps governing the column.
        await page.locator('.mb-subtable-filter-toggle-icon').nth(0).click();
        await expect(page.locator('h3.mb-toggle-h3').nth(0).locator('.mb-subtable-filter-container')).toBeHidden();
        await expect.poll(() => h3Status(page, 0), SETTLE)
            .toBe('✓ Filtered 1 row [1 COLUMN FILTER [\'Release\':(rx) "^Tun"]]');
    });

    test('F7: both status lines show the global query as typed, not lower-cased', async ({ page }) => {
        await typeGlobalFilter(page, 'Tougher');
        await expect.poll(() => globalStatus(page), SETTLE).toBe('✓ Global filter [GLOBAL:"Tougher"]');
        expect(await h3Status(page, 0)).toBe('✓ Filtered 6 rows [GLOBAL:"Tougher"]');
    });

    test('F6: a plain global query does not match across two cells', async ({ page }) => {
        // Last word of the first row's Release cell + first word of its Artist
        // cell: "Rest Bruce". It used to match all 6 rows as plain text (with
        // nothing highlighted) and none as a regexp.
        const query = await page.evaluate(() => {
            const r = document.querySelectorAll('table.tbl')[0].querySelector('tbody tr');
            return `${r.cells[0].innerText.trim().split(/\s+/).pop()} ${r.cells[1].innerText.trim().split(/\s+/)[0]}`;
        });
        expect(query).toBe('Rest Bruce');
        await typeGlobalFilter(page, query);
        await expect.poll(() => rowsIn(page, 0), { ...SETTLE, message: 'no single cell contains the query' }).toBe(0);
    });

    test('guard: F6 — a plain global query still matches across two text nodes of ONE cell', async ({ page }) => {
        // The other half: separating cells must not separate the text nodes
        // INSIDE one cell, which getCleanVisibleText() joins with spaces. The
        // query is the last word of one visible text node plus the first word
        // of the next one in the same cell, taken from the rendered table so
        // it cannot silently stop spanning two nodes. innerText must show the
        // pair with one space between, which also rules out hidden text.
        const query = await page.evaluate(() => {
            const rows = document.querySelectorAll('table.tbl')[0].querySelectorAll('tbody tr');
            for (const r of rows) {
                for (const cell of r.cells) {
                    const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
                    const texts = [];
                    let n;
                    while ((n = walker.nextNode())) {
                        const t = n.nodeValue.trim();
                        if (/\w/.test(t)) texts.push(t);
                    }
                    for (let k = 0; k + 1 < texts.length; k++) {
                        const q = `${texts[k].split(/\s+/).pop()} ${texts[k + 1].split(/\s+/)[0]}`;
                        // MusicBrainz separates a name from its comment with a
                        // no-break space; the filter text folds it to a space.
                        const shown = cell.innerText.replace(/\s+/g, ' ');
                        if (/^\S*\w\S* \S*\w\S*$/.test(q) && shown.includes(q)) return q;
                    }
                }
            }
            return null;
        });
        // On this fixture: the Label cell's name and its disambiguation comment,
        // "CBS/Sony (imprint".
        expect(query, 'some cell shows two adjacent text nodes as "word word"').not.toBeNull();
        // Lower case, so the status text reads the same before and after the
        // F7 "show the query as typed" change — this test is about F6 only.
        const typed = query.toLowerCase();
        await typeGlobalFilter(page, typed);
        await expect.poll(() => globalStatus(page), SETTLE).toContain(`GLOBAL:"${typed}"`);
        await expect.poll(() => rowsIn(page, 0), { ...SETTLE, message: `"${typed}" still matches` }).toBeGreaterThan(0);
    });
});

test.describe('single-table: Cc/Rx/Ex scoping (artist-releases)', () => {
    let pageErrors;

    test.beforeEach(async ({ page }) => {
        pageErrors = collectPageErrors(page);
        await loadFromDiskFixture(page, { url: AR.url, fixturePath: AR.fixture, testMode: true, settingsOverride: LEGACY });
        await expect.poll(() => rowsIn(page, 0), { timeout: 30000 }).toBe(AR.total);
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('F7: the status line says when the global Ex inverts a column filter', async ({ page }) => {
        await typeColumn(columnFilterInput(page, 0), 'live');
        await expect.poll(() => rowsIn(page, 0), SETTLE).toBe(4);
        await page.locator('#mb-global-filter-exclude-label').click();
        // The single-table rule itself is unchanged: the global Ex governs the
        // column filter too. The status line now says so.
        await expect.poll(() => rowsIn(page, 0), SETTLE).toBe(AR.total - 4);
        await expect.poll(() => globalStatus(page), SETTLE)
            .toMatch(/^✓ Filtered 52 rows in \d+ms \[1 COLUMN FILTER \['Release':\(ex\) "live"\]\]$/);
    });

    test('F7: the status line shows the global query as typed, with its modifiers', async ({ page }) => {
        await typeGlobalFilter(page, 'BoDeans');
        await expect.poll(() => globalStatus(page), SETTLE)
            .toMatch(/^✓ Filtered \d+ rows in \d+ms \[GLOBAL:"BoDeans"\]$/);
        await page.locator('#mb-global-filter-case-label').click();
        await expect.poll(() => globalStatus(page), SETTLE)
            .toMatch(/^✓ Filtered \d+ rows in \d+ms \[GLOBAL:\(case\) "BoDeans"\]$/);
    });

    test('status: a column is named without its header controls', async ({ page }) => {
        // The Barcode header carries a ▌█ toggle. The status line used to strip
        // a fixed list of glyphs from the header's textContent, which missed
        // it, and printed 'Barcode' as '▌█Barcode'.
        const barcodeIdx = await page.evaluate(() => Array.from(
            document.querySelector('table.tbl thead tr:first-child').cells)
            .findIndex((th) => th.dataset.colName === 'Barcode'));
        expect(barcodeIdx, 'the Barcode column exists').toBeGreaterThan(-1);
        const glyphs = await page.evaluate((i) => document.querySelector('table.tbl thead tr:first-child')
            .cells[i].textContent.replace(/Barcode|[⇅▲▼📊0-9\s]/gu, ''), barcodeIdx);
        expect(glyphs, 'the header really carries text besides its name').not.toBe('');
        await typeColumn(columnFilterInput(page, barcodeIdx), '[none]');
        await expect.poll(() => globalStatus(page), SETTLE)
            .toMatch(/^✓ Filtered \d+ rows? in \d+ms \[1 COLUMN FILTER \['Barcode':"\[none\]"\]\]$/);
    });

    test('F6: a plain global query does not match across two cells', async ({ page }) => {
        const query = await page.evaluate(() => {
            const r = document.querySelector('table.tbl tbody tr');
            return `${r.cells[0].innerText.trim().split(/\s+/).pop()} ${r.cells[1].innerText.trim().split(/\s+/)[0]}`;
        });
        expect(query, 'end of the Release cell + start of the Artist cell').toBe('Dreams BoDeans');
        await typeGlobalFilter(page, query);
        await expect.poll(() => rowsIn(page, 0), { ...SETTLE, message: 'no single cell contains the query' }).toBe(0);
    });
});

// ── F5 needs artwork, so it has its own page setup ──────────────────────────
//
// Same network-free CAA arrangement as global-filter-art-search.spec.js: one
// release gets a "Back" image, every other release "Front". The image rows'
// type badges are rebuilt after every filter pass and highlighted by
// _artHighlightArtCell(), never by testRowMatch().

const NEEDLE = 'Back';

/**
 * Release MBIDs in document order, from the shell the page is served from.
 *
 * @returns {string[]}
 */
function releaseMbids() {
    const html = require('fs').readFileSync(RG.shell, 'utf8');
    const seen = [];
    for (const m of html.matchAll(/href="\/release\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/g)) {
        if (!seen.includes(m[1])) seen.push(m[1]);
    }
    return seen;
}

/**
 * Loads the release group with artwork on; `backMbid` gets the "Back" image.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} backMbid
 */
async function openWithArtwork(page, backMbid) {
    await loadUserscriptPage(page, {
        url: RG.url, fixtureFile: RG.shell, testMode: true,
        settingsOverride: { ...LEGACY, sa_enable_caa_pics: true, sa_caa_pics_inline: true, sa_enable_relationships_column: false },
    });
    await page.route(RG.routeGlob, (route) => route.fulfill({ path: RG.shell, contentType: 'text/html' }));
    await page.route('https://coverartarchive.org/**', (route) => route.fulfill({ status: 404, body: '' }));
    await page.route(/^https:\/\/coverartarchive\.org\/release\/[0-9a-f-]{36}$/, (route) => {
        const mbid = route.request().url().split('/').pop();
        return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                images: [{
                    id: 1, types: [mbid === backMbid ? 'Back' : 'Front'], front: mbid !== backMbid,
                    back: mbid === backMbid, comment: '', approved: true,
                    image: `https://coverartarchive.org/release/${mbid}/1.jpg`,
                    thumbnails: { 250: `https://coverartarchive.org/release/${mbid}/1-250.jpg` },
                }],
            }),
        });
    });
    // Thumbnails go through GM_xmlhttpRequest, which page.route cannot see.
    await page.evaluate(() => {
        const original = window.GM_xmlhttpRequest;
        window.GM_xmlhttpRequest = (opts) => {
            if (!/\/front-/.test((opts && opts.url) || '')) return original(opts);
            setTimeout(() => opts.onload({ status: 404, response: null, responseText: '' }), 0);
            return { abort() {} };
        };
    });
    await page.click(RG.button);
    await waitForRenderComplete(page, { waitForAutoResize: false });
    await clickMasterToggleAndExpandAll(page);
}

/**
 * Global-filter highlights inside image rows whose type badge reads `label`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} label
 * @returns {Promise<number>}
 */
const imageRowGlobalMarks = (page, label) => page.evaluate((want) => Array.from(
    document.querySelectorAll('table.tbl tbody li.mb-caa-art-li-image'))
    .filter((li) => Array.from(li.querySelectorAll('.mb-caa-type-badge > span'))
        .some((s) => s.textContent.trim() === want))
    .reduce((n, li) => n + li.querySelectorAll('.mb-global-filter-highlight').length, 0), label);

test.describe('multi-table: cover-art image rows use the GLOBAL flags for the global query', () => {
    let pageErrors;
    let tableIndex;

    test.beforeEach(async ({ page }) => {
        pageErrors = collectPageErrors(page);
        const mbids = releaseMbids();
        await openWithArtwork(page, mbids[1]);
        await expect.poll(() => page.evaluate(() => document.querySelectorAll(
            'table.tbl tbody .mb-caa-count-badge').length), { timeout: 20000, message: 'every CAA cell settles' })
            .toBe(mbids.length);
        tableIndex = await page.evaluate((want) => Array.from(document.querySelectorAll('table.tbl'))
            .findIndex((t) => Array.from(t.querySelectorAll('tbody .mb-caa-type-badge > span'))
                .some((s) => s.textContent.trim() === want)), NEEDLE);
        expect(tableIndex, 'the "Back" row was located').toBeGreaterThan(-1);
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('F5: a global regexp is highlighted in the image rows while the sub-table Rx is off', async ({ page }) => {
        await page.locator('#mb-global-filter-rx-label').click();
        await page.fill('#mb-global-filter-input', `${NEEDLE}|Nothing`);
        await expect.poll(() => rowsIn(page, tableIndex), { ...SETTLE, message: 'the regexp keeps the "Back" row' }).toBe(1);
        await expect.poll(() => imageRowGlobalMarks(page, NEEDLE), {
            ...SETTLE, message: 'the "Back" badge is highlighted as a regexp match',
        }).toBeGreaterThan(0);
    });

    test('F5: a case-insensitive global query is highlighted while the sub-table Cc is on', async ({ page }) => {
        await openSubTablePanel(page, tableIndex);
        await subTableBox(page, tableIndex, 'case').click();
        await page.fill('#mb-global-filter-input', NEEDLE.toLowerCase());
        await expect.poll(() => rowsIn(page, tableIndex), { ...SETTLE, message: 'global Cc is off: "back" keeps the row' }).toBe(1);
        await expect.poll(() => imageRowGlobalMarks(page, NEEDLE), {
            ...SETTLE, message: 'the "Back" badge is highlighted case-insensitively',
        }).toBeGreaterThan(0);
    });
});
