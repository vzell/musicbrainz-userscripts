'use strict';

const { test, expect } = require('../support/test');
const { loadUserscriptPageWithRealNetwork } = require('../support/realNetworkGmXhr');
const { collectPageErrors, clickMasterToggleAndExpandAll } = require('../support/liveAssertions');
const { waitForCaaEaaComplete } = require('../support/asyncCompletion');
const { getSubTableRowCounts } = require('../support/filterSortAssertions');

/**
 * Every entry the CAA column's 📊 unique-values dropdown offers must filter
 * to the row count its own badge advertises.
 *
 * ## The bug this reproduces
 *
 * Reported live on `releasegroup-releases` (`tableMode: 'multi'`): the CAA
 * dropdown listed entries with correct, non-zero counts, and clicking them
 * filtered NOTHING — every entry narrowed to zero rows. `✗ no artwork` was
 * the only one that worked. Typing the same text straight into the CAA
 * column's filter input worked (that path was fixed separately — see
 * `releasegroup-releases-caa-type-comment-filter.spec.js`).
 *
 * Root cause is a live-vs-source row asymmetry that only CAA/EAA columns hit:
 *
 *   - `openUniqDrop()` COLLECTS and COUNTS from the live `tbody` rows, which
 *     are fully art-enriched.
 *   - `runFilter()` decides which rows SURVIVE by calling `testRowMatch()`
 *     with `matchOnly` on the SOURCE rows in `groupedRows`. On
 *     `tableMode: 'multi'` pages those are permanently separate DOM elements
 *     that never receive the async artwork markup — no `ul.mb-caa-art-ul`, no
 *     `li.mb-caa-art-li-image`, no `.mb-caa-type-badge`, no
 *     `.mb-caa-art-comment`.
 *
 * Every matcher behind a CAA dropdown entry is a DOM query against exactly
 * that missing markup:
 *
 *   | Entry                     | Matcher                                        |
 *   |---------------------------|------------------------------------------------|
 *   | `✓ has artwork` (`any`)   | `_classifyCollapseCell` → `_findCellListItems`  |
 *   | `» image type: …`         | `.mb-caa-type-badge > span`                     |
 *   | `» image comment: …`      | `.mb-caa-art-comment`                           |
 *   | `▤` per-image item values | `_findCellListItems`                            |
 *
 * `✗ no artwork` (mode `empty`) worked only by accident: a row with no
 * artwork has neither a list NOR any synced search text, so "empty" is the
 * correct verdict on the source cell too. It is exercised like every other
 * entry whenever the panel offers it — on this particular page it never is,
 * because all 6 Official releases have cover art.
 *
 * Fixed by widening `_artSyncSearchTextToSourceRow()` to mirror the
 * structural facts (image-`<li>` count, per-`<li>` texts, distinct type
 * labels, distinct comments) alongside the flat search text it already
 * carried, and giving those three matchers a synced fallback via
 * `_findCellSyncedArtFacts()`.
 *
 * ## Why this page
 *
 * Reuses `releasegroup-releases-caa-type-comment-filter.spec.js`'s pilot page
 * verbatim — "Tougher Than the Rest" (7 rows: 6 Official + 1 Promotion),
 * whose ground truth is already documented there: exactly one row, the
 * cassette single, carries CAA images typed Front/Back/Spine with the comment
 * "cassette case". That single known-unique comment is the one hardcoded
 * anchor below; every other expectation is driven from the panel's own
 * reported counts, so real MusicBrainz edits can add or remove images
 * without making this spec wrong.
 *
 * Needs REAL CAA network access — the cover art has to actually be fetched
 * before any of these entries exist at all.
 */

const RELEASE_GROUP_URL = 'https://musicbrainz.org/release-group/f83d2211-dd81-4b1e-9a02-e89733891e1c';
const SHOW_ALL_BUTTON = 'button[data-label="Show all Releases for ReleaseGroup"]';
const OFFICIAL_GROUP_LABEL = 'Official release';
const OFFICIAL_TOTAL = 6;

// The one piece of hardcoded ground truth: only the cassette single carries
// this per-image comment, so selecting it must leave exactly one row.
const UNIQUE_COMMENT_LABEL = '» image comment: cassette case';

// The synBox sections holding CAA entries, by their `SYN_SECTION_META` labels.
// "Structure" also holds `✗ no artwork`, the one entry the bug spared.
const TARGET_SECTIONS = ['Structure', 'CAA info - Type', 'CAA info - Comment'];

const DROPDOWN = '#mb-col-uniq-dropdown';

/**
 * Waits until the multi-row artwork build stops adding anything to the CAA
 * column, then reports what it settled on.
 *
 * `waitForCaaEaaComplete()` alone is NOT enough here, and the difference cost
 * a wasted run: it resolves on the fetch pipeline's own completion toast,
 * which fires while per-cell `<ul>` building is still in flight. Reading the
 * panel at that moment produced a stale badge — "» image type: Front"
 * advertised 5 while the filter (correctly) matched all 6 — so the test
 * failed against a WORKING fix. Every number this spec compares comes from
 * the panel, so the panel has to be read from a settled page.
 *
 * Measures exactly what the dropdown counts (`.mb-caa-type-badge > span`
 * elements and the rows carrying them), not painted thumbnails — the badges
 * are built from the archive's metadata JSON and land well before the image
 * bytes do.
 *
 * Non-zero is load-bearing, for the same reason
 * `caa-icon-survives-sort-multi.spec.js`'s own settle probe documents: an
 * unchanged count of zero means the pass has not produced anything yet, not
 * that it has finished.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{timeoutMs?: number, pollMs?: number, stableFor?: number}} [opts]
 * @returns {Promise<{badges: number, rowsWithBadges: number, stable: boolean}>}
 */
async function waitForArtBadgesSettled(page, { timeoutMs = 90000, pollMs = 1000, stableFor = 5 } = {}) {
    const read = () =>
        page.evaluate(() => {
            const table = document.querySelectorAll('table.tbl')[0];
            if (!table || !table.tBodies[0]) return { badges: 0, rowsWithBadges: 0 };
            const badges = table.tBodies[0].querySelectorAll('.mb-caa-type-badge > span').length;
            const rowsWithBadges = Array.from(table.tBodies[0].rows).filter((r) =>
                r.querySelector('.mb-caa-type-badge')
            ).length;
            return { badges, rowsWithBadges };
        });

    const started = Date.now();
    let last = await read();
    let same = 0;
    while (Date.now() - started < timeoutMs) {
        await new Promise((r) => setTimeout(r, pollMs));
        const current = await read();
        if (current.badges === last.badges && current.rowsWithBadges === last.rowsWithBadges) {
            if (current.badges > 0 && ++same >= stableFor) return { ...current, stable: true };
        } else {
            same = 0;
        }
        last = current;
    }
    return { ...last, stable: false };
}

/**
 * Reads the "Official release" group's `(filtered of total)` badge.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{groupLabel: string, filtered: number, total: number}>}
 */
async function officialCounts(page) {
    const groups = await getSubTableRowCounts(page);
    const official = groups.find((g) => g.groupLabel === OFFICIAL_GROUP_LABEL);
    expect(official, `"${OFFICIAL_GROUP_LABEL}" sub-table must exist`).toBeTruthy();
    return official;
}

/**
 * Waits for the "Official release" group's filtered count to settle on
 * `expected`.
 *
 * The timeout is swallowed deliberately: the caller's own `expect` then
 * reports the ACTUAL (possibly bugged) count with a real diff, instead of a
 * bare `waitForFunction` timeout that says nothing about what happened.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} expected
 */
async function waitForOfficialFiltered(page, expected) {
    await page
        .waitForFunction(
            ({ label, want }) => {
                const h3 = Array.from(document.querySelectorAll('h3.mb-toggle-h3')).find((h) =>
                    h.textContent.includes(label)
                );
                const stat = h3 && h3.querySelector('.mb-row-count-stat');
                if (!stat) return false;
                const m = (stat.textContent || '').trim().match(/^\((\d+)/);
                return m !== null && Number(m[1]) === want;
            },
            { label: OFFICIAL_GROUP_LABEL, want: expected },
            { timeout: 15000 }
        )
        .catch(() => {});
}

/**
 * Checks one dropdown entry, asserts the "Official release" sub-table narrows
 * to exactly `expectedCount` rows, then unchecks it and asserts the table
 * widens back out — so the next entry is measured from a clean full-table
 * state instead of being ANDed on top of this one.
 *
 * The panel deliberately stays open across a click (multi-select), so the
 * locator stays valid between calls.
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} entry
 * @param {number} expectedCount
 * @param {string} what - Human-readable entry description, for failure output.
 */
async function assertEntryFiltersTo(page, entry, expectedCount, what) {
    await expect(entry, `${what} must be clickable in the open panel`).toHaveCount(1);

    await entry.click();
    await waitForOfficialFiltered(page, expectedCount);

    const after = await officialCounts(page);
    expect(after.total, 'filtering must never change the group total').toBe(OFFICIAL_TOTAL);
    expect(
        after.filtered,
        `${what} advertises ${expectedCount} row(s) — the filter must produce exactly that many`
    ).toBe(expectedCount);

    await entry.click();
    await waitForOfficialFiltered(page, OFFICIAL_TOTAL);
    expect((await officialCounts(page)).filtered, `unchecking ${what} must restore all rows`).toBe(OFFICIAL_TOTAL);
}

test('every CAA unique-values dropdown entry filters to its own badge count (live fetch)', { tag: '@extended' }, async ({ page }) => {
    test.setTimeout(180000);
    const pageErrors = collectPageErrors(page);

    await loadUserscriptPageWithRealNetwork(page, { url: RELEASE_GROUP_URL, testMode: true });

    const showAllBtn = page.locator(SHOW_ALL_BUTTON);
    await expect(showAllBtn).toBeVisible();
    await showAllBtn.click();
    await expect(page.locator('#mb-filter-container')).toBeVisible({ timeout: 90000 });

    // The archive has to be queried at all before any of these entries exist.
    // This is the fetch pipeline's own completion signal; it is necessary but
    // NOT sufficient — see waitForArtBadgesSettled() below.
    await waitForCaaEaaComplete(page, { timeout: 60000 });

    // `releasegroup-releases` renders its sub-sections COLLAPSED, and a
    // collapsed sub-table is `display:none` — its artwork never loads at all,
    // so a test that skipped this would measure almost nothing and still pass.
    // `clickMasterToggleAndExpandAll()` asserts the `collapsed` start state,
    // which is the correct one for this pageType.
    await clickMasterToggleAndExpandAll(page);

    // Every expectation below is read off the panel, so the panel must be read
    // from a settled page — see waitForArtBadgesSettled()'s own JSDoc.
    const settled = await waitForArtBadgesSettled(page);
    expect(settled.stable, `artwork type badges never settled: ${JSON.stringify(settled)}`).toBe(true);
    expect(settled.rowsWithBadges, 'all 6 Official releases have cover art').toBe(OFFICIAL_TOTAL);

    const before = await officialCounts(page);
    expect(before.total).toBe(OFFICIAL_TOTAL);
    expect(before.filtered).toBe(OFFICIAL_TOTAL);

    // Opens the panel on the first `table.tbl`'s CAA header — which on this
    // page is "Official release" — and reports its rendered synBox sections.
    // Reads live DOM, so these are the counts a person actually sees.
    const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('CAA'));
    expect(sections, 'a CAA column header must exist').not.toBeNull();

    const byLabel = new Map(sections.map((s) => [s.label, s.items]));

    // Guard against the whole test passing by finding nothing to exercise.
    const typeItems = byLabel.get('CAA info - Type') || [];
    const commentItems = byLabel.get('CAA info - Comment') || [];
    expect(typeItems.length, 'this page has Front/Back/Spine images').toBeGreaterThan(0);
    expect(
        commentItems.map((i) => i.label),
        'the hardcoded ground-truth anchor must still be offered'
    ).toContain(UNIQUE_COMMENT_LABEL);

    // ── Phase 1: the synBox sections (structure modes + arttype/artcomment) ──
    const exercised = [];
    for (const sectionLabel of TARGET_SECTIONS) {
        for (const item of byLabel.get(sectionLabel) || []) {
            expect(item.count, `${sectionLabel} / ${item.label} must carry a count badge`).not.toBeNull();
            await assertEntryFiltersTo(
                page,
                page.locator(`${DROPDOWN} .mb-col-uniq-item[data-mb-uniq-syn-label="${item.label}"]`),
                item.count,
                `"${item.label}" (${sectionLabel})`
            );
            exercised.push({ label: item.label, count: item.count });
        }
    }

    // Plausibility floor. Without it the loop above would pass on a page where
    // every entry happened to match all 6 rows (or where the panel rendered
    // nothing), proving nothing about the bug — the failure mode being guarded
    // is "narrows to 0 while advertising N".
    expect(exercised.length, 'at least the artwork-presence, type and comment entries').toBeGreaterThanOrEqual(4);
    expect(
        exercised.some((e) => e.count > 0 && e.count < OFFICIAL_TOTAL),
        `at least one entry must be genuinely discriminating (0 < count < ${OFFICIAL_TOTAL}); got ${JSON.stringify(exercised)}`
    ).toBe(true);

    // The hardcoded anchor: only the cassette single carries this comment.
    const commentAnchor = exercised.find((e) => e.label === UNIQUE_COMMENT_LABEL);
    expect(commentAnchor.count, 'exactly one release has the "cassette case" comment').toBe(1);

    // ── Phase 2: the "▤" per-image item entries ─────────────────────────────
    // These live in the plain value list BELOW the sections (so
    // `getUniqDropSections()` does not report them — its own JSDoc says so)
    // and are matched by `_findCellListItems()`, the same DOM query the
    // `✓ has artwork` structure mode uses. A CAA cell's image `<li>`s are a
    // qualifying list, so one entry is offered per distinct image text; every
    // one of them filtered to zero rows before the fix.
    const itemEntries = await page.evaluate((dropSel) => {
        const drop = document.querySelector(dropSel);
        if (!drop) return [];
        return Array.from(drop.querySelectorAll('.mb-col-uniq-item'))
            .filter((el) => el.querySelector('.mb-uniq-item-marker'))
            .map((el) => {
                const badge = el.querySelector('.mb-uniq-count-badge');
                const m = ((badge && badge.textContent) || '').match(/\((\d+)\)/);
                return { title: el.title, count: m ? Number(m[1]) : null };
            });
    }, DROPDOWN);

    expect(itemEntries.length, 'a CAA cell with images offers per-image "▤" item entries').toBeGreaterThan(0);

    // Exercise the most discriminating one available — a "▤" entry matching
    // all 6 rows could pass even while broken if the row set never narrowed.
    const discriminating = itemEntries
        .filter((e) => e.count !== null && e.count > 0)
        .sort((a, b) => a.count - b.count)[0];
    expect(discriminating, `no usable "▤" entry found; got ${JSON.stringify(itemEntries)}`).toBeTruthy();

    await assertEntryFiltersTo(
        page,
        page.locator(`${DROPDOWN} .mb-col-uniq-item[title="${discriminating.title}"]`),
        discriminating.count,
        `"▤ ${discriminating.title}" (per-image item entry)`
    );

    await page.evaluate(() => window.__saTest.closeUniqDrop());
    expect(pageErrors).toEqual([]);
});
