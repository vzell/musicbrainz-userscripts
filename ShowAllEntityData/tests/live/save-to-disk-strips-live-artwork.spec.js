'use strict';

const fs = require('fs');
const zlib = require('zlib');
const { test, expect } = require('../support/test');
const { loadUserscriptPageWithRealNetwork } = require('../support/realNetworkGmXhr');
const { loadFromDiskFixture } = require('../support/diskFixture');
const { collectPageErrors } = require('../support/liveAssertions');
const { waitForSortSettled, getPageRowCount, getSubTableRowCounts } = require('../support/filterSortAssertions');
const { authStorageState } = require('../support/authState');

/**
 * Enforces the Save-to-Disk contract that `_artMirrorIconToSourceRow()`
 * depends on: **a live `blob:` object URL must never reach a saved file.**
 *
 * ## Why this spec exists
 *
 * v9.99.1038 made CAA/EAA icons survive a re-render on `tableMode: 'multi'`
 * pages by mirroring a painted icon's `background-image` back onto the SOURCE
 * row, so `_stripTransientCellState(td, {preserveLiveArt: true})` finally has
 * something to preserve there. Save-to-Disk serialises those very same source
 * rows (`groupedRows[].rows`, via `_buildDiskCellData()` → `getCleanCellHtml()`),
 * so the mirror put live blob URLs directly into the save path's input for the
 * first time.
 *
 * `_artMirrorInlineThumbToSourceRow()` widened that exposure: it mirrors the
 * whole `.mb-caa-inline-ph` / `.mb-eaa-inline-ph` NODE onto the source row
 * (the placeholder is injected into live rows only, so there is nothing there
 * to copy a value onto), carrying both another `blob:` URL and a piece of
 * live-render DOM into the same save path. Step 3 below guards both.
 *
 * That is safe only because `getCleanCellHtml()` calls
 * `_stripTransientCellState()` WITHOUT `preserveLiveArt`, which blanks every
 * icon background unconditionally. Both the fix commit and
 * `_artMirrorIconToSourceRow()`'s own JSDoc assert this; nothing checked it.
 * `tests/fixtures/caa-icon-preserve.spec.js` states the consequence exactly —
 * "Preserving one there would write a guaranteed-dead reference into every
 * saved file" — but it drives `__saTest.stripTransientCellState()` on a live
 * cell, never the save path. Until this spec, no test anywhere gunzipped a
 * saved payload and looked inside it.
 *
 * A blob URL is alive only in the tab that minted it, so one written into a
 * saved file is dead on arrival: every affected cell would restore with a
 * broken background that no re-fetch path knows to repair.
 *
 * ## Why the control step is not optional
 *
 * If the mirror never ran, the source rows carry no artwork, the payload
 * trivially contains no `blob:`, and this spec passes while proving nothing —
 * the exact "reports plausible numbers while measuring nothing" failure
 * `ShowAllEntityData/CLAUDE.md`'s CAA/EAA testing rule exists to prevent.
 *
 * So the assertions run in a deliberate order:
 *
 *   1. Expand every sub-section and reveal the strips, settle the artwork,
 *      and assert something actually painted.
 *   2. **Control** — sort a sub-table and assert its rows arrive ALREADY
 *      PAINTED at insertion time. That can only happen if the mirror wrote
 *      live blob URLs onto the source rows, so it proves the payload about to
 *      be saved genuinely contains what the strip has to remove. This is the
 *      same guarantee `caa-icon-survives-sort-multi.spec.js` pins, re-derived
 *      here because it is this spec's non-vacuity precondition, not an
 *      incidental check.
 *   3. **Contract** — save, gunzip, and assert the JSON carries no `blob:`,
 *      no `data-caa-enriched` (the strip deletes that marker too, so its
 *      absence is free evidence the strip RAN, as opposed to the artwork
 *      simply never having been there), and no `mb-caa-inline-ph` /
 *      `mb-eaa-inline-ph` (the second artefact the mirrors put on the source
 *      rows — see the note on `_artMirrorInlineThumbToSourceRow()` below).
 *   4. **Round trip** — load the freshly-saved file back and assert it still
 *      renders every row, proving the stripping did not corrupt the payload.
 *
 * Remove step 2 and this passes for the wrong reason. Remove step 4 and it is
 * a save check rather than a round trip.
 *
 * Needs REAL CAA network access — `gmStubs.js`'s always-404
 * `GM_xmlhttpRequest` would leave every icon unpainted, making step 2
 * impossible and the whole spec vacuous.
 *
 * The two setup helpers below are adapted from
 * `caa-icon-survives-sort-multi.spec.js`, deliberately kept local rather than
 * extracted: that spec's versions carry measurement machinery (bigbox
 * observers, per-sub-table scoring, archive-request counting) this spec has no
 * use for. If a fourth artwork spec needs them, extract then.
 */

// The same small multi-table CAA pilot page as
// `caa-icon-survives-sort-multi.spec.js`, `subtable-filter-sort-caa-interaction.spec.js`
// and `releasegroup-releases-caa-type-comment-filter.spec.js`: "Tougher Than
// the Rest", 7 rows across 2 sub-tables (Official release 6, Promotion release
// 1), with real cover art on most rows. Small enough that a full artwork drain
// plus a save plus a reload fits comfortably in the @extended budget.
const RELEASE_GROUP_URL = 'https://musicbrainz.org/release-group/f83d2211-dd81-4b1e-9a02-e89733891e1c';
const SHOW_ALL_BUTTON = 'button[data-label="Show all Releases for ReleaseGroup"]';

// showSaveDialog()'s confirm button — the only place a browser download is
// ever triggered (it builds an <a download> on the blob URL and clicks it).
const SAVE_CONFIRM_BTN = '#sa-sd-save-confirm';

const SETTLE_MS = Number(process.env.SAVE_ART_SETTLE_MS || 180000);

/**
 * Expands every sub-section, whichever state the page starts in, and asserts
 * it worked.
 *
 * NOT `liveAssertions.js`'s `clickMasterToggleAndExpandAll()`, which asserts
 * `data-state="collapsed"` before clicking — true for `releasegroup-releases`
 * but not for every multi pageType. A collapsed sub-table is `display:none`,
 * so none of its artwork ever loads; clicking the toggle unconditionally is
 * worse than failing, because it would COLLAPSE an already-expanded page and
 * leave this spec measuring nothing.
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

    // `data-state="expanded"` does not guarantee every section is open — it has
    // been observed reading "expanded" while individual sub-tables were still
    // hidden. Force a full collapse→expand cycle rather than trust the flag.
    const hiddenCount = () => page.evaluate(() => Array.from(
        document.querySelectorAll('table.tbl')
    ).filter((t) => t.offsetParent === null).length);

    if (await hiddenCount() > 0) {
        await masterToggle.click();
        await expect(masterToggle).toHaveAttribute('data-state', 'collapsed');
        await masterToggle.click();
        await expect(masterToggle).toHaveAttribute('data-state', 'expanded');
    }

    const total = await page.locator('table.tbl').count();
    expect(total, 'no tables rendered').toBeGreaterThan(0);
    expect(await hiddenCount(), 'sub-tables are still collapsed — no artwork would load')
        .toBe(0);
}

/**
 * Polls the painted-artwork count until it stops changing.
 *
 * Deliberately does NOT use `waitForCaaEaaComplete()`: that waits on
 * `#mb-info-display-caa`, written from the CAA queue's `onIdle`, which does
 * not reliably fire on every page (see `caa-icon-survives-sort-multi.spec.js`'s
 * own note and `debug/NOTES.md`, 2026-08-29).
 *
 * **Never settles on zero.** A count of 0 means "the pass has not produced
 * anything yet", not "finished" — treating it as settled is how an artwork
 * probe reports success having measured nothing.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ timeoutMs?: number, pollMs?: number, stableFor?: number }} [opts]
 * @returns {Promise<{painted: number, stable: boolean, elapsedMs: number}>}
 */
async function waitForArtworkSettled(page, { timeoutMs = SETTLE_MS, pollMs = 3000, stableFor = 5 } = {}) {
    const started = Date.now();
    const read = () => page.evaluate(() => Array.from(
        document.querySelectorAll('table.tbl tbody span.caa-icon')
    ).filter((i) => /url\(/.test(i.style.backgroundImage || '')).length);

    let last = await read();
    let same = 0;
    while (Date.now() - started < timeoutMs) {
        await new Promise((r) => setTimeout(r, pollMs));
        const current = await read();
        if (current === last) {
            if (current > 0 && ++same >= stableFor) {
                return { painted: current, stable: true, elapsedMs: Date.now() - started };
            }
        } else {
            same = 0;
            console.log(`[save-probe] painting… ${current} icons at ${Math.round((Date.now() - started) / 1000)}s`);
        }
        last = current;
    }
    return { painted: last, stable: false, elapsedMs: Date.now() - started };
}

test.describe('Save to Disk strips live artwork', { tag: '@extended' }, () => {
    test('a saved multi-table payload carries no live blob: URL, and still round-trips', async ({ page, browser }, testInfo) => {
        // A real CAA queue drain, a sort, a synchronous serialize+gzip, and a
        // second page load — well past the 120 s project default.
        test.setTimeout(SETTLE_MS + 300000);

        const pageErrors = collectPageErrors(page);

        await loadUserscriptPageWithRealNetwork(page, { url: RELEASE_GROUP_URL, testMode: true });

        const showAllBtn = page.locator(SHOW_ALL_BUTTON);
        await expect(showAllBtn).toBeVisible();
        await showAllBtn.click();
        await expect(page.locator('#mb-filter-container')).toBeVisible({ timeout: 300000 });

        // ── 1. Make the artwork actually load ────────────────────────────────
        //
        // Both steps are load-bearing: sub-sections may render collapsed, and
        // `sa_caa_pics_initially_collapsed` defaults true, so the big-picture
        // strips start collapsed too.
        await ensureSubSectionsExpanded(page);
        const globalCaaBtn = page.locator('#mb-caa-toggle-btn-global');
        await expect(globalCaaBtn).toBeVisible({ timeout: 30000 });
        await globalCaaBtn.click();

        const settled = await waitForArtworkSettled(page);
        console.log('[save-probe] artwork settle: ' + JSON.stringify(settled));
        expect(settled.painted, 'no artwork painted at all — the save payload would be vacuously clean')
            .toBeGreaterThan(0);

        // What the live DOM holds right now. These are exactly the artefacts
        // the strip has to remove on the way to disk, so they double as the
        // "before" half of the contract assertion below.
        const live = await page.evaluate(() => ({
            paintedIcons: Array.from(document.querySelectorAll('table.tbl tbody span.caa-icon'))
                .filter((i) => /url\(/.test(i.style.backgroundImage || '')).length,
            enrichedAnchors: document.querySelectorAll(
                'table.tbl tbody a[data-caa-enriched], table.tbl tbody a[data-eaa-enriched]'
            ).length,
            inlineThumbs: document.querySelectorAll(
                'table.tbl tbody .mb-caa-inline-ph img[src^="blob:"]'
            ).length,
            tables: document.querySelectorAll('table.tbl').length,
        }));
        console.log('[save-probe] live DOM before save: ' + JSON.stringify(live));
        expect(live.tables, 'not a multi-table render').toBeGreaterThan(1);
        expect(live.enrichedAnchors, 'no CAA enrichment markers in the live DOM')
            .toBeGreaterThan(0);

        // ── 2. Control: prove the mirror wrote blob URLs onto the SOURCE rows ─
        //
        // The source rows are not reachable from the test, so this is measured
        // indirectly and exactly: sort a sub-table, and count how many icons
        // are ALREADY painted at the moment `runFilter()` inserts their row.
        // A re-rendered row can only arrive painted if `preserveLiveArt` found
        // a live background on the source row it was cloned from — which is
        // precisely what `_artMirrorIconToSourceRow()` puts there.
        await page.evaluate(() => {
            window.__saveProbe = { rowsInserted: 0, iconsSeen: 0, iconsPaintedAtInsert: 0 };
            const p = window.__saveProbe;
            const inspectRow = (tr) => {
                p.rowsInserted++;
                for (const i of tr.querySelectorAll('span.caa-icon, span.eaa-icon, span.artwork-icon')) {
                    p.iconsSeen++;
                    if (/url\(/.test(i.style.backgroundImage || '')) p.iconsPaintedAtInsert++;
                }
            };
            // Body-scoped and walking INTO added subtrees: renderGroupedTable()
            // replaces whole tables, so rows arrive as part of a subtree rather
            // than as their own mutation records.
            const obs = new MutationObserver((muts) => {
                for (const m of muts) {
                    for (const node of m.addedNodes) {
                        if (node.nodeType !== 1) continue;
                        if (node.tagName === 'TR') inspectRow(node);
                        else node.querySelectorAll('tr').forEach(inspectRow);
                    }
                }
            });
            obs.observe(document.body, { childList: true, subtree: true });
            window.__saveProbeObs = obs;
        });

        // Sort the sub-table carrying the most painted artwork — the one whose
        // rows have the most to lose on a re-render.
        const target = await page.evaluate(() => {
            let best = null;
            document.querySelectorAll('table.tbl').forEach((t) => {
                if (t.offsetParent === null) return;          // hidden: never loaded artwork
                let h3 = t.previousElementSibling;
                while (h3 && h3.tagName !== 'H3') h3 = h3.previousElementSibling;
                if (!h3) return;
                const painted = Array.from(t.querySelectorAll('tbody span.caa-icon'))
                    .filter((i) => /url\(/.test(i.style.backgroundImage || '')).length;
                // h3.textContent carries the whole per-section toolbar, so take
                // only the label ahead of the "(N)" row count.
                const label = (h3.textContent.trim().match(/^[^(]+/) || [''])[0]
                    .replace(/^[▶▼\s]+/, '').trim();
                if (!best || painted > best.painted) best = { heading: label, painted };
            });
            return best;
        });
        expect(target, 'no sub-table with an h3 heading was found').not.toBeNull();
        console.log(`[save-probe] sorting sub-table "${target.heading}" (${target.painted} painted icons)`);

        const targetH3 = page.locator('h3.mb-toggle-h3', { hasText: target.heading }).first();
        const ascendingBtn = targetH3.locator('xpath=following-sibling::table[1]')
            .locator('thead .sort-icon-btn', { hasText: '▲' }).first();
        // `subTableHeading` is NOT optional here: a multi-table sort writes its
        // status to that group's own `h3 .mb-sort-status`, never to the
        // page-wide `#mb-sort-status-display`, so omitting it waits out the
        // full timeout on a permanently-empty element (this spec did exactly
        // that on its first run).
        await waitForSortSettled(page, () => ascendingBtn.click(), {
            timeout: 120000,
            subTableHeading: target.heading,
        });

        const probe = await page.evaluate(() => {
            window.__saveProbeObs.disconnect();
            return window.__saveProbe;
        });
        console.log('[save-probe] insertion probe: ' + JSON.stringify(probe));

        expect(probe.rowsInserted, 'the sort re-inserted no rows — nothing was measured')
            .toBeGreaterThan(0);
        expect(
            probe.iconsPaintedAtInsert,
            'rows arrived unpainted — the source-row mirror is not running, so this payload ' +
            'would be vacuously blob-free and prove nothing'
        ).toBe(live.paintedIcons);

        // ── 3. The contract: save, and inspect the real payload ──────────────
        //
        // Same sequence `capture-fixture.js` uses to capture the committed
        // fixtures. The generous click timeout is not decoration:
        // saveTableDataToDisk() runs JSON.stringify + pako.gzip SYNCHRONOUSLY
        // inside this click's handler, blocking the renderer's main thread
        // before showSaveDialog() ever appears.
        await page.click('#mb-save-to-disk-btn', { timeout: 600000 });
        await page.locator(SAVE_CONFIRM_BTN).waitFor({ state: 'visible', timeout: 600000 });
        const downloadPromise = page.waitForEvent('download');
        await page.click(SAVE_CONFIRM_BTN);
        const download = await downloadPromise;

        // MUST keep the .gz suffix: both the load dialog's change handler and
        // loadTableDataFromDisk() decide gzip-vs-plain-JSON with
        // `file.name.endsWith('.gz')`, and `download.path()` hands back a
        // GUID-named temp file that would be read as plain JSON and fail.
        const savedPath = testInfo.outputPath('saved-with-artwork.json.gz');
        await download.saveAs(savedPath);

        const rawJson = zlib.gunzipSync(fs.readFileSync(savedPath)).toString('utf8');
        const parsed = JSON.parse(rawJson);
        console.log('[save-probe] saved payload: ' + JSON.stringify({
            bytesGz: fs.statSync(savedPath).size,
            bytesJson: rawJson.length,
            tableMode: parsed.tableMode,
            groups: parsed.groups ? parsed.groups.length : null,
            rowCount: parsed.rowCount,
        }));

        // Sanity: we saved the thing we think we saved. A single-table or empty
        // payload would make the assertions below meaningless.
        expect(parsed.tableMode, 'not a multi-table payload').toBe('multi');
        expect(parsed.groups && parsed.groups.length, 'no groups in the saved payload')
            .toBeGreaterThan(1);
        expect(parsed.rowCount, 'no rows in the saved payload').toBeGreaterThan(0);

        // THE contract. A blob: URL is alive only in the tab that minted it, so
        // one written here is a guaranteed-dead reference in every future load.
        const blobHits = (rawJson.match(/blob:/g) || []).length;
        expect(
            blobHits,
            `the saved payload contains ${blobHits} live blob: URL(s) — getCleanCellHtml() ` +
            'must strip artwork, never preserve it (see _stripTransientCellState\'s JSDoc)'
        ).toBe(0);

        // Free corroboration that the strip RAN, rather than the artwork never
        // having reached the source rows: _stripTransientCellState() deletes
        // these markers unconditionally, and the live DOM demonstrably has them.
        const enrichedHits = (rawJson.match(/data-caa-enriched|data-eaa-enriched/g) || []).length;
        expect(enrichedHits, 'CAA/EAA enrichment markers leaked into the saved payload')
            .toBe(0);

        // The inline-thumbnail placeholder is the SECOND artefact the mirrors
        // put on the source rows this payload is built from
        // (`_artMirrorInlineThumbToSourceRow()` clones the whole node across,
        // not just a value), so it needs its own guard rather than riding on
        // the blob: count. A placeholder whose image never resolved carries no
        // blob: URL at all and would slip past the check above while still
        // being live-render state that has no business in a saved file.
        const inlinePhHits = (rawJson.match(/mb-caa-inline-ph|mb-eaa-inline-ph/g) || []).length;
        expect(
            inlinePhHits,
            'inline-thumbnail placeholders leaked into the saved payload — ' +
            '_stripTransientCellState() must remove them when preserveLiveArt is off'
        ).toBe(0);

        // ── 4. Round trip: the stripped payload still loads ──────────────────
        //
        // A fresh CONTEXT, not just a fresh page: diskFixture.js's loader
        // registers its GM stubs on `page.context()`, so reusing this context
        // would stack a second copy on top of the real-network stubs installed
        // above. A separate context also gives the reload the plain always-404
        // GM_xmlhttpRequest, which is what we want — no artwork may come back
        // from the network, so anything rendered came out of the file.
        const ctx2 = await browser.newContext({ ...authStorageState({ label: 'save-to-disk round trip' }) });
        try {
            const page2 = await ctx2.newPage();
            const reloadErrors = collectPageErrors(page2);

            await loadFromDiskFixture(page2, {
                url: RELEASE_GROUP_URL,
                fixturePath: savedPath,
                testMode: true,
            });

            await expect(page2.locator('#mb-filter-container')).toBeVisible({ timeout: 60000 });

            expect(await getPageRowCount(page2)).toEqual({
                filtered: parsed.rowCount,
                total: parsed.rowCount,
                absolute: null,
            });
            expect(await getSubTableRowCounts(page2)).toEqual([
                { groupLabel: 'Official release', filtered: 6, total: 6 },
                { groupLabel: 'Promotion release', filtered: 1, total: 1 },
            ]);
            expect(await page2.locator('table.tbl tbody tr').count()).toBe(parsed.rowCount);

            // Nothing restored a dead reference: no icon may come back carrying
            // a background at all, since the payload has none to restore from.
            const restoredBlobBackgrounds = await page2.evaluate(() => Array.from(
                document.querySelectorAll('table.tbl tbody span.caa-icon')
            ).filter((i) => /blob:/.test(i.style.backgroundImage || '')).length);
            expect(restoredBlobBackgrounds, 'a dead blob: background was restored from disk')
                .toBe(0);

            expect(reloadErrors, 'uncaught page errors while loading the saved file').toEqual([]);
        } finally {
            await ctx2.close();
        }

        expect(pageErrors, 'uncaught page errors during the save').toEqual([]);
    });
});
