'use strict';

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage, MB_LIBRARY_PATH, USERSCRIPT_PATH } = require('../support/loadPage');
const { collectPageErrors } = require('../support/liveAssertions');

const IRO_URL = 'https://cdn.jsdelivr.net/npm/@jaames/iro@5';
const PAKO_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js';

// Same label from the bug report: a small ("distributor for" relationship,
// 68 rows) catalog that keeps this test fast, with a real mix of populated
// and empty "Relationships" cells (external links to Amazon/Discogs/etc. —
// only some releases have one) so the regression can't accidentally pass by
// coincidence (an all-empty or all-populated column wouldn't distinguish
// "correctly aligned" from "swapped but both columns happen to look right").
const LABEL_URL = 'https://musicbrainz.org/label/0b805b9c-ea03-4fc1-b50d-6dcef76433e0/relationships';
const SHOW_ALL_BUTTON = 'button[data-label="Show all Relationships for Label"]';
const SINGLE_TABLE_BTN = '#mb-stf-distributed_release-single-table-btn';

test('"Show single-table" snapshot keeps Release events/Relationships columns aligned', { tag: '@extended' }, async ({ page, context }) => {
    const pageErrors = collectPageErrors(page);

    await loadUserscriptPage(page, { url: LABEL_URL, testMode: true });

    const showAllBtn = page.locator(SHOW_ALL_BUTTON);
    await expect(showAllBtn).toBeVisible();
    await showAllBtn.click();
    await expect(page.locator('#mb-filter-container')).toBeVisible({ timeout: 90000 });

    // Sanity check on the SOURCE page before snapshotting it — confirms this
    // is genuinely the "Distributed release" category from the bug report,
    // with both injected columns present and correctly aligned there (the
    // bug is specific to the cross-tab snapshot round trip, not the source
    // render — see ShowAllEntityData_CHANGELOG.wip.json).
    const singleTableBtn = page.locator(SINGLE_TABLE_BTN);
    await expect(singleTableBtn).toBeVisible({ timeout: 15000 });
    const sourceHeaders = await page.locator('table.tbl thead tr:not(.mb-col-filter-row) th')
        .evaluateAll((ths) => ths.map((th) => th.dataset.colName || ''));
    expect(sourceHeaders).toContain('Release events');
    expect(sourceHeaders).toContain('Relationships');

    // Click "Show single-table" and capture the new tab it opens
    // (openSubtableAsSingleTableTab() → GM_setValue + window.open()).
    const [popup] = await Promise.all([
        context.waitForEvent('page'),
        singleTableBtn.click(),
    ]);
    const popupErrors = collectPageErrors(popup);

    // The popup is a real musicbrainz.org navigation (the `?link_type_id=1`
    // placeholder URL from openSubtableAsSingleTableTab — see its own
    // JSDoc), not a userscript-injected page yet: loadUserscriptPage()'s
    // GM stubs/testMode are registered on page.context() (see its own
    // JSDoc for why), so they already apply automatically to this new tab's
    // first navigation — only the script tags (iro/pako/library/userscript)
    // need injecting explicitly here, same as loadUserscriptPage() does for
    // the original page.
    await popup.waitForLoadState('networkidle', { timeout: 30000 });
    await popup.addScriptTag({ url: IRO_URL });
    await popup.addScriptTag({ url: PAKO_URL });
    await popup.addScriptTag({ path: MB_LIBRARY_PATH });
    await popup.addScriptTag({ path: USERSCRIPT_PATH });

    // Wait for the snapshot hydration + initReleaseEventsColumn()'s WS2
    // re-fetch (the "Release events" cell is deliberately excluded from the
    // snapshot payload and rebuilt fresh post-hydration — see
    // captureSubtableSnapshot()'s JSDoc) to fully settle: every mb-re-cell
    // ends up marked data-re-done="1" once _rePopulateCell() has run.
    await popup.waitForFunction(() => {
        const cells = document.querySelectorAll('table.tbl tbody td.mb-re-cell');
        return cells.length > 0 && Array.from(cells).every((c) => c.dataset.reDone === '1');
    }, { timeout: 30000 });

    const headers = await popup.locator('table.tbl thead tr:not(.mb-col-filter-row) th')
        .evaluateAll((ths) => ths.map((th) => th.dataset.colName || ''));
    const reIdx = headers.indexOf('Release events');
    const relIdx = headers.indexOf('Relationships');
    expect(reIdx).toBeGreaterThanOrEqual(0);
    expect(relIdx).toBeGreaterThanOrEqual(0);
    expect(reIdx).not.toBe(relIdx);

    const rowCount = await popup.locator('table.tbl tbody tr').count();
    expect(rowCount).toBeGreaterThan(0);

    // The actual regression assertion: every row's cell AT the "Release
    // events" header's position must itself be the Release-events cell
    // (class mb-re-cell), and likewise for "Relationships" (mb-rel-cell) —
    // not swapped. This is the exact bug reported: _ensureReCell() used to
    // append the rebuilt Release-events placeholder AFTER the already-
    // restored Relationships cell (which survives snapshot serialization
    // intact, unlike Release events — see captureSubtableSnapshot()'s row
    // filter), landing it one column out of step with the fixed
    // "Release events" -> "Relationships" header order.
    const cellClasses = await popup.locator('table.tbl tbody tr').evaluateAll(
        (rows, [reIdx, relIdx]) => rows.map((row) => ({
            re: row.cells[reIdx] ? row.cells[reIdx].className : null,
            rel: row.cells[relIdx] ? row.cells[relIdx].className : null,
        })),
        [reIdx, relIdx]
    );
    expect(cellClasses.length).toBe(rowCount);
    for (const { re, rel } of cellClasses) {
        expect(re).toMatch(/\bmb-re-cell\b/);
        expect(re).not.toMatch(/\bmb-rel-cell\b/);
        expect(rel).toMatch(/\bmb-rel-cell\b/);
        expect(rel).not.toMatch(/\bmb-re-cell\b/);
    }

    // At least one row's Release events cell must contain real
    // release-event-shaped content (a country flag/date <li>, not just an
    // empty placeholder) — proves the WS2 re-fetch genuinely populated real
    // data into the right slot, not just an empty <td> that happens to
    // carry the right class.
    const reListItemCount = await popup.locator(`table.tbl tbody tr td:nth-child(${reIdx + 1}) li.flag`).count();
    expect(reListItemCount).toBeGreaterThan(0);

    expect(pageErrors).toEqual([]);
    expect(popupErrors).toEqual([]);
});

test('"Show single-table" snapshot never double-populates a Relationships cell', { tag: '@extended' }, async ({ page, context }) => {
    const pageErrors = collectPageErrors(page);

    await loadUserscriptPage(page, { url: LABEL_URL, testMode: true });

    const showAllBtn = page.locator(SHOW_ALL_BUTTON);
    await expect(showAllBtn).toBeVisible();
    await showAllBtn.click();
    await expect(page.locator('#mb-filter-container')).toBeVisible({ timeout: 90000 });

    const singleTableBtn = page.locator(SINGLE_TABLE_BTN);
    await expect(singleTableBtn).toBeVisible({ timeout: 15000 });

    // Regression only reproduces while the SOURCE page's own Relationships
    // fetch (throttled ~1 req/s across every row) is still mid-flight —
    // confirm that's genuinely the case here (not yet all done), matching
    // the bug report's "not all rows have been fetched yet when I saved the
    // raw HTML" — otherwise this test would pass trivially regardless of
    // the fix.
    const stillFetchingOnSource = await page.locator('table.tbl tbody td.mb-rel-cell:not([data-rel-done="1"])').count();
    expect(stillFetchingOnSource).toBeGreaterThan(0);

    const [popup] = await Promise.all([
        context.waitForEvent('page'),
        singleTableBtn.click(),
    ]);
    const popupErrors = collectPageErrors(popup);

    await popup.waitForLoadState('networkidle', { timeout: 30000 });
    await popup.addScriptTag({ url: IRO_URL });
    await popup.addScriptTag({ url: PAKO_URL });
    await popup.addScriptTag({ path: MB_LIBRARY_PATH });
    await popup.addScriptTag({ path: USERSCRIPT_PATH });

    // Regression test for a real, confirmed-live bug: _hydrateAndRenderFromSnapshotData()'s
    // tail calls runFilter() (whose single-table branch internally re-invokes
    // initRelationshipsColumn() for any not-yet-done cell) and THEN calls
    // initRelationshipsColumn() again directly — two near-simultaneous,
    // overlapping invocations that both compute the identical not-done MBID
    // set and both append icons to the same cells, doubling every icon.
    // Wait for at least a few cells to be populated (no need for the full
    // ~1-req/s throttled queue to finish — the race, if present, shows up
    // in the FIRST cells populated) then assert none carry duplicate hrefs.
    await popup.waitForFunction(() => {
        return document.querySelectorAll('table.tbl tbody td.mb-rel-cell[data-rel-done="1"]').length >= 3;
    }, { timeout: 30000 });

    const relCells = await popup.locator('table.tbl tbody td.mb-rel-cell[data-rel-done="1"]').evaluateAll(
        (tds) => tds.map((td) => ({
            mbid: td.dataset.mbid,
            hrefs: Array.from(td.querySelectorAll('a')).map((a) => a.href),
        }))
    );
    expect(relCells.length).toBeGreaterThanOrEqual(3);
    for (const { mbid, hrefs } of relCells) {
        const uniqueHrefs = new Set(hrefs);
        expect(uniqueHrefs.size, `mbid ${mbid} has duplicate relationship icons: ${JSON.stringify(hrefs)}`).toBe(hrefs.length);
    }

    expect(pageErrors).toEqual([]);
    expect(popupErrors).toEqual([]);
});
