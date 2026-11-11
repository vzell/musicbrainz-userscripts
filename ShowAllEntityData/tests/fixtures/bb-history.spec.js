'use strict';

// org/brucebase.org, Phase 6 — a Brucebase page's history in the window
// (vzell's mockup M4: a closed "History" section, read when it opens, never
// on a hover; the Discogs look; the ☰ menu's "changes" entry). The probe
// (debug/bb-history-probe-20261111-{in,out}.json) found Wikidot's history
// modules answering signed out as signed in, so the section is everyone's.
//
// Fixtures: tests/fixtures/bb-history/ (scripts/build-bb-history-fixtures.py,
// song:the-promise on 2026-11-11, members scrubbed to "Editor N"):
// revision 47 added "glockenspiel" to Danny Federici's line; 45 cut Roy
// Bittan's backing vocals, Clarence Clemons' whole line and Steven Van
// Zandt's backing vocals; 43 and 42 changed only tags.
//
// Pinned: no module is asked before the section opens (a hover, a window
// with the section closed); opening it asks the list and the two sources
// the newest revision needs, and nothing else; the list (numbers, who,
// flags, comments, the count from the newest number); the diff pairs lines
// (a changed line, a removed line) and marks the words; "Everything" shows
// the unchanged lines; a tags-only revision says the source did not
// change; "Load 20 more" reads page 2; a refusal reads "Sign in to
// Brucebase to see the history", an HTTP error "Try again", which asks
// once more; a source that keeps failing is not asked again by a repaint;
// ✎ / H open the section; the ☰ entry opens the window on the page; the
// setting off: no section, no entry, no request.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadBbHistoryPage, BB_HISTORY_DIR } = require('../support/bbFixture');
const { openToolbarMenu, clickToolbarItem } = require('../support/toolbarMenu');

const dialog = (page) => page.locator('#mb-dp-dialog');
const histSec = (page) => dialog(page).locator('details.mb-dp-sec[data-mb-dp-sec="History"]');
const rows = (page) => histSec(page).locator('.mb-bbh-e');
const modules = (posts) => posts.map(p => `${p.module.replace('history/', '')}${p.page ? ` p${p.page}` : ''}${p.revision ? ` ${p.revision}` : ''}`);

const R47 = '1543144729';
const R46 = '1543144715';
const R45 = '1543144702';
const R44 = '1525903628';
const R43 = '1525903625';
const R42 = '1525453683';

/**
 * Opens the window of a person link on the page (Ctrl+hover, Space).
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function openLinkWindow(page) {
    const link = page.locator('#page-content a[href="/relation:roy-bittan"]').first();
    await page.mouse.move(0, 0);
    await link.scrollIntoViewIfNeeded();
    await page.keyboard.down('Control');
    await link.hover();
    await page.keyboard.up('Control');
    await expect(page.locator('#mb-dp-peek')).toBeVisible();
    await page.keyboard.press('Space');
    await expect(dialog(page).locator('.mb-dp-xtitle')).toBeVisible();
}

/**
 * Waits out one slot of the window's request gate (1 s), so a request that
 * should NOT be made would have been made by now (as bb-event-preview.spec.js
 * waits for a card that should not ask).
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function quiet(page) {
    await page.evaluate(() => new Promise(r => setTimeout(r, 1300)));
}

/**
 * Opens the History section by its heading.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function openHistory(page) {
    await histSec(page).locator(':scope > summary').click();
    await expect(histSec(page)).toHaveAttribute('open', '');
}

test.describe('Brucebase page history (Phase 6)', () => {
    test.describe.configure({ timeout: 30000 });
    test('the readers: the revision list, a source, the line diff', async ({ page }) => {
        await loadBbHistoryPage(page);
        const list = JSON.parse(fs.readFileSync(path.join(BB_HISTORY_DIR, 'list-p1.json'), 'utf8')).body;
        const list2 = JSON.parse(fs.readFileSync(path.join(BB_HISTORY_DIR, 'list-p2.json'), 'utf8')).body;
        const src = JSON.parse(fs.readFileSync(path.join(BB_HISTORY_DIR, `source-${R47}.json`), 'utf8')).body;
        const out = await page.evaluate(([l, l2, s]) => ({
            p1: window.__saTest.bbHistParseList(l),
            p2: window.__saTest.bbHistParseList(l2),
            lines: window.__saTest.bbHistParseSource(s),
            diff: window.__saTest.bbHistDiffRows(['a', 'b', 'c x', 'd', 'e'], ['a', 'c x y', 'd', 'new', 'e']),
        }), [list, list2, src]);
        expect(out.p1.revs.map(r => r.n)).toEqual(Array.from({ length: 20 }, (_, i) => 47 - i));
        expect(out.p1.revs[0]).toEqual({ id: R47, n: 47, flags: 'S', user: 'Editor 1', userUrl: 'https://www.wikidot.com/user:info/editor-1', at: 1775447442, comment: '' });
        expect(out.p1.revs[4]).toMatchObject({ id: R43, flags: 'A', comment: 'Added tags: offvid.' });
        // Page 1's pager says "page 1" only; its links go to 3.
        expect(out.p1.pages).toBe(3);
        expect(out.p2.pages).toBe(3);
        expect(out.p2.revs[0].n).toBe(27);
        // The source: 96 lines, the first the wiki's "----", no <br> left.
        expect(out.lines).toHaveLength(96);
        expect(out.lines[0]).toBe('----');
        expect(out.lines.some(l => l.includes('Danny Federici]]]: organ, glockenspiel'))).toBe(true);
        // 'b' removed, 'c x' → 'c x y' changed, 'new' added, the rest kept.
        expect(out.diff.map(r => r.t)).toEqual(['same', 'rem', 'chg', 'same', 'add', 'same']);
        expect(out.diff[2]).toMatchObject({ a: 'c x', b: 'c x y', an: 3, bn: 2 });
        expect(out.diff[4]).toMatchObject({ b: 'new', bn: 4 });
    });

    test('a window: the section is there and closed, nothing asked; opening it reads the list and the newest change', async ({ page }) => {
        const { posts } = await loadBbHistoryPage(page);
        await openLinkWindow(page);
        await expect(histSec(page)).toHaveCount(1);
        await expect(histSec(page)).not.toHaveAttribute('open', '');
        expect(posts).toEqual([]);
        await openHistory(page);
        await expect(rows(page)).toHaveCount(20);
        await expect(histSec(page).locator(':scope > summary h4')).toHaveText('History (48)');
        // The newest is shown: its number, who, flag; selected.
        const first = rows(page).first();
        await expect(first).toHaveAttribute('aria-pressed', 'true');
        await expect(first.locator('.mb-bbh-n')).toHaveText('47');
        await expect(first.locator('.mb-dgh-u')).toHaveText('Editor 1');
        await expect(first.locator('.mb-dgh-pill')).toHaveText('S');
        await expect(rows(page).nth(4).locator('.mb-dgh-n')).toHaveText('Added tags: offvid.');
        // Its change: one line, "glockenspiel" added inside it.
        const pane = histSec(page).locator('.mb-bbh-pane');
        await expect(pane.locator('.mb-bbh-ph b')).toHaveText(/^Revision 47 · against 46 · /);
        await expect(pane.locator('.mb-meh-meta')).toContainText('1 line differ');
        const chg = pane.locator('.mb-bbh-l.mb-bbh-chg');
        await expect(chg).toHaveCount(2);
        await expect(chg.nth(0)).toContainText('Danny Federici]]]: organ');
        await expect(chg.nth(1).locator('.mb-dgh-add')).toHaveText(', glockenspiel');
        await expect(chg.nth(0).locator('.mb-dgh-rem')).toHaveCount(0);
        // The unchanged lines folded around it: 19 before, 76 after.
        await expect(pane.locator('.mb-bbh-skip')).toHaveText(['⋯ 19 unchanged lines', '⋯ 76 unchanged lines']);
        // The list and the two sources, nothing more.
        await quiet(page);
        expect(modules(posts).sort()).toEqual(['PageRevisionListModule p1', `PageSourceModule ${R46}`, `PageSourceModule ${R47}`].sort());
    });

    test('a revision picked: a removed line and two changed ones; Everything; a tags-only revision', async ({ page }) => {
        const { posts } = await loadBbHistoryPage(page);
        await openLinkWindow(page);
        await openHistory(page);
        await expect(rows(page)).toHaveCount(20);
        await rows(page).nth(2).click();
        const pane = histSec(page).locator('.mb-bbh-pane');
        await expect(pane.locator('.mb-bbh-ph b')).toHaveText(/^Revision 45 · against 44 · /);
        await expect(rows(page).nth(2)).toHaveAttribute('aria-pressed', 'true');
        await expect(pane.locator('.mb-meh-meta')).toContainText('3 lines differ');
        await expect(pane.locator('.mb-bbh-l.mb-bbh-rem')).toHaveCount(1);
        await expect(pane.locator('.mb-bbh-l.mb-bbh-rem')).toContainText('Clarence Clemons]]]: saxophone, percussion, backing vocals');
        await expect(pane.locator('.mb-bbh-l.mb-bbh-chg.mb-meh-n')).toHaveCount(2);
        await expect(pane.locator('.mb-bbh-l.mb-bbh-chg:not(.mb-meh-n) .mb-dgh-rem').first()).toHaveText(', backing vocals');
        expect(modules(posts)).toEqual(expect.arrayContaining([`PageSourceModule ${R45}`, `PageSourceModule ${R44}`]));
        // Everything: every line of the newer source, nothing folded.
        await pane.locator('[data-mb-bbh-act="all"][data-mb-bbh-v="1"]').click();
        await expect(pane.locator('.mb-bbh-skip')).toHaveCount(0);
        await expect(pane.locator('.mb-bbh-l.mb-meh-n .mb-bbh-ln:not(:empty)')).toHaveCount(96);
        await pane.locator('[data-mb-bbh-act="all"][data-mb-bbh-v="0"]').click();
        await expect(pane.locator('.mb-bbh-skip').first()).toBeVisible();
        // 43 changed only tags: its source is 42's.
        await rows(page).nth(4).click();
        await expect(pane).toContainText('The page\'s source did not change in this revision (tags changed).');
        await expect(pane.locator('.mb-bbh-diff')).toHaveCount(0);
        expect(modules(posts)).toEqual(expect.arrayContaining([`PageSourceModule ${R43}`, `PageSourceModule ${R42}`]));
    });

    test('Load 20 more reads page 2', async ({ page }) => {
        const { posts } = await loadBbHistoryPage(page);
        await openLinkWindow(page);
        await openHistory(page);
        const more = histSec(page).locator('[data-mb-bbh-act="more"]');
        await expect(more).toHaveText('Load 20 more (page 2 of 3)');
        await more.click();
        await expect(rows(page)).toHaveCount(40);
        await expect(rows(page).nth(20).locator('.mb-bbh-n')).toHaveText('27');
        await expect(histSec(page).locator('[data-mb-bbh-act="more"]')).toHaveText('Load 20 more (page 3 of 3)');
        expect(modules(posts).filter(m => m.startsWith('PageRevisionListModule'))).toEqual(['PageRevisionListModule p1', 'PageRevisionListModule p2']);
    });

    test('the oldest row read: its predecessor is read from the next page first', async ({ page }) => {
        const { posts } = await loadBbHistoryPage(page);
        await openLinkWindow(page);
        await openHistory(page);
        await expect(rows(page)).toHaveCount(20);
        await rows(page).nth(19).click();
        // Revision 28's predecessor (27) opens page 2 of the list.
        await expect(rows(page)).toHaveCount(40);
        await expect(histSec(page).locator('.mb-bbh-pane .mb-bbh-ph b')).toHaveText(/^Revision 28 · against 27 · /);
        expect(modules(posts)).toContain('PageRevisionListModule p2');
    });

    test('a refusal: "Sign in to Brucebase to see the history"', async ({ page }) => {
        await loadBbHistoryPage(page, {
            answer: ({ module }) => (module === 'history/PageRevisionListModule'
                ? { json: { status: 'no_permission', message: 'You do not have permission to view the history.' } } : null),
        });
        await openLinkWindow(page);
        await openHistory(page);
        await expect(histSec(page).locator('.mb-dp-warn')).toHaveText('Sign in to Brucebase to see the history.');
        await expect(histSec(page).locator('[data-mb-bbh-act="retry"]')).toHaveCount(0);
    });

    test('an HTTP error: Try again asks once more; a failing source is not asked again by a repaint', async ({ page }) => {
        let failList = true;
        const { posts } = await loadBbHistoryPage(page, {
            answer: ({ module, params }) => {
                if (module === 'history/PageRevisionListModule' && failList) return { status: 500 };
                if (module === 'history/PageSourceModule' && params.get('revision_id') === R46) return { status: 503 };
                return null;
            },
        });
        await openLinkWindow(page);
        await openHistory(page);
        await expect(histSec(page).locator('.mb-dp-warn')).toHaveText('Could not read the history: HTTP 500.');
        // Closing and opening the section again (as a repaint that draws it
        // open does) does not ask again: only Try again does.
        await histSec(page).locator(':scope > summary').click();
        await openHistory(page);
        await quiet(page);
        expect(posts).toHaveLength(1);
        failList = false;
        await histSec(page).locator('[data-mb-bbh-act="retry"]').click();
        await expect(rows(page)).toHaveCount(20);
        await expect(histSec(page).locator('.mb-bbh-pane .mb-dp-warn')).toHaveText('Could not read a revision\'s source: HTTP 503.');
        const n = posts.length;
        // Load 20 more repaints the window (twice): 46 is not asked again.
        await histSec(page).locator('[data-mb-bbh-act="more"]').click();
        await expect(rows(page)).toHaveCount(40);
        await quiet(page);
        expect(modules(posts.slice(n))).toEqual(['PageRevisionListModule p2']);
    });

    test('✎ in the title bar and H open the section', async ({ page }) => {
        const { posts } = await loadBbHistoryPage(page);
        await openLinkWindow(page);
        const hist = dialog(page).locator('.mb-meh-hist-btn');
        await expect(hist).toBeVisible();
        await expect(hist).toHaveAttribute('title', /This page's history on Brucebase/);
        await page.keyboard.press('h');
        await expect(histSec(page)).toHaveAttribute('open', '');
        await expect(rows(page)).toHaveCount(20);
        expect(modules(posts)).toContain('PageRevisionListModule p1');
    });

    test('the ☰ menu: "✎ Page history" opens the window on the page itself, the section open', async ({ page }) => {
        // A song page's window needs the song preview, which the fixture
        // profile turns off (FIXTURE_SETTINGS_OVERRIDE); on by default.
        const { posts } = await loadBbHistoryPage(page, { settingsOverride: { sa_bb_detail_preview: true } });
        expect(await openToolbarMenu(page, 'saed')).toBe(true);
        await expect(page.locator('#mb-saed-bbhist-btn')).toHaveText('✎ Page history');
        await clickToolbarItem(page, '#mb-saed-bbhist-btn');
        await expect(dialog(page).locator('.mb-dp-xtitle')).toHaveText('The Promise');
        await expect(histSec(page)).toHaveAttribute('open', '');
        await expect(rows(page)).toHaveCount(20);
        await expect(histSec(page).locator('.mb-bbh-l.mb-bbh-chg')).toHaveCount(2);
        expect(modules(posts)).toContain('PageRevisionListModule p1');
    });

    test('the setting off: no section, no ☰ entry, no request', async ({ page }) => {
        const { posts } = await loadBbHistoryPage(page, { settingsOverride: { sa_bb_history: false, sa_bb_detail_preview: true } });
        await openLinkWindow(page);
        await expect(histSec(page)).toHaveCount(0);
        await page.keyboard.press('Escape');
        expect(await openToolbarMenu(page, 'saed')).toBe(true);
        await expect(page.locator('#mb-saed-bbhist-btn')).toHaveCount(0);
        expect(posts).toEqual([]);
    });
});
