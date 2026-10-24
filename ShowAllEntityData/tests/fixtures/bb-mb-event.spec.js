'use strict';

// org/TODO.org "Some enhancements" 3c (vzell, 2026-10-24): the Brucebase year
// table's MB-Event column. Mockup https://claude.ai/artifact/DmsNyUkUa1Hq8nPr2B5EGA;
// the ws/2 shapes from scripts/probe-mb-event-lookups.py (debug/probe-mb-event-lookups.json).
//
// MusicBrainz is a stub that answers from the fixture's entries (`__gmXhrResponder`):
// every entry's anchor is linked to an event on the entry's date, except
//   - 1985-01-07 and 1985-01-08: no Brucebase link (found by the year search,
//     then one event lookup each for their links: none),
//   - 1985-01-10 and 1985-01-15: no event at all (the name search's top hit
//     is on another date: "no event").
// So the lookup costs 1 url batch + 1 year search + 2 name searches + 2
// event lookups. Pinned: what each row ENDS UP linking (the event, how it
// was found, its Brucebase links), the request counts per kind, the store
// answering a reload with no request, a failure left unanswered and retried
// by a click, the column's text found by the filter after the late write,
// and the setting: off asks nothing until ▶ MB.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadBbYearPage, BB_YEAR_BUTTON, revealPastStickyColumn } = require('../support/bbFixture');
const { addRequiredLibs, MB_LIBRARY_PATH, USERSCRIPT_PATH } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { columnFilterInput } = require('../support/filterSortAssertions');

const NO_LINK = ['1985-01-07', '1985-01-08'];
const NO_EVENT = ['1985-01-10', '1985-01-15'];

/**
 * The fixture's entries as MusicBrainz knows them: anchor URL → date, read
 * from the fixture file, NOT from the page (a filter can leave the page's
 * table empty while the lookup runs).
 * @type {Object<string, string>}
 */
const ENTRIES = (() => {
    const html = fs.readFileSync(path.join(__dirname, 'bb-year-1985.html'), 'utf8');
    const out = {};
    for (const m of html.matchAll(/<a name="(\w+)"><\/a>(?:\s*<br\s*\/?>)?\s*<strong>(?:<a [^>]*>)?(\d{4}-\d\d-\d\d)/g)) {
        // A 00 day or month is "not known": MusicBrainz writes such a date
        // without it ("1985-07"), as the converter does.
        out[`http://brucebase.wikidot.com/1985#${m[1]}`] = m[2].replace(/(?:-00)+$/, '');
    }
    return out;
})();

/** A stand-in MBID per date ("1985-01-13" → "00000000-0000-4000-8000-001985011300"). */
const idOf = (date) => `00000000-0000-4000-8000-00${date.replace(/-/g, '')}00`;

/**
 * Installs the MusicBrainz stub before the page loads.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{failYear?: number}} [opts] failYear: answer the first N year searches 503.
 * @returns {Promise<void>}
 */
async function stubMusicBrainz(page, { failYear = 0 } = {}) {
    await page.addInitScript(([noLink, noEvent, failYearN, entries]) => {
        const idOf = (date) => `00000000-0000-4000-8000-00${date.replace(/-/g, '')}00`;
        const json = (status, body) => ({ status, responseHeaders: 'Content-Type: application/json', responseText: JSON.stringify(body) });
        const rows = () => new Map(Object.entries(entries));
        const ev = (date) => ({ id: idOf(date), name: `${date.replace(/-/g, '‐')}: Somewhere`, type: 'Concert', 'life-span': { begin: date, end: date } });
        let yearAsked = 0;
        window.__gmXhrResponder = (opts) => {
            const u = new URL(opts.url);
            if (u.hostname !== 'musicbrainz.org') return undefined;
            if (u.pathname === '/ws/2/url') {
                const known = rows();
                const urls = u.searchParams.getAll('resource').filter(r => known.has(r) && !noLink.includes(known.get(r)) && !noEvent.includes(known.get(r)))
                    .map(r => ({ resource: r, relations: [{ type: 'review', event: ev(known.get(r)) }] }));
                return urls.length ? json(200, { 'url-count': urls.length, 'url-offset': 0, urls }) : json(404, { error: 'Not Found' });
            }
            const one = u.pathname.match(/^\/ws\/2\/event\/([0-9a-f-]+)$/);
            if (one) return json(200, { id: one[1], relations: [] });
            if (u.pathname === '/ws/2/event') {
                const q = u.searchParams.get('query') || '';
                if (q.startsWith('arid:')) {
                    if (yearAsked++ < failYearN) return { status: 503, responseHeaders: 'Content-Type: text/html', responseText: 'busy' };
                    const dates = Array.from(new Set(rows().values())).filter(d => !noEvent.includes(d));
                    return json(200, { count: dates.length, offset: 0, events: dates.map(ev) });
                }
                // The name search: its top hit is on another date.
                return json(200, { count: 1, offset: 0, events: [{ ...ev('1981-02-22'), score: 47 }] });
            }
            return undefined;
        };
    }, [NO_LINK, NO_EVENT, failYear, ENTRIES]);
}

/**
 * The 1985 year page, rendered, the stub installed and the lookup on.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{settings?: Object, failYear?: number}} [opts]
 * @returns {Promise<{errors: string[]}>}
 */
async function openYear(page, { settings = {}, failYear = 0 } = {}) {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    await stubMusicBrainz(page, { failYear });
    await loadBbYearPage(page, '1985', { settingsOverride: { sa_render_threshold: 100000, sa_bb_mb_event_lookup: true, ...settings } });
    await page.click(`button[data-label="${BB_YEAR_BUTTON}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
    return { errors };
}

/** The MusicBrainz requests made so far, by kind. */
const mbAsked = (page) => page.evaluate(() => {
    const out = { url: 0, year: 0, name: 0, event: 0 };
    (window.__gmXhrLog || []).forEach(r => {
        const u = new URL(r.url);
        if (u.hostname !== 'musicbrainz.org') return;
        if (u.pathname === '/ws/2/url') out.url++;
        else if (/^\/ws\/2\/event\/./.test(u.pathname)) out.event++;
        else if (u.pathname === '/ws/2/event') (u.searchParams.get('query') || '').startsWith('arid:') ? out.year++ : out.name++;
    });
    return out;
});

/** Every row's MB-Event cell, by date. */
const cells = (page) => page.evaluate(() => Object.fromEntries(Array.from(document.querySelectorAll('table.tbl tbody td.mb-bbev-cell')).map(td => [
    td.dataset.mbBbevDate, {
        state: td.dataset.mbBbevState, s: (td.querySelector('.mb-bbev-g') || {}).dataset?.s,
        href: (td.querySelector('a.mb-bbev-g') || {}).href || '', links: td.dataset.mbBbevLinks || '', text: td.textContent,
    }])));

/** Rows not finished (neither answered nor failed). */
const unsettled = (page) => page.evaluate(() =>
    document.querySelectorAll('table.tbl tbody td.mb-bbev-cell:not([data-mb-bbev-state="done"]):not([data-mb-bbev-state="error"])').length);

test.describe('bb-year: the MB-Event column (2026-10-24)', () => {
    test('after the render: found by its link, by date, or no event — with the fewest requests, kept in the cells', async ({ page }) => {
        const { errors } = await openYear(page);
        await expect.poll(() => unsettled(page), { timeout: 30000 }).toBe(0);
        const c = await cells(page);
        // By its own Brucebase link: linked, the link known.
        expect(c['1985-01-13']).toMatchObject({ state: 'done', s: 'found', href: `https://musicbrainz.org/event/${idOf('1985-01-13')}`,
            links: 'brucebase.wikidot.com/1985#130185' });
        // By date, its links read with one event lookup: none.
        expect(c['1985-01-07']).toMatchObject({ s: 'found', href: `https://musicbrainz.org/event/${idOf('1985-01-07')}`, links: '' });
        // No event: the search link, the "no event" text.
        expect(c['1985-01-10'].s).toBe('none');
        expect(c['1985-01-10'].href).toMatch(/^https:\/\/musicbrainz\.org\/search\?query=1985-01-10%3A%20/);
        expect(c['1985-01-10'].text).toBe('no MusicBrainz event');
        // The column's text is the MBID (hidden), which the filter reads.
        expect(c['1985-01-13'].text).toBe(idOf('1985-01-13'));
        expect(Object.values(c).filter(x => x.state !== 'done')).toEqual([]);
        // A row the stub does not know (an anchor the fixture regex misses, or
        // none) is not on the year search either: a name search too.
        const unknown = await page.evaluate((known) => Array.from(document.querySelectorAll('table.tbl tbody td.mb-bbev-cell'))
            .filter(td => !known.includes(td.dataset.mbBbevAnchor)).length, Object.keys(ENTRIES));
        expect(unknown, 'the fixture regex knows every entry').toBe(0);
        expect(await mbAsked(page)).toEqual({ url: 1, year: 1, name: NO_EVENT.length + unknown, event: NO_LINK.length });
        expect(errors).toEqual([]);
    });

    test('a reload answers every row from the store: no request', async ({ page }) => {
        await openYear(page);
        await expect.poll(() => unsettled(page), { timeout: 30000 }).toBe(0);
        await page.reload();
        await addRequiredLibs(page);
        await page.addScriptTag({ path: MB_LIBRARY_PATH });
        await page.addScriptTag({ path: USERSCRIPT_PATH });
        await page.click(`button[data-label="${BB_YEAR_BUTTON}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await expect.poll(() => unsettled(page), { timeout: 15000 }).toBe(0);
        const c = await cells(page);
        expect(c['1985-01-13'].s).toBe('found');
        expect(c['1985-01-10'].s).toBe('none');
        expect(await mbAsked(page), 'nothing asked after the reload').toEqual({ url: 0, year: 0, name: 0, event: 0 });
    });

    test('a failed request leaves its rows unanswered (⚠, not stored); a click on one asks again', async ({ page }) => {
        // Two 503s: `_extGet()` retries a 503 once by itself.
        const { errors } = await openYear(page, { failYear: 2 });
        await expect.poll(() => unsettled(page), { timeout: 30000 }).toBe(0);
        let c = await cells(page);
        // The rows the url lookup answered are in; those that needed the year search failed.
        expect(c['1985-01-13'].s).toBe('found');
        expect(c['1985-01-07']).toMatchObject({ state: 'error', s: 'fail' });
        expect(c['1985-01-10']).toMatchObject({ state: 'error', s: 'fail' });
        const stored = await page.evaluate(() => new Promise(resolve => {
            const req = indexedDB.open('vz-saed-bb-mbevents', 1);
            req.onsuccess = () => {
                const all = req.result.transaction('events').objectStore('events').getAll();
                all.onsuccess = () => resolve(all.result.map(r => r.key));
            };
        }));
        expect(stored.some(k => /1985-01-07/.test(k)), 'a failure is not stored').toBe(false);
        const failed = page.locator('table.tbl tbody td.mb-bbev-cell[data-mb-bbev-date="1985-01-07"] .mb-bbev-g[data-s="fail"]');
        await revealPastStickyColumn(page, failed);
        await failed.click();
        await expect.poll(async () => (await cells(page))['1985-01-07'].s, { timeout: 30000 }).toBe('found');
        c = await cells(page);
        expect(c['1985-01-10'].s).toBe('none');
        expect(errors).toEqual([]);
    });

    test('the late answers reach an active filter: an MBID typed before the lookup finds its row once answered', async ({ page }) => {
        // Typed FIRST, answered after: the row can only appear if the late
        // write invalidates the cached filter results and re-runs the filter
        // (docs/claude/filter-and-cache-invariants.md).
        const { errors } = await openYear(page, { settings: { sa_bb_mb_event_lookup: false } });
        const input = columnFilterInput(page, 1);
        await expect(page.locator('table.tbl thead tr:first-child th').nth(1)).toHaveAttribute('data-col-name', 'MB-Event');
        await input.focus();
        await input.pressSequentially(idOf('1985-01-13'));
        await expect.poll(() => page.locator('table.tbl tbody tr:visible').count(), { timeout: 15000 }).toBe(0);
        await page.evaluate(() => document.querySelector('table.tbl thead .mb-bbmbev-col-hdr-btn').click());
        await expect.poll(() => page.locator('table.tbl tbody tr:visible').count(), { timeout: 30000 }).toBe(1);
        expect(errors).toEqual([]);
    });

    test('with the lookup off nothing is asked; ▶ MB in the header runs it', async ({ page }) => {
        const { errors } = await openYear(page, { settings: { sa_bb_mb_event_lookup: false } });
        await page.evaluate(() => new Promise(r => setTimeout(r, 1500)));
        expect(await mbAsked(page)).toEqual({ url: 0, year: 0, name: 0, event: 0 });
        expect((await cells(page))['1985-01-13'].s).toBe('idle');
        const btn = page.locator('table.tbl thead .mb-bbmbev-col-hdr-btn').first();
        await expect(btn).toHaveAttribute('aria-pressed', 'false');
        await revealPastStickyColumn(page, btn);
        await btn.click();
        await expect.poll(() => unsettled(page), { timeout: 30000 }).toBe(0);
        expect((await cells(page))['1985-01-13'].s).toBe('found');
        await expect(btn).toHaveAttribute('aria-pressed', 'true');
        expect(errors).toEqual([]);
    });
});
