'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');

// `area-recordings` uses the SINGLE-REQUEST source, not the batched one, and
// that is a deliberate distinction rather than an oversight: an area's own
// `/ws/2/area/<mbid>?inc=recording-rels` answer covers its recordings page
// exactly — Asbury Park returns 24 relations with lengths for a page listing
// those same 24 recordings (scripts/probe-ms-browse-endpoints.py) — so one
// request beats chunking the rows.
//
// The whole `area` path is one regex token in `_msWs2PageKey()` plus one
// pageDefinition flag, which is precisely why it is worth a test: a typo in
// either silently produces no toggle at all, with nothing else to notice it.
const AREA_URL = 'https://musicbrainz.org/area/10fa66f7-aa08-4823-8af8-52108f350a5a/recordings';
const FIXTURE_FILE = path.join(__dirname, 'area-recordings-ms-length.html');

const REC = {
    a: 'ba16da23-17e6-4043-b779-977000d19bb4',
    b: '07ac0c55-8553-41f0-8818-d114b64674ec',
    c: '104b3865-bc98-4968-8ca8-7ca67295caf2',
};

const WS2_BODY = JSON.stringify({
    relations: [
        { recording: { id: REC.a, length: 174321 } },   // 2:54.321
        { recording: { id: REC.b, length: 190000 } },   // 3:10.000
        { recording: { id: REC.c, length: 206750 } },   // 3:26.750 → rounds to 3:27
    ],
});

const SECONDS = ['2:54', '3:10', '3:27'];
const MILLIS = ['2:54.321', '3:10.000', '3:26.750'];

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

test('area-recordings resolves milliseconds from ONE area lookup, not a batch', async ({ page }) => {
    const counter = { area: 0, search: 0 };
    await page.route('**/ws/2/area/**', (route) => {
        counter.area += 1;
        route.fulfill({ status: 200, contentType: 'application/json', body: WS2_BODY });
    });
    // Anything reaching the recording-search endpoint would mean this pageType
    // fell through to the batched source — the wrong, more expensive path.
    await page.route('**/ws/2/recording?**', (route) => {
        counter.search += 1;
        route.fulfill({ status: 200, contentType: 'application/json', body: '{"recordings":[]}' });
    });

    // link_type_id resolves to the -filtered (single-table) twin, the same
    // trick work-recordings-ms-length.spec.js uses for its own single-table case.
    const url = `${AREA_URL}?link_type_id=278`;
    await loadUserscriptPage(page, { url, fixtureFile: FIXTURE_FILE, testMode: true });
    await page.route(`${url}**`, (route) => route.fulfill({ path: FIXTURE_FILE, contentType: 'text/html' }));
    await page.click('button[data-label="Show all Recordings for Area (complete)"]');
    await page.waitForSelector('#mb-filter-container');

    await expect(toggle(page)).toHaveCount(1);
    expect(await lengthValues(page)).toEqual(SECONDS);
    expect(counter.area).toBe(0);

    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');

    expect(await lengthValues(page)).toEqual(MILLIS);
    expect(counter.area).toBe(1);
    expect(counter.search).toBe(0);

    // 206750 rounds UP to the 3:27 the page rendered, so it is accepted; going
    // back must restore "3:27" rather than recompute "3:26".
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
    expect((await lengthValues(page))[2]).toBe('3:27');
});
