'use strict';

const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');

// Any recognized musicbrainz.org page works here — this test exercises
// _artFetchCachedImage() directly via window.__saTest.fetchCachedImageConcurrent()
// (see ShowAllEntityData.user.js's "Test-mode debug hook" section), not the
// full CAA/EAA render pipeline. Reproducing the concurrent-overlap window
// end-to-end through that pipeline (inline thumbnail + CAA/EAA column icon +
// bigbox strip, all sharing one _caaQueue) turned out NOT to be reliably
// reproducible from outside while writing this test: with the queue's
// default concurrency (4) and more releases than that on the pilot page
// below, its own FIFO scheduling keeps every pipeline's request for a given
// release strictly behind that release's OWN earlier-enqueued requests, so
// by the time a later pipeline's request for a release is admitted, the
// earlier one has already settled — no genuine overlap ever occurs on this
// page, regardless of PERFORMANCE.org Step 14's fix. Calling
// _artFetchCachedImage directly, synchronously, N times sidesteps the
// render pipeline's timing entirely and exercises the de-dup mechanism
// itself, deterministically.
const RELEASEGROUP_URL = 'https://musicbrainz.org/release-group/f83d2211-dd81-4b1e-9a02-e89733891e1c';

const TEST_URL = '//coverartarchive.org/release/00000000-0000-0000-0000-000000000000/front-250';
const NORMALISED_URL = 'https://coverartarchive.org/release/00000000-0000-0000-0000-000000000000/front-250';

// Wraps the base always-404 GM_xmlhttpRequest stub (gmStubs.js) to count
// invocations per URL. Registered after the base stub is defined (see
// loadUserscriptPage's extraInitScript param), so it can safely wrap it.
// No artificial delay is needed here (unlike an end-to-end pipeline test):
// fetchCachedImageConcurrent() issues all N calls synchronously, in the same
// JS turn, well before the stub's own setTimeout(fn, 0) response can fire —
// so the concurrent-overlap window this test targets is guaranteed, not
// timing-dependent.
const COUNT_XHR_CALLS_INIT_SCRIPT = `
    (function () {
        window.__gmXhrCallCounts = {};
        const original = window.GM_xmlhttpRequest;
        window.GM_xmlhttpRequest = function (opts) {
            window.__gmXhrCallCounts[opts.url] = (window.__gmXhrCallCounts[opts.url] || 0) + 1;
            return original(opts);
        };
    })();
`;

test.describe('CAA/EAA image cache in-flight de-duplication (PERFORMANCE.org Step 14)', { tag: '@extended' }, () => {
    test('N concurrent _artFetchCachedImage() calls for the same URL issue exactly one network request', async ({ page }) => {
        await loadUserscriptPage(page, {
            url: RELEASEGROUP_URL,
            testMode: true,
            extraInitScript: COUNT_XHR_CALLS_INIT_SCRIPT,
        });

        // window.__saTest is defined as soon as the userscript itself loads
        // (see its own JSDoc) — no "Show all Releases" click or fetch/render
        // needed first.
        await page.waitForFunction(() => typeof window.__saTest?.fetchCachedImageConcurrent === 'function');

        const results = await page.evaluate(
            (url) => window.__saTest.fetchCachedImageConcurrent(url, 5),
            TEST_URL
        );

        // All 5 calls join the same underlying fetch, so all 5 settle
        // identically — here that means all 5 reject, since the base stub
        // 404s anything not explicitly configured in window.__gmXhrResponses.
        expect(results).toHaveLength(5);
        for (const r of results) {
            expect(r.ok).toBe(false);
        }

        const callCounts = await page.evaluate(() => window.__gmXhrCallCounts || {});
        expect(callCounts[NORMALISED_URL]).toBe(1);
    });
});
