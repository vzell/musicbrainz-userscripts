'use strict';

// The `// @include` header lines decide where Tampermonkey injects the script
// at all, and the fixture harness never evaluates them — loadPage.js injects
// the script unconditionally — so nothing else in the suite would notice a
// broken pattern. This reads the header the way Tampermonkey does (a value
// wrapped in slashes is a regular expression) and checks the
// springsteenlyrics.com lines admit exactly the list pages, while every
// MusicBrainz sample still matches.

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
    test('springsteenlyrics.com: every list page, and only list pages', () => {
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
            // The collection entry page ("Latest additions") and its own
            // pagination, which uses cmd=intro and pg= (its "»" link puts pg
            // first).
            'https://springsteenlyrics.com/collection.php',
            'https://www.springsteenlyrics.com/collection.php#top',
            'https://springsteenlyrics.com/collection.php?cmd=intro',
            'https://springsteenlyrics.com/collection.php?cmd=intro&category=all&pg=2',
            'https://springsteenlyrics.com/collection.php?pg=54&cmd=intro',
            'https://springsteenlyrics.com/collection.php?pg=2',
        ];
        const others = [
            'https://springsteenlyrics.com/collection.php?item=9266&category=album&f_format=12i',
            'https://springsteenlyrics.com/bootlegs.php?item=4554&category=aud_live1967',
            // The bootleg entry page has no item cards.
            'https://springsteenlyrics.com/bootlegs.php',
            'https://springsteenlyrics.com/bootlegs.php?cmd=intro',
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
