'use strict';

// setlist.fm's festival pages (2026-11-04; org/foreign-detail-PTs.org "add
// support for SFM festivals", mockup org/sfm-festival-mockups.html). An
// edition (sfm-festival): every setlist, a sub-table per day, Time · Artist ·
// Stage · Attendees, from the page's own JSON (no request), and a head
// (Festival; Stages and Most attended). A festival (sfm-festivals): its
// editions, page by page, and a head (its facts, the Artist charts). Both
// pages' lists preview before the button, and a festival or edition link has
// the setlistfm reader's card and window without a key (vzell's answer 3).
// Fixtures: scripts/build-setlistfm-fixtures.py from debug/sfm-festival.html
// (the widget's JSON cut to 39 of 661 setlists) and debug/sfm-festivals.html.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage, FIXTURE_SETTINGS_OVERRIDE } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const SFM = 'https://www.setlist.fm';
const FX = name => path.join(__dirname, name);
const EDITION = '/festival/2025/glastonbury-festival-2025-3d581bb.html';
const FESTIVAL = '/festivals/glastonbury-festival-3d6bd17.html';
const PAGES = { [EDITION]: 'sfm-page-festival-3d581bb.html', [FESTIVAL]: 'sfm-page-festivals-3d6bd17.html' };

/**
 * Loads a festival page fixture (a festival's at `?page=1`, so the fetch of
 * page 1 is a URL of its own), every setlist.fm page of PAGES served and
 * logged, everything else blocked.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} pathName
 * @param {Object} [settings]
 * @returns {Promise<{served: string[], errors: string[]}>}
 */
async function open(page, pathName, settings = {}) {
    const served = [];
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
    await page.route((u) => u.hostname === 'www.setlist.fm' && Object.prototype.hasOwnProperty.call(PAGES, u.pathname), (route) => {
        const u = new URL(route.request().url());
        served.push(u.pathname + u.search);
        return route.fulfill({ path: FX(PAGES[u.pathname]), contentType: 'text/html; charset=utf-8' });
    });
    await loadUserscriptPage(page, {
        url: `${SFM}${pathName}${pathName === FESTIVAL ? '?page=1' : ''}`, fixtureFile: FX(PAGES[pathName]), testMode: true,
        settingsOverride: { ...FIXTURE_SETTINGS_OVERRIDE, sa_enable_setlistfm: true, sa_render_threshold: 100000, ...settings },
    });
    return { served, errors };
}

/**
 * Presses a button of our section and waits for the render.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} label
 * @returns {Promise<void>}
 */
async function show(page, label) {
    await page.click(`#mb-sfm-root button[data-label="${label}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

// The sub-tables' headings, without their counts and toggles.
const h3s = (page) => page.locator('#mb-sfm-root h3').evaluateAll(hs => hs.map(h => Array.from(h.childNodes)
    .filter(n => n.nodeType === 3).map(n => n.textContent).join('').replace(/\s+/g, ' ').trim()));

/**
 * Every rendered table of our section (not the head's) as rows of {column: text}.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<Array<Object>>>}
 */
function tables(page) {
    return page.evaluate(() => Array.from(document.querySelectorAll('#mb-sfm-root table.tbl')).filter(t => !t.closest('.mb-fd-head')).map((table) => {
        const names = Array.from(table.querySelectorAll('thead tr:first-child th')).map(th => th.dataset.colName || th.textContent.trim());
        return Array.from(table.querySelectorAll('tbody tr')).map((tr) => {
            const row = {};
            names.forEach((n, i) => { row[n] = (tr.cells[i]?.textContent || '').replace(/\s+/g, ' ').trim(); });
            return row;
        });
    }));
}

// A head card by its name.
const card = (page, name) => page.locator('#mb-sfm-root .mb-fd-head .mb-sb-card', { has: page.locator('.mb-sb-card-head', { hasText: new RegExp(`^${name}`) }) });
const names = (page, col) => page.locator(`#mb-sfm-root .mb-fd-head .mb-sb-${col} .mb-sb-card-head > span:first-child`).allTextContents();

test.describe('setlist.fm festival pages (sfm-festival, sfm-festivals, 2026-11-04)', () => {
    test('an edition: no request; a sub-table per day, by time; Time · Artist · Stage · Attendees', async ({ page }) => {
        const { served, errors } = await open(page, EDITION);
        // The page's own URL is answered by the loader's fixture route, which
        // beats `served`'s: count every request to setlist.fm from here on.
        const asked = [];
        page.on('request', (r) => { if (/setlist\.fm/.test(r.url())) asked.push(r.url()); });
        await show(page, 'Show all setlists of this festival');
        expect(served, 'the page itself: no request').toEqual([]);
        expect(asked, 'no request to setlist.fm at all').toEqual([]);
        expect(await h3s(page)).toEqual(['Wednesday · 2025-06-25', 'Thursday · 2025-06-26', 'Friday · 2025-06-27', 'Saturday · 2025-06-28', 'Sunday · 2025-06-29']);
        const t = await tables(page);
        expect(t.map(x => x.length)).toEqual([6, 6, 10, 8, 9]);
        expect(Object.keys(t[0][0])).toEqual(['Time', 'Artist', 'Stage', 'Attendees']);
        // Two at 11:30: by name, case ignored ("corto.alto" before "Fabio & Grooverider").
        expect(t[2][0]).toEqual({ Time: '11:30', Artist: 'corto.alto', Stage: 'West Holts', Attendees: '2' });
        // A setlist that names only the main venue: no stage.
        expect(t[3].find(r => r.Artist === 'Pulp')).toEqual({ Time: '18:15', Artist: 'Pulp', Stage: '', Attendees: '258' });
        const a = page.locator('#mb-sfm-root table.tbl a', { hasText: 'The 1975' }).first();
        await expect(a).toHaveAttribute('href', /^https:\/\/www\.setlist\.fm\/setlist\/the-1975\/2025\//);
        await expect(a).toHaveAttribute('target', '_blank');
        expect(errors).toEqual([]);
    });

    test('an edition\'s head: subheader; Festival on the left; Stages and Most attended on the right', async ({ page }) => {
        await open(page, EDITION);
        await show(page, 'Show all setlists of this festival');
        await expect(page.locator('#mb-sfm-root > h1 + p.mb-fd-sub')).toHaveText('~ Festival edition (2025-06-25 – 2025-06-29: Worthy Farm, Pilton, England)');
        expect(await names(page, 'rail')).toEqual(['Festival']);
        expect(await names(page, 'main')).toEqual(['Stages', 'Most attended']);
        const f = card(page, 'Festival');
        await expect(f.locator('dt')).toHaveText(['Dates', 'Festival', 'Venue', 'Setlists', 'Stages', 'Attendances']);
        // The info box's own numbers (the whole festival), not the rows shown.
        await expect(f).toContainText('Setlists661');
        await expect(f).toContainText('Stages9');
        await expect(f.locator('a', { hasText: 'Glastonbury Festival' })).toHaveAttribute('href', `${SFM}${FESTIVAL}`);
        await expect(card(page, 'Stages').locator('.mb-sb-pill').last()).toHaveText('no stage given ×20');
        await expect(card(page, 'Most attended').locator('dt').first()).toHaveText('Pulp');
        await expect(card(page, 'Most attended').locator('dd').first()).toHaveText('258');
    });

    test('a festival: its editions, every page of its pager fetched; ISO dates; the head with its facts and Artist charts', async ({ page }) => {
        const { served, errors } = await open(page, FESTIVAL);
        await show(page, 'Show all editions of this festival');
        // Its pager names page 2 (Glastonbury: 40 editions); the fixture
        // serves page 1's file for it too, so 40 rows.
        expect(served).toEqual([FESTIVAL, `${FESTIVAL}?page=2`]);
        const t = (await tables(page))[0];
        expect(t).toHaveLength(40);
        expect(t[0]).toEqual({ Year: '2025', Edition: 'Glastonbury Festival 2025', Stages: '1 venue (9 stages)', Venues: 'Worthy Farm', Start: '2025-06-25', End: '2025-06-29' });
        await expect(page.locator('#mb-sfm-root > h1 + p.mb-fd-sub')).toHaveText('~ Festival by Glastonbury Festival');
        const f = card(page, 'Festival');
        await expect(f).toContainText('Took place40 times');
        await expect(f).toContainText('Artists4138 with setlists');
        await expect(f).toContainText('Name' + 'Glastonbury Festival of Contemporary Performing Arts');
        await expect(card(page, 'Artist charts').locator('.mb-sb-pill').first()).toHaveText('Billy Bragg ×41');
        expect(errors).toEqual([]);
    });

    test('before any button, both pages\' lists preview: an edition link, the breadcrumb\'s festival link (no key), a setlist link of the widget (key)', async ({ page }) => {
        const resolve = sel => page.evaluate((q) => {
            const a = document.querySelector(q);
            return a ? (window.__saTest.popResolve(a) || 'none') : 'missing';
        }, sel);
        await open(page, FESTIVAL, { sa_pop_ext: true, sa_pop_ext_setlistfm_key: '' });
        expect(await resolve('.viewBaseFestival td.name a')).toBe(`ext|ext:setlistfm:${SFM}${EDITION}`);
        await open(page, EDITION, { sa_pop_ext: true, sa_pop_ext_setlistfm_key: '' });
        expect(await resolve('.breadCrumbBar a[href*="festivals/glastonbury"]')).toBe(`ext|ext:setlistfm:${SFM}${FESTIVAL}`);
        await open(page, EDITION, { sa_pop_ext: true, sa_pop_ext_setlistfm_key: 'tok-probe' });
        expect((await resolve('.FestivalSetlists-root .FestivalSetlistListItem-artist a')).split(':').slice(0, 2).join(':')).toBe('ext|ext:setlistfm');
    });

    test('an edition link\'s card and window, no key: the page read once; the setlists by day, a chip per stage', async ({ page }) => {
        const { served } = await open(page, FESTIVAL, { sa_pop_ext: true, sa_pop_ext_setlistfm_key: '', sa_rich_tooltip_delay_ms: 0 });
        const a = page.locator('.viewBaseFestival td.name a').first();
        await page.mouse.move(0, 0);
        await page.keyboard.down('Control');
        await a.hover();
        await page.keyboard.up('Control');
        const c = page.locator('#mb-dp-peek');
        await expect(c.locator('.mb-tt-title')).toHaveText('Glastonbury Festival 2025');
        await expect(c).toContainText('Setlists661');
        await page.keyboard.press('Space');
        const d = page.locator('#mb-dp-dialog');
        await expect(d.locator('h4', { hasText: 'Setlists · 39' })).toBeVisible();
        await expect(d.locator('tr.mb-dp-tsec').first()).toContainText('Wednesday · 2025-06-25');
        await expect(d.locator('h4', { hasText: 'Most attended' })).toBeVisible();
        // Each name a link to its setlist, not its HTML as text (vzell
        // 2026-11-04, debug/sfm-festival-edition-POH.html: `_mbPopKvHtml()`
        // escapes a name).
        const top = d.locator('h4:text-is("Most attended") + dl.mb-dp-kv');
        await expect(top.locator('dt a').first()).toHaveText('Pulp');
        await expect(top.locator('dt a').first()).toHaveAttribute('href', /^https:\/\/www\.setlist\.fm\/setlist\/pulp\/2025\//);
        await expect(top.locator('dd').first()).toHaveText('258');
        expect(await d.textContent()).not.toContain('<a href');
        expect(served.filter(u => u === EDITION), 'the edition\'s page, read once, same-origin').toHaveLength(1);
    });
});
