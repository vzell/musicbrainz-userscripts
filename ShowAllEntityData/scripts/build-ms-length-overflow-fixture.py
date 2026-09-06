"""Build tests/fixtures/release-tracks-ms-length-overflow.html.

Same real "Born to Run" DOM/payload as scripts/build-ms-length-fixture.py's
own release-tracks-ms-length.html, but with the embedded payload's
mediums[0].tracks TRUNCATED to the first 4 of 8 — simulating MusicBrainz's
own real behaviour on a very large tracklist: an overflowing medium's
"Load all tracks..." AJAX call fills the live DOM with every row, but the
page's SERVER-RENDERED <script type="application/json"> hydration payload is
a snapshot of the page as it looked BEFORE that AJAX call ever ran, and is
never updated afterward (confirmed live on a 1209-track release — see
_msFetchFullReleaseTrackLengths()'s JSDoc in ShowAllEntityData.user.js).

Tracks 5-8's native <td class="treleases"> cells already show MusicBrainz's
real rendered text (the DOM itself is untouched, exactly like the real
overflow case) — only the JSON payload loses them, which is what makes this
fixture exercise the WS2 backfill path (tests/fixtures/
release-tracks-ms-length-overflow.spec.js) rather than the plain embedded one.
"""
import io
import json
import re

RAW = 'tests/snapshots/release-tracks/raw.html'
SRC = 'debug/btr-bug.html'
OUT = 'tests/fixtures/release-tracks-ms-length-overflow.html'

src_html = io.open(SRC, encoding='utf-8', errors='replace').read()
payload = None
for blob in re.findall(r'<script[^>]*type="application/json"[^>]*>(.*?)</script>', src_html, re.S):
    if '"mediums"' not in blob:
        continue
    data = json.loads(blob)
    if data.get('release', {}).get('mediums'):
        payload = data
        break
assert payload, 'no release payload found in ' + SRC

rel = payload['release']
minimal = {'release': {'gid': rel.get('gid'), 'name': rel.get('name'), 'mediums': []}}
for med in rel['mediums']:
    tracks = []
    for t in (med.get('tracks') or [])[:4]:   # <-- the truncation
        rec = t.get('recording') or {}
        tracks.append({
            'number': t.get('number'),
            'position': t.get('position'),
            'length': t.get('length'),
            'recording': {'gid': rec.get('gid'), 'length': rec.get('length')},
        })
    minimal['release']['mediums'].append({'position': med.get('position'), 'tracks': tracks})

raw = io.open(RAW, encoding='utf-8', errors='replace').read()
assert '<script' not in raw, 'raw.html unexpectedly contains a <script> tag'

banner = (
    '\n<!--\n'
    '    Injected by scripts/build-ms-length-overflow-fixture.py.\n'
    '\n'
    '    Same real "Born to Run" data as release-tracks-ms-length.html, but the\n'
    '    embedded payload below is deliberately TRUNCATED to the first 4 of 8\n'
    '    tracks, simulating MusicBrainz\'s own real truncated-hydration-payload\n'
    '    behaviour on a very large tracklist (see\n'
    '    _msFetchFullReleaseTrackLengths()\'s JSDoc). Tracks 5-8\'s native\n'
    '    <td class="treleases"> cells still show real rendered text — only the\n'
    '    JSON loses them — so pressing the toggle must fall back to one\n'
    '    /ws/2/release/<gid>?inc=recordings request to backfill them.\n'
    '-->\n'
)

tag = '<script type="application/json">' + json.dumps(minimal, separators=(',', ':')) + '</script>\n'
body = banner + tag
text = raw.replace('</body>', body + '</body>', 1) if '</body>' in raw else raw + body
io.open(OUT, 'w', encoding='utf-8', newline='\n').write(text)

lens = [(t['number'], t['length'], t['recording']['length'])
        for m in minimal['release']['mediums'] for t in m['tracks']]
print(f'wrote {OUT} ({len(text)} bytes)')
print(f'embedded payload covers {len(lens)} of 8 tracks:', lens)
