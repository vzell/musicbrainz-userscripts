'use strict';

// The ⚠⟳ failed-retry controls, rescoped from ONE page-wide button to one per
// table (org/503-handling.org's retry design, zone 4).
//
// ── What this pins ──────────────────────────────────────────────────────────
//
//  1. IT REALLY IS PARTITIONED. Several tables each get their own control, and
//     the per-table counts SUM to the page-wide one. A single button that
//     happened to be rendered per table would satisfy neither half.
//  2. THE COUNTS SURVIVE A FILTER, which is the trap the design names and the
//     reason this reads SOURCE rows rather than the live `<tbody>`.
//     `runFilter()` REMOVES non-matching rows, so a live-DOM tally collapses
//     toward zero as rows are filtered out — and a control that hides itself at
//     zero would then vanish exactly when a filter excludes the rows it is the
//     only way back to. CLAUDE.md records the identical bug for
//     `_updateLengthMismatchButtons()` / `_updateLiveDateFlagButtons()`.
//  3. THE PAGE-WIDE CONTROL STAYS. "Recover everything" and "recover what
//     failed in THIS table" are different intentions, exactly as the global and
//     per-table ⟳ already are.
//
// Multi-table by necessity: on a single-table page per-table and page-wide are
// indistinguishable, so the partition could not be observed at all.
//
// Built on caa-retry-failed-only.spec.js' archive route, including its traps:
// failures are `route.fulfill({status})` and never `route.abort()`, and the
// sub-sections are expanded before anything is measured because a collapsed
// sub-table is `display:none` and loads no artwork at all.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { collectPageErrors, clickMasterToggleAndExpandAll } = require('../support/liveAssertions');
const { typeGlobalFilter } = require('../support/filterSortAssertions');

const RELEASE_GROUP = {
    url: 'https://musicbrainz.org/release-group/f83d2211-dd81-4b1e-9a02-e89733891e1c',
    shell: path.join(__dirname, '..', 'snapshots', 'releasegroup-releases', 'raw.html'),
    routeGlob: 'https://musicbrainz.org/release-group/**',
    button: 'button[data-label="Show all Releases for ReleaseGroup"]',
};
const META_RE = /^https:\/\/coverartarchive\.org\/release\/([0-9a-f-]{36})$/;
const PAGE_WIDE = '#mb-caa-toggle-btn-retry-failed';
const PER_TABLE = '[id^="mb-caa-toggle-btn-retry-failed-"]';
// The throttle is 1 s (_ART_FAILED_TBL_REFRESH_MS); allow it comfortably.
const THROTTLE_WAIT = 2500;

/** Opens the multi-table shell with every archive metadata lookup failing 503. */
async function openWithAllFailing(page) {
    const hits = new Map();
    await loadUserscriptPage(page, {
        url: RELEASE_GROUP.url,
        fixtureFile: RELEASE_GROUP.shell,
        testMode: true,
        settingsOverride: {
            sa_enable_caa_pics: true,
            sa_art_idb_enable: false,
            sa_caa_pics_inline: false,
            sa_enable_relationships_column: false,
        },
    });
    await page.route(RELEASE_GROUP.routeGlob,
        (route) => route.fulfill({ path: RELEASE_GROUP.shell, contentType: 'text/html' }));
    await page.route('https://coverartarchive.org/**',
        (route) => route.fulfill({ status: 404, body: '' }));
    await page.route(META_RE, (route) => {
        const mbid = route.request().url().match(META_RE)[1];
        hits.set(mbid, (hits.get(mbid) || 0) + 1);
        return route.fulfill({ status: 503, contentType: 'text/plain', body: '' });
    });
    await page.evaluate(() => {
        const original = window.GM_xmlhttpRequest;
        window.GM_xmlhttpRequest = (opts) => {
            if (!/coverartarchive\.org/.test((opts && opts.url) || '')) return original(opts);
            setTimeout(() => opts.onload({ status: 404, response: null, responseText: '' }), 0);
            return { abort() {} };
        };
    });
    await page.click(RELEASE_GROUP.button);
    await waitForRenderComplete(page, { waitForAutoResize: false });
    await clickMasterToggleAndExpandAll(page);
    return hits;
}

/** Waits until the archive request count stops moving. */
async function settleArchive(page, hits, stableFor = 6) {
    const total = () => [...hits.values()].reduce((a, b) => a + b, 0);
    let last = -1;
    let same = 0;
    for (let i = 0; i < 200; i++) {
        const now = total();
        same = now === last ? same + 1 : 0;
        if (now > 0 && same >= stableFor) return now;
        last = now;
        await page.waitForTimeout(500);
    }
    return total();
}

/** The per-table control counts, in document order. */
const perTableCounts = (page) => page.evaluate((sel) => Array.from(
    document.querySelectorAll(sel),
    (b) => Number((b.textContent.match(/(\d+)/) || [0, 0])[1])), PER_TABLE);

const pageWideCount = (page) => page.evaluate((sel) => {
    const b = document.querySelector(sel);
    return b ? Number((b.textContent.match(/(\d+)/) || [0, 0])[1]) : 0;
}, PAGE_WIDE);

test.describe('failed-retry controls are per table, and filter-proof', () => {
    let pageErrors;

    test.beforeEach(async ({ page }) => {
        pageErrors = collectPageErrors(page);
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('the page-wide count is partitioned across per-table controls',
        async ({ page }) => {
            test.setTimeout(180000);
            const hits = await openWithAllFailing(page);
            await settleArchive(page, hits);
            await page.waitForTimeout(THROTTLE_WAIT);

            const wide = await pageWideCount(page);
            expect(wide, 'the page-wide control reports the failures').toBeGreaterThan(1);

            const per = await perTableCounts(page);
            expect(per.length, 'several tables carry their own control')
                .toBeGreaterThan(1);
            expect(per.every((n) => n > 0), 'no control is rendered with a zero count')
                .toBe(true);

            // THE partition assertion. A per-table control showing the page-wide
            // number in every table would pass a "controls exist" check and fail
            // this one.
            const sum = per.reduce((a, b) => a + b, 0);
            expect(sum, 'the per-table counts sum to the page-wide count').toBe(wide);
        });

    test('a filter that hides the failing rows does not shrink the counts',
        async ({ page }) => {
            test.setTimeout(180000);
            const hits = await openWithAllFailing(page);
            await settleArchive(page, hits);
            await page.waitForTimeout(THROTTLE_WAIT);

            const before = await perTableCounts(page);
            const wideBefore = await pageWideCount(page);
            expect(before.length, 'controls are present to begin with').toBeGreaterThan(1);

            // A query that matches almost nothing, so runFilter() REMOVES most
            // rows from every live tbody.
            await typeGlobalFilter(page, 'zzzzzznomatch');
            await page.waitForTimeout(THROTTLE_WAIT);

            const rowsLeft = await page.evaluate(
                () => document.querySelectorAll('table.tbl tbody tr').length);
            expect(rowsLeft, 'the filter really did remove the rows').toBeLessThan(5);

            // THE assertion, and it MUST force a recompute to mean anything.
            // Nothing recalculates these after a filter in production — the
            // refresh is driven by the enrich pass, which has long finished —
            // so simply re-reading the buttons would pass whether the count
            // came from the filter-proof source rows or from the now-empty live
            // tbody. Mutation-testing caught exactly that: the "read the live
            // table only" mutation passed against the first version of this
            // test. The hook runs the real function, bypassing only its 1 s
            // throttle.
            const recomputed = await page.evaluate(
                () => window.__saTest.artRefreshPerTableFailed('caa'));
            expect(recomputed,
                'recomputed from source rows, a filter cannot shrink the counts')
                .toEqual(before);

            // And the rendered controls agree with it.
            expect(await perTableCounts(page),
                'the controls still show those counts').toEqual(before);
            expect(await pageWideCount(page),
                'and so does the page-wide one').toBe(wideBefore);
        });
});
