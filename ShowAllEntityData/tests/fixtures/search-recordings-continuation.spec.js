'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// MusicBrainz's recording search paginates by RECORDING but renders one <tr>
// per (recording, release) pair: the recording's own four columns appear only
// on the first release's row, and every further release arrives as a
// "continuation" row whose leading four columns are a single empty
// <td colspan="4">. Such a row has 5 cells for an 8-column table, so before
// features.mergeContinuationRows existed the row-import loop imported it as a
// data row and then addressed every cell POSITIONALLY — shifting all of its
// content four columns left. The most visible symptom was release TITLES
// rendered inside the Length column (complete with that column's ':'-alignment
// spans, which then forced a ~50ch min-width on every Length cell in the
// table). See debug/NOTES.md's "search?type=recording continuation rows" entry.
const SEARCH_URL =
    'https://musicbrainz.org/search?query=roulette&type=recording&method=indexed';
const FIXTURE_FILE = path.join(__dirname, 'search-recordings-continuation.html');

// Column indices in the rendered table. The eight native columns keep their
// original positions — every synthetic/injected column (Video, Event-*,
// MB-Name, Comment, Primary alias, Picard) is appended after them.
const COL = { NAME: 0, LENGTH: 1, RELEASE: 4, TRACK: 5, MEDIUM: 6, TYPE: 7 };

test('search?type=recording: continuation rows fold into the preceding row as multi-row Release/Track/Medium/Type cells', async ({ page }) => {
    await loadUserscriptPage(page, { url: SEARCH_URL, fixtureFile: FIXTURE_FILE, testMode: true });

    // startFetchingProcess ALWAYS re-fetches a search page over the network
    // rather than reusing the live document (the _isSearchPage branch — the
    // live search table is rendered by MusicBrainz JS after load, so reading it
    // races), so the "Show all" click needs its own route.
    await page.route('https://musicbrainz.org/search**', (route) =>
        route.fulfill({ path: FIXTURE_FILE, contentType: 'text/html' }));

    await page.click('button[data-label="Show all Search Results for Recordings"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });

    const rows = page.locator('table.tbl tbody tr');

    // 6 source <tr> (3 base + 3 continuation) → 3 rendered rows, one per
    // recording, matching MusicBrainz's own "Found 3 results" count.
    await expect(rows).toHaveCount(3);

    // No continuation row survived as a row of its own.
    await expect(page.locator('table.tbl tbody td[colspan]')).toHaveCount(0);

    // The direct regression assertion against the four-column shift: a
    // continuation row's Length cell used to hold a release TITLE.
    for (const row of await rows.all()) {
        const length = (await row.locator('td').nth(COL.LENGTH).innerText()).trim();
        expect(length).toMatch(/^\d+:\d{2}$/);
    }

    // Per-recording <li> counts in each of the four merged columns. Ordered by
    // the recording's Length, which is unique per row here and unaffected by
    // any default sort applied on render.
    const byLength = {};
    for (const row of await rows.all()) {
        const length = (await row.locator('td').nth(COL.LENGTH).innerText()).trim();
        const counts = {};
        for (const [name, idx] of Object.entries(COL)) {
            if (name === 'NAME' || name === 'LENGTH') continue;
            counts[name] = await row.locator('td').nth(idx).locator('ul > li').count();
        }
        byLength[length] = counts;
    }

    // Three releases, one release, and — the "no continuation row at all" case —
    // still exactly one <li> per column, so a single-release recording has the
    // same cell structure as a multi-release one.
    expect(byLength['3:42']).toEqual({ RELEASE: 3, TRACK: 3, MEDIUM: 3, TYPE: 3 });
    expect(byLength['2:09']).toEqual({ RELEASE: 2, TRACK: 2, MEDIUM: 2, TYPE: 2 });
    expect(byLength['4:28']).toEqual({ RELEASE: 1, TRACK: 1, MEDIUM: 1, TYPE: 1 });

    // Every merged release landed in the Release column, in source order, and
    // its own Track/Medium/Type travelled with it into the same <li> position.
    const springsteen = rows.filter({ hasText: 'Studio Collection 1972–1979' });
    await expect(springsteen).toHaveCount(1);

    // Scoped to each <li>'s own <bdi> rather than the <li>: initExpandRGsFeature
    // injects its own ▶ toggle into every list item (one per release now, which
    // is exactly what it should do), and that glyph is part of li.textContent.
    const releaseNames = springsteen.locator('td').nth(COL.RELEASE).locator('ul > li bdi');
    await expect(releaseNames).toHaveText([
        'Studio Collection 1972–1979',
        'The Ties That Bind: The River Collection',
        // A release title containing commas must NOT be split into separate
        // <li> rows by applyRenderMultiRowCells — it lives inside <a><bdi>,
        // an element child, never a top-level text node.
        '2001-12-06: Copper Dragon, Carbondale, IL, USA',
    ]);
    await expect(springsteen.locator('td').nth(COL.TRACK).locator('ul > li'))
        .toHaveText(['7/10', '12/25', '4/9']);
    await expect(springsteen.locator('td').nth(COL.MEDIUM).locator('ul > li'))
        .toHaveText(['4', '13', '1']);
    await expect(springsteen.locator('td').nth(COL.TYPE).locator('ul > li'))
        .toHaveText(['Album + Compilation', 'Album + Compilation', 'Album + Live']);

    // finalizeRLCColumnWidths sizes an L/R/C integer column from the LONGEST
    // SINGLE <li> (_rlcValueLength), not from the cell's concatenated text —
    // "13" is 2ch, whereas "4"+"13"+"1" would give 4ch and stretch the whole
    // column by roughly a factor of the row count.
    // Asserted against the inline style rather than the computed value, which
    // resolves 'ch' to px and would tie the test to the font metrics.
    const mediumValSpan = springsteen.locator('td').nth(COL.MEDIUM).locator('.mb-ic-val');
    await expect(mediumValSpan).toHaveAttribute('style', /min-width:\s*2ch/);

    // One Picard button per release, each naming its own release — the cell
    // used to hold a single button for whichever release came first.
    const picardTitles = await springsteen.locator('td.mb-picard-cell button.mb-picard-btn')
        .evaluateAll(btns => btns.map(b => b.title));
    expect(picardTitles).toEqual([
        'Send to Picard (Studio Collection 1972–1979 — release)',
        'Send to Picard (The Ties That Bind: The River Collection — release)',
        'Send to Picard (2001-12-06: Copper Dragon, Carbondale, IL, USA — release)',
    ]);
    await expect(rows.filter({ hasText: 'Burn The Incline' })
        .locator('td.mb-picard-cell button.mb-picard-btn')).toHaveCount(1);
});

test('search?type=recording: Track and Medium line up across the whole table, toggle or no toggle', async ({ page }) => {
    await loadUserscriptPage(page, { url: SEARCH_URL, fixtureFile: FIXTURE_FILE, testMode: true });
    await page.route('https://musicbrainz.org/search**', (route) =>
        route.fulfill({ path: FIXTURE_FILE, contentType: 'text/html' }));

    await page.click('button[data-label="Show all Search Results for Recordings"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });

    // Every list item has to be on screen to have real geometry, and going
    // through the real "expand all multi-row cells" button rather than poking
    // display:none also exercises _applyCollapseState on these new columns.
    // The button re-renders the table, so wait for all 6 items (3 + 2 + 1) to
    // be laid out before measuring anything — reading straight after the click
    // catches the table mid-render and sees only the first item of each cell.
    await page.click('#mb-col-collapse-all-btn');
    await page.waitForFunction((trackIdx) => {
        const lis = Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .flatMap(tr => Array.from(tr.cells[trackIdx].querySelectorAll('li')));
        return lis.length === 6 && lis.every(li => li.getBoundingClientRect().width > 0);
    }, COL.TRACK);

    const geom = await page.evaluate(([trackIdx, mediumIdx]) => {
        const rows = Array.from(document.querySelectorAll('table.tbl tbody tr'));
        const read = (idx, pick) => {
            const out = [];
            for (const tr of rows) {
                for (const li of tr.cells[idx].querySelectorAll('li')) {
                    const el = pick(li);
                    if (el) out.push(Math.round(el.getBoundingClientRect().left * 10) / 10);
                }
            }
            return out;
        };
        return {
            // The '/' separator's own position — Track is split-aligned on it.
            sepLefts: read(trackIdx, li => li.querySelector('.mb-ic-sep')),
            // Medium is plain right-aligned, so compare the item's right edge.
            mediumRights: (() => {
                const out = [];
                for (const tr of rows) {
                    for (const li of tr.cells[mediumIdx].querySelectorAll('li')) {
                        out.push(Math.round(li.getBoundingClientRect().right * 10) / 10);
                    }
                }
                return out;
            })(),
            // Sanity: some rows have a toggle and some don't. That difference —
            // td.mb-has-collapse-toggle's 22px padding-right landing on SOME
            // cells only — is exactly what used to shift a centred value by
            // half the padding between rows.
            withToggle: rows.filter(tr => tr.cells[mediumIdx].classList.contains('mb-has-collapse-toggle')).length,
            withoutToggle: rows.filter(tr => !tr.cells[mediumIdx].classList.contains('mb-has-collapse-toggle')).length,
        };
    }, [COL.TRACK, COL.MEDIUM]);

    expect(geom.withToggle).toBeGreaterThan(0);
    expect(geom.withoutToggle).toBeGreaterThan(0);

    // 6 track/medium entries across 3 rows (3 + 2 + 1).
    expect(geom.sepLefts).toHaveLength(6);
    expect(geom.mediumRights).toHaveLength(6);
    expect(new Set(geom.sepLefts).size).toBe(1);
    expect(new Set(geom.mediumRights).size).toBe(1);
});
