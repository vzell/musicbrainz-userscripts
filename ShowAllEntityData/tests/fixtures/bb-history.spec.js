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
// Zandt's backing vocals; 43 and 42 changed only tags. The list answers
// are asked 20 a page (the script asks 100) so that a pager stays in them.
//
// Round 2 (vzell's answers, 2026-11-11; mockups
// https://claude.ai/artifact/7X2g3wBLVotb1cFfZdrCxz): kind chips that filter
// the rows read, several at once, with counts and no request; tag changes as
// pills in the list; a comparison (PageDiffModule) before any source, its
// Tags strip always shown, the sources only when they differ; From / To
// pickers on every row, the older always on the left, the span tinted.
//
// Pinned: no module is asked before the section opens (a hover, a window
// with the section closed); opening it asks the list and the two sources
// the newest revision needs, and nothing else; the list (numbers, who,
// flags, comments, the count from the newest number); the diff pairs lines
// (a changed line, a removed line) and marks the words; "Everything" shows
// the unchanged lines; a tags-only revision says the source did not
// change; "Load 100 more" reads page 2; a refusal reads "Sign in to
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
const modules = (posts) => posts.map(p => `${p.module.replace('history/', '')}${p.page ? ` p${p.page}` : ''}${p.revision ? ` ${p.revision}` : ''}${p.pair ? ` ${p.pair}` : ''}`);
const rowOf = (page, n) => histSec(page).locator(`.mb-bbh-r[data-mb-bbh-n="${n}"]`);
const pick = (page, side, n) => rowOf(page, n).locator(`label.mb-bbh-pk[data-mb-bbh-act="${side}"]`);

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
        // A tags-only revision's comment as a pill, the comment on hover.
        await expect(rows(page).nth(4).locator('.mb-dgh-n .mb-bbh-tag-add')).toHaveText('+ offvid');
        await expect(rows(page).nth(4).locator('.mb-dgh-n')).toHaveAttribute('title', 'Added tags: offvid.');
        // The pickers: From on 46, To on 47.
        await expect(rowOf(page, 47).locator('input[data-mb-bbh-act="to"]')).toBeChecked();
        await expect(rowOf(page, 46).locator('input[data-mb-bbh-act="from"]')).toBeChecked();
        // Its change: one line, "glockenspiel" added inside it.
        const pane = histSec(page).locator('.mb-bbh-pane');
        await expect(pane.locator('.mb-bbh-ph b')).toHaveText(/^Revision 47 · against 46 · /);
        // The Tags strip, always: the wiki shows no Tags row for this pair.
        await expect(pane.locator('.mb-bbh-kv')).toHaveText('Tagsthe same in both');
        await expect(pane.locator('.mb-meh-meta')).toContainText('1 line differ');
        const chg = pane.locator('.mb-bbh-l.mb-bbh-chg');
        await expect(chg).toHaveCount(2);
        await expect(chg.nth(0)).toContainText('Danny Federici]]]: organ');
        await expect(chg.nth(1).locator('.mb-dgh-add')).toHaveText(', glockenspiel');
        await expect(chg.nth(0).locator('.mb-dgh-rem')).toHaveCount(0);
        // The unchanged lines folded around it: 19 before, 76 after.
        await expect(pane.locator('.mb-bbh-skip')).toHaveText(['⋯ 19 unchanged lines', '⋯ 76 unchanged lines']);
        // The list, the comparison and the two sources, nothing more.
        await quiet(page);
        expect(modules(posts).sort()).toEqual(['PageRevisionListModule p1', `PageDiffModule ${R46}-${R47}`,
            `PageSourceModule ${R46}`, `PageSourceModule ${R47}`].sort());
    });

    test('a revision picked: a removed line and two changed ones; Everything; a tags-only revision', async ({ page }) => {
        const { posts } = await loadBbHistoryPage(page);
        await openLinkWindow(page);
        await openHistory(page);
        await expect(rows(page)).toHaveCount(20);
        // The newest change first (list, comparison, two sources: one a second).
        await expect(histSec(page).locator('.mb-bbh-l.mb-bbh-chg')).toHaveCount(2);
        await rows(page).nth(2).click();
        const pane = histSec(page).locator('.mb-bbh-pane');
        await expect(pane.locator('.mb-bbh-ph b')).toHaveText(/^Revision 45 · against 44 · /);
        await expect(rows(page).nth(2)).toHaveAttribute('aria-pressed', 'true');
        await expect(pane.locator('.mb-meh-meta')).toContainText('3 lines differ', { timeout: 10000 });
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
        // 43 changed only tags: the comparison says the sources are the
        // same, so neither is read; its Tags strip marks the added tag.
        await rows(page).nth(4).click();
        await expect(pane).toContainText('The page\'s source did not change in this revision (tags changed).');
        await expect(pane.locator('.mb-bbh-diff')).toHaveCount(0);
        await expect(pane.locator('.mb-bbh-kv .mb-bbh-tag-add')).toHaveText(['+ offvid']);
        await expect(pane.locator('.mb-bbh-kv')).toContainText('1 added');
        // Every other tag of 42 stays, unmarked: counted from the fixture's
        // own Tags row (its first cell, the older revision's).
        const cmp42 = JSON.parse(fs.readFileSync(path.join(BB_HISTORY_DIR, `compare-${R42}-${R43}.json`), 'utf8')).body;
        const tags42 = /Tags:\s*<\/td>\s*<td[^>]*>([^<]*)</.exec(cmp42)[1].trim().split(/\s+/);
        expect(tags42.length).toBeGreaterThan(10);
        await expect(pane.locator('.mb-bbh-kv .mb-bbh-tag:not(.mb-bbh-tag-add)')).toHaveCount(tags42.length);
        await quiet(page);
        expect(modules(posts)).toContain(`PageDiffModule ${R42}-${R43}`);
        expect(modules(posts)).not.toContain(`PageSourceModule ${R43}`);
        expect(modules(posts)).not.toContain(`PageSourceModule ${R42}`);
    });

    test('the kind chips: counts of the rows read, several at once, no request', async ({ page }) => {
        const { posts } = await loadBbHistoryPage(page);
        await openLinkWindow(page);
        await openHistory(page);
        await expect(rows(page)).toHaveCount(20);
        await expect(histSec(page).locator('.mb-bbh-l.mb-bbh-chg')).toHaveCount(2);
        await quiet(page);
        const before = posts.length;
        const chip = (k) => histSec(page).locator(`.mb-bbh-chip[data-mb-bbh-v="${k}"]`);
        await expect(histSec(page).locator('.mb-bbh-chip')).toHaveText(['All 20', 'Source 13', 'Title 0', 'Page name 0', 'Tags 7', 'Metadata 0', 'Files 0']);
        await expect(chip('all')).toHaveAttribute('aria-pressed', 'true');
        await expect(chip('meta')).toBeDisabled();
        await chip('tags').click();
        await expect(chip('all')).toHaveAttribute('aria-pressed', 'false');
        await expect(rows(page)).toHaveCount(7);
        await expect(histSec(page).locator('.mb-bbh-r .mb-bbh-n')).toHaveText(['43', '42', '40', '37', '34', '33', '30']);
        await expect(histSec(page).locator('.mb-meh-meta').first()).toContainText('7 shown');
        // Several at once: Tags or Source.
        await chip('source').click();
        await expect(rows(page)).toHaveCount(20);
        // Both off again: All.
        await chip('source').click();
        await chip('tags').click();
        await expect(chip('all')).toHaveAttribute('aria-pressed', 'true');
        await expect(rows(page)).toHaveCount(20);
        expect(posts.length).toBe(before);
    });

    test('From / To: any two revisions, the older on the left, the span tinted', async ({ page }) => {
        const { posts } = await loadBbHistoryPage(page);
        await openLinkWindow(page);
        await openHistory(page);
        await expect(histSec(page).locator('.mb-bbh-l.mb-bbh-chg')).toHaveCount(2);
        const pane = histSec(page).locator('.mb-bbh-pane');
        await pick(page, 'from', 44).click();
        await expect(pane.locator('.mb-bbh-ph b')).toHaveText(/^Revision 44 → 47 · 3 revisions apart · 1 editor · /, { timeout: 10000 });
        await expect(rowOf(page, 44).locator('input[data-mb-bbh-act="from"]')).toBeChecked();
        await expect(rowOf(page, 45)).toHaveClass(/mb-bbh-in/);
        await expect(rowOf(page, 46)).toHaveClass(/mb-bbh-in/);
        await expect(rowOf(page, 44)).toHaveClass(/mb-bbh-from/);
        await expect(pane.locator('.mb-dgh-dh')).toHaveText(['Revision 44', 'Revision 47']);
        // 45's two changed lines and its removed line, and 47's glockenspiel
        // (46 put it on Bruce's line and back): four lines.
        await expect(pane.locator('.mb-meh-meta')).toContainText('4 lines differ', { timeout: 10000 });
        expect(modules(posts)).toContain(`PageDiffModule ${R44}-${R47}`);
        // Backwards (vzell's answer 6): To 44, From 47 — the same pair, the
        // older on the left.
        await pick(page, 'to', 44).click();
        await pick(page, 'from', 47).click();
        await expect(pane.locator('.mb-bbh-ph b')).toHaveText(/^Revision 44 → 47 · /);
        await expect(pane.locator('.mb-dgh-dh')).toHaveText(['Revision 44', 'Revision 47']);
        // The keyboard: an arrow key moves a picker (it clicks the radio).
        await rowOf(page, 47).locator('input[data-mb-bbh-act="from"]').focus();
        await page.keyboard.press('ArrowDown');
        await expect(rowOf(page, 46).locator('input[data-mb-bbh-act="from"]')).toBeChecked();
        await expect(pane.locator('.mb-bbh-ph b')).toHaveText(/^Revision 44 → 46 · 2 revisions apart · /);
        // One revision twice: nothing to compare.
        await pick(page, 'to', 46).click();
        await expect(pane).toContainText('Pick two different revisions with From and To.');
        // A row's text: that revision against the one before again.
        await rows(page).first().click();
        await expect(pane.locator('.mb-bbh-ph b')).toHaveText(/^Revision 47 · against 46 · /);
    });

    test('the comparison\'s rows: a page title and a page name changed (story fixtures)', async ({ page }) => {
        await loadBbHistoryPage(page);
        const read = (f) => JSON.parse(fs.readFileSync(path.join(BB_HISTORY_DIR, f), 'utf8')).body;
        const out = await page.evaluate(([t, n, g]) => ({
            title: window.__saTest.bbHistParseCompare(t),
            name: window.__saTest.bbHistParseCompare(n),
            tags: window.__saTest.bbHistParseCompare(g),
            changes: window.__saTest.bbHistTagChanges('Added tags: r_18t, r_prms, r_sp9ep. Removed tags: album_18tracks, album_thepromise. '),
            plain: window.__saTest.bbHistTagChanges('Parent page set to: "stats:songs-t".'),
        }), [read('story-compare-title.json'), read('story-compare-name.json'), read(`compare-${R42}-${R43}.json`)]);
        expect(out.title).toEqual({ tags: null, title: ['Story 1978-09-15 New York City, NY', 'Story 1978-09-15 Palladium, New York City, NY'], name: null, identical: false });
        expect(out.name).toEqual({ tags: null, title: null, name: ['story:story-1978-09-15-new-york-city-ny', 'story:story-1978-09-15-palladium-new-york-city-ny'], identical: true });
        expect(out.tags.identical).toBe(true);
        expect(out.tags.tags[1].filter(t => !out.tags.tags[0].includes(t))).toEqual(['offvid']);
        expect(out.changes).toEqual({ added: ['r_18t', 'r_prms', 'r_sp9ep'], removed: ['album_18tracks', 'album_thepromise'], rest: '' });
        expect(out.plain).toEqual({ added: [], removed: [], rest: 'Parent page set to: "stats:songs-t".' });
    });

    test('Load 100 more reads page 2', async ({ page }) => {
        const { posts } = await loadBbHistoryPage(page);
        await openLinkWindow(page);
        await openHistory(page);
        const more = histSec(page).locator('[data-mb-bbh-act="more"]');
        await expect(more).toHaveText('Load 100 more (page 2 of 3)');
        await more.click();
        await expect(rows(page)).toHaveCount(40);
        await expect(rows(page).nth(20).locator('.mb-bbh-n')).toHaveText('27');
        await expect(histSec(page).locator('[data-mb-bbh-act="more"]')).toHaveText('Load 100 more (page 3 of 3)');
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
        // Load 100 more repaints the window (twice): 46 is not asked again.
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
