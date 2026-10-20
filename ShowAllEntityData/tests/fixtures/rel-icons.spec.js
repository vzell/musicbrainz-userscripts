'use strict';

// Popups for the Relationships icons (mockup approved 2026-10-17:
// https://claude.ai/artifact/NonAS8iqfjSMRUaXojzSnT; debug/missing-CAA-hover.html,
// debug/hover.png).
//
// ── What each test pins ─────────────────────────────────────────────────────
//
//  1. A COVER ICON IN A RELATIONSHIP LIST (jesus2099's `<a href="…/release/
//     <mbid>/cover-art"><span class="caa-icon">` in `table.details`):
//     a. hover shows the release's artwork card (title from the release group
//        link after it, image count, tiles), loaded on that first hover, with
//        the icon's native title held back meanwhile;
//     b. a plain click opens OUR viewer at the main front, and stays on the
//        page WITHOUT the "leave this page?" dialog, on a rendered page
//        where that guard is armed (reported 2026-10-17: the guard on the
//        document asked before the viewer could take the click); Ctrl-click
//        is left to the link, and asks nothing either;
//     c. with the card switched off, nothing is stamped and the native title
//        stays.
//  2. A RELATIONSHIPS COLUMN ICON with the link-preview cards on gets the
//     external card, and the card's note stack carries the icon's boxes (the
//     filter box with the icon marked, then the icon box), never the cell's
//     "click outside the icons" hint; `#mb-rel-tooltip` stays hidden.
//     The stack without a card is rich-tooltips.spec.js's.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const RG_URL = 'https://musicbrainz.org/release-group/aaaaaaaa-0000-0000-0000-000000000002';
const RG_FIXTURE = path.join(__dirname, 'releasegroup-releases-live-titles.html');
const REL_ID = 'd0adda7e-86de-4aef-af95-ee7da122d175';
const RECORD_TEXT = fs.readFileSync(path.join(__dirname, 'caa-release-d0adda7e.json'), 'utf8');
const RECORD = JSON.parse(RECORD_TEXT);
const CORS = { 'access-control-allow-origin': '*' };
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="250"><rect width="200" height="250" fill="#6a4a8a"/></svg>';

const SERIES_URL = 'https://musicbrainz.org/series/aa3694d3-a3d0-48ed-8f07-5b576de87908';
const SERIES_SHELL = path.join(__dirname, '..', 'snapshots', 'series-releases', 'raw.html');
const SL_URL = 'https://www.springsteenlyrics.com/bootlegs.php?item=';

/**
 * Loads the release-group page, renders it ("Show all", which arms the
 * navigation guard) and puts a relationship list with one jesus2099 cover
 * icon into it (as debug/missing-CAA-hover.html has it). The archive
 * answers the release's real record; its images are SVGs. Every dialog is
 * recorded (and dismissed) in `dialogs`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} [settings]
 * @returns {Promise<{metaRequests: string[], dialogs: string[]}>}
 */
async function openRelList(page, settings = {}) {
    const log = { metaRequests: [], dialogs: [] };
    page.on('dialog', (d) => { log.dialogs.push(d.message()); d.dismiss(); });
    await loadUserscriptPage(page, {
        url: RG_URL, fixtureFile: RG_FIXTURE, testMode: true,
        settingsOverride: {
            sa_enable_caa_pics: true, sa_enable_relationships_column: false,
            sa_art_idb_enable: false, sa_rich_tooltip_delay_ms: 0, ...settings,
        },
    });
    await page.route('https://coverartarchive.org/**', (route) => {
        const u = route.request().url();
        if (/\/release\/[0-9a-f-]{36}$/.test(u)) {
            log.metaRequests.push(u);
            return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: RECORD_TEXT });
        }
        return route.fulfill({ status: 200, headers: CORS, contentType: 'image/svg+xml', body: SVG });
    });
    await page.route(`${RG_URL}*`, (r) => r.fulfill({ path: RG_FIXTURE, contentType: 'text/html' }));
    await page.click('button[data-label="Show all Releases for ReleaseGroup"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
    log.metaRequests.length = 0; // the table's own artwork, not the icon's
    await page.evaluate((id) => {
        const t = document.createElement('table');
        t.className = 'details';
        t.innerHTML = '<tbody><tr><th>includes:</th><td><span class="rglink"></span>' +
            `<a href="https://musicbrainz.org/release/${id}/cover-art" ref="/release-group/92b7f3ea-882a-4073-9e25-b3d158a67f57" ` +
            'title="16 images found in this release" id="rel-cover-icon"><span class="caa-icon jesus2099userjs154481" ' +
            'style="display:inline-block;width:20px;height:20px;background:#333"></span></a>' +
            '<a href="/release-group/92b7f3ea-882a-4073-9e25-b3d158a67f57"><bdi>Tunnel of Love Express</bdi></a><br></td></tr></tbody>';
        (document.getElementById('content') || document.body).prepend(t);
    }, REL_ID);
    return log;
}

test.describe('relationship list cover icons', () => {
    let pageErrors;
    test.beforeEach(({ page }) => {
        pageErrors = [];
        page.on('pageerror', (e) => pageErrors.push(String(e.stack || e.message)));
    });
    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('hover: the release\'s artwork card, loaded on that first hover; the native title held back', async ({ page }) => {
        const log = await openRelList(page);
        const icon = page.locator('#rel-cover-icon');
        expect(log.metaRequests.filter((u) => u.includes(REL_ID)), 'nothing asked before the hover').toEqual([]);
        await page.mouse.move(0, 0);
        await icon.hover();
        const tip = page.locator('#mb-stat-tooltip');
        await expect(tip).toBeVisible();
        await expect(tip.locator('.mb-tt-title')).toHaveText('Tunnel of Love Express');
        await expect(tip.locator('.mb-tt-dim')).toHaveText(new RegExp(`^${RECORD.images.length} images · ★ main front`));
        await expect(tip.locator('.mb-art-card-tile')).toHaveCount(12);
        await expect(tip.locator('.mb-art-card-more')).toHaveText(`+${RECORD.images.length - 12}`);
        await expect(tip.locator('.mb-tt-foot:not(.mb-art-card-keys)')).toHaveText('Click: viewer · Ctrl-click: the artwork page');
        expect(log.metaRequests.filter((u) => u.includes(REL_ID))).toEqual([`https://coverartarchive.org/release/${REL_ID}`]);
        // No native box over the card.
        await expect(icon).toHaveAttribute('title', '');
        await page.mouse.move(0, 0);
        await expect(tip).toBeHidden();
        await expect(icon).toHaveAttribute('title', '16 images found in this release');
    });

    // The card keys (2026-10-20) are shared by every card _artCardCoreHtml()
    // builds: Space must draw every image here too, not only in the CAA column.
    test('Space on the card draws every image of the release, Space again the first 12', async ({ page }) => {
        await openRelList(page);
        await page.mouse.move(0, 0);
        await page.locator('#rel-cover-icon').hover();
        const tip = page.locator('#mb-stat-tooltip');
        await expect(tip.locator('.mb-art-card-tile')).toHaveCount(12);
        await page.keyboard.press('Space');
        await expect(tip.locator('.mb-art-card-tile')).toHaveCount(RECORD.images.length);
        await expect(tip.locator('.mb-art-card-more')).toHaveCount(0);
        await page.keyboard.press('Space');
        await expect(tip.locator('.mb-art-card-tile')).toHaveCount(12);
    });

    test('click: our viewer at the main front, on this page, no "leave this page?"; Ctrl-click is the link\'s', async ({ page }) => {
        const log = await openRelList(page);
        const before = page.url();
        await page.locator('#rel-cover-icon').click();
        const viewer = page.locator('#mb-art-viewer');
        await expect(viewer).toBeVisible();
        await expect(viewer.locator('.mb-artv-title')).toHaveText('Tunnel of Love Express');
        await expect(viewer.locator('.mb-artv-pos')).toHaveText(`1 / ${RECORD.images.length}`);
        expect(page.url()).toBe(before);
        await page.keyboard.press('Escape');
        await expect(viewer).toBeHidden();

        // Ctrl: the handler leaves the event alone (recorded at the link,
        // then cancelled there so the test page stays).
        const prevented = await page.evaluate(() => {
            const a = document.getElementById('rel-cover-icon');
            let seen = null;
            a.addEventListener('click', (e) => { seen = e.defaultPrevented; e.preventDefault(); }, { once: true });
            a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true, button: 0 }));
            return seen;
        });
        expect(prevented).toBe(false);
        await expect(viewer).toBeHidden();
        expect(log.dialogs, 'no navigation guard dialog').toEqual([]);
    });

    test('with the artwork card off: no card, the native title stays', async ({ page }) => {
        const log = await openRelList(page, { sa_caa_tip_summary: false });
        const icon = page.locator('#rel-cover-icon');
        await page.mouse.move(0, 0);
        await icon.hover();
        // A resolver card shows in the mouseover itself (no delay): hidden
        // now means none.
        await expect(icon).not.toHaveAttribute('data-mbtt-fn', /.*/);
        await expect(page.locator('#mb-stat-tooltip')).toBeHidden();
        await expect(icon).toHaveAttribute('title', '16 images found in this release');
        expect(log.metaRequests.filter((u) => u.includes(REL_ID))).toEqual([]);
    });
});

test.describe('Relationships column icons: the link preview card', () => {
    /**
     * The series page with its Relationships column loaded: four
     * springsteenlyrics.com links, the rest Discogs. The card waits 600 ms,
     * twice the column's own stack timer (300 ms), so by the time the card
     * shows that timer has run: "the stack stayed hidden" is then a real
     * observation, with no sleep.
     *
     * @param {import('@playwright/test').Page} page
     */
    async function openSeries(page) {
        await loadUserscriptPage(page, {
            url: SERIES_URL, fixtureFile: SERIES_SHELL, testMode: true,
            settingsOverride: {
                sa_enable_relationships_column: true, sa_rel_collapse_threshold: 0,
                sa_pop_ext: true, sa_dp_hover_without_ctrl: true, sa_rich_tooltip_delay_ms: 600,
            },
        });
        let n = 0;
        await page.route('**/ws/2/**', (route) => {
            const resource = n < 4 ? SL_URL + n : `https://www.discogs.com/release/${n}`;
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
    }

    test('hover: the card, with the filter box (icon marked) and the icon box as its note stack', async ({ page }) => {
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await openSeries(page);
        await page.fill('#mb-global-filter-input', 'springsteenlyrics');
        const icon = page.locator('td.mb-rel-cell a:has(.mb-rel-filter-key .mb-global-filter-highlight)').first();
        await page.mouse.move(0, 0);
        await icon.hover();
        const peek = page.locator('#mb-dp-peek');
        await expect(peek).toBeVisible();
        await expect(peek).toContainText('springsteenlyrics.com');
        const notes = page.locator('#mb-dp-notes');
        await expect(notes.locator('.mb-dp-note')).toHaveCount(2);
        await expect(notes.locator('.mb-dp-note').first()).toHaveClass(/mb-dp-note-rel/);
        await expect(notes.locator('.mb-dp-note-rel .mb-rel-here')).toContainText('SpringsteenLyrics');
        await expect(notes.locator('.mb-dp-note-title .mb-rel-lk b')).toHaveText('SpringsteenLyrics');
        // Not the cell's own "click outside the icons" hint, and no second
        // stack of the column's own.
        await expect(notes).not.toContainText('outside the icons');
        await expect(page.locator('#mb-rel-tooltip')).toBeHidden();
        await expect(page.locator('#mb-stat-tooltip')).toBeHidden();
        expect(errors).toEqual([]);
    });

    test('without a filter: the card and the icon box alone', async ({ page }) => {
        await openSeries(page);
        await page.mouse.move(0, 0);
        await page.locator('td.mb-rel-cell a').first().hover();
        await expect(page.locator('#mb-dp-peek')).toBeVisible();
        await expect(page.locator('#mb-dp-notes .mb-dp-note')).toHaveCount(1);
        await expect(page.locator('#mb-dp-notes .mb-dp-note-title .mb-rel-lk b')).toHaveText('SpringsteenLyrics');
        await expect(page.locator('#mb-dp-notes .mb-dp-note-title .mb-tt-pill')).toHaveText('discogs');
    });
});
