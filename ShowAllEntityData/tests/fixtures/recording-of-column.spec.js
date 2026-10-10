'use strict';

const { test, expect } = require('../support/test');
const { DATA, setupRecordingOf, headerNames, columnCells } = require('../support/recordingOf');
const { columnFilterInput } = require('../support/filterSortAssertions');

// The "Recording of" / "Performance attributes" columns on artist-recordings
// (features.recordingOf, the _recOf* family). Each test names the property it
// pins:
//   - the two columns sit right after "Name", and nothing is requested until
//     the user asks (zero WS/2 calls on render);
//   - inserting them after "Name" does not misplace the positional
//     integer-column styling of a column further right (Length);
//   - the ▶🎼 toggle loads every row, through the cheaper source;
//   - cell content: work link, attributes as one "/"-joined .mb-credit-attr
//     in light green italics, a medley as two rows; the attribute column one
//     row per attribute plus the date;
//   - a cell click loads one row with one request;
//   - a failure is ⚠, not cached, and a retry recovers it;
//   - a reload answers from IndexedDB with zero requests;
//   - a column filter finds a loaded work title.

const lengthCell = async (page, row) => (await columnCells(page, 'Length'))[row];
const recofIdx = (rec) => DATA.recordings.findIndex((r) => r.title === rec);

test.describe('artist-recordings: "Recording of" columns', () => {
    test('the columns sit after Name, and render requests nothing', async ({ page }) => {
        const { calls } = await setupRecordingOf(page);
        const names = await headerNames(page);
        const at = names.indexOf('Name');
        expect(names.slice(at, at + 3)).toEqual(['Name', 'Recording of', 'Performance attributes']);
        const cells = await columnCells(page, 'Recording of');
        expect(cells.length).toBe(DATA.recordings.length);
        expect(cells.every((c) => c.text === '' && c.state === null)).toBe(true);
        expect(calls).toEqual([]);
    });

    test('Length keeps its integer-column styling after the two inserted columns', async ({ page }) => {
        await setupRecordingOf(page);
        const lens = await columnCells(page, 'Length');
        expect(lens[0].text).toBe('4:30');
        const styled = await page.evaluate(() => {
            const tbl = document.querySelector('table.tbl');
            const ths = Array.from(tbl.querySelectorAll('thead tr:first-child th'));
            const at = (n) => ths.findIndex((th) => th.dataset.colName === n);
            const row = tbl.querySelector('tbody tr');
            return {
                length: row.cells[at('Length')].dataset.mbIntColStyled || null,
                recof: row.cells[at('Recording of')].dataset.mbIntColStyled || null,
                rating: row.cells[at('Rating')]?.dataset.mbIntColStyled || null,
            };
        });
        expect(styled.length).toBe('1');
        expect(styled.recof).toBeNull();
        expect(await lengthCell(page, 1)).toMatchObject({ text: '4:51' });
    });

    test('▶🎼 loads every row with one browse request when the catalogue fits', async ({ page }) => {
        const { calls } = await setupRecordingOf(page, { settings: { sa_recording_of_suggest_enable: false } });
        await page.locator('.mb-recof-col-hdr-btn').click();
        await expect(page.locator('.mb-recof-col-hdr-btn')).toHaveAttribute('aria-pressed', 'true', { timeout: 15000 });
        expect(calls.map((c) => c.kind)).toEqual(['browse']);
        const cells = await columnCells(page, 'Recording of');
        expect(cells[recofIdx('Badlands')].state).toBe('none');
        expect(cells[0].text).toBe('Born to Run');
        expect(cells[0].state).toBe('has');
    });

    test('cell content: attributes "/"-joined in light green italics, a medley as two rows, the attribute column one row each', async ({ page }) => {
        await setupRecordingOf(page, { settings: { sa_recording_of_suggest_enable: false } });
        await page.locator('.mb-recof-col-hdr-btn').click();
        await expect(page.locator('.mb-recof-col-hdr-btn')).toHaveAttribute('aria-pressed', 'true', { timeout: 15000 });
        const rec = await columnCells(page, 'Recording of');
        const att = await columnCells(page, 'Performance attributes');
        const chf = recofIdx('Can’t Help Falling in Love');
        expect(rec[chf].text).toBe('Can’t Help Falling in Love (cover/live)');
        expect(att[chf].html).toContain('<span class="mb-credit-attr">cover</span>');
        expect(att[chf].html).toContain('<span class="mb-credit-attr">live</span>');
        expect(att[chf].html).toContain('<span class="mb-credit-date">1981-04-18</span>');
        const medley = recofIdx('(Love Is Like a) Heatwave / Jackson Cage');
        // Two rows (the second collapsed behind the ▶2▤ cell toggle).
        expect((rec[medley].html.match(/<li\b/g) || []).length).toBe(2);
        expect(rec[medley].html).toContain('mb-cell-collapse-toggle');
        expect(rec[medley].html).toContain('<span class="mb-credit-attr">cover/live/medley</span>');
        // The attribute column dedupes across the two relations.
        expect((att[medley].html.match(/class="mb-credit-attr"/g) || []).length).toBe(3);
        const style = await page.evaluate(() => {
            const s = document.querySelector('td.mb-recof-cell .mb-credit-attr');
            const cs = getComputedStyle(s);
            return { color: cs.color, fontStyle: cs.fontStyle };
        });
        expect(style).toEqual({ color: 'rgb(67, 160, 71)', fontStyle: 'italic' });
        // Plain relation: no brackets.
        expect(rec[0].text).toBe('Born to Run');
        expect(att[0].text).toBe('');
    });

    test('a cell click loads that one row with one request', async ({ page }) => {
        const { calls } = await setupRecordingOf(page, { settings: { sa_recording_of_suggest_enable: false } });
        const row = recofIdx('Jungleland');
        await page.locator('table.tbl tbody tr').nth(row).locator('td.mb-recof-cell').click();
        await expect.poll(async () => (await columnCells(page, 'Recording of'))[row].text).toBe('Jungleland (instrumental)');
        expect(calls.map((c) => c.kind)).toEqual(['lookup']);
        const others = (await columnCells(page, 'Recording of')).filter((c, i) => i !== row);
        expect(others.every((c) => c.state === null)).toBe(true);
    });

    test('a failed row shows ⚠, is not cached, and a click retries it', async ({ page }) => {
        let failing = true;
        const { calls } = await setupRecordingOf(page, {
            settings: { sa_recording_of_suggest_enable: false },
            fail: () => (failing ? 503 : null),
        });
        const row = recofIdx('Thunder Road');
        const td = page.locator('table.tbl tbody tr').nth(row).locator('td.mb-recof-cell');
        await td.click();
        await expect(td).toHaveAttribute('data-recof', 'error', { timeout: 20000 });
        expect(calls.length).toBe(3);   // three attempts
        failing = false;
        await td.click();
        await expect(td).toHaveAttribute('data-recof', 'has', { timeout: 10000 });
        await expect(td).toHaveText('Thunder Road (partial)');
    });

    test('a reload answers from IndexedDB with zero requests', async ({ page }) => {
        const first = await setupRecordingOf(page, { settings: { sa_recording_of_suggest_enable: false } });
        await page.locator('.mb-recof-col-hdr-btn').click();
        await expect(page.locator('.mb-recof-col-hdr-btn')).toHaveAttribute('aria-pressed', 'true', { timeout: 15000 });
        expect(first.calls.length).toBe(1);
        // Same origin, same IndexedDB: a fresh load of the page.
        await page.unrouteAll({ behavior: 'ignoreErrors' });
        const second = await setupRecordingOf(page, { settings: { sa_recording_of_suggest_enable: false } });
        await page.locator('.mb-recof-col-hdr-btn').click();
        await expect(page.locator('.mb-recof-col-hdr-btn')).toHaveAttribute('aria-pressed', 'true', { timeout: 15000 });
        expect(second.calls).toEqual([]);
        expect((await columnCells(page, 'Recording of'))[0].text).toBe('Born to Run');
    });

    test('a large catalogue: one browse page, then one lookup per remaining row', async ({ page }) => {
        // 100 000 recordings = 1 000 browse pages; the 12 rows the first page
        // did not answer cost 12 lookups, so the loader switches.
        const { calls } = await setupRecordingOf(page, {
            catalogue: 100000, browseFirst: 4, settings: { sa_recording_of_suggest_enable: false },
        });
        await page.locator('.mb-recof-col-hdr-btn').click();
        await expect(page.locator('.mb-recof-col-hdr-btn')).toHaveAttribute('aria-pressed', 'true', { timeout: 30000 });
        const kinds = calls.map((c) => c.kind);
        expect(kinds[0]).toBe('browse');
        expect(kinds.slice(1)).toEqual(Array(DATA.recordings.length - 4).fill('lookup'));
    });

    test('a catalogue only a little bigger than the page keeps browsing', async ({ page }) => {
        // 150 recordings = 2 pages; after the first page answered 4 rows, one
        // more page beats 12 lookups.
        const { calls } = await setupRecordingOf(page, {
            catalogue: 150, browseFirst: 4, settings: { sa_recording_of_suggest_enable: false },
        });
        await page.locator('.mb-recof-col-hdr-btn').click();
        await expect(page.locator('.mb-recof-col-hdr-btn')).toHaveAttribute('aria-pressed', 'true', { timeout: 30000 });
        expect(calls.map((c) => c.kind)).toEqual(['browse', 'browse']);
        expect(calls[1].url).toContain('offset=100');
    });

    test('with browse batching off, every row is a lookup', async ({ page }) => {
        const { calls } = await setupRecordingOf(page, {
            settings: { sa_recording_of_suggest_enable: false, sa_recording_of_browse_batch_enable: false },
        });
        await page.locator('.mb-recof-col-hdr-btn').click();
        await expect(page.locator('.mb-recof-col-hdr-btn')).toHaveAttribute('aria-pressed', 'true', { timeout: 30000 });
        expect(calls.map((c) => c.kind)).toEqual(Array(DATA.recordings.length).fill('lookup'));
    });

    test('the toggle opens the progress card with progress, source and the IndexedDB cache', async ({ page }) => {
        await setupRecordingOf(page, {
            settings: { sa_recording_of_suggest_enable: false, sa_async_pop_auto_open: true },
        });
        await page.locator('.mb-recof-col-hdr-btn').click();
        const pop = page.locator('#mb-async-pop');
        await expect(pop).toBeVisible();
        await expect(pop.locator('.mb-tt-title')).toContainText('Recording of');
        await expect(pop.locator('[data-mb-aj-phase]')).toHaveAttribute('data-mb-aj-phase', 'done', { timeout: 15000 });
        await expect(pop.locator('.mb-tt-ajcount')).toContainText(`${DATA.recordings.length} / ${DATA.recordings.length}`);
        await expect(pop.locator('.mb-tt-ajfacts').first()).toContainText('the artist\'s recordings, 100 per request');
        await expect(pop.locator('.mb-tt-ajcache')).toContainText('recof-ws2');
        await expect(pop.locator('.mb-tt-ajcache')).toContainText('0 memory · 0 IndexedDB · 16 network');
    });

    test('a filter typed BEFORE loading finds the rows once they load', async ({ page }) => {
        // The filter caches each row's (empty) column text while nothing is
        // loaded; the load must drop those caches and re-run the filter.
        await setupRecordingOf(page, { settings: { sa_recording_of_suggest_enable: false } });
        const idx = (await headerNames(page)).indexOf('Recording of');
        const input = columnFilterInput(page, idx);
        await input.click();
        await input.pressSequentially('Heat Wave');
        await expect.poll(() => page.locator('table.tbl tbody tr:visible').count(), { timeout: 15000 }).toBe(0);
        await page.locator('.mb-recof-col-hdr-btn').click();
        await expect.poll(() => page.locator('table.tbl tbody tr:visible').count(), { timeout: 15000 }).toBe(1);
    });

    test('a column filter finds a loaded work title', async ({ page }) => {
        await setupRecordingOf(page, { settings: { sa_recording_of_suggest_enable: false } });
        await page.locator('.mb-recof-col-hdr-btn').click();
        await expect(page.locator('.mb-recof-col-hdr-btn')).toHaveAttribute('aria-pressed', 'true', { timeout: 15000 });
        const idx = (await headerNames(page)).indexOf('Recording of');
        // Click first: the inputs are readonly until a genuine interaction.
        const input = columnFilterInput(page, idx);
        await input.click();
        await input.pressSequentially('Heat Wave');
        await expect.poll(() => page.locator('table.tbl tbody tr:visible').count(), { timeout: 15000 }).toBe(1);
    });
});
