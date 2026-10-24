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
const { columnFilterInput, typeGlobalFilter } = require('../support/filterSortAssertions');
const { findingRow, clickFinding, findingRowState } = require('../support/findingsMenu');

const NO_LINK = ['1985-01-07', '1985-01-08'];
const NO_EVENT = ['1985-01-10', '1985-01-15'];
// 1985-01-24's anchor is linked from 01-23's event (a wrong link in
// MusicBrainz): 01-24 is found by date, and its event links no anchor.
const WRONG_ANCHOR = { '1985-01-24': '1985-01-23' };

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
    await page.addInitScript(([noLink, noEvent, failYearN, entries, wrongAnchor]) => {
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
                    .map(r => ({ resource: r, relations: [{ type: 'review', event: ev(wrongAnchor[known.get(r)] || known.get(r)) }] }));
                return urls.length ? json(200, { 'url-count': urls.length, 'url-offset': 0, urls }) : json(404, { error: 'Not Found' });
            }
            const one = u.pathname.match(/^\/ws\/2\/event\/([0-9a-f-]+)$/);
            if (one) {
                // The id carries its date (idOf()); the card's lookup gets a
                // place and the performers, the url-rels lookup no links.
                const d = one[1].slice(-10, -2);
                const date = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
                const rels = /place-rels/.test(u.searchParams.get('inc') || '') ? [
                    { type: 'held at', direction: 'backward', 'target-type': 'place', place: { id: 'p1', name: 'Carolina Coliseum' } },
                    { type: 'main performer', direction: 'backward', 'target-type': 'artist', artist: { id: '70248960-cb53-4ea4-943a-edb18f7d336f', name: 'Bruce Springsteen' } },
                ] : [];
                return json(200, { ...ev(date), relations: rels });
            }
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
    }, [NO_LINK, NO_EVENT, failYear, ENTRIES, WRONG_ANCHOR]);
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
        expect(await mbAsked(page)).toEqual({ url: 1, year: 1, name: NO_EVENT.length + unknown, event: NO_LINK.length + 1 });
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

// org/TODO.org "Some enhancements" f (2026-10-24): the found glyph's card is
// the MusicBrainz event's, loaded through GM from Brucebase, with the row's
// Brucebase check under it; Space pins it into the window.
test.describe('bb-year: the MB-Event glyph\'s card (2026-10-24)', () => {
    const glyph = (page, date) => page.locator(`table.tbl tbody td.mb-bbev-cell[data-mb-bbev-date="${date}"] a.mb-bbev-link`);
    /**
     * Ctrl+hover on a row's glyph, the window wide enough to reach it.
     * @param {import('@playwright/test').Page} page
     * @param {string} date
     * @returns {Promise<void>}
     */
    async function hoverGlyph(page, date) {
        await page.mouse.move(0, 0);
        await revealPastStickyColumn(page, glyph(page, date));
        await page.keyboard.down('Control');
        await glyph(page, date).hover();
        await page.keyboard.up('Control');
    }
    test.use({ viewport: { width: 1920, height: 1000 } });

    test('found by its link: the event card (name, place, line-up), how it was found, the link this entry\'s; Space: the window', async ({ page }) => {
        const { errors } = await openYear(page);
        await expect.poll(() => unsettled(page), { timeout: 30000 }).toBe(0);
        await hoverGlyph(page, '1985-01-13');
        const peek = page.locator('#mb-dp-peek');
        await expect(peek).toContainText('1985‐01‐13: Somewhere');
        await expect(peek).toContainText('Carolina Coliseum');
        await expect(peek).toContainText('Bruce Springsteen');
        await expect(peek).toContainText('Found by its Brucebase link');
        await expect(peek).toContainText('brucebase.wikidot.com/1985#130185 ✓ this entry');
        const asked = await page.evaluate(() => (window.__gmXhrLog || []).filter(r => /\/ws\/2\/event\/[0-9a-f-]+\?inc=artist-rels/.test(r.url)).length);
        expect(asked, 'one lookup for the card').toBe(1);
        await page.keyboard.press('Space');
        const win = page.locator('#mb-dp-dialog');
        await expect(win).toContainText('1985‐01‐13: Somewhere');
        await expect(win).toContainText('✓ this entry');
        expect(errors).toEqual([]);
    });

    test('found by date with no Brucebase link: the card warns; a wrong anchor: the card says ERROR, both links shown', async ({ page }) => {
        const { errors } = await openYear(page);
        await expect.poll(() => unsettled(page), { timeout: 30000 }).toBe(0);
        await hoverGlyph(page, '1985-01-07');
        const peek = page.locator('#mb-dp-peek');
        await expect(peek).toContainText('Found by date (search)');
        await expect(peek).toContainText('WARNING: the MusicBrainz event has no Brucebase link');
        await hoverGlyph(page, '1985-01-24');
        await expect(peek).toContainText('ERROR: the MusicBrainz event and this entry do not link each other');
        await expect(peek).toContainText('brucebase.wikidot.com/1985#240185');
        await expect(peek).toContainText('another event');
        expect(errors).toEqual([]);
    });

    test('off with the event preview setting: no card, no card lookup', async ({ page }) => {
        const { errors } = await openYear(page, { settings: { sa_bb_event_preview: false } });
        await expect.poll(() => unsettled(page), { timeout: 30000 }).toBe(0);
        await hoverGlyph(page, '1985-01-13');
        await page.evaluate(() => new Promise(r => setTimeout(r, 600)));
        await expect(page.locator('#mb-dp-peek')).toBeHidden();
        expect(await page.evaluate(() => (window.__gmXhrLog || []).filter(r => /inc=artist-rels/.test(r.url)).length)).toBe(0);
        expect(errors).toEqual([]);
    });
});

// org/TODO.org "Some enhancements" g (2026-10-24): the event's Brucebase
// link against the entry's own anchor. ERROR when they point elsewhere
// (1985-01-24: its anchor is linked from 01-23's event), WARNING when the
// event has none (01-07, 01-08). Late data: the rows are re-stamped as the
// answers come in. Pinned: the counts (from the page), the filter, the look,
// the tint setting, and survival across a filter re-render.
test.describe('bb-year: the MB-Event Brucebase-link findings (2026-10-24)', () => {
    const stamped = (page, id) => page.evaluate((fid) => Array.from(document.querySelectorAll('table.tbl tbody td.mb-bbev-cell'))
        .filter(td => (td.dataset.mbFindings || '').split(' ').includes(fid)).map(td => td.dataset.mbBbevDate), id);

    test('ERROR for a link to another entry, WARNING for none: counted, filtered, tinted', async ({ page }) => {
        const { errors } = await openYear(page);
        await expect.poll(() => unsettled(page), { timeout: 30000 }).toBe(0);
        await expect.poll(() => stamped(page, 'bb-mbev-link-mismatch')).toEqual(['1985-01-24']);
        expect((await stamped(page, 'bb-mbev-link-missing')).sort()).toEqual([...NO_LINK].sort());
        await expect.poll(async () => (await findingRow(page, 'error', 'bb-mbev-link-mismatch') || {}).count).toBe(1);
        await expect.poll(async () => (await findingRow(page, 'warn', 'bb-mbev-link-missing') || {}).count).toBe(NO_LINK.length);
        const look = await page.evaluate(() => {
            const td = document.querySelector('td.mb-bbev-cell[data-mb-bbev-date="1985-01-24"]');
            return { level: td.dataset.mbFinding, bg: getComputedStyle(td).backgroundColor, ring: getComputedStyle(td.querySelector('.mb-bbev-g')).boxShadow };
        });
        expect(look.level).toBe('error');
        expect(look.bg).not.toMatch(/^rgba?\(255, 255, 255/);
        expect(look.ring).toContain('rgb(155, 34, 24)');
        await clickFinding(page, 'bb-mbev-link-mismatch');
        await expect.poll(() => findingRowState(page, 'bb-mbev-link-mismatch')).toEqual({ visible: 1, withFinding: 1 });
        await clickFinding(page, 'bb-mbev-link-mismatch');
        await expect.poll(async () => (await findingRowState(page, null)).visible).toBeGreaterThan(80);
        expect(errors).toEqual([]);
    });

    test('the stamps survive a filter re-render; with the tint off the menu row stays, untinted', async ({ page }) => {
        const { errors } = await openYear(page, { settings: { sa_findings_tint_bb_mbev_link: false } });
        await expect.poll(() => unsettled(page), { timeout: 30000 }).toBe(0);
        await expect.poll(() => stamped(page, 'bb-mbev-link-mismatch')).toEqual(['1985-01-24']);
        expect(await page.evaluate(() => document.querySelector('td.mb-bbev-cell[data-mb-bbev-date="1985-01-24"]').dataset.mbFinding)).toBeUndefined();
        await expect.poll(async () => (await findingRow(page, 'error', 'bb-mbev-link-mismatch') || {}).count).toBe(1);
        await typeGlobalFilter(page, '1985-01-2');
        await expect.poll(() => stamped(page, 'bb-mbev-link-mismatch')).toEqual(['1985-01-24']);
        expect(errors).toEqual([]);
    });

    test('the settings switch each finding off', async ({ page }) => {
        const { errors } = await openYear(page, { settings: { sa_findings_bb_mbev_link_mismatch: false, sa_findings_bb_mbev_link_missing: false } });
        await expect.poll(() => unsettled(page), { timeout: 30000 }).toBe(0);
        await page.evaluate(() => new Promise(r => setTimeout(r, 400)));
        expect(await stamped(page, 'bb-mbev-link-mismatch')).toEqual([]);
        expect(await stamped(page, 'bb-mbev-link-missing')).toEqual([]);
        expect(await findingRow(page, 'error', 'bb-mbev-link-mismatch')).toBeUndefined();
        expect(errors).toEqual([]);
    });
});
