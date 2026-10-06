'use strict';

// release-tracks: the "Cover art (N)" section above the tracklist
// (org/CAA-release-tracks-handling.org, mockup R1, phase P1).
//
// What each test pins, and the neighbouring property it keeps apart:
//
//  1. IT EXISTS ONLY AFTER "Show all". Asserted with zero archive requests
//     before the click, not merely "no section yet" — a section built at page
//     load and hidden would pass a DOM check and still cost a request on every
//     release page.
//  2. IT IS A COLLAPSIBLE h2, PLACED ABOVE "Tracklist", AND STARTS OPEN. Every
//     other page-level h2 except the tracklist's starts collapsed, so a section
//     that merely exists would be invisible; the test asserts its content is
//     displayed AND that a click collapses it (it went through
//     makeH2sCollapsible(), it is not a look-alike).
//  3. THE ★ READS `front`, NOT THE Front TYPE. The record is edited so a second
//     image is ALSO typed Front without being the main front; code that
//     conflated the two would star both.
//  4. ONE REQUEST PER RENDER, THEN NONE. Archive order is kept, and the count
//     in the h2 follows the RECORD (16) rather than the tab text (13 on this
//     fixture) once it has arrived.
//  5. "Cover art (0)" MAKES NO REQUEST AND NO SECTION.
//  6. 404 READS AS "no images", 503 AS A FAILURE WITH A WORKING RETRY. The two
//     are different facts (docs/claude/artwork-caa-eaa.md, CAA/EAA retry); a
//     retry that forgot to drop the session zero would make no request.
//  7. IT IS NOT PART OF THE TRACKLIST MACHINERY. A global filter for a word
//     that occurs only in a tile caption hides every track row and leaves the
//     section whole.
//  8. THE SETTING TURNS IT OFF COMPLETELY (no section, no request).
//
// Network-free: coverartarchive.org is routed (META_RE for the record, 404 for
// every image), `route.fulfill({status})`, never `abort()`. The record is the
// real one of release d0adda7e-86de-4aef-af95-ee7da122d175 (16 images),
// captured 2026-10-06 — served for the fixture's own release MBID.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { waitForFilterSettled } = require('../support/filterSortAssertions');

const MEDLEY = {
    url: 'https://musicbrainz.org/release/a9a3b139-cf22-4d28-801e-3f3d49521d0e',
    file: path.join(__dirname, 'release-tracks-medley.html'),
};
const ZERO_ART = {
    url: 'https://musicbrainz.org/release/5cf63c93-e27e-4d98-81bc-9aba8b6861a7',
    file: path.join(__dirname, 'release-tracks-eti-keywords.html'),
};
const RECORD = JSON.parse(fs.readFileSync(path.join(__dirname, 'caa-release-d0adda7e.json'), 'utf8'));
const META_RE = /^https:\/\/coverartarchive\.org\/release\/([0-9a-f-]{36})$/;
const BUTTON = 'button[data-label="Show all Tracks for Release"]';
const CORS = { 'access-control-allow-origin': '*' };

/**
 * The real record with one change: image 2 (the Back) is ALSO typed Front but
 * stays `front: false`, so "has the Front type" and "is the main front"
 * disagree by construction.
 *
 * @returns {Object}
 */
function recordWithSecondFront() {
    const rec = JSON.parse(JSON.stringify(RECORD));
    rec.images[1].types = ['Back', 'Front'];
    return rec;
}

/**
 * Loads a release-tracks fixture with the archive routed. `respond()` decides
 * each record request: a status, or 200 with `body`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} opts
 * @param {{url: string, file: string}} [opts.fixture]
 * @param {Object} [opts.settings]
 * @param {function(number): {status?: number, body?: Object}} [opts.respond] gets the 1-based hit number
 * @returns {Promise<{hits: function(): number}>}
 */
async function openRelease(page, { fixture = MEDLEY, settings = {}, respond } = {}) {
    let hits = 0;
    await loadUserscriptPage(page, {
        url: fixture.url, fixtureFile: fixture.file, testMode: true,
        settingsOverride: {
            sa_enable_release_tracks: true,
            sa_enable_release_tracks_cover_art: true,
            sa_art_idb_enable: false,
            ...settings,
        },
    });
    await page.route('https://coverartarchive.org/**',
        (route) => route.fulfill({ status: 404, headers: CORS, body: '' }));
    await page.route(META_RE, (route) => {
        hits += 1;
        const r = (respond ? respond(hits) : null) || {};
        if (r.status && r.status !== 200) {
            return route.fulfill({ status: r.status, headers: CORS, contentType: 'text/plain', body: '' });
        }
        return route.fulfill({
            status: 200, headers: CORS, contentType: 'application/json',
            body: JSON.stringify(r.body || recordWithSecondFront()),
        });
    });
    return { hits: () => hits };
}

/**
 * Clicks "Show all Tracks for Release" and waits for the render.
 *
 * @param {import('@playwright/test').Page} page
 */
async function showAll(page) {
    await page.click(BUTTON);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/**
 * Waits until the section has settled into `state` ('ok' | 'none' | 'failed').
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} state
 */
async function sectionSettled(page, state) {
    await page.locator(`.mb-release-art-sec[data-mb-art-state="${state}"]`).waitFor({ state: 'attached', timeout: 15000 });
}

/**
 * The section as the user sees it.
 *
 * @param {import('@playwright/test').Page} page
 */
const sectionFacts = (page) => page.evaluate(() => {
    const h2 = document.querySelector('h2.mb-release-art-h2');
    const sec = document.querySelector('.mb-release-art-sec');
    const tracklist = document.querySelector('h2.tracklist');
    if (!h2 || !sec) return null;
    const tiles = Array.from(sec.querySelectorAll('figure.mb-release-art-tile'));
    return {
        h2Text: h2.textContent.replace(/^[▲▼]/, '').trim(),
        icon: (h2.querySelector('.mb-toggle-icon') || {}).textContent || null,
        collapsible: h2.classList.contains('mb-toggle-h2'),
        secShown: sec.style.display !== 'none' && sec.offsetParent !== null,
        h2BeforeSec: h2.nextElementSibling === sec,
        secBeforeTracklist: sec.nextElementSibling === tracklist,
        state: sec.dataset.mbArtState,
        status: (sec.querySelector('.mb-release-art-status') || {}).textContent || null,
        tiles: tiles.map((t) => ({
            i: Number(t.dataset.mbArtI),
            types: t.querySelector('.mb-release-art-types').textContent,
            comment: (t.querySelector('.mb-release-art-comment') || {}).textContent || '',
            star: !!t.querySelector('.mb-release-art-star'),
            src: t.querySelector('img').getAttribute('src'),
        })),
    };
});

test.describe('release-tracks: Cover art section', () => {
    test('appears only after "Show all", above Tracklist, open, one tile per image in archive order', async ({ page }) => {
        const { hits } = await openRelease(page);
        expect(await page.locator('.mb-release-art-sec').count()).toBe(0);
        expect(hits(), 'no archive request before "Show all"').toBe(0);

        await showAll(page);
        await sectionSettled(page, 'ok');
        const f = await sectionFacts(page);

        expect(f.collapsible, 'went through makeH2sCollapsible()').toBe(true);
        expect(f.icon).toBe('▼');
        expect(f.secShown, 'starts uncollapsed').toBe(true);
        expect(f.h2BeforeSec).toBe(true);
        expect(f.secBeforeTracklist, 'sits directly above h2.tracklist').toBe(true);
        expect(f.h2Text, 'count follows the record, not the tab text (13)').toBe('Cover art (16)');

        expect(f.tiles.map((t) => t.i)).toEqual([...Array(16).keys()]);
        expect(f.tiles.map((t) => t.types)).toEqual(
            ['Front', 'Back / Front', 'Other', 'Other', 'Other', 'Liner', 'Liner', 'Medium', 'Medium',
             'Liner', 'Liner', 'Medium', 'Medium', 'Poster', 'Poster', 'Sticker']);
        expect(f.tiles[3].comment).toBe('opened gatefold cover, inside left');
        expect(f.tiles[0].src, 'leading http: stripped, 250 px thumbnail')
            .toBe('//coverartarchive.org/release/d0adda7e-86de-4aef-af95-ee7da122d175/34698678836-250.jpg');

        expect(hits()).toBe(1);
    });

    test('an older record with only small/large thumbnails still gets tiles and the big link', async ({ page }) => {
        // Probed 2026-10-06: release a9a3b139-… (this very fixture) answers with
        // thumbnails {small, large} only — no 250/500/1200 keys.
        const rec = JSON.parse(JSON.stringify(RECORD));
        rec.images.forEach((im) => {
            im.thumbnails = { small: im.thumbnails.small, large: im.thumbnails.large };
        });
        await openRelease(page, { respond: () => ({ body: rec }) });
        await showAll(page);
        await sectionSettled(page, 'ok');
        const tile0 = await page.evaluate(() => {
            const t = document.querySelector('figure.mb-release-art-tile[data-mb-art-i="0"]');
            return { src: t.querySelector('img').getAttribute('src'), href: t.querySelector('a').getAttribute('href') };
        });
        expect(tile0.src).toBe('//coverartarchive.org/release/d0adda7e-86de-4aef-af95-ee7da122d175/34698678836-250.jpg');
        expect(tile0.href).toBe('//coverartarchive.org/release/d0adda7e-86de-4aef-af95-ee7da122d175/34698678836-500.jpg');
    });

    test('a thumbnail that fails to load keeps its square tile', async ({ page }) => {
        // Every thumbnail is a 404 here, as on 2026-10-06 while archive.org
        // was down: a broken <img> renders its alt text and ignores
        // aspect-ratio, so the link box itself must hold the square and clip.
        await openRelease(page);
        await showAll(page);
        await sectionSettled(page, 'ok');
        const boxes = await page.evaluate(() => Array.from(
            document.querySelectorAll('figure.mb-release-art-tile > a')).map((a) => ({
            w: a.getBoundingClientRect().width,
            h: a.getBoundingClientRect().height,
            clips: getComputedStyle(a).overflow === 'hidden',
            broken: !a.querySelector('img').naturalWidth,
        })));
        expect(boxes.length).toBe(16);
        expect(boxes.every((b) => b.broken), 'premise: the thumbnails really failed').toBe(true);
        for (const b of boxes) {
            expect(Math.abs(b.w - b.h), `tile is square (${b.w}×${b.h})`).toBeLessThanOrEqual(1);
            expect(b.clips).toBe(true);
        }
    });

    test('★ marks only the archive\'s main front, not every Front-typed image', async ({ page }) => {
        await openRelease(page);
        await showAll(page);
        await sectionSettled(page, 'ok');
        const f = await sectionFacts(page);
        expect(f.tiles[1].types).toContain('Front');
        expect(f.tiles.filter((t) => t.star).map((t) => t.i)).toEqual([0]);
    });

    test('clicking the h2 collapses and re-opens the section', async ({ page }) => {
        await openRelease(page);
        await showAll(page);
        await sectionSettled(page, 'ok');
        await page.click('h2.mb-release-art-h2');
        expect((await sectionFacts(page)).secShown).toBe(false);
        await page.click('h2.mb-release-art-h2');
        expect((await sectionFacts(page)).secShown).toBe(true);
    });

    test('a release whose tab says "Cover art (0)" gets no section and makes no request', async ({ page }) => {
        const { hits } = await openRelease(page, { fixture: ZERO_ART });
        await showAll(page);
        expect(await page.locator('.mb-release-art-h2, .mb-release-art-sec').count()).toBe(0);
        expect(hits()).toBe(0);
    });

    test('404 reads as "no images", not as a failure', async ({ page }) => {
        await openRelease(page, { respond: () => ({ status: 404 }) });
        await showAll(page);
        await sectionSettled(page, 'none');
        const f = await sectionFacts(page);
        expect(f.h2Text).toBe('Cover art (0)');
        expect(f.status).toMatch(/no images/);
        expect(await page.locator('.mb-release-art-retry').count()).toBe(0);
    });

    test('503 shows a retry that makes a fresh request and then renders the sheet', async ({ page }) => {
        const { hits } = await openRelease(page, { respond: (n) => (n === 1 ? { status: 503 } : null) });
        await showAll(page);
        await sectionSettled(page, 'failed');
        expect((await sectionFacts(page)).status).toMatch(/could not be reached/);
        expect(hits()).toBe(1);

        await page.click('.mb-release-art-retry');
        await sectionSettled(page, 'ok');
        expect(hits(), 'the retry dropped the session zero and asked again').toBe(2);
        expect((await sectionFacts(page)).tiles.length).toBe(16);
    });

    test('a global filter hides track rows but never the section', async ({ page }) => {
        await openRelease(page);
        await showAll(page);
        await sectionSettled(page, 'ok');
        const visibleRows = () => page.evaluate(() => Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((tr) => tr.style.display !== 'none' && tr.offsetParent !== null).length);
        expect(await visibleRows()).toBeGreaterThan(0);

        // "gatefold" occurs only in tile captions, never in a track row.
        await waitForFilterSettled(page, () => page.fill('#mb-global-filter-input', 'gatefold'));
        expect(await visibleRows()).toBe(0);
        const f = await sectionFacts(page);
        expect(f.secShown).toBe(true);
        expect(f.tiles.length).toBe(16);
        expect(f.secBeforeTracklist).toBe(true);
    });

    test('the setting off means no section and no request', async ({ page }) => {
        const { hits } = await openRelease(page, { settings: { sa_enable_release_tracks_cover_art: false } });
        await showAll(page);
        expect(await page.locator('.mb-release-art-h2, .mb-release-art-sec').count()).toBe(0);
        expect(hits()).toBe(0);
    });
});

// P2 (org/CAA-release-tracks-handling.org): type chips, Grid / By type, the
// remembered layout, and the liner-card hover.
//
//  9. A CHIP FILTERS BY TYPE MEMBERSHIP, NOT BY FIRST TYPE. The record's
//     image 2 is Back + Front, so "Front" must show 2 tiles and count 2 — a
//     chip that compared only `types[0]` would show 1 while saying 2.
// 10. "By type" GROUPS BY FIRST TYPE in first-appearance order, and the
//     choice is WRITTEN to GM storage; a fresh page load seeded with it opens
//     grouped. Asserting only the click would pass on code that never stored
//     anything.
// 11. THE HOVER CARD IS THE TILE'S OWN, built from the record: position,
//     position within its type, comment, edit id. Shown by the shared
//     tooltip engine, so it is read from #mb-stat-tooltip.

/**
 * The tile indices currently in the sheet, in DOM order, and the group
 * headers if grouped.
 *
 * @param {import('@playwright/test').Page} page
 */
const sheet = (page) => page.evaluate(() => {
    const sec = document.querySelector('.mb-release-art-sec');
    return {
        tiles: Array.from(sec.querySelectorAll('figure.mb-release-art-tile')).map((t) => Number(t.dataset.mbArtI)),
        groups: Array.from(sec.querySelectorAll('.mb-release-art-group-hdr')).map((h) => h.textContent),
        chips: Array.from(sec.querySelectorAll('.mb-release-art-chip')).map((c) => ({
            text: c.textContent.replace(/\s+/g, ' ').trim(),
            pressed: c.getAttribute('aria-pressed'),
        })),
        layout: (sec.querySelector('[data-mb-art-layout][aria-pressed="true"]') || {}).dataset?.mbArtLayout || null,
    };
});

test.describe('release-tracks: Cover art section — chips, layout, hover (P2)', () => {
    test('type chips count every type an image carries and filter by membership', async ({ page }) => {
        await openRelease(page);
        await showAll(page);
        await sectionSettled(page, 'ok');

        let s = await sheet(page);
        expect(s.chips.map((c) => c.text)).toEqual(
            ['All 16', 'Front 2', 'Back 1', 'Other 3', 'Liner 4', 'Medium 4', 'Poster 2', 'Sticker 1']);
        expect(s.chips[0].pressed).toBe('true');

        await page.click('.mb-release-art-chip[data-mb-art-filter="Front"]');
        s = await sheet(page);
        expect(s.tiles, 'image 2 is Back + Front').toEqual([0, 1]);
        expect(s.chips.find((c) => c.text === 'Front 2').pressed).toBe('true');

        await page.click('.mb-release-art-chip[data-mb-art-filter="Medium"]');
        expect((await sheet(page)).tiles).toEqual([7, 8, 11, 12]);

        await page.click('.mb-release-art-chip[data-mb-art-filter=""]');
        expect((await sheet(page)).tiles).toEqual([...Array(16).keys()]);
    });

    test('"By type" groups by first type in archive order and is remembered', async ({ page }) => {
        await openRelease(page);
        await showAll(page);
        await sectionSettled(page, 'ok');
        expect((await sheet(page)).layout).toBe('grid');

        await page.click('.mb-release-art-seg [data-mb-art-layout="grouped"]');
        const s = await sheet(page);
        expect(s.layout).toBe('grouped');
        expect(s.groups).toEqual(
            ['Front × 1', 'Back × 1', 'Other × 3', 'Liner × 4', 'Medium × 4', 'Poster × 2', 'Sticker × 1']);
        expect(s.tiles).toEqual([0, 1, 2, 3, 4, 5, 6, 9, 10, 7, 8, 11, 12, 13, 14, 15]);
        expect(await page.evaluate(() => window.GM_getValue('mb_sa_release_art_layout', null))).toBe('grouped');

        // A chip still applies inside the grouped layout.
        await page.click('.mb-release-art-chip[data-mb-art-filter="Medium"]');
        expect((await sheet(page)).groups).toEqual(['Medium × 4']);

        await page.click('.mb-release-art-seg [data-mb-art-layout="grid"]');
        expect(await page.evaluate(() => window.GM_getValue('mb_sa_release_art_layout', null))).toBe('grid');
    });

    test('a stored "grouped" layout is what a fresh load opens with', async ({ page }) => {
        await openRelease(page, { settings: { mb_sa_release_art_layout: 'grouped' } });
        await showAll(page);
        await sectionSettled(page, 'ok');
        const s = await sheet(page);
        expect(s.layout).toBe('grouped');
        expect(s.groups[0]).toBe('Front × 1');
    });

    test('hovering a tile shows its own liner card from the record', async ({ page }) => {
        await openRelease(page);
        await showAll(page);
        await sectionSettled(page, 'ok');
        const tip = page.locator('#mb-stat-tooltip');

        await page.mouse.move(0, 0);
        await page.hover('figure.mb-release-art-tile[data-mb-art-i="5"] figcaption');
        await expect(tip).toBeVisible();
        const liner = await tip.textContent();
        expect(liner).toContain('Liner');
        expect(liner).toContain('6 of 16 · Liner 1 of 4');
        expect(liner).toContain('edit #96361205');

        await page.mouse.move(0, 0);
        await page.hover('figure.mb-release-art-tile[data-mb-art-i="3"] figcaption');
        await expect(tip).toContainText('“opened gatefold cover, inside left”');
        await expect(tip).toContainText('4 of 16 · Other 2 of 3');
    });
});
