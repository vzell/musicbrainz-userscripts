'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// A flag a third-party userscript has NEUTRALIZED must contribute ONE icon to a
// 📊 dropdown entry, not two.
//
// "Right Side Flags Everywhere" picks between two shapes depending on whether
// the `.flag` element wraps an `a[href*="/area/"]`:
//
//   * WITH an anchor  -> neutralize in place, put the <img> in a sibling
//     `span.mfe-flag-wrapper`. `iconSel` has excluded this since the Israel fix.
//   * WITHOUT one     -> `el.appendChild(img)` INSIDE the flag element, leaving
//     the hollow element in the DOM. This was NOT excluded, so both it and the
//     <img> matched and the entry rendered a flag before AND after the name.
//
// That second shape is what the injected "Release country" column used to
// produce, because its script-built spans carried no anchor. Those cells now
// emit MusicBrainz's native anchored markup, so in practice RSFE takes the
// first branch there — but the guard is pinned here directly rather than
// resting on that, since any anchorless flag span reaches the same path.
//
// The clean-native row is a CONTROL, and it is load-bearing: "one icon" passes
// trivially on a fixture that renders no icons at all.

const ARTIST_EVENTS_URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/events';
const FIXTURE_FILE = path.join(__dirname, 'uniq-drop-flag-shapes.html');

async function openLocationDrop(page) {
    await loadUserscriptPage(page, {
        url: ARTIST_EVENTS_URL,
        fixtureFile: FIXTURE_FILE,
        testMode: true,
        settingsOverride: { sa_enable_dropdown_flag_icons: true },
    });
    await page.click('button[data-label="Show all Events for Artist"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });

    await page.evaluate(() => {
        const th = Array.from(document.querySelectorAll('table.tbl thead th'))
            .find((t) => t.dataset.colName === 'Location');
        th.querySelector('.mb-col-uniq-wrap').click();
    });
    await page.waitForSelector('#mb-col-uniq-dropdown');
}

/**
 * Icon nodes per PLAIN-VALUE dropdown entry, keyed by the country in its label.
 *
 * Synthetic (`»`-prefixed) entries are excluded: they carry
 * `.mb-uniq-syn-label-text` and follow their own icon rules, so mixing them in
 * would put three contracts under one count. The rendering under test is
 * `renderItems()`'s flag-segment path, which `flagIconMap` feeds.
 */
function readIcons(page) {
    return page.evaluate(() => {
        const drop = document.getElementById('mb-col-uniq-dropdown');
        const out = {};
        Array.from(drop.querySelectorAll('.mb-col-uniq-item'))
            .filter((item) => !item.querySelector('.mb-uniq-syn-label-text'))
            .forEach((item) => {
                const text = (item.textContent || '').replace(/\s+/g, ' ').trim();
                const m = text.match(/Spain|France|Italy/);
                if (!m) return;
                const icons = Array.from(item.querySelectorAll('img.mb-hq-flag-img, [class*="flag-"]'));
                out[m[0]] = {
                    text,
                    count: icons.length,
                    kinds: icons.map((n) => (n.tagName === 'IMG' ? 'img' : 'span')),
                };
            });
        return out;
    });
}

test('each flag shape contributes exactly one dropdown icon — including the one a userscript hollowed out', async ({ page }) => {
    await openLocationDrop(page);
    const icons = await readIcons(page);

    // CONTROL — proves this fixture renders icons at all, so the two
    // single-icon assertions below cannot pass by rendering nothing.
    expect(icons.Spain, 'the clean native row has an entry').toBeTruthy();
    expect(icons.Spain.count, 'clean native flag: one icon').toBe(1);
    expect(icons.Spain.kinds).toEqual(['span']);

    // RSFE's wrapper shape — already excluded before this change; here to catch
    // a regression in the guard it shares with the new one.
    expect(icons.France, 'the wrapper-shape row has an entry').toBeTruthy();
    expect(icons.France.count, 'RSFE wrapper shape: one icon, not two').toBe(1);
    expect(icons.France.kinds).toEqual(['img']);

    // RSFE's direct-append shape — the defect. Before the fix this was
    // ['span', 'img']: the hollowed sprite AND the real image, rendered either
    // side of the name.
    expect(icons.Italy, 'the direct-append row has an entry').toBeTruthy();
    expect(icons.Italy.count, 'RSFE direct-append shape: one icon, not two').toBe(1);
    expect(icons.Italy.kinds).toEqual(['img']);
});

test('a hollowed flag never reaches the panel as a bare class the userscript can repaint', async ({ page }) => {
    await openLocationDrop(page);

    // The second half of the defect: even excluded from `iconSel`, a neutralized
    // flag could still arrive via `_bakeFlagIconNode()` as a class-only clone
    // with no inline background. That is not inert — RSFE's own stylesheet rule
    // `.flag:not([data-hq-processed]):not([data-hq-skip])` blanks it and its
    // MutationObserver (on document.documentElement, and the panel is appended
    // to document.body) then decorates it with a fresh <img>. Any `.flag` clone
    // the panel does emit must therefore carry `data-hq-skip`.
    const unguarded = await page.evaluate(() => {
        const drop = document.getElementById('mb-col-uniq-dropdown');
        return Array.from(drop.querySelectorAll('[class*="flag-"]'))
            .filter((el) => el.classList.contains('flag') && !el.hasAttribute('data-hq-skip'))
            .map((el) => el.className);
    });
    expect(unguarded, 'every .flag clone in the panel opts out of re-decoration').toEqual([]);
});
