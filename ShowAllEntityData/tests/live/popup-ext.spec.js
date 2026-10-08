'use strict';

// The external link previews (org/iframe.org, "* generalize to URLs", U1)
// against the REAL sites. The fixture spec (tests/fixtures/popup-ext.spec.js)
// answers every request from a stub; this one shows that today's pages carry
// the links it previews and today's sites fill the cards. On the event page
// of the request (2025-10-26, The Stone Pony): the Brucebase review in the
// "URLs" sub-table — whose http link the site redirects to https: a quiet
// "→ https", not "moved" (decided 2026-10-08) —, the Wikipedia link in the
// annotation, and the annotation's YouTube playlist (the YouTube reader:
// oEmbed, no Live page).
//
// Polite enough for @extended: one MusicBrainz page with one "Show all" (its
// relationships, no pagination), and two external requests, each through the
// script's own per-host gate. GM_xmlhttpRequest is the real-network
// passthrough (tests/support/realNetworkGmXhr.js), which sends the request
// from Node, without the browser's cookies, as `anonymous: true` asks. Both
// hosts are seeded as known (sa_pop_ext_hosts): first contact is the fixture
// spec's to pin, and a hover is what is tested here.

const { test, expect } = require('../support/test');
const { loadUserscriptPageWithRealNetwork } = require('../support/realNetworkGmXhr');
const { collectPageErrors } = require('../support/liveAssertions');
const { waitForRenderComplete } = require('../support/browser');

const EVENT = 'https://musicbrainz.org/event/47b84024-bd3b-4e36-80e1-b051e12ede2f';
const REVIEW = 'http://brucebase.wikidot.com/2025#261025';
const WIKI = 'https://en.wikipedia.org/wiki/TeachRock';

/**
 * Hovers a link until its card shows a loaded answer. On a freshly rendered
 * page a late scroll can hide the card right after it showed; the engine
 * then (rightly) skips the request, and a hidden card keeps its "Loading…"
 * text. So the card must be VISIBLE with "fetched now", and a hidden one is
 * hovered again (the cause of two "stalls" on 2026-10-08: the failure
 * screenshot showed no card at all).
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} link
 * @returns {Promise<import('@playwright/test').Locator>} The card.
 */
async function loadedCard(page, link) {
    const card = page.locator('#mb-dp-peek');
    await expect.poll(async () => {
        if (!await card.isVisible()) {
            await page.mouse.move(0, 0);
            await link.scrollIntoViewIfNeeded();
            await link.hover();
        }
        return (await card.isVisible()) ? card.textContent() : '';
    }, { timeout: 45000, intervals: [500, 1000, 2000] }).toContain('fetched now');
    return card;
}

test.describe('external link previews on the real site', { tag: '@extended' }, () => {
    // No Live page here, so no `trace: 'off'` (the sandboxed frame is what
    // trips the trace recorder: docs/claude/detail-pages.md). Logged in or
    // out makes no difference to an external card.
    test('the Brucebase review (→ https), the annotation\'s Wikipedia link and its YouTube playlist get loaded cards', async ({ page }) => {
        const errors = collectPageErrors(page);
        await loadUserscriptPageWithRealNetwork(page, {
            url: EVENT, testMode: true,
            settingsOverride: {
                sa_pop_ext: true,
                sa_pop_ext_hosts: ['brucebase.wikidot.com', 'en.wikipedia.org'],
                sa_dp_hover_without_ctrl: true,
                sa_rich_tooltip_delay_ms: 0,
                sa_enable_event_overview: true,
            },
        });
        await page.click('button[data-label="Show all Relationships for Event"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });

        // The "URLs" sub-table renders collapsed: open it by its own h3.
        await page.evaluate((u) => {
            const a = document.querySelector(`table.tbl a[href="${u}"]`);
            const t = a && a.closest('table.tbl');
            if (!t || t.getClientRects().length) return;
            let h = t.previousElementSibling;
            while (h && !h.matches('h3.mb-toggle-h3')) h = h.previousElementSibling;
            if (h) h.click();
        }, REVIEW);
        const review = page.locator(`table.tbl a[href="${REVIEW}"]`).first();
        await expect(review).toBeVisible();
        const card = await loadedCard(page, review);
        await expect(card.locator('.mb-ext-host')).toHaveText('brucebase.wikidot.com');
        await expect(card).toContainText('2025');
        await expect(card).toContainText('MusicBrainz: reviews of this event');
        await expect(card.locator('.mb-ext-st'), 'http:// redirected to https:// on the same path is no move').toHaveText('200');
        await expect(card.locator('.mb-ext-https')).toHaveText('→ https');
        await expect(card).not.toContainText('Could not load');

        // The annotation's Wikipedia link (the render collapses the page's h2s).
        const wiki = page.locator(`.annotation a[href="${WIKI}"]`).first();
        if (!await wiki.isVisible()) await page.locator('.annotation h2').first().click();
        await expect(wiki).toBeVisible();
        await page.mouse.move(0, 0);
        await loadedCard(page, wiki);
        await expect(card.locator('.mb-ext-host')).toHaveText('en.wikipedia.org');
        await expect(card).toContainText('TeachRock');
        await expect(card).toContainText('in the annotation');
        await expect(card.locator('.mb-ext-st')).toHaveText('200');

        // The annotation's YouTube playlist: the YouTube reader's ONE oEmbed
        // request, its host in @connect (not seeded), and no Live page.
        const yt = page.locator('.annotation a[href^="https://www.youtube.com/playlist"]').first();
        await expect(yt).toBeVisible();
        await page.mouse.move(0, 0);
        await loadedCard(page, yt);
        await expect(card).toContainText('2025‐10‐26: The Stone Pony');
        await expect(card).toContainText(/A playlist by /);
        await expect(card.locator('.mb-ext-st')).toHaveText('200');
        await page.keyboard.press('Space');
        const dialog = page.locator('#mb-dp-dialog');
        await expect(dialog.locator(':scope > div > span').first()).toHaveText('YouTube');
        await expect(dialog.getByRole('button', { name: 'Live page' })).toBeHidden();
        expect(errors).toEqual([]);
    });
});
