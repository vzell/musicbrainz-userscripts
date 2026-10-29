'use strict';

// The `// @include` header lines decide where Tampermonkey injects the script
// at all, and the fixture harness never evaluates them — loadPage.js injects
// the script unconditionally — so nothing else in the suite would notice a
// broken pattern. This reads the header the way Tampermonkey does (a value
// wrapped in slashes is a regular expression) and checks the
// springsteenlyrics.com lines admit exactly the list pages, the jungleland.it
// line exactly its list.htm, the brucespringsteen.it line exactly its
// DB/records.aspx, the Brucebase lines exactly its stats:songs and its year
// pages, the discogs.com line exactly its master, release, artist and label
// pages, while every MusicBrainz sample still matches.

const fs = require('fs');
const { test, expect } = require('../support/test');
const { USERSCRIPT_PATH } = require('../support/loadPage');

/**
 * Returns the header's `@include` patterns as RegExp objects.
 * @returns {RegExp[]}
 */
function includePatterns() {
    const header = fs.readFileSync(USERSCRIPT_PATH, 'utf8').split('// ==/UserScript==')[0];
    return header.split('\n')
        .map((line) => line.match(/^\/\/ @include\s+\/(.*)\/\s*$/))
        .filter(Boolean)
        .map((m) => new RegExp(m[1]));
}

/**
 * True when any `@include` pattern admits the URL.
 * @param {string} url
 * @returns {boolean}
 */
const injected = (url) => includePatterns().some((re) => re.test(url));

test.describe('@include coverage', () => {
    test('springsteenlyrics.com: every list page and both entry pages, and nothing else', () => {
        const lists = [
            'https://springsteenlyrics.com/collection.php?cmd=list&category=album&f_format=12i',
            'https://springsteenlyrics.com/collection.php?cmd=list&category=album&f_format=12i&page=4',
            'https://www.springsteenlyrics.com/collection.php?cmd=list&category=single',
            'http://springsteenlyrics.com/collection.php?cmd=list&category=album&f_format=12i&f_country=Japan',
            'https://springsteenlyrics.com/bootlegs.php?cmd=list&category=aud_live1967',
            'https://springsteenlyrics.com/bootlegs.php?cmd=list&category=aud_comp&page=2',
            // The site's own filter forms put cmd=list after another parameter.
            'https://springsteenlyrics.com/bootlegs.php?f_date=1975-08-15&cmd=list&category=f_date',
            'https://springsteenlyrics.com/bootlegs.php?f_title=Born&cmd=list&category=f_title#top',
            // The CD and vinyl bootlegs, with each of its filters.
            'https://www.springsteenlyrics.com/brucelegs.php?cmd=list',
            'https://springsteenlyrics.com/brucelegs.php?cmd=list&page=3',
            'https://springsteenlyrics.com/brucelegs.php?cmd=list&f_letter=a',
            'https://springsteenlyrics.com/brucelegs.php?cmd=list&f_format=vinyl',
            'https://springsteenlyrics.com/brucelegs.php?cmd=list&f_label=Good Ship Funke',
            // The lyrics index: every letter page, and its landing page.
            'https://springsteenlyrics.com/lyrics.php?cmd=list&letter=a',
            'https://www.springsteenlyrics.com/lyrics.php?cmd=list&letter=(',
            'https://springsteenlyrics.com/lyrics.php?letter=b&cmd=list',
            'https://springsteenlyrics.com/lyrics.php',
            'https://springsteenlyrics.com/lyrics.php?cmd=intro',
            'https://springsteenlyrics.com/lyrics.php#top',
            // The collection entry page ("Latest additions") and its own
            // pagination, which uses cmd=intro and pg= (its "»" link puts pg
            // first).
            'https://springsteenlyrics.com/collection.php',
            'https://www.springsteenlyrics.com/collection.php#top',
            'https://springsteenlyrics.com/collection.php?cmd=intro',
            'https://springsteenlyrics.com/collection.php?cmd=intro&category=all&pg=2',
            'https://springsteenlyrics.com/collection.php?pg=54&cmd=intro',
            'https://springsteenlyrics.com/collection.php?pg=2',
            // The bootleg landing page: no item cards, but the compact bar
            // (sa_sl_compact_nav) folds its category buttons and search forms.
            'https://springsteenlyrics.com/bootlegs.php',
            'https://www.springsteenlyrics.com/bootlegs.php#top',
            'https://springsteenlyrics.com/bootlegs.php?cmd=intro',
        ];
        const others = [
            'https://springsteenlyrics.com/collection.php?item=9266&category=album&f_format=12i',
            'https://springsteenlyrics.com/bootlegs.php?item=4554&category=aud_live1967',
            'https://springsteenlyrics.com/brucelegs.php?item=281&f_format=vinyl',
            'https://springsteenlyrics.com/brucelegs.php',
            'https://springsteenlyrics.com/bootlegs.php?cmd=introx',
            'https://springsteenlyrics.com/bootlegs.php?pg=2',
            'https://springsteenlyrics.com/collection.php?cmd=introx',
            'https://springsteenlyrics.com/collection.php?xcmd=intro',
            'https://springsteenlyrics.com/collection.php?item=10265&category=all',
            'https://springsteenlyrics.com/collection.php?cmd=listing',
            'https://springsteenlyrics.com/collection.php?xcmd=list',
            // A song page, and the by-release listing, are not the index.
            'https://springsteenlyrics.com/lyrics.php?song=babycomeback',
            'https://springsteenlyrics.com/lyrics.php?cmd=songslistedbyrelease',
            'https://springsteenlyrics.com/lyrics.php?cmd=listing',
            'https://springsteenlyrics.com/index.php',
            'https://springsteenlyrics.com.example.org/collection.php?cmd=list',
            'https://example.org/springsteenlyrics.com/collection.php?cmd=list',
        ];
        expect(lists.filter((u) => !injected(u))).toEqual([]);
        expect(others.filter((u) => injected(u))).toEqual([]);
    });

    test('jungleland.it: list.htm, and nothing else', () => {
        const lists = [
            'https://www.jungleland.it/html/list.htm',
            'http://www.jungleland.it/html/list.htm',
            'https://jungleland.it/html/list.htm',
            'https://www.jungleland.it/html/list.htm#1975',
            'https://www.jungleland.it/html/list.htm?x=1',
        ];
        const others = [
            // The frameset that holds list.htm, its default right frame, an
            // item page, the site's splash page.
            'https://www.jungleland.it/html/artwork.htm',
            'https://www.jungleland.it/html/images.htm',
            'https://www.jungleland.it/html/19750815.htm',
            'https://www.jungleland.it/',
            'https://www.jungleland.it/html/list.html',
            'https://www.jungleland.it/html/list.htm.bak',
            'https://www.jungleland.it/list.htm',
            'https://www.jungleland.it.example.org/html/list.htm',
            'https://example.org/www.jungleland.it/html/list.htm',
            'https://notjungleland.it/html/list.htm',
        ];
        expect(lists.filter((u) => !injected(u))).toEqual([]);
        expect(others.filter((u) => injected(u))).toEqual([]);
    });

    test('brucespringsteen.it: DB/records.aspx, and nothing else', () => {
        const lists = [
            'https://www.brucespringsteen.it/DB/records.aspx?tipe=-1,0,1,2,3,4,5,6,7,8,9,10,11&sort=0&addon=0',
            'https://www.brucespringsteen.it/DB/records.aspx?tipe=-2,0,1,2,3,4,5,6,7,8,9,10,11&sort=0&addon=0',
            'https://www.brucespringsteen.it/DB/records.aspx?tipe=-1,4&sort=0',
            'https://www.brucespringsteen.it/DB/records.aspx',
            'http://www.brucespringsteen.it/db/records.aspx?tipe=-1,9&sort=0',
            'https://brucespringsteen.it/DB/records.aspx?tipe=-1,4&sort=0',
        ];
        const others = [
            // The frameset that holds records.aspx, a record's detail page,
            // the database's other frameset, the home page.
            'https://www.brucespringsteen.it/Blegsdx.htm',
            'https://www.brucespringsteen.it/DB/detrec.aspx?code=CR1AD1',
            'https://www.brucespringsteen.it/DB/Databasex.htm',
            'https://www.brucespringsteen.it/',
            'https://www.brucespringsteen.it/records.aspx',
            'https://www.brucespringsteen.it/DB/records.aspx.bak',
            'https://www.brucespringsteen.it.example.org/DB/records.aspx',
            'https://example.org/www.brucespringsteen.it/DB/records.aspx',
            'https://notbrucespringsteen.it/DB/records.aspx',
        ];
        expect(lists.filter((u) => !injected(u))).toEqual([]);
        expect(others.filter((u) => injected(u))).toEqual([]);
    });

    test('brucebase.wikidot.com: stats:songs, and nothing else', () => {
        const lists = [
            'https://brucebase.wikidot.com/stats:songs',
            'http://brucebase.wikidot.com/stats:songs',
            'https://brucebase.wikidot.com/stats:songs/',
            'https://brucebase.wikidot.com/stats:songs#toc0',
            'https://brucebase.wikidot.com/stats:songs?x=1',
        ];
        const others = [
            // The html-block iframe ON the songs page, under the same path:
            // the reason the gate needs no frame check.
            'https://brucebase.wikidot.com/stats:songs/html/01298c01639d867f841df8043cedc891cf11d8f0-13394405391053582404',
            // The page's sibling lists, a song page, the stats index.
            'https://brucebase.wikidot.com/stats:songs-by-album',
            'https://brucebase.wikidot.com/stats:songs-list',
            'https://brucebase.wikidot.com/stats:songs-count',
            'https://brucebase.wikidot.com/song:1945',
            'https://brucebase.wikidot.com/stats:statistics',
            // (Not the start page: bb-home covers it by its own @include,
            // asserted in "the start page, and nothing else" below.)
            // Another wiki on the same farm, and look-alike hosts.
            'https://otherwiki.wikidot.com/stats:songs',
            'https://www.brucebase.wikidot.com/stats:songs',
            'https://brucebase.wikidot.com.example.org/stats:songs',
            'https://example.org/brucebase.wikidot.com/stats:songs',
        ];
        expect(lists.filter((u) => !injected(u))).toEqual([]);
        expect(others.filter((u) => injected(u))).toEqual([]);
    });

    test('brucebase.wikidot.com: Relations and Recent changes, and nothing else', () => {
        const pages = [
            'https://brucebase.wikidot.com/stats:relations',
            'http://brucebase.wikidot.com/stats:relations/',
            'https://brucebase.wikidot.com/stats:relations#toc0',
            'https://brucebase.wikidot.com/system:recent-changes',
            'https://brucebase.wikidot.com/system:recent-changes/',
            'https://brucebase.wikidot.com/system:recent-changes?x=1',
        ];
        const others = [
            // The Relations page's siblings (its own links), a relation page.
            'https://brucebase.wikidot.com/stats:relations-list',
            'https://brucebase.wikidot.com/stats:relations-persons',
            'https://brucebase.wikidot.com/stats:relations-bands',
            'https://brucebase.wikidot.com/relation:bryan-adams',
            // The AJAX endpoint the Recent changes buttons POST to, and the
            // site's other management lists.
            'https://brucebase.wikidot.com/ajax-module-connector.php',
            'https://brucebase.wikidot.com/system:recent-changes/html/0123abcd',
            'https://brucebase.wikidot.com/manage:page-history-list',
            'https://brucebase.wikidot.com/system:page-tags',
            // Another wiki on the same farm, and look-alike hosts.
            'https://otherwiki.wikidot.com/system:recent-changes',
            'https://www.brucebase.wikidot.com/stats:relations',
            'https://brucebase.wikidot.com.example.org/stats:relations',
        ];
        expect(pages.filter((u) => !injected(u))).toEqual([]);
        expect(others.filter((u) => injected(u))).toEqual([]);
    });

    test('brucebase.wikidot.com: the year pages, and nothing else', () => {
        const years = [
            'https://brucebase.wikidot.com/2026',
            'http://brucebase.wikidot.com/1975',
            'https://brucebase.wikidot.com/1975/',
            'https://brucebase.wikidot.com/2026#300126',
            'https://brucebase.wikidot.com/1965#000065a',
            'https://brucebase.wikidot.com/1985?x=1',
            // The one page that is not a single year.
            'https://brucebase.wikidot.com/1949-64',
        ];
        const others = [
            // The year's "Listing" page, the tour statistics, a show's own
            // page, and paths that only look like years.
            'https://brucebase.wikidot.com/2026-list',
            'https://brucebase.wikidot.com/stats:tour-statistics',
            'https://brucebase.wikidot.com/gig:2026-01-30-first-avenue-minneapolis-mn',
            'https://brucebase.wikidot.com/19750',
            'https://brucebase.wikidot.com/197',
            'https://brucebase.wikidot.com/1949-65',
            'https://brucebase.wikidot.com/2026/html/0123abcd',
            // Another wiki on the same farm, and look-alike hosts.
            'https://otherwiki.wikidot.com/2026',
            'https://www.brucebase.wikidot.com/2026',
            'https://brucebase.wikidot.com.example.org/2026',
        ];
        expect(years.filter((u) => !injected(u))).toEqual([]);
        expect(others.filter((u) => injected(u))).toEqual([]);
    });

    test('brucebase.wikidot.com: the start page, and nothing else', () => {
        const home = [
            // (A bare `https://brucebase.wikidot.com` never reaches a
            // pattern: the browser's location.href always has the slash.)
            'https://brucebase.wikidot.com/',
            'http://brucebase.wikidot.com/',
            'https://brucebase.wikidot.com/#toc0',
            'https://brucebase.wikidot.com/?x=1',
            // Its wiki name.
            'https://brucebase.wikidot.com/home',
            'https://brucebase.wikidot.com/home/',
        ];
        const others = [
            'https://brucebase.wikidot.com/homepage',
            'https://brucebase.wikidot.com/home-x',
            'https://brucebase.wikidot.com/home:x',
            'https://brucebase.wikidot.com/news:news',
            'https://otherwiki.wikidot.com/',
            'https://www.brucebase.wikidot.com/',
            'https://brucebase.wikidot.com.example.org/',
        ];
        expect(home.filter((u) => !injected(u))).toEqual([]);
        expect(others.filter((u) => injected(u))).toEqual([]);
    });

    test('discogs.com: a master, release, artist or label page, and nothing else', () => {
        const pages = [
            'https://www.discogs.com/master/26725-Bruce-Springsteen-Born-To-Run',
            'https://www.discogs.com/release/1874253-Bruce-Springsteen-Born-To-Run',
            'https://www.discogs.com/release/1874253',
            'https://www.discogs.com/artist/219986-Bruce-Springsteen',
            'https://www.discogs.com/artist/219986-Bruce-Springsteen?type=Credits',
            'https://www.discogs.com/label/1866-Columbia',
            'https://www.discogs.com/label/1866-Columbia?page=2#releases',
            'https://discogs.com/release/1874253-Bruce-Springsteen-Born-To-Run',
            'http://www.discogs.com/master/26725',
            // A language prefix, as the site's own language links write it.
            'https://www.discogs.com/de/release/1874253-Bruce-Springsteen-Born-To-Run',
            'https://www.discogs.com/pt-BR/artist/219986'.toLowerCase(),
        ];
        const others = [
            'https://www.discogs.com/',
            'https://www.discogs.com/search/?q=Springsteen&type=all',
            'https://www.discogs.com/sell/list?master_id=26725',
            'https://www.discogs.com/release/1874253-Bruce-Springsteen-Born-To-Run/image/SW1hZ2U6NDYwODA1ODY=',
            'https://www.discogs.com/artist/Bruce-Springsteen',
            'https://api.discogs.com/releases/1874253',
            'https://www.discogs.com.example.org/release/1874253',
            'https://example.org/www.discogs.com/release/1874253',
        ];
        expect(pages.filter((u) => !injected(u))).toEqual([]);
        expect(others.filter((u) => injected(u))).toEqual([]);
    });

    test('discogs.com: a user\'s collection or wantlist page (dg-user-list, 2026-10-29); no near miss', () => {
        const pages = [
            'https://www.discogs.com/user/vzell/collection',
            'https://www.discogs.com/user/vzell/collection?folder_id=0',
            'https://www.discogs.com/user/disc-kid/wantlist',
            'https://www.discogs.com/wantlist?user=disc-kid',
            'https://www.discogs.com/wantlist?user=disc-kid&page=2&limit=250',
            'https://www.discogs.com/mywantlist',
            'https://www.discogs.com/de/mywantlist',
        ];
        const others = [
            'https://www.discogs.com/user/vzell/collectionx',
            'https://www.discogs.com/user/vzell/collection/stats',
            'https://www.discogs.com/wantlistx',
            'https://www.discogs.com/mywantlist/export',
            'https://www.discogs.com/user/vzell/lists',
        ];
        expect(pages.filter((u) => !injected(u))).toEqual([]);
        expect(others.filter((u) => injected(u))).toEqual([]);
    });

    test('discogs.com: a submissions list, either view, a language prefix; no other /submissions… path', () => {
        const pages = [
            'https://www.discogs.com/submissions?mode=list&id=599283&page=1&view=flat',
            'https://www.discogs.com/submissions?mode=list&id=599283&page=1',
            'https://www.discogs.com/submissions',
            'https://discogs.com/submissions?mode=saved',
            'https://www.discogs.com/de/submissions?mode=list&id=599283&page=1&view=flat',
            'https://www.discogs.com/pt_BR/submissions?mode=list&id=599283&page=1&view=flat',
        ];
        const others = [
            'https://www.discogs.com/submissions/599283',
            'https://www.discogs.com/submissionsx?mode=list',
            'https://www.discogs.com.example.org/submissions?mode=list',
        ];
        expect(pages.filter((u) => !injected(u))).toEqual([]);
        expect(others.filter((u) => injected(u))).toEqual([]);
    });

    test('discogs.com: a release\'s, master\'s, artist\'s or label\'s history page (dg-history), with or without ?diff=', () => {
        const pages = [
            'https://www.discogs.com/release/8164856-Human-Touch/history?diff=10&page=1',
            'https://www.discogs.com/release/8164856-Human-Touch/history',
            'https://www.discogs.com/release/8164856/history',
            'https://www.discogs.com/de/release/8164856-Human-Touch/history?rev=4',
            // Since 2026-10-29 (vzell: the master's history had no button).
            'https://www.discogs.com/master/27146/history',
            'https://www.discogs.com/master/26725-Born-To-Run/history',
            'https://www.discogs.com/artist/219986-Bruce-Springsteen/history?page=2',
            'https://www.discogs.com/label/264352-DADC/history',
        ];
        const others = [
            'https://www.discogs.com/release/8164856-Human-Touch/images/history?rev=7',
            'https://www.discogs.com/release/8164856-Human-Touch/historyx',
            'https://www.discogs.com/user/vzell/history',
            'https://www.discogs.com/master/26725-Born-To-Run/history/more',
        ];
        expect(pages.filter((u) => !injected(u))).toEqual([]);
        expect(others.filter((u) => injected(u))).toEqual([]);
    });

    test('discogs.com: a release\'s Images page and image editor (dg-images, dg-image-history; Phase 4)', () => {
        const pages = [
            'https://www.discogs.com/release/1313481-Born-To-Run/images',
            'https://www.discogs.com/release/1313481-Born-To-Run/images/update',
            'https://www.discogs.com/release/1313481/images/',
            'https://www.discogs.com/de/release/1313481-Born-To-Run/images/update?x=1',
            'https://www.discogs.com/pt_BR/release/1313481/images',
        ];
        const others = [
            'https://www.discogs.com/release/1313481-Born-To-Run/imagesx',
            'https://www.discogs.com/release/1313481-Born-To-Run/images/update/more',
            'https://www.discogs.com/master/26725/images',
            'https://www.discogs.com/release/1874253-Bruce-Springsteen-Born-To-Run/image/SW1hZ2U6NDYwODA1ODY=',
        ];
        expect(pages.filter((u) => !injected(u))).toEqual([]);
        expect(others.filter((u) => injected(u))).toEqual([]);
    });

    test('discogs.com: a user\'s page (dg-user), a language prefix; not its sub-pages (but collection and wantlist: dg-user-list)', () => {
        const pages = [
            'https://www.discogs.com/user/vzell',
            'https://www.discogs.com/user/vzell/',
            'https://discogs.com/user/GuiBeal?tab=1',
            'https://www.discogs.com/de/user/vzell',
            'https://www.discogs.com/pt_BR/user/vzell',
        ];
        const others = [
            'https://www.discogs.com/user/vzell/submissions',
            'https://www.discogs.com/user/',
        ];
        expect(pages.filter((u) => !injected(u))).toEqual([]);
        expect(others.filter((u) => injected(u))).toEqual([]);
    });

    test('discogs.com: a user\'s ratings (dg-ratings, 2026-10-19), a language prefix and the page\'s own query', () => {
        const pages = [
            'https://www.discogs.com/users/ratings/vzell',
            'https://www.discogs.com/users/ratings/vzell?limit=250&page=1',
            'https://discogs.com/users/ratings/vzell/?sort=rating&sort_order=desc',
            'https://www.discogs.com/de/users/ratings/vzell?limit=250&page=1',
        ];
        const others = [
            'https://www.discogs.com/users/ratings/',
            'https://www.discogs.com/users/ratings/vzell/more',
            'https://www.discogs.com/users/vzell',
            'https://www.discogs.com.example.org/users/ratings/vzell',
        ];
        expect(pages.filter((u) => !injected(u))).toEqual([]);
        expect(others.filter((u) => injected(u))).toEqual([]);
    });

    test('MusicBrainz pages are still covered', () => {
        const mb = [
            'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f/releases',
            'https://musicbrainz.org/release/1d404e1d-fcb6-3a52-b478-e706e893c897',
            'https://beta.musicbrainz.org/search?query=springsteen&type=artist',
            'https://musicbrainz.org/user/vzell/ratings',
            'https://musicbrainz.org/cdstub/browse',
            // The overview pages of the relationship-tables pageTypes (WIP.6/WIP.8).
            'https://musicbrainz.org/place/6a59a67c-fcc5-491f-949c-bfc45bc97463',
            'https://musicbrainz.org/area/489ce91b-6658-3307-9877-795b68554c98',
            'https://musicbrainz.org/instrument/a1baa57d-6ab4-461e-89df-448d6fd2c597',
            'https://musicbrainz.org/url/a333fbe2-2707-4799-aa2e-50d21be8081c',
        ];
        expect(mb.filter((u) => !injected(u))).toEqual([]);
        // A URL's other tabs have no pageType: the line admits the overview only.
        expect(injected('https://musicbrainz.org/url/a333fbe2-2707-4799-aa2e-50d21be8081c/edit')).toBe(false);
    });
});
