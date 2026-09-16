'use strict';

// Relationships column: a 📊 "Relationship icons" entry must still FILTER after
// the column has been collapsed and expanded again.
//
// ── The report this reproduces (2026-09-16, live testing) ───────────────────
//
// On a release-group page: picking an icon entry from the Relationships 📊
// dropdown filtered correctly (rows narrowed, matching icons outlined red).
// After collapsing the column with ▼🔗 and expanding it again with ▶🔗,
// picking ANY entry from that dropdown has no effect at all — no narrowing, no
// outline — and stays that way for every later pick.
//
// What the user's saved captures already rule out, so this spec does not need
// to re-assert it: the cells come back intact (correct mbids, anchors, hrefs
// and hidden .mb-rel-filter-key text), the rel <td> is still at the same column
// index as the filter input's data-col-idx, and the input still carries the
// chosen mode in data-mb-uniq-values. So the data and the wiring both look
// right; what fails is that the choice stops reaching the row test.
//
// ── Why the first test exists ───────────────────────────────────────────────
//
// It pins the same action WITHOUT the collapse cycle. A reproduction that only
// asserts the broken path proves nothing when it fails: it could equally mean
// the spec drives the dropdown wrongly. The baseline makes the pair meaningful
// — same fixture, same helper, same entry, one variable.
//
// Network-free: every `**/ws/2/**` request is intercepted.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { collectPageErrors } = require('../support/liveAssertions');
const { columnFilterInput } = require('../support/filterSortAssertions');

// "Bruce Springsteen Studio Collection" — 12 releases, `tableMode: 'single'`,
// which is the shape the reported page actually rendered (its capture has one
// table.tbl, one thead and one filter row, despite release-group being a
// multi-table pageType).
const SERIES_URL = 'https://musicbrainz.org/series/aa3694d3-a3d0-48ed-8f07-5b576de87908';
const SERIES_SHELL = path.join(__dirname, '..', 'snapshots', 'series-releases', 'raw.html');
const SERIES_ROWS = 12;

// The grouping under test. springsteenlyrics.com is _findCellRelIcons()'s one
// PATH_SENSITIVE_HOSTS entry, so its domainKey is host + path — exactly the
// entry the user picked, and the interesting case, since a plain host key would
// not exercise that branch.
const SL_URL = 'https://www.springsteenlyrics.com/bootlegs.php?item=';
const SL_DOMAIN_KEY = 'www.springsteenlyrics.com/bootlegs.php';
const SL_ROWS = 4;              // how many rows are served an SL relationship

const ICONS_SECTION = 'Relationship icons';
const toggle = 'thead .mb-rel-col-hdr-btn';

/**
 * Loads the series shell with the column ON and never auto-collapsing, serving
 * the first `SL_ROWS` requests a springsteenlyrics relationship and the rest a
 * discogs one.
 *
 * Keyed on request ORDER rather than on mbid, because the fetch happens during
 * the render — before a test can read the row mbids. Which rows end up with the
 * icon is therefore not fixed here, so every expectation below is derived from
 * the DOM instead of hardcoded.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string[]>} intercepted WS/2 URLs, in call order
 */
async function loadSeries(page) {
    const ws2 = [];
    await loadUserscriptPage(page, {
        url: SERIES_URL,
        fixtureFile: SERIES_SHELL,
        testMode: true,
        settingsOverride: {
            sa_enable_relationships_column: true,
            sa_rel_collapse_threshold: 0,   // 0 = never auto-collapse
        },
    });
    await page.route('**/ws/2/**', (route) => {
        const n = ws2.length;
        ws2.push(route.request().url());
        const resource = n < SL_ROWS ? SL_URL + n : `https://www.discogs.com/release/${n}`;
        return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                relations: [{ 'target-type': 'url', type: 'discogs', url: { resource } }],
            }),
        });
    });
    await page.route('https://musicbrainz.org/series/**',
        (route) => route.fulfill({ path: SERIES_SHELL, contentType: 'text/html' }));
    await page.click('button[data-label="Show all Releases for Series"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
    return ws2;
}

/** Waits until the column has nothing left to fetch. */
const settle = (page, timeout = 60000) => expect
    .poll(() => page.evaluate(() => window.__saTest.relTableStates()[0].pending), { timeout })
    .toBe(0);

/** Rows currently rendered (runFilter removes non-matching rows on this path). */
const visibleRows = (page) => page.evaluate(() => Array.from(
    document.querySelectorAll('table.tbl tbody tr')).filter((r) => r.style.display !== 'none').length);

/** How many rendered rows actually carry a springsteenlyrics relationship. */
const rowsWithSl = (page) => page.evaluate((key) => Array.from(
    document.querySelectorAll('table.tbl tbody tr'))
    .filter((r) => r.style.display !== 'none')
    .filter((r) => {
        const td = r.querySelector('td.mb-rel-cell');
        return !!td && Array.from(td.querySelectorAll('.mb-rel-filter-key'))
            .some((s) => s.textContent.includes(key));
    }).length, SL_DOMAIN_KEY);

/** Icons currently carrying the red match outline. */
const outlinedIcons = (page) => page.evaluate(
    () => document.querySelectorAll('td.mb-rel-cell a.mb-rel-icon-match').length);

/**
 * Opens the Relationships 📊 dropdown and clicks the springsteenlyrics entry in
 * the "Relationship icons" section.
 *
 * Returns the entry's own displayed count, so a caller can tell "the entry was
 * missing or zero" apart from "the entry was there and filtering ignored it" —
 * two very different defects with the same visible result.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<?number>} the entry's count, or null when no entry matched
 */
async function pickSlEntry(page) {
    const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Relationships'));
    const icons = (sections || []).find((s) => s.label === ICONS_SECTION);
    if (!icons) return null;
    const entry = icons.items.find((i) => (i.label || '').includes(SL_DOMAIN_KEY));
    if (!entry) return null;
    await page.evaluate(({ sectionLabel, key }) => {
        const sectionEl = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
            .find((s) => s.querySelector('.mb-uniq-section-label')?.textContent === sectionLabel);
        const item = Array.from(sectionEl.querySelectorAll('.mb-col-uniq-item'))
            .find((el) => (el.dataset.mbUniqSynLabel || '').includes(key));
        item.click();
    }, { sectionLabel: ICONS_SECTION, key: SL_DOMAIN_KEY });
    return entry.count;
}

/** Closes the dropdown through its own outside-mousedown handler. */
async function closeDropdown(page) {
    await page.evaluate(() => document.body.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, cancelable: true })));
    await expect(page.locator('#mb-col-uniq-dropdown')).toBeHidden({ timeout: 5000 });
}

test.describe('Relationships 📊: an icon entry filters after a collapse/expand cycle', () => {
    let pageErrors;
    let errorStacks;

    test.beforeEach(async ({ page }) => {
        pageErrors = collectPageErrors(page);
        // collectPageErrors() keeps only err.message, which is not enough to
        // locate a throw among the ~40 .toLowerCase() call sites on the filter
        // path. Capture the STACK separately, and print it, so a reproduction
        // names its own line instead of sending the reader back to grep.
        errorStacks = [];
        page.on('pageerror', (err) => {
            errorStacks.push(err.stack || String(err));
            // eslint-disable-next-line no-console
            console.log('\n=== PAGE ERROR ===\n' + (err.stack || String(err)) + '\n');
        });
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('baseline: picking an icon entry narrows the table and outlines the matches',
        async ({ page }) => {
            await loadSeries(page);
            await settle(page);
            expect(await visibleRows(page)).toBe(SERIES_ROWS);

            const expected = await rowsWithSl(page);
            expect(expected, 'the fixture served some springsteenlyrics rows').toBe(SL_ROWS);

            const count = await pickSlEntry(page);
            expect(count, 'the dropdown offers the springsteenlyrics entry').toBe(SL_ROWS);
            await expect.poll(() => visibleRows(page), { timeout: 15000 }).toBe(SL_ROWS);
            expect(await outlinedIcons(page), 'matching icons are outlined').toBeGreaterThan(0);
        });

    test('after collapsing and expanding the column, the same entry still filters',
        async ({ page }) => {
            await loadSeries(page);
            await settle(page);

            // The cycle under test. Collapsing empties every cell; expanding
            // refills them from the in-memory cache, so this costs no requests
            // and the column ends up looking exactly as it did before.
            await page.click(toggle);
            await expect.poll(() => page.evaluate(
                () => document.querySelectorAll('td.mb-rel-cell a').length), { timeout: 15000 }).toBe(0);
            await page.click(toggle);
            await settle(page);

            // Same starting point as the baseline: every row rendered, and the
            // same rows carrying the icon. If either differs, the cycle damaged
            // the data and the filter is not the subject any more.
            expect(await visibleRows(page)).toBe(SERIES_ROWS);
            expect(await rowsWithSl(page),
                'the same rows carry a springsteenlyrics relationship after the cycle').toBe(SL_ROWS);

            const count = await pickSlEntry(page);
            expect(count, 'the dropdown still offers the entry, with its count').toBe(SL_ROWS);
            await expect.poll(() => visibleRows(page), { timeout: 15000 }).toBe(SL_ROWS);
            expect(await outlinedIcons(page), 'matching icons are outlined').toBeGreaterThan(0);
        });

    test('the reported sequence: pick, clear, filter another column, collapse, expand, pick again',
        async ({ page }) => {
            // The minimal cycle above passes, so the cause needs the rest of the
            // reported steps. The variable this adds is ANOTHER COLUMN'S FILTER
            // being active across the collapse, the expand and the second pick:
            // runFilter() removes non-matching rows from the tbody, so the
            // collapse clears cells over a different row population than the
            // expand later repopulates — and the masters can diverge from the
            // live rows without anything saying so.
            await loadSeries(page);
            await settle(page);

            // 1. Pick, and confirm it works — the same starting point the user had.
            expect(await pickSlEntry(page)).toBe(SL_ROWS);
            await expect.poll(() => visibleRows(page), { timeout: 15000 }).toBe(SL_ROWS);

            // 2. Clear it by unchecking the same entry, and confirm the table is whole.
            await pickSlEntry(page);
            await expect.poll(() => visibleRows(page), { timeout: 15000 }).toBe(SERIES_ROWS);
            await closeDropdown(page);

            // 3. Filter a DIFFERENT column, the way "barcelona" was typed into
            //    MB-Name — the same column, in fact, since this fixture has one.
            //
            //    The needle is CHOSEN BY FREQUENCY rather than taken from row 0:
            //    a word from the first row need not recur, and when it doesn't
            //    the filter matches nothing and the rest of the test measures a
            //    blank table. (That is exactly what the first version did.)
            //    Column 0 is avoided for a second reason — the sticky Release
            //    cell's textContent fuses its expand glyph and the
            //    `caa-inline-yes` sentinel onto the title with no separator
            //    ("▶🗄️Barcelona Nightcaa-inline-yes"), so words extracted from
            //    it are not what a person sees or types.
            const { needle, colIdx, hits } = await page.evaluate(() => {
                const ths = Array.from(document.querySelectorAll('table.tbl thead tr:first-child th'));
                const idx = ths.findIndex((t) => (t.dataset.colName || '') === 'MB-Name');
                const rows = Array.from(document.querySelectorAll('table.tbl tbody tr'));
                const textOf = (r) => ((r.cells[idx] || {}).textContent || '').toLowerCase();
                const freq = new Map();
                rows.forEach((r) => new Set((textOf(r).match(/[a-z]{4,}/g) || []))
                    .forEach((w) => freq.set(w, (freq.get(w) || 0) + 1)));
                // A proper subset: present in more than one row, absent from at
                // least one. Largest such group wins, for a stable choice.
                const best = Array.from(freq.entries())
                    .filter(([, n]) => n > 1 && n < rows.length)
                    .sort((a, b) => b[1] - a[1])[0];
                return best
                    ? { needle: best[0], colIdx: idx, hits: best[1] }
                    : { needle: null, colIdx: idx, hits: 0 };
            });
            expect(needle, 'the MB-Name column offers a word shared by some rows but not all')
                .toBeTruthy();
            // Both bounds asserted: a needle matching EVERY row would make this
            // step a no-op and quietly weaken the whole test.
            expect(hits).toBeGreaterThan(0);
            expect(hits).toBeLessThan(SERIES_ROWS);

            // CLICK first, then type. These inputs are readonly until a genuine,
            // trusted interaction (anti-autofill hardening — see
            // columnFilterClear()'s JSDoc), so locator.fill() is rejected
            // outright: it times out with "element is not editable". The same
            // guard, `_isGenuineFilterInputEvent()`, is why fill('') cannot
            // clear one either — that needs the ✕ button.
            const colInput = columnFilterInput(page, colIdx);
            await colInput.click();
            await colInput.pressSequentially(needle);
            await expect.poll(() => visibleRows(page), { timeout: 15000 }).toBe(hits);

            // 4. Collapse and expand WHILE that filter is active.
            await page.click(toggle);
            await expect.poll(() => page.evaluate(
                () => document.querySelectorAll('td.mb-rel-cell a').length), { timeout: 15000 }).toBe(0);
            await page.click(toggle);
            await settle(page);

            // Still the text-filtered row set, and the icons are back.
            expect(await visibleRows(page)).toBe(hits);
            const bothCount = await rowsWithSl(page);

            // 5. Pick the entry again. It must narrow to the rows that match
            //    BOTH filters. The reported symptom is that nothing happens at
            //    all — the row set stays as the text filter left it and no icon
            //    is outlined.
            // Ordered deliberately: report WHAT the filter did before asserting
            // the outline. The first run failed on the outline and only then on
            // the page error, which hid both the narrowing result and the fact
            // that the userscript had thrown.
            // Asserted in this order deliberately. The original failure showed
            // up as "no outline" while the narrowing was CORRECT (visible=2 of
            // an expected 2, outlined=0): runFilter()'s row loop threw part-way,
            // after the rows had been filtered but before the highlight pass.
            // Asserting the outline first would have reported the symptom
            // without the fact that the row set was fine.
            const count = await pickSlEntry(page);
            expect(count, 'the entry is still offered after the cycle').toBe(bothCount);
            await expect.poll(() => visibleRows(page), { timeout: 15000 }).toBe(bothCount);
            expect(await outlinedIcons(page), 'matching icons are outlined').toBeGreaterThan(0);
            // The throw itself, named rather than left to afterEach: a poisoned
            // row-text cache entry made testRowMatch() call .toLowerCase() on
            // null. afterEach checks this too, but only this assertion says why.
            expect(errorStacks, `the filter pass completed without throwing: ${errorStacks[0] || ''}`)
                .toEqual([]);
        });
});
