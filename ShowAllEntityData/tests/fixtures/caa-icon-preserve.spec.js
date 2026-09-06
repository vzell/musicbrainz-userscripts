'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');

// Host page shape only — see the fixture's own comment. The art cells under
// test are hidden and driven directly through __saTest.
const ARTIST_RECORDINGS_URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/recordings';
const FIXTURE_FILE = path.join(__dirname, 'caa-icon-preserve.html');

/**
 * Paints an art cell's icon with a background-image, mirroring what
 * `_onIconLoaded()` does on a real cache hit, then runs the real
 * `_stripTransientCellState()` over that cell and reports the result.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string}  selector - The art cell.
 * @param {string}  kind     - 'live' (registered object URL), 'dead'
 *   (a real object URL deliberately left unregistered) or 'http'.
 * @param {?Object} opts     - Forwarded to `_stripTransientCellState()`.
 */
async function paintAndStrip(page, selector, kind, opts) {
    return page.evaluate(([sel, k, o]) => {
        const url = k === 'http'
            ? 'https://coverartarchive.org/release/x/front-250'
            : window.__saTest.artMintBlobUrl(/* register */ k === 'live');
        const icon = document.querySelector(sel + ' span.caa-icon');
        icon.style.setProperty('background-size', 'contain');
        icon.style.setProperty('background-image', 'url(' + url + ')');
        return { url, after: window.__saTest.stripTransientCellState(sel, o) };
    }, [selector, kind, opts]);
}

test.describe('_stripTransientCellState() preserves live artwork only when asked', () => {
    // The fix. Before it, runFilter()'s single-table branch blanked every
    // artwork icon on every re-render — so each sort and each filter keystroke
    // emptied the whole CAA/EAA icon column, which then refilled one image at
    // a time from the Tier-1 memory cache. Nothing was re-fetched; it only
    // looked that way. This is the assertion that fails without the guard.
    test('a live blob background survives preserveLiveArt', async ({ page }) => {
        await loadUserscriptPage(page, { url: ARTIST_RECORDINGS_URL, fixtureFile: FIXTURE_FILE, testMode: true });

        const { url, after } = await paintAndStrip(page, '#art-cell-live', 'live', { preserveLiveArt: true });

        expect(after.backgroundImage).toContain(url);
        expect(after.backgroundSize).toBe('contain');
    });

    // The default must stay destructive: three of the five call sites
    // (getCleanCellHtml → Save-to-Disk, loadTableDataFromDisk,
    // _hydrateAndRenderFromSnapshotData) serialise the cell, and a blob: URL
    // is alive by definition in the tab that minted it. Preserving one there
    // would write a guaranteed-dead reference into every saved file.
    test('the same live blob is still blanked when preserveLiveArt is not passed', async ({ page }) => {
        await loadUserscriptPage(page, { url: ARTIST_RECORDINGS_URL, fixtureFile: FIXTURE_FILE, testMode: true });

        const { after } = await paintAndStrip(page, '#art-cell-default', 'live', undefined);

        expect(after.backgroundImage).toBe('');
        expect(after.backgroundSize).toBe('');
    });

    // Blob-SHAPED is not blob-ALIVE. A URL from a previous session, or one
    // already revoked, survives as a string in a serialised style while the
    // object behind it is gone — _artIdbBlobUrls is the only thing that can
    // tell the two apart, so a prefix test alone would "preserve" a broken
    // image and leave the cell permanently empty.
    test('a real but unregistered (dead) blob URL is blanked even with preserveLiveArt', async ({ page }) => {
        await loadUserscriptPage(page, { url: ARTIST_RECORDINGS_URL, fixtureFile: FIXTURE_FILE, testMode: true });

        const { url, after } = await paintAndStrip(page, '#art-cell-dead', 'dead', { preserveLiveArt: true });

        expect(url.startsWith('blob:')).toBe(true);   // genuinely blob-shaped
        expect(after.backgroundImage).toBe('');       // and still cleared
    });

    test('a plain http(s) background is blanked even with preserveLiveArt', async ({ page }) => {
        await loadUserscriptPage(page, { url: ARTIST_RECORDINGS_URL, fixtureFile: FIXTURE_FILE, testMode: true });

        const { after } = await paintAndStrip(page, '#art-cell-http', 'http', { preserveLiveArt: true });

        expect(after.backgroundImage).toBe('');
    });

    // preserveLiveArt is deliberately narrow: it spares the painted pixels and
    // nothing else. data-caa-enriched must still be deleted, or _artEnrichIcon()
    // early-returns and never reaches _artHighlightArtCell() (the authoritative
    // highlight call site) or _invalidateUniqDropDataCache() — staling the 📊
    // dropdown's artwork type/comment counts and dropping filter highlighting
    // inside art cells.
    test('preserveLiveArt does not preserve the enrichment marker', async ({ page }) => {
        await loadUserscriptPage(page, { url: ARTIST_RECORDINGS_URL, fixtureFile: FIXTURE_FILE, testMode: true });

        const { after } = await paintAndStrip(page, '#art-cell-live', 'live', { preserveLiveArt: true });

        expect(after.caaEnriched).toBe(false);
    });
});
