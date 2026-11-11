'use strict';

// bb-venue and bb-relation (org/brucebase.org, Plan 2026-11-11, Phase 4;
// mockup M3, https://claude.ai/artifact/3rAGVKsBHEv9jGspkJ5X7Z): a Brucebase
// venue page and a person or band page as a detail view. Fixtures: real
// pages (scripts/build-bb-event-fixtures.py); Patti Scialfa's THREE pages
// (/p/1–3, fetched together from the live site on 2026-11-11) for the
// wiki's paging: two of her three show columns page (2 and 3 pages), and a
// module past its last page repeats it.
//
// Pinned against the FIXTURES, read here with a plain DOM: the gate; the
// tables, headers, row counts (Patti's shows = the distinct show links of
// her three pages' Performances tab — no row twice, none missing); one
// request per later page, none on a Load from Disk; the As column (all
// three column headings); the count per band; Recording by song and role;
// Bands / Members in reading order; the head's cards; a show link
// previews.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadBbEventPage, BB_EVENT_PAGES } = require('../support/bbFixture');
const { waitForRenderComplete } = require('../support/browser');
const { clickToolbarItem } = require('../support/toolbarMenu');

const VENUE_BUTTON = 'Show the venue';
const PERSON_BUTTON = 'Show the person';

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
 * Presses a button and waits for the render.
 * @param {import('@playwright/test').Page} page
 * @param {string} label
 * @returns {Promise<void>}
 */
async function press(page, label) {
    await page.click(`button[data-label="${label}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false, timeout: 60000 });
}

/**
 * The rendered sub-tables by name: headers, rows, hrefs of the Event column, open or not.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object<string, {headers: string[], rows: string[][], hrefs: string[], open: boolean}>>}
 */
function tables(page) {
    return page.evaluate(() => {
        const out = {};
        document.querySelectorAll('table.tbl').forEach((t) => {
            const h3 = t.previousElementSibling && t.previousElementSibling.tagName === 'H3' ? t.previousElementSibling : null;
            if (!h3) return;
            const m = h3.textContent.replace(/[▲▼]/g, '').trim().match(/^(.*?)\s*\(\d+\)/);
            out[m ? m[1] : h3.textContent.trim()] = {
                headers: Array.from(t.tHead.rows[0].cells, c => c.dataset.colName || c.textContent.trim()),
                rows: Array.from(t.tBodies[0].rows, r => Array.from(r.cells, c => c.textContent.replace(/\s+/g, ' ').trim())),
                hrefs: Array.from(t.tBodies[0].rows, r => (r.querySelector('a[href]') || {}).href || ''),
                open: getComputedStyle(t).display !== 'none',
            };
        });
        return out;
    });
}

/**
 * Plain-DOM counts over one or more fixture pages: the distinct links of a
 * tab (by label) matching `linkRe`, and the gallery's pictures of page 1.
 * @param {import('@playwright/test').Page} page
 * @param {string} key
 * @param {string} tab
 * @param {string} linkSel
 * @returns {Promise<{links: string[], pictures: number}>}
 */
function fixtureLinks(page, key, tab, linkSel) {
    const fx = BB_EVENT_PAGES[key];
    const html = [fx.file, ...Object.values(fx.pages)].map(f => fs.readFileSync(f, 'utf8'));
    return page.evaluate(([hs, label, sel]) => {
        const links = new Set();
        let pictures = 0;
        hs.forEach((h, n) => {
            const d = new DOMParser().parseFromString(h, 'text/html');
            const nav = d.querySelector('#page-content div.yui-navset');
            const labels = Array.from(nav.querySelectorAll(':scope > ul.yui-nav > li'), li => li.textContent.trim());
            const panel = nav.querySelector(':scope > .yui-content').children[labels.indexOf(label)];
            if (panel) panel.querySelectorAll(sel).forEach(a => links.add(a.getAttribute('href')));
            if (n === 0) pictures = d.querySelectorAll('#page-content .gallery-box .gallery-item img').length;
        });
        return { links: Array.from(links), pictures };
    }, [html, tab, linkSel]);
}

test.describe('bb-venue / bb-relation: the gate', () => {
    test('with sa_bb_detail_pages off, a venue or person page has no button', async ({ page }) => {
        await loadBbEventPage(page, 'venue-roxy-theatre', { detail: false });
        await expect(page.locator('button[data-label]')).toHaveCount(0);
    });
});

test.describe('bb-venue: the Roxy Theatre', () => {
    test('its shows as tables, open; the head: About, the Venue card, the pictures', async ({ page }) => {
        const errors = trackPageErrors(page);
        const { requests } = await loadBbEventPage(page, 'venue-roxy-theatre');
        const perf = await fixtureLinks(page, 'venue-roxy-theatre', 'Performances', 'li a[href]');
        const app = await fixtureLinks(page, 'venue-roxy-theatre', 'Appearances', 'li a[href]');
        await press(page, VENUE_BUTTON);
        const t = await tables(page);
        expect(Object.keys(t)).toEqual(['Performances', 'Appearances']);
        expect(t.Performances.headers).toEqual(['Date', 'Event', 'Show', 'Type']);
        expect(t.Performances.rows).toHaveLength(perf.links.length);
        expect(t.Appearances.rows).toHaveLength(app.links.length);
        expect(t.Performances.open && t.Appearances.open).toBe(true);
        expect(t.Performances.rows).toContainEqual(['1975-10-18', 'Roxy Theatre (The), West Hollywood, CA', 'Late', 'Gig']);
        await expect(page.locator('p.mb-fd-sub')).toHaveText('~ Venue in California (CA)');
        const heads = await page.locator('.mb-fd-head > h2').evaluateAll(hs => hs.map(h => h.textContent.replace(/[▲▼]/g, '').trim()));
        expect(heads).toEqual(['About', expect.stringMatching(/^Details \(\d+\)$/), `Pictures (${perf.pictures})`]);
        const kv = await page.locator('.mb-fd-details .mb-sb-card').first().locator('dt, dd').evaluateAll(ns => {
            const o = {};
            for (let i = 0; i < ns.length; i += 2) o[ns[i].textContent.trim()] = ns[i + 1].textContent.replace(/\s+/g, ' ').trim();
            return o;
        });
        expect(kv).toEqual(expect.objectContaining({ Region: 'California (CA)', Performances: '9, rehearsals not counted', Source: 'Wikipedia' }));
        // One page: nothing fetched.
        expect(requests.filter(u => /\/p\/\d+$/.test(u))).toEqual([]);
        expect(errors).toEqual([]);
    });

    test('a show in Performances previews (FRP)', async ({ page }) => {
        const errors = trackPageErrors(page);
        const { requests } = await loadBbEventPage(page, 'venue-roxy-theatre', {
            settingsOverride: { sa_bb_event_preview: true, sa_pop_ext: true, sa_rich_tooltip_delay_ms: 0 },
        });
        await press(page, VENUE_BUTTON);
        const a = page.locator('table.tbl tbody a[href="https://brucebase.wikidot.com/gig:1976-09-30-roxy-theatre-west-hollywood-ca"]:visible').first();
        await a.scrollIntoViewIfNeeded();
        await page.mouse.move(0, 0);
        await page.keyboard.down('Control');
        await a.hover();
        await page.keyboard.up('Control');
        await expect(page.locator('#mb-dp-peek')).toBeVisible();
        await expect.poll(() => requests).toContain('https://brucebase.wikidot.com/gig:1976-09-30-roxy-theatre-west-hollywood-ca');
        expect(errors).toEqual([]);
    });
});

test.describe('bb-relation: Patti Scialfa, three pages', () => {
    test('every show of all three pages once, its column as As; one request per later page', async ({ page }) => {
        const errors = trackPageErrors(page);
        const { requests } = await loadBbEventPage(page, 'relation-patti-scialfa');
        const shows = await fixtureLinks(page, 'relation-patti-scialfa', 'Performances', 'a[href^="/onstage:"]');
        await press(page, PERSON_BUTTON);
        const t = await tables(page);
        expect(Object.keys(t)).toEqual(['Performances by band', 'Performances', 'Appearances', 'Recording', 'Bands']);
        expect(t.Performances.headers).toEqual(['Date', 'Event', 'Show', 'As']);
        // Every distinct show link of the three pages, none twice.
        expect(t.Performances.rows).toHaveLength(shows.links.length);
        expect(new Set(t.Performances.hrefs).size).toBe(t.Performances.hrefs.length);
        // The As column: all three column headings, the third from the grid's second heading row.
        expect(new Set(t.Performances.rows.map(r => r[3]))).toEqual(new Set([
            'Not as a member of The E Street Band or The Sessions Band', 'As a member of The E Street Band', 'As a member of The Sessions Band',
        ]));
        // Pages 2 and 3, once each.
        expect(requests.filter(u => /\/relation:patti-scialfa\/p\/\d+$/.test(u)).sort()).toEqual([
            'https://brucebase.wikidot.com/relation:patti-scialfa/p/2', 'https://brucebase.wikidot.com/relation:patti-scialfa/p/3',
        ]);
        expect(t.Performances.open).toBe(false);
        expect(errors).toEqual([]);
    });

    test('per band, Recording by song and role, Bands in reading order; the head', async ({ page }) => {
        await loadBbEventPage(page, 'relation-patti-scialfa');
        const rec = await fixtureLinks(page, 'relation-patti-scialfa', 'Recording', 'li li a[href*="/song:"]');
        await press(page, PERSON_BUTTON);
        const t = await tables(page);
        expect(t['Performances by band'].rows).toContainEqual(['The E Street Band', '643']);
        expect(t['Performances by band'].rows).toHaveLength(3);
        expect(t.Recording.headers).toEqual(['Credit', 'Release', 'Artist', 'Year', 'Song', 'Role']);
        expect(t.Recording.rows.length).toBeGreaterThanOrEqual(rec.links.length);
        expect(t.Recording.rows).toContainEqual(['Performer', 'Tunnel Of Love', 'Bruce Springsteen', '1987', 'One Step Up', 'backing vocals']);
        expect(t.Bands.rows).toEqual([['The E Street Band', 'E Street Band, The'], ['The Sessions Band', 'Sessions Band, The']]);
        expect(t.Appearances.rows.every(r => r[3])).toBe(true);
        await expect(page.locator('p.mb-fd-sub')).toHaveText(/^~ Person/);
        const kv = await page.locator('.mb-fd-details .mb-sb-card').first().locator('dt, dd').evaluateAll(ns => {
            const o = {};
            for (let i = 0; i < ns.length; i += 2) o[ns[i].textContent.trim()] = ns[i + 1].textContent.replace(/\s+/g, ' ').trim();
            return o;
        });
        expect(kv).toEqual(expect.objectContaining({ 'Performed with Bruce': '1057 times', Pages: '3 (the long lists page on the wiki; all read)' }));
    });
});

// The `bb-date-comma` finding (vzell, 2026-11-11: "should be flagged as
// finding on the PT"): Patti Scialfa's "2015-04-30, Story Chapel, Mount
// Auburn Cemetery, Cambridge, MA" (pages 2 and 3; page 3's is the repeated
// module, read once). Pinned: the count equals the rows carrying the stamp
// AND the fixture's own comma entries (distinct links); the filter leaves
// exactly those rows and gives every row back; the cell's tint, ⚠️ and the
// entry in its tooltip; the tint setting off keeps the menu row; the
// finding's setting off removes it.
test.describe('bb-relation: the bb-date-comma finding', () => {
    const rowsOf = (page) => page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('table.tbl tbody tr'));
        return { rows: rows.length, withFinding: rows.filter(tr => tr.querySelector('td[data-mb-findings~="bb-date-comma"]')).length };
    });

    test('flagged on the Date cell; the WARNING menu counts and filters it; its look', async ({ page }) => {
        const { findingRow, clickFinding } = require('../support/findingsMenu');
        await loadBbEventPage(page, 'relation-patti-scialfa');
        const fx = BB_EVENT_PAGES['relation-patti-scialfa'];
        const html = [fx.file, ...Object.values(fx.pages)].map(f => fs.readFileSync(f, 'utf8')).join('\n');
        const commaLinks = new Set((html.match(/<a href="(\/[a-z]+:[^"]+)">\d{4}-\d{2}-\d{2},/g) || []).map(m => m.match(/href="([^"]+)"/)[1]));
        expect(commaLinks.size, 'premise: the fixture has such an entry').toBeGreaterThan(0);
        await press(page, PERSON_BUTTON);
        const before = await rowsOf(page);
        expect(before.withFinding).toBe(commaLinks.size);
        const row = await findingRow(page, 'warn', 'bb-date-comma');
        expect(row).toMatchObject({ label: 'Brucebase entry with a comma after its date', count: commaLinks.size });
        const cell = page.locator('td[data-mb-findings~="bb-date-comma"]').first();
        await expect(cell).toHaveAttribute('title', /Brucebase writes it "2015-04-30, Story Chapel, Mount Auburn Cemetery, Cambridge, MA"\./);
        const look = await cell.evaluate(td => ({ bg: getComputedStyle(td).backgroundColor, after: getComputedStyle(td, '::after').content }));
        expect(look.bg).not.toBe('rgba(0, 0, 0, 0)');
        expect(look.after).toContain('⚠');
        await clickFinding(page, 'bb-date-comma');
        await expect.poll(() => rowsOf(page)).toEqual({ rows: commaLinks.size, withFinding: commaLinks.size });
        await clickFinding(page, 'bb-date-comma');
        await expect.poll(() => rowsOf(page)).toEqual(before);
    });

    test('the tint setting off: no tint, the menu row stays; the finding\'s setting off: no menu row', async ({ page }) => {
        const { findingRow } = require('../support/findingsMenu');
        await loadBbEventPage(page, 'relation-patti-scialfa', { settingsOverride: { sa_findings_tint_bb_date_comma: false } });
        await press(page, PERSON_BUTTON);
        expect(await findingRow(page, 'warn', 'bb-date-comma')).toMatchObject({ count: 1 });
        const after = await page.locator('td[data-mb-findings~="bb-date-comma"]').first().evaluate(td => getComputedStyle(td, '::after').content);
        expect(after).not.toContain('⚠');
    });

    test('the finding switched off', async ({ page }) => {
        const { findingRow } = require('../support/findingsMenu');
        await loadBbEventPage(page, 'relation-patti-scialfa', { settingsOverride: { sa_findings_bb_date_comma: false } });
        await press(page, PERSON_BUTTON);
        expect(await findingRow(page, 'warn', 'bb-date-comma')).toBeFalsy();
        await expect(page.locator('td[data-mb-findings~="bb-date-comma"]')).toHaveCount(0);
    });
});

// vzell, 2026-11-11: the wiki's /onstage: redirect pages "should also be
// supported". A person's show links are /onstage:<event>, which the server
// answers with a 301 to the event. Pinned: Ctrl+hover shows the EVENT's
// card; the record is read at the event's own address (the page's
// `requestPageName`), so its tag "gig" is the page's Category, not
// something it holds.
test.describe('bb-relation: an /onstage: link previews its event', () => {
    test('the card is the event\'s; the window\'s tags read the event as a gig', async ({ page }) => {
        const errors = trackPageErrors(page);
        const { requests } = await loadBbEventPage(page, 'relation-patti-scialfa', {
            settingsOverride: { sa_bb_event_preview: true, sa_pop_ext: true, sa_rich_tooltip_delay_ms: 0 },
        });
        const gig = 'https://brucebase.wikidot.com/gig:1978-07-07-roxy-theatre-west-hollywood-ca';
        const gigHtml = fs.readFileSync(BB_EVENT_PAGES['gig-1978-07-07'].file, 'utf8').replace('</head>',
            '<script>var WIKIREQUEST = { info: {} }; WIKIREQUEST.info.requestPageName = "gig:1978-07-07-roxy-theatre-west-hollywood-ca";</script></head>');
        await page.route(/\/onstage:/, (route) => route.fulfill({ status: 301, headers: { location: gig } }));
        await page.route(gig, (route) => route.fulfill({ body: gigHtml, contentType: 'text/html; charset=utf-8' }));
        await press(page, PERSON_BUTTON);
        // Performances starts folded: open it.
        await page.locator('h3', { hasText: /^.?Performances \(\d+\)/ }).first().click();
        const a = page.locator('table.tbl tbody a[href*="/onstage:"]:visible').first();
        await a.scrollIntoViewIfNeeded();
        const href = await a.getAttribute('href');
        await page.mouse.move(0, 0);
        await page.keyboard.down('Control');
        await a.hover();
        await page.keyboard.up('Control');
        await expect(page.locator('#mb-dp-peek')).toContainText('1978-07-07 Roxy Theatre (The), West Hollywood, CA');
        await expect.poll(() => requests).toContain(href);
        await page.keyboard.press('Space');
        const dialog = page.locator('#mb-dp-dialog');
        const tags = dialog.locator('details.mb-dp-sec[data-mb-dp-sec="Tags"]');
        await tags.locator('summary').click();
        const cat = await tags.locator('.mb-dp-tagrow', { has: page.locator('.mb-dp-tagk', { hasText: /^Category$/ }) }).locator('a.mb-dp-tag').allTextContents();
        expect(cat).toEqual(['gig']);
        expect(errors).toEqual([]);
    });
});

test.describe('bb-relation: smaller pages', () => {
    test('a person with one show: its kind reads "On stage"', async ({ page }) => {
        await loadBbEventPage(page, 'relation-anders-goman');
        await press(page, PERSON_BUTTON);
        const t = await tables(page);
        expect(t.Performances.rows).toEqual([['1982-06-26', 'Big Man\'s West, Red Bank, NJ', '', 'On stage']]);
    });

    test('a band: "~ Band", its members in reading order', async ({ page }) => {
        await loadBbEventPage(page, 'relation-malurt');
        const m = await fixtureLinks(page, 'relation-malurt', 'Members', 'li a[href]');
        await press(page, PERSON_BUTTON);
        const t = await tables(page);
        expect(t.Members.rows).toHaveLength(m.links.length);
        expect(t.Members.rows[0]).toEqual(['Michael Falch', 'Falch, Michael']);
        await expect(page.locator('p.mb-fd-sub')).toHaveText(/^~ Band/);
    });
});

test.describe('bb-relation: Save to Disk → Load from Disk', () => {
    let tmpDir;
    test.beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-bb-rel-')); });
    test.afterEach(() => { if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true }); });

    test('a reopened person renders all three pages\' rows with no request', async ({ context }) => {
        const source = await context.newPage();
        await loadBbEventPage(source, 'relation-patti-scialfa');
        await press(source, PERSON_BUTTON);
        const before = await tables(source);
        const downloadPromise = source.waitForEvent('download', { timeout: 60000 });
        await clickToolbarItem(source, '#mb-save-to-disk-btn');
        await source.locator('#sa-sd-save-confirm').waitFor({ state: 'visible', timeout: 15000 });
        await source.click('#sa-sd-save-confirm');
        const saved = path.join(tmpDir, 'bb-relation.json.gz');
        await (await downloadPromise).saveAs(saved);
        await source.close();

        const page = await context.newPage();
        const errors = trackPageErrors(page);
        const { requests } = await loadBbEventPage(page, 'relation-patti-scialfa');
        await clickToolbarItem(page, '#mb-load-from-disk-btn');
        await page.locator('input[type="file"][accept*="json"]').setInputFiles(saved);
        const renderBtn = page.locator('#sa-render-no-filter-confirm');
        await renderBtn.waitFor({ state: 'attached', timeout: 15000 });
        await renderBtn.evaluate((el) => el.click());
        await waitForRenderComplete(page, { waitForAutoResize: false, timeout: 60000 });
        const after = await tables(page);
        expect(Object.keys(after)).toEqual(Object.keys(before));
        Object.keys(before).forEach((k) => expect(after[k].rows.length, k).toBe(before[k].rows.length));
        expect(requests.filter(u => /\/p\/\d+$/.test(u))).toEqual([]);
        expect(errors).toEqual([]);
    });
});
