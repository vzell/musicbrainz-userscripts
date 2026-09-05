'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForFilterSettled, waitForSortSettled } = require('../support/filterSortAssertions');

// The BATCHED millisecond source: pageTypes whose table is not one entity's
// relationship list, so no single lookup covers it — an artist's recordings,
// an instrument's, an ISRC's, a search result.
//
// It is keyed on the recording MBIDs the page actually renders, chunked 100 at
// a time through /ws/2/recording?query=rid:(…). The deliberately-not-taken
// alternative was the ?artist= BROWSE endpoint, whose cost is set by the
// artist's whole catalogue instead: Bruce Springsteen's recording-count is
// 74,540, i.e. 746 requests, whether the page shows ten rows or ten thousand.
// It also cannot serve instrument-recordings at all, whose entity lookup
// returns zero recording relations for a page listing a hundred of them.
//
// What is asserted here is therefore mostly about REQUEST BEHAVIOUR: how many
// go out, what they ask for, when they are skipped, and what happens when some
// of them fail — see scripts/build-ms-batch-fixture.py for the fixture's shape.
const ARTIST_URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/recordings';
const FIXTURE_FILE = path.join(__dirname, 'artist-recordings-ms-batch.html');

const ROWS = 130;
const UNKNOWN_ROW = 7;
const MISMATCH_ROW = 11;

// Same derivation the fixture generator uses, so the spec carries a rule
// rather than a 130-entry table.
const mbid = (i) => `aaaaaaaa-bbbb-4ccc-8ddd-${String(i).padStart(12, '0')}`;
const seconds = (i) => 60 + i;
const fmtSec = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
const msFor = (i) => seconds(i) * 1000 + ((i * 7) % 500);
const fmtMs = (i) => `${fmtSec(seconds(i))}.${String(msFor(i) % 1000).padStart(3, '0')}`;

/** What the column reads before any fetch. */
const SECONDS = Array.from({ length: ROWS }, (_, i) => (i === UNKNOWN_ROW ? '?:??' : fmtSec(seconds(i))));
/** What it should read once every batch has landed. */
const MILLIS = Array.from({ length: ROWS }, (_, i) => {
    if (i === UNKNOWN_ROW) return '?:??';        // nothing on record — stays unknown
    if (i === MISMATCH_ROW) return fmtSec(seconds(i));  // discarded — stays as MusicBrainz rendered it
    return fmtMs(i);
});

/**
 * Installs the fixture plus a recording-search mock that answers each batch
 * from the MBIDs that batch actually asked for.
 *
 * The mock deliberately does NOT serve a canned body: reading the `rid:` list
 * back out of the URL is what proves the chunking asked for the right MBIDs,
 * and lets `failBatches` fail a specific one.
 *
 * @param {{failBatches?: number[], failStatus?: number}} [opts]
 *   `failBatches` lists 0-based batch ordinals to answer with `failStatus`
 *   (default 503) on EVERY attempt.
 */
async function setup(page, { failBatches = [], failStatus = 503 } = {}) {
    const calls = [];
    await page.route('**/ws/2/recording?**', (route) => {
        const url = new URL(route.request().url());
        const query = url.searchParams.get('query') || '';
        const ids = (query.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g) || []);
        const ordinal = calls.length;
        calls.push({ ids, limit: url.searchParams.get('limit'), query });

        // Which batch is this? Attempts of the same batch repeat its MBIDs, so
        // identity is the id list, not the call ordinal.
        const firstSeen = calls.findIndex((c) => c.ids[0] === ids[0]);
        const batchIndex = new Set(calls.slice(0, firstSeen + 1).map((c) => c.ids[0])).size - 1;
        if (failBatches.includes(batchIndex)) {
            route.fulfill({ status: failStatus, contentType: 'application/json', body: '{"error":"busy"}' });
            return;
        }

        const recordings = ids.map((id) => {
            const i = Number(id.slice(-12));
            // The mismatch row's service value is three seconds off what the
            // page displays, which must be rejected rather than rendered.
            const length = i === MISMATCH_ROW ? msFor(i) + 3000 : msFor(i);
            return { id, length };
        });
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ count: recordings.length, recordings }),
        });
    });

    await loadUserscriptPage(page, { url: ARTIST_URL, fixtureFile: FIXTURE_FILE, testMode: true });
    await page.route(`${ARTIST_URL}?**`, (route) => route.fulfill({ path: FIXTURE_FILE, contentType: 'text/html' }));
    await page.click('button[data-label="⊚ All recordings"]');
    await page.waitForSelector('#mb-filter-container');
    return calls;
}

/** Reads the rendered "Length" column, in row order. */
async function lengthValues(page) {
    return page.evaluate(() => {
        const out = [];
        document.querySelectorAll('table.tbl').forEach((tbl) => {
            const ths = Array.from(tbl.querySelectorAll('thead th'));
            const idx = ths.findIndex((t) => (t.dataset.colName || '') === 'Length');
            if (idx < 0) return;
            tbl.querySelectorAll('tbody tr').forEach((tr) => {
                if (tr.style.display === 'none' || tr.classList.contains('subh')) return;
                const td = tr.cells[idx];
                if (td) out.push(td.textContent.replace(/\s+/g, ''));
            });
        });
        return out;
    });
}

const toggle = (page) => page.locator('.mb-ms-col-hdr-btn').first();

/** Distinct batches actually requested, ignoring retry attempts. */
const distinctBatches = (calls) => new Set(calls.map((c) => c.ids[0])).size;

test.describe('artist-recordings: millisecond Length precision via batched lookups', () => {
    test('the toggle is offered, quotes its cost, and fetches nothing until pressed', async ({ page }) => {
        const calls = await setup(page);

        await expect(toggle(page)).toHaveCount(1);
        await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
        expect(await lengthValues(page)).toEqual(SECONDS);

        // 129 collectable rows over batches of 100 — the tooltip says two,
        // because that is what pressing would actually spend.
        expect(await toggle(page).getAttribute('title')).toContain('up to 2 MusicBrainz Web Service requests');

        // Rendering must not have touched the Web Service.
        expect(calls.length).toBe(0);
    });

    test('pressing it chunks the page into batches of at most 100 and reveals the values', async ({ page }) => {
        const calls = await setup(page);
        await toggle(page).click();
        await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');

        expect(calls.length).toBe(2);
        expect(calls[0].ids.length).toBe(100);
        expect(calls[1].ids.length).toBe(29);
        // 100 is the measured ceiling of the search endpoint's own limit, not
        // an arbitrary chunk size — asking for more silently drops the rest.
        expect(calls.every((c) => c.limit === '100')).toBe(true);
        expect(calls.every((c) => c.query.startsWith('rid:('))).toBe(true);

        // Every collectable MBID was asked for exactly once, and the "?:??"
        // row — which has no seconds text to check an answer against — was
        // never asked for at all.
        const asked = calls.flatMap((c) => c.ids);
        expect(new Set(asked).size).toBe(ROWS - 1);
        expect(asked).not.toContain(mbid(UNKNOWN_ROW));

        expect(await lengthValues(page)).toEqual(MILLIS);
    });

    test('a value that disagrees with the displayed seconds is discarded, and "?:??" stays unknown', async ({ page }) => {
        await setup(page);
        await toggle(page).click();
        await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');

        const values = await lengthValues(page);
        expect(values[MISMATCH_ROW]).toBe(fmtSec(seconds(MISMATCH_ROW)));
        expect(values[UNKNOWN_ROW]).toBe('?:??');
        // Neither row was stamped, so neither can be toggled.
        expect(await page.locator('table.tbl tbody td[data-mb-ms]').count()).toBe(ROWS - 2);
    });

    test('answers are cached: sorting, filtering and re-toggling never re-request', async ({ page }) => {
        const calls = await setup(page);
        await toggle(page).click();
        await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
        expect(calls.length).toBe(2);

        const th = page.locator('table.tbl thead th[data-col-name="Length"]').first();
        await waitForSortSettled(page, () => th.locator('.sort-icon-btn', { hasText: '▲' }).first().click());

        const colIdx = await page.evaluate(() => Array.from(document.querySelectorAll('table.tbl thead th'))
            .findIndex((t) => (t.dataset.colName || '') === 'Length'));
        const colInput = page.locator(`table.tbl thead .mb-col-filter-input[data-col-idx="${colIdx}"]`).first();
        await colInput.click();
        await waitForFilterSettled(page, () => colInput.pressSequentially('1:0'));
        await waitForFilterSettled(page, () => colInput.fill(''));

        await toggle(page).click();
        await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
        await toggle(page).click();
        await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');

        // Still exactly the two original batches across all of that — including
        // the rows the service answered with "no length on record", which are
        // cached as an answer rather than re-asked forever.
        expect(calls.length).toBe(2);

        // And nothing is left outstanding. This is invisible from the DOM: the
        // row whose value was DISCARDED as mismatched is never stamped, so it
        // looks exactly like an unanswered row — without the answered-MBID
        // exclusion it would count as pending forever, and every later press
        // would walk all 130 rows and flash the loading state for a request it
        // then does not make.
        expect(await page.evaluate(() => window.__saTest.msPendingLengthLookups())).toBe(0);
    });

    test('lengths already in IndexedDB are used without any request at all', async ({ page }) => {
        // The L2 cache is keyed per RECORDING rather than per page, which is
        // what makes a recording seen once free everywhere else that lists it —
        // and free again after a reload. Seeded here the way a previous visit
        // would have left it, at the version and schema the userscript's own
        // onupgradeneeded creates (see tests/support/idbFixture.js).
        const seeded = Array.from({ length: ROWS }, (_, i) => i)
            .filter((i) => i !== UNKNOWN_ROW)
            .map((i) => ({ gid: mbid(i), ms: msFor(i), ts: Date.now() }));
        await page.addInitScript(({ records }) => {
            window.__msSeedDone = false;
            const req = indexedDB.open('vz-mb-saed-art-cache', 3);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains('images')) db.createObjectStore('images', { keyPath: 'url' });
                if (!db.objectStoreNames.contains('metadata')) db.createObjectStore('metadata', { keyPath: 'entityPath' });
                if (!db.objectStoreNames.contains('rel-ws2')) db.createObjectStore('rel-ws2', { keyPath: 'ckey' });
                if (!db.objectStoreNames.contains('ms-rec-len')) db.createObjectStore('ms-rec-len', { keyPath: 'gid' });
            };
            req.onsuccess = () => {
                const tx = req.result.transaction('ms-rec-len', 'readwrite');
                const store = tx.objectStore('ms-rec-len');
                records.forEach((r) => store.put(r));
                tx.oncomplete = () => { window.__msSeedDone = true; };
            };
        }, { records: seeded });

        const calls = await setup(page);
        await page.waitForFunction(() => window.__msSeedDone === true);

        await toggle(page).click();
        await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');

        // Every value came from the browser's own cache.
        expect(calls.length).toBe(0);
        expect(await page.evaluate(() => window.__saTest.msPendingLengthLookups())).toBe(0);
        // The seeded row that the live mock would have answered with a
        // mismatch is stored here as a value that DOES agree, so unlike the
        // network tests it is shown — proving these came from IDB, not the mock.
        expect(await lengthValues(page)).toEqual(
            Array.from({ length: ROWS }, (_, i) => (i === UNKNOWN_ROW ? '?:??' : fmtMs(i))),
        );
    });

    test('a partly-failed run shows what arrived, says so, and retries only the gap', async ({ page }) => {
        // The second batch 503s on every attempt; the first succeeds.
        const calls = await setup(page, { failBatches: [1] });
        await toggle(page).click();
        await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');

        // The rows that resolved are shown rather than thrown away…
        const values = await lengthValues(page);
        expect(values[0]).toBe(fmtMs(0));
        // …and the rows in the failed batch are untouched.
        expect(values[ROWS - 1]).toBe(fmtSec(seconds(ROWS - 1)));

        // The button must not read as finished: same yellow tint as `retry`,
        // because it means the same thing — there is more to get.
        await expect(toggle(page)).toHaveAttribute('data-mb-ms-retry', '1');
        expect(await toggle(page).getAttribute('title')).toContain('could not be loaded');

        // The failed batch cached nothing, so pressing again re-requests
        // exactly those MBIDs — and nothing else.
        const beforeRetry = calls.length;
        await toggle(page).click();
        await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
        await page.unroute('**/ws/2/recording?**');
        const retryCalls = [];
        await page.route('**/ws/2/recording?**', (route) => {
            const url = new URL(route.request().url());
            const ids = (url.searchParams.get('query') || '')
                .match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g) || [];
            retryCalls.push(ids);
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    count: ids.length,
                    recordings: ids.map((id) => ({ id, length: msFor(Number(id.slice(-12))) })),
                }),
            });
        });
        await toggle(page).click();
        await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');

        expect(calls.length).toBe(beforeRetry);       // the old mock saw nothing more
        expect(retryCalls.length).toBe(1);            // one batch, not both
        expect(retryCalls[0].length).toBe(29);
        expect(retryCalls[0]).toContain(mbid(ROWS - 1));
        expect(retryCalls[0]).not.toContain(mbid(0)); // already answered, not re-asked

        // And the column is now complete.
        expect((await lengthValues(page))[ROWS - 1]).toBe(fmtMs(ROWS - 1));
        await expect(toggle(page)).not.toHaveAttribute('data-mb-ms-retry', '1');
    });

    test('a wholly-failed run is retryable, not reported as "no data"', async ({ page }) => {
        // This distinction is load-bearing: "the service is busy" and
        // "MusicBrainz has no sub-second length here" are different facts, and
        // only one of them is worth another click. Conflating them once turned
        // a passing 503 into a permanently dead button.
        await setup(page, { failBatches: [0, 1] });
        await toggle(page).click();

        // Generous timeout on purpose: this is the slowest path by design.
        // Every batch is retried three times with a widening backoff before it
        // gives up, precisely so a burst of 503s — which is how MusicBrainz
        // fails under bot load — does not get mistaken for an answer.
        await expect(toggle(page)).toHaveAttribute('data-mb-ms-retry', '1', { timeout: 30000 });
        await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
        // Never the settled, dimmed "there is nothing here" state.
        await expect(toggle(page)).not.toHaveAttribute('aria-disabled', 'true');
        expect(await toggle(page).getAttribute('title')).toContain('Click again to retry');
        expect(await lengthValues(page)).toEqual(SECONDS);
    });
});
