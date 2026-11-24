'use strict';

// The switch between our tables and the original page (vzell, 2026-11-24;
// org/majkinetor.org, "Switch between SAED's view and the original page (EH's
// V)"; approved mockup https://claude.ai/artifact/9wsKwn3kSr7LvhBkJVcijf),
// MusicBrainz. Properties pinned:
//   - a copy of #page is taken at the press, BEFORE anything changes: it holds
//     MusicBrainz's own pager, tracklist and sidebar, none of our controls, and
//     the note naming the action pressed;
//   - "📄 Show the original page" is a ☰ SAED → View row only after a render,
//     with the key hint Ctrl+M P;
//   - switching hides the live #page (never removes it) and puts the copy
//     after it; switching back removes the copy and shows the SAME rendered
//     table, its filter and its rows as they were;
//   - each view keeps its own scroll position;
//   - Ctrl+M P switches both ways, Esc never switches;
//   - the "Back to the tables" corner button shows only on the original page,
//     carries majkinetor's corner marks (out of his dock), and hides while
//     Event Horizon's view shows;
//   - the #938 marks (quiet, keys, player) are down while the original page
//     shows and back with the tables;
//   - nothing of ours is visible outside the copy while it shows, except the
//     corner button;
//   - a load from disk takes the copy too.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { clickToolbarItem, pressAction } = require('../support/toolbarMenu');
const { loadFromDiskFixture } = require('../support/diskFixture');
const { URL: EVENTS_DISK_URL, FIXTURE_PATH: EVENTS_DISK_FIXTURE } = require('../support/artistEventsFixture');

const EVENTS = {
    url: 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f/events',
    shell: path.join(__dirname, 'html-fetch-transient-events.html'),
    label: 'Show all Events for Artist',
};
const RELEASE = {
    url: 'https://musicbrainz.org/release/1d404e1d-fcb6-3a52-b478-e706e893c897',
    shell: path.join(__dirname, 'release-tracks-ms-length.html'),
    label: 'Show all Tracks for Release',
};
const SIM = fs.readFileSync(path.join(__dirname, 'thirdPartyScripts', 'eh-body-swap.js'), 'utf8');
const ROW = '#mb-orig-view-btn';
const BACK = '#mb-orig-back-btn';

/**
 * Loads the artist's events shell; every page fetch is served the same shell.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function openEvents(page) {
    await loadUserscriptPage(page, { url: EVENTS.url, fixtureFile: EVENTS.shell, testMode: true });
    await page.route('https://musicbrainz.org/artist/**', (route) => route.fulfill({ path: EVENTS.shell, contentType: 'text/html' }));
    await page.waitForFunction(() => !!document.querySelector('#mb-saed-bar'));
}

/**
 * Loads the release fixture, optionally with Event Horizon simulated.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ eh?: boolean }} [opts]
 * @returns {Promise<void>}
 */
async function openRelease(page, { eh = false } = {}) {
    if (eh) {
        await page.context().addInitScript({ content: 'window.__EH_SIM_START_ON__ = false;' });
        await page.context().addInitScript({ content: SIM });
    }
    await loadUserscriptPage(page, { url: RELEASE.url, fixtureFile: RELEASE.shell, testMode: true });
    await page.waitForFunction(() => !!document.querySelector('#mb-saed-bar'));
}

/**
 * Presses an action and waits for the render.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} label - The action's data-label.
 * @returns {Promise<void>}
 */
async function render(page, label) {
    await pressAction(page, `button[data-label="${label}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/**
 * Which #page shows: the live one, the copy, and the corner button.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{pages: number, liveFirst: boolean, liveVisible: boolean, copyVisible: boolean, back: boolean}>}
 */
const views = (page) => page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('[id="page"]'));
    const live = all.find((p) => !p.hasAttribute('data-mb-orig-copy'));
    const copy = all.find((p) => p.hasAttribute('data-mb-orig-copy'));
    const vis = (el) => !!el && el.getClientRects().length > 0;
    return {
        pages: all.length, liveFirst: all[0] === live,
        liveVisible: vis(live), copyVisible: vis(copy), back: vis(document.getElementById('mb-orig-back-btn')),
    };
});

/** The copy of #page while it is in the document. */
const copySel = '[id="page"][data-mb-orig-copy]';

/**
 * Ctrl+M, then P, with no field focused (in a field Ctrl+M is the Unicode
 * character menu).
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function switchByKey(page) {
    await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
    await page.keyboard.press('Control+M');
    await page.keyboard.press('p');
}

test.describe('the original page on a single-table page', () => {
    test('a copy from before the press, shown from the ☰ row, and the same table back', async ({ page }) => {
        await openEvents(page);
        // Pins: no row on the initial page — there is nothing to switch from.
        expect(await page.locator(ROW).count()).toBe(0);
        await render(page, EVENTS.label);
        await expect(page.locator(ROW)).toHaveAttribute('data-mb-menu-hint', 'Ctrl+M P');
        // The render took MusicBrainz's pager away from the live page.
        expect(await page.locator('#page:not([data-mb-orig-copy]) ul.pagination').count()).toBe(0);
        await page.evaluate(() => { window.__liveTbody = document.querySelector('table.tbl tbody'); });

        await clickToolbarItem(page, ROW);
        expect(await views(page)).toEqual({ pages: 2, liveFirst: true, liveVisible: false, copyVisible: true, back: true });
        const copy = page.locator(copySel);
        // Pins: the copy is the page from BEFORE the press (its pager, its
        // native table without our filter row), not a copy of the render.
        expect(await copy.locator('ul.pagination').count()).toBeGreaterThan(0);
        expect(await copy.locator('.mb-col-filter-row, #mb-global-filter-input, .mb-toggle-h2').count()).toBe(0);
        expect(await copy.locator('#mb-show-all-controls-container, #mb-saed-bar').count()).toBe(0);
        await expect(copy.locator('.mb-orig-note')).toContainText(`before you pressed “${EVENTS.label}”`);
        await expect(copy.locator('.mb-orig-note')).toContainText('MusicBrainz’s own buttons may not respond here');
        // The corner button stacks with majkinetor's launchers, never in his dock.
        const marks = await page.locator(BACK).evaluate((b) => [b.dataset.mbCorner, b.dataset.mbCornerDock]);
        expect(marks).toEqual(['br', 'no']);

        await page.locator(BACK).click();
        expect(await views(page)).toEqual({ pages: 1, liveFirst: true, liveVisible: true, copyVisible: false, back: false });
        // Pins: hidden, never rebuilt — the very same tbody is back.
        expect(await page.evaluate(() => document.querySelector('table.tbl tbody') === window.__liveTbody)).toBe(true);
    });

    test('the filter, its rows and each view\'s scroll position survive the trip', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 500 });
        await openEvents(page);
        await render(page, EVENTS.label);
        const rowsShown = () => page.evaluate(() => Array.from(document.querySelectorAll('#page:not([data-mb-orig-copy]) table.tbl tbody tr'))
            .filter((r) => r.getClientRects().length > 0).length);
        const all = await rowsShown();
        const word = await page.evaluate(() => {
            const a = document.querySelector('table.tbl tbody tr td a');
            return (a && a.textContent.trim().split(/\s+/)[0]) || '';
        });
        await page.locator('#mb-global-filter-input').fill(word);
        // The filter runs debounced: wait until it has narrowed the rows.
        await expect.poll(rowsShown).toBeLessThan(all);
        const filtered = await rowsShown();
        // The global filter's value always starts with its 🔍 prefix.
        const typed = await page.locator('#mb-global-filter-input').inputValue();
        expect(typed.endsWith(word)).toBe(true);
        await page.evaluate(() => window.scrollTo(0, 300));
        const tableY = await page.evaluate(() => window.scrollY);
        expect(tableY).toBeGreaterThan(0);

        // The switch by key: opening the ☰ menu would let Playwright scroll
        // the sticky toolbar into view first, and the position saved would
        // be that one, not the reader's.
        await switchByKey(page);
        expect((await views(page)).copyVisible).toBe(true);
        await page.evaluate(() => window.scrollTo(0, 120));
        const origY = await page.evaluate(() => window.scrollY);
        await switchByKey(page);
        expect(await page.evaluate(() => window.scrollY)).toBe(tableY);
        await expect(page.locator('#mb-global-filter-input')).toHaveValue(typed);
        expect(await rowsShown()).toBe(filtered);

        await switchByKey(page);
        expect(await page.evaluate(() => window.scrollY)).toBe(origY);
    });

    test('Ctrl+M P switches both ways; Esc never switches', async ({ page }) => {
        await openEvents(page);
        await render(page, EVENTS.label);
        await page.locator('h1').first().click();
        await page.keyboard.press('Control+M');
        await page.keyboard.press('p');
        expect((await views(page)).copyVisible).toBe(true);
        await page.keyboard.press('Escape');
        expect((await views(page)).copyVisible).toBe(true);
        await page.keyboard.press('Control+M');
        await page.keyboard.press('p');
        expect(await views(page)).toMatchObject({ liveVisible: true, copyVisible: false, back: false });
        await page.keyboard.press('Escape');
        expect(await views(page)).toMatchObject({ liveVisible: true, copyVisible: false });
    });

    test('nothing of ours shows outside the copy while it shows, except the corner button', async ({ page }) => {
        await openEvents(page);
        await render(page, EVENTS.label);
        await clickToolbarItem(page, ROW);
        // "Ours": an id or a class token of ours. Not the elements that hold
        // the copy (<html>, <body>) and not MusicBrainz's own site header and
        // footer (#header/.header, #footer/.footer), which only carry a class of
        // ours and show in both views.
        const leaks = await page.evaluate(() => Array.from(document.querySelectorAll('[id^="mb-"], [class*="mb-"]'))
            .filter((el) => el.id.startsWith('mb-') || Array.from(el.classList).some((c) => c.startsWith('mb-')))
            .filter((el) => !el.querySelector('[data-mb-orig-copy]') && !el.closest('[data-mb-orig-copy]'))
            .filter((el) => !el.matches('#header, #footer, .header, .footer') && !el.closest('#mb-orig-back-btn'))
            .filter((el) => {
                const r = el.getBoundingClientRect();
                const cs = getComputedStyle(el);
                return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0;
            })
            .map((el) => el.id || el.className));
        expect(leaks).toEqual([]);
    });
});

test.describe('the original page on a multi-table page', () => {
    test('the copy holds MusicBrainz\'s own tracklist and sidebar', async ({ page }) => {
        await openRelease(page);
        await render(page, RELEASE.label);
        await clickToolbarItem(page, ROW);
        const copy = page.locator(copySel);
        expect(await copy.locator('table.tbl.medium').count()).toBe(1);
        expect(await copy.locator('h3.mb-toggle-h3, .mb-master-toggle, .mb-sb-count').count()).toBe(0);
        expect(await copy.locator('#sidebar').count()).toBe(1);
        await page.locator(BACK).click();
        expect(await page.locator('#page h3.mb-toggle-h3').count()).toBeGreaterThan(0);
    });

    test('the #938 marks go down on the original page and come back with the tables', async ({ page }) => {
        await openRelease(page, { eh: true });
        await render(page, RELEASE.label);
        const quiet = () => page.evaluate(() => document.documentElement.getAttribute('data-mbu-quiet'));
        expect(await quiet()).toBe('saed');
        await clickToolbarItem(page, ROW);
        expect(await quiet()).toBeNull();
        expect((await views(page)).back).toBe(true);
        // Event Horizon's view over MusicBrainz's page: our corner button goes too.
        await page.evaluate(() => window.__ehSim.on());
        expect(await page.locator(BACK).evaluate((b) => b.hidden)).toBe(true);
        await page.evaluate(() => window.__ehSim.off());
        expect(await page.locator(BACK).evaluate((b) => b.hidden)).toBe(false);
        await page.locator(BACK).click();
        expect(await quiet()).toBe('saed');
    });
});

test.describe('the original page after a load from disk', () => {
    test('a load takes the copy too, and names it in the note', async ({ page }) => {
        await loadFromDiskFixture(page, { url: EVENTS_DISK_URL, fixturePath: EVENTS_DISK_FIXTURE, testMode: true });
        await waitForRenderComplete(page, { waitForAutoResize: false, timeout: 60000 });
        await clickToolbarItem(page, ROW);
        await expect(page.locator(`${copySel} .mb-orig-note`)).toContainText('before you pressed “Load from disk”');
        expect((await views(page)).liveVisible).toBe(false);
    });
});
