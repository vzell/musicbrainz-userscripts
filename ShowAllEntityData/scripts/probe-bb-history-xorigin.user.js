// ==UserScript==
// @name         SAED probe: Brucebase history from another site
// @namespace    https://github.com/vzell/mb-userscripts
// @version      1.0.0
// @description  Phase 15 of org/brucebase.org: from musicbrainz.org, POSTs Wikidot's revision list for one Brucebase page with an anonymous GM_xmlhttpRequest and our own wikidot_token7, in four variants, and reports only status, timing, counts and whether the token was accepted — no names, no page text, no ids. Run it from the Tampermonkey menu; nothing happens on page load. Throwaway, never published.
// @match        https://musicbrainz.org/*
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM_info
// @connect      brucebase.wikidot.com
// @noframes
// ==/UserScript==

/*
 * What it asks (org/brucebase.org, "Phase 15 — History in Brucebase windows
 * on other sites"): can the window's History section work off
 * brucebase.wikidot.com? On the wiki it is a same-origin POST to
 * /ajax-module-connector.php whose body repeats the `wikidot_token7`
 * cookie, and Wikidot refuses the request when the two differ. Off the
 * wiki the request is a GM_xmlhttpRequest, and an external request stays
 * `anonymous` (docs/claude/detail-pages.md): the browser's Brucebase
 * cookies are never sent. So the question is whether a token we make up,
 * sent as a cookie of our own next to the same value in the body, is
 * accepted, and which of Tampermonkey's two ways of sending a cookie on an
 * anonymous request gets through.
 *
 * The requests, 1.1 s apart, all `anonymous: true`:
 *   0. GET  /<page>                      the page, for its page id
 *   1. POST history/PageRevisionListModule, Cookie HEADER = body token
 *   2. POST the same, Tampermonkey's `cookie` FIELD = body token
 *   3. POST the same, no cookie at all          (control: should be refused)
 *   4. POST the same, cookie ≠ body token       (control: should be refused)
 *   5. POST history/PageSourceModule for the newest revision, with the first
 *      variant that was accepted (the section's second kind of request);
 *      skipped when none was.
 * The tokens are fresh random hex, made for this run, never the browser's.
 *
 * What the report holds: per request the variant, HTTP status, time in ms,
 * the answer's length, whether it is JSON, Wikidot's `status` and its
 * system `message` (e-mail addresses masked), whether the token was
 * accepted (status "ok" with a body), and for a revision list the number of
 * rows and of member links in it, for a source the number of lines. Never a
 * member's name, a comment, a source line, a page id or a revision id
 * (written as "digits"). Review the JSON in the box, then Download it and
 * put it into debug/.
 *
 * The pure functions are exported for scripts/check-probe-bb-history-xorigin.js,
 * which runs them in Playwright's Chromium on planted answers.
 */
/* global GM_xmlhttpRequest, GM_registerMenuCommand, GM_info */
(function () {
    'use strict';

    const BASE = 'https://brucebase.wikidot.com';
    const DEFAULT_PAGE = '/song:streets-of-minneapolis';
    const SPACING_MS = 1100;
    const MESSAGE_LEN = 160;
    const LIST_MODULE = 'history/PageRevisionListModule';
    const SOURCE_MODULE = 'history/PageSourceModule';

    /**
     * Collapses runs of white space and trims.
     * @param {string} s - Text.
     * @returns {string} The squeezed text.
     */
    function squeeze(s) {
        return String(s || '').replace(/\s+/g, ' ').trim();
    }

    /**
     * Masks e-mail addresses and every run of six or more digits (ids).
     * @param {string} s - Text.
     * @returns {string} The masked text.
     */
    function mask(s) {
        return String(s).replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '‹email›').replace(/\d{6,}/g, 'digits');
    }

    /**
     * A fresh random token, the shape Wikidot's own scripts make.
     * @returns {string} Eight hex digits.
     */
    function makeToken() {
        return Math.random().toString(16).slice(2, 10).padEnd(8, '0');
    }

    /**
     * The page id Wikidot's own script carries (`WIKIREQUEST.info.pageId = N;`).
     * @param {string} html - The page's HTML.
     * @returns {(string|null)} The id.
     */
    function pageIdOf(html) {
        const m = /WIKIREQUEST\.info\.pageId\s*=\s*(\d+)/.exec(html || '');
        return m ? m[1] : null;
    }

    /**
     * The revision ids of a revision list's body, newest first.
     * @param {string} body - PageRevisionListModule's body.
     * @returns {string[]} The ids.
     */
    function revisionIds(body) {
        const doc = new DOMParser().parseFromString(`<div id="probe-root">${body || ''}</div>`, 'text/html');
        return Array.from(doc.querySelectorAll('tr[id^="revision-row-"]'))
            .map(tr => tr.id.replace(/^revision-row-/, ''))
            .filter(id => /^\d+$/.test(id));
    }

    /**
     * Describes one answer: what the report may hold of it.
     * @param {string} module - The module asked (LIST_MODULE, SOURCE_MODULE or '' for the page).
     * @param {{http: number, ms: number, text: string, error?: string}} res - The raw answer.
     * @returns {Object} Its description.
     */
    function describeAnswer(module, res) {
        const text = res.text || '';
        const out = { http: res.http, ms: res.ms, bytes: text.length };
        if (res.error) out.error = squeeze(res.error).slice(0, MESSAGE_LEN);
        if (!module) {
            out.pageId = pageIdOf(text) ? 'digits' : null;
            return out;
        }
        let data;
        try { data = JSON.parse(text); } catch (e) {
            out.json = false;
            out.startsWith = squeeze(text.slice(0, 40)).replace(/[^<>!/A-Za-z ]/g, '');
            out.accepted = false;
            return out;
        }
        out.json = true;
        out.status = data?.status ?? null;
        if (data?.message) out.message = mask(squeeze(String(data.message)).slice(0, MESSAGE_LEN));
        out.accepted = data?.status === 'ok' && typeof data?.body === 'string';
        if (!out.accepted) return out;
        out.bodyBytes = data.body.length;
        const doc = new DOMParser().parseFromString(`<div id="probe-root">${data.body}</div>`, 'text/html');
        if (module === LIST_MODULE) {
            out.revisionRows = doc.querySelectorAll('tr[id^="revision-row-"]').length;
            out.memberLinks = doc.querySelectorAll('.printuser').length;
            out.pager = !!doc.querySelector('.pager');
        } else if (module === SOURCE_MODULE) {
            const box = doc.querySelector('.page-source');
            out.pageSource = !!box;
            out.sourceLines = box ? box.querySelectorAll('br').length + 1 : 0;
        }
        return out;
    }

    /**
     * The run's verdict from its described requests.
     * @param {Object[]} requests - The described requests, each with `variant`.
     * @returns {{accepted: string[], refusedControls: string[], acceptedControls: string[], usable: boolean}}
     *   `usable` when a cookie variant was accepted AND both controls were refused
     *   (so the acceptance is the token check passing, not no check at all).
     */
    function verdict(requests) {
        const by = (v) => requests.find(r => r.variant === v);
        const ok = (v) => !!by(v)?.accepted;
        const accepted = ['cookie header', 'cookie field'].filter(ok);
        const controls = ['no cookie', 'cookie ≠ body'];
        const refusedControls = controls.filter(v => by(v) && !ok(v));
        const acceptedControls = controls.filter(ok);
        return { accepted, refusedControls, acceptedControls, usable: accepted.length > 0 && refusedControls.length === controls.length };
    }

    /**
     * The final report as JSON, masked once more as a whole.
     * @param {Object} result - The run's result.
     * @returns {string} The JSON.
     */
    function report(result) {
        return mask(JSON.stringify(result, null, 2));
    }

    const Core = { squeeze, mask, makeToken, pageIdOf, revisionIds, describeAnswer, verdict, report, LIST_MODULE, SOURCE_MODULE };

    /**
     * One anonymous GM_xmlhttpRequest.
     * @param {Object} details - method, url, headers, data, cookie.
     * @returns {Promise<{http: number, ms: number, text: string, error?: string}>} The answer.
     */
    function gm(details) {
        const t0 = performance.now();
        return new Promise((resolve) => {
            const done = (r, error) => resolve({
                http: r ? r.status : 0,
                ms: Math.round(performance.now() - t0),
                text: r ? (r.responseText || '') : '',
                ...(error ? { error } : {}),
            });
            GM_xmlhttpRequest({
                anonymous: true,
                timeout: 30000,
                ...details,
                onload: r => done(r),
                onerror: r => done(r, `error ${r && r.error ? r.error : ''}`),
                ontimeout: () => done(null, 'timeout'),
                onabort: () => done(null, 'abort'),
            });
        });
    }

    /**
     * A module POST in one of the cookie variants.
     * @param {string} moduleName - The module.
     * @param {Object<string, string>} params - Its fields.
     * @param {string} bodyToken - The token in the body.
     * @param {{header?: string, field?: string}} cookie - The cookie to send, as a header or as Tampermonkey's field.
     * @returns {Promise<Object>} The raw answer.
     */
    function post(moduleName, params, bodyToken, cookie) {
        const headers = { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' };
        if (cookie.header) headers.Cookie = `wikidot_token7=${cookie.header}`;
        const details = {
            method: 'POST',
            url: `${BASE}/ajax-module-connector.php`,
            headers,
            data: new URLSearchParams({ ...params, moduleName, wikidot_token7: bodyToken }).toString(),
        };
        if (cookie.field) details.cookie = `wikidot_token7=${cookie.field}`;
        return gm(details);
    }

    /**
     * Shows the result box (fixed, over the page).
     * @param {string} text - Initial text.
     * @param {string} file - Download file name.
     * @returns {HTMLTextAreaElement} The box's text area.
     */
    function showBox(text, file) {
        const box = document.createElement('div');
        box.style.cssText = 'position:fixed;inset:5% 5%;z-index:2147483600;background:#fff;color:#000;border:2px solid #444;display:flex;flex-direction:column;padding:8px;gap:6px';
        const bar = document.createElement('div');
        const ta = document.createElement('textarea');
        ta.style.cssText = 'flex:1;font:11px monospace;white-space:pre';
        ta.value = text;
        const btn = (lbl, fn) => {
            const b = document.createElement('button');
            b.textContent = lbl;
            b.style.marginRight = '6px';
            b.addEventListener('click', fn);
            bar.appendChild(b);
        };
        btn('Download', () => {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([ta.value], { type: 'application/json' }));
            a.download = file;
            document.body.appendChild(a);
            a.click();
            a.remove();
        });
        btn('Copy', () => navigator.clipboard.writeText(ta.value));
        btn('Close', () => box.remove());
        const note = document.createElement('span');
        note.textContent = 'Review before saving: nothing here should name anyone. Put the file into debug/.';
        bar.appendChild(note);
        box.append(bar, ta);
        document.body.appendChild(box);
        return ta;
    }

    /**
     * Runs the requests.
     * @returns {Promise<void>}
     */
    async function run() {
        const path = (window.prompt('Brucebase page to ask about (a path on brucebase.wikidot.com):', DEFAULT_PAGE) || '').trim();
        if (!path) return;
        const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const ta = showBox('probing…', `bb-history-xorigin-probe-${day}.json`);
        const gmInfo = typeof GM_info === 'object' && GM_info ? GM_info : {};
        const result = {
            probe: 'scripts/probe-bb-history-xorigin.user.js 1.0.0',
            at: new Date().toString(),
            from: location.host,
            userAgent: navigator.userAgent,
            scriptHandler: `${gmInfo.scriptHandler || 'unknown'} ${gmInfo.version || ''}`.trim(),
            page: path.startsWith('/') ? path : `/${path}`,
            requests: [],
        };
        const pause = () => new Promise(ok => setTimeout(ok, SPACING_MS));
        const step = async (variant, module, promise) => {
            ta.value = `probing… ${variant}`;
            const res = await promise;
            const out = describeAnswer(module, res);
            result.requests.push({ variant, module: module || 'GET page', ...out });
            await pause();
            return { res, out };
        };
        const page = await step('page', '', gm({ method: 'GET', url: `${BASE}${result.page}` }));
        const pageId = pageIdOf(page.res.text);
        if (!pageId) {
            result.error = 'no WIKIREQUEST.info.pageId in the page (not a wiki page, or the GET failed)';
        } else {
            const listParams = { page_id: pageId, page: '1', perpage: '20', options: JSON.stringify({ all: true }) };
            const variants = [
                { name: 'cookie header', make: t => ({ header: t }) },
                { name: 'cookie field', make: t => ({ field: t }) },
                { name: 'no cookie', make: () => ({}) },
                { name: 'cookie ≠ body', make: () => ({ header: makeToken() }) },
            ];
            let ids = [];
            let winner = null;
            for (const v of variants) {
                const t = makeToken();
                const cookie = v.make(t);
                const { res, out } = await step(v.name, LIST_MODULE, post(LIST_MODULE, listParams, t, cookie));
                if (out.accepted && !winner && (v.name === 'cookie header' || v.name === 'cookie field')) {
                    winner = v;
                    try { ids = revisionIds(JSON.parse(res.text).body); } catch (e) { ids = []; }
                }
            }
            if (winner && ids[0]) {
                const t = makeToken();
                await step(`source, ${winner.name}`, SOURCE_MODULE, post(SOURCE_MODULE, { revision_id: ids[0] }, t, winner.make(t)));
            } else {
                result.requests.push({ variant: 'source', module: SOURCE_MODULE, skipped: winner ? 'the list held no revision ids' : 'no cookie variant was accepted' });
            }
            result.verdict = verdict(result.requests);
        }
        result.finishedAt = new Date().toString();
        ta.value = report(result);
    }

    if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('Probe: Brucebase history from here', run);
    } else {
        globalThis.__saedBbHistoryXoriginProbe = Core;
    }
})();
