'use strict';

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// MusicBrainz sidebar sections on a phone (chromium-mobile, Pixel 7: touch,
// no hover): a tap opens a section and the Open all bar works; a tap on a
// link group's heading folds it. Nothing depends on hover.

const URL = 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f?all=1&va=0';
const FIXTURE = path.join(__dirname, 'artist-releasegroups-live-titles.html');

/**
 * Taps near an element's left edge with the touchscreen, after scrolling it
 * to the middle of the screen, left edge in view. \`locator.tap()\` scrolls
 * again by itself, to the top edge, where the sticky page header bar takes the
 * tap; the touchscreen taps where it is told, as a finger does.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} loc
 * @returns {Promise<void>}
 */
async function tapMid(page, loc) {
    const p = await loc.evaluate((el) => {
        el.scrollIntoView({ block: 'center', inline: 'start' });
        const b = el.getBoundingClientRect();
        // Layout-viewport coordinates → the visual viewport a finger taps in.
        const vv = window.visualViewport || { offsetLeft: 0, offsetTop: 0 };
        return { x: b.left + Math.min(12, b.width / 2) - vv.offsetLeft, y: b.top + b.height / 2 - vv.offsetTop };
    });
    await page.touchscreen.tap(p.x, p.y);
}

test('sections and link groups open and fold by tap', async ({ page }) => {
    await loadUserscriptPage(page, {
        url: URL, fixtureFile: FIXTURE, testMode: true,
        settingsOverride: { sa_enable_caa_pics: false, sa_enable_relationships_column: false, sa_collabsable_sidebar: false },
    });
    await page.route(`${URL}*`, (r) => r.fulfill({ path: FIXTURE, contentType: 'text/html' }));
    await page.locator('button[data-label="🧮 Artist RGs"]').tap();
    await waitForRenderComplete(page, { waitForAutoResize: false });
    // The fixture has no MusicBrainz stylesheet; on a phone MusicBrainz lays
    // the sidebar out as a plain block under the content. Without this rule
    // the unstyled sidebar is a sticky block wider than the screen that no
    // tap can reach — a fixture artefact, not something users see.
    await page.addStyleTag({ content: '#sidebar { position: static !important; width: auto !important; }' });
    const ext = page.locator('#sidebar h2.external-links');
    await tapMid(page, ext);
    await expect(ext).toHaveAttribute('aria-expanded', 'true');
    const head = page.locator('#sidebar li.mb-sbl-head[data-mb-sbl-kind="Streaming"]');
    await tapMid(page, head);
    await expect(head).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#sidebar li.spotify-favicon')).toBeHidden();
    await tapMid(page, page.locator('#sidebar [data-mb-sb-all="1"]'));
    const icons = await page.evaluate(() => Array.from(document.querySelectorAll('#sidebar h2 > .mb-toggle-icon')).map((i) => i.textContent));
    expect(new Set(icons)).toEqual(new Set(['▼']));
});
