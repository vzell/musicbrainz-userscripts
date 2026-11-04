'use strict';

// setlist.fm: a setlist's own page (sfm-setlist, 2026-11-04;
// org/foreign-detail-PTs.org step 4, the setlist.fm tab of
// org/foreign-detail-PTs-mockups.html). The setlist as release-tracks shows a
// release: a sub-table per set or encore (setlist.fm's set names, else "Set
// N"), # · Song · Cover of · With · Tape · Info, and above them the show's
// facts (Show, Set times, Setlist; Guests and Covered artists on the right)
// and setlist.fm's Note. No request: the page holds the whole list. vzell's
// answer 2: covers and guests as setlist.fm links only. Fixtures:
// scripts/build-setlistfm-fixtures.py from vzell's snapshots (2026-10-29 to
// 2026-11-04).

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage, FIXTURE_SETTINGS_OVERRIDE } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const SFM = 'https://www.setlist.fm';
const FX = name => path.join(__dirname, name);
const SETLISTS = {
    '4bf0375a': '/setlist/bruce-springsteen/2016/los-angeles-sports-arena-los-angeles-ca-4bf0375a.html',
    '2b4b60da': '/setlist/bruce-springsteen/2026/xfinity-mobile-arena-philadelphia-pa-2b4b60da.html',
    '37589df': '/setlist/bruce-springsteen/2026/merriweather-post-pavilion-pavilion-stage-columbia-md-37589df.html',
    '737652e9': '/setlist/bruce-springsteen/2026/oceanfirst-bank-center-west-long-branch-nj-737652e9.html',
    '3b7c34e0': '/setlist/bruce-springsteen/2026/transparent-clinch-gallery-asbury-park-nj-3b7c34e0.html',
    'b7005be': '/setlist/jackson-pines/2026/bruce-springsteen-center-for-american-music-klose-amphitheater-long-branch-nj-b7005be.html',
};

/**
 * Loads a setlist page fixture under its own URL, everything else blocked,
 * and logs every request to setlist.fm.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} id - The setlist's id (a key of SETLISTS).
 * @param {Object} [settings]
 * @returns {Promise<{asked: string[], errors: string[]}>}
 */
async function open(page, id, settings = {}) {
    const asked = [];
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    page.on('request', (r) => { if (/setlist\.fm/.test(r.url())) asked.push(r.url()); });
    await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
    await loadUserscriptPage(page, {
        url: `${SFM}${SETLISTS[id]}`, fixtureFile: FX(`sfm-page-setlist-${id}.html`), testMode: true,
        settingsOverride: { ...FIXTURE_SETTINGS_OVERRIDE, sa_enable_setlistfm: true, sa_render_threshold: 100000, ...settings },
    });
    return { asked, errors };
}

/**
 * Presses "Show the setlist" and waits for the render.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function show(page) {
    await page.click('#mb-sfm-root button[data-label="Show the setlist"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

// The sub-tables' headings, without their counts and toggles.
const h3s = (page) => page.locator('#mb-sfm-root h3').evaluateAll(hs => hs.map(h => Array.from(h.childNodes)
    .filter(n => n.nodeType === 3).map(n => n.textContent).join('').replace(/\s+/g, ' ').trim()));

/**
 * Every rendered sub-table's rows as {column: text}.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<Array<Object>>>}
 */
function tables(page) {
    return page.evaluate(() => Array.from(document.querySelectorAll('#mb-sfm-root .mb-fd-head ~ * table.tbl, #mb-sfm-root > table.tbl, #mb-sfm-root table.tbl'))
        .filter((t, i, all) => all.indexOf(t) === i && !t.closest('.mb-fd-head'))
        .map((table) => {
            const names = Array.from(table.querySelectorAll('thead tr:first-child th')).map(th => th.dataset.colName || th.textContent.trim());
            return Array.from(table.querySelectorAll('tbody tr')).map((tr) => {
                const row = {};
                names.forEach((n, i) => { row[n] = (tr.cells[i]?.textContent || '').replace(/\s+/g, ' ').trim(); });
                return row;
            });
        }));
}

test.describe('setlist.fm: a setlist\'s page (sfm-setlist, 2026-11-04)', () => {
    test('Los Angeles 2016: a set before the named one, "The River", an unnamed break, the encore; numbered on; no request', async ({ page }) => {
        const { asked, errors } = await open(page, '4bf0375a');
        const before = asked.length;
        await show(page);
        expect(asked.length, 'the page itself: no request to setlist.fm').toBe(before);
        await expect(page.locator('#mb-sfm-root h2.mb-sfm-list-heading')).toContainText('Setlist');
        // The break after "The River" is the third set.
        expect(await h3s(page)).toEqual(['Set 1', 'The River', 'Set 3', 'Encore']);
        const t = await tables(page);
        expect(t.map(x => x.length)).toEqual([1, 20, 7, 7]);
        // Numbered on through the sets, as setlist.fm numbers them.
        expect(t[1][0]).toMatchObject({ '#': '2', Song: 'The Ties That Bind' });
        expect(t[3][6]).toMatchObject({ '#': '35', Song: 'Bobby Jean' });
        expect(t[2].find(r => r.Song === 'Because the Night')).toMatchObject({ 'Cover of': 'Patti Smith Group', With: '', Info: '' });
        // A song links its statistics on setlist.fm, absolute, in a new tab.
        const song = page.locator('#mb-sfm-root table.tbl a', { hasText: 'Meet Me in the City' }).first();
        await expect(song).toHaveAttribute('href', /^https:\/\/www\.setlist\.fm\/stats\/songs\/bruce-springsteen-2bd6dcce\.html\?songid=/);
        await expect(song).toHaveAttribute('target', '_blank');
        expect(errors).toEqual([]);
    });

    test('Philadelphia 2026: guests and covers as setlist.fm links, a note in a song, a tape at the end of the encore', async ({ page }) => {
        await open(page, '2b4b60da');
        await show(page);
        expect(await h3s(page)).toEqual(['Set 1', 'Encore']);
        const t = await tables(page);
        expect(t[0][0]).toMatchObject({ '#': '1', Song: 'War', 'Cover of': 'The Temptations', With: 'Tom Morello', Tape: '' });
        // "(with "It Takes Two" snippet interpolated)" is a note, not a guest:
        // it links nobody.
        expect(t[0].find(r => r.Song === 'Two Hearts')).toMatchObject({ With: '', Info: 'with "It Takes Two" snippet interpolated' });
        const tape = t[1][t[1].length - 1];
        // A tape is not numbered; its "(Woody Guthrie song)" names its artist.
        expect(tape).toMatchObject({ '#': '', Song: 'This Land Is Your Land', 'Cover of': 'Woody Guthrie', Tape: 'from tape' });
        const guest = page.locator('#mb-sfm-root table.tbl a', { hasText: 'Tom Morello' }).first();
        await expect(guest).toHaveAttribute('href', 'https://www.setlist.fm/setlists/tom-morello-13d689dd.html');
    });

    test('a festival: several guests\' notes, "[traditional]" covers elsewhere; named sets from the first song; one set without names', async ({ page }) => {
        await open(page, '37589df');
        await show(page);
        expect(await h3s(page)).toEqual(['Set 1']);
        const t = (await tables(page))[0];
        expect(t.find(r => r.Song === 'Fortunate Son')).toMatchObject({ 'Cover of': 'Creedence Clearwater Revival', With: 'Dave Matthews',
            Info: '+ with Tom Morello & Nathaniel Rateliff; first time since 2014' });
        expect(t.find(r => r.Song === 'Streets of Minneapolis')).toMatchObject({ Info: 'acoustic, Bruce solo' });
        expect(t.find(r => r.Song === 'Bella ciao')).toMatchObject({ '#': '', Tape: 'from tape', 'Cover of': 'Fonola Band' });

        await open(page, '737652e9');
        await show(page);
        const u = (await tables(page))[0];
        expect(u.find(r => /Saints/.test(r.Song))).toMatchObject({ 'Cover of': '[traditional]', With: 'Trombone Shorty & Orleans Avenue',
            Info: 'first time since 2014' });

        await open(page, '3b7c34e0');
        await show(page);
        expect(await h3s(page)).toEqual(['Solo Acoustic', 'With the jam band']);
    });

    test('the head: subheader, Note (closed), Details — Show, Set times, Setlist; Guests and Covered artists on the right', async ({ page }) => {
        const { errors } = await open(page, '2b4b60da');
        await show(page);
        await expect(page.locator('#mb-sfm-root > h1 + p.mb-fd-sub'))
            .toHaveText('~ Setlist by Bruce Springsteen (2026-05-30: Xfinity Mobile Arena, Philadelphia, PA, USA)');
        const head = page.locator('#mb-sfm-root .mb-fd-head');
        await expect(head.locator(':scope > h2.mb-fd-h2')).toHaveText([/Note$/, /Details \(\d+\)$/]);
        const card = name => head.locator('.mb-sb-card', { has: page.locator('.mb-sb-card-head', { hasText: new RegExp(`^${name}`) }) });
        const names = col => head.locator(`.mb-sb-${col} .mb-sb-card-head > span:first-child`).allTextContents();
        expect(await names('rail')).toEqual(['Show', 'Set times', 'Setlist']);
        expect(await names('main')).toEqual(['Guests', 'Covered artists']);
        await expect(card('Show').locator('dt')).toHaveText(['Date', 'Artist', 'Venue', 'Tour', 'Were there']);
        await expect(card('Show')).toContainText('Date2026-05-30');
        await expect(card('Show').locator('a', { hasText: 'Land of Hope & Dreams American Tour' }))
            .toHaveAttribute('href', 'https://www.setlist.fm/search?artist=2bd6dcce&tour=3daa95b');
        await expect(card('Setlist')).toContainText('Songs27');
        await expect(card('Setlist')).toContainText('Encores1 encore');
        await expect(card('Setlist')).toContainText('Tapes1 tape');
        // The guest on the most songs first, with how often.
        await expect(card('Guests').locator('.mb-sb-pill').first()).toHaveText(/^Tom Morello ×\d+$/);
        await expect(card('Covered artists').locator('a', { hasText: 'Bob Dylan' })).toHaveAttribute('href', /\/setlists\/bob-dylan-/);
        expect(errors).toEqual([]);
    });

    test('the Note, as setlist.fm writes it; set times when entered', async ({ page }) => {
        await open(page, '4bf0375a');
        await show(page);
        const head = page.locator('#mb-sfm-root .mb-fd-head');
        await expect(head.locator(':scope > h2.mb-fd-h2').first()).toHaveText(/Note$/);
        await expect(head.locator('.mb-fd-text')).toBeHidden();
        await expect(head.locator('.mb-fd-text')).toContainText('Bruce dedicated "Jungleland"');

        await open(page, '37589df');
        await show(page);
        const times = page.locator('#mb-sfm-root .mb-fd-head .mb-sb-card', { has: page.locator('.mb-sb-card-head', { hasText: /^Set times/ }) });
        await expect(times.locator('dt').first()).toBeVisible();
        // Several guests: the one on the most songs first (Tom Morello: two;
        // Joan Baez, first on the list, one), with how often.
        const guests = page.locator('#mb-sfm-root .mb-fd-head .mb-sb-card', { has: page.locator('.mb-sb-card-head', { hasText: /^Guests/ }) });
        await expect(guests.locator('.mb-sb-pill').first()).toHaveText('Tom Morello ×2');
        // A note in a span stays a note, even when it starts "with".
        expect((await tables(page))[0].find(r => r.Song === 'Power to the People')).toMatchObject({ With: '', Info: 'with the ensemble' });
    });

    test('a setlist without songs yet: no button', async ({ page }) => {
        const { errors } = await open(page, 'b7005be');
        await expect(page.locator('#mb-sfm-root')).toHaveCount(1);
        await expect(page.locator('#mb-sfm-root button[data-label="Show the setlist"]')).toHaveCount(0);
        expect(errors).toEqual([]);
    });
});
