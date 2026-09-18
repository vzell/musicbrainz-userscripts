'use strict';

// `_artInitInlinePics()`'s Case C1 mirrors every already-painted inline
// thumbnail onto its source row, and it runs on EVERY multi-table re-render —
// every filter keystroke on a page with artwork. It used to resolve each row
// with `_findMasterRowByIdx()`, a linear scan of `allRows` plus every
// `groupedRows` entry, which makes the pass O(N²).
//
// Measured with `scripts/bench-master-row-index.js`: 1479 ms at 4174 rows and
// 13 152 ms at 10 000, against 3.8 ms and 14.2 ms for building one index and
// looking up in it. PERFORMANCE.org Step 24's neighbourhood; the cost was
// recorded as known and separate when the §3.1 audit rejected span-mirroring.
//
// Nothing about this is visible in the DOM — the thumbnails look identical
// either way — so the pass is instrumented instead:
// `__saTest.masterRowScans()` counts linear scans.
//
// Two halves, and the second is what stops the first being gamed:
//
//   - the COST: a filter keystroke must not scan once per painted thumbnail;
//   - the GUARANTEE: the thumbnails must still survive that re-render, which is
//     the only reason the mirror exists at all. A mirror that resolves nothing
//     is extremely fast.
//
// `loadPage.js`'s FIXTURE_SETTINGS_OVERRIDE forces `sa_enable_caa_pics` OFF for
// every fixture spec, so this file turns it back on and answers every artwork
// request itself — see CLAUDE.md's warning that a "cannot reproduce" here means
// nothing until that override has been switched back on.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { clickMasterToggleAndExpandAll } = require('../support/liveAssertions');
const { waitForFilterSettled, typeGlobalFilter } = require('../support/filterSortAssertions');

const SNAPSHOTS = path.join(__dirname, '..', 'snapshots');

/** "Tougher Than the Rest" — 7 releases in 2 sub-tables, tableMode 'multi'. */
const RELEASE_GROUP = {
    url: 'https://musicbrainz.org/release-group/f83d2211-dd81-4b1e-9a02-e89733891e1c',
    shell: path.join(SNAPSHOTS, 'releasegroup-releases', 'raw.html'),
    routeGlob: 'https://musicbrainz.org/release-group/**',
    button: 'button[data-label="Show all Releases for ReleaseGroup"]',
};

/** Painted inline thumbnails: a placeholder holding a visible <img>. */
const paintedThumbs = (page) => page.evaluate(() => Array.from(
    document.querySelectorAll('.mb-caa-inline-ph img, .mb-eaa-inline-ph img'))
    .filter((img) => img.src && img.style.display !== 'none').length);

/**
 * WHICH rows carry a painted thumbnail, by `data-mb-row-idx`.
 *
 * Counting is not enough: mirroring every thumbnail onto the same (wrong)
 * source row keeps a plausible-looking total while destroying the mapping, and
 * a count-based assertion passes right through it. This is what the
 * "the index resolves the wrong row" mutation proved.
 */
const rowsWithThumbs = (page) => page.evaluate(() => Array.from(
    document.querySelectorAll('.mb-caa-inline-ph img, .mb-eaa-inline-ph img'))
    .filter((img) => img.src && img.style.display !== 'none')
    .map((img) => {
        const tr = img.closest('tr');
        return tr ? tr.dataset.mbRowIdx : null;
    })
    .filter((v) => v !== null)
    .sort());

const scans = (page) => page.evaluate(() => window.__saTest.masterRowScans());

/**
 * Opens the multi-table page with every artwork request answered immediately,
 * so all thumbnails paint before anything else happens.
 */
async function openWithArt(page) {
    await loadUserscriptPage(page, {
        url: RELEASE_GROUP.url,
        fixtureFile: RELEASE_GROUP.shell,
        testMode: true,
        settingsOverride: {
            sa_enable_caa_pics: true,
            sa_caa_pics_inline: true,
            sa_enable_relationships_column: false,
        },
    });
    await page.route(RELEASE_GROUP.routeGlob,
        (route) => route.fulfill({ path: RELEASE_GROUP.shell, contentType: 'text/html' }));
    await page.route('https://coverartarchive.org/**',
        (route) => route.fulfill({ status: 404, body: '' }));

    await page.evaluate(() => {
        const original = window.GM_xmlhttpRequest;
        // `__artFrozen` stops answering thumbnail requests without failing
        // them. After the artwork has painted, a test freezes the network so
        // that any thumbnail still on screen can only have got there by being
        // mirrored onto its SOURCE row — a re-fetch cannot quietly repaint it
        // and make a broken mirror look fine.
        window.__artFrozen = false;
        window.GM_xmlhttpRequest = (opts) => {
            const isThumb = /\/release\/[0-9a-f-]{36}\/front-/.test((opts && opts.url) || '');
            if (!isThumb) return original(opts);
            if (window.__artFrozen) return { abort() {} };
            setTimeout(() => opts.onload({
                status: 200, response: new Blob(['x'], { type: 'image/png' }), responseText: '',
            }), 0);
            return { abort() {} };
        };
    });

    await page.click(RELEASE_GROUP.button);
    await waitForRenderComplete(page, { waitForAutoResize: false });
    await clickMasterToggleAndExpandAll(page);

    // Settle, don't sleep: poll until the painted count stops changing AND is
    // non-zero — zero means "the pass has not produced anything yet".
    await expect.poll(async () => paintedThumbs(page), {
        timeout: 30000,
        message: 'inline thumbnails paint before the measurement',
    }).toBeGreaterThan(0);
    let last = -1;
    for (let i = 0; i < 20 && last !== await paintedThumbs(page); i++) {
        last = await paintedThumbs(page);
        await page.waitForTimeout(150);
    }
    return last;
}

test.describe('the inline-thumbnail mirror resolves rows through one shared index', () => {
    let pageErrors;

    test.beforeEach(({ page }) => {
        pageErrors = [];
        page.on('pageerror', (e) => pageErrors.push(String(e.stack || e.message || '')));
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('cost: a re-render does not scan once per painted thumbnail', async ({ page }) => {
        const painted = await openWithArt(page);
        expect(painted, 'the fixture really does paint several thumbnails').toBeGreaterThan(1);

        // The ICON mirror (`_artMirrorIconToSourceRow()`) still scans once per
        // painted icon, and deliberately: both its call sites are deferred —
        // inside a `.then()` and an image `load` listener — so a pass-scoped
        // index would be stale by the time they run, which is the one thing
        // `_buildMasterRowIndex()`'s JSDoc forbids. Measured on this fixture,
        // a keystroke cost 14 scans before the change and 7 after: the
        // inline-thumbnail half is gone, the icon half remains. That remainder
        // is the budget below, and it is why this asserts <= icons rather than
        // == 0. See PERFORMANCE.org Step 24's neighbourhood for the rest.
        const icons = await page.evaluate(() =>
            document.querySelectorAll('span.caa-icon').length);

        const before = await scans(page);
        await waitForFilterSettled(page, () => typeGlobalFilter(page, 'e'));
        const added = (await scans(page)) - before;

        expect(added,
            `a re-render added ${added} linear scans for ${painted} thumbnails and ${icons} icons`)
            .toBeLessThanOrEqual(icons);
    });

    test('guarantee: the thumbnails still survive that re-render', async ({ page }) => {
        const painted = await openWithArt(page);

        await waitForFilterSettled(page, () => typeGlobalFilter(page, 'e'));
        const visibleRows = await page.evaluate(() => Array.from(
            document.querySelectorAll('table.tbl tbody tr'))
            .filter((r) => r.style.display !== 'none').length);
        expect(visibleRows, 'the filter left some rows on screen').toBeGreaterThan(0);

        // The mirror's whole purpose: a re-render clones the SOURCE rows, so a
        // thumbnail only survives if it was written back to them. If the index
        // resolved the wrong row — or no row — this is what goes to zero.
        const stillPainted = await paintedThumbs(page);
        expect(stillPainted, 'thumbnails survived the re-render').toBeGreaterThan(0);
        expect(stillPainted, 'and none were lost beyond what the filter hid')
            .toBeLessThanOrEqual(painted);
    });

    test('guarantee: the same ROWS come back, from the source rows alone', async ({ page }) => {
        const painted = await openWithArt(page);
        const rowsBefore = await rowsWithThumbs(page);
        expect(rowsBefore.length, 'several distinct rows carry a thumbnail').toBe(painted);

        // Freeze the artwork network. From here a thumbnail can only appear
        // because it was mirrored onto the source row the re-render clones
        // from — a re-fetch cannot repaint it.
        await page.evaluate(() => { window.__artFrozen = true; });

        await waitForFilterSettled(page, () => typeGlobalFilter(page, 'e'));
        await waitForFilterSettled(page, () => page.click('#mb-clear-all-filters-btn'));

        // The SET, not the count: mirroring everything onto one row keeps a
        // plausible total and loses the mapping.
        await expect.poll(async () => (await rowsWithThumbs(page)).join(','), {
            timeout: 15000,
            message: 'the same rows carry thumbnails after clearing the filter',
        }).toBe(rowsBefore.join(','));
    });
});
