'use strict';

// Apollo findings, batch 2 (org/majkinetor.org; docs/claude/findings.md):
//   remix-no-remixer: the title names a remixer, the track credits none;
//   medley-works: a medley title has more parts than its linked works cover.
//
// What each test pins, and the neighbouring bug it must still catch:
//   - remix on a REAL release (Seren E.P.): "(Psyche remix)" without a remixer
//     is flagged, "(Moonitor remix)" WITH one is not, plain titles are not. A
//     rule that ignored the remixer column, or flagged every parenthetical,
//     fails here.
//   - the title rules themselves (Credit Hoarder's, plus SAED's mix words),
//     through the shipping function: anonymous mixes and mix descriptions
//     ("mono", "5.1", "take 2") name nobody; a person does.
//   - medley on a copy of a real release where "Medley 2" links one work for
//     seven parts; Volare links its two works directly; Drink and "Medley 1"
//     link a medley work plus its "medley of" works (near misses; Drink's
//     medley work has no " / " in its title, so only the nested works complete
//     it); "[band intro] / Song" and "AC/DC" are not medleys.
//   - the "Recording of work" column lists EVERY work the recording links (it
//     showed the first only): two direct works are two list items with the ▶
//     toggle; a single work keeps its bare link; a medley work's nested parts
//     stay in "Work medley of".
//   - menu count, filter, look, tint switch, survival after a filter pass.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { typeGlobalFilter, waitForFilterSettled } = require('../support/filterSortAssertions');
const { findingRow, clickFinding, findingRowState } = require('../support/findingsMenu');

const SETTINGS = { sa_enable_caa_pics: false, sa_enable_relationships_column: false, sa_enable_release_tracks: true,
    sa_enable_release_tracks_cover_art: false };
const WARN_BG = 'rgb(255, 243, 205)';   // #fff3cd

const REMIX_URL = 'https://musicbrainz.org/release/f6215982-62e1-4b81-b88f-754dca0da149';
const REMIX_FIXTURE = path.join(__dirname, 'release-tracks-remix-eti.html');
const MEDLEY_URL = 'https://musicbrainz.org/release/a9a3b139-cf22-4d28-801e-3f3d49521d0e';
const MEDLEY_FIXTURE = path.join(__dirname, 'release-tracks-medley-missing-work.html');
const MEDLEY2 = 'Medley 2: I Can’t Give You Anything but Love / Too Marvelous for Words / Pennies From Heaven / ' +
    'A Foggy Day / Embraceable You / The Lady Is a Tramp / Where or When';

/**
 * Loads a release fixture and presses "Show all Tracks for Release".
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} url
 * @param {string} fixture
 * @param {Object} [settingsOverride]
 */
async function open(page, url, fixture, settingsOverride = {}) {
    await loadUserscriptPage(page, { url, fixtureFile: fixture, testMode: true,
        settingsOverride: { ...SETTINGS, ...settingsOverride } });
    await page.route(`${url}*`, (r) => r.fulfill({ path: fixture, contentType: 'text/html' }));
    await page.click('button[data-label="Show all Tracks for Release"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/**
 * Every visible track row's title (the track link's own text) and its Title
 * cell's state for one finding.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} id
 */
const titleCells = (page, id) => page.evaluate((fid) => {
    const out = [];
    document.querySelectorAll('table.tbl').forEach((t) => {
        const names = Array.from(t.querySelectorAll('thead tr:first-child th')).map((th) => th.dataset.colName || '');
        const ti = names.indexOf('Title');
        if (ti < 0) return;
        t.querySelectorAll('tbody tr').forEach((tr) => {
            if (tr.style.display === 'none') return;
            const td = tr.cells[ti];
            const a = td && td.querySelector('a[href*="/recording/"]');
            if (!a) return;
            out.push({
                title: a.textContent.trim(),
                flagged: (td.dataset.mbFindings || '').split(' ').includes(fid),
                level: td.dataset.mbFinding || null,
                bg: getComputedStyle(td).backgroundColor,
                tip: td.getAttribute('title') || '',
            });
        });
    });
    return out;
}, id);

const flaggedTitles = (cells) => cells.filter((c) => c.flagged).map((c) => c.title);

test.describe('remix-no-remixer', () => {
    test('a named remix without a remixer is flagged; one with a remixer and plain titles are not', async ({ page }) => {
        await open(page, REMIX_URL, REMIX_FIXTURE);
        const cells = await titleCells(page, 'remix-no-remixer');
        expect(cells.length, 'the release has six tracks').toBe(6);
        expect(flaggedTitles(cells)).toEqual(['Everlasting (Psyche remix)']);
        const psyche = cells.find((c) => c.flagged);
        expect(psyche.tip).toContain('names "Psyche"');
        expect((await findingRow(page, 'warn', 'remix-no-remixer')).count).toBe(1);
    });

    test('the title rules: people count, anonymous mixes and mix descriptions do not', async ({ page }) => {
        await open(page, REMIX_URL, REMIX_FIXTURE);
        const got = await page.evaluate(() => Object.fromEntries([
            'Everlasting (Psyche remix)', 'A Little Less Conversation (JXL radio edit remix)', 'Song (Remixed by Aphex Twin)',
            'Song (Cotton Club remix)', 'Song (Masters at Work main mix)',
            'Song (Extended Mix)', 'Song (Club Mix)', 'Song (Remix)', 'Song (Radio Edit)', 'Song (Mixed by Someone)',
            'A Day in the Life (1982 stereo remix)', 'Teddy Bear (5.1 mix)', 'Song (Take 2 - 1965 Mono Mix)',
            'Song (take 3 Monitor mix)', 'Teddy Bear (new mono to stereo mix)', '[first show] (pro‐shot mix)',
            'Situations Like These (U.S. remix)', 'Song (UK radio edit)', 'Song (Japanese remix)',
        ].map((t) => [t, window.__saTest.remixNamedInTitle(t)])));
        expect(got).toEqual({
            'Everlasting (Psyche remix)': ['Psyche'],
            'A Little Less Conversation (JXL radio edit remix)': ['JXL'],
            'Song (Remixed by Aphex Twin)': ['Aphex Twin'],
            'Song (Cotton Club remix)': ['Cotton Club'],
            'Song (Masters at Work main mix)': ['Masters at Work'],
            'Song (Extended Mix)': [], 'Song (Club Mix)': [], 'Song (Remix)': [], 'Song (Radio Edit)': [],
            'Song (Mixed by Someone)': [],
            'A Day in the Life (1982 stereo remix)': [], 'Teddy Bear (5.1 mix)': [],
            'Song (Take 2 - 1965 Mono Mix)': [], 'Song (take 3 Monitor mix)': [],
            'Teddy Bear (new mono to stereo mix)': [], '[first show] (pro‐shot mix)': [],
            'Situations Like These (U.S. remix)': [], 'Song (UK radio edit)': [], 'Song (Japanese remix)': [],
        });
    });

    test('a click filters to the flagged track; the tint switch keeps the finding but not the paint', async ({ page }) => {
        await open(page, REMIX_URL, REMIX_FIXTURE);
        const flagged = (await titleCells(page, 'remix-no-remixer')).find((c) => c.flagged);
        expect(flagged.level).toBe('warn');
        expect(flagged.bg).toBe(WARN_BG);
        const total = (await findingRowState(page)).visible;
        await clickFinding(page, 'remix-no-remixer');
        await expect.poll(async () => (await findingRowState(page)).visible, { timeout: 15000 }).toBe(1);
        await clickFinding(page, 'remix-no-remixer');
        await expect.poll(async () => (await findingRowState(page)).visible, { timeout: 15000 }).toBe(total);

        await open(page, REMIX_URL, REMIX_FIXTURE, { sa_findings_tint_remix_no_remixer: false });
        const off = (await titleCells(page, 'remix-no-remixer')).find((c) => c.flagged);
        expect(off, 'still detected').toBeTruthy();
        expect(off.level, 'not tinted').toBeNull();
    });
});

test.describe('medley-works', () => {
    test('the medley with one work for seven parts is flagged; the complete medleys are not', async ({ page }) => {
        await open(page, MEDLEY_URL, MEDLEY_FIXTURE);
        const cells = await titleCells(page, 'medley-works');
        expect(cells.filter((c) => c.title.includes(' / ')).length, 'the release has four medleys').toBe(4);
        expect(flaggedTitles(cells)).toEqual([MEDLEY2]);
        expect(cells.find((c) => c.flagged).tip).toContain('7 parts, works for 1');
        expect((await findingRow(page, 'warn', 'medley-works')).count).toBe(1);
    });

    test('the part rules: brackets are not music, a slash without spaces is one part', async ({ page }) => {
        await open(page, MEDLEY_URL, MEDLEY_FIXTURE);
        const got = await page.evaluate(() => Object.fromEntries([
            "Don't Let Me Down / Those Were the Days", '[band intro] / Jenny Take a Ride', '[encore / break]',
            'AC/DC Medley', '[bass riff] / get back / [improvisation] 24.08',
        ].map((t) => [t, window.__saTest.medleyParts(t).length])));
        expect(got).toEqual({
            "Don't Let Me Down / Those Were the Days": 2, '[band intro] / Jenny Take a Ride': 1, '[encore / break]': 0,
            'AC/DC Medley': 1, '[bass riff] / get back / [improvisation] 24.08': 1,
        });
    });

    test('its stamp survives a filter re-render, and its tint switch keeps it', async ({ page }) => {
        await open(page, MEDLEY_URL, MEDLEY_FIXTURE);
        await waitForFilterSettled(page, () => typeGlobalFilter(page, 'Medley'));
        expect(flaggedTitles(await titleCells(page, 'medley-works'))).toEqual([MEDLEY2]);

        await open(page, MEDLEY_URL, MEDLEY_FIXTURE, { sa_findings_tint_medley_works: false });
        const off = (await titleCells(page, 'medley-works')).find((c) => c.flagged);
        expect(off, 'still detected').toBeTruthy();
        expect(off.level, 'not tinted').toBeNull();
    });
});

test.describe('Recording of work lists every work', () => {
    test('two direct works are two items; one work stays a bare link; nested medley parts stay out', async ({ page }) => {
        await open(page, MEDLEY_URL, MEDLEY_FIXTURE);
        const rows = await page.evaluate(() => {
            const out = {};
            document.querySelectorAll('table.tbl').forEach((t) => {
                const names = Array.from(t.querySelectorAll('thead tr:first-child th')).map((th) => th.dataset.colName || '');
                const ti = names.indexOf('Title'), ri = names.indexOf('Recording of work'), mi = names.indexOf('Work medley of');
                t.querySelectorAll('tbody tr').forEach((tr) => {
                    const a = tr.cells[ti] && tr.cells[ti].querySelector('a[href*="/recording/"]');
                    if (!a || ri < 0) return;
                    const rc = tr.cells[ri];
                    out[a.textContent.trim()] = {
                        items: Array.from(rc.querySelectorAll(':scope > ul > li')).map((li) => li.textContent.replace(/\s+/g, ' ').trim()),
                        links: rc.querySelectorAll('a[href*="/work/"]').length,
                        toggle: !!rc.querySelector('.mb-cell-collapse-toggle'),
                        medleyOf: mi >= 0 && tr.cells[mi] ? tr.cells[mi].querySelectorAll('a[href*="/work/"]').length : 0,
                    };
                });
            });
            return out;
        });
        const volare = rows['Medley: Volare / On an Evening in Roma'];
        expect(volare.items, 'one item per work, each with its "(live)"').toEqual([
            'Volare (Nel blu dipinto di blu) (live)', 'On an Evening in Roma (live)']);
        expect(volare.toggle, 'a list gets the collapse toggle').toBe(true);
        const goody = rows['Goody Goody'];
        expect(goody.items, 'a single work is no list').toEqual([]);
        expect(goody.links).toBe(1);
        const m1 = Object.entries(rows).find(([t]) => t.startsWith('Medley 1:'))[1];
        expect(m1.links, 'the medley work alone, its parts are not repeated here').toBe(1);
        expect(m1.medleyOf, '…they are in "Work medley of"').toBe(13);
    });
});
