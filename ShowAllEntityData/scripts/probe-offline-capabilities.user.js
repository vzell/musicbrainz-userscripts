// ==UserScript==
// @name         SAED probe: offline capabilities
// @namespace    https://github.com/vzell/mb-userscripts
// @version      1.0.0
// @description  org/offline.org, plan step "probe": reports what this browser offers for running ShowAllEntityData offline — whether Tampermonkey runs on file:// and localhost pages at all, browser storage quota and persistence, the File System Access and OPFS APIs, the size of the script's two IndexedDB databases here, and how navigator.onLine compares with what a real request finds. Run it from the Tampermonkey menu; nothing is fetched on page load. Throwaway, never published.
// @match        https://musicbrainz.org/*
// @match        https://*.musicbrainz.org/*
// @match        https://www.springsteenlyrics.com/*
// @match        https://springsteenlyrics.com/*
// @match        https://www.jungleland.it/*
// @match        https://www.brucespringsteen.it/*
// @match        https://brucebase.wikidot.com/*
// @include      /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/.*$/
// @include      /^file:\/\/\/.*\.html?(?:[?#].*)?$/
// @connect      coverartarchive.org
// @connect      musicbrainz.org
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM_info
// @noframes
// ==/UserScript==

/*
 * What it answers (org/offline.org, "Answer", items 3 and 5):
 *
 *  1. Does Tampermonkey run this userscript on a file:// page and on a
 *     localhost page in this browser? On those two kinds of page a small
 *     badge appears at load, so you can tell without the menu. Chrome needs
 *     "Allow access to file URLs" on Tampermonkey's extension page for
 *     file://; if the badge never shows on a local .html file, that switch
 *     is off or the browser does not allow it — which is itself the answer.
 *  2. Storage: navigator.storage.estimate() (usage and quota for THIS site),
 *     persisted(), and whether persist(), showDirectoryPicker() and OPFS
 *     (navigator.storage.getDirectory) exist here. persist() is only CALLED
 *     from its own menu entry, because a grant changes the browser's state.
 *  3. The script's own IndexedDB databases on this site
 *     (vz-mb-saed-art-cache, vz-saed-detail-pages): entries per store. A
 *     database is opened only when indexedDB.databases() lists it, so the
 *     probe never creates one.
 *  4. Network: navigator.onLine against two real requests — one to this
 *     site (fetch, same origin) and one to coverartarchive.org
 *     (GM_xmlhttpRequest). classifyNetwork() decides from the answers, not
 *     from navigator.onLine, which stays true on a network without internet.
 *     Run it once online and once with the network really off (unplug, or
 *     switch off Wi-Fi). DevTools → Network → Offline affects the page's
 *     own fetch; whether it also stops Tampermonkey's GM_xmlhttpRequest is
 *     not known — if it does not, the report shows a 'split'.
 *
 * Requests: two per run, each with an 8 s timeout. Nothing personal is read;
 * the report holds sizes, counts, API names and the browser's user agent.
 * Review it, then Download and put it into debug/.
 *
 * The pure functions (pageKind, classifyOutcome, classifyNetwork,
 * berlinStamp, probeFetch) are exported for
 * scripts/check-probe-offline-capabilities.js when the script runs without
 * Tampermonkey.
 */
/* global GM_registerMenuCommand, GM_xmlhttpRequest, GM_info */
(function () {
    'use strict';

    const TIMEOUT_MS = 8000;
    const SA_DBS = ['vz-mb-saed-art-cache', 'vz-saed-detail-pages'];

    /**
     * Names the kind of page the probe runs on.
     * @param {string} href - The page address.
     * @returns {string} 'mb' | 'sl' | 'jl' | 'bs' | 'bb' | 'localhost' | 'file' | 'other'.
     */
    function pageKind(href) {
        let u;
        try { u = new URL(href); } catch (e) { return 'other'; }
        if (u.protocol === 'file:') return 'file';
        const h = u.hostname.toLowerCase();
        if (h === '127.0.0.1' || h === 'localhost') return 'localhost';
        if (h === 'musicbrainz.org' || h.endsWith('.musicbrainz.org')) return 'mb';
        if (/(^|\.)springsteenlyrics\.com$/.test(h)) return 'sl';
        if (/(^|\.)jungleland\.it$/.test(h)) return 'jl';
        if (/(^|\.)brucespringsteen\.it$/.test(h)) return 'bs';
        if (h === 'brucebase.wikidot.com') return 'bb';
        return 'other';
    }

    /**
     * Classifies one request's outcome.
     * @param {{status?: number, error?: string, timedOut?: boolean}} r - What the request returned.
     * @returns {string} 'answered' (any HTTP status: a server replied),
     *     'timeout', or 'no-answer' (status 0 / thrown: offline, DNS, refused).
     */
    function classifyOutcome(r) {
        if (!r) return 'no-answer';
        if (r.timedOut) return 'timeout';
        if (typeof r.status === 'number' && r.status > 0) return 'answered';
        return 'no-answer';
    }

    /**
     * Decides the network state from real requests, using navigator.onLine
     * only when there is nothing else to go by.
     * @param {boolean} onLine - navigator.onLine at the time of the requests.
     * @param {Array<{target: string, outcome: string}>} checks - Classified requests.
     * @returns {{state: string, note: string}} state is 'online', 'offline',
     *     'split' (some targets answered, others not) or 'unknown'.
     */
    function classifyNetwork(onLine, checks) {
        const done = (checks || []).filter(c => c && c.outcome && c.outcome !== 'skipped');
        if (!done.length) {
            return onLine
                ? { state: 'unknown', note: 'no request could be made; navigator.onLine says online' }
                : { state: 'offline', note: 'no request could be made; navigator.onLine says offline' };
        }
        const answered = done.filter(c => c.outcome === 'answered');
        if (answered.length === done.length) {
            return { state: 'online', note: onLine ? '' : 'navigator.onLine was false although every request was answered' };
        }
        if (!answered.length) {
            return { state: 'offline', note: onLine ? 'navigator.onLine was true although no request was answered' : '' };
        }
        const missing = done.filter(c => c.outcome !== 'answered').map(c => c.target);
        return { state: 'split', note: `answered: ${answered.map(c => c.target).join(', ')}; not answered: ${missing.join(', ')}` };
    }

    /**
     * Formats a time as Berlin local time with its offset
     * (CLAUDE.md "Time zone: Europe/Berlin").
     * @param {Date} d - The time.
     * @returns {string} e.g. '2026-10-16T01:43:01+02:00'.
     */
    function berlinStamp(d) {
        const parts = {};
        new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
            timeZoneName: 'longOffset',
        }).formatToParts(d).forEach(p => { parts[p.type] = p.value; });
        const off = (parts.timeZoneName || 'GMT').replace('GMT', '') || '+00:00';
        return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${off}`;
    }

    /**
     * One same-origin request with a timeout, never throwing.
     * @param {string} url - Address to request.
     * @param {number} [timeoutMs] - Timeout.
     * @returns {Promise<{status: number, ms: number, error?: string, timedOut?: boolean}>}
     */
    async function probeFetch(url, timeoutMs) {
        const t0 = performance.now();
        const ctl = new AbortController();
        let timedOut = false;
        const timer = setTimeout(() => { timedOut = true; ctl.abort(); }, timeoutMs || TIMEOUT_MS);
        try {
            const res = await fetch(url, { method: 'HEAD', cache: 'no-store', credentials: 'omit', signal: ctl.signal });
            return { status: res.status, ms: Math.round(performance.now() - t0) };
        } catch (e) {
            return { status: 0, ms: Math.round(performance.now() - t0), error: String(e && e.name || e), timedOut };
        } finally {
            clearTimeout(timer);
        }
    }

    /**
     * One cross-origin request through Tampermonkey, never throwing.
     * @param {string} url - Address to request.
     * @returns {Promise<{status: number, ms: number, error?: string, timedOut?: boolean}>}
     */
    function probeGm(url) {
        const t0 = performance.now();
        const ms = () => Math.round(performance.now() - t0);
        return new Promise(resolve => {
            try {
                GM_xmlhttpRequest({
                    method: 'HEAD', url, timeout: TIMEOUT_MS, anonymous: true,
                    onload: r => resolve({ status: r.status, ms: ms() }),
                    onerror: r => resolve({ status: (r && r.status) || 0, ms: ms(), error: (r && r.error) || 'error' }),
                    ontimeout: () => resolve({ status: 0, ms: ms(), error: 'timeout', timedOut: true }),
                });
            } catch (e) {
                resolve({ status: 0, ms: ms(), error: String(e) });
            }
        });
    }

    /**
     * Storage quota, persistence and the file APIs on this page.
     * @returns {Promise<Object>}
     */
    async function storageInfo() {
        const s = navigator.storage;
        const out = {
            isSecureContext: !!window.isSecureContext,
            estimateApi: !!(s && s.estimate),
            persistApi: !!(s && s.persist),
            opfsApi: !!(s && s.getDirectory),
            showDirectoryPicker: typeof window.showDirectoryPicker === 'function',
            indexedDB: typeof indexedDB !== 'undefined',
            databasesApi: typeof indexedDB !== 'undefined' && typeof indexedDB.databases === 'function',
        };
        try {
            if (out.estimateApi) {
                const e = await s.estimate();
                out.usageBytes = e.usage;
                out.quotaBytes = e.quota;
                if (e.usageDetails) out.usageDetails = e.usageDetails;
            }
        } catch (e) { out.estimateError = String(e); }
        try { if (s && s.persisted) out.persisted = await s.persisted(); } catch (e) { out.persistedError = String(e); }
        if (out.opfsApi) {
            try { await s.getDirectory(); out.opfsUsable = true; } catch (e) { out.opfsUsable = false; out.opfsError = String(e); }
        }
        return out;
    }

    /**
     * Entry counts of the script's IndexedDB databases on this site. Opens a
     * database only when indexedDB.databases() lists it, so none is created.
     * @returns {Promise<Object>}
     */
    async function idbInfo() {
        if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') {
            return { skipped: 'indexedDB.databases() is not available here' };
        }
        let list;
        try { list = await indexedDB.databases(); } catch (e) { return { error: String(e) }; }
        const out = { all: list.map(d => `${d.name} v${d.version}`) };
        for (const name of SA_DBS) {
            if (!list.some(d => d.name === name)) { out[name] = 'absent'; continue; }
            out[name] = await new Promise(resolve => {
                const req = indexedDB.open(name);
                req.onerror = () => resolve({ error: String(req.error) });
                req.onsuccess = () => {
                    const db = req.result;
                    const stores = [...db.objectStoreNames];
                    const counts = {};
                    if (!stores.length) { db.close(); resolve({ stores: counts }); return; }
                    const tx = db.transaction(stores, 'readonly');
                    stores.forEach(st => {
                        const c = tx.objectStore(st).count();
                        c.onsuccess = () => { counts[st] = c.result; };
                    });
                    tx.oncomplete = () => { db.close(); resolve({ version: db.version, stores: counts }); };
                    tx.onerror = () => { db.close(); resolve({ error: String(tx.error), stores: counts }); };
                };
            });
        }
        return out;
    }

    /**
     * Shows the report in a box with Download, Copy and Close.
     * @param {string} json - Report text.
     * @param {string} file - Download file name.
     * @returns {HTMLTextAreaElement} The text area, for progress updates.
     */
    function showBox(json, file) {
        let box = document.getElementById('saed-offline-probe');
        if (box) box.remove();
        box = document.createElement('div');
        box.id = 'saed-offline-probe';
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
        btn('Copy', () => navigator.clipboard.writeText(ta.value).catch(() => ta.select()));
        btn('Close', () => box.remove());
        const note = document.createElement('span');
        note.textContent = 'Sizes, counts and API names only. Put the file into debug/.';
        bar.appendChild(note);
        box.append(bar, ta);
        document.body.appendChild(box);
        return ta;
    }

    /**
     * Runs every check and shows the report.
     * @param {Object} [extra] - Extra fields for the report (e.g. a persist() result).
     * @returns {Promise<void>}
     */
    async function run(extra) {
        const kind = pageKind(location.href);
        const now = new Date();
        const day = berlinStamp(now).slice(0, 10).replace(/-/g, '');
        const ta = showBox('probing…', `offline-capabilities-${kind}-${day}.json`);
        const onLine = navigator.onLine;
        const checks = [];
        if (kind === 'file') {
            checks.push({ target: 'same-origin', outcome: 'skipped', why: 'file:// has no server' });
        } else {
            const r = await probeFetch(new URL('/favicon.ico', location.href).href + '?saed-probe=' + now.getTime());
            checks.push({ target: 'same-origin', ...r, outcome: classifyOutcome(r) });
        }
        const g = await probeGm('https://coverartarchive.org/');
        checks.push({ target: 'coverartarchive.org (GM_xmlhttpRequest)', ...g, outcome: classifyOutcome(g) });
        const report = {
            probe: 'offline-capabilities',
            probeVersion: (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) || 'n/a',
            at: berlinStamp(now),
            page: { kind, protocol: location.protocol, origin: location.origin },
            ranHere: true,
            browser: {
                userAgent: navigator.userAgent,
                brands: navigator.userAgentData ? navigator.userAgentData.brands.map(b => `${b.brand} ${b.version}`) : undefined,
            },
            scriptHandler: typeof GM_info !== 'undefined' ? `${GM_info.scriptHandler || '?'} ${GM_info.version || '?'}` : 'none',
            network: {
                navigatorOnLine: onLine,
                effectiveType: navigator.connection ? navigator.connection.effectiveType : undefined,
                checks,
                verdict: classifyNetwork(onLine, checks),
            },
            storage: await storageInfo(),
            indexedDB: await idbInfo(),
            serviceWorkerApi: 'serviceWorker' in navigator,
            cacheStorageApi: typeof caches !== 'undefined',
            ...(extra || {}),
        };
        ta.value = JSON.stringify(report, null, 2);
    }

    /**
     * Asks the browser to keep this site's storage, then runs the report.
     * @returns {Promise<void>}
     */
    async function askPersist() {
        let result;
        try {
            result = navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : 'no persist() here';
        } catch (e) {
            result = 'error: ' + e;
        }
        await run({ persistRequest: { at: berlinStamp(new Date()), result } });
    }

    /**
     * Puts a small badge on file:// and localhost pages, so a run there is
     * visible without opening the menu.
     * @returns {void}
     */
    function badge() {
        const kind = pageKind(location.href);
        if (kind !== 'file' && kind !== 'localhost') return;
        const b = document.createElement('div');
        b.id = 'saed-offline-probe-badge';
        b.textContent = `SAED offline probe ran here (${kind}) — Tampermonkey menu → "Probe: offline capabilities"`;
        b.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:2147483647;background:#1f6a3e;color:#fff;' +
            'font:12px sans-serif;padding:5px 9px;border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,.3)';
        (document.body || document.documentElement).appendChild(b);
    }

    const Core = { pageKind, classifyOutcome, classifyNetwork, berlinStamp, probeFetch };

    if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('Probe: offline capabilities', () => run());
        GM_registerMenuCommand('Probe: ask the browser to keep this site\'s storage (persist)', () => askPersist());
        badge();
    } else {
        globalThis.__saedOfflineProbe = Core;
    }
})();
