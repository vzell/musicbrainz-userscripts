'use strict';

const { test, expect } = require('../support/test');
const { loadUserscriptPageWithRealNetwork } = require('../support/realNetworkGmXhr');
const { collectPageErrors } = require('../support/liveAssertions');
const { waitForCaaEaaComplete } = require('../support/asyncCompletion');
const { waitForSortSettled, getPageRowCount } = require('../support/filterSortAssertions');

/**
 * End-to-end guard for the CAA icon column surviving a sort on a
 * `tableMode: 'single'` page.
 *
 * Sorting is not a DOM reorder — the sort-icon handler sorts the row array
 * and then re-enters `runFilter()`, which re-clones every row and runs
 * `_stripTransientCellState()` over each clone. That helper used to blank
 * every artwork icon's `background-image` unconditionally, so the whole CAA
 * column went empty on each sort and then refilled one image at a time.
 * Nothing was actually re-fetched (every image came straight back out of the
 * Tier-1 `_artIdbMemCache`), but it read as a full reload.
 *
 * **How this is measured.** The blanking happens on a DETACHED clone, in the
 * window between `cloneNode(true)` and insertion, so a MutationObserver
 * watching the table subtree can never observe it — by the time a row is in
 * the document the queue may already have repainted it. Sampling "is it
 * painted?" after the sort settles is likewise racy for the same reason.
 * Instead this probes each row AT INSERTION, synchronously inside the
 * observer callback: with the fix, rows arrive already carrying their
 * thumbnails; without it, every row arrives blank and is repainted
 * asynchronously afterwards. That distinction is the whole bug.
 *
 * Needs REAL CAA network access — `gmStubs.js`'s always-404
 * `GM_xmlhttpRequest` would leave every icon unpainted, making the
 * assertion vacuously true (nothing painted can't be blanked). Uses
 * `realNetworkGmXhr.js`'s passthrough, as
 * `subtable-filter-sort-caa-interaction.spec.js` does.
 *
 * ## Why BoDeans and not a large artist
 *
 * The bug reproduces at any row count, so this deliberately picks the
 * smallest artist-releases page that still has real cover art: BoDeans fits
 * on ONE native page, so there is no pagination to sit through and no
 * `stopAfterPages()` cutoff to tune. The same artist backs
 * `artist-releases-filter-sort.spec.js` (via its disk fixture), so its CAA
 * coverage is already known-good.
 *
 * A larger artist was tried first and rejected on evidence: on
 * `/artist/70248960-…/releases` (Bruce Springsteen) the live fetch did not
 * advance past its FIRST page within 200 s through this harness — the
 * `#mb-fetch-progress-fill` bar stayed at 0% and `#mb-fetch-progress-label`
 * stayed empty the whole time, so `stopAfterPages()` had nothing to wait on.
 * That is a property of the harness/page, not of this fix; anything wanting
 * a large-artist CAA baseline needs that investigated first.
 */

// BoDeans — a single-table pageType (artist-releases) with a real CAA column,
// per that pageDefinition's `caa` columnExtractor. One native page of rows.
const ARTIST_RELEASES_URL = 'https://musicbrainz.org/artist/84c38d3a-3400-4c28-b988-90558bb6fae0/releases';
const SHOW_ALL_BUTTON = 'button[data-label="🧮 Artist releases"]';
const SORT_COLUMN = 'Date';

/**
 * Installs a `childList` observer that records, for every `<tr>` inserted
 * into the table from now on, whether its artwork icons were ALREADY
 * painted at the moment of insertion.
 *
 * @param {import('@playwright/test').Page} page
 */
async function installInsertionProbe(page) {
    await page.evaluate(() => {
        window.__artInsertProbe = {
            iconsSeen: 0, iconsPaintedAtInsert: 0, inlineThumbsAtInsert: 0,
            bigboxHourglasses: 0, bigboxImgsAdded: 0, archiveFetches: 0,
        };

        // Count every archive request the sort issues. These go out through
        // realNetworkGmXhr.js's `__realGmFetch` bridge rather than the browser's
        // own network stack, so page.on('request') cannot see them — wrapping
        // the bridge is the only way to observe them from here.
        const _origGmFetch = window.__realGmFetch;
        if (_origGmFetch) {
            window.__realGmFetch = function (url) {
                if (/coverartarchive\.org|eventartarchive\.org/.test(String(url))) {
                    window.__artInsertProbe.archiveFetches++;
                }
                return _origGmFetch.apply(this, arguments);
            };
        }

        const table = document.querySelector('table.tbl');

        // The big-picture strip lives OUTSIDE the table (inserted immediately
        // before it), so it needs its own observer. Unlike the rows, this strip
        // is legitimately rebuilt from scratch on every render — what matters is
        // whether each image comes back instantly from the session memory cache
        // or is parked behind a "⌛" while it waits for a _caaQueue slot.
        const boxes = document.querySelectorAll('.mb-caa-bigbox, .mb-eaa-bigbox');
        window.__artBigboxObs = [];
        boxes.forEach((box) => {
            const bobs = new MutationObserver((muts) => {
                for (const m of muts) {
                    for (const node of m.addedNodes) {
                        if (node.nodeType === Node.TEXT_NODE) {
                            if (node.textContent.includes('⌛')) {
                                window.__artInsertProbe.bigboxHourglasses++;
                            }
                            continue;
                        }
                        if (node.nodeType !== 1) continue;

                        window.__artInsertProbe.bigboxImgsAdded +=
                            node.tagName === 'IMG' ? 1 : node.querySelectorAll('img').length;

                        // The "⌛" is appended to the wrapper while it is still
                        // DETACHED, so it arrives as part of this subtree rather
                        // than as its own mutation record — counting only direct
                        // text-node additions misses every one of them (found by
                        // mutation-testing this probe: it passed against code
                        // that definitely produced hourglasses).
                        for (const child of node.childNodes) {
                            if (child.nodeType === Node.TEXT_NODE && child.textContent.includes('⌛')) {
                                window.__artInsertProbe.bigboxHourglasses++;
                            }
                        }
                    }
                }
            });
            bobs.observe(box, { childList: true, subtree: true });
            window.__artBigboxObs.push(bobs);
        });
        const obs = new MutationObserver((muts) => {
            for (const m of muts) {
                for (const node of m.addedNodes) {
                    if (node.nodeType !== 1 || node.tagName !== 'TR') continue;

                    // CAA/EAA column icon: thumbnail painted as a CSS background.
                    const icons = node.querySelectorAll('span.caa-icon, span.eaa-icon, span.artwork-icon');
                    for (const i of icons) {
                        window.__artInsertProbe.iconsSeen++;
                        if (/url\(/.test(i.style.backgroundImage || '')) {
                            window.__artInsertProbe.iconsPaintedAtInsert++;
                        }
                    }

                    // Inline thumbnails injected into the Release column
                    // (artist-releases declares addCAA: 'Release'). These are
                    // real <img> elements inside a placeholder span, so a
                    // surviving one still carries its blob: src on arrival.
                    window.__artInsertProbe.inlineThumbsAtInsert += node.querySelectorAll(
                        '.mb-caa-inline-ph img[src^="blob:"], .mb-eaa-inline-ph img[src^="blob:"]'
                    ).length;
                }
            }
        });
        obs.observe(table, { childList: true, subtree: true });
        window.__artInsertObs = obs;
    });
}

test.describe('CAA icon column survives a sort (single-table)', { tag: '@extended' }, () => {
    test('rows re-inserted by a sort arrive with their thumbnails already painted', async ({ page }) => {
        // Over the 120 s project default: a real CAA queue drain for every
        // rendered row has to finish before the sort can even be triggered.
        test.setTimeout(300000);

        const pageErrors = collectPageErrors(page);

        await loadUserscriptPageWithRealNetwork(page, { url: ARTIST_RELEASES_URL, testMode: true });

        const showAllBtn = page.locator(SHOW_ALL_BUTTON);
        await expect(showAllBtn).toBeVisible();
        await showAllBtn.click();

        await expect(page.locator('#mb-filter-container')).toBeVisible({ timeout: 120000 });
        await waitForCaaEaaComplete(page, { timeout: 180000 });

        // Baseline: how many icons are actually carrying a thumbnail right
        // now. NOT every row has one — a release with no cover art in the
        // archive keeps an empty .caa-icon forever, so "all icons painted"
        // is the wrong invariant (BoDeans: 56 icons, 36 of them painted).
        // What must hold is that whatever WAS painted survives the sort.
        //
        // Also guards against a vacuous pass: if nothing ever got painted (no
        // network, no artwork at all), the assertion below could not fail no
        // matter how the code behaved.
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
            bigboxLoaded: Array.from(document.querySelectorAll(
                '.mb-caa-bigbox img, .mb-eaa-bigbox img'
            )).filter((i) => i.style.display !== 'none').length,
        }));
        const paintedBefore = before.painted;
        expect(paintedBefore, 'no artwork was painted before the sort — the probe would be vacuous')
            .toBeGreaterThan(0);
        expect(before.inlineThumbs, 'no inline thumbnails loaded — that probe would be vacuous')
            .toBeGreaterThan(0);

        const rowsBefore = await getPageRowCount(page);

        // Clear the INITIAL load's completion toast before sorting. That one is
        // legitimate — the first pass really did fetch — and it lingers for
        // sa_caa_completion_toast_duration seconds, long enough to still be on
        // screen when the sort happens and be mistaken for a second one.
        const infoBefore = await page.evaluate(() => {
            document.getElementById('mb-caa-completion-toast')?.remove();
            return document.getElementById('mb-info-display-caa')?.textContent ?? '';
        });

        await installInsertionProbe(page);

        const columnTh = page.locator('table.tbl thead th', { hasText: SORT_COLUMN }).first();
        const ascendingBtn = columnTh.locator('.sort-icon-btn', { hasText: '▲' }).first();
        await waitForSortSettled(page, () => ascendingBtn.click(), { timeout: 60000 });

        const probe = await page.evaluate(() => {
            window.__artInsertObs.disconnect();
            (window.__artBigboxObs || []).forEach((o) => o.disconnect());
            return window.__artInsertProbe;
        });

        // The sort must actually have re-inserted rows, or there is nothing
        // to have measured.
        expect(probe.iconsSeen).toBeGreaterThan(0);

        // The fix. Before it this was 0 — every icon arrived blank and was
        // repainted afterwards, one queue task at a time.
        expect(probe.iconsPaintedAtInsert).toBe(paintedBefore);

        // Same story for the inline thumbnails in the Release column, which
        // were deleted outright by the strip and re-injected afterwards.
        // Before the fix this was 0.
        expect(probe.inlineThumbsAtInsert).toBe(before.inlineThumbs);

        // The big-picture strip IS rebuilt on a re-render — that part is by
        // design, since the strip must follow the table's new row order. What
        // must not happen is every one of its images dropping to a "⌛" and
        // trickling back a few at a time through the fetch queue. Each image
        // is already in the session memory cache, so it needs no queue slot and
        // no holding glyph.
        expect(probe.bigboxImgsAdded, 'the strip was not rebuilt — the hourglass probe would be vacuous')
            .toBeGreaterThan(0);

        // NO hourglass at all on a re-render — not even for the releases with
        // no cover art. Three separate facts have to hold for this:
        //
        //   1. an image already resolved in the session memory cache is painted
        //      at build time, so it never needs a holding glyph;
        //   2. an entity the archive reported as having NO artwork is skipped
        //      before a wrapper is built, because _artInitBigPics() now consults
        //      the same ctx.countCache that _artEnrichIcon() already populated;
        //   3. a URL that returned 404 is remembered in _artMissCache, covering
        //      the other shape — an entity that HAS images but no front cover,
        //      so its front-{size} URL 404s while its count is non-zero.
        //
        // History, since the expected value here has moved twice: it was every
        // wrapper (56) before any of this, then the art-less rows only (20)
        // once memory-cached images stopped queuing, and is 0 now that the two
        // negative-cache paths landed.
        const artlessRows = probe.iconsSeen - paintedBefore;
        expect(artlessRows, 'no art-less rows — this page would not exercise the negative caches')
            .toBeGreaterThan(0);
        expect(
            probe.bigboxHourglasses,
            `a re-render must show no hourglass at all: the ${paintedBefore} loaded image(s) ` +
            `come from memory, and the ${artlessRows} art-less row(s) are known-missing and skipped`
        ).toBe(0);

        // The direct form of the same claim: a sort must not talk to the
        // archive AT ALL. Every image is in memory, every absence is already
        // known, and the JSON metadata is served from ctx.countCache — so the
        // honest measure of "is this refetching?" is the number of archive
        // requests the sort issues, which is zero.
        expect(
            probe.archiveFetches,
            'a sort issued archive requests — something is still re-fetching'
        ).toBe(0);

        // ── The completion pass after a memory-only re-render ────────────────
        //
        // The post-sort pass rewrites #mb-info-display-caa with its own elapsed
        // time, so waiting for that text to change is a real signal that the
        // pass actually ran — rather than asserting "no toast" before the queue
        // had even drained, which would pass for the wrong reason.
        await page.waitForFunction(
            (prev) => (document.getElementById('mb-info-display-caa')?.textContent ?? '') !== prev,
            infoBefore,
            { timeout: 60000 }
        );

        // The status segment stays — it is the harness's completion signal and
        // must never depend on the toast.
        await expect(page.locator('#mb-info-display-caa')).toBeVisible();

        // ...but no toast, because this pass fetched nothing: every image came
        // straight back out of the Tier-1 session memory cache. Announcing
        // "All CAA/EAA artwork loaded" here was telling the user their artwork
        // had been re-downloaded when nothing left the machine.
        await expect(page.locator('#mb-caa-completion-toast')).toHaveCount(0);

        // Sorting must not have changed what is on the page.
        expect(await getPageRowCount(page)).toEqual(rowsBefore);
        expect(pageErrors).toEqual([]);
    });
});
