'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// Same page type/header shape uniq-drop-length-bucket.spec.js uses
// (artist-recordings), so pageType detection + headerContainer resolve.
// The fixture's own comment documents which real-world `<span class="mp">`
// nesting each row reproduces.
const ARTIST_RECORDINGS_URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/recordings';
const FIXTURE_FILE = path.join(__dirname, 'uniq-drop-pending-edits.html');

/** Renders the fixture through the script's real fetch/render pipeline. */
const render = async (page, settingsOverride) => {
    await loadUserscriptPage(page, {
        url: ARTIST_RECORDINGS_URL, fixtureFile: FIXTURE_FILE, testMode: true,
        ...(settingsOverride ? { settingsOverride } : {}),
    });
    await page.route(`${ARTIST_RECORDINGS_URL}?**`, (route) => route.fulfill({ path: FIXTURE_FILE, contentType: 'text/html' }));
    await page.click('button[data-label="⊚ All recordings"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
};

/** Clicks one synthetic dropdown entry by its section label + entry label. */
const clickSynItem = (page, sectionLabel, itemLabel) => page.evaluate(([sec, lbl]) => {
    const sectionEl = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
        .find((s) => s.querySelector('.mb-uniq-section-label')?.textContent === sec);
    const item = Array.from(sectionEl.querySelectorAll('.mb-col-uniq-item'))
        .find((el) => el.dataset.mbUniqSynLabel === lbl);
    item.click();
}, [sectionLabel, itemLabel]);

const visibleRowNames = (page) => page.evaluate(() =>
    Array.from(document.querySelectorAll('table.tbl tbody tr'))
        .filter((r) => r.style.display !== 'none')
        .map((r) => r.cells[0].textContent.trim()));

test.describe('unique-values dropdown: "Pending edits" sections', () => {
    test('splits the Artist column into a presence flag pair and one entry per pending entity', async ({ page }) => {
        await render(page);

        const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Artist'));

        // "- Presence": 4 of 5 rows carry an <span class="mp"> somewhere in
        // their Artist cell (rows A-D); only row E does not.
        const presence = sections.find((s) => s.label === 'Pending edits - Presence');
        expect(presence).toBeTruthy();
        expect(Object.fromEntries(presence.items.map((i) => [i.label, i.count]))).toEqual({
            '⏳ has pending edits': 4,
            '○ no pending edits': 1,
        });

        // "- Entity": David Bowie appears in three rows (A solo, B inside a
        // joined "Queen & David Bowie" credit, D solo) and must count 3 —
        // rows, not spans. The name-variation-wrapped Rolling Stones credit
        // (row C) proves getCleanColumnText() reads through that extra
        // nesting level instead of dropping the entity.
        const entity = sections.find((s) => s.label === 'Pending edits - Entity');
        expect(entity).toBeTruthy();
        expect(Object.fromEntries(entity.items.map((i) => [i.label, i.count]))).toEqual({
            '» pending edit: David Bowie': 3,
            '» pending edit: The Rolling Stones': 1,
        });

        // Quickfilter wiring (the uniq-dropdown-section skill's step 7):
        // every entry in both sections must carry dataset.mbUniqSynLabel,
        // or _applySynBoxQuickFilter() cannot see it.
        for (const label of ['Pending edits - Presence', 'Pending edits - Entity']) {
            const datasetLabels = await page.evaluate((sec) => {
                const sectionEl = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
                    .find((s) => s.querySelector('.mb-uniq-section-label')?.textContent === sec);
                return Array.from(sectionEl.querySelectorAll('.mb-col-uniq-item')).map((i) => i.dataset.mbUniqSynLabel);
            }, label);
            expect(datasetLabels.every((l) => typeof l === 'string' && l.length > 0)).toBe(true);
        }
    });

    test('offers neither section on a column where nothing is pending', async ({ page }) => {
        await render(page);

        // The emit gate. Both sections are column-agnostic (no `is…Col`
        // check), so without `pendingEditsYesCount > 0` this column would
        // grow a meaningless "○ no pending edits (5)" entry — as would
        // every column of every page on the whole site.
        const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Release groups'));
        expect(sections.map((s) => s.label)).not.toContain('Pending edits - Presence');
        expect(sections.map((s) => s.label)).not.toContain('Pending edits - Entity');
    });

    test('checking "has pending edits" narrows to the 4 wrapped rows and highlights each marker', async ({ page }) => {
        await render(page);

        await page.evaluate(() => window.__saTest.getUniqDropSections('Artist'));
        await clickSynItem(page, 'Pending edits - Presence', '⏳ has pending edits');
        await page.waitForFunction(() => Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((r) => r.style.display !== 'none').length === 4, null, { timeout: 15000 });

        expect(await visibleRowNames(page)).toEqual(['Track A', 'Track B', 'Track C', 'Track D']);

        // Every matching row highlights its own span.mp — and only that.
        const highlighted = await page.evaluate(() =>
            Array.from(document.querySelectorAll('table.tbl tbody tr'))
                .filter((r) => r.style.display !== 'none')
                .map((r) => Array.from(r.querySelectorAll('.mb-column-filter-highlight')).map((h) => h.textContent.trim())));
        expect(highlighted).toEqual([
            ['David Bowie'], ['David Bowie'], ['The Rolling Stones'], ['David Bowie'],
        ]);
    });

    test('checking one entity narrows to that entity and highlights it alone inside a joined credit', async ({ page }) => {
        await render(page);

        await page.evaluate(() => window.__saTest.getUniqDropSections('Artist'));
        await clickSynItem(page, 'Pending edits - Entity', '» pending edit: David Bowie');
        await page.waitForFunction(() => Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((r) => r.style.display !== 'none').length === 3, null, { timeout: 15000 });

        expect(await visibleRowNames(page)).toEqual(['Track A', 'Track B', 'Track D']);

        // Row B's cell reads "Queen (UK rock group) & David Bowie (…)" —
        // only Bowie's own span.mp may be wrapped, never Queen.
        const trackBHighlights = await page.evaluate(() => {
            const row = Array.from(document.querySelectorAll('table.tbl tbody tr'))
                .find((r) => r.cells[0].textContent.trim() === 'Track B');
            return Array.from(row.querySelectorAll('.mb-column-filter-highlight')).map((h) => h.textContent.trim());
        });
        expect(trackBHighlights).toEqual(['David Bowie']);
    });

    test('re-opening the dropdown after a filter pass still reports the same counts', async ({ page }) => {
        await render(page);

        // The self-corrupting-extractor failure mode the uniq-dropdown-
        // section skill warns about: after the pass above wrapped each
        // matched name in a .mb-column-filter-highlight span,
        // _findCellPendingEdits() re-runs over its OWN output. It reads via
        // getCleanColumnText(), which unwraps those spans — a raw
        // textContent walk would fragment or drop the name here.
        await page.evaluate(() => window.__saTest.getUniqDropSections('Artist'));
        await clickSynItem(page, 'Pending edits - Entity', '» pending edit: David Bowie');
        await page.waitForFunction(() => Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((r) => r.style.display !== 'none').length === 3, null, { timeout: 15000 });

        const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Artist'));
        const entity = sections.find((s) => s.label === 'Pending edits - Entity');
        expect(Object.fromEntries(entity.items.map((i) => [i.label, i.count]))).toEqual({
            '» pending edit: David Bowie': 3,
            '» pending edit: The Rolling Stones': 1,
        });
    });

    test('offers neither section when sa_enable_pending_edits_section is off', async ({ page }) => {
        await render(page, { sa_enable_pending_edits_section: false });

        const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Artist'));
        expect(sections.map((s) => s.label)).not.toContain('Pending edits - Presence');
        expect(sections.map((s) => s.label)).not.toContain('Pending edits - Entity');

        // The defensive guard in _cellMatchesStructureMode(): a
        // pending-edits mode restored from a persisted/URL filter saved
        // while the setting was ON must not match once it is turned off.
        const matches = await page.evaluate(() => {
            const cell = document.querySelector('table.tbl tbody tr td:nth-child(3)');
            cell.id = 'mb-pending-probe';
            return window.__saTest.cellMatchesStructureMode('#mb-pending-probe', 'pending-edits-yes');
        });
        expect(matches).toBe(false);
    });
});
