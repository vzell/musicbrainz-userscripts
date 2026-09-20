'use strict';

// The per-table artwork summary panel (org/503-handling.org, "zone 2 opens an
// artwork summary for the table").
//
// ── Why it exists ───────────────────────────────────────────────────────────
//
// The only place artwork state was reported at all was
// `_showCaaCompletionToast()` — page-wide, transient, and fired on the queue's
// `onIdle`. CLAUDE.md records that on a large listing that toast NEVER FIRES
// (measured still hidden after 300 s while artwork was visibly painting), so on
// exactly the pages where a user most wants to know what happened there was
// nothing to look at.
//
// It also surfaces four fields the archive publishes on every image and the
// script stored but showed nowhere: `edit` (a link to the edit that added the
// cover), `front`/`back` (the archive's own "this is THE main front", which is
// NOT the same as 'Front' being in `types`), and the thumbnail ladder.
//
// ── What each test pins, and the adjacent property it avoids ────────────────
//
//  1. IT READS CURRENT STATE, MID-LOAD. The trap the design names first. A
//     panel gated on completion would reproduce the toast's own defect, so the
//     test opens it with lookups still outstanding and asserts it reports them
//     as outstanding rather than refusing to open or reporting zero.
//  2. IT REPORTS THE HIDDEN FIELDS. Asserted on `front` vs `types` DISAGREEING
//     — a fixture where every Front-typed image were also the main front would
//     pass on code that conflated them, which is exactly the distinction the
//     design says is invisible today.
//  3. IT DECLARES ITS SCOPE. `runFilter()` REMOVES non-matching rows, so the
//     tally is of what is shown. The panel must say so when a filter is active,
//     rather than reporting a filtered subset as the whole table.
//  4. IT COSTS NO REQUESTS. The whole point is that the record is already
//     cached; the archive has no batch endpoint, so anything it could not
//     answer from cache would be one request per entity.
//
// Network-free. Archive route shape from caa-metadata-transient-503.spec.js,
// including its two traps: `route.fulfill({status})` never `route.abort()`, and
// `sa_caa_pics_big` must stay ON or the ⟳ this button anchors on is never made.

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
const PANEL = '#mb-art-summary-panel';
const SUMMARY_BTN = '#mb-caa-toggle-btn-summary-0';

function releaseMbids() {
    const html = fs.readFileSync(RELEASE_GROUP.shell, 'utf8');
    const out = [];
    const re = /href="\/release\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/g;
    let m;
    while ((m = re.exec(html)) !== null) if (!out.includes(m[1])) out.push(m[1]);
    return out;
}

/**
 * Two images per release, shaped so the panel's distinctions are testable.
 *
 * Image 1 is typed Front AND is the main front. Image 2 is ALSO typed Front but
 * is NOT the main front, and is unapproved and missing its 1200 thumbnail. So
 * "Front" in `types` and `front: true` disagree by construction — a fixture
 * where they agreed would pass on code that conflated them.
 */
const bodyFor = (mbid) => JSON.stringify({
    images: [
        {
            id: '1', image: `https://coverartarchive.org/release/${mbid}/1.jpg`,
            thumbnails: {
                250: `https://coverartarchive.org/release/${mbid}/1-250.jpg`,
                500: `https://coverartarchive.org/release/${mbid}/1-500.jpg`,
                1200: `https://coverartarchive.org/release/${mbid}/1-1200.jpg`,
            },
            types: ['Front'], front: true, back: false, comment: '', approved: true, edit: 111,
        },
        {
            id: '2', image: `https://coverartarchive.org/release/${mbid}/2.jpg`,
            thumbnails: { 250: `https://coverartarchive.org/release/${mbid}/2-250.jpg` },
            types: ['Front', 'Booklet'], front: false, back: false, comment: '',
            approved: false, edit: 222,
        },
    ],
});

/**
 * @param {import('@playwright/test').Page} page
 * @param {?function(string): ?{hold?: boolean, status?: number}} respond
 */
async function openWithArchive(page, respond) {
    const hits = new Map();
    const held = [];
    const state = { respond };

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
    await page.route(META_RE, async (route) => {
        const mbid = route.request().url().match(META_RE)[1];
        hits.set(mbid, (hits.get(mbid) || 0) + 1);
        const r = (state.respond && state.respond(mbid)) || {};
        if (r.hold) {
            // Held open, never aborted: an abort would resolve as a network
            // error and be RECORDED as a failure, which is a different state
            // from "still outstanding" and would make test 1 meaningless.
            await new Promise((resolve) => held.push(resolve));
        }
        if (r.status && r.status !== 200) {
            return route.fulfill({ status: r.status, contentType: 'text/plain', body: '' });
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: bodyFor(mbid) });
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
    return { hits, releaseHeld: () => held.splice(0).forEach((r) => r()) };
}

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

/**
 * The panel's chips as label -> count, across every section.
 *
 * Labels are unique across sections in this fixture; a future group that
 * reused one would need scoping by section.
 */
const panelRows = (page) => page.evaluate(() => Array.from(
    document.querySelectorAll('#mb-art-summary-panel .mb-art-sum-chip'))
    .map((c) => [
        (c.querySelector('span') || {}).textContent.trim(),
        (c.querySelector('b') || {}).textContent,
    ]));
const valueOf = (rows, key) => (rows.find(([k]) => k === key) || [])[1];

test.describe('CAA artwork summary panel', () => {
    let pageErrors;

    test.beforeEach(({ page }) => {
        pageErrors = collectPageErrors(page);
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('reports the archive fields nothing else surfaces', async ({ page }) => {
        test.setTimeout(120000);
        const { hits } = await openWithArchive(page, null);
        await settleArchive(hits);

        const requestsBefore = [...hits.values()].reduce((a, b) => a + b, 0);
        await page.locator(SUMMARY_BTN).click();
        await expect(page.locator(PANEL)).toBeVisible();

        const rows = await panelRows(page);
        // Asserted RELATIVE to the panel's own entity count, not to the page's
        // request count: this panel covers one sub-table (Official, 6 releases)
        // while the page asked about 7. A test keyed on `hits.size` measures
        // the wrong scope and fails for a reason that has nothing to do with
        // the code — which is how the first draft of this failed.
        const withArt = Number(valueOf(rows, 'with artwork'));
        expect(withArt, 'the sub-table has artwork to report on').toBeGreaterThan(0);
        expect(valueOf(rows, 'total'), 'two images per release').toBe(String(2 * withArt));

        // `front` vs `types` DISAGREE in the fixture: every release has two
        // Front-typed images but only one main front. Code that read
        // "'Front' in types" would report 2x here.
        expect(valueOf(rows, 'Front'), 'images TYPED Front').toBe(String(2 * withArt));
        expect(valueOf(rows, 'main front'), "the archive's own main-front flag")
            .toBe(String(withArt));
        expect(valueOf(rows, 'Booklet')).toBe(String(withArt));
        expect(valueOf(rows, 'main back')).toBe('0');
        expect(valueOf(rows, 'unapproved'), 'approved:false is surfaced nowhere else')
            .toBe(String(withArt));

        // The thumbnail ladder: image 2 has only a 250.
        expect(valueOf(rows, '1200')).toBe(String(withArt));
        expect(valueOf(rows, '500')).toBe(String(withArt));
        expect(valueOf(rows, '250')).toBe(String(2 * withArt));

        // Edit ids, linked — the single most useful field in the record for an
        // editor, and dead weight in the cache until now.
        const editHrefs = await page.locator(`${PANEL} a.mb-art-sum-edit`)
            .evaluateAll((as) => as.map((a) => a.getAttribute('href')));
        expect(editHrefs.length).toBeGreaterThan(0);
        expect(editHrefs.some((h) => h.endsWith('/edit/111'))).toBe(true);
        expect(editHrefs.some((h) => h.endsWith('/edit/222'))).toBe(true);

        // Costs nothing: the record was already cached.
        expect([...hits.values()].reduce((a, b) => a + b, 0)).toBe(requestsBefore);
    });

    test('opens MID-LOAD and reports what is still outstanding', async ({ page }) => {
        // The trap the design names first. A panel gated on the queue draining
        // would reproduce _showCaaCompletionToast()'s own defect — on a large
        // listing that toast never fires at all.
        test.setTimeout(120000);
        const MBIDS = releaseMbids();
        const HELD = MBIDS[0];
        const { hits, releaseHeld } = await openWithArchive(page,
            (mbid) => (mbid === HELD ? { hold: true } : null));

        // Wait until everything EXCEPT the held one has been asked about.
        await expect.poll(() => hits.size, { timeout: 60000 }).toBeGreaterThan(1);
        await page.waitForTimeout(1500);

        await page.locator(SUMMARY_BTN).click();
        await expect(page.locator(PANEL), 'the panel opens while a lookup is in flight')
            .toBeVisible();

        const rows = await panelRows(page);
        expect(Number(valueOf(rows, 'with artwork')), 'what has already arrived')
            .toBeGreaterThan(0);
        expect(Number(valueOf(rows, 'pending')), 'and what has not')
            .toBeGreaterThan(0);

        releaseHeld();
    });

    test('says so when a filter is hiding rows', async ({ page }) => {
        test.setTimeout(120000);
        const { hits } = await openWithArchive(page, null);
        await settleArchive(hits);

        await page.locator(SUMMARY_BTN).click();
        const clean = await page.locator(`${PANEL} .mb-art-sum-scope`).textContent();
        expect(clean).toContain('entities in this table');
        expect(clean).not.toContain('filter');
        await page.keyboard.press('Escape');

        await page.fill('#mb-global-filter-input', 'Tougher');
        await page.waitForTimeout(1500);
        await page.locator(SUMMARY_BTN).click();

        const scoped = await page.locator(`${PANEL} .mb-art-sum-scope`).textContent();
        expect(scoped, 'the tally is of what is SHOWN, and the panel says so')
            .toContain('a filter is active');
        expect(scoped).toContain('currently SHOWN');
    });

    test('lists what could not be fetched, and offers to retry just those',
        async ({ page }) => {
            test.setTimeout(120000);
            const MBIDS = releaseMbids();
            const FAILED = MBIDS[0];
            const { hits } = await openWithArchive(page,
                (mbid) => (mbid === FAILED ? { status: 503 } : null));
            await settleArchive(hits);

            await page.locator(SUMMARY_BTN).click();
            const rows = await panelRows(page);
            expect(valueOf(rows, 'failed')).toBe('1');

            await expect(page.locator(`${PANEL} a[href$="/release/${FAILED}"]`),
                'the failing entity is named and linked').toHaveCount(1);

            // Zone 2 explains, zone 4 acts — and from inside the panel too.
            const act = page.locator(`${PANEL} .mb-art-sum-act`);
            await expect(act).toHaveCount(1);
            const before = hits.get(FAILED);
            await act.click();
            await expect.poll(() => hits.get(FAILED), { timeout: 60000 }).toBeGreaterThan(before);
            await expect(page.locator(PANEL), 'acting closes the panel').toBeHidden();
        });

});
