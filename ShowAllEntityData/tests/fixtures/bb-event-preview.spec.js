'use strict';

// org/TODO.org "Some enhancements" 3b (vzell, 2026-10-24): "When hovering
// the cell data of the new Event column, the event detail from the
// underlying page should be opened in a popup (+ Space accessible)".
// Mockup https://claude.ai/artifact/DmsNyUkUa1Hq8nPr2B5EGA.
//
// vzell, the same night: "on all BB PTs where an event href is involved in a
// column or elsewhere, the event detail hovering should work".
//
// Pinned: the card shows what the ENTRY PAGE adds (fields read from the
// fixture, not merely "a card"); Space pins it into the window with the
// sections; EVERY text link to an event page previews it (Event, Venue,
// Recent changes, the wiki's own page before any button), a Media icon
// (an <img> link) stays the image card's (bb-image-card.spec.js); the
// setting is its own, independent of the song preview; ← → step through
// the rows' Event links, never into a Notes song link.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadBbYearPage, loadBbChangesPage, loadBbSongsPage, BB_YEAR_BUTTON, BB_BUTTON, revealPastStickyColumn } = require('../support/bbFixture');
const { routeDetailPages } = require('../support/detailFixture');
const { waitForRenderComplete } = require('../support/browser');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const GIG13 = 'https://brucebase.wikidot.com/gig:1985-01-13-carolina-coliseum-columbia-sc';

const peek = (page) => page.locator('#mb-dp-peek');
const dialog = (page) => page.locator('#mb-dp-dialog');
const eventLink = (page, href) => page.locator(`table.tbl tbody a.mb-bb-event-link[href="${href}"]`).first();

/**
 * The 1985 year page, rendered; entry pages and images routed.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object<string, *>} [settings]
 * @returns {Promise<{errors: string[], served: string[]}>}
 */
async function openYear(page, settings = {}) {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    await loadBbYearPage(page, '1985', { settingsOverride: { sa_render_threshold: 100000, ...settings } });
    const { served } = await routeDetailPages(page, 'bb');
    await page.route(/^https:\/\/brucebase\.wdfiles\.com\//, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    await page.click(`button[data-label="${BB_YEAR_BUTTON}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
    return { errors, served };
}

/**
 * Rests the pointer on a link with Ctrl held, from outside.
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} link
 * @returns {Promise<void>}
 */
async function ctrlHover(page, link) {
    await page.mouse.move(0, 0);
    await link.scrollIntoViewIfNeeded();
    await page.keyboard.down('Control');
    await link.hover();
    await page.keyboard.up('Control');
}

test('the reader: an entry page\'s Scheduled, On stage, Setlist, images and tabs, and the window\'s sections', async ({ page }) => {
    await loadBbYearPage(page, '1985');
    const html = fs.readFileSync(path.join(__dirname, 'detail-bb-gig-1985-01-13.html'), 'utf8');
    const rec = await page.evaluate(([h, u]) => window.__saTest.dpParse('brucebase.wikidot.com', h, u), [html, GIG13]);
    const f = Object.fromEntries(rec.fields);
    expect(rec.title).toBe('1985-01-13 Carolina Coliseum, Columbia, SC');
    expect(f.Scheduled).toBe('19:30 · start and end not known');
    expect(f['On stage']).toBe('Bruce Springsteen, The E Street Band (Roy Bittan, Clarence Clemons, Danny Federici, ' +
        'Nils Lofgren, Patti Scialfa, Garry Tallent, Max Weinberg)');
    // Titles are off in a converter spec: the site's capitals.
    expect(f.Setlist).toMatch(/^28 songs: BORN IN THE U\.S\.A\., OUT IN THE STREET, DARLINGTON COUNTY … \S/);
    expect(f.Images).toBe('8: Photo 2 · Memorabilia 1 · Setlist 2 · Ticket 2 · News 1');
    // "Sorry, no Media available." is no content.
    expect(f['On the page'].split(' · ')).not.toContain('Media');
    expect(f['On the page'].split(' · ')).toEqual(expect.arrayContaining(['On Stage', 'Setlist', 'Performances', 'Recording', 'Storyteller', 'Eyewitness']));
    expect(rec.sections.map(s => s.label)).toEqual(['On stage', 'Setlist (28)', 'Performances', 'Recording', 'Storyteller', 'Eyewitness', 'News/Memorabilia']);
    expect(rec.sections.find(s => s.label === 'Setlist (28)').text.split('\n')[0]).toBe('1. BORN IN THE U.S.A.');
});

test('Recent changes: a changed event page\'s link previews it (any Brucebase page)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    await loadBbChangesPage(page);
    const { served } = await routeDetailPages(page, 'bb');
    const link = page.locator('a[href="/interview:1978-09-23-boardwalk-asbury-park-nj"]').first();
    await ctrlHover(page, link);
    // No fixture for that page: answered 404, and the card says so — it is
    // the preview's card all the same.
    await expect(peek(page)).toBeVisible();
    await expect.poll(() => served).toEqual(['https://brucebase.wikidot.com/interview:1978-09-23-boardwalk-asbury-park-nj']);
    expect(errors).toEqual([]);
});

test.describe('bb-year: the Event column\'s preview (2026-10-24)', () => {
    test('Ctrl+hover on Event: ONE request, the card with what the entry page adds; Space: the window with its sections', async ({ page }) => {
        const { errors, served } = await openYear(page);
        await ctrlHover(page, eventLink(page, GIG13));
        await expect(peek(page)).toBeVisible();
        await expect(peek(page)).toContainText('1985-01-13 Carolina Coliseum, Columbia, SC');
        await expect(peek(page)).toContainText('19:30 · start and end not known');
        await expect(peek(page)).toContainText('Bruce Springsteen, The E Street Band (Roy Bittan');
        await expect(peek(page)).toContainText('28 songs');
        expect(served).toEqual([GIG13]);
        await page.keyboard.press('Space');
        await expect(dialog(page)).toBeVisible();
        await expect(dialog(page).locator('.mb-dp-xtitle')).toHaveText('1985-01-13 Carolina Coliseum, Columbia, SC');
        await expect(dialog(page).locator('h4')).toContainText(['On stage', 'Setlist (28)', 'Performances', 'Recording']);
        expect(served, 'the window reads the record the card read').toEqual([GIG13]);
        expect(errors).toEqual([]);
    });

    test('← → in the window step through the rows\' Event links', async ({ page }) => {
        const { errors, served } = await openYear(page);
        await ctrlHover(page, eventLink(page, GIG13));
        await expect(peek(page)).toContainText('Carolina Coliseum');
        await page.keyboard.press('Space');
        await expect(dialog(page).locator('.mb-dp-xtitle')).toHaveText('1985-01-13 Carolina Coliseum, Columbia, SC');
        await page.keyboard.press('ArrowLeft');
        // The row before 01-13 is 01-10 (Freedom Hall): its entry page, not a song.
        await expect.poll(() => served.length).toBe(2);
        expect(served[1]).toMatch(/\/gig:1985-01-10-/);
        expect(errors).toEqual([]);
    });

    test('a Venue link to the event page previews it too', async ({ page }) => {
        await page.setViewportSize({ width: 1920, height: 1000 });
        const { errors, served } = await openYear(page);
        const venue = page.locator(`table.tbl tbody td a[href="${GIG13}"]:not(.mb-bb-event-link):not(.mb-fi-media)`).first();
        await expect(venue).toHaveText('CAROLINA COLISEUM');
        await page.mouse.move(0, 0);
        await revealPastStickyColumn(page, venue);
        await page.keyboard.down('Control');
        await venue.hover();
        await page.keyboard.up('Control');
        await expect(peek(page)).toContainText('28 songs');
        expect(served).toEqual([GIG13]);
        expect(errors).toEqual([]);
    });

    test('the year page before any button: an entry heading\'s own link previews its page', async ({ page }) => {
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
        await loadBbYearPage(page, '1985');
        const { served } = await routeDetailPages(page, 'bb');
        const heading = page.locator('#page-content strong > a[href="/gig:1985-01-13-carolina-coliseum-columbia-sc"]').first();
        await ctrlHover(page, heading);
        await expect(peek(page)).toContainText('28 songs');
        expect(served).toEqual([GIG13]);
        expect(errors).toEqual([]);
    });

    test('its own setting: off, no card; on with the song preview off, the card all the same', async ({ page }) => {
        const off = await openYear(page, { sa_bb_event_preview: false, sa_bb_detail_preview: true });
        await ctrlHover(page, eventLink(page, GIG13));
        // Past the card's delay: hidden then means none.
        await page.evaluate(() => new Promise(r => setTimeout(r, 600)));
        await expect(peek(page)).toBeHidden();
        expect(off.served).toEqual([]);
        expect(off.errors).toEqual([]);
    });

    test('with the song preview off (its default), the Event preview still works', async ({ page }) => {
        const { errors, served } = await openYear(page, { sa_bb_detail_preview: false });
        await ctrlHover(page, eventLink(page, GIG13));
        await expect(peek(page)).toContainText('28 songs');
        expect(served).toEqual([GIG13]);
        expect(errors).toEqual([]);
    });
});

// vzell, 2026-10-24 (the same night): the window's sections collapsible;
// the relations of On stage, the songs of Setlist and the shows of
// Performances linked, opening in the window and previewed on hover; the
// images under their kind, Photo last; the same on a song's window.
test.describe('the Brucebase window: collapsible, linked sections; images by kind (2026-10-24)', () => {
    /**
     * Opens 1985-01-13's window from its Event cell.
     * @param {import('@playwright/test').Page} page
     * @param {Object<string, *>} [settings]
     * @returns {Promise<{errors: string[], served: string[]}>}
     */
    async function openWindow(page, settings = {}) {
        const r = await openYear(page, settings);
        await ctrlHover(page, eventLink(page, GIG13));
        await expect(peek(page)).toContainText('28 songs');
        await page.keyboard.press('Space');
        await expect(dialog(page).locator('.mb-dp-xtitle')).toHaveText('1985-01-13 Carolina Coliseum, Columbia, SC');
        return r;
    }

    test('the sections fold: a click on a heading closes it, and it stays closed for the next record', async ({ page }) => {
        const { errors } = await openWindow(page);
        const sec = (name) => dialog(page).locator(`details.mb-dp-sec[data-mb-dp-sec="${name}"]`);
        await expect(sec('On stage')).toHaveAttribute('open', '');
        await sec('On stage').locator('summary').click();
        await expect(sec('On stage')).not.toHaveAttribute('open', /.*/);
        await expect(sec('On stage').locator('.mb-dp-section')).toBeHidden();
        // ← three rows back: 01-10 and 01-08 have no fixture (404), 01-07 has.
        for (let k = 0; k < 3; k++) await page.keyboard.press('ArrowLeft');
        await expect(dialog(page).locator('.mb-dp-xtitle')).toContainText('1985-01-07', { timeout: 15000 });
        await expect(sec('On stage')).not.toHaveAttribute('open', /.*/);
        expect(errors).toEqual([]);
    });

    test('On stage, Setlist and Performances are linked: people, songs, shows', async ({ page }) => {
        const { errors } = await openWindow(page);
        const links = (name) => dialog(page).locator(`details.mb-dp-sec[data-mb-dp-sec="${name}"] .mb-dp-section a`);
        await expect(links('On stage').first()).toHaveAttribute('href', /^https:\/\/brucebase\.wikidot\.com\/relation:/);
        expect(await links('On stage').count()).toBeGreaterThanOrEqual(9);
        await expect(links('Setlist')).toHaveCount(28);
        await expect(links('Setlist').first()).toHaveAttribute('href', 'https://brucebase.wikidot.com/song:born-in-the-u-s-a');
        await expect(links('Performances').filter({ hasText: '1981-02-22' })).toHaveAttribute('href', /\/gig:1981-02-22-/);
        expect(errors).toEqual([]);
    });

    test('a show in Performances: Ctrl+hover shows its card, a click opens it in the window, Back returns', async ({ page }) => {
        const { errors, served } = await openWindow(page);
        const show = dialog(page).locator('details.mb-dp-sec[data-mb-dp-sec="Performances"] .mb-dp-section a', { hasText: '1981-02-22' });
        await show.scrollIntoViewIfNeeded();
        await page.mouse.move(0, 0);
        await page.keyboard.down('Control');
        await show.hover();
        await page.keyboard.up('Control');
        await expect.poll(() => served).toContain('https://brucebase.wikidot.com/gig:1981-02-22-carolina-coliseum-columbia-sc');
        await show.click();
        // No fixture for that page (404): the window says so, in place.
        await expect(dialog(page)).toContainText('Could not load the detail page');
        await page.keyboard.press('Backspace');
        await expect(dialog(page).locator('.mb-dp-xtitle')).toHaveText('1985-01-13 Carolina Coliseum, Columbia, SC');
        expect(errors).toEqual([]);
    });

    test('the images under their kind, in page order, Photo last; the viewer follows that order', async ({ page }) => {
        const { errors } = await openWindow(page);
        const kinds = await dialog(page).locator('h5.mb-dp-kind').evaluateAll(hs => hs.map(h => h.firstChild.textContent.trim()));
        expect(kinds[kinds.length - 1]).toBe('Photo');
        expect([...kinds].sort()).toEqual(['Memorabilia', 'News', 'Photo', 'Setlist', 'Ticket']);
        const order = await dialog(page).locator('a[data-mb-artv-ext]').evaluateAll(as => as.map(a => Number(a.dataset.mbArtvExt)));
        expect(order).toEqual([...order].sort((a, b) => a - b));
        expect(errors).toEqual([]);
    });

    test('a song\'s window: its sections fold and its Performances (closed at first) link every show', async ({ page }) => {
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
        await loadBbSongsPage(page, { settingsOverride: { sa_render_threshold: 100000, sa_bb_detail_preview: true } });
        await routeDetailPages(page, 'bb');
        await page.click(`button[data-label="${BB_BUTTON}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const title = page.locator('table.tbl tbody a[href="https://brucebase.wikidot.com/song:4th-of-july-asbury-park-sandy"]').first();
        await ctrlHover(page, title);
        await expect(peek(page)).toBeVisible();
        await page.keyboard.press('Space');
        const perf = dialog(page).locator('details.mb-dp-sec[data-mb-dp-sec="Performances"]');
        await expect(perf).toHaveCount(1);
        await expect(perf).not.toHaveAttribute('open', /.*/);
        await perf.locator('summary').click();
        await expect(perf.locator('.mb-dp-section a[href*="/gig:"]').first()).toBeVisible();
        // 250 shows (and three other links of the tab's text).
        expect(await perf.locator('.mb-dp-section a[href*="/gig:"], .mb-dp-section a[href*="/nogig:"], .mb-dp-section a[href*="/recording:"], .mb-dp-section a[href*="/rehearsal:"]').count()).toBe(250);
        await expect(dialog(page).locator('details.mb-dp-sec[data-mb-dp-sec="Credits"]')).toHaveAttribute('open', '');
        expect(errors).toEqual([]);
    });
});
