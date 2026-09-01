/**
 * Simulated third-party userscript side effect — NOT a real third-party
 * script's source, just one specific DOM shape the "MB: Inline per-recording
 * streaming & download links" userscript can produce.
 *
 * ShowAllEntityData.user.js's own JSDoc for `_streamingDl` (near
 * `applyExtractTrackTitleData()`, "Not scoped to `:scope >` since its exact
 * nesting depth inside the Title cell isn't fixed by this script
 * (third-party-injected)") explicitly anticipates that this userscript's
 * `<dl class="ar">` (singular) container is not always a direct SIBLING of
 * MusicBrainz's own `<div class="ars">` block — every real capture under
 * `debug/` (`debug/streaming.html`, `debug/therising.html`,
 * `debug/double-ars.html`, `debug/tt2a.html`) happens to show the sibling
 * shape (`</dl></div><dl class="ar">`), but this fixture reproduces the
 * OTHER shape the code already defends against: `<dl class="ar">` nested
 * INSIDE `<div class="ars">`, as its last child.
 *
 * Real markup (`debug/streaming-downloads.html`) reproduced verbatim below,
 * just relocated.
 *
 * Config (optional, set `window.__thirdPartySim` before injecting this):
 *   { trackIndices?: number[] } — defaults to `{ trackIndices: [0] }`
 *   (native tracklist row indices, 0-based, matching the currently-loaded
 *   page's own `<table>` — NOT ShowAllEntityData's rendered table, since
 *   this simulator must run BEFORE "Show all Tracks for Release" is
 *   clicked, on the native page).
 */
(function () {
    var cfg = Object.assign({ trackIndices: [0] }, window.__thirdPartySim || {});

    var STREAMING_DL_HTML =
        '<dl class="ar"><dt><button class="recording-toggle" style="margin-right: 0.5em; border-width: medium; ' +
        'border-style: none; border-color: currentcolor; border-image: none; background: none; cursor: pointer; ' +
        'font-size: 0.9em;">▼</button>Streaming/Downloads:</dt><dd class="recording-url-links" ' +
        'style="display: block;"><strong>🟢 open.spotify.com: </strong>' +
        '<a href="https://open.spotify.com/track/0R9q3imnid244T1ty47MGs" target="_blank" rel="noopener" ' +
        'style="margin-right: 0.5em;">[free streaming]</a><br></dd></dl>';

    var arsDivs = Array.prototype.slice.call(document.querySelectorAll('div.ars'));
    cfg.trackIndices.forEach(function (i) {
        var div = arsDivs[i];
        if (!div) return;
        var wrapper = document.createElement('div');
        wrapper.innerHTML = STREAMING_DL_HTML;
        div.appendChild(wrapper.firstElementChild);
    });
})();
