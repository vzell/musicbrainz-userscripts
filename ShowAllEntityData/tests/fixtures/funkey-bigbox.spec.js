'use strict';

// jesus2099's "mb. FUNKEY ILLUSTRATED RECORDS" big-picture strip
// (`div.jesus2099userjs154481bigbox`, simulated by
// tests/fixtures/thirdPartyScripts/funkey-bigbox.js; debug/mb-rg-funky-initial.html,
// debug/mb-rg-funky-final.html; 2026-10-28).
//
// ── What each test pins ─────────────────────────────────────────────────────
//
//  INITIAL PAGE — the strip's images behave like the relationship-list cover
//  icons (rel-icons.spec.js), with no render:
//   1. hover shows the B1 artwork card of the linked RELEASE, asked on that
//      first hover (nothing before), with the anchor's native title held back
//      while the card shows and given back after;
//   2. a plain click opens OUR viewer at the main front and stays on the page;
//      Ctrl-click is left to the link; Space opens the same viewer;
//   3. a strip image linking a RELEASE GROUP asks the release group's record
//      and says "release group page" — not the release path;
//   4. with the artwork card off nothing is stamped and the native title stays.
//  FINAL RENDERED PAGE — no strip survives a render, whenever it arrives:
//   5. a strip already on the page goes with the press (the one-shot
//      performClutterCleanup(), kept pinned);
//   6. a strip put in AFTER the render (that script's one-shot 600 ms pass
//      finding our tables, debug/mb-rg-funky-final.html) is removed — and the
//      first table's previous sibling is not a strip;
//   7. the same through the second press's reload (`_autoRepressAfterReload()`
//      presses at setTimeout 0, before that script's timer);
//   8. the same after a disk load;
//   9. the watcher is spent once that script's one pass is removed: a later
//      strip stays (it is not live for the rest of its window).

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { loadFromDiskFixture } = require('../support/diskFixture');

const RG_URL = 'https://musicbrainz.org/release-group/aaaaaaaa-0000-0000-0000-000000000002';
const RG_FIXTURE = path.join(__dirname, 'releasegroup-releases-live-titles.html');
const RG_LABEL = 'Show all Releases for ReleaseGroup';
const FIRST_REL = '00000001-0000-4000-8000-000000000001';
const LINKED_RG = '92b7f3ea-882a-4073-9e25-b3d158a67f57';
const RECORD_TEXT = fs.readFileSync(path.join(__dirname, 'caa-release-d0adda7e.json'), 'utf8');
const RECORD = JSON.parse(RECORD_TEXT);
const SIM = fs.readFileSync(path.join(__dirname, 'thirdPartyScripts', 'funkey-bigbox.js'), 'utf8');
const CORS = { 'access-control-allow-origin': '*' };
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="250"><rect width="200" height="250" fill="#6a4a8a"/></svg>';
const STRIP = 'div.jesus2099userjs154481bigbox';
const FLAG_KEY = 'mb_show_all_reload_pending';

const DISK_FIXTURE = path.join(__dirname, 'saved-data', 'artist-releases-bodeans.json.gz');
const DISK_URL = 'https://musicbrainz.org/artist/84c38d3a-3400-4c28-b988-90558bb6fae0/releases';

/**
 * Answers the archive: every release or release group record is the real
 * d0adda7e record (16 images), every image an SVG. Records the record
 * requests in `metaRequests`.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string[]>} metaRequests
 */
async function routeArchive(page) {
    const metaRequests = [];
    await page.route('https://coverartarchive.org/**', (route) => {
        const u = route.request().url();
        if (/\/release(-group)?\/[0-9a-f-]{36}$/.test(u)) {
            metaRequests.push(u);
            return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: RECORD_TEXT });
        }
        return route.fulfill({ status: 200, headers: CORS, contentType: 'image/svg+xml', body: SVG });
    });
    return metaRequests;
}

/**
 * Runs the simulated FUNKEY pass on the page as it is now.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<number>} The number of strips it inserted.
 */
async function runFunkey(page) {
    await page.addScriptTag({ content: SIM });
    return page.evaluate(() => window.__funkeySimCount);
}

/**
 * The release group page, NOT rendered, with FUNKEY's strip in front of its
 * release table.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} [settings]
 * @returns {Promise<{metaRequests: string[], dialogs: string[]}>}
 */
async function openInitialPage(page, settings = {}) {
    const dialogs = [];
    page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });
    const metaRequests = await routeArchive(page);
    await loadUserscriptPage(page, {
        url: RG_URL, fixtureFile: RG_FIXTURE, testMode: true,
        settingsOverride: {
            sa_enable_caa_pics: true, sa_enable_relationships_column: false,
            sa_art_idb_enable: false, sa_rich_tooltip_delay_ms: 0, ...settings,
        },
    });
    expect(await runFunkey(page), 'one strip, before the release table').toBe(1);
    return { metaRequests, dialogs };
}

/**
 * The release group page rendered ("Show all Releases for ReleaseGroup").
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function openRendered(page) {
    await routeArchive(page);
    await page.route(`${RG_URL}*`, (r) => r.fulfill({ path: RG_FIXTURE, contentType: 'text/html' }));
    await loadUserscriptPage(page, {
        url: RG_URL, fixtureFile: RG_FIXTURE, testMode: true,
        settingsOverride: { sa_enable_caa_pics: true, sa_enable_relationships_column: false, sa_art_idb_enable: false },
    });
    await page.click(`button[data-label="${RG_LABEL}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/**
 * Whether any element directly before a `table.tbl` is a FUNKEY strip.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<boolean>}
 */
const stripBeforeATable = (page) => page.evaluate((sel) =>
    Array.from(document.querySelectorAll('table.tbl')).some((t) => t.previousElementSibling && t.previousElementSibling.matches(sel)), STRIP);

test.describe('FUNKEY strip on the initial page: our card and viewer', () => {
    let pageErrors;
    test.beforeEach(({ page }) => {
        pageErrors = [];
        page.on('pageerror', (e) => pageErrors.push(String(e.stack || e.message)));
    });
    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('hover: the release\'s artwork card, asked on that first hover; the native title held back', async ({ page }) => {
        const { metaRequests } = await openInitialPage(page);
        const a = page.locator(`${STRIP} > a[href="/release/${FIRST_REL}"]`);
        await expect(a).toHaveAttribute('title', 'Studio Album');
        expect(metaRequests, 'nothing asked before the hover').toEqual([]);
        await page.mouse.move(0, 0);
        await a.locator('img').hover();
        const tip = page.locator('#mb-stat-tooltip');
        await expect(tip).toBeVisible();
        await expect(tip.locator('.mb-tt-title')).toHaveText('Studio Album');
        await expect(tip.locator('.mb-tt-dim')).toHaveText(new RegExp(`^${RECORD.images.length} images · ★ main front`));
        await expect(tip.locator('.mb-art-card-tile')).toHaveCount(12);
        await expect(tip.locator('.mb-tt-foot:not(.mb-art-card-keys)')).toHaveText('Click: viewer · Ctrl-click: the release page');
        expect(metaRequests).toEqual([`https://coverartarchive.org/release/${FIRST_REL}`]);
        await expect(a).toHaveAttribute('data-mbtt-fn', 'art-rel');
        await expect(a, 'no native box over the card').toHaveAttribute('title', '');
        await page.mouse.move(0, 0);
        await expect(tip).toBeHidden();
        await expect(a).toHaveAttribute('title', 'Studio Album');
    });

    test('click: our viewer at the main front, on this page; Ctrl-click is the link\'s; Space opens it too', async ({ page }) => {
        const { dialogs } = await openInitialPage(page, { sa_caa_tip_summary_tiles: 20 });
        const before = page.url();
        const a = page.locator(`${STRIP} > a[href="/release/${FIRST_REL}"]`);
        await a.locator('img').click();
        const viewer = page.locator('#mb-art-viewer');
        await expect(viewer).toBeVisible();
        await expect(viewer.locator('.mb-artv-title')).toHaveText('Studio Album');
        await expect(viewer.locator('.mb-artv-pos')).toHaveText(`1 / ${RECORD.images.length}`);
        expect(page.url()).toBe(before);
        await page.keyboard.press('Escape');
        await expect(viewer).toBeHidden();

        const prevented = await page.evaluate((rel) => {
            const link = document.querySelector(`div.jesus2099userjs154481bigbox > a[href="/release/${rel}"]`);
            let seen = null;
            link.addEventListener('click', (e) => { seen = e.defaultPrevented; e.preventDefault(); }, { once: true });
            link.querySelector('img').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true, button: 0 }));
            return seen;
        }, FIRST_REL);
        expect(prevented, 'Ctrl-click reaches the link uncancelled').toBe(false);
        await expect(viewer).toBeHidden();

        // Space on the hovered image: the same viewer (20 tiles show all 16,
        // so Space is not the card's "every image" toggle).
        await page.mouse.move(0, 0);
        await a.locator('img').hover();
        await expect(page.locator('#mb-stat-tooltip')).toBeVisible();
        await page.keyboard.press('Space');
        await expect(viewer.locator('.mb-artv-title')).toHaveText('Studio Album');
        await expect(viewer.locator('.mb-artv-pos')).toHaveText(`1 / ${RECORD.images.length}`);
        expect(page.url()).toBe(before);
        expect(dialogs).toEqual([]);
    });

    test('a release group strip image: the release group\'s record and "release group page"', async ({ page }) => {
        const { metaRequests } = await openInitialPage(page);
        await page.evaluate((rg) => {
            const box = document.createElement('div');
            box.className = 'jesus2099userjs154481bigbox';
            box.innerHTML = `<a href="/release-group/${rg}" title="Tunnel of Love Express" id="j2-rg" ` +
                'style="display:inline-block;margin:8px"><img alt="Tunnel of Love Express" ' +
                `src="//coverartarchive.org/release-group/${rg}/front-250" style="display:inline;max-height:125px"></a>`;
            (document.getElementById('content') || document.body).prepend(box);
        }, LINKED_RG);
        await page.mouse.move(0, 0);
        await page.locator('#j2-rg img').hover();
        const tip = page.locator('#mb-stat-tooltip');
        await expect(tip.locator('.mb-tt-title')).toHaveText('Tunnel of Love Express');
        await expect(tip.locator('.mb-tt-foot:not(.mb-art-card-keys)')).toHaveText('Click: viewer · Ctrl-click: the release group page');
        expect(metaRequests).toEqual([`https://coverartarchive.org/release-group/${LINKED_RG}`]);
        await page.mouse.move(0, 0);
        await page.locator('#j2-rg img').click();
        await expect(page.locator('#mb-art-viewer .mb-artv-title')).toHaveText('Tunnel of Love Express');
    });

    test('with the artwork card off: nothing stamped, the native title stays', async ({ page }) => {
        const { metaRequests } = await openInitialPage(page, { sa_caa_tip_summary: false });
        const a = page.locator(`${STRIP} > a[href="/release/${FIRST_REL}"]`);
        await page.mouse.move(0, 0);
        await a.locator('img').hover();
        await expect(a).not.toHaveAttribute('data-mbtt-fn', /.*/);
        await expect(page.locator('#mb-stat-tooltip')).toBeHidden();
        await expect(a).toHaveAttribute('title', 'Studio Album');
        expect(metaRequests).toEqual([]);
    });
});

test.describe('FUNKEY strip on the final rendered page: never left in', () => {
    let pageErrors;
    test.beforeEach(({ page }) => {
        pageErrors = [];
        page.on('pageerror', (e) => pageErrors.push(String(e.stack || e.message)));
    });
    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('a strip already on the page goes with the press', async ({ page }) => {
        await routeArchive(page);
        await page.route(`${RG_URL}*`, (r) => r.fulfill({ path: RG_FIXTURE, contentType: 'text/html' }));
        await loadUserscriptPage(page, {
            url: RG_URL, fixtureFile: RG_FIXTURE, testMode: true,
            settingsOverride: { sa_enable_caa_pics: true, sa_enable_relationships_column: false, sa_art_idb_enable: false },
        });
        expect(await runFunkey(page)).toBe(1);
        await page.click(`button[data-label="${RG_LABEL}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await expect(page.locator(STRIP)).toHaveCount(0);
    });

    test('a strip put in after the render (that script\'s timer firing late) is removed', async ({ page }) => {
        await openRendered(page);
        expect(await runFunkey(page), 'the simulated pass found our rendered table').toBeGreaterThan(0);
        await expect(page.locator(STRIP)).toHaveCount(0);
        expect(await stripBeforeATable(page)).toBe(false);
    });

    test('the second press\'s reload: the re-press beats that script\'s timer, its strip is removed', async ({ page }) => {
        await routeArchive(page);
        await page.route(`${RG_URL}*`, (r) => r.fulfill({ path: RG_FIXTURE, contentType: 'text/html' }));
        await page.context().addInitScript(({ key, value }) => {
            if (location.hostname === 'musicbrainz.org' && !window.name.includes('mb-sa-seeded')) {
                sessionStorage.setItem(key, value);
                window.name += ' mb-sa-seeded';
            }
        }, { key: FLAG_KEY, value: JSON.stringify({ label: RG_LABEL, index: 0, href: RG_URL }) });
        await loadUserscriptPage(page, {
            url: RG_URL, fixtureFile: RG_FIXTURE, testMode: true,
            settingsOverride: { sa_enable_caa_pics: true, sa_enable_relationships_column: false, sa_art_idb_enable: false },
        });
        await waitForRenderComplete(page, { waitForAutoResize: false });
        expect(await page.evaluate((k) => sessionStorage.getItem(k), FLAG_KEY), 'the re-press ran').toBeNull();
        expect(await runFunkey(page)).toBeGreaterThan(0);
        await expect(page.locator(STRIP)).toHaveCount(0);
        expect(await stripBeforeATable(page)).toBe(false);
    });

    test('after a disk load, a late strip is removed', async ({ page }) => {
        test.setTimeout(120000);
        await page.route('https://coverartarchive.org/**', (route) => route.fulfill({ status: 404, body: '' }));
        await loadFromDiskFixture(page, {
            url: DISK_URL, fixturePath: DISK_FIXTURE, testMode: true,
            settingsOverride: { sa_enable_caa_pics: true, sa_enable_relationships_column: false },
        });
        expect(await runFunkey(page)).toBeGreaterThan(0);
        await expect(page.locator(STRIP)).toHaveCount(0);
        expect(await stripBeforeATable(page)).toBe(false);
    });

    test('the watcher is spent after that script\'s one pass: a later strip stays', async ({ page }) => {
        await openRendered(page);
        expect(await runFunkey(page)).toBeGreaterThan(0);
        await expect(page.locator(STRIP)).toHaveCount(0);
        // Not that script any more (it never runs twice): a strip put in now
        // proves the observer is no longer live, the cheapness guarantee.
        await page.evaluate(() => {
            const box = document.createElement('div');
            box.className = 'jesus2099userjs154481bigbox';
            box.id = 'j2-later';
            document.body.appendChild(box);
        });
        await page.evaluate(() => new Promise((r) => setTimeout(r, 300)));
        await expect(page.locator('#j2-later')).toHaveCount(1);
    });
});
