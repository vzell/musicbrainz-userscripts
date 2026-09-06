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

// Same rationale as the describes below: shares this file's fixture, GUID,
// PNG bytes and routing.
test.describe('big-picture stripe skips entities the archive reports as art-less', () => {
    // Guards _artInitBigPics()'s ctx.countCache check specifically, and it has
    // to be a 5xx to do that. The negative image cache (_artMissCache) already
    // suppresses repeat requests for a URL that 404s, and on a real page it
    // gets there first — disabling the countCache check does not change the
    // live BoDeans spec at all, because those URLs 404 and are remembered that
    // way. A 5xx is deliberately NOT miss-cached (the archive fails in bursts;
    // caching that would hide real artwork for the session), so this is the
    // one shape where only the metadata answer can prevent the retry.
    test('an entity whose JSON reports zero images is not re-requested after a re-render', async ({ page }) => {
        await loadUserscriptPage(page, {
            url: ARTIST_EVENTS_URL,
            fixtureFile: FIXTURE_FILE,
            testMode: true,
            settingsOverride: { sa_enable_caa_pics: true, sa_art_idb_enable: false },
        });

        // Metadata: a successful answer that says "this event has no artwork".
        // Image bytes: 503, so nothing may be recorded as a definitive miss.
        await page.route('https://eventartarchive.org/**', async (route) => {
            const url = route.request().url();
            if (new RegExp(`/event/${EVENT_GUID}$`).test(url)) {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ images: [] }),
                });
                return;
            }
            await route.fulfill({ status: 503, contentType: 'text/plain', body: 'upstream sad' });
        });

        await page.click('button[data-label="Show all Events for Artist"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await waitForCaaEaaComplete(page);

        // Counting requests would not isolate this: the icon column re-requests
        // on every render by design (its loads are re-enqueued to re-attach
        // hover listeners), and a 503 is never miss-cached, so those retries are
        // expected noise. What fix this test guards is narrower and directly
        // observable — whether the stripe BUILDS A WRAPPER for an entity it has
        // already been told has no artwork. On the first render it legitimately
        // does (_artInitBigPics() runs before _artEnrichTable(), so the count is
        // not known yet); on every render after that it must not.
        await page.evaluate(() => {
            window.__bigboxWrappersBuilt = 0;
            document.querySelectorAll('.mb-caa-bigbox, .mb-eaa-bigbox').forEach((box) => {
                new MutationObserver((muts) => {
                    for (const m of muts) {
                        for (const node of m.addedNodes) {
                            if (node.nodeType !== 1) continue;
                            if (node.matches('a[data-caa-href], a[data-eaa-href]')) {
                                window.__bigboxWrappersBuilt++;
                            }
                        }
                    }
                }).observe(box, { childList: true, subtree: true });
            });
        });

        // Re-render. By now ctx.countCache holds the 0.
        await page.fill('#mb-global-filter-input', 'e');
        await page.waitForTimeout(1500);
        await page.fill('#mb-global-filter-input', '');
        await page.waitForTimeout(1500);

        expect(
            await page.evaluate(() => window.__bigboxWrappersBuilt),
            'a re-render rebuilt a stripe wrapper for artwork the archive already said does not exist'
        ).toBe(0);
    });
});
test.describe('per-image art <li> hover preview and type-badge tooltip', () => {
    // This wiring had no coverage at all, which made it the riskiest part of
    // splitting _artWireImageLi() out of _artBuildImageLi(): the listeners are
    // attached with addEventListener, so nothing about a broken extraction
    // would show up in the DOM or in any existing assertion. The <li> keeps
    // its thumbnail, its badge and its comment either way — only hovering
    // reveals whether it is still wired.
    test('hovering a per-image thumbnail opens the preview popup and the type tooltip', async ({ page }) => {
        await loadUserscriptPage(page, {
            url: ARTIST_EVENTS_URL,
            fixtureFile: FIXTURE_FILE,
            testMode: true,
            settingsOverride: {
                sa_enable_caa_pics: true,
                sa_art_idb_enable: false,
                sa_caa_hover_preview: true,
            },
        });
        await routeEventArtArchive(page, 0);

        await page.click('button[data-label="Show all Events for Artist"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await waitForCaaEaaComplete(page);

        // Per-image <li>s are built collapsed (display:none); a hidden element
        // is a 0x0 hover target, so the cell has to be expanded first.
        await page.click('[data-caa-expand-btn]');

        const artImg = page.locator('li.mb-caa-art-li-image img').first();
        await expect(artImg).toBeVisible();

        await artImg.hover();

        // Both are anchored to the same mouseenter, so they appear together.
        await expect(page.locator('#mb-art-hover-preview')).toBeVisible();
        const tip = page.locator('#mb-art-bigbox-tooltip');
        await expect(tip).toBeVisible();
        // The fixture's single image is types: ['Front'].
        await expect(tip).toContainText('Front');
    });
});

// Lives in this file rather than its own because it needs the identical
// fixture, event GUID, PNG bytes and eventartarchive routing as the suite
// above — a separate spec would duplicate all of it to assert one thing.
test.describe('CAA/EAA completion pass is independent of the toast setting', () => {
    test('the status-bar segment still appears when the toast duration is 0', async ({ page }) => {
        // _showCaaCompletionToast() used to early-return on
        // sa_caa_completion_toast_duration <= 0 before doing ANY of its work,
        // so switching off a cosmetic toast also switched off the
        // #mb-info-display-caa status segment, the global summary and the
        // stats refresh — and with them waitForCaaEaaComplete()'s own signal.
        // Only the toast may depend on that setting.
        await loadUserscriptPage(page, {
            url: ARTIST_EVENTS_URL,
            fixtureFile: FIXTURE_FILE,
            testMode: true,
            settingsOverride: {
                sa_enable_caa_pics: true,
                sa_art_idb_enable: false,
                sa_caa_completion_toast_duration: 0,
            },
        });
        await routeEventArtArchive(page, 0);

        await page.click('button[data-label="Show all Events for Artist"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });

        // Resolves only if the completion pass ran — this is the assertion
        // that fails (by timeout) without the fix.
        await waitForCaaEaaComplete(page);
        await expect(page.locator('#mb-info-display-caa')).toBeVisible();

        // The toast itself must still honour the setting.
        await expect(page.locator('#mb-caa-completion-toast')).toHaveCount(0);
    });
});
