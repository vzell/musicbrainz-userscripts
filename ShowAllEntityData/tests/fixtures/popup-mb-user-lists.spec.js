'use strict';

// Link previews for an editor's lists and account pages (2026-10-21): the
// links of a profile's statistics ("view", "view list", "N%", "View all")
// show a card on hover and a window on Space.
//
// Pins, each named in its test (the uppercase tag is the mutation list's grep):
//   PATH     what is previewed: an editor's status lists and votes, an edit
//            search with conditions (without `page=`), subscribers,
//            applications; NOT the empty search form, a form_only search,
//            an unknown status, an action below /account/applications;
//   STATUS   /user/<name>/edits/rejected is the edits kind: card, window,
//            its title, no "✎ Editing history" on a list;
//   EMPTY    "Found 0 edits" is an empty list, not a failure;
//   VOTES    /user/<name>/votes;
//   SEARCH   an edit search: the query asked as the link spells it, page 2
//            with &page=2, kept in memory only (asked again after a reload,
//            while a status list comes back from IndexedDB);
//   SUBS     the profile's "view list" in its rendered table: the
//            subscribers, the anonymous count, a click drills to an editor;
//   APPS     the applications: names and access only, no "Revoke access"
//            link, memory only; a developer application's client id and
//            secret never reach the window; a login page names the owner;
//   TAGS     the profile's "Tags upvoted … view": tags, genres, votes, the
//            most used first; a tag drills into its /tag/<name> card;
//            downvoted tags have no card (PATH);
//   RATINGS  the profile's "Ratings … view": per kind its stars and
//            entities, never a /rating/rate/ link; an entity drills.
//
// Fixtures (2026-10-21, scripts/fetch-mb-page-fixture.js --auth, then
// scripts/anonymize-user-fixtures.py): edits-page-user-vzell-{rejected,open,
// votes}.html, edits-page-search-type.html, subscribers-page-vzell.html (the
// names replaced by editor-1…), applications-page-vzell.html,
// user-{tags,ratings}-page-vzell.html. Mutation list:
// scripts/mutations/popup-user-lists.json.

const path = require('path');
const fs = require('fs');
const { test, expect } = require('../support/test');
const { loadUserscriptPage, addRequiredLibs, MB_LIBRARY_PATH, USERSCRIPT_PATH } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { ensureSubTableVisible } = require('../support/filterSortAssertions');

const RG_URL = 'https://musicbrainz.org/release-group/c497fc44-ddaf-3cce-a9b4-bfec958a0f3c';
const RG_FIXTURE = path.join(__dirname, 'releasegroup-releases-multirow-catalog.html');
const USER_URL = 'https://musicbrainz.org/user/vzell';
const USER_FIXTURE = path.join(__dirname, 'user-page-vzell.html');
// An edit search as the profile's "N%" links spell it (the type 41 one).
const SEARCH = '/search/edits?auto_edit_filter=&conditions.0.field=editor&conditions.0.operator=%3D&conditions.0.name=vzell' +
    '&conditions.0.args.0=1126444&combinator=and&conditions.1.field=type&conditions.1.operator=%3D&conditions.1.args=41' +
    '&conditions.2.field=status&conditions.2.operator=%3D&conditions.2.args=2&negation=0&order=desc';
const PAGES = [
    [/\/user\/vzell\/edits\/rejected$/, 'edits-page-user-vzell-rejected.html'],
    [/\/user\/vzell\/edits\/open$/, 'edits-page-user-vzell-open.html'],
    [/\/user\/vzell\/votes$/, 'edits-page-user-vzell-votes.html'],
    [/\/search\/edits\?auto_edit_filter=.*order=desc$/, 'edits-page-search-type.html'],
    [/\/user\/vzell\/subscribers$/, 'subscribers-page-vzell.html'],
    [/\/account\/applications$/, 'applications-page-vzell.html'],
    [/\/user\/vzell\/tags$/, 'user-tags-page-vzell.html'],
    [/\/user\/vzell\/tag\/live$/, 'user-tag-page-vzell-live.html'],
    [/\/user\/vzell\/tag\/acoustic%20rock$/, 'user-tag-page-vzell-acoustic-rock.html'],
    [/\/user\/vzell\/tag\/gig$/, 'user-tag-page-vzell-gig.html'],
    [/\/user\/vzell\/ratings$/, 'user-ratings-page-vzell.html'],
];
const card = (page) => page.locator('#mb-dp-peek');
const dialog = (page) => page.locator('#mb-dp-dialog');
const title = (page) => dialog(page).locator(':scope > div > span').first();
const histBtn = (page) => dialog(page).locator('button.mb-meh-hist-btn');
const rows = (page) => dialog(page).locator('.mb-meh-e');

/**
 * Loads a host page with the MusicBrainz cards on and answers the lists'
 * pages from the fixtures, logging every page request (path and query).
 *
 * @param {import('@playwright/test').Page} page
 * @param {{url?: string, fixtureFile?: string, pageFixture?: function(string): ?(string|Object)}} [opts] -
 *   `pageFixture` may answer a page instead of `PAGES` (a file name, or a route.fulfill() object).
 * @returns {Promise<{html: string[]}>}
 */
async function open(page, { url = RG_URL, fixtureFile = RG_FIXTURE, pageFixture = null } = {}) {
    const log = { html: [] };
    const ctx = page.context();
    await ctx.route('https://static.metabrainz.org/**', (route) => route.abort('blockedbyclient'));
    await ctx.route(/\/ws\/2\//, (route) => route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"no fixture"}' }));
    await ctx.route(/^https:\/\/musicbrainz\.org\/(user|account|search|tag)\//, (route) => {
        const u = route.request().url();
        if (u === url) return route.fulfill({ path: fixtureFile, contentType: 'text/html' });
        log.html.push(u.replace('https://musicbrainz.org', ''));
        const own = pageFixture ? pageFixture(u) : null;
        if (own && typeof own === 'object') return route.fulfill(own);
        const hit = own || (PAGES.find(([re]) => re.test(u)) || [])[1];
        if (!hit) return route.fulfill({ status: 404, contentType: 'text/html', body: '<html><body>no fixture</body></html>' });
        return route.fulfill({ path: path.join(__dirname, hit), contentType: 'text/html' });
    });
    await loadUserscriptPage(page, {
        url, fixtureFile, testMode: true,
        settingsOverride: { sa_rich_tooltip_delay_ms: 0, sa_pop_mb: true, sa_pop_mb_page: true },
    });
    await page.mouse.move(0, 0);
    return log;
}

/**
 * Adds a link to the first cell of the table's first row, as a profile's
 * statistics table carries them.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} href
 * @param {string} text
 * @returns {Promise<import('@playwright/test').Locator>}
 */
async function addLink(page, href, text) {
    const n = await page.evaluate(([h, x]) => {
        const td = document.querySelector('table.tbl tbody tr td:first-child');
        const a = document.createElement('a');
        a.href = h;
        a.className = 'pop-probe';
        a.dataset.probe = String(document.querySelectorAll('a.pop-probe').length);
        a.textContent = x;
        td.append(' ', a);
        return a.dataset.probe;
    }, [href, text]);
    return page.locator(`a.pop-probe[data-probe="${n}"]`);
}

/**
 * Hovers a link with Ctrl held and waits for its card.
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} el
 * @returns {Promise<void>}
 */
async function hover(page, el) {
    await page.mouse.move(0, 0);
    await el.scrollIntoViewIfNeeded();
    await page.keyboard.down('Control');
    await el.hover();
    await page.keyboard.up('Control');
    await expect(card(page)).toBeVisible();
}

/**
 * Hovers a link, then pins its card with Space.
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} el
 * @returns {Promise<void>}
 */
async function pin(page, el) {
    await hover(page, el);
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

test.describe('MusicBrainz link previews: an editor\'s lists and account pages', () => {
    test('PATH: status lists, votes, edit searches, subscribers, applications; not the form, form_only, unknown, actions', async ({ page }) => {
        await open(page);
        const r = await page.evaluate(() => {
            const td = document.querySelector('table.tbl tbody tr td:first-child');
            const res = (href) => {
                const a = document.createElement('a');
                a.href = href;
                a.textContent = 'view';
                td.appendChild(a);
                return window.__saTest.popResolve(a);
            };
            return {
                rejected: res('/user/vzell/edits/rejected'), autoedits: res('/user/Some%20One/edits/autoedits'),
                votes: res('/user/vzell/votes'), bogus: res('/user/vzell/edits/bogus'),
                search: res('/search/edits?a=1&conditions.0.field=editor&page=3&order=desc'),
                form: res('/search/edits'), formOnly: res('/search/edits?form_only=yes&conditions.0.name=vzell'),
                subs: res('/user/vzell/subscribers'), apps: res('/account/applications'),
                revoke: res('/account/applications/revoke-access/77/1'), history: res('/user/vzell/edits'),
                tags: res('/user/vzell/tags'), down: res('/user/vzell/tags?show_downvoted=1'),
                ratings: res('/user/vzell/ratings'), userTag: res('/user/vzell/tag/rock'),
                userTagSp: res('/user/Some%20One/tag/acoustic%20rock'), userTagTab: res('/user/vzell/tag/live/release'),
                userTagDown: res('/user/vzell/tag/rock?show_downvoted=1'),
            };
        });
        expect(r.rejected).toBe('mb-entity|edits:/user/vzell/edits/rejected');
        expect(r.autoedits).toBe('mb-entity|edits:/user/Some%20One/edits/autoedits');
        expect(r.votes).toBe('mb-entity|edits:/user/vzell/votes');
        expect(r.bogus, 'a status the profile never links').toBeNull();
        expect(r.search, 'the query as spelled, without page=').toBe('mb-entity|edits:/search/edits?a=1&conditions.0.field=editor&order=desc');
        expect(r.form, 'the empty search form').toBeNull();
        expect(r.formOnly, 'a prefilled form lists nothing').toBeNull();
        expect(r.subs).toBe('mb-entity|subscribers:vzell');
        expect(r.apps).toBe('mb-entity|applications:me');
        expect(r.revoke, 'an action is never a target').toBeNull();
        expect(r.tags).toBe('mb-entity|usertags:vzell');
        expect(r.down, 'downvoted tags are another list than the card reads').toBeNull();
        expect(r.ratings).toBe('mb-entity|userratings:vzell');
        // An editor's own tag (2026-10-21): editor and tag as spelled; not its
        // kind pages, not its downvotes.
        expect(r.userTag).toBe('mb-entity|usertag:vzell/rock');
        expect(r.userTagSp).toBe('mb-entity|usertag:Some%20One/acoustic%20rock');
        expect(r.userTagTab, 'a kind page of it').toBeNull();
        expect(r.userTagDown, 'its downvotes are another list').toBeNull();
        expect(r.history, 'the editor\'s history as before').toBe('mb-entity|edits:user/vzell');
    });

    test('STATUS: a status list is the edits kind: card, window, its title; no editing history of a list', async ({ page }) => {
        const log = await open(page);
        const a = await addLink(page, '/user/vzell/edits/rejected', '0%');
        await hover(page, a);
        await expect(card(page).locator('.mb-tt-title')).toHaveText('vzell');
        await expect(card(page).locator('.mb-tt-comment').first()).toHaveText('Rejected edits · editor');
        await expect(card(page).locator('.mb-tt-pill').first()).toHaveText('65 edits');
        await page.keyboard.press('Space');
        await expect(title(page)).toHaveText('Rejected edits');
        await expect(rows(page)).toHaveCount(50);
        await expect(dialog(page).locator('.mb-dp-xsub').first()).toHaveText('MusicBrainz · editor · rejected edits');
        await expect(dialog(page).locator('button[data-mb-meh-act="more"]')).toHaveText('Load page 2 of 2');
        await expect(histBtn(page), 'a list has no editing history of its own').toBeHidden();
        expect(log.html).toEqual(['/user/vzell/edits/rejected']);
    });

    test('EMPTY: "Found 0 edits" is an empty list, not a failure', async ({ page }) => {
        await open(page);
        const a = await addLink(page, '/user/vzell/edits/open', 'view');
        await hover(page, a);
        await expect(card(page).locator('.mb-tt-pill').first()).toHaveText('0 edits');
        await expect(card(page).locator('.mb-tt-alert')).toHaveCount(0);
        await page.keyboard.press('Space');
        await expect(title(page)).toHaveText('Open edits');
        await expect(dialog(page).locator('.mb-meh-x')).toHaveText('MusicBrainz lists no edit here.');
    });

    test('VOTES: an editor\'s votes', async ({ page }) => {
        await open(page);
        const a = await addLink(page, '/user/vzell/votes', 'View all');
        await hover(page, a);
        await expect(card(page).locator('.mb-tt-comment').first()).toHaveText('Votes · editor');
        await expect(card(page).locator('.mb-tt-pill').first()).toHaveText('at least 500 edits');
        await page.keyboard.press('Space');
        await expect(title(page)).toHaveText('Votes');
        await expect(rows(page)).toHaveCount(50);
    });

    test('SEARCH: the query as spelled; page 2 with &page=2; memory only, while a status list is kept', async ({ page }) => {
        const log = await open(page);
        await pin(page, await addLink(page, SEARCH, '2%'));
        await expect(title(page)).toHaveText('Edit search');
        await expect(dialog(page).locator('.mb-dp-xtitle').first()).toHaveText('Edit search');
        await expect(rows(page)).toHaveCount(50);
        await dialog(page).locator('button[data-mb-meh-act="more"]').click();
        await expect(dialog(page).locator('.mb-meh-more .mb-dp-warn')).toContainText('Page 2 could not be read');
        expect(log.html).toEqual([SEARCH, `${SEARCH}&page=2`]);
        await page.keyboard.press('Escape');
        await hover(page, await addLink(page, '/user/vzell/edits/rejected', '0%'));
        await expect(card(page)).toContainText('fetched now');
        await reloadScript(page);
        await hover(page, await addLink(page, '/user/vzell/edits/rejected', '0%'));
        await expect(card(page)).toContainText('saved today');
        await hover(page, await addLink(page, SEARCH, '2%'));
        await expect(card(page)).toContainText('fetched now');
        expect(log.html, 'the search asked again, the status list not').toEqual([SEARCH, `${SEARCH}&page=2`, '/user/vzell/edits/rejected', SEARCH]);
    });

    test('SUBS: the profile\'s "view list": subscribers and anonymous ones; a click drills to an editor', async ({ page }) => {
        const log = await open(page, { url: USER_URL, fixtureFile: USER_FIXTURE });
        await page.click('button[data-label="Show profile as tables"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        // Sub-tables start collapsed: "General information" is the first.
        await ensureSubTableVisible(page, 0);
        const link = page.locator('table.tbl tbody a[href="/user/vzell/subscribers"]');
        await expect(link).toHaveCount(1);
        await hover(page, link);
        await expect(card(page).locator('.mb-tt-title')).toHaveText('vzell');
        await expect(card(page).locator('.mb-tt-pill')).toHaveText(['8 subscribers', '2 anonymous']);
        await expect(card(page).locator('.mb-tt-body').last()).toHaveText('editor-1, editor-2, editor-3, editor-4, editor-5, editor-6');
        await page.keyboard.press('Space');
        await expect(title(page)).toHaveText('Subscribers');
        const eds = dialog(page).locator('.mb-pop-taglist a');
        await expect(eds).toHaveCount(6);
        await eds.first().click();
        await expect(title(page)).toHaveText('Subscribers › Editor');
        await expect.poll(() => log.html, { message: 'the drill asks the editor\'s page after its rate slot' }).toEqual(['/user/vzell/subscribers', '/user/editor-1']);
    });

    test('APPS: names and access only, no Revoke link, memory only; a developer app\'s client id and secret never shown; a login page', async ({ page }) => {
        const DEV = '<table class="tbl"><thead><tr><th>Name</th><th>Type</th><th>OAuth Client ID</th><th>OAuth Client Secret</th><th>Actions</th></tr></thead>' +
            '<tbody><tr class="odd"><td>My Tagger</td><td>Installed</td><td>CLIENTIDxyz123</td><td>SECRETabc987</td>' +
            '<td><a href="/account/applications/edit/1">Edit</a> | <a href="/account/applications/remove/1">Remove</a></td></tr></tbody></table>';
        const body = fs.readFileSync(path.join(__dirname, 'applications-page-vzell.html'), 'utf8')
            .replace('<p>You do not have any registered applications.</p>', DEV);
        let login = false;
        const log = await open(page, {
            pageFixture: u => (u.endsWith('/account/applications') ? { status: 200, contentType: 'text/html',
                body: login ? '<html><body><div id="page"><h1>Log in</h1></div></body></html>' : body } : null),
        });
        await hover(page, await addLink(page, '/account/applications', 'view list'));
        await expect(card(page).locator('.mb-tt-pill')).toHaveText(['10 authorized', '1 developer', 'digest auth enabled']);
        await expect(card(page).locator('.mb-tt-body').last()).toContainText('AcoustID, BookBrainz, DeezerIsrc');
        await page.keyboard.press('Space');
        await expect(title(page)).toHaveText('Applications');
        const tables = dialog(page).locator('table.mb-rg-wtable');
        await expect(tables).toHaveCount(2);
        await expect(tables.first().locator('th')).toHaveText(['Application', 'Access', 'Last granted token']);
        await expect(tables.last().locator('th')).toHaveText(['Name', 'Type']);
        await expect(tables.last().locator('td')).toHaveText(['My Tagger', 'Installed']);
        const html = await dialog(page).innerHTML();
        expect(html, 'no client id').not.toContain('CLIENTIDxyz123');
        expect(html, 'no secret').not.toContain('SECRETabc987');
        expect(html, 'no Revoke access link').not.toMatch(/revoke/i);
        expect(html, 'no action link').not.toContain('/account/applications/');
        await page.keyboard.press('Escape');
        await reloadScript(page);
        login = true;
        await hover(page, await addLink(page, '/account/applications', 'view list'));
        await expect(card(page).locator('.mb-tt-alert')).toContainText('MusicBrainz shows this page only to its logged-in owner.');
        expect(log.html, 'asked again after the reload: memory only').toEqual(['/account/applications', '/account/applications']);
    });

    test('TAGS: tags, genres and votes, the most used first; a tag drills into its own tag card', async ({ page }) => {
        const log = await open(page);
        await hover(page, await addLink(page, '/user/vzell/tags', 'view'));
        await expect(card(page).locator('.mb-tt-title')).toHaveText('vzell');
        await expect(card(page).locator('.mb-tt-comment').first()).toHaveText('Tags · editor');
        await expect(card(page).locator('.mb-tt-pill')).toHaveText(['112 tags', '5 genres', '347 votes']);
        await expect(card(page).locator('.mb-tt-body').last(), 'the ten most used, genres and tags together')
            .toHaveText('live 47, studio 40, interview 30, rock 15, soundcheck 11, pop 10, solo 10, missing_artwork_koenboone 8, 2024 6, multiple events 6');
        await page.keyboard.press('Space');
        await expect(title(page)).toHaveText('Tags');
        const genres = dialog(page).locator('.mb-dp-col').first().locator('.mb-pop-taglist li');
        await expect(genres).toHaveText(['interview 30', 'rock 15', 'pop 10', 'acoustic rock 2', 'hard rock 1']);
        await expect(dialog(page).locator('.mb-dp-col').last().locator('.mb-pop-taglist li')).toHaveCount(107);
        await genres.first().locator('a').click();
        await expect(title(page)).toHaveText('Tags › Tag');
        await expect.poll(() => log.html, { message: 'the drill asks the tag\'s own page' }).toEqual(['/user/vzell/tags', '/tag/interview']);
    });

    // An editor's own tag (2026-10-21): the links of /user/<name>/tags, read
    // from /user/<name>/tag/<tag> (tests/fixtures/user-tag-page-vzell-*.html,
    // captured anonymously with scripts/fetch-mb-page-fixture.js).
    const TAGS_URL = 'https://musicbrainz.org/user/vzell/tags';
    const TAGS_FIXTURE = path.join(__dirname, 'user-tags-page-vzell.html');

    test('USER TAG: on the tags page itself, a tag\'s card: kind line, kinds by count, the first entries; one page request', async ({ page }) => {
        const log = await open(page, { url: TAGS_URL, fixtureFile: TAGS_FIXTURE });
        const a = page.locator('#all-tags a[href="/user/vzell/tag/live"]');
        await hover(page, a);
        await expect(card(page)).toContainText('fetched now');
        await expect(card(page).locator(':scope > .mb-pop-kind-head')).toHaveText('Editor\'s tag');
        await expect(card(page).locator(':scope > .mb-pop-kind-head img')).toHaveAttribute('src', /\/editor\.svg$/);
        await expect(card(page).locator('.mb-tt-title')).toHaveText('live');
        await expect(card(page).locator('.mb-tt-comment').first()).toHaveText('vzell’s tag');
        await expect(card(page).locator('.mb-tt-pill')).toHaveText(['47 entities']);
        await expect(card(page).locator('.mb-dp-kv dt')).toHaveText(['Releases', 'Release groups']);
        await expect(card(page).locator('.mb-dp-kv dd')).toHaveText(['44', '3']);
        const first = card(page).locator('.mb-pop-taglist li');
        await expect(first).toHaveCount(6);
        await expect(first.nth(1)).toContainText('Acoustic Tales');
        await expect(card(page).locator('.mb-tt-dim').last()).toHaveText('+ 41 more');
        expect(log.html).toEqual(['/user/vzell/tag/live']);
    });

    test('USER TAG: the window: editor, entities, everyone\'s tag (a drill), each kind\'s "See all" page', async ({ page }) => {
        const log = await open(page, { url: TAGS_URL, fixtureFile: TAGS_FIXTURE });
        await pin(page, page.locator('#all-tags a[href="/user/vzell/tag/live"]'));
        await expect(title(page)).toHaveText('Editor\'s tag');
        const left = dialog(page).locator('.mb-dp-col').first();
        await expect(left.locator('.mb-dp-kv dt')).toHaveText(['Editor', 'Entities', 'Everyone’s']);
        await expect(left.locator('.mb-dp-kv a[href="/user/vzell"]')).toHaveText('vzell');
        const right = dialog(page).locator('.mb-dp-col').last();
        await expect(right.locator('.mb-dp-gname')).toHaveText(['Releases · 44', 'Release groups · 3']);
        await expect(right.locator('a', { hasText: 'See all 44' })).toHaveAttribute('href', '/user/vzell/tag/live/release');
        await left.locator('.mb-dp-kv a[href="/tag/live"]').click();
        await expect(title(page)).toHaveText('Editor\'s tag › Tag');
        await expect.poll(() => log.html, { message: 'the drill asks everyone\'s tag page' }).toEqual(['/user/vzell/tag/live', '/tag/live']);
    });

    test('USER TAG: a small tag, one kind each; the table render\'s links have the card too', async ({ page }) => {
        // The button fetches the page again, with its query.
        await open(page, { url: TAGS_URL, fixtureFile: TAGS_FIXTURE, pageFixture: (u) => (/\/user\/vzell\/tags\?/.test(u) ? 'user-tags-page-vzell.html' : null) });
        await page.click('button[data-label="Tags upvoted"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await ensureSubTableVisible(page, 0);
        const a = page.locator('table.tbl tbody a[href="/user/vzell/tag/acoustic%20rock"]').first();
        await hover(page, a);
        await expect(card(page)).toContainText('fetched now');
        await expect(card(page).locator('.mb-tt-title')).toHaveText('acoustic rock');
        await expect(card(page).locator('.mb-dp-kv dt')).toHaveText(['Artists', 'Recordings']);
        await expect(card(page).locator('.mb-pop-taglist li')).toHaveText(['Bob Burger', 'Madalynn by Bob Burger']);
        await expect(card(page).locator('.mb-tt-dim'), 'all of them shown').toHaveCount(0);
    });

    test('USER TAG: a page that is not an editor\'s tag (a login page) fails and is not kept', async ({ page }) => {
        const log = await open(page, {
            url: TAGS_URL, fixtureFile: TAGS_FIXTURE,
            pageFixture: (u) => (/\/tag\/gig$/.test(u) ? 'user-page-vzell.html' : null),
        });
        const a = page.locator('#all-tags a[href="/user/vzell/tag/gig"]');
        await hover(page, a);
        await expect(card(page)).toContainText('Could not load it');
        await page.mouse.move(0, 0);
        await hover(page, a);
        await expect(card(page)).toContainText('Could not load it');
        expect(log.html, 'asked again: a failure is not kept').toEqual(['/user/vzell/tag/gig', '/user/vzell/tag/gig']);
    });

    test('RATINGS: per kind the stars and entities, never a /rating/rate/ link; an entity drills', async ({ page }) => {
        await open(page);
        await hover(page, await addLink(page, '/user/vzell/ratings', 'view'));
        await expect(card(page).locator('.mb-tt-comment').first()).toHaveText('Ratings · editor');
        await expect(card(page).locator('.mb-tt-pill')).toHaveText(['12 ratings shown', '7 kinds']);
        await page.keyboard.press('Space');
        await expect(title(page)).toHaveText('Ratings');
        const tables = dialog(page).locator('table.mb-rg-wtable');
        await expect(tables).toHaveCount(7);
        await expect(tables.first().locator('tbody td')).toHaveText(['★★★★★', 'Bruce Springsteen', '']);
        await expect(tables.nth(1).locator('tbody tr').first().locator('td').last())
            .toHaveText('(2001-05-27) (Southside Johnny & The Asbury Jukes at The Stone Pony, Southside Johnny & The Asbury Jukes Stone Pony 25th Anniversary Show)');
        await expect(tables.nth(1).locator('tbody tr').nth(1).locator('td').first()).toHaveText('★☆☆☆☆');
        const html = await dialog(page).innerHTML();
        expect(html, 'never a link that changes a rating').not.toContain('/rating/rate');
        await expect(dialog(page).locator('a[href="/user/vzell/ratings/artist"]')).toHaveText('All artist ratings');
        await tables.first().locator('a').click();
        await expect(title(page)).toHaveText('Ratings › Artist');
    });
});
