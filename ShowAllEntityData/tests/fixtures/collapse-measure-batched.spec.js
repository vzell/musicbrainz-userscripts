'use strict';

// initCollapsableColumns() measures all its columns in ONE read phase
// (PERFORMANCE.org Step 40). It used to measure column by column: every
// column's writes (toggles, hidden <li>s, clamp classes, header button,
// padding) came between one column's reads and the next column's, so every
// read batch forced a full layout of the table — up to two per collapsable
// column, about 330 ms per filter pass on the 4174-row artist-events page.
//
// ── The guarantees pinned ───────────────────────────────────────────────────
//
// 1. The reads come in at most TWO groups per call: the first-<li> widths and
//    the prose overflow, with no DOM write between the reads of one group. A
//    "group" is counted from inside the read methods: a read that finds the
//    table mutated since the previous read starts a new one
//    (MutationObserver.takeRecords(), which is synchronous). Premise: the
//    page really has several collapsable columns with something to measure,
//    so the per-column shape would have produced more groups.
// 2. The outcome is unchanged: the same cells get a toggle, the same columns
//    get a header button, and the same header min-widths — compared against
//    a second call, which must be idempotent, and against the counts the
//    table showed before.

const { test, expect } = require('../support/test');
const { loadFromDiskFixture } = require('../support/diskFixture');
const { waitForRenderComplete } = require('../support/browser');
// The committed 4174-row artist-events capture: five Location-derived
// collapsable columns with prose content, the page the 330 ms was measured on.
// (The small artist-events HTML fixtures have one such column only, which
// cannot tell one read group from one per column.)
const { URL: ARTIST_EVENTS_URL, FIXTURE_PATH } = require('../support/artistEventsFixture');

/**
 * What initCollapsableColumns() decided, in a comparable form.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{toggles: number, hdrBtns: string[], minWidths: string[]}>}
 */
const outcome = (page) => page.evaluate(() => {
    const t = document.querySelector('table.tbl');
    return {
        toggles: t.querySelectorAll('tbody .mb-cell-collapse-toggle').length,
        // Not the CAA/EAA columns' ▶N▤: the art code owns and rebuilds those
        // (_artEnsureColCollapseProxy()); this function's cleanup removes them
        // and a bare call — with no art init after it — leaves them gone.
        hdrBtns: Array.from(t.querySelectorAll('thead .mb-col-collapse-hdr-btn'))
            .map((b) => b.dataset.colIndex + '=' + (b.closest('th').dataset.colName || '?'))
            .filter((s) => !/=(CAA|EAA)$/.test(s)),
        minWidths: Array.from(t.querySelectorAll('thead tr:first-child th')).map((th) => th.dataset.mbCollapseMinPx || ''),
    };
});

test('initCollapsableColumns reads all columns in at most two groups, with the same outcome', async ({ page }) => {
    test.setTimeout(120000);
    await loadFromDiskFixture(page, { url: ARTIST_EVENTS_URL, fixturePath: FIXTURE_PATH, testMode: true });
    await waitForRenderComplete(page, { waitForAutoResize: false, timeout: 60000 });
    const before = await outcome(page);

    const rec = await page.evaluate(() => {
        const table = document.querySelector('table.tbl');
        const obs = new MutationObserver(() => {});
        obs.observe(table, { attributes: true, childList: true, subtree: true, characterData: true });
        const r = { groups: 0, reads: 0 };
        const mark = () => {
            r.reads++;
            if (obs.takeRecords().length > 0 || r.groups === 0) r.groups++;
        };
        const gbcr = Element.prototype.getBoundingClientRect;
        Element.prototype.getBoundingClientRect = function () { if (table.contains(this)) mark(); return gbcr.call(this); };
        const sh = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight');
        Object.defineProperty(Element.prototype, 'scrollHeight', {
            configurable: true, get() { if (table.contains(this)) mark(); return sh.get.call(this); },
        });
        try {
            obs.takeRecords();
            window.__saTest.collapse.init(0);
        } finally {
            Element.prototype.getBoundingClientRect = gbcr;
            Object.defineProperty(Element.prototype, 'scrollHeight', sh);
            obs.disconnect();
        }
        return r;
    });
    const after = await outcome(page);

    // Premise: there was work for several columns — the per-column shape
    // would have read in at least one group per such column.
    expect(rec.reads, 'premise: cells were measured').toBeGreaterThan(5);
    const measuredCols = await page.evaluate(() => new Set(
        Array.from(document.querySelectorAll('table.tbl tbody td'))
            .filter((td) => td.querySelector(':scope > .mb-text-clamp-marker') || td.querySelector('.mb-cell-collapse-toggle'))
            .map((td) => td.cellIndex)).size);
    expect(measuredCols, 'premise: more than one collapsable column had something to measure').toBeGreaterThan(1);
    expect(rec.groups, `reads came in ${rec.groups} groups (${rec.reads} reads)`).toBeLessThanOrEqual(2);
    expect(after, 'the outcome is the same as the render\'s own pass').toEqual(before);
});
