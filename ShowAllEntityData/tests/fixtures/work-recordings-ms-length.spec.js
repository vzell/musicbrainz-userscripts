'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForFilterSettled, waitForSortSettled } = require('../support/filterSortAssertions');

// Millisecond track lengths on the pageTypes that have NO length data in the
// page — work-recordings, artist-relationships, place-performances and their
// `-filtered` twins. Those need one MusicBrainz Web Service request, and the
// whole point of this path is WHEN that request happens: only on the first
// press of the ⏱ toggle, then never again for the life of the page.
const WORK_URL = 'https://musicbrainz.org/work/8727a75a-8d33-3a2c-912a-f57952773201';
const FIXTURE_FILE = path.join(__dirname, 'work-recordings-ms-length.html');

const REC = {
    a: '528327c7-0f7a-46d1-b03f-700ebc39f747',
    b: 'de9ff1d7-dd78-4ed6-a328-c1ab126304e6',
    c: '089026d3-1c1d-45bb-bf16-072d0bff8412',
    d: '299b2860-570e-4dca-9166-9e3842d8c381',
    e: '0b62eb61-f75f-498c-845f-5e7fbd3ac924',
    mismatch: 'bbbbbbbb-2222-4222-8222-222222222222',
};

// Real values for these recordings, as returned by
// /ws/2/work/8727a75a-…?inc=recording-rels&fmt=json.
const WS2_BODY = JSON.stringify({
    relations: [
        { recording: { id: REC.a, length: 305146 } },
        { recording: { id: REC.b, length: 305000 } },
        { recording: { id: REC.c, length: 334866 } },
        { recording: { id: REC.d, length: null } },
        { recording: { id: REC.e, length: 264000 } },
        // Disagrees with the "2:00" the page displays — must be discarded.
        { recording: { id: REC.mismatch, length: 305146 } },
    ],
});

const SECONDS = ['5:05', '5:05', '5:35', '?:??', '4:24', '2:00'];
const MILLIS = ['5:05.146', '5:05.000', '5:34.866', '?:??', '4:24.000', '2:00'];

/**
 * Installs the fixture + a counting WS2 mock. Returns a live request counter.
 *
 * `ws2Sequence` serves one entry per request (the last repeating), so a test
 * can make the first attempt fail and the retry succeed.
 */
async function setup(page, { ws2Body = WS2_BODY, ws2Status = 200, ws2Sequence } = {}) {
    const counter = { ws2: 0 };
    const seq = ws2Sequence || [{ status: ws2Status, body: ws2Body }];
    await page.route('**/ws/2/work/**', (route) => {
        const step = seq[Math.min(counter.ws2, seq.length - 1)];
        counter.ws2 += 1;
        route.fulfill({ status: step.status, contentType: 'application/json', body: step.body });
    });
    await loadUserscriptPage(page, { url: WORK_URL, fixtureFile: FIXTURE_FILE, testMode: true });
    await page.click('button[data-label="Show all Recordings for Work"]');
    await page.waitForSelector('#mb-filter-container');
    return counter;
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

test.describe('work-recordings: millisecond Length precision via the Web Service', () => {
    test('the toggle is offered before anything is fetched, and nothing is fetched until it is pressed', async ({ page }) => {
        const counter = await setup(page);

        // Offered on the strength of the page definition's declared source, not
        // on data already being present.
        await expect(toggle(page)).toHaveCount(1);
        await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
        expect(await page.locator('table.tbl tbody td[data-mb-ms]').count()).toBe(0);
        expect(await lengthValues(page)).toEqual(SECONDS);

        // The tooltip says a request is coming, only because on this pageType one is.
        expect(await toggle(page).getAttribute('title')).toContain('one MusicBrainz Web Service request');

        // Rendering the page must not have touched the Web Service.
        expect(counter.ws2).toBe(0);
    });

    test('pressing it fetches once and reveals the millisecond values', async ({ page }) => {
        const counter = await setup(page);
        await toggle(page).click();
        await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');

        expect(counter.ws2).toBe(1);
        expect(await lengthValues(page)).toEqual(MILLIS);
    });

    test('a value that disagrees with the displayed seconds is discarded, and "?:??" stays unknown', async ({ page }) => {
        await setup(page);
        await toggle(page).click();
        await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');

        const values = await lengthValues(page);
        // The mocked service claims 5:05.146 for the row the page shows as
        // 2:00 — keeping it would have rendered a flatly wrong duration.
        expect(values[5]).toBe('2:00');
        // No length on record at all: unchanged, not invented.
        expect(values[3]).toBe('?:??');
        // Neither row was stamped, so neither can be toggled.
        expect(await page.locator('table.tbl tbody td[data-mb-ms]').count()).toBe(4);
    });

    test('MusicBrainz\'s rounding is respected in both directions', async ({ page }) => {
        await setup(page);
        await toggle(page).click();
        // The first press is async (it fetches), so wait for the state to land
        // before reading the column.
        await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
        // 334866 ms rounds UP to the 5:35 the page displayed — accepted, not
        // rejected as a mismatch.
        expect((await lengthValues(page))[2]).toBe('5:34.866');

        await toggle(page).click();
        await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
        // Restored verbatim: recomputing from 334866 would have written "5:34".
        expect((await lengthValues(page))[2]).toBe('5:35');
    });

    test('the response is cached for the page: sorting, filtering and re-toggling never re-request', async ({ page }) => {
        const counter = await setup(page);

        await toggle(page).click();
        await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
        expect(counter.ws2).toBe(1);

        // Sort the column.
        const th = page.locator('table.tbl thead th[data-col-name="Length"]').first();
        await waitForSortSettled(
            page,
            () => th.locator('.sort-icon-btn', { hasText: '▲' }).first().click(),
            { subTableHeading: 'recordings' },
        );

        // Filter it.
        const colIdx = await page.evaluate(() => Array.from(document.querySelectorAll('table.tbl thead th'))
            .findIndex((t) => (t.dataset.colName || '') === 'Length'));
        const colInput = page.locator(`table.tbl thead .mb-col-filter-input[data-col-idx="${colIdx}"]`).first();
        await colInput.click();
        await waitForFilterSettled(page, () => colInput.pressSequentially('5:0'));
        await waitForFilterSettled(page, () => colInput.fill(''));

        // Off and on again.
        await toggle(page).click();
        await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
        await toggle(page).click();
        await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');

        // Still exactly one request across all of that.
        expect(counter.ws2).toBe(1);
    });

    test('the toggle is present on the FIRST render of a single-table page', async ({ page }) => {
        // Regression: tableMode:'single' pages build their header layout AFTER
        // renderFinalTable() returns — startFetchingProcess() calls
        // makeTableSortableUnified() (which creates .mb-col-hdr-flex) several
        // steps later. The render tail's own injection therefore found no flex
        // row and silently did nothing, so the button was missing until some
        // unrelated re-render happened to run the tail again. Observed live on
        // place-performances-filtered: the 398-row "Recording location for
        // recording" sub-table had no button at all (debug/recording-location.html)
        // while the 1-row "Shooting location" one did (debug/shooting-location.html).
        //
        // Same fixture, loaded with a link_type_id so it resolves to the
        // -filtered (single-table) pageType instead of the multi-table one.
        const url = `${WORK_URL}?link_type_id=278`;
        await page.route('**/ws/2/work/**', (route) => route.fulfill({
            status: 200, contentType: 'application/json', body: WS2_BODY,
        }));
        await loadUserscriptPage(page, { url, fixtureFile: FIXTURE_FILE, testMode: true });
        await page.route(`${url}**`, (route) => route.fulfill({ path: FIXTURE_FILE, contentType: 'text/html' }));
        await page.click('button[data-label="Show all Recordings for Work (complete)"]');
        await page.waitForSelector('#mb-filter-container');

        // No filtering, no sorting, no second render — straight after the
        // initial one, exactly as a person first sees the page.
        await expect(page.locator('.mb-ms-col-hdr-btn')).toHaveCount(1);
        await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');

        // And it works from that first render.
        await toggle(page).click();
        await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
        expect((await lengthValues(page))[0]).toBe('5:05.146');
    });

    test('rows that arrive ALREADY showing milliseconds can be switched back off', async ({ page }) => {
        // Reproduces the sub-table handoff: pressing "Show all N rows" on a
        // multi-table page opens that sub-table in its own tab, hydrated from a
        // snapshot of rows this script had already rendered. If milliseconds
        // were on at that moment, the cells arrive carrying data-mb-ms,
        // data-mb-sec-text and data-mb-ms-shown, already rendered at
        // millisecond precision.
        //
        // The bug: that page's toggle was never injected — the hydration path
        // (like startFetchingProcess's single-table branch) calls
        // renderFinalTable() several steps BEFORE makeTableSortableUnified()
        // builds the .mb-col-hdr-flex the button lives in — so the column came
        // up in milliseconds with no way to switch it back.
        //
        // Simulated by rewriting the fixture's Length cells to the
        // already-stamped, already-shown shape before the page is served.
        const STAMPED = {
            '5:05': { ms: 305146, text: '5:05.146' },
            '5:35': { ms: 334866, text: '5:34.866' },
            '4:24': { ms: 264000, text: '4:24.000' },
        };
        const raw = require('fs').readFileSync(FIXTURE_FILE, 'utf8');
        let hydrated = raw;
        for (const [secs, { ms, text }] of Object.entries(STAMPED)) {
            hydrated = hydrated.split(`<td>${secs}</td>`).join(
                `<td data-mb-ms="${ms}" data-mb-sec-text="${secs}" data-mb-ms-shown="1">${text}</td>`);
        }
        expect(hydrated).not.toBe(raw);

        let ws2 = 0;
        await page.route('**/ws/2/work/**', (route) => {
            ws2 += 1;
            route.fulfill({ status: 200, contentType: 'application/json', body: WS2_BODY });
        });
        // Loaded with a link_type_id so it resolves to the -filtered
        // (single-table) pageType — the shape a sub-table tab actually opens
        // as, and the one whose render order hid the button.
        const url = `${WORK_URL}?link_type_id=278`;
        await page.route(`${url}**`, (route) => route.fulfill({ body: hydrated, contentType: 'text/html' }));
        await loadUserscriptPage(page, { url, testMode: true });
        await page.click('button[data-label="Show all Recordings for Work (complete)"]');
        await page.waitForSelector('#mb-filter-container');

        // The toggle exists and correctly reports the column as already on.
        await expect(toggle(page)).toHaveCount(1);
        await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
        expect((await lengthValues(page))[0]).toBe('5:05.146');

        // And switching back off works, from the stashed seconds text.
        await toggle(page).click();
        await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
        const secs = await lengthValues(page);
        expect(secs[0]).toBe('5:05');
        expect(secs[2]).toBe('5:35');

        // Nothing needed fetching — the values came in with the rows.
        expect(ws2).toBe(0);
    });

    test('a cell already displaying milliseconds still records a genuine SECONDS baseline', async ({ page }) => {
        // The real sub-table handoff, exactly: captureSubtableSnapshot() stores
        // `cell.innerHTML`, so the <td>'s own data-mb-* attributes never travel
        // — only the rendered "11:17.000" text does. The destination page then
        // re-stamped those cells, took that millisecond string to BE "the
        // seconds MusicBrainz rendered", stashed it in data-mb-sec-text, and so
        // restored milliseconds when the toggle was switched off: the glyph
        // flipped while the column did not move. Captured live in
        // debug/shooting-location-bug.html, whose one cell reads
        // data-mb-sec-text="11:17.000".
        //
        // Note this fixture carries the millisecond TEXT and NO attributes,
        // which is what actually crosses the handoff.
        const raw = require('fs').readFileSync(FIXTURE_FILE, 'utf8');
        const carried = raw
            .split('<td>5:05</td>').join('<td>5:05.146</td>')
            .split('<td>5:35</td>').join('<td>5:34.866</td>')
            .split('<td>4:24</td>').join('<td>4:24.000</td>');
        expect(carried).not.toBe(raw);

        let ws2 = 0;
        await page.route('**/ws/2/work/**', (route) => {
            ws2 += 1;
            route.fulfill({ status: 200, contentType: 'application/json', body: WS2_BODY });
        });
        const url = `${WORK_URL}?link_type_id=278`;
        await page.route(`${url}**`, (route) => route.fulfill({ body: carried, contentType: 'text/html' }));
        await loadUserscriptPage(page, { url, testMode: true });
        await page.click('button[data-label="Show all Recordings for Work (complete)"]');
        await page.waitForSelector('#mb-filter-container');

        // Nothing has reset these cells (this fixture arrives as a NATIVE page,
        // not through the snapshot handoff), so they still show milliseconds.
        expect((await lengthValues(page))[2]).toBe('5:34.866');

        // Toggle on, then off. The bug was that stamping took the millisecond
        // string on screen to BE "the seconds MusicBrainz rendered" and stashed
        // it in data-mb-sec-text, so switching off restored milliseconds and
        // the column never moved. It must land on genuine seconds — and on
        // MusicBrainz's ROUNDED "5:35", not a truncated "5:34".
        await toggle(page).click();
        await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
        expect(ws2).toBe(1);

        await toggle(page).click();
        await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
        expect(await lengthValues(page)).toEqual(SECONDS);
    });

    test('_msResetCarriedOverPrecision recovers MusicBrainz\'s seconds from millisecond text', async ({ page }) => {
        // The reset that runs on captured (getCleanCellHtml) and hydrated
        // (_hydrateAndRenderFromSnapshotData) cells, so a sub-table opened in
        // its own tab always starts in seconds — like one reached by
        // pagination. Unit-tested directly: driving the real handoff would need
        // a captured snapshot payload seeded into GM storage.
        await setup(page);   // loads the userscript in test mode (window.__saTest)
        const out = await page.evaluate(() => {
            const host = document.createElement('div');
            host.id = 'ms-reset-unit';
            host.innerHTML = '<table><tbody><tr>'
                + '<td id="r1" data-mb-ms="677000" data-mb-sec-text="11:17.000" data-mb-ms-shown="1">11:17.000</td>'
                + '<td id="r2">5:34.866</td>'
                + '<td id="r3">4:24.000</td>'
                + '<td id="r4">3:12</td>'
                + '<td id="r5">a comment mentioning 1:23.456 in passing</td>'
                + '</tr></tbody></table>';
            document.body.appendChild(host);
            const read = (id) => {
                const td = document.getElementById(id);
                window.__saTest.resetCarriedOverPrecision('#' + id);
                return { text: td.textContent.trim(), ms: td.dataset.mbMs ?? null, shown: td.dataset.mbMsShown ?? null };
            };
            return { r1: read('r1'), r2: read('r2'), r3: read('r3'), r4: read('r4'), r5: read('r5') };
        });

        // The exact cell from debug/shooting-location-bug.html, whose poisoned
        // data-mb-sec-text="11:17.000" was the smoking gun.
        expect(out.r1).toEqual({ text: '11:17', ms: null, shown: null });
        // Rounded, not truncated: 5:34.866 is displayed by MusicBrainz as 5:35.
        expect(out.r2.text).toBe('5:35');
        expect(out.r3.text).toBe('4:24');
        // Already seconds, and ordinary prose that merely contains something
        // duration-like: both untouched.
        expect(out.r4.text).toBe('3:12');
        expect(out.r5.text).toBe('a comment mentioning 1:23.456 in passing');
    });

    test('a transient failure stays RETRYABLE — yellow, clickable, and not cached', async ({ page }) => {
        // Reported live: a single "HTTP 503" (MusicBrainz's Web Service is
        // intermittently flaky under bot load) was followed by nothing but
        // "cache hit" lines, so the button was dead for the rest of the page's
        // life — and its tooltip claimed "MusicBrainz has no sub-second length
        // on record for these recordings", which was simply untrue.
        // First request 503s, the retry succeeds.
        const counter = await setup(page, {
            ws2Sequence: [
                { status: 503, body: '{}' },
                { status: 200, body: WS2_BODY },
            ],
        });

        await toggle(page).click();
        await expect(toggle(page)).toHaveAttribute('data-mb-ms-retry', '1');
        expect(counter.ws2).toBe(1);

        // Tells the truth: names the failure, and says to try again.
        const title = await toggle(page).getAttribute('title');
        expect(title).toContain('HTTP 503');
        expect(title).toContain('Click again to retry');
        expect(title).not.toContain('no sub-second length on record');

        // Still operable — a transport failure must not disable the control.
        expect(await toggle(page).getAttribute('aria-disabled')).toBeNull();
        // Yellow warning tint rather than the dimmed "settled" look. Two
        // wrinkles, both real rather than incidental: the pointer is still
        // resting on the button after .click(), so :hover's deeper 0.65 shade
        // applies until it is moved away; and the button carries a 150ms
        // background transition, so this needs the auto-retrying toHaveCSS
        // rather than a one-shot getComputedStyle() that would sample an
        // intermediate alpha.
        await page.mouse.move(0, 0);
        await expect(toggle(page)).toHaveCSS('background-color', 'rgba(255, 193, 7, 0.45)');

        // Column untouched by the failure.
        expect(await lengthValues(page)).toEqual(SECONDS);

        // The retry actually re-requests, and succeeds.
        await toggle(page).click();
        await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
        expect(counter.ws2).toBe(2);
        expect(await lengthValues(page)).toEqual(MILLIS);
        expect(await toggle(page).getAttribute('data-mb-ms-retry')).toBeNull();
    });

    test('a successful but empty answer IS the settled "unavailable" state, and is cached', async ({ page }) => {
        // Distinct from the case above: MusicBrainz answered, and the answer is
        // that it holds no length for these recordings. That is a real, stable
        // fact, so it is cached and the button reports it as unavailable.
        const counter = await setup(page, { ws2Body: JSON.stringify({ relations: [] }) });

        await toggle(page).click();
        await expect(toggle(page)).toHaveAttribute('aria-disabled', 'true');
        const title = await toggle(page).getAttribute('title');
        expect(title).toContain('no sub-second length on record');
        expect(await toggle(page).getAttribute('data-mb-ms-retry')).toBeNull();
        expect(await lengthValues(page)).toEqual(SECONDS);
        expect(counter.ws2).toBe(1);

        // Cached: a further press does not re-request. `force` because the
        // button is legitimately aria-disabled here, which Playwright honours
        // as non-actionable for role=button.
        await toggle(page).click({ force: true });
        expect(counter.ws2).toBe(1);
    });
});
