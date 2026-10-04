'use strict';

// A single-table page shows ONE ⚠⟳ per source, not two (org/live-bootleg.org 1).
//
// ── The defect ──────────────────────────────────────────────────────────────
//
// The page-wide ⚠⟳ anchors after the global ⟳ (`<prefix>-global-retry`, or
// `mb-rel-retry-global`), and those exist only on a multi-table page. On a
// single-table page it falls back to table 0's run — after `<prefix>-retry-0`
// / `mb-rel-retry-0` — and the per-table ⚠⟳ of table 0 was then appended to
// the very same run. Two identical "⚠⟳ N" buttons, side by side, covering
// exactly the same rows (debug/bs-bootleg-releases.html, CAA).
//
// ── What this pins ──────────────────────────────────────────────────────────
//
// The COUNT of CAA failed-retry controls, after the page-wide one has
// appeared AND the throttled per-table refresh has had time to run. Asserting
// presence alone is what the duplicate always satisfied. The multi-table half
// — per-table controls still built where the page-wide one has its own row —
// is pinned by per-table-failed-retry.spec.js, which must keep passing. The
// Relationships twin of this defect is pinned in rel-retry-failed-only.spec.js:
// this disk fixture carries saved relationships, so no lookup of it can fail.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadFromDiskFixture } = require('../support/diskFixture');
const { collectPageErrors } = require('../support/liveAssertions');

const FIXTURE = path.join(__dirname, 'saved-data', 'artist-releases-bodeans.json.gz');
const PAGE_URL = 'https://musicbrainz.org/artist/84c38d3a-3400-4c28-b988-90558bb6fae0/releases';
const META_RE = /^https:\/\/coverartarchive\.org\/release\/([0-9a-f-]{36})$/;

test.describe('single-table page: one CAA ⚠⟳', () => {
    let pageErrors;

    test.beforeEach(async ({ page }) => {
        pageErrors = collectPageErrors(page);
        // Every archive metadata lookup fails 503 — a failure, not an
        // absence, so the ⚠⟳ is built.
        await page.route('https://coverartarchive.org/**',
            (route) => route.fulfill({ status: 404, body: '' }));
        await page.route(META_RE,
            (route) => route.fulfill({ status: 503, contentType: 'text/plain', body: '' }));
        await loadFromDiskFixture(page, {
            url: PAGE_URL,
            fixturePath: FIXTURE,
            testMode: true,
            settingsOverride: {
                sa_enable_caa_pics: true,
                sa_art_idb_enable: false,
                sa_enable_relationships_column: false,
            },
        });
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('CAA: the page-wide ⚠⟳ alone, no per-table twin beside it', async ({ page }) => {
        test.setTimeout(120000);
        expect(await page.locator('table.tbl').count(), 'single-table page').toBe(1);
        await expect(page.locator('#mb-caa-toggle-btn-retry-failed'),
            'vacuity guard: the failures produced a control at all')
            .toHaveText(/^⚠⟳ \d+$/, { timeout: 60000 });
        // The per-table refresh is throttled; run the shipping recompute now
        // instead of sleeping past the throttle. It still sees the failure.
        expect(await page.evaluate(() => window.__saTest.artRefreshPerTableFailed('caa')),
            'table 0 has failures of its own').toEqual([expect.any(Number)]);
        await expect(page.locator('[id^="mb-caa-toggle-btn-retry-failed"]')).toHaveCount(1);
    });

});
