/**
 * Simulated third-party userscript side effect — NOT the real script's
 * source: the big-picture strip of jesus2099's "mb. FUNKEY ILLUSTRATED
 * RECORDS" (tests/fixtures/live-userscripts/mb_FUNKEY-ILLUSTRATED-RECORDS.user.js,
 * 2026.6.5; gitignored), reproduced in the shape that script leaves in the
 * DOM (debug/mb-rg-funky-initial.html, debug/mb-rg-funky-final.html):
 *
 *   <div class="jesus2099userjs154481bigbox">
 *     <a href="/release/<mbid>" title="<link text>" style="display:inline-block; …">
 *       <img src="//coverartarchive.org/release/<mbid>/front-250" alt="<link text>"
 *            style="vertical-align:middle; display:inline; max-height:125px; …">
 *     </a>…
 *   </div>
 *
 * inserted right BEFORE the closest table (or list) of each release /
 * release group link, one strip per host, in ONE synchronous pass — the real
 * script runs that pass once, 600 ms after document-idle, so whatever DOM is
 * there at that moment is what it decorates (our own rendered tables when a
 * render came first).
 *
 * Selection, like the real script: `tr > td a[href^="/<type>/"]` and
 * `div#page.fullwidth ul:not(.tabs) > li a[href^="/<type>/"]`, the href
 * exactly `/<type>/<mbid>`, links inside `td.relationships` skipped. The
 * images get their final (loaded) style at once: the real script shows a
 * "⌛" until the image loads, which a spec has no use for.
 *
 * Config (optional, `window.__funkeySim` before injecting):
 *   { root?: string } — a CSS selector limiting the pass to one subtree
 *   (default: the whole document).
 *
 * Returns nothing; sets `window.__funkeySimCount` to the number of strips
 * inserted.
 *
 * Provenance: hand-built from the real script's big-pics loop, last checked
 * against 2026.6.5 on 2026-10-28.
 */
(function () {
    var CLS = 'jesus2099userjs154481bigbox';
    var GUID = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
    var cfg = Object.assign({ root: null }, window.__funkeySim || {});
    var root = cfg.root ? document.querySelector(cfg.root) : document;
    var types = ['release-group', 'release'];
    var made = 0;
    if (!root) {
        window.__funkeySimCount = 0;
        return;
    }
    types.forEach(function (type) {
        var sel = 'tr > td a[href^="/' + type + '/"]:not([href$="/cover-art"]), ' +
                  'div#page.fullwidth ul:not(.tabs) > li a[href^="/' + type + '/"]:not([href$="/cover-art"])';
        var as = root.querySelectorAll(sel);
        for (var i = 0; i < as.length; i++) {
            var a = as[i];
            var m = (a.getAttribute('href') || '').match(new RegExp('^/' + type + '/(' + GUID + ')$'));
            if (!m || a.closest('td.relationships')) continue;
            var host = a.closest('table') || a.closest('ul');
            if (!host || !host.parentNode) continue;
            var box = host.previousElementSibling;
            if (!box || box.tagName !== 'DIV' || !box.classList.contains(CLS)) {
                box = document.createElement('div');
                box.className = CLS;
                host.parentNode.insertBefore(box, host);
                made++;
            }
            var link = document.createElement('a');
            link.setAttribute('href', a.getAttribute('href'));
            link.setAttribute('title', a.textContent);
            link.style.cssText = 'display: inline-block; height: 100%; margin: 8px 8px 4px 4px;';
            var img = document.createElement('img');
            img.setAttribute('src', '//coverartarchive.org/' + type + '/' + m[1] + '/front-250');
            img.setAttribute('alt', a.textContent);
            img.style.cssText = 'vertical-align: middle; display: inline; max-height: 125px; box-shadow: black 1px 1px 4px;';
            link.appendChild(img);
            box.appendChild(link);
        }
    });
    window.__funkeySimCount = made;
})();
