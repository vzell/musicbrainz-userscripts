'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { seedCacheOverview } = require('../support/idbFixture');

// 💾 Browser cache: Export and Import (_idbx*). Mockup approved 2026-10-10:
// https://claude.ai/artifact/AsJhH3GAiNmfaDGz2ci4q6
//
// Both databases are seeded with one known cache (seedCacheOverview()). The
// guarantees pinned:
//   - Export writes a real download: a gzip of one JSON object per line —
//     header (origin, layouts, parts), one line per entry STILL WITHIN its keep
//     time (expired ones never), end line with the count. Images are unticked
//     until ticked; ticked, a Blob comes back byte for byte.
//   - Import classifies before it writes: the preview's counts per part
//     (missing here / newer in the file / same or newer here / expired /
//     invalid with reasons) are right, and IndexedDB is unchanged until the
//     merge is confirmed; Cancel writes nothing.
//   - The merge writes exactly the "missing" and "newer" entries: a newer
//     local entry is never replaced, expired and invalid entries never written.
//   - A part written with another database layout is skipped whole.
//   - Not an export, another site's export, a cut-short file: refused with
//     their reason, nothing written.
//   - Esc cancels the merge question, then closes the pane, then the dialog.
//   - Stop during a merge keeps the batches already written, drops the rest.
//   - Round trip: export, Clear all, import = the live part of the seed.
//   - The "Last import" tile records the merge; "Last clean-up" stays.

const URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/recordings';
const FIXTURE = path.join(__dirname, 'artist-recordings.html');
const DAY = 86400000;
const dlg = (page) => page.locator('#mb-idb-overview');
const pane = (page, id) => page.locator(`#mb-idb-overview [data-idbx-pane="${id}"]`);
const imRow = (page, id) => page.locator(`#mb-idb-overview tr[data-idbx-im-row="${id}"]`);

/** The entries still within their keep time in the seed, by part (images aside). */
const LIVE = {
    metadata: ['/release/a', '/release/b'],
    'rel-ws2': ['release:aaa', 'release:bbb'],
    'recof-ws2': ['recording:r1|work-rels', 'recording:r2|work-rels'],
    'artist-works': ['x'],
    pages: ['https://en.wikipedia.org/wiki/Born_to_Run'],
};
const KEY = { images: 'url', metadata: 'entityPath', 'rel-ws2': 'ckey', 'ms-rec-len': 'gid', 'recof-ws2': 'ckey', 'artist-works': 'artist', pages: 'url' };

/**
 * Seeds the cache, loads the page and opens the overview.
 * @param {import('@playwright/test').Page} page
 */
async function setup(page) {
    await seedCacheOverview(page);
    await loadUserscriptPage(page, { url: URL, fixtureFile: FIXTURE, testMode: true });
    await page.waitForFunction(() => window.__seedDone === 2);
    await page.evaluate(() => window.__saTest.idbOverview.open());
    await expect(page.locator('#mb-idb-overview tr[data-part="images"]')).toBeVisible();
}

/** Every record of one part straight from IndexedDB, keyed by its key. */
const dump = (page, id) => page.evaluate((p) => window.__saTest.idbOverview.dump(p), id)
    .then((rs) => Object.fromEntries(rs.map((r) => [r[KEY[id]], r])));

/**
 * Clicks "Write file" and returns the download's lines, parsed.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{lines: Array<object>, file: string, name: string}>}
 */
async function download(page) {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('[data-idbx="ex-go"]').click()]);
    const file = await dl.path();
    const lines = zlib.gunzipSync(fs.readFileSync(file)).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    return { lines, file, name: dl.suggestedFilename() };
}

/**
 * Writes a crafted import file and returns its path.
 * @param {import('@playwright/test').TestInfo} info
 * @param {string} name
 * @param {Array<object|string>} lines - Objects are JSON-encoded; strings go as they are.
 * @param {{gzip?: boolean}} [opts]
 * @returns {string}
 */
function craft(info, name, lines, { gzip = true } = {}) {
    const text = lines.map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n') + '\n';
    const file = info.outputPath(name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, gzip ? zlib.gzipSync(Buffer.from(text, 'utf8')) : text);
    return file;
}

/** An export header as the script writes it. */
function header(parts, over = {}) {
    return {
        kind: 'sa-cache-export', format: 1, script: 'ShowAllEntityData', version: '9.99.9999', origin: 'https://musicbrainz.org',
        written: Date.now(), browser: 'Firefox 131', layouts: { 'vz-mb-saed-art-cache': 4, 'vz-saed-detail-pages': 1 },
        parts: parts.map(([id, count]) => ({ id, count })), ...over,
    };
}

/**
 * Opens the Import pane and chooses a file; waits for the check to end.
 * @param {import('@playwright/test').Page} page
 * @param {string} file
 */
async function chooseFile(page, file) {
    if (!await pane(page, 'im').isVisible()) await page.locator('[data-idbx="open-import"]').click();
    await page.locator('#mb-idbx-file').setInputFiles(file);
    await expect(pane(page, 'im').locator('[data-idbx-checking]')).toHaveCount(0, { timeout: 15000 });
}

/** The crafted file of the main import test (built after the seed, so "newer" is newer). */
function mainFile(info) {
    const now = Date.now();
    return craft(info, 'main.jsonl.gz', [
        header([['rel-ws2', 3], ['recof-ws2', 2], ['metadata', 1], ['pages', 1]]),
        { p: 'rel-ws2', v: { ckey: 'release:ccc', data: { relations: [1] }, ts: now } },                       // missing here
        { p: 'rel-ws2', v: { ckey: 'release:aaa', data: { relations: [2] }, ts: now + 60000 } },               // newer in the file
        { p: 'rel-ws2', v: { ckey: 'release:bbb', data: { relations: [3] }, ts: now - 5 * DAY } },             // newer here
        { p: 'recof-ws2', v: { ckey: 'recording:r9|work-rels', rels: 'x', ts: now } },                         // invalid
        { p: 'recof-ws2', v: { ckey: 'recording:r8|work-rels', rels: [], ts: now + 3 * DAY } },                // invalid
        { p: 'metadata', v: { entityPath: '/release/z', count: 1, images: [], storedAt: now - 40 * DAY } },    // expired
        { p: 'pages', v: { url: 'https://example.org/p', v: 2, at: now, data: { title: 'P' } } },             // missing here
        { kind: 'end', count: 7 },
    ]);
}

test.describe('💾 browser cache: Export and Import', () => {
    test('the Export pane: images unticked, expired counted as left out; ticking images warns of the size', async ({ page }) => {
        await setup(page);
        await page.locator('[data-idbx="open-export"]').click();
        await expect(page.locator('[data-idbx="open-export"]')).toHaveAttribute('aria-pressed', 'true');
        const ex = pane(page, 'ex');
        await expect(ex).toBeVisible();
        await expect(ex.locator('[data-idbx-ex="images"]')).not.toBeChecked();
        for (const id of ['metadata', 'rel-ws2', 'recof-ws2', 'artist-works', 'pages']) await expect(ex.locator(`[data-idbx-ex="${id}"]`)).toBeChecked();
        await expect(ex.locator('tr[data-idbx-ex-row="metadata"] td').nth(2)).toHaveText('2');
        await expect(ex.locator('tr[data-idbx-ex-row="metadata"] td').nth(3)).toHaveText('1');
        await expect(ex.locator('[data-idbx-notice]')).toHaveCount(0);
        await expect(ex.locator('.mb-idbx-facts')).toContainText('8 from 5 parts (3 expired left out)');
        await ex.locator('[data-idbx-ex="images"]').check();
        await expect(ex.locator('[data-idbx-notice]')).toContainText('Cover art images add');
        await expect(ex.locator('.mb-idbx-facts')).toContainText('9 from 6 parts');
    });

    test('Write file downloads every live entry, no expired one, no image; header and end line', async ({ page }) => {
        await setup(page);
        await page.locator('[data-idbx="open-export"]').click();
        const { lines, name } = await download(page);
        expect(name).toMatch(/^sa-cache-musicbrainz\.org-\d{4}-\d{2}-\d{2}\.jsonl\.gz$/);
        const [h, ...rest] = lines;
        expect(h).toMatchObject({ kind: 'sa-cache-export', format: 1, origin: 'https://musicbrainz.org',
                                  layouts: { 'vz-mb-saed-art-cache': 4, 'vz-saed-detail-pages': 1 } });
        expect(h.parts.map((p) => p.id).sort()).toEqual(['artist-works', 'metadata', 'ms-rec-len', 'pages', 'recof-ws2', 'rel-ws2'].sort());
        const end = rest.pop();
        expect(end).toEqual({ kind: 'end', count: 8 });
        const got = {};
        for (const l of rest) (got[l.p] = got[l.p] || []).push(l.v[KEY[l.p]]);
        for (const id of Object.keys(got)) got[id].sort();
        expect(got).toEqual(Object.fromEntries(Object.entries(LIVE).map(([k, v]) => [k, [...v].sort()])));
        await expect(pane(page, 'ex').locator('[data-idbx-state]')).toHaveText('Done');
        await expect(pane(page, 'ex').locator('[data-idbx-toast]')).toContainText('8 entries from 5 parts');
    });

    test('round trip with images: export, Clear all, import gives back the live seed, a Blob byte for byte', async ({ page }, info) => {
        await setup(page);
        const before = {};
        for (const id of Object.keys(LIVE)) before[id] = await dump(page, id);
        await page.locator('[data-idbx="open-export"]').click();
        await pane(page, 'ex').locator('[data-idbx-ex="images"]').check();
        const { lines, file } = await download(page);
        const img = lines.find((l) => l.p === 'images');
        expect(img.v.blob.$blob.type).toBe('image/png');
        expect(Buffer.from(img.v.blob.$blob.b64, 'base64').length).toBe(5000);
        expect(lines.filter((l) => l.p === 'images')).toHaveLength(1);

        await page.locator('[data-idbo="all"]').click();
        await page.locator('[data-idbo="yes"]').click();
        await expect(page.locator('#mb-idb-overview [data-idbo-stat="entries"] .v')).toHaveText('0');
        const copy = info.outputPath('roundtrip.jsonl.gz');
        fs.copyFileSync(file, copy);
        await chooseFile(page, copy);
        await page.locator('[data-idbx="im-go"]').click();
        await page.locator('[data-idbx="im-yes"]').click();
        await expect(pane(page, 'im').locator('[data-idbx-done]')).toContainText('Added 9, updated 0, skipped 0');
        for (const id of Object.keys(LIVE)) {
            const after = await dump(page, id);
            expect(Object.keys(after).sort(), id).toEqual([...LIVE[id]].sort());
            for (const k of LIVE[id]) expect(after[k], `${id} ${k}`).toEqual(before[id][k]);
        }
        const images = await dump(page, 'images');
        expect(images['https://coverartarchive.org/release/a/front-250'].blob).toEqual({ blobSize: 5000, blobType: 'image/png' });
        const bytes = await page.evaluate(() => window.__saTest.idbOverview.exportB64(['images']));
        const back = zlib.gunzipSync(Buffer.from(bytes, 'base64')).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
        expect(back.find((l) => l.p === 'images').v.blob.$blob.b64, 'the stored bytes are the exported bytes').toBe(img.v.blob.$blob.b64);
    });

    test('import: the preview classifies, nothing is written before Merge, Cancel writes nothing, Merge writes only new and newer', async ({ page }, info) => {
        await setup(page);
        const relBefore = await dump(page, 'rel-ws2');
        await chooseFile(page, mainFile(info));
        const cell = (id, c) => imRow(page, id).locator(`[data-c="${c}"]`);
        await expect(cell('rel-ws2', 'add')).toHaveText('1');
        await expect(cell('rel-ws2', 'upd')).toHaveText('1');
        await expect(cell('rel-ws2', 'same')).toHaveText('1');
        await expect(cell('recof-ws2', 'bad')).toHaveText('2');
        await expect(cell('metadata', 'exp')).toHaveText('1');
        await expect(cell('pages', 'add')).toHaveText('1');
        await expect(imRow(page, 'images')).toContainText('not in this file');
        await imRow(page, 'recof-ws2').locator('[data-idbx-why] summary').click();
        await expect(imRow(page, 'recof-ws2').locator('.mb-idbx-reasons')).toContainText('1 × "rels" is not a list');
        await expect(imRow(page, 'recof-ws2').locator('.mb-idbx-reasons')).toContainText('1 × the stored date lies in the future');
        await expect(pane(page, 'im').locator('[data-idbx-plan]')).toContainText('adds 2 and updates 1 entries');
        expect(await dump(page, 'rel-ws2'), 'nothing written by the check').toEqual(relBefore);

        await page.locator('[data-idbx="im-go"]').click();
        await expect(pane(page, 'im').locator('[data-idbx-ask]')).toContainText('Merge 3 entries');
        await page.locator('[data-idbx="im-no"]').click();
        await expect(pane(page, 'im').locator('[data-idbx-ask]')).toHaveCount(0);
        expect(await dump(page, 'rel-ws2'), 'Cancel wrote nothing').toEqual(relBefore);

        await page.locator('[data-idbx="im-go"]').click();
        await page.locator('[data-idbx="im-yes"]').click();
        await expect(pane(page, 'im').locator('[data-idbx-done]')).toContainText('Added 2, updated 1, skipped 4');
        await expect(pane(page, 'im').locator('[data-idbx-state]')).toHaveText('Done with errors');
        const rel = await dump(page, 'rel-ws2');
        expect(rel['release:ccc'].data).toEqual({ relations: [1] });
        expect(rel['release:aaa'].data, 'newer in the file replaced the local entry').toEqual({ relations: [2] });
        expect(rel['release:bbb'], 'a newer local entry is kept').toEqual(relBefore['release:bbb']);
        const recof = await dump(page, 'recof-ws2');
        expect(Object.keys(recof).filter((k) => /r[89]/.test(k)), 'invalid entries are never written').toEqual([]);
        expect(Object.keys(await dump(page, 'metadata'))).not.toContain('/release/z');
        expect(Object.keys(await dump(page, 'pages'))).toContain('https://example.org/p');
        // The overview rescanned, and the Last import tile names the file; Last clean-up stays.
        await expect(page.locator('#mb-idb-overview [data-idbo-stat="import"]')).toContainText('today,');
        await expect(page.locator('#mb-idb-overview [data-idbo-stat="import"]')).toContainText('main.jsonl.gz');
        await expect(page.locator('#mb-idb-overview .mb-idbo-stat .k', { hasText: 'Last clean-up' })).toHaveCount(1);
        await expect(page.locator('#mb-idb-overview [data-idbo-toast]')).toContainText('Imported: added 2, updated 1, skipped 4.');
    });

    test('a part written with another layout is skipped whole; the others merge', async ({ page }, info) => {
        await setup(page);
        const now = Date.now();
        const file = craft(info, 'layout.jsonl.gz', [
            header([['rel-ws2', 1], ['pages', 1]], { layouts: { 'vz-mb-saed-art-cache': 3, 'vz-saed-detail-pages': 1 } }),
            { p: 'rel-ws2', v: { ckey: 'release:ddd', data: {}, ts: now } },
            { p: 'pages', v: { url: 'https://example.org/q', v: 2, at: now, data: {} } },
            { kind: 'end', count: 2 },
        ]);
        await chooseFile(page, file);
        await expect(imRow(page, 'rel-ws2').locator('[data-idbx-skip]')).toHaveText('Skipped: written with art cache layout 3; this browser has 4');
        await expect(imRow(page, 'rel-ws2').locator('input[type=checkbox]')).toBeDisabled();
        await page.locator('[data-idbx="im-go"]').click();
        await page.locator('[data-idbx="im-yes"]').click();
        await expect(pane(page, 'im').locator('[data-idbx-done]')).toContainText('Added 1, updated 0');
        expect(Object.keys(await dump(page, 'rel-ws2'))).not.toContain('release:ddd');
        expect(Object.keys(await dump(page, 'pages'))).toContain('https://example.org/q');
    });

    test('refused: not an export, not gzip, another site, cut short; nothing written', async ({ page }, info) => {
        await setup(page);
        const before = await page.evaluate(() => window.__saTest.idbOverview.scan());
        const err = pane(page, 'im').locator('[data-idbx-error]');
        const cases = [
            [craft(info, 'table.json.gz', [{ rows: [] }]), 'not a ShowAllEntityData cache export'],
            [craft(info, 'plain.txt', ['hello'], { gzip: false }), 'not a ShowAllEntityData cache export'],
            [craft(info, 'other.jsonl.gz', [header([['rel-ws2', 0]], { origin: 'https://www.springsteenlyrics.com' }), { kind: 'end', count: 0 }]),
                'This export is from www.springsteenlyrics.com.'],
            [craft(info, 'short.jsonl.gz', [header([['rel-ws2', 1]]), { p: 'rel-ws2', v: { ckey: 'release:eee', data: {}, ts: Date.now() } }]),
                'The file ends early.'],
        ];
        for (const [file, msg] of cases) {
            await chooseFile(page, file);
            await expect(err).toContainText(msg);
            await expect(pane(page, 'im').locator('[data-idbx-state]')).toHaveText('Failed');
        }
        expect(await page.evaluate(() => window.__saTest.idbOverview.scan())).toEqual(before);
    });

    test('Esc cancels the merge question, then closes the pane, then the dialog', async ({ page }, info) => {
        await setup(page);
        await chooseFile(page, mainFile(info));
        await page.locator('[data-idbx="im-go"]').click();
        await expect(pane(page, 'im').locator('[data-idbx-ask]')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(pane(page, 'im').locator('[data-idbx-ask]')).toHaveCount(0);
        await expect(pane(page, 'im')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(pane(page, 'im')).toHaveCount(0);
        await expect(dlg(page)).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(dlg(page)).toHaveCount(0);
    });

    test('Stop during a merge keeps the batches already written and drops the rest', async ({ page }, info) => {
        await setup(page);
        const now = Date.now();
        const many = Array.from({ length: 450 }, (_, i) => ({ p: 'rel-ws2', v: { ckey: `release:n${i}`, data: {}, ts: now } }));
        await chooseFile(page, craft(info, 'many.jsonl.gz', [header([['rel-ws2', 450]]), ...many, { kind: 'end', count: 450 }]));
        await page.evaluate(() => window.__saTest.idbOverview.holdAfterFlush(true));
        await page.locator('[data-idbx="im-go"]').click();
        await page.locator('[data-idbx="im-yes"]').click();
        await expect.poll(() => page.evaluate(() => window.__idbxHeld || 0)).toBe(1);
        await page.locator('[data-idbx="im-stop"]').click();
        await page.evaluate(() => { window.__saTest.idbOverview.holdAfterFlush(false); window.__idbxRelease(); });
        await expect(pane(page, 'im').locator('[data-idbx-done]')).toContainText('Stopped.');
        await expect(pane(page, 'im').locator('[data-idbx-state]')).toHaveText('Done with errors');
        const rel = await dump(page, 'rel-ws2');
        expect(Object.keys(rel).filter((k) => k.startsWith('release:n')), 'exactly the first batch of 200').toHaveLength(200);
    });
});
