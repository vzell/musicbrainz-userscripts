'use strict';

// The detail-page preview against the REAL sites. The fixture specs
// (tests/fixtures/detail-preview.spec.js) run the parsers on curl captures of
// 2026-10-07; this one shows they still read what each site serves TODAY, in a
// real browser: a known row per site, its card (no "Could not load"), the
// pinned dialog's Extracted view, and on springsteenlyrics.com the Live page
// view with the site's own CSS.
//
// One detail page per site plus the list itself: polite enough to run as
// @extended. Rows are chosen by their detail URL, not by position, so a list
// that grows does not move them.

const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { collectPageErrors } = require('../support/liveAssertions');
const { waitForRenderComplete } = require('../support/browser');

const BIG = { sa_render_threshold: 1000000, sa_render_warning_threshold: 1000000 };

/**
 * springsteenlyrics.com's OWN error on its lyrics pages (the letter list and a
 * song page alike), an unhandled rejection raised once or more per page
 * load: thrown with no userscript loaded at all (checked about
 * 2026-10-07T07:33Z with a bare Chromium). Exempted by exact message, nothing
 * broader, as sl-lists.spec.js does for the site's `init is not defined`.
 * @type {string}
 */
const SL_LYRICS_OWN_ERROR = 'Uncaught (in promise) Error: Container is not defined';

/**
 * Hovers a row's detail link and waits for its card to hold the page's
 * content (not the loading line).
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} link
 */
async function cardFor(page, link) {
    await page.mouse.move(0, 0);
    await link.scrollIntoViewIfNeeded();
    await link.hover();
    const card = page.locator('#mb-dp-peek');
    await expect(card).toBeVisible();
    await expect(card.locator('.mb-tt-foot')).toBeVisible({ timeout: 30000 });
    await expect(card).not.toContainText('Could not load');
    return card;
}

test.describe('detail-page preview on the real sites', { tag: '@extended' }, () => {
    test('springsteenlyrics.com bootleg 6739: tracklist, lineage, scans; Live page with the site\'s CSS', async ({ page }) => {
        test.setTimeout(240000);
        const pageErrors = collectPageErrors(page);
        await loadUserscriptPage(page, {
            url: 'https://www.springsteenlyrics.com/bootlegs.php?cmd=list&category=aud_live2014',
            settingsOverride: { sa_enable_springsteenlyrics: true, sa_sl_detail_preview: true, ...BIG },
        });
        await page.click('button[data-label="Show all bootlegs of this list"]');
        await waitForRenderComplete(page, { waitForAutoResize: false, timeout: 180000 });
        const link = page.locator('table.tbl tbody td a[href*="item=6739"]').filter({ hasNot: page.locator('img') });
        const card = await cardFor(page, link);
        await expect(card).toContainText(/\d+ tracks on 3 discs/);
        await expect(card).toContainText('EAC');

        await page.keyboard.press('Space');
        const dialog = page.locator('#mb-dp-dialog');
        await expect(dialog.locator('.mb-dp-gname')).toHaveText(['Disc 1', 'Disc 2', 'Disc 3']);
        expect(await dialog.locator('.mb-dp-gallery img').count()).toBeGreaterThan(0);

        await dialog.locator('button', { hasText: 'Live page' }).click();
        await expect.poll(() => page.evaluate(() => {
            const doc = document.querySelector('#mb-dp-dialog iframe').contentDocument;
            if (!doc || !doc.documentElement.dataset.mbDpDone) return null;
            const rendered = (sel) => !!doc.querySelector(sel) && doc.querySelector(sel).getClientRects().length > 0;
            return { navbar: rendered('.navbar'), footer: rendered('footer'), detail: rendered('.project-detail') };
        }), { timeout: 30000 }).toEqual({ navbar: false, footer: false, detail: true });
        expect(pageErrors).toEqual([]);
    });

    test('springsteenlyrics.com lyrics index, BADLANDS: version, lyrics by shape, sections', async ({ page }) => {
        // Asserts shapes only: the spec quotes no lyric text.
        test.setTimeout(240000);
        const pageErrors = collectPageErrors(page);
        await loadUserscriptPage(page, {
            url: 'https://www.springsteenlyrics.com/lyrics.php?cmd=list&letter=b',
            settingsOverride: { sa_enable_springsteenlyrics: true, sa_sl_detail_preview: true, ...BIG },
        });
        await page.click('button[data-label="Show all lyrics"]');
        await waitForRenderComplete(page, { waitForAutoResize: false, timeout: 180000 });
        const card = await cardFor(page, page.locator('table.tbl tbody a[href$="lyrics.php?song=badlands"]'));
        await expect(card.locator('.mb-tt-title')).toHaveText('BADLANDS');
        await expect(card).toContainText('Album version');
        expect(await card.locator('.mb-dp-excerpt').evaluate((el) => el.innerText.split('\n').filter(Boolean).length)).toBe(4);
        await expect(card).toContainText(/Lyrics: \d+ lines/);
        await page.keyboard.press('Space');
        const dialog = page.locator('#mb-dp-dialog');
        await expect(dialog.locator('.mb-dp-col').last().locator('h4').first()).toHaveText('Lyrics');
        await expect(dialog.locator('h4', { hasText: 'Available Versions' })).toHaveCount(1);
        expect(pageErrors.filter((e) => e !== SL_LYRICS_OWN_ERROR)).toEqual([]);
    });

    test('jungleland.it 1976-09-30: uploader and scans from a windows-1252 page', async ({ page }) => {
        test.setTimeout(300000);
        const pageErrors = collectPageErrors(page);
        await loadUserscriptPage(page, {
            url: 'https://www.jungleland.it/html/list.htm',
            settingsOverride: { sa_enable_jungleland: true, sa_jl_detail_preview: true, ...BIG },
        });
        await page.click('button[data-label="Show all bootlegs of this list"]');
        await waitForRenderComplete(page, { waitForAutoResize: false, timeout: 240000 });
        const card = await cardFor(page, page.locator('table.tbl tbody a[href$="/html/19760930.htm"]'));
        await expect(card.locator('.mb-tt-title')).toHaveText('Santa Monica - 30 September 1976');
        await expect(card).toContainText('Olli2605');
        await expect(card.locator('img.mb-dp-cover')).toHaveCount(1);
        expect(pageErrors).toEqual([]);
    });

    test('brucespringsteen.it CR1AD1: the label run and a tracklist from one show', async ({ page }) => {
        test.setTimeout(240000);
        const pageErrors = collectPageErrors(page);
        await loadUserscriptPage(page, {
            url: 'https://www.brucespringsteen.it/DB/records.aspx?tipe=-1,4&sort=0',
            settingsOverride: { sa_enable_brucespringsteen: true, sa_bs_detail_preview: true },
        });
        await page.click('h1.mb-bs-h1 button[data-label="Unofficial"]');
        await waitForRenderComplete(page, { waitForAutoResize: false, timeout: 180000 });
        const card = await cardFor(page, page.locator('table.tbl tbody a[href*="code=CR1AD1"]'));
        await expect(card).toContainText('Anubis Records');
        await expect(card).toContainText(/\d+ tracks on 2 discs/);
        await expect(card.locator('.mb-dp-src')).toHaveCount(1);
        await expect(card.locator('.mb-dp-src')).toContainText('Tampa,FL,Jai Alai(USA) 10-Nov-1975');
        expect(pageErrors).toEqual([]);
    });

    test('Brucebase 4th Of July: performance count, last show, lyrics', async ({ page }) => {
        test.setTimeout(240000);
        const pageErrors = collectPageErrors(page);
        await loadUserscriptPage(page, {
            url: 'https://brucebase.wikidot.com/stats:songs',
            settingsOverride: { sa_enable_brucebase: true, sa_bb_detail_preview: true },
        });
        await page.click('button[data-label="Show all songs"]');
        await waitForRenderComplete(page, { waitForAutoResize: false, timeout: 120000 });
        const card = await cardFor(page, page.locator('table.tbl tbody a[href$="/song:4th-of-july-asbury-park-sandy"]'));
        await expect(card.locator('.mb-dp-stat')).toHaveText(/^[\d,]+ live performances$/);
        await expect(card).toContainText('Last played');
        await expect(card).toContainText('Track 2 of The Wild, The Innocent & The E Street Shuffle, 1973.');
        await page.keyboard.press('Space');
        // The lyrics, by shape: the spec quotes no lyric text.
        await expect(page.locator('#mb-dp-dialog h4').last()).toHaveText('Lyrics');
        expect(await page.locator('#mb-dp-dialog .mb-dp-section').last().evaluate((el) => el.textContent.split('\n').filter(Boolean).length))
            .toBeGreaterThan(20);
        expect(pageErrors).toEqual([]);
    });
});
