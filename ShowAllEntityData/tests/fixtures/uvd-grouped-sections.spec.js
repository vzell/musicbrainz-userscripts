'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// Feature: the 📊 dropdown's grouped layout (sa_uvd_grouped_sections) — one
// main header per topic, sections nested as "» Sub-section:" headings, the
// shared "» month: " prefix hidden on each entry, two-level collapse with
// Ctrl+Click scopes, and auto-collapse above sa_uvd_autocollapse_threshold.
// Design and decisions: org/UVD-redesign.org.
//
// Reuses the annotations fixture of uniq-drop-editor-activity-sections.spec.js.
// Its "Active start date" column yields two topics:
//   Structure  — ONE section → merged (no group header of its own)
//   Date info  — Precision 1, Decade 1, Month 2, Year 1, Weekday 2 entries
// and its "Active for" column a merged "Editor info - Active for".
const ANNOTATIONS_URL = 'https://musicbrainz.org/label/011d1192-6f65-45bd-85c4-0400dd45693e/annotations';
const FIXTURE_FILE = path.join(__dirname, 'uniq-drop-editor-activity-sections.html');
const COL = 'Active start date';
const COLLAPSE_KEY = 'mb_sa_uniq_section_collapse';

/**
 * Loads the fixture with `settings` seeded into GM storage, renders the
 * table and opens `col`'s 📊 dropdown.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object<string, *>} [settings]
 * @param {string} [col]
 */
async function openDrop(page, settings = {}, col = COL) {
    await loadUserscriptPage(page, {
        url: ANNOTATIONS_URL, fixtureFile: FIXTURE_FILE, testMode: true, settingsOverride: settings,
    });
    await page.click('button[data-label="Show Annotation History for Label"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
    await page.evaluate((c) => window.__saTest.getUniqDropSections(c), col);
}

/**
 * Closes the open dropdown and opens `col`'s again — a fresh build that
 * reads the stored collapse state anew.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} [col]
 */
async function reopen(page, col = COL) {
    await page.evaluate((c) => {
        const th = Array.from(document.querySelectorAll('table.tbl thead th')).find((t) => t.dataset.colName === c);
        const wrap = th.querySelector('.mb-col-uniq-wrap');
        const drop = document.getElementById('mb-col-uniq-dropdown');
        if (drop && drop.style.display !== 'none') wrap.click();
        wrap.click();
    }, col);
}

/**
 * Snapshot of the open dropdown's groups and sections as the user sees them.
 *
 * @param {import('@playwright/test').Page} page
 */
function readDrop(page) {
    return page.evaluate(() => {
        const drop = document.getElementById('mb-col-uniq-dropdown');
        const shown = (el) => !!el && el.offsetParent !== null;
        return {
            groups: Array.from(drop.querySelectorAll('.mb-uniq-group')).map((g) => ({
                topic: g.dataset.mbUniqTopic,
                merged: g.classList.contains('mb-uniq-group-merged'),
                headerShown: shown(g.querySelector('.mb-uniq-group-hdr')),
                collapsed: g.querySelector('.mb-uniq-group-body').classList.contains('mb-uniq-group-collapsed'),
                hidden: g.style.display === 'none',
                count: g.querySelector('.mb-uniq-group-count').textContent,
                matchCount: shown(g.querySelector('.mb-uniq-group-hdr .mb-uniq-section-match-count'))
                    ? g.querySelector('.mb-uniq-group-hdr .mb-uniq-section-match-count').textContent : null,
            })),
            sections: Object.fromEntries(Array.from(drop.querySelectorAll('.mb-uniq-section')).map((s) => {
                const label = s.querySelector('.mb-uniq-section-label').textContent;
                const ec = s.querySelector('.mb-uniq-section-entry-count');
                return [label, {
                    collapsed: s.querySelector('.mb-uniq-section-items').classList.contains('mb-uniq-section-collapsed'),
                    hidden: s.style.display === 'none',
                    entryCount: ec ? ec.textContent : null,
                    visibleItems: Array.from(s.querySelectorAll('.mb-col-uniq-item')).filter(shown)
                        .map((i) => i.querySelector('.mb-uniq-syn-label-text').innerText),
                }];
            })),
            stored: window.GM_getValue('mb_sa_uniq_section_collapse', {}),
        };
    });
}

/** Locator for one section's header, by its full label. */
const sectionHdr = (page, label) => page.locator('#mb-col-uniq-dropdown .mb-uniq-section', {
    has: page.locator('.mb-uniq-section-label', { hasText: label }),
}).locator('.mb-uniq-section-hdr');

/** Locator for one topic group's own header. */
const groupHdr = (page, topic) => page.locator(`#mb-col-uniq-dropdown .mb-uniq-group[data-mb-uniq-topic="${topic}"] > .mb-uniq-group-hdr`);

test.describe('📊 grouped sections', () => {
    test('groups by topic, merges a one-section topic, and keeps every label\'s text', async ({ page }) => {
        await openDrop(page);
        const d = await readDrop(page);

        expect(d.groups.map((g) => [g.topic, g.merged, g.headerShown])).toEqual([
            ['Structure', true, false],
            ['Date info', false, true],
        ]);
        expect(d.groups[1].count).toBe('7');

        // Compat: the label's textContent is still the full SYN_SECTION_META
        // label (specs and the test API read it); only the sub-section shows.
        const seen = await page.evaluate(() => {
            const sec = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
                .find((s) => s.querySelector('.mb-uniq-section-label').textContent === 'Date info - Month');
            const sub = sec.querySelector('.mb-uniq-section-sub');
            return {
                innerText: sec.querySelector('.mb-uniq-section-label').innerText,
                before: getComputedStyle(sub, '::before').content,
                after: getComputedStyle(sub, '::after').content,
                italic: getComputedStyle(sec.querySelector('.mb-uniq-section-hdr')).fontStyle,
                entryText: sec.querySelector('.mb-uniq-syn-label-text').textContent,
                entryInner: sec.querySelector('.mb-uniq-syn-label-text').innerText,
                entryItalic: getComputedStyle(sec.querySelector('.mb-col-uniq-item')).fontStyle,
                dataLabel: sec.querySelector('.mb-col-uniq-item').dataset.mbUniqSynLabel,
            };
        });
        expect(seen).toEqual({
            innerText: 'Month',
            before: '"» "',
            after: '":"',
            italic: 'italic',
            entryText: '» month: February',
            entryInner: 'February',
            entryItalic: 'normal',
            dataLabel: '» month: February',
        });
        // Fixed-mode entries have no "» " prefix and keep their full text.
        expect(d.sections['Date info - Precision'].visibleItems).toEqual(['📅 complete dates']);
    });

    test('a merged topic reads "Topic › Sub" on one header line', async ({ page }) => {
        await openDrop(page, {}, 'Active for');
        const r = await page.evaluate(() => {
            const g = document.querySelector('#mb-col-uniq-dropdown .mb-uniq-group[data-mb-uniq-topic="Editor info"]');
            const topic = g.querySelector('.mb-uniq-section-topic');
            return {
                merged: g.classList.contains('mb-uniq-group-merged'),
                groupHdrShown: g.querySelector('.mb-uniq-group-hdr').offsetParent !== null,
                sepShown: g.querySelector('.mb-uniq-section-sep').offsetParent !== null,
                topicAfter: getComputedStyle(topic, '::after').content,
                label: g.querySelector('.mb-uniq-section-label').textContent,
                entries: Array.from(g.querySelectorAll('.mb-uniq-syn-label-text')).map((s) => s.innerText),
            };
        });
        expect(r).toEqual({
            merged: true, groupHdrShown: false, sepShown: false, topicAfter: '" › "',
            label: 'Editor info - Active for', entries: ['10 years', '8 years'],
        });
    });

    test('auto-collapses a sub-section above the threshold, and 0 turns it off', async ({ page }) => {
        await openDrop(page, { sa_uvd_autocollapse_threshold: 1 });
        let d = await readDrop(page);
        const collapsedOf = (dd) => Object.fromEntries(Object.entries(dd.sections).map(([k, v]) => [k, v.collapsed]));
        expect(collapsedOf(d)).toEqual({
            'Structure': false,
            'Date info - Precision': false,
            'Date info - Decade': false,
            'Date info - Month': true,
            'Date info - Year': false,
            'Date info - Weekday': true,
        });
        expect(d.sections['Date info - Month'].entryCount).toBe('2');
        expect(d.sections['Date info - Month'].visibleItems).toEqual([]);
        // Auto-collapse is a display default, never written to storage.
        expect(d.stored['dateExprMonth']).toBeUndefined();
    });

    test('threshold 0 and the default (15) collapse nothing here', async ({ browser }) => {
        for (const settings of [{ sa_uvd_autocollapse_threshold: 0 }, {}]) {
            const page = await browser.newPage();
            await openDrop(page, settings);
            const d = await readDrop(page);
            expect(Object.values(d.sections).every((s) => !s.collapsed)).toBe(true);
            await page.close();
        }
    });

    test('a plain-click expand is remembered and beats auto-collapse on the next open', async ({ page }) => {
        await openDrop(page, { sa_uvd_autocollapse_threshold: 1 });
        await sectionHdr(page, 'Date info - Month').click();
        let d = await readDrop(page);
        expect(d.sections['Date info - Month'].collapsed).toBe(false);
        expect(d.stored['dateExprMonth']).toBe(false);

        await reopen(page);
        d = await readDrop(page);
        expect(d.sections['Date info - Month'].collapsed).toBe(false);
        expect(d.sections['Date info - Weekday'].collapsed).toBe(true);
    });

    test('Ctrl+Click on a sub-heading acts on that topic only; its "expand all" is not remembered', async ({ page }) => {
        await openDrop(page, { sa_uvd_autocollapse_threshold: 1 });

        // Collapse all of "Date info" from an expanded sub-section.
        await sectionHdr(page, 'Date info - Decade').click({ modifiers: ['Control'] });
        let d = await readDrop(page);
        for (const k of ['Precision', 'Decade', 'Month', 'Year', 'Weekday']) {
            expect(d.sections[`Date info - ${k}`].collapsed).toBe(true);
        }
        expect(d.sections['Structure'].collapsed).toBe(false);          // other topic untouched
        expect(d.groups.find((g) => g.topic === 'Date info').collapsed).toBe(false);
        expect(d.stored['dateExprYear']).toBe(true);

        // Expand all again: everything opens now ...
        await sectionHdr(page, 'Date info - Decade').click({ modifiers: ['Control'] });
        d = await readDrop(page);
        expect(Object.values(d.sections).every((s) => !s.collapsed)).toBe(true);
        expect(d.stored['dateExprYear']).toBeUndefined();
        expect(d.stored['dateExprMonth']).toBeUndefined();

        // ... but is not remembered, so auto-collapse is back on reopen.
        await reopen(page);
        d = await readDrop(page);
        expect(d.sections['Date info - Month'].collapsed).toBe(true);
        expect(d.sections['Date info - Weekday'].collapsed).toBe(true);
        expect(d.sections['Date info - Decade'].collapsed).toBe(false);
    });

    test('a main header collapses its topic; Ctrl+Click collapses every main header', async ({ page }) => {
        await openDrop(page);
        await groupHdr(page, 'Date info').click();
        let d = await readDrop(page);
        expect(d.groups.find((g) => g.topic === 'Date info').collapsed).toBe(true);
        expect(d.sections['Date info - Month'].visibleItems).toEqual([]);
        expect(d.stored['group:Date info']).toBe(true);

        await reopen(page);
        d = await readDrop(page);
        expect(d.groups.find((g) => g.topic === 'Date info').collapsed).toBe(true);

        // Ctrl+Click expands every main header — the merged "Structure"
        // section counts as one, since it stands in for its group header.
        await sectionHdr(page, 'Structure').click();                     // collapse Structure first
        d = await readDrop(page);
        expect(d.sections['Structure'].collapsed).toBe(true);
        await groupHdr(page, 'Date info').click({ modifiers: ['Control'] });
        d = await readDrop(page);
        expect(d.groups.find((g) => g.topic === 'Date info').collapsed).toBe(false);
        expect(d.sections['Structure'].collapsed).toBe(false);
        expect(d.stored['group:Date info']).toBe(false);
    });

    test('quick filter matches the hidden prefix, opens what matches, hides the rest, and restores on clear', async ({ page }) => {
        // "Date info" starts collapsed as a GROUP, so the forcing one level up
        // is what makes its matches visible.
        await openDrop(page, {
            sa_uvd_autocollapse_threshold: 1,
            [COLLAPSE_KEY]: { 'group:Date info': true, __v: 2 },
        });
        expect((await readDrop(page)).groups.find((g) => g.topic === 'Date info').collapsed).toBe(true);
        const qf = page.locator('#mb-col-uniq-dropdown .mb-uniq-qf-input');

        // "month" exists only in the hidden "» month: " prefix.
        await qf.fill('month');
        let d = await readDrop(page);
        const date = d.groups.find((g) => g.topic === 'Date info');
        expect(date.collapsed).toBe(false);
        expect(date.matchCount).toBe('(2)');
        expect(d.groups.find((g) => g.topic === 'Structure').hidden).toBe(true);
        expect(d.sections['Date info - Month'].collapsed).toBe(false);   // forced open past auto-collapse
        expect(d.sections['Date info - Month'].visibleItems).toEqual(['February', 'July']);
        expect(d.sections['Date info - Year'].hidden).toBe(true);

        // A match in the visible value is marked there.
        await qf.fill('feb');
        // Visible marks only: an entry the filter hides keeps its previous
        // label until it matches again (pre-existing, never seen).
        const marked = await page.evaluate(() => Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section-items mark'))
            .filter((m) => m.offsetParent !== null).map((m) => m.textContent));
        expect(marked).toEqual(['Feb']);

        await qf.fill('');
        d = await readDrop(page);
        expect(d.groups.every((g) => !g.hidden && g.matchCount === null)).toBe(true);
        expect(d.groups.find((g) => g.topic === 'Date info').collapsed).toBe(true);   // stored state restored
        expect(d.sections['Date info - Month'].collapsed).toBe(true);    // auto-collapse restored
        expect(d.sections['Date info - Decade'].collapsed).toBe(false);
        // The cleared label is rebuilt with its prefix still hoisted. (The
        // group is collapsed again here, so innerText would read the hidden
        // text too: check the structure instead.)
        const entry = await page.evaluate(() => {
            const span = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-col-uniq-item'))
                .find((i) => i.dataset.mbUniqSynLabel === '» decade: 2000-2010')
                .querySelector('.mb-uniq-syn-label-text');
            return { prefix: span.querySelector('.mb-uniq-syn-prefix')?.textContent, text: span.textContent };
        });
        expect(entry).toEqual({ prefix: '» decade: ', text: '» decade: 2000-2010' });
    });

    test('stored "expanded" marks from before grouping are dropped once; "collapsed" ones are kept', async ({ page }) => {
        await openDrop(page, {
            sa_uvd_autocollapse_threshold: 1,
            [COLLAPSE_KEY]: { dateExprMonth: false, dateExprYear: true },
        });
        const d = await readDrop(page);
        expect(d.sections['Date info - Month'].collapsed).toBe(true);     // false dropped → auto
        expect(d.sections['Date info - Year'].collapsed).toBe(true);      // true kept
        expect(d.stored).toEqual({ dateExprYear: true, __v: 2 });
    });

    test('sa_uvd_grouped_sections off restores the flat layout exactly', async ({ page }) => {
        await openDrop(page, { sa_uvd_grouped_sections: false, sa_uvd_autocollapse_threshold: 1 });
        const r = await page.evaluate(() => {
            const drop = document.getElementById('mb-col-uniq-dropdown');
            return {
                groups: drop.querySelectorAll('.mb-uniq-group').length,
                labels: Array.from(drop.querySelectorAll('.mb-uniq-section-label')).map((l) => l.innerText),
                collapsed: drop.querySelectorAll('.mb-uniq-section-collapsed').length,
                monthEntry: Array.from(drop.querySelectorAll('.mb-col-uniq-item'))
                    .find((i) => i.dataset.mbUniqSynLabel === '» month: February')
                    .querySelector('.mb-uniq-syn-label-text').innerText,
            };
        });
        expect(r).toEqual({
            groups: 0,
            labels: ['Structure', 'Date info - Precision', 'Date info - Decade', 'Date info - Month',
                'Date info - Year', 'Date info - Weekday'],
            collapsed: 0,
            monthEntry: '» month: February',
        });
    });
});
