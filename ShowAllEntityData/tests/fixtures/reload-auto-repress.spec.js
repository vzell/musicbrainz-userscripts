'use strict';

// A second press reloads the page, and the reloaded page presses the same
// button again by itself (`_autoRepressAfterReload()`).
//
// ── Why the reload stays ────────────────────────────────────────────────────
//
// `startFetchingProcess()` answers a second fetch with `window.location.reload()`
// (the "column-level filter unresponsiveness" guard; see
// docs/claude/fetch-and-render-pipeline.md). Only the step after it changed:
// the guard records WHICH action button was pressed in
// `sessionStorage['mb_show_all_reload_pending']` as `{label, index, href}`, and
// init presses that button again instead of showing the "⚠️ Page Reloaded"
// dialog that asked the user to.
//
// ── What each test pins, and the adjacent property it avoids ────────────────
//
//  1. THE RE-PRESS RUNS THE FETCH. Not just "a note appeared": the note is
//     painted before the press, so a removed `btn.click()` would still show it.
//     Pinned as all 300 rows of the 3-page fixture arriving with no click
//     from the test, and no dialog.
//  2. NO RE-PRESS ON A FLAG IT CANNOT TRUST — the legacy bare 'true', a flag
//     for another URL, a label no button carries. Each falls back to the
//     dialog and fetches nothing. The other-URL case is the one a dropped
//     href check would get wrong.
//  3. THE GUARD STANDS FIRST, and records the pressed button. The reload used
//     to come ~400 lines into the function, after the definition merge and
//     (on artist-releasegroups) a whole network pre-fetch pass. Pinned through
//     the debug log: the merge's "… configured" lines print on the first
//     press and must NOT print on the second.
//
// The fixture harness injects the userscript with `addScriptTag` after
// `goto`, so after a real reload there is no script running. Tests 1–2
// therefore seed the flag before the injection — the state a reload leaves.
//
// Network-free. Shares `html-fetch-transient-events.html` with
// `resume-from-failed-page.spec.js` — artist-events, 100 rows per page,
// pagination rewritten to 3 pages.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');

const EVENTS = {
    url: 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f/events',
    shell: path.join(__dirname, 'html-fetch-transient-events.html'),
    label: 'Show all Events for Artist',
    rows: 300,
};

const FLAG_KEY = 'mb_show_all_reload_pending';
const STATUS = '#mb-global-status-display';
const NOTE = '#mb-reload-repress-note';
const DIALOG_TEXT = 'Page Reloaded';

/** @returns {Promise<number>} Rendered data rows across every table. */
const renderedRows = (page) => page.evaluate(
    () => document.querySelectorAll('table.tbl tbody tr').length);

/**
 * Routes the paginated fetches, optionally seeds the reload flag, and loads
 * the artist-events shell WITHOUT pressing anything.
 *
 * The route goes in first: a re-press fires right after the injection, so a
 * route registered afterwards could miss its first request.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ flag?: ?string, settingsOverride?: Object<string, *> }} [opts]
 * @returns {Promise<number[]>} Page numbers requested, in order.
 */
async function loadEvents(page, { flag = null, settingsOverride } = {}) {
    const reqs = [];
    await page.route('https://musicbrainz.org/artist/**', (route) => {
        const u = new URL(route.request().url());
        reqs.push(Number(u.searchParams.get('page') || '1'));
        return route.fulfill({ path: EVENTS.shell, contentType: 'text/html' });
    });
    if (flag !== null) {
        // Once only: a reload within the test must not be re-seeded.
        await page.context().addInitScript(({ key, value }) => {
            if (location.hostname === 'musicbrainz.org' && !window.name.includes('mb-sa-seeded')) {
                sessionStorage.setItem(key, value);
                window.name += ' mb-sa-seeded';
            }
        }, { key: FLAG_KEY, value: flag });
    }
    await loadUserscriptPage(page, {
        url: EVENTS.url,
        fixtureFile: EVENTS.shell,
        testMode: true,
        ...(settingsOverride ? { settingsOverride } : {}),
    });
    return reqs;
}

/** @returns {string} A flag as the reload guard writes it. */
const flagFor = (over = {}) => JSON.stringify({
    label: EVENTS.label, index: 0, href: EVENTS.url, ...over,
});

test.describe('a second press reloads, then presses the same button again', () => {
    test('a recorded button is pressed again after the reload, without the dialog',
        async ({ page }) => {
            test.setTimeout(90000);
            const reqs = await loadEvents(page, { flag: flagFor() });

            await expect(page.locator(NOTE)).toContainText('re-running');
            await expect(page.locator(NOTE)).toContainText('Events for Artist');

            await expect.poll(() => renderedRows(page), {
                timeout: 60000, message: 'the re-press fetches every page',
            }).toBe(EVENTS.rows);
            expect(reqs.filter((p) => p >= 2)).toEqual([2, 3]);
            await expect(page.locator(STATUS)).toContainText('Loaded');

            // The flag is consumed, the note goes away by itself, and the
            // dialog the re-press replaces never appears.
            expect(await page.evaluate((k) => sessionStorage.getItem(k), FLAG_KEY)).toBeNull();
            await expect(page.locator(NOTE)).toHaveCount(0, { timeout: 10000 });
            await expect(page.getByText(DIALOG_TEXT)).toHaveCount(0);
        });

    for (const [name, flag] of [
        ['the legacy bare flag', 'true'],
        ['a flag recorded on another URL', flagFor({ href: `${EVENTS.url}?page=2` })],
        ['a label no button carries', flagFor({ label: 'Show all Nothing for Nobody' })],
        ['a malformed flag', '{not json'],
    ]) {
        test(`${name} falls back to the dialog and presses nothing`, async ({ page }) => {
            const reqs = await loadEvents(page, { flag });

            await expect(page.getByText(DIALOG_TEXT)).toBeVisible();
            await expect(page.locator(NOTE)).toHaveCount(0);
            // A re-press is a setTimeout(0) after init: let the page's own
            // timers run past it, then nothing may have started.
            await page.evaluate(() => new Promise((r) => setTimeout(r, 500)));
            await expect(page.locator(STATUS)).not.toContainText('pages');
            expect(reqs.filter((p) => p >= 2)).toEqual([]);
            expect(await renderedRows(page)).toBeLessThanOrEqual(100);
        });
    }

    test('the second press reloads before any fetch work, and records the button',
        async ({ page }) => {
            test.setTimeout(90000);
            const logs = [];
            page.on('console', (msg) => logs.push(msg.text()));
            const reqs = await loadEvents(page, { settingsOverride: { sa_enable_debug_logging: true } });

            await page.click(`button[data-label="${EVENTS.label}"]`);
            await expect.poll(() => renderedRows(page), {
                timeout: 60000, message: 'the first press fetches every page',
            }).toBe(EVENTS.rows);
            // The discriminator below only means something if the first press
            // printed the merge's lines at all.
            const MERGE_LINE = / configured: /;
            expect(logs.some((t) => MERGE_LINE.test(t)), 'the first press logs its merge').toBe(true);

            const mark = logs.length;
            const reqMark = reqs.length;
            await page.evaluate(() => { window.__saReloadSpecMark = 1; });
            await page.click(`button[data-label="${EVENTS.label}"]`);
            await expect.poll(() => page.evaluate(() => window.__saReloadSpecMark), {
                timeout: 30000, message: 'the second press reloads the page',
            }).toBeUndefined();

            const second = logs.slice(mark);
            expect(second.some((t) => t.includes('Second fetch attempt detected'))).toBe(true);
            expect(second.filter((t) => MERGE_LINE.test(t)), 'nothing past the guard ran').toEqual([]);
            // The reload itself is the only request the second press made.
            expect(reqs.slice(reqMark).filter((p) => p >= 2)).toEqual([]);

            // No script runs on the reloaded page (see the header), so the
            // flag the guard wrote is still there to read.
            const stored = JSON.parse(await page.evaluate((k) => sessionStorage.getItem(k), FLAG_KEY));
            expect(stored).toEqual({ label: EVENTS.label, index: 0, href: EVENTS.url });
        });
});
