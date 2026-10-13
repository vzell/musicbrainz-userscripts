'use strict';

// MusicBrainz title style and typographic punctuation on the non-MusicBrainz
// sites (sa_foreign_mb_titles, sa_foreign_typography; both on by default):
// _mbTitleCase() / _mbNormalizeTitle() / _mbTypography(), applied by the
// jungleland.it, brucespringsteen.it and Brucebase converters to their
// Title columns, and on a Brucebase year page to Venue and to the songs of
// Soundcheck and Setlist. The converter specs (bb-songs, bb-year, jl-list,
// bs-records) load with both settings OFF and pin the sites' text as
// written; this spec loads with them ON. The cases are shared with
// scripts/check-mb-title-case.js (tests/support/mbTitleCaseCases.js). See
// docs/claude/foreign-title-case.md.

const { test, expect } = require('../support/test');
const CASES = require('../support/mbTitleCaseCases');
const {
    BB_BUTTON, BB_YEAR_BUTTON, loadBbSongsPage, loadBbYearPage, renderedBbRows, renderedBbYearRows,
} = require('../support/bbFixture');
const { JL_BUTTON, loadJlListPage, renderedJlRows } = require('../support/jlFixture');
const { loadBsRecordsPage, renderedBsRows } = require('../support/bsFixture');
const { loadSlListPage, renderedSlRows } = require('../support/slFixture');
const { waitForRenderComplete } = require('../support/browser');
const { columnFilterInput } = require('../support/filterSortAssertions');

/**
 * Collects uncaught page errors.
 * @param {import('@playwright/test').Page} page
 * @returns {string[]}
 */
function trackPageErrors(page) {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    return errors;
}

/**
 * Presses a toolbar button by label and waits for the render.
 * @param {import('@playwright/test').Page} page
 * @param {string} label
 */
async function press(page, label) {
    await page.click(`button[data-label="${label}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/**
 * The tooltip text the script set on the cell holding `text` in column
 * `col` (the site's own text), or null.
 * @param {import('@playwright/test').Page} page
 * @param {string} col
 * @param {string} text
 * @returns {Promise<?string>}
 */
function cellTip(page, col, text) {
    return page.evaluate(([c, t]) => {
        const names = Array.from(document.querySelectorAll('table.tbl thead tr:first-child th'))
            .map((th) => th.dataset.colName || th.textContent.trim());
        const i = names.indexOf(c);
        const td = Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .map((tr) => tr.cells[i]).find((cell) => cell && cell.textContent.replace(/\s+/g, ' ').trim() === t);
        if (!td || !td.hasAttribute('data-mb-tip')) return null;
        return td.getAttribute('title') || td.dataset.mbTipSaved || '';
    }, [col, text]);
}

test('the shared cases hold in the browser', async ({ page }) => {
    await loadBbSongsPage(page);
    const got = await page.evaluate((cases) => cases.map(([input, , opts]) => {
        const t = window.__saTest;
        if (opts && opts.full) return t.mbSiteTitleText(input);
        if (opts && opts.typo) return t.mbTypography(input);
        if (opts && opts.normalize) return t.mbNormalizeTitle(input);
        return t.mbTitleCase(input, opts || {});
    }), CASES);
    const bad = CASES.map((c, i) => [c[0], c[1], got[i]]).filter(([, want, g]) => want !== g);
    expect(bad).toEqual([]);
});

test('Brucebase song list: titles in MusicBrainz style, the site\'s text as the tooltip', async ({ page }) => {
    const errors = trackPageErrors(page);
    await loadBbSongsPage(page, { titles: true });
    await press(page, BB_BUTTON);
    const titles = (await renderedBbRows(page)).map((r) => r.Title);
    expect(titles).toContain('Born in the U.S.A.');
    expect(titles).toContain('Darkness on the Edge of Town');
    expect(titles).toContain('Held Up Without a Gun');
    expect(titles).toContain('Tenth Avenue Freeze‐Out');
    expect(titles).toContain('Santa Claus Is Comin’ to Town');
    expect(titles).not.toContain('Born In The U.S.A.');
    expect(await cellTip(page, 'Title', 'Born in the U.S.A.')).toBe('As written on the site:\nBorn In The U.S.A.');
    // A title that needs no change carries no tooltip.
    expect(await cellTip(page, 'Title', 'Badlands')).toBe(null);
    expect(errors).toEqual([]);
});

test('each setting works alone: typography without case, case without typography', async ({ page }) => {
    await loadBbSongsPage(page, { settingsOverride: { sa_foreign_mb_titles: false, sa_foreign_typography: true } });
    await press(page, BB_BUTTON);
    let titles = (await renderedBbRows(page)).map((r) => r.Title);
    expect(titles).toContain('Born In The U.S.A.');
    expect(titles).toContain('Santa Claus Is Comin’ To Town');

    await loadBbSongsPage(page, { settingsOverride: { sa_foreign_mb_titles: true, sa_foreign_typography: false } });
    await press(page, BB_BUTTON);
    titles = (await renderedBbRows(page)).map((r) => r.Title);
    expect(titles).toContain('Santa Claus Is Comin\' to Town');
});

test('jungleland.it: every word capitalised but the small ones, "(version N)" in lower case', async ({ page }) => {
    const errors = trackPageErrors(page);
    await loadJlListPage(page, { titles: true });
    await press(page, JL_BUTTON);
    const titles = (await renderedJlRows(page)).map((r) => r.Title);
    expect(titles).toContain('You Can Trust Your Car to the Man Who Wears the Star (version 2)');
    expect(titles).toContain('Prodigal Son at the Main Point (version 7)');
    // An acronym in capitals inside a mixed title stays.
    expect(titles).toContain('The Prodigal Son Meets JEMS at the Main Point M+ (version 9)');
    expect(errors).toEqual([]);
});

test('brucespringsteen.it: capitals become title case, "(THE)" moves to the front', async ({ page }) => {
    const errors = trackPageErrors(page);
    await loadBsRecordsPage(page, { titles: true });
    await press(page, 'Unofficial');
    const rows = await renderedBsRows(page);
    const titles = rows.map((r) => r.Title);
    expect(titles).toContain('The Agora Show Part One');
    expect(titles).toContain('The Alabama Slammer');
    expect(titles.filter((t) => /\(THE\)$/.test(t))).toEqual([]);
    expect(await cellTip(page, 'Title', 'The Agora Show Part One')).toBe('As written on the site:\nAGORA SHOW PART ONE (THE)');
    expect(errors).toEqual([]);
});

test('springsteenlyrics.com bootlegs and lyrics: titles in MusicBrainz style', async ({ page }) => {
    const errors = trackPageErrors(page);
    let { spec } = await loadSlListPage(page, { kind: 'bootlegs', titles: true });
    await press(page, spec.button);
    let titles = (await renderedSlRows(page)).map((r) => r.Title);
    expect(titles).toContain('Live at the Matrix');
    expect(titles).toContain('A Night Worth Spending in Richmond');
    expect(titles).not.toContain('Live At The Matrix');
    expect(await cellTip(page, 'Title', 'Live at the Matrix')).toBe('As written on the site:\nLive At The Matrix');

    ({ spec } = await loadSlListPage(page, { kind: 'lyrics-b', titles: true }));
    await press(page, spec.button);
    titles = (await renderedSlRows(page)).map((r) => r.Title);
    expect(titles).toContain('Baby Doll');
    expect(titles).toContain('Baby Don’t Go');
    expect(titles).toContain('Baby & Me (Blondie)');
    expect(titles.filter((t) => /^[A-Z '&()]{6,}$/.test(t))).toEqual([]);
    expect(errors).toEqual([]);
});

test.describe('Brucebase year pages: Venue and the songs', () => {
    test('1985: venues and songs in MusicBrainz style; a lower-case filter still finds them', async ({ page }) => {
        const errors = trackPageErrors(page);
        await loadBbYearPage(page, '1985', { titles: true });
        await press(page, BB_YEAR_BUTTON);
        const rows = await renderedBbYearRows(page);
        const hampton = rows.find((r) => r.Date === '1985-01-04');
        expect(hampton.Venue).toBe('Hampton Roads Coliseum');
        // City and Country too ("USA" stays); State is a code or a region and stays.
        expect(hampton.City).toBe('Hampton');
        expect(hampton.State).toBe('VA');
        expect(hampton.Country).toBe('USA');
        const sydney = rows.find((r) => r.City === 'Sydney');
        expect(sydney && [sydney.State, sydney.Country]).toEqual(['NEW SOUTH WALES', 'Australia']);
        expect(rows.filter((r) => /^[A-Z ]{4,}$/.test(r.City) || (r.Country !== 'USA' && /^[A-Z ]{4,}$/.test(r.Country)))).toEqual([]);
        expect(await cellTip(page, 'City', 'Hampton')).toBe('As written on the site:\nHAMPTON');
        expect(hampton._setlist).toContain('Born in the U.S.A.');
        expect(hampton._setlist).toContain('I’m on Fire');
        expect(hampton._setlist).toContain('Santa Claus Is Comin’ to Town');
        expect(hampton._setlist).toContain('Twist and Shout – Do You Love Me');
        expect(await cellTip(page, 'Venue', 'Hampton Roads Coliseum')).toBe('As written on the site:\nHAMPTON ROADS COLISEUM');
        const li = await page.evaluate(() => {
            const items = Array.from(document.querySelectorAll('table.tbl tbody td li'));
            const hit = items.find((x) => x.textContent.trim() === 'Born in the U.S.A.');
            return hit ? { tip: hit.getAttribute('title'), marked: hit.hasAttribute('data-mb-tip') } : null;
        });
        expect(li).toEqual({ tip: 'As written on the site:\nBORN IN THE U.S.A.', marked: true });

        const input = columnFilterInput(page, Object.keys(rows[0]).indexOf('Setlist'));
        await input.click();
        await input.pressSequentially('darlington county');
        await expect.poll(async () => (await renderedBbYearRows(page)).length, { timeout: 15000 }).toBeLessThan(rows.length);
        const hits = await renderedBbYearRows(page);
        expect(hits.length).toBeGreaterThan(0);
        expect(hits.every((r) => r._setlist.includes('Darlington County'))).toBe(true);
        expect(errors).toEqual([]);
    });

    test('2018: the note "(with Patti Scialfa)" stays as written; 2012: a song keeps its bold', async ({ page }) => {
        await loadBbYearPage(page, '2018', { titles: true });
        await press(page, BB_YEAR_BUTTON);
        let rows = await renderedBbYearRows(page);
        expect(rows.some((r) => r._setlist.includes('Tougher Than the Rest (with Patti Scialfa)'))).toBe(true);

        await loadBbYearPage(page, '2012', { titles: true });
        await press(page, BB_YEAR_BUTTON);
        rows = await renderedBbYearRows(page);
        const opener = rows.find((r) => r.Date === '2012-03-18');
        expect(opener._bold).toContain('Land of Hope and Dreams');
        expect(opener._bold.every((b) => b === b.toUpperCase())).toBe(false);
    });

    test('a set label is left as written', async ({ page }) => {
        await loadBbYearPage(page, '2026', { titles: true });
        await press(page, BB_YEAR_BUTTON);
        const off = await (async () => {
            const p2 = await page.context().newPage();
            await loadBbYearPage(p2, '2026');
            await press(p2, BB_YEAR_BUTTON);
            const r = await renderedBbYearRows(p2);
            await p2.close();
            return r;
        })();
        const on = await renderedBbYearRows(page);
        expect(on.map((r) => r._labels)).toEqual(off.map((r) => r._labels));
        expect(on.flatMap((r) => r._labels).length).toBeGreaterThan(0);
        // The song that shares its row with the label is still rewritten:
        // the label is left out of the text the rules read, or its mixed
        // case would make the whole row "not in capitals".
        const firstSongs = on.filter((r) => r._labels.length).map((r) => r._setlist[0].slice(r._labels[0].length).trim());
        expect(firstSongs.length).toBeGreaterThan(0);
        expect(firstSongs.filter((t) => /\p{L}/u.test(t) && t === t.toUpperCase())).toEqual([]);
    });
});
