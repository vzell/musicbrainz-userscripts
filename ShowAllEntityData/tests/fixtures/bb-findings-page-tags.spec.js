'use strict';

// The tag checks of a Brucebase venue, song, relation and release page
// (org/bbp-parity.org, parity batch 4: BruceBaseParser's annotate*PageTags();
// vzell's decisions of 2026-11-18). The same two findings as a show's
// (bb-tag-missing ❌, bb-tag-spurious ⚠️), drawn on the page head's Tags card
// and in the preview window; no request but a full page's "-2". Families:
//   type          venue / song / retail; a relation's person (Bands tab) or
//                 band (Members tab), "not expected" only against the other tab
//   letter        the first letter by BruceParser's rule (0-9, "&", a
//                 relation's leading "The" dropped), missing only, not a release
//   construction  "underconstruction" against the banner (sup > em or p > em)
//   lyricsheet    a song: against a lyric sheet in its Gallery tab
//   title         a song's own title as a tag, with the wiki's variants
// With missing tags looked for, the head and the window leave out the
// BruceParser feed's first-letter mark: the check reads the page as it is.
//
// The fixtures are real mirror pages (2026-11-15,
// scripts/build-bb-findings-page-tags-fixtures.py); what each shows is what
// scripts/probe-bb-page-tags.py found, and scripts/check-bb-page-tag-findings.js
// runs the shipped check over all 6,990 pages of the four kinds.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const BB = 'https://brucebase.wikidot.com/';
const DIR = path.join(__dirname, 'bb-findings');
const PAGE_RE = /^https:\/\/brucebase\.wikidot\.com\/((?:venue|song|relation|retail):[^/?#]+)(\/noredirect\/true)?$/;
const BAYONNE = 'venue:unknown-location-bayonne-nj';
const PONY = 'venue:stone-pony-asbury-park-nj';
const USA = 'relation:usa-for-africa';
/** Every fixture's findings with every page read: [missing tag/family], [not-expected tag/family]. */
const WANT = {
    [BAYONNE]: [['u/letter'], []],
    'venue:ball-arena-denver-co': [['venue/type'], []],
    [PONY]: [[], []],
    'venue:107-1-the-boss-studio-neptune-nj': [['0-9/letter'], []],
    'song:down-in-the-hole': [['downinthehole/title'], []],
    'song:we-are-the-world': [[], ['lyricsheet/lyricsheet']],
    'song:dinner-at-eight': [['d/letter'], []],
    'song:angel-eyes-2': [[], []],
    'relation:rob-demartin': [['d/letter'], []],
    'relation:bob-seger-the-silver-bullet-band': [[], []],
    'relation:steven-van-zandt': [[], []],
    [USA]: [[], []],
    'retail:tracks-ii': [[], ['underconstruction/construction']],
    'retail:rescue': [['retail/type'], []],
    'retail:j-a-m-86': [[], []],
};
/** Pages that get no check: a redirect, a "-N" page without tabs, a release's tab page. */
const NO_CHECK = ['song:born-in-the-usa', 'relation:usa-for-africa-2', 'retail:born-to-run-credits'];
/** The "-N" pages are read: the setting FIXTURE_SETTINGS_OVERRIDE switches off. */
const ON = { sa_bb_onstage_tags: true };
const FEED_URL = 'https://raw.githubusercontent.com/vzell/brucebase-feed/main/bb-feed.json';

const fileOf = name => path.join(DIR, `${name.replace(':', '_')}.html`);

/**
 * A kept BruceParser feed naming `pages` (the shape tests/fixtures/bb-feed.spec.js keeps).
 *
 * @param {Object} pages - { "venue:…": { "first-letter": "u" } }.
 * @returns {Object<string, *>} Settings: the feed on, this copy kept a second ago.
 */
function feedKept(pages) {
    const date = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const data = { format: 1, run: { date, bruceparser: '0.18.0', commit: 'test', feed: '1.0' }, site: BB, credit: 'test', reports: {}, pages };
    return { sa_bb_feed: true, mb_sa_bb_feed: { at: Date.now() - 1000, data, err: '', errAt: 0 } };
}

/**
 * Serves the four kinds' pages and their tag pages (`…/noredirect/true`)
 * from the fixtures, a 404 for one the fixtures lack; logs each request.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string[]>} The pages asked, in order.
 */
async function servePages(page) {
    const asked = [];
    await page.route(PAGE_RE, (route) => {
        const name = decodeURIComponent(route.request().url().match(PAGE_RE)[1]);
        asked.push(name);
        return fs.existsSync(fileOf(name))
            ? route.fulfill({ path: fileOf(name), contentType: 'text/html; charset=utf-8' })
            : route.fulfill({ status: 404, contentType: 'text/html', body: '<html><body>The page does not exist.</body></html>' });
    });
    return asked;
}

/**
 * Loads a fixture page at its address, every other request refused, the
 * feed's address answered with nothing (a kept copy is read from settings).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} name - "venue:…".
 * @param {Object<string, *>} [settings]
 * @returns {Promise<string[]>} The tag pages asked (`servePages()`).
 */
async function loadFixture(page, name, settings = {}) {
    await page.setViewportSize({ width: 1500, height: 1200 });
    await page.route(/^https?:\/\//, route => route.abort('blockedbyclient'));
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
    await page.route(/brucebase\.wdfiles\.com\//, route => route.fulfill({ status: 200, contentType: 'image/png', body: png }));
    await page.addInitScript((url) => {
        window.__gmXhrResponses = Object.assign(window.__gmXhrResponses || {}, {
            [url]: { status: 404, responseHeaders: '', responseText: '', finalUrl: url },
        });
    }, FEED_URL);
    await loadUserscriptPage(page, {
        url: BB + name, fixtureFile: fileOf(name), testMode: true,
        settingsOverride: { sa_enable_brucebase: true, sa_bb_detail_pages: true, sa_foreign_mb_titles: false, sa_foreign_typography: false, ...settings },
    });
    return servePages(page);
}

/**
 * Loads a fixture page and presses its button ("Show the venue", …).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 * @param {Object<string, *>} [settings]
 * @returns {Promise<string[]>} The tag pages asked.
 */
async function showPage(page, name, settings = {}) {
    const asked = await loadFixture(page, name, settings);
    const label = { venue: 'Show the venue', song: 'Show the song', relation: 'Show the person', retail: 'Show the release' }[name.split(':')[0]];
    await page.click(`button[data-label="${label}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
    return asked;
}

const card = page => page.locator('section.mb-sb-card').filter({ has: page.locator(':scope > .mb-sb-card-head', { hasText: /^Tags/ }) });

/**
 * A page's preview window content, as the window draws it, in a detached box.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 * @returns {Promise<{miss: string[], spur: string[], ok: string[], wait: number, finds: string, feed: string[]}>}
 */
const windowOf = (page, name) => page.evaluate(([html, url]) => {
    const box = document.createElement('div');
    box.innerHTML = window.__saTest.dpWindowHtml('brucebase.wikidot.com', html, url);
    const sec = Array.from(box.querySelectorAll('details.mb-dp-sec')).find(d => /^Tags \(/.test((d.querySelector('summary h4') || {}).textContent || ''));
    const q = sel => (sec ? Array.from(sec.querySelectorAll(sel), n => n.textContent.trim()) : []);
    return {
        miss: q('a.mb-dp-tag.mb-cbx-miss'), spur: q('a.mb-dp-tag.mb-cbx-spur'), ok: q('.mb-cbx-pill-ok'),
        wait: q('.mb-cbx-wait').length, finds: q('.mb-cbx-finds').join(' '),
        feed: Array.from(box.querySelectorAll('.mb-dp-xtitle .mb-bb-feed-mark'), m => m.getAttribute('data-mb-feed-kind')),
    };
}, [fs.readFileSync(fileOf(name), 'utf8'), BB + name]);

let pageErrors;
test.beforeEach(({ page }) => {
    pageErrors = [];
    page.on('pageerror', e => pageErrors.push(String(e)));
});
test.afterEach(() => {
    expect(pageErrors, 'no script error').toEqual([]);
});

test.describe('Brucebase page tag checks: the rule (bbp-parity batch 4)', () => {
    test('every fixture page: what it says, and its missing and not-expected tags (the probe\'s results)', async ({ page }) => {
        await loadFixture(page, PONY);
        const names = Object.keys(WANT).concat(NO_CHECK);
        const got = await page.evaluate(list => list.map(([name, html, more]) => {
            const url = 'https://brucebase.wikidot.com/' + name;
            const facts = window.__saTest.bbTagFacts(html, url);
            const rec = window.__saTest.dpParse('brucebase.wikidot.com', html, url);
            const own = rec.tags.map(t => t.text.toLowerCase());
            const r = window.__saTest.bbTagCheck(facts, own, more);
            return [name, facts ? facts.kind : null, r.missing.map(x => `${x.tag}/${x.family}`), r.spurious.map(x => `${x.tag}/${x.family}`),
                r.missing.concat(r.spurious).every(x => !!x.why)];
        }), names.map((n) => {
            // A full page's "-2" keeps more of its tags.
            const more = n === USA ? fs.readFileSync(fileOf(`${USA}-2`), 'utf8').match(/<div class="page-tags">([\s\S]*?)<\/div>/)[1]
                .match(/>([^<]+)<\/a>/g).map(s => s.slice(1, -4).trim().toLowerCase()) : [];
            return [n, fs.readFileSync(fileOf(n), 'utf8'), more];
        }));
        // [kind of the facts (null: no check), missing, not expected, every finding says why]
        const want = Object.fromEntries(names.map(n => [n, NO_CHECK.includes(n) ? [null, [], [], true] : [n.split(':')[0], ...WANT[n], true]]));
        expect(Object.fromEntries(got.map(g => [g[0], g.slice(1)]))).toEqual(want);
    });

    test('the families\' edges: a banner without the tag, person/band by the tabs, a second letter never, a number padded or not', async ({ page }) => {
        await loadFixture(page, PONY);
        const run = (facts, own, more) => page.evaluate(([f, o, m]) => {
            const r = window.__saTest.bbTagCheck(f, o, m || []);
            return { missing: r.missing.map(x => `${x.tag}/${x.family}`), spurious: r.spurious.map(x => `${x.tag}/${x.family}`) };
        }, [facts, own, more]);
        const venue = { page: true, kind: 'venue', title: 'Stone Pony (The), Asbury Park, NJ', letter: 's', construction: false, lyricsheet: false, bands: false, members: false, titleTags: [] };
        expect(await run(venue, ['venue', 's'])).toEqual({ missing: [], spurious: [] });
        // A second letter tag is the wiki's own (an alternative title): never flagged.
        expect(await run(venue, ['venue', 's', 't'])).toEqual({ missing: [], spurious: [] });
        // The banner calls for the tag; the tag without the banner is not expected.
        expect(await run({ ...venue, construction: true }, ['venue', 's'])).toEqual({ missing: ['underconstruction/construction'], spurious: [] });
        expect(await run(venue, ['venue', 's', 'underconstruction'])).toEqual({ missing: [], spurious: ['underconstruction/construction'] });
        // A tag kept on a "-2" page is present.
        expect(await run(venue, ['s'], ['venue'])).toEqual({ missing: [], spurious: [] });
        // A relation: a Bands tab calls for "person", a Members tab for "band"; the
        // other is not expected only with the other tab; neither tab: nothing.
        const rel = { ...venue, kind: 'relation', title: 'Smith, Joe', letter: 's' };
        expect(await run({ ...rel, bands: true }, ['s'])).toEqual({ missing: ['person/type'], spurious: [] });
        expect(await run({ ...rel, members: true }, ['s', 'person'])).toEqual({ missing: ['band/type'], spurious: ['person/type'] });
        expect(await run({ ...rel, bands: true }, ['s', 'person', 'band'])).toEqual({ missing: [], spurious: ['band/type'] });
        expect(await run({ ...rel, bands: true, members: true }, ['s', 'person', 'band'])).toEqual({ missing: [], spurious: [] });
        expect(await run(rel, ['s', 'person'])).toEqual({ missing: [], spurious: [] });
        // A song's title: any of its spellings counts; the first is the one named.
        const song = { ...venue, kind: 'song', title: 'Omaha', letter: 'o', titleTags: ['omaha', 'omahasong'] };
        expect(await run(song, ['song', 'o', 'omahasong'])).toEqual({ missing: [], spurious: [] });
        expect(await run(song, ['song', 'o'])).toEqual({ missing: ['omaha/title'], spurious: [] });
        expect(await run(song, ['song', 'o', 'omaha', 'lyricsheet'])).toEqual({ missing: [], spurious: ['lyricsheet/lyricsheet'] });
        expect(await run({ ...song, lyricsheet: true }, ['song', 'o', 'omaha'])).toEqual({ missing: ['lyricsheet/lyricsheet'], spurious: [] });
        // A release: no letter.
        expect(await run({ ...venue, kind: 'retail', title: 'Rescue', letter: '' }, ['r'])).toEqual({ missing: ['retail/type'], spurious: [] });
    });

    test('the first letter: BruceParser\'s rule', async ({ page }) => {
        await loadFixture(page, PONY);
        const letter = (name, title) => page.evaluate(([n, t]) => {
            const html = `<html><body><div id="page-title">${t}</div><div id="page-content"><div class="yui-navset"></div></div>` +
                '<div class="page-tags"><span><a href="/system:page-tags/tag/x#pages">x</a></span></div></body></html>';
            const f = window.__saTest.bbTagFacts(html, 'https://brucebase.wikidot.com/' + n);
            return f ? f.letter : null;
        }, [name, title]);
        expect(await letter('venue:a', '107.1 The Boss Studio, Neptune, NJ')).toBe('0-9');
        expect(await letter('venue:a', 'Ōsaka-Jō Hōru, Osaka, Japan')).toBe('o');
        expect(await letter('venue:a', 'Stone Pony (The), Asbury Park, NJ')).toBe('s');
        expect(await letter('song:a', 'The Angel')).toBe('t');
        expect(await letter('song:a', '\'Til We Outnumber \'Em')).toBe('t');
        expect(await letter('song:a', '¡Hola!')).toBe('');
        expect(await letter('relation:a', 'The Sessions Band')).toBe('s');
        expect(await letter('relation:a', 'E Street Band, The')).toBe('e');
        expect(await letter('relation:a', 'Bob Seger &amp; The Silver Bullet Band')).toBe('&');
        expect(await letter('relation:a', 'DeMartin, Rob')).toBe('d');
        expect(await letter('retail:a', 'Rescue'), 'a release: no letter').toBe('');
        expect(await letter('gig:2016-05-21-a', 'x'), 'a show keeps its own facts').toBe('');
        expect(await letter('playlist:a', 'Songs Of Love'), 'a playlist: no check').toBeNull();
    });

    test('a song\'s title tags: a cover\'s artist left out, the page\'s number; "&" is a tag of the Letter row', async ({ page }) => {
        await loadFixture(page, PONY);
        const titleTags = (name, title) => page.evaluate(([n, t]) => {
            const html = `<html><body><div id="page-title">${t}</div><div id="page-content"><div class="yui-navset"></div></div>` +
                '<div class="page-tags"><span><a href="/system:page-tags/tag/x#pages">x</a></span></div></body></html>';
            return window.__saTest.bbTagFacts(html, 'https://brucebase.wikidot.com/' + n).titleTags;
        }, [name, title]);
        expect(await titleTags('song:cupid-2', 'Cupid ( - Sam Cooke - )')).toEqual(['cupid', 'cupidsong', 'cupid2']);
        expect(await titleTags('song:devils-dust', 'Devils &amp; Dust')).toEqual(['devilsdust', 'devilsdustsong', 'devilsanddust', 'devilsanddustsong']);
        expect(await titleTags('song:prove-it-all-night-78', 'Prove It All Night (\'78 Intro)'))
            .toEqual(['proveitallnight78intro', 'proveitallnight78introsong', 'proveitallnight', 'proveitallnightsong']);
        const bob = 'relation:bob-seger-the-silver-bullet-band';
        const fam = await page.evaluate(([html, url]) => window.__saTest.dpParse('brucebase.wikidot.com', html, url).tags
            .filter(t => t.text === '&').map(t => t.family), [fs.readFileSync(fileOf(bob), 'utf8'), BB + bob]);
        expect(fam).toEqual(['letter']);
    });
});

test.describe('Brucebase page tag checks: the head\'s Tags card (bbp-parity batch 4)', () => {
    test('a venue without its letter: "u" missing in the Letter row, not counted; the pills and the words; the feed\'s first-letter mark left out', async ({ page }) => {
        const asked = await showPage(page, BAYONNE, feedKept({ [BAYONNE]: { 'first-letter': 'u' } }));
        const c = card(page);
        await expect(c.locator('.mb-sb-chip.mb-cbx-miss')).toHaveText(['u missing']);
        await expect(c.locator('.mb-sb-chip-row', { hasText: 'Letter' }).locator('.mb-sb-chip.mb-cbx-miss')).toHaveCount(1);
        const own = (fs.readFileSync(fileOf(BAYONNE), 'utf8').match(/<div class="page-tags">([\s\S]*?)<\/div>/)[1].match(/<\/a>/g) || []).length;
        await expect(c.locator(':scope > .mb-sb-card-head .mb-sb-card-count')).toHaveText(String(own));
        await expect(c.locator('.mb-cbx-pill-e')).toHaveText('❌ 1 missing');
        await expect(c.locator('.mb-cbx-pill-w')).toHaveCount(0);
        await expect(c.locator('.mb-cbx-finds .mb-cbx-find-e')).toContainText('u is expected and missing. "Unknown Location, Bayonne, NJ" starts with "U"');
        expect(await c.locator('.mb-sb-chip.mb-cbx-miss').getAttribute('data-mbtt')).toMatch(/Missing: u/);
        await expect(page.locator('p.mb-fd-sub .mb-bb-feed-marks')).toHaveCount(1);
        await expect(page.locator('p.mb-fd-sub .mb-bb-feed-mark')).toHaveCount(0);
        await page.evaluate(() => new Promise(r => setTimeout(r, 800)));
        expect(asked, 'no page asked').toEqual([]);
    });

    test('missing tags not looked for: no mark, no note, and the feed\'s first-letter mark is back', async ({ page }) => {
        await showPage(page, BAYONNE, { ...feedKept({ [BAYONNE]: { 'first-letter': 'u' } }), sa_findings_bb_tag_missing: false });
        const c = card(page);
        await expect(c.locator('.mb-sb-chip').first()).toBeVisible();
        await expect(c.locator('.mb-cbx-miss, .mb-cbx-spur, .mb-cbx-pills, .mb-cbx-finds, .mb-cbx-wait')).toHaveCount(0);
        await expect(c.locator('.mb-cbx-pill-ok'), 'the not-expected half still checks, and finds nothing').toHaveText(/as expected/);
        await expect(page.locator('p.mb-fd-sub .mb-bb-feed-mark[data-mb-feed-kind="first-letter"]')).toHaveCount(1);
    });

    test('both switched off: the card as before', async ({ page }) => {
        await showPage(page, 'song:we-are-the-world', { sa_findings_bb_tag_missing: false, sa_findings_bb_tag_spurious: false });
        const c = card(page);
        await expect(c.locator('.mb-sb-chip').first()).toBeVisible();
        await expect(c.locator('.mb-cbx-miss, .mb-cbx-spur, .mb-cbx-pills, .mb-cbx-finds, .mb-cbx-wait, .mb-cbx-pill-ok')).toHaveCount(0);
    });

    test('a song tagged "lyricsheet" without one: the chip marked, ⚠️ 1 not expected', async ({ page }) => {
        await showPage(page, 'song:we-are-the-world');
        const c = card(page);
        await expect(c.locator('.mb-sb-chip.mb-cbx-spur')).toHaveText(['lyricsheet']);
        await expect(c.locator('.mb-cbx-pill-w')).toHaveText('⚠️ 1 not expected');
        await expect(c.locator('.mb-cbx-finds .mb-cbx-find-w')).toContainText('lyricsheet is not expected. The Gallery tab has no lyric sheet.');
        await expect(c.locator('.mb-cbx-miss')).toHaveCount(0);
    });

    test('a venue as expected: the card says what was checked', async ({ page }) => {
        await showPage(page, PONY);
        const c = card(page);
        await expect(c.locator('.mb-cbx-pill-ok')).toHaveText('✓ kind, first-letter and construction tags as expected');
        await expect(c.locator('.mb-cbx-miss, .mb-cbx-spur, .mb-cbx-pills, .mb-cbx-finds')).toHaveCount(0);
    });

    test('a release without "retail": missing in the Category row', async ({ page }) => {
        await showPage(page, 'retail:rescue');
        const c = card(page);
        await expect(c.locator('.mb-sb-chip.mb-cbx-miss')).toHaveText(['retail missing']);
        await expect(c.locator('.mb-sb-chip-row', { hasText: 'Category' }).locator('.mb-sb-chip.mb-cbx-miss')).toHaveCount(1);
    });

    test('a band whose tags go on to its "-2": nothing said until that page is read, then as expected; one request', async ({ page }) => {
        const asked = await showPage(page, USA, ON);
        const c = card(page);
        await expect(c.locator('.mb-cbx-pill-ok')).toHaveText('✓ person/band, first-letter and construction tags as expected');
        expect(asked).toEqual([`${USA}-2`]);
        await expect(c.locator('.mb-cbx-miss, .mb-cbx-spur')).toHaveCount(0);
    });

    test('a band whose "-2" is not read (the setting off): a note, no missing tag said, no request', async ({ page }) => {
        const asked = await showPage(page, USA, { sa_bb_onstage_tags: false });
        const c = card(page);
        await expect(c.locator('.mb-cbx-wait')).toContainText('not every page that keeps this page\'s tags is read');
        await expect(c.locator('.mb-cbx-miss, .mb-cbx-pill-ok')).toHaveCount(0);
        await page.evaluate(() => new Promise(r => setTimeout(r, 800)));
        expect(asked).toEqual([]);
    });
});

test.describe('Brucebase page tag checks: the preview window (bbp-parity batch 4)', () => {
    test('a song without its title tag; a venue without "venue"; a redirect and a release\'s tab page: no marks', async ({ page }) => {
        await loadFixture(page, PONY);
        const hole = await windowOf(page, 'song:down-in-the-hole');
        expect(hole.miss).toEqual(['downinthehole missing']);
        expect(hole.finds).toMatch(/downinthehole is expected and missing\. The song's title as a tag \(also counted: downintheholesong\)\./);
        expect((await windowOf(page, 'venue:ball-arena-denver-co')).miss).toEqual(['venue missing']);
        expect((await windowOf(page, 'relation:rob-demartin')).miss).toEqual(['d missing']);
        for (const n of ['song:born-in-the-usa', 'retail:born-to-run-credits']) {
            const w = await windowOf(page, n);
            expect([w.miss, w.spur, w.ok, w.wait], n).toEqual([[], [], [], 0]);
        }
        const ok = await windowOf(page, 'song:angel-eyes-2');
        expect(ok.ok).toEqual(['✓ kind, first-letter, title, lyric-sheet and construction tags as expected']);
    });

    test('a release tagged "underconstruction" without the banner; one with the banner written as p > em', async ({ page }) => {
        await loadFixture(page, PONY);
        const tracks = await windowOf(page, 'retail:tracks-ii');
        expect(tracks.spur).toEqual(['underconstruction']);
        expect(tracks.finds).toContain('underconstruction is not expected. The page shows no Under Construction banner.');
        expect((await windowOf(page, 'retail:j-a-m-86')).ok, 'BruceBaseParser reads only sup > em').toEqual(['✓ kind and construction tags as expected']);
    });

    test('the window\'s title leaves out the feed\'s first-letter mark while missing tags are looked for', async ({ page }) => {
        await loadFixture(page, PONY, feedKept({ [BAYONNE]: { 'first-letter': 'u' } }));
        expect((await windowOf(page, BAYONNE)).feed).toEqual([]);
        const off = await page.context().newPage();
        off.on('pageerror', e => pageErrors.push(String(e)));
        await loadFixture(off, PONY, { ...feedKept({ [BAYONNE]: { 'first-letter': 'u' } }), sa_findings_bb_tag_missing: false });
        expect((await windowOf(off, BAYONNE)).feed).toEqual(['first-letter']);
    });
});

// Batch 4b (org/bbp-parity.org, "Batch 4b"; vzell, 2026-11-24): the three
// families batch 4 left out, each off by default. A venue's place tags
// (`sa_bb_tag_family_place`, batch 3b's rule on the venue's own title and
// the feed's venueTags), a person's or band's own name tag
// (`sa_bb_tag_family_relation`: SAED's cast forms or the feed's
// relationTags, feed 1.10), a release's date and first-letter tags
// (`sa_bb_tag_family_release`: one date of its "Commercially Released" line
// in full, a date tag of none of them not expected). Fixtures from the
// mirror of 2026-11-23 (scripts/build-bb-findings-page-tags-fixtures.py
// --4b), with tests/fixtures/bb-feed-batch4b.json; the probe's `ship4b` and
// scripts/check-bb-page-tag-findings.js --feed cover the whole mirror.

const FEED_4B = JSON.parse(fs.readFileSync(path.join(__dirname, 'bb-feed-batch4b.json'), 'utf8'));
const BOWTIE = 'venue:bow-tie-cinemas-red-bank-nj';
const HOPPER = 'retail:life-death-and-dennis-hopper';
/** Every batch 4b fixture with the three families on: [missing tag/family], [not-expected tag/family]. */
const WANT_4B = {
    [BOWTIE]: [['redbank/place', 'usa/place'], []],
    'venue:aami-park-melbourne-australia': [[], []],
    [PONY]: [[], []],
    'relation:dan-aykroyd': [['danaykroyd/name'], []],
    'relation:donald-dunn': [[], []],
    'relation:the-max-weinberg-7': [['maxweinberg7/name'], []],
    [HOPPER]: [['2025/date'], ['2024/date']],
    'retail:born-to-run': [[], []],
    'retail:a-good-life': [['a/letter'], []],
};
const CUT_TAB = 'retail:the-concert-for-the-rock-and-roll-hall-of-fame-credit';
/** The three families' switches. */
const FAMS_4B = { sa_bb_tag_family_place: true, sa_bb_tag_family_relation: true, sa_bb_tag_family_release: true };

/**
 * Settings: the feed on with `data` kept a second ago (its run dated
 * yesterday), and the families `fams` on.
 *
 * @param {Object} [data] - The feed (default tests/fixtures/bb-feed-batch4b.json).
 * @param {Object<string, boolean>} [fams]
 * @returns {Object<string, *>}
 */
function kept4b(data = FEED_4B, fams = FAMS_4B) {
    const date = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    return { sa_bb_feed: true, mb_sa_bb_feed: { at: Date.now() - 1000, data: { ...data, run: { ...data.run, date } }, err: '', errAt: 0 }, ...fams };
}

/**
 * Every batch 4b fixture's findings in the loaded page, as `tag/family` lists.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object<string, ?Array>>} name -> [missing, not expected, every finding says why]; null: no check.
 */
const run4b = page => page.evaluate(list => Object.fromEntries(list.map(([name, html]) => {
    const url = 'https://brucebase.wikidot.com/' + name;
    const facts = window.__saTest.bbTagFacts(html, url);
    if (!facts) return [name, null];
    const own = window.__saTest.dpParse('brucebase.wikidot.com', html, url).tags.map(t => t.text.toLowerCase());
    const r = window.__saTest.bbTagCheck(facts, own, []);
    return [name, [r.missing.map(x => `${x.tag}/${x.family}`).sort(), r.spurious.map(x => `${x.tag}/${x.family}`).sort(),
        r.missing.concat(r.spurious).every(x => !!x.why)]];
})), Object.keys(WANT_4B).concat(CUT_TAB).map(n => [n, fs.readFileSync(fileOf(n), 'utf8')]));

test.describe('Brucebase page tag checks: batch 4b, a venue\'s place, a person\'s name, a release\'s dates and letter', () => {
    test('the three families on: every fixture\'s findings (the probe\'s ship4b); a tab page cut at 60 characters gets no check', async ({ page }) => {
        await loadFixture(page, PONY, kept4b());
        const want = Object.fromEntries(Object.entries(WANT_4B).map(([n, [m, s]]) => [n, [m.slice().sort(), s.slice().sort(), true]]));
        want[CUT_TAB] = null;
        expect(await run4b(page)).toEqual(want);
        // The venue's own tag comes from the feed's venue map.
        const pony = await page.evaluate(([html, url]) => {
            const facts = window.__saTest.bbTagFacts(html, url);
            return window.__saTest.bbTagCheck(facts, ['venue', 's', 'asburypark', 'newjersey(nj)', 'usa'], []).missing.map(x => `${x.tag}/${x.family}`);
        }, [fs.readFileSync(fileOf(PONY), 'utf8'), BB + PONY]);
        expect(pony).toEqual(['stonepony/place']);
    });

    test('the families off (the default): none of their findings, the feed kept or not', async ({ page }) => {
        await loadFixture(page, PONY, kept4b(FEED_4B, {}));
        const want = Object.fromEntries(Object.keys(WANT_4B).map(n => [n, [[], [], true]]));
        want[CUT_TAB] = null;
        expect(await run4b(page)).toEqual(want);
    });

    test('the release rule: any one listed date in full, else the first named; a number padded or not; date tags of no listed date', async ({ page }) => {
        await loadFixture(page, PONY, kept4b());
        const run = (facts, own) => page.evaluate(([f, o]) => {
            const r = window.__saTest.bbTagCheck(f, o, []);
            return { missing: r.missing.map(x => `${x.tag}/${x.family}`), spurious: r.spurious.map(x => `${x.tag}/${x.family}`) };
        }, [facts, own]);
        const rel = { page: true, kind: 'retail', name: 'retail:x', title: 'Example', letter: '', construction: false, lyricsheet: false,
            bands: false, members: false, titleTags: [], dates: [['august', '15', '2006'], ['october', '13', '2009']], releaseLetter: 'e' };
        // The second date in full is enough; the first's year is no wrong tag.
        expect(await run(rel, ['retail', 'e', '2006', 'october', '13', '2009'])).toEqual({ missing: [], spurious: [] });
        // Neither in full: the first date's missing parts, a day unpadded counts.
        expect(await run(rel, ['retail', 'e', '2006', 'august'])).toEqual({ missing: ['15/date'], spurious: [] });
        expect(await run(rel, ['retail', 'e', '2006', 'august', '15'])).toEqual({ missing: [], spurious: [] });
        // A date tag of no listed date is not expected; the letter is missing.
        expect(await run(rel, ['retail', '2006', 'august', '15', '2024', 'may'])).toEqual({ missing: ['e/letter'], spurious: ['2024/date', 'may/date'] });
        // A date without a day ("September, 2010") wants no day; no line: no date and no letter check.
        expect(await run({ ...rel, dates: [['september', '', '2010']] }, ['retail', 'e', 'september', '2010'])).toEqual({ missing: [], spurious: [] });
        expect(await run({ ...rel, dates: null, releaseLetter: '' }, ['retail', '1999'])).toEqual({ missing: [], spurious: [] });
    });

    test('the release line: an asterisk, "Tracks commercially released", a month without a day, a year alone', async ({ page }) => {
        await loadFixture(page, PONY);
        const dates = line => page.evaluate((l) => {
            const html = `<html><body><div id="page-title">Example</div><div id="page-content"><div class="code"><pre><code>${l}\nLabel: x</code></pre></div></div>` +
                '<div class="page-tags"><span><a href="/system:page-tags/tag/retail#pages">retail</a></span></div></body></html>';
            return window.__saTest.bbTagFacts(html, 'https://brucebase.wikidot.com/retail:example').dates;
        }, line);
        expect(await dates('Commercially Released*: August 25, 1975')).toEqual([['august', '25', '1975']]);
        expect(await dates('Tracks commercially released: November 9, 1998 / 18 Tracks commercially released: April 12, 1999'))
            .toEqual([['november', '09', '1998'], ['april', '12', '1999']]);
        expect(await dates('Commercially Released: 1988 (Video) / September, 2010 (Audio)')).toEqual([['', '', '1988'], ['september', '', '2010']]);
        expect(await dates('Released: August 25, 1975'), 'no such line').toBeNull();
    });

    test('a person\'s name: the cast forms, a stage name only through the feed\'s relation map; without the map no check and a note', async ({ page }) => {
        await loadFixture(page, PONY, kept4b());
        const name = (facts, own) => page.evaluate(([f, o]) => window.__saTest.bbTagCheck(f, o, []).missing.map(x => `${x.tag}/${x.family}`), [facts, own]);
        const dunn = { page: true, kind: 'relation', name: 'relation:donald-dunn', title: 'Dunn, Donald', letter: 'd', construction: false,
            lyricsheet: false, bands: true, members: false, titleTags: [], dates: null, releaseLetter: '' };
        expect(await name(dunn, ['person', 'd', 'duckdunn'])).toEqual([]);
        expect(await name({ ...dunn, name: 'relation:someone-else' }, ['person', 'd', 'duckdunn'])).toEqual(['donalddunn/name']);
        expect(await name({ ...dunn, name: 'relation:someone-else' }, ['person', 'd', 'donald.dunn'])).toEqual([]);
        // A band's title without ", The"; a band with "&" and a page with neither tab: no name check.
        const band = { ...dunn, name: 'relation:x', title: 'Max Weinberg 7, The', letter: 'm', bands: false, members: true };
        expect(await name(band, ['band', 'm', 'maxweinberg7'])).toEqual([]);
        expect(await name({ ...band, title: 'Bob Seger & The Silver Bullet Band', letter: '&' }, ['band', '&'])).toEqual([]);
        expect(await name({ ...dunn, bands: false }, ['d'])).toEqual([]);
        const noMap = await page.context().newPage();
        noMap.on('pageerror', e => pageErrors.push(String(e)));
        await loadFixture(noMap, PONY, kept4b({ ...FEED_4B, relationTags: undefined }));
        expect(await noMap.evaluate(f => window.__saTest.bbTagCheck(f, ['person', 'd'], []).missing.map(x => x.family), dunn)).toEqual([]);
    });

    test('the Tags card: a venue\'s missing place tags in the Place row, the words; as expected says "place"', async ({ page }) => {
        await showPage(page, BOWTIE, kept4b());
        const c = card(page);
        await expect(c.locator('.mb-sb-chip-row', { hasText: 'Place' }).locator('.mb-sb-chip.mb-cbx-miss')).toHaveText(['redbank missing', 'usa missing']);
        await expect(c.locator('.mb-cbx-pill-e')).toHaveText('❌ 2 missing');
        await expect(c.locator('.mb-cbx-finds .mb-cbx-find-e').first()).toContainText('The title names the city "Red Bank".');
    });

    test('the Tags card: a venue as expected says it checked the place too', async ({ page }) => {
        await showPage(page, 'venue:aami-park-melbourne-australia', kept4b());
        await expect(card(page).locator('.mb-cbx-pill-ok')).toHaveText('✓ kind, first-letter, place and construction tags as expected');
    });

    test('the Tags card: a venue with the place family on and no feed: the place is not checked, the card says why', async ({ page }) => {
        await showPage(page, BOWTIE, FAMS_4B);
        const c = card(page);
        await expect(c.locator('.mb-cbx-wait')).toContainText('The place tags are not checked: the Brucebase feed is off.');
        await expect(c.locator('.mb-cbx-miss')).toHaveCount(0);
    });

    test('the Tags card: a release\'s wrong year not expected, the right one missing, in the Date row', async ({ page }) => {
        await showPage(page, HOPPER, kept4b());
        const c = card(page);
        await expect(c.locator('.mb-sb-chip-row', { hasText: 'Date' }).locator('.mb-sb-chip.mb-cbx-miss')).toHaveText(['2025 missing']);
        await expect(c.locator('.mb-sb-chip.mb-cbx-spur')).toHaveText(['2024']);
        await expect(c.locator('.mb-cbx-finds .mb-cbx-find-w')).toContainText('No date of the page\'s "Commercially Released" line (April 4, 2025) has it.');
    });

    test('the Tags card: a person\'s own name missing in the People row; a stage name passes', async ({ page }) => {
        await showPage(page, 'relation:dan-aykroyd', kept4b());
        const c = card(page);
        await expect(c.locator('.mb-sb-chip-row', { hasText: 'People' }).locator('.mb-sb-chip.mb-cbx-miss')).toHaveText(['danaykroyd missing']);
        const dunn = await page.context().newPage();
        dunn.on('pageerror', e => pageErrors.push(String(e)));
        await showPage(dunn, 'relation:donald-dunn', kept4b());
        await expect(card(dunn).locator('.mb-cbx-pill-ok')).toHaveText('✓ person/band, first-letter, name and construction tags as expected');
    });

    test('the window: a release with the family on marks the same tags', async ({ page }) => {
        await loadFixture(page, PONY, kept4b());
        const w = await windowOf(page, HOPPER);
        expect(w.miss).toEqual(['2025 missing']);
        expect(w.spur).toEqual(['2024']);
    });
});
