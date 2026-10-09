'use strict';

// The status line (#mb-status-displays-wrapper, "Loaded … Fetching …") sits
// right under the page's <h1>, ABOVE the data h2. On a page without a
// p.subheader the init block inserts it right after the <h1>; a pageType
// whose data h2 is injected (features.insertH2) on a page without tabs or
// h3s then put that h2 right after the <h1> too, i.e. BETWEEN the h1 and the
// status line. Reported 2026-10-09 on report/AnnotationsEvents,
// report/ISRCsWithManyRecordings and cdstub/browse.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

test('report page: h1, then the status line, then the injected data h2', async ({ page }) => {
    const url = 'https://musicbrainz.org/report/ASINsWithMultipleReleases';
    const fixtureFile = path.join(__dirname, 'asins-with-multiple-releases.html');
    await loadUserscriptPage(page, { url, fixtureFile, testMode: true });
    await page.route(`${url}?**`, (route) => route.fulfill({ path: fixtureFile, contentType: 'text/html' }));
    await page.click('button[data-label="Unfiltered"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
    const order = await page.evaluate(() => {
        const wrap = document.getElementById('mb-status-displays-wrapper');
        const h2 = document.getElementById('mb-global-filter-input').closest('h2');
        return {
            injected: h2.dataset.mbInjectedH2 === '1',
            afterH1: wrap.previousElementSibling?.tagName,
            h2AfterStatus: wrap.nextElementSibling === h2,
            statusAboveH2: wrap.getBoundingClientRect().bottom <= h2.getBoundingClientRect().top + 0.5,
        };
    });
    expect(order).toEqual({ injected: true, afterH1: 'H1', h2AfterStatus: true, statusAboveH2: true });
});
