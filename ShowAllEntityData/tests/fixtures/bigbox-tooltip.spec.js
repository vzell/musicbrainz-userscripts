'use strict';

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { injectThirdPartyScript } = require('../support/thirdPartyScripts');

// The rich hover tooltip (#mb-art-bigbox-tooltip) on the CAA/EAA big-picture
// strip above each table. Until this file, no spec hovered a STRIP image on
// any page — only the per-image <li> (caa-col-hdr-deferred-visibility) and
// the inline thumbnail (user-ratings-multigroup) — so the strip tooltip could
// stop working on one table mode while it kept working on the other.
//
// Two arms: artist-events (tableMode 'single', EAA) and releasegroup-releases
// (tableMode 'multi', CAA).
//
// The third test pins the 2026-10-04 regression: with "Right Side Flags
// Everywhere" installed, the release-group strip showed NO tooltip at all.
// That script wraps the native Country/Date anchor in a new
// span.mfe-flag-wrapper, so the anchor is no longer a direct child of
// span.flag, and _artTooltipCountryDate()'s
// flagClone.insertBefore(a.firstChild, a) threw — before the handler reached
// display:block. artist-events renders Location instead (a.replaceWith), so it
// never hit it.

const EVENTS_URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/events';
const EVENTS_FIXTURE = path.join(__dirname, 'artist-events-eaa.html');

const RG_URL = 'https://musicbrainz.org/release-group/aaaaaaaa-0000-0000-0000-000000000002';
const RG_FIXTURE = path.join(__dirname, 'releasegroup-releases-live-titles.html');

// 1x1 transparent PNG — real image bytes so <img>.onload actually fires.
const ONE_PX_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64'
);

// IDB off: every image request goes through the native <img> path, which
// page.route() covers (the IDB path goes through the GM_xmlhttpRequest stub).
const SETTINGS = {
    sa_enable_caa_pics: true,
    sa_caa_pics_big: true,
    sa_caa_pics_initially_collapsed: false,
    sa_art_idb_enable: false,
    sa_caa_hover_preview: false,
    sa_enable_relationships_column: false,
};

/**
 * Serves every Cover/Event Art Archive request: the JSON metadata endpoint
 * (`/<entity>/<guid>`) with one Front image, and every image request with the
 * 1x1 PNG.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} host - `coverartarchive.org` or `eventartarchive.org`.
 */
async function routeArchive(page, host) {
    await page.route(`https://${host}/**`, async (route) => {
        const url = route.request().url();
        const m = url.match(/\/(release|release-group|event)\/([0-9a-f-]{36})\/?$/);
        if (m) {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    images: [{
                        image: `https://${host}/${m[1]}/${m[2]}/1.jpg`,
                        thumbnails: { '250': `https://${host}/${m[1]}/${m[2]}/1-250.jpg` },
                        types: ['Front'],
                    }],
                }),
            });
            return;
        }
        await route.fulfill({ status: 200, contentType: 'image/png', body: ONE_PX_PNG });
    });
}

/**
 * Loads a fixture page, runs its "Show all" button, expands every sub-table,
 * and waits until the first strip holds a loaded image.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{url: string, fixture: string, button: string, host: string,
 *          boxSel: string, settings?: Object}} o
 */
async function open(page, o) {
    await loadUserscriptPage(page, {
        url: o.url, fixtureFile: o.fixture, testMode: true,
        settingsOverride: { ...SETTINGS, ...(o.settings || {}) },
    });
    await routeArchive(page, o.host);
    await page.click(`button[data-label="${o.button}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
    const master = page.locator('.mb-master-toggle');
    if (await master.count() && (await master.getAttribute('data-state')) === 'collapsed') {
        await master.click();
    }
    await expect(page.locator(`${o.boxSel} a img`).first()).toBeVisible();
}

/**
 * Hovers the first strip wrapper and returns what the tooltip shows, plus
 * what is under the pointer, for diagnosis.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} boxSel
 * @returns {Promise<{display: string, text: string, topEl: string}>}
 */
async function hoverFirstStripImage(page, boxSel) {
    const wrapper = page.locator(`${boxSel} a`).first();
    // The served image is a 1x1 PNG, which leaves a 1 px wide hover target;
    // under a parallel run a late layout shift made the pointer land beside
    // it. Give the image a real size (test-only styling; the tooltip code
    // never reads it), then hover the settled box.
    await wrapper.evaluate((a) => {
        const img = a.querySelector('img');
        if (img) { img.style.width = '48px'; img.style.height = '48px'; }
    });
    await wrapper.scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    await wrapper.hover();
    await page.waitForTimeout(100);
    return page.evaluate((sel) => {
        const a = document.querySelector(`${sel} a`);
        const r = a.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        const tip = document.getElementById('mb-art-bigbox-tooltip');
        return {
            display: tip ? tip.style.display : '(no tip element)',
            text: tip ? tip.textContent : '',
            topEl: top ? `${top.tagName}#${top.id}.${top.className}` : 'null',
            rect: `${r.width}x${r.height}@${r.left},${r.top}`,
        };
    }, boxSel);
}

test.describe('big-picture strip: rich hover tooltip', () => {
    test('artist-events (single-table, EAA): hovering a strip image shows the tooltip', async ({ page }) => {
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await open(page, {
            url: EVENTS_URL, fixture: EVENTS_FIXTURE, host: 'eventartarchive.org',
            button: 'Show all Events for Artist', boxSel: '.mb-eaa-bigbox',
        });
        const res = await hoverFirstStripImage(page, '.mb-eaa-bigbox');
        expect(errors).toEqual([]);
        expect(res.display).toBe('block');
        expect(res.text.trim()).not.toBe('');
    });

    test('releasegroup-releases (multi-table, CAA): hovering a strip image shows the tooltip', async ({ page }) => {
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await open(page, {
            url: RG_URL, fixture: RG_FIXTURE, host: 'coverartarchive.org',
            button: 'Show all Releases for ReleaseGroup', boxSel: '.mb-caa-bigbox',
        });
        const res = await hoverFirstStripImage(page, '.mb-caa-bigbox');
        expect(errors).toEqual([]);
        expect(res.display).toBe('block');
        expect(res.text.trim()).not.toBe('');
        // The "Liner notes" card: cream background, serif face, bold title.
        const look = await page.evaluate(() => {
            const t = document.getElementById('mb-art-bigbox-tooltip');
            const cs = getComputedStyle(t);
            return { bg: cs.backgroundColor, font: cs.fontFamily, title: !!t.querySelector('.mb-tt-title') };
        });
        expect(look.bg).toBe('rgb(251, 248, 241)');
        expect(look.font).toContain('Georgia');
        expect(look.title).toBe(true);
    });

    test('an inline CAA thumbnail: its own title opens no "Liner notes" card over the preview and cover-art card', async ({ page }) => {
        // Reported 2026-10-04 with a screenshot: the thumbnail's title ("8
        // images found for this release / release-group") was drawn as a
        // third box on top of its own art preview.
        await open(page, {
            url: RG_URL, fixture: RG_FIXTURE, host: 'coverartarchive.org',
            button: 'Show all Releases for ReleaseGroup', boxSel: '.mb-caa-bigbox',
            settings: { sa_caa_hover_preview: true, sa_rich_tooltip_delay_ms: 0 },
        });
        const ph = page.locator('table.tbl tbody .mb-caa-inline-ph[data-mb-tip][title]').first();
        await expect(ph).toHaveCount(1);
        await ph.evaluate((el) => { el.style.minWidth = '24px'; el.style.minHeight = '24px'; el.style.display = 'inline-block'; });
        const box = await ph.boundingBox();
        await page.mouse.move(0, 0);
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 3 });

        await expect(page.locator('#mb-art-bigbox-tooltip')).toBeVisible();
        await page.waitForTimeout(400);
        await expect(page.locator('#mb-stat-tooltip')).toBeHidden();
        // ...and the browser gets no title to draw its grey box from either.
        expect(await ph.getAttribute('title')).toBe('');
        await page.mouse.move(0, 0);
        expect(await ph.getAttribute('title')).not.toBe('');
    });

    test('releasegroup-releases with "Right Side Flags Everywhere": the tooltip still shows, Country/Date line included', async ({ page }) => {
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await open(page, {
            url: RG_URL, fixture: RG_FIXTURE, host: 'coverartarchive.org',
            button: 'Show all Releases for ReleaseGroup', boxSel: '.mb-caa-bigbox',
        });
        // The real script re-decorates after every render via a
        // MutationObserver; the rows the tooltip reads are the live ones.
        await injectThirdPartyScript(page, 'rsfe-flags');
        expect(await page.locator('table.tbl span.flag span.mfe-flag-wrapper > a').count()).toBeGreaterThan(0);

        const res = await hoverFirstStripImage(page, '.mb-caa-bigbox');
        expect(errors).toEqual([]);
        expect(res.display).toBe('block');
        // The Country/Date line comes after the Format line, so its presence
        // also proves the render ran past the point that used to throw; the
        // Label line comes after it.
        expect(res.text).toContain('United States (US)');
        expect(res.text).toContain('Test Label');

        // One flag, not two: the clone keeps the script's sprite
        // neutralization, so its own <img> is the only flag drawn.
        const flag = await page.evaluate(() => {
            const f = document.querySelector('#mb-art-bigbox-tooltip [class*="flag-"]');
            return f ? {
                bg: f.style.getPropertyValue('background-image'),
                img: !!f.querySelector('img.mb-hq-flag-img'),
                anchor: !!f.querySelector('a'),
            } : null;
        });
        expect(flag).toEqual({ bg: 'none', img: true, anchor: false });
    });
});
