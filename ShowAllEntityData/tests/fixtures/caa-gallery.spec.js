'use strict';

// The table-wide artwork gallery (org/redesign-CAA-EAA-column.org P5, D2):
// every image of the releases a sub-table shows, grouped by release, in a
// movable window — type chips, "Compare two", a click opens the viewer.
//
// ── What each test pins, and the adjacent property it avoids ────────────────
//
//  - SCOPE IS THE ROWS SHOWN, IN ROW ORDER: asserted on the order of the
//    release blocks and on a filter narrowing them — "the gallery lists the
//    releases" alone passes on a source-row walk that ignores filters.
//  - ZERO REQUESTS, AND STILL LIVE: opening asks the archive for nothing (the
//    request count), yet a release whose answer arrives while the window is
//    open fills in without reopening — a gallery that fetched on open, or one
//    that never refreshed, each fails one half.
//  - THE CHIP PLACEHOLDER NAMES THE GAP: "No Medium image" on the release
//    without one, not merely "fewer tiles".
//  - THE VIEWER STEPS THE GALLERY: Shift+→ goes to the next release the chips
//    leave non-empty, not the next table row; a click inside the viewer, and
//    the Escape that closes it, leave the gallery open.
//
// Network-free: tests/support/caaColumnFixture.js (the release-group shell,
// one routed record per release).

const { test, expect } = require('../support/test');
const { collectPageErrors } = require('../support/liveAssertions');
const { R, open, caaFilter, viewer } = require('../support/caaColumnFixture');

const GALLERY = '#mb-art-gallery';

/** The gallery's release blocks: path, state, tile count, dimmed, placeholder text. */
const blocks = (page) => page.evaluate(() => Array.from(document.querySelectorAll('#mb-art-gallery .mb-art-gal-rel'))
    .map((b) => ({
        path: b.dataset.mbArtPath,
        state: b.dataset.mbArtState,
        tiles: b.querySelectorAll('figure.mb-art-gal-tile').length,
        dimmed: b.classList.contains('mb-art-gal-dimmed'),
        missing: (b.querySelector('.mb-art-gal-missing') || {}).textContent || '',
    })));

/** Opens the first sub-table's gallery from its 🖼 button. */
const openGallery = async (page) => {
    await page.locator('#mb-caa-toggle-btn-gallery-0').click();
    await expect(page.locator(GALLERY)).toBeVisible();
};

test.describe('CAA/EAA artwork gallery (D2)', () => {
    let pageErrors;

    test.beforeEach(({ page }) => {
        pageErrors = collectPageErrors(page);
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('opens on the rows shown, in row order, with each release\'s state — and asks the archive for nothing', async ({ page }) => {
        test.setTimeout(120000);
        const { hits } = await open(page);
        const before = [...hits.values()].reduce((a, b) => a + b, 0);
        await openGallery(page);
        const b = await blocks(page);
        expect(b.map((x) => x.path)).toEqual([R.sixteen, R.noFront, R.noMedium, R.noArt, R.outside, R.plain]
            .map((m) => `/release/${m}`));
        expect(b.find((x) => x.path.endsWith(R.sixteen)).tiles).toBe(16);
        expect(b.find((x) => x.path.endsWith(R.noArt))).toMatchObject({ state: 'none', tiles: 0, missing: 'no artwork' });
        await expect(page.locator(`${GALLERY} .mb-art-gal-sum`)).toContainText('6 releases · 24 images');
        await expect(page.locator(`${GALLERY} .mb-art-gal-main`), 'one ★ per release with a main front').toHaveCount(4);
        expect([...hits.values()].reduce((a, c) => a + c, 0), 'opening asks the archive for nothing').toBe(before);
    });

    test('a release still loading shows "loading…" and fills in while the window is open', async ({ page }) => {
        test.setTimeout(120000);
        const { release } = await open(page, {}, { hold: [R.outside] });
        await openGallery(page);
        expect((await blocks(page)).find((x) => x.path.endsWith(R.outside)))
            .toMatchObject({ state: 'pending', missing: 'loading…' });
        await expect(page.locator(`${GALLERY} .mb-art-gal-sum`)).toContainText('1 loading');
        release();
        await expect.poll(async () => (await blocks(page)).find((x) => x.path.endsWith(R.outside)), {
            timeout: 15000, message: 'filled in without reopening',
        }).toMatchObject({ state: 'ok', tiles: 3 });
        await expect(page.locator(`${GALLERY} .mb-art-gal-sum`)).not.toContainText('loading');
    });

    test('the Medium chip shows only Medium images and names the releases without one', async ({ page }) => {
        test.setTimeout(120000);
        await open(page);
        await openGallery(page);
        const medium = page.locator(`${GALLERY} .mb-art-gal-chip[data-mb-art-gal-type="Medium"]`);
        await expect(medium.locator('.mb-art-gal-n'), 'Medium images: 4 + 1 + 1 + 1').toHaveText('7');
        await medium.click();
        await expect(medium).toHaveAttribute('aria-pressed', 'true');
        const b = await blocks(page);
        expect(b.find((x) => x.path.endsWith(R.sixteen)).tiles).toBe(4);
        expect(b.find((x) => x.path.endsWith(R.noMedium))).toMatchObject({ dimmed: true, missing: 'No Medium image', tiles: 0 });
        await page.locator(`${GALLERY} .mb-art-gal-chip[data-mb-art-gal-type=""]`).click();
        expect((await blocks(page)).find((x) => x.path.endsWith(R.sixteen)).tiles, '"All" clears the chips').toBe(16);
    });

    test('a table filter narrows the gallery, it says so, and the match is marked in the captions', async ({ page }) => {
        test.setTimeout(120000);
        await open(page);
        await caaFilter(page, 0, 'Medi');
        await openGallery(page);
        expect((await blocks(page)).map((x) => x.path)).toEqual([R.sixteen, R.noFront, R.outside, R.plain]
            .map((m) => `/release/${m}`));
        await expect(page.locator(`${GALLERY} .mb-art-gal-warn`)).toContainText('only the rows the filters show');
        await expect(page.locator(`${GALLERY} figcaption .mb-column-filter-highlight`).first()).toHaveText('Medi');
    });

    test('a click opens the viewer; Shift+→ steps the gallery\'s releases; the viewer never closes the gallery', async ({ page }) => {
        test.setTimeout(120000);
        await open(page);
        await openGallery(page);
        await page.locator(`${GALLERY} .mb-art-gal-chip[data-mb-art-gal-type="Medium"]`).click();
        await page.locator(`${GALLERY} .mb-art-gal-rel[data-mb-art-path="/release/${R.sixteen}"] figure.mb-art-gal-tile`).first().click();
        await expect.poll(() => viewer(page)).toMatchObject({ pos: '1 / 4', rowPos: 'row 1 of 4' });
        await page.keyboard.press('Shift+ArrowRight');
        const next = await viewer(page);
        expect(next.rowPos, 'the gallery\'s releases with a Medium image: 12" vinyl is skipped').toBe('row 2 of 4');
        expect(next.src).toContain(R.noFront);
        await page.locator('#mb-art-viewer [data-artv="info"]').click();
        await expect(page.locator(GALLERY), 'a click inside the viewer is not "outside"').toBeVisible();
        await page.keyboard.press('Escape');
        expect(await viewer(page)).toBeNull();
        await expect(page.locator(GALLERY), 'the Escape that closed the viewer left the gallery').toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.locator(GALLERY)).toHaveCount(0);
    });

    test('"Compare two" lines two releases up type by type, "none" where one has no such image', async ({ page }) => {
        test.setTimeout(120000);
        await open(page);
        await openGallery(page);
        await page.locator(`${GALLERY} [data-mb-art-gal-compare]`).click();
        await page.locator(`${GALLERY} select[data-mb-art-gal-side="a"]`).selectOption(`/release/${R.sixteen}`);
        await page.locator(`${GALLERY} select[data-mb-art-gal-side="b"]`).selectOption(`/release/${R.noMedium}`);
        const rows = await page.evaluate(() => {
            const cells = Array.from(document.querySelectorAll('#mb-art-gallery .mb-art-gal-cmp > *')).slice(3);
            const out = {};
            for (let i = 0; i + 2 < cells.length; i += 3) {
                out[cells[i].textContent] = [cells[i + 1], cells[i + 2]]
                    .map((c) => c.querySelectorAll('figure').length || c.textContent);
            }
            return out;
        });
        expect(Object.keys(rows), 'vocabulary order first, then first appearance')
            .toEqual(['Front', 'Back', 'Medium', 'Other', 'Liner', 'Poster', 'Sticker']);
        expect(rows.Medium).toEqual([4, 'none']);
        expect(rows.Front).toEqual([1, 1]);
    });

    test('the 📊 summary opens it too; with the setting off there is neither', async ({ page }) => {
        test.setTimeout(120000);
        await open(page);
        await page.locator('#mb-caa-toggle-btn-summary-0').click();
        await page.locator('#mb-art-summary-panel [data-mb-art-gallery-open]').click();
        await expect(page.locator(GALLERY)).toBeVisible();
        await expect(page.locator('#mb-art-summary-panel')).toBeHidden();
    });

    test('with sa_caa_gallery off there is no 🖼 and no "Open gallery"', async ({ page }) => {
        test.setTimeout(120000);
        await open(page, { sa_caa_gallery: false });
        await expect(page.locator('#mb-caa-toggle-btn-summary-0')).toHaveCount(1);
        await expect(page.locator('[id^="mb-caa-toggle-btn-gallery-"]')).toHaveCount(0);
        await page.locator('#mb-caa-toggle-btn-summary-0').click();
        await expect(page.locator('#mb-art-summary-panel [data-mb-art-gallery-open]')).toHaveCount(0);
    });
});

// ── EAA: the same gallery, driven by EAA_CTX ────────────────────────────────

const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { ONE_PX_PNG } = require('../support/caaColumnFixture');

test.describe('CAA/EAA artwork gallery (D2) — EAA', () => {
    test('an EAA table gets its own 🖼, listing the event\'s images with the event-art types', async ({ page }) => {
        test.setTimeout(120000);
        const pageErrors = collectPageErrors(page);
        const GUID = '22222222-2222-2222-2222-222222222222';
        await loadUserscriptPage(page, {
            url: 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/events',
            fixtureFile: path.join(__dirname, 'artist-events-eaa.html'),
            testMode: true,
            settingsOverride: { sa_enable_caa_pics: true, sa_art_idb_enable: false },
        });
        const u = (n) => `https://eventartarchive.org/event/${GUID}/${n}`;
        await page.route('https://eventartarchive.org/**', async (route) => {
            if (new RegExp(`/event/${GUID}$`).test(route.request().url())) {
                return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ images: [
                    { id: '1', image: u('1.jpg'), thumbnails: { 250: u('1-250.jpg') }, types: ['Poster'], front: true },
                    { id: '2', image: u('2.jpg'), thumbnails: { 250: u('2-250.jpg') }, types: ['Ticket'], front: false },
                ] }) });
            }
            return route.fulfill({ status: 200, contentType: 'image/png', body: ONE_PX_PNG });
        });
        await page.click('button[data-label="Show all Events for Artist"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await expect(page.locator('table.tbl tbody ul.mb-caa-art-ul')).toHaveCount(1, { timeout: 30000 });
        await page.locator('#mb-eaa-toggle-btn-gallery-0').click();
        await expect(page.locator(GALLERY)).toBeVisible();
        await expect(page.locator(`${GALLERY} figure.mb-art-gal-tile`)).toHaveCount(2);
        await expect(page.locator(`${GALLERY} .mb-art-gal-chip[data-mb-art-gal-type="Poster"]`)).toHaveCount(1);
        await expect(page.locator(`${GALLERY} .mb-art-gal-chip[data-mb-art-gal-type="Ticket"]`)).toHaveCount(1);
        expect(pageErrors).toEqual([]);
    });
});
