'use strict';

// The "Release events" column and the synthetic "Release country"/"Release date"
// columns derived from it are populated by ONE WS/2 call, after the render.
// A filter typed before that answer arrives must be re-tested against the
// populated cells. AUDIT.md §3.3 (which absorbed §3.7), live twin §10 L6.
//
// Two caches sit in front of the matcher, and `initReleaseEventsColumn()` drops
// neither:
//   • _filterResultCache, keyed on filter INPUTS — unchanged by an arriving
//     answer, so the pre-population row list is replayed;
//   • _rowTextCache, per source row — `initReleaseEventsColumn()` syncs the
//     populated innerHTML into groupedRows/allRows and
//     `applyInjectedColumnExtractors()` fills the ICE cells there too, but the
//     cached column/full text of those rows still says "empty".
//
// The control types the same needle AFTER population, which proves the spec
// drives the page correctly. The isolation test flips the page-wide Case
// checkbox, changing the cache key so no replay is possible, to tell the two
// apart.
//
// Network-free: the WS/2 call is answered by page.route, and held open until
// the test releases it.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
// collectPageErrors() is deliberately NOT used here: MusicBrainz's own
// static/scripts/supported-browser-check.js throws "Cannot read properties of
// null (reading 'style')" on this captured shell, which has nothing to do with
// the userscript. Stacks are collected instead, so that one can be excluded by
// FILE rather than by message text.
const { columnFilterInput, columnFilterClear } = require('../support/filterSortAssertions');

// A label whose relationships page carries a "distributed" group of releases —
// rendered as the "Distributed release" sub-table. Verified by the user on
// 2026-09-17 as a page whose Release events cells actually populate (the first
// candidate in §10 L6 did not, which is why it was replaced).
const LABEL_URL = 'https://musicbrainz.org/label/011d1192-6f65-45bd-85c4-0400dd45693e/relationships';
const FIXTURE_FILE = path.join(__dirname, 'label-relationships-release-events.html');
const SUBTABLE = 'Distributed release';
const NEEDLE = 'US';
const US_RELEASES = 3; // how many of the distributed releases get a US event

/**
 * Release MBIDs of the fixture's "distributed" group, in document order — the
 * rows the "Distributed release" sub-table is built from.
 *
 * @returns {string[]}
 */
function distributedReleaseMbids() {
    const html = fs.readFileSync(FIXTURE_FILE, 'utf8');
    const appearances = html.slice(html.indexOf('<h2>Appearances'));
    const out = [];
    let inGroup = false;
    for (const row of appearances.split(/(?=<tr)/)) {
        const subh = /class="subh"[^>]*>[\s\S]*?colspan="\d+">([^<]+)/.exec(row);
        if (subh) { inGroup = subh[1].trim() === 'distributed'; continue; }
        if (!inGroup) continue;
        const m = /href="\/release\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/.exec(row);
        if (m && !out.includes(m[1])) out.push(m[1]);
    }
    return out;
}

/**
 * A WS/2 `inc=release-rels` answer: the first `US_RELEASES` distributed
 * releases get a US release event, the rest a DE one, so the needle matches
 * some rows and not others.
 *
 * @param {string[]} mbids
 * @returns {string}
 */
function releaseRelsBody(mbids) {
    return JSON.stringify({
        relations: mbids.map((id, i) => ({
            'target-type': 'release',
            type: 'distributed',
            release: {
                id,
                'release-events': [{
                    date: `19${80 + (i % 20)}-05-01`,
                    area: i < US_RELEASES
                        ? { name: 'United States', 'iso-3166-1-codes': ['US'] }
                        : { name: 'Germany', 'iso-3166-1-codes': ['DE'] },
                }],
            },
        })),
    });
}

/**
 * A gate over the single Release-events WS/2 call, so a filter can be typed
 * while the column is still empty.
 *
 * `answered` resolves once the response has actually been delivered — the only
 * observable moment while a filter is narrowing the table to zero rows, since
 * there is then no live cell left to poll.
 *
 * @param {string[]} mbids
 * @returns {{handler: Function, release: Function, answered: Promise<void>, calls: number[]}}
 */
function releaseEventsGate(mbids) {
    const waiting = [];
    const calls = [];
    let open = false;
    let markAnswered;
    const answered = new Promise((resolve) => { markAnswered = resolve; });
    const handler = async (route) => {
        calls.push(Date.now());
        if (!open) await new Promise((resolve) => waiting.push(resolve));
        await route.fulfill({
            status: 200, contentType: 'application/json', body: releaseRelsBody(mbids),
        }).catch(() => {});
        markAnswered();
    };
    const release = () => { open = true; waiting.splice(0).forEach((r) => r()); };
    return { handler, release, answered, calls };
}

/** Index of the sub-table rendered under the `SUBTABLE` heading. */
const subTableIndex = (page) => page.evaluate((heading) => {
    const tables = Array.from(document.querySelectorAll('table.tbl'));
    return tables.findIndex((t) => {
        let el = t.previousElementSibling;
        while (el && el.tagName !== 'H3') el = el.previousElementSibling;
        return !!el && el.textContent.includes(heading);
    });
}, SUBTABLE);

/** Rows rendered in one sub-table — runFilter() REMOVES non-matching rows. */
const rowsIn = (page, tableIndex) => page.evaluate((i) => Array.from(
    document.querySelectorAll('table.tbl')[i].querySelectorAll('tbody tr'))
    .filter((r) => r.style.display !== 'none').length, tableIndex);

/** How many of that sub-table's rows show a populated "Release country" cell. */
const populatedCountryCells = (page, tableIndex) => page.evaluate((i) => {
    const table = document.querySelectorAll('table.tbl')[i];
    const idx = Array.from(table.querySelector('thead tr:first-child').cells)
        .findIndex((t) => (t.dataset.colName || '') === 'Release country');
    if (idx < 0) return -1;
    return Array.from(table.querySelectorAll('tbody tr'))
        .filter((r) => r.cells[idx] && r.cells[idx].textContent.trim() !== '').length;
}, tableIndex);

/** The column index of `name` inside one sub-table. */
const colIndexIn = (page, tableIndex, name) => page.evaluate(({ i, n }) => Array.from(
    document.querySelectorAll('table.tbl')[i].querySelector('thead tr:first-child').cells)
    .findIndex((t) => (t.dataset.colName || '') === n), { i: tableIndex, n: name });

test.describe('Release events: a filter typed before the answer arrives', () => {
    let pageErrors;
    let gate;
    let tableIndex;
    let mbids;

    test.beforeEach(async ({ page }) => {
        pageErrors = [];
        // MusicBrainz's OWN scripts throw on this captured shell — its
        // supported-browser-check.js hits a null node, and a versioned bundle
        // the capture references now answers with an HTML error page
        // ("Unexpected token '<'"). Neither involves the userscript, and both
        // are artifacts of serving a saved page. Everything else is kept.
        const THIRD_PARTY = [/supported-browser-check/, /Unexpected token '<'/];
        page.on('pageerror', (e) => {
            const where = String(e.stack || e.message || '');
            if (!THIRD_PARTY.some((re) => re.test(where))) pageErrors.push(where);
        });
        mbids = distributedReleaseMbids();
        expect(mbids.length, 'the fixture has a distributed-release group').toBeGreaterThan(5);
        gate = releaseEventsGate(mbids);

        await loadUserscriptPage(page, {
            url: LABEL_URL,
            fixtureFile: FIXTURE_FILE,
            testMode: true,
            settingsOverride: {
                sa_enable_release_events_column: true,
                sa_enable_relationships_column: false,
            },
        });
        await page.route('https://musicbrainz.org/label/**',
            (route) => route.fulfill({ path: FIXTURE_FILE, contentType: 'text/html' }));
        await page.route('**/ws/2/label/**', gate.handler);

        await page.click('button[data-label="Show all Relationships for Label"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });

        // Multi-table page: sub-sections render collapsed, and a collapsed
        // table's cells are not reachable. Drive the master toggle only when it
        // says collapsed — the initial state differs per pageType.
        const master = page.locator('.mb-master-toggle');
        if (await master.count() && (await master.getAttribute('data-state')) === 'collapsed') {
            await master.click();
        }

        tableIndex = await subTableIndex(page);
        expect(tableIndex, `the "${SUBTABLE}" sub-table is rendered`).toBeGreaterThan(-1);
    });

    test.afterEach(() => {
        gate.release(); // never leave a route pending
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('control: filter AFTER the Release events answer arrives', async ({ page }) => {
        gate.release();
        await gate.answered;
        await expect.poll(() => populatedCountryCells(page, tableIndex), {
            timeout: 20000, message: 'the Release country cells populate',
        }).toBeGreaterThan(US_RELEASES);

        const colIdx = await colIndexIn(page, tableIndex, 'Release country');
        const input = columnFilterInput(page, colIdx, { tableIndex });
        await input.click();
        await input.pressSequentially(NEEDLE);
        await expect.poll(() => rowsIn(page, tableIndex), {
            timeout: 15000, message: 'control: the country filter narrows to the US rows',
        }).toBe(US_RELEASES);
    });

    test('rows filtered out while the answer arrives are populated all the same', async ({ page }) => {
        // Defect A, and it is permanent: initReleaseEventsColumn() collects the
        // cells to fill from the LIVE DOM, and runFilter() REMOVES non-matching
        // rows, so a row filtered out at answer time is not in that list. The
        // function runs once per fetch and never again, so clearing the filter
        // brings the rows back with an empty Release events column forever.
        const colIdx = await colIndexIn(page, tableIndex, 'Release country');
        const input = columnFilterInput(page, colIdx, { tableIndex });
        await input.click();
        await input.pressSequentially(NEEDLE);
        await expect.poll(() => rowsIn(page, tableIndex), {
            timeout: 15000, message: 'an empty column matches nothing yet',
        }).toBe(0);

        gate.release();
        await gate.answered;
        await columnFilterClear(page, colIdx, { tableIndex }).click();
        await expect.poll(() => rowsIn(page, tableIndex), {
            timeout: 15000, message: 'clearing the filter brings every row back',
        }).toBe(mbids.length);

        await expect.poll(() => populatedCountryCells(page, tableIndex), {
            timeout: 20000, message: 'A: every row has its Release country, not just the ones live at answer time',
        }).toBe(mbids.length);
    });

    test('picking the same filter again after the answer re-tests the rows', async ({ page }) => {
        // Defect B, isolated from A: the filter is CLEARED before the answer
        // arrives, so every row is live and every cell is populated. All that is
        // left is the cached row list keyed on filter inputs, which the arriving
        // answer does not change.
        const colIdx = await colIndexIn(page, tableIndex, 'Release country');
        const input = columnFilterInput(page, colIdx, { tableIndex });
        await input.click();
        await input.pressSequentially(NEEDLE);
        await expect.poll(() => rowsIn(page, tableIndex), {
            timeout: 15000, message: 'an empty column matches nothing yet',
        }).toBe(0);
        gate.release();
        await gate.answered;

        // Clear and retype the same needle, exactly as a user does after seeing
        // the column fill in.
        await columnFilterClear(page, colIdx, { tableIndex }).click();
        await input.click();
        await input.pressSequentially(NEEDLE);
        await expect.poll(() => rowsIn(page, tableIndex), {
            timeout: 15000, message: 'B: the same needle now renders the US rows, not the cached empty list',
        }).toBe(US_RELEASES);
    });

    test('isolation: a NEW filter key after the answer reads the populated text', async ({ page }) => {
        // Defect C, isolated from B: the page-wide Case checkbox changes
        // _buildFilterKey()'s top-level "c", so no cached row list can be
        // replayed. With no global query it changes no match. Rows missing here
        // mean the per-row TEXT cache is stale on its own.
        const colIdx = await colIndexIn(page, tableIndex, 'Release country');
        const input = columnFilterInput(page, colIdx, { tableIndex });
        await input.click();
        await input.pressSequentially(NEEDLE);
        await expect.poll(() => rowsIn(page, tableIndex), {
            timeout: 15000, message: 'an empty column matches nothing yet',
        }).toBe(0);
        gate.release();
        await gate.answered;

        // A fresh key: no cached row list can be replayed into this answer.
        await columnFilterClear(page, colIdx, { tableIndex }).click();
        await page.locator('#mb-global-filter-case-checkbox').check();
        await input.click();
        await input.pressSequentially(NEEDLE);
        await expect.poll(() => rowsIn(page, tableIndex), {
            timeout: 15000, message: 'C: a fresh key renders the US rows',
        }).toBe(US_RELEASES);
    });

    test('an active filter re-runs itself against the populated cells', async ({ page }) => {
        // Defect D: dropping the caches only makes the NEXT pass correct. With a
        // filter still active, the user is otherwise left looking at a table
        // filtered on data that had not arrived — here, an empty table — until
        // they touch the filter again. Nothing is retyped in this test.
        const colIdx = await colIndexIn(page, tableIndex, 'Release country');
        const input = columnFilterInput(page, colIdx, { tableIndex });
        await input.click();
        await input.pressSequentially(NEEDLE);
        await expect.poll(() => rowsIn(page, tableIndex), {
            timeout: 15000, message: 'an empty column matches nothing yet',
        }).toBe(0);

        gate.release();
        await gate.answered;

        await expect.poll(() => rowsIn(page, tableIndex), {
            timeout: 20000, message: 'D: the still-active filter shows the US rows without being retyped',
        }).toBe(US_RELEASES);
    });
});
