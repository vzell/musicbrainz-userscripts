'use strict';

// Relationship tables (org/relationship-tables-pt.org, WIP.6) on every page
// family besides the recording (rel-tables-recording.spec.js): the three new
// overview pageTypes (place, area, instrument) and the "Relationships" /
// "Relationship lists" / "Credits" button of series, work, label and artist
// Relationships tab, release group and release.
//
// Fixtures: tests/fixtures/rel-<kind>-overview.html, raw captures taken
// 2026-10-12T18:28Z on vzell-lap (tests/support/capture-raw-page.js), read
// back with scripts/probe-rel-sections.js.
//
// What each test pins, and the neighbouring property it keeps apart:
//
//  1. THE GROUPS, per page: names, row counts, and every row as wide as its
//     header. Row counts alone pass on a render that clones the first group's
//     header for every group.
//  2. THE BUTTONS: the overview pages have one; the others keep their own
//     button FIRST and gain one. Pins `showIf` and the button order.
//  3. THE MAIN SECTION IS GONE for this render (either/or) — including on the
//     work page, where Relationships comes BEFORE the main table, so the
//     render's "last h2 before the first table" anchor would otherwise be
//     right by accident.
//  4. THE ATTRIBUTES THE EVENT CONVERTER DOES NOT READ: "(… to present)",
//     "(until 1931)", "(ended)", an area's parent chain, a series position
//     with its date ("in 1997: number: 1997"), number ≠ order → two columns,
//     number = order → one, and an ended URL (no link, struck through).
//  5. NO PICARD COLUMN on a URL table whose links merely contain "/release/"
//     (discogs.com/release/…, rateyourmusic.com/release/…). Fails before the
//     initPicardTaggerColumn() guard was narrowed to MusicBrainz links.
//  6. RELEASE CREDITS: the release's own lists and its group's, never the
//     track credits; the group's title from the sidebar.
//
// WIP.7 (user review 2026-10-12):
//  7. A PRIMARY ALIAS (`<i title="Primary alias">` inside the disambiguation
//     span) is its own column; a real disambiguation stays Disambiguation.
//  8. A MEMBER'S PERIOD AND CREDITS — "(from 1964-12 until 1965-06: lead
//     vocals, <a>electric guitar</a>)" — split into Begin, End (with their
//     date parts) and a multi-row Credits cell. Checking only that Begin is
//     filled passes on code that leaves the date in Credits too.
//  9. "MusicBrainz More Flags Everywhere" WRAPS an area's link and the comma
//     before its parent chain: the chain still lands in Parent area and no
//     Details column appears. The wrapping is applied in the test exactly as
//     that script leaves it (debug/area-USA-initial.html).
// 10. GENRE / INSTRUMENT GLYPHS move to the header like the other kinds.
// 12. 📊 "Entity info - Type" on a mixed Target/Type column: one entry per
//     kind, its glyph in the marker slot, its count equal to the table's own
//     Type cells (a DOM oracle, not a second reading of the same attribute),
//     and a tick that leaves exactly those rows. A count that only checks
//     "the section exists" passes on entries that never filter.
// 11. INLINE ARTWORK: a cover-art placeholder before every release-group
//     target and an event-art one before every event target of a mixed
//     "Target" column, none on series/URL rows (fixture
//     rel-release-art-overview.html, release 1d404e1d, 24 events and 11
//     release groups in its release group's lists).
// 13. jesus2099's COVER-ART ICON LINK before each release-group target
//     (`<a href="/release/<mbid>/cover-art"><span class="caa-icon …">`, added
//     once that script's lookup returns): the row stays a "Release group"
//     with its name in Target and our own inline thumbnail, and no Details or
//     Picard column appears. Checking only the Type passes on code that
//     keeps the icon in the cell next to our thumbnail.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { waitForFilterSettled } = require('../support/filterSortAssertions');

const PAGES = {
    place: ['https://musicbrainz.org/place/6a59a67c-fcc5-491f-949c-bfc45bc97463', 'Show all Relationships for Place'],
    area: ['https://musicbrainz.org/area/489ce91b-6658-3307-9877-795b68554c98', 'Show all Relationships for Area'],
    instrument: ['https://musicbrainz.org/instrument/a1baa57d-6ab4-461e-89df-448d6fd2c597', 'Show all Relationships for Instrument'],
    genre: ['https://musicbrainz.org/genre/883d75d5-1365-46ee-8cbe-d3ae2facdd93', 'Show all Relationships for Genre'],
    series: ['https://musicbrainz.org/series/f4818e95-a515-4821-ad6d-270703f72dcf', 'Show all Relationships for Series'],
    work: ['https://musicbrainz.org/work/1f573511-eb4b-3106-8fb2-f15de52e4868', 'Show all Relationships for Work'],
    'label-rels': ['https://musicbrainz.org/label/0b805b9c-ea03-4fc1-b50d-6dcef76433e0/relationships', 'Show all Relationship lists for Label'],
    'artist-rels': ['https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f/relationships', 'Show all Relationship lists for Artist'],
    'release-group': ['https://musicbrainz.org/release-group/d5f992ab-6238-3b28-bf2b-7b16d913c9f6', 'Show all Relationships for ReleaseGroup'],
    release: ['https://musicbrainz.org/release/f50fcf09-4339-4e1c-91cd-e1d2a7b3a7bc', 'Show all Credits for Release'],
    'release-art': ['https://musicbrainz.org/release/1d404e1d-fcb6-3a52-b478-e706e893c897', 'Show all Credits for Release'],
    url: ['https://musicbrainz.org/url/a333fbe2-2707-4799-aa2e-50d21be8081c', 'Show all Relationships for URL'],
};

/**
 * Loads one fixture (MusicBrainz's own bundles blocked, every page fetch
 * answered with the same fixture, ws/2 refused) and, unless `press` is false,
 * presses its relationship-tables button and waits for the render.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} kind  A key of PAGES.
 * @param {{settings?: Object, press?: boolean}} [opts]
 */
async function open(page, kind, { settings = {}, press = true, before = null } = {}) {
    const [url, label] = PAGES[kind];
    const fixture = path.join(__dirname, `rel-${kind}-overview.html`);
    await page.context().route('https://static.metabrainz.org/**', (route) => route.abort('blockedbyclient'));
    await loadUserscriptPage(page, {
        url, fixtureFile: fixture, testMode: true,
        settingsOverride: { sa_enable_relationship_tables: true, sa_enable_release_tracks: true, sa_sidebar_in_rel_tables: false, ...settings },
    });
    await page.route('https://musicbrainz.org/ws/2/**', (route) => route.fulfill({ status: 404, body: '' }));
    await page.route(/^https:\/\/musicbrainz\.org\/(?!ws\/)/, (route) => route.fulfill({ path: fixture, contentType: 'text/html' }));
    await page.route('https://coverartarchive.org/**', (route) => route.fulfill({ status: 404, body: '' }));
    await page.route('https://eventartarchive.org/**', (route) => route.fulfill({ status: 404, body: '' }));
    if (before) await page.evaluate(before);
    if (!press) return;
    await page.click(`button[data-label="${label}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/**
 * Every rendered group as { name, heads, rows }, keyed by name.
 *
 * @param {import('@playwright/test').Page} page
 */
const groups = async (page) => Object.fromEntries((await page.evaluate(() => Array.from(document.querySelectorAll('h3.mb-toggle-h3')).map((h3) => {
    let t = h3.nextElementSibling;
    while (t && t.tagName !== 'TABLE') t = t.nextElementSibling;
    const icon = h3.querySelector('.mb-toggle-icon');
    const name = icon && icon.nextSibling ? icon.nextSibling.textContent.trim() : h3.textContent.trim();
    const heads = t ? Array.from(t.querySelectorAll('thead tr:first-child th')).map((th) => (th.dataset.colName || th.textContent).replace(/[⇅▲▼📊]/gu, '').trim()) : [];
    const rows = t ? Array.from(t.querySelectorAll('tbody tr')).map((tr) => Array.from(tr.cells).map((td) => td.textContent.replace(/\s+/g, ' ').trim())) : [];
    return { name, heads, rows };
}))).map((g) => [g.name, g]));

/** A row of group `g` whose column `head` reads `text`, as { header: cell }. */
const rowBy = (g, head, text) => {
    const r = g.rows.find((x) => x[g.heads.indexOf(head)] === text);
    return r ? Object.fromEntries(g.heads.map((h, i) => [h, r[i]])) : null;
};

/** Every group's rows are as wide as its header. */
const expectAligned = (g) => Object.values(g).forEach((x) => x.rows.forEach((r, k) =>
    expect(r.length, `${x.name} row ${k + 1}: cells = header cells`).toBe(x.heads.length)));

const sizes = (g) => Object.values(g).map((x) => [x.name, x.rows.length]);

test.describe('relationship tables: overview pageTypes (WIP.6)', () => {
    test('place: one button, its links as a URL table', async ({ page }) => {
        await open(page, 'place', { press: false });
        // "🗂 Sidebar as tables" (sidebar-tables.spec.js) is off by default since 9.99.1353.
        expect(await page.evaluate(() => Array.from(document.querySelectorAll('button[data-label]')).map((b) => b.dataset.label)))
            .toEqual(['Show all Relationships for Place']);
        await page.click('button[data-label="Show all Relationships for Place"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const g = await groups(page);
        expect(sizes(g)).toEqual([['URLs', 5]]);
        expect(g.URLs.heads).toEqual(['#', 'Site', 'URL', 'Relationship']);
        expect(rowBy(g.URLs, 'Relationship', 'fan pages').Site).toBe('brucebase.wikidot.com');
    });

    test('area: 279 targets; parent chain, "to present" and "until" read', async ({ page }) => {
        await open(page, 'area');
        const g = await groups(page);
        expect(sizes(g)).toEqual([['Areas', 57], ['Genres', 139], ['Instruments', 3], ['Labels', 1], ['Series', 75], ['URLs', 2], ['Works', 2]]);
        expectAligned(g);
        expect(g.Areas.heads, 'the chain cannot share the target\'s "Area" header').toEqual(['#', 'Area', 'Relationship', 'Parent area']);
        expect(rowBy(g.Areas, 'Area', 'Alabama')['Parent area']).toBe('United States');
        const league = rowBy(g.Labels, 'Label', 'The League Label Group');
        expect([league.Begin, league.End, league['B-YYYY'], league['E-YYYY']]).toEqual(['2022-01-01', 'present', '2022', '']);
        const anthemUsa = g.Works.rows.find((r) => r[g.Works.heads.indexOf('Relationship')] === 'anthem (as USA)');
        expect([anthemUsa[g.Works.heads.indexOf('Begin')], anthemUsa[g.Works.heads.indexOf('End')]], '"(until 1931)"').toEqual(['', '1931']);
        expect(rowBy(g.Instruments, 'Instrument', 'frottoir').Relationship).toBe('instruments (as United States of America)');
    });

    test('url: the entities that link the URL; "URL details" stays native', async ({ page }) => {
        await open(page, 'url', { press: false });
        expect(await page.evaluate(() => Array.from(document.querySelectorAll('button[data-label]')).map((b) => b.dataset.label)),
            'the page is reachable (@include) and has its one button').toEqual(['Show all Relationships for URL']);
        await page.click('button[data-label="Show all Relationships for URL"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const g = await groups(page);
        expect(sizes(g)).toEqual([['Release groups', 1]]);
        const rg = rowBy(g['Release groups'], 'Relationship', 'other databases');
        // "▶" is the expand-release-groups toggle (sa_enable_expand_rgs).
        expect(rg['Release group'].replace(/^▶/, '')).toBe('Born to Run');
        expect(rg.Artist).toBe('Bruce Springsteen');
        const st = await page.evaluate(() => ({
            details: !!document.querySelector('#content h2.url-details'),
            urlRow: document.querySelectorAll('#content table.details').length,
        }));
        expect(st, 'the one-row "URL details" list is not a relationship list').toEqual({ details: true, urlRow: 1 });
    });

    test('instrument: the instrument it is part of, with its disambiguation', async ({ page }) => {
        await open(page, 'instrument');
        const g = await groups(page);
        expect(sizes(g)).toEqual([['Instruments', 1], ['URLs', 3]]);
        expect(rowBy(g.Instruments, 'Instrument', 'guitar family')).toMatchObject({ Relationship: 'part of', Disambiguation: 'DO NOT USE' });
    });

    // genre-overview (2026-10-26, rel-genre-overview.html: roots rock, the
    // page as MusicBrainz sends it, wrapped by scripts/build-genre-overview-fixture.py).
    // Pins: the page has its one button (match + @include-free fixture
    // injection); its genre lists become ONE "Genres" table with every phrase
    // as the Relationship, the URLs their own table; and the "Associated
    // tags" table.details (under its own h2, not h2.relationships) is left
    // native, so the primary tag is neither a row nor gone. Counting rows
    // alone passes on a converter that also swallowed the tag table (its
    // one link is a /tag/, not a genre), so the tag table is asserted too.
    test('genre: subgenre of / subgenres / influenced by as one Genres table; Associated tags stays native', async ({ page }) => {
        await open(page, 'genre', { press: false });
        expect(await page.evaluate(() => Array.from(document.querySelectorAll('button[data-label]')).map((b) => b.dataset.label)))
            .toEqual(['Show all Relationships for Genre']);
        await page.click('button[data-label="Show all Relationships for Genre"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const g = await groups(page);
        expect(sizes(g)).toEqual([['Genres', 5], ['URLs', 2]]);
        expectAligned(g);
        expect(rowBy(g.Genres, 'Genre', 'rock').Relationship).toBe('subgenre of');
        expect(rowBy(g.Genres, 'Genre', 'tex-mex').Relationship).toBe('subgenres');
        expect(g.Genres.rows.filter((r) => r[g.Genres.heads.indexOf('Relationship')] === 'influenced by')
            .map((r) => r[g.Genres.heads.indexOf('Genre')])).toEqual(['blues', 'country', 'r&b']);
        expect(rowBy(g.URLs, 'Relationship', 'Wikidata').Site).toBe('wikidata.org');
        const st = await page.evaluate(() => {
            const t = Array.from(document.querySelectorAll('#content table.details')).find((x) => /Primary tag/.test(x.textContent));
            return { tagTable: !!t, tag: t ? t.querySelector('a[href^="/tag/"]').textContent : '' };
        });
        expect(st, 'the primary tag table is not a relationship list').toEqual({ tagTable: true, tag: 'roots rock' });
    });
});

test.describe('relationship tables: the second button (WIP.6)', () => {
    test('series: the page\'s own button first, the main table gone for this render', async ({ page }) => {
        await open(page, 'series', { press: false });
        expect(await page.evaluate(() => Array.from(document.querySelectorAll('button[data-label]')).map((b) => b.dataset.label)))
            .toEqual(['Show all Events for Series', 'Show all Relationships for Series']);
        await page.click('button[data-label="Show all Relationships for Series"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const g = await groups(page);
        expect(sizes(g)).toEqual([['Places', 1], ['URLs', 2]]);
        expect(rowBy(g.Places, 'Place', 'SiriusXM Studio').Area).toBe('New York, New York, United States');
        expect(await page.locator('#content h2', { hasText: 'Events' }).count(), 'the "Events" section is removed').toBe(0);
    });

    test('work: Relationships comes first on the page; Recordings is still removed', async ({ page }) => {
        await open(page, 'work');
        const g = await groups(page);
        expect(sizes(g)).toEqual([['Artists', 2], ['Labels', 8], ['URLs', 6], ['Works', 1]]);
        expectAligned(g);
        expect(await page.locator('#content h2', { hasText: 'Recordings' }).count()).toBe(0);
        expect(rowBy(g.Labels, 'Label', 'Rondor Music (France)').End, '"(ended)"').toBe('ended');
        const laurel = rowBy(g.Labels, 'Label', 'Laurel Canyon Music Ltd.');
        expect([laurel.Begin, laurel.End, laurel.Disambiguation]).toEqual(['1973', '1973', 'publishing company of Mike Appel and Jim Cretecos']);
    });

    test('label Relationships tab: "Relationship lists" beside the existing "Relationships"', async ({ page }) => {
        await open(page, 'label-rels');
        const g = await groups(page);
        expect(sizes(g)).toEqual([['Labels', 6], ['URLs', 1]]);
        expect(await page.locator('#content h2', { hasText: 'Appearances' }).count()).toBe(0);
    });

    test('artist Relationships tab: series positions, ended URLs', async ({ page }) => {
        await open(page, 'artist-rels');
        const g = await groups(page);
        expect(sizes(g)).toEqual([['Artists', 51], ['Labels', 1], ['Series', 35], ['URLs', 75]]);
        expectAligned(g);
        expect(g.Series.heads.slice(0, 7), 'number ≠ order on some row: two columns')
            .toEqual(['#', 'Series', 'Relationship', 'Number', 'Order', 'Begin', 'End']);
        expect(rowBy(g.Series, 'Series', 'Super Bowl Halftime Show Headliners'), '"(on 2009-02-01: number: 43) (order: 19)"')
            .toMatchObject({ Number: '43', Order: '19', Begin: '2009-02-01', End: '2009-02-01' });
        expect(rowBy(g.Series, 'Series', 'Polar Music Prize')).toMatchObject({ Number: '1997', Order: '10', Begin: '1997' });
        expect(rowBy(g.Series, 'Series', 'Q Awards 2019 Nominees – Q Best Act in the World Today'), 'only an order').toMatchObject({ Number: '', Order: '4' });
        // An ended URL relationship has no link natively; it is still a URL row.
        const ended = g.URLs.rows.find((r) => r[g.URLs.heads.indexOf('URL')].startsWith('https://play.google.com/store/music/artist?id=A6pay'));
        expect(ended, 'the ended play.google.com link is a URL row').toBeTruthy();
        expect(ended[g.URLs.heads.indexOf('Site')]).toBe('play.google.com');
        expect(ended[g.URLs.heads.indexOf('End')]).toBe('2020-10-12');
        expect(ended[g.URLs.heads.indexOf('URL')], '"[info]" stays with the link').toMatch(/\[info\]$/);
        expect(Object.keys(g), 'no "Other" group of unparsed lines').not.toContain('Other');
    });

    test('release group: no Picard column on a URL table with "/release/" in external links', async ({ page }) => {
        await open(page, 'release-group');
        const g = await groups(page);
        expect(sizes(g)).toEqual([['Release groups', 2], ['URLs', 10]]);
        expect(g.URLs.heads).not.toContain('Picard');
        expect(await page.locator('table.tbl th.mb-picard-th').count()).toBe(0);
        expect(await page.locator('#content h2', { hasText: 'Album' }).count(), 'the "Album" section is removed').toBe(0);
    });

    test('release: "Credits" — the release\'s own lists and its group\'s, Number for a series part', async ({ page }) => {
        await open(page, 'release');
        const g = await groups(page);
        expect(sizes(g)).toEqual([['Artists', 1], ['URLs', 1], ['Via release group: Live/1975–85', 11]]);
        expectAligned(g);
        const via = g['Via release group: Live/1975–85'];
        expect(via.heads.slice(0, 5)).toEqual(['#', 'Target', 'Type', 'Relationship', 'Number']);
        expect(via.heads, 'number = order: one column').not.toContain('Order');
        expect(rowBy(via, 'Relationship', 'part of')).toMatchObject({ Type: 'Series', Number: '20', Disambiguation: '2015-04-29' });
        expect(g.URLs.heads, 'discogs.com/release/… is not a MusicBrainz release').not.toContain('Picard');
        const st = await page.evaluate(() => ({
            tracklist: !!document.querySelector('#content h2.tracklist'),
            bottom: !!document.getElementById('bottom-credits'),
            details: document.querySelectorAll('#content table.details').length,
        }));
        expect(st).toEqual({ tracklist: false, bottom: false, details: 0 });
    });

    test('release, "Include related" off: the release group block stays native', async ({ page }) => {
        await open(page, 'release', { settings: { sa_relationship_tables_related: false } });
        const g = await groups(page);
        expect(sizes(g)).toEqual([['Artists', 1], ['URLs', 1]]);
        const native = await page.evaluate(() => {
            const rg = document.getElementById('release-group-relationships');
            return rg ? { h3: rg.querySelector('h3')?.textContent.trim(), details: rg.querySelectorAll('table.details').length } : null;
        });
        expect(native).toMatchObject({ details: 2 });
        expect(native.h3).toContain('Release group');
    });
});

test.describe('relationship tables: review fixes (WIP.7)', () => {
    test('work: a primary alias is its own column, a disambiguation stays one', async ({ page }) => {
        await open(page, 'work');
        const g = await groups(page);
        expectAligned(g);
        expect(g.Labels.heads).toContain('Primary alias');
        expect(rowBy(g.Labels, 'Label', 'フジパシフィックミュージック')).toMatchObject({ 'Primary alias': 'Fujipacific Music, Inc.', Disambiguation: '', End: 'ended' });
        expect(rowBy(g.Labels, 'Label', 'ソニー・ミュージックパブリッシング A事業部'))
            .toMatchObject({ 'Primary alias': 'Sony Music Publishing (Japan) Inc., A Division', Disambiguation: '' });
        expect(rowBy(g.Labels, 'Label', 'Laurel Canyon Music Ltd.'))
            .toMatchObject({ Disambiguation: 'publishing company of Mike Appel and Jim Cretecos', 'Primary alias': '' });
    });

    test('artist: a member\'s period and credits split into Begin, End and multi-row Credits', async ({ page }) => {
        await open(page, 'artist-rels');
        const g = await groups(page);
        const a = g.Artists;
        const rogues = rowBy(a, 'Artist', 'The Rogues');
        expect(rogues).toMatchObject({ Relationship: 'member of', Begin: '1964-12', End: '1965-06', Disambiguation: 'Bruce Springsteen’s first band',
            'B-MM': '12', 'B-YYYY': '1964', 'B-Month': 'December', 'E-MM': '6', 'E-YYYY': '1965' });
        const credits = await page.evaluate(() => {
            const t = Array.from(document.querySelectorAll('table.tbl')).find((x) => Array.from(x.querySelectorAll('thead th')).some((th) => th.dataset.colName === 'Artist'));
            const k = Array.from(t.querySelectorAll('thead tr:first-child th')).findIndex((th) => th.dataset.colName === 'Credits');
            const per = (name) => {
                const tr = Array.from(t.querySelectorAll('tbody tr')).find((r) => r.cells[1].textContent.trim() === name);
                return Array.from(tr.cells[k].querySelectorAll('li')).map((li) => li.textContent.trim());
            };
            return { rogues: per('The Rogues'), jersey: per('Jersey Artists for Mankind'), mammas: per('The Red Hot Mammas') };
        });
        expect(credits.rogues).toEqual(['lead vocals', 'electric guitar']);
        expect(credits.jersey, '"(in 1986: electric guitar)"').toEqual(['electric guitar']);
        expect(credits.mammas, '"(in 1971)" alone: no credits').toEqual([]);
        expect(rowBy(a, 'Artist', 'Jersey Artists for Mankind')).toMatchObject({ Begin: '1986', End: '1986' });
        a.rows.forEach((r) => expect(r[a.heads.indexOf('Credits')], 'no date left in Credits').not.toMatch(/\b(from|until|in) [0-9]{4}/));
    });

    test('area with "More Flags Everywhere": the parent chain still lands in Parent area, no Details column', async ({ page }) => {
        // Rewrite each "parts" line the way that script leaves it: the glyph,
        // the link, a flag <img> and the following "," in one wrapper span.
        await open(page, 'area', {
            press: false,
            before: () => {
                const th = Array.from(document.querySelectorAll('#content table.details th')).find((x) => x.textContent.trim() === 'parts:');
                th.nextElementSibling.querySelectorAll(':scope > a.wrap-anywhere').forEach((a) => {
                    const comma = a.nextSibling;
                    if (!comma || comma.nodeType !== Node.TEXT_NODE || !comma.textContent.startsWith(',')) return;
                    const glyph = a.previousElementSibling && a.previousElementSibling.matches('span.arealink') ? a.previousElementSibling : null;
                    const w = document.createElement('span');
                    w.className = 'mfe-flag-wrapper';
                    a.before(w);
                    if (glyph) w.appendChild(glyph);
                    w.appendChild(a);
                    const img = document.createElement('img');
                    img.className = 'mb-hq-flag-img';
                    w.appendChild(img);
                    comma.textContent = comma.textContent.slice(1);
                    w.appendChild(document.createTextNode(','));
                });
            },
        });
        expect(await page.locator('span.mfe-flag-wrapper').count(), 'the wrapping took').toBeGreaterThan(50);
        await page.click('button[data-label="Show all Relationships for Area"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const g = await groups(page);
        expect(g.Areas.heads).toEqual(['#', 'Area', 'Relationship', 'Parent area']);
        expect(rowBy(g.Areas, 'Area', 'Alabama'), 'no comma left in the target').toMatchObject({ 'Parent area': 'United States' });
        expect(g.Areas.rows.every((r) => r[3] === 'United States')).toBe(true);
    });

    test('Genre and Instrument show their glyph in the header, not on every cell', async ({ page }) => {
        await open(page, 'area');
        const st = await page.evaluate(() => {
            const tableOf = (col) => Array.from(document.querySelectorAll('table.tbl')).find((t) => Array.from(t.querySelectorAll('thead th')).some((th) => th.dataset.colName === col));
            const glyph = (col, cls) => {
                const t = tableOf(col);
                return { head: !!t.querySelector(`thead span.${cls}`), cells: t.querySelectorAll(`tbody span.${cls}`).length };
            };
            return { genre: glyph('Genre', 'genrelink'), instrument: glyph('Instrument', 'instrumentlink') };
        });
        expect(st).toEqual({ genre: { head: true, cells: 0 }, instrument: { head: true, cells: 0 } });
    });

    test('inline cover art before release groups, event art before events, in a mixed Target column', async ({ page }) => {
        await open(page, 'release-art', { settings: { sa_enable_caa_pics: true, sa_caa_pics_inline: true } });
        const g = await groups(page);
        const via = Object.values(g).find((x) => x.name.startsWith('Via release group'));
        expect(via, 'the release group\'s lists').toBeTruthy();
        const st = await page.evaluate((name) => {
            const h3 = Array.from(document.querySelectorAll('h3.mb-toggle-h3')).find((h) => h.textContent.includes(name));
            let t = h3.nextElementSibling;
            while (t && t.tagName !== 'TABLE') t = t.nextElementSibling;
            const heads = Array.from(t.querySelectorAll('thead tr:first-child th')).map((th) => th.dataset.colName);
            const k = heads.indexOf('Target');
            const ty = heads.indexOf('Type');
            const by = {};
            Array.from(t.querySelectorAll('tbody tr')).forEach((tr) => {
                const type = tr.cells[ty].textContent.trim();
                const c = by[type] || (by[type] = { rows: 0, caa: 0, eaa: 0 });
                c.rows++;
                if (tr.cells[k].querySelector('.mb-caa-inline-ph')) c.caa++;
                if (tr.cells[k].querySelector('.mb-eaa-inline-ph')) c.eaa++;
            });
            return by;
        }, 'Via release group');
        expect(st['Release group']).toEqual({ rows: 11, caa: 11, eaa: 0 });
        expect(st.Event).toEqual({ rows: 24, caa: 0, eaa: 24 });
        expect(st.Series).toMatchObject({ caa: 0, eaa: 0 });
        expect(st.URL).toMatchObject({ caa: 0, eaa: 0 });
    });

    test('jesus2099\'s cover-art icon before a release group is never the target', async ({ page }) => {
        // Rewrite each release-group line the way "mb. SUPER MIND CONTROL"
        // leaves it once its lookup returns: a text-less cover-art link of one
        // of the group's releases before the group's own link, and its big box
        // (debug/release-tracks-with-sidebar-initial.html).
        await open(page, 'release-art', {
            press: false,
            settings: { sa_enable_caa_pics: true, sa_caa_pics_inline: true },
            before: () => {
                const rg = document.querySelector('#release-group-relationships');
                const box = document.createElement('div');
                box.className = 'jesus2099userjs154481bigbox';
                rg.querySelector('h3').after(box);
                rg.querySelectorAll('table.details a[href^="/release-group/"]').forEach((a) => {
                    const icon = document.createElement('a');
                    icon.href = 'https://musicbrainz.org/release/de3273d0-4906-4760-b8e2-51a7ffde946b/cover-art';
                    icon.setAttribute('ref', a.getAttribute('href'));
                    icon.title = '1 image found in this release';
                    const span = document.createElement('span');
                    span.className = 'caa-icon jesus2099userjs154481';
                    icon.appendChild(span);
                    a.before(icon);
                    const big = document.createElement('a');
                    big.href = a.getAttribute('href');
                    box.appendChild(big);
                });
            },
        });
        expect(await page.locator('#release-group-relationships span.caa-icon.jesus2099userjs154481').count(), 'the icons are in').toBe(11);
        await page.click('button[data-label="Show all Credits for Release"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const st = await page.evaluate(() => {
            const h3 = Array.from(document.querySelectorAll('h3.mb-toggle-h3')).find((h) => h.textContent.includes('Via release group'));
            let t = h3.nextElementSibling;
            while (t && t.tagName !== 'TABLE') t = t.nextElementSibling;
            const heads = Array.from(t.querySelectorAll('thead tr:first-child th')).map((th) => th.dataset.colName || th.textContent.trim());
            const k = heads.indexOf('Target');
            const ty = heads.indexOf('Type');
            const types = {};
            let named = 0;
            let thumbs = 0;
            Array.from(t.querySelectorAll('tbody tr')).forEach((tr) => {
                const type = tr.cells[ty].textContent.trim();
                types[type] = (types[type] || 0) + 1;
                if (type !== 'Release group') return;
                const link = tr.cells[k].querySelector('a[href*="/release-group/"]');
                if (link && link.textContent.trim()) named++;
                if (tr.cells[k].querySelector('.mb-caa-inline-ph')) thumbs++;
            });
            return { heads, types, named, thumbs, icons: t.querySelectorAll('span.caa-icon.jesus2099userjs154481').length };
        });
        expect(st.types['Release group'], 'the parse: still release groups').toBe(11);
        expect(st.types.Release, 'no row read as the icon\'s release').toBeUndefined();
        expect(st.named, 'the group\'s name in Target').toBe(11);
        expect(st.heads.filter((h) => /Details|Picard/.test(h)), 'no Details/Picard column').toEqual([]);
        expect(st.thumbs, 'our own inline thumbnail instead').toBe(11);
        expect(st.icons, 'the third-party icon is gone').toBe(0);
    });
});

test.describe('relationship tables: 📊 entity types of a mixed column', () => {
    const SECTION = 'Entity info - Type';
    /** Index of the "Via release group" table, and its Type cells as the oracle. */
    const viaTable = (page) => page.evaluate(() => {
        const tables = Array.from(document.querySelectorAll('table.tbl'));
        const idx = tables.findIndex((t) => Array.from(t.querySelectorAll('thead th')).some((th) => th.dataset.colName === 'Target'));
        const t = tables[idx];
        const k = Array.from(t.querySelectorAll('thead tr:first-child th')).findIndex((th) => th.dataset.colName === 'Type');
        const counts = {};
        t.querySelectorAll('tbody tr').forEach((tr) => { const v = tr.cells[k].textContent.trim(); counts[v] = (counts[v] || 0) + 1; });
        return { idx, counts };
    });

    for (const col of ['Target', 'Type']) {
        test(`"${col}": one entry per kind with its glyph and row count`, async ({ page }) => {
            await open(page, 'release-art');
            const { idx, counts } = await viaTable(page);
            expect(counts).toMatchObject({ Event: 24, 'Release group': 11 });
            const sections = await page.evaluate(([c, i]) => window.__saTest.getUniqDropSections(c, i), [col, idx]);
            const section = sections.find((x) => x.label === SECTION);
            expect(section, `${SECTION} on ${col}`).toBeTruthy();
            const got = Object.fromEntries(section.items.map((i) => [i.label.replace(/^🔗 /, ''), i.count]));
            expect(got).toEqual(counts);
            const glyphs = await page.evaluate((sec) => {
                const out = {};
                document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section').forEach((s) => {
                    if (s.querySelector('.mb-uniq-section-label')?.textContent !== sec) return;
                    s.querySelectorAll('.mb-col-uniq-item').forEach((it) => {
                        const g = it.querySelector('span[aria-hidden="true"] > span');
                        out[it.dataset.mbUniqSynLabel] = g ? g.className : '';
                    });
                });
                return out;
            }, SECTION);
            expect(glyphs).toMatchObject({ Event: 'eventlink', 'Release group': 'rglink', Series: 'serieslink', '🔗 URL': '' });
        });
    }

    test('ticking a kind leaves exactly its rows', async ({ page }) => {
        await open(page, 'release-art');
        const { idx, counts } = await viaTable(page);
        await page.evaluate((i) => window.__saTest.getUniqDropSections('Target', i), idx);
        await waitForFilterSettled(page, () => page.evaluate(() => Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-col-uniq-item'))
            .find((el) => el.dataset.mbUniqSynLabel === 'Event').click()));
        const types = await page.evaluate((i) => {
            const t = document.querySelectorAll('table.tbl')[i];
            const k = Array.from(t.querySelectorAll('thead tr:first-child th')).findIndex((th) => th.dataset.colName === 'Type');
            return Array.from(t.querySelectorAll('tbody tr')).map((tr) => tr.cells[k].textContent.trim());
        }, idx);
        expect(types.length).toBe(counts.Event);
        expect(new Set(types)).toEqual(new Set(['Event']));
    });
});
