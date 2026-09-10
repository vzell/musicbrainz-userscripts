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
// table). See DEBUG-NOTES.md's "search?type=recording continuation rows" entry.
const SEARCH_URL =
    'https://musicbrainz.org/search?query=roulette&type=recording&method=indexed';
const FIXTURE_FILE = path.join(__dirname, 'search-recordings-continuation.html');

// Column indices in the rendered table. The eight native columns keep their
// original positions — every synthetic/injected column (Video, Event-*,
// MB-Name, Comment, Primary alias, Picard) is appended after them.
const COL = { NAME: 0, LENGTH: 1, RELEASE: 4, TRACK: 5, MEDIUM: 6, TYPE: 7 };

test('search?type=recording: continuation rows fold into the preceding row as multi-row Release/Track/Medium/Type cells', async ({ page }) => {
    // Both tests below pin the Picard column AT INITIAL RENDER — the three
    // exact button titles, the picardLiCount === releaseLiCount invariant, and
    // the whole ▶3▤ / ▼3▤ premise of the second test. Since 9.99.1057 the
    // column ships COLLAPSED by default (sa_picard_tagger_initially_collapsed),
    // so those cells are empty until the header toggle is pressed. Seeding the
    // setting off keeps every assertion here verbatim and is honest about what
    // they pin: the pre-toggle "built during the render" behaviour, which the
    // setting still selects. The default-state coverage is the third test below.
    await loadUserscriptPage(page, {
        url: SEARCH_URL,
        fixtureFile: FIXTURE_FILE,
        testMode: true,
        settingsOverride: { sa_picard_tagger_initially_collapsed: false },
    });

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

    // The Picard cell is itself a multi-row cell mirroring the Release cell —
    // one <li> per release, so each ♪ sits on the line of the release it sends.
    // Including the single-release row, which is a one-item <ul> rather than a
    // bare button, so the column has one uniform cell structure.
    for (const row of await rows.all()) {
        const releaseLiCount = await row.locator('td').nth(COL.RELEASE).locator('ul > li').count();
        const picardLiCount  = await row.locator('td.mb-picard-cell ul > li').count();
        expect(picardLiCount).toBe(releaseLiCount);
    }
});

test('search?type=recording: Track and Medium line up across the whole table, toggle or no toggle', async ({ page }) => {
    // sa_picard_tagger_initially_collapsed: false — this test's whole ▶3▤ / ▼3▤
    // premise is that the Picard cells are built during the render. See the
    // first test for the full reasoning; the third test covers the default.
    await loadUserscriptPage(page, {
        url: SEARCH_URL,
        fixtureFile: FIXTURE_FILE,
        testMode: true,
        settingsOverride: { sa_picard_tagger_initially_collapsed: false },
    });
    await page.route('https://musicbrainz.org/search**', (route) =>
        route.fulfill({ path: FIXTURE_FILE, contentType: 'text/html' }));

    await page.click('button[data-label="Show all Search Results for Recordings"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });

    // The Picard column collapses like any other multi-row column: injected
    // late (it must stay rightmost, so it lands after every render path's own
    // collapse pass), it registers itself as collapsable and re-runs the pass —
    // so its cells start collapsed to one ♪ behind a "3"-count toggle, in step
    // with the Release cell beside them.
    const picardCell = page.locator('table.tbl tbody tr')
        .filter({ hasText: 'Studio Collection 1972–1979' })
        .locator('td.mb-picard-cell');
    await expect(picardCell.locator('.mb-cell-collapse-toggle')).toHaveText('▶3▤');
    expect(await picardCell.locator('ul > li').evaluateAll(
        lis => lis.filter(li => li.offsetParent !== null).length)).toBe(1);

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

    // The same button expanded the Picard column along with the rest.
    await expect(picardCell.locator('.mb-cell-collapse-toggle')).toHaveText('▼3▤');
    expect(await picardCell.locator('ul > li').evaluateAll(
        lis => lis.filter(li => li.offsetParent !== null).length)).toBe(3);
});

// The Picard column at its shipped default: present, empty, and built only when
// the user asks. Hosted here rather than in a new file because this fixture is
// already committed, is network-free, and its rows produce both a 1-entity and a
// 3-entity Picard cell — the two shapes the toggle has to get right.
//
// The guarantee is deliberately three-part, and the middle part is the one that
// distinguishes it from "the column is missing":
//   1. the <th> and one <td> per row still exist, and the <td> is still
//      rightmost with the row's cell count still equal to the header's — a
//      collapsed column must not move a single index (PERFORMANCE.org Step 32);
//   2. NO ♪ button and no <ul> exists anywhere, and _picardExtractRowEntities()
//      is not called again on a re-render — the actual work is skipped, not
//      merely hidden;
//   3. one press builds exactly what test 1 asserts at initial render, and a
//      second press returns the column to empty.
test('search?type=recording: the Picard column ships collapsed and fills on demand', async ({ page }) => {
    // No settingsOverride — this is the default the user gets.
    await loadUserscriptPage(page, { url: SEARCH_URL, fixtureFile: FIXTURE_FILE, testMode: true });
    await page.route('https://musicbrainz.org/search**', (route) =>
        route.fulfill({ path: FIXTURE_FILE, contentType: 'text/html' }));

    await page.click('button[data-label="Show all Search Results for Recordings"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });

    const rows = page.locator('table.tbl tbody tr');
    await expect(rows).toHaveCount(3);

    // ── 1. The column exists in full, and displaces nothing ─────────────────
    await expect(page.locator('table.tbl thead th.mb-picard-th').first()).toHaveCount(1);
    await expect(page.locator('table.tbl tbody td.mb-picard-cell')).toHaveCount(3);

    const shape = await page.evaluate(() => {
        const table = document.querySelector('table.tbl');
        const headerCells = table.querySelectorAll('thead tr:first-child th').length;
        const bodyRows = Array.from(table.querySelectorAll('tbody tr'));
        return {
            headerCells,
            rowsWithBadCellCount: bodyRows.filter(r => r.cells.length !== headerCells).length,
            rowsWherePicardNotLast: bodyRows.filter(r => {
                const cell = r.querySelector('td.mb-picard-cell');
                return cell && cell !== r.cells[r.cells.length - 1];
            }).length,
            // The <th>'s OWN text — its direct text nodes, excluding element
            // children — must be exactly "Picard". That is the invariant the
            // CSS-::before glyph exists to protect: four consumers match this
            // name exactly, and a text glyph in the toggle would make the
            // header read "▶♪Picard". Read this way rather than as the whole
            // subtree's textContent because initCollapsableColumns() legitimately
            // appends its own ▶N▤ button to this <th> once the column is
            // expanded and multi-row (Picard's header has no .mb-col-hdr-flex,
            // so that button lands as a direct child) — a real contribution
            // from a different feature, which _cleanColHeaderText() strips.
            headerOwnText: Array.from(table.querySelector('thead th.mb-picard-th').childNodes)
                .filter(n => n.nodeType === Node.TEXT_NODE)
                .map(n => n.textContent).join(''),
        };
    });
    expect(shape.rowsWithBadCellCount).toBe(0);
    expect(shape.rowsWherePicardNotLast).toBe(0);
    expect(shape.headerOwnText).toBe('Picard');

    // ── 2. Nothing was built, and nothing was even scanned ──────────────────
    await expect(page.locator('button.mb-picard-btn')).toHaveCount(0);
    await expect(page.locator('td.mb-picard-cell ul')).toHaveCount(0);

    const toggle = page.locator('table.tbl thead th.mb-picard-th .mb-picard-col-hdr-btn');
    await expect(toggle).toHaveCount(1);
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');

    // Single-table page: its own header toggle IS the page-wide control, so the
    // multi-table companion must not be rendered at all.
    await expect(page.locator('#mb-picard-col-hdr-toggle-all-btn')).toHaveCount(0);

    // The entity scan is the expensive half, and it is invisible in the DOM —
    // an empty cell looks the same whether it was skipped or whether the row
    // has nothing to tag. A filter keystroke re-renders every row and re-runs
    // the whole Picard pass; while collapsed it must not scan a single row.
    const scansBeforeFilter = await page.evaluate(() => window.__saTest.picardEntityScans());
    await page.locator('#mb-global-filter-input').pressSequentially('e');
    await expect(rows).toHaveCount(3);
    await expect(page.locator('button.mb-picard-btn')).toHaveCount(0);
    expect(await page.evaluate(() => window.__saTest.picardEntityScans()))
        .toBe(scansBeforeFilter);
    await page.locator('#mb-global-filter-input').fill('');
    await expect(rows).toHaveCount(3);

    // ── 3. One press builds exactly what test 1 pins ────────────────────────
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');

    const springsteen = rows.filter({ hasText: 'Studio Collection 1972–1979' });
    const picardCell = springsteen.locator('td.mb-picard-cell');
    await expect(picardCell.locator('button.mb-picard-btn')).toHaveCount(3);
    expect(await picardCell.locator('button.mb-picard-btn')
        .evaluateAll(btns => btns.map(b => b.title))).toEqual([
        'Send to Picard (Studio Collection 1972–1979 — release)',
        'Send to Picard (The Ties That Bind: The River Collection — release)',
        'Send to Picard (2001-12-06: Copper Dragon, Carbondale, IL, USA — release)',
    ]);

    // One <li> per release in every row, exactly as at initial render.
    for (const row of await rows.all()) {
        const releaseLiCount = await row.locator('td').nth(COL.RELEASE).locator('ul > li').count();
        const picardLiCount = await row.locator('td.mb-picard-cell ul > li').count();
        expect(picardLiCount).toBe(releaseLiCount);
    }

    // The per-cell ▶3▤ toggle proves the collapsable-column re-registration
    // fired ON EXPAND. While collapsed nothing is multi-row, so
    // initPicardTaggerColumn()'s own `_anyMultiRowPicardCell` never gets set and
    // this toggle can only come from _picardToggleTable()'s own registration.
    await expect(picardCell.locator('.mb-cell-collapse-toggle')).toHaveText('▶3▤');

    // ── 3b. A second press returns the column to empty ──────────────────────
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('button.mb-picard-btn')).toHaveCount(0);
    await expect(page.locator('td.mb-picard-cell ul')).toHaveCount(0);
    // The cell is empty, so it must not keep the padding reserved for a toggle.
    await expect(page.locator('td.mb-picard-cell.mb-has-collapse-toggle')).toHaveCount(0);
    // …and the column still has not moved.
    expect(await page.evaluate(() => {
        const table = document.querySelector('table.tbl');
        const headerCells = table.querySelectorAll('thead tr:first-child th').length;
        return Array.from(table.querySelectorAll('tbody tr'))
            .filter(r => r.cells.length !== headerCells).length;
    })).toBe(0);
});
