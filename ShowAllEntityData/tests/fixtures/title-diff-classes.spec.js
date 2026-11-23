'use strict';

// The kinds of a "≠ Track name differs from recording name" difference
// (feat/title-style WIP.2; mockup part B of
// https://claude.ai/artifact/C2YZCFYWfMndTv37pBRr2o, approved 2026-11-23):
// case only, punctuation and spacing only, 1–2 characters, different.
//
// ── What each test pins ─────────────────────────────────────────────────────
//
//  1. The classifier itself, at each border: case vs punctuation, "&" as
//     "and", an accent counted as a letter (question B1: under 1–2
//     characters), two edits in, three edits out (B2), equal names none.
//  2. The 📊 Title column lists one entry per kind present, indented under
//     "≠ track/recording name", with counts that add up to fewer than it
//     when a ≠ note names one title (B3), and each entry keeps only its rows
//     — the FILTER, not just the count.
//  3. The filter still holds after a re-render (a sort clones every row).
//  4. The compare box opens with the kind as a pill of its colour; a note
//     naming one title has no pill.
//
// Fixture: Born to Run (release-tracks-ms-length.html) with jesus2099's
// "mb. INLINE STUFF" note planted on six tracks' recording links, as
// tooltip-diff.spec.js does for one.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const BTR_URL = 'https://musicbrainz.org/release/1d404e1d-fcb6-3a52-b478-e706e893c897';
const BTR_FIXTURE = path.join(__dirname, 'release-tracks-ms-length.html');
const SECTION = 'Flags - Title mismatch';

/** Each planted note: the recording link's text, then its title attribute. */
const NOTES = [
    ['Thunder Road', 'track name: Thunder road\n≠rec. name: Thunder Road'],                       // case
    ['Tenth Avenue Freeze‐Out', 'track name: Tenth Avenue Freeze‐Out\n≠rec. name: Tenth Avenue Freeze Out'], // punct
    ['Night', 'track name: Night\n≠rec. name: Nights'],                                           // near
    ['Backstreets', 'track name: Backstreets (live)\n≠rec. name: Backstreets'],                   // other
    ['Jungleland', 'track name: Jungleland\n≠rec. name: Jungle land'],                            // near: a space inside a word is an edit
    ['Born to Run', '≠ another wording'],                                                         // no class
];

/**
 * Writes the fixture with the notes planted and loads it, rendered.
 *
 * @param {import('@playwright/test').Page} page
 */
async function loadPlanted(page) {
    let html = fs.readFileSync(BTR_FIXTURE, 'utf8');
    for (const [name, note] of NOTES) {
        const re = new RegExp(`<a (href="/recording/[0-9a-f-]{36}")><bdi>${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</bdi></a>`, 'g');
        expect(html.match(re), `one link "${name}"`).toHaveLength(1);
        html = html.replace(re, `<a title="${note.replace(/\n/g, '&#10;')}" $1><bdi>${name}</bdi></a>`);
    }
    const tmp = path.join(__dirname, '..', '..', 'test-results', `title-diff-${process.pid}-${Date.now()}.html`);
    fs.mkdirSync(path.dirname(tmp), { recursive: true });
    fs.writeFileSync(tmp, html);
    await loadUserscriptPage(page, {
        url: BTR_URL, fixtureFile: tmp, testMode: true,
        settingsOverride: { sa_enable_release_tracks: true, sa_rich_tooltip_delay_ms: 0 },
    });
    await page.route(`${BTR_URL}*`, (r) => r.fulfill({ path: tmp, contentType: 'text/html' }));
    await page.click('button[data-label="Show all Tracks for Release"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/** The Title column's "Flags - Title mismatch" entries: label, count, indented. */
const flagEntries = (page) => page.evaluate((sec) => {
    window.__saTest.getUniqDropSections('Title');
    const s = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
        .find((x) => x.querySelector('.mb-uniq-section-label')?.textContent === sec);
    if (!s) return null;
    return Array.from(s.querySelectorAll('.mb-col-uniq-item')).map((el) => ({
        label: el.dataset.mbUniqSynLabel,
        count: el.querySelector('.mb-uniq-count-badge').textContent,
        sub: !!el.querySelector('.mb-uniq-syn-label-text.mb-uniq-syn-sub'),
    }));
}, SECTION);

/** Clicks an entry of the section (toggles it); the panel stays open. */
const clickEntry = (page, label) => page.evaluate(({ sec, lbl }) => {
    const s = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
        .find((x) => x.querySelector('.mb-uniq-section-label')?.textContent === sec);
    Array.from(s.querySelectorAll('.mb-col-uniq-item')).find((el) => el.dataset.mbUniqSynLabel === lbl).click();
}, { sec: SECTION, lbl: label });

/** The recording names of the rows shown, in order. */
const shownTitles = (page) => page.evaluate(() => Array.from(document.querySelectorAll('table.tbl tbody tr'))
    .filter((tr) => tr.style.display !== 'none' && tr.offsetParent !== null)
    .map((tr) => (tr.querySelector('a[href*="/recording/"] bdi') || {}).textContent)
    .filter(Boolean));

test.describe('title-difference classes', () => {
    test('the classifier: case, punctuation, 1–2 characters, different', async ({ page }) => {
        await loadUserscriptPage(page, { url: BTR_URL, fixtureFile: BTR_FIXTURE, testMode: true });
        const got = await page.evaluate((pairs) => pairs.map(([a, b]) => window.__saTest.titleDiffClass(a, b)), [
            ['Spirit In The Night', 'Spirit in the Night'],
            ['Rosalita (Come Out Tonight)', 'Rosalita, Come Out Tonight'],
            ['Rosalita (come out tonight)', 'Rosalita, Come Out Tonight'],
            ['Rock & Roll', 'Rock and Roll'],
            ['Growin’ Up', 'Growin\' Up'],
            ['Café', 'Cafe'],
            ['Kitty’s Back', 'Kittys Back'],
            ['Meeting Accross the River', 'Meeting Across the River'],
            ['The Angel', 'The Angels'],
            ['Nightx', 'Nights'],
            ['Night', 'Nights'],
            ['Nighttt', 'Night'],
            ['Nightttt', 'Night'],
            ['Lost in the Flood (live 1973)', 'Lost in the Flood'],
            ['For You', 'For You'],
        ]);
        expect(got).toEqual([
            'case', 'punct', 'punct', 'punct', 'punct', 'near', 'near', 'near', 'near', 'near', 'near', 'near',
            'other', 'other', null,
        ]);
    });

    test('📊 lists each kind under the flag, and each keeps only its rows, also after a sort', async ({ page }) => {
        await loadPlanted(page);
        expect(await flagEntries(page)).toEqual([
            { label: '≠ track/recording name', count: '(6)', sub: false },
            { label: '≠ case only', count: '(1)', sub: true },
            { label: '≠ punctuation only', count: '(1)', sub: true },
            { label: '≠ 1–2 characters', count: '(2)', sub: true },
            { label: '≠ different', count: '(1)', sub: true },
        ]);

        await clickEntry(page, '≠ punctuation only');
        await expect.poll(() => shownTitles(page)).toEqual(['Tenth Avenue Freeze‐Out']);
        await clickEntry(page, '≠ punctuation only');
        await clickEntry(page, '≠ 1–2 characters');
        await expect.poll(() => shownTitles(page)).toEqual(['Night', 'Jungleland']);
        await clickEntry(page, '≠ different');
        await expect.poll(() => shownTitles(page)).toEqual(['Night', 'Backstreets', 'Jungleland']);

        // A sort re-renders from clones: the kinds must still match there.
        await page.evaluate(() => document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })));
        await expect(page.locator('#mb-col-uniq-dropdown')).toBeHidden({ timeout: 5000 });
        await page.locator('table.tbl thead th[data-col-name="Title"] .sort-icon-btn', { hasText: '▼' }).first().click();
        await expect.poll(() => shownTitles(page)).toEqual(['Night', 'Jungleland', 'Backstreets']);
    });

    test('the compare box opens with the kind; a note naming one title has none', async ({ page }) => {
        await loadPlanted(page);
        const pills = await page.evaluate(() => Array.from(document.querySelectorAll('td[data-mb-findings~="title-mismatch"]')).map((td) => {
            const div = document.createElement('div');
            div.innerHTML = window.__saTest.tipTextToHtml(td.getAttribute('title') || td.dataset.mbTipSaved || '', td);
            const p = div.querySelector('.mb-tt-cmp-head .mb-tt-cmp-pill');
            return [td.querySelector('a[href*="/recording/"] bdi').textContent, p ? `${p.className}|${p.textContent}` : null];
        }));
        expect(Object.fromEntries(pills)).toEqual({
            'Thunder Road': 'mb-tt-cmp-pill mb-tt-cmp-pill-ok|Case only',
            'Tenth Avenue Freeze‐Out': 'mb-tt-cmp-pill mb-tt-cmp-pill-ok|Punctuation and spacing only',
            Night: 'mb-tt-cmp-pill mb-tt-cmp-pill-warn|1–2 characters',
            Backstreets: 'mb-tt-cmp-pill mb-tt-cmp-pill-severe|Different',
            Jungleland: 'mb-tt-cmp-pill mb-tt-cmp-pill-warn|1–2 characters',
            'Born to Run': null,
        });
    });
});
