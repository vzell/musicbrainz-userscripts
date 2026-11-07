'use strict';

// brucespringsteen.it: the song and show pages as link previews (2026-11-06,
// bs-record; org/brucespringsteen.it.org, mockup
// https://claude.ai/artifact/XULiW1dUFME9F4nbsrQokD). A record page's song
// links (the site's `hs()`, `sd3.aspx?sid=`) and show links (`helps()`,
// `mn.aspx?ex=`) are `href="#"` script links; `_bsFixScriptLinks()` gives
// them their pages, so they preview on the initial page as in the rendered
// table: a card on Ctrl+hover, the window on Space. A show's "Found on"
// records open in the same window, with Back. Fixtures:
// scripts/build-detail-fixtures.py (the song's lyrics blanked) and
// scripts/build-bs-fixtures.py.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadBsRecordPage } = require('../support/bsFixture');
const { waitForRenderComplete } = require('../support/browser');

const BS = 'https://www.brucespringsteen.it/DB/';
const fixtureHtml = name => fs.readFileSync(path.join(__dirname, name), 'utf8');
const peek = page => page.locator('#mb-dp-peek');
const dialog = page => page.locator('#mb-dp-dialog');
// The fixture profile forces the foreign previews off (FIXTURE_SETTINGS_OVERRIDE).
const ON = { sa_bs_detail_preview: true };

/**
 * Hovers a link with Ctrl held (the default way to ask for its card) and
 * waits for the card to show.
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} link
 * @returns {Promise<void>}
 */
async function peekAt(page, link) {
    await page.mouse.move(0, 0);
    await link.scrollIntoViewIfNeeded();
    await page.keyboard.down('Control');
    await link.hover();
    await page.keyboard.up('Control');
    await expect(peek(page)).toBeVisible();
}

/**
 * Presses the record page's button and waits for the render.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function show(page) {
    await page.click('h1.mb-bs-h1 button[data-label="Show the tracklist"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/**
 * The detail pages of this host asked so far, without the record page itself.
 *
 * @param {string[]} served
 * @param {string} code The record page's code.
 * @returns {string[]}
 */
const asked = (served, code) => served.filter(u => u !== `${BS}detrec.aspx?code=${code}`);

test.describe('brucespringsteen.it song and show pages: the parsers', () => {
    test('a song: its versions as sections, the first version\'s opening as the card\'s excerpt', async ({ page }) => {
        await loadBsRecordPage(page, 'COLPC2368543');
        const r = await page.evaluate(([h, u]) => window.__saTest.dpParse('brucespringsteen.it', h, u),
            [fixtureHtml('detail-bs-song-586.html'), `${BS}sd3.aspx?sid=586`]);
        expect(r.title).toBe('The ties that bind');
        expect(r.subtitle).toBe('Song · 5 versions');
        expect(r.fields).toEqual([['Versions', '5'], ['Song number', '586']]);
        expect(r.sections.map(s => s.label)).toEqual([
            'The ties that bind - "The river" take', 'The ties that bind - Early 1978 take', 'The ties that bind - 15-Dec-1978',
            'The ties that bind - Early studio outtake 1', 'The ties that bind - Early studio outtake 2',
        ]);
        // The lyrics are blanked in the fixture ("la"): their shape is what counts.
        expect(r.excerpt.label).toBe('Lyrics');
        expect(r.excerpt.lines).toHaveLength(4);
        expect(r.excerpt.total).toBeGreaterThan(20);
        expect(r.sections[0].text).toMatch(/\n\nNotes: Played since 1978\.$/);
        expect(r.sections[1].text).toMatch(/Notes: Very early take \(1978 live\?\) Pretty different from the released one\.$/);
        // 15-Dec-1978 has no Notes paragraph.
        expect(r.sections[2].text).not.toContain('Notes:');
        // Every lyric line is the fixture's "la" words: no other word leaked.
        const lyric = r.sections[0].text.split('\n\nNotes:')[0].split('\n').filter(Boolean);
        expect(lyric.filter(l => /[A-Za-z]/.test(l.replace(/\bla\b/g, '')))).toEqual([]);
        expect(lyric.length).toBe(r.excerpt.total);
        expect(r.collapsible).toBe(true);
    });

    test('a live show: date, venue, country, the numbered setlist, a remark kept, the records it is on', async ({ page }) => {
        await loadBsRecordPage(page, 'COLPC2368543');
        const r = await page.evaluate(([h, u]) => window.__saTest.dpParse('brucespringsteen.it', h, u),
            [fixtureHtml('detail-bs-show-199905021.html'), `${BS}mn.aspx?ex=199905021`]);
        expect(r.title).toBe('Manchester Evening News Arena');
        expect(r.subtitle).toBe('1999-05-02 · GB · Live');
        expect(r.fields).toEqual([['Date', '1999-05-02'], ['Venue', 'Manchester Evening News Arena'], ['Country', 'GB'], ['Kind', 'Live'], ['Songs', '24']]);
        expect(r.tracks).toHaveLength(24);
        expect(r.tracks[0]).toEqual({ disc: '', pos: '01', title: 'Badlands', from: '' });
        expect(r.tracks[13].title).toBe('Working on the highway [Including "Promised land" by C.Berry]');
        expect(r.notes).toEqual([]);
        const found = r.sections.find(s => s.label === 'Found on (7)');
        expect(found.text.split('\n')).toEqual([
            'CD-R · 30 TRACKS IN MANCHESTER', 'CD-R · EUROPEAN GEMS: MAY-JUNE 1999 (Fakida Records)', 'CD-R · EUROPEAN HIGHLIGHTS 1999 PART TWO',
            'CD-R · IT\'S ONE FOR THE MONEY… (Doberman)', 'CD-R · IT\'S TWO FOR THE SHOW (Doberman)', 'CD-R · ROCK\'N\'ROLL IS BACK IN TOWN',
            'DVD · MANCHESTER 1999-05-02',
        ]);
        expect(found.html).toContain(`<a href="${BS}detrec.aspx?code=CR3TIM1" target="_blank" rel="noopener">30 TRACKS IN MANCHESTER</a>`);
        expect(r.highlight).toEqual({ value: '7', label: 'records with songs from this show' });
        expect(r.collapsible).toBe(true);
    });

    test('an album release ("S" code): "Version 99 -" lines become a numbered list, "[Released version]" dropped, the remark and Notes kept', async ({ page }) => {
        await loadBsRecordPage(page, 'COLPC2368543');
        const r = await page.evaluate(([h, u]) => window.__saTest.dpParse('brucespringsteen.it', h, u),
            [fixtureHtml('detail-bs-show-S198010101.html'), `${BS}mn.aspx?ex=S198010101`]);
        expect(r.title).toBe('Album release The river');
        expect(r.subtitle).toBe('1980-10-10 · USA · Release / studio');
        expect(r.tracks).toHaveLength(20);
        expect(r.tracks[0]).toEqual({ disc: '', pos: '01', title: 'The ties that bind', from: '' });
        expect(r.tracks[19]).toEqual({ disc: '', pos: '20', title: 'Wreck on the Highway', from: '' });
        expect(r.notes).toEqual(['This date is a DUMMY DATE indicating the generic period', 'This dummy session represents the album release.']);
        expect(r.sections.map(s => s.label)).toEqual(['Found on (48)']);
    });

    test('a show with a long Notes text: two songs, every paragraph of the notes', async ({ page }) => {
        await loadBsRecordPage(page, 'COLPC2368543');
        const r = await page.evaluate(([h, u]) => window.__saTest.dpParse('brucespringsteen.it', h, u),
            [fixtureHtml('detail-bs-show-197301312.html'), `${BS}mn.aspx?ex=197301312`]);
        expect(r.subtitle).toBe('1973-01-31 · USA · Live');
        expect(r.title).toBe('New York,NY Max\'s Kansas City');
        expect(r.tracks.map(t => t.title)).toEqual(['The ballad of the architect angel', 'Song to the orphans']);
        expect(r.notes).toHaveLength(1);
        expect(r.notes[0]).toMatch(/^The SECOND show of the night opens/);
        expect(r.notes[0]).toMatch(/There is no genuine live performance of "Vibes Man" known\.$/);
    });
});

test.describe('brucespringsteen.it record page: previews of its song and show links', () => {
    test('initial page: a song link\'s card and window, one request, the hecan-free page', async ({ page }) => {
        const { served, errors } = await loadBsRecordPage(page, 'COLPC2368543', { settingsOverride: ON });
        const link = page.locator('.mb-bs-record-native a[href$="sd3.aspx?sid=586"]').first();
        await peekAt(page, link);
        await expect(peek(page)).toContainText('The ties that bind');
        await expect(peek(page)).toContainText('Song · 5 versions');
        await expect(peek(page)).toContainText(/Lyrics: \d+ lines \(Space for all\)/);
        expect(asked(served, 'COLPC2368543')).toEqual([`${BS}sd3.aspx?sid=586`]);
        await page.keyboard.press('Space');
        await expect(dialog(page).locator('.mb-dp-xtitle')).toHaveText('The ties that bind');
        await expect(dialog(page).locator('details.mb-dp-sec')).toHaveCount(5);
        expect(asked(served, 'COLPC2368543')).toHaveLength(1);
        expect(errors).toEqual([]);
    });

    test('initial page: a show link\'s card (an album release)', async ({ page }) => {
        const { served } = await loadBsRecordPage(page, 'COLPC2368543', { settingsOverride: ON });
        const link = page.locator('.mb-bs-record-native a[href$="mn.aspx?ex=S198010101"]').first();
        await peekAt(page, link);
        await expect(peek(page)).toContainText('Album release The river');
        await expect(peek(page)).toContainText('1980-10-10 · USA · Release / studio');
        await expect(peek(page)).toContainText('20 tracks');
        await expect(peek(page)).toContainText('48 records with songs from this show');
        expect(asked(served, 'COLPC2368543')).toEqual([`${BS}mn.aspx?ex=S198010101`]);
    });

    test('rendered table: a show\'s window, its "Found on" record opens in the window, Back returns', async ({ page }) => {
        const { served, errors } = await loadBsRecordPage(page, 'CR3TIM1', { settingsOverride: ON });
        await show(page);
        expect(asked(served, 'CR3TIM1'), 'the press asks nothing').toEqual([]);
        // Three sub-tables start closed, as on every multi-table page but
        // release-tracks: open Disc 1.
        await page.locator('h3.mb-toggle-h3', { hasText: 'Disc 1' }).click();
        const link = page.locator('table.tbl tbody a[href$="mn.aspx?ex=199905021"]').first();
        await expect(link).toHaveAttribute('target', '_blank');
        await peekAt(page, link);
        await expect(peek(page)).toContainText('Manchester Evening News Arena');
        await expect(peek(page)).toContainText('24 tracks');
        await page.keyboard.press('Space');
        await expect(dialog(page).locator('.mb-dp-xtitle')).toHaveText('Manchester Evening News Arena');
        const rec = dialog(page).locator('details.mb-dp-sec[data-mb-dp-sec="Found on"] .mb-dp-section a', { hasText: '30 TRACKS IN MANCHESTER' });
        await rec.scrollIntoViewIfNeeded();
        await page.mouse.move(0, 0);
        await rec.click();
        await expect(dialog(page).locator('.mb-dp-xtitle')).toHaveText('30 TRACKS IN MANCHESTER');
        await expect(dialog(page)).toContainText('Tracklist · 30 tracks');
        expect(asked(served, 'CR3TIM1')).toEqual([`${BS}mn.aspx?ex=199905021`]);
        // The record page itself: once for the tab, once for the window.
        expect(served.filter(u => u === `${BS}detrec.aspx?code=CR3TIM1`)).toHaveLength(2);
        await page.keyboard.press('Backspace');
        await expect(dialog(page).locator('.mb-dp-xtitle')).toHaveText('Manchester Evening News Arena');
        expect(page.context().pages()).toHaveLength(1);
        expect(errors).toEqual([]);
    });

    test('preview setting off: no card on the song links, the links still have their pages', async ({ page }) => {
        const { served } = await loadBsRecordPage(page, 'COLPC2368543', { settingsOverride: { sa_bs_detail_preview: false } });
        const link = page.locator('.mb-bs-record-native a[href$="sd3.aspx?sid=586"]').first();
        await page.keyboard.down('Control');
        await link.hover();
        await page.keyboard.up('Control');
        await expect.poll(() => asked(served, 'COLPC2368543'), { timeout: 1500 }).toEqual([]);
        await expect(peek(page)).toHaveCount(0);
    });
});
