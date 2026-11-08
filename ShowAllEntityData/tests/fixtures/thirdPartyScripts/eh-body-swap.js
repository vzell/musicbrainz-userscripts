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
 * does. `window.__EH_SIM_NO_LAUNCHER__ = true` leaves the launcher out (a page
 * where Event Horizon is not installed, for the "touches nothing" checks).
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
            document.documentElement.insertBefore(sim.ehBody, sim.mbBody);
            sim.mbBody.hidden = true;
            document.documentElement.setAttribute('data-mbu-dock', '');
            if (sim.launcher) sim.ehBody.appendChild(sim.launcher);
        },
        /** EH off: its body removed, MusicBrainz's shown again (setOn(false)). */
        off() {
            if (!sim.isOn()) return;
            sim.ehBody.remove();
            sim.mbBody.hidden = false;
            document.documentElement.removeAttribute('data-mbu-dock');
            if (sim.launcher) sim.mbBody.appendChild(sim.launcher);
        },
    };
    window.__ehSim = sim;

    // Not installed at all when the page is meant to have no Event Horizon.
    if (window.__EH_SIM_NO_LAUNCHER__ !== true) document.addEventListener('keydown', (ev) => {
        if (ev.defaultPrevented || ev.repeat) return;
        const t = ev.target;
        if (t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName))) return;
        const k = keyCombo(ev);
        if (!k || !KEYS.includes(k)) return;
        sim.fired.push(k);
        if (k === 'v') { if (sim.isOn()) sim.off(); else sim.on(); }
        ev.preventDefault();
    });

    document.addEventListener('DOMContentLoaded', () => {
        sim.mbBody = document.body;
        if (window.__EH_SIM_NO_LAUNCHER__ !== true) {
            sim.launcher = document.createElement('button');
            sim.launcher.id = 'eh-launch';
            sim.launcher.type = 'button';
            sim.launcher.setAttribute('data-mb-corner', 'br');
            sim.launcher.textContent = 'EH';
            sim.mbBody.appendChild(sim.launcher);
        }
        if (window.__EH_SIM_START_ON__ !== false) sim.on();
    });
})();
