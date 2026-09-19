'use strict';

// A transport failure on a Cover Art Archive METADATA request must not be
// persisted as "this release has no artwork". org/503-handling.org F5.
//
// `_artEnrichIcon()`'s Tier 3 took one branch for every non-OK status:
// countCache 0, imagesCache [], and _artIdbPutMetadata(path, 0, []). The status
// was inspected only to pick the log severity. So a single 503 became a stored
// fact about the release for `sa_art_idb_metadata_ttl_days` — and every later
// page load hit Tier 2, showed no artwork, and made no request and no warning.
// `_artRetryTable()` could not clear it either: it purged the session Maps and
// `_artMissCache`, never the IDB `metadata` store, so the retry button re-entered
// Tier 2 and returned the same stored zero.
//
// None of this is visible in the DOM. A release with no artwork renders
// identically whether the archive answered 404 (a fact, correctly stored) or 503
// (a transport failure, which must not be stored), on the broken build and the
// fixed one alike. So every assertion here reads the IDB `metadata` store or the
// request counter — never the rendered icons. An "no artwork is shown" assertion
// would pass on both builds and prove nothing.
//
// Two traps this spec is written around:
//   • `route.abort()` instead of `fulfill({status: 503})` makes `fetch()` THROW,
//     landing in the `catch (err)` arm that already caches nothing. A spec built
//     on abort() passes on unfixed code.
//   • `sa_caa_pics_big: false` would make `_artInitPics()` return before
//     `_artCreateOrUpdateRetryButton()` runs, so the ⟳ button would not exist.
//
// Network-free: the page shell and every coverartarchive.org request are served
// by page.route; thumbnails go through GM_xmlhttpRequest, which page.route cannot
// see, so they are stubbed to a 404 in-page.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { collectPageErrors, clickMasterToggleAndExpandAll } = require('../support/liveAssertions');
const { readArtIdbMetadata, writeArtIdbMetadata } = require('../support/idbFixture');

// "Tougher Than the Rest" — 7 releases in 2 sub-tables, tableMode 'multi'.
// Same shell `global-filter-art-search.spec.js` drives, which is what makes it
// a known-good target for the CAA pipeline under page.route.
const RELEASE_GROUP = {
    url: 'https://musicbrainz.org/release-group/f83d2211-dd81-4b1e-9a02-e89733891e1c',
    shell: path.join(__dirname, '..', 'snapshots', 'releasegroup-releases', 'raw.html'),
    routeGlob: 'https://musicbrainz.org/release-group/**',
    button: 'button[data-label="Show all Releases for ReleaseGroup"]',
};

const META_RE = /^https:\/\/coverartarchive\.org\/release\/([0-9a-f-]{36})$/;
const DAY_MS = 86400 * 1000;

/** Release MBIDs in document order, read from the shell the page is served from. */
function releaseMbids() {
    const html = fs.readFileSync(RELEASE_GROUP.shell, 'utf8');
    const seen = [];
    for (const m of html.matchAll(/href="\/release\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/g)) {
        if (!seen.includes(m[1])) seen.push(m[1]);
    }
    return seen;
}

/** One image record, shaped as the archive's own index serves it. */
const imageFor = (mbid) => ({
    id: 1, types: ['Front'], front: true, back: false, comment: '', approved: true,
    image: `https://coverartarchive.org/release/${mbid}/1.jpg`,
    thumbnails: { 250: `https://coverartarchive.org/release/${mbid}/1-250.jpg` },
});

/**
 * Loads the release group with artwork on and every archive metadata request
 * answered by `statusFor(mbid)`, counting the hits per MBID.
 *
 * @param {import('@playwright/test').Page} page
 * @param {(mbid: string) => number} statusFor
 * @param {(page: import('@playwright/test').Page) => Promise<void>} [beforeFetch]
 *   Runs after navigation and after the routes are registered, but before the
 *   "Show all" click — the only window in which the IDB store can be seeded
 *   (IndexedDB is origin-scoped, and the fetch must not have started).
 * @returns {Promise<Map<string, number>>} MBID -> metadata requests served
 */
async function openWithArchive(page, statusFor, beforeFetch) {
    const hits = new Map();

    await loadUserscriptPage(page, {
        url: RELEASE_GROUP.url,
        fixtureFile: RELEASE_GROUP.shell,
        testMode: true,
        settingsOverride: {
            sa_enable_caa_pics: true,          // FIXTURE_SETTINGS_OVERRIDE forces this off
            sa_art_idb_enable: true,           // the whole subject — state it, don't inherit it
            sa_caa_pics_inline: false,         // cuts image traffic; nothing here is under test
            sa_enable_relationships_column: false,
        },
    });

    await page.route(RELEASE_GROUP.routeGlob,
        (route) => route.fulfill({ path: RELEASE_GROUP.shell, contentType: 'text/html' }));
    // Catch-all first: every image byte request that reaches the browser. The
    // metadata route below is registered later and therefore wins on the bare
    // `/release/<guid>` shape.
    await page.route('https://coverartarchive.org/**', (route) => route.fulfill({ status: 404, body: '' }));
    await page.route(META_RE, (route) => {
        const mbid = route.request().url().match(META_RE)[1];
        hits.set(mbid, (hits.get(mbid) || 0) + 1);
        const status = statusFor(mbid);
        if (status === 200) {
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ images: [imageFor(mbid)] }),
            });
        }
        // fulfill(), never abort(): an abort throws and lands in the catch arm,
        // which already caches nothing — the spec would pass on unfixed code.
        return route.fulfill({ status, contentType: 'text/plain', body: '' });
    });

    // Thumbnails travel through GM_xmlhttpRequest, invisible to page.route.
    await page.evaluate(() => {
        const original = window.GM_xmlhttpRequest;
        window.GM_xmlhttpRequest = (opts) => {
            if (!/coverartarchive\.org/.test((opts && opts.url) || '')) return original(opts);
            setTimeout(() => opts.onload({ status: 404, response: null, responseText: '' }), 0);
            return { abort() {} };
        };
    });

    if (beforeFetch) await beforeFetch(page);

    await page.click(RELEASE_GROUP.button);
    await waitForRenderComplete(page, { waitForAutoResize: false });
    await clickMasterToggleAndExpandAll(page);
    return hits;
}

/**
 * Polls until the archive has stopped being asked anything new.
 *
 * Deliberately NOT `waitForCaaEaaComplete()`: that waits on the completion
 * toast, and an entity resolved to `count <= 0` returns before any badge or
 * toast work happens, so the toast is not a reliable settle for a page whose
 * point is that two of its releases have no artwork. Poll the thing under test
 * — the request counter — until it stops moving (CLAUDE.md, "Settle, don't
 * sleep").
 *
 * @param {Map<string, number>} hits
 * @param {number} [stableFor]  consecutive identical samples required
 */
async function settleArchive(hits, stableFor = 6) {
    const total = () => [...hits.values()].reduce((a, b) => a + b, 0);
    let last = -1;
    let same = 0;
    for (let i = 0; i < 200; i++) {
        const now = total();
        same = (now === last) ? same + 1 : 0;
        last = now;
        if (same >= stableFor && now > 0) return;
        await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`archive requests never settled (last total ${last})`);
}

/** The `metadata` record for one release, or undefined. */
const recordFor = (records, mbid) => records.find((r) => r.entityPath === `/release/${mbid}`);

/** MBIDs of the releases rendered in sub-table `i`, in document order. */
const mbidsInTable = (page, i) => page.evaluate((idx) => {
    const table = document.querySelectorAll('table.tbl')[idx];
    const out = [];
    table.querySelectorAll('tbody a[href^="/release/"]').forEach((a) => {
        const m = a.getAttribute('href').match(/^\/release\/([0-9a-f-]{36})/);
        if (m && !out.includes(m[1])) out.push(m[1]);
    });
    return out;
}, i);

/** Index of the sub-table containing `mbid`. */
const tableIndexOf = (page, mbid) => page.evaluate((want) => {
    const tables = Array.from(document.querySelectorAll('table.tbl'));
    return tables.findIndex((t) => t.querySelector(`tbody a[href^="/release/${want}"]`) !== null);
}, mbid);

test.describe('CAA metadata: a transient failure is not a fact about the release', () => {
    let pageErrors;
    let MBIDS;
    let TRANSIENT;   // answered 503
    let ABSENT;      // answered 404

    test.beforeEach(({ page }) => {
        pageErrors = collectPageErrors(page);
        MBIDS = releaseMbids();
        expect(MBIDS.length).toBeGreaterThanOrEqual(3);
        [TRANSIENT, ABSENT] = MBIDS;
    });

    // An `await` was introduced into _artRetryTable(); a throw inside steps 3-8
    // now surfaces as an unhandled rejection rather than as a synchronous error
    // in the click handler, which nothing else in this spec would notice.
    test.afterEach(() => {
        expect(pageErrors).toEqual([]);
    });

    test('a 503 writes no metadata record, while a 404 still writes a zero', async ({ page }) => {
        const hits = await openWithArchive(page, (mbid) => {
            if (mbid === TRANSIENT) return 503;
            if (mbid === ABSENT) return 404;
            return 200;
        });
        await settleArchive(hits);

        // Vacuity guard, and it has to come first: if the metadata route never
        // matched, the store is empty for BOTH releases and every assertion
        // below passes while proving nothing.
        expect(hits.get(TRANSIENT)).toBeGreaterThanOrEqual(1);
        expect(hits.get(ABSENT)).toBeGreaterThanOrEqual(1);

        const records = await readArtIdbMetadata(page);

        // The fix: a transport failure is not persisted at all.
        expect(recordFor(records, TRANSIENT)).toBeUndefined();

        // The other half, and the reason this is one test rather than two: the
        // change must NARROW negative persistence, not remove it. Deleting the
        // _artIdbPutMetadata call outright would satisfy the assertion above.
        const absent = recordFor(records, ABSENT);
        expect(absent).toBeDefined();
        expect(absent.count).toBe(0);
        expect(absent.images).toEqual([]);
    });

    test('a re-render does not re-request a transiently failed release', async ({ page }) => {
        const hits = await openWithArchive(page, (mbid) => (mbid === TRANSIENT ? 503 : 200));
        await settleArchive(hits);
        const before = hits.get(TRANSIENT);
        expect(before).toBeGreaterThanOrEqual(1);

        // org/503-handling.org's F5 wording would have gated the in-memory zero
        // on the status too. It was deliberately narrowed to the IDB write alone:
        // without a session sentinel, every keystroke and every sort re-fires one
        // request per failed entity — hammering the archive precisely while it is
        // already struggling. This pins that decision.
        await page.fill('#mb-global-filter-input', 'zzz-no-such-row');
        await page.waitForTimeout(400);
        await page.fill('#mb-global-filter-input', '');
        await page.waitForTimeout(400);

        expect(hits.get(TRANSIENT)).toBe(before);
    });

    test('the retry button evicts the IDB metadata records and re-requests the table', async ({ page }) => {
        const hits = await openWithArchive(page, (mbid) => (mbid === TRANSIENT ? 503 : 200));
        await settleArchive(hits);

        const retryIdx = await tableIndexOf(page, ABSENT);
        expect(retryIdx).toBeGreaterThanOrEqual(0);
        const retried = await mbidsInTable(page, retryIdx);
        expect(retried.length).toBeGreaterThan(0);

        const otherIdx = await page.evaluate((i) => (
            document.querySelectorAll('table.tbl').length > 1 ? (i === 0 ? 1 : 0) : -1), retryIdx);
        const untouched = otherIdx >= 0 ? await mbidsInTable(page, otherIdx) : [];

        const before = new Map(hits);

        const retryBtn = page.locator(`#mb-caa-toggle-btn-retry-${retryIdx}`);
        await expect(retryBtn).toBeVisible();
        await retryBtn.click();
        await settleArchive(hits);

        // Pre-fix this delta is exactly 0 for every release in the table: step 2
        // cleared the session Maps, _artEnrichIcon missed Tier 1, hit Tier 2 and
        // returned the stored zero without issuing anything. So the DIRECTION is
        // the discriminator here; the absolute number of requests per entity is
        // an implementation detail of the pipeline and is not asserted.
        for (const mbid of retried) {
            expect(hits.get(mbid), `release ${mbid} in the retried table`)
                .toBeGreaterThan(before.get(mbid) || 0);
        }

        // Exact, and it pins the per-table scoping: a retry must not reload the
        // rest of the page.
        for (const mbid of untouched) {
            if (retried.includes(mbid)) continue;
            expect(hits.get(mbid), `release ${mbid} in the untouched table`)
                .toBe(before.get(mbid) || 0);
        }
    });

    test('a 10-day-old metadata record is still served under the 30-day TTL', async ({ page }) => {
        // sa_art_idb_metadata_ttl_days is read only inside _artIdbGetMetadata()
        // and _artIdbSweepExpired() and never reaches the DOM, so planting a
        // record of a known age is the only way to test the default at all.
        // Under the old 7-day default this record is expired on read AND swept,
        // both of which send the release to the network.
        const CACHED = MBIDS[2];
        const hits = await openWithArchive(page, () => 200, async (p) => {
            const written = await writeArtIdbMetadata(p, [{
                entityPath: `/release/${CACHED}`,
                count: 1,
                images: [imageFor(CACHED)],
                storedAt: Date.now() - (10 * DAY_MS),
            }]);
            expect(written).toBeGreaterThanOrEqual(1);
        });
        await settleArchive(hits);

        // Vacuity guard: the other releases must have been asked, or "nothing was
        // requested" would pass for the wrong reason.
        expect(hits.get(MBIDS[0])).toBeGreaterThanOrEqual(1);
        expect(hits.has(CACHED)).toBe(false);
    });
});
