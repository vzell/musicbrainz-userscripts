// ==UserScript==
// @name         PROBE setlist.fm session (throwaway)
// @namespace    https://github.com/vzell/mb-userscripts
// @version      0.2
// @description  org/setlistfm.org: can a GM request read a setlist.fm page, and does /search need the WAF cookie? Uninstall after one run.
// @match        https://musicbrainz.org/*
// @match        https://www.setlist.fm/venue/*
// @match        https://www.setlist.fm/search*
// @connect      www.setlist.fm
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @noframes
// ==/UserScript==
/* global GM_xmlhttpRequest, GM_registerMenuCommand */

/*
 * v0.1 (2026-11-02, "venue additions" Step 0 / S1): is a setlist.fm HTML
 * page readable by the userscript at all, or does it come back as the bot
 * check (HTTP 202, empty body) that the Python probe got on 2026-10-29? It
 * was readable: venue page 2, anonymous and with cookies, 200.
 *
 * v0.2 (2026-11-03, "bugs and new additions" item 1): the hover card of a
 * Tour cell (setlist.fm's own `search?artist=…&tour=…`) on setlist.fm said
 * "checked by AWS WAF", while the pageType's same-origin reads of the same
 * search page worked. Hypothesis: /search challenges a request without the
 * `aws-waf-token` cookie, and the reader's request is anonymous. Each
 * request below is asked of the search page AND of the venue page (the
 * control), one after another, 1.5 s apart.
 *
 * Run it from the Tampermonkey menu ("PROBE setlist.fm session") on
 *   - any musicbrainz.org page: GM anonymous, GM with the browser's
 *     setlist.fm cookies;
 *   - a www.setlist.fm/search?... or /venue/... page: the same two, plus a
 *     same-origin fetch().
 * Each result goes to the console as one "[sfm-probe]" line: the status,
 * the `x-amzn-waf-action` header, the body length and the .setlistPreview
 * blocks. Copy those lines into the chat.
 */
(function () {
    'use strict';

    const URLS = {
        search: 'https://www.setlist.fm/search?artist=2bd6dcce&tour=3daa95b',
        venue: 'https://www.setlist.fm/venue/state-farm-arena-atlanta-ga-usa-73d20e81.html?page=2',
    };

    /**
     * Prints one result line for an answer.
     *
     * @param {string} how - Which request this was.
     * @param {number} status - The HTTP status.
     * @param {string} waf - The `x-amzn-waf-action` header, '' for none.
     * @param {string} body - The answer's text.
     * @param {string} finalUrl - Where the request ended up.
     * @returns {void}
     */
    function report(how, status, waf, body, finalUrl) {
        const doc = new DOMParser().parseFromString(body || '', 'text/html');
        const previews = doc.querySelectorAll('.setlistPreview').length;
        const times = doc.querySelectorAll('.setlistPreviewSetTimes').length;
        console.log(`[sfm-probe] ${how}: status ${status}, waf "${waf}", ${(body || '').length} chars, ` +
            `final ${finalUrl}, .setlistPreview ${previews}, .setlistPreviewSetTimes ${times}, title "${(doc.title || '').trim()}"`);
    }

    /**
     * One header's value from GM's raw header block.
     *
     * @param {string} raw - `responseHeaders`.
     * @param {string} name - Lower case.
     * @returns {string}
     */
    function header(raw, name) {
        const line = String(raw || '').split(/\r?\n/).find(l => l.toLowerCase().startsWith(`${name}:`));
        return line ? line.slice(name.length + 1).trim() : '';
    }

    /**
     * One GM GET.
     *
     * @param {string} which - 'search' or 'venue'.
     * @param {boolean} anonymous - true: without cookies.
     * @returns {Promise<void>}
     */
    function gmGet(which, anonymous) {
        const how = `${which} GM_xmlhttpRequest anonymous=${anonymous}`;
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'GET', url: URLS[which], anonymous, timeout: 30000,
                onload: (r) => { report(how, r.status, header(r.responseHeaders, 'x-amzn-waf-action'), r.responseText, r.finalUrl); resolve(); },
                onerror: (r) => { console.log(`[sfm-probe] ${how}: error ${r && r.error}`); resolve(); },
                ontimeout: () => { console.log(`[sfm-probe] ${how}: timeout`); resolve(); },
            });
        });
    }

    /**
     * One same-origin fetch() (on setlist.fm only).
     *
     * @param {string} which - 'search' or 'venue'.
     * @returns {Promise<void>}
     */
    async function sameOrigin(which) {
        try {
            const r = await fetch(URLS[which], { credentials: 'same-origin' });
            report(`${which} same-origin fetch`, r.status, r.headers.get('x-amzn-waf-action') || '', await r.text(), r.url);
        } catch (e) {
            console.log(`[sfm-probe] ${which} same-origin fetch: error ${e && e.message}`);
        }
    }

    /**
     * Waits between two requests.
     *
     * @returns {Promise<void>}
     */
    function pause() {
        return new Promise(res => setTimeout(res, 1500));
    }

    /**
     * Runs the probe for the host it is on.
     *
     * @returns {Promise<void>}
     */
    async function run() {
        console.log(`[sfm-probe] v0.2 start ${new Date().toISOString()} on ${location.href}, UA ${navigator.userAgent}`);
        for (const which of ['search', 'venue']) {
            await gmGet(which, true);
            await pause();
            await gmGet(which, false);
            await pause();
            if (location.hostname === 'www.setlist.fm') {
                await sameOrigin(which);
                await pause();
            }
        }
        console.log('[sfm-probe] done');
    }

    GM_registerMenuCommand('PROBE setlist.fm session', run);
})();
