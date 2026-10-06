'use strict';

// The `// @include` header lines decide where Tampermonkey injects the script
// at all, and the fixture harness never evaluates them — loadPage.js injects
// the script unconditionally — so nothing else in the suite would notice a
// broken pattern. This reads the header the way Tampermonkey does (a value
// wrapped in slashes is a regular expression) and checks the
// springsteenlyrics.com lines admit exactly the list pages, the jungleland.it
// line exactly its list.htm, the brucespringsteen.it line exactly its
// DB/records.aspx, while every MusicBrainz sample still matches.

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
            'https://springsteenlyrics.com/lyrics.php?cmd=list&letter=a',
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

    test('MusicBrainz pages are still covered', () => {
        const mb = [
            'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f/releases',
            'https://musicbrainz.org/release/1d404e1d-fcb6-3a52-b478-e706e893c897',
            'https://beta.musicbrainz.org/search?query=springsteen&type=artist',
            'https://musicbrainz.org/user/vzell/ratings',
            'https://musicbrainz.org/cdstub/browse',
        ];
        expect(mb.filter((u) => !injected(u))).toEqual([]);
    });
});
