'use strict';

// The title-style check on event names: one ⚠️ finding, event-typography
// (docs/claude/findings.md, "On demand: the title-style findings"). Mockup
// approved 2026-10-29, variant A: https://claude.ai/artifact/PB5NwvrZz61sMqju5qxFYu
//
// Guarantees pinned, each against its neighbour:
//   - an Events page offers the Aa button (it has no title column at all);
//   - the check flags exactly the planted names with ASCII punctuation, and
//     none of the five TITLE warnings lands on an event name (capitalization
//     follows the poster: "KISS AT Tokyo Dome" is someone else's finding);
//   - nothing is flagged twice: a valid live name's "-" date (event-live-sep)
//     and the style-guide near misses ("KISS - …", "Hellfest '23") carry
//     their own finding and not this one, and a live name's proposal keeps
//     its date;
//   - the panel lists only the warning this page can have, and its list
//     proposes the typographic name;
//   - the setting removes the finding.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/events';
const SOURCE = path.join(__dirname, 'artist-events-names.html');
const SETTINGS = { sa_enable_caa_pics: false, sa_enable_relationships_column: false };
const TITLE_IDS = ['title-case', 'title-typography', 'title-series-sep', 'title-feat', 'title-eti-remove'];

// Fixture names replaced by names with ASCII punctuation (one per kind of
// event name: one-off, free form, and a VALID live-form name whose date is
// already typographic).
const PLANT = [
    ['Power to the People', 'Bruce Springsteen at Max&#39;s Kansas City'],
    ['AFL Grand Final 2023', 'Springsteen on Broadway...'],
    ['2026‐10‐03: Merriweather Post Pavilion, Columbia, MD, USA', '2026‐10‐03: Max&#39;s Kansas City, New York City, NY, USA'],
];
const EXPECT = {
    'Bruce Springsteen at Max\'s Kansas City': 'Bruce Springsteen at Max’s Kansas City',
    'Springsteen on Broadway...': 'Springsteen on Broadway…',
    '2026‐10‐03: Max\'s Kansas City, New York City, NY, USA': '2026‐10‐03: Max’s Kansas City, New York City, NY, USA',
};
// The fixture's own names that carry ANOTHER event finding for the same
// characters: never this one.
const OTHERS = {
    '1975-08-13: The Bottom Line, New York City, NY, USA': 'event-live-sep',
    'KISS - Rod Laver Arena': 'event-style-nearmiss',
    "Hellfest '23": 'event-style-nearmiss',
};

let FIXTURE;
test.beforeAll(() => {
    let html = fs.readFileSync(SOURCE, 'utf8');
    PLANT.forEach(([from, to]) => {
        const re = new RegExp(`(/event/[0-9a-f-]{36}"><bdi>)${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(</bdi>)`);
        if (!re.test(html)) throw new Error(`fixture name "${from}" not found`);
        html = html.replace(re, `$1${to}$2`);
    });
    FIXTURE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sa-event-typo-')), 'planted.html');
    fs.writeFileSync(FIXTURE, html);
});

/**
 * Loads the planted fixture and runs "Show all Events for Artist".
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} [settings]
 */
async function open(page, settings = {}) {
    await loadUserscriptPage(page, { url: URL, fixtureFile: FIXTURE, testMode: true, settingsOverride: { ...SETTINGS, ...settings } });
    await page.route(`${URL}*`, (r) => r.fulfill({ path: FIXTURE, contentType: 'text/html' }));
    await page.click('button[data-label="Show all Events for Artist"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/** Presses the Aa button and waits for the result. */
async function check(page) {
    await page.click('#mb-title-style-global-btn');
    await expect.poll(() => page.evaluate(() => {
        const b = document.getElementById('mb-title-style-global-btn');
        return b && b.dataset.mbTsState;
    })).toMatch(/^(found|clean)$/);
}

/** Event name → the finding ids its cell carries (cells with any finding only). */
const findings = (page) => page.evaluate(() => Object.fromEntries(
    Array.from(document.querySelectorAll('table.tbl tbody td[data-mb-findings]'))
        .filter((td) => td.querySelector('a[href*="/event/"] bdi'))
        .map((td) => [td.querySelector('a[href*="/event/"] bdi').textContent.trim(), td.dataset.mbFindings.split(' ')])));

test('an Events page offers the Aa button, worded for event names', async ({ page }) => {
    await open(page);
    const btn = await page.evaluate(() => {
        const b = document.getElementById('mb-title-style-global-btn');
        return b && { state: b.dataset.mbTsState, text: b.textContent, tip: b.title };
    });
    expect(btn).toMatchObject({ state: 'idle', text: 'AaCheck title style' });
    expect(btn.tip).toMatch(/^Title style · \d+ names, not checked yet\n/);
    expect(btn.tip).toContain('every event name: typographic punctuation only');
    expect(btn.tip).not.toContain('every title');
});

test('the check flags exactly the planted names, and no title warning lands on an event', async ({ page }) => {
    await open(page);
    await check(page);
    const got = await findings(page);
    const flagged = Object.keys(got).filter((n) => got[n].includes('event-typography')).sort();
    expect(flagged).toEqual(Object.keys(EXPECT).sort());
    Object.values(got).forEach((ids) => TITLE_IDS.forEach((id) => expect(ids).not.toContain(id)));
    // Nothing flagged twice: these carry their own finding, not this one.
    Object.entries(OTHERS).forEach(([name, id]) => {
        expect(got[name], name).toContain(id);
        expect(got[name], name).not.toContain('event-typography');
    });
    const text = await page.evaluate(() => document.getElementById('mb-title-style-global-btn').textContent);
    expect(text).toBe('Aa3 names off-style ▾');
});

test('the hover card compares the name with its typographic form; a live date is not marked', async ({ page }) => {
    await open(page);
    await check(page);
    const card = (name) => page.evaluate((n) => {
        const td = Array.from(document.querySelectorAll('table.tbl tbody td[data-mb-findings~="event-typography"]'))
            .find((c) => c.querySelector('bdi').textContent.trim() === n);
        const div = document.createElement('div');
        div.innerHTML = window.__saTest.tipTextToHtml(td.getAttribute('title'), td);
        return {
            labels: Array.from(div.querySelectorAll('.mb-tt-cmp-lbl')).map((d) => d.textContent),
            marks: Array.from(div.querySelectorAll('.mb-tt-cmp-val')).map((v) => Array.from(v.querySelectorAll('mark')).map((m) => m.textContent)),
        };
    }, name);
    expect(await card('Bruce Springsteen at Max\'s Kansas City')).toEqual({ labels: ['Event', '≠ MB style'], marks: [["'"], ['’']] });
    expect(await card('2026‐10‐03: Max\'s Kansas City, New York City, NY, USA')).toEqual({ labels: ['Event', '≠ MB style'], marks: [["'"], ['’']] });
});

test('the panel lists only the event warning, and the names in MB style', async ({ page }) => {
    await open(page);
    await check(page);
    await page.click('#mb-title-style-global-btn');
    const p = await page.evaluate(() => {
        const el = document.getElementById('mb-title-style-pop');
        return {
            kinds: Array.from(el.querySelectorAll('.mb-ts-kind')).map((k) => [k.dataset.mbTsKind, k.disabled, k.querySelector('.mb-ts-n').textContent]),
            facts: Array.from(el.querySelectorAll('.mb-tt-ajfacts dt')).map((d) => d.textContent),
            heading: Array.from(el.querySelectorAll('.mb-tt-ajlog-h')).map((d) => d.textContent),
            list: Array.from(el.querySelectorAll('.mb-ts-item')).map((i) => [i.querySelector('.mb-ts-was').textContent, i.querySelector('.mb-ts-now').textContent]),
        };
    });
    expect(p.kinds).toEqual([['event-typography', false, '3']]);
    expect(p.facts).toEqual(['Names checked', 'Took', 'Off-style', 'Not checked']);
    expect(p.heading[1]).toBe('Names on this page · click to go to the row');
    expect(Object.fromEntries(p.list)).toEqual(EXPECT);
});

test('ticking the warning filters to exactly its rows', async ({ page }) => {
    await open(page);
    await check(page);
    await page.click('#mb-title-style-global-btn');
    await page.click('#mb-title-style-pop .mb-ts-kind[data-mb-ts-kind="event-typography"]');
    await expect.poll(() => page.evaluate(() => Array.from(document.querySelectorAll('table.tbl tbody tr'))
        .filter((r) => r.style.display !== 'none').map((r) => r.querySelector('a[href*="/event/"] bdi').textContent.trim()).sort()))
        .toEqual(Object.keys(EXPECT).sort());
});

test('its setting turns it off', async ({ page }) => {
    await open(page, { sa_findings_event_typography: false });
    await check(page);
    const got = await findings(page);
    expect(Object.values(got).filter((ids) => ids.includes('event-typography'))).toEqual([]);
});
