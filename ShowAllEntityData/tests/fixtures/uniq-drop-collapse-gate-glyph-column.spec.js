'use strict';

// A column header that says "▶9▤" must offer "▶ collapsed multi-row cells (9)"
// in its own 📊 dropdown. On `release-tracks` it did not, for every column
// carrying an entity glyph — which is most of them.
//
// Two readers answer "is this a collapsable column", and they resolve the
// column's NAME differently:
//
//   initCollapsableColumns()   _cleanColHeaderText(th)  → th.dataset.colName
//   openUniqDrop()             th.textContent.replace(/[⇅▲▼…▶◀▤0-9]/g,'').trim()
//
// `_initColHeaderGlyph()` appends U+200B (ZERO WIDTH SPACE) to its glyph span,
// so the glyph is never an empty selector target. U+200B is NOT JS whitespace:
// it survives the character-class strip AND `.trim()`. So the first reader
// matches "Instruments" and builds the toggle, and the second compares
// "Instruments​" against the declared list and decides the column is not
// collapsable at all.
//
// The symptom depends on whether the column also has empty cells, which is why
// it looked like two unrelated bugs:
//   - with empty cells  → a Structure section showing ONLY "○ empty cells"
//   - without           → no Structure section at all
//
// `initCollapsableColumns()` already carries a comment explaining exactly this
// trap and why it uses `_cleanColHeaderText()`. `openUniqDrop()` is the call
// site that re-derived the answer instead — the "hand-rolled check at a new
// call site" that CLAUDE.md names for `_classifyCollapseCell` and `_findCellListItems`.
//
// Fixture: "Live in Barcelona"-shaped E Street Band release supplied by the
// user (5 collapsable AR columns, badges 3/10/9/2/14), captured with
// --strip-json.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const RELEASE_URL = 'https://musicbrainz.org/release/6d19588c-0305-4fb0-b687-d4b75a75c3fd';
const FIXTURE_FILE = path.join(__dirname, 'release-tracks-multirow-instruments.html');
const COLLAPSED = '▶ collapsed multi-row cells';

/** Every header carrying a ▶N▤ toggle, with its badge count and resolved name. */
const collapsableHeaders = (page) => page.evaluate(() => {
    const strip = (t) => t.replace(/[⇅▲▼⁰¹²³⁴⁵⁶⁷⁸⁹📊▶◀▤0-9]/g, '').trim().replace(/\s+/g, ' ');
    const headers = Array.from(document.querySelectorAll('table.tbl'))
        .flatMap((t) => Array.from(t.querySelectorAll('thead tr:first-child th')));
    return headers
        .filter((th) => th.querySelector('.mb-col-collapse-hdr-btn'))
        .map((th) => {
            const badge = th.querySelector('.mb-col-collapse-count');
            return {
                colName: th.dataset.colName || null,
                badge: badge ? parseInt(badge.textContent.trim(), 10) : null,
                strippedText: strip(th.textContent),
                hasZwsp: th.textContent.includes('​'),
            };
        });
});

/** One Structure entry's advertised count for a column, or null. */
async function structureCount(page, colName, label) {
    const sections = await page.evaluate((c) => window.__saTest.getUniqDropSections(c), colName);
    const section = (sections || []).find((s) => s.label === 'Structure');
    const entry = section && section.items.find((i) => i.label === label);
    return entry ? entry.count : null;
}

test.describe('📊 Structure entries on a glyph-bearing collapsable column', () => {
    let pageErrors;
    let headers;

    test.beforeEach(async ({ page }) => {
        pageErrors = [];
        const THIRD_PARTY = [/supported-browser-check/, /Unexpected token '<'/];
        page.on('pageerror', (e) => {
            const where = String(e.stack || e.message || '');
            if (!THIRD_PARTY.some((re) => re.test(where))) pageErrors.push(where);
        });
        await loadUserscriptPage(page, {
            url: RELEASE_URL, fixtureFile: FIXTURE_FILE, testMode: true,
        });
        await page.click('button[data-label="Show all Tracks for Release"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        headers = await collapsableHeaders(page);
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('precondition: the fixture has glyph-bearing columns with multi-row cells', async () => {
        expect(headers.length, 'several columns carry a ▶N▤ toggle').toBeGreaterThan(2);
        const glyphed = headers.filter((h) => h.hasZwsp);
        expect(glyphed.length, 'and at least one of them carries an entity glyph')
            .toBeGreaterThan(0);
        for (const h of glyphed) {
            expect(h.badge, `${h.colName}'s badge counts multi-row cells`).toBeGreaterThan(0);
        }
    });

    test('the trap itself: the glyph leaves a U+200B that the ad-hoc strip keeps', async () => {
        // Pinned deliberately. If `_initColHeaderGlyph()` ever stops appending
        // U+200B, this fails and tells the next reader why the test below
        // exists — rather than leaving a guard whose reason has evaporated.
        const glyphed = headers.filter((h) => h.hasZwsp);
        // Without this the test passes VACUOUSLY the moment the glyph stops
        // carrying U+200B — a for-loop over nothing asserts nothing. Found by
        // the "the glyph stops appending its zero-width space" mutation, which
        // this file predicted would fail and which passed instead.
        expect(glyphed.length, 'there is at least one glyph-bearing header to check')
            .toBeGreaterThan(0);
        for (const h of glyphed) {
            expect(h.strippedText, `${h.colName}: .trim() does not remove U+200B`)
                .not.toBe(h.colName);
            expect(h.strippedText.replace(/​/g, '').trim(),
                `${h.colName}: and U+200B is the ONLY difference`).toBe(h.colName);
        }
    });

    test('every ▶N▤ column offers "collapsed multi-row cells" with the same count',
        async ({ page }) => {
            const mismatches = [];
            for (const h of headers) {
                const count = await structureCount(page, h.colName, COLLAPSED);
                if (count !== h.badge) {
                    mismatches.push(`${h.colName}: header ▶${h.badge}▤ vs 📊 ${count}`);
                }
            }
            expect(mismatches, 'the header and the dropdown count the same cells').toEqual([]);
        });

    test('and the entry filters to exactly the rows it counts', async ({ page }) => {
        // The label appearing is not enough: it has to work. Uses the column
        // with the largest badge, so the assertion is not about a single row.
        const target = headers.slice().sort((a, b) => b.badge - a.badge)[0];
        const count = await structureCount(page, target.colName, COLLAPSED);
        expect(count, `${target.colName} offers the entry`).toBe(target.badge);

        const matching = await page.evaluate((c) => {
            const th = Array.from(document.querySelectorAll('table.tbl thead th'))
                .find((t) => t.dataset.colName === c);
            const table = th.closest('table');
            const colIdx = Array.from(th.parentNode.cells).indexOf(th);
            return Array.from(table.querySelectorAll('tbody tr'))
                .filter((r) => r.cells[colIdx]
                    && r.cells[colIdx].querySelector('.mb-cell-collapse-toggle')).length;
        }, target.colName);

        expect(count, `${target.colName}: the count matches the cells that actually have a toggle`)
            .toBe(matching);
    });
});
