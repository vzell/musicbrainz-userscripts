'use strict';

// release-tracks: rows from several concerts on one medium, and event data
// that disagrees with itself (org/live-bootleg.org item 3).
//
// Fixture: release d390b4ff-38ab-4783-99ef-2c4d338e016b "Berlin Night", the
// server's raw HTML (scripts/fetch-release-fixture.js). Three CD media; most
// tracks from "1996‐04‐19: Saal 1, ICC Berlin, Berlin, Germany", a few from
// "1992‐06‐26: Festhalle, Frankfurt, Germany". Places on record: "Saal 1",
// "Internationales Congress Centrum Berlin" and "Festhalle Frankfurt".
//
// ── What each test pins ─────────────────────────────────────────────────────
//
//  1. PLACE vs VENUE. The place name must equal the comment location's first
//     part. "Saal 1" passes; "Festhalle Frankfurt" ("Festhalle, Frankfurt, …")
//     and "Internationales Congress Centrum Berlin" ("Saal 1, …") are flagged.
//     Asserted as the exact set of flagged place names, so a rule that flags
//     everything or nothing both fail.
//  2. EVENT vs COMMENT. The real data agrees everywhere, which is asserted
//     first; a comment edited in the fixture HTML then must flag exactly
//     its own row's event cell.
//  3. EVENTS PER MEDIUM. The 🎪 badge and the 📊 section count events per
//     sub-table from SOURCE rows, so a filter hiding one event cannot change
//     them.
//  4. PERFORMER is live-date checked like Vocals.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const RELEASE_URL = 'https://musicbrainz.org/release/d390b4ff-38ab-4783-99ef-2c4d338e016b';
const FIXTURE = path.join(__dirname, 'release-tracks-multi-event.html');

/**
 * Loads the release fixture (optionally rewritten) and runs "Show all".
 *
 * @param {import('@playwright/test').Page} page
 * @param {function(string): string} [rewrite] - Applied to the fixture HTML.
 */
async function open(page, rewrite = null) {
    // Network-free, and essential here: this fixture's bundle hashes are
    // current, so MusicBrainz's own release script would download and
    // re-render the tracklist from JSON, dropping the comments
    // scripts/build-multi-event-fixture.py put into the server markup.
    await page.context().route('https://static.metabrainz.org/**', (route) => route.abort('blockedbyclient'));
    let body = null;
    if (rewrite) body = rewrite(fs.readFileSync(FIXTURE, 'utf8'));
    const serve = (route) => (body !== null
        ? route.fulfill({ body, contentType: 'text/html' })
        : route.fulfill({ path: FIXTURE, contentType: 'text/html' }));
    if (body !== null) {
        const tmp = path.join(__dirname, '..', '..', 'test-results', `multi-event-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
        fs.mkdirSync(path.dirname(tmp), { recursive: true });
        fs.writeFileSync(tmp, body);
        await loadUserscriptPage(page, { url: RELEASE_URL, fixtureFile: tmp, testMode: true });
    } else {
        await loadUserscriptPage(page, { url: RELEASE_URL, fixtureFile: FIXTURE, testMode: true });
    }
    await page.route('https://musicbrainz.org/release/**', serve);
    await page.click('button[data-label="Show all Tracks for Release"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
    const master = page.locator('.mb-master-toggle');
    if (await master.count() && (await master.getAttribute('data-state')) === 'collapsed') {
        await master.click();
    }
}

/**
 * Every rendered cell of column `col` carrying finding `id`, as the column's
 * linked names (or text), in document order.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} col
 * @param {string} id
 * @returns {Promise<{flagged: string[], tips: string[], total: number}>}
 */
const findingCells = (page, col, id) => page.evaluate(([c, f]) => {
    const flagged = [];
    const tips = [];
    let total = 0;
    document.querySelectorAll('table.tbl').forEach((tbl) => {
        const idx = Array.from(tbl.querySelectorAll('thead tr:first-child th')).findIndex((t) => t.dataset.colName === c);
        if (idx < 0) return;
        tbl.querySelectorAll('tbody tr').forEach((tr) => {
            const td = tr.cells[idx];
            if (!td) return;
            total++;
            if (!(td.dataset.mbFindings || '').split(' ').includes(f)) return;
            const names = Array.from(td.querySelectorAll('a[href*="/place/"] bdi, a[href*="/event/"] bdi')).map((b) => b.textContent);
            flagged.push(names.join(' | ') || td.textContent.trim());
            tips.push(td.title);
        });
    });
    return { flagged, tips, total };
}, [col, id]);

const SAAL = '1996‐04‐19: Saal 1, ICC Berlin, Berlin, Germany';
const FESTHALLE = '1992‐06‐26: Festhalle, Frankfurt, Germany';
const LOCAL_HERO = '<a href="/recording/50902687-bafd-47b3-9a76-d7a9896ecf98"><bdi>Local Hero</bdi></a>';
const INTRO_COMMENT = '<a href="/recording/22bd119e-62a0-488c-a840-5fcc2ae3296b"><bdi>[intro]</bdi></a> <span class="comment">(<bdi>live, 1996‐04‐19:';

/**
 * Replaces exactly one occurrence of `find` in `html`.
 *
 * @param {string} html
 * @param {string} find
 * @param {string} replace
 * @returns {string}
 */
function once(html, find, replace) {
    const at = html.indexOf(find);
    if (at < 0 || html.indexOf(find, at + 1) >= 0) throw new Error(`expected exactly one "${find.slice(0, 60)}"`);
    return html.slice(0, at) + replace + html.slice(at + find.length);
}

/**
 * Badge text and the class of the element before it, per sub-table name.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object<string, ?{text: string, tip: string, after: string}>>}
 */
const badges = (page) => page.evaluate(() => Object.fromEntries(Array.from(document.querySelectorAll('table.tbl')).map((t) => {
    let h3 = t.previousElementSibling;
    while (h3 && h3.tagName !== 'H3') h3 = h3.previousElementSibling;
    const name = h3 && (h3.querySelector('[data-table-name]') || {}).dataset?.tableName;
    const b = h3 && h3.querySelector('.mb-medium-events-badge');
    return [name, b ? { text: b.textContent, tip: b.title, after: (b.previousElementSibling || {}).className || '' } : null];
})));

/**
 * The open 📊 sections of one column on one table, `{label: {item: count}}`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} col
 * @param {number} tableIndex
 * @returns {Promise<Object<string, Object<string, number>>>}
 */
async function sectionsOf(page, col, tableIndex) {
    const sections = await page.evaluate(([c, i]) => window.__saTest.getUniqDropSections(c, i), [col, tableIndex]);
    return Object.fromEntries((sections || []).map((x) => [x.label, Object.fromEntries(x.items.map((i) => [i.label, i.count]))]));
}

/**
 * Event keys of the rendered rows of one table.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} tableIndex
 * @returns {Promise<string[]>}
 */
const visibleKeys = (page, tableIndex) => page.evaluate((i) => Array.from(
    document.querySelectorAll('table.tbl')[i].querySelectorAll('tbody tr'))
    .filter((r) => r.style.display !== 'none').map((r) => r.dataset.mbEventKey || ''), tableIndex);

test.describe('release-tracks: event consistency (org/live-bootleg.org 3)', () => {
    let pageErrors;

    test.beforeEach(({ page }) => {
        pageErrors = [];
        page.on('pageerror', (e) => pageErrors.push(String(e.stack || e.message)));
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('place vs comment venue: flags "Festhalle Frankfurt" and the ICC, never "Saal 1"', async ({ page }) => {
        await open(page);
        const r = await findingCells(page, 'Recorded at place', 'rec-place-mismatch');
        expect(r.total, 'vacuity guard: the column was built').toBe(38);
        expect([...new Set(r.flagged)].sort()).toEqual(['Festhalle Frankfurt', 'Internationales Congress Centrum Berlin']);
        expect(r.flagged, 'the exact cells: 3 at the ICC, 2 at the Festhalle').toHaveLength(5);
        expect(r.tips).toContain('❌ Recorded at place differs from the comment venue: comment venue "Festhalle", place "Festhalle Frankfurt"');
    });

    test('event vs comment: the real data agrees; one edited comment flags only its own row', async ({ page }) => {
        await open(page);
        expect((await findingCells(page, 'Recorded at event', 'rec-event-mismatch')).flagged).toEqual([]);

        await open(page, (html) => once(html, INTRO_COMMENT, INTRO_COMMENT.replace('1996‐04‐19:', '1996‐04‐20:')));
        const r = await findingCells(page, 'Recorded at event', 'rec-event-mismatch');
        expect(r.flagged).toEqual([SAAL]);
        expect(r.tips[0]).toBe(`❌ Recorded at event differs from the comment: comment "1996‐04‐20: Saal 1, ICC Berlin, Berlin, Germany", event "${SAAL}"`);
    });

    test('🎪 badge: only the medium that mixes events, filter-proof', async ({ page }) => {
        await open(page);
        const b = await badges(page);
        expect(b['1 - CD']).toBeNull();
        expect(b['2 - CD']).toBeNull();
        expect(b['3 - CD']).toMatchObject({ text: '🎪 2 events' });
        expect(b['3 - CD'].tip).toBe(`Rows from 2 events on this medium\n11 rows: ${SAAL}\n2 rows: ${FESTHALLE}`);

        // A filter that leaves only the Berlin rows must not take the badge
        // away: it counts source rows. "Saal 1" is in every Berlin comment.
        await page.fill('#mb-global-filter-input', 'Saal 1');
        await expect.poll(async () => (await visibleKeys(page, 2)).every((k) => k === SAAL), { timeout: 15000 }).toBe(true);
        expect((await visibleKeys(page, 2)).length, 'the Festhalle rows are filtered out').toBe(11);
        expect((await badges(page))['3 - CD']).toMatchObject({ text: '🎪 2 events' });
    });

    test('🎪 badge sits right after the ⏳ pending-edits badge', async ({ page }) => {
        await open(page, (html) => once(html, LOCAL_HERO, `<span class="mp">${LOCAL_HERO}</span>`));
        await expect(page.locator('.mb-subtable-pending-edits-btn').first(), 'vacuity guard: ⏳ is shown').toBeVisible();
        expect((await badges(page))['3 - CD']).toMatchObject({ text: '🎪 2 events', after: 'mb-subtable-pending-edits-btn' });
    });

    test('📊 "Events on this medium": counts, only on a mixed medium, ticking filters', async ({ page }) => {
        await open(page);
        expect((await sectionsOf(page, 'Disambiguation', 0))['Event info - Events on this medium']).toBeUndefined();
        expect((await sectionsOf(page, 'Disambiguation', 2))['Event info - Events on this medium']).toEqual({
            [`» event: ${FESTHALLE}`]: 2,
            [`» event: ${SAAL}`]: 11,
        });
        const ok = await page.evaluate((label) => {
            const sec = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
                .find((x) => x.querySelector('.mb-uniq-section-label')?.textContent === 'Event info - Events on this medium');
            const el = sec && Array.from(sec.querySelectorAll('.mb-col-uniq-item')).find((e) => e.textContent.includes(label));
            if (!el) return false;
            el.click();
            return true;
        }, FESTHALLE);
        expect(ok, 'the entry exists').toBe(true);
        await expect.poll(async () => (await visibleKeys(page, 2)), { timeout: 15000 }).toEqual([FESTHALLE, FESTHALLE]);
    });

    test('Performer: a different date is ❌, a missing one ⚠️, like Vocals', async ({ page }) => {
        const PERF = '<dt>performer:</dt><dd><span class="artistlink"></span>';
        await open(page, (html) => {
            const first = html.indexOf(PERF);
            const second = html.indexOf(PERF, first + 1);
            if (first < 0 || second < 0) throw new Error('two performer credits expected');
            const dateAt = (from) => html.indexOf('<!-- -->(on 1992-06-26)</dd>', from);
            const a = dateAt(first);
            const b = dateAt(second);
            return html.slice(0, a) + '<!-- -->(on 1992-06-27)</dd>' + html.slice(a + 28, b) + '</dd>' + html.slice(b + 28);
        });
        const flags = await page.evaluate(() => {
            const out = [];
            document.querySelectorAll('table.tbl').forEach((t) => {
                const idx = Array.from(t.querySelectorAll('thead tr:first-child th')).findIndex((h) => h.dataset.colName === 'Performer');
                t.querySelectorAll('tbody tr').forEach((r) => {
                    const f = r.cells[idx] && r.cells[idx].querySelector('.mb-live-date-flag');
                    if (f) out.push(f.textContent.trim());
                });
            });
            return out.sort();
        });
        expect(flags).toEqual(['⚠️', '❌']);
    });
});
