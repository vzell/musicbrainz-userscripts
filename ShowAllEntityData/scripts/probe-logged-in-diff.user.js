// ==UserScript==
// @name         SAED probe: what logging in adds (springsteenlyrics.com, brucebase)
// @namespace    https://github.com/vzell/mb-userscripts
// @version      1.0.0
// @description  Item 2 of org/springsteenlyrics.org "add support for logged in case": fetches each probed page twice, without and with your cookies, and reports only the STRUCTURAL difference, redacted in the browser. Run it from the Tampermonkey menu while logged in; nothing happens on page load. Throwaway, never published.
// @match        https://www.springsteenlyrics.com/*
// @match        https://springsteenlyrics.com/*
// @match        https://brucebase.wikidot.com/*
// @match        http://brucebase.wikidot.com/*
// @grant        GM_registerMenuCommand
// @noframes
// ==/UserScript==

/*
 * Why a userscript and not a Python or Playwright probe: the session cookie
 * never leaves the browser. Each page is fetched same-origin twice, with
 * `credentials: 'omit'` (the public page) and `credentials: 'include'` (your
 * page); both answers are parsed with DOMParser right here, and what leaves
 * the browser is a JSON description of what the second one has and the first
 * lacks: headings, tab labels, table headers, link KINDS, image counts, form
 * field NAMES, plus a short text excerpt of each new block. Before it is
 * shown, every string goes through redact(): the user name the page shows,
 * any extra terms you type in, e-mail addresses, long token-like strings and
 * the values of session/token-like URL parameters become placeholders. Input
 * values and cookies are never read. Review the JSON in the box, then
 * Download it and put it into debug/.
 *
 * Cloudflare (springsteenlyrics.com): the 'omit' request carries no clearance
 * cookie, so it may be challenged; the result records that ("challenge")
 * instead of a diff, and that is itself one of the facts item 1b asks for.
 *
 * Requests: two per probed page, 1.1 s apart, about 20 on each site.
 *
 * The pure functions are exported for scripts/check-probe-logged-in-diff.js,
 * which runs them in Playwright's Chromium against a saved page with a
 * planted logged-in block and checks the redaction.
 */
/* global GM_registerMenuCommand */
(function () {
    'use strict';

    const SPACING_MS = 1100;
    const EXCERPT_LEN = 120;
    const CONTEXT_LEN = 60;

    /** Pages probed per site: every supported list kind plus one detail page of each kind. */
    const TARGETS = {
        sl: [
            '/collection.php',
            '/collection.php?cmd=list&category=album',
            '/collection.php?cmd=list&category=audioboot',
            '/collection.php?item=7431&category=audioboot',
            '/bootlegs.php',
            '/bootlegs.php?cmd=list&category=aud_live2014',
            '/bootlegs.php?item=6739&category=aud_live2014',
            '/brucelegs.php?cmd=list',
            '/lyrics.php',
            '/lyrics.php?cmd=list&letter=b',
            '/lyrics.php?song=badlands',
        ],
        bb: [
            '/2025',
            '/stats:songs',
            '/stats:relations',
            '/stats:discography',
            '/song:4th-of-july-asbury-park-sandy',
            '/gig:2025-03-26-carnegie-hall-new-york-city-ny',
            '/venue:carnegie-hall-new-york-city-ny',
            '/relation:patti-smith',
            '/retail:tracks-ii',
            '/interview:2025-10-20-stone-pony-asbury-park-nj',
        ],
    };

    /**
     * Which probed site a host name belongs to.
     * @param {string} host - location.hostname.
     * @returns {('sl'|'bb'|null)} The site key.
     */
    function siteOf(host) {
        if (/(^|\.)springsteenlyrics\.com$/i.test(host)) return 'sl';
        if (/^brucebase\.wikidot\.com$/i.test(host)) return 'bb';
        return null;
    }

    /**
     * Collapses whitespace and trims.
     * @param {string} s - Any text.
     * @returns {string} The squeezed text.
     */
    function squeeze(s) {
        return String(s || '').replace(/\s+/g, ' ').trim();
    }

    /**
     * Escapes a string for use inside a RegExp.
     * @param {string} s - Literal text.
     * @returns {string} The escaped pattern.
     */
    function reEscape(s) {
        return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Replaces everything personal in a string with a placeholder. Applied to
     * every string the report holds, and once more to the whole JSON.
     * @param {string} s - Text from a fetched page.
     * @param {string[]} terms - User name and extra terms, matched case-insensitively.
     * @returns {string} The redacted text.
     */
    function redact(s, terms) {
        let out = String(s == null ? '' : s);
        for (const t of terms || []) {
            if (t && t.length >= 2) out = out.replace(new RegExp(reEscape(t), 'gi'), '«USER»');
        }
        out = out.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '«EMAIL»');
        out = out.replace(/\b(sid|session\w*|token\w*|auth\w*|key|hash|pass\w*|user\w*)=([^&\s"'#]+)/gi, '$1=«REDACTED»');
        out = out.replace(/\b[0-9a-f]{16,}\b/gi, '«TOKEN»');
        // Letters and digits mixed, 20+ long, no hyphen: a session id or a
        // nonce. Hyphenated page names (gig:2025-03-26-carnegie-…) stay.
        out = out.replace(/\b(?=\w*\d)(?=\w*[A-Za-z])\w{20,}\b/g, '«TOKEN»');
        return out;
    }

    /**
     * Whether a parsed answer is a bot check rather than the page.
     * @param {Document} doc - Parsed answer.
     * @param {number} status - HTTP status.
     * @returns {boolean} True for a Cloudflare (or similar) challenge.
     */
    function isChallenge(doc, status) {
        const title = squeeze(doc.title);
        return /just a moment|attention required|cloudflare/i.test(title) ||
            !!doc.querySelector('#challenge-form, #cf-challenge-running, [id^="cf-chl"]') ||
            ((status === 403 || status === 503) && /cloudflare/i.test(doc.documentElement.outerHTML.slice(0, 20000)));
    }

    /**
     * Reads the login state the page itself shows, and the user name if it
     * shows one. springsteenlyrics.com renders a log-in form (hTxtPassword) to
     * visitors; Wikidot renders "Sign in" in #login-status to visitors and the
     * user's printuser link to members.
     * @param {Document} doc - Parsed page.
     * @param {('sl'|'bb')} site - Site key.
     * @returns {{state: string, marker: string, user: (string|null)}} The state ('in', 'out' or 'unknown').
     */
    function loginState(doc, site) {
        if (site === 'bb') {
            const box = doc.querySelector('#login-status');
            if (!box) return { state: 'unknown', marker: 'no #login-status', user: null };
            if (box.querySelector('.login-status-sign-in')) return { state: 'out', marker: '#login-status .login-status-sign-in', user: null };
            const pu = box.querySelector('.printuser');
            return { state: 'in', marker: '#login-status without sign-in', user: pu ? squeeze(pu.textContent) || null : null };
        }
        if (doc.querySelector('input[name="hTxtPassword"]')) return { state: 'out', marker: 'input[name=hTxtPassword]', user: null };
        const logout = Array.from(doc.querySelectorAll('a')).find(a =>
            /log-?out|sign-?out/i.test(a.getAttribute('href') || '') || /^\s*(log|sign)\s*out\s*$/i.test(a.textContent));
        if (!logout) return { state: 'unknown', marker: 'no password field, no logout link', user: null };
        // The menu's first toggle may be a bare icon; take the first one that
        // has text. If none does, the user's own terms are the only defence,
        // and report() says so (userNameDetected: false).
        const li = logout.closest('li.dropdown');
        const name = li ? Array.from(li.querySelectorAll('.dropdown-toggle'))
            .map(t => squeeze(t.textContent)).find(t => t && t.length <= 40 && !/log|sign/i.test(t)) : null;
        return { state: 'in', marker: 'logout link', user: name || null };
    }

    /**
     * The kind of a link, never its personal part: another host by name; on
     * springsteenlyrics.com the script name, its `cmd` value and the sorted
     * parameter NAMES; on Brucebase the `prefix:` of the page name, "year" or
     * the first path segment.
     * @param {string} href - The link's href attribute.
     * @param {string} base - URL of the page holding it.
     * @param {('sl'|'bb')} site - Site key.
     * @returns {string} The link kind.
     */
    function linkKind(href, base, site) {
        let u;
        try { u = new URL(href, base); } catch (e) { return 'invalid'; }
        if (!/^https?:$/.test(u.protocol)) return u.protocol.replace(':', '');
        const host = u.hostname.replace(/^www\./, '');
        const baseHost = new URL(base).hostname.replace(/^www\./, '');
        if (host !== baseHost) return host;
        if (site === 'sl') {
            const file = u.pathname.replace(/^\//, '') || '/';
            const names = Array.from(new Set(Array.from(u.searchParams.keys()))).sort();
            const cmd = u.searchParams.get('cmd');
            return file + (cmd ? ` cmd=${cmd}` : '') + (names.length ? ` ?${names.join(',')}` : '');
        }
        const p = decodeURIComponent(u.pathname.replace(/^\//, ''));
        if (/^\d{4}$|^1949-64$/.test(p)) return 'year';
        const m = /^([a-z-]+):/i.exec(p);
        return m ? `${m[1].toLowerCase()}:` : (p.split('/')[0] || '/');
    }

    /**
     * The directory pattern of an image URL, with file names dropped.
     * @param {string} src - The img src.
     * @param {string} base - URL of the page.
     * @returns {string} Host plus the first two path segments.
     */
    function imageDir(src, base) {
        try {
            const u = new URL(src, base);
            return u.hostname + '/' + u.pathname.split('/').filter(Boolean).slice(0, 2).join('/');
        } catch (e) {
            return 'invalid';
        }
    }

    /**
     * The last heading inside (or being) one element.
     * @param {Element} s - Any element.
     * @returns {string} Its text, or '' when it holds none.
     */
    function headingIn(s) {
        if (/^H[1-4]$/.test(s.tagName)) return squeeze(s.textContent).slice(0, CONTEXT_LEN);
        const hs = s.querySelectorAll('h1, h2, h3, h4');
        return hs.length ? squeeze(hs[hs.length - 1].textContent).slice(0, CONTEXT_LEN) : '';
    }

    /**
     * The nearest heading among an element's earlier siblings. Memoised per
     * sibling run, so a 3,000-row tbody costs 3,000 steps, not 4.5 million.
     * @param {Element} el - Any element.
     * @param {Map<Element, string>} memo - Cache for this document.
     * @returns {string} Heading text or ''.
     */
    function prevHeading(el, memo) {
        const visited = [];
        let found = '';
        for (let s = el.previousElementSibling; s; s = s.previousElementSibling) {
            if (memo.has(s)) { found = memo.get(s); break; }
            visited.push(s);
            const h = headingIn(s);
            if (h) { found = h; break; }
        }
        // Every visited sibling before the hit sees the same heading; the hit
        // itself is cached as "the heading at or before me".
        for (const s of visited) memo.set(s, found);
        return found;
    }

    /**
     * The nearest heading before an element, as context; else the id of the
     * nearest ancestor that has one.
     * @param {Element} el - Any element.
     * @param {Map<Element, string>} [memo] - Cache for this document.
     * @returns {string} The context.
     */
    function contextOf(el, memo) {
        const m = memo || new Map();
        for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
            const h = prevHeading(n, m);
            if (h) return h;
            if (n.id && n.parentElement) return '#' + n.id;
        }
        return '';
    }

    /**
     * A stable signature for an element: tag, id unless it looks generated,
     * and the sorted class list.
     * @param {Element} el - Any element.
     * @returns {string} e.g. "div#login-status.btn.x".
     */
    function signature(el) {
        const id = el.id && !/\d{3,}|[0-9a-f]{8,}/i.test(el.id) ? '#' + el.id : '';
        const cls = Array.from(el.classList).filter(c => !/\d{3,}|[0-9a-f]{8,}/i.test(c)).sort();
        return el.tagName.toLowerCase() + id + (cls.length ? '.' + cls.join('.') : '');
    }

    /**
     * A short CSS-like path of an element, up to five levels.
     * @param {Element} el - Any element.
     * @returns {string} The path.
     */
    function cssPath(el) {
        const parts = [];
        for (let n = el; n && n.nodeType === 1 && n.tagName !== 'BODY' && parts.length < 5; n = n.parentElement) {
            parts.unshift(signature(n));
        }
        return parts.join(' > ');
    }

    /**
     * Walks the body and groups its elements by signature plus context.
     * @param {Document} doc - Parsed page.
     * @returns {Map<string, Element[]>} Key → elements, in document order.
     */
    function collect(doc) {
        const map = new Map();
        const memo = new Map();
        const skip = 'script, style, noscript, svg *, iframe *';
        for (const el of doc.body ? doc.body.querySelectorAll('*') : []) {
            if (el.matches(skip)) continue;
            const key = signature(el) + ' @ ' + contextOf(el, memo);
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(el);
        }
        return map;
    }

    /**
     * Counts link kinds below a node.
     * @param {ParentNode} root - Where to look.
     * @param {string} base - URL of the page.
     * @param {('sl'|'bb')} site - Site key.
     * @returns {Object<string, number>} Kind → count.
     */
    function linkKinds(root, base, site) {
        const out = {};
        for (const a of root.querySelectorAll('a[href]')) {
            const k = linkKind(a.getAttribute('href'), base, site);
            out[k] = (out[k] || 0) + 1;
        }
        return out;
    }

    /**
     * The visible text of a block without any form value: a textarea's
     * content IS its value, so it is emptied on a copy first (input values
     * are attributes and never part of textContent).
     * @param {Element} el - The block.
     * @returns {string} The squeezed text.
     */
    function safeText(el) {
        if (el.matches('textarea')) return '';
        const copy = el.cloneNode(true);
        copy.querySelectorAll('textarea').forEach(t => { t.textContent = ''; });
        return squeeze(copy.textContent);
    }

    /**
     * Describes one block the logged-in page has and the public one lacks.
     * Reads names, labels and text, never input values.
     * @param {Element} el - The block.
     * @param {string} base - URL of the page.
     * @param {('sl'|'bb')} site - Site key.
     * @param {string[]} terms - Redaction terms.
     * @returns {Object} The description.
     */
    function describe(el, base, site, terms) {
        const text = safeText(el);
        const r = s => redact(s, terms);
        const fields = Array.from(el.querySelectorAll('input, select, textarea, button'))
            .map(f => `${f.tagName.toLowerCase()}${f.type ? ':' + f.type : ''} ${f.getAttribute('name') || f.id || ''}`.trim());
        if (el.matches('input, select, textarea, button')) fields.unshift(`${el.tagName.toLowerCase()} ${el.getAttribute('name') || el.id || ''}`.trim());
        const imgs = Array.from(el.querySelectorAll('img[src]'));
        if (el.matches('img[src]')) imgs.push(el);
        return {
            path: r(cssPath(el)),
            context: r(contextOf(el)),
            text: r(text.slice(0, EXCERPT_LEN)) + (text.length > EXCERPT_LEN ? '…' : ''),
            textLength: text.length,
            links: linkKinds(el, base, site),
            images: imgs.length,
            imageDirs: Array.from(new Set(imgs.map(i => r(imageDir(i.getAttribute('src'), base))))),
            fields: fields.map(r),
            tableHeaders: Array.from(el.querySelectorAll('th')).map(th => r(squeeze(th.textContent).slice(0, 40))),
            tabs: Array.from(el.querySelectorAll('.yui-nav em, .nav-tabs a')).map(t => r(squeeze(t.textContent).slice(0, 40))),
        };
    }

    /**
     * The page-level outline both answers are compared on.
     * @param {Document} doc - Parsed page.
     * @param {string} base - URL of the page.
     * @param {('sl'|'bb')} site - Site key.
     * @param {string[]} terms - Redaction terms.
     * @returns {Object} Headings, tabs, table headers, link kinds, image count.
     */
    function outline(doc, base, site, terms) {
        const texts = sel => Array.from(doc.querySelectorAll(sel)).map(e => redact(safeText(e).slice(0, CONTEXT_LEN), terms)).filter(Boolean);
        return {
            title: redact(squeeze(doc.title).slice(0, 80), terms),
            headings: texts('h1, h2, h3, h4'),
            tabs: texts('.yui-nav em, .nav-tabs a'),
            tableHeaders: texts('th'),
            links: doc.body ? linkKinds(doc.body, base, site) : {},
            images: doc.querySelectorAll('img[src]').length,
            forms: Array.from(doc.querySelectorAll('form')).map(f => redact(f.getAttribute('name') || f.id || linkKind(f.getAttribute('action') || '', base, site), terms)),
        };
    }

    /**
     * Items of b that a lacks (multiset difference).
     * @param {string[]} a - Public list.
     * @param {string[]} b - Logged-in list.
     * @returns {string[]} The extra items of b.
     */
    function extra(a, b) {
        const left = new Map();
        for (const x of a) left.set(x, (left.get(x) || 0) + 1);
        const out = [];
        for (const x of b) {
            if (left.get(x) > 0) left.set(x, left.get(x) - 1);
            else out.push(x);
        }
        return out;
    }

    /**
     * Key-wise count difference of two count maps.
     * @param {Object<string, number>} a - Public counts.
     * @param {Object<string, number>} b - Logged-in counts.
     * @returns {Object<string, string>} Key → "public → logged-in", for keys that differ.
     */
    function countDiff(a, b) {
        const out = {};
        for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
            if ((a[k] || 0) !== (b[k] || 0)) out[k] = `${a[k] || 0} → ${b[k] || 0}`;
        }
        return out;
    }

    /**
     * Compares the public and the logged-in answer for one URL.
     * @param {{status: number, html: string}} pub - The answer without cookies.
     * @param {{status: number, html: string}} mine - The answer with cookies.
     * @param {{url: string, site: ('sl'|'bb'), terms: string[], seen: (Set<string>|undefined)}} opts - Page URL,
     *     site key, redaction terms; `seen` collects the user names found, for report()'s final pass.
     * @returns {Object} The per-URL result, already redacted.
     */
    function compare(pub, mine, opts) {
        const { url, site } = opts;
        const parse = h => new DOMParser().parseFromString(h, 'text/html');
        const dPub = parse(pub.html);
        const dMine = parse(mine.html);
        const lPub = loginState(dPub, site);
        const lMine = loginState(dMine, site);
        const found = [lPub.user, lMine.user].filter(Boolean);
        if (opts.seen) found.forEach(u => opts.seen.add(u));
        const terms = Array.from(new Set([...(opts.terms || []), ...found]));
        const res = {
            url: redact(url, terms),
            public: { status: pub.status, bytes: pub.html.length, challenge: isChallenge(dPub, pub.status), login: { state: lPub.state, marker: lPub.marker } },
            loggedIn: { status: mine.status, bytes: mine.html.length, challenge: isChallenge(dMine, mine.status), login: { state: lMine.state, marker: lMine.marker } },
            // false while logged in means only the typed terms protect the name.
            userNameDetected: lMine.state === 'in' ? !!lMine.user : null,
        };
        if (res.public.challenge || res.loggedIn.challenge) return res;
        const oPub = outline(dPub, url, site, terms);
        const oMine = outline(dMine, url, site, terms);
        res.outline = {
            titleChanged: oPub.title !== oMine.title ? `${oPub.title} → ${oMine.title}` : null,
            headingsOnlyLoggedIn: extra(oPub.headings, oMine.headings),
            headingsOnlyPublic: extra(oMine.headings, oPub.headings),
            tabsOnlyLoggedIn: extra(oPub.tabs, oMine.tabs),
            tableHeadersOnlyLoggedIn: extra(oPub.tableHeaders, oMine.tableHeaders),
            formsOnlyLoggedIn: extra(oPub.forms, oMine.forms),
            linkKinds: countDiff(oPub.links, oMine.links),
            images: oPub.images !== oMine.images ? `${oPub.images} → ${oMine.images}` : null,
        };
        const mPub = collect(dPub);
        const mMine = collect(dMine);
        const added = new Set();
        const grown = {};
        for (const [key, els] of mMine) {
            const n = (mPub.get(key) || []).length;
            if (n === 0) els.forEach(e => added.add(e));
            else if (els.length > n) grown[redact(key, terms)] = `${n} → ${els.length}`;
        }
        const removed = [];
        for (const [key, els] of mPub) {
            if (!mMine.has(key)) removed.push(redact(key, terms) + (els.length > 1 ? ` ×${els.length}` : ''));
        }
        const top = Array.from(added).filter(e => {
            for (let p = e.parentElement; p; p = p.parentElement) if (added.has(p)) return false;
            return true;
        });
        res.onlyLoggedIn = top.map(e => describe(e, url, site, terms));
        res.moreWhenLoggedIn = grown;
        res.onlyPublic = removed.slice(0, 100);
        return res;
    }

    /**
     * Turns the results into the report JSON and redacts the whole text once more.
     * @param {Object[]} results - compare() results.
     * @param {Object} meta - Run metadata (host, time, user agent).
     * @param {string[]} terms - Redaction terms.
     * @returns {string} The JSON to review and download.
     */
    function report(results, meta, terms) {
        return redact(JSON.stringify({ probe: 'probe-logged-in-diff 1.0.0', ...meta, results }, null, 2), terms);
    }

    const Core = { siteOf, redact, isChallenge, loginState, linkKind, compare, report };

    /**
     * One same-origin fetch.
     * @param {string} url - Absolute URL.
     * @param {('omit'|'include')} credentials - Whether cookies go along.
     * @returns {Promise<{status: number, html: string}>} Status and body.
     */
    async function get(url, credentials) {
        try {
            const r = await fetch(url, { credentials, cache: 'no-store' });
            return { status: r.status, html: await r.text() };
        } catch (e) {
            return { status: 0, html: '' };
        }
    }

    /**
     * Shows the report in a box with Download, Copy and Close.
     * @param {string} json - The report.
     * @param {string} file - Download file name.
     * @returns {HTMLTextAreaElement} The text area, updated while the run goes on.
     */
    function showBox(json, file) {
        let box = document.getElementById('saed-login-probe');
        if (box) box.remove();
        box = document.createElement('div');
        box.id = 'saed-login-probe';
        box.style.cssText = 'position:fixed;inset:5vh 5vw;z-index:2147483647;background:#fff;color:#000;border:2px solid #333;' +
            'padding:8px;display:flex;flex-direction:column;gap:6px;font:12px sans-serif';
        const bar = document.createElement('div');
        const ta = document.createElement('textarea');
        ta.style.cssText = 'flex:1;font:11px monospace;white-space:pre';
        ta.value = json;
        const btn = (label, fn) => {
            const b = document.createElement('button');
            b.textContent = label;
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
        note.textContent = 'Review before saving: nothing here should name you. Put the file into debug/.';
        bar.appendChild(note);
        box.append(bar, ta);
        document.body.appendChild(box);
        return ta;
    }

    /**
     * Runs the probe over the given paths of the current site.
     * @param {string[]} paths - Paths (with query) on this host.
     * @returns {Promise<void>}
     */
    async function run(paths) {
        const site = siteOf(location.hostname);
        if (!site) return;
        const typed = window.prompt('Terms to redact besides the user name the page shows (comma-separated, e.g. your user name and real name). They stay in this browser.', '') || '';
        const terms = typed.split(',').map(s => s.trim()).filter(Boolean);
        const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const file = `logged-in-diff-${site}-${day}.json`;
        const meta = { host: location.hostname, at: new Date().toString(), userAgent: navigator.userAgent };
        const ta = showBox('probing…', file);
        const results = [];
        const seen = new Set();
        for (const p of paths) {
            const url = new URL(p, location.origin).href;
            const pub = await get(url, 'omit');
            await new Promise(ok => setTimeout(ok, SPACING_MS));
            const mine = await get(url, 'include');
            await new Promise(ok => setTimeout(ok, SPACING_MS));
            results.push(compare(pub, mine, { url, site, terms, seen }));
            ta.value = `probing… ${results.length}/${paths.length}`;
        }
        ta.value = report(results, meta, [...terms, ...seen]);
        if (!terms.length && results.some(r => r.userNameDetected === false)) {
            window.alert('The probe could not find your user name on at least one page, and you typed no terms. ' +
                'Search the report for your name before saving it, or run it again and type the name.');
        }
    }

    if (typeof GM_registerMenuCommand === 'function') {
        const site = siteOf(location.hostname);
        if (site) {
            GM_registerMenuCommand('Probe: what logging in adds (all pages)', () => run(TARGETS[site]));
            GM_registerMenuCommand('Probe: what logging in adds (this page)', () => run([location.pathname + location.search]));
        }
    } else {
        globalThis.__saedLoggedInProbe = Core;
    }
})();
