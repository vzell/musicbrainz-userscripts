'use strict';

const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { seedGmValues } = require('../support/gmStubs');
const { injectThirdPartyScript } = require('../support/thirdPartyScripts');
const { collectPageErrors } = require('../support/liveAssertions');

// Same release-tracks pilot page used by third-party-title-mismatch.spec.js
// and third-party-rogue-filter-write.spec.js.
const RELEASE_URL = 'https://musicbrainz.org/release/1d404e1d-fcb6-3a52-b478-e706e893c897';
const SHOW_ALL_BUTTON = 'button[data-label="Show all Tracks for Release"]';

/**
 * Reads the current table's header row and returns { name -> columnIndex }.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object<string, number>>}
 */
async function getHeaderIndex(page) {
    return page.evaluate(() => {
        const ths = Array.from(document.querySelectorAll('table.tbl thead th'));
        const map = {};
        ths.forEach((th, i) => {
            const name = th.textContent.replace(/[⇅▲▼📊▶◀▤0-9⁰¹²³⁴⁵⁶⁷⁸⁹​]/g, '').trim();
            if (!(name in map)) map[name] = i;
        });
        return map;
    });
}

// Reported live bug: the "MB: Inline per-recording streaming & download
// links" userscript's own `<dl class="ar">` container isn't always a
// sibling of MusicBrainz's native `<div class="ars">` block (the shape
// every debug/*.html capture happens to show) — applyExtractTrackTitleData()'s
// own JSDoc already flags this as unfixed ("its exact nesting depth inside
// the Title cell isn't fixed by this script"). When `<dl class="ar">` is
// nested INSIDE `<div class="ars">` instead, the wholesale `while
// (_bareArsDiv.firstChild) …` move that builds the "ARs" column's `<td>`
// sweeps the still-intact `dl.ar` in with it — BEFORE
// `_buildStreamingDownloadsTd()` extracts just its `<strong>`/`<a>`
// grandchildren out into the real "Streaming/Downloads" column. The emptied
// `<dl class="ar">` shell (its own "▼ Streaming/Downloads:" label button,
// now with no content) is left stranded inside the "ARs" column's cell
// instead of being discarded, as the code's own comment assumes.
test('a nested (non-sibling) third-party dl.ar does not leak a "Streaming/Downloads:" remnant into the ARs column', { tag: '@extended' }, async ({ page }) => {
    const pageErrors = collectPageErrors(page);

    await seedGmValues(page, { sa_enable_release_tracks: true, sa_enable_ars_collapse: true });
    await loadUserscriptPage(page, { url: RELEASE_URL, testMode: true });

    // Simulate the third-party script BEFORE "Show all Tracks" runs — its
    // real effect is on the native page's own <div class="ars"> blocks,
    // which applyExtractTrackTitleData() reads once fetching starts.
    await injectThirdPartyScript(page, 'streaming-downloads-nested-in-ars', {
        config: { trackIndices: [0] },
    });

    const showAllBtn = page.locator(SHOW_ALL_BUTTON);
    await expect(showAllBtn).toBeVisible();
    await showAllBtn.click();
    await expect(page.locator('#mb-filter-container')).toBeVisible({ timeout: 90000 });

    const headerIndex = await getHeaderIndex(page);
    expect(headerIndex['ARs']).toBeGreaterThanOrEqual(0);
    expect(headerIndex['Streaming/Downloads']).toBeGreaterThanOrEqual(0);

    const readCells = () => page.evaluate(({ arsIdx, streamIdx }) => {
        const row = document.querySelector('table.tbl tbody tr');
        return {
            arsHTML: row.cells[arsIdx].innerHTML,
            streamHTML: row.cells[streamIdx].innerHTML,
        };
    }, { arsIdx: headerIndex['ARs'], streamIdx: headerIndex['Streaming/Downloads'] });

    const before = await readCells();

    // The real userscript's link data must still land correctly in its own
    // dedicated column — this bug is about a LEFTOVER shell, not broken
    // extraction.
    expect(before.streamHTML).toContain('open.spotify.com');

    // The bug: an emptied `<dl class="ar">` shell — its own toggle button +
    // "Streaming/Downloads:" label — must not be dragged into the "ARs"
    // column's cell. `'<dl class="ar">'` (exact, with the closing quote) is
    // unambiguous against MusicBrainz's own `<dl class="ars">` blocks.
    expect(before.arsHTML).not.toContain('<dl class="ar">');
    expect(before.arsHTML).not.toContain('Streaming/Downloads:');

    // Reported repro: filtering any column (e.g. "Compilation of") must not
    // newly reveal it either — the leaked node, once it exists, sits at the
    // tail of the "ARs" cell regardless of filter state.
    if (headerIndex['Compilation of'] !== undefined) {
        const input = page.locator(`.mb-col-filter-input[data-col-idx="${headerIndex['Compilation of']}"]`).first();
        await input.click();
        await input.type('part 1) by B', { delay: 20 });
        await page.waitForTimeout(1500);

        const after = await readCells();
        expect(after.arsHTML).not.toContain('<dl class="ar">');
        expect(after.arsHTML).not.toContain('Streaming/Downloads:');
    }

    expect(pageErrors).toEqual([]);
});
