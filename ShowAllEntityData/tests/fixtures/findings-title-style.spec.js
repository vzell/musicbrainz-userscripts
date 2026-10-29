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

// ── The check in the filter headlines, and the first-visit hint ─────────────
// Mockup approved 2026-10-29, preset "B + C":
// https://claude.ai/artifact/HvdfbmeTUdcR34J4TrNycD
//
// Guarantees pinned:
//   - every sub-table with titles has an idle Aa button BEFORE any check, and
//     nothing is stamped by its presence (the cost stays opt-in);
//   - one click checks the whole page, and each sub-table's button counts the
//     rows OF ITS OWN TABLE (compared, in document order, with the stamped
//     cells — a page total or a neighbour's count on every button fails);
//   - a click on a heading's button never collapses that sub-table;
//   - the panel's kinds are the ⚠️ menu's filters (same derived state), and
//     its list proposes the MusicBrainz style per title;
//   - the hint is offered once, its three answers do what they say, and
//     "Don't show this again" is stored.

/** The headline buttons in document order: scope ("page" or the sub-table name), state, text. */
const headButtons = (page) => page.evaluate(() => Array.from(document.querySelectorAll('.mb-title-style-btn')).map((b) => {
    const h3 = b.closest('h3');
    const box = h3 && h3.querySelector('.mb-subtable-filter-container');
    return { scope: h3 ? (box ? box.dataset.categoryName : '?') : 'page', state: b.dataset.mbTsState, text: b.textContent.trim() };
}));

/**
 * Per sub-table with a heading button, in document order: its name and how
 * many rows of its tbody carry any title-style finding — read from the
 * stamped cells, independently of the buttons.
 */
const offRowsPerTable = (page) => page.evaluate((ids) => {
    const sel = ids.map((id) => `td[data-mb-findings~="${id}"]`).join(', ');
    return Array.from(document.querySelectorAll('h3 .mb-title-style-btn')).map((b) => {
        const h3 = b.closest('h3');
        let t = h3.nextElementSibling;
        while (t && !(t.tagName === 'TABLE' && t.classList.contains('tbl'))) t = t.nextElementSibling;
        const rows = Array.from(t.tBodies[0].rows).filter((r) => r.querySelector(sel)).length;
        return { scope: h3.querySelector('.mb-subtable-filter-container').dataset.categoryName, rows };
    });
}, IDS);

/** Waits until no headline button is idle or running any more. */
const checked = async (page) => {
    await expect.poll(() => page.evaluate(() =>
        !!document.querySelector('.mb-title-style-btn') &&
        !document.querySelector('.mb-title-style-btn[data-mb-ts-state="idle"], .mb-title-style-btn[data-mb-ts-state="running"]'))).toBe(true);
};

/** The open panel's kinds and list, or `null` while closed. */
const panel = (page) => page.evaluate(() => {
    const el = document.getElementById('mb-title-style-pop');
    if (!el || el.style.display === 'none') return null;
    return {
        title: el.querySelector('.mb-tt-title').textContent,
        kinds: Array.from(el.querySelectorAll('.mb-ts-kind')).map((k) => ({
            id: k.dataset.mbTsKind, checked: k.getAttribute('aria-checked'), disabled: k.disabled,
            n: k.querySelector('.mb-ts-n').textContent,
        })),
        list: Array.from(el.querySelectorAll('.mb-ts-item')).map((i) => [
            i.querySelector('.mb-ts-was').textContent, i.querySelector('.mb-ts-now').textContent]),
    };
});

/** The button of the sub-table named `name`. */
const headBtn = (page, name) => page.locator(`h3:has(.mb-subtable-filter-container[data-category-name="${name}"]) .mb-title-style-btn`);

test('headline: every sub-table with titles gets an idle Aa button, and its presence checks nothing', async ({ page }) => {
    await open(page);
    const btns = await headButtons(page);
    const tables = await page.evaluate(() => document.querySelectorAll('h3.mb-toggle-h3').length);
    expect(btns.length).toBe(tables);
    expect(btns.length).toBeGreaterThan(1);
    btns.forEach((b) => {
        expect(b.scope).not.toBe('page');
        expect(b.state).toBe('idle');
        expect(b.text).toBe('AaCheck title style');
    });
    expect(await page.evaluate(() => !!document.getElementById('mb-title-style-global-btn'))).toBe(false);
    const got = await stamped(page);
    IDS.forEach((id) => expect(got[id].rows, id).toBe(0));
});

test('headline: one click checks the page; each sub-table counts its own rows, in order', async ({ page }) => {
    await open(page);
    const first = page.locator('h3 .mb-title-style-btn').first();
    const tableShown = () => page.evaluate(() => {
        const h3 = document.querySelector('h3 .mb-title-style-btn').closest('h3');
        let t = h3.nextElementSibling;
        while (t && t.tagName !== 'TABLE') t = t.nextElementSibling;
        return t.style.display;
    });
    const before = await tableShown();
    // On the inner "Aa" span: the heading's handler already ignores a click
    // whose target is the BUTTON itself, so only a click on a child shows
    // whether the button keeps it from the heading.
    await first.locator('.mb-ts-aa').click();
    await checked(page);
    // The click reached the button, not the heading's collapse handler.
    expect(await tableShown()).toBe(before);
    const per = await offRowsPerTable(page);
    const btns = await headButtons(page);
    expect(btns.map((b) => b.scope)).toEqual(per.map((p) => p.scope));
    btns.forEach((b, i) => {
        const n = per[i].rows;
        expect(b.state, b.scope).toBe(n ? 'found' : 'clean');
        expect(b.text, b.scope).toBe(n ? `Aa${n} title${n === 1 ? '' : 's'} off-style ▾` : 'Aa✓ Style OK');
    });
    // Not every table alike, so a page-wide number on every button fails.
    expect(new Set(per.map((p) => p.rows)).size).toBeGreaterThan(1);
    expect(per.reduce((s, p) => s + p.rows, 0)).toBe(6);
    const status = await page.evaluate(() =>
        document.querySelector('#mb-findings-warn-menu-btn-panel .mb-findings-style-item').dataset.mbTitleStyle);
    expect(status).toBe('done');
});

test('headline: the panel lists the sub-table\'s titles in MB style; its kinds are the ⚠️ menu\'s filters', async ({ page }) => {
    await open(page);
    await page.locator('h3 .mb-title-style-btn').first().click();
    await checked(page);
    const name = (await offRowsPerTable(page)).find((p) => p.rows >= 4).scope;
    await headBtn(page, name).click();
    const p = await panel(page);
    expect(p.title).toBe(`Aa Title style · ${name}`);
    expect(p.list).toEqual(expect.arrayContaining([
        ['Reasons To Believe', 'Reasons to Believe'],
        ["Don't Look Back", 'Don’t Look Back'],
        ['Hungry Heart (feat. Somebody)', '"feat." belongs in the artist credit'],
        ['Come Together [The Beatles Cover]', 'Come Together'],
    ]));
    const all = (await findingRowState(page)).visible;
    const caseRows = (await findingRow(page, 'warn', 'title-case')).count;
    await page.locator('#mb-title-style-pop .mb-ts-kind[data-mb-ts-kind="title-case"]').click();
    expect((await panel(page)).kinds.find((k) => k.id === 'title-case').checked).toBe('true');
    expect((await findingRow(page, 'warn', 'title-case')).checked).toBe('true');
    const on = await findingRowState(page, 'title-case');
    expect(on.visible).toBe(caseRows);
    expect(on.withFinding).toBe(caseRows);
    // Released from the ⚠️ menu: the panel shows that too (derived state).
    await clickFinding(page, 'title-case');
    expect((await findingRowState(page)).visible).toBe(all);
    // Opening the ⚠️ menu was a click outside the panel, which closed it.
    expect(await panel(page)).toBe(null);
    await headBtn(page, name).click();
    expect((await panel(page)).kinds.find((k) => k.id === 'title-case').checked).toBe('false');
});

test('headline: Esc closes the panel; a hover brings it back', async ({ page }) => {
    await open(page);
    await page.locator('h3 .mb-title-style-btn').first().click();
    await checked(page);
    const btn = page.locator('h3 .mb-title-style-btn').first();
    await btn.click();
    expect(await panel(page)).not.toBe(null);
    await page.keyboard.press('Escape');
    expect(await panel(page)).toBe(null);
    await page.mouse.move(0, 0);
    await btn.hover();
    await expect.poll(() => panel(page).then((x) => x !== null)).toBe(true);
    await page.mouse.move(0, 0);
    await expect.poll(() => panel(page).then((x) => x === null)).toBe(true);
});

test('headline: one button in the global filter bar on a single-table page', async ({ page }) => {
    const REC_URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/recordings';
    const html = fs.readFileSync(path.join(__dirname, 'uniq-drop-pending-edits.html'), 'utf8')
        .replace('<bdi>Track A<', '<bdi>Born To Run<')
        .replace('<bdi>Track B<', '<bdi>Don&#39;t Look Back<');
    const fixture = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sa-title-style-rec-')), 'planted.html');
    fs.writeFileSync(fixture, html);
    await loadUserscriptPage(page, { url: REC_URL, fixtureFile: fixture, testMode: true });
    await page.route(`${REC_URL}?**`, (r) => r.fulfill({ path: fixture, contentType: 'text/html' }));
    await page.click('button[data-label="⊚ All recordings"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
    // The short wording in the global bar too: a long label pushed the bar
    // past the window (vzell, 2026-10-29); the count is in the tooltip.
    expect(await headButtons(page)).toEqual([{ scope: 'page', state: 'idle', text: 'AaCheck title style' }]);
    expect(await page.evaluate(() => document.getElementById('mb-title-style-global-btn').title))
        .toMatch(/^Title style · 5 titles, not checked yet\n/);
    const after = await page.evaluate(() => document.getElementById('mb-title-style-global-btn').previousElementSibling.id);
    expect(after).toBe('mb-global-filter-exclude-label');
    await page.click('#mb-title-style-global-btn');
    await checked(page);
    expect(await headButtons(page)).toEqual([{ scope: 'page', state: 'found', text: 'Aa2 titles off-style ▾' }]);
    await page.click('#mb-title-style-global-btn');
    const p = await panel(page);
    expect(p.title).toBe('Aa Title style');
    expect(p.list).toEqual([['Born To Run', 'Born to Run'], ["Don't Look Back", 'Don’t Look Back']]);
    // Variant A (https://claude.ai/artifact/XFAcJ9zn5brXitDzJogXqn): what can
    // be ticked is a card with a box; nothing found is disabled, no box, "—".
    expect(p.kinds.map((k) => [k.id, k.disabled, k.n])).toEqual([
        ['title-case', false, '1'], ['title-typography', false, '1'],
        ['title-series-sep', true, '—'], ['title-feat', true, '—'], ['title-eti-remove', true, '—'],
    ]);
    const look = await page.evaluate(() => Array.from(document.querySelectorAll('#mb-title-style-pop .mb-ts-kind')).map((k) => ({
        box: getComputedStyle(k.querySelector('.mb-ts-box')).visibility,
        bg: getComputedStyle(k).backgroundColor,
    })));
    expect(look.slice(0, 2)).toEqual([{ box: 'visible', bg: 'rgb(255, 255, 255)' }, { box: 'visible', bg: 'rgb(255, 255, 255)' }]);
    look.slice(2).forEach((l) => expect(l.box).toBe('hidden'));
    look.slice(2).forEach((l) => expect(l.bg).not.toBe('rgb(255, 255, 255)'));
});

test('headline: the findings-menus switch removes the buttons too', async ({ page }) => {
    await open(page, { sa_enable_findings_menus: false });
    expect(await headButtons(page)).toEqual([]);
});

test('hint: offered once under the first button; Not now with "Don\'t show this again" stores the setting', async ({ page }) => {
    await open(page, { sa_findings_title_style_hint: true });
    const hint = page.locator('#mb-title-style-hint');
    await expect(hint).toBeVisible();
    const placed = await page.evaluate(() => {
        const h = document.getElementById('mb-title-style-hint').getBoundingClientRect();
        const b = document.querySelector('.mb-title-style-btn').getBoundingClientRect();
        return { below: h.top >= b.bottom, pulse: document.querySelector('.mb-title-style-btn').classList.contains('mb-ts-pulse') };
    });
    expect(placed).toEqual({ below: true, pulse: true });
    await hint.locator('.mb-ts-hint-never-cb').check();
    await hint.locator('[data-mb-ts-hint="later"]').click();
    await expect(hint).toHaveCount(0);
    expect(await page.evaluate(() => window.__gmValues.sa_findings_title_style_hint)).toBe(false);
    // "Not now" checks nothing.
    const got = await stamped(page);
    IDS.forEach((id) => expect(got[id].rows, id).toBe(0));
});

test('hint: Check now runs the check; Esc closes it; the setting off shows none', async ({ page }) => {
    // A fake clock (time still flows) lets the last step jump past the
    // hint's 0.9 s delay instead of sleeping through it.
    await page.clock.install();
    await open(page, { sa_findings_title_style_hint: true });
    await page.locator('#mb-title-style-hint [data-mb-ts-hint="check"]').click();
    await checked(page);
    await expect(page.locator('#mb-title-style-hint')).toHaveCount(0);
    expect((await stamped(page))['title-case'].rows).toBe(1);
    // Check now alone stores nothing: the seeded value stays.
    expect(await page.evaluate(() => window.__gmValues.sa_findings_title_style_hint)).toBe(true);

    await open(page, { sa_findings_title_style_hint: true });
    await expect(page.locator('#mb-title-style-hint')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#mb-title-style-hint')).toHaveCount(0);

    await open(page, { sa_findings_title_style_hint: false });
    await page.clock.fastForward(1500);
    await expect(page.locator('#mb-title-style-hint')).toHaveCount(0);
});

test('hint: Always check turns the auto setting on and checks the page', async ({ page }) => {
    await open(page, { sa_findings_title_style_hint: true });
    await page.locator('#mb-title-style-hint [data-mb-ts-hint="always"]').click();
    await checked(page);
    expect(await page.evaluate(() => window.__gmValues.sa_findings_title_style_auto)).toBe(true);
    const got = await stamped(page);
    Object.entries(EXPECT).forEach(([id, titles]) => expect(got[id].titles, id).toEqual([...titles].sort()));
});

test('hint: a click outside closes it, so a pop-up opened later gets Esc', async ({ page }) => {
    await open(page, { sa_findings_title_style_hint: true });
    const hint = page.locator('#mb-title-style-hint');
    await expect(hint).toBeVisible();
    await page.locator('h1').first().click();
    await expect(hint).toHaveCount(0);
    // Read as "Not now": nothing checked, nothing stored.
    expect((await stamped(page))['title-case'].rows).toBe(0);
    expect(await page.evaluate(() => window.__gmValues.sa_findings_title_style_hint)).toBe(true);
});
