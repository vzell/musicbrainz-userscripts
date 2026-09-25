'use strict';

/**
 * Probe: do #mb-settings-btn and #mb-app-help-btn actually render as ONE pill?
 *
 * A segmented pill is a geometry claim, not a class-list claim — the two
 * halves have to TOUCH, share a single hairline, and round only at the outer
 * ends. Every one of those is a computed number, and the three existing runs
 * in this script have each been wrong in a way that looked fine in the source:
 * a doubled divider, a middle segment keeping its radius, a run splitting in
 * two because something foreign was inserted between its members.
 *
 * Prints the numbers an assertion should be written against:
 *
 *   node scripts/probe-toolbar-pinned-pill.js
 */

const path = require('path');
const { chromium } = require('@playwright/test');
const { loadUserscriptPage } = require('../tests/support/loadPage');

const URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/recordings';
const FIXTURE = path.join(__dirname, '..', 'tests', 'fixtures', 'uniq-drop-viewport-clip.html');

(async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await context.newPage();

    await loadUserscriptPage(page, { url: URL, fixtureFile: FIXTURE, testMode: true });
    await page.waitForSelector('#mb-app-help-btn');

    const geom = await page.evaluate(() => {
        const pick = (el) => {
            const cs = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            return {
                id: el.id,
                x: +r.x.toFixed(1), right: +r.right.toFixed(1),
                w: +r.width.toFixed(1), h: +r.height.toFixed(1),
                bg: cs.backgroundColor,
                radius: [cs.borderTopLeftRadius, cs.borderTopRightRadius,
                         cs.borderBottomRightRadius, cs.borderBottomLeftRadius].join(' '),
                borderW: [cs.borderTopWidth, cs.borderRightWidth,
                          cs.borderBottomWidth, cs.borderLeftWidth].join(' '),
                marginLeft: cs.marginLeft,
                title: el.title,
            };
        };
        const ids = ['mb-data-menu-btn', 'mb-view-menu-btn', 'mb-settings-btn', 'mb-app-help-btn'];
        const out = ids.map((i) => {
            const el = document.getElementById(i);
            return el ? pick(el) : { id: i, missing: true };
        });
        const bar = document.getElementById('mb-show-all-controls-container');
        return {
            buttons: out,
            gap: getComputedStyle(bar).gap,
            children: Array.from(bar.children).map((c) => c.id || c.className || c.tagName),
        };
    });

    console.log('container gap:', geom.gap);
    console.log('container children:', JSON.stringify(geom.children));
    console.log();
    for (const b of geom.buttons) {
        if (b.missing) { console.log(`${b.id}: MISSING`); continue; }
        console.log(`${b.id}`);
        console.log(`   x=${b.x} right=${b.right} w=${b.w} h=${b.h}`);
        console.log(`   bg=${b.bg}`);
        console.log(`   radius=${b.radius}`);
        console.log(`   border(t r b l)=${b.borderW}  margin-left=${b.marginLeft}`);
        console.log(`   title=${JSON.stringify(b.title)}`);
    }

    const s = geom.buttons.find((b) => b.id === 'mb-settings-btn');
    const h = geom.buttons.find((b) => b.id === 'mb-app-help-btn');
    if (s && h && !s.missing && !h.missing) {
        console.log();
        console.log(`seam: settings.right=${s.right}  help.x=${h.x}  `
                    + `delta=${(h.x - s.right).toFixed(1)} px  (0 = touching, one shared hairline)`);
    }

    // The bar is flex-wrap:wrap, so the two halves can in principle land on
    // different lines — and the second one carries a negative margin that only
    // makes sense beside its partner. Sweep the width to find out whether that
    // is reachable, and how it looks if it is.
    console.log('\n--- width sweep (does the pill ever split across lines?) ---');
    let splits = 0;
    for (let w = 1400; w >= 420; w -= 10) {
        await page.setViewportSize({ width: w, height: 900 });
        const r = await page.evaluate(() => {
            const g = document.getElementById('mb-settings-btn').getBoundingClientRect();
            const h2 = document.getElementById('mb-app-help-btn').getBoundingClientRect();
            const bar = document.getElementById('mb-show-all-controls-container').getBoundingClientRect();
            return {
                sameLine: Math.abs(g.y - h2.y) < 1,
                seam: +(h2.x - g.right).toFixed(1),
                helpLeftOfBar: +(h2.x - bar.x).toFixed(1),
            };
        });
        if (!r.sameLine) {
            splits++;
            console.log(`  ${w}px: SPLIT — seam=${r.seam}, help.x - bar.x = ${r.helpLeftOfBar}`);
        }
    }
    console.log(splits ? `  ${splits} width(s) split the pill` : '  never split at any width sampled');

    await browser.close();
})();
