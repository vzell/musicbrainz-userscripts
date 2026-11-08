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
 * body object, as Event Horizon does (it keeps `ehBody` by reference).
 */
(function () {
    'use strict';

    const sim = {
        ehBody: null,
        mbBody: null,
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
        },
        /** EH off: its body removed, MusicBrainz's shown again (setOn(false)). */
        off() {
            if (!sim.isOn()) return;
            sim.ehBody.remove();
            sim.mbBody.hidden = false;
        },
    };
    window.__ehSim = sim;

    document.addEventListener('DOMContentLoaded', () => {
        sim.mbBody = document.body;
        if (window.__EH_SIM_START_ON__ !== false) sim.on();
    });
})();
