'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('../support/test');
const { clickToolbarItem } = require('../support/toolbarMenu');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { typeGlobalFilter, waitForFilterSettled } = require('../support/filterSortAssertions');

// "🗂 Sidebar as tables" (docs/claude/sidebar.md). A button on entity
// overview pages whose render is the sidebar's facts, external links and tags
// as ordinary groups. The guarantees pinned:
//   - the button is there on an artist and an event overview page, and not on
//     a page that is not an entity's overview;
//   - its render is exactly three groups with the right rows, read from the
//     sidebar: Artist information (one row per fact), External links (57, no
//     "View all relationships"), Tags (genres then tags, with votes);
//   - nothing of the page type it sits on applies: no discography groups, no
//     discography view buttons, no Relationships or CAA column (`replaceFeatures`);
//   - the global filter works on it like on any table;
//   - the sidebar itself is unchanged by it;
//   - no request is made for it.

const ARTIST_URL = 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f?all=1&va=0';
const ARTIST = path.join(__dirname, 'artist-releasegroups-live-titles.html');
const EVENT_URL = 'https://musicbrainz.org/event/3f2ca30a-7de4-4964-ad30-48376535fec8';
const EVENT = path.join(__dirname, 'event-overview.html');
const BTN = 'button[data-label="🗂 Sidebar as tables"]';

/**
 * Loads a page, counts the requests made after load in `reqs.n`, and returns
 * the sidebar's HTML before anything is pressed.
 * @param {import('@playwright/test').Page} page
 * @param {string} url
 * @param {string} fixture
 * @returns {Promise<{reqs: {n: number}, sidebar: string}>}
 */
async function open(page, url, fixture) {
    await loadUserscriptPage(page, { url, fixtureFile: fixture, testMode: true,
                                     settingsOverride: { sa_enable_caa_pics: false, sa_enable_relationships_column: false, sa_collabsable_sidebar: false } });
    const reqs = { n: 0 };
    page.on('request', (r) => { if (/musicbrainz\.org\//.test(r.url()) && r.resourceType() !== 'image') reqs.n++; });
    const sidebar = await page.evaluate(() => document.getElementById('sidebar').outerHTML);
    return { reqs, sidebar };
}

/** h3 group names and their row counts, in order. */
const groups = (page) => page.evaluate(() => Array.from(document.querySelectorAll('#content table.tbl')).map((t) => {
    let h = t.previousElementSibling;
    while (h && h.tagName !== 'H3') h = h.previousElementSibling;
    const name = h ? Array.from(h.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim() : '';
    return [name, t.querySelectorAll('tbody tr').length];
}));

/** A table's header texts. */
const heads = (page, i) => page.evaluate((k) => Array.from(document.querySelectorAll('#content table.tbl')[k].querySelectorAll('thead tr:first-child th'))
    .map((th) => (th.dataset.colName || th.textContent).replace(/[▲▼⇅↕]/g, '').trim().split('\n')[0]), i);

test.describe('🗂 Sidebar as tables', () => {
    test('on the artist page: three groups from the sidebar, nothing of the discography', async ({ page }) => {
        const { reqs, sidebar } = await open(page, ARTIST_URL, ARTIST);
        await expect(page.locator(BTN)).toHaveCount(1);
        const facts = await page.evaluate(() => document.querySelectorAll('#sidebar dl.properties > dt').length);
        await page.click(BTN);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        expect(await groups(page)).toEqual([['Artist information', facts], ['External links', 57], ['Tags', 10]]);
        await expect(page.locator('#content table.tbl')).toHaveCount(3);
        expect((await heads(page, 1)).slice(0, 5)).toEqual(['#', 'Site', 'Link', 'Kind', 'Details']);
        const firstLink = await page.evaluate(() => {
            const r = document.querySelectorAll('#content table.tbl')[1].querySelector('tbody tr');
            return { site: r.cells[1].textContent.trim(), href: r.cells[2].querySelector('a').getAttribute('href'), kind: r.cells[3].textContent.trim() };
        });
        expect(firstLink).toEqual({ site: 'brucespringsteen.net', href: 'https://brucespringsteen.net/', kind: 'Official' });
        const tagRow = await page.evaluate(() => Array.from(document.querySelectorAll('#content table.tbl')[2].querySelector('tbody tr').cells).map((c) => c.textContent.trim()));
        expect(tagRow.slice(1)).toEqual(['rock', 'Genre', '18']);
        // Nothing of artist-releasegroups: no view buttons, no Relationships/CAA column.
        await expect(page.locator('button', { hasText: 'Official Discography' })).toHaveCount(0);
        const allHeads = await page.evaluate(() => Array.from(document.querySelectorAll('#content table.tbl th')).map((th) => th.textContent));
        expect(allHeads.some((t) => /Relationships|CAA/.test(t))).toBe(false);
        // The sidebar is only read.
        expect(await page.evaluate(() => {
            const s = document.getElementById('sidebar').cloneNode(true);
            s.querySelectorAll('.mb-sb-count, .mb-sb-bar, li.mb-sbl-head, .mb-sb-h3-icon, .mb-toggle-icon').forEach((n) => n.remove());
            return s.querySelectorAll('ul.external_links > li > a').length;
        })).toBe(58);
        expect(sidebar).toContain('external_links');
        expect(reqs.n, 'no request for it').toBe(0);
    });

    test("with the Relationships column on, the page type's columns still stay out", async ({ page }) => {
        await loadUserscriptPage(page, { url: ARTIST_URL, fixtureFile: ARTIST, testMode: true,
                                         settingsOverride: { sa_enable_caa_pics: true, sa_enable_relationships_column: true, sa_collabsable_sidebar: false } });
        await page.click(BTN);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await expect(page.locator('#content table.tbl')).toHaveCount(3);
        const allHeads = await page.evaluate(() => Array.from(document.querySelectorAll('#content table.tbl thead th')).map((th) => th.textContent));
        expect(allHeads.filter((t) => /Relationships|CAA/.test(t)), "artist-releasegroups' injected columns").toEqual([]);
        expect(await page.evaluate(() => document.querySelectorAll('#content .mb-rel-col-hdr-btn, #content [data-caa-expand-btn]').length)).toBe(0);
    });

    test('the global filter works on it', async ({ page }) => {
        await open(page, ARTIST_URL, ARTIST);
        await page.click(BTN);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await waitForFilterSettled(page, () => typeGlobalFilter(page, 'Streaming'));
        const shown = await page.evaluate(() => Array.from(document.querySelectorAll('#content table.tbl')).map((t) =>
            Array.from(t.querySelectorAll('tbody tr')).filter((r) => r.style.display !== 'none').length));
        expect(shown[1], 'the twelve streaming links').toBe(12);
        expect(shown[0]).toBe(0);
    });

    test('on the event page too; not on a page that is not an overview', async ({ page }) => {
        await open(page, EVENT_URL, EVENT);
        await expect(page.locator(BTN)).toHaveCount(1);
        await page.click(BTN);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const g = await groups(page);
        expect(g[0][0]).toBe('Event information');
        expect(g[0][1]).toBeGreaterThan(0);
        // Only sidebar groups: the event overview's own features (its
        // relationship tables, eventDetailsToTables) must not run here too.
        expect(g.map((x) => x[0]).every((n) => ['Event information', 'External links', 'Tags'].includes(n)), JSON.stringify(g)).toBe(true);
        await page.goto('about:blank');
        await open(page, `${EVENT_URL}/aliases`, EVENT).catch(() => {});
        await expect(page.locator(BTN)).toHaveCount(0);
    });

    test('the switch removes the button', async ({ page }) => {
        await loadUserscriptPage(page, { url: ARTIST_URL, fixtureFile: ARTIST, testMode: true, settingsOverride: { sa_sidebar_tables_button: false } });
        await expect(page.locator('button[data-label="🧮 Artist RGs"]')).toHaveCount(1);
        await expect(page.locator(BTN)).toHaveCount(0);
    });
});

// ── Release, series, place, area and instrument (2026-10-14) ────────────────
// The same button on five more kinds (main's rel-<kind>-overview.html
// captures). Pinned per kind: the button is there; its render is only sidebar
// groups (every h3 is a sidebar heading), the first being the kind's facts with
// one row per fact; nothing is requested. The release has more lists than the
// other kinds: both facts lists, its labels, its release events and both
// external-links lists, each its own group. With the relationship tables off,
// place, area and instrument still have the button, and only it.
const OVERVIEWS = {
    release: ['https://musicbrainz.org/release/f50fcf09-4339-4e1c-91cd-e1d2a7b3a7bc', 'rel-release-overview.html', 'Release information'],
    series: ['https://musicbrainz.org/series/f4818e95-a515-4821-ad6d-270703f72dcf', 'rel-series-overview.html', 'Series information'],
    place: ['https://musicbrainz.org/place/6a59a67c-fcc5-491f-949c-bfc45bc97463', 'rel-place-overview.html', 'Place information'],
    area: ['https://musicbrainz.org/area/489ce91b-6658-3307-9877-795b68554c98', 'rel-area-overview.html', 'Area information'],
    instrument: ['https://musicbrainz.org/instrument/a1baa57d-6ab4-461e-89df-448d6fd2c597', 'rel-instrument-overview.html', 'Instrument information'],
};

/**
 * Opens one of the overview captures with MusicBrainz's own bundles blocked
 * and every request counted; `settings` go on top of the spec's defaults.
 * @param {import('@playwright/test').Page} page
 * @param {string} kind - A key of OVERVIEWS.
 * @param {object} [settings]
 * @returns {Promise<{reqs: {n: number}}>}
 */
async function openOverview(page, kind, settings = {}) {
    const [url, file] = OVERVIEWS[kind];
    await page.context().route('https://static.metabrainz.org/**', (route) => route.abort('blockedbyclient'));
    await loadUserscriptPage(page, { url, fixtureFile: path.join(__dirname, file), testMode: true,
                                     settingsOverride: { sa_enable_caa_pics: false, sa_enable_relationships_column: false, sa_collabsable_sidebar: false,
                                                         sa_enable_relationship_tables: true, sa_enable_release_tracks: true, ...settings } });
    const reqs = { n: 0 };
    page.on('request', (r) => { if (/musicbrainz\.org\//.test(r.url()) && r.resourceType() !== 'image') reqs.n++; });
    return { reqs };
}

/** The sidebar's own h2 texts (without our count). */
const sidebarHeads = (page) => page.evaluate(() => Array.from(document.querySelectorAll('#sidebar h2')).map((h) =>
    Array.from(h.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim()));

test.describe('🗂 Sidebar as tables on release, series, place, area and instrument pages', () => {
    for (const kind of Object.keys(OVERVIEWS)) {
        test(`${kind}: the button, only sidebar groups, nothing requested`, async ({ page }) => {
            const { reqs } = await openOverview(page, kind);
            await expect(page.locator(BTN)).toHaveCount(1);
            const facts = await page.evaluate(() => document.querySelectorAll('#sidebar dl.properties')[0].querySelectorAll(':scope > dt').length);
            const heads = await sidebarHeads(page);
            await page.click(BTN);
            await waitForRenderComplete(page, { waitForAutoResize: false });
            const g = await groups(page);
            expect(g[0]).toEqual([OVERVIEWS[kind][2], facts]);
            expect(g.every(([name, n]) => heads.includes(name) && n > 0), JSON.stringify(g)).toBe(true);
            await expect(page.locator('#content table.tbl')).toHaveCount(g.length);
            expect(reqs.n, 'no request for it').toBe(0);
        });
    }

    test('release: both facts lists, labels, release events and both external-links lists', async ({ page }) => {
        await openOverview(page, 'release');
        await page.click(BTN);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const names = (await groups(page)).map((x) => x[0]);
        expect(names.filter((n) => n !== 'Tags')).toEqual(['Release information', 'Additional details', 'Labels', 'Release events', 'External links', 'Release group external links']);
        const rowsOf = (name) => page.evaluate((nm) => {
            const t = Array.from(document.querySelectorAll('#content table.tbl')).find((tb) => {
                let h = tb.previousElementSibling;
                while (h && h.tagName !== 'H3') h = h.previousElementSibling;
                return h && Array.from(h.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim() === nm;
            });
            return Array.from(t.querySelectorAll('tbody tr')).map((r) => Array.from(r.cells).slice(0, 3).map((c) => c.textContent.trim()));
        }, name);
        expect(await rowsOf('Labels')).toEqual([['1', 'CBS', 'CBS 450227 2'], ['2', 'CBS', 'CDCBS 450227 2']]);
        expect(await rowsOf('Release events')).toEqual([['1', 'Europe', '1986-11-06']]);
        // No tracklist and no medium heading of release-tracks beside them.
        expect(await page.evaluate(() => document.querySelectorAll('#content table.medium, #content table.tbl.mb-medium').length)).toBe(0);    });

    test('with the relationship tables off: place, area and instrument keep the button, and only it', async ({ page }) => {
        for (const kind of ['place', 'area', 'instrument']) {
            await openOverview(page, kind, { sa_enable_relationship_tables: false });
            await expect(page.locator(BTN), kind).toHaveCount(1);
            await expect(page.locator('button[data-label^="Show all Relationships for"]'), kind).toHaveCount(0);
        }
        await page.click(BTN);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        expect((await groups(page))[0][0]).toBe('Instrument information');
    });

    // On the release: its own tracklist tables would stay beside the loaded
    // groups if the load did not run the converter.
    test('a Save to Disk → Load from Disk round trip loads the sidebar groups again', async ({ page, context }) => {
        await openOverview(page, 'release');
        await page.click(BTN);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const before = await groups(page);
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-sidebar-roundtrip-'));
        try {
            const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
            await clickToolbarItem(page, '#mb-save-to-disk-btn');
            await page.locator('#sa-sd-save-confirm').waitFor({ state: 'visible', timeout: 15000 });
            await page.click('#sa-sd-save-confirm');
            const download = await downloadPromise;
            const saved = path.join(tmpDir, download.suggestedFilename() || 'snapshot.json.gz');
            await download.saveAs(saved);

            const reopened = await context.newPage();
            await openOverview(reopened, 'release');
            await clickToolbarItem(reopened, '#mb-load-from-disk-btn');
            await reopened.locator('input[type="file"][accept*="json"]').setInputFiles(saved);
            const renderBtn = reopened.locator('#sa-render-no-filter-confirm');
            await renderBtn.waitFor({ state: 'attached', timeout: 15000 });
            await renderBtn.evaluate((el) => el.click());
            await waitForRenderComplete(reopened, { waitForAutoResize: false });
            expect(await groups(reopened)).toEqual(before);
            expect(await reopened.evaluate(() => document.querySelectorAll('#content table.medium').length), 'no tracklist beside them').toBe(0);
            // Under their own "Sidebar" heading, as after the press: not
            // inside the release's tracklist wrapper.
            expect(await reopened.evaluate(() => ({
                heading: !!document.querySelector('#content > h2.mb-sb-tables'),
                topLevel: document.querySelectorAll('#content > table.tbl').length,
            }))).toEqual({ heading: true, topLevel: before.length });
            await reopened.close();
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });
});
