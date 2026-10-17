'use strict';

// The diff view of comparison tooltips (org/TODO.org "the rich tooltips should
// show track/recording differences below each other in a diff like view").
// Mockup approved 2026-10-17, variant A: https://claude.ai/artifact/7Nbqih988jfzpGxbiQTX75
//
// ── What each test pins ─────────────────────────────────────────────────────
//
//  1. WHICH characters are marked, not merely that a block exists: a case
//     change marks the one letter in each row; a typographic swap marks the
//     one character and names both with their code points; added text marks
//     only itself; a reorder is one mark per row; two values that share
//     little are shown unmarked; equal values give no block at all.
//  2. A comparison is shown only for the text it was built for: a title
//     written later by anything else never pairs with an old comparison.
//  3. The length card: the hovered cell's own length first, the differing
//     digits marked, the gap as a pill of the flag's level, through the real
//     #mb-stat-tooltip hover path (which must hand the element over).
//  4. The findings: the card shows the label and the two values; the native
//     title keeps the prose detail.
//  5. The Title cell's track/recording finding names both, and does not
//     repeat the comparison under a preview card's note box.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const BTR_URL = 'https://musicbrainz.org/release/1d404e1d-fcb6-3a52-b478-e706e893c897';
const BTR_FIXTURE = path.join(__dirname, 'release-tracks-ms-length.html');
const EVENT_URL = 'https://musicbrainz.org/release/d390b4ff-38ab-4783-99ef-2c4d338e016b';
const EVENT_FIXTURE = path.join(__dirname, 'release-tracks-multi-event.html');

/**
 * Loads Born to Run (no render) so `window.__saTest` is there.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} [settingsOverride]
 * @param {?string} [fixtureFile]
 */
async function loadBtr(page, settingsOverride = {}, fixtureFile = null) {
    const file = fixtureFile || BTR_FIXTURE;
    await loadUserscriptPage(page, {
        url: BTR_URL, fixtureFile: file, testMode: true,
        settingsOverride: { sa_enable_release_tracks: true, sa_rich_tooltip_delay_ms: 0, ...settingsOverride },
    });
    await page.route(`${BTR_URL}*`, (r) => r.fulfill({ path: file, contentType: 'text/html' }));
}

/**
 * Renders `_cmpHtml()` for two values and reads it back: each row's text,
 * its marked runs, and the summary lines.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} a
 * @param {string} b
 * @returns {Promise<?{rows: string[], marks: string[][], sum: string[], html: string}>}
 */
const cmp = (page, a, b) => page.evaluate(([x, y]) => {
    const html = window.__saTest.cmpHtml({ la: 'Track name', lb: 'Recording', sb: 'recording name', a: x, b: y });
    if (!html) return null;
    const div = document.createElement('div');
    div.innerHTML = html;
    const vals = Array.from(div.querySelectorAll('.mb-tt-cmp-val'));
    return {
        rows: vals.map((v) => v.textContent),
        marks: vals.map((v) => Array.from(v.querySelectorAll('mark.mb-tt-cmp-d')).map((m) => m.textContent)),
        sum: Array.from(div.querySelectorAll('.mb-tt-cmp-sum > div')).map((d) => d.textContent),
        html,
    };
}, [a, b]);

/**
 * The rich card an element's own tip renders to, parsed: title, labels,
 * marks per value row, summary, and the length grid's cells.
 *
 * @param {import('@playwright/test').Locator} loc
 * @returns {Promise<object>}
 */
const cardOf = (loc) => loc.evaluate((el) => {
    const text = el.getAttribute('title') || el.dataset.mbTipSaved || '';
    const div = document.createElement('div');
    div.innerHTML = window.__saTest.tipTextToHtml(text, el);
    const q = (s) => Array.from(div.querySelectorAll(s));
    return {
        native: text,
        title: q('.mb-tt-title').map((d) => d.textContent),
        labels: q('.mb-tt-cmp-lbl').map((d) => d.textContent),
        rows: q('.mb-tt-cmp-val').map((d) => d.textContent),
        marks: q('.mb-tt-cmp-val, .mb-tt-cmp-t').map((v) => Array.from(v.querySelectorAll('mark')).map((m) => m.textContent)),
        times: q('.mb-tt-cmp-t').map((d) => d.textContent),
        pill: q('.mb-tt-cmp-pill').map((d) => `${d.className}|${d.textContent}`),
        sum: q('.mb-tt-cmp-sum > div').map((d) => d.textContent),
        body: q('.mb-tt-body').map((d) => d.textContent),
    };
});

/**
 * The cell of column `col` in the first rendered row whose cell matches
 * `pick` (its text), as a locator.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} col
 * @param {function(string): boolean|string} match - The cell text, or a substring of it.
 * @returns {Promise<import('@playwright/test').Locator>}
 */
async function cellLocator(page, col, match) {
    const idx = await page.evaluate(([c, m]) => {
        const all = Array.from(document.querySelectorAll('table.tbl tbody td'));
        const hit = all.find((td) => {
            const tbl = td.closest('table');
            const th = tbl.querySelectorAll('thead tr:first-child th')[td.cellIndex];
            return th && th.dataset.colName === c && td.closest('tr').style.display !== 'none' &&
                td.textContent.replace(/\s+/g, ' ').includes(m);
        });
        if (!hit) return -1;
        hit.setAttribute('data-test-cell', '1');
        return 0;
    }, [col, match]);
    expect(idx, `a "${col}" cell holding "${match}"`).toBe(0);
    return page.locator('td[data-test-cell="1"]').first();
}

test.describe('comparison tooltips: the diff', () => {
    test.beforeEach(async ({ page }) => { await loadBtr(page); });

    test('a case change marks the one letter in each row', async ({ page }) => {
        const r = await cmp(page, 'I Wanna Dance with Somebody (Who Loves Me)', 'I Wanna Dance With Somebody (Who Loves Me)');
        expect(r.rows).toEqual(['I Wanna Dance with Somebody (Who Loves Me)', 'I Wanna Dance With Somebody (Who Loves Me)']);
        expect(r.marks).toEqual([['w'], ['W']]);
        expect(r.sum).toEqual(['1 letter in a different case: w → W']);
    });

    test('a typographic swap marks the character and names both, with code points', async ({ page }) => {
        const apo = await cmp(page, 'Don\'t Stop Me Now', 'Don’t Stop Me Now');
        expect(apo.marks).toEqual([['\''], ['’']]);
        expect(apo.sum).toEqual(['Apostrophe \' U+0027 vs right single quote ’ U+2019']);
        const hy = await cmp(page, 'Rock-and-Roll Music', 'Rock‐and‐Roll Music');
        expect(hy.marks).toEqual([['-', '-'], ['‐', '‐']]);
        expect(hy.sum).toEqual(['Hyphen-minus - U+002D vs hyphen ‐ U+2010']);
        const dots = await cmp(page, '...Baby One More Time', '…Baby One More Time');
        expect(dots.marks).toEqual([['...'], ['…']]);
        expect(dots.sum).toEqual(['Three dots ... vs ellipsis …']);
    });

    test('added text marks only itself; invisible characters get a visible mark', async ({ page }) => {
        const eti = await cmp(page, 'I Believe in Your Sweet Love', 'I Believe in Your Sweet Love (single version)');
        expect(eti.marks).toEqual([[], ['·(single·version)']]);
        expect(eti.sum).toEqual(['Only in the recording name: (single·version)']);
        const dbl = await cmp(page, 'Hungry  Heart', 'Hungry Heart');
        expect(dbl.marks).toEqual([['·'], []]);
        expect(dbl.sum).toEqual(['Extra 1 space in the track name']);
        const nbsp = await cmp(page, 'Mr. Brightside', 'Mr. Brightside');
        expect(nbsp.marks).toEqual([['⍽'], ['·']]);
        expect(nbsp.sum).toEqual(['No-break space vs 1 space']);
        // One side empty (a date only the comment has): "none" there, the
        // other marked whole — never the "share little" fallback.
        const empty = await cmp(page, '', '1975‐11‐18');
        expect(empty.rows).toEqual(['none', '1975‐11‐18']);
        expect(empty.marks).toEqual([[], ['1975‐11‐18']]);
    });

    test('a reorder is one mark per row; values that share little are not marked; equal values give no block', async ({ page }) => {
        const re = await cmp(page, '1996‐04‐19: Saal 1, ICC Berlin, Berlin, Germany', '1996‐04‐19: ICC Berlin, Saal 1, Berlin, Germany');
        expect(re.marks.map((m) => m.length)).toEqual([1, 1]);
        expect(re.sum).toEqual(['Same words in a different order.']);
        const far = await cmp(page, 'Intro', 'Also sprach Zarathustra (Opening)');
        expect(far.marks).toEqual([[], []]);
        expect(far.sum).toEqual(['The two share little, so nothing is marked.']);
        expect(await cmp(page, 'Thunder Road', 'Thunder Road')).toBeNull();
    });

    test('a comparison shows only for the text it was built for', async ({ page }) => {
        // Pins `_cmpTipData()`'s text guard: a tip rewritten by code that
        // knows nothing about comparisons keeps no stale block.
        const got = await page.evaluate(() => {
            const el = document.createElement('span');
            el.setAttribute('data-mb-tip-cmp', JSON.stringify({ t: '⚠️ Old\nline', c: [{ at: 0, la: 'A', lb: 'B', a: 'x1', b: 'x2' }] }));
            return [
                window.__saTest.tipTextToHtml('⚠️ Old\nline', el).includes('mb-tt-cmp'),
                window.__saTest.tipTextToHtml('⚠️ New\nline', el).includes('mb-tt-cmp'),
            ];
        });
        expect(got).toEqual([true, false]);
    });
});

test.describe('comparison tooltips: the length card', () => {
    test('each duration cell: own length first, differing digits marked, the gap as a pill', async ({ page }) => {
        await loadBtr(page);
        await page.click('button[data-label="Show all Tracks for Release"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        // B3 "Backstreets": track 3:19.000, recording 3:16.000 → ⚠️ at 1 s.
        const len = page.locator('td[data-mb-len-flag]').nth(0);
        const rec = page.locator('td[data-mb-len-flag]').nth(1);
        const a = await cardOf(len);
        expect(a.native).toContain('Track length 3:19.000 is 3 s LONGER');
        expect(a.title).toEqual(['⚠️ Track and recording length differ']);
        expect(a.labels).toEqual(['Track length', 'Recording length']);
        expect(a.times).toEqual(['3:19.000', '3:16.000']);
        expect(a.marks).toEqual([['9'], ['6']]);
        expect(a.pill).toEqual(['mb-tt-cmp-pill mb-tt-cmp-pill-warn|+3 s · longer']);
        expect(a.sum).toEqual(['Over the 1 s threshold.']);
        const b = await cardOf(rec);
        expect(b.labels).toEqual(['Recording length', 'Track length']);
        expect(b.times).toEqual(['3:16.000', '3:19.000']);
        expect(b.pill).toEqual(['mb-tt-cmp-pill mb-tt-cmp-pill-warn|−3 s · shorter']);

        // The real hover: #mb-stat-tooltip must pass the element, or the
        // card is the sentence alone.
        await len.hover();
        const tip = page.locator('#mb-stat-tooltip');
        await expect(tip).toBeVisible();
        await expect(tip.locator('.mb-tt-cmp-len .mb-tt-cmp-t')).toHaveText(['3:19.000', '3:16.000']);
    });

    test('over the "far over" level the pill is red and names the multiple', async ({ page }) => {
        await loadBtr(page, { sa_release_tracks_length_mismatch_threshold_ms: 500, sa_release_tracks_length_mismatch_severe_factor: 2 });
        await page.click('button[data-label="Show all Tracks for Release"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const c = await cardOf(page.locator('td[data-mb-len-flag="severe"]').first());
        expect(c.title).toEqual(['❌ Track and recording length far apart']);
        expect(c.pill[0]).toMatch(/^mb-tt-cmp-pill mb-tt-cmp-pill-severe\|/);
        expect(c.sum).toEqual(['Over the “far over” level, 1 s (threshold 0.5 s × 2).']);
    });
});

test.describe('comparison tooltips: findings', () => {
    test('Recorded at place: the label, then comment venue over place; the native title keeps the prose', async ({ page }) => {
        await page.context().route('https://static.metabrainz.org/**', (route) => route.abort('blockedbyclient'));
        await loadUserscriptPage(page, { url: EVENT_URL, fixtureFile: EVENT_FIXTURE, testMode: true, settingsOverride: { sa_rich_tooltip_delay_ms: 0 } });
        await page.route('https://musicbrainz.org/release/**', (r) => r.fulfill({ path: EVENT_FIXTURE, contentType: 'text/html' }));
        await page.click('button[data-label="Show all Tracks for Release"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const master = page.locator('.mb-master-toggle');
        if (await master.count() && (await master.getAttribute('data-state')) === 'collapsed') await master.click();

        const td = await cellLocator(page, 'Recorded at place', 'Festhalle Frankfurt');
        const c = await cardOf(td);
        expect(c.native).toContain('❌ Recorded at place differs from the comment venue: comment venue "Festhalle", place "Festhalle Frankfurt"');
        expect(c.title[0]).toBe('❌ Recorded at place differs from the comment venue');
        expect(c.labels).toEqual(['Comment venue', '≠ Place']);
        expect(c.rows).toEqual(['Festhalle', 'Festhalle·Frankfurt']);
        expect(c.marks).toEqual([[], ['·Frankfurt']]);

        // On the cell's own padding: over the place link the nearest title
        // is the link's, as in the browser.
        await td.hover({ position: { x: 2, y: 2 } });
        await expect(page.locator('#mb-stat-tooltip .mb-tt-cmp-grid')).toBeVisible();
        await expect(page.locator('#mb-stat-tooltip mark.mb-tt-cmp-d')).toHaveText(['·Frankfurt']);
    });
});

test.describe('comparison tooltips: the Title cell track/recording finding', () => {
    test('names both names, and gives the label alone under a preview card\'s note box', async ({ page }) => {
        const NOTE = 'track name: Thunder Road (version 7)\n≠rec. name: Thunder Road';
        const html = fs.readFileSync(BTR_FIXTURE, 'utf8');
        const link = '<a href="/recording/bbcedc0f-2fff-42f4-9ca6-6d2263d1a042"><bdi>Thunder Road</bdi></a>';
        expect(html.split(link)).toHaveLength(2);
        const tmp = path.join(__dirname, '..', '..', 'test-results', `tooltip-diff-${Date.now()}.html`);
        fs.mkdirSync(path.dirname(tmp), { recursive: true });
        fs.writeFileSync(tmp, html.replace(link, link.replace('<a ', `<a title="${NOTE.replace('\n', '&#10;')}" `)));
        await loadBtr(page, {}, tmp);
        await page.click('button[data-label="Show all Tracks for Release"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });

        const td = page.locator('td[data-mb-findings~="title-mismatch"]');
        await expect(td).toHaveCount(1);
        const c = await cardOf(td);
        expect(c.native).toBe('⚠️ Track name differs from recording name: track "Thunder Road (version 7)", recording "Thunder Road"');
        expect(c.title).toEqual(['⚠️ Track name differs from recording name']);
        expect(c.marks).toEqual([['·(version·7)'], []]);

        // Under a preview card the link's note box compares the names; the
        // cell's box there must not do it a second time.
        const noOrigin = await td.evaluate((el) => window.__saTest.tipTextToHtml(el.title, el, { noOrigin: true }));
        expect(noOrigin).toBe('<div class="mb-tt-title">⚠️ Track name differs from recording name</div>');
    });
});
