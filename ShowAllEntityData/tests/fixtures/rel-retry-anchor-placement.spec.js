'use strict';

// WHERE the Relationships retry controls land, not whether they exist.
//
// ── The defect ──────────────────────────────────────────────────────────────
//
// `_relRetryAnchorFor()` resolved its heading with a `previousElementSibling`
// walk from the table and then anchored on
// `heading.querySelector('button:last-of-type')`. Both halves were wrong, and
// each produced a different symptom:
//
//   MISSING    MusicBrainz wraps a merge-able listing's table in
//              `<form action="/<entity>/merge_queue…"><nav></nav><table>`, so
//              the sibling walk ran out of siblings INSIDE the form and
//              returned null. `_relCreateRetryButtons()`'s `if (sb && a)` then
//              discarded the button it had just built — and with it both `⚠⟳`
//              controls, which anchor on `#mb-rel-retry-{i}`/`-0`. Measured on
//              debug/artist-works-pending-edits-uncollapsed.html at 9.99.1130:
//              5 `td.mb-rel-cell`, zero `mb-rel-retry-*`.
//
//   MISPLACED  `button:last-of-type` means "the first <button> in document
//              order that is the last <button> among ITS OWN parent's
//              children" — not "the heading's last button". On an <h3> with a
//              sub-table filter that is `#mb-stf-<col>-clear`, several levels
//              down, so the control was appended INSIDE
//              `span.mb-stf-input-wrap`. Measured on
//              debug/right-flags-release-events.html (place-performances):
//              4 of 5 sub-tables.
//
// ── Why this spec asserts the PARENT ELEMENT ────────────────────────────────
//
// `rel-retry-failed-only.spec.js` names `#mb-rel-retry-0` and asserts it
// exists. On its own `series-releases` shell with artwork off it DID exist —
// buried inside `#mb-filter-container` — so that spec stayed green through the
// whole life of both defects. Existence is the adjacent property; the
// guarantee is the parent element and the position within it.
//
// Every `mb-rel-retry-{i}` in every saved snapshot in debug/ was created by
// `_artCreateOrUpdateRetryButton()` anchoring on the artwork run, never by the
// fallback under test. Artwork is therefore OFF in every test here, which is
// the shipped default for a fixture (`FIXTURE_SETTINGS_OVERRIDE`) and also the
// real configuration of a page like an artist's Works tab, which has no
// cover art to show at all.
//
// Network-free: every `**/ws/2/**` request is intercepted.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { collectPageErrors } = require('../support/liveAssertions');

// Single-table, and the table is wrapped in the real <form> — the shape the
// sibling walk could not escape. 4 rows, each linking /work/<mbid>.
const WORKS_URL = 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f/works';
const WORKS_FIXTURE = path.join(__dirname, 'artist-works-pending-edits.html');

// Multi-table: artist-releasegroups, three <h3> sub-tables. Borrowed from
// pending-edits-filter.spec.js — same markup, a different feature.
const RG_URL = 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f?all=1&va=0';
const RG_FIXTURE = path.join(__dirname, 'pending-edits-multi.html');

const OK_BODY = JSON.stringify({
    relations: [{
        'target-type': 'url',
        type: 'discogs',
        url: { resource: 'https://www.discogs.com/release/1' },
    }],
});

/**
 * Serves `fixtureFile` at `url` with the Relationships column ON, artwork OFF
 * and every WS/2 answer either OK or 503, then presses the page's fetch button.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{url: string, fixtureFile: string, label: string, routeGlob: string,
 *          failing?: Set<string>}} opts
 * @returns {Promise<string[]>} The live list of intercepted WS/2 URLs.
 */
async function render(page, { url, fixtureFile, label, routeGlob, failing }) {
    const ws2 = [];
    await loadUserscriptPage(page, {
        url, fixtureFile, testMode: true,
        settingsOverride: {
            sa_enable_caa_pics: false,
            sa_enable_relationships_column: true,
            sa_rel_browse_batch_enable: false,
            sa_rel_collapse_threshold: 0,
        },
    });
    await page.route('**/ws/2/**', (route) => {
        const u = route.request().url();
        ws2.push(u);
        if (failing && [...failing].some((m) => u.includes(m))) {
            return route.fulfill({ status: 503, contentType: 'text/plain', body: 'Service Unavailable' });
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: OK_BODY });
    });
    await page.route(routeGlob, (route) => route.fulfill({ path: fixtureFile, contentType: 'text/html' }));
    await page.click(`button[data-label="${label}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
    return ws2;
}

/**
 * Where a control sits: its parent's tag/id/class, and the ids of its parent's
 * element children in order, so a misplacement reads as a diff rather than as
 * a bare `false`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} id
 * @returns {Promise<?object>}
 */
const placement = (page, id) => page.evaluate((elId) => {
    const el = document.getElementById(elId);
    if (!el) return null;
    const p = el.parentElement;
    return {
        parentTag: p.tagName,
        parentClass: String(p.className || ''),
        parentId: p.id || '',
        siblings: Array.from(p.children).map(
            (c) => c.id || String(c.className || '').split(' ')[0] || c.tagName),
    };
}, id);

/** The `[id^="mb-rel-retry-"]` controls the page currently has, in document order. */
const relControlIds = (page) => page.evaluate(() =>
    Array.from(document.querySelectorAll('[id^="mb-rel-retry-"]')).map((el) => el.id));

test.describe('Relationships retry controls sit in their heading\'s control run', () => {
    let pageErrors;

    test.beforeEach(async ({ page }) => {
        pageErrors = collectPageErrors(page);
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('a <form>-wrapped single table still gets its 🔗⟳, in the h2 after the row count',
        async ({ page }) => {
            test.setTimeout(120000);
            await render(page, {
                url: WORKS_URL, fixtureFile: WORKS_FIXTURE,
                label: 'Show all Works for Artist',
                routeGlob: 'https://musicbrainz.org/artist/**/works*',
            });

            // The controls are built on a 200 ms timer after the render.
            await expect.poll(() => page.locator('#mb-rel-retry-0').count(),
                { timeout: 30000 }).toBe(1);

            const where = await placement(page, 'mb-rel-retry-0');
            expect(where, 'the control exists').not.toBeNull();
            // THE assertion. Before the fix this was null (the button was
            // discarded); a heading-text-based anchor would make it some
            // nested <span>.
            expect(where.parentTag, 'the control is a direct child of the heading')
                .toBe('H2');
            const statAt = where.siblings.indexOf('mb-row-count-stat');
            const btnAt = where.siblings.indexOf('mb-rel-retry-0');
            expect(statAt, `the h2 carries the row-count stat: ${JSON.stringify(where.siblings)}`)
                .toBeGreaterThan(-1);
            expect(btnAt, 'the control sits after the row-count stat, where the artwork run goes')
                .toBe(statAt + 1);
        });

    test('the ⚠⟳ controls follow it into the same run', async ({ page }) => {
        test.setTimeout(120000);
        // Fail the first work's lookup so both the page-wide and the per-table
        // failed-retry controls have something to count.
        const failing = new Set(['11111111-1111-4111-8111-111111111111']);
        await render(page, {
            url: WORKS_URL, fixtureFile: WORKS_FIXTURE,
            label: 'Show all Works for Artist',
            routeGlob: 'https://musicbrainz.org/artist/**/works*',
            failing,
        });

        await expect.poll(() => page.locator('#mb-rel-retry-failed').count(),
            { timeout: 60000 }).toBe(1);

        // All three are `mb-rel-retry-*`, so the segmented-pill CSS treats them
        // as one run only while they are contiguous siblings.
        const ids = await relControlIds(page);
        expect(ids, 'the whole family is present').toEqual(
            expect.arrayContaining(['mb-rel-retry-0', 'mb-rel-retry-failed']));
        for (const id of ids) {
            const where = await placement(page, id);
            expect(where.parentTag, `${id} is a direct child of the heading`).toBe('H2');
        }
        const run = (await placement(page, 'mb-rel-retry-0')).siblings
            .filter((s) => s.startsWith('mb-rel-retry-'));
        const all = (await placement(page, 'mb-rel-retry-0')).siblings;
        const first = all.indexOf(run[0]);
        expect(all.slice(first, first + run.length),
            `the run is contiguous: ${JSON.stringify(all)}`).toEqual(run);
    });

    test('each sub-table\'s 🔗⟳ is a direct child of its OWN h3', async ({ page }) => {
        test.setTimeout(120000);
        await render(page, {
            url: RG_URL, fixtureFile: RG_FIXTURE,
            label: '🧮 Artist RGs',
            routeGlob: `${RG_URL}*`,
        });

        await expect.poll(() => page.locator('#mb-rel-retry-0').count(),
            { timeout: 30000 }).toBe(1);

        // One per rendered sub-table, each in its own heading — not in the page
        // <h2> (that belongs to #mb-rel-retry-global) and not inside the
        // sub-table filter's input wrapper, which is where
        // `button:last-of-type` used to put them.
        const perTable = await page.evaluate(() => {
            const h3s = Array.from(document.querySelectorAll('h3.mb-toggle-h3'));
            return h3s.map((h3, i) => {
                const btn = document.getElementById('mb-rel-retry-' + i);
                return {
                    i,
                    present: !!btn,
                    ownChild: !!btn && btn.parentElement === h3,
                    parent: btn ? (btn.parentElement.id
                        || String(btn.parentElement.className || '').split(' ')[0]
                        || btn.parentElement.tagName) : null,
                };
            });
        });
        expect(perTable.length, 'the fixture renders sub-tables').toBeGreaterThan(1);
        perTable.forEach((r) => {
            expect(r.present, `sub-table ${r.i} has a 🔗⟳`).toBe(true);
            expect(r.ownChild,
                `sub-table ${r.i}'s 🔗⟳ is a child of its own h3, not ${r.parent}`).toBe(true);
        });

        // And the page-wide one stays where it belongs.
        const g = await placement(page, 'mb-rel-retry-global');
        expect(g, 'a multi-table page gets the global control').not.toBeNull();
        expect(g.parentTag, 'the global control lives on the page h2').toBe('H2');
    });
});
