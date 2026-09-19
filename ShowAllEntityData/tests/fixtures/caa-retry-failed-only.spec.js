'use strict';

// Recovering artwork the archive could not answer, without reloading the whole
// table (org/503-handling.org F7, CAA half — the half its own design record
// called blocked).
//
// ── Why it was blocked, and what unblocked it ───────────────────────────────
//
// After F5, `ctx.countCache` holds `0` for BOTH "the archive says this release
// has no artwork" (a 404 — a fact) and "the request failed" (a 503). F5 kept
// the in-memory zero for both on purpose: dropping it would re-fire one request
// per failed entity on every keystroke and every sort, hammering the archive
// precisely while it is already struggling. So nothing downstream could tell
// the two apart, and there was nothing for a "just what failed" control to read.
//
// `ctx.failedCache` is that missing fact: a session-scoped Set of entity paths,
// written where F5 decided not to persist. It is keyed by PATH, not by DOM,
// which is why it survives a filter for free — the Relationships half of F7 had
// to be argued into the same property.
//
// ── What each test pins, and the adjacent property it avoids ────────────────
//
//  1. THE DISTINCTION. A 503 is recorded, a 404 is not. Asserting only "the
//     control appeared" would pass on a build that recorded every non-OK
//     status, which would put a ⚠⟳ on every page that merely lists a release
//     with no cover art — the commonest case there is.
//  2. THE COST. Pressing ⚠⟳ re-requests the failed entity and NOT the ones that
//     answered. Measured as a request count per MBID, because "the icon
//     appeared" would also pass if it had re-requested everything.
//  3. IT RECOVERS. The retry actually fills the artwork in, and the control
//     goes away. A retry that cleared the record without re-enriching would
//     satisfy "the control went away" on its own.
//  4. IT SURVIVES A FILTER. `runFilter()` REMOVES non-matching rows, so
//     anything derived from the live table loses exactly the failures a filter
//     is hiding. Asserted through `__saTest.artFailedPaths()` — the count has
//     no DOM surface once its rows are gone.
//
// Network-free. Built on caa-metadata-transient-503.spec.js' archive route,
// including its two traps: failures are `route.fulfill({status})` and never
// `route.abort()` (an abort lands in the catch arm, which behaves differently),
// and `sa_caa_pics_big` must stay ON or `_artInitPics()` returns before the ⟳
// button this control anchors on is ever created.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { collectPageErrors, clickMasterToggleAndExpandAll } = require('../support/liveAssertions');

const RELEASE_GROUP = {
    url: 'https://musicbrainz.org/release-group/f83d2211-dd81-4b1e-9a02-e89733891e1c',
    shell: path.join(__dirname, '..', 'snapshots', 'releasegroup-releases', 'raw.html'),
    routeGlob: 'https://musicbrainz.org/release-group/**',
    button: 'button[data-label="Show all Releases for ReleaseGroup"]',
};

const META_RE = /^https:\/\/coverartarchive\.org\/release\/([0-9a-f-]{36})$/;
const FAILED_BTN = '#mb-caa-toggle-btn-retry-failed';

/** Release MBIDs the shell renders, in document order. */
function releaseMbids() {
    const html = fs.readFileSync(RELEASE_GROUP.shell, 'utf8');
    const out = [];
    const re = /href="\/release\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/g;
    let m;
    while ((m = re.exec(html)) !== null) if (!out.includes(m[1])) out.push(m[1]);
    return out;
}

const imageFor = (mbid) => ({
    id: '1', image: `https://coverartarchive.org/release/${mbid}/1.jpg`,
    thumbnails: { 250: `https://coverartarchive.org/release/${mbid}/1-250.jpg` },
    types: ['Front'], front: true, back: false, comment: '', approved: true, edit: 1,
});

/**
 * Loads the shell with a counting archive route driven by `statusFor(mbid)`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {function(string): number} statusFor
 * @returns {Promise<{hits: Map<string, number>, setStatus: function(Function): void}>}
 */
async function openWithArchive(page, statusFor) {
    const hits = new Map();
    const state = { statusFor };

    await loadUserscriptPage(page, {
        url: RELEASE_GROUP.url,
        fixtureFile: RELEASE_GROUP.shell,
        testMode: true,
        settingsOverride: {
            // FIXTURE_SETTINGS_OVERRIDE forces artwork off for every fixture
            // spec, so the whole subject would otherwise be absent.
            sa_enable_caa_pics: true,
            sa_art_idb_enable: false,     // this is about the SESSION record
            sa_caa_pics_inline: false,    // cuts image traffic; nothing here needs it
            sa_enable_relationships_column: false,
        },
    });

    await page.route(RELEASE_GROUP.routeGlob,
        (route) => route.fulfill({ path: RELEASE_GROUP.shell, contentType: 'text/html' }));
    // Catch-all first; the narrow metadata route is registered after it and
    // therefore wins on the bare `/release/<guid>` shape.
    await page.route('https://coverartarchive.org/**',
        (route) => route.fulfill({ status: 404, body: '' }));
    await page.route(META_RE, (route) => {
        const mbid = route.request().url().match(META_RE)[1];
        hits.set(mbid, (hits.get(mbid) || 0) + 1);
        const status = state.statusFor(mbid);
        // `abort` is normally the wrong tool here and this file says so — but
        // ONE test is about the catch arm specifically, which is reachable only
        // by making fetch() throw. Asked for explicitly, never by default.
        if (status === 'abort') return route.abort();
        if (status === 200) {
            return route.fulfill({
                status: 200, contentType: 'application/json',
                body: JSON.stringify({ images: [imageFor(mbid)] }),
            });
        }
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

    await page.click(RELEASE_GROUP.button);
    await waitForRenderComplete(page, { waitForAutoResize: false });
    await clickMasterToggleAndExpandAll(page);
    return { hits, setStatus: (fn) => { state.statusFor = fn; } };
}

/**
 * Waits until the archive request count stops moving.
 *
 * Polls the COUNTER, never `waitForCaaEaaComplete()` — CLAUDE.md records that
 * the completion toast never fires on a listing of any size.
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

const failedPaths = (page) => page.evaluate(() => window.__saTest.artFailedPaths('caa'));

test.describe('CAA: recovering only what the archive could not answer', () => {
    let pageErrors;
    let MBIDS;
    let TRANSIENT;
    let ABSENT;

    test.beforeEach(({ page }) => {
        pageErrors = collectPageErrors(page);
        MBIDS = releaseMbids();
        expect(MBIDS.length, 'the shell lists releases at all').toBeGreaterThanOrEqual(3);
        [TRANSIENT, ABSENT] = MBIDS;
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('a 503 is recorded as a failure; a 404 is not', async ({ page }) => {
        test.setTimeout(120000);
        const { hits } = await openWithArchive(page, (mbid) => {
            if (mbid === TRANSIENT) return 503;
            if (mbid === ABSENT) return 404;
            return 200;
        });
        await settleArchive(hits);

        // Vacuity guard first: if the metadata route never matched, every
        // assertion below is about an empty set.
        expect(hits.get(TRANSIENT), 'the transient release was asked about').toBeGreaterThanOrEqual(1);
        expect(hits.get(ABSENT), 'the absent release was asked about').toBeGreaterThanOrEqual(1);

        const failed = await failedPaths(page);
        expect(failed, 'a 503 is "could not answer"').toContain(`/release/${TRANSIENT}`);
        // THE distinction. Recording a 404 too would put a ⚠⟳ on every page
        // that merely lists a release with no cover art.
        expect(failed, 'a 404 is "there is none", not a failure')
            .not.toContain(`/release/${ABSENT}`);

        await expect(page.locator(FAILED_BTN)).toHaveText('⚠⟳ 1');
    });

    test('a clean run records nothing and adds no control (control)', async ({ page }) => {
        test.setTimeout(120000);
        const { hits } = await openWithArchive(page, () => 200);
        await settleArchive(hits);

        expect(await failedPaths(page)).toEqual([]);
        await expect(page.locator(FAILED_BTN)).toHaveCount(0);
    });

    test('⚠⟳ re-requests only the failed release, and recovers it', async ({ page }) => {
        test.setTimeout(120000);
        const { hits, setStatus } = await openWithArchive(page,
            (mbid) => (mbid === TRANSIENT ? 503 : 200));
        await settleArchive(hits);
        await expect(page.locator(FAILED_BTN)).toHaveText('⚠⟳ 1');

        const before = new Map(hits);
        setStatus(() => 200);                       // the archive comes back
        await page.locator(FAILED_BTN).click();

        await expect.poll(async () => (await failedPaths(page)).length, { timeout: 60000 }).toBe(0);
        await expect(page.locator(FAILED_BTN), 'success clears the control').toHaveCount(0);

        // THE measurement: the one that failed was re-asked, and nothing else.
        expect(hits.get(TRANSIENT), 'the failed release was re-asked')
            .toBeGreaterThan(before.get(TRANSIENT));
        for (const m of MBIDS) {
            if (m === TRANSIENT || !before.has(m)) continue;
            expect(hits.get(m), `release ${m} answered already and must not be re-asked`)
                .toBe(before.get(m));
        }
    });

    test('the record survives a filter that hides the failed row', async ({ page }) => {
        // Keyed by entity path, not by DOM — so unlike the Relationships half,
        // this property is structural rather than argued for. Asserted through
        // __saTest because once the row is gone the count has no DOM surface.
        test.setTimeout(120000);
        const { hits } = await openWithArchive(page,
            (mbid) => (mbid === TRANSIENT ? 503 : 200));
        await settleArchive(hits);
        expect(await failedPaths(page)).toEqual([`/release/${TRANSIENT}`]);

        await page.fill('#mb-global-filter-input', 'zzz-no-such-row');
        await expect.poll(
            async () => page.evaluate(
                () => document.querySelectorAll('table.tbl tbody tr').length),
            { timeout: 30000 }).toBe(0);

        expect(await failedPaths(page), 'the record is not a view of the table')
            .toEqual([`/release/${TRANSIENT}`]);
    });

    test('a failure that recovers on its own clears the record', async ({ page }) => {
        // The NETWORK-ERROR branch, which behaves differently from a non-OK
        // status and is the only place the success-path clear can be observed.
        // A thrown request caches no zero — `_artEnrichIcon()` returns before
        // setting `enriched` — so an ordinary re-render retries the entity
        // without anyone pressing anything. What the record must then do is go
        // away by itself.
        //
        // The failed-only RETRY clears the record up front, so it can never
        // show this: that path empties the set whether or not the success arm
        // does its job.
        test.setTimeout(120000);
        let aborted = false;
        const { hits } = await openWithArchive(page, (mbid) => {
            if (mbid !== TRANSIENT || aborted) return 200;
            aborted = true;
            return 'abort';
        });
        await settleArchive(hits);

        expect(await failedPaths(page), 'a thrown request is recorded too')
            .toContain(`/release/${TRANSIENT}`);
        await expect(page.locator(FAILED_BTN)).toHaveText('⚠⟳ 1');

        // Any re-render re-enriches it: nothing was cached, so Tier 1 misses.
        const before = hits.get(TRANSIENT);
        await page.fill('#mb-global-filter-input', 'e');
        await expect.poll(async () => hits.get(TRANSIENT) > before, { timeout: 60000 }).toBe(true);

        await expect.poll(async () => (await failedPaths(page)).length, { timeout: 60000 }).toBe(0);
        await expect(page.locator(FAILED_BTN), 'and the control goes with it').toHaveCount(0);
    });
});
