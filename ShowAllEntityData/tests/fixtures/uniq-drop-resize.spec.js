'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// The 📊 unique-values dropdown (UVD) has a lower-right corner grip
// (`_wireUvdResizeGrip()`). Guarantees pinned here, each by its own test:
//   1. the panel is still OPEN after a drag released OUTSIDE it, and the
//      release's stray click never reaches the page;
//   2. the size is remembered per pageType + column — and only for that
//      column: the panel element is shared, so another column must open at
//      its default size;
//   3. a stored size is applied on open (the read path a reload/import uses);
//   4. a double-click on the grip forgets the size.
// (The export/import half lives in config-workspace-roundtrip.spec.js.)
//
// Reuses the artist-events fixture of uniq-drop-date-expression.spec.js.
const ARTIST_EVENTS_URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/events';
const FIXTURE_FILE = path.join(__dirname, 'uniq-drop-date-expression.html');
const PAGE_TYPE = 'artist-events';
const GEO_KEY = 'sa_uniq_dropdown_geometry';

/**
 * Loads the fixture (optionally with seeded GM values) and renders the table.
 * @param {import('@playwright/test').Page} page
 * @param {Object} [settingsOverride]
 */
async function load(page, settingsOverride) {
    await page.setViewportSize({ width: 1400, height: 1000 });
    await loadUserscriptPage(page, {
        url: ARTIST_EVENTS_URL, fixtureFile: FIXTURE_FILE, testMode: true, settingsOverride,
    });
    await page.click('button[data-label="Show all Events for Artist"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/** Opens the UVD of the named column. */
async function openFor(page, colName) {
    await page.locator(`table.tbl thead th[data-col-name="${colName}"] .mb-col-uniq-btn`).first().click();
    await expect(page.locator('#mb-col-uniq-dropdown')).toBeVisible();
}

/** Closes the UVD through the test hook around closeUniqDrop(). */
async function close(page) {
    await page.evaluate(() => window.__saTest.closeUniqDrop());
    await expect(page.locator('#mb-col-uniq-dropdown')).toBeHidden();
}

/** @returns {Promise<{width: number, height: number}>} the panel's rendered size. */
const dropSize = (page) => page.locator('#mb-col-uniq-dropdown').evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { width: Math.round(r.width), height: Math.round(r.height) };
});

/** Drags the grip by (dx, dy), releasing wherever that lands. */
async function dragGrip(page, dx, dy) {
    const grip = page.locator('#mb-col-uniq-dropdown .mb-uniq-resize-grip');
    await expect(grip).toBeVisible();
    const b = await grip.boundingBox();
    const x = b.x + b.width / 2;
    const y = b.y + b.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 });
    await page.mouse.move(x + dx, y + dy, { steps: 4 });
    await page.mouse.up();
}

/** @returns {Promise<string[]>} the names of the columns that have a 📊 button. */
const uvdColumns = (page) => page.evaluate(() => Array.from(
    document.querySelectorAll('table.tbl thead th[data-col-name]'))
    .filter((th) => th.querySelector('.mb-col-uniq-btn'))
    .map((th) => th.dataset.colName));

test.describe('unique-values dropdown: corner resize grip', () => {
    test('a drag released outside the panel resizes it, keeps it open, and the stray click is swallowed',
        async ({ page }) => {
            await load(page);
            await openFor(page, 'Date');
            const before = await dropSize(page);

            // Count every click that reaches the page during the drag.
            await page.evaluate(() => {
                window.__uvdClicks = 0;
                document.addEventListener('click', () => { window.__uvdClicks++; });
            });

            // Right and down by enough that the release lands outside the panel.
            await dragGrip(page, 260, 120);

            await expect(page.locator('#mb-col-uniq-dropdown'), 'still open after release').toBeVisible();
            let after = await dropSize(page);
            expect(after.width, 'wider by about the drag').toBeGreaterThan(before.width + 200);
            expect(after.width).toBeLessThan(before.width + 300);
            // Height: grown by the drag, but never past the viewport bottom
            // (6px margin) — the panel may already have been at that edge.
            const top = await page.locator('#mb-col-uniq-dropdown')
                .evaluate((el) => el.getBoundingClientRect().top);
            const expectedH = Math.min(before.height + 120, 1000 - top - 6);
            expect(Math.abs(after.height - expectedH), 'height follows the drag, clamped to the viewport')
                .toBeLessThanOrEqual(1);

            expect(await page.evaluate(() => window.__uvdClicks),
                'the release click never reached the page').toBe(0);

            // Vertical, unambiguously: the panel may sit at the viewport
            // bottom, so prove the height axis by SHRINKING it.
            const tall = after.height;
            await dragGrip(page, 0, -150);
            after = await dropSize(page);
            expect(Math.abs(after.height - (tall - 150)), 'height follows an upward drag')
                .toBeLessThanOrEqual(1);

            const stored = await page.evaluate((k) => window.GM_getValue(k, null), GEO_KEY);
            expect(stored && stored[PAGE_TYPE] && stored[PAGE_TYPE].Date,
                'stored under pageType + column').toEqual({ w: after.width, h: after.height });
        });

    test('the size is remembered for that column only', async ({ page }) => {
        await load(page);
        const cols = await uvdColumns(page);
        const other = cols.find((c) => c !== 'Date');
        expect(other, 'the fixture has a second 📊 column').toBeTruthy();

        await openFor(page, other);
        const otherDefault = await dropSize(page);
        await close(page);

        await openFor(page, 'Date');
        await dragGrip(page, 300, 60);
        const resized = await dropSize(page);
        await close(page);

        // Reopen the same column: same size.
        await openFor(page, 'Date');
        expect(await dropSize(page), 'Date reopens at its stored size').toEqual(resized);
        await close(page);

        // Another column through the SAME shared panel element: its default.
        await openFor(page, other);
        expect(await dropSize(page), `${other} keeps its default size`).toEqual(otherDefault);
        expect(await page.locator('#mb-col-uniq-dropdown').getAttribute('data-mb-uvd-sized'),
            'no leftover "sized" marker').toBeNull();
    });

    test('a stored size (from a reload or an import) is applied on open', async ({ page }) => {
        await load(page, { [GEO_KEY]: { [PAGE_TYPE]: { Date: { w: 700, h: 300 } } } });
        await openFor(page, 'Date');
        expect(await dropSize(page)).toEqual({ width: 700, height: 300 });
    });

    test('a double-click on the grip forgets the size and restores the default', async ({ page }) => {
        await load(page);
        await openFor(page, 'Date');
        const defaultSize = await dropSize(page);
        await dragGrip(page, 250, 40);
        expect((await dropSize(page)).width).toBeGreaterThan(defaultSize.width);

        await page.locator('#mb-col-uniq-dropdown .mb-uniq-resize-grip').dblclick();

        await expect(page.locator('#mb-col-uniq-dropdown')).toBeVisible();
        expect(await dropSize(page), 'back to the default size').toEqual(defaultSize);
        const stored = await page.evaluate((k) => window.GM_getValue(k, null), GEO_KEY);
        expect(stored && stored[PAGE_TYPE], 'the entry is gone').toBeFalsy();
    });
});
