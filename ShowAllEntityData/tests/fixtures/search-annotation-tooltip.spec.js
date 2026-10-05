'use strict';

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// The artwork hover card (#mb-art-bigbox-tooltip) on search?type=annotation.
// Before 'Annotations' had a tooltipColumns spec the card showed the entity
// name only. Now it shows Type, title, comment/alias and, below a rule, the
// Annotation — as the cell's own markup, in full.
//
// The Annotation cannot go through the generic _artTooltipCellText() path,
// and each test below pins one way that path (or a naive clone) gets it wrong:
//   - flattened: every <br>/paragraph collapses into one line;
//   - single link: an annotation with exactly one link is reduced to the
//     link text (the single-anchor shortcut);
//   - collapsed: the cell's height clamp and the inline display:none on a
//     collapsed nested wiki <h2> section come along with a clone;
//   - filter highlights come along with a clone too;
//   - the card cannot scroll, so a long annotation must be cut to the window;
//   - the card is a singleton, so its 600px width must not outlive the card.
//
// Fixture: scripts/build-search-annotation-fixture.py (4 Release rows; two of
// them hand-shaped, documented there).

const SEARCH_URL =
    'https://musicbrainz.org/search?query=Barcode+and+other+i&type=annotation&limit=25&method=indexed';
const FIXTURE = path.join(__dirname, 'search-annotation-tooltip.html');
const BUTTON = 'Show all Search Results for Annotations';

const BOSS = '/release/13bcbdc0-7785-4dde-9f8e-f1159f5e46f6';    // two paragraphs
const TUNNEL = '/release/202c3b35-a273-4424-a1cf-8b9da15509ef';  // nested wiki <h2>
const ROMEO = '/release/ae58eef4-6d5a-47ac-931c-cd4723b3c0ee';   // exactly one link
const LONG = '/release/0d22b816-0089-42f4-acd1-26e39b14d421';    // 80 extra paragraphs

// 1x1 transparent PNG — real image bytes so <img>.onload actually fires.
const ONE_PX_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64'
);

// IDB off: every image request goes through the native <img> path, which
// page.route() covers. Same settings as bigbox-tooltip.spec.js.
const SETTINGS = {
    sa_enable_caa_pics: true,
    sa_caa_pics_big: true,
    sa_caa_pics_initially_collapsed: false,
    sa_art_idb_enable: false,
    sa_caa_hover_preview: false,
    sa_enable_relationships_column: false,
};

/**
 * Serves every Cover Art Archive request: the JSON metadata endpoint with one
 * Front image, and every image request with the 1x1 PNG.
 *
 * @param {import('@playwright/test').Page} page
 */
async function routeArchive(page) {
    await page.route('https://coverartarchive.org/**', async (route) => {
        const url = route.request().url();
        const m = url.match(/\/(release|release-group)\/([0-9a-f-]{36})\/?$/);
        if (m) {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    images: [{
                        image: `https://coverartarchive.org/${m[1]}/${m[2]}/1.jpg`,
                        thumbnails: { '250': `https://coverartarchive.org/${m[1]}/${m[2]}/1-250.jpg` },
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
 * Loads the fixture, runs the "Show all" button and waits until the strip
 * holds a loaded image for every row.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string[]} errors - collects uncaught page errors
 */
async function open(page, errors) {
    page.on('pageerror', (e) => errors.push(e.message));
    await loadUserscriptPage(page, {
        url: SEARCH_URL, fixtureFile: FIXTURE, testMode: true, settingsOverride: SETTINGS,
    });
    await routeArchive(page);
    // A search page is always re-fetched over the network on "Show all".
    await page.route('https://musicbrainz.org/search**', (route) =>
        route.fulfill({ path: FIXTURE, contentType: 'text/html' }));
    await page.click(`button[data-label="${BUTTON}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
    await expect(page.locator('.mb-caa-bigbox a img')).toHaveCount(4);
}

/**
 * Hovers the strip image for `href` and returns what the card shows.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} href - the release path the strip wrapper points at
 * @returns {Promise<Object>} card state
 */
async function hoverStrip(page, href) {
    const wrapper = page.locator(`.mb-caa-bigbox a[data-caa-href="${href}"]`);
    // A 1x1 PNG leaves a 1 px hover target; give it a real size (test-only).
    await wrapper.evaluate((a) => {
        const img = a.querySelector('img');
        if (img) { img.style.width = '48px'; img.style.height = '48px'; }
    });
    await wrapper.scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    await wrapper.hover();
    await expect(page.locator('#mb-art-bigbox-tooltip')).toBeVisible();
    return readCard(page);
}

/**
 * Reads the visible card's state.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object>} card state
 */
function readCard(page) {
    return page.evaluate(() => {
        const t = document.getElementById('mb-art-bigbox-tooltip');
        const block = t.querySelector('.mb-tt-annotation');
        const more = t.querySelector('.mb-tt-annotation-more');
        const r = t.getBoundingClientRect();
        return {
            display: t.style.display,
            maxWidth: t.style.maxWidth,
            text: t.textContent,
            children: Array.from(t.children).map((c) => c.className),
            title: (t.querySelector('.mb-tt-title') || {}).textContent || '',
            hasBlock: !!block,
            blockText: block ? block.innerText : '',
            blockHtml: block ? block.innerHTML : '',
            hiddenInBlock: block
                ? Array.from(block.querySelectorAll('*')).filter((e) => getComputedStyle(e).display === 'none').length
                : -1,
            highlights: t.querySelectorAll('.mb-global-filter-highlight, .mb-column-filter-highlight').length,
            moreShown: !!more && getComputedStyle(more).display !== 'none',
            rect: { top: r.top, bottom: r.bottom, height: r.height },
            vh: window.innerHeight,
        };
    });
}

test.describe('search?type=annotation: artwork hover card', () => {
    test('shows Type, title, a rule and the Annotation with its line structure, in a wide card', async ({ page }) => {
        const errors = [];
        await open(page, errors);
        const c = await hoverStrip(page, BOSS);
        expect(errors).toEqual([]);
        expect(c.display).toBe('block');
        expect(c.children[0]).toBe('');                // Type: a plain row first
        expect(c.text.startsWith('Release')).toBe(true);
        expect(c.title).toBe('If I Were the Boss: The Songs of Bruce Springsteen');
        expect(c.children).toContain('mb-tt-rule');
        expect(c.hasBlock).toBe(true);
        // Not flattened: the markup's paragraphs and breaks survive...
        expect(c.blockHtml).toMatch(/<p>/);
        expect(c.blockHtml).toMatch(/<br>/);
        // ...and so do the lines they produce.
        expect(c.blockText).toMatch(/Notes:\s*\n\s*Made In The EU/);
        expect(c.blockText).toMatch(/Rights Society: MCPS\s*\n\s*Label Code: LC 6448/);
        expect(c.maxWidth).toBe('600px');
        expect(c.moreShown).toBe(false);
    });

    test('the Annotation is complete while the cell is clamped and its wiki sub-section collapsed', async ({ page }) => {
        const errors = [];
        await open(page, errors);
        // Precondition: the cell really is collapsed, both ways.
        const state = await page.evaluate((href) => {
            const a = document.querySelector(`table.tbl tbody td a[href="${href}"]`);
            const td = a.closest('tr').querySelector('.mb-text-clamp-marker');
            const h2 = td.querySelector('h2');
            const after = h2.nextElementSibling;
            return {
                clamped: td.classList.contains('mb-text-clamp-inner') &&
                         !td.classList.contains('mb-text-clamp-expanded'),
                sectionHidden: getComputedStyle(after).display === 'none',
                sectionText: after.textContent,
            };
        }, TUNNEL);
        expect(state.clamped).toBe(true);
        expect(state.sectionHidden).toBe(true);
        expect(state.sectionText).toContain('5099746027049');

        const c = await hoverStrip(page, TUNNEL);
        expect(errors).toEqual([]);
        expect(c.blockText).toContain('Cassette tape type I (ferric).');
        expect(c.blockText).toContain('Barcode and Other Identifiers');
        expect(c.blockText).toContain('Barcode (Scanned): 5099746027049');
        expect(c.hiddenInBlock).toBe(0);
        // The section heading's toggle glyph is the script's UI, not annotation text.
        expect(c.blockText).not.toMatch(/[▲▼]/);
        expect(c.blockHtml).not.toContain('mb-text-clamp');
    });

    test('an annotation with exactly one link keeps the text around the link', async ({ page }) => {
        const errors = [];
        await open(page, errors);
        const c = await hoverStrip(page, ROMEO);
        expect(errors).toEqual([]);
        expect(c.blockText).toContain('The barcode found on Discogs is different (724356982628)');
        expect(c.blockText).toContain('Other data match perfectly');
    });

    test('filter highlights in the cell are not copied into the card', async ({ page }) => {
        const errors = [];
        await open(page, errors);
        await page.fill('#mb-global-filter-input', 'Made In The EU');
        await expect(page.locator('table.tbl tbody tr:visible')).toHaveCount(1);
        await expect(page.locator('table.tbl tbody .mb-global-filter-highlight').first()).toBeVisible();
        const c = await hoverStrip(page, BOSS);
        expect(errors).toEqual([]);
        expect(c.highlights).toBe(0);
        expect(c.blockText).toMatch(/Notes:\s*\n\s*Made In The EU/);
    });

    test('a long annotation is cut to the window and says so', async ({ page }) => {
        const errors = [];
        await page.setViewportSize({ width: 1280, height: 600 });
        await open(page, errors);
        const c = await hoverStrip(page, LONG);
        expect(errors).toEqual([]);
        expect(c.rect.top).toBeGreaterThanOrEqual(0);
        expect(c.rect.bottom).toBeLessThanOrEqual(c.vh);
        expect(c.moreShown).toBe(true);
        expect(c.text).toContain('more in the cell');
        // The cut is visual only: the whole text is still in the block.
        expect(c.blockHtml).toContain('Liner note line 80 of the long annotation.');

        // A short annotation afterwards is neither cut nor footed.
        const s = await hoverStrip(page, BOSS);
        expect(s.moreShown).toBe(false);
    });

    test('the 600px width does not outlive the Annotation card', async ({ page }) => {
        const errors = [];
        await open(page, errors);
        expect((await hoverStrip(page, BOSS)).maxWidth).toBe('600px');
        // Empty one row's Annotation cell: its card has no Annotation block,
        // so the singleton must fall back to the standard width.
        await page.evaluate((href) => {
            const a = document.querySelector(`table.tbl tbody td a[href="${href}"]`);
            const td = a.closest('tr').querySelector('.mb-text-clamp-marker').closest('td');
            td.innerHTML = '';
        }, ROMEO);
        const c = await hoverStrip(page, ROMEO);
        expect(errors).toEqual([]);
        expect(c.hasBlock).toBe(false);
        expect(c.maxWidth).toBe('380px');
    });

    test('the inline thumbnail in the Name cell shows the same Annotation card', async ({ page }) => {
        const errors = [];
        await open(page, errors);
        const ph = page.locator(`table.tbl tbody tr:has(td a[href="${BOSS}"]) .mb-caa-inline-ph`).first();
        await expect(ph).toBeVisible();
        await page.mouse.move(0, 0);
        await ph.hover();
        await expect(page.locator('#mb-art-bigbox-tooltip')).toBeVisible();
        const c = await readCard(page);
        expect(errors).toEqual([]);
        expect(c.title).toBe('If I Were the Boss: The Songs of Bruce Springsteen');
        expect(c.blockText).toMatch(/Notes:\s*\n\s*Made In The EU/);
        expect(c.maxWidth).toBe('600px');
    });

    test('the inline thumbnail card is cut to the window too (its own positioning code)', async ({ page }) => {
        const errors = [];
        await page.setViewportSize({ width: 1280, height: 600 });
        await open(page, errors);
        const ph = page.locator(`table.tbl tbody tr:has(td a[href="${LONG}"]) .mb-caa-inline-ph`).first();
        await ph.scrollIntoViewIfNeeded();
        await page.mouse.move(0, 0);
        await ph.hover();
        await expect(page.locator('#mb-art-bigbox-tooltip')).toBeVisible();
        const c = await readCard(page);
        expect(errors).toEqual([]);
        expect(c.rect.top).toBeGreaterThanOrEqual(0);
        expect(c.rect.bottom).toBeLessThanOrEqual(c.vh);
        expect(c.moreShown).toBe(true);
    });
});
