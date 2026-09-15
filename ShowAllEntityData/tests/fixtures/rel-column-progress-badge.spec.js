'use strict';

// Relationships column: the done/total progress badge on the ▶🔗 header toggle
// (PERFORMANCE.org Step 36, item 4 of org/relationships.org — "is anything still
// left to fetch?" without the debug console).
//
// ── What is pinned, and the adjacent property it must not be confused with ──
//
// The badge is CSS generated content — `::after { content: attr(data-rel-progress) }`
// on `.mb-rel-col-hdr-btn` — never header TEXT. The <th> text is read by a couple
// of dozen places (colName derivation, export, the uniq dropdown); a text badge
// would also "show the right number" while corrupting every one of them, so the
// header's own text nodes are asserted to be free of it.
//
// It counts DISTINCT entities done, out of distinct entities in THAT table, and
// must follow every writer: a click, a bulk expand, a failure (not done), and a
// collapse (back to zero). A badge that only refreshed on expand would pass a
// test that only expands — so each writer gets its own assertion.
//
// Network-free: every `**/ws/2/**` request is intercepted.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { clickMasterToggleAndExpandAll, collectPageErrors } = require('../support/liveAssertions');

// "Bruce Springsteen Studio Collection" — 12 releases, 12 distinct MBIDs,
// `tableMode: 'single'`, no browse source.
const SERIES = {
    url: 'https://musicbrainz.org/series/aa3694d3-a3d0-48ed-8f07-5b576de87908',
    shell: path.join(__dirname, '..', 'snapshots', 'series-releases', 'raw.html'),
    showAllLabel: 'Show all Releases for Series',
    urlGlob: 'https://musicbrainz.org/series/**',
};
const SERIES_ROWS = 12;

// "Tougher Than the Rest" — Official 6 + Promotion 1, `tableMode: 'multi'`.
const RG = {
    url: 'https://musicbrainz.org/release-group/f83d2211-dd81-4b1e-9a02-e89733891e1c',
    shell: path.join(__dirname, '..', 'snapshots', 'releasegroup-releases', 'raw.html'),
    showAllLabel: 'Show all Releases for ReleaseGroup',
    urlGlob: 'https://musicbrainz.org/release-group/**',
};

const OK_BODY = JSON.stringify({
    relations: [{
        'target-type': 'url',
        type: 'discogs',
        url: { resource: 'https://www.discogs.com/release/1' },
    }],
});
const NO_CONTENT = ['none', 'normal'];

/**
 * Loads a shell with the Relationships column on, routes WS/2 through
 * `respond`, and clicks "Show all".
 *
 * @param {import('@playwright/test').Page} page
 * @param {{url: string, shell: string, showAllLabel: string, urlGlob: string,
 *          settings?: Object<string, *>, respond?: function(string): ?{status?: number}}} opts
 * @returns {Promise<string[]>} Live list of intercepted WS/2 URLs.
 */
async function loadRelPage(page, { url, shell, showAllLabel, urlGlob, settings, respond }) {
    const ws2 = [];
    await loadUserscriptPage(page, {
        url,
        fixtureFile: shell,
        testMode: true,
        settingsOverride: { sa_enable_relationships_column: true, ...(settings || {}) },
    });
    await page.route('**/ws/2/**', (route) => {
        const u = route.request().url();
        ws2.push(u);
        const r = (respond && respond(u)) || {};
        if (r.status && r.status !== 200) {
            return route.fulfill({ status: r.status, contentType: 'text/plain', body: 'Service Unavailable' });
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: OK_BODY });
    });
    await page.route(urlGlob, (route) => route.fulfill({ path: shell, contentType: 'text/html' }));
    await page.click(`button[data-label="${showAllLabel}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
    return ws2;
}

/**
 * Every Relationships header toggle's badge, in document order.
 *
 * @returns {Promise<Array<{attr: ?string, after: string, title: string, headerText: string}>>}
 */
const readBadges = (page) => page.evaluate(() =>
    Array.from(document.querySelectorAll('table.tbl thead .mb-rel-col-hdr-btn')).map((btn) => {
        const th = btn.closest('th');
        const textNodes = Array.from(th.querySelectorAll('*')).concat([th])
            .flatMap((el) => Array.from(el.childNodes))
            .filter((n) => n.nodeType === Node.TEXT_NODE)
            .map((n) => n.textContent.trim())
            .filter(Boolean)
            .join('|');
        return {
            attr: btn.getAttribute('data-rel-progress'),
            after: getComputedStyle(btn, '::after').content,
            title: btn.title,
            headerText: textNodes,
        };
    }));

const rowMbids = (page) => page.evaluate(() => Array.from(
    document.querySelectorAll('table.tbl tbody td.mb-rel-cell[data-mbid]')).map((td) => td.dataset.mbid));

const pendingTotal = (page) => page.evaluate(
    () => window.__saTest.relTableStates().reduce((n, t) => n + t.pending, 0));

/** Clicks a cell at its right edge, away from any icon link. */
async function clickCellEdge(page, mbid) {
    const loc = page.locator(`table.tbl tbody td.mb-rel-cell[data-mbid="${mbid}"]`);
    const box = await loc.boundingBox();
    await loc.click({ position: { x: Math.max(1, box.width - 3), y: Math.floor(box.height / 2) } });
}

const toggle = 'thead .mb-rel-col-hdr-btn';

test.describe('Relationships column: done/total progress badge on the header toggle', () => {
    let pageErrors;

    test.beforeEach(async ({ page }) => {
        pageErrors = collectPageErrors(page);
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('a collapsed table shows 0/N as generated content, never as header text', async ({ page }) => {
        const ws2 = await loadRelPage(page, { ...SERIES, settings: { sa_rel_collapse_threshold: 2 } });
        const [badge] = await readBadges(page);
        expect(badge.attr).toBe(`0/${SERIES_ROWS}`);
        expect(badge.after).toBe(`"0/${SERIES_ROWS}"`);
        expect(badge.headerText, 'the <th> text nodes stay free of the badge').not.toContain('/');
        expect(badge.headerText).toContain('Relationships');
        expect(ws2).toHaveLength(0);
    });

    test('a hand-loaded row moves the badge; a complete table drops it; a collapse resets it',
        async ({ page }) => {
            await loadRelPage(page, { ...SERIES, settings: { sa_rel_collapse_threshold: 2 } });
            const mbids = await rowMbids(page);

            await clickCellEdge(page, mbids[0]);
            await expect.poll(async () => (await readBadges(page))[0].attr, { timeout: 15000 })
                .toBe(`1/${SERIES_ROWS}`);

            await page.click(toggle);                                   // expand: fetch the rest
            await expect.poll(() => pendingTotal(page), { timeout: 40000 }).toBe(0);
            await expect.poll(async () => (await readBadges(page))[0].attr, { timeout: 5000 }).toBeNull();
            expect(NO_CONTENT, 'no badge once everything is loaded').toContain((await readBadges(page))[0].after);

            await page.click(toggle);                                   // collapse: empty again
            await expect.poll(async () => (await readBadges(page))[0].attr, { timeout: 5000 })
                .toBe(`0/${SERIES_ROWS}`);
        });

    test('a failed row is not counted as done, and the toggle tooltip says so', async ({ page }) => {
        let failMbid = null;
        await loadRelPage(page, {
            ...SERIES,
            settings: { sa_rel_collapse_threshold: 2 },
            respond: (u) => (failMbid && u.includes(failMbid) ? { status: 503 } : null),
        });
        failMbid = (await rowMbids(page))[0];

        await page.click(toggle);
        // Settle FIRST — every other row done and the failing row marked failed —
        // and only then read the badge. Polling the badge alone for "11/12" passes
        // transiently while the failing row is still pending, which is how a
        // "failed counts as done" mutation slipped past this assertion and was
        // caught only by the tooltip check below.
        await expect.poll(() => page.evaluate((m) => {
            const cells = Array.from(document.querySelectorAll('table.tbl tbody td.mb-rel-cell[data-mbid]'));
            const fail = cells.find((td) => td.dataset.mbid === m);
            const othersDone = cells.filter((td) => td.dataset.mbid !== m)
                .every((td) => td.dataset.relDone === '1');
            return !!(fail && fail.dataset.relError) && othersDone;
        }, failMbid), { timeout: 60000 }).toBe(true);
        await expect.poll(async () => (await readBadges(page))[0].attr, { timeout: 5000 })
            .toBe(`${SERIES_ROWS - 1}/${SERIES_ROWS}`);
        await expect.poll(async () => (await readBadges(page))[0].title, { timeout: 5000 })
            .toContain('1 failed');
    });

    test('multi-table: each sub-table carries its own badge', async ({ page }) => {
        await loadRelPage(page, { ...RG, settings: { sa_rel_collapse_threshold: 3 } });
        await clickMasterToggleAndExpandAll(page);
        // Official (6) starts collapsed; Promotion (1) is expanded and fetches.
        await expect.poll(async () => (await readBadges(page)).map((b) => b.attr), { timeout: 15000 })
            .toEqual(['0/6', null]);
    });
});
