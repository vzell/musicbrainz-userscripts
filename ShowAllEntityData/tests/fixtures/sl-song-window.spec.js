// @ts-check
/**
 * The springsteenlyrics.com song window (org/springsteenlyrics.org, "the SL
 * song detail …"; mockups org/sl-song-POH-mockups.html; vzell's picks
 * 2026-11-07): the record's own layout (`_slSongCols()`, parser version 18).
 *
 * Pins, on the logged-in lyrics index (`sl-lyrics-b-logged-in.html`) and the
 * three Backstreets fixtures (album, unofficial studio 1, live 18 Nov 1975):
 *   - layout A: the title block (type pill, version, ‹ › through the
 *     versions) and the fact cards on the LEFT, the section chips and the
 *     lyric sheet on the RIGHT;
 *   - every section folds, and Ctrl+click opens or closes all of them;
 *   - Available Versions is a List table: filter (the text marked), Type
 *     chips, a heading row per type, this version marked;
 *   - the album version's double-encoded "CalexÃ³ns" is shown repaired and
 *     marked, the banner counts it, and the lyrics index row of that song
 *     gets the `sl-double-utf8` finding once its page was read;
 *   - a non-album version compares its lyrics with the album version's:
 *     one request for the album page, made by the window, never by a hover;
 *   - the compare (`_slLyricsDiff()`) and the repair (`_slMojibakeScan()`)
 *     as pure functions.
 *
 * The fixtures' lyrics are blanked to "la la …" lines of the same length
 * (scripts/build-sl-item-fixtures.py), so the compare is pinned by shape.
 *
 * Env (Playwright): Chromium build of the run, no Tampermonkey (GM stubs).
 */
const { test, expect } = require('../support/test');
const { loadSlListPage } = require('../support/slFixture');
const fs = require('fs');
const path = require('path');
const { routeDetailPages, FIXTURE_DIR } = require('../support/detailFixture');
const { waitForRenderComplete } = require('../support/browser');

/**
 * Collects uncaught page errors, so every test can end by asserting none.
 * @param {import('@playwright/test').Page} page
 * @returns {string[]}
 */
function trackPageErrors(page) {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    return errors;
}

/**
 * Ctrl-hovers a link, as the detail previews want off a modifier-free setting.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} link
 */
async function peekAt(page, link) {
    await link.scrollIntoViewIfNeeded();
    await page.keyboard.down('Control');
    await link.hover();
    await page.keyboard.up('Control');
    await expect(page.locator('#mb-dp-peek')).toBeVisible();
}

/**
 * The logged-in lyrics index rendered, its detail pages routed to fixtures.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{served: string[]}>}
 */
async function openIndex(page) {
    const { spec } = await loadSlListPage(page, { kind: 'lyrics-b-logged-in', settingsOverride: { sa_sl_detail_preview: true } });
    const routed = await routeDetailPages(page, 'sl');
    await page.click(`button[data-label="${spec.button}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
    return routed;
}

/**
 * Opens a song's window from its index link (card, then Space).
 * @param {import('@playwright/test').Page} page
 * @param {string} slug
 * @returns {Promise<import('@playwright/test').Locator>}
 */
async function openWindow(page, slug) {
    await peekAt(page, page.locator(`table.tbl tbody a:not(.mb-fi-glyph)[href$="lyrics.php?song=${slug}"]`).first());
    await expect(page.locator('#mb-dp-peek .mb-tt-title')).toHaveText('BACKSTREETS', { timeout: 15000 });
    await page.keyboard.press('Space');
    const dialog = page.locator('#mb-dp-dialog');
    await expect(dialog.locator('.mb-sls-tblock')).toBeVisible();
    return dialog;
}

/**
 * With SL_SHOTS set (a directory), a picture of the window, for a person to
 * look at the layout; nothing otherwise.
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 */
async function shot(page, name) {
    if (!process.env.SL_SHOTS) return;
    await page.locator('#mb-dp-dialog').screenshot({ path: `${process.env.SL_SHOTS}/${name}.png` });
}

test.describe('springsteenlyrics.com song window', () => {
    test('album version: layout A, folds with Ctrl+click, the versions table, the repaired text', async ({ page }) => {
        const errors = trackPageErrors(page);
        const { served } = await openIndex(page);
        const dialog = await openWindow(page, 'backstreets');
        const [left, right] = [dialog.locator('.mb-dp-col').first(), dialog.locator('.mb-dp-col').last()];
        await shot(page, 'album');

        // Left: the title block, the pill, ‹ › through the 61 versions, the cards.
        await expect(left.locator('.mb-sls-tblock .mb-dp-xtitle')).toHaveText('BACKSTREETS');
        await expect(left.locator('.mb-sls-pill')).toHaveText('Album');
        await expect(left.locator('.mb-sls-vpos')).toHaveText('1 of 61');
        await expect(left.locator('.mb-sls-vnav a')).toHaveCount(1);
        await expect(left.locator('.mb-sls-vnav a')).toHaveAttribute('href', /lyrics\.php\?song=backstreets_unofficial1$/);
        await expect(left.locator('.mb-sls-card .mb-sls-ch').first()).toHaveText('Version');
        await expect(left.locator('details[data-mb-dp-sec="sl:Info"]')).toHaveAttribute('open', '');
        await expect(left.locator('details[data-mb-dp-sec="sl:Studio Recording"] .mb-sls-crew')).toContainText('Garry Tallent');
        // Right: the chips, then the lyric sheet first, open.
        await expect(right.locator('.mb-sls-toc .mb-dg-fc').first()).toHaveText('Lyrics');
        await expect(right.locator('details.mb-sls-sec').first()).toHaveAttribute('data-mb-dp-sec', 'sl:Lyrics');
        await expect(right.locator('details[data-mb-dp-sec="sl:Lyrics"]')).toHaveAttribute('open', '');
        await expect(right.locator('.mb-sls-sheet .mb-sls-stz').first()).toBeVisible();
        expect(await right.locator('.mb-sls-sheet').evaluate(el => getComputedStyle(el).fontFamily)).toMatch(/Iowan Old Style|Palatino/);
        // The Born To Run release: a List table of its editions, this song marked.
        await expect(right.locator('details[data-mb-dp-sec="sl:release"] tr.mb-sls-me')).toHaveCount(1);
        await expect(right.locator('details[data-mb-dp-sec="sl:release"] button.mb-dg-fc[data-mb-tbl-chip]')).toHaveCount(2);

        // Ctrl+click on a heading: every section of the window takes the
        // state the clicked one did not have; again: back.
        const secs = dialog.locator('details.mb-dp-sec');
        const n = await secs.count();
        expect(n).toBeGreaterThan(8);
        await right.locator('details[data-mb-dp-sec="sl:Lyrics"] > summary').click({ modifiers: ['Control'] });
        await expect(dialog.locator('details.mb-dp-sec[open]')).toHaveCount(0);
        await right.locator('details[data-mb-dp-sec="sl:Lyrics"] > summary').click({ modifiers: ['Control'] });
        await expect(dialog.locator('details.mb-dp-sec[open]')).toHaveCount(n);

        // Available Versions: the List table. Its heading row per type, the
        // page's own version marked, the Type chips, the filter marked.
        const vt = dialog.locator('.mb-dp-tbl[data-mb-tbl="sl-versions"]');
        await expect(vt.locator('tbody tr:not(.mb-dp-tsec)')).toHaveCount(61);
        await expect(vt.locator('tr.mb-dp-tsec')).toHaveCount(3);
        await expect(vt.locator('tr.mb-sls-me')).toHaveCount(1);
        await expect(vt.locator('tr.mb-sls-me')).toContainText('Album version');
        await vt.locator('input.mb-tbl-q').fill('1978');
        const vt2 = dialog.locator('.mb-dp-tbl[data-mb-tbl="sl-versions"]');
        await expect(vt2.locator('tbody tr:not(.mb-dp-tsec)')).toHaveCount(16);
        await expect(vt2.locator('mark.mb-dg-hl').first()).toHaveText('1978');
        await vt2.locator('button[data-mb-tbl-act="clear"]').click();
        await dialog.locator('.mb-dp-tbl[data-mb-tbl="sl-versions"] button[data-mb-tbl-chip="Unofficial studio"]').click();
        await expect(dialog.locator('.mb-dp-tbl[data-mb-tbl="sl-versions"] tbody tr:not(.mb-dp-tsec)')).toHaveCount(3);
        // A version's title opens its page in this window.
        await expect(dialog.locator('.mb-dp-tbl[data-mb-tbl="sl-versions"] tbody a[href$="song=backstreets_unofficial1"]')).toHaveCount(1);

        // The site's "CalexÃ³ns" (Covers): shown repaired, the original in
        // its tooltip, counted by the banner.
        const moj = dialog.locator('details[data-mb-dp-sec="sl:Covers"] .mb-sl-moj');
        await expect(moj).toHaveText('ó');
        await expect(moj).toHaveAttribute('title', 'The site has: Ã³');
        await expect(dialog.locator('details[data-mb-dp-sec="sl:Covers"]')).toContainText('Calexóns');
        await expect(dialog.locator('.mb-sls-enc b')).toHaveText('1 encoding error on this page');
        // The album version compares with nothing: no other page asked.
        await expect(dialog.locator('.mb-sls-dchip')).toHaveCount(0);
        expect(served).toEqual(['https://springsteenlyrics.com/lyrics.php?song=backstreets']);
        expect(errors).toEqual([]);
    });

    test('unofficial version: its lyrics compared with the album version, read by the window only', async ({ page }) => {
        const errors = trackPageErrors(page);
        const { served } = await openIndex(page);
        // The card alone asks for its own page, never the album's.
        await peekAt(page, page.locator('table.tbl tbody a:not(.mb-fi-glyph)[href$="lyrics.php?song=backstreets_unofficial1"]').first());
        await expect(page.locator('#mb-dp-peek .mb-tt-title')).toHaveText('BACKSTREETS', { timeout: 15000 });
        expect(served).toEqual(['https://springsteenlyrics.com/lyrics.php?song=backstreets_unofficial1']);
        await page.keyboard.press('Space');
        const dialog = page.locator('#mb-dp-dialog');
        await expect(dialog.locator('.mb-sls-pill')).toHaveText('Unofficial studio');
        await expect(dialog.locator('.mb-sls-vpos')).toHaveText('2 of 61');
        // The window reads the album version once, then marks the lines.
        const chip = dialog.locator('.mb-sls-dchip');
        await expect(chip).toHaveText(/^\d+ of \d+ lines differ from the Album version$/, { timeout: 15000 });
        await shot(page, 'unofficial');
        expect(served).toEqual(['https://springsteenlyrics.com/lyrics.php?song=backstreets_unofficial1',
            'https://springsteenlyrics.com/lyrics.php?song=backstreets']);
        const [, differ, total] = (await chip.textContent()).match(/^(\d+) of (\d+)/).map(Number);
        expect(differ).toBeGreaterThan(0);
        expect(differ).toBeLessThan(total);
        await expect(dialog.locator('.mb-sls-sheet .mb-sls-chg, .mb-sls-sheet .mb-sls-add')).toHaveCount(differ);
        // The stage note of the count-in is set apart.
        await expect(dialog.locator('.mb-sls-sheet .mb-sls-stage').first()).toBeVisible();
        // Side by side: both sheets; then back to the plain lyrics.
        await dialog.locator('[data-mb-sls-act="mode"][data-mb-sls-v="sbs"]').click();
        await expect(dialog.locator('.mb-sls-sbs .mb-sls-sheet')).toHaveCount(2);
        await dialog.locator('[data-mb-sls-act="mode"][data-mb-sls-v="plain"]').click();
        await expect(dialog.locator('.mb-sls-sheet .mb-sls-chg, .mb-sls-sheet .mb-sls-add')).toHaveCount(0);
        // The album page was read once, whatever the repaints.
        expect(served.filter(u => u.endsWith('song=backstreets'))).toHaveLength(1);
        expect(errors).toEqual([]);
    });

    test('live version: the show card, its release\'s tracklist as a table, this version marked', async ({ page }) => {
        const errors = trackPageErrors(page);
        await openIndex(page);
        const dialog = await openWindow(page, 'backstreets_1975-11-18');
        await expect(dialog.locator('.mb-sls-pill')).toHaveText('Live');
        await shot(page, 'live');
        const show = dialog.locator('.mb-sls-card').first();
        await expect(show.locator('.mb-sls-ch')).toHaveText('Show');
        await expect(show).toContainText('Tue 1975-11-18');
        await expect(show).toContainText('Hammersmith Odeon');
        const tl = dialog.locator('.mb-dp-tbl[data-mb-tbl="sl-tracklist"]');
        await expect(tl.locator('tbody tr:not(.mb-dp-tsec)')).toHaveCount(16);
        await expect(tl.locator('tr.mb-sls-me')).toContainText('BACKSTREETS');
        // The show's tracklist comes before the lyrics (mockup C); the DVD
        // edition shows first, the other two a chip away.
        await expect(dialog.locator('.mb-dp-col').last().locator('details.mb-sls-sec').first()).toHaveAttribute('data-mb-dp-sec', 'sl:Tracklist');
        await expect(tl.locator('button[data-mb-tbl-chip]')).toHaveCount(3);
        await expect(tl.locator('button[data-mb-tbl-chip][aria-pressed="true"]')).toHaveText(/DVD edition/);
        // The compare runs on a live version too.
        await expect(dialog.locator('.mb-sls-dchip')).toHaveText(/lines differ from the Album version$/, { timeout: 15000 });
        // The liner notes' long story starts closed.
        await expect(dialog.locator('details.mb-sls-sec[data-mb-dp-sec="sl:release"]')).toHaveAttribute('open', '');
        await expect(dialog.locator('details[data-mb-dp-sec="sl:story"]')).not.toHaveAttribute('open', '');
        expect(errors).toEqual([]);
    });

    test('the lyrics index: a song whose page was read gets the double-encoding finding', async ({ page }) => {
        const errors = trackPageErrors(page);
        await openIndex(page);
        // Before any read, no row carries it.
        expect(await page.locator('table.tbl tbody td[data-mb-findings~="sl-double-utf8"]').count()).toBe(0);
        const dialog = await openWindow(page, 'backstreets');
        await expect(dialog.locator('.mb-sls-enc')).toBeVisible();
        await page.keyboard.press('Escape');
        // The rows linking that page are stamped again (late data, 150 ms batch).
        const row = page.locator('table.tbl tbody tr', { has: page.locator('a:not(.mb-fi-glyph)[href="lyrics.php?song=backstreets"]') });
        await expect(row.first().locator('td[data-mb-findings~="sl-double-utf8"]').first()).toBeVisible({ timeout: 5000 });
        // Only that song: its other versions were never read.
        await expect(page.locator('table.tbl tbody tr:has(td[data-mb-findings~="sl-double-utf8"])')).toHaveCount(await row.count());
        // The diff card (vzell, 2026-11-23): each garbled text over what it
        // means, the bytes that differ marked; "CalexÃ³ns" is the one we know.
        const cmp = await row.first().locator('td[data-mb-findings~="sl-double-utf8"]').first().evaluate((td) => {
            const c = JSON.parse(td.getAttribute('data-mb-tip-cmp') || '{"c":[]}').c.find(x => /Double-encoded/.test(x.head || '')) || null;
            return c ? (c.kind === 'pairs' ? c.p : [c]).map(x => ({ lb: x.lb, a: x.a, b: x.b })) : [];
        });
        expect(cmp.length).toBeGreaterThan(0);
        expect(cmp.every(x => x.lb === 'Meant' && x.a !== x.b)).toBe(true);
        expect(cmp.some(x => x.a.includes('Ã³') && x.b.includes('ó'))).toBe(true);
        expect(errors).toEqual([]);
    });

    // The encoding banner lists each spot (vzell, 2026-11-23, mockup
    // https://claude.ai/artifact/BdPcZd4TVQQ1fUhCtHP2ft, answers 1-6 as
    // recommended): its section and place, the garbled word over the
    // repaired one; a click on it, or on its section's chip, opens the
    // closed section and shows the spot. Pins WHERE the click lands (the
    // cell holding the repair, in view), not only that the section opened.
    test('the encoding banner lists each spot; a click opens its section and shows it', async ({ page }) => {
        const errors = trackPageErrors(page);
        await openIndex(page);
        const dialog = await openWindow(page, 'backstreets');
        const spot = dialog.locator('.mb-sls-enc .mb-sls-spot');
        await expect(spot).toHaveCount(1);
        await expect(spot.locator('.mb-sls-spot-w')).toHaveText('Covers7 Lvvas · Note');
        await expect(spot.locator('.mb-sls-spot-p')).toHaveText('CalexÃ³ns → Calexóns');
        await expect(spot.locator('.mb-sls-spot-p mark')).toHaveText(['Ã³', 'ó']);
        // The section and its chip count it.
        const covers = dialog.locator('details[data-mb-dp-sec="sl:Covers"]');
        await expect(covers.locator(':scope > summary .mb-sls-errn')).toHaveText('🔤 1 encoding error');
        const chip = dialog.locator('.mb-sls-toc button[data-mb-sls-v="sl:Covers"]');
        await expect(chip.locator('.mb-sls-errb')).toHaveText('1');
        await expect(dialog.locator('.mb-sls-toc .mb-sls-errb')).toHaveCount(1);
        // Covers starts closed; the click opens it and shows the cell.
        await expect(covers).not.toHaveAttribute('open', '');
        await spot.click();
        await expect(covers).toHaveAttribute('open', '');
        const flashed = dialog.locator('.mb-sls-flash');
        await expect(flashed).toHaveCount(1);
        await expect(flashed).toContainText('Calexóns');
        expect(await flashed.evaluate(el => el.tagName)).toBe('TD');
        await expect(flashed).toBeInViewport();
        // Closed again, the chip goes to the same spot.
        await covers.locator(':scope > summary').click();
        await expect(covers).not.toHaveAttribute('open', '');
        await chip.click();
        await expect(covers).toHaveAttribute('open', '');
        await expect(dialog.locator('.mb-sls-flash')).toContainText('Calexóns');

        // The record: the spot's section and place (parser 38).
        const rec = await page.evaluate(h => window.__saTest.dpParse('springsteenlyrics.com', h, 'https://www.springsteenlyrics.com/lyrics.php?song=backstreets').slSong.mojibake,
            fs.readFileSync(path.join(FIXTURE_DIR, 'detail-sl-song-backstreets-logged-in.html'), 'utf8'));
        expect(rec.map(m => [m.section, m.place, m.word, m.wordFix])).toEqual([['Covers', '7 Lvvas · Note', 'CalexÃ³ns', 'Calexóns']]);
        // Many spots: three listed, then "and N more".
        const many = await page.evaluate((h) => {
            const data = window.__saTest.dpParse('springsteenlyrics.com', h, 'https://www.springsteenlyrics.com/lyrics.php?song=backstreets');
            const m = data.slSong.mojibake[0];
            data.slSong.mojibake = [0, 1, 2, 3, 4].map(i => Object.assign({}, m, { place: `row ${i}` }));
            const div = document.createElement('div');
            div.innerHTML = window.__saTest.slSongLeftHtml(data);
            return { head: div.querySelector('.mb-sls-enc b').textContent, spots: div.querySelectorAll('.mb-sls-spot').length, more: (div.querySelector('.mb-sls-spots-more') || {}).textContent };
        }, fs.readFileSync(path.join(FIXTURE_DIR, 'detail-sl-song-backstreets-logged-in.html'), 'utf8'));
        expect(many).toEqual({ head: '5 encoding errors on this page', spots: 3, more: 'and 2 more · show all' });
        expect(errors).toEqual([]);
    });

    // With the MusicBrainz title style on, the Title cell has its own tip
    // ("As written on the site: BACKSTREETS"); the finding goes above it,
    // not nowhere (vzell's screenshot, 2026-11-23: the card showed only the
    // site title, and "the two share little").
    test('the lyrics index with the title style on: the Title cell shows the finding above the site title', async ({ page }) => {
        const errors = trackPageErrors(page);
        const { spec } = await loadSlListPage(page, { kind: 'lyrics-b-logged-in', settingsOverride: { sa_sl_detail_preview: true, sa_foreign_mb_titles: true } });
        await routeDetailPages(page, 'sl');
        await page.click(`button[data-label="${spec.button}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await openWindow(page, 'backstreets');
        await page.keyboard.press('Escape');
        const row = page.locator('table.tbl tbody tr', { has: page.locator('a:not(.mb-fi-glyph)[href="lyrics.php?song=backstreets"]') }).first();
        const titleTd = row.locator('td[data-mb-findings~="sl-double-utf8"]', { has: page.locator('a[href="lyrics.php?song=backstreets"]') });
        await expect(titleTd).toHaveCount(1, { timeout: 5000 });
        const card = await titleTd.evaluate((td) => {
            const div = document.createElement('div');
            div.innerHTML = window.__saTest.tipTextToHtml(td.getAttribute('title') || '', td);
            return {
                title: td.getAttribute('title'),
                heads: Array.from(div.querySelectorAll('.mb-tt-title')).map(d => d.textContent),
                rows: Array.from(div.querySelectorAll('.mb-tt-cmp-val')).map(d => d.textContent),
                marks: Array.from(div.querySelectorAll('.mb-tt-cmp-val')).map(v => Array.from(v.querySelectorAll('mark')).map(m => m.textContent).join('')),
                text: div.textContent,
            };
        });
        // The finding's line first, then the site's own text.
        expect(card.title).toMatch(/^❌ Double-encoded text[^\n]*\n[\s\S]*As written on the site:\nBACKSTREETS$/);
        // The garbled word, not only its two characters.
        expect(card.rows).toContain('CalexÃ³ns');
        expect(card.rows).toContain('Calexóns');
        expect(card.marks).toContain('Ã³');
        // The site title's pair marks its case, not "share little".
        expect(card.rows).toContain('BACKSTREETS');
        expect(card.marks).toContain('ACKSTREETS');
        expect(card.text).not.toMatch(/share little/);
        expect(errors).toEqual([]);
    });

    test('badlands: single releases as a table, Live History as tours of dates, placeholders dropped', async ({ page }) => {
        const errors = trackPageErrors(page);
        const { spec } = await loadSlListPage(page, { kind: 'lyrics-b', settingsOverride: { sa_sl_detail_preview: true } });
        await routeDetailPages(page, 'sl');
        await page.click(`button[data-label="${spec.button}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await peekAt(page, page.locator('table.tbl tbody a:not(.mb-fi-glyph)[href$="lyrics.php?song=badlands"]').first());
        await expect(page.locator('#mb-dp-peek .mb-tt-title')).toHaveText('BADLANDS', { timeout: 15000 });
        await page.keyboard.press('Space');
        const dialog = page.locator('#mb-dp-dialog');
        await expect(dialog.locator('.mb-sls-tblock')).toBeVisible();
        const [left, right] = [dialog.locator('.mb-dp-col').first(), dialog.locator('.mb-dp-col').last()];
        // Layout A: the writing facts on the left, the lists on the right.
        await expect(left.locator('details[data-mb-dp-sec="sl:Writing and Recording"]')).toHaveCount(1);
        // "Circulating Studio Versions" is only the site's placeholder here.
        await expect(dialog.locator('details[data-mb-dp-sec="sl:Circulating Studio Versions"]')).toHaveCount(0);
        // "Single Release" rows: a List table, a row per single.
        const singles = right.locator('.mb-dp-tbl[data-mb-tbl="sl-singles"] tbody tr:not(.mb-dp-tsec)');
        await expect(singles).toHaveCount(2);
        await expect(singles.first()).toContainText('Badlands');
        // Live History: on-tour is only the site's placeholder, so it is not
        // there; off-tour is one tour of four dates, each a version's page.
        await expect(right.locator('details[data-mb-dp-sec="sl:Live History: on-tour"]')).toHaveCount(0);
        const off = right.locator('details[data-mb-dp-sec="sl:Live History: off-tour"]');
        await expect(off.locator('.mb-sls-tour')).toHaveCount(1);
        await expect(off.locator('a.mb-sls-dt-v')).toHaveCount(4);
        await expect(off.locator('a.mb-sls-dt-v').first()).toHaveAttribute('href', /lyrics\.php\?song=badlands_1979-09-21$/);
        await expect(dialog).not.toContainText('SECTION NOT YET COMPLETED');
        // A cover artist the site double-encodes ("DéjÃ  Vu"), repaired.
        await expect(right.locator('.mb-dp-tbl[data-mb-tbl="sl-covers"]')).toContainText('Déjà Vu');
        await expect(left.locator('.mb-sls-enc')).toBeVisible();
        expect(errors).toEqual([]);
    });

    test('pure: the compare and the double-encoding repair', async ({ page }) => {
        await loadSlListPage(page, { kind: 'lyrics-b-logged-in' });
        // The version a record compares with: none for the album version
        // itself, the album version for the others.
        const refOf = (name, slug) => page.evaluate(([h, u]) => window.__saTest.dpParse('springsteenlyrics.com', h, u).slSong.ref,
            [fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf8'), `https://www.springsteenlyrics.com/lyrics.php?song=${slug}`]);
        expect(await refOf('detail-sl-song-backstreets-logged-in.html', 'backstreets')).toBeNull();
        expect(await refOf('detail-sl-song-backstreets-unofficial1-logged-in.html', 'backstreets_unofficial1'))
            .toEqual({ href: 'https://www.springsteenlyrics.com/lyrics.php?song=backstreets', version: 'Album version' });
        const d = await page.evaluate(() => window.__saTest.slLyricsDiff(
            '[Spoken:] One, two\n\nA line here\nA new line\nThe same END\n\nshort',
            'A line here!\nA changed line\nthe same end\n\nshort\nlost line'));
        // Same up to case and punctuation; a changed line paired in its gap;
        // a stage-note-only line has no words; the album's leftover is missing.
        expect(d.lines.map(l => l.kind)).toEqual(['add', 'blank', 'same', 'chg', 'same', 'blank', 'same']);
        expect(d.lines[3].was).toBe('A changed line');
        expect(d.missing).toEqual([[6, 'lost line']]);
        expect([d.differ, d.total]).toEqual([2, 5]);

        const m = await page.evaluate(() => ['CalexÃ³ns', 'Saint-Ã‰tienne', 'BernabÃ©u', 'DÃ©jÃ  Vu', 'Ã and Â alone', 'Déjà vu', 'DéjÃ Vu'].map(t => window.__saTest.slMojibake(t)));
        expect(m.map(x => x.fixed)).toEqual(['Calexóns', 'Saint-Étienne', 'Bernabéu', 'Déjà Vu', 'Ã and Â alone', 'Déjà vu', 'Déjà Vu']);
        // The no-break space a collapsing reader made plain: "Ã " after a lower-case letter.
        // Each run with the word around it, repaired whole (the finding's card).
        expect(m[6].runs).toEqual([{ at: 3, bad: 'Ã ', fix: 'à ', word: 'DéjÃ Vu', wordFix: 'Déjà Vu' }]);
        expect(m[0].runs).toEqual([{ at: 5, bad: 'Ã³', fix: 'ó', word: 'CalexÃ³ns', wordFix: 'Calexóns' }]);
        expect(m[4].runs).toEqual([]);
        // Two runs in one word give the same word, both repaired; outer
        // punctuation stays out.
        const w = await page.evaluate(() => window.__saTest.slMojibake('by "BernabÃ©u," and SÃ£o PaulÃ£o.').runs.map(r => [r.word, r.wordFix]));
        expect(w).toEqual([['BernabÃ©u', 'Bernabéu'], ['SÃ£o', 'São'], ['PaulÃ£o', 'Paulão']]);

        // ALL CAPS song titles in prose: linked when the site's song list
        // knows them, never the page's own song, never inside a link, and a
        // comma-joined run part by part.
        const c = await page.evaluate(() => [
            window.__saTest.slCapsLinks('including BACKSTREETS and BORN IN THE U.S.A. on it', 'backstreets'),
            window.__saTest.slCapsLinks('see <a href="x">THUNDER ROAD</a> there', 'backstreets'),
            window.__saTest.slCapsLinks('songs: JUNGLELAND, THUNDER ROAD.', 'backstreets'),
            window.__saTest.slCapsLinks('a USA tour by CBS', 'backstreets'),
        ]);
        expect(c[0]).toMatch(/^including BACKSTREETS and <a href="[^"]*lyrics\.php\?song=bornintheusa">BORN IN THE U\.S\.A\.?<\/a>\.? on it$/);
        expect(c[1]).toBe('see <a href="x">THUNDER ROAD</a> there');
        expect(c[2]).toMatch(/song=jungleland">JUNGLELAND<\/a>, <a href="[^"]*song=thunderroad">THUNDER ROAD<\/a>\.$/);
        expect(c[3]).toBe('a USA tour by CBS');
    });
});
