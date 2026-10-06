'use strict';

// release-tracks: the archive's Medium images in each medium's h3 (mockup R7)
// — org/CAA-release-tracks-handling.org, phase P4.
//
// The record is the real 16-image one of d0adda7e, whose Medium images are
// 7, 8, 11 and 12 (no comments); each test edits a copy of it. Fixtures:
// release-tracks-multi-event.html (3 × CD), release-tracks-medley.html (1 × CD)
// and release-tracks-eti-keywords.html (3 × 12" Vinyl, its tab rewritten from
// "Cover art (0)" so the section loads at all).
//
// What each test pins, and the neighbouring property it keeps apart:
//
//  1. NEVER GUESS: 4 uncommented Medium images on 3 media give the note and
//     NO thumb. "A note is shown" alone passes on code that also guesses.
//  2. EQUAL COUNTS, NO COMMENTS: archive order. The control that the refusal
//     in 1 is about the counts, not a blanket refusal.
//  3. COMMENTS BEAT ORDER: "CD 3, CD 2, CD 1" on images in archive order
//     land reversed. Order-based code passes 2 and fails here.
//  4. A PARTLY READABLE SET REFUSES THE REST: one "CD 3" plus two uncommented
//     images on 3 media place only the "CD 3" one. Equal counts must not
//     kick in once any comment exists.
//  5. A COMMENT NAMING A MEDIUM THAT DOES NOT EXIST ("CD 7") is unassigned.
//  6. SIDES COUNT ONLY ON TWO-SIDED MEDIA: "side C" is medium 2 on vinyl and
//     nothing on CDs.
//  7. ONE MEDIUM TAKES THEM ALL, capped at 4 thumbs plus "+N".
//  8. A THUMB CLICK OPENS THE VIEWER AT THAT IMAGE AND DOES NOT COLLAPSE THE
//     MEDIUM (the h3's own click handler would); the note opens the Medium
//     images only.
//  9. THE THUMBS SURVIVE A FILTER RE-RENDER; the setting turns them off; no
//     request beyond the section's one.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const RECORD_TEXT = fs.readFileSync(path.join(__dirname, 'caa-release-d0adda7e.json'), 'utf8');
const META_RE = /^https:\/\/coverartarchive\.org\/release\/([0-9a-f-]{36})$/;
const CORS = { 'access-control-allow-origin': '*' };

const CDS = { url: 'https://musicbrainz.org/release/d390b4ff-38ab-4783-99ef-2c4d338e016b', file: 'release-tracks-multi-event.html' };
const ONE_CD = { url: 'https://musicbrainz.org/release/a9a3b139-cf22-4d28-801e-3f3d49521d0e', file: 'release-tracks-medley.html' };
const VINYL = {
    url: 'https://musicbrainz.org/release/5cf63c93-e27e-4d98-81bc-9aba8b6861a7', file: 'release-tracks-eti-keywords.html',
    rewrite: (html) => html.replace('Cover art (0)', 'Cover art (16)'),
};

/**
 * A fresh copy of the real record, optionally edited.
 *
 * @param {function(Object): void} [edit] Mutates the parsed record.
 * @returns {string}
 */
function record(edit) {
    const r = JSON.parse(RECORD_TEXT);
    if (edit) edit(r);
    return JSON.stringify(r);
}

/**
 * Loads a fixture (MusicBrainz's own bundles blocked, as in
 * release-tracks-event-consistency.spec.js), routes the archive, presses
 * "Show all" and waits for the section's sheet.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{url: string, file: string, rewrite?: function(string): string}} fx
 * @param {{body?: string, settings?: Object}} [opts]
 * @returns {Promise<{hits: function(): number}>}
 */
async function openRelease(page, fx, { body = record(), settings = {} } = {}) {
    await page.context().route('https://static.metabrainz.org/**', (route) => route.abort('blockedbyclient'));
    let fixtureFile = path.join(__dirname, fx.file);
    let html = null;
    if (fx.rewrite) {
        html = fx.rewrite(fs.readFileSync(fixtureFile, 'utf8'));
        fixtureFile = path.join(__dirname, '..', '..', 'test-results',
            `medium-art-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
        fs.mkdirSync(path.dirname(fixtureFile), { recursive: true });
        fs.writeFileSync(fixtureFile, html);
    }
    let hits = 0;
    await loadUserscriptPage(page, {
        url: fx.url, fixtureFile, testMode: true,
        settingsOverride: {
            sa_enable_release_tracks: true,
            sa_enable_release_tracks_cover_art: true,
            sa_enable_release_tracks_medium_art: true,
            sa_art_idb_enable: false,
            ...settings,
        },
    });
    await page.route('https://musicbrainz.org/release/**', (route) => route.fulfill({
        ...(html !== null ? { body: html } : { path: fixtureFile }), contentType: 'text/html',
    }));
    await page.route('https://coverartarchive.org/**',
        (route) => route.fulfill({ status: 404, headers: CORS, body: '' }));
    await page.route(META_RE, (route) => {
        hits += 1;
        return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body });
    });
    await page.click('button[data-label="Show all Tracks for Release"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
    await page.locator('.mb-release-art-sec[data-mb-art-state="ok"]').waitFor({ state: 'attached', timeout: 15000 });
    return { hits: () => hits };
}

/**
 * Each medium h3's Medium art: its thumbs (archive indices), "+N" and note.
 *
 * @param {import('@playwright/test').Page} page
 */
const mediumArt = (page) => page.evaluate(() => Array.from(document.querySelectorAll('h3.mb-toggle-h3'))
    .filter((h3) => /^\s*\d+\s+-\s/.test((h3.querySelector('.mb-toggle-icon') || {}).nextSibling?.textContent || ''))
    .map((h3) => {
        const box = h3.querySelector(':scope > .mb-medium-art');
        return {
            name: h3.querySelector('.mb-toggle-icon').nextSibling.textContent.trim(),
            thumbs: box ? Array.from(box.querySelectorAll('.mb-medium-art-btn')).map((b) => Number(b.dataset.mbArtI)) : [],
            more: box ? (box.querySelector('.mb-medium-art-more') || {}).textContent || null : null,
            note: box ? (box.querySelector('.mb-medium-art-note') || {}).textContent || null : null,
        };
    }));

/** Image 12 is no longer a Medium image: 3 Medium images (7, 8, 11) remain. */
const threeMedium = (r) => { r.images[12].types = ['Other']; };

test.describe('release-tracks: Medium images in the medium headings (P4, R7)', () => {
    test('4 uncommented Medium images on 3 media: a note, never a guess', async ({ page }) => {
        const { hits } = await openRelease(page, CDS);
        const m = await mediumArt(page);
        expect(m.map((x) => x.name), 'premise: three CD media').toEqual(['1 - CD', '2 - CD', '3 - CD']);
        expect(m.map((x) => x.thumbs)).toEqual([[], [], []]);
        expect(m[0].note).toBe('4 Medium images, 3 media, no comments: not assigned');
        expect(m[1].note).toBeNull();
        expect(hits(), 'no request beyond the section\'s').toBe(1);
    });

    test('as many uncommented Medium images as media: archive order', async ({ page }) => {
        await openRelease(page, CDS, { body: record(threeMedium) });
        const m = await mediumArt(page);
        expect(m.map((x) => x.thumbs)).toEqual([[7], [8], [11]]);
        expect(m.map((x) => x.note)).toEqual([null, null, null]);
    });

    test('comments beat archive order', async ({ page }) => {
        await openRelease(page, CDS, {
            body: record((r) => {
                threeMedium(r);
                r.images[7].comment = 'CD 3';
                r.images[8].comment = 'disc 2 label';
                r.images[11].comment = 'cd1';
            }),
        });
        expect((await mediumArt(page)).map((x) => x.thumbs)).toEqual([[11], [8], [7]]);
    });

    test('one readable comment among uncommented images places only that one', async ({ page }) => {
        await openRelease(page, CDS, {
            body: record((r) => {
                threeMedium(r);
                r.images[7].comment = 'CD 3';
            }),
        });
        const m = await mediumArt(page);
        expect(m.map((x) => x.thumbs)).toEqual([[], [], [7]]);
        expect(m[0].note).toBe('2 of 3 Medium images not assigned');
    });

    test('a comment naming a medium that does not exist, or two media, is not assigned', async ({ page }) => {
        await openRelease(page, CDS, {
            body: record((r) => {
                r.images[7].comment = 'CD 7';
                r.images[8].comment = 'CD 1';
                r.images[11].comment = 'CD 2';
                r.images[12].comment = 'CD 2 + CD 3';
            }),
        });
        const m = await mediumArt(page);
        expect(m.map((x) => x.thumbs)).toEqual([[8], [11], []]);
        expect(m[0].note).toBe('2 of 4 Medium images not assigned');
    });

    test('sides: "side C" is medium 2 on vinyl, and nothing on CDs', async ({ page }) => {
        const sides = (r) => {
            r.images[7].comment = 'side A';
            r.images[8].comment = 'Side B';
            r.images[11].comment = 'side C';
            r.images[12].comment = 'side F';
        };
        await openRelease(page, VINYL, { body: record(sides) });
        let m = await mediumArt(page);
        expect(m.map((x) => x.name), 'premise: three vinyl media').toEqual(['1 - 12" Vinyl', '2 - 12" Vinyl', '3 - 12" Vinyl']);
        expect(m.map((x) => x.thumbs)).toEqual([[7, 8], [11], [12]]);
        expect(m[0].note).toBeNull();

        const page2 = await page.context().newPage();
        await openRelease(page2, CDS, { body: record(sides) });
        m = await mediumArt(page2);
        expect(m.map((x) => x.thumbs)).toEqual([[], [], []]);
        expect(m[0].note).toBe('4 Medium images, 3 media, no comment names a single medium: not assigned');
        await page2.close();
    });

    test('one medium takes every Medium image, four thumbs then "+N"', async ({ page }) => {
        await openRelease(page, ONE_CD, { body: record((r) => { r.images[15].types = ['Medium']; }) });
        const m = await mediumArt(page);
        expect(m).toHaveLength(1);
        expect(m[0].thumbs).toEqual([7, 8, 11, 12]);
        expect(m[0].more).toBe('+1');
        expect(m[0].note).toBeNull();
    });

    test('a thumb opens the viewer at that image without collapsing the medium; the note opens the Medium images', async ({ page }) => {
        await openRelease(page, CDS, { body: record(threeMedium) });
        const h3 = page.locator('h3.mb-toggle-h3', { has: page.locator('.mb-medium-art-btn[data-mb-art-i="8"]') });
        const tableShown = () => h3.evaluate((h) => {
            let n = h.nextElementSibling;
            while (n && n.tagName !== 'TABLE') n = n.nextElementSibling;
            return !!n && n.style.display !== 'none';
        });
        const before = await tableShown();
        await page.click('.mb-medium-art-btn[data-mb-art-i="8"]');
        const pos = page.locator('#mb-art-viewer .mb-artv-pos');
        await expect(pos).toHaveText('1 / 1');
        await expect(page.locator('#mb-art-viewer .mb-artv-film [data-artv-go]')).toHaveCount(1);
        await page.keyboard.press('Escape');
        expect(await tableShown(), 'the medium did not collapse or expand').toBe(before);
        await expect(page.locator('.mb-medium-art-btn[data-mb-art-i="8"]')).toBeFocused();
    });

    test('the note opens the viewer on the Medium images only', async ({ page }) => {
        await openRelease(page, CDS);
        await page.click('.mb-medium-art-note');
        await expect(page.locator('#mb-art-viewer .mb-artv-pos')).toHaveText('1 / 4');
        const order = await page.evaluate(() => Array.from(document.querySelectorAll('#mb-art-viewer .mb-artv-film [data-artv-go]'))
            .map((n) => Number(n.dataset.artvGo)));
        expect(order).toEqual([7, 8, 11, 12]);
    });

    test('the thumbs survive a filter re-render; the setting turns them off', async ({ page }) => {
        await openRelease(page, CDS, { body: record(threeMedium) });
        await page.fill('#mb-global-filter-wrapper input', 'a');
        await expect.poll(async () => (await mediumArt(page)).map((x) => x.thumbs)).toEqual([[7], [8], [11]]);
        await page.fill('#mb-global-filter-wrapper input', '');
        await expect.poll(async () => (await mediumArt(page)).map((x) => x.thumbs)).toEqual([[7], [8], [11]]);

        // A rebuilt h3 (a full render writes its innerHTML) is repaired by
        // the next filter pass, which the thumbs ride.
        await page.evaluate(() => document.querySelectorAll('.mb-medium-art').forEach((n) => n.remove()));
        await page.fill('#mb-global-filter-wrapper input', 'e');
        await expect.poll(async () => (await mediumArt(page)).map((x) => x.thumbs)).toEqual([[7], [8], [11]]);

        const page2 = await page.context().newPage();
        await openRelease(page2, CDS, { body: record(threeMedium), settings: { sa_enable_release_tracks_medium_art: false } });
        expect(await page2.locator('.mb-medium-art').count()).toBe(0);
        await page2.close();
    });
});
