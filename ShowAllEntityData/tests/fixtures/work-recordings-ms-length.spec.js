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

/** Installs the fixture + a counting WS2 mock. Returns a live request counter. */
async function setup(page, { ws2Body = WS2_BODY, ws2Status = 200 } = {}) {
    const counter = { ws2: 0 };
    await page.route('**/ws/2/work/**', (route) => {
        counter.ws2 += 1;
        route.fulfill({ status: ws2Status, contentType: 'application/json', body: ws2Body });
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

    test('a failed request reports "unavailable" rather than silently doing nothing', async ({ page }) => {
        const counter = await setup(page, { ws2Status: 503, ws2Body: '{}' });

        await toggle(page).click();
        await expect(toggle(page)).toHaveAttribute('aria-disabled', 'true');
        expect(await toggle(page).getAttribute('title')).toContain('unavailable');
        // Column untouched.
        expect(await lengthValues(page)).toEqual(SECONDS);
        expect(counter.ws2).toBe(1);

        // The failure is cached too — a second press does not retry. `force`
        // because the button now reports aria-disabled="true", which Playwright
        // honours as non-actionable for a role=button; that attribute is
        // accurate (the failure is cached, so the control really is inert for
        // the rest of the page's life) and the point here is precisely that
        // even a click that gets through changes nothing.
        await toggle(page).click({ force: true });
        expect(counter.ws2).toBe(1);
    });
});
