'use strict';

// Shared setup for the "Recording of" column specs: the generated fixture
// (scripts/build-recording-of-fixture.py) plus a WS/2 mock that answers from
// the same data file, so page and service cannot disagree.

const path = require('path');
const { loadUserscriptPage } = require('./loadPage');
const { waitForRenderComplete } = require('./browser');

const DATA = require('../fixtures/recording-of-data.json');
const PAGE_URL = `https://musicbrainz.org/artist/${DATA.artist}/recordings`;
const FIXTURE = path.join(__dirname, '..', 'fixtures', 'artist-recordings-recording-of.html');
// The same page with the batch-add "performance of" userscript's markup in it.
const FIXTURE_BPR = path.join(__dirname, '..', 'fixtures', 'artist-recordings-recording-of-bpr.html');
const MBID_RE = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/;

/**
 * Loads the fixture, renders it, and installs the WS/2 mock.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{
 *   settings?: Object,
 *   catalogue?: number,          // recording-count the browse claims (default: the fixture's rows)
 *   browseFirst?: number,        // how many fixture recordings the first browse page carries (default all)
 *   fail?: (url: string, n: number) => (number|null), // HTTP status to fail a request with, or null
 *   bprWorks?: boolean,          // seed the batch-add userscript's localStorage work list
 *   fixture?: string,            // page file (default FIXTURE)
 * }} [opts]
 * @returns {Promise<{calls: Array<{kind: string, url: string}>}>}
 */
async function setupRecordingOf(page, opts = {}) {
    const calls = [];
    const recs = DATA.recordings;
    const catalogue = opts.catalogue ?? recs.length;
    const browseFirst = opts.browseFirst ?? recs.length;
    await page.route('**/ws/2/**', (route) => {
        const url = route.request().url();
        const u = new URL(url);
        let kind = 'other';
        if (/\/ws\/2\/recording\/[a-f0-9-]{36}/.test(u.pathname)) kind = 'lookup';
        else if (u.pathname.endsWith('/ws/2/recording') && u.searchParams.get('artist')) kind = 'browse';
        else if (u.pathname.endsWith('/ws/2/work') && u.searchParams.get('artist')) kind = 'works';
        calls.push({ kind, url });
        const status = opts.fail ? opts.fail(url, calls.length) : null;
        if (status) {
            route.fulfill({ status, contentType: 'application/json', body: '{"error":"busy"}' });
            return;
        }
        let body = {};
        if (kind === 'lookup') {
            const id = u.pathname.match(MBID_RE)[0];
            const rec = recs.find((r) => r.id === id);
            if (!rec) { route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"Not Found"}' }); return; }
            body = rec;
        } else if (kind === 'browse') {
            const offset = Number(u.searchParams.get('offset') || 0);
            // Page 0 carries the first `browseFirst` fixture recordings; later
            // pages carry the rest, then nothing of ours (catalogue filler is
            // not needed: only our ids matter to the page).
            const ours = offset === 0 ? recs.slice(0, browseFirst) : recs.slice(browseFirst + (offset - 100), browseFirst + offset);
            body = { 'recording-count': catalogue, 'recording-offset': offset, recordings: ours };
        } else if (kind === 'works') {
            body = { 'work-count': DATA.works.length, 'work-offset': 0, works: DATA.works };
        }
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    if (opts.bprWorks) {
        await page.addInitScript(({ artist, works }) => {
            const lines = works.map((w) => w.id + w.title + (w.disambiguation ? ` ${w.disambiguation}` : ''));
            localStorage.setItem(`bpr_works ${artist}`, lines.join('\n'));
            localStorage.setItem(`bpr_works_date ${artist}`, 'Wed Jan 21 2026 23:28:59 GMT+0100 (Central European Standard Time)');
        }, { artist: DATA.artist, works: DATA.works });
    }
    const file = opts.fixture || FIXTURE;
    await loadUserscriptPage(page, { url: PAGE_URL, fixtureFile: file, testMode: true, settingsOverride: opts.settings || {} });
    await page.route(`${PAGE_URL}?**`, (route) => route.fulfill({ path: file, contentType: 'text/html' }));
    await page.click('button[data-label="⊚ All recordings"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
    await page.mouse.move(0, 0);
    return { calls };
}

/**
 * Header names of the rendered table, in order.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string[]>}
 */
async function headerNames(page) {
    return page.evaluate(() => Array.from(document.querySelectorAll('table.tbl thead tr:first-child th'))
        .map((th) => th.dataset.colName || th.textContent.trim()));
}

/**
 * Text and state of every row's cell in a named column, in row order.
 * @param {import('@playwright/test').Page} page
 * @param {string} col
 * @returns {Promise<Array<{text: string, state: ?string, html: string}>>}
 */
async function columnCells(page, col) {
    return page.evaluate((name) => {
        const tbl = document.querySelector('table.tbl');
        const ths = Array.from(tbl.querySelectorAll('thead tr:first-child th'));
        const idx = ths.findIndex((th) => (th.dataset.colName || th.textContent.trim()) === name);
        return Array.from(tbl.querySelectorAll('tbody tr')).map((tr) => {
            const td = tr.cells[idx];
            return { text: td ? td.textContent.replace(/\s+/g, ' ').trim() : null, state: td ? (td.dataset.recof || null) : null, html: td ? td.innerHTML : '' };
        });
    }, col);
}

module.exports = { DATA, PAGE_URL, FIXTURE, FIXTURE_BPR, setupRecordingOf, headerNames, columnCells };
