/**
 * Simulates Event Horizon's body swap (majkinetor's String Theory member;
 * org/majkinetor.org, "SAED's floating elements survive Event Horizon's body
 * swap"). Event Horizon's `setOn(on)` (event_horizon.user.js EH:11507-11508,
 * 2026.11.08.131500) does, verbatim:
 *
 *     if (on) { document.documentElement.insertBefore(ehBody, mbBody); mbBody.hidden = true; }
 *     else { ehBody.remove(); mbBody.hidden = false; }
 *
 * so while it shows, `document.body` is ITS body (the first <body> child of
 * <html>) and MusicBrainz's body stays in the document, hidden. Its body
 * holds `main#app` and `#toast` only (EH `build()`), never `#page`.
 *
 * Register as a CONTEXT init script before `loadUserscriptPage()`: it swaps
 * on DOMContentLoaded, which comes before the harness adds the userscript
 * with `addScriptTag()`, so the script starts with EH's body as
 * `document.body`, as it does in a browser where Event Horizon is on (its
 * default). `window.__EH_SIM_START_ON__ = false` (set in an earlier init
 * script) starts with EH off instead.
 *
 * `window.__ehSim.off()` / `.on()` are V: they remove or re-insert the same
 * body object, as Event Horizon does (it keeps `ehBody` by reference). Like
 * Event Horizon they set `<html data-mbu-dock>` while it shows (its mark),
 * and keep its launcher `button#eh-launch` (`data-mb-corner`) in whichever
 * body shows (setOn() moves `:scope > [data-mb-corner]` children across).
 *
 * Keys: a `document` keydown listener in the BUBBLE phase, installed whether
 * EH shows or not, as Event Horizon's own (EH:12495): it skips an event whose
 * `defaultPrevented` is set, a repeat, and a key typed into a field, reads the
 * key with EH's `keyCombo()` (one character lowercased, Shift ignored) and
 * matches EH's default `KEY_CMDS` (EH:12419). Instead of navigating it
 * records the command in `window.__ehSim.fired`; `v` toggles on/off as EH's
 * does. While its view shows, h/e/r/o/t/d/a click its own `#app` link to the
 * entity's subpage, as EH's `keyGo()` does. The view links two subpages, the
 * two ways the real EH follows a link (probe, 2026-11-08): the editing
 * history (`#eh-sim-edits`) LOADS a new page — the real H does when EH's
 * view has not drawn that link yet (keyGo()'s location.assign() fallback;
 * case E, one run of two) — and the aliases (`#eh-sim-inplace`) open IN
 * PLACE (pushState, recorded in `window.__ehSim.navs`), as a release-group
 * link did in case C and the real H did in the other run. V while the
 * address is no longer the loaded page's reloads, as EH:11490 does.
 * `window.__EH_SIM_NO_LAUNCHER__ = true` leaves the launcher out (a page
 * where Event Horizon is not installed, for the "touches nothing" checks).
 *
 * #938 (upstream 9e4cdd59): while its view shows, `<html data-mbu-page>`
 * holds the path and query it shows (EH `ehPageMark()`), also after an
 * in-place move. The launcher's click is EH's `switchOn(!ehOn)`, the same as
 * V (a reload after an in-place move). `sim.menuItems()` is what EH's
 * `foreignMenuSync()` would project into its More (⋯) menu — every
 * `button[data-mbu-menu-item]` with a title, not disabled, first of an id in
 * document order — and `sim.select(id)` is choosing one (EH clicks the
 * source button). `sim.navigate(path)` is an in-place move (pushState).
 */
(function () {
    'use strict';

    /** Event Horizon's default KEY_CMDS keys (EH:12419-12436). */
    const KEYS = ['o', 'e', 'r', 'c', 'h', 't', 'd', 'a', 'v', 's', 'p', '.', ',', 'ctrl+h', 'ctrl+l', 'ctrl+/'];

    /**
     * Event Horizon's keyCombo() (EH 2026.11.08.131500), verbatim in effect.
     *
     * @param {KeyboardEvent} ev
     * @returns {string}
     */
    const keyCombo = (ev) => {
        if (['Control', 'Alt', 'Shift', 'Meta'].includes(ev.key)) return '';
        const k = ev.key === ' ' ? 'space' : ev.key.toLowerCase();
        return (ev.ctrlKey || ev.metaKey ? 'ctrl+' : '') + (ev.altKey ? 'alt+' : '') + (ev.shiftKey && ev.key.length > 1 ? 'shift+' : '') + (k === '?' && (ev.ctrlKey || ev.metaKey) ? '/' : k);
    };

    const sim = {
        ehBody: null,
        mbBody: null,
        launcher: null,
        fired: [],
        navs: [],
        loads: [],
        assigned: [],
        loadPath: location.pathname,
        loadSearch: location.search,
        /** @returns {boolean} whether EH's body is in the document */
        isOn() { return !!(sim.ehBody && sim.ehBody.isConnected); },
        /** EH on: its body before MusicBrainz's, MusicBrainz's hidden (setOn(true)). */
        on() {
            if (!sim.mbBody) sim.mbBody = document.body;
            if (!sim.ehBody) {
                sim.ehBody = document.createElement('body');
                sim.ehBody.id = 'eh-sim-body';
                sim.ehBody.innerHTML = '<main class="wrap" id="app"><h1>Event Horizon (simulated)</h1></main><div class="toast" id="toast" hidden role="status"></div>';
            }
            if (sim.isOn()) return;
            // EH's view of an entity links its subpages: here the editing history
            const m = location.pathname.match(/^\/([a-z-]+)\/([0-9a-f-]{36})/i);
            const app = sim.ehBody.querySelector('#app');
            if (m && !app.querySelector('#eh-sim-edits')) {
                app.insertAdjacentHTML('beforeend', `<p><a id="eh-sim-edits" href="${location.origin}/${m[1]}/${m[2]}/edits">Editing history</a></p>`
                    + `<p><a id="eh-sim-inplace" href="${location.origin}/${m[1]}/${m[2]}/aliases">Aliases</a></p>`);
            }
            document.documentElement.insertBefore(sim.ehBody, sim.mbBody);
            sim.mbBody.hidden = true;
            document.documentElement.setAttribute('data-mbu-dock', '');
            document.documentElement.setAttribute('data-mbu-page', location.pathname + location.search);
            if (sim.launcher) sim.ehBody.appendChild(sim.launcher);
        },
        /** EH off: its body removed, MusicBrainz's shown again (setOn(false)). */
        off() {
            if (!sim.isOn()) return;
            sim.ehBody.remove();
            sim.mbBody.hidden = false;
            document.documentElement.removeAttribute('data-mbu-dock');
            document.documentElement.removeAttribute('data-mbu-page');
            if (sim.launcher) sim.mbBody.appendChild(sim.launcher);
        },
        /** EH's switchOn(!ehOn): V and the launcher's click. After an in-place move, a reload (EH:11490). */
        toggle() {
            if (sim.isOn() && location.pathname + location.search !== sim.loadPath + sim.loadSearch) { location.reload(); return; }
            if (sim.isOn()) sim.off(); else sim.on();
        },
        /** An in-place move inside EH's view (pushState), with its page mark. */
        navigate(pathAndQuery) {
            history.pushState(null, '', pathAndQuery);
            sim.navs.push(location.href);
            if (sim.isOn()) document.documentElement.setAttribute('data-mbu-page', location.pathname + location.search);
        },
        /** @returns {{id: string, title: string}[]} EH's foreignMenuSync() projection. */
        menuItems() {
            const seen = new Set();
            return [...document.querySelectorAll('button[data-mbu-menu-item]')].filter((b) => {
                const id = b.getAttribute('data-mbu-menu-item');
                if (!id || seen.has(id) || !(b.getAttribute('data-mbu-menu-title') || '').trim() || b.disabled) return false;
                seen.add(id);
                return true;
            }).map((b) => ({ id: b.getAttribute('data-mbu-menu-item'), title: b.getAttribute('data-mbu-menu-title') }));
        },
        /** Choosing a projected item: EH clicks the source button (when connected and enabled). */
        select(id) {
            const b = [...document.querySelectorAll('button[data-mbu-menu-item]')].find((x) => x.getAttribute('data-mbu-menu-item') === id);
            if (b && b.isConnected && !b.disabled) b.click();
            return !!b;
        },
    };
    window.__ehSim = sim;

    /**
     * Event Horizon's keyGo(sub) (EH:12403): while its view shows, it clicks
     * its own `#app` link to the entity's subpage ("the viewer's own button
     * takes it, so it opens where the viewer would"); otherwise it would
     * location.assign() (here only recorded, never done).
     *
     * @param {string} sub - '' for the overview, 'edits', …
     * @returns {void}
     */
    const keyGo = (sub) => {
        const m = location.pathname.match(/^\/([a-z-]+)\/([0-9a-f-]{36})/i);
        if (!m) return;
        const url = `${location.origin}/${m[1]}/${m[2]}${sub ? '/' + sub : ''}`;
        const a = sim.isOn() && [...document.querySelectorAll('#app a[href]')].find((x) => x.href === url);
        if (a) a.click(); else sim.assigned.push(url);
    };
    const KEY_SUB = { o: '', e: 'edit', r: 'edit-relationships', h: 'edits', t: 'tags', d: 'details', a: 'aliases' };

    // Not installed at all when the page is meant to have no Event Horizon.
    if (window.__EH_SIM_NO_LAUNCHER__ !== true) document.addEventListener('keydown', (ev) => {
        if (ev.defaultPrevented || ev.repeat) return;
        const t = ev.target;
        if (t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName))) return;
        const k = keyCombo(ev);
        if (!k || !KEYS.includes(k)) return;
        sim.fired.push(k);
        if (k === 'v') {
            // navigated inside EH: reload for MusicBrainz's page of this one (EH:11490)
            sim.toggle();
            if (!sim.isOn() || location.pathname + location.search === sim.loadPath + sim.loadSearch) ev.preventDefault();
            return;
        }
        else if (k in KEY_SUB) keyGo(KEY_SUB[k]);
        ev.preventDefault();
    });

    // Event Horizon's own link handling in its view (its document 'click'
    // listener, onClick): a link it can show opens in place, pushState, no
    // page load. Recorded in `window.__ehSim.navs`.
    if (window.__EH_SIM_NO_LAUNCHER__ !== true) document.addEventListener('click', (ev) => {
        if (!sim.isOn() || ev.defaultPrevented || !sim.ehBody.contains(ev.target)) return;
        const a = ev.target.closest('a[href]');
        if (!a) return;
        if (/\/edits$/.test(a.href)) { sim.loads.push(a.href); return; }   // EH loads this page: no preventDefault
        ev.preventDefault();
        sim.navigate(a.href);
    });

    document.addEventListener('DOMContentLoaded', () => {
        sim.mbBody = document.body;
        if (window.__EH_SIM_NO_LAUNCHER__ !== true) {
            sim.launcher = document.createElement('button');
            sim.launcher.id = 'eh-launch';
            sim.launcher.type = 'button';
            sim.launcher.setAttribute('data-mb-corner', 'br');
            sim.launcher.textContent = 'EH';
            sim.launcher.onclick = () => sim.toggle();
            sim.mbBody.appendChild(sim.launcher);
        }
        if (window.__EH_SIM_START_ON__ !== false) sim.on();
    });
})();
