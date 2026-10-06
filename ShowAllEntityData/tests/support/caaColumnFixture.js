'use strict';

/**
 * Page setup shared by tests/fixtures/caa-column-redesign.spec.js and its
 * .mobile.spec.js twin (org/redesign-CAA-EAA-column.org): the release-group
 * shell of caa-artwork-summary.spec.js with the Promotion release's Format
 * rewritten to "Digital Media", one routed archive record per release, and
 * readers for the cells and the viewer.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { expect } = require('@playwright/test');
const { loadUserscriptPage } = require('./loadPage');
const { waitForRenderComplete } = require('./browser');
const { clickMasterToggleAndExpandAll } = require('./liveAssertions');
const { waitForFilterSettled } = require('./filterSortAssertions');

const RG_URL = 'https://musicbrainz.org/release-group/f83d2211-dd81-4b1e-9a02-e89733891e1c';
const SHELL = path.join(__dirname, '..', 'snapshots', 'releasegroup-releases', 'raw.html');
const BUTTON = 'button[data-label="Show all Releases for ReleaseGroup"]';
const META_RE = /^https:\/\/coverartarchive\.org\/release\/([0-9a-f-]{36})$/;
const ONE_PX_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64'
);

/** The shell's seven releases and the record each one gets. */
const R = {
    sixteen: '3ec14d03-2c03-4764-a69d-8155817a040f',  // Official, 8cm CD: the 16-image record
    noFront: '52c6808b-037d-47d5-b0c7-17331c9d36cd',  // Official, 7" Vinyl: Back + Medium
    noMedium: '62bc5273-baec-4c3b-bcea-f1600d44777d', // Official, 12" Vinyl: Front only
    noArt: '001af5ba-d4a5-4677-a3ec-601250031fb6',    // Official, Cassette: 404
    outside: '1d59846b-2164-41cf-81eb-3bf7fdf093df',  // Official, CD: Booklet "outside panel"
    plain: 'ac3d34ca-80ac-4b71-b6d2-3b8111b0de72',    // Official, CD: Front + Medium, an OLD record (small/large only)
    digital: '2f68fd4f-0b4d-4e6a-8509-feacdbd1544f',  // Promotion, served as Digital Media: Front only
};

/**
 * One archive image record.
 *
 * @param {string} mbid
 * @param {number} id
 * @param {string[]} types
 * @param {{front?: boolean, back?: boolean, comment?: string}} [o]
 */
const img = (mbid, id, types, { front = false, back = false, comment = '' } = {}) => {
    const u = (s) => `https://coverartarchive.org/release/${mbid}/${id}${s}.jpg`;
    return {
        id: String(id), image: u(''), types, front, back, comment, approved: true, edit: 1000 + id,
        thumbnails: { 250: u('-250'), 500: u('-500'), 1200: u('-1200'), small: u('-250'), large: u('-500') },
    };
};

/**
 * An archive image record of the OLDER shape: thumbnails `small`/`large`
 * only, every URL over `http:`.
 *
 * @param {string} mbid
 * @param {number} id
 * @param {string[]} types
 * @param {{front?: boolean, back?: boolean, comment?: string}} [o]
 */
const oldImg = (mbid, id, types, o = {}) => {
    const u = (sfx) => `http://coverartarchive.org/release/${mbid}/${id}${sfx}.jpg`;
    return { ...img(mbid, id, types, o), image: u(''), thumbnails: { small: u('-250'), large: u('-500') } };
};

const BODIES = {
    [R.sixteen]: fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'caa-release-d0adda7e.json'), 'utf8'),
    [R.noFront]: JSON.stringify({ images: [img(R.noFront, 1, ['Back'], { back: true }), img(R.noFront, 2, ['Medium'])] }),
    [R.noMedium]: JSON.stringify({ images: [img(R.noMedium, 1, ['Front'], { front: true })] }),
    [R.outside]: JSON.stringify({ images: [img(R.outside, 1, ['Front'], { front: true }), img(R.outside, 2, ['Medium']),
        img(R.outside, 3, ['Booklet'], { comment: 'outside panel' })] }),
    // Shaped like the four older records scripts/probe-caa-thumbnail-keys.py
    // found (2026-10-06): only small/large, over http:, no 1200 key.
    [R.plain]: JSON.stringify({ images: [oldImg(R.plain, 1, ['Front'], { front: true }), oldImg(R.plain, 2, ['Medium'])] }),
    [R.digital]: JSON.stringify({ images: [img(R.digital, 1, ['Front'], { front: true })] }),
};

/** The shell with the Promotion release's Format rewritten, written once. */
const shellFile = (() => {
    const html = fs.readFileSync(SHELL, 'utf8');
    const at = html.indexOf(`href="/release/${R.digital}"`);
    const fmt = html.indexOf('<td>7" Vinyl</td>', at);
    if (at < 0 || fmt < 0) throw new Error('shell changed: the Promotion row\'s Format cell was not found');
    const out = path.join(os.tmpdir(), `sa-caa-column-redesign-${process.pid}.html`);
    fs.writeFileSync(out, html.slice(0, fmt) + '<td>Digital Media</td>' + html.slice(fmt + '<td>7" Vinyl</td>'.length));
    return out;
})();

/**
 * Loads the page with routed artwork, presses Show all, opens every
 * sub-table and waits until every release with artwork has its cell built.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} [settings]
 * @param {{domToggle?: boolean}} [opts] domToggle: press the master toggle
 *   through the DOM — on the phone emulation MusicBrainz's header overlays it,
 *   so a pointer click is intercepted.
 * @returns {Promise<{hits: Map<string, number>}>} Archive JSON requests per release.
 */
async function open(page, settings = {}, { domToggle = false } = {}) {
    const hits = new Map();
    await loadUserscriptPage(page, {
        url: RG_URL,
        fixtureFile: shellFile,
        testMode: true,
        settingsOverride: {
            sa_enable_caa_pics: true,
            sa_art_idb_enable: false,
            sa_caa_pics_inline: false,
            sa_enable_relationships_column: false,
            ...settings,
        },
    });
    await page.route('https://musicbrainz.org/release-group/**',
        (route) => route.fulfill({ path: shellFile, contentType: 'text/html' }));
    await page.route('https://coverartarchive.org/**', (route) => route.fulfill({ status: 404, body: '' }));
    await page.route(/^https:\/\/coverartarchive\.org\/.*\.jpg$/,
        (route) => route.fulfill({ status: 200, contentType: 'image/png', body: ONE_PX_PNG }));
    await page.route(META_RE, (route) => {
        const mbid = route.request().url().match(META_RE)[1];
        hits.set(mbid, (hits.get(mbid) || 0) + 1);
        if (!BODIES[mbid]) return route.fulfill({ status: 404, body: '' });
        return route.fulfill({ status: 200, contentType: 'application/json', body: BODIES[mbid] });
    });
    await page.evaluate(() => {
        const original = window.GM_xmlhttpRequest;
        window.GM_xmlhttpRequest = (opts) => {
            if (!/coverartarchive\.org/.test((opts && opts.url) || '')) return original(opts);
            setTimeout(() => opts.onload({ status: 404, response: null, responseText: '' }), 0);
            return { abort() {} };
        };
    });
    // The shell's MusicBrainz stylesheet is scrubbed, and it is what gives the
    // artwork icon its size: without it the icon is 0×0 and cannot be hovered
    // or clicked. Same box as musicbrainz.org's own rule.
    await page.addStyleTag({ content: 'span.caa-icon, span.eaa-icon { display: inline-block; width: 16px; height: 16px; }' });
    await page.click(BUTTON);
    await waitForRenderComplete(page, { waitForAutoResize: false });
    if (domToggle) {
        await page.locator('.mb-master-toggle').evaluate((b) => b.click());
        await expect(page.locator('.mb-master-toggle')).toHaveAttribute('data-state', 'expanded');
    } else {
        await clickMasterToggleAndExpandAll(page);
    }
    await expect.poll(() => page.locator('ul.mb-caa-art-ul').count(), {
        timeout: 30000, message: 'every release with artwork gets its cell built',
    }).toBe(6);
    return { hits };
}

/** The CAA `<td>` of a release, as a locator. */
const cell = (page, mbid) => page.locator(`table.tbl tbody td:has(> ul.mb-caa-art-ul a[href="/release/${mbid}/cover-art"])`);

/**
 * Expands one CAA cell (its ▶), if collapsed.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} mbid
 */
async function expandCell(page, mbid) {
    const btn = cell(page, mbid).locator('[data-caa-expand-btn]');
    // A DOM click: the ▶ is handled by a delegated click listener, and on
    // the phone emulation a pointer click can land on MusicBrainz's header.
    if (await btn.getAttribute('data-caa-expand-btn') !== 'expanded') await btn.evaluate((b) => b.click());
    await expect(btn).toHaveAttribute('data-caa-expand-btn', 'expanded');
}

/**
 * Sets the CAA column filter of table `tableIdx` the way a user does — the
 * ✕ to clear what is there (`fill('')` is rejected by the script's genuine-
 * input guard), then a click and typed keys (the inputs are read-only until
 * a trusted interaction) — and waits for the filter to settle.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} tableIdx
 * @param {string} text  '' only clears.
 */
async function caaFilter(page, tableIdx, text) {
    const idx = await page.evaluate((t) => {
        const table = document.querySelectorAll('table.tbl')[t];
        const td = table.querySelector('tbody td:has(> ul.mb-caa-art-ul)');
        return td.cellIndex;
    }, tableIdx);
    const table = page.locator('table.tbl').nth(tableIdx);
    const input = table.locator(`thead .mb-col-filter-input[data-col-idx="${idx}"]`);
    const clear = table.locator(`thead .mb-col-filter-wrapper:has(.mb-col-filter-input[data-col-idx="${idx}"]) .mb-col-filter-clear`);
    if ((await input.inputValue()).trim()) await waitForFilterSettled(page, () => clear.click());
    if (text) {
        await input.click();
        await waitForFilterSettled(page, () => input.pressSequentially(text));
    }
}

/** Rows currently rendered in table `t`. */
const rowCount = (page, t) => page.evaluate((i) => document.querySelectorAll('table.tbl')[i].tBodies[0].rows.length, t);

/** The viewer's bar and stage, read in one go. */
const viewer = (page) => page.evaluate(() => {
    const v = document.getElementById('mb-art-viewer');
    if (!v || v.hidden) return null;
    const q = (s) => (v.querySelector(s) || {}).textContent || null;
    return {
        pos: q('.mb-artv-pos'),
        rowPos: q('.mb-artv-rowpos'),
        title: q('.mb-artv-title'),
        src: (v.querySelector('.mb-artv-img') || {}).src || '',
        size: ((v.querySelector('.mb-artv-img') || {}).dataset || {}).artvSize || null,
        zoom: ((v.querySelector('.mb-artv-img') || {}).style || {}).transform || '',
        slideshow: (v.querySelector('[data-artv="slideshow"]') || { getAttribute: () => null }).getAttribute('aria-pressed'),
        infoMarks: v.querySelectorAll('.mb-artv-info .mb-column-filter-highlight').length,
    };
});

module.exports = { R, BUTTON, ONE_PX_PNG, open, cell, expandCell, caaFilter, rowCount, viewer };
