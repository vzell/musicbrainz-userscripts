/**
 * Simulated third-party userscript side effect: "mb. INLINE STUFF"
 * (jesus2099, id 81127) rewriting a release tracklist's track link when the
 * track name differs from its recording's name.
 *
 * Reproduces tests/fixtures/live-userscripts/mb_INLINE-STUFF.user.js lines
 * 176-201 with its default `markTrackRecNameDiff =
 * "%track-name%%br%%recording-name%"`, per track:
 *
 *   - `title` becomes "track name: <track>\n≠rec. name: <recording>";
 *   - `jesus2099userjs81127recname="<track>"` is set;
 *   - the link's FIRST CHILD — MusicBrainz's `<bdi>` — is replaced by
 *     "<track>" <br> "<recording>" (so the link has no `<bdi>` any more);
 *   - the class `jesus2099userjs81127recording` is added.
 *
 * INLINE STUFF fetches the recording names from WS/2; this snippet takes
 * them from config instead. It runs against the page as it stands, so call
 * it AFTER load: MusicBrainz's own release bundle re-renders the tracklist
 * from its JSON payload on hydration, which would undo a rewrite baked into
 * the fixture HTML (it did — DEBUG-NOTES.md, 2026-10-03).
 *
 * Config (`window.__thirdPartySim`, optional):
 *   { tracks?: Array<{ mbid: string, recName: string }> } — defaults to the
 *   two tracks of debug/release-tracks-DVD-ETI-bug.html.
 *
 * Provenance: transcribed from the INLINE STUFF source named above, checked
 * 2026-10-03.
 */
(function () {
    const cfg = window.__thirdPartySim || {};
    const tracks = cfg.tracks || [
        { mbid: '273164fe-13ea-4239-b3e6-8d86a5ff2eeb', recName: 'The Rising' },
        { mbid: '7bdb11d8-4ef9-4476-abc0-141fe07d8d00', recName: 'Lonesome Day (video)' },
    ];
    const template = '%track-name%%br%%recording-name%';
    tracks.forEach(({ mbid, recName }) => {
        document.querySelectorAll(`a[href="/recording/${mbid}"]`).forEach((aRec) => {
            const track = aRec.textContent;
            if (track === recName) return;
            aRec.setAttribute('title', 'track name: ' + track + '\n≠rec. name: ' + recName);
            const frag = document.createDocumentFragment();
            const rows = template.replace(/%track-name%/ig, track).replace(/%recording-name%/ig, recName).split('%br%');
            rows.forEach((text, i) => {
                if (i > 0) frag.appendChild(document.createElement('br'));
                frag.appendChild(document.createTextNode(text));
            });
            aRec.setAttribute('jesus2099userjs81127recname', track);
            aRec.replaceChild(frag, aRec.firstChild);
            aRec.classList.add('jesus2099userjs81127recording');
        });
    });
})();
