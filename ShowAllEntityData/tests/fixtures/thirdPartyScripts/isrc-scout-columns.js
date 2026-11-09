/*
 * Simulated third-party userscript: the tracklist columns of "ISRC Scout"
 * (@majkinetor), as of 2026.10.16.181657 (#749). NOT the real script's source
 * (tests/fixtures/live-userscripts/ISRC-scout.user.js, gitignored). It
 * reproduces only its markup and the one behaviour that matters here:
 *
 *   - trackDataCells()/addCols(): an "ISRC" and a "Links" column
 *     (th/td.ii-col.ii-col-isrc, .ii-col.ii-col-links) inserted before the
 *     cell with class 'rating' (else 'treleases', else appended), in every
 *     table holding a row whose id is one of the configured track MBIDs; each
 *     'thead th[colspan]' gets colSpan + 2, the original in data-ii-colspan.
 *   - The ISRC cell: one <a class="ii-trk-isrc" href="/isrc/CODE"> per ISRC,
 *     holding isrcHtml(): <span class="ii-isrcf"> with four <span>s for a
 *     valid code, the plain code otherwise.
 *   - The Links cell: <div class="ii-trk-lns"> of
 *     <a class="ii-trk-ln[ ended]"> with an inline <svg>, and
 *     <sup class="ii-trk-n">N</sup> for a platform with N > 1 links. Its
 *     hover text in one of three generations (config `markup`):
 *       'title'    (2026.10.16, default): title="<Platform>[ (ended)] · <url>",
 *                  "<Platform> · N links\n<url>…";
 *       'data-tip' (2026.11.06): data-tip="<Platform>[ (ended)]\n<url>",
 *                  "<Platform> — N links\n- <url>…", no title;
 *       'meta'     (9e4cdd59, #938): 'data-tip' plus data-ii-platform and
 *                  data-ii-ended="true|false".
 *   - fillTrackData()'s MutationObserver (documentElement, subtree, one rAF
 *     per burst): any such table's 'tr.subh' or 'tbody > tr:not(.subh)'
 *     WITHOUT a ':scope > .ii-col' child gets fresh cells. This is why
 *     ShowAllEntityData keeps the 'ii-col' classes on the cells it rebuilds.
 *
 *   - showTrackData()'s wipe-and-re-add (the race documented in
 *     docs/claude/release-tracks-and-length.md): window.__isrcScoutShowTrackData()
 *     removes every .ii-col, restores every th[data-ii-colspan], then fills.
 *   - With `honoursForeign` (9e4cdd59, #938): fillTrackData() skips a table
 *     inside [data-mbu-foreign], and the wipe leaves .ii-col cells and
 *     colspans there alone.
 *   - With `late`: nothing is filled and no observer runs until the test
 *     calls window.__isrcScoutStart(), as the real script waits for its
 *     release load (fetchRelease()). That is the "Tracks pressed too early"
 *     case: the render comes first, the columns after it.
 *
 * Not simulated: the h1 button, the modal, the #mbu-tip hover and every
 * network call.
 *
 * Config (window.__thirdPartySim):
 *   { tracks: { <trackMbid>: { isrcs: ['USSM10501304', …],
 *                              links: [{ name, url, n?, ended? }, …] } },
 *     markup?: 'title' | 'data-tip' | 'meta', honoursForeign?: boolean,
 *     late?: boolean }
 */
(function () {
    'use strict';
    const cfg = window.__thirdPartySim || {};
    const tracks = cfg.tracks || {};
    const markup = cfg.markup || 'title';
    const foreign = (el) => !!(cfg.honoursForeign && el.closest('[data-mbu-foreign]'));
    const ISRC_RE = /^[A-Z]{2}[A-Z0-9]{3}\d{2}\d{5}$/;

    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

    function isrcHtml(code) {
        const c = String(code).toUpperCase().replace(/[\s-]/g, '');
        if (!ISRC_RE.test(c)) return esc(code);
        return '<span class="ii-isrcf"><span>' + c.slice(0, 2) + '</span><span>' + c.slice(2, 5) +
            '</span><span>' + c.slice(5, 7) + '</span><span>' + c.slice(7) + '</span></span>';
    }

    function trackDataCells(t) {
        const isrcs = t ? (t.isrcs || []).map((c) =>
            '<a class="ii-trk-isrc" href="/isrc/' + esc(c) + '">' + isrcHtml(c) + '</a>').join('') : '';
        const links = t ? (t.links || []).map((l) => {
            const n = l.n || 1;
            const urls = Array.from({ length: n }, (_, i) => l.url + '#' + i);
            let attrs;
            if (markup === 'title') {
                const tip = n === 1
                    ? l.name + (l.ended ? ' (ended)' : '') + ' · ' + l.url
                    : l.name + ' · ' + n + ' links\n' + urls.join('\n');
                attrs = ' title="' + esc(tip) + '"';
            } else {
                const tip = n === 1
                    ? l.name + (l.ended ? ' (ended)' : '') + '\n' + l.url
                    : l.name + ' — ' + n + ' links\n' + urls.map((u) => '- ' + u + (l.ended ? ' (ended)' : '')).join('\n');
                attrs = ' data-tip="' + esc(tip) + '"';
                if (markup === 'meta') attrs += ' data-ii-platform="' + esc(l.name) + '" data-ii-ended="' + !!l.ended + '"';
            }
            return '<a class="ii-trk-ln' + (l.ended ? ' ended' : '') + '" href="' + esc(l.url) +
                '" target="_blank" rel="noopener" style="color:#1DB954"' + attrs + '>' +
                '<svg viewBox="0 0 24 24" fill="#1DB954" xmlns="http://www.w3.org/2000/svg" width="16" height="16">' +
                '<circle cx="12" cy="12" r="10"></circle></svg>' +
                (n > 1 ? '<sup class="ii-trk-n">' + n + '</sup>' : '') + '</a>';
        }).join('') : '';
        return [isrcs, links && '<div class="ii-trk-lns">' + links + '</div>'];
    }

    function trackDataAt(cells) {
        let i = cells.findIndex((c) => c.classList.contains('rating'));
        if (i < 0) i = cells.findIndex((c) => c.classList.contains('treleases'));
        return i;
    }

    function addCols(tr, tag, html, cls) {
        const own = [...tr.children].filter((c) => !c.classList.contains('ii-col'));
        const at = trackDataAt(own);
        const ref = at >= 0 ? own[at] : null;
        html.forEach((h, i) => {
            const c = document.createElement(tag);
            c.className = 'ii-col ' + cls[i];
            c.innerHTML = h;
            tr.insertBefore(c, ref);
        });
    }

    let queued = false;
    function fillTrackData() {
        queued = false;
        const tables = new Set();
        Object.keys(tracks).forEach((id) => {
            const tr = document.getElementById(id);
            const tb = tr && tr.closest('table');
            if (tb) tables.add(tb);
        });
        tables.forEach((tb) => {
            if (foreign(tb)) return;
            tb.querySelectorAll('tr.subh').forEach((tr) => {
                if (!tr.querySelector(':scope > .ii-col')) addCols(tr, 'th', ['ISRC', 'Links'], ['ii-col-isrc', 'ii-col-links']);
            });
            tb.querySelectorAll('thead th[colspan]').forEach((th) => {
                if (!th.dataset.iiColspan) { th.dataset.iiColspan = th.colSpan; th.colSpan = th.colSpan + 2; }
            });
            tb.querySelectorAll('tbody > tr:not(.subh)').forEach((tr) => {
                if (tr.querySelector(':scope > .ii-col')) return;
                addCols(tr, 'td', trackDataCells(tracks[tr.id]), ['ii-col-isrc', 'ii-col-links']);
            });
        });
    }

    function showTrackData() {
        document.querySelectorAll('.ii-col').forEach((el) => { if (!foreign(el)) el.remove(); });
        document.querySelectorAll('th[data-ii-colspan]').forEach((th) => {
            if (foreign(th)) return;
            th.colSpan = +th.dataset.iiColspan;
            delete th.dataset.iiColspan;
        });
        fillTrackData();
    }
    window.__isrcScoutShowTrackData = showTrackData;

    function start() {
        fillTrackData();
        new MutationObserver(() => {
            if (!queued) { queued = true; requestAnimationFrame(fillTrackData); }
        }).observe(document.documentElement, { childList: true, subtree: true });
        document.documentElement.dataset.isrcScoutSim = 'ready';
    }

    if (cfg.late) {
        window.__isrcScoutStart = start;
    } else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
