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
// spec's to pin, and a hover is what is tested here. U2 adds a second test:
// the review's "[info]" card and "MusicBrainz knows this URL" (two Web
// Service requests, through the script's MusicBrainz gate).

const { test, expect } = require('../support/test');
const { loadUserscriptPageWithRealNetwork } = require('../support/realNetworkGmXhr');
const { collectPageErrors } = require('../support/liveAssertions');
const { waitForRenderComplete } = require('../support/browser');

const EVENT = 'https://musicbrainz.org/event/47b84024-bd3b-4e36-80e1-b051e12ede2f';
const REVIEW = 'http://brucebase.wikidot.com/2025#261025';
// The review's URL entity, its "[info]" link (U0 X7).
const REVIEW_URL_ID = '7c36bf3a-15d4-4b1f-afaa-40847960e3e0';
const WIKI = 'https://en.wikipedia.org/wiki/TeachRock';
// "Greetings From Asbury Park, N.J." (U3: its sidebar links Wikidata and Discogs).
const RG = 'https://musicbrainz.org/release-group/c497fc44-ddaf-3cce-a9b4-bfec958a0f3c';

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
        // The site's icon (sa_pop_ext_favicons, on by default): the page's own
        // <link rel="icon"> on brucebase.wikidot.com, loaded anonymously.
        await expect(card.locator('img.mb-ext-favimg')).toHaveAttribute('src', /^data:image\//, { timeout: 15000 });
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
        // U3: the Wikipedia reader (the REST summary), not the page's <head>.
        await expect(card).toContainText('Wikipedia (en)');
        await expect(card).toContainText('Steven Van Zandt');
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

    // U2: two Web Service requests in all (the url lookup by the "[info]"
    // MBID, which the review's window then reuses, and one ?resource= lookup)
    // plus the two external pages.
    test('U2: the review\'s "[info]" card, its window\'s "MusicBrainz knows this URL", and the annotation\'s Wikipedia link not in MusicBrainz', async ({ page }) => {
        const errors = collectPageErrors(page);
        const ws2 = [];
        page.on('request', (r) => { if (r.url().includes('/ws/2/url')) ws2.push(r.url()); });
        await loadUserscriptPageWithRealNetwork(page, {
            url: EVENT, testMode: true,
            settingsOverride: {
                sa_pop_ext: true,
                sa_pop_mb: true,
                sa_pop_ext_hosts: ['brucebase.wikidot.com', 'en.wikipedia.org'],
                sa_dp_hover_without_ctrl: true,
                sa_rich_tooltip_delay_ms: 0,
                sa_enable_event_overview: true,
            },
        });
        await page.click('button[data-label="Show all Relationships for Event"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await page.evaluate((u) => {
            const a = document.querySelector(`table.tbl a[href="${u}"]`);
            const t = a && a.closest('table.tbl');
            if (!t || t.getClientRects().length) return;
            let h = t.previousElementSibling;
            while (h && !h.matches('h3.mb-toggle-h3')) h = h.previousElementSibling;
            if (h) h.click();
        }, REVIEW);

        // The "[info]" link beside the review: MusicBrainz's URL entity.
        const info = page.locator(`table.tbl a[href="/url/${REVIEW_URL_ID}"]`).first();
        await expect(info).toBeVisible();
        const card = await loadedCard(page, info);
        await expect(card.locator('.mb-tt-title')).toHaveText('brucebase.wikidot.com');
        await expect(card.locator('.mb-ext-url')).toHaveText(REVIEW);
        await expect(card.locator('dt')).toContainText(['Review']);
        await expect(card.locator('dd a[href="/event/47b84024-bd3b-4e36-80e1-b051e12ede2f"]')).toContainText('2025‐10‐26: The Stone Pony');

        // The review's own window: the same answer, no second request.
        const dialog = page.locator('#mb-dp-dialog');
        const review = page.locator(`table.tbl a[href="${REVIEW}"]`).first();
        await page.mouse.move(0, 0);
        await loadedCard(page, review);
        await page.keyboard.press('Space');
        await expect(dialog.locator('h4', { hasText: 'MusicBrainz knows this URL' })).toBeVisible();
        await expect(dialog.locator('.mb-dp-area a[href="/event/47b84024-bd3b-4e36-80e1-b051e12ede2f"]')).toBeVisible({ timeout: 15000 });
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();

        // The annotation's Wikipedia link is no URL entity (U0 X7).
        const wiki = page.locator(`.annotation a[href="${WIKI}"]`).first();
        if (!await wiki.isVisible()) await page.locator('.annotation h2').first().click();
        await expect(wiki).toBeVisible();
        await page.mouse.move(0, 0);
        await loadedCard(page, wiki);
        await page.keyboard.press('Space');
        await expect(dialog.locator('.mb-ext-mb-none')).toHaveText('Not in MusicBrainz: no entity links this URL — it is only in the annotation.',
            { timeout: 15000 });
        expect(ws2.map(u => u.replace(/inc=[^&]*&/, '')), 'one lookup by MBID, one by resource').toEqual([
            `https://musicbrainz.org/ws/2/url/${REVIEW_URL_ID}?fmt=json`,
            `https://musicbrainz.org/ws/2/url?resource=${encodeURIComponent(WIKI)}&fmt=json`,
        ]);
        expect(errors).toEqual([]);
    });

    // U3: the Wikidata and Discogs readers against the real APIs, on the
    // sidebar's external links of "Greetings From Asbury Park, N.J." (the
    // release group page; no "Show all": the sidebar is native). Two API
    // requests, each through its host's gate; Discogs without a token. Its
    // Wikidata link is protocol-relative, as MusicBrainz writes it (the
    // first run found that no card came for it). Wikipedia's reader is the
    // first test's annotation link.
    test('U3: the release group\'s Wikidata and Discogs links read from the sites\' APIs', async ({ page }) => {
        const errors = collectPageErrors(page);
        await loadUserscriptPageWithRealNetwork(page, {
            url: RG, testMode: true,
            settingsOverride: { sa_pop_ext: true, sa_dp_hover_without_ctrl: true, sa_rich_tooltip_delay_ms: 0 },
        });
        const card = page.locator('#mb-dp-peek');
        const sidebar = page.locator('ul.external_links');
        const wd = sidebar.locator('a[href*="wikidata.org/wiki/Q"]').first();
        const dg = sidebar.locator('a[href*="discogs.com/master/"]').first();
        await expect(wd, 'the release group links its Wikidata item').toHaveCount(1);
        await expect(dg, 'and its Discogs master').toHaveCount(1);
        if (!await wd.isVisible()) await page.locator('#sidebar h2').filter({ hasText: /External links/i }).first().click();

        await loadedCard(page, wd);
        await expect(card.locator('.mb-ext-host')).toHaveText('www.wikidata.org');
        await expect(card).toContainText('Wikidata');
        await expect(card).toContainText('Greetings from Asbury Park');
        await expect(card.locator('.mb-ext-st')).toHaveText('200');

        await page.mouse.move(0, 0);
        await loadedCard(page, dg);
        await expect(card).toContainText('Discogs');
        await expect(card.locator('.mb-tt-title')).toContainText(/Greetings From Asbury Park/i);
        await expect(card).toContainText('1973');
        expect(errors).toEqual([]);
    });
});
