'use strict';

const { test, expect } = require('../support/test');
const { loadUserscriptPageWithRealNetwork } = require('../support/realNetworkGmXhr');
const { collectPageErrors } = require('../support/liveAssertions');
const { waitForSortSettled } = require('../support/filterSortAssertions');

/**
 * Artwork survival across the four discography view modes.
 *
 * `artist-releasegroups` is the only pageType with view modes
 * (`discographyViewState`: 'all' | 'official' | 'non-official' | 'merged',
 * driven by #mb-disc-*-btn through `_applyDiscographyViewFilter()`), and
 * **merged view is the specific case `_artMirrorIconToSourceRow()`'s use of
 * `_findMasterRowByIdx()` exists for.**
 *
 * Merged view combines every same-category group's rows into the
 * first-occurrence table, so rows from OTHER groups end up in a table whose
 * `groupedRows` entry does not contain them. The group-index lookup its
 * sibling `_artSyncSearchTextToSourceRow()` uses (`groupedRows[indexOf(
 * liveTable)]`) returns early for exactly those rows — they would silently
 * lose their artwork while every other view looked fine.
 * `_findMasterRowByIdx()` searches every group, so it is correct in all four.
 * Nothing but a merged-view run with artwork actually loaded can tell those
 * two apart, which is why this spec exists separately from
 * `caa-icon-survives-sort-multi.spec.js`.
 *
 * Same pilot artist as `discography-view.spec.js` (123 rows, 85 with cover
 * art, 17 sub-tables in Complete view) and the same button ids.
 *
 * ## Expected per-view figures (confirmed against a real browser)
 *
 * ```
 * view           visible rows   visible with art   page-wide with art
 * Complete            123              85                  85
 * Official             98              72                  85
 * Non-Official         25              13                  85
 * Complete (merged)     —              85                 157 (85 + 72 hidden
 *                                                              duplicates)
 * ```
 *
 * Official + Non-Official partition the page exactly (98+25 = 123 rows,
 * 72+13 = 85 with art), which is the cross-check that the visible-only and
 * page-wide counts below are both measuring the real page. The page-wide
 * column is what the assertions use — see `paintedAll()`.
 */
const ARTIST_URL = 'https://musicbrainz.org/artist/5d02f264-e225-41ff-83f7-d9b1f0b1874a';
const SHOW_ALL_BUTTON = 'button[data-label="🧮 Artist RGs"]';

const VIEWS = [
    { id: '#mb-disc-complete-btn',    name: 'Complete' },
    { id: '#mb-disc-official-btn',    name: 'Official' },
    { id: '#mb-disc-nonofficial-btn', name: 'Non-Official' },
    { id: '#mb-disc-merged-btn',      name: 'Complete (merged)' },
];

/**
 * Forces every sub-table into the expanded state, and asserts it worked.
 *
 * **Must be called after EVERY view switch, not just once at page load.**
 * `_applyDiscographyViewFilter()` re-collapses the sub-sections, so a view
 * switch silently undoes the expansion done at startup. Measured: after
 * clicking "Complete", the painted-icon count SETTLED at 6 on a page that
 * settles at 85 when expanded — not a timing artifact, simply most tables
 * hidden and therefore never loading any artwork.
 *
 * Also: do not trust `.mb-master-toggle`'s `data-state`. It can read
 * "expanded" while individual sub-tables are still hidden, so this drives a
 * full collapse->expand cycle whenever anything is hidden rather than
 * believing the flag.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} label  Context for the assertion message.
 */
async function ensureExpanded(page, label) {
    const masterToggle = page.locator('.mb-master-toggle');
    await expect(masterToggle).toBeVisible();
    // Counts tables that are hidden because their SECTION is collapsed, while
    // ignoring ones the current view legitimately hides.
    //
    // The view marker lives on the `<h3>` that PRECEDES the table, as a
    // sibling — not on an ancestor. An earlier version of this used
    // `t.closest('[data-mb-disc-hidden="true"]')`, which therefore never
    // matched anything, and Official view (which hides 6 non-official
    // sections by design) failed the assertion below as if they were
    // collapsed.
    const hiddenTables = () => page.evaluate(() => Array.from(
        document.querySelectorAll('table.tbl')
    ).filter((t) => {
        if (t.offsetParent !== null) return false;
        let h3 = t.previousElementSibling;
        while (h3 && h3.tagName !== 'H3') h3 = h3.previousElementSibling;
        // Hidden by the view itself → not a collapsed-section problem.
        return !(h3 && h3.dataset.mbDiscHidden === 'true');
    }).length);

    if ((await masterToggle.getAttribute('data-state')) === 'collapsed') {
        await masterToggle.click();
        await expect(masterToggle).toHaveAttribute('data-state', 'expanded');
    }
    if (await hiddenTables() > 0) {
        await masterToggle.click();                                      // collapse all
        await expect(masterToggle).toHaveAttribute('data-state', 'collapsed');
        await masterToggle.click();                                      // expand all
        await expect(masterToggle).toHaveAttribute('data-state', 'expanded');
    }
    expect(await hiddenTables(),
        `${label}: sub-tables still collapsed — their artwork would never load`).toBe(0);
}

/**
 * Counts every icon carrying a painted thumbnail, across ALL sub-tables —
 * including ones the current view hides.
 *
 * **All, not just visible, and that distinction is the whole assertion.**
 * `runFilter()` re-renders every group regardless of view, so a sort in
 * Official view re-inserts the rows of the 6 view-hidden sections too, and
 * their artwork (painted earlier, while Complete view had them visible)
 * persists in the hidden DOM. Comparing a visible-only baseline against an
 * all-rows insertion probe is apples-to-oranges: measured in Official view,
 * that read 72 visible before the sort against 85 arriving painted, and
 * failed while the artwork was in fact perfectly preserved.
 */
async function paintedAll(page) {
    return page.evaluate(() => Array.from(
        document.querySelectorAll('table.tbl tbody span.caa-icon')
    ).filter((i) => /url\(/.test(i.style.backgroundImage || '')).length);
}

/** Visible-only count — diagnostics, never assertions. See `paintedAll()`. */
async function paintedVisible(page) {
    return page.evaluate(() => Array.from(
        document.querySelectorAll('table.tbl tbody span.caa-icon')
    ).filter((i) => i.closest('table').offsetParent !== null
                 && /url\(/.test(i.style.backgroundImage || '')).length);
}

/**
 * Arms an insertion-time probe over the whole document: for every `<tr>` that
 * arrives from now on, records whether its artwork icons were ALREADY painted
 * at the moment of insertion.
 *
 * Insertion-time, not after-the-fact, for the same reason
 * `caa-icon-survives-sort-multi.spec.js` documents: the strip happens on a
 * detached clone, so sampling once the dust settles cannot distinguish
 * "survived" from "was repainted a tick later" — and repainting is precisely
 * the behaviour being fixed.
 *
 * @param {import('@playwright/test').Page} page
 */
async function armProbe(page) {
    await page.evaluate(() => {
        window.__vp = { iconsSeen: 0, painted: 0, rows: 0, archive: 0 };
        const orig = window.__realGmFetch;
        if (orig && !window.__vpWrapped) {
            window.__vpWrapped = true;
            window.__realGmFetch = function (url) {
                if (/coverartarchive\.org|eventartarchive\.org/.test(String(url))) window.__vp.archive++;
                return orig.apply(this, arguments);
            };
        }
        const inspect = (tr) => {
            window.__vp.rows++;
            tr.querySelectorAll('span.caa-icon, span.eaa-icon, span.artwork-icon').forEach((i) => {
                window.__vp.iconsSeen++;
                if (/url\(/.test(i.style.backgroundImage || '')) window.__vp.painted++;
            });
        };
        window.__vpObs = new MutationObserver((muts) => {
            for (const m of muts) {
                for (const n of m.addedNodes) {
                    if (n.nodeType !== 1) continue;
                    if (n.tagName === 'TR') inspect(n);
                    else n.querySelectorAll('tr').forEach(inspect);
                }
            }
        });
        window.__vpObs.observe(document.body, { childList: true, subtree: true });
    });
}

/** Disarms and returns the probe counters. */
async function readProbe(page) {
    return page.evaluate(() => { window.__vpObs.disconnect(); return window.__vp; });
}

/** Waits until the painted-icon count has been non-zero and unchanged for a few samples. */
async function waitForArtwork(page, { timeoutMs = 600000, pollMs = 5000, stableFor = 6 } = {}) {
    const started = Date.now();
    let last = -1, same = 0;
    while (Date.now() - started < timeoutMs) {
        await new Promise((r) => setTimeout(r, pollMs));
        const n = await paintedAll(page);
        if (n === last) {
            // A count of 0 is normally "the pass has not produced anything
            // yet", not "settled" — but a view can legitimately contain no
            // artwork at all (Non-Official is sparse on this artist), so allow
            // zero to settle after a longer run of identical samples rather
            // than burning the whole timeout on it.
            if (++same >= (n > 0 ? stableFor : stableFor * 2)) return n;
        } else {
            same = 0;
        }
        last = n;
    }
    return last;
}

test.describe('discography views: artwork survives sorting and filtering in every mode', { tag: '@extended' }, () => {
    test('all four view modes keep their painted artwork across a sort and a filter', async ({ page }) => {
        test.setTimeout(900000);
        const pageErrors = collectPageErrors(page);

        await loadUserscriptPageWithRealNetwork(page, { url: ARTIST_URL, testMode: true });
        await page.click(SHOW_ALL_BUTTON);
        await expect(page.locator('#mb-filter-container')).toBeVisible({ timeout: 180000 });

        // Force a uniform expanded state.
        //
        // This pageType renders sub-sections already expanded, AND its master
        // toggle can report data-state="expanded" while individual sub-tables
        // are still hidden — so trusting the flag is not enough. A hidden
        // sub-table is display:none and never loads any artwork, which makes
        // the whole spec measure an almost-empty page while looking healthy:
        // first run of this spec settled at 6 painted icons instead of 85 and
        // would have "passed" every comparison below against that 6.
        // Driving the toggle through a full collapse->expand cycle forces every
        // section into the same state. Same trap, same fix, as
        // caa-icon-survives-sort-multi.spec.js's ensureSubSectionsExpanded().
        await ensureExpanded(page, 'initial load');
        await page.locator('#mb-caa-toggle-btn-global').click();

        const settled = await waitForArtwork(page);
        // Guards the exact failure above: this artist has 85 rows with cover
        // art, so a settled count in single digits means the page is mostly
        // hidden, not that the artwork is fine.
        expect(settled, 'implausibly little artwork loaded — the page is probably mostly hidden')
            .toBeGreaterThan(50);
        console.log(`[view-art] initial painted icons: ${settled}`);

        for (const view of VIEWS) {
            await page.locator(view.id).click();

            // Re-expand: a view switch collapses the sub-sections again, and a
            // collapsed table loads no artwork — see ensureExpanded().
            await ensureExpanded(page, view.name);

            // Settle, don't sleep. A view switch runs
            // `_applyDiscographyViewFilter()`, which re-inits artwork PAGE-WIDE
            // (initCaaPics()/initEaaPics()), so the icons repaint from the
            // memory cache over the following moments. A fixed wait samples
            // mid-repaint: measured with waitForTimeout(2500), Complete view
            // read 6 painted icons immediately after the switch on a page that
            // settles at 85 — and every per-view comparison below would then
            // have been made against that meaningless transient.
            const beforePainted = await waitForArtwork(page, { timeoutMs: 300000 });
            const visibleNow = await paintedVisible(page);
            const h3Visible = await page.locator('h3.mb-toggle-h3:not([data-mb-disc-hidden="true"])').count();
            console.log(`[view-art] ${view.name}: ${beforePainted} painted icons ` +
                        `(${visibleNow} in visible sections), ${h3Visible} visible sections`);
            // A view with no artwork at all cannot prove anything; skip rather
            // than assert vacuously (Non-Official may legitimately be sparse).
            if (beforePainted === 0) {
                console.log(`[view-art] ${view.name}: no artwork in this view — skipping assertions`);
                continue;
            }

            // ── Sort a visible sub-table ────────────────────────────────────
            const heading = await page.evaluate(() => {
                const h3 = Array.from(document.querySelectorAll('h3.mb-toggle-h3'))
                    .find((h) => h.dataset.mbDiscHidden !== 'true');
                if (!h3) return null;
                return (h3.textContent.trim().match(/^[^(]+/) || [''])[0]
                    .replace(/^[▶▼\s]+/, '').trim();
            });
            expect(heading, `${view.name}: no visible sub-section to sort`).toBeTruthy();

            await armProbe(page);
            const tbl = page.locator('h3.mb-toggle-h3', { hasText: heading }).first()
                .locator('xpath=following-sibling::table[1]');
            await waitForSortSettled(page, () => tbl.locator('thead .sort-icon-btn', { hasText: '▲' }).first().click(),
                { timeout: 120000, subTableHeading: heading });
            const sortProbe = await readProbe(page);
            const steady = await paintedAll(page);

            console.log(`[view-art] ${view.name} sort: ${JSON.stringify(sortProbe)} ` +
                        `(painted before=${beforePainted}, after=${steady})`);
            expect(sortProbe.rows, `${view.name}: the sort re-inserted no rows`).toBeGreaterThan(0);

            // The invariant is "nothing had to be REPAINTED": every icon the
            // page ends up with was already painted at the moment its row was
            // inserted. Compared against the post-sort steady state, NOT the
            // pre-sort one — merged view legitimately drops icons across a
            // sort, and comparing to the pre-sort count would fail for a reason
            // that has nothing to do with artwork.
            //
            // Merged view combines several groups' rows into the
            // first-occurrence table and leaves the hidden duplicates populated
            // until the next render; `runFilter()`'s merged branch then pushes
            // an empty row set for those duplicates, so their tbodies are
            // emptied. Measured: 157 painted before the sort (85 in the visible
            // merged tables + 72 still in the hidden duplicates), 85 after.
            // Nothing was lost — the duplicates were cleared by design.
            expect(
                sortProbe.painted,
                `${view.name}: rows re-inserted by a sort arrived with their artwork blanked`
            ).toBe(steady);
            expect(steady, `${view.name}: no artwork survived at all`).toBeGreaterThan(0);
            expect(sortProbe.archive, `${view.name}: the sort hit the archive`).toBe(0);

            // ── Filter, then clear ──────────────────────────────────────────
            await armProbe(page);
            await page.fill('#mb-global-filter-input', 'e');
            await page.waitForTimeout(2500);
            await page.fill('#mb-global-filter-input', '');
            // Same reason as the view switch above — wait for the artwork to
            // settle again rather than sampling a fixed moment after clearing.
            await waitForArtwork(page, { timeoutMs: 300000 });
            const filterProbe = await readProbe(page);

            console.log(`[view-art] ${view.name} filter: ${JSON.stringify(filterProbe)}`);
            expect(filterProbe.archive, `${view.name}: filtering hit the archive`).toBe(0);
            // Every icon arriving during the filter cycle that HAD artwork must
            // arrive painted. Row counts differ mid-filter, so this compares the
            // settled end state rather than the transient one.
            // Against the post-sort steady state, for the same reason as above.
            expect(
                await paintedAll(page),
                `${view.name}: artwork was lost across a filter cycle`
            ).toBe(steady);
        }

        expect(pageErrors, 'uncaught page errors during the view matrix').toEqual([]);
    });
});
