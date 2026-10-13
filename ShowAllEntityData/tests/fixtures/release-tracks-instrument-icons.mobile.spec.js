'use strict';

// release-tracks × "MusicBrainz: Instrument Icons Everywhere" on a touch
// device (chromium-mobile: Pixel 7 emulation, touch, no hover). The desktop
// spec (release-tracks-instrument-icons.spec.js) pins the guarantees; this
// one checks they hold where the 📊 panel is opened by a TAP: the
// Instruments column shows the icons, and the panel's "» instrument:" entry
// shows the instrument's icon after its label.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { injectThirdPartyScript } = require('../support/thirdPartyScripts');

const RELEASE_URL = 'https://musicbrainz.org/release/3ce46b79-5e8c-470a-bcdc-45f301d09f60';
const FIXTURE = path.join(__dirname, 'release-tracks-instrument-icons.html');
const PIANO = 'b3eac5f9-7859-4416-ac39-7154e2e8d348';

test('Instruments column and its 📊 "» instrument:" entry show the icon (tap)', async ({ page }) => {
    // A freshly fetched release fixture names CURRENT static.metabrainz.org
    // bundles, which would download and re-render the tracklist from JSON
    // (docs/claude/release-tracks-and-length.md, "Fixture trap").
    await page.context().route('https://static.metabrainz.org/**', (route) => route.abort('blockedbyclient'));
    await injectThirdPartyScript(page, 'ii-instrument-icons', { when: 'init', config: { icons: { [PIANO]: 'piano' } } });
    await loadUserscriptPage(page, {
        url: RELEASE_URL,
        fixtureFile: FIXTURE,
        testMode: true,
        settingsOverride: { sa_enable_release_tracks: true },
    });
    await page.tap('button[data-label="Show all Tracks for Release"]');
    await expect(page.locator('#mb-filter-container')).toBeAttached();

    const pianoIcons = await page.evaluate(() => {
        const tbl = document.querySelector('table.tbl');
        const idx = Array.from(tbl.querySelectorAll('thead tr:first-child th')).findIndex((t) => t.dataset.colName === 'Instruments');
        return Array.from(tbl.querySelectorAll('tbody tr')).flatMap((tr) => Array.from(tr.cells[idx].querySelectorAll('a.mb-credit-instrument')))
            .filter((a) => a.textContent.trim() === 'piano')
            .map((a) => !!(a.previousSibling && a.previousSibling.nodeType === 1 && a.previousSibling.matches('img.mb-ii-icon')));
    });
    expect(pianoIcons.length).toBeGreaterThan(0);
    expect(pianoIcons.every(Boolean)).toBe(true);

    // Centred first: scrolled only to the viewport edge, the button sits
    // under the sticky Title column, which then takes the tap.
    const wrap = page.locator('table.tbl thead th[data-col-name="Instruments"] .mb-col-uniq-wrap').first();
    // locator.tap() re-scrolls to the edge on its own, so tap the
    // centred box through the touchscreen instead.
    await wrap.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'center' }));
    const box = await wrap.boundingBox();
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    const entry = page.locator('#mb-col-uniq-dropdown .mb-col-uniq-item[data-mb-uniq-syn-label="» instrument: piano"]');
    await expect(entry).toHaveCount(1);
    await expect(entry.locator('.mb-uniq-ii-icon img.mb-ii-icon')).toHaveAttribute('title', 'piano');
});
