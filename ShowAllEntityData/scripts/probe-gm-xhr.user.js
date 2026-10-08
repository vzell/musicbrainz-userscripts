// ==UserScript==
// @name         SAED probe: GM_xmlhttpRequest to other sites
// @namespace    https://github.com/vzell/mb-userscripts
// @version      1.0.0
// @description  U0 of the external-link previews (org/iframe.org): what a real browser's GM_xmlhttpRequest gets from the sites the readers will read. Run it from the Tampermonkey menu; nothing happens on page load. Throwaway, never published.
// @match        https://musicbrainz.org/event/*
// @connect      *
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// ==/UserScript==

/*
 * The three browser checks of U0 (org/iframe.org, "* generalize to URLs",
 * "U0: probes"):
 *   B1  Does Tampermonkey ask before the first request to a domain that only
 *       `@connect *` covers? Watch for its permission page on the first run;
 *       note what it offers, then allow.
 *   B2  Does `anonymous: true` behave the same in every browser? Each target
 *       is asked twice, anonymous and not; the table shows both.
 *   B3  Does a Cloudflare-checked site (discogs.com, allmusic, rateyourmusic)
 *       answer the browser's request, which the Python probe could not get
 *       past? Run once as you are, then again after opening one of those sites
 *       in a tab (which may give the browser a clearance cookie): only the
 *       non-anonymous request can carry that cookie.
 * The results appear in a box on the page and in the console as a table;
 * copy them into org/iframe.org.
 */
/* global GM_xmlhttpRequest, GM_registerMenuCommand */
(function () {
    'use strict';

    const TARGETS = [
        'https://en.wikipedia.org/api/rest_v1/page/summary/TeachRock',
        'https://www.youtube.com/oembed?format=json&url=' +
            encodeURIComponent('https://www.youtube.com/playlist?list=PLM0aPYPhFzkq16BnNlrlAIcVvN1_TBmcS'),
        'https://api.discogs.com/releases/1874253',
        'https://www.setlist.fm/setlist/bruce-springsteen/2025/co-op-live-manchester-england-43535b97.html',
        'http://brucebase.wikidot.com/2025',
        'https://www.discogs.com/release/1874253',
        'https://www.allmusic.com/album/mw0000650803',
        'https://rateyourmusic.com/release/album/bruce-springsteen/born-to-run/',
    ];

    /**
     * One GM_xmlhttpRequest, resolved with what the card would need to know.
     * @param {string} url - The target.
     * @param {boolean} anonymous - Send no cookies, store none.
     * @returns {Promise<Object>} status, final URL, bytes, ms, Cloudflare mark, title.
     */
    function probe(url, anonymous) {
        const t0 = performance.now();
        return new Promise(resolve => {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                anonymous,
                timeout: 30000,
                onload: r => {
                    const text = r.responseText || '';
                    const title = (text.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || '';
                    resolve({
                        url, anonymous, status: r.status, final: r.finalUrl || '',
                        bytes: text.length, ms: Math.round(performance.now() - t0),
                        cf: (/cf-mitigated:\s*(\S+)/i.exec(r.responseHeaders || '') || [])[1] || '',
                        title: title.trim().slice(0, 60),
                    });
                },
                onerror: e => resolve({ url, anonymous, status: 'error', final: '', bytes: 0,
                    ms: Math.round(performance.now() - t0), cf: '', title: String(e && e.error || '') }),
                ontimeout: () => resolve({ url, anonymous, status: 'timeout', final: '', bytes: 0,
                    ms: 30000, cf: '', title: '' }),
            });
        });
    }

    /**
     * Runs every target, anonymous then not, one second apart, and shows the table.
     * @returns {Promise<void>}
     */
    async function run() {
        const box = document.createElement('pre');
        box.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:2147483647;max-width:calc(100vw - 16px);' +
            'max-height:60vh;overflow:auto;background:#fff;color:#000;border:2px solid #333;padding:8px;font:11px monospace';
        box.textContent = 'probing…';
        document.body.appendChild(box);
        const rows = [];
        for (const url of TARGETS) {
            for (const anonymous of [true, false]) {
                rows.push(await probe(url, anonymous));
                box.textContent = rows.map(r => `${r.anonymous ? 'anon ' : 'cookie'} ${r.status} ${r.cf || '-'} ` +
                    `${r.bytes}B ${r.ms}ms ${r.url}${r.final && r.final !== r.url ? ' → ' + r.final : ''} ${r.title}`).join('\n');
                await new Promise(ok => setTimeout(ok, 1000));
            }
        }
        box.textContent = `${navigator.userAgent}\n${new Date().toISOString()}\n\n${box.textContent}`;
        console.table(rows);
    }

    GM_registerMenuCommand('Run the GM_xmlhttpRequest probe', run);
})();
