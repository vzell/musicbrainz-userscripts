'use strict';

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// Health check for the rich HTML tooltips that had no spec of their own
// (2026-10-04 inventory; the others are covered elsewhere):
//
//   #mb-stat-tooltip      h2/h3 row-count stat ([data-mbtt]) — here.
//                         h1 action buttons — action-button-shortlabel-and-rich-tooltip.
//   #mb-rel-tooltip       Relationships cell, only while a filter matches it — here.
//   #mb-ctrl-m-tooltip    Ctrl+M prefix-mode overlay (keyboard, not hover) — here.
//   #mb-art-bigbox-tooltip  strip: bigbox-tooltip; per-image <li> and
//                         #mb-art-hover-preview: caa-col-hdr-deferred-visibility;
//                         inline thumbnail: user-ratings-multigroup.
//
// Each test asserts the popup's CONTENT, not only that it became visible: a
// renderer that throws half way can leave a visible but truncated popup.

const RG_URL = 'https://musicbrainz.org/release-group/aaaaaaaa-0000-0000-0000-000000000002';
const RG_FIXTURE = path.join(__dirname, 'releasegroup-releases-live-titles.html');
const RG_BUTTON = 'Show all Releases for ReleaseGroup';

const SERIES_URL = 'https://musicbrainz.org/series/aa3694d3-a3d0-48ed-8f07-5b576de87908';
const SERIES_SHELL = path.join(__dirname, '..', 'snapshots', 'series-releases', 'raw.html');
const SL_URL = 'https://www.springsteenlyrics.com/bootlegs.php?item=';
const SL_ROWS = 4;

/**
 * Collects uncaught page errors.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {string[]} live array of messages
 */
function pageErrors(page) {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    return errors;
}

/**
 * Loads the release-group fixture without running the fetch.
 *
 * @param {import('@playwright/test').Page} page
 */
async function loadRg(page) {
    await loadUserscriptPage(page, {
        url: RG_URL, fixtureFile: RG_FIXTURE, testMode: true,
        settingsOverride: { sa_enable_caa_pics: false, sa_enable_relationships_column: false },
    });
    await page.route(`${RG_URL}*`, (r) => r.fulfill({ path: RG_FIXTURE, contentType: 'text/html' }));
}

test.describe('rich tooltips: health check', () => {
    test('h2/h3 row-count stat: shows the filter expression in a coloured chip, and hands the heading title back', async ({ page }) => {
        const errors = pageErrors(page);
        await loadRg(page);
        await page.click(`button[data-label="${RG_BUTTON}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });

        await page.fill('#mb-global-filter-input', 'Studio');
        await expect.poll(() => page.evaluate(() =>
            !!document.querySelector('.mb-row-count-stat[data-mbtt*="mbtt-gf"]'))).toBe(true);

        const stat = page.locator('.mb-row-count-stat[data-mbtt*="mbtt-gf"]').first();
        const headingTitle = await stat.evaluate((s) => (s.closest('h2, h3') || {}).title || '');
        await stat.hover();

        const tip = page.locator('#mb-stat-tooltip');
        await expect(tip).toBeVisible();
        await expect(tip.locator('.mbtt-gf')).toHaveText('Studio');
        // The heading's own native title is suppressed while ours shows, so
        // the browser never draws both...
        if (headingTitle) {
            expect(await stat.evaluate((s) => s.closest('h2, h3').title)).toBe('');
        }

        await page.mouse.move(0, 0);
        await expect(tip).toBeHidden();
        // ...and given back afterwards.
        expect(await stat.evaluate((s) => (s.closest('h2, h3') || {}).title || '')).toBe(headingTitle);
        expect(errors).toEqual([]);
    });

    test('Relationships cell: with a filter matching its URL, the rich and the plain panel both show', async ({ page }) => {
        const errors = pageErrors(page);
        await loadUserscriptPage(page, {
            url: SERIES_URL, fixtureFile: SERIES_SHELL, testMode: true,
            settingsOverride: { sa_enable_relationships_column: true, sa_rel_collapse_threshold: 0 },
        });
        let n = 0;
        await page.route('**/ws/2/**', (route) => {
            const resource = n < SL_ROWS ? SL_URL + n : `https://www.discogs.com/release/${n}`;
            n++;
            return route.fulfill({
                status: 200, contentType: 'application/json',
                body: JSON.stringify({ relations: [{ 'target-type': 'url', type: 'discogs', url: { resource } }] }),
            });
        });
        await page.route('https://musicbrainz.org/series/**',
            (route) => route.fulfill({ path: SERIES_SHELL, contentType: 'text/html' }));
        await page.click('button[data-label="Show all Releases for Series"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await expect.poll(() => page.evaluate(() => window.__saTest.relTableStates()[0].pending),
            { timeout: 60000 }).toBe(0);

        await page.fill('#mb-global-filter-input', 'springsteenlyrics');
        const icon = page.locator('td.mb-rel-cell a:has(.mb-rel-filter-key .mb-global-filter-highlight)').first();
        await expect(icon).toHaveCount(1);
        await icon.hover();

        const rich = page.locator('#mb-rel-tooltip');
        await expect(rich).toBeVisible(); // after its 300 ms delay
        await expect(rich).toContainText('springsteenlyrics');
        await expect(rich.locator('.mb-global-filter-highlight')).not.toHaveCount(0);

        await page.mouse.move(0, 0);
        await expect(rich).toBeHidden();
        expect(errors).toEqual([]);
    });

    test('Relationships cell: without a filter, no rich panel (the native title stays in charge)', async ({ page }) => {
        await loadUserscriptPage(page, {
            url: SERIES_URL, fixtureFile: SERIES_SHELL, testMode: true,
            settingsOverride: { sa_enable_relationships_column: true, sa_rel_collapse_threshold: 0 },
        });
        await page.route('**/ws/2/**', (route) => route.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify({ relations: [{ 'target-type': 'url', type: 'discogs', url: { resource: `${SL_URL}0` } }] }),
        }));
        await page.route('https://musicbrainz.org/series/**',
            (route) => route.fulfill({ path: SERIES_SHELL, contentType: 'text/html' }));
        await page.click('button[data-label="Show all Releases for Series"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await expect.poll(() => page.evaluate(() => window.__saTest.relTableStates()[0].pending),
            { timeout: 60000 }).toBe(0);

        await page.locator('td.mb-rel-cell a').first().hover();
        await page.waitForTimeout(500);
        expect(await page.evaluate(() => {
            const t = document.getElementById('mb-rel-tooltip');
            return t ? t.style.display : 'none';
        })).not.toBe('block');
    });

    test('Ctrl+M overlay: lists the page action button and the function keys', async ({ page }) => {
        const errors = pageErrors(page);
        await loadRg(page);
        await page.locator(`button[data-label="${RG_BUTTON}"]`).waitFor();

        await page.keyboard.press('Control+m');
        const tip = page.locator('#mb-ctrl-m-tooltip');
        await expect(tip).toBeVisible();
        await expect(tip).toContainText('Functions:');
        // The page's one action button is offered as key 1.
        await expect(tip).toContainText('Buttons:');
        await expect(tip.locator('.sa-ctrlm-indent').first()).toContainText('1:');
        expect(errors).toEqual([]);
    });

    // KNOWN BUG (found by this health check, 2026-10-04, not fixed yet): in
    // prefix mode an unmodified Escape enters the "single character key"
    // branch first, which returns because 'Escape' is not in
    // validCharacters, so the Escape branch below it is unreachable. The
    // overlay stays until its 5 s auto-exit. Remove test.fail() with the fix.
    test('Ctrl+M overlay: Escape closes it at once', async ({ page }) => {
        test.fail();
        await loadRg(page);
        await page.locator(`button[data-label="${RG_BUTTON}"]`).waitFor();

        await page.keyboard.press('Control+m');
        const tip = page.locator('#mb-ctrl-m-tooltip');
        await expect(tip).toBeVisible();
        await page.keyboard.press('Escape');
        // Well inside the 5 s auto-exit, so only Escape can have closed it.
        await expect(tip).toHaveCount(0, { timeout: 1500 });
    });
});
