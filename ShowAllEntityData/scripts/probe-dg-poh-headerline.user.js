// ==UserScript==
// @name         SAED probe: MusicBrainz and Discogs history from discogs.com
// @namespace    https://github.com/vzell/mb-userscripts
// @version      1.0.0
// @description  Step 1 of org/POH-headerline.org: what a real browser on discogs.com gets for a musicbrainz.org page (anonymous vs with cookies), the Cover Art Archive (page fetch vs GM, and an image), and Discogs' /history pages of a master, artist and label. Run it from the Tampermonkey menu on a discogs.com master page; nothing happens on page load. Throwaway, never published.
// @match        https://www.discogs.com/*
// @connect      musicbrainz.org
// @connect      coverartarchive.org
// @connect      archive.org
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// ==/UserScript==

/*
 * Three questions (org/POH-headerline.org, Step 1):
 *   P1  An MB window on discogs.com has no Live page and no Editing history,
 *       because MusicBrainz answers an anonymous script's page request with
 *       its browser check (_dgMbSource()). Does a GM request that carries the
 *       browser's musicbrainz.org cookies get the real page? Each MB URL is
 *       asked anonymous and with cookies. "real page" = the answer holds
 *       MusicBrainz's #content; the Web Service URL is the control.
 *   P2  Its cover art says "The archive did not answer.": _artFetchEntityImages()
 *       uses the page's fetch(). Is that refused by Discogs' CSP (look for a
 *       securitypolicyviolation row) or by CORS? Does GM get the JSON, and
 *       does a coverartarchive.org <img> load on discogs.com (img-src)?
 *   P3  Do a master, an artist and a label have a /history page shaped like a
 *       release's (table#hist, #editing_header, tr.datarow), which the
 *       dghistory reader parses? The ids are taken from this page's links; a
 *       release's history is the control.
 * Open a discogs.com master page (e.g. /master/27146-Bruce-Springsteen-Human-Touch)
 * while logged in to musicbrainz.org in the same browser, then run the menu
 * command. Results appear in a box on the page and in the console as a table;
 * copy them into org/POH-headerline.org.
 */
/* global GM_xmlhttpRequest, GM_registerMenuCommand */
(function () {
    'use strict';

    // The Human Touch cassette of vzell's screenshots, and its archive record.
    const MBID = '4e3e8020-fe43-4a72-8650-5866e489a8a0';
    const CAA_JSON = `https://coverartarchive.org/release/${MBID}`;
    const CAA_IMG = `https://coverartarchive.org/release/${MBID}/26916747544-250.jpg`;
    const MB_URLS = [
        `https://musicbrainz.org/ws/2/release/${MBID}?fmt=json`,
        `https://musicbrainz.org/release/${MBID}`,
        `https://musicbrainz.org/release/${MBID}/edits`,
    ];

    const rows = [];
    const violations = [];
    document.addEventListener('securitypolicyviolation', (e) => {
        violations.push({ blocked: e.blockedURI, directive: e.violatedDirective });
    });

    /**
     * The page title of an HTML answer, cut short.
     * @param {string} text
     * @returns {string}
     */
    function titleOf(text) {
        return ((text.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || '').trim().slice(0, 60);
    }

    /**
     * One GM_xmlhttpRequest.
     * @param {string} url
     * @param {boolean} anonymous - Send no cookies, store none.
     * @returns {Promise<{status: (number|string), final: string, text: string, ms: number}>}
     */
    function gm(url, anonymous) {
        const t0 = performance.now();
        return new Promise(resolve => {
            GM_xmlhttpRequest({
                method: 'GET', url, anonymous, timeout: 30000,
                headers: { Accept: url.includes('/ws/2/') || url.includes('coverartarchive') ? 'application/json' : 'text/html' },
                onload: r => resolve({ status: r.status, final: r.finalUrl || '', text: r.responseText || '', ms: Math.round(performance.now() - t0) }),
                onerror: e => resolve({ status: 'error', final: '', text: String(e && e.error || ''), ms: Math.round(performance.now() - t0) }),
                ontimeout: () => resolve({ status: 'timeout', final: '', text: '', ms: 30000 }),
            });
        });
    }

    /**
     * Waits, so musicbrainz.org sees about one request a second.
     * @param {number} ms
     * @returns {Promise<void>}
     */
    const pause = ms => new Promise(r => setTimeout(r, ms));

    /**
     * P1: every MusicBrainz URL, anonymous then with cookies.
     * @returns {Promise<void>}
     */
    async function probeMb() {
        for (const url of MB_URLS) {
            for (const anonymous of [true, false]) {
                const r = await gm(url, anonymous);
                rows.push({
                    probe: 'P1', what: url.replace('https://musicbrainz.org', ''), how: anonymous ? 'GM anonymous' : 'GM cookies',
                    status: r.status, ms: r.ms, bytes: r.text.length, title: titleOf(r.text),
                    verdict: url.includes('/ws/2/') ? (/^\s*\{/.test(r.text) ? 'JSON' : 'not JSON')
                        : (/id="content"/.test(r.text) ? 'real page' : 'NOT the page (browser check?)'),
                });
                await pause(1200);
            }
        }
    }

    /**
     * P2: the archive record by the page's fetch() and by GM, and an image.
     * @returns {Promise<void>}
     */
    async function probeCaa() {
        try {
            const resp = await fetch(CAA_JSON);
            rows.push({ probe: 'P2', what: 'CAA JSON', how: 'page fetch()', status: resp.status, ms: '', bytes: '', title: '', verdict: resp.ok ? 'ok' : 'HTTP error' });
        } catch (err) {
            rows.push({ probe: 'P2', what: 'CAA JSON', how: 'page fetch()', status: 'threw', ms: '', bytes: '', title: String(err && err.message || err).slice(0, 60), verdict: 'refused' });
        }
        const g = await gm(CAA_JSON, true);
        let n;
        try {
            n = `${JSON.parse(g.text).images.length} images`;
        } catch (_) {
            n = 'not JSON';
        }
        rows.push({ probe: 'P2', what: 'CAA JSON', how: 'GM anonymous', status: g.status, ms: g.ms, bytes: g.text.length, title: g.final.slice(0, 60), verdict: n });
        const imgOk = await new Promise(resolve => {
            const im = new Image();
            im.onload = () => resolve(`loaded ${im.naturalWidth}×${im.naturalHeight}`);
            im.onerror = () => resolve('failed');
            im.referrerPolicy = 'no-referrer';
            im.src = CAA_IMG;
            setTimeout(() => resolve('timeout'), 20000);
        });
        rows.push({ probe: 'P2', what: 'CAA <img> 250 px', how: 'page <img>', status: '', ms: '', bytes: '', title: '', verdict: imgOk });
    }

    /**
     * P3: the /history page of the first master, artist, label and release
     * this page links (or is), same origin.
     * @returns {Promise<void>}
     */
    async function probeHistory() {
        const ids = {};
        const here = /^\/(?:[a-z]{2}\/)?(master|release|artist|label)\/(\d+)/.exec(location.pathname);
        if (here) ids[here[1]] = here[2];
        for (const a of document.querySelectorAll('a[href]')) {
            const m = /^(?:https:\/\/www\.discogs\.com)?\/(?:[a-z]{2}\/)?(master|release|artist|label)\/(\d+)/.exec(a.getAttribute('href') || '');
            if (m && !ids[m[1]]) ids[m[1]] = m[2];
        }
        for (const kind of ['release', 'master', 'artist', 'label']) {
            if (!ids[kind]) {
                rows.push({ probe: 'P3', what: `${kind} history`, how: 'page fetch()', status: '', ms: '', bytes: '', title: '', verdict: 'no link of that kind on this page' });
                continue;
            }
            const url = `/${kind}/${ids[kind]}/history`;
            const t0 = performance.now();
            try {
                const resp = await fetch(url, { credentials: 'include' });
                const text = await resp.text();
                const doc = new DOMParser().parseFromString(text, 'text/html');
                const shape = ['table#hist', '#editing_header', 'table#hist tbody > tr.datarow']
                    .map(sel => `${sel.split(' ').pop()}:${doc.querySelectorAll(sel).length}`).join(' ');
                rows.push({ probe: 'P3', what: url, how: 'page fetch()', status: resp.status, ms: Math.round(performance.now() - t0), bytes: text.length,
                    title: titleOf(text), verdict: `${resp.redirected ? `redirected to ${resp.url} · ` : ''}${shape}` });
            } catch (err) {
                rows.push({ probe: 'P3', what: url, how: 'page fetch()', status: 'threw', ms: '', bytes: '', title: String(err && err.message || err).slice(0, 60), verdict: '' });
            }
            await pause(1200);
        }
    }

    /**
     * Shows the rows in a box on the page and in the console.
     * @returns {void}
     */
    function show() {
        violations.forEach(v => rows.push({ probe: 'P2', what: v.blocked, how: 'CSP violation', status: '', ms: '', bytes: '', title: '', verdict: v.directive }));
        console.table(rows);
        const box = document.createElement('pre');
        box.style.cssText = 'position:fixed;z-index:2147483647;left:8px;right:8px;bottom:8px;max-height:60vh;overflow:auto;' +
            'background:#fff;color:#000;border:2px solid #333;padding:8px;font:12px/1.4 monospace;white-space:pre-wrap;';
        box.textContent = `Probe ${new Date().toISOString()} on ${location.href}\n${navigator.userAgent}\n\n` +
            rows.map(r => [r.probe, r.what, r.how, r.status, r.ms, r.bytes, r.title, r.verdict].join(' | ')).join('\n');
        box.addEventListener('dblclick', () => box.remove());
        document.body.appendChild(box);
    }

    /**
     * Runs the three probes in order.
     * @returns {Promise<void>}
     */
    async function run() {
        rows.length = 0;
        await probeCaa();
        await probeMb();
        await probeHistory();
        show();
    }

    GM_registerMenuCommand('Run the POH header line probe', run);
})();
