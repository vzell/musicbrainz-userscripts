'use strict';

// discogs.com's MusicBrainz column: barcode candidates (2026-11-26,
// feat/link-page-keys phase 2; mockup
// https://claude.ai/artifact/NjNP8w1rWxkDfmfJteshY5, every recommendation
// approved). A release row no MusicBrainz release links: 🔎 asks Discogs for
// its barcode, formats and tracks, searches MusicBrainz by every form of the
// barcode and keeps a release as a CANDIDATE when barcode, media kinds and
// track count agree (First Contact's sameAlbum()). Never automatic, at most
// 25 a press (60 with a token), kept 7 days.
//
// The master page's 387 versions are all linked in the simulated importer
// cache except four, so a press asks for exactly those (Discogs answers once
// a second with a token). Their Discogs records and MusicBrainz's search
// answers come from `window.__gmXhrResponder`:
//   A  barcode 5099751969227, CD, 8 tracks → one MusicBrainz release agrees;
//   B  barcode 5099769170000, Cassette, 8 tracks → the only hit has 10
//      tracks: no candidate;
//   C  no barcode on Discogs → no MusicBrainz search at all;
//   D  barcode 0886975014281, CD, 8 tracks → two releases agree ("≈2").
//
// Guarantees pinned, each named:
//   - BC1: the button counts the releases to try, a press asks Discogs once
//     each and MusicBrainz only for those with a barcode (every form in one
//     query); A gets a candidate (≈, its release), D "≈2" (the barcode
//     search), B and C none; a candidate is no link (n stays 0); the button
//     ends at 0, greyed out;
//   - BC2: the card names what agreed and the MBID; ⧉ copies the Discogs
//     address;
//   - BC3: 📊 "» MB links: candidate" keeps exactly the candidate rows and
//     rings the candidate; the cell's text is "candidate <mbid>";
//   - BC4: a second visit asks nothing (the store) and still shows A's
//     candidate;
//   - BC5: nothing is asked without a press (never automatic).

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const FX = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, `ext-${name}.json`), 'utf8'));
const CAPTURES = ['discogs-master', 'discogs-release', ...[1, 2, 3, 4].map(p => `discogs-master-versions-p${p}`)].map(FX);
const ALL_ANSWERS = Object.fromEntries(CAPTURES.map(f => [f.url, { status: f.status, responseHeaders: `Content-Type: ${f.contentType}`, responseText: f.body }]));
const PAGE = 'https://www.discogs.com/master/26725-Bruce-Springsteen-Born-To-Run';
const IMPORTER_KEY = 'DISCOGS_MBLINKS_CACHE-v3.1';

// Every release of the four versions pages, in their order.
const VERSION_IDS = CAPTURES.filter(f => /versions/.test(f.url)).flatMap(f => JSON.parse(f.body).versions.map(v => String(v.id)));
const [A, B, C, D] = VERSION_IDS.slice(0, 4);
const MBX = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const MBY = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const MBZ = 'cccccccc-3333-4333-8333-cccccccccccc';
const LINKED = 'dddddddd-4444-4444-8444-dddddddddddd';

const NOW = Date.now();
// The importer has linked every other version already.
const IMPORTER_CACHE = Object.fromEntries(VERSION_IDS.filter(id => ![A, B, C, D].includes(id))
    .map(id => [`release/${id}/release`, { timestamp: NOW, urls: [{ url: `https://musicbrainz.org/release/${LINKED}`, ended: false }] }]));

// Discogs' records of A–D (the API's shape: identifiers, formats, tracklist).
const tracks = (n) => Array.from({ length: n }, (_, i) => ({ position: String(i + 1), type_: 'track', title: `Track ${i + 1}` }));
const DG = {
    [A]: { id: Number(A), title: 'Born To Run', identifiers: [{ type: 'Barcode', value: '5 099751 969227' }], formats: [{ name: 'CD', qty: '1' }], tracklist: tracks(8) },
    [B]: { id: Number(B), title: 'Born To Run', identifiers: [{ type: 'Barcode', value: '5099769170000' }], formats: [{ name: 'Cassette', qty: '1' }], tracklist: tracks(8) },
    [C]: { id: Number(C), title: 'Born To Run', identifiers: [{ type: 'Matrix / Runout', value: 'AL 33795' }], formats: [{ name: 'Vinyl', qty: '1' }], tracklist: tracks(8) },
    [D]: { id: Number(D), title: 'Born To Run', identifiers: [{ type: 'Barcode', value: '886975014281' }], formats: [{ name: 'CD', qty: '1' }], tracklist: tracks(8) },
};
// MusicBrainz's search answers, by the barcode's core.
const rel = (id, barcode, format, n, date, country) => ({ id, title: 'Born to Run', barcode, date, country, media: [{ format, 'track-count': n }] });
const MB_SEARCH = {
    5099751969227: [rel(MBX, '5099751969227', 'CD', 8, '2005-11-15', 'US')],
    5099769170000: [rel('eeeeeeee-5555-4555-8555-eeeeeeeeeeee', '5099769170000', 'Cassette', 10, '1975', 'NL')],
    886975014281: [rel(MBY, '886975014281', 'CD', 8, '2015', 'XE'), rel(MBZ, '0886975014281', 'CD', 8, '2015-02-02', 'GB')],
};

/**
 * Loads the master page with the userscript; Discogs' API from the captures
 * and `DG`, MusicBrainz's /ws/2/url (nothing linked by URL) and its release
 * search from `MB_SEARCH`, the clipboard captured in `window.__copied`.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{errors: string[]}>}
 */
async function openDg(page) {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
    await page.context().addInitScript(([r, key, cache, dg, search]) => {
        window.__gmXhrResponses = r;
        if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(cache));
        try {
            Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (t) => { window.__copied = t; return Promise.resolve(); } } });
        } catch (_) { /* the copy test then fails visibly */ }
        const json = (body, status = 200) => ({ status, responseHeaders: 'Content-Type: application/json', responseText: JSON.stringify(body) });
        window.__gmXhrResponder = (opts) => {
            const u = new URL(opts.url);
            const m = /^\/releases\/(\d+)$/.exec(u.pathname);
            if (u.origin === 'https://api.discogs.com' && m && dg[m[1]]) return json(dg[m[1]]);
            if (u.origin !== 'https://musicbrainz.org') return undefined;
            if (u.pathname === '/ws/2/url') {
                return u.searchParams.getAll('resource').length === 1 ? json({ error: 'Not Found' }, 404) : json({ 'url-count': 0, 'url-offset': 0, urls: [] });
            }
            if (u.pathname === '/ws/2/release') {
                const forms = (/barcode:\(([^)]*)\)/.exec(u.searchParams.get('query') || '') || [])[1] || '';
                const hit = forms.split(' OR ').map(x => x.replace(/^0+/, '')).find(x => search[x]);
                return json({ count: hit ? search[hit].length : 0, offset: 0, releases: hit ? search[hit] : [] });
            }
            return undefined;
        };
    }, [ALL_ANSWERS, IMPORTER_KEY, IMPORTER_CACHE, DG, MB_SEARCH]);
    await loadUserscriptPage(page, {
        url: PAGE,
        fixtureFile: path.join(__dirname, 'dg-master.html'),
        testMode: true,
        settingsOverride: { sa_enable_discogs: true, sa_pop_ext_discogs_token: 'tok-probe', sa_render_threshold: 100000 },
    });
    await page.locator('#mb-dg-root button[data-label="Show all versions"]').click();
    await waitForRenderComplete(page, { waitForAutoResize: false });
    await expect.poll(() => page.locator('#mb-dg-root td.mb-dg-mb-cell[data-mb-dg-state="pending"]').count(), { timeout: 15000 }).toBe(0);
    return { errors };
}

const table = (page) => page.locator('#mb-dg-root table.tbl').first();
const cell = (page, id) => table(page).locator(`td.mb-dg-mb-cell[data-mb-dg-key="release/${id}"]`).first();
const bcBtn = (page) => page.locator('.mb-dgbc-col-hdr-btn').first();
// The requests so far, per kind.
const log = (page) => page.evaluate(() => (window.__gmXhrLog || []).map(r => r.url));
const discogsReleaseAsks = (urls) => urls.filter(u => /^https:\/\/api\.discogs\.com\/releases\/\d+$/.test(u));
const mbSearches = (urls) => urls.filter(u => u.startsWith('https://musicbrainz.org/ws/2/release?'));

/**
 * Presses 🔎 and waits until the run ends (the button reads "🔎 N" again).
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function pressBarcodes(page) {
    await bcBtn(page).click();
    await expect(bcBtn(page)).toHaveText(/^🔎 \d+$/, { timeout: 30000 });
}

test.describe('discogs.com: barcode candidates in the MusicBrainz column', () => {
    test('BC1 + BC5: the button counts what to try; a press asks Discogs once each, MusicBrainz only with a barcode; candidates are no links', async ({ page }) => {
        const { errors } = await openDg(page);
        await expect(bcBtn(page)).toHaveText('🔎 4');
        await expect(bcBtn(page)).toBeEnabled();
        // BC5: nothing asked before the press.
        expect(discogsReleaseAsks(await log(page))).toEqual([]);
        expect(mbSearches(await log(page))).toEqual([]);

        await pressBarcodes(page);
        const urls = await log(page);
        expect(discogsReleaseAsks(urls).sort()).toEqual([A, B, C, D].map(id => `https://api.discogs.com/releases/${id}`).sort());
        const searches = mbSearches(urls).map(u => new URL(u).searchParams.get('query'));
        expect(searches, 'C has no barcode: three searches, for A, B and D').toHaveLength(3);
        // Every form of 8 to 14 digits (a 15-digit one is no barcode).
        expect(searches.find(q => q.includes('5099751969227'))).toBe('barcode:(5099751969227 OR 05099751969227)');
        expect(searches.find(q => q.includes('886975014281'))).toBe('barcode:(886975014281 OR 0886975014281 OR 00886975014281)');

        await expect(cell(page, A).locator('a.mb-dg-mb-cand')).toHaveAttribute('href', `https://musicbrainz.org/release/${MBX}`);
        await expect(cell(page, A).locator('.mb-dg-mb-eq')).toHaveText('≈');
        await expect(cell(page, A)).toHaveAttribute('data-mb-dg-cand', '1');
        await expect(cell(page, A)).toHaveAttribute('data-mb-dg-n', '0');
        await expect(cell(page, A).locator('a.mb-dg-mb-link')).toHaveCount(0);
        await expect(cell(page, D).locator('.mb-dg-mb-eq')).toHaveText('≈2');
        await expect(cell(page, D).locator('a.mb-dg-mb-cand')).toHaveAttribute('href', /\/search\?query=barcode%3A886975014281&type=release/);
        for (const id of [B, C]) {
            await expect(cell(page, id).locator('a.mb-dg-mb-cand')).toHaveCount(0);
            await expect(cell(page, id).locator('.mb-dg-mb-search')).toHaveCount(1);
        }
        await expect(bcBtn(page)).toHaveText('🔎 0');
        await expect(bcBtn(page)).toBeDisabled();
        expect(errors).toEqual([]);
    });

    test('BC2: the card names what agreed; ⧉ copies the Discogs address', async ({ page }) => {
        const { errors } = await openDg(page);
        await pressBarcodes(page);
        const card = await cell(page, A).locator('a.mb-dg-mb-cand').getAttribute('data-mbtt');
        expect(card).toContain('≈ Barcode candidate');
        expect(card).toContain('Barcode 5099751969227 ✓');
        expect(card).toContain('Tracks 8 ✓');
        expect(card).toContain(`musicbrainz.org/release/${MBX}`);
        const two = await cell(page, D).locator('a.mb-dg-mb-cand').getAttribute('data-mbtt');
        expect(two).toContain('Barcode candidates (2)');
        expect(two).toContain(MBY);
        expect(two).toContain(MBZ);
        await cell(page, A).evaluate(td => td.closest('table').closest('div, section, body').scrollIntoView());
        await cell(page, A).locator('.mb-dg-mb-copy').evaluate(b => b.click());
        await expect.poll(() => page.evaluate(() => window.__copied)).toBe(`https://www.discogs.com/release/${A}`);
        await expect(cell(page, A).locator('.mb-dg-mb-copy')).toHaveAttribute('data-mb-dg-copied', '1');
        expect(errors).toEqual([]);
    });

    test('BC3: 📊 "» MB links: candidate" keeps the candidate rows and rings them; the cell\'s text is "candidate <mbid>"', async ({ page }) => {
        const { errors } = await openDg(page);
        await pressBarcodes(page);
        const clean = await cell(page, A).evaluate(td => window.__saTest.cleanColumnText(td).replace(/\s+/g, ' ').trim());
        expect(clean).toBe(`candidate ${MBX}`);
        await table(page).evaluate((t) => {
            const th = Array.from(t.querySelectorAll('thead tr:first-child th')).find(x => (x.dataset.colName || '') === 'MusicBrainz');
            th.querySelector('.mb-col-uniq-wrap').click();
        });
        await expect(page.locator('#mb-col-uniq-dropdown')).toBeVisible();
        const items = await page.evaluate(() => {
            const sec = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
                .find(x => x.querySelector('.mb-uniq-section-label')?.textContent === 'MusicBrainz - Links');
            return sec ? Array.from(sec.querySelectorAll('.mb-col-uniq-item')).map(i => i.dataset.mbUniqSynLabel) : null;
        });
        expect(items).toContain('» MB links: candidate');
        await page.evaluate(() => {
            const sec = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
                .find(x => x.querySelector('.mb-uniq-section-label')?.textContent === 'MusicBrainz - Links');
            Array.from(sec.querySelectorAll('.mb-col-uniq-item')).find(el => el.dataset.mbUniqSynLabel === '» MB links: candidate').click();
        });
        await expect(table(page).locator('tbody > tr')).toHaveCount(2);
        await expect(table(page).locator('td.mb-dg-mb-cell a.mb-dg-mb-cand.mb-rel-icon-match')).toHaveCount(2);
        expect(errors).toEqual([]);
    });

    test('BC4: a second visit asks nothing and still shows the candidate (our store, 7 days)', async ({ page }) => {
        await openDg(page);
        await pressBarcodes(page);
        const { errors } = await openDg(page);
        await expect(cell(page, A).locator('a.mb-dg-mb-cand')).toHaveAttribute('href', `https://musicbrainz.org/release/${MBX}`);
        await expect(bcBtn(page)).toHaveText('🔎 0');
        expect(discogsReleaseAsks(await log(page))).toEqual([]);
        expect(mbSearches(await log(page))).toEqual([]);
        expect(errors).toEqual([]);
    });
});
