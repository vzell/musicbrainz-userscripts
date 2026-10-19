'use strict';

// 📊 "Links info - Site" and "Links info - Site kind" on the link columns of a
// relationship-tables render (org/TODO.org 2026-10-19, items 2 and 3: on
// release 9d451257…'s Credits render the URLs table's "URL", the "Via release
// group: …" table's "Target" and the "Sidebar: …" tables' "Link" had no site
// entries, no counts and no icons; debug/release-missing-glyphs.html).
//
// Fixture: rel-release-art-overview.html (Born to Run: its URLs, its release
// group's mixed lists, the sidebar's external links).
//
// Guarantees pinned, each named:
//   - COUNTS: one entry per site with its ROW count, equal to a DOM oracle
//     computed from the cells' links (host without "www.", MusicBrainz links
//     and the "[info]" link left out) — per column, per table;
//   - ENTITY ROWS: a mixed Target column counts only its URL rows;
//   - ICON: an entry shows the SAME site icon the table's link shows (its
//     data-mb-sb-ico name, and a computed background), none where the link
//     has none;
//   - TICK: ticking a site leaves exactly its rows;
//   - KIND: amazon.com and amazon.de are ONE "amazon.*" entry counting both
//     rows, and ticking it leaves both; with no kind covering 2+ sites there
//     is no "Site kind" section at all;
//   - RULE: _siteFamilyOf() on hosts no fixture has (co.uk, com.br, a
//     bandcamp subdomain, m./www., an IP).

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { waitForFilterSettled } = require('../support/filterSortAssertions');

const URL_ = 'https://musicbrainz.org/release/1d404e1d-fcb6-3a52-b478-e706e893c897';
const FIXTURE = path.join(__dirname, 'rel-release-art-overview.html');
const BUTTON = 'button[data-label="Show all Credits for Release"]';
const SITE = 'Links info - Site';
const KIND = 'Links info - Site kind';
// MusicBrainz draws a site icon from its stylesheet (refused here) as a data: URI.
const ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const ICON_CSS = ['discogs', 'wikidata', 'amazon']
    .map((c) => `ul.external_links li.${c}-favicon { background-image: url("${ICON}"); }`).join(' ');

/**
 * Loads the fixture, adds MusicBrainz's icon rules, runs `before` in the page
 * and presses Credits.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{settings?: Object, before?: Function}} [opts]
 */
async function open(page, { settings = {}, before = null } = {}) {
    await page.context().route('https://static.metabrainz.org/**', (route) => route.abort('blockedbyclient'));
    await loadUserscriptPage(page, {
        url: URL_, fixtureFile: FIXTURE, testMode: true,
        settingsOverride: { sa_enable_relationship_tables: true, sa_enable_release_tracks: true, sa_sidebar_in_rel_tables: true, ...settings },
    });
    await page.route('https://musicbrainz.org/ws/2/**', (route) => route.fulfill({ status: 404, body: '' }));
    await page.route(/^https:\/\/musicbrainz\.org\/(?!ws\/)/, (route) => route.fulfill({ path: FIXTURE, contentType: 'text/html' }));
    await page.route('https://coverartarchive.org/**', (route) => route.fulfill({ status: 404, body: '' }));
    await page.route('https://eventartarchive.org/**', (route) => route.fulfill({ status: 404, body: '' }));
    await page.addStyleTag({ content: ICON_CSS });
    if (before) await page.evaluate(before);
    await page.click(BUTTON);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/**
 * The oracle of one table's column: its index among `table.tbl`, and per site
 * the rows linking it, the site kind's rows, and the icon name of the site's
 * first link that has one — read from the cells, not from the panel.
 *
 * @param {import('@playwright/test').Page} page
 * @param {RegExp|string} name The h3's name (a prefix).
 * @param {string} col
 */
const oracle = (page, name, col) => page.evaluate(([n, c]) => {
    const h3 = Array.from(document.querySelectorAll('h3.mb-toggle-h3')).find((h) => h.textContent.includes(n));
    if (!h3) return null;
    let t = h3.nextElementSibling;
    while (t && t.tagName !== 'TABLE') t = t.nextElementSibling;
    const idx = Array.from(document.querySelectorAll('table.tbl')).indexOf(t);
    const k = Array.from(t.querySelectorAll('thead tr:first-child th')).findIndex((th) => th.dataset.colName === c);
    const sites = {};
    const icons = {};
    let rows = 0;
    let linkRows = 0;
    t.querySelectorAll('tbody tr').forEach((tr) => {
        rows++;
        const td = tr.cells[k];
        const type = td.dataset.mbEntityType;
        if (type && type !== 'url') return;
        const seen = new Set();
        td.querySelectorAll('a[href]').forEach((a) => {
            const u = new URL(a.getAttribute('href'), 'https://musicbrainz.org');
            const host = u.hostname.replace(/^www\./, '');
            if (!/^https?:$/.test(u.protocol) || /(^|\.)musicbrainz\.org$/.test(host)) return;
            seen.add(host);
            if (a.dataset.mbSbIco && !icons[host]) icons[host] = a.dataset.mbSbIco;
        });
        if (seen.size) linkRows++;
        seen.forEach((h) => { sites[h] = (sites[h] || 0) + 1; });
    });
    return { idx, sites, icons, rows, linkRows };
}, [name, col]);

/** Each entry of `section` in the open panel: label → {count, icon name, icon drawn}. */
const panelEntries = (page, section) => page.evaluate((sec) => {
    const out = {};
    document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section').forEach((s) => {
        if (s.querySelector('.mb-uniq-section-label')?.textContent !== sec) return;
        s.querySelectorAll('.mb-col-uniq-item').forEach((it) => {
            const ico = it.querySelector('span.mb-uniq-site-icon');
            const m = /\((\d+)\)/.exec(it.querySelector('.mb-uniq-count-badge')?.textContent || '');
            out[it.dataset.mbUniqSynLabel.replace(/^» site(?: kind)?: /, '')] = {
                count: m ? Number(m[1]) : null,
                icon: ico ? ico.dataset.mbSbIco : '',
                drawn: ico ? getComputedStyle(ico).backgroundImage.includes('data:image/png') : false,
            };
        });
    });
    return out;
}, section);

/** Visible rows of table `idx`. */
const visibleRows = (page, idx) => page.evaluate((i) => Array.from(document.querySelectorAll('table.tbl')[i].querySelectorAll('tbody tr'))
    .filter((tr) => tr.style.display !== 'none').length, idx);

test.describe('relationship tables: 📊 Links info - Site / Site kind', () => {
    for (const [name, col] of [['URLs', 'URL'], ['Via release group', 'Target'], ['Sidebar: External links', 'Link']]) {
        test(`COUNTS + ICON: "${col}" of "${name}" — one entry per site, its rows, its link's icon`, async ({ page }) => {
            await open(page, { settings: { sa_sidebar_inline_skip_dup_links: false } });
            const o = await oracle(page, name, col);
            expect(o, `the "${name}" table`).not.toBeNull();
            expect(Object.keys(o.sites).length, 'premise: sites in the column').toBeGreaterThan(0);
            await page.evaluate(([c, i]) => window.__saTest.getUniqDropSections(c, i), [col, o.idx]);
            const got = await panelEntries(page, SITE);
            expect(Object.fromEntries(Object.entries(got).map(([k, v]) => [k, v.count])), 'entries = the oracle').toEqual(o.sites);
            Object.entries(got).forEach(([host, v]) => {
                expect(v.icon, `${host}: the link's own icon`).toBe(o.icons[host] || '');
                expect(v.drawn, `${host}: an icon is drawn exactly when it has one`).toBe(!!v.icon);
            });
            expect(Object.values(o.icons).length, 'premise: some link has an icon').toBeGreaterThan(0);
        });
    }

    test('CACHE: re-opening the panel (the 📊 cache) shows the same entries, icons and kinds', async ({ page }) => {
        await open(page, {
            settings: { sa_sidebar_inline_skip_dup_links: false },
            before: () => {
                const ul = document.querySelector('#sidebar ul.external_links');
                ['https://www.amazon.com/gp/product/B0000025JR', 'https://www.amazon.de/gp/product/B000002JBG'].forEach((href) => {
                    const li = document.createElement('li');
                    li.className = 'amazon-favicon';
                    li.innerHTML = `<a href="${href}">Amazon</a>`;
                    ul.appendChild(li);
                });
            },
        });
        const o = await oracle(page, 'Sidebar: External links', 'Link');
        const read = async () => ({ site: await panelEntries(page, SITE), kind: await panelEntries(page, KIND) });
        await page.evaluate(([c, i]) => window.__saTest.getUniqDropSections(c, i), ['Link', o.idx]);
        const first = await read();
        expect(first.kind['amazon.*'], 'premise: the kind on the first open').toBeTruthy();
        // A second click on the same 📊 closes the panel; the third re-opens it from the cache.
        await page.evaluate((i) => document.querySelectorAll('table.tbl')[i].querySelector('th[data-col-name="Link"] .mb-col-uniq-wrap').click(), o.idx);
        await page.evaluate(([c, i]) => window.__saTest.getUniqDropSections(c, i), ['Link', o.idx]);
        expect(await read()).toEqual(first);
    });

    test('ENTITY ROWS: a mixed Target column counts only its URL rows', async ({ page }) => {
        await open(page);
        const o = await oracle(page, 'Via release group', 'Target');
        expect(o.rows, 'premise: entity rows too').toBeGreaterThan(o.linkRows);
        await page.evaluate(([c, i]) => window.__saTest.getUniqDropSections(c, i), ['Target', o.idx]);
        const got = await panelEntries(page, SITE);
        expect(Object.keys(got).some((k) => /musicbrainz/.test(k)), 'no MusicBrainz entry').toBe(false);
        expect(Object.values(got).reduce((n, v) => n + v.count, 0)).toBe(Object.values(o.sites).reduce((n, v) => n + v, 0));
    });

    test('TICK: ticking a site leaves exactly its rows', async ({ page }) => {
        await open(page);
        const o = await oracle(page, 'Via release group', 'Target');
        const host = Object.keys(o.sites)[0];
        await page.evaluate(([c, i]) => window.__saTest.getUniqDropSections(c, i), ['Target', o.idx]);
        await waitForFilterSettled(page, () => page.evaluate((h) => Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-col-uniq-item'))
            .find((el) => el.dataset.mbUniqSynLabel === `» site: ${h}`).click(), host));
        expect(await visibleRows(page, o.idx)).toBe(o.sites[host]);
        // The mark: the host inside each visible row's link text (a URL).
        const marks = await page.evaluate(([i, h]) => Array.from(document.querySelectorAll('table.tbl')[i].querySelectorAll('tbody tr'))
            .filter((tr) => tr.style.display !== 'none')
            .map((tr) => Array.from(tr.querySelectorAll('.mb-column-filter-highlight')).map((m) => m.textContent.toLowerCase()).includes(h)), [o.idx, host]);
        expect(marks.every(Boolean), 'every row marks the host').toBe(true);
    });

    test('KIND: amazon.com and amazon.de are one "amazon.*" entry; ticking it leaves both rows', async ({ page }) => {
        await open(page, {
            settings: { sa_sidebar_inline_skip_dup_links: false },
            before: () => {
                const ul = document.querySelector('#sidebar ul.external_links');
                [['https://www.amazon.com/gp/product/B0000025JR', 'Amazon'], ['https://www.amazon.de/gp/product/B000002JBG', 'Amazon']].forEach(([href, text]) => {
                    const li = document.createElement('li');
                    li.className = 'amazon-favicon';
                    const a = document.createElement('a');
                    a.href = href;
                    a.textContent = text;
                    li.appendChild(a);
                    ul.appendChild(li);
                });
            },
        });
        const o = await oracle(page, 'Sidebar: External links', 'Link');
        expect(o.sites).toMatchObject({ 'amazon.com': 1, 'amazon.de': 1 });
        await page.evaluate(([c, i]) => window.__saTest.getUniqDropSections(c, i), ['Link', o.idx]);
        const kinds = await panelEntries(page, KIND);
        expect(kinds['amazon.*'], 'one entry for both').toMatchObject({ count: 2, drawn: true });
        await waitForFilterSettled(page, () => page.evaluate(() => Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-col-uniq-item'))
            .find((el) => el.dataset.mbUniqSynLabel === '» site kind: amazon.*').click()));
        expect(await visibleRows(page, o.idx)).toBe(2);
    });

    test('KIND: no "Site kind" section when no kind covers 2+ sites', async ({ page }) => {
        await open(page);
        const o = await oracle(page, 'URLs', 'URL');
        const sections = await page.evaluate(([c, i]) => window.__saTest.getUniqDropSections(c, i), ['URL', o.idx]);
        const labels = sections.map((s) => s.label);
        expect(labels).toContain(SITE);
        expect(labels).not.toContain(KIND);
    });

    test('RULE: the site kind of hosts no fixture has', async ({ page }) => {
        await open(page);
        const got = await page.evaluate(() => Object.fromEntries(['amazon.co.uk', 'www.amazon.com.br', 'music.amazon.de', 'brucespringsteen.bandcamp.com',
            'm.facebook.com', 'www2.example.org', 'localhost', '192.168.0.1', 'www.discogs.com'].map((h) => [h, window.__saTest.siteFamilyOf(h)])));
        expect(got).toEqual({
            'amazon.co.uk': 'amazon.*', 'www.amazon.com.br': 'amazon.*', 'music.amazon.de': 'amazon.*',
            'brucespringsteen.bandcamp.com': 'bandcamp.*', 'm.facebook.com': 'facebook.*', 'www2.example.org': 'example.*',
            localhost: 'localhost', '192.168.0.1': '192.168.0.1', 'www.discogs.com': 'discogs.*',
        });
    });
});
