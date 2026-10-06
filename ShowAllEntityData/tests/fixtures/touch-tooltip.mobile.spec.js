'use strict';

// Hover tooltips on a touch device (org/mobile.org, bug 1). Runs in the
// chromium-mobile project (Pixel 7: hasTouch, no hover, coarse pointer).
//
// ── The bug ─────────────────────────────────────────────────────────────────
//
// A tap fires compatibility mouse events (mouseover, mouseenter, …, click) but
// no mouseout/mouseleave until something else is tapped. Every floating
// tooltip shown on hover therefore stayed on screen after a tap: on Firefox
// Android the h1 action button's rich #mb-stat-tooltip hung over the page
// after the fetch had rendered, clipped at the right edge.
//
// ── What this spec pins ─────────────────────────────────────────────────────
//
// "A tap never SHOWS a floating tooltip" (see watchShown()), per hover system the guard
// (_isTouchCompatMouseEvent()) was added to. Each test first proves its
// premise, that the tap really delivered the compatibility mouseover (or
// mouseenter) to the element, because a tap that never reached the element
// would leave the tooltip hidden too. Each one then checks that a REAL MOUSE
// hover in the same mobile context still shows the tooltip, so "never show
// anything" cannot pass. The desktop behaviour is pinned separately, by
// action-button-shortlabel-and-rich-tooltip.spec.js and
// caa-col-hdr-deferred-visibility.spec.js in chromium-fixtures.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { waitForCaaEaaComplete } = require('../support/asyncCompletion');

const ISWC_URL = 'https://musicbrainz.org/iswc/T-070.127.339-3';
const ISWC_FIXTURE = path.join(__dirname, 'iswc.html');
const ISWC_BUTTON = '#mb-show-all-controls-container button[data-label="Show all Works"]';

const ARTIST_EVENTS_URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/events';
const ARTIST_EVENTS_FIXTURE = path.join(__dirname, 'artist-events-eaa.html');
const EVENT_GUID = '22222222-2222-2222-2222-222222222222';

// 1x1 transparent PNG — real image bytes so <img>.onload actually fires.
const ONE_PX_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64'
);

// Longer than TOUCH_COMPAT_WINDOW_MS (800 ms), so a mouse hover that follows a
// tap is attributed to the mouse again.
const PAST_TOUCH_WINDOW_MS = 1000;

/**
 * Serves every eventartarchive.org request for the artist-events fixture: the
 * JSON metadata of its one event (a single Front image) and a 1x1 PNG for
 * every image request. Same routing as caa-col-hdr-deferred-visibility.spec.js.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function routeEventArtArchive(page) {
    await page.route('https://eventartarchive.org/**', async (route) => {
        const url = route.request().url();
        if (new RegExp(`/event/${EVENT_GUID}$`).test(url)) {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    images: [{
                        image: `https://eventartarchive.org/event/${EVENT_GUID}/1.jpg`,
                        thumbnails: { '250': `https://eventartarchive.org/event/${EVENT_GUID}/1-250.jpg` },
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
 * Records, on `window.__seen`, which of `types` reached an element matching
 * `selector`, so a test can prove that a tap delivered its compatibility
 * mouse events to the element.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string}   selector - CSS selector of the tapped element
 * @param {string[]} types    - event types to record
 * @returns {Promise<void>}
 */
const recordEvents = (page, selector, types) => page.evaluate(({ sel, evTypes }) => {
    window.__seen = {};
    evTypes.forEach((t) => document.addEventListener(t, (e) => {
        if (e.target instanceof Element && e.target.closest(sel)) window.__seen[t] = true;
    }, true));
}, { sel: selector, evTypes: types });

/**
 * Starts recording, on `window.__everShown`, every floating tooltip in `ids`
 * that is displayed at any moment from now on — including one shown and
 * hidden again within the same tap. Under Chromium's emulation a tap on an
 * artwork thumbnail ends with mouseout/mouseleave (the popup opens under the
 * touch point), which hides the tooltip again. So "hidden afterwards" cannot
 * tell a guarded handler from an unguarded one. Firefox Android sends no
 * such mouseleave (org/mobile.org, Image #10). The property pinned is
 * therefore "a tap never SHOWS it". `attributeOldValue` keeps every
 * intermediate style value, so a show undone before the observer callback
 * runs is still caught.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string[]} ids - element ids of the tooltips to watch
 * @returns {Promise<void>}
 */
const watchShown = (page, ids) => page.evaluate((tipIds) => {
    window.__everShown = [];
    const shown = (el) => el && el.style.display && el.style.display !== 'none';
    const note = (id) => { if (!window.__everShown.includes(id)) window.__everShown.push(id); };
    new MutationObserver((records) => {
        records.forEach((r) => {
            const id = r.target && r.target.id;
            if (r.type === 'attributes' && tipIds.includes(id)
                && /display:\s*(?!none\b)[a-z]/.test(r.oldValue || '')) note(id);
        });
        tipIds.forEach((id) => { if (shown(document.getElementById(id))) note(id); });
    }).observe(document.body, {
        subtree: true, childList: true, attributes: true, attributeFilter: ['style'], attributeOldValue: true,
    });
}, ids);

/**
 * Hovers `locator` with the real mouse. The pointer is moved off to a far
 * corner first: after a tap the browser's own pointer already rests on the
 * tapped spot, so moving "there" would be no transition and fire no
 * mouseover at all.
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} locator
 * @returns {Promise<void>}
 */
async function mouseHover(page, locator) {
    const vp = page.viewportSize();
    await page.mouse.move(vp.width - 2, vp.height - 2);
    const box = await locator.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
}

test.describe('hover tooltips on a touch device', () => {
    test('tapping an h1 action button leaves no rich tooltip behind; a mouse hover still shows it', async ({ page }) => {
        expect(await page.evaluate(() => matchMedia('(hover: none) and (pointer: coarse)').matches),
            'premise: the project emulates a touch-primary device').toBe(true);

        await loadUserscriptPage(page, { url: ISWC_URL, fixtureFile: ISWC_FIXTURE, testMode: true });
        const btn = page.locator(ISWC_BUTTON);
        const tip = page.locator('#mb-stat-tooltip');
        await expect(btn).toBeVisible();

        // The tap must not start a fetch: the tooltip question is independent
        // of it, and a fetch would replace the page under the test. A
        // capture-phase document listener runs before the button's onclick.
        await page.evaluate((sel) => document.addEventListener('click', (e) => {
            if (e.target instanceof Element && e.target.closest(sel)) {
                e.stopPropagation();
                e.preventDefault();
                window.__tapClicked = true;
            }
        }, true), ISWC_BUTTON);
        await recordEvents(page, ISWC_BUTTON, ['pointerdown', 'mouseover']);
        await watchShown(page, ['mb-stat-tooltip']);

        await btn.tap();
        await expect.poll(() => page.evaluate(() => !!window.__tapClicked)).toBe(true);
        const seen = await page.evaluate(() => window.__seen);
        expect(seen.pointerdown, 'premise: the tap reached the button as a touch').toBe(true);
        expect(seen.mouseover, 'premise: the tap fired a compatibility mouseover').toBe(true);

        // Give a stray show/position pass every chance to land.
        await page.waitForTimeout(300);
        expect(await page.evaluate(() => window.__everShown), 'tooltips the tap showed').toEqual([]);
        await expect(tip).toBeHidden();
        // Nothing to restore: the native title was never blanked.
        expect(await btn.getAttribute('title')).toContain('Fetch all the table data');

        // Control: a real mouse in the same context still gets the tooltip.
        await page.waitForTimeout(PAST_TOUCH_WINDOW_MS);
        await mouseHover(page, btn);
        await expect(tip).toBeVisible();
        await expect(tip).toContainText('Works');
    });

    test('tapping a button with its own "Liner notes" tooltip shows no card and keeps its title; a mouse hover still shows it', async ({ page }) => {
        await loadUserscriptPage(page, {
            url: ISWC_URL, fixtureFile: ISWC_FIXTURE, testMode: true,
            settingsOverride: { sa_rich_tooltip_delay_ms: 0 },
        });
        await page.locator(ISWC_BUTTON).evaluate((b) => b.click());
        await waitForRenderComplete(page, { waitForAutoResize: false });

        const SETTINGS_BTN = '#mb-settings-btn[data-mb-tip]';
        const btn = page.locator(SETTINGS_BTN);
        const tip = page.locator('#mb-stat-tooltip');
        await expect(btn).toBeVisible();
        const title = await btn.getAttribute('title');
        expect(title).toContain('settings manager');

        // Keep the tap from opening the settings dialog over the page.
        await page.evaluate((sel) => document.addEventListener('click', (e) => {
            if (e.target instanceof Element && e.target.closest(sel)) {
                e.stopPropagation();
                e.preventDefault();
                window.__tapClicked = true;
            }
        }, true), SETTINGS_BTN);
        await recordEvents(page, SETTINGS_BTN, ['pointerdown', 'mouseover']);
        await watchShown(page, ['mb-stat-tooltip']);
        // Every change to the button's title. Chromium's emulation follows a
        // tap with mouseout, which would hand a stashed title straight back
        // and hide a card still waiting for its delay, so neither the end
        // state nor the card can show an unguarded handler; the stash itself
        // can. Firefox Android sends no such mouseout (org/mobile.org).
        await page.evaluate((sel) => {
            window.__titleChanges = [];
            new MutationObserver((recs) => recs.forEach((r) => window.__titleChanges.push(r.oldValue)))
                .observe(document.querySelector(sel), { attributes: true, attributeFilter: ['title'], attributeOldValue: true });
        }, SETTINGS_BTN);

        await btn.tap();
        await expect.poll(() => page.evaluate(() => !!window.__tapClicked)).toBe(true);
        const seen = await page.evaluate(() => window.__seen);
        expect(seen.pointerdown, 'premise: the tap reached the button as a touch').toBe(true);
        expect(seen.mouseover, 'premise: the tap fired a compatibility mouseover').toBe(true);

        await page.waitForTimeout(300);
        expect(await page.evaluate(() => window.__everShown), 'tooltips the tap showed').toEqual([]);
        await expect(tip).toBeHidden();
        // A tap never stashes the title: nothing would ever give it back.
        expect(await page.evaluate(() => window.__titleChanges), 'title changes during the tap').toEqual([]);
        expect(await btn.getAttribute('title')).toBe(title);

        // Control: a real mouse in the same context still gets the card.
        await page.waitForTimeout(PAST_TOUCH_WINDOW_MS);
        await mouseHover(page, btn);
        await expect(tip).toBeVisible();
        await expect(tip).toContainText('settings manager');
    });

    // The pre-redesign preview popup + type box: since the B2 image card
    // (org/redesign-CAA-EAA-column.org) that is the `sa_caa_tip_image: false`
    // path, and the viewer is off so the tap stays a plain tap. The card and
    // the tap-opens-the-viewer behaviour are pinned by
    // caa-column-redesign.mobile.spec.js.
    test('tapping a per-image artwork thumbnail opens neither the preview popup nor the type tooltip', async ({ page }) => {
        await loadUserscriptPage(page, {
            url: ARTIST_EVENTS_URL,
            fixtureFile: ARTIST_EVENTS_FIXTURE,
            testMode: true,
            settingsOverride: {
                sa_enable_caa_pics: true,
                sa_art_idb_enable: false,
                sa_caa_hover_preview: true,
                sa_caa_tip_image: false,
                sa_caa_column_viewer: false,
            },
        });
        await routeEventArtArchive(page);

        await page.locator('button[data-label="Show all Events for Artist"]').evaluate((b) => b.click());
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await waitForCaaEaaComplete(page);

        // Per-image <li>s are built collapsed; expand the cell first.
        await page.locator('[data-caa-expand-btn]').first().evaluate((b) => b.click());
        const artImg = page.locator('li.mb-caa-art-li-image img').first();
        await expect(artImg).toBeVisible();
        const preview = page.locator('#mb-art-hover-preview');
        const tip = page.locator('#mb-art-bigbox-tooltip');

        await recordEvents(page, 'li.mb-caa-art-li-image img', ['pointerdown', 'mouseover']);
        await watchShown(page, ['mb-art-hover-preview', 'mb-art-bigbox-tooltip']);
        await artImg.tap();
        await expect.poll(() => page.evaluate(() => !!(window.__seen && window.__seen.mouseover))).toBe(true);
        expect(await page.evaluate(() => window.__seen.pointerdown),
            'premise: the tap reached the thumbnail as a touch').toBe(true);

        await page.waitForTimeout(300);
        expect(await page.evaluate(() => window.__everShown), 'tooltips the tap showed').toEqual([]);
        await expect(preview).toBeHidden();
        await expect(tip).toBeHidden();

        // Control: a real mouse hover opens both, as on a desktop.
        await page.waitForTimeout(PAST_TOUCH_WINDOW_MS);
        await mouseHover(page, artImg);
        await expect(preview).toBeVisible();
        await expect(tip).toBeVisible();
        await expect(tip).toContainText('Front');
    });
});
