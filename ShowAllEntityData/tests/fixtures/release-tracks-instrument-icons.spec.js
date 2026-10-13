'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { injectThirdPartyScript } = require('../support/thirdPartyScripts');
const { waitForSortSettled, waitForFilterSettled } = require('../support/filterSortAssertions');

// "MusicBrainz: Instrument Icons Everywhere" (@Lotheric) puts an
// <img class="mb-ii-icon"> BEFORE every instrument link and stamps the LINK
// data-ii-processed="true". The release-tracks "Instruments" column used to
// clone the link alone: the clone kept the stamp, lost the icon, and the
// script never decorates a stamped link again — so the column never showed
// a single icon (DEBUG-NOTES.md, 2026-10-12).
//
// Fixture: release 3ce46b79-5e8c-470a-bcdc-45f301d09f60 (Greetings From
// Asbury Park, N.J., Pitman pressing), as the server sent it
// (scripts/fetch-release-fixture.js). The icon set below is the one the
// real script painted on that page in debug/gfanj-intruments-initial.html:
// piano, saxophone, contrabass ("double bass") and harmonica have an icon,
// every other instrument has none ('NONE').
//
// Simulator: tests/fixtures/thirdPartyScripts/ii-instrument-icons.js, run
// at DOMContentLoaded — the real script is @run-at document-start, so the
// native page is decorated before any ShowAllEntityData button is clicked.
const RELEASE_URL = 'https://musicbrainz.org/release/3ce46b79-5e8c-470a-bcdc-45f301d09f60';
const FIXTURE = path.join(__dirname, 'release-tracks-instrument-icons.html');

const PIANO = 'b3eac5f9-7859-4416-ac39-7154e2e8d348';
const SAX = 'a9ed16cd-b8cb-4256-9c41-93f5f0458c49';
const DOUBLE_BASS = '7bd32b95-416f-4244-a98b-1311ec69c7db';
const HARMONICA = '63e37f1a-30b6-4746-8a49-dfb55be3cdd1';
const BASS = '6505f98c-f698-4406-8bf4-8ca43d05c36f';

const REAL_ICONS = { [PIANO]: 'piano', [SAX]: 'saxophone', [DOUBLE_BASS]: 'contrabass', [HARMONICA]: 'harmonica' };
// Harmonica is decorated too, but it is a RELEASE-level credit ("acoustic
// guitar, congas, electric guitar and harmonica: Bruce Springsteen"), so it
// never reaches the track-level Instruments column.
const WITH_ICON = ['piano', 'saxophone', 'double bass'];

// The script decorates the native page at once (DOMContentLoaded), but
// anything added later only after its debounce. Stretched from 120 ms to
// 2 s, it cannot have looked at the consolidated table yet when a test reads
// it right after the render — so an icon found there was COPIED with its
// anchor (_cloneInstrumentAnchorWithIcon()), not added afterwards by the
// script to an anchor handed back to it (_iiReleaseIconlessAnchors()). Each
// of the two would otherwise hide the other one's breakage.
const SLOW = 2000;

/**
 * Loads the fixture, optionally with the simulator, and renders the tracks.
 * @param {import('@playwright/test').Page} page
 * @param {?Object} simConfig - simulator config, or null for "script absent".
 */
async function renderTracks(page, simConfig) {
    // A freshly fetched release fixture names CURRENT static.metabrainz.org
    // bundles, which would download and re-render the tracklist from JSON
    // (docs/claude/release-tracks-and-length.md, "Fixture trap").
    await page.context().route('https://static.metabrainz.org/**', (route) => route.abort('blockedbyclient'));
    if (simConfig) await injectThirdPartyScript(page, 'ii-instrument-icons', { when: 'init', config: simConfig });
    await loadUserscriptPage(page, {
        url: RELEASE_URL,
        fixtureFile: FIXTURE,
        testMode: true,
        settingsOverride: { sa_enable_release_tracks: true },
    });
    await page.click('button[data-label="Show all Tracks for Release"]');
    await expect(page.locator('#mb-filter-container')).toBeAttached();
}

/**
 * Waits until the simulated script has run its pass over the latest DOM
 * change (its 120 ms debounce), instead of sleeping past it.
 * @param {import('@playwright/test').Page} page
 */
async function scriptSettled(page) {
    await expect.poll(() => page.evaluate(() => window.__iiSimIdle)).toBe(true);
}

/**
 * One record per instrument entry of every visible "Instruments" cell.
 * `iconBefore` is the folder title of an <img class="mb-ii-icon"> that is the
 * anchor's IMMEDIATE previous sibling (the script's own adjacency), `icons`
 * the number of icons in the whole <li> (so a double icon is caught).
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<{instrument: string, iconBefore: ?string, icons: number, text: string}>>}
 */
async function instrumentEntries(page) {
    return page.evaluate(() => {
        const out = [];
        document.querySelectorAll('table.tbl').forEach((tbl) => {
            const ths = Array.from(tbl.querySelectorAll('thead tr:first-child th'));
            const idx = ths.findIndex((t) => (t.dataset.colName || '') === 'Instruments');
            if (idx < 0) return;
            tbl.querySelectorAll('tbody tr').forEach((tr) => {
                if (tr.style.display === 'none') return;
                const td = tr.cells[idx];
                if (!td) return;
                td.querySelectorAll('li').forEach((li) => {
                    const a = li.querySelector('a.mb-credit-instrument');
                    if (!a) return;
                    const prev = a.previousSibling;
                    const isIcon = !!(prev && prev.nodeType === 1 && prev.matches('img.mb-ii-icon'));
                    out.push({
                        instrument: a.textContent.trim(),
                        iconBefore: isIcon ? prev.getAttribute('title') : null,
                        icons: li.querySelectorAll('img.mb-ii-icon').length,
                        text: li.textContent.replace(/\s+/g, ' ').trim(),
                    });
                });
            });
        });
        return out;
    });
}

/**
 * Asserts the guarantee: every entry of a WITH_ICON instrument has exactly
 * one icon, right before its anchor; every other entry has none.
 * @param {Array} entries
 */
function expectIconsOnExactlyTheDecoratedInstruments(entries) {
    expect(entries.length).toBeGreaterThanOrEqual(10);
    const got = entries.map((e) => ({ entry: e.text, adjacentIcon: e.iconBefore !== null, icons: e.icons }));
    const want = entries.map((e) => {
        const decorated = WITH_ICON.includes(e.instrument);
        return { entry: e.text, adjacentIcon: decorated, icons: decorated ? 1 : 0 };
    });
    expect(got).toEqual(want);
    // Every decorated instrument is actually on the page, so the loop above
    // cannot pass vacuously.
    for (const name of WITH_ICON) expect(entries.some((e) => e.instrument === name), name).toBe(true);
}

/** The sub-table's own sort status (release-tracks is tableMode 'multi'). */
const sortStatus = (page) => page.locator('h3.mb-toggle-h3 .mb-sort-status').first();

/**
 * Sorts by the "Instruments" column (re-renders by cloning the source rows).
 * @param {import('@playwright/test').Page} page
 */
async function sortByInstruments(page) {
    await waitForSortSettled(page, () => page.evaluate(() => {
        const th = Array.from(document.querySelectorAll('table.tbl thead tr:first-child th'))
            .find((t) => (t.dataset.colName || '') === 'Instruments');
        th.querySelector('.sort-icon-btn:not(:empty)').click();
    }), { statusLocator: sortStatus(page) });
}

test.describe('release-tracks: "Instrument Icons Everywhere" icons in the Instruments column', () => {
    test('a decorated instrument keeps its icon in the column, across sort and filter re-renders', async ({ page }) => {
        await renderTracks(page, { icons: REAL_ICONS, debounceMs: SLOW });

        // Premise: the native page was decorated before the click.
        expect(await page.evaluate(() => document.querySelectorAll('img.mb-ii-icon').length)).toBeGreaterThan(0);

        // Read at once: copied, not added later (see SLOW).
        expectIconsOnExactlyTheDecoratedInstruments(await instrumentEntries(page));

        // Re-renders clone from the SOURCE rows: the icon must be there, not
        // only on the first live render — and must not double up when the
        // script's observer looks at the clones.
        await sortByInstruments(page);
        await scriptSettled(page);
        expectIconsOnExactlyTheDecoratedInstruments(await instrumentEntries(page));

        await waitForFilterSettled(page, () => page.fill('#mb-global-filter-input', 'Clemons'));
        await waitForFilterSettled(page, () => page.fill('#mb-global-filter-input', ''));
        await scriptSettled(page);
        expectIconsOnExactlyTheDecoratedInstruments(await instrumentEntries(page));
    });

    test('an icon that arrives after the render reaches the source row and survives a re-render', async ({ page }) => {
        // Bass: stamped at once, icon only after 6 s — long after the render.
        await renderTracks(page, { icons: { ...REAL_ICONS, [BASS]: { folder: 'bass_guitar', delayMs: 6000 } } });

        const bass = async () => (await instrumentEntries(page)).filter((e) => e.instrument === 'bass');
        const before = await bass();
        expect(before.length).toBeGreaterThan(0);
        // Premise: the render really happened before the icon existed.
        expect(before.every((e) => e.iconBefore === null)).toBe(true);

        // The 📊 panel, opened before the icon exists, caches its scan…
        const bassEntryIcon = async () => {
            await page.evaluate(() => window.__saTest.closeUniqDrop());
            await page.evaluate(() => window.__saTest.getUniqDropSections('Instruments'));
            return page.evaluate(() => {
                const el = document.querySelector('#mb-col-uniq-dropdown .mb-col-uniq-item[data-mb-uniq-syn-label="» instrument: bass"]');
                const img = el && el.querySelector('.mb-uniq-ii-icon img.mb-ii-icon');
                return img ? img.getAttribute('title') : null;
            });
        };
        expect(await bassEntryIcon()).toBeNull();

        await expect.poll(async () => (await bass()).every((e) => e.iconBefore === 'bass guitar'), { timeout: 15000 }).toBe(true);
        // …and the late icon, which changes no visible row, must drop that
        // cache: reopened, the entry shows it.
        expect(await bassEntryIcon()).toBe('bass guitar');
        await page.evaluate(() => window.__saTest.closeUniqDrop());

        await sortByInstruments(page);
        await scriptSettled(page);
        const after = await bass();
        expect(after.length).toBe(before.length);
        for (const e of after) {
            expect(e.iconBefore, e.text).toBe('bass guitar');
            expect(e.icons, e.text).toBe(1);
        }
    });

    test('a credited-instrument annotation in a credit column keeps its icon (_buildCreditListItem)', async ({ page }) => {
        // MusicBrainz renders a credit's instrument as "<artist> (<a href=
        // /instrument/…>strings</a>)" (debug/buggy-list-title.html, Ian
        // Kagey). The fixture has none, so every "producer: Mike Appel and …"
        // credit is given that shape, crediting piano, after the page loaded
        // and before the click; the simulator's MBII_processPage() (the real
        // script exposes the same) then decorates the new link.
        await page.context().route('https://static.metabrainz.org/**', (route) => route.abort('blockedbyclient'));
        await injectThirdPartyScript(page, 'ii-instrument-icons', { when: 'init', config: { icons: REAL_ICONS, debounceMs: SLOW } });
        await loadUserscriptPage(page, {
            url: RELEASE_URL,
            fixtureFile: FIXTURE,
            testMode: true,
            settingsOverride: { sa_enable_release_tracks: true },
        });
        const added = await page.evaluate((piano) => {
            let n = 0;
            document.querySelectorAll('dl dt').forEach((dt) => {
                if (dt.textContent.trim() !== 'producer:') return;
                const a = dt.nextElementSibling && dt.nextElementSibling.querySelector('a[href^="/artist/"]');
                if (!a) return;
                const instr = document.createElement('a');
                instr.setAttribute('href', `/instrument/${piano}`);
                instr.textContent = 'piano';
                a.after(document.createTextNode(' ('), instr, document.createTextNode(')'));
                n++;
            });
            window.MBII_processPage();
            return n;
        }, PIANO);
        expect(added).toBeGreaterThan(0);
        await page.click('button[data-label="Show all Tracks for Release"]');
        await expect(page.locator('#mb-filter-container')).toBeAttached();

        const producers = await page.evaluate(() => {
            const out = [];
            document.querySelectorAll('table.tbl').forEach((tbl) => {
                const ths = Array.from(tbl.querySelectorAll('thead tr:first-child th'));
                const idx = ths.findIndex((t) => (t.dataset.colName || '') === 'Producer');
                if (idx < 0) return;
                tbl.querySelectorAll('tbody tr').forEach((tr) => {
                    const td = tr.cells[idx];
                    if (!td) return;
                    td.querySelectorAll('a[href*="/instrument/"]').forEach((a) => {
                        const prev = a.previousSibling;
                        out.push({
                            iconBefore: (prev && prev.nodeType === 1 && prev.matches('img.mb-ii-icon')) ? prev.getAttribute('title') : null,
                            icons: a.closest('li').querySelectorAll('img.mb-ii-icon').length,
                        });
                    });
                });
            });
            return out;
        });
        expect(producers.length).toBeGreaterThan(0);
        for (const p of producers) {
            expect(p.iconBefore).toBe('piano');
            expect(p.icons).toBe(1);
        }
    });

    test('📊 "» instrument:" entries carry the instrument\'s icon after the label', async ({ page }) => {
        await renderTracks(page, { icons: REAL_ICONS });
        await page.evaluate(() => window.__saTest.getUniqDropSections('Instruments'));
        const entries = await page.evaluate(() => Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-col-uniq-item'))
            .filter((el) => (el.dataset.mbUniqSynLabel || '').startsWith('» instrument: '))
            .map((el) => ({
                name: el.dataset.mbUniqSynLabel.slice('» instrument: '.length),
                icon: el.querySelector('.mb-uniq-ii-icon img.mb-ii-icon')?.getAttribute('title') || null,
            })));
        const byName = Object.fromEntries(entries.map((e) => [e.name, e.icon]));
        expect(byName).toMatchObject({ piano: 'piano', saxophone: 'saxophone', 'double bass': 'contrabass', bass: null });
        expect(entries.filter((e) => !WITH_ICON.includes(e.name) && e.icon !== null)).toEqual([]);
    });

    test('a late icon updates the 📊 counts and an active "without instrument icon" filter', async ({ page }) => {
        // Every instrument has an icon at once except bass, which gets its
        // icon 5 s after the page loaded, i.e. after the render and after
        // "without instrument icon" is ticked. Rows that lacked an icon only
        // for bass must then leave the filtered table on their own
        // (source row mirrored, filter-result cache dropped, filter re-run),
        // and a re-opened 📊 must count them on the "with" side (uniq cache
        // dropped).
        await renderTracks(page, { allIcons: true, icons: { [BASS]: { folder: 'bass_guitar', delayMs: 5000 } } });

        // Oracle, from the table before anything is filtered: the rows that
        // still lack an icon once bass has one.
        const oracle = await page.evaluate(() => {
            const tbl = document.querySelector('table.tbl');
            const idx = Array.from(tbl.querySelectorAll('thead tr:first-child th')).findIndex((t) => t.dataset.colName === 'Instruments');
            const has = (a) => !!(a.previousSibling && a.previousSibling.nodeType === 1 && a.previousSibling.matches('img.mb-ii-icon'));
            let before = 0, after = 0, bassRows = 0;
            tbl.querySelectorAll('tbody tr').forEach((tr) => {
                const links = Array.from(tr.cells[idx].querySelectorAll('a[href*="/instrument/"]')).filter((a) => a.textContent.trim());
                const iconless = links.filter((a) => !has(a)).map((a) => a.textContent.trim());
                if (iconless.length) before++;
                if (iconless.some((n) => n !== 'bass')) after++;
                if (iconless.includes('bass')) bassRows++;
            });
            return { before, after, bassRows };
        });
        // Premise: some rows lack an icon only because of bass.
        expect(oracle.bassRows).toBeGreaterThan(0);
        expect(oracle.after).toBeLessThan(oracle.before);

        const section = async () => {
            await page.evaluate(() => window.__saTest.closeUniqDrop());
            const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Instruments'));
            // With every visible row filtered out, the panel has no
            // section to show at all.
            const sec = (sections || []).find((x) => x.label === 'Instrument info - Icon');
            return sec ? Object.fromEntries(sec.items.map((i) => [i.label, i.count])) : {};
        };
        expect((await section())['○ without instrument icon']).toBe(oracle.before);

        await waitForFilterSettled(page, () => page.evaluate(() => {
            Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-col-uniq-item'))
                .find((el) => el.dataset.mbUniqSynLabel === '○ without instrument icon').click();
        }));
        const rows = () => page.evaluate(() => document.querySelectorAll('table.tbl tbody tr').length);
        expect(await rows()).toBe(oracle.before);

        await expect.poll(rows, { timeout: 15000 }).toBe(oracle.after);
        // An entry with a count of 0 is not offered at all.
        expect((await section())['○ without instrument icon'] ?? 0).toBe(oracle.after);
    });

    test('without the script nothing changes: same text, no icon, no stamp', async ({ page, browser }) => {
        await renderTracks(page, null);
        const plain = await instrumentEntries(page);
        expect(plain.length).toBeGreaterThanOrEqual(10);
        expect(plain.every((e) => e.icons === 0)).toBe(true);
        expect(await page.evaluate(() => document.querySelectorAll('[data-ii-processed], img.mb-ii-icon').length)).toBe(0);

        // The icon-bearing <dt> classifies exactly like the plain one
        // (_parseInstrumentVocalsDt ignores the <img>): same entries, same text.
        const ctx = await browser.newContext();
        const page2 = await ctx.newPage();
        try {
            await renderTracks(page2, { icons: REAL_ICONS });
            const decorated = await instrumentEntries(page2);
            expect(decorated.map((e) => e.text)).toEqual(plain.map((e) => e.text));
        } finally {
            await ctx.close();
        }
    });
});
