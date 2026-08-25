'use strict';

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { seedArtIdbFixture } = require('../support/idbFixture');
const { waitForCaaEaaComplete } = require('../support/asyncCompletion');
const { collectPageErrors } = require('../support/liveAssertions');

// Same "Tougher Than the Rest" pilot page captured by capture-idb-fixture.js.
const RELEASEGROUP_URL = 'https://musicbrainz.org/release-group/f83d2211-dd81-4b1e-9a02-e89733891e1c';
const SHOW_ALL_BUTTON = 'button[data-label="Show all Releases for ReleaseGroup"]';

const IDB_FIXTURE = path.join(
    __dirname, '..', 'fixtures', 'idb-state', 'releasegroup-releases-caa-bigbox-images.json'
);

test.describe('CAA IndexedDB tier (bigbox + inline Release-column thumbnail)', { tag: '@extended' }, () => {
    test('serves the bigbox strip and inline thumbnails from IndexedDB after a direct IDB seed', async ({ page }) => {
        const pageErrors = collectPageErrors(page);

        // Seeds real captured Blob records into IndexedDB's 'images' store
        // BEFORE the userscript loads — see idbFixture.js's JSDoc for why
        // this direct-seed approach is used instead of
        // storageState({indexedDB: true}) (which can't round-trip Blobs).
        await seedArtIdbFixture(page, IDB_FIXTURE);

        // Standard always-404 GM_xmlhttpRequest stub — a real network fetch
        // for any of these images would fail closed. If the bigbox strip
        // still populates, the images can only have come from IndexedDB
        // (Tier 2), not the network (Tier 3).
        await loadUserscriptPage(page, { url: RELEASEGROUP_URL, testMode: true });

        // No race against the async IDB seed write — idbFixture.js flips
        // this once its write transaction has actually committed.
        await page.waitForFunction(() => window.__idbSeedDone === true, { timeout: 10000 });

        const showAllBtn = page.locator(SHOW_ALL_BUTTON);
        await expect(showAllBtn).toBeVisible();
        await showAllBtn.click();
        await expect(page.locator('#mb-filter-container')).toBeVisible({ timeout: 90000 });

        await waitForCaaEaaComplete(page);

        // The "⌛" placeholder text node is removed by _onBigLoaded() only on
        // a successful resolve (IDB or network); a failed/never-attempted
        // load leaves the wrapper's placeholder in place or removes the
        // wrapper outright (see _artInitBigPics()'s .catch() branch), so
        // counting real blob: <img> srcs is a direct proxy for "how many
        // images actually resolved". Not asserted via toBeVisible() —
        // sa_caa_pics_initially_collapsed defaults to true, so the bigbox
        // strip's own <div> is display:none by default even though its
        // images are still fetched/cached in the background (confirmed via
        // this setting's own configSchema description).
        const bigboxImgs = page.locator('.mb-caa-bigbox img');
        await bigboxImgs.first().waitFor({ state: 'attached', timeout: 15000 });
        const srcs = await bigboxImgs.evaluateAll((imgs) => imgs.map((i) => i.src));
        expect(srcs.length).toBeGreaterThan(0);
        for (const src of srcs) {
            expect(src.startsWith('blob:')).toBe(true);
        }

        // The per-table toggle button's badge count corroborates the same
        // thing from a second, independent DOM location.
        const badgeText = await page.locator('[id^="mb-caa-toggle-btn-"] .mb-caa-toggle-count').first().textContent();
        expect(Number(badgeText)).toBeGreaterThan(0);

        // ── Inline "Release" column thumbnail (addCAA: 'Release', sa_caa_pics_inline) ──
        // A separate DOM location and code path (_artInitInlinePics(), not
        // _artInitBigPics()) — the small icon rendered in front of each
        // release name. It builds the identical `front-250` URL (both
        // sa_caa_small_img_size and sa_caa_big_img_size default to 250), so
        // it resolves through the SAME _artFetchCachedImage() cache entries
        // the bigbox strip already populated above — but that's an
        // implementation detail; assert it directly rather than only via the
        // bigbox assertions above standing in for it.
        const inlineImgs = page.locator('.mb-caa-inline-ph img');
        await inlineImgs.first().waitFor({ state: 'attached', timeout: 15000 });
        const inlineData = await inlineImgs.evaluateAll(
            (imgs) => imgs.map((i) => ({ src: i.src, display: i.style.display }))
        );
        expect(inlineData.length).toBeGreaterThan(0);
        for (const { src, display } of inlineData) {
            expect(src.startsWith('blob:')).toBe(true);
            expect(display).toBe('inline');
        }

        expect(pageErrors).toEqual([]);
    });

    test('control: without a seeded IDB fixture, the network-stubbed bigbox strip fails closed', async ({ page }) => {
        // Proves the test above is actually exercising the IDB tier and not
        // just "the bigbox strip always populates regardless" — no IDB seed
        // step here, so the always-404 GM_xmlhttpRequest stub has nothing to
        // fall back on, and every bigbox image request must fail and its
        // wrapper get removed.
        const pageErrors = collectPageErrors(page);

        await loadUserscriptPage(page, { url: RELEASEGROUP_URL, testMode: true });

        const showAllBtn = page.locator(SHOW_ALL_BUTTON);
        await expect(showAllBtn).toBeVisible();
        await showAllBtn.click();
        await expect(page.locator('#mb-filter-container')).toBeVisible({ timeout: 90000 });

        await waitForCaaEaaComplete(page);

        const bigboxImgCount = await page.locator('.mb-caa-bigbox img').count();
        expect(bigboxImgCount).toBe(0);

        // The inline Release-column placeholder spans are always injected
        // synchronously (layout-stable regardless of fetch outcome — see
        // _artInitInlinePics()'s "placeholder stays as spacer" comment on a
        // failed fetch), so their presence alone doesn't prove anything; a
        // failed fetch just never gives the inner <img> a blob: src.
        const inlineBlobImgCount = await page.locator('.mb-caa-inline-ph img[src^="blob:"]').count();
        expect(inlineBlobImgCount).toBe(0);

        expect(pageErrors).toEqual([]);
    });
});
