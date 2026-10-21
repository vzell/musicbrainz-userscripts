'use strict';

// MusicBrainz's own modal dialog paints above this script's pinned UI
// (2026-10-21, reported with screenshots on a release group and a release
// page: the h1 toolbar buttons and the sidebar handle showed THROUGH the
// sidebar cover's dialog). MusicBrainz appends the jQuery UI overlay and
// dialog to <body> (debug/mb-native-sidbar-image-open.html, an event page)
// at jQuery UI's `.ui-front { z-index: 100 }`; the stuck header block
// (105–107), the stuck h2 (104) and the sidebar handle (10000) are above
// that. The guarantee pinned is what the user SEES: at the centre of the
// toolbar button, of the tracklist h2 and of the sidebar handle, the
// topmost element is the overlay; inside the dialog it is the dialog.
// The page already holds a hidden `.ui-dialog` of its own, so the planted
// one has an id. The dialog's markup is the snapshot's, its stylesheet jQuery UI's own
// rules for these classes (position and z-index), added AFTER the
// userscript's, as MusicBrainz's stylesheet would win a tie.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const URL = 'https://musicbrainz.org/release/20a52f17-ce0b-48bf-911e-9f962a518185';
const FIXTURE = path.join(__dirname, 'release-tracks-live-date-flags.html');

const JQUI_CSS = '.ui-front { z-index: 100; } ' +
    '.ui-widget-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.3); } ' +
    '.ui-dialog { position: absolute; top: 0; left: 0; padding: .2em; outline: 0; background: #fff; }';

/**
 * Appends MusicBrainz's artwork dialog to <body> as the snapshot has it.
 * @param {import('@playwright/test').Page} page
 */
const openMbDialog = (page) => page.evaluate(() => {
    const ov = document.createElement('div');
    ov.className = 'ui-widget-overlay ui-front';
    const dlg = document.createElement('div');
    dlg.className = 'ui-dialog ui-widget ui-widget-content ui-corner-all ui-front ui-draggable';
    dlg.id = 'pw-mb-dialog';
    dlg.setAttribute('role', 'dialog');
    dlg.style.cssText = 'height: auto; width: 300px; top: 300px; left: 300px; display: block;';
    dlg.innerHTML = '<div class="ui-dialog-titlebar ui-widget-header"><span class="ui-dialog-title"></span></div>' +
        '<div class="ui-dialog-content ui-widget-content artwork-dialog" style="height: 192px;"></div>';
    document.body.append(ov, dlg);
});

/**
 * What the browser hits at the centre of `sel`'s first element: 'overlay',
 * 'dialog' or the element's own description.
 * @param {import('@playwright/test').Page} page
 * @param {string} sel
 */
const topAt = (page, sel) => page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return `missing ${s}`;
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (!hit) return 'nothing';
    if (hit.closest('.ui-dialog')) return 'dialog';
    if (hit.closest('.ui-widget-overlay')) return 'overlay';
    return `${hit.tagName}.${hit.className}`;
}, sel);

test('MusicBrainz\'s modal dialog covers the toolbar, the stuck bars and the sidebar handle', async ({ page }) => {
    await loadUserscriptPage(page, { url: URL, fixtureFile: FIXTURE, testMode: true });
    await page.route(`${URL}?**`, (r) => r.fulfill({ path: FIXTURE, contentType: 'text/html' }));
    await page.click('button[data-label="Show all Tracks for Release"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
    await page.addStyleTag({ content: JQUI_CSS });
    await openMbDialog(page);
    expect(await topAt(page, '#mb-show-all-controls-container button'), 'the h1 toolbar').toBe('overlay');
    expect(await topAt(page, 'h2.tracklist'), 'the stuck h2').toBe('overlay');
    expect(await topAt(page, '#sidebar-toggle-handle'), 'the sidebar handle').toBe('overlay');
    expect(await topAt(page, '#pw-mb-dialog .artwork-dialog'), 'the dialog over its overlay').toBe('dialog');
});
