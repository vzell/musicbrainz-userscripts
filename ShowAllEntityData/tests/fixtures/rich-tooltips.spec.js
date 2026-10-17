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
//   #mb-ctrl-m-tooltip    Ctrl+M prefix-mode overlay (keyboard, not hover) — here,
//                         including Escape closing it.
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
        expect(await tip.evaluate((t) => getComputedStyle(t).backgroundColor)).toBe('rgb(251, 248, 241)');
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

    test('Relationships cell: with a filter matching its URL, one stack: the filter box (icon marked), then the icon box', async ({ page }) => {
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

        // One stack (mockup https://claude.ai/artifact/NonAS8iqfjSMRUaXojzSnT):
        // the filter's view of the cell, then the hovered icon's own box.
        const rich = page.locator('#mb-rel-tooltip');
        await expect(rich).toBeVisible(); // after its 300 ms delay
        const filterBox = rich.locator('> .mb-rel-note-filter');
        const linkBox = rich.locator('> .mb-rel-note-link');
        await expect(rich.locator('> .mb-rel-note')).toHaveCount(2);
        await expect(filterBox).toContainText('the global filter');
        await expect(filterBox.locator('.mb-global-filter-highlight')).not.toHaveCount(0);
        // The hovered icon is marked in the list, by its site name.
        await expect(filterBox.locator('.mb-rel-here')).toHaveCount(1);
        await expect(filterBox.locator('.mb-rel-here')).toContainText('SpringsteenLyrics◂ this icon');
        // The icon's box names the site and the relationship type, then the URL.
        await expect(linkBox.locator('b')).toHaveText('SpringsteenLyrics');
        await expect(linkBox.locator('.mb-tt-pill')).toHaveText('discogs');
        await expect(linkBox.locator('.mb-rel-lk-url')).toContainText('springsteenlyrics.com/bootlegs.php?item=');
        // Liner notes look, colours from the sa_rel_tooltip_* defaults.
        expect(await filterBox.evaluate((t) => getComputedStyle(t).backgroundColor)).toBe('rgb(251, 248, 241)');
        expect(await filterBox.evaluate((t) => getComputedStyle(t).fontFamily)).toContain('Georgia');
        // Stacked: filter box over the icon's box, same left edge, apart.
        const [fb, lb] = [await filterBox.boundingBox(), await linkBox.boundingBox()];
        expect(Math.abs(fb.x - lb.x)).toBeLessThan(1);
        expect(lb.y).toBeGreaterThanOrEqual(fb.y + fb.height);
        // No loose box beside it any more (debug/hover.png), and the "Liner
        // notes" card stays out of the way.
        await expect(page.locator('#mb-rel-plain-tooltip')).toHaveCount(0);
        await page.waitForTimeout(700); // past the card's default 400 ms delay
        await expect(page.locator('#mb-stat-tooltip')).toBeHidden();

        await page.mouse.move(0, 0);
        await expect(rich).toBeHidden();
        expect(errors).toEqual([]);
    });

    test('Relationships cell: in a narrow window the two boxes still stack without overlapping, inside the window', async ({ page }) => {
        await loadUserscriptPage(page, {
            url: SERIES_URL, fixtureFile: SERIES_SHELL, testMode: true,
            // No sticky Title column: at 520 px it would cover the icon.
            settingsOverride: { sa_enable_relationships_column: true, sa_rel_collapse_threshold: 0, sa_enable_sticky_columns: false },
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

        // Narrow: the stack is one column, so nothing may land beside or on it.
        await page.setViewportSize({ width: 520, height: 800 });
        const icon = page.locator('td.mb-rel-cell a:has(.mb-rel-filter-key .mb-global-filter-highlight)').first();
        // Centre the icon: the stack opens at its left edge.
        await icon.evaluate((a) => a.scrollIntoView({ block: 'center', inline: 'center' }));
        const box = await icon.boundingBox();
        const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
        expect(await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('td.mb-rel-cell a'), [cx, cy]),
            'premise: the icon is what lies under the pointer').toBe(true);
        await page.mouse.move(0, 0);
        await page.mouse.move(cx, cy, { steps: 3 });
        await expect(page.locator('#mb-rel-tooltip')).toBeVisible();
        const rects = await page.evaluate(() => Array.from(document.querySelectorAll('#mb-rel-tooltip > .mb-rel-note')).map((n) => {
            const r = n.getBoundingClientRect();
            return { l: r.left, r: r.right, t: r.top, b: r.bottom };
        }));
        expect(rects).toHaveLength(2);
        const [a, b] = rects;
        const overlap = a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
        expect(overlap, `filter ${JSON.stringify(a)} vs icon ${JSON.stringify(b)}`).toBe(false);
        rects.forEach((r) => {
            expect(r.l).toBeGreaterThanOrEqual(0);
            expect(r.r).toBeLessThanOrEqual(520);
        });
    });

    test('Relationships cell: without a filter, no stack; the icon\'s own card names its site', async ({ page }) => {
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

        await page.mouse.move(0, 0);
        await page.locator('td.mb-rel-cell a').first().hover();
        await page.waitForTimeout(500);
        expect(await page.evaluate(() => {
            const t = document.getElementById('mb-rel-tooltip');
            return t ? t.style.display : 'none';
        })).not.toBe('block');
        // With no filter, the icon's own title is a "Liner notes" card: the
        // icon's box (site, type, URL), not the bare URL.
        await expect(page.locator('#mb-stat-tooltip')).toBeVisible();
        await expect(page.locator('#mb-stat-tooltip .mb-rel-lk b')).toHaveText('SpringsteenLyrics');
        await expect(page.locator('#mb-stat-tooltip .mb-rel-lk-url')).toContainText('springsteenlyrics.com/bootlegs.php?item=0');
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
        await expect(tip).toHaveClass(/mb-tt-liner/);
        expect(await tip.evaluate((t) => getComputedStyle(t).backgroundColor)).toBe('rgb(251, 248, 241)');
        expect(errors).toEqual([]);
    });

    // Was unreachable until 2026-10-04: in prefix mode an unmodified Escape
    // entered the "single character key" branch first, which returned
    // because 'Escape' is not in validCharacters, so the overlay stayed up
    // until its 5 s auto-exit.
    test('Ctrl+M overlay: Escape closes it at once', async ({ page }) => {
        await loadRg(page);
        await page.locator(`button[data-label="${RG_BUTTON}"]`).waitFor();

        await page.keyboard.press('Control+m');
        const tip = page.locator('#mb-ctrl-m-tooltip');
        await expect(tip).toBeVisible();
        await page.keyboard.press('Escape');
        // Well inside the 5 s auto-exit, so only Escape can have closed it.
        await expect(tip).toHaveCount(0, { timeout: 1500 });
    });

    test('Ctrl+M overlay: the Escape that closes it does not also clear the focused global filter', async ({ page }) => {
        await loadRg(page);
        await page.click(`button[data-label="${RG_BUTTON}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });

        const gf = page.locator('#mb-global-filter-input');
        await gf.click();
        await gf.pressSequentially('Studio');
        await page.keyboard.press('Control+m');
        await expect(page.locator('#mb-ctrl-m-tooltip')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.locator('#mb-ctrl-m-tooltip')).toHaveCount(0, { timeout: 1500 });
        // A plain Escape in the global filter clears it (first press); this
        // one belonged to prefix mode, so the text stays.
        await expect(gf).toHaveValue(/Studio/);

        // Control: the next plain Escape does reach the filter.
        await page.keyboard.press('Escape');
        await expect(gf).not.toHaveValue(/Studio/);
    });
});
