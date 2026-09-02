'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { waitForCaaEaaComplete } = require('../support/asyncCompletion');

// artist-events declares addEAA: 'Event' plus a columnExtractors entry that
// splits the native eaa-icon anchor out of "Event" into its own "EAA"
// synthetic column (extractor: 'caa') — the simplest existing pageType that
// reaches _artInitCaaColHeaderToggle()/_artRevealCaaColHeaderButtons().
const ARTIST_EVENTS_URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/events';
const FIXTURE_FILE = path.join(__dirname, 'artist-events-eaa.html');
const EVENT_GUID = '22222222-2222-2222-2222-222222222222';

// 1x1 transparent PNG — real image bytes so <img>.onload actually fires.
const ONE_PX_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64'
);

/**
 * Routes every eventartarchive.org request the CAA/EAA pipeline makes for
 * this fixture: the JSON metadata API (`GET /event/<guid>`, delayed so the
 * test has a window to observe the pre-reveal hidden state) and every image
 * byte request (icon thumbnail, bigbox strip, per-image `<li>` thumbnail —
 * all served the same 1x1 PNG, none of them care about real pixel content).
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} apiDelayMs  Artificial delay before the JSON API responds.
 */
async function routeEventArtArchive(page, apiDelayMs) {
    await page.route('https://eventartarchive.org/**', async (route) => {
        const url = route.request().url();
        // The bare metadata endpoint has no further path segment after the guid;
        // every image request appends /front-NNN or a numbered filename.
        if (new RegExp(`/event/${EVENT_GUID}$`).test(url)) {
            await new Promise((r) => setTimeout(r, apiDelayMs));
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    images: [
                        {
                            image: `https://eventartarchive.org/event/${EVENT_GUID}/1.jpg`,
                            thumbnails: { '250': `https://eventartarchive.org/event/${EVENT_GUID}/1-250.jpg` },
                            types: ['Front'],
                        },
                    ],
                }),
            });
            return;
        }
        await route.fulfill({ status: 200, contentType: 'image/png', body: ONE_PX_PNG });
    });
}

test.describe('CAA/EAA per-column collapse glyph: deferred visibility', () => {
    test('the "EAA" column header glyph stays hidden while artwork metadata is still loading, then reveals once the queue drains', async ({ page }) => {
        // sa_art_idb_enable: false routes _artLoadIcon through the plain
        // native <img> fallback path instead of IndexedDB, so page.route()
        // alone covers every request this test needs to intercept.
        await loadUserscriptPage(page, {
            url: ARTIST_EVENTS_URL,
            fixtureFile: FIXTURE_FILE,
            testMode: true,
            settingsOverride: { sa_enable_caa_pics: true, sa_art_idb_enable: false },
        });
        await routeEventArtArchive(page, 600);

        await page.click('button[data-label="Show all Events for Artist"]');

        // Initial render completes synchronously in the same JS execution burst
        // that creates the (still-hidden) header glyph — see browser.js's own
        // waitForRenderComplete() JSDoc for why this is safe to assert on
        // immediately without a race. hasCaaOrEaa is deliberately omitted
        // (default false) so this does NOT also wait for the CAA/EAA queue —
        // that's the whole point of checking the pre-reveal state here.
        await waitForRenderComplete(page, { waitForAutoResize: false });

        const hdrBtnDuringLoad = page.locator('.mb-caa-col-hdr-btn[data-caa-ctx="eaa"]');
        await expect(hdrBtnDuringLoad).toHaveCount(1);
        await expect(hdrBtnDuringLoad).toBeHidden();
        await expect(hdrBtnDuringLoad).toHaveAttribute('data-mb-caa-col-hdr-ready', '0');

        // Now let the (artificially delayed) JSON API respond and the whole
        // _caaQueue drain — _artRevealCaaColHeaderButtons() runs synchronously
        // inside the same onIdle callback as the #mb-info-display-caa update,
        // so waiting for this also guarantees the glyph has been revealed.
        await waitForCaaEaaComplete(page);

        await expect(hdrBtnDuringLoad).toBeVisible();
        await expect(hdrBtnDuringLoad).toHaveAttribute('data-mb-caa-col-hdr-ready', '1');
    });
});
