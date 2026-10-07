'use strict';

// The MusicBrainz link previews (org/iframe.org Phase 2) against the REAL
// site. The fixture spec (tests/fixtures/popup-mb.spec.js) serves captured Web
// Service answers; this one shows that today's pages carry the links it
// previews and today's answers fill the cards: per kind, a card that loaded
// (its foot, no "Could not load"), and for a release the pinned window and its
// Live page.
//
// Polite enough for @extended: no "Show all" (the native first page's table
// is enough, and the engine is installed on every page with a pageType), one
// link per kind, so about a dozen Web Service requests through the script's
// own one-a-second gate. Series, collection, ISRC and disc ID cards are
// covered by the fixture spec only: no light page links them in a table.

const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { collectPageErrors } = require('../support/liveAssertions');
const { waitForRenderComplete } = require('../support/browser');

const SETTINGS = {
    sa_pop_mb: true,
    sa_dp_hover_without_ctrl: true,
    sa_rich_tooltip_delay_ms: 0,
    sa_render_threshold: 1000000,
    sa_render_warning_threshold: 1000000,
};
const ARTIST = '70248960-cb53-4ea4-943a-edb18f7d336f';

/**
 * Hovers a link and waits for its card to hold a loaded answer.
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} link
 * @returns {Promise<import('@playwright/test').Locator>} The card.
 */
async function cardFor(page, link) {
    await page.mouse.move(0, 0);
    await link.scrollIntoViewIfNeeded();
    await link.hover();
    const card = page.locator('#mb-dp-peek');
    await expect(card).toBeVisible({ timeout: 30000 });
    await expect(card).toContainText(/fetched now|saved today/, { timeout: 30000 });
    await expect(card).not.toContainText('Could not load');
    return card;
}

/**
 * Loads a real MusicBrainz page with the previews on.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} url
 * @returns {Promise<void>}
 */
async function openLive(page, url) {
    await loadUserscriptPage(page, { url, settingsOverride: SETTINGS });
    await expect(page.locator('#mb-show-all-controls-container')).toBeVisible({ timeout: 30000 });
}

// The Live page frame is sandboxed without scripts; the trace recorder's
// injected script trips it (docs/claude/detail-pages.md), so no trace here.
test.use({ trace: 'off' });

test.describe('MusicBrainz link previews on the real site', { tag: '@extended' }, () => {
    test('a release group page: release, artist, label and area cards; the release window and its Live page', async ({ page }) => {
        test.setTimeout(240000);
        const errors = collectPageErrors(page);
        await openLive(page, 'https://musicbrainz.org/release-group/c497fc44-ddaf-3cce-a9b4-bfec958a0f3c');
        const body = page.locator('table.tbl tbody').first();
        const rel = body.locator('a[href^="/release/"]:not([href$="/cover-art"])').first();
        const card = await cardFor(page, rel);
        await expect(card.locator('.mb-pop-tracks li').first()).toBeVisible();
        for (const sel of [`a[href="/artist/${ARTIST}"]`, 'a[href^="/label/"]', 'a[href^="/area/"]']) {
            await cardFor(page, body.locator(sel).first());
        }
        await cardFor(page, rel);
        await page.keyboard.press('Space');
        const dialog = page.locator('#mb-dp-dialog');
        await expect(dialog.locator('.mb-pop-tracks li').first()).toBeVisible({ timeout: 30000 });
        await dialog.locator('button.mb-dp-tbtn', { hasText: 'Live page' }).click();
        const frame = page.frameLocator('#mb-dp-dialog iframe');
        await expect(frame.locator('#content')).toBeVisible({ timeout: 60000 });
        await expect(frame.locator('#footer')).toBeHidden();
        expect(errors).toEqual([]);
    });

    test('a release tracklist: a recording card', async ({ page }) => {
        test.setTimeout(180000);
        const errors = collectPageErrors(page);
        await openLive(page, 'https://musicbrainz.org/release/1d404e1d-fcb6-3a52-b478-e706e893c897');
        const card = await cardFor(page, page.locator('table.tbl tbody a[href^="/recording/"]').first());
        await expect(card.locator('.mb-tt-pill').first()).toBeVisible();
        expect(errors).toEqual([]);
    });

    test('an artist\'s works: a work card and an ISWC card', async ({ page }) => {
        test.setTimeout(180000);
        const errors = collectPageErrors(page);
        await openLive(page, `https://musicbrainz.org/artist/${ARTIST}/works`);
        await cardFor(page, page.locator('table.tbl tbody a[href^="/work/"]').first());
        await cardFor(page, page.locator('table.tbl tbody a[href^="/iswc/"]').first());
        expect(errors).toEqual([]);
    });

    test('an artist\'s events: an event card and a place card', async ({ page }) => {
        test.setTimeout(180000);
        const errors = collectPageErrors(page);
        await openLive(page, `https://musicbrainz.org/artist/${ARTIST}/events`);
        // Each row starts with its event-art icon, a link around an image to
        // /event/<id>/event-art: not previewed (artwork has its own preview).
        const card = await cardFor(page, page.locator('table.tbl tbody a[href^="/event/"]:not(:has(img)):not([href$="/event-art"])').first());
        await expect(card.locator('.mb-tt-pill').first()).toBeVisible();
        await cardFor(page, page.locator('table.tbl tbody a[href^="/place/"]').first());
        expect(errors).toEqual([]);
    });

    test('the instrument list: an instrument card', async ({ page }) => {
        test.setTimeout(180000);
        const errors = collectPageErrors(page);
        await openLive(page, 'https://musicbrainz.org/instruments');
        // The native page is a list per type; "Show all" (one page) makes the
        // tables, so this one also covers a rendered table on the real site.
        await page.click('button[data-label="Show all Instruments"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        // Its sub-tables (one per instrument type) start collapsed.
        const master = page.locator('.mb-master-toggle');
        if (await master.count() && (await master.getAttribute('data-state')) === 'collapsed') await master.click();
        await cardFor(page, page.locator('table.tbl tbody a[href^="/instrument/"]').first());
        expect(errors).toEqual([]);
    });
});
