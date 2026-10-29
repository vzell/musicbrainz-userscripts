'use strict';

// The entity's pictures beside the name (sa_entity_images, 2026-10-29;
// mockup B2, https://claude.ai/artifact/BL4JPmGMBzfhT7yGKepiBr). vzell: zabe's
// "MusicBrainz Entity Images" userscript shows a label's logo links in the
// sidebar with a drop-down; use the same pictures where we already show one
// (the heading, the preview window), rotating when there are several.
//
// The page is the Columbia label (label-relationships-release-events.html);
// its url-rels are the CBS label's real answer (ws2-images-label-cbs.json,
// scripts/probe-entity-image-rels.py): six logo links, of which four load
// here, one gstatic thumbnail answers 404 and logos-vector.com (http, tried on
// https) refuses. Pinned:
//   1. one url-rels request, a few seconds after load; the four that load
//      beside the name, the two that do not nowhere; ‹ › step, the dots
//      follow; the pictures fade on by themselves; a click opens the viewer on
//      all four at the one shown; the hover card says which of how many;
//   2. zabe's pictures on the page: read, nothing asked;
//   3. the links already known (a window asked them): no request at all;
//   4. switched off: nothing asked, nothing shown.
// The window's own picture strip (B4) is in pop-mb-image.spec.js.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage, addRequiredLibs, MB_LIBRARY_PATH, USERSCRIPT_PATH } = require('../support/loadPage');

const LABEL = '011d1192-6f65-45bd-85c4-0400dd45693e';
const PAGE_URL = `https://musicbrainz.org/label/${LABEL}/relationships`;
const FIXTURE = path.join(__dirname, 'label-relationships-release-events.html');
const CBS = fs.readFileSync(path.join(__dirname, 'ws2-images-label-cbs.json'), 'utf8');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

/**
 * Loads the label page with its url-rels answered from the CBS capture and
 * the six logo hosts served (four load, two do not); logs the Web Service
 * requests and the picture requests by host.
 * @param {import('@playwright/test').Page} page
 * @param {Object} [settings]
 * @returns {Promise<{ws2: string[], hosts: Object<string, number>}>}
 */
async function open(page, settings = {}) {
    const log = { ws2: [], hosts: {} };
    const ctx = page.context();
    await ctx.route('https://static.metabrainz.org/**', (route) => route.abort('blockedbyclient'));
    await ctx.route(/\/ws\/2\//, (route) => {
        const url = route.request().url();
        log.ws2.push(url);
        if (/\/ws\/2\/label\/[0-9a-f-]{36}\?inc=url-rels/.test(url)) return route.fulfill({ status: 200, contentType: 'application/json', body: CBS });
        return route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"no fixture"}' });
    });
    await ctx.route(/^https?:\/\/(?:3\.bp\.blogspot\.com|encrypted-tbn0\.gstatic\.com|seeklogo\.com|www\.brandslex\.de|logos-vector\.com|upload\.wikimedia\.org|commons\.wikimedia\.org)\//, (route) => {
        const u = new URL(route.request().url());
        log.hosts[u.hostname] = (log.hosts[u.hostname] || 0) + 1;
        if (u.hostname === 'logos-vector.com') return route.abort('connectionrefused');
        if (u.hostname === 'encrypted-tbn0.gstatic.com' && /TUdxGVU/.test(u.search)) return route.fulfill({ status: 404, body: '' });
        return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    });
    await loadUserscriptPage(page, {
        url: PAGE_URL, fixtureFile: FIXTURE, testMode: true,
        settingsOverride: { sa_entity_images: true, sa_rich_tooltip_delay_ms: 0, ...settings },
    });
    return log;
}

const avatar = (page) => page.locator('h1 .mb-ei-avatar');
const shown = (page) => avatar(page).getAttribute('data-mb-ei-i');

test.describe('the entity\'s pictures beside the name (sa_entity_images)', () => {
    test('one request; the four logos that load fade from one to the next; ‹ › step; a click opens all four in the viewer', async ({ page }) => {
        const log = await open(page);
        await expect(avatar(page)).toBeVisible({ timeout: 15000 });
        await expect(page.locator('#sidebar')).toHaveAttribute('data-mb-ei', 'asked');
        expect(log.ws2.filter(u => u.includes('inc=url-rels')), 'one url-rels lookup').toHaveLength(1);
        await expect(avatar(page).locator('.mb-ei-clip img')).toHaveCount(4);
        await expect(avatar(page).locator('.mb-ei-dots i')).toHaveCount(4);
        await expect(avatar(page).locator('img[src*="logos-vector"], img[src*="TUdxGVU"]'), 'nothing broken is shown').toHaveCount(0);
        await expect(page.locator('h1 .mb-sb-avatar'), 'one picture box, not two').toHaveCount(1);
        await expect(avatar(page)).toHaveAttribute('aria-label', /4 pictures/);
        // The pictures fade on by themselves (every 6 s).
        expect(await shown(page)).toBe('0');
        await expect.poll(() => shown(page), { timeout: 9000, message: 'the next picture fades in' }).toBe('1');
        // ‹ › step; the dots follow.
        await avatar(page).hover();
        await avatar(page).locator('.mb-ei-next').click();
        expect(await shown(page)).toBe('2');
        await expect(avatar(page).locator('.mb-ei-dots i').nth(2)).toHaveClass(/mb-ei-on/);
        await avatar(page).locator('.mb-ei-prev').click();
        expect(await shown(page)).toBe('1');
        // The hover card: which of how many, where from (a click closes a
        // card, so rest on the picture again, between the arrows).
        await page.mouse.move(0, 0);
        await avatar(page).locator('.mb-ei-clip').hover();
        await expect(page.locator('.mb-tt-liner', { hasText: 'picture 2 of 4' })).toBeVisible();
        await expect(page.locator('.mb-tt-liner .mb-tt-pill', { hasText: 'logo link · encrypted-tbn0.gstatic.com' })).toBeVisible();
        // A click: the viewer, all four, at the one shown.
        await avatar(page).locator('.mb-ei-clip').click();
        await expect(page.locator('#mb-art-viewer')).toBeVisible();
        await expect(page.locator('#mb-art-viewer .mb-artv-pos')).toHaveText('2 / 4');
    });

    test('zabe\'s pictures on the page are read: nothing is asked', async ({ page }) => {
        const log = await open(page);
        // As zabe's script draws them (manifest.json, zabe-entity-image).
        await page.evaluate(() => {
            const box = document.createElement('div');
            box.className = 'entity-image';
            box.innerHTML = '<div class="picture"><img src="https://seeklogo.com/images/D/DISCOS_CBS-logo.png" alt=""></div>' +
                '<div class="picture" hidden=""><img src="https://www.brandslex.de/img/logos/xl/c/logo-cbs-records-02.png" alt=""></div>' +
                '<select id="entity-image-selector"><option>logo relationship</option><option>logo relationship</option></select>';
            document.getElementById('sidebar').prepend(box);
        });
        await expect(avatar(page)).toBeVisible({ timeout: 15000 });
        await expect(avatar(page).locator('.mb-ei-clip img')).toHaveCount(2);
        // Decided on zabe's pictures: the lookup it would make after
        // `_EI_ZABE_WAIT_MS` is never made (the decision is final).
        await expect(page.locator('#sidebar')).toHaveAttribute('data-mb-ei', 'zabe');
        expect(log.ws2.filter(u => u.includes('inc=url-rels')), 'no request of ours').toEqual([]);
    });

    test('links already known (a window asked them): no request at all', async ({ page }) => {
        const log = await open(page);
        await expect(avatar(page)).toBeVisible({ timeout: 15000 });
        expect(log.ws2).toHaveLength(1);
        // A reload: IndexedDB has the links.
        await page.reload();
        await addRequiredLibs(page);
        await page.addScriptTag({ path: MB_LIBRARY_PATH });
        await page.addScriptTag({ path: USERSCRIPT_PATH });
        await expect(avatar(page)).toBeVisible({ timeout: 5000 });
        await expect(page.locator('#sidebar')).toHaveAttribute('data-mb-ei', 'known');
        expect(log.ws2, 'the second page load asks nothing').toHaveLength(1);
    });

    test('switched off: nothing asked, nothing shown', async ({ page }) => {
        const log = await open(page, { sa_entity_images: false });
        // Decided at init: nothing is started, so nothing can come later.
        await expect(page.locator('#sidebar')).toHaveAttribute('data-mb-ei', 'off');
        await expect(avatar(page)).toHaveCount(0);
        expect(log.ws2).toEqual([]);
        expect(log.hosts).toEqual({});
    });
});
