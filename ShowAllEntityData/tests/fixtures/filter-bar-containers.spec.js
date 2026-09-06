'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// Two fixtures, deliberately: the artist-recordings one has EVERY summary and
// action button hidden (the case that would grow dead space if the grouping
// spans were ever given a rendered box), the release-tracks one has a visible
// summary button (proving the summary group is wired up at all).
const RECORDINGS_URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/recordings';
const RECORDINGS_FIXTURE = path.join(__dirname, 'uniq-drop-pending-edits.html');
const RELEASE_URL = 'https://musicbrainz.org/release/1d404e1d-fcb6-3a52-b478-e706e893c897';
const RELEASE_FIXTURE = path.join(__dirname, 'release-tracks-ms-length.html');

const BAR_GAP_PX = 5;   // #mb-filter-container's own `gap:5px`

const renderRecordings = async (page) => {
    await loadUserscriptPage(page, { url: RECORDINGS_URL, fixtureFile: RECORDINGS_FIXTURE, testMode: true });
    await page.route(`${RECORDINGS_URL}?**`, (r) => r.fulfill({ path: RECORDINGS_FIXTURE, contentType: 'text/html' }));
    await page.click('button[data-label="⊚ All recordings"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
};

test.describe('global filter bar: semantic containers', () => {
    test('groups every control into the four named containers', async ({ page }) => {
        await renderRecordings(page);

        const groups = await page.evaluate(() => {
            const bar = document.getElementById('mb-filter-container');
            return Array.from(bar.children).map((g) => ({
                cls: g.className,
                id: g.id,
                display: getComputedStyle(g).display,
                children: Array.from(g.children).map((c) => c.id || `${c.tagName.toLowerCase()}(anon)`),
            }));
        });

        // The four groups, plus the ⏳ pending-edits toggle in its own slot
        // between the filter widget and the actions — it belongs to neither
        // group, so it is deliberately a direct child of the bar.
        expect(groups.map((g) => g.cls || `#${g.id}`)).toEqual([
            'mb-global-summary-container',
            'mb-global-filter-container',
            '#mb-pending-edits-btn',
            'mb-global-actions-container',
            'mb-global-status-container',
        ]);

        expect(groups[0].children).toEqual([
            'mb-live-date-warning-btn', 'mb-live-date-error-btn',
            'mb-len-mismatch-warn-btn', 'mb-len-mismatch-severe-btn',
        ]);
        expect(groups[1].children).toEqual([
            'mb-global-filter-wrapper', 'span(anon)',
            'mb-global-filter-case-label', 'mb-global-filter-rx-label', 'mb-global-filter-exclude-label',
        ]);
        // #mb-col-collapse-all-btn is insertBefore'd ahead of the highlight
        // button, so its position here also proves that insert still resolves
        // within the actions group rather than throwing NotFoundError.
        expect(groups[3].children).toEqual([
            'mb-preload-filter-msg', 'mb-toggle-prefilter-btn', 'mb-col-collapse-all-btn',
            'mb-toggle-filter-highlight-btn', 'mb-clear-column-filters-btn', 'mb-clear-all-filters-btn',
        ]);
        expect(groups[4].children).toEqual(['mb-filter-status-display', 'mb-sort-status-display']);
    });

    test('the three grouping spans generate no box of their own', async ({ page }) => {
        await renderRecordings(page);

        // `display:contents` is load-bearing, not cosmetic — see the
        // group-construction comment in the userscript. If someone "fixes"
        // these to inline-flex, the next test starts failing.
        const displays = await page.evaluate(() =>
            ['mb-global-summary-container', 'mb-global-filter-container', 'mb-global-actions-container']
                .map((c) => getComputedStyle(document.querySelector(`.${c}`)).display));
        expect(displays).toEqual(['contents', 'contents', 'contents']);

        // The status group IS a real box (its own flex context) and must stay one.
        const statusDisplay = await page.evaluate(() =>
            getComputedStyle(document.querySelector('.mb-global-status-container')).display);
        expect(statusDisplay).toBe('flex');
    });

    test('grouping adds no dead space when a whole group is hidden', async ({ page }) => {
        await renderRecordings(page);

        // On this page every summary button and every action button is hidden,
        // so the summary and actions groups are entirely empty of rendered
        // content. A hidden CHILD generates no flex gap, but a zero-width
        // rendered WRAPPER would generate one on each side — turning the 5px
        // between the "Ex" label and the status display into 10px, and adding
        // another 5px before the filter input. Every visible box must still sit
        // exactly one `gap` apart.
        const gaps = await page.evaluate(() => {
            const bar = document.getElementById('mb-filter-container');
            const boxes = [];
            const walk = (el) => {
                for (const c of el.children) {
                    const cs = getComputedStyle(c);
                    if (cs.display === 'contents') { walk(c); continue; }
                    if (cs.display === 'none') continue;
                    const r = c.getBoundingClientRect();
                    // Zero-width boxes are skipped deliberately, and this is
                    // what gives the test teeth: an EMPTY rendered wrapper is
                    // itself a zero-width flex item, so measuring gaps between
                    // consecutive boxes would still read 5px on each side of it
                    // and the regression would slip through. Ignoring it makes
                    // its two gaps collapse into one 10px gap between the real
                    // controls either side, which is exactly the dead space
                    // being guarded against.
                    if (r.width === 0) continue;
                    boxes.push({ id: c.id || '(anon)', ...r.toJSON() });
                }
            };
            walk(bar);
            return boxes.slice(1).map((b, i) => ({
                between: `${boxes[i].id} -> ${b.id}`,
                gap: +(b.x - (boxes[i].x + boxes[i].width)).toFixed(2),
            }));
        });

        expect(gaps.length).toBeGreaterThan(0);
        for (const g of gaps) {
            expect(g.gap, `unexpected gap between ${g.between}`).toBe(BAR_GAP_PX);
        }
    });

    test('a visible summary button still renders flush in the bar', async ({ page }) => {
        await loadUserscriptPage(page, {
            url: RELEASE_URL, fixtureFile: RELEASE_FIXTURE, testMode: true,
            settingsOverride: { sa_enable_release_tracks: true },
        });
        await page.click('button[data-label="Show all Tracks for Release"]');
        await page.waitForSelector('#mb-filter-container');
        await waitForRenderComplete(page, { waitForAutoResize: false });

        // The ⚠️ length-mismatch button lives in the summary group and is the
        // bar's first visible box; the filter input must follow one gap later.
        const geom = await page.evaluate(() => {
            const warn = document.getElementById('mb-len-mismatch-warn-btn');
            const wrap = document.getElementById('mb-global-filter-wrapper');
            const bar = document.getElementById('mb-filter-container');
            return {
                warnVisible: getComputedStyle(warn).display !== 'none',
                warnStartsBar: Math.abs(warn.getBoundingClientRect().x - bar.getBoundingClientRect().x) < 0.5,
                gap: +(wrap.getBoundingClientRect().x -
                       (warn.getBoundingClientRect().x + warn.getBoundingClientRect().width)).toFixed(2),
            };
        });
        expect(geom.warnVisible).toBe(true);
        expect(geom.warnStartsBar).toBe(true);
        expect(geom.gap).toBe(BAR_GAP_PX);
    });
});
