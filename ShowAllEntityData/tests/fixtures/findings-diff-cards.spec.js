'use strict';

// The rich diff card for three findings that used to show a sentence only
// (org/title-style-guidelines.org, follow-up of 2026-10-20):
//   - "Live title date uses "-" instead of "‐"" (the live-title flag family:
//     release/RG titles, event names, recording comments): the text over its
//     "‐" form, only the hyphens marked;
//   - "Extra title information starts uppercase": the title over the same
//     title with the ETI keywords in lower case;
//   - "Title truncated with "…"": ONE row, the closing "…" marked, because
//     the full title is not on the page (no invented second value).
//
// Guarantees pinned, each against its neighbour:
//   - the card compares the RIGHT two values (labels and marked runs, not
//     just "a comparison exists");
//   - only the date changes in the proposal: a hyphen in the location stays;
//   - a red (impossible date) cell gets no separator comparison;
//   - the comparison rides on the cell the flag was stamped on, so it
//     survives a filter re-render (clones of the source rows).
//
// The live NEAR MISSES (2026-10-21: "Recording comment almost follows …",
// "Starts with a date but is not a live title …", the same for event names)
// get the same card: the text over the form it almost has
// (`_liveNearMissFixed()`), pinned case by case on the fixer itself and on
// the cards of a recording comment, a release title and an event name. A
// near miss with no single fix ("05.02.1975": which part is the day?) gets
// the one-row card with the date marked, never an invented proposal.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const SETTINGS = { sa_enable_caa_pics: false, sa_enable_relationships_column: false };

const RG_URL = 'https://musicbrainz.org/release-group/aaaaaaaa-0000-0000-0000-000000000002';
const RG_FIXTURE = path.join(__dirname, 'releasegroup-releases-live-titles.html');
const REC_URL = 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f/recordings';
const REC_FIXTURE = path.join(__dirname, 'artist-recordings-comments.html');
const ART_URL = 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f';
const ART_SOURCE = path.join(__dirname, 'artist-releasegroups-live-titles.html');
const EV_URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/events';
const EV_FIXTURE = path.join(__dirname, 'artist-events-names.html');
// The comment from the request (debug/recording-comment-diff-tooltip.html),
// planted over a valid one of the recordings fixture.
const REC_PLANT = ['live, 1978‐07‐07: The Roxy, West Hollywood, USA', 'live, 1993-4-21: Sony Music Studios, New York, NY, USA'];

// Planted into the artist release-groups fixture: one capitalized ETI keyword
// (the default list has "live"), one title ending in "…".
const PLANT = [
    ['Nebraska', 'Darkness on the Edge of Town (Live in Asbury Park 2009)'],
    ['Magic', 'Jesus Mary and Joseph…'],
];

let ART_FIXTURE;
let REC_PLANTED;
test.beforeAll(() => {
    const rec = fs.readFileSync(REC_FIXTURE, 'utf8');
    if (!rec.includes(REC_PLANT[0])) throw new Error(`fixture comment "${REC_PLANT[0]}" not found`);
    REC_PLANTED = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sa-diff-cards-rec-')), 'planted.html');
    fs.writeFileSync(REC_PLANTED, rec.replace(REC_PLANT[0], REC_PLANT[1]));

    let html = fs.readFileSync(ART_SOURCE, 'utf8');
    PLANT.forEach(([from, to]) => {
        const re = new RegExp(`(/release-group/[0-9a-f-]{36}"><bdi>)${from}(</bdi>)`);
        if (!re.test(html)) throw new Error(`fixture title "${from}" not found`);
        html = html.replace(re, `$1${to}$2`);
    });
    ART_FIXTURE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sa-diff-cards-')), 'planted.html');
    fs.writeFileSync(ART_FIXTURE, html);
});

/**
 * Loads a fixture and presses one of its buttons.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} url
 * @param {string} fixture
 * @param {string} button
 */
async function open(page, url, fixture, button) {
    await page.context().route('https://static.metabrainz.org/**', (route) => route.abort('blockedbyclient'));
    await loadUserscriptPage(page, { url, fixtureFile: fixture, testMode: true, settingsOverride: SETTINGS });
    await page.route(`${url}*`, (r) => r.fulfill({ path: fixture, contentType: 'text/html' }));
    await page.click(`button[data-label="${button}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
    const master = page.locator('.mb-master-toggle');
    if (await master.count() && (await master.getAttribute('data-state')) === 'collapsed') await master.click();
}

/**
 * The rich card of the first live cell whose link text is `text` (in the
 * cell's first `a[href] bdi`, or its recording comment with `comment`):
 * title lines, row labels and the marked runs of each row.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} text
 * @param {{comment?: boolean}} [opts]
 */
const card = (page, text, opts = {}) => page.evaluate(([t, isComment]) => {
    const td = Array.from(document.querySelectorAll('table.tbl tbody td[data-mb-tip]')).find((c) => {
        const el = isComment ? c.querySelector('a[href*="/recording/"] bdi') : c.querySelector('a[href] bdi');
        return el && el.textContent.trim() === t;
    });
    if (!td) return null;
    const div = document.createElement('div');
    div.innerHTML = window.__saTest.tipTextToHtml(td.getAttribute('title'), td);
    return {
        title: Array.from(div.querySelectorAll('.mb-tt-title')).map((d) => d.textContent),
        labels: Array.from(div.querySelectorAll('.mb-tt-cmp-lbl')).map((d) => d.textContent),
        values: Array.from(div.querySelectorAll('.mb-tt-cmp-val')).map((d) => d.textContent),
        marks: Array.from(div.querySelectorAll('.mb-tt-cmp-val')).map((v) => Array.from(v.querySelectorAll('mark')).map((m) => m.textContent)),
        sum: Array.from(div.querySelectorAll('.mb-tt-cmp-sum > div')).map((d) => d.textContent),
    };
}, [text, !!opts.comment]);

test('the live-date fix touches the date head only', async ({ page }) => {
    await open(page, RG_URL, RG_FIXTURE, 'Show all Releases for ReleaseGroup');
    const got = await page.evaluate((cases) => cases.map((c) => window.__saTest.liveSepFixed(c)), [
        '1975-02-05: The Main Point, Bryn Mawr, PA, USA',
        '1975-08-15, late show: Wilkes-Barre Arena, Wilkes-Barre, PA, USA',
        '1989-07-04 / 1990-04-22: Park West, Chicago, IL, USA',
        '1978-08-21: Madison Square Garden, New York City / 1979-01-01: Nassau Coliseum, Uniondale',
        'live, 2009-12-13: Paramount Theatre, Asbury Park, NJ, USA',
        '1978-08-21/22/23: Madison Square Garden, New York City, NY, USA',
    ]);
    expect(got).toEqual([
        '1975‐02‐05: The Main Point, Bryn Mawr, PA, USA',
        '1975‐08‐15, late show: Wilkes-Barre Arena, Wilkes-Barre, PA, USA',
        '1989‐07‐04 / 1990‐04‐22: Park West, Chicago, IL, USA',
        '1978‐08‐21: Madison Square Garden, New York City / 1979‐01‐01: Nassau Coliseum, Uniondale',
        'live, 2009‐12‐13: Paramount Theatre, Asbury Park, NJ, USA',
        '1978‐08‐21/22/23: Madison Square Garden, New York City, NY, USA',
    ]);
});

test('live title with "-": the title over its "‐" form, the hyphens marked', async ({ page }) => {
    await open(page, RG_URL, RG_FIXTURE, 'Show all Releases for ReleaseGroup');
    expect(await card(page, '1975-02-05: The Main Point, Bryn Mawr, PA, USA')).toEqual({
        title: ['Live title date uses a plain "-" between its parts instead of "‐" (U+2010).'],
        labels: ['Title', '≠ MB style'],
        values: ['1975-02-05: The Main Point, Bryn Mawr, PA, USA', '1975‐02‐05: The Main Point, Bryn Mawr, PA, USA'],
        marks: [['-', '-'], ['‐', '‐']],
        sum: [expect.stringContaining('U+2010')],
    });
    // Mixed: only the one plain "-" differs.
    const mixed = await card(page, '1975-02‐05: The Main Point, Bryn Mawr, PA, USA');
    expect(mixed.marks).toEqual([['-'], ['‐']]);
    // A red cell (impossible date, also with "-") has no separator comparison.
    const red = await card(page, '1975-13-05: The Main Point, Bryn Mawr, PA, USA');
    expect(red.title).toEqual(['Live title date is impossible: month 13.']);
    expect(red.labels).toEqual([]);
});

test('the live-title comparison survives a filter re-render', async ({ page }) => {
    await open(page, RG_URL, RG_FIXTURE, 'Show all Releases for ReleaseGroup');
    await page.fill('#mb-global-filter-input', 'Main Point');
    await expect.poll(async () => (await card(page, '1975-02-05: The Main Point, Bryn Mawr, PA, USA'))?.labels,
        { timeout: 15000 }).toEqual(['Title', '≠ MB style']);
    await page.fill('#mb-global-filter-input', '');
    await expect.poll(async () => (await card(page, '1975-02-05: The Main Point, Bryn Mawr, PA, USA'))?.labels,
        { timeout: 15000 }).toEqual(['Title', '≠ MB style']);
});

test('recording comment with "-": the comment over its "‐" form', async ({ page }) => {
    await open(page, REC_URL, REC_FIXTURE, '⊚ All recordings');
    const c = await card(page, 'Born to Run', { comment: true });
    expect(c.labels).toEqual(['Comment', '≠ MB style']);
    expect(c.values[0]).toMatch(/^live, \d{4}-\d\d-\d\d/);
    expect(c.values[1]).toBe(c.values[0].replace(/^(live, \d{4})-(\d\d)-/, '$1‐$2‐'));
    expect(c.marks[1].every((m) => m === '‐')).toBe(true);
});

test('capitalized ETI: the title over the keyword in lower case', async ({ page }) => {
    await open(page, ART_URL, ART_FIXTURE, '🧮 Artist RGs');
    expect(await card(page, 'Darkness on the Edge of Town (Live in Asbury Park 2009)')).toEqual({
        title: ['⚠️ Extra title information starts uppercase'],
        labels: ['Title', '≠ MB style'],
        values: ['Darkness on the Edge of Town (Live in Asbury Park 2009)', 'Darkness on the Edge of Town (live in Asbury Park 2009)'],
        marks: [['L'], ['l']],
        sum: ['1 letter in a different case: L → l'],
    });
});

test('truncated title: one row, the "…" marked, no proposed title', async ({ page }) => {
    await open(page, ART_URL, ART_FIXTURE, '🧮 Artist RGs');
    const c = await card(page, 'Jesus Mary and Joseph…');
    expect(c.title).toEqual(['⚠️ Title truncated with "…"']);
    expect(c.labels).toEqual(['Title']);
    expect(c.values).toEqual(['Jesus Mary and Joseph…']);
    expect(c.marks).toEqual([['…']]);
    expect(c.sum).toEqual([expect.stringContaining('The full title is not on this page.')]);
});

/**
 * The rich card of the first cell whose recording comment (`.comment bdi`,
 * without its parentheses) is `text`; same shape as `card()`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} text
 */
const commentCard = (page, text) => page.evaluate((t) => {
    const td = Array.from(document.querySelectorAll('table.tbl tbody td[data-mb-tip]')).find((c) => {
        const el = c.querySelector('.comment bdi');
        return el && el.textContent.trim().replace(/^\(|\)$/g, '') === t;
    });
    if (!td) return null;
    const div = document.createElement('div');
    div.innerHTML = window.__saTest.tipTextToHtml(td.getAttribute('title'), td);
    return {
        title: Array.from(div.querySelectorAll('.mb-tt-title')).map((d) => d.textContent),
        labels: Array.from(div.querySelectorAll('.mb-tt-cmp-lbl')).map((d) => d.textContent),
        values: Array.from(div.querySelectorAll('.mb-tt-cmp-val')).map((d) => d.textContent),
        marks: Array.from(div.querySelectorAll('.mb-tt-cmp-val')).map((v) => Array.from(v.querySelectorAll('mark')).map((m) => m.textContent)),
        sum: Array.from(div.querySelectorAll('.mb-tt-cmp-sum > div')).map((d) => d.textContent),
    };
}, text);

test('near-miss fixer: only fixes that cannot be read two ways, and only when the result is valid', async ({ page }) => {
    await open(page, RG_URL, RG_FIXTURE, 'Show all Releases for ReleaseGroup');
    const cases = [
        // [text, target, expected]
        ['live, 1993-4-21: Sony Music Studios, New York, NY, USA', 'comment', 'live, 1993‐04‐21: Sony Music Studios, New York, NY, USA'],
        ['live 2004‐10‐02: Gund Arena, Cleveland, OH, USA', 'comment', 'live, 2004‐10‐02: Gund Arena, Cleveland, OH, USA'],
        ['Live, 2004‐10‐03: Gund Arena, Cleveland, OH, USA', 'comment', 'live, 2004‐10‐03: Gund Arena, Cleveland, OH, USA'],
        ['2004‐10‐02: Gund Arena, Cleveland, OH, USA', 'comment', 'live, 2004‐10‐02: Gund Arena, Cleveland, OH, USA'],
        ['live, 2004‐10‐02, Gund Arena, Cleveland, OH, USA', 'comment', 'live, 2004‐10‐02: Gund Arena, Cleveland, OH, USA'],
        ['live, 2004‐10‐02 Gund Arena, Cleveland', 'comment', 'live, 2004‐10‐02: Gund Arena, Cleveland'],
        ['live: KBCO Studios, Boulder, CO, USA', 'comment', 'live, KBCO Studios, Boulder, CO, USA'],
        ['Live', 'comment', 'live'],
        ['live, 1975-2-5: The Main Point, Bryn Mawr, PA, USA; intro', 'comment', 'live, 1975‐02‐05: The Main Point, Bryn Mawr, PA, USA; intro'],
        ['live, 05.02.1975: The Main Point, Bryn Mawr, PA, USA', 'comment', null],
        ['live, 1973/1976', 'comment', null],
        ['live, 1975-2-31: The Main Point, Bryn Mawr, PA, USA', 'comment', null],
        ['1975-2-5: The Main Point, Bryn Mawr, PA, USA', 'title', '1975‐02‐05: The Main Point, Bryn Mawr, PA, USA'],
        ['1975.02.05: The Main Point, Bryn Mawr, PA, USA', 'title', '1975‐02‐05: The Main Point, Bryn Mawr, PA, USA'],
        ['1975‐02‐05 The Main Point, Bryn Mawr', 'title', '1975‐02‐05: The Main Point, Bryn Mawr'],
        ['05.02.1975: The Main Point, Bryn Mawr, PA, USA', 'title', null],
        ['1975‐02‐05: The Main Point', 'title', null],
        ['1975-2-31: The Main Point, Bryn Mawr, PA, USA', 'title', null],
    ];
    const got = await page.evaluate((cs) => cs.map(([t, k]) => window.__saTest.liveNearMissFixed(t, k)), cases);
    expect(got).toEqual(cases.map((c) => c[2]));
});

test('recording comment near miss: the comment over the form it almost has (the request\'s "1993-4-21")', async ({ page }) => {
    await open(page, REC_URL, REC_PLANTED, '⊚ All recordings');
    const c = await commentCard(page, REC_PLANT[1]);
    expect(c.title).toEqual(['Recording comment almost follows "live, YYYY-MM-DD: Venue, City, …": date is not written YYYY-MM-DD.']);
    expect(c.labels).toEqual(['Comment', '≠ MB style']);
    expect(c.values).toEqual([REC_PLANT[1], 'live, 1993‐04‐21: Sony Music Studios, New York, NY, USA']);
    const cap = await commentCard(page, 'Live, 2004‐10‐03: Gund Arena, Cleveland, OH, USA');
    expect(cap.values).toEqual(['Live, 2004‐10‐03: Gund Arena, Cleveland, OH, USA', 'live, 2004‐10‐03: Gund Arena, Cleveland, OH, USA']);
    expect(cap.marks).toEqual([['L'], ['l']]);
    const noType = await commentCard(page, '2004‐10‐02: Gund Arena, Cleveland, OH, USA');
    // An inserted space is drawn as "·" in its mark.
    expect(noType.values[1].replace(/·/g, ' ')).toBe('live, 2004‐10‐02: Gund Arena, Cleveland, OH, USA');
    expect(noType.marks[1], 'the inserted type is what is marked').toEqual(['live,·']);
});

test('a near miss with no single fix: one row, the date marked, no proposal', async ({ page }) => {
    await open(page, REC_URL, REC_FIXTURE, '⊚ All recordings');
    const c = await commentCard(page, 'live, 05.02.1975: The Main Point, Bryn Mawr, PA, USA');
    expect(c.labels).toEqual(['Comment']);
    expect(c.values).toEqual(['live, 05.02.1975: The Main Point, Bryn Mawr, PA, USA']);
    expect(c.marks).toEqual([['05.02.1975']]);
    expect(c.sum).toEqual([expect.stringContaining('No single fix')]);
    // An impossible date is not a near miss: still no comparison at all.
    const red = await commentCard(page, 'live, 1975‐13‐05: The Main Point, Bryn Mawr, PA, USA');
    expect(red.title).toEqual(['Recording comment date is impossible: month 13.']);
    expect(red.labels).toEqual([]);
});

test('release title and event name near misses get the same card', async ({ page }) => {
    await open(page, RG_URL, RG_FIXTURE, 'Show all Releases for ReleaseGroup');
    const t = await card(page, '1975‐02‐05 The Main Point, Bryn Mawr');
    expect(t.labels).toEqual(['Title', '≠ MB style']);
    expect(t.values).toEqual(['1975‐02‐05 The Main Point, Bryn Mawr', '1975‐02‐05: The Main Point, Bryn Mawr']);
    const amb = await card(page, '05.02.1975: The Main Point, Bryn Mawr, PA, USA');
    expect(amb.labels).toEqual(['Title']);
    expect(amb.marks).toEqual([['05.02.1975']]);

    await open(page, EV_URL, EV_FIXTURE, 'Show all Events for Artist');
    const e = await card(page, '1975‐02‐05 The Main Point, Bryn Mawr');
    expect(e.labels).toEqual(['Event', '≠ MB style']);
    expect(e.values[1]).toBe('1975‐02‐05: The Main Point, Bryn Mawr');
    const eAmb = await card(page, '05.02.1975: The Main Point, Bryn Mawr, PA, USA');
    expect(eAmb.labels).toEqual(['Event']);
    expect(eAmb.marks).toEqual([['05.02.1975']]);
});
