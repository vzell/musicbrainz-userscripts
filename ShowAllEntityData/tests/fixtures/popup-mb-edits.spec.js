'use strict';

// The editing history in the MusicBrainz entity window (org/mb-edit-history.org,
// mockups org/mb-edit-history-mockups.html): "✎ Editing history" (or H) in the
// window's header shows the entity's or editor's /…/edits page IN the window,
// with the Discogs release history's look — a HISTORY row per edit, the
// selected edit's changes as OLD | NEW — and Back returns.
//
// Pins, each named in its test (the uppercase tag is the mutation list's grep):
//   PATH     what is previewed: /<kind>/<MBID>/edits and /user/<name>/edits are
//            the edits kind; a collection's and a tab below one are not;
//            an entity's /open_edits is an edits list, its path the id;
//   OPEN     the sidebar's "Open edits": card, window titled "Open edits",
//            one request, no ✎ button (open-edits-page-artist.html, 2026-10-23);
//   BUTTON   the button on a recording window; one request; the rows are the
//            page's edits; the newest selected; Back returns with no request;
//   DIFF     H opens it; the Edit chip filters; the pane's marks carry the
//            exact changed words on each side; the order reverses; ↓ selects;
//   SPLIT    an edit medium's tracklist split into its Old and New halves;
//   ONLY     "Only what changed" hides unchanged rows and context but keeps
//            MusicBrainz's Note, and says when nothing visible changed;
//            "Everything" lists the rest, dimmed;
//   ADDED    an addition is one column; Edit #N drills into the edit card in
//            the window, Back returns to the history and its selection;
//   RG       a sidebar-like link to an editing history: its card; Merge |
//            Into; artwork opens the viewer; Load page 2 appends with one
//            more request; the page's table.tbl count is unchanged;
//   KEEP     a page holding an open edit is memory only; a closed history
//            comes back from IndexedDB; "at least 500" loads on without a
//            last page; the status chips;
//   EDITOR   the editor window has the button too (/user/<name>/edits);
//   NONE     no button where there is no history (ISRC, edit, the history);
//   LOGGEDOUT the editor and the notes hidden, as MusicBrainz sends them;
//   CHECK    MusicBrainz's browser check is named, not shown as an empty list.
//
// Fixtures: tests/fixtures/edits-page-*.html, real /edits pages saved with
// scripts/fetch-mb-page-fixture.js on 2026-10-20 (logged in as vzell, one
// recording page logged out); they name other editors and quote their notes,
// which musicbrainz.org shows to every logged-in reader (the user agreed,
// org/mb-edit-history.org, answer 6). Mutation list:
// scripts/mutations/popup-mb-edits.json.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage, addRequiredLibs, MB_LIBRARY_PATH, USERSCRIPT_PATH } = require('../support/loadPage');

const RG_URL = 'https://musicbrainz.org/release-group/c497fc44-ddaf-3cce-a9b4-bfec958a0f3c';
const FIXTURE = path.join(__dirname, 'releasegroup-releases-multirow-catalog.html');
const json = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');
const REC = 'de571208-2c6d-4dc6-9efa-c16405c904f9';      // She's a Runaway (BoDeans): 23 edits
const RG = 'f3528c02-dfa0-3b65-b12d-c252a6290770';       // Secret Garden: 325 edits, 7 pages
const ARTIST = '70248960-cb53-4ea4-943a-edb18f7d336f';   // Bruce Springsteen: "at least 500", open edits
const PAGES = [
    [new RegExp(`/recording/${REC}/edits$`), 'edits-page-recording.html'],
    [new RegExp(`/release-group/${RG}/edits\\?page=2$`), 'edits-page-rg-p2.html'],
    [new RegExp(`/release-group/${RG}/edits$`), 'edits-page-rg.html'],
    [new RegExp(`/artist/${ARTIST}/edits$`), 'edits-page-artist.html'],
    [/\/user\/vzell\/edits$/, 'edits-page-user-vzell.html'],
    [/\/user\/vzell$/, 'user-page-vzell.html'],
    [/\/edit\/\d+$/, 'edit-page-applied.html'],
];
const WS2 = [
    [/\/ws\/2\/recording\/[0-9a-f-]{36}\?inc=artist-credits\+isrcs/, 'ws2-pop-recording-thunder.json'],
    [/\/ws\/2\/recording\/[0-9a-f-]{36}\?inc=artist-rels/, 'ws2-pop-recording-thunder-pin.json'],
    [/\/ws\/2\/release\?recording=/, 'ws2-pop-recording-thunder-count.json'],
    [/\/ws\/2\/work\/[0-9a-f-]{36}\?/, 'ws2-pop-work-btr.json'],
    [/\/ws\/2\/area\/[0-9a-f-]{36}\?/, 'ws2-pop-area-nj.json'],
    [/\/ws\/2\/isrc\//, 'ws2-pop-isrc-thunder.json'],
];
// MusicBrainz's "Verifying your browser" page, as a script without a
// browser gets it (scripts/probe-mb-entity-edits.py, 2026-10-20), shortened.
const BROWSER_CHECK = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Verifying your browser</title></head>' +
    '<body><div class="box"><p>Verifying your browser, please wait…</p></div>' +
    '<script>f.action="/__meb_verify";</script></body></html>';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const card = (page) => page.locator('#mb-dp-peek');
const dialog = (page) => page.locator('#mb-dp-dialog');
const title = (page) => dialog(page).locator(':scope > div > span').first();
const histBtn = (page) => dialog(page).locator('button.mb-meh-hist-btn');
const rows = (page) => dialog(page).locator('.mb-meh-e');
const row = (page, id) => dialog(page).locator(`.mb-meh-e[data-mb-meh-v="${id}"]`);
const pane = (page) => dialog(page).locator('[data-mb-dg-sec="meh-diff"]');

/**
 * Loads the release-group page (no "Show all": its native table carries
 * the probe links) with the MusicBrainz cards on, answers the Web Service
 * and the pages, and logs every page request.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{settings?: Object, pageFixture?: function(string): ?(string|Object)}} [opts] - `pageFixture`
 *   may answer a page instead of `PAGES` (a file name, or a route.fulfill() object).
 * @returns {Promise<{html: string[]}>}
 */
async function open(page, { settings = {}, pageFixture = null } = {}) {
    const log = { html: [] };
    const ctx = page.context();
    await ctx.route('https://static.metabrainz.org/**', (route) => route.abort('blockedbyclient'));
    await ctx.route(/^https:\/\/(coverartarchive|eventartarchive)\.org\//, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    await ctx.route(/^https:\/\/([a-z0-9-]+\.)*archive\.org\//, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    await ctx.route(/\/ws\/2\//, (route) => {
        const url = route.request().url();
        const hit = WS2.find(([re]) => re.test(url));
        return route.fulfill(hit ? { status: 200, contentType: 'application/json', body: json(hit[1]) }
            : { status: 404, contentType: 'application/json', body: '{"error":"no fixture"}' });
    });
    await ctx.route(/^https:\/\/musicbrainz\.org\/(recording|release-group|artist|user|edit)\/[^?#]*\/?(\?page=\d+)?$/, (route) => {
        const url = route.request().url();
        if (url === RG_URL) return route.fulfill({ path: FIXTURE, contentType: 'text/html' });
        log.html.push(url.replace('https://musicbrainz.org', ''));
        const own = pageFixture ? pageFixture(url) : null;
        if (own && typeof own === 'object') return route.fulfill(own);
        const hit = own || (PAGES.find(([re]) => re.test(url)) || [])[1];
        if (!hit) return route.fulfill({ status: 404, contentType: 'text/html', body: '<html><body>no fixture</body></html>' });
        return route.fulfill({ path: path.join(__dirname, hit), contentType: 'text/html' });
    });
    await loadUserscriptPage(page, {
        url: RG_URL, fixtureFile: FIXTURE, testMode: true,
        settingsOverride: { sa_rich_tooltip_delay_ms: 0, sa_pop_mb: true, ...settings },
    });
    // loadUserscriptPage() aborts every archive.org image at PAGE level
    // (ARCHIVE_ORG_RE), which a context route cannot override; a cover
    // art thumbnail in an edit must load, or the window drops it.
    await page.route(/^https:\/\/([a-z0-9-]+\.)*archive\.org\//, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    await page.mouse.move(0, 0);
    return log;
}

/**
 * Adds a link to the first cell of the table's first row (a table of that
 * kind would carry it), so one host page serves every kind.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} href
 * @param {string} text
 * @returns {Promise<import('@playwright/test').Locator>}
 */
async function addLink(page, href, text) {
    await page.evaluate(([h, x]) => {
        const td = document.querySelector('table.tbl tbody tr td:first-child');
        const a = document.createElement('a');
        a.href = h;
        a.className = 'pop-probe';
        a.textContent = x;
        td.append(' ', a);
    }, [href, text]);
    return page.locator(`a.pop-probe[href="${href}"]`);
}

/**
 * Hovers a link with Ctrl held, waits for its card, and pins it with Space.
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} el
 * @returns {Promise<void>}
 */
async function pin(page, el) {
    await page.mouse.move(0, 0);
    await el.scrollIntoViewIfNeeded();
    await page.keyboard.down('Control');
    await el.hover();
    await page.keyboard.up('Control');
    await expect(card(page)).toBeVisible();
    await page.keyboard.press('Space');
    await expect(dialog(page)).toBeVisible();
}

/**
 * Re-runs the userscript on a reload (the routes live on the context).
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function reloadScript(page) {
    await page.reload();
    await addRequiredLibs(page);
    await page.addScriptTag({ path: MB_LIBRARY_PATH });
    await page.addScriptTag({ path: USERSCRIPT_PATH });
    await expect(page.locator('#mb-show-all-controls-container')).toBeVisible({ timeout: 30000 });
    await page.mouse.move(0, 0);
}

let pageErrors;
test.beforeEach(({ page }) => {
    pageErrors = [];
    const THIRD_PARTY = [/supported-browser-check/, /Unexpected token '<'/];
    page.on('pageerror', (e) => {
        const where = String(e.stack || e.message || '');
        if (!THIRD_PARTY.some((re) => re.test(where))) pageErrors.push(where);
    });
});
test.afterEach(() => {
    expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
});

test.describe('MusicBrainz link previews: the editing history (org/mb-edit-history.org)', () => {
    test('PATH: an editing history page is the edits kind; a collection\'s and a tab below one are not', async ({ page }) => {
        await open(page);
        const r = await page.evaluate((ids) => {
            const td = document.querySelector('table.tbl tbody tr td:first-child');
            const res = (href) => {
                const a = document.createElement('a');
                a.href = href;
                a.textContent = 'Editing history';
                td.appendChild(a);
                return window.__saTest.popResolve(a);
            };
            return {
                rec: res(`/recording/${ids.rec.toUpperCase()}/edits`), user: res('/user/Some%20One/edits'),
                coll: res(`/collection/${ids.rec}/edits`), open: res(`/recording/${ids.rec}/edits/open`), bare: res(`/recording/${ids.rec}`),
                openEdits: res(`/recording/${ids.rec.toUpperCase()}/open_edits/`), collOpen: res(`/collection/${ids.rec}/open_edits`),
                belowOpen: res(`/recording/${ids.rec}/open_edits/x`),
            };
        }, { rec: REC });
        expect(r.rec, 'the MBID lowercased, as an entity\'s').toBe(`mb-entity|edits:recording/${REC}`);
        expect(r.user).toBe('mb-entity|edits:user/Some%20One');
        expect(r.coll, 'a collection is not edited through edits').toBeNull();
        expect(r.open).toBeNull();
        expect(r.bare).toBe(`mb-entity|recording:${REC}`);
        expect(r.openEdits, 'an entity\'s open edits: a list, its path the id, the MBID lowercased').toBe(`mb-entity|edits:/recording/${REC}/open_edits`);
        expect(r.collOpen, 'nor a collection\'s open edits').toBeNull();
        expect(r.belowOpen).toBeNull();
    });

    test('OPEN: the sidebar\'s "Open edits": its card; Space opens the list, titled Open edits; one request; no ✎ button', async ({ page }) => {
        // The host page's own sidebar link; the artist's open edits answer
        // it (the release group's own list was not captured).
        const RG_OPEN = `/release-group/${RG_URL.split('/').pop()}/open_edits`;
        const log = await open(page, {
            settings: { sa_pop_mb_page: true },
            pageFixture: url => (url.endsWith(RG_OPEN) ? 'open-edits-page-artist.html' : null),
        });
        const tables = await page.locator('table.tbl').count();
        const link = page.locator(`#sidebar a[href="${RG_OPEN}"]`);
        await expect(link).toHaveText('Open edits');
        await link.scrollIntoViewIfNeeded();
        await page.keyboard.down('Control');
        await link.hover();
        await page.keyboard.up('Control');
        await expect(card(page).locator('.mb-tt-title')).toHaveText('Bruce Springsteen');
        await expect(card(page).locator('.mb-tt-comment')).toHaveText('Open edits · release group');
        await expect(card(page).locator('.mb-tt-pill')).toHaveText(['2 edits', '2 open']);
        await page.keyboard.press('Space');
        await expect(title(page)).toHaveText('Open edits');
        await expect(rows(page)).toHaveCount(2);
        await expect(dialog(page).locator('.mb-dp-xsub').first()).toHaveText('MusicBrainz · release group · open edits');
        await expect(histBtn(page), 'a list has no editing history of its own').toBeHidden();
        expect(log.html, 'one request, for the list').toEqual([RG_OPEN]);
        expect(await page.locator('table.tbl').count(), 'no table.tbl in the window').toBe(tables);
    });

    test('BUTTON: ✎ Editing history on a recording window: one request, the page\'s edits, the newest selected; Back returns with none', async ({ page }) => {
        const log = await open(page);
        await pin(page, await addLink(page, `/recording/${REC}`, 'She’s a Runaway'));
        await expect(title(page)).toHaveText('Recording');
        await expect(histBtn(page)).toBeVisible();
        await expect(histBtn(page)).toHaveText('✎Editing history');
        const before = log.html.length;
        await histBtn(page).click();
        await expect(title(page)).toHaveText('Recording › Editing history');
        await expect(rows(page)).toHaveCount(23);
        expect(log.html.slice(before), 'one request for the history page').toEqual([`/recording/${REC}/edits`]);
        await expect(histBtn(page), 'no button on the history itself').toBeHidden();
        await expect(dialog(page).locator('.mb-dp-xtitle').first()).toHaveText('She’s a Runaway');
        await expect(dialog(page).locator('[data-mb-dg-sec="meh-hist"] .mb-dgh-seg').first().locator('button'))
            .toHaveText(['All 23', 'Add 21', 'Edit 2']);
        await expect(row(page, '95387768')).toHaveAttribute('aria-pressed', 'true');
        await expect(pane(page).locator('h4').first()).toContainText('Latest change · edit #95387768');
        await dialog(page).locator('button.mb-dp-tbtn', { hasText: '← Back' }).click();
        await expect(title(page)).toHaveText('Recording');
        await expect(histBtn(page)).toBeVisible();
        expect(log.html.length - before, 'Back asks nothing').toBe(1);
    });

    test('DIFF: H opens it; the Edit chip; the marks carry the changed words on each side; the order reverses; ↓ selects', async ({ page }) => {
        await open(page);
        await pin(page, await addLink(page, `/recording/${REC}`, 'She’s a Runaway'));
        await page.keyboard.press('h');
        await expect(title(page)).toHaveText('Recording › Editing history');
        await dialog(page).locator('button[data-mb-meh-act="group"][data-mb-meh-v="edit"]').click();
        await expect(rows(page)).toHaveCount(2);
        await expect(rows(page).first()).toHaveAttribute('data-mb-meh-v', '44371226');
        await row(page, '44371223').click();
        await expect(pane(page).locator('h4').first()).toContainText('edit #44371223');
        await expect(pane(page).locator('.mb-dgh-dh')).toHaveText(['Old', 'New']);
        await expect(pane(page).locator('.mb-meh-o .mb-dgh-rem')).toHaveText('She\'s');
        await expect(pane(page).locator('.mb-meh-n .mb-dgh-add')).toHaveText('She’s');
        await expect(pane(page).locator('.mb-meh-ctx').first(), 'the recording it changed, across both columns').toContainText('She’s a Runaway');
        await expect(row(page, '44371223')).toContainText('Name: She\'s a Runaway → She’s a Runaway');
        await dialog(page).locator('button[data-mb-meh-act="order"][data-mb-meh-v="old"]').click();
        await expect(rows(page).first()).toHaveAttribute('data-mb-meh-v', '44371223');
        await row(page, '44371223').focus();
        await page.keyboard.press('ArrowDown');
        await expect(row(page, '44371226')).toHaveAttribute('aria-pressed', 'true');
        await expect(pane(page).locator('h4').first()).toContainText('edit #44371226');
    });

    test('SPLIT: an edit medium\'s tracklist in its Old and New halves; "Only what changed" hides the unchanged credits', async ({ page }) => {
        await open(page);
        await pin(page, await addLink(page, `/recording/${REC}`, 'She’s a Runaway'));
        await histBtn(page).click();
        await row(page, '44371226').click();
        const labels = pane(page).locator('.mb-meh-o .mb-meh-lbl');
        await expect(labels).toHaveText(['Tracklist']);
        // Track 1's title, on each side; other tracks changed their apostrophes too.
        await expect(pane(page).locator('.mb-meh-o table.mb-meh-sub .mb-dgh-rem').first()).toHaveText('She\'s');
        await expect(pane(page).locator('.mb-meh-n table.mb-meh-sub .mb-dgh-add').first()).toHaveText('She’s');
        await expect(pane(page).locator('.mb-meh-n table.mb-meh-sub .mb-dgh-rem'), 'no removal on the new side').toHaveCount(0);
        await expect(pane(page).locator('.mb-meh-o table.mb-meh-sub thead th')).toHaveText(['#', 'Title', 'Artist', 'Length']);
        await expect(pane(page).locator('.mb-meh-n table.mb-meh-sub thead th'), 'the New half, its own header').toHaveText(['#', 'Title', 'Artist', 'Length']);
        await expect(pane(page).locator('.mb-meh-ctx').first(), 'the medium, across both columns').toContainText('Medium 1 (CD) on Love & Hope & Sex & Dreams');
    });

    test('ONLY: "Only what changed" hides unchanged tracks but keeps MusicBrainz\'s Note; "Everything" lists them dimmed', async ({ page }) => {
        await open(page);
        const link = await addLink(page, `/release-group/${RG}/edits`, 'Editing history');
        await pin(page, link);
        await row(page, '126306542').click();
        await expect(pane(page).locator('.mb-meh-o')).toHaveCount(0);
        await expect(pane(page).locator('.mb-meh-ctx')).toContainText(['Every value MusicBrainz shows reads as before', 'Medium 1 (CD)', 'subsecond changes']);
        await expect(pane(page).locator('.mb-meh-ctx', { hasText: 'n4Mpyxibt12nQdphhJWwNuJI3yE-' }), 'the disc ID: context, hidden').toHaveCount(0);
        await pane(page).locator('button[data-mb-meh-act="only"][data-mb-meh-v="0"]').click();
        await expect(pane(page).locator('.mb-meh-o.mb-meh-same .mb-meh-lbl')).toHaveText(['Track 1', 'Track 2', 'Track 3', 'Track 4', 'Track 5']);
        await expect(pane(page).locator('.mb-meh-ctx', { hasText: 'n4Mpyxibt12nQdphhJWwNuJI3yE-' })).toHaveCount(1);
        await expect(pane(page)).not.toContainText('Every value MusicBrainz shows reads as before');
    });

    test('ADDED: an addition is one column; Edit #N drills into the edit card; Back returns to the history and its selection', async ({ page }) => {
        const log = await open(page);
        await pin(page, await addLink(page, `/recording/${REC}`, 'She’s a Runaway'));
        await histBtn(page).click();
        await row(page, '74297222').click();
        await expect(pane(page).locator('.mb-meh-one > .mb-dgh-dh')).toHaveText('Added');
        await expect(pane(page).locator('.mb-meh-diff')).toHaveCount(0);
        await expect(pane(page).locator('.mb-meh-kv dt')).toContainText(['Release', 'Position', 'Tracklist']);
        await pane(page).locator('a.mb-meh-editlink').click();
        await expect(title(page)).toHaveText('Recording › Editing history › Edit');
        // The edit card asks for its page once its rate slot comes up.
        await expect.poll(() => log.html).toContain('/edit/74297222');
        await page.keyboard.press('Backspace');
        await expect(title(page)).toHaveText('Recording › Editing history');
        await expect(row(page, '74297222')).toHaveAttribute('aria-pressed', 'true');
    });

    test('RG: a link to a history: its card; Merge | Into; artwork opens the viewer; Load page 2 appends with one more request', async ({ page }) => {
        const log = await open(page);
        const tables = await page.locator('table.tbl').count();
        const link = await addLink(page, `/release-group/${RG}/edits`, 'Editing history');
        await page.keyboard.down('Control');
        await link.hover();
        await page.keyboard.up('Control');
        await expect(card(page).locator('.mb-tt-title')).toHaveText('Secret Garden');
        await expect(card(page).locator('.mb-tt-pill')).toHaveText(['325 edits']);
        await page.keyboard.press('Space');
        await expect(title(page)).toHaveText('Editing history');
        await expect(rows(page)).toHaveCount(50);
        await expect(dialog(page).locator('[data-mb-dg-sec="meh-hist"] h4 .mb-dg-c')).toHaveText('50 of 325');
        await row(page, '128069975').click();
        await expect(pane(page).locator('.mb-dgh-dh')).toHaveText(['Merge', 'Into']);
        await expect(pane(page).locator('.mb-meh-o table.mb-meh-sub .mb-meh-deleted')).toHaveCount(1);
        await row(page, '125309503').click();
        const art = pane(page).locator('a.mb-meh-art[data-mb-artv-ext="0"]');
        await expect(art).toHaveCount(1);
        await art.click();
        await expect(page.locator('#mb-art-viewer')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.locator('#mb-art-viewer')).toBeHidden();
        await expect(dialog(page), 'Escape closed the viewer only').toBeVisible();
        expect(log.html).toEqual([`/release-group/${RG}/edits`]);
        await dialog(page).locator('button[data-mb-meh-act="more"]').click();
        await expect(rows(page)).toHaveCount(100);
        await expect(dialog(page).locator('[data-mb-dg-sec="meh-hist"] h4 .mb-dg-c')).toHaveText('100 of 325');
        expect(log.html).toEqual([`/release-group/${RG}/edits`, `/release-group/${RG}/edits?page=2`]);
        await expect(dialog(page).locator('button[data-mb-meh-act="more"]')).toHaveText('Load page 3 of 7');
        expect(await page.locator('table.tbl').count(), 'no table.tbl in the window').toBe(tables);
    });

    test('KEEP: an open edit keeps its page in memory only; a closed history comes back from IndexedDB; "at least 500"', async ({ page }) => {
        const log = await open(page);
        const hover = async (href) => {
            const a = await addLink(page, href, 'Editing history');
            await page.mouse.move(0, 0);
            await page.keyboard.down('Control');
            await a.hover();
            await page.keyboard.up('Control');
        };
        await hover(`/artist/${ARTIST}/edits`);
        await expect(card(page)).toContainText('fetched now');
        await expect(card(page).locator('.mb-tt-pill').first()).toHaveText('at least 500 edits');
        await page.keyboard.press('Space');
        await expect(dialog(page).locator('button[data-mb-meh-act="more"]')).toHaveText('Load page 2');
        await expect(dialog(page).locator('.mb-meh-more')).toContainText('more than 500 edits');
        await expect(dialog(page).locator('button[data-mb-meh-act="status"]').first()).toHaveText('Any status');
        await expect(row(page, '155699211').locator('.mb-dgh-pill-run')).toHaveText('Open');
        await expect(row(page, '155699211')).toContainText('voting · 5 days');
        await page.keyboard.press('Escape');
        await hover(`/recording/${REC}/edits`);
        await expect(card(page)).toContainText('fetched now');
        expect(log.html).toEqual([`/artist/${ARTIST}/edits`, `/recording/${REC}/edits`]);
        await reloadScript(page);
        await hover(`/recording/${REC}/edits`);
        await expect(card(page)).toContainText('saved today');
        await hover(`/artist/${ARTIST}/edits`);
        await expect(card(page)).toContainText('fetched now');
        expect(log.html, 'the open edit\'s page asked again, the closed one not').toEqual([`/artist/${ARTIST}/edits`, `/recording/${REC}/edits`, `/artist/${ARTIST}/edits`]);
    });

    test('EDITOR: the editor window has the button too: /user/<name>/edits', async ({ page }) => {
        const log = await open(page);
        await pin(page, await addLink(page, '/user/vzell', 'vzell'));
        await expect(title(page)).toHaveText('Editor');
        await histBtn(page).click();
        await expect(title(page)).toHaveText('Editor › Editing history');
        await expect(rows(page)).toHaveCount(50);
        expect(log.html).toEqual(['/user/vzell', '/user/vzell/edits']);
        await expect(dialog(page).locator('.mb-dp-xtitle').first()).toHaveText('vzell');
        await expect(dialog(page).locator('.mb-dp-xsub').first()).toHaveText('MusicBrainz · editor · editing history');
        // An edit relationship: th[rowspan=2] over an old row and a new row,
        // one diff (not an old-only row and a label-less new-only one).
        await row(page, '154863407').click();
        await expect(pane(page).locator('.mb-meh-o')).toHaveCount(1);
        await expect(pane(page).locator('.mb-meh-o')).toContainText('(time: 19:40 - 22-29 and electric guitar)');
        await expect(pane(page).locator('.mb-meh-n')).toContainText('(time: 19:40 - 22:29 and electric guitar)');
        await expect(pane(page).locator('.mb-meh-n .mb-meh-lbl')).toHaveText('Relationship');
    });

    test('NONE: no button where there is no history: an ISRC, an edit, the history itself', async ({ page }) => {
        await open(page);
        await pin(page, await addLink(page, '/isrc/USSM17500001', 'USSM17500001'));
        await expect(title(page)).toHaveText('ISRC');
        await expect(histBtn(page)).toBeHidden();
        await page.keyboard.press('h');
        await expect(title(page), 'H does nothing without a history').toHaveText('ISRC');
        await page.keyboard.press('Escape');
        await pin(page, await addLink(page, '/edit/126930910', 'Edit #126930910'));
        await expect(title(page)).toHaveText('Edit');
        await expect(histBtn(page)).toBeHidden();
    });

    test('LOGGEDOUT: the editor and the notes hidden, as MusicBrainz sends them', async ({ page }) => {
        await open(page, { pageFixture: url => (url.endsWith(`/recording/${REC}/edits`) ? 'edits-page-recording-loggedout.html' : null) });
        await pin(page, await addLink(page, `/recording/${REC}`, 'She’s a Runaway'));
        await histBtn(page).click();
        await expect(rows(page)).toHaveCount(23);
        await expect(rows(page).first().locator('.mb-meh-hidden')).toHaveText('editor hidden');
        await expect(pane(page)).toContainText('MusicBrainz shows edit notes only to editors who are logged in.');
        await expect(dialog(page).locator('.mb-dp-x').first()).toContainText('Logged out, MusicBrainz hides who made each edit');
    });

    test('CHECK: MusicBrainz\'s browser check is named, not shown as an empty history', async ({ page }) => {
        await open(page, { pageFixture: url => (url.endsWith('/edits') ? { status: 200, contentType: 'text/html', body: BROWSER_CHECK } : null) });
        await pin(page, await addLink(page, `/recording/${REC}`, 'She’s a Runaway'));
        await histBtn(page).click();
        await expect(dialog(page).locator('.mb-dp-warn')).toContainText('MusicBrainz asked this browser to verify itself');
        await expect(rows(page)).toHaveCount(0);
    });
});
