'use strict';

// The MusicBrainz title-style findings (org/title-style-guidelines.org,
// docs/claude/findings.md "On demand: the title-style findings"): five ⚠️
// findings — title-case, title-typography, title-series-sep, title-feat,
// title-eti-remove — run only after "Check title style" in the WARNING menu,
// or on every load with sa_findings_title_style_auto.
//
// Guarantees pinned, each against its neighbour:
//   - NOTHING is checked before the click (the cost is opt-in), yet the
//     menu offers the check on a page that has no other warning;
//   - after the click each finding sits on exactly the planted titles, its
//     menu count equals the rows carrying it, and only title cells carry it;
//   - a menu row filters to exactly those rows and back (the stamp reached
//     the source rows: the filter re-renders clones of them);
//   - the hover card compares the title with its MusicBrainz style, only the
//     differing characters marked;
//   - the tint setting changes the look only; a finding's own setting
//     removes it; the auto setting stamps without a click;
//   - the shared Node cases hold in the browser too.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { clickToolbarItem } = require('../support/toolbarMenu');
const { findingsMenuState, findingRow, clickFinding, findingRowState } = require('../support/findingsMenu');
const STYLE_CASES = require('../support/mbTitleStyleCases.js');

const URL = 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f';
const SOURCE = path.join(__dirname, 'artist-releasegroups-live-titles.html');
const BUTTON = '🧮 Artist RGs';
const WARN_BG = 'rgb(255, 243, 205)';
const IDS = ['title-case', 'title-typography', 'title-series-sep', 'title-feat', 'title-eti-remove'];

// Real titles of the fixture replaced by titles that break one rule each.
// The fixture's own "The Wild, the Innocent & The E Street Shuffle" and
// "Bruce Springsteen & The E Street Band – …" are NOT hits ("The" after "&"
// names a band); its "The Album Collection Vol. 2, 1987–1996" is a real hit.
const PLANT = [
    ['Nebraska', 'Reasons To Believe'],
    ['Magic', 'Don&#39;t Look Back'],
    ['Retrospective', 'Broadcasts Vol. 5'],
    ['High Hopes', 'Hungry Heart (feat. Somebody)'],
    ['Lucky Town', 'Come Together [The Beatles Cover]'],
];
const EXPECT = {
    'title-case': ['Reasons To Believe'],
    'title-typography': ["Don't Look Back"],
    'title-series-sep': ['Broadcasts Vol. 5', 'The Album Collection Vol. 2, 1987–1996'], // the second is the fixture's own
    'title-feat': ['Hungry Heart (feat. Somebody)'],
    'title-eti-remove': ['Come Together [The Beatles Cover]'],
};

let FIXTURE;
test.beforeAll(() => {
    let html = fs.readFileSync(SOURCE, 'utf8');
    PLANT.forEach(([from, to]) => {
        const re = new RegExp(`(/release-group/[0-9a-f-]{36}"><bdi>)${from}(</bdi>)`);
        if (!re.test(html)) throw new Error(`fixture title "${from}" not found`);
        html = html.replace(re, `$1${to}$2`);
    });
    FIXTURE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sa-title-style-')), 'planted.html');
    fs.writeFileSync(FIXTURE, html);
});

/**
 * Loads the planted fixture and renders every release group.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} [settings]
 */
async function open(page, settings = {}) {
    await page.context().route('https://static.metabrainz.org/**', (route) => route.abort('blockedbyclient'));
    await loadUserscriptPage(page, { url: URL, fixtureFile: FIXTURE, testMode: true,
        settingsOverride: { sa_enable_caa_pics: false, sa_enable_relationships_column: false, ...settings } });
    await page.route('https://musicbrainz.org/ws/2/**', (route) => route.fulfill({ status: 404, body: '' }));
    await page.route(/^https:\/\/musicbrainz\.org\/(?!ws\/)/, (route) => route.fulfill({ path: FIXTURE, contentType: 'text/html' }));
    await page.click(`button[data-label="${BUTTON}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/** Presses the WARNING menu's "Check title style" row. */
const runCheck = (page) => clickToolbarItem(page, '.mb-findings-style-item[data-mb-title-style="run"]');

/**
 * Per finding id: the titles of the cells carrying it (deduplicated, sorted),
 * the column names they sit in, and how many ROWS carry it.
 *
 * @param {import('@playwright/test').Page} page
 */
const stamped = (page) => page.evaluate((ids) => {
    const out = {};
    ids.forEach((id) => {
        const cells = Array.from(document.querySelectorAll(`table.tbl tbody td[data-mb-findings~="${id}"]`));
        const colNames = new Set(cells.map((td) => {
            const th = td.closest('table').querySelectorAll('thead tr:first-child th')[td.cellIndex];
            return th ? (th.dataset.colName || th.textContent.trim()) : '?';
        }));
        out[id] = {
            titles: Array.from(new Set(cells.map((td) => td.querySelector('bdi').textContent.trim()))).sort(),
            cols: Array.from(colNames),
            rows: new Set(cells.map((td) => td.parentElement)).size,
        };
    });
    return out;
}, IDS);

test('nothing is checked before the click, and the WARNING menu offers the check', async ({ page }) => {
    await open(page);
    const before = await stamped(page);
    IDS.forEach((id) => expect(before[id].rows, id).toBe(0));
    const style = await page.evaluate(() => {
        const r = document.querySelector('#mb-findings-warn-menu-btn-panel .mb-findings-style-item');
        return r && { state: r.dataset.mbTitleStyle, text: r.textContent };
    });
    expect(style).toEqual({ state: 'run', text: 'AaCheck title style (MB guidelines)' });
    const menu = await findingsMenuState(page, 'warn');
    expect(menu.attached).toBe(true);
});

test('the check stamps exactly the planted titles, counted by row, in title cells only', async ({ page }) => {
    await open(page);
    await runCheck(page);
    const got = await stamped(page);
    Object.entries(EXPECT).forEach(([id, titles]) => {
        expect(got[id].titles, id).toEqual([...titles].sort());
        expect(got[id].cols, id).toEqual(['Title']);
    });
    for (const id of IDS) {
        const row = await findingRow(page, 'warn', id);
        expect(row, id).toBeTruthy();
        expect(row.count, id).toBe(got[id].rows);
    }
    const status = await page.evaluate(() =>
        document.querySelector('#mb-findings-warn-menu-btn-panel .mb-findings-style-item').dataset.mbTitleStyle);
    expect(status).toBe('done');
});

test('a menu row filters to exactly its rows, and back', async ({ page }) => {
    await open(page);
    await runCheck(page);
    const all = (await findingRowState(page)).visible;
    const count = (await findingRow(page, 'warn', 'title-case')).count;
    await clickFinding(page, 'title-case');
    const on = await findingRowState(page, 'title-case');
    expect(on.visible).toBe(count);
    expect(on.withFinding).toBe(count);
    await clickFinding(page, 'title-case');
    expect((await findingRowState(page)).visible).toBe(all);
    // Still stamped after two re-renders of the source rows.
    expect((await stamped(page))['title-case'].rows).toBe(count);
});

test('the hover card compares the title with its MusicBrainz style', async ({ page }) => {
    await open(page);
    await runCheck(page);
    const card = (title) => page.evaluate((t) => {
        const td = Array.from(document.querySelectorAll('table.tbl tbody td[data-mb-findings]'))
            .find((c) => c.querySelector('bdi') && c.querySelector('bdi').textContent.trim() === t);
        const div = document.createElement('div');
        div.innerHTML = window.__saTest.tipTextToHtml(td.getAttribute('title'), td);
        return {
            labels: Array.from(div.querySelectorAll('.mb-tt-cmp-lbl')).map((d) => d.textContent),
            marks: Array.from(div.querySelectorAll('.mb-tt-cmp-val')).map((v) => Array.from(v.querySelectorAll('mark')).map((m) => m.textContent)),
        };
    }, title);
    expect(await card('Reasons To Believe')).toEqual({ labels: ['Title', '≠ MB style'], marks: [['T'], ['t']] });
    expect(await card("Don't Look Back")).toEqual({ labels: ['Title', '≠ MB style'], marks: [["'"], ['’']] });
    expect(await card('Broadcasts Vol. 5')).toEqual({ labels: ['Title', '≠ MB style'], marks: [[], [',']] });
    // A flag-only finding names what it found, no comparison.
    const feat = await page.evaluate(() => Array.from(document.querySelectorAll('td[data-mb-findings~="title-feat"]'))[0].title);
    expect(feat).toBe('⚠️ Featured artist in title: "feat." belongs in the artist credit');
});

test('the tint: yellow by default; its setting changes the look, not the finding', async ({ page }) => {
    await open(page);
    await runCheck(page);
    const look = () => page.evaluate(() => Array.from(document.querySelectorAll('td[data-mb-findings~="title-series-sep"]'))
        .map((td) => ({ bg: getComputedStyle(td).backgroundColor, level: td.dataset.mbFinding || null })));
    const cells = await look();
    expect(cells.length).toBeGreaterThan(0);
    cells.forEach((c) => expect(c).toEqual({ bg: WARN_BG, level: 'warn' }));
});

test('with the tint setting off the cells keep the finding but not the paint', async ({ page }) => {
    await open(page, { sa_findings_tint_title_style: false });
    await runCheck(page);
    const cells = await page.evaluate(() => Array.from(document.querySelectorAll('td[data-mb-findings~="title-series-sep"]'))
        .map((td) => ({ level: td.dataset.mbFinding || null, bg: getComputedStyle(td).backgroundColor })));
    expect(cells.length).toBeGreaterThan(0);
    cells.forEach((c) => {
        expect(c.level).toBe(null);
        expect(c.bg).not.toBe(WARN_BG);
    });
    expect(await findingRow(page, 'warn', 'title-series-sep')).toBeTruthy();
});

test('a finding\'s own setting turns it off; the others still run', async ({ page }) => {
    await open(page, { sa_findings_title_typography: false });
    await runCheck(page);
    const got = await stamped(page);
    expect(got['title-typography'].rows).toBe(0);
    expect(got['title-case'].rows).toBeGreaterThan(0);
    expect(await findingRow(page, 'warn', 'title-typography')).toBeUndefined();
});

test('with the auto setting the findings are stamped without a click', async ({ page }) => {
    await open(page, { sa_findings_title_style_auto: true });
    const got = await stamped(page);
    Object.entries(EXPECT).forEach(([id, titles]) => expect(got[id].titles, id).toEqual([...titles].sort()));
    const text = await page.evaluate(() =>
        document.querySelector('#mb-findings-warn-menu-btn-panel .mb-findings-style-item').textContent);
    expect(text).toBe('✓Title style checked automatically');
});

test('the shared cases hold in the browser', async ({ page }) => {
    await open(page);
    const got = await page.evaluate((cases) => cases.map(([input]) => {
        const r = window.__saTest.mbTitleStyleCheck(input);
        const o = {};
        Object.keys(r).forEach((k) => { if (r[k] !== null) o[k] = r[k]; });
        return o;
    }), STYLE_CASES);
    const bad = STYLE_CASES.map((c, i) => [c[0], c[1], got[i]]).filter(([, want, g]) => JSON.stringify(want) !== JSON.stringify(g));
    expect(bad).toEqual([]);
});
