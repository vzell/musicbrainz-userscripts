'use strict';

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');

// The sidebar picture on a phone (chromium-mobile, Pixel 7: touch, no hover):
// the hover card is a desktop extra; a tap on the copy beside the name opens
// the viewer, so nothing depends on hovering.

const URL = 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f';
const FIXTURE = path.join(__dirname, 'artist-releasegroups-live-titles.html');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

test('a tap on the picture beside the name opens the viewer', async ({ page }) => {
    await page.route('https://upload.wikimedia.org/**', (r) => r.fulfill({ body: PNG, contentType: 'image/png' }));
    await loadUserscriptPage(page, { url: URL, fixtureFile: FIXTURE, testMode: true });
    await page.evaluate(() => {
        const box = document.createElement('div');
        box.className = 'entity-image';
        box.innerHTML = '<div class="picture"><img src="https://upload.wikimedia.org/wikipedia/commons/3/3b/Bruce.jpg" alt=""></div>';
        document.getElementById('sidebar').prepend(box);
    });
    const avatar = page.locator('h1 .mb-sb-avatar');
    await expect(avatar).toHaveCount(1);
    await avatar.tap();
    await expect(page.locator('#mb-art-viewer')).toBeVisible();
});
