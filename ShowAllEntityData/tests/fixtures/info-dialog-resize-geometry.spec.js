'use strict';

// The ▶/▼-less half of the ❓ and 🎹 dialogs: a lower-right resize handle,
// plus position+size persisted across close/reopen. Both dialogs share one
// factory, createInfoDialog(), so opts.geoKey's save/restore/clamp machinery
// is exercised once here rather than duplicated per dialog — what differs per
// dialog is only its own GM key (sa_app_help_geometry / sa_shortcuts_help_geometry).
//
// Modeled on showLoadFilterDialog()'s own _saveGeo/_clampGeo/ResizeObserver,
// which this reuses verbatim rather than re-deriving — see
// config-workspace-roundtrip.spec.js for the generic export/import round trip
// of the `geometry` workspace group (both new keys were added to it too;
// this file is about createInfoDialog()'s own save/restore, not that plumbing).

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { clickToolbarItem } = require('../support/toolbarMenu');

const ARTIST_RECORDINGS_URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/recordings';
const FIXTURE_FILE = path.join(__dirname, 'uniq-drop-viewport-clip.html');

async function loadPage(page) {
    await loadUserscriptPage(page, {
        url: ARTIST_RECORDINGS_URL, fixtureFile: FIXTURE_FILE, testMode: true,
    });
    await page.waitForSelector('#mb-app-help-btn');
}

/** Opens the ❓ dialog (Shift-click) and waits for it to exist. */
async function openAppHelp(page) {
    await page.locator('#mb-app-help-btn').click({ modifiers: ['Shift'] });
    await page.waitForSelector('#mb-app-help-dialog');
}

/** Opens the 🎹 dialog — adopted into 🛠 View ▾, so it needs the menu helper. */
async function openShortcutsHelp(page) {
    await clickToolbarItem(page, '#mb-shortcuts-help-btn');
    await page.waitForSelector('#mb-shortcuts-help');
}

/** @returns {Promise<Object|null>} the current GM_getValue for `key`. */
const readGeo = (page, key) => page.evaluate((k) => window.GM_getValue(k, null), key);

/** Writes a GM value directly, as the feature itself would after a save. */
const seedGeo = (page, key, value) =>
    page.evaluate(([k, v]) => window.GM_setValue(k, v), [key, value]);

/** @returns {Promise<{top:number,left:number,width:number,height:number}>} */
const rectOf = (page, selector) => page.locator(selector).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) };
});

/**
 * Drags the native lower-right resize handle by (dx, dy), starting a few
 * pixels inside the dialog's own current bottom-right corner. Kept to modest,
 * in-viewport deltas deliberately — an extreme delta that pushes the cursor's
 * target far outside the browser's viewport is not a real user interaction
 * and was observed to make Playwright's synthetic mouse handling unreliable
 * in a way unrelated to the dialog's own code.
 */
async function dragResizeHandle(page, selector, dx, dy) {
    const box = await page.locator(selector).boundingBox();
    await page.mouse.move(box.x + box.width - 3, box.y + box.height - 3);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 3 + dx, box.y + box.height - 3 + dy, { steps: 10 });
    await page.mouse.up();
}

for (const [label, geoKey, openDialog, dialogSel, dragHandleSel] of [
    ['❓ app-help dialog', 'sa_app_help_geometry', openAppHelp, '#mb-app-help-dialog', '#mb-app-help-dialog > div'],
    ['🎹 shortcuts-help dialog', 'sa_shortcuts_help_geometry', openShortcutsHelp, '#mb-shortcuts-help', '#mb-shortcuts-help > div'],
]) {
    test.describe(`${label}: resize handle + persisted geometry`, () => {
        test('has a native lower-right resize handle', async ({ page }) => {
            await loadPage(page);
            await openDialog(page);

            const style = await page.locator(dialogSel).evaluate((el) => getComputedStyle(el).resize);
            expect(style).toBe('both');
        });

        test('dragging the native resize handle actually grows both width and height', async ({ page }) => {
            // Regression: opts.maxWidth/opts.maxHeight express the dialog's
            // comfortable DEFAULT size, not a resize ceiling — and shortcuts-
            // help's content naturally sits right at both of its own defaults
            // (580px wide, 82vh tall), so a resizable dialog that reused
            // those same values as its grow ceiling had ZERO headroom: the
            // native handle updated the DOM's inline width/height on drag
            // (proven with a diagnostic), but the CSS max-width/max-height
            // clamped the rendered size right back to where it started —
            // dragging outward visibly did nothing, in EITHER dimension.
            // (A stray earlier fix attempt made the width half of this worse
            // by pinning the STARTING width to maxWidth, removing even the
            // little headroom that width:auto already had.) Fixed by giving
            // a resizable dialog its own generous grow ceiling (95vw/95vh),
            // decoupled from opts.maxWidth/opts.maxHeight.
            await loadPage(page);
            await openDialog(page);
            const before = await rectOf(page, dialogSel);

            // A modest, safely in-viewport delta — see dragResizeHandle()'s
            // own comment for why an extreme one is not a realistic test.
            await dragResizeHandle(page, dialogSel, 100, 50);

            const after = await rectOf(page, dialogSel);
            expect(after.width, 'grew wider, not clamped back to the default ceiling').toBeGreaterThan(before.width);
            // Height only "not smaller" rather than strictly greater: on this
            // fixed-size test viewport, shortcuts-help's own (long) content is
            // tall enough to already sit at the 95vh ceiling before any drag —
            // a real, expected collision for very tall content on a modest
            // screen, not a regression. Width is the axis that was actually
            // broken (580px default == 580px old ceiling, on every viewport
            // size, regardless of content), which is what this test exists for.
            expect(after.height, 'did not get clamped SMALLER than the default ceiling').toBeGreaterThanOrEqual(before.height);
        });

        test('a drag/resize that ends with a click landing outside does not close the dialog', async ({ page }) => {
            // Regression, ported from a bug already fixed once in
            // showStatsPanel(): dragging the title bar (or the native resize
            // handle) to a point outside the dialog's ORIGINAL bounds makes
            // the browser's mouseup synthesize a `click` whose target lands
            // outside the dialog — which used to close it instantly. This
            // dispatches the exact event pair the browser produces in that
            // race (an inside mousedown immediately followed by an outside
            // click) rather than trying to reproduce native drag/resize
            // physics, which is unreliable to script directly.
            await loadPage(page);
            await openDialog(page);
            // onClickOutside is registered 100ms after open (so the click that
            // opened the dialog doesn't immediately close it) — dispatching
            // before that delay elapses would test nothing (no listener yet).
            await page.waitForTimeout(150);

            await page.evaluate((sel) => {
                document.querySelector(sel).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            }, dialogSel);

            // Suppressed once — still open.
            await expect(page.locator(dialogSel)).toHaveCount(1);

            // A GENUINE outside click — no preceding inside mousedown — still closes it.
            await page.evaluate(() => document.body.dispatchEvent(new MouseEvent('click', { bubbles: true })));
            await page.waitForSelector(dialogSel, { state: 'detached' });
        });

        test('opens with no stored geometry unchanged (no crash, sane default box)', async ({ page }) => {
            await loadPage(page);
            expect(await readGeo(page, geoKey), 'nothing stored yet').toBeNull();

            await openDialog(page);
            const rect = await rectOf(page, dialogSel);
            expect(rect.width).toBeGreaterThan(50);
            expect(rect.height).toBeGreaterThan(50);
        });

        test('a stored geometry is restored on open', async ({ page }) => {
            await loadPage(page);
            await seedGeo(page, geoKey, { top: 77, left: 88, width: 500, height: 400 });

            await openDialog(page);
            const rect = await rectOf(page, dialogSel);
            expect(rect).toEqual({ top: 77, left: 88, width: 500, height: 400 });
        });

        test('an out-of-viewport stored geometry is clamped, not left off-screen', async ({ page }) => {
            await loadPage(page);
            await seedGeo(page, geoKey, { top: -500, left: -500, width: 50000, height: 50000 });

            await openDialog(page);
            const rect = await rectOf(page, dialogSel);
            const viewport = page.viewportSize();
            expect(rect.top).toBeGreaterThanOrEqual(0);
            expect(rect.left).toBeGreaterThanOrEqual(0);
            expect(rect.width).toBeLessThanOrEqual(viewport.width);
            expect(rect.height).toBeLessThanOrEqual(viewport.height);
        });

        test('closing the dialog saves its current geometry', async ({ page }) => {
            await loadPage(page);
            await openDialog(page);
            const before = await rectOf(page, dialogSel);

            // The ✕ button, not Escape — see the "close then reopen" test
            // below for why a single Escape races the filter input's
            // auto-focus and its own two-press semantics.
            await page.locator(`${dialogSel} button[title="Close (Escape)"]`).click();
            await page.waitForSelector(dialogSel, { state: 'detached' });

            const saved = await readGeo(page, geoKey);
            expect(saved).not.toBeNull();
            expect(saved.width).toBe(before.width);
            expect(saved.height).toBe(before.height);
        });

        test('dragging the title bar updates the saved position on mouseup', async ({ page }) => {
            await loadPage(page);
            await openDialog(page);
            const before = await rectOf(page, dialogSel);

            const handle = page.locator(dragHandleSel).first();
            const box = await handle.boundingBox();
            await page.mouse.move(box.x + box.width / 2, box.y + 10);
            await page.mouse.down();
            await page.mouse.move(box.x + box.width / 2 + 60, box.y + 10 + 40, { steps: 5 });
            await page.mouse.up();

            const saved = await readGeo(page, geoKey);
            expect(saved).not.toBeNull();
            expect(saved.left).toBe(before.left + 60);
            expect(saved.top).toBe(before.top + 40);
        });

        test('a size change is picked up by the ResizeObserver and saved, debounced', async ({ page }) => {
            // The resize handle itself is browser-rendered chrome in the
            // element's own corner pixels, not a DOM node — simulating a drag
            // on it via synthetic mouse events is exactly the kind of
            // platform-behaviour-dependent interaction that's fragile in
            // headless Chromium (observed: it can end up dispatching a click
            // that the dialog's own outside-click handler reads as "outside"
            // mid-drag, closing the dialog). What this code actually owns —
            // and what's worth pinning — is that ANY size change reaching the
            // dialog's border-box, however it got there, is picked up by the
            // ResizeObserver and saved after the debounce; that's exactly
            // what the real resize handle also triggers, natively, without
            // this script's involvement.
            test.slow(); // waits out the 300ms save debounce
            await loadPage(page);
            await openDialog(page);
            const before = await rectOf(page, dialogSel);

            // Shrink, not grow: the shortcuts-help dialog's own max-width
            // (580px) means it can already BE at its ceiling by default, so
            // growing it is unreliable to assert an exact delta on — shrinking
            // by a modest amount stays well clear of every dialog's min-width
            // floor (320-450px) without needing per-dialog bounds here.
            await page.locator(dialogSel).evaluate((el) => {
                el.style.width  = (el.offsetWidth  - 40) + 'px';
                el.style.height = (el.offsetHeight - 30) + 'px';
            });

            const after = await rectOf(page, dialogSel);
            expect(after.width, 'shrank narrower').toBe(before.width - 40);
            expect(after.height, 'shrank shorter').toBe(before.height - 30);

            // Debounced 300ms — poll rather than a fixed sleep.
            await expect.poll(() => readGeo(page, geoKey), { timeout: 3000 }).not.toBeNull();
            const saved = await readGeo(page, geoKey);
            expect(saved.width).toBe(after.width);
            expect(saved.height).toBe(after.height);
        });

        test('close then reopen restores the last saved geometry with no reload needed', async ({ page }) => {
            await loadPage(page);
            await openDialog(page);

            const handle = page.locator(dragHandleSel).first();
            const box = await handle.boundingBox();
            await page.mouse.move(box.x + box.width / 2, box.y + 10);
            await page.mouse.down();
            await page.mouse.move(box.x + box.width / 2 + 30, box.y + 10 + 20, { steps: 3 });
            await page.mouse.up();
            const moved = await rectOf(page, dialogSel);

            // The ✕ button, not Escape: createInfoDialog()'s quick-filter
            // input auto-focuses ~80ms after open, and its own keydown
            // handler stops propagation on the FIRST Escape unconditionally
            // (two-press semantics — clear/blur, then close) — a single
            // Escape here would race that timeout instead of closing.
            await page.locator(`${dialogSel} button[title="Close (Escape)"]`).click();
            await page.waitForSelector(dialogSel, { state: 'detached' });

            await openDialog(page);
            const reopened = await rectOf(page, dialogSel);
            expect(reopened).toEqual(moved);
        });
    });
}

test.describe('the two dialogs keep independent geometry keys', () => {
    test('moving one dialog does not touch the other one\'s stored geometry', async ({ page }) => {
        await loadPage(page);
        await openAppHelp(page);

        const handle = page.locator('#mb-app-help-dialog > div').first();
        const box = await handle.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + 10);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + 50, box.y + 10 + 30, { steps: 3 });
        await page.mouse.up();

        expect(await readGeo(page, 'sa_app_help_geometry'), 'app-help moved').not.toBeNull();
        expect(await readGeo(page, 'sa_shortcuts_help_geometry'), 'shortcuts-help untouched').toBeNull();
    });
});
