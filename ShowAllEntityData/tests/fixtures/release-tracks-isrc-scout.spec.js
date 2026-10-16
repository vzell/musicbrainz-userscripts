'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { injectThirdPartyScript } = require('../support/thirdPartyScripts');
const {
    waitForSortSettled, waitForFilterSettled, waitForColHeaderUniqCount,
    columnIndex, columnFilterInput, typeGlobalFilter,
} = require('../support/filterSortAssertions');

// "ISRC Scout" (@majkinetor) adds an "ISRC" and a "Links" column to the
// release tracklist (debug/DaD-ISRC-Links-initial.html,
// debug/multiple-ISRC.html). release-tracks rebuilds both before the render:
//   - ISRC: one ul > li > a > code per ISRC (_normalizeIsrcScoutTd()), so it
//     is a multi-row column with the "ISRCs" column's 📊 sections, ISRC
//     formatting and "Invalid ISRC format" finding (_isIsrcColumnName());
//   - Links: each icon link gets its platform name as hidden filter text
//     (_normalizeIsrcScoutLinksTd()), and the "N links" badge digits leave
//     the filter text (_CLEAN_STRIP_SEL), so the 📊 count, the new
//     "Links info - Platform" section and typed filters read platforms.
//
// Fixture: the six-track "Seren E.P." release page (release-tracks-remix-eti.html,
// as the server sent it). Its ISRC Scout columns come from the simulator
// tests/fixtures/thirdPartyScripts/isrc-scout-columns.js, which runs at
// DOMContentLoaded — the columns are on the page before the "Tracks" button
// is pressed, the order the real script's async load gives when the user
// waits for them.
const RELEASE_URL = 'https://musicbrainz.org/release/f6215982-62e1-4b81-b88f-754dca0da149';
const FIXTURE = path.join(__dirname, 'release-tracks-remix-eti.html');

const T = [
    'b2f15897-6308-3646-aa0f-59fb716efab7',
    'a86b2960-e793-3a71-b9f5-fe5b362810d9',
    '4153a710-ad68-3049-bb5e-4ef35e0d6b39',
    'd83bc345-2392-38c5-9558-45cb8483905b',
    'dcee82bf-26f7-3e58-a1ed-f463a64ed647',
    '45e04ad8-fa8d-3bfb-868e-f5d4a44db49b',
];
const L = (name, extra = {}) => ({ name, url: `https://example.org/${encodeURIComponent(name)}`, ...extra });
// One, two and three ISRCs; none; one invalid; one again. Codes from
// debug/multiple-ISRC.html and debug/DaD-ISRC-Links-initial.html.
const TRACKS = {
    [T[0]]: { isrcs: ['USSM10501304'], links: [L('Spotify'), L('YouTube')] },
    [T[1]]: { isrcs: ['USAR10000249', 'USAR18700121'], links: [L('Deezer'), L('Spotify', { n: 2 }), L('Tidal')] },
    [T[2]]: { isrcs: ['DEC731400130', 'DEC738500001', 'DEC738500097'], links: [L('Spotify'), L('Apple Music', { n: 3 })] },
    [T[3]]: { isrcs: [], links: [] },
    [T[4]]: { isrcs: ['XX12345'], links: [L('whosampled.com', { ended: true })] },
    [T[5]]: { isrcs: ['USSM18400416'], links: [L('Spotify'), L('Deezer')] },
};

/**
 * Loads the fixture with the ISRC Scout simulator and renders the tracks.
 *
 * @param {import('@playwright/test').Page} page
 */
async function renderTracks(page) {
    // A freshly fetched release fixture names CURRENT static.metabrainz.org
    // bundles, which would re-render the tracklist from JSON
    // (docs/claude/release-tracks-and-length.md, "Fixture trap").
    await page.context().route('https://static.metabrainz.org/**', (route) => route.abort('blockedbyclient'));
    await injectThirdPartyScript(page, 'isrc-scout-columns', { when: 'init', config: { tracks: TRACKS } });
    await loadUserscriptPage(page, {
        url: RELEASE_URL,
        fixtureFile: FIXTURE,
        testMode: true,
        settingsOverride: { sa_enable_release_tracks: true, sa_uvd_autocollapse_threshold: 0 },
    });
    await expect(page.locator('html[data-isrc-scout-sim="ready"]')).toBeAttached();
    await expect(page.locator(`tr[id="${T[0]}"] > td.ii-col-isrc`)).toHaveCount(1);
    await page.click('button[data-label="Show all Tracks for Release"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/**
 * Lets the simulator's MutationObserver run a pass over the latest DOM change
 * (one requestAnimationFrame per burst), so a test can see whether it added
 * anything.
 *
 * @param {import('@playwright/test').Page} page
 */
async function settleSimulator(page) {
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 50)))));
}

/**
 * Opens a column's 📊 panel and returns its sections as `{label: {item: count}}`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} colName
 * @returns {Promise<Object<string, Object<string, number>>>}
 */
async function sectionsOf(page, colName) {
    // The panel opens where its header is; the Links column sits far to the
    // right of a wide table, so bring the header on screen first, as a user
    // would, or the panel opens outside the viewport.
    await page.locator(`table.tbl thead th[data-col-name="${colName}"]`).scrollIntoViewIfNeeded();
    const sections = await page.evaluate((c) => window.__saTest.getUniqDropSections(c), colName);
    return Object.fromEntries((sections || []).map((s) => [s.label, Object.fromEntries(s.items.map((i) => [i.label, i.count]))]));
}

/**
 * Ticks one 📊 entry by its exact label (the panel must be open) and waits
 * for the re-filter.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} label
 */
async function tick(page, label) {
    await page.locator('.mb-col-uniq-item').filter({ hasText: label }).first().click();
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/**
 * Per visible row of the tracklist: track id, the ISRC cell's codes (from the
 * hrefs), the number of ISRC/Links cells, the Links cell's platforms, and
 * which of those platforms' anchors are outlined (a filter highlight inside).
 *
 * @param {import('@playwright/test').Page} page
 */
const visibleRows = (page) => page.evaluate(() => {
    const tbl = document.querySelector('table.tbl');
    return Array.from(tbl.querySelectorAll('tbody tr'))
        .filter((tr) => tr.style.display !== 'none' && tr.id)
        .map((tr) => {
            const isrcTd = tr.querySelector(':scope > td.ii-col-isrc');
            const linksTd = tr.querySelector(':scope > td.ii-col-links');
            const anchors = linksTd ? Array.from(linksTd.querySelectorAll('a.ii-trk-ln')) : [];
            return {
                id: tr.id,
                isrcCells: tr.querySelectorAll(':scope > td.ii-col-isrc').length,
                linksCells: tr.querySelectorAll(':scope > td.ii-col-links').length,
                codes: isrcTd ? Array.from(isrcTd.querySelectorAll('a[href^="/isrc/"]'), (a) => a.getAttribute('href').slice(6)) : [],
                platforms: anchors.map((a) => a.dataset.mbLinkPlatform || null),
                outlined: anchors.filter((a) => getComputedStyle(a).outlineStyle === 'solid').map((a) => a.dataset.mbLinkPlatform),
            };
        });
});

test.describe('ISRC Scout columns on release-tracks', () => {
    test('ISRC is a multi-row list, one li per code, with a collapse toggle', async ({ page }) => {
        await renderTracks(page);
        // Pins: the cell is rebuilt into ul > li (one per ISRC) — what makes it
        // a multi-row cell — not just "the codes survived".
        const cells = await page.evaluate((ids) => ids.map((id) => {
            const td = document.querySelector(`table.tbl tr[id="${id}"] > td.ii-col-isrc`);
            return {
                lis: td ? td.querySelectorAll(':scope > ul > li').length : -1,
                stray: td ? td.querySelectorAll(':scope > a').length : -1,
                toggle: !!(td && td.querySelector('.mb-cell-collapse-toggle')),
                classes: td ? td.className : '',
            };
        }), T);
        expect(cells.map((c) => c.lis)).toEqual([1, 2, 3, 0, 1, 1]);
        expect(cells.every((c) => c.stray === 0)).toBe(true);
        expect(cells.map((c) => c.toggle)).toEqual([false, true, true, false, false, false]);
        // The cell keeps ISRC Scout's classes, so its observer never adds a second one.
        expect(cells.every((c) => /\bii-col\b/.test(c.classes) && /\bii-col-isrc\b/.test(c.classes))).toBe(true);
        // The column header has a collapse button, as every multi-row column does.
        const th = page.locator('table.tbl thead th[data-col-name="ISRC"]');
        await expect(th.locator('.mb-col-collapse-hdr-btn')).toHaveCount(1);
    });

    test('codes are shown CC-XXX-YY-NNNNN in four segment spans; the invalid one is flagged', async ({ page }) => {
        await renderTracks(page);
        const out = await page.evaluate(() => Array.from(
            document.querySelectorAll('table.tbl td.ii-col-isrc a[href^="/isrc/"]'),
            (a) => ({
                code: a.getAttribute('href').slice(6),
                text: a.querySelector('code') ? a.querySelector('code').textContent : null,
                segs: a.querySelector('code') ? a.querySelector('code').children.length : 0,
                invalid: a.getAttribute('data-mb-isrc-invalid'),
                scoutSpans: a.querySelectorAll('.ii-isrcf').length,
            })));
        const byCode = Object.fromEntries(out.map((o) => [o.code, o]));
        expect(byCode.USAR18700121).toEqual({ code: 'USAR18700121', text: 'US-AR1-87-00121', segs: 4, invalid: null, scoutSpans: 0 });
        expect(byCode.DEC738500097.text).toBe('DE-C73-85-00097');
        expect(byCode.XX12345).toEqual({ code: 'XX12345', text: 'XX12345', segs: 0, invalid: '1', scoutSpans: 0 });
    });

    test('📊 on ISRC: Country/Registrant/Year/Designation/Validity; a Year tick narrows and marks the year', async ({ page }) => {
        await renderTracks(page);
        const s = await sectionsOf(page, 'ISRC');
        expect(s['ISRC - Country']).toEqual({ '» country: DE': 1, '» country: US': 3 });
        expect(s['ISRC - Registrant']).toEqual({ '» registrant: AR1': 1, '» registrant: C73': 1, '» registrant: SM1': 2 });
        expect(s['ISRC - Year']).toEqual({
            '» year: 1984': 1, '» year: 1985': 1, '» year: 1987': 1,
            '» year: 2000': 1, '» year: 2005': 1, '» year: 2014': 1,
        });
        expect(Object.keys(s['ISRC - Designation'])).toHaveLength(7);
        // Valid: tracks 1, 2, 3 and 6; invalid: track 5 ("XX12345"); track 4 has none.
        expect(Object.values(s['ISRC - Validity']).sort()).toEqual([1, 4]);

        await tick(page, '» year: 1987');
        const rows = await visibleRows(page);
        expect(rows.map((r) => r.id)).toEqual([T[1]]);
        // Pins: the mark is on the YEAR segment of the 1987 code only.
        const marks = await page.evaluate((id) => Array.from(
            document.querySelectorAll(`table.tbl tr[id="${id}"] td.ii-col-isrc .mb-column-filter-highlight`),
            (m) => ({ text: m.textContent, code: m.closest('a').getAttribute('href').slice(6) })), T[1]);
        expect(marks).toEqual([{ text: '87', code: 'USAR18700121' }]);
    });

    test('the invalid ISRC is an "Invalid ISRC format" finding on the ISRC cell', async ({ page }) => {
        await renderTracks(page);
        const flagged = await page.evaluate(() => Array.from(
            document.querySelectorAll('table.tbl td.ii-col-isrc[data-mb-findings~="isrc-invalid"]'),
            (td) => td.closest('tr').id));
        expect(flagged).toEqual([T[4]]);
    });

    test('sorting by ISRC orders rows by their codes, one ISRC/Links cell each, no extra cells from ISRC Scout', async ({ page }) => {
        await renderTracks(page);
        const th = page.locator('table.tbl thead th[data-col-name="ISRC"]');
        await waitForSortSettled(page, () => th.locator('.sort-icon-btn', { hasText: '▲' }).click());
        await settleSimulator(page);
        const rows = await visibleRows(page);
        expect(rows).toHaveLength(6);
        expect(rows.every((r) => r.isrcCells === 1 && r.linksCells === 1)).toBe(true);
        // Pins: ORDER by the ISRC text (DE < US-AR1 < US-SM1-05 < US-SM1-84 <
        // XX), not merely "the codes survive a sort". The empty row's place
        // is the engine's business, so it is left out.
        const order = rows.filter((r) => r.codes.length).map((r) => r.id);
        expect(order).toEqual([T[2], T[1], T[0], T[5], T[4]]);
        // Every row still holds ITS OWN codes.
        const byId = Object.fromEntries(rows.map((r) => [r.id, r.codes]));
        T.forEach((id) => expect(byId[id]).toEqual(TRACKS[id].isrcs));

        // A sort by another column re-renders again; still one cell each.
        const titleTh = page.locator('table.tbl thead th[data-col-name="Title"]');
        await waitForSortSettled(page, () => titleTh.locator('.sort-icon-btn', { hasText: '▼' }).click());
        await settleSimulator(page);
        const again = await visibleRows(page);
        expect(again.every((r) => r.isrcCells === 1 && r.linksCells === 1)).toBe(true);
    });

    test('ISRC and Links headers carry the sort buttons and the 📊 button', async ({ page }) => {
        await renderTracks(page);
        for (const name of ['ISRC', 'Links']) {
            const th = page.locator(`table.tbl thead th[data-col-name="${name}"]`);
            await expect(th).toHaveCount(1);
            await expect(th.locator('.sort-icon-btn')).toHaveCount(3);
            await expect(th.locator('.mb-col-uniq-btn')).toHaveCount(1);
        }
    });

    test('Links: the 📊 count is distinct platform sets; "Links info - Platform" counts rows per platform', async ({ page }) => {
        await renderTracks(page);
        // Pins the count's MEANING: 5 distinct per-row platform sets (the
        // empty row does not count). The old count was the distinct "N links"
        // badge digits ("2", "3" here = 2).
        await waitForColHeaderUniqCount(page, 'Links', 5);
        const s = await sectionsOf(page, 'Links');
        expect(s['Links info - Platform']).toEqual({
            '» platform: Apple Music': 1, '» platform: Deezer': 2, '» platform: Spotify': 4,
            '» platform: Tidal': 1, '» platform: whosampled.com': 1, '» platform: YouTube': 1,
        });
        // The plain values are exactly the per-row platform sets: no "N links"
        // badge digit inside one ("Deezer Spotify 2 Tidal" is what a leak
        // looks like — the count alone cannot see it, every set stays distinct).
        const plain = await page.evaluate(() => Array.from(
            document.querySelectorAll('#mb-col-uniq-dropdown .mb-col-uniq-item'))
            .filter((el) => !el.dataset.mbUniqSynLabel)
            // Each entry reads "☐(count)value".
            .map((el) => el.textContent.replace(/^\s*[☐☑]?\s*\(\d+\)/u, '').replace(/\s+/g, ' ').trim()));
        expect(plain.sort()).toEqual([
            'Deezer Spotify Tidal', 'Spotify Apple Music', 'Spotify Deezer', 'Spotify YouTube', 'whosampled.com',
        ]);
        // Each platform entry shows that platform's icon after its label.
        const icons = await page.evaluate(() => Array.from(document.querySelectorAll('.mb-col-uniq-item'))
            .filter((i) => /» platform: /.test(i.textContent))
            .map((i) => !!i.querySelector('.mb-uniq-link-platform-icon svg')));
        expect(icons).toHaveLength(6);
        expect(icons.every(Boolean)).toBe(true);
    });

    test('Links: ticking a platform narrows the rows and outlines exactly that platform\'s icons', async ({ page }) => {
        await renderTracks(page);
        await sectionsOf(page, 'Links');
        await tick(page, '» platform: Deezer');
        const rows = await visibleRows(page);
        expect(rows.map((r) => r.id)).toEqual([T[1], T[5]]);
        rows.forEach((r) => expect(r.outlined).toEqual(['Deezer']));
    });

    test('Links: a typed column filter "Spotify" matches the hidden names and outlines those icons', async ({ page }) => {
        await renderTracks(page);
        const idx = await columnIndex(page, 'Links');
        const input = columnFilterInput(page, idx);
        await input.click();
        await waitForFilterSettled(page, () => input.pressSequentially('Spotify'));
        const rows = await visibleRows(page);
        expect(rows.map((r) => r.id).sort()).toEqual([T[0], T[1], T[2], T[5]].sort());
        rows.forEach((r) => expect(r.outlined).toEqual(['Spotify']));
    });

    // The highlighter rule (CLAUDE.md, "Common pitfalls"): two filters that
    // mark the SAME text — here the ticked Spotify entry and a global filter
    // "Spotify", both in one hidden name span — in both orders.
    for (const order of ['global filter first', 'tick first']) {
        test(`Links: a ticked Spotify entry AND a global filter "Spotify" mark the same icons (${order})`, async ({ page }) => {
            await renderTracks(page);
            const type = () => waitForFilterSettled(page, () => typeGlobalFilter(page, 'Spotify'));
            const tickIt = async () => {
                await sectionsOf(page, 'Links');
                await tick(page, '» platform: Spotify');
                await page.keyboard.press('Escape');
            };
            if (order === 'tick first') { await tickIt(); await type(); } else { await type(); await tickIt(); }
            const rows = await visibleRows(page);
            expect(rows.map((r) => r.id).sort()).toEqual([T[0], T[1], T[2], T[5]].sort());
            rows.forEach((r) => expect(r.outlined).toEqual(['Spotify']));
            // The hidden name still reads "Spotify" as one piece of text.
            const names = await page.evaluate(() => Array.from(
                document.querySelectorAll('table.tbl a.ii-trk-ln[data-mb-link-platform="Spotify"] .mb-ii-link-name'),
                (n) => n.textContent));
            expect(names.length).toBeGreaterThan(0);
            expect(names.every((n) => n === 'Spotify')).toBe(true);
        });
    }

    test('Links icons look unchanged: same anchors, the hidden name takes no space', async ({ page }) => {
        await renderTracks(page);
        const out = await page.evaluate(() => Array.from(document.querySelectorAll('table.tbl td.ii-col-links a.ii-trk-ln'), (a) => {
            const name = a.querySelector('.mb-ii-link-name');
            return {
                platform: a.dataset.mbLinkPlatform,
                nameText: name ? name.textContent : null,
                display: name ? getComputedStyle(name).display : null,
                svgs: a.querySelectorAll('svg').length,
            };
        }));
        // 2 + 3 + 2 + 0 + 1 + 2 icons, as the simulator drew them.
        expect(out).toHaveLength(10);
        expect(out.every((o) => o.platform === o.nameText && o.display === 'none' && o.svgs === 1)).toBe(true);
        // "(ended)" is not part of the platform name.
        expect(out.map((o) => o.platform)).toContain('whosampled.com');
    });

    test('Links icons carry no new-tab padding from SUPER MIND CONTROL, other new-tab links keep it', async ({ page }) => {
        // jesus2099's SUPER MIND CONTROL (mb_SUPER-MIND-CONTROL-II-X-TURBO,
        // addCSSRule) pads every a[target='_blank'] by 16px for its new-window
        // sprite. Against ISRC Scout's 224px icon row, six platforms wrapped
        // onto two lines (debug/links-overflow.html). Pins: the Links icons
        // lose the padding and the sprite; a new-tab link anywhere else keeps
        // both, so the reset is scoped to the Links cells.
        await renderTracks(page);
        const out = await page.evaluate(() => {
            const st = document.createElement('style');
            st.textContent = "a[target='_blank'] { padding-right: 16px; background: no-repeat 99% url(data:image/gif;base64,R0lGODlhAQABAAAAACw=); }";
            document.head.appendChild(st);
            const other = document.createElement('a');
            other.href = 'https://example.org/';
            other.target = '_blank';
            other.textContent = 'elsewhere';
            document.body.appendChild(other);
            const css = (a) => ({ pad: getComputedStyle(a).paddingRight, bg: getComputedStyle(a).backgroundImage });
            return {
                icons: Array.from(document.querySelectorAll('table.tbl td.ii-col-links a.ii-trk-ln'), css),
                other: css(other),
            };
        });
        expect(out.icons).toHaveLength(10);
        expect(out.icons.every((c) => c.pad === '0px' && c.bg === 'none')).toBe(true);
        expect(out.other.pad).toBe('16px');
        expect(out.other.bg).not.toBe('none');
    });
});
