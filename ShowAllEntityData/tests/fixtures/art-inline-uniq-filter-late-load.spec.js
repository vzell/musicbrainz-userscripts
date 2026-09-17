'use strict';

// Inline CAA thumbnails: the 📊 "Structure - Inline artwork" entries must render
// exactly as many rows as they count — including rows whose thumbnail settled
// late. AUDIT.md §3.1 (hypotheses H1-H3) and §10 L1-L3 (their live twins).
//
// ── Why two failure modes, and why each test isolates one ───────────────────
//
// runFilter() matches SOURCE rows (allRows / groupedRows[i].rows) while the
// dropdown counts LIVE rows. _artSetInlineSortKey() stamps the
// `.mb-inline-art-sort-key` sentinel the entries match on the LIVE <td>, after
// each fetch settles. So a filter can go wrong in two unrelated ways:
//
//   • the sentinel never reaches the source row (H1 multi-table: never at all;
//     H2 single-table: not for a thumbnail that settles after a re-render), or
//   • it does, but _filterResultCache replays an earlier pick's row list under
//     an identical key (H3, the d551df6 shape).
//
// Both read "count N, fewer rows rendered". The sort test (H2) re-renders
// WITHOUT caching any inline-art key, so a failure there cannot be a replay;
// the pick/unpick test (H3) is the user-visible sequence. Each test asserts the
// dropdown COUNT and the rendered ROWS separately, and whether the late row is
// in the DOM at all — a row that is absent was never tested.
//
// ── Controlling "late" ──────────────────────────────────────────────────────
//
// Thumbnail blobs go through the global GM_xmlhttpRequest (_artGmFetchBlob),
// resolved at call time, so the test wraps it after load: per-mbid 200 or 404,
// and chosen mbids held until window.__releaseArt(mbid). CAA metadata goes
// through page fetch() and is answered 404 here, keeping the spec network-free.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { collectPageErrors, clickMasterToggleAndExpandAll } = require('../support/liveAssertions');
const { waitForSortSettled, columnFilterInput } = require('../support/filterSortAssertions');

const SNAPSHOTS = path.join(__dirname, '..', 'snapshots');

/** "Bruce Springsteen Studio Collection" — 12 releases, tableMode 'single'. */
const SERIES = {
    url: 'https://musicbrainz.org/series/aa3694d3-a3d0-48ed-8f07-5b576de87908',
    shell: path.join(SNAPSHOTS, 'series-releases', 'raw.html'),
    routeGlob: 'https://musicbrainz.org/series/**',
    button: 'button[data-label="Show all Releases for Series"]',
};

/** "Tougher Than the Rest" — 7 releases in 2 sub-tables, tableMode 'multi'. */
const RELEASE_GROUP = {
    url: 'https://musicbrainz.org/release-group/f83d2211-dd81-4b1e-9a02-e89733891e1c',
    shell: path.join(SNAPSHOTS, 'releasegroup-releases', 'raw.html'),
    routeGlob: 'https://musicbrainz.org/release-group/**',
    button: 'button[data-label="Show all Releases for ReleaseGroup"]',
};

const ART_COLUMN = 'Release';
const SECTION = 'Structure - Inline artwork';
const YES = '🖼️ front-image available';
const NO = '∅ NO front-image available';

/**
 * Release MBIDs in document order, read from the shell the page is served from.
 *
 * @param {string} shell
 * @returns {string[]}
 */
function releaseMbids(shell) {
    const html = fs.readFileSync(shell, 'utf8');
    const seen = [];
    for (const m of html.matchAll(/href="\/release\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/g)) {
        if (!seen.includes(m[1])) seen.push(m[1]);
    }
    return seen;
}

/**
 * Loads a shell with inline artwork ON, and installs the artwork gate before
 * the Show-all click so every thumbnail request goes through it.
 *
 * @param {import('@playwright/test').Page} page
 * @param {typeof SERIES} target
 * @param {{noArt: string[], held: string[], caaMetadata?: Function}} gate - `caaMetadata`,
 *   when given, answers the CAA column's per-release metadata requests
 *   (`https://coverartarchive.org/release/<mbid>`) instead of the default 404.
 */
async function openWithArtGate(page, target, { noArt, held, caaMetadata }) {
    await loadUserscriptPage(page, {
        url: target.url,
        fixtureFile: target.shell,
        testMode: true,
        settingsOverride: {
            sa_enable_caa_pics: true,
            sa_caa_pics_inline: true,
            sa_enable_relationships_column: false,
        },
    });
    await page.route(target.routeGlob,
        (route) => route.fulfill({ path: target.shell, contentType: 'text/html' }));
    await page.route('https://coverartarchive.org/**', (route) => route.fulfill({ status: 404, body: '' }));
    if (caaMetadata) {
        // Registered after the catch-all, so it takes precedence for exactly
        // the metadata URLs; image thumbnails still fall through to the 404.
        await page.route(/^https:\/\/coverartarchive\.org\/release\/[0-9a-f-]{36}$/, caaMetadata);
    }

    await page.evaluate(({ noArt: no, held: hold }) => {
        const original = window.GM_xmlhttpRequest;
        const noSet = new Set(no);
        const holdSet = new Set(hold);
        const queued = new Map();
        window.__artRequests = [];
        // The table the dropdown helper operates on: the first one whose header
        // has a column named `col` — getUniqDropSections() resolves the same way.
        window.__artTable = (col) => Array.from(document.querySelectorAll('table.tbl thead th'))
            .find((t) => t.dataset.colName === col).closest('table');
        const answer = (opts, mbid) => setTimeout(() => {
            if (noSet.has(mbid)) {
                opts.onload({ status: 404, response: null, responseText: '' });
            } else {
                opts.onload({ status: 200, response: new Blob(['x'], { type: 'image/png' }), responseText: '' });
            }
        }, 0);
        window.GM_xmlhttpRequest = (opts) => {
            const m = /\/release\/([0-9a-f-]{36})\/front-/.exec((opts && opts.url) || '');
            if (!m) return original(opts);
            const mbid = m[1];
            window.__artRequests.push(mbid);
            if (holdSet.has(mbid)) {
                if (!queued.has(mbid)) queued.set(mbid, []);
                queued.get(mbid).push(opts);
            } else {
                answer(opts, mbid);
            }
            return { abort() {} };
        };
        window.__releaseArt = (mbid) => {
            holdSet.delete(mbid);
            const pending = queued.get(mbid) || [];
            queued.delete(mbid);
            pending.forEach((opts) => answer(opts, mbid));
            return pending.length;
        };
    }, { noArt, held });

    await page.click(target.button);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/** Settled sentinels in the target table, and page-wide. */
const sentinelCounts = (page) => page.evaluate((col) => {
    const table = window.__artTable(col);
    return {
        table: table.querySelectorAll('tbody .mb-inline-art-sort-key').length,
        page: document.querySelectorAll('table.tbl tbody .mb-inline-art-sort-key').length,
    };
}, ART_COLUMN);

/** Rendered rows in the target table — runFilter() REMOVES non-matching rows. */
const renderedRows = (page) => page.evaluate((col) => {
    const table = window.__artTable(col);
    return Array.from(table.querySelectorAll('tbody tr')).filter((r) => r.style.display !== 'none').length;
}, ART_COLUMN);

/** Whether a release's row is in the target table's DOM at all. */
const rowInDom = (page, mbid) => page.evaluate(({ col, id }) => {
    const table = window.__artTable(col);
    return !!table.querySelector(`tbody a[href="/release/${id}"]`);
}, { col: ART_COLUMN, id: mbid });

/**
 * Opens a column's 📊 dropdown and reads one synthetic entry's count.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} label - the entry's `data-mb-uniq-syn-label`
 * @param {{column?: string, section?: string}} [where] - defaults to the
 *   inline-artwork entries of `ART_COLUMN`
 * @returns {Promise<?number>} null when the entry is absent
 */
async function entryCount(page, label, { column = ART_COLUMN, section = SECTION } = {}) {
    const sections = await page.evaluate((c) => window.__saTest.getUniqDropSections(c), column);
    const found = (sections || []).find((s) => s.label === section);
    const entry = found && found.items.find((i) => i.label === label);
    return entry ? entry.count : null;
}

/**
 * Clicks one synthetic entry in the open dropdown (toggles it).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} label
 * @param {{section?: string}} [where]
 */
async function clickEntry(page, label, { section = SECTION } = {}) {
    await page.evaluate(({ sectionLabel, entryLabel }) => {
        const sectionEl = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
            .find((s) => s.querySelector('.mb-uniq-section-label')?.textContent === sectionLabel);
        Array.from(sectionEl.querySelectorAll('.mb-col-uniq-item'))
            .find((el) => el.dataset.mbUniqSynLabel === entryLabel).click();
    }, { sectionLabel: section, entryLabel: label });
}

/** Closes the dropdown through its own outside-mousedown handler. */
async function closeDropdown(page) {
    await page.evaluate(() => document.body.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, cancelable: true })));
    await expect(page.locator('#mb-col-uniq-dropdown')).toBeHidden({ timeout: 5000 });
}

/**
 * Opens the dropdown, reads the entry's count, clicks it, closes the dropdown.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} label
 * @param {{column?: string, section?: string}} [where]
 * @returns {Promise<?number>} the count the entry advertised when clicked
 */
async function pick(page, label, where = {}) {
    const count = await entryCount(page, label, where);
    expect(count, `the "${label}" entry is offered`).not.toBeNull();
    await clickEntry(page, label, where);
    await closeDropdown(page);
    return count;
}

/**
 * A Node-side gate for the CAA column's metadata requests: every request waits
 * until its mbid is released, then gets one "Front" image.
 *
 * @returns {{handler: Function, release: Function, releaseAll: Function, requested: Set<string>}}
 */
function caaMetadataGate() {
    const waiting = new Map();
    const released = new Set();
    const requested = new Set();
    let open = false;
    const body = (mbid) => JSON.stringify({
        images: [{
            id: 1, types: ['Front'], front: true, back: false, comment: '', approved: true,
            image: `https://coverartarchive.org/release/${mbid}/1.jpg`,
            thumbnails: { 250: `https://coverartarchive.org/release/${mbid}/1-250.jpg` },
        }],
    });
    const handler = async (route) => {
        const mbid = route.request().url().split('/').pop();
        requested.add(mbid);
        if (!open && !released.has(mbid)) {
            await new Promise((resolve) => {
                if (!waiting.has(mbid)) waiting.set(mbid, []);
                waiting.get(mbid).push(resolve);
            });
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body: body(mbid) }).catch(() => {});
    };
    const release = (mbid) => {
        released.add(mbid);
        (waiting.get(mbid) || []).forEach((resolve) => resolve());
        waiting.delete(mbid);
    };
    const releaseAll = () => {
        open = true;
        Array.from(waiting.keys()).forEach(release);
    };
    return { handler, release, releaseAll, requested };
}

test.describe('Inline artwork 📊: rendered rows match the entry count', () => {
    let pageErrors;

    test.beforeEach(async ({ page }) => {
        pageErrors = collectPageErrors(page);
        page.on('pageerror', (e) => pageErrors.push(`stack: ${e.stack}`));
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('single-table baseline: every thumbnail settled before any interaction', async ({ page }) => {
        const ids = releaseMbids(SERIES.shell);
        expect(ids).toHaveLength(12);
        const noArt = [ids[2], ids[5]];
        await openWithArtGate(page, SERIES, { noArt, held: [] });

        await expect.poll(async () => (await sentinelCounts(page)).table, {
            timeout: 20000, message: 'all 12 thumbnails settle',
        }).toBe(12);

        expect(await pick(page, YES), 'yes count').toBe(10);
        await expect.poll(() => renderedRows(page), {
            timeout: 15000, message: 'single baseline: "front-image available" renders its 10 rows',
        }).toBe(10);

        await pick(page, YES);
        await expect.poll(() => renderedRows(page), { timeout: 15000, message: 'uncheck restores 12' }).toBe(12);

        expect(await pick(page, NO), 'no count').toBe(2);
        await expect.poll(() => renderedRows(page), {
            timeout: 15000, message: 'single baseline: "NO front-image available" renders its 2 rows',
        }).toBe(2);
    });

    test('single-table H2: a thumbnail that settles after a sort is still filterable', async ({ page }) => {
        const ids = releaseMbids(SERIES.shell);
        const late = ids[0];
        const noArt = [ids[2], ids[5]];
        await openWithArtGate(page, SERIES, { noArt, held: [late] });

        await expect.poll(async () => (await sentinelCounts(page)).table, {
            timeout: 20000, message: 'the 11 un-held thumbnails settle',
        }).toBe(11);
        expect(await page.evaluate((m) => window.__artRequests.includes(m), late),
            'the held thumbnail was requested, i.e. it is genuinely pending').toBe(true);

        // A re-render that caches no inline-art filter key: whatever goes wrong
        // after this cannot be a replayed row list.
        await waitForSortSettled(page, () => page.locator('.sort-icon-btn', { hasText: '▲' }).first().click());

        expect(await page.evaluate((m) => window.__releaseArt(m), late),
            'at least one queued request for the late thumbnail').toBeGreaterThan(0);
        await expect.poll(async () => (await sentinelCounts(page)).table, {
            timeout: 20000, message: 'the late thumbnail settles on the live table',
        }).toBe(12);

        expect(await pick(page, YES), 'the entry counts the late row').toBe(10);
        await expect.poll(() => renderedRows(page), {
            timeout: 15000, message: 'H2: all 10 "front-image available" rows render, including the late one',
        }).toBe(10);
        expect(await rowInDom(page, late), 'H2: the late row is rendered').toBe(true);
    });

    test('single-table H2b: a 404 that arrives after a sort is still filterable', async ({ page }) => {
        // The error path stamps the closure's <td> with no isConnected guard,
        // and on a single-table page that <td> is the source cell — so a late
        // "no" is predicted to reach allRows where a late "yes" does not (H2).
        // Pins that asymmetry, so a fix for H2 cannot silently break it.
        const ids = releaseMbids(SERIES.shell);
        const late = ids[2];
        const noArt = [ids[2], ids[5]];
        await openWithArtGate(page, SERIES, { noArt, held: [late] });

        await expect.poll(async () => (await sentinelCounts(page)).table, {
            timeout: 20000, message: 'the 11 un-held thumbnails settle',
        }).toBe(11);

        await waitForSortSettled(page, () => page.locator('.sort-icon-btn', { hasText: '▲' }).first().click());

        expect(await page.evaluate((m) => window.__releaseArt(m), late),
            'at least one queued request for the late 404').toBeGreaterThan(0);
        await expect.poll(async () => (await sentinelCounts(page)).table, {
            timeout: 20000, message: 'the late 404 settles on the live table',
        }).toBe(12);

        expect(await pick(page, NO), 'the entry counts the late 404').toBe(2);
        await expect.poll(() => renderedRows(page), {
            timeout: 15000, message: 'H2b: both "NO front-image available" rows render, including the late one',
        }).toBe(2);
        expect(await rowInDom(page, late), 'H2b: the late row is rendered').toBe(true);
    });

    test('single-table H3: picking the entry again after a late thumbnail includes it', async ({ page }) => {
        const ids = releaseMbids(SERIES.shell);
        const late = ids[0];
        const noArt = [ids[2], ids[5]];
        await openWithArtGate(page, SERIES, { noArt, held: [late] });

        await expect.poll(async () => (await sentinelCounts(page)).table, {
            timeout: 20000, message: 'the 11 un-held thumbnails settle',
        }).toBe(11);

        expect(await pick(page, YES), 'first pick counts the 9 settled yes rows').toBe(9);
        await expect.poll(() => renderedRows(page), { timeout: 15000, message: 'first pick renders 9' }).toBe(9);

        await pick(page, YES);
        await expect.poll(() => renderedRows(page), { timeout: 15000, message: 'uncheck restores 12' }).toBe(12);

        expect(await page.evaluate((m) => window.__releaseArt(m), late),
            'at least one queued request for the late thumbnail').toBeGreaterThan(0);
        await expect.poll(async () => (await sentinelCounts(page)).table, {
            timeout: 20000, message: 'the late thumbnail settles on the live table',
        }).toBe(12);

        expect(await pick(page, YES), 'second pick counts the late row too').toBe(10);
        await expect.poll(() => renderedRows(page), {
            timeout: 15000, message: 'H3: the second pick renders all 10 rows, not the first pick\'s 9',
        }).toBe(10);
        expect(await rowInDom(page, late), 'H3: the late row is rendered').toBe(true);
    });

    test('multi-table control: an ordinary 📊 entry filters the first sub-table', async ({ page }) => {
        // The same pick-and-count sequence as the H1 test below, on an entry
        // that has nothing to do with artwork. If this fails, the H1 test's
        // row count proves nothing about the sentinel.
        const ids = releaseMbids(RELEASE_GROUP.shell);
        await openWithArtGate(page, RELEASE_GROUP, { noArt: [ids[0], ids[ids.length - 1]], held: [] });
        await clickMasterToggleAndExpandAll(page);
        await expect.poll(async () => (await sentinelCounts(page)).page, {
            timeout: 20000, message: 'all 7 thumbnails settle',
        }).toBe(7);

        const all = await renderedRows(page);
        const where = { column: 'Country', section: 'Country details - Code' };
        const count = await pick(page, '» country code: AU', where);
        expect(count, 'the control entry matches some rows but not all').toBeGreaterThan(0);
        expect(count).toBeLessThan(all);
        await expect.poll(() => renderedRows(page), {
            timeout: 15000, message: 'multi control: the country-code entry renders as many rows as it counts',
        }).toBe(count);
    });

    test('multi-table H1 baseline: every thumbnail settled before any interaction', async ({ page }) => {
        const ids = releaseMbids(RELEASE_GROUP.shell);
        expect(ids).toHaveLength(7);
        await openWithArtGate(page, RELEASE_GROUP, { noArt: [ids[0], ids[ids.length - 1]], held: [] });
        await clickMasterToggleAndExpandAll(page);

        await expect.poll(async () => (await sentinelCounts(page)).page, {
            timeout: 20000, message: 'all 7 thumbnails settle',
        }).toBe(7);

        const { table: settledHere } = await sentinelCounts(page);
        const yes = await entryCount(page, YES);
        const no = await entryCount(page, NO);
        await closeDropdown(page);
        expect((yes || 0) + (no || 0), 'the entries cover every row of the first sub-table').toBe(settledHere);
        expect(yes, 'the first sub-table has at least one row with art').toBeGreaterThan(0);

        expect(await pick(page, YES), 'yes count').toBe(yes);
        await expect.poll(() => renderedRows(page), {
            timeout: 15000, message: 'H1: "front-image available" renders as many rows as it counts',
        }).toBe(yes);

        if (no) {
            await pick(page, YES);
            await expect.poll(() => renderedRows(page), {
                timeout: 15000, message: 'uncheck restores the sub-table',
            }).toBe(settledHere);
            expect(await pick(page, NO), 'no count').toBe(no);
            await expect.poll(() => renderedRows(page), {
                timeout: 15000, message: 'H1: "NO front-image available" renders as many rows as it counts',
            }).toBe(no);
        }
    });
    test('multi-table H1, typed: a "caa-inline-yes" column filter renders as many rows as the entry counts', async ({ page }) => {
        // testRowMatch()'s exact-sentinel bypass reads the same state as the
        // 📊 structure modes, from the same SOURCE rows — so it failed on
        // multi-table pages in exactly the same way.
        const ids = releaseMbids(RELEASE_GROUP.shell);
        await openWithArtGate(page, RELEASE_GROUP, { noArt: [ids[0], ids[ids.length - 1]], held: [] });
        await clickMasterToggleAndExpandAll(page);
        await expect.poll(async () => (await sentinelCounts(page)).page, {
            timeout: 20000, message: 'all 7 thumbnails settle',
        }).toBe(7);

        const yes = await entryCount(page, YES);
        await closeDropdown(page);
        expect(yes, 'the first sub-table has at least one row with art').toBeGreaterThan(0);

        const colIdx = await page.evaluate((col) => Array.from(
            window.__artTable(col).querySelectorAll('thead tr:first-child th'))
            .findIndex((t) => t.dataset.colName === col), ART_COLUMN);
        const input = columnFilterInput(page, colIdx);
        await input.click();
        await input.pressSequentially('caa-inline-yes');
        await expect.poll(() => renderedRows(page), {
            timeout: 15000, message: 'H1 typed: "caa-inline-yes" renders as many rows as "front-image available" counts',
        }).toBe(yes);
    });

    test('multi-table H4: picking a CAA image-type entry again after late metadata includes the late row', async ({ page }) => {
        // CAA column (not the inline thumbnail): _artBuildMultiRowArtCell() ->
        // _artSyncSearchTextToSourceRow() DOES sync the image types onto the
        // source row, so the only suspect left is a replayed row list.
        const gate = caaMetadataGate();
        try {
            await openWithArtGate(page, RELEASE_GROUP, { noArt: [], held: [], caaMetadata: gate.handler });
            await clickMasterToggleAndExpandAll(page);

            const firstTableMbids = await page.evaluate((col) => Array.from(
                window.__artTable(col).querySelectorAll('tbody a[href*="/cover-art"]'))
                .map((a) => a.getAttribute('href').split('/')[2]), ART_COLUMN);
            expect(firstTableMbids.length, 'the first sub-table has several CAA cells').toBeGreaterThan(2);
            const late = firstTableMbids[0];
            [...new Set([...gate.requested, ...releaseMbids(RELEASE_GROUP.shell)])]
                .filter((m) => m !== late).forEach((m) => gate.release(m));

            const badges = () => page.evaluate((col) => window.__artTable(col)
                .querySelectorAll('tbody .mb-caa-count-badge').length, ART_COLUMN);
            const rows = await renderedRows(page);
            await expect.poll(badges, {
                timeout: 20000, message: 'every CAA cell but the held one settles',
            }).toBe(rows - 1);

            const where = { column: 'CAA', section: 'CAA info - Type' };
            const FRONT = '» image type: Front';
            expect(await pick(page, FRONT, where), 'first pick counts the settled cells').toBe(rows - 1);
            await expect.poll(() => renderedRows(page), {
                timeout: 15000, message: 'first pick renders the settled cells',
            }).toBe(rows - 1);

            await pick(page, FRONT, where);
            await expect.poll(() => renderedRows(page), { timeout: 15000, message: 'uncheck restores the sub-table' }).toBe(rows);

            gate.release(late);
            await expect.poll(badges, {
                timeout: 20000, message: 'the late CAA cell settles on the live table',
            }).toBe(rows);

            expect(await pick(page, FRONT, where), 'second pick counts the late row too').toBe(rows);
            await expect.poll(() => renderedRows(page), {
                timeout: 15000, message: 'H4: the second pick renders every row, not the first pick\'s',
            }).toBe(rows);
            expect(await rowInDom(page, late), 'H4: the late row is rendered').toBe(true);
        } finally {
            gate.releaseAll();
        }
    });
    test('multi-table H4 isolation: late CAA metadata after a sort is synced to the source row', async ({ page }) => {
        // Same late metadata as the H4 test, but the re-render in between is a
        // sort, which caches no image-type key. If this passes while H4 fails,
        // the source-row sync works and H4 is purely a replayed row list.
        const gate = caaMetadataGate();
        try {
            await openWithArtGate(page, RELEASE_GROUP, { noArt: [], held: [], caaMetadata: gate.handler });
            await clickMasterToggleAndExpandAll(page);

            const firstTableMbids = await page.evaluate((col) => Array.from(
                window.__artTable(col).querySelectorAll('tbody a[href*="/cover-art"]'))
                .map((a) => a.getAttribute('href').split('/')[2]), ART_COLUMN);
            const late = firstTableMbids[0];
            [...new Set([...gate.requested, ...releaseMbids(RELEASE_GROUP.shell)])]
                .filter((m) => m !== late).forEach((m) => gate.release(m));

            const badges = () => page.evaluate((col) => window.__artTable(col)
                .querySelectorAll('tbody .mb-caa-count-badge').length, ART_COLUMN);
            const rows = await renderedRows(page);
            await expect.poll(badges, {
                timeout: 20000, message: 'every CAA cell but the held one settles',
            }).toBe(rows - 1);

            const h3 = page.locator('h3.mb-toggle-h3').first();
            await waitForSortSettled(page,
                () => page.evaluate((col) => window.__artTable(col)
                    .querySelector('thead .sort-icon-btn:not(:empty)').click(), ART_COLUMN),
                { statusLocator: h3.locator('.mb-sort-status') });

            gate.release(late);
            await expect.poll(badges, {
                timeout: 20000, message: 'the late CAA cell settles on the live table',
            }).toBe(rows);

            const where = { column: 'CAA', section: 'CAA info - Type' };
            expect(await pick(page, '» image type: Front', where), 'the pick counts the late row').toBe(rows);
            await expect.poll(() => renderedRows(page), {
                timeout: 15000, message: 'H4 isolation: a pick after a sort renders every row',
            }).toBe(rows);
        } finally {
            gate.releaseAll();
        }
    });
});
