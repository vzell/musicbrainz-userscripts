// ==UserScript==
// @name         SAED probe: Brucebase page history (Wikidot history modules)
// @namespace    https://github.com/vzell/mb-userscripts
// @version      1.0.0
// @description  Phase 6 of org/brucebase.org (history diff): POSTs Wikidot's history modules for the page you are on and reports only status, JSON shape, markup skeleton and timing — no user names, no cookies, no page text. Run it from the Tampermonkey menu once signed in and once signed out; nothing happens on page load. Throwaway, never published.
// @match        https://brucebase.wikidot.com/*
// @match        http://brucebase.wikidot.com/*
// @grant        GM_registerMenuCommand
// @noframes
// ==/UserScript==

/*
 * What it asks (org/brucebase.org, "Phase 6 — history diff"): do Wikidot's
 * history modules answer a visitor who is not signed in, what do their
 * answers look like, and how long do they take? The site shows its
 * "history" button only to members, but whether the modules behind it
 * refuse anonymous requests is unknown — that decides whether the window's
 * History section can exist signed out, or shows "Sign in to Brucebase to
 * see the history" (vzell's answer 4).
 *
 * The requests are the site's own: POST /ajax-module-connector.php with
 * `moduleName`, the module's fields and `wikidot_token7` (the cookie's
 * value, which Wikidot checks against the cookie), same-origin, with the
 * browser's cookies — exactly what the history button sends. In order:
 *   1. history/PageHistoryModule      {page_id}                (the pane)
 *   2. history/PageRevisionListModule {page_id, page, perpage, options}
 *   3. history/PageSourceModule       {revision_id}            (newest)
 *   4. history/PageSourceModule       {revision_id}            (one before)
 *   5. history/PageVersionModule      {revision_id}            (one before)
 *   6. history/PageDiffModule         {from_revision_id, to_revision_id, show_type: inline}
 * 1.1 s apart, six requests. Revision ids come from step 2's answer; when it
 * is refused, steps 3–6 are recorded as skipped.
 *
 * What leaves the browser — and what does not:
 *   - per request: HTTP status, the JSON `status` and `message` (Wikidot's
 *     own system text, redacted anyway), the JSON keys, `jsInclude`/
 *     `cssInclude` (the site's public script paths), the time in ms, the
 *     body's length;
 *   - per body: a markup skeleton (tag.class paths with counts, ids with
 *     digits as N), every class name with its count, the form fields'
 *     NAMES and types (never values, except whether a value is digits),
 *     table headers (the module's own labels), and for each revision row the
 *     KIND of each cell (number, flags letters, date, user, comment length,
 *     radio name, the action links' onclick with digits as N);
 *   - for the source and diff answers: the line count and the counts of
 *     added/removed marks — never a line of the page.
 * User names (the members who edited, and yours) are never read as text: a
 * cell holding a `.printuser` reads as "user". As a last pass, the name in
 * #login-status and any terms you type are replaced in the whole report.
 * Review the JSON in the box, then Download it and put it into debug/.
 *
 * The pure functions are exported for scripts/check-probe-bb-history.js,
 * which runs them in Playwright's Chromium on planted answers.
 */
/* global GM_registerMenuCommand */
(function () {
    'use strict';

    const SPACING_MS = 1100;
    const SKELETON_DEPTH = 6;
    const SKELETON_MAX = 120;
    const MESSAGE_LEN = 160;

    /**
     * Collapses runs of white space and trims.
     * @param {string} s - Text.
     * @returns {string} The squeezed text.
     */
    function squeeze(s) {
        return String(s || '').replace(/\s+/g, ' ').trim();
    }

    /**
     * Escapes a string for use inside a RegExp.
     * @param {string} s - Literal text.
     * @returns {string} The escaped text.
     */
    function reEscape(s) {
        return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Replaces every term (case-insensitive) and every e-mail address.
     * @param {string} s - Text.
     * @param {string[]} terms - Names to hide.
     * @returns {string} The redacted text.
     */
    function redact(s, terms) {
        let out = String(s);
        for (const t of terms || []) {
            if (t && t.length >= 2) out = out.replace(new RegExp(reEscape(t), 'gi'), '‹user›');
        }
        return out.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '‹email›');
    }

    /**
     * The page id Wikidot's own script carries (`WIKIREQUEST.info.pageId = N;`).
     * @param {string} html - The page's HTML (or its scripts' text).
     * @returns {(string|null)} The id.
     */
    function pageIdOf(html) {
        const m = /WIKIREQUEST\.info\.pageId\s*=\s*(\d+)/.exec(html || '');
        return m ? m[1] : null;
    }

    /**
     * Whether the page shows a signed-in member, and the name it shows (kept
     * in the browser, only to redact it).
     * @param {Document} doc - The page.
     * @returns {{state: string, user: (string|null)}} 'in', 'out' or 'unknown'.
     */
    function loginState(doc) {
        const box = doc.querySelector('#login-status');
        if (!box) return { state: 'unknown', user: null };
        if (box.querySelector('.login-status-sign-in') || /\bsign in\b/i.test(box.textContent)) return { state: 'out', user: null };
        const pu = box.querySelector('.printuser');
        return { state: 'in', user: pu ? squeeze(pu.textContent) || null : null };
    }

    /**
     * An element's skeleton label: tag, classes, and an id with its digits as N.
     * @param {Element} el - Element.
     * @returns {string} e.g. "tr#revision-row-N.odd".
     */
    function label(el) {
        const id = el.id ? `#${el.id.replace(/\d+/g, 'N')}` : '';
        const cls = Array.from(el.classList).map(c => `.${c.replace(/\d+/g, 'N')}`).join('');
        return el.tagName.toLowerCase() + id + cls;
    }

    /**
     * The markup skeleton: every path of labels to SKELETON_DEPTH with its count.
     * @param {Element} root - The body's root.
     * @returns {Object<string, number>} Path → count (at most SKELETON_MAX paths, the most frequent).
     */
    function skeleton(root) {
        const counts = new Map();
        const walk = (el, path, depth) => {
            for (const c of el.children) {
                const p = path ? `${path} > ${label(c)}` : label(c);
                counts.set(p, (counts.get(p) || 0) + 1);
                if (depth < SKELETON_DEPTH) walk(c, p, depth + 1);
            }
        };
        walk(root, '', 1);
        return Object.fromEntries(Array.from(counts).sort((a, b) => b[1] - a[1]).slice(0, SKELETON_MAX));
    }

    /**
     * Every class name in the body with its count.
     * @param {Element} root - The body's root.
     * @returns {Object<string, number>} Class → count.
     */
    function classCounts(root) {
        const out = {};
        root.querySelectorAll('[class]').forEach(el => el.classList.forEach(c => {
            const k = c.replace(/\d+/g, 'N');
            out[k] = (out[k] || 0) + 1;
        }));
        return out;
    }

    /**
     * The form fields: tag, type, NAME or id, and whether the value is digits
     * (a revision id) — never the value itself.
     * @param {Element} root - The body's root.
     * @returns {Object<string, number>} "input radio from value=digits" → count.
     */
    function fields(root) {
        const out = {};
        root.querySelectorAll('input, select, textarea, button').forEach(el => {
            const tag = el.tagName.toLowerCase();
            const type = el.getAttribute('type') || '';
            const name = (el.getAttribute('name') || el.id || '').replace(/\d+/g, 'N');
            const v = el.getAttribute('value');
            const val = v == null ? '' : /^\d+$/.test(v) ? ' value=digits' : v === '' ? ' value=empty' : ' value=other';
            const k = `${tag} ${type} ${name}${val}`.replace(/\s+/g, ' ').trim();
            out[k] = (out[k] || 0) + 1;
        });
        return out;
    }

    /**
     * An onclick handler with every number as N — the module's own function
     * names, e.g. "WIKIDOT.modules.PageHistoryModule.listeners.showVersion(event,N)".
     * @param {Element} el - Element.
     * @returns {string} The handler, or ''.
     */
    function onclickOf(el) {
        return squeeze(el.getAttribute('onclick') || '').replace(/\d+/g, 'N').slice(0, 160);
    }

    /**
     * Every distinct onclick handler in the body (digits as N).
     * @param {Element} root - The body's root.
     * @returns {Object<string, number>} Handler → count.
     */
    function handlers(root) {
        const out = {};
        root.querySelectorAll('[onclick]').forEach(el => {
            const k = `${el.tagName.toLowerCase()} ${onclickOf(el)}`;
            out[k] = (out[k] || 0) + 1;
        });
        return out;
    }

    /**
     * What a cell holds, never who: "user" for a member, the flag letters,
     * "number", "date", "text(len)" for a comment, the radio's name, the
     * action links' handlers.
     * @param {Element} td - A table cell.
     * @returns {string} The kind.
     */
    function cellKind(td) {
        const parts = [];
        if (td.querySelector('.printuser')) parts.push('user');
        if (td.querySelector('.odate')) parts.push('odate' + (Array.from(td.querySelector('.odate').classList).some(c => /^time_\d+$/.test(c)) ? '(time_N)' : ''));
        td.querySelectorAll('input').forEach(i => parts.push(`${i.getAttribute('type') || 'input'}:${i.getAttribute('name') || ''}${/^\d+$/.test(i.getAttribute('value') || '') ? '=digits' : ''}`));
        td.querySelectorAll('a').forEach(a => {
            const t = squeeze(a.textContent);
            const h = onclickOf(a);
            if (a.closest('.printuser')) return;
            parts.push(`a[${/^[A-Za-z ]{1,12}$/.test(t) ? t : `len ${t.length}`}]${h ? ` ${h}` : ''}`);
        });
        if (!parts.length || parts.every(p => p.startsWith('a['))) {
            const copy = td.cloneNode(true);
            copy.querySelectorAll('a, input').forEach(n => n.remove());
            const t = squeeze(copy.textContent);
            if (!t) parts.push(parts.length ? '' : 'empty');
            else if (/^\d+\.?$/.test(t)) parts.push('number');
            else if (/^[NSTRAMF]{1,8}$/.test(t)) parts.push(`flags:${t}`);
            else if (/\d{1,2} \w{3} \d{4}/.test(t)) parts.push('date');
            else parts.push(`text(${t.length})`);
        }
        return parts.filter(Boolean).join(' + ');
    }

    /**
     * The tables in a body: headers (the module's labels), rows, and the
     * kinds of the first rows' cells.
     * @param {Element} root - The body's root.
     * @returns {Object[]} One description per table.
     */
    function tables(root) {
        return Array.from(root.querySelectorAll('table')).map(t => {
            const rows = Array.from(t.querySelectorAll(':scope > tbody > tr, :scope > tr'));
            // A header of th cells, or a first row of plain labels (no id, no
            // field, no link), as Wikidot's own lists sometimes use.
            const head = rows.find(r => r.querySelector('th')) ||
                (rows[0] && !rows[0].id && !rows[0].querySelector('input, a, .printuser') ? rows[0] : null);
            const body = rows.filter(r => r !== head);
            return {
                label: label(t),
                headers: head ? Array.from(head.children).map(c => squeeze(c.textContent).slice(0, 30)) : [],
                rows: body.length,
                rowLabels: Array.from(new Set(body.map(label))).slice(0, 6),
                cellsPerRow: Array.from(new Set(body.map(r => r.children.length))),
                firstRows: body.slice(0, 3).map(r => Array.from(r.children).map(cellKind)),
            };
        });
    }

    /**
     * The revision ids of a revision list, newest first: the `from`/`to`
     * radios' values, else the rows' `revision-row-N` ids.
     * @param {Element} root - The list's body.
     * @returns {string[]} The ids.
     */
    function revisionIds(root) {
        const ids = [];
        const push = v => { if (v && /^\d+$/.test(v) && !ids.includes(v)) ids.push(v); };
        root.querySelectorAll('input[type="radio"]').forEach(i => push(i.getAttribute('value')));
        if (!ids.length) root.querySelectorAll('tr[id^="revision-row-"]').forEach(r => push(r.id.replace(/\D+/g, '')));
        return ids;
    }

    /**
     * How a source or diff answer holds the page text, by counts only: the
     * lines of the source, and the marks a diff uses.
     * @param {Element} root - The body's root.
     * @returns {Object} Counts.
     */
    function textShape(root) {
        const src = root.querySelector('.page-source, pre, textarea');
        const text = src ? (src.tagName === 'TEXTAREA' ? src.value || src.textContent : src.textContent) : '';
        const marks = {};
        root.querySelectorAll('ins, del, .diff-add, .diff-delete, .diff-change, [class*="diff"], [class*="add"], [class*="del"], [class*="change"]').forEach(el => {
            const k = label(el);
            marks[k] = (marks[k] || 0) + 1;
        });
        return {
            sourceHolder: src ? label(src) : null,
            sourceLines: text ? text.split('\n').length : 0,
            sourceChars: text.length,
            brCount: src ? src.querySelectorAll('br').length : 0,
            marks,
        };
    }

    /**
     * Describes one module answer.
     * @param {{http: number, ms: number, text: string}} res - The raw answer.
     * @returns {Object} Its shape; `root` (not reported) for the caller.
     */
    function describeAnswer(res) {
        const out = { http: res.http, ms: res.ms, bytes: (res.text || '').length };
        let data;
        try { data = JSON.parse(res.text); } catch (e) {
            out.json = false;
            out.startsWith = squeeze((res.text || '').slice(0, 40)).replace(/[^<>!/A-Za-z ]/g, '');
            return { out, root: null };
        }
        out.json = true;
        out.keys = Object.keys(data || {}).sort();
        out.status = data?.status ?? null;
        if (data?.message) out.message = squeeze(String(data.message)).slice(0, MESSAGE_LEN);
        if (Array.isArray(data?.jsInclude)) out.jsInclude = data.jsInclude.map(String);
        if (Array.isArray(data?.cssInclude)) out.cssInclude = data.cssInclude.map(String);
        if (typeof data?.body !== 'string') return { out, root: null };
        out.bodyBytes = data.body.length;
        const doc = new DOMParser().parseFromString(`<div id="probe-root">${data.body}</div>`, 'text/html');
        const root = doc.getElementById('probe-root');
        out.skeleton = skeleton(root);
        out.classes = classCounts(root);
        out.fields = fields(root);
        out.handlers = handlers(root);
        out.tables = tables(root);
        out.text = textShape(root);
        out.inlineScripts = root.querySelectorAll('script').length;
        return { out, root };
    }

    /**
     * The final report: JSON with every term redacted.
     * @param {Object} result - The run's result.
     * @param {string[]} terms - Names to hide.
     * @returns {string} The JSON.
     */
    function report(result, terms) {
        return redact(JSON.stringify(result, null, 2), terms);
    }

    const Core = { squeeze, redact, pageIdOf, loginState, label, skeleton, classCounts, fields, handlers, cellKind, tables, revisionIds, textShape, describeAnswer, report };

    /**
     * The Wikidot AJAX token (the `wikidot_token7` cookie's value).
     * @returns {string} The token; one is set when the cookie is missing, as
     *     Wikidot's own scripts do.
     */
    function token() {
        const m = document.cookie.match(/(?:^|;\s*)wikidot_token7=([^;]*)/);
        if (m && m[1]) return decodeURIComponent(m[1]);
        const t = Math.random().toString(16).slice(2, 10);
        document.cookie = `wikidot_token7=${t}; path=/`;
        return t;
    }

    /**
     * POSTs one module.
     * @param {string} moduleName - e.g. "history/PageRevisionListModule".
     * @param {Object<string, string>} params - The module's fields.
     * @returns {Promise<{http: number, ms: number, text: string}>} The answer.
     */
    async function post(moduleName, params) {
        const body = new URLSearchParams({ ...params, moduleName, wikidot_token7: token() });
        const t0 = performance.now();
        try {
            const r = await fetch('/ajax-module-connector.php', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
                body: body.toString(),
            });
            const text = await r.text();
            return { http: r.status, ms: Math.round(performance.now() - t0), text };
        } catch (e) {
            return { http: 0, ms: Math.round(performance.now() - t0), text: `network error: ${e && e.name}` };
        }
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
        note.textContent = 'Review before saving: nothing here should name you or anyone. Put the file into debug/.';
        bar.appendChild(note);
        box.append(bar, ta);
        document.body.appendChild(box);
        return ta;
    }

    /**
     * Runs the six requests for the page you are on.
     * @returns {Promise<void>}
     */
    async function run() {
        const typed = window.prompt('Terms to redact besides the name the page shows (comma-separated, e.g. your user name). They stay in this browser.', '') || '';
        const terms = typed.split(',').map(s => s.trim()).filter(Boolean);
        const login = loginState(document);
        if (login.user) terms.push(login.user);
        const scripts = Array.from(document.scripts).map(s => s.textContent).join('\n');
        const pageId = pageIdOf(scripts);
        const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const file = `bb-history-probe-${day}-${login.state}.json`;
        const ta = showBox('probing…', file);
        const result = {
            probe: 'scripts/probe-bb-history.user.js 1.0.0',
            at: new Date().toString(),
            userAgent: navigator.userAgent,
            page: location.pathname,
            login: login.state,
            pageInfoShown: !!document.querySelector('#page-info'),
            historyButtonShown: !!document.querySelector('#history-button'),
            tokenCookie: /(?:^|;\s*)wikidot_token7=/.test(document.cookie),
            pageId: pageId ? 'digits' : null,
            requests: [],
        };
        const step = async (name, moduleName, params, paramKinds) => {
            ta.value = `probing… ${name}`;
            const res = await post(moduleName, params);
            const { out, root } = describeAnswer(res);
            result.requests.push({ step: name, moduleName, params: paramKinds, ...out });
            await new Promise(ok => setTimeout(ok, SPACING_MS));
            return { out, root };
        };
        const skip = (name, moduleName, why) => result.requests.push({ step: name, moduleName, skipped: why });
        if (!pageId) {
            result.error = 'no WIKIREQUEST.info.pageId in the page scripts';
        } else {
            await step('1 history pane', 'history/PageHistoryModule', { page_id: pageId }, { page_id: 'digits' });
            const opts = JSON.stringify({ all: true });
            const list = await step('2 revision list', 'history/PageRevisionListModule',
                { page_id: pageId, page: '1', perpage: '20', options: opts },
                { page_id: 'digits', page: '1', perpage: '20', options: opts });
            const ids = list.root ? revisionIds(list.root) : [];
            result.revisionIdsFound = ids.length;
            const [newest, before] = ids;
            const S = 'no revision ids (the list was refused or held none)';
            if (newest) await step('3 source, newest', 'history/PageSourceModule', { revision_id: newest }, { revision_id: 'digits' });
            else skip('3 source, newest', 'history/PageSourceModule', S);
            if (before) {
                await step('4 source, one before', 'history/PageSourceModule', { revision_id: before }, { revision_id: 'digits' });
                await step('5 version, one before', 'history/PageVersionModule', { revision_id: before }, { revision_id: 'digits' });
                await step('6 diff inline', 'history/PageDiffModule',
                    { from_revision_id: before, to_revision_id: newest, show_type: 'inline' },
                    { from_revision_id: 'digits', to_revision_id: 'digits', show_type: 'inline' });
            } else {
                ['4 source, one before', '5 version, one before', '6 diff inline'].forEach(n => skip(n, '', S));
            }
        }
        result.finishedAt = new Date().toString();
        ta.value = report(result, terms);
        if (login.state === 'in' && !login.user && !terms.length) {
            window.alert('The probe could not read your name from #login-status, and you typed no terms. Search the report for your name before saving it.');
        }
    }

    if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('Probe: page history (this page)', run);
    } else {
        globalThis.__saedBbHistoryProbe = Core;
    }
})();
