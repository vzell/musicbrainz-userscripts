'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { waitForFilterSettled } = require('../support/filterSortAssertions');

// A pending-edits match used to be painted with the ordinary column-filter
// background. `highlightCrossTag()` descends to text nodes, so the span it
// builds wraps 100% of the entity's text INSIDE MusicBrainz's own
// `<span class="mp">` — which meant the orange "modification pending" fill,
// the one thing the filter had selected on, survived only in the padding and
// was effectively erased by pressing the button that found it.
//
// It is now RINGED instead: the highlight span carries a second, purely
// cosmetic class `mb-pending-edits-match` that turns the fill and the text
// colour off, and `table.tbl td span.mp:has(.mb-pending-edits-match)` draws an
// outline around the whole marker.
//
// What each test below pins, and why it is not the neighbouring property:
//
//   - The modifier is ADDITIONAL, never INSTEAD OF. If it ever replaced
//     `mb-column-filter-highlight`, the ring would still look right while
//     `_COLLAPSE_MATCH_SEL`, `testRowMatch()`'s reset and
//     `getCleanColumnText()`'s unwrap all silently stopped seeing the span.
//     Asserting the ring alone would pass throughout that.
//   - The ring is scoped to the PENDING-EDITS filters, not to "inside a
//     span.mp". A typed query that happens to match a pending entity must keep
//     its own fill, because there the colour is what says which filter matched.
//     The multi-table fixture is the sharpest guard on this: the same text
//     ("Bruce Springsteen") appears both wrapped and unwrapped in one column,
//     so a typed filter highlights both and neither may be ringed.
//
// Fixtures carry no MusicBrainz stylesheet, so `.mp` has no orange here — the
// same trap CLAUDE.md records for flag sprites. Nothing below asserts on the
// orange; it asserts on the three things this script actually controls (the
// classes, the suppressed fill, the outline).

// Single-table: artist-recordings, 4 of 5 rows pending. Rows A/B/D credit
// David Bowie, row C the Rolling Stones through a `.name-variation` wrapper,
// row E nothing. Row B is the joined "Queen & David Bowie" credit where only
// the Bowie half carries `.mp`.
const REC_URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/recordings';
const REC_FIXTURE = path.join(__dirname, 'uniq-drop-pending-edits.html');

// Multi-table: artist-releasegroups, three <h3> sub-tables. Album has 2 of 3
// rows pending, Single 1 of 2, Live 0 of 2 — and every Artist cell on the page
// reads "Bruce Springsteen" whether or not it is wrapped.
const RG_URL = 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f?all=1&va=0';
const RG_FIXTURE = path.join(__dirname, 'pending-edits-multi.html');

const GLOBAL_BTN = '#mb-pending-edits-btn';
const SUB_BTN = '.mb-subtable-pending-edits-btn';

// The four classes `_COLLAPSE_MATCH_SEL` is built from. Spelled out here on
// purpose: the point of the assertion that uses it is that the modifier did
// NOT have to be added to that list, so reading the list from the script would
// defeat it.
const COLLAPSE_MATCH_SEL =
    '.mb-global-filter-highlight, .mb-column-filter-highlight, ' +
    '.mb-pre-filter-highlight, .mb-subtable-filter-highlight';

const renderSingle = async (page, settingsOverride) => {
    await loadUserscriptPage(page, {
        url: REC_URL, fixtureFile: REC_FIXTURE, testMode: true,
        ...(settingsOverride ? { settingsOverride } : {}),
    });
    await page.route(`${REC_URL}?**`, (r) => r.fulfill({ path: REC_FIXTURE, contentType: 'text/html' }));
    await page.click('button[data-label="⊚ All recordings"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
};

const renderMulti = async (page, settingsOverride) => {
    await loadUserscriptPage(page, {
        url: RG_URL, fixtureFile: RG_FIXTURE, testMode: true,
        settingsOverride: {
            sa_enable_caa_pics: false, sa_enable_relationships_column: false,
            ...(settingsOverride || {}),
        },
    });
    await page.route(`${RG_URL}*`, (r) => r.fulfill({ path: RG_FIXTURE, contentType: 'text/html' }));
    await page.click('button[data-label="🧮 Artist RGs"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
};

/**
 * Every filter-highlight span currently in a rendered table, with the facts
 * that distinguish a ringed pending-edits match from an ordinary filled one.
 */
const highlightSpans = (page, collapseSel) => page.evaluate((sel) => {
    return Array.from(document.querySelectorAll('table.tbl tbody .mb-column-filter-highlight'))
        .filter((h) => h.closest('tr') && h.closest('tr').style.display !== 'none')
        .map((h) => {
            const mp = h.closest('span.mp');
            const cs = getComputedStyle(h);
            return {
                text: h.textContent.trim(),
                insideMp: !!mp,
                // The modifier must never displace the base class.
                hasBase: h.classList.contains('mb-column-filter-highlight'),
                hasModifier: h.classList.contains('mb-pending-edits-match'),
                // …and the span must still answer to _COLLAPSE_MATCH_SEL, or
                // the collapsed-cell tint goes dark without anything failing.
                matchesCollapseSel: h.matches(sel),
                bg: cs.backgroundColor,
                mpOutlineStyle: mp ? getComputedStyle(mp).outlineStyle : null,
                mpOutlineColor: mp ? getComputedStyle(mp).outlineColor : null,
                mpOutlineWidth: mp ? getComputedStyle(mp).outlineWidth : null,
            };
        });
}, collapseSel);

const TRANSPARENT = 'rgba(0, 0, 0, 0)';
// #cc0000, the schema default. Dark red rather than the yellow this shipped
// with first: MusicBrainz paints span.mp rgb(255, 221, 153), so a yellow ring
// scored 1.07:1 against it — computed and applied, and invisible. No fixture
// can catch that (none loads MusicBrainz's stylesheet, so .mp has no colour
// here at all); scripts/probe-pending-edits-ring.js is what measures it.
const RING = 'rgb(204, 0, 0)';
const COLUMN_FILL = 'rgb(173, 216, 230)';   // #add8e6, sa_column_filter_highlight_bg

/** Clicks one synthetic dropdown entry by its section label + entry label. */
const clickSynItem = (page, sectionLabel, itemLabel) => page.evaluate(([sec, lbl]) => {
    const sectionEl = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
        .find((s) => s.querySelector('.mb-uniq-section-label')?.textContent === sec);
    const item = Array.from(sectionEl.querySelectorAll('.mb-col-uniq-item'))
        .find((el) => el.dataset.mbUniqSynLabel === lbl);
    item.click();
}, [sectionLabel, itemLabel]);

const colIdxFor = (page, colName) => page.evaluate((name) =>
    Array.from(document.querySelectorAll('table.tbl thead th'))
        .findIndex((t) => (t.dataset.colName || '') === name), colName);

/** Types into one column's filter input, honouring the anti-autofill hardening. */
const typeColumnFilter = async (page, colName, text) => {
    const idx = await colIdxFor(page, colName);
    expect(idx, `column "${colName}" exists`).toBeGreaterThanOrEqual(0);
    const input = page.locator(`table.tbl thead .mb-col-filter-input[data-col-idx="${idx}"]`).first();
    // Readonly until a genuine trusted interaction — .click() lifts that, and
    // typing must go through .pressSequentially(), never .fill().
    await input.click();
    await waitForFilterSettled(page, () => input.pressSequentially(text));
};

test.describe('pending-edits match: ring, not fill', () => {
    test('the ⏳ toggle rings MusicBrainz\'s marker instead of painting over it', async ({ page }) => {
        await renderSingle(page);

        await page.click(GLOBAL_BTN);
        await page.waitForFunction(
            () => document.querySelectorAll('table.tbl tbody .mb-column-filter-highlight').length === 4,
            null, { timeout: 15000 });

        const spans = await highlightSpans(page, COLLAPSE_MATCH_SEL);
        expect(spans.map((s) => s.text)).toEqual([
            'David Bowie', 'David Bowie', 'The Rolling Stones', 'David Bowie',
        ]);

        for (const s of spans) {
            expect(s.insideMp, `"${s.text}" is inside MusicBrainz's own marker`).toBe(true);
            // Additional, never instead of — see this file's header.
            expect(s.hasBase, `"${s.text}" keeps mb-column-filter-highlight`).toBe(true);
            expect(s.hasModifier, `"${s.text}" carries the pending-edits modifier`).toBe(true);
            expect(s.matchesCollapseSel, `"${s.text}" still answers _COLLAPSE_MATCH_SEL`).toBe(true);
            // The fill is what used to erase the orange.
            expect(s.bg, `"${s.text}" paints no background`).toBe(TRANSPARENT);
            // …and the mark moved to the marker itself.
            expect(s.mpOutlineStyle).toBe('solid');
            expect(s.mpOutlineWidth).toBe('2px');
            expect(s.mpOutlineColor).toBe(RING);
        }
    });

    test('the ring colour comes from sa_pending_edits_match_outline', async ({ page }) => {
        // Pins the schema entry and its inline fallback to the CSS that reads
        // them. Without this, hard-coding the colour would pass every other
        // test in this file.
        await renderSingle(page, { sa_pending_edits_match_outline: '#ff00ff' });

        await page.click(GLOBAL_BTN);
        await page.waitForFunction(
            () => document.querySelectorAll('table.tbl tbody .mb-column-filter-highlight').length === 4,
            null, { timeout: 15000 });

        const spans = await highlightSpans(page, COLLAPSE_MATCH_SEL);
        expect(spans.length).toBe(4);
        for (const s of spans) expect(s.mpOutlineColor).toBe('rgb(255, 0, 255)');
    });

    test('a typed filter matching INSIDE a marker keeps its own fill', async ({ page }) => {
        // The scope decision, stated as a test: only the pending-edits filters
        // ring. For every other filter the highlight COLOUR is what says which
        // filter matched, and a ring has only one meaning — so a typed query
        // landing inside a span.mp must look exactly as it did before.
        await renderSingle(page);
        await typeColumnFilter(page, 'Artist', 'Bowie');

        const spans = await highlightSpans(page, COLLAPSE_MATCH_SEL);
        expect(spans.length).toBeGreaterThan(0);
        for (const s of spans) {
            expect(s.text).toBe('Bowie');
            expect(s.insideMp, 'this match really is inside a marker').toBe(true);
            expect(s.hasModifier, 'a typed match is not a pending-edits match').toBe(false);
            expect(s.bg, 'it keeps the column-filter fill').toBe(COLUMN_FILL);
            expect(s.mpOutlineStyle, 'and draws no ring').toBe('none');
        }
    });

    test('a typed filter matching OUTSIDE any marker is untouched', async ({ page }) => {
        await renderSingle(page);
        await typeColumnFilter(page, 'Release groups', 'Group');

        const spans = await highlightSpans(page, COLLAPSE_MATCH_SEL);
        expect(spans.length).toBeGreaterThan(0);
        for (const s of spans) {
            expect(s.insideMp).toBe(false);
            expect(s.hasModifier).toBe(false);
            expect(s.bg).toBe(COLUMN_FILL);
        }
    });

    test('the 📊 presence entry rings exactly what the toggle does', async ({ page }) => {
        await renderSingle(page);

        await page.evaluate(() => window.__saTest.getUniqDropSections('Artist'));
        await clickSynItem(page, 'Pending edits - Presence', '⏳ has pending edits');
        await page.waitForFunction(() => Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((r) => r.style.display !== 'none').length === 4, null, { timeout: 15000 });

        const spans = await highlightSpans(page, COLLAPSE_MATCH_SEL);
        expect(spans.length).toBe(4);
        for (const s of spans) {
            expect(s.hasModifier).toBe(true);
            expect(s.bg).toBe(TRANSPARENT);
            expect(s.mpOutlineColor).toBe(RING);
        }
    });

    test('a single 📊 "» pending edit:" entry rings only its own entity', async ({ page }) => {
        await renderSingle(page);

        await page.evaluate(() => window.__saTest.getUniqDropSections('Artist'));
        await clickSynItem(page, 'Pending edits - Entity', '» pending edit: David Bowie');
        await page.waitForFunction(() => Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((r) => r.style.display !== 'none').length === 3, null, { timeout: 15000 });

        const spans = await highlightSpans(page, COLLAPSE_MATCH_SEL);
        // Rows A, B and D — and row B is the joined "Queen & David Bowie"
        // credit, where Queen carries no marker and so is never marked.
        expect(spans.map((s) => s.text)).toEqual(['David Bowie', 'David Bowie', 'David Bowie']);
        for (const s of spans) {
            expect(s.hasModifier).toBe(true);
            expect(s.mpOutlineColor).toBe(RING);
        }

        // The unwrapped half of the joined credit is untouched: no span, and
        // therefore no ring anywhere near it.
        const queenMarked = await page.evaluate(() =>
            Array.from(document.querySelectorAll('table.tbl tbody td'))
                .some((td) => /Queen/.test(td.textContent) && td.querySelector('.mb-pending-edits-match') &&
                    /Queen/.test(td.querySelector('.mb-pending-edits-match').textContent)));
        expect(queenMarked).toBe(false);
    });

    test('releasing the toggle leaves no span and no orphan modifier', async ({ page }) => {
        await renderSingle(page);

        await page.click(GLOBAL_BTN);
        await page.waitForFunction(
            () => document.querySelectorAll('table.tbl tbody .mb-column-filter-highlight').length === 4,
            null, { timeout: 15000 });

        await page.click(GLOBAL_BTN);
        await page.waitForFunction(() => Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((r) => r.style.display !== 'none').length === 5, null, { timeout: 15000 });

        // testRowMatch()'s reset replaces the whole span with its text, so the
        // modifier cannot outlive it — including anywhere off the visible rows.
        const leftovers = await page.evaluate(() => ({
            spans: document.querySelectorAll('.mb-column-filter-highlight').length,
            orphans: document.querySelectorAll('.mb-pending-edits-match').length,
            ringed: document.querySelectorAll('span.mp:has(.mb-pending-edits-match)').length,
        }));
        expect(leftovers).toEqual({ spans: 0, orphans: 0, ringed: 0 });
    });
});

test.describe('pending-edits match: ring, not fill — multi-table', () => {
    test('a sub-table toggle rings only the wrapped credits in its own table', async ({ page }) => {
        // Every Artist cell on this page reads "Bruce Springsteen"; only some
        // are wrapped in a marker. So this is the one place where "ringed"
        // and "matched the text" cannot be confused for one another.
        await renderMulti(page);

        await page.click(`h3.mb-toggle-h3:has-text("Album") ${SUB_BTN}`);
        await page.waitForFunction(() => document.querySelectorAll('table.tbl')[0]
            .querySelectorAll('tbody tr:not(.mb-col-filter-row)').length === 2, null, { timeout: 15000 });

        const perTable = await page.evaluate(() =>
            Array.from(document.querySelectorAll('table.tbl'))
                .filter((t) => t.querySelector('.mb-col-filter-row'))
                .map((t) => ({
                    ringed: t.querySelectorAll('span.mp:has(.mb-pending-edits-match)').length,
                    filled: Array.from(t.querySelectorAll('.mb-column-filter-highlight'))
                        .filter((h) => !h.classList.contains('mb-pending-edits-match')).length,
                })));

        // Album's 2 pending rows are ringed; Single and Live are untouched,
        // and nothing anywhere is filled.
        expect(perTable).toEqual([
            { ringed: 2, filled: 0 },
            { ringed: 0, filled: 0 },
            { ringed: 0, filled: 0 },
        ]);
    });

    test('a typed filter over the same column rings nothing', async ({ page }) => {
        await renderMulti(page);
        await typeColumnFilter(page, 'Artist', 'Springsteen');

        const counts = await page.evaluate(() => ({
            highlights: document.querySelectorAll('table.tbl tbody .mb-column-filter-highlight').length,
            ringed: document.querySelectorAll('table.tbl tbody span.mp:has(.mb-pending-edits-match)').length,
        }));
        // Every row matches — wrapped and unwrapped alike — and none is ringed.
        expect(counts.highlights).toBeGreaterThan(0);
        expect(counts.ringed).toBe(0);
    });
});
