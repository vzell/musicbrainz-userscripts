'use strict';

const { test, expect } = require('../support/test');
const { loadUserscriptPageWithRealNetwork } = require('../support/realNetworkGmXhr');
const { collectPageErrors } = require('../support/liveAssertions');
const { waitForSortSettled } = require('../support/filterSortAssertions');

/**
 * The `tableMode: 'multi'` counterpart to `caa-icon-survives-sort.spec.js`.
 *
 * That spec pinned the single-table contract: a sort re-enters `runFilter()`,
 * which re-clones every row and runs `_stripTransientCellState()` over each
 * clone, and the `preserveLiveArt` option keeps the artwork alive across that
 * round trip. Only `runFilter()`'s SINGLE-table branch opts into that option;
 * the multi branch deliberately does not, because on a live-fetched multi page
 * the source rows in `groupedRows` never carry artwork in the first place
 * (since v9.99.960 even the first render inserts clones, so enrichment lands
 * on the rendered clone and never on the source row) — there is nothing there
 * for the strip to preserve.
 *
 * So this spec exists to measure what a multi page ACTUALLY does after the
 * artwork-preservation series, and to separate two things that look identical
 * from the user's chair:
 *
 *   1. **Fixed page-wide.** The big-picture stripe no longer empties to "⌛"
 *      and refills a few images at a time (memory-cached images are painted at
 *      build time), and artwork already known not to exist is not re-requested
 *      (`_artMissCache`). Neither of those is single-table-specific.
 *   2. **Now also fixed: the icon column.** `_artMirrorIconToSourceRow()`
 *      mirrors a painted icon's `background-image` onto the multi-table SOURCE
 *      row, so `preserveLiveArt` finally has something to preserve on this path
 *      and re-inserted rows arrive already painted.
 *   3. **Now also fixed: the inline thumbnails.**
 *      `_artMirrorInlineThumbToSourceRow()` mirrors the whole placeholder NODE
 *      (not just a value — `_artInitInlinePics()` injects it into live rows
 *      only, so the source row had no counterpart to copy onto) back to the
 *      source row, where `preserveLiveArt` keeps it and the re-inserted clone
 *      lands in `_artInitInlinePics()`'s Case C1: hover and bigbox tooltip
 *      re-wired, live image kept, nothing re-resolved.
 *   4. **Now also fixed: the render is scoped to the sorted sub-table.** A sort
 *      re-orders one group's rows, so `_renderDirtyGroupIdxs` lets
 *      `runFilter()` skip the clone/strip/highlight pass and
 *      `renderGroupedTable()` skip the tbody rebuild for every other group.
 *      Merged discography view is the carve-out — it renders a category from
 *      the union of every same-category group — so those co-contributors are
 *      re-rendered too.
 *
 * Everything above is asserted as a guarantee. The remaining `console.log`
 * lines are context for a future reader (which sub-table was chosen, how much
 * artwork it carried), not deferred work.
 *
 * ## Measured on this page (7 rows across 2 sub-tables, sorting the 6-row one)
 *
 * ```
 * bigboxHourglasses      0      guaranteed  — mutation-verified: forcing the
 *                                            glyph back on makes this 7 and
 *                                            the assertion fires
 * archiveFetches         0      guaranteed
 * completionToastReFired 0      guaranteed
 * iconsPaintedAtInsert   6      GUARANTEED  — == the SORTED sub-table's own
 *                                            painted count, not the page-wide
 *                                            one (the untouched sub-tables'
 *                                            rows are never re-inserted, so
 *                                            their artwork cannot show up in an
 *                                            insertion-time tally). Was 0
 *                                            before the icon mirror
 * inlineThumbsAtInsert   6      GUARANTEED  — same basis. Was 0 before the
 *                                            inline-thumbnail mirror
 * rowsInserted           6      GUARANTEED  — the sorted sub-table's rows ONLY.
 *                                            Was 7 (BOTH sub-tables) before the
 *                                            render scoping
 * tablesInserted         0      measured    — the <table> elements themselves
 * survivingTaggedTables  2/2                  are reused; only their rows are
 *                                            replaced
 * bigboxImgsAdded        7      measured    — the strip is rebuilt ONCE, one
 * bigboxWrappersAdded    7                    image per wrapper (see the
 *                                            box-scoped-observer note in
 *                                            installInsertionProbe())
 * ```
 *
 * Nothing on the multi path is left unfixed as of this revision: rows arrive
 * carrying both their icon and their inline thumbnail, and only the sorted
 * sub-table's rows are re-inserted at all.
 *
 * ## Measured at scale, via the overrides below
 *
 * ```
 * page                              rowsInserted   sort duration
 * releasegroup-releases, 124 rows        119        — (within noise: the
 *   / 3 sub-tables, sorting the 119-row             sorted table is already
 *                                                   119 of the 124 rows)
 * artist-releasegroups, 123 rows          61        83 ms, vs 114 ms with the
 *   / 17 sub-tables, sorting a 61-row               scoping switched off
 * ```
 *
 * The 17-section page is where the scoping is worth anything — see
 * `PERFORMANCE.org`'s Step 18 for the full 3-run A/B those figures come from.
 *
 * Needs REAL CAA network access, same rationale as the single-table spec:
 * `gmStubs.js`'s always-404 `GM_xmlhttpRequest` would leave every icon
 * unpainted, making the probe vacuous.
 */

// A release-group's releases page: tableMode 'multi', small, and with real
// cover art on nearly every row. Same page (and the same "expand everything,
// then reveal the strips" setup) as
// `subtable-filter-sort-caa-interaction.spec.js`, deliberately — it is the
// known-good small multi-table CAA fixture in this suite.
//
// ## Why not Bruce Springsteen's /relationships page
//
// That is the page the artwork reload was reported on, and it was tried
// first. It cannot be measured cold in a test-shaped window: it renders 24
// sub-tables carrying 418 synthetic CAA anchors (artist-relationships has no
// native `span.caa-icon` — the `caa` extractor's Path C fabricates them) plus
// 338 big-picture wrappers, i.e. ~750 artwork items. Measured here, the
// archive served 56 requests in the first ~45 s (~1.2/s, its rate limit), 50
// of them OK, with ZERO icons painted and ZERO stripe images loaded — the
// pass was still working through per-entity metadata JSON and had not reached
// a single image byte. An earlier run waited the full 300 s for
// `#mb-info-display-caa` and it never appeared, for the same reason: the
// queue had not drained, so `onIdle` had not fired.
//
// That is a page-size/rate-limit property, not a defect, and it is invisible
// in normal use because a real browser profile carries a warm IndexedDB cache
// from previous visits. A cold harness has none. Anything wanting that page
// as a baseline has to pre-warm the art cache first (see
// `capture-idb-fixture.js`) rather than fetch it inline.
const DEFAULT_RELEASE_GROUP_URL = 'https://musicbrainz.org/release-group/f83d2211-dd81-4b1e-9a02-e89733891e1c';

// Overridable so a bigger release group can be measured on demand without
// editing the spec — every release-group page is the same `releasegroup-releases`
// pageType, so only the URL changes. The default stays the small one: this
// spec runs in the @extended suite, where a multi-minute artwork drain would
// be a poor trade.
//
//   MULTI_CAA_URL=<multi-table page url> \
//   MULTI_CAA_BUTTON='<css selector for its "show all" button>' \
//   MULTI_CAA_SETTLE_MS=1500000 \
//   npx playwright test tests/live/caa-icon-survives-sort-multi.spec.js --project=chromium-live
const RELEASE_GROUP_URL = process.env.MULTI_CAA_URL || DEFAULT_RELEASE_GROUP_URL;
const SETTLE_MS = Number(process.env.MULTI_CAA_SETTLE_MS || 300000);
// Each multi-table pageType labels its own "show all" button, so measuring a
// different one needs the selector too, not just the URL: `releasegroup-releases`
// declares `label: 'Show all Releases for ReleaseGroup'`, while
// `artist-releasegroups` declares `mainLabel: '🧮 Artist RGs'`.
const SHOW_ALL_BUTTON = process.env.MULTI_CAA_BUTTON
    || 'button[data-label="Show all Releases for ReleaseGroup"]';

/**
 * Tags every currently-rendered sub-table so a rebuild is detectable
 * afterwards: `renderGroupedTable()` builds fresh `<table>` elements, so a
 * table that survived a sort untouched still carries its tag, while a
 * rebuilt one comes back without it.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<number>} How many tables were tagged.
 */
async function tagSubTables(page) {
    return page.evaluate(() => {
        const tables = document.querySelectorAll('table.tbl');
        tables.forEach((t, i) => { t.dataset.probeTag = String(i); });
        return tables.length;
    });
}

/**
 * Same insertion-time probe as the single-table spec, widened in two ways
 * that the multi shape forces:
 *
 *  - It observes `document.body`, not one `table.tbl`. `renderGroupedTable()`
 *    replaces whole tables, so an observer bound to a specific table stops
 *    seeing anything the moment that table is swapped out.
 *  - It walks INTO each added subtree for `<tr>`s. When a whole table is
 *    built detached and then inserted, the rows arrive as part of that
 *    subtree rather than as their own mutation records — the same trap the
 *    single-table spec's hourglass counter fell into.
 *
 * @param {import('@playwright/test').Page} page
 */
async function installInsertionProbe(page) {
    await page.evaluate(() => {
        window.__artInsertProbe = {
            iconsSeen: 0, iconsPaintedAtInsert: 0, inlineThumbsAtInsert: 0,
            bigboxHourglasses: 0, bigboxImgsAdded: 0, bigboxWrappersAdded: 0, archiveFetches: 0,
            rowsInserted: 0, tablesInserted: 0,
        };

        // Archive requests go out through realNetworkGmXhr.js's __realGmFetch
        // bridge, not the browser's network stack, so page.on('request')
        // cannot see them — wrapping the bridge is the only way.
        const _origGmFetch = window.__realGmFetch;
        if (_origGmFetch) {
            window.__realGmFetch = function (url) {
                if (/coverartarchive\.org|eventartarchive\.org/.test(String(url))) {
                    window.__artInsertProbe.archiveFetches++;
                }
                return _origGmFetch.apply(this, arguments);
            };
        }

        const p = window.__artInsertProbe;

        /**
         * Records one freshly-inserted row's artwork state.
         * @param {HTMLTableRowElement} tr
         */
        const inspectRow = (tr) => {
            p.rowsInserted++;
            const icons = tr.querySelectorAll('span.caa-icon, span.eaa-icon, span.artwork-icon');
            for (const i of icons) {
                p.iconsSeen++;
                if (/url\(/.test(i.style.backgroundImage || '')) p.iconsPaintedAtInsert++;
            }
            p.inlineThumbsAtInsert += tr.querySelectorAll(
                '.mb-caa-inline-ph img[src^="blob:"], .mb-eaa-inline-ph img[src^="blob:"]'
            ).length;
        };

        const obs = new MutationObserver((muts) => {
            for (const m of muts) {
                for (const node of m.addedNodes) {
                    if (node.nodeType === Node.TEXT_NODE) {
                        if (node.textContent.includes('⌛')) p.bigboxHourglasses++;
                        continue;
                    }
                    if (node.nodeType !== 1) continue;

                    if (node.matches('table.tbl')) p.tablesInserted++;
                    else p.tablesInserted += node.querySelectorAll('table.tbl').length;

                    if (node.tagName === 'TR') inspectRow(node);
                    else node.querySelectorAll('tr').forEach(inspectRow);

                }
            }
        });
        obs.observe(document.body, { childList: true, subtree: true });
        window.__artInsertObs = obs;

        // The big-picture strips get their OWN observers, bound to each box.
        //
        // **Not the body-scoped observer above, and this is not a style
        // preference.** Counting bigbox images from the body observer via
        // `node.closest('.mb-caa-bigbox')` double-counts, because a whole box
        // <div> is re-inserted during a multi-table render: that single
        // mutation record carries all the images the box ALREADY had, and
        // `querySelectorAll('img')` on it reports every one of them as newly
        // added. Measured on this page, that read 238 for a strip that
        // demonstrably built 119 images once — the DOM held exactly 119
        // afterwards, `_artInitPics` was entered once per context, and each
        // box was cleared exactly once. It produced a phantom "the stripe is
        // built twice on multi-table pages" finding that cost a full
        // investigation before the two observers were run side by side.
        // A box-scoped observer sees only what is appended INTO a box.
        window.__artBigboxObs = [];
        document.querySelectorAll('.mb-caa-bigbox, .mb-eaa-bigbox').forEach((box) => {
            const bobs = new MutationObserver((muts) => {
                for (const m of muts) {
                    for (const node of m.addedNodes) {
                        if (node.nodeType === Node.TEXT_NODE) {
                            if (node.textContent.includes('⌛')) p.bigboxHourglasses++;
                            continue;
                        }
                        if (node.nodeType !== 1) continue;
                        if (node.matches('a[data-caa-href], a[data-eaa-href]')) p.bigboxWrappersAdded++;
                        p.bigboxWrappersAdded += node.querySelectorAll('a[data-caa-href], a[data-eaa-href]').length;
                        p.bigboxImgsAdded += node.tagName === 'IMG' ? 1 : node.querySelectorAll('img').length;
                        // The "⌛" is appended to a still-detached wrapper, so
                        // it arrives inside an added subtree rather than as its
                        // own record.
                        for (const child of node.childNodes) {
                            if (child.nodeType === Node.TEXT_NODE && child.textContent.includes('⌛')) {
                                p.bigboxHourglasses++;
                            }
                        }
                    }
                }
            });
            bobs.observe(box, { childList: true, subtree: true });
            window.__artBigboxObs.push(bobs);
        });
    });
}

/**
 * Waits until the artwork pass stops changing anything, WITHOUT relying on
 * `waitForCaaEaaComplete()`.
 *
 * That helper waits for `#mb-info-display-caa` to become visible, which is
 * written by `_showCaaCompletionToast()` on the `_caaQueue`'s `onIdle`. On
 * this page that never happens: measured here, the span was still empty and
 * hidden after 300 s (529 polls) even though artwork was visibly painting
 * the whole time. That is the same "completion signal never fires" shape
 * `DEBUG-NOTES.md` recorded on 2026-08-29, and it is a property of the page,
 * not of the artwork-preservation work — so this probe measures the settled
 * state directly instead of waiting on a signal that will not arrive.
 *
 * Polls the loaded-artwork count and stops once it has been unchanged for
 * `stableFor` consecutive samples AND is non-zero.
 *
 * **The non-zero condition is load-bearing.** Without it this returned
 * `{artworkItems: 0, stable: true}` after 16 s on a large page — the artwork
 * pass was alive and working, but still grinding through per-entity metadata
 * JSON at the archive's ~1.2 req/s rate limit, so nothing had painted yet and
 * "unchanged" read as "finished". A count of zero is never evidence of a
 * settled pass; it is evidence the pass has not started producing yet.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ timeoutMs?: number, pollMs?: number, stableFor?: number }} [opts]
 * @returns {Promise<{artworkItems: number, samples: number, elapsedMs: number, stable: boolean}>}
 */
async function waitForArtworkSettled(page, { timeoutMs = SETTLE_MS, pollMs = 5000, stableFor = 6 } = {}) {
    const started = Date.now();
    const read = () => page.evaluate(() => {
        const painted = Array.from(document.querySelectorAll('table.tbl tbody span.caa-icon'))
            .filter((i) => /url\(/.test(i.style.backgroundImage || '')).length;
        const inline = document.querySelectorAll(
            'table.tbl tbody .mb-caa-inline-ph img[src^="blob:"], ' +
            'table.tbl tbody .mb-eaa-inline-ph img[src^="blob:"]'
        ).length;
        const big = document.querySelectorAll(
            '.mb-caa-bigbox img[data-art-big-loaded], .mb-eaa-bigbox img[data-art-big-loaded]'
        ).length;
        return painted + inline + big;
    });

    let last = await read();
    let same = 0;
    let samples = 1;
    while (Date.now() - started < timeoutMs) {
        await new Promise((r) => setTimeout(r, pollMs));
        const current = await read();
        samples++;
        if (current === last) {
            // Never settle on nothing — see this function's JSDoc.
            if (current > 0 && ++same >= stableFor) {
                return { artworkItems: current, samples, elapsedMs: Date.now() - started, stable: true };
            }
            // Heartbeat while the pass is still in its pre-paint phase, so a
            // long rate-limited run does not look like a hang.
            if (current === 0 && samples % 12 === 0) {
                console.log(`[multi-probe] still 0 artwork items at ${Math.round((Date.now() - started) / 1000)}s — pass has not reached image bytes yet`);
            }
        } else {
            same = 0;
            console.log(`[multi-probe] painting… ${current} artwork items at ${Math.round((Date.now() - started) / 1000)}s`);
        }
        last = current;
    }
    return { artworkItems: last, samples, elapsedMs: Date.now() - started, stable: false };
}

/**
 * Expands every sub-section, whichever state the page starts in.
 *
 * NOT `liveAssertions.js`'s `clickMasterToggleAndExpandAll()`, which asserts
 * `data-state="collapsed"` and then clicks. That holds for
 * `releasegroup-releases` but NOT for `artist-releasegroups`, which renders
 * its sub-sections ALREADY EXPANDED — measured here, the master toggle came up
 * `data-state="expanded"` / "Hide all sub-sections", and the shared helper
 * failed on its very first assertion. Clicking unconditionally would have been
 * worse than failing: it would have COLLAPSED all 17 sub-tables, and a
 * collapsed sub-table is `display:none`, so no artwork would ever load and the
 * probe would have measured nothing while looking like it worked.
 *
 * @param {import('@playwright/test').Page} page
 */
async function ensureSubSectionsExpanded(page) {
    const masterToggle = page.locator('.mb-master-toggle');
    await expect(masterToggle).toBeVisible();
    if ((await masterToggle.getAttribute('data-state')) === 'collapsed') {
        await masterToggle.click();
    }
    await expect(masterToggle).toHaveAttribute('data-state', 'expanded');

    // `data-state="expanded"` on the master toggle does NOT guarantee every
    // section is open: measured on artist-releasegroups, the toggle read
    // "expanded" while individual sub-tables were still hidden. When that
    // happens, drive the toggle through a full collapse->expand cycle, which
    // forces every section into the same state rather than trusting the flag.
    const hiddenCount = () => page.evaluate(() => Array.from(
        document.querySelectorAll('table.tbl')
    ).filter((t) => t.offsetParent === null).length);

    if (await hiddenCount() > 0) {
        await masterToggle.click();                                    // collapse all
        await expect(masterToggle).toHaveAttribute('data-state', 'collapsed');
        await masterToggle.click();                                    // expand all
        await expect(masterToggle).toHaveAttribute('data-state', 'expanded');
    }

    const total = await page.locator('table.tbl').count();
    const hidden = await hiddenCount();
    expect(total, 'no tables rendered').toBeGreaterThan(0);
    expect(total - hidden, 'every sub-table is hidden — nothing could load artwork').toBeGreaterThan(0);
    if (hidden > 0) {
        // Not fatal: a view mode may legitimately hide sections. Recorded so a
        // baseline is never silently taken over a mostly-hidden page.
        console.log(`[multi-probe] NOTE: ${hidden}/${total} sub-tables still hidden after expanding`);
    }
}

test.describe('CAA artwork across a sort (multi-table)', { tag: '@extended' }, () => {
    test('sorting one sub-table: what survives, what is rebuilt, and what is re-fetched', async ({ page }) => {
        // Well over the 120 s project default: a real CAA queue drain across
        // every sub-table has to finish before the sort can even be triggered,
        // and the archive serves roughly 1.2 requests/second. Budget the whole
        // settle window plus room for the render, the sort and the teardown.
        test.setTimeout(SETTLE_MS + 600000);

        const pageErrors = collectPageErrors(page);

        await loadUserscriptPageWithRealNetwork(page, { url: RELEASE_GROUP_URL, testMode: true });

        const showAllBtn = page.locator(SHOW_ALL_BUTTON);
        await expect(showAllBtn).toBeVisible();
        await showAllBtn.click();

        await expect(page.locator('#mb-filter-container')).toBeVisible({ timeout: 300000 });

        // Two steps that are NOT optional on a multi page, and whose absence
        // makes this probe silently measure nothing (measured: 0 painted
        // icons, settling in 16 s, as if artwork were switched off):
        //
        //  1. Sub-sections may render COLLAPSED. A collapsed sub-table is
        //     display:none, so none of its artwork ever loads.
        //  2. `sa_caa_pics_initially_collapsed` defaults to true, so the
        //     big-picture strips start collapsed too and need the global
        //     toggle — same step `subtable-filter-sort-caa-interaction.spec.js`
        //     takes for the same reason.
        await ensureSubSectionsExpanded(page);
        const globalCaaBtn = page.locator('#mb-caa-toggle-btn-global');
        await expect(globalCaaBtn).toBeVisible({ timeout: 30000 });
        await globalCaaBtn.click();

        const settled = await waitForArtworkSettled(page);
        console.log('[multi-probe] artwork settle: ' + JSON.stringify(settled));

        console.log('[multi-probe] dom census: ' + JSON.stringify(await page.evaluate(() => ({
            tables: document.querySelectorAll('table.tbl').length,
            tablesHidden: Array.from(document.querySelectorAll('table.tbl')).filter((t) => t.offsetParent === null).length,
            caaIcons: document.querySelectorAll('table.tbl span.caa-icon').length,
            inlinePh: document.querySelectorAll('table.tbl .mb-caa-inline-ph').length,
            bigboxes: document.querySelectorAll('.mb-caa-bigbox, .mb-eaa-bigbox').length,
            bigboxWrappers: document.querySelectorAll('.mb-caa-bigbox a[data-caa-href], .mb-eaa-bigbox a[data-eaa-href]').length,
            bigboxLoadedImgs: document.querySelectorAll('.mb-caa-bigbox img[data-art-big-loaded], .mb-eaa-bigbox img[data-art-big-loaded]').length,
        }))));

        // Baseline. As on the single-table page, NOT every icon carries a
        // thumbnail (a release with no cover art keeps an empty .caa-icon
        // forever), so the invariant is "whatever was painted must come back
        // painted", never "all of them".
        const before = await page.evaluate(() => ({
            painted: Array.from(document.querySelectorAll('table.tbl tbody span.caa-icon'))
                .filter((i) => /url\(/.test(i.style.backgroundImage || '')).length,
            inlineThumbs: document.querySelectorAll(
                'table.tbl tbody .mb-caa-inline-ph img[src^="blob:"], ' +
                'table.tbl tbody .mb-eaa-inline-ph img[src^="blob:"]'
            ).length,
            bigboxWrappers: document.querySelectorAll(
                '.mb-caa-bigbox a[data-caa-href], .mb-eaa-bigbox a[data-eaa-href]'
            ).length,
            bigboxLoaded: document.querySelectorAll(
                '.mb-caa-bigbox img[data-art-big-loaded], .mb-eaa-bigbox img[data-art-big-loaded]'
            ).length,
            tables: document.querySelectorAll('table.tbl').length,
        }));
        expect(
            before.painted + before.inlineThumbs + before.bigboxLoaded,
            'no artwork loaded at all before the sort — the probe would be vacuous'
        ).toBeGreaterThan(0);
        expect(before.tables, 'not a multi-table render — only one table on the page')
            .toBeGreaterThan(1);

        // Pick the sub-table carrying the most painted artwork, and sort THAT
        // one — the whole question is what happens to the others.
        const target = await page.evaluate(() => {
            let best = null;
            document.querySelectorAll('table.tbl').forEach((t) => {
                // A hidden sub-table never loaded artwork and cannot be clicked.
                if (t.offsetParent === null) return;
                const painted = Array.from(t.querySelectorAll('tbody span.caa-icon'))
                    .filter((i) => /url\(/.test(i.style.backgroundImage || '')).length;
                let h3 = t.previousElementSibling;
                while (h3 && h3.tagName !== 'H3') h3 = h3.previousElementSibling;
                if (!h3) return;
                const rows = t.querySelectorAll('tbody tr').length;
                // Per-sub-table baselines for the two artwork guarantees. They
                // have to be measured HERE rather than page-wide, because the
                // render is scoped: a sort re-inserts only this table's rows, so
                // artwork sitting in the untouched sub-tables is never re-inserted
                // and must not be counted as missing. Selectors are byte-identical
                // to `installInsertionProbe()`'s `inspectRow()`, so the two sides
                // of the comparison cannot drift.
                const paintedProbe = Array.from(t.querySelectorAll(
                    'tbody span.caa-icon, tbody span.eaa-icon, tbody span.artwork-icon'
                )).filter((i) => /url\(/.test(i.style.backgroundImage || '')).length;
                const inlineThumbs = t.querySelectorAll(
                    'tbody .mb-caa-inline-ph img[src^="blob:"], ' +
                    'tbody .mb-eaa-inline-ph img[src^="blob:"]'
                ).length;
                // Prefer the sub-table carrying the most painted artwork; fall
                // back to the biggest one when this page paints its artwork
                // into the stripe/inline thumbnails rather than a CAA column.
                const score = painted * 1000 + rows;
                if (!best || score > best.score) {
                    // h3.textContent carries the entire per-section toolbar
                    // (filter box, LRU list, every glyph), so take just the
                    // label ahead of the "(N)" row count.
                    const label = (h3.textContent.trim().match(/^[^(]+/) || [''])[0]
                        .replace(/^[\u25b6\u25bc\s]+/, '').trim();
                    best = { heading: label, painted, paintedProbe, inlineThumbs, rows, score };
                }
            });
            return best;
        });
        expect(target, 'no sub-table with an h3 heading was found').not.toBeNull();
        console.log(
            `[multi-probe] target sub-table: "${target.heading}" (${target.painted} painted icons, ` +
            `${target.inlineThumbs} inline thumbs, ${target.rows} rows) — page-wide: ` +
            `${before.painted} painted, ${before.inlineThumbs} inline thumbs`
        );

        const tagged = await tagSubTables(page);

        // Clear the INITIAL load's completion toast: it is legitimate (that
        // pass really did fetch) and lingers long enough to be mistaken for a
        // second one fired by the sort.
        await page.evaluate(() => document.getElementById('mb-caa-completion-toast')?.remove());

        await installInsertionProbe(page);

        const targetH3 = page.locator('h3.mb-toggle-h3', { hasText: target.heading }).first();
        const targetTable = targetH3.locator('xpath=following-sibling::table[1]');
        const ascendingBtn = targetTable.locator('thead .sort-icon-btn', { hasText: '▲' }).first();
        await waitForSortSettled(page, () => ascendingBtn.click(), {
            timeout: 120000,
            subTableHeading: target.heading,
        });

        const probe = await page.evaluate(() => {
            window.__artInsertObs.disconnect();
            (window.__artBigboxObs || []).forEach((o) => o.disconnect());
            return window.__artInsertProbe;
        });

        const after = await page.evaluate(() => ({
            survivingTagged: document.querySelectorAll('table.tbl[data-probe-tag]').length,
            tables: document.querySelectorAll('table.tbl').length,
            toast: document.getElementById('mb-caa-completion-toast') ? 1 : 0,
        }));

        // The script's own end-to-end sort timing, straight off the sub-table's
        // status span ("✓ Sorted by: 'Col'▲ (N rows in Xms)"). Logged, never
        // asserted — a live page's wall clock is far too noisy for a threshold —
        // but it is the number a perf comparison of the render scoping reads,
        // and having it here means such a comparison needs no throwaway script.
        const sortStatusText = await targetH3.locator('.mb-sort-status').textContent().catch(() => null);
        console.log(`[multi-probe] sort status: ${JSON.stringify(sortStatusText)}`);

        console.log('[multi-probe] ' + JSON.stringify({
            beforePainted: before.painted,
            beforeInlineThumbs: before.inlineThumbs,
            beforeTables: before.tables,
            taggedBeforeSort: tagged,
            ...probe,
            survivingTaggedTables: after.survivingTagged,
            tablesAfter: after.tables,
            completionToastReFired: after.toast,
        }, null, 2));

        // ---- Guarantees (page-wide fixes, not single-table-specific) ----

        // The strip is rebuilt on a re-render by design (it must follow the
        // new row order); what must not happen is every image dropping to a
        // "⌛" and trickling back through the fetch queue.
        expect(probe.bigboxHourglasses, 'the big-picture stripe emptied to hourglasses on a sort')
            .toBe(0);

        // Nothing may go back to the archive: every image is in the session
        // memory cache, and entities known to have no artwork are remembered
        // in _artMissCache.
        expect(probe.archiveFetches, 'the sort issued fresh cover-art-archive requests')
            .toBe(0);

        // The completion toast must not re-fire when the pass fetched nothing.
        expect(after.toast, 'the CAA completion toast re-fired on a sort that fetched nothing')
            .toBe(0);

        // ---- Measurements (documented, deliberately not guarantees) ----

        // `survivingTagged` measures <table> ELEMENT identity, not tbody
        // rebuilds, and has always been N/N: `renderGroupedTable()`'s reuse
        // branch keeps every <table>/<thead>/<h3> and replaces only rows. It
        // stays a measurement because it cannot distinguish the two states this
        // spec cares about — `rowsInserted` below is the signal that can.
        console.log(
            `[multi-probe] sub-tables surviving a sort of one of them: ` +
            `${after.survivingTagged}/${tagged}`
        );

        // ── The scoped-re-render guarantee ───────────────────────────────────
        //
        // Sorting one sub-table must re-insert only THAT sub-table's rows.
        // Before `_renderDirtyGroupIdxs` this was every row of every group —
        // 7 here, 124 on the 3-sub-table release group — to reorder one.
        //
        // Equality, not `toBeLessThan`: the sorted table must still be rebuilt
        // in full, so a change that skipped too much would fail just as loudly
        // as one that skips nothing.
        expect(
            probe.rowsInserted,
            'a sort re-inserted rows from sub-tables it did not touch — the render scoping is not working'
        ).toBe(target.rows);

        console.log(
            `[multi-probe] icons already painted at insertion: ` +
            `${probe.iconsPaintedAtInsert}/${probe.iconsSeen} ` +
            `(sorted sub-table held ${target.paintedProbe}; page-wide ${before.painted})`
        );

        // ── The icon mirror's guarantee ──────────────────────────────────────
        //
        // Every icon that was painted before the sort must come back painted at
        // INSERTION time, not repainted a tick later. NOT "all icons": a
        // release with no cover art keeps an empty .caa-icon forever, so the
        // invariant is "whatever was painted survives", the same one the
        // single-table spec pins.
        //
        // Was 0 before `_artMirrorIconToSourceRow()` — on the multi path the
        // source rows carried no artwork at all, so `preserveLiveArt` had
        // nothing to preserve and every row arrived blank.
        //
        // Compared against the SORTED sub-table's own count, not the page-wide
        // one: since the render scoping landed, the other sub-tables' rows are
        // never re-inserted, so their artwork cannot appear in an insertion-time
        // tally and page-wide would fail for the wrong reason.
        expect(
            probe.iconsPaintedAtInsert,
            'rows re-inserted by a sort lost their artwork icons — the source-row mirror is not working'
        ).toBe(target.paintedProbe);

        // ── The inline-thumbnail mirror's guarantee ──────────────────────────
        //
        // Same shape as the icon guarantee above, and the same reason it is
        // "whatever was showing survives" rather than "all cells": a release
        // with no cover art keeps an empty placeholder forever.
        //
        // Was 0 before `_artMirrorInlineThumbToSourceRow()`. The icon mirror
        // could not cover this: an icon is an element the source row already
        // owns, so painting it writes a VALUE that `cloneNode(true)` carries
        // through, whereas the inline placeholder is a NODE that only ever
        // existed on the live rows — it has to be constructed on the source
        // row, not copied.
        console.log(
            `[multi-probe] inline thumbs at insertion: ` +
            `${probe.inlineThumbsAtInsert}/${target.inlineThumbs} (sorted sub-table)`
        );
        expect(
            probe.inlineThumbsAtInsert,
            'rows re-inserted by a sort lost their inline thumbnails — the source-row placeholder mirror is not working'
        ).toBe(target.inlineThumbs);

        expect(pageErrors, 'uncaught page errors during the sort').toEqual([]);
    });
});
