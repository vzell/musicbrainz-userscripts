'use strict';

// The 📊 artwork-summary button must stay in the run of artwork controls, on
// every render — not only on the one that created it.
//
// ── The defect ──────────────────────────────────────────────────────────────
//
// Reported live on https://musicbrainz.org/artist/84c38d3a-…/releases: after
// filtering from a 📊 column dropdown, the summary button jumped out of the
// control run and landed between the "Releases" heading text and the row-count
// stat. From the saved DOM (debug/bd-filter-relocation-bug.html), the h2 read:
//
//   [mb-toggle-icon] "Releases" [summary-0] [row-count-stat]
//   [caa-toggle-0] [caa-retry-0] [rel-retry-0] [mb-filter-container]
//
// The cause is an asymmetry, not a mystery. `_artCreateOrUpdateToggleButton()`
// re-derives its position from the LIVE row-count stat on every call —
//
//     const countStat = header.querySelector('.mb-row-count-stat');
//     if (countStat) countStat.after(btn);
//
// — and that stat is REMOVED AND RE-CREATED every time the count updates (see
// the `.mb-row-count-stat` insertion block: it re-anchors to the master toggle,
// or on a single-table page to the filter container). So the toggle, and the
// buttons chained off it, move with the stat. The summary button was created
// once, inside `_artCreateOrUpdateRetryButton()`'s "just created" branch, and
// never repositioned — so it stayed where the old stat used to be.
//
// ── What this pins ──────────────────────────────────────────────────────────
//
// Position is asserted as ORDER WITHIN THE HEADER, not as "the button exists":
// the button never disappeared, and an existence check would have passed
// throughout the bug. The control run must stay contiguous across a filter.
//
// Single-table by necessity. On a multi-table page the per-table controls live
// in an h3 that carries no row-count stat, so the stat's churn cannot reach
// them — which is why the 📊-panel spec (releasegroup-releases) never saw this.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadFromDiskFixture } = require('../support/diskFixture');
const { typeGlobalFilter } = require('../support/filterSortAssertions');

// The BoDeans page the bug was reported on: artist-releases, tableMode
// 'single', 56 rows, every one carrying a /cover-art anchor.
const FIXTURE = path.join(__dirname, 'saved-data', 'artist-releases-bodeans.json.gz');
const PAGE_URL = 'https://musicbrainz.org/artist/84c38d3a-3400-4c28-b988-90558bb6fae0/releases';

/** Ids of the artwork/relationship controls in the main h2, in document order. */
const headerOrder = (page) => page.evaluate(() => {
    const stat = document.querySelector('h2 .mb-row-count-stat');
    const h2 = stat ? stat.parentElement : document.querySelector('h2');
    if (!h2) return null;
    return Array.from(h2.children)
        .map((el) => el.id || (el.className && String(el.className).split(' ')[0]) || el.tagName)
        .filter((k) => /mb-caa-toggle-btn|mb-rel-retry|mb-row-count-stat/.test(k));
});

test.describe('artwork summary button: position survives a re-render', () => {
    test('it stays in the control run after the row-count stat is rebuilt',
        async ({ page }) => {
            test.setTimeout(120000);

            // No network: artwork metadata never resolves here, which is fine —
            // this is about where the BUTTON sits, not what it reports.
            await page.route('https://coverartarchive.org/**',
                (route) => route.fulfill({ status: 404, body: '' }));

            await loadFromDiskFixture(page, {
                url: PAGE_URL,
                fixturePath: FIXTURE,
                testMode: true,
                settingsOverride: {
                    sa_enable_caa_pics: true,
                    sa_enable_relationships_column: false,
                },
            });

            // The buttons are built on a 200 ms timer after the render.
            await expect.poll(() => page.locator('#mb-caa-toggle-btn-summary-0').count(),
                { timeout: 30000 }).toBe(1);

            const before = await headerOrder(page);
            expect(before, 'the header exposes the control run').not.toBeNull();
            expect(before, 'summary sits with the other artwork controls at first render')
                .toContain('mb-caa-toggle-btn-summary-0');

            const statAt = (arr) => arr.indexOf('mb-row-count-stat');
            const sumAt = (arr) => arr.indexOf('mb-caa-toggle-btn-summary-0');
            const toggleAt = (arr) => arr.indexOf('mb-caa-toggle-btn-0');
            expect(sumAt(before), 'summary starts after the stat, with the toggle')
                .toBeGreaterThan(statAt(before));

            // Any filter rewrites the count, which destroys and re-creates the
            // stat — the event the whole bug hangs on.
            // `page.fill()` is not actionable on this input after a disk load —
            // it carries a 🔍 focus prefix the script re-asserts, and the fill
            // waits forever. `typeGlobalFilter()` is the harness's own answer:
            // click, wait for the prefix to settle, then type.
            await typeGlobalFilter(page, 'Home');
            await page.waitForTimeout(2500);

            const after = await headerOrder(page);
            expect(statAt(after), 'the stat is still in the header').toBeGreaterThan(-1);
            expect(toggleAt(after), 'the toggle re-anchored after the stat, as it always does')
                .toBeGreaterThan(statAt(after));

            // THE assertion. Not "the button exists" — it never stopped
            // existing; it moved to the wrong side of the stat.
            expect(sumAt(after), 'the summary button must not be left behind the stat')
                .toBeGreaterThan(statAt(after));

            // And the run stays contiguous: nothing wedged between the controls.
            const controls = after.filter((k) => k !== 'mb-row-count-stat');
            const firstControl = after.indexOf(controls[0]);
            expect(after.slice(firstControl), 'the control run is unbroken')
                .toEqual(controls);
        });
});
