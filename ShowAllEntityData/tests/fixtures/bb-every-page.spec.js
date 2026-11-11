'use strict';

// Brucebase: link previews on EVERY page (vzell, 2026-11-04: "previews
// should run on every Brucebase page") — a gig, a venue, a person, a song.
// The catch-all @include lets the script in; the catch-all pageType
// `bb-page` (last of the Brucebase ones, no button) installs the popup
// engine through the normal init, with a HIDDEN header, so nothing of the
// wiki's page changes. A first version stopped init early instead: every
// top-level declaration after that exit stayed uninitialised, and the
// artwork viewer threw "Cannot access '_artViewerState' before
// initialization". So this spec drives the engine end to end — card,
// window, an image in the artwork viewer, Esc — and fails on ANY page error.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { routeDetailPages } = require('../support/detailFixture');

const GIG = 'https://brucebase.wikidot.com/gig:1985-01-13-carolina-coliseum-columbia-sc';
const VENUE_PAGE = 'https://brucebase.wikidot.com/venue:paramount-theatre-asbury-park-nj';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

/**
 * Loads a Brucebase page without a pageType, its detail pages routed to
 * their fixtures and every image answered with one pixel.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} url
 * @param {string} file - The fixture of that page.
 * @param {Object} [settings]
 * @returns {Promise<string[]>} Page errors.
 */
async function open(page, url, file, settings = {}) {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    await loadUserscriptPage(page, {
        url, fixtureFile: path.join(__dirname, file), testMode: true,
        settingsOverride: { sa_enable_brucebase: true, sa_bb_detail_preview: true, sa_bb_event_preview: true, sa_pop_ext: true,
            sa_rich_tooltip_delay_ms: 0, ...settings },
    });
    await routeDetailPages(page, 'bb');
    await page.route(/\.(?:jpe?g|png|gif)(?:\?.*)?$/i, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    return errors;
}

/**
 * Hovers an element with Ctrl held, as the other popup specs do.
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} el
 * @returns {Promise<void>}
 */
async function ctrlHover(page, el) {
    await page.mouse.move(0, 0);
    await el.scrollIntoViewIfNeeded();
    await page.keyboard.down('Control');
    await el.hover();
    await page.keyboard.up('Control');
}

test.describe('Brucebase: link previews on every page (2026-11-04)', () => {
    // A gig page is bb-event's since 2026-11-11 (org/brucebase.org, Phase 2,
    // tests/fixtures/bb-event.spec.js); with its setting off it is this
    // catch-all's again, which is what this test pins.
    test('a gig page (no pageType): no toolbar; its venue link has the venue card, Space the window, an image the viewer; Back; no page error', async ({ page }) => {
        const errors = await open(page, GIG, 'detail-bb-gig-1985-01-13.html', { sa_bb_detail_pages: false });
        await expect(page.locator('button[data-label]'), 'no toolbar: nothing but previews').toHaveCount(0);
        await expect(page.locator('h1.mb-bb-preview-only'), 'the pageType\'s header, hidden').toBeHidden();
        await expect(page.locator('#page-title'), 'the wiki\'s own title, as it was').toBeVisible();
        // The wiki's page as it was: its content exactly the fixture's.
        const fixture = fs.readFileSync(path.join(__dirname, 'detail-bb-gig-1985-01-13.html'), 'utf8');
        expect(await page.evaluate((html) => {
            const orig = new DOMParser().parseFromString(html, 'text/html').querySelector('#page-content');
            return orig && orig.innerHTML === document.querySelector('#page-content').innerHTML;
        }, fixture), '#page-content untouched').toBe(true);
        const venue = page.locator('#page-content a[href="/venue:carolina-coliseum-columbia-sc"]').first();
        await ctrlHover(page, venue);
        const card = page.locator('#mb-dp-peek');
        await expect(card).toBeVisible();
        await expect(card).toContainText('Carolina Coliseum');
        await page.keyboard.press('Space');
        const d = page.locator('#mb-dp-dialog');
        await expect(d).toBeVisible();
        const img = d.locator('a[data-mb-artv-ext] img').first();
        await expect(img, 'the venue window shows its photos').toBeVisible();
        await img.click();
        await expect(page.locator('#mb-art-viewer'), 'the artwork viewer opens').toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.locator('#mb-art-viewer')).toBeHidden();
        expect(errors).toEqual([]);
    });

    test('a venue page (no pageType): its Wikipedia link (another site) has a card', async ({ page }) => {
        // The G7 pre-test's page (org/non-MB-coverage.org): it had no
        // previews at all before 2026-11-04.
        const errors = await open(page, VENUE_PAGE, 'detail-bb-venue-paramount-theatre.html');
        const wp = page.locator('#page-content a[href^="http://en.wikipedia.org/wiki/Paramount_Theatre"]').first();
        await ctrlHover(page, wp);
        await expect(page.locator('#mb-dp-peek')).toBeVisible();
        await expect(page.locator('#mb-dp-peek')).toContainText(/Wikipedia/);
        expect(errors).toEqual([]);
    });

    test('with Brucebase support off (sa_enable_brucebase), a page without a pageType stays untouched', async ({ page }) => {
        const errors = await open(page, GIG, 'detail-bb-gig-1985-01-13.html', { sa_enable_brucebase: false });
        // Init never ran: the hidden header it creates with support on is not there.
        await expect(page.locator('h1.mb-bb-preview-only')).toHaveCount(0);
        await ctrlHover(page, page.locator('#page-content a[href="/venue:carolina-coliseum-columbia-sc"]').first());
        await expect(page.locator('#mb-dp-peek')).toHaveCount(0);
        expect(errors).toEqual([]);
    });
});
