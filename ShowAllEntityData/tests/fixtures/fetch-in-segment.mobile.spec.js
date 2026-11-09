'use strict';

// A phone has Stop: during a fetch the running action segment comes back
// into the SAED bar (chromium-mobile: Pixel 7 emulation, touch, no hover).
//
// On a narrow layout (≤ 520 px, every phone: MusicBrainz sets
// width=device-width) `_saedApplyNarrow()` hides the whole actions area and
// the actions are the "Load" rows of ☰ SAED. Until 2026-11-09 that hid the
// only Stop control too — the running segment ("■ Stop · n / N",
// `_saedRunStart()`) — so a long paginated fetch could not be stopped
// (org/mobile.org). Now `mb-saed-running` on the bar brings the running (and
// then rendering) segment alone back beside ☰ SAED, and the Load rows mirror
// their segments (`_saedSyncLoadRows()`). What each test pins, and the
// neighbouring property it would still catch:
//
//   • STOP IS ON SCREEN: the running segment is VISIBLE (laid out, in the
//     bar), not merely present with the right class — the bug was exactly a
//     correct segment in a hidden area. It is the only visible action; a tap
//     on it stops (exactly pages 1–2 rendered: not 300, Stop ignored), and
//     afterwards the bar is one line again (actions hidden, class gone).
//   • THE RENDERING STATE is shown too (seen striped while displayed), so
//     the bar does not jump back to ☰ SAED alone before the table is there.
//   • THE LOAD ROWS SAY IT: in an open menu during a run, the running row
//     reads "Stop · …" and the others are disabled like their segments;
//     after the run every row has its 🧮 text back and is enabled.
//
// Network-free; fixtures shared with fetch-in-segment.spec.js (both carry the
// viewport tag, so the phone lays them out narrow).

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { RUNNING_SEGMENT } = require('../support/stopButton');

const EVENTS = {
    url: 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f/events',
    shell: path.join(__dirname, 'html-fetch-transient-events.html'),
};
const RG = {
    url: 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f',
    shell: path.join(__dirname, 'html-fetch-transient-rg.html'),
    labelMatch: 'Artist RGs',
};
const BAR = '#mb-saed-bar';
const ACTIONS = '#mb-saed-bar [data-mb-area="actions"]';
const LOAD_ROWS = '#mb-saed-menu-btn-panel .mb-saed-group[data-mb-group="load"] .mb-saed-load-row';

/**
 * Loads `shell` at `url` and answers every page fetch with it; the page
 * `isHeld(url)` names waits until the returned `release()` is called.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{url: string, shell: string}} fx
 * @param {function(URL): boolean} isHeld
 * @returns {Promise<{asked: string[], release: function(): void}>}
 */
async function loadHeld(page, fx, isHeld) {
    const asked = [];
    let release = () => {};
    const held = new Promise((r) => { release = r; });
    await loadUserscriptPage(page, { url: fx.url, fixtureFile: fx.shell, testMode: true });
    await page.route('https://musicbrainz.org/artist/**', async (route) => {
        const u = new URL(route.request().url());
        asked.push(u.search);
        if (isHeld(u)) await held;
        return route.fulfill({ path: fx.shell, contentType: 'text/html' });
    });
    return { asked, release: () => release() };
}

/**
 * The narrow premise every test starts from: a phone layout, the actions
 * area hidden, ☰ SAED on its own.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function expectNarrowIdle(page) {
    expect(await page.evaluate(() => document.documentElement.clientWidth),
        'premise: device-width layout').toBeLessThanOrEqual(520);
    await expect(page.locator(BAR)).toHaveClass(/mb-saed-narrow/);
    await expect(page.locator(BAR)).not.toHaveClass(/mb-saed-running/);
    await expect(page.locator(ACTIONS)).toBeHidden();
}

/** @returns {Promise<string[]>} Classes of the visible children of the actions area. */
const visibleActions = (page) => page.evaluate((sel) => Array.from(document.querySelector(sel).children)
    .filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none')
    .map((el) => el.className), ACTIONS);

test.describe('a phone has Stop: the running segment comes back into the bar', () => {
    test('a fetch started from Load shows its Stop beside ☰ SAED, and a tap stops it', async ({ page }) => {
        const { asked, release } = await loadHeld(page, EVENTS,
            (u) => u.searchParams.get('page') === '2');
        await expectNarrowIdle(page);

        await page.locator('#mb-saed-menu-btn').tap();
        await page.locator(LOAD_ROWS).first().tap();

        const seg = page.locator(RUNNING_SEGMENT);
        await expect(seg, 'the running segment is ON SCREEN, not only present').toBeVisible();
        await expect(seg).toHaveText('Stop · 1 / 3');
        const box = await seg.boundingBox();
        expect(box && box.width > 0 && box.height > 0, 'it is laid out').toBe(true);
        const vis = await visibleActions(page);
        expect(vis.length, `the running segment alone: ${JSON.stringify(vis)}`).toBe(1);
        expect(vis[0]).toMatch(/\bmb-seg-running\b/);
        await expect(page.locator('#mb-saed-menu-btn'), '☰ SAED stays').toBeVisible();

        await seg.tap();
        await expect(seg).toHaveText('Stopping…');
        release();
        await waitForRenderComplete(page, { waitForAutoResize: false });

        expect(await page.evaluate(() => document.querySelectorAll('table.tbl tbody tr').length),
            'pages 1 and 2: Stop was honoured').toBe(200);
        expect(asked.filter((s) => /page=3\b/.test(s)), 'page 3 was never asked for').toEqual([]);
        await expect(page.locator('#mb-global-status-display')).toContainText('Stopped by you after page 2 of 3');
        await expectNarrowIdle(page);
    });

    test('the rendering state shows in the bar too, until the table is there', async ({ page }) => {
        const { release } = await loadHeld(page, EVENTS, (u) => u.searchParams.get('page') === '2');
        await expectNarrowIdle(page);
        await page.evaluate((sel) => {
            const area = document.querySelector(sel);
            window.__renderSeen = [];
            new MutationObserver(() => {
                const r = area.querySelector('.mb-seg-rendering');
                if (r) window.__renderSeen.push({ shown: r.getClientRects().length > 0, text: r.textContent });
            }).observe(area, { attributes: true, childList: true, characterData: true, subtree: true });
        }, ACTIONS);
        await page.locator('#mb-saed-menu-btn').tap();
        await page.locator(LOAD_ROWS).first().tap();
        await expect(page.locator(RUNNING_SEGMENT)).toBeVisible();
        release();
        await waitForRenderComplete(page, { waitForAutoResize: false });

        const seen = await page.evaluate(() => window.__renderSeen);
        expect(seen.length, 'the striped state was passed through').toBeGreaterThan(0);
        expect(seen.every((s) => s.shown), `it was on screen: ${JSON.stringify(seen)}`).toBe(true);
        expect(seen.some((s) => /^Rendering 300 rows…$/.test(s.text))).toBe(true);
        await expectNarrowIdle(page);
    });

    test('during a run the Load rows say Stop and wait, and come back after', async ({ page }) => {
        const { release } = await loadHeld(page, RG,
            (u) => u.searchParams.get('all') === '1' && u.searchParams.get('page') === '2');
        await expectNarrowIdle(page);

        await page.locator('#mb-saed-menu-btn').tap();
        const rows = page.locator(LOAD_ROWS);
        const idle = await rows.evaluateAll((els) => els.map((r) => r.textContent));
        expect(idle.length, 'premise: several actions').toBeGreaterThan(1);
        const i = idle.findIndex((t) => t.includes(RG.labelMatch));
        expect(i, 'premise: the Artist RGs row').toBeGreaterThanOrEqual(0);
        await rows.nth(i).tap();
        await expect(page.locator(RUNNING_SEGMENT)).toBeVisible({ timeout: 30000 });

        await page.locator('#mb-saed-menu-btn').tap();
        await expect(rows.nth(i)).toBeVisible();
        await expect(rows.nth(i), 'the running row says what its segment says').toHaveText(/^Stop · \d+ \/ \d+$/);
        await expect(rows.nth(i).locator('.mb-seg-stop-glyph'), 'with the ■').toHaveCount(1);
        await expect(rows.nth(i)).toBeEnabled();
        const states = await rows.evaluateAll((els) => els.map((r) => r.disabled));
        expect(states.filter((d, k) => k !== i).every(Boolean), `the others wait: ${JSON.stringify(states)}`).toBe(true);

        // A tap on the row is the same Stop.
        await rows.nth(i).tap();
        await expect(page.locator(RUNNING_SEGMENT)).toHaveText('Stopping…');
        release();
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await expectNarrowIdle(page);

        // Read without opening the menu: after the render the sticky
        // view-switch bar covers ☰ SAED for a tap at the page's top, and
        // `_saedRunEnd()` itself has already synced the rows.
        expect(await rows.evaluateAll((els) => els.map((r) => r.textContent)), 'idle texts back').toEqual(idle);
        expect((await rows.evaluateAll((els) => els.map((r) => r.disabled))).every((d) => !d), 'all usable').toBe(true);
    });
});
