'use strict';

// A column must never be draggable narrower than its own header content.
//
// ── The bug ─────────────────────────────────────────────────────────────────
//
// Reported as "resize a column to its minimum and the 📊 unique-values glyph is
// cut off a little bit on the right". Root cause, measured rather than guessed:
// `makeColumnsResizable()` computed the drag floor as
// `hdrFlex.scrollWidth + 8`, ONCE, at set-up time — and two things arrive after
// that moment:
//
//   - late-injected header controls: `.mb-rel-col-hdr-btn` (43 px),
//     `.mb-caa-col-hdr-btn` with its 16 px thumbnail (126 px on a real page),
//     `.mb-ms-col-hdr-btn`;
//   - the deferred header-count digits — `.mb-col-uniq-count` /
//     `.mb-col-collapse-count` are written by `_updateAllColHeaderCounts()`,
//     which is idle-scheduled and coalesced per table, so those spans are empty
//     when the floor is measured. Worth 4-6 px.
//
// So the floor was smaller than the header, the drag honoured it, and the
// rightmost control overflowed into the next column. Measured on a fresh render
// of the affected build: 6 of 21 columns; on the reported page
// (`debug/header-row-resize-bug.html`): 20 of 21, worst by 126 px.
//
// It was also wrong in the OTHER direction wherever the value got cached after
// auto-resize had widened a column — "Label" carried a floor of 765 px for a
// header needing 211, i.e. it could not be narrowed at all.
//
// ── What this spec pins, and why it is shaped this way ──────────────────────
//
// The assertion is `floor >= max-content width of the header`, per column,
// AFTER everything has settled. Deliberately NOT "the 📊 is visible after a
// drag": a drag test would pass as soon as the floor was merely *closer*, and
// would depend on pixel-level hit-testing of an 8 px grip. The floor is the
// actual contract, and it is the thing that was wrong.
//
// `max-content` is also how the fix measures, which would normally make this
// circular — so the expected value here is computed INDEPENDENTLY, by cloning
// the header into an off-layout shrink-to-fit box, rather than by calling the
// same code path.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { waitForColHeaderCountsStable } = require('../support/filterSortAssertions');

// series-releases: a single-table page that declares the Relationships column,
// so it exercises the biggest of the late-injected controls (`▶🔗`). The
// fixture defaults force CAA and Relationships OFF, which is exactly why the
// first attempt to reproduce this missed it — so the override is load-bearing,
// not incidental.
const SERIES_URL = 'https://musicbrainz.org/series/aa3694d3-a3d0-48ed-8f07-5b576de87908';
const SHELL = path.join(__dirname, '..', 'snapshots', 'series-releases', 'raw.html');

const WS2_BODY = JSON.stringify({
    relations: [{
        'target-type': 'url',
        type: 'discogs',
        url: { resource: 'https://www.discogs.com/release/1' },
    }],
});

/**
 * Every header's enforced drag floor beside the width its content really needs.
 *
 * `needed` is measured by cloning `.mb-col-hdr-flex` into an absolutely
 * positioned `width: max-content` box: that reports the intrinsic content width
 * regardless of how wide the column currently is, which is the property
 * `scrollWidth` lacks (on an element that fits, `scrollWidth` is `clientWidth`,
 * i.e. the current width).
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<{col: string, floor: number, needed: number}>>}
 */
const headerFloors = (page) => page.evaluate(() => {
    const thead = document.querySelector('table.tbl thead');
    const out = [];
    thead.querySelectorAll('tr:first-child th[data-mb-resize-min]').forEach((th) => {
        const flex = th.querySelector('.mb-col-hdr-flex');
        if (!flex) return;                       // Picard header has none
        const probe = document.createElement('div');
        probe.style.cssText =
            'position:absolute; left:-99999px; top:0; width:max-content; white-space:nowrap;';
        const clone = flex.cloneNode(true);
        clone.style.width = 'max-content';
        probe.appendChild(clone);
        thead.appendChild(probe);
        const needed = Math.ceil(clone.getBoundingClientRect().width);
        probe.remove();
        out.push({
            col: th.dataset.colName,
            floor: Number(th.dataset.mbResizeMin),
            needed,
            hasRelToggle: !!th.querySelector('.mb-rel-col-hdr-btn'),
        });
    });
    return out;
});

test('a column can never be dragged narrower than its own header', async ({ page }) => {
    await loadUserscriptPage(page, {
        url: SERIES_URL,
        fixtureFile: SHELL,
        testMode: true,
        settingsOverride: {
            sa_enable_relationships_column: true,
            sa_rel_collapse_threshold: 0,        // load it, so the ▶🔗 toggle is present
            sa_enable_column_resizing: true,
        },
    });
    await page.route('**/ws/2/**', (route) => route.fulfill({
        status: 200, contentType: 'application/json', body: WS2_BODY,
    }));
    await page.route('https://musicbrainz.org/series/**', (route) =>
        route.fulfill({ path: SHELL, contentType: 'text/html' }));

    await page.click('button[data-label="Show all Releases for Series"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });

    // The deferred header-count scan is the smaller half of the bug, so the
    // mousedown below has to happen after it has FULLY landed — and "fully"
    // is the operative word: that scan is sliced PER COLUMN and coalesced per
    // table, so columns finish at different times. An earlier version of this
    // waited only for the first count span to carry digits, passed standalone,
    // and failed under full-suite load with `Catalog#` 2 px short — its digits
    // arrived after the mousedown. Use the harness's own settle helper, which
    // waits for the whole set of count spans to stop changing.
    await waitForColHeaderCountsStable(page, { timeout: 60000 });

    // The floor is authoritative at mousedown — that is where the fix
    // re-measures — so fire one on every grip and read back what it committed.
    //
    // Dispatched directly on the element rather than driven through
    // `page.mouse`: the grip is an 8 px strip and a wide table scrolls most of
    // them out of the viewport, so real coordinates silently miss (they did on
    // the first attempt, and the test then "passed"/failed for the wrong
    // reason). This still runs the genuine handler. The matching mouseup keeps
    // each drag from leaving its document-level listeners armed.
    const dispatched = await page.evaluate(() => {
        const grips = Array.from(document.querySelectorAll(
            'table.tbl thead tr:first-child th .column-resizer'));
        grips.forEach((g) => {
            g.dispatchEvent(new MouseEvent('mousedown',
                { bubbles: true, cancelable: true, clientX: 0, clientY: 0 }));
            document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        });
        return grips.length;
    });
    expect(dispatched, 'no resize grips found — the premise is broken').toBeGreaterThan(5);

    const floors = await headerFloors(page);
    expect(floors.length).toBeGreaterThan(5);

    // The column carrying the ▶🔗 toggle is the discriminating one — it was
    // short by 43 px, the largest shortfall reproducible without live artwork.
    const rel = floors.find((f) => f.hasRelToggle);
    expect(rel, 'the Relationships header must be present and carry its toggle').toBeTruthy();
    expect(rel.floor,
        `${rel.col}: floor ${rel.floor} < needed ${rel.needed} — the ▶🔗 toggle is `
        + 'injected after makeColumnsResizable() runs').toBeGreaterThanOrEqual(rel.needed);

    // And no column anywhere may sit below its own content.
    const short = floors.filter((f) => f.floor < f.needed);
    expect(short,
        `columns whose drag floor is narrower than their header: `
        + JSON.stringify(short)).toEqual([]);
});
