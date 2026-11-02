// ==UserScript==
// @name         PROBE setlist.fm session (throwaway)
// @namespace    https://github.com/vzell/mb-userscripts
// @version      0.1
// @description  Step 0 / S1 of org/setlistfm.org "venue additions": can a GM request read a setlist.fm page? Uninstall after one run.
// @match        https://musicbrainz.org/*
// @match        https://www.setlist.fm/venue/*
// @connect      www.setlist.fm
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @noframes
// ==/UserScript==
/* global GM_xmlhttpRequest, GM_registerMenuCommand */

/*
 * Answers one question before any set-times code is written: is a
 * setlist.fm HTML page readable by the userscript, or does it come back as
 * the bot check (HTTP 202, empty body) that the Python probe got on
 * 2026-10-29 (docs/claude/detail-pages.md "setlist.fm through its API")?
 *
 * Run it from the Tampermonkey menu ("PROBE setlist.fm session") on
 *   - any musicbrainz.org page: two GM_xmlhttpRequest GETs of venue page 2,
 *     the first anonymous (no cookies), the second with the browser's
 *     setlist.fm cookies;
 *   - a www.setlist.fm/venue/... page: one same-origin fetch() of page 2.
 * Each result goes to the console as one "[sfm-probe]" line: the status,
 * the body length, the .setlistPreview blocks and whether
 * .setlistPreviewSetTimes is there. Copy those lines into the chat.
 */
(function () {
    'use strict';

    const URL_P2 = 'https://www.setlist.fm/venue/state-farm-arena-atlanta-ga-usa-73d20e81.html?page=2';

    /**
     * Prints one result line for an answer.
     *
     * @param {string} how - Which request this was.
     * @param {number} status - The HTTP status.
     * @param {string} body - The answer's text.
     * @param {string} finalUrl - Where the request ended up.
     * @returns {void}
     */
    function report(how, status, body, finalUrl) {
        const doc = new DOMParser().parseFromString(body || '', 'text/html');
        const previews = doc.querySelectorAll('.setlistPreview').length;
        const times = doc.querySelectorAll('.setlistPreviewSetTimes').length;
        const firstTimes = doc.querySelector('.setlistPreviewSetTimes');
        console.log(`[sfm-probe] ${how}: status ${status}, ${(body || '').length} chars, ` +
            `final ${finalUrl}, .setlistPreview ${previews}, .setlistPreviewSetTimes ${times}` +
            (firstTimes ? `, first: "${firstTimes.textContent.replace(/\s+/g, ' ').trim()}"` : '') +
            `, title "${(doc.title || '').trim()}"`);
    }

    /**
     * One GM GET of page 2.
     *
     * @param {boolean} anonymous - true: without cookies.
     * @returns {Promise<void>}
     */
    function gmGet(anonymous) {
        const how = `GM_xmlhttpRequest anonymous=${anonymous}`;
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'GET', url: URL_P2, anonymous, timeout: 30000,
                onload: (r) => { report(how, r.status, r.responseText, r.finalUrl); resolve(); },
                onerror: (r) => { console.log(`[sfm-probe] ${how}: error ${r && r.error}`); resolve(); },
                ontimeout: () => { console.log(`[sfm-probe] ${how}: timeout`); resolve(); },
            });
        });
    }

    /**
     * Runs the probe for the host it is on.
     *
     * @returns {Promise<void>}
     */
    async function run() {
        console.log(`[sfm-probe] start ${new Date().toISOString()} on ${location.href}, UA ${navigator.userAgent}`);
        if (location.hostname === 'www.setlist.fm') {
            const r = await fetch(URL_P2, { credentials: 'same-origin' });
            report('same-origin fetch', r.status, await r.text(), r.url);
        } else {
            await gmGet(true);
            await new Promise(res => setTimeout(res, 1500));
            await gmGet(false);
        }
        console.log('[sfm-probe] done');
    }

    GM_registerMenuCommand('PROBE setlist.fm session', run);
})();
