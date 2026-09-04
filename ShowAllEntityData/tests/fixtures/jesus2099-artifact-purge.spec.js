'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForFilterSettled, getPageRowCount } = require('../support/filterSortAssertions');

// Regression coverage for purgeJesus2099Artifacts()/_stripJesus2099InTable().
//
// jesus2099's "mb. SUPER MIND CONTROL Ⅱ X TURBO" mutates the native page in
// place before this script scrapes it, and those mutations rode along into our
// own rendered table: the reported symptom was a rendered header reading
//
//   <th class="treleases mb-original-column"
//       title="SUPER MIND CONTROL Ⅱ X TURBO"
//       style="text-shadow: yellow 0px 0px 2px; …" data-col-name="Length">
//
// makeTableSortableUnified() rebuilds th.innerHTML but never resets
// className/title/style, so all three survived. The same applied to every
// Length <td> and, on release pages, to the whole jesus2099userjs81127*
// tracklist family.
//
// The purge is scoped to table.tbl on purpose — jesus2099's features on the
// SURROUNDING page (sidebar search links, pending-edit counters) must keep
// working exactly as before, so this spec asserts both halves of that boundary.
const ARTIST_RECORDINGS_URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/recordings';
const FIXTURE_FILE = path.join(__dirname, 'jesus2099-artifact-purge.html');

/** Every jesus2099/treleases class token still present inside any rendered table.tbl. */
async function markersInsideTables(page) {
    return page.evaluate(() => {
        const out = [];
        document.querySelectorAll('table.tbl').forEach((tbl) => {
            const visit = (el) => {
                Array.from(el.classList).forEach((t) => {
                    if (t === 'treleases' || /^jesus2099/i.test(t)) out.push(t);
                });
            };
            visit(tbl);
            tbl.querySelectorAll('*').forEach(visit);
        });
        return out;
    });
}

/** Resolves the rendered column index of the header whose clean name is `colName`. */
async function columnIndex(page, colName) {
    return page.evaluate((name) => {
        const strip = (t) => t.replace(/[⇅▲▼📊▶◀▤0-9⁰¹²³⁴⁵⁶⁷⁸⁹]/g, '').trim();
        return Array.from(document.querySelectorAll('table.tbl thead th'))
            .findIndex((t) => (t.dataset.colName || strip(t.textContent)) === name);
    }, colName);
}

test.describe('jesus2099 artifact purge on the final rendered page', () => {
    test.beforeEach(async ({ page }) => {
        await loadUserscriptPage(page, { url: ARTIST_RECORDINGS_URL, fixtureFile: FIXTURE_FILE, testMode: true });
        await page.route(`${ARTIST_RECORDINGS_URL}?**`, (route) => route.fulfill({ path: FIXTURE_FILE, contentType: 'text/html' }));
        await page.click('button[data-label="⊚ All recordings"]');
        await page.waitForSelector('#mb-filter-container');
    });

    test('no jesus2099 marker, plugin title or text-shadow survives inside the rendered table', async ({ page }) => {
        expect(await markersInsideTables(page)).toEqual([]);

        // The reported header artifact specifically: class gone, but our own
        // marker class and data-col-name (added by cleanupHeaders()/
        // makeTableSortableUnified()) are untouched.
        const lengthTh = await page.evaluate(() => {
            const th = Array.from(document.querySelectorAll('table.tbl thead th'))
                .find((t) => t.dataset.colName === 'Length');
            if (!th) return null;
            return {
                classes: Array.from(th.classList),
                title: th.getAttribute('title'),
                textShadow: th.style.textShadow,
                name: th.dataset.colName,
            };
        });
        expect(lengthTh).not.toBeNull();
        expect(lengthTh.classes).not.toContain('treleases');
        expect(lengthTh.classes).toContain('mb-original-column');
        expect(lengthTh.title).toBeNull();
        expect(lengthTh.textShadow).toBe('');
        expect(lengthTh.name).toBe('Length');

        // Pure-decoration elements are removed outright.
        expect(await page.locator('table.tbl [class*="toolzone"]').count()).toBe(0);
        expect(await page.locator('table.tbl [class*="openEdits"]').count()).toBe(0);
    });

    test('real MusicBrainz content carrying a marker keeps the element, loses only the marker', async ({ page }) => {
        // <a class="jesus2099userjs81127recording"> sits on the recording TITLE
        // link and <td class="title wrap-anywhere jesus2099userjs81127acoustids-handled">
        // on the Title cell itself — removing either would delete real content.
        // Scoped to the Name column's own cell: `extractMainColumn: 'Name'`
        // legitimately clones this same link into the synthetic "MB-Name"
        // column, so an unscoped href lookup finds two anchors by design.
        const nameIdx = await columnIndex(page, 'Name');
        const trackA = page.locator(
            `table.tbl tbody tr:first-child td:nth-child(${nameIdx + 1}) a[href="/recording/11111111-2222-4333-8444-555555555501"]`);
        await expect(trackA).toHaveCount(1);
        await expect(trackA).toHaveText('Track A');

        const tdClasses = await page.evaluate((idx) => {
            const td = document.querySelector('table.tbl tbody tr:first-child').cells[idx];
            return td ? Array.from(td.classList) : null;
        }, nameIdx);
        expect(tdClasses).toContain('title');
        expect(tdClasses).toContain('wrap-anywhere');
        expect(tdClasses.filter((c) => /^jesus2099/i.test(c))).toEqual([]);

        // All three Length values still render (the purge touches decoration,
        // never the duration text jesus2099 had written).
        const lengthIdx = await columnIndex(page, 'Length');
        const lengths = await page.evaluate((idx) => Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .map((tr) => tr.cells[idx].textContent.replace(/\s+/g, '')), lengthIdx);
        expect(lengths).toEqual(['4:50.160', '3:11.666', '?:??']);
    });

    test('jesus2099 features OUTSIDE table.tbl are left untouched', async ({ page }) => {
        await expect(page.locator('#content ul.jesus2099_all-links_searchLinks')).toHaveCount(1);
        await expect(page.locator('#content a.jesus2099_all-links_wd-Q42')).toHaveCount(1);
        const pending = page.locator('#content span.jesus2099PendingEditsCount');
        await expect(pending).toHaveCount(1);
        await expect(pending).toHaveText('7');
    });

    test('markers do not reappear after a filter re-render', async ({ page }) => {
        // runFilter() re-renders by inserting cloneNode(true) copies of the
        // CAPTURED source rows, and classes/attributes survive cloning — so a
        // purge that only cleaned the live DOM would paste every marker back in
        // on the next keystroke. This is the source-row half of the fix.
        const nameIdx = await columnIndex(page, 'Name');
        const colInput = page.locator(`table.tbl thead .mb-col-filter-input[data-col-idx="${nameIdx}"]`).first();
        await colInput.click();
        await waitForFilterSettled(page, () => colInput.pressSequentially('Track A'));

        expect((await getPageRowCount(page)).filtered).toBe(1);
        expect(await markersInsideTables(page)).toEqual([]);
    });

    test('_stripJesus2099InTable dispositions: skip artwork family, remove decoration, strip marker', async ({ page }) => {
        // Direct unit check of all three dispositions on a hand-built fragment.
        // The cover-art icon family is asserted here rather than through the
        // fixture because it already has its own deliberately GATED handling
        // (applyColumnErasers()'s Strategy 2 and _stripTransientCellState()'s
        // _hadInlineArtPh gate) — re-stripping it in this pass would reintroduce
        // the regression documented in debug/CAA-missing-doubled.org.
        const result = await page.evaluate(() => {
            const host = document.createElement('div');
            host.id = 'j2-unit';
            // The <td> must be parsed inside a real table — a <td> written
            // straight into a <div>'s innerHTML is silently dropped by the
            // HTML parser, which would make that assertion vacuous.
            host.innerHTML = [
                '<a href="/release/abc/cover-art"><span class="caa-icon jesus2099userjs154481"></span></a>',
                '<div class="jesus2099userjs81127toolzone">decoration</div>',
                '<span class="jesus2099userjs81127recdis comment">(live, 2002)</span>',
                '<table><tbody><tr>',
                // NATIVE MusicBrainz Length cell: `treleases` with no plugin
                // title and no yellow text-shadow. MusicBrainz marks a release
                // tracklist's own Length column exactly like this, so it must
                // survive untouched — see _isJesus2099Treleases().
                '<td class="treleases">3:12</td>',
                '<td class="treleases" title="SUPER MIND CONTROL" style="text-shadow: yellow 0px 0px 2px;">4:50</td>',
                '</tr></tbody></table>',
            ].join('');
            document.body.appendChild(host);
            return window.__saTest.stripJesus2099InTable('#j2-unit');
        });

        expect(result).not.toBeNull();
        // The toolzone div is the only removal; the jesus2099 treleases <td>
        // (plugin title present) and the recdis <span> are marker-stripped; the
        // caa-icon anchor and the NATIVE treleases <td> are both skipped.
        expect(result.removed).toBe(1);
        expect(result.stripped).toBe(2);

        // Only the artwork family is still reported as an outstanding marker
        // (it is owned elsewhere, with a load-bearing gate). The native
        // `treleases` cell does NOT appear here: markersLeft is built from
        // _j2MarkerTokens(), which no longer attributes an unaccompanied
        // `treleases` to jesus2099 at all — so its survival is asserted on the
        // resulting markup instead.
        expect(result.markersLeft).toEqual(['jesus2099userjs154481']);
        expect(result.html).toContain('caa-icon');
        expect(result.html).toContain('<td class="treleases">3:12</td>');

        expect(result.html).not.toContain('toolzone');
        expect(result.html).not.toContain('decoration');
        // Marker stripped, native `comment` class and text preserved.
        expect(result.html).toContain('class="comment"');
        expect(result.html).toContain('(live, 2002)');
        // Plugin title and text-shadow dropped from the cell, text kept.
        expect(result.html).not.toContain('MIND');
        expect(result.html).not.toContain('text-shadow');
        expect(result.html).toContain('4:50');
    });
});
